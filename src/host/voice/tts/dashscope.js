/**
 * DashScope / 千问 AI 平台 非实时语音合成适配器（tts_v2 WebSocket 协议）。
 *
 * **它和 OpenAI 兼容的 `/audio/speech` 不是一回事。** qwen-audio-3.0-tts-flash、
 * cosyvoice-v3-* 这些模型走的是 DashScope `tts_v2.SpeechSynthesizer` 的
 * **WebSocket 推理协议**（`wss://…/api-ws/v1/inference`），事件驱动：
 *
 *   连接 → run-task（配模型/音色/格式）→ 等 task-started
 *        → continue-task（送文本）→ finish-task（送完了）
 *        → 收二进制音频帧 + result-generated → task-finished（结束）
 *
 * 一次 `call(text)` 等价于「run-task → continue-task(整段) → finish-task → 收齐音频」。
 * 这里只做**一次性合成**（面试官念一个问题），不做双工实时对话——那是另一个
 * 产品类目（语音转语音 realtime），本插件不支持，见 README「已知边界」。
 *
 * **三条自律（与 edge.js 一致）：** 失败说原因（带厂商错误码原文）；只返回音频
 * 不落盘；密钥不进响应（编排层 `tts.js` 出口统一擦）。
 *
 * 协议参考：阿里云百炼 CosyVoice 客户端事件 / WebSocket 接入指南。
 */
import { randomUUID } from 'node:crypto'
import { defaultVoiceForModel } from '../voices.js'

/** 千问 Token Plan 中转的推理端点（QIANWEN_TOKEN_PLAN_API_KEY 在这台主机上有效）。 */
const DEFAULT_URL = 'wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference'

/** 一次合成最多等多久。 */
const TIMEOUT_MS = 60000

/** 默认采样率（官方默认 22050）。 */
const SAMPLE_RATE = 22050

/**
 * Synthesize one line of speech through the tts_v2 WebSocket protocol.
 *
 * @param {object} options
 * @param {string} options.baseUrl  wss://…/api-ws/v1/inference
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {string} options.voice    留空则按模型取默认音色
 * @param {string} options.format   mp3 | wav
 * @param {number} options.rate     0.5 ~ 2
 * @param {string} options.text
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ok: boolean, audioBase64?: string, mimeType?: string, reason?: string, hint?: string}>}
 */
