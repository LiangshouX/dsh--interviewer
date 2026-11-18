/**
 * 话轮驱动、暂停/继续与派活链路（docs/TURN-TAKING.md）的行为矩阵。
 *
 * 覆盖：
 *  - §6.1 状态迁移合法性矩阵（pause/resume/start/finish）
 *  - §6.2 pausedMs 累计与 durationMs 计时公式（暂停时长必须扣掉）
 *  - §5.1 appendTurn → continue 派活的触发条件判定表
 *  - §5.1 requestId 幂等（start no-op、retry 用原 requestId）
 *  - §5.2/§6.2 per-session agentSessionId、老数据迁移、session-not-found 重建
 *  - §4.4 派活失败留痕 + retryAgentDispatch 出路
 *  - §4.2 answerMode / turnEndSilenceMs 设置校验
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InterviewService } from '../src/host/service.js'
import { readSettings, writeSettings, normalizeSetting } from '../src/host/paths.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** 临时 profile（隔离 settings 文件）+ 临时工作区。 */
async function withEnv(run) {
  const profileDir = await mkdtemp(join(tmpdir(), 'dsh-turn-profile-'))
  const root = await mkdtemp(join(tmpdir(), 'dsh-turn-root-'))
  const previous = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profileDir
  try {
    return await run({ profileDir, root })
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    // maxRetries：Windows 上异步派活的面包屑写入可能和清理撞车（ENOTEMPTY）。
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  }
}

/**
 * 可编程的假 sessionController：create 依次发 host-session-N；
 * prompt 按 failPrompts 队列逐次弹出（`null` = 这一次成功）。
 */
function makeController(failPrompts = []) {
  const log = { creates: [], prompts: [] }
  const failures = [...failPrompts]
  let createCount = 0
  const controller = {
    async create(request) {
      createCount += 1
      log.creates.push(request)
      return { sessionId: `host-session-${createCount}` }
    },
    async prompt(request) {
      log.prompts.push(request)
      if (failures.length > 0) {
        const failure = failures.shift()
        if (failure) throw failure
      }
      return { accepted: true }
    },
  }
  return { controller, log }
}

function makeService(root, controller) {
  return new InterviewService({
    config: { workspaceRoot: root },
    ctx: { get: name => (name === 'sessionController' ? controller : undefined) },
  })
}

/** 转录里最后一条 system 行。 */
async function lastSystemLine(service, sessionId) {
  const transcript = await service.getTranscript(sessionId)
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    if (transcript[index].role === 'system') return transcript[index]
  }
  return undefined
}

// ── §6.1 状态迁移合法性矩阵 ────────────────────────────────────────────────

test('状态迁移矩阵：pause 仅 running、resume 仅 paused、finish 仅 running/paused', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '矩阵场' })

    // draft：不能暂停、不能继续、不能结束。
    await assert.rejects(() => service.pauseSession(session.id), /进行中/)
    await assert.rejects(() => service.resumeSession(session.id), /暂停中/)
    await assert.rejects(() => service.finishSession(session.id), /进行中或暂停中/)

    // running：不能继续（没暂停）；可以暂停、可以结束。
    await service.startSession(session.id)
    await service.lastDispatch // 等异步派活落定：别把面包屑写进正在清理的目录
    await assert.rejects(() => service.resumeSession(session.id), /暂停中/)

    // paused：不能再暂停、不能重新 start；可以结束（暂停中直接结束合法）。
    await service.pauseSession(session.id)
    await assert.rejects(() => service.pauseSession(session.id), /进行中/)
    await assert.rejects(() => service.startSession(session.id), /暂停/)

    // done：全部拒绝。
    await service.finishSession(session.id)
    await assert.rejects(() => service.pauseSession(session.id), /进行中/)
    await assert.rejects(() => service.resumeSession(session.id), /暂停中/)
    await assert.rejects(() => service.finishSession(session.id), /进行中或暂停中/)
  })
})

