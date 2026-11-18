/**
 * 凭据 seam：**只进不出**的读写层。
 *
 * **为什么要有这一层。** ASR 与 TTS 都需要 API key，但两条链的
 * "宿主兜底"不一样：ASR 还能退一步用宿主 LLM provider 自己的凭据字段，
 * TTS 没有这个兜底。把顺序抽出来，两边就只描述差异。
 *
 * **纪律（不可破）：密钥永远不进配置文件、不进日志、不进响应。**
 * 面板能看到的只是 `configured` 与 `source`，不是值本身。写也只能写进
 * 宿主的 `ctx.credentials`（`<DSH_HOME>/.credentials.yaml` 的 `refs:` 段）——
 * **绝不**回落成把明文写进插件的 `dsh-realtime-interview.json`。
 *
 * 宿主没有 credentials seam 时，写入操作返回 `{ok:false, reason, hint}`，
 * hint 说清「改用环境变量 + 重启 DSH」。这是唯一诚实的出路。
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { settingsPath } from '../paths.js'
import { hostService } from './host.js'
import { redactSecret } from './redact.js'

/**
 * 凭据名（ref）的合法形状。
 *
 * 与宿主 `.credentials.yaml` 的约束一致：字母或下划线开头，其余是
 * 字母、数字、下划线。**不含点、横线、路径分隔符**——ref 会被拼进
 * 那个 YAML 的 `refs:` 段，放任任意字符等于放任注入。
 */
export const SECRET_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * 常见候选凭据名：profile 里读不到东西时的兜底清单。
 *
 * 这里放的是**语音服务**常见的环境变量名，不是"所有 API key"。
 * profile 扫描会补上这台机器真实在用的那些名字（见 `discoverCredentials`）。
 */
export const CANDIDATE_REFS = [
  'MIMO_API_KEY',
  'XIAOMI_TOKEN_PLAN_CN_API_KEY',
  'M_PLAN_API_KEY',
  'MINIMAX_M_PLAN_API_KEY',
  'OPENAI_API_KEY',
  'MINIMAX_API_KEY',
  'SILICONFLOW_API_KEY',
  'DASHSCOPE_API_KEY',
  'QWEN_TOKEN_PLAN_API_KEY',
  'QIANWEN_TOKEN_PLAN_API_KEY',
]

/** Profile 里可能写着凭据名的文件，按优先级。 */
const PROFILE_FILES = ['cordis.patch.yml', 'cordis.patch.yaml', 'cordis.yml', 'cordis.yaml']

/** 单个密钥值允许的最大长度：挡住误粘进来的整段文件。 */
const MAX_SECRET_CHARS = 8192

/**
 * Resolve one secret.
 *
 * @param {any} ctx the plugin context
 * @param {{literal?: string, envName: string, hostValue?: string}} input
 * @returns {Promise<{value: string, source: 'config'|'host'|'env'|'none', detail: string}>}
 */
export async function resolveSecret(ctx, input) {
  const literal = typeof input.literal === 'string' ? input.literal.trim() : ''
  if (literal !== '') return { value: literal, source: 'config', detail: '插件配置里的明文 key' }

  const envName = typeof input.envName === 'string' ? input.envName.trim() : ''
  if (envName === '') return { value: '', source: 'none', detail: '没有指定凭据名' }

  // 宿主的 credentials seam：与 DSH 生态里其他插件一致。
  const credentials = hostService(ctx, 'credentials')
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      const resolved = await credentials.resolve(credentialRef(envName))
      if (resolved !== null && resolved !== undefined && typeof resolved.value === 'string' && resolved.value !== '') {
        return { value: resolved.value, source: 'host', detail: `宿主的 credentials（${envName}）` }
      }
    } catch {
      // seam 不可用（宿主版本不同或未启用）：走环境变量。
    }
  }

  const fromEnv = typeof process.env?.[envName] === 'string' ? process.env[envName].trim() : ''
  if (fromEnv !== '') return { value: fromEnv, source: 'env', detail: `环境变量 ${envName}` }

  const hostValue = typeof input.hostValue === 'string' ? input.hostValue.trim() : ''
  if (hostValue !== '') return { value: hostValue, source: 'host', detail: '宿主 provider 的凭据字段' }

  return { value: '', source: 'none', detail: envName }
}

