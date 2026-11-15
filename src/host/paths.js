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
 * （用户主目录下的 `DSH-INTERVIEWER`）。
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute path of the package root (one level above `src/host/`). */
export const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Release-state skill directory (`build/skills`) — the only skill root the runtime serves. */
export const SKILL_DIR = join(PACKAGE_DIR, 'build', 'skills')

/** The route prefix the plugin owns. */
export const API_PREFIX = '/interviewer'

/** The default workspace root: a stable, named folder in the user's home. */
export function defaultWorkspaceRoot() {
  return join(homedir(), 'DSH-INTERVIEWER')
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
 * @param {string} configured the user's explicit value, if any
 * @returns {Promise<{path: string, source: string, reason: string, exists: boolean, error?: string}>}
 */
export async function describeWorkspaceRoot(configured) {
  if (typeof configured === 'string' && configured.trim() !== '') {
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
  const path = defaultWorkspaceRoot()
  const ensured = await ensureDataRoot(path)
  return {
    path,
    source: 'default',
    reason: '默认工作区根（用户主目录下的 DSH-INTERVIEWER）。改 `workspaceRoot` 可以指到 D 盘这类大盘。',
    exists: existsSync(path),
    ...(ensured.error !== undefined ? { error: ensured.error } : {}),
  }
}
