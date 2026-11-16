/**
 * MiniMax 语音合成适配器。
 *
 * **契约**：`POST {base}/v1/t2a_v2`，JSON `{ model, text, stream, voice_setting, audio_setting }`；
 * 音频以 **十六进制字符串** 放在 `data.audio` 里（不是 base64，也不是字节流）。
 *
 * 它是"配了就能用"的一条路，**不是默认**：默认链路里没有它，除非用户
 * 配了 `ttsProvider: minimax` 或给了 MiniMax 的凭据。
 */

const TIMEOUT_MS = 90000

/**
 * Synthesize speech through MiniMax.
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
export async function synthesizeWithMinimax(options) {
  const format = options.format === 'wav' ? 'wav' : 'mp3'
  const body = {
    model: options.model === '' ? 'speech-02-hd' : options.model,
    text: options.text,
    stream: false,
    voice_setting: {
      voice_id: options.voice === '' ? 'female-shaonv' : options.voice,
      speed: typeof options.rate === 'number' ? Math.min(2, Math.max(0.5, options.rate)) : 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: { format, sample_rate: 32000, bitrate: 128000 },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(joinEndpoint(options.baseUrl, '/v1/t2a_v2'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
      signal: options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal]),
    })
    const raw = await response.text()
    if (!response.ok) {
      return { ok: false, reason: `MiniMax TTS 返回 HTTP ${response.status}：${raw.slice(0, 300)}` }
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: false, reason: `MiniMax TTS 返回的不是 JSON：${raw.slice(0, 200)}` }
    }
    const status = parsed?.base_resp?.status_code
    if (typeof status === 'number' && status !== 0) {
      const message = typeof parsed?.base_resp?.status_msg === 'string' ? parsed.base_resp.status_msg : '未知原因'
      return { ok: false, reason: `MiniMax TTS 拒绝了这个请求（status_code=${status}：${message}）` }
    }
    const hex = parsed?.data?.audio
    if (typeof hex !== 'string' || hex === '') {
      return { ok: false, reason: 'MiniMax TTS 没有返回音频数据（data.audio 为空）。' }
    }
    const buffer = Buffer.from(hex, 'hex')
    if (buffer.length === 0) return { ok: false, reason: 'MiniMax TTS 返回的十六进制音频解不出来。' }
    return {
      ok: true,
      audioBase64: buffer.toString('base64'),
      mimeType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
    }
  } catch (error) {
    const message = error?.name === 'AbortError' ? `MiniMax TTS 超时（${TIMEOUT_MS}ms）` : `MiniMax TTS 失败：${messageOf(error)}`
    return { ok: false, reason: message }
  } finally {
    clearTimeout(timer)
  }
}

/** Join a base URL and a path. */
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
