/**
 * 语音能力总入口（`service.voice`）。
 *
 * **为什么是一个类而不是四个散函数。** 面板与 agent 都需要"现在到底用哪条
 * 链路、能不能用、为什么不用"，这些判断依赖同一批宿主服务与同一份配置。
 * 收在一个门面上，`service.js` 只多四行转发，API 与工具都走同一套语义。
 *
 * 它自己不含协议实现：ASR 在 `asr.js`，TTS 在 `tts.js`，各家适配器在
 * `tts/` 与 `host-asr.js` / `http-asr.js` 里。
 */
import { describeAsr, transcribeAudio } from './asr.js'
import { prepareHostSpeech } from './host-asr.js'
import { describeTts, synthesize } from './tts.js'

export class VoiceService {
  /**
   * @param {import('../service.js').InterviewService} service
   */
  constructor(service) {
    this.service = service
  }

  /**
   * The whole voice picture: recognition chain and synthesis chain.
   *
   * @returns {Promise<{asr: object, tts: object}>}
   */
  async status() {
    const [asr, tts] = await Promise.all([describeAsr(this.service), describeTts(this.service)])
    return { asr, tts }
  }

  /**
   * Ask the host to prepare its recognizer (model download / load).
   *
   * @param {string} [providerId]
   */
  async prepare(providerId) {
    return prepareHostSpeech(this.service, providerId)
  }

  /**
   * Transcribe one recording through the fallback chain.
   *
   * @param {{dataBase64?: string, mimeType?: string, language?: string}} input
   * @param {{signal?: AbortSignal}} [options]
   */
  async transcribe(input, options) {
    return transcribeAudio(this.service, input, options)
  }

  /**
   * Synthesize one line of speech.
   *
   * @param {{text: string, voice?: string, rate?: number, signal?: AbortSignal}} input
   */
  async speak(input) {
    return synthesize(this.service, input)
  }
}
