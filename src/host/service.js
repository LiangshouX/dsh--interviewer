/**
 * The interview session — the one implementation behind every caller.
 *
 * **The shape of one session on disk**
 *
 *   <workspaceRoot>/workspaces/<session-id>/
 *     session.json      元信息（标题、角色、状态、时间）
 *     resume.txt        简历正文（纯文本）
 *     jd.txt            JD 正文（纯文本）
 *     jd.json           JD 的来源与分段（抓取链接、职责/要求切分）
 *     checklist.json    考点清单（**活文档**，面试中会被调整）
 *     transcript.jsonl  逐轮转录，一行一个 JSON 对象
 *     report.md         面试后的分析报告
 *     recordings/       录像（.webm）与录音（.webm/.mp3）
 *
 * **为什么清单是活文档。** 考点清单是**准备阶段**的产物，但面试是活的：
 * 候选人把某个考点答穿了，就该顺势深挖；候选人某段经历与 JD 完全无关，
 * 就该换一个方向；临场冒出的好问题也该被记下来。所以清单支持
 * `add / update / remove / probe` 四种调整，且**每一处调整都留痕**
 * （`adjustments[]`），事后复盘时能看到「为什么最后问了这些」。
 *
 * **为什么一切从磁盘派生。** 插件不缓存业务状态——缓存由文件 mtime + size
 * 失效。这样界面、agent 工具、报告三边永远看到同一份事实。
 */
import { join, resolve } from 'node:path'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { ensureDataRoot, resolveConfig } from './paths.js'
import {
  appendJsonl, isDirectory, listDirIfExists, readJsonIfExists, readJsonl,
  readTextIfExists, resolveWithin, writeJsonAtomic, writeTextAtomic,
} from './fsx.js'
import { fetchJobDescription } from './jd.js'
import { extractTextFromUpload } from './extract.js'

/** Session lifecycle. */
export const SESSION_STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  RUNNING: 'running',
  DONE: 'done',
}

/** Checklist item levels. */
export const CHECKLIST_LEVEL = {
  CORE: 'core',
  DEEP: 'deep',
  BONUS: 'bonus',
}

/** A session id is a path segment, so it is restricted on purpose. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/**
 * A profile id may contain Chinese (it is often derived from a job title),
 * but never a path separator or a dot — so it cannot escape its root.
 */
const PROFILE_ID_PATTERN = /^[A-Za-z0-9一-鿿][A-Za-z0-9_一-鿿-]{0,80}$/

/** Maximum accepted resume / JD size (characters). */
const MAX_DOC_CHARS = 200000

/**
 * One interview session, with every operation the callers need.
 */
export class InterviewService {
  /**
   * @param {{config?: object, ctx?: object}} deps
   */
  constructor(deps = {}) {
    this.config = resolveConfig(deps.config)
    this.ctx = deps.ctx
    /** Session id the UI last touched; used as the default for agent calls. */
    this.selectedSessionId = undefined
  }

  // ── paths ────────────────────────────────────────────────────────────────

  /**
   * The workspace root — the one place all interview data lives.
   *
   * @returns {Promise<{path: string, source: string, reason: string, exists: boolean, error?: string}>}
   */
  async location() {
    return describeWorkspaceRoot(this.config.workspaceRoot)
  }

  /** The directory holding every session — one interview, one subdirectory. */
  async sessionsDir() {
    const root = await ensureDataRoot(this.config.workspaceRoot)
    if (root.error !== undefined) throw new Error(root.error)
    return join(root.path, 'workspaces')
  }

  /** The directory holding every job profile (岗位档案). */
  async profilesDir() {
    const root = await ensureDataRoot(this.config.workspaceRoot)
    if (root.error !== undefined) throw new Error(root.error)
    return join(root.path, 'profiles')
  }

