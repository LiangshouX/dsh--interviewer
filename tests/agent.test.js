import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InterviewService } from '../src/host/service.js'
import { readSettings } from '../src/host/paths.js'

/** 临时 profile + 临时工作区 */
async function withEnv(run) {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-agent-profile-'))
  const root = await mkdtemp(join(tmpdir(), 'dsh-agent-root-'))
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

/** 假的宿主 sessionController：记录每一次 create / prompt。 */
function fakeController(log) {
  return {
    async create(request) {
      log.push({ type: 'create', request })
      return { sessionId: 'host-session-1' }
    },
    async prompt(request) {
      log.push({ type: 'prompt', request })
      return { accepted: true }
    },
  }
}

test('派活默认在面试工作区建会话；第二次 prompt 直达，不再 create', async () => {
  await withEnv(async ({ root }) => {
    const log = []
    const controller = fakeController(log)
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })

    const first = await service.ensureAgentSession()
    assert.equal(first.workspace, root)
    assert.equal(first.sessionId, 'host-session-1')
    assert.equal(log[0].type, 'create')
    assert.equal(log[0].request.cwd, root, '会话必须落在面试工作区')
    assert.equal(log[0].request.sessionId, undefined)
    assert.equal((await readSettings()).agentSessionId, 'host-session-1')

    // **不再把已存在的 id 塞给 create**：宿主对非空白会话会「保持不变，
    // 改为新建 Session」——旧实现每次派活都在漂移新会话（TURN-TAKING §1.3-2）。
    const second = await service.ensureAgentSession()
    assert.equal(second.sessionId, 'host-session-1')
    assert.equal(second.reused, true)
    assert.equal(log.length, 1, '第二次不许再 create：prompt 直达，宿主自会恢复冷会话')
  })
})

test('requestAgentJd：不带 hostSessionId 时只发到面试工作区的会话', async () => {
  await withEnv(async ({ root }) => {
    const log = []
    const controller = fakeController(log)
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '测试' })
    const result = await service.requestAgentJd(session.id, 'https://jobs.example.com/1')
    assert.equal(result.dispatched, true)
    assert.equal(result.hostSession.explicit, false)
    assert.equal(result.hostSession.workspace, root)
    const prompt = log.find(item => item.type === 'prompt')
    assert.equal(prompt.request.sessionId, 'host-session-1')
    assert.match(prompt.request.content[0].text, new RegExp(session.id))
  })
})

test('requestAgentJd：显式给 hostSessionId 时不再建会话', async () => {
  await withEnv(async ({ root }) => {
    const log = []
    const controller = fakeController(log)
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const result = await service.requestAgentJd('iv-x', 'https://jobs.example.com/1', 'existing-host')
    assert.equal(result.hostSession.id, 'existing-host')
    assert.equal(result.hostSession.explicit, true)
    assert.equal(log.some(item => item.type === 'create'), false, '显式指定时不该偷偷建会话')
  })
})

test('requestAgentChecklist：派活内容让助手用工具写回这一场', async () => {
  await withEnv(async ({ root }) => {
    const log = []
    const controller = fakeController(log)
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '底稿场' })
    const result = await service.requestAgentChecklist(session.id)
    assert.equal(result.dispatched, true)
    const prompt = log.find(item => item.type === 'prompt')
    assert.match(prompt.request.content[0].text, /interview_save_checklist/)
    assert.match(prompt.request.content[0].text, new RegExp(session.id))
  })
})

test('宿主没有 sessionController 时，派活要如实说不支持', async () => {
  await withEnv(async ({ root }) => {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    await assert.rejects(() => service.requestAgentJd('iv-x', 'https://jobs.example.com/1'), /没有提供/)
  })
})


