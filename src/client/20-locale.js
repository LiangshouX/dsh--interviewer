    // ── locale ────────────────────────────────────────────────────────────
    const LOCALE_NS = 'dsh-realtime-interview'
    /** The panel id: the sidebar entry's id and the `main` slot's key. */
    const PANEL_ID = 'interviewer'
    /** How often the interview view refreshes from the host. */
    const POLL_MS = 1500

    const DICT = {
      zh: {
        'brand.title': '模拟面试间',
        // 「简历 + JD → 一场有准备的面试」这句副标题**已删除**：
        // 它是设计说明书，不是界面（docs/DESIGN.md §1）。页头的品牌记号
        // 与页面本身已经在说这件事，不必再写一行字解释自己。
        'tab.prepare': '准备',
        'tab.live': '面试中',
        'tab.report': '报告',
        'tab.settings': '设置',
        'action.new': '新建面试',
        'action.save': '保存',
        'action.fetch': '抓取',
        'action.submit': '提交回答',
        'action.copy': '复制',
        'action.start': '开始面试',
        'action.stop': '结束',
        'action.camera.on': '开摄像头',
        'action.camera.off': '关摄像头',
        'action.record.on': '开始录音',
        'action.record.off': '停止录音',
        'action.asr.on': '开始识别',
        'action.asr.off': '停止识别',
        'action.speak': '朗读问题',
        'action.upload': '上传文件',
        // 页头上的两枚芯片：卷宗库（末两段路径 + 可点换目录）与关闭通知。
        'action.browse': '浏览…',
        'action.closeNotice': '关闭通知',
        // 场次行的两个悬停动作。
        'action.archive': '归档',
        'action.unarchive': '取出',
        'action.delete': '删除',
        'state.empty': '还没有面试。',
        'state.ready': '准备就绪',
        'state.listening': '正在聆听…',
        'state.idle': '待命',
        'theme.dark': '暗色',
        'theme.light': '亮色',
        'theme.toDark': '切换到暗色主题',
        'theme.toLight': '切换到亮色主题',
      },
      en: {
        'brand.title': 'Mock interview room',
        'tab.prepare': 'Prepare',
        'tab.live': 'Live',
        'tab.report': 'Report',
        'tab.settings': 'Settings',
        'action.new': 'New interview',
        'action.save': 'Save',
        'action.fetch': 'Fetch',
        'action.submit': 'Submit answer',
        'action.copy': 'Copy',
        'action.start': 'Start',
        'action.stop': 'Finish',
        'action.camera.on': 'Camera on',
        'action.camera.off': 'Camera off',
        'action.record.on': 'Record',
        'action.record.off': 'Stop recording',
        'action.asr.on': 'Listen',
        'action.asr.off': 'Stop',
        'action.speak': 'Read question',
        'action.upload': 'Upload',
        'action.browse': 'Browse…',
        'action.closeNotice': 'Dismiss',
        'action.archive': 'Archive',
        'action.unarchive': 'Restore',
        'action.delete': 'Delete',
        'state.empty': 'No interview yet.',
        'state.ready': 'Ready',
        'state.listening': 'Listening…',
        'state.idle': 'Idle',
        'theme.dark': 'Dark',
        'theme.light': 'Light',
        'theme.toDark': 'Switch to the dark theme',
        'theme.toLight': 'Switch to the light theme',
      },
    }

