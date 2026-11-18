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
| `config` | `{asrProvider, ttsProvider, ttsRate, ttsVoice, recordVideo, recordAudio, guardEnabled, cameraBackend, answerMode, turnEndSilenceMs, workspaceRoot, jdFetchTimeoutMs}` | 插件配置；`workspaceRoot` 含 `path` / `source` / `reason`；`answerMode`(`manual`\|`auto`) 与 `turnEndSilenceMs`(800–6000) 是话轮设置（`docs/TURN-TAKING.md` §4） |
| `sessions` | `{sessions: SessionSummary[]}` | 会话列表，最新在前 |
| `sessions/<id>` | `SessionState` | 单场面试的全量状态 |
| `sessions/<id>/documents` | `{resume, jd, jdMeta}` | **归档正文**。单独取，不跟轮询走——简历动辄几十 KB，1.5 秒一次地传是纯浪费，而且它只有「准备」页用得上 |
| `resumes` | `{resumes: ResumeSummary[]}` | **简历库**列表，只含元信息（不带正文），最新在前 |
| `resumes/<id>` | `{resume: ResumeFull}` | 简历库里某一份的正文 |
| `host-sessions` | `{sessions: HostSession[]}` | 宿主自己的对话列表（`{id, title, updatedAt}`），用来把「让助手去抓」的请求派过去 |

### 1.1 `SessionSummary`

```jsonc
{
  "id": "iv-20261116053012-a3f1",
  "title": "字节 · 后端开发",
  "role": "candidate",
  "status": "draft | ready | running | paused | done",
  "createdAt": 1763259012000,
  "updatedAt": 1763259600000,
  "position": "后端开发",
  "company": "字节",
  "archived": false,
  "archivedAt": 0,
  "hasResume": true,
  "hasJd": true,
  "checklistCount": 12,
  "probedCount": 5,
  "hasReport": false,
  "dir": "/home/me/DSH-REALTIME-INTERVIEW/sessions/iv-..."
}
```

`position` / `company` 供列表**按公司分组**（组头是公司，行内小字是岗位）；
元信息只认**显式写入**——新建时没写就是带日期的占位值
（`新建公司 2026-11-17` / `新建岗位 2026-11-17`），插件**不从 JD 正文里猜**；
`archived` 只是收起，不是删除。

**元信息归一化规则**（`sessions` 新建与 `sessions/<id>` 修改共用）：

| 字段 | 留空 / 没写 | 说明 |
|---|---|---|
| `company` | `新建公司 <YYYY-MM-DD>` | 占位值 = 还没填 |
| `position` | `新建岗位 <YYYY-MM-DD>` | 占位值 = 还没填 |
| `title` | `公司 · 岗位` | 标题自动拼的会跟着公司/岗位走；**显式写过的标题不覆盖** |

标题是不是「自动拼」的记在 `session.json` 的 `titleAuto` 里。老场次没有这个字段时，
按「空 / 老默认 `面试 <日期>` / 等于 `公司 · 岗位`」推断。

### 1.1.1 `ResumeSummary` / `ResumeFull`

```jsonc
// ResumeSummary（列表里只有这些）
{ "id": "rs-20261116-1a2b", "title": "字节 · 后端开发", "chars": 1832,
  "createdAt": 1763259012000, "updatedAt": 1763259012000 }

// ResumeFull（单独取）
{ "id": "rs-20261116-1a2b", "title": "字节 · 后端开发", "text": "…",
  "chars": 1832, "createdAt": 1763259012000, "updatedAt": 1763259012000 }
```

存储位置：`<workspaceRoot>/resumes/<id>/{resume.txt, meta.json}`；
`id` 形如 `rs-<时间戳>-<随机>`，只允许 `[A-Za-z0-9]`。

### 1.2 `SessionState`

