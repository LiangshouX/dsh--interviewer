#!/usr/bin/env node
/**
 * 渲染开销探针：**面板每 1.5 秒轮询一次，它到底重渲染了多少？**
 *
 * 为什么这是红线
 * --------------
 * 插件嵌在别人的主应用里。插件慢一点，用户就会说「DSH 卡了」。
 * 而「卡」最常见的来源不是算法，是**渲染**：一个每次轮询都重建几百行
 * 转录的面板，能把 Electron 的主线程占满。
 *
 * 所以这里测三个数：
 *
 *   1. **首屏渲染** —— 面板挂载到出内容要多久；
 *   2. **数据回填渲染** —— 拿到完整面试数据（200 轮转录 + 14 个考点）后
 *      重建一次要多久；
 *   3. **轮询是否触发重渲染** —— 轮询拿到的 revision 没变时，
 *      **渲染次数必须不增加**。这一条是本插件最重要的性能不变量。
 *
 * 用 `react-test-renderer`（不是 SSR）：SSR 不跑 `useEffect`，
 * 测不到「轮询 → setState → 重渲染」这条真实路径。
 *
 *   node scripts/render-probe.mjs
 *   node scripts/render-probe.mjs --check    # 超阈值就非 0 退出
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')

/** Thresholds (ms). Windows + Electron gets headroom over this Linux box. */
const THRESHOLDS = {
  firstRender: 120,
  dataRender: 250,
  idlePollRender: 0, // 0 = 轮询不得触发任何重渲染
}

/** Build a session state that looks like a real mid-interview session. */
function makeSessionState() {
  const turns = []
  for (let index = 0; index < 200; index += 1) {
    turns.push({
      ts: Date.now() - (200 - index) * 20000,
      role: index % 2 === 0 ? 'interviewer' : 'candidate',
      text: `第 ${index + 1} 轮：这是一段接近真实面试长度的回答内容，用来压测渲染开销。`.repeat(3),
      meta: {},
    })
  }
  return {
    session: {
      id: 'iv-test', title: '渲染压测场', role: 'candidate', status: 'running',
      createdAt: Date.now() - 3600000, startedAt: Date.now() - 1800000, endedAt: 0,
      updatedAt: Date.now(), profileId: '', dir: '/tmp/iv-test',
    },
    revision: 'session.json:1:2|checklist.json:3:4|transcript.jsonl:5:6|report.md:-',
    checklist: {
      version: 2,
      items: Array.from({ length: 14 }, (_, index) => ({
        id: `c${index + 1}`, topic: `考点 ${index + 1}`, why: '对应 JD 的一条要求',
        level: index % 3 === 0 ? 'core' : 'deep', source: 'jd', tags: [],
        probed: index < 5, note: '', evidence: [],
      })),
      adjustments: [],
    },
    transcript: turns,
    transcriptTotal: turns.length,
    transcriptTruncated: false,
    documents: { resumeChars: 2400, jdChars: 1800, jdUrl: '', jdSections: {}, jdWarnings: [] },
    recordings: [
      { name: 'video-1.webm', kind: 'video', bytes: 1024 * 512, modifiedAt: Date.now(), path: '/tmp/a' },
      { name: 'audio-1.webm', kind: 'audio', bytes: 1024 * 64, modifiedAt: Date.now(), path: '/tmp/b' },
    ],
    report: '',
    stats: {
      asked: 100, answered: 100, durationMs: 1800000,
      checklistTotal: 14, checklistProbed: 5, adjustments: 3,
    },
  }
}

