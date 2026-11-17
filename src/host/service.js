/**
 * The interview session — the one implementation behind every caller.
 *
 * **The shape of one session on disk**
 *
 *   <workspaceRoot>/workspaces/<session-id>/
 *     session.json      元信息（标题、角色、状态、时间）
 *     resume.txt        简历正文（纯文本）
 *     jd.txt            JD 正文（纯文本）
 *     jd.json           JD 的来源与分段（抓取链接、职责/要求切分）
 *     checklist.json    考点清单（**活文档**，面试中会被调整）
 *     transcript.jsonl  逐轮转录，一行一个 JSON 对象
 *     report.md         面试后的分析报告
 *     recordings/       录像（.webm）与录音（.webm/.mp3）
 *
 * **为什么清单是活文档。** 考点清单是**准备阶段**的产物，但面试是活的：
 * 候选人把某个考点答穿了，就该顺势深挖；候选人某段经历与 JD 完全无关，
 * 就该换一个方向；临场冒出的好问题也该被记下来。所以清单支持
 * `add / update / remove / probe` 四种调整，且**每一处调整都留痕**
 * （`adjustments[]`），事后复盘时能看到「为什么最后问了这些」。
 *
 * **为什么一切从磁盘派生。** 插件不缓存业务状态——缓存由文件 mtime + size
 * 失效。这样界面、agent 工具、报告三边永远看到同一份事实。
 */
import { join, resolve } from 'node:path'
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { describeWorkspaceRoot, ensureDataRoot, defaultWorkspaceRoot, readSettings, writeSettings, settingsPath, SETTING_KEYS, normalizeSetting, resolveConfig, isBundleDefault } from './paths.js'
import {
  appendJsonl, isDirectory, isFile, listDirIfExists, readJsonIfExists, readJsonl,
  readTextIfExists, resolveWithin, writeJsonAtomic, writeTextAtomic,
} from './fsx.js'
import { fetchJobDescription } from './jd.js'
import { extractTextFromUpload } from './extract.js'
import { CameraService, locateFfmpeg } from './camera.js'
import { locateChromium } from './camera-browser.js'
import { VoiceService } from './voice/index.js'
import { clearSecret, discoverCredentials, setSecret } from './voice/credentials.js'
import { voicePresets } from './voice/presets.js'
import { voiceTable, voicesFor } from './voice/voices.js'
import { measureFluency, summarizeFluency } from './fluency.js'

/** Session lifecycle. */
export const SESSION_STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  RUNNING: 'running',
  DONE: 'done',
}

/** Checklist item levels. */
export const CHECKLIST_LEVEL = {
  CORE: 'core',
  DEEP: 'deep',
  BONUS: 'bonus',
}

/** A session id is a path segment, so it is restricted on purpose. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/**
 * A profile id may contain Chinese (it is often derived from a job title),
 * but never a path separator or a dot — so it cannot escape its root.
 */
const PROFILE_ID_PATTERN = /^[A-Za-z0-9一-鿿][A-Za-z0-9_一-鿿-]{0,80}$/

/**
 * A resume id is a path segment too, so it gets the same treatment.
 */
const RESUME_ID_PATTERN = /^rs-[A-Za-z0-9]{1,32}-[A-Za-z0-9]{1,8}$/

/** Maximum accepted resume / JD size (characters). */
const MAX_DOC_CHARS = 200000

/**
 * How long the native directory chooser may stay open (milliseconds).
 *
 * The dialog waits for a human. Someone who walks away must not leave a
 * child process and a modal window parked forever, so the pick is aborted
 * after this long and the caller is told what happened.
 */
const PICK_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Read the path out of whatever the host's picker returned.
 *
 * **为什么要这么啰嗦。** 宿主的远端接口把结果包成 `{ ok, value }`，
 * 而进程内的服务直接返回路径本身；用户取消时又可能是 `null`。
 * 三种形状都见过，所以三种都认——认错了就会把 `undefined` 当成路径存进去。
 *
 * @param {any} result
 * @returns {string|null}
 */
function unwrapPickedPath(result) {
  if (result === null || result === undefined) return null
  if (typeof result === 'string') return result.trim() === '' ? null : result.trim()
  if (typeof result === 'object') {
    if (result.ok === false) return null
    const value = result.value
    if (typeof value === 'string') return value.trim() === '' ? null : value.trim()
  }
  return null
}

/**
 * How many transcript rows the panel gets in one poll.
 *
 * The panel polls every 1.5 s during an interview; the transcript grows with
 * every turn. This caps the payload so a long interview cannot turn the
 * poll into a steady stream of deserialization work in the renderer.
 */
const DEFAULT_TRANSCRIPT_LIMIT = 200

/**
 * 「测试播报」合成的那句话。
 *
 * 固定短句有两个好处：一听就知道是不是真在播（不是一段缓存的音频），
 * 而且失败时耗时可比、能进单测。
 */
const VOICE_TEST_SENTENCE = '这是一次语音播报测试。听到这句话，说明面试官的声音已经接通。'

/**
 * One interview session, with every operation the callers need.
 */
export class InterviewService {
  /**
   * @param {{config?: object, ctx?: object}} deps
   */
  constructor(deps = {}) {
    // **原始配置要留着。** resolveConfig 会把缺省值填满，之后就分不清
    // "配置文件里写了 auto" 和 "配置文件里根本没写"——而合并面板设置时，
    // 只有**显式写过**的键才该压过面板设置。
    this.rawConfig = deps.config !== undefined && typeof deps.config === 'object' && deps.config !== null ? deps.config : {}
    // **只有「值不同于发版默认」的键才算用户显式写死。** 发版补丁 restated 了所有
    // 默认值（见 paths.js BUNDLE_DEFAULTS），若把「键存在」当显式，面板设置会被这些
    // 默认值永远顶掉（bug2）。等于默认的键视为没写，面板可覆盖；真正改过的仍压过面板。
    this.explicitKeys = new Set(Object.keys(this.rawConfig).filter(key => !isBundleDefault(key, this.rawConfig[key])))
    this.config = resolveConfig(deps.config)
    this.ctx = deps.ctx
    /** Session id the UI last touched; used as the default for agent calls. */
    this.selectedSessionId = undefined
    /**
     * The Host-side camera.
     *
     * **为什么在 Host 侧采摄像头。** DSH 桌面端的 Electron 权限处理器只放行
     * 纯音频请求，摄像头在主进程就被拒了——改 Windows 设置也没用。但 Host
     * 半边跑在 Node 宿主进程里，没有那道闸门。
     *
     * **它只负责摄像头。** 麦克风仍然走浏览器的 `getUserMedia`——那条路在
     * 桌面端是通的，没必要重造。
     */
    this.camera = new CameraService({ ffmpegPath: this.config.ffmpegPath, chromiumPath: this.config.chromiumPath })
    /**
     * 语音能力的门面（识别链路 + 合成链路）。
     *
     * **为什么是宿主优先。** 宿主的 `speechToText` 是 provider 无关的服务，
     * 插件既不经手厂商凭据、也不绑定厂商；插件自己的 HTTP 链路只是回落。
     * 合成则相反：宿主目前没有 TTS，所以默认走"配好的模型 → 免密钥自然音
     * → 浏览器"。
     */
    this.voice = new VoiceService(this)
  }

  // ── paths ────────────────────────────────────────────────────────────────

  /**
   * The workspace root in force right now.
   *
   * **优先级：配置 > 面板里选的 > 默认。**
   *
   * 为什么配置最高：配置文件是「这个环境就该这么放」的硬性约定
   * （比如一台机器上所有插件共用一个数据盘）；面板里选的是「这台机器上
   * 我想放哪儿」的用户选择。两者冲突时，按约定来。
   *
   * 每次都重新算，而不是在构造时定死——面板改了目录要**立刻**生效，
   * 不该要求用户重启 DSH。
   *
   * @returns {Promise<string>}
   */
  async effectiveRoot() {
    if (this.config.workspaceRootExplicit) return this.config.workspaceRoot
    const saved = await readSettings()
    if (typeof saved.workspaceRoot === 'string' && saved.workspaceRoot.trim() !== '') {
      return saved.workspaceRoot.trim()
    }
    return defaultWorkspaceRoot()
  }

  /**
   * The workspace root — the one place all interview data lives.
   *
   * @returns {Promise<{path: string, source: string, reason: string, exists: boolean, error?: string}>}
   */
  async location() {
    const saved = await readSettings()
    return describeWorkspaceRoot(
      this.config.workspaceRoot,
      this.config.workspaceRootExplicit,
      saved.workspaceRoot,
    )
  }

  /** The directory holding every session — one interview, one subdirectory. */
  async sessionsDir() {
    const root = await ensureDataRoot(await this.effectiveRoot())
    if (root.error !== undefined) throw new Error(root.error)
    return join(root.path, 'workspaces')
  }

  /** The directory holding every job profile (岗位档案). */
  async profilesDir() {
    const root = await ensureDataRoot(await this.effectiveRoot())
    if (root.error !== undefined) throw new Error(root.error)
    return join(root.path, 'profiles')
  }

