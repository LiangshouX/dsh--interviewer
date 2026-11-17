#!/usr/bin/env node
/**
 * 预览与布局检查共用的浏览器工具。
 *
 * **为什么要抽出来。** 截图脚本和布局断言脚本都需要同一套东西：
 * 找到可用的 playwright、找到系统浏览器、把仓库根目录起成一个静态服务器、
 * 把 React 的 UMD 拷进 dev/。两边各写一份的话，迟早会走样——
 * 比如截图脚本能跑、断言脚本却因为路径写错而「静默跳过」，
 * 于是闸门变成一句空话。
 *
 * 所有函数都**不吞错误**：找不到浏览器就抛出去，由调用方决定是跳过还是失败。
 */
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFile, mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, extname, join, resolve } from 'node:path'

/**
 * 找到 playwright。
 *
 * **为什么要自己找。** playwright 可能装在仓库的 node_modules 里，也可能
 * 装在全局——而 ESM 不吃 NODE_PATH，只能用 createRequire 一个个试。
 * 先找 `playwright`，再找 `playwright-core`（后者不下载浏览器，
 * 但配上系统 Chrome/Edge 一样能跑）。
 *
 * @param {string} repoRoot 仓库根目录
 * @returns {any} playwright 的 chromium
 */
export function loadChromium(repoRoot) {
  const roots = [repoRoot, process.cwd()]
  try {
    const globalRoot = execFileSync('npm.cmd', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (globalRoot !== '') roots.push(globalRoot)
  } catch {
    // npm 不在 PATH 上：跳过全局根，不影响本地解析。
  }
  const errors = []
  for (const root of roots) {
    for (const name of ['playwright', 'playwright-core']) {
      try {
        const require_ = createRequire(join(root, 'noop.js'))
        return require_(name).chromium
      } catch (error) {
        errors.push(`${root} → ${name}: ${error?.message ?? error}`)
      }
    }
  }
  throw new Error(
    '找不到 playwright。先装一个：\n'
    + '  npm install --save-dev playwright-core   # 不下载浏览器，用系统 Chrome/Edge\n'
    + '  npx playwright install chromium         # 或者让 playwright 自己带浏览器\n'
    + `尝试过：\n${errors.join('\n')}`,
  )
}

/** 常见的系统 Chrome / Edge 安装位置。 */
export function systemBrowsers() {
  if (process.platform === 'win32') {
    const bases = [
      process.env['PROGRAMFILES'],
      process.env['PROGRAMFILES(X86)'],
      process.env['LOCALAPPDATA'],
    ].filter(Boolean)
    const relative = [
      ['Google', 'Chrome', 'Application', 'chrome.exe'],
      ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    ]
    const found = []
    for (const base of bases) {
      for (const parts of relative) {
        found.push(join(base, ...parts))
      }
    }
    return found
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
  }
  return []
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
export function launchOptions() {
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
  // Windows / macOS：优先用**系统已经装好的** Chrome/Edge。
  //
  // 为什么不强制 `playwright install chromium`？那要下一百多 MB，
  // 而这台机器上本来就装着 Chrome——直接驱动它，克隆仓库的人
  // 不用等下载就能看到图。
  for (const candidate of systemBrowsers()) {
    if (existsSync(candidate)) return { executablePath: candidate, args }
  }
  // 都没有：交给 playwright 自己找（可能它下载过浏览器）。
  return process.platform === 'linux' ? { args: [...args, '--no-sandbox'] } : { args }
}

/**
 * 把仓库根目录起成一个静态服务器。
 *
 * @param {string} root 仓库根目录
 * @returns {Promise<{server: any, port: number}>}
 */
export async function serve(root) {
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
 *
 * @param {string} repoRoot 仓库根目录
 */
export async function ensureReact(repoRoot) {
  const dev = join(repoRoot, 'dev')
  const source = resolve(dev, '..', 'node_modules', 'react', 'umd', 'react.development.js')
  const domSource = resolve(dev, '..', 'node_modules', 'react-dom', 'umd', 'react-dom.development.js')
  await mkdir(join(dev, 'shots'), { recursive: true })
  for (const [from, to] of [[source, 'react.development.js'], [domSource, 'react-dom.development.js']]) {
    try {
      await copyFile(from, join(dev, to))
    } catch {
      console.error(`✗ 找不到 ${from}——先 npm install`)
      process.exit(1)
    }
  }
}

/**
 * 在预览页里渲染一个预设状态，返回 page。
 *
 * @param {any} browser playwright 的 browser
 * @param {{port: number, preset: {tab: number, media: string, width: number, height: number}}} options
 */
export async function openPreview(browser, { port, preset }) {
  const page = await browser.newPage({
    viewport: { width: preset.width, height: preset.height },
    deviceScaleFactor: 2,
  })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => {
    if (message.type() !== 'error') return
    // 浏览器会自动去要 /favicon.ico，404 很正常——那是噪声，不是缺陷。
    const url = message.location()?.url ?? ''
    if (url.includes('favicon')) return
    // 预览页没有 Host 的 MJPEG 端点（真宿主才有）。`live-media-host-blocked`
    // 这一档会去要 `/interviewer/camera/stream`，404 是预览环境的预期结果。
    if (url.includes('/camera/stream')) return
    errors.push(message.text())
  })
  await page.addInitScript(`window.__PRESET__ = ${JSON.stringify(preset)}`)
  await page.goto(`http://127.0.0.1:${port}/dev/preview.html`, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.__RENDER__())
  await page.waitForTimeout(700)
  const labels = ['准备', '面试中', '报告']
  const target = labels[preset.tab]
  if (target !== undefined) {
    await page.getByText(target, { exact: true }).first().click()
    await page.waitForTimeout(700)
  }
  return { page, errors }
}

/**
 * 真的去申请一次摄像头与麦克风。
 *
 * **为什么非要真的点。** 权限被拒之后那套文案和按钮是这一页
 * 唯一的出口；只在代码里「假设」它存在，截图里就会是一张好看的空板子。
 *
 * 被拒的预设里，`navigator.permissions` / `getUserMedia` 被预览页改成了
 * 抛 NotAllowedError，于是点完就是错误态；能通过的预设则由 Chromium 的
 * `--use-fake-ui-for-media-stream` 直接放行。
 *
 * **点不到就返回 false，不抛。** 按不动往往正是我们要抓的缺陷
 * （按钮被别的东西盖住了），让它变成一条断言，而不是一个超时堆栈。
 *
 * @param {any} page playwright 的 page
 * @param {number} timeout 点击超时（毫秒）
 * @returns {Promise<boolean>} 是否成功点到那个按钮
 */
export async function requestMediaPermission(page, timeout = 5000) {
  const ask = page.getByRole('button', { name: /申请摄像头与麦克风|开摄像头/ }).first()
  if (await ask.count() === 0) return false
  try {
    await ask.click({ timeout })
  } catch {
    return false
  }
  await page.waitForTimeout(900)
  return true
}

export { dirname }
