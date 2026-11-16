/*!
 * dsh-realtime-interview — client half (browser bundle).
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
/*!
 * dsh-realtime-interview — client half (browser bundle).
 *
 * ⚠ 这个文件是**生成物**：源码在 src/client/，由 scripts/build-client.mjs 拼装。
 *   要改界面请改 src/client/*.js，改这里会在下一次构建时被覆盖。
 *
 * 设计语言与 bundle 格式的完整说明在 src/client/00-header.js。
 */
window.__ModuleLoader__.load({
  id: 'dsh-realtime-interview',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo, useRef } = React

    // ── locale ────────────────────────────────────────────────────────────
    const LOCALE_NS = 'dsh-realtime-interview'
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
      // ── 深空仪表盘（暗色）─────────────────────────────────────────────
      // 近黑偏蓝的底 + 青玉与钴蓝的微光，配合等宽数字，是「控制台」而不是
      // 「后台页面」。强调色仍然各自唯一职责：朱红=录制，琥珀=提问，青玉=就绪。
      dark: {
        '--iv-ink900': '#05070C',
        '--iv-ink850': '#080C13',
        '--iv-ink800': '#0C121C',
        '--iv-ink750': '#111A26',
        '--iv-ink700': '#16202F',
        '--iv-rule': 'rgba(122,160,205,0.18)',
        '--iv-rule-soft': 'rgba(122,160,205,0.09)',
        '--iv-bone': '#E8EFF9',
        '--iv-bone-dim': '#9FB0C6',
        '--iv-bone-faint': '#61718A',
        '--iv-tally': '#FF5C47',
        '--iv-amber': '#FFB65C',
        '--iv-jade': '#34E5B4',
        '--iv-field': '#070C13',
        '--iv-on-bone': '#04110C',
        '--iv-stage': '#03050A',
        '--iv-plate-top': '#0B1522',
        '--iv-plate-mid': '#060A11',
        '--iv-plate-low': '#04070C',
        '--iv-cue-top': 'rgba(3,6,10,0)',
        '--iv-cue-mid': 'rgba(3,6,10,0.84)',
        '--iv-cue-low': 'rgba(3,6,10,0.97)',
        '--iv-band': 'rgba(4,7,12,0.95)',
        '--iv-clock': 'rgba(6,10,16,0.72)',
        '--iv-shadow': 'rgba(0,0,0,0.98)',
        '--iv-sheen': 'rgba(180,220,255,0.06)',
        '--iv-fade': 'rgba(5,8,14,0)',
        // 背景本身也是一层设计：右上的钴蓝与左下的青玉，像机房里的环境光。
        '--iv-bg': 'radial-gradient(1100px 560px at 8% -12%, rgba(52,229,180,0.10), transparent 62%), '
          + 'radial-gradient(900px 520px at 102% -4%, rgba(86,140,255,0.12), transparent 58%), '
          + 'linear-gradient(180deg, #05070C 0%, #070A11 100%)',
        '--iv-glow-jade': 'rgba(52,229,180,0.45)',
        '--iv-glow-cobalt': 'rgba(86,140,255,0.35)',
        '--iv-tone-faint-text': '#61718A',
        '--iv-tone-faint-edge': 'rgba(97,113,138,0.32)',
        '--iv-tone-faint-wash': 'rgba(97,113,138,0.10)',
        '--iv-tone-amber-text': '#FFB65C',
        '--iv-tone-amber-edge': 'rgba(255,182,92,0.34)',
        '--iv-tone-amber-wash': 'rgba(255,182,92,0.09)',
        '--iv-tone-jade-text': '#34E5B4',
        '--iv-tone-jade-edge': 'rgba(52,229,180,0.38)',
        '--iv-tone-jade-wash': 'rgba(52,229,180,0.10)',
        '--iv-tone-tally-text': '#FF5C47',
        '--iv-tone-tally-edge': 'rgba(255,92,71,0.42)',
        '--iv-tone-tally-wash': 'rgba(255,92,71,0.12)',
        '--iv-tone-tally-glow': 'rgba(255,92,71,0.55)',
      },
      // ── 纸面（亮色）────────────────────────────────────────────────
      // 亮色不是"暗色反相"：它是**卷宗**——档案纸的暖白，墨色文字。
      light: {
        '--iv-ink900': '#F1EEE4',
        '--iv-ink850': '#F8F5EC',
        '--iv-ink800': '#FFFFFF',
        '--iv-ink750': '#EFEBE0',
        '--iv-ink700': '#E4DED1',
        '--iv-rule': '#D6D0C2',
        '--iv-rule-soft': '#E7E2D6',
        '--iv-bone': '#1B2029',
        '--iv-bone-dim': '#48515F',
        '--iv-bone-faint': '#7A8492',
        '--iv-tally': '#C0402A',
        '--iv-amber': '#8F6412',
        '--iv-jade': '#1F7A60',
        '--iv-field': '#FFFFFF',
        '--iv-on-bone': '#F7F5F0',
        '--iv-stage': '#E7E2D5',
        '--iv-plate-top': '#FFFFFF',
        '--iv-plate-mid': '#F4F1E8',
        '--iv-plate-low': '#EAE5D9',
        '--iv-cue-top': 'rgba(255,255,255,0)',
        '--iv-cue-mid': 'rgba(248,246,240,0.88)',
        '--iv-cue-low': 'rgba(246,243,236,0.97)',
        '--iv-band': 'rgba(250,248,243,0.97)',
        '--iv-clock': 'rgba(255,255,255,0.85)',
        '--iv-shadow': 'rgba(58,50,36,0.18)',
        '--iv-sheen': 'rgba(255,255,255,0.70)',
        '--iv-fade': 'rgba(255,255,255,0)',
        '--iv-bg': 'radial-gradient(900px 480px at 6% -10%, rgba(31,122,96,0.07), transparent 60%), '
          + 'radial-gradient(800px 460px at 100% -6%, rgba(70,110,190,0.07), transparent 58%), '
          + 'linear-gradient(180deg, #F1EEE4 0%, #F6F3EA 100%)',
        '--iv-glow-jade': 'rgba(31,122,96,0.30)',
        '--iv-glow-cobalt': 'rgba(70,110,190,0.25)',
        '--iv-tone-faint-text': '#7A8492',
        '--iv-tone-faint-edge': 'rgba(122,132,146,0.35)',
        '--iv-tone-faint-wash': 'rgba(122,132,146,0.10)',
        '--iv-tone-amber-text': '#8F6412',
        '--iv-tone-amber-edge': 'rgba(143,100,18,0.35)',
        '--iv-tone-amber-wash': 'rgba(143,100,18,0.10)',
        '--iv-tone-jade-text': '#1F7A60',
        '--iv-tone-jade-edge': 'rgba(31,122,96,0.38)',
        '--iv-tone-jade-wash': 'rgba(31,122,96,0.10)',
        '--iv-tone-tally-text': '#C0402A',
        '--iv-tone-tally-edge': 'rgba(192,64,42,0.45)',
        '--iv-tone-tally-wash': 'rgba(192,64,42,0.12)',
        '--iv-tone-tally-glow': 'rgba(192,64,42,0.40)',
      },
    }

    /** 主题在 localStorage 里的键。存的是用户的**选择**，不是系统设置。 */
    const THEME_KEY = 'dsh-realtime-interview.theme'

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
        backgroundImage: 'var(--iv-bg)', backgroundColor: C.ink900,
        color: C.bone, fontFamily: F.ui, fontSize: 13,
        letterSpacing: '0.01em', WebkitFontSmoothing: 'antialiased',
      },
      head: {
        display: 'flex', alignItems: 'center', gap: 18, padding: '14px 22px',
        borderBottom: `1px solid ${C.rule}`, flex: '0 0 auto',
        background: `linear-gradient(180deg, ${C.ink850} 0%, ${C.ink900} 100%)`,
        boxShadow: `inset 0 -1px 0 ${C.ruleSoft}`,
      },
      title: { fontFamily: F.voice, fontSize: 20, fontWeight: 600, letterSpacing: '0.015em', lineHeight: 1.2 },
      sub: { fontSize: 11.5, color: C.boneFaint, marginTop: 3, letterSpacing: '0.03em' },
      workspace: {
        fontFamily: F.mono, fontSize: 10.5, color: C.boneFaint, marginTop: 4,
        letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
      tabs: {
        display: 'flex', gap: 2, marginLeft: 'auto', padding: 3,
        background: C.ink800, borderRadius: 12, border: `1px solid ${C.rule}`,
        boxShadow: `inset 0 1px 0 ${C.sheen}`,
      },
      tab: (active) => ({
        padding: '6px 15px', borderRadius: 9, cursor: 'pointer', fontSize: 12.5,
        background: active ? TONES.jade.wash : 'transparent',
        color: active ? C.bone : C.boneFaint,
        border: `1px solid ${active ? TONES.jade.edge : 'transparent'}`,
        boxShadow: active ? '0 0 18px -10px var(--iv-glow-jade)' : 'none',
        transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease',
        fontFamily: F.ui, letterSpacing: '0.02em',
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
        borderRadius: 16,
        padding: '18px 20px',
        marginBottom: 16,
        boxShadow: `inset 0 1px 0 ${C.sheen}, 0 26px 60px -44px ${C.shadow}`,
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
      },
      cardHead: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 },
      eyebrow: {
        fontFamily: F.mono, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: C.boneFaint, flex: '0 0 auto',
      },
      cardTitle: { fontFamily: F.voice, fontSize: 16.5, fontWeight: 600, letterSpacing: '0.012em' },
      hint: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.7 },
      label: { fontSize: 11.5, color: C.boneDim, marginBottom: 7, display: 'block', letterSpacing: '0.03em' },
      input: {
        width: '100%', boxSizing: 'border-box', background: C.field, color: C.bone,
        border: `1px solid ${C.rule}`, borderRadius: 10, padding: '9px 12px', fontSize: 13,
        fontFamily: F.ui, outline: 'none',
        boxShadow: `inset 0 1px 0 ${C.sheen}`,
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
      },
      textarea: {
        width: '100%', boxSizing: 'border-box', background: C.field, color: C.bone,
        border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px', fontSize: 13,
        fontFamily: F.ui, outline: 'none', minHeight: 130, resize: 'vertical', lineHeight: 1.7,
        boxShadow: `inset 0 1px 0 ${C.sheen}`,
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
      },
      btn: (kind, disabled) => {
        const base = {
          padding: '8px 15px', borderRadius: 10, fontSize: 12.5, cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: F.ui, letterSpacing: '0.02em',
          transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, filter 160ms ease',
          border: `1px solid ${C.rule}`,
        }
        if (kind === 'primary') {
          return {
            ...base,
            background: C.jade, color: C.onBone, borderColor: C.jade, fontWeight: 600,
            boxShadow: `0 0 24px -12px var(--iv-glow-jade), inset 0 1px 0 rgba(255,255,255,0.18)`,
            opacity: disabled ? 0.4 : 1,
          }
        }
        if (kind === 'tally') {
          return {
            ...base, background: TONES.tally.wash, color: C.tally, borderColor: TONES.tally.edge,
            boxShadow: `0 0 22px -14px var(--iv-tone-tally-glow)`, opacity: disabled ? 0.45 : 1,
          }
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
          letterSpacing: '0.06em', alignSelf: 'flex-start', lineHeight: 1.6,
        }
      },
      /** 兜底弹窗的遮罩与面板（面试间保护用）。 */
      overlay: {
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(2,4,8,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'ivFade 160ms ease both',
      },
      modal: {
        width: 'min(440px, 100%)', background: C.ink800, border: `1px solid ${C.rule}`,
        borderRadius: 16, padding: '20px 22px',
        boxShadow: `0 40px 120px -40px rgba(0,0,0,0.9), inset 0 1px 0 ${C.sheen}`,
        animation: 'ivRise 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
    }

    /**
     * 全局样式：只在插件页面里生效（都挂在 `[data-iv-page]` 下）。
     *
     * **为什么要有它。** React 的内联样式写不了 `:hover` / `:focus` /
     * `@keyframes`，而「深空仪表盘」的质感一半来自悬停微光、聚焦环和
     * 极轻的入场动效。一个 style 标签就够了，且不会污染宿主界面。
     */
    const THEME_CSS = `
      [data-iv-page] button:hover { filter: brightness(1.12); }
      [data-iv-page] button:active { transform: translateY(1px); }
      [data-iv-page] input:focus, [data-iv-page] textarea:focus, [data-iv-page] select:focus {
        border-color: var(--iv-tone-jade-edge) !important;
        box-shadow: 0 0 0 2px var(--iv-tone-jade-wash), inset 0 1px 0 var(--iv-sheen) !important;
      }
      [data-iv-page] ::selection { background: var(--iv-tone-jade-wash); color: var(--iv-bone); }
      [data-iv-page] ::-webkit-scrollbar { width: 10px; height: 10px; }
      [data-iv-page] ::-webkit-scrollbar-track { background: transparent; }
      [data-iv-page] ::-webkit-scrollbar-thumb { background: var(--iv-rule); border-radius: 999px; border: 2px solid transparent; background-clip: content-box; }
      [data-iv-page] ::-webkit-scrollbar-thumb:hover { background: var(--iv-bone-faint); background-clip: content-box; }
      @keyframes ivFade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes ivRise { from { opacity: 0; transform: translateY(10px) scale(0.985) } to { opacity: 1; transform: none } }
      @media (prefers-reduced-motion: reduce) {
        [data-iv-page] *, [data-iv-page] *::before, [data-iv-page] *::after {
          animation-duration: 0.001ms !important; transition-duration: 0.001ms !important;
        }
      }
    `

    /** 把全局样式插进文档一次（重复调用无副作用）。 */
    function injectThemeCss() {
      try {
        if (typeof document === 'undefined' || document.getElementById('dsh-iv-style') !== null) return
        const style = document.createElement('style')
        style.id = 'dsh-iv-style'
        style.textContent = THEME_CSS
        document.head.appendChild(style)
      } catch {
        // 注入失败不影响功能：只是少一点悬停与动效。
      }
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
    // ── media registry（面试间保护用）──────────────────────────────────────
    //
    // 面板要回答「现在有没有摄像头 / 麦克风开着」。这两个 hook 各自管自己的
    // state，父组件拿不到；所以在这里登记一份**只读标记**，供「离开面试间」
    // 的确认弹窗与兜底清理使用。它不持有任何业务状态——真正的 state 还在
    // 各自的 hook 里，这里只是"当前有没有设备被占用"。
    const mediaRegistry = { stream: undefined, hostActive: false, hostStop: undefined }

    /** 现在有没有设备被占用。 */
    function mediaInUse() {
      return {
        any: mediaRegistry.stream !== undefined || mediaRegistry.hostActive,
        stream: mediaRegistry.stream !== undefined,
        hostCamera: mediaRegistry.hostActive,
      }
    }

    /**
     * 不论用户从哪条路离开，都把设备放掉。
     *
     * **这是兜底，不是主路径。** 正常离开会先弹确认框；只有用户确认
     * （或面板被宿主卸载）时才走到这里。设备没释放是最糟的结局——
     * 摄像头指示灯一直亮着，用户会以为插件在偷看。
     */
    async function releaseAllMedia() {
      const stream = mediaRegistry.stream
      mediaRegistry.stream = undefined
      if (stream !== undefined) {
        try {
          for (const track of stream.getTracks()) track.stop()
        } catch { /* 已经停了 */ }
      }
      const hostStop = mediaRegistry.hostStop
      mediaRegistry.hostActive = false
      mediaRegistry.hostStop = undefined
      if (typeof hostStop === 'function') {
        try { await hostStop() } catch { /* 宿主重启时会释放 */ }
      }
    }

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

      // 把当前流登记到全局 registry（面试间保护用）。
      useEffect(() => {
        mediaRegistry.stream = stream
        return () => { if (mediaRegistry.stream === stream) mediaRegistry.stream = undefined }
      }, [stream])

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
          const text = error instanceof Error ? error.message : String(error)
          // Host 已经把「为什么打不开」和「下一步怎么办」写在 message 里了。
          // 这里只补一句不影响面试的兜底，**不要**再猜一个原因——上一版
          // 无论什么错都提示「装一个 ffmpeg」，而 ffmpeg 明明已经找到了，
          // 那种自相矛盾的提示比不给提示更糟。
          const needsFfmpeg = /ffmpeg|采集程序/i.test(text)
          setState({
            active: false,
            busy: false,
            error: {
              kind: 'host-camera',
              text,
              action: needsFfmpeg
                ? '宿主侧没有找到 ffmpeg：在「设置」里填它的路径，或让插件帮你装一个。'
                  + '面试照常进行，语音提问、文字回答、录音都不受影响。'
                : '原因与下一步见上一条。面试照常进行，语音提问、文字回答、录音都不受影响。',
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

      // Host 摄像头也登记到 registry：离开面试间时要能关掉它（设备是独占的）。
      useEffect(() => {
        mediaRegistry.hostActive = state.active
        mediaRegistry.hostStop = state.active ? stop : undefined
      }, [state.active, stop])

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


    /**
     * 离开面试间前的确认弹窗。
     *
     * **两件事必须说清楚**：会关掉什么（摄像头/麦克风）、以及现在是不是
     * 正在面试（二次确认，防误触）。`second` 为 true 时按钮文案变成
     * 「再次点击确认离开」——不是防呆，是防手滑。
     */
    function GuardDialog(props) {
      const { guard, onCancel, onToggleRemember, onConfirm } = props
      const danger = guard.inInterview === true
      return h('div', { style: S.overlay, role: 'dialog', 'aria-modal': 'true' }, [
        h('div', { key: 'm', style: S.modal }, [
          h('div', { key: 't', style: { ...S.cardTitle, marginBottom: 8 } },
            danger ? '正在面试中，确定要离开？' : '离开面试间？'),
          h('div', { key: 'd', style: S.hint },
            danger
              ? '这场面试正在进行。离开会关闭摄像头与麦克风，并中断当前这一轮。'
              : '离开会关闭正在使用的摄像头与麦克风。'),
          h('label', {
            key: 'r',
            style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 12, color: C.boneDim, cursor: 'pointer' },
          }, [
            h('input', {
              key: 'c', type: 'checkbox', checked: guard.remember === true,
              onChange: event => onToggleRemember(event.target.checked),
            }),
            h('span', { key: 's' }, '以后不再提醒（可在设置页恢复）'),
          ]),
          h('div', { key: 'b', style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 } }, [
            h('button', { key: 'cancel', style: S.btn(false, false), onClick: onCancel }, '留在面试间'),
            h('button', {
              key: 'ok',
              style: S.btn(danger ? 'tally' : 'primary', false),
              // 文案跟**点击进度**走：第一次是「确认离开」，点过之后才提示
              // 「再次点击确认离开」——否则一上来就让人"再次"，会读成废话。
              onClick: onConfirm,
            }, danger && guard.second === true ? '再次点击确认离开' : '确认离开'),
          ]),
        ]),
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
      // 语音链路：识别走宿主 / 服务端 / 浏览器，播报走模型 / 免密钥自然音 / 浏览器。
      // 4 秒轮询：宿主模型准备进度要跟着走，但不必抢面试轮询的 1.5 秒。
      const voiceStatus = usePoll(() => apiGet('voice'), 4000, [])
      const tts = useSpeech(voiceStatus.data?.tts, config)
      const videoRef = useRef(null)
      const [answer, setAnswer] = useState('')
      const [speaking, setSpeaking] = useState(false)
      const lastQuestionRef = useRef('')

      const answerSegmentsRef = useRef([])
      /** 识别到的一句追加进草稿（用户可以改，所以只追加不覆盖）。 */
      const appendRecognized = useCallback((text, meta) => {
        if (typeof text !== 'string' || text.trim() === '') return
        // 每一段都带一份语流原始测量；这一轮回答结束时一起上报。
        if (meta?.segment !== undefined) {
          answerSegmentsRef.current = [...answerSegmentsRef.current, meta.segment]
        }
        setAnswer(previous => `${previous}${previous.trim() === '' ? '' : ' '}${text.trim()}`)
      }, [])

      const webAsr = useAsr(appendRecognized)
      const segmentAsr = useSegmentAsr(appendRecognized, { language: voiceStatus.data?.asr?.language ?? 'zh' })
      const asrMode = voiceStatus.data?.asr?.mode ?? 'browser'
      // 宿主/服务端模式用分段识别（它们只收整段录音）；浏览器模式用 Web Speech。
      const serverAsr = asrMode === 'host' || asrMode === 'server'
      const asr = serverAsr ? segmentAsr : webAsr

      /** 让宿主开始准备它的语音模型（首次要下载）。 */
      const prepareSpeech = useCallback(async () => {
        try {
          const result = await apiPost('voice/prepare', {})
          notify(result.ok === true ? '已开始准备' : '准备没启动', result.reason ?? '', result.ok === true ? 'ok' : 'error')
          voiceStatus.refresh()
        } catch (failure) {
          notify('准备失败', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, voiceStatus.refresh])

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

      /**
       * 最近一轮回答的语流观察。
       *
       * **它从会话状态里读，不从客户端本地攒。** Host 端是唯一算指标的地方，
       * 面板只是显示——这样报告、agent、面板看到的是同一份数字。
       */
      const lastFluency = useMemo(() => {
        for (let index = transcript.length - 1; index >= 0; index -= 1) {
          const row = transcript[index]
          if (row.role === 'candidate' && row.meta?.fluency !== undefined) return row.meta.fluency
        }
        return undefined
      }, [transcript])

      // 新问题自动朗读（可关）。
      const speakLine = tts.speak
      useEffect(() => {
        if (lastQuestion === undefined) return
        if (!speaking) return
        if (lastQuestion.text === lastQuestionRef.current) return
        lastQuestionRef.current = lastQuestion.text
        if (config?.ttsProvider !== 'none') void speakLine(lastQuestion.text, { rate: config?.ttsRate ?? 1 })
      }, [lastQuestion, speaking, speakLine, config?.ttsProvider, config?.ttsRate])

      const submitAnswer = useCallback(async () => {
        const text = answer.trim()
        if (text === '') return
        const segments = answerSegmentsRef.current
        try {
          await apiPost(`sessions/${session.session.id}/turn`, {
            role: 'candidate',
            text,
            // 语流只上报**原始测量**：Host 端统一算指标（单一实现）。
            meta: { source: 'panel', ...(segments.length > 0 ? { fluency: { segments } } : {}) },
          })
          answerSegmentsRef.current = []
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
        // 这是整个面试里最可靠的一次用户手势：在这里解锁音频，
        // 第一句提问自动播报时才不会被浏览器拦掉。
        unlockAudio()
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

      // 链路名称：面板必须能直接回答「现在到底在用哪条链路」，
      // 而不是只给一个 mode 枚举。
      const asrInfo = voiceStatus.data?.asr
      const ttsInfo = voiceStatus.data?.tts
      const asrLabel = asrMode === 'host'
        ? `宿主语音 · ${asrInfo?.host?.provider?.name ?? asrInfo?.host?.provider?.id ?? '本地模型'}`
        : asrMode === 'server'
          ? `服务端识别 · ${asrInfo?.server?.model ?? 'HTTP'}`
          : asrMode === 'none'
            ? '识别已关闭'
            : '浏览器识别'
      const ttsLabel = ttsInfo?.mode === 'server'
        ? `模型播报 · ${ttsInfo.label ?? ttsInfo.provider ?? ''}`
        : ttsInfo?.mode === 'none'
          ? '播报已关闭'
          : '浏览器音色'
      const needsPrepare = asrMode === 'host' && asrInfo?.host?.needsPreparation === true

      /**
       * 播一句并给出**真实**结果：播不出来必须说出来，不能静默空操作。
       *
       * **为什么放在 questionText 之后。** 依赖数组在渲染期求值，提前引用
       * 会踩 TDZ——这条被布局闸门抓到过一次（ReferenceError）。
       */
      const trySpeak = useCallback(async text => {
        unlockAudio()
        const played = await tts.speak(text, { rate: config?.ttsRate ?? 1 })
        if (played !== true) {
          notify('这轮没播出来', tts.notice ?? '模型与浏览器音色都不可用；问题仍以文字显示。', 'error')
          setSpeaking(false)
        }
        return played
      }, [tts, config?.ttsRate, notify])

      /** 「朗读问题」的真实入口：没有问题就播测试音频，并说明是测试。 */
      const speakButton = useCallback(() => {
        if (speaking) {
          tts.stop()
          setSpeaking(false)
          return
        }
        setSpeaking(true)
        if (questionText !== undefined) {
          lastQuestionRef.current = questionText
          void trySpeak(questionText)
          return
        }
        // 「点了没反应」是最糟的反馈：用户会以为语音功能坏了。
        notify('还没有可朗读的问题', '先播一句测试音频，确认音色与音箱。', 'ok')
        void trySpeak('你好，我是本次面试官。这是一段语音测试。')
      }, [speaking, tts, questionText, trySpeak, notify])

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
                  onClick: () => (asr.active ? asr.stop() : void asr.start()),
                }, asr.active ? '停止识别' : (serverAsr ? '分段识别' : '语音识别')),
                h('button', {
                  key: 'tts',
                  style: S.btn(false, !tts.supported),
                  onClick: speakButton,
                }, speaking ? '关闭朗读' : '朗读问题'),
                needsPrepare
                  ? h('button', {
                    key: 'prep',
                    style: S.btn('primary', false),
                    onClick: prepareSpeech,
                  }, '准备语音模型')
                  : null,
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

            // 语流：上一轮回答的「怎么说」。观察值，不是评分。
            lastFluency !== undefined
              ? h('div', { key: 'flu', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.7 } },
                `语流：说 ${(lastFluency.speechMs / 1000).toFixed(1)}s · 停 ${(lastFluency.silenceMs / 1000).toFixed(1)}s`
                + `（长停顿 ${lastFluency.pauseCount} 次，最长 ${(lastFluency.longestPauseMs / 1000).toFixed(1)}s）`
                + ` · 语速 ${lastFluency.speechRate} 字/秒`
                + ` · 口头语 ${lastFluency.fillerCount} 次 · 重复 ${lastFluency.repeats} 次`)
              : null,

            // 权限错误**不在这里再说一遍**——舞台上的红框已经把话说全了，
            // 同一句话出现在两个地方只会让人以为出了两个问题。
            asr.error !== undefined
              ? h('div', { key: 'ae', style: { fontSize: 11.5, color: C.amber, lineHeight: 1.6 } }, asr.error)
              : null,
            asr.interim !== ''
              ? h('div', { key: 'ai', style: { fontSize: 11.5, color: C.boneFaint, fontStyle: 'italic' } }, asr.interim)
              : null,
            // 链路状态：**面板必须说清现在用的是哪条**，以及为什么用它。
            // 「静默换了链路」比换个链路更糟——用户会以为在用模型，实际是系统音色。
            h('div', { key: 'chain', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.7 } }, [
              h('div', { key: 'a' }, `识别：${asrLabel}`),
              h('div', { key: 't' }, `播报：${ttsLabel}`),
              asrInfo?.reason !== undefined
                ? h('div', { key: 'ar', style: { fontStyle: 'italic' } }, asrInfo.reason)
                : null,
              serverAsr && segmentAsr.timing !== undefined
                ? h('div', { key: 'at', style: { color: C.jade } },
                  `上一段：${segmentAsr.timing.audioSeconds.toFixed(1)}s 音频 → ${segmentAsr.timing.inferenceSeconds.toFixed(2)}s 转写`)
                : null,
              tts.notice !== undefined
                ? h('div', { key: 'tn', style: { color: C.amber } }, tts.notice)
                : null,
              needsPrepare && asrInfo?.hint !== undefined
                ? h('div', { key: 'ah', style: { color: C.amber } }, asrInfo.hint)
                : null,
            ]),
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

/**
 * 设置页：**所有「东西在哪、现在用哪个」都在这里回答。**
 *
 * 这一页不是 DSH 的设置页的替代品，也不是要再占一个位置——它是「模拟面试间」
 * 自己的透明面板：数据根、当前面试与产物、宿主工作区、语音链路与模型、
 * 摄像头两条采集通道、麦克风/摄像头状态、以及面试间保护的开关。
 *
 * 纪律：
 *  - 读的是 Host 的 `/settings` 快照（单一真源），页面**不自己推断**；
 *  - 改设置走 `POST /settings`（白名单键），配置文件里写死的项会被拒绝并说明原因；
 *  - 每个「现在用的是哪个」都要同时给出**原因**，不只是状态。
 */
function SettingsView(props) {
  const { session, notify } = props
  const sessionId = session?.session?.id
  const snapshot = usePoll(
    () => apiGet('settings', sessionId === undefined ? undefined : { session: sessionId }),
    5000,
    [sessionId],
  )
  const data = snapshot.data
  const [ffmpegPath, setFfmpegPath] = useState('')
  const [chromiumPath, setChromiumPath] = useState('')
  const [ttsProvider, setTtsProvider] = useState('auto')
  const [ttsModel, setTtsModel] = useState('')
  const [ttsVoice, setTtsVoice] = useState('')
  const [diagnosis, setDiagnosis] = useState(undefined)
  const [busy, setBusy] = useState('')

  // 首次拿到快照时把输入框填上（之后以用户输入为准，不被轮询覆盖）。
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || data === undefined) return
    seeded.current = true
    setFfmpegPath(data.settings?.ffmpegPath ?? '')
    setChromiumPath(data.settings?.chromiumPath ?? '')
    setTtsProvider(data.settings?.ttsProvider ?? 'auto')
    setTtsModel(data.settings?.ttsModel ?? '')
    setTtsVoice(data.settings?.ttsVoice ?? '')
  }, [data])

  const save = useCallback(async patch => {
    try {
      const result = await apiPost('settings', patch)
      const ignored = result?.ignored ?? []
      notify(
        ignored.length === 0 ? '设置已保存' : '部分设置没生效',
        ignored.length === 0 ? '下一次操作就会按新设置执行。' : ignored.map(item => item.reason).join('；'),
        ignored.length === 0 ? 'ok' : 'error',
      )
      snapshot.refresh()
    } catch (failure) {
      notify('保存失败', failure instanceof Error ? failure.message : String(failure), 'error')
    }
  }, [notify])

  const runDiagnose = useCallback(async () => {
    setBusy('diagnose')
    try {
      const result = await apiGet('camera/diagnose')
      setDiagnosis(result)
      notify(
        result.ok ? '摄像头可用' : '摄像头不可用',
        result.ok ? `采集后端：${result.backend ?? '未知'}` : (result.reason ?? ''),
        result.ok ? 'ok' : 'error',
      )
    } catch (failure) {
      notify('自检失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [notify])

  const prepareModel = useCallback(async () => {
    setBusy('model')
    try {
      const result = await apiPost('voice/prepare', {})
      notify(result.ok ? '已开始准备语音模型' : '准备没启动', result.reason ?? '', result.ok ? 'ok' : 'error')
    } catch (failure) {
      notify('准备失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
      snapshot.refresh()
    }
  }, [notify])

  /** 一行「标签 → 值（+ 来源/理由）」。 */
  const line = (key, label, value, hint) => h('div', {
    key,
    style: {
      display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0',
      borderBottom: `1px solid ${C.ruleSoft}`,
    },
  }, [
    h('span', { key: 'l', style: { ...S.label, width: 96, flex: '0 0 auto', marginBottom: 0 } }, label),
    h('span', { key: 'v', style: { flex: '1 1 auto', minWidth: 0, fontSize: 12.5, color: C.bone, wordBreak: 'break-all', fontFamily: F.mono } }, value),
    hint !== undefined ? h('span', { key: 'h', style: { flex: '0 0 auto', fontSize: 11, color: C.boneFaint } }, hint) : null,
  ])

  if (data === undefined) {
    return h('div', { style: { ...S.card, padding: '18px 20px', color: C.boneFaint, fontSize: 12.5, lineHeight: 1.8 } }, loadingHint(snapshot.error))
  }

  const voice = data.voice ?? {}
  const asr = voice.asr ?? {}
  const tts = voice.tts ?? {}
  const camera = data.camera ?? {}
  const backends = data.backends ?? {}
  const model = data.speechModel ?? {}

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } }, [
    h('div', { key: 'data' }, [
      h('div', { key: 'h', style: S.eyebrow }, '数据在哪'),
      line('root', '卷宗库', data.dataRoot?.path ?? '', data.dataRoot?.source),
      h('div', { key: 'why', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.7, padding: '4px 0 8px' } }, data.dataRoot?.reason ?? ''),
      line('sessions', '面试目录', data.sessionsDir ?? ''),
      line('profiles', '岗位档案', data.profilesDir ?? ''),
      line('settings', '设置文件', data.settingsFile ?? ''),
      line('host', '宿主工作区', data.hostWorkspace?.path ?? ''),
      h('div', { key: 'note', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.7 } }, data.hostWorkspace?.note ?? ''),
    ]),

    session === undefined ? null : h('div', { key: 'session' }, [
      h('div', { key: 'h', style: S.eyebrow }, '这一场的产物'),
      line('id', '面试 id', session.session?.id ?? ''),
      line('dir', '卷宗目录', data.session?.dir ?? ''),
      (data.session?.artifacts ?? []).map(item => line(
        `a-${item.name}`,
        item.kind === 'video' ? '录像' : item.kind === 'audio' ? '录音' : '文件',
        item.name,
        formatBytes(item.bytes),
      )),
    ]),

    h('div', { key: 'voice' }, [
      h('div', { key: 'h', style: S.eyebrow }, '语音：现在用哪条'),
      line('asr', '识别', `${asr.mode ?? '?'}${asr.host?.provider?.name !== undefined ? ` · ${asr.host.provider.name}` : ''}`, asr.source),
      h('div', { key: 'ar', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.7, padding: '2px 0 6px' } }, asr.reason ?? ''),
      line('tts', '播报', `${tts.mode ?? '?'}${tts.label !== undefined ? ` · ${tts.label}` : ''}`, tts.source),
      h('div', { key: 'tr', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.7, padding: '2px 0 6px' } }, tts.reason ?? ''),
      line('model', '宿主模型', `${model.provider ?? ''} · ${formatBytes(model.bytes ?? 0)} · ${model.files ?? 0} 个文件`, model.exists === true ? '已就绪' : '未下载'),
      line('modeldir', '模型目录', model.dir ?? ''),
      h('div', { key: 'modelbtns', style: { display: 'flex', gap: 8, paddingTop: 8, flexWrap: 'wrap' } }, [
        h('button', {
          key: 'prep',
          style: S.btn(false, busy === 'model'),
          onClick: prepareModel,
        }, busy === 'model' ? '正在准备…' : '准备语音模型'),
      ]),
      h('div', { key: 'ttsform', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 12 } }, [
        h('div', { key: 'p' }, [
          h('div', { key: 'l', style: S.label }, '播报来源（面板设置）'),
          h('select', {
            key: 's',
            style: S.input,
            value: ttsProvider,
            onChange: event => setTtsProvider(event.target.value),
          }, ['auto', 'browser', 'mimo', 'openai', 'minimax', 'baidu', 'edge', 'none'].map(name => h('option', { key: name, value: name }, name))),
        ]),
        h('div', { key: 'm' }, [
          h('div', { key: 'l', style: S.label }, '播报模型'),
          h('input', {
            key: 'i',
            style: S.input,
            value: ttsModel,
            placeholder: '留空 = 该来源的默认模型',
            onChange: event => setTtsModel(event.target.value),
          }),
        ]),
        h('div', { key: 'v' }, [
          h('div', { key: 'l', style: S.label }, '音色'),
          h('input', {
            key: 'i',
            style: S.input,
            value: ttsVoice,
            placeholder: '留空 = 默认音色',
            onChange: event => setTtsVoice(event.target.value),
          }),
        ]),
        h('div', { key: 'save', style: { display: 'flex', alignItems: 'flex-end' } }, [
          h('button', {
            key: 'b',
            style: S.btn('primary', false),
            onClick: () => save({ ttsProvider, ttsModel, ttsVoice }),
          }, '保存语音设置'),
        ]),
      ]),
    ]),

    h('div', { key: 'camera' }, [
      h('div', { key: 'h', style: S.eyebrow }, '摄像头：两条采集通道'),
      line('backend', '当前后端', camera.backend === 'chromium-mf' ? 'Chromium（Media Foundation）' : camera.backend === 'ffmpeg' ? 'ffmpeg（DirectShow）' : '未接通'),
      line('fstate', '状态', camera.running === true ? (camera.hasFrame === true ? '画面已接通' : '进程在，但还没出帧') : '未启动'),
      line('ff', 'ffmpeg', backends.ffmpeg?.found === true ? backends.ffmpeg.path : '未找到', backends.ffmpeg?.source),
      line('cr', 'Chromium', backends.chromium?.found === true ? backends.chromium.path : '未找到', backends.chromium?.source),
      h('div', { key: 'paths', style: { display: 'grid', gridTemplateColumns: '1fr', gap: 10, paddingTop: 10 } }, [
        h('div', { key: 'f' }, [
          h('div', { key: 'l', style: S.label }, 'ffmpeg 路径（留空 = 走 PATH）'),
          h('input', {
            key: 'i',
            style: S.input,
            value: ffmpegPath,
            placeholder: 'D:\\tools\\ffmpeg\\bin\\ffmpeg.exe',
            onChange: event => setFfmpegPath(event.target.value),
          }),
        ]),
        h('div', { key: 'c' }, [
          h('div', { key: 'l', style: S.label }, 'Chrome / Edge 路径（留空 = 自动发现）'),
          h('input', {
            key: 'i',
            style: S.input,
            value: chromiumPath,
            placeholder: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            onChange: event => setChromiumPath(event.target.value),
          }),
        ]),
        h('div', { key: 'b', style: { display: 'flex', gap: 8, flexWrap: 'wrap' } }, [
          h('button', { key: 'save', style: S.btn('primary', false), onClick: () => save({ ffmpegPath, chromiumPath }) }, '保存路径'),
          h('button', { key: 'diag', style: S.btn(false, busy === 'diagnose'), onClick: runDiagnose }, busy === 'diagnose' ? '正在自检…' : '自检摄像头'),
        ]),
      ]),
      diagnosis !== undefined
        ? h('div', { key: 'diag', style: { paddingTop: 10, fontSize: 11.5, lineHeight: 1.8, color: diagnosis.ok ? C.jade : C.amber } }, [
          h('div', { key: 'a' }, diagnosis.ok ? `可用 · 后端 ${diagnosis.backend ?? '未知'}` : `不可用 · ${diagnosis.reason ?? ''}`),
          diagnosis.hint !== undefined && diagnosis.hint !== ''
            ? h('div', { key: 'b', style: { color: C.boneFaint } }, diagnosis.hint)
            : null,
          (diagnosis.probes ?? []).map(probe => h('div', { key: probe.name, style: { color: C.boneFaint, fontFamily: F.mono } }, `${probe.name}: ${probe.ok ? '抓帧成功' : (probe.detail ?? '失败')}`)),
        ])
        : null,
    ]),

    h('div', { key: 'guard' }, [
      h('div', { key: 'h', style: S.eyebrow }, '面试间保护'),
      line('gq', '退出提醒', data.settings?.guardQuiet === true ? '已关闭（以后不再提醒）' : '开启'),
      h('div', { key: 'b', style: { paddingTop: 8 } }, [
        h('button', {
          key: 'reset',
          style: S.btn(false, data.settings?.guardQuiet !== true),
          onClick: () => save({ guardQuiet: false }),
        }, '恢复退出提醒'),
      ]),
      h('div', { key: 'note', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.7, paddingTop: 6 } },
        '面试中退出会强制二次确认；未开始时只提醒一次。'),
    ]),
  ])
}

