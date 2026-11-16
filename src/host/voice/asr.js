/**
 * 语音识别的编排层：**先问宿主，再问插件自己，最后才是浏览器**。
 *
 * **为什么顺序是这样。**
 *
 *   1. `host`——宿主的 `ctx.speechToText`。provider 由宿主注册（可以是本地
 *      模型，也可以是云端），插件不经手凭据、不绑定厂商。这是"完全依赖
 *      宿主能力"的那条路。
 *   2. `server`——插件直连一个 OpenAI/MiniMax 兼容端点。它存在的理由只有
 *      两个：宿主没启用语音服务，或者用户就是要用自己的识别端点。
 *   3. `browser`——浏览器 Web Speech。零成本，但依赖 Chromium 的识别后端，
 *      在受限网络里常常不可达；不可达是**正常状态**，切键盘继续。
 *
 * **回落要说出来。** 每次转写都带回 `attempts`：谁试过、谁失败、为什么。
 * 「悄悄换了一条链路」是这类插件最坏的失败方式——用户会以为自己听到的
 * 是服务端结果，其实在用浏览器。
 *
 * **安全。** 对外的状态描述（`describeAsr`）**永远不含密钥**，只回答
 * "有没有凭据、来自哪一层"。
 */
import { hostAsrState, transcribeWithHost } from './host-asr.js'
import { describeHttpAsr, resolveHttpAsr, transcribeHttp } from './http-asr.js'
import { hostService } from './host.js'

/** The three ways to recognize speech, plus "off". */
export const ASR_MODE = {
  HOST: 'host',
  SERVER: 'server',
  BROWSER: 'browser',
  NONE: 'none',
}

/**
 * Resolve the chain **including secrets**, for the transcription call.
 *
 * @param {import('../service.js').InterviewService} service
 */
export async function resolveAsr(service) {
  const config = service.config ?? {}
  const explicit = typeof config.asrProvider === 'string' ? config.asrProvider.trim().toLowerCase() : 'auto'
  const language = typeof config.asrLanguage === 'string' ? config.asrLanguage.trim() : ''
  const host = hostAsrState(service, { language })
  const server = await resolveHttpAsr(service)

  if (explicit === 'none') {
    return { mode: ASR_MODE.NONE, source: 'config', reason: '配置里明确关闭了语音识别（asrProvider: none）。', language, host, server }
  }
  if (explicit === 'browser') {
    return { mode: ASR_MODE.BROWSER, source: 'config', reason: '配置里指定只用浏览器识别（asrProvider: browser）。', language, host, server }
  }
  if (explicit === 'host') {
    return host.available
      ? { mode: ASR_MODE.HOST, source: 'host', reason: host.reason, language, host, server }
      : { mode: ASR_MODE.BROWSER, source: 'none', reason: host.reason, language, host, server }
  }
  if (explicit === 'minimax' || explicit === 'openai') {
    return server.mode === 'server'
      ? { mode: ASR_MODE.SERVER, source: server.source, reason: server.reason, language, host, server }
      : { mode: ASR_MODE.BROWSER, source: 'none', reason: server.reason, language, host, server }
  }

  // auto：宿主优先。
  if (host.available) {
    return { mode: ASR_MODE.HOST, source: 'host', reason: host.reason, language, host, server }
  }
  if (server.mode === 'server') {
    return { mode: ASR_MODE.SERVER, source: server.source, reason: server.reason, language, host, server }
  }
  return {
    mode: ASR_MODE.BROWSER,
    source: 'none',
    reason: `${host.reason}${server.reason === undefined ? '' : ' ' + server.reason}`,
    language,
    host,
    server,
  }
}

/**
 * The chain description the panel and the agent may see.
 *
 * @param {import('../service.js').InterviewService} service
 */
export async function describeAsr(service) {
  const resolved = await resolveAsr(service)
  const host = publicHost(resolved.host)
  const server = await describeHttpAsr(service)
  const hint = hintFor(resolved, host, server)
  return {
    mode: resolved.mode,
    source: resolved.source,
    reason: resolved.reason,
    language: resolved.language,
    host,
    server: publicServer(server),
    ...(hint === '' ? {} : { hint }),
  }
}

/**
 * Transcribe one recording, trying the chain in order.
 *
 * @param {import('../service.js').InterviewService} service
 * @param {{dataBase64?: string, mimeType?: string, language?: string}} input
 * @param {{signal?: AbortSignal}} [options]
 */
