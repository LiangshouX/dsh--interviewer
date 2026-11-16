import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  measureFluency, summarizeFluency, countChars, countFillers, countRepeats, countCorrections, LONG_PAUSE_MS,
} from '../src/host/fluency.js'
import { InterviewService } from '../src/host/service.js'

test('没有任何测量时给出零值，而不是编造数字', () => {
  const metrics = measureFluency({})
  assert.equal(metrics.segments, 0)
  assert.equal(metrics.speechMs, 0)
  assert.equal(metrics.pauseCount, 0)
  assert.equal(metrics.speechRate, 0)
  assert.ok(metrics.notes.length > 0, '必须带"这是启发式测量"的说明')
})

test('段间停顿只统计超过门槛的，并取最长', () => {
  const metrics = measureFluency({
    text: '我做过一个项目',
    segments: [
      { speechMs: 2000, silenceMs: 400, gapBeforeMs: 0 },
      { speechMs: 1500, silenceMs: 450, gapBeforeMs: LONG_PAUSE_MS + 1200 },
      { speechMs: 1000, silenceMs: 0, gapBeforeMs: 100 },
    ],
  })
  assert.equal(metrics.segments, 3)
  assert.equal(metrics.speechMs, 4500)
  assert.equal(metrics.silenceMs, 850)
  assert.equal(metrics.pauseCount, 1, '只有 1500ms 那次算长停顿')
  assert.equal(metrics.longestPauseMs, 1500)
  assert.deepEqual(metrics.pausesMs, [1500])
})

test('语速按「字/秒」算，中英混说按字符与单词近似', () => {
  assert.equal(countChars('我做了 React 项目'), 5 + 1)
  const metrics = measureFluency({ text: '一二三四五六七八九十', segments: [{ speechMs: 2000, silenceMs: 0 }] })
  assert.equal(metrics.chars, 10)
  assert.equal(metrics.speechRate, 5)
})

test('口头语按词表计数，长词优先（「就是说」不算成「说」）', () => {
  const fillers = countFillers('那个那个，就是说，呃，我觉得')
  const byWord = Object.fromEntries(fillers.map(item => [item.word, item.count]))
  assert.equal(byWord['那个'], 2)
  assert.equal(byWord['就是说'], 1)
  assert.equal(byWord['呃'], 1)
})

test('重复只算"立刻重复"，自我修正单独计', () => {
  assert.equal(countRepeats('我我我觉得这个这个方案'), 2)
  assert.equal(countRepeats('我觉得这个方案'), 0)
  assert.equal(countCorrections('不是，我是说另一个方案'), 1)
  assert.equal(countCorrections('我做过三个方案'), 0)
})

test('整场汇总只算候选人、只算有语流的那几轮', () => {
  const summary = summarizeFluency([
    { role: 'interviewer', text: '请自我介绍', meta: {} },
    { role: 'candidate', text: '你好', meta: { fluency: { speechMs: 3000, silenceMs: 500, chars: 12, pauseCount: 1, longestPauseMs: 800, fillerCount: 2, repeats: 0, corrections: 0 } } },
    { role: 'candidate', text: '然后呢', meta: {} },
    { role: 'candidate', text: '我做过', meta: { fluency: { speechMs: 1000, silenceMs: 0, chars: 3, pauseCount: 0, longestPauseMs: 0, fillerCount: 0, repeats: 1, corrections: 0 } } },
  ])
  assert.equal(summary.turns, 2)
  assert.equal(summary.speechMs, 4000)
  assert.equal(summary.fillerCount, 2)
  assert.equal(summary.repeats, 1)
  assert.equal(summary.speechRate, 3.8)
  assert.equal(summarizeFluency([]), undefined)
})

test('一轮回答落盘时，Host 端把原始测量算成指标（单一实现）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fluency-'))
  try {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const session = await service.createSession({ title: '语流测试' })
    await service.appendTurn(session.id, {
      role: 'candidate',
      text: '那个，我做过一个项目，不是，我是说两个。',
      meta: {
        source: 'panel',
        fluency: {
          segments: [
            { speechMs: 2200, silenceMs: 300, gapBeforeMs: 0, energyCv: 0.3 },
            { speechMs: 1800, silenceMs: 450, gapBeforeMs: 900, energyCv: 0.5 },
          ],
        },
      },
    })
    const rows = await service.getTranscript(session.id)
    const metrics = rows[0].meta.fluency
    assert.equal(metrics.segments, 2)
    assert.equal(metrics.speechMs, 4000)
    assert.equal(metrics.pauseCount, 1)
    assert.equal(metrics.longestPauseMs, 900)
    assert.equal(metrics.fillerCount, 1)
    assert.equal(metrics.corrections, 1)
    assert.ok(metrics.speechRate > 0)
    assert.ok(Array.isArray(metrics.notes))

    const state = await service.getState(session.id)
    assert.equal(state.fluency.turns, 1)
    assert.equal(state.fluency.speechMs, 4000)

    const context = await service.getAgentContext(session.id)
    assert.equal(context.fluency.turns, 1, '面试官上下文里要能读到语流')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('客户端上报的坏数据不会把落盘搞崩', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fluency-bad-'))
  try {
    const service = new InterviewService({ config: { workspaceRoot: root }, ctx: { get: () => undefined } })
    const session = await service.createSession({ title: '坏数据' })
    await service.appendTurn(session.id, {
      role: 'candidate',
      text: '嗯嗯',
      meta: { fluency: { segments: [{ speechMs: 'x' }, null, { silenceMs: -5 }] } },
    })
    const rows = await service.getTranscript(session.id)
    assert.equal(rows[0].meta.fluency.segments, 0, '无效段被丢弃，不产生 NaN')
    assert.equal(rows[0].meta.fluency.speechMs, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
