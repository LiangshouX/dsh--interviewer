import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveTts, describeTts, synthesize, pickAutoOrder, providerHint, loadReferenceAudio } from '../src/host/voice/tts.js'
import { synthesizeWithMimo, shapeOf } from '../src/host/voice/tts/mimo.js'
import { synthesizeWithOpenAi } from '../src/host/voice/tts/openai.js'
import { synthesizeWithDashScope } from '../src/host/voice/tts/dashscope.js'
import { synthesizeWithMinimax, endpointFor as minimaxEndpointFor, resolveGroupId } from '../src/host/voice/tts/minimax.js'
import { splitText } from '../src/host/voice/tts/baidu.js'
import { secMsGec, endpointUrl } from '../src/host/voice/tts/edge.js'
import { describeAsr, transcribeAudio } from '../src/host/voice/asr.js'
import { transcribeWithHost } from '../src/host/voice/host-asr.js'
import { transcribeHttp } from '../src/host/voice/http-asr.js'
import {
  clearSecret, describeSecret, discoverCredentials, isValidSecretRef, setSecret,
} from '../src/host/voice/credentials.js'
import { voicePresets } from '../src/host/voice/presets.js'
import { voicesFor, defaultVoiceForModel, voiceTable } from '../src/host/voice/voices.js'
import { InterviewService } from '../src/host/service.js'

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

// ── 凭据 seam：只进不出 ───────────────────────────────────────────────────

test('凭据名只接受环境变量形状（ref 会进 YAML，不能放路径分隔符）', () => {
  assert.equal(isValidSecretRef('MIMO_API_KEY'), true)
  assert.equal(isValidSecretRef('_PRIVATE'), true)
  assert.equal(isValidSecretRef('1BAD'), false)
  assert.equal(isValidSecretRef('../evil'), false)
  assert.equal(isValidSecretRef('a-b'), false)
  assert.equal(isValidSecretRef(''), false)
})

test('宿主没有 credentials seam：写入/删除都失败，并给出「环境变量 + 重启 DSH」的出路', async () => {
  const result = await setSecret({ get: () => undefined }, 'MIMO_API_KEY', 'sk-hidden-value')
  assert.equal(result.ok, false)
  assert.match(result.hint, /环境变量/)
  assert.match(result.hint, /重启 DSH/)
  assert.equal(JSON.stringify(result).includes('sk-hidden-value'), false)

  const cleared = await clearSecret({ get: () => undefined }, 'MIMO_API_KEY')
  assert.equal(cleared.ok, false)
  assert.match(cleared.hint, /环境变量/)
})

test('describeSecret 只回答配没配 / 来源 / 可写性，不回传值', async () => {
  const ctx = {
    get: () => ({
      describe: async () => ({ configured: true, source: 'credentials.file', writable: true }),
      resolve: async () => ({ value: 'sk-hidden-value' }),
    }),
  }
  const described = await describeSecret(ctx, 'MIMO_API_KEY')
  assert.equal(described.ok, true)
  assert.equal(described.configured, true)
  assert.equal(described.source, 'host')
  assert.equal(described.writable, true)
  assert.equal(JSON.stringify(described).includes('sk-hidden-value'), false)
})

test('setSecret 成功时只回状态；失败时把密钥从错误信息里擦掉', async () => {
  const written = []
  const ok = await setSecret({
    get: () => ({
      set: async (ref, value) => { written.push({ ref, value }) },
      unset: async () => {},
    }),
  }, 'MIMO_API_KEY', 'sk-good-1234')
  assert.equal(ok.ok, true)
  assert.equal(ok.ref, 'MIMO_API_KEY')
  assert.equal(JSON.stringify(ok).includes('sk-good-1234'), false)
  assert.deepEqual(written, [{ ref: 'MIMO_API_KEY', value: 'sk-good-1234' }])

  const failed = await setSecret({
    get: () => ({
      set: async (ref, value) => { throw new Error(`拒绝写入 ${value}`) },
      unset: async () => {},
    }),
  }, 'MIMO_API_KEY', 'sk-bad-9876')
  assert.equal(failed.ok, false)
  assert.equal(JSON.stringify(failed).includes('sk-bad-9876'), false)
  assert.match(failed.reason, /\*\*\*/)
})