  /**
   * Resolve one session directory, refusing anything that escapes the root.
   *
   * @param {string} sessionId
   */
  async sessionDir(sessionId) {
    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error(`非法的会话 id：${String(sessionId)}`)
    }
    const root = await this.sessionsDir()
    return resolveWithin(root, sessionId)
  }

  // ── sessions ─────────────────────────────────────────────────────────────

  /**
   * List every session, newest first.
   *
   * @returns {Promise<Array<object>>}
   */
  async listSessions() {
    const root = await this.sessionsDir()
    const names = await listDirIfExists(root)
    const rows = []
    for (const name of names) {
      if (!SESSION_ID_PATTERN.test(name)) continue
      const dir = join(root, name)
      if (!await isDirectory(dir)) continue
      const meta = await readJsonIfExists(join(dir, 'session.json'))
      if (meta === undefined) continue
      const checklist = await this.getChecklist(name)
      rows.push({
        id: name,
        title: meta.title ?? name,
        role: meta.role ?? 'candidate',
        status: meta.status ?? SESSION_STATUS.DRAFT,
        createdAt: meta.createdAt ?? 0,
        updatedAt: meta.updatedAt ?? 0,
        hasResume: (await readTextIfExists(join(dir, 'resume.txt'))) !== undefined,
        hasJd: (await readTextIfExists(join(dir, 'jd.txt'))) !== undefined,
        checklistCount: checklist.items.length,
        probedCount: checklist.items.filter(item => item.probed === true).length,
        hasReport: (await readTextIfExists(join(dir, 'report.md'))) !== undefined,
        dir,
      })
    }
    rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return rows
  }

  /**
   * Create a session.
   *
   * @param {{title?: string, role?: string, resumeText?: string, jdText?: string, jdUrl?: string, jdMeta?: object}} input
   */
  async createSession(input = {}) {
    const root = await this.sessionsDir()
    const id = input.id ?? makeSessionId()
    const dir = await this.sessionDir(id)
    if (await isDirectory(dir)) throw new Error(`会话已存在：${id}`)
    await mkdir(join(dir, 'recordings'), { recursive: true })

    const now = Date.now()
    const meta = {
      id,
      title: typeof input.title === 'string' && input.title.trim() !== '' ? input.title.trim() : `面试 ${formatDate(now)}`,
      role: input.role === 'interviewer' ? 'interviewer' : 'candidate',
      status: SESSION_STATUS.DRAFT,
      createdAt: now,
      updatedAt: now,
      jdUrl: typeof input.jdUrl === 'string' ? input.jdUrl : '',
      profileId: typeof input.profileId === 'string' ? input.profileId : '',
    }
    await writeJsonAtomic(join(dir, 'session.json'), meta)
    await writeJsonAtomic(join(dir, 'checklist.json'), { version: 1, items: [], adjustments: [] })

    if (typeof input.resumeText === 'string' && input.resumeText.trim() !== '') {
      await this.setResume(id, input.resumeText)
    }
    if (typeof input.jdText === 'string' && input.jdText.trim() !== '') {
      await this.setJd(id, { text: input.jdText, url: input.jdUrl ?? '', meta: input.jdMeta })
    }
    return this.getSession(id)
  }

  /**
   * Read one session's metadata.
   *
   * @param {string} sessionId
   */
  async getSession(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta === undefined) throw new Error(`会话不存在：${sessionId}`)
    return { ...meta, dir }
  }

  /**
   * Patch a session's metadata.
   *
   * @param {string} sessionId
   * @param {object} patch
   */
  async updateSession(sessionId, patch) {
    const dir = await this.sessionDir(sessionId)
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta === undefined) throw new Error(`会话不存在：${sessionId}`)
    const allowed = ['title', 'role', 'status', 'jdUrl', 'startedAt', 'endedAt', 'notes']
    for (const key of allowed) {
      if (patch[key] !== undefined) meta[key] = patch[key]
    }
    meta.updatedAt = Date.now()
    await writeJsonAtomic(join(dir, 'session.json'), meta)
    return { ...meta, dir }
  }

  // ── documents ────────────────────────────────────────────────────────────

  /**
   * Store the resume text.
   *
   * @param {string} sessionId
   * @param {string} text
   */
  async setResume(sessionId, text) {
    const dir = await this.sessionDir(sessionId)
    const trimmed = String(text ?? '')
    if (trimmed.length > MAX_DOC_CHARS) {
      throw new Error(`简历太长了（${trimmed.length} 字，上限 ${MAX_DOC_CHARS}）`)
    }
    await writeTextAtomic(join(dir, 'resume.txt'), trimmed)
    await this.touch(sessionId)
    return { chars: trimmed.length }
  }

  /**
   * Store the job description text (and where it came from).
   *
   * @param {string} sessionId
   * @param {{text: string, url?: string, meta?: object}} input
   */
  async setJd(sessionId, input = {}) {
    const dir = await this.sessionDir(sessionId)
    const trimmed = String(input.text ?? '')
    if (trimmed.length > MAX_DOC_CHARS) {
      throw new Error(`JD 太长了（${trimmed.length} 字，上限 ${MAX_DOC_CHARS}）`)
    }
    await writeTextAtomic(join(dir, 'jd.txt'), trimmed)
    await writeJsonAtomic(join(dir, 'jd.json'), {
      url: typeof input.url === 'string' ? input.url : '',
      fetchedAt: Date.now(),
      sections: input.meta?.sections ?? {},
      title: input.meta?.title ?? '',
      warnings: input.meta?.warnings ?? [],
    })
    await this.touch(sessionId)
    return { chars: trimmed.length }
  }

  /**
   * Fetch a JD from a link.
   *
   * The failure path is part of the contract: it says what went wrong **and**
   * what to do instead, so the caller never has to invent a fallback.
   *
   * @param {string} url
   */
  async fetchJd(url) {
    return fetchJobDescription(url, {
      timeoutMs: this.config.jdFetchTimeoutMs,
      maxChars: this.config.jdMaxChars,
    })
  }

  /**
   * Extract text from an uploaded resume file.
   *
   * @param {{filename?: string, mimeType?: string, buffer: Buffer}} file
   */
  async extractResume(file) {
    return extractTextFromUpload(file)
  }

  /**
   * Read the resume and JD as the agent needs them.
   *
   * @param {string} sessionId
   */
  async getDocuments(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const [resume, jd, jdMeta] = await Promise.all([
      readTextIfExists(join(dir, 'resume.txt')),
      readTextIfExists(join(dir, 'jd.txt')),
      readJsonIfExists(join(dir, 'jd.json')),
    ])
    return {
      resume: resume ?? '',
      jd: jd ?? '',
      jdMeta: jdMeta ?? { url: '', sections: {}, warnings: [] },
    }
  }

  // ── checklist ────────────────────────────────────────────────────────────

  /**
   * Read the checklist.
   *
   * @param {string} sessionId
   */
  async getChecklist(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const doc = await readJsonIfExists(join(dir, 'checklist.json'))
    if (doc === undefined) return { version: 1, items: [], adjustments: [] }
    return {
      version: typeof doc.version === 'number' ? doc.version : 1,
      items: Array.isArray(doc.items) ? doc.items : [],
      adjustments: Array.isArray(doc.adjustments) ? doc.adjustments : [],
    }
  }

  /**
   * Replace the checklist (the agent's "here is the plan" call).
   *
   * Items are normalized so the UI never has to defend against missing fields.
   *
   * @param {string} sessionId
   * @param {any[]} items
   */
  async saveChecklist(sessionId, items) {
    if (!Array.isArray(items)) throw new Error('考点清单必须是一个数组')
    const dir = await this.sessionDir(sessionId)
    const existing = await this.getChecklist(sessionId)
    const normalized = items.map((item, index) => normalizeChecklistItem(item, index, existing.items))
    const doc = {
      version: 2,
      updatedAt: Date.now(),
      items: normalized,
      adjustments: existing.adjustments,
    }
    await writeJsonAtomic(join(dir, 'checklist.json'), doc)
    await this.touch(sessionId)
    return doc
  }

  /**
   * Adjust the checklist while the interview is running.
   *
   * @param {string} sessionId
   * @param {object} op
   * @param {'add'|'update'|'remove'|'probe'} op.op
   */
  async mutateChecklist(sessionId, op) {
    const dir = await this.sessionDir(sessionId)
    const doc = await this.getChecklist(sessionId)
    const items = doc.items.map(item => ({ ...item }))
    const now = Date.now()
    let adjustment = { at: now, op: op.op, reason: typeof op.reason === 'string' ? op.reason : '' }

    switch (op.op) {
      case 'add': {
        const item = normalizeChecklistItem({
          id: op.id,
          topic: op.topic,
          why: op.why,
          level: op.level,
          source: op.source,
          tags: op.tags,
        }, items.length, items)
        items.push(item)
        adjustment = { ...adjustment, id: item.id, topic: item.topic }
        break
      }
      case 'update': {
        const target = items.find(item => item.id === op.id)
        if (target === undefined) throw new Error(`清单里没有 id=${op.id} 的考点`)
        if (op.topic !== undefined) target.topic = String(op.topic)
        if (op.why !== undefined) target.why = String(op.why)
        if (op.level !== undefined && CHECKLIST_LEVEL[String(op.level)] !== undefined) target.level = op.level
        if (op.source !== undefined) target.source = String(op.source)
        if (Array.isArray(op.tags)) target.tags = op.tags.map(tag => String(tag))
        adjustment = { ...adjustment, id: target.id }
        break
      }
      case 'remove': {
        const index = items.findIndex(item => item.id === op.id)
        if (index === -1) throw new Error(`清单里没有 id=${op.id} 的考点`)
        const [removed] = items.splice(index, 1)
        adjustment = { ...adjustment, id: removed.id, topic: removed.topic }
        break
      }
      case 'probe': {
        const target = items.find(item => item.id === op.id)
        if (target === undefined) throw new Error(`清单里没有 id=${op.id} 的考点`)
        target.probed = op.probed !== false
        if (op.note !== undefined) target.note = String(op.note)
        if (op.note !== undefined) target.evidence = [...(target.evidence ?? []), { at: now, note: String(op.note) }]
        adjustment = { ...adjustment, id: target.id, probed: target.probed }
        break
      }
      default:
        throw new Error(`未知的清单操作：${String(op.op)}（可用：add / update / remove / probe）`)
    }

    const next = { version: 2, updatedAt: now, items, adjustments: [...doc.adjustments, adjustment] }
    await writeJsonAtomic(join(dir, 'checklist.json'), next)
    await this.touch(sessionId)
    return next
  }

  // ── transcript ───────────────────────────────────────────────────────────

  /**
   * Append one turn to the transcript.
   *
   * @param {string} sessionId
   * @param {{role: string, text: string, meta?: object}} turn
   */
  async appendTurn(sessionId, turn) {
    const dir = await this.sessionDir(sessionId)
    const role = turn.role === 'interviewer' ? 'interviewer' : turn.role === 'system' ? 'system' : 'candidate'
    const text = String(turn.text ?? '').trim()
    if (text === '') throw new Error('空的转录内容不记录')
    const row = {
      ts: Date.now(),
      role,
      text,
      meta: turn.meta !== undefined && typeof turn.meta === 'object' ? turn.meta : {},
    }
    await appendJsonl(join(dir, 'transcript.jsonl'), row)
    await this.touch(sessionId)
    return row
  }

  /**
   * Read the transcript.
   *
   * @param {string} sessionId
   */
  async getTranscript(sessionId) {
    const dir = await this.sessionDir(sessionId)
    return readJsonl(join(dir, 'transcript.jsonl'))
  }

  // ── recordings ───────────────────────────────────────────────────────────

  /**
   * Store a recording that the browser uploaded.
   *
   * The blob arrives base64-encoded; the file is written verbatim.
   *
   * @param {string} sessionId
   * @param {{kind: string, filename?: string, mimeType?: string, dataBase64: string}} input
   */
  async saveRecording(sessionId, input = {}) {
    const dir = await this.sessionDir(sessionId)
    const kind = input.kind === 'audio' ? 'audio' : 'video'
    const mimeType = typeof input.mimeType === 'string' ? input.mimeType : ''
    const extension = extensionFor(mimeType, input.filename, kind)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = sanitizeName(input.filename) || `${kind}-${stamp}`
    const finalName = safeName.includes('.') ? safeName : `${safeName}${extension}`
    const target = resolveWithin(join(dir, 'recordings'), finalName)

    const buffer = Buffer.from(String(input.dataBase64 ?? ''), 'base64')
    if (buffer.length === 0) throw new Error('录音数据是空的')
    await writeFile(target, buffer)
    await this.touch(sessionId)
    return { name: finalName, kind, bytes: buffer.length, path: target }
  }

  /**
   * List the recordings of a session.
   *
   * @param {string} sessionId
   */
  async listRecordings(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const folder = join(dir, 'recordings')
    const names = await listDirIfExists(folder)
    const rows = []
    for (const name of names) {
      const path = join(folder, name)
      try {
        const info = await stat(path)
        if (!info.isFile()) continue
        rows.push({
          name,
          kind: name.startsWith('audio') ? 'audio' : 'video',
          bytes: info.size,
          modifiedAt: info.mtimeMs,
          path,
        })
      } catch {
        // 竞态删除；跳过。
      }
    }
    rows.sort((a, b) => a.modifiedAt - b.modifiedAt)
    return rows
  }

  // ── report ───────────────────────────────────────────────────────────────

  /**
   * Store the after-interview analysis.
   *
   * @param {string} sessionId
   * @param {string} markdown
   */
  async saveReport(sessionId, markdown) {
    const dir = await this.sessionDir(sessionId)
    await writeTextAtomic(join(dir, 'report.md'), String(markdown ?? ''))
    await this.updateSession(sessionId, { status: SESSION_STATUS.DONE, endedAt: Date.now() })
    return { chars: String(markdown ?? '').length }
  }

  /**
   * Read the after-interview analysis.
   *
   * @param {string} sessionId
   */
  async getReport(sessionId) {
    const dir = await this.sessionDir(sessionId)
    return (await readTextIfExists(join(dir, 'report.md'))) ?? ''
  }

  // ── the whole picture ────────────────────────────────────────────────────

  /**
   * Everything the UI (and the agent) needs about one session in one call.
   *
   * @param {string} sessionId
   */
  async getState(sessionId) {
    const [meta, checklist, transcript, documents, recordings, report] = await Promise.all([
      this.getSession(sessionId),
      this.getChecklist(sessionId),
      this.getTranscript(sessionId),
      this.getDocuments(sessionId),
      this.listRecordings(sessionId),
      this.getReport(sessionId),
    ])
    const turns = transcript.filter(row => row.role !== 'system')
    const asked = turns.filter(row => row.role === 'interviewer').length
    const answered = turns.filter(row => row.role === 'candidate').length
    return {
      session: {
        id: meta.id,
        title: meta.title,
        role: meta.role,
        status: meta.status,
        createdAt: meta.createdAt,
        startedAt: meta.startedAt ?? 0,
        endedAt: meta.endedAt ?? 0,
        updatedAt: meta.updatedAt,
        dir: meta.dir,
      },
      checklist,
      transcript,
      documents: {
        resumeChars: documents.resume.length,
        jdChars: documents.jd.length,
        jdUrl: documents.jdMeta.url,
        jdSections: documents.jdMeta.sections ?? {},
        jdWarnings: documents.jdMeta.warnings ?? [],
      },
      recordings,
      report,
      stats: {
        asked,
        answered,
        durationMs: (meta.endedAt ?? meta.updatedAt ?? 0) - (meta.startedAt ?? meta.createdAt ?? 0),
        checklistTotal: checklist.items.length,
        checklistProbed: checklist.items.filter(item => item.probed === true).length,
        adjustments: checklist.adjustments.length,
      },
    }
  }

  /**
   * A compact view for the agent: what it needs to keep interviewing well.
   *
   * @param {string} sessionId
   */
  async getAgentContext(sessionId) {
    const state = await this.getState(sessionId)
    const documents = await this.getDocuments(sessionId)
    const pending = state.checklist.items.filter(item => item.probed !== true)
    return {
      session: state.session,
      resume: documents.resume,
      jd: documents.jd,
      checklist: state.checklist.items,
      pendingTopics: pending.map(item => ({ id: item.id, topic: item.topic, why: item.why, level: item.level })),
      transcript: state.transcript,
      stats: state.stats,
      report: state.report,
    }
  }

  // ── 岗位档案（历史复用） ───────────────────────────────────────────────

  /**
   * List every job profile.
   *
   * 一个岗位档案 = **一个岗位的考点基线**。同一个岗位第二次面试时，
   * 直接继承上次的清单，而不是从零调研——这才是「准备」的复利。
   *
   * @returns {Promise<Array<object>>}
   */
  async listProfiles() {
    const root = await this.profilesDir()
    const names = await listDirIfExists(root)
    const rows = []
    for (const name of names) {
      if (!SESSION_ID_PATTERN.test(name)) continue
      const doc = await readJsonIfExists(join(root, name, 'profile.json'))
      if (doc === undefined) continue
      rows.push({
        id: name,
        title: doc.title ?? name,
        company: doc.company ?? '',
        jdUrl: doc.jdUrl ?? '',
        jdChars: typeof doc.jdText === 'string' ? doc.jdText.length : 0,
        checklistCount: Array.isArray(doc.checklist?.items) ? doc.checklist.items.length : 0,
        sessions: Array.isArray(doc.sessions) ? doc.sessions : [],
        createdAt: doc.createdAt ?? 0,
        updatedAt: doc.updatedAt ?? 0,
      })
    }
    rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return rows
  }

  /**
   * Read one job profile.
   *
   * @param {string} profileId
   */
  async getProfile(profileId) {
    const dir = await this.profileDir(profileId)
    const doc = await readJsonIfExists(join(dir, 'profile.json'))
    if (doc === undefined) throw new Error(`岗位档案不存在：${profileId}`)
    return { ...doc, dir }
  }

  /**
   * Create or update a job profile.
   *
   * @param {{id?: string, title?: string, company?: string, jdUrl?: string, jdText?: string, checklist?: any}} input
   */
  async saveProfile(input = {}) {
    const id = typeof input.id === 'string' && input.id.trim() !== '' ? input.id.trim() : makeProfileId(input.title)
    const dir = await this.profileDir(id)
    const existing = await readJsonIfExists(join(dir, 'profile.json'))
    const now = Date.now()
    const doc = {
      id,
      title: typeof input.title === 'string' && input.title.trim() !== '' ? input.title.trim() : existing?.title ?? id,
      company: typeof input.company === 'string' ? input.company : existing?.company ?? '',
      jdUrl: typeof input.jdUrl === 'string' ? input.jdUrl : existing?.jdUrl ?? '',
      jdText: typeof input.jdText === 'string' ? input.jdText : existing?.jdText ?? '',
      checklist: input.checklist !== undefined ? input.checklist : existing?.checklist ?? { version: 2, items: [] },
      sessions: existing?.sessions ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await writeJsonAtomic(join(dir, 'profile.json'), doc)
    return doc
  }

  /**
   * Delete a job profile.
   *
   * @param {string} profileId
   */
  async deleteProfile(profileId) {
    const dir = await this.profileDir(profileId)
    const { rm } = await import('node:fs/promises')
    await rm(dir, { recursive: true, force: true })
    return { id: profileId, deleted: true }
  }

  /**
   * Pour a profile into a session: the JD and the checklist baseline.
   *
   * The inherited items are **marked**, so the panel can show「这份清单是从
   * 档案继承的」——继承不是伪装成本场面试的成果。
   *
   * @param {string} sessionId
   * @param {string} profileId
   */
  async applyProfile(sessionId, profileId) {
    const dir = await this.sessionDir(sessionId)
    const profile = await this.getProfile(profileId)
    const items = (profile.checklist?.items ?? []).map(item => ({
      ...item,
      inherited: true,
      inheritedFrom: profile.id,
      probed: false,
    }))

    if (typeof profile.jdText === 'string' && profile.jdText !== '') {
      await this.setJd(sessionId, { text: profile.jdText, url: profile.jdUrl })
    }
    await writeJsonAtomic(join(dir, 'checklist.json'), {
      version: 2,
      updatedAt: Date.now(),
      items,
      adjustments: [{ at: Date.now(), op: 'inherit', reason: `继承岗位档案「${profile.title}」`, id: profile.id }],
    })
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta !== undefined) {
      meta.profileId = profile.id
      meta.updatedAt = Date.now()
      await writeJsonAtomic(join(dir, 'session.json'), meta)
    }
    await this.touch(sessionId)
    return { sessionId, profileId: profile.id, title: profile.title, items: items.length }
  }

  /**
   * Write a session back into its profile: the JD as it stands, the checklist
   * as it ended up, and the session id in the history.
   *
   * @param {string} sessionId
   * @param {string|undefined} profileId defaults to the session's own profile
   */
  async syncProfile(sessionId, profileId) {
    const session = await this.getSession(sessionId)
    const target = typeof profileId === 'string' && profileId !== '' ? profileId : session.profileId
    if (typeof target !== 'string' || target === '') {
      throw new Error('这场面试没有关联岗位档案。请先指定要回写到哪个档案。')
    }
    const documents = await this.getDocuments(sessionId)
    const checklist = await this.getChecklist(sessionId)
    const saved = await this.saveProfile({
      id: target,
      title: session.title,
      jdUrl: documents.jdMeta.url ?? '',
      jdText: documents.jd,
      checklist: { version: 2, items: checklist.items.map(item => ({ ...item, inherited: undefined })) },
    })
    const profile = await this.getProfile(target)
    const sessions = [...new Set([...(profile.sessions ?? []), sessionId])]
    await writeJsonAtomic(join(profile.dir, 'profile.json'), { ...profile, sessions, updatedAt: Date.now() })
    return { sessionId, profileId: target, items: saved.checklist.items.length }
  }

  /**
   * Resolve one profile directory, refusing anything that escapes the root.
   *
   * @param {string} profileId
   */
  async profileDir(profileId) {
    if (typeof profileId !== 'string' || !PROFILE_ID_PATTERN.test(profileId)) {
      throw new Error(`非法的档案 id：${String(profileId)}`)
    }
    const root = await this.profilesDir()
    return resolveWithin(root, profileId)
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Bump the session's `updatedAt`.
   *
   * @param {string} sessionId
   */
  async touch(sessionId) {
    const dir = await this.sessionDir(sessionId)
    const meta = await readJsonIfExists(join(dir, 'session.json'))
    if (meta === undefined) return
    meta.updatedAt = Date.now()
    await writeJsonAtomic(join(dir, 'session.json'), meta)
  }
}

