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
 */
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFile, mkdir, rm, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// playwright 装在全局 node_modules 里，ESM 不吃 NODE_PATH，所以按绝对路径引。
const require_ = createRequire('/usr/local/lib/node_modules/')
const { chromium } = require_('playwright')
const SHOTS = join(HERE, 'shots')

/** The presets we care about. */
const PRESETS = [
  { name: 'prepare', tab: 0, media: 'granted', width: 1600, height: 1000 },
  { name: 'live', tab: 1, media: 'granted', width: 1600, height: 1000 },
  { name: 'live-media-denied', tab: 1, media: 'denied', width: 1600, height: 1000 },
  { name: 'report', tab: 2, media: 'granted', width: 1600, height: 1000 },
]

/**
 * Serve the repo root: `/dev/preview.html` references `/client.js` and `/dev/*`.
 */
async function serve(root) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
  const server = createServer(async (req, res) => {
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0])
    const path = join(root, requested)
    if (!path.startsWith(root)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    try {
      const body = await readFile(path)
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  return { server, port: server.address().port }
}

/**
 * Copy the React UMD builds out of node_modules.
 *
 * 预览页要一个**浏览器版**的 React，而包里的是 CommonJS——
 * 所以这里从 node_modules 拷一份 UMD 出来。拷出来的东西不入库，
 * 每次跑都重新拷——省得仓库里躺着一兆多的第三方代码。
 */
async function ensureReact() {
  const source = resolve(HERE, '..', 'node_modules', 'react', 'umd', 'react.development.js')
  const domSource = resolve(HERE, '..', 'node_modules', 'react-dom', 'umd', 'react-dom.development.js')
  await mkdir(join(HERE, 'shots'), { recursive: true })
  for (const [from, to] of [[source, 'react.development.js'], [domSource, 'react-dom.development.js']]) {
    try {
      await copyFile(from, join(HERE, to))
    } catch {
      console.error(`✗ 找不到 ${from}——先 npm install`)
      process.exit(1)
    }
  }
}

/**
 * Chromium 的启动参数。
 *
 * **为什么要探路径。** node 版 playwright 期望 `chrome-linux64`，
 * 实际装的可能是 `chrome-linux`；而 Windows 上路径又完全是另一套。
 * 所以：先按已知路径试，都没有就用 playwright 自带的。
 *
 * `--use-fake-device-for-media-stream` 让 Chromium 生成一个假摄像头
 * （那个绿球 + 时间戳的测试画面），这样「摄像头已接通」的状态
 * 在截图里是可见的，不必真接一台设备。
 */
function launchOptions() {
  const args = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ]
  const candidates = [
    '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { executablePath: candidate, args }
  }
  // Windows / macOS：交给 playwright 自己找。
  return process.platform === 'linux' ? { args: [...args, '--no-sandbox'] } : { args }
}

async function main() {
  const wanted = process.argv.slice(2)
  const presets = wanted.length > 0 ? PRESETS.filter(p => wanted.includes(p.name)) : PRESETS
  if (presets.length === 0) {
    console.error(`没有匹配的预设。可用：${PRESETS.map(p => p.name).join(', ')}`)
    process.exit(1)
  }

  await ensureReact()
  await rm(SHOTS, { recursive: true, force: true })
  await mkdir(SHOTS, { recursive: true })

  const { server, port } = await serve(resolve(HERE, '..'))
  const browser = await chromium.launch(launchOptions())
  try {
    for (const preset of presets) {
      const page = await browser.newPage({
        viewport: { width: preset.width, height: preset.height },
        deviceScaleFactor: 2,
      })
      const errors = []
      page.on('pageerror', error => errors.push(String(error)))
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.addInitScript(`window.__PRESET__ = ${JSON.stringify(preset)}`)
      await page.goto(`http://127.0.0.1:${port}/dev/preview.html`, { waitUntil: 'networkidle' })
      await page.evaluate(() => window.__RENDER__())
      await page.waitForTimeout(700)
      // 点到目标页签。
      const labels = ['准备', '面试中', '报告']
      const target = labels[preset.tab]
      if (target !== undefined) {
        await page.getByText(target, { exact: true }).first().click()
        await page.waitForTimeout(700)
      }
      // 有摄像头的预设：**真的把授权申请走一遍**——这样截出来的是
      // 「权限拿到了之后」的样子，而不是永远停在未接通状态。
      if (preset.media === 'granted') {
        const ask = page.getByRole('button', { name: /申请摄像头与麦克风|开摄像头/ }).first()
        if (await ask.count() > 0) {
          await ask.click()
          await page.waitForTimeout(1200)
        }
      }
      // 被拒的预设：**真的去申请一次**，把错误态截出来。
      if (preset.media === 'denied') {
        const ask = page.getByRole('button', { name: /申请摄像头与麦克风|开摄像头/ }).first()
        if (await ask.count() > 0) {
          await ask.click()
          await page.waitForTimeout(900)
        }
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
