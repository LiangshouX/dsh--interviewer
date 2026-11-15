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
 * Walk the AST and collect every array child element that needs a key.
 *
 * @param {string} source
 * @returns {Array<{insertAt: number, context: string}>}
 */
function findMissingKeys(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const insertions = []

  const visit = node => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'h') {
      for (const childArg of node.arguments.slice(2)) {
        if (childArg?.type !== 'ArrayExpression') continue
        for (const element of childArg.elements) {
          if (element === null) continue
          if (element.type !== 'CallExpression') continue
          if (element.callee?.type !== 'Identifier' || element.callee.name !== 'h') continue
          const props = element.arguments[1]
          if (props === undefined || props === null || props.type !== 'ObjectExpression') continue
          const hasKey = props.properties.some(property =>
            property.type === 'Property'
            && !property.computed
            && ((property.key.type === 'Identifier' && property.key.name === 'key')
              || (property.key.type === 'Literal' && property.key.value === 'key')))
          if (hasKey) continue
          insertions.push({
            insertAt: props.start + 1,
            context: source.slice(element.start, element.start + 70).replace(/\s+/g, ' '),
          })
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'type' || key === 'loc') continue
      visit(node[key])
    }
  }

  visit(ast)
  return insertions
}

async function main() {
  const source = await readFile(FILE, 'utf8')
  const insertions = findMissingKeys(source)

  if (checkOnly) {
    console.log(`${insertions.length} 处数组元素缺 key`)
    for (const item of insertions.slice(0, 25)) console.log('  ', item.context)
    return
  }
  if (insertions.length === 0) {
    console.log('✓ 所有数组元素都有 key')
    return
  }

  // Apply from the end so earlier offsets stay valid.
  insertions.sort((a, b) => b.insertAt - a.insertAt)
  let output = source
  let counter = insertions.length
  for (const item of insertions) {
    output = output.slice(0, item.insertAt) + ` key: 'k${counter}',` + output.slice(item.insertAt)
    counter -= 1
  }
  await writeFile(FILE, output)
  console.log(`✓ 给 ${insertions.length} 个数组元素补上了 key`)
}

main().catch(error => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
