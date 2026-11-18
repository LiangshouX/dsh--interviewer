import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveHttpAsr, describeHttpAsr, transcribeHttp, endpointFor, pickProtocol } from '../src/host/voice/http-asr.js'
import { describeAsr, transcribeAudio } from '../src/host/voice/asr.js'
import { providerIds, normalizeProviderId, voicePresets } from '../src/host/voice/presets.js'
import { normalizeSetting, resolveConfig, migrateSettings } from '../src/host/paths.js'

/** A service with no host services at all. */
function bare(config = {}) {
  return { config, ctx: { get: () => undefined } }
}

/** Run `run` with one env var set (or removed), then restore it. */
async function withEnv(name, value, run) {
  const previous = process.env[name]
  process.env[name] = value
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

/** Replace global fetch for one test. */
async function withFetch(fake, run) {
  const original = globalThis.fetch
  globalThis.fetch = fake
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

const AUDIO = Buffer.from('RIFF-fake-wav').toString('base64')

// ── 预设矩阵：三家 × Token Plan / 直连，端点与凭据名成对 ──────────────────

test('Qwen / MiMo / MiniMax 的六个 ASR 预设各自解析出正确协议、端点与模型', async () => {
  const cases = [
    {
      id: 'qwen-token-plan', env: 'QIANWEN_TOKEN_PLAN_API_KEY', protocol: 'dashscope-asr',
      endpoint: 'https://token-plan.maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.0-asr-flash',
    },
    {
      id: 'qwen', env: 'DASHSCOPE_API_KEY', protocol: 'dashscope-asr',
      endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.0-asr-flash',
    },
    {
      id: 'mimo-token-plan', env: 'XIAOMI_TOKEN_PLAN_CN_API_KEY', protocol: 'chat-audio',
      endpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
      model: 'mimo-v2.5-asr',
    },
    {
      id: 'mimo', env: 'MIMO_API_KEY', protocol: 'chat-audio',
      endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
      model: 'mimo-v2.5-asr',
    },
    {
      id: 'minimax-token-plan', env: 'M_PLAN_API_KEY', protocol: 'minimax',
      endpoint: 'https://api.minimax.cn/v1/speech_to_text',
      model: 'asr-1.0',
    },
    {
      id: 'minimax-cn', env: 'MINIMAX_API_KEY', protocol: 'minimax',
      endpoint: 'https://api.minimax.cn/v1/speech_to_text',
      model: 'asr-1.0',
    },
  ]
  for (const item of cases) {
    await withEnv(item.env, 'sk-test', async () => {
      const resolved = await resolveHttpAsr(bare({ asrProvider: item.id }))
      assert.equal(resolved.mode, 'server', `${item.id} 应当走服务端`)
      assert.equal(resolved.protocol, item.protocol, `${item.id} 协议`)
      assert.equal(resolved.endpoint, item.endpoint, `${item.id} 端点`)
      assert.equal(resolved.model, item.model, `${item.id} 模型`)
      // 只认这一家的凭据：别的家的 key 不能顶上来。
      assert.equal(resolved.apiKey, 'sk-test')
    })
  }
})

test('预设供应商锁定端点与模型：配置里残留的旧端点/旧模型不会再把请求带偏', async () => {
  await withEnv('QIANWEN_TOKEN_PLAN_API_KEY', 'sk-test', async () => {
    const resolved = await resolveHttpAsr(bare({
      asrProvider: 'qwen-token-plan',
      // 上一版把用户骗去填 compatible-mode HTTP 中转，这里必须被忽略。
      asrBaseUrl: 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1',
      asrModel: 'qwen3-asr-flash',
    }))
    assert.equal(resolved.mode, 'server')
    assert.equal(resolved.baseUrl, 'https://token-plan.maas.qianwenaiapi.com')
    assert.equal(resolved.model, 'qwen-audio-3.0-asr-flash')
    assert.match(resolved.endpoint, /multimodal-generation\/generation$/)
  })
})

test('auto 按预设顺序挑第一家配了凭据的，并说清用的是哪家', async () => {
  // 只有 MiMo Token Plan 的 key：Qwen 与直连 MiMo 都该让路。
  await withEnv('XIAOMI_TOKEN_PLAN_CN_API_KEY', 'sk-mimo-plan', async () => {
    const resolved = await resolveHttpAsr(bare({ asrProvider: 'auto' }))
    assert.equal(resolved.mode, 'server')
    assert.equal(resolved.provider, 'mimo-token-plan')
    assert.match(resolved.endpoint, /token-plan-cn\.xiaomimimo\.com/)
    const described = await describeAsr(bare({ asrProvider: 'auto' }))
    assert.equal(described.mode, 'server')
    assert.equal(described.server.protocol, 'chat-audio')
    assert.equal(described.server.protocolLabel, 'chat/completions + input_audio')
    assert.equal(described.server.hasCredential, true)
    assert.equal(JSON.stringify(described).includes('sk-mimo-plan'), false, '密钥不许进描述')
  })
})

test('auto 不会把一把明文 key 分发给所有预设供应商', async () => {
  // 上一版的写法：auto 里每个候选都拿 config.asrApiKey 去试，
  // 于是配了 MiMo 的 key 会先拿 Qwen 的端点撞出 401。
  const resolved = await resolveHttpAsr(bare({ asrProvider: 'auto', asrApiKey: 'sk-only-for-custom' }))
  assert.notEqual(resolved.provider, 'qwen-token-plan')
  // 明文 key + 自定义端点仍然认（老配置习惯）。
  const custom = await resolveHttpAsr(bare({
    asrProvider: 'auto',
    asrApiKey: 'sk-custom',
    asrBaseUrl: 'https://api.example.com/v1',
    asrModel: 'whisper-1',
  }))
  assert.equal(custom.mode, 'server')
  assert.equal(custom.protocol, 'openai')
  assert.equal(custom.endpoint, 'https://api.example.com/v1/audio/transcriptions')
})

test('旧 id minimax 仍解析到直连（api.minimax.cn），不会掉回浏览器', async () => {
  assert.equal(normalizeProviderId('asr', 'minimax'), 'minimax-cn')
  assert.equal(normalizeProviderId('tts', 'minimax'), 'minimax-cn')
  await withEnv('MINIMAX_API_KEY', 'sk-test', async () => {
    const resolved = await resolveHttpAsr(bare({ asrProvider: 'minimax' }))
    assert.equal(resolved.mode, 'server')
    assert.match(resolved.endpoint, /^https:\/\/api\.minimax\.cn\/v1\/speech_to_text/)
  })
})

test('新预设进得了白名单：面板保存不会再被枚举拒绝，旧 id 读出来归一', () => {
  for (const id of ['qwen-token-plan', 'qwen', 'mimo-token-plan', 'mimo', 'minimax-token-plan']) {
    assert.equal(normalizeSetting('asrProvider', id).ok, true, `asrProvider 应接受 ${id}`)
  }
  assert.equal(normalizeSetting('ttsProvider', 'dashscope-token-plan').ok, true)
  assert.equal(normalizeSetting('ttsProvider', 'mimo-token-plan').ok, true)
  assert.equal(normalizeSetting('asrProvider', 'minimax').value, 'minimax-cn')
  // 值域与预设表同源：预设表里有几条 id，枚举就认几条。
  assert.deepEqual(
    providerIds('asr').sort(),
    voicePresets().filter(preset => preset.kind === 'asr').map(preset => preset.id).concat(['minimax']).sort(),
  )
  assert.equal(resolveConfig({ asrProvider: 'mimo-token-plan' }).asrProvider, 'mimo-token-plan')
  assert.equal(resolveConfig({ ttsProvider: 'dashscope-token-plan' }).ttsProvider, 'dashscope-token-plan')
  assert.equal(resolveConfig({ asrProvider: 'nonsense' }).asrProvider, 'auto')
})

// ── 旧配置迁移：拆分预设之后，旧端点/凭据名仍指向同一条链路 ────────────────

test('旧设置迁移：Token Plan 的宿主/凭据名归到拆分后的预设，不再拿中转 key 打官方端点', () => {
  const migrated = migrateSettings({
    asrProvider: 'openai-custom',
    asrBaseUrl: 'https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1',
    asrModel: 'qwen3-asr-flash',
    asrEndpoint: '',
    asrApiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY',
    ttsProvider: 'dashscope',
    ttsBaseUrl: 'wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference',
    ttsApiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY',
  })
  assert.equal(migrated.asrProvider, 'qwen-token-plan')
  assert.equal(migrated.asrBaseUrl, '')
  assert.equal(migrated.asrModel, '')
  assert.equal(migrated.ttsProvider, 'dashscope-token-plan')
  assert.equal(migrated.ttsBaseUrl, '')

  const mimo = migrateSettings({ asrProvider: 'auto', asrBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1', asrApiKeyEnv: 'XIAOMI_TOKEN_PLAN_CN_API_KEY', ttsProvider: 'mimo', ttsBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1' })
  assert.equal(mimo.asrProvider, 'mimo-token-plan')
  assert.equal(mimo.ttsProvider, 'mimo-token-plan')

  const direct = migrateSettings({ asrProvider: 'openai-custom', asrBaseUrl: 'https://api.xiaomimimo.com/v1', asrApiKeyEnv: 'MIMO_API_KEY' })
  assert.equal(direct.asrProvider, 'mimo')

  const minimax = migrateSettings({ ttsProvider: 'minimax-cn', ttsApiKeyEnv: 'M_PLAN_API_KEY' })
  assert.equal(minimax.ttsProvider, 'minimax-token-plan')

  // 明确的官方/自定义端点不动。
  const custom = migrateSettings({ asrProvider: 'openai-custom', asrBaseUrl: 'https://api.example.com/v1', asrApiKeyEnv: 'OPENAI_API_KEY' })
  assert.equal(custom.asrProvider, 'openai-custom')
  const official = migrateSettings({ ttsProvider: 'dashscope', ttsBaseUrl: '', ttsApiKeyEnv: 'DASHSCOPE_API_KEY' })
  assert.equal(official.ttsProvider, 'dashscope')
})

// ── 四套协议的请求形状 ───────────────────────────────────────────────────

test('MiMo 的识别是 chat/completions + input_audio，不是 /audio/transcriptions', async () => {
  await withEnv('MIMO_API_KEY', 'sk-mimo', async () => {
    const calls = []
    const result = await withFetch(async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ choices: [{ message: { content: '你好，世界' } }] }), { status: 200 })
    }, () => transcribeHttp(bare({ asrProvider: 'mimo' }), { dataBase64: AUDIO, mimeType: 'audio/wav', language: 'zh' }))

    assert.equal(result.ok, true)
    assert.equal(result.text, '你好，世界')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.xiaomimimo.com/v1/chat/completions')
    assert.equal(calls[0].body.model, 'mimo-v2.5-asr')
    assert.equal(calls[0].body.asr_options.language, 'zh')
    assert.equal(calls[0].body.messages[0].content[0].type, 'input_audio')
    assert.match(calls[0].body.messages[0].content[0].input_audio.data, /^data:audio\/wav;base64,/)
  })
})

