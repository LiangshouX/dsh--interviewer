# AGENTS.md — dsh-interviewer 开发规范

> 给在这个仓库里工作的 AI Agent 与人看的**操作纪律**。
> 产品定义见 `docs/PRD.md`；接口契约见 `docs/API.md`；仓库说明见 `README.md`。

---

## 一句话

这个仓库是**开发对象**，不是运行中的东西。
**跑起来的东西是 `release/` 里的 tarball。**

---

## 1. 安装纪律（最容易出事的一条）

### 规则

> **永远不要把源码目录当安装目标。先打包，再安装 tarball。**

```bash
node scripts/build.mjs      # 构建发布态：build/skills
node scripts/pack.mjs       # 打包 → release/dsh-interviewer-<version>.tgz
```

然后用 `plugin_manager` 的 `install_bundle`，`target` 指向刚打出来的那个 `.tgz`。

### 为什么

把 `target` 指向源码目录时，profile 里留下的是**指向仓库的软链**，于是同时踩三个坑：

| 坑 | 后果 |
|---|---|
| 仓库里的一次误改**立刻**改变运行中的插件 | 分不清哪一份是发布物；线上行为不可复现 |
| 打包工具在仓库里落下 `node_modules/`、`pnpm-lock.yaml` | **弄脏 git**，源码与安装产物混在一个目录 |
| 目录被移动/删除/切分支 | 运行中的插件直接断掉 |

`release/` 与 `build/` 都在 `.gitignore` 里 —— 它们是产物，不是源码。

### 改了源码之后

```bash
node scripts/pack.mjs
plugin_manager remove_bundle  dsh-interviewer
plugin_manager install_bundle  <release/*.tgz>
```

然后**刷新 DSH 页面**。注意：**Host 半边不会热重载**——
改 `src/host/**` 要等 DSH 重启才生效；只改 `client.js` 刷新就够。

---

## 2. 开发态 / 发布态分离（不可破）

```
src/       ← 开发对象（DSH 不可见）
  host/      Host 半边源码
  skills/    Skill 源码（开发中的 Skill 永远不被 agent 调到）
build/     ← 发布物（gitignore）
  skills/    通过校验的 Skill（bundledSkillDir 指向这里）
release/   ← npm bundle tarball（gitignore）
```

- `src/skills` 不在 DSH 任何扫描根目录（`.dsh/skills` / `.agents/skills`）→ 双重隔离。
- `build/` 由 `scripts/build.mjs` 从 `src/` 生成，并跑**发布前校验**。
- 校验不过 → **非 0 退出，不产出**。不要跳过校验直接 `cp`。

> DSH 的 skill 发现深度只有一层：只认 `<root>/<name>/SKILL.md`。
> 布局必须是 `build/skills/<name>/SKILL.md`。

---

## 3. 一个总根

所有数据集中在**一个工作区根**下：

```
<workspaceRoot>/
  workspaces/<session-id>/    一场面试 = 一个子目录
  profiles/<profile-id>/      岗位档案
```

- `workspaceRoot` 留空 = 自动（用户主目录下的 `DSH-INTERVIEWER/`），
  也可以指到 D 盘这类大盘。
- **不要散落。** 会话散在各处是治理灾难：谁也说不清哪份是最新的、
  哪场面试属于哪个岗位。
- 界面必须能回答「数据存到哪儿了、为什么是这个目录」——
  `describeWorkspaceRoot()` 返回路径、来源与理由，面板顶部要显示它。

## 4. 单一真源

| 内容 | 真源 | 谁读它 |
|---|---|---|
| 会话状态 | `sessions/<id>/session.json` | 插件、agent、报告 |
| 简历 / JD | `resume.txt` / `jd.txt` | 插件、agent |
| 考点清单 | `checklist.json` | 插件、agent、报告 |
| 转录 | `transcript.jsonl` | 插件、agent、报告 |
| 报告 | `report.md` | 插件、人 |

**推论**：插件**不缓存业务状态**。状态从磁盘派生；缓存由文件 mtime + size 失效。
不要在内存里维护一份「当前清单」——那样界面和 agent 迟早看到不同的两份。

---

## 5. 硬边界（违反就是设计错误）

