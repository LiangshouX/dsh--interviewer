/**
 * 走 HTTP 的服务端语音识别（插件自己的链路，不依赖宿主语音服务）。
 *
 * **四套协议，不能混。** ASR 没有统一标准，端点形状由厂商决定：
 *
 *   | 协议 | 端点 | model | language |
 *   |---|---|---|---|
 *   | `dashscope-asr` | `{base}/api/v1/services/aigc/multimodal-generation/generation` | `qwen-audio-3.0-asr-flash` | `parameters.language_hints` |
 *   | `chat-audio` | `{base}/chat/completions`（`input_audio` 内容部分） | `mimo-v2.5-asr` | `asr_options.language` |
 *   | `minimax` | `{base}/v1/speech_to_text` | `asr-1.0` | **HTTP 头** `language:` |
 *   | `openai` | `{base}/audio/transcriptions` | `whisper-1` | **表单字段** `language` |
 *
 * **为什么以前「走哪条都失败」。** Qwen 的 ASR 不在 `/audio/transcriptions`
 * 上（Token Plan 的中转连这个路径都没有），MiMo 的 ASR 也不在——两家都走
 * `chat/completions` / DashScope 原生端点。把三家都塞进「OpenAI 兼容
 * transcriptions」一套协议里，结果就是不管填哪个端点都 400/404。所以协议
 * 由预设决定，调用方（面板）不再自己拼 `asrEndpoint`。
 *
 * 协议选错的表现是 404 或 400，而错误信息通常 unhelpful，所以这里把实际
 * 用的端点、协议、模型都报给界面。
 *
 * **它是回落，不是首选。** 宿主有 `speechToText` 时优先用宿主（provider
 * 无关、凭据不经插件手）。这条链路存在的理由是：宿主没启用语音服务，
 * 或者用户就是想用自己的识别端点。
 */
import { resolveSecret } from './credentials.js'
import { firstString, hostSelection, hostService } from './host.js'
import { ASR_AUTO_ORDER, ASR_PROVIDERS, protocolLabel } from './presets.js'
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

/**
 * 各协议默认的凭据名。
 *
 * **不能只有一个全局默认。** 上一版在没配 `asrApiKeyEnv` 时一律去找
 * `MINIMAX_API_KEY`，于是选了 OpenAI 兼容网关也永远报"MINIMAX_API_KEY 未配置"。
 * 默认凭据名必须跟协议/预设走。
 */
const DEFAULT_KEY_ENVS = {
  'minimax': 'MINIMAX_API_KEY',
  'openai': 'OPENAI_API_KEY',
  'chat-audio': 'MIMO_API_KEY',
  'dashscope-asr': 'DASHSCOPE_API_KEY',
}

/**
 * Resolve the effective HTTP ASR configuration **including the secret**.
 *
 * `auto` 会按预设表顺序逐个试：宿主继承的端点 → 预设供应商（Token Plan /
 * 直连）→ OpenAI 兼容。第一个拿到凭据且端点合法的就是它；全都不可用时
 * 把每条具体原因拼起来交回面板，而不是一句「识别不可用」。
 *
 * @param {import('../service.js').InterviewService} service
 * @returns {Promise<object>}
 */