/**
 * Normalize one checklist item.
 *
 * @param {object} raw
 * @param {number} index
 * @param {object[]} existing used to keep ids unique
 */
function normalizeChecklistItem(raw, index, existing = []) {
  const item = raw !== undefined && typeof raw === 'object' && raw !== null ? raw : {}
  const used = new Set(existing.map(entry => entry.id))
  let id = typeof item.id === 'string' && item.id.trim() !== '' ? item.id.trim() : `c${index + 1}`
  let suffix = 1
  while (used.has(id)) {
    id = `c${index + 1}-${suffix}`
    suffix += 1
  }
  const level = CHECKLIST_LEVEL[String(item.level)] !== undefined ? item.level : CHECKLIST_LEVEL.CORE
  return {
    id,
    topic: String(item.topic ?? '').trim() || '未命名考点',
    why: typeof item.why === 'string' ? item.why.trim() : '',
    level,
    source: typeof item.source === 'string' && item.source.trim() !== '' ? item.source.trim() : 'jd',
    tags: Array.isArray(item.tags) ? item.tags.map(tag => String(tag)) : [],
    probed: item.probed === true,
    note: typeof item.note === 'string' ? item.note : '',
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    // 继承来的考点要**留痕**：这份清单是档案里的基线，不是本场面试的成果。
    ...(item.inherited === true ? { inherited: true } : {}),
    ...(typeof item.inheritedFrom === 'string' && item.inheritedFrom !== '' ? { inheritedFrom: item.inheritedFrom } : {}),
  }
}