async function main() {
  const check = process.argv.includes('--check')
  // React 18 的 act 需要这个标志，否则会挂起等待。
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const require_ = createRequire(import.meta.url)
  let React
  let TestRenderer
  try {
    React = require_('react')
    TestRenderer = require_('react-test-renderer')
  } catch {
    console.log('· 跳过：没装 react / react-test-renderer')
    return
  }
  const h = React.createElement
  const { act, create } = TestRenderer

  const sessionState = makeSessionState()
  let fetchCalls = 0
  const stubFetch = async url => {
    fetchCalls += 1
    const body = String(url)
    if (body.endsWith('/sessions')) {
      return { ok: true, json: async () => ({ ok: true, data: { sessions: [sessionState.session] } }) }
    }
    if (body.includes('/profiles')) {
      return { ok: true, json: async () => ({ ok: true, data: { profiles: [] } }) }
    }
    if (body.includes('/asr')) {
      return { ok: true, json: async () => ({ ok: true, data: { mode: 'browser', reason: '测试桩' } }) }
    }
    if (body.includes('/config')) {
      return { ok: true, json: async () => ({ ok: true, data: { workspaceRoot: { path: '/tmp/root', source: 'config', reason: '测试桩' } } }) }
    }
    return { ok: true, json: async () => ({ ok: true, data: sessionState }) }
  }

  // 加载 client bundle。
  let main = undefined
  const source = await readFile(CLIENT, 'utf8')
  const windowStub = {
    __ModuleLoader__: {
      load(definition) {
        const module = definition.factory(name => {
          if (name === 'react') return React
          throw new Error(`render-probe: 未预期的模块 ${name}`)
        })
        module.apply({
          effect: () => () => {},
          locale: { register: () => () => {}, bind: () => key => key },
          slots: {
            register(spec, component) {
              if (spec?.name === 'main') main = component
              return () => {}
            },
            inject(name, factory) {
              const disposer = factory()
              return () => { if (typeof disposer === 'function') disposer() }
            },
          },
        })
      },
    },
  }
  // **抓 React 的警告。** 缺 key / 重复 key 在 React 里只是 console.error，
  // 不影响渲染——所以它们会一路溜到生产环境，在用户界面上变成「列表串位」。
  // 这里把警告变成硬失败。
  const warnings = []
  // React 跑在 vm 之外，它打日志走的是**全局** console，不是沙箱里的那个。
  // 所以要拦全局的，否则 React 的内部错误（和 key 警告）全都漏掉。
  const realError = globalThis.console.error
  const realWarn = globalThis.console.warn
  globalThis.console.error = (...args) => {
    warnings.push(args.map(String).join(' '))
    realError(...args)
  }
  globalThis.console.warn = (...args) => {
    warnings.push(args.map(String).join(' '))
    realWarn(...args)
  }
  const restoreConsole = () => {
    globalThis.console.error = realError
    globalThis.console.warn = realWarn
  }
  const sandboxConsole = {
    ...console,
    error: (...args) => {
      warnings.push(args.map(String).join(' '))
      console.error(...args)
    },
    warn: (...args) => {
      warnings.push(args.map(String).join(' '))
      console.warn(...args)
    },
  }
  const sandbox = { window: windowStub, console: sandboxConsole, fetch: stubFetch, navigator: {}, setTimeout, clearTimeout, setInterval, clearInterval }
  runInNewContext(source, sandbox, { filename: 'client.js' })
  if (main === undefined) throw new Error('client.js 没有注册 main 槽')

  // ① 首屏渲染。
  // 用 Profiler 数提交次数——react-test-renderer 没有直接的渲染计数钩子，
  // 而「轮询会不会引发重渲染」正是这里最想量的东西。
  const { Profiler } = React
  let renderCount = 0
  const startedFirst = Date.now()
  let renderer
  await act(async () => {
    renderer = create(h(Profiler, { id: 'interviewer', onRender: () => { renderCount += 1 } }, h(main)))
  })
  const firstRenderMs = Date.now() - startedFirst

  // ② 数据回填：等轮询把会话状态取回来。
  await act(async () => {
    await new Promise(done => setTimeout(done, 60))
  })
  const dataRenderMs = Date.now() - startedFirst - firstRenderMs

  // ③ 切到「面试中」——转录 200 行的重渲染。
  //
  // 注意：**等待放在 act 之外**。切到面试中之后，面板会起一个 1.5 秒的轮询
  // 定时器，而 React 的 act() 会一直等所有待处理工作结束——有活着的定时器时
  // 它可能永远不返回（探针自己挂住，而不是被测代码慢）。
  // 按**文本**找页签，而不是按 borderRadius——样式一改（视觉重做那次），
  // 按半径找就会一个都找不到，于是报告页/设置页从来没被渲染过，探针还"通过"。
  const findTab = label => renderer.root.findAll(node =>
    typeof node.props?.onClick === 'function'
    && node.props?.children === label)[0]

  const startedLive = Date.now()
  const liveTab = findTab('面试中')
  if (liveTab !== undefined) {
    await act(async () => { liveTab.props.onClick() })
  }
  const liveRenderMs = Date.now() - startedLive
  await new Promise(done => setTimeout(done, 80))

  const liveNodes = renderer.toJSON()
  const nodeCount = countNodes(liveNodes)

  // ③b 三个页签都点一遍：报告页的代码路径只有点开才会跑到。
  const reportStarted = Date.now()
  const reportTab = findTab('报告')
  if (reportTab !== undefined) {
    await act(async () => { reportTab.props.onClick() })
    await new Promise(done => setTimeout(done, 80))
  }
  const reportRenderMs = Date.now() - reportStarted
  const reportHtml = JSON.stringify(renderer.toJSON())
  if (!reportHtml.includes('面试后分析') && !reportHtml.includes('还没有报告')) {
    warnings.push('报告页签点开后没有渲染出报告区')
  }

  // ③c 设置页（批次 B 新增）：同样只看"能不能渲染出来"。
  const settingsTab = findTab('设置')
  if (settingsTab !== undefined) {
    await act(async () => { settingsTab.props.onClick() })
    await new Promise(done => setTimeout(done, 80))
    const settingsHtml = JSON.stringify(renderer.toJSON())
    if (!settingsHtml.includes('设置') && !settingsHtml.includes('数据在哪')) {
      warnings.push('设置页签点开后没有渲染出设置区')
    }
  }

  // ④ 轮询一次：**revision 相同**，渲染次数不得增加。
  // 面试中的轮询间隔是 1.5 秒，所以要真的等过这个间隔才测得到。
  const rendersBefore = renderCount
  await act(async () => {
    await new Promise(done => setTimeout(done, 1800))
  })
  const idlePollRenders = renderCount - rendersBefore

  // 统计产物体积。
  const html = JSON.stringify(liveNodes)
  const clientBytes = Buffer.byteLength(source, 'utf8')

  console.log('\n渲染开销（Linux 容器 + react-test-renderer；用户机是 Windows + Electron）\n')
  console.log(`  首屏渲染                        ${String(firstRenderMs).padStart(6)} ms`)
  console.log(`  数据回填（含 200 轮转录）       ${String(dataRenderMs).padStart(6)} ms`)
  console.log(`  产物节点数                      ${String(nodeCount).padStart(6)} 个`)
  console.log(`  产物体积                        ${String((html.length / 1024).toFixed(1)).padStart(6)} KiB`)
  console.log(`  client.js 体积                  ${String((clientBytes / 1024).toFixed(1)).padStart(6)} KiB`)
  console.log(`  切到面试中（200 轮转录）        ${String(liveRenderMs).padStart(6)} ms`)
  console.log(`  切到报告                        ${String(reportRenderMs).padStart(6)} ms`)
  console.log(`  空闲轮询引发的重渲染            ${String(idlePollRenders).padStart(6)} 次  ← 必须为 0`)
  console.log(`  React 警告                      ${String(warnings.length).padStart(6)} 条  ← 必须为 0`)

  const failures = []
  if (firstRenderMs > THRESHOLDS.firstRender) failures.push(`首屏渲染 ${firstRenderMs}ms > ${THRESHOLDS.firstRender}ms`)
  if (dataRenderMs > THRESHOLDS.dataRender) failures.push(`数据回填渲染 ${dataRenderMs}ms > ${THRESHOLDS.dataRender}ms`)
  if (idlePollRenders > THRESHOLDS.idlePollRender) {
    failures.push(`空闲轮询引发了 ${idlePollRenders} 次重渲染（应为 0）：revision 比对失效`)
  }
  for (const warning of warnings) {
    failures.push(`React 警告：${warning.split('\n').slice(0, 6).join(' | ')}`)
  }
  console.log('')
  if (failures.length > 0) {
    console.error(`✗ ${failures.length} 项超阈值：`)
    for (const failure of failures) console.error(`   ${failure}`)
    if (check) process.exit(1)
    return
  }
  console.log('✓ 全部在阈值内')
  restoreConsole()
  // 沙箱里的轮询定时器会一直持有事件循环；测完就退出。
  process.exit(0)
}

/** Count the nodes in a react-test-renderer tree. */
function countNodes(node) {
  if (node === null || node === undefined) return 0
  if (Array.isArray(node)) return node.reduce((total, child) => total + countNodes(child), 0)
  if (typeof node !== 'object') return 0
  let total = 1
  if (node.children !== null && node.children !== undefined) total += countNodes(node.children)
  return total
}

main().catch(error => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