  /**
   * Ask the **host** to show its own directory picker.
   *
   * **为什么用宿主的，而不是自己拼一个。** 宿主是 GUI host，它手里有
   * 原生的目录选择器（Windows 上是 `IFileOpenDialog` 那个「浏览文件夹」）。
   * 插件自己再造一个（拉起 PowerShell、或者用浏览器的目录选择 API）
   * 只会得到一个「样子像、但没有权限感」的替代品——用户在系统对话框里
   * 选路径，才知道这个路径会被写进哪。
   *
   * **宿主的服务名是 `ctx.directoryPicker`，不是一个叫
   * `directoryPickerController` 的东西。** 后者只是宿主给「远程调用者」
   * 用的远端控制器名字，宿主自己调它会走远端通道，拿到 undefined。
   * 真正的 seam 是个能力型服务：`capability()` 告诉你它能干什么——
   *
   *   - `{kind: 'native', pick(signal)}` → 弹系统选择器，返回绝对路径或 null（取消）
   *   - `{kind: 'browse', list, createDirectory}` → 只能逐级列目录，没有「一次弹窗」
   *
   * 宿主没有这个能力时**如实说没有**，并给出下一步（手动填路径），
   * 而不是假装成功。
   *
   * @returns {Promise<{available: boolean, picked: string|null, reason?: string}>}
   */
  async pickWorkspaceRoot() {
    const seam = this.ctx?.get?.('directoryPicker')
    if (seam === undefined || seam === null || typeof seam.capability !== 'function') {
      return { available: false, picked: null, reason: '这个宿主没有提供目录选择器' }
    }
    let capability
    try {
      capability = seam.capability()
    } catch (error) {
      return {
        available: false,
        picked: null,
        reason: error && error.message ? error.message : String(error),
      }
    }
    if (capability === undefined || capability === null) {
      return { available: false, picked: null, reason: '这个宿主没有提供目录选择器' }
    }
    if (capability.kind !== 'native' || typeof capability.pick !== 'function') {
      // browse 后端只能逐级列目录，没有「一次弹窗选一个」的接口。
      // 与其做个半吊子，不如说清楚，并给出手动填路径的出路。
      return {
        available: false,
        picked: null,
        reason: `宿主只提供浏览式目录树（${capability.kind ?? '未知'}），没有系统选择器；请直接把绝对路径填进卷宗库那一栏。`,
      }
    }
    try {
      // **必须传 signal。** 宿主 native 后端第一件事就是读 `signal.aborted`，
      // 不传的话它会直接抛 "Cannot read properties of undefined"，
      // 看起来像选择器坏了，其实是调用姿势不对。
      //
      // 这个 signal 是给「对话框一直开着、用户不选」的兜底：
      // 超时就把子进程里的对话框关掉，不让它永远挂着。
      const controller = new AbortController()
      const timer = setTimeout(() => { controller.abort() }, PICK_TIMEOUT_MS)
      try {
        const result = await capability.pick(controller.signal)
        return { available: true, picked: unwrapPickedPath(result) }
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      return {
        available: false,
        picked: null,
        reason: error && error.message ? error.message : String(error),
      }
    }
  }

  /**
   * Move the workspace root to another directory.
   *
   * **切根之前先确认新目录能用。** 建不出 `workspaces/` 的目录，
   * 切过去之后整个插件都会瘫——所以先建好再建，再落设置。
   *
   * @param {string} path the new absolute root
   * @param {string} [migrateFrom] copy the data of this root into the new one
   * @returns {Promise<{workspaceRoot: object, migrated: object, warning?: string}>}
   */
  async setWorkspaceRoot(path, migrateFrom = undefined) {
    const target = String(path ?? '').trim()
    if (target === '') throw new Error('没给目录')
    const absolute = resolve(target)
    const ensured = await ensureDataRoot(absolute)
    if (ensured.error !== undefined) throw new Error(ensured.error)

    let migrated = { copied: false, sessions: 0, profiles: 0, from: undefined }
    if (typeof migrateFrom === 'string' && migrateFrom.trim() !== '') {
      migrated = await this.migrateWorkspaceData(migrateFrom.trim(), absolute)
    }

    await writeSettings({ workspaceRoot: absolute })

    // 配置里写死了的话，面板这次的选择**不生效**——必须说出来，
    // 否则用户会以为改好了，结果数据还在老地方。
    const warning = this.config.workspaceRootExplicit
      ? '配置文件里写死了工作区根，面板里选的这次不生效：改配置才作数。'
      : undefined
    return { workspaceRoot: await this.location(), migrated, ...(warning !== undefined ? { warning } : {}) }
  }

  /**
   * Copy a root's data (sessions + profiles) into another root.
   *
   * **是复制，不是移动。** 复制完老目录还在，用户确认新目录没问题之后
   * 自己删；万一复制到一半出问题，老数据还完整地在那儿。
   *
   * @param {string} from the old root
   * @param {string} to the new root
   * @returns {Promise<{copied: boolean, sessions: number, profiles: number, from: string, error?: string}>}
   */
  async migrateWorkspaceData(from, to) {
    const source = resolve(from)
    const target = resolve(to)
    const result = { copied: false, sessions: 0, profiles: 0, from: source }
    if (source === target) return { ...result, copied: true }
    try {
      const ensured = await ensureDataRoot(target)
      if (ensured.error !== undefined) return { ...result, error: ensured.error }
      for (const folder of ['workspaces', 'profiles']) {
        const sourcePath = join(source, folder)
        if (!isDirectory(sourcePath)) continue
        await cp(sourcePath, join(target, folder), { recursive: true, force: false })
        const copied = (await listDirIfExists(join(target, folder))).length
        if (folder === 'workspaces') result.sessions = copied
        else result.profiles = copied
      }
      return { ...result, copied: true }
    } catch (error) {
      return {
        ...result,
        error: error && error.message ? error.message : String(error),
      }
    }
  }

  /**
   * Resolve one session directory, refusing anything that escapes the root.
   *
   * @param {string} sessionId
   */
  async sessionDir(sessionId) {
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error(`非法的会话 id：${String(sessionId)}`)
    }
    const root = await this.sessionsDir()
    return resolveWithin(root, sessionId)
  }

  // ── sessions ─────────────────────────────────────────────────────────────

