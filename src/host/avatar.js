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
 * **它不含业务。** 这里没有「当前用哪个形象」的判断：形象目录是固定的
 * `assets/avatar/interviewer/`，开关在设置项 `interviewerAvatar` 里，
 * 由客户端决定挂不挂——Host 只管把字节送出去。
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
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
 * 只有 `serveAsset` 一个方法：路由层拿到路径，这里负责校验、响应头与字节。
 */
export function createAvatarService() {
  return {
    /** 这条路由的根目录（测试与诊断用，不对外）。 */
    assetDir: ASSET_DIR,

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
