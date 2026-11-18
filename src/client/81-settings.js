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
 *
 * 语音两区按 `docs/DESIGN.md §9` 做成「配 → 存 → 测 → 用」闭环：
 *   现在用（一行） / 服务下拉（来自 `GET voice/presets`，前端不硬编码）
 *   / 端点·模型·语言 / 凭据（已有下拉 + 替换 + 清除，密钥只进不出）
 *   / 一个真跑的测试按钮（失败给具体原因与下一步）。
 */
function SettingsView(props) {
  const { session, notify, theme, themeFollow, hostScheme, onChangeTheme, onChangeThemeFollow } = props
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
  // 语音测试的最近一次结果（成功/失败都要留在界面上，失败是出路不是弹窗）。
  const [asrTest, setAsrTest] = useState(undefined)
  const [ttsTest, setTtsTest] = useState(undefined)
  // 正在录 2 秒样本（测试识别用）。
  const [recording, setRecording] = useState(false)
  // 替换密钥：{kind, ref, value}。value 只在这里活到保存成功为止。
  const [secretEdit, setSecretEdit] = useState(undefined)
  // 清除要两步（防手滑，不是防呆）。
  const [clearArm, setClearArm] = useState('')

  // 首次拿到快照时，用**面板设置**填表单（没设置过的项留空，让 placeholder 显示生效值）。
  useEffect(() => {
    if (form !== undefined || data === undefined) return
    const settings = data.settings ?? {}
    setForm({
      asrProvider: settings.asrProvider ?? 'auto',
      asrBaseUrl: settings.asrBaseUrl ?? '',
      asrModel: settings.asrModel ?? '',
      asrApiKeyEnv: settings.asrApiKeyEnv ?? '',
      asrGroupId: settings.asrGroupId ?? '',
      asrLanguage: settings.asrLanguage ?? '',
      ttsProvider: settings.ttsProvider ?? 'auto',
      ttsModel: settings.ttsModel ?? '',
      ttsVoice: settings.ttsVoice ?? '',
      ttsBaseUrl: settings.ttsBaseUrl ?? '',
      ttsApiKeyEnv: settings.ttsApiKeyEnv ?? '',
      ttsGroupId: settings.ttsGroupId ?? '',
      ttsFormat: settings.ttsFormat ?? 'mp3',
      ttsRate: settings.ttsRate === undefined ? '' : String(settings.ttsRate),
      ttsStyle: settings.ttsStyle ?? '',
      cameraBackend: settings.cameraBackend ?? 'auto',
      ffmpegPath: settings.ffmpegPath ?? '',
      chromiumPath: settings.chromiumPath ?? '',
      recordVideo: settings.recordVideo,
      recordAudio: settings.recordAudio,
      guardEnabled: settings.guardEnabled,
      // 回答节奏（docs/TURN-TAKING.md §4.2）：默认 manual——与升级前行为一致。
      answerMode: settings.answerMode ?? 'manual',
      turnEndSilenceMs: settings.turnEndSilenceMs === undefined ? '' : String(settings.turnEndSilenceMs),
      // 虚拟面试官：有效值优先（配置文件写 off 时，面板不该显示成开）。
      interviewerAvatar: (data.effective?.interviewerAvatar ?? settings.interviewerAvatar) !== 'off',
    })
  }, [data, form])

  const set = useCallback((key, value) => setForm(previous => ({ ...previous, [key]: value })), [])

  const save = useCallback(async (patch, label, options = {}) => {
    const cleaned = {}
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      if (key === 'ttsRate' || key === 'turnEndSilenceMs') {
        if (value === '') continue
        const number = Number(value)
        if (!Number.isFinite(number)) {
          notify('没保存', key === 'ttsRate' ? '语速必须是数字' : '静音阈值必须是数字（毫秒）', 'error')
          return
        }
        cleaned[key] = number
        continue
      }
      // 语音区允许把某一项改回空（= 用该服务默认值）；其余区空串 = 不动。
      if (value === '' && options.allowEmpty !== true) continue
      cleaned[key] = value
    }
    setBusy(label)
    try {
      const result = await apiPost('settings', cleaned)
      const invalid = result?.invalid ?? []
      const ignored = result?.ignored ?? []
      const problems = [...invalid, ...ignored]
      notify(
        problems.length === 0 ? '已保存' : '部分没保存',
        problems.length === 0 ? undefined : problems.map(item => item.reason).join('；'),
        problems.length === 0 ? 'ok' : 'error',
      )
      snapshot.refresh()
    } catch (failure) {
      notify('没保存', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [notify, snapshot])

  const runDiagnose = useCallback(async () => {
    setBusy('diagnose')
    try {
      const result = await apiGet('camera/diagnose')
      setDiagnosis(result)
      notify(result.ok ? '摄像头可用' : '摄像头不可用', result.ok ? undefined : (result.hint ?? result.reason ?? ''), result.ok ? 'ok' : 'error')
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
  }, [notify, snapshot])

  /** 写一把密钥到宿主凭据存储。成功立刻清空输入框（值不留在这个页面的状态里）。 */
  const saveSecret = useCallback(async () => {
    const edit = secretEdit
    if (edit === undefined) return
    if (edit.ref === '') { notify('没保存', '先选一个服务或凭据名。', 'error'); return }
    if (String(edit.value).trim() === '') {
      notify('没保存', '密钥是空的；要删除已保存的密钥请用「清除」。', 'error')
      return
    }
    setBusy('secret')
    try {
      const result = await apiPost('voice/credentials', { action: 'set', ref: edit.ref, value: edit.value })
      setSecretEdit(undefined)
      if (result?.ok === false) {
        notify('没保存', [result.reason, result.hint].filter(part => part !== undefined && part !== '').join(' '), 'error')
        return
      }
      notify('已保存', undefined, 'ok')
      snapshot.refresh()
    } catch (failure) {
      notify('没保存', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [secretEdit, notify, snapshot])

  /** 清除凭据：第一次点只是上膛。 */
  const clearCredential = useCallback(async (kind, ref) => {
    if (ref === '') { notify('没清除', '先选一个服务或凭据名。', 'error'); return }
    if (clearArm !== kind) {
      setClearArm(kind)
      setTimeout(() => setClearArm(''), 5000)
      return
    }
    setClearArm('')
    setBusy('secret')
    try {
      const result = await apiPost('voice/credentials', { action: 'clear', ref })
      if (result?.ok === false) {
        notify('没清掉', [result.reason, result.hint].filter(part => part !== undefined && part !== '').join(' '), 'error')
        return
      }
      notify('已清除', result?.hint, result?.configured === true ? 'error' : 'ok')
      snapshot.refresh()
    } catch (failure) {
      notify('没清掉', failure instanceof Error ? failure.message : String(failure), 'error')
    } finally {
      setBusy('')
    }
  }, [clearArm, notify, snapshot])

  /** 现场录 2 秒 → 16 kHz 单声道 WAV（识别服务要的是波形，不是 webm）。 */
  const recordTestSample = useCallback(async () => {
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined
      || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('这个环境没有麦克风接口。')
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    try {
      const Recorder = typeof window === 'undefined' ? undefined : window.MediaRecorder
      if (typeof Recorder !== 'function') throw new Error('这个环境不支持录音（MediaRecorder）。')
      const chunks = []
      const recorder = new Recorder(stream)
      const stopped = new Promise(resolve => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
      })
      recorder.ondataavailable = event => {
        if (event.data !== undefined && event.data !== null && event.data.size > 0) chunks.push(event.data)
      }
      recorder.start()
      setRecording(true)
      await new Promise(resolve => setTimeout(resolve, 2000))
      recorder.stop()
      const blob = await stopped
      const decoded = await decodeToMono16k(await blob.arrayBuffer())
      return { dataBase64: bufferToBase64(encodeWav(decoded.samples, decoded.sampleRate)), mimeType: 'audio/wav' }
    } finally {
      setRecording(false)
      stream.getTracks().forEach(track => track.stop())
    }
  }, [])

  /** 播报测试：**真跑**当前链路；浏览器音色那条 Host 合成不了，就用面板自己的语音播一句。 */
  const testTts = useCallback(async () => {
    setBusy('tts-test')
    setTtsTest(undefined)
    try {
      const result = await apiPost('voice/test', { kind: 'tts' })
      if (result?.ok === true && typeof result.audioBase64 === 'string' && result.audioBase64 !== '') {
        const url = URL.createObjectURL(base64ToBlob(result.audioBase64, result.mimeType))
        const audio = new Audio(url)
        audio.onended = () => URL.revokeObjectURL(url)
        await audio.play().catch(() => { /* 自动播放被拦：链路本身已通，如实说 */ })
        setTtsTest({
          ok: true,
          line: `${result.label || result.provider || '模型'} · ${Math.round(result.ms ?? 0)} ms · 已播放`,
          detail: [result.model, result.voice].filter(part => part !== undefined && part !== '').join(' · '),
        })
        return
      }
      // Host 侧没有可合成音频 = 这条链路是浏览器系统音色：**真播一次**再回报。
      if (result?.mode === 'browser' && typeof window !== 'undefined'
        && typeof window.speechSynthesis?.speak === 'function'
        && typeof SpeechSynthesisUtterance === 'function') {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance('这是一次语音播报测试。听到这句话，说明面试官的声音已经接通。'))
        setTtsTest({ ok: true, line: '浏览器系统音色 · 已播放', detail: result.reason ?? '' })
        return
      }
      setTtsTest({
        ok: false,
        line: `失败 · ${result?.mode ?? '未知链路'}${result?.provider === undefined ? '' : ` · ${result.provider}`}`,
        detail: [result?.reason, result?.hint].filter(part => part !== undefined && part !== '').join(' '),
      })
    } catch (failure) {
      setTtsTest({ ok: false, line: '失败', detail: failure instanceof Error ? failure.message : String(failure) })
    } finally {
      setBusy('')
    }
  }, [])

  /** 识别测试：录 2 秒 → 走完整回落链 → 回显结果、链路、耗时、每次尝试。 */
  const testAsr = useCallback(async () => {
    setBusy('asr-test')
    setAsrTest(undefined)
    try {
      const sample = await recordTestSample()
      const result = await apiPost('voice/test', { kind: 'asr', dataBase64: sample.dataBase64, mimeType: sample.mimeType })
      const attempts = Array.isArray(result?.attempts) ? result.attempts : []
      const attemptText = attempts.map(item => `${item.mode === 'host' ? '宿主' : '服务端'}：${item.ok ? '通过' : (item.reason ?? '失败')}`).join('；')
      setAsrTest({
        ok: result?.ok === true,
        line: result?.ok === true
          ? `${result.protocol === undefined ? (result.mode ?? '') : result.protocol} · ${Math.round(result.ms ?? 0)} ms`
          : `失败 · ${result?.mode ?? '未知链路'}`,
        text: result?.ok === true ? (result.text ?? '') : '',
        detail: [result?.reason, result?.hint, attemptText].filter(part => part !== undefined && part !== '').join(' '),
      })
    } catch (failure) {
      setAsrTest({
        ok: false,
        line: '录不到音频',
        detail: failure instanceof Error ? failure.message : String(failure),
      })
    } finally {
      setBusy('')
    }
  }, [recordTestSample])

  if (data === undefined || form === undefined) {
    return h('div', { style: { ...S.card, padding: '18px 20px', color: C.boneFaint, ...TYPE.sub } },
      snapshot.error === undefined ? '正在读取…' : `读不到设置：${snapshot.error}`)
  }

  const effective = data.effective ?? {}
  const voice = data.voice ?? {}
  const asr = voice.asr ?? {}
  const tts = voice.tts ?? {}
  const camera = data.camera ?? {}
  const backends = data.backends ?? {}
  const model = data.speechModel ?? {}
  // 预设表与凭据清单都来自 Host（`GET voice/presets` / `GET voice/credentials`），
  // 设置快照里已经带了一份，页面不再硬编码 provider。
  const allPresets = Array.isArray(data.presets) ? data.presets : []
  const asrPresets = allPresets.filter(preset => preset.kind === 'asr')
  const ttsPresets = allPresets.filter(preset => preset.kind === 'tts')
  const credentials = Array.isArray(data.credentials) ? data.credentials : []
  const asrPreset = asrPresets.find(preset => preset.id === form.asrProvider)
  const ttsPreset = ttsPresets.find(preset => preset.id === form.ttsProvider)
  const asrRef = form.asrApiKeyEnv !== '' ? form.asrApiKeyEnv : (asrPreset?.apiKeyEnv ?? '')
  const ttsRef = form.ttsApiKeyEnv !== '' ? form.ttsApiKeyEnv : (ttsPreset?.apiKeyEnv ?? '')

  /** 一行「现在用」：值 + 来源/理由（理由点开才看，不占常驻版面）。 */
  const nowRow = (key, label, value, reason) => h('div', {
    key,
    style: { display: 'flex', gap: 12, alignItems: 'center', padding: '0 0 10px', minWidth: 0 },
  }, [
    h(Meta, { key: 'l', style: { flex: '0 0 auto' } }, label),
    typeof reason === 'string' && reason !== ''
      ? h(Hint, { key: 'v', label: value }, reason)
      : h('span', {
        key: 'v',
        style: { ...TYPE.body, color: C.bone, minWidth: 0, wordBreak: 'break-word', fontFamily: F.mono },
      }, value),
  ])

  /** 一行「标签 → 值（+ 来源/理由）」，只读。 */
  const line = (key, label, value, hint) => h('div', {
    key,
    style: { display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${C.ruleSoft}` },
  }, [
    h(Meta, { key: 'l', style: { width: 96, flex: '0 0 auto', whiteSpace: 'normal', lineHeight: 1.5 } }, label),
    h('span', { key: 'v', style: { ...TYPE.sub, fontFamily: F.mono, flex: '1 1 auto', minWidth: 0, color: C.bone, wordBreak: 'break-all' } }, value),
    hint !== undefined ? h(Meta, { key: 'h', style: { flex: '0 0 auto' } }, hint) : null,
  ])

  /** 表单字段：label + 控件。生效值只进 placeholder，不另写一行小字。 */
  const field = (key, label, control) => h('div', { key }, [
    h('div', { key: 'l', style: S.label }, label),
    control,
  ])

  const input = (key, placeholder, extra) => h('input', {
    key: 'i',
    style: S.input,
    value: form[key],
    placeholder,
    ...(extra ?? {}),
    onChange: event => set(key, event.target.value),
  })

  // 音色下拉的真源来自 Host（设置快照里的 data.voices = 模型→音色对照表）。
  // 按当前模型精确查；模型不在表里退到服务商级；都没有 → 文本输入（自定义/克隆音色的出路）。
  const voiceTableData = data.voices ?? { models: {}, providers: {} }
  const lookupVoices = (modelId, vendorId) => {
    const byModel = voiceTableData.models?.[String(modelId ?? '').trim()]
    if (Array.isArray(byModel) && byModel.length > 0) return byModel
    const byProvider = voiceTableData.providers?.[String(vendorId ?? '').trim()]
    if (Array.isArray(byProvider) && byProvider.length > 0) return byProvider
    return []
  }
  // 音色表按**厂商**建（mimo/minimax 的音色是厂商级、跨模型通用），
  // 不是按预设 id——Token Plan 与直连共享同一组音色。
  const currentTtsModel = form.ttsModel !== '' ? form.ttsModel : (effective.ttsModel || ttsPreset?.model || '')
  const ttsVoiceOptions = lookupVoices(currentTtsModel, ttsPreset?.vendor ?? form.ttsProvider)
  const voiceControl = () => {
    if (ttsVoiceOptions.length === 0) {
      return input('ttsVoice', effective.ttsVoice || ttsPreset?.voice || '留空用默认音色')
    }
    const current = form.ttsVoice
    const options = [h('option', { key: '__def', value: '' }, `默认 · ${ttsVoiceOptions[0].id}`)]
    for (const v of ttsVoiceOptions) options.push(h('option', { key: v.id, value: v.id }, v.label || v.id))
    // 当前值不在表里（自定义/克隆音色）也保留成一个选项，不静默丢掉。
    if (current !== '' && !ttsVoiceOptions.some(v => v.id === current)) {
      options.push(h('option', { key: '__cur', value: current }, current))
    }
    return h('select', { key: 's', style: S.input, value: current, onChange: event => set('ttsVoice', event.target.value) }, options)
  }

  /**
   * 服务下拉：选项全部来自预设表，按 Host 给的分组标题分段。
   *
   * **换服务要清掉旧服务的覆盖值。** 上一版把 provider 与 baseUrl/model 分开存：
   * 从 MiMo 切到 MiniMax 时，上一家的端点覆盖还在，于是"选了 A 却打 B 的端点"。
   * 换服务 = 从这一家的默认值重新开始；要自定义就在新服务上再填。
   *
   * 分组标题是 `disabled` 的 option——原生 `<select>` 里这就是分隔条，
   * 不额外造一层自定义下拉（窄面板里自定义下拉更难用）。
   */
  const presetSelect = (key, presets, resetKeys) => {
    const current = String(form[key] ?? '')
    const options = presets.length > 0
      ? presets.map(preset => ({
        id: preset.id,
        label: preset.label,
        title: preset.notes,
        group: preset.group,
        groupLabel: preset.groupLabel,
      }))
      : [{ id: current === '' ? 'auto' : current, label: current === '' ? '默认' : current, title: '', group: 'control', groupLabel: '' }]
    const hasCurrent = options.some(option => option.id === current)
    const nodes = []
    let lastGroup = undefined
    for (const option of options) {
      // 分组标题只在 Host 真的给了标题时画；老快照/测试数据没有这个字段就退化成平铺列表。
      if (typeof option.groupLabel === 'string' && option.groupLabel !== '' && option.group !== lastGroup) {
        nodes.push(h('option', { key: `__group_${option.group}`, disabled: true }, `── ${option.groupLabel} ──`))
      }
      lastGroup = option.group
      nodes.push(h('option', { key: option.id, value: option.id, title: option.title }, option.label))
    }
    if (!hasCurrent) nodes.push(h('option', { key: '__current', value: current }, current))
    return h('select', {
      key: 's',
      style: S.input,
      value: current,
      onChange: event => {
        const value = event.target.value
        setForm(previous => {
          const next = { ...previous, [key]: value }
          for (const resetKey of resetKeys ?? []) next[resetKey] = ''
          return next
        })
        // 换了服务之后，旧的"替换密钥"目标就不对了——直接收起。
        setSecretEdit(undefined)
      },
    }, nodes)
  }

  /** 只读值：预设供应商的端点/模型是固定的，展示但不给改。 */
  const readonly = (key, value) => h('div', {
    key,
    title: value,
    style: {
      ...S.input,
      display: 'flex', alignItems: 'center',
      color: C.boneDim, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    },
  }, value)

  const checkbox = (key, label) => h('label', {
    key,
    style: { display: 'flex', gap: 8, alignItems: 'center', ...TYPE.sub, color: C.boneDim, cursor: 'pointer', padding: '4px 0' },
  }, [
    h('input', {
      key: 'c',
      type: 'checkbox',
      checked: form[key] === true,
      onChange: event => set(key, event.target.checked),
    }),
    h('span', { key: 's' }, label),
  ])

  const section = (key, title, children) => h(Panel, { key, tone: 'plain', pad: 16 }, [
    h('div', { key: 'h', style: { ...S.cardHead, marginBottom: 10 } }, [
      h('span', { key: 't', style: S.cardTitle }, title),
    ]),
    ...children,
  ])

  /**
   * 外观：明暗用哪一套。
   *
   * 两条路只能选一条：自己选，或者完全跟随 DSH。勾了「跟随」之后，
   * 页头的 ◐ 按钮会失效（点了会说明原因），这里的亮/暗也不再可点——
   * 否则同一件事有两个入口，且其中一个不生效。
   */
  const themeRow = () => {
    const themeChip = (value, label) => h('button', {
      key: value,
      type: 'button',
      'aria-pressed': themeFollow !== true && theme === value,
      disabled: themeFollow === true,
      style: {
        ...S.btn(themeFollow !== true && theme === value ? 'primary' : false, themeFollow === true),
        padding: '7px 14px',
        ...(themeFollow === true ? { opacity: 0.5 } : {}),
      },
      onClick: () => { if (themeFollow !== true) onChangeTheme?.(value) },
    }, label)
    const followToggle = h('button', {
      key: 'follow',
      type: 'button',
      'aria-pressed': themeFollow === true,
      title: '勾上之后，明暗完全由 DSH 决定；页头的切换按钮会失效',
      style: {
        ...S.btn(themeFollow === true ? 'primary' : false, false),
        padding: '7px 14px', gap: 8,
      },
      onClick: () => onChangeThemeFollow?.(themeFollow !== true),
    }, [
      h('span', {
        key: 'box',
        'aria-hidden': true,
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: 4, flex: '0 0 auto',
          border: `1px solid ${themeFollow === true ? 'transparent' : C.rule}`,
          background: themeFollow === true ? C.primaryText : 'transparent',
          color: C.primaryTop, fontSize: 10, lineHeight: 1,
          boxShadow: themeFollow === true ? 'none' : `inset 0 1px 0 ${C.hiSoft}`,
        },
      }, themeFollow === true ? '✓' : ''),
      h('span', { key: 't' }, '跟随 DSH 主题'),
    ])
    return h('div', {
      key: 'appearance',
      style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    }, [
      h(Meta, { key: 'l' }, '明暗'),
      themeChip('light', '亮色'),
      themeChip('dark', '暗色'),
      h('div', { key: 'sp', style: { flex: '1 1 auto', minWidth: 8 } }),
      themeFollow === true
        ? h(Meta, { key: 'host', tone: 'faint' }, `由 DSH 决定 · 当前${hostScheme === 'dark' ? '暗色' : '亮色'}`)
        : null,
      followToggle,
    ])
  }

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }

  const actions = children => h('div', { key: 'b', style: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' } }, children)

  /**
   * 凭据行：已有凭据下拉 + 替换（粘贴）+ 清除。
   *
   * 密钥**永不回显**：输入框是 `type=password`、`autocomplete=off`，
   * 保存成功后立刻清空；界面上只有「已配置 / 未配置 + 来源」。
   */
  const credentialRow = (key, kind, label) => {
    const refKey = kind === 'asr' ? 'asrApiKeyEnv' : 'ttsApiKeyEnv'
    const selectedRef = kind === 'asr' ? asrRef : ttsRef
    const status = credentials.find(item => item.ref === selectedRef)
    const sourceLabel = status?.source === 'host'
      ? '宿主凭据'
      : (status?.source === 'env' ? '环境变量' : '')
    const editing = secretEdit !== undefined && secretEdit.kind === kind
    const options = credentials.map(item => ({ id: item.ref, label: `${item.ref}${item.configured === true ? ' · 已配置' : ''}` }))
    if (selectedRef !== '' && !options.some(option => option.id === selectedRef)) {
      options.push({ id: selectedRef, label: selectedRef })
    }
    return h('div', { key, style: { marginTop: 6 } }, [
      h('div', { key: 'l', style: S.label }, label),
      h('div', { key: 'row', style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } }, [
        h('select', {
          key: 'sel',
          style: { ...S.input, flex: '1 1 220px', minWidth: 0 },
          value: form[refKey] ?? '',
          onChange: event => {
            set(refKey, event.target.value)
            setSecretEdit(undefined)
          },
        }, [
          h('option', { key: '__default', value: '' }, asrPresetOrTtsDefaultLabel(kind, asrPreset, ttsPreset)),
          ...options.map(option => h('option', { key: option.id, value: option.id }, option.label)),
        ]),
        h(Pill, { key: 'state', tone: status?.configured === true ? 'jade' : 'faint' },
          status?.configured === true ? `已配置 · ${sourceLabel}` : '未配置'),
        h('button', {
          key: 'replace',
          style: S.btn(false, false),
          onClick: () => setSecretEdit({ kind, ref: selectedRef, value: '' }),
        }, '替换…'),
        h('button', {
          key: 'clear',
          style: S.btn(clearArm === kind ? 'tally' : false, false),
          onClick: () => clearCredential(kind, selectedRef),
        }, clearArm === kind ? '再次点击确认清除' : '清除'),
      ]),
      editing ? h('div', { key: 'edit', style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } }, [
        h('input', {
          key: 'secret',
          type: 'password',
          autoComplete: 'off',
          spellCheck: false,
          style: { ...S.input, flex: '1 1 240px', minWidth: 0 },
          placeholder: selectedRef === '' ? '先选凭据名' : `${selectedRef} 的密钥`,
          value: secretEdit.value,
          onChange: event => setSecretEdit({ ...secretEdit, value: event.target.value }),
        }),
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'secret' || selectedRef === ''),
          onClick: saveSecret,
        }, busy === 'secret' ? '保存中…' : '写入凭据'),
        h('button', { key: 'cancel', style: S.btn(false, false), onClick: () => setSecretEdit(undefined) }, '取消'),
      ]) : null,
    ])
  }

  /** 测试结果行：走哪条链路、耗时、失败的具体原因与下一步。 */
  const testLine = (key, state) => {
    if (state === undefined) return null
    return h('div', {
      key,
      style: {
        marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.ruleSoft}`,
        ...TYPE.sub, color: state.ok ? C.jade : C.amber, wordBreak: 'break-word',
      },
    }, [
      h('div', { key: 'l' }, [
        h(Meta, { key: 'k', tone: state.ok ? 'jade' : 'amber' }, state.ok ? '通过' : '失败'),
        h('span', { key: 'v', style: { marginLeft: 8 } }, state.line ?? ''),
      ]),
      state.text !== undefined && state.text !== ''
        ? h('div', { key: 't', style: { color: C.boneDim, marginTop: 4 } }, `识别结果：${state.text}`)
        : null,
      state.detail !== undefined && state.detail !== ''
        ? h('div', { key: 'd', style: { color: C.boneFaint, marginTop: 4 } }, state.detail)
        : null,
    ])
  }

  /** 识别区的一条出路：没走服务端时说清现在是什么、要自己的模型怎么配。 */
  const asrQuiet = asr.mode === 'server'
    ? undefined
    : asr.mode === 'none'
      ? '识别已关闭；需要时把服务改回「自动」。'
      : '现在走浏览器识别；要自己的模型就选一个预设供应商（Qwen / MiMo / MiniMax，Token Plan 与直连二选一）并配好它对应的凭据。识别不通时用键盘输入，面试照常进行。'

  const ttsQuiet = tts.mode === 'server'
    ? undefined
    : tts.mode === 'none'
      ? '播报已关闭；问题只以文字显示。'
      : '现在会用浏览器系统音色；要模型音色就选一个预设供应商并配凭据，也可以用免密钥的百度朗读。'

  // 「现在用」只放**认得出是哪条链路**的最短一组词：
  // 服务 → 协议 → 模型。端点已经在下面那一格填着了，再抄一遍是把一行撑成三段。
  const joinParts = parts => parts.filter(part => typeof part === 'string' && part.trim() !== '').join(' · ')

  const asrSummary = asr.mode === 'host'
    ? joinParts(['宿主语音服务', asr.host?.provider?.name])
    : asr.mode === 'server'
      ? joinParts([asr.server?.label ?? '服务端', asr.server?.protocolLabel ?? asr.server?.protocol, asr.server?.model])
      : asr.mode === 'none'
        ? '已关闭'
        : '浏览器 Web Speech'

  const ttsSummary = tts.mode === 'server'
    ? joinParts([tts.label ?? tts.provider ?? '模型', tts.model, tts.voice])
    : tts.mode === 'none'
      ? '已关闭'
      : '浏览器系统音色'

  // 只有用得上的字段才出现。空着的格子不是"可选"，是噪音——
  // 用户会以为必须填，或者以为填错了。
  const asrNeedsGroupId = (asrPreset?.protocol ?? '') === 'minimax'
  const ttsNeedsGroupId = (ttsPreset?.protocol ?? '') === 'minimax'
  const ttsNeedsStyle = (ttsPreset?.protocol ?? '') === 'chat-audio'
  // 预设供应商 = 端点/协议/凭据名/模型已经配好的一对，只读；要自定义端点选
  // 「OpenAI 兼容 · 自定义端点」。
  const asrLocked = asrPreset?.locked === true
  const ttsLocked = ttsPreset?.locked === true
  const ttsModels = Array.isArray(ttsPreset?.models) ? ttsPreset.models : []
  const ttsModelControl = () => {
    if (!ttsLocked || ttsModels.length === 0) {
      return h('input', {
        key: 'i',
        style: S.input,
        value: form.ttsModel,
        placeholder: effective.ttsModel || ttsPreset?.model || '留空用该服务默认',
        // 换模型 = 换一组合法音色：把音色重置为默认，避免拿旧模型的音色去撞 411。
        onChange: event => { const value = event.target.value; setForm(previous => ({ ...previous, ttsModel: value, ttsVoice: '' })) },
      })
    }
    const chosen = ttsModels.some(item => item.id === form.ttsModel) ? form.ttsModel : ''
    return h('select', {
      key: 's',
      style: S.input,
      value: chosen,
      onChange: event => { const value = event.target.value; setForm(previous => ({ ...previous, ttsModel: value, ttsVoice: '' })) },
    }, [
      h('option', { key: '__def', value: '' }, `默认 · ${ttsPreset?.model ?? ttsModels[0].id}`),
      ...ttsModels.map(item => h('option', { key: item.id, value: item.id }, item.label || item.id)),
    ])
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } }, [
    section('appearance', '外观', [themeRow()]),

    section('asr', '语音识别', [
      nowRow('now', '现在用', asrSummary, asr.reason),
      h('div', { key: 'g', style: grid }, [
        field('asrProvider', '服务', presetSelect('asrProvider', asrPresets, ['asrBaseUrl', 'asrModel', 'asrGroupId', 'asrApiKeyEnv'])),
        asrLocked
          ? field('asrFixed', '端点 · 模型', readonly('fixed', `${asrPreset?.baseUrl ?? ''} · ${asrPreset?.model ?? ''}`))
          : field('asrBaseUrl', '端点', input('asrBaseUrl', effective.asrBaseUrl || asrPreset?.baseUrl || '留空用该服务默认')),
        asrLocked
          ? null
          : field('asrModel', '模型', input('asrModel', effective.asrModel || asrPreset?.model || '留空用该服务默认')),
        field('asrLanguage', '语言', input('asrLanguage', effective.asrLanguage || 'zh')),
        // Group ID 只有 MiniMax 的两套协议用得着。**别的服务上不显示这一格**——
        // 一个永远空着的字段，用户会以为必须填，或者以为坏了。
        asrNeedsGroupId
          ? field('asrGroupId', 'Group ID（MiniMax 可选）', input('asrGroupId', effective.asrGroupId || '留空 = 不带 GroupId'))
          : null,
      ]),
      credentialRow('cred', 'asr', '凭据'),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'asr'),
          onClick: () => save({
            asrProvider: form.asrProvider,
            asrBaseUrl: form.asrBaseUrl,
            asrModel: form.asrModel,
            asrApiKeyEnv: form.asrApiKeyEnv,
            asrGroupId: form.asrGroupId,
            asrLanguage: form.asrLanguage,
          }, 'asr', { allowEmpty: true }),
        }, busy === 'asr' ? '保存中…' : '保存识别设置'),
        h('button', {
          key: 'test',
          style: S.btn(false, busy === 'asr-test' || recording),
          onClick: testAsr,
        }, busy === 'asr-test' || recording ? '录音 2 秒…' : '测试识别'),
      ]),
      testLine('test', asrTest),
      asrQuiet === undefined ? null : h(Quiet, { key: 'q', tone: 'muted', style: { marginTop: 6, alignItems: 'flex-start' } }, asrQuiet),
    ]),

    section('tts', '语音播报', [
      nowRow('now', '现在用', ttsSummary, tts.reason),
      h('div', { key: 'g', style: grid }, [
        field('ttsProvider', '服务', presetSelect('ttsProvider', ttsPresets, ['ttsBaseUrl', 'ttsModel', 'ttsVoice', 'ttsGroupId', 'ttsApiKeyEnv'])),
        ttsLocked
          ? field('ttsFixed', '端点（固定）', readonly('fixed', ttsPreset?.baseUrl ?? ''))
          : field('ttsBaseUrl', '端点', input('ttsBaseUrl', effective.ttsBaseUrl || ttsPreset?.baseUrl || '留空用该服务默认')),
        field('ttsModel', '模型', ttsModelControl()),
        field('ttsVoice', '音色', voiceControl()),
        field('ttsFormat', '音频格式', h('select', {
          key: 's',
          style: S.input,
          value: form.ttsFormat,
          onChange: event => set('ttsFormat', event.target.value),
        }, [
          h('option', { key: 'm', value: 'mp3' }, 'mp3'),
          h('option', { key: 'w', value: 'wav' }, 'wav'),
        ])),
        field('ttsRate', '语速', input('ttsRate', String(effective.ttsRate ?? 1))),
        ttsNeedsGroupId
          ? field('ttsGroupId', 'Group ID（MiniMax 可选）', input('ttsGroupId', effective.ttsGroupId || '留空 = 不带 GroupId'))
          : null,
        ttsNeedsStyle
          ? field('ttsStyle', '风格指令（可选）', input('ttsStyle', effective.ttsStyle || '例如：语速偏慢、沉稳'))
          : null,
      ]),
      credentialRow('cred', 'tts', '凭据'),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'tts'),
          onClick: () => save({
            ttsProvider: form.ttsProvider,
            ttsModel: form.ttsModel,
            ttsVoice: form.ttsVoice,
            ttsBaseUrl: form.ttsBaseUrl,
            ttsApiKeyEnv: form.ttsApiKeyEnv,
            ttsGroupId: form.ttsGroupId,
            ttsFormat: form.ttsFormat,
            ttsRate: form.ttsRate,
            ttsStyle: form.ttsStyle,
          }, 'tts', { allowEmpty: true }),
        }, busy === 'tts' ? '保存中…' : '保存播报设置'),
        h('button', {
          key: 'test',
          style: S.btn(false, busy === 'tts-test'),
          onClick: testTts,
        }, busy === 'tts-test' ? '合成中…' : '测试播报'),
      ]),
      testLine('test', ttsTest),
      ttsQuiet === undefined ? null : h(Quiet, { key: 'q', tone: 'muted', style: { marginTop: 6, alignItems: 'flex-start' } }, ttsQuiet),
    ]),

    section('camera', '摄像头', [
      nowRow('now', '现在用', camera.running === true ? `已接通 · ${camera.backend === 'chromium-mf' ? 'Chromium（Media Foundation）' : (camera.backend === 'ffmpeg' ? 'ffmpeg' : '未知后端')}` : '未接通', camera.reason),
      h('div', { key: 'g', style: grid }, [
        field('cameraBackend', '采集后端', h('select', {
          key: 's',
          style: S.input,
          value: form.cameraBackend,
          onChange: event => set('cameraBackend', event.target.value),
        }, [
          h('option', { key: 'a', value: 'auto' }, 'auto（ffmpeg 优先，失败回落浏览器）'),
          h('option', { key: 'f', value: 'ffmpeg' }, 'ffmpeg（只用 DirectShow）'),
          h('option', { key: 'c', value: 'chromium-mf' }, 'Chromium（Media Foundation）优先'),
        ])),
        field('ffmpegPath', 'ffmpeg 路径', input('ffmpegPath', backends.ffmpeg?.found === true ? backends.ffmpeg.path : 'D:\\tools\\ffmpeg\\bin\\ffmpeg.exe')),
        field('chromiumPath', 'Chrome / Edge 路径', input('chromiumPath', backends.chromium?.found === true ? backends.chromium.path : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')),
      ]),
      actions([
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
        ? h('div', {
          key: 'diag',
          style: { paddingTop: 10, ...TYPE.sub, lineHeight: 1.8, color: diagnosis.ok ? C.jade : C.amber },
        }, [
          h('div', { key: 'a' }, diagnosis.ok ? `可用 · 后端 ${diagnosis.backend ?? '未知'}` : `不可用 · ${diagnosis.reason ?? ''}`),
          diagnosis.hint !== undefined && diagnosis.hint !== '' ? h('div', { key: 'b', style: { color: C.boneFaint } }, diagnosis.hint) : null,
          (diagnosis.probes ?? []).map(probe => h('div', { key: probe.name, style: { color: C.boneFaint, fontFamily: F.mono } },
            `${probe.name}: ${probe.ok ? '抓帧成功' : (probe.detail ?? '失败')}`)),
        ])
        : null,
    ]),

    section('privacy', '录像与录音', [
      checkbox('recordVideo', '允许录像（关掉 = 面板不出现录像入口）'),
      checkbox('recordAudio', '允许录音（关掉 = 面板不出现录音入口）'),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'privacy'),
          onClick: () => save({ recordVideo: form.recordVideo, recordAudio: form.recordAudio }, 'privacy'),
        }, busy === 'privacy' ? '保存中…' : '保存隐私设置'),
      ]),
    ]),

    // 回答节奏（docs/TURN-TAKING.md §4）：自动/手动是**用户拥有的开关**。
    // 面试中随时可在「面试中」页快捷切换，这里是正式条目。
    section('turn', '回答节奏', [
      h('div', { key: 'g', style: grid }, [
        field('answerMode', '模式', h('select', {
          key: 's',
          style: S.input,
          value: form.answerMode,
          onChange: event => set('answerMode', event.target.value),
        }, [
          h('option', { key: 'm', value: 'manual' }, '手动（答完自己点「提交回答」）'),
          h('option', { key: 'a', value: 'auto' }, '自动（说完静音约 2 秒自动提交）'),
        ])),
        field('turnEndSilenceMs', '话轮结束静音（毫秒，800–6000）',
          input('turnEndSilenceMs', String(effective.turnEndSilenceMs ?? 2000))),
      ]),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'turn'),
          onClick: () => save({ answerMode: form.answerMode, turnEndSilenceMs: form.turnEndSilenceMs }, 'turn'),
        }, busy === 'turn' ? '保存中…' : '保存回答节奏'),
      ]),
      h(Quiet, {
        key: 'q',
        tone: 'muted',
        style: { marginTop: 6, alignItems: 'flex-start' },
      }, '开关只管「自动判定与提交」：手动提交同样会唤醒面试官。自动判定需要宿主/服务端识别；提交前有 2 秒反悔窗口，重新开口即取消。'),
    ]),

    // 虚拟面试官：舞台右上角那个会说话的形象。
    //
    // **为什么值得一个开关。** 有人就是不喜欢屏幕里有张脸；出问题时这也
    // 是最快的止血开关（关掉 = 舞台上不挂，其他一律不变）。
    section('avatar', '面试官形象', [
      checkbox('interviewerAvatar', '在舞台上显示预置面试官（会跟着提问开口、听你说话时看着你）'),
      actions([
        h('button', {
          key: 'save',
          style: S.btn('primary', busy === 'avatar'),
          onClick: () => save(
            { interviewerAvatar: form.interviewerAvatar === true ? 'on' : 'off' },
            'avatar',
          ),
        }, busy === 'avatar' ? '保存中…' : '保存形象设置'),
      ]),
      // 一条出路，不是说明书：外放时面试官的声音会进麦克风。
      h(Quiet, { key: 'q', tone: 'muted', style: { marginTop: 6, alignItems: 'flex-start' } },
        '外放时建议戴耳机：扬声器里的提问会被麦克风收进去。'),
    ]),

    section('guard', '面试间保护', [
      checkbox('guardEnabled', '离开面试间前确认（关闭后直接释放设备，不再提示）'),
      line('gq', '退出提醒', data.settings?.guardQuiet === true ? '已关闭（以后不再提醒）' : '开启'),
      actions([
        h('button', { key: 'save', style: S.btn('primary', busy === 'guard'), onClick: () => save({ guardEnabled: form.guardEnabled }, 'guard') },
          busy === 'guard' ? '保存中…' : '保存保护设置'),
        h('button', { key: 'reset', style: S.btn(false, data.settings?.guardQuiet !== true), onClick: () => save({ guardQuiet: false }, 'guard') }, '恢复退出提醒'),
      ]),
      h(Hint, { key: 'note', label: '退出保护' },
        '面试中退出会强制二次确认；面板内切页签/切面试与侧栏切到其他面板都会被拦下。'),
    ]),

    section('env', '环境（只读）', [
      line('root', '数据根', data.dataRoot?.path ?? '', data.dataRoot?.source),
      h('div', { key: 'why', style: { ...TYPE.sub, color: C.boneFaint, padding: '4px 0 8px' } }, data.dataRoot?.reason ?? ''),
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
          actions([
            h('button', {
              key: 'purge',
              style: S.btn(purgeArm ? 'tally' : 'primary', busy === 'purge'),
              onClick: purgeEmpty,
            }, busy === 'purge' ? '清理中…' : (purgeArm ? '再次点击确认清理' : `清理 ${data.emptySessions.length} 场空场次`)),
          ]),
          h(Hint, { key: 'n', label: '清理范围' },
            '只删没有任何内容的场次；有简历 / JD / 考点 / 转录 / 报告的一场都不会动。'),
        ])
        : null,
      actions([
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

/** 「凭据 = 服务默认」那一行的文案：告诉用户默认是哪个 ref，但值留空。 */
function asrPresetOrTtsDefaultLabel(kind, asrPreset, ttsPreset) {
  const preset = kind === 'asr' ? asrPreset : ttsPreset
  if (preset === undefined || preset.apiKeyEnv === undefined || preset.apiKeyEnv === '') return '服务默认（免密钥）'
  return `服务默认 · ${preset.apiKeyEnv}`
}
