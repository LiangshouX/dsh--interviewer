import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InterviewService } from '../src/host/service.js'
import { registerApi } from '../src/host/api.js'
import { writeSettings } from '../src/host/paths.js'

// **不要用 `new URL(...).pathname`。** Windows 上它会给出 `/D:/Code/...`，
// 后面 `resolve()` 会把它拼成 `D:\D:\Code\...`——目录凭空多出一层盘符。
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * **整个文件的隔离。** 插件的设置文件在真实机器上是有内容的——
 * 用户在面板里选过卷宗库之后，它就会让「默认根」不再是默认。
 *
 * 所以这里把 profile 目录指到一个空的临时目录：测试既不会读到用户的选择，
 * 也不会把会话写进用户真正的数据目录。需要自己 profile 的用例会临时覆盖，
 * 用完再还原。
 */
const TEST_PROFILE = join(ROOT, '.tmp-test', `profile-isolated-${process.pid}-${Date.now()}`)
process.env.DSH_PROFILE_DIR = TEST_PROFILE

/**
 * 把 API 挂到一个假宿主上，然后发请求。
 *
 * **为什么要测这一层。** 面板的第一个请求就是 `GET /config`——它失败的话，
 * 面板拿不到工作区根、拿不到录音开关、拿不到 ASR 状态，但界面不会报错，
 * 只是「什么都没有」。这种故障只有把请求真的打进去才看得见。
 *
 * @param {object} service
 * @returns {Promise<(method: string, path: string, body?: object, headers?: object) => Promise<{status: number, body: object}>>}
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

  return async (method, path, body, headers) => {
    const req = {
      method,
      url: path,
      headers: { host: '127.0.0.1:45678', ...(headers ?? {}) },
      // **必须 yield。** 宿主读请求体就是 `for await (const chunk of req)`——
      // 只往数组里塞而不 yield，它收到的是空体。
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) {
          yield Buffer.from(JSON.stringify(body), 'utf8')
        }
      },
    }
    let status = 0
    let payload = ''
    const res = {
      writeHead(code) {
        status = code
        return res
      },
      end(chunk) {
        if (chunk !== undefined) payload = String(chunk)
        return res
      },
    }
    await handler(req, res)
    // 信任围栏拒绝时宿主回的是纯文本 `forbidden`，不是 JSON。
    let parsed
    try {
      parsed = payload === '' ? undefined : JSON.parse(payload)
    } catch {
      parsed = payload
    }
    return { status, body: parsed }
  }
}

/** A service rooted in a throwaway directory. */
async function makeService() {
  const workspaceRoot = join(ROOT, '.tmp-test', `api-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const service = new InterviewService({ config: { workspaceRoot } })
  return { service, workspaceRoot }
}

test('GET /config：面板的第一个请求必须成功', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const call = await makeApi(service)
    const { status, body } = await call('GET', '/interviewer/api/config')

    assert.equal(status, 200, `config 接口不该失败：${JSON.stringify(body)}`)
    assert.equal(body.ok, true)

    // 工作区根：路径、来源、理由——界面要能回答「数据存到哪儿了」。
    const root = body.data.workspaceRoot
    assert.equal(root.path, workspaceRoot)
    assert.equal(root.source, 'config')
    assert.ok(root.reason.length > 0, '必须说清为什么是这个目录')

    // 面板还要靠这几个字段决定要不要显示录像/录音按钮。
    assert.equal(typeof body.data.recordVideo, 'boolean')
    assert.equal(typeof body.data.recordAudio, 'boolean')
    assert.ok(body.data.asrProvider.length > 0)
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('GET /config：默认工作区根也要说得清来源', async () => {
  // 设置文件已经被本文件的隔离（空的 profile 目录）挡住了，
  // 所以这里读到的就是「默认」。
  const service = new InterviewService({ config: {} })
  const call = await makeApi(service)
  const { status, body } = await call('GET', '/interviewer/api/config')
  assert.equal(status, 200)
  assert.equal(body.data.workspaceRoot.source, 'default')
  assert.ok(body.data.workspaceRoot.path.length > 0)
})

test('会话路由：列表、状态、归档正文都通', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const call = await makeApi(service)
    const created = await call('POST', '/interviewer/api/sessions', {
      title: '接口场',
      resumeText: '简历正文',
      jdText: 'JD 正文',
    })
    assert.equal(created.status, 200)
    const id = created.body.data.session.id

    const list = await call('GET', '/interviewer/api/sessions')
    assert.equal(list.body.data.sessions.length, 1)
    assert.equal(list.body.data.sessions[0].hasResume, true)

    const state = await call('GET', `/interviewer/api/sessions/${id}`)
    assert.equal(state.status, 200)
    assert.equal(state.body.data.session.title, '接口场')
    assert.ok(state.body.data.revision.length > 0, '轮询靠 revision，必须有')

    const documents = await call('GET', `/interviewer/api/sessions/${id}/documents`)
    assert.equal(documents.body.data.resume, '简历正文')
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('信任围栏：非 loopback 与跨站请求被挡', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const call = await makeApi(service)
    const remote = await call('GET', '/interviewer/api/sessions', undefined, { host: 'evil.example.com' })
    assert.equal(remote.status, 403)

    const crossSite = await call('GET', '/interviewer/api/sessions', undefined, {
      host: '127.0.0.1:45678',
      'sec-fetch-site': 'cross-site',
    })
    assert.equal(crossSite.status, 403)
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('卷宗库：宿主没有目录选择器时要如实说没有', async () => {
  const { service, workspaceRoot } = await makeService()
  try {
    const call = await makeApi(service)
    const { status, body } = await call('POST', '/interviewer/api/config/workspace-root/pick')
    assert.equal(status, 200)
    assert.equal(body.data.picker.available, false)
    assert.ok(body.data.picker.reason.length > 0, '必须给出原因，不能只是「失败了」')
    assert.equal(body.data.picker.picked, null)
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('卷宗库：宿主有目录选择器时用它选出来的路径', async () => {
  const picked = join(ROOT, '.tmp-test', 'picked-by-host')
  let seenSignal
  const service = new InterviewService({
    config: {},
    ctx: {
      get(name) {
        // 宿主 seam 是 `ctx.directoryPicker`，能力由 capability() 给出。
        if (name === 'directoryPicker') {
          return {
            capability: () => ({
              kind: 'native',
              // 宿主 native 后端要读 signal.aborted，所以 signal 必须传。
              pick: async (signal) => { seenSignal = signal; return picked },
            }),
          }
        }
        return undefined
      },
    },
  })
  const call = await makeApi(service)
  const { status, body } = await call('POST', '/interviewer/api/config/workspace-root/pick')
  assert.equal(status, 200)
  assert.equal(body.data.picker.available, true)
  assert.equal(body.data.picker.picked, picked)
  assert.ok(seenSignal instanceof AbortSignal, '必须给宿主一个 AbortSignal，否则宿主读 signal.aborted 会炸')
})

test('卷宗库：宿主只提供浏览式目录树时如实说没有，并给出手动填路径的出路', async () => {
  const service = new InterviewService({
    config: {},
    ctx: {
      get(name) {
        if (name === 'directoryPicker') {
          return { capability: () => ({ kind: 'browse', list: async () => ({}), createDirectory: async () => '' }) }
        }
        return undefined
      },
    },
  })
  const call = await makeApi(service)
  const { status, body } = await call('POST', '/interviewer/api/config/workspace-root/pick')
  assert.equal(status, 200)
  assert.equal(body.data.picker.available, false)
  assert.equal(body.data.picker.picked, null)
  assert.match(body.data.picker.reason, /绝对路径/)
})

test('卷宗库：换目录会写进设置，并且旧卷宗能搬过去', async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const profileDir = join(ROOT, '.tmp-test', `profile-${stamp}`)
  const firstRoot = join(ROOT, '.tmp-test', `root-a-${stamp}`)
  const secondRoot = join(ROOT, '.tmp-test', `root-b-${stamp}`)
  const previousProfile = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profileDir
  try {
    // 先把设置写成第一个根，于是这个 service 的有效根就是它。
    await writeSettings({ workspaceRoot: firstRoot })
    const service = new InterviewService({ config: {} })
    const call = await makeApi(service)

    const created = await call('POST', '/interviewer/api/sessions', { title: '搬家前的一场', resumeText: '简历' })
    assert.equal(created.status, 200)

    // 来源应该是「面板里选的」，不是「默认」。
    const before = await call('GET', '/interviewer/api/config')
    assert.equal(before.body.data.workspaceRoot.source, 'settings')
    assert.equal(before.body.data.workspaceRoot.path, firstRoot)

    // 换目录，并把旧根的数据搬过去。
    const moved = await call('POST', '/interviewer/api/config/workspace-root', {
      path: secondRoot,
      migrateFrom: firstRoot,
    })
    assert.equal(moved.status, 200)
    assert.equal(moved.body.data.migrated.copied, true)
    assert.equal(moved.body.data.migrated.sessions, 1)
    assert.equal(moved.body.data.workspaceRoot.path, secondRoot)

    // 搬过去之后，新根里能看见那场面试；老目录还完好地在那儿（复制，不是移动）。
    const list = await call('GET', '/interviewer/api/sessions')
    assert.equal(list.body.data.sessions.length, 1)
    assert.equal(list.body.data.sessions[0].title, '搬家前的一场')
    assert.ok(existsSync(join(firstRoot, 'workspaces')), '老目录必须原样保留')
  } finally {
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
    await rm(profileDir, { recursive: true, force: true })
    await rm(firstRoot, { recursive: true, force: true })
    await rm(secondRoot, { recursive: true, force: true })
  }
})

test('卷宗库：配置文件写死了的时候，面板里的选择不生效——而且必须说出来', async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const profileDir = join(ROOT, '.tmp-test', `profile-locked-${stamp}`)
  const configuredRoot = join(ROOT, '.tmp-test', `locked-${stamp}`)
  const chosenRoot = join(ROOT, '.tmp-test', `chosen-${stamp}`)
  const previousProfile = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profileDir
  try {
    await writeSettings({ workspaceRoot: configuredRoot })
    const service = new InterviewService({ config: { workspaceRoot: configuredRoot } })
    const call = await makeApi(service)

    const applied = await call('POST', '/interviewer/api/config/workspace-root', { path: chosenRoot })
    assert.equal(applied.status, 200)
    assert.ok(applied.body.data.warning !== undefined, '必须告诉用户「改了但不生效」')
    assert.equal(applied.body.data.workspaceRoot.path, configuredRoot, '配置优先，根没变')
  } finally {
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
    await rm(profileDir, { recursive: true, force: true })
    await rm(configuredRoot, { recursive: true, force: true })
    await rm(chosenRoot, { recursive: true, force: true })
  }
})
