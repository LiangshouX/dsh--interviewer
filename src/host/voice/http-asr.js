/**
 * 走 HTTP 的服务端语音识别（插件自己的链路，不依赖宿主语音服务）。
 *
 * **两套协议，不能混。** ASR 不是一个统一标准：
 *
 *   | 协议 | 端点 | model | language |
 *   |---|---|---|---|
 *   | minimax | `{base}/v1/speech_to_text` | `asr-1.0` | **HTTP 头** `language:` |
 *   | openai  | `{base}/audio/transcriptions` | `whisper-1` | **表单字段** `language` |
 *
 * 协议选错的表现是 404 或 400，而错误信息通常 unhelpful，所以这里按
 * provider 与 baseUrl 判定，并把实际用的端点报给界面。
 *
 * **它是回落，不是首选。** 宿主有 `speechToText` 时优先用宿主（provider
 * 无关、凭据不经插件手）。这条链路存在的理由是：宿主没启用语音服务，
 * 或者用户就是想用自己的识别端点。
 */
import { resolveSecret } from './credentials.js'
import { firstString, hostSelection, hostService } from './host.js'
import { ASR_PROVIDERS } from './presets.js'
import { redactSecret } from './redact.js'

/** 语音配置的有效值：配置文件 > 面板设置 > 默认（见 InterviewService.voiceConfig）。 */
async function voiceConfigOf(service) {
  if (typeof service?.voiceConfig === 'function') {
    try { return await service.voiceConfig() } catch { /* 回落配置 */ }
  }
  return service?.config ?? {}
}

/** How long one transcription request may take. */
const REQUEST_TIMEOUT_MS = 120000

/** MiniMax's default base URL (mainland China platform). */
const DEFAULT_MINIMAX_BASE = 'https://api.minimaxi.com'

/**
 * 各协议默认的凭据名。
 *
 * **不能只有一个全局默认。** 上一版在没配 `asrApiKeyEnv` 时一律去找
 * `MINIMAX_API_KEY`，于是选了 OpenAI 兼容网关也永远报"MINIMAX_API_KEY 未配置"。
 * 默认凭据名必须跟协议/预设走。
 */
const DEFAULT_KEY_ENVS = {
  minimax: 'MINIMAX_API_KEY',
  openai: 'OPENAI_API_KEY',
}

/**
 * Resolve the effective HTTP ASR configuration **including the secret**.
 *
 * Only the transcription call may use this; the panel gets
 * `describeHttpAsr()` instead.
 *
 * @param {import('../service.js').InterviewService} service
 * @returns {Promise<object>}
 */
