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
  // 暂停（docs/TURN-TAKING.md §6）：设备释放、计时停走，助手会话原地保留。
  // resume 时累计进 pausedMs——面试时长必须扣掉它，否则「暂停两小时」
  // 全算进 durationMs，报告与 tooShortForReport 判断全歪。
  PAUSED: 'paused',
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
 * 「等助手返回」的三件事：抓 JD / 出底稿 / 写报告。
 *
 * **为什么要宿主记状态。** 面板点完按钮只拿到「已派发」；助手什么时候回、
 * 有没有回，客户端自己猜不出来——**猜出来的 loading 就是假活空转**。
 * 所以派发时落一条记录（`session.json.agentTasks`），对应写入落盘时清掉；
 * 读取状态时按「宿主会话在不在跑 + 有没有超过等待上限」给结论：
 *
 *   waiting —— 还在跑（或在宿主队列里排队），继续转；
 *   failed  —— 有终点的失败：会话没了、这一轮跑完却没写回、或者超时。
 *
 * 三种失败都必须能把「下一步」交给用户（AGENTS §7），不许无限转圈。
 */
const AGENT_TASK_DEADLINE_MS = {
  jd: 4 * 60 * 1000,
  checklist: 10 * 60 * 1000,
  report: 10 * 60 * 1000,
}

/**
 * 判定「这一轮跑完了却没写回」的宽限期。
 *
 * 派发刚入队时宿主可能还没把 `running` 置真；太早判定会误伤，
 * 所以只对**已经等了 12 秒以上**的任务做「settled = 失败」的判断。
 */
const AGENT_TASK_GRACE_MS = 12000

/** 三种任务的失败话术（reason 说事实，hint 给下一步）。 */
const AGENT_TASK_FAILURE = {
  checklist: {
    reason: '助手这一轮结束了，但没有写回底稿',
    hint: '再点「重新生成」派一次；也可以让助手在对话里用 interview_save_checklist 写入。',
  },
  jd: {
    reason: '助手这一轮结束了，但没有写回 JD 正文',
    hint: '再点「让助手去抓」；也可以把正文粘进 JD 框，或上传纯文本。',
  },
  report: {
    reason: '助手这一轮结束了，但没有写回报告',
    hint: '再点一次「生成事后报告」；也可以在对话里让助手用 interview_finish 写。',
  },
}

/** 任务类型白名单。 */
const AGENT_TASK_KINDS = ['jd', 'checklist', 'report']

/**
 * 助手会话账本最多留多少条。
 *
 * 它是**溯源**用的，不是日志文件：够回答「这场面试用了哪个宿主会话、
 * 什么时候重建过、最近几次派活发到哪儿」就行。留太多会让 session.json
 * 跟着每次轮询变大。
 */