test('start：running 时重复调用是 no-op（双击/重试不重复派开场）', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '双击场' })

    const started = await service.startSession(session.id)
    assert.equal(started.status, 'running')
    await service.lastDispatch
    assert.equal(log.prompts.length, 1, 'start 成功后必须自动派活开场（G1）')
    assert.match(log.prompts[0].content[0].text, /\[系统派活\]/)
    assert.match(log.prompts[0].content[0].text, /interview_get_context/)
    assert.match(log.prompts[0].requestId, new RegExp(`^start-${session.id}-\\d+$`))

    // 再点一次「开始面试」：no-op，不再派活。
    const again = await service.startSession(session.id)
    assert.equal(again.status, 'running')
    assert.equal(again.restarted, false)
    await sleep(20)
    assert.equal(log.prompts.length, 1, 'running 时重复 start 不许重复派开场')
  })
})

// ── §6.2/§6.3/§6.4 暂停与继续 ─────────────────────────────────────────────

test('pause/resume：system 行留痕、pausedMs 累计、durationMs 扣掉暂停时长', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '计时场' })
    await service.startSession(session.id)
    await service.lastDispatch
    await service.appendTurn(session.id, { role: 'interviewer', text: '第一问' })
    await service.appendTurn(session.id, { role: 'candidate', text: '第一答' })

    await sleep(40)
    const pausedMeta = await service.pauseSession(session.id)
    assert.equal(pausedMeta.status, 'paused')
    assert.ok(pausedMeta.pausedAt > 0)
    const pauseLine = await lastSystemLine(service, session.id)
    assert.equal(pauseLine.text, '面试暂停')

    await sleep(60)
    const resumedMeta = await service.resumeSession(session.id)
    assert.equal(resumedMeta.status, 'running')
    assert.equal(resumedMeta.pausedAt, 0)
    assert.ok(resumedMeta.pausedMs >= 50, `pausedMs 应至少覆盖睡眠段，实际 ${resumedMeta.pausedMs}`)
    const resumeLine = await lastSystemLine(service, session.id)
    assert.match(resumeLine.text, /^面试继续（本次暂停 \d+ 分钟）$/)

    // resume 联动派活：助手带着完整上下文续接（§6.4/§6.5）。
    await service.lastDispatch
    const resumePrompt = log.prompts[log.prompts.length - 1]
    assert.equal(resumePrompt.requestId, `resume-${session.id}-${pausedMeta.pausedAt}`)
    assert.match(resumePrompt.content[0].text, /interview_get_context/)
    assert.match(resumePrompt.content[0].text, /暂停/)

    // 计时公式：durationMs 必须明显小于「墙钟差」（暂停段被扣掉）。
    const state = await service.getState(session.id)
    const wall = Date.now() - state.session.startedAt
    assert.ok(state.stats.durationMs <= wall - 50, `durationMs(${state.stats.durationMs}) 应扣掉暂停段（墙钟 ${wall}）`)

    // 第二次暂停：pausedMs 跨多次暂停**累加**。
    await sleep(30)
    await service.pauseSession(session.id)
    await sleep(30)
    const second = await service.resumeSession(session.id)
    await service.lastDispatch
    assert.ok(second.pausedMs >= resumedMeta.pausedMs + 20, 'pausedMs 要跨多次暂停累加')
  })
})

test('暂停中直接结束：那一段暂停也计入 pausedMs（口径一致）', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '暂停结束场' })
    await service.startSession(session.id)
    await service.lastDispatch
    await service.pauseSession(session.id)
    await sleep(40)
    const finished = await service.finishSession(session.id)
    assert.equal(finished.status, 'done')
    assert.ok(finished.pausedMs >= 30)
    const state = await service.getState(session.id)
    assert.ok(state.stats.durationMs >= 0)
    assert.ok(state.stats.durationMs <= state.session.endedAt - state.session.startedAt - 30)
  })
})

test('重开已结束的面试：旧暂停时长清零，开场派活重新发', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '重开场' })
    await service.startSession(session.id)
    await service.lastDispatch
    await service.pauseSession(session.id)
    await sleep(40)
    await service.resumeSession(session.id)
    await service.lastDispatch
    const mid = await service.getSession(session.id)
    assert.ok(mid.pausedMs >= 30)
    await service.finishSession(session.id)

    await service.startSession(session.id)
    await service.lastDispatch
    const restarted = await service.getSession(session.id)
    assert.equal(restarted.status, 'running')
    assert.equal(restarted.pausedMs, 0, '旧一轮的暂停时长不能带进新一轮（否则计时扣成负数）')
    assert.equal(log.prompts.length, 3, '重开要重新派开场（requestId 带 startedAt，宿主去重不挡它）')
  })
})

