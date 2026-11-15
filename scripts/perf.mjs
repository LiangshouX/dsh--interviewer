#!/usr/bin/env node
/**
 * 性能探针：**把「插件不能拖慢 DSH」变成能测的数字**。
 *
 * 为什么这是红线
 * --------------
 * 插件是**嵌在别人的主应用里**的。插件慢一点，用户就会说「DSH 卡了」。
 * 功能做得多好都救不回来——一个卡顿的插件会被直接关掉。
 *
 * 测什么
 * ------
 *   1. **Host 侧**：面板轮询最频繁调用的三个方法（getState / listSessions /
 *      appendTurn）在不同数据量下的耗时。轮询每 1.5 秒一次，所以这是**后台
 *      常驻开销**，它决定 DSH 在别的标签页开着时有多卡。
 *   2. **HTTP 侧**：真实的路由 handler 端到端耗时（含 JSON 序列化）。
 *   3. **传输体积**：每轮轮询的响应有多大——网络不是问题，本地 IPC 也是，
 *      但体积会随转录线性增长，要盯住。
 *
 * 基线
 * ----
 * 这台机器是 Linux 容器；用户机器是 Windows + Electron，磁盘更慢、
 * 渲染更重。**阈值按这里测出的数字乘 3 设定**，给 Windows 留余量。
 * 用户机实测后应该用真数字替换。
 *
 *   node scripts/perf.mjs           # 测量并打印
 *   node scripts/perf.mjs --check   # 超过阈值就非 0 退出（闸门）
 */
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InterviewService } from '../src/host/service.js'
import { registerApi } from '../src/host/api.js'

/** Thresholds (ms). Windows/Electron gets ~3× headroom over this Linux box. */
const THRESHOLDS = {
  getStateEmpty: 30,
  getStateHeavy: 120,
  listSessions: 60,
  listSessionsMany: 150,
  appendTurn: 30,
  httpRoundTrip: 60,
  responseBytes: 256 * 1024,
}

/** Percentile of a sorted sample. */
function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index]
}

/** Time one async call. */
async function time(fn) {
  const started = process.hrtime.bigint()
  await fn()
  return Number(process.hrtime.bigint() - started) / 1e6
}

/** Run one measurement many times and summarise. */
async function measure(label, iterations, fn) {
  const samples = []
  for (let index = 0; index < iterations; index += 1) {
    samples.push(await time(fn))
  }
  return {
    label,
    iterations,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: Math.max(...samples),
  }
}

/** Build a service with one session carrying `turns` transcript rows. */
async function makeService(root, turns) {
  const service = new InterviewService({ config: { workspaceRoot: root } })
  const session = await service.createSession({
    title: '性能测试场',
    resumeText: '张三，招商银行后端工程师。'.repeat(40),
    jdText: '高级后端工程师，负责高并发系统。'.repeat(60),
  })
  await service.saveChecklist(session.id, Array.from({ length: 14 }, (_, index) => ({
    topic: `考点 ${index + 1}`,
    why: 'JD 要求对应的一条',
    level: index % 3 === 0 ? 'core' : index % 3 === 1 ? 'deep' : 'bonus',
  })))
  for (let index = 0; index < turns; index += 1) {
    await service.appendTurn(session.id, {
      role: index % 2 === 0 ? 'interviewer' : 'candidate',
      text: `这是第 ${index + 1} 轮对话的内容，长度接近真实面试里的一段话。`.repeat(4),
    })
  }
  return { service, session }
}

/** Start a local server around the plugin's real route handler. */
async function startServer(service) {
  let handler
  const ctx = {
    effect: fn => fn(),
    webServer: {
      register(spec) {
        handler = spec.handler
        return () => {}
      },
    },
  }
  registerApi(ctx, service)
  const server = createServer((req, res) => { void handler(req, res) })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise(done => server.close(done)),
  }
}