export async function resolveHttpAsr(service) {
  const config = await voiceConfigOf(service)
  const host = await readHostProvider(service.ctx)

  const explicitProvider = typeof config.asrProvider === 'string' ? config.asrProvider.trim().toLowerCase() : 'auto'
  const explicitKey = typeof config.asrApiKey === 'string' ? config.asrApiKey.trim() : ''
  const explicitBase = typeof config.asrBaseUrl === 'string' ? config.asrBaseUrl.trim() : ''
  const explicitModel = typeof config.asrModel === 'string' ? config.asrModel.trim() : ''

  if (explicitProvider === 'none') {
    return {
      mode: 'none',
      source: 'config',
      reason: '配置里明确关闭了服务端识别（asrProvider: none）。',
      language: config.asrLanguage ?? 'zh',
    }
  }
  if (explicitProvider === 'browser' || explicitProvider === 'host') {
    return {
      mode: 'browser',
      source: 'config',
      reason: explicitProvider === 'browser'
        ? '配置里指定只用浏览器识别（asrProvider: browser）。'
        : '配置里指定只用宿主语音服务（asrProvider: host），插件自己不走服务端识别。',
      language: config.asrLanguage ?? 'zh',
    }
  }

  // 预设：既给默认端点/模型，也决定协议。**名字必须先在预设表里注册**，
  // 否则用户从一个不存在的地方选了个 provider，解析层只能靠猜。
  const preset = ASR_PROVIDERS[explicitProvider]
  const protocol = preset !== undefined
    ? preset.protocol
    : pickProtocol(explicitProvider, explicitBase, host.provider, host.baseUrl)
  const baseUrl = explicitBase !== ''
    ? explicitBase
    : (preset?.baseUrl || host.baseUrl || defaultBase(protocol))
  const groupId = protocol === 'minimax' ? resolveGroupId(config.asrGroupId) : ''
  const endpoint = endpointFor(protocol, baseUrl, config.asrEndpoint, groupId)

  const envName = typeof config.asrApiKeyEnv === 'string' && config.asrApiKeyEnv.trim() !== ''
    ? config.asrApiKeyEnv.trim()
    : (preset?.apiKeyEnv || defaultKeyEnv(protocol))
  const credential = await resolveSecret(service.ctx, {
    literal: explicitKey,
    envName,
    hostValue: host.apiKey,
  })

  if (credential.value === '') {
    const reason = host.provider !== ''
      ? `宿主在用 ${host.provider}，但插件没有拿到它的识别凭据（${envName} 未配置），服务端识别不可用，已回落到浏览器识别。`
      : `没有配置服务端识别（${envName} 未配置，也没有可继承的凭据），已回落到浏览器识别。`
    return {
      mode: 'browser',
      source: 'none',
      reason,
      language: config.asrLanguage ?? 'zh',
    }
  }

  // **相对端点是没有意义的。** 选了「自定义 OpenAI 兼容」却还没填端点时，
  // 拼出来的是 `/audio/transcriptions`——请求会死在 URL 解析上。凭据齐了
  // 才检查它：没凭据时上一条原因（缺凭据）更准确。
  if (!/^https?:\/\//i.test(endpoint)) {
    return {
      mode: 'browser',
      source: 'none',
      reason: `选了「${preset?.label ?? protocol}」，但端点还是空的：填一个以 http(s):// 开头的端点（OpenAI 兼容通常是 .../v1）。`,
      language: config.asrLanguage ?? 'zh',
    }
  }

  return {
    mode: 'server',
    source: credential.source,
    endpoint,
    apiKey: credential.value,
    model: explicitModel !== '' ? explicitModel : (preset?.model || defaultModel(protocol)),
    protocol,
    provider: explicitProvider !== 'auto' ? explicitProvider : (host.provider !== '' ? host.provider : protocol),
    baseUrl,
    groupId,
    reason: credential.source === 'host'
      ? `继承 DSH 宿主的 ${host.provider || protocol} 配置（凭据来自 ${credential.detail}）。`
      : credential.source === 'config'
        ? '使用插件配置里的服务端识别。'
        : `使用${credential.detail}的服务端识别。`,
    language: config.asrLanguage ?? 'zh',
  }
}

/**
 * The same resolution, with the secret removed.
 *
 * @param {import('../service.js').InterviewService} service
 */
export async function describeHttpAsr(service) {
  const settings = await resolveHttpAsr(service)
  if (settings.mode !== 'server') return settings
  const { apiKey: _secret, ...rest } = settings
  return { ...rest, hasCredential: true }
}

/**
 * Which protocol to speak.
 *
 * @param {string} explicitProvider
 * @param {string} explicitBase
 * @param {string} hostProvider
 * @param {string} hostBase
 * @returns {'minimax'|'openai'}
 */
export function pickProtocol(explicitProvider, explicitBase, hostProvider, hostBase) {
  if (explicitProvider === 'minimax' || explicitProvider === 'openai') return explicitProvider
  const haystack = `${explicitProvider} ${explicitBase} ${hostProvider} ${hostBase}`.toLowerCase()
  return haystack.includes('minimax') ? 'minimax' : 'openai'
}

/** The default base URL for a protocol. */
function defaultBase(protocol) {
  return protocol === 'minimax' ? DEFAULT_MINIMAX_BASE : ''
}

/** The default model for a protocol. */
function defaultModel(protocol) {
  return protocol === 'minimax' ? 'asr-1.0' : 'whisper-1'
}

/** The default credential name for a protocol. */
function defaultKeyEnv(protocol) {
  return DEFAULT_KEY_ENVS[protocol] ?? 'MINIMAX_API_KEY'
}

/**
 * Which MiniMax GroupId to send, or '' to omit it.
 *
 * 与 TTS 的规则一致：显式配置优先，其次 `MINIMAX_GROUP_ID` 环境变量。
 *
 * @param {unknown} explicit
 * @returns {string}
 */
