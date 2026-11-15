# Host ⇄ Client 契约

> 这份文件是**接口的唯一真源**。Host 半边（`src/host/**`）与 Client 半边
> （`client.js`）各自照它实现；改接口先改这里。
>
> 传输层只做搬运，业务逻辑全在 `src/host/service.js` 的方法里
> （见 `AGENTS.md` §5「一个操作，两个调用者」）。

---

## 0. 通用约定

### 0.1 包封

```jsonc
// 成功
{ "ok": true, "data": { /* ... */ } }
// 失败
{ "ok": false, "error": "人话原因" }
```

### 0.2 路由前缀

`/interviewer/api/<resource>`（JSON）

### 0.3 信任围栏

请求必须来自 loopback authority、不能是 cross-site、带 `Origin` 时必须同源。
与宿主自身的 API 网关语义一致——插件不开比宿主更宽的门。

---

## 1. 读取（GET）

| 资源 | 返回 | 说明 |
|---|---|---|
| `config` | `{asrProvider, ttsProvider, ttsRate, ttsVoice, recordVideo, recordAudio, dataRoot, jdFetchTimeoutMs}` | 插件配置 |
| `sessions` | `{sessions: SessionSummary[]}` | 会话列表，最新在前 |
| `sessions/<id>` | `SessionState` | 单场面试的全量状态 |

### 1.1 `SessionSummary`

```jsonc
{
  "id": "iv-20261116053012-a3f1",
  "title": "字节 · 后端开发",
  "role": "candidate",
  "status": "draft | ready | running | done",
  "createdAt": 1763259012000,
  "updatedAt": 1763259600000,
  "hasResume": true,
  "hasJd": true,
  "checklistCount": 12,
  "probedCount": 5,
  "hasReport": false,
  "dir": "/home/me/DSH-INTERVIEWER/sessions/iv-..."
}
```

### 1.2 `SessionState`

```jsonc
{
  "session": { "id", "title", "role", "status", "createdAt", "startedAt", "endedAt", "updatedAt", "dir" },
  "checklist": { "version": 2, "items": ChecklistItem[], "adjustments": Adjustment[] },
  "transcript": TranscriptRow[],
  "documents": { "resumeChars", "jdChars", "jdUrl", "jdSections", "jdWarnings" },
  "recordings": [{ "name", "kind", "bytes", "modifiedAt", "path" }],
  "report": "# 报告…",
  "stats": { "asked", "answered", "durationMs", "checklistTotal", "checklistProbed", "adjustments" }
}
```

### 1.3 `ChecklistItem`

```jsonc
{
  "id": "c1",
  "topic": "订单系统的限流与降级",
  "why": "JD 要求「负责高并发稳定性」，简历项目 B 写日订单 800 万",
  "level": "core | deep | bonus",
  "source": "jd | resume | research",
  "tags": ["高并发"],
  "probed": false,
  "note": "",
  "evidence": [{ "at": 1763259500000, "note": "答得清楚，补充了令牌桶参数" }]
}
```

### 1.4 `TranscriptRow`

```jsonc
{ "ts": 1763259500000, "role": "interviewer | candidate | system", "text": "…", "meta": {} }
```

### 1.5 `Adjustment`（清单调整留痕）

```jsonc
{ "at": 1763259500000, "op": "add | update | remove | probe", "id": "c7", "topic": "…", "reason": "候选人主动提到风控，JD 也要求" }
```

---

## 2. 写入（POST）

### 2.1 会话

| 动作 | 请求体 | 说明 |
|---|---|---|
| `sessions` | `{title?, role?, resumeText?, jdText?, jdUrl?}` | 新建会话 |
| `sessions/<id>` | `{title?, role?, status?, notes?}` | 改元信息 |
| `sessions/<id>/start` | `{}` | 标记开始（记 `startedAt`） |
| `sessions/<id>/finish` | `{}` | 标记结束（记 `endedAt`） |
| `sessions/<id>/resume` | `{text}` | 存简历正文 |
| `sessions/<id>/jd` | `{text, url?, meta?}` | 存 JD 正文与来源 |
| `sessions/<id>/checklist` | `{items: [...]}` | **替换**整份清单 |
| `sessions/<id>/checklist-mutate` | `{op, id?, topic?, why?, level?, source?, tags?, probed?, note?, reason?}` | 面试中调整 |
| `sessions/<id>/turn` | `{role, text, meta?}` | 追加一轮转录 |
| `sessions/<id>/recording` | `{kind, filename?, mimeType?, dataBase64}` | 保存录像/录音 |
| `sessions/<id>/report` | `{markdown}` | 写分析报告并置 `done` |

### 2.2 JD 抓取

```
POST /interviewer/api/jd/fetch  { "url": "https://…" }
```

成功：

```jsonc
{ "ok": true, "url": "…", "title": "高级后端工程师", "text": "…",
  "sections": { "overview": "…", "responsibilities": "…", "requirements": "…", "bonus": "…" } }
```

失败（**必须带 hint**）：

```jsonc
{ "ok": false, "url": "…", "error": "页面正文太少（12 字），多半是登录墙、验证码或前端渲染",
  "hint": "抓取没成功。可以直接把 JD 正文粘贴进来，或上传文件（.txt/.md/.docx/.pdf）——两种都能用，插件会自动接着往下走。" }
```

### 2.3 简历提取

```
POST /interviewer/api/resume/extract  { "filename": "cv.pdf", "mimeType": "application/pdf", "dataBase64": "…" }
```

```jsonc
{ "ok": true, "kind": "pdf", "text": "…", "warnings": [], "chars": 1832 }
```

`ok: false` 时 `warnings` 必须说清**为什么**以及**怎么办**。

---

## 3. Agent 工具

| 工具 | 参数 | 作用 |
|---|---|---|
| `interview_prepare` | `sessionId? sessionTitle? role? resumeText? jdText? jdUrl?` | 建会话、落盘简历与 JD；给链接时先尝试抓取，失败**如实说**并给兜底 |
| `interview_save_checklist` | `sessionId? items[]` | 落盘考点清单（替换式） |
| `interview_mutate_checklist` | `sessionId? op id? topic? why? level? source? tags? probed? note? reason?` | 面试中调整清单 |
| `interview_record_turn` | `sessionId? role text meta?` | 记录一轮对话 |
| `interview_get_context` | `sessionId?` | 读全部上下文（简历/JD/清单/转录/统计） |
| `interview_finish` | `sessionId? report` | 写报告并结束 |
| `interview_list_sessions` | — | 列出会话 |

**每个工具都是 `src/host/service.js` 的一个方法**，不重新实现业务逻辑。

---

## 4. 随包技能

| 名字 | 干什么 |
|---|---|
| `interview-prep` | 面试前：拆 JD → 映射简历 → 产出分级考点清单 → 落盘 |
| `interview-conduct` | 面试中：按流程提问、动态调整清单、记录转录、收尾写报告 |

技能正文在 `build/skills/<name>/SKILL.md`（由 `scripts/build.mjs` 从 `src/skills/` 生成）。
