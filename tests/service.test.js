import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { InterviewService } from '../src/host/service.js'

const ROOT = new URL('..', import.meta.url).pathname

/** A service rooted in a throwaway directory. */
async function makeService() {
  const workspaceRoot = join(ROOT, '.tmp-test', `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const service = new InterviewService({ config: { workspaceRoot } })
  return { service, workspaceRoot }
}

test('会话、清单、转录、报告走完一轮', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const session = await service.createSession({ title: '测试场', resumeText: '简历', jdText: 'JD' })
    await service.saveChecklist(session.id, [{ topic: '限流', why: 'JD 要求', level: 'core' }])
    const checklist = await service.getChecklist(session.id)
    assert.equal(checklist.items.length, 1)

    await service.mutateChecklist(session.id, { op: 'probe', id: checklist.items[0].id, note: '答得清楚' })
    const probed = await service.getChecklist(session.id)
    assert.equal(probed.items[0].probed, true)
    assert.equal(probed.adjustments.length, 1)

    await service.appendTurn(session.id, { role: 'interviewer', text: '讲讲项目' })
    await service.appendTurn(session.id, { role: 'candidate', text: '我做的是……' })
    const state = await service.getState(session.id)
    assert.equal(state.stats.asked, 1)
    assert.equal(state.stats.answered, 1)
    assert.equal(state.stats.checklistProbed, 1)

    await service.saveReport(session.id, '# 报告')
    assert.equal(state.session.status, 'draft')
    const done = await service.getSession(session.id)
    assert.equal(done.status, 'done')
  } finally {
    await rm(join(workspaceRoot), { recursive: true, force: true })
  }
})

test('岗位档案：保存 → 继承 → 回写', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const profile = await service.saveProfile({
      title: '字节 · 高级后端',
      company: '字节跳动',
      jdText: 'JD 正文',
      checklist: { version: 2, items: [{ id: 'c1', topic: '限流与降级', why: 'JD 要求', level: 'core' }] },
    })
    const rows = await service.listProfiles()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].checklistCount, 1)

    const session = await service.createSession({ title: '第二轮' })
    const applied = await service.applyProfile(session.id, profile.id)
    assert.equal(applied.items, 1)

    const state = await service.getState(session.id)
    assert.equal(state.checklist.items[0].inherited, true)
    assert.equal(state.checklist.items[0].inheritedFrom, profile.id)
    assert.equal(state.checklist.items[0].probed, false)
    assert.equal(state.documents.jdChars, 'JD 正文'.length)

    // 现场调整清单后回写档案，档案应拿到最终清单。
    await service.mutateChecklist(session.id, { op: 'add', topic: '风控', reason: '候选人主动提到' })
    await service.syncProfile(session.id, profile.id)
    const updated = await service.getProfile(profile.id)
    assert.equal(updated.checklist.items.length, 2)
    assert.ok(updated.sessions.includes(session.id))
  } finally {
    await rm(join(workspaceRoot), { recursive: true, force: true })
  }
})

test('档案 id 不合法时被挡住', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    await assert.rejects(() => service.getProfile('../escape'))
    await assert.rejects(() => service.getSession('../escape'))
  } finally {
    await rm(join(workspaceRoot), { recursive: true, force: true })
  }
})
