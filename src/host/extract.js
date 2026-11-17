/**
 * Getting plain text out of an uploaded resume.
 *
 * **为什么插件要自己解析。** 界面上有一个「上传简历」按钮，用户期待传完就能用。
 * 但插件不该为 PDF 拖进一堆二进制依赖（DSH 插件必须自带一体、随包分发），
 * 也不该假装自己解析不了。
 *
 * 所以这里的策略是**尽力而为 + 如实报告**：
 *
 *   .txt/.md/.json   直接读，最可靠
 *   .docx            自己解 zip（docx 就是 zip + XML），可靠
 *   .pdf             尽力提取（流解码 + 文本算子 + ToUnicode 映射）
 *
 * 任何一种解析出来的文本质量不好，结果里都会带 `warnings`，界面上会把它
 * 显示出来，并同时给出**手动兜底**：粘贴文本，或在 DSH 对话里让助手读文件。
 */
import { inflateRawSync, inflateSync } from 'node:zlib'

/** Result of an extraction attempt. */
export const EXTRACT_KIND = {
  PLAIN: 'plain',
  DOCX: 'docx',
  PDF: 'pdf',
  UNKNOWN: 'unknown',
}

/**
 * Extract text from an uploaded file.
 *
 * @param {{filename?: string, mimeType?: string, buffer: Buffer}} file
 * @param {{plainOnly?: boolean}} [options]
 *   `plainOnly: true`（传 JD 时）只接受纯文本；docx/pdf 一律拒绝并给出出路。
 *   简历没有这个限制——它本来就是 word/pdf 交过来的。
 * @returns {{ok: boolean, kind: string, text: string, warnings: string[], chars: number}}
 */
export function extractTextFromUpload(file, options = {}) {
  const filename = typeof file.filename === 'string' ? file.filename : ''
  const lower = filename.toLowerCase()
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : ''
  const buffer = file.buffer ?? Buffer.alloc(0)

  if (buffer.length === 0) {
    return { ok: false, kind: EXTRACT_KIND.UNKNOWN, text: '', warnings: ['文件是空的'], chars: 0 }
  }

  // 旧版 .doc 是二进制的复合文档格式，本插件不解析它。
  // 但它必须**先于魔数判定**处理：.doc 文件有时也以 PK 开头（OLE 容器），
  // 顺序错了就会得到一句毫无帮助的「不是有效的 zip 文件」。
  if (extension === '.doc') {
    return {
      ok: false,
      kind: EXTRACT_KIND.UNKNOWN,
      text: '',
      warnings: ['旧版 .doc（二进制格式）读不了。存成 .docx 或 .pdf 再传，或者直接把正文粘贴进来。'],
      chars: 0,
    }
  }

  // Sniff by magic bytes: an extension lies more often than a header.
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
  const isPdf = buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF'

  // **JD 只收纯文本。** 简历可以是 docx/pdf（有解析器），JD 没有这个必要：
  // 职位描述本来就是一段可粘贴的文字，多支持一种二进制格式只会多一种乱码来源。
  // 这里用扩展名 + 文件头双判据——扩展名可以改，文件头骗不了人。
  if (options.plainOnly === true) {
    const plainExt = extension === '' || ['.txt', '.md', '.markdown', '.text'].includes(extension)
    if (!plainExt || isZip || isPdf) {
      return {
        ok: false,
        kind: EXTRACT_KIND.UNKNOWN,
        text: '',
        warnings: ['JD 只收纯文本（.txt / .md）。请另存为纯文本再传，或把正文粘贴进来。'],
        chars: 0,
      }
    }
  }

  if (isZip) {
    if (extension === '.docx' || extension === '' || extension === '.docm') {
      return extractDocx(buffer)
    }
    return {
      ok: false,
      kind: EXTRACT_KIND.UNKNOWN,
      text: '',
      warnings: [`这是 zip 包（${extension || '无扩展名'}），不是能读的 Word 文档。请传 .docx，或把正文粘贴进来。`],
      chars: 0,
    }
  }
  if (isPdf) {
    return extractPdf(buffer)
  }
  if (extension === '.docx' || extension === '.pdf') {
    return {
      ok: false,
      kind: EXTRACT_KIND.UNKNOWN,
      text: '',
      warnings: [`文件头和扩展名对不上（${extension}），可能改过扩展名。请传真正的 ${extension === '.docx' ? 'Word 文档' : 'PDF'}，或把正文粘贴进来。`],
      chars: 0,
    }
  }

  const text = decodeText(buffer)
  const trimmed = text.trim()
  if (trimmed === '') {
    return { ok: false, kind: EXTRACT_KIND.PLAIN, text: '', warnings: ['文件里没有可读的文字'], chars: 0 }
  }
  // 二进制文件被当纯文本读进来是最糟的失败：读出来是乱码，
  // 但界面会说「读到了 N 字」。用控制字符比例把它拦下来。
  const control = (trimmed.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) ?? []).length
  if (control > trimmed.length / 50) {
    return {
      ok: false,
      kind: EXTRACT_KIND.UNKNOWN,
      text: '',
      warnings: [options.plainOnly === true
        ? '这看起来不是纯文本。JD 只收 .txt / .md，请另存为纯文本或把正文粘贴进来。'
        : '这看起来是二进制文件，不是文本。请传 .txt/.md/.docx/.pdf，或把正文粘贴进来。'],
      chars: 0,
    }
  }
  return { ok: true, kind: EXTRACT_KIND.PLAIN, text: trimmed, warnings: [], chars: trimmed.length }
}