/**
 * Is this a legal credential reference?
 *
 * @param {unknown} ref
 * @returns {boolean}
 */
export function isValidSecretRef(ref) {
  return typeof ref === 'string' && SECRET_REF_PATTERN.test(ref)
}

/**
 * Describe one secret **without its value**.
 *
 * 顺序与 `resolveSecret` 一致：宿主凭据优先，其次环境变量。所以
 * 「这里显示已配置」和「转写时真的取得到」指向同一件事。
 *
 * @param {any} ctx
 * @param {string} ref
 * @returns {Promise<{ok: boolean, ref: string, configured: boolean, source: 'host'|'env'|'none', writable: boolean, reason?: string, hint?: string}>}
 */
export async function describeSecret(ctx, ref) {
  const name = typeof ref === 'string' ? ref.trim() : ''
  if (!isValidSecretRef(name)) {
    return {
      ok: false,
      ref: name,
      configured: false,
      source: 'none',
      writable: false,
      reason: '凭据名只能由字母、数字、下划线组成，且不能以数字开头。',
      hint: '用标准环境变量名，例如 MIMO_API_KEY 或 MINIMAX_API_KEY。',
    }
  }

  const credentials = hostService(ctx, 'credentials')
  const writable = credentials !== undefined
    && credentials !== null
    && typeof credentials.set === 'function'
    && typeof credentials.unset === 'function'

  if (credentials !== undefined && credentials !== null && typeof credentials.describe === 'function') {
    try {
      const described = await credentials.describe(credentialRef(name))
      if (described !== null && typeof described === 'object') {
        const configured = described.configured === true
        if (configured) {
          return {
            ok: true,
            ref: name,
            configured: true,
            source: normalizeSource(described.source),
            writable: described.writable === true || writable,
          }
        }
      }
    } catch {
      // describe 不可用时退回环境变量；**不报错**，因为「读不到状态」不等于
      // 「没有凭据」，调用方看到 configured:false 仍会给出配置入口。
    }
  }

  const fromEnv = typeof process.env?.[name] === 'string' ? process.env[name].trim() : ''
  return {
    ok: true,
    ref: name,
    configured: fromEnv !== '',
    source: fromEnv !== '' ? 'env' : 'none',
    writable,
  }
}

/**
 * Store one secret in the host's credential store.
 *
 * **空字符串会被宿主拒绝**（要删就 `clearSecret`），所以这里先自己拦下，
 * 给一句人能读懂的原因，而不是把宿主的内部错误抛给用户。
 *
 * @param {any} ctx
 * @param {string} ref
 * @param {unknown} value
 * @returns {Promise<{ok: boolean, ref: string, configured?: boolean, source?: string, writable?: boolean, reason?: string, hint?: string}>}
 */
