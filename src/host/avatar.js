/**
 * 预置面试官形象：**只读**静态资源服务。
 *
 * **为什么在包内、而不是工作区根。** 形象是**程序资源**（随插件版本走的素材），
 * 不是用户数据——和 `build/skills` 从包目录服务的先例一致（AGENTS §3 约束的是
 * 用户产生的数据）。把 2MB 只读素材塞进数据根，会让「数据根里都是我的面试材料」
 * 这个承诺变脏，还会多一次「复制失败」的故障点。
 *
 * **只开一扇窗。** 路由只认 `assets/avatar/**` 与 `assets/vendor/**` 两个目录：
 * 包里的其它东西（源码、测试、docs）一律不通过这条路由暴露。目录穿越
 * （`..`、百分号编码、Windows 反斜杠）在解析前就被拒绝，解析后再用
 * `startsWith(base + sep)` 复核一次——两道闸门，照 RuiC-2D `server.mjs:54`
 * 的做法。
 *
 * **它不含业务。** 「用哪一份形象」由设置项 `interviewerStyle` 决定，
 * 只有**这个目录里真的有一份完整形象**的 id 才算数：`assets/avatar/<id>/`
 * 必须同时有 `avatar.json`、`rig.json`、`built/layers.json`、`built/base.png`。
 * 少任何一样都只是「没装这份形象」，不是错误——面板的下拉里不出现它，
 * 设置里写了个不存在的 id 就回落到真实存在的那份。
 * **一份都没装也是合法状态**：清单为空、解析出空 id、舞台显示「形象不可用」，
 * 面试照常（形象是增强，不是前提）。
 *
 * **加一份新形象 = 放一个目录。** 不需要改代码、不需要改配置：
 * `assets/avatar/<id>/` 一出现，它就自动出现在面板的下拉里
 * （见 `dev/make-avatar.mjs`，作者工具只在这一步用）。
 */
