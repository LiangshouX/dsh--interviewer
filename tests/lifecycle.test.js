/**
 * 生命周期：重置 / 续接 / 批量清理，以及「助手会话严格寻址」。
 *
 * 这四条都对应真机撞到过的问题（AGENTS §6.14 / §6.15）：
 *
 *  - 误触「开始面试」再停掉，留下几条脏 system 行与假的计时，删不掉也盖不住；
 *  - 面试中途结束，数据还没分析完却回不到那一轮；
 *  - 新岗位拉 JD 时请求被发到**另一场**面试的对话里（继承全局面包屑）；
 *  - 助手会话来路说不清：哪个对话、什么时候重建的、最近发到哪儿。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InterviewService } from '../src/host/service.js'

async function withEnv(run) {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-life-profile-'))
  const root = await mkdtemp(join(tmpdir(), 'dsh-life-root-'))
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

/** 假的宿主 sessionController：记录每一次 create / prompt，`state()` 可配。 */
function makeController(options = {}) {
  const log = { creates: [], prompts: [] }
  const controller = {
    async create(request) {
      log.creates.push(request)
      return { sessionId: `host-session-${log.creates.length}` }
    },
    async prompt(request) {
      log.prompts.push(request)
      if (typeof options.promptError === 'function') {
        const error = options.promptError(request, log)
        if (error !== undefined) throw error
      }
      return { accepted: true }
    },
    async list() {
      return { items: [] }
    },
  }
  if (options.state !== false) {
    controller.state = async () => options.hostState ?? { running: true, queue: [] }
  }
  if (options.onStateError !== undefined) {
    controller.state = async () => { throw options.onStateError }
  }
  return { controller, log }
}

function makeService(root, controller) {
  return new InterviewService({
    config: { workspaceRoot: root },
    ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
  })
}

/** 造一场「已经面过一会儿」的面试：转录 + 报告 + 计时 + 问过标记 + 录音。 */
async function seedInterview(service, session) {
  await service.setResume(session.id, '简历正文：八年后端。')
  await service.setJd(session.id, { text: '岗位职责：做后端。', url: 'https://jobs.example.com/1' })
  // 准备阶段真的派过一次活（于是 prepare 角色也有一个助手会话）。
  await service.requestAgentChecklist(session.id)
  await service.saveChecklist(session.id, [
    { topic: '分布式事务', why: 'JD 要求', level: 'core' },
    { topic: '线上故障排查', why: '简历经历', level: 'deep' },
  ])
  const checklist = await service.getChecklist(session.id)
  await service.mutateChecklist(session.id, {
    op: 'probe',
    id: checklist.items[0].id,
    note: '答得不错',
  })
  await service.startSession(session.id)
  await service.lastDispatch
  await service.appendTurn(session.id, { role: 'interviewer', text: '先自我介绍一下。' })
  await service.appendTurn(session.id, { role: 'candidate', text: '我叫张三，做了八年后端。', meta: { source: 'panel' } })
  await service.lastDispatch
  // 暂停一次再继续：转录里会多两条 system 行——重置必须把它们一起清掉。
  await service.pauseSession(session.id)
  await service.resumeSession(session.id)
  await service.lastDispatch
  await service.saveReport(session.id, '# 报告\n\n内容')
  await mkdir(join(session.dir, 'recordings'), { recursive: true })
  await writeFile(join(session.dir, 'recordings', 'clip.webm'), Buffer.from('fake-video'))
  return service.getSession(session.id)
}

// ── 重置 ────────────────────────────────────────────────────────────────────

