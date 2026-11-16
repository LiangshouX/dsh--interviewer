import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTts, describeTts, synthesize, pickAutoOrder, providerHint, loadReferenceAudio } from '../src/host/voice/tts.js'
import { synthesizeWithMimo, shapeOf } from '../src/host/voice/tts/mimo.js'
import { synthesizeWithOpenAi } from '../src/host/voice/tts/openai.js'
import { synthesizeWithMinimax } from '../src/host/voice/tts/minimax.js'
import { splitText } from '../src/host/voice/tts/baidu.js'
import { secMsGec, endpointUrl } from '../src/host/voice/tts/edge.js'
import { describeAsr, transcribeAudio } from '../src/host/voice/asr.js'
import { transcribeWithHost } from '../src/host/voice/host-asr.js'

/** A service with no host services at all. */
function bare(config = {}) {
  return { config, ctx: { get: () => undefined } }
}

/** Replace global fetch for the duration of one test. */
async function withFetch(fake, run) {
  const original = globalThis.fetch
  globalThis.fetch = fake
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

/** Base64 of a tiny fake audio payload. */
function fakeAudioBase64() {
  return Buffer.from('ID3-fake-audio').toString('base64')
}

// ── ASR：链路顺序与诚实回落 ────────────────────────────────────────────────

test('没有宿主语音服务也没有凭据时，识别诚实地回落浏览器并说明两层原因', async () => {
  const described = await describeAsr(bare({ asrApiKeyEnv: 'DSH_TEST_NO_SUCH_KEY' }))
  assert.equal(described.mode, 'browser')
  assert.match(described.reason, /没有语音识别服务/)
  assert.match(described.reason, /回落/)
  assert.equal(described.host.available, false)
  assert.equal(described.server.available, false)
})

test('判定为浏览器模式时，转写请求不会偷偷发到别处', async () => {
  const result = await transcribeAudio(bare({ asrApiKeyEnv: 'DSH_TEST_NO_SUCH_KEY' }), { dataBase64: fakeAudioBase64() })
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'browser')
  assert.equal(result.text, '')
})

test('宿主有语音服务时优先用宿主，并报告"需要准备"', async () => {
  const providers = [{ id: 'sensevoice-local', name: 'SenseVoice', location: 'host-local', languages: ['zh'] }]
  const ctx = {
    get: name => name !== 'speechToText' ? undefined : {
      listProviders: () => providers,
      snapshot: () => ({ providers: providers.map(item => ({ ...item, preparation: { phase: 'unprepared' } })), selection: { providerId: 'sensevoice-local', language: 'zh' } }),
      prepare: () => {},
      resolve: () => ({ provider: { info: { id: 'sensevoice-local', name: 'SenseVoice' } }, audio: Buffer.alloc(0), language: 'zh' }),
      transcribe: async () => '转写结果',
    },
  }
  const described = await describeAsr({ config: {}, ctx })
  assert.equal(described.mode, 'host')
  assert.equal(described.host.ready, false)
  assert.equal(described.host.needsPreparation, true)
  assert.match(described.hint, /准备/)
})

test('宿主 provider 返回空文本不算成功', async () => {
  const speech = {
    listProviders: () => [{ id: 'p1', name: 'P1' }],
    resolve: () => ({ provider: { info: { id: 'p1' } }, audio: Buffer.from('x') }),
    transcribe: async () => '',
  }
  const result = await transcribeWithHost({ ctx: { get: () => speech } }, { buffer: Buffer.from('x') })
  assert.equal(result.ok, false)
  assert.match(result.reason, /没有给出文字/)
})

test('宿主 provider 的「音频秒数 / 推理秒数」要接出来（准实时的判断依据）', async () => {
  const speech = {
    listProviders: () => [{ id: 'sensevoice-local', name: 'SenseVoice' }],
    resolve: () => ({ provider: { info: { id: 'sensevoice-local', name: 'SenseVoice' } }, audio: Buffer.from('x') }),
    transcribe: async () => ({ text: '你好', audioSeconds: 2.4, inferenceSeconds: 0.35 }),
  }
  const result = await transcribeWithHost({ ctx: { get: () => speech } }, { buffer: Buffer.from('x') })
  assert.equal(result.ok, true)
  assert.equal(result.text, '你好')
  assert.deepEqual(result.timing, { audioSeconds: 2.4, inferenceSeconds: 0.35 })
})

