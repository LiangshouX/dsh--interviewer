/**
 * Fetching a job description from a link — with an honest failure path.
 *
 * **为什么要有"失败"这条路。**
 * 招聘站点的页面结构千差万别，多数还带反爬、登录墙和前端渲染。
 * 一个"假装抓到了"的插件比没有这个功能更糟糕：面试官拿着一份空 JD 开场，
 * 整场面试的针对性都没了。所以这里的契约是：
 *
 *   - 抓到了 → 返回正文 + 提取出的岗位名/职责/要求分段；
 *   - 抓不到 → **如实说抓不到，并给出手动兜底的下一步**（粘贴文本 / 上传文件）。
 *
 * 永远不要返回空正文当成功。
 */
import { extractTextFromHtml, splitJobDescription } from './html.js'

/** Content types we can turn into text. */
const TEXTUAL_TYPES = /text\/html|text\/plain|application\/json|text\/xml/i

/**
 * Fetch one URL and return its body.
 *
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<{status: number, contentType: string, body: string}>}
 */
async function fetchRaw(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Some job boards serve a stripped page to unknown agents.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })
    const body = await response.text()
    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      body,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch a job description.
 *
 * @param {string} url the job link
 * @param {object} options
 * @param {number} options.timeoutMs
 * @param {number} options.maxChars
 * @returns {Promise<{ok: true, url: string, title: string, text: string, sections: object} | {ok: false, url: string, error: string, hint: string}>}
 */
export async function fetchJobDescription(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000
  const maxChars = options.maxChars ?? 20000
  const hint = '抓取没成功。可以直接把 JD 正文粘贴进来，或上传文件（.txt/.md/.docx/.pdf）——两种都能用，插件会自动接着往下走。'

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, url, error: '这不是一个合法的 URL', hint }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, url, error: `不支持的协议：${parsed.protocol}（只接受 http/https）`, hint }
  }

  let raw
  try {
    raw = await fetchRaw(url, timeoutMs)
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? `请求超时（${timeoutMs}ms）`
      : `请求失败：${error && error.message ? error.message : String(error)}`
    return { ok: false, url, error: message, hint }
  }

  if (raw.status < 200 || raw.status >= 300) {
    return { ok: false, url, error: `HTTP ${raw.status}`, hint }
  }

  const looksHtml = TEXTUAL_TYPES.test(raw.contentType) || /<\/?[a-z][\s\S]*>/i.test(raw.body)
  if (!looksHtml) {
    const text = raw.body.trim().slice(0, maxChars)
    if (text === '') {
      return { ok: false, url, error: '页面是空的', hint }
    }
    return { ok: true, url, title: '', text, sections: splitJobDescription(text) }
  }

  const extracted = extractTextFromHtml(raw.body)
  const text = extracted.text.trim().slice(0, maxChars)
  if (text.length < 40) {
    // 多半是登录墙、验证码页，或者正文完全由前端渲染。
    return {
      ok: false,
      url,
      error: `页面正文太少（${text.length} 字），多半是登录墙、验证码或前端渲染`,
      hint,
    }
  }
  return {
    ok: true,
    url,
    title: extracted.title,
    text,
    sections: splitJobDescription(text),
  }
}
