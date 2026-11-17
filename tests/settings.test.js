import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InterviewService } from '../src/host/service.js'
import { registerApi } from '../src/host/api.js'
import { readSettings, settingsPath, normalizeSetting } from '../src/host/paths.js'
import { CameraService } from '../src/host/camera.js'

/** 临时 profile 目录 + 临时数据根 */
async function withEnv(run) {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-settings-profile-'))
  const root = await mkdtemp(join(tmpdir(), 'dsh-settings-root-'))
  const previous = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profileDir
  try {
    return await run({ profileDir, root })
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    await rm(profileDir, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
  }
}

test('设置只写白名单键，其余丢弃', async () => {
  await withEnv(async ({ profileDir, root }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const result = await service.updateSettings({
      ffmpegPath: 'D:/tools/ffmpeg.exe',
      chromiumPath: 'D:/tools/chrome.exe',
      guardQuiet: true,
      somethingElse: 'nope',
    })
    assert.equal(result.applied.ffmpegPath, 'D:/tools/ffmpeg.exe')
    assert.equal(result.applied.guardQuiet, true)
    assert.equal('somethingElse' in result.applied, false)
    const settings = await readSettings()
    assert.equal(settings.ffmpegPath, 'D:/tools/ffmpeg.exe')
    assert.equal(settings.guardQuiet, true)
    assert.equal('somethingElse' in settings, false)
    assert.equal(settingsPath(), join(profileDir, 'dsh-realtime-interview.json'))
  })
})

test('配置文件里写死的工作区根拒绝面板覆盖，并且说明原因', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const result = await service.updateSettings({ workspaceRoot: 'D:/somewhere/else' })
    assert.equal('workspaceRoot' in result.applied, false)
    assert.equal(result.ignored.length, 1)
    assert.match(result.ignored[0].reason, /配置文件/)
  })
})

test('设置快照说清楚：设置文件、数据根、后端、模型目录、产物清单', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const session = await service.createSession({ title: '快照测试', resumeText: '简历' })
    await service.appendTurn(session.id, { role: 'candidate', text: '你好' })
    await service.saveReport(session.id, '# 报告')

    const snapshot = await service.settingsSnapshot(session.id)
    assert.equal(snapshot.settingsFile, settingsPath())
    assert.equal(snapshot.dataRoot.path, root)
    assert.match(snapshot.dataRoot.reason, /.+/)
    assert.equal(typeof snapshot.backends.ffmpeg.found, 'boolean')
    assert.equal(typeof snapshot.backends.chromium.found, 'boolean')
    assert.match(snapshot.speechModel.dir, /speech-to-text/)
    assert.equal(snapshot.session.id, session.id)
    const names = snapshot.session.artifacts.map(item => item.name)
    assert.ok(names.includes('session.json'))
    assert.ok(names.includes('resume.txt'))
    assert.ok(names.includes('transcript.jsonl'))
    assert.ok(names.includes('report.md'))
    assert.equal(typeof snapshot.voice.asr.mode, 'string')
  })
})

test('语音配置的有效值：配置文件显式值优先，其次面板设置', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    await service.updateSettings({ ttsProvider: 'browser', ttsModel: 'x-tts' })
    const merged = await service.voiceConfig()
    assert.equal(merged.ttsProvider, 'browser', '面板设置应该覆盖 auto 默认值')
    assert.equal(merged.ttsModel, 'x-tts')

    const pinned = new InterviewService({ config: { workspaceRoot: root, ttsProvider: 'none' }, ctx: { get: () => undefined } })
    const pinnedMerged = await pinned.voiceConfig()
    assert.equal(pinnedMerged.ttsProvider, 'none', '配置文件显式值必须赢过面板设置')
  })
})

test('坏掉的设置文件不影响启动，只是"没有设置"', async () => {
  await withEnv(async ({ profileDir, root }) => {
    await writeFile(join(profileDir, 'dsh-realtime-interview.json'), '{ not json', 'utf8')
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const settings = await readSettings()
    assert.deepEqual(settings, {})
    const snapshot = await service.settingsSnapshot()
    assert.equal(snapshot.dataRoot.path, root)
  })
})


