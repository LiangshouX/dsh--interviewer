/**
 * Server-side speech recognition, with an honest fallback chain.
 *
 * **为什么要在服务端做 ASR。**
 * 浏览器原生 Web Speech API 零依赖，但它依赖浏览器的识别后端——
 * 在不少网络环境（企业内网、受限网络、Chromium 的境外后端）里连不上，
 * 表现为一开识别就报 network 错误。所以要给一条服务端的路。
 *
 * **配置从哪来（三级继承）：**
 *
 *   1. **插件显式配置**（`cordis.patch.yml` 或用户自己的 patch 层）：
 *      `asrProvider` / `asrBaseUrl` / `asrApiKey` / `asrApiKeyEnv` / `asrModel`。
 *   2. **继承 DSH 宿主**：宿主的 provider 与端点（`llm.listProviders()`），
 *      凭据走宿主的 **credentials seam**（`ctx.get('credentials').resolve(ref)`，
 *      与 DSH 生态里其他插件一致——**密钥永远不进配置文件**）。
 *   3. **都没有** → 回落浏览器原生识别 + 键盘输入（插件的现状，零配置）。
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
 * **关键纪律：继承不到就明说。** 宿主有模型 ≠ 插件拿得到 ASR 凭据。
 * 拿不到时返回 `mode: 'browser'` 并附 `reason`，界面上如实告诉用户
 * 「没继承到，服务端识别不可用，已回落到浏览器识别」，而不是偷偷失败。
 */
import { resolve } from 'node:path'

/** How long one transcription request may take. */
const REQUEST_TIMEOUT_MS = 120000

/** MiniMax's default base URL (mainland China platform). */
const DEFAULT_MINIMAX_BASE = 'https://api.minimaxi.com'

/** The credential reference used when the plugin inherits from the host. */
const DEFAULT_KEY_ENV = 'MINIMAX_API_KEY'

/**
 * Resolve the effective ASR configuration.
 *
 * @param {import('./service.js').InterviewService} service
 * @returns {Promise<object>}
 */
export async function resolveAsrConfig(service) {
  const config = service.config ?? {}
  const host = await readHostAsr(service)

  // ① 插件显式配置优先。
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
  if (explicitProvider === 'browser') {
    return {
      mode: 'browser',
      source: 'config',
      reason: '配置里指定只用浏览器识别（asrProvider: browser）。',
      language: config.asrLanguage ?? 'zh',
    }
  }

  const protocol = pickProtocol(explicitProvider, explicitBase, host.provider, host.baseUrl)
  const baseUrl = explicitBase !== '' ? explicitBase : (host.baseUrl !== '' ? host.baseUrl : defaultBase(protocol))
  const endpoint = endpointFor(protocol, baseUrl, config.asrEndpoint)

  // 凭据：明文 → credentials seam → 进程环境变量 → 宿主 provider 字段。
  const credential = await resolveCredential(service, config, host)
  if (credential.value === '') {
    const reason = host.provider !== ''
      ? `宿主在用 ${host.provider}，但插件没有拿到它的识别凭据（${config.asrApiKeyEnv ?? DEFAULT_KEY_ENV} 未配置），服务端识别不可用，已回落到浏览器识别。`
      : `没有配置服务端识别（${config.asrApiKeyEnv ?? DEFAULT_KEY_ENV} 未配置，也没有可继承的凭据），已回落到浏览器识别。`
    return {
      mode: 'browser',
      source: 'none',
      reason,
      language: config.asrLanguage ?? 'zh',
    }
  }

  return {
    mode: 'server',
    source: credential.source,
    endpoint,
    apiKey: credential.value,
    model: explicitModel !== '' ? explicitModel : defaultModel(protocol),
    protocol,
    provider: explicitProvider !== 'auto' ? explicitProvider : (host.provider !== '' ? host.provider : protocol),
    baseUrl,
    reason: credential.source === 'host'
      ? `继承 DSH 宿主的 ${host.provider || protocol} 配置（凭据来自 ${credential.detail}）。`
      : credential.source === 'config'
        ? '使用插件配置里的服务端识别。'
        : `使用环境变量 ${credential.detail} 的服务端识别。`,
    language: config.asrLanguage ?? 'zh',
  }
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

/**
 * The default base URL for a protocol.
 *
 * @param {'minimax'|'openai'} protocol
 */
function defaultBase(protocol) {
  return protocol === 'minimax' ? DEFAULT_MINIMAX_BASE : ''
}

/**
 * The default model for a protocol.
 *
 * @param {'minimax'|'openai'} protocol
 */
function defaultModel(protocol) {
  return protocol === 'minimax' ? 'asr-1.0' : 'whisper-1'
}

/**
 * The transcription endpoint for a protocol.
 *
 * @param {'minimax'|'openai'} protocol
 * @param {string} baseUrl
 * @param {string|undefined} endpointOverride
 */
export function endpointFor(protocol, baseUrl, endpointOverride) {
  if (typeof endpointOverride === 'string' && endpointOverride.trim() !== '') {
    return joinEndpoint(baseUrl, endpointOverride.trim())
  }
  if (protocol === 'minimax') {
    return `${stripVersionSegment(baseUrl)}/v1/speech_to_text`
  }
  return joinEndpoint(baseUrl, '/audio/transcriptions')
}

/**
 * Strip a trailing `/v1` so the endpoint can be built from an LLM base URL.
 *
 * A chat provider's base URL is usually `https://host/v1`; the ASR endpoint
 * is `https://host/v1/speech_to_text` for MiniMax. Joining blindly would
 * produce `/v1/v1/speech_to_text`.
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
 * Resolve the credential to use, in order of preference.
 *
 * @param {import('./service.js').InterviewService} service
 * @param {object} config
 * @param {{provider: string, model: string, baseUrl: string, apiKey: string}} host
 * @returns {Promise<{value: string, source: string, detail: string}>}
 */
async function resolveCredential(service, config, host) {
  const literal = typeof config.asrApiKey === 'string' ? config.asrApiKey.trim() : ''
  if (literal !== '') {
    return { value: literal, source: 'config', detail: '插件配置里的 asrApiKey' }
  }

  const envName = typeof config.asrApiKeyEnv === 'string' && config.asrApiKeyEnv.trim() !== ''
    ? config.asrApiKeyEnv.trim()
    : DEFAULT_KEY_ENV

  // 宿主的 credentials seam：与 DSH 生态里其他插件一致，密钥不进配置文件。
  const credentials = hostService(service.ctx, 'credentials')
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      const resolved = await credentials.resolve(envName)
      if (resolved !== undefined && resolved !== null && typeof resolved.value === 'string' && resolved.value !== '') {
        return { value: resolved.value, source: 'host', detail: `宿主的 credentials（${envName}）` }
      }
    } catch {
      // seam 不可用（宿主版本不同或未启用）：走下面的环境变量。
    }
  }

  const fromEnv = typeof process.env[envName] === 'string' ? process.env[envName].trim() : ''
  if (fromEnv !== '') {
    return { value: fromEnv, source: 'env', detail: envName }
  }

  if (host.apiKey !== '') {
    return { value: host.apiKey, source: 'host', detail: '宿主 provider 的凭据字段' }
  }

  return { value: '', source: 'none', detail: envName }
}

