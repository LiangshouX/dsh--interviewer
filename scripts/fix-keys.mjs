#!/usr/bin/env node
/**
 * 给 `client.js` 里所有**数组 children** 的元素补上 `key`。
 *
 * 为什么需要它
 * ------------
 * React 的 `createElement` 对**单个** child 会打 `_store.validated = true`，
 * 但对**数组** children 会逐个检查 key。JSX 编译器会把静态数组标成
 * "已验证"，可插件的 client bundle 是手写的 `h(...)` 调用——
 * 没有那个标记，于是**数组里的每个 element 都会被警告**。
 *
 * 警告本身不致命，但它会淹没真正的错误（React 开发模式把
 * `console.error` 全输出）。而且缺 key 会导致列表重排时状态串位——
 * 那是真 bug，不是噪音。
 *
 * **用 AST 而不是正则。** `client.js` 里有含反引号的正则字面量
 * （`/(`[^`]+`|…)/g`），任何基于字符串扫描的方案都会在那里错位。
 * acorn 给出精确的节点位置，改写不会碰到别的字��。
 *
 *   node scripts/fix-keys.mjs           # 改写 client.js
 *   node scripts/fix-keys.mjs --check   # 只报告缺哪些，不改
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'client.js')
const checkOnly = process.argv.includes('--check')

/**
 * Walk the AST and collect the key work: duplicates to renumber, gaps to fill.
 *
 * **重复的 key 比缺 key 更阴。** 缺 key React 会警告；重复 key 也会警告，
 * 但更糟的是它会让 React 在重排列表时**复用错误的组件实例**——
 * 症状是「转录行串位」「输入框内容跑到别的行去」。
 *
 * @param {string} source
 * @returns {{duplicates: Array<{start: number, end: number, value: string}>, insertions: Array<{insertAt: number, context: string}>}}
 */
/**
 * Helpers that are known to return primitives, not elements.
 * Anything else called directly inside an array is treated as a component.
 */
const PRIMITIVE_HELPERS = new Set([
  'String', 'Number', 'Boolean', 'Object', 'Array', 'JSON', 'Date', 'Math',
  'formatClock', 'formatTime', 'initialsOf',
])

function findKeyWork(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const insertions = []
  // 重复 key 的判定在**数组作用域内**做（visit 时收集），React 也只要求这个。
  const duplicates = []
  // 数组里**直接调用组件函数**且组件自己没接 key —— 没法自动修，报告给人。
  const unfixable = []

  /**
   * Where a key can be attached to this element.
   *
   * Three shapes:
   *   - `h('div', { … }, …)`   → 往 props 里插 `key: …`
   *   - `h('div', null, …)`     → 把 `null` 换成 `{ key: … }`
   *   - `h('div', …)`           → 在第一个参数之后插 `{ key: … }, `
   *
   * @returns {{props?: any, nullArg?: any, insertAfterFirstArg?: number}}
   */
  const keySlotOf = element => {
    const second = element.arguments[1]
    if (second === undefined) {
      // `h('div')` / `h('div', …只有一个参数)`：props 要插在第一个参数**之后**。
      const first = element.arguments[0]
      if (first === undefined) return {}
      return { insertAfterFirstArg: first.end }
    }
    if (second.type === 'ObjectExpression') {
      return { props: second }
    }
    if (second.type === 'Literal' && second.value === null) {
      return { nullArg: second }
    }
    return {}
  }
  const keyPropertyOf = props => props.properties.find(property =>
    property.type === 'Property'
    && !property.computed
    && ((property.key.type === 'Identifier' && property.key.name === 'key')
      || (property.key.type === 'Literal' && property.key.value === 'key')))

  /**
   * The element candidates inside one array slot.
   *
   * Three shapes need a key, and only one of them is obvious:
   *
   *   1. `h(...)` / `Section(...)` —— 直接的元素；
   *   2. `cond ? h(...) : h(...)` —— **两个分支都要 key**（只管 then 分支
   *      是最常见的漏法，else 分支会安静地丢掉 key）；
   *   3. `items.map(item => h(...))` —— map 回调里返回的元素。
   *
   * @param {any} element
   * @returns {any[]}
   */
  const candidatesOf = element => {
    if (element.type === 'CallExpression') {
      // map(...) 的结果数组：去回调里找返回的元素。
      if (element.callee?.type === 'MemberExpression' && element.callee.property?.name === 'map') {
        const callback = element.arguments[0]
        if (callback?.type === 'ArrowFunctionExpression' && callback.body?.type === 'CallExpression') {
          return [callback.body]
        }
        return []
      }
      if (element.callee?.type === 'Identifier') {
        // **数组里的直接函数调用**，只要它可能返回元素，React 一样会逐个查 key。
        // `statTile('提问', …)` 就是这种——它返回的元素没有 key，React 会警告。
        // 之前只认 `h(...)`，这类全漏了。
        //
        // 判定方式：白名单之外的调用都当「组件」看。白名单是那些**确定返回
        // 原始值**的纯工具函数——它们的返回值是字符串/数字，不需要 key。
        if (element.callee.name !== 'h' && !PRIMITIVE_HELPERS.has(element.callee.name)) {
          return [{ ...element, __componentCall: element.callee.name }]
        }
        return [element]
      }
      return []
    }
    if (element.type === 'ConditionalExpression') {
      return [...candidatesOf(element.consequent), ...candidatesOf(element.alternate)]
    }
    return []
  }

  const visit = node => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    // **所有**数组字面量的元素都补 key——不只是直接写在 children 位置上的。
    // 数组先存进变量、之后再当 children 传进去时，React 一样会逐个检查；
    // 只扫「直接 child 参数」会漏掉 `const tabs = [...]` 这种写法。
    if (node.type === 'ArrayExpression') {
      // **查重按数组作用域。** React 只要求**同一个数组内**的 key 唯一；
      // 不同数组里的 'label' / 'body' 复用是完全合法的。之前这里做全局查重，
      // 会把合法的跨数组复用也报成重复——那不是 bug，只是噪声。
      const usedHere = new Map()
      for (const element of node.elements) {
        if (element === null) continue
        for (const candidate of candidatesOf(element)) {
          if (candidate.__componentCall !== undefined) {
            // 组件直接调用：看看它有没有自己接 key。
            const props = candidate.arguments[1]
            const hasKey = props?.type === 'ObjectExpression' && keyPropertyOf(props) !== undefined
            if (!hasKey) {
              unfixable.push({
                name: candidate.__componentCall,
                context: source.slice(candidate.start, candidate.start + 70).replace(/\s+/g, ' '),
              })
            }
            continue
          }
          const slot = keySlotOf(candidate)
          if (slot.props !== undefined) {
            const keyProperty = keyPropertyOf(slot.props)
            if (keyProperty !== undefined) {
              if (keyProperty.value.type === 'Literal') {
                const value = String(keyProperty.value.value)
                const count = usedHere.get(value) ?? 0
                usedHere.set(value, count + 1)
                if (count > 0) {
                  duplicates.push({
                    start: keyProperty.value.start,
                    end: keyProperty.value.end,
                    value,
                  })
                }
              }
              continue
            }
            insertions.push({
              insertAt: slot.props.start + 1,
              text: "key: '%KEY%', ",
              context: source.slice(candidate.start, candidate.start + 70).replace(/\s+/g, ' '),
            })
            continue
          }
          if (slot.nullArg !== undefined) {
            insertions.push({
              insertAt: slot.nullArg.start,
              end: slot.nullArg.end,
              text: "{ key: '%KEY%' }",
              context: source.slice(candidate.start, candidate.start + 70).replace(/\s+/g, ' '),
            })
            continue
          }
          if (slot.insertAfterFirstArg !== undefined) {
            insertions.push({
              insertAt: slot.insertAfterFirstArg,
              text: ', { key: %KEY% }',
              context: source.slice(candidate.start, candidate.start + 70).replace(/\s+/g, ' '),
            })
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'type' || key === 'loc') continue
      visit(node[key])
    }
  }

  visit(ast)

  return { duplicates, insertions, unfixable }
}

/** Every key literal value currently in the source. */
function allKeyValues(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const values = []
  const visit = node => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'Property' && !node.computed && node.key?.type === 'Identifier' && node.key.name === 'key') {
      if (node.value?.type === 'Literal') values.push(String(node.value.value))
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'type' || key === 'loc') continue
      visit(node[key])
    }
  }
  visit(ast)
  return values
}

