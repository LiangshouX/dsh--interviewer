#!/usr/bin/env node
/**
 * 截图工具：在真浏览器里渲染面板并存图。
 *
 * **为什么要有它。** 视觉这事，靠读代码是判断不了的——必须看图。
 * 这个脚本把 `client.js` 挂进 Chromium，按预设的几种状态各截一张，
 * 供人工（或 AI）逐张点评。
 *
 *   node dev/shoot.mjs                # 截全部预设
 *   node dev/shoot.mjs prepare live   # 只截指定预设
 *
 * 产物默认在 `dev/shots/`（gitignore）。想放到别处（例如工作区根下的 `tmp/`，
 * 方便在远程/共享目录里直接看）就设 `DSH_IV_SHOTS`：
 *
 *   DSH_IV_SHOTS=../tmp/screens node dev/shoot.mjs
 *
 * **为什么要可配。** 截图是给人看的产物，不是仓库的一部分。放哪儿取决于
 * 谁要看它——本地看图就 dev/shots，远程评审就放到共享路径上。
 *
 * **预设必须覆盖窄面板。** 面板是被塞进别人家应用里的，宿主给多宽不由
 * 我们决定：桌面版 DSH 里是一千多像素，网页版侧栏里可能只有两百多像素。
 * 以前预设全是 1600px 的宽屏，于是「舞台被压成 0 宽」这种事
 * 只能在真机上撞见——而真机不一定有人在旁边看。
 */
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rm, mkdir } from 'node:fs/promises'
import { loadChromium, launchOptions, serve, ensureReact, openPreview, requestMediaPermission } from '../scripts/browser.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/** 截图输出目录：`DSH_IV_SHOTS` 优先（相对路径按仓库根解析），否则 `dev/shots/`。 */
const SHOTS = (() => {
  const custom = (process.env.DSH_IV_SHOTS ?? '').trim()
  if (custom === '') return join(HERE, 'shots')
  return resolve(ROOT, custom)
})()

/**
 * 预设。每一档都要能回答「它为什么存在」——
 * 存在理由说不清的那一档，说明它只是别人的截图习惯，不是这里的缺口。
 */
