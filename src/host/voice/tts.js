/**
 * 语音合成的编排层：**宿主 → 配好的模型 → 免密钥的自然音 → 浏览器**。
 *
 * **为什么不是"接一个模型"。** 面试官的声音是沉浸感的载体，而不同人手里
 * 有的东西不一样：有人配了 MiMo / OpenAI / MiniMax 的 key，有人什么都没有。
 * 所以这里是**协议适配 + 顺序回落**，不是绑定某一家：
 *
 *   | 协议 | 端点形状 | 谁用 |
 *   |---|---|---|
 *   | `host` | 宿主未来的 `textToSpeech` 服务 | 宿主自己提供时 |
 *   | `chat-audio` | `chat/completions` + `audio` | MiMo 三种模型 |
 *   | `openai` | `/audio/speech` | OpenAI 及兼容网关 |
 *   | `minimax` | `/v1/t2a_v2` | MiniMax |
 *   | `baidu` | 免密钥朗读接口 | 没配任何 key 时的自然音兜底 |
 *   | `edge` | 免密钥神经音色（可能被 WAF 拦） | 有就用，没有就算了 |
 *   | `browser` | `speechSynthesis` | 永远的最后一步 |
 *
 * **纪律：密钥不进响应。** `describeTts()` 只回答"有没有配、从哪来"。
 */
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { resolveSecret } from './credentials.js'
import { hostService } from './host.js'
import { synthesizeWithBaidu } from './tts/baidu.js'
import { edgeFailure, synthesizeWithEdge } from './tts/edge.js'
import { DEFAULT_MIMO_VOICE, synthesizeWithMimo } from './tts/mimo.js'
import { synthesizeWithMinimax } from './tts/minimax.js'
import { synthesizeWithOpenAi } from './tts/openai.js'

/** 语音配置的有效值：配置文件 > 面板设置 > 默认（见 InterviewService.voiceConfig）。 */
async function voiceConfigOf(service) {
  if (typeof service?.voiceConfig === 'function') {
    try { return await service.voiceConfig() } catch { /* 回落配置 */ }
  }
  return service?.config ?? {}
}

/** The ways to make a voice. */
export const TTS_MODE = {
  SERVER: 'server',
  BROWSER: 'browser',
  NONE: 'none',
}

/** 参考音频样本的上限：MiMo 明确 10 MB。 */
const REFERENCE_AUDIO_LIMIT = 10 * 1024 * 1024

/**
 * Provider presets.
 *
 * **默认值不是随便写的。** `auto` 里的候选顺序就是这里的顺序：
 * 配了 key 的模型优先，其次免密钥的自然音，最后浏览器。
 */
const PRESETS = {
  mimo: {
    protocol: 'chat-audio',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    voice: DEFAULT_MIMO_VOICE,
    apiKeyEnv: 'MIMO_API_KEY',
    label: 'MiMo TTS',
  },
  openai: {
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    apiKeyEnv: 'OPENAI_API_KEY',
    label: 'OpenAI 语音',
  },
  minimax: {
    protocol: 'minimax',
    baseUrl: 'https://api.minimaxi.com',
    model: 'speech-02-hd',
    voice: 'female-shaonv',
    apiKeyEnv: 'MINIMAX_API_KEY',
    label: 'MiniMax 语音',
  },
  baidu: {
    protocol: 'baidu',
    keyless: true,
    label: '百度朗读',
  },
  edge: {
    protocol: 'edge',
    keyless: true,
    voice: 'zh-CN-XiaoxiaoNeural',
    label: 'Edge 神经音色',
  },
}

/** `auto` 的候选顺序。 */
const AUTO_ORDER = ['mimo', 'openai', 'minimax', 'baidu', 'edge']

/**
 * Resolve the synthesis chain **including the secret**.
 *
 * @param {import('../service.js').InterviewService} service
 * @returns {Promise<object>}
 */
