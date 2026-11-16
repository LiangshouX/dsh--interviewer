# dsh-realtime-interview — 模拟面试间

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
| **语音识别** | 宿主优先：DSH 的语音服务 → 插件自己的服务端识别 → 浏览器原生 → 键盘兜底；前两级用**分段识别**（按静音切段，边说边出字） |
| **语音播报** | 模型音色优先：MiMo TTS / OpenAI / MiniMax → 免密钥自然音 → 浏览器音色；**按句流水合成**（第一句到了就开口），同一句只合成一次 |
| **语流观察** | 从音频帧测停顿/语速/重复/口头语，随每轮回答落进 `meta.fluency`，面试官据此调整追问，报告里出一节「表达」（观察值，不是评分） |
| **岗位档案** | 同一个岗位第二次面试，直接继承上次的考点基线；面试结束可回写更新 |
| **分析报告** | 面试结束基于**转录原话**写报告，不是通用套话 |

## 安装

**先打包，再装 tarball**（不要把源码目录当安装目标，见 [AGENTS.md](AGENTS.md) §1）：

```bash
node scripts/pack.mjs
# → release/dsh-realtime-interview-<version>.tgz
```

然后用 `plugin_manager` 的 `install_bundle`，`target` 指向那个 `.tgz`：

```
target: <仓库绝对路径>/release/dsh-realtime-interview-<version>.tgz
```

刷新 DSH 页面。**Host 半边不会热重载**——改 `src/host/**` 要等 DSH 重启；
只改 `client.js` 刷新就够。

## 用法

插件在 DSH 侧边栏挂一个「模拟面试间」入口，面板分三页：**准备 / 面试中 / 报告**。

面板顶部有一条**流程脊线**（归档材料 → 底稿调研 → 面试中 → 评估表），
一眼知道自己卡在哪一步。

### 准备

1. 新建面试 → 上传或粘贴简历、粘贴 JD（或填岗位链接点「抓取 JD」）。
   归档之后内容**直接显示成可读的纸面预览**，点「修改」才进编辑器。
2. 在 DSH 对话里让助手做调研：

   > 用 interview-prep 技能，基于我刚才准备的简历和 JD 出一份考点清单

3. 助手调 `interview_save_checklist` 落盘。面板里的**「面试官底稿」默认收起**
   ——只显示「14 项 · 已问 5」，点开才看得到清单。

   为什么要收着：真实面试里候选人不看得到考题。清单摊开着，它就成了
   答题游戏；收起来，它才是面试。

### 面试中

1. 面板切到「面试中」。**视频区就是舞台**，当前问题做成压在人像下缘的
   **下三分之一字幕条**——它和你的人像在同一块画面上。
2. 摄像头/麦克风**没有也能继续**：画面区保持同样大小，改成一个设计过的
   「未接通」状态（暗场 + 姓名 + 仍在跳的电平表/计时），面试照常进行。
3. 拿不到权限时插件会**主动发起授权申请**（不是只显示失败）：
   先探授权状态 → 弹系统申请 → 被拒了明说去哪儿放行 → **盯着系统设置里的
   变化，你放行后自动接上**，不用再点一次。
4. 助手在对话区提问，它用 `interview_record_turn` 写进转录，面板实时显示。
5. 候选人说话（自动转写成草稿，可改）→ 点「提交回答」进入速记。
6. 想让助手直接看到你的回答，点「复制」粘到 DSH 对话框。
7. 中途可以调清单：让助手用 `interview_mutate_checklist` 加/删/标记已问。
   **面板里看不到具体考题**——那是不透题，不是功能缺失。

### 报告

面试结束后在对话里说：

> 用 interview-conduct 技能收尾，写面试分析报告

助手调 `interview_finish` 写报告，面板「报告」页显示。

## 桌面端的摄像头：两条采集通道

DSH 桌面端的 Electron 权限处理器只放行纯音频请求，所以**浏览器里的摄像头被挡**。
Host 侧有两条采集通道，启动时自动选：

1. **ffmpeg（DirectShow）** —— 更快、更轻，绝大多数机器走这条；
2. **Chromium（Media Foundation）** —— ffmpeg 打不开时自动回落。
   Windows 11 24H2 上有一类机器 DShow 采集坏了（「相机」应用正常、ffmpeg 报
   Unable to BindToObject），而 Chromium 的 MF 采集还能用。

