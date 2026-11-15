# dsh-interviewer — 模拟面试间

> 一个 DeepSeek Harness（DSH）插件：把「简历 + 目标岗位 JD」变成**一场有准备的面试**。

岗位链接能抓就抓，抓不到就走手动兜底；简历进来之后先做一轮**考点清单调研**，
再按清单逐轮提问——但清单不是剧本，面试中它会被随时调整。现场可以开摄像头、
录音、语音播报问题、语音识别作答；结束后给出基于转录的分析报告。

---

## 它解决什么

准备一场面试要干三件事：**读懂岗位**、**读懂这个人**、**想清楚要问什么**。
这三件事以前是面试官在脑子里做的，做不了两遍，也留不下痕迹。

这个插件把三件事拆成可复用的流程：

```
简历 + JD ──► 考点清单 ──► 逐轮提问 ──► 录像/录音/转录 ──► 分析报告
   ▲            │             │                                  │
   │            └──── 边问边调 ────────────────────────────────┘
   └── 手动兜底（抓取失败 / 文件读不出）
```

## 功能

| 能力 | 说明 |
|---|---|
| **JD 链接抓取** | 给一个岗位链接，自动抓正文并切成「职责 / 要求 / 加分」。抓不到就**如实说**，并给出手动兜底 |
| **简历解析** | `.txt` / `.md` / `.docx`（自解 zip）/ `.pdf`（自解流 + ToUnicode），读不出明说，不假装成功 |
| **考点清单** | agent 用 `interview-prep` 技能做调研产出，落盘为分级的活文档（`core` / `deep` / `bonus`） |
| **动态调整** | 面试中 `add` / `update` / `remove` / `probe` 四种调整，每次都留理由 |
| **摄像头** | 现场画面 + 录像指示灯，权限被拒就降级，不阻断流程 |
| **录音** | MediaRecorder 录制，停止后一键保存到本机会话目录 |
| **语音播报** | 助手的新问题自动朗读（Web Speech Synthesis），可关 |
| **语音识别** | Web Speech API 转写候选人的回答；识别不可用时**键盘输入始终可用** |
| **分析报告** | 面试结束基于**转录原话**写报告，不是通用套话 |

## 安装

**先打包，再装 tarball**（不要把源码目录当安装目标，见 [AGENTS.md](AGENTS.md) §1）：

```bash
node scripts/pack.mjs
# → release/dsh-interviewer-<version>.tgz
```

然后用 `plugin_manager` 的 `install_bundle`，`target` 指向那个 `.tgz`：

```
target: <仓库绝对路径>/release/dsh-interviewer-<version>.tgz
```

刷新 DSH 页面。**Host 半边不会热重载**——改 `src/host/**` 要等 DSH 重启；
只改 `client.js` 刷新就够。

## 用法

插件在 DSH 侧边栏挂一个「模拟面试间」入口，面板分三页：**准备 / 面试中 / 报告**。

### 准备

1. 新建面试 → 上传或粘贴简历、粘贴 JD（或填岗位链接点「抓取 JD」）
2. 在 DSH 对话里让助手做调研：

   > 用 interview-prep 技能，基于我刚才准备的简历和 JD 出一份考点清单

3. 助手调 `interview_save_checklist` 落盘，插件面板里立刻显示清单

### 面试中

1. 面板切到「面试中」→ 开摄像头（可选）→ 点「开始面试」
2. 助手在对话区提问，它用 `interview_record_turn` 写进转录，面板实时显示「当前问题」
3. 候选人说话（自动转写成草稿，可改）→ 点「提交回答」进入转录
4. 想让助手直接看到你的回答，点「复制」粘到 DSH 对话框
5. 中途可以调清单：让助手用 `interview_mutate_checklist` 加/删/标记已问

### 报告

面试结束后在对话里说：

> 用 interview-conduct 技能收尾，写面试分析报告

助手调 `interview_finish` 写报告，面板「报告」页显示。

## 数据在哪

默认落在 `~/DSH-INTERVIEWER/sessions/<session-id>/`：

```
session.json      元信息
resume.txt        简历正文
jd.txt / jd.json  JD 正文与来源
checklist.json    考点清单（含调整留痕）
transcript.jsonl  逐轮转录
report.md         分析报告
recordings/       录像与录音
```

**全部留在本机，不上传。** 改位置：在 `cordis.patch.yml` 里设 `dataRoot`。

## 架构

```
index.js            Host 入口：service + API + tools + 随包技能
client.js           浏览器半边：面板、摄像头、录音、ASR、TTS
src/host/service.js 唯一实现（一个操作，两个调用者）
src/host/api.js     浏览器路由 /interviewer/api/*
src/host/tools.js   agent 工具 interview_*
src/host/jd.js      JD 抓取
src/host/html.js    HTML → 正文 + 分段
src/host/extract.js 简历解析（txt / docx / pdf）
src/skills/         随包技能（构建到 build/skills）
```

**插件负责状态与留痕，模型负责内容与判断。** 插件不写面试题、不写报告——
那是模型在宿主侧做的事。插件只保证：界面上的和 agent 看到的永远是同一份事实。

## 开发

```bash
node scripts/build.mjs      # 构建 build/skills + 全部校验（含运行时冒烟测试）
node scripts/build.mjs --check   # 只校验
node scripts/pack.mjs       # 打包 release/*.tgz
```

纪律见 [AGENTS.md](AGENTS.md)。接口契约见 [docs/API.md](docs/API.md)，产品定义见 [docs/PRD.md](docs/PRD.md)。

## 已知限制

- **语音识别依赖浏览器的 Web Speech API**。Chromium 的识别后端在不少网络环境里不可达，
  插件会明确提示并保留键盘输入。识别的准确率也取决于浏览器实现，不做承诺。
- **PDF 解析是尽力而为**。扫描件（图片型简历）读不出文字，插件会明说并要求粘贴。
- **JD 抓取不做反爬**。登录墙、验证码、前端渲染的站点会抓不到——此时走手动兜底。
- **摄像头/麦克风需要权限**，且页面要在安全上下文里（Electron 或 localhost）。

## License

MIT