/**
 * Decode a text buffer, preferring UTF-8.
 *
 * @param {Buffer} buffer
 */
function decodeText(buffer) {
  const utf8 = buffer.toString('utf8')
  // A lot of single-byte encodings decode as UTF-8 into replacement characters.
  if (!utf8.includes('\uFFFD')) return utf8
  return buffer.toString('latin1')
}

/**
 * Extract text from a `.docx` (a zip whose `word/document.xml` holds the text).
 *
 * @param {Buffer} buffer
 */
export function extractDocx(buffer) {
  try {
    const xml = readZipEntry(buffer, 'word/document.xml')
    if (xml === undefined) {
      return {
        ok: false,
        kind: EXTRACT_KIND.DOCX,
        text: '',
        warnings: ['这个 docx 里没有 word/document.xml，可能不是标准 Word 文档。请另存为 .docx 再传，或把正文粘贴进来。'],
        chars: 0,
      }
    }
    const text = docxXmlToText(xml)
    if (text.trim() === '') {
      return {
        ok: false,
        kind: EXTRACT_KIND.DOCX,
        text: '',
        warnings: ['docx 里没有读到文字（可能是纯图片简历）。请把正文粘贴进来。'],
        chars: 0,
      }
    }
    return { ok: true, kind: EXTRACT_KIND.DOCX, text: text.trim(), warnings: [], chars: text.trim().length }
  } catch (error) {
    return {
      ok: false,
      kind: EXTRACT_KIND.DOCX,
      text: '',
      warnings: [`docx 解析失败：${error && error.message ? error.message : String(error)}。请另存为标准 .docx 再传，或把正文粘贴进来。`],
      chars: 0,
    }
  }
}

/**
 * Turn `word/document.xml` into readable text.
 *
 * @param {string} xml
 */
function docxXmlToText(xml) {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * Read one entry out of a zip archive.
 *
 * A minimal zip reader: find the end-of-central-directory record, walk the
 * central directory, then inflate the entry we want. No dependency, no
 * directory traversal, no zip-slip.
 *
 * @param {Buffer} buffer
 * @param {string} entryName
 * @returns {string|undefined}
 */
export function readZipEntry(buffer, entryName) {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd === -1) throw new Error('不是有效的 zip 文件')

  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)

  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')

    if (name === entryName) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const data = buffer.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) return data.toString('utf8')
      if (method === 8) return inflateRawSync(data).toString('utf8')
      throw new Error(`不支持的压缩方式：${method}`)
    }

    offset += 46 + nameLength + extraLength + commentLength
  }
  return undefined
}