面板会显示当前用的是哪条（`ffmpeg` 或 `chromium-mf`）。两条都需要**本机**有对应程序：
ffmpeg 由你指定路径或走 PATH；Chromium 通道用本机的 Chrome / Edge（也可在设置里指定）。

### 为什么需要 ffmpeg

DSH 桌面端（Electron）**只放行纯音频的媒体请求**，摄像头在主进程就被拒了——
请求压根没走到 Windows 的隐私设置，所以**改系统设置没用**。

插件的 Host 半边跑在 Node 宿主进程里，那里没有这道闸门。于是桌面端的摄像头
改成 **Host 侧用 ffmpeg 直采**：Host 打开设备，把画面以 MJPEG 流推给面板，
`<img>` 直接吃；录像在 Host 侧直接落盘到这场面试的卷宗目录。

**ffmpeg 不是系统自带，也不是 DSH 自带**——它是独立的第三方程序，新机器上大概率没有。

```bash
winget install Gyan.FFmpeg      # Windows
brew install ffmpeg             # macOS
```

没装也能继续：插件会如实说「这台机器没有摄像头采集程序」并告诉用户怎么装，
**不会**说成「摄像头坏了」。麦克风、键盘提问、文字回答、报告全都照常。

装完有三种指定方式（按优先级）：

| 方式 | 怎么做 |
|---|---|
| 配置 | 在 `cordis.patch.yml` 里写 `config.ffmpegPath: 'D:\\ProgramFils\\ffmpeg\\bin\\ffmpeg.exe'` |
| 环境变量 | `DSH_FFMPEG_PATH` 指向 `ffmpeg.exe` |
| 放常见位置 | `D:\ProgramFils\ffmpeg\bin\`、`C:\ffmpeg\bin\` 等，插件会自己认 |

> 改完 `config.ffmpegPath` 或装完 ffmpeg，要**重启 DSH**——Host 半边不热重载。

## 语音识别怎么配

插件的识别链路是**宿主优先的四级继承**：

```
① 宿主语音服务   DSH 的 ctx.speechToText（provider 由宿主注册，可以是本地模型）
② 插件配置       asrApiKeyEnv / asrBaseUrl 指向的 OpenAI / MiniMax 兼容端点
③ 浏览器原生     Web Speech API · Chromium 的识别后端
④ 键盘输入       永远可用，识别失败不阻断面试
```

前两级都是"整段录音"转写，没有流式协议，所以面板在 ①② 模式下用
**分段识别**：按静音切段（≤6 秒），每段立刻转写立刻上屏——一句话一落定。

在 `cordis.patch.yml`（或你自己的 patch 层）里配：

```yaml
config:
  asrProvider: 'auto'      # auto | host | minimax | openai | browser | none
  asrBaseUrl: ''           # 留空 = 该协议/宿主的默认端点
  asrApiKeyEnv: 'MINIMAX_API_KEY'   # 凭据引用（推荐）：走 DSH 的 credentials seam
  asrApiKey: ''            # 明文 key（不推荐；密钥别进配置文件）
  asrModel: ''             # 留空 = 按协议取默认
  asrLanguage: 'zh'
