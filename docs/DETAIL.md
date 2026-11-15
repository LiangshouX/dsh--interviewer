# DETAIL — 实现细节

## 1. 会话目录

```
<dataRoot>/sessions/<session-id>/
  session.json       元信息：标题、角色、状态、时间戳
  resume.txt         简历正文（纯文本）
  jd.txt             JD 正文（纯文本）
  jd.json            JD 来源：链接、抓取时间、分段、告警
  checklist.json     考点清单（活文档）+ 调整留痕
  transcript.jsonl   逐轮转录，一行一个 JSON
  report.md          事后分析报告
  recordings/        录像与录音
```

`dataRoot` 默认 `~/DSH-INTERVIEWER/`，可在 `cordis.patch.yml` 里改。
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

## 7. 轮询与刷新

| 视图 | 轮询间隔 |
|---|---|
| 面试中 | 1.5 秒 |
| 其他 | 6 秒 |
| 会话列表 | 6 秒 |

「面试中」刷得勤，是因为当前问题面板必须跟得上助手的提问。

## 8. 面板的三个页签

| 页签 | 内容 |
|---|---|
| 准备 | 简历、JD、考点清单（只读呈现） |
| 面试中 | 摄像头、录音、电平、当前问题、回答输入、转录、录像列表 |
| 报告 | 分析报告（Markdown）、统计 |

面板**不画聊天框**。提问与对话在 DSH 对话区，面板是现场控制台。
两边的连接点是转录与清单——插件在两侧看到的是同一份事实。
