/**
 * Host-side camera capture — the way out of the desktop host's camera block.
 *
 * ## 为什么需要这一层
 *
 * DSH 桌面端的 `installMicrophonePermissions`（读自 `app.asar`）只放行
 * `mediaTypes === ['audio']` 的纯音频请求，`setPermissionCheckHandler` 对
 * `mediaType !== 'audio'` 一律返回 false。摄像头请求在 **Electron 主进程**
 * 就被 `callback(false)` 拒了——**压根没走到 Windows 的隐私设置那一步**，
 * 所以「去系统设置放行摄像头」是无效指引。
 *
 * 但插件的 Host 半边跑在 **DSH 的 Node 宿主进程**里，那儿没有 Electron 的
 * 权限闸门。于是摄像头可以由 Host 直接采，浏览器只负责显示。
 *
 * ## 一个必须知道的硬约束：摄像头是独占的
 *
 * 实测（Windows + dshow）：同一时刻**只有一个进程能打开摄像头**，第二个
 * 进程直接报 `I/O error`。麦克风则可以共享。
 *
 * 所以**预览和录像必须来自同一个 ffmpeg 进程**。本模块的取舍是：
 *
 * - ffmpeg 只做一件事：把摄像头画面转成 **MJPEG 帧流**写到 stdout；
 * - Node 这边 **tee**（复制）每一帧：一份推给预览客户端，一份（录像时）
 *   追加进录像文件。
 *
 * 为什么不直接让 ffmpeg 写 mp4？因为「开始/停止录像」是运行时的开关，
 * 而 ffmpeg 的输出目标在启动时就定死了——中途加一路输出就得重启进程，
 * 重启意味着**放开再独占摄像头**，预览会黑一下，别的程序还可能抢走设备。
 * tee 的方案让 ffmpeg 进程**从头到尾只跑一次**，摄像头一次都不放手。
 *
 * 录像文件先存成拼接的 `.mjpeg`（就是一堆 JPEG 帧），停止录像时再用
 * ffmpeg **从文件转码**成 mp4——文件转文件不碰摄像头，没有独占问题。
 *
 * ## 预览怎么送到浏览器
 *
 * 走 **multipart/x-mixed-replace** 的 MJPEG 流：一条长连接，服务端把每帧
 * JPEG 按边界推过去，浏览器 `<img src="…">` 直接吃这个流。浏览器端
 * **一行 JS 都不用写**。
 *
 * 但 DSH 桌面端把应用页的请求**转发**给 Host（`forwardWebRequest`），
 * 转发链路上 `content-length`/`transfer-encoding` 被剥掉——所以流式响应
 * 必须是 **chunked 的**，不能带 `content-length`。因此这里用 `res.write()`
 * 逐帧写，不设长度。
 *
 * ## ffmpeg 不一定有怎么办
 *
 * ffmpeg **不是** Windows 自带的，也不是 Node 自带的——它是个独立的第三方
 * 程序。这台机器上有 `D:\ProgramFils\ffmpeg\bin\ffmpeg.exe`，但别人的机器
 * 未必有。
 *
 * 所以定位顺序是：`config.ffmpegPath` → `DSH_FFMPEG_PATH` 环境变量 →
 * `PATH` 上的 `ffmpeg` → 若干常见安装位置。**全都找不到就是「没有摄像头
 * 通路」**，如实返回给界面，让界面说清怎么装（而不是假装摄像头坏了）。
 * 面试本身不受影响：麦克风、键盘、报告全都照常。
 *
 * ## 这个模块不做什么
 *
 * - 不碰浏览器的 `getUserMedia`——麦克风那条路桌面端是通的（纯音频请求
 *   能过），没必要重造。摄像头只走这里。
 * - 不做鉴权；鉴权由 `api.js` 的同源闸门负责，这里只管「把帧交给它」。
 */

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

/** MIME type of the streaming preview format. */
export const MJPEG_CONTENT_TYPE = 'multipart/x-mixed-replace; boundary=--dshframe'

/** The multipart boundary used in the preview stream. */
export const FRAME_BOUNDARY = '--dshframe'

/** How long to wait for ffmpeg to produce its first frame before giving up. */
const FIRST_FRAME_TIMEOUT_MS = 8000

/** How long to wait for the device list to come back. */
const DEVICE_LIST_TIMEOUT_MS = 8000

