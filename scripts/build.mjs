#!/usr/bin/env node
/**
 * 构建与发布前校验。
 *
 *   node scripts/build.mjs            # 构建到 build/
 *   node scripts/build.mjs --check    # 只校验 build/ 是否与 src/ 一致
 *
 * 为什么有这一步
 * --------------
 * Skill 是**被开发的对象**，不是被调用的产品。开发到一半的 Skill 被 agent 调到，
 * 是这类仓库最典型的翻车方式。所以：
 *
 *   src/skills/   开发态，DSH 任何扫描根目录都看不到（不在 .dsh/skills、.agents/skills）
 *   build/skills/ 发布态，bundledSkillDir 指向这里
 *
 * 校验项（任一不过 → 非 0 退出，不产出）：
 *   1. 每个 skill 有合法 frontmatter（name kebab-case、description 非空）
 *   2. skill 正文里引用的包内路径都真实存在
 *   3. 插件半边（manifest / patch / host / client / locale / icon）齐全且合法
 *   4. 每个 JS 文件语法可解析
 *   5. Host 半边**真的能跑**（冒烟测试：建 service、调关键方法）
 */

import { readdir, readFile, writeFile, mkdir, rm, cp, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname, resolve, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeClient, clientOutOfDate } from './build-client.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const BUILD = join(ROOT, 'build')
const SKILLS_SRC = join(SRC, 'skills')
const HOST_SRC = join(SRC, 'host')

const onlyCheck = process.argv.includes('--check')

/** Recursively list files. */
async function walk(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(path)))
    else out.push(path)
  }
  return out
}

/** Parse the `--- ... ---` frontmatter (single-line `key: value` only). */
function parseFrontmatter(text) {
  const source = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/^\s*\n/, '')
  if (!source.startsWith('---')) return null
  const end = source.indexOf('\n---', 3)
  if (end === -1) return null
  const fields = {}
  for (const line of source.slice(3, end).split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (match) fields[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
  }
  return fields
}

const problems = []
const note = message => problems.push(message)

// ── 1. skills ──────────────────────────────────────────────────────────────
const skillDirs = existsSync(SKILLS_SRC)
  ? (await readdir(SKILLS_SRC, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
  : []

if (skillDirs.length === 0) note('src/skills/ 为空：没有可发布的 Skill')

for (const name of skillDirs) {
  const file = join(SKILLS_SRC, name, 'SKILL.md')
  if (!existsSync(file)) {
    note(`skills/${name}/SKILL.md 不存在（DSH 只认 <root>/<name>/SKILL.md，且发现深度只有一层）`)
    continue
  }
  const text = await readFile(file, 'utf8')
  const fields = parseFrontmatter(text)
  if (fields === null) {
    note(`skills/${name}/SKILL.md 缺少 frontmatter`)
  } else {
    if (!fields.name) note(`skills/${name}/SKILL.md 缺 name`)
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fields.name)) {
      note(`skills/${name}/SKILL.md 的 name="${fields.name}" 不是 kebab-case`)
    }
    if (!fields.description) note(`skills/${name}/SKILL.md 缺 description`)
  }

  // 正文里引用的**包内**路径必须可达。
  for (const match of text.matchAll(/`([A-Za-z0-9_./-]+\.(?:md|py|json))`/g)) {
    const ref = match[1]
    if (ref.startsWith('http')) continue
    const candidates = [join(SRC, ref), join(ROOT, ref)]
    if (!candidates.some(existsSync)) {
      note(`skills/${name}/SKILL.md 引用了不存在的包内路径：${ref}`)
    }
  }
}

