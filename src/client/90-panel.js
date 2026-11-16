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

      // ── 面板外的离开拦截 ──────────────────────────────────────────────
      //
      // 侧栏切到「会话 / 自媒体工作台 / Skill-MCP」这类导航由 DSH 完成，
      // 不是我们的按钮——只能在这里**捕获阶段拦一次**：设备开着时，
      // 点击落在面板左侧（DSH 侧栏）就先问；确认后把这次点击重放回去。
      // 顶部菜单栏允许通过，避免把无关点击也拦住。
      const guardStateRef = useRef({ quiet: false, running: false })
      guardStateRef.current = { quiet: guardQuiet, running: session?.session?.status === 'running' }
      useEffect(() => {
        if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
        const handler = event => {
          if (!mediaInUse().any || guardStateRef.current.quiet) return
          const root = pageRef.current
          if (root === null || root === undefined || typeof root.getBoundingClientRect !== 'function') return
          // 只拦**面板左侧**的点击（DSH 侧栏是导航入口）；顶部菜单与面板内放行。
          const rect = root.getBoundingClientRect()
          if (event.clientX >= rect.left) return
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