```jsonc
{
  "session": { "id", "title", "role", "status", "createdAt", "startedAt", "endedAt", "updatedAt", "position", "company", "resumeId", "pausedAt", "pausedMs", "agentSessionId", "dir" },
  "checklist": { "version": 2, "items": ChecklistItem[], "adjustments": Adjustment[] },
  "transcript": TranscriptRow[],
  "documents": { "resumeChars", "jdChars", "jdUrl", "jdSections", "jdWarnings" },
  "recordings": [{ "name", "kind", "bytes", "modifiedAt", "path" }],
  "report": "# 报告…",
  "fluency": { "turns", "speechMs", "silenceMs", "speechRate", "pauseCount", "longestPauseMs", "fillerCount", "repeats", "corrections", "notes" },
  "stats": { "asked", "answered", "durationMs", "checklistTotal", "checklistProbed", "adjustments" }
}
```

`fluency` 是整场的**语流观察**（没有带语流的回答时为 `undefined`）。
它是观察值，**不是评分**；报告与面试官读它，但不许念给候选人听。

**暂停/继续字段**（`docs/TURN-TAKING.md` §6）：`pausedAt > 0` = 正在暂停中
（resume 时清零）；`pausedMs` = 累计暂停时长；`agentSessionId` = **这一场**
面试专属的宿主助手会话（派活寻址用它，全局设置键已退役为诊断信息）。

**计时口径**：`stats.durationMs = (endedAt ‖ updatedAt) − (startedAt ‖ createdAt) − pausedMs`
——暂停时长**不计入**面试时长（不扣的话「暂停两小时」会全算进去，
报告与 `tooShortForReport`(<3min) 判断全歪）。

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

候选人一轮回答可以带 `meta.fluency`。**客户端只上报原始测量**，指标由 Host 的
`src/host/fluency.js` 算出（单一实现，纯函数）。

`role:"system"` 的行被 `stats.asked/answered` 与语流统计**排除**，只用于留痕：
`面试暂停`、`面试继续（本次暂停 X 分钟）`、`派活失败：…`（带 `meta.dispatch`，
见 §2.1.3）、`助手会话已重建`、`已重新发给助手` 等——报告时间线自然可见。

POST 时的上报形状：

```jsonc
{
  "role": "candidate", "text": "…",
  "meta": { "source": "panel", "fluency": { "segments": [
    { "speechMs": 2200, "silenceMs": 300, "gapBeforeMs": 0, "energyCv": 0.3 },
    { "speechMs": 1800, "silenceMs": 450, "gapBeforeMs": 900, "energyCv": 0.5 }
  ] } }
}
```

落盘后读回来的形状（同一字段，已被 Host 归一化）：

```jsonc
{
  "version": 1, "segments": 2,
  "speechMs": 4000, "silenceMs": 750,
  "pauseCount": 1, "longestPauseMs": 900, "pausesMs": [900],
  "speechRate": 4.7, "chars": 21,
  "fillers": [{ "word": "那个", "count": 1 }], "fillerCount": 1,
  "repeats": 0, "corrections": 1, "energyCv": 0.4,
  "notes": ["这是启发式测量，不是能力评分；麦克风回声会抬高静音段能量。"]
}
```

`gapBeforeMs` 是**段与段之间的空档**——分段器在 450ms 静音处切段，所以"卡住了"
通常表现为这个字段，而不是段内静音。

### 1.5 `Adjustment`（清单调整留痕）

```jsonc
{ "at": 1763259500000, "op": "add | update | remove | probe", "id": "c7", "topic": "…", "reason": "候选人主动提到风控，JD 也要求" }
```

---

## 2. 写入（POST）

### 2.1 会话

