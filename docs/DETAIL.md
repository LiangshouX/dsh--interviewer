# DETAIL — 实现细节

## 1. 会话目录

```
<workspaceRoot>/                        ← 一个总根，例如 D:\DSH-INTERVIEW-ROOT
  workspaces/<session-id>/              ← 一场面试 = 一个子目录
    session.json       元信息：标题、角色、状态、时间戳
    resume.txt         简历正文（纯文本）
    jd.txt             JD 正文（纯文本）
    jd.json            JD 来源：链接、抓取时间、分段、告警
    checklist.json     考点清单（活文档）+ 调整留痕
    transcript.jsonl   逐轮转录，一行一个 JSON
    report.md          事后分析报告
    recordings/        录像与录音
  profiles/<profile-id>/profile.json    ← 岗位档案
```

**一个总根，不要散落。** `workspaceRoot` 留空则自动（用户主目录下的
`DSH-INTERVIEWER/`），也可以指到 D 盘这类大盘。面板顶部显示当前根路径，
悬停能看到**为什么是这个目录**（`describeWorkspaceRoot()` 返回来源与理由）。

会话 id 形如 `iv-20261116053012-a3f1`，只允许 `[A-Za-z0-9_-]`——
它是路径片段，必须挡住路径穿越。

## 2. 状态机

```
draft ──► ready ──► running ──► done
```

| 状态 | 含义 |
|---|---|
| `draft` | 刚建好，简历/JD 还没齐 |
| `ready` | 简历与 JD 都在，清单已落盘 |
| `running` | 面试进行中（`startedAt` 有值） |
| `done` | 面试结束，报告已写（`endedAt` 有值） |

面板**不强制**状态流转——它只是显示。状态由 `start` / `finish` / `saveReport` 三个动作设置。

## 3. 考点清单为什么是「活文档」

准备阶段的清单是**快照**，面试过程中的清单是**现场**。两者用同一份文件表示，
靠 `adjustments[]` 区分：

```jsonc
{
  "version": 2,
  "updatedAt": 1763259500000,
  "items": [ /* 当前清单 */ ],
  "adjustments": [
    { "at": 1763259400000, "op": "add", "id": "c7", "topic": "风控限流", "reason": "候选人主动提到，JD 也要求" },
    { "at": 1763259450000, "op": "probe", "id": "c3", "probed": true, "reason": "答得含糊，换个角度再问" }
  ]
}
```

四种操作：

| op | 语义 | 常见时机 |
|---|---|---|
| `add` | 加一个考点 | 想到好问题、候选人主动提到新方向 |
| `update` | 改写考点 | 换角度、调整难度 |
| `remove` | 去掉考点 | 候选人不擅长且与 JD 无关、时间不够 |
| `probe` | 标记已问 + 记结论 | 每问完一个考点 |

**每次操作都要求 `reason`。** 不写理由的调整在复盘时没有价值——
「为什么最后问了这些」是复盘里最难重建的东西。

## 4. 语音链路

```
                    ┌─ 浏览器原生能力（无外部依赖、无付费）
摄像头 ──► getUserMedia ──► <video> 预览
麦克风 ──► getUserMedia ──► MediaRecorder ──► Blob ──► base64 ──► host 落盘
麦克风 ──► AnalyserNode ──► 输入电平（示波器）
麦克风 ──► SpeechRecognition ──► 回答草稿（可编辑）
问题文本 ──► SpeechSynthesis ──► 朗读
```

**每一条都要能降级：**

| 环节 | 失败时 |
|---|---|
| `getUserMedia` | 拒绝权限 → 没有画面，面试照常 |
| `MediaRecorder` | 不支持 → 只录音频或不录 |
| `SpeechRecognition` | 不可用 → 键盘输入（**始终可用**） |
| `SpeechSynthesis` | 无音色 → 跳过朗读 |

### 关于 Web Speech API

Chromium 的 `SpeechRecognition` 在桌面 Chrome 上依赖后端识别服务，
在部分网络环境（含许多企业内网）里连不上，表现为 `network` 错误。
插件对此的处理是：**提示 + 降级 + 不阻断**。识别准确率取决于浏览器实现，
插件不做承诺。

需要更高准确率时，正确做法是换一个 ASR provider（服务端 API），
而不是在浏览器里反复调参数。

### 两套协议

| 协议 | 端点 | model | language |
|---|---|---|---|
| minimax | `{base}/v1/speech_to_text` | `asr-1.0` | **HTTP 头** `language:` |
| openai | `{base}/audio/transcriptions` | `whisper-1` | **表单字段** `language` |

协议按 provider / baseUrl 自动判定（`pickProtocol()`），可用 `asrProvider` 强制。
聊天用的 baseUrl 通常带 `/v1`，所以拼端点前要 `stripVersionSegment()` 去掉，
否则会拼出 `/v1/v1/speech_to_text`。

**音频格式**：浏览器只录 webm/opus，而识别服务不收 webm。
客户端上传前用 WebAudio 解码 → 重采样 16 kHz → 编码成 16-bit PCM WAV。

### 凭据走 credentials seam

宿主服务 `ctx.get('credentials')` 的 `resolve(ref)` 接受环境变量名作为引用，
返回 `{ value, source }`。插件用它取密钥，**密钥不进配置文件**。

