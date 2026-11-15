/**
 * The browser-facing HTTP surface.
 *
 * One prefix:
 *
 *   GET  /interviewer/api/<resource>[?…]   JSON — the read model
 *   POST /interviewer/api/<action>          JSON — the write model
 *
 * The route is a transport, not a second implementation: every handler calls
 * the same `InterviewService` method the agent tool calls.
 *
 * **Trust fence.** The request must come from a loopback authority, must not
 * be cross-site, and — when it carries an `Origin` — must come from the same
 * authority it claims. This mirrors the Host's own API gateway semantics, so
 * the plugin does not open a wider door than the host already has. A resume
 * and a JD are personal data; the door stays narrow.
 */
import { API_PREFIX } from './paths.js'
import { resolveAsrConfig, transcribe } from './asr.js'

/** Largest JSON body the plugin accepts (resume + JD + a few fields). */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/** Read one request header. */
function header(headers, name) {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** Parse an authority into a URL-ish object, or `undefined`. */
function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

/** Whether a hostname is a loopback name or address. */
function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Whether a request may use the plugin's routes.
 *
 * @param {import('node:http').IncomingMessage} req
 */
export function isTrustedRequest(req) {
  const host = header(req.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (header(req.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(req.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** Send one JSON response. */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/**
 * Read a JSON request body.
 *
 * @param {import('node:http').IncomingMessage} req
 */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('请求体太大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim() === '') return {}
  return JSON.parse(raw)
}

/**
 * Read the resource path after the API prefix.
 *
 * @param {string} resourcePath
 * @returns {string[]}
 */
function resourceSegments(resourcePath) {
  return resourcePath.split('/').filter(segment => segment !== '')
}

/**
 * Mount the API.
 *
 * @param {object} ctx the plugin context
 * @param {import('./service.js').InterviewService} service
 */
export function registerApi(ctx, service) {
  return ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      if (!isTrustedRequest(req)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('forbidden')
        return
      }
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const prefix = `${API_PREFIX}/api/`
      if (!url.pathname.startsWith(prefix)) {
        sendJson(res, 404, { ok: false, error: '未知接口' })
        return
      }
      const segments = resourceSegments(url.pathname.slice(prefix.length))
      const query = Object.fromEntries(url.searchParams.entries())
      try {
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, data: await readResource(service, segments, query) })
          return
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req)
          sendJson(res, 200, { ok: true, data: await runAction(service, segments, body) })
          return
        }
        sendJson(res, 405, { ok: false, error: `不支持的方法：${req.method}` })
      } catch (error) {
        const message = error && error.message ? error.message : String(error)
        sendJson(res, 400, { ok: false, error: message })
      }
    },
  }), 'dsh-interviewer: API routes')
}

/**
 * The read model.
 *
 * @param {import('./service.js').InterviewService} service
 * @param {string[]} segments
 * @param {object} query
 */
async function readResource(service, segments, query) {
  const [head, ...rest] = segments

  if (head === 'config') {
    return {
      asrProvider: service.config.asrProvider,
      ttsProvider: service.config.ttsProvider,
      ttsRate: service.config.ttsRate,
      ttsVoice: service.config.ttsVoice,
      recordVideo: service.config.recordVideo,
      recordAudio: service.config.recordAudio,
      // 工作区根：界面要能回答「数据存到哪儿了、为什么是这个目录」。
      workspaceRoot: await service.location(),
      jdFetchTimeoutMs: service.config.jdFetchTimeoutMs,
    }
  }
  if (head === 'sessions') {
    if (rest.length === 0) return { sessions: await service.listSessions() }
    const limit = Number(query.transcriptLimit)
    const state = await service.getState(rest[0], {
      transcriptLimit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    })
    return state
  }
  if (head === 'profiles') {
    if (rest.length === 0) return { profiles: await service.listProfiles() }
    return { profile: await service.getProfile(rest[0]) }
  }
  if (head === 'asr') {
    return resolveAsrConfig(service)
  }
  if (head === 'transcript') {
    return { transcript: await service.getTranscript(query.session ?? '') }
  }
  throw new Error(`未知的读取资源：${segments.join('/')}`)
}

/**
 * The write model.
 *
 * @param {import('./service.js').InterviewService} service
 * @param {string[]} segments
 * @param {object} body
 */
async function runAction(service, segments, body) {
  const [head, ...rest] = segments

  switch (head) {
    case 'sessions': {
      if (rest.length === 0) {
        return { session: await service.createSession(body) }
      }
      const sessionId = rest[0]
      const action = rest[1]
      switch (action) {
        case undefined:
          return { session: await service.updateSession(sessionId, body) }
        case 'resume':
          return await service.setResume(sessionId, body.text)
        case 'jd':
          return await service.setJd(sessionId, body)
        case 'checklist':
          return await service.saveChecklist(sessionId, body.items)
        case 'checklist-mutate':
          return await service.mutateChecklist(sessionId, body)
        case 'turn':
          return { turn: await service.appendTurn(sessionId, body) }
        case 'recording':
          return await service.saveRecording(sessionId, body)
        case 'report':
          return await service.saveReport(sessionId, body.markdown)
        case 'start':
          return { session: await service.updateSession(sessionId, { status: 'running', startedAt: Date.now() }) }
        case 'finish':
          return { session: await service.updateSession(sessionId, { status: 'done', endedAt: Date.now() }) }
        default:
          throw new Error(`未知的会话操作：${action}`)
      }
    }
    case 'jd':
      if (rest[0] === 'fetch') {
        return await service.fetchJd(String(body.url ?? ''))
      }
      throw new Error(`未知的 JD 操作：${rest.join('/')}`)
    case 'resume':
      if (rest[0] === 'extract') {
        return service.extractResume({
          filename: body.filename,
          mimeType: body.mimeType,
          buffer: Buffer.from(String(body.dataBase64 ?? ''), 'base64'),
        })
      }
      throw new Error(`未知的简历操作：${rest.join('/')}`)
    case 'asr': {
      if (rest[0] === 'status') {
        return resolveAsrConfig(service)
      }
      if (rest[0] === 'transcribe') {
        return transcribe(service, body)
      }
      throw new Error(`未知的识别操作：${rest.join('/')}`)
    }
    case 'profiles': {
      if (rest.length === 0) {
        return { profile: await service.saveProfile(body) }
      }
      const profileId = rest[0]
      const action = rest[1]
      if (action === undefined) {
        return { profile: await service.saveProfile({ ...body, id: profileId }) }
      }
      if (action === 'apply') {
        return await service.applyProfile(body.sessionId ?? '', profileId)
      }
      if (action === 'sync') {
        return await service.syncProfile(body.sessionId ?? '', body.profileId)
      }
      if (action === 'delete') {
        return await service.deleteProfile(profileId)
      }
      throw new Error(`未知的档案操作：${action}`)
    }
    default:
      throw new Error(`未知的操作：${segments.join('/')}`)
  }
}
