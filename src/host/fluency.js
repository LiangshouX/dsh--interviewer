/**
 * 语流（fluency）：从「怎么说」里读出「说得怎么样」。
 *
 * **为什么需要它。** 一场模拟面试如果只留下文字，就丢掉了最像真人的部分：
 * 停顿、重复、口头语、越说越快。而这些东西**不需要流式识别**——它们本来
 * 就在音频帧里（VAD 的时间线），只是以前被扔掉了。
 *
 * **责任边界。**
 *  - 客户端只上报**原始测量**：每段的说话时长、静音时长、段间停顿、能量波动。
 *  - 指标在这里算（纯函数，可测），并写进那轮转录的 `meta.fluency`。
 *  - **不做评分。** 输出的是观察值，不是"表达能力 73 分"。
 *
 * **必须承认的局限（写在 `notes` 里，别让下游忘掉）：**
 *  - 文本类指标依赖识别结果；识别器会把「呃/嗯」这类填充词规范化掉，
 *    所以口吃/犹豫的主要证据是**音频侧的停顿与重复**，不是文字。
 *  - 麦克风回声、键盘声、房间混响都会抬高静音段的能量，阈值只能尽量保守。
 *  - 语速按「字/秒」算，中英混说时按字符数近似。
 */

/** 一个停顿算「长停顿」的门槛（毫秒）。人说话的自然换气大约 200–300ms。 */
export const LONG_PAUSE_MS = 300

/** 口头语词表。**保守**为主：宁可漏，不可冤枉。 */
const FILLERS = ['呃', '嗯', '额', '啊', '那个', '就是说', '怎么说呢', '这个']

/** 自我修正的标记词。 */
const CORRECTION_PATTERNS = [/不是[，,]?\s*我(?:是)?说/, /我说错/, /重新说/, /不对[，,]/, /换(?:个|一种)说法/]

/** 一段音频的原始测量（客户端上报的形状）。 */
export function emptySegment() {
  return { speechMs: 0, silenceMs: 0, gapBeforeMs: 0, energyCv: 0 }
}

/**
 * Turn raw per-segment measurements into the metrics we persist.
 *
 * @param {{text?: string, segments?: Array<{speechMs?: number, silenceMs?: number, gapBeforeMs?: number, energyCv?: number}>}} input
 * @returns {object}
 */
export function measureFluency(input = {}) {
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  const segments = Array.isArray(input.segments) ? input.segments : []

  let speechMs = 0
  let silenceMs = 0
  let gaps = []
  let energyWeighted = 0
  let energyWeight = 0
  let segmentCount = 0

  for (const segment of segments) {
    const speech = clampNumber(segment?.speechMs, 0, 10 * 60 * 1000)
    const silence = clampNumber(segment?.silenceMs, 0, 10 * 60 * 1000)
    const gap = clampNumber(segment?.gapBeforeMs, 0, 10 * 60 * 1000)
    if (speech + silence <= 0) continue
    segmentCount += 1
    speechMs += speech
    silenceMs += silence
    if (gap > 0) gaps.push(gap)
    const cv = clampNumber(segment?.energyCv, 0, 10)
    if (cv > 0) {
      energyWeighted += cv * speech
      energyWeight += speech
    }
  }

  const pauses = gaps.filter(gap => gap >= LONG_PAUSE_MS)
  const longestPauseMs = pauses.length === 0 ? 0 : Math.max(...pauses)
  const speechSeconds = speechMs / 1000
  const chars = countChars(text)
  const speechRate = speechSeconds > 0.5 ? round(chars / speechSeconds, 1) : 0

  const fillers = countFillers(text)
  const fillerCount = fillers.reduce((sum, item) => sum + item.count, 0)

  return {
    version: 1,
    segments: segmentCount,
    speechMs: Math.round(speechMs),
    silenceMs: Math.round(silenceMs),
    pauseCount: pauses.length,
    longestPauseMs: Math.round(longestPauseMs),
    pausesMs: pauses.map(gap => Math.round(gap)),
    speechRate,
    chars,
    fillers,
    fillerCount,
    repeats: countRepeats(text),
    corrections: countCorrections(text),
    energyCv: energyWeight > 0 ? round(energyWeighted / energyWeight, 2) : 0,
    notes: notesFor(text, speechMs),
  }
}

