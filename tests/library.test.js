import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InterviewService, deriveJobTitle } from '../src/host/service.js'

// **不要用 `new URL(...).pathname`。** Windows 上它会给出 `/D:/Code/...`，
// 后面 `resolve()` 会把它拼成 `D:\D:\Code\...`——目录凭空多出一层盘符。
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** A service rooted in a throwaway directory. */
async function makeService(deps = {}) {
  const workspaceRoot = join(ROOT, '.tmp-test', `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const service = new InterviewService({ config: { workspaceRoot }, ...deps })
  return { service, workspaceRoot }
}

test('简历库：存一次 → 列出来 → 用到新场次 → 删掉', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const first = await service.createSession({ title: '第一场', resumeText: '梁守 / 2.5 年后端' })
    const saved = await service.saveResumeFromSession(first.id, '梁守的简历')
    assert.equal(saved.title, '梁守的简历')
    assert.equal(saved.chars, '梁守 / 2.5 年后端'.length)

    const rows = await service.listResumes()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].title, '梁守的简历')
    // 列表里只有元信息，不带正文——正文要单独取。
    assert.equal(rows[0].text, undefined)

    const full = await service.getResume(saved.id)
    assert.equal(full.text, '梁守 / 2.5 年后端')

    // 新建面试可以直接选库里那份。
    const second = await service.createSession({ title: '第二场' })
    const applied = await service.applyResume(second.id, saved.id)
    assert.equal(applied.resume.text, '梁守 / 2.5 年后端')
    const docs = await service.getDocuments(second.id)
    assert.equal(docs.resume, '梁守 / 2.5 年后端')
    const state = await service.getState(second.id)
    assert.equal(state.session.resumeId, saved.id)

    // 删的是库里的那份；**已经用过的场次里的快照不能跟着消失**。
    await service.deleteResume(saved.id)
    assert.equal((await service.listResumes()).length, 0)
    const after = await service.getDocuments(second.id)
    assert.equal(after.resume, '梁守 / 2.5 年后端', '删库不该动已经归档进卷内的快照')
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('简历库：空简历和非法 id 都被挡住', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    await assert.rejects(() => service.saveResume({ text: '   ' }), /简历是空的/)
    await assert.rejects(() => service.getResume('../escape'), /简历 id 不合法/)
    await assert.rejects(() => service.deleteResume('../escape'), /简历 id 不合法/)
    // 没存过的简历不算存在。
    await assert.rejects(() => service.getResume('rs-nonexistent-00000001'), /简历不存在/)
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('归档：收起来而不是删掉，取回来不留归档时间', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const session = await service.createSession({ title: '要归档的场', resumeText: '简历' })
    const archived = await service.setArchived(session.id, true)
    assert.equal(archived.archived, true)
    assert.ok((archived.archivedAt ?? 0) > 0)

    let rows = await service.listSessions()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].archived, true)

    const back = await service.setArchived(session.id, false)
    assert.equal(back.archived, false)
    assert.equal(back.archivedAt, undefined, '取消归档不该留下归档时间')

    rows = await service.listSessions()
    assert.equal(rows[0].archived, false)
    // 内容一样在。
    assert.equal((await service.getDocuments(session.id)).resume, '简历')
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('标题提炼：从 JD 认公司与岗位，用户改过的标题不动', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const session = await service.createSession({})
    const before = await service.getSession(session.id)
    assert.match(before.title, /^面试 \d{4}-\d{2}-\d{2}$/)

    await service.setJd(session.id, {
      text: '公司：字节跳动\n岗位：高级前端工程师\n负责跨端框架与性能优化。',
      url: 'https://example.com/job/1',
    })
    const after = await service.getSession(session.id)
    assert.equal(after.company, '字节跳动')
    assert.equal(after.position, '高级前端工程师')
    assert.equal(after.title, '字节跳动 · 高级前端工程师')

    // 用户自己改过的标题，不能被提炼覆盖。
    await service.updateSession(session.id, { title: '我想叫它别的' })
    await service.setJd(session.id, { text: '公司：腾讯\n岗位：后端工程师' })
    const again = await service.getSession(session.id)
    assert.equal(again.title, '我想叫它别的')
    assert.equal(again.company, '腾讯')
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('标题提炼：认不出来就留空，不硬猜', () => {
  const derived = deriveJobTitle('这是一段完全不像岗位描述的文字。')
  assert.equal(derived.position, '')
  assert.equal(derived.company, '')
  assert.equal(derived.title, '')
})

test('清空 JD / 简历 = 真的删掉，不是留个 0 字的文件', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const session = await service.createSession({})
    await service.setJd(session.id, { text: '公司：某某公司\n岗位：某某岗位' })
    await service.setResume(session.id, '张三 / 简历正文')
    let rows = await service.listSessions()
    assert.equal(rows[0].hasJd, true)
    assert.equal(rows[0].hasResume, true)

    // 清空之后就该是「没有」——列表里不能还显示有 JD。
    await service.setJd(session.id, { text: '   ' })
    await service.setResume(session.id, '')
    rows = await service.listSessions()
    assert.equal(rows[0].hasJd, false)
    assert.equal(rows[0].hasResume, false)
    assert.equal((await service.getDocuments(session.id)).jd, '')
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('助手派单：默认落在面试工作区，用户看得见', async () => {
  const prompts = []
  const creates = []
  const ctx = {
    get(name) {
      if (name !== 'sessionController') return undefined
      return {
        async create(request) {
          creates.push(request)
          return { sessionId: 'host-created' }
        },
        async prompt(input, signal) {
          prompts.push(input)
          // 宿主的实现第一句就是 `signal.throwIfAborted()`——
          // signal 是必填的第二个参数，不传会直接炸。
          assert.ok(signal !== undefined && typeof signal.throwIfAborted === 'function')
          return { ok: true }
        },
      }
    },
  }
  const { service, workspaceRoot } = await makeService({ ctx })
  try {
    const session = await service.createSession({})
    const result = await service.requestAgentJd(session.id, 'https://example.com/job/9')
    assert.equal(result.dispatched, true)
    // **默认落在面试工作区**：请求里必须带 cwd = 工作区根，
    // 而不是"宿主里最近的那个对话"（那会把活派到别的项目去）。
    assert.equal(result.hostSession.id, 'host-created')
    assert.equal(creates.length, 1)
    assert.equal(creates[0].cwd, workspaceRoot)
    assert.equal(result.hostSession.workspace, workspaceRoot)
    assert.equal(prompts.length, 1)
    const [prompt] = prompts
    assert.equal(prompt.sessionId, 'host-created')
    assert.equal(prompt.mode, 'queue')
    assert.match(prompt.content[0].text, /example\.com\/job\/9/)
    assert.match(prompt.content[0].text, /interview_save_jd/)

    // 也可以指定别的对话。
    await service.requestAgentJd(session.id, 'https://example.com/job/10', 'host-1')
    assert.equal(prompts[1].sessionId, 'host-1')
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('助手派单：宿主没有会话接口时给出能走的下一步', async () => {
  const { service, workspaceRoot } = await makeService({ ctx: { get: () => undefined } })
  try {
    const session = await service.createSession({})
    await assert.rejects(
      () => service.requestAgentJd(session.id, 'https://example.com/job/1'),
      /会话接口/,
    )
    // 没链接也不能派——空的活不该发出去。
    await assert.rejects(() => service.requestAgentJd(session.id, '  '), /没给链接/)
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})