| 边界 | 原因 |
|---|---|
| 插件**不写面试题** | 题目是模型（宿主侧）生成的；插件只管结构与留痕 |
| 插件**不写分析报告** | 同上。报告由模型写，插件负责落盘 |
| 插件**不外传简历与 JD** | 抓取只针对用户自己给的链接，落盘只在本机 |
| 插件**不发起付费生成** | 语音能力优先用浏览器原生 API |
| 插件**不缓存业务状态** | 见 §3 |
| 插件**不自己实现业务规则** | 阈值、话术、评分口径都不在插件里硬编码 |

---

## 6. 一个操作，两个调用者

界面上点一下「抓取 JD」和 agent 调 `interview_prepare`，必须走**同一个 service 方法**、
**同一套错误语义**。否则人和 agent 对「这份 JD 到底存进去没有」的理解会分叉，
插件就成了新的信息分裂源。

**新增任何操作时，先在 `src/host/service.js` 落一个方法，再分别挂到 API 和 tool 上。**
不要在 api.js 里直接写业务逻辑，也不要在 tools.js 里重新实现一遍。

---

## 7. 失败必须给出路

这是本插件最重要的产品纪律，比任何技术细节都重要。

### 6.1 JD 抓取失败

抓不到时**不许返回空正文当成功**。必须返回 `{ ok: false, error, hint }`，
`hint` 里写清手动兜底怎么做（粘贴文本 / 上传文件）。
界面必须把这条 hint 显示出来，而不是显示一个空白的 JD 框。

### 6.2 简历读不出文字

扫描件 PDF、图片型 docx、无字文本——都要**如实说**，并给出替代路径
（粘贴文本，或在 DSH 对话里让助手读文件）。
「提取成功但内容是乱码」比「提取失败」更糟，要用 `warnings` 说出来。

### 6.3 语音识别不可用

Web Speech API 在很多网络环境里不可达（Chromium 的识别后端要连境外服务）。
识别失败**不是错误状态**，是**正常状态**：切到键盘输入，继续面试。
**任何时候都不能出现「因为麦克风坏了就开不了口」的情况。**

### 6.4 摄像头权限被拒 —— 要**主动申请**，不是甩一句错误

摄像头是氛围，不是刚需。但「拿不到」不等于「拿不到就完了」。

被拒是常事（没设备、系统关掉了、之前被拒过）。所以客户端的契约是：

1. **先探再请。** 用 `navigator.permissions.query({name:'camera'|'microphone'})`
   拿到当前授权状态，再决定怎么请。
2. **状态是 `prompt` 就发起申请** —— `getUserMedia` 会弹系统对话框。
3. **状态是 `denied` 也要说清出路**：明说「系统已记住拒绝」，指出
   「在系统设置里放行后这里会自动接上」，并提供「重新检测授权状态」按钮。
4. **盯着状态变化。** `permissions.query()` 的 `onchange` 一变到 `granted`
   就自动重连 getUserMedia——用户在系统设置里放行后**不用再点一次**。
5. **分清四种原因**，它们的出路完全不同：
   `NotAllowedError`（被拒）、`NotFoundError`（没设备）、
   `NotReadableError`（被占用）、`SecurityError`（页面不安全）。
   笼统地说「打不开摄像头」等于没给路。

**没有摄像头时舞台不能塌成黑框** —— 见 §10.1。

### 6.5 继承宿主配置失败

插件会尝试继承 DSH 宿主的模型配置来做服务端语音识别。
**宿主有模型 ≠ 插件拿得到 ASR 凭据。**

拿不到时必须返回 `mode: 'browser'` 并附一条说清原因的 `reason`，
面板把它显示出来。**不许**在没有实际调用成功的情况下宣称"已继承宿主"，
也不许静默失败——用户会以为在用服务端识别，实际听到的是空转。

### 6.6 继承岗位档案不等于照抄

`applyProfile` 继承来的考点要**打标记**（`inherited` / `inheritedFrom`），
并记一条 `adjustments`。继承是基线，不是本场面试的成果——
事后复盘要能分清「这个考点是档案里带来的，还是这场才想到的」。

---

## 8. 目录约定

| 路径 | 放什么 |
|---|---|
| `src/host/` | Host 半边：service / api / tools / skills / jd / html / extract |
| `src/skills/<name>/SKILL.md` | 随包技能源码 |
| `client.js` | 浏览器半边（单文件，零构建、零运行时依赖） |
| `scripts/` | build / pack |
| `docs/` | PRD / API / DETAIL |
| `tests/` | `node --test` 的单测 |