| 动作 | 请求体 | 说明 |
|---|---|---|
| `sessions` | `{title?, company?, position?, role?, resumeText?, jdText?, jdUrl?}` | 新建会话；元信息没写就落带日期的占位值 |
| `sessions/<id>` | `{title?, role?, status?, notes?, position?, company?}` | 改元信息（`position`/`company` 供列表分组；留空写回占位值，详见 §1.1） |
| `sessions/<id>/start` | `{}` | 开始面试（记 `startedAt`）并**异步派活开场**——助手自动开场白+第一问（`docs/TURN-TAKING.md` §5.1）。已 running 时为 no-op；paused 时拒绝（该走 `unpause`） |
| `sessions/<id>/finish` | `{}` | 结束面试（记 `endedAt`）。仅接受 `running`/`paused`；暂停中结束时该段暂停计入 `pausedMs` |
| `sessions/<id>/pause` | `{}` | **暂停**（仅 running）：状态置 paused、记 `pausedAt`、转录 system 行「面试暂停」。**不 cancel** 进行中的助手 turn；设备释放由客户端执行（指示灯必须灭） |
| `sessions/<id>/unpause` | `{}` | **继续**（仅 paused）：`pausedMs += now−pausedAt`、状态回 running、system 行留痕，并**异步派活**让助手带上下文续接。（路由名避让 `resume`=存简历的老语义；service 方法叫 `resumeSession`） |
| `sessions/<id>/silence` | `{seconds}` | 长沉默报告（自动模式下客户端发）：派一条「候选人已沉默约 N 秒」的**事实**给助手，让它换小切口重问（§3.3） |
| `sessions/<id>/agent-retry` | `{}` | 把最近一条**没被补发成功**的派活失败用**原 requestId** 重发（宿主幂等去重）；成功后转录记 ok 行，面板的重发按钮随之消失（§4.4） |
| `sessions/<id>/resume` | `{text}` | 存简历正文 |
| `sessions/<id>/jd` | `{text, url?, meta?}` | 存 JD 正文与来源 |
| `sessions/<id>/checklist` | `{items: [...]}` | **替换**整份清单 |
| `sessions/<id>/checklist-mutate` | `{op, id?, topic?, why?, level?, source?, tags?, probed?, note?, reason?}` | 面试中调整 |
| `sessions/<id>/turn` | `{role, text, meta?}` | 追加一轮转录。**联动**：`role:candidate` 且 `meta.source:"panel"` 且会话 running 时，异步派活「候选人已回答，请继续」（回答原文内联进 prompt；§5.1）。助手自己经 `interview_record_turn` 记的行**不触发**（避免自己给自己派活成环） |
| `sessions/<id>/recording` | `{kind, filename?, mimeType?, dataBase64}` | 保存录像/录音 |
| `sessions/<id>/report` | `{markdown}` | 写分析报告并置 `done` |
| `sessions/<id>/archive` | `{archived: true \| false}` | **归档 / 取回**。只是收起来，内容、报告、底稿都还在；取消归档时 `archivedAt` 一并抹掉 |

### 2.1.1 简历库

```
POST /interviewer/api/resumes              { "title": "字节 · 后端", "text": "…" }
POST /interviewer/api/resumes              { "sessionId": "iv-…", "title": "…" }
POST /interviewer/api/resumes/<id>         { "sessionId": "iv-…" }
POST /interviewer/api/resumes/<id>/delete  {}
```

- 第一种：直接存一份新简历（`id` 可选，给了就是更新那一份）。
- 第二种：把某场面试里的简历存进库。
- 第三种：把库里那份用到某场面试上——**在会话目录存一份快照**，
  并把 `resumeId` 记到会话元信息里（历史面试的复盘依据不受库里改动影响）。
- 第四种：删库里的原件；**已经用过的场次里的快照不受影响**。

### 2.1.2 让助手去抓 JD

```
POST /interviewer/api/jd/request-agent  { "sessionId": "iv-…", "url": "https://…", "hostSessionId": "…" }
POST /interviewer/api/jd/save           { "sessionId": "iv-…", "text": "…", "url": "https://…" }
```

`request-agent` 把抓取请求发到**宿主的对话**里（默认最近活跃的那个），
让有浏览器的助手去把正文抄回来：

```jsonc
{ "dispatched": true,
  "hostSession": { "id": "s-…", "title": "当前的对话" },
  "message": "请求已经发给助手了。在 DSH 对话里能看到它跑，抓到后正文会自动回到这一场面试。" }
```

助手拿到正文后调 `interview_save_jd`（或本接口 `jd/save`）写回这场面试。
宿主没有会话接口时，接口要**如实说**并给出下一步，不能静默失败。

### 2.1.3 派活给助手（agent/*）与失败出路

