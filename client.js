/*!
 * dsh-interviewer — client half (browser bundle).
 *
 * 模拟面试间 —— 把「简历 + 目标岗位 JD」变成**一场有准备的面试**。
 *
 * 设计语言：**面试卷宗**。
 *
 * 一场面试就是一份案卷：简历与 JD 是卷内材料，考点清单是**面试官的底稿**
 * （真实面试里你看不到它），转录是速记，面试后的报告是评估表。
 * 这个隐喻不是装饰——它直接对应产品纪律：
 *
 *   ① **底稿默认收起。** 考点清单在准备阶段可查可改，但进了面试就不是
 *      「你将���被问到的问题」——那会把一场面试变成答题游戏。
 *   ② **舞台永远是主位。** 面试中，视频区占满左半屏；没有摄像头时也
 *      不塌成一行提示——那是一个**设计过的「未接通」状态**，因为画面
 *      本身就是面试室的一部分。
 *   ③ **权限被拒不是死路。** 拿不到摄像头是常事，所以插件会**主动发起
 *      授权申请**，并盯着系统设置里的变化自动接上，而不是甩一句错误。
 *   ④ **输入永远有两条路。** 语音识别是效率，键盘输入是保底。
 *
 * 配色：**深墨底 + 骨白纸感 + 单一氧化朱红（REC）+ 琥珀（提问）+ 青玉（就绪）**。
 * 主按钮用骨白反色而不是蓝——蓝按钮会让它退回通用后台的样子。
 *
 * Bundle format: the official DSH client-bundle shape — a lazy-CJS closure
 * registered with window.__ModuleLoader__.load({ id, factory }). `react` comes
 * from the browser module table at runtime; everything else is inlined, so the
 * plugin carries no build step and no runtime dependency.
 */
