#!/usr/bin/env node
/**
 * 把品牌矢量图烘成位图。
 *
 * **为什么需要位图。** DSH 插件市场（awesome-dsh-plugin / dsh-market）的
 * 卡片图标只吃 **GitHub 托管的位图**（`icon:` 字段指向一张 PNG/JPG），
 * 写 SVG 会被回退成作者头像。而矢量图自己也要在 README 顶部当 logo 用。
 *
 * 所以这里用真浏览器把 `assets/brand/mark.svg` 渲染成 PNG：
 *   · `assets/brand/icon-180.png` —— 市场卡片图标
 *   · `assets/brand/icon-512.png` —— 第三方渠道、社交媒体头像
 *
 * 用法：
 *   node dev/make-brand-assets.mjs
 *
 * 改了 `assets/brand/mark.svg` 就重跑一次。图标源文件在仓库根的 `icon.svg`
 * （那是 DSH 侧栏用的 drop-in 版，扁 tile，零位移）；这里是**对外版**
 * （正方 squircle），两者同源，见 logo-lab 的设计说明。
 */
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadChromium, launchOptions } from '../scripts/browser.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MARK = join(ROOT, 'assets', 'brand', 'mark.svg')
const OUT = join(ROOT, 'assets', 'brand')
const SIZES = [180, 512]

await mkdir(OUT, { recursive: true })
const svg = await readFile(MARK, 'utf8')
// 源文件写死了 64×64，渲染时按容器铺满。
const sized = svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ')

const chromium = loadChromium(ROOT)
const browser = await chromium.launch(launchOptions())
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><meta charset="utf-8">`
      + '<style>html,body{margin:0;padding:0;background:transparent}</style>'
      + `<div style="width:${size}px;height:${size}px">${sized}</div>`,
      { waitUntil: 'load' },
    )
    const target = join(OUT, `icon-${size}.png`)
    await page.screenshot({ path: target, omitBackground: true })
    await page.close()
    console.log(`✓ assets/brand/icon-${size}.png`)
  }
} finally {
  await browser.close()
}
