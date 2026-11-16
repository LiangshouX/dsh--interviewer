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
import { FRAME_BOUNDARY } from './camera.js'

/** Largest JSON body the plugin accepts (resume + JD + a few fields). */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/** The route the camera preview is streamed on. */
const CAMERA_STREAM_PATH = '/interviewer/camera/stream'

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

      // 相机预览流：**不是 JSON**，所以在 JSON 解析之前拦下来。
      //
      // 它是 multipart/x-mixed-replace 的长连接，浏览器 `<img src>` 直接吃。
      // 响应**不能带 content-length**——DSH 桌面端转发请求到宿主时会剥掉
      // content-length/transfer-encoding，带了长度反而会让浏览器等一个
      // 永远不会到来的结尾。逐帧 write 就是 chunked。
      if (url.pathname === CAMERA_STREAM_PATH) {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('method not allowed')
          return
        }
        service.camera.attach(res)
        return
      }

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
  }), 'dsh-realtime-interview: API routes')
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
    // **归档正文单独取。** 简历/动辄几十 KB，跟着 1.5 秒一次的轮询传
    // 是纯浪费——而且它在「准备」页才有用，面试页根本不需要。
    if (rest[1] === 'documents') {
      const documents = await service.getDocuments(rest[0])
      return {
        resume: documents.resume,
        jd: documents.jd,
        jdMeta: documents.jdMeta,
      }
    }
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
  if (head === 'resumes') {
    if (rest.length === 0) return { resumes: await service.listResumes() }
    return { resume: await service.getResume(rest[0]) }
  }
  if (head === 'host-sessions') {
    return { sessions: await service.listHostSessions() }
  }
  if (head === 'voice') {
    // 整条语音链路：识别走哪条、合成走哪条、为什么。
    // 面板一次拿全，避免「识别状态」和「合成状态」分两次问、各自过期。
    return service.voiceStatus()
  }
  if (head === 'asr') {
    // 兼容旧端点：只回识别那半边。
    return (await service.voiceStatus()).asr
  }
  if (head === 'tts') {
    return (await service.voiceStatus()).tts
  }
  if (head === 'transcript') {
    return { transcript: await service.getTranscript(query.session ?? '') }
  }
  if (head === 'camera') {
    if (rest.length === 0) return service.cameraStatus()
    if (rest[0] === 'devices') return service.cameraDevices()
    if (rest[0] === 'diagnose') return service.cameraDiagnose({ device: query.device })
    throw new Error(`未知的相机读取操作：${rest.join('/')}`)
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
    case 'config': {
      // 工作区根：面板上「浏览…」走的两步。
      //
      //   POST /config/workspace-root/pick  弹宿主原生目录选择器
      //   POST /config/workspace-root       切到某个目录（可选带旧根来搬数据）
      if (rest[0] === 'workspace-root') {
        if (rest[1] === 'pick') {
          return { picker: await service.pickWorkspaceRoot() }
        }
        if (rest[1] === undefined) {
          return await service.setWorkspaceRoot(body.path, body.migrateFrom)
        }
      }
      throw new Error(`未知的配置操作：${rest.join('/')}`)
    }
    case 'camera': {
      // 相机的四个动作：开机、关机、开始录、停录。
      //
      // **为什么录像在这里落盘，而不是像浏览器录像那样上传。**
      // 画面是 Host 采的，Host 写文件是最短的路——没有 base64、没有
      // 几十兆的 JSON 传输，录完直接就在这场面试的卷宗目录里。
      const action = rest[0]
      if (action === 'start') {
        const started = await service.startCamera({ device: body.device })
        if (!started.ok) throw new Error(started.error ?? '摄像头起不来')
        return started
      }
      if (action === 'stop') {
        return service.stopCamera()
      }
      if (action === 'record') {
        const sessionId = String(body.sessionId ?? '')
        if (sessionId === '') throw new Error('录像要先指定是哪一场面试。')
        if (rest[1] === 'start') {
          const started = await service.startCameraRecording(sessionId)
          if (!started.ok) throw new Error(started.error ?? '录像开不了')
          return started
        }
        if (rest[1] === 'stop') {
          return await service.stopCameraRecording(sessionId)
        }
      }
      throw new Error(`未知的相机操作：${rest.join('/')}`)
    }
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
        case 'archive':
          return { session: await service.setArchived(sessionId, body.archived === true) }
        default:
          throw new Error(`未知的会话操作：${action}`)
      }
    }
    case 'jd':
      if (rest[0] === 'fetch') {
        return await service.fetchJd(String(body.url ?? ''))
      }
      if (rest[0] === 'request-agent') {
        return await service.requestAgentJd(
          String(body.sessionId ?? ''),
          String(body.url ?? ''),
          body.hostSessionId,
        )
      }
      if (rest[0] === 'save') {
        return await service.setJd(String(body.sessionId ?? ''), body)
      }
      throw new Error(`未知的 JD 操作：${rest.join('/')}`)
    case 'resumes': {
      if (rest.length === 0) {
        if (body.id === undefined && body.text === undefined && body.sessionId !== undefined) {
          // 把这场面试里的简历存进库
          return { resume: await service.saveResumeFromSession(String(body.sessionId), body.title) }
        }
        return { resume: await service.saveResume(body) }
      }
      const resumeId = rest[0]
      const action = rest[1]
      if (action === undefined) {
        // 把库里的简历用到某场面试上（存快照）
        return await service.applyResume(String(body.sessionId ?? ''), resumeId)
      }
      if (action === 'delete') {
        return await service.deleteResume(resumeId)
      }
      throw new Error(`未知的简历库操作：${action}`)
    }
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
        return (await service.voiceStatus()).asr
      }
      if (rest[0] === 'transcribe') {
        return service.transcribeAudio(body)
      }
      throw new Error(`未知的识别操作：${rest.join('/')}`)
    }
    case 'voice': {
      // voice/prepare：让宿主开始准备它的语音模型（首次要下载）。
      if (rest[0] === 'prepare') {
        return service.prepareSpeech(body.providerId)
      }
      throw new Error(`未知的语音操作：${rest.join('/')}`)
    }
    case 'tts': {
      // tts/speak：面板拿 base64 音频自己播；宿主不做播放。
      if (rest[0] === 'speak') {
        return service.synthesizeSpeech({
          text: body.text,
          voice: body.voice,
          rate: body.rate,
        })
      }
      throw new Error(`未知的播报操作：${rest.join('/')}`)
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
