# 模拟面试间

把一份简历和一份岗位 JD，变成一场有准备的模拟面试：先出面试官底稿，再逐轮提问，
全程可以用摄像头和语音，最后写一份基于转录原话的事后报告。

面向正在准备面试的求职者，也面向需要现场控制台的面试官。
简历、JD、转录、录像、报告全部留在你自己的机器上。

## 怎么用

1. **新建面试**，填上公司与岗位（留空也可以，之后随时改）。
2. **归档材料**：简历支持 txt / md / docx / pdf 或直接粘贴；JD 支持 txt / md、粘贴，
   或给一个岗位链接让插件去抓——抓不到会如实说，并给出粘贴兜底。
3. **出底稿**：让助手读简历与 JD，产出一份分级的考点清单（每条都写明「为什么问它」）。
   面试进行中清单默认不可见，真实候选人看不到考题。
4. **开始面试**：点一下，助手自动开场。回答可以说话，也可以打字。
   设备（麦克风、摄像头）、整场录制和问题朗读在同一个手势里起来；
   某一环失败不挡面试，插件会如实说接上了什么、没接上什么。
5. **结束并写报告**：报告由助手基于转录原话写，逐考点评估、亮点与风险点、改进建议。
   面试不足 3 分钟时按钮会说明「太短」，但仍然可以生成。

面板在 DSH 侧栏的「模拟面试间」，四个页签：**准备 / 面试中 / 报告 / 设置**。
提问与对话在 DSH 对话区，面板是现场控制台。

## 要准备什么

| 准备 | 必需 | 说明 |
|---|---|---|
| 简历 | 强烈建议 | txt / md / docx / pdf 或粘贴。扫描件 PDF 会给乱码警告。 |
| 岗位 JD | 强烈建议 | 纯文本或链接。链接抓取可能被登录墙、验证码挡住，这时粘贴正文。 |
| 麦克风 | 可选 | 不接也能面试：直接用键盘输入。 |
| 摄像头 | 可选 | 桌面端需要 ffmpeg；没有画面时面试照常。 |
| 语音供应商 | 可选 | 不配置就走浏览器自带能力。 |

语音识别与播报都有多条链路（宿主服务、Qwen / MiMo / MiniMax、任意 OpenAI 兼容、
百度、Edge、浏览器），面板会显示**现在走的是哪条、为什么**。
密钥写进 DSH 的凭据存储，不进插件配置文件，界面不回显；机器上已经配好的凭据会列出来供选。

注意：Chromium 自带的语音识别会把音频送到浏览器厂商的服务，不是纯本地。介意就用键盘输入，或在设置页指定一家你信得过的供应商。

## 数据在哪

所有数据集中在一个工作区根下，一场面试一个子目录：

```
<工作区根>/
  workspaces/<会话 id>/     一场面试的卷宗
    session.json             元信息、状态、时间戳
    resume.txt               简历正文
    jd.txt                   JD 正文
    checklist.json           考点清单 + 调整留痕
    transcript.jsonl         逐轮转录
    report.md                事后报告
    recordings/              录像与录音
  profiles/<档案 id>/        岗位档案
  resumes/<简历 id>/         简历库
```

工作区根的来源有三种，优先级从高到低：配置文件里写死的 `workspaceRoot` >
面板里用「浏览…」选过的 > 自动挑的（Windows 上优先非系统盘，没有别的盘才用用户目录）。
面板顶部会显示当前路径，悬停能看到「为什么是这个目录」。换位置是**复制**不是移动，
老目录原样保留。

## 已知限制

- **桌面端浏览器拿不到摄像头。** DSH 的 Electron 权限处理只放行纯音频，
  改 Windows 设置也没用。插件改走 Host 侧 ffmpeg 采集，机器上没有 ffmpeg 时
  如实说「这台机器没有摄像头采集程序」——只影响画面与录像。
- **摄像头是独占设备。** 预览与录像必须同一个进程，浏览器的摄像头与 Host 的摄像头
  不能同时开，面板上的两个按钮互斥。
- **语音识别不是流式。** 宿主的识别只有整段转写，准实时靠客户端按静音切段。
- **播报只做一次性合成**，不支持实时语音对话模型（S2S）——那类模型接上也不会响。
- **虚拟面试官需要 WebGL2。** 少数远程桌面环境里那块小窗显示「形象不可用 ·
  面试照常进行」。走浏览器音色播报时没有口型，只做说话姿态。
- **插件不写面试题，也不写报告。** 内容与判断归模型，插件负责状态与留痕。
- **浏览器自带识别在部分网络环境不可达。** 识别失败不是错误状态，切键盘继续。

## 隐私

