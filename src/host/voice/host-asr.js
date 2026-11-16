/**
 * 宿主语音服务（`ctx.speechToText`）的适配器。
 *
 * **为什么这是首选链路。** DSH 把语音识别做成了一个 provider 无关的服务：
 * provider 由宿主自己注册（自带一个跑在 CPU 上的本地 SenseVoice，也可以接
 * 云端），插件只按 id 选、按语言提示转写。这样插件**不绑定任何厂商**，
 * 也不经手厂商凭据——这正是"完全依赖宿主能力"该有的形状。
 *
 * **它不是什么。** 宿主只提供**整段录音**转写：没有流式识别、没有语音
 * 合成。所以「准实时」要靠调用方分段，那是客户端的事，不是这里的。
 *
 * **纪律：宿主没装、没准备好、provider 不可用，都要如实说。**
 * 这里所有函数都**不抛**——失败变成 `{ ok: false, reason, hint }`，
 * 由编排层决定是否继续往下回落。
 */
import { hostService, transcriptText } from './host.js'

/** 视为「可以直接转写」的准备阶段。 */
const READY_PHASES = new Set(['ready', 'standby'])

/**
 * The host speech service, if this Host composition mounted it.
 *
 * @param {import('../service.js').InterviewService} service
 * @returns {any}
 */
export function speechService(service) {
  return hostService(service?.ctx, 'speechToText')
}

/**
 * Describe the host capability without transcribing anything.
 *
 * 返回的字段全部**不含凭据**：它描述的是"宿主有没有能力、准备好没有"。
 *
 * @param {import('../service.js').InterviewService} service
 * @param {{language?: string}} options
 * @returns {{available: boolean, reason: string, providers: object[], selection: object|undefined, provider: object|undefined, ready: boolean, needsPreparation: boolean, language: string}}
 */
export function hostAsrState(service, options = {}) {
  const language = typeof options.language === 'string' ? options.language : ''
  const unavailable = reason => ({
    available: false,
    reason,
    providers: [],
    selection: undefined,
    provider: undefined,
    ready: false,
    needsPreparation: false,
    language,
  })

  const speech = speechService(service)
  if (speech === undefined || speech === null) {
    return unavailable('这个 DSH 组成里没有语音识别服务（宿主未启用 voice-input bundle），只能走插件自己的服务端识别或浏览器识别。')
  }
  if (typeof speech.listProviders !== 'function') {
    return unavailable('宿主的语音识别服务没有暴露 provider 列表，接口与预期不符。')
  }

  let registered = []
  try {
    registered = speech.listProviders() ?? []
  } catch (error) {
    return unavailable(`读不到宿主的语音识别 provider：${messageOf(error)}`)
  }
  if (!Array.isArray(registered) || registered.length === 0) {
    return unavailable('宿主的语音识别服务在，但一个 provider 都没注册。')
  }

  let snapshot
  try {
    snapshot = typeof speech.snapshot === 'function' ? speech.snapshot() : undefined
  } catch {
    snapshot = undefined
  }

  const providers = (Array.isArray(snapshot?.providers) ? snapshot.providers : registered).map(publicProvider)
  const selection = publicSelection(snapshot?.selection, registered)
  const chosen = pickProvider(providers, selection)
  if (chosen === undefined) {
    return { ...unavailable('宿主注册了语音 provider，但没有一个能用于当前语言。'), providers, selection }
  }

  const phase = chosen.preparation?.phase ?? 'ready'
  const ready = READY_PHASES.has(phase)
  return {
    available: true,
    reason: ready
      ? `宿主语音服务可用：${chosen.name}（${locationLabel(chosen.location)}），由宿主负责识别。`
      : `宿主语音服务已注册 ${chosen.name}，但模型还没准备好（${phase}）。`,
    providers,
    selection,
    provider: chosen,
    ready,
    needsPreparation: !ready && phase !== 'failed',
    language,
  }
}

/**
 * Transcribe one complete recording through the host.
 *
 * 请求必须是宿主接受的波形（16 kHz 单声道 PCM16 WAV）；调用方负责转码。
 *
 * @param {import('../service.js').InterviewService} service
 * @param {{buffer: Buffer, language?: string}} input
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ok: boolean, mode: 'host', text: string, provider?: string, model?: string, reason?: string, hint?: string}>}
 */
