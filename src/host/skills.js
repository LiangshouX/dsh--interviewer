/**
 * 把插件自带的 Skill 注册进宿主的技能目录。
 *
 * 为什么需要这一步
 * ----------------
 * 插件包里躺着 `build/skills/interview-prep/SKILL.md` 与
 * `build/skills/interview-conduct/SKILL.md`，但**宿主默认看不见它们**：
 * DSH 只扫 `<root>/.dsh/skills`、`<root>/.agents/skills` 这类目录。
 *
 * 结果是：`interview-prep` 这些名字对任何 agent 都不可用——「先调研出一份
 * 考点清单再开面」这条主线就断了。这个模块补上那一环。
 *
 * 形态
 * ----
 * `ctx.skills.registerProvider()` —— 一个进程内的惰性 provider：
 *   list() 给出摘要（不读正文，避免每次都会话把两份 SKILL.md 全读一遍）
 *   get()  才把正文读出来
 *
 * **只在面试工作区里露头**
 * ----------------------
 * provider 注册进的是**全局层**（插件上下文不属任何 agent preset），
 * 所以按默认行为，这两个技能会出现在**每一个**会话的技能目录里——
 * 哪怕用户正在写代码、和面试毫无关系。
 *
 * 那不是小毛病：技能目录是模型每轮都读的东西，往里面塞两条与当前任务
 * 无关的技能，就是在给模型添噪声。
 *
 * 所以这里按**查询时的工作目录**收窄：只有当这次查询来自**面试工作区**
 * （插件自己的那一个）时才交出技能；别的工作区里，这个 provider 交出
 * 的是空目录。宿主在查技能时会把当前会话的 cwd 传进来
 * （`SkillLookupOptions.cwd`），我们据此判断。
 *
 * 面试自己的两个助手会话就是跑在这个工作区里的（`ensureAgentWorkspace`
 * 把它登记进 DSH 的工作区列表，派活时按 workspaceId 绑定），所以主线
 * 一点没断——只是不再四处乱冒。
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve as resolvePath, sep } from 'node:path'
import { SKILL_DIR } from './paths.js'

/** 本 provider 的名字（出现在技能摘要的 `provider` 字段里）。 */
export const PROVIDER_NAME = 'dsh-realtime-interview'

/**
 * 这个目录是不是**面试工作区**（或者它里面的某个子目录）。
 *
 * **为什么要自己判。** 宿主的技能注册表按「层」合并：插件的行落在全局层，
 * 所以这两个技能本来对所有会话可见。注册表没有「按工作目录过滤 provider」
 * 这个开关——过滤得由 provider 自己��（`list()` 收到查询的 cwd）。
 *
 * 判据：路径相同，或路径在它下面。Windows 上路径不分大小写，按平台处理。
 *
 * @param {string} root 面试工作区根
 * @param {string|undefined} cwd 这次查询的工作目录
 * @returns {boolean}
 */
export function isInterviewWorkspace(root, cwd) {
  if (typeof root !== 'string' || root.trim() === '') return false
  if (typeof cwd !== 'string' || cwd.trim() === '') return false
  const fold = process.platform === 'win32'
    ? value => value.toLowerCase()
    : value => value
  let base
  let target
  try {
    base = fold(resolvePath(root.trim()))
    target = fold(resolvePath(cwd.trim()))
  } catch {
    return false
  }
  if (base === target) return true
  const prefix = base.endsWith(sep) ? base : base + sep
  return target.startsWith(prefix)
}


/**
 * 拆出 `--- ... ---` 之间的 frontmatter。
 *
 * 只认 `key: value` 单行值——SKILL.md 的 frontmatter 就是这么写的，
 * 也正好是 `scripts/build.mjs` 校验的那一份，所以这里不引入 YAML 依赖。
 *
 * @param {string} text
 * @returns {{fields: Record<string, string>, body: string}}
 */
export function splitFrontmatter(text) {
  const source = String(text ?? '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  if (match === null) return { fields: {}, body: source }
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (pair === null) continue
    let value = pair[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    fields[pair[1]] = value
  }
  return { fields, body: source.slice(match[0].length) }
}

/**
 * 读一个技能目录，产出候选摘要。
 *
 * @param {string} name 目录名
 * @returns {Promise<object|undefined>}
 */
async function readSkill(name) {
  const dir = join(SKILL_DIR, name)
  const path = join(dir, 'SKILL.md')
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  const { fields } = splitFrontmatter(text)
  return {
    name: typeof fields.name === 'string' && fields.name !== '' ? fields.name : name,
    description: typeof fields.description === 'string' ? fields.description : '',
    whenToUse: typeof fields.whenToUse === 'string' && fields.whenToUse !== '' ? fields.whenToUse : undefined,
    path,
    source: 'bundled',
    provider: PROVIDER_NAME,
    invocation: { modelInvocable: true, userInvocable: true },
    resourceBase: { kind: 'directory', path: dir },
    rank: 0,
    locator: { name, path },
  }
}

/**
 * 注册「随包技能」provider。
 *
 * @param {object} ctx 插件上下文
 * @param {object} service InterviewService（用来问「面试工作区在哪」）
 * @returns {(() => void)|undefined} 注销器；宿主没有 skills 服务时返回 undefined
 */
export function registerInterviewSkills(ctx, service) {
  const skills = ctx?.get?.('skills')
  if (skills === undefined || skills === null || typeof skills.registerProvider !== 'function') return undefined
  if (!existsSync(SKILL_DIR)) return undefined

  /**
   * 这次查询是不是来自面试工作区。
   *
   * 拿不到工作区根就当**不是**——宁可技能不露头，也不要在别人家的
   * 工作区里冒出来。
   */
  const inInterviewWorkspace = async cwd => {
    if (typeof service?.effectiveRoot !== 'function') return false
    try {
      return isInterviewWorkspace(await service.effectiveRoot(), cwd)
    } catch {
      return false
    }
  }

  return skills.registerProvider(() => ({
    name: PROVIDER_NAME,
    async list(options) {
      // **别的工作区里，这个 provider 交出空目录。**
      if (!await inInterviewWorkspace(options?.cwd)) return { candidates: [], complete: true }
      // 一层深度：`build/skills/<name>/SKILL.md`。DSH 的技能发现也是这么浅。
      let entries
      try {
        entries = await readdir(SKILL_DIR, { withFileTypes: true })
      } catch {
        return { candidates: [], complete: true }
      }
      const candidates = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skill = await readSkill(entry.name)
        if (skill !== undefined) candidates.push(skill)
      }
      return { candidates, complete: true }
    },
    async get(candidate, options) {
      // 目录是空的，正文也拿不到：省得别人拿着旧目录直接来取。
      if (!await inInterviewWorkspace(options?.cwd)) return undefined
      const locator = candidate?.locator ?? {}
      const path = typeof locator.path === 'string' ? locator.path : undefined
      if (path === undefined) return undefined
      let text
      try {
        text = await readFile(path, 'utf8')
      } catch {
        return undefined
      }
      const { fields, body } = splitFrontmatter(text)
      return {
        ...candidate,
        name: typeof fields.name === 'string' && fields.name !== '' ? fields.name : candidate.name,
        description: typeof fields.description === 'string' && fields.description !== '' ? fields.description : candidate.description,
        content: body,
        metadata: { skillDir: typeof locator.name === 'string' ? locator.name : undefined },
      }
    },
  }))
}
