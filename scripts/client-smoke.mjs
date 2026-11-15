#!/usr/bin/env node
/**
 * 客户端冒烟测试：**真的把 client.js 跑起来渲染一次**。
 *
 * 为什么需要这一步
 * ----------------
 * `client.js` 是一千多行的浏览器 bundle，它只在 DSH 的浏览器里跑。
 * 在那之前，它**一行都没被执行过**——而它恰恰是最容易出错的一半：
 *
 *   · 变量名写错 → 用户看到空白面板（不是报错，是"没反应"）
 *   · hook 用错 → React 抛异常，面整个挂掉
 *   · JSX 结构写错 → 渲染直接失败
 *
 * 这些错误在 `node --check` 里全都查不出来（它只查语法）。
 * 所以这里用**真的 React + 真的 SSR 渲染**跑一遍：
 *
 *   1. 桩一个 `window.__ModuleLoader__`，把 client bundle 抓出来；
 *   2. 桩一个 cordis ctx，把 `main` 槽里注册的组件截下来；
 *   3. 用 `react-dom/server` 渲染成 HTML；
 *   4. 断言关键结构真的出现在输出里。
 *
 * SSR 不执行 `useEffect`，所以这一轮不会碰摄像头、麦克风、fetch——
 * 但**首屏结构、变量作用域、hook 调用顺序**全部会暴露。
 *
 * React 只在开发时需要。装不上就跳过（不阻塞构建）。
 *
 *   node scripts/client-smoke.mjs
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = join(ROOT, 'client.js')

/** Load react + react-dom/server, or return undefined when unavailable. */
async function loadReact() {
  try {
    const React = await import('react')
    const server = await import('react-dom/server')
    return { React, server }
  } catch {
    return undefined
  }
}

/**
 * Run the client bundle in a sandbox with a stubbed window, and capture
 * the component it registers into the `main` slot.
 */
async function captureComponent(React) {
  let main = undefined
  const slotRegister = (spec, component) => {
    // 插件会注册两个槽：`main`（面板本体）与 `sidebar.panellist`（侧栏图标）。
    // 这里只留 main——侧栏那个是图标，不是要渲染的东西。
    if (spec?.name === 'main') main = { spec, component }
    return () => {}
  }
  const slotInject = (name, factory) => {
    const disposer = factory()
    return () => { if (typeof disposer === 'function') disposer() }
  }
  const ctx = {
    effect: () => () => {},
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
    },
    slots: { register: slotRegister, inject: slotInject },
  }

  // The bundle is a classic script that assigns to `window.__ModuleLoader__`.
  const source = await readFile(CLIENT, 'utf8')
  const windowStub = {
    __ModuleLoader__: {
      load(definition) {
        const factory = definition.factory
        const module = factory((name) => {
          if (name === 'react') return React
          throw new Error(`client-smoke: 未预期的模块 ${name}`)
        })
        module.apply(ctx)
      },
    },
  }
  const sandbox = { window: windowStub, document: undefined, console }
  runInNewContext(source, sandbox, { filename: 'client.js' })
  return main
}

/** Render one component to static HTML. */
function render(server, React, component, props) {
  return server.renderToStaticMarkup(React.createElement(component, props))
}

async function main() {
  const react = await loadReact()
  if (react === undefined) {
    console.log('· 跳过：没装 react / react-dom（开发期装一下就能跑这个检查）')
    return
  }
  const { React, server } = react

  const captured = await captureComponent(React)
  if (captured === undefined) {
    throw new Error('client.js 没有向 main 槽注册组件')
  }
  if (captured.spec.key !== 'interviewer') {
    throw new Error(`main 槽的 key 不对：${String(captured.spec.key)}`)
  }
  if (typeof captured.component !== 'function') {
    throw new Error('main 槽注册的不是组件')
  }

  const html = render(server, React, captured.component, {})

  // 首屏必须有的东西。
  const expectations = [
    ['面板标题', '模拟面试间'],
    ['准备页签', '准备'],
    ['面试页签', '面试中'],
    ['报告页签', '报告'],
    ['新建按钮', '新建面试'],
  ]
  for (const [name, needle] of expectations) {
    if (!html.includes(needle)) {
      throw new Error(`渲染结果里没有${name}（找的是「${needle}」）`)
    }
  }
  console.log(`✓ 客户端冒烟测试通过：渲染 ${html.length} 字符，关键结构齐全`)
}

main().catch(error => {
  console.error(`\n✗ 客户端冒烟测试失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