```
POST /interviewer/api/agent/checklist  { "sessionId": "iv-…", "hostSessionId"? }
POST /interviewer/api/agent/report     { "sessionId": "iv-…", "hostSessionId"? }
POST /interviewer/api/agent/start      { "sessionId": "iv-…" }   # 手动重发开场（正常由 sessions/<id>/start 自动联动）
POST /interviewer/api/agent/continue   { "sessionId": "iv-…" }   # 手动重发「请继续」（自动取转录最后一条 candidate）
POST /interviewer/api/agent/resume     { "sessionId": "iv-…", "pausedMinutes"? }
POST /interviewer/api/agent/session    { "sessionId"? }          # 读（必要时建）助手会话；带 sessionId = 那一场专属的
```

派活一律走 `sessionController.prompt` + `mode:'queue'` + **幂等 requestId**
（`start-<id>-<startedAt>` / `continue-<id>-<turnTs>` / `resume-<id>-<pausedAt>` /
`silence-<id>-<ts>`）：客户端重试、轮询竞态都不会重复派活。助手会话是
**per-session** 的（存 `session.json.agentSessionId`）；冷会话被 prompt 唤醒时
历史完整重建，DSH 重启也不丢上下文（`docs/TURN-TAKING.md` §5.2/§6.5）。
存的会话被删（session/not-found）时自动重建重发一次，并记 system 行。

**失败出路**：派活失败在转录留 system 行
`meta.dispatch: {kind, requestId, text, ok:false, error, hint}`；
面板轮询到就显示「重新发给助手」→ `POST sessions/<id>/agent-retry`
用原 requestId 重发，成功后补记 `ok:true` 行，按钮消失。

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
# 传 JD 时带 plainOnly: true：只接受纯文本（.txt / .md），docx/pdf 一律拒绝
POST /interviewer/api/resume/extract  { "filename": "jd.md", "mimeType": "text/markdown", "dataBase64": "…", "plainOnly": true }
```

```jsonc
{ "ok": true, "kind": "pdf", "text": "…", "warnings": [], "chars": 1832 }
```

`ok: false` 时 `warnings` 必须说清**为什么**以及**怎么办**。
`plainOnly` 用扩展名 + 文件头双判据（扩展名可以改，文件头骗不了人）。

### 2.4 语音

```
GET  /interviewer/api/voice            → 整条语音链路（识别 + 播报）
GET  /interviewer/api/asr              → 只读识别那半边（兼容旧端点）
GET  /interviewer/api/tts              → 只读播报那半边

POST /interviewer/api/asr/transcribe   { "dataBase64": "…", "mimeType": "audio/webm", "language": "zh" }
POST /interviewer/api/voice/prepare    { "providerId": "sensevoice-local" }
POST /interviewer/api/tts/speak        { "text": "…", "voice": "冰糖?", "rate": 1 }
```

`GET /voice` 的状态（**不含密钥**，只有"有没有凭据"）：

```jsonc
{
  "asr": {
    "mode": "host | server | browser | none",
    "source": "host | config | env | none",
    "reason": "宿主语音服务可用：SenseVoice（本机），由宿主负责识别。",
    "language": "zh",
    "host": {
      "available": true, "ready": false, "needsPreparation": true,
      "provider": { "id": "sensevoice-local", "name": "SenseVoice（本机）", "location": "host-local", "languages": ["zh"], "preparation": { "phase": "unprepared" } },
      "providers": [], "selection": { "providerId": "sensevoice-local", "language": "zh" }
    },
    "server": { "available": false, "reason": "…", "source": "none" },
    "hint": "宿主语音模型还没下载完：点面板上的「准备语音模型」…"
  },
  "tts": {
    "mode": "server | browser | none",
    "source": "host | preset | config | env | none",
    "provider": "mimo", "protocol": "chat-audio", "label": "MiMo TTS",
    "baseUrl": "https://api.xiaomimimo.com/v1", "model": "mimo-v2.5-tts",
    "voice": "mimo_default", "format": "mp3", "rate": 1, "hasCredential": true,
    "reason": "使用 MiMo TTS（凭据来自宿主）。"
  }
}
```

**识别**：`asrProvider` 走 `auto` 时**宿主优先**（`ctx.speechToText`，provider 由宿主
注册、插件不经手凭据），其次插件自己的 HTTP 端点，最后浏览器。两套 HTTP 协议：
`minimax` 用 `{base}/v1/speech_to_text`，`language` 走 **HTTP 头**；`openai` 用
`{base}/audio/transcriptions`，`language` 走 **表单字段**。输入必须是
**16 kHz 单声道 PCM16 WAV**（宿主侧会校验波形）。

识别结果：

```jsonc
{
  "ok": true, "mode": "host", "text": "…",
  "provider": "sensevoice-local", "language": "zh",
  "attempts": [ { "mode": "host", "ok": true } ]
}
```

`ok: false` 时 `reason` 说明原因，`attempts` 里能看到**每一条链路各自为什么失败**
（"悄悄换了链路"是不允许的）。

**播报**：`tts/speak` 返回 base64 音频，面板自己播：

```jsonc
{ "ok": true, "mode": "server", "provider": "mimo", "label": "MiMo TTS",
  "model": "mimo-v2.5-tts", "voice": "mimo_default", "mimeType": "audio/mpeg", "audioBase64": "…" }