// ── §5.1 appendTurn → continue 派活：触发条件判定表 ────────────────────────

test('appendTurn 联动判定表：只有「面板提交 + running」才派 continue', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '联动场' })

    // draft + panel candidate → 不派。
    await service.appendTurn(session.id, { role: 'candidate', text: '没开始就答', meta: { source: 'panel' } })
    await sleep(20)
    assert.equal(log.prompts.length, 0, 'draft 状态不派活')

    await service.startSession(session.id)
    await service.lastDispatch
    const afterStart = log.prompts.length
    assert.equal(afterStart, 1)

    // running + interviewer → 不派。
    await service.appendTurn(session.id, { role: 'interviewer', text: '问一句' })
    // running + system → 不派。
    await service.appendTurn(session.id, { role: 'system', text: '路过' })
    // running + candidate 但**不是面板提交**（助手自己记的）→ 不派。
    // 否则助手每记一条回答就给自己排一条队——自己给自己派活成环。
    await service.appendTurn(session.id, { role: 'candidate', text: '助手代记的回答' })
    await sleep(30)
    assert.equal(log.prompts.length, afterStart, 'interviewer/system/助手代记的 candidate 都不触发派活')

    // running + candidate + source:panel → 派 continue。
    const row = await service.appendTurn(session.id, {
      role: 'candidate',
      text: '我用令牌桶做的限流',
      meta: { source: 'panel' },
    })
    await service.lastDispatch
    assert.equal(log.prompts.length, afterStart + 1)
    const prompt = log.prompts[log.prompts.length - 1]
    assert.equal(prompt.requestId, `continue-${session.id}-${row.ts}`, 'requestId 必须绑定这一行（幂等去重的键）')
    assert.equal(prompt.mode, 'queue')
    // 回答原文内联：省一次 context 往返（§5.1）。
    assert.match(prompt.content[0].text, /我用令牌桶做的限流/)
    assert.match(prompt.content[0].text, /interview_record_turn/)

    // paused + panel candidate → 不派。
    await service.pauseSession(session.id)
    await service.appendTurn(session.id, { role: 'candidate', text: '暂停中的补充', meta: { source: 'panel' } })
    await sleep(20)
    assert.equal(log.prompts.length, afterStart + 1, 'paused 状态不派活')
  })
})

// ── §5.2/§6.2 per-session 助手会话 ────────────────────────────────────────

test('助手会话 per-session：两场面试各存各的，不串场、不漂移', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const a = await service.createSession({ title: 'A 场' })
    const b = await service.createSession({ title: 'B 场' })

    await service.startSession(a.id)
    await service.lastDispatch
    assert.equal(log.creates.length, 1)
    assert.equal((await service.getSession(a.id)).agentSessionId, 'host-session-1')

    // A 的后续派活**不再 create**（prompt 直达）。
    await service.appendTurn(a.id, { role: 'candidate', text: 'A 的回答', meta: { source: 'panel' } })
    await service.lastDispatch
    assert.equal(log.creates.length, 1, 'per-session 会话已存：不许漂移新会话')
    assert.equal(log.prompts[log.prompts.length - 1].sessionId, 'host-session-1')

    // B 是另一场：自己的会话。
    await service.requestAgentStart(b.id)
    assert.equal(log.creates.length, 2)
    assert.equal((await service.getSession(b.id)).agentSessionId, 'host-session-2')
    assert.equal(log.prompts[log.prompts.length - 1].sessionId, 'host-session-2')

    // 全局键退役为「最近一次 create」的诊断面包屑。
    assert.equal((await readSettings()).agentSessionId, 'host-session-2')
  })
})