async function main() {
  const source = await readFile(FILE, 'utf8')
  const { duplicates, insertions, unfixable } = findKeyWork(source)

  if (unfixable.length > 0) {
    console.log(`✗ ${unfixable.length} 处数组元素是组件直接调用，脚本无法自动补 key：`)
    for (const item of unfixable) console.log(`  ${item.name}(`, item.context)
    console.log('  → 让组件自己接一个 key 参数，或改成 h(Component, { key, … })')
    process.exitCode = 1
  }

  if (checkOnly) {
    console.log(`${duplicates.length} 处重复 key，${insertions.length} 处缺 key`)
    for (const item of insertions.slice(0, 25)) console.log('  缺:', item.context)
    return
  }

  /** @type {Array<{at: number, end?: number, text: string}>} */
  const edits = []

  // 已经用掉的 key 值——新编号必须避开它们，否则只是把「缺 key」换成
  // 「重复 key」，而重复 key 更糟（React 会复用错误的组件实例）。
  const used = new Set(allKeyValues(source))

  // ① 重复的 key → 改名成唯一值（**替换**整个字面量，不是插入）。
  let renumber = 0
  for (const entry of duplicates) {
    renumber += 1
    let name = `dup-${renumber}`
    while (used.has(name)) name = `${name}x`
    used.add(name)
    edits.push({ at: entry.start, end: entry.end, text: `'${name}'` })
  }

  // ② 缺 key 的元素 → 补一个不会撞的编号。
  let counter = 0
  for (const item of insertions) {
    counter += 1
    let name = `k${counter}`
    while (used.has(name)) {
      counter += 1
      name = `k${counter}`
    }
    used.add(name)
    edits.push({ at: item.insertAt, end: item.end, text: item.text.replace('%KEY%', name) })
  }

  if (edits.length === 0) {
    console.log('✓ key 齐全且唯一')
    return
  }

  // Apply from the end so earlier offsets stay valid.
  edits.sort((a, b) => b.at - a.at)
  let output = source
  for (const edit of edits) {
    output = output.slice(0, edit.at) + edit.text + output.slice(edit.end ?? edit.at)
  }
  await writeFile(FILE, output)
  console.log(`✓ 重编号 ${duplicates.length} 个重复 key，补齐 ${insertions.length} 个缺失 key`)
}

main().catch(error => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
