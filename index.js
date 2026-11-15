/**
 * dsh-interviewer — Host half.
 *
 * 一个**模拟面试**的工作台：把「简历 + 目标岗位 JD」变成一场有准备的面试。
 *
 * 这个文件只做四件事：
 *
 *  1. 建立 **InterviewService** —— 所有操作的唯一实现（会话、JD 抓取、
 *     考点清单、转录、录音录像落盘、报告）。
 *  2. 把同一批操作暴露给 **浏览器**（`/interviewer/api/…`）。
 *  3. 把同一批操作暴露给 **agent**（`interview_*` 工具）。
 *  4. 把插件自带的 Skill 注册进宿主的技能目录（`skills.js`）——
 *     `interview-prep` / `interview-conduct` 这两个名字不对任何 agent 可达
 *     就等于没打包。
 *
 * 2 和 3 都调用 1 —— 「一个操作，两个调用者」。界面上点一下「抓 JD」和
 * agent 调 `interview_prepare`，走的是同一个方法、同一套错误语义。
 *
 * 硬边界（不可破）：
 *  - 插件**不自己写面试题目**：题目由 agent 生成（模型在宿主侧），
 *    插件只负责**考点清单的结构、持久化与动态调整**。
 *  - 插件**不缓存业务状态**：状态从磁盘派生，缓存由文件 mtime + size 失效。
 *  - 插件**不外传简历与 JD**：抓取只针对用户自己给的链接，落盘只在本机。
 *  - 插件**不发起付费生成**：语音识别/播报优先用浏览器原生能力。
 */
import { InterviewService } from './src/host/service.js'
import { registerApi } from './src/host/api.js'
import { registerTools } from './src/host/tools.js'
import { registerInterviewSkills } from './src/host/skills.js'

/** Plugin identity for cordis rows and client-modules keying. */
export const name = 'dsh-interviewer'

/** Services required before mounting: the tool registry and the HTTP carrier. */
export const inject = ['tools', 'webServer']

/**
 * Mount the plugin.
 *
 * @param {object} ctx the plugin context
 * @param {object} config the row's config (see cordis.patch.yml)
 */
export function apply(ctx, config) {
  const service = new InterviewService({ config, ctx })

  // 随包技能：让 `interview-prep` 这类名字真的能被 agent 调到。
  // 必须在 apply 期间**同步**注册（宿主的要求）。
  const skills = registerInterviewSkills(ctx)
  if (skills !== undefined) {
    ctx.effect(() => skills, 'dsh-interviewer: bundled skills')
  }

  // The HTTP surface: one prefix, read model + write model + recording upload.
  ctx.effect(() => registerApi(ctx, service), 'dsh-interviewer: API routes')

  // The agent tools: the same service methods, under model-facing names.
  ctx.effect(() => registerTools(ctx, service), 'dsh-interviewer: agent tools')

  // Expose the service for other plugins on the same context. Cordis warns
  // about unknown context members in some builds; the tools and the HTTP route
  // are the supported surface, so a refusal here is not fatal.
  try {
    ctx.interviewer = service
  } catch {
    // A context that refuses the assignment simply does not publish the service.
  }
}