async function main() {
  const check = process.argv.includes('--check')
  const root = await mkdtemp(join(tmpdir(), 'dsh-interviewer-perf-'))
  const results = []
  try {
    // ── 1. 空会话 ────────────────────────────────────────────────────────
    const light = await makeService(root, 0)
    results.push(await measure('getState（空会话）', 200, async () => { await light.service.getState(light.session.id) }))

    // ── 2. 重会话：500 轮转录（一场 45 分钟面试大约 60–100 轮，500 是余量） ──
    const heavyRoot = join(root, 'heavy')
    const heavy = await makeService(heavyRoot, 500)
    results.push(await measure('getState（500 轮转录）', 100, async () => { await heavy.service.getState(heavy.session.id) }))
    results.push(await measure('listSessions（1 个会话）', 100, async () => { await heavy.service.listSessions() }))

    // ── 3. 多会话目录（20 场面试） ────────────────────────────────────────
    const manyRoot = join(root, 'many')
    const many = new InterviewService({ config: { workspaceRoot: manyRoot } })
    for (let index = 0; index < 20; index += 1) {
      await many.createSession({ title: `第 ${index + 1} 场`, resumeText: '简历', jdText: 'JD' })
    }
    results.push(await measure('listSessions（20 个会话）', 50, async () => { await many.listSessions() }))

    // ── 4. 写路径 ─────────────────────────────────────────────────────────
    results.push(await measure('appendTurn（追加一轮）', 100, async () => {
      await heavy.service.appendTurn(heavy.session.id, { role: 'candidate', text: '一轮回答' })
    }))

    // ── 5. HTTP 端到端 ────────────────────────────────────────────────────
    const server = await startServer(heavy.service)
    try {
      const samples = []
      let bytes = 0
      for (let index = 0; index < 100; index += 1) {
        const started = process.hrtime.bigint()
        const response = await fetch(`${server.url}/interviewer/api/sessions/${heavy.session.id}`)
        const body = await response.text()
        samples.push(Number(process.hrtime.bigint() - started) / 1e6)
        bytes = body.length
      }
      results.push({
        label: 'HTTP GET /sessions/<id>（500 轮转录）',
        iterations: 100,
        p50: percentile(samples, 50),
        p95: percentile(samples, 95),
        max: Math.max(...samples),
        bytes,
      })
      // 截断后的体积：面板轮询真正收到的东西。
      const limited = await fetch(`${server.url}/interviewer/api/sessions/${heavy.session.id}?transcriptLimit=200`)
      const limitedBody = await limited.text()
      results.push({
        label: 'HTTP GET（转录截断到 200 轮）',
        iterations: 1,
        p50: 0, p95: 0, max: 0,
        bytes: limitedBody.length,
      })
    } finally {
      await server.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }

  // ── 报告 ───────────────────────────────────────────────────────────────
  console.log('\n性能基线（Linux 容器；用户机是 Windows + Electron，会更慢）\n')
  for (const result of results) {
    const size = result.bytes !== undefined ? `  响应 ${(result.bytes / 1024).toFixed(1)} KiB` : ''
    console.log(`  ${result.label.padEnd(38)} p50 ${result.p50.toFixed(2).padStart(7)} ms   p95 ${result.p95.toFixed(2).padStart(7)} ms   max ${result.max.toFixed(2).padStart(7)} ms${size}`)
  }

  // ── 闸门 ───────────────────────────────────────────────────────────────
  const failures = []
  const check1 = (label, value, limit) => {
    if (value > limit) failures.push(`${label}: ${value.toFixed(2)}ms > 阈值 ${limit}ms`)
  }
  check1('getState（空会话）p95', results[0].p95, THRESHOLDS.getStateEmpty)
  check1('getState（500 轮转录）p95', results[1].p95, THRESHOLDS.getStateHeavy)
  check1('listSessions（1 个会话）p95', results[2].p95, THRESHOLDS.listSessions)
  check1('listSessions（20 个会话）p95', results[3].p95, THRESHOLDS.listSessionsMany)
  check1('appendTurn p95', results[4].p95, THRESHOLDS.appendTurn)
  check1('HTTP 往返 p95', results[5].p95, THRESHOLDS.httpRoundTrip)
  if (results[5].bytes > THRESHOLDS.responseBytes) {
    failures.push(`轮询响应体积 ${(results[5].bytes / 1024).toFixed(1)} KiB > 阈值 ${(THRESHOLDS.responseBytes / 1024).toFixed(0)} KiB`)
  }
  if (results[6].bytes > THRESHOLDS.responseBytes) {
    failures.push(`截断后响应体积 ${(results[6].bytes / 1024).toFixed(1)} KiB > 阈值 ${(THRESHOLDS.responseBytes / 1024).toFixed(0)} KiB`)
  }

  console.log('')
  if (failures.length > 0) {
    console.error(`✗ ${failures.length} 项超阈值：`)
    for (const failure of failures) console.error(`   ${failure}`)
    if (check) process.exit(1)
    return
  }
  console.log('✓ 全部在阈值内')
}

main().catch(error => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