/**
 * Aggregate every measured turn into one session-level observation.
 *
 * @param {Array<{role?: string, text?: string, meta?: {fluency?: object}}>} rows transcript rows
 */
export function summarizeFluency(rows) {
  const measured = (Array.isArray(rows) ? rows : [])
    .filter(row => row?.role === 'candidate' && row?.meta?.fluency !== undefined && typeof row.meta.fluency === 'object')
    .map(row => row.meta.fluency)
  if (measured.length === 0) return undefined

  const speechMs = sum(measured, item => item.speechMs)
  const silenceMs = sum(measured, item => item.silenceMs)
  const pauseCount = sum(measured, item => item.pauseCount)
  const fillerCount = sum(measured, item => item.fillerCount)
  const repeats = sum(measured, item => item.repeats)
  const corrections = sum(measured, item => item.corrections)
  const longestPauseMs = Math.max(0, ...measured.map(item => numberOr(item.longestPauseMs, 0)))
  const speechSeconds = speechMs / 1000
  const chars = sum(measured, item => item.chars)

  return {
    turns: measured.length,
    speechMs,
    silenceMs,
    speechRate: speechSeconds > 0.5 ? round(chars / speechSeconds, 1) : 0,
    pauseCount,
    longestPauseMs,
    fillerCount,
    repeats,
    corrections,
    notes: [
      '语流指标来自音频帧与识别文本的启发式测量，不是能力评分。',
      '填充词会被识别器规范化，所以「口吃/犹豫」主要看停顿与重复。',
    ],
  }
}

/** Count CJK characters plus latin words. */
export function countChars(text) {
  const value = typeof text === 'string' ? text : ''
  const cjk = (value.match(/[\u4e00-\u9fff]/g) ?? []).length
  const latin = (value.match(/[A-Za-z0-9]+/g) ?? []).length
  return cjk + latin
}

/** Count filler words, longest first so「就是说」不会被算成「说」。 */
export function countFillers(text) {
  const value = typeof text === 'string' ? text : ''
  if (value === '') return []
  const ordered = [...FILLERS].sort((left, right) => right.length - left.length)
  let rest = value
  const found = []
  for (const word of ordered) {
    const matches = rest.split(word).length - 1
    if (matches > 0) {
      found.push({ word, count: matches })
      rest = rest.split(word).join('')
    }
  }
  return found.sort((left, right) => right.count - left.count)
}

/**
 * Count stuttered repetitions.
 *
 * 两类：同一汉字连着出现（「我我我」），以及同一个双字词立刻再出现（「这个这个」）。
 * 只统计"立刻重复"，隔开出现的不算。
 *
 * @param {string} text
 */
export function countRepeats(text) {
  const value = typeof text === 'string' ? text : ''
  const charRuns = (value.match(/([\u4e00-\u9fff])\1{1,}/g) ?? []).length
  const wordRuns = (value.match(/([\u4e00-\u9fff]{2})\1/g) ?? []).length
  return charRuns + wordRuns
}

/** Count self-corrections. */
export function countCorrections(text) {
  const value = typeof text === 'string' ? text : ''
  let count = 0
  for (const pattern of CORRECTION_PATTERNS) {
    const matches = value.match(new RegExp(pattern.source, 'g'))
    if (matches !== null) count += matches.length
  }
  return count
}

/** What a reader of these numbers must keep in mind. */
function notesFor(text, speechMs) {
  const notes = []
  if (speechMs < 1000) notes.push('这段太短，指标参考价值有限。')
  if (text === '') notes.push('没有识别文本，只剩音频侧的停顿与能量。')
  notes.push('这是启发式测量，不是能力评分；麦克风回声会抬高静音段能量。')
  return notes
}

/** Sum one numeric field. */
function sum(items, pick) {
  return items.reduce((total, item) => total + numberOr(pick(item), 0), 0)
}

/** A finite number or a fallback. */
function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Clamp a number into a range. */
function clampNumber(value, min, max) {
  const number = numberOr(value, 0)
  return Math.min(max, Math.max(min, number))
}

/** Round to `digits` decimals. */
function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
