/**
 * 凭据解析：明文配置 → 宿主 credentials seam → 进程环境变量。
 *
 * **为什么要有这一层。** ASR 与 TTS 都需要 API key，但两条链的
 * "宿主兜底"不一样：ASR 还能退一步用宿主 LLM provider 自己的凭据字段，
 * TTS 没有这个兜底。把顺序抽出来，两边就只描述差异。
 *
 * **纪律：密钥永远不进配置文件、不进日志、不进响应。** 面板能看到的只是
 * `hasCredential` 与凭据来源，不是值本身。
 */
import { hostService } from './host.js'

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