/**
 * Make a short, sortable profile id.
 *
 * The id stays **ASCII**: it is a directory name, and directory names travel
 * between machines. The readable name lives in `title` instead.
 *
 * @param {string|undefined} title
 */
function makeProfileId(title) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 10)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `pf-${stamp}-${suffix}`
}

/** Make a short, sortable session id. */
function makeSessionId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `iv-${stamp}-${suffix}`
}

/** `2026-11-16` for a timestamp. */
function formatDate(ts) {
  const date = new Date(ts)
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Guess the file extension of a recording.
 *
 * @param {string} mimeType
 * @param {string|undefined} filename
 * @param {string} kind
 */
function extensionFor(mimeType, filename, kind) {
  if (typeof filename === 'string' && filename.includes('.')) {
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    if (/^\.[a-z0-9]{1,5}$/.test(extension)) return extension
  }
  if (/webm/.test(mimeType)) return '.webm'
  if (/mp4/.test(mimeType)) return '.mp4'
  if (/ogg/.test(mimeType)) return '.ogg'
  if (/wav/.test(mimeType)) return '.wav'
  if (/mpeg|mp3/.test(mimeType)) return '.mp3'
  return kind === 'audio' ? '.webm' : '.webm'
}

/**
 * Keep a filename safe for the filesystem.
 *
 * @param {string|undefined} name
 */
function sanitizeName(name) {
  if (typeof name !== 'string') return ''
  return name
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120)
}

/** The absolute workspace root, for display. */
export function workspaceRootOf(service) {
  return resolve(service.config.workspaceRoot)
}
