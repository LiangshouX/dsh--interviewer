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
        const Ctor = window.AudioContext ?? window.webkitAudioContext
        if (Ctor !== undefined) {
          const context = new Ctor()
          context.resume?.()
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          gain.gain.value = 0
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start()
          oscillator.stop(context.currentTime + 0.01)
          setTimeout(() => { context.close?.() }, 200)
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

      const stop = useCallback(() => {
        generationRef.current += 1
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
      }, [])

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
      }, [])

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
          if (generation === generationRef.current && cursor >= chunks.length) setSpeaking(false)
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
      }, [status?.mode, config?.ttsRate, fetchClip, speakBrowser, stop])

      return { speak, stop, speaking, notice, supported: typeof window !== 'undefined' }
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
     */
    const ASR_SILENCE_MS = 450
    const ASR_MAX_SEGMENT_MS = 6000
    const ASR_MIN_SEGMENT_MS = 350
    const ASR_RMS_THRESHOLD = 0.012

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
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
          }

          processor.onaudioprocess = event => {
            const input = event.inputBuffer.getChannelData(0)
            let sum = 0
            for (let index = 0; index < input.length; index += 1) sum += input[index] * input[index]
            const rms = Math.sqrt(sum / input.length)
            const frameMs = (input.length / context.sampleRate) * 1000
            const speaking = rms >= ASR_RMS_THRESHOLD

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
            if (stats.speechMs >= ASR_MIN_SEGMENT_MS) void flush(merged, context.sampleRate, stats)
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


