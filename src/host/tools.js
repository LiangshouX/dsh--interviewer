/**
 * The agent-facing tools.
 *
 * Every tool is a **thin** wrapper over one `InterviewService` method — the
 * same method the UI button calls. The human's button and the agent's tool
 * must not drift apart: the plugin's whole point is that the interviewer and
 * the assistant judge the same session the same way.
 *
 * **Tools do not ask the model to do the plugin's job.** The plugin stores the
 * resume, the JD, the checklist and the transcript; it does **not** write the
 * questions and it does **not** write the report. Those come from the model,
 * which lives on the host side. The plugin's contract with the agent is:
 *
 *   - 插件负责**状态与留痕**；
 *   - 模型负责**内容与判断**。
 */
import { SESSION_STATUS } from './service.js'
import { resolveAsrConfig } from './asr.js'

/** Remove `undefined` members so the value is lossless JSON. */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean)
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue
      out[key] = clean(item)
    }
    return out
  }
  return value
}

/** The output contract shared by every tool: an open JSON object. */
const JSON_OBJECT_OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/**
 * Build one tool definition.
 *
 * `parameters` is written in the author-facing shape (a property map whose
 * entries carry `required: true`) and compiled here into the **raw JSON
 * Schema** the model actually sees.
 *
 * @param {string} name
 * @param {string} description
 * @param {object} parameters
 * @param {(args: any) => Promise<any>} execute
 */
function tool(name, description, parameters, execute) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(parameters)) {
    const { required: isRequired, ...rest } = spec
    properties[key] = rest
    if (isRequired === true) required.push(key)
  }
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: true,
    },
    output: JSON_OBJECT_OUTPUT,
    execute: async args => clean(await execute(args ?? {})),
  }
}

/**
 * Register the tools.
 *
 * @param {object} ctx the plugin context
 * @param {import('./service.js').InterviewService} service
 */