/**
 * Read whatever the host is willing to tell us about its LLM provider.
 *
 * 宿主服务：`llm`（provider 目录）与 `agentDefaultModel`（当前选择）。
 * 返回**可能**含凭据，也可能不含——宿主愿意给多少就给多少，
 * 拿不到就走回落，不猜。
 *
 * @param {import('./service.js').InterviewService} service
 */
async function readHostAsr(service) {
  const ctx = service.ctx
  const host = { provider: '', model: '', baseUrl: '', apiKey: '' }
  if (ctx === undefined || ctx === null) return host

  const llm = hostService(ctx, 'llm')
  const selection = hostService(ctx, 'agentDefaultModel')
  let current
  try {
    current = selection?.currentSelection?.()
  } catch {
    current = undefined
  }
  if (typeof current?.provider === 'string') host.provider = current.provider
  if (typeof current?.model === 'string') host.model = current.model

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
 * Get one host service off the plugin context.
 *
 * @param {any} ctx
 * @param {string} key
 */
function hostService(ctx, key) {
  try {
    if (ctx === undefined || ctx === null) return undefined
    if (typeof ctx.get === 'function') return ctx.get(key)
    return ctx[key]
  } catch {
    return undefined
  }
}

/**
 * The first non-empty string among the given keys.
 *
 * @param {any} source
 * @param {string[]} keys
 */
function firstString(source, keys) {
  if (source === undefined || source === null) return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/**
 * Transcribe one audio blob.
 *
 * The wire format follows the provider's own convention:
 * minimax → multipart with `file` + `model`, `language` as an HTTP header;
 * openai → multipart with `file` + `model` + `language` form fields.
 *
 * @param {import('./service.js').InterviewService} service
 * @param {{dataBase64: string, mimeType?: string, language?: string}} input
 */
export async function transcribe(service, input = {}) {
  const settings = await resolveAsrConfig(service)
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

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(settings.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: form,
    })
    const raw = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        mode: 'server',
        reason: `识别服务返回 HTTP ${response.status}`,
        text: '',
        warnings: [`识别服务返回 HTTP ${response.status}：${raw.slice(0, 200)}`],
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
    const message = error && error.name === 'AbortError'
      ? `识别超时（${REQUEST_TIMEOUT_MS}ms）`
      : `识别请求失败：${error && error.message ? error.message : String(error)}`
    return { ok: false, mode: 'server', reason: message, text: '', warnings: [message] }
  } finally {
    clearTimeout(timer)
  }
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

/** Resolve a path (kept for symmetry with the other host modules). */
export function resolveFrom(base, ...parts) {
  return resolve(base, ...parts)
}