  /**
   * List every session, newest first.
   *
   * @returns {Promise<Array<object>>}
   */
  /**
   * 删除一场面试（连同它的卷宗目录）。
   *
   * **归档不是删除的替代品。** 归档是"收起来"，误触新建出来的空场次
   * 需要的是真的删掉——否则列表永远比实际用过的多。
   *
   * 正在进行的面试默认拒绝删除：先结束，避免把进行中的转录删掉。
   *
   * @param {string} sessionId
   * @param {{force?: boolean}} [input]
   */
  async deleteSession(sessionId, input = {}) {
    const id = String(sessionId ?? '').trim()
    const dir = await this.sessionDir(id)
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta === undefined) {
      return { ok: false, error: `没有这场面试：${id}`, hint: '刷新列表看看它是不是已经被删掉了。' }
    }
    if (meta.status === 'running' && input.force !== true) {
      return {
        ok: false,
        error: '这场面试正在进行，先结束再删。',
        hint: '结束面试后可以删；只是不想看到它的话，归档也可以。',
      }
    }
    await rm(dir, { recursive: true, force: true })
    if (this.selectedSessionId === id) this.selectedSessionId = undefined
    return { ok: true, sessionId: id, title: meta.title ?? id, deleted: dir }
  }

  /**
   * 空场次：一条内容都没有的会话（误触新建的典型产物）。
   *
   * 判定要严格——宁可漏判，不能把用户准备到一半的场次当空的删掉：
   * 没有简历、没有 JD、没有考点、没有转录、没有报告，才算空。
   *
   * @returns {Promise<Array<{id: string, title: string, createdAt: number}>>}
   */
  async listEmptySessions() {
    const root = await this.sessionsDir()
    const names = await listDirIfExists(root)
    const candidates = []
    for (const name of names) {
      if (!SESSION_ID_PATTERN.test(name)) continue
      const dir = join(root, name)
      if (!await isDirectory(dir)) continue
      const meta = await readJsonIfExists(join(dir, 'session.json'))
      if (meta === undefined) continue
      if (meta.status === 'running') continue
      const nonEmpty = async file => {
        try {
          const info = await stat(join(dir, file))
          return info.size > 0
        } catch {
          return false
        }
      }
      if (await nonEmpty('resume.txt')) continue
      if (await nonEmpty('jd.txt')) continue
      if (await nonEmpty('report.md')) continue
      if (await nonEmpty('transcript.jsonl')) continue
      const checklist = await readJsonIfExists(join(dir, 'checklist.json'))
      if (Array.isArray(checklist?.items) && checklist.items.length > 0) continue
      candidates.push({ id: name, title: meta.title ?? name, createdAt: meta.createdAt ?? 0 })
    }
    return candidates
  }

  /**
   * 清理空场次（只删空场次，绝不碰有内容的）。
   *
   * @param {string[]} [ids] 指定要删的 id；省略 = 全部空场次
   */
  async purgeEmptySessions(ids) {
    const candidates = await this.listEmptySessions()
    const wanted = Array.isArray(ids) && ids.length > 0 ? new Set(ids.map(value => String(value))) : undefined
    const root = await this.sessionsDir()
    const removed = []
    for (const item of candidates) {
      if (wanted !== undefined && !wanted.has(item.id)) continue
      try {
        await rm(join(root, item.id), { recursive: true, force: true })
        removed.push(item)
        if (this.selectedSessionId === item.id) this.selectedSessionId = undefined
      } catch { /* 删不掉的留着，下次再清理 */ }
    }
    return { removed, remaining: await this.listEmptySessions() }
  }

  async listSessions() {
    const root = await this.sessionsDir()
    const names = await listDirIfExists(root)
    const rows = []
    for (const name of names) {
      if (!SESSION_ID_PATTERN.test(name)) continue
      const dir = join(root, name)
      if (!await isDirectory(dir)) continue
      const meta = await readJsonIfExists(join(dir, 'session.json'))
      if (meta === undefined) continue
      const checklist = await this.getChecklist(name)
      rows.push({
        id: name,
        title: meta.title ?? name,
        role: meta.role ?? 'candidate',
        status: meta.status ?? SESSION_STATUS.DRAFT,
        createdAt: meta.createdAt ?? 0,
        updatedAt: meta.updatedAt ?? 0,
        // **分组靠的是岗位，不是标题。** 标题是给人看的（可以随时改），
        // 岗位是给列表分组的（同一岗位的几场要聚在一起）。
        position: meta.position ?? '',
        company: meta.company ?? '',
        archived: meta.archived === true,
        archivedAt: meta.archivedAt ?? 0,
        // **只判断存不存在，不要读内容。** 简历/报告可能有几十 KB，
        // 一次列表读二十场就是白读几 MB——而列表每 6 秒轮询一次。
        hasResume: await isFile(join(dir, 'resume.txt')),
        hasJd: await isFile(join(dir, 'jd.txt')),
        checklistCount: checklist.items.length,
        probedCount: checklist.items.filter(item => item.probed === true).length,
        hasReport: await isFile(join(dir, 'report.md')),
        dir,
      })
    }
    rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return rows
  }

  /**
   * Create a session.
   *
   * @param {{title?: string, role?: string, resumeText?: string, jdText?: string, jdUrl?: string, jdMeta?: object}} input
   */
  async createSession(input = {}) {
    // 让面试工作区出现在 DSH 左侧项目列表（登记失败也不挡建场次）。
    try { await this.ensureAgentWorkspace() } catch { /* 宿主没有工作区接口时忽略 */ }
    const root = await this.sessionsDir()
    const id = input.id ?? makeSessionId()
    const dir = await this.sessionDir(id)
    if (await isDirectory(dir)) throw new Error(`会话已存在：${id}`)
    await mkdir(join(dir, 'recordings'), { recursive: true })

    const now = Date.now()
    // **元信息只认显式写入。** 公司 / 岗位 / 标题在助手或用户写进来之前，
    // 就先落**带日期的占位值**——它们不是从 JD 里猜的（猜出来的「基础信息」
    // 「专家」比空着更糟），而是明摆着的「还没填」。
    const stub = defaultIdentity(now)
    const inputTitle = typeof input.title === 'string' ? input.title.trim() : ''
    const inputCompany = typeof input.company === 'string' ? input.company.trim() : ''
    const inputPosition = typeof input.position === 'string' ? input.position.trim() : ''
    const company = inputCompany === '' ? stub.company : inputCompany
    const position = inputPosition === '' ? stub.position : inputPosition
    const meta = {
      id,
      title: inputTitle === '' ? `${company} · ${position}` : inputTitle,
      titleAuto: inputTitle === '',
      company,
      position,
      role: input.role === 'interviewer' ? 'interviewer' : 'candidate',
      status: SESSION_STATUS.DRAFT,
      createdAt: now,
      updatedAt: now,
      jdUrl: typeof input.jdUrl === 'string' ? input.jdUrl : '',
      profileId: typeof input.profileId === 'string' ? input.profileId : '',
    }
    await writeJsonAtomic(join(dir, 'session.json'), meta)
    await writeJsonAtomic(join(dir, 'checklist.json'), { version: 1, items: [], adjustments: [] })

    if (typeof input.resumeText === 'string' && input.resumeText.trim() !== '') {
      await this.setResume(id, input.resumeText)
    }
    if (typeof input.jdText === 'string' && input.jdText.trim() !== '') {
      await this.setJd(id, { text: input.jdText, url: input.jdUrl ?? '', meta: input.jdMeta })
    }
    return this.getSession(id)
  }

  /**
   * Read one session's metadata.
   *
   * @param {string} sessionId
   */
  async getSession(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta === undefined) throw new Error(`会话不存在：${sessionId}`)
    return { ...meta, dir }
  }

  /**
   * Patch a session's metadata.
   *
   * **元信息（标题 / 公司 / 岗位）只认显式写入，绝不从 JD 里回猜。**
   * URL 抓取或正文里的小标题（「【基础信息】」）不是公司名；猜错一次，
   * 用户和助手都得先猜哪一个是错的。所以：
   *
   *   - 公司 / 岗位留空 = 「还没填」→ 写回带日期的占位值；
   *   - 标题留空 = 还没起名 → 用「公司 · 岗位」拼；
   *   - 用户 / 助手给了标题就保留——只有 `titleAuto` 还是 true 的那种
   *     （自动拼的、或老版本没记这个字段的「面试 日期」）才跟着改。
   *
   * 这样助手用 `interview_prepare({sessionId, sessionTitle, company, position})`
   * 就能改正一场已经建好的面试——**建会话时写不进去的东西，事后也得写进去**。
   *
   * @param {string} sessionId
   * @param {object} patch
   */
  async updateSession(sessionId, patch) {
    const dir = await this.sessionDir(sessionId)
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta === undefined) throw new Error(`会话不存在：${sessionId}`)
    const before = { ...meta }
    const allowed = [
      'title', 'role', 'status', 'jdUrl', 'startedAt', 'endedAt', 'notes',
      'position', 'company', 'archived', 'archivedAt', 'resumeId',
    ]
    for (const key of allowed) {
      if (patch[key] !== undefined) meta[key] = patch[key]
    }
    normalizeIdentity(before, meta, patch)
    // 取消归档：把归档时间也抹掉，别留一个「归档过但没归档」的时间戳。
    if (patch.archived === false) delete meta.archivedAt
    meta.updatedAt = Date.now()
    await writeJsonAtomic(join(dir, 'session.json'), meta)
    return { ...meta, dir }
  }

  // ── 简历库 ──────────────────────────────────────────────────────────────

  /**
   * The resume library directory.
   *
   * **简历不是每场面试都变的。** 让用户每一场都重新上传同一份简历，
   * 是把「一次录入」变成「N 次录入」——所以简历单独存在工作区里，
   * 每场面试只引用它。
   *
   * @returns {Promise<string>}
   */
  async resumesDir() {
    const root = await ensureDataRoot(await this.effectiveRoot())
    if (root.error !== undefined) throw new Error(root.error)
    return join(root.path, 'resumes')
  }

  /**
   * List the saved resumes, newest first.
   *
   * @returns {Promise<Array<{id: string, title: string, chars: number, createdAt: number, updatedAt: number}>>}
   */
  async listResumes() {
    const root = await this.resumesDir()
    const names = await listDirIfExists(root)
    const rows = []
    for (const name of names) {
      if (!RESUME_ID_PATTERN.test(name)) continue
      const meta = await readJsonIfExists(join(root, name, 'meta.json'))
      if (meta === undefined) continue
      rows.push({
        id: name,
        title: typeof meta.title === 'string' && meta.title !== '' ? meta.title : name,
        chars: typeof meta.chars === 'number' ? meta.chars : 0,
        createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : 0,
        updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : 0,
      })
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt)
    return rows
  }

  /**
   * Read one saved resume, with its text.
   *
   * @param {string} id
   * @returns {Promise<{id: string, title: string, text: string, chars: number, createdAt: number, updatedAt: number}>}
   */
  async getResume(id) {
    const dir = await this.resumeDir(id)
    const meta = await readJsonIfExists(join(dir, 'meta.json'))
    if (meta === undefined) throw new Error(`简历不存在：${id}`)
    const text = await readTextIfExists(join(dir, 'resume.txt'))
    return {
      id,
      title: typeof meta.title === 'string' && meta.title !== '' ? meta.title : id,
      text,
      chars: typeof meta.chars === 'number' ? meta.chars : text.length,
      createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : 0,
      updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : 0,
    }
  }

  /**
   * Save a resume into the library (create or update).
   *
   * @param {{id?: string, title?: string, text: string}} input
   */
  async saveResume(input = {}) {
    const text = String(input.text ?? '')
    if (text.trim() === '') throw new Error('简历是空的，没什么可存')
    if (text.length > MAX_DOC_CHARS) {
      throw new Error(`简历太长了（${text.length} 字，上限 ${MAX_DOC_CHARS}）`)
    }
    const root = await this.resumesDir()
    const id = typeof input.id === 'string' && RESUME_ID_PATTERN.test(input.id)
      ? input.id
      : makeResumeId()
    const dir = join(root, id)
    await mkdir(dir, { recursive: true })
    const existing = await readJsonIfExists(join(dir, 'meta.json'))
    const now = Date.now()
    const meta = {
      id,
      title: typeof input.title === 'string' && input.title.trim() !== ''
        ? input.title.trim()
        : (existing?.title ?? `简历 ${formatDate(now)}`),
      chars: text.length,
      createdAt: typeof existing?.createdAt === 'number' ? existing.createdAt : now,
      updatedAt: now,
    }
    await writeTextAtomic(join(dir, 'resume.txt'), text)
    await writeJsonAtomic(join(dir, 'meta.json'), meta)
    return { ...meta }
  }

  /**
   * Delete one resume from the library.
   *
   * **只删库里的那一份。** 已经建好的面试各自存着**快照**
   * （会话目录下的 resume.txt），不受影响——历史面试的复盘依据
   * 不能因为用户清理简历库而消失。
   *
   * @param {string} id
   */
  async deleteResume(id) {
    const dir = await this.resumeDir(id)
    await rm(dir, { recursive: true, force: true })
    return { deleted: true, id }
  }

  /**
   * The directory of one resume, with the id checked.
   *
   * @param {string} id
   * @returns {Promise<string>}
   */
  async resumeDir(id) {
    const key = String(id ?? '').trim()
    if (!RESUME_ID_PATTERN.test(key)) throw new Error(`简历 id 不合法：${id}`)
    const root = await this.resumesDir()
    return join(root, key)
  }

  // ── documents ────────────────────────────────────────────────────────────

  /**
   * Store the resume text.
   *
   * @param {string} sessionId
   * @param {string} text
   */
  async setResume(sessionId, text) {
    const dir = await this.sessionDir(sessionId)
    const trimmed = String(text ?? '')
    if (trimmed.length > MAX_DOC_CHARS) {
      throw new Error(`简历太长了（${trimmed.length} 字，上限 ${MAX_DOC_CHARS}）`)
    }
    // 空正文 = 没有简历（同 setJd：别留下「0 字的简历」）。
    if (trimmed.trim() === '') {
      await rm(join(dir, 'resume.txt'), { force: true })
      await this.touch(sessionId)
      return { chars: 0 }
    }
    await writeTextAtomic(join(dir, 'resume.txt'), trimmed)
    await this.touch(sessionId)
    return { chars: trimmed.length }
  }

  /**
   * Store the job description text (and where it came from).
   *
   * **只存正文，不动元信息。** 从 JD 正文里认公司 / 岗位是猜——JD 的小标题、
   * 工作地点、部门名字都会骗过词表。标题和公司/岗位由助手或用户在
   * `interview_prepare` / 面板里**显式写入**；这里只负责把正文落盘。
   *
   * @param {string} sessionId
   * @param {{text: string, url?: string, meta?: object}} input
   */
  async setJd(sessionId, input = {}) {
    const dir = await this.sessionDir(sessionId)
    const trimmed = String(input.text ?? '')
    if (trimmed.length > MAX_DOC_CHARS) {
      throw new Error(`JD 太长了（${trimmed.length} 字，上限 ${MAX_DOC_CHARS}）`)
    }
    // **空正文 = 没有 JD。**
    //
    // 写一个空文件会留下「hasJd: true、0 字」的假象——列表里看着有 JD，
    // 打开却是空白。清空就该真的清空。
    if (trimmed.trim() === '') {
      await rm(join(dir, 'jd.txt'), { force: true })
      await rm(join(dir, 'jd.json'), { force: true })
      await this.touch(sessionId)
      return { chars: 0 }
    }
    await writeTextAtomic(join(dir, 'jd.txt'), trimmed)
    await writeJsonAtomic(join(dir, 'jd.json'), {
      url: typeof input.url === 'string' ? input.url : '',
      fetchedAt: Date.now(),
      sections: input.meta?.sections ?? {},
      title: input.meta?.title ?? '',
      warnings: input.meta?.warnings ?? [],
    })

    await this.touch(sessionId)
    return { chars: trimmed.length }
  }

  /**
   * Archive or unarchive one session.
   *
   * **归档不是删除。** 归档只是把它从日常列表里收起来，内容、
   * 报告、底稿一样都在，随时能翻出来。
   *
   * @param {string} sessionId
   * @param {boolean} archived
   */
  async setArchived(sessionId, archived) {
    const value = archived === true
    return this.updateSession(sessionId, {
      archived: value,
      archivedAt: value ? Date.now() : undefined,
    })
  }

  /**
   * Fetch a JD from a link.
   *
   * The failure path is part of the contract: it says what went wrong **and**
   * what to do instead, so the caller never has to invent a fallback.
   *
   * @param {string} url
   */
  async fetchJd(url) {
    return fetchJobDescription(url, {
      timeoutMs: this.config.jdFetchTimeoutMs,
      maxChars: this.config.jdMaxChars,
    })
  }

  /**
   * The host's own conversations, newest first — the place a JD-fetch
   * request can be handed to the assistant.
   *
   * @returns {Promise<Array<{id: string, title: string, updatedAt: number}>>}
   */
  async listHostSessions() {
    const controller = this.ctx?.get?.('sessionController')
    if (controller === undefined || controller === null || typeof controller.list !== 'function') {
      throw new Error('这个宿主没有提供会话接口，不能把请求派给助手')
    }
    const result = await controller.list({})
    const items = Array.isArray(result?.items) ? result.items : []
    return items.map(item => ({
      id: item.sessionId ?? item.id ?? '',
      title: item.title ?? '',
      updatedAt: item.updatedAt ?? 0,
    }))
  }

  /**
   * Hand a JD link to the host's assistant and let **it** fetch the page.
   *
   * **为什么要有这条路。** 直接抓网页看着简单，实际最常挂在三件事上：
   * 登录墙、验证码、前端渲染的正文。宿主里的助手有浏览器，
   * 能把页面真的打开、看完、把正文抄下来——所以抓不到的时候，
   * 正确的做法不是让用户复制粘贴，而是**请助手去拿**。
   *
   * 请求发在**当前 DSH 对话**里（用户看得见、也能插话），
   * 助手拿到正文后调 `interview_save_jd` 写回这场面试。
   *
   * @param {string} sessionId the interview session the JD belongs to
   * @param {string} url
   * @param {string} [hostSessionId] which host conversation to use
   */
  /**
   * 确保有一个**落在面试工作区**的宿主会话。
   *
   * **为什么必须落在那个目录。** 之前这里直接拿"宿主最近的会话"来派活，
   * 结果请求被发到了别的项目（比如 Interview-Material）的会话里：
   * 用户看到助手在别的对话里干活，面试卷宗与对话上下文完全对不上。
   * 现在用 `sessionController.create({ cwd: 工作区根 })`：会话属于这场面试
   * 的卷宗目录，助手读写的文件、日志都在同一个地方。
   */
  /**
   * 把面试工作区**登记进 DSH 的工作区列表**（左侧项目列表）。
   *
   * **绑定 ≠ 登记。** `sessionController.create({ cwd })` 只让会话拥有那个目录，
   * 工作区注册表里并没有条目——所以左侧项目列表不会出现它。用户看到的是
   * "会话确实在那，但列表里没有"，这正是本次要修的。登记走
   * `workspaceController.create({ path })`，然后会话用 `workspaceId` 绑定。
   */
  async ensureAgentWorkspace() {
    const root = await this.effectiveRoot()
    const ensured = await ensureDataRoot(root)
    if (ensured.error !== undefined) throw new Error(`面试工作区建不出来：${ensured.error}`)
    const controller = this.ctx?.get?.('workspaceController')
    if (controller === undefined || controller === null || typeof controller.create !== 'function') {
      const fallback = { registered: false, path: root, workspaceId: '', reason: '这个宿主没有提供工作区登记接口' }
      this.workspaceRegistration = fallback
      return fallback
    }
    const result = await controller.create({ path: root })
    const workspaceId = typeof result?.workspace?.workspaceId === 'string' ? result.workspace.workspaceId : ''
    const info = {
      registered: workspaceId !== '',
      workspaceId,
      created: result?.created === true,
      path: root,
      title: typeof result?.workspace?.title === 'string' ? result.workspace.title : '',
    }
    this.workspaceRegistration = info
    return info
  }

  async ensureAgentSession() {
    const controller = this.ctx?.get?.('sessionController')
    if (controller === undefined || controller === null || typeof controller.create !== 'function') {
      throw new Error('这个宿主没有提供建会话接口，不能把请求派给助手')
    }
    const workspace = await this.ensureAgentWorkspace()
    const settings = await readSettings()
    // 优先用 **已登记的工作区 id** 绑定；宿主没有工作区接口时才退回 cwd。
    const request = workspace.workspaceId !== ''
      ? { workspaceId: workspace.workspaceId }
      : { cwd: workspace.path }
    if (typeof settings.agentSessionId === 'string' && settings.agentSessionId !== '') {
      request.sessionId = settings.agentSessionId
    }
    const created = await controller.create(request)
    const agentSessionId = String(created?.sessionId ?? '')
    if (agentSessionId === '') throw new Error('宿主没有返回会话 id')
    if (agentSessionId !== settings.agentSessionId) {
      await writeSettings({ agentSessionId })
    }
    return {
      sessionId: agentSessionId,
      workspace: workspace.path,
      workspaceId: workspace.workspaceId,
      registered: workspace.registered,
      workspaceCreated: workspace.created === true,
    }
  }

  /**
   * Hand a JD link to the host's assistant and let **it** fetch the page.
   *
   * **发到哪里由我们决定：** 默认在面试工作区里新建/复用一个会话；
   * 只有调用方明确给了 hostSessionId 才用那个会话，并在返回里说清楚。
   *
   * @param {string} sessionId the interview session the JD belongs to
   * @param {string} url
   * @param {string} [hostSessionId] which host conversation to use
   */
  async requestAgentJd(sessionId, url, hostSessionId = undefined) {
    const target = String(url ?? '').trim()
    if (target === '') throw new Error('没给链接')
    const controller = this.ctx?.get?.('sessionController')
    if (controller === undefined || controller === null || typeof controller.prompt !== 'function') {
      throw new Error('这个宿主没有提供会话接口，不能把请求派给助手')
    }
    let hostSession
    if (typeof hostSessionId === 'string' && hostSessionId.trim() !== '') {
      hostSession = { sessionId: hostSessionId.trim(), workspace: undefined, explicit: true }
    } else {
      hostSession = { ...(await this.ensureAgentSession()), explicit: false }
    }
    const text = [
      `请帮我抓取这个岗位 JD：${target}`,
      '用浏览器打开它（这个页面可能需要登录或前端渲染），把岗位描述的正文完整抄下来，',
      `然后调用 interview_save_jd 工具，把正文写入面试会话 ${sessionId}（url 填 ${target}）。`,
      '写完之后再调用 interview_get_context 确认已落盘。如果实在拿不到正文，如实说明卡在哪一步。',
    ].join('\n')
    await controller.prompt({
      requestId: `jd-${sessionId}-${Date.now()}`,
      sessionId: hostSession.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
      // **signal 是必填的第二个参数。** 宿主实现的第一句就是
      // `signal.throwIfAborted()`——不传就炸。
    }, new AbortController().signal)
    return {
      dispatched: true,
      hostSession: { id: hostSession.sessionId, workspace: hostSession.workspace, explicit: hostSession.explicit },
      message: hostSession.explicit
        ? '请求已发到你指定的对话。'
        : `请求已发到面试工作区里的助手会话：${hostSession.workspace}`,
    }
  }

  /**
   * 让助手产出「面试官底稿」（考点清单）。
   *
   * 底稿由模型写，插件只负责派活与落盘（interview_save_checklist）。
   * 没有这个动作时，用户填完简历和 JD 就卡住了——面板必须给出下一步。
   *
   * @param {string} sessionId
   * @param {string} [hostSessionId]
   */
  async requestAgentChecklist(sessionId, hostSessionId = undefined) {
    const controller = this.ctx?.get?.('sessionController')
    if (controller === undefined || controller === null || typeof controller.prompt !== 'function') {
      throw new Error('这个宿主没有提供会话接口，不能把请求派给助手')
    }
    const hostSession = typeof hostSessionId === 'string' && hostSessionId.trim() !== ''
      ? { sessionId: hostSessionId.trim(), workspace: undefined, explicit: true }
      : { ...(await this.ensureAgentSession()), explicit: false }
    const text = [
      `请为面试会话 ${sessionId} 出一份「面试官底稿」（考点清单）。`,
      '1. 先调用 interview_get_context 读简历、JD 与已有清单；',
      '2. 按 JD 要求与候选人经历映射出考点，分 core / deep / bonus 三档，每项写清 source（jd/resume/research）与 why；',
      '3. 调用 interview_save_checklist 写入这场面试（items 数组）。',
      '如果简历或 JD 还缺，就别编造，直接说明缺哪一份。',
    ].join('\n')
    await controller.prompt({
      requestId: `checklist-${sessionId}-${Date.now()}`,
      sessionId: hostSession.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }, new AbortController().signal)
    return {
      dispatched: true,
      hostSession: { id: hostSession.sessionId, workspace: hostSession.workspace, explicit: hostSession.explicit },
      message: hostSession.explicit ? '请求已发到你指定的对话。' : `请求已发到面试工作区里的助手会话：${hostSession.workspace}`,
    }
  }

  /**
   * 让助手写事后分析报告。
   *
   * **报告由模型写，插件负责派活与落盘。** 面试结束后必须有一条
   * "出报告"的可点路径，否则用户只能自己去对话里猜该说什么。
   *
   * @param {string} sessionId
   * @param {string} [hostSessionId]
   */
  async requestAgentReport(sessionId, hostSessionId = undefined) {
    const controller = this.ctx?.get?.('sessionController')
    if (controller === undefined || controller === null || typeof controller.prompt !== 'function') {
      throw new Error('这个宿主没有提供会话接口，不能把请求派给助手')
    }
    const hostSession = typeof hostSessionId === 'string' && hostSessionId.trim() !== ''
      ? { sessionId: hostSessionId.trim(), workspace: undefined, explicit: true }
      : { ...(await this.ensureAgentSession()), explicit: false }
    const text = [
      `请为面试会话 ${sessionId} 写一份事后分析报告。`,
      '1. 先调用 interview_get_context 读简历、JD、考点清单、转录与统计；',
      '2. 按「结构 / 深度 / 表达 / 与岗位要求的匹配」等维度写 Markdown，每个判断都要能指回某轮回答；',
      '3. 数据不足就如实写「样本不足」，不要编造没发生过的对话；',
      '4. 最后调用 interview_finish，把整篇报告写进 report 字段。',
    ].join('\n')
    await controller.prompt({
      requestId: `report-${sessionId}-${Date.now()}`,
      sessionId: hostSession.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }, new AbortController().signal)
    return {
      dispatched: true,
      hostSession: { id: hostSession.sessionId, workspace: hostSession.workspace, explicit: hostSession.explicit },
      message: hostSession.explicit ? '请求已发到你指定的对话。' : `请求已发到面试工作区里的助手会话：${hostSession.workspace}`,
    }
  }

  /**
   * Put a resume from the library into one session.
   *
   * **存的是快照。** 会话目录里留一份当时的正文——简历后来改了，
   * 历史面试的复盘依据也不能跟着变。库里那份是「可复用的模板」，
   * 卷内那份是「这一场的事实」。
   *
   * @param {string} sessionId
   * @param {string} resumeId
   */
  async applyResume(sessionId, resumeId) {
    const resume = await this.getResume(resumeId)
    await this.setResume(sessionId, resume.text)
    await this.updateSession(sessionId, { resumeId: resume.id })
    return { resume, chars: resume.text.length }
  }

  /**
   * Copy a session's resume into the library.
   *
   * @param {string} sessionId
   * @param {string} [title]
   */
  async saveResumeFromSession(sessionId, title = undefined) {
    const dir = await this.sessionDir(sessionId)
    const text = await readTextIfExists(join(dir, 'resume.txt'))
    if (text.trim() === '') throw new Error('这场面试还没有简历，没什么可存')
    return this.saveResume({ title, text })
  }

  /**
   * Extract text from an uploaded resume file.
   *
   * `plainOnly` 是 JD 上传时的约束：JD 只收纯文本（见 `extract/plainOnly`）。
   *
   * @param {{filename?: string, mimeType?: string, buffer: Buffer, plainOnly?: boolean}} file
   */
  async extractResume(file) {
    return extractTextFromUpload(file, { plainOnly: file.plainOnly === true })
  }

  /**
   * Read the resume and JD as the agent needs them.
   *
   * @param {string} sessionId
   */
  async getDocuments(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const [resume, jd, jdMeta] = await Promise.all([
      readTextIfExists(join(dir, 'resume.txt')),
      readTextIfExists(join(dir, 'jd.txt')),
      readJsonIfExists(join(dir, 'jd.json')),
    ])
    return {
      resume: resume ?? '',
      jd: jd ?? '',
      jdMeta: jdMeta ?? { url: '', sections: {}, warnings: [] },
    }
  }

  // ── checklist ────────────────────────────────────────────────────────────

  /**
   * Read the checklist.
   *
   * @param {string} sessionId
   */
  async getChecklist(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const doc = await readJsonIfExists(join(dir, 'checklist.json'))
    if (doc === undefined) return { version: 1, items: [], adjustments: [] }
    return {
      version: typeof doc.version === 'number' ? doc.version : 1,
      items: Array.isArray(doc.items) ? doc.items : [],
      adjustments: Array.isArray(doc.adjustments) ? doc.adjustments : [],
    }
  }

  /**
   * Replace the checklist (the agent's "here is the plan" call).
   *
   * Items are normalized so the UI never has to defend against missing fields.
   *
   * @param {string} sessionId
   * @param {any[]} items
   */
  async saveChecklist(sessionId, items) {
    if (!Array.isArray(items)) throw new Error('考点清单必须是一个数组')
    const dir = await this.sessionDir(sessionId)
    const existing = await this.getChecklist(sessionId)
    const normalized = items.map((item, index) => normalizeChecklistItem(item, index, existing.items))
    const doc = {
      version: 2,
      updatedAt: Date.now(),
      items: normalized,
      adjustments: existing.adjustments,
    }
    await writeJsonAtomic(join(dir, 'checklist.json'), doc)
    await this.touch(sessionId)
    return doc
  }

  /**
   * Adjust the checklist while the interview is running.
   *
   * @param {string} sessionId
   * @param {object} op
   * @param {'add'|'update'|'remove'|'probe'} op.op
   */
  async mutateChecklist(sessionId, op) {
    const dir = await this.sessionDir(sessionId)
    const doc = await this.getChecklist(sessionId)
    const items = doc.items.map(item => ({ ...item }))
    const now = Date.now()
    let adjustment = { at: now, op: op.op, reason: typeof op.reason === 'string' ? op.reason : '' }

    switch (op.op) {
      case 'add': {
        const item = normalizeChecklistItem({
          id: op.id,
          topic: op.topic,
          why: op.why,
          level: op.level,
          source: op.source,
          tags: op.tags,
        }, items.length, items)
        items.push(item)
        adjustment = { ...adjustment, id: item.id, topic: item.topic }
        break
      }
      case 'update': {
        const target = items.find(item => item.id === op.id)
        if (target === undefined) throw new Error(`清单里没有 id=${op.id} 的考点`)
        if (op.topic !== undefined) target.topic = String(op.topic)
        if (op.why !== undefined) target.why = String(op.why)
        if (op.level !== undefined && CHECKLIST_LEVEL[String(op.level)] !== undefined) target.level = op.level
        if (op.source !== undefined) target.source = String(op.source)
        if (Array.isArray(op.tags)) target.tags = op.tags.map(tag => String(tag))
        adjustment = { ...adjustment, id: target.id }
        break
      }
      case 'remove': {
        const index = items.findIndex(item => item.id === op.id)
        if (index === -1) throw new Error(`清单里没有 id=${op.id} 的考点`)
        const [removed] = items.splice(index, 1)
        adjustment = { ...adjustment, id: removed.id, topic: removed.topic }
        break
      }
      case 'probe': {
        const target = items.find(item => item.id === op.id)
        if (target === undefined) throw new Error(`清单里没有 id=${op.id} 的考点`)
        target.probed = op.probed !== false
        if (op.note !== undefined) target.note = String(op.note)
        if (op.note !== undefined) target.evidence = [...(target.evidence ?? []), { at: now, note: String(op.note) }]
        adjustment = { ...adjustment, id: target.id, probed: target.probed }
        break
      }
      default:
        throw new Error(`未知的清单操作：${String(op.op)}（可用：add / update / remove / probe）`)
    }

    const next = { version: 2, updatedAt: now, items, adjustments: [...doc.adjustments, adjustment] }
    await writeJsonAtomic(join(dir, 'checklist.json'), next)
    await this.touch(sessionId)
    return next
  }

  // ── transcript ───────────────────────────────────────────────────────────

  /**
   * Append one turn to the transcript.
   *
   * @param {string} sessionId
   * @param {{role: string, text: string, meta?: object}} turn
   */
  async appendTurn(sessionId, turn) {
    const dir = await this.sessionDir(sessionId)
    const role = turn.role === 'interviewer' ? 'interviewer' : turn.role === 'system' ? 'system' : 'candidate'
    const text = String(turn.text ?? '').trim()
    if (text === '') throw new Error('空的转录内容不记录')
    const meta = turn.meta !== undefined && typeof turn.meta === 'object' ? { ...turn.meta } : {}
    // 语流：客户端只上报原始测量（每段说话/静音/段间停顿），指标在 Host 算。
    // **单一实现**：面板、agent 上下文、报告读到的都是这一份。
    if (meta.fluency !== undefined && typeof meta.fluency === 'object' && Array.isArray(meta.fluency.segments)) {
      meta.fluency = measureFluency({ text, segments: meta.fluency.segments })
    }
    const row = {
      ts: Date.now(),
      role,
      text,
      meta,
    }
    await appendJsonl(join(dir, 'transcript.jsonl'), row)
    await this.touch(sessionId)
    return row
  }

  /**
   * Read the transcript.
   *
   * @param {string} sessionId
   */
  async getTranscript(sessionId) {
    const dir = await this.sessionDir(sessionId)
    return readJsonl(join(dir, 'transcript.jsonl'))
  }

  // ── recordings ───────────────────────────────────────────────────────────

  /**
   * The camera devices this machine has, and whether ffmpeg is there to use them.
   *
   * @returns {Promise<object>}
   */
  async cameraDevices() {
    return this.camera.devices()
  }

  /**
   * Start the Host-side camera capture.
   *
   * @param {{device?: object}} [input]
   * @returns {Promise<object>}
   */
  async startCamera(input = {}) {
    const effective = await this.effectiveConfig()
    // 采集后端偏好：auto = ffmpeg 优先；chromium-mf = 浏览器采集优先。
    this.camera.backendPreference = effective.cameraBackend ?? 'auto'
    // 面板里填的路径也要生效（配置文件显式写了就不覆盖）。
    if (!this.explicitKeys.has('ffmpegPath') && (effective.ffmpegPath ?? '') !== this.camera.ffmpegPathOption) {
      this.camera.ffmpegPathOption = effective.ffmpegPath ?? ''
      this.camera.ffmpeg = undefined
      this.camera.ffmpegSource = ''
    }
    if (!this.explicitKeys.has('chromiumPath')) {
      this.camera.chromiumPathOption = effective.chromiumPath ?? ''
    }
    return this.camera.start(input)
  }

  /**
   * Stop the Host-side camera capture.
   *
   * @returns {object}
   */
  stopCamera() {
    this.camera.stop()
    return { ok: true }
  }

  /**
   * The camera service state, for the panel.
   *
   * @returns {object}
   */
  cameraStatus() {
    return this.camera.status()
  }

  // ── transparency ─────────────────────────────────────────────────────────

  /**
   * 面板「设置」页要回答的所有「东西在哪、为什么、现在用的是哪个」。
   *
   * **原则：这里只读、只报告，不做决定。** 权重规则（配置文件 > 面板设置 >
   * 默认）在 {@link updateSettings} 与语音解析里执行，这里把它们的结果摊开。
   *
   * @param {string} [sessionId]
   * @returns {Promise<object>}
   */
  async settingsSnapshot(sessionId = undefined) {
    const settings = await readSettings()
    const location = await this.location()
    const voice = await this.voice.status()
    const camera = this.camera.status()
    const ffmpegPath = this.config.ffmpegPath !== '' ? this.config.ffmpegPath : (settings.ffmpegPath ?? '')
    const chromiumPath = this.config.chromiumPath !== '' ? this.config.chromiumPath : (settings.chromiumPath ?? '')
    const ffmpeg = await locateFfmpeg({ ffmpegPath })
    const chromium = locateChromium({ chromiumPath })
    const session = sessionId !== undefined && sessionId !== '' ? await this.sessionFacts(sessionId) : undefined
    const effective = await this.effectiveConfig()
    // **有效配置里可能带着配置文件里写的明文 key**（`asrApiKey` / `ttsApiKey`）。
    // 这个快照会进 HTTP 响应、进面板——密钥只进不出的边界在这里再收一次。
    const publicEffective = { ...effective }
    delete publicEffective.asrApiKey
    delete publicEffective.ttsApiKey
    return {
      settingsFile: settingsPath(),
      settings,
      effective: publicEffective,
      explicit: [...this.explicitKeys],
      dataRoot: location,
      sessionsDir: await this.sessionsDir(),
      profilesDir: await this.profilesDir(),
      hostWorkspace: {
        path: await this.effectiveRoot(),
        note: '宿主侧 agent 工作区：一场面试一个子目录，简历库与岗位档案也在这里。',
      },
      voice,
      // 语音配置闭环：这台机器上已有哪几把钥匙（只有名字与是否配置），
      // 以及服务下拉的选项表。**都不含密钥值。**
      credentials: await this.voiceCredentials(),
      presets: voicePresets(),
      // 模型 → 音色对照表：设置页音色下拉的真源（前端不硬编码）。只有 id/名字，无密钥。
      voices: voiceTable(),
      camera,
      backends: {
        ffmpeg: ffmpeg === undefined ? { path: '', source: '', found: false } : { ...ffmpeg, found: true },
        chromium: chromium === undefined ? { path: '', source: '', found: false } : { ...chromium, found: true },
      },
      speechModel: await this.speechModelFacts(),
      // 误触新建出来的空场次：设置页给"清理"入口，而不是让用户一场场删。
      emptySessions: await this.listEmptySessions(),
      // 助手会话落在哪个工作区——面板要能说清楚请求会发到哪。
      agent: { sessionId: settings.agentSessionId ?? '', workspace: await this.effectiveRoot() },
      // DSH 左侧项目列表里有没有这个工作区（绑定 ≠ 登记，必须分开说）。
      workspaceRegistration: this.workspaceRegistration ?? undefined,
      session,
    }
  }

  /**
   * 宿主语音模型的落盘事实（路径、体积、文件数）。
   *
   * 用户问过「那个 200 多 MB 下到哪了」——答案不该靠猜，这里如实给。
   */
  async speechModelFacts() {
    const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== ''
      ? process.env.DSH_HOME.trim()
      : join(homedir(), '.dsh')
    const dir = join(home, 'speech-to-text', 'sensevoice')
    let bytes = 0
    let files = 0
    const walk = async current => {
      let entries = []
      try {
        entries = await readdir(current, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const path = join(current, entry.name)
        if (entry.isDirectory()) await walk(path)
        else {
          files += 1
          try { bytes += (await stat(path)).size } catch { /* 正在被写 */ }
        }
      }
    }
    await walk(dir)
    return { provider: 'sensevoice-local', dir, bytes, files, exists: files > 0 }
  }

  /**
   * 一场面试的产物清单：文件在哪、多大、什么时候写的。
   *
   * @param {string} sessionId
   */
  async sessionFacts(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const names = ['session.json', 'resume.txt', 'jd.txt', 'checklist.json', 'transcript.jsonl', 'report.md']
    const artifacts = []
    for (const name of names) {
      const path = join(dir, name)
      try {
        const info = await stat(path)
        artifacts.push({ name, bytes: info.size, modifiedAt: info.mtimeMs })
      } catch { /* 这个产物还没生成 */ }
    }
    for (const recording of await this.listRecordings(sessionId)) {
      artifacts.push({
        name: `recordings/${recording.name}`,
        bytes: recording.bytes,
        modifiedAt: recording.modifiedAt,
        kind: recording.kind,
      })
    }
    return { id: sessionId, dir, artifacts }
  }

  /**
   * 保存面板设置（只允许白名单键）。
   *
   * **配置文件优先。** 工作区根在 `cordis.patch.yml` 里写死时，面板的修改
   * 不生效——**而且必须告诉用户为什么**，否则他会以为设置丢了。
   *
   * @param {object} patch
   */
  async updateSettings(patch = {}) {
    const applied = {}
    const ignored = []
    const invalid = []
    for (const key of SETTING_KEYS) {
      if (!(key in patch)) continue
      if (key === 'workspaceRoot' && this.config.workspaceRootExplicit) {
        ignored.push({ key, reason: '配置文件里写死了 workspaceRoot，面板设置不生效' })
        continue
      }
      const normalized = normalizeSetting(key, patch[key])
      if (!normalized.ok) {
        invalid.push({ key, reason: normalized.reason })
        continue
      }
      applied[key] = normalized.value
    }
    const file = await writeSettings(applied)
    return { settingsFile: file.path, applied, ignored, invalid }
  }

  /**
   * 设置的**有效值**：配置文件里显式写过的键优先，其次面板设置，最后默认。
   *
   * **为什么要留原始配置。** resolveConfig 会把缺省值填满，之后无法区分
   * "配置里写了 auto" 与 "配置里没写"。合并时只有显式写过的键才压过面板。
   *
   * 语音、摄像头、保护开关都读它——否则面板里改的东西永远被默认值覆盖。
   *
   * @returns {Promise<object>}
   */
  async effectiveConfig() {
    const settings = await readSettings()
    const merged = { ...this.config }
    for (const key of SETTING_KEYS) {
      if (settings[key] === undefined) continue
      if (key === 'workspaceRoot') continue // 数据根由 effectiveRoot() 单独合并
      if (this.explicitKeys.has(key)) continue
      merged[key] = settings[key]
    }
    return merged
  }

  /** 语音模块的旧入口；语义等同 effectiveConfig。 */
  async voiceConfig() {
    return this.effectiveConfig()
  }

  // ── voice ────────────────────────────────────────────────────────────────

  /**
   * 语音链路状态：识别走哪条（宿主 / 服务端 / 浏览器）、合成走哪条。
   *
   * **这是"一个操作，两个调用者"的读侧。** 面板顶部显示它，agent 也能调
   * `interview_voice_status` 问同一件事——两边看到的必须是同一份判断。
   *
   * @returns {Promise<{asr: object, tts: object}>}
   */
  async voiceStatus() {
    return this.voice.status()
  }

  /**
   * 让宿主开始准备它的语音识别模型（首次要下载）。
   *
   * @param {string} [providerId]
   * @returns {Promise<object>}
   */
  async prepareSpeech(providerId = undefined) {
    return this.voice.prepare(providerId)
  }

  /**
   * 转写一段音频。输入是 base64 编码的 16 kHz 单声道 PCM16 WAV。
   *
   * 面板录制分段后调它，agent 不需要这条路（它直接读转录）。
   *
   * @param {{dataBase64?: string, mimeType?: string, language?: string}} input
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<object>}
   */
  async transcribeAudio(input, options = {}) {
    return this.voice.transcribe(input, options)
  }

  /**
   * 合成一句面试官要说的话。
   *
   * 返回 base64 音频（mp3/wav）；这条链路失败时面板会回落到浏览器音色，
   * 所以**失败不是错误状态**，是一条要说清原因的降级。
   *
   * @param {{text: string, voice?: string, rate?: number, signal?: AbortSignal}} input
   * @returns {Promise<object>}
   */
  async synthesizeSpeech(input) {
    return this.voice.speak(input)
  }

  /**
   * 这台机器上已经配置了哪些语音凭据（**只有名字与状态，没有值**）。
   *
   * 来源：profile 的 `cordis.patch.yml` 里的 `apiKeyEnv:` + 宿主 credentials
   * 存储里登记的 ref 名 + 常见候选名。文件读不了就只用候选名，不抛。
   *
   * @returns {Promise<Array<{ref: string, configured: boolean, source: string, writable: boolean}>>}
   */
  async voiceCredentials() {
    return discoverCredentials(this.ctx)
  }

  /**
   * 写一把语音凭据到宿主的 credentials 存储。
   *
   * **密钥不写插件设置文件。** 宿主没有 credentials seam 时返回
   * `{ok:false, reason, hint}`，hint 是「环境变量 + 重启 DSH」——
   * 绝不回落成把明文写进本地 JSON。
   *
   * @param {string} ref
   * @param {string} value
   */
  async setVoiceCredential(ref, value) {
    const result = await setSecret(this.ctx, ref, value)
    // 成功也只回状态，不回值；失败原因已经过擦除。
    if (result.ok !== true) return result
    return { ok: true, ref: result.ref, configured: true, source: 'host', writable: true }
  }

  /**
   * 从宿主的 credentials 存储里删掉一把语音凭据。
   *
   * @param {string} ref
   */
  async clearVoiceCredential(ref) {
    return clearSecret(this.ctx, ref)
  }

  /**
   * The voice service preset table — the settings page's only option list.
   *
   * @returns {Array<object>}
   */
  voicePresets() {
    return voicePresets()
  }

  /**
   * 某模型/服务商支持的音色（设置页音色下拉与 agent 共用这一份判断）。
   *
   * @param {string} [model]
   * @param {string} [provider]
   * @returns {{model: string, provider: string, known: boolean, scope: string, voices: Array<{id: string, label: string}>}}
   */
  voicesForModel(model, provider) {
    return { model: String(model ?? ''), provider: String(provider ?? ''), ...voicesFor(model, provider) }
  }

  /**
   * 真跑一遍语音链路：**不许 mock**。
   *
   *   kind='tts'  用当前配置合成一句固定短句，回传 base64 音频与耗时；
   *   kind='asr'  用调用方录的那段音频走完整的识别回落链，回传 text、
   *               attempts（谁试过、为什么失败）与耗时。
   *
   * 失败返回 `{ok:false, reason, hint}`：原因要具体到 HTTP 码 / 超时 /
   * 缺凭据 / 协议不匹配，hint 要是下一步能做的事。响应里没有密钥。
   *
   * @param {{kind?: string, dataBase64?: string, mimeType?: string, language?: string}} input
   * @returns {Promise<object>}
   */
  async testVoice(input = {}) {
    const kind = typeof input.kind === 'string' ? input.kind.trim().toLowerCase() : ''
    if (kind !== 'tts' && kind !== 'asr') {
      return {
        ok: false,
        kind,
        reason: '测试类型只能是 tts 或 asr。',
        hint: '播报测试用 kind=tts；识别测试用 kind=asr 并带一段音频。',
      }
    }

    const startedAt = Date.now()
    if (kind === 'tts') {
      const result = await this.voice.speak({ text: VOICE_TEST_SENTENCE })
      const ms = Date.now() - startedAt
      if (result.ok !== true) {
        return {
          ok: false,
          kind,
          mode: result.mode,
          provider: result.provider ?? '',
          ms,
          reason: result.reason ?? '播报链路不可用。',
          hint: result.hint ?? '问题照常以文字显示；想更自然就换一个模型或改用百度朗读（免密钥）。',
        }
      }
      return {
        ok: true,
        kind,
        mode: result.mode,
        provider: result.provider ?? '',
        label: result.label ?? '',
        model: result.model ?? '',
        voice: result.voice ?? '',
        ms,
        mimeType: result.mimeType ?? 'audio/mpeg',
        audioBase64: result.audioBase64,
      }
    }

    const dataBase64 = typeof input.dataBase64 === 'string' ? input.dataBase64 : ''
    if (dataBase64.trim() === '') {
      return {
        ok: false,
        kind,
        mode: 'browser',
        ms: Date.now() - startedAt,
        reason: '测试识别需要一段音频。',
        hint: '点「测试识别」会现场录 2 秒；麦克风不可用时用键盘输入继续面试。',
        attempts: [],
      }
    }

    const result = await this.voice.transcribe({
      dataBase64,
      mimeType: input.mimeType,
      language: input.language,
    })
    const ms = Date.now() - startedAt
    return {
      ok: result.ok === true,
      kind,
      mode: result.mode,
      text: result.text ?? '',
      attempts: Array.isArray(result.attempts) ? result.attempts : [],
      ms,
      ...(result.provider === undefined ? {} : { provider: result.provider }),
      ...(result.model === undefined ? {} : { model: result.model }),
      ...(result.protocol === undefined ? {} : { protocol: result.protocol }),
      ...(result.language === undefined ? {} : { language: result.language }),
      ...(result.ok === true
        ? {}
        : { reason: result.reason ?? '识别链路不可用。', hint: result.hint ?? '用键盘输入继续面试；识别不可用不影响面试。' }),
    }
  }

  /**
   * 摄像头自检：ffmpeg 在哪、设备有哪些、能不能真抓到帧。
   *
   * @param {{device?: string}} [options]
   * @returns {Promise<object>}
   */
  async cameraDiagnose(options = {}) {
    return this.camera.diagnose(options)
  }

  /**
   * Start recording the camera into a session's recording folder.
   *
   * The file is written by the Host, so the panel's "保存录像" button is not
   * involved — the recording is already on disk, in the session's dossier.
   *
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async startCameraRecording(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const folder = join(dir, 'recordings')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const result = this.camera.startRecording(folder, `video-${stamp}`)
    if (!result.ok) return result
    await this.touch(sessionId)
    return result
  }

  /**
   * Stop the camera recording and hand back the finished file.
   *
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  async stopCameraRecording(sessionId) {
    const result = await this.camera.stopRecording()
    if (!result.ok) return result
    const dir = await this.sessionDir(sessionId)
    const name = result.path.split(/[\\/]/u).pop() ?? ''
    const info = await stat(result.path).catch(() => undefined)
    await this.touch(sessionId)
    return {
      ok: true,
      name,
      kind: 'video',
      bytes: info?.size ?? 0,
      path: result.path,
      folder: join(dir, 'recordings'),
    }
  }

  /**
   * Store a recording that the browser uploaded.
   *
   * The blob arrives base64-encoded; the file is written verbatim.
   *
   * @param {string} sessionId
   * @param {{kind: string, filename?: string, mimeType?: string, dataBase64: string}} input
   */
  async saveRecording(sessionId, input = {}) {
    const dir = await this.sessionDir(sessionId)
    const kind = input.kind === 'audio' ? 'audio' : 'video'
    const mimeType = typeof input.mimeType === 'string' ? input.mimeType : ''
    const extension = extensionFor(mimeType, input.filename, kind)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = sanitizeName(input.filename) || `${kind}-${stamp}`
    const finalName = safeName.includes('.') ? safeName : `${safeName}${extension}`
    const target = resolveWithin(join(dir, 'recordings'), finalName)

    const buffer = Buffer.from(String(input.dataBase64 ?? ''), 'base64')
    if (buffer.length === 0) throw new Error('录音数据是空的')
    await writeFile(target, buffer)
    await this.touch(sessionId)
    return { name: finalName, kind, bytes: buffer.length, path: target }
  }

  /**
   * List the recordings of a session.
   *
   * @param {string} sessionId
   */
  async listRecordings(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const folder = join(dir, 'recordings')
    const names = await listDirIfExists(folder)
    const rows = []
    for (const name of names) {
      const path = join(folder, name)
      try {
        const info = await stat(path)
        if (!info.isFile()) continue
        rows.push({
          name,
          kind: name.startsWith('audio') ? 'audio' : 'video',
          bytes: info.size,
          modifiedAt: info.mtimeMs,
          path,
        })
      } catch {
        // 竞态删除；跳过。
      }
    }
    rows.sort((a, b) => a.modifiedAt - b.modifiedAt)
    return rows
  }

  // ── report ───────────────────────────────────────────────────────────────

  /**
   * Store the after-interview analysis.
   *
   * @param {string} sessionId
   * @param {string} markdown
   */
  async saveReport(sessionId, markdown) {
    const dir = await this.sessionDir(sessionId)
    await writeTextAtomic(join(dir, 'report.md'), String(markdown ?? ''))
    await this.updateSession(sessionId, { status: SESSION_STATUS.DONE, endedAt: Date.now() })
    return { chars: String(markdown ?? '').length }
  }

  /**
   * Read the after-interview analysis.
   *
   * @param {string} sessionId
   */
  async getReport(sessionId) {
    const dir = await this.sessionDir(sessionId)
    return (await readTextIfExists(join(dir, 'report.md'))) ?? ''
  }

  // ── the whole picture ────────────────────────────────────────────────────

  /**
   * Everything the UI (and the agent) needs about one session in one call.
   *
   * **转录有上限。** 面板在面试中每 1.5 秒轮询一次，而转录会随面试线性
   * 变长——不封顶的话，一场两小时的面试会让每次轮询传几百 KB，
   * 在 Electron 里变成持续的反序列化开销。所以这里只回传最近
   * `transcriptLimit` 轮，并如实报出总数与是否被截断。
   *
   * @param {string} sessionId
   * @param {{transcriptLimit?: number}} options
   */
  async getState(sessionId, options = {}) {
    const [meta, checklist, transcript, documents, recordings, report] = await Promise.all([
      this.getSession(sessionId),
      this.getChecklist(sessionId),
      this.getTranscript(sessionId),
      this.getDocuments(sessionId),
      this.listRecordings(sessionId),
      this.getReport(sessionId),
    ])
    const limit = Number.isFinite(options.transcriptLimit) && options.transcriptLimit > 0
      ? Math.trunc(options.transcriptLimit)
      : DEFAULT_TRANSCRIPT_LIMIT
    const revision = await this.revisionOf(meta.dir)
    const visible = transcript.length > limit ? transcript.slice(-limit) : transcript
    const turns = transcript.filter(row => row.role !== 'system')
    const asked = turns.filter(row => row.role === 'interviewer').length
    const answered = turns.filter(row => row.role === 'candidate').length
    return {
      session: {
        id: meta.id,
        title: meta.title,
        role: meta.role,
        status: meta.status,
        createdAt: meta.createdAt,
        startedAt: meta.startedAt ?? 0,
        endedAt: meta.endedAt ?? 0,
        updatedAt: meta.updatedAt,
        profileId: meta.profileId ?? '',
        // 岗位与公司：列表靠它们分组，准备页靠它们显示「公司 · 岗位」。
        position: meta.position ?? '',
        company: meta.company ?? '',
        // 这场面试的简历是从库里哪一份拿来的（卷内存的是快照）。
        resumeId: meta.resumeId ?? '',
        // 归档标记：主区要能告诉用户「这场已经收起来了」。
        archived: meta.archived === true,
        dir: meta.dir,
      },
      // revision：内容没变就**不要重新渲染**。
      // 面板在面试中每 1.5 秒轮询一次；没有这个字段，每一次轮询都会让
      // 整个面板（包含几百行转录）重建一次——那正是「插件让 DSH 卡顿」
      // 最常见的来源。有了它，客户端比对相同就跳过 setState。
      revision,
      checklist,
      transcript: visible,
      transcriptTotal: transcript.length,
      transcriptTruncated: transcript.length > visible.length,
      documents: {
        resumeChars: documents.resume.length,
        jdChars: documents.jd.length,
        jdUrl: documents.jdMeta.url,
        jdSections: documents.jdMeta.sections ?? {},
        jdWarnings: documents.jdMeta.warnings ?? [],
      },
      recordings,
      report,
      // 语流：整场面试的表达习惯观察（停顿 / 语速 / 口头语 …）。
      // **不是评分**，是观察值；报告与面试官都读它，但不许念给候选人听。
      fluency: summarizeFluency(transcript),
      stats: {
        asked,
        answered,
        durationMs: (meta.endedAt ?? meta.updatedAt ?? 0) - (meta.startedAt ?? meta.createdAt ?? 0),
        checklistTotal: checklist.items.length,
        checklistProbed: checklist.items.filter(item => item.probed === true).length,
        adjustments: checklist.adjustments.length,
      },
    }
  }

  /**
   * A compact view for the agent: what it needs to keep interviewing well.
   *
   * @param {string} sessionId
   */
  async getAgentContext(sessionId) {
    const state = await this.getState(sessionId)
    const documents = await this.getDocuments(sessionId)
    const pending = state.checklist.items.filter(item => item.probed !== true)
    return {
      session: state.session,
      resume: documents.resume,
      jd: documents.jd,
      checklist: state.checklist.items,
      pendingTopics: pending.map(item => ({ id: item.id, topic: item.topic, why: item.why, level: item.level })),
      transcript: state.transcript,
      // 语流汇总：面试官可以据此调整追问方式（停顿长的地方换更小的切口），
      // 但**不要**把"你语速 2.1 字/秒"这种话回给候选人。
      fluency: state.fluency,
      stats: state.stats,
      report: state.report,
    }
  }

  // ── 岗位档案（历史复用） ───────────────────────────────────────────────

  /**
   * List every job profile.
   *
   * 一个岗位档案 = **一个岗位的考点基线**。同一个岗位第二次面试时，
   * 直接继承上次的清单，而不是从零调研——这才是「准备」的复利。
   *
   * @returns {Promise<Array<object>>}
   */
  async listProfiles() {
    const root = await this.profilesDir()
    const names = await listDirIfExists(root)
    const rows = []
    for (const name of names) {
      if (!SESSION_ID_PATTERN.test(name)) continue
      const doc = await readJsonIfExists(join(root, name, 'profile.json'))
      if (doc === undefined) continue
      rows.push({
        id: name,
        title: doc.title ?? name,
        company: doc.company ?? '',
        jdUrl: doc.jdUrl ?? '',
        jdChars: typeof doc.jdText === 'string' ? doc.jdText.length : 0,
        checklistCount: Array.isArray(doc.checklist?.items) ? doc.checklist.items.length : 0,
        sessions: Array.isArray(doc.sessions) ? doc.sessions : [],
        createdAt: doc.createdAt ?? 0,
        updatedAt: doc.updatedAt ?? 0,
      })
    }
    rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return rows
  }

  /**
   * Read one job profile.
   *
   * @param {string} profileId
   */
  async getProfile(profileId) {
    const dir = await this.profileDir(profileId)
    const doc = await readJsonIfExists(join(dir, 'profile.json'))
    if (doc === undefined) throw new Error(`岗位档案不存在：${profileId}`)
    return { ...doc, dir }
  }

  /**
   * Create or update a job profile.
   *
   * @param {{id?: string, title?: string, company?: string, jdUrl?: string, jdText?: string, checklist?: any}} input
   */
  async saveProfile(input = {}) {
    const id = typeof input.id === 'string' && input.id.trim() !== '' ? input.id.trim() : makeProfileId(input.title)
    const dir = await this.profileDir(id)
    const existing = await readJsonIfExists(join(dir, 'profile.json'))
    const now = Date.now()
    const doc = {
      id,
      title: typeof input.title === 'string' && input.title.trim() !== '' ? input.title.trim() : existing?.title ?? id,
      company: typeof input.company === 'string' ? input.company : existing?.company ?? '',
      jdUrl: typeof input.jdUrl === 'string' ? input.jdUrl : existing?.jdUrl ?? '',
      jdText: typeof input.jdText === 'string' ? input.jdText : existing?.jdText ?? '',
      checklist: input.checklist !== undefined ? input.checklist : existing?.checklist ?? { version: 2, items: [] },
      sessions: existing?.sessions ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await writeJsonAtomic(join(dir, 'profile.json'), doc)
    return doc
  }

  /**
   * Delete a job profile.
   *
   * @param {string} profileId
   */
  async deleteProfile(profileId) {
    const dir = await this.profileDir(profileId)
    const { rm } = await import('node:fs/promises')
    await rm(dir, { recursive: true, force: true })
    return { id: profileId, deleted: true }
  }

  /**
   * Pour a profile into a session: the JD and the checklist baseline.
   *
   * The inherited items are **marked**, so the panel can show「这份清单是从
   * 档案继承的」——继承不是伪装成本场面试的成果。
   *
   * @param {string} sessionId
   * @param {string} profileId
   */
  async applyProfile(sessionId, profileId) {
    const dir = await this.sessionDir(sessionId)
    const profile = await this.getProfile(profileId)
    const items = (profile.checklist?.items ?? []).map(item => ({
      ...item,
      inherited: true,
      inheritedFrom: profile.id,
      probed: false,
    }))

    if (typeof profile.jdText === 'string' && profile.jdText !== '') {
      await this.setJd(sessionId, { text: profile.jdText, url: profile.jdUrl })
    }
    await writeJsonAtomic(join(dir, 'checklist.json'), {
      version: 2,
      updatedAt: Date.now(),
      items,
      adjustments: [{ at: Date.now(), op: 'inherit', reason: `继承岗位档案「${profile.title}」`, id: profile.id }],
    })
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta !== undefined) {
      meta.profileId = profile.id
      meta.updatedAt = Date.now()
      await writeJsonAtomic(join(dir, 'session.json'), meta)
    }
    await this.touch(sessionId)
    return { sessionId, profileId: profile.id, title: profile.title, items: items.length }
  }

  /**
   * Write a session back into its profile: the JD as it stands, the checklist
   * as it ended up, and the session id in the history.
   *
   * @param {string} sessionId
   * @param {string|undefined} profileId defaults to the session's own profile
   */
  async syncProfile(sessionId, profileId) {
    const session = await this.getSession(sessionId)
    const target = typeof profileId === 'string' && profileId !== '' ? profileId : session.profileId
    if (typeof target !== 'string' || target === '') {
      throw new Error('这场面试没有关联岗位档案。请先指定要回写到哪个档案。')
    }
    const documents = await this.getDocuments(sessionId)
    const checklist = await this.getChecklist(sessionId)
    const saved = await this.saveProfile({
      id: target,
      title: session.title,
      jdUrl: documents.jdMeta.url ?? '',
      jdText: documents.jd,
      checklist: { version: 2, items: checklist.items.map(item => ({ ...item, inherited: undefined })) },
    })
    const profile = await this.getProfile(target)
    const sessions = [...new Set([...(profile.sessions ?? []), sessionId])]
    await writeJsonAtomic(join(profile.dir, 'profile.json'), { ...profile, sessions, updatedAt: Date.now() })
    return { sessionId, profileId: target, items: saved.checklist.items.length }
  }

  /**
   * Resolve one profile directory, refusing anything that escapes the root.
   *
   * @param {string} profileId
   */
  async profileDir(profileId) {
    if (typeof profileId !== 'string' || !PROFILE_ID_PATTERN.test(profileId)) {
      throw new Error(`非法的档案 id：${String(profileId)}`)
    }
    const root = await this.profilesDir()
    return resolveWithin(root, profileId)
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * A content fingerprint of one session.
   *
   * Derived from file **mtime + size**, not from timestamps inside the
   * content — so "nothing changed" really means "nothing changed", and the
   * same value survives a restart.
   *
   * @param {string} dir
   */
  async revisionOf(dir) {
    const files = ['session.json', 'checklist.json', 'transcript.jsonl', 'report.md']
    const parts = []
    for (const name of files) {
      try {
        const info = await stat(join(dir, name))
        parts.push(`${name}:${Math.trunc(info.mtimeMs)}:${info.size}`)
      } catch {
        parts.push(`${name}:-`)
      }
    }
    return parts.join('|')
  }

  /**
   * Bump the session's `updatedAt`.
   *
   * @param {string} sessionId
   */
  async touch(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta === undefined) return
    meta.updatedAt = Date.now()
    await writeJsonAtomic(join(dir, 'session.json'), meta)
  }
}