test('派活前登记工作区，并优先用 workspaceId 绑定会话', async () => {
  await withEnv(async ({ root }) => {
    const log = []
    const sessionLog = []
    const ctx = {
      get(name) {
        if (name === 'sessionController') {
          return {
            async create(request) { sessionLog.push(request); return { sessionId: 'host-ws' } },
            async prompt() { return { accepted: true } },
          }
        }
        if (name === 'workspaceController') {
          return {
            async create(request) {
              log.push(request)
              return { workspace: { workspaceId: 'ws-1', path: request.path, title: 'DSH-REALTIME-INTERVIEW' }, created: true }
            },
          }
        }
        return undefined
      },
    }
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx })
    const info = await service.ensureAgentSession()
    assert.equal(info.registered, true)
    assert.equal(info.workspaceId, 'ws-1')
    assert.equal(log.length, 1)
    assert.equal(log[0].path, root, '登记的就是面试工作区')
    assert.equal(sessionLog.length, 1)
    assert.equal(sessionLog[0].workspaceId, 'ws-1', '会话要用已登记的工作区 id 绑定')
    assert.equal(sessionLog[0].cwd, undefined)
  })
})


test('requestAgentReport：让助手写报告并调 interview_finish 落盘', async () => {
  await withEnv(async ({ root }) => {
    const log = []
    const controller = fakeController(log)
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '报告场' })
    const result = await service.requestAgentReport(session.id)
    assert.equal(result.dispatched, true)
    const prompt = log.find(item => item.type === 'prompt')
    assert.match(prompt.request.content[0].text, new RegExp(session.id))
    assert.match(prompt.request.content[0].text, /interview_finish/)
    assert.match(prompt.request.content[0].text, /interview_get_context/)
  })
})

// ── 「等助手返回」的 loading：必须有终点（不许假活空转）──────────────────

/** 把任务记录的时间往前拨，模拟「已经等了一会儿」。 */
async function ageTask(session, kind, ms) {
  const path = join(session.dir, 'session.json')
  const meta = JSON.parse(await readFile(path, 'utf8'))
  meta.agentTasks[kind].at = Date.now() - ms
  await writeFile(path, JSON.stringify(meta, null, 2))
}

/** 一个能回答「宿主会话在不在跑」的 controller。 */
function stateController(log, state) {
  const controller = fakeController(log)
  controller.state = async () => state
  return controller
}

test('派活后 getState 出现 waiting；产物落盘后任务消失（loading 收尾）', async () => {
  await withEnv(async ({ root }) => {
    const log = []
    const controller = stateController(log, { running: true, queue: [] })
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '底稿场' })

    await service.requestAgentChecklist(session.id)
    const waiting = await service.getState(session.id)
    assert.equal(waiting.agentTasks.checklist.status, 'waiting')
    assert.equal(waiting.agentTasks.jd, undefined)

    await service.saveChecklist(session.id, [{ topic: '闭包与作用域' }])
    const done = await service.getState(session.id)
    assert.equal(done.agentTasks.checklist, undefined, '底稿写回后 loading 必须收掉')
  })
})

test('JD / 报告同理：派发即 waiting，正文与报告落盘后收尾', async () => {
  await withEnv(async ({ root }) => {
    const controller = stateController([], { running: true, queue: [] })
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '多任务' })

    await service.requestAgentJd(session.id, 'https://jobs.example.com/9')
    await service.requestAgentReport(session.id)
    const tasks = (await service.getState(session.id)).agentTasks
    assert.equal(tasks.jd.status, 'waiting')
    assert.equal(tasks.report.status, 'waiting')
    assert.equal(tasks.jd.url, 'https://jobs.example.com/9', '重试要用得上原链接')

    await service.setJd(session.id, { text: '岗位职责……', url: 'https://jobs.example.com/9' })
    assert.equal((await service.getState(session.id)).agentTasks.jd, undefined)

    await service.saveReport(session.id, '# 报告\n\n内容')
    assert.equal((await service.getState(session.id)).agentTasks.report, undefined)
  })
})