**新增文件前先看这张表。** 新的能力优先落在 `src/host/service.js` 的方法上，
不要一上来就加新的 host 模块——模块一多，「一个操作，两个调用者」的边界就模糊了。

---

## 9. 提交前自检

```bash
node scripts/build.mjs     # 语法 + 插件半边 + 运行时冒烟 + 客户端 SSR 渲染
node --test tests/*.test.js
```

`build.mjs` 会额外用**真的 React + SSR** 把 `client.js` 渲染一遍
（`scripts/client-smoke.mjs`）——`client.js` 只在浏览器里跑，
`node --check` 只能查语法，查不出「变量名写错」和「hook 用错」。
没装 react 时这一步会跳过而不是失败。

`build.mjs` 会拦住的：frontmatter 不合法、引用了不存在的包内路径、
manifest 字段缺失、`client.js` 没走 `window.__ModuleLoader__.load`、
任何 JS 语法错误、Host 半边跑不起来。

**没跑过 `build.mjs` 的代码不算写完。**

---

## 10. 客户端纪律

### 10.0 设计语言：面试卷宗

界面不是「一个后台面板」，是**一份案卷**：

| 元素 | 隐喻 | 界面语言 |
|---|---|---|
| 简历 / JD | 卷内材料 | 纸面预览（衬线），可展开编辑 |
| 考点清单 | **面试官的底稿** | 默认收起，可点开 |
| 转录 | 速记 | 右栏常驻滚动区 |
| 报告 | 评估表 | 阅读型版式，衬线标题 |

三条从隐喻里长出来、**不许回退**的产品纪律：

1. **底稿默认收起。** 准备阶段可查可改；面试中**完全不可见**（只留计数）。
   真实的候选人不看得到考题——把清单摊开，它就变成答题游戏了。
2. **提问要压在画面上。** 当前问题做成视频下缘的**下三分之一字幕条**，
   不是旁边的一个字段。它和你的脸在同一块画面上，那才是面试的现场感。
3. **舞台永远是主位。** 面试中视频区吃满左半屏；**没有摄像头时也保持同样
   大的画面框**，改成有设计的「未接通」状态（暗场渐变 + 姓名 monogram +
   仍在跳的电平表/REC/计时），**不塌成黑框**。

配色：**深墨底 + 骨白纸感 + 单一氧化朱红（REC）+ 琥珀（提问）+ 青玉（就绪）**。
主按钮用骨白反色——蓝按钮会让它退回通用后台的样子。字体三档：
衬线（提问与报告标题）/ 无衬线（UI）/ 等宽（计时、电平、路径、字数）。

### 10.1 `client.js` 是单文件、无构建的浏览器 bundle

几条规矩：

1. **React 从模块表取**：`require('react')`，不要引 CDN、不要打包。
2. **不自己画聊天**。提问与回答的主流程在 DSH 对话区；面板是**现场控制台**
   （画面、录音、识别、当前问题、转录、报告），不要在面板里造一个聊天框
   去和助手重复对话。
3. **不要让面板成为唯一入口**。每个功能都要有键盘/文本兜底。
4. **数组 children 的每个元素都要有 `key`。** React 的 `createElement` 只对
   *单个* child 打「已验证」标记，数组 children 会逐个检查 key——手写的
   `h(...)` 没有 JSX 编译器的静态标记，缺 key 会刷警告并让列表重排时状态串位。
   新增数组 children 时跑 `node scripts/fix-keys.mjs` 补齐。
   **注意两个静态脚本抓不到的情况**：① 先赋给变量、再放进数组的元素
   （`const stage = h(...)` → `[stage]`）——React 照样查它的 key；
   ② 数组里**直接调用组件函数**（`statTile('提问', 3)`）——组件自己没法拿到
   key（React 会把 `key` 从 props 里摘掉），所以要么走 `h(Component, {key})`，
   要么改成数据驱动的 `.map()`。这两类由 `render-probe` 的运行时告警兜底。
