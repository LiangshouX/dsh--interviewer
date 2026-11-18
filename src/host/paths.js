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
 * Which settings keys the panel may persist.
 *
 * **白名单，不是黑名单。** 这个文件是插件唯一会自己写的用户数据：
 * 多写一个键就等于多一个没人校验的输入口。所以只允许这几种。
 */
/**
 * 面板可以写、并且**真的会生效**的设置项，及其校验规则。
 *
 * **白名单 + 规格，不是黑名单。** 这个文件是插件唯一会自己写的用户数据：
 * 每多一个键，就多一个必须校验的输入口。kind 决定读/写时怎么规范化——
 * 枚举不在值域里、数字超范围、类型不对，一律**拒绝并说明原因**，
 * 而不是悄悄存下去。存了却不生效，比拒绝更糟。
 */
export const SETTING_SPECS = {
  workspaceRoot: { kind: 'path' },
  ffmpegPath: { kind: 'path' },
  chromiumPath: { kind: 'path' },
  // 语音识别
  asrProvider: { kind: 'enum', values: ['auto', 'host', 'browser', 'none', 'minimax', 'minimax-cn', 'openai', 'openai-custom'] },
  asrEndpoint: { kind: 'string' },
  asrBaseUrl: { kind: 'string' },
  asrModel: { kind: 'string' },
  asrApiKeyEnv: { kind: 'string' },
  asrGroupId: { kind: 'string' },
  asrLanguage: { kind: 'string' },
  // 语音合成
  ttsProvider: { kind: 'enum', values: ['auto', 'host', 'mimo', 'openai', 'minimax', 'minimax-cn', 'dashscope', 'baidu', 'edge', 'browser', 'none'] },
  ttsBaseUrl: { kind: 'string' },
  ttsApiKeyEnv: { kind: 'string' },
  ttsGroupId: { kind: 'string' },
  ttsModel: { kind: 'string' },
  ttsVoice: { kind: 'string' },
  ttsStyle: { kind: 'string' },
  ttsFormat: { kind: 'enum', values: ['mp3', 'wav'] },
  ttsRate: { kind: 'number', min: 0.5, max: 2 },
  // 摄像头：auto = ffmpeg 优先；chromium-mf = 浏览器采集优先
  cameraBackend: { kind: 'enum', values: ['auto', 'ffmpeg', 'chromium-mf'] },
  // 隐私：允许录像 / 允许录音（关掉 = 面板不出现对应录制入口）
  recordVideo: { kind: 'boolean' },
  recordAudio: { kind: 'boolean' },
  // 面试间保护
  guardEnabled: { kind: 'boolean' },
  guardQuiet: { kind: 'boolean' },
  // 话轮（docs/TURN-TAKING.md §4）：
  //   answerMode        自动/手动总开关。**只管「话轮结束判定 + 自动提交」**，
  //                     不管派活——manual 下手动发送同样唤醒助手。
  //                     默认 manual：与升级前行为一致，auto 的判定质量
  //                     依赖真实房间声学下的 VAD 表现，验证稳定前不默认开。
  //   turnEndSilenceMs  第二层静音阈值（450ms 的**转写分段**阈值不动，
  //                     这是**话轮结束**判定，仅 auto 生效）。
  answerMode: { kind: 'enum', values: ['manual', 'auto'] },
  turnEndSilenceMs: { kind: 'number', min: 800, max: 6000 },
  // 最近一次 create 用过的宿主助手会话。**已退役为诊断信息**：
  // 派活寻址改用 per-session 的 session.json.agentSessionId（§6.2），
  // 全局键撑不住「精确找回这一场的助手会话」的语义。
  agentSessionId: { kind: 'string' },
}

export const SETTING_KEYS = Object.keys(SETTING_SPECS)

/**
 * Normalize one setting value against its spec.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {{ok: true, value: string|number|boolean} | {ok: false, reason: string}}
 */
