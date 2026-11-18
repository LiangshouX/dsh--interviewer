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
