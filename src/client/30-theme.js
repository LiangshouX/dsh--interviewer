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
      // ── 素墨（暗色）──────────────────────────────────────────────────
      // 参考 dsh-media-desk 的做法：**不靠彩色取胜**。底是中性墨，
      // 只有极淡的环境光（蓝/粉/绿，2% 量级），强调色只在必要时出现。
      // 主按钮是高对比中性色（骨白），不是绿——绿按钮会立刻变成"后台"。
      dark: {
        '--iv-ink900': '#0B0D10',
        '--iv-ink850': '#0F1216',
        '--iv-ink800': '#14181E',
        '--iv-ink750': '#1A1F26',
        '--iv-ink700': '#222932',
        '--iv-rule': 'rgba(255,255,255,0.10)',
        '--iv-rule-soft': 'rgba(255,255,255,0.055)',
        '--iv-bone': '#E7E9EC',
        '--iv-bone-dim': '#A7ADB7',
        '--iv-bone-faint': '#6E757F',
        '--iv-tally': '#E0563F',
        '--iv-amber': '#C9A46A',
        '--iv-jade': '#6FBF9A',
        '--iv-field': '#0C0F13',
        '--iv-on-bone': '#0B0D10',
        '--iv-stage': '#07090C',
        '--iv-plate-top': '#12161C',
        '--iv-plate-mid': '#0B0E12',
        '--iv-plate-low': '#080A0E',
        '--iv-cue-top': 'rgba(7,9,12,0)',
        '--iv-cue-mid': 'rgba(7,9,12,0.84)',
        '--iv-cue-low': 'rgba(7,9,12,0.97)',
        '--iv-band': 'rgba(10,12,16,0.94)',
        '--iv-clock': 'rgba(12,15,19,0.72)',
        '--iv-shadow': 'rgba(0,0,0,0.9)',
        '--iv-sheen': 'rgba(255,255,255,0.05)',
        '--iv-fade': 'rgba(11,13,16,0)',
        // 背景：一层中性底 + 三团 2% 的环境光（蓝/粉/绿），缓慢漂移。
        '--iv-bg': 'radial-gradient(52vmax 52vmax at -8% -14%, rgba(150,185,235,0.10), transparent 66%), '
          + 'radial-gradient(46vmax 46vmax at 108% -6%, rgba(225,170,200,0.07), transparent 64%), '
          + 'radial-gradient(50vmax 50vmax at 30% 116%, rgba(150,205,170,0.07), transparent 66%), '
          + 'linear-gradient(180deg, #0B0D10 0%, #0C0F13 100%)',
        '--iv-glow-jade': 'rgba(111,191,154,0.22)',
        '--iv-glow-cobalt': 'rgba(127,166,217,0.26)',
        '--iv-accent': '#7FA6D9',
        '--iv-tone-faint-text': '#6E757F',
        '--iv-tone-faint-edge': 'rgba(255,255,255,0.14)',
        '--iv-tone-faint-wash': 'rgba(255,255,255,0.05)',
        '--iv-tone-amber-text': '#C9A46A',
        '--iv-tone-amber-edge': 'rgba(201,164,106,0.30)',
        '--iv-tone-amber-wash': 'rgba(201,164,106,0.08)',
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
        '--iv-ink900': '#F6F5F2',
        '--iv-ink850': '#FAF9F6',
        '--iv-ink800': '#FFFFFF',
        '--iv-ink750': '#F1F0EC',
        '--iv-ink700': '#E8E7E2',
        '--iv-rule': 'rgba(20,23,28,0.10)',
        '--iv-rule-soft': 'rgba(20,23,28,0.055)',
        '--iv-bone': '#1E2126',
        '--iv-bone-dim': '#555B64',
        '--iv-bone-faint': '#8A9099',
        '--iv-tally': '#C24A34',
        '--iv-amber': '#8C6A2B',
        '--iv-jade': '#3F7D64',
        '--iv-field': '#FFFFFF',
        '--iv-on-bone': '#FAF9F6',
        '--iv-stage': '#EFEEE9',
        '--iv-plate-top': '#FFFFFF',
        '--iv-plate-mid': '#F7F6F2',
        '--iv-plate-low': '#EDECE7',
        '--iv-cue-top': 'rgba(246,245,242,0)',
        '--iv-cue-mid': 'rgba(246,245,242,0.88)',
        '--iv-cue-low': 'rgba(244,243,239,0.97)',
        '--iv-band': 'rgba(250,249,246,0.96)',
        '--iv-clock': 'rgba(255,255,255,0.85)',
        '--iv-shadow': 'rgba(24,26,30,0.14)',
        '--iv-sheen': 'rgba(255,255,255,0.8)',
        '--iv-fade': 'rgba(246,245,242,0)',
        '--iv-bg': 'radial-gradient(50vmax 50vmax at -6% -12%, rgba(150,185,235,0.10), transparent 66%), '
          + 'radial-gradient(46vmax 46vmax at 106% -8%, rgba(225,180,200,0.08), transparent 64%), '
          + 'radial-gradient(48vmax 48vmax at 32% 112%, rgba(160,205,175,0.08), transparent 66%), '
          + 'linear-gradient(180deg, #F6F5F2 0%, #F7F6F3 100%)',
        '--iv-glow-jade': 'rgba(63,125,100,0.18)',
        '--iv-glow-cobalt': 'rgba(59,110,165,0.20)',
        '--iv-accent': '#3B6EA5',
        '--iv-tone-faint-text': '#8A9099',
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
        // 背景是 **中性底 + 极淡环境光**（见 THEME_CSS 的 ::before 漂移层）。
        backgroundImage: 'var(--iv-bg)', backgroundColor: C.ink900,
        color: C.bone, fontFamily: F.ui, fontSize: 13.5, lineHeight: 1.7,
        WebkitFontSmoothing: 'antialiased', position: 'relative', overflow: 'clip',
      },
      head: {
        display: 'flex', alignItems: 'center', gap: 18, padding: '20px 28px 12px',
        flex: '0 0 auto', background: 'transparent',
      },
      title: { fontFamily: F.voice, fontSize: 21, fontWeight: 600, letterSpacing: '0.02em', lineHeight: 1.25 },
      sub: { fontSize: 11.5, color: C.boneFaint, marginTop: 4, letterSpacing: '0.04em' },
      workspace: {
        fontFamily: F.mono, fontSize: 10.5, color: C.boneFaint, marginTop: 5,
        letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
      tabs: {
        display: 'flex', gap: 2, marginLeft: 'auto', padding: 4,
        background: C.ink700, borderRadius: 14, border: `1px solid ${C.ruleSoft}`,
      },
      tab: (active) => ({
        padding: '6px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
        background: active ? C.bone : 'transparent',
        color: active ? C.ink900 : C.boneDim,
        fontWeight: active ? 600 : 400,
        border: '1px solid transparent',
        transition: 'background 180ms ease, color 180ms ease',
        fontFamily: F.ui, letterSpacing: '0.02em',
      }),
      body: { flex: '1 1 auto', minHeight: 0, display: 'flex' },
      rail: {
        width: 236, flex: '0 0 236px', borderRight: `1px solid ${C.ruleSoft}`,
        overflowY: 'auto', padding: '14px 12px', background: C.ink850,
      },
      main: { flex: '1 1 auto', minWidth: 0, overflowY: 'auto', padding: '16px 28px 44px' },

      card: {
        background: C.ink800,
        border: `1px solid ${C.rule}`,
        borderRadius: 20,
        padding: '20px 22px',
        marginBottom: 18,
        boxShadow: `0 18px 44px -34px ${C.shadow}`,
        transition: 'border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease',
      },
      cardHead: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 },
      eyebrow: {
        fontFamily: F.mono, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: C.boneFaint, flex: '0 0 auto',
      },
      cardTitle: { fontFamily: F.voice, fontSize: 17, fontWeight: 600, letterSpacing: '0.015em' },
      hint: { fontSize: 12, color: C.boneFaint, lineHeight: 1.75 },
      label: { fontSize: 11.5, color: C.boneDim, marginBottom: 8, display: 'block', letterSpacing: '0.03em' },
      input: {
        width: '100%', boxSizing: 'border-box', background: C.field, color: C.bone,
        border: `1px solid ${C.rule}`, borderRadius: 12, padding: '10px 13px', fontSize: 13.5,
        fontFamily: F.ui, outline: 'none', lineHeight: 1.5,
        transition: 'border-color 180ms ease, box-shadow 180ms ease',
      },
      textarea: {
        width: '100%', boxSizing: 'border-box', background: C.field, color: C.bone,
        border: `1px solid ${C.rule}`, borderRadius: 14, padding: '14px', fontSize: 13.5,
        fontFamily: F.ui, outline: 'none', minHeight: 140, resize: 'vertical', lineHeight: 1.8,
        transition: 'border-color 180ms ease, box-shadow 180ms ease',
      },
      btn: (kind, disabled) => {
        const base = {
          padding: '9px 16px', borderRadius: 12, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: F.ui, letterSpacing: '0.02em', lineHeight: 1.5,
          transition: 'background 180ms ease, border-color 180ms ease, color 180ms ease, transform 220ms ease, opacity 180ms ease',
          border: `1px solid ${C.rule}`,
        }
        if (kind === 'primary') {
          // **高对比中性主按钮**，不是绿。绿按钮会让整页退回"后台"。
          return { ...base, background: C.bone, color: C.ink900, borderColor: C.bone, fontWeight: 600, opacity: disabled ? 0.45 : 1 }
        }
        if (kind === 'tally') {
          return { ...base, background: TONES.tally.wash, color: C.tally, borderColor: TONES.tally.edge, opacity: disabled ? 0.45 : 1 }
        }
        return { ...base, background: 'transparent', color: C.boneDim, opacity: disabled ? 0.45 : 1 }
      },
      row: { display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' },
      mono: { fontFamily: F.mono },
      pill: (tone) => {
        const colors = TONES[tone] ?? TONES.faint
        return {
          fontFamily: F.mono, fontSize: 10, padding: '2px 9px', borderRadius: 999,
          border: `1px solid ${colors.edge}`, color: colors.text, background: colors.wash, whiteSpace: 'nowrap',
          letterSpacing: '0.06em', alignSelf: 'flex-start', lineHeight: 1.6,
        }
      },
      overlay: {
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'color-mix(in srgb, var(--iv-ink900) 62%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'ivFade 160ms ease both',
        backdropFilter: 'blur(6px)',
      },
      modal: {
        width: 'min(460px, 100%)', background: C.ink800, border: `1px solid ${C.rule}`,
        borderRadius: 20, padding: '22px 24px',
        boxShadow: `0 48px 120px -44px ${C.shadow}`,
        animation: 'ivRise 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
    }

    /**
     * 全局样式：只在插件页面里生效（都挂在 `[data-iv-page]` 下）。
     *
     * **参考 dsh-media-desk 的"灵"从哪来：** 不是更多颜色，而是
     * 极淡的环境光在缓慢漂移、内容入场有位移、悬停有反馈、点阵给出纵深。
     */
    const THEME_CSS = `
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
      [data-iv-page] > * { position: relative; z-index: 1; }
      @keyframes ivDrift {
        from { background-position: 6% 0%; }
        to { background-position: 94% 100%; }
      }
      [data-iv-page] button { transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 200ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease; }
      [data-iv-page] button:hover { transform: translateY(-1px); }
      [data-iv-page] button:active { transform: scale(0.98); }
      [data-iv-page] button:disabled { transform: none; }
      [data-iv-page] input:focus, [data-iv-page] textarea:focus, [data-iv-page] select:focus {
        border-color: var(--iv-accent) !important;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--iv-accent) 18%, transparent) !important;
      }
      [data-iv-page] ::selection { background: color-mix(in srgb, var(--iv-accent) 22%, transparent); }
      [data-iv-page] ::-webkit-scrollbar { width: 10px; height: 10px; }
      [data-iv-page] ::-webkit-scrollbar-track { background: transparent; }
      [data-iv-page] ::-webkit-scrollbar-thumb { background: var(--iv-rule); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
      [data-iv-page] ::-webkit-scrollbar-thumb:hover { background: var(--iv-bone-faint); background-clip: content-box; }
      /* 舞台：内阴影 + 右上角一点冷光，让"空画面"也有纵深。 */
      [data-iv-page] [data-iv-stage]::after {
        content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
        box-shadow: inset 0 0 90px 24px color-mix(in srgb, var(--iv-stage) 70%, transparent);
        background: radial-gradient(70% 55% at 78% -8%, color-mix(in srgb, var(--iv-accent) 9%, transparent), transparent 62%);
      }
      /* 未接通板：极淡的点阵，给"场"而不是"一块黑"。 */
      [data-iv-page] [data-iv-plate]::before {
        content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5;
        background-image: radial-gradient(circle, color-mix(in srgb, var(--iv-bone) 10%, transparent) 1px, transparent 1.2px);
        background-size: 26px 26px;
      }
      @keyframes ivFade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes ivRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
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
        if (typeof document === 'undefined' || document.getElementById('dsh-iv-style') !== null) return
        const style = document.createElement('style')
        style.id = 'dsh-iv-style'
        style.textContent = THEME_CSS
        document.head.appendChild(style)
      } catch {
        // 注入失败不影响功能：只是少一点悬停与动效。
      }
    }