export async function setSecret(ctx, ref, value) {
  const name = typeof ref === 'string' ? ref.trim() : ''
  if (!isValidSecretRef(name)) {
    return {
      ok: false,
      ref: name,
      reason: '凭据名不合法：只能用字母、数字、下划线，且不能以数字开头。',
      hint: '用标准环境变量名，例如 MIMO_API_KEY。',
    }
  }

  const secret = typeof value === 'string' ? value.trim() : ''
  if (secret === '') {
    return {
      ok: false,
      ref: name,
      reason: '密钥是空的。',
      hint: '要删除已保存的密钥请用「清除」；宿主不接受空字符串写入。',
    }
  }
  if (/[\r\n]/.test(secret)) {
    return {
      ok: false,
      ref: name,
      reason: '密钥不能包含换行。',
      hint: '粘贴时如果带进了换行，删掉换行再试一次。',
    }
  }
  if (secret.length > MAX_SECRET_CHARS) {
    return {
      ok: false,
      ref: name,
      reason: `密钥太长了（${secret.length} 字符，上限 ${MAX_SECRET_CHARS}）。`,
      hint: '确认粘进来的只是 key 本身，不是整段配置文件。',
    }
  }

  const credentials = hostService(ctx, 'credentials')
  if (credentials === undefined || credentials === null || typeof credentials.set !== 'function') {
    return {
      ok: false,
      ref: name,
      reason: '这个宿主没有提供可写的凭据存储（ctx.credentials）。',
      hint: `改用环境变量：在启动 DSH 前设置 ${name}，然后重启 DSH。密钥没有写进插件设置文件。`,
    }
  }

  try {
    await credentials.set(credentialRef(name), secret)
  } catch (error) {
    // **错误信息也要擦。** 宿主或网关可能把值带在 message 里。
    return {
      ok: false,
      ref: name,
      reason: `写入宿主凭据失败：${redactSecret(messageOf(error), secret)}`,
      hint: '确认凭据名合法、DSH 的凭据文件可写；也可以改用环境变量 + 重启 DSH。密钥没有写进插件设置文件。',
    }
  }

  return { ok: true, ref: name, configured: true, source: 'host', writable: true }
}

/**
 * Remove one secret from the host's credential store.
 *
 * @param {any} ctx
 * @param {string} ref
 * @returns {Promise<{ok: boolean, ref: string, cleared?: boolean, configured?: boolean, source?: string, reason?: string, hint?: string}>}
 */
export async function clearSecret(ctx, ref) {
  const name = typeof ref === 'string' ? ref.trim() : ''
  if (!isValidSecretRef(name)) {
    return {
      ok: false,
      ref: name,
      reason: '凭据名不合法：只能用字母、数字、下划线，且不能以数字开头。',
      hint: '用标准环境变量名，例如 MIMO_API_KEY。',
    }
  }

  const credentials = hostService(ctx, 'credentials')
  if (credentials === undefined || credentials === null || typeof credentials.unset !== 'function') {
    return {
      ok: false,
      ref: name,
      reason: '这个宿主没有提供可写的凭据存储（ctx.credentials），插件不能删除凭据。',
      hint: `去环境变量里删掉 ${name}，然后重启 DSH。插件设置文件里从来没有存过密钥。`,
    }
  }

  try {
    await credentials.unset(credentialRef(name))
  } catch (error) {
    return {
      ok: false,
      ref: name,
      reason: `删除宿主凭据失败：${redactSecret(messageOf(error), '')}`,
      hint: `确认 DSH 的凭据文件可写；也可以去环境变量里删掉 ${name} 再重启 DSH。`,
    }
  }

  const after = await describeSecret(ctx, name)
  return {
    ok: true,
    ref: name,
    cleared: true,
    configured: after.configured === true,
    source: after.source,
    // 环境变量删不掉：如果宿主那份删了、环境变量还有，会如实显示 env。
    ...(after.configured === true
      ? { hint: `宿主凭据已删除；环境变量里还留着 ${name}，要彻底清掉请在系统环境变量里删除并重启 DSH。` }
      : {}),
  }
}

/**
 * This machine's already-configured credential names.
 *
 * 三个来源，按可信度排序、去重：
 *   1. profile 的 `cordis.patch.yml` 里所有 `apiKeyEnv:`（这台机器真的在用的名字）；
 *   2. 宿主 credentials 存储里登记的 ref 名（只取名，不碰值）；
 *   3. 常见候选名（服务商标准环境变量名）。
 *
 * 文件不存在、读不了、seam 报错——一律**不抛**，只用剩下的来源。
 *
 * @param {any} ctx
 * @returns {Promise<Array<{ref: string, configured: boolean, source: string, writable: boolean}>>}
 */
