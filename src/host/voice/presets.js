/**
 * 语音服务预设表：**设置页下拉、配置校验、协议分发的唯一真源。**
 *
 * **为什么表在 Host，不在前端。** 前端硬编码选项表意味着「加一家厂商」
 * 要改两处，而且两边迟早对不上（面板显示 MiMo，解析层却认不出这个名字）。
 * 这里一行一个服务，`GET voice/presets` 原样给面板，`resolveTts` /
 * `resolveHttpAsr` 也从这里取默认值——**一处定义，三处读取**。
 * （`paths.js` 的 `asrProvider` / `ttsProvider` 枚举也由本表派生，
 * 以前它们各自硬编码一份，新预设存不进去、旧预设认不出来，就是这么坏的。）
 *
 * **排列顺序 = 产品顺序，不许随手插队：**
 *
 *   控制（自动 / 宿主 / 关闭）
 *   → **预设供应商**：Qwen、MiMo、MiniMax，每家的 Token Plan 与 API 直连各一条
 *   → **任意 OpenAI 协议兼容**（自定义端点 / SiliconFlow）
 *   → **免密钥免费方案**（百度朗读 / Edge 神经音色 / 浏览器）
 *
 * 预设供应商条目一律 `locked: true`：端点、协议、凭据名、模型都是**配好的一对**，
 * 面板只显示、不让改。理由很实在——这些家的 key 与主机/模型是绑定的
 * （Token Plan 的 key 打官方端点 401、Qwen 中转没有 flash 模型、MiMo 的
 * ASR/TTS 都走 chat/completions 而不是 /audio/speech），允许随手改端点
 * 只会制造「看起来填对了却一直失败」的状态。要自定义端点，就选
 * 「任意 OpenAI 协议兼容」。
 *
 * 字段：
 *
 *   id          设置值（也是 `asrProvider` / `ttsProvider` 的枚举值）
 *   kind        'asr' | 'tts'
 *   group       'control' | 'vendor' | 'compatible' | 'free'（下拉分组）
 *   label       界面上的名字
 *   protocol    协议适配器：
 *                 ASR: openai / minimax / chat-audio / dashscope-asr
 *                 TTS: auto / host / chat-audio / openai / minimax / dashscope /
 *                      baidu / edge / browser / none
 *   baseUrl     端点基址（预设供应商的**唯一正确值**）
 *   model       默认模型 id
 *   models      TTS 允许的模型清单（面板做下拉；ASR 只有一个模型，不列）
 *   voice       默认音色（只有 TTS 有意义）
 *   apiKeyEnv   默认凭据名；留空 = 这个服务不要凭据
 *   keyless     免密钥
 *   locked      true = 端点/协议固定，面板只读
 *   auto        true = 参与 `auto` 的候选顺序（按本表声明顺序）
 *   hidden      true = 兼容旧配置的别名，不出现在下拉里
 *   notes       给 `title=` / 悬停提示的一句话（**不进常驻界面**）
 */

/** 下拉分组（顺序即渲染顺序）。 */
export const PRESET_GROUPS = [
  { id: 'control', label: '' },
  { id: 'vendor', label: '预设供应商' },
  { id: 'compatible', label: '任意 OpenAI 协议兼容' },
  { id: 'free', label: '免密钥免费方案' },
]

/** group id → 分组标题（空 = 不画分隔条）。 */
const GROUP_LABELS = Object.fromEntries(PRESET_GROUPS.map(group => [group.id, group.label]))

/** 协议的人话名字（面板「现在用」用它，不把 chat-audio 这种内部词甩给用户）。 */
export const PROTOCOL_LABELS = {
  'openai': 'OpenAI /audio/transcriptions',
  'minimax': 'MiniMax speech_to_text',
  'chat-audio': 'chat/completions + input_audio',
  'dashscope-asr': 'DashScope multimodal-generation',
  'dashscope': 'DashScope tts_v2 WebSocket',
  'baidu': '百度朗读',
  'edge': 'Edge 神经音色',
  'browser': '浏览器 Web Speech',
  'host': '宿主语音服务',
  'none': '已关闭',
}

/**
 * 协议 → 人话名字。
 *
 * @param {string} protocol
 * @returns {string}
 */
export function protocolLabel(protocol) {
  const key = typeof protocol === 'string' ? protocol : ''
  return PROTOCOL_LABELS[key] ?? key
}

