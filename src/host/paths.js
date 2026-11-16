/**
 * Plugin paths and resolved configuration.
 *
 * The plugin ships in two states:
 *
 *   src/skills/    Skill 源码（开发中的 Skill 永远不被 agent 调到）
 *   build/skills/  通过校验的 Skill（运行时唯一可见）
 *
 * `scripts/build.mjs` generates `build/`; when it is missing the runtime says so
 * out loud instead of silently serving nothing.
 *
 * **一个总根，一场面试一个子目录。**
 *
 * 插件的所有数据集中在一个**工作区根**下（用户通常会指到 D 盘这类大盘），
 * 根下面是：
 *
 *   <root>/workspaces/<session-id>/   一场面试 = 一个子目录
 *   <root>/profiles/<profile-id>/     岗位档案
 *
 * **不要散落。** 散落的会话目录是治理灾难：谁也说不清哪份是最新的、
 * 哪场面试属于哪个岗位。根目录由 `workspaceRoot` 决定，留空则自动
 * （用户主目录下的 `DSH-REALTIME-INTERVIEW`）。
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path of the package root (one level above `src/host/`). */
export const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Release-state skill directory (`build/skills`) — the only skill root the runtime serves. */
export const SKILL_DIR = join(PACKAGE_DIR, 'build', 'skills')

/** The route prefix the plugin owns. */
export const API_PREFIX = '/interviewer'

/** The Windows system drive, normally `C:`. */
function systemDrive() {
  const value = process.env.SystemDrive
  const trimmed = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]:$/.test(trimmed) ? trimmed : 'C:'
}

/**
 * The default workspace root.
 *
 * **Windows 上优先选非系统盘。**
 *
 * 为什么：系统盘（C:）装的是系统和用户目录，用户的家目录就在里面——
 * 把几十 MB 的简历、JD、录像、录音塞进家目录，是**迟早要清**的东西：
 * 重装系统会丢，备份会拖垮，「C 盘又满了」第一个想到的就是它。
 * 大盘（D:、E:…）才是这些数据该待的地方。
 *
 * 所以规则很简单：**有非系统盘就用它，没有才退回家目录。**
 * 这个判断只在这里做一次，界面显示的「为什么是这个目录」也从这里来。
 *
 * @returns {string}
 */
export function defaultWorkspaceRoot() {
  if (process.platform === 'win32') {
    const system = systemDrive()
    for (let code = 66; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:`
      if (drive === system) continue
      if (existsSync(`${drive}\\`)) return join(`${drive}\\`, 'DSH-REALTIME-INTERVIEW')
    }
  }
  return join(homedir(), 'DSH-REALTIME-INTERVIEW')
}

/**
 * Why the default root is where it is — in words the panel can show.
 *
 * **界面必须能回答「为什么是这个目录」。** 一个说不清来源的数据目录，
 * 用户迟早会怀疑数据存到了别处。
 *
 * @param {string} [root] the resolved default root
 * @returns {string}
 */
export function defaultWorkspaceRootReason(root = defaultWorkspaceRoot()) {
  if (process.platform === 'win32' && !root.toUpperCase().startsWith(`${systemDrive()}\\`)) {
    const drive = root.slice(0, 2)
    return `默认工作区根（${root}：优先选非系统盘，${systemDrive()} 盘装的是系统和用户目录）。`
      + '面板顶部的「浏览…」可以改到别的位置。'
  }
  return `默认工作区根（用户主目录下的 DSH-REALTIME-INTERVIEW：这台机器上没有别的可用盘）。`
    + '面板顶部的「浏览…」可以改到别的位置。'
}

/** The plugin's own settings file: where the panel-entered choices live. */
export function settingsPath() {
  const profileDir = process.env.DSH_PROFILE_DIR
  if (typeof profileDir === 'string' && profileDir.trim() !== '') {
    return join(profileDir.trim(), 'dsh-realtime-interview.json')
  }
  const home = (process.env.DSH_HOME ?? '').trim() !== ''
    ? process.env.DSH_HOME.trim()
    : join(homedir(), '.dsh')
  const profile = (process.env.DSH_PROFILE ?? '').trim()
  if (profile !== '') return join(home, 'profiles', profile, 'dsh-realtime-interview.json')
  return join(home, 'dsh-realtime-interview', 'settings.json')
}

/**
 * Read the plugin's own settings.
 *
 * **读不到就是没有设置。** 一个坏掉的设置文件不该让插件起不来——
 * 它只是「用户还没选过位置」而已。
 *
 * @returns {Promise<{workspaceRoot?: string}>}
 */
export async function readSettings() {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return {}
    const root = parsed.workspaceRoot
    return typeof root === 'string' && root.trim() !== '' ? { workspaceRoot: root.trim() } : {}
  } catch {
    return {}
  }
}

/**
 * Merge values into the plugin's settings file.
 *
 * **原子写。** 写到一半断电会留下半个 JSON，下次启动就再也读不出设置了——
 * 这种事不能发生在一个「用户只想换个目录」的操作上。
 *
 * @param {object} patch
 * @returns {Promise<{path: string, workspaceRoot?: string}>}
 */
export async function writeSettings(patch) {
  const current = await readSettings()
  const next = { ...current, ...patch }
  const path = settingsPath()
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(next, undefined, 2)}\n`, 'utf8')
  await rename(temporary, path)
  return { path, ...next }
}

/**
 * Resolve the plugin configuration.
 *
 * Every field is restated in `cordis.patch.yml`; a later patch layer replaces
 * the whole `config` object, so nothing here may assume a value survived.
 *
 * @param {object} raw
 */
export function resolveConfig(raw) {
  const config = raw !== undefined && typeof raw === 'object' && raw !== null ? raw : {}
  const text = value => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined)
  const oneOf = (value, allowed, fallback) => {
    const candidate = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return allowed.includes(candidate) ? candidate : fallback
  }
  const number = (value, min, max, fallback) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
    return Math.min(max, Math.max(min, value))
  }
  const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback)

  return {
    // 工作区根：所有数据集中在这里（一场面试 = 一个子目录）。
    workspaceRoot: text(config.workspaceRoot) ?? text(config.dataRoot) ?? defaultWorkspaceRoot(),
    // 这个根是**用户指定的**，还是**默认值**？
    //
    // **为什么要单独记。** 界面必须能回答「为什么是这个目录」——用户没配过
    // 任何东西时，答案应该是「默认就在主目录下」，而不是「配置里指定的」。
    // 只看路径字符串分辨不出来（两个值可能一样），所以在这里就把来源记下来。
    workspaceRootExplicit: text(config.workspaceRoot) !== undefined || text(config.dataRoot) !== undefined,
    jdFetchTimeoutMs: number(config.jdFetchTimeoutMs, 1000, 120000, 15000),
    jdMaxChars: number(config.jdMaxChars, 500, 200000, 20000),
    asrProvider: oneOf(config.asrProvider, ['auto', 'browser', 'none'], 'auto'),
    ttsProvider: oneOf(config.ttsProvider, ['auto', 'browser', 'none'], 'auto'),
    // 服务端语音识别（可选）：填了 key 与 baseUrl 就用服务端，否则继承宿主，再否则回落浏览器。
    asrBaseUrl: text(config.asrBaseUrl) ?? '',
    asrApiKey: text(config.asrApiKey) ?? '',
    // 凭据引用（推荐）：走 DSH 的 credentials seam，密钥不进配置文件。
    asrApiKeyEnv: text(config.asrApiKeyEnv) ?? 'MINIMAX_API_KEY',
    asrModel: text(config.asrModel) ?? '',
    asrEndpoint: text(config.asrEndpoint) ?? '',
    asrLanguage: text(config.asrLanguage) ?? 'zh',
    ttsRate: number(config.ttsRate, 0.5, 2, 1),
    ttsVoice: text(config.ttsVoice) ?? '',
    recordVideo: flag(config.recordVideo, true),
    recordAudio: flag(config.recordAudio, true),
    // ffmpeg 的位置。留空 = 自动找（DSH_FFMPEG_PATH → PATH → 常见安装位置）。
    //
    // **为什么要有这个。** 摄像头是 Host 侧用 ffmpeg 采的（桌面端的 Electron
    // 权限闸门只放行纯音频，摄像头在主进程就被拒了）。而 ffmpeg **不是**
    // 系统自带的——别的机器上未必有，所以必须能指路径。
    ffmpegPath: text(config.ffmpegPath) ?? '',
  }
}

