/**
 * 语音链路的冒烟脚本（开发用，不进构建闸门）。
 *
 *   node scripts/voice-smoke.mjs            # 只读状态
 *   node scripts/voice-smoke.mjs --speak    # 再真的合成一句话（会联网）
 *
 * **为什么需要它。** 面板跑在浏览器里，链路对不对只能在真机上验；
 * 而 `build.mjs` 只做语法与渲染，测不到"宿主有没有语音服务、默认会挑哪家"。
 * 这个脚本用假 ctx 走真实解析逻辑，把判断结果打出来。
 */
import assert from 'node:assert/strict'
import { InterviewService } from '../src/host/service.js'

/** A ctx that exposes no host services at all. */
const bare = { get: () => undefined }

/** A ctx with a fake host speechToText service. */
function withHostSpeech() {
  const providers = [
    { id: 'sensevoice-local', name: 'SenseVoice（本机）', location: 'host-local', languages: ['auto', 'zh', 'en'] },
  ]
  return {
    get(name) {
      if (name !== 'speechToText') return undefined
      return {
        listProviders: () => providers,
        snapshot: () => ({ providers: providers.map(provider => ({ ...provider, preparation: { phase: 'unprepared' } })), selection: { providerId: 'sensevoice-local', language: 'zh' } }),
        prepare: () => {},
        resolve: request => ({ provider: { info: providers[0] }, audio: request.audio, language: request.language }),
        transcribe: async () => '这是一段假转写',
      }
    },
  }
}

const withoutHost = new InterviewService({ config: {}, ctx: bare })
const status = await withoutHost.voiceStatus()
console.log('— 没有宿主语音服务（本机现状）—')
console.log(JSON.stringify({ asr: status.asr.mode, asrReason: status.asr.reason, tts: status.tts.mode, ttsProvider: status.tts.provider, ttsReason: status.tts.reason }, null, 2))
assert.equal(status.asr.mode, 'browser', '没有宿主语音服务时应回落浏览器')
assert.equal(status.tts.mode, 'server', 'auto 应该挑到一个免密钥的自然音链路')

const withHost = new InterviewService({ config: {}, ctx: withHostSpeech() })
const hostStatus = await withHost.voiceStatus()
console.log('\n— 有宿主语音服务（模拟 voice-input bundle 启用后）—')
console.log(JSON.stringify({ asr: hostStatus.asr.mode, provider: hostStatus.asr.host?.provider?.id, ready: hostStatus.asr.host?.ready, needsPreparation: hostStatus.asr.host?.needsPreparation, hint: hostStatus.asr.hint }, null, 2))
assert.equal(hostStatus.asr.mode, 'host', '宿主有语音服务时应优先用宿主')
assert.equal(hostStatus.asr.host.needsPreparation, true, '未准备的 provider 应报告需要准备')

const prepared = await withHost.prepareSpeech()
console.log('\n— 准备宿主语音模型 —')
console.log(JSON.stringify(prepared, null, 2))
assert.equal(prepared.ok, true)

if (process.argv.includes('--speak')) {
  console.log('\n— 真的合成一句（联网）—')
  const spoken = await withoutHost.synthesizeSpeech({ text: '请先做一个自我介绍。' })
  console.log(JSON.stringify({ ok: spoken.ok, provider: spoken.provider, label: spoken.label, voice: spoken.voice, mimeType: spoken.mimeType, bytes: spoken.audioBase64 ? Math.round(spoken.audioBase64.length * 0.75) : 0, reason: spoken.reason }, null, 2))
  assert.equal(spoken.ok, true, '默认链路应该能合成出音频')
}

console.log('\n✓ 语音链路冒烟通过')
