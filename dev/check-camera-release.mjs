#!/usr/bin/env node
/**
 * 摄像头**释放**的回归闸门。
 *
 * **为什么要有它。** 「关了摄像头，画面没了，摄像头的指示灯却还亮着」——
 * 设备没被真正放开，用户会以为插件在偷看（AGENTS §10.3）。
 *
 * 根因（这一版修的）：
 *   权限从「未决」变成「已放行」时，`navigator.permissions` 会推一个事件，
 *   插件据此自动重连。那次重连常常和用户那一下点击**撞在一起**：
 *   两条申请链各自 `getUserMedia` 一次，拿到两条流；最后只有一条被留住，
 *   另一条成了没人管的孤儿——它的轨还活着，设备一直被占着。
 *
 * 所以这里**制造那个重叠**：把权限状态从「未决」翻成「已放行」，
 * 而且翻在 `getUserMedia` 的 promise 回来**之前**（真实浏览器里就是这个顺序：
 * 用户点了「允许」，权限先落地，promise 后回来）。
 *
 * 断言只有一条：
 *   **关掉摄像头之后，不能有任何一条轨还是活的。**
 *
 * 用法：
 *   node dev/check-camera-release.mjs
 *   退出码 0 = 通过；1 = 设备没被放开（回归了）。
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadChromium, launchOptions, serve, ensureReact } from '../scripts/browser.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * 被测的包根。
 *
 * 默认测**仓库里这份**；设 `DSH_IV_ROOT` 可以改测别的——
 * 比如 profile 里**已安装的那份**（发版前最后一道确认：测的就是用户拿到的东西）。
 */
const TARGET = (process.env.DSH_IV_ROOT ?? '').trim() === ''
  ? ROOT
  : resolve(process.env.DSH_IV_ROOT)

await ensureReact(ROOT)
const { server, port } = await serve(TARGET)
const chromium = loadChromium(ROOT)
const browser = await chromium.launch(launchOptions())

/**
 * 把浏览器端的权限与媒体接口换成可控的桩。
 *
 * **为什么要换。** 真浏览器里权限一旦放行就改不回来了，
 * 「权限翻转」这件事没法复现——而它正是这个 bug 的触发条件。
 */
function instrument() {
  window.__STREAMS__ = []
  window.__GUM_CALLS__ = 0
  const states = { camera: 'prompt', microphone: 'prompt' }
  const handlers = {}
  const makeStatus = name => ({
    get state() { return states[name] },
    set onchange(fn) { handlers[name] = fn },
    get onchange() { return handlers[name] },
    addEventListener() {},
    removeEventListener() {},
  })
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: async ({ name }) => makeStatus(name) },
  })
  const nativeGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  const flip = () => {
    for (const name of Object.keys(states)) {
      if (states[name] === 'granted') continue
      states[name] = 'granted'
      if (typeof handlers[name] === 'function') handlers[name]()
    }
  }
  navigator.mediaDevices.getUserMedia = async constraints => {
    window.__GUM_CALLS__ += 1
    const pending = nativeGum(constraints)
    // 权限先落地，promise 后回来——真实浏览器里就是这个顺序。
    flip()
    const stream = await pending
    window.__STREAMS__.push(stream)
    return stream
  }
}

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => {
    if (message.type() !== 'error') return
    const url = message.location()?.url ?? ''
    if (url.includes('favicon') || url.includes('/camera/stream')) return
    errors.push(message.text())
  })
  await page.addInitScript(instrument)
  await page.addInitScript(`window.__PRESET__ = ${JSON.stringify({
    name: 'camera-release', tab: 1, media: 'granted', width: 1200, height: 900, status: 'running',
  })}`)
  await page.goto(`http://127.0.0.1:${port}/dev/preview.html`, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.__RENDER__())
  await page.waitForTimeout(700)
  await page.getByText('面试中', { exact: true }).first().click()
  await page.waitForTimeout(500)
  return { page, errors }
}

/** 数一数：总共拿了几条流、还有几条轨是活的。 */
const liveTracks = page => page.evaluate(() => {
  const streams = window.__STREAMS__ ?? []
  let live = 0
  let total = 0
  for (const stream of streams) {
    for (const track of stream.getTracks()) {
      total += 1
      if (track.readyState === 'live') live += 1
    }
  }
  return { streams: streams.length, live, total, calls: window.__GUM_CALLS__ }
})

let failed = false
try {
  const { page, errors } = await openPage()

  await page.getByRole('button', { name: /开摄像头与麦克风|申请摄像头与麦克风/ }).first().click()
  await page.waitForFunction(() => (window.__STREAMS__ ?? []).length > 0, undefined, { timeout: 15000 })
  await page.waitForTimeout(1200)
  const afterOpen = await liveTracks(page)
  console.log('开摄像头后：', afterOpen)

  await page.getByRole('button', { name: /^关摄像头|^关麦克风/, exact: true }).first().click()
  await page.waitForTimeout(1200)
  const afterClose = await liveTracks(page)
  console.log('关摄像头后：', afterClose)

  if (afterClose.live > 0) {
    console.error(`\n✗ 设备没被放开：还有 ${afterClose.live} 条轨是活的（指示灯会一直亮着）`)
    failed = true
  } else {
    console.log('\n✓ 设备已释放：没有一条轨还活着')
  }
  if (afterOpen.calls > 1) {
    console.error(`✗ 一次申请拉了 ${afterOpen.calls} 条流（重叠的申请链没有合并）`)
    failed = true
  }
  if (errors.length > 0) {
    console.error('前端报错：', errors)
    failed = true
  }
  await page.close()
} finally {
  await browser.close()
  server.close()
}

process.exit(failed ? 1 : 0)
