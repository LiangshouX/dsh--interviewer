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
 * 产物在 `dev/shots/`。
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
const SHOTS = join(HERE, 'shots')

/** The presets we care about. */
const PRESETS = [
  { name: 'prepare', tab: 0, media: 'granted', width: 1600, height: 1000 },
  { name: 'live', tab: 1, media: 'granted', width: 1600, height: 1000 },
  { name: 'live-media-denied', tab: 1, media: 'denied', width: 1600, height: 1000 },
  { name: 'report', tab: 2, media: 'granted', width: 1600, height: 1000 },
  { name: 'settings', tab: 3, media: 'denied', width: 1600, height: 1000 },
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
  { name: 'live-light', tab: 1, media: 'denied', width: 1007, height: 704, theme: 'light' },
  { name: 'prepare-light', tab: 0, media: 'granted', width: 1007, height: 704, theme: 'light' },
  // **麦克风通了、摄像头没通。**
  //
  // 这是 DSH 桌面端的真实情况：宿主只放行「只申请麦克风」的请求。
  // 这一档截的是「部分可用」的样子——错误框说什么、右栏的按钮写什么，
  // 只有真截出来才看得见。
  { name: 'live-media-partial', tab: 1, media: 'partial', width: 1007, height: 704 },
  // **同一件事，但按桌面端的口气说。** 宿主策略挡的，改 Windows 设置没用，
  // 这句话必须和浏览器场景的版本分开写、分开看。
  { name: 'live-media-host-blocked', tab: 1, media: 'host-blocked', width: 1007, height: 704 },
]

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
      const { page, errors } = await openPreview(browser, { port, preset })
      // 有摄像头的预设：**真的把授权申请走一遍**——这样截出来的是
      // 「权限拿到了之后」的样子，而不是永远停在未接通状态。
      // 被拒的预设：**真的去申请一次**，把错误态截出来。
      if (preset.media === 'granted' || preset.media === 'denied'
        || preset.media === 'partial' || preset.media === 'host-blocked') {
        await requestMediaPermission(page)
      }
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
