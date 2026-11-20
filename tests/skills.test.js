/**
 * 随包技能的**可见范围**：只在面试工作区里露头。
 *
 * 根因（这一版修的）
 * ----------------
 * `ctx.skills.registerProvider()` 注册进的是**全局层**（插件的行不属任何
 * agent preset），所以 `interview-prep` / `interview-conduct` 这两个名字
 * 原本出现在**每一个**会话的技能目录里——哪怕用户正在写代码，和面试
 * 毫无关系。技能目录是模型每轮都读的东西，那是实打实的噪声。
 *
 * 注册表没有「按工作目录过滤 provider」的开关，过滤只能由 provider 自己
 * 做：`list()` 收到查询的 cwd，于是按 cwd 判断它是不是面试工作区。
 *
 * 这一份钉住三件事：
 *   ① 路径判定本身（同目录 / 子目录 / 别处 / 没给 cwd）；
 *   ② 面试工作区里，两个技能**照常可见**（主线不能断）；
 *   ③ 别的���作区里，provider 交出**空目录**，正文也取不到。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isInterviewWorkspace, registerInterviewSkills, splitFrontmatter } from '../src/host/skills.js'
import { SKILL_DIR } from '../src/host/paths.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

test('frontmatter 拆分：只认单行 key: value', () => {
  const { fields, body } = splitFrontmatter('---\nname: demo\ndescription: "一个说明"\n---\n正文在这里\n')
  assert.equal(fields.name, 'demo')
  assert.equal(fields.description, '一个说明')
  assert.equal(body.trim(), '正文在这里')
})

test('工作目录判定：同一个目录与它的子目录算「面试工作区」', () => {
  const root = join(ROOT, 'data-root')
  assert.equal(isInterviewWorkspace(root, root), true)
  assert.equal(isInterviewWorkspace(root, join(root, 'workspaces', 'abc')), true)
})

test('工作目录判定：别处不算', () => {
  const root = join(ROOT, 'data-root')
  assert.equal(isInterviewWorkspace(root, join(ROOT, 'elsewhere')), false)
  // 同前缀的兄弟目录不算（D:\root2 不是 D:\root 的子目录）
  assert.equal(isInterviewWorkspace(root, `${root}-other`), false)
})

test('工作目录判定：没给工作目录、或者根目录本身没定，都不算', () => {
  const root = join(ROOT, 'data-root')
  assert.equal(isInterviewWorkspace(root, undefined), false)
  assert.equal(isInterviewWorkspace(root, ''), false)
  assert.equal(isInterviewWorkspace('', root), false)
  assert.equal(isInterviewWorkspace(undefined, root), false)
})

test('工作目录判定：Windows 上不分大小写', { skip: process.platform !== 'win32' ? '只在 Windows 上有意义' : false }, () => {
  const root = 'D:\\DSH-REALTIME-INTERVIEW'
  assert.equal(isInterviewWorkspace(root, 'd:\\dsh-realtime-interview'), true)
  assert.equal(isInterviewWorkspace(root, 'd:\\dsh-realtime-interview\\workspaces\\x'), true)
  assert.equal(isInterviewWorkspace(root, 'd:\\dsh-other'), false)
})

/** 一个假的服务：只回答「面试工作区在哪」。 */
function fakeService(root) {
  return { effectiveRoot: async () => root }
}

/** 一个假的宿主技能注册表：把 provider 存起来，好在测试里直接调。 */
function fakeCtx() {
  const state = { provider: undefined }
  return {
    state,
    ctx: {
      get: name => (name === 'skills'
        ? {
            registerProvider(create) {
              state.provider = create({ signal: new AbortController().signal, invalidate() {} })
              return () => { state.provider = undefined }
            },
          }
        : undefined),
    },
  }
}

test('面试工作区里：两个随包技能照常可见', { skip: existsSync(SKILL_DIR) ? false : '还没构建（build/skills 不存在）' }, async () => {
  const root = join(ROOT, 'data-root')
  const { ctx, state } = fakeCtx()
  registerInterviewSkills(ctx, fakeService(root))
  const observation = await state.provider.list({ cwd: root })
  assert.equal(observation.complete, true)
  const names = observation.candidates.map(item => item.name).sort()
  assert.deepEqual(names, ['interview-conduct', 'interview-prep'])
})

test('别的工作区里：provider 交出空目录', async () => {
  const root = join(ROOT, 'data-root')
  const { ctx, state } = fakeCtx()
  registerInterviewSkills(ctx, fakeService(root))
  const observation = await state.provider.list({ cwd: join(ROOT, 'some-other-project') })
  assert.equal(observation.complete, true)
  assert.deepEqual(observation.candidates, [])
})

test('没有工作目录时：不交出技能（宁可少露头，也不要四处乱冒）', async () => {
  const root = join(ROOT, 'data-root')
  const { ctx, state } = fakeCtx()
  registerInterviewSkills(ctx, fakeService(root))
  const observation = await state.provider.list({})
  assert.deepEqual(observation.candidates, [])
})

test('别的工作区里：拿着旧目录也取不到正文', { skip: existsSync(SKILL_DIR) ? false : '还没构建（build/skills 不存在）' }, async () => {
  const root = join(ROOT, 'data-root')
  const { ctx, state } = fakeCtx()
  registerInterviewSkills(ctx, fakeService(root))
  const inside = await state.provider.list({ cwd: root })
  const candidate = inside.candidates[0]
  assert.ok(candidate !== undefined)
  const outside = await state.provider.get(candidate, { cwd: join(ROOT, 'some-other-project') })
  assert.equal(outside, undefined)
  const back = await state.provider.get(candidate, { cwd: root })
  assert.ok(back !== undefined)
  assert.ok(back.content.length > 0)
})

test('宿主没有 skills 服务时：安静地不注册', () => {
  assert.equal(registerInterviewSkills({ get: () => undefined }, fakeService(ROOT)), undefined)
})