/** Qwen TTS 的模型（Token Plan 只有 plus；官方百炼全系）。 */
const QWEN_TTS_PLUS = [
  { id: 'qwen-audio-3.0-tts-plus', label: 'Qwen-Audio 3.0 TTS Plus · 旗舰（2 音色）' },
]
const QWEN_TTS_MODELS = [
  ...QWEN_TTS_PLUS,
  { id: 'qwen-audio-3.0-tts-flash', label: 'Qwen-Audio 3.0 TTS Flash · 快（12 音色）' },
  { id: 'qwen-audio-3.1-tts-plus', label: 'Qwen-Audio 3.1 TTS Plus · 新旗舰（4 音色）' },
  { id: 'qwen-audio-3.1-tts-flash', label: 'Qwen-Audio 3.1 TTS Flash · 多语种（139 音色）' },
]

/** MiMo TTS 的三种模型（同一个 chat/completions 适配器）。 */
const MIMO_TTS_MODELS = [
  { id: 'mimo-v2.5-tts', label: 'MiMo TTS · 预置音色（默认）' },
  { id: 'mimo-v2.5-tts-voicedesign', label: 'MiMo TTS · 文本描述音色' },
  { id: 'mimo-v2.5-tts-voiceclone', label: 'MiMo TTS · 参考音频复刻' },
]

/** MiniMax T2A v2 的模型。 */
const MINIMAX_TTS_MODELS = [
  { id: 'speech-02-hd', label: 'speech-02-hd · 稳定（默认）' },
  { id: 'speech-02-turbo', label: 'speech-02-turbo · 快' },
  { id: 'speech-2.6-hd', label: 'speech-2.6-hd' },
  { id: 'speech-2.6-turbo', label: 'speech-2.6-turbo' },
  { id: 'speech-2.8-hd', label: 'speech-2.8-hd · 新一代旗舰' },
  { id: 'speech-2.8-turbo', label: 'speech-2.8-turbo · 极速' },
]

/**
 * ASR 的服务表（顺序即下拉顺序）。
 *
 * `auto` 的候选顺序 = `auto: true` 的声明顺序：预设供应商 → OpenAI 兼容。
 * 浏览器与关闭是控制项，不参与候选。
 */