export function normalizeSetting(key, value) {
  const spec = SETTING_SPECS[key]
  if (spec === undefined) return { ok: false, reason: `未知设置项 ${key}` }
  if (spec.kind === 'boolean') {
    return typeof value === 'boolean' ? { ok: true, value } : { ok: false, reason: `${key} 必须是 true/false` }
  }
  if (spec.kind === 'number') {
    const number = typeof value === 'number' ? value : Number.NaN
    if (!Number.isFinite(number)) return { ok: false, reason: `${key} 必须是数字` }
    if (number < spec.min || number > spec.max) {
      return { ok: false, reason: `${key} 必须在 ${spec.min}–${spec.max} 之间` }
    }
    return { ok: true, value: number }
  }
  if (typeof value !== 'string') return { ok: false, reason: `${key} 必须是字符串` }
  const trimmed = value.trim()
  if (spec.kind === 'path') {
    // 路径允许清空（= 回到自动发现），但拒绝明显不是路径的值。
    if (trimmed === '') return { ok: true, value: '' }
    if (/[\r\n]/.test(trimmed)) return { ok: false, reason: `${key} 不是合法路径` }
    return { ok: true, value: trimmed }
  }
  if (spec.kind === 'enum') {
    const candidate = trimmed.toLowerCase()
    if (!spec.values.includes(candidate)) {
      return { ok: false, reason: `${key} 只能是 ${spec.values.join(' / ')}` }
    }
    return { ok: true, value: candidate }
  }
  // string：空串 = 用默认值
  return { ok: true, value: trimmed }
}

