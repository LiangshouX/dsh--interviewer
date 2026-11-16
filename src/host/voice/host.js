/**
 * 宿主服务访问的小工具。
 *
 * **为什么单独一层。** 插件的 Host 半边要读好几个可选服务
 * （`speechToText`、`credentials`、`llm`、`agentDefaultModel`），
 * 而它们的可用性因宿主版本与 profile 组成而不同。每一个都写成
 * `try/catch` 会把业务代码埋进防御性噪音里，所以这里统一收口：
 * 取不到就是 `undefined`，**永远不抛**。
 */

/**
 * Read one optional host service.
 *
 * `ctx.get(name)` 是 cordis 的公开取法；老版本上可能只有属性访问，
 * 两种都认——但**不猜服务是否存在**：取不到就返回 undefined。
 *
 * @param {any} ctx
 * @param {string} name
 * @returns {any}
 */
export function hostService(ctx, name) {
  try {
    if (ctx === undefined || ctx === null) return undefined
    if (typeof ctx.get === 'function') return ctx.get(name)
    return ctx[name]
  } catch {
    return undefined
  }
}

/**
 * The first non-empty string among the given keys.
 *
 * 宿主各 provider 适配器对同一件事的字段名不统一（`baseUrl` / `apiBase` /
 * `endpoint`…），这里按优先级取第一个非空值。
 *
 * @param {any} source
 * @param {string[]} keys
 * @returns {string}
 */
export function firstString(source, keys) {
  if (source === undefined || source === null) return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/**
 * Read the host's current model selection.
 *
 * @param {any} ctx
 * @returns {{provider: string, model: string}}
 */
export function hostSelection(ctx) {
  const selection = hostService(ctx, 'agentDefaultModel')
  let current
  try {
    current = selection?.currentSelection?.()
  } catch {
    current = undefined
  }
  return {
    provider: typeof current?.provider === 'string' ? current.provider : '',
    model: typeof current?.model === 'string' ? current.model : '',
  }
}

/**
 * Normalize whatever a host provider returns as a transcript.
 *
 * 宿主服务没有把返回值写成字符串；不同 provider 可能给 `string`、`{text}`
 * 或 `{transcript}`。三种都认，认不出就是空串——**不编造文字**。
 *
 * @param {any} result
 * @returns {string}
 */
export function transcriptText(result) {
  if (typeof result === 'string') return result.trim()
  if (result !== null && typeof result === 'object') {
    for (const key of ['text', 'transcript', 'result']) {
      const value = result[key]
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    }
  }
  return ''
}