/**
 * Normalize one checklist item.
 *
 * @param {object} raw
 * @param {number} index
 * @param {object[]} existing used to keep ids unique
 */
function normalizeChecklistItem(raw, index, existing = []) {
  const item = raw !== undefined && typeof raw === 'object' && raw !== null ? raw : {}
  const used = new Set(existing.map(entry => entry.id))
  let id = typeof item.id === 'string' && item.id.trim() !== '' ? item.id.trim() : `c${index + 1}`
  let suffix = 1
  while (used.has(id)) {
    id = `c${index + 1}-${suffix}`
    suffix += 1
  }
  const level = CHECKLIST_LEVEL[String(item.level)] !== undefined ? item.level : CHECKLIST_LEVEL.CORE
  return {
    id,
    topic: String(item.topic ?? '').trim() || '未命名考点',
    why: typeof item.why === 'string' ? item.why.trim() : '',
    level,
    source: typeof item.source === 'string' && item.source.trim() !== '' ? item.source.trim() : 'jd',
    tags: Array.isArray(item.tags) ? item.tags.map(tag => String(tag)) : [],
    probed: item.probed === true,
    note: typeof item.note === 'string' ? item.note : '',
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    // 继承来的考点要**留痕**：这份清单是档案里的基线，不是本场面试的成果。
    ...(item.inherited === true ? { inherited: true } : {}),
    ...(typeof item.inheritedFrom === 'string' && item.inheritedFrom !== '' ? { inheritedFrom: item.inheritedFrom } : {}),
  }
}

