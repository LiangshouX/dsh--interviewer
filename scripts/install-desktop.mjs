/**
 * 把 release 里的 tarball 覆盖到 DSH 桌面端 profile 的安装位。
 *
 * 为什么不用 `plugin_manager install_bundle`：
 *   桌面端 profile 由 Electron 独占管理（`dsh plugin --profile desktop` 直接拒绝：
 *   "profile desktop is managed exclusively by the Electron application"），
 *   而 `plugin_manager` 那个工具只在 DSH 自己的会话里可用。
 *   但 profile 的 package.json 里已经写着
 *     "dsh-realtime-interview": "file:D:/.../release/dsh-realtime-interview-0.1.0.tgz"
 *   —— 指向的就是我们打出来的这个 tarball，profile 已经「认」它了，
 *   缺的只是让 node_modules 里的内容跟这个 tarball 一致。
 *   所以这里做的正是 install_bundle 落地的那一步。
 *
 * 幂等：解到临时目录 → 逐文件覆盖 → 删除新版本里已不存在的旧文件。
 *
 * 用法：node scripts/install-desktop.mjs [profileName]
 *   profileName 默认 'desktop'。
 *   DSH_HOME 环境变量可改 DSH 的数据根（默认 ~/.dsh）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, cpSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const profile = process.argv[2] ?? 'desktop'
// DSH_HOME 是 DSH 自己的数据根；没设就用 ~/.dsh（与 DSH 的默认一致）。
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const TARGET = join(DSH_HOME, 'profiles', profile, 'node_modules', 'dsh-realtime-interview')
const RELEASE = join(ROOT, 'release')

if (!existsSync(RELEASE)) throw new Error(`没有发布物目录：${RELEASE}`)
const tarball = readdirSync(RELEASE).find(name => name.endsWith('.tgz'))
if (tarball === undefined) throw new Error(`${RELEASE} 里没有 .tgz`)
const TGZ = join(RELEASE, tarball)

const STAGE = join(tmpdir(), 'dsh-realtime-interview-stage')
rmSync(STAGE, { recursive: true, force: true })
mkdirSync(STAGE, { recursive: true })

execFileSync('tar', ['-xzf', TGZ, '-C', STAGE], { stdio: 'inherit' })
const SRC = join(STAGE, 'package')
if (!existsSync(join(SRC, 'package.json'))) throw new Error('tarball 解包结构异常：找不到 package/package.json')

function walk(dir, base = '') {
  const out = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel))
    else out.push(rel)
  }
  return out
}

const before = existsSync(TARGET) ? walk(TARGET) : []
const after = walk(SRC)

mkdirSync(TARGET, { recursive: true })
for (const rel of after) {
  const dest = join(TARGET, rel)
  mkdirSync(join(dest, '..'), { recursive: true })
  cpSync(join(SRC, rel), dest, { force: true })
}
const afterSet = new Set(after)
const stale = before.filter(rel => !afterSet.has(rel))
for (const rel of stale) rmSync(join(TARGET, rel), { force: true })

console.log(`覆盖完成：${TARGET}`)
console.log(`  发布物：release/${tarball}`)
console.log(`  写入/更新 ${after.length} 个文件；清理旧文件 ${stale.length} 个`)
console.log('  提示：改了 src/host/** 要重启 DSH 才生效。')