/** Frames per second requested from the camera. */
const PREVIEW_FPS = 10

/** JPEG quality for the preview stream (2 = best, 31 = worst). */
const PREVIEW_QUALITY = 5

/**
 * Preview frame size.
 *
 * 720p is enough to see the candidate's face on a panel, and it keeps each
 * JPEG around 45 KiB — a 10 fps stream is then ~450 KiB/s, which the local
 * host link carries without buffering.
 */
const PREVIEW_WIDTH = 1280
const PREVIEW_HEIGHT = 720

/**
 * ffmpeg 的定位顺序：**用户配置 → 环境变量 → PATH → where**。
 *
 * **不要硬编码候选路径。** 曾经写死过 `D:\ProgramFils\ffmpeg\...` 这种
 * 路径，结果在开发机上"碰巧能用"、换台机器就完全失效，而且还会把别人
 * 装在不同版本目录里的 ffmpeg 漏掉。安装位置是**这台机器的事实**，
 * 该由用户在设置页里填（写进 profile 的设置文件），不该由插件猜。
 *
 * 没有配置时靠 PATH 与系统的 `where` 兜底；两者都找不到，就如实说
 * 「这台机器没有摄像头采集程序」，并给出让用户填路径/安装的入口。
 */
/**
 * Split ffmpeg's `-list_devices` output into structured device lists.
 *
 * ffmpeg writes the device list to **stderr** and exits non-zero (it always
 * errors out because there's no real input), so the output has to be parsed
 * out of the error text. Each device line looks like:
 *
 * ```
 * [dshow @ 000002472ff5a440] "XiaoMi USB 2.0 Webcam" (video)
 * [dshow @ 000002472ff5a440]   Alternative name "@device_pnp_\\?\usb#..."
 * ```
 *
 * **`(none)` 也要认。** ffmpeg 7.x 在设备**打不开**（被占用、驱动未就绪）
 * 时会把类型标成 `(none)` 而不是 `(video)`。只认 `(video)` 的解析器会把这台
 * 摄像头整个丢掉，界面上就变成"没有找到摄像头设备"——把真正的原因藏了。
 *
 * @param {string} text combined stdout+stderr of the probe
 * @returns {{video: Array<{name: string, alt: string}>, audio: Array<{name: string, alt: string}>}}
 */
export function parseDeviceList(text) {
  const video = []
  const audio = []
  /** The device the last "Alternative name" belongs to. */
  let current
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    const alternative = /Alternative name\s+"(.+)"/.exec(line)
    if (alternative !== null) {
      if (current !== undefined && current.alt === '') current.alt = alternative[1]
      continue
    }
    // (video) 视频；(audio) 音频；(none) 无法判定类型 —— 多半是打不开，
    // 按视频保留，让后面的抓帧去报告真正的原因。
    const device = /"(.+)"\s+\((video|audio|none)\)/.exec(line)
    if (device === null) continue
    const entry = { name: device[1], alt: '', kind: device[2] }
    if (device[2] === 'audio') audio.push(entry)
    else video.push(entry)
    current = entry
  }
  return { video, audio }
}

/**
 * The argument that selects a dshow device.
 *
 * **Always prefer the alternative name.** Display names contain spaces and
 * CJK characters; passing them through a shell mangles them, and a mangled
 * name fails with a confusing "could not find device" instead of a clear one.
 * The alternative name is a stable device path with no spaces.
 *
 * @param {{name: string, alt: string}} device
 * @returns {string}
 */
export function deviceSelector(device) {
  const value = device.alt !== '' ? device.alt : device.name
  return `video=${value}`
}

/**
 * Locate an ffmpeg executable.
 *
 * Order: explicit config → environment variable → PATH → common locations.
 * A candidate only counts if it is actually executable.
 *
 * @param {{ffmpegPath?: string}} [options]
 * @returns {Promise<{path: string, source: string} | undefined>}
 */