window.__ModuleLoader__.load({
  id: 'dsh-interviewer',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = React

    // ── locale ────────────────────────────────────────────────────────────
    const LOCALE_NS = 'dsh-interviewer'
    /** The panel id: the sidebar entry's id and the `main` slot's key. */
    const PANEL_ID = 'interviewer'
    /** How often the interview view refreshes from the host. */
    const POLL_MS = 1500

    const DICT = {
      zh: {
        'brand.title': '模拟面试间',
        'brand.subtitle': '简历 + JD → 一场有准备的面试',
        'tab.prepare': '准备',
        'tab.live': '面试中',
        'tab.report': '报告',
        'action.new': '新建面试',
        'action.save': '保存',
        'action.fetch': '抓取',
        'action.submit': '提交回答',
        'action.copy': '复制',
        'action.start': '开始面试',
        'action.stop': '结束',
        'action.camera.on': '开摄像头',
        'action.camera.off': '关摄像头',
        'action.record.on': '开始录音',
        'action.record.off': '停止录音',
        'action.asr.on': '开始识别',
        'action.asr.off': '停止识别',
        'action.speak': '朗读问题',
        'action.upload': '上传文件',
        'state.empty': '还没有面试。先新建一场。',
        'state.ready': '准备就绪',
        'state.listening': '正在聆听…',
        'state.idle': '待命',
      },
      en: {
        'brand.title': 'Mock interview room',
        'brand.subtitle': 'Resume + JD → a prepared interview',
        'tab.prepare': 'Prepare',
        'tab.live': 'Live',
        'tab.report': 'Report',
        'action.new': 'New interview',
        'action.save': 'Save',
        'action.fetch': 'Fetch',
        'action.submit': 'Submit answer',
        'action.copy': 'Copy',
        'action.start': 'Start',
        'action.stop': 'Finish',
        'action.camera.on': 'Camera on',
        'action.camera.off': 'Camera off',
        'action.record.on': 'Record',
        'action.record.off': 'Stop recording',
        'action.asr.on': 'Listen',
        'action.asr.off': 'Stop',
        'action.speak': 'Read question',
        'action.upload': 'Upload',
        'state.empty': 'No interview yet. Create one.',
        'state.ready': 'Ready',
        'state.listening': 'Listening…',
        'state.idle': 'Idle',
      },
    }

    // ── type ──────────────────────────────────────────────────────────────
    //
    // 三档，各有职责：
    //   声音（衬线）—— 提问、报告标题。它是「人说的话」，不是界面标签。
    //   界面（无衬线）—— 一切可点的、可读的。
    //   数据（等宽）—— 计时、电平、字数、id。数字要能对齐着看。
    const F = {
      voice: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", serif',
      ui: 'system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
      mono: '"SF Mono", "Cascadia Mono", "Cascadia Code", Consolas, "Roboto Mono", ui-monospace, monospace',
    }

    // ── palette ───────────────────────────────────────────────────────────
    //
    // 底是**墨**（偏冷的深灰蓝），不是纯黑——纯黑会让它变成一个网页。
    // 文字是**骨白**（带一点暖），不是纯白——纯白在深底上太刺眼。
    // 三个强调色各有唯一职责，不做装饰用：
    //   tally 氧化朱红 = 正在录制（唯一用到它的地方是 REC 灯）
    //   amber 琥珀     = 面试官在提问（提问卡的竖线、当前问题）
    //   jade  青玉     = 已就绪 / 已完成 / 已保存
    const C = {
      ink900: '#0E1116',
      ink850: '#131820',
      ink800: '#1A2029',
      ink750: '#202833',
      ink700: '#28313E',
      rule: '#232B36',
      ruleSoft: '#1D242D',
      bone: '#E9E5DB',
      boneDim: '#A5ACB7',
      boneFaint: '#6C7480',
      tally: '#E0563F',
      amber: '#D9A441',
      jade: '#4FA98C',
    }

    const S = {
      page: {
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
        background: C.ink900, color: C.bone, fontFamily: F.ui, fontSize: 13,
        WebkitFontSmoothing: 'antialiased',
      },
      head: {
        display: 'flex', alignItems: 'center', gap: 18, padding: '14px 22px',
        borderBottom: `1px solid ${C.rule}`, flex: '0 0 auto',
        background: `linear-gradient(180deg, ${C.ink850} 0%, ${C.ink900} 100%)`,
      },
      title: { fontFamily: F.voice, fontSize: 19, fontWeight: 600, letterSpacing: '0.01em', lineHeight: 1.2 },
      sub: { fontSize: 11.5, color: C.boneFaint, marginTop: 3, letterSpacing: '0.02em' },
      workspace: {
        fontFamily: F.mono, fontSize: 10.5, color: C.boneFaint, marginTop: 4,
        letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
      tabs: { display: 'flex', gap: 2, marginLeft: 'auto', padding: 3, background: C.ink800, borderRadius: 10, border: `1px solid ${C.rule}` },
      tab: (active) => ({
        padding: '6px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
        background: active ? C.ink700 : 'transparent',
        color: active ? C.bone : C.boneFaint,
        border: `1px solid ${active ? C.rule : 'transparent'}`,
        transition: 'background 140ms ease, color 140ms ease',
        fontFamily: F.ui,
      }),
      body: { flex: '1 1 auto', minHeight: 0, display: 'flex' },
      rail: {
        width: 216, flex: '0 0 216px', borderRight: `1px solid ${C.rule}`,
        overflowY: 'auto', padding: '12px 10px', background: C.ink850,
      },
      main: { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: 22 },

      card: {
        background: `linear-gradient(180deg, ${C.ink800} 0%, ${C.ink850} 100%)`,
        border: `1px solid ${C.rule}`,
        borderRadius: 14,
        padding: '18px 20px',
        marginBottom: 16,
        boxShadow: 'inset 0 1px 0 rgba(233,229,219,0.035), 0 18px 40px -32px rgba(0,0,0,0.95)',
      },
      cardHead: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 },
      eyebrow: {
        fontFamily: F.mono, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: C.boneFaint, flex: '0 0 auto',
      },
      cardTitle: { fontFamily: F.voice, fontSize: 16, fontWeight: 600, letterSpacing: '0.01em' },
      hint: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.65 },
      label: { fontSize: 11.5, color: C.boneDim, marginBottom: 7, display: 'block', letterSpacing: '0.02em' },
      input: {
        width: '100%', boxSizing: 'border-box', background: '#0F131A', color: C.bone,
        border: `1px solid ${C.rule}`, borderRadius: 9, padding: '9px 12px', fontSize: 13,
        fontFamily: F.ui, outline: 'none', transition: 'border-color 140ms ease, box-shadow 140ms ease',
      },
      textarea: {
        width: '100%', boxSizing: 'border-box', background: '#0F131A', color: C.bone,
        border: `1px solid ${C.rule}`, borderRadius: 9, padding: '12px', fontSize: 13,
        fontFamily: F.ui, outline: 'none', minHeight: 130, resize: 'vertical', lineHeight: 1.7,
        transition: 'border-color 140ms ease, box-shadow 140ms ease',
      },
      btn: (kind, disabled) => {
        const base = {
          padding: '8px 15px', borderRadius: 9, fontSize: 12.5, cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: F.ui, letterSpacing: '0.01em', transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
          border: `1px solid ${C.rule}`,
        }
        if (kind === 'primary') {
          return {
            ...base, background: C.bone, color: '#11151C', borderColor: C.bone, fontWeight: 600,
            opacity: disabled ? 0.4 : 1,
          }
        }
        if (kind === 'tally') {
          return { ...base, background: 'rgba(224,86,63,0.12)', color: C.tally, borderColor: 'rgba(224,86,63,0.4)', opacity: disabled ? 0.45 : 1 }
        }
        return { ...base, background: C.ink800, color: C.boneDim, opacity: disabled ? 0.45 : 1 }
      },
      row: { display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' },
      mono: { fontFamily: F.mono },
      pill: (color) => ({
        fontFamily: F.mono, fontSize: 10, padding: '2px 8px', borderRadius: 999,
        border: `1px solid ${color}55`, color, background: `${color}16`, whiteSpace: 'nowrap',
        letterSpacing: '0.04em', alignSelf: 'flex-start', lineHeight: 1.6,
      }),
    }

    // ── api ───────────────────────────────────────────────────────────────
    const API = '/interviewer/api'

    /** Read one JSON resource. */
    async function apiGet(resource, query) {
      const search = query === undefined ? '' : `?${new URLSearchParams(query)}`
      const response = await fetch(`${API}/${resource}${search}`, { credentials: 'same-origin' })
      const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
      if (!body.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
      return body.data
    }

    /** Post one JSON action. */
    async function apiPost(resource, body) {
      const response = await fetch(`${API}/${resource}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
      if (!payload.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
      return payload.data
    }

    /** Read a file as base64 (without the data-url prefix). */
    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('文件读不出来'))
        reader.onload = () => {
          const result = String(reader.result ?? '')
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.readAsDataURL(file)
      })
    }

    /** Read a blob as base64 (without the data-url prefix). */
    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('读不出来'))
        reader.onload = () => {
          const result = String(reader.result ?? '')
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.readAsDataURL(blob)
      })
    }

    /** Read raw bytes as base64 (no data-url wrapper). */
    function bufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const step = 0x8000
      for (let index = 0; index < bytes.length; index += step) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + step))
      }
      return btoa(binary)
    }

    /**
     * Decode a recording into 16 kHz mono float samples.
     *
     * **为什么必须转码。** 浏览器只会录 webm/opus，而主流识别服务
     * （MiniMax、Whisper 兼容接口）要 wav/aiff/flac/m4a/mp3/aac/opus/ogg——
     * **webm 不在其中**。不解码就上传，服务端会直接 400。
     *
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Promise<{samples: Float32Array, sampleRate: number}>}
     */
    function decodeToMono16k(arrayBuffer) {
      const Ctor = window.AudioContext ?? window.webkitAudioContext
      if (Ctor === undefined) {
        return Promise.reject(new Error('这个环境没有 AudioContext，无法转码'))
      }
      return new Promise((resolve, reject) => {
        let context
        try {
          context = new Ctor({ sampleRate: 16000 })
        } catch {
          context = new Ctor()
        }
        context.decodeAudioData(arrayBuffer, buffer => {
          try {
            const channels = buffer.numberOfChannels
            const ratio = buffer.sampleRate / 16000
            const length = Math.max(1, Math.floor(buffer.length / ratio))
            const mono = new Float32Array(length)
            for (let index = 0; index < length; index += 1) {
              const source = Math.min(buffer.length - 1, Math.floor(index * ratio))
              let sum = 0
              for (let channel = 0; channel < channels; channel += 1) {
                sum += buffer.getChannelData(channel)[source]
              }
              mono[index] = sum / channels
            }
            context.close().catch(() => {})
            resolve({ samples: mono, sampleRate: 16000 })
          } catch (error) {
            context.close().catch(() => {})
            reject(error instanceof Error ? error : new Error(String(error)))
          }
        }, error => {
          context.close().catch(() => {})
          reject(new Error(`音频解码失败：${error && error.message ? error.message : String(error)}`))
        })
      })
    }

    /**
     * Encode mono float samples as 16-bit PCM WAV.
     *
     * @param {Float32Array} samples
     * @param {number} sampleRate
     * @returns {ArrayBuffer}
     */
    function encodeWav(samples, sampleRate) {
      const buffer = new ArrayBuffer(44 + samples.length * 2)
      const view = new DataView(buffer)
      const writeString = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
      }
      writeString(0, 'RIFF')
      view.setUint32(4, 36 + samples.length * 2, true)
      writeString(8, 'WAVE')
      writeString(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      writeString(36, 'data')
      view.setUint32(40, samples.length * 2, true)
      let offset = 44
      for (let index = 0; index < samples.length; index += 1, offset += 2) {
        const sample = Math.max(-1, Math.min(1, samples[index]))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      }
      return buffer
    }

    /** Format a duration in milliseconds as `mm:ss`. */
    function formatClock(ms) {
      const total = Math.max(0, Math.floor(ms / 1000))
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    /**
     * Format a byte count with a unit a human reads.
     *
     * 录像动辄几 GB——写成「10240 KiB」没人读得下去。
     */
    function formatBytes(bytes) {
      const value = Number(bytes ?? 0)
      if (!Number.isFinite(value) || value <= 0) return '0 B'
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KiB`
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GiB`
    }

    /** Format a timestamp as a local clock string. */
    function formatTime(ts) {
      const date = new Date(ts)
      const pad = value => String(value).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * The monogram of a session title, for the no-signal plate.
     *
     * 中文标题不能按「首字母」处理——「字节 · 高级后端工程师」取首字母会得到
     * 「字高」，那是两个没意义的字。中文取**第一段的前两个字**，
     * 英文才取首字母。
     */
    function initialsOf(title) {
      const text = String(title ?? '').trim()
      if (text === '') return '—'
      const first = text.split(/[·・,，/]/)[0].trim()
      if (first === '') return text.slice(0, 2)
      if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(first)) return first.slice(0, 2)
      const words = first.split(/\s+/).filter(word => word !== '')
      if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
      return first.slice(0, 2).toUpperCase()
    }

    // ── hooks ─────────────────────────────────────────────────────────────

    /**
     * Poll one async function on an interval.
     *
     * **没有变化就不要 setState。** 面板在面试中每 1.5 秒轮询一次；
     * 每次都 setState 意味着整个面板（可能包含几百行转录）重建一次——
     * 这正是「插件让 DSH 卡顿」最常见的来源。所以 loader 的结果里带一个
     * `revision`（或任何能表示"内容没变"的指纹）时，相同就跳过更新。
     *
     * @param {() => Promise<any>} loader
     * @param {number|null} intervalMs `null` pauses the poll
     * @param {any[]} deps
     * @param {(value: any) => string|undefined} revisionOf extracts the fingerprint
     */
    function usePoll(loader, intervalMs, deps, revisionOf) {
      const [data, setData] = useState(undefined)
      const [error, setError] = useState(undefined)
      const loaderRef = useRef(loader)
      loaderRef.current = loader
      const revisionRef = useRef(undefined)

      const refresh = useCallback(async () => {
        try {
          const value = await loaderRef.current()
          if (typeof revisionOf === 'function') {
            const next = revisionOf(value)
            const previous = revisionRef.current
            revisionRef.current = next
            if (next !== undefined && previous !== undefined && next === previous) return
          }
          setData(value)
          setError(undefined)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }, deps ?? [])

      useEffect(() => {
        void refresh()
      }, [refresh])

      useEffect(() => {
        if (intervalMs === null || intervalMs === undefined) return undefined
        const timer = setInterval(() => { void refresh() }, intervalMs)
        return () => clearInterval(timer)
      }, [refresh, intervalMs])

      return { data, error, refresh }
    }

    /**
     * `requestAnimationFrame` / `cancelAnimationFrame` 的安全包装。
     *
     * 有些宿主环境（测试沙箱、某些内嵌 WebView）没有这两个函数——
     * 裸调用会直接抛 ReferenceError，把整个面板挂掉。音量条失败
     * 不该影响面试本身，所以这里做存在性检查。
     */
    function requestFrame(callback) {
      if (typeof requestAnimationFrame !== 'function') return 0
      return requestAnimationFrame(callback)
    }

    /** @see requestFrame */
    function cancelFrame(handle) {
      if (typeof cancelAnimationFrame !== 'function') return
      cancelAnimationFrame(handle)
    }

    /**
     * Camera + microphone, with a **主动授权** path.
     *
     * 拿不到权限是常事（没设备、系统关掉了、被拒过）。所以这里的契约是：
     *
     *   - 先查 `navigator.permissions` 拿到当前授权状态；
     *   - 状态是 `prompt` 就**发起申请**（getUserMedia 会弹出系统对话框）；
     *   - 状态是 `denied` 就明确告诉用户去哪儿放行，并**盯着状态变化**，
     *     用户在系统设置里放行后**自动接上**，不用再点一次；
     *   - 分清「没设备」「被占用」「页面不安全」「被拒绝」四种原因——
     *     它们的出路完全不同。
     */    function useMedia() {
      const [stream, setStream] = useState(undefined)
      const [error, setError] = useState(undefined)
      const [permission, setPermission] = useState({ camera: 'unknown', microphone: 'unknown' })
      const [level, setLevel] = useState(0)
      const [busy, setBusy] = useState(false)
      const audioRef = useRef(undefined)
      const rafRef = useRef(0)
      const streamRef = useRef(undefined)
      const watchersRef = useRef([])

      /** Read the current permission state for camera and microphone. */
      const probe = useCallback(async () => {
        if (typeof navigator === 'undefined' || navigator.permissions === undefined) return
        const read = async name => {
          try {
            const status = await navigator.permissions.query({ name })
            return status.state
          } catch {
            return 'unknown'
          }
        }
        const camera = await read('camera')
        const microphone = await read('microphone')
        setPermission(previous => {
          if (previous.camera === camera && previous.microphone === microphone) return previous
          return { camera, microphone }
        })
        return { camera, microphone }
      }, [])

      /** Watch for permission changes so we can reconnect on our own. */
      const watch = useCallback(() => {
        if (typeof navigator === 'undefined' || navigator.permissions === undefined) return
        // 先拆掉上一轮的监听，否则每次重试都会多挂一个 onchange。
        for (const dispose of watchersRef.current) dispose()
        watchersRef.current = []
        const disposers = []
        for (const name of ['camera', 'microphone']) {
          try {
            navigator.permissions.query({ name }).then(status => {
              status.onchange = () => {
                setPermission(previous => ({ ...previous, [name]: status.state }))
                // 用户在系统设置里放行了 → 自动重连，别让他再点一次。
                if (status.state === 'granted') { void startRef.current?.() }
              }
              disposers.push(() => { status.onchange = null })
            }).catch(() => {})
          } catch {
            // 这个浏览器不认识这个权限名。
          }
        }
        watchersRef.current = disposers
      }, [])

      const stop = useCallback(() => {
        cancelFrame(rafRef.current)
        const current = streamRef.current
        if (current !== undefined) {
          for (const track of current.getTracks()) track.stop()
        }
        streamRef.current = undefined
        setStream(undefined)
        setLevel(0)
      }, [])

      const start = useCallback(async () => {
        if (streamRef.current !== undefined) return streamRef.current
        if (navigator.mediaDevices?.getUserMedia === undefined) {
          setError({
            kind: 'unsupported',
            text: '这个环境没有摄像头/麦克风接口（需要 Electron 或浏览器，且页面在安全上下文里）。',
            action: '键盘输入仍然可用，面试照常进行。',
          })
          return undefined
        }
        setBusy(true)
        const states = await probe()
        try {
          const media = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true },
          })
          streamRef.current = media
          setStream(media)
          setError(undefined)

          // 音量条：示波器式的输入电平。
          try {
            const AudioCtx = window.AudioContext ?? window.webkitAudioContext
            if (AudioCtx !== undefined) {
              const context = new AudioCtx()
              const source = context.createMediaStreamSource(media)
              const analyser = context.createAnalyser()
              analyser.fftSize = 512
              source.connect(analyser)
              const data = new Uint8Array(analyser.frequencyBinCount)
              audioRef.current = { context, analyser, data }
              const tick = () => {
                analyser.getByteTimeDomainData(data)
                let peak = 0
                for (let index = 0; index < data.length; index += 1) {
                  const value = Math.abs(data[index] - 128) / 128
                  if (value > peak) peak = value
                }
                setLevel(Math.min(1, peak * 1.8))
                rafRef.current = requestFrame(tick)
              }
              rafRef.current = requestFrame(tick)
            }
          } catch {
            // 音量条失败不影响录音与识别。
          }
          return media
        } catch (failure) {
          const name = failure && failure.name
          const denied = name === 'NotAllowedError' || name === 'SecurityError'
          const states2 = await probe()
          if (denied && (states2?.camera === 'denied' || states2?.microphone === 'denied')) {
            setError({
              kind: 'denied',
              text: '系统已记住「拒绝」。',
              action: '在系统设置里放行摄像头与麦克风后，这里会自动接上——不用再点一次。',
            })
          } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
            setError({
              kind: 'missing',
              text: '没有找到摄像头或麦克风。',
              action: '接上设备后重试；键盘输入仍然可用。',
            })
          } else if (name === 'NotReadableError' || name === 'TrackStartError') {
            setError({
              kind: 'busy',
              text: '设备被别的程序占用了。',
              action: '关掉占用它的程序（会议软件、录屏工具），再重试。',
            })
          } else {
            setError({
              kind: 'other',
              text: `打不开摄像头/麦克风：${failure instanceof Error ? failure.message : String(failure)}`,
              action: '可以先用键盘继续面试。',
            })
          }
          return undefined
        } finally {
          setBusy(false)
          watch()
        }
      }, [probe, watch])

      const startRef = useRef(undefined)
      startRef.current = start

      useEffect(() => {
        void probe()
        watch()
        return () => {
          cancelFrame(rafRef.current)
          const current = streamRef.current
          if (current !== undefined) for (const track of current.getTracks()) track.stop()
          const audio = audioRef.current
          if (audio !== undefined) audio.context.close().catch(() => {})
          for (const dispose of watchersRef.current) dispose()
        }
      }, [probe, watch])

      return { stream, error, level, busy, permission, start, stop, probe }
    }

    /**
     * Record the current stream into a blob.
     *
     * @param {MediaStream|undefined} stream
     */
    function useRecorder(stream) {
      const [recording, setRecording] = useState(false)
      const [clip, setClip] = useState(undefined)
      const recorderRef = useRef(undefined)
      const chunksRef = useRef([])

      const start = useCallback(() => {
        if (stream === undefined || recorderRef.current !== undefined) return false
        const mimeType = pickMimeType()
        try {
          const recorder = mimeType === undefined
            ? new MediaRecorder(stream)
            : new MediaRecorder(stream, { mimeType })
          chunksRef.current = []
          recorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
          }
          recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
            setClip({ blob, mimeType: recorder.mimeType || 'video/webm' })
            chunksRef.current = []
          }
          recorder.start(1000)
          recorderRef.current = recorder
          setRecording(true)
          return true
        } catch {
          return false
        }
      }, [stream])

      const stop = useCallback(() => {
        const recorder = recorderRef.current
        if (recorder === undefined) return
        recorder.stop()
        recorderRef.current = undefined
        setRecording(false)
      }, [])

      const reset = useCallback(() => setClip(undefined), [])

      useEffect(() => () => {
        const recorder = recorderRef.current
        if (recorder !== undefined && recorder.state !== 'inactive') recorder.stop()
      }, [])

      return { recording, clip, start, stop, reset }
    }

    /** The best mime type this browser supports for MediaRecorder. */
    function pickMimeType() {
      const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm']
      if (typeof MediaRecorder === 'undefined') return undefined
      for (const candidate of candidates) {
        try {
          if (MediaRecorder.isTypeSupported(candidate)) return candidate
        } catch {
          // 老浏览器没有 isTypeSupported；试下一个。
        }
      }
      return undefined
    }

    /**
     * Speech recognition via the Web Speech API.
     *
     * **必须能降级。** Chromium 的识别后端在很多网络环境里不可达，
     * 所以这里把「识别不可用」当成正常状态暴露出来，而不是抛错。
     */
    function useAsr(onFinal) {
      const [active, setActive] = useState(false)
      const [interim, setInterim] = useState('')
      const [error, setError] = useState(undefined)
      const recognitionRef = useRef(undefined)
      const finalRef = useRef('')
      const onFinalRef = useRef(onFinal)
      onFinalRef.current = onFinal

      const supported = typeof window !== 'undefined'
        && (window.SpeechRecognition !== undefined || window.webkitSpeechRecognition !== undefined)

      const stop = useCallback(() => {
        const recognition = recognitionRef.current
        if (recognition !== undefined) {
          try { recognition.stop() } catch { /* 已经停了 */ }
        }
        recognitionRef.current = undefined
        setActive(false)
        setInterim('')
      }, [])

      const start = useCallback(() => {
        if (recognitionRef.current !== undefined) return false
        const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition
        if (Constructor === undefined) {
          setError('这个环境没有浏览器语音识别（Web Speech API）。请用键盘输入——面试照常进行。')
          return false
        }
        finalRef.current = ''
        const recognition = new Constructor()
        recognition.lang = 'zh-CN'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.onresult = event => {
          let interimText = ''
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index]
            const transcript = result[0]?.transcript ?? ''
            if (result.isFinal) {
              finalRef.current += transcript
              onFinalRef.current?.(finalRef.current.trim(), { isFinal: true })
              finalRef.current = ''
            } else {
              interimText += transcript
            }
          }
          setInterim(interimText)
        }
        recognition.onerror = event => {
          const code = event?.error ?? 'unknown'
          setError(
            code === 'not-allowed'
              ? '语音识别被拒绝了权限。用键盘输入即可继续。'
              : `语音识别不可用（${code}）。这在离线或受限网络里很常见，请用键盘输入。`,
          )
          stop()
        }
        recognition.onend = () => {
          setActive(false)
          setInterim('')
          recognitionRef.current = undefined
        }
        try {
          recognition.start()
          recognitionRef.current = recognition
          setActive(true)
          setError(undefined)
          return true
        } catch {
          setError('语音识别启动失败，请用键盘输入。')
          return false
        }
      }, [stop])

      useEffect(() => () => stop(), [stop])

      return { supported, active, interim, error, start, stop }
    }

    /** Speech synthesis, with a Chinese voice preferred when one exists. */
    function useTts() {
      const [speaking, setSpeaking] = useState(false)

      const speak = useCallback((text, options = {}) => {
        if (typeof window === 'undefined' || window.speechSynthesis === undefined) return false
        const utterance = new window.SpeechSynthesisUtterance(String(text ?? ''))
        utterance.lang = 'zh-CN'
        utterance.rate = options.rate ?? 1
        const voices = window.speechSynthesis.getVoices?.() ?? []
        const chinese = voices.find(voice => /zh|cmn|Chinese/i.test(`${voice.lang} ${voice.name}`))
        if (chinese !== undefined) utterance.voice = chinese
        utterance.onend = () => setSpeaking(false)
        utterance.onerror = () => setSpeaking(false)
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
        setSpeaking(true)
        return true
      }, [])

      const cancel = useCallback(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis !== undefined) {
          window.speechSynthesis.cancel()
        }
        setSpeaking(false)
      }, [])

      useEffect(() => () => cancel(), [cancel])

      return { speak, cancel, speaking, supported: typeof window !== 'undefined' && window.speechSynthesis !== undefined }
    }

    // ── small components ──────────────────────────────────────────────────

    /**
     * A section with an eyebrow number, a serif title, and a right-hand slot.
     *
     * The eyebrow is a **step number** (01 / 02 / 03) — the preparation flow
     * really is a sequence (简历 → JD → 底稿), so numbering carries meaning
     * here rather than decorating.
     */
    function Section(props) {
      return h('div', { style: S.card }, [
        h('div', {key: 'k1',  style: S.cardHead }, [
          props.step !== undefined
            ? h('span', { key: 'step', style: { ...S.eyebrow, color: C.amber, paddingRight: 2 } }, props.step)
            : null,
          h('span', { key: 'title', style: S.cardTitle }, props.title),
          props.extra !== undefined ? h('div', { key: 'extra', style: { marginLeft: 'auto' } }, props.extra) : null,
        ]),
        props.children,
      ])
    }

    /** A text field. */
    function Field(props) {
      return h('div', { style: { marginBottom: 12 } }, [
        h('label', { key: 'l', style: S.label }, props.label),
        h('input', {
          key: 'i',
          style: S.input,
          value: props.value ?? '',
          placeholder: props.placeholder,
          onChange: event => props.onChange(event.target.value),
        }),
      ])
    }

    /** A textarea. */
    function Area(props) {
      return h('div', { style: { marginBottom: 12 } }, [
        h('label', { key: 'l', style: S.label }, props.label),
        h('textarea', {
          key: 't',
          style: S.textarea,
          value: props.value ?? '',
          placeholder: props.placeholder,
          onChange: event => props.onChange(event.target.value),
        }),
      ])
    }

    /**
     * A collapsed block: the summary is always visible, the body is opt-in.
     *
     * Used for the **面试官底稿** — the checklist must be reachable in the
     * preparation phase but hidden by default, because a real candidate
     * never sees the interviewer's notes.
     */
    function Disclosure(props) {
      const [open, setOpen] = useState(props.defaultOpen === true)
      return h('div', null, [
        h('button', {
          key: 'toggle',
          style: {
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: 'transparent', border: 'none', padding: '4px 0 10px',
            cursor: 'pointer', color: C.bone, fontFamily: F.ui, fontSize: 13, textAlign: 'left',
          },
          onClick: () => setOpen(value => !value),
        }, [
          h('span', {
            key: 'chevron',
            style: {
              display: 'inline-block', width: 0, height: 0,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderTop: open ? '6px solid transparent' : '6px solid ' + C.boneFaint,
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 160ms ease',
            },
          }),
          h('span', { key: 'label', style: { flex: '1 1 auto' } }, props.summary),
          props.badge !== undefined ? h('span', { key: 'badge', style: S.pill(C.boneFaint) }, props.badge) : null,
        ]),
        open ? h('div', { key: 'body', style: { borderTop: `1px solid ${C.ruleSoft}`, paddingTop: 12 } }, props.children) : null,
      ])
    }

    /** One checklist item row. */
    function ChecklistRow(props) {
      const item = props.item
      const levelColor = item.level === 'core' ? C.tally : item.level === 'deep' ? C.amber : C.boneFaint
      const levelText = item.level === 'core' ? '必问' : item.level === 'deep' ? '深挖' : '加分'
      return h('div', {
        style: {
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '10px 0', borderBottom: `1px solid ${C.ruleSoft}`,
        },
      }, [
        h('span', { key: 'lvl', style: S.pill(levelColor) }, levelText),
        h('div', { key: 'body', style: { flex: '1 1 auto', minWidth: 0 } }, [
          h('div', {
            key: 'topic',
            style: {
              fontSize: 13, color: item.probed === true ? C.boneFaint : C.bone,
              textDecoration: item.probed === true ? 'line-through' : 'none',
            },
          }, item.topic),
          item.why !== undefined && item.why !== ''
            ? h('div', { key: 'why', style: { fontSize: 11.5, color: C.boneFaint, marginTop: 4, lineHeight: 1.55 } }, item.why)
            : null,
        ]),
        h('span', {
          key: 'state',
          style: { fontFamily: F.mono, fontSize: 10.5, color: item.probed === true ? C.jade : C.boneFaint, whiteSpace: 'nowrap' },
        }, item.probed === true ? '已问' : '待问'),
      ])
    }

    /**
     * The tally lamp — a real broadcast-style "on air" light.
     *
     * The one place in the whole plugin where oxidized red appears. Restraint
     * is what makes a signal read as a signal.
     */
    function Tally(props) {
      const on = props.on === true
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontFamily: F.mono, fontSize: 10.5, letterSpacing: '0.14em',
          color: on ? C.tally : C.boneFaint,
        },
      }, [
        h('span', {
          key: 'lamp',
          style: {
            width: 7, height: 7, borderRadius: 999, display: 'block',
            background: on ? C.tally : 'transparent',
            border: `1px solid ${on ? C.tally : C.boneFaint}`,
            boxShadow: on ? `0 0 0 3px rgba(224,86,63,0.16), 0 0 14px rgba(224,86,63,0.55)` : 'none',
            transition: 'box-shadow 200ms ease',
          },
        }),
        h('span', { key: 'text' }, on ? 'REC' : 'STBY'),
      ])
    }

    /**
     * A segmented level meter — like the LED bar on a mixing desk.
     *
     * Segments (not a smooth bar) because a real meter is segmented: you
     * read "how close to clipping" at a glance, not "what is the percentage".
     */
    function SegmentedMeter(props) {
      const segments = 18
      const lit = Math.round(Math.min(1, props.level ?? 0) * segments)
      const hot = lit >= segments - 2
      return h('div', { style: { display: 'flex', gap: 2, alignItems: 'flex-end', height: 16 } },
        Array.from({ length: segments }, (_, index) => {
          const on = index < lit
          const height = 6 + Math.round((index / segments) * 10)
          const color = index < segments * 0.65 ? C.jade : index < segments * 0.85 ? C.amber : C.tally
          return h('span', {
            key: `s${index}`,
            style: {
              width: 4, height: `${height}px`, borderRadius: 1,
              background: on ? color : C.ink700,
              opacity: on ? 1 : 0.55,
              transition: 'background 80ms linear',
            },
          })
        })
        .concat([
          h('span', {
            key: 'peak',
            style: {
              marginLeft: 6, fontFamily: F.mono, fontSize: 9.5,
              color: hot ? C.tally : C.boneFaint, letterSpacing: '0.08em',
            },
          }, hot ? 'PEAK' : ''),
        ]))
    }

    /** A minimal markdown renderer (headings, lists, bold, code, quotes, tables). */
    function Markdown(props) {
      const text = String(props.text ?? '')
      const blocks = text.split('\n')
      const rendered = []
      let listItems = []
      const flushList = () => {
        if (listItems.length === 0) return
        rendered.push(h('ul', {
          key: `ul${rendered.length}`,
          style: { margin: '6px 0 12px', paddingLeft: 20, lineHeight: 1.75 },
        }, listItems.map((item, index) => h('li', {
          key: `li${index}`,
          style: { fontSize: 13, color: C.boneDim, marginBottom: 3 },
        }, inline(item)))))
        listItems = []
      }
      for (const line of blocks) {
        const trimmed = line.trim()
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          listItems.push(trimmed.slice(2))
          continue
        }
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          flushList()
          const cells = trimmed.slice(1, -1).split('|').map(cell => cell.trim())
          const isHead = cells.every(cell => cell === '' || /^:?-{2,}:?$/.test(cell))
          if (isHead) continue
          rendered.push(h('div', {
            key: `tr${rendered.length}`,
            style: {
              display: 'flex', gap: 14, padding: '7px 0',
              borderBottom: `1px solid ${C.ruleSoft}`, fontSize: 12.5,
            },
          }, cells.map((cell, index) => h('div', {
            key: `td${index}`,
            style: { flex: index === 0 ? '0 0 26%' : '1 1 auto', color: index === 0 ? C.bone : C.boneDim, lineHeight: 1.6 },
          }, inline(cell)))))
          continue
        }
        flushList()
        if (trimmed === '') continue
        const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
        if (heading !== null) {
          const size = [19, 16.5, 15, 14][heading[1].length - 1]
          rendered.push(h('div', {
            key: `h${rendered.length}`,
            style: {
              fontFamily: F.voice, fontSize: size, fontWeight: 600,
              marginTop: 20, marginBottom: 8, color: C.bone,
              paddingBottom: heading[1].length === 2 ? 8 : 0,
              borderBottom: heading[1].length === 2 ? `1px solid ${C.rule}` : 'none',
            },
          }, inline(heading[2])))
          continue
        }
        if (trimmed.startsWith('> ')) {
          rendered.push(h('div', {
            key: `q${rendered.length}`,
            style: {
              borderLeft: `2px solid ${C.amber}`, paddingLeft: 14, margin: '10px 0',
              color: C.boneDim, fontFamily: F.voice, fontSize: 14, lineHeight: 1.7,
            },
          }, inline(trimmed.slice(2))))
          continue
        }
        rendered.push(h('div', {
          key: `p${rendered.length}`,
          style: { fontSize: 13, color: C.boneDim, lineHeight: 1.85, marginBottom: 10 },
        }, inline(trimmed)))
      }
      flushList()
      return h('div', { style: { lineHeight: 1.7 } }, rendered)
    }

    /** Inline markdown: `code`, **bold**, *italic*. */
    function inline(text) {
      const pieces = []
      const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
      let last = 0
      let match
      let key = 0
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) pieces.push(text.slice(last, match.index))
        const token = match[0]
        if (token.startsWith('`')) {
          pieces.push(h('code', {
            key: `i${key++}`,
            style: { ...S.mono, background: '#0F131A', padding: '2px 6px', borderRadius: 5, fontSize: 12, color: C.amber },
          }, token.slice(1, -1)))
        } else if (token.startsWith('**')) {
          pieces.push(h('strong', { key: `i${key++}`, style: { color: C.bone, fontWeight: 600 } }, token.slice(2, -2)))
        } else {
          pieces.push(h('em', { key: `i${key++}`, style: { color: C.boneFaint } }, token.slice(1, -1)))
        }
        last = match.index + token.length
      }
      if (last < text.length) pieces.push(text.slice(last))
      return pieces
    }

    /**
     * One statistic tile.
     *
     * 走 `h(...)` 而不是裸调用组件——裸调用时 React 没法给它 key
     * （key 不能从 props 透传，React 会把它摘掉）。这里用数据驱动
     * 的 map，每行自带 key，key 由 React 直接管理。
     *
     * @param {{key: string, label: string, value: string|number}} row
     */
    function statTile(row) {
      return h('div', {
        key: row.key,
        style: {
          background: C.ink850, border: `1px solid ${C.rule}`, borderRadius: 11,
          padding: '12px 14px',
        },
      }, [
        h('div', { key: 'v', style: { ...S.mono, fontSize: 19, color: C.bone, letterSpacing: '0.02em' } }, String(row.value)),
        h('div', { key: 'l', style: { fontSize: 11, color: C.boneFaint, marginTop: 3 } }, row.label),
      ])
    }

    // ── views ─────────────────────────────────────────────────────────────

    /**
     * A preview of archived material, styled as a sheet of paper.
     *
     * 归档之后**要看得见**。一个只显示「已归档 4820 字」的空卡片，
     * 等于让人不知道到底存了些什么——那正是准备阶段最需要的信息。
     */
    function PaperPreview(props) {
      const text = String(props.text ?? '')
      const limit = 460
      const excerpt = text.length > limit ? `${text.slice(0, limit)}…` : text
      const clipped = text.length > limit
      return h('div', {
        style: {
          position: 'relative', background: '#11151C', border: `1px solid ${C.rule}`,
          borderRadius: 10, padding: '14px 16px', minHeight: 74,
        },
      }, [
        h('div', {
          key: 't',
          style: {
            fontFamily: F.voice, fontSize: 13.5, lineHeight: 1.85, color: C.boneDim,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: clipped ? 196 : undefined, overflow: 'hidden',
          },
        }, excerpt === '' ? '（空）' : excerpt),
        clipped
          ? h('div', {
            key: 'f',
            style: {
              position: 'absolute', left: 1, right: 1, bottom: 1, height: 40, pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(17,21,28,0) 0%, #11151C 92%)',
            },
          })
          : null,
      ])
    }

    /**
     * The flow spine: where this session sits in the four-step arc.
     *
     * 一场面试要走四步：归档材料 → 底稿调研 → 面试中 → 评估表。
     * 把这条脊线画出来，用户一眼知道自己卡在哪——比任何提示文案都快。
     */
    function FlowSpine(props) {
      const steps = [
        { key: 'materials', label: '归档材料' },
        { key: 'research', label: '底稿调研' },
        { key: 'live', label: '面试中' },
        { key: 'review', label: '评估表' },
      ]
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 0, marginBottom: 18,
          padding: '11px 16px', borderRadius: 11, background: C.ink850,
          border: `1px solid ${C.rule}`, flexWrap: 'wrap',
        },
      }, [
        h('span', {
          key: 'label',
          style: { ...S.eyebrow, marginRight: 16, color: C.boneFaint },
        }, '流程'),
        ...steps.flatMap((step, index) => {
          const done = index < props.current
          const current = index === props.current
          const color = done ? C.jade : current ? C.amber : C.boneFaint
          const items = [
            h('span', {
              key: `s${step.key}`,
              style: {
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontSize: 12.5, color: current ? C.bone : done ? C.boneDim : C.boneFaint,
              },
            }, [
              h('span', {
                key: 'dot',
                style: {
                  width: 15, height: 15, borderRadius: 999, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontFamily: F.mono, fontSize: 9, lineHeight: 1,
                  border: `1px solid ${color}66`,
                  background: current ? `${color}22` : 'transparent',
                  color,
                },
              }, done ? '✓' : String(index + 1)),
              h('span', { key: 'l' }, step.label),
            ]),
          ]
          if (index < steps.length - 1) {
            items.push(h('span', {
              key: `sep${step.key}`,
              style: { width: 34, height: 1, background: C.rule, margin: '0 12px' },
            }))
          }
          return items
        }),
      ])
    }

    /** The preparation view: résumé, JD, and the interviewer's notes. */
    function PrepareView(props) {
      const { session, config, onChanged, notify } = props
      const [editing, setEditing] = useState({ resume: false, jd: false })
      const [resumeText, setResumeText] = useState('')
      const [jdText, setJdText] = useState('')
      const [jdUrl, setJdUrl] = useState('')
      const [busy, setBusy] = useState(false)
      const [jdNote, setJdNote] = useState(undefined)
      const profilesPoll = usePoll(
        () => apiGet('profiles'),
        10000,
        [],
        data => (data?.profiles ?? []).map(row => `${row.id}:${row.updatedAt}:${row.checklistCount}`).join(','),
      )

      const sessionId = session?.session?.id

      // **归档正文单独取一次。** 它跟着 1.5 秒的轮询传是纯浪费——
      // 简历几十 KB，而且只有准备页需要它。
      const docsPoll = usePoll(
        () => (sessionId === undefined ? Promise.resolve(undefined) : apiGet(`sessions/${sessionId}/documents`)),
        undefined,
        [sessionId],
      )

      const profiles = profilesPoll.data?.profiles ?? []

      // 拿到正文就填进编辑器（正在编辑时不动用户的光标）。
      useEffect(() => {
        const documents = docsPoll.data
        if (documents === undefined) return
        if (!editing.resume) setResumeText(documents.resume ?? '')
        if (!editing.jd) setJdText(documents.jd ?? '')
        setJdUrl(previous => previous === '' ? (documents.jdMeta?.url ?? '') : previous)
      }, [docsPoll.data])

      const applyProfile = useCallback(async profileId => {
        setBusy(true)
        try {
          const result = await apiPost(`profiles/${profileId}/apply`, { sessionId })
          notify(`已继承档案「${result.title}」的 ${result.items} 个考点`, '继承来的考点会被标记出来。', 'ok')
          onChanged()
        } catch (failure) {
          notify('继承失败', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, onChanged, notify])

      const syncProfile = useCallback(async profileId => {
        setBusy(true)
        try {
          const result = await apiPost(`profiles/${profileId}/sync`, { sessionId })
          notify(`已回写档案（${result.items} 个考点）`, '下次面同一个岗位就有基线了。', 'ok')
          onChanged()
        } catch (failure) {
          notify('回写失败', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, onChanged, notify])

      const saveResume = useCallback(async () => {
        setBusy(true)
        try {
          await apiPost(`sessions/${sessionId}/resume`, { text: resumeText })
          setEditing(previous => ({ ...previous, resume: false }))
          notify('简历已归档', '助手现在读得到它了。', 'ok')
          onChanged()
          void docsPoll.refresh()
        } catch (failure) {
          notify('简历没存上', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, resumeText, onChanged, notify, docsPoll])

      const saveJd = useCallback(async () => {
        setBusy(true)
        try {
          await apiPost(`sessions/${sessionId}/jd`, { text: jdText, url: jdUrl })
          setEditing(previous => ({ ...previous, jd: false }))
          notify('JD 已归档', 'ok')
          onChanged()
          void docsPoll.refresh()
        } catch (failure) {
          notify('JD 没存上', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, jdText, jdUrl, onChanged, notify, docsPoll])

      const fetchJd = useCallback(async () => {
        if (jdUrl.trim() === '') return
        setBusy(true)
        setJdNote(undefined)
        try {
          const result = await apiPost('jd/fetch', { url: jdUrl.trim() })
          if (result.ok === true) {
            setJdText(result.text)
            await apiPost(`sessions/${sessionId}/jd`, {
              text: result.text,
              url: result.url,
              meta: { title: result.title, sections: result.sections, warnings: [] },
            })
            setEditing(previous => ({ ...previous, jd: false }))
            setJdNote({ ok: true, text: `抓到了：${result.text.length} 字${result.title !== '' ? `（${result.title}）` : ''}` })
            onChanged()
            void docsPoll.refresh()
          } else {
            setJdNote({ ok: false, text: `${result.error}。${result.hint}` })
          }
        } catch (failure) {
          setJdNote({ ok: false, text: failure instanceof Error ? failure.message : String(failure) })
        } finally {
          setBusy(false)
        }
      }, [jdUrl, sessionId, onChanged, docsPoll])

      const uploadResume = useCallback(async event => {
        const file = event.target.files?.[0]
        if (file === undefined) return
        setBusy(true)
        try {
          const dataBase64 = await readFileAsBase64(file)
          const result = await apiPost('resume/extract', { filename: file.name, mimeType: file.type, dataBase64 })
          if (result.ok === true) {
            setResumeText(result.text)
            await apiPost(`sessions/${sessionId}/resume`, { text: result.text })
            setEditing(previous => ({ ...previous, resume: false }))
            notify(`简历读到了 ${result.chars} 字`, result.warnings.length > 0 ? result.warnings.join(' ') : 'ok')
            onChanged()
            void docsPoll.refresh()
          } else {
            notify('这份文件读不出文字', result.warnings.join(' '), 'error')
          }
        } catch (failure) {
          notify('上传失败', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
          event.target.value = ''
        }
      }, [sessionId, onChanged, notify, docsPoll])

      const uploadJd = useCallback(async event => {
        const file = event.target.files?.[0]
        if (file === undefined) return
        setBusy(true)
        try {
          const dataBase64 = await readFileAsBase64(file)
          const result = await apiPost('resume/extract', { filename: file.name, mimeType: file.type, dataBase64 })
          if (result.ok === true) {
            setJdText(result.text)
            await apiPost(`sessions/${sessionId}/jd`, { text: result.text, url: jdUrl })
            setEditing(previous => ({ ...previous, jd: false }))
            notify(`JD 读到了 ${result.chars} 字`, 'ok')
            onChanged()
            void docsPoll.refresh()
          } else {
            notify('这份文件读不出文字', result.warnings.join(' '), 'error')
          }
        } catch (failure) {
          notify('上传失败', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
          event.target.value = ''
        }
      }, [sessionId, jdUrl, onChanged, notify, docsPoll])

      const checklist = session?.checklist?.items ?? []
      const probed = checklist.filter(item => item.probed === true).length
      const resumeArchived = (session?.documents?.resumeChars ?? 0) > 0
      const jdArchived = (session?.documents?.jdChars ?? 0) > 0

      // 现在走到第几步：材料没归档 → 0；底稿没出来 → 1；在面试 → 2；有报告 → 3。
      const flowStep = !resumeArchived || !jdArchived
        ? 0
        : checklist.length === 0
          ? 1
          : (session?.report ?? '') !== '' ? 3 : 2

      /** One material slot: preview by default, editor on demand. */
      const material = (options) => {
        const open = options.editing
        return h('div', { key: options.key }, [
          open
            ? h('div', { key: 'k2' }, [
              h(Area, {key: 'k4', 
                label: options.label,
                value: options.value,
                placeholder: options.placeholder,
                onChange: options.onChange,
              }),
              h('div', { key: 'act', style: S.row }, [
                h('button', {
                  key: 'save',
                  style: S.btn('primary', busy || options.value.trim() === ''),
                  onClick: options.onSave,
                }, options.saveLabel),
                h('button', {
                  key: 'cancel',
                  style: S.btn(false, busy),
                  onClick: options.onCancel,
                }, '取消'),
                options.upload !== undefined ? options.upload : null,
              ]),
            ])
            : h('div', { key: 'k3' }, [
              options.archived
                ? h(PaperPreview, { key: 'p', text: options.archivedText })
                : h('div', {
                  key: 'empty',
                  style: {
                    border: `1px dashed ${C.rule}`, borderRadius: 10, padding: '18px 16px',
                    color: C.boneFaint, fontSize: 12, lineHeight: 1.7,
                    display: 'flex', alignItems: 'center', gap: 12,
                  },
                }, options.emptyHint),
              h('div', { key: 'act', style: { ...S.row, marginTop: 12 } }, [
                options.archived
                  ? h('button', { key: 'e', style: S.btn(false, busy), onClick: options.onEdit }, '修改')
                  : null,
                options.upload !== undefined ? options.upload : null,
                options.archived
                  ? h('span', { key: 'n', style: S.hint }, options.archivedNote)
                  : null,
              ]),
            ]),
        ])
      }

      const uploadResumeLabel = h('label', { key: 'up', style: { ...S.btn(false, busy), display: 'inline-block' } }, [
        '上传文件',
        h('input', {
          key: 'i', type: 'file', accept: '.txt,.md,.json,.docx,.pdf,text/plain,text/markdown',
          style: { display: 'none' }, onChange: uploadResume,
        }),
      ])
      const uploadJdLabel = h('label', { key: 'up', style: { ...S.btn(false, busy), display: 'inline-block' } }, [
        '上传 JD',
        h('input', {
          key: 'i', type: 'file', accept: '.txt,.md,.json,.docx,.pdf',
          style: { display: 'none' }, onChange: uploadJd,
        }),
      ])

      const resumeSlot = material({
        key: 'resume',
        editing: editing.resume,
        value: resumeText,
        archived: resumeArchived,
        archivedText: resumeText,
        archivedNote: `卷内已有 ${session?.documents?.resumeChars} 字`,
        label: '简历正文',
        placeholder: '把简历正文粘到这里……',
        emptyHint: '还没有简历。投一个文件，或把正文粘进来——助手需要它才能出题。',
        saveLabel: '归档简历',
        onChange: setResumeText,
        onSave: saveResume,
        onCancel: () => setEditing(previous => ({ ...previous, resume: false })),
        onEdit: () => setEditing(previous => ({ ...previous, resume: true })),
        upload: resumeArchived ? undefined : uploadResumeLabel,
      })

      const jdSlot = material({
        key: 'jd',
        editing: editing.jd,
        value: jdText,
        archived: jdArchived,
        archivedText: jdText,
        archivedNote: `卷内已有 ${session?.documents?.jdChars} 字`,
        label: 'JD 正文',
        placeholder: '把岗位描述粘到这里……',
        emptyHint: '还没有 JD。贴一个链接让它自己抓，或者直接粘正文。',
        saveLabel: '归档 JD',
        onChange: setJdText,
        onSave: saveJd,
        onCancel: () => setEditing(previous => ({ ...previous, jd: false })),
        onEdit: () => setEditing(previous => ({ ...previous, jd: true })),
        upload: uploadJdLabel,
      })

      return h('div', { style: { maxWidth: 1180 } }, [
        h(FlowSpine, { key: 'spine', current: flowStep }),
        h('div', {
          key: 'grid',
          style: {
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))',
            alignItems: 'start',
          },
        }, [
          // ── 左栏：卷内材料 ──────────────────────────────────────────
          h('div', { key: 'left' }, [
            h(Section, {key: 'k5', 
              step: '01',
              title: '简历',
              extra: h('span', { style: S.hint }, resumeArchived ? `已归档 ${session.documents.resumeChars} 字` : '待归档'),
            }, [resumeSlot]),

            h(Section, {key: 'k6', 
              step: '02',
              title: '目标岗位 JD',
              extra: h('span', { style: S.hint }, jdArchived ? `已归档 ${session.documents.jdChars} 字` : '待归档'),
            }, [
              h('div', { key: 'link', style: { ...S.row, marginBottom: 14, alignItems: 'flex-end' } }, [
                h('div', { key: 'f', style: { flex: '1 1 260px' } }, [
                  h(Field, {key: 'k7', 
                    label: '岗位链接（抓不到会自动给手动兜底）',
                    value: jdUrl,
                    placeholder: 'https://…',
                    onChange: setJdUrl,
                  }),
                ]),
                h('button', { key: 'f2', style: S.btn(false, busy || jdUrl.trim() === ''), onClick: fetchJd }, '抓取'),
              ]),
              jdNote !== undefined
                ? h('div', {
                  key: 'note',
                  style: {
                    padding: '10px 13px', borderRadius: 9, marginBottom: 14, fontSize: 12, lineHeight: 1.6,
                    border: `1px solid ${jdNote.ok ? 'rgba(79,169,140,0.35)' : 'rgba(217,164,65,0.35)'}`,
                    background: jdNote.ok ? 'rgba(79,169,140,0.08)' : 'rgba(217,164,65,0.08)',
                    color: jdNote.ok ? C.jade : C.amber,
                  },
                }, jdNote.text)
                : null,
              jdSlot,
            ]),
          ]),

          // ── 右栏：底稿与档案 ────────────────────────────────────────
          h('div', { key: 'right' }, [
            h(Section, {key: 'k8', 
              step: '03',
              title: '面试官底稿',
              extra: h('span', { style: S.hint }, '考点清单 · 面试官才看得到'),
            }, [
              h(Disclosure, {key: 'k10', 
                summary: '考点清单',
                badge: `${probed}/${checklist.length}`,
                defaultOpen: false,
              }, [
                h('div', { key: 'note', style: { ...S.hint, marginBottom: 12, lineHeight: 1.7 } },
                  '这是面试官的底稿。真实面试里你看不到它——所以默认收起，需要时再展开。'),
                h('div', { key: 'list' }, checklist.map(item => h(ChecklistRow, { key: item.id, item }))),
                session?.stats?.adjustments > 0
                  ? h('div', { key: 'adj', style: { ...S.hint, marginTop: 12 } },
                    `面试中调整过 ${session.stats.adjustments} 次——每一次调整都记了理由，事后复盘会用到。`)
                  : null,
              ]),
              // 收起状态也得有话说，否则这张卡是空的。
              h('div', { key: 'status', style: { ...S.hint, marginTop: 12, lineHeight: 1.7 } },
                checklist.length === 0
                  ? '还没有底稿。在 DSH 对话里让助手用 interview-prep 技能基于简历与 JD 做调研，产出后用 interview_save_checklist 落盘。'
                  : `底稿共 ${checklist.length} 项，已问 ${probed} 项。面试中助手按它动态深挖——具体题目你看不到，那才是真实面试的样子。`),
            ]),

            h(Section, {key: 'k9', 
              title: '岗位档案',
              extra: h('span', { style: S.hint }, '同一个岗位第二次面试，直接继承上次的底稿'),
            }, [
              profiles.length === 0
                ? h('div', {key: 'k27',  style: S.hint },
                  '还没有岗位档案。面试完一场后，在 DSH 对话里让助手用 interview_save_profile 把它归档下来；或者用 interview_sync_profile 回写。')
                : h('div', { key: 'list' }, profiles.map(profile => h('div', {
                  key: profile.id,
                  style: {
                    display: 'flex', gap: 14, alignItems: 'center', padding: '12px 0',
                    borderBottom: `1px solid ${C.ruleSoft}`,
                  },
                }, [
                  h('div', { key: 'body', style: { flex: '1 1 auto', minWidth: 0 } }, [
                    h('div', { key: 't', style: { fontSize: 13, color: C.bone } }, profile.title),
                    h('div', { key: 'm', style: { fontSize: 11, color: C.boneFaint, marginTop: 3, fontFamily: F.mono } },
                      `${profile.checklistCount} 考点 · ${profile.sessions.length} 场 · JD ${profile.jdChars} 字`),
                  ]),
                  h('button', { key: 'b', style: S.btn(false, busy), onClick: () => applyProfile(profile.id) }, '继承底稿'),
                ]))),
              session?.session?.profileId !== undefined && session?.session?.profileId !== ''
                ? h('div', { key: 'sync', style: { ...S.row, marginTop: 14 } }, [
                  h('span', { key: 'n', style: S.hint }, `本场已关联档案 ${session.session.profileId}`),
                  h('button', { key: 'b', style: S.btn(false, busy), onClick: () => syncProfile(session.session.profileId) }, '把本场回写进档案'),
                ])
                : null,
            ]),
          ]),
        ]),
      ])
    }

    /** The live interview view: the stage is the main event. */
    function LiveView(props) {
      const { session, config, onChanged, notify } = props
      const media = useMedia()
      const recorder = useRecorder(media.stream)
      // 服务端识别要**纯音频**：从音视频合流里单独取音轨。
      const audioOnly = useMemo(() => {
        if (media.stream === undefined) return undefined
        const tracks = media.stream.getAudioTracks()
        return tracks.length > 0 ? new MediaStream(tracks) : undefined
      }, [media.stream])
      const audioRecorder = useRecorder(audioOnly)
      const asrStatus = usePoll(() => apiGet('asr'), undefined, [])
      const tts = useTts()
      const videoRef = useRef(null)
      const [answer, setAnswer] = useState('')
      const [speaking, setSpeaking] = useState(false)
      const lastQuestionRef = useRef('')

      const asr = useAsr((text) => {
        if (text !== '') setAnswer(text)
      })

      // 摄像头画面挂到 <video> 上。
      useEffect(() => {
        const element = videoRef.current
        if (element === null || element === undefined) return
        element.srcObject = media.stream ?? null
      }, [media.stream])

      const transcript = session?.transcript ?? []
      const lastQuestion = useMemo(() => {
        for (let index = transcript.length - 1; index >= 0; index -= 1) {
          if (transcript[index].role === 'interviewer') return transcript[index]
        }
        return undefined
      }, [transcript])

      const questionIndex = useMemo(() => {
        let count = 0
        for (const row of transcript) if (row.role === 'interviewer') count += 1
        return count
      }, [transcript])

      // 新问题自动朗读（可关）。
      useEffect(() => {
        if (lastQuestion === undefined) return
        if (!speaking) return
        if (lastQuestion.text === lastQuestionRef.current) return
        lastQuestionRef.current = lastQuestion.text
        if (config?.ttsProvider !== 'none') tts.speak(lastQuestion.text, { rate: config?.ttsRate ?? 1 })
      }, [lastQuestion, speaking, tts, config])

      const submitAnswer = useCallback(async () => {
        const text = answer.trim()
        if (text === '') return
        try {
          await apiPost(`sessions/${session.session.id}/turn`, { role: 'candidate', text, meta: { source: 'panel' } })
          setAnswer('')
          onChanged()
          notify('回答已记录', 'ok')
        } catch (failure) {
          notify('没记上', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [answer, session?.session?.id, onChanged, notify])

      const copyAnswer = useCallback(async () => {
        const text = answer.trim()
        if (text === '') return
        try {
          await navigator.clipboard.writeText(text)
          notify('已复制', '粘到 DSH 对话框里发给助手。', 'ok')
        } catch {
          notify('复制失败', '浏览器拒绝了剪贴板权限，手动选中文本复制。', 'error')
        }
      }, [answer, notify])

      /** Save the recorded clip to this machine (never uploaded anywhere else). */
      const saveClip = useCallback(async () => {
        if (recorder.clip === undefined) return
        try {
          const dataBase64 = await blobToBase64(recorder.clip.blob)
          await apiPost(`sessions/${session.session.id}/recording`, {
            kind: media.stream?.getVideoTracks().length > 0 ? 'video' : 'audio',
            mimeType: recorder.clip.mimeType,
            dataBase64,
          })
          recorder.reset()
          notify('已保存到本机', '片段留在本场面试的卷宗目录里。', 'ok')
          onChanged()
        } catch (failure) {
          notify('保存失败', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [recorder, session?.session?.id, media.stream, onChanged, notify])

      /** Send the recorded clip to the server-side recognizer. */
      const transcribeClip = useCallback(async () => {
        if (audioRecorder.clip === undefined) return
        try {
          // 浏览器只会录 webm/opus，而识别服务要 wav/aiff/flac/m4a/mp3/aac/opus。
          // **先转成 16 kHz 单声道 WAV 再上传**，否则服务端直接 400。
          let dataBase64
          let mimeType = 'audio/wav'
          let filename = 'clip.wav'
          try {
            const arrayBuffer = await audioRecorder.clip.blob.arrayBuffer()
            const decoded = await decodeToMono16k(arrayBuffer)
            dataBase64 = bufferToBase64(encodeWav(decoded.samples, decoded.sampleRate))
          } catch (failure) {
            // 转码失败就退回原始格式——OpenAI 兼容接口接受 webm，
            // 但如果服务端不收，用户会看到明确的报错而不是静默失败。
            dataBase64 = await blobToBase64(audioRecorder.clip.blob)
            mimeType = audioRecorder.clip.mimeType
            filename = 'clip.webm'
            notify('没转成 WAV，按原始格式上传', failure instanceof Error ? failure.message : String(failure))
          }
          const result = await apiPost('asr/transcribe', { dataBase64, mimeType, filename })
          if (result.ok === true) {
            setAnswer(previous => `${previous}${previous.trim() === '' ? '' : ' '}${result.text}`)
            audioRecorder.reset()
            notify('识别完成', '文本已追加到回答草稿，可以改。', 'ok')
          } else {
            notify('识别没成功', (result.warnings ?? []).join(' ') || result.reason || '', 'error')
          }
        } catch (failure) {
          notify('识别失败', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [audioRecorder, notify])

      const startInterview = useCallback(async () => {
        try {
          await apiPost(`sessions/${session.session.id}/start`, {})
          onChanged()
        } catch (failure) {
          notify('没能开始', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [session?.session?.id, onChanged, notify])

      const finishInterview = useCallback(async () => {
        try {
          await apiPost(`sessions/${session.session.id}/finish`, {})
          onChanged()
          notify('面试已结束', '去「报告」页让助手写分析。', 'ok')
        } catch (failure) {
          notify('没能结束', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [session?.session?.id, onChanged, notify])

      const running = session?.session?.status === 'running'
      const hasVideo = media.stream !== undefined
      const title = session?.session?.title ?? '面试'
      const questionText = lastQuestion?.text

      /**
       * The **lower third**: the question, laid over the bottom of the frame.
       *
       * 为什么提问要压在画面上而不是放在旁边的框里——因为在真实的线上面试里，
       * 提问是**对面那个人说的**，它和你的人像在同一块画面上。把它挪进侧栏，
       * 它就变成了「界面上的一个字段」，面试的现场感就没了。
       */
      const lowerThird = h('div', {
        key: 'cue',
        style: {
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '54px 26px 20px',
          background: 'linear-gradient(180deg, rgba(7,9,13,0) 0%, rgba(7,9,13,0.82) 46%, rgba(7,9,13,0.96) 100%)',
          pointerEvents: 'none',
        },
      }, [
        h('div', {
          key: 'rule',
          style: {
            borderLeft: `3px solid ${questionText === undefined ? C.rule : C.amber}`,
            paddingLeft: 16,
          },
        }, [
          h('div', {
            key: 'eyebrow',
            style: { ...S.eyebrow, color: questionText === undefined ? C.boneFaint : C.amber, marginBottom: 7 },
          }, questionText === undefined ? '等待提问' : `第 ${questionIndex} 问`),
          h('div', {
            key: 'text',
            style: {
              fontFamily: F.voice, fontSize: 19, lineHeight: 1.58, color: C.bone,
              letterSpacing: '0.005em', maxHeight: 132, overflow: 'hidden',
            },
          }, questionText === undefined
            ? '助手还没提问。在 DSH 对话区让它开始——它每问一轮，这里就会更新。'
            : questionText),
        ]),
      ])

      /** The stage: video when we have it, a designed "not connected" plate when we don't. */
      const stage = h('div', {
        key: 'stage',
        style: {
          position: 'relative', flex: '1 1 auto', minWidth: 0, minHeight: 260,
          borderRadius: 14, overflow: 'hidden', background: '#0A0D11',
          border: `1px solid ${C.rule}`,
        },
      }, [
        h('video', {
          key: 'v',
          ref: videoRef,
          autoPlay: true,
          muted: true,
          playsInline: true,
          style: {
            width: '100%', height: '100%', objectFit: 'cover',
            transform: 'scaleX(-1)', display: hasVideo ? 'block' : 'none',
          },
        }),
        hasVideo
          ? null
          : h('div', {
            key: 'plate',
            style: {
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16, padding: 30,
              background: 'radial-gradient(circle at 50% 38%, #171E28 0%, #0C0F14 62%, #090B0E 100%)',
            },
          }, [
            h('div', {
              key: 'mono',
              style: {
                width: 104, height: 104, borderRadius: 999, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${C.rule}`, background: C.ink850,
                fontFamily: F.voice, fontSize: 29, color: C.boneFaint, letterSpacing: '0.04em',
              },
            }, initialsOf(title)),
            h('div', { key: 'who', style: { textAlign: 'center', maxWidth: 420 } }, [
              h('div', { key: 't', style: { fontFamily: F.voice, fontSize: 16, color: C.boneDim } }, title),
              h('div', { key: 's', style: { ...S.hint, marginTop: 6 } },
                media.error === undefined
                  ? '摄像头未接通——面试照常进行，键盘输入随时可用'
                  : '摄像头未接通——面试照常进行，键盘输入随时可用'),
            ]),
            media.error !== undefined
              ? h('div', {
                key: 'err',
                style: {
                  maxWidth: 460, textAlign: 'center', padding: '11px 15px', borderRadius: 10,
                  border: `1px solid ${media.error.kind === 'denied' ? 'rgba(224,86,63,0.3)' : 'rgba(217,164,65,0.3)'}`,
                  background: media.error.kind === 'denied' ? 'rgba(224,86,63,0.07)' : 'rgba(217,164,65,0.07)',
                },
              }, [
                h('div', {
                  key: 't',
                  style: { fontSize: 12.5, color: media.error.kind === 'denied' ? C.tally : C.amber, marginBottom: 5 },
                }, media.error.text),
                h('div', { key: 'a', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.65 } }, media.error.action),
              ])
              : null,
            h('div', { key: 'act', style: S.row }, [
              h('button', {
                key: 'ask',
                style: S.btn('primary', media.busy),
                onClick: () => { void media.start() },
              }, media.busy ? '正在申请…' : '申请摄像头与麦克风'),
              media.permission?.camera === 'denied' || media.permission?.microphone === 'denied'
                ? h('button', {
                  key: 'retry',
                  style: S.btn(false, media.busy),
                  onClick: () => { void media.probe().then(() => media.start()) },
                }, '重新检测授权状态')
                : null,
            ]),
          ]),
        // 录制指示灯：只有真正在录的时候才亮。
        recorder.recording
          ? h('div', {
            key: 'rec',
            style: { position: 'absolute', top: 16, left: 16 },
          }, h(Tally, { on: true }))
          : null,
        // 计时器：右上角，等宽数字。
        h('div', {
          key: 'clock',
          style: {
            position: 'absolute', top: 14, right: 16, display: 'flex', alignItems: 'center', gap: 12,
            padding: '5px 11px', borderRadius: 8, background: 'rgba(10,13,17,0.72)',
            border: `1px solid ${C.rule}`,
          },
        }, [
          h('span', { key: 't', style: { ...S.mono, fontSize: 12, color: C.boneDim, letterSpacing: '0.06em' } },
            formatClock(session?.stats?.durationMs ?? 0)),
          h(Tally, { key: 'r', on: recorder.recording }),
        ]),
        lowerThird,
      ])

      return h('div', { style: { display: 'flex', gap: 16, flex: '1 1 auto', minHeight: 0 } }, [
        // ── 左：舞台 + 回答 ────────────────────────────────────────────
        h('div', {
          key: 'left',
          style: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 },
        }, [
          stage,
          h('div', {
            key: 'ans',
            style: {
              flex: '0 0 auto',
              background: C.ink850, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '14px 16px',
            },
          }, [
            h('div', { key: 'h', style: { ...S.eyebrow, marginBottom: 9 } }, '我的回答'),
            h('textarea', {
              key: 't',
              style: { ...S.textarea, minHeight: 96 },
              value: answer,
              placeholder: '说话或打字。提交后进入速记，成为事后分析的事实来源。',
              onChange: event => setAnswer(event.target.value),
            }),
            h('div', { key: 'a', style: { ...S.row, marginTop: 11 } }, [
              h('button', { key: 's', style: S.btn('primary', answer.trim() === ''), onClick: submitAnswer }, '提交回答'),
              h('button', { key: 'c', style: S.btn(false, answer.trim() === ''), onClick: copyAnswer }, '复制'),
              h('div', { key: 'sp', style: { marginLeft: 'auto', display: 'flex', gap: 8 } }, [
                running
                  ? h('button', { key: 'f', style: S.btn(false, false), onClick: finishInterview }, '结束面试')
                  : h('button', { key: 's', style: S.btn('primary', false), onClick: startInterview }, '开始面试'),
              ]),
            ]),
          ]),
        ]),

        // ── 右：控件 + 速记 ────────────────────────────────────────────
        h('div', {
          key: 'rail',
          style: { flex: '0 0 396px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
        }, [
          h('div', {
            key: 'ctrl',
            style: {
              flex: '0 0 auto',
              background: C.ink850, border: `1px solid ${C.rule}`, borderRadius: 12,
              padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 13,
            },
          }, [
            // 画面这一组：摄像头 + 录像。
            h('div', { key: 'g1' }, [
              h('div', { key: 'gh', style: { ...S.eyebrow, marginBottom: 8 } }, '画面'),
              h('div', { key: 'gr', style: S.row }, [
                h('button', {
                  key: 'cam',
                  style: S.btn(false, false),
                  onClick: () => (media.stream === undefined ? void media.start() : media.stop()),
                }, media.stream === undefined ? '开摄像头' : '关摄像头'),
                h('button', {
                  key: 'rec',
                  style: S.btn(recorder.recording ? 'tally' : false, media.stream === undefined),
                  onClick: () => (recorder.recording ? recorder.stop() : recorder.start()),
                }, recorder.recording ? '停止录制' : '开始录制'),
                recorder.clip !== undefined
                  ? h('button', { key: 'save', style: S.btn('primary', false), onClick: saveClip }, '保存录像')
                  : null,
              ]),
            ]),

            // 声音这一组：录音 + 识别 + 朗读。
            h('div', { key: 'g2' }, [
              h('div', { key: 'gh', style: { ...S.eyebrow, marginBottom: 8 } }, '声音'),
              h('div', { key: 'gr', style: S.row }, [
                h('button', {
                  key: 'arec',
                  style: S.btn(audioRecorder.recording ? 'tally' : false, media.stream === undefined),
                  onClick: () => (audioRecorder.recording ? audioRecorder.stop() : audioRecorder.start()),
                }, audioRecorder.recording ? '停止录音' : '录一段'),
                h('button', {
                  key: 'asr',
                  style: S.btn(asr.active ? 'tally' : false, !asr.supported),
                  onClick: () => (asr.active ? asr.stop() : asr.start()),
                }, asr.active ? '停止识别' : '语音识别'),
                h('button', {
                  key: 'tts',
                  style: S.btn(false, !tts.supported),
                  onClick: () => {
                    if (speaking) {
                      tts.cancel()
                      setSpeaking(false)
                      return
                    }
                    setSpeaking(true)
                    if (questionText !== undefined) {
                      tts.speak(questionText, { rate: config?.ttsRate ?? 1 })
                      lastQuestionRef.current = questionText
                    }
                  },
                }, speaking ? '关闭朗读' : '朗读问题'),
              ]),
              audioRecorder.clip !== undefined
                ? h('button', {
                  key: 'trans',
                  style: { ...S.btn('primary', false), marginTop: 9 },
                  onClick: transcribeClip,
                }, '识别这段录音')
                : null,
            ]),

            h('div', { key: 'meter' }, [
              h('div', {
                key: 'h',
                style: { ...S.label, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
              }, [
                h('span', { key: 'l' }, asr.active ? '正在聆听…' : '输入电平'),
                h('span', { key: 'r', style: { color: asr.active ? C.jade : C.boneFaint } }, asr.active ? '识别中' : '待命'),
              ]),
              h(SegmentedMeter, { key: 'm', level: media.level }),
            ]),

            // 权限错误**不在这里再说一遍**——舞台上的红框已经把话说全了，
            // 同一句话出现在两个地方只会让人以为出了两个问题。
            asr.error !== undefined
              ? h('div', { key: 'ae', style: { fontSize: 11.5, color: C.amber, lineHeight: 1.6 } }, asr.error)
              : null,
            asr.interim !== ''
              ? h('div', { key: 'ai', style: { fontSize: 11.5, color: C.boneFaint, fontStyle: 'italic' } }, asr.interim)
              : null,
            asrStatus.data?.reason !== undefined
              ? h('div', { key: 'asr', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.6 } },
                `识别链路：${asrStatus.data.mode === 'server' ? `服务端 ${asrStatus.data.provider ?? ''} ${asrStatus.data.model ?? ''}` : '浏览器识别'} —— ${asrStatus.data.reason}`)
              : null,
          ]),

          // 速记：右栏的常驻滚动区。
          h('div', {
            key: 'tr',
            style: {
              flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
              background: C.ink850, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '14px 16px',
            },
          }, [
            h('div', {
              key: 'h',
              style: { ...S.eyebrow, marginBottom: 10, display: 'flex', justifyContent: 'space-between' },
            }, [
              h('span', { key: 't' }, '速记'),
              h('span', { key: 'n', style: { color: C.boneFaint } }, `${transcript.length} 轮`),
            ]),
            transcript.length === 0
              ? h('div', { key: 'e', style: S.hint }, '还没有转录。')
              : h('div', { key: 'l' }, transcript.map((row, index) => h('div', {
                key: `${row.ts}-${index}`,
                style: {
                  display: 'flex', gap: 10, padding: '7px 0', alignItems: 'flex-start',
                  borderBottom: `1px solid ${C.ruleSoft}`,
                },
              }, [
                h('span', {
                  key: 't',
                  style: { ...S.mono, fontSize: 10.5, color: C.boneFaint, flex: '0 0 auto', paddingTop: 2 },
                }, formatTime(row.ts)),
                h('span', {
                  key: 'r',
                  style: S.pill(row.role === 'interviewer' ? C.amber : row.role === 'candidate' ? C.jade : C.boneFaint),
                }, row.role === 'interviewer' ? '问' : row.role === 'candidate' ? '答' : '系统'),
                h('span', { key: 'x', style: { fontSize: 12.5, color: C.boneDim, lineHeight: 1.65 } }, row.text),
              ]))),
          ]),
        ]),
      ])
    }

    /** The report view. */
    function ReportView(props) {
      const { session, onChanged, notify } = props
      const report = session?.report ?? ''

      return h('div', { style: { maxWidth: 1180 } }, [
        h('div', {
          key: 'grid',
          style: {
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(430px, 1fr))',
            alignItems: 'start',
          },
        }, [
        h('div', { key: 'body' }, [
        h(Section, {key: 'k12', 
          title: '评估表',
          extra: h('span', { style: S.hint }, report !== '' ? `已生成 ${report.length} 字` : '待生成'),
        }, [
          report !== ''
            ? h(Markdown, { key: 'md', text: report })
            : h('div', { key: 'e', style: { ...S.hint, lineHeight: 1.75 } },
              '还没有报告。在 DSH 对话里让助手用 interview-conduct 技能收尾，它会调 interview_finish 把分析写进来。'),
        ]),
        ]),
        h('div', { key: 'side' }, [
        h(Section, {key: 'k13',  title: '卷内统计' }, [
          h('div', {key: 'k15',  style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 } },
            [
              { key: 'st-asked', label: '提问', value: session?.stats?.asked ?? 0 },
              { key: 'st-answered', label: '回答', value: session?.stats?.answered ?? 0 },
              { key: 'st-cover', label: '考点覆盖', value: `${session?.stats?.checklistProbed ?? 0}/${session?.stats?.checklistTotal ?? 0}` },
              { key: 'st-adj', label: '底稿调整', value: session?.stats?.adjustments ?? 0 },
              { key: 'st-dur', label: '时长', value: formatClock(session?.stats?.durationMs ?? 0) },
            ].map(row => statTile(row))),
        ]),
        h(Section, {key: 'k14',  title: '卷宗材料' }, [
          (session?.recordings ?? []).length === 0
            ? h('div', {key: 'k16',  style: S.hint }, '没有保存过录像或录音片段。')
            : h('div', { key: 'l' }, (session.recordings ?? []).map(item => h('div', {
              key: item.name,
              style: { display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.ruleSoft}` },
            }, [
              h('span', { key: 'k', style: S.pill(item.kind === 'video' ? C.amber : C.jade) }, item.kind === 'video' ? '录像' : '录音'),
              h('span', { key: 'n', style: { flex: '1 1 auto', color: C.boneDim, fontSize: 12 } }, item.name),
              h('span', { key: 's', style: { ...S.mono, color: C.boneFaint, fontSize: 11 } }, formatBytes(item.bytes)),
            ]))),
        ]),
        ]),
        ]),
      ])
    }

    // ── panel ─────────────────────────────────────────────────────────────

    /** The whole panel. */
    function Interviewer() {
      const [tab, setTab] = useState('prepare')
      const [selected, setSelected] = useState(undefined)
      const [notice, setNotice] = useState(undefined)

      const notify = useCallback((title, detail, kind = 'info') => {
        setNotice({ title, detail, kind, at: Date.now() })
      }, [])

      const sessionsPoll = usePoll(
        () => apiGet('sessions'),
        6000,
        [],
        data => (data?.sessions ?? []).map(row => `${row.id}:${row.updatedAt}:${row.checklistCount}:${row.probedCount}:${row.hasReport}`).join(','),
      )
      const configPoll = usePoll(() => apiGet('config'), undefined, [])

      const config = configPoll.data

      // 默认选中最近一场。
      useEffect(() => {
        const rows = sessionsPoll.data?.sessions ?? []
        if (selected === undefined && rows.length > 0) setSelected(rows[0].id)
      }, [sessionsPoll.data, selected])

      const sessionPoll = usePoll(
        () => (selected === undefined ? Promise.resolve(undefined) : apiGet(`sessions/${selected}`)),
        selected === undefined ? null : (tab === 'live' ? POLL_MS : 6000),
        [selected],
        // **内容没变就不重渲染**——面试中每 1.5 秒轮询一次，
        // 每次都重建整个面板（含几百行转录）就是卡顿的来源。
        data => data?.revision,
      )

      const session = sessionPoll.data

      const refreshAll = useCallback(() => {
        void sessionsPoll.refresh()
        void sessionPoll.refresh()
      }, [sessionsPoll, sessionPoll])

      const createSession = useCallback(async () => {
        try {
          const result = await apiPost('sessions', {})
          setSelected(result.session.id)
          setTab('prepare')
          notify('新面试已建好', '先放简历和 JD，再让助手做底稿调研。', 'ok')
          refreshAll()
        } catch (failure) {
          notify('建不了', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, refreshAll])

      const rows = sessionsPoll.data?.sessions ?? []

      return h('div', { style: S.page }, [
        h('div', {key: 'k17',  style: S.head }, [
          h('div', {key: 'k19',  style: { minWidth: 0 } }, [
            h('div', {key: 'k21',  style: S.title }, '模拟面试间'),
            h('div', {key: 'k22',  style: S.sub }, '简历 + JD → 一场有准备的面试'),
            config?.workspaceRoot !== undefined
              ? h('div', {
                key: 'w',
                style: S.workspace,
                title: `${config.workspaceRoot.path}\n${config.workspaceRoot.reason ?? ''}`,
              }, `卷宗库 · ${config.workspaceRoot.path}`)
              : null,
          ]),
          h('div', {key: 'k20',  style: S.tabs }, [
            h('div', { key: 'a', style: S.tab(tab === 'prepare'), onClick: () => setTab('prepare') }, '准备'),
            h('div', { key: 'b', style: S.tab(tab === 'live'), onClick: () => setTab('live') }, '面试中'),
            h('div', { key: 'c', style: S.tab(tab === 'report'), onClick: () => setTab('report') }, '报告'),
          ]),
          h('button', { key: 'n', style: { ...S.btn('primary', false), marginLeft: 16 }, onClick: createSession }, '新建面试'),
        ]),

        notice !== undefined
          ? h('div', {
            key: 'notice',
            style: {
              padding: '10px 22px', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center',
              background: notice.kind === 'error' ? 'rgba(224,86,63,0.10)' : notice.kind === 'ok' ? 'rgba(79,169,140,0.09)' : C.ink850,
              borderBottom: `1px solid ${C.rule}`,
              color: notice.kind === 'error' ? C.tally : notice.kind === 'ok' ? C.jade : C.boneDim,
            },
          }, [
            h('span', { key: 't', style: { fontWeight: 600 } }, notice.title),
            notice.detail !== undefined ? h('span', { key: 'd', style: { color: C.boneFaint } }, notice.detail) : null,
            h('span', { key: 'x', style: { marginLeft: 'auto', cursor: 'pointer', color: C.boneFaint }, onClick: () => setNotice(undefined) }, '×'),
          ])
          : null,

        h('div', {key: 'k18',  style: S.body }, [
          // 会话列表
          h('div', {key: 'k23',  style: S.rail }, [
            h('div', { key: 'h', style: { ...S.eyebrow, padding: '4px 8px 12px' } }, '面试场次'),
            rows.length === 0
              ? h('div', { key: 'e', style: { ...S.hint, padding: '0 8px' } }, '还没有面试会话。')
              : rows.map(row => h('button', {
                key: row.id,
                style: {
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 11px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                  background: row.id === selected ? C.ink750 : 'transparent',
                  border: `1px solid ${row.id === selected ? C.rule : 'transparent'}`,
                  fontFamily: F.ui, color: row.id === selected ? C.bone : C.boneDim,
                  transition: 'background 140ms ease',
                },
                onClick: () => setSelected(row.id),
              }, [
                h('div', {
                  key: 't',
                  style: { fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                }, row.title),
                h('div', {
                  key: 'm',
                  style: { ...S.mono, fontSize: 10, color: C.boneFaint, marginTop: 4 },
                }, `${row.status} · 考点 ${row.probedCount}/${row.checklistCount}`),
              ])),
          ]),

          // 主区
          h('div', {
            key: 'k24',
            style: tab === 'live'
              // 面试页**吃满视口**：舞台撑开，速记在右栏内部滚。
              // 整页滚动会把视频区缩成一条——那正是这一版要消灭的。
              ? { ...S.main, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
              : S.main,
          }, [
            session === undefined
              ? h('div', {key: 'k25',  style: { ...S.hint, padding: 60, textAlign: 'center' } }, '还没有面试。先新建一场，或者从左边选一场。')
              : tab === 'prepare'
                ? h(PrepareView, { key: 'prepare', session, config, onChanged: refreshAll, notify })
                : tab === 'live'
                  ? h(LiveView, { key: 'live', session, config, onChanged: refreshAll, notify })
                  : h(ReportView, { key: 'report', session, config, onChanged: refreshAll, notify }),
            sessionPoll.error !== undefined
              ? h('div', {key: 'k26',  style: { ...S.hint, color: C.amber, marginTop: 12 } }, `读不到会话状态：${sessionPoll.error}`)
              : null,
          ]),
        ]),
      ])
    }

    /** The sidebar glyph. */
    function InterviewerIcon(props) {
      const size = props.size ?? 18
      return h('svg', {
        width: size, height: size, viewBox: '0 0 20 20', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true,
        style: { display: 'block', pointerEvents: 'none' },
      }, [
        h('rect', { key: 'a', x: 2, y: 3, width: 16, height: 14, rx: 2.5, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('circle', { key: 'b', cx: 7.5, cy: 12, r: 2.6, fill: 'currentColor', opacity: 0.85 }),
        h('circle', { key: 'c', cx: 12.5, cy: 12, r: 2.6, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('circle', { key: 'd', cx: 10, cy: 5.4, r: 1.3, fill: '#E0563F' }),
      ])
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          ctx.effect(() => ctx.locale.register(LOCALE_NS, DICT), 'interviewer: dictionaries')
        } catch {
          // 没有 locale 服务也不该让面板起不来。
        }

        // The panel itself: a root-scoped keyed slot. Clicking the sidebar
        // entry selects this panel.
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, Interviewer))

        // The sidebar entry, level with the other plugin entries.
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 7,
          label: () => '模拟面试间',
        }, InterviewerIcon))
      },
    }
  },
})
