/**
 * 浏览器采集通道：用 Chromium 的 Media Foundation 拿摄像头画面。
 *
 * **为什么要这条通道。** Windows 11 24H2 上有一类机器：Windows「相机」应用
 * 能出画面（走 Media Foundation），但 DirectShow 采集一律失败——
 * ffmpeg 7.1 报 `Unable to BindToObject`、6.1 报 `Could not run graph`，
 * 换微软通用 UVC 驱动、重启都不解决。而 Chromium 在 Windows 上的
 * `getUserMedia` 走的正是 **Media Foundation**，所以它不受这个故障影响。
 *
 * **它怎么工作。** 宿主起一个只监听 127.0.0.1 的小 HTTP 服务，再拉起一个
 * **无头 Chromium** 打开那个页面；页面用 `getUserMedia` 拿画面、按帧率把
 * JPEG POST 回来。宿主收到的帧交给 `CameraService.publishFrame()`，
 * 于是预览、录像、首帧检测全都与 ffmpeg 通道共用同一套下游逻辑。
 *
 * **隐私边界。** 只监听回环地址、页面与宿主同机、帧不落盘也不出网；
 * 无头实例用独立的临时 `--user-data-dir`，退出即删。
 *
 * **诚实说明。** 它比 ffmpeg 多一个进程（冷启动 ~1–2 秒），并且依赖本机
 * 装了 Chrome 或 Edge。所以**优先 ffmpeg**，它失败才回落这条。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 单帧上限：1080p JPEG 通常 < 1 MB，4 MB 足够宽松又能挡住坏请求。 */
const MAX_FRAME_BYTES = 4 * 1024 * 1024

/** 等待第一帧的上限（含 Chromium 冷启动）。 */
const FIRST_FRAME_TIMEOUT_MS = 20000

/** 常见 Chromium 位置：**只用于发现**，用户可以覆盖。 */
const CHROMIUM_CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
}

/**
 * Find a Chromium-family browser.
 *
 * Order: explicit config → `DSH_CHROMIUM_PATH` → common install locations.
 * 找不到就返回 undefined——**不猜**更多路径，让设置页去填。
 *
 * @param {{chromiumPath?: string}} [options]
 * @returns {{path: string, source: string} | undefined}
 */
export function locateChromium(options = {}) {
  const explicit = typeof options.chromiumPath === 'string' ? options.chromiumPath.trim() : ''
  if (explicit !== '') return existsSync(explicit) ? { path: explicit, source: 'config' } : undefined

  const fromEnv = typeof process.env.DSH_CHROMIUM_PATH === 'string' ? process.env.DSH_CHROMIUM_PATH.trim() : ''
  if (fromEnv !== '' && existsSync(fromEnv)) return { path: fromEnv, source: 'env' }

  const list = CHROMIUM_CANDIDATES[process.platform] ?? []
  for (const candidate of list) {
    if (existsSync(candidate)) return { path: candidate, source: 'wellknown' }
  }
  // Windows 上 Chrome 也可能装在用户目录。
  const local = process.env.LOCALAPPDATA
  if (process.platform === 'win32' && typeof local === 'string' && local !== '') {
    const candidate = join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')
    if (existsSync(candidate)) return { path: candidate, source: 'wellknown' }
  }
  return undefined
}

/** The page the headless browser loads: capture → JPEG → POST. */
export function capturePage(options = {}) {
  const width = Number(options.width) || 1280
  const height = Number(options.height) || 720
  const fps = Math.max(1, Math.min(30, Number(options.fps) || 10))
  const interval = Math.round(1000 / fps)
  return `<!doctype html><meta charset="utf-8"><title>dsh camera bridge</title>
<body style="margin:0;background:#000"><canvas id="c" style="display:none"></canvas><script>
(async () => {
  const post = async body => {
    try { await fetch('/frame', { method: 'POST', body }) } catch (error) { /* 宿主关了就停 */ }
  }
  const fail = error => post(JSON.stringify({ error: String((error && error.message) || error) }))
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: ${width}, height: ${height} } })
    const video = document.createElement('video')
    video.muted = true
    video.srcObject = stream
    await video.play()
    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')
    setInterval(() => {
      if (video.videoWidth === 0) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      canvas.toBlob(blob => { if (blob) void post(blob) }, 'image/jpeg', 0.75)
    }, ${interval})
  } catch (error) {
    await fail(error)
  }
})()
</script></body>`
}

/**
 * One headless-Chromium camera session.
 *
 * 用法：`const session = new BrowserCamera({ onFrame }); await session.start()`。
 * `onFrame` 收到的是完整 JPEG（Buffer），交给 `CameraService.publishFrame`。
 */
export class BrowserCamera {
  /**
   * @param {{chromiumPath?: string, width?: number, height?: number, fps?: number, onFrame: (frame: Buffer) => void, onError?: (message: string) => void}} options
   */
  constructor(options = {}) {
    this.options = options
    this.chromiumPath = options.chromiumPath ?? ''
    this.onFrame = options.onFrame
    this.onError = options.onError ?? (() => {})
    this.server = undefined
    this.child = undefined
    this.userDataDir = undefined
    this.started = false
    this.frames = 0
    this.firstFrame = new Promise(resolve => { this.resolveFirstFrame = resolve })
    this.error = ''
  }