/**
 * Make a short, sortable profile id.
 *
 * The id stays **ASCII**: it is a directory name, and directory names travel
 * between machines. The readable name lives in `title` instead.
 *
 * @param {string|undefined} title
 */
function makeProfileId(title) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 10)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `pf-${stamp}-${suffix}`
}

/** Make a short, sortable session id. */
function makeSessionId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `iv-${stamp}-${suffix}`
}

/** Make a short, sortable resume id. */
function makeResumeId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `rs-${stamp}-${suffix}`
}

/**
 * 新建一场面试时的占位元信息。
 *
 * **为什么是「新建公司 / 新建岗位」而不是空着。** 列表按公司分组、助手要读
 * 元信息——全空的话两处都得特殊处理，而且用户分不清「没填」和「读不到」。
 * 带上日期 (`新建公司 2026-11-17`) 一眼就能看出这是占位值，不是真名字。
 *
 * **不猜。** 公司 / 岗位 / 标题只在助手或用户**显式写入**时才变成真值；
 * 插件不从 JD 正文里提炼（JD 的「【基础信息】」不是公司名）。
 *
 * @param {number} createdAt
 * @returns {{company: string, position: string, title: string}}
 */
function defaultIdentity(createdAt) {
  const date = formatDate(createdAt)
  const company = `新建公司 ${date}`
  const position = `新建岗位 ${date}`
  return { company, position, title: `${company} · ${position}` }
}

