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
     * 量一个容器的实际宽度，并随它变化更新。
     *
     * **为什么必须量容器，而不是看屏幕。**
     * 这个面板是**被塞进别人家应用**的一块：桌面版 DSH 里它能分到 1200px，
     * 网页版 DSH 的侧栏里可能只有 250px。两种宽度下「一套固定布局」必然
     * 有一边是坏的——之前就坏在这里：右栏写死 396px 且不许收缩，
     * 容器一窄，**舞台被压成 0 宽**，用户连「申请摄像头」都点不到。
     *
     * 所以布局必须**按容器实际宽度换挡**。
     *
     * @returns {[React.RefObject<HTMLElement>, number]} ref 与宽度（px）
     */
    function useContainerWidth() {
      const ref = useRef(null)
      const [width, setWidth] = useState(0)
      useEffect(() => {
        const element = ref.current
        if (element === null || element === undefined) return undefined
        const update = () => {
          const next = element.getBoundingClientRect().width
          // 差不到 1px 就不动 state：ResizeObserver 在布局没变时也会回调，
          // 无脑 setState 会让「空闲时零重渲染」的红线破掉。
          setWidth(previous => (Math.abs(previous - next) < 1 ? previous : next))
        }
        update()
        if (typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
      }, [])
      return [ref, width]
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
     * 这个界面是不是跑在 **DSH 桌面端**（Electron）里。
     *
     * **为什么必须分清。** 桌面端宿主自己管权限：它的权限处理器只放行
     * 「mediaTypes 恰好是 ['audio']」的请求，摄像头会被**直接拒掉**，
     * 而且连系统窗口都不弹——用户看到的只是「被拒绝」，却在系统设置里
     * 找不到任何能改的地方。浏览器里则是操作系统/浏览器弹窗，去了设置
     * 就能改。同一个「拿不到摄像头」，两边的出路完全相反：
     * 说错一句，就等于让用户白跑一趟系统设置。
     *
     * 桌面端的应用页协议是 `dsh-app://app`；Electron 的 UA 里也带
     * `Electron`。两个都认，认不出就当普通浏览器处理（保守地说
     * 「去系统设置放行」，不会把人引到死路上）。
     */
    function inDesktopHost() {
      try {
        if (typeof location !== 'undefined' && location.protocol === 'dsh-app:') return true
        if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '')) return true
      } catch {
        // 取不到就当普通浏览器。
      }
      return false
    }

    /**
     * Camera + microphone, with a **主动授权** path.
     *
     * 拿不到权限是常事（没设备、系统关掉了、被拒过）。所以这里的契约是：
     *
     *   - 先按「摄像头+麦克风一起申请」的老路走一次——普通浏览器里
     *     这样只弹一次窗；
     *   - 被拒了再**分开**申请一次，分清**是哪一半**被挡：麦克风没有
     *     和摄像头没有，出路完全不一样；
     *   - 分清「没设备」「被占用」「页面不安全」「被拒绝」四种原因——
     *     它们的出路也完全不一样；
     *   - **说清楚是宿主挡的，还是系统挡的。** 这两件事看着像，
     *     但修的地方不同（见 `inDesktopHost`）。
     */
    function useMedia() {
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

      /**
       * 申请一块媒体。
       *
       * **失败时把原因带回来，不要抛。** 我们要靠「哪一种设备拿不到」
       * 来判断出路：麦克风没有，多半是系统或宿主不放行；摄像头没有，
       * 在 DSH 桌面端里往往是宿主策略只放行纯音频请求的结果。
       */
      const request = useCallback(async constraints => {
        try {
          const media = await navigator.mediaDevices.getUserMedia(constraints)
          return { ok: true, media }
        } catch (failure) {
          return {
            ok: false,
            name: failure?.name ?? 'Error',
            message: failure instanceof Error ? failure.message : String(failure),
          }
        }
      }, [])

      /**
       * 「麦克风通了、摄像头没通」时给用户的说法。
       *
       * **桌面端和浏览器的出路是相反的**，所以必须分开写：
       * 桌面端改系统设置没用（是宿主策略挡的），浏览器里改了就能自动接上。
       */
      const cameraBlockedError = useCallback(() => (
        inDesktopHost()
          ? {
              kind: 'partial',
              text: '麦克风已接上；摄像头被 DSH 桌面端挡下了。',
              action: '桌面端只放行「只申请麦克风」的请求，摄像头这条路现在走不通——'
                + '改 Windows 设置也没用。面试照常：语音提问、文字回答、录音都不受影响。',
            }
          : {
              kind: 'partial',
              text: '麦克风已接上；摄像头被拒绝了。',
              action: '浏览器地址栏左侧的权限图标 → 允许摄像头；或 Windows'
                + '「设置 → 隐私和安全性 → 摄像头 → 允许桌面应用访问」。'
                + '放行后这里会自动接上，不用再点一次。',
            }
      ), [])

      const start = useCallback(async () => {
        if (navigator.mediaDevices?.getUserMedia === undefined) {
          setError({
            kind: 'unsupported',
            text: '这个环境没有摄像头/麦克风接口（需要 Electron 或浏览器，且页面在安全上下文里）。',
            action: '键盘输入仍然可用，面试照常进行。',
          })
          return undefined
        }
        setBusy(true)
        await probe()
        const videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } }
        const audioConstraints = { echoCancellation: true, noiseSuppression: true }
        try {
          const existing = streamRef.current
          const hasVideoTrack = existing !== undefined
            && typeof existing.getVideoTracks === 'function'
            && existing.getVideoTracks().length > 0
          if (existing !== undefined && hasVideoTrack) return existing

          // **已经有流、但没有视频轨**——那是「麦克风通了、摄像头没通」。
          // 这时重试只补摄像头，别把已经在用的麦克风也断了重来。
          if (existing !== undefined) {
            const onlyVideo = await request({ video: videoConstraints })
            if (onlyVideo.ok) {
              // **用 addTrack 往现有流里加，不要重新构造一条流。**
              // 构造器在有些 WebView 里认不得外来的轨，而 addTrack
              // 是给「已经开着的那条流」加轨，天然不丢麦克风。
              try {
                for (const track of onlyVideo.media.getVideoTracks()) existing.addTrack(track)
              } catch {
                // 加不进去就还是只有麦克风，如实说。
              }
              setStream(existing)
              setError(existing.getVideoTracks().length > 0 ? undefined : cameraBlockedError())
              return existing
            }
            setError(cameraBlockedError())
            return undefined
          }

          // 先按老路走一次：摄像头+麦克风**一起**申请。
          // 普通浏览器里这样只弹一次窗，体验最好。
          const combined = await request({ video: videoConstraints, audio: audioConstraints })
          let audio
          let video
          let failure = combined.ok ? undefined : combined
          if (combined.ok) {
            audio = combined.media
            video = combined.media
          } else {
            // 一起申请被拒 → **分开**再试一次，才知道是哪一半被挡。
            //
            // **为什么必须分开。** DSH 桌面端自己的权限处理器只放行
            // 「mediaTypes 恰好是 ['audio']」的请求；摄像头+麦克风一起申请
            // 会被它直接拒掉，而且**连系统窗口都不弹**——用户看到的只是
            // 一句「系统已记住拒绝」，却在设置里找不到任何可改的地方。
            // 分开申请，麦克风就能过；摄像头过不去时，我们能说清是谁挡的。
            const onlyAudio = await request({ audio: audioConstraints })
            const onlyVideo = await request({ video: videoConstraints })
            audio = onlyAudio.ok ? onlyAudio.media : undefined
            video = onlyVideo.ok ? onlyVideo.media : undefined
            if (onlyAudio.ok === false && onlyVideo.ok === false) {
              failure = { name: onlyAudio.name, message: onlyAudio.message }
            }
          }

          const tracks = []
          if (audio !== undefined) tracks.push(...audio.getAudioTracks())
          if (video !== undefined) tracks.push(...video.getVideoTracks())
          if (tracks.length === 0) {
            // 一块都没拿到：按失败原因分类，给出**能做的下一步**。
            const name = failure?.name
            if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
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
            } else if (name === 'NotAllowedError' || name === 'SecurityError') {
              setError(inDesktopHost()
                ? {
                    kind: 'denied',
                    text: '麦克风被挡住了，摄像头也没接上。',
                    action: '桌面端只放行「只申请麦克风」的请求，麦克风这一步就卡住了——'
                      + '多半是 Windows 隐私设置或宿主帧的限制。查 Windows'
                      + '「设置 → 隐私和安全性 → 麦克风 → 允许桌面应用访问」，'
                      + '再点「重新检测授权状态」。',
                  }
                : {
                    kind: 'denied',
                    text: '系统或浏览器拒绝了这次申请。',
                    action: '浏览器地址栏左侧的权限图标 → 允许；或 Windows'
                      + '「设置 → 隐私和安全性 → 摄像头 / 麦克风 → 允许桌面应用访问」。'
                      + '放行后这里会自动接上，不用再点一次。',
                  })
            } else {
              setError({
                kind: 'other',
                text: `打不开摄像头/麦克风：${failure?.message ?? '未知原因'}`,
                action: '可以先用键盘继续面试。',
              })
            }
            return undefined
          }

          // 把两条轨并成一条流。**合并不了就用其中一条**——
          // 有些内嵌 WebView 的 MediaStream 构造器认不得外来的轨，
          // 宁可少一条轨，也不能让整条申请链断在这儿。
          let media
          try {
            media = new MediaStream(tracks)
          } catch {
            media = audio ?? video
          }
          if (media === undefined) {
            setError({
              kind: 'other',
              text: '拿到设备了，但拼不出可用的媒体流。',
              action: '可以先用键盘继续面试。',
            })
            return undefined
          }
          streamRef.current = media
          setStream(media)

          // **部分成功也要说话。** 麦克风通了、摄像头没有，面试照样能跑，
          // 但用户得知道「为什么没有画面」，而且不用他去白改设置。
          if (video === undefined) {
            setError(cameraBlockedError())
          } else {
            setError(undefined)
          }

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
          // 申请本身的失败已经被 `request()` 分类过了；能落到这里的，
          // 是拼流之类的意外（比如环境里没有 MediaStream 构造器）。
          setError({
            kind: 'other',
            text: `打不开摄像头/麦克风：${failure instanceof Error ? failure.message : String(failure)}`,
            action: '可以先用键盘继续面试。',
          })
          return undefined
        } finally {
          setBusy(false)
          watch()
        }
      }, [cameraBlockedError, probe, request, watch])

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
     * The Host-side camera — the way to get a picture inside the desktop host.
     *
     * **为什么需要它。** DSH 桌面端的 Electron 权限处理器（读自 `app.asar`）
     * 只放行 `mediaTypes === ['audio']` 的纯音频请求，摄像头在**主进程**就被
     * `callback(false)` 拒了——连系统权限窗口都不弹。所以浏览器这条路在桌面端
     * 是死的，改 Windows 设置也没用。
     *
     * 但插件的 Host 半边跑在 Node 宿主进程里，**没有那道闸门**：它能用
     * ffmpeg 直接打开摄像头，把画面以 MJPEG 流推回来。
     *
     * **浏览器端一行 JS 都不用写**：`<img src>` 直接吃
     * `multipart/x-mixed-replace` 流。
     *
     * **和浏览器的摄像头是二选一。** 摄像头设备是独占的（实测：第二个进程
     * 打开直接 I/O error），所以两边不能同时开。这个 hook 只在浏览器的
     * `getUserMedia` 拿不到画面时才启用。
     */
    function useHostCamera() {
      const [state, setState] = useState({ active: false, busy: false, error: undefined, recording: false })

      /**
       * Ask the Host to open the camera.
       *
       * @returns {Promise<boolean>} whether the camera came up
       */
      const start = useCallback(async () => {
        setState(previous => ({ ...previous, busy: true, error: undefined }))
        try {
          await apiPost('camera/start', {})
          setState({ active: true, busy: false, error: undefined, recording: false })
          return true
        } catch (error) {
          setState({
            active: false,
            busy: false,
            error: {
              kind: 'host-camera',
              text: error instanceof Error ? error.message : String(error),
              action: 'Host 侧的摄像头通路没起来。装一个 ffmpeg（或在插件配置里写上它的路径）就能用；'
                + '面试照常进行，语音提问、文字回答、录音都不受影响。',
            },
          })
          return false
        }
      }, [])

      /**
       * Ask the Host to release the camera.
       *
       * @returns {Promise<void>}
       */
      const stop = useCallback(async () => {
        try {
          await apiPost('camera/stop', {})
        } catch {
          // 停不掉也不要紧——宿主重启时会释放摄像头。
        }
        setState({ active: false, busy: false, error: undefined, recording: false })
      }, [])

      /**
       * Start recording on the Host side.
       *
       * @param {string} sessionId
       * @returns {Promise<boolean>}
       */
      const startRecording = useCallback(async sessionId => {
        if (sessionId === '') return false
        try {
          await apiPost('camera/record/start', { sessionId })
          setState(previous => ({ ...previous, recording: true }))
          return true
        } catch (error) {
          setState(previous => ({
            ...previous,
            error: {
              kind: 'host-camera',
              text: error instanceof Error ? error.message : String(error),
              action: '录像开不了。画面本身不受影响，面试可以继续。',
            },
          }))
          return false
        }
      }, [])

      /**
       * Stop recording; the finished file is already in the session's folder.
       *
       * @param {string} sessionId
       * @returns {Promise<object|undefined>}
       */
      const stopRecording = useCallback(async sessionId => {
        try {
          const result = await apiPost('camera/record/stop', { sessionId })
          setState(previous => ({ ...previous, recording: false }))
          return result
        } catch (error) {
          setState(previous => ({
            ...previous,
            recording: false,
            error: {
              kind: 'host-camera',
              text: error instanceof Error ? error.message : String(error),
              action: '录像收尾没成功。面试可以继续。',
            },
          }))
          return undefined
        }
      }, [])

      useEffect(() => () => {
        // 组件卸载时把摄像头还回去——不然它会一直被独占着。
        apiPost('camera/stop', {}).catch(() => {})
      }, [])

      return { ...state, start, stop, startRecording, stopRecording }
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
        const mimeType = pickMimeType(stream)
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

    /**
     * The best mime type this browser supports for MediaRecorder.
     *
     * **要按流里有没有视频轨来挑。** 只有麦克风的时候还去用
     * `video/webm`，MediaRecorder 会因为「流和容器对不上」直接抛错，
     * 录音就录不成——而这时候录音恰恰是唯一还能用的那部分。
     */
    function pickMimeType(stream) {
      const withVideo = stream !== undefined
        && typeof stream.getVideoTracks === 'function'
        && stream.getVideoTracks().length > 0
      const candidates = withVideo
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm']
        : ['audio/webm;codecs=opus', 'audio/webm']
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

