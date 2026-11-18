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
        if (jdUrl.trim() === '') {
          notify('没链接', '先把岗位链接填上，再交给助手。', 'error')
          return
        }
        setBusy(true)
        try {
          const result = await apiPost('jd/request-agent', { sessionId, url: jdUrl.trim() })
          setJdNote({
            ok: true,
            text: `${result?.message ?? '已经交给助手了。'}`,
          })
          notify(
            '交给助手了',
            `${result?.message ?? '已经交给助手了。'}在 DSH 对话区能看到它跑；抓到的正文会自动回到这一场。`,
            'ok',
          )
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : String(failure)
          setJdNote({ ok: false, text: `${message}。可以改用下面的手动兜底：把正文粘进 JD 框里。` })
        } finally {
          setBusy(false)
        }
      }, [jdUrl, sessionId, notify])

      // ── 让助手出底稿 ──────────────────────────────────────────────
      //
      // 填完简历和 JD 之后，如果没有这一步，用户就卡在"底稿怎么办"上。
      // 派活同样落在面试工作区，产出由 interview_save_checklist 写回。
      const askChecklist = useCallback(async () => {
        setBusy(true)
        try {
          const result = await apiPost('agent/checklist', { sessionId })
          const host = result?.hostSession ?? {}
          notify(
            '已让助手出底稿',
            `${result?.message ?? ''}。产出后会自动出现在这张卡里。`,
            'ok',
          )
          void host
        } catch (failure) {
          notify('派不出去', failure instanceof Error ? failure.message : String(failure), 'error')
        } finally {
          setBusy(false)
        }
      }, [sessionId, notify])

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
          style: S.btn(false, busy || jdUrl.trim() === ''),
          title: '把链接发给 DSH 对话里的助手，让它把正文抄回来',
          onClick: askAgent,
        }, '让助手去抓'),
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
            }, [jdLinkRow, jdNoteBlock, jdSlot]),
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
                    style: S.btn('primary', busy),
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
              checklist.length === 0
                ? null
                : h('div', { key: 'next', style: { ...S.row, marginTop: 14 } }, [
                  h('button', {
                    key: 'go',
                    style: S.btn('primary', false),
                    onClick: () => props.onGoLive?.(),
                  }, '进入面试中 →'),
                  h('button', {
                    key: 're',
                    style: S.btn(regenArm ? 'tally' : false, busy),
                    // 破坏性操作的后果写在悬停里：点下去会覆盖现有清单。
                    title: regenArm ? '会覆盖现有清单' : '让助手重新调研，生成新清单',
                    onClick: () => {
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
      const lastQuestionRef = useRef('')

      // ── 话轮状态机（docs/TURN-TAKING.md §3）─────────────────────────────
      //
      // 唯一真源在客户端（它拥有麦克风/VAD/TTS 的实时状态）；Host 只持久化
      // 粗粒度会话状态（running/paused），不镜像细粒度话轮相态。
      const sessionId = session?.session?.id
      const status = session?.session?.status
      const running = status === 'running'
      const paused = status === 'paused'
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

      const startInterview = useCallback(async () => {
        // 这是整个面试里最可靠的一次用户手势：在这里解锁音频，
        // 第一句提问自动播报时才不会被浏览器拦掉。
        unlockAudio()
        try {
          // Host 端 startSession 置 running 并**异步派活开场**（§5.1）：
          // 点完这一下，助手自己会开口，不需要再去 DSH 对话区做任何事。
          await apiPost(`sessions/${session.session.id}/start`, {})
          // 本地先进 thinking：开场白由轮询带回来（新问题 → questioning）。
          setTurnPhase('thinking')
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
       */
      const acquireMedia = async () => {
        setAcquireStage({ text: '正在申请麦克风…' })
        const stream = await media.start()
        const micOk = (stream?.getAudioTracks?.() ?? []).length > 0
        const camOk = (stream?.getVideoTracks?.() ?? []).length > 0
        if (camOk) {
          setAcquireStage({ text: '✓ 麦克风与摄像头已接入' })
          return
        }
        if (!inDesktopHost()) {
          setAcquireStage({ text: micOk ? '✓ 麦克风已接入；摄像头没拿到（可再试一次）' : '麦克风与摄像头都没接上；键盘输入可用。' })
          return
        }
        setAcquireStage({ text: `${micOk ? '✓ 麦克风已接入 · ' : ''}摄像头被桌面端挡下，正在尝试宿主采集…` })
        const started = await hostCamera.start()
        setAcquireStage({
          text: `${micOk ? '✓ 麦克风已接入 · ' : ''}${started ? '✓ 摄像头已通过宿主接入' : '摄像头仍未接上（可点「用宿主摄像头」重试）'}`,
        })
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
      const durationMs = session?.stats?.durationMs ?? 0
      const tooShortForReport = durationMs > 0 && durationMs < 3 * 60 * 1000
      const dispatchReport = async () => {
        try {
          const result = await apiPost('agent/report', { sessionId: session?.session?.id })
          notify('已让助手写报告', result?.message ?? '产出后会自动出现在「报告」页。', 'ok')
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
          }, paused || isResumeState
            ? [paused ? pauseBoard : resumeBoard]
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
                h('button', {
                  key: 'ask',
                  style: S.btn('primary', media.busy),
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
            tone: paused ? 'amber' : running ? (turnPhase === 'listening' ? 'jade' : 'amber') : undefined,
          }, paused
            ? '已暂停'
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
        h('div', { key: 'a', style: { ...S.row } }, [
          // **手动发送永远在**（§7 纪律：键盘兜底是硬纪律，自动只是叠加）。
          h('button', {
            key: 's',
            style: S.btn('primary', answer.trim() === ''),
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
                : h('button', { key: 'st', style: S.btn('primary', false), onClick: () => { void startInterview() } }, '开始面试'),
            !running && !paused && !reportReady
              ? h('button', {
                key: 'report',
                style: S.btn(tooShortForReport ? false : 'primary', false),
                title: tooShortForReport
                  ? '这场太短，报告分析不出什么；真需要可以让助手在对话里写'
                  : '让助手写事后分析报告',
                onClick: () => { void dispatchReport() },
              }, tooShortForReport ? '太短，仍可生成' : '生成事后报告')
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
      const { session, notify } = props
      const report = session?.report ?? ''
      const durationMs = session?.stats?.durationMs ?? 0
      const tooShortForReport = durationMs > 0 && durationMs < 3 * 60 * 1000
      const dispatchReport = async () => {
        try {
          const result = await apiPost('agent/report', { sessionId: session?.session?.id })
          notify('已让助手写报告', result?.message ?? '产出后会自动出现在这里。', 'ok')
        } catch (failure) {
          notify('派不出去', failure instanceof Error ? failure.message : String(failure), 'error')
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
          report === ''
            ? null
            : h('button', {
              key: 're',
              style: { ...S.btn(false, false), marginLeft: 'auto' },
              title: '让助手重新写一份',
              onClick: () => { void dispatchReport() },
            }, '重新生成'),
        ]),

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
                style: S.btn('primary', false),
                onClick: () => { void dispatchReport() },
              }, tooShortForReport ? '仍然生成' : '让助手写报告'),
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