test('空密钥被本地拦下（宿主会拒绝空字符串），提示改用「清除」', async () => {
  let called = false
  const result = await setSecret({ get: () => ({ set: async () => { called = true }, unset: async () => {} }) }, 'MIMO_API_KEY', '   ')
  assert.equal(result.ok, false)
  assert.equal(called, false)
  assert.match(result.hint, /清除/)
})

test('discoverCredentials：profile 的 apiKeyEnv + 存储里的 ref 名 + 候选名，只回状态', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-voice-cred-'))
  const previous = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = dir
  try {
    await writeFile(join(dir, 'cordis.patch.yml'), [
      'llm-pi-ai:',
      '  providers:',
      '    xiaomi:',
      '      apiKeyEnv: XIAOMI_TOKEN_PLAN_CN_API_KEY',
      '    minimax:',
      '      apiKeyEnv: MINIMAX_M_PLAN_API_KEY',
    ].join('\n'), 'utf8')
    const ctx = {
      get: () => ({
        describe: async ref => ({
          configured: ref === 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
          source: 'credentials',
          writable: true,
        }),
        listRecords: async () => [{ ref: 'STORE_ONLY_KEY' }, { ref: 'MIMO_API_KEY' }],
      }),
    }
    const rows = await discoverCredentials(ctx)
    const byRef = Object.fromEntries(rows.map(row => [row.ref, row]))
    assert.equal(byRef.XIAOMI_TOKEN_PLAN_CN_API_KEY.configured, true)
    assert.equal(byRef.XIAOMI_TOKEN_PLAN_CN_API_KEY.source, 'host')
    assert.equal(byRef.MINIMAX_M_PLAN_API_KEY.configured, false)
    assert.ok('STORE_ONLY_KEY' in byRef, '宿主存储里登记的 ref 名也要被发现')
    assert.ok('OPENAI_API_KEY' in byRef, '常见候选名是最后的兜底')
    assert.equal(JSON.stringify(rows).includes('value'), false)
    // 已配置的排前面，用户打开下拉先看到现成的。
    assert.equal(rows[0].configured, true)
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    await rm(dir, { recursive: true, force: true })
  }
})

test('profile 读不到时只用候选名，不抛', async () => {
  const previous = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = join(tmpdir(), `dsh-missing-profile-${Date.now()}`)
  try {
    const rows = await discoverCredentials({ get: () => undefined })
    assert.ok(rows.length > 0)
    assert.ok(rows.some(row => row.ref === 'OPENAI_API_KEY'))
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
  }
})

// ── 预设表：设置页的唯一真源 ─────────────────────────────────────────────

test('预设表带 notes/keyless；MiniMax 有国内站与大陆站；DashScope 走 WebSocket 而非 HTTP 中转', () => {
  const presets = voicePresets()
  const tts = presets.filter(preset => preset.kind === 'tts')
  const asr = presets.filter(preset => preset.kind === 'asr')
  for (const preset of presets) {
    assert.equal(typeof preset.notes, 'string')
    assert.equal(typeof preset.keyless, 'boolean')
    assert.equal(typeof preset.id, 'string')
  }
  const ttsIds = tts.map(preset => preset.id)
  assert.ok(ttsIds.includes('mimo'))
  assert.ok(ttsIds.includes('minimax'))
  assert.ok(ttsIds.includes('minimax-cn'))
  assert.ok(ttsIds.includes('baidu') && ttsIds.includes('edge'))
  // Qwen/CosyVoice 非实时合成走 api-ws WebSocket（不是 compatible-mode HTTP 中转），应当提供。
  assert.ok(ttsIds.includes('dashscope'), 'DashScope tts_v2 WebSocket 通道可用，别把它和 HTTP 中转混为一谈')
  const dashscope = tts.find(preset => preset.id === 'dashscope')
  assert.equal(dashscope.protocol, 'dashscope')
  assert.match(dashscope.baseUrl, /^wss:\/\/.+\/api-ws\/v1\/inference$/)
  assert.equal(dashscope.keyless, false)
  assert.ok(voicesFor(dashscope.model).voices.some(v => v.id === dashscope.voice), '预设默认音色必须对默认模型合法（否则开箱即撞 411）')
  assert.ok(tts.find(preset => preset.id === 'minimax-cn').baseUrl.includes('api.minimax.cn'))
  const asrIds = asr.map(preset => preset.id)
  assert.ok(asrIds.includes('openai') && asrIds.includes('openai-custom'))
  assert.ok(asr.find(preset => preset.id === 'openai').baseUrl.endsWith('/v1'))
})

