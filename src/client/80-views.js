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

