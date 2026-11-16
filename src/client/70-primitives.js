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
              onClick: onConfirm,
            }, danger && guard.second !== true ? '再次点击确认离开' : '确认离开'),
          ]),
        ]),
      ])
    }