test('MiniMax 的业务错误码与 status_msg 原样带回（2056 = 用量上限）', async () => {
  const result = await withFetch(async () => new Response(JSON.stringify({
    base_resp: { status_code: 2056, status_msg: '已达到 Token Plan 用量上限：请升级套餐或购买积分。' },
  }), { status: 200 }), () => synthesizeWithMinimax({
    baseUrl: 'https://api.minimax.cn', apiKey: 'sk', model: 'speech-02-hd', voice: '', format: 'mp3', rate: 1, text: '你好',
  }))
  assert.equal(result.ok, false)
  assert.match(result.reason, /2056/)
  assert.match(result.reason, /用量上限/)
  assert.equal(typeof result.hint, 'string')
  assert.ok(result.hint.length > 0)
})

test('MiniMax 的 GroupId 走查询参数，空则不带；也认 MINIMAX_GROUP_ID', () => {
  assert.equal(minimaxEndpointFor('https://api.minimax.cn', ''), 'https://api.minimax.cn/v1/t2a_v2')
  assert.match(minimaxEndpointFor('https://api.minimax.cn', '12345'), /\/v1\/t2a_v2\?GroupId=12345$/)
  const previous = process.env.MINIMAX_GROUP_ID
  process.env.MINIMAX_GROUP_ID = 'env-group'
  try {
    assert.equal(resolveGroupId(''), 'env-group')
    assert.equal(resolveGroupId('explicit'), 'explicit')
  } finally {
    if (previous === undefined) delete process.env.MINIMAX_GROUP_ID
    else process.env.MINIMAX_GROUP_ID = previous
  }
})

test('合成失败时，网关回显的密钥会被擦掉（响应里不能出现值）', async () => {
  const previous = process.env.MIMO_API_KEY
  process.env.MIMO_API_KEY = 'sk-leak-voice-777'
  try {
    const result = await withFetch(async () => new Response(JSON.stringify({
      base_resp: { status_code: 1004, status_msg: 'invalid key sk-leak-voice-777' },
    }), { status: 200 }), () => synthesize(bare({ ttsProvider: 'mimo' }), { text: '你好' }))
    assert.equal(result.ok, false)
    assert.equal(JSON.stringify(result).includes('sk-leak-voice-777'), false)
    assert.match(result.reason, /\*\*\*/)
  } finally {
    if (previous === undefined) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = previous
  }
})

test('识别失败时，网关回显的密钥会被擦掉，并给出下一步', async () => {
  const previous = process.env.DSH_ASR_LEAK_KEY
  process.env.DSH_ASR_LEAK_KEY = 'sk-asr-leak-555'
  try {
    const service = {
      config: {
        asrProvider: 'openai',
        asrApiKeyEnv: 'DSH_ASR_LEAK_KEY',
        asrBaseUrl: 'https://asr.example.com/v1',
        asrModel: 'whisper-1',
      },
      ctx: { get: () => undefined },
    }
    const result = await withFetch(async () => new Response('unauthorized: sk-asr-leak-555', { status: 401 }), () =>
      transcribeHttp(service, { dataBase64: fakeAudioBase64(), mimeType: 'audio/wav' }))
    assert.equal(result.ok, false)
    assert.equal(JSON.stringify(result).includes('sk-asr-leak-555'), false)
    assert.match(result.hint, /凭据/)
  } finally {
    if (previous === undefined) delete process.env.DSH_ASR_LEAK_KEY
    else process.env.DSH_ASR_LEAK_KEY = previous
  }
})

// ── testVoice：真跑链路，失败也要给链路与下一步 ─────────────────────────

test('testVoice(tts) 的失败路径带出 HTTP 码、链路与下一步，且不泄漏密钥', async () => {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-voice-profile-'))
  const previousProfile = process.env.DSH_PROFILE_DIR
  const previousKey = process.env.MIMO_API_KEY
  process.env.DSH_PROFILE_DIR = profileDir
  process.env.MIMO_API_KEY = 'sk-test-voice-1234'
  try {
    const service = new InterviewService({ config: { ttsProvider: 'mimo' }, ctx: { get: () => undefined } })
    const result = await withFetch(async () => new Response('unauthorized: key sk-test-voice-1234', { status: 401 }), () =>
      service.testVoice({ kind: 'tts' }))
    assert.equal(result.ok, false)
    assert.equal(result.kind, 'tts')
    assert.equal(result.provider, 'mimo')
    assert.match(result.reason, /401/)
    assert.equal(typeof result.ms, 'number')
    assert.equal(typeof result.hint, 'string')
    assert.equal(JSON.stringify(result).includes('sk-test-voice-1234'), false)
  } finally {
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
    if (previousKey === undefined) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = previousKey
    await rm(profileDir, { recursive: true, force: true })
  }
})