export async function discoverCredentials(ctx) {
  const seen = new Set()
  const refs = []
  const add = ref => {
    const name = typeof ref === 'string' ? ref.trim() : ''
    if (!isValidSecretRef(name) || seen.has(name)) return
    seen.add(name)
    refs.push(name)
  }

  for (const name of await profileCredentialRefs()) add(name)
  for (const name of await storedCredentialRefs(ctx)) add(name)
  for (const name of CANDIDATE_REFS) add(name)

  const rows = []
  for (const ref of refs) {
    const described = await describeSecret(ctx, ref)
    rows.push({
      ref,
      configured: described.configured === true,
      source: described.source === 'host' || described.source === 'env' ? described.source : 'none',
      writable: described.writable === true,
    })
  }
  // 已配置的排前面、来源次序稳定：用户打开下拉先看到"这台机器已经有哪几把钥匙"。
  rows.sort((left, right) => Number(right.configured) - Number(left.configured))
  return rows
}

/**
 * The profile directory whose `cordis.patch.yml` names the credentials.
 *
 * 与 `settingsPath()` 用的是同一套优先级（`DSH_PROFILE_DIR` 最准），
 * 这样"设置文件写到哪"和"凭据名从哪读"永远是同一个 profile。
 *
 * @returns {string}
 */
export function profileDir() {
  const explicit = typeof process.env.DSH_PROFILE_DIR === 'string' ? process.env.DSH_PROFILE_DIR.trim() : ''
  if (explicit !== '') return explicit
  return dirname(settingsPath())
}

/**
 * Every `apiKeyEnv:` name the profile names.
 *
 * @returns {Promise<string[]>}
 */
export async function profileCredentialRefs() {
  const dir = profileDir()
  const names = []
  for (const file of PROFILE_FILES) {
    let text
    try {
      text = await readFile(join(dir, file), 'utf8')
    } catch {
      continue
    }
    // `apiKeyEnv:` 是 DSH profile 的写法；另外两种是别的插件/版本的别名。
    for (const pattern of [
      /apiKeyEnv\s*:\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/g,
      /apiKeyEnvName\s*:\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/g,
      /api_key_env\s*:\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/g,
    ]) {
      for (const match of text.matchAll(pattern)) names.push(match[1])
    }
  }
  return names
}

/**
 * The ref names the host's credential store knows about.
 *
 * **只取名。** `listRecords()` 即使把记录完整给出来，这里也只认
 * `ref` / `name` / `id` 三个键——值连读都不读。
 *
 * @param {any} ctx
 * @returns {Promise<string[]>}
 */
async function storedCredentialRefs(ctx) {
  const credentials = hostService(ctx, 'credentials')
  if (credentials === undefined || credentials === null || typeof credentials.listRecords !== 'function') return []
  try {
    const raw = await credentials.listRecords()
    const records = Array.isArray(raw) ? raw : (Array.isArray(raw?.records) ? raw.records : [])
    const names = []
    for (const record of records) {
      if (typeof record === 'string') { names.push(record); continue }
      if (record === null || typeof record !== 'object') continue
      for (const key of ['ref', 'name', 'id']) {
        if (typeof record[key] === 'string') { names.push(record[key]); break }
      }
    }
    return names
  } catch {
    return []
  }
}

/**
 * A credential reference.
 *
 * 宿主的 `credentialRef()` 产出的是品牌字符串，**运行时就是普通字符串**。
 * 插件不 import 那个包有两个理由：它不在插件的依赖里（包里没有它），
 * 而且品牌化只影响类型检查，不影响解析。所以这里显式标注：
 * 传进 `credentials.resolve()` 的名字就是这里的返回值。
 *
 * @param {string} name
 * @returns {string}
 */
export function credentialRef(name) {
  return name
}

/** Normalize a provider-reported source into the three values the UI knows. */
function normalizeSource(source) {
  if (typeof source !== 'string') return 'host'
  return /env|environment|process/i.test(source) ? 'env' : 'host'
}

/** Read an error message without leaking a stack. */
function messageOf(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}
