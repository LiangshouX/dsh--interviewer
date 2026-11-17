#!/usr/bin/env node
/**
 * 布局闸门：在几个宽度下渲染面板，断言「关键的东西还在、还点得到」。
 *
 * **为什么需要它。**
 * 这个面板被塞进**别人的**应用里，宿主给多宽不由我们决定：桌面版 DSH
 * 里能分到 1200px，网页版侧栏里可能只有 250px。之前就栽在这里——
 * 右栏写死 396px 且不许收缩，容器一窄，**舞台被压成 0 宽**，
 * 「申请摄像头」那个按钮直接消失，而截图预设全是 1600px 的宽屏，
 * 所以谁也没看见。
 *
 * 这类问题**只能靠断言发现**，靠人眼看图是不行的：截图要人解读，
 * 断言会在 CI 里自己喊。
 *
 * 断言的是**用户能做什么**，不是 DOM 长什么样：
 *   1. 面板没有横向溢出（内容不会跑到看不见的地方）
 *   2. 舞台宽度够（主角不会被挤没）
 *   3. 权限相关的按钮**点得到**（命中测试，不是「看起来在那儿」）
 *   4. 提问条不压住权限按钮（那条「在系统设置里放行」得兑现）
 *
 *   node scripts/layout-check.mjs           # 全跑
 *   node scripts/layout-check.mjs --check   # 闸门用：不过就非 0 退出
 */
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadChromium, launchOptions, serve, ensureReact, openPreview, requestMediaPermission } from './browser.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 面板会被塞进多宽的地方？
 *
 * 这些宽度不是拍脑袋来的：
 *   1600 —— 沙箱宽屏（旧的预设只有这一档，坏了都没人知道）
 *   1200 —— 桌面版 DSH 分给插件的那块
 *   1007 —— 桌面版里插件可用区（含 DSH 自己的侧边栏）
 *    860 —— 中等窗口
 *    760 —— 换挡阈值本身
 *    700 / 560 —— 竖着的窄栏
 *    420 —— 极端窄（手机宽度级别的窗口）
 */
const WIDTHS = [1600, 1200, 1007, 860, 760, 700, 560, 420]
const HEIGHT = 720

