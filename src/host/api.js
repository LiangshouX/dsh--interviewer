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
import { AVATAR_ASSET_PATH } from './avatar.js'

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

      // 预置面试官形象：**只读、非 JSON**，同样在 JSON 前缀判断之前拦下。
      //
      // 路径形如 /interviewer/avatar/asset/vendor/mesh-avatar.js 与
      // /interviewer/avatar/asset/avatar/interviewer/rig.json，相对于包内
      // assets/ 目录（见 avatar.js）。白名单与目录穿越校验都在 avatar.js 里。
      //
      // 信任围栏已经在上面统一检查过（loopback host + 非同站 + 同源 Origin），
      // 这条分支在同一个 handler 里 → 不需要第二套校验。
      if (url.pathname.startsWith(AVATAR_ASSET_PATH)) {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('method not allowed')
          return
        }
        await service.avatar.serveAsset(res, url.pathname.slice(AVATAR_ASSET_PATH.length), req)
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
    // **有效值，不是配置文件里的值。** 面板里改过就用面板的，
    // 否则"设置页能改、界面照旧"这种割裂会一直存在。
    const effective = await service.effectiveConfig()
    return {
      asrProvider: effective.asrProvider,
      ttsProvider: effective.ttsProvider,
      ttsRate: effective.ttsRate,
      ttsVoice: effective.ttsVoice,
      recordVideo: effective.recordVideo,
      recordAudio: effective.recordAudio,
      guardEnabled: effective.guardEnabled,
      cameraBackend: effective.cameraBackend,
      // 话轮（docs/TURN-TAKING.md §4）：自动/手动开关与静音阈值。
      // 面板 Live 页的快捷切换读写同一份 settings。
      answerMode: effective.answerMode ?? 'manual',
      turnEndSilenceMs: effective.turnEndSilenceMs ?? 2000,
      // 虚拟面试官：'on' | 'off'。面板据此决定舞台上挂不挂形象。
      interviewerAvatar: effective.interviewerAvatar ?? 'on',
      // 工作区根：界面要能回答「数据存到哪儿了、为什么是这个目录」。
      workspaceRoot: await service.location(),
      jdFetchTimeoutMs: effective.jdFetchTimeoutMs,
    }
  }
  if (head === 'sessions') {
    if (rest.length === 0) return { sessions: await service.listSessions() }
    // 空场次清单（误触新建的清理候选）
    if (rest[0] === 'empty') return { candidates: await service.listEmptySessions() }
    // 「记录清理」弹层：每场的记录体量（转录轮数 / 录音 / 占用）。
    // **只在打开弹层时取**——它要读每场的文件，不能进 6 秒轮询。
    if (rest[0] === 'records') return { sessions: await service.listSessionsForCleanup() }
    // 「留副本再重置」留下的归档（只读元信息）。
    if (rest[0] === 'archives') return { archives: await service.listArchives() }
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
  if (head === 'settings') {
    // 面板「设置」页：所有「东西在哪、现在用哪个」一次问全。
    return service.settingsSnapshot(query.session)
  }
  if (head === 'voice') {
    // 整条语音链路：识别走哪条、合成走哪条、为什么。
    // 面板一次拿全，避免「识别状态」和「合成状态」分两次问、各自过期。
    //
    // `voice/credentials` 与 `voice/presets` 是设置页的两个只读入口：
    // 前者只回名字与"配没配"，后者是服务下拉的唯一来源。**都没有密钥值。**
    if (rest[0] === 'credentials') return { credentials: await service.voiceCredentials() }
    if (rest[0] === 'presets') return { presets: service.voicePresets() }
    if (rest[0] === 'voices') return service.voicesForModel(query.model, query.provider)
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
    case 'settings': {
      // 保存面板设置（白名单键）。配置文件里写死的项会被拒绝，并说明原因。
      return await service.updateSettings(body)
    }
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
      // 维护动作放在 id 之前，避免和会话 id 混淆。
      if (rest[0] === 'cleanup') {
        return await service.purgeEmptySessions(body.ids)
      }
      // 「记录清理」：勾选哪几场就删哪几场。逐场返回结果（进行中的会被拒）。
      if (rest[0] === 'delete-batch') {
        return await service.deleteSessions(body.ids)
      }      const sessionId = rest[0]
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
          // appendTurn 内部联动「候选人答完 → 唤醒助手」的派活（异步，
          // 不阻塞这条响应）——见 service.appendTurn 与 TURN-TAKING §5.1。
          return { turn: await service.appendTurn(sessionId, body) }
        case 'recording':
          // 一次性上传（「录一段」/保存片段）与**连续录制**共用这个前缀：
          //   recording            → 整块 base64 落一个文件（老路）
          //   recording/start      → 建空文件，拿回文件名
          //   recording/chunk      → 追加一块（面试全程每 5 秒一次）
          //   recording/finish     → 收尾，回大小
          if (rest[2] === 'start') return await service.beginRecording(sessionId, body)
          if (rest[2] === 'chunk') return await service.appendRecording(sessionId, body)
          if (rest[2] === 'finish') return await service.finishRecording(sessionId, body)
          return await service.saveRecording(sessionId, body)
        case 'report':
          return await service.saveReport(sessionId, body.markdown)
        case 'start':
          // startSession：置 running + **异步派活开场**（TURN-TAKING §5.1）。
          // 联动放在 service 里而不是这条路由里——「一个操作，两个调用者」，
          // 工具 interview_request_agent(task=start) 走的是同一个方法。
          return { session: await service.startSession(sessionId) }
        case 'finish':
          return { session: await service.finishSession(sessionId) }
        // 重置：清掉面试过程的记录（转录 / 报告 / 计时 / 「问过」标记），
        // 留下材料与底稿。两种模式：
        //   { mode: 'purge' }   直接删
        //   { mode: 'archive' } 先把转录 / 报告 / 录音录像搬到
        //                       <工作区>/archive/<会话>/<时间>/，再重置
        case 'reset':
          return await service.resetSession(sessionId, { mode: body.mode })
        // 续接：已结束的面试接着面（不重开一轮，中断时间记进 pausedMs）。
        case 'continue':
          return { session: await service.continueSession(sessionId) }
        // 暂停 / 继续（TURN-TAKING §6）。
        //
        // **路由名是 `unpause` 而不是 `resume`**：`sessions/<id>/resume`
        // 已经是「存简历正文」的老路由（resume = 简历），语义撞车。
        // service 方法仍叫 resumeSession（与文档一致），只有 HTTP 名字避让。
        case 'pause':
          return { session: await service.pauseSession(sessionId) }
        case 'unpause':
          return { session: await service.resumeSession(sessionId) }
        case 'silence':
          // 长沉默（TURN-TAKING §3.3）：客户端在 auto 模式下报告事实，
          // 派活同步做——这是显式事件，调用方要立刻知道成败。
          return await service.requestAgentSilence(sessionId, Number(body.seconds ?? 0))
        case 'agent-retry':
          // 派活失败的重发按钮（TURN-TAKING §4.4）：用原 requestId 幂等重发。
          return await service.retryAgentDispatch(sessionId)
        case 'archive':
          return { session: await service.setArchived(sessionId, body.archived === true) }
        case 'delete':
          return await service.deleteSession(sessionId, body)
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
    case 'agent': {
      // 派活给助手：底稿（考点清单）。JD 抓取的派活仍走 jd/request-agent。
      if (rest[0] === 'checklist') {
        return await service.requestAgentChecklist(
          String(body.sessionId ?? ''),
          body.hostSessionId,
        )
      }
      if (rest[0] === 'report') {
        return await service.requestAgentReport(
          String(body.sessionId ?? ''),
          body.hostSessionId,
        )
      }
      // 等助手返回的任务：用户点「忽略」时把这条 loading/失败记录清掉。
      if (rest[0] === 'task') {
        const action = String(body.action ?? '').trim().toLowerCase()
        if (action === 'dismiss') {
          return await service.dismissAgentTask(String(body.sessionId ?? ''), String(body.kind ?? ''))
        }
        throw new Error('助手任务操作只能是 dismiss。')
      }
      // 面试主循环的手动兜底/诊断入口（TURN-TAKING §7）：正常流程由
      // start/turn/unpause 自动联动，这里是「重发一次」的显式按钮路径。
      if (rest[0] === 'start') {
        return await service.requestAgentStart(String(body.sessionId ?? ''))
      }
      if (rest[0] === 'continue') {
        return await service.requestAgentContinue(String(body.sessionId ?? ''))
      }
      if (rest[0] === 'resume') {
        return await service.requestAgentResume(String(body.sessionId ?? ''), {
          pausedMinutes: Number(body.pausedMinutes ?? 0),
        })
      }
      if (rest[0] === 'session') {
        // 只读：这一场两个角色各用哪个助手会话（不创建、无副作用）。
        const sessionId = typeof body.sessionId === 'string' && body.sessionId !== ''
          ? body.sessionId
          : ''
        if (sessionId === '') throw new Error('要指定是哪一场面试。')
        return await service.agentSessionsSnapshot(sessionId)
      }
      throw new Error(`未知的助手操作：${rest.join('/')}`)
    }
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
          // JD 上传只收纯文本：界面挡一道扩展名，这里挡一道文件头。
          plainOnly: body.plainOnly === true,
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
      // voice/credentials：往宿主凭据存储里写 / 删一把 key。
      // **请求体里的 value 只进不出**——成功后响应只有 ref 与状态。
      if (rest[0] === 'credentials') {
        const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : ''
        if (action === 'set') return await service.setVoiceCredential(String(body.ref ?? ''), body.value)
        if (action === 'clear') return await service.clearVoiceCredential(String(body.ref ?? ''))
        throw new Error('凭据操作只能是 set 或 clear。')
      }
      // voice/test：真跑一遍链路（播报合成 / 识别回落），失败带具体原因与出路。
      if (rest[0] === 'test') {
        return await service.testVoice({
          kind: body.kind,
          dataBase64: body.dataBase64,
          mimeType: body.mimeType,
          language: body.language,
        })
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