```

`ok: false` 时面板回落到浏览器音色，并把 `reason` 显示出来（不是错误弹窗）。

**宿主模型准备**：`voice/prepare` 只对 `mode: "host"` 有意义——它让宿主开始下载/加载
识别模型，进度通过 `GET /voice` 的 `host.provider.preparation` 观察。

### 2.5 岗位档案

| 动作 | 请求体 | 说明 |
|---|---|---|
| `profiles` | `{title, company?, jdUrl?, jdText?, checklist?}` | 新建或更新档案 |
| `profiles/<id>` | `{title?, company?, jdUrl?, jdText?, checklist?}` | 更新指定档案 |
| `profiles/<id>/apply` | `{sessionId}` | 把档案的 JD 与清单灌进会话（清单标记 `inherited`） |
| `profiles/<id>/sync` | `{sessionId, profileId?}` | 把会话成果回写档案 |
| `profiles/<id>/delete` | `{}` | 删除档案 |

读取：`GET /interviewer/api/profiles` → `{profiles: [...]}`；
`GET /interviewer/api/profiles/<id>` → `{profile: {...}}`。

### 2.6 卷宗库（工作区根）

面板上的「浏览…」是**两步**，不是一个动作——先让用户选，再切：

```
POST /interviewer/api/config/workspace-root/pick   {}
POST /interviewer/api/config/workspace-root        { "path": "D:\\DSH-REALTIME-INTERVIEW", "migrateFrom": "C:\\Users\\me\\DSH-REALTIME-INTERVIEW" }
```

`pick`（弹宿主原生目录选择器）：

```jsonc
{ "picker": { "available": true, "picked": "D:\\DSH-REALTIME-INTERVIEW" } }
```

宿主没有目录选择器，或用户取消了：

```jsonc
{ "picker": { "available": false, "picked": null, "reason": "这个宿主没有提供目录选择器" } }
```

`reason` 说清**为什么**，并给出下一步（手动填绝对路径）。

`workspace-root`（切根，`migrateFrom` 可选）：

```jsonc
{ "workspaceRoot": { "path": "D:\\DSH-REALTIME-INTERVIEW", "source": "settings", "reason": "面板里选的" },
  "migrated": { "copied": true, "sessions": 1, "profiles": 0, "from": "C:\\Users\\me\\DSH-REALTIME-INTERVIEW" } }
