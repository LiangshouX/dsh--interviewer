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
        'theme.dark': '暗色',
        'theme.light': '亮色',
        'theme.toDark': '切换到暗色主题',
        'theme.toLight': '切换到亮色主题',
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
        'theme.dark': 'Dark',
        'theme.light': 'Light',
        'theme.toDark': 'Switch to the dark theme',
        'theme.toLight': 'Switch to the light theme',
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
    //
    // **颜色一律写成 CSS 变量。**
    //
    // 为什么不是「两份 JS 调色板，切换时换一份」：那样每一处颜色都得改成
    // 「读当前主题」，漏一处就是一块不换色的斑。而变量是浏览器自己解析的——
    // 切换主题只需要改根节点上的自定义属性，其余一律自动跟着变。
    const C = {
      ink900: 'var(--iv-ink900)',
      ink850: 'var(--iv-ink850)',
      ink800: 'var(--iv-ink800)',
      ink750: 'var(--iv-ink750)',
      ink700: 'var(--iv-ink700)',
      rule: 'var(--iv-rule)',
      ruleSoft: 'var(--iv-rule-soft)',
      bone: 'var(--iv-bone)',
      boneDim: 'var(--iv-bone-dim)',
      boneFaint: 'var(--iv-bone-faint)',
      tally: 'var(--iv-tally)',
      amber: 'var(--iv-amber)',
      jade: 'var(--iv-jade)',
      // 输入框底色：深色下比底再深一点，亮色下是纯白纸面。
      field: 'var(--iv-field)',
      // 「主色块上的字」：深色主题下是浅底深字，亮色主题下反过来。
      onBone: 'var(--iv-on-bone)',
      stage: 'var(--iv-stage)',
      plateTop: 'var(--iv-plate-top)',
      plateMid: 'var(--iv-plate-mid)',
      plateLow: 'var(--iv-plate-low)',
      cueTop: 'var(--iv-cue-top)',
      cueMid: 'var(--iv-cue-mid)',
      cueLow: 'var(--iv-cue-low)',
      band: 'var(--iv-band)',
      clock: 'var(--iv-clock)',
      shadow: 'var(--iv-shadow)',
      sheen: 'var(--iv-sheen)',
      fade: 'var(--iv-fade)',
    }

    /**
     * 语气色（tone）：一组「同色不同浓度」的颜色。
     *
     * 徽章、清单序号、提示条都要「同一种颜色配三种浓度」——
     * 文字色、描边色、底色。以前是拿十六进制拼 `${color}55`，
     * 换成 CSS 变量后那种拼法就不成立了（`var(--x)55` 不是合法颜色），
     * 所以每种语气在两套主题下都各配齐三样。
     */
    const TONES = {
      faint: { text: 'var(--iv-tone-faint-text)', edge: 'var(--iv-tone-faint-edge)', wash: 'var(--iv-tone-faint-wash)' },
      amber: { text: 'var(--iv-tone-amber-text)', edge: 'var(--iv-tone-amber-edge)', wash: 'var(--iv-tone-amber-wash)' },
      jade: { text: 'var(--iv-tone-jade-text)', edge: 'var(--iv-tone-jade-edge)', wash: 'var(--iv-tone-jade-wash)' },
      tally: {
        text: 'var(--iv-tone-tally-text)',
        edge: 'var(--iv-tone-tally-edge)',
        wash: 'var(--iv-tone-tally-wash)',
        glow: 'var(--iv-tone-tally-glow)',
      },
    }

    /**
     * 两套主题。
     *
     * **暗色**是原来的样子：墨底、骨白字。
     * **亮色**是纸面：卷宗本来就是纸，这套底色让「归档」那部分更像纸。
     *
     * 亮色下的强调色都**压深了一档**——同一个色相在白底上太浅，
     * 文字对比度会掉到读不清。
     */
    const THEMES = {
      dark: {
        '--iv-ink900': '#0E1116',
        '--iv-ink850': '#131820',
        '--iv-ink800': '#1A2029',
        '--iv-ink750': '#202833',
        '--iv-ink700': '#28313E',
        '--iv-rule': '#232B36',
        '--iv-rule-soft': '#1D242D',
        '--iv-bone': '#E9E5DB',
        '--iv-bone-dim': '#A5ACB7',
        '--iv-bone-faint': '#6C7480',
        '--iv-tally': '#E0563F',
        '--iv-amber': '#D9A441',
        '--iv-jade': '#4FA98C',
        '--iv-field': '#0F131A',
        '--iv-on-bone': '#11151C',
        '--iv-stage': '#0A0D11',
        '--iv-plate-top': '#171E28',
        '--iv-plate-mid': '#0C0F14',
        '--iv-plate-low': '#090B0E',
        '--iv-cue-top': 'rgba(7,9,13,0)',
        '--iv-cue-mid': 'rgba(7,9,13,0.82)',
        '--iv-cue-low': 'rgba(7,9,13,0.96)',
        '--iv-band': 'rgba(9,11,14,0.96)',
        '--iv-clock': 'rgba(10,13,17,0.72)',
        '--iv-shadow': 'rgba(0,0,0,0.95)',
        '--iv-sheen': 'rgba(233,229,219,0.035)',
        '--iv-fade': 'rgba(17,21,28,0)',
        '--iv-tone-faint-text': '#6C7480',
        '--iv-tone-faint-edge': 'rgba(108,116,128,0.33)',
        '--iv-tone-faint-wash': 'rgba(108,116,128,0.09)',
        '--iv-tone-amber-text': '#D9A441',
        '--iv-tone-amber-edge': 'rgba(217,164,65,0.33)',
        '--iv-tone-amber-wash': 'rgba(217,164,65,0.08)',
        '--iv-tone-jade-text': '#4FA98C',
        '--iv-tone-jade-edge': 'rgba(79,169,140,0.35)',
        '--iv-tone-jade-wash': 'rgba(79,169,140,0.08)',
        '--iv-tone-tally-text': '#E0563F',
        '--iv-tone-tally-edge': 'rgba(224,86,63,0.4)',
        '--iv-tone-tally-wash': 'rgba(224,86,63,0.12)',
        '--iv-tone-tally-glow': 'rgba(224,86,63,0.55)',
      },
      light: {
        '--iv-ink900': '#F3F1EA',
        '--iv-ink850': '#FAF8F2',
        '--iv-ink800': '#FFFFFF',
        '--iv-ink750': '#F0EDE4',
        '--iv-ink700': '#E7E3D9',
        '--iv-rule': '#D9D4C7',
        '--iv-rule-soft': '#E6E2D7',
        '--iv-bone': '#1F242E',
        '--iv-bone-dim': '#4B5462',
        '--iv-bone-faint': '#7E8794',
        '--iv-tally': '#C0402A',
        '--iv-amber': '#9A6B12',
        '--iv-jade': '#2E7C63',
        '--iv-field': '#FFFFFF',
        '--iv-on-bone': '#F7F5F0',
        '--iv-stage': '#E9E5DA',
        '--iv-plate-top': '#FFFFFF',
        '--iv-plate-mid': '#F4F1E9',
        '--iv-plate-low': '#EAE6DB',
        '--iv-cue-top': 'rgba(255,255,255,0)',
        '--iv-cue-mid': 'rgba(248,246,240,0.88)',
        '--iv-cue-low': 'rgba(246,243,236,0.97)',
        '--iv-band': 'rgba(250,248,243,0.97)',
        '--iv-clock': 'rgba(255,255,255,0.85)',
        '--iv-shadow': 'rgba(58,50,36,0.16)',
        '--iv-sheen': 'rgba(255,255,255,0.65)',
        '--iv-fade': 'rgba(255,255,255,0)',
        '--iv-tone-faint-text': '#7E8794',
        '--iv-tone-faint-edge': 'rgba(126,135,148,0.35)',
        '--iv-tone-faint-wash': 'rgba(126,135,148,0.10)',
        '--iv-tone-amber-text': '#9A6B12',
        '--iv-tone-amber-edge': 'rgba(154,107,18,0.35)',
        '--iv-tone-amber-wash': 'rgba(154,107,18,0.10)',
        '--iv-tone-jade-text': '#2E7C63',
        '--iv-tone-jade-edge': 'rgba(46,124,99,0.38)',
        '--iv-tone-jade-wash': 'rgba(46,124,99,0.10)',
        '--iv-tone-tally-text': '#C0402A',
        '--iv-tone-tally-edge': 'rgba(192,64,42,0.45)',
        '--iv-tone-tally-wash': 'rgba(192,64,42,0.12)',
        '--iv-tone-tally-glow': 'rgba(192,64,42,0.40)',
      },
    }

    /** 主题在 localStorage 里的键。存的是用户的**选择**，不是系统设置。 */
    const THEME_KEY = 'dsh-interviewer.theme'

    /**
     * 读用户上次选的主题。
     *
     * 读不到就用暗色——这是这个插件一直以来的样子；
     * localStorage 不可用（隐私模式）时也不能报错，所以整段都包起来。
     */
    function readTheme() {
      try {
        const stored = window.localStorage.getItem(THEME_KEY)
        if (stored === 'light' || stored === 'dark') return stored
      } catch {
        // 读不到就用默认。
      }
      return 'dark'
    }

    /** 记住用户选的主题。存不进去也不该拦住切换。 */
    function saveTheme(theme) {
      try {
        window.localStorage.setItem(THEME_KEY, theme)
      } catch {
        // 存不下就算了，这次切换照样生效。
      }
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
        boxShadow: `inset 0 1px 0 ${C.sheen}, 0 18px 40px -32px ${C.shadow}`,
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
        width: '100%', boxSizing: 'border-box', background: C.field, color: C.bone,
        border: `1px solid ${C.rule}`, borderRadius: 9, padding: '9px 12px', fontSize: 13,
        fontFamily: F.ui, outline: 'none', transition: 'border-color 140ms ease, box-shadow 140ms ease',
      },
      textarea: {
        width: '100%', boxSizing: 'border-box', background: C.field, color: C.bone,
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
            ...base, background: C.bone, color: C.onBone, borderColor: C.bone, fontWeight: 600,
            opacity: disabled ? 0.4 : 1,
          }
        }
        if (kind === 'tally') {
          return { ...base, background: TONES.tally.wash, color: C.tally, borderColor: TONES.tally.edge, opacity: disabled ? 0.45 : 1 }
        }
        return { ...base, background: C.ink800, color: C.boneDim, opacity: disabled ? 0.45 : 1 }
      },
      row: { display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' },
      mono: { fontFamily: F.mono },
      pill: (tone) => {
        const colors = TONES[tone] ?? TONES.faint
        return {
          fontFamily: F.mono, fontSize: 10, padding: '2px 8px', borderRadius: 999,
          border: `1px solid ${colors.edge}`, color: colors.text, background: colors.wash, whiteSpace: 'nowrap',
          letterSpacing: '0.04em', alignSelf: 'flex-start', lineHeight: 1.6,
        }
      },
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
          props.badge !== undefined ? h('span', { key: 'badge', style: S.pill('faint') }, props.badge) : null,
        ]),
        open ? h('div', { key: 'body', style: { borderTop: `1px solid ${C.ruleSoft}`, paddingTop: 12 } }, props.children) : null,
      ])
    }

    /** One checklist item row. */
    function ChecklistRow(props) {
      const item = props.item
      const levelTone = item.level === 'core' ? 'tally' : item.level === 'deep' ? 'amber' : 'faint'
      const levelText = item.level === 'core' ? '必问' : item.level === 'deep' ? '深挖' : '加分'
      return h('div', {
        style: {
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '10px 0', borderBottom: `1px solid ${C.ruleSoft}`,
        },
      }, [
        h('span', { key: 'lvl', style: S.pill(levelTone) }, levelText),
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
            boxShadow: on ? `0 0 0 3px ${TONES.tally.wash}, 0 0 14px ${TONES.tally.glow}` : 'none',
            transition: 'box-shadow 200ms ease',
          },
        }),
        h('span', { key: 'text' }, on ? 'REC' : 'STBY'),
      ])
    }

    /**
     * The clock + tally badge.
     *
     * 有摄像头时它压在画面右上角；没摄像头时它进板子的标题行——
     * 绝对定位的计时器在窄面板下会正好压住居中的标题。
     *
     * **它是个组件，不是工厂。** 工厂（`clockBadge(true)`）在数组里直接
     * 调用时，key 就没法由调用方给，`scripts/fix-keys.mjs` 会拦下。
     * 而且定义在渲染函数里的组件每帧都是新函数，React 会把它当成
     * 另一个组件卸载重建——所以它必须待在模块作用域。
     *
     * @param {{durationMs?: number, recording?: boolean, absolute?: boolean}} props
     */
    function ClockBadge(props) {
      const absolute = props.absolute === true
      return h('div', {
        style: {
          position: absolute ? 'absolute' : 'relative',
          top: absolute ? 14 : undefined,
          right: absolute ? 16 : undefined,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '5px 11px', borderRadius: 8, background: C.clock,
          border: `1px solid ${C.rule}`,
        },
      }, [
        h('span', { key: 't', style: { ...S.mono, fontSize: 12, color: C.boneDim, letterSpacing: '0.06em' } },
          formatClock(props.durationMs ?? 0)),
        h(Tally, { key: 'r', on: props.recording === true }),
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
            style: { ...S.mono, background: C.field, padding: '2px 6px', borderRadius: 5, fontSize: 12, color: C.amber },
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
          position: 'relative', background: C.field, border: `1px solid ${C.rule}`,
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
              background: 'linear-gradient(180deg, ' + C.fade + ' 0%, ' + C.field + ' 92%)',
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
          // 流程脊线的圆点也走语气色——它要表达「走到哪一步」，
          // 和徽章、序号是同一套语言。
          const dot = TONES[done ? 'jade' : current ? 'amber' : 'faint']
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
                  border: `1px solid ${dot.edge}`,
                  background: current ? dot.wash : 'transparent',
                  color: dot.text,
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
      // 这场面试叫什么、在哪家、什么岗位——用户可以直接改。
      const [identity, setIdentity] = useState({ title: '', company: '', position: '' })
      const profilesPoll = usePoll(
        () => apiGet('profiles'),
        10000,
        [],
        data => (data?.profiles ?? []).map(row => `${row.id}:${row.updatedAt}:${row.checklistCount}`).join(','),
      )
      // 简历库：简历不会每场都变，存一次就能一直用。
      const resumesPoll = usePoll(
        () => apiGet('resumes'),
        15000,
        [],
        data => (data?.resumes ?? []).map(row => `${row.id}:${row.updatedAt}:${row.title}:${row.chars}`).join(','),
      )

      const sessionId = session?.session?.id

      // 服务端会从 JD 正文里提炼公司与岗位（提炼不出来就留空）。
      // 提炼出来的值要显示出来，也允许用户改——**认错了就该能改**。
      const identityTouched = useRef(false)
      useEffect(() => { identityTouched.current = false }, [session?.session?.id])
      useEffect(() => {
        const meta = session?.session
        if (meta === undefined) return
        // 用户正在改的时候别覆盖他的输入。
        if (identityTouched.current) return
        setIdentity({
          title: meta.title ?? '',
          company: meta.company ?? '',
          position: meta.position ?? '',
        })
      }, [session?.session?.id, session?.session?.title, session?.session?.company, session?.session?.position])

      // **归档正文单独取一次。** 它跟着 1.5 秒的轮询传是纯浪费——
      // 简历几十 KB，而且只有准备页需要它。
      const docsPoll = usePoll(
        () => (sessionId === undefined ? Promise.resolve(undefined) : apiGet(`sessions/${sessionId}/documents`)),
        undefined,
        [sessionId],
      )

      const profiles = profilesPoll.data?.profiles ?? []
      const resumes = resumesPoll.data?.resumes ?? []

      // 存进简历库时给个**能认出来**的名字。
      // 「面试 2026-11-16」这种默认标题进库等于没存——库里全是这种名字，
      // 选的时候还是认不出来。
      const libraryTitle = (() => {
        const company = (session?.session?.company ?? '').trim()
        const position = (session?.session?.position ?? '').trim()
        if (company !== '' && position !== '') return `${company} · ${position}`
        if (position !== '') return position
        if (company !== '') return company
        const title = (session?.session?.title ?? '').trim()
        return /^面试 \d{4}-\d{2}-\d{2}$/.test(title) ? '' : title
      })()

      // 助手把 JD 写回来之后，正文得跟着更新。
      //
      // **不轮询正文，只看字数。** 简历动辄几十 KB，每 6 秒拉一次
      // 是白拉；而「字数变了」就足以说明正文变了——所以拿字数当指纹，
      // 变了才去取一次。
      const docFingerprint = `${session?.documents?.resumeChars ?? 0}:${session?.documents?.jdChars ?? 0}`
      const lastDocFingerprint = useRef(docFingerprint)
      useEffect(() => {
        // 第一次不刷：文档本来就是刚取来的。
        if (lastDocFingerprint.current === docFingerprint) return
        lastDocFingerprint.current = docFingerprint
        void docsPoll.refresh()
      }, [docFingerprint])

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
            // 抓不到不是死路：**给一条能走的路**。
            // 所以这里除了说清楚卡在哪，还把「让助手去抓」摆出来。
            setJdNote({ ok: false, text: `${result.error}。${result.hint}`, canAsk: true })
          }
        } catch (failure) {
          setJdNote({
            ok: false,
            text: `${failure instanceof Error ? failure.message : String(failure)}`,
            canAsk: true,
          })
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

      // ── 简历库 ──────────────────────────────────────────────────────
      //
      // **简历不是每场面试都变的。** 让用户每一场都重新上传同一份简历，
      // 是把「一次录入」变成「N 次录入」。所以简历单独存在工作区里，
      // 每场面试只引用它。
      const applyResume = useCallback(async resumeId => {
        setBusy(true)
        try {
          const result = await apiPost(`resumes/${resumeId}`, { sessionId })
          const title = result?.resume?.title ?? resumeId
          setResumeText(result?.resume?.text ?? '')
          setEditing(previous => ({ ...previous, resume: false }))
          notify(
            `换上了「${title}」`,
            '卷内存的是这一份的快照——以后改了简历，也不会动这场面试的记录。',
            'ok',
          )
          onChanged()
          void docsPoll.refresh()
        } catch (failure) {
          notify('换不了简历', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, onChanged, notify, docsPoll])

      /** 把这场面试的简历存进库。 */
      const saveToLibrary = useCallback(async () => {
        setBusy(true)
        try {
          const result = await apiPost('resumes', { sessionId, title: libraryTitle })
          notify(
            '存进简历库了',
            `以后新建面试可以直接选「${result?.resume?.title ?? '这份简历'}」。`,
            'ok',
          )
          void resumesPoll.refresh()
        } catch (failure) {
          notify('没存进去', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, libraryTitle, notify, resumesPoll])

      /** 从库里删掉一份简历。卷内已经用掉的快照不受影响。 */
      const deleteResume = useCallback(async resumeId => {
        setBusy(true)
        try {
          await apiPost(`resumes/${resumeId}/delete`, {})
          notify('删了', '已经用过的面试里存的快照还在。', 'ok')
          void resumesPoll.refresh()
        } catch (failure) {
          notify('没删掉', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [notify, resumesPoll])

      // ── 这场面试叫什么 ────────────────────────────────────────────────
      const saveIdentity = useCallback(async () => {
        setBusy(true)
        try {
          const company = identity.company.trim()
          const position = identity.position.trim()
          const patch = { company, position }
          // 标题还是默认的「面试 2026-11-16」，而岗位已经知道了——
          // 那就把标题补成人话：**列表里一眼认得出来**。
          const current = (session?.session?.title ?? '').trim()
          if (/^面试 \d{4}-\d{2}-\d{2}$/.test(current)) {
            const derived = company !== '' && position !== ''
              ? `${company} · ${position}`
              : (position !== '' ? position : company)
            if (derived !== '') patch.title = derived
          } else if (identity.title.trim() !== '') {
            patch.title = identity.title.trim()
          }
          await apiPost(`sessions/${sessionId}`, patch)
          identityTouched.current = false
          notify('记下了', '列表会按新的岗位分组。', 'ok')
          onChanged()
        } catch (failure) {
          notify('没改成', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, identity, session?.session?.title, onChanged, notify])

      // ── 让助手去抓 JD ────────────────────────────────────────────────
      //
      // **直连抓网页看着简单，实际最常挂在三件事上：** 登录墙、验证码、
      // 前端渲染的正文。宿主里的助手有浏览器，能把页面真的打开、看完、
      // 把正文抄下来——所以抓不到的时候，正确的做法不是让用户复制粘贴，
      // 而是**请助手去拿**。
      const askAgent = useCallback(async () => {
        if (jdUrl.trim() === '') {
          notify('没链接', '先把岗位链接填上，再交给助手。', 'error')
          return
        }
        setBusy(true)
        try {
          const result = await apiPost('jd/request-agent', { sessionId, url: jdUrl.trim() })
          const host = result?.hostSession ?? {}
          setJdNote({
            ok: true,
            text: `${result?.message ?? '已经交给助手了。'}`,
          })
          notify(
            '交给助手了',
            `发到 DSH 对话「${host.title || host.id || '当前对话'}」，在那边能看着它跑。抓到正文会自动回到这一场。`,
            'ok',
          )
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : String(failure)
          setJdNote({ ok: false, text: `${message}。可以改用下面的手动兜底：把正文粘进 JD 框里。` })
        } finally {
          setBusy(false)
        }
      }, [jdUrl, sessionId, notify])

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
                  // **空的那份也要能打开编辑器。**
                  // 空态上写着「或把正文粘进来」，却只有「上传文件」一个入口——
                  // 承诺了却给不出路。新场次里没文件也照样得能贴简历。
                  : h('button', { key: 'paste', style: S.btn(false, busy), onClick: options.onEdit }, '粘正文'),
                options.upload !== undefined ? options.upload : null,
                options.extraActions !== undefined ? options.extraActions : null,
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

      // ── 简历库 ──────────────────────────────────────────────────────
      //
      // 简历不会每场面试都变。存一次，之后每场直接选——
      // 这就是「新建面试时可以直接选」的地方。
      const libraryStrip = h('div', {
        key: 'lib',
        style: {
          border: `1px solid ${C.ruleSoft}`, borderRadius: 10, padding: '10px 12px',
          marginBottom: 14, background: C.ink850,
        },
      }, [
        h('div', {
          key: 'h',
          style: { ...S.row, justifyContent: 'space-between', marginBottom: resumes.length > 0 ? 6 : 2 },
        }, [
          h('span', { key: 't', style: { fontSize: 11.5, color: C.boneDim } }, `简历库 · ${resumes.length} 份`),
          h('span', { key: 'h2', style: S.hint }, '简历存一次，之后每场直接选'),
        ]),
        resumes.length === 0
          ? h('div', { key: 'e', style: S.hint },
            '还没有存过简历。归档简历后按「存进简历库」，以后新建面试就不用再传了。')
          : h('div', { key: 'l' }, resumes.map(item => h('div', {
            key: item.id,
            style: { display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' },
          }, [
            h('div', { key: 'b', style: { flex: '1 1 auto', minWidth: 0 } }, [
              h('div', {
                key: 't',
                style: { fontSize: 12.5, color: C.bone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
              }, item.title),
              h('div', { key: 'm', style: { ...S.mono, fontSize: 10, color: C.boneFaint, marginTop: 2 } },
                `${item.chars} 字${session?.session?.resumeId === item.id ? ' · 本场用的就是它' : ''}`),
            ]),
            h('button', {
              key: 'u',
              style: S.btn(false, busy),
              title: '把这份简历用到这场面试',
              onClick: () => applyResume(item.id),
            }, '用这份'),
            h('button', {
              key: 'x',
              title: '从简历库删掉（已经用过的面试里存的快照不受影响）',
              'aria-label': '从简历库删掉',
              style: { ...S.btn(false, busy), padding: '8px 10px' },
              onClick: () => deleteResume(item.id),
            }, '删'),
          ]))),
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
        // 「存进简历库」：存一次，以后每场面试直接选。
        extraActions: resumeArchived
          ? h('button', {
            key: 'lib',
            style: S.btn(false, busy),
            title: '把这份简历存进简历库，以后新建面试直接选',
            onClick: saveToLibrary,
          }, '存进简历库')
          : undefined,
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

        // ── 这场面试叫什么 ────────────────────────────────────────────
        //
        // **公司 · 岗位是从 JD 正文里提炼出来的。** 提炼不出来就留空，
        // 让用户自己写——但**认错了必须能改**，所以这三个框一直都在。
        h(Section, { key: 'id',
          title: '这场面试',
          extra: h('span', { style: { ...S.row } }, [
            // 归档了却还在主区显示着，得让人一眼看出来——
            // 否则「这场已经收起来了」这件事就没人知道。
            session?.session?.archived === true
              ? h('span', { key: 'a', style: S.pill('amber') }, '已归档')
              : null,
            h('span', { key: 'h', style: S.hint }, '归档 JD 后自动提炼；认不出来就自己写'),
          ]),
        }, [
          h('div', {
            key: 'row',
            style: {
              display: 'grid', gap: 12, alignItems: 'end',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            },
          }, [
            h(Field, { key: 'c',
              label: '公司',
              value: identity.company,
              placeholder: '例如：字节跳动',
              onChange: value => { identityTouched.current = true; setIdentity(previous => ({ ...previous, company: value })) },
            }),
            h(Field, { key: 'p',
              label: '岗位',
              value: identity.position,
              placeholder: '例如：前端工程师',
              onChange: value => { identityTouched.current = true; setIdentity(previous => ({ ...previous, position: value })) },
            }),
            h(Field, { key: 't',
              label: '标题',
              value: identity.title,
              placeholder: '这场面试叫什么',
              onChange: value => { identityTouched.current = true; setIdentity(previous => ({ ...previous, title: value })) },
            }),
          ]),
          h('div', { key: 'act', style: { ...S.row, marginTop: 12 } }, [
            h('button', { key: 'b', style: S.btn('primary', busy), onClick: saveIdentity }, '保存'),
            h('span', { key: 'h', style: S.hint }, '列表会按岗位分组——同一个岗位的几场聚在一起。'),
          ]),
        ]),

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
            }, [libraryStrip, resumeSlot]),

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
                // 直连抓不动的时候，就**请助手去拿**——宿主里的助手有浏览器，
                // 能把登录墙、验证码、前端渲染的正文都对付过去。
                h('button', {
                  key: 'f3',
                  style: S.btn(false, busy || jdUrl.trim() === ''),
                  title: '把链接发给 DSH 对话里的助手，让它把正文抄回来',
                  onClick: askAgent,
                }, '让助手去抓'),
              ]),
              jdNote !== undefined
                ? h('div', {
                  key: 'note',
                  style: {
                    padding: '10px 13px', borderRadius: 9, marginBottom: 14, fontSize: 12, lineHeight: 1.6,
                    border: `1px solid ${jdNote.ok ? TONES.jade.edge : TONES.amber.edge}`,
                    background: jdNote.ok ? TONES.jade.wash : TONES.amber.wash,
                    color: jdNote.ok ? C.jade : C.amber,
                  },
                }, [
                  h('span', { key: 't' }, jdNote.text),
                  jdNote.canAsk === true
                    ? h('div', { key: 'a', style: { ...S.row, marginTop: 9 } }, [
                      h('button', {
                        key: 'b',
                        style: S.btn(false, busy),
                        onClick: askAgent,
                      }, '让助手去抓'),
                      h('span', { key: 'h', style: S.hint }, '或者直接把正文粘进下面的框里。'),
                    ])
                    : null,
                ])
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
      /**
       * 「有画面」= 流里真的有**视频轨**。
       *
       * **不能只看流存不存在。** 桌面端里常常是「麦克风通了、摄像头没通」，
       * 流照样存在——那时候如果按流判断，舞台会变成一块黑屏，
       * 用户看到的是「画面黑了」，而不是「摄像头没接上」。
       */
      const hasVideo = media.stream !== undefined
        && typeof media.stream.getVideoTracks === 'function'
        && media.stream.getVideoTracks().length > 0
      /**
       * Host 侧的摄像头画面。
       *
       * **桌面端里它是唯一有画面的可能。** 浏览器的 `getUserMedia` 在桌面端
       * 拿不到摄像头（宿主只放行纯音频请求），画面只能由 Host 用 ffmpeg 采。
       *
       * 它和浏览器的摄像头**互斥**——设备是独占的，两边同时开必然有一个失败。
       */
      const hostCamera = useHostCamera()
      const hasHostVideo = hostCamera.active
      const hasAnyVideo = hasVideo || hasHostVideo
      const title = session?.session?.title ?? '面试'
      const questionText = lastQuestion?.text

      // 窄容器里**纵向堆叠**：舞台在上、回答在中、控件在下，整页内部滚动。
      //
      // 为什么不是「让右栏变窄」——右栏一窄，「识别链路」「朗读问题」这些
      // 控件就挤成两行字，等于把功能藏起来；而舞台是这一页的主角，
      // 窄的时候更该它占满，而不是被压成一条缝。
      //
      // 阈值 700 是算出来的：并排时舞台至少要留 300px，
      // 加右栏 396 和 16 的间距，一共要 712。
      const [liveRef, liveWidth] = useContainerWidth()
      const stacked = liveWidth > 0 && liveWidth < 700

      /**
       * 计时器 + REC 灯的 props。
       *
       * 组件在模块作用域（`ClockBadge`），key 由**调用点**给——
       * `scripts/fix-keys.mjs` 会盯着这件事。
       */
      const clockProps = (absolute) => ({
        absolute,
        durationMs: session?.stats?.durationMs ?? 0,
        recording: recorder.recording,
      })

      /**
       * The **lower third**: the question, laid over the bottom of the frame.
       *
       * 为什么提问要压在画面上而不是放在旁边的框里——因为在真实的线上面试里，
       * 提问是**对面那个人说的**，它和你的人像在同一块画面上。把它挪进侧栏，
       * 它就变成了「界面上的一个字段」，面试的现场感就没了。
       *
       * **但没有摄像头时不能压。** 没接通的时候，舞台里放的是「未接通板」
       * （monogram + 说明 + 申请按钮）。提问条要是也压上去，两者会重叠——
       * 而且压掉的往往是**按钮**：被拒之后那句「在系统设置里放行」的说法，
       * 恰恰要靠那个按钮兑现。所以那种情况下提问条改成舞台下方的**一条带子**，
       * 仍然紧贴舞台、仍然占满左半屏，但它不再和板子抢地方。
       */
      const questionRule = h('div', {
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
            letterSpacing: '0.005em', maxHeight: hasAnyVideo ? 132 : 200, overflow: 'hidden',
          },
        }, questionText === undefined
          ? '助手还没提问。在 DSH 对话区让它开始——它每问一轮，这里就会更新。'
          : questionText),
      ])

      /** 有画面：压在画面下缘。没有：落在舞台下方的一条带子。 */
      const lowerThird = hasAnyVideo
        ? h('div', {
          key: 'cue',
          style: {
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '54px 26px 20px',
            background: 'linear-gradient(180deg, ' + C.cueTop + ' 0%, ' + C.cueMid + ' 46%, ' + C.cueLow + ' 100%)',
            pointerEvents: 'none',
          },
        }, [questionRule])
        : h('div', {
          key: 'band',
          style: {
            flex: '0 0 auto',
            padding: '16px 26px 18px',
            background: C.band,
            borderTop: `1px solid ${C.rule}`,
          },
        }, [questionRule])

      /** The stage: video when we have it, a designed "not connected" plate when we don't. */
      const stage = h('div', {
        key: 'stage',
        'data-iv-stage': '1',
        style: {
          position: 'relative', flex: '1 1 auto', minWidth: 0,
          // 没摄像头的时候，舞台里装的是「未接通板 + 提问带」两块。
          // 给它一个够高的下限，免得窄面板下板子被压扁、按钮被裁掉。
          minHeight: hasAnyVideo ? 260 : (stacked ? 300 : 400),
          borderRadius: 14, overflow: 'hidden', background: C.stage,
          border: `1px solid ${C.rule}`,
          // 有摄像头：舞台就是一块画面，提问压在上面。
          // 没摄像头：舞台变成上下两段（板子 / 提问带），**各占各的**。
          display: hasAnyVideo ? 'block' : 'flex',
          flexDirection: hasAnyVideo ? undefined : 'column',
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
        // Host 侧的摄像头画面。
        //
        // **`<img>` 直接吃 multipart/x-mixed-replace 流**——浏览器端一行
        // JS 都不用写。镜像是镜像的（跟 `<video>` 一样），所以同样
        // `scaleX(-1)`。
        hasHostVideo
          ? h('img', {
            key: 'host-v',
            'data-iv-host-video': '1',
            src: '/interviewer/camera/stream',
            alt: '摄像头画面',
            style: {
              width: '100%', height: '100%', objectFit: 'cover',
              transform: 'scaleX(-1)', display: 'block',
            },
          })
          : null,
        hasAnyVideo
          ? null
          : h('div', {
            key: 'plate',
            'data-iv-plate': '1',
            style: {
              // 这块板子只在**没有摄像头**的时候出现，所以它在**流里**：
              // 板子占上面一段，提问带占下面一段，两者不可能重叠。
              position: 'relative',
              flex: '1 1 auto',
              minHeight: 0,
              overflow: 'auto',
              display: 'flex', flexDirection: 'column',
              gap: 13,
              padding: '22px 30px',
              background: 'radial-gradient(circle at 50% 38%, ' + C.plateTop + ' 0%, ' + C.plateMid + ' 62%, ' + C.plateLow + ' 100%)',
            },
          }, [
            // **用 auto 外边距居中，不要用 justifyContent: 'center'。**
            // 居中 + overflow:auto 时，内容超出容器的话上沿会被裁掉、
            // 而且滚不回去——而这里超出意味着「板子比舞台高」，
            // 那正是最不该把按钮弄丢的时候。
            h('div', {
              key: 'scroll',
              style: {
                flex: '1 1 auto', minHeight: 0, overflow: 'auto',
                display: 'flex', flexDirection: 'column',
              },
            }, [
              h('div', {
                key: 'inner',
                style: {
                  margin: 'auto', width: '100%', maxWidth: 520,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13,
                },
              }, [
                // **有错误时不画 monogram，也不写那句「摄像头未接通」的安慰话。**
                //
                // 窄面板下（比如真实宿主里 1000×700 的那块地方），
                // 板子里同时塞着姓名章、说明、错误框和按钮，高度不够——
                // 结果是姓名章被裁成半个圆，看着像坏了。
                // 出错的时候，错误本身就是主角：姓名章让位，安慰话让位。
                media.error === undefined
                  ? h('div', {
                    key: 'mono',
                    style: {
                      width: 68, height: 68, borderRadius: 999, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${C.rule}`, background: C.ink850,
                      fontFamily: F.voice, fontSize: 20, color: C.boneFaint, letterSpacing: '0.04em',
                    },
                  }, initialsOf(title))
                  : null,
                // 标题行：标题 + 计时器。
                //
                // 计时器在**没摄像头**的时候进标题行——原来它绝对定位在舞台
                // 右上角，而板子的标题也是居中的，窄面板下两者正好撞在一起。
                h('div', {
                  key: 'hdr',
                  style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%' },
                }, [
                  h('div', {
                    key: 't',
                    style: {
                      fontFamily: F.voice, fontSize: 16, color: C.boneDim,
                      // 窄的时候省略，不要把标题折成两行吃掉竖向空间。
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240,
                    },
                  }, title),
                  h(ClockBadge, { key: 'clock-plate', ...clockProps(false) }),
                ]),
                media.error === undefined
                  ? h('div', { key: 's', style: { ...S.hint, marginTop: 6 } },
                    '摄像头未接通——面试照常进行，键盘输入随时可用')
                  : null,
              ]),
            ]),
            // **错误说明和按钮钉在板子底部，不跟内容一起被顶走。**
            //
            // 这一块是整个「权限被拒」流程的出口：它说「在系统设置里放行」，
            // 靠的就是下面的「重新检测授权状态」按钮。窄面板下板子一挤，
            // 这两样要是被推出可视区，那句话就变成了一句空话。
            h('div', {
              key: 'foot',
              style: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13 },
            }, [
              // **桌面端：浏览器的摄像头是被宿主挡住的，改系统设置没用。**
              //
              // 所以桌面端要说清「还有一条路」——Host 侧用 ffmpeg 直接采。
              // 这不是安慰话，是真的能出画面的路。
              hostCamera.error !== undefined
                ? h('div', {
                  key: 'herr',
                  style: {
                    width: '100%', maxWidth: 460, textAlign: 'center', padding: '11px 15px', borderRadius: 10,
                    border: `1px solid ${TONES.amber.edge}`, background: TONES.amber.wash,
                  },
                }, [
                  h('div', {
                    key: 't',
                    style: { fontSize: 12.5, color: C.amber, marginBottom: 5 },
                  }, hostCamera.error.text),
                  h('div', { key: 'a', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.65 } }, hostCamera.error.action),
                ])
                : null,
              media.error !== undefined
                ? h('div', {
                  key: 'err',
                  style: {
                    width: '100%', maxWidth: 460, textAlign: 'center', padding: '11px 15px', borderRadius: 10,
                    border: `1px solid ${media.error.kind === 'denied' ? TONES.tally.edge : TONES.amber.edge}`,
                    background: media.error.kind === 'denied' ? TONES.tally.wash : TONES.amber.wash,
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
                }, media.busy
                  ? '正在申请…'
                  // 麦克风已经通了的时候，这按钮是去**补摄像头**的，
                  // 别再写「申请摄像头与麦克风」——麦克风不需要再申请了。
                  : (media.stream !== undefined && !hasVideo ? '补上摄像头' : '申请摄像头与麦克风')),
                // **桌面端的第二条路：让 Host 侧采。**
                //
                // 浏览器的摄像头在桌面端被宿主挡死了，但 Host 侧能直接开
                // 设备。摄像头是独占的，所以这条按钮只在**浏览器没拿到画面**
                // 的时候出现——两边不会同时开。
                inDesktopHost() && !hasAnyVideo
                  ? h('button', {
                    key: 'host-cam',
                    style: S.btn(false, hostCamera.busy),
                    onClick: () => { void hostCamera.start() },
                  }, hostCamera.busy ? '正在开摄像头…' : '用宿主摄像头')
                  : null,
                media.permission?.camera === 'denied' || media.permission?.microphone === 'denied'
                  ? h('button', {
                    key: 'retry',
                    style: S.btn(false, media.busy),
                    onClick: () => { void media.probe().then(() => media.start()) },
                  }, '重新检测授权状态')
                  : null,
              ]),
            ]),
          ]),
        // 录制指示灯：只有真正在录的时候才亮。
        //
        // 两边都算：浏览器的 MediaRecorder，和 Host 侧的录像。
        (recorder.recording || hostCamera.recording)
          ? h('div', {
            key: 'rec',
            style: { position: 'absolute', top: 16, left: 16 },
          }, h(Tally, { on: true }))
          : null,
        // 计时器：右上角，等宽数字。
        // **只在有摄像头时压在画面上**——没摄像头时它进板子的标题行，
        // 否则窄面板下会跟标题撞在一起。
        hasAnyVideo ? h(ClockBadge, { key: 'clock-stage', ...clockProps(true) }) : null,
        lowerThird,
      ])

      return h('div', {
        ref: liveRef,
        'data-iv-live': '1',
        style: stacked
          // 窄：一列，舞台在上、控件在下，整页内部滚。
          ? { display: 'flex', flexDirection: 'column', gap: 14, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }
          : { display: 'flex', gap: 16, flex: '1 1 auto', minHeight: 0 },
      }, [
        // ── 左：舞台 + 回答 ────────────────────────────────────────────
        h('div', {
          key: 'left',
          style: {
            flex: stacked ? '0 0 auto' : '1 1 auto',
            minWidth: 0,
            display: 'flex', flexDirection: 'column', gap: 14,
          },
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
          'data-iv-rail': '1',
          style: stacked
            // 窄：整宽，排在舞台下面。
            ? { flex: '0 0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }
            // 宽：右栏固定一栏。
            //
            // **它不许收缩**——右栏里的按钮（「开摄像头」「开始录制」
            // 「录一段」「语音识别」「朗读问题」）和「识别链路」那段说明
            // 都是按 396px 排的，挤到 255px 就得折行，功能反而更难找。
            //
            // 之前这里写的是「可以收缩」，结果右栏被压成 255px、
            // 舞台撑到 448px——主次正好反了。现在舞台是那个「让出空间」的一方
            // （flex: 1 1 auto），右栏保底 396px；
            // 而窄到放不下时早就切成纵向堆叠了，不会再把舞台挤没。
            : { flex: '0 0 396px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
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
              // **组名跟着实际情况走。** 只有麦克风的时候，这组里根本没有画面，
              // 还叫「画面」就是骗人。
              h('div', { key: 'gh', style: { ...S.eyebrow, marginBottom: 8 } }, hasAnyVideo ? '画面' : '设备'),
              h('div', { key: 'gr', style: S.row }, [
                // **浏览器摄像头**：能用就用它，它更省事（不用 ffmpeg）。
                h('button', {
                  key: 'cam',
                  style: S.btn(false, false),
                  onClick: () => (media.stream === undefined ? void media.start() : media.stop()),
                  // 麦克风通了、摄像头没通的时候，关掉的其实是麦克风——
                  // 按钮得说它真正会关掉什么。
                }, media.stream === undefined
                  ? '开摄像头与麦克风'
                  : (hasVideo ? '关摄像头' : '关麦克风')),
                // **Host 摄像头**：桌面端的第二条路。
                //
                // 摄像头是独占设备，两边不能同时开——所以只在浏览器的摄像头
                // 没拿到画面时才亮这个按钮。
                inDesktopHost()
                  ? h('button', {
                    key: 'host-cam',
                    style: S.btn(hasHostVideo ? 'primary' : false, hostCamera.busy),
                    onClick: () => (hasHostVideo ? void hostCamera.stop() : void hostCamera.start()),
                  }, hasHostVideo ? '关宿主摄像头' : '开宿主摄像头')
                  : null,
                // **录像走哪一边，取决于画面在哪一边。**
                //
                // 画面在 Host（桌面端），录像就该由 Host 写盘——它手里本来
                // 就握着一帧帧的图像，转成 mp4 是最短的路。浏览器那边的
                // MediaRecorder 只能录到麦克风。
                hasHostVideo
                  ? h('button', {
                    key: 'host-rec',
                    style: S.btn(hostCamera.recording ? 'tally' : false, false),
                    onClick: () => {
                      const sessionId = session?.session?.id ?? ''
                      if (hostCamera.recording) {
                        void hostCamera.stopRecording(sessionId).then(result => {
                          if (result !== undefined) {
                            notify('录像已存到本机', `${result.name} 留在本场面试的卷宗目录里。`, 'ok')
                            onChanged?.()
                          }
                        })
                      } else {
                        void hostCamera.startRecording(sessionId)
                      }
                    },
                  }, hostCamera.recording ? '停止录制' : '开始录制')
                  : h('button', {
                    key: 'rec',
                    style: S.btn(recorder.recording ? 'tally' : false, media.stream === undefined),
                    onClick: () => (recorder.recording ? recorder.stop() : recorder.start()),
                  }, recorder.recording ? '停止录制' : (hasVideo ? '开始录制' : '开始录音')),
                recorder.clip !== undefined
                  ? h('button', { key: 'save', style: S.btn('primary', false), onClick: saveClip }, hasVideo ? '保存录像' : '保存录音')
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
                  style: S.pill(row.role === 'interviewer' ? 'amber' : row.role === 'candidate' ? 'jade' : 'faint'),
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
              h('span', { key: 'k', style: S.pill(item.kind === 'video' ? 'amber' : 'jade') }, item.kind === 'video' ? '录像' : '录音'),
              h('span', { key: 'n', style: { flex: '1 1 auto', color: C.boneDim, fontSize: 12 } }, item.name),
              h('span', { key: 's', style: { ...S.mono, color: C.boneFaint, fontSize: 11 } }, formatBytes(item.bytes)),
            ]))),
        ]),
        ]),
        ]),
      ])
    }

    // ── panel ─────────────────────────────────────────────────────────────

    /**
     * 按岗位给场次分组。
     *
     * **为什么按岗位，不按标题。** 标题是给人看的（随时能改），
     * 岗位是给列表分组的——同一个岗位投了三家、或者同一家面了两轮，
     * 聚在一起才看得出「我在跟谁谈」。认不出岗位的场次单独归到
     * 「未整理」，放在最后，而不是混在有名字的组里。
     *
     * @param {Array<object>} rows
     * @returns {Array<{key: string, label: string, items: Array<object>}>}
     */
    function groupSessions(rows) {
      const buckets = new Map()
      for (const row of rows) {
        const company = typeof row.company === 'string' ? row.company.trim() : ''
        const position = typeof row.position === 'string' ? row.position.trim() : ''
        const key = `${company}\u0000${position}`
        if (!buckets.has(key)) {
          buckets.set(key, {
            key,
            label: company !== '' && position !== ''
              ? `${company} · ${position}`
              : (position !== '' ? position : (company !== '' ? company : '未整理')),
            items: [],
          })
        }
        buckets.get(key).items.push(row)
      }
      const groups = [...buckets.values()]
      // 有名字的组按最近一场的时间排前面；「未整理」永远垫底。
      groups.sort((a, b) => {
        const aLoose = a.label === '未整理'
        const bLoose = b.label === '未整理'
        if (aLoose !== bLoose) return aLoose ? 1 : -1
        return (b.items[0]?.updatedAt ?? 0) - (a.items[0]?.updatedAt ?? 0)
      })
      return groups
    }

    /** The whole panel. */
    function Interviewer() {
      const [tab, setTab] = useState('prepare')
      const [selected, setSelected] = useState(undefined)
      const [notice, setNotice] = useState(undefined)
      // 主题：暗色是原来的样子，亮色是纸面。用户的选择会被记住。
      const [theme, setTheme] = useState(readTheme)

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
      /** The session list; declared early because the header and the workspace picker both read it. */
      const rows = sessionsPoll.data?.sessions ?? []

      // ── 归档 ────────────────────────────────────────────────────────
      //
      // **归档不是删除。** 它只是把老的场次从日常列表里收起来，
      // 内容、报告、底稿一样都在，随时能翻出来——所以它是「整理」，
      // 不是「丢东西」。
      const [showArchived, setShowArchived] = useState(false)
      const archivedRows = useMemo(() => rows.filter(row => row.archived === true), [rows])
      const visibleRows = useMemo(
        () => (showArchived ? rows : rows.filter(row => row.archived !== true)),
        [rows, showArchived],
      )
      /** 按岗位分组：同一岗位的几场聚在一起。 */
      const groups = useMemo(() => groupSessions(visibleRows), [visibleRows])

      /**
       * 一行下面的那串小字。
       *
       * 窄布局没有组头，所以公司 · 岗位得写在这一行里；
       * 宽布局有组头，就不重复写了。
       */
      const rowMeta = (row, withPosition) => {
        const base = `${row.status} · 考点 ${row.probedCount}/${row.checklistCount}`
        if (!withPosition) return base
        const company = (row.company ?? '').trim()
        const position = (row.position ?? '').trim()
        const label = company !== '' && position !== ''
          ? `${company} · ${position}`
          : (position !== '' ? position : company)
        return label === '' ? base : `${label} · ${base}`
      }

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

      /**
       * 会话不见了 —— 多半是**换了卷宗库**，原来那一场不在新目录里了。
       *
       * 这时候正确做法是取消选中（列表会自己落到新目录的第一场），
       * 而不是一直挂着「读不到会话状态」——用户什么都没做错，
       * 不该让他面对一条他无法消除的红字。
       */
      const sessionGone = sessionPoll.error !== undefined && /会话不存在/.test(sessionPoll.error)
      useEffect(() => {
        if (sessionGone) setSelected(undefined)
      }, [sessionGone])

      const refreshAll = useCallback(() => {
        void sessionsPoll.refresh()
        void sessionPoll.refresh()
      }, [sessionsPoll, sessionPoll])

      /** 归档/取回一场面试。 */
      const archiveRow = useCallback(async row => {
        const archived = row.archived === true
        try {
          await apiPost(`sessions/${row.id}/archive`, { archived: !archived })
          notify(
            archived ? '取回来了' : '归档了',
            archived
              ? '它又回到日常列表里。'
              : '内容、报告、底稿都还在，只是收起来了。',
            'ok',
          )
          refreshAll()
        } catch (failure) {
          notify('归档失败', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, refreshAll])

      /**
       * 换卷宗库之后，标题里的路径要**立刻**跟上。
       *
       * 配置是启动时取一次就放着的（它很少变）；换目录是唯一会让它变的事件，
       * 所以专门在切根之后刷一次，而不是让配置也跟着每 6 秒轮询。
       */
      const refreshConfig = useCallback(() => {
        void configPoll.refresh()
      }, [configPoll])

      const createSession = useCallback(async () => {
        try {
          const result = await apiPost('sessions', {})
          setSelected(result.session.id)
          setTab('prepare')
          notify('新面试已建好', '先从简历库挑一份（或上传新的），再放 JD。', 'ok')
          refreshAll()
        } catch (failure) {
          notify('建不了', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, refreshAll])

      // ── 卷宗库目录 ────────────────────────────────────────────────────
      //
      // **两步走：先选，再切。**
      //
      // 选目录是宿主的事（原生对话框），切目录是插件的事（写设置、搬数据）。
      // 混在一起就会出现「对话框都还没关，设置已经改了」这种半途而废的状态。
      const [picking, setPicking] = useState(false)

      /** 把旧根里的卷宗复制到新根。复制，不是移动。 */
      const migrateWorkspace = useCallback(async (from, to) => {
        try {
          const result = await apiPost('config/workspace-root', { path: to, migrateFrom: from })
          setSelected(undefined)
          refreshAll()
          refreshConfig()
          const migrated = result?.migrated ?? {}
          if (migrated.error !== undefined) {
            notify('没搬成', migrated.error, 'error')
            return
          }
          notify(
            '搬完了',
            `${migrated.sessions ?? 0} 场面试、${migrated.profiles ?? 0} 份档案已复制到新目录。`
            + '老目录原样还在，确认无误后可以自己删。',
            'ok',
          )
        } catch (failure) {
          notify('没搬成', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, refreshAll, refreshConfig])

      /** 弹宿主原生目录选择器，把卷宗库换到用户选的地方。 */
      const pickWorkspaceRoot = useCallback(async () => {
        if (picking) return
        setPicking(true)
        const previous = config?.workspaceRoot?.path
        const previousCount = rows.length
        try {
          const result = await apiPost('config/workspace-root/pick', {})
          const picker = result?.picker ?? {}
          if (picker.available !== true) {
            notify('弹不出目录选择器', picker.reason ?? '这个宿主没有提供目录选择器。', 'error')
            return
          }
          // 用户在系统对话框里点了「取消」——那不是错误，是「不改」。
          if (typeof picker.picked !== 'string' || picker.picked === '') return
          if (picker.picked === previous) {
            notify('没换地方', '选的还是当前这个目录。', 'info')
            return
          }
          const applied = await apiPost('config/workspace-root', { path: picker.picked })
          setSelected(undefined)
          refreshAll()
          refreshConfig()
          if (applied?.warning !== undefined) {
            notify('换了，但不生效', applied.warning, 'error')
            return
          }
          if (previousCount > 0 && previous !== undefined) {
            setNotice({
              title: `卷宗库已换到 ${picker.picked}`,
              detail: `旧目录 ${previous} 里还有 ${previousCount} 场面试。`,
              kind: 'info',
              action: { label: '搬过去', run: () => { void migrateWorkspace(previous, picker.picked) } },
            })
            return
          }
          notify('卷宗库已换', `现在存在 ${picker.picked}`, 'ok')
        } catch (failure) {
          notify('换不了', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setPicking(false)
        }
      }, [config?.workspaceRoot?.path, migrateWorkspace, notify, picking, refreshAll, refreshConfig, rows.length])

      // 面板实际有多宽，由**宿主**说了算：桌面版 DSH 里是 1200px，
      // 网页版侧栏里可能只有 250px。窄到一定程度，场次列表就从左边一栏
      // 变成顶部一条横向的场次带——不然它会吃掉一半宽度，
      // 把「面试中」那一页挤到连舞台都放不下。
      const [pageRef, pageWidth] = useContainerWidth()
      const narrow = pageWidth > 0 && pageWidth < 760

      return h('div', {
        ref: pageRef,
        'data-iv-page': '1',
        'data-iv-theme': theme,
        className: 'iv-root',
        // **主题变量挂在根节点上。**
        // 自定义属性会被后代继承，所以下面所有 `var(--iv-*)` 都跟着变；
        // 切换主题只需要根节点换一套值，其余元素一个都不用重渲染。
        style: { ...S.page, ...THEMES[theme] },
      }, [
        h('div', {key: 'k17',  style: narrow
          // 窄：页头允许换行，页签和按钮不缩成竖排的字。
          ? { ...S.head, flexWrap: 'wrap', gap: 10, padding: '12px 16px' }
          : S.head }, [
          h('div', {
            key: 'k19',
            style: narrow
              // 窄：标题独占一行，页签和「新建面试」并排第二行——
              // 否则「新建面试」会被挤到第三行，白白吃掉一屏高度。
              ? { minWidth: 0, flex: '1 1 100%' }
              : { minWidth: 0, flex: '1 1 auto' },
          }, [
            h('div', {key: 'k21',  style: S.title }, '模拟面试间'),
            h('div', {key: 'k22',  style: S.sub }, '简历 + JD → 一场有准备的面试'),
            config?.workspaceRoot !== undefined
              ? h('div', {
                key: 'w',
                style: { ...S.workspace, display: 'flex', alignItems: 'center', gap: 10 },
              }, [
                h('span', {
                  key: 'p',
                  style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                  title: `${config.workspaceRoot.path}\n${config.workspaceRoot.reason ?? ''}`,
                }, `卷宗库 · ${config.workspaceRoot.path}`),
                // 「浏览…」：换成宿主的原生目录选择器。
                //
                // **为什么不让用户手打路径。** 路径是机器上的事实，
                // 让用户手打就是让他凭记忆写一个自己也不确定存在的路径；
                // 而系统对话框里选出来的路径，是用户**看着**选出来的。
                h('button', {
                  key: 'b',
                  title: '换一个卷宗库目录（用系统目录选择器）',
                  'aria-label': '换一个卷宗库目录',
                  style: {
                    flex: '0 0 auto', padding: '1px 8px', borderRadius: 6, cursor: picking ? 'progress' : 'pointer',
                    fontFamily: F.ui, fontSize: 10.5, lineHeight: 1.7,
                    color: C.boneDim, background: 'transparent',
                    border: `1px solid ${C.rule}`,
                  },
                  disabled: picking,
                  onClick: pickWorkspaceRoot,
                }, picking ? '正在打开…' : '浏览…'),
              ])
              : null,
          ]),
          h('div', {key: 'k20',  style: narrow ? { ...S.tabs, marginLeft: 0, flex: '0 0 auto' } : S.tabs }, [
            h('div', { key: 'a', style: S.tab(tab === 'prepare'), onClick: () => setTab('prepare') }, '准备'),
            h('div', { key: 'b', style: S.tab(tab === 'live'), onClick: () => setTab('live') }, '面试中'),
            h('div', { key: 'c', style: S.tab(tab === 'report'), onClick: () => setTab('report') }, '报告'),
          ]),
          h('button', {
            key: 'theme',
            // 按钮上写的是**切过去之后**的样子：「亮色」= 点一下变亮色。
            // 当前是什么主题，写在 title 里（鼠标悬停可见）。
            title: theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题',
            'aria-label': theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题',
            style: { ...S.btn(false, false), marginLeft: narrow ? 0 : 10, padding: '8px 13px' },
            onClick: () => setTheme(previous => {
              const next = previous === 'dark' ? 'light' : 'dark'
              saveTheme(next)
              return next
            }),
          }, theme === 'dark' ? '亮色' : '暗色'),
          h('button', {
            key: 'n',
            style: { ...S.btn('primary', false), marginLeft: narrow ? 0 : 16 },
            onClick: createSession,
          }, '新建面试'),
        ]),

        notice !== undefined
          ? h('div', {
            key: 'notice',
            style: {
              padding: '10px 22px', fontSize: 12, display: 'flex', gap: 12, alignItems: 'center',
              background: notice.kind === 'error' ? TONES.tally.wash : notice.kind === 'ok' ? TONES.jade.wash : C.ink850,
              borderBottom: `1px solid ${C.rule}`,
              color: notice.kind === 'error' ? C.tally : notice.kind === 'ok' ? C.jade : C.boneDim,
            },
          }, [
            h('span', { key: 't', style: { fontWeight: 600 } }, notice.title),
            notice.detail !== undefined ? h('span', { key: 'd', style: { color: C.boneFaint } }, notice.detail) : null,
            // 通知条也能带一个动作（比如「把旧卷宗搬过去」）。
            //
            // **为什么动作在通知条里，而不是弹一个模态框。** 通知条已经在
            // 面板最上面了，用户的眼睛本来就在那儿；而模态框会挡住
            // 面试页——面试进行中弹模态框，是最不该做的事。
            notice.action !== undefined
              ? h('button', {
                key: 'a',
                style: {
                  flex: '0 0 auto', padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: F.ui, fontSize: 11.5,
                  color: C.bone, background: C.ink700,
                  border: `1px solid ${C.rule}`,
                },
                onClick: () => {
                  const action = notice.action
                  setNotice(undefined)
                  action.run()
                },
              }, notice.action.label)
              : null,
            h('span', { key: 'x', style: { marginLeft: 'auto', cursor: 'pointer', color: C.boneFaint }, onClick: () => setNotice(undefined) }, '×'),
          ])
          : null,

        h('div', {key: 'k18',  style: narrow ? { ...S.body, flexDirection: 'column' } : S.body }, [
          // 会话列表
          h('div', {
            key: 'k23',
            'data-iv-sessions': '1',
            style: narrow
              // 窄：从左边一栏变成顶部一条**横向**的场次带。
              // 竖排的 216px 一栏在 400px 宽的面板里会吃掉一半，
              // 剩下的宽度连舞台都放不下。
              //
              // `boxSizing: border-box` 不能省：这个面板跑在别人的页面里，
              // 宿主不一定做过 `* { box-sizing: border-box }` 全局重置，
              // 于是 `width: 100%` 加上左右内边距就会把面板撑宽 24px。
              ? {
                boxSizing: 'border-box',
                width: '100%', flex: '0 0 auto', display: 'flex', alignItems: 'stretch', gap: 8,
                overflowX: 'auto', overflowY: 'hidden', padding: '10px 12px',
                borderRight: 'none', borderBottom: `1px solid ${C.rule}`, background: C.ink850,
              }
              : S.rail,
          }, [
            h('div', {
              key: 'h',
              style: narrow
                ? { ...S.eyebrow, padding: '4px 6px', alignSelf: 'center', flex: '0 0 auto' }
                : { ...S.eyebrow, padding: '4px 8px 12px', display: 'flex', alignItems: 'center', gap: 8 },
            }, [
              h('span', { key: 'l' }, '面试场次'),
              // 归档藏起来之后，得有个地方把它再翻出来。
              archivedRows.length > 0
                ? h('span', {
                  key: 'a',
                  role: 'button',
                  tabIndex: 0,
                  title: showArchived ? '收起已归档的场次' : `显示已归档的 ${archivedRows.length} 场`,
                  style: {
                    marginLeft: 'auto', cursor: 'pointer', fontSize: 10.5, color: C.boneFaint,
                    border: `1px solid ${C.rule}`, borderRadius: 6, padding: '1px 6px',
                  },
                  onClick: () => setShowArchived(value => !value),
                }, showArchived ? '收起归档' : `归档 ${archivedRows.length}`)
                : null,
            ]),
            visibleRows.length === 0
              ? h('div', { key: 'e', style: { ...S.hint, padding: '0 8px' } }, '还没有面试会话。')
              : narrow
                // 窄：一条横向的场次带。分组在这种形态里没有意义
                // （一行放不下一个组头），所以只平铺。
                ? visibleRows.map(row => h('div', {
                  key: row.id,
                  style: {
                    flex: '0 0 176px', width: 176, display: 'flex', alignItems: 'stretch',
                    borderRadius: 10, overflow: 'hidden',
                    background: row.id === selected ? C.ink750 : 'transparent',
                    border: `1px solid ${row.id === selected ? C.rule : 'transparent'}`,
                  },
                }, [
                  h('button', {
                    key: 'b',
                    style: {
                      flex: '1 1 auto', minWidth: 0, textAlign: 'left', cursor: 'pointer',
                      padding: '8px 10px', border: 'none', background: 'transparent',
                      fontFamily: F.ui, color: row.id === selected ? C.bone : C.boneDim,
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
                    }, rowMeta(row, true)),
                  ]),
                  h('button', {
                    key: 'x',
                    title: row.archived ? '取消归档' : '归档这场面试',
                    'aria-label': row.archived ? '取消归档' : '归档这场面试',
                    style: {
                      flex: '0 0 auto', cursor: 'pointer', border: 'none', background: 'transparent',
                      color: C.boneFaint, fontSize: 10, padding: '0 6px',
                    },
                    onClick: () => archiveRow(row),
                  }, row.archived ? '取出' : '归档'),
                ]))
                // 宽：按岗位分组。同一岗位的几场聚在一起，
                // 这才是「整理」——一列平铺的「面试 2026-11-16」谁也认不出来。
                : groups.map(group => h('div', { key: group.key, style: { marginBottom: 12 } }, [
                  h('div', {
                    key: 'gh',
                    style: {
                      ...S.eyebrow, fontSize: 10, padding: '2px 8px 6px', display: 'flex', gap: 8,
                      color: C.boneFaint,
                    },
                  }, [
                    h('span', { key: 'n', style: { color: C.boneDim } }, group.label),
                    h('span', { key: 'c' }, `${group.items.length} 场`),
                  ]),
                  group.items.map(row => h('div', {
                    key: row.id,
                    style: {
                      display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
                      borderRadius: 10,
                      background: row.id === selected ? C.ink750 : 'transparent',
                      border: `1px solid ${row.id === selected ? C.rule : 'transparent'}`,
                    },
                  }, [
                    h('button', {
                      key: 'b',
                      style: {
                        flex: '1 1 auto', minWidth: 0, textAlign: 'left', cursor: 'pointer',
                        padding: '10px 11px', border: 'none', background: 'transparent',
                        fontFamily: F.ui, color: row.id === selected ? C.bone : C.boneDim,
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
                      }, rowMeta(row, false)),
                    ]),
                    h('button', {
                      key: 'x',
                      title: row.archived ? '取消归档' : '归档这场面试',
                      'aria-label': row.archived ? '取消归档' : '归档这场面试',
                      style: {
                        flex: '0 0 auto', cursor: 'pointer', border: 'none', background: 'transparent',
                        color: C.boneFaint, fontSize: 10, padding: '0 8px',
                      },
                      onClick: () => archiveRow(row),
                    }, row.archived ? '取出' : '归档'),
                  ])),
                ])),
          ]),

          // 主区
          h('div', {
            key: 'k24',
            style: {
              ...S.main,
              // 窄：内边距收一点，把宽度还给舞台。
              ...(narrow ? { padding: 14 } : {}),
              // 面试页**吃满视口**：舞台撑开，速记在右栏内部滚。
              // 整页滚动会把视频区缩成一条——那正是这一版要消灭的。
              //
              // 这里必须用 `overflowY` 长写，**不能**再叠一个 `overflow` 简写：
              // 简写和长写同时出现在一个 style 里，React 每次重渲染都要
              // 报一条 warning——而「React 警告 0 条」是这一版的红线。
              ...(tab === 'live' ? { display: 'flex', flexDirection: 'column', overflowY: 'hidden' } : {}),
            },
          }, [
            session === undefined
              ? h('div', {key: 'k25',  style: { ...S.hint, padding: 60, textAlign: 'center' } }, '还没有面试。先新建一场，或者从左边选一场。')
              : tab === 'prepare'
                ? h(PrepareView, { key: 'prepare', session, config, onChanged: refreshAll, notify })
                : tab === 'live'
                  ? h(LiveView, { key: 'live', session, config, onChanged: refreshAll, notify })
                  : h(ReportView, { key: 'report', session, config, onChanged: refreshAll, notify }),
            sessionPoll.error !== undefined && !sessionGone
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
        // 这个红点是**宿主侧边栏**里的图标，不是面板的一部分——
        // 它不在面板根节点里，拿不到主题变量；而且 SVG 的 fill 是
        // 表现属性，不认 var()。所以这里只能是字面值，
        // 也因此**不随主题变化**（侧边栏归宿主管）。
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
