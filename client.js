/*!
 * dsh-interviewer — client half (browser bundle).
 *
 * 模拟面试间 —— 把「简历 + 目标岗位 JD」变成一场有准备的面试。
 *
 * 设计语言：**面试室**。深石墨的底、录像机的红灯、示波器的音量条、
 * 发丝级分隔线、等宽计时器。
 *
 * 四条产品纪律（都写在代码里，不是写在文档里）：
 *
 *  ① **清单是起点，不是剧本。** 面板只**呈现**考点清单的当前状态
 *     （哪些已问、哪些待问、调过几次），改清单是 agent 的活。
 *  ② **输入永远有两条路。** 语音识别是氛围与效率，键盘输入是保底——
 *     识别失败、没麦克风、嘈杂环境，都不能让人开不了口。
 *  ③ **摄像头是氛围，不是刚需。** 拒绝权限就降级，不阻断流程。
 *  ④ **抓取失败必须给出路。** JD 链接抓不到时立刻给手动兜底，
 *     不给一个空白的面试。
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

    // ── palette & shared styles ───────────────────────────────────────────
    const C = {
      bg: '#14171d',
      panel: '#1b1f27',
      panel2: '#21262f',
      line: '#2b313b',
      lineSoft: '#242a33',
      text: '#e6e9ef',
      dim: '#98a1b0',
      faint: '#6b7484',
      blue: '#4c8dff',
      green: '#30a46c',
      red: '#e5484d',
      amber: '#f5a524',
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: C.bg, color: C.text, fontSize: 13 },
      head: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${C.line}`, flex: '0 0 auto' },
      title: { fontSize: 15, fontWeight: 600, letterSpacing: 0.2 },
      sub: { fontSize: 12, color: C.dim },
      tabs: { display: 'flex', gap: 4, marginLeft: 'auto' },
      tab: (active) => ({
        padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
        background: active ? C.panel2 : 'transparent',
        color: active ? C.text : C.faint,
        border: `1px solid ${active ? C.line : 'transparent'}`,
      }),
      body: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 18 },
      card: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 14 },
      cardHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
      cardTitle: { fontSize: 13, fontWeight: 600 },
      hint: { fontSize: 12, color: C.faint, lineHeight: 1.6 },
      label: { fontSize: 11.5, color: C.dim, marginBottom: 6, display: 'block' },
      input: {
        width: '100%', boxSizing: 'border-box', background: C.bg, color: C.text,
        border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 10px', fontSize: 13,
        fontFamily: 'inherit', outline: 'none',
      },
      textarea: {
        width: '100%', boxSizing: 'border-box', background: C.bg, color: C.text,
        border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px', fontSize: 13,
        fontFamily: 'inherit', outline: 'none', minHeight: 120, resize: 'vertical', lineHeight: 1.6,
      },
      btn: (primary, disabled) => ({
        padding: '7px 13px', borderRadius: 8, fontSize: 12.5, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${primary ? C.blue : C.line}`,
        background: primary ? C.blue : C.panel2,
        color: disabled ? C.faint : primary ? '#fff' : C.text,
        opacity: disabled ? 0.55 : 1,
        fontFamily: 'inherit',
      }),
      row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
      pill: (color) => ({
        fontSize: 10.5, padding: '1px 7px', borderRadius: 999, border: `1px solid ${color}55`,
        color, background: `${color}18`, whiteSpace: 'nowrap',
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

    /** Format a duration in milliseconds as `mm:ss`. */
    function formatClock(ms) {
      const total = Math.max(0, Math.floor(ms / 1000))
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    /** Format a timestamp as a local clock string. */
    function formatTime(ts) {
      const date = new Date(ts)
      const pad = value => String(value).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    // ── hooks ─────────────────────────────────────────────────────────────

    /**
     * Poll one async function on an interval.
     *
     * @param {() => Promise<any>} loader
     * @param {number|null} intervalMs `null` pauses the poll
     */
    function usePoll(loader, intervalMs, deps) {
      const [data, setData] = useState(undefined)
      const [error, setError] = useState(undefined)
      const loaderRef = useRef(loader)
      loaderRef.current = loader

      const refresh = useCallback(async () => {
        try {
          const value = await loaderRef.current()
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
     * Camera + microphone, with a graceful path when permission is refused.
     *
     * Returns the stream, the live level (0..1) and the error text.
     */
    function useMedia() {
      const [stream, setStream] = useState(undefined)
      const [error, setError] = useState(undefined)
      const [level, setLevel] = useState(0)
      const audioRef = useRef(undefined)
      const rafRef = useRef(0)
      const streamRef = useRef(undefined)

      const stop = useCallback(() => {
        cancelAnimationFrame(rafRef.current)
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
          setError('这个环境没有摄像头/麦克风接口（需要 Electron 或浏览器，且页面在安全上下文里）。')
          return undefined
        }
        try {
          const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
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
                rafRef.current = requestAnimationFrame(tick)
              }
              rafRef.current = requestAnimationFrame(tick)
            }
          } catch {
            // 音量条失败不影响录音与识别。
          }
          return media
        } catch (failure) {
          const name = failure && failure.name
          setError(
            name === 'NotAllowedError'
              ? '摄像头/麦克风权限被拒绝了。可以只用手输继续面试，或者在系统设置里放行权限后重试。'
              : `打不开摄像头/麦克风：${failure instanceof Error ? failure.message : String(failure)}`,
          )
          return undefined
        }
      }, [])

      useEffect(() => () => {
        cancelAnimationFrame(rafRef.current)
        const current = streamRef.current
        if (current !== undefined) for (const track of current.getTracks()) track.stop()
        const audio = audioRef.current
        if (audio !== undefined) audio.context.close().catch(() => {})
      }, [])

      return { stream, error, level, start, stop }
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

    /** A labeled section with a title and a right-hand slot. */
    function Section(props) {
      return h('div', { style: S.card }, [
        h('div', { style: S.cardHead }, [
          h('div', { style: S.cardTitle }, props.title),
          props.extra !== undefined ? h('div', { style: { marginLeft: 'auto' } }, props.extra) : null,
        ]),
        props.children,
      ])
    }

    /** A text field. */
    function Field(props) {
      return h('div', { style: { marginBottom: 12 } }, [
        h('label', { style: S.label }, props.label),
        h('input', {
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
        h('label', { style: S.label }, props.label),
        h('textarea', {
          style: S.textarea,
          value: props.value ?? '',
          placeholder: props.placeholder,
          onChange: event => props.onChange(event.target.value),
        }),
      ])
    }

    /** One checklist item row. */
    function ChecklistRow(props) {
      const item = props.item
      const levelColor = item.level === 'core' ? C.red : item.level === 'deep' ? C.amber : C.faint
      return h('div', {
        style: {
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '9px 0', borderBottom: `1px solid ${C.lineSoft}`,
        },
      }, [
        h('span', { style: S.pill(levelColor) }, item.level ?? 'core'),
        h('div', { style: { flex: '1 1 auto', minWidth: 0 } }, [
          h('div', { style: { fontSize: 13, color: item.probed === true ? C.faint : C.text, textDecoration: item.probed === true ? 'line-through' : 'none' } }, item.topic),
          item.why !== undefined && item.why !== ''
            ? h('div', { style: { fontSize: 11.5, color: C.faint, marginTop: 3, lineHeight: 1.5 } }, item.why)
            : null,
        ]),
        h('span', { style: { fontSize: 11, color: C.faint, whiteSpace: 'nowrap' } }, item.probed === true ? '已问' : '待问'),
      ])
    }

    /** A minimal markdown renderer (headings, lists, bold, code, quotes). */
    function Markdown(props) {
      const text = String(props.text ?? '')
      const blocks = text.split('\n')
      const rendered = []
      let listItems = []
      const flushList = () => {
        if (listItems.length === 0) return
        rendered.push(h('ul', { key: `ul${rendered.length}`, style: { margin: '6px 0 10px', paddingLeft: 20, lineHeight: 1.7 } },
          listItems.map((item, index) => h('li', { key: index, style: { fontSize: 12.5, color: C.dim } }, inline(item)))))
        listItems = []
      }
      for (const line of blocks) {
        const trimmed = line.trim()
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          listItems.push(trimmed.slice(2))
          continue
        }
        flushList()
        if (trimmed === '') continue
        const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
        if (heading !== null) {
          const size = [16, 14.5, 13.5, 13][heading[1].length - 1]
          rendered.push(h('div', { key: `h${rendered.length}`, style: { fontSize: size, fontWeight: 600, marginTop: 14, marginBottom: 6, color: C.text } }, inline(heading[2])))
          continue
        }
        if (trimmed.startsWith('> ')) {
          rendered.push(h('div', { key: `q${rendered.length}`, style: { borderLeft: `2px solid ${C.blue}`, paddingLeft: 10, margin: '8px 0', color: C.dim, fontSize: 12.5 } }, inline(trimmed.slice(2))))
          continue
        }
        rendered.push(h('div', { key: `p${rendered.length}`, style: { fontSize: 12.5, color: C.dim, lineHeight: 1.75, marginBottom: 8 } }, inline(trimmed)))
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
          pieces.push(h('code', { key: `i${key++}`, style: { ...S.mono, background: C.bg, padding: '1px 5px', borderRadius: 4, fontSize: 12 } }, token.slice(1, -1)))
        } else if (token.startsWith('**')) {
          pieces.push(h('strong', { key: `i${key++}`, style: { color: C.text } }, token.slice(2, -2)))
        } else {
          pieces.push(h('em', { key: `i${key++}`, style: { color: C.dim } }, token.slice(1, -1)))
        }
        last = match.index + token.length
      }
      if (last < text.length) pieces.push(text.slice(last))
      return pieces
    }

    // ── views ─────────────────────────────────────────────────────────────

    /** The preparation view: resume, JD, checklist. */
    function PrepareView(props) {
      const { session, config, onChanged, notify } = props
      const [resumeText, setResumeText] = useState('')
      const [jdText, setJdText] = useState('')
      const [jdUrl, setJdUrl] = useState('')
      const [busy, setBusy] = useState(false)
      const [jdNote, setJdNote] = useState(undefined)

      useEffect(() => {
        setResumeText('')
        setJdText('')
        setJdUrl(session?.documents?.jdUrl ?? '')
        setJdNote(undefined)
      }, [session?.session?.id])

      const saveResume = useCallback(async () => {
        setBusy(true)
        try {
          await apiPost(`sessions/${session.session.id}/resume`, { text: resumeText })
          notify('简历已保存', 'ok')
          onChanged()
        } catch (failure) {
          notify('简历没存上', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [session?.session?.id, resumeText, onChanged, notify])

      const saveJd = useCallback(async () => {
        setBusy(true)
        try {
          await apiPost(`sessions/${session.session.id}/jd`, { text: jdText, url: jdUrl })
          notify('JD 已保存', 'ok')
          onChanged()
        } catch (failure) {
          notify('JD 没存上', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [session?.session?.id, jdText, jdUrl, onChanged, notify])

      const fetchJd = useCallback(async () => {
        if (jdUrl.trim() === '') return
        setBusy(true)
        setJdNote(undefined)
        try {
          const result = await apiPost('jd/fetch', { url: jdUrl.trim() })
          if (result.ok === true) {
            setJdText(result.text)
            await apiPost(`sessions/${session.session.id}/jd`, {
              text: result.text,
              url: result.url,
              meta: { title: result.title, sections: result.sections, warnings: [] },
            })
            setJdNote({ ok: true, text: `抓到了：${result.text.length} 字${result.title !== '' ? `（${result.title}）` : ''}` })
            onChanged()
          } else {
            setJdNote({ ok: false, text: `${result.error}。${result.hint}` })
          }
        } catch (failure) {
          setJdNote({ ok: false, text: failure instanceof Error ? failure.message : String(failure) })
        } finally {
          setBusy(false)
        }
      }, [jdUrl, session?.session?.id, onChanged])

      const uploadResume = useCallback(async event => {
        const file = event.target.files?.[0]
        if (file === undefined) return
        setBusy(true)
        try {
          const dataBase64 = await readFileAsBase64(file)
          const result = await apiPost('resume/extract', { filename: file.name, mimeType: file.type, dataBase64 })
          if (result.ok === true) {
            setResumeText(result.text)
            await apiPost(`sessions/${session.session.id}/resume`, { text: result.text })
            notify(`简历读到了 ${result.chars} 字`, result.warnings.length > 0 ? result.warnings.join(' ') : 'ok')
            onChanged()
          } else {
            notify('这份文件读不出文字', result.warnings.join(' '), 'error')
          }
        } catch (failure) {
          notify('上传失败', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
          event.target.value = ''
        }
      }, [session?.session?.id, onChanged, notify])

      const uploadJd = useCallback(async event => {
        const file = event.target.files?.[0]
        if (file === undefined) return
        setBusy(true)
        try {
          const dataBase64 = await readFileAsBase64(file)
          const result = await apiPost('resume/extract', { filename: file.name, mimeType: file.type, dataBase64 })
          if (result.ok === true) {
            setJdText(result.text)
            await apiPost(`sessions/${session.session.id}/jd`, { text: result.text, url: jdUrl })
            notify(`JD 读到了 ${result.chars} 字`, 'ok')
            onChanged()
          } else {
            notify('这份文件读不出文字', result.warnings.join(' '), 'error')
          }
        } catch (failure) {
          notify('上传失败', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
          event.target.value = ''
        }
      }, [session?.session?.id, jdUrl, onChanged, notify])

      const checklist = session?.checklist?.items ?? []

      return h('div', null, [
        h(Section, { title: '简历', extra: h('span', { style: S.hint }, session?.documents?.resumeChars > 0 ? `已保存 ${session.documents.resumeChars} 字` : '还没存') }, [
          h('div', { style: { ...S.row, marginBottom: 12 } }, [
            h('label', { style: { ...S.btn(false, busy) } }, [
              '上传文件（.txt/.md/.docx/.pdf）',
              h('input', { type: 'file', accept: '.txt,.md,.json,.docx,.pdf,text/plain,text/markdown', style: { display: 'none' }, onChange: uploadResume }),
            ]),
            h('span', { style: S.hint }, '读不出文字的文件会明确告诉你，不会假装成功'),
          ]),
          h(Area, {
            label: '或直接粘贴简历正文',
            value: resumeText,
            placeholder: '把简历正文粘到这里……',
            onChange: setResumeText,
          }),
          h('div', { style: S.row }, [
            h('button', { style: S.btn(true, busy || resumeText.trim() === ''), onClick: saveResume }, '保存简历'),
            session?.documents?.resumeChars > 0
              ? h('span', { style: S.hint }, `盘上已有 ${session.documents.resumeChars} 字，粘贴后保存会覆盖它`)
              : null,
          ]),
        ]),

        h(Section, { title: '目标岗位 JD', extra: h('span', { style: S.hint }, session?.documents?.jdChars > 0 ? `已保存 ${session.documents.jdChars} 字` : '还没存') }, [
          h('div', { style: { ...S.row, marginBottom: 12, alignItems: 'flex-end' } }, [
            h('div', { style: { flex: '1 1 320px' } }, [
              h(Field, {
                label: '岗位链接（抓取失败会自动给手动兜底）',
                value: jdUrl,
                placeholder: 'https://…',
                onChange: setJdUrl,
              }),
            ]),
            h('button', { style: S.btn(false, busy || jdUrl.trim() === ''), onClick: fetchJd }, '抓取 JD'),
            h('label', { style: { ...S.btn(false, busy) } }, [
              '上传 JD 文件',
              h('input', { type: 'file', accept: '.txt,.md,.json,.docx,.pdf', style: { display: 'none' }, onChange: uploadJd }),
            ]),
          ]),
          jdNote !== undefined
            ? h('div', {
              style: {
                padding: '8px 11px', borderRadius: 8, marginBottom: 12, fontSize: 12, lineHeight: 1.6,
                border: `1px solid ${jdNote.ok ? C.green : C.amber}44`,
                background: jdNote.ok ? `${C.green}12` : `${C.amber}12`,
                color: jdNote.ok ? C.green : C.amber,
              },
            }, jdNote.text)
            : null,
          h(Area, {
            label: '或直接粘贴 JD 正文',
            value: jdText,
            placeholder: '把岗位描述粘到这里……',
            onChange: setJdText,
          }),
          h('div', { style: S.row }, [
            h('button', { style: S.btn(true, busy || jdText.trim() === ''), onClick: saveJd }, '保存 JD'),
          ]),
        ]),

        h(Section, { title: '考点清单', extra: h('span', { style: S.hint }, `${session?.stats?.checklistProbed ?? 0}/${session?.stats?.checklistTotal ?? 0} 已问`)}, [
          checklist.length === 0
            ? h('div', { style: S.hint }, '清单还是空的。在 DSH 对话里让助手用 interview-prep 技能基于简历与 JD 做调研，产出后用 interview_save_checklist 落盘——这里就会显示出来。')
            : h('div', null, checklist.map(item => h(ChecklistRow, { key: item.id, item }))),
          session?.stats?.adjustments > 0
            ? h('div', { style: { ...S.hint, marginTop: 10 } }, `面试中调整过 ${session.stats.adjustments} 次——每一次调整都记了理由，事后复盘会用到。`)
            : null,
        ]),
      ])
    }

    /** The live interview view: camera, recording, recognition, transcript. */
    function LiveView(props) {
      const { session, config, onChanged, notify } = props
      const media = useMedia()
      const recorder = useRecorder(media.stream)
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
          notify('已复制，粘到 DSH 对话框里发给助手', 'ok')
        } catch {
          notify('复制失败', '浏览器拒绝了剪贴板权限，手动选中文本复制。', 'error')
        }
      }, [answer, notify])

      const saveClip = useCallback(async () => {
        if (recorder.clip === undefined) return
        try {
          const dataBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onerror = () => reject(new Error('读不出来'))
            reader.onload = () => {
              const result = String(reader.result ?? '')
              const comma = result.indexOf(',')
              resolve(comma >= 0 ? result.slice(comma + 1) : result)
            }
            reader.readAsDataURL(recorder.clip.blob)
          })
          await apiPost(`sessions/${session.session.id}/recording`, {
            kind: media.stream?.getVideoTracks().length > 0 ? 'video' : 'audio',
            mimeType: recorder.clip.mimeType,
            dataBase64,
          })
          recorder.reset()
          notify('已保存到本机', 'ok')
          onChanged()
        } catch (failure) {
          notify('保存失败', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [recorder, session?.session?.id, media.stream, onChanged, notify])

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
          notify('面试已结束，去「报告」页让助手写分析', 'ok')
        } catch (failure) {
          notify('没能结束', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [session?.session?.id, onChanged, notify])

      const running = session?.session?.status === 'running'

      return h('div', null, [
        h(Section, { title: '现场', extra: h('span', { style: { ...S.mono, color: C.amber } }, formatClock(session?.stats?.durationMs ?? 0)) }, [
          h('div', { style: { display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' } }, [
            h('div', {
              style: {
                position: 'relative', width: 260, height: 176, borderRadius: 10, overflow: 'hidden',
                background: '#0d0f13', border: `1px solid ${C.line}`, flex: '0 0 auto',
              },
            }, [
              h('video', {
                ref: videoRef,
                autoPlay: true,
                muted: true,
                playsInline: true,
                style: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: media.stream === undefined ? 'none' : 'block' },
              }),
              media.stream === undefined
                ? h('div', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontSize: 12 } }, '摄像头未开')
                : null,
              recorder.recording
                ? h('div', {
                  style: {
                    position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 9px', borderRadius: 999, background: '#00000088', fontSize: 11, color: '#fff',
                  },
                }, [
                  h('span', { style: { width: 7, height: 7, borderRadius: 999, background: C.red, display: 'block' } }),
                  'REC',
                ])
                : null,
            ]),

            h('div', { style: { flex: '1 1 280px', minWidth: 260 } }, [
              h('div', { style: { ...S.row, marginBottom: 12 } }, [
                h('button', { style: S.btn(false, false), onClick: () => (media.stream === undefined ? void media.start() : media.stop()) },
                  media.stream === undefined ? '开摄像头' : '关摄像头'),
                h('button', {
                  style: S.btn(recorder.recording, media.stream === undefined),
                  onClick: () => (recorder.recording ? recorder.stop() : recorder.start()),
                }, recorder.recording ? '停止录音' : '开始录音'),
                h('button', {
                  style: S.btn(asr.active, !asr.supported),
                  onClick: () => (asr.active ? asr.stop() : asr.start()),
                  disabled: !asr.supported,
                }, asr.active ? '停止识别' : '开始识别'),
                h('button', {
                  style: S.btn(false, !tts.supported),
                  onClick: () => {
                    if (speaking) {
                      tts.cancel()
                      setSpeaking(false)
                      return
                    }
                    setSpeaking(true)
                    // 立刻读一遍当前问题——不然「打开朗读」看起来什么都没发生。
                    if (lastQuestion !== undefined) {
                      tts.speak(lastQuestion.text, { rate: config?.ttsRate ?? 1 })
                      lastQuestionRef.current = lastQuestion.text
                    }
                  },
                }, speaking ? '关闭朗读' : '朗读问题'),
              ]),

              // 输入电平
              h('div', { style: { marginBottom: 12 } }, [
                h('div', { style: { ...S.label, display: 'flex', justifyContent: 'space-between' } }, [
                  h('span', null, asr.active ? '正在聆听…' : '输入电平'),
                  h('span', { style: { color: asr.active ? C.green : C.faint } }, asr.active ? '识别中' : '待命'),
                ]),
                h('div', { style: { height: 8, borderRadius: 999, background: C.bg, border: `1px solid ${C.line}`, overflow: 'hidden' } }, [
                  h('div', { style: { height: '100%', width: `${Math.round(media.level * 100)}%`, background: media.level > 0.7 ? C.red : C.green, transition: 'width 80ms linear' } }),
                ]),
              ]),

              media.error !== undefined
                ? h('div', { style: { ...S.hint, color: C.amber, marginBottom: 10, lineHeight: 1.6 } }, media.error)
                : null,
              asr.error !== undefined
                ? h('div', { style: { ...S.hint, color: C.amber, marginBottom: 10, lineHeight: 1.6 } }, asr.error)
                : null,
              asr.interim !== ''
                ? h('div', { style: { ...S.hint, color: C.dim, marginBottom: 10, fontStyle: 'italic' } }, asr.interim)
                : null,
            ]),
          ]),
        ]),

        h(Section, { title: '当前问题', extra: h('span', { style: S.hint }, '助手提问会出现在这里（由助手写入转录）') }, [
          lastQuestion === undefined
            ? h('div', { style: S.hint }, '还没有问题。在 DSH 对话里让助手开始提问——助手用 interview_record_turn 记录每一轮，这里会实时显示。')
            : h('div', { style: { fontSize: 14, lineHeight: 1.7 } }, lastQuestion.text),
        ]),

        h(Section, { title: '我的回答', extra: h('span', { style: S.hint }, '识别结果只是草稿，可以改') }, [
          h('textarea', {
            style: S.textarea,
            value: answer,
            placeholder: '说话或打字。提交后进入转录，成为事后分析的事实来源。',
            onChange: event => setAnswer(event.target.value),
          }),
          h('div', { style: { ...S.row, marginTop: 10 } }, [
            h('button', { style: S.btn(true, answer.trim() === ''), onClick: submitAnswer }, '提交回答'),
            h('button', { style: S.btn(false, answer.trim() === ''), onClick: copyAnswer }, '复制（粘到对话框）'),
            h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } }, [
              running
                ? h('button', { style: S.btn(false, false), onClick: finishInterview }, '结束面试')
                : h('button', { style: S.btn(true, false), onClick: startInterview }, '开始面试'),
            ]),
          ]),
        ]),

        h(Section, { title: '转录' }, [
          transcript.length === 0
            ? h('div', { style: S.hint }, '还没有转录。')
            : h('div', { style: { maxHeight: 320, overflowY: 'auto' } }, transcript.map((row, index) => h('div', {
              key: `${row.ts}-${index}`,
              style: { display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.lineSoft}` },
            }, [
              h('span', { style: { ...S.mono, fontSize: 11, color: C.faint, flex: '0 0 auto', paddingTop: 2 } }, formatTime(row.ts)),
              h('span', { style: S.pill(row.role === 'interviewer' ? C.blue : row.role === 'candidate' ? C.green : C.faint) },
                row.role === 'interviewer' ? '问' : row.role === 'candidate' ? '答' : '系统'),
              h('span', { style: { fontSize: 12.5, color: C.dim, lineHeight: 1.6 } }, row.text),
            ]))),
        ]),

        h(Section, { title: '录像与录音', extra: recorder.clip !== undefined ? h('button', { style: S.btn(true, false), onClick: saveClip }, '保存到本机') : undefined }, [
          h('div', { style: { ...S.row, marginBottom: 10 } }, [
            h('span', { style: S.hint }, recorder.recording ? '正在录…' : recorder.clip !== undefined ? '有一段待保存的片段' : '没在录'),
          ]),
          (session?.recordings ?? []).length === 0
            ? h('div', { style: S.hint }, '还没有保存过片段。录像只是氛围功能，不开也能面试。')
            : h('div', null, (session.recordings ?? []).map(item => h('div', {
              key: item.name,
              style: { display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12 },
            }, [
              h('span', { style: S.pill(item.kind === 'video' ? C.blue : C.green) }, item.kind === 'video' ? '录像' : '录音'),
              h('span', { style: { flex: '1 1 auto', color: C.dim } }, item.name),
              h('span', { style: { ...S.mono, color: C.faint } }, `${(item.bytes / 1024).toFixed(0)} KiB`),
            ]))),
        ]),
      ])
    }

    /** The report view. */
    function ReportView(props) {
      const { session, onChanged, notify } = props
      const [markdown, setMarkdown] = useState('')

      const report = session?.report ?? ''

      return h('div', null, [
        h(Section, { title: '面试后分析', extra: h('span', { style: S.hint }, report !== '' ? `已生成 ${report.length} 字` : '还没生成') }, [
          report !== ''
            ? h(Markdown, { text: report })
            : h('div', { style: S.hint }, '还没有报告。在 DSH 对话里让助手用 interview-conduct 技能收尾，它会调 interview_finish 把分析写进来。'),
        ]),
        h(Section, { title: '统计' }, [
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 } }, [
            statTile('提问', session?.stats?.asked ?? 0),
            statTile('回答', session?.stats?.answered ?? 0),
            statTile('考点', `${session?.stats?.checklistProbed ?? 0}/${session?.stats?.checklistTotal ?? 0}`),
            statTile('清单调整', session?.stats?.adjustments ?? 0),
            statTile('时长', formatClock(session?.stats?.durationMs ?? 0)),
          ]),
        ]),
      ])
    }

    /** One statistic tile. */
    function statTile(label, value) {
      return h('div', { style: { background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px' } }, [
        h('div', { style: { ...S.mono, fontSize: 18, color: C.text } }, String(value)),
        h('div', { style: { fontSize: 11.5, color: C.faint, marginTop: 2 } }, label),
      ])
    }

    // ── panel ─────────────────────────────────────────────────────────────

    /** The whole panel. */
    function Interviewer() {
      const [tab, setTab] = useState('prepare')
      const [selected, setSelected] = useState(undefined)
      const [notice, setNotice] = useState(undefined)
      const [config, setConfig] = useState(undefined)

      const notify = useCallback((title, detail, kind = 'info') => {
        setNotice({ title, detail, kind, at: Date.now() })
      }, [])

      const sessionsPoll = usePoll(() => apiGet('sessions'), 6000, [])
      const configPoll = usePoll(() => apiGet('config'), undefined, [])

      useEffect(() => {
        if (configPoll.data !== undefined) setConfig(configPoll.data)
      }, [configPoll.data])

      // 默认选中最近一场。
      useEffect(() => {
        const rows = sessionsPoll.data?.sessions ?? []
        if (selected === undefined && rows.length > 0) setSelected(rows[0].id)
      }, [sessionsPoll.data, selected])

      const sessionPoll = usePoll(
        () => (selected === undefined ? Promise.resolve(undefined) : apiGet(`sessions/${selected}`)),
        selected === undefined ? null : (tab === 'live' ? POLL_MS : 6000),
        [selected],
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
          notify('新面试已建好', '先放简历和 JD，再让助手做考点清单调研。', 'ok')
          refreshAll()
        } catch (failure) {
          notify('建不了', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, refreshAll])

      const rows = sessionsPoll.data?.sessions ?? []

      return h('div', { style: S.page }, [
        h('div', { style: S.head }, [
          h('div', null, [
            h('div', { style: S.title }, '模拟面试间'),
            h('div', { style: S.sub }, '简历 + JD → 一场有准备的面试'),
          ]),
          h('div', { style: S.tabs }, [
            h('div', { style: S.tab(tab === 'prepare'), onClick: () => setTab('prepare') }, '准备'),
            h('div', { style: S.tab(tab === 'live'), onClick: () => setTab('live') }, '面试中'),
            h('div', { style: S.tab(tab === 'report'), onClick: () => setTab('report') }, '报告'),
          ]),
          h('button', { style: { ...S.btn(true, false), marginLeft: 10 }, onClick: createSession }, '新建面试'),
        ]),

        notice !== undefined
          ? h('div', {
            style: {
              padding: '8px 18px', fontSize: 12, display: 'flex', gap: 10, alignItems: 'center',
              background: notice.kind === 'error' ? `${C.red}14` : notice.kind === 'ok' ? `${C.green}12` : C.panel,
              borderBottom: `1px solid ${C.line}`, color: notice.kind === 'error' ? C.red : notice.kind === 'ok' ? C.green : C.dim,
            },
          }, [
            h('span', { style: { fontWeight: 600 } }, notice.title),
            notice.detail !== undefined ? h('span', { style: { color: C.dim } }, notice.detail) : null,
            h('span', { style: { marginLeft: 'auto', cursor: 'pointer', color: C.faint }, onClick: () => setNotice(undefined) }, '×'),
          ])
          : null,

        h('div', { style: { display: 'flex', flex: '1 1 auto', minHeight: 0 } }, [
          // 会话列表
          h('div', {
            style: {
              width: 190, flex: '0 0 190px', borderRight: `1px solid ${C.line}`,
              overflowY: 'auto', padding: 10,
            },
          }, [
            rows.length === 0
              ? h('div', { style: S.hint }, '还没有面试会话。')
              : rows.map(row => h('div', {
                key: row.id,
                style: {
                  padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                  background: row.id === selected ? C.panel2 : 'transparent',
                  border: `1px solid ${row.id === selected ? C.line : 'transparent'}`,
                },
                onClick: () => setSelected(row.id),
              }, [
                h('div', { style: { fontSize: 12.5, color: row.id === selected ? C.text : C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, row.title),
                h('div', { style: { fontSize: 10.5, color: C.faint, marginTop: 3 } },
                  `${row.status} · 考点 ${row.probedCount}/${row.checklistCount}`),
              ])),
          ]),

          // 主区
          h('div', { style: { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: 18 } }, [
            session === undefined
              ? h('div', { style: { ...S.hint, padding: 40, textAlign: 'center' } }, '还没有面试。先新建一场，或者从左边选一场。')
              : tab === 'prepare'
                ? h(PrepareView, { session, config, onChanged: refreshAll, notify })
                : tab === 'live'
                  ? h(LiveView, { session, config, onChanged: refreshAll, notify })
                  : h(ReportView, { session, config, onChanged: refreshAll, notify }),
            sessionPoll.error !== undefined
              ? h('div', { style: { ...S.hint, color: C.amber, marginTop: 12 } }, `读不到会话状态：${sessionPoll.error}`)
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
        h('circle', { key: 'd', cx: 10, cy: 5.4, r: 1.3, fill: '#e5484d' }),
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
