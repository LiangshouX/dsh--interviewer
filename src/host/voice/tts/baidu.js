/**
 * 免密钥的兜底合成：百度翻译的朗读接口。
 *
 * **为什么要有它。** 用户可能一个语音凭据都没有，而系统自带的
 * `speechSynthesis` 在这台机器上只有 SAPI 机械音——面试官一开口就像在读稿。
 * 这条链路零配置、普通话自然度明显好于系统音色，是"至少不要默认机器音"
 * 的最低保障。
 *
 * **它不是模型。** 端点不公开、可能随时变更、也不保证音色稳定，
 * 所以它只做 `auto` 里的倒数第二环：云端模型配好了就用模型，
 * 没配才用它；它失败再退回浏览器。
 */

const TIMEOUT_MS = 20000

/** 单次请求的文本上限：太长服务端会截断或拒绝，按句子切。 */
const MAX_CHUNK_CHARS = 120

/**
 * Synthesize speech through Baidu's read-aloud endpoint.
 *
 * @param {{text: string, rate?: number, signal?: AbortSignal}} options
 * @returns {Promise<{ok: boolean, audioBase64?: string, mimeType?: string, reason?: string}>}
 */
export async function synthesizeWithBaidu(options) {
  const text = String(options.text ?? '').trim()
  if (text === '') return { ok: false, reason: '没有要合成的文本。' }

  // spd 是百度的语速档位：1（最慢）~ 15（最快），5 接近正常语速。
  const speed = Math.round(Math.min(15, Math.max(1, 5 * (typeof options.rate === 'number' ? options.rate : 1))))
  const lang = /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en'
  const chunks = splitText(text, MAX_CHUNK_CHARS)
  const buffers = []

  for (const chunk of chunks) {
    const url = `https://fanyi.baidu.com/gettts?lan=${lang}&text=${encodeURIComponent(chunk)}&spd=${speed}&source=web`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'audio/mpeg,*/*' },
        signal: options.signal === undefined ? controller.signal : AbortSignal.any([options.signal, controller.signal]),
      })
      if (!response.ok) {
        return { ok: false, reason: `百度朗读接口返回 HTTP ${response.status}` }
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length === 0) return { ok: false, reason: '百度朗读接口返回了空音频。' }
      buffers.push(buffer)
    } catch (error) {
      const message = error?.name === 'AbortError' ? `百度朗读接口超时（${TIMEOUT_MS}ms）` : `百度朗读接口失败：${messageOf(error)}`
      return { ok: false, reason: message }
    } finally {
      clearTimeout(timer)
    }
  }

  // 逐段是完整 MPEG 帧，拼起来播放器能吃；切分发生在句末，不会切断词。
  return { ok: true, audioBase64: Buffer.concat(buffers).toString('base64'), mimeType: 'audio/mpeg' }
}

/**
 * Split text on sentence boundaries.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string[]}
 */
export function splitText(text, max) {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？!?；;…\n])/)
    .map(item => item.trim())
    .filter(item => item !== '')
  const chunks = []
  let current = ''
  for (const sentence of sentences.length === 0 ? [text] : sentences) {
    if (sentence.length > max) {
      if (current !== '') { chunks.push(current); current = '' }
      for (let start = 0; start < sentence.length; start += max) chunks.push(sentence.slice(start, start + max))
      continue
    }
    if (current.length + sentence.length > max) { chunks.push(current); current = '' }
    current += sentence
  }
  if (current !== '') chunks.push(current)
  return chunks.length === 0 ? [text.slice(0, max)] : chunks
}

/** Read an error message. */
function messageOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
