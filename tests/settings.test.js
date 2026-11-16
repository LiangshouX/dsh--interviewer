import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InterviewService } from '../src/host/service.js'
import { readSettings, settingsPath } from '../src/host/paths.js'

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