// ── 2. 插件半边 ────────────────────────────────────────────────────────────
async function checkPluginHalf() {
  const manifestPath = join(ROOT, 'package.json')
  if (!existsSync(manifestPath)) {
    note('package.json 缺失：插件不是包，装不上')
    return
  }
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    note(`package.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
    return
  }
  if (manifest.name !== 'dsh-realtime-interview') note(`包名应为 dsh-realtime-interview，当前是 ${manifest.name}`)
  if (manifest.type !== 'module') note('package.json 的 type 必须是 module（Host 半边是 ESM）')
  const exportsField = manifest.exports ?? {}
  for (const key of ['.', './client', './locale/*.json', './icon']) {
    if (exportsField[key] === undefined) note(`package.json 缺少 exports["${key}"]`)
  }
  if (manifest.dsh?.bundle?.patch === undefined) note('package.json 缺少 dsh.bundle.patch')
  if (manifest.dsh?.client?.platform !== 'web') note("dsh.client.platform 必须是 'web'")
  if (manifest.dsh?.client?.inject === undefined) note('dsh.client.inject 未声明')

  for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg']) {
    if (!existsSync(join(ROOT, file))) note(`缺少 ${file}`)
  }
  const icon = await stat(join(ROOT, 'icon.svg')).catch(() => undefined)
  if (icon !== undefined && icon.size > 256 * 1024) note('icon.svg 超过 256 KiB')

  for (const locale of ['en', 'zh']) {
    const path = join(ROOT, 'locale', `${locale}.json`)
    if (!existsSync(path)) {
      note(`缺少 locale/${locale}.json`)
      continue
    }
    let doc
    try {
      doc = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      note(`locale/${locale}.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (typeof doc?.meta?.title !== 'string' || doc.meta.title === '') note(`locale/${locale}.json 缺少 meta.title`)
    if (typeof doc?.meta?.description !== 'string' || doc.meta.description === '') note(`locale/${locale}.json 缺少 meta.description`)
  }

  if (!existsSync(HOST_SRC)) note('src/host/ 缺失：Host 半边没有源码')

  for (const file of ['index.js', 'client.js']) {
    const path = join(ROOT, file)
    if (!existsSync(path)) continue
    const text = await readFile(path, 'utf8')
    if (file === 'index.js' && !/export\s+(async\s+)?function\s+apply\s*\(/.test(text)) {
      note('index.js 必须导出 apply(ctx, config)')
    }
    if (file === 'client.js' && !text.includes('window.__ModuleLoader__.load')) {
      note('client.js 必须通过 window.__ModuleLoader__.load 注册工厂')
    }
    if (file === 'client.js' && !text.includes("require('react')")) {
      note("client.js 必须从模块表取 react（require('react')）")
    }
  }
}

// ── 3. 语法检查 ────────────────────────────────────────────────────────────
async function checkSyntax() {
  const targets = [join(ROOT, 'index.js'), join(ROOT, 'client.js')]
  if (existsSync(HOST_SRC)) {
    for (const entry of await readdir(HOST_SRC, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) targets.push(join(HOST_SRC, entry.name))
    }
  }
  for (const target of targets) {
    if (!existsSync(target)) continue
    const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
    if (result.status !== 0) {
      const detail = String(result.stderr ?? '').split('\n').slice(0, 6).join('\n')
      note(`${relative(ROOT, target)} 语法错误：\n${detail}`)
    }
  }
}

// ── 4. 运行时冒烟测试 ──────────────────────────────────────────────────────
async function checkRuntime() {
  const servicePath = join(HOST_SRC, 'service.js')
  if (!existsSync(servicePath)) return
  const script = `
import { InterviewService } from ${JSON.stringify(pathToFileUrl(servicePath))}
const service = new InterviewService({ config: { dataRoot: process.env.TMP_DATA_ROOT } })
const sessions = await service.listSessions()
if (!Array.isArray(sessions)) throw new Error('listSessions() 不是数组')
const session = await service.createSession({ title: '冒烟测试', role: 'candidate', resumeText: '简历正文', jdText: 'JD 正文' })
if (typeof session.id !== 'string' || session.id === '') throw new Error('createSession() 没给出 id')
await service.saveChecklist(session.id, [{ topic: '限流与降级', why: 'JD 要求', level: 'core' }])
const checklist = await service.getChecklist(session.id)
if (checklist.items.length !== 1) throw new Error('saveChecklist() 没落盘')
await service.mutateChecklist(session.id, { op: 'probe', id: checklist.items[0].id, note: '答得清楚' })
await service.appendTurn(session.id, { role: 'interviewer', text: '讲讲你的项目' })
await service.appendTurn(session.id, { role: 'candidate', text: '我做的是……' })
const state = await service.getState(session.id)
if (state.stats.asked !== 1 || state.stats.answered !== 1) throw new Error('转录统计不对：' + JSON.stringify(state.stats))
await service.saveReport(session.id, '# 报告\\n测试')
const report = await service.getReport(session.id)
if (!report.includes('报告')) throw new Error('报告没落盘')
console.log('runtime smoke ok')
`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, TMP_DATA_ROOT: join(ROOT, '.tmp-smoke') },
  })
  await rm(join(ROOT, '.tmp-smoke'), { recursive: true, force: true })
  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').split('\n').filter(line => line.trim() !== '').slice(0, 8).join('\n')
    note(`Host 半边运行时冒烟测试失败：\n${detail}`)
  }
}

/** Convert a path into a file URL usable in an ESM import specifier. */
function pathToFileUrl(path) {
  return new URL(`file:///${path.replace(/\\/g, '/').replace(/^\/+/, '')}`).href
}

// ── 5. 客户端冒烟测试（可选：需要 react） ─────────────────────────────────
/**
 * `client.js` 是一千多行的浏览器 bundle，它**只在 DSH 的浏览器里跑**。
 * 在那之前它一行都没被执行过——而它恰恰是最容易出错的一半
 * （变量名写错、hook 用错、JSX 结构写错，`node --check` 全都查不出来）。
 *
 * 所以这里用真的 React + SSR 渲染跑一遍。装不上 react 就跳过，
 * 不阻塞构建（发布机上不一定装了）。
 */