test('重置（彻底）：清掉转录/报告/计时/录音/问过标记，材料与底稿本身留着', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const created = await service.createSession({ title: '误触场' })
    const session = await seedInterview(service, created)

    const result = await service.resetSession(session.id)
    assert.equal(result.ok, true)
    assert.equal(result.mode, 'purge')
    assert.equal(result.cleared.turns, 4, '4 条转录（含 system 行）都清掉')
    assert.equal(result.cleared.interviewTurns, 2)
    assert.equal(result.cleared.report, true)
    assert.equal(result.cleared.checklistProbed, 1)
    assert.equal(result.cleared.recordings, 1, '彻底模式连录音一起删')
    assert.equal(result.cleared.hostSessionsDetached, 2, '两个角色的助手会话都要解绑')

    const after = await service.getState(session.id)
    assert.equal(after.session.status, 'draft', '回到「还没开始」')
    assert.equal(after.transcript.length, 0, '转录清空')
    assert.equal(after.report, '', '报告清空')
    assert.equal(after.stats.asked, 0)
    assert.equal(after.stats.durationMs, 0, '计时归零')
    assert.equal(after.stats.checklistProbed, 0, '「问过」标记清掉')
    assert.equal(after.stats.checklistTotal, 2, '考点本身留着')
    assert.equal(after.checklist.adjustments.length, 0, '调整记录清掉')
    assert.equal(after.documents.jdChars > 0, true, 'JD 留着')
    assert.equal(after.documents.resumeChars > 0, true, '简历留着')
    assert.equal(after.recordings.length, 0, '彻底模式不留录音')
    assert.equal(after.session.agents.prepare.sessionId, '', '准备会话解绑')
    assert.equal(after.session.agents.live.sessionId, '', '面试会话解绑')

    // 再开始一场时用的是**新的**助手会话，不会接着旧对话里那轮上下文说。
    const before = log.creates.length
    await service.startSession(session.id)
    await service.lastDispatch
    assert.equal(log.creates.length, before + 1, '重置后重新开始要建新会话')
    assert.notEqual(log.prompts[log.prompts.length - 1].sessionId, 'host-session-1')
  })
})

test('重置（留副本）：转录/报告/录像搬进 archive，工作区里留一份可查的副本', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const created = await service.createSession({ title: '留副本场' })
    const session = await seedInterview(service, created)

    const result = await service.resetSession(session.id, { mode: 'archive' })
    assert.equal(result.mode, 'archive')
    assert.equal(typeof result.archivedTo, 'string')
    assert.match(result.archivedTo, /[\\/]archive[\\/]/)
    assert.equal(result.archive.turns, 4)
    assert.equal(result.archive.recordings.length, 1)

    // 副本里有这三样：转录、报告、录像；还有一份 archive.json 说明这是谁。
    const files = await readdir(result.archivedTo)
    assert.ok(files.includes('transcript.jsonl'))
    assert.ok(files.includes('report.md'))
    assert.ok(files.includes('archive.json'))
    assert.ok(files.includes('recordings'))
    const info = JSON.parse(await readFile(join(result.archivedTo, 'archive.json'), 'utf8'))
    assert.equal(info.title, '留副本场')

    // 这一场本身是干净的：转录 / 报告 / 录音都不在了。
    const after = await service.getState(session.id)
    assert.equal(after.transcript.length, 0)
    assert.equal(after.report, '')
    assert.equal(after.recordings.length, 0)
    assert.equal(after.stats.checklistTotal, 2, '底稿留着')

    // 归档列表能查到它（记录清理弹层里给用户看）。
    const archives = await service.listArchives()
    assert.equal(archives.length, 1)
    assert.equal(archives[0].title, '留副本场')
    assert.equal(archives[0].recordings.length, 1)
  })
})

// ── 续接 ────────────────────────────────────────────────────────────────────