test('宿主这一轮跑完却没写回 → failed（带原因与下一步），不是无限转圈', async () => {
  await withEnv(async ({ root }) => {
    const controller = stateController([], { running: false, queue: [] })
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '空跑' })
    await service.requestAgentChecklist(session.id)
    // 宽限期内仍算 waiting（派发刚入队时 running 可能还没置真）。
    assert.equal((await service.getState(session.id)).agentTasks.checklist.status, 'waiting')
    await ageTask(session, 'checklist', 20000)
    const failed = (await service.getState(session.id)).agentTasks.checklist
    assert.equal(failed.status, 'failed')
    assert.match(failed.reason, /没有写回底稿/)
    assert.match(failed.hint, /重新生成|interview_save_checklist/)
  })
})

test('助手在等用户确认/回答（turn 开着、running 恒真）→ failed，指路对话区', async () => {
  await withEnv(async ({ root }) => {
    // 这是真机撞到的场景：助手调 ask_user_question 后 turn 一直开着，
    // 只看 running 会永远转圈——但用户在对话区回答之前，这件事不可能推进。
    const controller = stateController([], { running: true, queue: [], pendingInput: ['question'] })
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '等人回答' })
    await service.requestAgentChecklist(session.id)
    const task = (await service.getState(session.id)).agentTasks.checklist
    assert.equal(task.status, 'failed')
    assert.match(task.reason, /问你一个问题/)
    assert.match(task.hint, /DSH 对话区/)
  })
})

test('等太久 → failed（超时也是终点）；状态翻转会进 revision，面板才会刷新', async () => {
  await withEnv(async ({ root }) => {
    const controller = stateController([], { running: true, queue: [] })
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '超时' })
    await service.requestAgentReport(session.id)
    const waiting = await service.getState(session.id)
    await ageTask(session, 'report', 11 * 60 * 1000)
    const failed = await service.getState(session.id)
    assert.equal(failed.agentTasks.report.status, 'failed')
    assert.match(failed.agentTasks.report.reason, /等了 10 分钟/)
    assert.notEqual(failed.revision, waiting.revision, 'waiting→failed 必须改指纹，否则面板不会重渲染')
  })
})

test('助手会话不见了 → failed，并提示重派会重建', async () => {
  await withEnv(async ({ root }) => {
    const controller = fakeController([])
    controller.state = async () => { throw Object.assign(new Error('session/not-found'), { code: 'session-not-found' }) }
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '会话没了' })
    await service.requestAgentJd(session.id, 'https://jobs.example.com/1')
    const task = (await service.getState(session.id)).agentTasks.jd
    assert.equal(task.status, 'failed')
    assert.match(task.reason, /会话不见了/)
    assert.match(task.hint, /重建/)
  })
})

test('老宿主没有 state() 接口时：不猜「还在跑」，但超时仍然收尾', async () => {
  await withEnv(async ({ root }) => {
    const controller = fakeController([]) // 没有 state
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '老宿主' })
    await service.requestAgentChecklist(session.id)
    assert.equal((await service.getState(session.id)).agentTasks.checklist.status, 'waiting')
    await ageTask(session, 'checklist', 11 * 60 * 1000)
    assert.equal((await service.getState(session.id)).agentTasks.checklist.status, 'failed')
  })
})

test('忽略失败提示：记录被清掉，按钮不再挂着', async () => {
  await withEnv(async ({ root }) => {
    const controller = stateController([], { running: true, queue: [] })
    const service = new InterviewService({
      config: { workspaceRoot: root },
      ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
    })
    const session = await service.createSession({ title: '忽略' })
    await service.requestAgentChecklist(session.id)
    await ageTask(session, 'checklist', 11 * 60 * 1000)
    assert.equal((await service.getState(session.id)).agentTasks.checklist.status, 'failed')
    await service.dismissAgentTask(session.id, 'checklist')
    assert.equal((await service.getState(session.id)).agentTasks.checklist, undefined)
  })
})