test('老数据迁移：**只有老场次**（无 agentSessionId 字段）继承全局键', async () => {
  await withEnv(async ({ root }) => {
    await writeSettings({ agentSessionId: 'legacy-session' })
    const { controller, log } = makeController()
    const service = makeService(root, controller)

    // 造一个「老场次」：session.json 里还没有 agentSessionId 字段。
    const legacy = await service.createSession({ title: '老场次' })
    const metaPath = join(legacy.dir, 'session.json')
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    delete meta.agentSessionId
    await writeFile(metaPath, JSON.stringify(meta, undefined, 2))

    const result = await service.requestAgentStart(legacy.id)
    assert.equal(result.dispatched, true)
    assert.equal(log.creates.length, 0, '老场次有可继承的全局会话就不该 create')
    assert.equal(log.prompts[0].sessionId, 'legacy-session')
    assert.equal((await service.getSession(legacy.id)).agentSessionId, 'legacy-session', '迁移要落盘（一次性）')

    // **新场次不继承**：全局键只是面包屑，继承它等于两场共用一个助手（串场）。
    const fresh = await service.createSession({ title: '新场次' })
    await service.requestAgentStart(fresh.id)
    assert.equal(log.creates.length, 1, '新场次必须建自己的会话')
    assert.equal(log.prompts[1].sessionId, 'host-session-1')
    assert.equal((await service.getSession(fresh.id)).agentSessionId, 'host-session-1')
  })
})

test('助手会话被删：自动重建重发一次，留痕「助手会话已重建」', async () => {
  await withEnv(async ({ root }) => {
    const gone = Object.assign(new Error('session/not-found'), { code: 'session/not-found' })
    // 第一次 prompt（开场）成功；第二次（continue）撞上「会话已删」。
    const { controller, log } = makeController([null, gone])
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '重建场' })

    await service.startSession(session.id)
    await service.lastDispatch
    assert.equal(log.prompts.length, 1)
    assert.equal((await service.getSession(session.id)).agentSessionId, 'host-session-1')

    await service.appendTurn(session.id, { role: 'candidate', text: '回答', meta: { source: 'panel' } })
    await service.lastDispatch

    assert.equal(log.prompts.length, 3, '失败一次 + 重建后重发一次')
    assert.equal(log.prompts[1].sessionId, 'host-session-1')
    assert.equal(log.prompts[2].sessionId, 'host-session-2')
    assert.equal(log.prompts[2].requestId, log.prompts[1].requestId, '重发用同一 requestId（宿主幂等去重）')
    assert.equal((await service.getSession(session.id)).agentSessionId, 'host-session-2')
    const line = await lastSystemLine(service, session.id)
    assert.match(line.text, /助手会话已重建/)

    // writer-held / 归档这类「会话还在但跑不了」的错误**不重建**，直接抛给失败出路。
    const { controller: c2, log: log2 } = makeController([new Error('session/writer-held')])
    const service2 = makeService(root, c2)
    const session2 = await service2.createSession({ title: '占用场' })
    await assert.rejects(() => service2.requestAgentStart(session2.id), /writer-held/)
    assert.equal(log2.prompts.length, 1, 'writer-held 不该触发重建重发')
  })
})

// ── §4.4 派活失败：留痕 + 重发出路 ────────────────────────────────────────

test('派活失败：system 行留痕带原文；retryAgentDispatch 原 requestId 重发；成功后不再提示', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController([new Error('boom')])
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '失败场' })

    await service.startSession(session.id)
    await service.lastDispatch // 失败被捕获并留痕，不炸主流程

    const line = await lastSystemLine(service, session.id)
    assert.match(line.text, /^派活失败：boom$/)
    assert.equal(line.meta.dispatch.ok, false)
    assert.equal(line.meta.dispatch.kind, 'start')
    assert.match(line.meta.dispatch.requestId, new RegExp(`^start-${session.id}-`))
    assert.match(line.meta.dispatch.text, /\[系统派活\]/, '留痕必须带原文，重发才发得出去')
    assert.ok(String(line.meta.dispatch.hint).length > 0, '失败必须给出路')

    // 重发：这次 prompt 会成功（失败队列已弹空）。
    const retried = await service.retryAgentDispatch(session.id)
    assert.equal(retried.retried, true)
    assert.equal(log.prompts.length, 2)
    assert.equal(log.prompts[1].requestId, line.meta.dispatch.requestId, '重发用原 requestId')
    const okLine = await lastSystemLine(service, session.id)
    assert.equal(okLine.meta.dispatch.ok, true)

    // 再点重发：没有待重发的了——如实说，不重复派活。
    const again = await service.retryAgentDispatch(session.id)
    assert.equal(again.retried, false)
    assert.equal(log.prompts.length, 2)
  })
})

