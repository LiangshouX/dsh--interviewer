/**
 * 设置页：**所有「东西在哪、现在用哪个」都在这里回答。**
 *
 * 这一页不是 DSH 的设置页的替代品，也不是要再占一个位置——它是「模拟面试间」
 * 自己的透明面板：数据根、当前面试与产物、宿主工作区、语音链路与模型、
 * 摄像头两条采集通道、麦克风/摄像头状态、以及面试间保护的开关。
 *
 * 纪律：
 *  - 读的是 Host 的 `/settings` 快照（单一真源），页面**不自己推断**；
 *  - 改设置走 `POST /settings`（白名单键），配置文件里写死的项会被拒绝并说明原因；
 *  - 每个「现在用的是哪个」都要同时给出**原因**，不只是状态。
 */
function SettingsView(props) {
  const { session, notify } = props
  const sessionId = session?.session?.id
  const snapshot = usePoll(
    () => apiGet('settings', sessionId === undefined ? undefined : { session: sessionId }),
    5000,
    [sessionId],
  )
  const data = snapshot.data
  const [ffmpegPath, setFfmpegPath] = useState('')
  const [chromiumPath, setChromiumPath] = useState('')
  const [ttsProvider, setTtsProvider] = useState('auto')
  const [ttsModel, setTtsModel] = useState('')
  const [ttsVoice, setTtsVoice] = useState('')
  const [diagnosis, setDiagnosis] = useState(undefined)
  const [busy, setBusy] = useState('')

  // 首次拿到快照时把输入框填上（之后以用户输入为准，不被轮询覆盖）。
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || data === undefined) return
    seeded.current = true
    setFfmpegPath(data.settings?.ffmpegPath ?? '')
    setChromiumPath(data.settings?.chromiumPath ?? '')
    setTtsProvider(data.settings?.ttsProvider ?? 'auto')
    setTtsModel(data.settings?.ttsModel ?? '')
    setTtsVoice(data.settings?.ttsVoice ?? '')
  }, [data])

  const save = useCallback(async patch => {
    try {
      const result = await apiPost('settings', patch)
      const ignored = result?.ignored ?? []
      notify(
        ignored.length === 0 ? '设置已保存' : '部分设置没生效',
        ignored.length === 0 ? '下一次操作就会按新设置执行。' : ignored.map(item => item.reason).join('；'),
        ignored.length === 0 ? 'ok' : 'error',
      )
      snapshot.refresh()
    } catch (failure) {
      notify('保存失败', failure instanceof Error ? failure.message : String(failure), 'error')
    }
  }, [notify])

  const runDiagnose = useCallback(async () => {
    setBusy('diagnose')
    try {
      const result = await apiGet('camera/diagnose')
      setDiagnosis(result)
      notify(
        result.ok ? '摄像头可用' : '摄像头不可用',
        result.ok ? `采集后端：${result.backend ?? '未知'}` : (result.reason ?? ''),
        result.ok ? 'ok' : 'error',
      )
    } catch (failure) {
      notify('自检失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [notify])

  const prepareModel = useCallback(async () => {
    setBusy('model')
    try {
      const result = await apiPost('voice/prepare', {})
      notify(result.ok ? '已开始准备语音模型' : '准备没启动', result.reason ?? '', result.ok ? 'ok' : 'error')
    } catch (failure) {
      notify('准备失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
      snapshot.refresh()
    }
  }, [notify])

  /** 一行「标签 → 值（+ 来源/理由）」。 */
  const line = (key, label, value, hint) => h('div', {
    key,
    style: {
      display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0',
      borderBottom: `1px solid ${C.ruleSoft}`,
    },
  }, [
    h('span', { key: 'l', style: { ...S.label, width: 96, flex: '0 0 auto', marginBottom: 0 } }, label),
    h('span', { key: 'v', style: { flex: '1 1 auto', minWidth: 0, fontSize: 12.5, color: C.bone, wordBreak: 'break-all', fontFamily: F.mono } }, value),
    hint !== undefined ? h('span', { key: 'h', style: { flex: '0 0 auto', fontSize: 11, color: C.boneFaint } }, hint) : null,
  ])

  if (data === undefined) {
    return h('div', { style: { ...S.card, padding: '18px 20px', color: C.boneFaint, fontSize: 12.5, lineHeight: 1.8 } }, loadingHint(snapshot.error))
  }

  const voice = data.voice ?? {}
  const asr = voice.asr ?? {}
  const tts = voice.tts ?? {}
  const camera = data.camera ?? {}
  const backends = data.backends ?? {}
  const model = data.speechModel ?? {}

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } }, [
    h('div', { key: 'data' }, [
      h('div', { key: 'h', style: S.eyebrow }, '数据在哪'),
      line('root', '卷宗库', data.dataRoot?.path ?? '', data.dataRoot?.source),
      h('div', { key: 'why', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.7, padding: '4px 0 8px' } }, data.dataRoot?.reason ?? ''),
      line('sessions', '面试目录', data.sessionsDir ?? ''),
      line('profiles', '岗位档案', data.profilesDir ?? ''),
      line('settings', '设置文件', data.settingsFile ?? ''),
      line('host', '宿主工作区', data.hostWorkspace?.path ?? ''),
      h('div', { key: 'note', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.7 } }, data.hostWorkspace?.note ?? ''),
    ]),

    session === undefined ? null : h('div', { key: 'session' }, [
      h('div', { key: 'h', style: S.eyebrow }, '这一场的产物'),
      line('id', '面试 id', session.session?.id ?? ''),
      line('dir', '卷宗目录', data.session?.dir ?? ''),
      (data.session?.artifacts ?? []).map(item => line(
        `a-${item.name}`,
        item.kind === 'video' ? '录像' : item.kind === 'audio' ? '录音' : '文件',
        item.name,
        formatBytes(item.bytes),
      )),
    ]),

    h('div', { key: 'voice' }, [
      h('div', { key: 'h', style: S.eyebrow }, '语音：现在用哪条'),
      line('asr', '识别', `${asr.mode ?? '?'}${asr.host?.provider?.name !== undefined ? ` · ${asr.host.provider.name}` : ''}`, asr.source),
      h('div', { key: 'ar', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.7, padding: '2px 0 6px' } }, asr.reason ?? ''),
      line('tts', '播报', `${tts.mode ?? '?'}${tts.label !== undefined ? ` · ${tts.label}` : ''}`, tts.source),
      h('div', { key: 'tr', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.7, padding: '2px 0 6px' } }, tts.reason ?? ''),
      line('model', '宿主模型', `${model.provider ?? ''} · ${formatBytes(model.bytes ?? 0)} · ${model.files ?? 0} 个文件`, model.exists === true ? '已就绪' : '未下载'),
      line('modeldir', '模型目录', model.dir ?? ''),
      h('div', { key: 'modelbtns', style: { display: 'flex', gap: 8, paddingTop: 8, flexWrap: 'wrap' } }, [
        h('button', {
          key: 'prep',
          style: S.btn(false, busy === 'model'),
          onClick: prepareModel,
        }, busy === 'model' ? '正在准备…' : '准备语音模型'),
      ]),
      h('div', { key: 'ttsform', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 12 } }, [
        h('div', { key: 'p' }, [
          h('div', { key: 'l', style: S.label }, '播报来源（面板设置）'),
          h('select', {
            key: 's',
            style: S.input,
            value: ttsProvider,
            onChange: event => setTtsProvider(event.target.value),
          }, ['auto', 'browser', 'mimo', 'openai', 'minimax', 'baidu', 'edge', 'none'].map(name => h('option', { key: name, value: name }, name))),
        ]),
        h('div', { key: 'm' }, [
          h('div', { key: 'l', style: S.label }, '播报模型'),
          h('input', {
            key: 'i',
            style: S.input,
            value: ttsModel,
            placeholder: '留空 = 该来源的默认模型',
            onChange: event => setTtsModel(event.target.value),
          }),
        ]),
        h('div', { key: 'v' }, [
          h('div', { key: 'l', style: S.label }, '音色'),
          h('input', {
            key: 'i',
            style: S.input,
            value: ttsVoice,
            placeholder: '留空 = 默认音色',
            onChange: event => setTtsVoice(event.target.value),
          }),
        ]),
        h('div', { key: 'save', style: { display: 'flex', alignItems: 'flex-end' } }, [
          h('button', {
            key: 'b',
            style: S.btn('primary', false),
            onClick: () => save({ ttsProvider, ttsModel, ttsVoice }),
          }, '保存语音设置'),
        ]),
      ]),
    ]),

    h('div', { key: 'camera' }, [
      h('div', { key: 'h', style: S.eyebrow }, '摄像头：两条采集通道'),
      line('backend', '当前后端', camera.backend === 'chromium-mf' ? 'Chromium（Media Foundation）' : camera.backend === 'ffmpeg' ? 'ffmpeg（DirectShow）' : '未接通'),
      line('fstate', '状态', camera.running === true ? (camera.hasFrame === true ? '画面已接通' : '进程在，但还没出帧') : '未启动'),
      line('ff', 'ffmpeg', backends.ffmpeg?.found === true ? backends.ffmpeg.path : '未找到', backends.ffmpeg?.source),
      line('cr', 'Chromium', backends.chromium?.found === true ? backends.chromium.path : '未找到', backends.chromium?.source),
      h('div', { key: 'paths', style: { display: 'grid', gridTemplateColumns: '1fr', gap: 10, paddingTop: 10 } }, [
        h('div', { key: 'f' }, [
          h('div', { key: 'l', style: S.label }, 'ffmpeg 路径（留空 = 走 PATH）'),
          h('input', {
            key: 'i',
            style: S.input,
            value: ffmpegPath,
            placeholder: 'D:\\tools\\ffmpeg\\bin\\ffmpeg.exe',
            onChange: event => setFfmpegPath(event.target.value),
          }),
        ]),
        h('div', { key: 'c' }, [
          h('div', { key: 'l', style: S.label }, 'Chrome / Edge 路径（留空 = 自动发现）'),
          h('input', {
            key: 'i',
            style: S.input,
            value: chromiumPath,
            placeholder: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            onChange: event => setChromiumPath(event.target.value),
          }),
        ]),
        h('div', { key: 'b', style: { display: 'flex', gap: 8, flexWrap: 'wrap' } }, [
          h('button', { key: 'save', style: S.btn('primary', false), onClick: () => save({ ffmpegPath, chromiumPath }) }, '保存路径'),
          h('button', { key: 'diag', style: S.btn(false, busy === 'diagnose'), onClick: runDiagnose }, busy === 'diagnose' ? '正在自检…' : '自检摄像头'),
        ]),
      ]),
      diagnosis !== undefined
        ? h('div', { key: 'diag', style: { paddingTop: 10, fontSize: 11.5, lineHeight: 1.8, color: diagnosis.ok ? C.jade : C.amber } }, [
          h('div', { key: 'a' }, diagnosis.ok ? `可用 · 后端 ${diagnosis.backend ?? '未知'}` : `不可用 · ${diagnosis.reason ?? ''}`),
          diagnosis.hint !== undefined && diagnosis.hint !== ''
            ? h('div', { key: 'b', style: { color: C.boneFaint } }, diagnosis.hint)
            : null,
          (diagnosis.probes ?? []).map(probe => h('div', { key: probe.name, style: { color: C.boneFaint, fontFamily: F.mono } }, `${probe.name}: ${probe.ok ? '抓帧成功' : (probe.detail ?? '失败')}`)),
        ])
        : null,
    ]),

    h('div', { key: 'guard' }, [
      h('div', { key: 'h', style: S.eyebrow }, '面试间保护'),
      line('gq', '退出提醒', data.settings?.guardQuiet === true ? '已关闭（以后不再提醒）' : '开启'),
      h('div', { key: 'b', style: { paddingTop: 8 } }, [
        h('button', {
          key: 'reset',
          style: S.btn(false, data.settings?.guardQuiet !== true),
          onClick: () => save({ guardQuiet: false }),
        }, '恢复退出提醒'),
      ]),
      h('div', { key: 'note', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.7, paddingTop: 6 } },
        '面试中退出会强制二次确认；未开始时只提醒一次。'),
    ]),
  ])
}

/** 设置页加载中的一句话。 */
function loadingHint(error) {
  return error === undefined ? '正在读取…' : `读不到设置：${error}`
}