async function checkClient() {
  const script = join(ROOT, 'scripts', 'client-smoke.mjs')
  if (!existsSync(script)) {
    note('scripts/client-smoke.mjs 不存在：客户端冒烟测试无法运行')
    return
  }
  const result = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', timeout: 120000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (/跳过：没装 react/.test(output)) {
    console.log('· 客户端冒烟测试跳过（没装 react）')
    return
  }
  if (result.status !== 0) {
    note(`客户端冒烟测试失败：\n${output.split('\n').filter(line => line.trim() !== '').slice(0, 8).join('\n')}`)
    return
  }
  console.log(output.trim())
}

/**
 * 性能闸门。
 *
 * 插件嵌在别人的主应用里——它慢一点，用户就会说「DSH 卡了」。
 * 所以性能不是"有空再优化"，是**红线**：要有能测、能卡住回归的闸门。
 *
 *   node scripts/perf.mjs --check        # Host/HTTP 侧耗时与体积
 *   node scripts/render-probe.mjs --check # 客户端渲染开销与「空闲轮询不重渲染」
 *
 * 两者都跑不动时（缺 react 等）跳过而不是失败。
 */
async function checkPerformance() {
  for (const [script, label] of [['perf.mjs', '性能'], ['render-probe.mjs', '渲染开销']]) {
    const path = join(ROOT, 'scripts', script)
    if (!existsSync(path)) {
      note(`scripts/${script} 不存在：${label}闸门无法运行`)
      continue
    }
    const result = spawnSync(process.execPath, [path, '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300000,
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (/跳过：/.test(output) && result.status === 0) {
      console.log(`· ${label}闸门跳过`)
      continue
    }
    if (result.status !== 0) {
      note(`${label}闸门未通过：\n${output.split('\n').filter(line => line.trim() !== '').slice(-10).join('\n')}`)
      continue
    }
    console.log(output.trim())
  }
}

/**
 * 布局闸门。
 *
 * **为什么要有它。** 面板被塞进**别人的**应用里，宿主给多宽不由我们决定：
 * 桌面版 DSH 里能分到 1200px，网页版侧栏里可能只有 250px。以前截图预设
 * 全是 1600px 的宽屏，于是「舞台被压成 0 宽、按钮点不到」这种事
 * 只能在真机上撞见。
 *
 * 这个闸门在 8 个宽度下渲染面板，断言「没横向溢出、舞台够宽、
 * 权限按钮点得到、提问条不压住按钮」——全是**用户能不能用**，
 * 不是 DOM 长什么样。没装 playwright 时跳过而不是失败。
 */
async function checkLayout() {
  const path = join(ROOT, 'scripts', 'layout-check.mjs')
  if (!existsSync(path)) {
    note('scripts/layout-check.mjs 不存在：布局闸门无法运行')
    return
  }
  const result = spawnSync(process.execPath, [path, '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (/跳过：/.test(output) && result.status === 0) {
    console.log('· 布局闸门跳过')
    return
  }
  if (result.status !== 0) {
    note(`布局闸门未通过：\n${output.split('\n').filter(line => line.trim() !== '').slice(-12).join('\n')}`)
    return
  }
  console.log(output.trim())
}

// 客户端 bundle 是**生成物**：先把 src/client/* 拼成 client.js，再校验。
// 反过来就会拿上一版去跑冒烟与渲染探针，等于校验了错的东西。
if (!onlyCheck) {
  await writeClient()
  console.log('✓ 已拼装 client.js（src/client/*）')
}

await checkPluginHalf()
await checkSyntax()
await checkClient()
await checkPerformance()
await checkLayout()

// ── 5. 构建或校验 ──────────────────────────────────────────────────────────
if (!onlyCheck) {
  await rm(BUILD, { recursive: true, force: true })
  await mkdir(join(BUILD, 'skills'), { recursive: true })
  for (const name of skillDirs) {
    await cp(join(SKILLS_SRC, name), join(BUILD, 'skills', name), { recursive: true })
  }
  console.log(`✓ 已构建：build/skills（${skillDirs.length} 个）`)
  await checkRuntime()
} else {
  // 客户端 bundle 的新鲜度：源码改了但没重新拼装，等于校验了上一版。
  if (await clientOutOfDate()) problems.push('client.js 与 src/client/ 不同步：先跑 node scripts/build-client.mjs')
  const srcFiles = (await walk(SKILLS_SRC)).map(file => relative(SKILLS_SRC, file)).sort()
  const buildFiles = (await walk(join(BUILD, 'skills'))).map(file => relative(join(BUILD, 'skills'), file)).sort()
  const same = JSON.stringify(srcFiles) === JSON.stringify(buildFiles)
  console.log(same ? '✓ build/skills 与 src/skills 一致' : '✗ build/ 已过期：请运行 node scripts/build.mjs')
  if (!same) problems.push('build/ 与 src/ 不同步')
}

// ── 6. 报告 ────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} 个问题：`)
  for (const problem of problems) console.error('   ' + problem)
  process.exit(1)
}
console.log('\n✓ 全部校验通过')
