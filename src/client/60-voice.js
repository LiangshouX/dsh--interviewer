    // ── voice ─────────────────────────────────────────────────────────────

    /** 把 base64 音频变成可播放的 Blob。 */
    function base64ToBlob(base64, mimeType) {
      const binary = atob(String(base64))
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      return new Blob([bytes], { type: mimeType || 'audio/mpeg' })
    }

    /** 按句切分，浏览器音色逐句播报会更自然。 */
    function splitSentences(text) {
      return String(text)
        .replace(/\s+/g, ' ')
        .split(/(?<=[。！？!?；;…\n])/)
        .map(item => item.trim())
        .filter(item => item !== '')
    }

    /** 按名称挑一个尽量不"机器"的中文音色。 */
    function pickBrowserVoice(voices) {
      const list = Array.isArray(voices) ? voices : []
      const chinese = list.filter(voice => /zh|cmn|Chinese|普通话/i.test(`${voice.lang} ${voice.name}`))
      const scored = (chinese.length > 0 ? chinese : list).map(voice => {
        const name = `${voice.name} ${voice.lang}`
        let score = 0
        if (/Natural/i.test(name)) score += 6
        if (/Online|Neural/i.test(name)) score += 4
        if (/Xiaoxiao|Xiaoyi|Yunxi|Yunyang|Yunxia|Tingting/i.test(name)) score += 3
        if (/Google/i.test(name)) score += 2
        if (/Huihui|Kangkang/i.test(name)) score += 1
        if (voice.localService === false) score += 1
        return { voice, score }
      })
      scored.sort((left, right) => right.score - left.score)
      return scored.length === 0 ? undefined : scored[0].voice
    }

    /**
     * 共用的 AudioContext。
     *
     * **为什么是共用的。** 浏览器的规则是「没有用户手势就没有跑起来的音频上下文」：
     * 手势里建的那个是 `running`，之后（比如助手的回复到了才播报）再建一个只会
     * 是 `suspended`。
     *
     * 这对口型是**要害**：`createMediaElementSource` 会把这个 `<audio>` 的输出
     * **接管**进音频图——上下文没跑起来，声音就没有了。所以：
     *
     *   1. 只在 `unlockAudio()`（第一次用户手势）里建它；
     *   2. 接分析器之前先看 `state === 'running'`；
     *   3. 不 running 就**不接**（降级成无口型），绝不为了口型把声音弄没。
     */
    let sharedAudioContext
    function audioGraphContext() {
      if (typeof window === 'undefined') return undefined
      if (sharedAudioContext !== undefined) return sharedAudioContext
      const Ctor = window.AudioContext ?? window.webkitAudioContext
      if (Ctor === undefined) return undefined
      try {
        sharedAudioContext = new Ctor()
      } catch {
        return undefined
      }
      return sharedAudioContext
    }

    /**
     * 在第一次用户手势里解锁音频。
     *
     * **为什么必须做。** 服务端合成返回的是音频字节，播放走 `new Audio()`；
     * 浏览器会拦掉"没有用户手势"的自动播放。面试里第一句提问往往是自动
     * 播报的——不在「开始面试」这个手势里解锁，那一句就会被静默拦掉。
     */
    let audioUnlocked = false
    function unlockAudio() {
      if (audioUnlocked || typeof window === 'undefined') return
      audioUnlocked = true
      try {
        // 共用同一个上下文：解锁掉的那一个，就是之后量音量用的那一个。
        const context = audioGraphContext()
        if (context !== undefined) {
          context.resume?.()
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          gain.gain.value = 0
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start()
          oscillator.stop(context.currentTime + 0.01)
        }
      } catch {
        // 解锁失败不影响功能：播放时会再试一次，失败就回落浏览器音色。
      }
    }

    /**
     * 语音播报：**服务端模型优先，浏览器音色兜底**。
     *
     * 三条纪律：
     *  1. 同一句话只合成一次（按 文本+语速 缓存，容量封顶，不常驻大对象）；
     *  2. 服务端不可用/被拦播放 → 静默回落浏览器音色，**但要说明原因**；
     *  3. 失败不是错误状态：面试继续，问题本来就以文字显示。
     *
     * @param {object|undefined} status `GET /voice` 的 tts 段
     * @param {object|undefined} config 面板配置
     */
    function useSpeech(status, config) {
      const [speaking, setSpeaking] = useState(false)
      const [notice, setNotice] = useState(undefined)
      const cacheRef = useRef(new Map())
      const audioRef = useRef(undefined)
      /** 每次新的朗读 +1；旧的请求回来时看到代际不对就丢弃。 */
      const generationRef = useRef(0)

      // ── 播报音量通道（给口型用）───────────────────────────────────────
      //
      // **为什么不放 state。** 口型每帧都在变；放进 useState 就是每帧重渲染整个
      // 面板，直接踩穿 AGENTS §11 的红线（「空闲轮询引发的重渲染 = 0 次」）。
      // 所以：值只活在 ref 里，读取函数用 useCallback 固定身份，形象层的 rAF
      // 循环直接读——全程不触发任何 React 更新。
      //
      // 两条硬约束（错了不报错，只是「没声音」，最难查）：
      //   1. `createMediaElementSource` 对同一个元素**只能调一次**；
      //   2. 接管之后**必须**再接回 `destination`，否则声音直接消失。
      const levelRef = useRef(0)
      const analyserRef = useRef(undefined)

      /** 把播报用的 `<audio>` 接进音频图，用来量音量。失败返回 undefined（降级无口型）。 */
      const attachAnalyser = useCallback(audio => {
        if (analyserRef.current !== undefined) return analyserRef.current
        const context = audioGraphContext()
        if (context === undefined) return undefined
        // 上下文必须已经在跑（= 用户手势后 unlockAudio 建的那一个）。
        // 不 running 就**不接**：接了却没跑，面试官会没有声音。
        if (context.state !== 'running') {
          try { void context.resume() } catch { /* 还是静音，那就放弃口型 */ }
          return undefined
        }
        try {
          const source = context.createMediaElementSource(audio)
          const analyser = context.createAnalyser()
          analyser.fftSize = 1024
          analyser.smoothingTimeConstant = 0
          source.connect(analyser)
          // ★ 少了这一行，面试官就没有声音。
          source.connect(context.destination)
          analyserRef.current = { context, source, analyser, buffer: new Float32Array(analyser.fftSize) }
          return analyserRef.current
        } catch {
          // 同一个元素只能接一次：第二次调用抛错 → 放弃分析，播放照旧。
          return undefined
        }
      }, [])

      /**
       * 当前播报音量 0..1。**恒定身份**，调用方可以直接放进 rAF 循环。
       *
       * 口径：与 ASR 侧同一条静音线（0.012），但**满刻度更宽**（0.18 而不是
       * 0.08）—— 口型要的是"张合有层次"，不是"过阈值就是 1"。平方根做感知
       * 校正：小声也要看得见嘴动。
       */
      const readLevel = useCallback(() => {
        const entry = analyserRef.current
        if (entry === undefined) return 0
        const { analyser, buffer } = entry
        analyser.getFloatTimeDomainData(buffer)
        let sum = 0
        for (let index = 0; index < buffer.length; index += 1) sum += buffer[index] * buffer[index]
        const rms = Math.sqrt(sum / buffer.length)
        const level = Math.min(1, Math.max(0, Math.sqrt(Math.max(0, (rms - 0.012) / 0.18))))
        levelRef.current = level
        return level
      }, [])

      /** 停止/播完：嘴必须立刻闭上（别半张着）。 */
      const quieten = useCallback(() => {
        levelRef.current = 0
      }, [])

      const stop = useCallback(() => {
        generationRef.current += 1
        quieten()
        const audio = audioRef.current
        if (audio !== undefined) {
          try {
            audio.pause()
            audio.currentTime = 0
          } catch { /* 已经停了 */ }
        }
        if (typeof window !== 'undefined' && window.speechSynthesis !== undefined) {
          try { window.speechSynthesis.cancel() } catch { /* 没有在播 */ }
        }
        setSpeaking(false)
      }, [quieten])

      useEffect(() => () => stop(), [stop])

      /** 取一句的音频（命中缓存就不请求）；失败返回 undefined。 */
      const fetchClip = useCallback(async (sentence, rate) => {
        const key = `${rate}|${sentence}`
        const cached = cacheRef.current.get(key)
        if (cached !== undefined) return cached
        try {
          const result = await apiPost('tts/speak', { text: sentence, rate })
          if (result?.ok === true && typeof result.audioBase64 === 'string') {
            const clip = { base64: result.audioBase64, mimeType: result.mimeType ?? 'audio/mpeg' }
            cacheRef.current.set(key, clip)
            // 语音是大对象：缓存封顶，**不常驻**（AGENTS §11.4）。
            if (cacheRef.current.size > 48) cacheRef.current.delete(cacheRef.current.keys().next().value)
            return clip
          }
          setNotice(result?.reason ?? '模型播报不可用，已改用浏览器音色。')
        } catch (failure) {
          setNotice(`模型播报失败：${failure instanceof Error ? failure.message : String(failure)}`)
        }
        return undefined
      }, [])

      /** 浏览器音色（最后一步）：中文优先、按名称挑最自然的。 */
      const speakBrowser = useCallback((text, rate) => {
        if (typeof window === 'undefined' || window.speechSynthesis === undefined) return false
        // 系统音色进不了音频图 → 这一段没有口型，音量通道归零。
        quieten()
        const sentences = splitSentences(text)
        if (sentences.length === 0) return false
        try {
          window.speechSynthesis.cancel()
        } catch { /* 没有在播 */ }
        const voice = pickBrowserVoice(window.speechSynthesis.getVoices?.() ?? [])
        for (const sentence of sentences) {
          const utterance = new window.SpeechSynthesisUtterance(sentence)
          utterance.lang = 'zh-CN'
          utterance.rate = rate
          if (voice !== undefined) utterance.voice = voice
          utterance.onend = () => setSpeaking(false)
          utterance.onerror = () => setSpeaking(false)
          window.speechSynthesis.speak(utterance)
        }
        setSpeaking(true)
        return true
      }, [quieten])

      /**
       * 播报：**逐句流水线**。
       *
       * **为什么按句流水。** 整段合成要等所有句子都合成完才出声；而面谈里
       * 「面试官什么时候开口」几乎等于「这像不像真的」。按句拆开后，第一句
       * 一到就播，后面的句子在播放期间继续合成——首音延迟从「整段」降到
       * 「一句」。
       *
       * 注意：这是**请求级流水**，不是音频流式；真正的 SSE/流式要等 provider
       * 支持（MiMo 的 stream 是"整段音频出流式文字/音频"，不是麦克风实时）。
       */
      const speak = useCallback(async (text, options = {}) => {
        const line = String(text ?? '').trim()
        if (line === '') return false
        const rate = options.rate ?? config?.ttsRate ?? 1
        stop()
        const generation = generationRef.current

        if (status?.mode !== 'server') return speakBrowser(line, rate)

        const sentences = splitSentences(line)
        const chunks = sentences.length === 0 ? [line] : sentences
        /** 按句序存放 objectURL；undefined = 还没好，null = 这句失败。 */
        const parts = new Array(chunks.length)
        const audio = audioRef.current ?? (audioRef.current = new Audio())
        // 接一次就够（同一个元素只能接一次）；接不上就只是没有口型。
        attachAnalyser(audio)
        let cursor = 0
        let pumping = false

        const pump = async () => {
          if (pumping) return
          pumping = true
          while (generation === generationRef.current) {
            const part = parts[cursor]
            if (part === undefined) break
            cursor += 1
            if (part === null) continue
            setSpeaking(true)
            audio.src = part
            try {
              await audio.play()
            } catch {
              // 播放被拦：把整段交给浏览器音色，并说明原因。
              if (generation === generationRef.current) {
                setNotice('浏览器拦下了自动播放，已改用系统音色。')
                speakBrowser(line, rate)
              }
              pumping = false
              return
            }
            await new Promise(resolve => {
              audio.onended = resolve
              audio.onerror = resolve
            })
            try { URL.revokeObjectURL(part) } catch { /* 已回收 */ }
          }
          pumping = false
          if (generation === generationRef.current && cursor >= chunks.length) {
            // 播完立刻闭嘴：口型读的是音量，残余包络会让嘴继续动一下。
            quieten()
            setSpeaking(false)
          }
        }

        for (let index = 0; index < chunks.length; index += 1) {
          const sentence = chunks[index]
          void fetchClip(sentence, rate).then(clip => {
            if (generation !== generationRef.current) return
            if (clip === undefined) {
              parts[index] = null
              // 第一句就没有音频：整段回落浏览器音色，别让用户干等。
              if (index === 0) speakBrowser(line, rate)
              void pump()
              return
            }
            parts[index] = URL.createObjectURL(base64ToBlob(clip.base64, clip.mimeType))
            void pump()
          })
        }
        return true
      }, [status?.mode, config?.ttsRate, fetchClip, speakBrowser, stop, attachAnalyser, quieten])

      // 浏览器音色兜底：`speechSynthesis` 的输出**进不了音频图**（拿不到波形），
      // 所以这条路径没有口型——只可能有说话姿态。如实降级，不假装同步。
      return { speak, stop, speaking, notice, readLevel, supported: typeof window !== 'undefined' }
    }

    /**
     * 分段识别（宿主/服务端模式用）。
     *
     * **为什么是分段而不是流式。** 宿主的 `speechToText` 与主流 ASR 端点都
     * 只支持"整段录音"，没有流式协议。所以"准实时"= 按静音切段（≤6 秒），
     * 每段立刻转写、立刻上屏——一句话一落定，而不是等你说完一整段。
     *
     * VAD 用 RMS 阈值 + 静音时长；碎片丢弃（<350ms），避免咳嗽、键盘声
     * 变成一条转录。
     *
     * **第二层：话轮结束判定（docs/TURN-TAKING.md §3.1）。** 450ms 是
     * *转写分段*阈值——人喘口气就切，不能当*话轮结束*用。判定"这一轮
     * 答完了"要另一条更长的静音线（默认 2s，可配），且必须等
     * `pending === 0`（所有段都转写完，不丢尾句）。两层**共用同一条 VAD
     * 帧时间线**：分段照旧切，判定只是读同一条时间线上的空档——语流
     * 测量（gapBeforeMs 等）一点不受影响。
     *
     * options 形状（每帧从 ref 读最新值，回调不进依赖数组）：
     *   {
     *     language?: string,
     *     turnEnd?: {
     *       armed: boolean,        // 话轮窗口开着（listening/submitting）
     *       judge: boolean,        // 允许**判定答完**（仅 auto + listening；半双工门控）
     *       listen: boolean,       // 长沉默观察窗（listening，与模式无关）
     *       echoGuard?: boolean,   // 面试官正在说：这一段**不送转写**（回声）
     *       silenceMs?: number,    // 第二层静音阈值，默认 2000
     *       longSilenceMs?: number // 长沉默阈值，默认 20000
     *     },
     *     onVoiceStart?: () => void,             // 窗口内重新开口（反悔窗口取消）
     *     onTurnEnd?: (info) => void,            // 判定答完（进倒计时）
     *     onLongSilence?: (info) => void,        // 一直没开口（派事实/给提示）
     *   }
     */
    const ASR_SILENCE_MS = 450
    const ASR_MAX_SEGMENT_MS = 6000
    const ASR_MIN_SEGMENT_MS = 350
    const ASR_RMS_THRESHOLD = 0.012
    const TURN_END_SILENCE_MS = 2000
    const LONG_SILENCE_MS = 20000

    /** 合并 Float32 分片。 */
    function mergeChunks(chunks) {
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const merged = new Float32Array(total)
      let offset = 0
      for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.length
      }
      return merged
    }

    /** 线性重采样到 16 kHz（宿主与端点都要求 16 kHz 单声道 WAV）。 */
    function resampleTo16k(samples, sampleRate) {
      if (sampleRate === 16000 || samples.length === 0) return samples
      const ratio = sampleRate / 16000
      const length = Math.max(1, Math.floor(samples.length / ratio))
      const output = new Float32Array(length)
      for (let index = 0; index < length; index += 1) {
        const source = Math.min(samples.length - 1, Math.floor(index * ratio))
        output[index] = samples[source]
      }
      return output
    }

    /**
     * 麦克风分段识别。
     *
     * @param {(text: string, meta: {mode: string}) => void} onText
     * @param {{language?: string}} [options]
     */
    function useSegmentAsr(onText, options = {}) {
      const language = options.language ?? 'zh'
      const [active, setActive] = useState(false)
      const [error, setError] = useState(undefined)
      const [pending, setPending] = useState(0)
      /** 上一段的「音频秒数 / 推理秒数」：准实时够不够，看这个数字。 */
      const [timing, setTiming] = useState(undefined)
      const sessionRef = useRef(undefined)
      const onTextRef = useRef(onText)
      onTextRef.current = onText
      // 话轮判定配置与回调走 ref：音频帧回调（每 ~256ms 一次）读最新值，
      // 不进 useCallback 依赖——否则每次渲染都会重建整条音频管线。
      const turnOptionsRef = useRef(options)
      turnOptionsRef.current = options
      /** `pending` 的 ref 镜像：帧回调里要同步读，state 读不到最新值。 */
      const pendingRef = useRef(0)

      const supported = typeof window !== 'undefined'
        && typeof navigator !== 'undefined'
        && navigator.mediaDevices !== undefined
        && (window.AudioContext ?? window.webkitAudioContext) !== undefined

      /**
       * 转写一段；失败只记原因，不打断面试。
       *
       * 同时把这一段的**语流原始测量**（说话/静音/段前停顿/能量波动）交给
       * 调用方——它随这一轮回答一起上报，Host 端算指标。
       */
      const flush = useCallback(async (samples, sampleRate, stats) => {
        const wav = encodeWav(resampleTo16k(samples, sampleRate), 16000)
        const dataBase64 = bufferToBase64(wav)
        pendingRef.current += 1
        setPending(count => count + 1)
        try {
          const result = await apiPost('asr/transcribe', { dataBase64, mimeType: 'audio/wav', language })
          if (result?.ok === true && typeof result.text === 'string' && result.text.trim() !== '') {
            onTextRef.current?.(result.text.trim(), { mode: result.mode ?? 'server', segment: stats })
            if (result.timing !== undefined) setTiming(result.timing)
            setError(undefined)
          } else if (result?.ok !== true) {
            setError(result?.reason ?? '这一段没转出来，继续用键盘输入。')
          }
        } catch (failure) {
          setError(`识别请求失败：${failure instanceof Error ? failure.message : String(failure)}`)
        } finally {
          pendingRef.current = Math.max(0, pendingRef.current - 1)
          setPending(count => Math.max(0, count - 1))
        }
      }, [language])

      /** 从 VAD 状态里取这一段的原始测量。 */
      const statsOf = state => {
        let energyCv = 0
        if (state.energyCount > 1) {
          const mean = state.energySum / state.energyCount
          const variance = Math.max(0, state.energySq / state.energyCount - mean * mean)
          energyCv = mean > 0 ? Math.min(10, Math.sqrt(variance) / mean) : 0
        }
        return {
          speechMs: Math.round(state.speechMs),
          silenceMs: Math.round(state.silenceMs),
          gapBeforeMs: Math.round(state.pendingGapMs),
          energyCv: Math.round(energyCv * 100) / 100,
        }
      }

      const stop = useCallback(() => {
        const session = sessionRef.current
        if (session === undefined) {
          setActive(false)
          return
        }
        try { session.processor.disconnect() } catch { /* 已断开 */ }
        try { session.source.disconnect() } catch { /* 已断开 */ }
        try { session.sink.disconnect() } catch { /* 已断开 */ }
        try { session.stream.getTracks().forEach(track => track.stop()) } catch { /* 已停止 */ }
        const rate = session.context.sampleRate
        try { session.context.close() } catch { /* 已关闭 */ }
        // 停止时把最后一段说完的话也送去转写，不丢尾句。
        if (session.state.chunks.length > 0) {
          const tail = mergeChunks(session.state.chunks)
          session.state.chunks = []
          if ((tail.length / rate) * 1000 >= ASR_MIN_SEGMENT_MS) void flush(tail, rate, statsOf(session.state))
        }
        sessionRef.current = undefined
        setActive(false)
      }, [flush])

      const start = useCallback(async () => {
        if (sessionRef.current !== undefined) return false
        if (!supported) {
          setError('这个环境没有麦克风或 Web Audio，识别不可用。请用键盘输入——面试照常进行。')
          return false
        }
        try {
          // **回声消除必须开。** 面试官是外放的：他的声音从扬声器出来会被
          // 麦克风收进去，RMS 判定"有人在说话"，然后被转写成候选人的回答。
          // 摄像头那条路早就开了（50-hooks.js），这里以前漏了——装上虚拟面试官
          // 之后这条缝会被放大（每轮都在说、还更响）。与摄像头路径对齐。
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          })
          const Ctor = window.AudioContext ?? window.webkitAudioContext
          let context
          try {
            context = new Ctor({ sampleRate: 16000 })
          } catch {
            context = new Ctor()
          }
          const source = context.createMediaStreamSource(stream)
          const processor = context.createScriptProcessor(4096, 1, 1)
          const sink = context.createGain()
          sink.gain.value = 0
          /** 一段的测量状态；每次切段后清零。 */
          const state = {
            chunks: [], speech: false,
            speechMs: 0, silenceMs: 0, pendingGapMs: 0, lastEndAt: undefined,
            energySum: 0, energySq: 0, energyCount: 0,
            // ── 话轮结束判定（第二层静音，与分段共用这条帧时间线）──
            lastVoiceAt: 0,        // 最近一个「有声帧」的时刻（全局，不分窗口）
            armed: false,          // 上一个武装窗口（false→true 沿=窗口开启）
            armedAt: 0,            // 本次窗口开启时刻
            voiceNow: false,       // 窗口内的有声/无声沿检测
            sawVoice: false,       // 本次窗口内开过口（没开过口≠答完）
            turnEndFired: false,   // 本次窗口已判定过答完（一次回答只判一次）
            longSilenceFired: false,
          }

          processor.onaudioprocess = event => {
            const input = event.inputBuffer.getChannelData(0)
            let sum = 0
            for (let index = 0; index < input.length; index += 1) sum += input[index] * input[index]
            const rms = Math.sqrt(sum / input.length)
            const frameMs = (input.length / context.sampleRate) * 1000
            const speaking = rms >= ASR_RMS_THRESHOLD

            // ── 第二层：话轮结束判定 ────────────────────────────────
            //
            // 三条硬规则（TURN-TAKING §3）：
            //  1. 半双工门控：`judge` 只在 listening 相态为真——questioning
            //     期间扬声器回声会被 RMS 误判为说话，判定必须挂起（分段
            //     照跑，字幕/语流不丢）；
            //  2. `pending === 0` 才判：所有段都转写完，不丢尾句；
            //  3. 窗口内没开过口不判「答完」：一直没说话是**长沉默**，
            //     报告事实让助手换小切口，而不是提交一个空回答。
            const turn = turnOptionsRef.current?.turnEnd
            const now = performance.now()
            if (speaking) state.lastVoiceAt = now
            const armed = turn?.armed === true
            if (armed && !state.armed) {
              // 窗口开启：以开启时刻为基线，窗口前的静音不算数。
              state.armed = true
              state.armedAt = now
              state.voiceNow = speaking
              // 开窗那一刻正在说话（抢话/重叠回答）也算「窗口内开过口」——
              // 否则这段语音没有 false→true 沿，答完判定永远不武装。
              state.sawVoice = speaking
              state.turnEndFired = false
              state.longSilenceFired = false
            } else if (!armed && state.armed) {
              state.armed = false
            }
            if (armed) {
              if (speaking && !state.voiceNow) {
                state.voiceNow = true
                // 重新开口：本轮判定重新武装（「说完又补一句」必须支持），
                // 并通知上层取消倒计时（反悔窗口，§3.2）。
                state.sawVoice = true
                state.turnEndFired = false
                turnOptionsRef.current?.onVoiceStart?.()
              } else if (!speaking && state.voiceNow) {
                state.voiceNow = false
              }
              const silenceStart = Math.max(state.armedAt, state.lastVoiceAt > state.armedAt ? state.lastVoiceAt : 0)
              const silentFor = now - silenceStart
              const silenceMs = Number.isFinite(turn?.silenceMs) ? turn.silenceMs : TURN_END_SILENCE_MS
              const longSilenceMs = Number.isFinite(turn?.longSilenceMs) ? turn.longSilenceMs : LONG_SILENCE_MS
              // 判定答完：仅 auto（judge），且要等转写落定、窗口内开过口。
              if (turn?.judge === true) {
                if (!state.turnEndFired && state.sawVoice && pendingRef.current === 0 && silentFor >= silenceMs) {
                  state.turnEndFired = true
                  turnOptionsRef.current?.onTurnEnd?.({ silentFor: Math.round(silentFor) })
                }
              }
              // 长沉默观察与模式无关（listen）：auto 派事实、manual 只提示，
              // 由上层回调决定（§3.3）。
              if (turn?.listen === true) {
                if (!state.longSilenceFired && !state.sawVoice && silentFor >= longSilenceMs) {
                  state.longSilenceFired = true
                  turnOptionsRef.current?.onLongSilence?.({ seconds: Math.round(silentFor / 1000) })
                }
              }
            }

            if (speaking && !state.speech) {
              // 新的一段开始。与上一段结束之间的空档 = 一次真实的"停住"。
              state.speech = true
              state.pendingGapMs = state.lastEndAt === undefined ? 0 : Math.max(0, performance.now() - state.lastEndAt)
              state.speechMs = 0
              state.silenceMs = 0
              state.energySum = 0
              state.energySq = 0
              state.energyCount = 0
            }
            if (!state.speech) return

            state.chunks.push(new Float32Array(input))
            if (speaking) {
              state.speechMs += frameMs
              state.energySum += rms
              state.energySq += rms * rms
              state.energyCount += 1
              state.silenceMs = 0
            } else {
              state.silenceMs += frameMs
            }

            const done = state.silenceMs >= ASR_SILENCE_MS
              || state.speechMs + state.silenceMs >= ASR_MAX_SEGMENT_MS
            if (!done) return
            const merged = mergeChunks(state.chunks)
            const stats = statsOf(state)
            state.chunks = []
            state.speech = false
            state.lastEndAt = performance.now()
            // **面试官说话期间（echoGuard）不送转写。** 半双工门控只挡住了
            // 「判定答完」（judge 只在 listening 为真），分段**照跑**——于是
            // 扬声器的回声会被转写成"候选人的回答"。
            //
            // 这里只丢**这一段的字节**，不动 VAD/时间线：能量统计、静音账本、
            // 长沉默观察全都照旧（那条逻辑已经是对的，不要顺手改它）。
            const echoGuard = turnOptionsRef.current?.turnEnd?.echoGuard === true
            if (!echoGuard && stats.speechMs >= ASR_MIN_SEGMENT_MS) {
              void flush(merged, context.sampleRate, stats)
            }
          }

          source.connect(processor)
          processor.connect(sink)
          sink.connect(context.destination)
          sessionRef.current = { context, source, processor, sink, stream, state }
          setActive(true)
          setError(undefined)
          return true
        } catch (failure) {
          setError(`麦克风打不开：${failure instanceof Error ? failure.message : String(failure)}`)
          return false
        }
      }, [flush, supported])

      useEffect(() => () => stop(), [stop])

      return { supported, active, error, pending, timing, start, stop, interim: pending > 0 ? '正在转写…' : '' }
    }