// ── TTS：默认链路 ────────────────────────────────────────────────────────

test('没配任何凭据时，auto 挑到免密钥的自然音而不是浏览器机器音', async () => {
  const resolved = await resolveTts(bare({}))
  assert.equal(resolved.mode, 'server')
  assert.ok(['baidu', 'edge'].includes(resolved.provider), `实际选了 ${resolved.provider}`)
})

test('配了 MIMO_API_KEY 时，auto 优先选 MiMo 的 chat-audio 协议', async () => {
  const previous = process.env.MIMO_API_KEY
  process.env.MIMO_API_KEY = 'sk-mimo-test'
  try {
    const resolved = await resolveTts(bare({}))
    assert.equal(resolved.mode, 'server')
    assert.equal(resolved.provider, 'mimo')
    assert.equal(resolved.protocol, 'chat-audio')
    assert.equal(resolved.model, 'mimo-v2.5-tts')
    assert.equal(resolved.voice, 'mimo_default')
    const described = await describeTts(bare({}))
    assert.equal(described.hasCredential, true)
    assert.equal(described.apiKey, undefined, '对外描述不能带密钥')
  } finally {
    if (previous === undefined) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = previous
  }
})

test('voiceclone 缺参考音频时明说，不静默换成别的模型', async () => {
  const previous = process.env.MIMO_API_KEY
  process.env.MIMO_API_KEY = 'sk-mimo-test'
  try {
    const resolved = await resolveTts(bare({ ttsProvider: 'mimo', ttsModel: 'mimo-v2.5-tts-voiceclone' }))
    assert.equal(resolved.mode, 'browser')
    assert.match(resolved.reason, /参考音频|ttsReferenceAudio/)
  } finally {
    if (previous === undefined) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = previous
  }
})

test('从已有配置反推用户想用哪家', () => {
  assert.equal(providerHint({ ttsBaseUrl: 'https://api.xiaomimimo.com/v1' }), 'mimo')
  assert.equal(providerHint({ ttsModel: 'mimo-v2.5-tts' }), 'mimo')
  assert.equal(providerHint({ ttsApiKeyEnv: 'MINIMAX_API_KEY' }), 'minimax')
  assert.equal(providerHint({ ttsBaseUrl: 'https://gateway.example/v1' }), 'openai')
  assert.equal(providerHint({}), '')
  assert.deepEqual(pickAutoOrder({ ttsModel: 'mimo-v2.5-tts' }).slice(0, 2), ['mimo', 'openai'])
})

test('参考音频只认 mp3/wav，路径不存在时给出可读原因', async () => {
  const missing = await loadReferenceAudio('D:/definitely/not/here.mp3')
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /读不到/)
  const wrongKind = await loadReferenceAudio('D:/tmp/sample.txt')
  assert.equal(wrongKind.ok, false)
})

// ── TTS：三个协议的请求形状 ─────────────────────────────────────────────

