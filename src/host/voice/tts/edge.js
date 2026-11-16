/**
 * Edge 神经音色适配器（免密钥，走微软的朗读 WebSocket）。
 *
 * **它是"能通就很好，不通也不能拖累面试"的那一环。** 优点是不用任何凭据
 * 就能拿到 `zh-CN-XiaoxiaoNeural` 这类神经网络音色；缺点是它是非公开端点，
 * 微软会加 WAF / 换 DRM 令牌，某些网络（含部分中国大陆出口）直接 403。
 *
 * 所以这个模块有三条自律：
 *
 *  1. **失败要说原因**，不吞掉状态码；
 *  2. **失败要记一段时间**（`failureMemo`），否则 `auto` 链路会每句话都
 *     先撞一次 403 再回落，白白多等两秒；
 *  3. **只返回音频，不落盘**——大对象不进内存常驻是纪律。
 */
import { createHash, randomUUID } from 'node:crypto'

/** 微软朗读接口的固定客户端令牌（公开常量）。 */
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'

/** DRM 令牌里要带一个 Chromium 版本号。 */
const CHROMIUM_VERSION = '130.0.2849.68'

/** 一次合成最多等多久。 */
const TIMEOUT_MS = 25000

/** 失败记忆保留多久：这段时间内 `auto` 不再尝试它。 */
const FAILURE_TTL_MS = 10 * 60 * 1000

/** 失败原因（按端点缓存，避免每句话都重撞）。 */
const failureMemo = new Map()

/** 输出格式：mp3 最省事，浏览器 `<audio>` 直接能吃。 */
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

/**
 * Whether a recent attempt failed on this endpoint.
 *
 * @param {string} baseUrl
 * @returns {string}
 */
export function edgeFailure(baseUrl = '') {
  const entry = failureMemo.get(`edge::${baseUrl}`)
  if (entry === undefined) return ''
  if (Date.now() - entry.at > FAILURE_TTL_MS) {
    failureMemo.delete(`edge::${baseUrl}`)
    return ''
  }
  return entry.reason
}

/**
 * Synthesize through Edge's read-aloud WebSocket.
 *
 * @param {{baseUrl?: string, voice: string, rate?: number, text: string, signal?: AbortSignal}} options
 * @returns {Promise<{ok: boolean, audioBase64?: string, mimeType?: string, reason?: string}>}
 */
export async function synthesizeWithEdge(options) {
  const voice = options.voice === '' ? 'zh-CN-XiaoxiaoNeural' : options.voice
  const text = String(options.text ?? '').trim()
  if (text === '') return { ok: false, reason: '没有要合成的文本。' }

  const WebSocketCtor = globalThis.WebSocket
  if (typeof WebSocketCtor !== 'function') {
    return { ok: false, reason: '这个宿主没有 WebSocket，Edge 音色这条链路不可用。' }
  }

  const url = endpointUrl(options.baseUrl)
  const chunks = []
  const result = await new Promise(resolve => {
    let settled = false
    let socket
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { socket?.close() } catch { /* 已经关了 */ }
      resolve(value)
    }
    const timer = setTimeout(() => finish({ ok: false, reason: `Edge 语音服务超时（${TIMEOUT_MS}ms）` }), TIMEOUT_MS)

    try {
      socket = new WebSocketCtor(url)
    } catch (error) {
      finish({ ok: false, reason: `连不上 Edge 语音服务：${messageOf(error)}` })
      return
    }
    socket.binaryType = 'arraybuffer'

    socket.addEventListener('open', () => {
      try {
        socket.send(
          `X-Timestamp:${new Date().toString()}\r\n`
          + 'Content-Type:application/json; charset=utf-8\r\n'
          + 'Path:speech.config\r\n\r\n'
          + JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: OUTPUT_FORMAT } } } }),
        )
        const ssml = `X-RequestId:${randomUUID()}\r\n`
          + 'Content-Type:application/ssml+xml\r\n'
          + `X-Timestamp:${new Date().toString()}Z\r\n`
          + 'Path:ssml\r\n\r\n'
          + `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>`
          + `<voice name='${escapeXml(voice)}'>`
          + `<prosody pitch='+0Hz' rate='${ratePercent(options.rate)}' volume='+0%'>${escapeXml(text)}</prosody>`
          + '</voice></speak>'
        socket.send(ssml)
      } catch (error) {
        finish({ ok: false, reason: `发送合成请求失败：${messageOf(error)}` })
      }
    })

    socket.addEventListener('message', event => {
      const data = event.data
      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) {
          finish(chunks.length === 0
            ? { ok: false, reason: 'Edge 语音服务结束了，但没给音频。' }
            : { ok: true, audioBase64: Buffer.concat(chunks).toString('base64'), mimeType: 'audio/mpeg' })
        }
        return
      }
      // 二进制帧：2 字节大端头长度 + 头文本 + 音频。
      try {
        const buffer = Buffer.from(data)
        const headerLength = buffer.readUInt16BE(0)
        const header = buffer.subarray(2, 2 + headerLength).toString('utf8')
        if (header.includes('Path:audio')) chunks.push(buffer.subarray(2 + headerLength))
      } catch {
        // 帧格式不认识就丢掉这一帧——不因为一帧坏掉放弃整段。
      }
    })

    socket.addEventListener('error', () => {
      finish({ ok: false, reason: 'Edge 语音服务拒绝连接（常见原因：该网络出口被 WAF 拦成 403）。' })
    })
    socket.addEventListener('close', event => {
      if (event.code === 1000) return
      finish({ ok: false, reason: `Edge 语音服务断开（code=${event.code}）。` })
    })
  })

  if (!result.ok && /403|WAF|拒绝连接/.test(result.reason ?? '')) {
    failureMemo.set(`edge::${options.baseUrl ?? ''}`, { at: Date.now(), reason: result.reason ?? '' })
  }
  return result
}

/** Build the endpoint URL with the DRM token. */
export function endpointUrl(baseUrl = '') {
  const base = typeof baseUrl === 'string' && baseUrl.trim() !== ''
    ? baseUrl.trim()
    : 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
  const url = new URL(base)
  url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN)
  url.searchParams.set('Sec-MS-GEC', secMsGec())
  url.searchParams.set('Sec-MS-GEC-Version', `1-${CHROMIUM_VERSION}`)
  return url.toString()
}

/**
 * The DRM token: SHA-256 of (Windows file-time ticks rounded down to 5 minutes)
 * plus the fixed client token, uppercase hex.
 */
export function secMsGec(now = Date.now()) {
  let ticks = (Math.floor(now / 1000) + 11644473600) * 10_000_000
  ticks -= ticks % 3_000_000_000
  return createHash('sha256').update(String(ticks) + TRUSTED_CLIENT_TOKEN, 'ascii').digest('hex').toUpperCase()
}

/** `rate` (0.5–2) as the SSML percentage. */
function ratePercent(rate) {
  const value = typeof rate === 'number' && Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1
  const percent = Math.round((value - 1) * 100)
  return `${percent >= 0 ? '+' : ''}${percent}%`
}

/** Escape text for SSML. */
function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character])
}

/** Read an error message. */
function messageOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