test('续接：done → running，中断时长记进 pausedMs，不算面试时长', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const created = await service.createSession({ title: '中途掐断' })
    const session = await seedInterview(service, created)

    // 这一轮面了 10 分钟然后被结束；结束到现在过了 30 分钟。
    const startedAt = Date.now() - 40 * 60 * 1000
    await service.updateSession(session.id, {
      status: 'done',
      startedAt,
      endedAt: startedAt + 10 * 60 * 1000,
      pausedMs: 0,
    })

    const continued = await service.continueSession(session.id)
    assert.equal(continued.status, 'running')
    assert.equal(continued.endedAt, 0, '结束标记要清掉')
    assert.ok(continued.pausedMs >= 29 * 60 * 1000, '中断的 30 分钟记进 pausedMs')

    const state = await service.getState(session.id)
    // 面试时长仍然只有真正在面的 10 分钟——中断的 30 分钟不是面试时间。
    assert.ok(
      Math.abs(state.stats.durationMs - 10 * 60 * 1000) < 5000,
      `durationMs 应约等于 10 分钟，实际 ${state.stats.durationMs}`,
    )

    // 转录里有一条续接留痕，报告时间线看得到「什么时候断过」。
    assert.match(state.transcript[state.transcript.length - 1].text, /面试续接/)
    // 派活的 prompt 要明说「接着中断处」，不许重新开场。
    const prompt = log.prompts[log.prompts.length - 1].content[0].text
    assert.match(prompt, /续接/)
    assert.match(prompt, /不要重新开场/)
  })
})

test('续接只认 done：draft / running / paused 一律拒绝（各有各的入口）', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '各阶段' })

    await assert.rejects(() => service.continueSession(session.id), /只有已结束的面试能续接/)
    await service.startSession(session.id)
    await service.lastDispatch
    await assert.rejects(() => service.continueSession(session.id), /只有已结束的面试能续接/)
    await service.pauseSession(session.id)
    await assert.rejects(() => service.continueSession(session.id), /只有已结束的面试能续接/)
  })
})

// ── 批量清理 ────────────────────────────────────────────────────────────────

test('记录清理：勾选的删掉，进行中的逐条拒绝并给原因', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const a = await service.createSession({ title: 'A' })
    const b = await service.createSession({ title: 'B' })
    const running = await service.createSession({ title: '在面的' })
    await service.startSession(running.id)
    await service.lastDispatch

    const result = await service.deleteSessions([a.id, b.id, running.id, 'iv-不存在'])
    assert.equal(result.deletedCount, 2)
    assert.equal(result.refusedCount, 2)
    assert.deepEqual(result.refused.map(item => item.id).sort(), [running.id, 'iv-不存在'].sort())
    assert.match(result.refused.find(item => item.id === running.id).reason, /正在进行/)
    const rows = await service.listSessions()
    assert.deepEqual(rows.map(row => row.id), [running.id])
  })
})

test('记录清点：每场给出转录轮数、录音个数与占用（只为清理弹层算）', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const created = await service.createSession({ title: '有内容' })
    await seedInterview(service, created)

    const rows = await service.listSessionsForCleanup()
    const row = rows.find(item => item.id === created.id)
    assert.equal(row.turns, 4)
    assert.equal(row.recordings, 1)
    assert.equal(row.hasReport, true)
    assert.ok(row.bytes > 100, '占用要把简历 / JD / 转录 / 报告 / 录音都算上')
  })
})

// ── 底稿档位 ────────────────────────────────────────────────────────────────

test('底稿三档：deep / bonus 不许被静默压成 core（按值判断，不是按键）', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '分级' })

    // 真机撞到过：`CHECKLIST_LEVEL[值]` 查不到 → 助手写 deep/bonus 全变 core，
    // 底稿的三档分级失效，面板与报告都看不出重点。
    await service.saveChecklist(session.id, [
      { topic: 'A', level: 'core' },
      { topic: 'B', level: 'deep' },
      { topic: 'C', level: 'bonus' },
      { topic: 'D', level: '不认识的档位' },
    ])
    const doc = await service.getChecklist(session.id)
    assert.deepEqual(doc.items.map(item => item.level), ['core', 'deep', 'bonus', 'core'])

    // 面试中调整档位同样要生效（同一条归一化）。
    await service.mutateChecklist(session.id, { op: 'update', id: doc.items[1].id, level: 'core' })
    const after = await service.getChecklist(session.id)
    assert.equal(after.items.find(item => item.id === doc.items[1].id).level, 'core')
  })
})

// ── 助手会话：两个角色、严格寻址、可溯源 ───────────────────────────────────

