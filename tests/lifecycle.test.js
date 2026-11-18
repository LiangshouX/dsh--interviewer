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
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

test('重置：清掉转录/报告/计时/问过标记，材料与底稿本身留着', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const created = await service.createSession({ title: '误触场' })
    const session = await seedInterview(service, created)

    const result = await service.resetSession(session.id)
    assert.equal(result.ok, true)
    assert.equal(result.cleared.turns, 4, '4 条转录（含 system 行）都清掉')
    assert.equal(result.cleared.interviewTurns, 2)
    assert.equal(result.cleared.report, true)
    assert.equal(result.cleared.checklistProbed, 1)
    assert.equal(result.cleared.hostSessionDetached, true, '助手会话必须解绑')

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
    assert.equal(after.recordings.length, 1, '录音默认保留（文件不可恢复）')
    assert.equal(after.session.agentSessionId, '', '解绑后不再指向旧对话')

    // 再开始一场时用的是**新的**助手会话，不会接着旧对话里那轮上下文说。
    const before = log.creates.length
    await service.startSession(session.id)
    await service.lastDispatch
    assert.equal(log.creates.length, before + 1, '重置后重新开始要建新会话')
    assert.notEqual(log.prompts[log.prompts.length - 1].sessionId, 'host-session-1')
  })
})

test('重置：dropRecordings=true 才删录音录像；两项都如实报数', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const created = await service.createSession({ title: '录过像' })
    const session = await seedInterview(service, created)

    const result = await service.resetSession(session.id, { dropRecordings: true })
    assert.equal(result.cleared.recordings, 1)
    assert.equal(result.kept.recordings, 0)
    const after = await service.getState(session.id)
    assert.equal(after.recordings.length, 0)
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

// ── 助手会话：严格寻址 + 可溯源 ─────────────────────────────────────────────

test('同一个岗位：拉 JD 与出底稿用**同一个**助手会话', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '同一岗位' })

    await service.requestAgentJd(session.id, 'https://jobs.example.com/1')
    await service.requestAgentChecklist(session.id)
    await service.requestAgentReport(session.id)

    assert.equal(log.creates.length, 1, '三件事只该开一个助手会话')
    const ids = new Set(log.prompts.map(item => item.sessionId))
    assert.equal(ids.size, 1, 'JD / 底稿 / 报告必须发到同一个对话')
    assert.equal((await service.getState(session.id)).session.agentSessionId, 'host-session-1')
  })
})

test('账本可溯源：谁开的、发过什么、重建过几次，都在 getState 里', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '溯源' })

    await service.requestAgentChecklist(session.id)
    const state = await service.getState(session.id)
    assert.equal(state.session.agent.sessionId, 'host-session-1')
    assert.ok(state.session.agent.createdAt > 0, '有「什么时候开的」')
    assert.equal(state.session.agent.rebuilds, 0)
    assert.deepEqual(state.session.agent.dispatches.map(item => item.kind), ['checklist'])
    assert.equal(state.session.agent.dispatches[0].explicit, false)
  })
})

test('派活前先问宿主：会话已经被删 → 先重建再发（不让用户先看到一次失败）', async () => {
  await withEnv(async ({ root }) => {
    const notFound = Object.assign(new Error('session/not-found'), { code: 'session/not-found' })
    // 第一次 create 成功，之后宿主一直说「这个会话不存在」。
    const { controller, log } = makeController({ onStateError: notFound })
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '会话被删' })

    // 先手工塞一个已死的会话 id（模拟「上次用过的那个被删了」）。
    await service.updateSession(session.id, { agentSessionId: 'dead-session' })
    await service.requestAgentChecklist(session.id)

    assert.equal(log.creates.length, 1, '探到已死就直接重建')
    assert.equal(log.prompts[0].sessionId, 'host-session-1', '这次不用先撞一次失败')
    const state = await service.getState(session.id)
    assert.equal(state.session.agentSessionId, 'host-session-1')
    assert.equal(state.session.agent.rebuilds, 1, '重建要记账')
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
    assert.equal((await service.getSession(session.id)).agentSessionId, '')
  })
})

test('老宿主没有 state()：读不到就当还在用，不自作主张重建', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController({ state: false })
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '老宿主' })
    await service.updateSession(session.id, { agentSessionId: 'stored-session' })

    await service.requestAgentChecklist(session.id)
    assert.equal(log.creates.length, 0)
    assert.equal(log.prompts[0].sessionId, 'stored-session')
  })
})

test('重置会把助手会话解绑，账本里留一条 detach（谁、为什么）', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '重置解绑' })
    await service.requestAgentChecklist(session.id)

    await service.resetSession(session.id)
    const state = await service.getState(session.id)
    assert.equal(state.session.agent.sessionId, '')
    const raw = JSON.parse(await readFile(join(session.dir, 'session.json'), 'utf8'))
    const detach = raw.agentLog.find(entry => entry.event === 'detach')
    assert.equal(detach.hostSessionId, 'host-session-1')
    assert.equal(detach.reason, 'reset')
  })
})