/**
 * Locate the end-of-central-directory record.
 *
 * @param {Buffer} buffer
 * @returns {number} the offset, or -1
 */
function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 65557 - 22)
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  return -1
}

/**
 * Extract text from a PDF, best effort.
 *
 * The pipeline: inflate the content streams, read the text-showing operators,
 * and translate character codes through the font's ToUnicode map when the
 * document provides one. PDFs without usable text (scanned images) come back
 * empty — and we say so rather than shipping noise.
 *
 * @param {Buffer} buffer
 */
export function extractPdf(buffer) {
  const warnings = []
  const raw = buffer.toString('latin1')

  const streams = inflatePdfStreams(buffer, raw)
  if (streams.length === 0) {
    return {
      ok: false,
      kind: EXTRACT_KIND.PDF,
      text: '',
      warnings: ['PDF 里没有可解压的文本流——多半是扫描件（图片型简历）。请粘贴文字，或换一个带文本层的 PDF。'],
      chars: 0,
    }
  }

  const toUnicode = collectToUnicodeMaps(streams)
  const pieces = []
  for (const stream of streams) {
    pieces.push(...extractTextOperators(stream, toUnicode))
  }
  const text = pieces.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  if (text === '') {
    return {
      ok: false,
      kind: EXTRACT_KIND.PDF,
      text: '',
      warnings: ['PDF 的文本层读不出内容（可能是扫描件或用了特殊编码）。请粘贴文字，或换一个带文本层的 PDF。'],
      chars: 0,
    }
  }
  // A "text layer" full of replacement characters means the encoding was wrong.
  const garbage = (text.match(/[\uFFFD\u0000-\u0008]/g) ?? []).length
  if (garbage > text.length / 20) {
    warnings.push('PDF 文本层编码不完整，提取结果可能有乱码。请核对预览，必要时改为粘贴文本。')
  }
  return { ok: true, kind: EXTRACT_KIND.PDF, text, warnings, chars: text.length }
}

/**
 * Inflate every flate-encoded stream in the document.
 *
 * @param {Buffer} buffer
 * @param {string} raw the buffer as latin1, for regex work
 * @returns {string[]}
 */
function inflatePdfStreams(buffer, raw) {
  const streams = []
  const pattern = /stream\r?\n/g
  let match
  while ((match = pattern.exec(raw)) !== null) {
    const start = match.index + match[0].length
    const end = raw.indexOf('endstream', start)
    if (end === -1) continue
    const slice = buffer.subarray(start, end)
    // zlib header (0x78) → zlib stream; otherwise raw deflate.
    try {
      streams.push(inflateRawSync(slice).toString('latin1'))
    } catch {
      try {
        streams.push(inflateSync(slice).toString('latin1'))
      } catch {
        // Not a flate stream (or truncated); skip it.
      }
    }
    pattern.lastIndex = end
  }
  return streams
}

/**
 * Collect ToUnicode maps from the document's streams.
 *
 * @param {string[]} streams
 * @returns {Map<string, string>} code → character
 */