/** 设置页加载中的一句话。 */
function loadingHint(error) {
  return error === undefined ? '正在读取…' : `读不到设置：${error}`
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

      // ── 面试间保护 ────────────────────────────────────────────────
      //
      // 设备开着时，离开面板（切页签、切面试、宿主卸载）要先确认。
      // 确认后**一定**释放设备：指示灯一直亮着是最糟的结局。
      const [guard, setGuard] = useState(undefined)
      const settingsPoll = usePoll(() => apiGet('settings'), 8000, [])
      const guardQuiet = settingsPoll.data?.settings?.guardQuiet === true

      // 深空仪表盘的全局样式（悬停、聚焦环、入场动效）只注入一次。
      useEffect(() => { injectThemeCss() }, [])

      // 宿主卸载面板时（切会话、切插件、关页签）设备必须被放掉。
      useEffect(() => () => {
        if (!mediaInUse().any) return
        void releaseAllMedia()
        try { sessionStorage.setItem('dsh-iv-left', '1') } catch { /* 隐私模式 */ }
      }, [])
      useEffect(() => {
        let left = false
        try {
          left = sessionStorage.getItem('dsh-iv-left') === '1'
          sessionStorage.removeItem('dsh-iv-left')
        } catch { /* 忽略 */ }
        if (left) notify('你离开了面试间', '摄像头与麦克风已被关闭。', 'info')
      }, [])
      // 关页签/刷新走浏览器原生确认（这是唯一能"拦住"卸载的入口）。
      useEffect(() => {
        // 探针/SSR 里的 window 是桩，没有 addEventListener——先确认再用。
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const handler = event => {
          if (!mediaInUse().any) return
          event.preventDefault()
          event.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
      }, [])

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

      /** 带保护的跳转：设备开着且没勾「不再提醒」时先弹确认。 */
      const guardRun = useCallback((label, action) => {
        if (!mediaInUse().any || guardQuiet) { action(); return }
        setGuard({
          label,
          action,
          remember: false,
          second: false,
          inInterview: session?.session?.status === 'running',
        })
      }, [guardQuiet, session?.session?.status])

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
          h('div', {key: 'k20',  style: narrow ? { ...S.tabs, marginLeft: 0, flex: '0 0 auto', flexWrap: 'wrap' } : { ...S.tabs, flexWrap: 'wrap' } }, [
            h('div', { key: 'a', style: S.tab(tab === 'prepare'), onClick: () => guardRun('切换到「准备」', () => setTab('prepare')) }, '准备'),
            h('div', { key: 'b', style: S.tab(tab === 'live'), onClick: () => guardRun('切换到「面试中」', () => setTab('live')) }, '面试中'),
            h('div', { key: 'c', style: S.tab(tab === 'report'), onClick: () => guardRun('切换到「报告」', () => setTab('report')) }, '报告'),
            // 设置页放在这里，**不占 DSH 设置页的位置**：路径、模型、后端、
            // 保护开关都是这个插件自己的事，混进宿主设置只会让人找不着。
            h('div', { key: 'd', style: S.tab(tab === 'settings'), onClick: () => guardRun('切换到「设置」', () => setTab('settings')) }, '设置'),
          ]),
          guard === undefined ? null : h(GuardDialog, {
            key: 'guard',
            guard,
            onCancel: () => setGuard(undefined),
            onToggleRemember: checked => setGuard(previous => ({ ...previous, remember: checked })),
            onConfirm: async () => {
              if (guard.inInterview === true && guard.second !== true) {
                setGuard(previous => ({ ...previous, second: true }))
                return
              }
              if (guard.remember === true) {
                try { await apiPost('settings', { guardQuiet: true }) } catch { /* 存不下也继续 */ }
              }
              const action = guard.action
              setGuard(undefined)
              await releaseAllMedia()
              action()
            },
          }),
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
            onClick: () => guardRun('新建面试', createSession),
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
                    onClick: () => guardRun('切换面试', () => setSelected(row.id)),
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
                      onClick: () => guardRun('切换面试', () => setSelected(row.id)),
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
                  : tab === 'report'
                    ? h(ReportView, { key: 'report', session, config, onChanged: refreshAll, notify })
                    : h(SettingsView, { key: 'settings', session, config, notify }),
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