test('准备与面试是两个对话：JD / 底稿 → prepare，开场 / 报告 → live', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '分角色' })

    await service.requestAgentJd(session.id, 'https://jobs.example.com/1')
    await service.requestAgentChecklist(session.id)
    await service.requestAgentStart(session.id)
    await service.requestAgentReport(session.id)

    assert.equal(log.creates.length, 2, '两个角色各一个对话，不是四个')
    const bySession = new Map()
    for (const prompt of log.prompts) {
      if (!bySession.has(prompt.sessionId)) bySession.set(prompt.sessionId, [])
      bySession.get(prompt.sessionId).push(prompt.content[0].text)
    }
    const prepareText = bySession.get('host-session-1').join('\n')
    const liveText = bySession.get('host-session-2').join('\n')
    assert.match(prepareText, /interview_save_jd/, '抓 JD 在准备对话里')
    assert.match(prepareText, /interview_save_checklist/, '出底稿也在准备对话里')
    assert.match(liveText, /interview_record_turn/, '开场在面试对话里')
    assert.match(liveText, /interview_finish/, '写报告也在面试对话里')

    const state = await service.getState(session.id)
    assert.equal(state.session.agents.prepare.sessionId, 'host-session-1')
    assert.equal(state.session.agents.live.sessionId, 'host-session-2')
  })
})

test('账本可溯源：每个角色各自的派活与重建都记在自己名下', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '溯源' })

    await service.requestAgentChecklist(session.id)
    await service.requestAgentStart(session.id)
    const state = await service.getState(session.id)
    assert.equal(state.session.agents.prepare.sessionId, 'host-session-1')
    assert.ok(state.session.agents.prepare.createdAt > 0, '有「什么时候开的」')
    assert.deepEqual(state.session.agents.prepare.dispatches.map(item => item.kind), ['checklist'])
    assert.equal(state.session.agents.live.sessionId, 'host-session-2')
    assert.deepEqual(state.session.agents.live.dispatches.map(item => item.kind), ['start'])
    assert.equal(state.session.agents.prepare.rebuilds, 0)
  })
})

test('派活前先问宿主：这个角色的会话已经被删 → 先重建再发', async () => {
  await withEnv(async ({ root }) => {
    const notFound = Object.assign(new Error('session/not-found'), { code: 'session/not-found' })
    // 第一次 create 成功，之后宿主一直说「这个会话不存在」。
    const { controller, log } = makeController({ onStateError: notFound })
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '会话被删' })

    // 先手工塞一个已死的**准备**会话（模拟「上次用过的那个被删了」）。
    await service.updateSession(session.id, { agentSessions: { prepare: 'dead-session', live: '' } })
    await service.requestAgentChecklist(session.id)

    assert.equal(log.creates.length, 1, '探到已死就直接重建')
    assert.equal(log.prompts[0].sessionId, 'host-session-1', '这次不用先撞一次失败')
    const state = await service.getState(session.id)
    assert.equal(state.session.agents.prepare.sessionId, 'host-session-1')
    assert.equal(state.session.agents.prepare.rebuilds, 1, '重建要记账')
  })
})

test('点名指定对话时绝不偷换会话：目标不在就如实报错', async () => {
  await withEnv(async ({ root }) => {
    const notFound = Object.assign(new Error('session/not-found'), { code: 'session/not-found' })
    const { controller, log } = makeController({ promptError: () => notFound })
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '点名' })

    await assert.rejects(
      () => service.requestAgentJd(session.id, 'https://jobs.example.com/1', 'explicit-host'),
      /not-found/,
    )
    assert.equal(log.creates.length, 0, '用户点名了对话，不许偷偷建另一个')
    const state = await service.getState(session.id)
    assert.equal(state.session.agents.prepare.sessionId, '')
    assert.equal(state.session.agents.live.sessionId, '')
  })
})

test('老宿主没有 state()：读不到就当还在用，不自作主张重建', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController({ state: false })
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '老宿主' })
    await service.updateSession(session.id, { agentSessions: { prepare: 'stored-session', live: '' } })

    await service.requestAgentChecklist(session.id)
    assert.equal(log.creates.length, 0)
    assert.equal(log.prompts[0].sessionId, 'stored-session')
  })
})

