#!/usr/bin/env node
/**
 * 锚点复核：验证技术实现方案里引用的代码位置是否仍然准确。
 *
 * 用法：
 *   node scripts/check-plan-anchors.mjs            # 复核：逐条打印行号，有失配退出码 1
 *   node scripts/check-plan-anchors.mjs --update   # 同步上游后：重扫并写回锚点表
 *
 * 锚点用**内容特征串**定位而不是硬编码行号 —— 上游位移不会误报；
 * 上游真改了那一行才报 `NOT_FOUND`，需要人工确认。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELF = resolve(ROOT, 'scripts', 'check-plan-anchors.mjs')

/**
 * 锚点表：`[文件, 特征串, 说明]`。
 * 特征串必须是**那一行里稳定且唯一**的片段——优先选函数名/常量名，
 * 不要选会跟着版本改的字面量。
 */
const ANCHORS = [
  // ── 客户端：语音（TTS 播放 / ASR 包络）────────────────────────
  ['src/client/60-voice.js', 'function unlockAudio', '音频解锁'],
  ['src/client/60-voice.js', 'const stop = useCallback', '播报停止'],
  ['src/client/60-voice.js', 'typeof result.audioBase64', '服务端音频 base64'],
  ['src/client/60-voice.js', 'const speakBrowser = useCallback', '浏览器音色兜底'],
  ['src/client/60-voice.js', 'const speak = useCallback', '播报入口'],
  ['src/client/60-voice.js', 'audioRef.current = new Audio()', '播报音频元素'],
  ['src/client/60-voice.js', 'echoCancellation: true, noiseSuppression: true', 'ASR 麦克风（回声消除已补）'],
  ['src/client/60-voice.js', 'const attachAnalyser = useCallback', '播报音频接分析器（口型）'],
  ['src/client/60-voice.js', 'const readLevel = useCallback', '非响应式音量通道'],
  ['src/client/60-voice.js', 'processor.onaudioprocess', 'ASR 帧回调'],
  ['src/client/60-voice.js', 'Math.sqrt(sum / input.length)', '现成 RMS 算法'],

  // ── 客户端：虚拟面试官 ────────────────────────────────────────
  ['src/client/61-avatar.js', 'function loadAvatarRuntime', '运行时按需加载'],
  ['src/client/61-avatar.js', 'function useAvatar({', '形象 hook'],
  ['src/client/61-avatar.js', 'avatar.setVoiceLevel(', '外部驱动口型'],
  ['src/client/61-avatar.js', 'function avatarPose', '相态 → 姿态映射'],
  ['src/client/61-avatar.js', 'prefers-reduced-motion', '减少动效降级'],

  // ── 客户端：面试中视图（状态机 / 舞台）──────────────────────
  ['src/client/80-views.js', 'function LiveView(props)', '面试中视图'],
  ['src/client/80-views.js', 'const tts = useSpeech(', '播报 hook'],
  ['src/client/80-views.js', 'const videoRef = useRef(null)', '候选人画面 ref'],
  ['src/client/80-views.js', 'const [preparing, setPreparing]', '备设备中间态'],
  ['src/client/80-views.js', 'const [turnPhase, setTurnPhase] = useState', '话轮状态机'],
  ['src/client/80-views.js', 'const ttsRef = useRef(tts)', 'useSpeech 结果的 ref 持有（口型通道照此模式）'],
  ['src/client/80-views.js', 'armed: running && !paused', '半双工门控 armed'],
  ['src/client/80-views.js', 'judge: autoDetectActive', '半双工门控 judge'],
  ['src/client/80-views.js', 'const element = videoRef.current', '挂摄像头流'],
  ['src/client/80-views.js', 'questioning → listening', '播报结束 → listening'],
  ['src/client/80-views.js', "const stage = h('div'", '舞台容器'],
  ['src/client/80-views.js', "position: 'relative', minWidth: 0", '舞台定位'],
  ['src/client/80-views.js', "borderRadius: RADIUS.lg, overflow: 'hidden'", '舞台裁切'],
  ['src/client/80-views.js', "h('video', {", '候选人画面'],
  ['src/client/80-views.js', "h('img', {", '宿主画面'],

  // ── 客户端：摄像头路径（有 echoCancellation 的正确样板）──────
  ['src/client/50-hooks.js', 'echoCancellation: true', '摄像头音频约束（样板）'],

  // ── Host：路由 ─────────────────────────────────────────────
  ['src/host/api.js', 'const CAMERA_STREAM_PATH', '非 JSON 路由先例'],
  ['src/host/api.js', 'if (url.pathname === CAMERA_STREAM_PATH)', '摄像头流分支（资源路由的插入先例）'],
  ['src/host/api.js', 'export function isTrustedRequest', '信任围栏'],
  ['src/host/api.js', 'function sendJson', 'JSON 响应'],
  ['src/host/api.js', 'export function registerApi', '路由注册'],
  ['src/host/api.js', 'const prefix = `${API_PREFIX}/api/`', '资源路由要插在它之前'],

  // ── Host：路径与设置 ───────────────────────────────────────
  ['src/host/paths.js', 'export const PACKAGE_DIR', '包根目录'],
  ['src/host/paths.js', 'export const ASSET_DIR', '包内只读素材目录'],
  ['src/host/paths.js', 'export const API_PREFIX', '路由前缀'],
  ['src/host/paths.js', 'export const SETTING_SPECS', '设置白名单'],
  ['src/host/paths.js', 'export const BUNDLE_DEFAULTS', '发版默认值'],
  ['src/host/paths.js', '必须与 cordis.patch.yml', 'BUNDLE_DEFAULTS 一致性注释'],
  ['src/host/paths.js', 'export function resolveConfig', '配置归一'],
  ['src/host/avatar.js', 'export function createAvatarService', '形象资源服务'],
]