export async function resolveTts(service) {
  const config = await voiceConfigOf(service)
  const explicit = typeof config.ttsProvider === 'string' ? config.ttsProvider.trim().toLowerCase() : 'auto'
  const format = config.ttsFormat === 'wav' ? 'wav' : 'mp3'
  const rate = typeof config.ttsRate === 'number' ? config.ttsRate : 1

  if (explicit === 'none') {
    return { mode: TTS_MODE.NONE, source: 'config', reason: '配置里明确关闭了语音播报（ttsProvider: none）。' }
  }
  if (explicit === 'browser') {
    return { mode: TTS_MODE.BROWSER, source: 'config', reason: '配置里指定只用浏览器音色（ttsProvider: browser）。' }
  }

  // 宿主未来若提供合成服务，优先用它——插件不越俎代庖。
  const hostTts = hostService(service?.ctx, 'textToSpeech')
  if ((explicit === 'auto' || explicit === 'host') && hostTts !== undefined && typeof hostTts.synthesize === 'function') {
    return {
      mode: TTS_MODE.SERVER,
      source: 'host',
      provider: 'host',
      protocol: 'host',
      label: '宿主语音合成',
      format,
      rate,
      voice: config.ttsVoice ?? '',
      service: hostTts,
      reason: '使用宿主提供的语音合成服务。',
    }
  }

  const candidates = explicit === 'auto'
    ? pickAutoOrder(config)
    : (explicit === 'host' ? [] : [explicit])

  const failures = []
  for (const name of candidates) {
    const descriptor = await describeCandidate(service, name, config, { format, rate })
    if (descriptor.ok) return descriptor.value
    if (descriptor.reason !== '') failures.push(`${name}：${descriptor.reason}`)
  }

  if (explicit !== 'auto') {
    return {
      mode: TTS_MODE.BROWSER,
      source: 'none',
      reason: failures.length > 0
        ? `配置的语音合成不可用（${failures.join('；')}），回落到浏览器音色。`
        : '配置的语音合成不可用，回落到浏览器音色。',
    }
  }
  return {
    mode: TTS_MODE.BROWSER,
    source: 'none',
    reason: failures.length > 0
      ? `没有可用的语音合成模型（${failures.join('；')}），回落到浏览器音色。`
      : '没有配语音合成模型，使用浏览器音色。',
  }
}

/**
 * The chain description the panel and the agent may see.
 *
 * @param {import('../service.js').InterviewService} service
 */
export async function describeTts(service) {
  const resolved = await resolveTts(service)
  if (resolved.mode !== TTS_MODE.SERVER) {
    return { mode: resolved.mode, source: resolved.source, reason: resolved.reason }
  }
  const { apiKey: _secret, service: _service, ...rest } = resolved
  return { ...rest, hasCredential: true }
}

/**
 * Synthesize one line of speech.
 *
 * @param {import('../service.js').InterviewService} service
 * @param {{text: string, voice?: string, rate?: number, signal?: AbortSignal}} input
 * @returns {Promise<object>}
 */
