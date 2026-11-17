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
        '--iv-elev-1': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.025), inset 0 -1px 0 rgba(2,4,9,0.45), inset 0 -16px 24px -20px rgba(2,4,9,0.75), 0 1px 2px rgba(2,4,9,0.62), 0 0 0 1px rgba(2,4,9,0.50), 0 20px 42px -20px rgba(2,4,9,0.92)',
        '--iv-elev-2': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(2,4,9,0.48), inset 0 -16px 24px -20px rgba(2,4,9,0.78), 0 1px 3px rgba(2,4,9,0.68), 0 0 0 1px rgba(2,4,9,0.52), 0 30px 60px -22px rgba(2,4,9,0.96)',
        '--iv-elev-3': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(2,4,9,0.50), 0 2px 6px rgba(2,4,9,0.70), 0 0 0 1px rgba(2,4,9,0.55), 0 48px 96px -30px rgba(2,4,9,1)',
        '--iv-elev-4': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.03), 0 2px 8px rgba(2,4,9,0.75), 0 0 0 1px rgba(2,4,9,0.60), 0 70px 130px -40px #000',
        // 舞台专用：比 elev-4 收一点——它下面还压着回答框，影太散会把下一条盖住。
        '--iv-elev-stage': 'inset 0 1px 0 var(--iv-hi), inset 1px 0 0 rgba(255,255,255,0.03), 0 2px 8px rgba(2,4,9,0.72), 0 0 0 1px rgba(2,4,9,0.58), 0 44px 84px -34px rgba(2,4,9,0.95)',
        // 主按钮：**一块被按在台面上的骨白键**。上亮下暗才是实体。
        '--iv-primary-top': '#F4F6F9',
        '--iv-primary-bottom': '#D2D7DE',
        '--iv-primary-text': '#080A0D',
        '--iv-primary-shadow': 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(0,0,0,0.22), 0 1px 2px rgba(0,0,0,0.55), 0 10px 22px -14px rgba(0,0,0,0.85)',
        '--iv-glass': 'rgba(7,9,13,0.72)',
        '--iv-vignette': 'radial-gradient(125% 92% at 50% 4%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.42) 82%, rgba(0,0,0,0.62) 100%)',
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