/**
 * 元信息归一化：公司 / 岗位 / 标题。
 *
 * 规则见 `updateSession()` 的注释。这里只做三件事：
 * 空的公司/岗位补占位值、标题留空就拼、「自动拼」的标题跟着改。
 *
 * @param {object} before 改之前的 session.json
 * @param {object} meta 改之后的元信息（就地修改）
 * @param {object} patch 本次的 patch（用来知道调用者到底有没有写标题）
 */
function normalizeIdentity(before, meta, patch) {
  const touched = ['title', 'company', 'position'].some(key => patch[key] !== undefined)
  if (!touched) return
  const text = value => (typeof value === 'string' ? value.trim() : '')
  const createdAt = Number.isFinite(before.createdAt) ? before.createdAt : Date.now()
  const stub = defaultIdentity(createdAt)
  const previousTitle = text(before.title)
  // 标题是不是「自动拼」的？显式写过的标题永远不动；
  // 老场次没有 `titleAuto`，就按占位标题的样子推断（空 / 老默认 / 等于公司·岗位）。
  const wasAuto = typeof before.titleAuto === 'boolean'
    ? before.titleAuto
    : previousTitle === ''
      || /^面试 \d{4}-\d{2}-\d{2}$/.test(previousTitle)
      || previousTitle === `${text(before.company)} · ${text(before.position)}`

  meta.company = text(meta.company) === '' ? stub.company : text(meta.company)
  meta.position = text(meta.position) === '' ? stub.position : text(meta.position)

  const requested = text(meta.title)
  if (requested === '') {
    // 用户清空标题 = 没起名，用「公司 · 岗位」补上，以后继续跟着走。
    meta.title = `${meta.company} · ${meta.position}`
    meta.titleAuto = true
    return
  }
  if (requested !== previousTitle) {
    // 显式改了标题：从此这行字是用户/助手定的，公司/岗位再变也不覆盖。
    meta.title = requested
    meta.titleAuto = false
    return
  }
  if (wasAuto) {
    meta.title = `${meta.company} · ${meta.position}`
    meta.titleAuto = true
  } else {
    meta.titleAuto = false
  }
}

/** `2026-11-16` for a timestamp. */
function formatDate(ts) {
  const date = new Date(ts)
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Guess the file extension of a recording.
 *
 * @param {string} mimeType
 * @param {string|undefined} filename
 * @param {string} kind
 */
function extensionFor(mimeType, filename, kind) {
  if (typeof filename === 'string' && filename.includes('.')) {
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    if (/^\.[a-z0-9]{1,5}$/.test(extension)) return extension
  }
  if (/webm/.test(mimeType)) return '.webm'
  if (/mp4/.test(mimeType)) return '.mp4'
  if (/ogg/.test(mimeType)) return '.ogg'
  if (/wav/.test(mimeType)) return '.wav'
  if (/mpeg|mp3/.test(mimeType)) return '.mp3'
  return kind === 'audio' ? '.webm' : '.webm'
}

/**
 * Keep a filename safe for the filesystem.
 *
 * @param {string|undefined} name
 */
function sanitizeName(name) {
  if (typeof name !== 'string') return ''
  return name
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120)
}

/** The absolute workspace root in force, for display. */
export async function workspaceRootOf(service) {
  return resolve(await service.effectiveRoot())
}