function collectToUnicodeMaps(streams) {
  const map = new Map()
  for (const stream of streams) {
    const charPattern = /beginbfchar([\s\S]*?)endbfchar/g
    let block
    while ((block = charPattern.exec(stream)) !== null) {
      const pairPattern = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g
      let pair
      while ((pair = pairPattern.exec(block[1])) !== null) {
        const code = parseInt(pair[1], 16)
        map.set(code, hexToString(pair[2]))
      }
    }
    const rangePattern = /beginbfrange([\s\S]*?)endbfrange/g
    while ((block = rangePattern.exec(stream)) !== null) {
      const rangePattern2 = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g
      let range
      while ((range = rangePattern2.exec(block[1])) !== null) {
        const from = parseInt(range[1], 16)
        const to = parseInt(range[2], 16)
        const start = range[3]
        const base = parseInt(start.slice(0, 4), 16)
        for (let code = from; code <= to && code - from < 65536; code += 1) {
          map.set(code, String.fromCodePoint(base + (code - from)))
        }
      }
    }
  }
  return map
}

/**
 * Decode a hex string of UTF-16BE code units.
 *
 * @param {string} hex
 */
function hexToString(hex) {
  if (hex.length < 4) return String.fromCharCode(parseInt(hex, 16))
  const units = []
  for (let index = 0; index + 3 < hex.length; index += 4) {
    units.push(parseInt(hex.slice(index, index + 4), 16))
  }
  return String.fromCharCode(...units)
}

/**
 * Read the text-showing operators out of one content stream.
 *
 * @param {string} stream
 * @param {Map<string, string>} toUnicode
 * @returns {string[]}
 */
function extractTextOperators(stream, toUnicode) {
  const pieces = []
  const operator = /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|\bTJ\b|\bTj\b|\bTd\b|\bTD\b|\bT\*\b|\bTf\b|\bET\b/g
  let match
  while ((match = operator.exec(stream)) !== null) {
    const token = match[0]
    if (token.startsWith('(')) {
      pieces.push(decodePdfLiteral(token.slice(1, -1), toUnicode))
    } else if (token.startsWith('<')) {
      pieces.push(decodePdfHex(token.slice(1, -1), toUnicode))
    } else if (token === 'Td' || token === 'TD' || token === 'T*' || token === 'ET') {
      pieces.push('\n')
    }
  }
  return pieces
}

/**
 * Decode a PDF literal string.
 *
 * @param {string} literal
 * @param {Map<string, string>} toUnicode
 */
function decodePdfLiteral(literal, toUnicode) {
  const bytes = []
  for (let index = 0; index < literal.length; index += 1) {
    const char = literal[index]
    if (char !== '\\') {
      bytes.push(literal.charCodeAt(index) & 0xff)
      continue
    }
    index += 1
    const next = literal[index]
    if (next === 'n') bytes.push(10)
    else if (next === 'r') bytes.push(13)
    else if (next === 't') bytes.push(9)
    else if (next === 'b' || next === 'f') bytes.push(8)
    else if (next >= '0' && next <= '7') {
      const octal = /^[0-7]{1,3}/.exec(literal.slice(index))
      if (octal) {
        bytes.push(parseInt(octal[0], 8) & 0xff)
        index += octal[0].length - 1
      }
    } else {
      bytes.push(next.charCodeAt(0) & 0xff)
    }
  }
  return bytesToText(bytes, toUnicode)
}

/**
 * Decode a PDF hex string.
 *
 * @param {string} hex
 * @param {Map<string, string>} toUnicode
 */
function decodePdfHex(hex, toUnicode) {
  const clean = hex.replace(/\s+/g, '')
  const bytes = []
  for (let index = 0; index + 1 < clean.length; index += 2) {
    bytes.push(parseInt(clean.slice(index, index + 2), 16))
  }
  return bytesToText(bytes, toUnicode)
}

/**
 * Turn raw character bytes into text, through ToUnicode when we have it.
 *
 * @param {number[]} bytes
 * @param {Map<string, string>} toUnicode
 */
function bytesToText(bytes, toUnicode) {
  if (toUnicode.size > 0) {
    let out = ''
    for (const byte of bytes) {
      const mapped = toUnicode.get(byte)
      out += mapped ?? String.fromCharCode(byte)
    }
    return out
  }
  return Buffer.from(bytes).toString('latin1')
}