export const ASR_PRESETS = [
  {
    id: 'auto',
    kind: 'asr',
    group: 'control',
    control: true,
    label: '自动',
    protocol: 'auto',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '宿主语音服务 → 配了凭据的预设供应商（Token Plan / 直连）→ 浏览器 Web Speech',
  },
  {
    id: 'host',
    kind: 'asr',
    group: 'control',
    control: true,
    label: '宿主语音服务',
    protocol: 'host',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '由 DSH 的 voice-input bundle 提供（本机 SenseVoice）；没启用时如实说，并回落浏览器',
  },

  // ── 预设供应商 ──────────────────────────────────────────────────────────
  {
    id: 'qwen-token-plan',
    kind: 'asr',
    group: 'vendor',
    vendor: 'qwen',
    server: true,
    auto: true,
    locked: true,
    label: 'Qwen · Token Plan（千问中转）',
    protocol: 'dashscope-asr',
    baseUrl: 'https://token-plan.maas.qianwenaiapi.com',
    model: 'qwen-audio-3.0-asr-flash',
    voice: '',
    apiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY',
    keyless: false,
    notes: '千问 Token Plan 中转的音频走 DashScope 原生 multimodal-generation（不是 chat/completions，也不是 /audio/transcriptions）。实测模型 qwen-audio-3.0-asr-flash 可用；本机验证通过。',
  },
  {
    id: 'qwen',
    kind: 'asr',
    group: 'vendor',
    vendor: 'qwen',
    server: true,
    auto: true,
    locked: true,
    label: 'Qwen · API 直连（百炼 DashScope）',
    protocol: 'dashscope-asr',
    baseUrl: 'https://dashscope.aliyuncs.com',
    model: 'qwen-audio-3.0-asr-flash',
    voice: '',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    keyless: false,
    notes: '官方百炼。同一个模型另有 OpenAI 兼容 chat/completions 路径（qwen3-asr-flash），但本插件统一走 DashScope 原生端点，少一套协议少一处出错。',
  },
  {
    id: 'mimo-token-plan',
    kind: 'asr',
    group: 'vendor',
    vendor: 'mimo',
    server: true,
    auto: true,
    locked: true,
    label: 'MiMo · Token Plan（小米中转）',
    protocol: 'chat-audio',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    model: 'mimo-v2.5-asr',
    voice: '',
    apiKeyEnv: 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
    keyless: false,
    notes: 'Token Plan 端点 token-plan-cn.xiaomimimo.com。ASR 走 chat/completions + input_audio（与官方端点同协议）。Token Plan 套餐若只覆盖编程工具，会 401/403 —— 改用「MiMo · API 直连」。',
  },
  {
    id: 'mimo',
    kind: 'asr',
    group: 'vendor',
    vendor: 'mimo',
    server: true,
    auto: true,
    locked: true,
    label: 'MiMo · API 直连（官方按量）',
    protocol: 'chat-audio',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-asr',
    voice: '',
    apiKeyEnv: 'MIMO_API_KEY',
    keyless: false,
    notes: '官方按量端点 api.xiaomimimo.com/v1。官方 key 是 sk- 开头，Token Plan 的 tp- key 打这里会 401。',
  },
  {
    id: 'minimax-token-plan',
    kind: 'asr',
    group: 'vendor',
    vendor: 'minimax',
    server: true,
    auto: true,
    locked: true,
    label: 'MiniMax · Token Plan（M Plan）',
    protocol: 'minimax',
    baseUrl: 'https://api.minimax.cn',
    model: 'asr-1.0',
    voice: '',
    apiKeyEnv: 'M_PLAN_API_KEY',
    keyless: false,
    notes: '迷你麦 Token Plan（M Plan）的 key 走 api.minimax.cn。额度用尽时 HTTP 429 + 2056「已达到 Token Plan 用量上限」，界面会原样显示。',
  },
  {
    id: 'minimax-cn',
    kind: 'asr',
    group: 'vendor',
    vendor: 'minimax',
    server: true,
    auto: true,
    locked: true,
    label: 'MiniMax · API 直连（api.minimax.cn）',
    protocol: 'minimax',
    baseUrl: 'https://api.minimax.cn',
    model: 'asr-1.0',
    voice: '',
    apiKeyEnv: 'MINIMAX_API_KEY',
    keyless: false,
    notes: 'HTTP multipart /v1/speech_to_text；语种走 HTTP 头 language；部分旧账户要 GroupId。按量计费，和 M Plan 的 key 不通用。',
  },

  // ── 任意 OpenAI 协议兼容 ────────────────────────────────────────────────
  {
    id: 'openai-custom',
    kind: 'asr',
    group: 'compatible',
    server: true,
    auto: true,
    locked: false,
    label: 'OpenAI 兼容 · 自定义端点',
    protocol: 'openai',
    baseUrl: '',
    model: 'whisper-1',
    voice: '',
    apiKeyEnv: 'OPENAI_API_KEY',
    keyless: false,
    notes: '任何实现 POST /audio/transcriptions 的网关（官方 OpenAI、自建 faster-whisper 等）。端点必须自己填，通常以 /v1 结尾。',
  },
  {
    id: 'openai',
    kind: 'asr',
    group: 'compatible',
    server: true,
    auto: true,
    locked: true,
    label: 'OpenAI 兼容 · SiliconFlow（SenseVoice）',
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'FunAudioLLM/SenseVoiceSmall',
    voice: '',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
    keyless: false,
    notes: '硅基流动的 OpenAI 兼容网关；模型是 SenseVoiceSmall（中文短句识别快、便宜）。端点固定，换别家请选「自定义端点」。',
  },

  // ── 免密钥免费方案 ──────────────────────────────────────────────────────
  {
    id: 'browser',
    kind: 'asr',
    group: 'free',
    control: true,
    label: '浏览器 Web Speech（免密钥）',
    protocol: 'browser',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: 'Chromium 的识别后端在受限网络里可能不可达；失败时用键盘继续，面试不受影响',
  },

  // ── 控制 ────────────────────────────────────────────────────────────────
  {
    id: 'none',
    kind: 'asr',
    group: 'control',
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

/**
 * TTS 的服务表（顺序即下拉顺序）。
 *
 * `auto` 的候选顺序就是 `auto: true` 的出现顺序：配了凭据的模型在前，
 * 免密钥自然音在后，浏览器永远最后。
 */
export const TTS_PRESETS = [
  {
    id: 'auto',
    kind: 'tts',
    group: 'control',
    control: true,
    label: '自动',
    protocol: 'auto',
    baseUrl: '',
    model: '',
    voice: '',
    apiKeyEnv: '',
    keyless: true,
    notes: '按 Qwen → MiMo → MiniMax → OpenAI 兼容 → 百度 → Edge → 浏览器的顺序挑第一条能用的',
  },
  {
    id: 'host',
    kind: 'tts',
    group: 'control',
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

  // ── 预设供应商 ──────────────────────────────────────────────────────────
  {
    id: 'dashscope-token-plan',
    kind: 'tts',
    group: 'vendor',
    vendor: 'qwen',
    auto: true,
    locked: true,
    label: 'Qwen TTS · Token Plan（千问中转）',
    protocol: 'dashscope',
    baseUrl: 'wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference',
    model: 'qwen-audio-3.0-tts-plus',
    models: QWEN_TTS_PLUS,
    voice: 'longanlingxin',
    apiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY',
    keyless: false,
    notes: '千问 Token Plan 的 TTS 走 tts_v2 WebSocket（不是 /audio/speech）。该中转只提供 qwen-audio-3.0-tts-plus，没有 flash。本机验证可用。',
  },
  {
    id: 'dashscope',
    kind: 'tts',
    group: 'vendor',
    vendor: 'qwen',
    auto: true,
    locked: true,
    label: 'Qwen TTS · API 直连（百炼 DashScope）',
    protocol: 'dashscope',
    baseUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
    model: 'qwen-audio-3.0-tts-plus',
    models: QWEN_TTS_MODELS,
    voice: 'longanlingxin',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    keyless: false,
    notes: '官方百炼，四个 Qwen-Audio-TTS 模型都可用。音色按模型选，跨模型混用报 InvalidParameter/411。',
  },
  {
    id: 'mimo-token-plan',
    kind: 'tts',
    group: 'vendor',
    vendor: 'mimo',
    auto: true,
    locked: true,
    label: 'MiMo TTS · Token Plan（小米中转）',
    protocol: 'chat-audio',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    models: MIMO_TTS_MODELS,
    voice: 'mimo_default',
    apiKeyEnv: 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
    keyless: false,
    notes: 'Token Plan 端点 token-plan-cn.xiaomimimo.com；TTS 走 chat/completions + audio。套餐只覆盖编程工具时会 401，改用「API 直连」。',
  },
  {
    id: 'mimo',
    kind: 'tts',
    group: 'vendor',
    vendor: 'mimo',
    auto: true,
    locked: true,
    label: 'MiMo TTS · API 直连（官方按量）',
    protocol: 'chat-audio',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    models: MIMO_TTS_MODELS,
    voice: 'mimo_default',
    apiKeyEnv: 'MIMO_API_KEY',
    keyless: false,
    notes: 'chat/completions + audio；voiceclone 需要参考音频，voicedesign 需要音色描述。官方 sk- key 与 Token Plan 的 tp- key 不通用。',
  },
  {
    id: 'minimax-token-plan',
    kind: 'tts',
    group: 'vendor',
    vendor: 'minimax',
    auto: true,
    locked: true,
    label: 'MiniMax TTS · Token Plan（M Plan）',
    protocol: 'minimax',
    baseUrl: 'https://api.minimax.cn',
    model: 'speech-02-hd',
    models: MINIMAX_TTS_MODELS,
    voice: 'female-shaonv',
    apiKeyEnv: 'M_PLAN_API_KEY',
    keyless: false,
    notes: 't2a_v2；音频以十六进制返回；业务码 2056 = Token Plan 用量上限。',
  },
  {
    id: 'minimax-cn',
    kind: 'tts',
    group: 'vendor',
    vendor: 'minimax',
    auto: true,
    locked: true,
    label: 'MiniMax TTS · API 直连（api.minimax.cn）',
    protocol: 'minimax',
    baseUrl: 'https://api.minimax.cn',
    model: 'speech-02-hd',
    models: MINIMAX_TTS_MODELS,
    voice: 'female-shaonv',
    apiKeyEnv: 'MINIMAX_API_KEY',
    keyless: false,
    notes: '与 M Plan 同一端点、不同 key；部分旧账户需要 Group ID。',
  },

  // ── 任意 OpenAI 协议兼容 ────────────────────────────────────────────────
  {
    id: 'openai',
    kind: 'tts',
    group: 'compatible',
    vendor: 'openai',
    auto: true,
    locked: false,
    label: 'OpenAI 兼容 · /audio/speech（自定义端点）',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    apiKeyEnv: 'OPENAI_API_KEY',
    keyless: false,
    notes: '任何实现 POST /audio/speech 的网关都能用；端点、模型、音色都可改',
  },

  // ── 免密钥免费方案 ──────────────────────────────────────────────────────
  {
    id: 'baidu',
    kind: 'tts',
    group: 'free',
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
    group: 'free',
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
    group: 'free',
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
    group: 'control',
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
 * 旧 id → 新 id 的兼容别名。
 *
 * **只认旧名字，不出现在下拉里。** 已经存过 `ttsProvider: 'minimax'` 的
 * 用户不该因为一次重命名就掉回浏览器音色；面板下拉也不该列出两个
 * 一模一样的「MiniMax」。
 *
 * @param {object} preset
 * @param {string} id
 */
function aliasOf(preset, id) {
  return {
    ...preset,
    id,
    hidden: true,
    auto: false,
    aliasOf: preset.id,
    label: `${preset.label}（旧 id ${id}）`,
  }
}

ASR_PRESETS.push(
  // 旧 id `minimax` 指向国际站 api.minimaxi.com；直连现在统一到中国站 api.minimax.cn。
  aliasOf(ASR_PRESETS.find(preset => preset.id === 'minimax-cn'), 'minimax'),
)

TTS_PRESETS.push(
  aliasOf(TTS_PRESETS.find(preset => preset.id === 'minimax-cn'), 'minimax'),
)

/**
 * 内部用：ASR 服务表（不含控制项，含兼容别名）。
 *
 * @type {Record<string, object>}
 */
export const ASR_PROVIDERS = Object.fromEntries(
  ASR_PRESETS.filter(preset => preset.server === true).map(preset => [preset.id, preset]),
)

/** 内部用：TTS 服务表（含免密钥，含兼容别名）。 */
export const TTS_PROVIDERS = Object.fromEntries(
  TTS_PRESETS.filter(preset => preset.control !== true).map(preset => [preset.id, preset]),
)

/** `auto` 的 TTS 候选顺序（按服务表里的声明顺序）。 */
export const TTS_AUTO_ORDER = TTS_PRESETS.filter(preset => preset.auto === true).map(preset => preset.id)

/** `auto` 的 ASR 候选顺序（宿主之后、浏览器之前）。 */
export const ASR_AUTO_ORDER = ASR_PRESETS.filter(preset => preset.auto === true).map(preset => preset.id)

/** 某个 kind 的全部设置值（含控制项与兼容别名）——`paths.js` 的枚举真源。 */
export function providerIds(kind) {
  return (kind === 'asr' ? ASR_PRESETS : TTS_PRESETS).map(preset => preset.id)
}

/**
 * 把旧 id 归一到当前 id。
 *
 * @param {'asr'|'tts'} kind
 * @param {unknown} id
 * @returns {string}
 */
export function normalizeProviderId(kind, id) {
  const name = typeof id === 'string' ? id.trim().toLowerCase() : ''
  if (name === '') return 'auto'
  const table = kind === 'asr' ? ASR_PROVIDERS : TTS_PROVIDERS
  const preset = table[name]
  if (preset?.aliasOf !== undefined) return preset.aliasOf
  return name
}

/**
 * 给面板的完整预设表（识别在前、播报在后，各自按声明顺序）。
 *
 * 只回传界面要用的字段——不把内部的 `auto` / `control` / `server` / `aliasOf`
 * 标记泄漏出去，免得前端又长出第二套判断。`hidden` 的兼容别名不出现。
 *
 * @returns {Array<object>}
 */
export function voicePresets() {
  return [...ASR_PRESETS, ...TTS_PRESETS]
    .filter(preset => preset.hidden !== true)
    .map(preset => ({
      kind: preset.kind,
      id: preset.id,
      group: preset.group,
      groupLabel: GROUP_LABELS[preset.group] ?? '',
      vendor: preset.vendor ?? '',
      label: preset.label,
      protocol: preset.protocol,
      protocolLabel: protocolLabel(preset.protocol),
      baseUrl: preset.baseUrl,
      model: preset.model,
      models: preset.models ?? [],
      voice: preset.voice,
      apiKeyEnv: preset.apiKeyEnv,
      keyless: preset.keyless,
      locked: preset.locked === true,
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