export async function locateFfmpeg(options = {}) {
  const explicit = typeof options.ffmpegPath === 'string' ? options.ffmpegPath.trim() : ''
  if (explicit !== '') {
    const resolved = await resolveExecutable(explicit)
    if (resolved !== undefined) return { path: resolved, source: 'config' }
    return undefined
  }

  const fromEnv = typeof process.env.DSH_FFMPEG_PATH === 'string' ? process.env.DSH_FFMPEG_PATH.trim() : ''
  if (fromEnv !== '') {
    const resolved = await resolveExecutable(fromEnv)
    if (resolved !== undefined) return { path: resolved, source: 'env' }
  }

  // PATH：直接跑一次 `-version` 验证它真能执行（bare name 交给 OS 解析）。
  const fromPath = await resolveExecutable('ffmpeg')
  if (fromPath !== undefined) return { path: fromPath, source: 'path' }

  // PATH 上有但 Node 的 spawn 取不到时（少见：PATH 只在用户 shell 里），
  // 用系统的 `where` 再确认一次。
  if (process.platform === 'win32') {
    const fromWhere = await whereFfmpeg()
    if (fromWhere !== undefined) return { path: fromWhere, source: 'where' }
  }

  // **到此为止，不再猜安装位置。** 找不到就是找不到：让用户在设置页填。
  return undefined
}

/**
 * Ask Windows' own resolver where ffmpeg is.
 *
 * @returns {Promise<string | undefined>}
 */
async function whereFfmpeg() {
  try {
    const result = await runProcess('where', ['ffmpeg'], { timeoutMs: 5000 })
    if (result.code !== 0) return undefined
    const first = result.stdout.split(/\r?\n/).map(line => line.trim()).find(line => line !== '')
    if (first === undefined) return undefined
    return await resolveExecutable(first)
  } catch {
    return undefined
  }
}

/**
 * Turn ffmpeg's terse stderr into something a person can act on.
 *
 * **为什么单独成函数。** 用户看到的"摄像头打不开"必须能区分三种原因：
 * 被别的程序占着、设备名对不上、驱动/权限问题。这三种的处理办法完全不同，
 * 混成一句话就等于没说。
 *
 * @param {string} detail ffmpeg stderr 的最后一行
 * @returns {{reason: string, hint: string}}
 */
export function explainCameraFailure(detail) {
  const text = String(detail ?? '')
  if (/already in use by other application/i.test(text)) {
    return {
      reason: '摄像头被别的程序占用',
      hint: '关掉可能占用摄像头的程序（微信、Chrome/Edge 的网页会议、钉钉、飞书、OBS）再点重试。',
    }
  }
  if (/Could not run graph|Unable to BindToObject|I\/O error/i.test(text)) {
    return {
      reason: '系统打不开这个摄像头（设备在、驱动正常，但 DirectShow 激活失败）',
      hint: '如果 Windows「相机」应用能看到画面、只有这里失败，说明相机走的是 Media Foundation、'
        + '而 DirectShow 这条路坏了。最有效的修复是把驱动换回微软通用 UVC 驱动：'
        + '设备管理器 → 摄像头 → 更新驱动程序 → 浏览我的电脑 → 让我从列表中选取 → 选「USB Video Device」（USB 视频设备）→ 安装。'
        + '其他可试：① 笔记本摄像头物理开关 / Fn 热键；② 禁用再启用设备；③ 重启；④ 更新厂商驱动。',
    }
  }
  if (/Could not find video device|among source devices/i.test(text)) {
    return {
      reason: '设备名对不上',
      hint: '重新点一次「启动摄像头」让插件重新枚举设备；如果仍然失败，把摄像头拔插一次再试。',
    }
  }
  if (/Access is denied|Permission denied|not permitted/i.test(text)) {
    return {
      reason: '系统拒绝了摄像头访问',
      hint: '打开 Windows 设置 → 隐私和安全性 → 摄像头，确认「允许应用访问你的摄像头」和「允许桌面应用访问你的摄像头」都是开。',
    }
  }
  return {
    reason: detail.trim() !== '' ? detail.trim() : 'ffmpeg 没有给出原因',
    hint: '把这条信息发给助手，它会根据 ffmpeg 的原始输出继续排查。',
  }
}

/**
 * Resolve a command to an absolute, executable path.
 *
 * @param {string} command
 * @returns {Promise<string | undefined>}
 */
async function resolveExecutable(command) {
  const looksLikePath = command.includes('/') || command.includes('\\')
  if (!looksLikePath) {
    // Bare name: let the OS resolve it through PATH.
    try {
      const result = await runProcess(command, ['-version'], { timeoutMs: 5000 })
      if (result.code === 0) return command
    } catch {
      return undefined
    }
    return undefined
  }
  if (!existsSync(command)) return undefined
  try {
    await access(command, constants.X_OK)
  } catch {
    return undefined
  }
  return command
}