test('MiMo 把业务错误放在 200 的响应体里也要如实带出', async () => {
  await withEnv('MIMO_API_KEY', 'sk-mimo', async () => {
    const result = await withFetch(async () => new Response(JSON.stringify({
      error: { message: 'Token Plan 仅支持编程工具调用' },
    }), { status: 200 }), () => transcribeHttp(bare({ asrProvider: 'mimo' }), { dataBase64: AUDIO, mimeType: 'audio/wav' }))
    assert.equal(result.ok, false)
    assert.match(result.reason, /编程工具/)
    assert.equal(typeof result.hint, 'string')
  })
})

test('Qwen 的识别走 DashScope 原生 multimodal-generation，并解析 output.text', async () => {
  await withEnv('QIANWEN_TOKEN_PLAN_API_KEY', 'sk-qwen', async () => {
    const calls = []
    const result = await withFetch(async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({
        request_id: 'r1',
        output: { text: '这是识别结果。', sentence: { text: '这是识别结果。' } },
        usage: { duration: 3 },
      }), { status: 200 })
    }, () => transcribeHttp(bare({ asrProvider: 'qwen-token-plan' }), { dataBase64: AUDIO, mimeType: 'audio/wav', language: 'zh' }))

    assert.equal(result.ok, true)
    assert.equal(result.text, '这是识别结果。')
    assert.equal(calls[0].url, 'https://token-plan.maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation')
    assert.equal(calls[0].body.model, 'qwen-audio-3.0-asr-flash')
    assert.equal(calls[0].body.parameters.format, 'wav')
    assert.deepEqual(calls[0].body.parameters.language_hints, ['zh'])
    assert.match(calls[0].body.input.messages[0].content[0].audio, /^data:audio\/wav;base64,/)
  })
})