  /**
   * Start the local bridge and the headless browser.
   *
   * @returns {Promise<{ok: boolean, error?: string, backend?: string, browser?: string}>}
   */
  async start() {
    if (this.started) return { ok: true, backend: 'chromium-mf' }
    const found = locateChromium({ chromiumPath: this.chromiumPath })
    if (found === undefined) {
      return {
        ok: false,
        error: '这台机器上没有找到 Chrome / Edge，浏览器采集通道不可用（可在设置页指定）。',
      }
    }
    this.browserPath = found.path
    this.browserSource = found.source

    // 1) 本地回环服务：GET / 返回采集页；POST /frame 收一帧。
    this.server = createServer((req, res) => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(capturePage({ width: this.options.width, height: this.options.height, fps: this.options.fps }))
        return
      }
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return }
      const chunks = []
      let size = 0
      req.on('data', chunk => {
        size += chunk.length
        if (size > MAX_FRAME_BYTES) { req.destroy(); return }
        chunks.push(chunk)
      })
      req.on('end', () => {
        const body = Buffer.concat(chunks)
        // 页面上报错误用 JSON，正常帧是 JPEG（以 FFD8 开头）。
        if (body.length >= 2 && body[0] === 0xff && body[1] === 0xd8) {
          this.frames += 1
          this.resolveFirstFrame(true)
          try { this.onFrame?.(body) } catch { /* 下游自己处理 */ }
        } else if (body.length > 0 && body[0] === 0x7b) {
          try {
            const parsed = JSON.parse(body.toString('utf8'))
            if (typeof parsed?.error === 'string') {
              this.error = parsed.error
              this.resolveFirstFrame(false)
              this.onError(parsed.error)
            }
          } catch { /* 不是我们认识的格式，忽略 */ }
        }
        res.writeHead(204)
        res.end()
      })
    })
    await new Promise((resolvePromise, rejectPromise) => {
      this.server.once('error', rejectPromise)
      this.server.listen(0, '127.0.0.1', resolvePromise)
    })
    const port = this.server.address().port

    // 2) 独立临时 profile：退出即删，不碰用户的浏览器数据。
    this.userDataDir = await mkdtemp(join(tmpdir(), 'dsh-cam-'))
    const args = [
      '--headless=new',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      `--user-data-dir=${this.userDataDir}`,
      `--window-size=${Number(this.options.width) || 1280},${Number(this.options.height) || 720}`,
      `http://127.0.0.1:${port}/`,
    ]
    try {
      this.child = spawn(found.path, args, { stdio: 'ignore', windowsHide: true })
    } catch (error) {
      await this.stop()
      return { ok: false, error: `拉不起浏览器：${error instanceof Error ? error.message : String(error)}` }
    }
    this.child.on('error', error => {
      this.error = `浏览器进程失败：${error instanceof Error ? error.message : String(error)}`
      this.resolveFirstFrame(false)
    })
    this.child.on('close', () => { this.resolveFirstFrame(false) })

    const gotFrame = await Promise.race([
      this.firstFrame,
      new Promise(resolvePromise => setTimeout(() => resolvePromise(false), FIRST_FRAME_TIMEOUT_MS)),
    ])
    if (gotFrame !== true) {
      const reason = this.error !== '' ? this.error : '浏览器没有在 20 秒内送回画面'
      await this.stop()
      return { ok: false, error: `浏览器采集没起来：${reason}`, detail: reason }
    }
    this.started = true
    return { ok: true, backend: 'chromium-mf', browser: found.path }
  }

  /** Stop the browser and the bridge, and remove the temporary profile. */
  async stop() {
    this.started = false
    const child = this.child
    this.child = undefined
    try { child?.kill() } catch { /* 已经退出 */ }
    // **Windows 上必须杀进程树。** Chrome 是多进程的：只 kill 父进程时，
    // 视频采集/GPU 子进程可能继续持有摄像头——下一次启动就会"I/O error"，
    // 而用户看到的只是"摄像头打不开"。用 taskkill /T 把整棵树收掉。
    if (child?.pid !== undefined && process.platform === 'win32') {
      try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* 进程已退出 */ }
    }
    try { this.server?.close() } catch { /* 已经关了 */ }
    this.server = undefined
    const dir = this.userDataDir
    this.userDataDir = undefined
    if (dir !== undefined) {
      try { await rm(dir, { recursive: true, force: true }) } catch { /* Windows 上可能还被占用，下次再清 */ }
    }
  }

  /** A snapshot for the panel/diagnostics. */
  status() {
    return {
      backend: 'chromium-mf',
      started: this.started,
      frames: this.frames,
      browser: this.browserPath ?? '',
      browserSource: this.browserSource ?? '',
      error: this.error,
    }
  }
}
