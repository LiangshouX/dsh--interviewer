/**
 * bug2 回归：面板语音设置必须能生效。
 *
 * 根因：发版补丁 cordis.patch.yml 为了「整体替换 config 时字段不丢」restated 了
 * 所有默认值，旧逻辑把「键存在」当「用户显式写死」，于是面板设置被这些默认值永远
 * 顶掉（用户改了播报服务却仍跑 auto→百度）。修复后：只有**值不同于发版默认**的键
 * 才算显式（见 paths.js BUNDLE_DEFAULTS / isBundleDefault）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InterviewService } from '../src/host/service.js'
import { BUNDLE_DEFAULTS, isBundleDefault, normalizeSetting } from '../src/host/paths.js'

/** 在隔离的 profile 目录里跑（设置文件读写都落这里，不碰真机）。 */
async function withProfile(run) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-config-priority-'))
  const previous = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = dir
  try {
    return await run(dir)
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    await rm(dir, { recursive: true, force: true })
  }
}

const bareCtx = { get: () => undefined }

test('发版默认值不算「显式写死」：isBundleDefault 认得 auto/mp3/1.0 这些 restated 默认', () => {
  assert.equal(isBundleDefault('ttsProvider', 'auto'), true)
  assert.equal(isBundleDefault('ttsFormat', 'mp3'), true)
  assert.equal(isBundleDefault('ttsRate', 1.0), true)
  assert.equal(isBundleDefault('asrApiKeyEnv', ''), true, '凭据名默认留空，由所选预设决定')
  assert.equal(isBundleDefault('asrApiKeyEnv', 'MINIMAX_API_KEY'), false)
  // 用户真正改过的值 ≠ 默认 → 不是默认。
  assert.equal(isBundleDefault('ttsProvider', 'dashscope'), false)
  assert.equal(isBundleDefault('ttsProvider', 'openai'), false)
  // 不在发版默认表里的键 → 视为用户额外写的（不是默认）。
  assert.equal(isBundleDefault('someUnknownKey', 'x'), false)
})

test('面板设置能压过发版补丁的默认值（bug2 核心回归）', async () => {
  await withProfile(async () => {
    // 模拟宿主把发版补丁的 config 原样交给插件（每个键都在，都是默认值）。
    const service = new InterviewService({ config: { ...BUNDLE_DEFAULTS }, ctx: bareCtx })
    assert.equal(service.explicitKeys.has('ttsProvider'), false, '默认值不该被当成显式写死')
    assert.equal(service.explicitKeys.size, 0, '纯发版默认 config 下没有任何显式键')

    await service.updateSettings({ ttsProvider: 'dashscope', ttsModel: 'qwen-audio-3.0-tts-flash', ttsVoice: 'longanfengyue' })
    const effective = await service.effectiveConfig()
    assert.equal(effective.ttsProvider, 'dashscope', '面板选的服务必须生效，而不是仍跑 auto')
    assert.equal(effective.ttsModel, 'qwen-audio-3.0-tts-flash')
    assert.equal(effective.ttsVoice, 'longanfengyue')
  })
})

test('用户在配置里显式写过的键（值不同于发版默认）仍压过面板', async () => {
  await withProfile(async () => {
    const service = new InterviewService({ config: { ...BUNDLE_DEFAULTS, ttsProvider: 'mimo' }, ctx: bareCtx })
    assert.equal(service.explicitKeys.has('ttsProvider'), true, 'mimo ≠ 默认 auto → 显式')
    await service.updateSettings({ ttsProvider: 'dashscope' })
    const effective = await service.effectiveConfig()
    assert.equal(effective.ttsProvider, 'mimo', '配置文件显式写死的键优先于面板（语义保留）')
  })
})

test('设置快照里的 explicit 列表不再把发版默认键误报为「锁定」', async () => {
  await withProfile(async () => {
    const service = new InterviewService({ config: { ...BUNDLE_DEFAULTS }, ctx: bareCtx })
    const snapshot = await service.settingsSnapshot()
    assert.deepEqual(snapshot.explicit, [], '纯默认 config 下没有锁定键，面板不该显示假锁定')
    assert.ok(snapshot.voices.models['qwen-audio-3.0-tts-flash'], '快照应带模型-音色表')
  })
})

test('ttsFormat 白名单仍只认 mp3/wav（bug1 在客户端去掉空选项，服务端规格不变）', () => {
  assert.equal(normalizeSetting('ttsFormat', '').ok, false)
  assert.equal(normalizeSetting('ttsFormat', 'mp3').ok, true)
  assert.equal(normalizeSetting('ttsFormat', 'wav').ok, true)
  assert.equal(normalizeSetting('ttsProvider', 'dashscope').ok, true, 'dashscope 已进 ttsProvider 枚举')
})