export function registerTools(ctx, service) {
  /** The tools are always available: an interview can start from nothing. */
  const when = async () => true

  const sessionProperty = {
    type: 'string',
    description: '面试会话 id。省略时用最近使用的会话。',
  }

  const definitions = [
    tool(
      'interview_prepare',
      '开一场模拟面试：落盘简历与 JD，建好会话。给 jdUrl 时会先尝试抓取该链接（抓不到会如实说，并让你改用粘贴文本兜底）。',
      {
        sessionId: sessionProperty,
        sessionTitle: { type: 'string', description: '会话标题，例如「字节 · 后端开发 · 2026-11」。' },
        role: { type: 'string', description: 'candidate（候选人自测，默认）或 interviewer（面试官主持）。' },
        resumeText: { type: 'string', description: '简历正文（纯文本）。' },
        jdText: { type: 'string', description: 'JD 正文（纯文本）。' },
        jdUrl: { type: 'string', description: '岗位链接。抓取失败时不会写脏数据，会改走手动兜底。' },
      },
      async args => {
        const session = args.sessionId !== undefined && args.sessionId !== ''
          ? await service.getSession(args.sessionId)
          : await service.createSession({
            title: args.sessionTitle,
            role: args.role,
            resumeText: args.resumeText,
            jdText: args.jdText,
            jdUrl: args.jdUrl,
          })

        const notes = []
        if (typeof args.resumeText === 'string' && args.resumeText.trim() !== '' && args.sessionId !== undefined) {
          await service.setResume(session.id, args.resumeText)
        }
        if (typeof args.jdText === 'string' && args.jdText.trim() !== '' && args.sessionId !== undefined) {
          await service.setJd(session.id, { text: args.jdText, url: args.jdUrl ?? '' })
        }

        let jdFetch
        if (typeof args.jdUrl === 'string' && args.jdUrl.trim() !== '') {
          jdFetch = await service.fetchJd(args.jdUrl.trim())
          if (jdFetch.ok === true) {
            await service.setJd(session.id, {
              text: jdFetch.text,
              url: jdFetch.url,
              meta: { title: jdFetch.title, sections: jdFetch.sections, warnings: [] },
            })
          } else {
            notes.push(`JD 链接抓取失败：${jdFetch.error}。${jdFetch.hint}`)
          }
        }

        const documents = await service.getDocuments(session.id)
        const state = await service.getState(session.id)
        return {
          sessionId: session.id,
          title: session.title,
          status: state.session.status,
          resumeChars: documents.resume.length,
          jdChars: documents.jd.length,
          jdSource: jdFetch === undefined ? (documents.jd.length > 0 ? 'pasted' : 'none') : (jdFetch.ok === true ? 'link' : 'failed'),
          jdTitle: jdFetch?.title ?? documents.jdMeta.title ?? '',
          jdSections: documents.jdMeta.sections ?? {},
          jdFetch: jdFetch === undefined ? undefined : { ok: jdFetch.ok, error: jdFetch.error, hint: jdFetch.hint },
          notes,
          next: '下一步：用 interview-prep 技能基于简历与 JD 产出考点清单，再用 interview_save_checklist 落盘。',
        }
      },
    ),
    tool(
      'interview_save_checklist',
      '落盘考点清单（面试前的调研产物）。每项：topic 必填；why 说明为什么问；level 取 core/deep/bonus；source 取 jd/resume/research；tags 可选。',
      {
        sessionId: sessionProperty,
        items: {
          type: 'array',
          description: '考点数组。',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string', description: '可选，缺省自动生成 c1、c2……' },
              topic: { type: 'string', description: '考点本身，一句话。' },
              why: { type: 'string', description: '为什么问它（对应 JD 哪条要求 / 简历哪段经历）。' },
              level: { type: 'string', description: 'core（必问）/ deep（深挖）/ bonus（加分项）。' },
              source: { type: 'string', description: 'jd / resume / research。' },
              tags: { type: 'array', description: '标签数组。', items: { type: 'string' } },
            },
          },
        },
      },
      async args => {
        const sessionId = await resolveSession(service, args.sessionId)
        const doc = await service.saveChecklist(sessionId, args.items ?? [])
        return {
          sessionId,
          count: doc.items.length,
          items: doc.items.map(item => ({ id: item.id, topic: item.topic, level: item.level })),
        }
      },
    ),
    tool(
      'interview_mutate_checklist',
      '在面试进行中调整考点清单：add（加一个现场想到的好问题）、update（改写某个考点）、remove（去掉不问了）、probe（标记某个考点已问过并记一句结论）。',
      {
        sessionId: sessionProperty,
        op: { type: 'string', description: 'add / update / remove / probe', required: true },
        id: { type: 'string', description: '要操作的考点 id（add 时可省略）。' },
        topic: { type: 'string', description: 'add/update 时的考点描述。' },
        why: { type: 'string', description: 'add/update 时的理由。' },
        level: { type: 'string', description: 'core / deep / bonus。' },
        source: { type: 'string', description: 'jd / resume / research。' },
        tags: { type: 'array', description: '标签数组。', items: { type: 'string' } },
        probed: { type: 'boolean', description: 'probe 时传 true/false。' },
        note: { type: 'string', description: 'probe 时记一句结论（会留痕）。' },
        reason: { type: 'string', description: '为什么这么调整（会留痕）。' },
      },
      async args => {
        const sessionId = await resolveSession(service, args.sessionId)
        const doc = await service.mutateChecklist(sessionId, args)
        return {
          sessionId,
          count: doc.items.length,
          adjustments: doc.adjustments.length,
          pending: doc.items.filter(item => item.probed !== true).map(item => ({ id: item.id, topic: item.topic, level: item.level })),
        }
      },
    ),
    tool(
      'interview_record_turn',
      '记录一轮对话：role 取 interviewer（你问的）或 candidate（候选人答的）。转录会进入面试记录与事后分析。',
      {
        sessionId: sessionProperty,
        role: { type: 'string', description: 'interviewer / candidate / system', required: true },
        text: { type: 'string', description: '这一轮的内容。', required: true },
        meta: { type: 'object', description: '附加信息，例如 asr 置信度、耗时、关联考点 id。', additionalProperties: true },
      },
      async args => {
        const sessionId = await resolveSession(service, args.sessionId)
        const turn = await service.appendTurn(sessionId, args)
        return { sessionId, turn }
      },
    ),
    tool(
      'interview_get_context',
      '读当前面试上下文：会话信息、简历与 JD 原文、考点清单（含已问/未问）、完整转录、统计。面试中每轮之前先读它。',
      { sessionId: sessionProperty },
      async args => {
        const sessionId = await resolveSession(service, args.sessionId)
        return await service.getAgentContext(sessionId)
      },
    ),
    tool(
      'interview_finish',
      '结束这场面试：写事后分析报告并把会话标记为完成。报告由你（模型）写，插件负责落盘。',
      {
        sessionId: sessionProperty,
        report: { type: 'string', description: '事后分析报告（Markdown）。', required: true },
      },
      async args => {
        const sessionId = await resolveSession(service, args.sessionId)
        const saved = await service.saveReport(sessionId, args.report)
        const state = await service.getState(sessionId)
        return { sessionId, saved, stats: state.stats, status: state.session.status }
      },
    ),
    tool(
      'interview_list_sessions',
      '列出所有面试会话（最新在前），含状态、是否有简历/JD、考点数量与是否已有报告。',
      {},
      async () => ({ sessions: await service.listSessions() }),
    ),
    tool(
      'interview_list_profiles',
      '列出所有岗位档案（考点基线）。同一个岗位第二次面试时，先看看这里有没有现成的清单可以继承。',
      {},
      async () => ({ profiles: await service.listProfiles() }),
    ),
    tool(
      'interview_save_profile',
      '把一个岗位归档成「岗位档案」：岗位名、公司、JD 正文、以及沉淀下来的考点清单。下次面同一个岗位可以直接继承。',
      {
        id: { type: 'string', description: '档案 id；省略则新建。' },
        title: { type: 'string', description: '岗位名，例如「字节 · 高级后端工程师」。', required: true },
        company: { type: 'string', description: '公司名（可选）。' },
        jdUrl: { type: 'string', description: '岗位链接（可选）。' },
        jdText: { type: 'string', description: 'JD 正文（可选）。' },
        checklist: {
          type: 'object',
          description: '沉淀下来的考点清单，形如 { version, items: [...] }。省略则保留原有清单。',
          additionalProperties: true,
        },
      },
      async args => {
        const profile = await service.saveProfile(args)
        return {
          id: profile.id,
          title: profile.title,
          items: Array.isArray(profile.checklist?.items) ? profile.checklist.items.length : 0,
        }
      },
    ),
    tool(
      'interview_apply_profile',
      '把岗位档案灌进一场面试：JD 与考点清单基线一并继承（继承来的考点会被标记出来）。',
      {
        sessionId: sessionProperty,
        profileId: { type: 'string', description: '岗位档案 id。', required: true },
      },
      async args => {
        const sessionId = await resolveSession(service, args.sessionId)
        return await service.applyProfile(sessionId, args.profileId)
      },
    ),
    tool(
      'interview_sync_profile',
      '把一场面试的成果回写进岗位档案：当前 JD、最终考点清单、以及这场面试的记录。下次面同一个岗位就有基线了。',
      {
        sessionId: sessionProperty,
        profileId: { type: 'string', description: '回写到哪个档案；省略则回写这场面试自己关联的档案。' },
      },
      async args => {
        const sessionId = await resolveSession(service, args.sessionId)
        return await service.syncProfile(sessionId, args.profileId)
      },
    ),
    tool(
      'interview_asr_status',
      '读当前语音识别链路的状态：服务端识别（继承宿主或插件配置）还是浏览器原生识别，以及为什么这么选。',
      {},
      async () => await resolveAsrConfig(service),
    ),
  ]

  const disposers = definitions.map(definition => ctx.tools.register(definition, { when }))
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

/**
 * Resolve which session a call refers to.
 *
 * @param {import('./service.js').InterviewService} service
 * @param {string|undefined} sessionId
 */
async function resolveSession(service, sessionId) {
  if (typeof sessionId === 'string' && sessionId.trim() !== '') return sessionId.trim()
  const rows = await service.listSessions()
  if (rows.length === 0) {
    throw new Error('还没有面试会话。先调 interview_prepare 建一个。')
  }
  return rows[0].id
}

/** Re-exported so the host code and the tools agree on the vocabulary. */
export { SESSION_STATUS }