/**
 * Run a process and collect its output.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function runProcess(command, args, options = {}) {
  return new Promise(resolvePromise => {
    let child
    try {
      child = spawn(command, args, { windowsHide: true })
    } catch (error) {
      resolvePromise({ code: -1, stdout: '', stderr: String(error) })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code, stdout, stderr })
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* 已经退出了 */ }
      finish(-1)
    }, options.timeoutMs ?? DEVICE_LIST_TIMEOUT_MS)
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.stderr?.on('data', chunk => { stderr += String(chunk) })
    child.on('error', error => { stderr += String(error); finish(-1) })
    child.on('close', code => finish(code ?? -1))
  })
}

/**
 * Try to pull exactly one frame from a camera device.
 *
 * 只抓一帧就退出：**不碰**正在用的摄像头独占状态，也不会在自检里把设备
 * 一直占着。抓到 ≥2 字节（JPEG 的 SOI）就算成功。
 *
 * @param {string} ffmpegPath
 * @param {{name: string, alt: string}} device
 * @param {number} [timeoutMs]
 * @returns {Promise<{ok: boolean, bytes: number, ms: number, detail?: string}>}
 */
export function probeCamera(ffmpegPath, device, timeoutMs = 6000) {
  return new Promise(resolvePromise => {
    const started = Date.now()
    let child
    try {
      child = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'dshow', '-i', deviceSelector(device),
        '-frames:v', '1', '-f', 'mjpeg', 'pipe:1',
      ], { windowsHide: true })
    } catch (error) {
      resolvePromise({ ok: false, bytes: 0, ms: 0, detail: String(error) })
      return
    }
    let bytes = 0
    let stderr = ''
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { child.kill() } catch { /* 已经退出 */ }
      resolvePromise({ ...value, bytes, ms: Date.now() - started })
    }
    const timer = setTimeout(() => {
      const detail = stderr.trim().split(/\r?\n/).filter(line => line !== '').slice(-1)[0] ?? '抓帧超时'
      finish({ ok: false, detail })
    }, timeoutMs)
    child.stderr?.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-2000) })
    child.stdout?.on('data', chunk => { bytes += chunk.length; if (bytes >= 2) finish({ ok: true }) })
    child.on('error', error => finish({ ok: false, detail: String(error) }))
    child.on('close', () => {
      const detail = stderr.trim().split(/\r?\n/).filter(line => line !== '').slice(-1)[0] ?? 'ffmpeg 退出'
      finish({ ok: false, detail })
    })
  })
}

/**
 * List the capture devices ffmpeg can see.
 *
 * @param {string} ffmpegPath
 * @returns {Promise<{video: Array<object>, audio: Array<object>}>}
 */