// ── 锚点表（由 --update 重写）────────────────────────────────────
// ANCHORS:BEGIN
// | 文件 | 行号 | 内容 | 特征串 |
// |---|---|---|---|
// | `src/client/60-voice.js` | 75 | 音频解锁 | `function unlockAudio` |
// | `src/client/60-voice.js` | 180 | 播报停止 | `const stop = useCallback` |
// | `src/client/60-voice.js` | 205 | 服务端音频 base64 | `typeof result.audioBase64` |
// | `src/client/60-voice.js` | 220 | 浏览器音色兜底 | `const speakBrowser = useCallback` |
// | `src/client/60-voice.js` | 254 | 播报入口 | `const speak = useCallback` |
// | `src/client/60-voice.js` | 267 | 播报音频元素 | `audioRef.current = new Audio()` |
// | `src/client/60-voice.js` | 502 | ASR 麦克风（回声消除已补） | `echoCancellation: true, noiseSuppression: true` |
// | `src/client/60-voice.js` | 129 | 播报音频接分析器（口型） | `const attachAnalyser = useCallback` |
// | `src/client/60-voice.js` | 162 | 非响应式音量通道 | `const readLevel = useCallback` |
// | `src/client/60-voice.js` | 530 | ASR 帧回调 | `processor.onaudioprocess` |
// | `src/client/60-voice.js` | 534 | 现成 RMS 算法 | `Math.sqrt(sum / input.length)` |
// | `src/client/61-avatar.js` | 41 | 运行时按需加载 | `function loadAvatarRuntime` |
// | `src/client/61-avatar.js` | 178 | 形象 hook | `function useAvatar({` |
// | `src/client/61-avatar.js` | 264 | 外部驱动口型 | `avatar.setVoiceLevel(` |
// | `src/client/61-avatar.js` | 126 | 相态 → 姿态映射 | `function avatarPose` |
// | `src/client/61-avatar.js` | 101 | 减少动效降级 | `prefers-reduced-motion` |
// | `src/client/80-views.js` | 1892 | 面试中视图 | `function LiveView(props)` |
// | `src/client/80-views.js` | 1906 | 播报 hook | `const tts = useSpeech(` |
// | `src/client/80-views.js` | 1907 | 候选人画面 ref | `const videoRef = useRef(null)` |
// | `src/client/80-views.js` | 1913 | 备设备中间态 | `const [preparing, setPreparing]` |
// | `src/client/80-views.js` | 1927 | 话轮状态机 | `const [turnPhase, setTurnPhase] = useState` |
// | `src/client/80-views.js` | 1949 | useSpeech 结果的 ref 持有（口型通道照此模式） | `const ttsRef = useRef(tts)` |
// | `src/client/80-views.js` | 2031 | 半双工门控 armed | `armed: running && !paused` |
// | `src/client/80-views.js` | 2034 | 半双工门控 judge | `judge: autoDetectActive` |
// | `src/client/80-views.js` | 2078 | 挂摄像头流 | `const element = videoRef.current` |
// | `src/client/80-views.js` | 2456 | 播报结束 → listening | `questioning → listening` |
// | `src/client/80-views.js` | 3031 | 舞台容器 | `const stage = h('div'` |
// | `src/client/80-views.js` | 3035 | 舞台定位 | `position: 'relative', minWidth: 0` |
// | `src/client/80-views.js` | 3041 | 舞台裁切 | `borderRadius: RADIUS.lg, overflow: 'hidden'` |
// | `src/client/80-views.js` | 3051 | 候选人画面 | `h('video', {` |
// | `src/client/80-views.js` | 3064 | 宿主画面 | `h('img', {` |
// | `src/client/50-hooks.js` | 309 | 摄像头音频约束（样板） | `echoCancellation: true` |
// | `src/host/api.js` | 26 | 非 JSON 路由先例 | `const CAMERA_STREAM_PATH` |
// | `src/host/api.js` | 137 | 摄像头流分支（资源路由的插入先例） | `if (url.pathname === CAMERA_STREAM_PATH)` |
// | `src/host/api.js` | 57 | 信任围栏 | `export function isTrustedRequest` |
// | `src/host/api.js` | 74 | JSON 响应 | `function sendJson` |
// | `src/host/api.js` | 119 | 路由注册 | `export function registerApi` |
// | `src/host/api.js` | 165 | 资源路由要插在它之前 | `const prefix = `${API_PREFIX}/api/`` |
// | `src/host/paths.js` | 35 | 包根目录 | `export const PACKAGE_DIR` |
// | `src/host/paths.js` | 50 | 包内只读素材目录 | `export const ASSET_DIR` |
// | `src/host/paths.js` | 53 | 路由前缀 | `export const API_PREFIX` |
// | `src/host/paths.js` | 136 | 设置白名单 | `export const SETTING_SPECS` |
// | `src/host/paths.js` | 355 | 发版默认值 | `export const BUNDLE_DEFAULTS` |
// | `src/host/paths.js` | 352 | BUNDLE_DEFAULTS 一致性注释 | `必须与 cordis.patch.yml` |
// | `src/host/paths.js` | 408 | 配置归一 | `export function resolveConfig` |
// | `src/host/avatar.js` | 172 | 形象资源服务 | `export function createAvatarService` |
// ANCHORS:END