import { createReadStream, existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { ASSET_DIR } from './paths.js'

/**
 * 这条路由的路径前缀。
 *
 * 不以 `/interviewer/api/` 开头——它不是 JSON，所以 `api.js` 必须在
 * JSON 前缀判断**之前**拦下它（`CAMERA_STREAM_PATH` 是同一个先例）。
 */
export const AVATAR_ASSET_PATH = '/interviewer/avatar/asset/'

/** 允许对外的两个目录（白名单，不是黑名单）。 */
const ALLOWED_ROOTS = ['avatar', 'vendor']

/** 形象根目录：每个子目录 = 一份可选形象。 */
export const AVATAR_DIR = join(ASSET_DIR, 'avatar')

/**
 * 默认形象的 id。
 *
 * **它是一个约定名，不是一份保证存在的文件。** 包里装了 `interviewer` 就用它；
 * 一份都没装时 `resolveAvatar` 返回空串——面板不下拉、舞台显示「形象不可用」，
 * 面试照常（形象是增强，不是前提）。
 */
export const DEFAULT_AVATAR_ID = 'interviewer'

/** 形象 id 的形状：它就是目录名，也是 URL 的一段。 */
const AVATAR_ID_RE = /^[A-Za-z0-9_-]{1,40}$/

/** 一份形象必须同时有这四样，缺一样就当它没装。 */
const REQUIRED_FILES = [
  ['avatar.json'],
  ['rig.json'],
  ['built', 'layers.json'],
  ['built', 'base.png'],
]

/**
 * 读一份形象的清单（`avatar.json`）；坏/缺失时返回 undefined。
 *
 * @param {string} dir
 * @returns {Promise<object|undefined>}
 */
async function readManifest(dir) {
  try {
    const value = JSON.parse(await readFile(join(dir, 'avatar.json'), 'utf8'))
    return value !== null && typeof value === 'object' ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * 包里有哪些形象可用。
 *
 * **目录就是清单。** 不做注册表、不写代码里的数组：`assets/avatar/<id>/`
 * 里凑齐四样文件就是一份可用形象。这既让「加一份形象」变成放目录，
 * 也让「拷坏一份」自动从下拉里消失，而不是让用户选到一个 404。
 *
 * @returns {Promise<Array<{id: string, name: string, default: boolean}>>}
 */
export async function listAvatars() {
  let entries
  try {
    entries = await readdir(AVATAR_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const avatars = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !AVATAR_ID_RE.test(entry.name)) continue
    const dir = join(AVATAR_DIR, entry.name)
    if (!REQUIRED_FILES.every(parts => existsSync(join(dir, ...parts)))) continue
    const manifest = await readManifest(dir)
    if (manifest === undefined) continue
    const name = typeof manifest.name === 'string' && manifest.name.trim() !== ''
      ? manifest.name.trim()
      : entry.name
    avatars.push({ id: entry.name, name, default: entry.name === DEFAULT_AVATAR_ID })
  }
  // 默认那份永远排第一：下拉的默认项不应该随目录名字母序漂移。
  avatars.sort((left, right) => {
    if (left.default !== right.default) return left.default ? -1 : 1
    return left.id.localeCompare(right.id)
  })
  return avatars
}

/**
 * 把「设置里写的 id」解析成**真实存在**的那一份。
 *
 * @param {string} preferred 设置项 `interviewerStyle` 的值（可能是空/旧 id）
 * @returns {Promise<{avatars: Array<object>, selected: string}>}
 */
export async function resolveAvatar(preferred) {
  const avatars = await listAvatars()
  const wanted = typeof preferred === 'string' ? preferred.trim() : ''
  const ids = avatars.map(item => item.id)
  if (wanted !== '' && ids.includes(wanted)) return { avatars, selected: wanted }
  const fallback = avatars.find(item => item.default) ?? avatars[0]
  return { avatars, selected: fallback === undefined ? '' : fallback.id }
}

/** 只发这几种字节。认不出的扩展名不发。 */
const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * 把一个客户端的相对路径切成安全的段。
 *
 * **拒绝而不是修正。** 看到 `..`、空段之外的怪东西、反斜杠、NUL 就直接拒绝：
 * 这里的输入只有我们自己写进包里的那几个文件名，任何"修一修还能用"的路径
 * 都说明有人在做不该做的事。
 *
 * @param {string} relPath
 * @returns {string[]|undefined}
 */
function safeSegments(relPath) {
  if (typeof relPath !== 'string' || relPath === '') return undefined
  if (relPath.includes('\\') || relPath.includes('\0') || relPath.includes('%')) return undefined
  const segments = relPath.split('/').filter(segment => segment !== '')
  if (segments.length === 0) return undefined
  if (!ALLOWED_ROOTS.includes(segments[0])) return undefined
  for (const segment of segments) {
    if (segment === '.' || segment === '..') return undefined
    if (!/^[A-Za-z0-9._-]+$/.test(segment)) return undefined
  }
  return segments
}

/** 一种失败的最小响应。 */
function refuse(res, status, text) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}

/**
 * 建一个形象资源服务。
 *
 * 两件事：发字节（`serveAsset`），以及回答「包里有哪些形象、现在该用哪一份」
 * （`list` / `resolve`）。判断只有这里一处——面板、设置页、`/config` 都读它，
 * 不许各自猜一个形象 id。
 */
export function createAvatarService() {
  return {
    /** 这条路由的根目录（测试与诊断用，不对外）。 */
    assetDir: ASSET_DIR,

    /** 包里有哪些形象（按目录发现，默认那份排第一）。 */
    list() {
      return listAvatars()
    },

    /** 把设置里写的 id 解析成真实存在的那一份（不存在就回落默认）。 */
    resolve(preferred) {
      return resolveAvatar(preferred)
    },

    /**
     * 发一个资源。方法已由路由层检查过（只允许 GET）。
     *
     * @param {import('node:http').ServerResponse} res
     * @param {string} relPath `AVATAR_ASSET_PATH` 之后的相对路径
     * @param {import('node:http').IncomingMessage} [req]
     * @returns {Promise<boolean>} 是否发出去了
     */
    async serveAsset(res, relPath, req) {
      const segments = safeSegments(relPath)
      if (segments === undefined) {
        refuse(res, 404, 'not found')
        return false
      }
      const base = resolve(ASSET_DIR, segments[0])
      const full = resolve(base, segments.slice(1).join(sep))
      // 第二道闸门：解析完必须仍在白名单目录之内（`D:\x\a` vs `D:\x\ab` 的
      // 前缀骗术由末尾的分隔符挡住）。
      if (full !== base && !full.startsWith(base + sep)) {
        refuse(res, 403, 'forbidden')
        return false
      }
      const type = MIME[extname(full).toLowerCase()]
      if (type === undefined) {
        refuse(res, 404, 'not found')
        return false
      }
      let info
      try {
        info = await stat(full)
      } catch {
        refuse(res, 404, 'not found')
        return false
      }
      if (!info.isFile()) {
        refuse(res, 404, 'not found')
        return false
      }
      const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
      // 包升级后 URL 不变、内容变了 → 用 ETag 让浏览器重新校验，
      // 而不是长 max-age 让旧形象留到缓存过期。
      const ifNoneMatch = req?.headers?.['if-none-match']
      if (typeof ifNoneMatch === 'string' && ifNoneMatch === etag) {
        res.writeHead(304, { etag, 'cache-control': 'no-cache' })
        res.end()
        return true
      }
      res.writeHead(200, {
        'content-type': type,
        'content-length': info.size,
        'cache-control': 'no-cache',
        etag,
      })
      const stream = createReadStream(full)
      stream.on('error', () => {
        // 头已经发出去，只能掐断连接——让客户端看到失败，而不是半张图。
        res.destroy()
      })
      stream.pipe(res)
      return true
    },
  }
}