export async function listDevices(ffmpegPath) {
  // ffmpeg always exits non-zero here (there is no input to open), so the
  // device list has to be read out of stderr regardless of the exit code.
  const result = await runProcess(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'])
  return parseDeviceList(`${result.stdout}\n${result.stderr}`)
}

/**
 * The live camera service: one ffmpeg process, one MJPEG frame stream.
 *
 * The process starts when the first client asks for the stream and is kept
 * alive until {@link CameraService.stop}. Frames are tee'd: one copy goes to
 * the preview clients, one copy (while recording) goes to disk.
 */
export class CameraService {
  /**
   * @param {{ffmpegPath?: string}} [options]
   */
  constructor(options = {}) {
    this.ffmpegPathOption = options.ffmpegPath ?? ''
    /** Resolved ffmpeg path, once probed. */
    this.ffmpeg = undefined
    /** Why ffmpeg was resolved that way (config | env | path | wellknown). */
    this.ffmpegSource = ''
    /** The running ffmpeg child, if any. */
    this.child = undefined
    /** The camera device in use. */
    this.device = undefined
    /** Most recent JPEG frame. */
    this.lastFrame = undefined
    /** Bytes that did not yet form a complete JPEG frame. */
    this.pending = Buffer.alloc(0)
    /** Clients currently reading the stream. */
    this.clients = new Set()
    /** Recording state: { path, stream, frames, startedAt }. */
    this.recording = undefined
    /** Whether the first frame has arrived. */
    this.hasFrame = false
    /** Tail of ffmpeg's stderr, for diagnostics. */
    this.stderrTail = ''
    /** Set while a stop is in progress, so late frames are ignored. */
    this.stopping = false
    /** The error that stopped the capture, if any. */
    this.error = ''
  }

  /**
   * Resolve ffmpeg and remember the result.
   *
   * @returns {Promise<{ok: boolean, path?: string, source?: string, error?: string}>}
   */
  async ensureFfmpeg() {
    if (this.ffmpeg !== undefined) {
      return { ok: true, path: this.ffmpeg, source: this.ffmpegSource }
    }
    const found = await locateFfmpeg({ ffmpegPath: this.ffmpegPathOption })
    if (found === undefined) {
      return {
        ok: false,
        error: '没找到 ffmpeg——这台机器上没有可用的摄像头采集程序。',
      }
    }
    this.ffmpeg = found.path
    this.ffmpegSource = found.source
    return { ok: true, path: found.path, source: found.source }
  }

  /**
   * The camera devices available on this machine.
   *
   * @returns {Promise<{ok: boolean, video?: Array<object>, error?: string}>}
   */
  async devices() {
    const ffmpeg = await this.ensureFfmpeg()
    if (!ffmpeg.ok) return { ok: false, error: ffmpeg.error }
    const list = await listDevices(this.ffmpeg)
    return { ok: true, video: list.video, audio: list.audio }
  }

  /**
   * Start the capture process.
   *
   * One process, one output (MJPEG on stdout). Recording is handled by tee'ing
   * frames in this process, so the camera is opened exactly once.
   *
   * @param {{device?: object}} [options]
   * @returns {Promise<{ok: boolean, error?: string, device?: object}>}
   */
  /**
   * 摄像头自检：ffmpeg 在哪、设备有哪些、能不能真抓到一帧。
   *
   * **为什么需要它。** "摄像头打不开"有三种原因（被占用 / 设备名不对 /
   * 权限或驱动），凭一句报错分不出来。自检把三件事一次问清，并把 ffmpeg
   * 的原始输出带回来——这是"所有动作透明"的一部分。
   *
   * @param {{device?: string}} [options]
   * @returns {Promise<object>}
   */
  async diagnose(options = {}) {
    const ffmpeg = await this.ensureFfmpeg()
    if (!ffmpeg.ok) {
      return {
        ok: false,
        ffmpeg: undefined,
        devices: { video: [], audio: [] },
        probes: [],
        reason: '找不到 ffmpeg',
        hint: '在设置页里指定 ffmpeg 路径，或用「安装 ffmpeg」让插件代下。',
      }
    }
    const list = await listDevices(this.ffmpeg)
    const wanted = options.device === undefined || options.device === ''
      ? list.video
      : list.video.filter(item => item.name === options.device || item.alt === options.device)
    const probes = []
    for (const device of wanted.slice(0, 3)) {
      const probe = await probeCamera(this.ffmpeg, device, 6000)
      // kind === 'none' 是强信号：ffmpeg 连设备能力都问不出来，
      // 说明系统激活不了它，而不是"设备不存在"。
      probes.push({ name: device.name, alt: device.alt, kind: device.kind, ...probe })
    }
    const ok = probes.some(item => item.ok)
    const failure = probes.find(item => item.ok !== true)
    const explained = explainCameraFailure(failure?.detail ?? '')
    const unqueryable = wanted.length > 0 && wanted.every(item => item.kind === 'none')
    return {
      ok,
      ffmpeg: { path: this.ffmpeg, source: this.ffmpegSource },
      devices: list,
      probes,
      ...(ok
        ? { reason: '摄像头可以打开', hint: '' }
        : {
          reason: unqueryable ? '系统打不开这个摄像头（ffmpeg 连设备能力都问不出来）' : explained.reason,
          hint: explained.hint,
          detail: failure?.detail ?? '',
        }),
    }
  }

  async start(options = {}) {
    if (this.child !== undefined) return { ok: true, device: this.device }
    const ffmpeg = await this.ensureFfmpeg()
    if (!ffmpeg.ok) return { ok: false, error: ffmpeg.error }

    const list = await listDevices(this.ffmpeg)
    const device = options.device ?? list.video[0]
    if (device === undefined) {
      return { ok: false, error: '没有找到摄像头设备。' }
    }

    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'dshow',
      '-i', deviceSelector(device),
      '-map', '0:v',
      '-vf', `scale=${PREVIEW_WIDTH}:${PREVIEW_HEIGHT}`,
      '-f', 'mjpeg',
      '-q:v', String(PREVIEW_QUALITY),
      '-r', String(PREVIEW_FPS),
      'pipe:1',
    ]

    const child = spawn(this.ffmpeg, args, { windowsHide: true })
    this.child = child
    this.device = device
    this.hasFrame = false
    this.lastFrame = undefined
    this.pending = Buffer.alloc(0)
    this.stderrTail = ''
    this.error = ''

    child.stderr?.on('data', chunk => {
      // ffmpeg is chatty about APP fields; keep only a short tail for
      // diagnostics instead of growing without bound.
      this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-2000)
    })

    child.stdout?.on('data', chunk => this.onFrameChunk(chunk))

    const exited = new Promise(resolvePromise => {
      child.on('error', error => {
        this.child = undefined
        resolvePromise({ code: -1, error: String(error) })
      })
      child.on('close', code => {
        this.child = undefined
        resolvePromise({ code })
      })
    })

    // Wait for the first frame so the caller learns about a broken camera
    // (device busy, driver error) instead of showing an empty stage.
    const firstFrame = await this.waitForFirstFrame(FIRST_FRAME_TIMEOUT_MS)
    if (!firstFrame) {
      const detail = this.stderrTail.trim().split(/\r?\n/).filter(line => line.trim() !== '').slice(-1)[0] ?? ''
      const exit = await Promise.race([exited, delay(300).then(() => undefined)])
      const fallback = detail !== '' ? detail : (exit?.error ?? `ffmpeg 退出码 ${exit?.code ?? '未知'}`)
      // 把 ffmpeg 的原始报错翻成人能处理的话；原文保留在 detail 里供排查。
      const explained = explainCameraFailure(fallback)
      this.stop()
      this.error = `摄像头打不开：${explained.reason}。${explained.hint}`
      return { ok: false, error: this.error, detail: fallback, reason: explained.reason, hint: explained.hint }
    }
    return { ok: true, device }
  }

  /**
   * Feed MJPEG bytes into the frame splitter.
   *
   * @param {Buffer} chunk
   */
  onFrameChunk(chunk) {
    if (this.stopping) return
    const data = Buffer.concat([this.pending, chunk])
    let cursor = 0
    while (cursor < data.length) {
      // A JPEG starts with FFD8 and ends with FFD9.
      const start = data.indexOf(Buffer.from([0xff, 0xd8]), cursor)
      if (start === -1) {
        // No header in the rest: keep the tail in case a header straddles chunks.
        this.pending = data.subarray(Math.max(cursor, data.length - 1))
        return
      }
      const end = data.indexOf(Buffer.from([0xff, 0xd9]), start + 2)
      if (end === -1) {
        this.pending = data.subarray(start)
        return
      }
      const frame = data.subarray(start, end + 2)
      this.pending = Buffer.alloc(0)
      cursor = end + 2
      this.publishFrame(frame)
    }
  }

  /**
   * Store the newest frame, hand it to the preview clients, and append it to
   * the recording when one is running.
   *
   * @param {Buffer} frame
   */
  publishFrame(frame) {
    this.lastFrame = frame
    this.hasFrame = true
    for (const client of this.clients) {
      try {
        client.write(`\r\n${FRAME_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`)
        client.write(frame)
      } catch {
        this.clients.delete(client)
      }
    }
    const recording = this.recording
    if (recording !== undefined) {
      try {
        recording.stream.write(frame)
        recording.frames += 1
      } catch {
        this.recording = undefined
      }
    }
  }

  /**
   * Wait until the first frame arrives.
   *
   * @param {number} timeoutMs
   * @returns {Promise<boolean>}
   */
  async waitForFirstFrame(timeoutMs) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.hasFrame) return true
      if (this.child === undefined) return false
      await delay(100)
    }
    return this.hasFrame
  }

  /**
   * Attach a streaming response to the preview.
   *
   * @param {import('node:http').ServerResponse} res
   */
  attach(res) {
    res.writeHead(200, {
      'content-type': MJPEG_CONTENT_TYPE,
      'cache-control': 'no-store',
      'connection': 'close',
    })
    this.clients.add(res)
    const drop = () => { this.clients.delete(res) }
    res.on('close', drop)
    res.on('error', drop)
    if (this.lastFrame !== undefined) {
      try {
        res.write(`--${FRAME_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${this.lastFrame.length}\r\n\r\n`)
        res.write(this.lastFrame)
      } catch {
        drop()
      }
    }
  }

  /**
   * Start recording into a directory.
   *
   * Frames are appended to a `.mjpeg` file; {@link stopRecording} turns it
   * into an mp4.
   *
   * @param {string} directory where the recording lands
   * @param {string} basename file name without extension
   * @returns {{ok: boolean, path?: string, error?: string}}
   */
  startRecording(directory, basename) {
    if (this.recording !== undefined) return { ok: false, error: '已经在录像了。' }
    if (this.child === undefined) return { ok: false, error: '摄像头还没接通，录不了。' }
    try {
      mkdir(directory, { recursive: true })
    } catch (error) {
      return { ok: false, error: `录像目录建不出来：${error instanceof Error ? error.message : String(error)}` }
    }
    const path = join(directory, `${basename}.mjpeg`)
    try {
      this.recording = {
        path,
        stream: createWriteStream(path),
        frames: 0,
        startedAt: Date.now(),
      }
    } catch (error) {
      this.recording = undefined
      return { ok: false, error: `录像文件开不了：${error instanceof Error ? error.message : String(error)}` }
    }
    return { ok: true, path }
  }

  /**
   * Stop recording and turn the captured frames into an mp4.
   *
   * The transcode reads a **file**, so it never touches the camera.
   *
   * @returns {Promise<{ok: boolean, path?: string, bytes?: number, frames?: number, error?: string}>}
   */
  async stopRecording() {
    const recording = this.recording
    if (recording === undefined) return { ok: false, error: '没有在录像。' }
    this.recording = undefined
    await new Promise(resolvePromise => { recording.stream.end(resolvePromise) })
    if (recording.frames === 0) {
      await rm(recording.path, { force: true })
      return { ok: false, error: '录像里一帧都没有——摄像头可能刚被别的程序抢走了。' }
    }
    const target = recording.path.replace(/\.mjpeg$/, '.mp4')
    // `-r` **before** `-i` sets the *input* frame rate. Without it ffmpeg
    // guesses 25 fps and the finished video plays back several times too fast.
    const result = await runProcess(this.ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'mjpeg',
      '-r', String(PREVIEW_FPS),
      '-i', recording.path,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      target,
    ], { timeoutMs: 120000 })
    await rm(recording.path, { force: true })
    if (result.code !== 0) {
      const detail = result.stderr.trim().split(/\r?\n/).filter(line => line.trim() !== '').slice(-1)[0] ?? ''
      return { ok: false, error: `录像转码失败：${detail !== '' ? detail : `ffmpeg 退出码 ${result.code}`}` }
    }
    if (!existsSync(target)) {
      return { ok: false, error: '录像转码没有产出文件。' }
    }
    return { ok: true, path: target, frames: recording.frames }
  }

  /**
   * Stop the capture process and release the camera.
   */
  stop() {
    this.stopping = true
    const child = this.child
    this.child = undefined
    this.device = undefined
    this.hasFrame = false
    this.lastFrame = undefined
    this.pending = Buffer.alloc(0)
    for (const client of this.clients) {
      try { client.end() } catch { /* 已经断了 */ }
    }
    this.clients.clear()
    if (child !== undefined) {
      try { child.kill() } catch { /* 已经退出了 */ }
    }
    this.stopping = false
  }

  /**
   * A snapshot of the service state, for the UI and the API.
   *
   * @returns {object}
   */
  status() {
    return {
      running: this.child !== undefined,
      hasFrame: this.hasFrame,
      device: this.device?.name ?? '',
      recording: this.recording !== undefined,
      ffmpeg: this.ffmpeg ?? '',
      ffmpegSource: this.ffmpegSource,
      clients: this.clients.size,
      error: this.error,
    }
  }
}

/**
 * Wait for a fixed delay.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolvePromise => { setTimeout(resolvePromise, ms) })
}
