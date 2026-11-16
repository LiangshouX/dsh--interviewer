/**
 * 设置页：**能改的都能生效，不能改的明确说只读。**
 *
 * 这一页不是 DSH 设置页的替代品，是「模拟面试间」自己的控制台：
 *
 *   可改：语音识别链路 / 播报模型与音色 / 摄像头采集后端与路径 /
 *         录像与录音开关 / 面试间保护开关
 *   只读：数据根、产物清单、宿主模型目录——这些是"事实"，不是"偏好"
 *
 * 写入走 `POST /settings`（白名单 + 规格校验）；**配置文件里显式写过的项
 * 会拒绝面板覆盖，并说明原因**，不会假装保存成功。
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
  const [busy, setBusy] = useState('')
  const [diagnosis, setDiagnosis] = useState(undefined)
  // 空场次清理同样两步确认。
  const [purgeArm, setPurgeArm] = useState(false)
  const [form, setForm] = useState(undefined)

  // 首次拿到快照时，用**面板设置**填表单（没设置过的项留空，让 placeholder 显示生效值）。
  useEffect(() => {
    if (form !== undefined || data === undefined) return
    const settings = data.settings ?? {}
    setForm({
      asrProvider: settings.asrProvider ?? 'auto',
      asrEndpoint: settings.asrEndpoint ?? '',
      asrBaseUrl: settings.asrBaseUrl ?? '',
      asrModel: settings.asrModel ?? '',
      asrApiKeyEnv: settings.asrApiKeyEnv ?? '',
      asrLanguage: settings.asrLanguage ?? '',
      ttsProvider: settings.ttsProvider ?? 'auto',
      ttsModel: settings.ttsModel ?? '',
      ttsVoice: settings.ttsVoice ?? '',
      ttsBaseUrl: settings.ttsBaseUrl ?? '',
      ttsApiKeyEnv: settings.ttsApiKeyEnv ?? '',
      ttsFormat: settings.ttsFormat ?? '',
      ttsRate: settings.ttsRate === undefined ? '' : String(settings.ttsRate),
      ttsStyle: settings.ttsStyle ?? '',
      cameraBackend: settings.cameraBackend ?? 'auto',
      ffmpegPath: settings.ffmpegPath ?? '',
      chromiumPath: settings.chromiumPath ?? '',
      recordVideo: settings.recordVideo,
      recordAudio: settings.recordAudio,
      guardEnabled: settings.guardEnabled,
    })
  }, [data, form])

  const set = useCallback((key, value) => setForm(previous => ({ ...previous, [key]: value })), [])

  const save = useCallback(async (patch, label) => {
    const cleaned = {}
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === undefined) continue
      if (key === 'ttsRate') {
        const number = Number(value)
        if (!Number.isFinite(number)) { notify('保存失败', '语速必须是数字', 'error'); return }
        cleaned[key] = number
        continue
      }
      cleaned[key] = value
    }
    setBusy(label)
    try {
      const result = await apiPost('settings', cleaned)
      const invalid = result?.invalid ?? []
      const ignored = result?.ignored ?? []
      const problems = [...invalid, ...ignored]
      notify(
        problems.length === 0 ? '设置已保存' : '部分设置没保存',
        problems.length === 0
          ? '下一次操作就会按新设置执行。'
          : problems.map(item => item.reason).join('；'),
        problems.length === 0 ? 'ok' : 'error',
      )
      snapshot.refresh()
    } catch (failure) {
      notify('保存失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [notify, snapshot])

  const runDiagnose = useCallback(async () => {
    setBusy('diagnose')
    try {
      const result = await apiGet('camera/diagnose')
      setDiagnosis(result)
      notify(result.ok ? '摄像头可用' : '摄像头不可用', result.ok ? `采集后端：${result.backend ?? '未知'}` : (result.reason ?? ''), result.ok ? 'ok' : 'error')
    } catch (failure) {
      notify('自检失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [notify])

  const purgeEmpty = useCallback(async () => {
    if (!purgeArm) {
      setPurgeArm(true)
      setTimeout(() => setPurgeArm(false), 5000)
      return
    }
    setBusy('purge')
    try {
      const result = await apiPost('sessions/cleanup', {})
      const removed = (result?.removed ?? []).length
      notify('已清理', `${removed} 场空面试已从磁盘删除。`, 'ok')
      setPurgeArm(false)
      snapshot.refresh()
    } catch (failure) {
      notify('清理失败', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [purgeArm, notify, snapshot])

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

  if (data === undefined || form === undefined) {
    return h('div', { style: { ...S.card, padding: '18px 20px', color: C.boneFaint, fontSize: 12.5, lineHeight: 1.8 } },
      snapshot.error === undefined ? '正在读取…' : `读不到设置：${snapshot.error}`)
  }

  const effective = data.effective ?? {}
  const voice = data.voice ?? {}
  const asr = voice.asr ?? {}
  const tts = voice.tts ?? {}
  const camera = data.camera ?? {}
  const backends = data.backends ?? {}
  const model = data.speechModel ?? {}

  /** 一行「标签 → 值（+ 来源/理由）」，只读。 */
  const line = (key, label, value, hint) => h('div', {
    key,
    style: { display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${C.ruleSoft}` },
  }, [
    h('span', { key: 'l', style: { ...S.label, width: 96, flex: '0 0 auto', marginBottom: 0 } }, label),
    h('span', { key: 'v', style: { flex: '1 1 auto', minWidth: 0, fontSize: 12.5, color: C.bone, wordBreak: 'break-all', fontFamily: F.mono } }, value),
    hint !== undefined ? h('span', { key: 'h', style: { flex: '0 0 auto', fontSize: 11, color: C.boneFaint } }, hint) : null,
  ])

  /** 表单字段：label + 控件 + 生效值提示。 */
  const field = (key, label, control, effectiveText) => h('div', { key }, [
    h('div', { key: 'l', style: S.label }, label),
    control,
    effectiveText !== undefined
      ? h('div', { key: 'e', style: { fontSize: 10.5, color: C.boneFaint, marginTop: 4, fontFamily: F.mono } }, `生效：${effectiveText}`)
      : null,
  ])

  const input = (key, placeholder) => h('input', {
    key: 'i',
    style: S.input,
    value: form[key],
    placeholder,
    onChange: event => set(key, event.target.value),
  })

  const select = (key, options) => h('select', {
    key: 's',
    style: S.input,
    value: form[key],
    onChange: event => set(key, event.target.value),
  }, options.map(option => h('option', { key: option.value, value: option.value }, option.label)))

  const checkbox = (key, label) => h('label', {
    key,
    style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: C.boneDim, cursor: 'pointer', padding: '4px 0' },
  }, [
    h('input', {
      key: 'c',
      type: 'checkbox',
      checked: form[key] === true,
      onChange: event => set(key, event.target.checked),
    }),
    h('span', { key: 's' }, label),
  ])

  const section = (key, title, children, hint) => h('div', { key, style: { ...S.card, padding: '16px 18px' } }, [
    h('div', { key: 'h', style: { ...S.cardHead, marginBottom: 10 } }, [
      h('span', { key: 'e', style: S.eyebrow }, title),
      hint !== undefined ? h('span', { key: 's', style: { fontSize: 11, color: C.boneFaint } }, hint) : null,
    ]),
    ...children,
  ])

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
    section('asr', '语音识别', [
      h('div', { key: 'g', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 } }, [
        field('asrProvider', '识别来源', select('asrProvider', [
          { value: 'auto', label: 'auto（宿主 → 服务端 → 浏览器）' },
          { value: 'host', label: 'host（只用宿主）' },
          { value: 'browser', label: 'browser（浏览器识别）' },
          { value: 'minimax', label: 'minimax（服务端）' },
          { value: 'openai', label: 'openai（服务端）' },
          { value: 'none', label: 'none（关闭）' },
        ]), asr.mode),
        field('asrEndpoint', '识别端点（可选）', input('asrEndpoint', effective.asrEndpoint || '例如 https://api.example.com/v1/audio/transcriptions'), effective.asrEndpoint || '内置'),
        field('asrBaseUrl', 'Base URL（可选）', input('asrBaseUrl', effective.asrBaseUrl || '留空 = 该来源默认'), effective.asrBaseUrl || '默认'),
        field('asrModel', '识别模型', input('asrModel', effective.asrModel || '留空 = 该来源默认'), effective.asrModel || '默认'),
        field('asrApiKeyEnv', '凭据变量名', input('asrApiKeyEnv', effective.asrApiKeyEnv || '例如 MIMO_API_KEY'), effective.asrApiKeyEnv || '默认'),
        field('asrLanguage', '识别语言', input('asrLanguage', effective.asrLanguage || 'zh'), effective.asrLanguage || 'zh'),
      ]),
      h('div', { key: 'b', style: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' } }, [
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'asr'),
          onClick: () => save({
            asrProvider: form.asrProvider,
            asrEndpoint: form.asrEndpoint,
            asrBaseUrl: form.asrBaseUrl,
            asrModel: form.asrModel,
            asrApiKeyEnv: form.asrApiKeyEnv,
            asrLanguage: form.asrLanguage,
          }, 'asr'),
        }, busy === 'asr' ? '保存中…' : '保存识别设置'),
      ]),
    ], asr.reason ?? ''),

    section('tts', '语音播报', [
      h('div', { key: 'g', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 } }, [
        field('ttsProvider', '播报来源', select('ttsProvider', [
          { value: 'auto', label: 'auto（模型 → 免密钥自然音 → 浏览器）' },
          { value: 'host', label: 'host（只用宿主）' },
          { value: 'mimo', label: 'mimo' },
          { value: 'openai', label: 'openai' },
          { value: 'minimax', label: 'minimax' },
          { value: 'baidu', label: 'baidu（免密钥）' },
          { value: 'edge', label: 'edge（免密钥）' },
          { value: 'browser', label: 'browser（系统音色）' },
          { value: 'none', label: 'none（不播报）' },
        ]), tts.mode),
        field('ttsModel', '播报模型', input('ttsModel', effective.ttsModel || '留空 = 该来源默认'), effective.ttsModel || '默认'),
        field('ttsVoice', '音色', input('ttsVoice', effective.ttsVoice || '留空 = 默认音色'), effective.ttsVoice || '默认'),
        field('ttsBaseUrl', 'Base URL（可选）', input('ttsBaseUrl', effective.ttsBaseUrl || '留空 = 该来源默认'), effective.ttsBaseUrl || '默认'),
        field('ttsApiKeyEnv', '凭据变量名', input('ttsApiKeyEnv', effective.ttsApiKeyEnv || '例如 MIMO_API_KEY'), effective.ttsApiKeyEnv || '默认'),
        field('ttsFormat', '音频格式', select('ttsFormat', [
          { value: '', label: '默认' },
          { value: 'mp3', label: 'mp3' },
          { value: 'wav', label: 'wav' },
        ]), effective.ttsFormat),
        field('ttsRate', '语速', input('ttsRate', String(effective.ttsRate ?? 1)), String(effective.ttsRate ?? 1)),
        field('ttsStyle', '风格指令（可选）', input('ttsStyle', effective.ttsStyle || '例如：语速偏慢、沉稳'), effective.ttsStyle || '无'),
      ]),
      h('div', { key: 'b', style: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' } }, [
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'tts'),
          onClick: () => save({
            ttsProvider: form.ttsProvider,
            ttsModel: form.ttsModel,
            ttsVoice: form.ttsVoice,
            ttsBaseUrl: form.ttsBaseUrl,
            ttsApiKeyEnv: form.ttsApiKeyEnv,
            ttsFormat: form.ttsFormat,
            ttsRate: form.ttsRate,
            ttsStyle: form.ttsStyle,
          }, 'tts'),
        }, busy === 'tts' ? '保存中…' : '保存播报设置'),
      ]),
    ], tts.reason ?? ''),

    section('camera', '摄像头', [
      h('div', { key: 'g', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 } }, [
        field('cameraBackend', '采集后端', select('cameraBackend', [
          { value: 'auto', label: 'auto（ffmpeg 优先，失败回落浏览器）' },
          { value: 'ffmpeg', label: 'ffmpeg（只用 DirectShow）' },
          { value: 'chromium-mf', label: 'Chromium（Media Foundation）优先' },
        ]), camera.backend === 'chromium-mf' ? 'Chromium（Media Foundation）' : (camera.backend === 'ffmpeg' ? 'ffmpeg' : '未接通')),
        field('ffmpegPath', 'ffmpeg 路径', input('ffmpegPath', backends.ffmpeg?.found === true ? backends.ffmpeg.path : 'D:\\tools\\ffmpeg\\bin\\ffmpeg.exe'),
          backends.ffmpeg?.found === true ? `${backends.ffmpeg.path}（${backends.ffmpeg.source}）` : '未找到'),
        field('chromiumPath', 'Chrome / Edge 路径', input('chromiumPath', backends.chromium?.found === true ? backends.chromium.path : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),
          backends.chromium?.found === true ? `${backends.chromium.path}（${backends.chromium.source}）` : '未找到'),
      ]),
      h('div', { key: 'b', style: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' } }, [
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'camera'),
          onClick: () => save({
            cameraBackend: form.cameraBackend,
            ffmpegPath: form.ffmpegPath,
            chromiumPath: form.chromiumPath,
          }, 'camera'),
        }, busy === 'camera' ? '保存中…' : '保存摄像头设置'),
        h('button', { key: 'diag', style: S.btn(false, busy === 'diagnose'), onClick: runDiagnose },
          busy === 'diagnose' ? '正在自检…' : '自检摄像头'),
      ]),
      diagnosis !== undefined
        ? h('div', { key: 'diag', style: { paddingTop: 10, fontSize: 11.5, lineHeight: 1.8, color: diagnosis.ok ? C.jade : C.amber } }, [
          h('div', { key: 'a' }, diagnosis.ok ? `可用 · 后端 ${diagnosis.backend ?? '未知'}` : `不可用 · ${diagnosis.reason ?? ''}`),
          diagnosis.hint !== undefined && diagnosis.hint !== '' ? h('div', { key: 'b', style: { color: C.boneFaint } }, diagnosis.hint) : null,
          (diagnosis.probes ?? []).map(probe => h('div', { key: probe.name, style: { color: C.boneFaint, fontFamily: F.mono } },
            `${probe.name}: ${probe.ok ? '抓帧成功' : (probe.detail ?? '失败')}`)),
        ])
        : null,
    ], camera.running === true ? '画面已接通' : '未接通'),

    section('privacy', '录像与录音', [
      checkbox('recordVideo', '允许录像（关掉 = 面板不出现录像入口）'),
      checkbox('recordAudio', '允许录音（关掉 = 面板不出现录音入口）'),
      h('div', { key: 'b', style: { marginTop: 10 } }, [
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'privacy'),
          onClick: () => save({ recordVideo: form.recordVideo, recordAudio: form.recordAudio }, 'privacy'),
        }, busy === 'privacy' ? '保存中…' : '保存隐私设置'),
      ]),
    ]),

    section('guard', '面试间保护', [
      checkbox('guardEnabled', '离开面试间前确认（关闭后直接释放设备，不再提示）'),
      line('gq', '退出提醒', data.settings?.guardQuiet === true ? '已关闭（以后不再提醒）' : '开启'),
      h('div', { key: 'b', style: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' } }, [
        h('button', { key: 'save', style: S.btn('primary', busy === 'guard'), onClick: () => save({ guardEnabled: form.guardEnabled }, 'guard') },
          busy === 'guard' ? '保存中…' : '保存保护设置'),
        h('button', { key: 'reset', style: S.btn(false, data.settings?.guardQuiet !== true), onClick: () => save({ guardQuiet: false }, 'guard') }, '恢复退出提醒'),
      ]),
      h('div', { key: 'note', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.7, paddingTop: 6 } },
        '面试中退出会强制二次确认；面板内切页签/切面试与侧栏切到其他面板都会被拦下。'),
    ]),

    section('env', '环境（只读）', [
      line('root', '数据根', data.dataRoot?.path ?? '', data.dataRoot?.source),
      h('div', { key: 'why', style: { fontSize: 11.5, color: C.boneFaint, lineHeight: 1.7, padding: '4px 0 8px' } }, data.dataRoot?.reason ?? ''),
      line('sessions', '面试目录', data.sessionsDir ?? ''),
      line('profiles', '岗位档案', data.profilesDir ?? ''),
      line('settings', '设置文件', data.settingsFile ?? ''),
      line('host', '宿主工作区', data.hostWorkspace?.path ?? ''),
      line('wsreg', 'DSH 工作区', data.workspaceRegistration?.registered === true
        ? `已登记 · ${data.workspaceRegistration.title || data.workspaceRegistration.workspaceId}`
        : (data.workspaceRegistration === undefined ? '尚未登记（派活/建场次时会自动登记）' : '未登记'), data.workspaceRegistration?.workspaceId ?? ''),
      line('model', '宿主模型', `${model.provider ?? ''} · ${formatBytes(model.bytes ?? 0)} · ${model.files ?? 0} 个文件`, model.exists === true ? '已就绪' : '未下载'),
      line('modeldir', '模型目录', model.dir ?? ''),
      (data.emptySessions ?? []).length > 0
        ? h('div', { key: 'empty', style: { paddingTop: 8 } }, [
          line('ec', '空场次', `${data.emptySessions.length} 场`, '没有任何内容'),
          h('div', { key: 'b', style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } }, [
            h('button', {
              key: 'purge',
              style: S.btn(purgeArm ? 'tally' : 'primary', busy === 'purge'),
              onClick: purgeEmpty,
            }, busy === 'purge' ? '清理中…' : (purgeArm ? '再次点击确认清理' : `清理 ${data.emptySessions.length} 场空场次`)),
          ]),
          h('div', { key: 'n', style: { fontSize: 11, color: C.boneFaint, lineHeight: 1.7, paddingTop: 6 } },
            '只删没有任何内容的场次；有简历 / JD / 考点 / 转录 / 报告的一场都不会动。'),
        ])
        : null,
      h('div', { key: 'b', style: { marginTop: 8 } }, [
        h('button', { key: 'prep', style: S.btn(false, busy === 'model'), onClick: prepareModel }, busy === 'model' ? '正在准备…' : '准备语音模型'),
      ]),
      session === undefined ? null : h('div', { key: 'session' }, [
        line('sid', '面试 id', data.session?.id ?? ''),
        line('sdir', '卷宗目录', data.session?.dir ?? ''),
        (data.session?.artifacts ?? []).map(item => line(
          `a-${item.name}`,
          item.kind === 'video' ? '录像' : item.kind === 'audio' ? '录音' : '文件',
          item.name,
          formatBytes(item.bytes),
        )),
      ]),
    ]),
  ])
}