test('Qwen 的 200 + code 也要当失败，并把 code 原文带回来', async () => {
  await withEnv('DASHSCOPE_API_KEY', 'sk-qwen', async () => {
    const result = await withFetch(async () => new Response(JSON.stringify({
      request_id: 'r2', code: 'InvalidParameter', message: 'url error',
    }), { status: 200 }), () => transcribeHttp(bare({ asrProvider: 'qwen' }), { dataBase64: AUDIO, mimeType: 'audio/wav' }))
    assert.equal(result.ok, false)
    assert.match(result.reason, /InvalidParameter/)
  })
})

test('MiniMax 的语言走 HTTP 头，端点是 /v1/speech_to_text', async () => {
  await withEnv('M_PLAN_API_KEY', 'sk-mm', async () => {
    const calls = []
    const result = await withFetch(async (url, init) => {
      calls.push({ url, headers: init.headers })
      return new Response(JSON.stringify({ text: '迷你麦识别' }), { status: 200 })
    }, () => transcribeHttp(bare({ asrProvider: 'minimax-token-plan' }), { dataBase64: AUDIO, mimeType: 'audio/wav', language: 'zh' }))

    assert.equal(result.ok, true)
    assert.equal(result.text, '迷你麦识别')
    assert.equal(calls[0].url, 'https://api.minimax.cn/v1/speech_to_text')
    assert.equal(calls[0].headers.language, 'zh')
  })
})