// ── §5.1 手动兜底与长沉默 ─────────────────────────────────────────────────

test('手动 continue：自动取转录最后一条 candidate；没有回答时如实报错', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '手动场' })

    await assert.rejects(() => service.requestAgentContinue(session.id), /还没有候选人回答/)

    await service.appendTurn(session.id, { role: 'candidate', text: '补记的回答' })
    const result = await service.requestAgentContinue(session.id)
    assert.equal(result.dispatched, true)
    assert.match(log.prompts[0].content[0].text, /补记的回答/)
  })
})

test('长沉默派活：只报告事实，requestId 前缀 silence-', async () => {
  await withEnv(async ({ root }) => {
    const { controller, log } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '沉默场' })
    const result = await service.requestAgentSilence(session.id, 23)
    assert.equal(result.dispatched, true)
    assert.match(log.prompts[0].requestId, new RegExp(`^silence-${session.id}-\\d+$`))
    assert.match(log.prompts[0].content[0].text, /沉默约 23 秒/)
    assert.match(log.prompts[0].content[0].text, /不是候选人输入/)
  })
})

// ── §4.2 设置项 ───────────────────────────────────────────────────────────

test('设置项：answerMode 枚举、turnEndSilenceMs 值域（800–6000）', async () => {
  await withEnv(async ({ root }) => {
    assert.deepEqual(normalizeSetting('answerMode', 'auto'), { ok: true, value: 'auto' })
    assert.deepEqual(normalizeSetting('answerMode', 'manual'), { ok: true, value: 'manual' })
    assert.deepEqual(normalizeSetting('answerMode', 'AUTO'), { ok: true, value: 'auto' })
    assert.equal(normalizeSetting('answerMode', 'semi-auto').ok, false)

    assert.deepEqual(normalizeSetting('turnEndSilenceMs', 2000), { ok: true, value: 2000 })
    assert.deepEqual(normalizeSetting('turnEndSilenceMs', 800), { ok: true, value: 800 })
    assert.deepEqual(normalizeSetting('turnEndSilenceMs', 6000), { ok: true, value: 6000 })
    assert.equal(normalizeSetting('turnEndSilenceMs', 799).ok, false)
    assert.equal(normalizeSetting('turnEndSilenceMs', 6001).ok, false)
    assert.equal(normalizeSetting('turnEndSilenceMs', '2000').ok, false, '数字键不收字符串')

    // 默认值是 manual（首发不改变用户已适应的节奏；§4.2 默认值决策）。
    const { controller } = makeController()
    const fresh = makeService(root, controller)
    const defaults = await fresh.effectiveConfig()
    assert.equal(defaults.answerMode, 'manual')
    assert.equal(defaults.turnEndSilenceMs, 2000)

    // 落盘 → 读回 → 进有效配置（面板 config 端点读的就是它）。
    await writeSettings({ answerMode: 'auto', turnEndSilenceMs: 1500 })
    const settings = await readSettings()
    assert.equal(settings.answerMode, 'auto')
    assert.equal(settings.turnEndSilenceMs, 1500)
    const effective = await fresh.effectiveConfig()
    assert.equal(effective.answerMode, 'auto')
    assert.equal(effective.turnEndSilenceMs, 1500)
  })
})

test('getState：session 投影带 pausedAt/pausedMs/agentSessionId', async () => {
  await withEnv(async ({ root }) => {
    const { controller } = makeController()
    const service = makeService(root, controller)
    const session = await service.createSession({ title: '投影场' })
    await service.startSession(session.id)
    await service.lastDispatch
    await service.pauseSession(session.id)

    const state = await service.getState(session.id)
    assert.equal(state.session.status, 'paused')
    assert.ok(state.session.pausedAt > 0)
    assert.equal(state.session.pausedMs, 0)
    assert.equal(state.session.agentSessionId, 'host-session-1')
  })
})