const PRESETS = [
  // 三页的基本形态：亮暗两套主题各看一遍。
  { name: 'prepare', tab: 0, media: 'granted', width: 1600, height: 1000 },
  // 等助手返回：真的 loading（Host 给 waiting），不是本地假转圈。
  { name: 'prepare-drafting', tab: 0, media: 'granted', width: 1600, height: 1000, tasks: 'drafting' },
  { name: 'live', tab: 1, media: 'granted', width: 1600, height: 1000 },
  { name: 'live-media-denied', tab: 1, media: 'denied', width: 1600, height: 1000 },
  { name: 'report', tab: 2, media: 'granted', width: 1600, height: 1000 },
  // 失败也要有终点：reason + hint + 重试/忽略，不是一直转圈。
  { name: 'report-failed', tab: 2, media: 'granted', width: 1007, height: 704, tasks: 'report-failed' },
  // **设置页。** `openPreview()` 只点「准备 / 面试中 / 报告」三个页签，
  // 所以 tab=3 的预设必须由这里自己点一次——这正是 settings.png 曾经
  // 截成准备页、变成一张没人看的假图的原因。
  { name: 'settings', tab: 3, tabLabel: '设置', media: 'denied', width: 1600, height: 1000 },
  // **真实宿主的比例。**
  //
  // 面板在 DSH 主应用里只有约 1000×700 可用（左边还有 DSH 自己的侧边栏），
  // 而上面的预设是 1600×1000 的「宽屏」。这个差别不是小事：
  // 舞台矮一点，「未接通板」和提问条就会撞在一起——被拒之后那句
  // 「在系统设置里放行」的说法，恰恰要靠被撞掉的那个按钮兑现。
  // 所以窄面板这一档必须进预设，否则这类问题只能等真机才发现。
  { name: 'live-compact', tab: 1, media: 'denied', width: 1007, height: 704 },
  // **网页版侧栏的宽度。**
  //
  // 网页版 DSH 里，插件面板可能被分到只有 400~500px。
  // 这一档以前从没截过，于是「右栏写死 396px、舞台被压成 0 宽」
  // 整整躲过了所有预设——布局闸门 `scripts/layout-check.mjs`
  // 现在会盯住这一档。
  { name: 'live-narrow', tab: 1, media: 'denied', width: 520, height: 720 },
  // **亮色主题。**
  //
  // 主题不是「换个底色」就完了：亮色下文字对比度、描边可见度、
  // 强调色浓度都要重新看一遍。亮色必须进预设，
  // 否则「切了主题之后哪块看不清了」只能靠用户先撞上。
  { name: 'live-dark', tab: 1, media: 'denied', width: 1007, height: 704, theme: 'dark' },
  { name: 'prepare-dark', tab: 0, media: 'granted', width: 1007, height: 704, theme: 'dark' },
  // **设置页的三张补充截图。**
  //
  //   · settings-compact     —— 真实宿主宽度：控件会不会挤成一条线；
  //   · settings-light       —— 亮色纸面：设置页是表格化信息最多的那一页；
  //   · settings-unconfigured —— 「这台机器还没有钥匙」的那一套。
  //     只看配好的样子，永远看不出「没配」时下一步该点哪儿。
  { name: 'settings-compact', tab: 3, tabLabel: '设置', media: 'denied', width: 1007, height: 704 },
  { name: 'settings-dark', tab: 3, tabLabel: '设置', media: 'denied', width: 1007, height: 704, theme: 'dark' },
  { name: 'settings-unconfigured', tab: 3, tabLabel: '设置', media: 'denied', width: 1007, height: 704, voice: 'unconfigured' },
  // **窄面板的页头。** 520px 下页头不许塌：记号、产品名、页签、
  // 主题按钮与「新建面试」都得在、都点得到。布局闸门按 420–1600 断言，
  // 这一张是给人眼看的底片。
  { name: 'prepare-narrow', tab: 0, media: 'denied', width: 520, height: 720 },
  // **空状态。** 一场面试都没有时，左栏与主区都只该是「一句话 + 一个动作」。
  // 有数据的预设永远走不到这条分支——不专门截一档，它就没人看过。
  { name: 'empty', tab: 0, media: 'granted', width: 1007, height: 704, empty: true },
  // **报告页在真实宿主比例下的样子。** 报告是阅读型版式，
  // 1600px 的宽屏截不出「纸面与留白」的问题；1007px 才是用户看到的。
  { name: 'live-report', tab: 2, media: 'granted', width: 1007, height: 704 },
  // **麦克风通了、摄像头没通。**
  //
  // 这是 DSH 桌面端的真实情况：宿主只放行「只申请麦克风」的请求。
  // 这一档截的是「部分可用」的样子——错误框说什么、右栏的按钮写什么，
  // 只有真截出来才看得见。
  { name: 'live-media-partial', tab: 1, media: 'partial', width: 1007, height: 704 },
  // **同一件事，但按桌面端的口气说。** 宿主策略挡的，改 Windows 设置没用，
  // 这句话必须和浏览器场景的版本分开写、分开看。
  { name: 'live-media-host-blocked', tab: 1, media: 'host-blocked', width: 1007, height: 704 },
  // **放大窗口。** 卡片上已经没有【放大】【修改】了，所以这一档要真的
  // 点一下纸面——「放大后顶部会不会被页头切掉」只有真截图看得见。
  // 编辑档还要真的改一个字，否则【保存】与「未保存」永远不会出现。
  { name: 'prepare-dialog', tab: 0, media: 'granted', width: 1007, height: 704, openDoc: true },
  { name: 'prepare-dialog-edit', tab: 0, media: 'granted', width: 1007, height: 704, openDoc: true, edit: true },
  { name: 'prepare-dialog-dark', tab: 0, media: 'granted', width: 1007, height: 704, theme: 'dark', openDoc: true },
  // **简历库下拉。** 「用这份」折行、名字认不出来，都是只有打开才看得见的问题。
  { name: 'prepare-library', tab: 0, media: 'granted', width: 1007, height: 704, library: true },
  // **浮层提醒。** 它必须盖在内容上、且**不把页面挤下去**——
  // 同一张图里既有提醒条又有完整的页面，才证明它没占布局。
  { name: 'prepare-toast', tab: 0, media: 'granted', width: 1007, height: 704, toast: true },
  // **面试中右栏的四个「？」。** 要宽到右栏真的在右边（窄了会上下堆叠），
  // 否则点开的弹层在首屏之外，截出来什么都看不见。
  { name: 'live-hints', tab: 1, media: 'granted', width: 1600, height: 1000, hints: true },
  // 已结束的场次：舞台给「续接板」（转录/底稿/计时都还在）。
  // `media: 'none'` = 不点器材按钮（已结束的场次没有「继续面试」可点，
  // 点右栏那个会把滚动容器推歪，截出来的就不是首屏了）。
  { name: 'live-done', tab: 1, media: 'none', width: 1007, height: 704, status: 'done' },
  { name: 'live-done-dark', tab: 1, media: 'none', width: 1007, height: 704, status: 'done', theme: 'dark' },
  // 宽屏暗色：整块回答框与底部按钮都在视野里——用来目检「底部阴影是否遮住内容」。
  { name: 'live-dark-tall', tab: 1, media: 'denied', width: 1600, height: 1000, theme: 'dark' },
  { name: 'live-tall', tab: 1, media: 'denied', width: 1600, height: 1000 },
  // 记录清理弹层 / 重置确认弹层。
  { name: 'records', tab: 0, media: 'granted', width: 1007, height: 704, manager: true },
  { name: 'records-dark', tab: 0, media: 'granted', width: 1007, height: 704, theme: 'dark', manager: true },
  { name: 'reset-dialog', tab: 0, media: 'granted', width: 1007, height: 704, resetDialog: true },
]