5. **`requestAnimationFrame` / `cancelAnimationFrame` 要做存在性检查。**
   裸调用在部分宿主（测试沙箱、内嵌 WebView）里直接抛 ReferenceError，
   把整个面板挂掉。音量条失败不该影响面试本身。

---

## 11. 性能是红线

> 插件是**嵌在别人的主应用里**的：插件慢一点，用户就会说「DSH 卡了」。
> 功能做得再好也救不回来——一个卡顿的插件会被直接关掉。

所以性能不是「有空再优化」，是**红线**：要有能测、能卡住回归的闸门。

### 两道闸门

```bash
node scripts/perf.mjs --check          # Host/HTTP 侧耗时与响应体积
node scripts/render-probe.mjs --check   # 客户端渲染开销 + 空闲轮询不得重渲染
```

两条都接进了 `node scripts/build.mjs`——**过不了闸门的代码不算写完**。

### 基线（本机实测，Linux 容器；用户机是 Windows + Electron，会更慢）

| 指标 | 实测 | 阈值 |
|---|---|---|
| getState（空会话）p95 | ~2 ms | 30 ms |
| getState（500 轮转录）p95 | ~10 ms | 120 ms |
| listSessions（20 个会话）p95 | ~27 ms | 150 ms |
| HTTP 往返（500 轮转录）p95 | ~13 ms | 60 ms |
| 轮询响应体积 | ~26 KiB | 256 KiB |
| 首屏渲染 | ~26 ms | 120 ms |
| 切到面试中（200 轮转录） | ~57 ms | 400 ms |
| **空闲轮询引发的重渲染** | **0 次** | **0 次** |

阈值按这里测出的数字乘 3 设定，给 Windows 留余量。
**用户机实测后应该用真数字替换。**

### 六条规矩（每条都对应一个已经解决的真问题）

1. **轮询必须带 revision。** 服务端每次返回内容指纹（文件 mtime+size 派生），
   客户端比对相同就**跳过 setState**。没有它，面板在面试中每 1.5 秒就会
   重建一次（含几百行转录）——那是「插件让 DSH 卡顿」最常见的来源。
2. **列表只判断存在性，不要读内容。** 会话列表曾经为了显示「有没有简历」
   把整个简历文件读一遍——一次列表就是白读几 MB。
3. **响应体积要封顶。** 转录只回传最近 200 轮（`transcriptLimit`），
   并如实报出 `transcriptTotal` 与 `transcriptTruncated`。
4. **大对象不进内存常驻。** 录音/录像用完即存盘，不在插件里攒着。
5. **重活放客户端。** 音频转码（webm→WAV）在浏览器里做，不占 Host 进程。
6. **不要在 Host 里做渲染。** Host 只管数据与路由，UI 全在 `client.js`。

### 探针自己的失败模式（别被它骗了）

- **SSR 不跑 `useEffect`**：用 `renderToStaticMarkup` 测不到「轮询 → setState →
  重渲染」这条真实路径，所以渲染开销用 `react-test-renderer` 测。
- **`act()` 遇到活着的定时器可能永远不返回**：面板切到面试中后会起 1.5 秒的
  轮询定时器，探针里**等待必须放在 `act()` 之外**，否则探针自己挂住，
  看起来像"被测代码卡了"。
- **测出来的数字要在报告里写清环境**：Linux 容器 ≠ Windows + Electron。

## 12. 渲染层的几条教训

来自同类插件的实测，写在这里免得重犯：

- **纵向 flex 容器里的子项会被压扁** → 给子项显式 `flex: '0 0 auto'` 或 `minHeight`。
- **祖先 `overflow: hidden` + 自身带 `filter` 的 `<img>` = 空白图片**。
- **渐变背景 + `backdrop-filter` 同一元素 = 内容不画**。
- **中文标题在窄列里会被压成一个字一行** → 横向 flex 的子项加 `minWidth: 0`，
  或给标题容器 `white-space: nowrap`。

---

## 13. 数据与隐私

- 简历、JD、转录、录像**全部留在本机**（默认 `~/DSH-INTERVIEWER/`，可配 `workspaceRoot`）。
- 插件**不上传**任何东西。唯一的对外请求是用户自己给的 JD 链接。
- 录像是**可选**功能，默认可关；它制造氛围，不承担举证责任。
- 不要在代码或日志里打印简历/JD 的正文片段（`api.js` 的错误信息尤其注意）。