test('testVoice(kind=asr) 没有音频时不发请求，直接给出出路', async () => {
  const result = await InterviewService.prototype.testVoice.call({ voice: {} }, { kind: 'asr' })
  assert.equal(result.ok, false)
  assert.equal(result.kind, 'asr')
  assert.deepEqual(result.attempts, [])
  assert.match(result.hint, /录|键盘/)
})

test('testVoice 只认 tts / asr 两种', async () => {
  const result = await InterviewService.prototype.testVoice.call({}, { kind: 'image' })
  assert.equal(result.ok, false)
  assert.match(result.reason, /tts 或 asr/)
})

// ── DashScope tts_v2 WebSocket：协议形状与诚实失败 ─────────────────────────

/** 造一个按脚本回应的假 WebSocket（run-task→task-started；finish-task→音频+task-finished）。 */
function makeFakeWS(script = {}) {
  class FakeWS {
    constructor(url, opts) {
      this.url = url
      this.opts = opts
      this.sent = []
      this.listeners = {}
      this.binaryType = ''
      FakeWS.last = this
      queueMicrotask(() => this._emit('open', {}))
    }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
    _emit(type, ev) { for (const fn of [...(this.listeners[type] ?? [])]) fn(ev) }
    send(raw) {
      const msg = JSON.parse(raw)
      this.sent.push(msg)
      const action = msg.header.action
      if (action === 'run-task') {
        queueMicrotask(() => this._emit('message', { data: JSON.stringify({ header: { event: 'task-started', task_id: msg.header.task_id } }) }))
      } else if (action === 'finish-task') {
        queueMicrotask(() => {
          if (script.failEvent) { this._emit('message', { data: JSON.stringify(script.failEvent) }); return }
          const bytes = script.audio ?? [0x49, 0x44, 0x33]
          this._emit('message', { data: new Uint8Array(bytes).buffer })
          this._emit('message', { data: JSON.stringify({ header: { event: 'task-finished', task_id: msg.header.task_id } }) })
        })
      }
    }
    close() {}
  }
  return FakeWS
}

/** 替换全局 WebSocket 跑一个测试。 */
async function withWebSocket(FakeWS, run) {
  const original = globalThis.WebSocket
  globalThis.WebSocket = FakeWS
  try {
    return await run()
  } finally {
    globalThis.WebSocket = original
  }
}

test('DashScope 走 tts_v2 WebSocket：run-task→continue-task→finish-task，二进制帧拼成音频', async () => {
  const FakeWS = makeFakeWS({ audio: [0x49, 0x44, 0x33, 0x01] })
  const result = await withWebSocket(FakeWS, () => synthesizeWithDashScope({
    baseUrl: 'wss://cn-beijing.maas.qianwenaiapi.com/api-ws/v1/inference',
    apiKey: 'sk-dashscope-test', model: 'qwen-audio-3.0-tts-flash', voice: 'longanfengyue',
    format: 'mp3', rate: 1, text: '请先做一个自我介绍。',
  }))
  assert.equal(result.ok, true)
  assert.equal(result.mimeType, 'audio/mpeg')
  assert.equal(Buffer.from(result.audioBase64, 'base64').toString('hex'), '49443301')
  const ws = FakeWS.last
  assert.equal(ws.opts.headers.Authorization, 'Bearer sk-dashscope-test')
  assert.deepEqual(ws.sent.map(m => m.header.action), ['run-task', 'continue-task', 'finish-task'])
  assert.equal(ws.sent[0].payload.model, 'qwen-audio-3.0-tts-flash')
  assert.equal(ws.sent[0].payload.function, 'SpeechSynthesizer')
  assert.equal(ws.sent[0].payload.parameters.voice, 'longanfengyue')
  assert.equal(ws.sent[0].payload.parameters.format, 'mp3')
  assert.equal(ws.sent[0].header.streaming, 'duplex')
  assert.equal(ws.sent[1].payload.input.text, '请先做一个自我介绍。')
  assert.equal(ws.sent[0].header.task_id, ws.sent[1].header.task_id)
  assert.equal(ws.sent[1].header.task_id, ws.sent[2].header.task_id)
})