/**
 * 预设里的交互：点开某些东西之后再截图。
 *
 * 每个动作都**只做一步**、失败就记进 errors（截图行会打出来），
 * 不写「重试到成功」——点不到本身就是缺陷，应该被看见。
 */
async function interact(page, preset, errors) {
  try {
    if (preset.openDoc === true) {
      await page.getByTitle('放大预览（可编辑）').first().click({ timeout: 5000 })
      await page.waitForTimeout(500)
      if (preset.edit === true) {
        await page.getByRole('button', { name: '编辑', exact: true }).first().click({ timeout: 5000 })
        await page.waitForTimeout(300)
        const area = page.locator('textarea').first()
        const current = await area.inputValue()
        await area.fill(`${current}\n（补充一行：用来触发未保存状态）`)
        // `fill` 会把光标放到末尾、编辑器滚到底——截图要展示的是顶部，
        // 所以滚回去（这只影响截图，不影响产品行为）。
        await area.evaluate(element => { element.scrollTop = 0 })
        await page.waitForTimeout(400)
      }
    }
    if (preset.library === true) {
      await page.getByRole('button', { name: /简历库 3/ }).first().click({ timeout: 5000 })
      await page.waitForTimeout(400)
    }
    if (preset.manager === true) {
      // 「记录清理」在左栏场次表头。它是弹层，不依赖当前页签。
      await page.getByRole('button', { name: '记录清理', exact: true }).first().click({ timeout: 5000 })
      await page.waitForTimeout(500)
    }
    if (preset.resetDialog === true) {
      // 场次行尾的「⋯」→「重置记录…」。
      await page.getByRole('button', { name: '场次操作', exact: true }).first().click({ timeout: 5000 })
      await page.waitForTimeout(200)
      await page.getByRole('button', { name: /重置记录/ }).first().click({ timeout: 5000 })
      await page.waitForTimeout(400)
    }
    if (preset.toast === true) {
      // 身份区的「保存」是最稳的一次性动作：点完就会出一条 ok 提醒。
      await page.getByRole('button', { name: '保存', exact: true }).first().click({ timeout: 5000 })
      await page.waitForTimeout(500)
    }
    if (preset.hints === true) {
      // 依次点开四个「？」，最后只允许剩一个弹层。
      // 用 evaluate 逐个 click：后一个弹层会盖住下面的按钮，真鼠标点不到——
      // 这里要验证的是「开一个就关掉别的」，不是命中测试。
      await page.evaluate(() => {
        for (const toggle of document.querySelectorAll('[aria-haspopup="dialog"]')) toggle.click()
      })
      await page.waitForTimeout(500)
      const state = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]')
        const first = dialogs[0]
        const rect = first === undefined ? null : first.getBoundingClientRect()
        return {
          open: dialogs.length,
          rect: rect === null ? null : { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          width: window.innerWidth,
          height: window.innerHeight,
        }
      })
      if (state.open !== 1) errors.push(`「？」弹层应只剩 1 个，实际 ${state.open} 个`)
      if (state.rect !== null) {
        const { left, top, right, bottom } = state.rect
        if (left < 0 || top < 0 || right > state.width || bottom > state.height) {
          errors.push(`「？」弹层超出视口：${JSON.stringify(state.rect)} / ${state.width}x${state.height}`)
        }
      }
      await page.waitForTimeout(300)
    }
  } catch (error) {
    errors.push(`预设交互失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 打开一个预设。
 *
 * `scripts/browser.mjs` 的 `openPreview()` 只认识「准备 / 面试中 / 报告」
 * 三个页签（它被布局闸门共用，改它要动别人的闸门）。所以**设置页的点击
 * 在这里补一次**：预设声明了 `tabLabel` 就点它，点不到就把错误记进
 * `errors`，截图行会打出来——截错页必须能被看见，不能静默。
 */
async function openPreset(browser, { port, preset }) {
  const opened = await openPreview(browser, { port, preset })
  if (typeof preset.tabLabel === 'string') {
    try {
      await opened.page.getByText(preset.tabLabel, { exact: true }).first().click({ timeout: 5000 })
      await opened.page.waitForTimeout(700)
      // **截图必须证明自己截的是哪一页。** 点了「设置」还停在准备页时，
      // 文件名会撒谎——所以这里读根节点上的 `data-iv-tab` 再核对一次。
      const expected = ['prepare', 'live', 'report', 'settings'][preset.tab] ?? ''
      const shown = await opened.page.evaluate(
        () => document.querySelector('[data-iv-page]')?.getAttribute('data-iv-tab') ?? '',
      )
      if (expected !== '' && shown !== expected) {
        opened.errors.push(`截图页签不对：期望 ${expected}，实际 ${shown === '' ? '未知' : shown}`)
      }
    } catch (error) {
      opened.errors.push(`点不到页签「${preset.tabLabel}」：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return opened
}

async function main() {
  const wanted = process.argv.slice(2)
  const presets = wanted.length > 0 ? PRESETS.filter(p => wanted.includes(p.name)) : PRESETS
  if (presets.length === 0) {
    console.error(`没有匹配的预设。可用：${PRESETS.map(p => p.name).join(', ')}`)
    process.exit(1)
  }

  await ensureReact(ROOT)
  await rm(SHOTS, { recursive: true, force: true })
  await mkdir(SHOTS, { recursive: true })

  const { server, port } = await serve(ROOT)
  const chromium = loadChromium(ROOT)
  const browser = await chromium.launch(launchOptions())
  try {
    for (const preset of presets) {
      const { page, errors } = await openPreset(browser, { port, preset })
      // 有摄像头的预设：**真的把授权申请走一遍**——这样截出来的是
      // 「权限拿到了之后」的样子，而不是永远停在未接通状态。
      // 被拒的预设：**真的去申请一次**，把错误态截出来。
      //
      // **先申请设备，再做预设交互。** 申请按钮在页面里是一次点击，
      // 它会关掉已经打开的「？」弹层（点外面收起）——顺序反了，
      // live-hints 截出来的就是一张没有弹层的图。
      if (preset.media === 'granted' || preset.media === 'denied'
        || preset.media === 'partial' || preset.media === 'host-blocked') {
        await requestMediaPermission(page)
        // **等设备真的接上再截。** 假设备的 getUserMedia 不是瞬时返回的，
        // 900ms 之后可能还停在「正在申请…」——那截出来的是半成品状态，
        // 会让人以为按钮卡住了（产品本身的 busy 态是对的）。
        await page.waitForFunction(
          () => !document.body.innerText.includes('正在申请'),
          null,
          { timeout: 6000 },
        ).catch(() => {})
        // 点器材按钮会让 Playwright 先把元素滚进视野——截图要的是「页面顶部」。
        // 这里把面试页的滚动容器归零（只影响截图，不影响产品行为）。
        await page.evaluate(() => {
          const live = document.querySelector('[data-iv-live]')
          if (live !== null) live.scrollTop = 0
        })
        // 面试官画中画：15 张 PNG + 一次 WebGL 初始化，截早了就是一块空框
        // （"看不出渲染有没有成功"和"渲染失败了"在截图里长得一样）。
        await page.waitForSelector('[data-iv-avatar]', { timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(600)
      }
      await interact(page, preset, errors)
      const file = join(SHOTS, `${preset.name}.png`)
      await page.screenshot({ path: file })
      console.log(`✓ ${preset.name} → ${file}${errors.length > 0 ? `  ⚠ ${errors.length} 个错误：${errors[0]}` : ''}`)
      await page.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch(error => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
