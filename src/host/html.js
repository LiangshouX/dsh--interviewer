/**
 * Turning a web page into the part a human would read.
 *
 * A JD page is 90% chrome: nav bars, footer, "推荐职位", cookie banners,
 * tracking scripts. What the interviewer needs is the job title and the few
 * paragraphs that describe the role.
 *
 * This is deliberately a **heuristic reader**, not a DOM parser: the plugin
 * must work without a runtime dependency, and a JD page is a moving target.
 * When the result is thin, the caller must say so instead of pretending.
 */

/** Elements whose content is never part of a job description. */
const DROP_TAGS = ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'form', 'button']

/** Elements that usually wrap the real content on job boards. */
const CONTENT_HINTS = [
  'job-detail', 'job_detail', 'jobDesc', 'job-desc', 'jobDescription', 'position-detail',
  'job-intro', 'post-description', 'job-content', 'detail-content', 'description',
  'content__detail', 'article', 'main',
]

/** Chinese section headings we try to split on. */
const SECTION_PATTERNS = [
  { key: 'responsibilities', labels: ['岗位职责', '工作职责', '职位描述', '工作内容', '主要职责', '你将要做的', '我们希望你'] },
  { key: 'requirements', labels: ['任职要求', '岗位要求', '任职资格', '我们期望', '技能要求', '你具备', '职位要求'] },
  { key: 'bonus', labels: ['加分项', '优先条件', 'bonus', '优先', '加分'] },
]

/** Collapse whitespace and drop empty lines. */
function tidy(text) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
    .join('\n')
}

/**
 * Extract the readable text and the title from an HTML document.
 *
 * @param {string} html
 * @returns {{title: string, text: string}}
 */
export function extractTextFromHtml(html) {
  let document = html

  for (const tag of DROP_TAGS) {
    document = document.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ')
    document = document.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), ' ')
  }

  // <title> survives the strip above only if it was not inside <script>.
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : ''

  // Prefer the densest content-looking container.
  const candidates = []
  for (const hint of CONTENT_HINTS) {
    const pattern = new RegExp(
      `<([a-z][a-z0-9-]*)[^>]*(?:id|class)=["'][^"']*${hint}[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`,
      'gi',
    )
    let match
    while ((match = pattern.exec(document)) !== null) {
      candidates.push(match[2])
    }
  }
  const best = candidates.sort((a, b) => stripTags(b).length - stripTags(a).length)[0]

  const source = best ?? document
  const text = tidy(decodeEntities(stripTags(source)))
  return { title, text }
}

/**
 * Remove tags, keeping block boundaries as newlines.
 *
 * @param {string} html
 */
function stripTags(html) {
  return html
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
}

/**
 * Decode the HTML entities that actually show up in job posts.
 *
 * @param {string} text
 */
export function decodeEntities(text) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
    hellip: '…', mdash: '—', ndash: '–', middot: '·',
  }
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => named[name.toLowerCase()] ?? whole)
}

/**
 * Split a JD into its familiar sections.
 *
 * The split is best-effort: some posts have no headings at all, and then the
 * whole text stays under `overview` rather than being invented into sections.
 *
 * @param {string} text
 * @returns {{overview: string, responsibilities: string, requirements: string, bonus: string}}
 */
export function splitJobDescription(text) {
  const source = tidy(text)
  const result = { overview: '', responsibilities: '', requirements: '', bonus: '' }

  /** Index of the earliest section heading in the text. */
  const findHeading = labels => {
    let best = -1
    let bestLabel = ''
    for (const label of labels) {
      const index = source.indexOf(label)
      if (index >= 0 && (best === -1 || index < best)) {
        best = index
        bestLabel = label
      }
    }
    return best === -1 ? undefined : { index: best, label: bestLabel }
  }

  const found = SECTION_PATTERNS.map(pattern => ({ key: pattern.key, labels: pattern.labels, heading: findHeading(pattern.labels) }))
    .filter(entry => entry.heading !== undefined)
    .sort((a, b) => a.heading.index - b.heading.index)

  if (found.length === 0) {
    result.overview = source
    return result
  }

  result.overview = source.slice(0, found[0].heading.index).trim()
  for (let index = 0; index < found.length; index += 1) {
    const entry = found[index]
    const start = entry.heading.index + entry.heading.label.length
    const end = index + 1 < found.length ? found[index + 1].heading.index : source.length
    const body = source.slice(start, end).trim()
    result[entry.key] = result[entry.key] === '' ? body : `${result[entry.key]}\n${body}`
  }
  return result
}