const AGENT_LOG_MAX = 40

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
      // 这一场专属的宿主助手会话（派活寻址用，AGENTS §6.14）。
      // 新建即带空串字段：**空串 = 「明确还没有」**，于是第一次派活会
      // create 一个（老场次连字段都没有，同样走 create——**谁也不继承
      // 全局 `settings.agentSessionId`**，那是另一场面试的面包屑）。
      agentSessionId: '',
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
      // 暂停/继续（docs/TURN-TAKING.md §6.2）与 per-session 助手会话。
      'pausedAt', 'pausedMs', 'agentSessionId',
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

  // ── 面试进行：开始 / 暂停 / 继续 / 结束（docs/TURN-TAKING.md §5–§6） ────

  /**
   * 开始面试，并**唤醒助手开场**（G1：点「开始面试」后不需要用户再去
   * 对话区做任何事）。
   *
   * 状态机：`draft|ready|done → running`；`paused` 拒绝（该走 resume）；
   * 已经 running = **no-op**——双击/重试不会重复派开场。done 的场次重新
   * 开始会拿到新的 `startedAt`，requestId 带上它，重新开始也能重新开场
   * （宿主按 requestId 幂等去重，同一次 start 的重试仍然只派一次）。
   *
   * 派活**异步**发出：HTTP 先返回（面板立刻进入面试态），开场白随后
   * 由轮询带回；失败走 system 行 + 面板「重新发给助手」（§4.4）。
   *
   * @param {string} sessionId
   */
  async startSession(sessionId) {
    const meta = await this.getSession(sessionId)
    if (meta.status === SESSION_STATUS.PAUSED) {
      throw new Error('面试在暂停中：请用「继续面试」恢复，而不是重新开始。')
    }
    if (meta.status === SESSION_STATUS.RUNNING) {
      return { ...meta, dir: await this.sessionDir(sessionId), restarted: false }
    }
    const now = Date.now()
    // 重开一场**已结束**的面试 = 新的一轮：旧一轮的暂停时长清零
    // （否则上一轮暂停两小时会把新一轮的 durationMs 扣成负数）。
    // 暂停/继续的留痕仍在转录的 system 行里，复盘不受影响。
    const freshRun = meta.status === SESSION_STATUS.DONE
    const session = await this.updateSession(sessionId, {
      status: SESSION_STATUS.RUNNING,
      startedAt: now,
      // 重开场次：结束标记清零。
      endedAt: 0,
      ...(freshRun ? { pausedAt: 0, pausedMs: 0 } : {}),
    })
    this.fireAgentDispatch(sessionId, {
      kind: 'start',
      requestId: `start-${sessionId}-${now}`,
      text: agentStartPrompt(sessionId),
    })
    return { ...session, restarted: true }
  }

  /**
   * 暂停面试（G4）。
   *
   * Host 只做三件事：状态 + 时间戳、system 行留痕、**不 cancel 进行中的
   * 助手 turn**——它多半正在生成下一问，生成完落盘无害，恢复时那一问
   * 就在转录里等着；cancel 反而制造「半截问题」（§6.3，P2 再考虑配置）。
   *
   * 设备释放是**客户端**的责任（指示灯必须灭，§10.3 隐私纪律）。
   *
   * @param {string} sessionId
   */
  async pauseSession(sessionId) {
    const meta = await this.getSession(sessionId)
    if (meta.status !== SESSION_STATUS.RUNNING) {
      throw new Error(`只有进行中的面试能暂停（当前：${meta.status}）`)
    }
    const session = await this.updateSession(sessionId, {
      status: SESSION_STATUS.PAUSED,
      pausedAt: Date.now(),
    })
    // system 行本就被 turns 统计过滤排除：报告时间线自然可见，语流不受影响。
    await this.appendTurn(sessionId, {
      role: 'system',
      text: '面试暂停',
      meta: { event: 'pause' },
    })
    return session
  }

  /**
   * 继续面试：累计暂停时长、system 行留痕、**异步派活唤醒助手**。
   *
   * 助手会话的恢复是宿主免费送的（§6.5）：prompt 直达存好的会话 id，
   * 冷会话被唤醒时历史完整重建——DSH 重启过也一样。双保险是 resume
   * prompt 要求助手先 interview_get_context 重新对齐：即使助手会话丢了，
   * 卷宗（transcript + checklist + 简历/JD）才是唯一真源。
   *
   * @param {string} sessionId
   */
  async resumeSession(sessionId) {
    const meta = await this.getSession(sessionId)
    if (meta.status !== SESSION_STATUS.PAUSED) {
      throw new Error(`只有暂停中的面试能继续（当前：${meta.status}）`)
    }
    const now = Date.now()
    const pausedAt = Number.isFinite(meta.pausedAt) && meta.pausedAt > 0 ? meta.pausedAt : now
    const pausedSegment = Math.max(0, now - pausedAt)
    const pausedMs = (Number.isFinite(meta.pausedMs) ? meta.pausedMs : 0) + pausedSegment
    const session = await this.updateSession(sessionId, {
      status: SESSION_STATUS.RUNNING,
      pausedAt: 0,
      pausedMs,
    })
    const minutes = Math.max(1, Math.round(pausedSegment / 60000))
    await this.appendTurn(sessionId, {
      role: 'system',
      text: `面试继续（本次暂停 ${describeGap(pausedSegment)}）`,
      meta: { event: 'resume', pausedSegmentMs: pausedSegment },
    })
    this.fireAgentDispatch(sessionId, {
      kind: 'resume',
      requestId: `resume-${sessionId}-${pausedAt}`,
      text: agentResumePrompt(sessionId, minutes),
    })
    return session
  }

  /**
   * 结束面试（不带报告的状态收尾；写报告走 `saveReport`/interview_finish）。
   *
   * `running|paused → done`；暂停中直接结束也认——那一段暂停同样计入
   * `pausedMs`，计时口径与 resume 一致（§6.2）。
   *
   * @param {string} sessionId
   */
  async finishSession(sessionId) {
    const meta = await this.getSession(sessionId)
    if (meta.status !== SESSION_STATUS.RUNNING && meta.status !== SESSION_STATUS.PAUSED) {
      throw new Error(`面试只能在进行中或暂停中结束（当前：${meta.status}）`)
    }
    const now = Date.now()
    const pausedMs = meta.status === SESSION_STATUS.PAUSED
      ? (Number.isFinite(meta.pausedMs) ? meta.pausedMs : 0)
        + Math.max(0, now - (Number.isFinite(meta.pausedAt) && meta.pausedAt > 0 ? meta.pausedAt : now))
      : (Number.isFinite(meta.pausedMs) ? meta.pausedMs : 0)
    return this.updateSession(sessionId, {
      status: SESSION_STATUS.DONE,
      endedAt: now,
      pausedAt: 0,
      pausedMs,
    })
  }

  // ── 重置 / 续接 / 批量清理（把「一场面试」当成可整理的东西）────────────

  /**
   * 重置一场面试：**清掉面试过程的记录，留下材料与底稿。**
   *
   * 为什么需要它：误触「开始面试」再停掉，会留下几条零碎 system 行、
   * 一段假的计时、一个「结束了」的状态——这些脏片段既进不了报告，
   * 又不能用「删除」清掉（用户不想连简历 / JD / 底稿一起删）。
   *
   * **清什么、留什么必须一句话说得清**（界面照抄这一段）：
   *
   * | 清掉 | 留下 |
   * |---|---|
   * | 转录（含 system 行）、报告、计时与暂停账本 | 简历、JD、考点清单本身 |
   * | 清单上的「问过」标记、证据与调整记录 | 标题 / 公司 / 岗位 / 档案关联 |
   * | 「等助手」的任务记录 | 卷宗目录本身 |
   * | 录音录像（**默认保留**，`dropRecordings` 才删） | |
   *
   * **助手会话要解绑，不是留着。** 旧会话里躺着一整轮面试的上下文；
   * 重置之后还用它开场，助手会接着上一轮的思路说话——那正是「会话串场」
   * （AGENTS §6.14）。解绑只改引用，旧对话仍在 DSH 里，用户自己处置。
   *
   * @param {string} sessionId
   * @param {{dropRecordings?: boolean}} [input]
   */
  async resetSession(sessionId, input = {}) {
    const meta = await this.getSession(sessionId)
    const dir = await this.sessionDir(sessionId)
    const transcript = await readJsonl(join(dir, 'transcript.jsonl'))
    const cleared = {
      turns: transcript.length,
      interviewTurns: transcript.filter(row => row.role !== 'system').length,
      report: false,
      recordings: 0,
      checklistProbed: 0,
      checklistAdjustments: 0,
      agentTasks: meta.agentTasks !== null && typeof meta.agentTasks === 'object'
        ? Object.keys(meta.agentTasks).length
        : 0,
    }

    // 1. 转录与报告：删文件，不写空文件——空文件会让「有没有记录」的判断失真。
    await rm(join(dir, 'transcript.jsonl'), { force: true })
    if (await isFile(join(dir, 'report.md'))) {
      await rm(join(dir, 'report.md'), { force: true })
      cleared.report = true
    }

    // 2. 录音录像是**不可恢复的文件**：默认留着，要删得显式要求。
    const recordingsDir = join(dir, 'recordings')
    const recordings = await listDirIfExists(recordingsDir)
    if (input.dropRecordings === true) {
      for (const name of recordings) {
        await rm(join(recordingsDir, name), { recursive: true, force: true })
      }
      cleared.recordings = recordings.length
    }

    // 3. 底稿：只清「这场问过什么」，不清考点本身——底稿是准备阶段的成果。
    const checklist = await readJsonIfExists(join(dir, 'checklist.json'))
    if (checklist !== null && typeof checklist === 'object') {
      const items = Array.isArray(checklist.items) ? checklist.items : []
      cleared.checklistProbed = items.filter(item => item.probed === true).length
      cleared.checklistAdjustments = Array.isArray(checklist.adjustments) ? checklist.adjustments.length : 0
      await writeJsonAtomic(join(dir, 'checklist.json'), {
        ...checklist,
        items: items.map(item => {
          const next = { ...item }
          delete next.probed
          delete next.note
          delete next.evidence
          return next
        }),
        adjustments: [],
        updatedAt: Date.now(),
      })
    }

    // 4. session.json：回到「还没开始」，解绑助手会话，清掉等助手的任务。
    const previousAgent = typeof meta.agentSessionId === 'string' ? meta.agentSessionId.trim() : ''
    for (const key of ['startedAt', 'endedAt', 'pausedAt', 'pausedMs', 'agentTasks']) delete meta[key]
    meta.status = SESSION_STATUS.DRAFT
    meta.agentSessionId = ''
    meta.updatedAt = Date.now()
    if (previousAgent !== '') {
      meta.agentLog = [
        ...(Array.isArray(meta.agentLog) ? meta.agentLog : []),
        { at: meta.updatedAt, event: 'detach', hostSessionId: previousAgent, reason: 'reset' },
      ].slice(-AGENT_LOG_MAX)
    }
    await writeJsonAtomic(join(dir, 'session.json'), meta)

    return {
      ok: true,
      sessionId,
      cleared: { ...cleared, hostSessionDetached: previousAgent !== '' },
      kept: {
        recordings: input.dropRecordings === true ? 0 : recordings.length,
        checklistItems: Array.isArray(checklist?.items) ? checklist.items.length : 0,
        resume: await isFile(join(dir, 'resume.txt')),
        jd: await isFile(join(dir, 'jd.txt')),
      },
      session: { ...meta, dir },
    }
  }

  /**
   * 续接一场**已经结束**的面试。
   *
   * 场景：某次面试没聊完，但用户临时不方便，先「结束」把数据落定去分析；
   * 之后想把这场不完美的面试接着面完——而不是重新开一场。
   *
   * 与 `startSession` 的区别是**计时口径**：续接不重开一轮，
   * 中断的那段时间记进 `pausedMs`（它不是面试时长），所以报告里的
   * durationMs 仍然只算真正在面的时间；转录、清单、助手会话全部沿用。
   *
   * @param {string} sessionId
   */
  async continueSession(sessionId) {
    const meta = await this.getSession(sessionId)
    if (meta.status !== SESSION_STATUS.DONE) {
      throw new Error(`只有已结束的面试能续接（当前：${meta.status}）`)
    }
    const now = Date.now()
    const endedAt = Number.isFinite(meta.endedAt) && meta.endedAt > 0 ? meta.endedAt : (meta.updatedAt || now)
    const gap = Math.max(0, now - endedAt)
    const pausedMs = (Number.isFinite(meta.pausedMs) ? meta.pausedMs : 0) + gap
    const session = await this.updateSession(sessionId, {
      status: SESSION_STATUS.RUNNING,
      endedAt: 0,
      pausedAt: 0,
      pausedMs,
    })
    const minutes = Math.max(1, Math.round(gap / 60000))
    await this.appendTurn(sessionId, {
      role: 'system',
      // 留痕说**真实**的中断时长：只断了两秒却写「中断 1 分钟」，
      // 事后复盘会以为中间隔了很久（`describeGap`）。
      text: `面试续接（中断 ${describeGap(gap)}，接着上一轮）`,
      meta: { event: 'continue', gapMs: gap },
    })
    this.fireAgentDispatch(sessionId, {
      kind: 'continue-session',
      requestId: `continue-session-${sessionId}-${now}`,
      text: agentResumePrompt(sessionId, minutes, { continued: true }),
    })
    return session
  }

  /**
   * 批量删除场次（「记录清理」）：用户勾选哪几场就删哪几场。
   *
   * **逐场报告结果，不整批失败。** 正在进行的面试会被拒（要先把设备关掉、
   * 把转录收尾），其余照删；谁没删掉、为什么，逐条带回去。
   *
   * @param {string[]} ids
   */
  async deleteSessions(ids) {
    const list = Array.isArray(ids) ? [...new Set(ids.map(value => String(value).trim()).filter(value => value !== ''))] : []
    if (list.length === 0) throw new Error('没选要删的场次')
    const deleted = []
    const refused = []
    for (const id of list) {
      try {
        const result = await this.deleteSession(id, {})
        if (result.ok === false) refused.push({ id, reason: result.error ?? '删不掉', hint: result.hint })
        else deleted.push(result)
      } catch (error) {
        refused.push({ id, reason: error && error.message ? error.message : String(error) })
      }
    }
    return { deleted, refused, deletedCount: deleted.length, refusedCount: refused.length }
  }

  /**
   * 「记录清理」弹层要的清单：每场面试的记录体量。
   *
   * **只在这个弹层打开时算。** 每场要读转录行数、报告字数、录音个数、
   * 目录大小——放进 6 秒轮询的列表接口就是白烧 CPU（AGENTS §11）。
   *
   * @returns {Promise<Array<object>>}
   */
  async listSessionsForCleanup() {
    const rows = await this.listSessions()
    const out = []
    for (const row of rows) {
      const dir = row.dir
      const sizeOf = async name => {
        try {
          return (await stat(join(dir, name))).size
        } catch {
          return 0
        }
      }
      const turns = (await readJsonl(join(dir, 'transcript.jsonl'))).length
      const recordings = await listDirIfExists(join(dir, 'recordings'))
      let recordingsBytes = 0
      for (const name of recordings) {
        try {
          recordingsBytes += (await stat(join(dir, 'recordings', name))).size
        } catch { /* 读不到就不计 */ }
      }
      out.push({
        id: row.id,
        title: row.title,
        company: row.company,
        position: row.position,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        archived: row.archived,
        turns,
        hasResume: row.hasResume,
        hasJd: row.hasJd,
        hasReport: row.hasReport,
        checklistCount: row.checklistCount,
        recordings: recordings.length,
        // 「占用」= 卷宗里真正的大件之和（简历 / JD / 转录 / 报告 / 录音）。
        bytes: await sizeOf('resume.txt') + await sizeOf('jd.txt')
          + await sizeOf('transcript.jsonl') + await sizeOf('report.md') + recordingsBytes,
        running: row.status === SESSION_STATUS.RUNNING,
      })
    }
    return out
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
    // 正文落盘 = 这次「等助手抓 JD」有结果了，把 loading 收掉。
    await this.clearAgentTask(sessionId, 'jd')
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

  /**
   * 确保有一个**落在面试工作区**的宿主助手会话，并且是**这一场面试专属**的。
   *
   * **一场面试 = 一个助手会话，全流程共用。** 拉 JD、出底稿、开场、继续、
   * 写报告都寻址到同一个 `sessionId`：助手在同一个对话里攒上下文，
   * 用户点开左栏也只看到一条相关对话（AGENTS §6.14）。
   *
   * **绝不从「全局面包屑」继承会话 id。** 旧实现让没有 `agentSessionId`
   * 的场次继承 `settings.agentSessionId`——那是「最近一次 create」的记录，
   * 属于**另一场**面试。于是新岗位拉 JD 时请求被发到某个面试中的场次里，
   * 上下文直接串台。现在没有记录就**新建**，旧的全局键只当诊断面包屑。
   *
   * **为什么不再把已存在的 id 塞给 create。** 宿主语义（装机包 README 读实）：
   * `create` 只复用**空白**（未开始任何轮次）的会话；对非空白的指定 id
   * 「保持不变，改为新建 Session」。旧实现每次派活都 create(savedId)——
   * 第一次派活之后每次都在漂移新会话，「复用会话避免刷屏」的意图落空。
   * 正确姿势：**有 id 就直接返回**（prompt 时宿主自会恢复冷会话，历史在
   * 持久日志里完整重建）；create 只在完全没有会话时用一次。
   *
   * @param {string} [interviewSessionId] 面试会话 id；省略时只读全局诊断键
   */
  async ensureAgentSession(interviewSessionId = undefined) {
    const workspacePath = await this.effectiveRoot()
    const describe = (sessionId, extra) => ({
      sessionId,
      workspace: this.workspaceRegistration?.path ?? workspacePath,
      workspaceId: this.workspaceRegistration?.workspaceId ?? '',
      registered: this.workspaceRegistration?.registered === true,
      ...extra,
    })

    const id = typeof interviewSessionId === 'string' ? interviewSessionId.trim() : ''
    if (id !== '') {
      // 会话不存在就抛——派活落错地方比失败更糟。
      const meta = await this.getSession(id)
      const stored = typeof meta.agentSessionId === 'string' ? meta.agentSessionId.trim() : ''
      if (stored !== '') {
        // **先问宿主它在不在。** 只在 prompt 失败时才重建，等于让用户先
        // 看一次失败；宿主有 `state()` 就先探一次（读不到 ≠ 不在，见
        // `hostAgentState`——`unknown` 一律当还在）。
        const alive = await this.agentSessionAlive(stored)
        if (alive !== 'gone') return describe(stored, { reused: true })
        await this.clearAgentSession(id, 'gone-before-dispatch')
      }
    } else {
      // 没给面试 id（interview_agent_session 的诊断路径）：全局键只读不寻址。
      const settings = await readSettings()
      const stored = typeof settings.agentSessionId === 'string' ? settings.agentSessionId.trim() : ''
      if (stored !== '') return describe(stored, { reused: true })
    }

    // 完全没有会话，才 create 一次。
    const controller = this.ctx?.get?.('sessionController')
    if (controller === undefined || controller === null || typeof controller.create !== 'function') {
      throw new Error('这个宿主没有提供建会话接口，不能把请求派给助手')
    }
    const workspace = await this.ensureAgentWorkspace()
    // 优先用 **已登记的工作区 id** 绑定；宿主没有工作区接口时才退回 cwd。
    const request = workspace.workspaceId !== ''
      ? { workspaceId: workspace.workspaceId }
      : { cwd: workspace.path }
    const created = await controller.create(request)
    const agentSessionId = String(created?.sessionId ?? '')
    if (agentSessionId === '') throw new Error('宿主没有返回会话 id')
    if (id !== '') {
      await this.updateSession(id, { agentSessionId })
      await this.noteAgentLog(id, {
        event: 'open',
        hostSessionId: agentSessionId,
        workspaceId: workspace.workspaceId,
        reason: '首次派活',
      })
    }
    // 全局键留作「最近一次 create 用过的会话」的面包屑（诊断用，不再参与寻址）。
    try {
      await writeSettings({ agentSessionId })
    } catch { /* 面包屑丢了不影响派活 */ }
    return describe(agentSessionId, {
      reused: false,
      created: true,
      workspace: workspace.path,
      workspaceId: workspace.workspaceId,
      registered: workspace.registered,
      workspaceCreated: workspace.created === true,
    })
  }

  /**
   * 宿主那边这个会话还在不在：`alive` / `gone` / `unknown`。
   *
   * **`unknown` 一律当还在用。** 老宿主没有 `state()`、或者这一次探测自身
   * 出错时，重建会话会把用户正在用的上下文丢掉——那是比「一个已死的 id」
   * 更糟的结果。真死了的话，prompt 会报 `session/not-found`，那条路照样兜底。
   *
   * @param {string} agentSessionId
   */
  async agentSessionAlive(agentSessionId) {
    const id = typeof agentSessionId === 'string' ? agentSessionId.trim() : ''
    if (id === '') return 'gone'
    const state = await this.hostAgentState(id)
    if (state.phase === 'gone') return 'gone'
    if (state.phase === 'unknown') return 'unknown'
    return 'alive'
  }

  /**
   * 往这一场的**助手会话账本**里记一笔（可溯源：用了哪个会话、谁重建过）。
   *
   * 写账本失败**不挡派活**——账本是给人事后看的，不是主流程的一部分。
   *
   * @param {string} interviewSessionId
   * @param {{event: string, hostSessionId?: string, workspaceId?: string, reason?: string, kind?: string, requestId?: string, explicit?: boolean}} entry
   */
  async noteAgentLog(interviewSessionId, entry) {
    const id = typeof interviewSessionId === 'string' ? interviewSessionId.trim() : ''
    if (id === '') return
    try {
      const dir = await this.sessionDir(id)
      const meta = await readJsonIfExists(join(dir, 'session.json'))
      if (meta === undefined) return
      const at = Date.now()
      const record = {
        at,
        event: String(entry.event ?? ''),
        ...(typeof entry.hostSessionId === 'string' && entry.hostSessionId !== ''
          ? { hostSessionId: entry.hostSessionId }
          : {}),
        ...(typeof entry.workspaceId === 'string' && entry.workspaceId !== ''
          ? { workspaceId: entry.workspaceId }
          : {}),
        ...(typeof entry.kind === 'string' && entry.kind !== '' ? { kind: entry.kind } : {}),
        ...(typeof entry.requestId === 'string' && entry.requestId !== '' ? { requestId: entry.requestId } : {}),
        ...(entry.explicit === true ? { explicit: true } : {}),
        ...(typeof entry.reason === 'string' && entry.reason !== '' ? { reason: entry.reason } : {}),
      }
      meta.agentLog = [...(Array.isArray(meta.agentLog) ? meta.agentLog : []), record].slice(-AGENT_LOG_MAX)
      meta.updatedAt = at
      await writeJsonAtomic(join(dir, 'session.json'), meta)
    } catch { /* 账本丢了只影响溯源 */ }
  }

  /**
   * 清掉这一场存着的助手会话 id（会话被宿主删除后重建用）。
   *
   * **置空串而不是删字段**：字段缺失 = 「老场次」，旧实现会去继承全局面包屑
   * （见 `ensureAgentSession`）；空串 = 「明确没有」，直接走 create 重建。
   *
   * @param {string} interviewSessionId
   * @param {string} [reason] 记进账本的原因（gone / reset / manual）
   */
  async clearAgentSession(interviewSessionId, reason = undefined) {
    const dir = await this.sessionDir(interviewSessionId)
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta === undefined) return
    const previous = typeof meta.agentSessionId === 'string' ? meta.agentSessionId.trim() : ''
    meta.agentSessionId = ''
    meta.updatedAt = Date.now()
    if (previous !== '') {
      meta.agentLog = [
        ...(Array.isArray(meta.agentLog) ? meta.agentLog : []),
        {
          at: meta.updatedAt,
          event: 'clear',
          hostSessionId: previous,
          ...(typeof reason === 'string' && reason !== '' ? { reason } : {}),
        },
      ].slice(-AGENT_LOG_MAX)
    }
    await writeJsonAtomic(join(dir, 'session.json'), meta)
  }

  /**
   * 向助手发一条派活 prompt —— **唯一通道**（docs/TURN-TAKING.md §5）。
   *
   * 三条宿主机制都用上：
   *  - `mode:'queue'`：助手忙时进 inbox 排队，不打断当前 turn；
   *  - `requestId` 幂等：客户端重试、轮询竞态都不会重复派活；
   *  - 冷会话由 prompt 自动唤醒（历史在持久日志里），DSH 重启也不丢。
   *
   * **寻址只有两种，且都要留痕**（AGENTS §6.14）：
   *  - 默认：这一场面试专属的助手会话（`ensureAgentSession`），
   *    拉 JD / 出底稿 / 开场 / 继续 / 报告共用同一个；
   *  - 显式：调用方点名某个宿主对话（`dispatch.hostSessionId`），
   *    账本里记 `explicit: true`，**它不在了也不许悄悄换别的会话**——
   *    那正是「会话乱飞」。这种情况让错误抛回调用方，由人来决定。
   *
   * 存的会话已被删除（session/not-found）→ 清 id、重建、**同一 requestId**
   * 重发一次，并在转录记 system 行「助手会话已重建」——卷宗才是唯一真源，
   * 助手会话只是工作记忆，重建无损（§5.2）。
   *
   * @param {string} sessionId 面试会话 id
   * @param {{kind: string, requestId: string, text: string, hostSessionId?: string}} dispatch
   */
  async dispatchAgentPrompt(sessionId, dispatch) {
    const controller = this.ctx?.get?.('sessionController')
    if (controller === undefined || controller === null || typeof controller.prompt !== 'function') {
      throw new Error('这个宿主没有提供会话接口，不能把请求派给助手')
    }
    const explicitId = typeof dispatch.hostSessionId === 'string' ? dispatch.hostSessionId.trim() : ''
    const hostSession = explicitId !== ''
      ? { sessionId: explicitId, workspace: undefined, explicit: true }
      : { ...(await this.ensureAgentSession(sessionId)), explicit: false }
    // **signal 是必填的第二个参数。** 宿主实现的第一句就是
    // `signal.throwIfAborted()`——不传就炸。
    const send = target => controller.prompt({
      requestId: dispatch.requestId,
      sessionId: target,
      mode: 'queue',
      content: [{ type: 'text', text: dispatch.text }],
    }, new AbortController().signal)
    const note = (target, extra = {}) => this.noteAgentLog(sessionId, {
      event: 'dispatch',
      hostSessionId: target,
      kind: dispatch.kind,
      requestId: dispatch.requestId,
      explicit: hostSession.explicit === true,
      ...extra,
    })
    try {
      await send(hostSession.sessionId)
      await note(hostSession.sessionId)
    } catch (error) {
      if (!isAgentSessionGone(error)) throw error
      // 点名的对话已经不在了：如实抛回，不偷偷换一个会话去发。
      if (hostSession.explicit === true) throw error
      await this.clearAgentSession(sessionId, 'dispatch-gone')
      const rebuilt = await this.ensureAgentSession(sessionId)
      await send(rebuilt.sessionId)
      await note(rebuilt.sessionId, { reason: 'rebuilt' })
      await this.appendTurn(sessionId, {
        role: 'system',
        text: '助手会话已重建，上下文从卷宗恢复。',
        meta: { agent: { rebuilt: true, kind: dispatch.kind, requestId: dispatch.requestId } },
      }).catch(() => { /* 留痕失败不挡派活 */ })
      return {
        dispatched: true,
        rebuilt: true,
        kind: dispatch.kind,
        requestId: dispatch.requestId,
        hostSession: { id: rebuilt.sessionId, workspace: rebuilt.workspace, explicit: false },
      }
    }
    return {
      dispatched: true,
      kind: dispatch.kind,
      requestId: dispatch.requestId,
      hostSession: {
        id: hostSession.sessionId,
        workspace: hostSession.workspace,
        explicit: hostSession.explicit === true,
      },
      message: hostSession.explicit === true
        ? '请求已发到你指定的对话。'
        : `请求已发到面试工作区里的助手会话：${hostSession.workspace}`,
    }
  }

  /**
   * 派活失败必须**留痕 + 给出路**（AGENTS §7 / TURN-TAKING §4.4）。
   *
   * 回答已落盘不回滚；transcript 记一条 system 行「派活失败：原因」，
   * meta.dispatch 带上原始 kind/requestId/text——面板轮询到就显示
   * 「重新发给助手」按钮，重发用**原 requestId**（宿主幂等去重兜底）。
   */
  async noteAgentDispatchFailure(sessionId, dispatch, error) {
    const reason = error && error.message ? error.message : String(error ?? '')
    const hint = /writer-held|被占用|占用/.test(reason)
      ? '助手会话被别的写者占用：回 DSH 关掉那个占用者，再点重发。'
      : /archiv|归档/i.test(reason)
        ? '助手会话已归档，归档会话拒跑模型：在 DSH 里取消归档后重发。'
        : '点「重新发给助手」重试；也可以在 DSH 对话区手动让助手继续这场面试。'
    try {
      await this.appendTurn(sessionId, {
        role: 'system',
        text: `派活失败：${reason}`,
        meta: { dispatch: { ...dispatch, ok: false, error: reason, hint, at: Date.now() } },
      })
    } catch { /* 连留痕都失败时只能吞下——绝不把二次错误抛回主流程 */ }
    return { ok: false, error: reason, hint }
  }

  /**
   * 异步派活：**HTTP 响应先返回，prompt 后发**（TURN-TAKING §5.1）。
   *
   * 面板点「开始面试」/提交回答要立刻得到响应，不能等宿主排队；
   * 派活失败走 system 行 + 重发按钮，不影响主流程。
   */
  fireAgentDispatch(sessionId, dispatch) {
    const promise = Promise.resolve()
      .then(() => this.dispatchAgentPrompt(sessionId, dispatch))
      .catch(error => this.noteAgentDispatchFailure(sessionId, dispatch, error))
    // 测试与诊断可以等这条 promise；业务调用方永远不等它。
    this.lastDispatch = promise
    return promise
  }

  /**
   * 把最近一次**没被补发成功**的派活重新发给助手（面板「重新发给助手」）。
   *
   * 用原 requestId 重发：宿主按 requestId 去重——上一次若其实已入队，
   * 这次直接返回原接受结果，不会让助手跑两遍。
   *
   * @param {string} sessionId
   */
  async retryAgentDispatch(sessionId) {
    const transcript = await this.getTranscript(sessionId)
    const resolved = new Set()
    let pending
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const row = transcript[index]
      const dispatch = row.role === 'system' && row.meta !== undefined && typeof row.meta === 'object'
        ? row.meta.dispatch
        : undefined
      if (dispatch === undefined || typeof dispatch?.requestId !== 'string') continue
      if (dispatch.ok === true) {
        resolved.add(dispatch.requestId)
        continue
      }
      if (dispatch.ok === false && pending === undefined && !resolved.has(dispatch.requestId)) {
        pending = dispatch
      }
    }
    if (pending === undefined) return { retried: false, reason: '没有待重发的派活。' }
    const dispatch = {
      kind: typeof pending.kind === 'string' ? pending.kind : 'continue',
      requestId: pending.requestId,
      text: String(pending.text ?? ''),
    }
    if (dispatch.text === '') {
      return { retried: false, reason: '这条失败留痕没带原文，无法重发；请在 DSH 对话区手动让助手继续。' }
    }
    // 这里让错误直接抛给调用方（HTTP 400 带原因）——用户显式点的按钮，
    // 要同步看到结果，而不是又一条慢慢轮询出来的 system 行。
    const result = await this.dispatchAgentPrompt(sessionId, dispatch)
    await this.appendTurn(sessionId, {
      role: 'system',
      text: '已重新发给助手。',
      meta: { dispatch: { kind: dispatch.kind, requestId: dispatch.requestId, ok: true, at: Date.now() } },
    })
    return { retried: true, ...result }
  }

  /**
   * 开场派活（TURN-TAKING §5.1）：`startSession` 成功后联动。
   *
   * @param {string} sessionId
   * @param {{requestId?: string}} [options]
   */
  async requestAgentStart(sessionId, options = {}) {
    return this.dispatchAgentPrompt(sessionId, {
      kind: 'start',
      requestId: typeof options.requestId === 'string' ? options.requestId : `start-${sessionId}`,
      text: agentStartPrompt(sessionId),
    })
  }

  /**
   * 「候选人答完了，请继续」派活：`appendTurn`（面板提交）联动，
   * 也可由 interview_request_agent task=continue 手动触发。
   *
   * **回答原文直接内联进 prompt**：助手不用先跑一趟 interview_get_context
   * 才知道候选人说了什么——省一个工具往返 ≈ 省 2–5s 首响。context 对齐
   * 仍然要做（技能纪律），但那是为了清单/语流，不是为了「听见回答」。
   *
   * @param {string} sessionId
   * @param {{ts?: number, text?: string}} [turn] 省略时取转录里最后一条 candidate
   * @param {{requestId?: string}} [options]
   */
  async requestAgentContinue(sessionId, turn = undefined, options = {}) {
    let row = turn !== undefined && turn !== null ? turn : undefined
    if (row === undefined) {
      const transcript = await this.getTranscript(sessionId)
      for (let index = transcript.length - 1; index >= 0; index -= 1) {
        if (transcript[index].role === 'candidate') {
          row = transcript[index]
          break
        }
      }
    }
    if (row === undefined) throw new Error('转录里还没有候选人回答，没有可「继续」的一轮')
    return this.dispatchAgentPrompt(sessionId, {
      kind: 'continue',
      requestId: typeof options.requestId === 'string'
        ? options.requestId
        : `continue-${sessionId}-${Number.isFinite(row.ts) ? row.ts : Date.now()}`,
      text: agentContinuePrompt(sessionId, String(row.text ?? '')),
    })
  }

  /**
   * 暂停后继续的派活：`resumeSession` 成功后联动。
   *
   * 宿主会话持久化把最难的一半免费送掉了：冷会话被 prompt 唤醒时历史
   * 完整重建（§6.5）——恢复 = 向存好的会话发一条 resume prompt，
   * 不存在「导出/导入会话」这种伪需求。
   *
   * @param {string} sessionId
   * @param {{pausedMinutes?: number, pausedAt?: number, requestId?: string}} [options]
   */
  async requestAgentResume(sessionId, options = {}) {
    const at = Number.isFinite(options.pausedAt) ? options.pausedAt : Date.now()
    return this.dispatchAgentPrompt(sessionId, {
      kind: 'resume',
      requestId: typeof options.requestId === 'string' ? options.requestId : `resume-${sessionId}-${at}`,
      text: agentResumePrompt(sessionId, options.pausedMinutes),
    })
  }

  /**
   * 长沉默派活（§3.3）：插件只**报告事实**（沉默了约 N 秒），
   * 说什么、怎么换切口由模型按 interview-conduct 的既有策略决定——
   * 这不违反「插件不写话术」。
   *
   * @param {string} sessionId
   * @param {number} seconds
   */
  async requestAgentSilence(sessionId, seconds = 0) {
    const secs = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
    return this.dispatchAgentPrompt(sessionId, {
      kind: 'silence',
      requestId: `silence-${sessionId}-${Date.now()}`,
      text: agentSilencePrompt(sessionId, secs),
    })
  }

  /**
   * Hand a JD link to the host's assistant and let **it** fetch the page.
   *
   * **发到哪里由我们决定：** 默认发到**这一场面试专属**的助手会话——和
   * 「出底稿」是同一个（AGENTS §6.14）。只有调用方明确给了 hostSessionId
   * 才用那个对话，并在返回里说清楚（explicit: true）。
   *
   * @param {string} sessionId the interview session the JD belongs to
   * @param {string} url
   * @param {string} [hostSessionId] which host conversation to use
   */
  async requestAgentJd(sessionId, url, hostSessionId = undefined) {
    const target = String(url ?? '').trim()
    if (target === '') throw new Error('没给链接')
    const requestId = `jd-${sessionId}-${Date.now()}`
    const text = [
      `请帮我抓取这个岗位 JD：${target}`,
      '用浏览器打开它（这个页面可能需要登录或前端渲染），把岗位描述的正文完整抄下来，',
      `然后调用 interview_save_jd 工具，把正文写入面试会话 ${sessionId}（url 填 ${target}）。`,
      '写完之后再调用 interview_get_context 确认已落盘。如果实在拿不到正文，如实说明卡在哪一步。',
    ].join('\n')
    const result = await this.dispatchAgentPrompt(sessionId, { kind: 'jd', requestId, text, hostSessionId })
    await this.recordAgentTask(sessionId, 'jd', { requestId, url: target })
    return result
  }

  /**
   * 让助手产出「面试官底稿」（考点清单）。
   *
   * 底稿由模型写，插件只负责派活与落盘（interview_save_checklist）。
   * 没有这个动作时，用户填完简历和 JD 就卡住了——面板必须给出下一步。
   *
   * **和「拉 JD」共用同一个助手会话**：同一个岗位的调研是同一段对话，
   * 助手在出底稿时还看得到它刚抄回来的 JD 与当时的判断。
   *
   * @param {string} sessionId
   * @param {string} [hostSessionId]
   */
  async requestAgentChecklist(sessionId, hostSessionId = undefined) {
    const requestId = `checklist-${sessionId}-${Date.now()}`
    const text = [
      `请为面试会话 ${sessionId} 出一份「面试官底稿」（考点清单）。`,
      '1. 先调用 interview_get_context 读简历、JD 与已有清单；',
      '2. 按 JD 要求与候选人经历映射出考点，分 core / deep / bonus 三档，每项写清 source（jd/resume/research）与 why；',
      '3. 调用 interview_save_checklist 写入这场面试（items 数组）。',
      '如果简历或 JD 还缺，就别编造，直接说明缺哪一份。',
    ].join('\n')
    const result = await this.dispatchAgentPrompt(sessionId, { kind: 'checklist', requestId, text, hostSessionId })
    await this.recordAgentTask(sessionId, 'checklist', { requestId })
    return result
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
    const requestId = `report-${sessionId}-${Date.now()}`
    const text = [
      `请为面试会话 ${sessionId} 写一份事后分析报告。`,
      '1. 先调用 interview_get_context 读简历、JD、考点清单、转录与统计；',
      '2. 按「结构 / 深度 / 表达 / 与岗位要求的匹配」等维度写 Markdown，每个判断都要能指回某轮回答；',
      '3. 数据不足就如实写「样本不足」，不要编造没发生过的对话；',
      '4. 最后调用 interview_finish，把整篇报告写进 report 字段。',
    ].join('\n')
    const result = await this.dispatchAgentPrompt(sessionId, { kind: 'report', requestId, text, hostSessionId })
    await this.recordAgentTask(sessionId, 'report', { requestId })
    return result
  }

  // ── 「等助手返回」的任务状态（loading 的唯一真源）──────────────────────

  /**
   * 记下「这件事已经派给助手了」。
   *
   * **写记录失败不挡派活**：记录只影响 loading 文案与失败判定，派活本身
   * 已经发出去了——为了日志把主流程弄失败是本末倒置。
   *
   * @param {string} sessionId
   * @param {'jd'|'checklist'|'report'} kind
   * @param {{requestId?: string, url?: string}} [extra]
   */
  async recordAgentTask(sessionId, kind, extra = {}) {
    if (!AGENT_TASK_KINDS.includes(kind)) return
    try {
      const dir = await this.sessionDir(sessionId)
      const meta = await readJsonIfExists(join(dir, 'session.json'))
      if (meta === undefined) return
      const at = Date.now()
      const tasks = meta.agentTasks !== null && typeof meta.agentTasks === 'object' ? meta.agentTasks : {}
      meta.agentTasks = {
        ...tasks,
        [kind]: {
          kind,
          at,
          requestId: typeof extra.requestId === 'string' ? extra.requestId : '',
          ...(typeof extra.url === 'string' && extra.url !== '' ? { url: extra.url } : {}),
        },
      }
      meta.updatedAt = at
      await writeJsonAtomic(join(dir, 'session.json'), meta)
    } catch { /* 记录丢了只影响 loading 文案 */ }
  }

  /**
   * 对应产物落盘了 → 这件「等人」的事结束了。
   *
   * @param {string} sessionId
   * @param {'jd'|'checklist'|'report'} kind
   */
  async clearAgentTask(sessionId, kind) {
    if (!AGENT_TASK_KINDS.includes(kind)) return
    try {
      const dir = await this.sessionDir(sessionId)
      const meta = await readJsonIfExists(join(dir, 'session.json'))
      if (meta === undefined) return
      const tasks = meta.agentTasks
      if (tasks === null || typeof tasks !== 'object' || tasks[kind] === undefined) return
      delete tasks[kind]
      if (Object.keys(tasks).length === 0) delete meta.agentTasks
      meta.updatedAt = Date.now()
      await writeJsonAtomic(join(dir, 'session.json'), meta)
    } catch { /* 同 recordAgentTask：清不掉只影响文案 */ }
  }

  /**
   * 用户选择「忽略」这条失败提示。
   *
   * @param {string} sessionId
   * @param {string} kind
   */
  async dismissAgentTask(sessionId, kind) {
    if (!AGENT_TASK_KINDS.includes(kind)) throw new Error(`未知的助手任务：${kind}`)
    await this.clearAgentTask(sessionId, kind)
    return { dismissed: true, kind }
  }

  /**
   * 现在有哪些「等助手」的任务、各自等到哪一步。
   *
   * 判定只认三件事：**宿主会话在不在跑**、**跑完有没有写回**、**等多久了**。
   * 任何一条都不能给出 endless waiting：
   *
   * @param {object} meta session.json 的内容（含 agentTasks / agentSessionId）
   * @returns {Promise<Record<string, object>>}
   */
  async agentTaskStatus(meta) {
    const recorded = meta?.agentTasks
    if (recorded === null || typeof recorded !== 'object') return {}
    const now = Date.now()
    const host = await this.hostAgentState(meta.agentSessionId)
    const tasks = {}
    for (const kind of AGENT_TASK_KINDS) {
      const raw = recorded[kind]
      if (raw === null || typeof raw !== 'object') continue
      const at = Number.isFinite(raw.at) ? raw.at : 0
      const age = Math.max(0, now - at)
      const deadline = AGENT_TASK_DEADLINE_MS[kind] ?? 10 * 60 * 1000
      const base = {
        kind,
        at,
        requestId: typeof raw.requestId === 'string' ? raw.requestId : '',
        ...(typeof raw.url === 'string' && raw.url !== '' ? { url: raw.url } : {}),
      }
      if (host.phase === 'gone') {
        tasks[kind] = {
          ...base,
          status: 'failed',
          reason: '助手会话不见了（可能被删除或归档）',
          hint: '再派一次会自动重建助手会话；也可以直接在 DSH 对话区让它继续。',
        }
        continue
      }
      if (host.phase === 'blocked') {
        // **这一步最容易被当成"还在跑"。** 助手在自己的对话里弹了确认/提问，
        // turn 一直开着，`running` 永远为真——但这件事**不可能自己推进**，
        // 必须有人去 DSH 对话区回答。继续转圈就是假活。
        // 先于超时判定：等人比「等太久」更具体，指路也更准。
        tasks[kind] = {
          ...base,
          status: 'failed',
          reason: host.blocked === 'approval'
            ? '助手在等你批准一个操作，这件事没有进展'
            : host.blocked === 'question'
              ? '助手在问你一个问题，这件事没有进展'
              : '助手在等你处理一条确认，这件事没有进展',
          hint: '去 DSH 对话区回答助手（或批准/拒绝那条操作），再点重试；也可以直接手动完成这件事。',
        }
        continue
      }
      if (age > deadline) {
        tasks[kind] = {
          ...base,
          status: 'failed',
          reason: `等了 ${Math.round(deadline / 60000)} 分钟还没有结果`,
          hint: AGENT_TASK_FAILURE[kind].hint,
        }
        continue
      }
      if (host.phase === 'settled' && age > AGENT_TASK_GRACE_MS) {
        tasks[kind] = { ...base, status: 'failed', reason: AGENT_TASK_FAILURE[kind].reason, hint: AGENT_TASK_FAILURE[kind].hint }
        continue
      }
      tasks[kind] = { ...base, status: 'waiting' }
    }
    return tasks
  }

  /**
   * 宿主助手会话在干什么：`running` / `blocked` / `settled` / `gone` / `unknown`。
   *
   * `blocked` = 宿主会话在等**人**（审批 / 提问 / 其他确认）——turn 开着，
   * 但在用户处理之前不会有任何进展，不能算「还在跑」。
   * `unknown` 不是失败——老宿主没有 `state()` 接口时，**超时**仍然是终点。
   * 这里绝不把「读不到」当成「在跑」来续命。
   *
   * @param {string} agentSessionId
   * @returns {Promise<{phase: 'running'|'blocked'|'settled'|'gone'|'unknown', blocked?: string}>}
   */
  async hostAgentState(agentSessionId) {
    const id = typeof agentSessionId === 'string' ? agentSessionId.trim() : ''
    if (id === '') return { phase: 'unknown' }
    const controller = this.ctx?.get?.('sessionController')
    if (controller === undefined || controller === null || typeof controller.state !== 'function') return { phase: 'unknown' }
    try {
      const state = await controller.state({ sessionId: id }, new AbortController().signal)
      if (state === null || state === undefined || typeof state !== 'object') return { phase: 'unknown' }
      // 等人在对话区处理（审批 / ask_user_question）。**先判这个**：
      // 这种 turn 的 `running` 会一直是 true，按 running 处理就永远转圈。
      const pendingInput = Array.isArray(state.pendingInput)
        ? state.pendingInput.filter(item => typeof item === 'string')
        : []
      if (pendingInput.length > 0) return { phase: 'blocked', blocked: pendingInput[0] }
      const queue = Array.isArray(state.queue) ? state.queue : []
      if (state.running === true || queue.length > 0) return { phase: 'running' }
      return { phase: 'settled' }
    } catch (error) {
      return { phase: isAgentSessionGone(error) ? 'gone' : 'unknown' }
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
    // 底稿落盘 = 这次「等助手出底稿」有结果了。
    if (normalized.length > 0) await this.clearAgentTask(sessionId, 'checklist')
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
        if (op.level !== undefined) target.level = normalizeChecklistLevel(op.level)
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

    // ── 联动：候选人答完 → 唤醒助手出下一题（docs/TURN-TAKING.md §5.1）──
    //
    // **只认 `meta.source === 'panel'` 的 candidate 行。** 助手自己调
    // interview_record_turn 记录的回答不能再触发「请继续」派活——它正在
    // 自己的 turn 里往下走，再排一条队等于自己给自己派活，甚至自触发成环。
    // 面板提交（手动点发送或自动提交）是唯一的「候选人答完了」事件源；
    // 且**开关只管自动判定，不管派活**：manual 模式下手动发送同样走到这里。
    //
    // 派活异步发出：HTTP 先返回（面板立刻「回答已记录」），失败走
    // system 行 + 「重新发给助手」按钮（§4.4），不影响本次响应。
    if (role === 'candidate' && meta.source === 'panel') {
      const current = await readJsonIfExists(join(dir, 'session.json'))
      if (current !== undefined && current.status === SESSION_STATUS.RUNNING) {
        this.fireAgentDispatch(sessionId, {
          kind: 'continue',
          requestId: `continue-${sessionId}-${row.ts}`,
          text: agentContinuePrompt(sessionId, text),
        })
      }
    }
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
    // 报告落盘 = 这次「等助手写报告」有结果了（空报告不算结果）。
    if (String(markdown ?? '').trim() !== '') await this.clearAgentTask(sessionId, 'report')
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
    // 「等助手」的任务状态：**必须有终点**（见 AGENT_TASK_DEADLINE_MS）。
    // 它也会进 revision：超时从 waiting 翻成 failed 是**时间驱动**的，
    // 文件 mtime 不会变——不把它算进指纹，面板就会永远转圈。
    const agentTasks = await this.agentTaskStatus(meta)
    const taskSignature = AGENT_TASK_KINDS
      .filter(kind => agentTasks[kind] !== undefined)
      .map(kind => `${kind}:${agentTasks[kind].status}`)
      .join(',')
    const revision = `${await this.revisionOf(meta.dir)}|agent:${taskSignature}`
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
        // 暂停/继续（docs/TURN-TAKING.md §6.2）：pausedAt>0 = 正在暂停中；
        // pausedMs 是累计暂停时长（计时公式要扣掉它）。
        pausedAt: Number.isFinite(meta.pausedAt) ? meta.pausedAt : 0,
        pausedMs: Number.isFinite(meta.pausedMs) ? meta.pausedMs : 0,
        // 这一场专属的宿主助手会话（派活寻址用；空 = 还没建过）。
        agentSessionId: typeof meta.agentSessionId === 'string' ? meta.agentSessionId : '',
        // 助手会话的**可溯源摘要**（AGENTS §6.14）：最近的派活发到了哪个
        // 宿主对话、有没有重建过。面板据此显示「这场面试的助手在哪」，
        // 用户不必去 DSH 会话列表里猜。
        agent: summarizeAgentLog(meta.agentLog, meta.agentSessionId),
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
      // 等助手返回的任务（抓 JD / 出底稿 / 写报告）：面板据此显示 loading，
      // **loading 一定有终点**——成功即消失，失败带 reason + hint（AGENTS §7）。
      agentTasks,
      // 语流：整场面试的表达习惯观察（停顿 / 语速 / 口头语 …）。
      // **不是评分**，是观察值；报告与面试官都读它，但不许念给候选人听。
      fluency: summarizeFluency(transcript),
      stats: {
        asked,
        answered,
        // 计时公式**必须扣 pausedMs**（docs/TURN-TAKING.md §6.2）：不扣就会把
        // 「暂停两小时」算进面试时长，报告与 tooShortForReport(<3min) 判断全歪。
        // 没开始过的场次是 0 秒——`updatedAt` 是「最后一次改动」，不是「面了多久」。
        durationMs: computeDurationMs(meta),
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
 * 归一化考点档位：`core` / `deep` / `bonus`，不认识的一律落到 `core`。
 *
 * **必须按「值」判断，不能按「键」判断。** `CHECKLIST_LEVEL` 是
 * `{ CORE: 'core', DEEP: 'deep', BONUS: 'bonus' }`——用 `CHECKLIST_LEVEL[值]`
 * 去查的话，`CHECKLIST_LEVEL['deep']` 是 `undefined`，助手写进来的
 * `deep` / `bonus` 会被**静默压成 core**，底稿的三档分级整个失效
 * （面板、报告、`probed` 统计都跟着看不出重点）。
 *
 * @param {unknown} value
 */
function normalizeChecklistLevel(value) {
  const text = String(value ?? '').trim().toLowerCase()
  return Object.values(CHECKLIST_LEVEL).includes(text) ? text : CHECKLIST_LEVEL.CORE
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
  const level = normalizeChecklistLevel(item.level)
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

// ── 派活 prompt（docs/TURN-TAKING.md §5.1） ────────────────────────────────
//
// 这些是**系统级调度指令**，不是话术：插件不写面试题、不写开场白（§5 硬
// 边界）——说什么由模型按 interview-conduct 技能生成。每条都以「[系统派活]」
// 开头并明令不要朗读，避免助手把调度指令念给候选人。

/** 开场派活的 prompt 正文。 */
function agentStartPrompt(sessionId) {
  return [
    `[系统派活] 面试会话 ${sessionId} 已开始，你现在是面试官。`,
    '1. 调用 interview_get_context 读简历、JD 与考点清单；',
    '2. 按 interview-conduct 技能「阶段 0」开场：说明这是模拟面试，然后请候选人自我介绍；',
    '3. 开场白与第一问各用 interview_record_turn(role:interviewer) 记录；',
    '4. 一次只问一个问题，等候选人回答完再继续。',
    '本条是调度指令：不要把这条消息或本指令朗读给候选人。',
  ].join('\n')
}

/** 「候选人答完了，请继续」派活的 prompt 正文（回答原文内联，省一次 context 往返）。 */
function agentContinuePrompt(sessionId, answer) {
  const quoted = answer.length > 4000 ? `${answer.slice(0, 4000)}……（已截断，全文在转录里）` : answer
  return [
    `[系统派活] 面试会话 ${sessionId}：候选人刚回答完（已写入转录）：`,
    `「「${quoted}」」`,
    '1. 调用 interview_get_context 对齐清单进度与转录；',
    '2. 先用一句话自然承接这个回答，再决定追问还是下一题——一次只问一个；',
    '3. 用 interview_record_turn(role:interviewer) 记录你这一问；',
    '4. 回答暴露出清单要调整时，用 interview_mutate_checklist 并写 reason。',
    '本条是调度指令：不要把这条消息或本指令朗读给候选人。',
  ].join('\n')
}

/** 暂停后继续 / 续接一场已结束的面试：派活的 prompt 正文。 */
function agentResumePrompt(sessionId, pausedMinutes, options = {}) {
  const minutes = Number.isFinite(pausedMinutes) ? Math.max(0, Math.round(pausedMinutes)) : 0
  // 续接（done → running）与暂停后继续（paused → running）是两种不同的情形：
  // 前者中间**已经结束过一轮**（可能生成了报告、也可能只是被临时掐断），
  // 所以要说清「接着上一轮」，不要让助手把它当成「重新开场」。
  const continued = options.continued === true
  return [
    continued
      ? `[系统派活] 面试会话 ${sessionId} 续接：这场面试中断约 ${minutes} 分钟后接着进行（转录与清单都在）。`
      : `[系统派活] 面试会话 ${sessionId} 在暂停约 ${minutes} 分钟后继续。`,
    '1. 调用 interview_get_context 重新对齐（清单进度与转录最后几轮）；',
    continued
      ? '2. **接着中断处继续**：不要重新自我介绍、不要重新开场；上一问没答完就复述或换个更清楚的说法，答完了就进入下一轮；'
      : '2. 依据转录续接：上一问还没答完就复述或换个更清楚的说法；已经答完就自然过渡到下一轮；',
    '3. 一次只问一个问题，用 interview_record_turn(role:interviewer) 记录。',
    '本条是调度指令：不要把这条消息或本指令朗读给候选人。',
  ].join('\n')
}

/** 长沉默派活的 prompt 正文（只报告事实，怎么重问由模型决定）。 */
function agentSilencePrompt(sessionId, seconds) {
  return [
    `[系统派活] 面试会话 ${sessionId}：候选人已沉默约 ${seconds} 秒。`,
    '这是系统观察到的事实，不是候选人输入，不要把它记成回答。',
    '调用 interview_get_context 看最后一问，按 interview-conduct 的沉默策略处理：',
    '换一个更小的切口或把问题说得更清楚，一次只问一个，并用 interview_record_turn(role:interviewer) 记录。',
  ].join('\n')
}

/**
 * prompt 失败是不是「存的助手会话已经没了」（被删/不存在）。
 *
 * 只有这一种失败值得**自动重建重试**；writer-held / 归档等属于「会话还在
 * 但跑不了」，重建只会制造第二个会话——那些走留痕 + 重发按钮的出路。
 *
 * @param {unknown} error
 */
function isAgentSessionGone(error) {
  const code = String(error?.code ?? '')
  if (/not-?found/i.test(code)) return true
  const message = error && error.message ? error.message : String(error ?? '')
  return /session\/not-?found|session not found|会话不存在|找不到会话|no such session/i.test(message)
}

/**
 * 把一段时长说成人话：`45 秒` / `12 分钟`。
 *
 * 转录里的 system 行是**给人事后复盘**看的：只断了 2 秒却写「中断 1 分钟」，
 * 时间线会对不上（原来的 `Math.max(1, 分钟)` 就是这个毛病）。
 *
 * @param {unknown} ms
 */
function describeGap(ms) {
  const value = Number.isFinite(ms) ? Math.max(0, ms) : 0
  if (value < 60 * 1000) return `${Math.max(1, Math.round(value / 1000))} 秒`
  if (value < 60 * 60 * 1000) return `${Math.round(value / 60000)} 分钟`
  const hours = Math.floor(value / 3600000)
  const minutes = Math.round((value % 3600000) / 60000)
  return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分钟`
}

/**
 * 面试时长：**只算真正在面的时间**（docs/TURN-TAKING.md §6.2）。
 *
 * `(结束时刻或最后改动) - 开始时刻 - 累计暂停`。三个坑都在这里：
 *
 *  - 没开始过（`startedAt` 缺失）= 0 秒。拿 `updatedAt` 顶替开始时刻，
 *    准备页/舞台的计时会显示「这场面试已经 3 小时」——那只是简历改了三次；
 *  - 暂停要扣掉，否则「暂停两小时」会进报告，`tooShortForReport` 也跟着歪；
 *  - 重开场次会把 `endedAt` 清成 0（0 = 没有值），所以用 `||` 而不是 `??`。
 *
 * @param {object} meta session.json 的内容
 */
function computeDurationMs(meta) {
  const startedAt = Number.isFinite(meta?.startedAt) && meta.startedAt > 0 ? meta.startedAt : 0
  if (startedAt === 0) return 0
  const end = meta.endedAt || meta.updatedAt || 0
  const paused = Number.isFinite(meta.pausedMs) ? meta.pausedMs : 0
  return Math.max(0, end - startedAt - paused)
}

/**
 * 把助手会话账本压成面板要的那几项。
 *
 * 只回**能回答问题**的部分：现在用哪个宿主会话、它是不是新建的、
 * 最近的派活发到了哪里、中途重建过几次。完整账本留在 session.json。
 *
 * @param {unknown} log session.json 里的 agentLog
 * @param {unknown} currentId 当前的 agentSessionId
 */
function summarizeAgentLog(log, currentId) {
  const entries = Array.isArray(log) ? log.filter(item => item !== null && typeof item === 'object') : []
  const current = typeof currentId === 'string' ? currentId.trim() : ''
  const opened = entries.find(entry => entry.event === 'open')
  const dispatches = entries
    .filter(entry => entry.event === 'dispatch')
    .slice(-6)
    .map(entry => ({
      at: Number.isFinite(entry.at) ? entry.at : 0,
      kind: typeof entry.kind === 'string' ? entry.kind : '',
      requestId: typeof entry.requestId === 'string' ? entry.requestId : '',
      explicit: entry.explicit === true,
    }))
  return {
    sessionId: current,
    // 这个会话是什么时候开的（0 = 账本里没有 / 老场次）。
    createdAt: opened !== undefined && Number.isFinite(opened.at) ? opened.at : 0,
    workspaceId: opened !== undefined && typeof opened.workspaceId === 'string' ? opened.workspaceId : '',
    // 中途换过几次宿主会话（重建 / 解绑）。
    rebuilds: entries.filter(entry => entry.event === 'clear').length,
    dispatches,
    lastDispatchAt: dispatches.length > 0 ? dispatches[dispatches.length - 1].at : 0,
  }
}

/** The absolute workspace root in force, for display. */
export async function workspaceRootOf(service) {
  return resolve(await service.effectiveRoot())
}