/** 在页面里跑的断言。返回问题清单，空数组 = 通过。 */
const ASSERT = () => {
  const problems = []
  const rect = element => {
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, w: box.width, h: box.height, right: box.right, bottom: box.bottom }
  }
  const overlap = (a, b) => {
    const width = Math.min(a.right, b.right) - Math.max(a.x, b.x)
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)
    return width > 1 && height > 1 ? Math.round(width * height) : 0
  }
  const byText = text => Array.from(document.querySelectorAll('*')).find(element =>
    element.children.length === 0 && (element.textContent ?? '').includes(text))

  // 1. 页面本身不横向溢出。
  const doc = document.documentElement
  if (doc.scrollWidth > window.innerWidth + 1) {
    problems.push(`页面横向溢出：scrollWidth=${doc.scrollWidth} > innerWidth=${window.innerWidth}`)
  }
  const page = document.querySelector('[data-iv-page]')
  if (page !== null && page.scrollWidth > page.clientWidth + 1) {
    problems.push(`面板横向溢出：scrollWidth=${page.scrollWidth} > clientWidth=${page.clientWidth}`)
  }

  const stage = document.querySelector('[data-iv-stage]')

  // ── 页头：**窄面板下不许塌** ────────────────────────────────────────
  //
  // 页头是三样东西的入口：品牌记号（在哪）、页签（去哪）、
  // 新建/主题/卷宗库（能做什么）。任何一样被压成 0 宽或被盖住，
  // 面板就变成一张只能看的图。所以每个宽度 × 每个页签都查一遍。
  const mark = document.querySelector('[data-iv-mark]')
  if (mark === null) {
    problems.push('页头没有品牌记号')
  } else {
    const box = rect(mark)
    if (box.w < 18 || box.h < 18) problems.push(`品牌记号被压成 ${Math.round(box.w)}×${Math.round(box.h)}`)
  }
  const brandName = byText('模拟面试间')
  if (brandName === undefined) {
    problems.push('页头没有产品名')
  } else {
    const box = rect(brandName)
    if (box.w < 20 || box.h < 10) problems.push(`产品名被压成 ${Math.round(box.w)}×${Math.round(box.h)}`)
  }
  const headerButtons = [
    ['新建面试', () => Array.from(document.querySelectorAll('button'))
      .find(element => (element.textContent ?? '').trim() === '新建面试')],
    ['主题切换', () => document.querySelector('button[aria-label*="主题"]')],
    ['卷宗库芯片', () => document.querySelector('[data-iv-root]')],
  ]
  for (const [label, find] of headerButtons) {
    const element = find()
    if (element === undefined || element === null) {
      problems.push(`页头找不到「${label}」`)
      continue
    }
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const box = rect(element)
    if (box.w < 20 || box.h < 16) {
      problems.push(`页头「${label}」被压成 ${Math.round(box.w)}×${Math.round(box.h)}，点不到`)
      continue
    }
    const hit = document.elementFromPoint(box.x + box.w / 2, box.y + box.h / 2)
    if (hit === null || !(hit === element || element.contains(hit) || hit.contains(element))) {
      const who = hit === null ? '（视口外）' : `被「${(hit.textContent ?? '').trim().slice(0, 12)}」盖住`
      problems.push(`页头「${label}」点不到：${who}`)
    }
  }

  if (stage !== null) {
    const box = rect(stage)
    // 2. 舞台不能被挤没：它是这一页的主角。
    if (box.w < 200) problems.push(`舞台被压扁：宽度只有 ${Math.round(box.w)}px`)
    if (box.x < -1) problems.push(`舞台跑到面板外：left=${Math.round(box.x)}`)

    // 3. 权限按钮点得到：真的做一次命中测试。
    for (const label of ['申请摄像头与麦克风', '重新检测授权状态']) {
      const button = byText(label)
      if (button === undefined) {
        problems.push(`找不到按钮「${label}」`)
        continue
      }
      button.scrollIntoView({ block: 'center', inline: 'nearest' })
      const box2 = rect(button)
      if (box2.w < 40 || box2.h < 20) {
        problems.push(`按钮「${label}」被压成 ${Math.round(box2.w)}×${Math.round(box2.h)}，点不到`)
        continue
      }
      const x = box2.x + box2.w / 2
      const y = box2.y + box2.h / 2
      const hit = document.elementFromPoint(x, y)
      if (hit === null || !(hit === button || button.contains(hit) || hit.contains(button))) {
        const who = hit === null ? '（视口外）' : `被「${(hit.textContent ?? '').trim().slice(0, 12)}」盖住`
        problems.push(`按钮「${label}」点不到：${who}`)
      }
    }

    // 4. 提问条不许压住权限按钮。
    const rule = byText('等待提问')
    if (rule !== undefined) {
      const ruleBox = rect(rule)
      for (const label of ['申请摄像头与麦克风', '重新检测授权状态']) {
        const button = byText(label)
        if (button === undefined) continue
        const area = overlap(ruleBox, rect(button))
        if (area > 0) problems.push(`提问条压住按钮「${label}」：重叠 ${area}px²`)
      }
    }
  }
  return problems
}

/** 面板当前的底色——用来证明主题切换真的生效了（而不是只换了个属性名）。 */
const BACKDROP = () => {
  const page = document.querySelector('[data-iv-page]')
  if (page === null) return ''
  return getComputedStyle(page).backgroundColor
}

/** 根节点上声明的主题名。 */
const THEME_NAME = () => document.querySelector('[data-iv-page]')?.getAttribute('data-iv-theme') ?? ''

