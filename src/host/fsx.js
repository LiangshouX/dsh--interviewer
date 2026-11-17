/**
 * Small filesystem helpers with **atomic writes** and **path containment**.
 *
 * Two rules live here because getting them wrong is expensive:
 *
 *  1. **Atomic writes.** A half-written `transcript.jsonl` or `checklist.json`
 *     is a corrupted interview. Every write goes to `<file>.tmp` and is then
 *     renamed over the target.
 *  2. **Containment.** Session ids come from the browser and from the agent.
 *     Both are untrusted: a path built by concatenation is a path traversal.
 *     `resolveWithin` refuses anything that escapes its root.
 */
import { mkdir, readFile, rename, writeFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

/**
 * Resolve `candidate` and assert it stays inside `root`.
 *
 * @param {string} root the containment root
 * @param {...string} parts path segments appended to the root
 * @returns {string} the absolute, contained path
 * @throws {Error} when the result escapes the root
 */
export function resolveWithin(root, ...parts) {
  const base = resolve(root)
  const target = resolve(base, ...parts)
  const prefix = base.endsWith(sep) ? base : base + sep
  if (target !== base && !target.startsWith(prefix)) {
    throw new Error(`路径越界：${parts.join('/')} 不在 ${base} 之内`)
  }
  return target
}

/**
 * Read a JSON file if it exists; `undefined` when it does not.
 *
 * A malformed file returns `undefined` rather than throwing: a corrupt
 * checklist must not take the whole plugin down. Callers that need to know
 * about corruption should use `readJsonStrict`.
 *
 * @param {string} path
 */
export async function readJsonIfExists(path) {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * Read a JSON file and report why it failed.
 *
 * @param {string} path
 * @returns {Promise<{ok: true, value: any} | {ok: false, error: string}>}
 */
export async function readJsonStrict(path) {
  try {
    const raw = await readFile(path, 'utf8')
    return { ok: true, value: JSON.parse(raw) }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: false, error: '文件不存在' }
    return { ok: false, error: `JSON 解析失败：${error && error.message ? error.message : String(error)}` }
  }
}

/**
 * Read a text file if it exists; `undefined` when it does not.
 *
 * @param {string} path
 */
export async function readTextIfExists(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Rename with a short, bounded retry.
 *
 * **Windows 上 rename 会被文件锁短暂拒绝。** 目标文件刚被创建时，
 * 杀毒软件、索引服务或另一个读句柄可能还握着它，于是
 * `rename(tmp, target)` 抛 `EPERM` / `EBUSY`——而这次写本身没有任何问题。
 * 面试转录会高频 touch `session.json`（每轮一次），所以这种瞬态失败
 * 在长面试里迟早撞上。重试几次就够了；仍然失败就把原错误抛出去，
 * 不掩盖真正的权限问题。
 *
 * @param {string} from
 * @param {string} to
 */
async function renameWithRetry(from, to) {
  const retryable = new Set(['EPERM', 'EBUSY', 'EACCES'])
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      if (!retryable.has(error?.code) || attempt >= 4) throw error
      await new Promise(resolvePromise => setTimeout(resolvePromise, 20 * (attempt + 1)))
    }
  }
}

/**
 * Write text atomically.
 *
 * @param {string} path
 * @param {string} text
 */
export async function writeTextAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, text, 'utf8')
  await renameWithRetry(tmp, path)
}

/**
 * Write JSON atomically, pretty-printed (these files are read by humans too).
 *
 * @param {string} path
 * @param {any} value
 */
export async function writeJsonAtomic(path, value) {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Append one line to a JSONL file, creating it if needed.
 *
 * @param {string} path
 * @param {any} value the object to append
 */
export async function appendJsonl(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'a' })
}

/**
 * Read a JSONL file into an array; unparsable lines are skipped.
 *
 * @param {string} path
 * @returns {Promise<any[]>}
 */
export async function readJsonl(path) {
  const raw = await readTextIfExists(path)
  if (raw === undefined) return []
  const rows = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      rows.push(JSON.parse(trimmed))
    } catch {
      // 一行坏掉不该毁掉整场面试；跳过并继续。
    }
  }
  return rows
}

/**
 * List a directory's entries; `[]` when it does not exist.
 *
 * @param {string} path
 * @returns {Promise<string[]>}
 */
export async function listDirIfExists(path) {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

/**
 * Whether a path exists and is a directory.
 *
 * @param {string} path
 */
export async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Whether a path exists and is a regular file.
 *
 * @param {string} path
 */
export async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}