```

**两套协议，不能混**（选错就是 404/400）：

| 协议 | 端点 | 默认模型 | language 放哪 |
|---|---|---|---|
| `minimax` | `{base}/v1/speech_to_text` | `asr-1.0` | **HTTP 头** |
| `openai` | `{base}/audio/transcriptions` | `whisper-1` | **表单字段** |

协议按 provider / baseUrl 自动判定，也可以用 `asrProvider` 强制。

**宿主优先是什么意思**：DSH 若启用了 voice-input bundle，`ctx.speechToText`
就在，插件直接按 provider id 选它、**不经手任何厂商凭据**；宿主模型没准备好时
面板会显示「准备语音模型」按钮。没启用时按 ②③④ 往下走。

**能继承的只有凭据名，不是端点。** 已从装机包里读实：`ctx.llm.listProviders()`
只返回 `[{id, name}]`，没有 `baseUrl`/`apiKey`/`apiKeyEnv`。所以「继承宿主聊天
provider 的端点当识别端点」这条路不成立；宿主 profile 里的 `apiKeyEnv` 是**凭据
引用**，插件按同一个名字走 credentials seam 就能取到——这才是不复制密钥的继承方式。

**音频要转码**：浏览器只会录 webm/opus，而识别服务不收 webm。
插件在上传前用 WebAudio 解码并重编码成 **16 kHz 单声道 WAV**。

浏览器原生识别依赖 Chromium 的识别后端，在不少网络环境里连不上。
**键盘输入永远可用**，识别失败不阻断面试。

## 语音播报怎么配

播报链路同样按顺序回落，**默认不是系统机器音**：

```
① 宿主语音服务   ctx.textToSpeech（DSH 目前没有，将来有就零改动接管）
② 配好的模型     MiMo TTS / OpenAI / MiniMax（凭据走凭据名，不进插件配置）
③ 免密钥自然音   百度朗读（普通话自然度明显好于系统 SAPI 音色）
④ 浏览器音色     speechSynthesis，最后一步
```

```yaml
config:
  ttsProvider: 'auto'   # auto | host | mimo | openai | minimax | baidu | edge | browser | none
  ttsModel: 'mimo-v2.5-tts'          # MiMo 三选一，见下表
  ttsVoice: '冰糖'                    # 预置音色 id；留空用默认
  ttsApiKeyEnv: 'MIMO_API_KEY'        # 凭据名；留空按 provider 预设
  ttsStyle: '语速偏慢，语气克制'        # 风格指令 / 音色设计描述
  ttsReferenceAudio: 'D:\voice\me.mp3' # 仅 voiceclone：本机样本，合成时才读取
  ttsFormat: 'mp3'
  ttsRate: 1.0
```

MiMo 三种模型请求形状不同，插件用一个适配器统一处理：

| 模型 | 音色从哪来 | 适合 |
|---|---|---|
| `mimo-v2.5-tts` | `ttsVoice` 预置音色 id（默认 `mimo_default`） | 直接可用，面试官音色 |
| `mimo-v2.5-tts-voicedesign` | `ttsStyle` 的**文本描述**（不支持 `ttsVoice`） | 想定制一个专属面试官音色 |
| `mimo-v2.5-tts-voiceclone` | `ttsReferenceAudio` 的**本机样本**（mp3/wav ≤10 MB） | 想复刻某个具体声音 |

> 注意：MiMo 的 TTS 走的是 `POST /v1/chat/completions` + `audio` 参数，
> **不是** OpenAI 的 `/audio/speech`；两种协议插件都支持（`openai` 走后者）。

同一条播报会被缓存（按文本+语速，容量封顶），不会每句都重新合成。

## 岗位档案（历史复用）

一个岗位档案 = **一个岗位的考点基线**。

- 面试前：`interview_apply_profile` 把档案的 JD 与清单灌进本场会话
  （继承来的考点会标记为 `inherited`，不是伪装成本场的成果）
- 面试后：`interview_sync_profile` 把当前 JD、最终清单、这场面试的记录回写档案
- 准备阶段：基于继承的清单做**增量**调研——保留有效的、删掉过时的、加上新出现的

数据在 `<dataRoot>/profiles/<profile-id>/profile.json`，与会话目录平级。

## 数据在哪

**一个总根，一场面试一个子目录。** 所有数据集中在同一个工作区根下，
不散落在各处：

```
<workspaceRoot>/                        ← 一个总根，例如 D:\DSH-INTERVIEW-ROOT
  workspaces/<session-id>/              ← 一场面试 = 一个子目录
    session.json        元信息
    resume.txt          简历正文
    jd.txt / jd.json    JD 正文与来源
    checklist.json      考点清单（含调整留痕）
    transcript.jsonl    逐轮转录
    report.md           分析报告
    recordings/         录像与录音
  profiles/<profile-id>/profile.json    ← 岗位档案：JD + 考点基线 + 历场记录
```

指定总根：在 `cordis.patch.yml`（或你自己的 patch 层）里设

```yaml
config:
  workspaceRoot: 'D:\DSH-INTERVIEW-ROOT'