export function resolveGroupId(explicit) {
  const value = typeof explicit === 'string' ? explicit.trim() : ''
  if (value !== '') return value
  const fromEnv = typeof process.env?.MINIMAX_GROUP_ID === 'string' ? process.env.MINIMAX_GROUP_ID.trim() : ''
  return fromEnv
}

/**
 * The transcription endpoint for a protocol.
 *
 * MiniMax 的 GroupId 走**查询参数**（与 TTS 的 t2a_v2 一样），
 * 因此它必须拼在端点里，不能放进表单。
 *
 * @param {'minimax'|'openai'} protocol
 * @param {string} baseUrl
 * @param {string|undefined} endpointOverride
 * @param {string} [groupId]
 */
export function endpointFor(protocol, baseUrl, endpointOverride, groupId = '') {
  let endpoint
  if (typeof endpointOverride === 'string' && endpointOverride.trim() !== '') {
    endpoint = joinEndpoint(baseUrl, endpointOverride.trim())
  } else if (protocol === 'minimax') {
    endpoint = `${stripVersionSegment(baseUrl)}/v1/speech_to_text`
  } else {
    endpoint = joinEndpoint(baseUrl, '/audio/transcriptions')
  }
  if (groupId === '' || protocol !== 'minimax') return endpoint
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}GroupId=${encodeURIComponent(groupId)}`
}

/**
 * Strip a trailing `/v1` so the endpoint can be built from an LLM base URL.
 *
 * @param {string} baseUrl
 */
export function stripVersionSegment(baseUrl) {
  return baseUrl.replace(/\/+$/, '').replace(/\/v1$/i, '')
}

/**
 * Join a base URL and an endpoint path.
 *
 * @param {string} baseUrl
 * @param {string} path
 */
export function joinEndpoint(baseUrl, path) {
  const base = baseUrl.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(path)) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * Read whatever the host is willing to tell us about its LLM provider.
 *
 * **已从装机包里读实的限制（别再假设）。** `ctx.llm.listProviders()` 的返回
 * 形状就是 `[{ id, name }]`——**没有 `baseUrl`、没有 `apiKey`、也没有
 * `apiKeyEnv`**。所以这里的字段读取只是"宿主愿意多给就多给"的尽力而为，
 * 在当前 DSH 版本上基本读不到东西。
 *
 * 含义：**"继承宿主的聊天 provider 当识别端点"这条路是不成立的**。
 * 真正可继承的只有**凭据名**（宿主 profile 里的 `apiKeyEnv` 是凭据引用，
 * 插件按同一个名字走 credentials seam 就能取到，见 `resolveSecret`）；
 * 端点与模型 id 必须由插件配置给出（或走协议默认值）。
 *
 * @param {any} ctx
 */
export async function readHostProvider(ctx) {
  const host = { provider: '', model: '', baseUrl: '', apiKey: '' }
  if (ctx === undefined || ctx === null) return host

  const selection = hostSelection(ctx)
  host.provider = selection.provider
  host.model = selection.model

  const llm = hostService(ctx, 'llm')
  let providers = []
  try {
    const raw = await llm?.listProviders?.()
    providers = Array.isArray(raw) ? raw : []
  } catch {
    providers = []
  }
  const match = providers.find(entry => entry?.id === host.provider) ?? providers[0]
  if (match !== undefined) {
    if (host.provider === '') host.provider = typeof match.id === 'string' ? match.id : ''
    host.baseUrl = firstString(match, ['baseUrl', 'base_url', 'baseURL', 'apiBase', 'api_base', 'endpoint', 'url'])
    host.apiKey = firstString(match, ['apiKey', 'api_key', 'key', 'token', 'secret'])
  }
  return host
}

/**
 * Transcribe one audio blob over HTTP.
 *
 * @param {import('../service.js').InterviewService} service
 * @param {{dataBase64: string, mimeType?: string, language?: string}} input
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export async function transcribeHttp(service, input = {}, signal = undefined) {
  const settings = await resolveHttpAsr(service)
  if (settings.mode !== 'server') {
    return {
      ok: false,
      mode: settings.mode,
      reason: settings.reason,
      text: '',
      warnings: [settings.reason],
    }
  }

  const buffer = Buffer.from(String(input.dataBase64 ?? ''), 'base64')
  if (buffer.length === 0) {
    return { ok: false, mode: 'server', reason: '音频数据是空的', text: '', warnings: ['音频数据是空的。'] }
  }

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: input.mimeType ?? 'audio/wav' }), audioFilename(input.mimeType))
  form.append('model', settings.model)
  const language = typeof input.language === 'string' && input.language !== '' ? input.language : settings.language

  const headers = { Authorization: `Bearer ${settings.apiKey}` }
  if (settings.protocol === 'minimax') {
    // minimax 的语言是 **HTTP 头**，不是表单字段。
    if (language !== '' && language !== undefined && language !== null) headers.language = String(language)
  } else if (language !== '' && language !== undefined && language !== null) {
    form.append('language', String(language))
  }

  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  const combined = signal === undefined ? timeout.signal : AbortSignal.any([signal, timeout.signal])
  try {
    const response = await fetch(settings.endpoint, { method: 'POST', signal: combined, headers, body: form })
    const raw = await response.text()
    if (!response.ok) {
      // **网关可能在错误体里回显 Authorization。** 出口统一擦掉凭据值。
      const detail = redactSecret(raw.slice(0, 200), settings.apiKey)
      return {
        ok: false,
        mode: 'server',
        reason: `识别服务返回 HTTP ${response.status}`,
        text: '',
        hint: hintForStatus(response.status),
        warnings: [`识别服务返回 HTTP ${response.status}：${detail}`],
      }
    }
    let text = ''
    try {
      const parsed = JSON.parse(raw)
      text = typeof parsed.text === 'string'
        ? parsed.text
        : typeof parsed.transcript === 'string'
          ? parsed.transcript
          : ''
    } catch {
      text = ''
    }
    if (text === '') {
      return {
        ok: false,
        mode: 'server',
        reason: '识别服务没有返回文字',
        text: '',
        hint: '服务返回了 200 但没有文字：可能是空录音、协议不匹配，或模型不是识别模型。先用键盘继续面试，再换端点/模型重试。',
        warnings: ['识别服务返回的内容里没有文字字段。'],
      }
    }
    return {
      ok: true,
      mode: 'server',
      text,
      provider: settings.provider,
      model: settings.model,
      protocol: settings.protocol,
      source: settings.source,
      warnings: [],
    }
  } catch (error) {
    const aborted = error && error.name === 'AbortError'
    return {
      ok: false,
      mode: 'server',
      reason: aborted ? `识别超时（${REQUEST_TIMEOUT_MS}ms）` : `识别请求失败：${error && error.message ? error.message : String(error)}`,
      text: '',
      hint: aborted
        ? '网络慢或端点不可达：检查网络/代理，或先用浏览器识别 + 键盘输入。'
        : '检查端点是否可达、协议是否匹配（OpenAI 兼容是 /audio/transcriptions，MiniMax 是 /v1/speech_to_text）。',
      warnings: [aborted ? `识别超时（${REQUEST_TIMEOUT_MS}ms）` : '识别请求失败'],
    }
  } finally {
    clearTimeout(timer)
  }
}

/** A next step for a failed HTTP status. */
function hintForStatus(status) {
  if (status === 401 || status === 403) {
    return '识别服务拒绝了这把凭据：确认所选凭据名对应的 key 属于这个服务；也可以先用浏览器识别 + 键盘输入。'
  }
  if (status === 404) {
    return '端点不存在：OpenAI 兼容路径是 /audio/transcriptions，MiniMax 是 /v1/speech_to_text；检查端点/Base URL 是否写错。'
  }
  if (status === 400) {
    return '请求被拒：常见原因是音频格式不被接受（要 wav/mp3，不要 webm）、模型 id 不对，或 MiniMax 缺少 Group ID。'
  }
  if (status === 429) return '额度或频率被限：稍后再试，或先用浏览器识别 + 键盘输入。'
  return '检查凭据、端点与模型；也可以先用浏览器识别 + 键盘输入，面试照常进行。'
}

/**
 * A filename with an extension the servers actually accept.
 *
 * @param {string|undefined} mimeType
 */
function audioFilename(mimeType) {
  const type = typeof mimeType === 'string' ? mimeType : ''
  if (/mp4|m4a/.test(type)) return 'audio.m4a'
  if (/mpeg|mp3/.test(type)) return 'audio.mp3'
  if (/wav/.test(type)) return 'audio.wav'
  if (/ogg|opus/.test(type)) return 'audio.ogg'
  if (/flac/.test(type)) return 'audio.flac'
  return 'audio.wav'
}
