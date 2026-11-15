import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTextFromHtml, splitJobDescription, decodeEntities } from '../src/host/html.js'

test('剥掉脚本与样式，只留正文', () => {
  const html = `<html><head><style>.x{color:red}</style><script>alert(1)</script></head>
    <body><div class="job-detail"><h1>高级后端工程师</h1><p>负责订单系统</p></div></body></html>`
  const result = extractTextFromHtml(html)
  assert.match(result.text, /高级后端工程师/)
  assert.match(result.text, /负责订单系统/)
  assert.doesNotMatch(result.text, /alert\(1\)/)
  assert.doesNotMatch(result.text, /color:red/)
})

test('JD 按「岗位职责 / 任职要求 / 加分项」切段', () => {
  const text = [
    '高级后端工程师',
    '岗位职责：',
    '负责订单系统稳定性。',
    '任职要求：',
    '5 年以上 Java 经验，熟悉分布式。',
    '加分项：',
    '有开源项目经验。',
  ].join('\n')
  const sections = splitJobDescription(text)
  assert.match(sections.responsibilities, /订单系统稳定性/)
  assert.match(sections.requirements, /Java 经验/)
  assert.match(sections.bonus, /开源项目/)
  assert.match(sections.overview, /高级后端工程师/)
})

test('没有小标题的 JD 不会被编造出分段', () => {
  const sections = splitJobDescription('就一句话的岗位描述。')
  assert.equal(sections.responsibilities, '')
  assert.equal(sections.requirements, '')
  assert.match(sections.overview, /就一句话/)
})

test('HTML 实体被解开', () => {
  assert.equal(decodeEntities('A &amp; B &lt;tag&gt; &#65;'), 'A & B <tag> A')
})
