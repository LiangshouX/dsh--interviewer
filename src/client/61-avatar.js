    // ── 虚拟面试官（预置形象，舞台右上角）─────────────────────────────────
    //
    // **它是什么。** 一个 WebGL2 canvas，跑 mesh-avatar 运行时（MIT，随包分发），
    // 由话轮相态驱动姿态，由**面试官自己的 TTS 音频包络**驱动口型。
    //
    // **它不是什么。** 不是聊天框、不是第二套状态机、不持有任何面试规则。
    // 题目由宿主侧的 agent 写，形象只负责把「谁在说、说到哪了」演出来。
    //
    // 四条纪律：
    //  1. **按需加载。** 运行时 187KB；DSH 页面本来只加载一个 client.js，
    //     内联进去等于让所有用户都背着它。所以进面试间才取。
    //  2. **口型值不进 state。** 每帧都在变的值放进 useState 就是每帧重渲染
    //     整个面板 —— 直接踩穿「空闲轮询重渲染 = 0 次」的红线（AGENTS §11）。
    //     所以音频侧只给一个**恒定身份**的读取函数，值的生命在 ref 里。
    //  3. **只认已有状态。** 表演由 `turnPhase` 驱动，不再造一套「形象相位」：
    //     两份真相必然出现「状态机说在听、形象在说」的错位。
    //  4. **形象是增强，不是前提。** 运行时挂了、WebGL2 没有、资源 404 ——
    //     都只是舞台上没那张脸，面试照常。

    /** Host 的只读资源路由（src/host/avatar.js）。 */
    const AVATAR_ASSET_PATH = '/interviewer/avatar/asset/'
    const AVATAR_RUNTIME_URL = AVATAR_ASSET_PATH + 'vendor/mesh-avatar.js'
    const AVATAR_AVATAR_URL = AVATAR_ASSET_PATH + 'avatar/interviewer/'
    const AVATAR_ASSETS_URL = AVATAR_AVATAR_URL + 'built/'

    /** 运行时只取一次；失败把 promise 清掉，下次进面试间再试。 */
    let avatarRuntimePromise

    /**
     * 取渲染运行时（classic script，挂 `window.MeshAvatar`）。
     *
     * @returns {Promise<object|undefined>}
     */
    function loadAvatarRuntime() {
      if (avatarRuntimePromise !== undefined) return avatarRuntimePromise
      avatarRuntimePromise = new Promise(settle => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
          settle(undefined)
          return
        }
        if (window.MeshAvatar !== undefined) {
          settle(window.MeshAvatar)
          return
        }
        const script = document.createElement('script')
        script.src = AVATAR_RUNTIME_URL
        script.async = true
        script.onload = () => {
          if (window.MeshAvatar === undefined) {
            avatarRuntimePromise = undefined
            settle(undefined)
            return
          }
          settle(window.MeshAvatar)
        }
        script.onerror = () => {
          // 不缓存失败：Host 刚起来、包刚换过版本时，下一次还能成。
          avatarRuntimePromise = undefined
          settle(undefined)
        }
        document.head.appendChild(script)
      })
      return avatarRuntimePromise
    }

    /** 取一份形象 JSON；失败抛错（上层降级成「形象不可用」）。 */
    async function fetchAvatarJson(url) {
      const response = await fetch(url, { cache: 'no-cache' })
      if (!response.ok) throw new Error(`形象资源读不到（HTTP ${response.status}）`)
      return response.json()
    }

    /** 系统是否要求减少动效（AGENTS §10.0：所有动效都要尊重它）。 */
    function avatarReducedMotion() {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
      } catch {
        return false
      }
    }

    /** 把 -1..1 夹到给定幅度（别让眼球转出眼眶）。 */
    function avatarClamp(value, limit) {
      if (!Number.isFinite(value)) return 0
      return Math.max(-limit, Math.min(limit, value))
    }

    /**
     * 面试官此刻的样子。
     *
     * **幅度刻意压小。** 面试官是真人，不是卡通：头最多偏 5°，身体几乎不动。
     * 手边这个函数是**纯函数**（输入相位与时间），不读 state、不写 state——
     * 它每帧被 rAF 调用一次。
     *
     * @param {string} phase 'idle' | 'questioning' | 'listening' | 'submitting' | 'thinking'
     * @param {number} clock 秒
     * @param {{x: number, y: number}} gaze 眼球偏移（-1..1，已限幅）
     * @param {number} blink 0..1（1 = 睁眼）
     * @param {boolean} reduced 减少动效
     */
    function avatarPose(phase, clock, gaze, blink, reduced) {
      const pose = {
        // mesh-avatar 的参数表（PARAMS）：头/身体/眼/视线/嘴/呼吸。
        angleX: 0, angleY: 0, angleZ: 0,
        bodyAngleX: 0, bodyAngleZ: 0,
        breath: 0.32,
        eyeLOpen: blink, eyeROpen: blink,
        eyeSmile: 0, eyeSmileL: 0,
        // ★ 运行时里这一对叫 gazeX / gazeY（不是 eyeBallX / eyeBallY）。
        gazeX: gaze.x, gazeY: gaze.y,
        browY: 0, browAngle: 0,
        mouthOpen: 0, mouthForm: 0,
      }
      if (phase === 'questioning') {
        // 说话：轻微前倾 + 极轻的头部起伏。
        pose.angleY = 2 + Math.sin(clock * 2.1) * 1
        pose.browY = 0.08
      } else if (phase === 'thinking') {
        pose.angleZ = 5
        pose.angleX = -1.5
        pose.gazeX = 0.14
        pose.gazeY = -0.32
      } else if (phase === 'listening') {
        // 听：头跟着视线走一点，视线由调用方给（跟指针）。
        pose.angleZ = gaze.x * 1.6
        pose.angleX = gaze.y * 1.2
        pose.angleY = 0.6
      } else if (phase === 'submitting') {
        pose.angleY = 3
        pose.angleX = 1.1 + Math.sin(clock * 1.4) * 0.8
      } else {
        // 待机：呼吸 + 视线缓慢游移 + 偶尔眨眼。**不能是一张贴纸。**
        pose.angleY = Math.sin(clock * 0.55) * 0.9
        pose.angleZ = Math.sin(clock * 0.42) * 0.8
      }
      if (!reduced) {
        pose.breath = 0.3 + Math.sin(clock * 1.45) * 0.14
        pose.bodyAngleZ = Math.sin(clock * 0.7) * 0.5
      }
      return pose
    }

    /**
     * The 2D interviewer on the stage.
     *
     * @param {object} props
     * @param {string} props.phase 话轮相态（唯一真源在 LiveView）
     * @param {boolean} [props.speaking] 播报**音频**正在播（`tts.speaking`）
     * @param {() => number} [props.readLevel] 读当前播报音量 0..1（**非响应式**）
     * @param {boolean} [props.enabled]
     */
    function useAvatar({ phase, speaking = false, readLevel, enabled = true }) {
      const canvasRef = useRef(null)
      const [state, setState] = useState({ status: 'idle', error: undefined })
      const phaseRef = useRef(phase)
      phaseRef.current = phase
      const speakingRef = useRef(speaking)
      speakingRef.current = speaking
      const readLevelRef = useRef(readLevel)
      readLevelRef.current = readLevel

      useEffect(() => {
        if (!enabled) return undefined
        if (typeof window === 'undefined') return undefined
        const canvas = canvasRef.current
        if (canvas === null || canvas === undefined) return undefined

        let disposed = false
        /** 循环内部的可变状态全部活在这个闭包里：不碰 React，也不触发渲染。 */
        let clock = 0
        let lastFrame = 0
        let frameHandle
        /** 指针在舞台里的归一化位置（-0.6..0.6），听的时候眼球跟着它。 */
        let pointer
        const gaze = { x: 0, y: 0 }
        const blink = { at: -1, next: 1.6 }
        let avatar
        const reduced = avatarReducedMotion()

        /** 眨眼节奏：3.4–6.6 秒一次，闭合 170ms。比机器更像人。 */
        const blinkValue = now => {
          if (now >= blink.next) {
            blink.at = now
            blink.next = now + 3.4 + Math.random() * 3.2
          }
          const since = now - blink.at
          if (since < 0 || since > 0.17) return 1
          const t = since / 0.17
          return 1 - 0.95 * (t < 0.45 ? t / 0.45 : (1 - t) / 0.55)
        }

        /** 视线的目标点：听的时候跟指针，想的时候往上，其余缓慢游移。 */
        const gazeTarget = now => {
          if (phaseRef.current === 'listening' && pointer !== undefined) return pointer
          if (phaseRef.current === 'thinking') return { x: 0.14, y: -0.32 }
          return { x: Math.sin(now * 0.31) * 0.16, y: Math.sin(now * 0.23) * 0.08 }
        }

        // **监听的是舞台，不是这个小窗。** 盯着小窗才跟指针 = 指针几乎永远不在
        // 里面，视线就跟死了一样。舞台上有 `data-iv-stage` 标记（80-views），
        // 用它往上找；找不到（测试桩）就退回直接父节点。
        const stage = typeof canvas.closest === 'function'
          ? (canvas.closest('[data-iv-stage]') ?? canvas.parentElement)
          : canvas.parentElement
        const onPointerMove = event => {
          const rect = stage.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return
          pointer = {
            x: avatarClamp(((event.clientX - rect.left) / rect.width) * 2 - 1, 0.6),
            // gazeY 正值 = 往上看（运行时里已经做过符号翻转）。
            y: avatarClamp(1 - ((event.clientY - rect.top) / rect.height) * 2, 0.6),
          }
        }
        const onPointerLeave = () => { pointer = undefined }
        if (stage !== null && stage !== undefined && typeof stage.addEventListener === 'function') {
          stage.addEventListener('pointermove', onPointerMove, { passive: true })
          stage.addEventListener('pointerleave', onPointerLeave, { passive: true })
        }

        const tick = now => {
          if (disposed) return
          const seconds = now / 1000
          const dt = lastFrame === 0 ? 0.016 : Math.min(0.05, (now - lastFrame) / 1000)
          lastFrame = now
          clock += dt
          if (avatar !== undefined) {
            const target = gazeTarget(clock)
            // 平滑趋近：眼睛不会瞬移（0.18/帧 的量级，60fps 下 ~80ms 跟上）。
            gaze.x += (target.x - gaze.x) * 0.18
            gaze.y += (target.y - gaze.y) * 0.18
            const level = Math.min(1, Math.max(0, Number(readLevelRef.current?.()) || 0))
            // **嘴跟着自己的音频动，不跟着状态机的意见动。**
            // 相态是"这一轮进行到哪"（提问 / 听 / 想），而播放可能发生在别的
            // 相态里（重播问题、助手追问）。所以口型只看两件事：**有音频在播**
            // 且**真的有声**。走浏览器音色时 `readLevel` 恒为 0 → 嘴不动，诚实降级。
            const talking = speakingRef.current === true && level > 0.02
            avatar.setSpeaking(talking)
            avatar.setVoiceLevel(talking ? level : 0)
            avatar.setParameters(avatarPose(phaseRef.current, clock, gaze, blinkValue(clock), reduced))
            avatar.advance(dt, 60)
          }
          frameHandle = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(tick)
            : undefined
          // 没有 rAF（测试沙箱/内嵌 WebView）就不要空转：一次性画完就停。
          if (frameHandle === undefined) stop()
        }

        /** 卸下运行时：WebGL 上下文很贵，离开面试间要还回去。 */
        function stop() {
          if (typeof cancelAnimationFrame === 'function' && frameHandle !== undefined) {
            cancelAnimationFrame(frameHandle)
          }
          frameHandle = undefined
          if (stage !== null && stage !== undefined && typeof stage.removeEventListener === 'function') {
            stage.removeEventListener('pointermove', onPointerMove)
            stage.removeEventListener('pointerleave', onPointerLeave)
          }
          if (avatar !== undefined) {
            try { avatar.destroy() } catch { /* 已经没了 */ }
            avatar = undefined
          }
        }

        void (async () => {
          try {
            setState({ status: 'loading', error: undefined })
            const runtime = await loadAvatarRuntime()
            if (disposed) return
            if (runtime === undefined) throw new Error('形象运行时没装上')
            const [rig, manifest] = await Promise.all([
              fetchAvatarJson(AVATAR_AVATAR_URL + 'rig.json'),
              fetchAvatarJson(AVATAR_AVATAR_URL + 'avatar.json'),
            ])
            if (disposed) return
            avatar = await runtime.createMeshAvatar(canvas, {
              rig,
              assetsBase: AVATAR_ASSETS_URL,
              // manual：本模块自己推进时间（不再有内置 idle/眨眼/表情叠层）。
              // 代价是眨眼与视线必须自己算 —— avatarPose 就是干这个的。
              manual: true,
              padTop: rig?.view?.padTop,
              padSide: rig?.view?.padSide,
            })
            if (disposed) {
              try { avatar.destroy() } catch { /* 已经没了 */ }
              avatar = undefined
              return
            }
            // 内置的自动表演全关：表演层只有一处（avatarPose）。
            avatar.setAutoIdle(false)
            avatar.setAutoMotion(false)
            if (manifest?.lipSync !== undefined) avatar.setLipSync(manifest.lipSync)
            setState({ status: 'ready', error: undefined })
            if (typeof requestAnimationFrame === 'function') frameHandle = requestAnimationFrame(tick)
            else tick(performance.now())
          } catch (error) {
            if (disposed) return
            setState({
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })()

        return () => {
          disposed = true
          stop()
        }
      }, [enabled])

      return { canvasRef, state }
    }

    /**
     * 舞台右上角的画中画：面试官。
     *
     * **为什么是右上角。** 视频会议里"远端参会者"的标准位置（Zoom/Teams 惯例）；
     * 左下角是提问字幕条（下三分之一，AGENTS §10.0 纪律 2），分屏又会缩小
     * 候选人画面 —— 舞台永远是主位。
     *
     * @param {object} props
     * @param {string} props.phase
     * @param {boolean} props.speaking
     * @param {() => number} props.readLevel
     */
    function AvatarPiP(props) {
      const { canvasRef, state } = useAvatar({
        phase: props.phase,
        speaking: props.speaking,
        readLevel: props.readLevel,
      })
      const failed = state.status === 'failed'
      return h('div', {
        key: 'avatar',
        'data-iv-avatar': '1',
        role: 'img',
        'aria-label': '虚拟面试官',
        title: failed ? `形象不可用：${state.error ?? '未知原因'}（面试照常）` : '虚拟面试官',
        style: {
          position: 'absolute', top: 12, right: 12, zIndex: 2,
          // 小窗但不至于看不清：窄面板上是 112px，宽舞台上封顶 200px。
          width: 'clamp(112px, 24%, 200px)', aspectRatio: '1 / 1',
          borderRadius: RADIUS.lg, overflow: 'hidden',
          background: `radial-gradient(circle at 50% 32%, ${C.plateTop} 0%, ${C.plateMid} 66%, ${C.plateLow} 100%)`,
          border: `1px solid ${C.ruleSoft}`,
          boxShadow: C.elev2,
          // 它只展示，不接管点击：底下的画面/按钮该怎么点还怎么点。
          pointerEvents: 'none',
        },
      }, [
        h('canvas', {
          key: 'c',
          ref: canvasRef,
          width: 320, height: 320,
          style: { display: 'block', width: '100%', height: '100%' },
        }),
        failed
          ? h('div', {
            key: 'fail',
            style: {
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              background: `radial-gradient(circle at 50% 40%, ${C.plateTop} 0%, ${C.plateMid} 70%, ${C.plateLow} 100%)`,
              textAlign: 'center', padding: 8,
            },
          }, [
            h('div', {
              key: 'who',
              style: { ...TYPE.nano, fontFamily: F.mono, letterSpacing: '0.16em', color: C.boneFaint },
            }, '面试官'),
            h('div', { key: 'what', style: { ...TYPE.sub, color: C.boneDim } }, '形象不可用'),
            // 失败必须给出路（AGENTS §7）：出路就是——面试照常。
            h('div', { key: 'way', style: { ...TYPE.meta, color: C.boneFaint } }, '面试照常进行'),
          ])
          : null,
      ])
    }
