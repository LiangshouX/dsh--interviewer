/**
 * MiMo TTS 适配器（`chat/completions` + `audio` 参数）。
 *
 * **为什么单独一个适配器。** MiMo 自称"OpenAI API 兼容"，但它的 TTS 并不在
 * `/audio/speech` 上：请求发到 `chat/completions`，目标文本放在 **assistant**
 * 消息里，音色放进 `audio.voice`，音频以 base64 从 `choices[0].message.audio.data`
 * 回来。形状不同就不能硬塞进 openai 那条。
 *
 * 三种模型共用这一个适配器：
 *
 *   | 模型 | audio.voice | user 消息 |
 *   |---|---|---|
 *   | mimo-v2.5-tts | 预置音色 id | 可选风格指令 |
 *   | mimo-v2.5-tts-voicedesign | **不能传** | **必填**：音色描述 |
 *   | mimo-v2.5-tts-voiceclone | **必填**：样本音频 base64 | 可选风格指令 |
 *
 * 音频格式只认 `wav` / `mp3`（`pcm` 是流式才用，这里不碰）。
 */

/** How long one synthesis request may take. */
const TIMEOUT_MS = 90000

/** 预置音色：只在没配 `ttsVoice` 时用。 */
export const DEFAULT_MIMO_VOICE = 'mimo_default'

/** MiMo 的三种模型形态。 */
export const MIMO_MODEL = {
  PRESET: 'mimo-v2.5-tts',
  VOICE_DESIGN: 'mimo-v2.5-tts-voicedesign',
  VOICE_CLONE: 'mimo-v2.5-tts-voiceclone',
}

/**
 * Synthesize speech through MiMo.
 *
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {string} options.voice
 * @param {string} options.style 自然语言风格指令（user 消息）
 * @param {string} options.referenceAudioDataUri voiceclone 用的样本（data URI）
 * @param {string} options.format
 * @param {string} options.text
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ok: boolean, audioBase64?: string, mimeType?: string, reason?: string, detail?: object}>}
 */
export async function synthesizeWithMimo(options) {
  const model = options.model === '' ? MIMO_MODEL.PRESET : options.model
  const shape = shapeOf(model)
  const audio = { format: options.format === 'wav' ? 'wav' : 'mp3' }

  if (shape === 'clone') {
    if (typeof options.referenceAudioDataUri !== 'string' || options.referenceAudioDataUri.trim() === '') {
      return {
        ok: false,
        reason: `${model} 需要一段参考音频样本，但配置里没有 ttsReferenceAudio。`,
        detail: { hint: '把一段 5–30 秒的干净人声（mp3 或 wav）路径填进 ttsReferenceAudio，或改用 mimo-v2.5-tts。' },
      }
    }
    audio.voice = options.referenceAudioDataUri.trim()
  } else if (shape === 'design') {
    // voicedesign 明确不支持 audio.voice；音色由 user 消息描述。
    if (typeof options.style !== 'string' || options.style.trim() === '') {
      return {
        ok: false,
        reason: `${model} 需要音色描述文本，但配置里没有 ttsStyle。`,
        detail: { hint: '在 ttsStyle 里写 1–4 句音色描述（性别与年龄、音色质感、情绪语气、语速节奏）。' },
      }
    }
  } else {
    audio.voice = options.voice === '' ? DEFAULT_MIMO_VOICE : options.voice
  }

  const messages = []
  const style = typeof options.style === 'string' ? options.style.trim() : ''
  if (style !== '') messages.push({ role: 'user', content: style })
  else if (shape === 'design') messages.push({ role: 'user', content: '' })
  messages.push({ role: 'assistant', content: options.text })

  const body = { model, messages, audio, stream: false }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(joinEndpoint(options.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // MiMo 文档明说支持 `api-key`；Bearer 也收，两个都带上省得踩网关差异。
        'api-key': options.apiKey,
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal]),
    })
    const raw = await response.text()
    if (!response.ok) {
      return { ok: false, reason: `MiMo TTS 返回 HTTP ${response.status}：${raw.slice(0, 300)}` }
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: false, reason: `MiMo TTS 返回的不是 JSON：${raw.slice(0, 200)}` }
    }
    const failure = providerFailure(parsed)
    if (failure !== '') return { ok: false, reason: failure }

    const data = parsed?.choices?.[0]?.message?.audio?.data
    if (typeof data !== 'string' || data === '') {
      return { ok: false, reason: 'MiMo TTS 没有返回音频数据（choices[0].message.audio.data 为空）。' }
    }
    const buffer = Buffer.from(data, 'base64')
    if (buffer.length === 0) return { ok: false, reason: 'MiMo TTS 返回的音频数据解不出来。' }
    return {
      ok: true,
      audioBase64: buffer.toString('base64'),
      mimeType: audio.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
    }
  } catch (error) {
    const message = error?.name === 'AbortError' ? `MiMo TTS 超时（${TIMEOUT_MS}ms）` : `MiMo TTS 失败：${messageOf(error)}`
    return { ok: false, reason: message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Which of the three shapes a model id has.
 *
 * @param {string} model
 * @returns {'preset'|'design'|'clone'}
 */
export function shapeOf(model) {
  if (/voiceclone/i.test(model)) return 'clone'
  if (/voicedesign/i.test(model)) return 'design'
  return 'preset'
}

/**
 * MiMo 把业务错误放在 `base_resp` 里，HTTP 仍可能是 200。
 *
 * @param {any} parsed
 */
function providerFailure(parsed) {
  const status = parsed?.base_resp?.status_code
  if (typeof status === 'number' && status !== 0) {
    const message = typeof parsed?.base_resp?.status_msg === 'string' ? parsed.base_resp.status_msg : '未知原因'
    return `MiMo TTS 拒绝了这个请求（status_code=${status}：${message}）`
  }
  return ''
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