解析顺序：插件配置里的明文 `asrApiKey` → `credentials.resolve(asrApiKeyEnv)` →
`process.env[asrApiKeyEnv]` → 宿主 provider 列表里的凭据字段。

### 服务端 ASR 的三级继承

```
① 插件配置     asrApiKey + asrBaseUrl 都填了        → 服务端识别
② 继承宿主     ctx.get('agentDefaultModel') 取当前 provider/model
                ctx.get('llm').listProviders() 找该 provider 的
                baseUrl/apiKey（宿主给多少算多少）    → 服务端识别
③ 都没有                                             → 浏览器原生 + 键盘兜底
```

**继承不到就明说。** 宿主有模型 ≠ 插件拿得到 ASR 凭据——
`resolveAsrConfig()` 会返回 `mode: 'browser'` 加一条说明原因的 `reason`，
面板把它显示出来。绝不假装在用服务端。

服务端走 OpenAI 兼容的 multipart 转写（`file` + `model` + `language`），
端点可配（默认 `/audio/transcriptions`）。请求体是 `multipart/form-data`，
所以不能手拼 JSON。

## 5. 简历解析

| 格式 | 做法 | 可靠性 |
|---|---|---|
| `.txt` / `.md` / `.json` | 直接解码 | 高 |
| `.docx` | 自解 zip（中央目录 → inflateRaw）→ `word/document.xml` → 抽 `<w:t>` | 高 |
| `.pdf` | 解 Flate 流 → 文本算子 → ToUnicode CMap 映射 | 中（尽力而为） |
| `.doc` | 不支持 | — |

**先看魔数再看扩展名**：扩展名会说谎，魔数不会。

PDF 提取结果的字符里如果有大量替换字符（`\uFFFD`）或控制字符，
会打一条 `warnings`——「编码不完整，结果可能有乱码，请核对预览」。

## 6. JD 抓取

```
fetch(url, {redirect: follow, UA: 桌面 Chrome, Accept-Language: zh-CN})
  → 剥掉 script/style/noscript/iframe/form/button/svg/canvas
  → 优先取 id/class 命中内容容器特征的片段（job-detail / jobDesc / description …）
  → 取不到就用整页正文
  → 去标签（保留块级换行）→ 解实体 → 收拾空白
  → 按「岗位职责 / 任职要求 / 加分项」切段
```

**正文少于 40 字即判失败**——多半是登录墙、验证码页或正文完全由前端渲染。
这时候返回 `{ok:false, error, hint}`，不返回空正文。

## 7. 岗位档案

```
<dataRoot>/profiles/<profile-id>/
  profile.json   { id, title, company, jdUrl, jdText, checklist, sessions[], createdAt, updatedAt }
```

档案 id 是**纯 ASCII**（`pf-<日期>-<随机>`）：它要当目录名，会在机器之间搬家。
可读的名字放在 `title` 里。

**继承是加标记的。** `applyProfile` 把档案的清单复制进会话，每个条目加上
`inherited: true` 与 `inheritedFrom: <profile-id>`，并在 `adjustments[]` 里
记一条 `{ op: 'inherit', reason: '继承岗位档案「…」' }`。
面板会把继承来的考点标出来——继承不是伪装成本场面试的成果。

**回写时继承标记被抹掉。** `syncProfile` 存回档案的是「这个岗位的基线」，
不带某一场的继承痕迹；场次信息存在 `sessions[]` 里。

## 8. 轮询与刷新

| 视图 | 轮询间隔 |
|---|---|
| 面试中 | 1.5 秒 |
| 其他 | 6 秒 |
| 会话列表 | 6 秒 |
| 岗位档案 | 10 秒 |

「面试中」刷得勤，是因为当前问题面板必须跟得上助手的提问。

### revision：内容没变就不重渲染

服务端每次返回 `revision`（由 `session.json` / `checklist.json` /
`transcript.jsonl` / `report.md` 的 **mtime + size** 派生）。
客户端比对相同就**跳过 setState**。

这不是微优化，是红线：没有它，面板每 1.5 秒会重建一次（面试中视图有
800+ 个 DOM 节点），在 Electron 里就是持续的主线程占用。

对应的服务端逻辑在 `revisionOf()`，客户端逻辑在 `client.js` 的 `usePoll()`。

### 转录封顶

`GET /sessions/<id>?transcriptLimit=200`（默认 200）。响应里同时给出
`transcriptTotal` 与 `transcriptTruncated`，界面据此说明「只显示最近 200 轮」。

### 实测基线

见 `AGENTS.md` §11 与 `scripts/perf.mjs`、`scripts/render-probe.mjs`。
两条闸门都接在 `node scripts/build.mjs` 上。

## 9. 面板的三个页签

| 页签 | 内容 |
|---|---|
| 准备 | 简历、JD、考点清单（只读呈现） |
| 面试中 | 摄像头、录音、电平、当前问题、回答输入、转录、录像列表 |
| 报告 | 分析报告（Markdown）、统计 |

面板**不画聊天框**。提问与对话在 DSH 对话区，面板是现场控制台。
两边的连接点是转录与清单——插件在两侧看到的是同一份事实。