test('设置值按规格校验：枚举/范围/类型不对就拒绝并说明原因', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const result = await service.updateSettings({
      ttsProvider: 'not-a-provider',
      ttsRate: 9,
      recordVideo: 'yes',
      cameraBackend: 'chromium-mf',
      asrLanguage: 'en',
    })
    assert.equal('ttsProvider' in result.applied, false)
    assert.equal('ttsRate' in result.applied, false)
    assert.equal('recordVideo' in result.applied, false)
    assert.equal(result.applied.cameraBackend, 'chromium-mf')
    assert.equal(result.applied.asrLanguage, 'en')
    assert.equal(result.invalid.length, 3)
    assert.match(result.invalid.map(item => item.reason).join(' '), /只能是|必须/)
  })
})

test('校验函数单独可用：normalizeSetting', () => {
  assert.deepEqual(normalizeSetting('ttsRate', 1.25), { ok: true, value: 1.25 })
  assert.equal(normalizeSetting('ttsRate', 5).ok, false)
  assert.equal(normalizeSetting('ttsProvider', 'OPENAI').ok, true)
  assert.deepEqual(normalizeSetting('ttsProvider', 'OPENAI'), { ok: true, value: 'openai' })
  assert.equal(normalizeSetting('unknownKey', 1).ok, false)
})

test('有效配置：配置文件显式值优先，面板设置补缺，数据根不混进来', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({
      config: { workspaceRoot: root, ttsProvider: 'none' },
      ctx: { get: () => undefined },
    })
    await service.updateSettings({ ttsProvider: 'browser', ttsModel: 'x-tts', cameraBackend: 'chromium-mf' })
    const effective = await service.effectiveConfig()
    assert.equal(effective.ttsProvider, 'none', '显式写过的配置文件值必须赢')
    assert.equal(effective.ttsModel, 'x-tts', '配置没写过的键由面板补上')
    assert.equal(effective.cameraBackend, 'chromium-mf')
    assert.equal(Object.hasOwn(effective, 'workspaceRoot'), true)
    const snapshot = await service.settingsSnapshot()
    assert.deepEqual(snapshot.explicit.sort(), ['ttsProvider', 'workspaceRoot'].sort())
  })
})

test('摄像头后端偏好：ffmpeg 模式不回落，chromium-mf 模式浏览器优先', async () => {
  const calls = []
  const camera = new CameraService({})
  camera.startFfmpeg = async () => { calls.push('ffmpeg'); return { ok: false, error: 'ffmpeg 不行' } }
  camera.startBrowser = async () => { calls.push('browser'); return { ok: true, backend: 'chromium-mf', device: { name: 'browser' } } }

  camera.backendPreference = 'ffmpeg'
  const pinned = await camera.start()
  assert.equal(pinned.ok, false)
  assert.deepEqual(calls, ['ffmpeg'])

  calls.length = 0
  const camera2 = new CameraService({})
  camera2.startFfmpeg = async () => { calls.push('ffmpeg'); return { ok: true, device: { name: 'ffmpeg' } } }
  camera2.startBrowser = async () => { calls.push('browser'); return { ok: true, backend: 'chromium-mf', device: { name: 'browser' } } }
  camera2.backendPreference = 'chromium-mf'
  const preferred = await camera2.start()
  assert.equal(preferred.backend, 'chromium-mf')
  assert.deepEqual(calls, ['browser'])
})


test('删除一场面试：目录真的没了；进行中的拒绝删', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const session = await service.createSession({ title: '待删除' })
    const dir = await service.sessionDir(session.id)
    assert.equal(await service.deleteSession(session.id).then(r => r.ok), true)
    assert.deepEqual(await service.listSessions(), [])
    await assert.rejects(() => stat(dir))

    const running = await service.createSession({ title: '进行中' })
    await service.updateSession(running.id, { status: 'running' })
    const refused = await service.deleteSession(running.id)
    assert.equal(refused.ok, false)
    assert.match(refused.error, /正在进行/)
    assert.equal((await service.listSessions()).length, 1)
  })
})