test('401 的出路说清「Token Plan 的 key 只在自己的中转有效」', async () => {
  await withEnv('XIAOMI_TOKEN_PLAN_CN_API_KEY', 'sk-mimo-plan', async () => {
    const result = await withFetch(async () => new Response('{"error":{"message":"invalid api key"}}', { status: 401 }), () =>
      transcribeHttp(bare({ asrProvider: 'mimo-token-plan' }), { dataBase64: AUDIO, mimeType: 'audio/wav' }))
    assert.equal(result.ok, false)
    assert.match(result.hint, /Token Plan/)
    assert.match(result.hint, /401/)
  })
})

test('协商协议：显式名优先，其次按主机/模型猜，认不出的按 OpenAI 兼容', () => {
  assert.equal(pickProtocol('mimo', '', '', ''), 'chat-audio')
  assert.equal(pickProtocol('qwen', '', '', ''), 'dashscope-asr')
  assert.equal(pickProtocol('auto', 'https://api.xiaomimimo.com/v1', '', ''), 'chat-audio')
  assert.equal(pickProtocol('auto', 'https://dashscope.aliyuncs.com', '', ''), 'dashscope-asr')
  assert.equal(pickProtocol('auto', 'https://api.minimax.cn', '', ''), 'minimax')
  assert.equal(pickProtocol('auto', 'https://api.openai.com/v1', '', ''), 'openai')
})

test('端点拼接覆盖四套协议', () => {
  assert.equal(endpointFor('minimax', 'https://api.minimax.cn'), 'https://api.minimax.cn/v1/speech_to_text')
  assert.equal(endpointFor('openai', 'https://api.openai.com/v1'), 'https://api.openai.com/v1/audio/transcriptions')
  assert.equal(endpointFor('chat-audio', 'https://api.xiaomimimo.com/v1'), 'https://api.xiaomimimo.com/v1/chat/completions')
  assert.equal(
    endpointFor('dashscope-asr', 'https://dashscope.aliyuncs.com'),
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  )
})

test('整条链：没有宿主、没有凭据时回落到浏览器，并把每条预设为什么不行说出来', async () => {
  const described = await describeAsr(bare({ asrProvider: 'auto' }))
  assert.equal(described.mode, 'browser')
  assert.match(described.reason, /回落/)
  assert.match(described.reason, /凭据/)
  const result = await transcribeAudio(bare({ asrProvider: 'auto' }), { dataBase64: AUDIO, mimeType: 'audio/wav' })
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'browser')
})
