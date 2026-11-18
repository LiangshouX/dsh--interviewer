/*!
 * dsh-realtime-interview — client half (browser bundle).
 *
 * 模拟面试间 —— 把「简历 + 目标岗位 JD」变成**一场有准备的面试**。
 *
 * 设计语言：**暗房里的观片台**。
 *
 * 一场面试就是一份案卷：简历与 JD 是卷内材料，考点清单是**面试官的底稿**
 * （真实面试里你看不到它），转录是速记，面试后的报告是评估表。
 * 这个隐喻不是装饰——它直接对应产品纪律：
 *
 *   ① **底稿默认收起。** 考点清单在准备阶段可查可改，但进了面试就不是
 *      「你将会被问到的问题」——那会把一场面试变成答题游戏。
 *   ② **舞台永远是主位。** 面试中，视频区占满左半屏；没有摄像头时也
 *      不塌成一行提示——那是一个**设计过的「未接通」状态**，因为画面
 *      本身就是面试室的一部分。
 *   ③ **权限被拒不是死路。** 拿不到摄像头是常事，所以插件会**主动发起
 *      授权申请**，并盯着系统设置里的变化自动接上，而不是甩一句错误。
 *   ④ **输入永远有两条路。** 语音识别是效率，键盘输入是保底。
 *   ⑤ **界面不解释自己。** 常驻版面只放标签、状态、数值与动作；
 *      为什么这样设计的说明进悬停/弹层，或者删掉。唯一必须留在明面上的
 *      长文字是**失败时的出路**。完整契约见 docs/DESIGN.md。
 *
 * 视觉：**素雅但高级**。
 *
 *   · 底是中性墨（不是纯黑），字是骨白（不是纯白）；强调色各有唯一职责：
 *     氧化朱红只给 REC 与危险动作，琥珀只给「当前提问」，青玉只表示就绪。
 *   · 立体感不靠描边大小，靠**三层表面**（纸面/浮起/舞台）：极细描边 +
 *     顶边内高光 + 柔和负扩散阴影，外加 2% 的胶片颗粒。见 30-theme.js 的
 *     `S.surface()` 与 `.iv-s1/.iv-s2/.iv-s3`。
 *   · 科技感来自**仪表语言**：等宽小标签、24px 点阵、tabular 数字、刻度式电平。
 *   · 灵动感来自**位移与呼吸**：40ms 错峰的入场、1px 的悬停、46s 的光斑漂移、
 *     6s 的呼吸灯——不是弹跳与闪烁。
 *   · 排版只有六档字号（display / title / body / sub / meta / nano），
 *     层级靠字重、颜色、留白区分，不靠半像素的字号差。
 *   · 主按钮用骨白反色而不是蓝——蓝按钮会让它退回通用后台的样子。
 *
 * Bundle format: the official DSH client-bundle shape — a lazy-CJS closure
 * registered with window.__ModuleLoader__.load({ id, factory }). `react` comes
 * from the browser module table at runtime; everything else is inlined, so the
 * plugin carries no build step and no runtime dependency.
 *
 * **这个文件是生成的**：源码在 src/client/，顺序见 manifest.json。
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
        // 「简历 + JD → 一场有准备的面试」这句副标题**已删除**：
        // 它是设计说明书，不是界面（docs/DESIGN.md §1）。页头的品牌记号
        // 与页面本身已经在说这件事，不必再写一行字解释自己。
        'tab.prepare': '准备',
        'tab.live': '面试中',
        'tab.report': '报告',
        'tab.settings': '设置',
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
        // 页头上的两枚芯片：卷宗库（末两段路径 + 可点换目录）与关闭通知。
        'action.browse': '浏览…',
        'action.closeNotice': '关闭通知',
        // 场次行的两个悬停动作。
        'action.archive': '归档',
        'action.unarchive': '取出',
        'action.delete': '删除',
        'state.empty': '还没有面试。',
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
        'tab.prepare': 'Prepare',
        'tab.live': 'Live',
        'tab.report': 'Report',
        'tab.settings': 'Settings',
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
        'action.browse': 'Browse…',
        'action.closeNotice': 'Dismiss',
        'action.archive': 'Archive',
        'action.unarchive': 'Restore',
        'action.delete': 'Delete',
        'state.empty': 'No interview yet.',
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
    //   展现（衬线）—— 页面主标题、提问、报告大标题。它是「人说的话」，
    //                  不是界面标签。拉丁走 Georgia，中文落到思源宋
    //                  （Noto Serif SC / Source Han Serif SC）——这是本机
    //                  已经装好的一套，中文标题终于不是「加粗的雅黑」。
    //   界面（无衬线）—— 一切可点的、可读的。
    //   数据（等宽）—— 计时、电平、字数、路径、id。数字要能对齐着看。
    const F = {
      display:
        '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, '
        + '"Noto Serif SC", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif',
      ui:
        'system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", '
        + '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
      mono: '"SF Mono", "Cascadia Mono", "Cascadia Code", Consolas, "Roboto Mono", ui-monospace, monospace',
    }

    /**
     * 字号只允许这六档。
     *
     * **为什么要写死。** 上一版散落着 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5
     * 八个字号——每个都略有不同，于是"看起来有点杂"永远说不清是哪里的问题。
     * 字阶收窄之后，层级靠**字重、颜色、留白**区分，而不是靠半像素的字号差。
     *
     * unit 只是标注，真正生效的是 style 里的值。
     */
    const TYPE = {
      display: { fontSize: 24, fontWeight: 600, lineHeight: 1.26, letterSpacing: '0.008em' },
      title: { fontSize: 17, fontWeight: 600, lineHeight: 1.45, letterSpacing: '0.008em' },
      body: { fontSize: 13.5, fontWeight: 400, lineHeight: 1.78 },
      sub: { fontSize: 12.5, fontWeight: 400, lineHeight: 1.72 },
      meta: { fontSize: 10.5, fontWeight: 500, lineHeight: 1.6, letterSpacing: '0.14em', textTransform: 'uppercase' },
      nano: { fontSize: 9.5, fontWeight: 500, lineHeight: 1.5, letterSpacing: '0.12em', textTransform: 'uppercase' },
    }

    /** 间距阶梯：4 / 8 / 12 / 16 / 20 / 24 / 28 / 40。中间值一律不许出现。 */
    const SPACE = [0, 4, 8, 12, 16, 20, 24, 28, 40]
    const RADIUS = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 }

    // ── palette ───────────────────────────────────────────────────────────
    //
    // 底是**墨**（偏冷的深灰蓝），不是纯黑——纯黑会让它变成一个网页。
    // 文字是**骨白**（带一点暖），不是纯白——纯白在深底上太刺眼。
    // 三个强调色各有唯一职责，不做装饰用：
    //   tally 氧化朱红 = 正在录制（唯一用到它的地方是 REC 灯与危险动作）
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
      accent: 'var(--iv-accent)',
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
      // ── 材质与层次 ──────────────────────────────────────────────────────
      //
      // 「立体」不是描边粗细的问题，是**光**的问题。每个表面都要回答三件事：
      // 它朝哪受光（顶部高光 + 底部暗边）、它离台面多高（接触影 + 环境影）、
      // 它是凸起还是凹陷（surface vs well）。
      surface1: 'var(--iv-surface-1)',
      surface2: 'var(--iv-surface-2)',
      surface3: 'var(--iv-surface-3)',
      /** 凹面：输入框、页签槽、电平表底。 */
      well: 'var(--iv-well)',
      inset: 'var(--iv-inset)',
      edge: 'var(--iv-edge)',
      hi: 'var(--iv-hi)',
      hiSoft: 'var(--iv-hi-soft)',
      lo: 'var(--iv-lo)',
      elev1: 'var(--iv-elev-1)',
      elev2: 'var(--iv-elev-2)',
      elev3: 'var(--iv-elev-3)',
      elev4: 'var(--iv-elev-4)',
      elevStage: 'var(--iv-elev-stage)',
      /** 主按钮的三段：上亮面、下暗面、字色。 */
      primaryTop: 'var(--iv-primary-top)',
      primaryBottom: 'var(--iv-primary-bottom)',
      primaryText: 'var(--iv-primary-text)',
      primaryShadow: 'var(--iv-primary-shadow)',
      /** 磨砂（页头压在内容上时用它，才有"层"）。 */
      glass: 'var(--iv-glass)',
      vignette: 'var(--iv-vignette)',
      accentWash: 'var(--iv-accent-wash)',
      ring: 'var(--iv-ring)',
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
      // ── 素墨（暗色）──────────────────────────────────────────────────
      // 参考 dsh-media-desk 的做法：**不靠彩色取胜**。底是中性墨，
      // 只有极淡的环境光（蓝/粉/绿，2% 量级），强调色只在必要时出现。
      // 主按钮是高对比中性色（骨白），不是绿——绿按钮会立刻变成"后台"。
      dark: {
        '--iv-ink900': '#05070A',
        '--iv-ink850': '#080B0F',
        '--iv-ink800': '#0F1319',
        '--iv-ink750': '#161B22',
        '--iv-ink700': '#1E242D',
        // ── 表面：光从上方来 ────────────────────────────────────────────
        //
        // 一层表面要有三样东西才「立」得起来：
        //   ① **薄渐变**：顶部亮一点、底部暗一点（受光面 + 背光面）；
        //   ② **顶边高光**：`inset 0 1px 0 var(--iv-hi)`，像铣出来的倒角；
        //   ③ **两层影**：1–2px 的接触影 + 大模糊负扩散的环境影。
        // 少任何一样，它都只是一块贴着边框的色块——也就是「单薄的纸」。
        // 表面 = 高光带（左上斜扫）+ 竖向受光渐变 + 底色。
        // 中间那层斜向高光是**镜面反射**：它让"平的色块"变成"有涂层的表面"。
        '--iv-surface-1': 'linear-gradient(112deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.014) 26%, rgba(255,255,255,0) 48%), linear-gradient(178deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 8%, rgba(255,255,255,0.008) 34%, rgba(2,4,9,0.28) 100%), #171D25',
        '--iv-surface-2': 'linear-gradient(112deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.018) 26%, rgba(255,255,255,0) 48%), linear-gradient(178deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.062) 8%, rgba(255,255,255,0.012) 32%, rgba(2,4,9,0.32) 100%), #1C232C',
        '--iv-surface-3': 'linear-gradient(112deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 34%), linear-gradient(178deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0) 22%), #080B0F',
        // 凹面：输入框、页签槽、电平表底。**凸 + 凹同时存在**，层次才可信。
        '--iv-well': 'linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.26) 100%), #080C10',
        '--iv-inset': 'inset 0 1px 0 rgba(0,0,0,0.55), inset 0 2px 7px rgba(0,0,0,0.62), inset 0 0 0 1px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.045)',
        '--iv-hi': 'rgba(255,255,255,0.14)',
        '--iv-hi-soft': 'rgba(255,255,255,0.07)',
        '--iv-lo': 'rgba(2,4,9,0.58)',
        '--iv-edge': 'inset 0 1px 0 var(--iv-hi), inset 0 -1px 0 var(--iv-lo)',
        // 四级 elevation：contact（接触影）+ seam（外缝）+ ambient（环境影）。
        // 影是**蓝黑**的（rgba(2,4,9)）：真实场景里影由天光补色，纯黑影会显得像脏。
        //
        // **暗色下环境影要收着。** 页面底本身就是近黑（#04060A→#06080D），
        // 再叠一层 alpha≈1 的黑影，卡片下方那片区域会从「有层次」变成
        // 「一块糊住内容的黑」（底部的按钮与速记字被压得几乎看不见）。
        // 现在：接触影与外缝照旧，环境影的 alpha 收到 0.5–0.8、半径缩一档——
        // 四级**仍然分得开**（alpha 递增 + 半径递增），但不再吃掉内容。
        '--iv-elev-1': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.025), inset 0 -1px 0 rgba(2,4,9,0.45), inset 0 -16px 24px -20px rgba(2,4,9,0.75), 0 1px 2px rgba(2,4,9,0.62), 0 0 0 1px rgba(2,4,9,0.50), 0 16px 34px -20px rgba(2,4,9,0.55)',
        '--iv-elev-2': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(2,4,9,0.48), inset 0 -16px 24px -20px rgba(2,4,9,0.78), 0 1px 3px rgba(2,4,9,0.68), 0 0 0 1px rgba(2,4,9,0.52), 0 24px 48px -22px rgba(2,4,9,0.66)',
        '--iv-elev-3': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(2,4,9,0.50), 0 2px 6px rgba(2,4,9,0.70), 0 0 0 1px rgba(2,4,9,0.55), 0 36px 72px -30px rgba(2,4,9,0.74)',
        '--iv-elev-4': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.03), 0 2px 8px rgba(2,4,9,0.75), 0 0 0 1px rgba(2,4,9,0.60), 0 52px 96px -40px rgba(2,4,9,0.82)',
        // 舞台专用：比 elev-4 收一点——它下面还压着回答框，影太散会把下一条盖住。
        '--iv-elev-stage': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.03), 0 2px 8px rgba(2,4,9,0.72), 0 0 0 1px rgba(2,4,9,0.58), 0 32px 62px -34px rgba(2,4,9,0.60)',
        // 主按钮：**一块被按在台面上的骨白键**。上亮下暗才是实体。
        '--iv-primary-top': '#F4F6F9',
        '--iv-primary-bottom': '#D2D7DE',
        '--iv-primary-text': '#080A0D',
        '--iv-primary-shadow': 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(0,0,0,0.22), 0 1px 2px rgba(0,0,0,0.55), 0 10px 22px -14px rgba(0,0,0,0.85)',
        '--iv-glass': 'rgba(7,9,13,0.72)',
        // 暗角：只收四角一点点光。**不许收到底部发暗**——页面底部压着
        // 回答框与速记，暗角一重，那些字就读不出来了（见 elevation 的注释）。
        '--iv-vignette': 'radial-gradient(132% 96% at 50% 2%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.20) 84%, rgba(0,0,0,0.32) 100%)',
        '--iv-rule': 'rgba(255,255,255,0.115)',
        '--iv-rule-soft': 'rgba(255,255,255,0.06)',
        '--iv-bone': '#EBEDF0',
        '--iv-bone-dim': '#A9AFB9',
        '--iv-bone-faint': '#6C737D',
        '--iv-tally': '#E0563F',
        '--iv-amber': '#CDA96F',
        '--iv-jade': '#6FBF9A',
        '--iv-field': '#0A0E13',
        '--iv-on-bone': '#05070A',
        '--iv-stage': '#04060A',
        '--iv-plate-top': '#0E1218',
        '--iv-plate-mid': '#090C11',
        '--iv-plate-low': '#05070B',
        '--iv-cue-top': 'rgba(4,6,10,0)',
        '--iv-cue-mid': 'rgba(4,6,10,0.80)',
        '--iv-cue-low': 'rgba(4,6,10,0.96)',
        '--iv-band': 'rgba(8,10,14,0.94)',
        '--iv-clock': 'rgba(8,11,15,0.66)',
        '--iv-shadow': 'rgba(0,0,0,0.95)',
        '--iv-sheen': 'rgba(255,255,255,0.06)',
        '--iv-fade': 'rgba(5,7,10,0)',
        // 背景：一层中性底 + 三团 2% 的环境光（蓝/粉/绿），缓慢漂移。
        '--iv-bg': 'radial-gradient(52vmax 52vmax at -8% -14%, rgba(150,185,235,0.11), transparent 66%), '
          + 'radial-gradient(46vmax 46vmax at 108% -6%, rgba(225,170,200,0.075), transparent 64%), '
          + 'radial-gradient(50vmax 50vmax at 30% 116%, rgba(150,205,170,0.075), transparent 66%), '
          + 'linear-gradient(180deg, #04060A 0%, #06080D 100%)',
        '--iv-glow-jade': 'rgba(111,191,154,0.22)',
        '--iv-glow-cobalt': 'rgba(127,166,217,0.26)',
        '--iv-accent': '#7FA6D9',
        '--iv-accent-wash': 'rgba(127,166,217,0.12)',
        '--iv-ring': 'rgba(127,166,217,0.34)',
        '--iv-dot': 'rgba(233,235,238,0.09)',
        '--iv-tone-faint-text': '#6C737D',
        '--iv-tone-faint-edge': 'rgba(255,255,255,0.14)',
        '--iv-tone-faint-wash': 'rgba(255,255,255,0.05)',
        '--iv-tone-amber-text': '#CDA96F',
        '--iv-tone-amber-edge': 'rgba(205,169,111,0.30)',
        '--iv-tone-amber-wash': 'rgba(205,169,111,0.08)',
        '--iv-tone-jade-text': '#6FBF9A',
        '--iv-tone-jade-edge': 'rgba(111,191,154,0.30)',
        '--iv-tone-jade-wash': 'rgba(111,191,154,0.08)',
        '--iv-tone-tally-text': '#E0563F',
        '--iv-tone-tally-edge': 'rgba(224,86,63,0.36)',
        '--iv-tone-tally-wash': 'rgba(224,86,63,0.10)',
        '--iv-tone-tally-glow': 'rgba(224,86,63,0.40)',
      },
      // ── 纸白（亮色）──────────────────────────────────────────────────
      // 不是"人民币配色"：中性纸白 + 墨字，蓝灰做链接色；
      // 朱红只留给 REC，琥珀只留给提问，青玉只表示就绪。
      light: {
        '--iv-ink900': '#EEEDE7',
        '--iv-ink850': '#F3F2ED',
        '--iv-ink800': '#FFFFFF',
        '--iv-ink750': '#E9E8E1',
        '--iv-ink700': '#E0DED6',
        // 亮色下的立体感靠**白面 + 灰缝 + 暖影**：纸是白的，缝是灰的，
        // 影要偏暖（纯黑影在暖纸上会发脏）。
        '--iv-surface-1': 'linear-gradient(178deg, #FFFFFF 0%, #FEFDFB 52%, #F8F7F3 100%)',
        '--iv-surface-2': 'linear-gradient(178deg, #FFFFFF 0%, #FCFBF7 58%, #F4F3ED 100%)',
        '--iv-surface-3': 'linear-gradient(178deg, #FDFCF9 0%, #F2F1EA 100%)',
        '--iv-well': 'linear-gradient(180deg, #F1EFE9 0%, #FAF9F6 100%)',
        '--iv-inset': 'inset 0 1px 0 rgba(30,32,38,0.095), inset 0 2px 4px rgba(30,32,38,0.055), inset 0 0 0 1px rgba(30,32,38,0.06), inset 0 -1px 0 rgba(255,255,255,0.85)',
        '--iv-hi': 'rgba(255,255,255,1)',
        '--iv-hi-soft': 'rgba(255,255,255,0.75)',
        '--iv-lo': 'rgba(30,32,38,0.075)',
        '--iv-edge': 'inset 0 1px 0 var(--iv-hi), inset 0 -1px 0 var(--iv-lo)',
        '--iv-elev-1': 'inset 0 1px 0 var(--iv-hi), inset 0 -1px 0 var(--iv-lo), inset 0 -14px 20px -18px rgba(30,32,38,0.10), 0 1px 2px rgba(30,32,38,0.11), 0 0 0 1px rgba(30,32,38,0.045), 0 14px 28px -18px rgba(30,32,38,0.34)',
        '--iv-elev-2': 'inset 0 1px 0 var(--iv-hi), inset 0 -1px 0 var(--iv-lo), inset 0 -14px 20px -18px rgba(30,32,38,0.11), 0 1px 3px rgba(30,32,38,0.14), 0 0 0 1px rgba(30,32,38,0.05), 0 22px 44px -20px rgba(30,32,38,0.40)',
        '--iv-elev-3': 'inset 0 1px 0 var(--iv-hi), inset 0 -1px 0 var(--iv-lo), 0 2px 6px rgba(30,32,38,0.16), 0 0 0 1px rgba(30,32,38,0.05), 0 40px 80px -28px rgba(30,32,38,0.46)',
        '--iv-elev-4': 'inset 0 1px 0 var(--iv-hi), 0 2px 8px rgba(30,32,38,0.18), 0 0 0 1px rgba(30,32,38,0.06), 0 60px 110px -34px rgba(30,32,38,0.52)',
        // 舞台专用：亮色下**不能**用一级大模糊的向下投影——白底会把那团影
        // 读成"脏"，而不是"离桌面有距离"。收成贴身的一小段。
        '--iv-elev-stage': 'inset 0 1px 0 var(--iv-hi), 0 2px 6px rgba(30,32,38,0.16), 0 0 0 1px rgba(30,32,38,0.055), 0 16px 30px -22px rgba(30,32,38,0.36)',
        // 主按钮：亮色下是**一枚墨色键**。
        '--iv-primary-top': '#2E323A',
        '--iv-primary-bottom': '#14171C',
        '--iv-primary-text': '#FBFAF6',
        '--iv-primary-shadow': 'inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(0,0,0,0.35), 0 1px 2px rgba(30,32,38,0.22), 0 10px 20px -14px rgba(30,32,38,0.45)',
        '--iv-glass': 'rgba(244,243,238,0.76)',
        '--iv-vignette': 'radial-gradient(130% 90% at 50% 0%, rgba(30,32,38,0) 46%, rgba(30,32,38,0.055) 100%)',
        '--iv-rule': 'rgba(20,23,28,0.11)',
        '--iv-rule-soft': 'rgba(20,23,28,0.06)',
        '--iv-bone': '#1B1E23',
        '--iv-bone-dim': '#4F555D',
        '--iv-bone-faint': '#82888F',
        '--iv-tally': '#C24A34',
        '--iv-amber': '#8C6A2B',
        '--iv-jade': '#3F7D64',
        '--iv-field': '#FBF9F4',
        '--iv-on-bone': '#FAF9F6',
        // **亮色下的舞台要更深，不是更白。**
        // 纸白的页面里，如果舞台也接近白，视频区就不再是"主位"——它塌成了
        // 页面的一部分。所以亮色的舞台是一块**装裱用的厚卡纸**：比纸深一档、
        // 偏暖的灰，画面（或未接通板）落在它上面才立得住。
        '--iv-stage': '#DFDCD2',
        '--iv-plate-top': '#F0EEE6',
        '--iv-plate-mid': '#E0DDD3',
        '--iv-plate-low': '#CFCCC1',
        '--iv-cue-top': 'rgba(238,237,231,0)',
        '--iv-cue-mid': 'rgba(238,237,231,0.88)',
        '--iv-cue-low': 'rgba(236,235,229,0.97)',
        '--iv-band': 'rgba(247,246,241,0.96)',
        '--iv-clock': 'rgba(255,255,255,0.78)',
        '--iv-shadow': 'rgba(28,30,36,0.18)',
        '--iv-sheen': 'rgba(255,255,255,0.9)',
        '--iv-fade': 'rgba(238,237,231,0)',
        '--iv-bg': 'radial-gradient(50vmax 50vmax at -6% -12%, rgba(150,185,235,0.12), transparent 66%), '
          + 'radial-gradient(46vmax 46vmax at 106% -8%, rgba(225,180,200,0.09), transparent 64%), '
          + 'radial-gradient(48vmax 48vmax at 32% 112%, rgba(160,205,175,0.09), transparent 66%), '
          + 'linear-gradient(180deg, #EEEDE7 0%, #F2F1EB 100%)',
        '--iv-glow-jade': 'rgba(63,125,100,0.18)',
        '--iv-glow-cobalt': 'rgba(59,110,165,0.20)',
        '--iv-accent': '#3B6EA5',
        '--iv-accent-wash': 'rgba(59,110,165,0.10)',
        '--iv-ring': 'rgba(59,110,165,0.30)',
        '--iv-dot': 'rgba(28,31,36,0.11)',
        '--iv-tone-faint-text': '#82888F',
        '--iv-tone-faint-edge': 'rgba(20,23,28,0.14)',
        '--iv-tone-faint-wash': 'rgba(20,23,28,0.045)',
        '--iv-tone-amber-text': '#8C6A2B',
        '--iv-tone-amber-edge': 'rgba(140,106,43,0.30)',
        '--iv-tone-amber-wash': 'rgba(140,106,43,0.08)',
        '--iv-tone-jade-text': '#3F7D64',
        '--iv-tone-jade-edge': 'rgba(63,125,100,0.30)',
        '--iv-tone-jade-wash': 'rgba(63,125,100,0.08)',
        '--iv-tone-tally-text': '#C24A34',
        '--iv-tone-tally-edge': 'rgba(194,74,52,0.40)',
        '--iv-tone-tally-wash': 'rgba(194,74,52,0.10)',
        '--iv-tone-tally-glow': 'rgba(194,74,52,0.35)',
      },
    }
    /** 主题在 localStorage 里的键。存的是用户的**选择**，不是系统设置。 */
    const THEME_KEY = 'dsh-realtime-interview.theme'

    /** 「跟随 DSH 主题」开关的键。开了之后 THEME_KEY 就不再生效。 */
    const THEME_FOLLOW_KEY = 'dsh-realtime-interview.themeFollow'

    /**
     * 读用户上次选的主题。
     *
     * **读不到就用亮色。** 亮色是这一版的主形态：白面 + 灰缝 + 暖影，
     * 层次比暗色更容易读出来；暗色留给喜欢在夜里用的人。
     * localStorage 不可用（隐私模式）时也不能报错，所以整段都包起来。
     */
    function readTheme() {
      try {
        const stored = window.localStorage.getItem(THEME_KEY)
        if (stored === 'light' || stored === 'dark') return stored
      } catch {
        // 读不到就用默认。
      }
      return 'light'
    }

    /** 记住用户选的主题。存不进去也不该拦住切换。 */
    function saveTheme(theme) {
      try {
        window.localStorage.setItem(THEME_KEY, theme)
      } catch {
        // 存不下就算了，这次切换照样生效。
      }
    }

    /** 是否跟随 DSH 主题（默认关：插件有自己的两套配色，不跟宿主抢）。 */
    function readThemeFollow() {
      try {
        return window.localStorage.getItem(THEME_FOLLOW_KEY) === '1'
      } catch {
        return false
      }
    }

    /** 记住「跟随 DSH 主题」的选择。 */
    function saveThemeFollow(follow) {
      try {
        window.localStorage.setItem(THEME_FOLLOW_KEY, follow ? '1' : '0')
      } catch {
        // 存不下就算了，这次切换照样生效。
      }
    }

    /**
     * 宿主现在是亮还是暗。
     *
     * **读的是 `:root` 的 `color-scheme`。** DSH 的主题层在根节点上写
     * `color-scheme: light|dark`（装机包里读实：`@deepseek-ai/dsh-client-ui-theme`
     * 的两套 boot 样式就是这么写的），并且同时把 `body` 底色一起换掉。
     * 所以：先读 `color-scheme`，读不到再按 `body` 底色亮度猜，最后才退回
     * `prefers-color-scheme`——三层兜底，任何一层成都能回答。
     *
     * @returns {'light'|'dark'|undefined}
     */
    function hostColorScheme() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
      try {
        const root = document.documentElement
        const declared = window.getComputedStyle?.(root)?.colorScheme
        if (declared === 'light' || declared === 'dark') return declared
        if (typeof declared === 'string' && declared.includes('dark')) return 'dark'
        if (typeof declared === 'string' && declared.includes('light')) return 'light'
        // 底色亮度：宿主可能只用 CSS 变量换底，不写 color-scheme。
        const probe = document.body ?? root
        const background = window.getComputedStyle?.(probe)?.backgroundColor ?? ''
        const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(background)
        if (rgb !== null) {
          const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          return luminance > 0.5 ? 'light' : 'dark'
        }
      } catch {
        // 读不到就走下面的系统偏好。
      }
      try {
        return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true ? 'dark' : 'light'
      } catch {
        return undefined
      }
    }

    /**
     * 盯着宿主主题的变化。
     *
     * **为什么不用定时器。** 每秒读一次 `getComputedStyle` 会逼浏览器做样式
     * 重算，而「空闲时不得重渲染 / 不得掉帧」是这个插件的红线。宿主换主题
     * 的方式只有两种：改根节点的行内样式，或者换 `<head>` 里的样式表——
     * 两件事都能被 `MutationObserver` 抓到，成本几乎为零。
     *
     * @param {(scheme: 'light'|'dark') => void} onChange
     * @returns {() => void} 停止观察
     */
    function watchHostScheme(onChange) {
      if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
      let frame = 0
      let last
      const read = () => {
        const next = hostColorScheme()
        if (next === undefined || next === last) return
        last = next
        onChange(next)
      }
      read()
      const schedule = () => {
        if (frame !== 0) return
        if (typeof window.requestAnimationFrame === 'function') {
          frame = window.requestAnimationFrame(() => { frame = 0; read() })
        } else {
          frame = window.setTimeout(() => { frame = 0; read() }, 120)
        }
      }
      const disposers = []
      try {
        const media = window.matchMedia?.('(prefers-color-scheme: dark)')
        if (media !== undefined && typeof media.addEventListener === 'function') {
          media.addEventListener('change', schedule)
          disposers.push(() => media.removeEventListener('change', schedule))
        }
      } catch {
        // 有的 WebView 没有 matchMedia：那就只靠 MutationObserver。
      }
      try {
        const Observer = window.MutationObserver
        if (typeof Observer === 'function') {
          const observer = new Observer(schedule)
          observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style', 'class', 'data-theme'],
          })
          if (document.head !== null && document.head !== undefined) {
            observer.observe(document.head, { childList: true, subtree: true, characterData: true })
          }
          disposers.push(() => observer.disconnect())
        }
      } catch {
        // 观察不了就只在挂载时读一次。
      }
      return () => {
        if (frame !== 0) {
          if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
          else window.clearTimeout(frame)
          frame = 0
        }
        for (const dispose of disposers) dispose()
      }
    }

    /**
     * 三层表面。
     *
     * **为什么做成函数而不是每处手写 boxShadow。** 上一版每张卡片自己拼
     * `0 18px 44px -34px` 这种值，于是页面上有七八种投影——「明明每个都
     * 有阴影，却看起来全都浮在同一个平面上」就是这么来的。收成三档之后，
     * 亮暗两套主题各自定义一次，全部跟着变。
     *
     * 每一档的 boxShadow 里都已经带了**顶边高光 + 底边暗线 + 接触影 + 环境影**，
     * 所以调用方不要再自己加描边或投影，否则层次会被盖掉。
     */
    function surfaceStyle(tone) {
      const raised = tone === 'raised'
      const stage = tone === 'stage'
      return {
        background: stage ? C.surface3 : raised ? C.surface2 : C.surface1,
        border: `1px solid ${stage ? C.ruleSoft : C.rule}`,
        borderRadius: stage ? RADIUS.xl : RADIUS.lg,
        boxShadow: stage ? C.elev3 : raised ? C.elev2 : C.elev1,
      }
    }

    const S = {
      page: {
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
        // 背景是 **中性底 + 极淡环境光**（见 THEME_CSS 的 ::before 漂移层 + .iv-grid 点阵）。
        backgroundImage: 'var(--iv-bg)', backgroundColor: C.ink900,
        color: C.bone, fontFamily: F.ui, fontSize: TYPE.body.fontSize, lineHeight: TYPE.body.lineHeight,
        WebkitFontSmoothing: 'antialiased', position: 'relative', overflow: 'clip',
        fontVariantNumeric: 'tabular-nums',
      },
      /** `S.space(4)` → 16px；阶梯之外的中间值一律不许出现。 */
      space: step => SPACE[step] ?? step,
      radius: RADIUS,
      type: TYPE,
      font: F,
      surface: surfaceStyle,

      head: {
        display: 'flex', alignItems: 'center', gap: 20, padding: '16px 28px 13px',
        flex: '0 0 auto', position: 'relative', zIndex: 3,
        // **页头是磨砂的**：内容从它下面滚过去时，能看见"层"。
        background: C.glass,
        backdropFilter: 'blur(14px) saturate(1.15)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
        borderBottom: `1px solid ${C.ruleSoft}`,
        boxShadow: `0 1px 0 ${C.hiSoft} inset, 0 10px 30px -24px ${C.shadow}`,
      },
      title: { fontFamily: F.display, ...TYPE.display },
      sub: { ...TYPE.sub, color: C.boneFaint, marginTop: 4, letterSpacing: '0.03em' },
      workspace: {
        fontFamily: F.mono, ...TYPE.nano, color: C.boneFaint,
        letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
      // 页签：**凹槽 + 浮起的滑块**。凹与凸同框，是物理感的来源。
      tabs: {
        display: 'flex', gap: 2, marginLeft: 'auto', padding: 4,
        background: C.well, borderRadius: RADIUS.md,
        border: `1px solid ${C.ruleSoft}`, boxShadow: C.inset,
      },
      tab: (active) => ({
        padding: '6px 16px', borderRadius: RADIUS.sm, cursor: 'pointer', fontSize: TYPE.body.fontSize,
        background: active ? C.surface2 : 'transparent',
        color: active ? C.bone : C.boneDim,
        fontWeight: active ? 600 : 400,
        border: `1px solid ${active ? C.rule : 'transparent'}`,
        boxShadow: active ? C.elev1 : 'none',
        transition: 'background 180ms var(--iv-ease), color 180ms var(--iv-ease), box-shadow 180ms var(--iv-ease)',
        fontFamily: F.ui, letterSpacing: '0.02em', whiteSpace: 'nowrap',
      }),
      body: {
        flex: '1 1 auto', minHeight: 0, display: 'flex',
        // **显式取消层叠上下文（保护旧样式）。**
        // 页签槽/主区曾经被一条 `[data-iv-page] > * { z-index: 1 }` 统一抬过，
        // 于是主区自成层叠上下文，`fixed` 弹窗只能在里面比大小，顶部被页头切掉。
        // 规则已经删了，但「已经插进文档的旧 <style>」在热更新/复用页面里可能还活着；
        // 内联的 `z-index: auto` 优先级更高，能从根上把这层上下文拆掉。
        position: 'relative', zIndex: 'auto',
      },
      // 左栏是**凹进去的侧槽**：右边的内阴影让它读成"面板比里面低一层"。
      rail: {
        width: 244, flex: '0 0 244px',
        overflowY: 'auto', padding: '16px 12px',
        background: C.surface3,
        boxShadow: `inset -1px 0 0 ${C.ruleSoft}, inset -18px 0 24px -24px ${C.shadow}`,
      },
      main: { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: '18px 28px 48px' },

      card: {
        ...surfaceStyle('plain'),
        padding: '20px 22px',
        marginBottom: 16,
        transition: 'border-color 220ms var(--iv-ease), box-shadow 220ms var(--iv-ease)',
      },
      panel: { ...surfaceStyle('raised'), padding: '16px 18px' },
      stageFrame: { ...surfaceStyle('stage') },
      cardHead: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, minWidth: 0 },
      eyebrow: {
        fontFamily: F.mono, ...TYPE.meta, color: C.boneFaint, flex: '0 0 auto',
      },
      cardTitle: { fontFamily: F.display, ...TYPE.title, letterSpacing: '0.012em', minWidth: 0 },
      hint: { ...TYPE.sub, color: C.boneFaint },
      /** 一条宁静的提示行——每屏最多两条，且必须说「出路」或「来源」。 */
      quiet: {
        ...TYPE.sub, color: C.boneFaint, display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 0',
      },
      label: { ...TYPE.meta, color: C.boneFaint, marginBottom: 8, display: 'block' },
      // 输入框是**挖进台面的槽**（凹面 + 内阴影），聚焦时槽里亮起一圈光。
      input: {
        width: '100%', boxSizing: 'border-box', background: C.well, color: C.bone,
        border: `1px solid ${C.ruleSoft}`, borderRadius: RADIUS.md, padding: '9px 12px', fontSize: TYPE.body.fontSize,
        fontFamily: F.ui, outline: 'none', lineHeight: 1.5, boxShadow: C.inset,
        transition: 'border-color 180ms var(--iv-ease), box-shadow 180ms var(--iv-ease), background 180ms var(--iv-ease)',
      },
      textarea: {
        width: '100%', boxSizing: 'border-box', background: C.well, color: C.bone,
        border: `1px solid ${C.ruleSoft}`, borderRadius: RADIUS.md, padding: '13px 14px', fontSize: TYPE.body.fontSize,
        fontFamily: F.ui, outline: 'none', minHeight: 132, resize: 'vertical', lineHeight: 1.8,
        boxShadow: C.inset,
        transition: 'border-color 180ms var(--iv-ease), box-shadow 180ms var(--iv-ease)',
      },
      btn: (kind, disabled) => {
        // **长写边框，不用 `border` 简写。** React 在「上一次渲染是简写、
        // 这一次是 borderColor」时会报一条 style 冲突警告，而「React 警告 0 条」
        // 是这一版的闸门。所以统一成 width/style/color 三件套。
        const base = {
          padding: '8px 15px', borderRadius: RADIUS.md, fontSize: TYPE.body.fontSize,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: F.ui, letterSpacing: '0.02em', lineHeight: 1.5,
          transition: 'background 180ms var(--iv-ease), border-color 180ms var(--iv-ease), '
            + 'color 180ms var(--iv-ease), transform 220ms var(--iv-ease), opacity 180ms var(--iv-ease), box-shadow 180ms var(--iv-ease)',
          borderWidth: 1, borderStyle: 'solid', borderColor: C.rule,
          display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
        }
        if (kind === 'primary') {
          // **一枚按在台面上的键**：上亮下暗的实体面 + 接触影 + 环境影。
          // 主色仍是高对比中性色（不是绿）——绿按钮会让整页退回"后台"。
          return {
            ...base,
            background: `linear-gradient(180deg, ${C.primaryTop} 0%, ${C.primaryBottom} 100%)`,
            color: C.primaryText, borderColor: C.primaryBottom, fontWeight: 600,
            opacity: disabled ? 0.45 : 1,
            boxShadow: C.primaryShadow,
          }
        }
        if (kind === 'tally') {
          return {
            ...base,
            background: `linear-gradient(180deg, ${TONES.tally.wash} 0%, color-mix(in srgb, ${TONES.tally.wash} 40%, transparent) 100%)`,
            color: C.tally, borderColor: TONES.tally.edge,
            opacity: disabled ? 0.45 : 1,
            boxShadow: `inset 0 1px 0 ${C.hiSoft}, 0 1px 2px ${C.shadow}`,
          }
        }
        // 次级按钮：平时是**一道细缝里的浅浮雕**，悬停才浮起来（见 THEME_CSS）。
        return {
          ...base, background: 'transparent', color: C.boneDim, opacity: disabled ? 0.45 : 1,
          boxShadow: `inset 0 1px 0 ${C.hiSoft}`,
        }
      },
      row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
      mono: { fontFamily: F.mono },
      pill: (tone) => {
        const colors = TONES[tone] ?? TONES.faint
        return {
          fontFamily: F.mono, fontSize: TYPE.nano.fontSize, padding: '2px 9px', borderRadius: RADIUS.pill,
          border: `1px solid ${colors.edge}`, color: colors.text, background: colors.wash, whiteSpace: 'nowrap',
          letterSpacing: '0.1em', alignSelf: 'flex-start', lineHeight: 1.7, textTransform: 'uppercase',
          boxShadow: `inset 0 1px 0 ${C.hiSoft}`,
        }
      },
      overlay: {
        position: 'fixed', inset: 0, zIndex: 120,
        // 遮罩要**真的压暗**背景：一层浓色 + 一层模糊，弹窗才浮得起来。
        background: 'color-mix(in srgb, var(--iv-ink900) 72%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'ivFade 160ms var(--iv-ease) both',
        backdropFilter: 'blur(9px) saturate(0.9)',
      },
      modal: {
        width: 'min(460px, 100%)', ...surfaceStyle('stage'),
        padding: '22px 24px',
        boxShadow: C.elev4,
        animation: 'ivRise 220ms var(--iv-ease) both',
      },
    }

    /**
     * 全局样式：只在插件页面里生效（都挂在 `[data-iv-page]` 下）。
     *
     * **"灵"从哪来：** 不是更多颜色，而是极淡的环境光在缓慢漂移、
     * 内容入场有位移、悬停有反馈、点阵给出纵深、三层表面给出层次。
     */
    const THEME_CSS = `
      [data-iv-page] {
        --iv-ease: cubic-bezier(.2,.8,.2,1);
        --iv-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
      }
      [data-iv-page] * { box-sizing: border-box; }
      /* 背景氛围层：三团极淡的光斑，42s 缓慢漂移。 */
      [data-iv-page]::before {
        content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
        background-size: 165% 165%; background-position: 12% 0%;
        background:
          radial-gradient(40% 40% at 18% 12%, color-mix(in srgb, var(--iv-accent) 10%, transparent), transparent 70%),
          radial-gradient(36% 36% at 88% 18%, color-mix(in srgb, var(--iv-tone-tally-text) 5%, transparent), transparent 70%),
          radial-gradient(42% 42% at 42% 96%, color-mix(in srgb, var(--iv-tone-jade-text) 6%, transparent), transparent 70%);
        filter: blur(10px);
        animation: ivDrift 46s ease-in-out infinite alternate;
      }
      /* **不要给每个直接子节点 z-index。**
         给了 z-index: 1，主区就变成了一个层叠上下文；弹窗是 fixed + z-index 120，
         但它只会在这个上下文里比大小——于是整块弹窗永远压在页头（z-index: 3）
         下面，顶部标题与按钮被页头切掉。去掉 z-index 后，主区不再自成层叠上下文，
         弹窗才真的浮在页头之上（页头自己的 z-index 写在 S.head 里）。 */
      [data-iv-page] > * { position: relative; }
      @keyframes ivDrift {
        from { background-position: 6% 0%; }
        to { background-position: 94% 100%; }
      }

      /* ── 点阵：科技感来自仪表，不是网格线 ───────────────────────────────
         24px 的点阵，只在页面上半部隐约可见（径向遮罩淡出）。
         它给出纵深与"这块屏是仪表"的暗示，但永远不会抢文字的注意力。 */
      [data-iv-page] .iv-grid {
        position: absolute; inset: 0; z-index: 0; pointer-events: none;
        background-image: radial-gradient(circle, var(--iv-dot) 1px, transparent 1.1px);
        background-size: 24px 24px; background-position: 0 0;
        -webkit-mask-image: radial-gradient(120% 88% at 50% 0%, #000 0%, transparent 72%);
        mask-image: radial-gradient(120% 88% at 50% 0%, #000 0%, transparent 72%);
        opacity: .9;
      }
      /* 噪点：胶片颗粒。铺在表面之上的极薄一层，只为了让"平色块"
         有一点点物理质感——看不出颗粒，只觉得不那么塑料。 */
      [data-iv-page] .iv-grain::after {
        content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        background-image: var(--iv-grain); background-size: 180px 180px;
        opacity: .06; mix-blend-mode: overlay;
      }

      /* 暗角：屏幕四角收一点光。它让整块面板读成「一台设备」而不是
         「一张铺开的纸」——但浓度必须低到说不出它在哪儿。 */
      [data-iv-page]::after {
        content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
        background: var(--iv-vignette);
      }

      /* ── 三层表面 ───────────────────────────────────────────────────── */
      [data-iv-page] .iv-s1 { background: var(--iv-surface-1); border: 1px solid var(--iv-rule); box-shadow: var(--iv-elev-1); }
      [data-iv-page] .iv-s2 { background: var(--iv-surface-2); border: 1px solid var(--iv-rule-soft); box-shadow: var(--iv-elev-2); }
      [data-iv-page] .iv-s3 { background: var(--iv-surface-3); border: 1px solid var(--iv-rule-soft); box-shadow: var(--iv-elev-3); }

      /* ── 凹面：输入框 / 页签槽 / 电平表底 ───────────────────────────── */
      [data-iv-page] .iv-well {
        background: var(--iv-well); box-shadow: var(--iv-inset);
        border: 1px solid var(--iv-rule-soft); border-radius: 14px;
      }
      /* 凹槽里的内容（电平柱、进度）不要自己再带阴影。 */
      [data-iv-page] .iv-well > * { position: relative; }

      /* ── 动效 ───────────────────────────────────────────────────────── */
      /* 入场用 backwards 而不是 both：动画结束后不保留样式，
         否则 keyframe 里的 "transform: none" 会把悬停的位移压掉。 */
      [data-iv-page] .iv-enter { animation: ivRise 320ms var(--iv-ease) backwards; animation-delay: calc(var(--iv-i, 0) * 40ms); }
      /* 可点/可关注的卡片：悬停抬一档（elev-1 → elev-2），跟手。 */
      [data-iv-page] .iv-lift { transition: box-shadow 240ms var(--iv-ease), transform 240ms var(--iv-ease), border-color 240ms var(--iv-ease); }
      [data-iv-page] .iv-lift:hover { box-shadow: var(--iv-elev-2); transform: translateY(-1px); border-color: var(--iv-rule); }
      [data-iv-page] button { transition: background 160ms var(--iv-ease), border-color 160ms var(--iv-ease), color 160ms var(--iv-ease), transform 200ms var(--iv-ease), opacity 160ms var(--iv-ease), box-shadow 200ms var(--iv-ease); }
      /* 悬停抬 1px；按下**陷下去**（内阴影），这才是实体键的手感。 */
      [data-iv-page] button:hover { transform: translateY(-1px); }
      [data-iv-page] button:active {
        transform: translateY(0) scale(0.99);
        box-shadow: inset 0 2px 5px rgba(0,0,0,0.35) !important;
      }
      [data-iv-page] button:disabled { transform: none; }
      [data-iv-page] button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--iv-ring) !important; }
      [data-iv-page] .iv-ghost { opacity: 0; transition: opacity 160ms var(--iv-ease); }
      [data-iv-page] .iv-row:hover .iv-ghost, [data-iv-page] .iv-ghost:focus-visible { opacity: 1; }
      /* 聚焦：槽里的内阴影**保留**，外面再套一圈光。只剩光圈会把"凹"丢掉。 */
      [data-iv-page] input:focus, [data-iv-page] textarea:focus, [data-iv-page] select:focus {
        border-color: var(--iv-accent) !important;
        box-shadow: var(--iv-inset), 0 0 0 3px var(--iv-ring) !important;
      }
      [data-iv-page] ::selection { background: var(--iv-accent-wash); }
      [data-iv-page] ::-webkit-scrollbar { width: 10px; height: 10px; }
      [data-iv-page] ::-webkit-scrollbar-track { background: transparent; }
      [data-iv-page] ::-webkit-scrollbar-thumb { background: var(--iv-rule); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
      [data-iv-page] ::-webkit-scrollbar-thumb:hover { background: var(--iv-bone-faint); background-clip: content-box; }

      /* ── 仪表语言 ───────────────────────────────────────────────────── */
      /* 等宽数字：计时、计数、字数对齐着看。 */
      [data-iv-page] .iv-nums { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
      /* 细分隔线：中间亮、两头淡——像一条被光扫过的缝，不是一条实线。 */
      [data-iv-page] .iv-hairline {
        height: 1px; width: 100%;
        background: linear-gradient(90deg, transparent, var(--iv-rule) 18%, var(--iv-rule) 82%, transparent);
      }
      /* 眉标前的一颗小灯：让「01 / 02」这种序号看起来像刻度而不是文字。 */
      [data-iv-page] .iv-tick::before {
        content: ''; display: inline-block; width: 4px; height: 4px; border-radius: 1px;
        background: currentColor; opacity: .55; margin-right: 8px; vertical-align: 2px;
      }

      /* 舞台：内阴影 + 右上角一点冷光，让"空画面"也有纵深。 */
      [data-iv-page] [data-iv-stage]::after {
        content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        box-shadow: inset 0 0 90px 24px color-mix(in srgb, var(--iv-stage) 70%, transparent);
        background: radial-gradient(70% 55% at 78% -8%, color-mix(in srgb, var(--iv-accent) 9%, transparent), transparent 62%);
      }
      /* 舞台是这一页最高的东西：一级专门的 elevation + 一圈内倒角。 */
      [data-iv-page] [data-iv-stage] {
        box-shadow: var(--iv-elev-stage), inset 0 0 0 1px color-mix(in srgb, var(--iv-bone) 8%, transparent) !important;
      }
      /* 未接通板：极淡的点阵，给"场"而不是"一块黑"。 */
      [data-iv-page] [data-iv-plate]::before {
        content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5;
        background-image: radial-gradient(circle, color-mix(in srgb, var(--iv-bone) 10%, transparent) 1px, transparent 1.2px);
        background-size: 26px 26px;
      }
      /* 呼吸：未接通时的环、REC 灯。6s，慢到不惹眼。 */
      @keyframes ivBreathe { 0%, 100% { opacity: .45 } 50% { opacity: .85 } }
      [data-iv-page] .iv-breathe { animation: ivBreathe 6s ease-in-out infinite; }

      @keyframes ivFade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes ivRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
      /* 提醒条：从页头下缘**落**下来（不是撑开一条），退场只做淡出。 */
      @keyframes ivToastIn {
        from { opacity: 0; transform: translateY(-10px) scale(0.985); }
        to { opacity: 1; transform: none; }
      }
      @keyframes ivShimmer { to { background-position: -220% 0; } }
      .iv-shimmer {
        background: linear-gradient(100deg, var(--iv-bone-faint) 30%, var(--iv-bone) 50%, var(--iv-bone-faint) 70%);
        background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
        animation: ivShimmer 1.6s linear infinite;
      }
      /* 等助手返回：一圈很淡的旋转环。只在真有等待时出现，**不是装饰**。 */
      @keyframes ivSpin { to { transform: rotate(360deg); } }
      [data-iv-page] .iv-spin { animation: ivSpin 1.1s linear infinite; }
      @media (prefers-reduced-motion: reduce) {
        [data-iv-page] *, [data-iv-page] *::before, [data-iv-page] *::after {
          animation-duration: 0.001ms !important; transition-duration: 0.001ms !important;
        }
      }
    `

    /** 把全局样式插进文档一次（重复调用无副作用）。 */
    function injectThemeCss() {
      try {
        if (typeof document === 'undefined') return
        const existing = document.getElementById('dsh-iv-style')
        if (existing !== null) {
          // **内容不同就更新。** 插件被热替换/重挂时，旧的 <style> 还在文档里；
          // 只按 id 判断「已注入」会让旧规则一直生效——弹窗被页头切掉的问题
          // 就可能是这样"修了但没生效"的。
          if (existing.textContent !== THEME_CSS) existing.textContent = THEME_CSS
          return
        }
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
     * 新建一场面试时的**占位元信息**。
     *
     * 必须与 Host 的 `defaultIdentity()` 保持一致：`新建公司 2026-11-17`
     * 这类值不是真名字，而是「还没填」。列表分组、简历入库命名、
     * 行的第二行小字都当它没有——不然「新建公司」会变成一个组名。
     */
    const STUB_COMPANY = /^新建公司 \d{4}-\d{2}-\d{2}$/
    const STUB_POSITION = /^新建岗位 \d{4}-\d{2}-\d{2}$/
    const STUB_TITLE = /^(?:面试 \d{4}-\d{2}-\d{2}|新建公司 \d{4}-\d{2}-\d{2} · 新建岗位 \d{4}-\d{2}-\d{2})$/

    function isPlaceholderCompany(value) {
      return STUB_COMPANY.test(String(value ?? '').trim())
    }

    function isPlaceholderPosition(value) {
      return STUB_POSITION.test(String(value ?? '').trim())
    }

    function isPlaceholderTitle(value) {
      return STUB_TITLE.test(String(value ?? '').trim())
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
    /** `assets/avatar/<id>/` —— 包里放几份形象，这里就能取几份。 */
    const AVATAR_ROOT_URL = AVATAR_ASSET_PATH + 'avatar/'
    /** 默认那份（设置里没选、或选中的那份读不到时用它兜底）。 */
    const AVATAR_DEFAULT_ID = 'interviewer'

    /** 一份形象的资源地址。id 来自 Host 的清单，这里只拼路径。 */
    function avatarBaseUrl(avatarId) {
      return AVATAR_ROOT_URL + encodeURIComponent(avatarId) + '/'
    }

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

    /**
     * 读一份形象的绑定与清单。
     *
     * 两份 JSON 一起取：少一份就是这份形象没装好，直接抛错让上层回落默认那份。
     *
     * @param {string} avatarId
     * @returns {Promise<{root: string, rig: object, manifest: object}>}
     */
    async function loadAvatarFiles(avatarId) {
      const root = avatarBaseUrl(avatarId)
      const [rig, manifest] = await Promise.all([
        fetchAvatarJson(root + 'rig.json'),
        fetchAvatarJson(root + 'avatar.json'),
      ])
      return { root, rig, manifest }
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
     * @param {string} [props.avatarId] `assets/avatar/<id>/` 的目录名（Host 解析过）
     * @param {boolean} [props.speaking] 播报**音频**正在播（`tts.speaking`）
     * @param {() => number} [props.readLevel] 读当前播报音量 0..1（**非响应式**）
     * @param {boolean} [props.enabled]
     */
    function useAvatar({ phase, avatarId = AVATAR_DEFAULT_ID, speaking = false, readLevel, enabled = true }) {
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
            // **选中的那份读不到就回落默认那份**（不是回落到「没有脸」）：
            // 包升级把某份形象删掉、或手改了设置里的 id，都不该让舞台空掉。
            const wanted = typeof avatarId === 'string' && avatarId !== '' ? avatarId : AVATAR_DEFAULT_ID
            let loaded
            try {
              loaded = await loadAvatarFiles(wanted)
            } catch (error) {
              if (wanted === AVATAR_DEFAULT_ID) throw error
              loaded = await loadAvatarFiles(AVATAR_DEFAULT_ID)
            }
            if (disposed) return
            avatar = await runtime.createMeshAvatar(canvas, {
              rig: loaded.rig,
              assetsBase: loaded.root + 'built/',
              // manual：本模块自己推进时间（不再有内置 idle/眨眼/表情叠层）。
              // 代价是眨眼与视线必须自己算 —— avatarPose 就是干这个的。
              manual: true,
              padTop: loaded.rig?.view?.padTop,
              padSide: loaded.rig?.view?.padSide,
            })
            if (disposed) {
              try { avatar.destroy() } catch { /* 已经没了 */ }
              avatar = undefined
              return
            }
            // 内置的自动表演全关：表演层只有一处（avatarPose）。
            avatar.setAutoIdle(false)
            avatar.setAutoMotion(false)
            if (loaded.manifest?.lipSync !== undefined) avatar.setLipSync(loaded.manifest.lipSync)
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
      }, [enabled, avatarId])

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
     * @param {string} [props.avatarId]
     * @param {boolean} props.speaking
     * @param {() => number} props.readLevel
     */
    function AvatarPiP(props) {
      const { canvasRef, state } = useAvatar({
        phase: props.phase,
        avatarId: props.avatarId,
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

    // ── small components ──────────────────────────────────────────────────
    //
    // 这一层是**共享语言的实现**（docs/DESIGN.md §7）。视图里不许再手写
    // 阴影、描边、字号、圆角——它们都在这里与 30-theme.js 里各定义一次。
    //
    // 纪律：
    //   1. 已有组件的**签名不许改**（并行开发时别人在按签名调用）；
    //   2. 数组 children 的每个元素都要 key（React 警告必须是 0）；
    //   3. 任何组件都不许在渲染期碰 document / window（SSR 探针会跑它）。

    /**
     * 三层表面之一。`tone` 决定它是纸面卡片、浮起面板、还是舞台。
     *
     * @param {{tone?: 'plain'|'raised'|'stage', pad?: number, style?: object, className?: string, children?: any}} props
     */
    function Panel(props) {
      const pad = props.pad === undefined ? 20 : props.pad
      return h('div', {
        className: `iv-s${props.tone === 'raised' ? '2' : props.tone === 'stage' ? '3' : '1'} iv-grain${props.className === undefined ? '' : ` ${props.className}`}`,
        style: {
          borderRadius: props.tone === 'stage' ? RADIUS.xl : RADIUS.lg,
          padding: pad,
          ...(props.style ?? {}),
        },
      }, props.children)
    }

    /**
     * 一行宁静的提示。
     *
     * **不是警告框，也不是说明段落。** 它只承担两件事：说清现在的**来源**，
     * 或说清**失败之后能做什么**（AGENTS.md §7）。每屏最多两条——
     * 想写第三段解释的时候，那条解释应该去 `Hint` 里，或者干脆删掉。
     *
     * @param {{tone?: 'muted'|'warn'|'ok', title?: string, style?: object, children?: any}} props
     */
    function Quiet(props) {
      const color = props.tone === 'warn' ? C.amber : props.tone === 'ok' ? C.jade : C.boneFaint
      return h('div', {
        title: props.title,
        style: { ...S.quiet, color, ...(props.style ?? {}) },
      }, props.children)
    }

    /**
     * 等宽小标签：眉标、计数、单位、时间。
     *
     * 仪表语言的基本单位——`meta` 档字号 + 字距 + 大写字形，
     * 让「5/14」「REC」「D:\…」在同一条视线里对齐。
     */
    function Meta(props) {
      const color = props.tone === 'amber' ? C.amber
        : props.tone === 'jade' ? C.jade
          : props.tone === 'tally' ? C.tally
            : props.tone === 'bone' ? C.boneDim
              : C.boneFaint
      return h('span', {
        title: props.title,
        className: 'iv-nums',
        style: {
          fontFamily: F.mono, ...TYPE.meta, letterSpacing: '0.14em',
          color, whiteSpace: 'nowrap', ...(props.style ?? {}),
        },
      }, props.children)
    }

    /** 圆角状态胶囊。`style` 只用来覆盖个别例外（例如品牌名不该被转成大写）。 */
    function Pill(props) {
      return h('span', { style: { ...S.pill(props.tone), ...(props.style ?? {}) } }, props.children)
    }

    /**
     * 「等助手返回」的状态行：转圈 / 失败 + 出路。
     *
     * **它是 loading 的唯一表现，而且必须有终点。** Host 的 `agentTasks`
     * 给出 `waiting` 或 `failed`：waiting 转圈；failed 立刻停转、说明原因、
     * 给「重试」与「忽略」。组件自己**不维护计时，也不自己决定何时结束**——
     * 靠客户端猜「应该还在跑」，就是假活空转的来源。
     */
    function AgentTaskRow(props) {
      const { task, waitingLabel, retryLabel, onRetry, onDismiss, style } = props
      if (task === undefined || task === null) return null
      const waiting = task.status !== 'failed'
      const reason = waiting ? (waitingLabel ?? '助手正在处理…') : (task.reason ?? '没有等到结果')
      const hint = waiting ? '' : (task.hint ?? '')
      return h('div', {
        role: 'status',
        'aria-live': 'polite',
        style: {
          display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap',
          marginTop: 10, padding: waiting ? '2px 0' : '9px 12px', borderRadius: RADIUS.sm,
          ...(waiting ? {} : { border: `1px solid ${TONES.amber.edge}`, background: TONES.amber.wash }),
          ...(style ?? {}),
        },
      }, [
        h('span', {
          key: 'dot',
          'aria-hidden': true,
          className: waiting ? 'iv-spin' : undefined,
          style: {
            width: 11, height: 11, marginTop: 4, flex: '0 0 auto', borderRadius: '50%',
            borderWidth: 1.5, borderStyle: 'solid',
            borderColor: waiting ? C.rule : TONES.amber.edge,
            borderTopColor: waiting ? C.accent : C.amber,
            background: waiting ? 'transparent' : C.amber,
          },
        }),
        h('div', { key: 'text', style: { flex: '1 1 200px', minWidth: 0, ...TYPE.sub, lineHeight: 1.6 } }, [
          h('div', { key: 'r', style: { color: waiting ? C.boneDim : C.amber } }, reason),
          hint === '' ? null : h('div', { key: 'h', style: { color: C.boneFaint, marginTop: 2 } }, hint),
        ]),
        waiting || typeof onRetry !== 'function'
          ? null
          : h('button', {
            key: 'retry',
            style: { ...S.btn(false, false), flex: '0 0 auto' },
            onClick: onRetry,
          }, retryLabel ?? '重试'),
        waiting || typeof onDismiss !== 'function'
          ? null
          : h('button', {
            key: 'dismiss',
            style: { ...S.btn(false, false), flex: '0 0 auto' },
            title: '清掉这条提示；助手那边照常跑',
            onClick: onDismiss,
          }, '忽略'),
      ])
    }

    /**
     * 图标按钮：行内动作，默认低调。
     *
     * `ghost` 为 true 时默认透明，悬停才显形（左栏的归档/删除用它）——
     * 一排文字按钮常驻会把「面试场次」变成一张表格。
     */
    function IconBtn(props) {
      const disabled = props.disabled === true
      const tone = props.tone
      const color = disabled ? C.boneFaint
        : tone === 'tally' ? C.tally
          : tone === 'amber' ? C.amber
            : C.boneDim
      return h('button', {
        type: 'button',
        title: props.title ?? props.label,
        'aria-label': props.label,
        disabled,
        className: props.ghost === true ? 'iv-ghost' : undefined,
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: props.wide === true ? '6px 12px' : '6px',
          minWidth: props.wide === true ? undefined : 28, minHeight: 28,
          // 长写边框：调用方常常只覆盖 borderColor，简写+长写混用会被 React 警告。
          borderRadius: RADIUS.sm, borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
          background: 'transparent',
          color, cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: F.ui, fontSize: TYPE.sub.fontSize, lineHeight: 1,
          ...(props.style ?? {}),
        },
        onClick: disabled ? undefined : props.onClick,
      }, props.children)
    }

    /** 标量读数：值 + 单位 + 标签。等宽数字，右对齐着看。 */
    function Stat(props) {
      const color = props.tone === 'amber' ? C.amber : props.tone === 'jade' ? C.jade : props.tone === 'tally' ? C.tally : C.bone
      return h('div', {
        style: {
          ...S.surface('raised'), borderRadius: RADIUS.md, padding: '10px 13px',
          minWidth: 0, flex: '1 1 0',
        },
      }, [
        h('div', {
          key: 'v',
          className: 'iv-nums',
          style: { fontFamily: F.mono, fontSize: 18, lineHeight: 1.25, color, letterSpacing: '0.02em' },
        }, [
          String(props.value ?? ''),
          props.unit === undefined
            ? null
            : h('span', { key: 'u', style: { fontSize: TYPE.meta.fontSize, color: C.boneFaint, marginLeft: 3 } }, props.unit),
        ]),
        h('div', { key: 'l', style: { ...TYPE.meta, fontFamily: F.mono, color: C.boneFaint, marginTop: 4, letterSpacing: '0.1em' } }, props.label),
      ])
    }

    /**
     * 空状态：**一句话 + 一个动作**。
     *
     * 不写说明书。空简历卡片不该解释「简历可以存进库重复使用」，
     * 只需要「还没有简历」和那个能点的地方。
     */
    function Empty(props) {
      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: '26px 18px', borderRadius: RADIUS.md,
          border: `1px dashed ${C.rule}`, background: 'transparent', textAlign: 'center',
        },
      }, [
        props.icon === undefined ? null : h('div', {
          key: 'i',
          style: { color: C.boneFaint, opacity: 0.7, lineHeight: 0 },
        }, props.icon),
        h('div', { key: 't', style: { ...TYPE.sub, color: C.boneDim } }, props.title),
        props.action === undefined ? null : h('div', { key: 'a' }, props.action),
      ])
    }

    /**
     * 同时只允许一个「？」弹层活着。
     *
     * 上一版每个 `Hint` 各开各的：面试中右栏那四个状态 Pill 可以同时展开、
     * 互相盖住，不手动再点一次就永远挂在页面上。
     * 现在开一个就把别的关掉，并且点空白处 / Esc / 滚动都会收起。
     */
    const HINT_CLOSERS = new Set()
    function closeOtherHints(keep) {
      for (const close of [...HINT_CLOSERS]) {
        if (close !== keep) close()
      }
    }

    /**
     * 悬停/点击展开的说明层。
     *
     * **它是"设计说明书"的收容所。** 那些必须存在、但不该占常驻版面的
     * 解释（凭据从哪来、设备是谁挡的、模型下载到哪儿了）都进这里。
     *
     * 位置有三种，按容器形状选：
     *   · 默认 `align="left"`：弹层挂在触发点**左缘**；
     *   · `align="right"`：挂在**右缘**，适合右栏与卡片右侧；
     *   · `inline`：撑开一行，永远不会被裁掉，代价是会把后面的内容推下去。
     *
     * **非 inline 的弹层用 `position: fixed` + 打开时量一次坐标。**
     * 它经常活在 `overflow: auto/hidden` 的容器里（右栏、滚动的弹层层），
     * 绝对定位会被容器边缘裁掉——上一版「面试中」右栏的？弹层就是这样
     * 被截断的。fixed 不受容器裁剪；空间不够时自动翻到触发点上方。
     */
    function Hint(props) {
      const [open, setOpen] = useState(false)
      // 量出来的坐标只在客户端算；SSR 与首帧没有它，所以先不渲染弹层。
      const [spot, setSpot] = useState(undefined)
      const rootRef = useRef(null)
      const inline = props.inline === true
      const align = props.align === 'right' ? 'right' : 'left'
      const maxWidth = props.maxWidth ?? 300

      // 注册进「全局只留一个」的名单；卸载时退订。
      useEffect(() => {
        const close = () => setOpen(false)
        HINT_CLOSERS.add(close)
        return () => { HINT_CLOSERS.delete(close) }
      }, [])

      // 展开后：点别处、Esc、滚动/改窗口大小都收起。
      // 用 mousedown 而不是 click：触发按钮自己的 click 在 mousedown 之后，
      // 若在 mousedown 关掉，紧接着的 click 又把同一个打开——会闪一下。
      useEffect(() => {
        if (!open || inline) return undefined
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
        const onDown = event => {
          const root = rootRef.current
          if (root !== null && event.target instanceof Node && root.contains(event.target)) return
          setOpen(false)
        }
        const onKey = event => { if (event.key === 'Escape') setOpen(false) }
        // 页面/容器滚动时收起（弹层是 fixed 的，不跟着滚，留着会脱位）。
        // 但弹层**自己**在滚时不算——长文案要能在弹层里滚着读。
        const onMove = event => {
          const root = rootRef.current
          if (root !== null && event.target instanceof Node && root.contains(event.target)) return
          setOpen(false)
        }
        if (typeof document.addEventListener === 'function') {
          document.addEventListener('mousedown', onDown, true)
          document.addEventListener('keydown', onKey)
        }
        if (typeof window.addEventListener === 'function') {
          window.addEventListener('scroll', onMove, true)
          window.addEventListener('resize', onMove)
        }
        return () => {
          if (typeof document.removeEventListener === 'function') {
            document.removeEventListener('mousedown', onDown, true)
            document.removeEventListener('keydown', onKey)
          }
          if (typeof window.removeEventListener === 'function') {
            window.removeEventListener('scroll', onMove, true)
            window.removeEventListener('resize', onMove)
          }
        }
      }, [open, inline])

      /** 打开：先量触发点的位置，再关掉别人。 */
      const openAt = () => {
        const root = rootRef.current
        if (root !== null && typeof window !== 'undefined' && typeof window.innerWidth === 'number') {
          const rect = root.getBoundingClientRect()
          const width = Math.min(maxWidth, Math.max(200, window.innerWidth - 16))
          let left = align === 'right' ? rect.right - width : rect.left
          left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8))
          // 下面放不下就翻到触发点上方（用 bottom 定位，不用 transform——
          // 入场动画也要用 transform，两者会打架）。
          const below = window.innerHeight - rect.bottom
          const flip = below < 200 && rect.top > below
          setSpot(flip
            ? { position: 'fixed', left, width, bottom: window.innerHeight - rect.top + 6 }
            : { position: 'fixed', left, width, top: rect.bottom + 6 })
        }
        closeOtherHints()
        setOpen(value => !value)
      }

      const toggle = () => {
        if (open) { setOpen(false); return }
        openAt()
      }

      return h('span', {
        ref: rootRef,
        style: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 },
      }, [
        h('span', { key: 'label', style: { minWidth: 0 } }, props.label),
        h('button', {
          key: 'toggle',
          type: 'button',
          'aria-expanded': open,
          'aria-haspopup': inline ? undefined : 'dialog',
          title: props.title ?? '说明',
          style: {
            flex: '0 0 auto', width: 16, height: 16, borderRadius: RADIUS.pill, cursor: 'pointer',
            border: `1px solid ${C.rule}`, background: open ? C.ink700 : 'transparent',
            color: open ? C.bone : C.boneFaint, fontFamily: F.mono, fontSize: 9.5, lineHeight: 1,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          },
          onClick: toggle,
        }, '?'),
        open
          ? h('div', {
            key: 'body',
            role: inline ? undefined : 'dialog',
            style: {
              ...(inline
                ? {
                  flexBasis: '100%', width: '100%', marginTop: 6,
                  ...S.surface('stage'), padding: '10px 12px',
                  boxShadow: C.elev4,
                  ...TYPE.sub, color: C.boneDim, lineHeight: 1.7,
                  animation: 'ivRise 180ms var(--iv-ease) both',
                }
                : {
                  ...(spot ?? {}),
                  // 高到放不下时在弹层内部滚，而不是超出屏幕。
                  maxHeight: 'min(320px, calc(100vh - 24px))', overflowY: 'auto',
                  zIndex: 140,
                  ...S.surface('stage'), padding: '10px 12px',
                  // 弹层是**飘在一切之上**的：用最高一级 elevation。
                  boxShadow: C.elev4,
                  ...TYPE.sub, color: C.boneDim, lineHeight: 1.7,
                  animation: 'ivFade 140ms var(--iv-ease) backwards',
                }),
            },
          }, props.children)
          : null,
      ])
    }

    /**
     * A section with an eyebrow number, a serif title, and a right-hand slot.
     *
     * The eyebrow is a **step number** (01 / 02 / 03) — the preparation flow
     * really is a sequence (简历 → JD → 底稿), so numbering carries meaning
     * here rather than decorating.
     *
     * `index` 只影响入场错峰（`--iv-i`），不影响布局。
     */
    function Section(props) {
      return h('div', {
        className: 'iv-enter iv-lift',
        style: { ...S.card, ...(props.style ?? {}), ['--iv-i']: props.index ?? 0 },
      }, [
        h('div', { key: 'k1', style: S.cardHead }, [
          props.step !== undefined
            ? h('span', {
              key: 'step',
              className: 'iv-nums',
              style: { ...S.eyebrow, color: C.amber, paddingRight: 2, letterSpacing: '0.18em' },
            }, props.step)
            : null,
          h('span', { key: 'title', style: S.cardTitle }, props.title),
          props.extra !== undefined ? h('div', { key: 'extra', style: { marginLeft: 'auto', minWidth: 0 } }, props.extra) : null,
        ]),
        props.children,
      ])
    }

    /** A text field. */
    function Field(props) {
      return h('div', { style: { marginBottom: 10, minWidth: 0 } }, [
        h('label', { key: 'l', style: S.label }, props.label),
        h('input', {
          key: 'i',
          style: S.input,
          value: props.value ?? '',
          placeholder: props.placeholder,
          type: props.type ?? 'text',
          autoComplete: props.autoComplete ?? 'off',
          spellCheck: false,
          onChange: event => props.onChange(event.target.value),
        }),
      ])
    }

    /** A textarea. */
    function Area(props) {
      return h('div', { style: { marginBottom: 10, minWidth: 0 } }, [
        h('label', { key: 'l', style: S.label }, props.label),
        h('textarea', {
          key: 't',
          style: props.style === undefined ? S.textarea : { ...S.textarea, ...props.style },
          value: props.value ?? '',
          placeholder: props.placeholder,
          spellCheck: false,
          onChange: event => props.onChange(event.target.value),
          onKeyDown: props.onKeyDown,
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
          type: 'button',
          style: {
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            background: 'transparent', border: 'none', padding: '2px 0 10px',
            cursor: 'pointer', color: C.bone, fontFamily: F.ui, fontSize: TYPE.body.fontSize, textAlign: 'left',
          },
          onClick: () => setOpen(value => !value),
        }, [
          h('span', {
            key: 'chevron',
            style: {
              display: 'inline-block', width: 0, height: 0, flex: '0 0 auto',
              borderLeft: '4.5px solid transparent', borderRight: '4.5px solid transparent',
              borderTop: `5.5px solid ${C.boneFaint}`,
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 160ms var(--iv-ease)',
            },
          }),
          h('span', {
            key: 'label',
            style: { flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
          }, props.summary),
          props.badge !== undefined ? h(Meta, { key: 'badge' }, props.badge) : null,
        ]),
        open
          ? h('div', { key: 'body', style: { borderTop: `1px solid ${C.ruleSoft}`, paddingTop: 12 } }, props.children)
          : null,
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
          padding: '9px 0', borderBottom: `1px solid ${C.ruleSoft}`,
        },
      }, [
        h(Pill, { key: 'lvl', tone: levelTone }, levelText),
        h('div', { key: 'body', style: { flex: '1 1 auto', minWidth: 0 } }, [
          h('div', {
            key: 'topic',
            style: {
              fontSize: TYPE.body.fontSize, lineHeight: 1.6,
              color: item.probed === true ? C.boneFaint : C.bone,
              textDecoration: item.probed === true ? 'line-through' : 'none',
            },
          }, item.topic),
          item.why !== undefined && item.why !== ''
            ? h('div', { key: 'why', style: { ...TYPE.sub, color: C.boneFaint, marginTop: 3 } }, item.why)
            : null,
        ]),
        h(Meta, { key: 'state', tone: item.probed === true ? 'jade' : undefined },
          item.probed === true ? '已问' : '待问'),
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
          fontFamily: F.mono, ...TYPE.meta, letterSpacing: '0.16em',
          color: on ? C.tally : C.boneFaint,
        },
      }, [
        h('span', {
          key: 'lamp',
          className: on ? 'iv-breathe' : undefined,
          style: {
            width: 7, height: 7, borderRadius: RADIUS.pill, display: 'block',
            background: on ? C.tally : 'transparent',
            border: `1px solid ${on ? C.tally : C.boneFaint}`,
            boxShadow: on ? `0 0 0 3px ${TONES.tally.wash}, 0 0 14px ${TONES.tally.glow}` : 'none',
            transition: 'box-shadow 200ms var(--iv-ease)',
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
          padding: '5px 11px', borderRadius: RADIUS.sm, background: C.clock,
          border: `1px solid ${C.rule}`, backdropFilter: 'blur(10px) saturate(1.2)',
          // 压在画面上的徽标要**浮**在画面之上：内高光 + 一层短影。
          boxShadow: `inset 0 1px 0 ${C.hiSoft}, 0 1px 3px rgba(0,0,0,0.45), 0 8px 20px -14px ${C.shadow}`,
        },
      }, [
        h(Meta, { key: 't', tone: 'bone', style: { letterSpacing: '0.08em', fontSize: 12 } },
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
      // 电平表装在**凹槽**里：真调音台的表头是嵌进面板的，不是浮在上面。
      return h('div', {
        style: {
          display: 'flex', gap: 2, alignItems: 'flex-end',
          padding: '4px 7px', borderRadius: 7,
          background: C.well, boxShadow: C.inset,
          border: `1px solid ${C.ruleSoft}`,
        },
      },
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
              // 亮起的段自带一点自己的光——LED 是发光的，不是涂色的。
              boxShadow: on ? `0 0 6px ${color}` : 'none',
              transition: 'background 80ms linear, box-shadow 80ms linear',
            },
          })
        })
        .concat([
          h('span', {
            key: 'peak',
            style: {
              marginLeft: 6, fontFamily: F.mono, ...TYPE.nano,
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
          style: { margin: '6px 0 14px', paddingLeft: 20, lineHeight: 1.85 },
        }, listItems.map((item, index) => h('li', {
          key: `li${index}`,
          style: { fontSize: TYPE.body.fontSize, color: C.boneDim, marginBottom: 4 },
        }, inline(item)))))
        listItems = []
      }
      for (const line of blocks) {
        const trimmed = line.trim()
        // **列表项的折行。** 简历里一条 bullet 经常被手工折成两行
        // （第二行缩进两个空格）。不接上的话，它会被渲染成一段独立的
        // 段落，读起来像"这条 bullet 后面跟了一句无关的话"。
        if (listItems.length > 0 && /^\s{2,}\S/.test(line)) {
          listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${trimmed}`
          continue
        }
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
              display: 'flex', gap: 14, padding: '8px 0',
              borderBottom: `1px solid ${C.ruleSoft}`, fontSize: TYPE.sub.fontSize,
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
          const size = [21, 17.5, 15.5, 14][heading[1].length - 1]
          rendered.push(h('div', {
            key: `h${rendered.length}`,
            style: {
              fontFamily: F.display, fontSize: size, fontWeight: 600,
              marginTop: heading[1].length === 1 ? 8 : 22, marginBottom: 9, color: C.bone,
              letterSpacing: '0.012em', lineHeight: 1.35,
              paddingBottom: heading[1].length <= 2 ? 8 : 0,
              borderBottom: heading[1].length <= 2 ? `1px solid ${C.ruleSoft}` : 'none',
            },
          }, inline(heading[2])))
          continue
        }
        if (trimmed.startsWith('> ')) {
          rendered.push(h('div', {
            key: `q${rendered.length}`,
            style: {
              borderLeft: `2px solid ${C.amber}`, paddingLeft: 14, margin: '12px 0',
              color: C.boneDim, fontFamily: F.display, fontSize: 14.5, lineHeight: 1.75,
            },
          }, inline(trimmed.slice(2))))
          continue
        }
        rendered.push(h('div', {
          key: `p${rendered.length}`,
          style: { fontSize: TYPE.body.fontSize, color: C.boneDim, lineHeight: 1.85, marginBottom: 11 },
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
            style: {
              ...S.mono, background: C.field, padding: '2px 6px', borderRadius: 5,
              fontSize: TYPE.sub.fontSize, color: C.amber, border: `1px solid ${C.ruleSoft}`,
            },
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
     * @param {{key: string, label: string, value: string|number, unit?: string, tone?: string}} row
     */
    function statTile(row) {
      return h(Stat, { key: row.key, value: row.value, unit: row.unit, label: row.label, tone: row.tone })
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
            style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: TYPE.sub.fontSize, color: C.boneDim, cursor: 'pointer' },
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

    /** 简历库里的一行用的是「几月几日」这种短日期，不写年份。 */
    function shortDate(value) {
      if (typeof value !== 'number' || value <= 0) return ''
      const date = new Date(value)
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }

    /**
     * A preview of archived material, styled as a sheet of paper.
     *
     * 归档之后**要看得见**。一个只显示「已归档 4820 字」的空卡片，
     * 等于让人不知道到底存了些什么——那正是准备阶段最需要的信息。
     *
     * 纸面按 **md 渲染**（跟放大后的预览同一套），不再是一段等宽原文：
     * 简历与 JD 本来就都是 markdown，渲染出来才读得进去。
     */
    function PaperPreview(props) {
      const text = String(props.text ?? '')
      const limit = 460
      const excerpt = text.length > limit ? `${text.slice(0, limit)}…` : text
      const clipped = text.length > limit
      const open = props.onOpen
      return h('div', {
        onClick: open,
        onKeyDown: open === undefined
          ? undefined
          : event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            open()
          },
        role: open === undefined ? undefined : 'button',
        tabIndex: open === undefined ? undefined : 0,
        title: open === undefined ? undefined : '放大预览（可编辑）',
        'aria-label': open === undefined ? undefined : '放大预览（可编辑）',
        className: open === undefined ? undefined : 'iv-hover',
        style: {
          position: 'relative',
          background: C.field,
          border: `1px solid ${C.ruleSoft}`,
          borderRadius: RADIUS.sm,
          padding: '14px 16px',
          minHeight: 74,
          cursor: open === undefined ? undefined : 'zoom-in',
          // 卷内材料是**一张摞在桌面上的纸**：顶边一线高光 + 一层贴合的影。
          // 只有底色的话，它和卡片是同一种"平"。
          boxShadow: `inset 0 1px 0 ${C.hiSoft}, 0 1px 2px ${C.shadow}, 0 10px 22px -20px ${C.shadow}`,
        },
      }, [
        h('div', {
          key: 't',
          style: {
            maxHeight: clipped ? 188 : undefined, overflow: 'hidden',
            // 卷内材料是**纸**：正文用衬线，跟报告页同一种阅读感。
            fontFamily: F.display,
            // md 渲染器自己带排版；这里只收一下边距，让纸面看起来是一整张。
            marginBottom: clipped ? 0 : -2,
          },
        }, h(Markdown, { text: excerpt === '' ? '（空）' : excerpt })),
        clipped
          ? h('div', {
            key: 'f',
            style: {
              position: 'absolute', left: 1, right: 1, bottom: 1, height: 40, pointerEvents: 'none',
              background: 'linear-gradient(180deg, ' + C.fade + ' 0%, ' + C.field + ' 92%)',
            },
          })
          : null,
        // 可以点开：右上角一枚极小的「放大」记号。不写字（版面文案纪律），
        // 但让"这张纸可以点"这件事在视觉上说得出口。
        open === undefined
          ? null
          : h('span', {
            key: 'zoom',
            'aria-hidden': true,
            style: {
              position: 'absolute', right: 9, top: 9,
              width: 20, height: 20, borderRadius: RADIUS.pill,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: C.glass, border: `1px solid ${C.ruleSoft}`,
              color: C.boneFaint, fontSize: 11, lineHeight: 1, pointerEvents: 'none',
            },
          }, '⤢'),
      ])
    }

    /**
     * 放大后的材料窗口：**预览 / 编辑两种模式，编辑内容受保护**。
     *
     * **为什么编辑只在放大的窗口里做。** 卡片是「总览」的尺寸，不是
     * 「写作」的尺寸——在 200px 高的框里改一份几千字的简历，光标都看不全。
     * 所以卡片上的【放大】【修改】都去掉了：点纸面就是放大，放大之后
     * 默认是渲染过的预览（md），切到编辑才是**保真源码**。
     *
     * **哪些操作会被拦住。** 有未保存改动时，点遮罩 / Esc / 关闭都不会关窗，
     * 而是浮出一条黄色警告，并给一个「放弃修改」的出路——「关不掉」
     * 不能变成「没有出路」（AGENTS.md §7）。
     *
     * 保存的分流在窗口里完成（不叠第二层弹窗）：
     *   简历 → 先问「覆盖原简历 / 存为新简历」，后者接着问名字；
     *   JD   → 直接保存，一个职位一份 JD，没有第二个容器。
     *
     * @param {{
     *   kind: 'resume'|'jd', title: string, text: string,
     *   initialMode?: 'preview'|'edit', linked?: boolean, suggestedTitle?: string,
     *   onSave: (text: string, choice?: 'overwrite'|'new', name?: string) => Promise<boolean>,
     *   onClose: () => void,
     * }} props
     */
    function MaterialDialog(props) {
      const { kind, title, text, linked, suggestedTitle, onClose, onSave, onUpload } = props
      const [mode, setMode] = useState(props.initialMode === 'edit' ? 'edit' : 'preview')
      // 上传/粘贴进来的文字先落在草稿里；**没保存就不属于任何文件**。
      const [draft, setDraft] = useState(props.initialText !== undefined ? props.initialText : text)
      const [busy, setBusy] = useState(false)
      // undefined → choice → name。只在「简历保存」时走到 choice/name。
      const [saveStep, setSaveStep] = useState(undefined)
      const [name, setName] = useState(suggestedTitle ?? '')
      // 警告时窗口自己镶一圈琥珀色，让"没关掉"有可见的因果。
      const [warned, setWarned] = useState(false)
      const warnTimer = useRef(undefined)
      const dirty = draft !== text

      useEffect(() => () => {
        if (warnTimer.current !== undefined) clearTimeout(warnTimer.current)
      }, [])

      /** 关不掉的唯一原因是有未保存的改动；给警告，也给「放弃修改」。 */
      const warnUnsaved = () => {
        setWarned(true)
        if (warnTimer.current !== undefined) clearTimeout(warnTimer.current)
        warnTimer.current = setTimeout(() => setWarned(false), 2600)
      }

      // Esc 与「关闭」走同一条判定。用 ref 拿最新的 dirty/saveStep，
      // 这样监听器只挂一次，不会因为每次输入都重挂。
      const latest = useRef({ dirty, saveStep })
      latest.current = { dirty, saveStep }
      const requestClose = () => {
        if (latest.current.saveStep !== undefined) { setSaveStep(undefined); return }
        if (latest.current.dirty) { warnUnsaved(); return }
        onClose()
      }
      const requestCloseRef = useRef(requestClose)
      requestCloseRef.current = requestClose
      useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const handler = event => {
          if (event.key === 'Escape') requestCloseRef.current()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
      }, [])

      const commit = async (choice, resumeName) => {
        setBusy(true)
        try {
          const ok = await onSave(draft, choice, resumeName)
          if (ok === false) return
          setSaveStep(undefined)
          setMode('preview')
        } finally {
          setBusy(false)
        }
      }

      // 编辑模式下**有改动才有【保存】**：没改就不该有一个按钮等着被误点。
      const startSave = () => {
        if (!dirty || busy) return
        if (kind === 'resume') { setSaveStep('choice'); return }
        void commit()
      }

      const modeChip = (key, label) => h('button', {
        key,
        type: 'button',
        'aria-pressed': mode === key,
        style: {
          padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
          borderWidth: 1, borderStyle: 'solid',
          borderColor: mode === key ? C.rule : 'transparent',
          background: mode === key ? C.surface2 : 'transparent',
          color: mode === key ? C.bone : C.boneFaint,
          fontFamily: F.ui, fontSize: TYPE.sub.fontSize, lineHeight: 1.7,
          boxShadow: mode === key ? C.elev1 : 'none',
        },
        onClick: () => setMode(key),
      }, label)

      const strip = (key, children, tone) => h('div', {
        key,
        style: {
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '9px 12px', borderRadius: RADIUS.sm,
          background: tone === 'warn' ? TONES.amber.wash : C.surface2,
          borderWidth: 1, borderStyle: 'solid',
          borderColor: tone === 'warn' ? TONES.amber.edge : C.ruleSoft,
          animation: 'ivRise 160ms var(--iv-ease) backwards',
        },
      }, children)

      const warnStrip = warned
        ? strip('warned', [
          h('span', {
            key: 't',
            style: { ...TYPE.sub, color: C.amber, fontWeight: 600, flex: '1 1 auto', minWidth: 0 },
          }, '请先保存变更内容后再关闭！'),
          h('button', {
            key: 'x',
            type: 'button',
            style: S.btn(false, false),
            title: '丢掉这次编辑，关闭窗口',
            onClick: onClose,
          }, '放弃修改'),
        ], 'warn')
        : null

      // 简历的保存分流要**看这一场现在有没有简历**：
      //   · 还没有（初次上传 / 粘贴）→ 先引导入库并命名，但也留「只存这场」；
      //   · 已有、且来自简历库 → 覆盖原简历 / 存为新简历；
      //   · 已有、但不来自库 → 保存到这场 / 存为新简历。
      const firstSave = kind === 'resume' && text.trim() === ''
      const primaryLabel = kind !== 'resume'
        ? '保存'
        : linked === true ? '覆盖原简历' : firstSave ? '存入简历库…' : '保存到这场'
      const primaryRun = () => {
        if (kind !== 'resume') { void commit(); return }
        if (linked === true || !firstSave) { void commit('overwrite'); return }
        setSaveStep('name')
      }
      const secondaryLabel = kind !== 'resume'
        ? ''
        : (linked === true || !firstSave) ? '存为新简历' : '只存到这场'
      const secondaryRun = () => {
        if (linked === true || !firstSave) { setSaveStep('name'); return }
        void commit('overwrite')
      }

      const askStrip = saveStep === 'choice'
        ? strip('ask', [
          h('span', {
            key: 'q',
            style: { ...TYPE.sub, color: C.bone, flex: '0 0 auto' },
          }, kind === 'resume' ? '这一版存到哪？' : '保存这一版？'),
          h('button', {
            key: 'ow',
            type: 'button',
            style: S.btn('primary', busy),
            title: kind === 'resume'
              ? (linked === true
                ? '写进这一场，同时更新简历库里那一份'
                : firstSave ? '先起个名字存进简历库，再写进这一场' : '只写进这一场面试')
              : undefined,
            onClick: primaryRun,
          }, primaryLabel),
          secondaryLabel === ''
            ? null
            : h('button', {
              key: 'nw',
              type: 'button',
              style: S.btn(false, busy),
              onClick: secondaryRun,
            }, secondaryLabel),
          h('button', {
            key: 'cx',
            type: 'button',
            style: S.btn(false, busy),
            onClick: () => setSaveStep(undefined),
          }, '取消'),
        ], 'warn')
        : null

      const nameStrip = saveStep === 'name'
        ? strip('name', [
          h('label', {
            key: 'l',
            style: { ...TYPE.meta, color: C.boneFaint, flex: '0 0 auto', letterSpacing: '0.1em' },
          }, '简历名称'),
          h('input', {
            key: 'i',
            type: 'text',
            autoComplete: 'off',
            spellCheck: false,
            // 自动聚焦：这是用户点「存为新简历」之后唯一该做的事。
            autoFocus: true,
            placeholder: '公司 · 岗位',
            value: name,
            style: { ...S.input, flex: '1 1 220px', minWidth: 0, width: 'auto' },
            onChange: event => setName(event.target.value),
            onKeyDown: event => {
              if (event.key !== 'Enter' || name.trim() === '' || busy) return
              void commit('new', name.trim())
            },
          }),
          h('button', {
            key: 'ok',
            type: 'button',
            style: S.btn('primary', busy || name.trim() === ''),
            onClick: () => { void commit('new', name.trim()) },
          }, busy ? '保存中…' : '保存'),
          h('button', {
            key: 'bk',
            type: 'button',
            style: S.btn(false, busy),
            onClick: () => setSaveStep('choice'),
          }, '返回'),
        ])
        : null

      const body = mode === 'edit'
        ? h('textarea', {
          key: 'src',
          value: draft,
          spellCheck: false,
          autoFocus: props.initialMode === 'edit',
          onChange: event => setDraft(event.target.value),
          style: {
            ...S.textarea,
            flex: '1 1 auto', minHeight: 0, resize: 'none',
            fontFamily: F.mono, lineHeight: 1.8, padding: '16px 18px',
            whiteSpace: 'pre-wrap',
          },
        })
        : h('div', {
          key: 'paper',
          style: {
            flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
            background: C.field, border: `1px solid ${C.ruleSoft}`,
            borderRadius: RADIUS.md, padding: '22px 26px',
          },
        }, draft.trim() === ''
          ? h(Quiet, null, '（空）')
          : h(Markdown, { text: draft }))

      return h('div', {
        style: S.overlay,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        onClick: event => { if (event.target === event.currentTarget) requestClose() },
      }, [
        h('div', {
          key: 'card',
          style: {
            ...S.modal,
            // **撑满可用高度。** 放大窗口不是一个小弹层：它是阅读/编辑一整份
            // 简历或 JD 的地方。给 `maxHeight` 而不给 `height` 时，卡片只会
            // 长到内容那么高——编辑模式里就是"缩成一小坨"。窗口够大，就用。
            width: 'min(1080px, 100%)',
            height: 'min(88vh, 940px)',
            maxHeight: 'calc(100vh - 40px)',
            display: 'flex', flexDirection: 'column', gap: 12,
            padding: '18px 20px 20px',
            // 只覆盖 boxShadow，不碰 border（S.modal 用的是 border 简写；
            // 简写 + borderColor 长写混用会被 React 报 style 冲突）。
            boxShadow: warned
              ? `${C.elev4}, 0 0 0 3px ${TONES.amber.wash}`
              : C.elev4,
            transition: 'box-shadow 200ms var(--iv-ease)',
          },
        }, [
          h('div', {
            key: 'h',
            style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 },
          }, [
            h('div', { key: 't', style: { ...S.cardTitle, flex: '0 0 auto' } }, title),
            h(Meta, { key: 'c' }, `${draft.length} 字`),
            dirty ? h(Pill, { key: 'd', tone: 'amber' }, '未保存') : null,
            h('div', {
              key: 'mode',
              style: {
                display: 'flex', gap: 2, padding: 2, marginLeft: 'auto',
                background: C.well, borderRadius: RADIUS.sm,
                border: `1px solid ${C.ruleSoft}`, boxShadow: C.inset,
              },
            }, [
              modeChip('preview', '预览'),
              modeChip('edit', '编辑'),
            ]),
            // 上传也是编辑的一部分：**先读进草稿，保存才写盘。**
            // 这样「换个文件」和「改一段文字」走的是同一条保存路径。
            onUpload === undefined
              ? null
              : h('label', {
                key: 'up',
                title: '用一份文件替换正文（先预览，保存才生效）',
                style: {
                  ...S.btn(false, busy),
                  display: 'inline-flex', cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.45 : 1,
                },
              }, [
                '上传文件',
                h('input', {
                  key: 'i',
                  type: 'file',
                  accept: kind === 'resume'
                    ? '.txt,.md,.json,.docx,.pdf,text/plain,text/markdown'
                    : '.txt,.md,.markdown,text/plain,text/markdown',
                  style: { display: 'none' },
                  onChange: async event => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file === undefined || busy) return
                    setBusy(true)
                    try {
                      const next = await onUpload(file)
                      if (next !== undefined) {
                        setDraft(next)
                        setMode('edit')
                      }
                    } finally {
                      setBusy(false)
                    }
                  },
                }),
              ]),
            mode === 'edit' && dirty && saveStep === undefined
              ? h('button', {
                key: 'save',
                type: 'button',
                style: S.btn('primary', busy),
                onClick: startSave,
              }, busy ? '保存中…' : '保存')
              : null,
            h('button', {
              key: 'close',
              type: 'button',
              style: S.btn(false, false),
              onClick: requestClose,
            }, '关闭'),
          ]),
          askStrip,
          nameStrip,
          warnStrip,
          body,
        ]),
      ])
    }

    /**
     * 给简历起名字的小窗。
     *
     * **为什么非问不可。** 库里躺着一排「简历 2026-11-16」等于没存——
     * 选的时候还是认不出来（AGENTS.md §6.7）。放大窗口里的「存为新简历」
     * 用的是同一种命名输入（就在窗口里），这个弹窗负责「把已经在卷内的
     * 这一份补录进库」。取消不会丢内容：这场面试里的正文早就存好了。
     */
    function NameResumeDialog(props) {
      const [name, setName] = useState(props.defaultTitle ?? '')
      const [busy, setBusy] = useState(false)
      const done = async (value) => {
        if (value === '') return
        setBusy(true)
        try { await props.onSave(value) } finally { setBusy(false) }
      }
      useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const handler = event => { if (event.key === 'Escape') props.onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
      }, [props.onClose])
      return h('div', {
        style: S.overlay,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': '给简历起个名字',
        onClick: event => { if (event.target === event.currentTarget) props.onClose() },
      }, h('div', {
        key: 'card',
        style: {
          ...S.modal, width: 'min(420px, 100%)',
          display: 'flex', flexDirection: 'column', gap: 14,
        },
      }, [
        h('div', { key: 't', style: S.cardTitle }, '简历名称'),
        h('div', {
          key: 'm',
          style: { ...TYPE.sub, color: C.boneFaint, lineHeight: 1.7 },
        }, '以后新建面试直接选它。'),
        h('input', {
          key: 'i',
          type: 'text',
          autoComplete: 'off',
          spellCheck: false,
          autoFocus: true,
          placeholder: '例如：字节跳动 · 高级后端工程师',
          value: name,
          style: S.input,
          onChange: event => setName(event.target.value),
          onKeyDown: event => {
            if (event.key !== 'Enter' || name.trim() === '' || busy) return
            void done(name.trim())
          },
        }),
        h('div', {
          key: 'a',
          style: { display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
        }, [
          h('button', {
            key: 'skip',
            type: 'button',
            style: S.btn(false, busy),
            title: '不存进简历库；这一场面试里的正文已经存好了',
            onClick: () => props.onClose(),
          }, '先不用'),
          h('button', {
            key: 'ok',
            type: 'button',
            style: S.btn('primary', busy || name.trim() === ''),
            onClick: () => { void done(name.trim()) },
          }, busy ? '保存中…' : '存进简历库'),
        ]),
      ]))
    }

    /**
     * 确认弹层：**一次不可撤销的动作**才用它。
     *
     * 文案纪律（§10.0.1）：标题写「做什么」，正文写「后果」，note 写
     * 「还能不能退回」。不放解释设计的句子。
     */
    function ConfirmDialog(props) {
      const { title, body, note, confirmLabel, tone, busy, onConfirm, onCancel } = props
      useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const handler = event => { if (event.key === 'Escape') onCancel() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
      }, [onCancel])
      return h('div', {
        style: S.overlay,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        onClick: event => { if (event.target === event.currentTarget) onCancel() },
      }, h('div', {
        key: 'card',
        style: { ...S.modal, width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 14 },
      }, [
        h('div', { key: 't', style: S.cardTitle }, title),
        body === undefined || body === null
          ? null
          : h('div', {
            key: 'b',
            style: { ...TYPE.sub, color: C.boneDim, lineHeight: 1.8, whiteSpace: 'pre-wrap' },
          }, body),
        note === undefined || note === null ? null : h(Quiet, { key: 'n', tone: 'warn' }, note),
        h('div', {
          key: 'a',
          style: { display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
        }, [
          h('button', { key: 'c', type: 'button', style: S.btn(false, busy), onClick: onCancel }, '取消'),
          h('button', {
            key: 'ok',
            type: 'button',
            style: S.btn(tone === 'tally' ? 'tally' : 'primary', busy),
            onClick: onConfirm,
          }, busy ? '处理中…' : confirmLabel),
        ]),
      ]))
    }

    /**
     * 重置一场面试的记录。
     *
     * **清什么、留什么要当面说清**（AGENTS §6.14）——「重置」听起来像
     * 「重新开始」，但用户最怕的是「我的简历和底稿还在吗」。所以正文
     * 直接列两栏，录音录像做成显式勾选（文件不可恢复，默认留着）。
     */
    function ResetDialog(props) {
      const { row, onCancel, onConfirm } = props
      const [dropRecordings, setDropRecordings] = useState(false)
      const [busy, setBusy] = useState(false)
      const run = async () => {
        setBusy(true)
        try { await onConfirm(dropRecordings) } finally { setBusy(false) }
      }
      useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const handler = event => { if (event.key === 'Escape') onCancel() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
      }, [onCancel])
      return h('div', {
        style: S.overlay,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': '重置这场面试的记录',
        onClick: event => { if (event.target === event.currentTarget) onCancel() },
      }, h('div', {
        key: 'card',
        style: { ...S.modal, width: 'min(520px, 100%)', display: 'flex', flexDirection: 'column', gap: 14 },
      }, [
        h('div', { key: 't', style: S.cardTitle }, '重置这场面试的记录'),
        h('div', {
          key: 'n',
          style: {
            ...TYPE.sub, color: C.boneDim, lineHeight: 1.75, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          },
          title: row?.title ?? '',
        }, row?.title ?? ''),
        h('div', {
          key: 'p',
          style: { display: 'flex', flexDirection: 'column', gap: 10 },
        }, [
          h('div', { key: 'clear', style: { ...TYPE.sub, color: C.boneDim, lineHeight: 1.75 } }, [
            h('div', { key: 'h', style: { color: C.tally, fontWeight: 600, marginBottom: 2 } }, '会被清掉'),
            h('div', { key: 'b' }, '转录与计时、报告、底稿上的「问过」标记与调整记录、等助手的任务。'),
          ]),
          h('div', { key: 'keep', style: { ...TYPE.sub, color: C.boneDim, lineHeight: 1.75 } }, [
            h('div', { key: 'h', style: { color: C.jade, fontWeight: 600, marginBottom: 2 } }, '会留下来'),
            h('div', { key: 'b' }, '简历、JD、考点清单本身，以及标题 / 公司 / 岗位。'),
          ]),
        ]),
        h('label', {
          key: 'rec',
          style: {
            display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
            fontSize: TYPE.sub.fontSize, color: C.boneDim,
          },
        }, [
          h('input', {
            key: 'c',
            type: 'checkbox',
            checked: dropRecordings,
            onChange: event => setDropRecordings(event.target.checked),
            style: { marginTop: 2 },
          }),
          h('span', { key: 's' }, '连录音录像一起删（文件删了找不回来；不勾就留在卷宗目录里）'),
        ]),
        h(Quiet, { key: 'q' }, '助手会话会解绑（新的一轮用新对话）；旧对话仍在 DSH 里，可以自己归档。'),
        h('div', {
          key: 'a',
          style: { display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
        }, [
          h('button', { key: 'c', type: 'button', style: S.btn(false, busy), onClick: onCancel }, '取消'),
          h('button', {
            key: 'ok',
            type: 'button',
            style: S.btn('tally', busy),
            onClick: () => { void run() },
          }, busy ? '重置中…' : '重置'),
        ]),
      ]))
    }

    /**
     * 记录清理：**勾选哪几场就删哪几场**，外加「空场次」的一键收拾。
     *
     * 为什么单独一个弹层，而不是在左栏逐行删：误触新建 / 试跑留下的场次
     * 往往是**一批**。逐行两步确认，十场就是二十次点击，用户会放弃。
     *
     * **数据只在打开时取**（`sessions/records` 要读每场的转录与录音大小）——
     * 它不能进 6 秒轮询。
     */
    function SessionsDialog(props) {
      const { onCancel, onApplied, notify } = props
      const [rows, setRows] = useState([])
      const [empties, setEmpties] = useState([])
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(undefined)
      const [picked, setPicked] = useState({})
      const [armed, setArmed] = useState(false)
      const [busy, setBusy] = useState(false)

      const load = useCallback(async () => {
        setLoading(true)
        try {
          const [records, emptyResult] = await Promise.all([
            apiGet('sessions/records'),
            apiGet('sessions/empty'),
          ])
          setRows(Array.isArray(records?.sessions) ? records.sessions : [])
          setEmpties(Array.isArray(emptyResult?.candidates) ? emptyResult.candidates : [])
          setError(undefined)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => { void load() }, [load])
      useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const handler = event => { if (event.key === 'Escape') onCancel() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
      }, [onCancel])

      // 选中的场次一变，两步确认就作废——否则「上膛」会跨选择生效。
      const ids = Object.keys(picked).filter(id => picked[id] === true)
      useEffect(() => { setArmed(false) }, [ids.length])

      const toggle = id => setPicked(previous => {
        const next = { ...previous }
        if (next[id] === true) delete next[id]
        else next[id] = true
        return next
      })

      const removeSelected = async () => {
        if (ids.length === 0) return
        if (!armed) {
          setArmed(true)
          return
        }
        setBusy(true)
        try {
          const result = await apiPost('sessions/delete-batch', { ids })
          const deleted = Number(result?.deletedCount ?? 0)
          const refused = Array.isArray(result?.refused) ? result.refused : []
          notify(
            deleted > 0 ? `删了 ${deleted} 场` : '一场都没删',
            refused.length > 0
              ? refused.map(item => `${item.id.slice(-6)}：${item.reason}`).join('；')
              : '卷宗目录已从磁盘删除。',
            refused.length > 0 ? 'warn' : 'ok',
          )
          setPicked({})
          setArmed(false)
          await load()
          onApplied?.()
        } catch (failure) {
          notify('没删掉', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }

      const purgeEmpty = async () => {
        setBusy(true)
        try {
          const result = await apiPost('sessions/cleanup', {})
          const removed = Array.isArray(result?.removed) ? result.removed.length : 0
          notify(removed > 0 ? `清掉 ${removed} 场空场次` : '没有空场次', undefined, 'ok')
          await load()
          onApplied?.()
        } catch (failure) {
          notify('没清掉', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }

      const rowNode = row => {
        const on = picked[row.id] === true
        const disabled = row.running === true
        return h('label', {
          key: row.id,
          title: disabled ? '正在进行中：先结束再删（避免把转录删到一半）' : row.title,
          style: {
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
            borderRadius: RADIUS.sm,
            borderBottom: `1px solid ${C.ruleSoft}`,
            background: on ? C.ink750 : 'transparent',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          },
        }, [
          h('input', {
            key: 'c',
            type: 'checkbox',
            checked: on,
            disabled,
            onChange: () => toggle(row.id),
            style: { flex: '0 0 auto' },
          }),
          h('div', { key: 'b', style: { flex: '1 1 auto', minWidth: 0 } }, [
            h('div', {
              key: 't',
              style: {
                ...TYPE.body, color: C.bone,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              },
            }, row.title),
            h('div', { key: 'm', style: { ...S.row, gap: 8, marginTop: 3 } }, [
              h(Meta, { key: 's' }, disabled ? '进行中' : `${row.status ?? 'draft'}`),
              h(Meta, { key: 'd' }, shortDate(row.updatedAt ?? row.createdAt ?? 0)),
              h(Meta, { key: 't' }, `转录 ${row.turns ?? 0} 轮`),
              (row.recordings ?? 0) > 0 ? h(Meta, { key: 'r' }, `录音 ${row.recordings}`) : null,
              h(Meta, { key: 'b' }, formatBytes(row.bytes ?? 0)),
              row.archived === true ? h(Meta, { key: 'a', tone: 'amber' }, '已归档') : null,
            ]),
          ]),
        ])
      }

      return h('div', {
        style: S.overlay,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': '记录清理',
        onClick: event => { if (event.target === event.currentTarget) onCancel() },
      }, h('div', {
        key: 'card',
        style: {
          ...S.modal, width: 'min(620px, 100%)', maxHeight: 'min(78vh, 720px)',
          display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0,
        },
      }, [
        h('div', {
          key: 'h',
          style: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
        }, [
          h('div', { key: 't', style: S.cardTitle }, '记录清理'),
          h(Meta, { key: 'n' }, `${rows.length} 场`),
          empties.length > 0
            ? h('button', {
              key: 'e',
              type: 'button',
              style: { ...S.btn(false, busy), marginLeft: 'auto', padding: '4px 10px' },
              title: '只删没有任何内容的场次',
              onClick: () => { void purgeEmpty() },
            }, `清理 ${empties.length} 场空场次`)
            : null,
        ]),
        error !== undefined
          ? h(Quiet, { key: 'err', tone: 'warn' }, `读不到场次：${error}`)
          : null,
        h('div', {
          key: 'list',
          style: {
            flex: '1 1 auto', minHeight: 120, overflowY: 'auto', overscrollBehavior: 'contain',
            background: C.ink850, border: `1px solid ${C.ruleSoft}`,
            borderRadius: RADIUS.sm, padding: '4px 6px',
          },
        }, loading
          ? [h(Quiet, { key: 'l' }, '正在读场次…')]
          : rows.length === 0
            ? [h(Quiet, { key: 'l' }, '还没有面试场次。')]
            : rows.map(rowNode)),
        h('div', {
          key: 'a',
          style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
        }, [
          h(Meta, { key: 'c' }, ids.length > 0 ? `已选 ${ids.length} 场` : '勾选要删的场次'),
          h('div', { key: 'b', style: { display: 'flex', gap: 8, marginLeft: 'auto' } }, [
            h('button', { key: 'cancel', type: 'button', style: S.btn(false, busy), onClick: onCancel }, '关闭'),
            h('button', {
              key: 'del',
              type: 'button',
              style: S.btn('tally', busy || ids.length === 0),
              onClick: () => { void removeSelected() },
            }, busy ? '处理中…' : armed ? `再点一次确认删 ${ids.length} 场` : '删除选中的'),
          ]),
        ]),
      ]))
    }

    /**
     * The flow spine: where this session sits in the four-step arc.
     *
     * 一场面试要走四步：归档材料 → 底稿调研 → 面试中 → 评估表。
     * 画成一条**细的仪表条**——点 + 连线 + 等宽标签。它一眼回答「卡在哪」，
     * 不占版面，也不解释自己为什么这么画。
     */
    function FlowSpine(props) {
      const steps = [
        { key: 'materials', label: '归档材料' },
        { key: 'research', label: '底稿调研' },
        { key: 'live', label: '面试中' },
        { key: 'review', label: '评估表' },
      ]
      const items = []
      steps.forEach((step, index) => {
        const done = index < props.current
        const current = index === props.current
        items.push(h('div', {
          key: `s${step.key}`,
          style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 0 auto' },
        }, [
          h('span', {
            key: 'dot',
            className: current ? 'iv-breathe' : undefined,
            style: {
              width: 6, height: 6, borderRadius: RADIUS.pill, flex: '0 0 auto',
              background: done ? C.jade : current ? C.amber : 'transparent',
              border: `1px solid ${done ? C.jade : current ? C.amber : C.boneFaint}`,
            },
          }),
          h(Meta, { key: 'l', tone: current ? 'amber' : done ? 'jade' : undefined }, step.label),
        ]))
        if (index < steps.length - 1) {
          items.push(h('span', {
            key: `sep${step.key}`,
            style: {
              height: 1, background: C.ruleSoft,
              flex: '1 1 24px', minWidth: 12, maxWidth: 64, margin: '0 12px',
            },
          }))
        }
      })
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 6,
          marginBottom: 20, padding: '10px 16px',
          ...S.surface('raised'), borderRadius: RADIUS.md,
        },
      }, items)
    }

    /** The preparation view: résumé, JD, and the interviewer's notes. */
    function PrepareView(props) {
      const { session, config, onChanged, notify } = props
      const [resumeText, setResumeText] = useState('')
      const [jdText, setJdText] = useState('')
      const [jdUrl, setJdUrl] = useState('')
      const [busy, setBusy] = useState(false)
      const [jdNote, setJdNote] = useState(undefined)
      // 放大窗口：`{kind, mode}`。所有编辑都在这里面做——卡片上不再有
      // 局促的输入框，也不再【放大】【修改】两个按钮。
      const [docDialog, setDocDialog] = useState(undefined)
      // 简历入库前的命名弹窗（把已经在卷内的一份补录进库时）。
      const [naming, setNaming] = useState(undefined)
      // 重新生成底稿是破坏性操作：第一次点只是"上膛"。
      const [regenArm, setRegenArm] = useState(false)
      // 简历库默认收起：常驻版面只留计数与按钮。
      const [libraryOpen, setLibraryOpen] = useState(false)
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

      // 元信息只认**显式写入**：助手用 `interview_prepare` 写，用户在这三格里写。
      // 占位值（`新建公司 2026-11-17` / `新建岗位 2026-11-17` / 老默认的
      // 「面试 2026-11-17」）等于「还没填」，所以输入框里显示为空——让用户
      // 看到例子，而不是看到一串假的日期名字。
      const identityTouched = useRef(false)
      useEffect(() => { identityTouched.current = false }, [session?.session?.id])
      useEffect(() => {
        const meta = session?.session
        if (meta === undefined) return
        // 用户正在改的时候别覆盖他的输入。
        if (identityTouched.current) return
        const title = String(meta.title ?? '')
        const company = String(meta.company ?? '')
        const position = String(meta.position ?? '')
        setIdentity({
          title: isPlaceholderTitle(title) ? '' : title,
          company: isPlaceholderCompany(company) ? '' : company,
          position: isPlaceholderPosition(position) ? '' : position,
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
      // 「面试 2026-11-16」这种默认标题、或「新建公司 2026-11-17」这种占位
      // 元信息进库等于没存——库里全是这种名字，选的时候还是认不出来。
      const libraryTitle = (() => {
        const rawCompany = (session?.session?.company ?? '').trim()
        const rawPosition = (session?.session?.position ?? '').trim()
        const company = isPlaceholderCompany(rawCompany) ? '' : rawCompany
        const position = isPlaceholderPosition(rawPosition) ? '' : rawPosition
        if (company !== '' && position !== '') return `${company} · ${position}`
        if (position !== '') return position
        if (company !== '') return company
        const title = (session?.session?.title ?? '').trim()
        return isPlaceholderTitle(title) ? '' : title
      })()

      // 存进库时给个**能认出来**的名字；连公司/岗位都还没有时用日期兜底，
      // 至少比空着强（名字输入框里用户随时能改）。
      const resumeNameSuggestion = (() => {
        if (libraryTitle !== '') return libraryTitle
        const now = new Date()
        return `简历 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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

      // 拿到正文就填进编辑器（放大窗口开着的时候，不覆盖正在改的草稿）。
      const docDialogKindRef = useRef(docDialog?.kind)
      docDialogKindRef.current = docDialog?.kind
      useEffect(() => {
        const documents = docsPoll.data
        if (documents === undefined) return
        if (docDialogKindRef.current !== 'resume') setResumeText(documents.resume ?? '')
        if (docDialogKindRef.current !== 'jd') setJdText(documents.jd ?? '')
        setJdUrl(previous => previous === '' ? (documents.jdMeta?.url ?? '') : previous)
      }, [docsPoll.data])

      const applyProfile = useCallback(async profileId => {
        setBusy(true)
        try {
          const result = await apiPost(`profiles/${profileId}/apply`, { sessionId })
          notify(`已继承档案「${result.title}」的 ${result.items} 个考点`, undefined, 'ok')
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
          notify(`已回写档案（${result.items} 个考点）`, undefined, 'ok')
          onChanged()
        } catch (failure) {
          notify('回写失败', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, onChanged, notify])

      /**
       * 放大窗口里的「保存」。
       *
       * JD：一份职位一份 JD，保存就是保存，没有第二个容器。
       *
       * 简历：先问存到哪——
       *   · **覆盖原简历**：写进这一场；如果这份本来来自简历库，库里那一份
       *     也一起更新（否则下次选它还是旧版，用户会以为保存没生效）；
       *   · **存为新简历**：先在库里建一份，再把它用到这一场（快照一起写）。
       *
       * 返回 true = 已保存；false = 没存上（窗口留在编辑态，草稿不丢）。
       */
      const saveDocument = useCallback(async (nextText, choice, resumeName) => {
        if (sessionId === undefined) return false
        setBusy(true)
        try {
          if (docDialog?.kind !== 'resume') {
            await apiPost(`sessions/${sessionId}/jd`, { text: nextText, url: jdUrl })
            setJdText(nextText)
            notify('已保存', undefined, 'ok')
          } else if (choice === 'new') {
            const created = await apiPost('resumes', { text: nextText, title: resumeName })
            const resumeId = created?.resume?.id
            await apiPost(`sessions/${sessionId}/resume`, { text: nextText })
            if (typeof resumeId === 'string' && resumeId !== '') {
              // 关联 + 快照：这一场以后也认得出它来自库里哪一份。
              await apiPost(`resumes/${resumeId}`, { sessionId })
            }
            setResumeText(nextText)
            void resumesPoll.refresh()
            notify('已存进简历库', resumeName, 'ok')
          } else {
            const linked = session?.session?.resumeId
            if (typeof linked === 'string' && linked !== '') {
              // **先更新库，再更新这一场**：库写失败时这一场还没动，重试是安全的。
              await apiPost('resumes', { id: linked, text: nextText })
              void resumesPoll.refresh()
            }
            await apiPost(`sessions/${sessionId}/resume`, { text: nextText })
            setResumeText(nextText)
            notify('已保存', undefined, 'ok')
          }
          onChanged()
          void docsPoll.refresh()
          return true
        } catch (failure) {
          notify(
            docDialog?.kind === 'resume' ? '简历没存上' : 'JD 没存上',
            failure instanceof Error ? failure.message : String(failure),
            'error',
          )
          return false
        } finally {
          setBusy(false)
        }
      }, [sessionId, docDialog, jdUrl, session?.session?.resumeId, onChanged, notify, docsPoll, resumesPoll])

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

      /**
       * 读一份文件，**只把文字拿回来，不落盘**。
       *
       * 上传也是「编辑」的一种：文字先进放大窗口，用户看过、改过、
       * 点【保存】才写进这一场。以前上传即归档，等于替用户做了决定。
       *
       * @returns {Promise<string|undefined>} 读不出来就 undefined（并已提示原因）
       */
      const extractResumeFile = useCallback(async file => {
        setBusy(true)
        try {
          const dataBase64 = await readFileAsBase64(file)
          const result = await apiPost('resume/extract', { filename: file.name, mimeType: file.type, dataBase64 })
          if (result.ok === true) {
            notify(
              `简历读到了 ${result.chars} 字`,
              result.warnings.length > 0 ? result.warnings.join(' ') : undefined,
              result.warnings.length > 0 ? 'warn' : 'ok',
            )
            return result.text
          }
          notify('这份文件读不出文字', result.warnings.join(' '), 'error')
          return undefined
        } catch (failure) {
          notify('上传失败', failure instanceof Error ? failure.message : String(failure), 'error')
          return undefined
        } finally {
          setBusy(false)
        }
      }, [notify])

      const extractJdFile = useCallback(async file => {
        // **JD 只收纯文本。** 简历可以是 docx/pdf（有解析器），JD 没有这个必要：
        // 一份 JD 就是一段可粘贴的文字，支持二进制格式只会带来乱码与状态分裂。
        const lower = String(file.name ?? '').toLowerCase()
        if (!/\.(txt|md|markdown|text)$/.test(lower)) {
          notify('JD 只收纯文本', '请传 .txt 或 .md；其它格式先另存为纯文本，或把正文粘进来。', 'error')
          return undefined
        }
        setBusy(true)
        try {
          const dataBase64 = await readFileAsBase64(file)
          const result = await apiPost('resume/extract', {
            filename: file.name,
            mimeType: file.type,
            dataBase64,
            // 服务端也把一道关：扩展名能改，文件头骗不了人。
            plainOnly: true,
          })
          if (result.ok === true) {
            notify(`JD 读到了 ${result.chars} 字`, undefined, 'ok')
            return result.text
          }
          notify('这份文件读不出文字', result.warnings.join(' '), 'error')
          return undefined
        } catch (failure) {
          notify('上传失败', failure instanceof Error ? failure.message : String(failure), 'error')
          return undefined
        } finally {
          setBusy(false)
        }
      }, [notify])

      /** 空卡片上的「上传文件」：读出来，直接进放大窗口的编辑态。 */
      const uploadResume = useCallback(async event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file === undefined) return
        const text = await extractResumeFile(file)
        if (text !== undefined) setDocDialog({ kind: 'resume', mode: 'edit', initialText: text })
      }, [extractResumeFile])

      const uploadJd = useCallback(async event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file === undefined) return
        const text = await extractJdFile(file)
        if (text !== undefined) setDocDialog({ kind: 'jd', mode: 'edit', initialText: text })
      }, [extractJdFile])

      // ── 简历库 ──────────────────────────────────────────────────────
      //
      // **简历不是每场面试都变的。** 让用户每一场都重新上传同一份简历，
      // 是把「一次录入」变成「N 次录入」。所以简历单独存在工作区里，
      // 每场面试只引用它。
      const applyResume = useCallback(async resumeId => {
        setBusy(true)
        setLibraryOpen(false)
        try {
          const result = await apiPost(`resumes/${resumeId}`, { sessionId })
          const title = result?.resume?.title ?? resumeId
          setResumeText(result?.resume?.text ?? '')
          notify(
            `换上了「${title}」`,
            undefined,
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

      /** 命名之后真正入库：建一份 → 用到这一场（快照一起写）。 */
      const saveNaming = useCallback(async title => {
        const pending = naming
        if (pending === undefined) return
        setBusy(true)
        try {
          const created = await apiPost('resumes', { text: pending.text, title })
          const resumeId = created?.resume?.id
          if (typeof resumeId === 'string' && resumeId !== '') {
            await apiPost(`resumes/${resumeId}`, { sessionId })
          }
          setNaming(undefined)
          notify('存进简历库了', title, 'ok')
          void resumesPoll.refresh()
          onChanged()
          void docsPoll.refresh()
        } catch (failure) {
          notify('没存进去', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [naming, sessionId, notify, resumesPoll, onChanged, docsPoll])

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
      //
      // 三格都原样提交，服务端负责归一化：
      //   - 留空 = 没填 → 写回带日期的占位值（新建公司 / 新建岗位）；
      //   - 标题留空 → 用「公司 · 岗位」拼；
      //   - 用户改过标题 → 保留，不再跟着公司/岗位动。
      const agentInfo = session?.session?.agent
      /**
       * 助手会话芯片：**这场面试的对话在哪**（AGENTS §6.14）。
       *
       * 它必须存在，但不能是常驻说明文字——这里只留一个会话尾号，
       * 完整信息（全 id、建于何时、最近派活、重建过几次）在 `title` 里。
       */
      const agentChip = (agentInfo?.sessionId ?? '') === ''
        ? null
        : h(Meta, {
          key: 'agent',
          title: [
            `助手会话：${agentInfo.sessionId}`,
            agentInfo.createdAt > 0 ? `建于 ${new Date(agentInfo.createdAt).toLocaleString()}` : '',
            agentInfo.lastDispatchAt > 0
              ? `最近派活：${new Date(agentInfo.lastDispatchAt).toLocaleTimeString()}`
              : '还没有派过活',
            agentInfo.rebuilds > 0 ? `中途换过 ${agentInfo.rebuilds} 次会话` : '',
            '拉 JD、出底稿、开场、写报告都在这一个对话里',
          ].filter(part => part !== '').join('\n'),
        }, `助手会话 · ${agentInfo.sessionId.slice(-6)}`)

      const saveIdentity = useCallback(async () => {
        setBusy(true)
        try {
          await apiPost(`sessions/${sessionId}`, {
            title: identity.title.trim(),
            company: identity.company.trim(),
            position: identity.position.trim(),
          })
          identityTouched.current = false
          notify('记下了', undefined, 'ok')
          onChanged()
        } catch (failure) {
          notify('没改成', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, identity, onChanged, notify])

      // ── 让助手去抓 JD ────────────────────────────────────────────────
      //
      // **直连抓网页看着简单，实际最常挂在三件事上：** 登录墙、验证码、
      // 前端渲染的正文。宿主里的助手有浏览器，能把页面真的打开、看完、
      // 把正文抄下来——所以抓不到的时候，正确的做法不是让用户复制粘贴，
      // 而是**请助手去拿**。
      const askAgent = useCallback(async () => {
        // 重试时输入框可能是空的（刷新/换页回来），用会话里记着的来源链接兜底。
        const target = (jdUrl.trim() || String(session?.documents?.jdUrl ?? '')).trim()
        if (target === '') {
          notify('没链接', '先把岗位链接填上，再交给助手。', 'error')
          return
        }
        setBusy(true)
        try {
          const result = await apiPost('jd/request-agent', { sessionId, url: target })
          setJdUrl(previous => (previous.trim() === '' ? target : previous))
          // 成功不写常驻提示：下面那条 AgentTaskRow 才是「还在等」的真状态。
          setJdNote(undefined)
          notify(
            '交给助手了',
            `${result?.message ?? '已经交给助手了。'}抓到正文会自动回到这一场；等太久或失败会在卡片上给出下一步。`,
            'ok',
          )
          onChanged()
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : String(failure)
          setJdNote({ ok: false, text: `${message}。可以改用下面的手动兜底：把正文粘进 JD 框里。` })
        } finally {
          setBusy(false)
        }
      }, [jdUrl, session?.documents?.jdUrl, sessionId, notify, onChanged])

      // ── 让助手出底稿 ──────────────────────────────────────────────
      //
      // 填完简历和 JD 之后，如果没有这一步，用户就卡在"底稿怎么办"上。
      // 派活同样落在面试工作区，产出由 interview_save_checklist 写回。
      const askChecklist = useCallback(async () => {
        setBusy(true)
        try {
          const result = await apiPost('agent/checklist', { sessionId })
          notify(
            '已让助手出底稿',
            `${result?.message ?? ''}产出后会自动出现在这张卡里；失败或等太久会有下一步。`,
            'ok',
          )
          onChanged()
        } catch (failure) {
          notify('派不出去', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, notify, onChanged])

      /** 清掉一条「等助手」的提示（助手那边照常跑，只是不再占版面）。 */
      const dismissTask = useCallback(async kind => {
        try {
          await apiPost('agent/task', { sessionId, kind, action: 'dismiss' })
          onChanged()
        } catch (failure) {
          notify('没清掉', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [sessionId, onChanged, notify])

      // 等助手返回的三个任务：**状态由 Host 判定，界面只渲染**。
      // waiting 时按钮禁用（避免重复派活），failed 时给原因 + 重试 + 忽略。
      const agentTasks = session?.agentTasks ?? {}
      const checklistTask = agentTasks.checklist
      const checklistWaiting = checklistTask?.status === 'waiting'
      const jdTask = agentTasks.jd
      const jdWaiting = jdTask?.status === 'waiting'

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

      /** 一块卷内材料：没归档时是空态；归档后是一张**可以点开的纸**。 */
      const material = options => h('div', { key: options.key }, [
        options.archived
          ? h(PaperPreview, { key: 'paper', text: options.archivedText, onOpen: options.onOpen })
          : h(Empty, {
            key: 'empty',
            title: options.emptyTitle,
            action: h('div', { style: S.row }, [
              options.upload === undefined ? null : options.upload,
              h('button', { key: 'paste', style: S.btn(false, busy), onClick: options.onOpen }, '粘正文'),
            ]),
          }),
      ])

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
          // **JD 只收纯文本**：文档格式的解析是留给简历的，JD 没有这个必要。
          key: 'i', type: 'file', accept: '.txt,.md,.markdown,text/plain,text/markdown',
          style: { display: 'none' }, onChange: uploadJd,
        }),
      ])

      // **简历库：存一次，之后每场直接选。**
      // 常驻版面只有一个计数 + 一个按钮；列表点开才出现，点别处收起。
      useEffect(() => {
        if (!libraryOpen) return undefined
        const close = event => {
          const target = event.target
          if (target !== null && target !== undefined && typeof target.closest === 'function'
            && target.closest('[data-iv-library]') !== null) return
          setLibraryOpen(false)
        }
        const onKey = event => { if (event.key === 'Escape') setLibraryOpen(false) }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('click', close, true)
          document.addEventListener('keydown', onKey)
        }
        return () => {
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('click', close, true)
            document.removeEventListener('keydown', onKey)
          }
        }
      }, [libraryOpen])

      const libraryToggle = h('button', {
        key: 'lib',
        type: 'button',
        style: { ...S.btn(false, resumes.length === 0), padding: '4px 10px' },
        disabled: resumes.length === 0,
        title: resumes.length === 0
          ? '还没有存过简历：上传或编辑简历时会问你要不要存进库'
          : '从简历库选一份',
        onClick: () => setLibraryOpen(value => !value),
      }, `简历库 ${resumes.length}${libraryOpen && resumes.length > 0 ? ' ▴' : ' ▾'}`)

      // **一行就是「用这份」。** 上一版每行挂一个「用这份」文字按钮，
      // 在窄列里会竖着折行；而且行里只有标题和字数，认不出是哪一版。
      // 现在：整行可点（标题 + 字数 · 日期），删除单独放右边，文字不折行。
      const libraryPanel = libraryOpen && resumes.length > 0
        ? h('div', {
          key: 'panel',
          role: 'menu',
          style: {
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 45,
            width: 'min(360px, calc(100vw - 44px))',
            maxHeight: 360, overflowY: 'auto',
            ...S.surface('stage'), padding: 6, boxShadow: C.elev4,
            animation: 'ivRise 160ms var(--iv-ease) backwards',
          },
        }, [
          ...resumes.map(item => h('div', {
            key: item.id,
            className: 'iv-row',
            style: {
              display: 'flex', alignItems: 'center', gap: 4,
              borderBottom: `1px solid ${C.ruleSoft}`,
            },
          }, [
            h('button', {
              key: 'use',
              type: 'button',
              title: `用「${item.title}」`,
              style: {
                display: 'block', flex: '1 1 auto', minWidth: 0,
                padding: '8px 8px', border: 'none', background: 'transparent',
                textAlign: 'left', cursor: 'pointer', fontFamily: F.ui,
                borderRadius: RADIUS.sm,
              },
              onClick: () => { void applyResume(item.id) },
            }, [
              h('div', {
                key: 't',
                style: {
                  ...TYPE.sub, color: C.bone,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                },
              }, item.title),
              h('div', {
                key: 'm',
                style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, minWidth: 0 },
              }, [
                h(Meta, { key: 'c' }, `${item.chars} 字`),
                typeof item.updatedAt === 'number' && item.updatedAt > 0
                  ? h(Meta, { key: 'd' }, shortDate(item.updatedAt))
                  : null,
                session?.session?.resumeId === item.id
                  ? h(Meta, { key: 'now', tone: 'jade' }, '本场')
                  : null,
              ]),
            ]),
            h(IconBtn, {
              key: 'del',
              label: '从简历库删掉',
              title: '从简历库删掉（已经用过的面试里存的快照不受影响）',
              tone: 'tally',
              style: { flex: '0 0 auto' },
              onClick: () => { void deleteResume(item.id) },
            }, '×'),
          ])),
          // 这场已经有一份简历、但还没进库时的补录入口。
          // 放在库的弹层里，而不是常驻卡片上——常驻按钮会把这一版又变成一排按钮。
          resumeArchived
            ? h('button', {
              key: 'store',
              type: 'button',
              title: '把这一场里的简历存进简历库',
              style: {
                display: 'block', width: '100%', marginTop: 2,
                padding: '8px 10px', border: 'none', borderRadius: RADIUS.sm,
                background: 'transparent', color: C.accent, cursor: 'pointer',
                fontFamily: F.ui, fontSize: TYPE.sub.fontSize, textAlign: 'left',
              },
              onClick: () => {
                setLibraryOpen(false)
                setNaming({ text: resumeText, defaultTitle: resumeNameSuggestion })
              },
            }, '把这场简历存进库')
            : null,
        ])
        : null

      const libraryControl = h('div', {
        key: 'lib',
        'data-iv-library': '1',
        style: { position: 'relative', flex: '0 0 auto' },
      }, [libraryToggle, libraryPanel])

      const resumeSlot = material({
        key: 'resume',
        archived: resumeArchived,
        archivedText: resumeText,
        emptyTitle: '还没有简历',
        onOpen: () => setDocDialog({ kind: 'resume', mode: resumeArchived ? 'preview' : 'edit' }),
        upload: resumeArchived ? undefined : uploadResumeLabel,
      })

      const jdSlot = material({
        key: 'jd',
        archived: jdArchived,
        archivedText: jdText,
        emptyTitle: '还没有 JD',
        onOpen: () => setDocDialog({ kind: 'jd', mode: jdArchived ? 'preview' : 'edit' }),
        upload: jdArchived ? undefined : uploadJdLabel,
      })

      const docDialogNode = docDialog === undefined
        ? null
        : h(MaterialDialog, {
          key: 'doc',
          kind: docDialog.kind,
          title: docDialog.kind === 'resume' ? '简历' : 'JD 正文',
          text: docDialog.kind === 'resume' ? resumeText : jdText,
          initialMode: docDialog.mode,
          initialText: docDialog.initialText,
          linked: (session?.session?.resumeId ?? '') !== '',
          suggestedTitle: resumeNameSuggestion,
          onSave: saveDocument,
          onUpload: docDialog.kind === 'resume' ? extractResumeFile : extractJdFile,
          onClose: () => setDocDialog(undefined),
        })

      const namingNode = naming === undefined
        ? null
        : h(NameResumeDialog, {
          key: 'naming',
          defaultTitle: naming.defaultTitle,
          onClose: () => setNaming(undefined),
          onSave: saveNaming,
        })

      // 岗位链接那一行：抓取、请助手去抓。**没有说明文字**——
      // 按钮的 title 里有完整解释，抓不到时的出路写在下面的提示条里。
      const jdLinkRow = h('div', {
        key: 'link',
        style: { ...S.row, marginBottom: 12, alignItems: 'flex-end' },
      }, [
        h('div', { key: 'f', style: { flex: '1 1 260px', minWidth: 0 } }, h(Field, {
          key: 'url',
          label: '岗位链接',
          value: jdUrl,
          placeholder: 'https://…',
          onChange: setJdUrl,
        })),
        h('button', { key: 'fetch', style: S.btn(false, busy || jdUrl.trim() === ''), onClick: fetchJd }, '抓取'),
        h('button', {
          key: 'agent',
          style: S.btn(false, busy || jdWaiting || (jdUrl.trim() === '' && String(session?.documents?.jdUrl ?? '') === '')),
          title: '把链接发给 DSH 对话里的助手，让它把正文抄回来',
          onClick: askAgent,
        }, jdWaiting ? '助手正在抓…' : '让助手去抓'),
      ])

      // **抓不到不是死路：**把卡在哪、以及两条能走的路都摆出来。
      const jdNoteBlock = jdNote === undefined
        ? null
        : h(Quiet, {
          key: 'note',
          tone: jdNote.ok === true ? 'ok' : 'warn',
          style: {
            display: 'block', lineHeight: 1.65,
            marginBottom: 12, padding: '10px 13px', borderRadius: RADIUS.sm,
            border: `1px solid ${jdNote.ok === true ? TONES.jade.edge : TONES.amber.edge}`,
            background: jdNote.ok === true ? TONES.jade.wash : TONES.amber.wash,
          },
        }, [
          h('div', {
            key: 't',
            style: { ...TYPE.sub, color: jdNote.ok === true ? C.jade : C.amber },
          }, jdNote.text),
          jdNote.canAsk === true
            ? h('div', { key: 'a', style: { ...S.row, marginTop: 8 } }, [
              h('button', { key: 'b', style: S.btn(false, busy), onClick: askAgent }, '让助手去抓'),
              h('span', {
                key: 'h',
                style: { ...TYPE.sub, color: C.boneFaint },
              }, '或者直接把正文粘进下面的框里。'),
            ])
            : null,
        ])

      // 助手正在抓 / 抓失败：和底稿、报告共用同一条状态行，语义一致。
      const jdTaskRow = h(AgentTaskRow, {
        key: 'jd-task',
        task: jdTask,
        waitingLabel: '助手正在抓 JD…拿到正文会自动回到这里',
        retryLabel: '再让助手抓',
        onRetry: () => { void askAgent() },
        onDismiss: () => { void dismissTask('jd') },
      })

      // 底稿收起时只留计数与主行动；调整次数是仪表读数，理由在 title 里。
      const checklistExtra = h('div', { key: 'x', style: S.row }, [
        checklist.length > 0 ? h(Meta, { key: 'c' }, `考点 ${probed}/${checklist.length}`) : null,
        session?.stats?.adjustments > 0
          ? h(Meta, {
            key: 'adj',
            title: '每一次调整都记了理由，事后复盘会用到',
          }, `调整 ${session.stats.adjustments}`)
          : null,
      ])

      // 空档案时不留说明书：把「档案怎么来的」写成一条出路（对话里怎么归档）。
      const profileEmpty = h('div', {
        key: 'empty',
        style: { display: 'flex', flexDirection: 'column', gap: 8 },
      }, [
        h(Empty, { key: 'e', title: '还没有岗位档案' }),
        h(Quiet, { key: 'q' }, '在 DSH 对话里让助手用 interview_save_profile 归档；或用 interview_sync_profile 把这一场回写进档案。'),
      ])

      return h('div', { style: { maxWidth: 1180 } }, [
        docDialogNode,
        namingNode,
        h(FlowSpine, { key: 'spine', current: flowStep }),

        // ── 这场面试叫什么 ────────────────────────────────────────────
        h(Section, {
          key: 'identity',
          title: '这场面试',
          index: 0,
          // 保存放在标题行右端：三格输入 + 一个孤零零的按钮会空出一大片，
          // 那一大片正是「薄纸感」的来源。
          extra: h('div', { key: 'x', style: { display: 'flex', alignItems: 'center', gap: 10 } }, [
            session?.session?.archived === true
              ? h(Pill, { key: 'a', tone: 'amber' }, '已归档')
              : null,
            agentChip,
            h('button', { key: 'b', style: S.btn('primary', busy), onClick: saveIdentity }, '保存'),
          ]),
        }, [
          h('div', {
            key: 'row',
            style: {
              display: 'grid', gap: 12, alignItems: 'end',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            },
          }, [
            h(Field, {
              key: 'c',
              label: '公司',
              value: identity.company,
              placeholder: '例如：字节跳动',
              onChange: value => { identityTouched.current = true; setIdentity(previous => ({ ...previous, company: value })) },
            }),
            h(Field, {
              key: 'p',
              label: '岗位',
              value: identity.position,
              placeholder: '例如：前端工程师',
              onChange: value => { identityTouched.current = true; setIdentity(previous => ({ ...previous, position: value })) },
            }),
            h(Field, {
              key: 't',
              label: '标题',
              value: identity.title,
              placeholder: '这场面试叫什么',
              onChange: value => { identityTouched.current = true; setIdentity(previous => ({ ...previous, title: value })) },
            }),
          ]),
        ]),

        h('div', {
          key: 'grid',
          style: {
            display: 'grid', gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(430px, 100%), 1fr))',
            alignItems: 'start',
          },
        }, [
          // ── 左栏：卷内材料 ──────────────────────────────────────────
          h('div', { key: 'left' }, [
            h(Section, {
              key: 'resume',
              step: '01',
              title: '简历',
              index: 1,
              extra: h('div', { key: 'x', style: { ...S.row, gap: 8 } }, [
                h(Meta, { key: 'chars' }, resumeArchived ? `${session.documents.resumeChars} 字` : '待归档'),
                libraryControl,
              ]),
            }, [resumeSlot]),

            h(Section, {
              key: 'jd',
              step: '02',
              title: '目标岗位 JD',
              index: 2,
              extra: h(Meta, { key: 'chars' }, jdArchived ? `${session.documents.jdChars} 字` : '待归档'),
            }, [jdLinkRow, jdTaskRow, jdNoteBlock, jdSlot]),
          ]),

          // ── 右栏：底稿与档案 ────────────────────────────────────────
          h('div', { key: 'right' }, [
            h(Section, {
              key: 'checklist',
              step: '03',
              title: '面试官底稿',
              index: 3,
              extra: checklistExtra,
            }, [
              checklist.length === 0
                ? h(Empty, {
                  key: 'empty',
                  title: '还没有底稿',
                  action: h('button', {
                    key: 'ask',
                    style: S.btn('primary', busy || checklistWaiting),
                    title: config?.workspaceRoot?.path ?? '',
                    onClick: askChecklist,
                  }, busy ? '派活中…' : '让助手出底稿'),
                })
                : h(Disclosure, {
                  key: 'disclosure',
                  summary: '考点清单',
                }, [
                  h('div', {
                    key: 'list',
                    style: {
                      maxHeight: 'min(56vh, 520px)', overflowY: 'auto',
                      paddingRight: 6, overscrollBehavior: 'contain',
                    },
                  }, checklist.map(item => h(ChecklistRow, { key: item.id, item }))),
                ]),
              // loading / 失败：Host 给 waiting 或 failed（带 reason + hint）。
              h(AgentTaskRow, {
                key: 'task',
                task: checklistTask,
                waitingLabel: '助手正在写底稿…产出后会自动出现在这里',
                retryLabel: checklist.length > 0 ? '重新生成' : '再派一次',
                onRetry: () => { void askChecklist() },
                onDismiss: () => { void dismissTask('checklist') },
              }),
              checklist.length === 0
                ? null
                : h('div', { key: 'next', style: { ...S.row, marginTop: 14 } }, [
                  h('button', {
                    key: 'go',
                    style: S.btn('primary', false),
                    // 「去面试」而不是「进入面试中」：动词 + 目的地，是动作不是状态。
                    onClick: () => props.onGoLive?.(),
                  }, '去面试 →'),
                  h('button', {
                    key: 're',
                    style: S.btn(regenArm ? 'tally' : false, busy || checklistWaiting),
                    // 破坏性操作的后果写在悬停里：点下去会覆盖现有清单。
                    title: regenArm ? '会覆盖现有清单' : '让助手重新调研，生成新清单',
                    onClick: () => {
                      if (checklistWaiting) return
                      if (!regenArm) {
                        setRegenArm(true)
                        setTimeout(() => setRegenArm(false), 5000)
                        return
                      }
                      setRegenArm(false)
                      void askChecklist()
                    },
                  }, regenArm ? '确认重新生成' : '重新生成'),
                ]),
            ]),

            h(Section, {
              key: 'profiles',
              title: '岗位档案',
              index: 4,
              extra: profiles.length > 0
                ? h(Meta, { key: 'n' }, `${profiles.length} 份`)
                : null,
            }, [
              profiles.length === 0
                ? profileEmpty
                : h('div', { key: 'list' }, profiles.map(profile => h('div', {
                  key: profile.id,
                  style: {
                    display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0',
                    borderBottom: `1px solid ${C.ruleSoft}`,
                  },
                }, [
                  h('div', { key: 'b', style: { flex: '1 1 auto', minWidth: 0 } }, [
                    h('div', {
                      key: 't',
                      style: {
                        ...TYPE.body, color: C.bone,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      },
                    }, profile.title),
                    h('div', { key: 'm', style: { ...S.row, marginTop: 4 } }, [
                      h(Meta, { key: 'c' }, `${profile.checklistCount} 考点`),
                      h(Meta, { key: 's' }, `${profile.sessions.length} 场`),
                    ]),
                  ]),
                  h('button', {
                    key: 'apply',
                    style: S.btn(false, busy),
                    onClick: () => { void applyProfile(profile.id) },
                  }, '继承'),
                ]))),
              session?.session?.profileId !== undefined && session?.session?.profileId !== ''
                ? h('div', { key: 'sync', style: { ...S.row, marginTop: 14 } }, [
                  h(Meta, { key: 'n', title: '本场已关联的岗位档案' }, `档案 ${session.session.profileId}`),
                  h('button', {
                    key: 'b',
                    style: S.btn(false, busy),
                    onClick: () => { void syncProfile(session.session.profileId) },
                  }, '回写'),
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
      // 一条按钮走完整条申请链路时的分步反馈。
      const [acquireStage, setAcquireStage] = useState(undefined)
      // 「开始面试」里正在准备设备的中间态（按钮文案要跟着走）。
      const [preparing, setPreparing] = useState(false)
      const lastQuestionRef = useRef('')

      // ── 话轮状态机（docs/TURN-TAKING.md §3）─────────────────────────────
      //
      // 唯一真源在客户端（它拥有麦克风/VAD/TTS 的实时状态）；Host 只持久化
      // 粗粒度会话状态（running/paused），不镜像细粒度话轮相态。
      const sessionId = session?.session?.id
      const status = session?.session?.status
      const running = status === 'running'
      const paused = status === 'paused'
      // 已结束 ≠ 作废：还能续接（见 continueSession / continueBoard）。
      const isDone = status === 'done'
      /** idle | questioning（播报提问）| listening | submitting（反悔窗口）| thinking */
      const [turnPhase, setTurnPhase] = useState('idle')
      const turnPhaseRef = useRef(turnPhase)
      turnPhaseRef.current = turnPhase
      // 自动/手动：本地覆盖立即生效（Live 页快捷切换），异步写 settings（§4.3）。
      const [modeOverride, setModeOverride] = useState(undefined)
      // 自动链路失败只降级**本会话**、不偷改用户设置（§4.4）；恢复要显式再点「自动」。
      const [autoDegraded, setAutoDegraded] = useState(false)
      // 反悔窗口倒计时（§3.2，固定 2s）：{deadline, remaining}。
      const [countdown, setCountdown] = useState(undefined)
      const countdownRef = useRef(undefined)
      countdownRef.current = countdown
      const countdownTimerRef = useRef(undefined)
      // 长沉默的提示/派活结果（§3.3）。
      const [longSilence, setLongSilence] = useState(undefined)
      const answerRef = useRef(answer)
      answerRef.current = answer
      /** 倒计时到点要调「当前这一版」submitAnswer：用 ref，避免定时器拿旧闭包。 */
      const submitRef = useRef(undefined)
      const autoStartTriedRef = useRef(false)
      const spokeRef = useRef(false)
      const speakingRef = useRef(speaking)
      speakingRef.current = speaking
      const ttsRef = useRef(tts)
      ttsRef.current = tts
      const configRef = useRef(config)
      configRef.current = config

      const answerSegmentsRef = useRef([])
      /** 识别到的一句追加进草稿（用户可以改，所以只追加不覆盖）。 */
      const appendRecognized = useCallback((text, meta) => {
        if (typeof text !== 'string' || text.trim() === '') return
        // 每一段都带一份语流原始测量；这一轮回答结束时一起上报。
        if (meta?.segment !== undefined) {
          answerSegmentsRef.current = [...answerSegmentsRef.current, meta.segment]
        }
        setLongSilence(undefined)
        setAnswer(previous => `${previous}${previous.trim() === '' ? '' : ' '}${text.trim()}`)
      }, [])

      const asrMode = voiceStatus.data?.asr?.mode ?? 'browser'
      // 宿主/服务端模式用分段识别（它们只收整段录音）；浏览器模式用 Web Speech。
      const serverAsr = asrMode === 'host' || asrMode === 'server'

      // ── 自动 / 手动（§4）：开关只管「话轮结束判定 + 自动提交」，不管派活 ──
      //
      // manual 下手动点「提交回答」同样唤醒助手（P0 联动在 Host 的
      // appendTurn 里，永远生效）——手动是完整平行主线，不是降级品。
      const answerModeSetting = modeOverride ?? config?.answerMode ?? 'manual'
      const autoDetectWanted = answerModeSetting === 'auto' && !autoDegraded
      // 判定依赖分段识别的 VAD 时间线与「转写完成」信号：浏览器识别下不可用（§4.4）。
      const autoDetectAvailable = serverAsr
      const autoDetectActive = running && !paused && autoDetectWanted && autoDetectAvailable
      const turnEndSilenceMs = Number.isFinite(config?.turnEndSilenceMs) ? config.turnEndSilenceMs : 2000

      /** 取消反悔窗口。reason='edit' = 用户动了草稿：本会话切手动（§3.2）。 */
      const cancelCountdown = useCallback(reason => {
        if (countdownRef.current === undefined) return
        if (countdownTimerRef.current !== undefined && typeof window !== 'undefined') {
          window.clearInterval(countdownTimerRef.current)
        }
        countdownTimerRef.current = undefined
        setCountdown(undefined)
        if (reason === 'edit') setModeOverride('manual')
        if (turnPhaseRef.current === 'submitting') setTurnPhase('listening')
      }, [])

      /** 卸载清理：不留悬空的倒计时定时器。 */
      useEffect(() => () => {
        if (countdownTimerRef.current !== undefined && typeof window !== 'undefined') {
          window.clearInterval(countdownTimerRef.current)
        }
      }, [])

      /** 话轮结束判定 → 进 2 秒反悔窗口（自动提交 ≠ 静默发送，§3.2）。 */
      const scheduleCountdown = useCallback(() => {
        if (typeof window === 'undefined') return
        if (turnPhaseRef.current !== 'listening') return
        // 空草稿永远不自动提交（那是长沉默的路，不是答完）。
        if (answerRef.current.trim() === '') return
        const deadline = Date.now() + 2000
        setTurnPhase('submitting')
        setCountdown({ deadline, remaining: 2000 })
        countdownTimerRef.current = window.setInterval(() => {
          const remaining = deadline - Date.now()
          if (remaining <= 0) {
            if (countdownTimerRef.current !== undefined) window.clearInterval(countdownTimerRef.current)
            countdownTimerRef.current = undefined
            setCountdown(undefined)
            // 走**现有** submitAnswer 同一条路（同一个 service 方法，§6 纪律）。
            void submitRef.current?.(true)
            return
          }
          setCountdown({ deadline, remaining })
        }, 100)
      }, [])

      const webAsr = useAsr(appendRecognized)
      const segmentAsr = useSegmentAsr(appendRecognized, {
        language: voiceStatus.data?.asr?.language ?? 'zh',
        // 双层静音（§3.1）：450ms 转写分段照旧不动；这里是第二层话轮判定，
        // 共用同一条 VAD 帧时间线。armed/judge 每帧从 ref 读最新值。
        turnEnd: {
          // submitting 期间也要听见「重新开口」（取消倒计时），所以 armed 覆盖它；
          // 与模式无关——长沉默观察在 manual 下也要工作（只提示，不派活）。
          armed: running && !paused && (turnPhase === 'listening' || turnPhase === 'submitting'),
          // 半双工门控：播报提问期间不判定（扬声器回声）；thinking 期间不判定
          // （一次回答只派活一次——新问题到达前，说的话进草稿不自动提交）。
          judge: autoDetectActive && turnPhase === 'listening' && !tts.speaking,
          listen: running && !paused && turnPhase === 'listening',
          // 回声治理：面试官正在说（questioning 相位）时，麦克风分段的字节
          // **不送去转写**——否则扬声器里的问题会被写成"候选人的回答"。
          // 只丢字节，不动 VAD 时间线与判定（那条已经是对的，别顺手改）。
          echoGuard: running && !paused && turnPhase === 'questioning',
          silenceMs: turnEndSilenceMs,
        },
        onVoiceStart: () => {
          setLongSilence(undefined)
          if (turnPhaseRef.current === 'submitting') cancelCountdown()
        },
        onTurnEnd: () => { scheduleCountdown() },
        onLongSilence: info => {
          // 长沉默 ≠ 答完（§3.3）：auto 派**事实**给助手换小切口重问；
          // manual 只显示提示，不派活。
          const seconds = Number(info?.seconds ?? 0)
          if (!autoDetectActive) {
            setLongSilence({ seconds, dispatched: false })
            return
          }
          void apiPost(`sessions/${sessionId}/silence`, { seconds })
            .then(() => { setLongSilence({ seconds, dispatched: true }) })
            .catch(failure => {
              setLongSilence({ seconds, dispatched: false })
              notify('长沉默没派出去', failure instanceof Error ? failure.message : String(failure), 'error')
            })
        },
      })
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

      /**
       * 提交回答 —— **手动点按钮与自动倒计时走的是这同一个函数**。
       *
       * Host 端 appendTurn 收到 `meta.source:'panel'` 的 candidate 行且会话
       * running 时，会异步派活唤醒助手出下一题（TURN-TAKING §5.1）——
       * 派活与自动/手动开关无关，manual 模式下这条链路同样生效。
       *
       * @param {boolean} [auto] true = 反悔窗口倒计时到点的自动提交
       */
      const submitAnswer = useCallback(async (auto = false) => {
        const text = answer.trim()
        if (text === '') return
        const segments = answerSegmentsRef.current
        try {
          await apiPost(`sessions/${session.session.id}/turn`, {
            role: 'candidate',
            text,
            // 语流只上报**原始测量**：Host 端统一算指标（单一实现）。
            // 判定与语流测量共用同一条 VAD 时间线，自动提交一点数据不少（§3.1）。
            meta: {
              source: 'panel',
              ...(auto === true ? { auto: true } : {}),
              ...(segments.length > 0 ? { fluency: { segments } } : {}),
            },
          })
          answerSegmentsRef.current = []
          setAnswer('')
          setLongSilence(undefined)
          // 助手正在生成下一问：进入 thinking（舞台显示状态，§3.4）。
          setTurnPhase('thinking')
          onChanged()
          if (auto === true) {
            notify('已自动提交', '有补充或修正？接着说或打字，再手动提交一次即可。', 'ok')
          } else {
            notify('回答已记录', undefined, 'ok')
          }
        } catch (failure) {
          notify('没记上', failure instanceof Error ? failure.message : String(failure), 'error')
          if (auto === true) {
            // 自动提交失败：草稿保留 + 本会话降 manual（不写 settings；§4.4）。
            setAutoDegraded(true)
            setTurnPhase('listening')
          }
        }
      }, [answer, session?.session?.id, onChanged, notify])
      // 倒计时定时器到点时调「当前这一版」submitAnswer。
      submitRef.current = submitAnswer

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

      // 「开始面试」要先判断宿主摄像头开没开，而 `hostCamera` 在下面才创建
      // （hooks 顺序决定的）。**依赖数组是渲染期求值的**，直接引用会踩 TDZ
      // （`performanc/§11` 记过这条）；用 ref 在点击那一刻读最新值。
      const hostCameraRef = useRef(undefined)

      /**
       * 开始面试：**先把设备准备好，再让面试开始。**
       *
       * 用户点「开始面试」时只有一个念头：开始。旧实现只 POST /start——
       * 进到面试间却是一片「未接通板」，摄像头、麦克风一个都没申请。
       * 顺序应该反过来：此刻正是用户手势（权限窗唯一能弹出来的时机），
       * 先接通麦克风（桌面端再加上宿主摄像头），再置 running。
       *
       * **设备失败不挡面试**（AGENTS §6.3）：没有麦克风就键盘，没有摄像头
       * 就未接通板——但**结果要如实说出来**，不能用一句「已开始」盖过去。
       */
      const startInterview = useCallback(async () => {
        // 这是整个面试里最可靠的一次用户手势：在这里解锁音频，
        // 第一句提问自动播报时才不会被浏览器拦掉。
        unlockAudio()
        setPreparing(true)
        const hadDevices = media.stream !== undefined || hostCameraRef.current?.active === true
        let ready
        try {
          if (!hadDevices) {
            setAcquireStage({ text: '正在准备摄像头与麦克风…' })
            ready = await acquireMediaRef.current?.()
          }
          // Host 端 startSession 置 running 并**异步派活开场**（§5.1）：
          // 点完这一下，助手自己会开口，不需要再去 DSH 对话区做任何事。
          await apiPost(`sessions/${session.session.id}/start`, {})
          // 本地先进 thinking：开场白由轮询带回来（新问题 → questioning）。
          setTurnPhase('thinking')
          onChanged()
          if (hadDevices) {
            notify('面试开始了', undefined, 'ok')
          } else if (ready?.mic === true && ready?.cam === true) {
            notify('面试开始了', '摄像头与麦克风已接通。', 'ok')
          } else if (ready?.mic === true) {
            notify('面试开始了', '麦克风已接通；摄像头没接上——舞台会给画面留位置，随时可以补。', 'warn')
          } else {
            notify('面试开始了', '设备没接上：提问照常、回答用键盘，面试不会中断。', 'warn')
          }
        } catch (failure) {
          notify('没能开始', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setPreparing(false)
        }
      }, [session?.session?.id, media.stream, onChanged, notify])

      /**
       * 续接一场**已结束**的面试：状态回 running，并在同一个手势里把设备接上。
       *
       * 和「继续面试」（paused → running）的区别只在服务端：续接不重开一轮，
       * 中断的那段时间记进 pausedMs。客户端这边两者一样——接设备、等下一问。
       */
      const continueInterview = useCallback(async () => {
        unlockAudio()
        setPreparing(true)
        try {
          await apiPost(`sessions/${session.session.id}/continue`, {})
          onChanged()
          notify('续接上了', '助手会从上一问接着问，不会重新开场。', 'ok')
        } catch (failure) {
          notify('没法续接', failure instanceof Error ? failure.message : String(failure), 'error')
          return
        } finally {
          setPreparing(false)
        }
        if (media.stream === undefined && hostCameraRef.current?.active !== true) {
          setAcquireStage({ text: '正在准备摄像头与麦克风…' })
          await acquireMediaRef.current?.()
        }
      }, [session?.session?.id, media.stream, onChanged, notify])

      const finishInterview = useCallback(async () => {
        try {
          await apiPost(`sessions/${session.session.id}/finish`, {})
          onChanged()
          notify('面试已结束', '去「报告」页让助手写分析。', 'ok')
        } catch (failure) {
          notify('没能结束', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [session?.session?.id, onChanged, notify])

      // `running` / `paused` / `status` 已在话轮状态机区块里提前定义。
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
      // 「开始面试」在点击那一刻读它（见上面的 hostCameraRef 注释）。
      hostCameraRef.current = hostCamera
      const hasHostVideo = hostCamera.active
      /**
       * 宿主画面是不是真的接上了。
       *
       * **MJPEG 握手失败时 `<img>` 会变成一张破图**，而用户看到的是「画面坏了」。
       * 那时应该退回有设计的未接通板，并说清下一步——而不是在舞台中间留一张碎图。
       */
      const [hostVideoFailed, setHostVideoFailed] = useState(false)
      useEffect(() => { setHostVideoFailed(false) }, [hasHostVideo])
      const hasAnyVideo = hasVideo || (hasHostVideo && !hostVideoFailed)

      /**
       * 一条按钮走完整条链路：浏览器麦克风 → 宿主摄像头。
       *
       * **为什么不再让用户去点第二个按钮。** 桌面端里「麦克风成功、摄像头失败」
       * 是常态；兜底路径（宿主采集）既然通，就不该让用户自己发现它。
       *
       * 返回**实际接上了什么**：调用方（开始面试）要用它如实汇报结果，
       * 而不是自己猜「应该接上了」。
       *
       * @returns {Promise<{mic: boolean, cam: boolean, host: boolean}>}
       */
      const acquireMedia = async () => {
        setAcquireStage({ text: '正在申请麦克风…' })
        const stream = await media.start()
        const micOk = (stream?.getAudioTracks?.() ?? []).length > 0
        const camOk = (stream?.getVideoTracks?.() ?? []).length > 0
        if (camOk) {
          setAcquireStage({ text: '✓ 麦克风与摄像头已接入' })
          return { mic: micOk, cam: true, host: false }
        }
        if (!inDesktopHost()) {
          setAcquireStage({ text: micOk ? '✓ 麦克风已接入；摄像头没拿到（可再试一次）' : '麦克风与摄像头都没接上；键盘输入可用。' })
          return { mic: micOk, cam: false, host: false }
        }
        setAcquireStage({ text: `${micOk ? '✓ 麦克风已接入 · ' : ''}摄像头被桌面端挡下，正在尝试宿主采集…` })
        const started = await hostCamera.start()
        setAcquireStage({
          text: `${micOk ? '✓ 麦克风已接入 · ' : ''}${started ? '✓ 摄像头已通过宿主接入' : '摄像头仍未接上（可点「用宿主摄像头」重试）'}`,
        })
        return { mic: micOk, cam: started === true, host: started === true }
      }

      // 手动点「开宿主摄像头」重试成功时，分步文案也要跟着变成成功态。
      useEffect(() => {
        if (!hostCamera.active) return
        setAcquireStage(previous => (previous === undefined ? previous : { text: '✓ 摄像头已通过宿主接入' }))
      }, [hostCamera.active])

      // ── 话轮状态机编排（docs/TURN-TAKING.md §3/§6）──────────────────────

      const questionSeededRef = useRef(false)
      const lastSeenQuestionRef = useRef(undefined)
      const acquireMediaRef = useRef(undefined)
      acquireMediaRef.current = acquireMedia

      /** 切场次：本地状态全部属于上一场，全量清零（草稿、定时器、相态、识别）。 */
      const lastSessionIdRef = useRef(sessionId)
      useEffect(() => {
        if (lastSessionIdRef.current === sessionId) return
        lastSessionIdRef.current = sessionId
        cancelCountdown()
        setAnswer('')
        answerSegmentsRef.current = []
        setLongSilence(undefined)
        setAutoDegraded(false)
        setModeOverride(undefined)
        setTurnPhase('idle')
        questionSeededRef.current = false
        lastSeenQuestionRef.current = undefined
        autoStartTriedRef.current = false
        spokeRef.current = false
        ttsRef.current.stop()
        try { segmentAsr.stop() } catch { /* 没开过 */ }
        try { webAsr.stop() } catch { /* 没开过 */ }
      }, [sessionId, cancelCountdown])

      /**
       * 初始相态推导（§6.6：崩溃/刷新恢复与手动继续走**同一条路**）。
       *
       * running 但本地状态机没起步（首次进入 / 页面刷新 / DSH 重启后重开）：
       * 从转录最后一行推导相态，**不改 Host 状态、不派活**——助手会话没人
       * 动过，转录停在原地，用户接着答就行。
       */
      useEffect(() => {
        if (status !== 'running') {
          if (turnPhaseRef.current !== 'idle') setTurnPhase('idle')
          return
        }
        if (turnPhaseRef.current !== 'idle') return
        const rows = session?.transcript ?? []
        let lastRow
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (rows[index].role !== 'system') { lastRow = rows[index]; break }
        }
        // 最后一行是 interviewer 提问 → 直接 listening；否则 thinking 等助手。
        setTurnPhase(lastRow !== undefined && lastRow.role === 'interviewer' ? 'listening' : 'thinking')
      }, [status, session?.transcript])

      /** 新 interviewer turn 到达（轮询发现）→ questioning（§3 状态机）。 */
      useEffect(() => {
        if (!questionSeededRef.current) {
          // 挂载播种：转录里**已有**的提问不当作「新到达」重播一遍。
          questionSeededRef.current = true
          lastSeenQuestionRef.current = lastQuestion?.ts
          return
        }
        const ts = lastQuestion?.ts
        if (ts === undefined || ts === lastSeenQuestionRef.current) return
        lastSeenQuestionRef.current = ts
        if (status !== 'running') return
        spokeRef.current = false
        setLongSilence(undefined)
        setTurnPhase('questioning')
      }, [lastQuestion, status])

      /**
       * questioning → listening：**TTS 播报结束才武装判定**（半双工门控）。
       *
       * 没开朗读就快速放行；开了朗读等首句合成（最多 8s），播完再切。
       * 硬上限兜底：speaking 标志卡住（浏览器音色 onend 不回来之类）时
       * 不能把面试卡死在 questioning——状态机坏了不塌面试（§3 规则 3）。
       */
      useEffect(() => {
        if (turnPhase !== 'questioning' || typeof window === 'undefined') return undefined
        const startedAt = Date.now()
        const timer = window.setInterval(() => {
          if (turnPhaseRef.current !== 'questioning') { window.clearInterval(timer); return }
          if (ttsRef.current.speaking) { spokeRef.current = true; return }
          const waited = Date.now() - startedAt
          if (spokeRef.current) { window.clearInterval(timer); setTurnPhase('listening'); return }
          const ttsExpected = speakingRef.current && configRef.current?.ttsProvider !== 'none'
          if (!ttsExpected && waited > 700) { window.clearInterval(timer); setTurnPhase('listening'); return }
          if (waited > 8000) { window.clearInterval(timer); setTurnPhase('listening') }
        }, 250)
        const cap = window.setTimeout(() => {
          if (turnPhaseRef.current === 'questioning') setTurnPhase('listening')
        }, 120000)
        return () => { window.clearInterval(timer); window.clearTimeout(cap) }
      }, [turnPhase])

      /**
       * 暂停（不管从哪条路来：面板按钮 / 助手 interview_pause / 轮询发现）。
       *
       * **指示灯必须灭**：用户人走了，摄像头麦克风还开着，比功能坏了更
       * 严重（§6.3/§10.3）。stop 都是幂等的，重复执行无害。
       */
      useEffect(() => {
        if (!paused) return
        cancelCountdown()
        setLongSilence(undefined)
        if (turnPhaseRef.current !== 'idle') setTurnPhase('idle')
        ttsRef.current.stop()
        try { segmentAsr.stop() } catch { /* 已停 */ }
        try { webAsr.stop() } catch { /* 已停 */ }
        if (media.stream !== undefined) media.stop()
        if (hostCamera.active) void hostCamera.stop()
      }, [paused, cancelCountdown])

      /** 面试结束：设备关灯、状态机归零。 */
      useEffect(() => {
        if (status !== 'done') return
        if (turnPhaseRef.current === 'idle' && countdownRef.current === undefined) return
        cancelCountdown()
        setTurnPhase('idle')
        ttsRef.current.stop()
        if (media.stream !== undefined) media.stop()
        if (hostCamera.active) void hostCamera.stop()
      }, [status, cancelCountdown])

      /**
       * 重置把状态打回 draft：**设备必须关灯**（AGENTS §10.3）。
       *
       * 「没进 done」不等于「设备已经放了」——重置是 Host 端的动作，
       * 它不知道浏览器这边摄像头还开着。所以这里按「不在面试中」兜底，
       * 顺手把本地相态与识别也归零。
       */
      useEffect(() => {
        if (status === 'running' || status === 'paused' || status === 'done') return
        cancelCountdown()
        if (turnPhaseRef.current !== 'idle') setTurnPhase('idle')
        ttsRef.current.stop()
        try { segmentAsr.stop() } catch { /* 没开过 */ }
        try { webAsr.stop() } catch { /* 没开过 */ }
        if (media.stream !== undefined) media.stop()
        if (hostCamera.active) void hostCamera.stop()
      }, [status, cancelCountdown])

      /**
       * 自动模式下自动开分段识别：判定依赖它，不能让用户开两个开关。
       * 用户手动停过就不偷偷再开（autoStartTriedRef）；出错时如实显示
       * 原因、不无限重试——键盘 + 手动发送照常（§6.3 纪律）。
       */
      useEffect(() => {
        if (!autoDetectActive || turnPhase === 'idle') return
        if (segmentAsr.active) { autoStartTriedRef.current = false; return }
        if (segmentAsr.error !== undefined) return
        if (media.stream === undefined) return
        if (autoStartTriedRef.current) return
        autoStartTriedRef.current = true
        void segmentAsr.start()
      }, [autoDetectActive, turnPhase, segmentAsr.active, segmentAsr.error, media.stream])

      /** 暂停面试：Host 记状态与留痕，客户端**立刻**释放设备（不等轮询）。 */
      const pauseInterview = useCallback(async () => {
        try {
          await apiPost(`sessions/${session.session.id}/pause`, {})
          ttsRef.current.stop()
          cancelCountdown()
          setTurnPhase('idle')
          setLongSilence(undefined)
          try { segmentAsr.stop() } catch { /* 已停 */ }
          try { webAsr.stop() } catch { /* 已停 */ }
          media.stop()
          if (hostCamera.active) void hostCamera.stop()
          onChanged()
          notify('面试已暂停', '摄像头与麦克风已关闭、计时停走；回来点「继续面试」，助手会带着原上下文接着问。', 'ok')
        } catch (failure) {
          notify('没能暂停', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [session?.session?.id, cancelCountdown, media, hostCamera.active, hostCamera.stop, segmentAsr, webAsr, onChanged, notify])

      /**
       * 继续面试：Host 端 resumeSession 累计暂停时长并**异步派活唤醒助手**
       * （§6.4）；媒体在用户手势内重新申请，权限路径与 start 相同。
       * DSH 重启过也不怕：冷会话被 prompt 唤醒时历史完整重建（§6.5）。
       */
      const resumeInterview = useCallback(async () => {
        try {
          await apiPost(`sessions/${session.session.id}/unpause`, {})
          onChanged()
          notify('面试继续', '助手正在重新对齐上下文，下一问马上来。', 'ok')
        } catch (failure) {
          notify('没能继续', failure instanceof Error ? failure.message : String(failure), 'error')
          return
        }
        await acquireMediaRef.current?.()
        // 相态由恢复 effect 从转录推导：最后一行是 interviewer 提问 → listening。
      }, [session?.session?.id, onChanged, notify])

      /**
       * 最近一条**没被补发成功**的派活失败（§4.4）。
       *
       * 从转录尾部往前扫：ok:true 的 requestId 记入已解决集合，遇到
       * 不在集合里的 ok:false 就是要显示重发按钮的那条。与 Host 的
       * retryAgentDispatch 用同一套判定（单一语义，两处实现同构）。
       */
      const dispatchFailure = useMemo(() => {
        const rows = session?.transcript ?? []
        const resolved = new Set()
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          const row = rows[index]
          const dispatch = row.role === 'system' && row.meta !== undefined && typeof row.meta === 'object'
            ? row.meta.dispatch
            : undefined
          if (dispatch === undefined || typeof dispatch?.requestId !== 'string') continue
          if (dispatch.ok === true) { resolved.add(dispatch.requestId); continue }
          if (dispatch.ok === false && !resolved.has(dispatch.requestId)) return dispatch
        }
        return undefined
      }, [session?.transcript])

      const retryDispatch = useCallback(async () => {
        try {
          const result = await apiPost(`sessions/${session.session.id}/agent-retry`, {})
          notify(
            result?.retried === true ? '已重新发给助手' : '不用重发',
            result?.reason ?? result?.message,
            result?.retried === true ? 'ok' : 'info',
          )
          onChanged()
        } catch (failure) {
          notify('重发失败', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [session?.session?.id, notify, onChanged])

      /** Live 页快捷切换（§4.3）：即时生效、写入 settings（下次面试保持）。 */
      const setAnswerMode = useCallback(mode => {
        setModeOverride(mode)
        // 显式切回「自动」= 从降级恢复（恢复自动要用户显式再点，§4.4）。
        if (mode === 'auto') setAutoDegraded(false)
        cancelCountdown()
        void apiPost('settings', { answerMode: mode }).then(() => {
          onChanged?.()
        }).catch(failure => {
          notify('设置没存上', failure instanceof Error ? failure.message : String(failure), 'error')
        })
      }, [cancelCountdown, notify, onChanged])

      /** auto 想要但不可用时的**原因**（失败必须给出路，不许静默降级）。 */
      const autoHint = !autoDetectWanted
        ? undefined
        : autoDegraded
          ? '自动提交失败过一次：本场已降为手动。要恢复就再点一次「自动」。'
          : !serverAsr
            ? '浏览器识别没有话轮结束判定：自动不可用，手动发送照常（识别切到宿主/服务端即可启用）。'
            : segmentAsr.error !== undefined
              ? `分段识别不可用（${segmentAsr.error}）：自动判定暂停，手动发送照常。`
              : undefined

      const reportReady = (session?.report ?? '') !== ''
      // 报告派活后的真实状态（Host 判定）：waiting 转圈、failed 给原因与重试。
      const reportTask = session?.agentTasks?.report
      const reportWaiting = reportTask?.status === 'waiting'
      const durationMs = session?.stats?.durationMs ?? 0
      const tooShortForReport = durationMs > 0 && durationMs < 3 * 60 * 1000
      const dismissTask = async kind => {
        try {
          await apiPost('agent/task', { sessionId, kind, action: 'dismiss' })
          onChanged?.()
        } catch (failure) {
          notify('没清掉', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }
      const dispatchReport = async () => {
        if (reportWaiting) return
        try {
          const result = await apiPost('agent/report', { sessionId })
          notify('已让助手写报告', result?.message ?? '产出后会自动出现在「报告」页。', 'ok')
          onChanged?.()
        } catch (failure) {
          notify('派不出去', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }
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
      // Pill 里只放得下**一家的名字**。状态条不是日志，链路的完整理由在 Hint 里。
      const ttsShort = ttsInfo?.mode === 'server'
        ? ({
          mimo: 'MiMo',
          openai: 'OpenAI',
          minimax: 'MiniMax',
          baidu: '百度',
          edge: 'Edge',
          host: '宿主',
        }[ttsInfo.provider] ?? '模型')
        : (ttsInfo?.mode === 'none' ? '关' : '音色')
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
      // 为什么不是「让右栏变窄」——右栏一窄，控件就挤成两行字，等于把功能
      // 藏起来；而舞台是这一页的主角，窄的时候更该它占满。
      const [liveRef, liveWidth] = useContainerWidth()
      const stacked = liveWidth > 0 && liveWidth < 760

      /** 计时器 + REC 灯。组件在模块作用域，key 由调用点给。 */
      const clockProps = absolute => ({
        absolute,
        durationMs: session?.stats?.durationMs ?? 0,
        recording: recorder.recording || hostCamera.recording,
      })

      // 麦克风是否真的接通：看音轨，不看流存不存在。
      const micOn = media.stream !== undefined
        && typeof media.stream.getAudioTracks === 'function'
        && media.stream.getAudioTracks().length > 0

      /**
       * 提问：**压在画面下缘的下三分之一**。
       *
       * 为什么提问要压在画面上而不是放在旁边的框里——真实线上面试里，
       * 提问是**对面那个人说的**，它和你的人像在同一块画面上。挪进侧栏，
       * 它就变成「界面上的一个字段」，现场感就没了。
       *
       * 没有画面时提问落在舞台下方的带子里（仍然紧贴舞台、仍然吃满左半屏），
       * 免得和「未接通板」上的申请按钮抢地方——那个按钮是权限被拒时唯一的出口。
       */
      const questionRule = h('div', {
        key: 'rule',
        style: {
          display: 'flex', gap: 16, alignItems: 'flex-start',
          borderLeft: `3px solid ${questionText === undefined ? C.rule : C.amber}`,
          paddingLeft: 16,
        },
      }, [
        h('div', { key: 'body', style: { minWidth: 0 } }, [
          // 把等待**演出来**（§3.4）：有状态提示的沉默是自然的，
          // 无提示的沉默是死机。呼吸灯用现有 6s token（iv-breathe）。
          h(Meta, {
            key: 'eyebrow',
            tone: turnPhase === 'thinking' ? 'jade' : questionText === undefined ? undefined : 'amber',
            style: { display: 'block', marginBottom: 8 },
          }, turnPhase === 'thinking'
            ? h('span', { key: 'th', className: 'iv-breathe', style: { display: 'inline-block' } }, '面试官正在思考…')
            : turnPhase === 'questioning'
              ? '正在播报提问'
              : questionText === undefined ? '等待提问' : `第 ${questionIndex} 问`),
          questionText === undefined
            ? h('div', {
              key: 'idle',
              style: { ...TYPE.body, color: C.boneDim },
            }, turnPhase === 'thinking'
              ? '开场白准备中，请稍候。'
              : running
                ? '面试官马上提问。'
                // 旧文案「在 DSH 对话区让助手开始这一轮」描述的是断链的旧设计：
                // 现在开始面试会自动派活开场（§5.1），不需要用户去对话区做任何事。
                : '点「开始面试」，面试官会自动开场。')
            : h('div', {
              key: 'text',
              style: {
                fontFamily: F.display, ...TYPE.display,
                // 窄面板里一句提问会折成三行；22px 的衬线三行会把下三分之一
                // 撑成一堵墙，反而看不见画面。窄的时候降一档，仍然是最亮的元素。
                fontSize: liveWidth > 0 && liveWidth < 820 ? 18 : TYPE.display.fontSize,
                lineHeight: 1.5, color: C.bone,
                letterSpacing: '0.006em',
                maxHeight: hasAnyVideo ? 132 : 200, overflow: 'hidden',
                // thinking 时上一问压暗一点：主角是「面试官正在思考」。
                ...(turnPhase === 'thinking' ? { opacity: 0.72 } : {}),
              },
            }, questionText),
        ]),
      ])

      /** 有画面：压在画面下缘。没有：落在舞台下方的一条带子。 */
      const lowerThird = hasAnyVideo
        ? h('div', {
          key: 'cue',
          style: {
            position: 'absolute', left: 0, right: 0, bottom: 0,
            padding: '64px 28px 22px',
            background: 'linear-gradient(180deg, ' + C.cueTop + ' 0%, ' + C.cueMid + ' 52%, ' + C.cueLow + ' 100%)',
            pointerEvents: 'none',
          },
        }, [questionRule])
        : h('div', {
          key: 'band',
          style: {
            flex: '0 0 auto',
            // 舞台长高时提问带贴底——它就是「压在画面下三分之一」的那条。
            marginTop: 'auto',
            padding: '16px 26px 18px',
            background: C.band,
            borderTop: `1px solid ${C.rule}`,
          },
        }, [questionRule])

      // 宿主画面握手失败的实情要**压过**「已接入」的乐观反馈——
      // 否则右栏写着「✓ 摄像头已通过宿主接入」，舞台上却是一块未接通板。
      // （定义在舞台之前：恢复板也要显示这条分步文案。）
      const acquireText = hostVideoFailed && hostCamera.active
        ? '宿主画面没出帧——重开一次「用宿主摄像头」，或改用浏览器摄像头。'
        : (acquireStage === undefined ? undefined : acquireStage.text)

      /**
       * running 但设备没接 = **恢复态**（§6.6：刷新/崩溃/非意图中断与手动
       * 继续走同一条路）：舞台给「继续面试」板，而不是冷冰冰的申请板。
       *
       * **只在挂载时判定一次**：本次挂载里用户自己点「开始面试」进入
       * running 的，不算中断恢复——那时该显示的还是常规的申请板。
       */
      const resumeArmedRef = useRef(undefined)
      if (resumeArmedRef.current === undefined && session !== undefined) {
        resumeArmedRef.current = status === 'running' && media.stream === undefined && !hostCamera.active
      }
      const isResumeState = resumeArmedRef.current === true
        && running && media.stream === undefined && !hasHostVideo

      const plateInnerStyle = {
        flex: '1 1 auto', margin: 'auto', width: '100%', maxWidth: 540,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center',
        gap: 16, padding: '28px 30px 24px', textAlign: 'center',
      }

      const plateHeader = [
        h('div', {
          key: 't',
          style: {
            fontFamily: F.display, ...TYPE.title, color: C.bone,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260,
          },
        }, title),
        // 暂停板的计时是**冻结显示**：durationMs 在 Host 端已扣暂停时长。
        h(ClockBadge, { key: 'clock', ...clockProps(false) }),
      ]

      /** 错误框（权限被拒/宿主摄像头失败）：常规板与恢复板**共用**——失败必须给出路（§7）。 */
      const plateErrors = [
        hostCamera.error !== undefined
          ? h('div', {
            key: 'herr',
            style: {
              width: '100%', maxWidth: 460,
              padding: '10px 14px', borderRadius: RADIUS.sm,
              border: `1px solid ${TONES.amber.edge}`,
              background: TONES.amber.wash,
            },
          }, [
            h('div', { key: 't', style: { ...TYPE.sub, color: C.amber, marginBottom: 4 } }, hostCamera.error.text),
            h('div', { key: 'a', style: { ...TYPE.sub, color: C.boneFaint, lineHeight: 1.65 } }, hostCamera.error.action),
          ])
          : null,
        media.error !== undefined
          ? h('div', {
            key: 'err',
            style: {
              width: '100%', maxWidth: 460,
              padding: '10px 14px', borderRadius: RADIUS.sm,
              border: `1px solid ${media.error.kind === 'denied' ? TONES.tally.edge : TONES.amber.edge}`,
              background: media.error.kind === 'denied' ? TONES.tally.wash : TONES.amber.wash,
            },
          }, [
            h('div', {
              key: 't',
              style: { ...TYPE.sub, color: media.error.kind === 'denied' ? C.tally : C.amber, marginBottom: 4 },
            }, media.error.text),
            h('div', { key: 'a', style: { ...TYPE.sub, color: C.boneFaint, lineHeight: 1.65 } }, media.error.action),
          ])
          : null,
        acquireText === undefined
          ? null
          : h(Quiet, { key: 'stage', tone: acquireText.startsWith('✓') ? 'ok' : 'muted' }, acquireText),
      ]

      /** 权限被拒时的「重新检测授权状态」：常规板与恢复板共用。 */
      const permissionRetryButton = media.permission?.camera === 'denied' || media.permission?.microphone === 'denied'
        ? h('button', {
          key: 'retry',
          style: S.btn(false, media.busy),
          onClick: () => { void media.probe().then(() => media.start()) },
        }, '重新检测授权状态')
        : null

      /** 桌面端的第二条路（宿主采集）：常规板与恢复板共用。 */
      const hostCameraButton = inDesktopHost() && !hasAnyVideo
        ? h('button', {
          key: 'host-cam',
          style: S.btn(false, hostCamera.busy),
          onClick: () => { void hostCamera.start() },
        }, hostCamera.busy ? '正在开摄像头…' : (hostCamera.active ? '重连宿主摄像头' : '用宿主摄像头'))
        : null

      /** 暂停板（§6.3）：REC 灭、计时冻结、大按钮「继续面试」+ 次按钮「结束面试」。 */
      const pauseBoard = h('div', { key: 'inner', style: plateInnerStyle }, [
        h(Meta, { key: 'e', tone: 'amber', style: { display: 'block' } }, '面试已暂停'),
        h('div', {
          key: 'hdr',
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%',
          },
        }, plateHeader),
        // 草稿是瞬态物（不做持久化），但**必须说出来**它刷新会丢。
        answer.trim() !== ''
          ? h(Quiet, { key: 'draft', tone: 'warn' }, '有未提交的回答草稿：刷新页面会丢，恢复后可重新口述或粘贴。')
          : null,
        h(Quiet, { key: 'q' }, '摄像头与麦克风已关闭，计时已停走；助手会话留在原地，上下文不丢。'),
        h('div', {
          key: 'act',
          style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 },
        }, [
          h('button', {
            key: 'resume',
            style: S.btn('primary', false),
            onClick: () => { void resumeInterview() },
          }, '继续面试'),
          h('button', {
            key: 'finish',
            style: S.btn(false, false),
            onClick: () => { void finishInterview() },
          }, '结束面试'),
        ]),
      ])

      /**
       * 恢复板（§6.6）：这场面试还在进行——继续 / 结束。
       *
       * 权限错误框、宿主摄像头按钮、重新检测授权**一个不少**：恢复板在
       * 权限被拒时同样是唯一出口（AGENTS §7），不能因为换了主角就丢出路。
       */
      const resumeBoard = h('div', { key: 'inner', style: plateInnerStyle }, [
        h(Meta, { key: 'e', tone: 'amber', style: { display: 'block' } }, '这场面试还在进行'),
        h('div', {
          key: 'hdr',
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%',
          },
        }, plateHeader),
        h(Quiet, { key: 'q' }, '离开页面时设备已被释放——点「继续面试」重新接通麦克风与摄像头；转录停在原地，键盘输入始终可用。'),
        ...plateErrors,
        h('div', {
          key: 'act',
          style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 },
        }, [
          h('button', {
            key: 'go',
            style: S.btn('primary', media.busy),
            onClick: () => { void acquireMedia() },
          }, media.busy || hostCamera.busy ? '正在申请…' : '继续面试'),
          hostCameraButton,
          permissionRetryButton,
          h('button', {
            key: 'finish',
            style: S.btn(false, false),
            onClick: () => { void finishInterview() },
          }, '结束面试'),
        ]),
      ])

      /**
       * 续接板：这场面试**已经结束**，但还能接着面。
       *
       * 「结束」不等于「作废」——很多人是聊到一半临时有事，先把数据落定
       * 拿去分析；回来时应该能接着上一轮继续，而不是重开一场
       * （转录、底稿、计时都还在，见 `continueSession`）。
       */
      const continueBoard = h('div', { key: 'inner', style: plateInnerStyle }, [
        h(Meta, { key: 'e', tone: 'jade', style: { display: 'block' } }, '这场面试已经结束'),
        h('div', {
          key: 'hdr',
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%',
          },
        }, plateHeader),
        h(Quiet, { key: 'q' }, '转录、底稿、计时都还在——点「续接面试」从上一问接着问，助手不会重新开场。'),
        ...plateErrors,
        h('div', {
          key: 'act',
          style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 },
        }, [
          h('button', {
            key: 'go',
            style: S.btn('primary', preparing || media.busy),
            onClick: () => { void continueInterview() },
          }, preparing || media.busy || hostCamera.busy ? '正在准备…' : '续接面试'),
          hostCameraButton,
          permissionRetryButton,
        ]),
      ])

      /**
       * The stage: video when we have it, a designed "standby" plate when we don't.
       *
       * 没接通时它不能是一块黑框：姓名章 + 两圈呼吸环 + 还在跳的电平 + 计时，
       * 让「待机」和「坏了」看起来不一样。
       */
      const stage = h('div', {
        key: 'stage',
        'data-iv-stage': '1',
        style: {
          position: 'relative', minWidth: 0,
          // 有画面时舞台吃满可用高度；没画面时**长高不缩短**（flex-grow 1 / shrink 0）：
          // 高屏上它照样是主位，矮屏上按内容定高、由外层滚动，
          // 未接通板里的按钮永远不会被压没。
          flex: hasAnyVideo ? '1 1 auto' : '1 0 auto',
          minHeight: hasAnyVideo ? 260 : (stacked ? 320 : 360),
          borderRadius: RADIUS.lg, overflow: 'hidden',
          background: C.stage,
          border: `1px solid ${C.ruleSoft}`,
          // 舞台是这一页**最高的东西**：专用的一级 elevation（不是最重的那级——
          // 太重的向下投影会把下面的回答框压住，亮色下还会读成一片脏）。
          boxShadow: C.elevStage,
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
        // Host 侧的摄像头画面：`<img>` 直接吃 multipart/x-mixed-replace 流。
        hasHostVideo && !hostVideoFailed
          ? h('img', {
            key: 'host-v',
            'data-iv-host-video': '1',
            src: '/interviewer/camera/stream',
            alt: '摄像头画面',
            // 流接不上就退回未接通板，别把一张破图摆在舞台中间。
            onError: () => setHostVideoFailed(true),
            style: {
              width: '100%', height: '100%', objectFit: 'cover',
              transform: 'scaleX(-1)', display: 'block',
            },
          })
          : null,
        // 面试官：画中画，贴右上角（不改主布局，绝对定位天然被舞台裁切）。
        //
        // 只在**舞台有画面**时出现：未接通板/暂停板/续接板是那个时刻的主角，
        // 一张脸浮在报错板上会读成"坏了还叠一层"（AGENTS §7 的降级纪律）。
        hasAnyVideo && !paused && !isDone && config?.interviewerAvatar !== 'off'
          ? h(AvatarPiP, {
            key: 'avatar',
            phase: turnPhase,
            // 挂哪一份形象：Host 解析过的 id（设置里选的那一份，不存在则默认）。
            avatarId: config?.interviewerStyle,
            // 嘴只跟**音频**走：这是 `useSpeech` 的真实播放状态（浏览器音色时
            // 也是 true，但那时音量恒为 0 → 嘴不动，诚实降级）。
            speaking: tts.speaking === true,
            // **非响应式**音量通道：每帧读，不进 state（AGENTS §11）。
            readLevel: tts.readLevel,
          })
          : null,
        hasAnyVideo
          ? null
          : h('div', {
            key: 'plate',
            'data-iv-plate': '1',
            style: {
              position: 'relative', flex: '1 1 auto',
              display: 'flex', flexDirection: 'column',
              background: 'radial-gradient(circle at 50% 36%, ' + C.plateTop + ' 0%, ' + C.plateMid + ' 62%, ' + C.plateLow + ' 100%)',
            },
          // 暂停板 / 恢复板优先于通用「未接通」板（§6.3/§6.6）：同一个
          // 舞台位、同一套设计语言，只是主角从「申请设备」换成「继续面试」。
          }, paused || isResumeState || isDone
            ? [paused ? pauseBoard : isDone ? continueBoard : resumeBoard]
            : [
            // 板子随舞台长高，内容整体居中；错误说明和按钮在同一列里——
            // 它们就是「权限被拒」唯一的出口，任何高度下都得点得到。
            h('div', {
              key: 'inner',
              style: {
                flex: '1 1 auto', margin: 'auto', width: '100%', maxWidth: 540,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                // 板子比内容高时整体居中——「待机」的主角在画面中间，不是在顶上。
                justifyContent: 'center',
                gap: 16, padding: '28px 30px 24px', textAlign: 'center',
              },
            }, [
              // **有错误时错误本身就是主角，姓名章让位。**
              // 窄面板下板子里同时塞着姓名章、错误框和按钮，高度不够——
              // 结果是姓名章被裁成半个圆，看着像坏了。
              media.error === undefined
                ? h('div', {
                  key: 'mono',
                  style: {
                    position: 'relative', width: 92, height: 92, flex: '0 0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  },
                }, [
                  h('span', {
                    key: 'r1',
                    className: 'iv-breathe',
                    style: {
                      position: 'absolute', inset: 0,
                      borderRadius: RADIUS.pill, border: `1px solid ${C.rule}`,
                    },
                  }),
                  h('span', {
                    key: 'r2',
                    style: {
                      position: 'absolute', inset: 9, borderRadius: RADIUS.pill,
                      border: `1px solid ${C.ruleSoft}`, background: C.ink850,
                    },
                  }),
                  h('span', {
                    key: 'm',
                    style: { position: 'relative', fontFamily: F.display, ...TYPE.display, color: C.boneDim },
                  }, initialsOf(title)),
                ])
                : null,
              h('div', {
                key: 'hdr',
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 12, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%',
                },
              }, [
                h('div', {
                  key: 't',
                  style: {
                    fontFamily: F.display, ...TYPE.title, color: C.bone,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260,
                  },
                }, title),
                h(ClockBadge, { key: 'clock', ...clockProps(false) }),
              ]),
              // 电平表：没画面也在跳，证明机器活着。出错时让位给错误说明。
              media.error === undefined
                ? h('div', {
                  key: 'level',
                  style: { display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' },
                }, [
                  h(Meta, { key: 'l' }, '输入电平'),
                  h(SegmentedMeter, { key: 'm', level: media.level }),
                ])
                : null,
              media.error === undefined
                ? h(Quiet, { key: 'q' }, hostVideoFailed
                  ? '宿主画面没接上——再点一次「关宿主摄像头」重开，或改用浏览器摄像头。'
                  : '摄像头未接通——面试照常进行，键盘输入随时可用')
                : null,
              // **桌面端：浏览器的摄像头是被宿主挡住的，改系统设置没用。**
              // 所以这里说清「还有一条路」——Host 侧用 ffmpeg 直接采。
              hostCamera.error !== undefined
                ? h('div', {
                  key: 'herr',
                  style: {
                    width: '100%', maxWidth: 460,
                    padding: '10px 14px', borderRadius: RADIUS.sm,
                    border: `1px solid ${TONES.amber.edge}`,
                    background: TONES.amber.wash,
                  },
                }, [
                  h('div', { key: 't', style: { ...TYPE.sub, color: C.amber, marginBottom: 4 } }, hostCamera.error.text),
                  h('div', { key: 'a', style: { ...TYPE.sub, color: C.boneFaint, lineHeight: 1.65 } }, hostCamera.error.action),
                ])
                : null,
              // 权限错误说清是谁挡的，以及现在能做什么（AGENTS §7 的红线）。
              media.error !== undefined
                ? h('div', {
                  key: 'err',
                  style: {
                    width: '100%', maxWidth: 460,
                    padding: '10px 14px', borderRadius: RADIUS.sm,
                    border: `1px solid ${media.error.kind === 'denied' ? TONES.tally.edge : TONES.amber.edge}`,
                    background: media.error.kind === 'denied' ? TONES.tally.wash : TONES.amber.wash,
                  },
                }, [
                  h('div', {
                    key: 't',
                    style: { ...TYPE.sub, color: media.error.kind === 'denied' ? C.tally : C.amber, marginBottom: 4 },
                  }, media.error.text),
                  h('div', { key: 'a', style: { ...TYPE.sub, color: C.boneFaint, lineHeight: 1.65 } }, media.error.action),
                ])
                : null,
              h('div', {
                key: 'act',
                style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 },
              }, [
                // **主按钮就是「开始面试」**：点它会把摄像头与麦克风一起准备好，
                // 再置 running（AGENTS §6.15）——不该让用户先点设备、再点开始。
                h('button', {
                  key: 'start',
                  style: S.btn('primary', preparing || media.busy),
                  title: '开始面试：先接通摄像头与麦克风，再让面试官开场',
                  onClick: () => { void startInterview() },
                }, preparing
                  ? '正在准备…'
                  : media.busy || hostCamera.busy ? '正在申请…' : '开始面试'),
                // 只申请设备（不开始）：权限被拒时的自查出口，永远留着。
                h('button', {
                  key: 'ask',
                  style: S.btn(false, media.busy),
                  title: '只申请设备：用来确认是权限挡着，还是设备坏了',
                  onClick: () => { void acquireMedia() },
                }, media.busy || hostCamera.busy
                  ? '正在申请…'
                  // 麦克风已经通了的时候，这按钮是去**补摄像头**的。
                  : (media.stream !== undefined && !hasVideo ? '补上摄像头' : '申请摄像头与麦克风')),
                // 桌面端的第二条路：让 Host 侧采。摄像头独占，只在没画面时出现。
                inDesktopHost() && !hasAnyVideo
                  ? h('button', {
                    key: 'host-cam',
                    style: S.btn(false, hostCamera.busy),
                    onClick: () => { void hostCamera.start() },
                  }, hostCamera.busy ? '正在开摄像头…' : (hostCamera.active ? '重连宿主摄像头' : '用宿主摄像头'))
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
        (recorder.recording || hostCamera.recording)
          ? h('div', { key: 'rec', style: { position: 'absolute', top: 14, left: 16 } }, h(Tally, { on: true }))
          : null,
        // 计时器：有画面时压在右上角；没画面时它进板子的标题行（见上）。
        hasAnyVideo ? h(ClockBadge, { key: 'clock-stage', ...clockProps(true) }) : null,
        lowerThird,
      ])

      /**
       * 右栏状态条：**一条，不是五行说明。**
       *
       * 每项一个 Pill，详情（谁的错、怎么改）在 `Hint` 里点开才看。
       * Pill 的颜色只说明状态：青玉=接通，灰=没接通，琥珀=有情况要处理。
       *
       * 数据驱动（`.map()`）而不是直接调用工厂：数组里的每个元素都要由
       * React 直接拿得到 `key`——手写工厂调用拿不到。
       */

      const micDetail = [
        h('div', { key: 's' }, micOn ? '麦克风已接通。' : '麦克风未接通。'),
        media.error !== undefined && !micOn
          ? h('div', { key: 'e', style: { color: C.amber } }, `${media.error.text}${media.error.action}`)
          : null,
        h('div', { key: 'k', style: { color: C.boneFaint } }, '麦克风不通也能面试：提问照常，回答用键盘。'),
      ]

      const cameraDetail = [
        h('div', { key: 's' }, hasAnyVideo
          ? (hasHostVideo ? '摄像头已接通（宿主采集）。' : '摄像头已接通（浏览器采集）。')
          : '摄像头未接通。'),
        hasAnyVideo
          ? null
          : h('div', { key: 'e' }, hostCamera.error !== undefined
            ? `${hostCamera.error.text}${hostCamera.error.action}`
            : media.error !== undefined
              ? `${media.error.text}${media.error.action}`
              : (inDesktopHost()
                ? '桌面端的浏览器摄像头被宿主挡下——点「用宿主摄像头」让 Host 直接采；也可以用键盘完成面试。'
                : '点「申请摄像头与麦克风」允许后会自动接上；没有画面也能面试，语音提问与文字回答照常。')),
      ]

      const asrDetail = [
        h('div', { key: 'm' }, `现在用：${asrLabel}`),
        asrInfo?.reason !== undefined ? h('div', { key: 'r' }, asrInfo.reason) : null,
        asr.error !== undefined ? h('div', { key: 'e', style: { color: C.amber } }, asr.error) : null,
        needsPrepare && asrInfo?.hint !== undefined
          ? h('div', { key: 'h', style: { color: C.amber } }, asrInfo.hint)
          : null,
        serverAsr && segmentAsr.timing !== undefined
          ? h('div', { key: 't', style: { color: C.jade } },
            `上一段：${segmentAsr.timing.audioSeconds.toFixed(1)}s 音频 → ${segmentAsr.timing.inferenceSeconds.toFixed(2)}s 转写`)
          : null,
        h('div', { key: 'k', style: { color: C.boneFaint } }, '识别不可用时用键盘，面试不会中断。'),
      ]

      const ttsDetail = [
        h('div', { key: 'm' }, `现在用：${ttsLabel}`),
        tts.notice !== undefined ? h('div', { key: 'n', style: { color: C.amber } }, tts.notice) : null,
        h('div', { key: 'k', style: { color: C.boneFaint } }, '播不出来时，问题仍以文字显示。'),
      ]

      // `acquireText`（分步反馈文案）已上移到舞台之前定义——恢复板也要用它。

      const statusRows = [
        { key: 'mic', tone: micOn ? 'jade' : 'faint', label: `${micOn ? '●' : '○'} 麦克风`, title: '麦克风状态与出路', detail: micDetail },
        { key: 'cam', tone: hasAnyVideo ? 'jade' : 'faint', label: `${hasAnyVideo ? '●' : '○'} 摄像头`, title: '摄像头状态与出路', detail: cameraDetail, narrow: true },
        { key: 'asr', tone: asr.error !== undefined ? 'amber' : 'faint', label: `${asr.error === undefined ? '○' : '●'} 识别 ${asrMode === 'host' ? '宿主' : asrMode === 'server' ? '服务端' : asrMode === 'none' ? '关' : '浏览器'}`, title: '识别链路与出路', detail: asrDetail },
        { key: 'tts', tone: tts.notice !== undefined ? 'amber' : 'faint', label: `${tts.notice === undefined ? '○' : '●'} 播报 ${ttsShort}`, title: '播报链路与出路', detail: ttsDetail, narrow: true },
      ]

      const statusStrip = h('div', {
        key: 'status',
        // 2×2 的仪表簇：右栏只有 396px，四个状态一行排不下——
        // 与其让它们自顾自折行，不如排成对齐的两列。
        style: {
          display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8, alignItems: 'center',
        },
      }, statusRows.map(row => h(Hint, {
        key: row.key,
        label: h(Pill, {
          tone: row.tone,
          // 品牌名保留自己的大小写：`MINIMAX` 是代码，`MiniMax` 才是产品。
          ...(row.key === 'tts' ? { style: { textTransform: 'none', letterSpacing: '0.06em' } } : {}),
        }, row.label),
        title: row.title,
        // 右栏在 `overflow: hidden` 的容器里：**右列**的 Pill 只有半栏宽度，
        // 弹层要按那个宽度收窄，否则右边缘会把文字裁掉。
        children: h('div', { style: row.narrow === true ? { width: 150 } : undefined }, row.detail),
      })))

      const mediaButtons = h('div', { key: 'gr', style: S.row }, [
        h('button', {
          key: 'cam',
          style: S.btn(false, false),
          onClick: () => (media.stream === undefined ? void acquireMedia() : void media.stop()),
        }, media.stream === undefined
          ? (media.busy || hostCamera.busy ? '正在申请…' : '开摄像头与麦克风')
          : (hasVideo ? '关摄像头' : '关麦克风')),
        inDesktopHost()
          ? h('button', {
            key: 'host-cam',
            style: S.btn(hasHostVideo ? 'primary' : false, hostCamera.busy),
            onClick: () => (hasHostVideo ? void hostCamera.stop() : void hostCamera.start()),
          }, hasHostVideo ? '关宿主摄像头' : '开宿主摄像头')
          : null,
        config?.recordVideo === false
          ? null
          : hasHostVideo
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
        recorder.clip !== undefined && config?.recordVideo !== false
          ? h('button', { key: 'save', style: S.btn('primary', false), onClick: saveClip }, hasVideo ? '保存录像' : '保存录音')
          : null,
      ])

      const voiceButtons = h('div', { key: 'gr', style: S.row }, [
        config?.recordAudio === false
          ? null
          : h('button', {
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
          ? h('button', { key: 'prep', style: S.btn('primary', false), onClick: prepareSpeech }, '准备语音模型')
          : null,
        audioRecorder.clip !== undefined
          ? h('button', { key: 'trans', style: S.btn('primary', false), onClick: transcribeClip }, '识别这段录音')
          : null,
      ])

      const fluencyLine = lastFluency === undefined
        ? null
        : h('div', {
          key: 'flu',
          title: `长停顿 ${lastFluency.pauseCount} 次（最长 ${(lastFluency.longestPauseMs / 1000).toFixed(1)}s）`
            + ` · 口头语 ${lastFluency.fillerCount} 次 · 重复 ${lastFluency.repeats} 次`
            + ' · 观察值，不是评分',
          style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
        }, [
          h(Meta, { key: 'l' }, '语流'),
          h('span', {
            key: 'v',
            style: { ...TYPE.sub, fontFamily: F.mono, color: C.boneDim, letterSpacing: '0.02em' },
          }, `说 ${(lastFluency.speechMs / 1000).toFixed(1)}s · 停 ${(lastFluency.silenceMs / 1000).toFixed(1)}s · 语速 ${lastFluency.speechRate}`),
        ])

      const controlPanel = h(Panel, {
        key: 'ctrl',
        tone: 'raised',
        pad: 16,
        style: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 12 },
      }, [
        statusStrip,
        h('div', { key: 'hair1', style: { height: 1, background: C.ruleSoft } }),
        h('div', { key: 'g-cam' }, [
          h(Meta, { key: 'l', style: { display: 'block', marginBottom: 6 } }, '画面'),
          mediaButtons,
        ]),
        h('div', { key: 'g-voice' }, [
          h(Meta, { key: 'l', style: { display: 'block', marginBottom: 6 } }, '声音'),
          voiceButtons,
        ]),
        // 自动/手动总开关（§4.3）：「我现在就想切」是面试进行中的即时需求，
        // 不该去设置页翻三层。开关只管自动判定，不管派活——手动发送同样
        // 唤醒面试官。切换即时生效并写入 settings（下次面试保持）。
        h('div', { key: 'g-mode' }, [
          h(Meta, { key: 'l', style: { display: 'block', marginBottom: 6 } }, '回答节奏'),
          h('div', { key: 'r', style: { ...S.row } }, [
            h('button', {
              key: 'auto',
              'aria-pressed': answerModeSetting === 'auto',
              title: '自动：说完约 2 秒静音后自动提交并唤醒面试官；倒计时内重新开口即取消',
              style: S.btn(answerModeSetting === 'auto' ? 'primary' : false, false),
              onClick: () => setAnswerMode('auto'),
            }, '自动'),
            h('button', {
              key: 'manual',
              'aria-pressed': answerModeSetting === 'manual',
              title: '手动：答完自己点「提交回答」——手动发送同样会唤醒面试官',
              style: S.btn(answerModeSetting === 'manual' ? 'primary' : false, false),
              onClick: () => setAnswerMode('manual'),
            }, '手动'),
            // 判定武装状态一眼可见：armed 才有「说完自动交」。
            autoDetectActive
              ? h(Meta, {
                key: 's',
                tone: segmentAsr.active ? 'jade' : 'amber',
              }, segmentAsr.active
                ? (turnPhase === 'listening' ? '判定武装' : '判定挂起')
                : '识别未开')
              : null,
          ]),
        ]),
        h('div', { key: 'hair2', style: { height: 1, background: C.ruleSoft } }),
        h('div', {
          key: 'meter',
          style: { display: 'flex', alignItems: 'center', gap: 10 },
        }, [
          h(Meta, { key: 'l' }, '输入电平'),
          h('div', { key: 'm', style: { flex: '1 1 auto', minWidth: 0 } }, h(SegmentedMeter, { level: media.level })),
          h(Meta, { key: 's', tone: asr.active ? 'jade' : undefined }, asr.active ? '识别中' : '待命'),
        ]),
        acquireText === undefined
          ? null
          : h(Quiet, {
            key: 'stage',
            tone: acquireText.startsWith('✓') ? 'ok' : 'muted',
          }, acquireText),
        fluencyLine,
        asr.error !== undefined ? h(Quiet, { key: 'ae', tone: 'warn' }, asr.error) : null,
        // 自动不可用/降级必须**说出来**（§4.4：不许静默换链路，同理不许静默降级）。
        autoHint === undefined ? null : h(Quiet, { key: 'ah', tone: 'warn' }, autoHint),
        // 长沉默（§3.3）：auto 已把事实派给助手；manual 只提示、不派活。
        longSilence === undefined
          ? null
          : h(Quiet, { key: 'ls', tone: 'muted' }, longSilence.dispatched === true
            ? `已沉默约 ${longSilence.seconds} 秒：面试官正在换更小的切口重问。`
            : `已沉默约 ${longSilence.seconds} 秒——可以直接打字说想法，或开口请面试官换个问法。`),
        // 播报回落**说出来**：不静默换链路，也不让人以为听到的是模型。
        tts.notice !== undefined ? h(Quiet, { key: 'tn', tone: 'warn' }, tts.notice) : null,
        asr.interim !== ''
          ? h('div', {
            key: 'ai',
            style: { ...TYPE.sub, color: C.boneFaint, fontStyle: 'italic' },
          }, asr.interim)
          : null,
      ])

      const transcriptPanel = h(Panel, {
        key: 'tr',
        tone: 'raised',
        pad: 16,
        style: stacked
          ? { maxHeight: 420, overflowY: 'auto' }
          : { flex: '1 1 auto', minHeight: 240, overflowY: 'auto' },
      }, [
        h('div', {
          key: 'h',
          style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
        }, [
          h(Meta, { key: 't' }, '速记'),
          h(Meta, { key: 'n' }, `${transcript.length} 轮`),
        ]),
        transcript.length === 0
          // 空速记不能只是一行小字挂在半空的浮起面板里——那会让右栏
          // 「只剩按钮 + 一大片空」，立体感整个塌掉。给一个占满的凹位。
          ? h('div', {
            key: 'e',
            style: {
              flex: '1 1 auto', minHeight: 96, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            },
          }, h(Empty, { key: 'empty', title: '还没有速记' }))
          : h('div', { key: 'l' }, transcript.map((row, index) => {
            const asked = row.role === 'interviewer'
            const answered = row.role === 'candidate'
            return h('div', {
              key: `${row.ts}-${index}`,
              style: {
                display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0',
                borderBottom: `1px solid ${C.ruleSoft}`,
              },
            }, [
              h(Meta, { key: 'r', tone: asked ? 'amber' : answered ? 'jade' : undefined },
                asked ? '问' : answered ? '答' : '系统'),
              h('span', {
                key: 'x',
                style: { flex: '1 1 auto', minWidth: 0, ...TYPE.sub, color: C.boneDim, lineHeight: 1.7 },
              }, row.text),
              h(Meta, { key: 't', style: { flex: '0 0 auto' } }, formatTime(row.ts)),
            ])
          })),
      ])

      const answerCard = h(Panel, {
        key: 'ans',
        tone: 'raised',
        pad: 16,
        style: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8 },
      }, [
        h('div', {
          key: 'h',
          style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
        }, [
          h(Meta, { key: 'l' }, '我的回答'),
          // 状态 chip 跟着话轮相态走：舞台演出来的等待，这里给出名字。
          h(Meta, {
            key: 's',
            tone: paused ? 'amber' : isDone ? undefined : running ? (turnPhase === 'listening' ? 'jade' : 'amber') : undefined,
          }, paused
            ? '已暂停'
            : isDone
              // 已结束 ≠ 未开始：这一场聊过，只是结束了——答案卡不该把它说成还没开始。
              ? '已结束'
              : !running
                ? '未开始'
                : turnPhase === 'questioning'
                  ? '正在播报提问'
                  : turnPhase === 'listening'
                    ? '请作答'
                    : turnPhase === 'submitting'
                      ? '即将自动提交'
                      : turnPhase === 'thinking'
                        ? '面试官思考中'
                        : '进行中'),
        ]),
        // 反悔窗口（§3.2）：草稿区上沿一条窄倒计时进度条。重新开口自动
        // 取消；点「取消并修改」= 用户意图优先，本会话切手动。
        countdown === undefined
          ? null
          : h('div', { key: 'cd', style: { display: 'flex', flexDirection: 'column', gap: 5 } }, [
            h('div', {
              key: 'bar',
              style: { height: 3, borderRadius: 2, background: C.ruleSoft, overflow: 'hidden' },
            }, h('div', {
              key: 'fill',
              style: {
                height: '100%',
                width: `${Math.max(0, Math.min(100, (countdown.remaining / 2000) * 100))}%`,
                background: C.jade,
                transition: 'width 120ms linear',
              },
            })),
            h('div', { key: 't', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
              h(Meta, { key: 'm', tone: 'jade' }, `回答完成，${(Math.max(0, countdown.remaining) / 1000).toFixed(1)} 秒后自动提交`),
              h(Meta, { key: 'h', tone: 'faint' }, '重新开口即取消'),
              h('button', {
                key: 'x',
                style: { ...S.btn(false, false), padding: '3px 10px', marginLeft: 'auto' },
                onClick: () => cancelCountdown('edit'),
              }, '取消并修改'),
            ]),
          ]),
        h('textarea', {
          key: 't',
          style: { ...S.textarea, minHeight: 92 },
          value: answer,
          placeholder: '说话或打字…',
          onChange: event => {
            // 倒计时内打字 = 要修改：取消并本会话切手动（§3.2）。
            if (countdownRef.current !== undefined) cancelCountdown('edit')
            setAnswer(event.target.value)
          },
          onFocus: () => {
            if (countdownRef.current !== undefined) cancelCountdown('edit')
          },
        }),
        // 派活失败必须可见、可重发（§4.4）：回答已落盘不回滚，
        // 重发用原 requestId——宿主幂等去重，不会让助手跑两遍。
        dispatchFailure === undefined
          ? null
          : h('div', {
            key: 'df',
            style: {
              display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
              padding: '8px 12px', borderRadius: RADIUS.sm,
              border: `1px solid ${TONES.amber.edge}`,
              background: TONES.amber.wash,
            },
          }, [
            h('div', {
              key: 't',
              style: { ...TYPE.sub, color: C.amber, minWidth: 0, flex: '1 1 auto', lineHeight: 1.6 },
            }, `助手没收到这一轮：${dispatchFailure.error ?? ''}`),
            h('button', {
              key: 'r',
              style: { ...S.btn(false, false), flex: '0 0 auto' },
              title: dispatchFailure.hint ?? '重新发给助手',
              onClick: () => { void retryDispatch() },
            }, '重新发给助手'),
          ]),
        // 报告派出去之后：loading 由 Host 的 task 状态驱动（成功即消失，
        // 失败/超时带原因与下一步），客户端不自己计时——没有终点的转圈是假活。
        h(AgentTaskRow, {
          key: 'report-task',
          task: reportTask,
          waitingLabel: '助手正在写报告…写好后会自动出现在「报告」页',
          retryLabel: '再派一次',
          onRetry: () => { void dispatchReport() },
          onDismiss: () => { void dismissTask('report') },
        }),
        h('div', { key: 'a', style: { ...S.row } }, [
          // **手动发送永远在**（§7 纪律：键盘兜底是硬纪律，自动只是叠加）。
          // 但**不在面试中就不收回答**：暂停 / 已结束 / 还没开始时提交，
          // 只会写进一条没有下文的转录——那正是要清理的脏片段。
          h('button', {
            key: 's',
            style: S.btn('primary', answer.trim() === '' || !running),
            title: running
              ? undefined
              : paused
                ? '面试暂停中：先点「继续面试」再作答'
                : isDone
                  ? '这场已结束：点「续接面试」接着面，再提交回答'
                  : '还没开始：点「开始面试」再作答',
            onClick: () => { void submitAnswer(false) },
          }, '提交回答'),
          h('button', { key: 'c', style: S.btn(false, answer.trim() === ''), onClick: copyAnswer }, '复制'),
          h('div', { key: 'sp', style: { marginLeft: 'auto', display: 'flex', gap: 8 } }, [
            // 面板永远保留「暂停」「手动发送」与「结束面试」的物理出口（§3 规则 3）。
            running
              ? h('button', {
                key: 'p',
                style: S.btn(false, false),
                title: '暂停：设备关灯、计时停走；助手会话留在原地，继续时上下文不丢',
                onClick: () => { void pauseInterview() },
              }, '暂停面试')
              : null,
            running
              ? h('button', { key: 'f', style: S.btn(false, false), onClick: () => { void finishInterview() } }, '结束面试')
              : paused
                ? h('button', { key: 'rs', style: S.btn('primary', false), onClick: () => { void resumeInterview() } }, '继续面试')
                : isDone
                  // 已结束：接着面，而不是重开一场（转录/底稿/计时都还在）。
                  ? h('button', {
                    key: 'cs',
                    style: S.btn('primary', preparing),
                    title: '续接：从上一问接着问，中断的时间不算面试时长',
                    onClick: () => { void continueInterview() },
                  }, preparing ? '正在准备…' : '续接面试')
                  : h('button', {
                    key: 'st',
                    style: S.btn('primary', preparing || media.busy),
                    title: '开始面试：先接通摄像头与麦克风，再让面试官开场',
                    onClick: () => { void startInterview() },
                  }, preparing ? '正在准备…' : '开始面试'),
            !running && !paused && !reportReady
              ? h('button', {
                key: 'report',
                style: S.btn(tooShortForReport ? false : 'primary', reportWaiting),
                title: reportWaiting
                  ? '助手正在写，写好后会自动出现在「报告」页'
                  : tooShortForReport
                    ? '这场太短，报告分析不出什么；真需要可以让助手在对话里写'
                    : '让助手写事后分析报告',
                onClick: () => { void dispatchReport() },
              }, reportWaiting ? '助手正在写报告…' : tooShortForReport ? '太短，仍可生成' : '生成事后报告')
              : null,
          ]),
        ]),
      ])

      return h('div', {
        ref: liveRef,
        'data-iv-live': '1',
        style: stacked
          // 窄：一列，舞台在上、控件在下，整页内部滚。
          ? { display: 'flex', flexDirection: 'column', gap: 14, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }
          // 宽：左右两栏。**内容放不下时整块可滚**（高度不够时总有路走），
          // 但舞台有 minHeight，不会被压成一条。
          : { display: 'flex', gap: 16, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' },
      }, [
        // ── 左：舞台 + 回答 ────────────────────────────────────────────
        h('div', {
          key: 'left',
          style: {
            flex: stacked ? '0 0 auto' : '1 1 auto',
            minWidth: 0,
            display: 'flex', flexDirection: 'column', gap: 14,
          },
        }, [stage, answerCard]),

        // ── 右：状态条 + 控件 + 速记 ──────────────────────────────────
        h('div', {
          key: 'rail',
          'data-iv-rail': '1',
          style: stacked
            ? { flex: '0 0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }
            // 宽：右栏**按比例让位**。舞台才是这一页的主角——以前这里写死 396px，
            // 宿主侧边栏一展开，被压扁的永远是视频区，而控件区一寸不让。
            // 现在：最窄 268（按钮还排得下），最宽 396（宽屏不浪费），中间取 32%。
            : {
              flex: '0 0 auto',
              width: 'clamp(268px, 32%, 396px)',
              display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
            },
        }, [controlPanel, transcriptPanel]),
      ])
    }

    /**
     * The report view: reading layout first, instrument readings second.
     *
     * 报告是**评估表**：衬线大标题 + 13.5/1.85 的正文，一列读下来；
     * 统计收成一行仪表读数，别让数字和正文抢注意力。
     */
    function ReportView(props) {
      const { session, notify, onChanged } = props
      const report = session?.report ?? ''
      const durationMs = session?.stats?.durationMs ?? 0
      const tooShortForReport = durationMs > 0 && durationMs < 3 * 60 * 1000
      const reportTask = session?.agentTasks?.report
      const reportWaiting = reportTask?.status === 'waiting'
      const dismissTask = async kind => {
        try {
          await apiPost('agent/task', { sessionId: session?.session?.id, kind, action: 'dismiss' })
          onChanged?.()
        } catch (failure) {
          notify('没清掉', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }
      const dispatchReport = async () => {
        if (reportWaiting) return
        try {
          const result = await apiPost('agent/report', { sessionId: session?.session?.id })
          notify('已让助手写报告', result?.message ?? '产出后会自动出现在这里。', 'ok')
          onChanged?.()
        } catch (failure) {
          notify('派不出去', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }
      /** 看完报告还能接着面：续接回面试间（转录、底稿、计时都保留）。 */
      const continueSession = async () => {
        try {
          await apiPost(`sessions/${session?.session?.id}/continue`, {})
          notify('续接上了', '去「面试中」，助手会从上一问接着问。', 'ok')
          onChanged?.()
          props.onGoLive?.()
        } catch (failure) {
          notify('没法续接', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }

      const stats = [
        { key: 'st-asked', label: '提问', value: session?.stats?.asked ?? 0 },
        { key: 'st-answered', label: '回答', value: session?.stats?.answered ?? 0 },
        { key: 'st-cover', label: '考点覆盖', value: `${session?.stats?.checklistProbed ?? 0}/${session?.stats?.checklistTotal ?? 0}` },
        { key: 'st-adj', label: '底稿调整', value: session?.stats?.adjustments ?? 0 },
        { key: 'st-dur', label: '时长', value: formatClock(durationMs) },
      ]

      const recordings = session?.recordings ?? []

      return h('div', {
        style: { maxWidth: 840, margin: '0 auto', width: '100%' },
      }, [
        h('div', {
          key: 'head',
          style: { display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 18 },
        }, [
          h('div', { key: 'l', style: { minWidth: 0, flex: '1 1 auto' } }, [
            h(Meta, { key: 'e', className: 'iv-tick' }, '评估表'),
            h('div', {
              key: 't',
              style: { ...S.title, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            }, session?.session?.title ?? '面试报告'),
            h('div', { key: 'm', style: { ...S.row, marginTop: 8 } }, [
              h(Meta, { key: 'd' }, formatClock(durationMs)),
              h(Meta, { key: 'c' }, report !== '' ? `${report.length} 字` : '待生成'),
            ]),
          ]),
          h('div', {
            key: 'acts',
            style: { marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
          }, [
            // 报告不是终点：这场面试还能接着面（AGENTS §6.14）。
            session?.session?.status === 'done'
              ? h('button', {
                key: 'cont',
                style: S.btn(false, false),
                title: '续接这场面试：转录、底稿、计时都保留，接着上一问继续',
                onClick: () => { void continueSession() },
              }, '续接面试')
              : null,
            report === ''
              ? null
              : h('button', {
                key: 're',
                style: S.btn(false, reportWaiting),
                title: '让助手重新写一份',
                onClick: () => { void dispatchReport() },
              }, reportWaiting ? '生成中…' : '重新生成'),
          ]),
        ]),

        h(AgentTaskRow, {
          key: 'report-task',
          task: reportTask,
          waitingLabel: '助手正在写报告…写好后会自动出现在这里',
          retryLabel: '再派一次',
          onRetry: () => { void dispatchReport() },
          onDismiss: () => { void dismissTask('report') },
          style: { marginTop: 0, marginBottom: 18 },
        }),

        h('div', {
          key: 'stats',
          style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 },
        }, stats.map(row => statTile(row))),

        report !== ''
          ? h(Panel, {
            key: 'body',
            tone: 'plain',
            pad: 0,
            style: { padding: '28px 34px' },
          }, h(Markdown, { key: 'md', text: report }))
          : h('div', { key: 'empty', style: { display: 'flex', flexDirection: 'column', gap: 12 } }, [
            h(Empty, {
              key: 'e',
              title: tooShortForReport ? `这场只有 ${formatClock(durationMs)}` : '还没有报告',
              action: h('button', {
                key: 'go',
                style: S.btn('primary', reportWaiting),
                onClick: () => { void dispatchReport() },
              }, reportWaiting ? '助手正在写报告…' : tooShortForReport ? '仍然生成' : '让助手写报告'),
            }),
            tooShortForReport
              ? h(Quiet, { key: 'q', tone: 'warn' }, '太短的一场分析不出什么；真需要就点「仍然生成」。')
              : null,
          ]),

        recordings.length === 0
          ? null
          : h('div', { key: 'files', style: { marginTop: 18 } }, [
            h(Meta, { key: 'h', style: { display: 'block', marginBottom: 6 } }, '卷宗材料'),
            h('div', { key: 'l' }, recordings.map(item => h('div', {
              key: item.name,
              style: {
                display: 'flex', gap: 12, alignItems: 'center', padding: '7px 0',
                borderBottom: `1px solid ${C.ruleSoft}`,
              },
            }, [
              h(Pill, { key: 'k', tone: item.kind === 'video' ? 'amber' : 'jade' }, item.kind === 'video' ? '录像' : '录音'),
              h('span', {
                key: 'n',
                style: {
                  flex: '1 1 auto', minWidth: 0, ...TYPE.sub, color: C.boneDim,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                },
              }, item.name),
              h(Meta, { key: 's' }, formatBytes(item.bytes)),
            ]))),
          ]),
      ])
    }

/**
 * 设置页：**能改的都能生效，不能改的明确说只读。**
 *
 * 这一页不是 DSH 设置页的替代品，是「模拟面试间」自己的控制台：
 *
 *   可改：语音识别链路 / 播报模型与音色 / 摄像头采集后端与路径 /
 *         录像与录音开关 / 面试间保护开关
 *   只读：数据根、产物清单、宿主模型目录——这些是"事实"，不是"偏好"
 *
 * 写入走 `POST /settings`（白名单 + 规格校验）；**配置文件里显式写过的项
 * 会拒绝面板覆盖，并说明原因**，不会假装保存成功。
 *
 * 语音两区按 `docs/DESIGN.md §9` 做成「配 → 存 → 测 → 用」闭环：
 *   现在用（一行） / 服务下拉（来自 `GET voice/presets`，前端不硬编码）
 *   / 端点·模型·语言 / 凭据（已有下拉 + 替换 + 清除，密钥只进不出）
 *   / 一个真跑的测试按钮（失败给具体原因与下一步）。
 */
function SettingsView(props) {
  const { session, notify, theme, themeFollow, hostScheme, onChangeTheme, onChangeThemeFollow } = props
  const sessionId = session?.session?.id
  const snapshot = usePoll(
    () => apiGet('settings', sessionId === undefined ? undefined : { session: sessionId }),
    5000,
    [sessionId],
  )
  const data = snapshot.data
  const [busy, setBusy] = useState('')
  const [diagnosis, setDiagnosis] = useState(undefined)
  // 空场次清理同样两步确认。
  const [purgeArm, setPurgeArm] = useState(false)
  const [form, setForm] = useState(undefined)
  // 语音测试的最近一次结果（成功/失败都要留在界面上，失败是出路不是弹窗）。
  const [asrTest, setAsrTest] = useState(undefined)
  const [ttsTest, setTtsTest] = useState(undefined)
  // 正在录 2 秒样本（测试识别用）。
  const [recording, setRecording] = useState(false)
  // 替换密钥：{kind, ref, value}。value 只在这里活到保存成功为止。
  const [secretEdit, setSecretEdit] = useState(undefined)
  // 清除要两步（防手滑，不是防呆）。
  const [clearArm, setClearArm] = useState('')

  // 首次拿到快照时，用**面板设置**填表单（没设置过的项留空，让 placeholder 显示生效值）。
  useEffect(() => {
    if (form !== undefined || data === undefined) return
    const settings = data.settings ?? {}
    setForm({
      asrProvider: settings.asrProvider ?? 'auto',
      asrBaseUrl: settings.asrBaseUrl ?? '',
      asrModel: settings.asrModel ?? '',
      asrApiKeyEnv: settings.asrApiKeyEnv ?? '',
      asrGroupId: settings.asrGroupId ?? '',
      asrLanguage: settings.asrLanguage ?? '',
      ttsProvider: settings.ttsProvider ?? 'auto',
      ttsModel: settings.ttsModel ?? '',
      ttsVoice: settings.ttsVoice ?? '',
      ttsBaseUrl: settings.ttsBaseUrl ?? '',
      ttsApiKeyEnv: settings.ttsApiKeyEnv ?? '',
      ttsGroupId: settings.ttsGroupId ?? '',
      ttsFormat: settings.ttsFormat ?? 'mp3',
      ttsRate: settings.ttsRate === undefined ? '' : String(settings.ttsRate),
      ttsStyle: settings.ttsStyle ?? '',
      cameraBackend: settings.cameraBackend ?? 'auto',
      ffmpegPath: settings.ffmpegPath ?? '',
      chromiumPath: settings.chromiumPath ?? '',
      recordVideo: settings.recordVideo,
      recordAudio: settings.recordAudio,
      guardEnabled: settings.guardEnabled,
      // 回答节奏（docs/TURN-TAKING.md §4.2）：默认 manual——与升级前行为一致。
      answerMode: settings.answerMode ?? 'manual',
      turnEndSilenceMs: settings.turnEndSilenceMs === undefined ? '' : String(settings.turnEndSilenceMs),
      // 虚拟面试官：有效值优先（配置文件写 off 时，面板不该显示成开）。
      interviewerAvatar: (data.effective?.interviewerAvatar ?? settings.interviewerAvatar) !== 'off',
      // 用哪一份形象：Host 解析过的那一个（未知/空都已经是默认那份）。
      interviewerStyle: data.avatar?.selected ?? '',
    })
  }, [data, form])

  const set = useCallback((key, value) => setForm(previous => ({ ...previous, [key]: value })), [])

  const save = useCallback(async (patch, label, options = {}) => {
    const cleaned = {}
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      if (key === 'ttsRate' || key === 'turnEndSilenceMs') {
        if (value === '') continue
        const number = Number(value)
        if (!Number.isFinite(number)) {
          notify('没保存', key === 'ttsRate' ? '语速必须是数字' : '静音阈值必须是数字（毫秒）', 'error')
          return
        }
        cleaned[key] = number
        continue
      }
      // 语音区允许把某一项改回空（= 用该服务默认值）；其余区空串 = 不动。
      if (value === '' && options.allowEmpty !== true) continue
      cleaned[key] = value
    }
    setBusy(label)
    try {
      const result = await apiPost('settings', cleaned)
      const invalid = result?.invalid ?? []
      const ignored = result?.ignored ?? []
      const problems = [...invalid, ...ignored]
      notify(
        problems.length === 0 ? '已保存' : '部分没保存',
        problems.length === 0 ? undefined : problems.map(item => item.reason).join('；'),
        problems.length === 0 ? 'ok' : 'error',
      )
      snapshot.refresh()
    } catch (failure) {
      notify('没保存', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [notify, snapshot])

  const runDiagnose = useCallback(async () => {
    setBusy('diagnose')
    try {
      const result = await apiGet('camera/diagnose')
      setDiagnosis(result)
      notify(result.ok ? '摄像头可用' : '摄像头不可用', result.ok ? undefined : (result.hint ?? result.reason ?? ''), result.ok ? 'ok' : 'error')
    } catch (failure) {
      notify('自检失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [notify])

  const purgeEmpty = useCallback(async () => {
    if (!purgeArm) {
      setPurgeArm(true)
      setTimeout(() => setPurgeArm(false), 5000)
      return
    }
    setBusy('purge')
    try {
      const result = await apiPost('sessions/cleanup', {})
      const removed = (result?.removed ?? []).length
      notify('已清理', `${removed} 场空面试已从磁盘删除。`, 'ok')
      setPurgeArm(false)
      snapshot.refresh()
    } catch (failure) {
      notify('清理失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [purgeArm, notify, snapshot])

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
  }, [notify, snapshot])

  /** 写一把密钥到宿主凭据存储。成功立刻清空输入框（值不留在这个页面的状态里）。 */
  const saveSecret = useCallback(async () => {
    const edit = secretEdit
    if (edit === undefined) return
    if (edit.ref === '') { notify('没保存', '先选一个服务或凭据名。', 'error'); return }
    if (String(edit.value).trim() === '') {
      notify('没保存', '密钥是空的；要删除已保存的密钥请用「清除」。', 'error')
      return
    }
    setBusy('secret')
    try {
      const result = await apiPost('voice/credentials', { action: 'set', ref: edit.ref, value: edit.value })
      setSecretEdit(undefined)
      if (result?.ok === false) {
        notify('没保存', [result.reason, result.hint].filter(part => part !== undefined && part !== '').join(' '), 'error')
        return
      }
      notify('已保存', undefined, 'ok')
      snapshot.refresh()
    } catch (failure) {
      notify('没保存', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [secretEdit, notify, snapshot])

  /** 清除凭据：第一次点只是上膛。 */
  const clearCredential = useCallback(async (kind, ref) => {
    if (ref === '') { notify('没清除', '先选一个服务或凭据名。', 'error'); return }
    if (clearArm !== kind) {
      setClearArm(kind)
      setTimeout(() => setClearArm(''), 5000)
      return
    }
    setClearArm('')
    setBusy('secret')
    try {
      const result = await apiPost('voice/credentials', { action: 'clear', ref })
      if (result?.ok === false) {
        notify('没清掉', [result.reason, result.hint].filter(part => part !== undefined && part !== '').join(' '), 'error')
        return
      }
      notify('已清除', result?.hint, result?.configured === true ? 'error' : 'ok')
      snapshot.refresh()
    } catch (failure) {
      notify('没清掉', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [clearArm, notify, snapshot])

  /** 现场录 2 秒 → 16 kHz 单声道 WAV（识别服务要的是波形，不是 webm）。 */
  const recordTestSample = useCallback(async () => {
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined
      || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('这个环境没有麦克风接口。')
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    try {
      const Recorder = typeof window === 'undefined' ? undefined : window.MediaRecorder
      if (typeof Recorder !== 'function') throw new Error('这个环境不支持录音（MediaRecorder）。')
      const chunks = []
      const recorder = new Recorder(stream)
      const stopped = new Promise(resolve => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
      })
      recorder.ondataavailable = event => {
        if (event.data !== undefined && event.data !== null && event.data.size > 0) chunks.push(event.data)
      }
      recorder.start()
      setRecording(true)
      await new Promise(resolve => setTimeout(resolve, 2000))
      recorder.stop()
      const blob = await stopped
      const decoded = await decodeToMono16k(await blob.arrayBuffer())
      return { dataBase64: bufferToBase64(encodeWav(decoded.samples, decoded.sampleRate)), mimeType: 'audio/wav' }
    } finally {
      setRecording(false)
      stream.getTracks().forEach(track => track.stop())
    }
  }, [])

  /** 播报测试：**真跑**当前链路；浏览器音色那条 Host 合成不了，就用面板自己的语音播一句。 */
  const testTts = useCallback(async () => {
    setBusy('tts-test')
    setTtsTest(undefined)
    try {
      const result = await apiPost('voice/test', { kind: 'tts' })
      if (result?.ok === true && typeof result.audioBase64 === 'string' && result.audioBase64 !== '') {
        const url = URL.createObjectURL(base64ToBlob(result.audioBase64, result.mimeType))
        const audio = new Audio(url)
        audio.onended = () => URL.revokeObjectURL(url)
        await audio.play().catch(() => { /* 自动播放被拦：链路本身已通，如实说 */ })
        setTtsTest({
          ok: true,
          line: `${result.label || result.provider || '模型'} · ${Math.round(result.ms ?? 0)} ms · 已播放`,
          detail: [result.model, result.voice].filter(part => part !== undefined && part !== '').join(' · '),
        })
        return
      }
      // Host 侧没有可合成音频 = 这条链路是浏览器系统音色：**真播一次**再回报。
      if (result?.mode === 'browser' && typeof window !== 'undefined'
        && typeof window.speechSynthesis?.speak === 'function'
        && typeof SpeechSynthesisUtterance === 'function') {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance('这是一次语音播报测试。听到这句话，说明面试官的声音已经接通。'))
        setTtsTest({ ok: true, line: '浏览器系统音色 · 已播放', detail: result.reason ?? '' })
        return
      }
      setTtsTest({
        ok: false,
        line: `失败 · ${result?.mode ?? '未知链路'}${result?.provider === undefined ? '' : ` · ${result.provider}`}`,
        detail: [result?.reason, result?.hint].filter(part => part !== undefined && part !== '').join(' '),
      })
    } catch (failure) {
      setTtsTest({ ok: false, line: '失败', detail: failure instanceof Error ? failure.message : String(failure) })
    } finally {
      setBusy('')
    }
  }, [])

  /** 识别测试：录 2 秒 → 走完整回落链 → 回显结果、链路、耗时、每次尝试。 */
  const testAsr = useCallback(async () => {
    setBusy('asr-test')
    setAsrTest(undefined)
    try {
      const sample = await recordTestSample()
      const result = await apiPost('voice/test', { kind: 'asr', dataBase64: sample.dataBase64, mimeType: sample.mimeType })
      const attempts = Array.isArray(result?.attempts) ? result.attempts : []
      const attemptText = attempts.map(item => `${item.mode === 'host' ? '宿主' : '服务端'}：${item.ok ? '通过' : (item.reason ?? '失败')}`).join('；')
      setAsrTest({
        ok: result?.ok === true,
        line: result?.ok === true
          ? `${result.protocol === undefined ? (result.mode ?? '') : result.protocol} · ${Math.round(result.ms ?? 0)} ms`
          : `失败 · ${result?.mode ?? '未知链路'}`,
        text: result?.ok === true ? (result.text ?? '') : '',
        detail: [result?.reason, result?.hint, attemptText].filter(part => part !== undefined && part !== '').join(' '),
      })
    } catch (failure) {
      setAsrTest({
        ok: false,
        line: '录不到音频',
        detail: failure instanceof Error ? failure.message : String(failure),
      })
    } finally {
      setBusy('')
    }
  }, [recordTestSample])

  if (data === undefined || form === undefined) {
    return h('div', { style: { ...S.card, padding: '18px 20px', color: C.boneFaint, ...TYPE.sub } },
      snapshot.error === undefined ? '正在读取…' : `读不到设置：${snapshot.error}`)
  }

  const effective = data.effective ?? {}
  const voice = data.voice ?? {}
  const asr = voice.asr ?? {}
  const tts = voice.tts ?? {}
  const camera = data.camera ?? {}
  const backends = data.backends ?? {}
  const model = data.speechModel ?? {}
  // 预设表与凭据清单都来自 Host（`GET voice/presets` / `GET voice/credentials`），
  // 设置快照里已经带了一份，页面不再硬编码 provider。
  const allPresets = Array.isArray(data.presets) ? data.presets : []
  const asrPresets = allPresets.filter(preset => preset.kind === 'asr')
  const ttsPresets = allPresets.filter(preset => preset.kind === 'tts')
  const credentials = Array.isArray(data.credentials) ? data.credentials : []
  const asrPreset = asrPresets.find(preset => preset.id === form.asrProvider)
  const ttsPreset = ttsPresets.find(preset => preset.id === form.ttsProvider)
  const asrRef = form.asrApiKeyEnv !== '' ? form.asrApiKeyEnv : (asrPreset?.apiKeyEnv ?? '')
  const ttsRef = form.ttsApiKeyEnv !== '' ? form.ttsApiKeyEnv : (ttsPreset?.apiKeyEnv ?? '')

  /** 一行「现在用」：值 + 来源/理由（理由点开才看，不占常驻版面）。 */
  const nowRow = (key, label, value, reason) => h('div', {
    key,
    style: { display: 'flex', gap: 12, alignItems: 'center', padding: '0 0 10px', minWidth: 0 },
  }, [
    h(Meta, { key: 'l', style: { flex: '0 0 auto' } }, label),
    typeof reason === 'string' && reason !== ''
      ? h(Hint, { key: 'v', label: value }, reason)
      : h('span', {
        key: 'v',
        style: { ...TYPE.body, color: C.bone, minWidth: 0, wordBreak: 'break-word', fontFamily: F.mono },
      }, value),
  ])

  /** 一行「标签 → 值（+ 来源/理由）」，只读。 */
  const line = (key, label, value, hint) => h('div', {
    key,
    style: { display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${C.ruleSoft}` },
  }, [
    h(Meta, { key: 'l', style: { width: 96, flex: '0 0 auto', whiteSpace: 'normal', lineHeight: 1.5 } }, label),
    h('span', { key: 'v', style: { ...TYPE.sub, fontFamily: F.mono, flex: '1 1 auto', minWidth: 0, color: C.bone, wordBreak: 'break-all' } }, value),
    hint !== undefined ? h(Meta, { key: 'h', style: { flex: '0 0 auto' } }, hint) : null,
  ])

  /** 表单字段：label + 控件。生效值只进 placeholder，不另写一行小字。 */
  const field = (key, label, control) => h('div', { key }, [
    h('div', { key: 'l', style: S.label }, label),
    control,
  ])

  const input = (key, placeholder, extra) => h('input', {
    key: 'i',
    style: S.input,
    value: form[key],
    placeholder,
    ...(extra ?? {}),
    onChange: event => set(key, event.target.value),
  })

  // 音色下拉的真源来自 Host（设置快照里的 data.voices = 模型→音色对照表）。
  // 按当前模型精确查；模型不在表里退到服务商级；都没有 → 文本输入（自定义/克隆音色的出路）。
  const voiceTableData = data.voices ?? { models: {}, providers: {} }
  const lookupVoices = (modelId, vendorId) => {
    const byModel = voiceTableData.models?.[String(modelId ?? '').trim()]
    if (Array.isArray(byModel) && byModel.length > 0) return byModel
    const byProvider = voiceTableData.providers?.[String(vendorId ?? '').trim()]
    if (Array.isArray(byProvider) && byProvider.length > 0) return byProvider
    return []
  }
  // 音色表按**厂商**建（mimo/minimax 的音色是厂商级、跨模型通用），
  // 不是按预设 id——Token Plan 与直连共享同一组音色。
  const currentTtsModel = form.ttsModel !== '' ? form.ttsModel : (effective.ttsModel || ttsPreset?.model || '')
  const ttsVoiceOptions = lookupVoices(currentTtsModel, ttsPreset?.vendor ?? form.ttsProvider)
  const voiceControl = () => {
    if (ttsVoiceOptions.length === 0) {
      return input('ttsVoice', effective.ttsVoice || ttsPreset?.voice || '留空用默认音色')
    }
    const current = form.ttsVoice
    const options = [h('option', { key: '__def', value: '' }, `默认 · ${ttsVoiceOptions[0].id}`)]
    for (const v of ttsVoiceOptions) options.push(h('option', { key: v.id, value: v.id }, v.label || v.id))
    // 当前值不在表里（自定义/克隆音色）也保留成一个选项，不静默丢掉。
    if (current !== '' && !ttsVoiceOptions.some(v => v.id === current)) {
      options.push(h('option', { key: '__cur', value: current }, current))
    }
    return h('select', { key: 's', style: S.input, value: current, onChange: event => set('ttsVoice', event.target.value) }, options)
  }

  /**
   * 服务下拉：选项全部来自预设表，按 Host 给的分组标题分段。
   *
   * **换服务要清掉旧服务的覆盖值。** 上一版把 provider 与 baseUrl/model 分开存：
   * 从 MiMo 切到 MiniMax 时，上一家的端点覆盖还在，于是"选了 A 却打 B 的端点"。
   * 换服务 = 从这一家的默认值重新开始；要自定义就在新服务上再填。
   *
   * 分组标题是 `disabled` 的 option——原生 `<select>` 里这就是分隔条，
   * 不额外造一层自定义下拉（窄面板里自定义下拉更难用）。
   */
  const presetSelect = (key, presets, resetKeys) => {
    const current = String(form[key] ?? '')
    const options = presets.length > 0
      ? presets.map(preset => ({
        id: preset.id,
        label: preset.label,
        title: preset.notes,
        group: preset.group,
        groupLabel: preset.groupLabel,
      }))
      : [{ id: current === '' ? 'auto' : current, label: current === '' ? '默认' : current, title: '', group: 'control', groupLabel: '' }]
    const hasCurrent = options.some(option => option.id === current)
    const nodes = []
    let lastGroup = undefined
    for (const option of options) {
      // 分组标题只在 Host 真的给了标题时画；老快照/测试数据没有这个字段就退化成平铺列表。
      if (typeof option.groupLabel === 'string' && option.groupLabel !== '' && option.group !== lastGroup) {
        nodes.push(h('option', { key: `__group_${option.group}`, disabled: true }, `── ${option.groupLabel} ──`))
      }
      lastGroup = option.group
      nodes.push(h('option', { key: option.id, value: option.id, title: option.title }, option.label))
    }
    if (!hasCurrent) nodes.push(h('option', { key: '__current', value: current }, current))
    return h('select', {
      key: 's',
      style: S.input,
      value: current,
      onChange: event => {
        const value = event.target.value
        setForm(previous => {
          const next = { ...previous, [key]: value }
          for (const resetKey of resetKeys ?? []) next[resetKey] = ''
          return next
        })
        // 换了服务之后，旧的"替换密钥"目标就不对了——直接收起。
        setSecretEdit(undefined)
      },
    }, nodes)
  }

  /** 只读值：预设供应商的端点/模型是固定的，展示但不给改。 */
  const readonly = (key, value) => h('div', {
    key,
    title: value,
    style: {
      ...S.input,
      display: 'flex', alignItems: 'center',
      color: C.boneDim, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    },
  }, value)

  const checkbox = (key, label) => h('label', {
    key,
    style: { display: 'flex', gap: 8, alignItems: 'center', ...TYPE.sub, color: C.boneDim, cursor: 'pointer', padding: '4px 0' },
  }, [
    h('input', {
      key: 'c',
      type: 'checkbox',
      checked: form[key] === true,
      onChange: event => set(key, event.target.checked),
    }),
    h('span', { key: 's' }, label),
  ])

  const section = (key, title, children) => h(Panel, { key, tone: 'plain', pad: 16 }, [
    h('div', { key: 'h', style: { ...S.cardHead, marginBottom: 10 } }, [
      h('span', { key: 't', style: S.cardTitle }, title),
    ]),
    ...children,
  ])

  /**
   * 外观：明暗用哪一套。
   *
   * 两条路只能选一条：自己选，或者完全跟随 DSH。勾了「跟随」之后，
   * 页头的 ◐ 按钮会失效（点了会说明原因），这里的亮/暗也不再可点——
   * 否则同一件事有两个入口，且其中一个不生效。
   */
  const themeRow = () => {
    const themeChip = (value, label) => h('button', {
      key: value,
      type: 'button',
      'aria-pressed': themeFollow !== true && theme === value,
      disabled: themeFollow === true,
      style: {
        ...S.btn(themeFollow !== true && theme === value ? 'primary' : false, themeFollow === true),
        padding: '7px 14px',
        ...(themeFollow === true ? { opacity: 0.5 } : {}),
      },
      onClick: () => { if (themeFollow !== true) onChangeTheme?.(value) },
    }, label)
    const followToggle = h('button', {
      key: 'follow',
      type: 'button',
      'aria-pressed': themeFollow === true,
      title: '勾上之后，明暗完全由 DSH 决定；页头的切换按钮会失效',
      style: {
        ...S.btn(themeFollow === true ? 'primary' : false, false),
        padding: '7px 14px', gap: 8,
      },
      onClick: () => onChangeThemeFollow?.(themeFollow !== true),
    }, [
      h('span', {
        key: 'box',
        'aria-hidden': true,
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: 4, flex: '0 0 auto',
          border: `1px solid ${themeFollow === true ? 'transparent' : C.rule}`,
          background: themeFollow === true ? C.primaryText : 'transparent',
          color: C.primaryTop, fontSize: 10, lineHeight: 1,
          boxShadow: themeFollow === true ? 'none' : `inset 0 1px 0 ${C.hiSoft}`,
        },
      }, themeFollow === true ? '✓' : ''),
      h('span', { key: 't' }, '跟随 DSH 主题'),
    ])
    return h('div', {
      key: 'appearance',
      style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    }, [
      h(Meta, { key: 'l' }, '明暗'),
      themeChip('light', '亮色'),
      themeChip('dark', '暗色'),
      h('div', { key: 'sp', style: { flex: '1 1 auto', minWidth: 8 } }),
      themeFollow === true
        ? h(Meta, { key: 'host', tone: 'faint' }, `由 DSH 决定 · 当前${hostScheme === 'dark' ? '暗色' : '亮色'}`)
        : null,
      followToggle,
    ])
  }

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }

  /**
   * 可用的面试官形象（来自包内 `assets/avatar/<id>/`）。
   *
   * **面板不硬编码形象列表**：Host 扫目录给清单，这里只渲染。
   * 只有一份时不出下拉（见形象区注释）。
   */
  const avatarOptions = Array.isArray(data?.avatar?.avatars) ? data.avatar.avatars : []

  const actions = children => h('div', { key: 'b', style: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' } }, children)

  /**
   * 凭据行：已有凭据下拉 + 替换（粘贴）+ 清除。
   *
   * 密钥**永不回显**：输入框是 `type=password`、`autocomplete=off`，
   * 保存成功后立刻清空；界面上只有「已配置 / 未配置 + 来源」。
   */
  const credentialRow = (key, kind, label) => {
    const refKey = kind === 'asr' ? 'asrApiKeyEnv' : 'ttsApiKeyEnv'
    const selectedRef = kind === 'asr' ? asrRef : ttsRef
    const status = credentials.find(item => item.ref === selectedRef)
    const sourceLabel = status?.source === 'host'
      ? '宿主凭据'
      : (status?.source === 'env' ? '环境变量' : '')
    const editing = secretEdit !== undefined && secretEdit.kind === kind
    const options = credentials.map(item => ({ id: item.ref, label: `${item.ref}${item.configured === true ? ' · 已配置' : ''}` }))
    if (selectedRef !== '' && !options.some(option => option.id === selectedRef)) {
      options.push({ id: selectedRef, label: selectedRef })
    }
    return h('div', { key, style: { marginTop: 6 } }, [
      h('div', { key: 'l', style: S.label }, label),
      h('div', { key: 'row', style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } }, [
        h('select', {
          key: 'sel',
          style: { ...S.input, flex: '1 1 220px', minWidth: 0 },
          value: form[refKey] ?? '',
          onChange: event => {
            set(refKey, event.target.value)
            setSecretEdit(undefined)
          },
        }, [
          h('option', { key: '__default', value: '' }, asrPresetOrTtsDefaultLabel(kind, asrPreset, ttsPreset)),
          ...options.map(option => h('option', { key: option.id, value: option.id }, option.label)),
        ]),
        h(Pill, { key: 'state', tone: status?.configured === true ? 'jade' : 'faint' },
          status?.configured === true ? `已配置 · ${sourceLabel}` : '未配置'),
        h('button', {
          key: 'replace',
          style: S.btn(false, false),
          onClick: () => setSecretEdit({ kind, ref: selectedRef, value: '' }),
        }, '替换…'),
        h('button', {
          key: 'clear',
          style: S.btn(clearArm === kind ? 'tally' : false, false),
          onClick: () => clearCredential(kind, selectedRef),
        }, clearArm === kind ? '再次点击确认清除' : '清除'),
      ]),
      editing ? h('div', { key: 'edit', style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } }, [
        h('input', {
          key: 'secret',
          type: 'password',
          autoComplete: 'off',
          spellCheck: false,
          style: { ...S.input, flex: '1 1 240px', minWidth: 0 },
          placeholder: selectedRef === '' ? '先选凭据名' : `${selectedRef} 的密钥`,
          value: secretEdit.value,
          onChange: event => setSecretEdit({ ...secretEdit, value: event.target.value }),
        }),
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'secret' || selectedRef === ''),
          onClick: saveSecret,
        }, busy === 'secret' ? '保存中…' : '写入凭据'),
        h('button', { key: 'cancel', style: S.btn(false, false), onClick: () => setSecretEdit(undefined) }, '取消'),
      ]) : null,
    ])
  }

  /** 测试结果行：走哪条链路、耗时、失败的具体原因与下一步。 */
  const testLine = (key, state) => {
    if (state === undefined) return null
    return h('div', {
      key,
      style: {
        marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.ruleSoft}`,
        ...TYPE.sub, color: state.ok ? C.jade : C.amber, wordBreak: 'break-word',
      },
    }, [
      h('div', { key: 'l' }, [
        h(Meta, { key: 'k', tone: state.ok ? 'jade' : 'amber' }, state.ok ? '通过' : '失败'),
        h('span', { key: 'v', style: { marginLeft: 8 } }, state.line ?? ''),
      ]),
      state.text !== undefined && state.text !== ''
        ? h('div', { key: 't', style: { color: C.boneDim, marginTop: 4 } }, `识别结果：${state.text}`)
        : null,
      state.detail !== undefined && state.detail !== ''
        ? h('div', { key: 'd', style: { color: C.boneFaint, marginTop: 4 } }, state.detail)
        : null,
    ])
  }

  /** 识别区的一条出路：没走服务端时说清现在是什么、要自己的模型怎么配。 */
  const asrQuiet = asr.mode === 'server'
    ? undefined
    : asr.mode === 'none'
      ? '识别已关闭；需要时把服务改回「自动」。'
      : '现在走浏览器识别；要自己的模型就选一个预设供应商（Qwen / MiMo / MiniMax，Token Plan 与直连二选一）并配好它对应的凭据。识别不通时用键盘输入，面试照常进行。'

  const ttsQuiet = tts.mode === 'server'
    ? undefined
    : tts.mode === 'none'
      ? '播报已关闭；问题只以文字显示。'
      : '现在会用浏览器系统音色；要模型音色就选一个预设供应商并配凭据，也可以用免密钥的百度朗读。'

  // 「现在用」只放**认得出是哪条链路**的最短一组词：
  // 服务 → 协议 → 模型。端点已经在下面那一格填着了，再抄一遍是把一行撑成三段。
  const joinParts = parts => parts.filter(part => typeof part === 'string' && part.trim() !== '').join(' · ')

  const asrSummary = asr.mode === 'host'
    ? joinParts(['宿主语音服务', asr.host?.provider?.name])
    : asr.mode === 'server'
      ? joinParts([asr.server?.label ?? '服务端', asr.server?.protocolLabel ?? asr.server?.protocol, asr.server?.model])
      : asr.mode === 'none'
        ? '已关闭'
        : '浏览器 Web Speech'

  const ttsSummary = tts.mode === 'server'
    ? joinParts([tts.label ?? tts.provider ?? '模型', tts.model, tts.voice])
    : tts.mode === 'none'
      ? '已关闭'
      : '浏览器系统音色'

  // 只有用得上的字段才出现。空着的格子不是"可选"，是噪音——
  // 用户会以为必须填，或者以为填错了。
  const asrNeedsGroupId = (asrPreset?.protocol ?? '') === 'minimax'
  const ttsNeedsGroupId = (ttsPreset?.protocol ?? '') === 'minimax'
  const ttsNeedsStyle = (ttsPreset?.protocol ?? '') === 'chat-audio'
  // 预设供应商 = 端点/协议/凭据名/模型已经配好的一对，只读；要自定义端点选
  // 「OpenAI 兼容 · 自定义端点」。
  const asrLocked = asrPreset?.locked === true
  const ttsLocked = ttsPreset?.locked === true
  const ttsModels = Array.isArray(ttsPreset?.models) ? ttsPreset.models : []
  const ttsModelControl = () => {
    if (!ttsLocked || ttsModels.length === 0) {
      return h('input', {
        key: 'i',
        style: S.input,
        value: form.ttsModel,
        placeholder: effective.ttsModel || ttsPreset?.model || '留空用该服务默认',
        // 换模型 = 换一组合法音色：把音色重置为默认，避免拿旧模型的音色去撞 411。
        onChange: event => { const value = event.target.value; setForm(previous => ({ ...previous, ttsModel: value, ttsVoice: '' })) },
      })
    }
    const chosen = ttsModels.some(item => item.id === form.ttsModel) ? form.ttsModel : ''
    return h('select', {
      key: 's',
      style: S.input,
      value: chosen,
      onChange: event => { const value = event.target.value; setForm(previous => ({ ...previous, ttsModel: value, ttsVoice: '' })) },
    }, [
      h('option', { key: '__def', value: '' }, `默认 · ${ttsPreset?.model ?? ttsModels[0].id}`),
      ...ttsModels.map(item => h('option', { key: item.id, value: item.id }, item.label || item.id)),
    ])
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
    section('appearance', '外观', [themeRow()]),

    section('asr', '语音识别', [
      nowRow('now', '现在用', asrSummary, asr.reason),
      h('div', { key: 'g', style: grid }, [
        field('asrProvider', '服务', presetSelect('asrProvider', asrPresets, ['asrBaseUrl', 'asrModel', 'asrGroupId', 'asrApiKeyEnv'])),
        asrLocked
          ? field('asrFixed', '端点 · 模型', readonly('fixed', `${asrPreset?.baseUrl ?? ''} · ${asrPreset?.model ?? ''}`))
          : field('asrBaseUrl', '端点', input('asrBaseUrl', effective.asrBaseUrl || asrPreset?.baseUrl || '留空用该服务默认')),
        asrLocked
          ? null
          : field('asrModel', '模型', input('asrModel', effective.asrModel || asrPreset?.model || '留空用该服务默认')),
        field('asrLanguage', '语言', input('asrLanguage', effective.asrLanguage || 'zh')),
        // Group ID 只有 MiniMax 的两套协议用得着。**别的服务上不显示这一格**——
        // 一个永远空着的字段，用户会以为必须填，或者以为坏了。
        asrNeedsGroupId
          ? field('asrGroupId', 'Group ID（MiniMax 可选）', input('asrGroupId', effective.asrGroupId || '留空 = 不带 GroupId'))
          : null,
      ]),
      credentialRow('cred', 'asr', '凭据'),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'asr'),
          onClick: () => save({
            asrProvider: form.asrProvider,
            asrBaseUrl: form.asrBaseUrl,
            asrModel: form.asrModel,
            asrApiKeyEnv: form.asrApiKeyEnv,
            asrGroupId: form.asrGroupId,
            asrLanguage: form.asrLanguage,
          }, 'asr', { allowEmpty: true }),
        }, busy === 'asr' ? '保存中…' : '保存识别设置'),
        h('button', {
          key: 'test',
          style: S.btn(false, busy === 'asr-test' || recording),
          onClick: testAsr,
        }, busy === 'asr-test' || recording ? '录音 2 秒…' : '测试识别'),
      ]),
      testLine('test', asrTest),
      asrQuiet === undefined ? null : h(Quiet, { key: 'q', tone: 'muted', style: { marginTop: 6, alignItems: 'flex-start' } }, asrQuiet),
    ]),

    section('tts', '语音播报', [
      nowRow('now', '现在用', ttsSummary, tts.reason),
      h('div', { key: 'g', style: grid }, [
        field('ttsProvider', '服务', presetSelect('ttsProvider', ttsPresets, ['ttsBaseUrl', 'ttsModel', 'ttsVoice', 'ttsGroupId', 'ttsApiKeyEnv'])),
        ttsLocked
          ? field('ttsFixed', '端点（固定）', readonly('fixed', ttsPreset?.baseUrl ?? ''))
          : field('ttsBaseUrl', '端点', input('ttsBaseUrl', effective.ttsBaseUrl || ttsPreset?.baseUrl || '留空用该服务默认')),
        field('ttsModel', '模型', ttsModelControl()),
        field('ttsVoice', '音色', voiceControl()),
        field('ttsFormat', '音频格式', h('select', {
          key: 's',
          style: S.input,
          value: form.ttsFormat,
          onChange: event => set('ttsFormat', event.target.value),
        }, [
          h('option', { key: 'm', value: 'mp3' }, 'mp3'),
          h('option', { key: 'w', value: 'wav' }, 'wav'),
        ])),
        field('ttsRate', '语速', input('ttsRate', String(effective.ttsRate ?? 1))),
        ttsNeedsGroupId
          ? field('ttsGroupId', 'Group ID（MiniMax 可选）', input('ttsGroupId', effective.ttsGroupId || '留空 = 不带 GroupId'))
          : null,
        ttsNeedsStyle
          ? field('ttsStyle', '风格指令（可选）', input('ttsStyle', effective.ttsStyle || '例如：语速偏慢、沉稳'))
          : null,
      ]),
      credentialRow('cred', 'tts', '凭据'),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'tts'),
          onClick: () => save({
            ttsProvider: form.ttsProvider,
            ttsModel: form.ttsModel,
            ttsVoice: form.ttsVoice,
            ttsBaseUrl: form.ttsBaseUrl,
            ttsApiKeyEnv: form.ttsApiKeyEnv,
            ttsGroupId: form.ttsGroupId,
            ttsFormat: form.ttsFormat,
            ttsRate: form.ttsRate,
            ttsStyle: form.ttsStyle,
          }, 'tts', { allowEmpty: true }),
        }, busy === 'tts' ? '保存中…' : '保存播报设置'),
        h('button', {
          key: 'test',
          style: S.btn(false, busy === 'tts-test'),
          onClick: testTts,
        }, busy === 'tts-test' ? '合成中…' : '测试播报'),
      ]),
      testLine('test', ttsTest),
      ttsQuiet === undefined ? null : h(Quiet, { key: 'q', tone: 'muted', style: { marginTop: 6, alignItems: 'flex-start' } }, ttsQuiet),
    ]),

    section('camera', '摄像头', [
      nowRow('now', '现在用', camera.running === true ? `已接通 · ${camera.backend === 'chromium-mf' ? 'Chromium（Media Foundation）' : (camera.backend === 'ffmpeg' ? 'ffmpeg' : '未知后端')}` : '未接通', camera.reason),
      h('div', { key: 'g', style: grid }, [
        field('cameraBackend', '采集后端', h('select', {
          key: 's',
          style: S.input,
          value: form.cameraBackend,
          onChange: event => set('cameraBackend', event.target.value),
        }, [
          h('option', { key: 'a', value: 'auto' }, 'auto（ffmpeg 优先，失败回落浏览器）'),
          h('option', { key: 'f', value: 'ffmpeg' }, 'ffmpeg（只用 DirectShow）'),
          h('option', { key: 'c', value: 'chromium-mf' }, 'Chromium（Media Foundation）优先'),
        ])),
        field('ffmpegPath', 'ffmpeg 路径', input('ffmpegPath', backends.ffmpeg?.found === true ? backends.ffmpeg.path : 'D:\\tools\\ffmpeg\\bin\\ffmpeg.exe')),
        field('chromiumPath', 'Chrome / Edge 路径', input('chromiumPath', backends.chromium?.found === true ? backends.chromium.path : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')),
      ]),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'camera'),
          onClick: () => save({
            cameraBackend: form.cameraBackend,
            ffmpegPath: form.ffmpegPath,
            chromiumPath: form.chromiumPath,
          }, 'camera'),
        }, busy === 'camera' ? '保存中…' : '保存摄像头设置'),
        h('button', { key: 'diag', style: S.btn(false, busy === 'diagnose'), onClick: runDiagnose },
          busy === 'diagnose' ? '正在自检…' : '自检摄像头'),
      ]),
      diagnosis !== undefined
        ? h('div', {
          key: 'diag',
          style: { paddingTop: 10, ...TYPE.sub, lineHeight: 1.8, color: diagnosis.ok ? C.jade : C.amber },
        }, [
          h('div', { key: 'a' }, diagnosis.ok ? `可用 · 后端 ${diagnosis.backend ?? '未知'}` : `不可用 · ${diagnosis.reason ?? ''}`),
          diagnosis.hint !== undefined && diagnosis.hint !== '' ? h('div', { key: 'b', style: { color: C.boneFaint } }, diagnosis.hint) : null,
          (diagnosis.probes ?? []).map(probe => h('div', { key: probe.name, style: { color: C.boneFaint, fontFamily: F.mono } },
            `${probe.name}: ${probe.ok ? '抓帧成功' : (probe.detail ?? '失败')}`)),
        ])
        : null,
    ]),

    section('privacy', '录像与录音', [
      checkbox('recordVideo', '允许录像（关掉 = 面板不出现录像入口）'),
      checkbox('recordAudio', '允许录音（关掉 = 面板不出现录音入口）'),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'privacy'),
          onClick: () => save({ recordVideo: form.recordVideo, recordAudio: form.recordAudio }, 'privacy'),
        }, busy === 'privacy' ? '保存中…' : '保存隐私设置'),
      ]),
    ]),

    // 回答节奏（docs/TURN-TAKING.md §4）：自动/手动是**用户拥有的开关**。
    // 面试中随时可在「面试中」页快捷切换，这里是正式条目。
    section('turn', '回答节奏', [
      h('div', { key: 'g', style: grid }, [
        field('answerMode', '模式', h('select', {
          key: 's',
          style: S.input,
          value: form.answerMode,
          onChange: event => set('answerMode', event.target.value),
        }, [
          h('option', { key: 'm', value: 'manual' }, '手动（答完自己点「提交回答」）'),
          h('option', { key: 'a', value: 'auto' }, '自动（说完静音约 2 秒自动提交）'),
        ])),
        field('turnEndSilenceMs', '话轮结束静音（毫秒，800–6000）',
          input('turnEndSilenceMs', String(effective.turnEndSilenceMs ?? 2000))),
      ]),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'turn'),
          onClick: () => save({ answerMode: form.answerMode, turnEndSilenceMs: form.turnEndSilenceMs }, 'turn'),
        }, busy === 'turn' ? '保存中…' : '保存回答节奏'),
      ]),
      h(Quiet, {
        key: 'q',
        tone: 'muted',
        style: { marginTop: 6, alignItems: 'flex-start' },
      }, '开关只管「自动判定与提交」：手动提交同样会唤醒面试官。自动判定需要宿主/服务端识别；提交前有 2 秒反悔窗口，重新开口即取消。'),
    ]),

    // 虚拟面试官：舞台右上角那个会说话的形象。
    //
    // **为什么值得一个开关。** 有人就是不喜欢屏幕里有张脸；出问题时这也
    // 是最快的止血开关（关掉 = 舞台上不挂，其他一律不变）。
    //
    // **形象下拉只在真有多份时才出现**：包里只有一份形象时摆一个
    // 单选项下拉是纯噪声（AGENTS §10.0.1）——加一份形象（放目录）它就自己出来。
    section('avatar', '面试官形象', [
      checkbox('interviewerAvatar', '在舞台上显示预置面试官（会跟着提问开口、听你说话时看着你）'),
      avatarOptions.length > 1
        ? h('div', { key: 'style', style: grid }, [
          field('interviewerStyle', '形象', h('select', {
            key: 's',
            style: S.input,
            value: form.interviewerStyle === undefined || form.interviewerStyle === ''
              ? (data.avatar?.selected ?? avatarOptions[0].id)
              : form.interviewerStyle,
            onChange: event => set('interviewerStyle', event.target.value),
          }, avatarOptions.map(option => h('option', { key: option.id, value: option.id }, option.name)))),
        ])
        : null,
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'avatar'),
          onClick: () => save(
            {
              interviewerAvatar: form.interviewerAvatar === true ? 'on' : 'off',
              // 只有真出现过下拉才写这个键：否则会用空值覆盖掉已存的形象选择。
              ...(avatarOptions.length > 1 && form.interviewerStyle !== undefined
                ? { interviewerStyle: form.interviewerStyle }
                : {}),
            },
            'avatar',
          ),
        }, busy === 'avatar' ? '保存中…' : '保存形象设置'),
      ]),
      // 一条出路，不是说明书：外放时面试官的声音会进麦克风。
      h(Quiet, { key: 'q', tone: 'muted', style: { marginTop: 6, alignItems: 'flex-start' } },
        '外放时建议戴耳机：扬声器里的提问会被麦克风收进去。'),
    ]),

    section('guard', '面试间保护', [
      checkbox('guardEnabled', '离开面试间前确认（关闭后直接释放设备，不再提示）'),
      line('gq', '退出提醒', data.settings?.guardQuiet === true ? '已关闭（以后不再提醒）' : '开启'),
      actions([
        h('button', { key: 'save', style: S.btn('primary', busy === 'guard'), onClick: () => save({ guardEnabled: form.guardEnabled }, 'guard') },
          busy === 'guard' ? '保存中…' : '保存保护设置'),
        h('button', { key: 'reset', style: S.btn(false, data.settings?.guardQuiet !== true), onClick: () => save({ guardQuiet: false }, 'guard') }, '恢复退出提醒'),
      ]),
      h(Hint, { key: 'note', label: '退出保护' },
        '面试中退出会强制二次确认；面板内切页签/切面试与侧栏切到其他面板都会被拦下。'),
    ]),

    section('env', '环境（只读）', [
      line('root', '数据根', data.dataRoot?.path ?? '', data.dataRoot?.source),
      h('div', { key: 'why', style: { ...TYPE.sub, color: C.boneFaint, padding: '4px 0 8px' } }, data.dataRoot?.reason ?? ''),
      line('sessions', '面试目录', data.sessionsDir ?? ''),
      line('profiles', '岗位档案', data.profilesDir ?? ''),
      line('settings', '设置文件', data.settingsFile ?? ''),
      line('host', '宿主工作区', data.hostWorkspace?.path ?? ''),
      line('wsreg', 'DSH 工作区', data.workspaceRegistration?.registered === true
        ? `已登记 · ${data.workspaceRegistration.title || data.workspaceRegistration.workspaceId}`
        : (data.workspaceRegistration === undefined ? '尚未登记（派活/建场次时会自动登记）' : '未登记'), data.workspaceRegistration?.workspaceId ?? ''),
      line('model', '宿主模型', `${model.provider ?? ''} · ${formatBytes(model.bytes ?? 0)} · ${model.files ?? 0} 个文件`, model.exists === true ? '已就绪' : '未下载'),
      line('modeldir', '模型目录', model.dir ?? ''),
      (data.emptySessions ?? []).length > 0
        ? h('div', { key: 'empty', style: { paddingTop: 8 } }, [
          line('ec', '空场次', `${data.emptySessions.length} 场`, '没有任何内容'),
          actions([
            h('button', {
              key: 'purge',
              style: S.btn(purgeArm ? 'tally' : 'primary', busy === 'purge'),
              onClick: purgeEmpty,
            }, busy === 'purge' ? '清理中…' : (purgeArm ? '再次点击确认清理' : `清理 ${data.emptySessions.length} 场空场次`)),
          ]),
          h(Hint, { key: 'n', label: '清理范围' },
            '只删没有任何内容的场次；有简历 / JD / 考点 / 转录 / 报告的一场都不会动。'),
        ])
        : null,
      actions([
        h('button', { key: 'prep', style: S.btn(false, busy === 'model'), onClick: prepareModel }, busy === 'model' ? '正在准备…' : '准备语音模型'),
      ]),
      session === undefined ? null : h('div', { key: 'session' }, [
        line('sid', '面试 id', data.session?.id ?? ''),
        line('sdir', '卷宗目录', data.session?.dir ?? ''),
        (data.session?.artifacts ?? []).map(item => line(
          `a-${item.name}`,
          item.kind === 'video' ? '录像' : item.kind === 'audio' ? '录音' : '文件',
          item.name,
          formatBytes(item.bytes),
        )),
      ]),
    ]),
  ])
}

/** 「凭据 = 服务默认」那一行的文案：告诉用户默认是哪个 ref，但值留空。 */
function asrPresetOrTtsDefaultLabel(kind, asrPreset, ttsPreset) {
  const preset = kind === 'asr' ? asrPreset : ttsPreset
  if (preset === undefined || preset.apiKeyEnv === undefined || preset.apiKeyEnv === '') return '服务默认（免密钥）'
  return `服务默认 · ${preset.apiKeyEnv}`
}

    // ── panel ─────────────────────────────────────────────────────────────

    /**
     * 按**公司**给场次分组。
     *
     * **为什么是公司，不是岗位。** 左栏只有 244px，一个「公司 · 岗位」的
     * 组头在这里必然被截断——截断之后既认不出公司，也认不出岗位，
     * 那行字就白占了。公司名短，一行放得下，而且「我在跟谁谈」本来就是
     * 整理时第一层的分类。岗位留给行内的第二行小字。
     *
     * 认不出公司的场次归到「未整理」，放在最后，而不是混在有名字的组里。
     *
     * @param {Array<object>} rows
     * @returns {Array<{key: string, label: string, items: Array<object>}>}
     */
    function groupSessions(rows) {
      const LOOSE = '\u0000unfiled'
      const buckets = new Map()
      for (const row of rows) {
        const raw = typeof row.company === 'string' ? row.company.trim() : ''
        // 占位公司（`新建公司 2026-11-17`）不是真名字：归到「未整理」，
        // 别让每一天都长出一个「新建公司」分组。
        const company = isPlaceholderCompany(raw) ? '' : raw
        const key = company !== '' ? company : LOOSE
        if (!buckets.has(key)) {
          buckets.set(key, { key, label: company !== '' ? company : '未整理', items: [] })
        }
        buckets.get(key).items.push(row)
      }
      const groups = [...buckets.values()]
      // 组内最近一场排前面；有名字的组按最近一场的时间排， 「未整理」永远垫底。
      for (const group of groups) {
        group.items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      }
      groups.sort((a, b) => {
        const aLoose = a.key === LOOSE
        const bLoose = b.key === LOOSE
        if (aLoose !== bLoose) return aLoose ? 1 : -1
        return (b.items[0]?.updatedAt ?? 0) - (a.items[0]?.updatedAt ?? 0)
      })
      return groups
    }

    /**
     * 页签：顺序就是面试的流程顺序。
     *
     * **为什么是常量而不是每次渲染现拼。** 页签是壳层的骨架，
     * 它不该跟着任何一次轮询重建；而且「设置」必须和另外三个一样
     * 是一等页签——截图闸门与布局闸门都按这张表点。
     */
    const PANEL_TABS = [
      { key: 'prepare', label: '准备', guard: '切换到「准备」' },
      { key: 'live', label: '面试中', guard: '切换到「面试中」' },
      { key: 'report', label: '报告', guard: '切换到「报告」' },
      { key: 'settings', label: '设置', guard: '切换到「设置」' },
    ]

    /**
     * 品牌记号：**一个卷宗折角 + 一道声波**。
     *
     * 整个插件只出现这一次。它是「一份卷宗」和「一场面试」的共同形状——
     * 记号长对了，页头就不用再写一句「简历 + JD → 一场有准备的面试」
     * 来解释自己是什么。
     *
     * 用内联 SVG 而不是图片文件：它要跟着主题取色（`currentColor`），
     * 而且在两套主题下都得是同一种笔画粗细。
     */
    function BrandMark(props) {
      const size = props.size ?? 24
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, focusable: 'false',
        style: { display: 'block', pointerEvents: 'none' },
      }, [
        // 卷宗：一张纸，右上角折起来。
        h('path', {
          key: 'case',
          d: 'M5.5 4h7.1L18 9.4v10.1A1.5 1.5 0 0 1 16.5 21h-11A1.5 1.5 0 0 1 4 19.5v-14A1.5 1.5 0 0 1 5.5 4Z',
          stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round',
        }),
        h('path', {
          key: 'fold',
          d: 'M12.5 4.2v5.3h5.2',
          stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round',
        }),
        // 一道声波：面试是「说」出来的，不是填表填出来的。
        h('path', {
          key: 'wave',
          d: 'M7.4 16.4c1.1-2.3 1.9-2.3 3 0s1.9 2.3 3 0 1.9-2.3 3 0',
          stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', opacity: 0.82,
        }),
      ])
    }

    /** 行内小图标：归档（盒子 + 向下的箭头）。 */
    function ArchiveGlyph() {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true,
        style: { display: 'block', pointerEvents: 'none' },
      }, [
        h('path', {
          key: 'box',
          d: 'M2.6 5.6h10.8v7a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1z',
          stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round',
        }),
        h('path', { key: 'lid', d: 'M2 3.6h12v2H2z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }),
        h('path', {
          key: 'arrow',
          d: 'M8 7.4v3.4m-1.4-1.4L8 10.8l1.4-1.4',
          stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
      ])
    }

    /** 行内小图标：删除（垃圾桶）。 */
    function TrashGlyph() {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true,
        style: { display: 'block', pointerEvents: 'none' },
      }, [
        h('path', {
          key: 'lid',
          d: 'M3 4.5h10M6.2 4.5V3.2h3.6v1.3',
          stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        }),
        h('path', {
          key: 'can',
          d: 'M4.4 4.5l.6 8a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.6-8',
          stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round',
        }),
      ])
    }

    /**
     * 页头上只显示路径的**末两段**。
     *
     * AGENTS.md §3 要求界面能回答「数据存到哪儿、为什么」——它要求的是
     * 这个能力不许消失，**不是**要求路径常驻占掉两行。完整路径与来源理由
     * 在芯片的 `title=` 里，点一下就是宿主的目录选择器。
     */
    function shortRootPath(path) {
      const text = String(path ?? '')
      const parts = text.split(/[\\/]+/).filter(part => part !== '')
      if (parts.length === 0) return ''
      const separator = text.includes('\\') ? '\\' : '/'
      const tail = parts.slice(-2).join(separator)
      return parts.length > 2 ? `…${separator}${tail}` : tail
    }

    /** 场次状态 → 语气：running 用琥珀（进行中），done 用青玉（已完成）。 */
    function statusTone(status) {
      if (status === 'running') return 'amber'
      if (status === 'done') return 'jade'
      return 'faint'
    }

    /**
     * 面板外的一次点击，是不是**宿主的窗口陈设**？
     *
     * 保护只该拦「离开面试间」的动作——换场次、切到别的插件面板。
     * 而侧栏的**折叠/展开**、窗口那一排图标、顶部标签，点完人还在面试间里，
     * 拦下来纯属误伤（用户点一下「收起侧栏」，却弹出一个「确定要离开？」）。
     *
     * 三条判据：
     *   ① 窗口顶部那一条（y ≤ 44）：宿主的标题栏按钮都在这里；
     *   ② 语义容器：header / titlebar / topbar / sidebar 头部；
     *   ③ 文案语义：aria-label / title / data-testid 里有「收起 / 展开 /
     *      折叠 / 侧栏 / sidebar / collapse / toggle」。不同 DSH 版本起名
     *      不一样，所以按语义认，不写死某一个 id。
     *
     * @param {MouseEvent} event
     */
    const HOST_CHROME_HINT = /收起|展开|折叠|侧栏|侧边栏|sidebar|collapse|expand|toggle|collapse-panel/i
    function isHostChromeClick(event) {
      if (typeof event.clientY === 'number' && event.clientY <= 44) return true
      const target = event.target
      if (target === null || target === undefined || typeof target.closest !== 'function') return false
      const container = target.closest(
        'header, [role="banner"], [data-dsh-titlebar], [class*="titlebar"], [class*="title-bar"], '
        + '[class*="topbar"], [class*="top-bar"], [class*="app-header"], '
        + '[class*="sidebar-header"], [class*="sidebar-head"], [class*="side-bar-head"]',
      )
      if (container !== null) return true
      const labelled = target.closest('[aria-label], [title], [data-testid], [data-tooltip]')
      if (labelled === null || typeof labelled.getAttribute !== 'function') return false
      const text = ['aria-label', 'title', 'data-testid', 'data-tooltip']
        .map(name => labelled.getAttribute(name))
        .filter(item => typeof item === 'string' && item !== '')
        .join(' ')
      return text !== '' && HOST_CHROME_HINT.test(text)
    }

    /** The whole panel. */
    function Interviewer() {
      const [tab, setTab] = useState('prepare')
      const [selected, setSelected] = useState(undefined)
      const [notice, setNotice] = useState(undefined)
      // ── 主题 ──────────────────────────────────────────────────────────
      //
      // 两条路，用户选一条：
      //   ① 自己选亮/暗（默认**亮色**：白面 + 灰缝 + 暖影，层次最清楚）；
      //   ② 勾「跟随 DSH 主题」——那就完全听宿主的，切换按钮失效。
      // 勾了②之后 `themeChoice` 仍在内存里留着，取消勾选时立刻回到原来的选择。
      const [themeChoice, setThemeChoice] = useState(readTheme)
      const [themeFollow, setThemeFollowState] = useState(readThemeFollow)
      const [hostScheme, setHostScheme] = useState(() => hostColorScheme() ?? 'light')
      const theme = themeFollow ? hostScheme : themeChoice
      const setTheme = useCallback(next => {
        const value = typeof next === 'function' ? next(themeChoice) : next
        setThemeChoice(value)
        saveTheme(value)
      }, [themeChoice])
      const setThemeFollow = useCallback(follow => {
        setThemeFollowState(follow)
        saveThemeFollow(follow)
        // 刚打开「跟随」时先对齐一次宿主，避免要等到下一次宿主换主题才生效。
        if (follow) {
          const scheme = hostColorScheme()
          if (scheme !== undefined) setHostScheme(scheme)
        }
      }, [])

      // 跟随宿主时，盯住宿主的明暗切换（MutationObserver，不轮询）。
      useEffect(() => {
        if (!themeFollow) return undefined
        return watchHostScheme(scheme => setHostScheme(scheme))
      }, [themeFollow])

      const notify = useCallback((title, detail, kind = 'info', action = undefined) => {
        setNotice({ title, detail, kind, action, at: Date.now() })
      }, [])

      /**
       * 成功/信息通知 **4 秒后自己退场**，并且分两步：先淡出，再卸载。
       *
       * 为什么不直接卸载：卸载是瞬间的，一条从页头落下来的提醒条
       * 会"啪"地消失。先标 `leaving`，让 CSS 过渡把它推上去、淡掉，
       * 260ms 后再从树上摘掉。
       *
       * 失败要常驻（AGENTS.md §7：失败必须给出路，用户还没读完不能消失），
       * 带动作的也不自动关（「撤销新建」「放弃修改并关闭」这些动作
       * 需要一个稳定的落点，不能被计时器抢走）。
       *
       * 这是**一次性定时器**，不是轮询：通知出现才计时，消失即清掉——
       * 空闲时它一次都不跑（`render-probe` 的重渲染必须仍是 0）。
       */
      useEffect(() => {
        if (notice === undefined) return undefined
        if (notice.leaving === true) {
          const gone = setTimeout(() => {
            setNotice(current => (current === notice ? undefined : current))
          }, 280)
          return () => clearTimeout(gone)
        }
        if (notice.kind === 'error' || notice.action !== undefined) return undefined
        const fade = setTimeout(() => {
          setNotice(current => (current === notice ? { ...current, leaving: true } : current))
        }, 3400)
        return () => clearTimeout(fade)
      }, [notice])

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
      // 删除要两步：第一次点只是"上膛"，四秒内再点才真删。
      const [pendingDelete, setPendingDelete] = useState(undefined)
      // 哪一行的「⋯」菜单是打开的（同一时刻只开一个）。
      const [rowMenu, setRowMenu] = useState(undefined)
      // 记录清理（批量删场次 + 空场次清理）与重置确认：两个弹层。
      const [managerOpen, setManagerOpen] = useState(false)
      const [resetTarget, setResetTarget] = useState(undefined)
      const settingsPoll = usePoll(() => apiGet('settings'), 8000, [])
      const guardQuiet = settingsPoll.data?.settings?.guardQuiet === true
      // 保护总开关：关掉后不再弹确认，但**设备仍然在离开时释放**。
      const guardEnabled = settingsPoll.data?.settings?.guardEnabled !== false

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
      // 按公司分组：同一家的几场聚在一起。
      const groups = useMemo(() => groupSessions(visibleRows), [visibleRows])
      // 哪几个组是收起的。默认全展开——收起来是为了让列表短，
      // 但刚打开时用户还在找最近的场次，不该先让他点两下。
      const [collapsedGroups, setCollapsedGroups] = useState({})

      /**
       * 行里显示的标题：组头已经写了公司，行内就不再重复一遍
       * （「字节跳动 / 字节 · 高级后端工程师」是同一件事说两次）。
       * 完整标题一直在 `title=` 里，悬停能看全。
       */
      const shortTitle = row => {
        const title = String(row.title ?? '')
        const company = (row.company ?? '').trim()
        if (company === '') return title
        const prefix = `${company} · `
        return title.startsWith(prefix) ? title.slice(prefix.length).trim() : title
      }

      /**
       * 一行下面的那串小字：**只写标题里没有的东西**。
       *
       * 标题通常已经带了公司 / 岗位，再重复一遍只会把两行都挤到截断。
       * 只有当用户把标题改成认不出岗位的名字时，才把岗位补到这里。
       *
       * @param {object} row
       * @param {string} shownTitle 这一行实际显示出来的标题
       */
      const rowMeta = (row, shownTitle) => {
        const parts = []
        const rawPosition = (row.position ?? '').trim()
        // 占位岗位也不是真名字，别把「新建岗位 2026-11-17」当第二行小字。
        const position = isPlaceholderPosition(rawPosition) ? '' : rawPosition
        if (position !== '' && !shownTitle.includes(position)) parts.push(position)
        parts.push(`${row.status ?? 'draft'} · 考点 ${row.probedCount}/${row.checklistCount}`)
        return parts.join(' · ')
      }

      // 默认选中最近一场。
      useEffect(() => {
        const rows = sessionsPoll.data?.sessions ?? []
        if (selected === undefined && rows.length > 0) setSelected(rows[0].id)
      }, [sessionsPoll.data, selected])

      /**
       * 暂停是**静止态**（docs/TURN-TAKING.md §6.3）：高频轮询降为低频，
       * 空闲轮询不许引发重渲染（§11 红线）。用 state 而不是 ref——
       * interval 是渲染期参数，ref 变了不会触发重新注册。
       */
      const [livePaused, setLivePaused] = useState(false)
      const sessionPoll = usePoll(
        () => (selected === undefined ? Promise.resolve(undefined) : apiGet(`sessions/${selected}`)),
        selected === undefined ? null : (tab === 'live' && !livePaused ? POLL_MS : 6000),
        [selected],
        // **内容没变就不重渲染**——面试中每 1.5 秒轮询一次，
        // 每次都重建整个面板（含几百行转录）就是卡顿的来源。
        data => data?.revision,
      )

      const session = sessionPoll.data

      useEffect(() => {
        const pausedNow = session?.session?.status === 'paused'
        setLivePaused(previous => (previous === pausedNow ? previous : pausedNow))
      }, [session])

      /** 带保护的跳转：设备开着且没勾「不再提醒」时先弹确认。 */
      const guardRun = useCallback((label, action) => {
        if (!mediaInUse().any || guardQuiet || !guardEnabled) { action(); return }
        setGuard({
          label,
          action,
          remember: false,
          second: false,
          inInterview: session?.session?.status === 'running',
        })
      }, [guardEnabled, guardQuiet, session?.session?.status])

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
        // Live 页的「自动/手动」快捷切换会写 settings，而面板读的是
        // config 端点的有效值——一并刷新，切换才「即时生效」。
        void configPoll.refresh()
      }, [sessionsPoll, sessionPoll, configPoll])

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

      /** 删除一场面试（连同卷宗目录）。两步确认，避免手滑。 */
      const deleteSession = useCallback(async id => {
        try {
          const result = await apiPost(`sessions/${id}/delete`, {})
          if (result?.ok === false) {
            notify('删不掉', `${result.error ?? ''}${result.hint !== undefined ? ` ${result.hint}` : ''}`, 'error')
            return
          }
          setPendingDelete(undefined)
          if (selected === id) setSelected(undefined)
          notify('已删除', `${result.title ?? id} 的卷宗目录已从磁盘删除。`, 'ok')
          refreshAll()
        } catch (failure) {
          notify('删不掉', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, refreshAll, selected])

      /**
       * 续接一场**已结束**的面试（AGENTS §6.14）。
       *
       * 与「暂停后继续」不同：这是 done → running，不重开一轮，
       * 中断的那段时间记进 pausedMs（不算面试时长）。
       */
      const continueSession = useCallback(async row => {
        try {
          await apiPost(`sessions/${row.id}/continue`, {})
          setSelected(row.id)
          setTab('live')
          notify('续接上了', '助手会带着这场面试的转录与底稿，接着中断处继续问。', 'ok')
          refreshAll()
        } catch (failure) {
          notify('没法续接', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, refreshAll])

      /** 重置一场面试的记录：面试过程清零，材料与底稿保留。 */
      const resetSession = useCallback(async (row, dropRecordings) => {
        try {
          const result = await apiPost(`sessions/${row.id}/reset`, { dropRecordings })
          const cleared = result?.cleared ?? {}
          const parts = []
          if (cleared.turns > 0) parts.push(`${cleared.turns} 条转录`)
          if (cleared.report === true) parts.push('报告')
          if (cleared.checklistProbed > 0) parts.push(`${cleared.checklistProbed} 个「问过」标记`)
          if (cleared.recordings > 0) parts.push(`${cleared.recordings} 个录音录像`)
          setResetTarget(undefined)
          notify(
            '已重置',
            `${parts.length > 0 ? `清掉 ${parts.join('、')}；` : ''}简历、JD、底稿都还在。`,
            'ok',
          )
          refreshAll()
        } catch (failure) {
          notify('没重置成', failure instanceof Error ? failure.message : String(failure), 'error')
        }
      }, [notify, refreshAll])

      const createSession = useCallback(async () => {
        try {
          const result = await apiPost('sessions', {})
          setSelected(result.session.id)
          setTab('prepare')
          // 误触新建是常事——给一次"撤销"，比事后去列表里删更顺手。
          setNotice({
            title: '新面试已建好',
            detail: '先从简历库挑一份（或上传新的），再放 JD。误触了可以撤销。',
            kind: 'ok',
            at: Date.now(),
            action: { label: '撤销新建', run: () => { void deleteSession(result.session.id) } },
          })
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

      // ── 面板外的离开拦截 ──────────────────────────────────────────────
      //
      // 侧栏切到「会话 / 自媒体工作台 / Skill-MCP」这类导航由 DSH 完成，
      // 不是我们的按钮——只能在这里**捕获阶段拦一次**：设备开着时，
      // 点击落在面板左侧（DSH 侧栏）就先问；确认后把这次点击重放回去。
      // 顶部菜单栏允许通过，避免把无关点击也拦住。
      const guardStateRef = useRef({ quiet: false, running: false, enabled: true })
      guardStateRef.current = {
        quiet: guardQuiet,
        enabled: guardEnabled,
        running: session?.session?.status === 'running',
      }
      useEffect(() => {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
        const handler = event => {
          if (!mediaInUse().any || guardStateRef.current.quiet || !guardStateRef.current.enabled) return
          const root = pageRef.current
          if (root === null || root === undefined || typeof root.getBoundingClientRect !== 'function') return
          // 只拦**面板左侧**的点击（DSH 侧栏是导航入口）；顶部菜单与面板内放行。
          const rect = root.getBoundingClientRect()
          if (event.clientX >= rect.left) return
          // 宿主的窗口陈设（折叠侧栏、标题栏图标、顶部标签）不会离开面试间——放行。
          if (isHostChromeClick(event)) return
          event.preventDefault()
          event.stopPropagation()
          const point = { x: event.clientX, y: event.clientY }
          setGuard({
            label: '离开面试间',
            remember: false,
            second: false,
            inInterview: guardStateRef.current.running,
            action: () => {
              // 确认后把这次点击重放回原位置，用户不用再点一次。
              setTimeout(() => {
                try {
                  const target = typeof document.elementFromPoint === 'function'
                    ? document.elementFromPoint(point.x, point.y)
                    : null
                  if (target === null) return
                  target.dispatchEvent(new MouseEvent('click', {
                    bubbles: true, cancelable: true, view: window,
                    clientX: point.x, clientY: point.y,
                  }))
                } catch { /* 重放不了就让用户再点一次，设备已经释放 */ }
              }, 0)
            },
          })
        }
        document.addEventListener('click', handler, true)
        return () => document.removeEventListener('click', handler, true)
      }, [])
      const narrow = pageWidth > 0 && pageWidth < 760

      // ── 页头要用的派生值 ──────────────────────────────────────────────
      //
      // 全部由**已有状态**算出来（会话快照 + 页签 + 主题），不新增任何取数。
      // 页头是每 1.5 秒跟着轮询重绘的那一层，多一个请求就是多一份卡顿。
      const current = session?.session
      const tabIndex = Math.max(0, PANEL_TABS.findIndex(item => item.key === tab))
      const probedCount = session?.stats?.checklistProbed ?? 0
      const checklistTotal = session?.stats?.checklistTotal
        ?? (Array.isArray(session?.checklist?.items) ? session.checklist.items.length : 0)
      const statusChipText = checklistTotal > 0 ? `考点 ${probedCount}/${checklistTotal}` : ''
      const nextThemeLabel = theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'
      const rootInfo = config?.workspaceRoot

      // 页签：分段控件 + 一条**滑动**的 2px 指示条。
      //
      // 指示条不是每格画一条，而是一条跟着 index 走：四格等宽，
      // 所以位置能用百分比算出来，不需要量 DOM——没有 ResizeObserver、
      // 没有额外 state，切换时只改一个行内样式。
      const tabStrip = h('div', {
        key: 'tabs',
        role: 'tablist',
        'aria-label': '面试阶段',
        style: {
          ...S.tabs,
          marginLeft: 0,
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 2,
          flex: narrow ? '1 1 260px' : '0 0 auto',
        },
      }, [
        h('span', {
          key: 'indicator',
          'aria-hidden': true,
          style: {
            position: 'absolute', bottom: 3, height: 2, width: 22, borderRadius: RADIUS.pill,
            background: C.accent,
            // 四格等宽：第 i 格的中心 = padding + (内容宽 × (i + .5) / 4)。
            left: `calc(4px + (100% - 8px) * ${(tabIndex + 0.5) / 4} - 11px)`,
            boxShadow: `0 0 10px ${C.accentWash}`,
            transition: 'left 260ms var(--iv-ease)',
            pointerEvents: 'none',
          },
        }),
        ...PANEL_TABS.map(item => h('div', {
          key: item.key,
          role: 'tab',
          tabIndex: 0,
          'aria-selected': tab === item.key,
          title: item.label,
          style: {
            ...S.tab(tab === item.key),
            // 选中项：**从槽里抬起来的那一格**——用统一的 elev-1（内高光 +
            // 接触影 + 环境影三件套），而不是手写一句投影。
            boxShadow: tab === item.key ? C.elev1 : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '6px 10px',
          },
          onClick: () => guardRun(item.guard, () => setTab(item.key)),
          onKeyDown: event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            guardRun(item.guard, () => setTab(item.key))
          },
        }, item.label)),
      ])

      // 主题切换：**一个图标**，不写「亮色/暗色」四个字。
      // 可见的 ◐ 是「半明半暗」；切到哪套写在 title / aria-label 里。
      //
      // 勾了「跟随 DSH 主题」之后这个按钮**失效**（但还在原位，不跳）：
      // 明暗由宿主决定，点它不会有结果，所以点下去要**说明为什么**，
      // 而不是让按钮毫无反应——没反应的按钮会被当成坏了。
      const themeButton = h(IconBtn, {
        key: 'theme',
        label: themeFollow ? '主题跟随 DSH（设置页可关）' : nextThemeLabel,
        title: themeFollow
          ? `主题跟随 DSH：现在是${theme === 'dark' ? '暗色' : '亮色'}（在设置页取消「跟随 DSH 主题」才能自己选）`
          : `${nextThemeLabel}（当前：${theme === 'dark' ? '暗色' : '亮色'}）`,
        // **不真 disable**：真 disable 的按钮点不动，也就没法解释"为什么不生效"。
        // 视觉上已经淡下去（看得见它失效），点下去给一句说明（知道该去哪儿改）。
        style: {
          flex: '0 0 auto', minWidth: 34, minHeight: 34, borderRadius: RADIUS.md,
          border: `1px solid ${C.ruleSoft}`,
          color: themeFollow ? C.boneFaint : C.boneDim,
          opacity: themeFollow ? 0.55 : 1,
          cursor: 'help',
        },
        onClick: themeFollow
          ? () => notify('主题在跟随 DSH', '现在由 DSH 的明暗决定。想自己选，去设置页取消「跟随 DSH 主题」。', 'info')
          : () => setTheme(previous => (previous === 'dark' ? 'light' : 'dark')),
      }, h('span', {
        key: 'glyph',
        'aria-hidden': true,
        style: { fontSize: TYPE.body.fontSize, lineHeight: 1 },
      }, theme === 'dark' ? '◑' : '◐'))

      const newSessionButton = h('button', {
        key: 'new',
        type: 'button',
        style: { ...S.btn('primary', false), flex: '0 0 auto', padding: '8px 14px' },
        onClick: () => guardRun('新建面试', createSession),
      }, '新建面试')

      /**
       * 卷宗库：**收进一枚芯片，但仍然可查、可换。**
       *
       * `title=` 里是完整路径 + 来源理由（`AGENTS.md §3` 的红线：
       * 界面必须能回答「数据在哪、为什么是这个目录」），点一下走宿主的
       * 原生目录选择器——不给用户手打路径的机会，路径是机器上的事实。
       */
      const rootChip = rootInfo === undefined ? null : h('button', {
        key: 'root',
        type: 'button',
        'data-iv-root': '1',
        disabled: picking,
        title: `${rootInfo.path}\n${rootInfo.reason ?? ''}\n点击用系统目录选择器换一个位置`,
        'aria-label': `卷宗库位置：${rootInfo.path}。点击更换`,
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%',
          padding: '2px 10px', borderRadius: RADIUS.pill, cursor: picking ? 'progress' : 'pointer',
          background: 'transparent', border: `1px solid ${C.ruleSoft}`, color: C.boneFaint,
          fontFamily: F.ui,
        },
        onClick: pickWorkspaceRoot,
      }, [
        h(Meta, {
          key: 'p',
          tone: 'faint',
          style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
        }, `卷宗库 · ${shortRootPath(rootInfo.path)}`),
        h('span', {
          key: 'b',
          style: {
            fontFamily: F.mono, ...TYPE.meta, color: C.accent,
            whiteSpace: 'nowrap', letterSpacing: '0.1em', flex: '0 0 auto',
          },
        }, picking ? '…' : '浏览…'),
      ])

      /** 删除是两步：第一次只是「上膛」，四秒内再点才真删。 */
      const armDelete = row => {
        if (pendingDelete === row.id) {
          void deleteSession(row.id)
          return
        }
        setPendingDelete(row.id)
        setTimeout(() => setPendingDelete(current => (current === row.id ? undefined : current)), 4000)
      }

      // 菜单打开时，点别处就收起。捕获阶段监听，且**不拦事件**（只观察），
      // 所以不会影响别处本来要处理的点击。
      useEffect(() => {
        if (rowMenu === undefined) return undefined
        const close = event => {
          const target = event.target
          if (target !== null && target !== undefined && typeof target.closest === 'function'
            && target.closest('[data-iv-rowmenu]') !== null) return
          setRowMenu(undefined)
        }
        const onKey = event => { if (event.key === 'Escape') setRowMenu(undefined) }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('click', close, true)
          document.addEventListener('keydown', onKey)
        }
        return () => {
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('click', close, true)
            document.removeEventListener('keydown', onKey)
          }
        }
      }, [rowMenu])

      /** 菜单里的一项：淡底、悬停提亮，危险项用自己的语气色。 */
      const menuItemStyle = () => ({
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '7px 10px', borderRadius: RADIUS.sm, border: '1px solid transparent',
        background: 'transparent', color: C.boneDim, cursor: 'pointer',
        fontFamily: F.ui, fontSize: TYPE.sub.fontSize, textAlign: 'left',
      })

      /**
       * 左栏的一行：**标题 + 一行 Meta + 一个「⋯」**。
       *
       * 归档/删除**必须不挡标题**——上一版把两个图标绝对定位在行尾，
       * 悬停时正好压在截断的标题上（用户第一眼看到的就是"按钮把字盖住了"）。
       * 现在改成：常驻一枚 26px 的「⋯」，点开才出现两项动作。
       * 好处是三重的：不遮挡、不跳动（宽度始终占着）、触屏也点得到。
       */
      const sessionRow = row => {
        const active = row.id === selected
        const armed = pendingDelete === row.id
        const open = rowMenu === row.id
        return h('div', {
          key: row.id,
          className: 'iv-row',
          style: {
            position: 'relative', display: 'flex', alignItems: 'center',
            marginBottom: 4, borderRadius: RADIUS.sm,
            background: active ? C.surface2 : 'transparent',
            border: `1px solid ${active ? C.ruleSoft : 'transparent'}`,
            // 选中的那一行是**从列表里抬起来的一张纸**，不是涂深的一格。
            boxShadow: active ? C.elev1 : 'none',
            transition: 'background 160ms var(--iv-ease), border-color 160ms var(--iv-ease), box-shadow 160ms var(--iv-ease)',
          },
        }, [
          h('button', {
            key: 'b',
            type: 'button',
            // 标题被省略号截断时，悬停要能看全——这是「可点击的岗位按钮」
            // 唯一能自证身份的地方（原生 title 悬浮框不会被侧栏的滚动裁掉）。
            title: row.title,
            'aria-current': active ? 'true' : undefined,
            style: {
              flex: '1 1 auto', minWidth: 0, textAlign: 'left', cursor: 'pointer',
              padding: '8px 4px 8px 10px', border: 'none', background: 'transparent',
              fontFamily: F.ui, color: active ? C.bone : C.boneDim,
            },
            onClick: () => guardRun('切换面试', () => setSelected(row.id)),
          }, [
            h('div', {
              key: 't',
              style: {
                ...TYPE.body, lineHeight: 1.4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              },
            }, shortTitle(row)),
            h(Meta, {
              key: 'm',
              tone: 'faint',
              style: {
                display: 'block', marginTop: 2, letterSpacing: '0.1em',
                overflow: 'hidden', textOverflow: 'ellipsis',
              },
            }, rowMeta(row, shortTitle(row))),
          ]),
          h('div', {
            key: 'act',
            'data-iv-rowmenu': '1',
            style: { position: 'relative', flex: '0 0 auto', display: 'flex', alignItems: 'center', paddingRight: 2 },
          }, [
            h(IconBtn, {
              key: 'more',
              label: open ? '收起场次操作' : '场次操作',
              title: '存档、删除这场面试',
              style: {
                minWidth: 26, minHeight: 26, padding: '4px',
                background: open ? C.ink700 : 'transparent',
                color: open || active ? C.boneDim : C.boneFaint,
              },
              onClick: () => setRowMenu(open ? undefined : row.id),
            }, h('span', {
              key: 'g',
              'aria-hidden': true,
              style: { fontFamily: F.mono, fontSize: 13, lineHeight: 1, letterSpacing: 0 },
            }, '⋯')),
            open
              ? h('div', {
                key: 'menu',
                role: 'menu',
                style: {
                  position: 'absolute', right: 0, top: 'calc(100% + 2px)', zIndex: 40,
                  minWidth: 132, padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
                  ...S.surface('stage'), boxShadow: C.elev4,
                  animation: 'ivRise 160ms var(--iv-ease) backwards',
                },
              }, [
                // 续接：只有「已结束」的场次才有这一步。它不重开一轮——
                // 转录、底稿、计时都接着上一轮走（AGENTS §6.14）。
                row.status === 'done'
                  ? h('button', {
                    key: 'cont',
                    type: 'button',
                    title: '接着这场面试继续（转录与底稿都保留）',
                    style: menuItemStyle(),
                    onClick: () => { setRowMenu(undefined); void continueSession(row) },
                  }, '续接面试')
                  : null,
                h('button', {
                  key: 'reset',
                  type: 'button',
                  title: '清掉这场面试的记录（转录 / 报告 / 计时），保留简历、JD 与底稿',
                  style: menuItemStyle(),
                  onClick: () => { setRowMenu(undefined); setResetTarget(row) },
                }, '重置记录…'),
                h('button', {
                  key: 'arch',
                  type: 'button',
                  title: row.archived ? '取消归档（内容都还在）' : '归档这场面试（只是收起来，内容都还在）',
                  style: menuItemStyle(),
                  onClick: () => { setRowMenu(undefined); archiveRow(row) },
                }, row.archived ? '取消归档' : '归档'),
                h('button', {
                  key: 'del',
                  type: 'button',
                  title: armed ? '再点一次确认删除（卷宗目录一起删，不可恢复）' : '删除这场面试（连同卷宗目录，不可恢复）',
                  style: { ...menuItemStyle(), color: armed ? C.tally : C.boneDim },
                  onClick: () => {
                    if (armed) { setRowMenu(undefined); void deleteSession(row.id); return }
                    armDelete(row)
                  },
                }, armed ? '确认删除' : '删除'),
              ])
              : null,
          ]),
        ])
      }

      /** 窄面板里的横向场次卡：动作常驻（触屏没有 hover，藏起来就点不到）。 */
      const sessionCard = row => {
        const active = row.id === selected
        const armed = pendingDelete === row.id
        return h('div', {
          key: row.id,
          style: {
            flex: '0 0 184px', width: 184, display: 'flex', alignItems: 'stretch',
            borderRadius: RADIUS.sm, overflow: 'hidden',
            background: active ? C.ink750 : 'transparent',
            border: `1px solid ${active ? C.ruleSoft : 'transparent'}`,
          },
        }, [
          h('button', {
            key: 'b',
            type: 'button',
            title: row.title,
            'aria-current': active ? 'true' : undefined,
            style: {
              flex: '1 1 auto', minWidth: 0, textAlign: 'left', cursor: 'pointer',
              padding: '7px 8px', border: 'none', background: 'transparent',
              fontFamily: F.ui, color: active ? C.bone : C.boneDim,
            },
            onClick: () => guardRun('切换面试', () => setSelected(row.id)),
          }, [
            h('div', {
              key: 't',
              style: {
                ...TYPE.body, lineHeight: 1.35,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              },
            },
            // 窄布局没有公司组头，所以标题**保留完整写法**（通常就是「公司 · 岗位」），
            // 只把状态与考点放进第二行——两行都截断得干干净净。
            row.title),
            h(Meta, {
              key: 'm',
              tone: 'faint',
              style: {
                display: 'block', marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis',
              },
            }, rowMeta(row, row.title)),
          ]),
          h('div', {
            key: 'act',
            style: { display: 'flex', alignItems: 'center', flex: '0 0 auto', paddingRight: 2 },
          }, [
            h(IconBtn, {
              key: 'arch',
              label: row.archived ? '取消归档' : '归档这场面试',
              title: row.archived ? '取消归档（内容都还在）' : '归档这场面试（只是收起来，内容都还在）',
              style: { minWidth: 22, minHeight: 22, padding: '4px' },
              onClick: () => archiveRow(row),
            }, h(ArchiveGlyph, { key: 'g' })),
            h(IconBtn, {
              key: 'del',
              tone: 'tally',
              label: '删除这场面试',
              title: armed ? '再点一次确认删除' : '删除这场面试（连同卷宗目录）',
              style: {
                minWidth: 22, minHeight: 22, padding: '4px',
                background: armed ? TONES.tally.wash : 'transparent',
                borderColor: armed ? TONES.tally.edge : 'transparent',
              },
              onClick: () => armDelete(row),
            }, h(TrashGlyph, { key: 'g' })),
          ]),
        ])
      }

      return h('div', {
        ref: pageRef,
        'data-iv-page': '1',
        'data-iv-theme': theme,
        // 布局闸门用它验证「点了页签，真的换页了」——
        // 截图闸门曾经把设置页截成准备页，就是因为没人验证这一步。
        'data-iv-tab': tab,
        className: 'iv-root',
        // **主题变量挂在根节点上。**
        // 自定义属性会被后代继承，所以下面所有 `var(--iv-*)` 都跟着变；
        // 切换主题只需要根节点换一套值，其余元素一个都不用重渲染。
        style: { ...S.page, ...THEMES[theme] },
      }, [
        // 点阵层：在页面上半部隐约可见（径向遮罩写在 30-theme 的 .iv-grid 里）。
        // 它不是装饰网格——它是「这块屏是仪表」的暗示，给页头与舞台一点纵深。
        h('div', { key: 'grid', className: 'iv-grid', 'aria-hidden': 'true' }),
        // 页头：**一行的身份 + 一行的仪表**。
        //
        // 旧版是三行常驻文字（产品名 / 一句设计说明 / 常驻路径行），
        // 把页头撑得比内容还高，整页看起来「上面全是小字」。
        // 现在：第一行 = 记号 + 产品名 + 当前场次 + 控件；
        //       第二行 = 状态芯片 + 卷宗库芯片。
        // 「简历 + JD → 一场有准备的面试」是**设计说明书**，删掉——
        // 记号与页面已经在说这件事（docs/DESIGN.md §1）。
        h('div', {
          key: 'head',
          'data-iv-head': '1',
          style: {
            ...S.head,
            flexDirection: 'column', alignItems: 'stretch', gap: 8,
            ...(narrow ? { padding: '12px 14px 10px' } : {}),
            borderBottom: `1px solid ${C.ruleSoft}`,
          },
        }, [
          h('div', {
            key: 'top',
            style: {
              display: 'flex', alignItems: 'center', flexWrap: 'wrap',
              gap: narrow ? 10 : 16, minWidth: 0,
            },
          }, [
            h('div', {
              key: 'id',
              'data-iv-brand': '1',
              style: {
                display: 'flex', alignItems: 'center', gap: 12, minWidth: 0,
                flex: narrow ? '1 1 100%' : '1 1 auto',
              },
            }, [
              // 记号：一块很薄的「铭牌」托着它，让它在明暗两套底色上
              // 都像被装上去的，而不是飘在页面上的一个图标。
              h('div', {
                key: 'mark',
                'data-iv-mark': '1',
                style: {
                  flex: '0 0 auto', width: 36, height: 36, display: 'grid', placeItems: 'center',
                  borderRadius: RADIUS.md, color: C.bone,
                  background: C.surface2, border: `1px solid ${C.ruleSoft}`, boxShadow: C.elev1,
                },
              }, [h(BrandMark, { key: 'svg', size: 22 })]),
              h('div', {
                key: 'names',
                style: { display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 },
              }, [
                h('span', {
                  key: 'brand',
                  style: { ...S.title, flex: '0 0 auto', whiteSpace: 'nowrap' },
                }, '模拟面试间'),
                current === undefined
                  ? null
                  : h('span', {
                    key: 'sep',
                    style: { fontFamily: F.mono, ...TYPE.meta, color: C.boneFaint, flex: '0 0 auto' },
                  }, '·'),
                // 当前这场面试的标题：页头要能回答「我现在在哪一场里」。
                // 窄面板下它会先被省略号吃掉（minWidth: 0 是这条的开关），
                // 但产品名永远在。
                current === undefined
                  ? null
                  : h('span', {
                    key: 'name',
                    title: current.title,
                    style: {
                      ...TYPE.body, color: C.boneDim, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    },
                  }, current.title),
              ]),
            ]),
            h('div', {
              key: 'ctl',
              style: {
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                marginLeft: narrow ? 0 : 'auto', minWidth: 0,
                flex: narrow ? '1 1 100%' : '0 0 auto',
              },
            }, [tabStrip, themeButton, newSessionButton]),
          ]),
          h('div', {
            key: 'meta',
            style: {
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
              minWidth: 0, paddingLeft: narrow ? 0 : 48,
            },
          }, [
            // 状态：一条芯片说完「在不在面试、底稿问到哪了」。
            current === undefined
              ? h(Pill, { key: 'status', tone: 'faint' }, '未建场次')
              : h(Pill, { key: 'status', tone: statusTone(current.status) }, [
                h('span', {
                  key: 'dot',
                  style: {
                    display: 'inline-block', width: 5, height: 5, borderRadius: RADIUS.pill,
                    background: 'currentColor', marginRight: 6, verticalAlign: 1,
                  },
                }),
                `${current.status ?? 'draft'}${statusChipText === '' ? '' : ` · ${statusChipText}`}`,
              ]),
            rootChip,
          ]),
        ]),

        // 通知条：**浮在页面上的一层**，不占布局。
        //
        // 旧版把它当一个正常的 flex 行插在页头下面：弹出一条，整页内容
        // 就往下跳一次，关掉又跳回来——用户感受到的是「页面大幅抖动」。
        // 现在外层是一个**零高度**的托盘（它自己在页头之后，所以就是页头
        // 下缘），提醒条按内容宽度居中、浮在内容之上；
        // 4 秒后先淡出再卸载（见上面的定时器）。
        notice === undefined
          ? null
          : h('div', {
            key: 'notice-tray',
            // 零高度 + 不遮挡 ：托盘自己不接收点击，只有那条提醒接收。
            // `alignItems: flex-start` 不能省——默认 stretch 会把提醒条
            // 拉成 0 高（托盘只有 0 高）。
            style: {
              display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
              height: 0, flex: '0 0 auto', zIndex: 200, pointerEvents: 'none',
              padding: '0 16px', boxSizing: 'border-box',
            },
          }, h('div', {
            key: 'notice',
            'data-iv-notice': notice.kind,
            role: notice.kind === 'error' ? 'alert' : 'status',
            'aria-live': notice.kind === 'error' ? 'assertive' : 'polite',
            style: {
              // **按内容收窄**：一条「已保存」不该铺满整页宽，那会把
              // 面板最亮的位置让给一条系统消息。
              marginTop: 8,
              width: 'max-content', maxWidth: 'min(640px, 100%)',
              display: 'flex', alignItems: 'center', gap: 12,
              flexWrap: narrow ? 'wrap' : 'nowrap',
              padding: narrow ? '9px 12px' : '9px 12px 9px 14px',
              // 磨砂 + 一级浮起的影：它盖在内容上，所以必须**看得出来是浮着的**。
              background: C.glass,
              backdropFilter: 'blur(12px) saturate(1.1)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.1)',
              borderWidth: 1, borderStyle: 'solid',
              borderColor: notice.kind === 'error' ? TONES.tally.edge
                : notice.kind === 'ok' ? TONES.jade.edge
                  : notice.kind === 'warn' ? TONES.amber.edge : C.rule,
              borderRadius: RADIUS.md,
              boxShadow: C.elev3,
              pointerEvents: 'auto',
              opacity: notice.leaving === true ? 0 : 1,
              transform: notice.leaving === true ? 'translateY(-6px)' : 'none',
              transition: 'opacity 240ms var(--iv-ease), transform 240ms var(--iv-ease)',
              animation: 'ivToastIn 220ms var(--iv-ease) backwards',
            },
          }, [
            // 一条 2px 的语气刻度：颜色只说明「这是什么性质的通知」，
            // 不整条铺色——铺色会把面板最亮的位置让给一条系统消息。
            h('span', {
              key: 'tick',
              'aria-hidden': 'true',
              style: {
                flex: '0 0 auto', width: 2, height: 16, borderRadius: RADIUS.pill,
                background: notice.kind === 'error' ? C.tally
                  : notice.kind === 'ok' ? C.jade
                    : notice.kind === 'warn' ? C.amber : C.accent,
              },
            }),
            h('span', {
              key: 't',
              style: {
                ...TYPE.sub, fontWeight: 600, flex: '0 0 auto',
                color: notice.kind === 'error' ? C.tally
                  : notice.kind === 'ok' ? C.jade
                    : notice.kind === 'warn' ? C.amber : C.bone,
              },
            }, notice.title),
            notice.detail !== undefined
              ? h('span', {
                key: 'd',
                style: {
                  ...TYPE.sub, color: C.boneFaint, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: narrow ? 'normal' : 'nowrap',
                },
              }, notice.detail)
              : null,
            // 通知条也能带一个动作（「撤销新建」「放弃修改并关闭」）。
            //
            // **为什么动作在通知里，而不是弹一个模态框。** 通知已经在
            // 视线最上方；而模态框会挡住面试页——面试进行中弹模态框，
            // 是最不该做的事。
            notice.action !== undefined
              ? h('button', {
                key: 'a',
                type: 'button',
                style: {
                  flex: '0 0 auto', padding: '3px 12px', borderRadius: RADIUS.sm,
                  cursor: 'pointer', fontFamily: F.ui, ...TYPE.sub,
                  color: C.bone, background: C.ink700, border: `1px solid ${C.rule}`,
                },
                onClick: () => {
                  const action = notice.action
                  setNotice(undefined)
                  action.run()
                },
              }, notice.action.label)
              : null,
            h(IconBtn, {
              key: 'x',
              label: '关闭通知',
              title: '关闭通知',
              onClick: () => setNotice(undefined),
              style: { marginLeft: 'auto', flex: '0 0 auto', minWidth: 26, minHeight: 26 },
            }, h('span', {
              key: 'g',
              'aria-hidden': true,
              style: { fontSize: TYPE.body.fontSize, lineHeight: 1 },
            }, '×')),
          ])),

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
                borderRight: 'none', borderBottom: `1px solid ${C.rule}`, background: C.surface3,
                boxShadow: `inset 0 -1px 0 ${C.ruleSoft}`,
              }
              : S.rail,
          }, [
            h('div', {
              key: 'h',
              style: narrow
                ? { display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }
                : { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px 10px' },
            }, [
              h(Meta, { key: 'l', tone: 'faint' }, '面试场次'),
              // 归档只是「收起来」——收起来之后得有个地方把它再翻出来。
              // 清理是另一件事：勾选一批场次删掉，或一键收拾空场次。
              rows.length === 0
                ? null
                : h('div', {
                  key: 'acts',
                  style: {
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto',
                  },
                }, [
                  h(IconBtn, {
                    key: 'mgr',
                    label: '记录清理',
                    title: '记录清理：勾选要删的场次，或一键清理空场次',
                    style: { minWidth: 0, minHeight: 0, padding: '2px 8px' },
                    onClick: () => setManagerOpen(true),
                  }, '清理'),
                  archivedRows.length > 0
                    ? h(IconBtn, {
                      key: 'a',
                      label: showArchived ? '收起已归档的场次' : `显示已归档的 ${archivedRows.length} 场`,
                      title: showArchived ? '收起已归档的场次' : `显示已归档的 ${archivedRows.length} 场`,
                      style: { flex: '0 0 auto', minWidth: 0, minHeight: 0, padding: '2px 8px' },
                      onClick: () => setShowArchived(value => !value),
                    }, showArchived ? '收起' : `归档 ${archivedRows.length}`)
                    : null,
                ]),
            ]),
            // 空状态：一句话 + 一个动作（Empty 自带虚线框，不写说明书）。
            visibleRows.length === 0
              ? h('div', { key: 'e', style: { paddingTop: 4 } }, [
                h(Empty, {
                  key: 'empty',
                  title: '还没有面试场次',
                  action: h('button', {
                    key: 'new',
                    type: 'button',
                    style: S.btn('primary', false),
                    onClick: () => guardRun('新建面试', createSession),
                  }, '新建面试'),
                }),
              ])
              : narrow
                // 窄：一条横向的场次带。分组在这种形态里没有意义
                // （一行放不下一个组头），所以只平铺。
                ? visibleRows.map(row => sessionCard(row))
                // 宽：按公司分组。组头 = 公司名 + 场数，可点开/收起。
                // 行内的岗位名放第二行小字——组头短了，行才认得出。
                : groups.map(group => {
                  const collapsed = collapsedGroups[group.key] === true
                  return h('div', { key: group.key, style: { marginBottom: 12 } }, [
                    h('button', {
                      key: 'gh',
                      type: 'button',
                      'aria-expanded': !collapsed,
                      title: collapsed ? `展开「${group.label}」` : `收起「${group.label}」`,
                      style: {
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '3px 6px 6px', minWidth: 0,
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontFamily: F.ui, textAlign: 'left',
                      },
                      onClick: () => setCollapsedGroups(previous => ({
                        ...previous,
                        [group.key]: !collapsed,
                      })),
                    }, [
                      h('span', {
                        key: 'chev',
                        'aria-hidden': 'true',
                        style: {
                          display: 'inline-block', width: 0, height: 0, flex: '0 0 auto',
                          borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                          borderTop: `5px solid ${C.boneFaint}`,
                          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                          transition: 'transform 160ms var(--iv-ease)',
                        },
                      }),
                      h('span', {
                        key: 'n',
                        style: {
                          ...TYPE.sub, color: C.boneDim, minWidth: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        },
                      }, group.label),
                      h(Meta, {
                        key: 'c',
                        tone: 'faint',
                        style: { marginLeft: 'auto', flex: '0 0 auto' },
                      }, `${group.items.length} 场`),
                    ]),
                    collapsed ? null : group.items.map(row => sessionRow(row)),
                  ])
                }),
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
            // 设置页**不依赖「当前有一场面试」**：卷宗库路径、语音、保护开关
            // 都是插件级的事实。刚装好、一场都还没建的时候，这一页正是
            // 用户要进的地方——所以它排在最前面，不受 session 判空影响。
            tab === 'settings'
              ? h(SettingsView, {
                key: 'settings',
                session,
                config,
                notify,
                // 主题的开关在面板这一层（它要驱动整页的样式变量），
                // 设置页只是它的一个面板——所以状态通过 props 透传。
                theme,
                themeFollow,
                hostScheme,
                onChangeTheme: setTheme,
                onChangeThemeFollow: setThemeFollow,
              })
              : session === undefined
                // 空场次时**左栏已经有「还没有面试场次 + 新建面试」**了，
                // 主区不再放第二个一模一样的空状态——同一个信息不写两遍。
                // 这里只留一条状态：「现在没有可看的场次」。
                ? h('div', {
                  key: 'k25',
                  style: { padding: '48px 0', display: 'flex', justifyContent: 'center' },
                }, h(Meta, { key: 'empty', tone: 'faint' }, '没有进行中的面试'))
                : tab === 'prepare'
                  ? h(PrepareView, {
                    key: 'prepare',
                    session,
                    config,
                    onChanged: refreshAll,
                    notify,
                    // 清单出来后直接去面试间——不用再让用户自己去点页签。
                    onGoLive: () => guardRun('去面试', () => setTab('live')),
                  })
                  : tab === 'live'
                    ? h(LiveView, { key: 'live', session, config, onChanged: refreshAll, notify })
                    : h(ReportView, {
                      key: 'report',
                      session,
                      config,
                      onChanged: refreshAll,
                      notify,
                      onGoLive: () => guardRun('续接面试', () => setTab('live')),
                    }),
            sessionPoll.error !== undefined && !sessionGone
              ? h('div', {key: 'k26',  style: { ...S.hint, color: C.amber, marginTop: 12 } }, `读不到会话状态：${sessionPoll.error}`)
              : null,
          ]),
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
        // 记录清理与重置确认都**浮在面板之上**：它们改的是磁盘上的卷宗，
        // 不是这一页的临时状态——所以必须能在任何页签下打开。
        managerOpen
          ? h(SessionsDialog, {
            key: 'manager',
            onCancel: () => setManagerOpen(false),
            onApplied: refreshAll,
            notify,
          })
          : null,
        resetTarget === undefined
          ? null
          : h(ResetDialog, {
            key: 'reset',
            row: resetTarget,
            onCancel: () => setResetTarget(undefined),
            onConfirm: drop => { void resetSession(resetTarget, drop) },
          }),
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