test('空场次清理：只删没有内容的，有简历/转录的不动', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    await service.createSession({ title: '误触 1' })
    await service.createSession({ title: '误触 2' })
    const real = await service.createSession({ title: '有简历', resumeText: '这里是简历正文' })
    const empty = await service.listEmptySessions()
    assert.equal(empty.length, 2)
    const purge = await service.purgeEmptySessions()
    assert.equal(purge.removed.length, 2)
    const rows = await service.listSessions()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, real.id)
  })
})

// ── 语音配置闭环：凭据发现 / 写入 / 清除 / 测试 ────────────────────────────

/**
 * 把 API 挂到一个假宿主上，然后发请求。
 *
 * 与 api.test.js 里那个同构：这里只关心语音那几条新路由，
 * 以及「响应里不能出现密钥」。
 */
async function makeApi(service) {
  let handler
  const ctx = {
    effect(fn) {
      const dispose = fn()
      return dispose
    },
    webServer: {
      register(spec) {
        handler = spec.handler
        return () => {}
      },
    },
  }
  registerApi(ctx, service)
  return async (method, path, body) => {
    const req = {
      method,
      url: path,
      headers: { host: '127.0.0.1:45678' },
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
      },
    }
    let status = 0
    let payload = ''
    const res = {
      writeHead(code) { status = code; return res },
      end(chunk) { if (chunk !== undefined) payload = String(chunk); return res },
    }
    await handler(req, res)
    return { status, body: payload === '' ? undefined : JSON.parse(payload) }
  }
}

test('语音凭据发现：profile 的 apiKeyEnv 会进清单，只有状态没有值', async () => {
  await withEnv(async ({ profileDir, root }) => {
    await writeFile(join(profileDir, 'cordis.patch.yml'), [
      'llm-pi-ai:',
      '  providers:',
      '    xiaomi:',
      '      apiKeyEnv: XIAOMI_TOKEN_PLAN_CN_API_KEY',
    ].join('\n'), 'utf8')
    const ctx = {
      get: name => name !== 'credentials' ? undefined : {
        describe: async ref => ({ configured: ref === 'XIAOMI_TOKEN_PLAN_CN_API_KEY', source: 'credentials', writable: true }),
        set: async () => {},
        unset: async () => {},
      },
    }
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx })
    const rows = await service.voiceCredentials()
    const found = rows.find(row => row.ref === 'XIAOMI_TOKEN_PLAN_CN_API_KEY')
    assert.equal(found.configured, true)
    assert.equal(found.source, 'host')
    assert.ok(rows.some(row => row.ref === 'OPENAI_API_KEY'), '候选名是兜底')
    assert.equal(JSON.stringify(rows).includes('"value"'), false)

    const snapshot = await service.settingsSnapshot()
    assert.ok(Array.isArray(snapshot.credentials))
    assert.ok(Array.isArray(snapshot.presets) && snapshot.presets.length > 0)
    assert.ok(snapshot.presets.every(preset => typeof preset.notes === 'string'))
  })
})

test('写凭据只进宿主 credentials；返回里没有密钥；清除走 unset', async () => {
  await withEnv(async ({ root }) => {
    const calls = []
    const ctx = {
      get: name => name !== 'credentials' ? undefined : {
        set: async (ref, value) => { calls.push(['set', ref, value]) },
        unset: async ref => { calls.push(['unset', ref]) },
        describe: async () => ({ configured: true, source: 'credentials', writable: true }),
      },
    }
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx })
    const written = await service.setVoiceCredential('MIMO_API_KEY', 'sk-hidden-1234')
    assert.equal(written.ok, true)
    assert.equal(JSON.stringify(written).includes('sk-hidden-1234'), false)
    assert.deepEqual(calls[0], ['set', 'MIMO_API_KEY', 'sk-hidden-1234'])

    const cleared = await service.clearVoiceCredential('MIMO_API_KEY')
    assert.equal(cleared.ok, true)
    assert.deepEqual(calls[1], ['unset', 'MIMO_API_KEY'])

    // 插件设置文件里不能出现密钥（密钥只存宿主那份）。
    const settings = await readSettings()
    assert.equal(JSON.stringify(settings).includes('sk-hidden-1234'), false)
  })
})

