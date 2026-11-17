/**
 * MiniMax 语音合成适配器。
 *
 * **契约**：`POST {base}/v1/t2a_v2`，JSON `{ model, text, stream, voice_setting, audio_setting }`；
 * 音频以 **十六进制字符串** 放在 `data.audio` 里（不是 base64，也不是字节流）。
 *
 * **GroupId 是这条链路最常见的坑。** MiniMax 有一部分账户的 t2a_v2 要求
 * 在查询串上带 `GroupId=…`（账户页里的 Group ID）；不带时服务端可能回
 * 401/400，也可能 200 + `base_resp.status_code≠0`。所以这里支持
 * `options.groupId` / `MINIMAX_GROUP_ID` 环境变量，失败时把这条出路写进 hint。
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
 * @param {string} [options.groupId]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ok: boolean, audioBase64?: string, mimeType?: string, reason?: string, hint?: string}>}
 */
export async function synthesizeWithMinimax(options) {
  const format = options.format === 'wav' ? 'wav' : 'mp3'
  const groupId = resolveGroupId(options.groupId)
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
    const response = await fetch(endpointFor(options.baseUrl, groupId), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
      signal: options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal]),
    })
    const raw = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        reason: `MiniMax TTS 返回 HTTP ${response.status}：${raw.slice(0, 300)}`,
        hint: hintForStatus(response.status),
      }
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {
        ok: false,
        reason: `MiniMax TTS 返回的不是 JSON：${raw.slice(0, 200)}`,
        hint: '端点可能不是 MiniMax：检查端点是否指向 api.minimaxi.com（国内）或 api.minimax.io（海外）。',
      }
    }
    const status = parsed?.base_resp?.status_code
    if (typeof status === 'number' && status !== 0) {
      const message = typeof parsed?.base_resp?.status_msg === 'string' ? parsed.base_resp.status_msg : '未知原因'
      return {
        ok: false,
        reason: `MiniMax TTS 拒绝了这个请求（status_code=${status}：${message}）`,
        hint: '检查 MINIMAX_API_KEY 是否有效、账户是否开通语音合成；部分账户还需要在设置页填 Group ID。',
      }
    }
    const hex = parsed?.data?.audio
    if (typeof hex !== 'string' || hex === '') {
      return {
        ok: false,
        reason: 'MiniMax TTS 没有返回音频数据（data.audio 为空）。',
        hint: '确认模型 id 是语音合成模型（speech-02-hd）；检查账户额度是否用尽。',
      }
    }
    const buffer = Buffer.from(hex, 'hex')
    if (buffer.length === 0) {
      return { ok: false, reason: 'MiniMax TTS 返回的十六进制音频解不出来。', hint: '换 mp3 格式再试一次。' }
    }
    return {
      ok: true,
      audioBase64: buffer.toString('base64'),
      mimeType: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
    }
  } catch (error) {
    const aborted = error?.name === 'AbortError'
    return {
      ok: false,
      reason: aborted ? `MiniMax TTS 超时（${TIMEOUT_MS}ms）` : `MiniMax TTS 失败：${messageOf(error)}`,
      hint: aborted
        ? '网络慢或端点不可达：检查网络/代理，或改用 OpenAI 兼容、MiMo。'
        : '检查网络是否可达 api.minimaxi.com；也可以改用 OpenAI 兼容或 MiMo。',
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Which GroupId to send (query param), or '' to omit it.
 *
 * `MINIMAX_GROUP_ID` 是给"不想在面板里再填一遍"的人用的环境变量。
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
 * The t2a_v2 endpoint, with GroupId when the account needs it.
 *
 * @param {string} baseUrl
 * @param {string} groupId
 */
export function endpointFor(baseUrl, groupId = '') {
  const endpoint = joinEndpoint(baseUrl, '/v1/t2a_v2')
  if (groupId === '') return endpoint
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}GroupId=${encodeURIComponent(groupId)}`
}

/** A next step for a failed HTTP status. */
function hintForStatus(status) {
  if (status === 401 || status === 403) {
    return 'MiniMax 拒绝了这把凭据：确认 MINIMAX_API_KEY 属于 MiniMax 开放平台，且账户开通了语音合成。'
  }
  if (status === 404) {
    return '端点可能不对：MiniMax 语音合成路径是 /v1/t2a_v2；国内 api.minimaxi.com，海外 api.minimax.io。'
  }
  if (status === 400) {
    return '请求被拒：检查模型（speech-02-hd）与音色 id；部分账户还需要 Group ID（设置页可填）。'
  }
  if (status === 429) return '额度或频率被限：稍后再试，或换 MiMo / OpenAI 兼容语音。'
  return '检查凭据、端点与模型；也可以改用 OpenAI 兼容或 MiMo。'
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