简历、JD、转录、录像、报告全部留在本机，插件不上传。
对外只发两种请求：你自己给的 JD 链接，以及你在设置页配置的语音服务端点。

## 更多

- 完整说明与开发纪律：https://github.com/LiangshouX/dsh-realtime-interview
- 接口契约：https://github.com/LiangshouX/dsh-realtime-interview/blob/main/docs/API.md
- 界面契约：https://github.com/LiangshouX/dsh-realtime-interview/blob/main/docs/DESIGN.md
- 未实现与待优化项：https://github.com/LiangshouX/dsh-realtime-interview/blob/main/ROADMAP.md

---

# 实现要点

> 给改这个插件的人。产品纪律见 `AGENTS.md`，接口契约见 `API.md`，
> 界面契约见 `DESIGN.md`，话轮状态机见 `TURN-TAKING.md`。

## 卷宗库根目录怎么定

三种来源，优先级从高到低：

| 来源 | 含义 | 怎么来的 |
|---|---|---|
| `config` | 配置里写死了 | `cordis.patch.yml` 的 `workspaceRoot`（用户的 layer 也算） |
| `settings` | 面板里用「浏览…」选过 | profile 目录里的 `dsh-realtime-interview.json` |
| `default` | 两处都没说 | 自动挑：Windows 上优先非系统盘，没有别的盘才退回家目录 |

「浏览…」走宿主原生目录选择器（`ctx.directoryPicker` 的 `capability()`），
**必须传 AbortSignal**——宿主 native 后端第一件事就是读 `signal.aborted`，
不传会以 `Cannot read properties of undefined` 失败，看着像「选择器坏了」。
服务名不是 `directoryPickerController`（那是给远端调用者用的）。
宿主只有 `browse` 能力时如实回报，并给出手动填绝对路径的出路。

会话 id 形如 `iv-20261116053012-a3f1`，只允许 `[A-Za-z0-9_-]`——它是路径片段，
必须挡住路径穿越。切根时迁移是**复制**（`fs.cp`），旧目录原样保留。

## 简历解析

| 格式 | 做法 | 可靠性 |
|---|---|---|
| `.txt` / `.md` / `.json` | 直接解码 | 高 |
| `.docx` | 自解 zip（中央目录 → inflateRaw）→ `word/document.xml` → 抽 `<w:t>` | 高 |
| `.pdf` | 解 Flate 流 → 文本算子 → ToUnicode CMap 映射 | 中（尽力而为） |
| `.doc` | 不支持 | — |

**先看魔数再看扩展名**：扩展名会说谎，魔数不会。提取结果里有大量替换字符
（`\uFFFD`）或控制字符时打一条 `warnings`——「编码不完整，结果可能有乱码，请核对预览」。

JD 只收纯文本：客户端按扩展名挡一道，服务端（`plainOnly`）再按文件头挡一道。

## JD 抓取

```
fetch(url, UA 伪装成桌面 Chrome, Accept-Language: zh-CN)
  → 剥掉 script/style/noscript/iframe/form/button/svg/canvas
  → 优先取 id/class 命中内容容器特征的片段（job-detail / jobDesc / description …）
  → 取不到就用整页正文
  → 去标签（保留块级换行）→ 解实体 → 收拾空白
  → 按「岗位职责 / 任职要求 / 加分项」切段
```

**正文少于 40 字即判失败**——多半是登录墙、验证码页或正文完全由前端渲染。
这时候返回 `{ok:false, error, hint}`，不返回空正文。

## 轮询与 revision

服务端每次返回内容指纹（`session.json` / `checklist.json` / `transcript.jsonl` /
`report.md` 的 **mtime + size** 派生），客户端比对相同就**跳过 setState**。
没有它，面板在面试中每 1.5 秒会重建一次，在 Electron 里就是持续的主线程占用。

转录只回传最近 200 轮（`transcriptLimit`），并如实报出 `transcriptTotal` 与
`transcriptTruncated`。归档正文（简历 / JD）单独取，不跟轮询走——简历动辄几十 KB。

阈值见 `AGENTS.md` §11 与 `scripts/perf.mjs`、`scripts/render-probe.mjs`；
两条闸门都接在 `node scripts/build.mjs` 上。

## 考点清单是活文档

准备阶段的清单是**快照**，面试过程中的清单是**现场**。两者用同一份文件表示，
靠 `adjustments[]` 区分。四种操作：`add`（加）、`update`（改写）、`remove`（去掉）、
`probe`（标记已问 + 记结论）。

**每次操作都要求 `reason`。** 不写理由的调整在复盘时没有价值——
「为什么最后问了这些」是复盘里最难重建的东西。