/** 把文件读成行数组。 */
async function linesOf(file) {
  return (await readFile(resolve(ROOT, file), 'utf8')).split('\n')
}

/** 找到特征串第一次出现的行号（1-based）。 */
function findLine(lines, needle) {
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(needle)) return index + 1
  }
  return undefined
}

/**
 * 跑一遍复核。
 *
 * @returns {Promise<{ok: boolean, rows: Array<object>}>}
 */
export async function check() {
  const rows = []
  for (const [file, needle, label] of ANCHORS) {
    let lines
    try {
      lines = await linesOf(file)
    } catch {
      rows.push({ file, needle, label, line: undefined, status: 'MISSING_FILE' })
      continue
    }
    const line = findLine(lines, needle)
    if (line === undefined) {
      rows.push({ file, needle, label, line: undefined, status: 'NOT_FOUND' })
      continue
    }
    rows.push({ file, needle, label, line, status: 'OK' })
  }
  return { ok: rows.every(row => row.status === 'OK'), rows }
}

/**
 * 把扫描结果写成一张 markdown 表，替换掉本文件的锚点表块。
 *
 * **标记必须按行首匹配。** 用 `indexOf` 搜会命中代码里 `'// ANCHORS:BEGIN'`
 * 这个字符串字面量（它比注释块靠前），于是更新时会把脚本自己改坏。
 * 行锚定的正则只认真正独占一行的注释。
 */
const BEGIN_RE = /^\/\/ ANCHORS:BEGIN$/m
const END_RE = /^\/\/ ANCHORS:END$/m

async function updateTable() {
  const { rows } = await check()
  const body = rows.map(row => (
    `// | \`${row.file}\` | ${row.line ?? '—'} | ${row.label} | \`${row.needle}\` |`
  )).join('\n')
  const table = [
    '// ANCHORS:BEGIN',
    '// | 文件 | 行号 | 内容 | 特征串 |',
    '// |---|---|---|---|',
    body,
    '// ANCHORS:END',
  ].join('\n')
  const self = await readFile(SELF, 'utf8')
  const begin = self.match(BEGIN_RE)
  const end = self.match(END_RE)
  if (begin === null || end === null) throw new Error('锚点表标记丢了')
  const next = self.slice(0, begin.index) + table + self.slice(end.index + end[0].length)
  await writeFile(SELF, next, 'utf8')
  return rows
}

// ── CLI ────────────────────────────────────────────────────────
if (process.argv[1] !== undefined && process.argv[1].endsWith('check-plan-anchors.mjs')) {
  if (process.argv.includes('--update')) {
    const rows = await updateTable()
    const bad = rows.filter(row => row.status !== 'OK')
    console.log(`锚点表已更新：${rows.length - bad.length}/${rows.length} 命中`)
    if (bad.length > 0) {
      for (const row of bad) console.log(`  ✗ ${row.file} — ${row.label}（${row.status}）：${row.needle}`)
      process.exitCode = 1
    }
    process.exit(process.exitCode ?? 0)
  }
  const { ok, rows } = await check()
  for (const row of rows) {
    const mark = row.status === 'OK' ? '✓' : '✗'
    console.log(`${mark} ${String(row.line ?? '—').padStart(5)}  ${row.file}  ${row.label}`)
  }
  console.log(ok ? '\n全部锚点命中。' : '\n有锚点失配 —— 上游改了代码，需要人工确认。')
  process.exitCode = ok ? 0 : 1
}