export async function synthesize(service, input = {}) {
  const text = String(input.text ?? '').trim()
  if (text === '') return { ok: false, mode: TTS_MODE.NONE, reason: '没有要合成的文本。' }

  const resolved = await resolveTts(service)
  if (resolved.mode !== TTS_MODE.SERVER) {
    return {
      ok: false,
      mode: resolved.mode,
      reason: resolved.reason,
      hint: resolved.mode === TTS_MODE.NONE
        ? '语音播报被关掉了；面试照常进行，问题会以文字显示。'
        : '浏览器会用系统音色播报；想更自然就在 ttsProvider / ttsModel 里配一个模型。',
    }
  }

  const voice = typeof input.voice === 'string' && input.voice.trim() !== ''
    ? input.voice.trim()
    : (resolved.voice ?? '')
  const rate = typeof input.rate === 'number' ? input.rate : resolved.rate
  const common = {
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
    model: resolved.model,
    voice,
    format: resolved.format,
    rate,
    text,
    signal: input.signal,
  }

  let result
  switch (resolved.protocol) {
    case 'host':
      result = await synthesizeWithHost(resolved.service, { ...common, text })
      break
    case 'chat-audio':
      result = await synthesizeWithMimo({
        ...common,
        style: resolved.style,
        referenceAudioDataUri: resolved.referenceAudioDataUri,
      })
      break
    case 'openai':
      result = await synthesizeWithOpenAi(common)
      break
    case 'minimax':
      result = await synthesizeWithMinimax(common)
      break
    case 'baidu':
      result = await synthesizeWithBaidu({ text, rate, signal: input.signal })
      break
    case 'edge':
      result = await synthesizeWithEdge({ baseUrl: resolved.baseUrl, voice, rate, text, signal: input.signal })
      break
    default:
      result = { ok: false, reason: `未知的语音合成协议：${resolved.protocol}` }
  }

  if (!result.ok) {
    return {
      ok: false,
      mode: TTS_MODE.SERVER,
      provider: resolved.provider,
      reason: result.reason,
      hint: '这条语音链路暂时不可用；问题照常以文字显示，不影响面试。',
    }
  }
  return {
    ok: true,
    mode: TTS_MODE.SERVER,
    provider: resolved.provider,
    label: resolved.label,
    model: resolved.model ?? '',
    voice,
    mimeType: result.mimeType ?? 'audio/mpeg',
    audioBase64: result.audioBase64,
  }
}

/**
 * `auto` 的候选顺序：把配了凭据的模型排在免密钥的自然音前面。
 *
 * @param {object} config
 * @returns {string[]}
 */
export function pickAutoOrder(config) {
  const hinted = providerHint(config)
  const order = hinted === '' ? [...AUTO_ORDER] : [hinted, ...AUTO_ORDER.filter(name => name !== hinted)]
  return order
}

/**
 * Infer which provider the user meant from what they already configured.
 *
 * 用户只写了 `ttsBaseUrl` / `ttsModel` 却把 provider 留成 auto 时，
 * 应该按内容猜出他在配哪一家，而不是硬套默认顺序。
 *
 * @param {object} config
 * @returns {string}
 */
export function providerHint(config) {
  const base = typeof config.ttsBaseUrl === 'string' ? config.ttsBaseUrl.toLowerCase() : ''
  const model = typeof config.ttsModel === 'string' ? config.ttsModel.toLowerCase() : ''
  const env = typeof config.ttsApiKeyEnv === 'string' ? config.ttsApiKeyEnv.toUpperCase() : ''
  if (base.includes('xiaomimimo') || model.startsWith('mimo-') || env === 'MIMO_API_KEY') return 'mimo'
  if (base.includes('minimax') || base.includes('minimaxi') || env === 'MINIMAX_API_KEY') return 'minimax'
  if (env === 'OPENAI_API_KEY') return 'openai'
  if (model !== '' || base !== '') {
    // 有自定义端点或模型但没有厂商标识：按 OpenAI 兼容协议理解（最通行的形状）。
    return 'openai'
  }
  return ''
}

/**
 * Build one candidate, or explain why it cannot be used.
 *
 * @param {import('../service.js').InterviewService} service
 * @param {string} name
 * @param {object} config
 * @param {{format: string, rate: number}} options
 */