test('MiMo 走 chat/completions，目标文本在 assistant 消息里', async () => {
  const calls = []
  const result = await withFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return new Response(JSON.stringify({ choices: [{ message: { audio: { data: fakeAudioBase64() } } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }, () => synthesizeWithMimo({
    baseUrl: 'https://api.xiaomimimo.com/v1',
    apiKey: 'sk-test',
    model: 'mimo-v2.5-tts',
    voice: '冰糖',
    style: '语速偏慢，语气克制',
    format: 'mp3',
    text: '请先做一个自我介绍。',
  }))

  assert.equal(result.ok, true)
  assert.equal(result.mimeType, 'audio/mpeg')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.xiaomimimo.com/v1/chat/completions')
  assert.equal(calls[0].body.model, 'mimo-v2.5-tts')
  assert.equal(calls[0].body.audio.voice, '冰糖')
  assert.equal(calls[0].body.audio.format, 'mp3')
  assert.equal(calls[0].body.stream, false)
  assert.equal(calls[0].body.messages[0].role, 'user')
  assert.equal(calls[0].body.messages[0].content, '语速偏慢，语气克制')
  assert.deepEqual(calls[0].body.messages.at(-1), { role: 'assistant', content: '请先做一个自我介绍。' })
})

test('MiMo voicedesign 不带 audio.voice，音色由 user 描述决定', async () => {
  const calls = []
  await withFetch(async (url, init) => {
    calls.push(JSON.parse(init.body))
    return new Response(JSON.stringify({ choices: [{ message: { audio: { data: fakeAudioBase64() } } }] }), { status: 200 })
  }, () => synthesizeWithMimo({
    baseUrl: 'https://api.xiaomimimo.com/v1',
    apiKey: 'sk-test',
    model: 'mimo-v2.5-tts-voicedesign',
    voice: 'whatever',
    style: '三十岁的女声，音色偏亮，语速正常',
    format: 'wav',
    text: '我们开始吧。',
  }))
  assert.equal(calls[0].audio.voice, undefined)
  assert.equal(calls[0].messages[0].content, '三十岁的女声，音色偏亮，语速正常')
  assert.equal(shapeOf('mimo-v2.5-tts-voicedesign'), 'design')
  assert.equal(shapeOf('mimo-v2.5-tts-voiceclone'), 'clone')
  assert.equal(shapeOf('mimo-v2.5-tts'), 'preset')
})

test('MiMo 的 base_resp 业务错误不会被当成成功', async () => {
  const result = await withFetch(async () => new Response(JSON.stringify({ base_resp: { status_code: 1004, status_msg: 'invalid api key' } }), { status: 200 }), () => synthesizeWithMimo({
    baseUrl: 'https://api.xiaomimimo.com/v1', apiKey: 'bad', model: 'mimo-v2.5-tts', voice: '', style: '', format: 'mp3', text: '你好',
  }))
  assert.equal(result.ok, false)
  assert.match(result.reason, /1004|invalid api key/)
})

test('OpenAI 兼容走 /audio/speech，请求体是 input 而不是 messages', async () => {
  const calls = []
  const result = await withFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return new Response(Buffer.from('ID3-fake'), { status: 200, headers: { 'content-type': 'audio/mpeg' } })
  }, () => synthesizeWithOpenAi({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk', model: 'gpt-4o-mini-tts', voice: 'alloy', format: 'mp3', rate: 1, text: '你好' }))
  assert.equal(result.ok, true)
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech')
  assert.equal(calls[0].body.input, '你好')
  assert.equal(calls[0].body.model, 'gpt-4o-mini-tts')
})

test('MiniMax 的十六进制音频能解回字节', async () => {
  const result = await withFetch(async () => new Response(JSON.stringify({ data: { audio: 'fffb90' }, base_resp: { status_code: 0 } }), { status: 200 }), () => synthesizeWithMinimax({
    baseUrl: 'https://api.minimaxi.com', apiKey: 'sk', model: 'speech-02-hd', voice: 'female-shaonv', format: 'mp3', rate: 1, text: '你好',
  }))
  assert.equal(result.ok, true)
  assert.equal(Buffer.from(result.audioBase64, 'base64').toString('hex'), 'fffb90')
})

test('长文本按句切分且不超上限', () => {
  const text = '第一句话。第二句话！第三句话？'.repeat(20)
  const chunks = splitText(text, 120)
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every(chunk => chunk.length <= 120))
  assert.equal(chunks.join(''), text.replace(/\s+/g, ' '))
})

// ── Edge：令牌与端点 ─────────────────────────────────────────────────────

test('Edge 的 DRM 令牌是 5 分钟一档的大写十六进制', () => {
  const first = secMsGec(1_700_000_000_000)
  const sameBucket = secMsGec(1_700_000_000_000 + 60_000)
  const nextBucket = secMsGec(1_700_000_000_000 + 10 * 60_000)
  assert.match(first, /^[0-9A-F]{64}$/)
  assert.equal(first, sameBucket)
  assert.notEqual(first, nextBucket)
  const url = endpointUrl('')
  assert.match(url, /Sec-MS-GEC=[0-9A-F]{64}/)
  assert.match(url, /TrustedClientToken=/)
})

test('自动链路在明确要求某家时不会偷偷换成别家', async () => {
  const resolved = await resolveTts(bare({ ttsProvider: 'openai' }))
  // 没有 OPENAI_API_KEY：回落浏览器，但**不能**去用百度或 Edge。
  assert.equal(resolved.mode, 'browser')
  assert.match(resolved.reason, /openai/)
})

test('synthesize 在浏览器模式下返回可读原因而不是抛错', async () => {
  const result = await synthesize(bare({ ttsProvider: 'browser' }), { text: '你好' })
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'browser')
  assert.match(result.reason, /浏览器/)
})
