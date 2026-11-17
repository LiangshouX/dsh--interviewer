/**
 * 语音服务预设表：**设置页下拉的唯一来源。**
 *
 * **为什么表在 Host，不在前端。** 前端硬编码选项表意味着「加一家厂商」
 * 要改两处，而且两边迟早对不上（面板显示 MiMo，解析层却认不出这个名字）。
 * 这里一行一个服务，`GET voice/presets` 原样给面板，`resolveTts` /
 * `resolveHttpAsr` 也从这里取默认值——**一处定义，三处读取**。
 *
 * 字段：
 *
 *   id          设置值（也是 `asrProvider` / `ttsProvider` 的枚举值）
 *   kind        'asr' | 'tts'
 *   label       界面上的名字
 *   protocol    协议适配器（auto/host/browser/none 是控制项）
 *   baseUrl     默认端点；留空表示该协议没有默认值（必须自己填）
 *   model       默认模型 id
 *   voice       默认音色（只有 TTS 有意义）
 *   apiKeyEnv   默认凭据名；留空 = 这个服务不要凭据
 *   keyless     免密钥
 *   notes       给 `title=` / 悬停提示的一句话（**不进常驻界面**）
 */

/**
 * TTS 的服务表。
 *
 * `auto` 的候选顺序就是 `auto: true` 的出现顺序：配了凭据的模型在前，
 * 免密钥自然音在后，浏览器永远最后。
 */
export const TTS_PRESETS = [
  {
    id: 'auto',
    kind: 'tts',
    control: true,
    label: '自动',
    protocol: 'auto',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '按 MiMo → OpenAI → MiniMax → 百度 → Edge → 浏览器的顺序挑第一条能用的',
  },
  {
    id: 'host',
    kind: 'tts',
    control: true,
    label: '宿主语音合成',
    protocol: 'host',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '当前 DSH 没有 TTS 服务；宿主将来提供时会自动优先',
  },
  {
    id: 'mimo',
    kind: 'tts',
    auto: true,
    label: 'MiMo TTS',
    protocol: 'chat-audio',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    voice: 'mimo_default',
    apiKeyEnv: 'MIMO_API_KEY',
    keyless: false,
    notes: 'chat/completions + audio；voiceclone 模型需要参考音频，voicedesign 需要音色描述',
  },
  {
    id: 'openai',
    kind: 'tts',
    auto: true,
    label: 'OpenAI 兼容语音',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    apiKeyEnv: 'OPENAI_API_KEY',
    keyless: false,
    notes: '任何实现 /audio/speech 的网关都能用；换端点与模型即可',
  },
  {
    id: 'minimax',
    kind: 'tts',
    auto: true,
    label: 'MiniMax 语音（api.minimaxi.com）',
    protocol: 'minimax',
    baseUrl: 'https://api.minimaxi.com',
    model: 'speech-02-hd',
    voice: 'female-shaonv',
    apiKeyEnv: 'MINIMAX_API_KEY',
    keyless: false,
    notes: 't2a_v2；音频以十六进制返回；业务错误码会原样带回界面（例如 2056 = 用量上限）',
  },
  {
    id: 'minimax-cn',
    kind: 'tts',
    label: 'MiniMax 语音（api.minimax.cn）',
    protocol: 'minimax',
    baseUrl: 'https://api.minimax.cn',
    model: 'speech-02-hd',
    voice: 'female-shaonv',
    apiKeyEnv: 'MINIMAX_API_KEY',
    keyless: false,
    notes: '与国内站同一协议；Token Plan 的 key 一般走这里。部分账户需要 Group ID',
  },
  {
    id: 'dashscope',
    kind: 'tts',
    auto: true,
    label: 'Qwen / CosyVoice 语音（DashScope WebSocket）',
    protocol: 'dashscope',
    baseUrl: 'wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference',
    model: 'qwen-audio-3.0-tts-plus',
    voice: 'longanlingxin',
    apiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY',
    keyless: false,
    notes: '非实时合成（tts_v2 WebSocket，不是 /audio/speech）。默认走千问 Token Plan 中转：端点 token-plan.maas.qianwenaiapi.com、凭据 QIANWEN_TOKEN_PLAN_API_KEY、模型 qwen-audio-3.0-tts-plus（该中转提供 plus，没有 flash）。官方 DashScope 改端点 wss://dashscope.aliyuncs.com/api-ws/v1/inference + DASHSCOPE_API_KEY（可用 flash/plus）。音色按模型选，跨模型混用报 InvalidParameter。',
  },
  {
    id: 'baidu',
    kind: 'tts',
    auto: true,
    label: '百度朗读（免密钥）',
    protocol: 'baidu',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '非公开端点，普通话比系统音色自然；失败就回落浏览器',
  },
  {
    id: 'edge',
    kind: 'tts',
    auto: true,
    label: 'Edge 神经音色（免密钥）',
    protocol: 'edge',
    baseUrl: '',
    model: '',
    voice: 'zh-CN-XiaoxiaoNeural',
    apiKeyEnv: '',
    keyless: true,
    notes: '非公开 WebSocket 端点，某些网络出口会被 403',
  },
  {
    id: 'browser',
    kind: 'tts',
    control: true,
    label: '浏览器系统音色',
    protocol: 'browser',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '零配置的兜底，音色取决于这台机器',
  },
  {
    id: 'none',
    kind: 'tts',
    control: true,
    label: '关闭播报',
    protocol: 'none',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '问题只以文字显示',
  },
]