```

留空则自动用用户主目录下的 `DSH-REALTIME-INTERVIEW/`。
面板顶部会显示当前总根路径，悬停可看**为什么是这个目录**。

**全部留在本机，不上传。**

## 发到 npm / 安装

包名 `dsh-realtime-interview`（仓库名是 `dsh-realtime-interview`，npm 上不能用连续连字符）。

发布（需要 npm 账号）：

```bash
npm login
node scripts/pack.mjs
npm publish --access public
```

安装（三种方式）：

```bash
# 从 npm 公共市场
dsh plugin --profile web add dsh-realtime-interview

# 从 GitHub 仓库
dsh plugin --profile web add github:LiangshouX/dsh-realtime-interview

# 本地 tarball（开发时最常用）
plugin_manager install_bundle  target: <仓库绝对路径>/release/dsh-realtime-interview-<version>.tgz
```

装完**重启 DSH**（Host 半边不热重载），然后在侧边栏点「模拟面试间」。

## 界面语言

界面不是「一个后台面板」，是**一份案卷**：简历与 JD 是卷内材料，考点清单是
**面试官的底稿**，转录是速记，报告是评估表。

- **配色**：深墨底 + 骨白纸感 + 单一氧化朱红（REC 灯）+ 琥珀（提问）+ 青玉（就绪）。
  主按钮用骨白反色而不是蓝——蓝按钮会让它退回通用后台的样子。
- **字体三档**：衬线（提问与报告标题，是「人说的话」）/ 无衬线（界面）/
  等宽（计时、电平、路径、字数）。
- **结构编码真实信息**：准备页的 01/02/03 是真的步骤序号；转录里
  琥珀=提问方、青玉=回答方，颜色承担语义而不是装饰。

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

## 性能

插件嵌在 DSH 里，它慢一点用户就会说「DSH 卡了」。所以性能有**两道闸门**，
接在 `node scripts/build.mjs` 里，过不了不算写完：

```bash
node scripts/perf.mjs --check          # Host/HTTP 侧耗时与响应体积
node scripts/render-probe.mjs --check   # 客户端渲染开销 + 空闲轮询不得重渲染
```

实测基线（Linux 容器；Windows + Electron 会更慢，阈值已留 3× 余量）：

| 指标 | 实测 | 阈值 |
|---|---|---|
| HTTP 往返（500 轮转录）p95 | ~13 ms | 60 ms |
| 轮询响应体积 | ~26 KiB | 256 KiB |
| 首屏渲染 | ~26 ms | 120 ms |
| 切到面试中（200 轮转录） | ~57 ms | 400 ms |
| **空闲轮询引发的重渲染** | **0 次** | **0 次** |

三条关键设计：

- **轮询带 revision** —— 内容没变就不 `setState`，面板不会每 1.5 秒重建一次
- **响应封顶** —— 转录只回传最近 200 轮，并报出总数与是否截断
- **重活在客户端** —— 音频转码在浏览器里做，不占 Host 进程

## 开发

```bash
node scripts/build.mjs      # 构建 build/skills + 全部校验（含运行时冒烟测试）
node scripts/build.mjs --check   # 只校验
node scripts/pack.mjs       # 打包 release/*.tgz
```

纪律见 [AGENTS.md](AGENTS.md)。接口契约见 [docs/API.md](docs/API.md)，实现细节见 [docs/DETAIL.md](docs/DETAIL.md)，产品定义见 [docs/PRD.md](docs/PRD.md)，**接手开发看 [docs/HANDOVER.md](docs/HANDOVER.md)**。

## 已知限制

- **语音识别依赖浏览器的 Web Speech API**。Chromium 的识别后端在不少网络环境里不可达，
  插件会明确提示并保留键盘输入。识别的准确率也取决于浏览器实现，不做承诺。
- **PDF 解析是尽力而为**。扫描件（图片型简历）读不出文字，插件会明说并要求粘贴。
- **JD 抓取不做反爬**。登录墙、验证码、前端渲染的站点会抓不到——此时走手动兜底。
- **摄像头/麦克风需要权限**，且页面要在安全上下文里（Electron 或 localhost）。
- **桌面端的摄像头要额外装 ffmpeg**（Electron 的权限闸门只放行音频，摄像头走 Host 侧
  ffmpeg 直采）。没装时面试照常，只是没有画面和录像——见上文「桌面端的摄像头」。
- **摄像头是独占设备**：浏览器的摄像头和 Host 的摄像头不能同时开。

## License

MIT