export async function readSettings() {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return {}
    const settings = {}
    for (const key of SETTING_KEYS) {
      if (!(key in parsed)) continue
      const normalized = normalizeSetting(key, parsed[key])
      if (normalized.ok) settings[key] = normalized.value
    }
    return settings
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
 * 发版补丁 `cordis.patch.yml` 里 `config:` 块的**默认值快照**。
 *
 * **为什么需要它（bug2 的根因）。** 发版补丁为了「后来的 patch 层整体替换 config
 * 时插件仍拿得到每个字段」，把**所有**键都 restated 了一遍（含 `ttsProvider:'auto'`
 * 这类默认值）。于是 `InterviewService` 收到的 rawConfig 里每个键都在，若按
 * 「键存在 = 用户显式写死」处理，面板设置就永远被这些默认值顶掉——用户改了播报
 * 服务却仍跑 auto→百度，正是这个原因。
 *
 * 所以「显式」的正确判据是：**值不同于发版默认值**（或键根本不在发版默认里）。
 * 等于默认值的键视为「没写」，面板设置可以压过它；用户在 profile 层真正改过的键
 * （值不同于默认）仍然压过面板，保住「配置文件 > 面板 > 默认」的语义。
 *
 * **维护纪律：这张表必须与 cordis.patch.yml 的 config 块保持一致。** 改了补丁
 * 默认值就要同步这里（tests/config-priority.test.js 会盯住行为）。
 */
export const BUNDLE_DEFAULTS = {
  workspaceRoot: '',
  jdFetchTimeoutMs: 15000,
  jdMaxChars: 20000,
  asrProvider: 'auto',
  asrBaseUrl: '',
  asrApiKey: '',
  asrApiKeyEnv: 'MINIMAX_API_KEY',
  asrModel: '',
  asrEndpoint: '',
  asrLanguage: 'zh',
  ttsProvider: 'auto',
  ttsBaseUrl: '',
  ttsApiKeyEnv: '',
  ttsApiKey: '',
  ttsModel: '',
  ttsVoice: '',
  ttsStyle: '',
  ttsReferenceAudio: '',
  ttsFormat: 'mp3',
  ttsRate: 1.0,
  recordVideo: true,
  recordAudio: true,
  answerMode: 'manual',
  turnEndSilenceMs: 2000,
  ffmpegPath: '',
  chromiumPath: '',
}

/**
 * 某个配置键值是否只是发版默认值（= 用户没显式写过，面板可覆盖）。
 * 键不在发版默认表里 → 视为用户额外写的（显式）。值都是基本类型，严格相等即可。
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBundleDefault(key, value) {
  return Object.prototype.hasOwnProperty.call(BUNDLE_DEFAULTS, key) && BUNDLE_DEFAULTS[key] === value
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
    // 语音识别：host（宿主 speechToText）> 服务端（插件自己直连）> 浏览器。
    asrProvider: oneOf(config.asrProvider, ['auto', 'host', 'browser', 'none', 'minimax', 'minimax-cn', 'openai', 'openai-custom'], 'auto'),
    // 服务端语音识别（回落链路）：填了 key 与 baseUrl 就用服务端，否则继承宿主，再否则回落浏览器。
    asrBaseUrl: text(config.asrBaseUrl) ?? '',
    asrApiKey: text(config.asrApiKey) ?? '',
    // 凭据引用（推荐）：走 DSH 的 credentials seam，密钥不进配置文件。
    // **默认留空**，由所选预设决定默认凭据名（OpenAI 兼容不会去找 MINIMAX_API_KEY）。
    asrApiKeyEnv: text(config.asrApiKeyEnv) ?? '',
    // MiniMax 部分账户要求 GroupId（查询参数）；留空 = 不带。
    asrGroupId: text(config.asrGroupId) ?? '',
    asrModel: text(config.asrModel) ?? '',
    asrEndpoint: text(config.asrEndpoint) ?? '',
    asrLanguage: text(config.asrLanguage) ?? 'zh',
    // 语音合成：宿主 > 按配置的模型（mimo/openai/minimax）> 免密钥自然音
    // （baidu/edge）> 浏览器。**默认不是机器音**：auto 会先找模型，再找
    // 免密钥的自然音，最后才用系统音色。
    ttsProvider: oneOf(config.ttsProvider, ['auto', 'host', 'mimo', 'openai', 'minimax', 'minimax-cn', 'dashscope', 'baidu', 'edge', 'browser', 'none'], 'auto'),
    ttsBaseUrl: text(config.ttsBaseUrl) ?? '',
    ttsApiKeyEnv: text(config.ttsApiKeyEnv) ?? '',
    ttsGroupId: text(config.ttsGroupId) ?? '',
    ttsApiKey: text(config.ttsApiKey) ?? '',
    ttsModel: text(config.ttsModel) ?? '',
    // 音色：mimo-v2.5-tts 用预置音色 id；voiceclone 时改由参考音频决定。
    ttsVoice: text(config.ttsVoice) ?? '',
    // 风格指令（自然语言）：MiMo 的 user 消息、minimax 的音色说明都可复用。
    ttsStyle: text(config.ttsStyle) ?? '',
    // 声音复刻用的本机样本（mp3 / wav，≤10 MB）。只在合成时读取，不外传文件。
    ttsReferenceAudio: text(config.ttsReferenceAudio) ?? '',
    ttsFormat: oneOf(config.ttsFormat, ['mp3', 'wav'], 'mp3'),
    ttsRate: number(config.ttsRate, 0.5, 2, 1),
    recordVideo: flag(config.recordVideo, true),
    recordAudio: flag(config.recordAudio, true),
    // 话轮（docs/TURN-TAKING.md §4）：默认 manual——升级不改变任何用户
    // 已适应的节奏；auto 稳定后翻默认只是一行改动。
    answerMode: oneOf(config.answerMode, ['manual', 'auto'], 'manual'),
    turnEndSilenceMs: number(config.turnEndSilenceMs, 800, 6000, 2000),
    // ffmpeg 的位置。留空 = 自动找（DSH_FFMPEG_PATH → PATH → 常见安装位置）。
    //
    // **为什么要有这个。** 摄像头是 Host 侧用 ffmpeg 采的（桌面端的 Electron
    // 权限闸门只放行纯音频，摄像头在主进程就被拒了）。而 ffmpeg **不是**
    // 系统自带的——别的机器上未必有，所以必须能指路径。
    ffmpegPath: text(config.ffmpegPath) ?? '',
    // 浏览器采集通道用的 Chromium（Chrome / Edge）路径；留空 = 自动发现。
    chromiumPath: text(config.chromiumPath) ?? '',
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
