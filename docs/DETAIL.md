# DETAIL — 实现细节

## 1. 会话目录

```
<workspaceRoot>/                        ← 一个总根，例如 D:\DSH-INTERVIEW-ROOT
  workspaces/<session-id>/              ← 一场面试 = 一个子目录
    session.json       元信息：标题、公司/岗位（含占位值）、titleAuto、角色、状态、时间戳、归档标记
    resume.txt         简历正文（纯文本）
    jd.txt             JD 正文（纯文本）
    jd.json            JD 来源：链接、抓取时间、分段、告警
    checklist.json     考点清单（活文档）+ 调整留痕
    transcript.jsonl   逐轮转录，一行一个 JSON
    report.md          事后分析报告
    recordings/        录像与录音
  profiles/<profile-id>/profile.json    ← 岗位档案
  resumes/<resume-id>/                  ← 简历库（可复用的模板）
    resume.txt        简历正文
    meta.json         标题、字数、创建/更新时间
```

**一个总根，不要散落。** 面板顶部显示当前根路径，悬停能看到**为什么是这个目录**
（`describeWorkspaceRoot()` 返回来源与理由）。

根目录的来源有三种，优先级从高到低：

| 来源 | 含义 | 怎么来的 |
|---|---|---|
| `config` | 插件配置写死了 | `cordis.patch.yml` 的 `workspaceRoot`（用户的 layer 也算） |
| `settings` | 面板里用「浏览…」选过 | 存到 profile 目录的 `dsh-realtime-interview.json`（`DSH_PROFILE_DIR` → `<profile>/dsh-realtime-interview.json`，否则 `~/.dsh/dsh-realtime-interview/settings.json`） |
| `default` | 两处都没说 | 自动挑：Windows 上**优先非系统盘**（遍历 D…Z，跳过系统盘，取 `D:\DSH-REALTIME-INTERVIEW`）；没有别的盘才退回家目录下的 `DSH-REALTIME-INTERVIEW/` |

**面板里的「浏览…」** 走宿主原生目录选择器，不自造文件对话框。
宿主的能力 seam 是 `ctx.directoryPicker`：

```js
const cap = ctx.get('directoryPicker').capability()
// {kind: 'native', pick(signal)}  → 弹系统对话框，返回绝对路径或 null（取消）
// {kind: 'browse', list, createDirectory} → 只能逐级列目录，没有「一次弹窗」
const path = await cap.pick(new AbortController().signal)
```

两个必须记住的坑：

- **服务名不是 `directoryPickerController`。** 那只是宿主给「远程调用者」用的
  远端控制器名，宿主自己调它会走远端通道，拿到 undefined。
- **`pick(signal)` 必须传 AbortSignal。** 宿主 native 后端第一件事就是读
  `signal.aborted`；不传就会以 `Cannot read properties of undefined` 失败，
  看起来像「选择器坏了」，其实是调用姿势不对。传了还能顺手兜底：
  用户走开时把对话框关掉，不让它永远挂着。

宿主只有 `browse` 能力时如实回报，并给出手动填绝对路径的出路。
选完立刻生效——有效根每次重算，不缓存。切根时如果旧根里有卷宗，通知条给一个
「搬过去」动作：迁移是**复制**不是移动（`fs.cp`），旧目录原样保留。
配置里写死了 `workspaceRoot` 时，面板改动只给 warning，不偷偷改配置。

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
| 准备 | 流程脊线、简历、JD（纸面预览）、面试官底稿（默认收起）、岗位档案 |
| 面试中 | **舞台**（视频 + 下三分之一提问条）、回答输入、控件、输入电平、速记 |
| 报告 | 评估表（Markdown）、卷内统计、卷宗材料 |

面板**不画聊天框**。提问与对话在 DSH 对话区，面板是现场控制台。
两边的连接点是转录与清单——插件在两侧看到的是同一份事实。

### 9.1 面试卷宗：界面隐喻与它带来的纪律

界面被设计成**一份案卷**：简历与 JD 是卷内材料，考点清单是**面试官的底稿**，
转录是速记，报告是评估表。三条产品纪律是从这个隐喻里长出来的，不是额外规定：

1. **底稿默认收起。** 准备阶段可查可改；面试中完全不可见，只留计数。
   摊开考题，它就不再是面试，而是答题游戏。
2. **提问压在画面上。** 当前问题做成视频下缘的下三分之一字幕条（衬线、
   琥珀竖线），不是旁边的一个输入框——它和你的脸在同一块画面上。
3. **舞台永远主位。** 面试中视频区吃满左半屏；**没有摄像头时也保持同样大
   的画面框**，换成有设计的「未接通」状态（暗场径向渐变 + 姓名 monogram +
   仍在跳的电平表 / REC / 计时），不塌成黑框。

### 9.2 权限：分开申请，如实说是谁挡的

**宿主的实情**（已从 `app.asar` 读实）：DSH 桌面端的 `installMicrophonePermissions`
只放行 `mediaTypes === ['audio']` 的**纯音频**请求；`setPermissionCheckHandler`
对 `mediaType !== 'audio'` 一律返回 false。所以：

- 「摄像头 + 麦克风」**一起**申请 → 直接被拒，**而且不弹系统窗口**；
- `navigator.permissions.query({name:'camera'})` 恒为 `denied`。

客户端的做法：

1. **先一起请，再分开请。** 浏览器里一次弹窗就够；桌面端一起请会被拒，
   于是再**分开**试：先 audio-only（能过），再 video-only（会被挡）。
