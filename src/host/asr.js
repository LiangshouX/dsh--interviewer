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
 *      `asrProvider` / `asrBaseUrl` / `asrApiKey` / `asrModel`。
 *   2. **继承 DSH 宿主**：宿主当前用的 provider 与模型（`agentDefaultModel`），
 *      以及 `llm.listProviders()` 里该 provider 的端点与凭据（如果宿主肯给）。
 *   3. **都没有** → 回落浏览器原生识别 + 键盘输入（插件的现状，零配置）。
 *
 * **关键纪律：继承不到就明说。** 宿主有模型 ≠ 插件拿得到 ASR 凭据。
 * 拿不到时返回 `mode: 'browser'` 并附 `reason`，界面上如实告诉用户
 * 「没继承到，服务端识别不可用，已回落到浏览器识别」，而不是偷偷失败。
 */
/** How long one transcription request may take. */
const REQUEST_TIMEOUT_MS = 60000
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
  const explicitKey = typeof config.asrApiKey === 'string' ? config.asrApiKey.trim() : ''
  const explicitBase = typeof config.asrBaseUrl === 'string' ? config.asrBaseUrl.trim() : ''
  const explicitModel = typeof config.asrModel === 'string' ? config.asrModel.trim() : ''
  const explicitProvider = typeof config.asrProvider === 'string' ? config.asrProvider.trim().toLowerCase() : 'auto'

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

  if (explicitKey !== '' && explicitBase !== '') {
    return {
      mode: 'server',
      source: 'config',
      endpoint: joinEndpoint(explicitBase, config.asrEndpoint),
      apiKey: explicitKey,
      model: explicitModel === '' ? 'whisper-1' : explicitModel,
      provider: 'configured',
      reason: '使用插件配置里的服务端识别。',
      language: config.asrLanguage ?? 'zh',
    }
  }

  // ② 继承宿主。
  if (host !== undefined && host.apiKey !== '' && host.baseUrl !== '') {
    return {
      mode: 'server',
      source: 'host',
      endpoint: joinEndpoint(host.baseUrl, config.asrEndpoint),
      apiKey: host.apiKey,
      model: host.model === '' ? 'whisper-1' : host.model,
      provider: host.provider,
      reason: `继承 DSH 宿主的 ${host.provider}${host.model === '' ? '' : ` / ${host.model}`} 配置。`,
      language: config.asrLanguage ?? 'zh',
    }
  }

  // ③ 都没有。
  const reason = host !== undefined && host.provider !== ''
    ? `宿主在用 ${host.provider}，但插件读不到它的识别端点或凭据，服务端识别不可用，已回落到浏览器识别。`
    : '没有配置服务端识别（插件配置里没有 asrApiKey/asrBaseUrl，宿主也没给出可继承的端点），已回落到浏览器识别。'
  return {
    mode: 'browser',
    source: 'none',
    reason,
    language: config.asrLanguage ?? 'zh',
  }
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

  const llm = serviceOf(ctx, 'llm')
  const selection = serviceOf(ctx, 'agentDefaultModel')
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
    host.baseUrl = firstString(match, ['baseUrl', 'base_url', 'apiBase', 'api_base', 'endpoint', 'url'])
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
function serviceOf(ctx, key) {
  try {
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
 * Join a base URL and an endpoint path.
 *
 * @param {string} baseUrl
 * @param {string|undefined} endpoint
 */
export function joinEndpoint(baseUrl, endpoint) {
  const base = baseUrl.replace(/\/+$/, '')
  const path = typeof endpoint === 'string' && endpoint.trim() !== '' ? endpoint.trim() : '/audio/transcriptions'
  if (/^https?:\/\//i.test(path)) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * Transcribe one audio blob.
 *
 * The wire format is the OpenAI-compatible multipart shape
 * (`file` + `model` + optional `language`), which is what most Whisper-compatible
 * endpoints accept.
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
  const filename = audioFilename(input.mimeType)
  form.append('file', new Blob([buffer], { type: input.mimeType ?? 'audio/webm' }), filename)
  form.append('model', settings.model)
  const language = typeof input.language === 'string' && input.language !== '' ? input.language : settings.language
  if (language !== '' && language !== undefined && language !== null) form.append('language', String(language))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(settings.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${settings.apiKey}` },
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
  if (/mp4|m4a/.test(type)) return 'audio.mp4'
  if (/mpeg|mp3/.test(type)) return 'audio.mp3'
  if (/wav/.test(type)) return 'audio.wav'
  if (/ogg/.test(type)) return 'audio.ogg'
  return 'audio.webm'
}