```

- 迁移是**复制**，不是移动——老目录原样保留（`migrated.copied`）。
- 配置里写死了 `workspaceRoot` 时，面板这次的选择不生效，返回
  `warning` 说明「改配置才作数」。
- 切根**立即生效**：有效根每次重算，不缓存。

---

## 2.7 摄像头（Host 侧 ffmpeg 采集）

DSH 桌面端的 Electron 权限处理器只放行**纯音频**请求，摄像头在主进程就被拒了——
**改 Windows 设置也没用**（那道闸门在系统隐私层之上，请求压根没走到系统）。
但插件的 Host 半边跑在 Node 宿主进程里，那里没有这道闸门。

所以摄像头走 **Host 侧 ffmpeg**：Host 直接打开设备，把画面以 MJPEG 流推回来。

### 2.7.1 预览流（不是 JSON）

```
GET /interviewer/camera/stream
Content-Type: multipart/x-mixed-replace; boundary=--dshframe
```

浏览器端 **一行 JS 都不用写**：`<img src="/interviewer/camera/stream">` 直接吃这个流。

**响应不能带 `content-length`。** DSH 桌面端把应用页的请求转发给 Host 时会剥掉
`content-length`/`transfer-encoding`，所以这是 chunked 的（逐帧 `res.write()`）。

### 2.7.2 控制接口

```
GET  /interviewer/api/camera            → 采集状态
GET  /interviewer/api/camera/devices    → 本机的摄像头/麦克风设备
POST /interviewer/api/camera/start      → 开摄像头
POST /interviewer/api/camera/stop       → 关摄像头（释放设备）
POST /interviewer/api/camera/record/start  { "sessionId": "iv-…" } → 开始录像
POST /interviewer/api/camera/record/stop   { "sessionId": "iv-…" } → 停止录像
```

状态：

```jsonc
{
  "running": true,          // 采集进程是否活着
  "hasFrame": true,         // 是否已经出过帧
  "device": "XiaoMi USB 2.0 Webcam",
  "recording": false,
  "ffmpeg": "D:\\ProgramFils\\ffmpeg\\bin\\ffmpeg.exe",
  "ffmpegSource": "path",  // config | env | path | wellknown
  "clients": 1,            // 当前有几个预览连接
  "error": ""
}
```

**录像落盘位置**：`<sessionDir>/recordings/video-<时间戳>.mp4`。
它直接就在这场面试的卷宗目录里——**没有 base64、没有几十兆的 JSON 传输**。

**摄像头是独占设备**（实测：第二个进程打开直接 `I/O error`）。所以浏览器的
摄像头和 Host 的摄像头**不能同时开**——客户端两个按钮互斥。

### 2.7.3 ffmpeg 是不是每台机器都有？

**不是。** ffmpeg 是一个**独立的第三方程序**，不是 Windows 自带，也不是 DSH 自带。
新装的 Windows 机器上大概率没有（服务器版镜像更常见没有）。

插件对它的定位顺序是四级：

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | `config.ffmpegPath` | 插件配置里的绝对路径（最优先） |
| 2 | `DSH_FFMPEG_PATH` | 环境变量，适合多机部署时统一指定 |
| 3 | `PATH` | 只要 `ffmpeg.exe` 在 PATH 里就能找到 |
| 4 | 常见安装位置 | `D:\ProgramFils\ffmpeg\bin`、`C:\ffmpeg\bin`、`C:\Program Files\ffmpeg\bin`、`C:\ProgramData\chocolatey\bin`（Windows）；`/usr/local/bin`、`/opt/homebrew/bin`、`/usr/bin`（Unix） |

`camera/devices` 与 `camera/start` 的响应里，`ffmpeg` 字段是**实际用到的那个路径**，
`ffmpegSource` 是**从哪一级找到的**（`config` / `env` / `path` / `wellknown`）——
一眼就能看出是「配错了」还是「装在 PATH 里」。

**没装怎么办：**

1. **装一个。** 最省事的是 `winget install Gyan.FFmpeg`（Windows 官方源）；
   有 Chocolatey 就 `choco install ffmpeg`；macOS 用 `brew install ffmpeg`。
   装完**不用重装插件**，但要**重启 DSH**（Host 半边不热重载）。
2. **或者指定绝对路径。** 在插件配置里写 `ffmpegPath`，
   或设环境变量 `DSH_FFMPEG_PATH` 指向 `ffmpeg.exe`。适合公司内网统一分发、
   或者 ffmpeg 装在非标准目录的情况。
3. **或者手动放一个。** 把 `ffmpeg.exe`（Windows 版是单个可执行文件）丢进
   `D:\ProgramFils\ffmpeg\bin\`，插件第四级就能认出来。

**没装 ffmpeg 时面试照常。** 插件会如实说「这台机器没有摄像头采集程序」，
并告诉用户怎么装——**不会**说成「摄像头坏了」。麦克风、键盘提问、文字回答、
考点清单、报告全都照常工作。受影响的只有「摄像头画面」和「录像」这两项。

装完之后的自检：

```bash
ffmpeg -version          # 能出版本号就说明在 PATH 里
# 不在 PATH 里就测绝对路径
"D:\ProgramFils\ffmpeg\bin\ffmpeg.exe" -version
```

---

## 3. Agent 工具

| 工具 | 参数 | 作用 |
|---|---|---|
| `interview_prepare` | `sessionId? sessionTitle? company? position? role? resumeText? jdText? jdUrl?` | 建会话、落盘简历与 JD。**带 `sessionId` 时不新建**，只更新这一场的标题/公司/岗位与文档——建会话时写错的元信息事后也能改。给链接时先尝试抓取，失败**如实说**并给兜底 |
| `interview_save_checklist` | `sessionId? items[]` | 落盘考点清单（替换式） |
| `interview_mutate_checklist` | `sessionId? op id? topic? why? level? source? tags? probed? note? reason?` | 面试中调整清单 |
| `interview_record_turn` | `sessionId? role text meta?` | 记录一轮对话。**助手记的 candidate 行不触发「请继续」派活**（只有面板提交 `meta.source:"panel"` 的行才联动，避免助手自己给自己派活成环） |
| `interview_pause` | `sessionId?` | 暂停进行中的面试：计时停走、转录留痕；面板释放设备（指示灯熄灭） |
| `interview_resume` | `sessionId?` | 继续暂停中的面试：累计暂停时长并自动派活续接（用户在对话里说「继续吧」也能走通） |
| `interview_request_agent` | `sessionId? task url? hostSessionId?` | 派活：`fetch-jd` / `checklist` / `report` / `start` / `continue` / `resume`（后三个正常由面板自动联动，这里是诊断与手动兜底） |
| `interview_agent_session` | `sessionId?` | 读（必要时建）助手会话；带 sessionId 返回**那一场专属**的会话（派活寻址用的就是它） |
| `interview_get_context` | `sessionId?` | 读全部上下文（简历/JD/清单/转录/统计） |
| `interview_finish` | `sessionId? report` | 写报告并结束 |
| `interview_list_sessions` | — | 列出会话 |
| `interview_list_profiles` | — | 列出岗位档案 |
| `interview_save_profile` | `id? title company? jdUrl? jdText? checklist?` | 归档一个岗位 |
| `interview_apply_profile` | `sessionId? profileId` | 继承档案的 JD 与考点基线 |
| `interview_sync_profile` | `sessionId? profileId?` | 把会话成果回写档案 |
| `interview_asr_status` | — | 读识别链路状态与原因（兼容旧名） |
| `interview_voice_status` | — | 读整条语音链路：识别与播报分别走哪条、为什么、宿主模型准备到哪一步 |
| `interview_voice_prepare` | `providerId?` | 让宿主开始准备语音识别模型（首次要下载） |
| `interview_save_jd` | `sessionId? text url?` | 把 JD 正文写进一场面试。**只写正文**：标题/公司/岗位用 `interview_prepare` 显式写入 |
| `interview_archive_session` | `sessionId? archived` | 归档 / 取消归档一场面试（只是收起来，不删） |
| `interview_list_resumes` | — | 列出简历库里的简历 |
| `interview_save_resume` | `text? sessionId? title?` | 存一份简历进库（或把某场面试里的简历存进去） |
| `interview_apply_resume` | `resumeId sessionId?` | 把库里那份用到某场面试上（卷内留快照） |
| `interview_delete_resume` | `resumeId` | 从简历库删掉一份（已建好的面试不受影响） |
| `interview_workspace_root` | — | 读卷宗库位置：路径、来源（配置 / 面板里选的 / 默认）与理由 |
| `interview_set_workspace_root` | `path` `migrateFrom?` | 换卷宗库根；带 `migrateFrom` 时把那边的会话与档案**复制**过去 |

**每个工具都是 `src/host/service.js` 的一个方法**，不重新实现业务逻辑。

---

## 4. 随包技能

| 名字 | 干什么 |
|---|---|
| `interview-prep` | 面试前：拆 JD → 映射简历 → 产出分级考点清单 → 落盘 |
| `interview-conduct` | 面试中：按流程提问、动态调整清单、记录转录、收尾写报告 |

技能正文在 `build/skills/<name>/SKILL.md`（由 `scripts/build.mjs` 从 `src/skills/` 生成）。
