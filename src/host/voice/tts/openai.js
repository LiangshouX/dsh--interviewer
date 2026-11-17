/**
 * OpenAI 兼容的 `/audio/speech` 适配器。
 *
 * **契约**：`POST {base}/audio/speech`，JSON `{ model, input, voice, response_format }`，
 * 响应体**就是音频字节**（mp3 / wav）。这是最通行的一种，很多网关都实现它。
 *
 * 注意它和 MiMo 的 `chat/completions` 形状**不兼容**——那种走 `chat-audio.js`。
 */

/** How long one synthesis request may take. */
const TIMEOUT_MS = 60000

/**
 * Synthesize speech.
 *
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {string} options.voice
 * @param {string} options.format
 * @param {number} options.rate
 * @param {string} options.text
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ok: boolean, audioBase64?: string, mimeType?: string, reason?: string}>}
 */
export async function synthesizeWithOpenAi(options) {
  const endpoint = joinEndpoint(options.baseUrl, '/audio/speech')
  const body = {
    model: options.model,
    input: options.text,
    voice: options.voice === '' ? 'alloy' : options.voice,
    response_format: options.format === 'wav' ? 'wav' : 'mp3',
  }
  // `speed` 只有部分兼容实现接受（tts-1 系列），带了不被支持时服务端会 400，
  // 所以只在语速确实不是 1 时才试探性带上。
  if (typeof options.rate === 'number' && Math.abs(options.rate - 1) > 0.01) body.speed = options.rate

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
      signal: options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal]),
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200)
      return {
        ok: false,
        reason: `/audio/speech 返回 HTTP ${response.status}：${detail}`,
        hint: hintForStatus(response.status),
      }
    }
    const contentType = response.headers.get('content-type') ?? ''
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) {
      return { ok: false, reason: '语音服务返回了空响应。', hint: '换一个模型或网关再试；也可以改用百度朗读（免密钥）。' }
    }
    // 有些网关出错时也回 200，但回的是 JSON 错误体——按内容判断，别当音频。
    if (/json/i.test(contentType)) {
      return {
        ok: false,
        reason: `语音服务返回的不是音频：${buffer.toString('utf8').slice(0, 200)}`,
        hint: '端点返回 JSON 说明路径或模型不对：确认 baseUrl 指向 /v1，且模型支持 /audio/speech。',
      }
    }
    return {
      ok: true,
      audioBase64: buffer.toString('base64'),
      mimeType: /wav/i.test(contentType) || options.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
    }
  } catch (error) {
    const aborted = error?.name === 'AbortError'
    return {
      ok: false,
      reason: aborted ? `语音合成超时（${TIMEOUT_MS}ms）` : `语音合成失败：${messageOf(error)}`,
      hint: aborted
        ? '网络慢或端点不可达：检查网络/代理，或改用百度朗读（免密钥）。'
        : '检查网络与端点；也可以改用百度朗读（免密钥）。',
    }
  } finally {
    clearTimeout(timer)
  }
}

/** A next step for a failed HTTP status. */
function hintForStatus(status) {
  if (status === 401 || status === 403) return '语音服务拒绝了这把凭据：确认 OPENAI_API_KEY（或你选的凭据名）属于这个网关。'
  if (status === 404) return '端点或模型不存在：确认 baseUrl 指向 /v1，模型支持 /audio/speech。'
  if (status === 400) return '请求被拒：检查模型 id、音色与 response_format；有的兼容网关只认部分音色。'
  if (status === 429) return '额度或频率被限：稍后再试，或改用百度朗读（免密钥）。'
  return '检查凭据、端点与模型；也可以改用百度朗读（免密钥）继续面试。'
}

/** Join a base URL and a path without doubling slashes. */
export function joinEndpoint(baseUrl, path) {
  const base = String(baseUrl ?? '').replace(/\/+$/, '')
  if (/^https?:\/\//i.test(path)) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

/** Read an error message. */
function messageOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
