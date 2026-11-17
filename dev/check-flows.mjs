#!/usr/bin/env node
/**
 * 临时探针：把这轮改的交互真跑一遍。
 *
 *   · 提醒条浮起来、不改变布局、会自己退场
 *   · 放大窗口在页头之上、预览/编辑双模式
 *   · 有未保存改动时关不掉，给出警告与「放弃修改」
 *   · 简历保存分流（覆盖 / 存为新简历）与命名
 *   · 简历库弹层（行即动作）
 *
 * 任何一条不符合就非 0 退出——这不是截图，是断言。
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
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
    preset: { name: 'flow', tab: 0, media: 'denied', width: 1187, height: 900 },
  })

  // ── 1. 提醒条：浮层、不挤布局、自己退场 ─────────────────────────────
  // 位置的度量要**抵消滚动**：Playwright 点击前会把按钮滚进视口，
  // 那 1px 的滚动会被误读成「提醒条挤动了布局」。
  const cardTop = () => page.evaluate(() => {
    const card = [...document.querySelectorAll('[data-iv-page] .iv-enter')]
      .find(el => (el.textContent ?? '').startsWith('这场面试'))
    if (card === undefined) return null
    let node = card.parentElement
    let scroll = 0
    while (node !== null && node !== undefined) {
      const style = getComputedStyle(node)
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') { scroll = node.scrollTop; break }
      node = node.parentElement
    }
    return Math.round(card.getBoundingClientRect().top + scroll)
  })
  const before = await cardTop()
  await page.getByRole('button', { name: '保存', exact: true }).first().click()
  await page.waitForTimeout(450)
  await ok('提醒条是一个浮层', async () =>
    assert.equal(await page.locator('[data-iv-notice]').count(), 1))
  // 把鼠标移开再量：卡片有 1px 的悬停抬升（`.iv-lift`），
  // 停在按钮上量到的 1px 是悬停效果，不是布局被挤动。
  await page.mouse.move(4, 4)
  await page.waitForTimeout(320)
  const after = await cardTop()
  await ok('提醒条不改变布局', async () => assert.equal(after, before))
  const noticeBox = await page.locator('[data-iv-notice]').boundingBox()
  await ok('提醒条按内容收窄（不是整页横幅）', async () =>
    assert.ok(noticeBox !== null && noticeBox.width < 900))
  const gone = await page.waitForSelector('[data-iv-notice]', { state: 'detached', timeout: 6000 })
    .then(() => true).catch(() => false)
  await ok('提醒条会自己退场', async () => assert.equal(gone, true))

  // ── 2. 放大窗口在页头之上，预览/编辑两种模式 ────────────────────────
  // **故意注入旧样式**：插件热替换时文档里可能还留着上一版的
  // `[data-iv-page] > * { z-index: 1 }`。主区的内联 `z-index: auto`
  // 必须能把它顶掉，否则「弹窗被页头切掉」会以"修了但没生效"的形式复现。
  const legacyStyle = await page.addStyleTag({ content: '[data-iv-page] > * { z-index: 1; }' })
  await page.getByTitle('放大预览（可编辑）').first().click()
  await page.waitForTimeout(500)
  const head = await page.evaluate(() => {
    const headEl = document.querySelector('[data-iv-head]')
    const r = headEl.getBoundingClientRect()
    const top = document.elementFromPoint(Math.min(r.width / 2, 500), 60)
    return { inHead: headEl.contains(top), dialogs: document.querySelectorAll('[role="dialog"]').length }
  })
  await ok('旧 z-index 样式残留时，放大窗口仍能盖住页头', async () => assert.equal(head.inHead, false))
  await legacyStyle.evaluate(element => element.remove())
  await ok('只有一个放大窗口', async () => assert.equal(head.dialogs, 1))
  const dialogBox = await page.locator('[role="dialog"]').first().boundingBox()
  await ok('放大窗口顶部完整可见', async () => assert.ok(dialogBox !== null && dialogBox.y >= 0))
  const previewText = await page.locator('[role="dialog"]').first().textContent()
  await ok('预览是渲染后的 markdown', async () => assert.match(previewText ?? '', /工作经历/))
  await ok('预览里看不到源码标记', async () => assert.ok(!(previewText ?? '').includes('## ')))

  // ── 3. 编辑模式：脏了关不掉，有警告与出路 ──────────────────────────
  const dialog = page.locator('[role="dialog"]').first()
  await dialog.getByRole('button', { name: '编辑', exact: true }).click()
  await page.waitForTimeout(300)
  const area = page.locator('textarea').first()
  const original = await area.inputValue()
  await ok('编辑模式是保真源码', async () => assert.match(original, /工作经历/))
  // 编辑区要**把窗口用起来**：给 maxHeight 不给 height 时，卡片只长到
  // 内容那么高，在宽屏上就是"缩成一小坨"。
  const areaBox = await area.boundingBox()
  const viewportHeight = await page.evaluate(() => window.innerHeight)
  await ok('编辑区占满窗口高度（不是一小坨）', async () =>
    assert.ok(areaBox !== null && areaBox.height > viewportHeight * 0.5))
  await area.fill(`${original}\n（探针补充一行）`)
  await page.waitForTimeout(300)
  await ok('编辑有改动才出现【保存】', async () =>
    assert.ok((await dialog.getByRole('button', { name: '保存', exact: true }).count()) >= 1))
  // 点遮罩（窗口外）
  await page.mouse.click(8, 8)
  await page.waitForTimeout(300)
  await ok('有未保存改动时点遮罩不关闭', async () =>
    assert.equal(await page.locator('[role="dialog"]').count(), 1))
  await ok('顶部浮出黄色警告', async () =>
    assert.ok((await page.getByText('请先保存变更内容后再关闭！').count()) >= 1))
  await page.getByRole('button', { name: '放弃修改' }).click()
  await page.waitForTimeout(350)
  await ok('「放弃修改」之后窗口真的关了', async () =>
    assert.equal(await page.locator('[role="dialog"]').count(), 0))

  // ── 4. 保存分流：存为新简历 + 命名 ────────────────────────────────
  await page.getByTitle('放大预览（可编辑）').first().click()
  await page.waitForTimeout(400)
  await dialog.getByRole('button', { name: '编辑', exact: true }).click()
  await page.waitForTimeout(250)
  await page.locator('textarea').first().fill(`${original}\n（探针：存成新简历）`)
  await page.waitForTimeout(250)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForTimeout(350)
  const stripText = await dialog.textContent()
  await ok('保存时先问存到哪', async () => assert.match(stripText ?? '', /这一版存到哪/))
  await ok('分流里有「覆盖原简历 / 保存到这场」', async () =>
    assert.equal(await dialog.getByRole('button', { name: /覆盖原简历|保存到这场/ }).count(), 1))
  await dialog.getByRole('button', { name: '存为新简历' }).click()
  await page.waitForTimeout(350)
  const nameInput = dialog.locator('input[type="text"]').first()
  await ok('新建时要求命名', async () => assert.equal(await nameInput.count(), 1))
  await nameInput.fill('探针 · 新简历')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForTimeout(1000)
  await ok('保存完回到预览（窗口还在）', async () =>
    assert.equal(await page.locator('[role="dialog"]').count(), 1))
  await ok('保存后不再留在编辑态', async () =>
    assert.equal(await page.locator('[role="dialog"] textarea').count(), 0))
  const savedText = await dialog.textContent()
  await ok('保存的正文已经生效', async () => assert.match(savedText ?? '', /探针：存成新简历/))
  const toast = await page.locator('[data-iv-notice]').textContent().catch(() => '')
  await ok('提示「已存进简历库」', async () => assert.match(toast ?? '', /已存进简历库/))
  await dialog.getByRole('button', { name: '关闭' }).click()
  await page.waitForTimeout(350)

  // ── 5. 上传文件：读进草稿，不直接落盘 ──────────────────────────────
  await page.getByTitle('放大预览（可编辑）').first().click()
  await page.waitForTimeout(400)
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: 'upload.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('探针上传的简历正文\n第二行', 'utf8'),
  })
  await page.waitForTimeout(900)
  const draftText = await page.locator('[role="dialog"] textarea').first().inputValue().catch(() => '')
  await ok('上传后进入编辑态、正文进草稿', async () => assert.match(draftText, /探针上传的简历正文/))
  await ok('上传之后出现【保存】（还没落盘）', async () =>
    assert.ok((await dialog.getByRole('button', { name: '保存', exact: true }).count()) >= 1))
  await page.mouse.click(8, 8)
  await page.waitForTimeout(300)
  await ok('未保存的上传内容同样受保护', async () =>
    assert.equal(await page.locator('[role="dialog"]').count(), 1))
  await dialog.getByRole('button', { name: '放弃修改' }).click()
  await page.waitForTimeout(350)

  // ── 6. JD 上传：只收纯文本 ────────────────────────────────────────
  // 准备页有两张纸：第一张简历、第二张 JD。
  await page.getByTitle('放大预览（可编辑）').nth(1).click()
  await page.waitForTimeout(400)
  await ok('JD 窗口默认是预览', async () => assert.equal(await dialog.locator('textarea').count(), 0))
  await dialog.getByRole('button', { name: '编辑', exact: true }).click()
  await page.waitForTimeout(250)
  const jdBef = await dialog.locator('textarea').first().inputValue()
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: 'jd.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('PK\x03\x04junk'),
  })
  await page.waitForTimeout(800)
  const jdAfter = await dialog.locator('textarea').first().inputValue()
  const jdToast = await page.locator('[data-iv-notice]').textContent().catch(() => '')
  await ok('JD 拒绝 docx 并说明只收纯文本', async () => assert.match(jdToast ?? '', /JD 只收纯文本/))
  await ok('被拒的文件没有改到正文', async () => assert.equal(jdAfter, jdBef))
  await dialog.getByRole('button', { name: '关闭' }).click()
  await page.waitForTimeout(300)

  // ── 7. 简历库弹层：整行就是动作 ───────────────────────────────────
  await page.getByRole('button', { name: /简历库 \d/ }).click()
  await page.waitForTimeout(400)
  const menuRows = await page.locator('[role="menu"] button[title^="用「"]').count()
  await ok('简历库弹层打开且有行', async () => assert.ok(menuRows >= 3))
  await page.locator('[role="menu"] button[title^="用「"]').first().click()
  await page.waitForTimeout(800)
  await ok('换完自动收起', async () => assert.equal(await page.locator('[role="menu"]').count(), 0))
  const appliedToast = await page.locator('[data-iv-notice]').textContent().catch(() => '')
  await ok('换简历也有提示', async () => assert.match(appliedToast ?? '', /换上了/))

  const pageErrors = errors.filter(item => !/favicon/.test(item))
  await ok('没有页面错误', async () => assert.deepEqual(pageErrors, []))
} finally {
  await browser.close()
  server.close()
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} 条失败：\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('✓ 交互探针全部通过')
