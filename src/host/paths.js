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
 * **Where interview data lives.** 简历与 JD 是**个人数据**，不进任何项目目录，
 * 也不上传。默认落在用户主目录下的 `DSH-INTERVIEWER/`，用户可以在
 * `cordis.patch.yml` 里改 `dataRoot`。
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

/** The default data root: a stable, named folder in the user's home. */
export function defaultDataRoot() {
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
    dataRoot: text(config.dataRoot) ?? defaultDataRoot(),
    jdFetchTimeoutMs: number(config.jdFetchTimeoutMs, 1000, 120000, 15000),
    jdMaxChars: number(config.jdMaxChars, 500, 200000, 20000),
    asrProvider: oneOf(config.asrProvider, ['auto', 'browser', 'none'], 'auto'),
    ttsProvider: oneOf(config.ttsProvider, ['auto', 'browser', 'none'], 'auto'),
    ttsRate: number(config.ttsRate, 0.5, 2, 1),
    ttsVoice: text(config.ttsVoice) ?? '',
    recordVideo: flag(config.recordVideo, true),
    recordAudio: flag(config.recordAudio, true),
  }
}

/**
 * Ensure the data root exists and return it.
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
    await mkdir(join(path, 'sessions'), { recursive: true })
    return { path, created: !existed }
  } catch (error) {
    return {
      path,
      created: false,
      error: `数据目录建不出来：${error && error.message ? error.message : String(error)}`,
    }
  }
}
