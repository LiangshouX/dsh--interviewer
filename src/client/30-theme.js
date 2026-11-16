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