async function describeCandidate(service, name, config, options) {
  const preset = PRESETS[name]
  if (preset === undefined) return { ok: false, reason: `未知的语音合成 provider：${name}` }

  if (preset.keyless && preset.protocol === 'edge') {
    const remembered = edgeFailure(config.ttsBaseUrl ?? '')
    if (remembered !== '') return { ok: false, reason: `最近失败过（${remembered}），十分钟内不再尝试` }
  }

  const baseUrl = typeof config.ttsBaseUrl === 'string' && config.ttsBaseUrl.trim() !== ''
    ? config.ttsBaseUrl.trim()
    : (preset.baseUrl ?? '')
  const model = typeof config.ttsModel === 'string' && config.ttsModel.trim() !== ''
    ? config.ttsModel.trim()
    : (preset.model ?? '')
  const voice = typeof config.ttsVoice === 'string' && config.ttsVoice.trim() !== ''
    ? config.ttsVoice.trim()
    : (preset.voice ?? '')
  const style = typeof config.ttsStyle === 'string' ? config.ttsStyle.trim() : ''

  let apiKey = ''
  let source = 'preset'
  if (!preset.keyless) {
    const credential = await resolveSecret(service?.ctx, {
      literal: config.ttsApiKey,
      envName: config.ttsApiKeyEnv !== undefined && config.ttsApiKeyEnv.trim() !== ''
        ? config.ttsApiKeyEnv.trim()
        : preset.apiKeyEnv,
    })
    if (credential.value === '') return { ok: false, reason: `没拿到凭据（${preset.apiKeyEnv}）` }
    apiKey = credential.value
    source = credential.source
  }

  let referenceAudioDataUri
  if (preset.protocol === 'chat-audio' && /voiceclone/i.test(model)) {
    const loaded = await loadReferenceAudio(config.ttsReferenceAudio)
    if (!loaded.ok) return { ok: false, reason: loaded.reason }
    referenceAudioDataUri = loaded.dataUri
  }

  return {
    ok: true,
    value: {
      mode: TTS_MODE.SERVER,
      source,
      provider: name,
      protocol: preset.protocol,
      label: preset.label,
      baseUrl,
      model,
      voice,
      style,
      format: options.format,
      rate: options.rate,
      apiKey,
      ...(referenceAudioDataUri === undefined ? {} : { referenceAudioDataUri }),
      reason: source === 'preset'
        ? `使用${preset.label}（免密钥）。`
        : `使用${preset.label}（凭据来自${source === 'host' ? '宿主' : source === 'config' ? '插件配置' : '环境变量'}）。`,
    },
  }
}

/**
 * Load a local reference sample as a data URI.
 *
 * **隐私**：样本只在合成请求时读取，不落任何别的文件，也不进日志。
 *
 * @param {string|undefined} path
 * @returns {Promise<{ok: true, dataUri: string}|{ok: false, reason: string}>}
 */
export async function loadReferenceAudio(path) {
  const file = typeof path === 'string' ? path.trim() : ''
  if (file === '') {
    return { ok: false, reason: 'voiceclone 需要 ttsReferenceAudio（一段 mp3 或 wav 样本路径）。' }
  }
  try {
    const info = await stat(file)
    if (!info.isFile()) return { ok: false, reason: `ttsReferenceAudio 不是一个文件：${file}` }
    if (info.size > REFERENCE_AUDIO_LIMIT) {
      return { ok: false, reason: `参考音频 ${Math.round(info.size / 1024 / 1024)} MB 超过 MiMo 的 10 MB 上限。` }
    }
    const extension = extname(file).toLowerCase()
    const mimeType = extension === '.wav' ? 'audio/wav' : extension === '.mp3' ? 'audio/mpeg' : ''
    if (mimeType === '') return { ok: false, reason: '参考音频只支持 mp3 或 wav。' }
    const buffer = await readFile(file)
    return { ok: true, dataUri: `data:${mimeType};base64,${buffer.toString('base64')}` }
  } catch (error) {
    return { ok: false, reason: `读不到参考音频：${messageOf(error)}` }
  }
}

/** Host-provided synthesis (future or third-party Host service). */
async function synthesizeWithHost(service, options) {
  try {
    const result = await service.synthesize({
      text: options.text,
      voice: options.voice === '' ? undefined : options.voice,
      rate: options.rate,
    })
    const audio = typeof result === 'string'
      ? result
      : (typeof result?.audioBase64 === 'string' ? result.audioBase64 : '')
    if (audio === '') return { ok: false, reason: '宿主语音合成没有返回音频。' }
    return { ok: true, audioBase64: audio, mimeType: result?.mimeType ?? 'audio/mpeg' }
  } catch (error) {
    return { ok: false, reason: `宿主语音合成失败：${messageOf(error)}` }
  }
}

/** Read an error message. */
function messageOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
