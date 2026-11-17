import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTextFromUpload, readZipEntry } from '../src/host/extract.js'

test('纯文本简历直接读出正文', () => {
  const result = extractTextFromUpload({
    filename: 'cv.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('张三\n后端工程师\n招商银行\n', 'utf8'),
  })
  assert.equal(result.ok, true)
  assert.equal(result.kind, 'plain')
  assert.match(result.text, /招商银行/)
})

test('空文件如实报失败', () => {
  const result = extractTextFromUpload({ filename: 'cv.txt', buffer: Buffer.alloc(0) })
  assert.equal(result.ok, false)
  assert.ok(result.warnings.length > 0)
})

test('旧版 .doc 明确说读不了并给替代路径', () => {
  const result = extractTextFromUpload({ filename: 'cv.doc', buffer: Buffer.from('PK\x03\x04junk') })
  assert.equal(result.ok, false)
  assert.match(result.warnings.join(' '), /\.docx|\.pdf|粘贴/)
})

test('不是 zip 的文件不会冒充 docx 被当纯文本读进去', () => {
  const result = extractTextFromUpload({
    filename: 'fake.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('not really a zip file'),
  })
  assert.equal(result.ok, false)
  assert.match(result.warnings.join(' '), /docx|PDF|粘贴/)
})

test('二进制内容不会被当成文本简历', () => {
  const result = extractTextFromUpload({
    filename: 'resume.dat',
    buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0x00, 0x07, 0x00]),
  })
  assert.equal(result.ok, false)
  assert.match(result.warnings.join(' '), /二进制|粘贴/)
})

test('扩展名与文件头对不上时报错而不是乱读', () => {
  const result = extractTextFromUpload({ filename: 'cv.pdf', buffer: Buffer.from('plain text here') })
  assert.equal(result.ok, false)
  assert.match(result.warnings.join(' '), /扩展名|PDF|粘贴/)
})

test('zip 读取器在损坏文件上抛错而不是返回乱码', () => {
  assert.throws(() => readZipEntry(Buffer.from('definitely not a zip'), 'word/document.xml'))
})

test('JD 上传只收纯文本：docx / pdf 被挡住，并给出粘贴这条出路', () => {
  const docx = extractTextFromUpload(
    { filename: 'jd.docx', buffer: Buffer.from('PK\x03\x04junk') },
    { plainOnly: true },
  )
  assert.equal(docx.ok, false)
  assert.match(docx.warnings.join(' '), /只收纯文本|粘贴/)

  const pdf = extractTextFromUpload(
    { filename: 'jd.pdf', buffer: Buffer.from('%PDF-1.7\n...') },
    { plainOnly: true },
  )
  assert.equal(pdf.ok, false)

  // 扩展名伪装成 .txt 的 PDF 也挡得住——判据是文件头，不是文件名。
  const fake = extractTextFromUpload(
    { filename: 'jd.txt', buffer: Buffer.from('%PDF-1.7\n...') },
    { plainOnly: true },
  )
  assert.equal(fake.ok, false)
  assert.match(fake.warnings.join(' '), /只收纯文本/)

  // 真正的纯文本照常读出。
  const markdown = extractTextFromUpload(
    { filename: 'jd.md', buffer: Buffer.from('# 岗位\n后端工程师\n', 'utf8') },
    { plainOnly: true },
  )
  assert.equal(markdown.ok, true)
  assert.match(markdown.text, /后端工程师/)
})