export async function resolveHttpAsr(service) {
  const config = await voiceConfigOf(service)
  const host = await readHostProvider(service.ctx)
  const language = config.asrLanguage ?? 'zh'
  const explicit = typeof config.asrProvider === 'string' ? config.asrProvider.trim().toLowerCase() : 'auto'

  if (explicit === 'none') {
    return {
      mode: 'none',
      source: 'config',
      reason: '配置里明确关闭了服务端识别（asrProvider: none）。',
      language,
    }
  }
  if (explicit === 'browser' || explicit === 'host') {
    return {
      mode: 'browser',
      source: 'config',
      reason: explicit === 'browser'
        ? '配置里指定只用浏览器识别（asrProvider: browser）。'
        : '配置里指定只用宿主语音服务（asrProvider: host），插件自己不走服务端识别。',
      language,
    }
  }

  // 显式选了一个预设：只试它。**不偷偷换别家**——用户配 A 却跑在 B 上，
  // 没人能解释为什么结果不一样。未知 id（老配置文件）按 auto 处理，
  // 否则会变成一个永远失败的哑链路。
  const known = ASR_PROVIDERS[explicit] !== undefined
  const auto = explicit === 'auto' || !known
  const attempts = auto
    ? autoCandidates(host)
    : [{ kind: 'preset', id: explicit }]

  const failures = []
  for (const attempt of attempts) {
    const result = await resolveOne(service, config, host, language, attempt, { auto })
    if (result.ok) return result.value
    failures.push(result.reason)
  }

  return {
    mode: 'browser',
    source: 'none',
    reason: `${failures.length === 0 ? '没有可用的服务端识别。' : failures.join('；')}，已回落到浏览器识别。`,
    language,
  }
}

/**
 * `auto` 的候选顺序：宿主继承 → 预设表顺序 → 配置里的自定义端点。
 *
 * @param {{provider: string, model: string, baseUrl: string, apiKey: string}} host
 * @param {object} config
 * @returns {Array<{kind: 'host'|'preset', id?: string}>}
 */