test('老场次只有一个会话：开过面试的认给 live，没开始的认给 prepare', async () => {
  await withEnv(async ({ root }) => {
    const started = makeController()
    const serviceA = makeService(root, started.controller)
    const played = await serviceA.createSession({ title: '老场次·开过' })
    // 老数据：只有 agentSessionId，没有 agentSessions。
    const rawPath = join(played.dir, 'session.json')
    const raw = JSON.parse(await readFile(rawPath, 'utf8'))
    delete raw.agentSessions
    raw.agentSessionId = 'legacy-live'
    raw.startedAt = Date.now() - 600000
    await writeFile(rawPath, JSON.stringify(raw, undefined, 2))
    await serviceA.requestAgentReport(played.id)
    assert.equal(started.log.prompts[0].sessionId, 'legacy-live', '开过面试的 → live')
    assert.equal(started.log.creates.length, 0, '迁移不新建')

    const prep = makeController()
    const serviceB = makeService(root, prep.controller)
    const draft = await serviceB.createSession({ title: '老场次·没开' })
    const draftPath = join(draft.dir, 'session.json')
    const draftRaw = JSON.parse(await readFile(draftPath, 'utf8'))
    delete draftRaw.agentSessions
    draftRaw.agentSessionId = 'legacy-prepare'
    await writeFile(draftPath, JSON.stringify(draftRaw, undefined, 2))
    await serviceB.requestAgentChecklist(draft.id)
    assert.equal(prep.log.prompts[0].sessionId, 'legacy-prepare', '没开始的 → prepare')
  })
})

test('重置会把两个角色的会话都解绑，账本里各留一条 detach', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '重置解绑' })
    await service.requestAgentChecklist(session.id)
    await service.requestAgentStart(session.id)

    await service.resetSession(session.id)
    const state = await service.getState(session.id)
    assert.equal(state.session.agents.prepare.sessionId, '')
    assert.equal(state.session.agents.live.sessionId, '')
    const raw = JSON.parse(await readFile(join(session.dir, 'session.json'), 'utf8'))
    const detach = raw.agentLog.filter(entry => entry.event === 'detach')
    assert.equal(detach.length, 2)
    assert.deepEqual(detach.map(entry => entry.role).sort(), ['live', 'prepare'])
    assert.ok(detach.every(entry => entry.reason === 'reset'))
  })
})

// ── 连续录制（面试全程，分块落盘）─────────────────────────────────────────

test('连续录制：分块追加到同一个文件，收尾回大小', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '录像' })

    const begun = await service.beginRecording(session.id, { kind: 'video', tag: 'interview' })
    assert.match(begun.name, /^video-interview-.*\.webm$/)
    const chunk = Buffer.from('0123456789')
    const first = await service.appendRecording(session.id, {
      name: begun.name,
      dataBase64: chunk.toString('base64'),
    })
    assert.equal(first.bytes, 10)
    await service.appendRecording(session.id, {
      name: begun.name,
      dataBase64: Buffer.from('abcdefghij').toString('base64'),
    })
    const finished = await service.finishRecording(session.id, { name: begun.name })
    assert.equal(finished.ok, true)
    assert.equal(finished.bytes, 20, '两块要拼在同一个文件里')

    const state = await service.getState(session.id)
    assert.equal(state.recordings.length, 1)
    assert.equal(state.recordings[0].bytes, 20)
    assert.equal(state.recordings[0].kind, 'video')
  })
})

test('连续录制：不在 recordings/ 里的名字一律拒绝（不许穿越目录）', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '录像越权' })

    await assert.rejects(
      () => service.appendRecording(session.id, { name: '../session.json', dataBase64: 'x' }),
      /非法的录像文件名/,
    )
    await assert.rejects(
      () => service.appendRecording(session.id, { name: 'not-started.webm', dataBase64: 'x' }),
      /还没开始/,
    )
  })
})