test('DashScope 音色留空时按模型取默认音色（不拿预设音色跨模型撞 411）', async () => {
  const FakeWS = makeFakeWS({})
  const result = await withWebSocket(FakeWS, () => synthesizeWithDashScope({
    baseUrl: 'wss://x/api-ws/v1/inference', apiKey: 'sk', model: 'qwen-audio-3.1-tts-flash', voice: '', format: 'wav', rate: 1, text: '你好',
  }))
  assert.equal(result.ok, true)
  assert.equal(result.mimeType, 'audio/wav')
  assert.equal(FakeWS.last.sent[0].payload.parameters.voice, 'longanhuan_v3.1')
  assert.equal(FakeWS.last.sent[0].payload.parameters.format, 'wav')
})

test('DashScope task-failed 带厂商错误码原文，音色错误给出「按模型选音色」的出路', async () => {
  const FakeWS = makeFakeWS({ failEvent: { header: { event: 'task-failed', error_code: 'InvalidParameter', error_message: '[cosyvoice:]Engine error [411]: TTS speak operation failed' } } })
  const result = await withWebSocket(FakeWS, () => synthesizeWithDashScope({
    baseUrl: 'wss://x/api-ws/v1/inference', apiKey: 'sk', model: 'qwen-audio-3.0-tts-flash', voice: 'wrong-voice', format: 'mp3', rate: 1, text: '你好',
  }))
  assert.equal(result.ok, false)
  assert.match(result.reason, /411|InvalidParameter/)
  assert.match(result.hint, /音色/)
})

test('DashScope 端点必须是 wss：填成 HTTP /audio/speech 会被拦下并指路', async () => {
  const result = await synthesizeWithDashScope({
    baseUrl: 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1',
    apiKey: 'sk', model: 'qwen-audio-3.0-tts-flash', voice: 'longanfengyue', format: 'mp3', rate: 1, text: '你好',
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /WebSocket|wss/)
})

test('auto 反推：wss 端点 / qwen-audio 模型 / 千问凭据名都指向 dashscope', () => {
  assert.equal(providerHint({ ttsBaseUrl: 'wss://cn-beijing.maas.qianwenaiapi.com/api-ws/v1/inference' }), 'dashscope')
  assert.equal(providerHint({ ttsModel: 'qwen-audio-3.0-tts-flash' }), 'dashscope')
  assert.equal(providerHint({ ttsModel: 'cosyvoice-v3-flash' }), 'dashscope')
  assert.equal(providerHint({ ttsApiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY' }), 'dashscope')
})

// ── 模型 → 音色对照表 ──────────────────────────────────────────────────────

test('音色表按模型精确匹配；未知模型回落服务商级；都没有则 known=false', () => {
  const byModel = voicesFor('qwen-audio-3.0-tts-flash', 'dashscope')
  assert.equal(byModel.known, true)
  assert.equal(byModel.scope, 'model')
  assert.ok(byModel.voices.some(v => v.id === 'longanfengyue'))
  const byProvider = voicesFor('some-unknown-model', 'openai')
  assert.equal(byProvider.scope, 'provider')
  assert.ok(byProvider.voices.some(v => v.id === 'alloy'))
  const none = voicesFor('totally-unknown', 'minimax')
  assert.equal(none.known, false)
  assert.deepEqual(none.voices, [])
  assert.equal(defaultVoiceForModel('qwen-audio-3.0-tts-flash'), 'longanfengyue')
  assert.equal(defaultVoiceForModel('nope'), '')
  assert.ok(voiceTable().models['qwen-audio-3.0-tts-flash'].length >= 12)
})

test('不同模型的音色组不同（跨模型混用会 411，表必须按模型分开）', () => {
  const a = voicesFor('qwen-audio-3.0-tts-flash').voices.map(v => v.id)
  const b = voicesFor('qwen-audio-3.1-tts-flash').voices.map(v => v.id)
  assert.ok(a.includes('longanfengyue'))
  assert.ok(b.includes('longanfengyue_v3.1'))
  assert.ok(!b.includes('longanfengyue'), '3.1 的音色带 _v3.1 后缀，不能拿 3.0 的裸 id 去撞')
})
