import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultWorkspaceRoot,
  defaultWorkspaceRootReason,
  describeWorkspaceRoot,
  readSettings,
  settingsPath,
  writeSettings,
} from '../src/host/paths.js'

// Windows 上它会给出 `/D:/Code/...`，后面 `resolve()` 会把它拼成
// `D:\D:\Code\...`——目录凭空多出一层盘符。
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The Windows system drive, normally `C:`. */
function systemDrive() {
  const value = process.env.SystemDrive
  const trimmed = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]:$/.test(trimmed) ? trimmed : 'C:'
}

test('默认工作区根：Windows 上优先非系统盘', () => {
  const root = defaultWorkspaceRoot()
  assert.ok(root.length > 0)

  if (process.platform !== 'win32') {
    // 其他系统只有家目录这一处可去。
    assert.equal(root, join(homedir(), 'DSH-REALTIME-INTERVIEW'))
    return
  }

  // 有非系统盘就用它——系统盘装的是系统和用户目录，数据不该塞进去。
  const others = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
    .filter(letter => `${letter}:` !== systemDrive())
    .filter(letter => existsSync(`${letter}:\\`))
  if (others.length > 0) {
    assert.ok(root.toUpperCase().startsWith(`${others[0]}:`), `默认根应该落在 ${others[0]} 盘，实际 ${root}`)
    assert.ok(!root.toUpperCase().startsWith(`${systemDrive()}\\`), `默认根不该落在系统盘 ${systemDrive()}`)
    return
  }
  // 一块盘都没有的话，退回家目录——没得挑。
  assert.equal(root, join(homedir(), 'DSH-REALTIME-INTERVIEW'))
})

test('默认工作区根：理由要说清「为什么是这个目录」', () => {
  const reason = defaultWorkspaceRootReason()
  assert.ok(reason.includes('默认工作区根'), reason)
  // 界面把这句话当 tooltip 显示，所以它必须自解释，不能只说「默认」。
  assert.ok(reason.includes('浏览'), '理由里要告诉用户还能改')
})

test('工作区根的来源要分得清：配置 / 面板里选的 / 默认', async () => {
  const configured = await describeWorkspaceRoot(join(ROOT, '.tmp-test', 'src-config'), true)
  assert.equal(configured.source, 'config')
  assert.ok(configured.reason.includes('配置'))

  const saved = await describeWorkspaceRoot(join(ROOT, '.tmp-test', 'src-config'), false, join(ROOT, '.tmp-test', 'src-settings'))
  assert.equal(saved.source, 'settings')
  assert.ok(saved.reason.includes('面板'))

  const fallback = await describeWorkspaceRoot(join(ROOT, '.tmp-test', 'src-config'), false)
  assert.equal(fallback.source, 'default')

  await rm(join(ROOT, '.tmp-test', 'src-config'), { recursive: true, force: true })
  await rm(join(ROOT, '.tmp-test', 'src-settings'), { recursive: true, force: true })
})

test('配置优先于面板里选的', async () => {
  const fromConfig = await describeWorkspaceRoot(
    join(ROOT, '.tmp-test', 'prio-config'),
    true,
    join(ROOT, '.tmp-test', 'prio-settings'),
  )
  assert.equal(fromConfig.source, 'config', '配置文件写死的优先级最高')
  await rm(join(ROOT, '.tmp-test', 'prio-config'), { recursive: true, force: true })
})

test('设置文件：写在 profile 目录里，读得回来', async () => {
  const profileDir = join(ROOT, '.tmp-test', `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const previous = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profileDir
  try {
    assert.equal(settingsPath(), join(profileDir, 'dsh-realtime-interview.json'))

    // 写之前没有设置——读不到就是「还没选过」，不能当成错误。
    assert.deepEqual(await readSettings(), {})

    await writeSettings({ workspaceRoot: 'D:\\DSH-REALTIME-INTERVIEW' })
    const settings = await readSettings()
    assert.equal(settings.workspaceRoot, 'D:\\DSH-REALTIME-INTERVIEW')

    // 坏文件不能把插件搞挂。
    const { writeFile } = await import('node:fs/promises')
    await writeFile(settingsPath(), '{ 这不是 JSON', 'utf8')
    assert.deepEqual(await readSettings(), {})
  } finally {
    if (previous === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previous
    rmSync(profileDir, { recursive: true, force: true })
  }
})
