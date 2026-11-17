import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InterviewService } from '../src/host/service.js'
import { registerTools } from '../src/host/tools.js'

// **不要用 `new URL(...).pathname`。** Windows 上它会给出 `/D:/Code/...`。
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 一个只装着工具的假 ctx：`ctx.tools.register(def, {when})`。 */
async function makeHarness() {
  const workspaceRoot = join(ROOT, '.tmp-test', `tools-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const service = new InterviewService({ config: { workspaceRoot } })
  const tools = new Map()
  const dispose = registerTools({
    tools: {
      register: (definition) => {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
  }, service)
  return { service, tools, workspaceRoot, dispose }
}

test('interview_prepare 带 sessionId 时改元信息，不是再建一场', async () => {
  const { service, tools, workspaceRoot, dispose } = await makeHarness()
  try {
    const session = await service.createSession({})
    const count = (await service.listSessions()).length
    const prepare = tools.get('interview_prepare')

    const output = await prepare.execute({
      sessionId: session.id,
      sessionTitle: '阿里云 · AI 模型与推理产品专家',
      company: '阿里云',
      position: 'AI 模型与推理产品专家',
    })

    assert.equal(output.sessionId, session.id)
    assert.equal(output.title, '阿里云 · AI 模型与推理产品专家')
    assert.equal(output.company, '阿里云')
    assert.equal(output.position, 'AI 模型与推理产品专家')
    assert.equal((await service.listSessions()).length, count, '不该偷偷新建一场')

    // 落盘的也是这一场。
    const onDisk = await service.getSession(session.id)
    assert.equal(onDisk.title, '阿里云 · AI 模型与推理产品专家')
  } finally {
    dispose()
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('interview_prepare 新建时不写元信息 → 带日期的占位值', async () => {
  const { tools, workspaceRoot, dispose } = await makeHarness()
  try {
    const output = await tools.get('interview_prepare').execute({})
    assert.match(output.company, /^新建公司 \d{4}-\d{2}-\d{2}$/)
    assert.match(output.position, /^新建岗位 \d{4}-\d{2}-\d{2}$/)
    assert.match(output.title, /^新建公司 \d{4}-\d{2}-\d{2} · 新建岗位 \d{4}-\d{2}-\d{2}$/)
  } finally {
    dispose()
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('interview_save_jd 只写正文：JD 里的「公司：」「岗位：」不许改元信息', async () => {
  const { service, tools, workspaceRoot, dispose } = await makeHarness()
  try {
    const prepared = await tools.get('interview_prepare').execute({
      sessionTitle: '阿里云 · AI 模型与推理产品专家',
      company: '阿里云',
      position: 'AI 模型与推理产品专家',
    })
    const saved = await tools.get('interview_save_jd').execute({
      sessionId: prepared.sessionId,
      text: '公司：基础信息\n岗位：专家\n【职位描述】\n负责模型推理。',
    })
    assert.equal(saved.title, '阿里云 · AI 模型与推理产品专家')
    assert.equal(saved.company, '阿里云')
    assert.equal(saved.position, 'AI 模型与推理产品专家')

    const onDisk = await service.getSession(prepared.sessionId)
    assert.equal(onDisk.company, '阿里云')
    assert.equal(onDisk.position, 'AI 模型与推理产品专家')
  } finally {
    dispose()
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})