export async function transcribeWithHost(service, input, signal) {
  const speech = speechService(service)
  if (speech === undefined || speech === null) {
    return {
      ok: false,
      mode: 'host',
      text: '',
      reason: '宿主没有语音识别服务。',
      hint: '在 DSH 里启用 voice-input bundle，或在插件配置里指定服务端识别。',
    }
  }
  if (typeof speech.resolve !== 'function' || typeof speech.transcribe !== 'function') {
    return {
      ok: false,
      mode: 'host',
      text: '',
      reason: '宿主的语音识别服务接口与预期不符（缺 resolve/transcribe）。',
      hint: '检查 DSH 版本，或改用插件自己的服务端识别。',
    }
  }

  const buffer = input?.buffer
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, mode: 'host', text: '', reason: '音频数据是空的。' }
  }

  const language = typeof input?.language === 'string' && input.language.trim() !== ''
    ? input.language.trim()
    : undefined

  try {
    const spec = speech.resolve({ audio: buffer, ...(language === undefined ? {} : { language }) })
    const raw = await speech.transcribe(spec, signal ?? new AbortController().signal)
    const text = transcriptText(raw)
    if (text === '') {
      return {
        ok: false,
        mode: 'host',
        text: '',
        reason: '宿主识别完成，但没有给出文字。',
        hint: '这一段可能没有说话声；继续用键盘输入不受影响。',
      }
    }
    return { ok: true, mode: 'host', text, provider: spec?.provider?.info?.id ?? '', model: spec?.provider?.info?.name ?? '' }
  } catch (error) {
    return {
      ok: false,
      mode: 'host',
      text: '',
      reason: `宿主语音识别失败：${messageOf(error)}`,
      hint: '如果是模型还没准备好，先在面板上点「准备语音模型」。',
    }
  }
}

/**
 * Ask the host to download and load a provider's model.
 *
 * @param {import('../service.js').InterviewService} service
 * @param {string} providerId
 */
export async function prepareHostSpeech(service, providerId) {
  const speech = speechService(service)
  if (speech === undefined || speech === null) {
    return { ok: false, reason: '宿主没有语音识别服务，没有可准备的东西。' }
  }
  if (typeof speech.prepare !== 'function') {
    return { ok: false, reason: '宿主的语音识别服务不支持准备操作。' }
  }
  const state = hostAsrState(service)
  const id = typeof providerId === 'string' && providerId.trim() !== ''
    ? providerId.trim()
    : state.selection?.providerId ?? state.provider?.id ?? ''
  if (id === '') return { ok: false, reason: '宿主没有可准备的语音 provider。' }
  try {
    // prepare 是"启动或加入一个任务"，立即返回；进度靠 snapshot/follow 观察。
    speech.prepare(id)
    return { ok: true, providerId: id, reason: `已让宿主开始准备 ${id}。首次需要下载模型，进度会在状态里显示。` }
  } catch (error) {
    return { ok: false, providerId: id, reason: `准备失败：${messageOf(error)}` }
  }
}

/** Only the fields a panel may see. */
function publicProvider(entry) {
  const preparation = entry?.preparation ?? { phase: 'ready' }
  return {
    id: typeof entry?.id === 'string' ? entry.id : '',
    name: typeof entry?.name === 'string' ? entry.name : (typeof entry?.id === 'string' ? entry.id : ''),
    location: entry?.location === 'cloud' ? 'cloud' : 'host-local',
    languages: Array.isArray(entry?.languages) ? entry.languages.filter(item => typeof item === 'string') : [],
    preparation: {
      phase: typeof preparation.phase === 'string' ? preparation.phase : 'ready',
      ...(typeof preparation.completedBytes === 'number' ? { completedBytes: preparation.completedBytes } : {}),
      ...(typeof preparation.totalBytes === 'number' ? { totalBytes: preparation.totalBytes } : {}),
      ...(typeof preparation.message === 'string' ? { message: preparation.message } : {}),
    },
  }
}

/** Only the fields a panel may see. */
function publicSelection(selection, registered) {
  const providerId = typeof selection?.providerId === 'string'
    ? selection.providerId
    : (Array.isArray(registered) && typeof registered[0]?.id === 'string' ? registered[0].id : '')
  if (providerId === '') return undefined
  return {
    providerId,
    language: typeof selection?.language === 'string' ? selection.language : '',
  }
}

/**
 * Prefer the host's own selection; otherwise the first registered provider.
 *
 * @param {object[]} providers
 * @param {{providerId: string, language: string}|undefined} selection
 */
function pickProvider(providers, selection) {
  const ready = providers.filter(entry => entry.id !== '')
  if (ready.length === 0) return undefined
  const selected = selection === undefined ? undefined : ready.find(entry => entry.id === selection.providerId)
  return selected ?? ready[0]
}

/** How to describe a provider's location without jargon. */
export function locationLabel(location) {
  return location === 'cloud' ? '云端' : '本机'
}

/** Read an error message without leaking a stack. */
export function messageOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