2. **按轨合并，别重建流。** 合并流用 `new MediaStream(tracks)`，构造失败
   退回 `audio ?? video`；**补摄像头时用 `existing.addTrack()`**——
   重建整条流会把在用的麦克风打断。
3. **分开报错。** 桌面端说「麦克风已接上；摄像头被 DSH 桌面端挡下了，
   改 Windows 设置也没用」；浏览器端才提示地址栏权限图标 / 隐私设置。
   **旧文案「系统已记住拒绝……去系统设置里放行」在桌面端是无效指引。**
4. **舞台不许塌成黑框**：`hasVideo` 按 `getVideoTracks().length > 0` 判断，
   只看流存在的话，只有麦克风时舞台是黑的。
5. **录音格式跟着轨走**：有视频轨 `video/webm`，纯音频 `audio/webm`。

摄像头与麦克风**分开**处理——一方被拒不该拖垮另一方。

### 9.3 归档正文为什么不跟轮询走

`getState` 只回传字数（`resumeChars` / `jdChars`），正文走单独的
`GET sessions/<id>/documents`。原因：面板在面试中每 1.5 秒轮询一次，
简历几十 KB，每次传一遍就是持续的反序列化开销；而正文只有「准备」页用得上。

**正文回来时怎么发现**：会话状态里的字数变化就是指纹——变了才去取一次正文
（`lastDocFingerprint`），而不是每 6 秒白拉几十 KB。

---

## 10. 简历库：存一次，不是每场都传

简历不会每场面试都变。所以简历单独存在工作区里（`resumes/<id>/`），
每场面试只**引用**它。

**库里那份是「可复用的模板」，卷内那份是「这一场的事实」。**
选用时把正文**快照**进会话目录（`setResume`），并把 `resumeId` 记到
`session.json`——简历后来改了，历史面试的复盘依据也不能跟着变。
删库里的原件，**不影响**已经用过的场次。

简历 id 形如 `rs-20261116120000-1a2b`，只允许 `[A-Za-z0-9]`——
它和会话 id 一样是路径片段，必须挡住路径穿越。

列表接口只回元信息（标题、字数、时间），正文单独取——
`GET resumes` 每 15 秒轮询一次，带上正文就是白拉几十 KB。

**上传 ≠ 归档。** 上传的文件先由 `/resume/extract` 解成文字，进放大窗口的
草稿；点【保存】才写进这一场。首次保存会引导入库并命名（也留「只存这场」），
已有简历时问「覆盖原简历 / 存为新简历」。覆盖时如果这一场关联了库里的某一份，
库里那一份也一起更新（`saveResume({id, text})`），否则下次选它还是旧版。

**JD 只收纯文本。** 上传 JD 时客户端先按扩展名挡一道，服务端
（`/resume/extract` 的 `plainOnly`）再按文件头挡一道——扩展名可以改，文件头骗不了人。

## 11. 场次整理：归档与分组

列表是**追加**的历史，所以要给用户整理的办法：

- **归档是「收起来」，不是「删掉」。** 只改 `session.json` 里的 `archived`
  标记，内容、报告、底稿一样都在；取消归档时把 `archivedAt` 一起抹掉，
  别留一个「归档过但没归档」的时间戳。
- **分组按公司，不按岗位。** 左栏只有 244px，「公司 · 岗位」的组头必然被
  截断，截断之后公司和岗位都认不出。组头写公司（可折叠），行内小字写岗位；
  标题里已有的公司/岗位不重复。认不出公司的归到「未整理」垫底。
  列表接口因此多返回 `position` / `company`。
- **元信息只认显式写入，不从 JD 回猜。** 公司和岗位在助手 / 用户写进来之前，
  是**带日期的占位值**（`新建公司 2026-11-17` / `新建岗位 2026-11-17`）；
  标题没写就用「公司 · 岗位」拼。旧的本地启发式（`deriveJobTitle`）已经删除——
  它会把「【基础信息】」认成公司、把「专家」认成岗位，而且猜错之后用户和助手
  都不好判断哪个字段是错的。现在：助手用
  `interview_prepare({sessionId, sessionTitle, company, position})` 改，
  用户在「这场面试」三格里改；两边走同一个 `updateSession`。
- **自动拼的标题跟着元信息走，显式标题不覆盖。** `titleAuto` 记在
  `session.json` 里：用户 / 助手写过的标题从此钉住；只有自动拼的
  （空、老默认 `面试 <日期>`、等于 `公司 · 岗位`）才在公司 / 岗位变化时重拼。

## 12. JD 抓不到：请助手去拿

直连抓网页最常挂在三件事上：登录墙、验证码、前端渲染的正文。
宿主里的助手**有浏览器**，能把页面真的打开、看完、把正文抄下来。

派单走宿主的会话接口：

```js
const controller = ctx.get('sessionController')
await controller.prompt({
  requestId: `jd-${sessionId}-${Date.now()}`,
  sessionId: hostSessionId,           // 默认最近活跃的那个对话
  mode: 'queue',
  content: [{ type: 'text', text: '请帮我抓取这个岗位 JD：… 然后调用 interview_save_jd …' }],
})
```

请求发在**当前 DSH 对话**里——用户看得见、也能插话，不是后台偷偷跑。
助手拿到正文后调 `interview_save_jd` 写回这场面试，面板靠字数指纹发现它。

宿主没有 `sessionController` 时，接口要**如实说**并给出下一步
（手动粘贴正文），不能静默失败。