export async function synthesizeWithDashScope(options) {
  const text = String(options.text ?? '').trim()
  if (text === '') return { ok: false, reason: '没有要合成的文本。' }

  const WebSocketCtor = globalThis.WebSocket
  if (typeof WebSocketCtor !== 'function') {
    return { ok: false, reason: '这个宿主没有 WebSocket，DashScope 语音这条链路不可用。', hint: '升级 DSH 宿主（Node ≥ 22）；或改用百度朗读（免密钥）。' }
  }

  const url = typeof options.baseUrl === 'string' && options.baseUrl.trim() !== '' ? options.baseUrl.trim() : DEFAULT_URL
  if (!/^wss?:\/\//i.test(url)) {
    return { ok: false, reason: `DashScope 语音要 WebSocket 端点（wss://…/api-ws/v1/inference），当前是：${url}`, hint: '这不是 HTTP /audio/speech 端点。把端点改成 wss://cn-beijing.maas.qianwenaiapi.com/api-ws/v1/inference（官方 DashScope 用 wss://dashscope.aliyuncs.com/api-ws/v1/inference）。' }
  }

  const model = String(options.model ?? '').trim()
  // 音色留空 → 按模型取默认（保证换模型后默认音色仍合法，不撞 411）。
  const voice = String(options.voice ?? '').trim() !== '' ? options.voice.trim() : defaultVoiceForModel(model)
  if (voice === '') {
    return { ok: false, reason: `模型 ${model || '(未填)'} 没有可用音色。`, hint: '在音色下拉里选一个该模型支持的音色；未知模型可手填官方音色 id。' }
  }
  const format = options.format === 'wav' ? 'wav' : 'mp3'
  const rate = typeof options.rate === 'number' && Number.isFinite(options.rate) ? Math.min(2, Math.max(0.5, options.rate)) : 1
  const taskId = randomUUID()
  const header = action => ({ action, task_id: taskId, streaming: 'duplex' })

  const runTask = JSON.stringify({
    header: header('run-task'),
    payload: {
      task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer',
      model, input: {},
      parameters: { text_type: 'PlainText', voice, format, sample_rate: SAMPLE_RATE, rate, volume: 50 },
    },
  })
  const continueTask = JSON.stringify({ header: header('continue-task'), payload: { input: { text } } })
  const finishTask = JSON.stringify({ header: header('finish-task'), payload: { input: {} } })

  const chunks = []
  return await new Promise(resolve => {
    let settled = false
    let socket
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket?.close() } catch { /* 已经关了 */ }
      resolve(value)
    }
    const timer = setTimeout(() => finish({ ok: false, reason: `DashScope 语音合成超时（${TIMEOUT_MS}ms）。`, hint: '网络慢或端点不可达：检查网络/代理与 wss 端点；也可改用百度朗读（免密钥）。' }), TIMEOUT_MS)

    try {
      // undici 的 WebSocket 接受 { headers } 在握手阶段带鉴权。
      socket = new WebSocketCtor(url, { headers: { Authorization: `Bearer ${options.apiKey}`, 'user-agent': 'dsh-realtime-interview' } })
    } catch (error) {
      finish({ ok: false, reason: `连不上 DashScope 语音服务：${messageOf(error)}`, hint: '确认端点是 wss://…/api-ws/v1/inference，凭据属于这个平台。' })
      return
    }
    socket.binaryType = 'arraybuffer'

    if (options.signal !== undefined) {
      if (options.signal.aborted) { finish({ ok: false, reason: '语音合成已取消。' }); return }
      options.signal.addEventListener('abort', () => finish({ ok: false, reason: '语音合成已取消。' }), { once: true })
    }

    socket.addEventListener('open', () => {
      try { socket.send(runTask) } catch (error) { finish({ ok: false, reason: `发送 run-task 失败：${messageOf(error)}` }) }
    })

    socket.addEventListener('message', event => {
      const data = event.data
      // 二进制帧 = 音频字节，直接攒起来。
      if (typeof data !== 'string') {
        try { chunks.push(Buffer.from(data)) } catch { /* 坏帧丢掉，不放弃整段 */ }
        return
      }
      let msg
      try { msg = JSON.parse(data) } catch { return }
      const event_ = msg?.header?.event
      if (event_ === 'task-started') {
        // 任务确认后才能送文本；一次性合成：整段送完立刻 finish。
        try { socket.send(continueTask); socket.send(finishTask) } catch (error) { finish({ ok: false, reason: `发送文本失败：${messageOf(error)}` }) }
        return
      }
      if (event_ === 'task-finished') {
        const buffer = Buffer.concat(chunks)
        if (buffer.length === 0) { finish({ ok: false, reason: 'DashScope 任务结束了，但没给音频。', hint: '换一个音色或模型再试；也可改用百度朗读（免密钥）。' }); return }
        finish({ ok: true, audioBase64: buffer.toString('base64'), mimeType: format === 'wav' ? 'audio/wav' : 'audio/mpeg' })
        return
      }
      if (event_ === 'task-failed') {
        const code = msg?.header?.error_code ?? msg?.payload?.error_code ?? msg?.payload?.code ?? ''
        const detail = msg?.header?.error_message ?? msg?.payload?.error_message ?? msg?.payload?.message ?? '任务失败'
        finish({ ok: false, reason: `DashScope 合成失败${code !== '' ? `（${code}）` : ''}：${detail}`, hint: hintForError(code, detail) })
        return
      }
      // result-generated / sentence-begin / sentence-end 等元数据：忽略。
    })

    let probing = false
    const failHandshake = baseReason => {
      if (settled || probing) return
      probing = true
      // 握手失败时 undici 只给「non-101」这类笼统消息；探一次 HTTPS 把厂商真实错误码
      // （InvalidApiKey / InvalidParameter 等）带回来，失败原因才具体（§7 失败必须给出路）。
      probeHandshakeError(url, options.apiKey).then(detail => {
        finish({
          ok: false,
          reason: detail !== '' ? `${baseReason}：${detail}` : baseReason,
          hint: '核对三件事：① 凭据属于这台主机（Token Plan key 只在 token-plan.maas.qianwenaiapi.com 有效，官方 DashScope 用 DASHSCOPE_API_KEY + dashscope.aliyuncs.com）；② 端点是 wss://…/api-ws/v1/inference；③ 模型在这个平台存在（Token Plan 中转是 tts-plus，没有 flash）。',
        })
      })
    }
    socket.addEventListener('error', () => failHandshake('DashScope 语音服务拒绝连接（握手失败）'))
    socket.addEventListener('close', event => {
      if (settled || event.code === 1000) return
      failHandshake(`DashScope 语音服务断开（code=${event.code}${event.reason ? `：${event.reason}` : ''}）`)
    })
  })
}

/** 握手失败时 best-effort 探出厂商真实错误码（wss→https GET）。密钥由编排层出口统一擦。 */
async function probeHandshakeError(url, apiKey) {
  try {
    const httpUrl = url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
    const response = await fetch(httpUrl, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) })
    const text = (await response.text()).slice(0, 300)
    let code = ''
    let message = ''
    try {
      const body = JSON.parse(text)
      code = body?.code ?? body?.error?.code ?? body?.error?.type ?? ''
      message = body?.message ?? body?.error?.message ?? ''
    } catch {
      message = text
    }
    const detail = [code, message].filter(part => typeof part === 'string' && part !== '').join('：')
    return detail !== '' ? detail : `HTTP ${response.status}`
  } catch {
    return ''
  }
}

/** 把厂商错误码翻译成人能做的下一步。 */
function hintForError(code, detail) {
  const text = `${code} ${detail}`
  if (/411|InvalidParameter|voice|音色/i.test(text)) {
    return '音色不在这个模型的支持列表里（每个模型只支持一组特定音色）。从音色下拉里选一个当前模型的音色，别跨模型混用。'
  }
  if (/401|403|Unauthorized|Forbidden|AccessDenied|api.?key/i.test(text)) {
    return '凭据被拒：确认 key 属于这个平台与地域，且已配置到对应的凭据名。'
  }
  if (/429|Throttling|rate.?limit|Requests rate limit/i.test(text)) {
    return '额度或频率被限：稍后再试，或改用百度朗读（免密钥）继续面试。'
  }
  if (/model|Model|不存在|not.?exist/i.test(text)) {
    return '模型 id 不对或这个地域不支持：核对模型名（如 qwen-audio-3.0-tts-flash）与端点地域。'
  }
  return '核对模型、音色与凭据；也可改用百度朗读（免密钥）继续面试。'
}

/** Read an error message. */
function messageOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