/**
 * ASR 的服务表。
 *
 * `auto` 的候选顺序：宿主 → 服务端（两套协议）→ 浏览器，固定不变。
 */
export const ASR_PRESETS = [
  {
    id: 'auto',
    kind: 'asr',
    control: true,
    label: '自动',
    protocol: 'auto',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '宿主语音服务 → 插件自己的服务端识别 → 浏览器 Web Speech',
  },
  {
    id: 'host',
    kind: 'asr',
    control: true,
    label: '宿主语音服务',
    protocol: 'host',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '由 DSH 配置的 provider 识别，插件不经手凭据；没启用时回落浏览器',
  },
  {
    id: 'openai',
    kind: 'asr',
    server: true,
    label: '服务端 · OpenAI 兼容（SiliconFlow）',
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/SenseVoiceSmall',
    voice: '',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
    keyless: false,
    notes: '任何 /audio/transcriptions 兼容网关；换端点与模型即可',
  },
  {
    id: 'openai-custom',
    kind: 'asr',
    server: true,
    label: '服务端 · 自定义 OpenAI 兼容',
    protocol: 'openai',
    baseUrl: '',
    model: 'whisper-1',
    voice: '',
    apiKeyEnv: 'OPENAI_API_KEY',
    keyless: false,
    notes: '端点必须自己填（例如官方 OpenAI 或任意 /audio/transcriptions 网关）',
  },
  {
    id: 'minimax',
    kind: 'asr',
    server: true,
    label: '服务端 · MiniMax（api.minimaxi.com）',
    protocol: 'minimax',
    baseUrl: 'https://api.minimaxi.com',
    model: 'asr-1.0',
    voice: '',
    apiKeyEnv: 'MINIMAX_API_KEY',
    keyless: false,
    notes: 'speech_to_text；语言放在 HTTP 头，部分账户需要 Group ID',
  },
  {
    id: 'minimax-cn',
    kind: 'asr',
    server: true,
    label: '服务端 · MiniMax（api.minimax.cn）',
    protocol: 'minimax',
    baseUrl: 'https://api.minimax.cn',
    model: 'asr-1.0',
    voice: '',
    apiKeyEnv: 'MINIMAX_API_KEY',
    keyless: false,
    notes: '与国内站同一协议；Token Plan 的 key 一般走这里',
  },
  {
    id: 'browser',
    kind: 'asr',
    control: true,
    label: '浏览器 Web Speech',
    protocol: 'browser',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: 'Chromium 的识别后端在受限网络里可能不可达；失败时用键盘继续',
  },
  {
    id: 'none',
    kind: 'asr',
    control: true,
    label: '关闭识别',
    protocol: 'none',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '只用键盘输入',
  },
]

/** 内部用：把服务表收成以 id 为键的字典。 */
export const TTS_PROVIDERS = Object.fromEntries(
  TTS_PRESETS.filter(preset => preset.control !== true).map(preset => [preset.id, preset]),
)

/** 内部用：同上，识别那半边。 */
export const ASR_PROVIDERS = Object.fromEntries(
  ASR_PRESETS.filter(preset => preset.server === true).map(preset => [preset.id, preset]),
)

/** `auto` 的候选顺序（按服务表里的声明顺序）。 */
export const TTS_AUTO_ORDER = TTS_PRESETS.filter(preset => preset.auto === true).map(preset => preset.id)

/**
 * 给面板的完整预设表（识别在前、播报在后）。
 *
 * 只回传界面要用的字段——不把内部的 `auto` / `control` / `server` 标记
 * 泄漏出去，免得前端又长出第二套判断。
 *
 * @returns {Array<{kind: string, id: string, label: string, protocol: string, baseUrl: string, model: string, voice: string, apiKeyEnv: string, keyless: boolean, notes: string}>}
 */
export function voicePresets() {
  return [...ASR_PRESETS, ...TTS_PRESETS].map(preset => ({
    kind: preset.kind,
    id: preset.id,
    label: preset.label,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    model: preset.model,
    voice: preset.voice,
    apiKeyEnv: preset.apiKeyEnv,
    keyless: preset.keyless,
    notes: preset.notes,
  }))
}

/**
 * Look one ASR service up by its setting value (undefined for control ids).
 *
 * @param {string} id
 */
export function asrProviderOf(id) {
  return ASR_PROVIDERS[id]
}

/**
 * Look one TTS service up by its setting value (undefined for control ids).
 *
 * @param {string} id
 */
export function ttsProviderOf(id) {
  return TTS_PROVIDERS[id]
}
