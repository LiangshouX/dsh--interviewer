import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
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