export function autoCandidates(host) {
  const list = []
  if (host.baseUrl !== '' || host.apiKey !== '') list.push({ kind: 'host' })
  for (const id of ASR_AUTO_ORDER) list.push({ kind: 'preset', id })
  return list
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
 * Resolve one candidate (host-inherited or one preset) including its secret.
 *
 * @param {import('../service.js').InterviewService} service
 * @param {object} config
 * @param {{provider: string, model: string, baseUrl: string, apiKey: string}} host
 * @param {string} language
 * @param {{kind: 'host'|'preset', id?: string}} attempt
 * @param {{auto?: boolean}} [options]
 * @returns {Promise<{ok: true, value: object} | {ok: false, reason: string}>}
 */
async function resolveOne(service, config, host, language, attempt, options = {}) {
  const preset = attempt.kind === 'preset' ? ASR_PROVIDERS[attempt.id] : undefined
  const hostMode = attempt.kind === 'host'
  const explicitBase = typeof config.asrBaseUrl === 'string' ? config.asrBaseUrl.trim() : ''
  const explicitModel = typeof config.asrModel === 'string' ? config.asrModel.trim() : ''
  const explicitEndpoint = typeof config.asrEndpoint === 'string' ? config.asrEndpoint.trim() : ''
  const label = hostMode ? '宿主语音识别' : (preset?.label ?? `未知识别服务 ${attempt.id}`)

  // 预设供应商是**配好的一对**：端点、协议、模型都锁死。允许随手改端点正是
  // 「看起来填对了却一直失败」的来源。要自定义就选「OpenAI 兼容 · 自定义端点」。
  const locked = preset?.locked === true
  const protocol = hostMode
    ? pickProtocol('', host.baseUrl, host.provider, '')
    : (preset?.protocol ?? pickProtocol(explicitBase !== '' ? 'auto' : String(config.asrProvider ?? ''), explicitBase, host.provider, host.baseUrl))
  const baseUrl = hostMode
    ? host.baseUrl
    : (locked
      ? (preset?.baseUrl ?? '')
      : (explicitBase !== '' ? explicitBase : (preset?.baseUrl ?? '')))
  const model = hostMode
    ? (explicitModel !== '' ? explicitModel : (host.model !== '' ? host.model : defaultModel(protocol)))
    : (locked
      ? (preset?.model ?? defaultModel(protocol))
      : (explicitModel !== '' ? explicitModel : (preset?.model ?? defaultModel(protocol))))

  if (baseUrl === '') {
    return {
      ok: false,
      reason: hostMode
        ? `宿主 provider ${host.provider || '（未指定）'} 没有给出可用的端点（baseUrl）`
        : `「${label}」还没有填端点`,
    }
  }

  const groupId = protocol === 'minimax' ? resolveGroupId(config.asrGroupId) : ''
  const endpoint = endpointFor(protocol, baseUrl, locked ? '' : explicitEndpoint, groupId)
  if (!/^https?:\/\//i.test(endpoint)) {
    return {
      ok: false,
      reason: `「${label}」的端点不是 http(s):// 开头：${endpoint}`,
    }
  }

  const envName = typeof config.asrApiKeyEnv === 'string' && config.asrApiKeyEnv.trim() !== ''
    ? config.asrApiKeyEnv.trim()
    : (preset?.apiKeyEnv || defaultKeyEnv(protocol))
  // 明文 key 只属于「用户点名的那一条链路」。auto 里把同一把 key 分发给所有
  // 预设供应商，会让第一家（Qwen）拿着别家的 key 先跑，结果是
  // 「明明配了 MiMo 却报 Qwen 401」。所以：显式选择时认明文 key；
  // auto 只给 OpenAI 兼容这类自定端点使用。
  const literalKey = options.auto === true && locked ? '' : (typeof config.asrApiKey === 'string' ? config.asrApiKey : '')
  const credential = await resolveSecret(service.ctx, {
    literal: literalKey,
    envName,
    hostValue: host.apiKey,
  })
  if (credential.value === '') {
    return {
      ok: false,
      reason: hostMode
        ? `宿主在用 ${host.provider || protocol}，但插件没有拿到它的识别凭据（${envName} 未配置）`
        : `「${label}」没有拿到凭据（${envName} 未配置）`,
    }
  }

  return {
    ok: true,
    value: {
      mode: 'server',
      source: credential.source,
      endpoint,
      apiKey: credential.value,
      model,
      protocol,
      protocolLabel: protocolLabel(protocol),
      provider: hostMode ? (host.provider || protocol) : (preset?.id ?? protocol),
      label,
      baseUrl,
      groupId,
      reason: hostMode
        ? `继承 DSH 宿主的 ${host.provider || protocol} 配置（凭据来自 ${credential.detail}）。`
        : credential.source === 'config'
          ? `使用插件配置里的服务端识别（${label}）。`
          : `使用 ${label}；凭据来自 ${credential.detail}。`,
      language,
    },
  }
}

/**
 * Which protocol to speak when there is no preset (host-inherited / custom).
 *
 * @param {string} explicitProvider
 * @param {string} explicitBase
 * @param {string} hostProvider
 * @param {string} hostBase
 * @returns {'minimax'|'openai'|'chat-audio'|'dashscope-asr'}
 */
export function pickProtocol(explicitProvider, explicitBase, hostProvider, hostBase) {
  const name = String(explicitProvider ?? '').toLowerCase()
  if (ASR_PROVIDERS[name] !== undefined) return ASR_PROVIDERS[name].protocol
  const haystack = `${explicitProvider} ${explicitBase} ${hostProvider} ${hostBase}`.toLowerCase()
  if (haystack.includes('minimax')) return 'minimax'
  if (haystack.includes('xiaomimimo')) return 'chat-audio'
  if (haystack.includes('dashscope') || haystack.includes('maas.qianwenaiapi') || haystack.includes('maas.aliyuncs')) return 'dashscope-asr'
  return 'openai'
}

/** The default model for a protocol. */
function defaultModel(protocol) {
  if (protocol === 'minimax') return 'asr-1.0'
  if (protocol === 'chat-audio') return 'mimo-v2.5-asr'
  if (protocol === 'dashscope-asr') return 'qwen-audio-3.0-asr-flash'
  return 'whisper-1'
}

/** The default credential name for a protocol. */
function defaultKeyEnv(protocol) {
  return DEFAULT_KEY_ENVS[protocol] ?? 'OPENAI_API_KEY'
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
 * @param {'minimax'|'openai'|'chat-audio'|'dashscope-asr'} protocol
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
  } else if (protocol === 'chat-audio') {
    endpoint = joinEndpoint(baseUrl, '/chat/completions')
  } else if (protocol === 'dashscope-asr') {
    endpoint = joinEndpoint(baseUrl, '/api/v1/services/aigc/multimodal-generation/generation')
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

  const language = typeof input.language === 'string' && input.language !== '' ? input.language : settings.language
  const mimeType = typeof input.mimeType === 'string' && input.mimeType !== '' ? input.mimeType : 'audio/wav'
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  const combined = signal === undefined ? timeout.signal : AbortSignal.any([signal, timeout.signal])

  try {
    const outcome = settings.protocol === 'chat-audio'
      ? await postChatAudio(settings, { buffer, mimeType, language }, combined)
      : settings.protocol === 'dashscope-asr'
        ? await postDashScopeAsr(settings, { buffer, mimeType, language }, combined)
        : await postMultipart(settings, { buffer, mimeType, language }, combined)
    if (!outcome.ok) return outcome.result
    return {
      ok: true,
      mode: 'server',
      text: outcome.text,
      provider: settings.provider,
      label: settings.label,
      model: settings.model,
      protocol: settings.protocol,
      protocolLabel: settings.protocolLabel,
      source: settings.source,
      warnings: [],
    }
  } catch (error) {
    const aborted = error && error.name === 'AbortError'
    const reason = aborted ? `识别超时（${REQUEST_TIMEOUT_MS}ms）` : `识别请求失败：${error && error.message ? error.message : String(error)}`
    return {
      ok: false,
      mode: 'server',
      reason,
      text: '',
      hint: aborted
        ? '网络慢或端点不可达：检查网络/代理，或先用浏览器识别 + 键盘输入。'
        : hintForStatus(0, settings),
      warnings: [reason],
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 标准 multipart 协议（OpenAI /audio/transcriptions 与 MiniMax speech_to_text）。
 *
 * @param {object} settings
 * @param {{buffer: Buffer, mimeType: string, language: string}} input
 * @param {AbortSignal} signal
 */
async function postMultipart(settings, input, signal) {
  const form = new FormData()
  form.append('file', new Blob([input.buffer], { type: input.mimeType }), audioFilename(input.mimeType))
  form.append('model', settings.model)

  const headers = { Authorization: `Bearer ${settings.apiKey}` }
  if (settings.protocol === 'minimax') {
    // minimax 的语言是 **HTTP 头**，不是表单字段。
    if (input.language !== '' && input.language !== undefined && input.language !== null) {
      headers.language = String(input.language)
    }
  } else if (input.language !== '' && input.language !== undefined && input.language !== null) {
    form.append('language', String(input.language))
  }

  const response = await fetch(settings.endpoint, { method: 'POST', signal, headers, body: form })
  const raw = await response.text()
  if (!response.ok) return { ok: false, result: failure(settings, response.status, raw) }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  const text = firstText(parsed, [
    json => json?.text,
    json => json?.transcript,
    json => json?.result?.text,
  ])
  if (text === '') {
    return { ok: false, result: emptyText(settings, raw) }
  }
  return { ok: true, text }
}

/**
 * MiMo 的 ASR：`chat/completions` + `input_audio` 内容部分（不是 transcriptions）。
 *
 * @param {object} settings
 * @param {{buffer: Buffer, mimeType: string, language: string}} input
 * @param {AbortSignal} signal
 */
async function postChatAudio(settings, input, signal) {
  const language = input.language === '' || input.language === undefined ? 'auto' : input.language
  const body = {
    model: settings.model,
    messages: [{
      role: 'user',
      content: [{
        type: 'input_audio',
        input_audio: { data: `data:${audioMime(input.mimeType)};base64,${input.buffer.toString('base64')}` },
      }],
    }],
    asr_options: { language },
    stream: false,
  }
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      // MiMo 文档明说支持 `api-key`；Bearer 也收，两个都带上省得踩网关差异。
      'api-key': settings.apiKey,
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const raw = await response.text()
  if (!response.ok) return { ok: false, result: failure(settings, response.status, raw) }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, result: emptyText(settings, raw) }
  }
  const providerFailure = embeddedError(parsed)
  if (providerFailure !== '') {
    return {
      ok: false,
      result: {
        ok: false,
        mode: 'server',
        reason: `${settings.label} 拒绝了请求：${providerFailure}`,
        text: '',
        hint: hintForStatus(200, settings),
        warnings: [providerFailure],
      },
    }
  }
  const text = firstText(parsed, [
    json => json?.choices?.[0]?.message?.content,
    json => json?.output?.text,
  ])
  if (text === '') return { ok: false, result: emptyText(settings, raw) }
  return { ok: true, text }
}

/**
 * Qwen / 百炼的 ASR：DashScope 原生 multimodal-generation（不是 chat/completions）。
 *
 * 本机实测（2026-11）：Token Plan 中转上 `qwen-audio-3.0-asr-flash` 走
 * `chat/completions` 是 404 model_not_found，走原生端点 200 且能出文字。
 *
 * @param {object} settings
 * @param {{buffer: Buffer, mimeType: string, language: string}} input
 * @param {AbortSignal} signal
 */
async function postDashScopeAsr(settings, input, signal) {
  const format = audioFormat(input.mimeType)
  const parameters = { format, sample_rate: '16000' }
  const hints = languageHints(input.language)
  if (hints.length > 0) parameters.language_hints = hints
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    signal,
    headers: { authorization: `Bearer ${settings.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: settings.model,
      input: {
        messages: [{
          role: 'user',
          content: [{ audio: `data:${audioMime(input.mimeType)};base64,${input.buffer.toString('base64')}` }],
        }],
      },
      parameters,
    }),
  })
  const raw = await response.text()
  if (!response.ok) return { ok: false, result: failure(settings, response.status, raw) }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, result: emptyText(settings, raw) }
  }
  // DashScope 的同步接口在 200 里也可能带业务错误码。
  if (parsed?.code !== undefined && parsed?.code !== null && parsed?.output === undefined) {
    const message = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed).slice(0, 200)
    return {
      ok: false,
      result: {
        ok: false,
        mode: 'server',
        reason: `${settings.label} 拒绝了请求（${parsed.code}）：${message}`,
        text: '',
        hint: hintForStatus(200, settings),
        warnings: [`${parsed.code}: ${message}`],
      },
    }
  }
  const text = firstText(parsed, [
    json => json?.output?.text,
    json => json?.output?.sentence?.text,
    json => json?.text,
    json => json?.sentence?.text,
  ])
  if (text === '') return { ok: false, result: emptyText(settings, raw) }
  return { ok: true, text }
}

/** A failed HTTP response, as a transcription result. */
function failure(settings, status, raw) {
  // **网关可能在错误体里回显 Authorization。** 出口统一擦掉凭据值。
  const detail = redactSecret(raw.slice(0, 300), settings.apiKey)
  return {
    ok: false,
    mode: 'server',
    reason: `${settings.label} 返回 HTTP ${status}`,
    text: '',
    hint: hintForStatus(status, settings),
    warnings: [`${settings.label} 返回 HTTP ${status}：${detail}`],
  }
}

/** A 200 response that carries no text. */
function emptyText(settings, raw) {
  return {
    ok: false,
    mode: 'server',
    reason: `${settings.label} 没有返回文字`,
    text: '',
    hint: `服务返回了 200 但没有文字：可能是空录音、协议不匹配（${settings.protocolLabel}），或模型不是识别模型。先用键盘继续面试，再核对所选预设。`,
    warnings: [`${settings.label} 返回的内容里没有文字字段：${raw.slice(0, 200)}`],
  }
}

/** A next step for a failed HTTP status (0 = network/timeout). */
function hintForStatus(status, settings) {
  const where = `当前链路：${settings.label} · ${settings.protocolLabel} · ${settings.model}`
  if (status === 401 || status === 403) {
    return `识别服务拒绝了这把凭据。Token Plan 的 key 只在它自己的中转有效，打官方端点是 401；官方按量 key 也一样。确认凭据名与预设配对。${where}`
  }
  if (status === 404) {
    return `端点不存在：这个预设想必被改过，或网关没有这个路径。OpenAI 兼容是 /audio/transcriptions，MiniMax 是 /v1/speech_to_text，MiMo 是 /chat/completions，Qwen 是 DashScope 原生端点。${where}`
  }
  if (status === 400) {
    return `请求被拒：常见原因是音频格式不被接受（要 wav/mp3，不要 webm）、模型 id 与端点不配对，或参数不被支持。${where}`
  }
  if (status === 402) {
    return `余额/额度不足：充值或换一条链路（免密钥的浏览器识别 + 键盘输入也能继续面试）。${where}`
  }
  if (status === 429) {
    return `额度或频率被限：等一会儿再试，或换一条链路（浏览器识别 + 键盘输入也能继续面试）。${where}`
  }
  return `检查凭据、端点与模型；也可以用浏览器识别 + 键盘输入，面试照常进行。${where}`
}

/**
 * MiMo 把业务错误放在 `error` / `base_resp` 里，HTTP 仍可能是 200。
 *
 * @param {any} parsed
 */
function embeddedError(parsed) {
  const message = parsed?.error?.message
  if (typeof message === 'string' && message !== '') return message
  const status = parsed?.base_resp?.status_code
  if (typeof status === 'number' && status !== 0) {
    const text = typeof parsed?.base_resp?.status_msg === 'string' ? parsed.base_resp.status_msg : '未知原因'
    return `status_code=${status}：${text}`
  }
  return ''
}

/**
 * 第一个非空文本字段。
 *
 * @param {any} parsed
 * @param {Array<(json: any) => unknown>} readers
 * @returns {string}
 */
function firstText(parsed, readers) {
  for (const read of readers) {
    const value = read(parsed)
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    // OpenAI 风格的 content 数组（多模态）
    if (Array.isArray(value)) {
      const joined = value
        .map(part => (typeof part === 'string' ? part : (part?.text ?? part?.content ?? '')))
        .filter(text => typeof text === 'string' && text !== '')
        .join('')
      if (joined.trim() !== '') return joined.trim()
    }
  }
  return ''
}

/**
 * DashScope 的音频格式参数（必须与实际音频一致）。
 *
 * @param {string} mimeType
 */
function audioFormat(mimeType) {
  const type = String(mimeType ?? '').toLowerCase()
  if (type.includes('wav')) return 'wav'
  if (type.includes('mp3') || type.includes('mpeg')) return 'mp3'
  if (type.includes('pcm')) return 'pcm'
  if (type.includes('m4a') || type.includes('mp4')) return 'm4a'
  return 'wav'
}

/** The mime type the provider should see. */
function audioMime(mimeType) {
  const type = String(mimeType ?? '').toLowerCase()
  if (type.includes('wav')) return 'audio/wav'
  if (type.includes('mp3') || type.includes('mpeg')) return 'audio/mpeg'
  if (type.includes('m4a') || type.includes('mp4')) return 'audio/mp4'
  return 'audio/wav'
}

/**
 * DashScope 的语种提示：只送确定的两字母/地区码，`auto` 与空值不送。
 *
 * @param {string} language
 * @returns {string[]}
 */
function languageHints(language) {
  const value = typeof language === 'string' ? language.trim().toLowerCase() : ''
  if (value === '' || value === 'auto') return []
  return /^[a-z]{2,3}(-[a-z]{2,4})?$/.test(value) ? [value] : []
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