async function main() {
  const check = process.argv.includes('--check')
  let chromium
  try {
    chromium = loadChromium(ROOT)
  } catch (error) {
    console.log('跳过：没装 playwright（npm install --save-dev playwright-core）')
    return
  }
  await ensureReact(ROOT)
  const { server, port } = await serve(ROOT)
  const browser = await chromium.launch(launchOptions())
  const failures = []
  try {
    for (const width of WIDTHS) {
      const preset = { tab: 1, media: 'denied', width, height: HEIGHT }
      const { page, errors } = await openPreview(browser, { port, preset })
      try {
        // 权限被拒的真实态：错误框和两个按钮都在，才谈得上「点得到」。
        const asked = await requestMediaPermission(page)
        if (!asked) failures.push(`${width}px：点不到「申请摄像头与麦克风」——它被别的东西盖住了`)
        // 四个页签都点一遍：**设置也是页签**，不是第四个没人点的按钮。
        // 每点一次都验证根节点上的 `data-iv-tab` 真的变了——
        // 「点了但没换页」正是截图闸门把设置页截成准备页的那类缺陷。
        for (const [key, label] of [['live', '面试中'], ['prepare', '准备'], ['report', '报告'], ['settings', '设置']]) {
          try {
            await page.getByText(label, { exact: true }).first().click({ timeout: 5000 })
          } catch {
            failures.push(`${width}px：点不到页签「${label}」`)
            continue
          }
          await page.waitForTimeout(500)
          const shown = await page.evaluate(
            () => document.querySelector('[data-iv-page]')?.getAttribute('data-iv-tab') ?? '',
          )
          if (shown !== key) {
            failures.push(`${width}px：点了页签「${label}」，面板却停在「${shown === '' ? '未知' : shown}」`)
          }
          const problems = await page.evaluate(ASSERT)
          for (const problem of problems) failures.push(`${width}px / ${label}：${problem}`)
        }

        // 主题切换：换完底色必须真的变了，布局也不能塌。
        //
        // 这一条挡的是「以为切了、其实没切」——颜色全写在 JS 里的时候，
        // 漏掉一处就永远换不掉，而这种问题看代码是看不出来的。
        const before = await page.evaluate(BACKDROP)
        const themeBefore = await page.evaluate(THEME_NAME)
        try {
          // 按钮的可访问名是 aria-label（「切换到亮色主题」），
          // 可见文字是「亮色」——aria-label 会覆盖文字，所以按 label 找。
          await page.getByRole('button', { name: /(亮色|暗色)主题/ }).first().click({ timeout: 5000 })
        } catch {
          failures.push(`${width}px：主题切换按钮点不到`)
        }
        await page.waitForTimeout(400)
        const after = await page.evaluate(BACKDROP)
        const themeAfter = await page.evaluate(THEME_NAME)
        if (themeBefore === themeAfter) {
          failures.push(`${width}px：点了主题按钮，主题没变（还是 ${themeAfter}）`)
        }
        if (before === after) {
          failures.push(`${width}px：主题变了但底色没变（${after}）`)
        }
        // 切主题不该顺手换页：布局闸门停在「设置」上，切完还得在设置上。
        const shownAfterTheme = await page.evaluate(
          () => document.querySelector('[data-iv-page]')?.getAttribute('data-iv-tab') ?? '',
        )
        if (shownAfterTheme !== 'settings') {
          failures.push(`${width}px：切换主题后没停在设置页（停在「${shownAfterTheme === '' ? '未知' : shownAfterTheme}」）`)
        }
        const problems = await page.evaluate(ASSERT)
        for (const problem of problems) failures.push(`${width}px / ${themeAfter}：${problem}`)

        if (errors.length > 0) failures.push(`${width}px：页面报错 ${errors[0]}`)
      } finally {
        await page.close()
      }
    }

    // **「麦克风通了、摄像头没通」这一档。**
    //
    // 这是 DSH 桌面端的真实情况：错误框更长、按钮文案不同（补上摄像头），
    // 而且多了一个已经接上的设备。窄面板下最容易把按钮挤出可视区——
    // 所以这一档单独盯两个宽度：真实宿主的那个，和最窄的那个。
    for (const width of [1007, 420]) {
      const preset = { tab: 1, media: 'partial', width, height: HEIGHT }
      const { page, errors } = await openPreview(browser, { port, preset })
      try {
        await requestMediaPermission(page)
        await page.waitForTimeout(400)
        const problems = await page.evaluate(() => {
          const found = []
          const buttons = Array.from(document.querySelectorAll('button'))
          const retry = buttons.find(button => (button.textContent || '').trim() === '补上摄像头')
          const text = document.body.innerText ?? ''
          if (retry === undefined) {
            found.push('没有「补上摄像头」按钮')
          } else {
            const rect = retry.getBoundingClientRect()
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            if (hit !== retry && !(hit !== null && retry.contains(hit))) {
              found.push('「补上摄像头」按钮被别的元素盖住了')
            }
          }
          if (!text.includes('麦克风已接上')) found.push('错误框没说清「麦克风已接上」')
          if (document.documentElement.scrollWidth > window.innerWidth + 1) found.push('出现横向溢出')
          return found
        })
        for (const problem of problems) failures.push(`${width}px / 麦克风通·摄像头挡：${problem}`)
        if (errors.length > 0) failures.push(`${width}px / 麦克风通·摄像头挡：页面报错 ${errors[0]}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(`\n✗ 布局闸门未通过（${failures.length} 项）：`)
    for (const failure of failures) console.error(`   ${failure}`)
    if (check) process.exit(1)
    process.exit(1)
  }
  console.log(`✓ 布局闸门通过：${WIDTHS.length} 个宽度 × 4 个页签，无溢出、无遮挡、按钮可点`)
}

main().catch(error => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