export async function transcribeAudio(service, input = {}, options = {}) {
  const resolved = await resolveAsr(service)
  const signal = options.signal
  const buffer = Buffer.from(String(input.dataBase64 ?? ''), 'base64')
  const language = typeof input.language === 'string' && input.language.trim() !== ''
    ? input.language.trim()
    : resolved.language
  const attempts = []

  if (buffer.length === 0) {
    return { ok: false, mode: resolved.mode, text: '', reason: '音频数据是空的。', warnings: ['音频数据是空的。'], attempts }
  }

  for (const candidate of candidateOrder(resolved)) {
    if (candidate === ASR_MODE.HOST) {
      const result = await transcribeWithHost(service, { buffer, language }, signal)
      attempts.push({ mode: ASR_MODE.HOST, ok: result.ok, ...(result.reason === undefined ? {} : { reason: result.reason }) })
      if (result.ok) return { ...result, attempts, language }
      continue
    }
    if (candidate === ASR_MODE.SERVER) {
      const result = await transcribeHttp(service, { ...input, language }, signal)
      attempts.push({ mode: ASR_MODE.SERVER, ok: result.ok, ...(result.reason === undefined ? {} : { reason: result.reason }) })
      if (result.ok) return { ...result, attempts, language }
    }
  }

  const reason = attempts.length === 0
    ? resolved.reason
    : attempts.map(item => `${item.mode === ASR_MODE.HOST ? '宿主' : '服务端'}：${item.reason ?? '失败'}`).join('；')
  return {
    ok: false,
    mode: resolved.mode === ASR_MODE.NONE ? ASR_MODE.NONE : ASR_MODE.BROWSER,
    text: '',
    reason,
    hint: '这一段没转出来。用键盘输入不受影响；面试照常进行。',
    warnings: [reason],
    attempts,
  }
}

/**
 * Which links to try, in order.
 *
 * 只有 `auto` 与显式 `host` 会回落到服务端；显式指定厂商时**不**偷偷换链路，
 * 否则用户配 A 却跑在 B 上，没人能解释为什么结果不一样。
 *
 * @param {object} resolved
 * @returns {string[]}
 */
function candidateOrder(resolved) {
  const order = []
  const hostUsable = resolved.host?.available === true
  const serverUsable = resolved.server?.mode === 'server'
  if (resolved.mode === ASR_MODE.NONE || resolved.mode === ASR_MODE.BROWSER) {
    if (hostUsable) order.push(ASR_MODE.HOST)
    if (serverUsable) order.push(ASR_MODE.SERVER)
    return order
  }
  order.push(resolved.mode)
  if (resolved.mode === ASR_MODE.HOST && serverUsable) order.push(ASR_MODE.SERVER)
  if (resolved.mode === ASR_MODE.SERVER && hostUsable) order.push(ASR_MODE.HOST)
  return order
}

/** Only the host fields a panel may see. */
function publicHost(host) {
  if (host === undefined) return { available: false, reason: '没有读取宿主语音服务。' }
  return {
    available: host.available === true,
    ready: host.ready === true,
    needsPreparation: host.needsPreparation === true,
    reason: host.reason,
    provider: host.provider,
    providers: host.providers,
    selection: host.selection,
  }
}

/** Only the server fields a panel may see. */
function publicServer(server) {
  if (server === undefined) return { available: false }
  if (server.mode !== 'server') {
    return { available: false, reason: server.reason, source: server.source }
  }
  return {
    available: true,
    protocol: server.protocol,
    endpoint: server.endpoint,
    model: server.model,
    source: server.source,
    hasCredential: true,
    reason: server.reason,
  }
}

/** What the user can do about the current state. */
export function hintFor(resolved, host, server) {
  if (resolved.mode === ASR_MODE.HOST) {
    if (host.needsPreparation) return '宿主语音模型还没下载完：点面板上的「准备语音模型」，完成后自动可用。'
    return ''
  }
  if (resolved.mode === ASR_MODE.SERVER) return ''
  if (resolved.mode === ASR_MODE.NONE) return '服务端识别被配置关闭了；需要的话把 asrProvider 改回 auto。'
  const hints = []
  if (host.available === false) hints.push('宿主没有启用语音识别服务（voice-input bundle）')
  if (server.available !== true) hints.push('插件也没有可用的服务端识别凭据')
  hints.push('现在是浏览器识别 + 键盘输入，面试不受影响')
  return `${hints.join('；')}。`
}

/**
 * Whether the host exposes the speech service at all (used by status strings).
 *
 * @param {import('../service.js').InterviewService} service
 */
export function hasHostSpeech(service) {
  const speech = hostService(service?.ctx, 'speechToText')
  return speech !== undefined && speech !== null
}
