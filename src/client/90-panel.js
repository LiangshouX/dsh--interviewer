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

      /**
       * 重置一场面试的记录：**两种模式**（彻底清掉 / 留副本再重置）。
       *
       * 界面照抄 Host 返回的 `cleared` 数字，不自己编「清掉了什么」。
       */
      const resetSession = useCallback(async (row, mode) => {
        try {
          const result = await apiPost(`sessions/${row.id}/reset`, { mode })
          const cleared = result?.cleared ?? {}
          const parts = []
          if (cleared.turns > 0) parts.push(`${cleared.turns} 条转录`)
          if (cleared.report === true) parts.push('报告')
          if (cleared.recordings > 0) parts.push(`${cleared.recordings} 个录音录像`)
          if (cleared.checklistProbed > 0) parts.push(`${cleared.checklistProbed} 个「问过」标记`)
          setResetTarget(undefined)
          const archived = typeof result?.archivedTo === 'string' ? result.archivedTo : ''
          notify(
            archived === '' ? '已彻底清掉这一轮' : '已留副本并重置',
            archived === ''
              ? `${parts.length > 0 ? `清掉 ${parts.join('、')}；` : ''}简历、JD、底稿都还在。`
              : `${parts.length > 0 ? `清掉 ${parts.join('、')}；` : ''}副本在 ${archived}`,
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
                  title: '清掉这一轮面试的记录（转录 / 报告 / 录音），保留简历、JD 与底稿',
                  style: menuItemStyle(),
                  onClick: () => { setRowMenu(undefined); setResetTarget(row) },
                }, '重置这一轮…'),
                // 批量整理（删除 / 空场次 / 归档副本）——单行菜单里也留一个入口，
                // 免得用户只记得「删这一场」而找不到「管理所有记录」。
                h('button', {
                  key: 'mgr',
                  type: 'button',
                  title: '管理面试记录：勾选删除、查看留副本的归档',
                  style: menuItemStyle(),
                  onClick: () => { setRowMenu(undefined); setManagerOpen(true) },
                }, '管理所有记录…'),
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
              // 宽：**三段式**——表头固定、列表自己滚、管理入口固定贴底。
              // 管理入口如果跟着列表滚，场次一多用户就再也看不见它
              // （上一版就是把「清理」塞在表头的小字里，结果没人找到）。
              : { ...S.rail, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: 8 },
          }, [
            h('div', {
              key: 'h',
              style: narrow
                ? { display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }
                : { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px 2px', flex: '0 0 auto' },
            }, [
              h(Meta, { key: 'l', tone: 'faint' }, '面试场次'),
              // 归档只是「收起来」——收起来之后得有个地方把它再翻出来。
              archivedRows.length > 0
                ? h('div', {
                  key: 'acts',
                  style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' },
                }, [
                  h(IconBtn, {
                    key: 'a',
                    label: showArchived ? '收起已归档的场次' : `显示已归档的 ${archivedRows.length} 场`,
                    title: showArchived ? '收起已归档的场次' : `显示已归档的 ${archivedRows.length} 场`,
                    style: { flex: '0 0 auto', minWidth: 0, minHeight: 0, padding: '2px 8px' },
                    onClick: () => setShowArchived(value => !value),
                  }, showArchived ? '收起' : `归档 ${archivedRows.length}`),
                ])
                : null,
            ]),
            // 列表：只有这一段滚（窄布局里它是横向场次带，不滚纵向）。
            h('div', {
              key: 'list',
              style: narrow
                ? { display: 'flex', alignItems: 'stretch', gap: 8, flex: '0 0 auto', minWidth: 0 }
                : { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: 2 },
            }, [
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
            // **管理面试记录：常驻在左栏底部。**
            //
            // 上一版把它做成表头里一枚小「清理」，用户根本没看见——
            // 「找不到」等于「没做」。所以这里给足位置：整行按钮 +
            // 说明它管什么（删除 / 重置 / 留副本的归档）。
            narrow
              ? h('button', {
                key: 'mgr-narrow',
                type: 'button',
                title: '管理面试记录：勾选删除、重置、查看归档副本',
                style: { ...S.btn(false, false), flex: '0 0 auto', padding: '6px 10px' },
                onClick: () => setManagerOpen(true),
              }, '记录…')
              : h('button', {
                key: 'mgr',
                type: 'button',
                'data-iv-manage': '1',
                title: '管理面试记录：勾选删除、重置这一轮、查看留副本的归档',
                style: {
                  flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '9px 10px', borderRadius: RADIUS.sm,
                  background: 'transparent', border: `1px solid ${C.ruleSoft}`,
                  color: C.boneDim, cursor: 'pointer', fontFamily: F.ui,
                  fontSize: TYPE.sub.fontSize, textAlign: 'left',
                },
                onClick: () => setManagerOpen(true),
              }, [
                h('span', { key: 'g', 'aria-hidden': true, style: { fontFamily: F.mono, fontSize: 12 } }, '⌦'),
                h('span', { key: 't', style: { flex: '1 1 auto', minWidth: 0 } }, '管理面试记录'),
                h(Meta, { key: 'c', tone: 'faint' }, `${rows.length} 场`),
              ]),
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
                // 「管理面试记录」在设置页也留一个入口（左栏底部是主入口）。
                onManageRecords: () => setManagerOpen(true),
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
            onConfirm: mode => { void resetSession(resetTarget, mode) },
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