/**
 * Ensure the workspace root exists and return it.
 *
 * The root is created on first use, not at mount time: a plugin that fails to
 * mount because a directory could not be created is worse than a plugin that
 * reports the directory problem when it is actually used.
 *
 * @param {string} root
 * @returns {Promise<{path: string, created: boolean, error?: string}>}
 */
export async function ensureDataRoot(root) {
  const path = resolve(root)
  const existed = existsSync(path)
  try {
    await mkdir(join(path, 'workspaces'), { recursive: true })
    await mkdir(join(path, 'profiles'), { recursive: true })
    return { path, created: !existed }
  } catch (error) {
    return {
      path,
      created: false,
      error: `工作区根建不出来：${error && error.message ? error.message : String(error)}`,
    }
  }
}

/**
 * Describe the workspace root: where it is, why, and whether it works.
 *
 * **界面必须能回答「为什么是这个目录」。** 一个说不清来源的数据目录，
 * 用户迟早会怀疑数据存到了别处。
 *
 * 三个来源，优先级从高到低：
 *
 *   config   —— 配置文件里写死的（`cordis.patch.yml` 的 `workspaceRoot`）。
 *                手改配置是「明确到某一层」的意图，优先级最高。
 *   settings —— 用户在**面板里**用「浏览…」选过的。
 *   default  —— 谁都没选过时的自动选择（Windows 上优先非系统盘）。
 *
 * @param {string} configured the user's explicit value, if any
 * @param {boolean} [explicit] whether the user actually configured it;
 *   when omitted it is inferred from whether `configured` is non-empty
 * @param {string} [saved] the root the user picked in the panel
 * @returns {Promise<{path: string, source: string, reason: string, exists: boolean, error?: string}>}
 */
export async function describeWorkspaceRoot(configured, explicit = undefined, saved = undefined) {
  const fromConfig = explicit === undefined
    ? typeof configured === 'string' && configured.trim() !== ''
    : explicit === true
  if (fromConfig) {
    const path = resolve(configured.trim())
    const ensured = await ensureDataRoot(path)
    return {
      path,
      source: 'config',
      reason: '配置里指定的工作区根',
      exists: existsSync(path),
      ...(ensured.error !== undefined ? { error: ensured.error } : {}),
    }
  }
  if (typeof saved === 'string' && saved.trim() !== '') {
    const path = resolve(saved.trim())
    const ensured = await ensureDataRoot(path)
    return {
      path,
      source: 'settings',
      reason: '你在面板里选的工作区根',
      exists: existsSync(path),
      ...(ensured.error !== undefined ? { error: ensured.error } : {}),
    }
  }
  const path = defaultWorkspaceRoot()
  const ensured = await ensureDataRoot(path)
  return {
    path,
    source: 'default',
    reason: defaultWorkspaceRootReason(path),
    exists: existsSync(path),
    ...(ensured.error !== undefined ? { error: ensured.error } : {}),
  }
}
