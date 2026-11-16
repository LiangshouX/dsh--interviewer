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
