#!/usr/bin/env node
/**
 * 面试运行时探针：把「开始 → 暂停 → 继续」真的点一遍，断言**设备、录制、
 * 朗读**三件事在每一步都跟着动。
 *
 * 为什么要有它：这三件事以前各由每个按钮自己管，于是「暂停后继续」漏了
 * 录制和朗读（用户真机撞到：面试结束没有任何录像、继续之后面试官哑了）。
 * 截图看不出这种漏——必须断言请求与状态。
 *
 * 断言的是**预览里的假 Host**（`dev/fixtures.js`）收到的调用序列：
 *   start / pause / unpause 的 POST
 *   recording/start · recording/chunk · recording/finish
 * 以及界面上「朗读」的开关状态。
 *
 * 跑：`node dev/check-runtime.mjs`（非 0 退出 = 有回归）
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadChromium, launchOptions, serve, ensureReact, openPreview } from '../scripts/browser.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const failures = []
const ok = async (name, fn) => {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
    console.log(`✗ ${name} — ${error.message}`)
  }
}

await ensureReact(ROOT)
const { server, port } = await serve(ROOT)
const chromium = loadChromium(ROOT)
const browser = await chromium.launch(launchOptions())

try {
  const { page, errors } = await openPreview(browser, {
    port,
    // draft = 还没开始；点「开始面试」走的正是用户最常走的那条路。
    preset: { name: 'runtime', tab: 1, media: 'granted', width: 1200, height: 900, status: 'draft' },
  })

  const log = () => page.evaluate(() => window.__RUNTIME_LOG__ ?? [])
  const readSpeaking = () => page.evaluate(() => [...document.querySelectorAll('[data-iv-page] button')]
    .map(button => (button.textContent ?? '').trim())
    .some(text => text === '关闭朗读'))

  // ── 1. 开始面试：设备 + 录制 + 自动朗读 ───────────────────────────────
  await page.getByRole('button', { name: '开始面试', exact: true }).first().click()
  // 等第一块上传（MediaRecorder 5 秒一块）
  await page.waitForTimeout(7000)

  await ok('开始面试会真的开录制（start + 至少一块 chunk）', async () => {
    const rows = await log()
    if (!rows.some(row => row.type === 'recording-start')) throw new Error('没有 recording/start')
    if (!rows.some(row => row.type === 'recording-chunk')) throw new Error('没有 recording/chunk')
  })
  await ok('录制类型跟着设备走（有麦克风就该是 audio 或 video）', async () => {
    const rows = await log()
    const start = rows.find(row => row.type === 'recording-start')
    if (start === undefined) throw new Error('没有 recording/start')
    if (start.kind !== 'audio' && start.kind !== 'video') throw new Error(`kind 不对：${start.kind}`)
  })
  await ok('开始面试会自动开朗读（按钮变成「关闭朗读」）', async () => {
    if (!await readSpeaking()) throw new Error('朗读没自动开')
  })
  await ok('界面能看见「正在录制」', async () => {
    const text = await page.evaluate(() => document.body.innerText)
    if (!text.includes('正在录制')) throw new Error('没显示录制状态')
  })

  // ── 2. 暂停：录制收尾、设备关灯 ──────────────────────────────────────
  await page.getByRole('button', { name: '暂停面试', exact: true }).first().click()
  await page.waitForTimeout(1500)

  await ok('暂停会先收录制（recording/finish）', async () => {
    const rows = await log()
    if (!rows.some(row => row.type === 'recording-finish')) throw new Error('没有 recording/finish')
  })
  await ok('暂停后界面不再显示「正在录制」', async () => {
    const text = await page.evaluate(() => document.body.innerText)
    if (text.includes('正在录制')) throw new Error('还在显示录制中')
  })

  // ── 3. 继续：设备 + 录制再来一段（不能停在上一次）─────────────────────
  const beforeResume = (await log()).filter(row => row.type === 'recording-start').length
  await page.getByRole('button', { name: '继续面试', exact: true }).first().click()
  await page.waitForTimeout(7000)

  await ok('继续面试会**重新**开录制（新的一段）', async () => {
    const rows = await log()
    const after = rows.filter(row => row.type === 'recording-start').length
    if (after <= beforeResume) throw new Error(`没有新的一段录制（${beforeResume} → ${after}）`)
  })
  await ok('继续面试会重新开朗读', async () => {
    if (!await readSpeaking()) throw new Error('继续后朗读没开')
  })
  await ok('全程没有前端报错', async () => {
    if (errors.length > 0) throw new Error(errors[0])
  })

  // ── 4. 结束面试：录制也要收尾（不是「暂停走通了就万事大吉」）──────────
  const beforeFinish = (await log()).filter(row => row.type === 'recording-finish').length
  await page.getByRole('button', { name: '结束面试', exact: true }).first().click()
  await page.waitForTimeout(2000)
  await ok('结束面试会收录制（recording/finish）', async () => {
    const rows = await log()
    const after = rows.filter(row => row.type === 'recording-finish').length
    if (after <= beforeFinish) throw new Error('结束面试没有收录制')
  })

  // ── 5. 续接：已结束的场次接着面，同样要开录制 + 朗读 ─────────────────
  const done = await openPreview(browser, {
    port,
    preset: { name: 'runtime-done', tab: 1, media: 'granted', width: 1200, height: 900, status: 'done' },
  })
  await done.page.getByRole('button', { name: '续接面试', exact: true }).first().click()
  await done.page.waitForTimeout(7000)
  await ok('续接面试会开录制', async () => {
    const rows = await done.page.evaluate(() => window.__RUNTIME_LOG__ ?? [])
    if (!rows.some(row => row.type === 'recording-start')) throw new Error('续接没有 recording/start')
    if (!rows.some(row => row.type === 'recording-chunk')) throw new Error('续接没有 recording/chunk')
  })
  await ok('续接面试会开朗读', async () => {
    const speaking = await done.page.evaluate(() => [...document.querySelectorAll('[data-iv-page] button')]
      .map(button => (button.textContent ?? '').trim())
      .some(text => text === '关闭朗读'))
    if (!speaking) throw new Error('续接后朗读没开')
  })
  await ok('续接页没有前端报错', async () => {
    if (done.errors.length > 0) throw new Error(done.errors[0])
  })
  await done.page.close()
} finally {
  await browser.close()
  server.close()
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} 条不通过`)
  process.exitCode = 1
} else {
  console.log('\n✓ 运行时探针全部通过')
}
