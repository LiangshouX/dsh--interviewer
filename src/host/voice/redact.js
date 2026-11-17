/**
 * 密钥擦除：**任何要离开 Host 的字符串都先过这里。**
 *
 * **为什么需要它。** 语音服务的错误体经常把请求里的东西原样带回来——
 * 有的网关在 401 的 JSON 里回显 `Authorization` 或 key 片段。这些字符串
 * 会顺着 `reason` / `warnings` 进 HTTP 响应、进面板、进 agent 的工具结果。
 * 「密钥只进不出」不能靠"provider 应该不会回显"来保证，必须在这里兜底。
 *
 * 规则很简单：把已知的密钥值替换成 `***`。太短的值（< 4 字符）不替换——
 * 那会把正常文字里的单个字母也擦掉，反而制造 bug。
 */

/** The replacement shown instead of a secret. */
const MASK = '***'

/**
 * Erase one secret from a string.
 *
 * @param {unknown} text
 * @param {unknown} secret
 * @returns {string}
 */
export function redactSecret(text, secret) {
  const value = typeof text === 'string' ? text : String(text ?? '')
  const needle = typeof secret === 'string' ? secret : ''
  if (needle.length < 4) return value
  return value.split(needle).join(MASK)
}

/**
 * Erase several secrets from a string.
 *
 * @param {unknown} text
 * @param {unknown[]} secrets
 * @returns {string}
 */
export function redactSecrets(text, secrets) {
  let value = typeof text === 'string' ? text : String(text ?? '')
  if (!Array.isArray(secrets)) return value
  for (const secret of secrets) value = redactSecret(value, secret)
  return value
}

/**
 * Whether a string contains one of the given secrets.
 *
 * 只用于测试与自检；生产路径里没有"判断有没有泄漏"的需要，
 * 因为所有出口都已经擦过一遍了。
 *
 * @param {unknown} text
 * @param {unknown[]} secrets
 * @returns {boolean}
 */
export function containsSecret(text, secrets) {
  const value = typeof text === 'string' ? text : String(text ?? '')
  if (!Array.isArray(secrets)) return false
  return secrets.some(secret => typeof secret === 'string' && secret.length >= 4 && value.includes(secret))
}