test('没有 credentials seam：写密钥返回失败与出路，设置文件一个字节都不写', async () => {
  await withEnv(async ({ root, profileDir }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const result = await service.setVoiceCredential('MIMO_API_KEY', 'sk-hidden-5678')
    assert.equal(result.ok, false)
    assert.match(result.hint, /环境变量/)
    assert.match(result.hint, /重启 DSH/)
    assert.deepEqual(await readSettings(), {})
    assert.equal(existsSync(join(profileDir, 'dsh-realtime-interview.json')), false)
  })
})

test('设置快照不泄漏配置文件里的明文 key', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({
      config: {
        workspaceRoot: root,
        asrApiKey: 'sk-config-asr-secret-111',
        ttsApiKey: 'sk-config-tts-secret-222',
        ttsProvider: 'mimo',
      },
      ctx: { get: () => undefined },
    })
    const snapshot = await service.settingsSnapshot()
    const json = JSON.stringify(snapshot)
    assert.equal(json.includes('sk-config-asr-secret-111'), false, 'settings 快照不能带回明文 key')
    assert.equal(json.includes('sk-config-tts-secret-222'), false, 'settings 快照不能带回明文 key')
    // 有效配置里仍然保留 provider/模型这些非密钥字段（面板要显示"现在用"）。
    assert.equal(typeof snapshot.effective.ttsProvider, 'string')
  })
})

test('语音路由：presets / credentials / set / clear 都通，响应里 grep 不到密钥', async () => {
  await withEnv(async ({ root }) => {
    const store = new Map()
    const ctx = {
      get: name => name !== 'credentials' ? undefined : {
        describe: async ref => ({ configured: store.has(ref), source: 'credentials', writable: true }),
        set: async (ref, value) => { store.set(ref, value) },
        unset: async ref => { store.delete(ref) },
      },
    }
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx })
    const call = await makeApi(service)

    const presets = await call('GET', '/interviewer/api/voice/presets')
    assert.equal(presets.status, 200)
    assert.ok(presets.body.data.presets.length > 0)
    assert.ok(presets.body.data.presets.every(preset => typeof preset.keyless === 'boolean'))

    const listed = await call('GET', '/interviewer/api/voice/credentials')
    assert.ok(Array.isArray(listed.body.data.credentials))

    const secret = 'sk-route-secret-4321'
    const set = await call('POST', '/interviewer/api/voice/credentials', {
      action: 'set', ref: 'MIMO_API_KEY', value: secret,
    })
    assert.equal(set.body.data.ok, true)
    assert.equal(JSON.stringify(set.body).includes(secret), false)
    assert.equal(store.get('MIMO_API_KEY'), secret, '值应该真的写进宿主存储')

    const cleared = await call('POST', '/interviewer/api/voice/credentials', {
      action: 'clear', ref: 'MIMO_API_KEY',
    })
    assert.equal(cleared.body.data.ok, true)
    assert.equal(store.has('MIMO_API_KEY'), false)

    const badAction = await call('POST', '/interviewer/api/voice/credentials', { action: 'wat', ref: 'MIMO_API_KEY' })
    assert.equal(badAction.status, 400)

    const badKind = await call('POST', '/interviewer/api/voice/test', { kind: 'image' })
    assert.equal(badKind.status, 200)
    assert.equal(badKind.body.data.ok, false)
    assert.match(badKind.body.data.reason, /tts 或 asr/)
  })
})
