# 交接说明 —— dsh-realtime-interview（模拟面试间）

> 写给**接手这个仓库的开发者或 AI 编码器**。
> 目标：你读完这一份，就能独立改功能、改界面、跑通自检，不用来回问人。

---

## 0. 一分钟速览

| | |
|---|---|
| 仓库 | `git@github.com:LiangshouX/dsh-realtime-interview.git`（公开） |
| 主分支 | `main` |
| 交接时的提交 | `298719c` feat(client): 界面重做 —— 面试卷宗、放大舞台、主动申请权限、底稿默认收起 |
| 这是什么 | 一个 **DSH（DeepSeek Harness）插件**：把「简历 + 目标岗位 JD」变成一场有准备的模拟面试 |
| 两半 | **Host 半边**（Node，服务端，存盘 + 工具 + API）/ **浏览器半边**（`client.js`，单文件零构建） |
| 运行时依赖 | **零**。React 从宿主的模块表取（`require('react')`） |
| 数据 | **全在本机**，一个总根（默认 `~/DSH-REALTIME-INTERVIEW/`），只对用户自己给的 JD 链接发请求 |

克隆：

```bash
git clone git@github.com:LiangshouX/dsh-realtime-interview.git
cd dsh-realtime-interview
npm install
```

---

## 1. 先读这三份（**按这个顺序**）

| 文件 | 是什么 | 为什么必读 |
|---|---|---|
| **`AGENTS.md`** | 开发规范全文 | **权威**。硬边界、失败必须给出路、性能红线、客户端纪律都在里面。改代码前先通读相关章节。 |
| `README.md` | 产品说明 + 装机 + 配置 | 用户视角。改界面前看它确认「这个功能是给谁用的」。 |
| `docs/DETAIL.md` | 实现细节 | 为什么这么做（状态机、清单为什么是活文档、ASR 两套协议、轮询与 revision）。 |

辅助：`docs/API.md`（Host ⇄ Client 契约）、`docs/PRD.md`（产品需求）。

> **本文档只讲「怎么接手」，不重复规范。** 规范以 `AGENTS.md` 为准；两者冲突时以 `AGENTS.md` 为准。

---

## 2. 这个插件的职责边界（最容易搞错的地方）

```
        ┌──────────── DSH 宿主 ────────────┐
        │  Harness agent（模型在这里）      │
        │  · 生成面试题、追着答案深挖        │
        │  · 判断回答质量、写分析报告        │
        └───────────────┬───────────────────┘
                        │  interview_* 工具
                        ▼
   ┌─────────── 插件（dsh-realtime-interview）───────────┐
   │  · 会话状态机（草稿→进行中→结束）            │
   │  · 考点清单的结构、持久化、动态调整（留痕）    │
   │  · 转录、录像录音落盘、报告落盘                │
   │  · 岗位档案（复用上一场同岗位的底稿）          │
   └───────────────┬───────────────────────────┘
                   │  /interviewer/api/…
                   ▼
              浏览器面板（client.js）
```

**三条硬边界（不可破）**：

1. **插件不自己写面试题目。** 题目由宿主侧的 agent 生成。插件只管清单的**结构、存盘与动态调整**。
   → 界面**不显示具体考题**（见 §6「不透题」），这不是功能缺失，是设计。
2. **插件不缓存业务状态。** 状态从磁盘派生，靠文件 mtime + size 生成的 `revision` 判失效。
3. **插件不外传简历与 JD。** 抓取只针对用户自己给的链接，落盘只在本机。

---

## 3. 代码地图

```
dsh-realtime-interview/
├── index.js                  # 插件入口：建 service、挂 API、注册工具、注册技能
├── client.js                 # ★ 浏览器半边（单文件，~100 KB，零构建）
├── src/host/
│   ├── service.js            # ★ 所有操作的唯一实现（会话/清单/转录/报告/档案）
│   ├── api.js                # HTTP 层 + 信任围栏（loopback + 非跨站 + 同源）
│   ├── tools.js              # 暴露给 agent 的 13 个 interview_* 工具
│   ├── asr.js                # 服务端语音识别（minimax / openai 兼容两套协议）
│   ├── jd.js                 # JD 链接抓取 + 正文提取 + 职责/要求/加分项切分
│   ├── html.js               # HTML → 正文 + 结构切分
│   ├── extract.js            # txt/md/json/docx(自解 zip)/pdf 解析
│   ├── skills.js             # 注册随包技能
│   ├── fsx.js / paths.js     # 文件与路径工具（路径逃逸防护）
├── src/skills/
│   ├── interview-prep/SKILL.md      # 调研 + 出考点清单
│   └── interview-conduct/SKILL.md   # 主持 + 收尾写报告
├── scripts/                  # build / pack / fix-keys / perf / render-probe / client-smoke
├── tests/                    # node --test 单测（4 个文件，26 项）
├── dev/                      # ★ 视觉预览环境（见 §5，不随 npm 发布）
└── docs/                     # PRD / API / DETAIL / HANDOVER
```

**「一个操作，两个调用者」**：界面上点「抓 JD」和 agent 调 `interview_prepare`，
走的是 `service.js` 里**同一个方法、同一套错误语义**。
新增能力优先落在 `service.js` 的方法上，**不要一上来就加新的 host 模块**——
模块一多，这个边界就模糊了。

**13 个 agent 工具**：

```
interview_prepare        interview_save_checklist    interview_mutate_checklist
interview_record_turn   interview_get_context        interview_finish
interview_list_sessions  interview_list_profiles       interview_save_profile
interview_apply_profile  interview_sync_profile       interview_asr_status
```

**两个随包技能**（名字不对任何 agent 可达就等于没打包）：
`interview-prep`、`interview-conduct`。

---

## 4. 本地跑起来（Windows 优先）

### 4.1 装依赖

```bash
npm install
```

Node ≥ 20。依赖只有 devDependencies：`acorn`（key 闸门用）、`react` / `react-dom` /
`react-test-renderer`（冒烟与渲染探针用）。**运行时零依赖。**

### 4.2 装进 DSH

```bash
node scripts/pack.mjs
# → release/dsh-realtime-interview-0.1.0.tgz
```

然后在 DSH 里：

```
plugin_manager install_bundle  target: <绝对路径>/release/dsh-realtime-interview-0.1.0.tgz
```

> **装 tarball，不要装源码目录。** 装源码目录会在 profile 里留下指向仓库的软链，
> 仓库里的一次误改会**立刻**改变运行中的插件；打包工具还会往仓库里落
> `node_modules/` 之类的杂物。见 `AGENTS.md` §安装纪律。

### 4.3 Windows 上会踩的坑

| 坑 | 说明 |
|---|---|
| `new URL('..', import.meta.url).pathname` | Windows 上给出 `/D:/Code/...`，后面 `resolve()` 会拼成 `D:\D:\Code\...`——目录凭空多出一层盘符。**一律用 `fileURLToPath(new URL('..', import.meta.url))`**（`tests/service.test.js` 里有注释范例）。 |
| `spawn` / `spawnSync` | Windows 上要 `shell: true`（`scripts/pack.mjs` 已处理）。 |
| 路径分隔符 | 用 `node:path` 的 `join` / `resolve`，不要手拼 `/`。 |
| `build.mjs` 里的 `file:///` | 已做盘符处理，别改坏它。 |

---

## 5. ★ 视觉迭代循环（这是本仓库最该用起来的东西）

界面是手写的 `h(...)`（没有 JSX、没有构建），所以**读代码判断不了好不好看**——
必须看图。这个仓库自带一套预览环境：

```bash
npm install          # 首次
node dev/shoot.mjs   # 截全部预设 → dev/shots/*.png
node dev/shoot.mjs live report   # 只截指定预设
```

预设四张：

| 预设 | 看到什么 |
|---|---|
| `prepare` | 准备页（流程脊线 + 纸面预览 + 底稿收起） |
| `live` | 面试中（**假摄像头已接通**：Chromium 的绿球测试画面） |
| `live-media-denied` | 面试中（**权限被拒**：桩掉 `permissions.query` 与 `getUserMedia`） |
| `report` | 报告页（评估表 + 卷内统计） |

**这套预览是真渲染**：真 Chromium + 真 React 18 + 真 `client.js`，接口走
`dev/fixtures.js` 的桩数据。所以它能暴露真实的渲染错误——包括 React 的 key 警告。

**改界面的标准循环**：

1. 改 `client.js`；
2. `node dev/shoot.mjs`；
3. **看图**，逐张对照 §6 的设计约束；
4. 不满意就继续改，直到图对了；
5. `node scripts/fix-keys.mjs`（补 key）→ 跑 §7 的闸门。

`dev/` **不随 npm 发布**（不在 `package.json` 的 `files` 白名单里），但**随 git 提交**。
`dev/react*.js` 是从 `node_modules` 拷出来的 UMD（不入库，每次跑自动重拷），
`dev/shots/` 也不入库。

> 预览环境里 `navigator.mediaDevices` / `navigator.permissions` 是**只读访问器**，
> 直接赋值会**静默失败**——必须 `Object.defineProperty` 覆盖。`dev/preview.html` 里
> 有现成范例。

---

## 6. 设计语言：**面试卷宗**（视觉改动的护栏）

界面不是「一个后台面板」，是**一份案卷**：

| 元素 | 隐喻 | 界面语言 |
|---|---|---|
| 简历 / JD | 卷内材料 | 纸面预览（衬线），点「修改」才进编辑器 |
| 考点清单 | **面试官的底稿** | 默认收起，可点开 |
| 转录 | 速记 | 右栏常驻滚动区 |
| 报告 | 评估表 | 阅读型版式，衬线标题 |

**四条不许回退的纪律**：

1. **底稿默认收起。** 准备阶段可查可改；面试中**完全不可见**（只留计数）。
   真实候选人不看得到考题——摊开清单，它就从面试变成答题游戏。
2. **提问压在画面上。** 当前问题做成视频**下缘的下三分之一字幕条**
   （衬线 + 琥珀竖线），不是旁边一个输入框。它和你的脸在同一块画面上。
3. **舞台永远主位。** 面试中视频区吃满左半屏；**没有摄像头时也保持同样大的
   画面框**，换成有设计的「未接通」状态（暗场渐变 + 姓名 monogram + 仍在跳的
   电平表 / REC / 计时），**不塌成黑框**。
4. **准备页的归档正文要看得见。** 一个只写「已归档 4820 字」的空卡片，
   等于让人不知道存了些什么。

**视觉参数**（改之前先读 `client.js` 顶部的 `F` / `C` / `S`）：

- **配色**：深墨底（`#0E1116`）+ 骨白纸感（`#E9E5DB`）+ 单一氧化朱红
  （`#E0563F`，**只用于 REC 灯**）+ 琥珀（`#D9A441`，提问）+ 青玉
  （`#4FA98C`，就绪/完成）。主按钮用**骨白反色**而不是蓝——蓝按钮会让它
  退回通用后台的样子。
- **字体三档**：衬线（提问与报告标题 = 「人说的话」）/ 无衬线（界面）/
  等宽（计时、电平、路径、字数）。中文字体栈要覆盖
  `PingFang SC` / `Microsoft YaHei` / `Songti SC`。
- **结构编码真实信息**：01/02/03 是真的步骤序号；转录里琥珀=提问方、
  青玉=回答方，颜色承担语义而不是装饰。

---

## 7. 闸门（**没跑过的代码不算写完**）

```bash
node scripts/fix-keys.mjs          # 补 React key（会改 client.js）
node scripts/fix-keys.mjs --check  # 只查不改
node scripts/client-smoke.mjs      # 真 React + SSR 渲染 client.js
node scripts/render-probe.mjs --check   # 三页签渲染 + 性能 + React 告警
node scripts/perf.mjs --check       # Host/HTTP 耗时与响应体积
node --test tests/*.test.js         # 26 项单测
node scripts/build.mjs              # 全量：语法 + 插件半边 + 宿主冒烟 + 上面几道闸门
node scripts/pack.mjs               # 打包 → release/*.tgz
```

**接手后最该先跑一遍**：

```bash
npm install && node scripts/build.mjs && node --test tests/*.test.js
```

### 闸门各自的职责

| 脚本 | 拦什么 |
|---|---|
| `fix-keys.mjs` | 数组 children 缺 key / 同一数组内 key 重复。**查重按数组作用域**（React 只要求同数组内唯一）。它还会报「数组里直接调用组件函数」这类**静态修不了**的情况并**非 0 退出**。**注意它会改写 `client.js`**，所以要单独跑，不要放进 build 流程。 |
| `client-smoke.mjs` | `client.js` 只在浏览器跑，`node --check` 查不出「变量名写错」「hook 用错」。这一步用真 React 渲染一遍。 |
| `render-probe.mjs` | 性能不变量（**空闲轮询引发的重渲染必须为 0**）+ **React 告警必须为 0**。注意它会**把每个页签都点一遍**——只测默认页签的话，其余视图的代码路径根本没跑过。它拦的是**全局** console（React 跑在 vm 之外，日志不走沙箱里那份）。 |
| `perf.mjs` | Host 方法耗时、HTTP 往返、响应体积（轮询响应 ~26 KiB）。阈值留了 3× 余量给 Windows。 |

`client-smoke` / `render-probe` / `perf` 三道**已经接进 `build.mjs`**，
`node scripts/build.mjs` 会一并跑（`fix-keys` 不接进去——它会改文件）。

---

## 8. 已经踩过的坑（别重蹈覆辙）

| 坑 | 结论 |
|---|---|
| **React key** | ① 查重必须按**数组作用域**，全局查重会把合法复用误报。② 数组里「先赋给变量再放进数组」的元素也要有 key（`const stage = h(...)` → `[stage]`）——静态脚本抓不到，靠 `render-probe` 的运行时告警兜底。③ 数组里**直接调用组件函数**（`statTile('提问', 3)`）也要有 key，且**没法自动修**——key 不能从 props 透传（React 会把它摘掉），要么 `h(Component, {key})`，要么改成数据驱动的 `.map()`。 |
| **ASR 两套协议不能混** | minimax：`POST {base}/v1/speech_to_text`，`language` 走 **HTTP 头**；openai 兼容：`POST {base}/audio/transcriptions`，`language` 走**表单字段**。baseUrl 常带 `/v1`，拼端点前要**先剥掉**。协议选错就是 404/400。 |
| **浏览器录的 webm 识别服务不收** | minimax 只收 wav/aiff/flac/m4a/mp3/aac/opus/ogg。客户端必须 `decodeAudioData` → 重采样 16 kHz 单声道 → 手写 16-bit PCM WAV。 |
| **凭据走 credentials seam** | `ctx.get('credentials').resolve('MINIMAX_API_KEY')` → `{value, source}`。配置文件里只存**环境变量名**，密钥不进配置。 |
| **裸调 `requestAnimationFrame`** | 部分宿主没有这个函数，直接抛 `ReferenceError` 把面板挂掉。要做存在性检查（`client.js` 里有 `requestFrame` / `cancelFrame` 包装）。 |
| **浏览器媒体权限** | `navigator.mediaDevices` / `navigator.permissions` 是只读访问器，测试里直接赋值**静默失败**，要 `Object.defineProperty`。 |
| **权限被拒不是错误状态** | 是常事。契约：先 `permissions.query` 探状态 → `prompt` 就调 `getUserMedia` 弹系统申请 → `denied` 就明说去哪儿放行 + 给「重新检测授权状态」按钮 → 监听 `permissions.onchange`，用户放行后**自动重连**。四种原因分开说（被拒 / 没设备 / 被占用 / 页面不安全）。 |
| **Windows 盘符** | `new URL(...).pathname` → `/D:/...`，必须用 `fileURLToPath`。 |
| **`fetch` base 路径** | 面板用相对路径 `/interviewer/api/...`，别写绝对路径。 |
| **`locales` 注册** | `ctx.locale.register(ns, dict)` 可能抛（没有 locale 服务），要 try/catch 兜住，不该让面板起不来。 |

---

## 9. ⚠️ 交接时**未完成 / 未验证**的部分

**这一节请务必读完，不要当成已经能用。**

| 项 | 状态 | 说明 |
|---|---|---|
| **真实 DSH 端到端** | ❌ **未验证** | 此前所有界面验证都在沙箱的 `dev/` 预览环境里完成（真 Chromium + 真 React + 桩数据）。**从没在真实 DSH/Electron 宿主里跑过。** 这是接手后第一件该做的事（见 §10）。 |
| **权限弹窗的真实行为** | ❌ **未验证** | 「被拒后自动接上」依赖浏览器标准 `permissions.onchange`。宿主是否装了自己的 permission handler **没查到**（`@deepseek-ai/dsh-remote` 不存在，`dsh-web-app` 里也没搜到 permission handler）。在 Electron 下必须实测一次。 |
| **摄像头/麦克风** | ❌ 未验证 | 沙箱里没有真设备。 |
| **真实 ASR** | ❌ 未验证 | 沙箱里没有可用的 ASR key。minimax / openai 兼容两条路都只有单测覆盖。 |
| **npm 发布** | ❌ 未做 | `package.json` 已去掉 `private`、`publishConfig.access=public`、包名 `dsh-realtime-interview` 已确认未被占用。**发布需要账号**：`npm login` 或提供 npm token，然后 `npm publish`。发布前跑 `node scripts/build.mjs` + `node --test`。 |
| **DSH 插件市场** | ❌ 未做 | 有 `JB_MARKETPLACE_TOKEN` 环境变量可用，但没做过上架流程。 |

**已知的产品限制**（不是 bug，是设计取舍）：
Web Speech API 在不少网络环境里不可达（插件会明说并保留键盘输入）；PDF 解析尽力而为，
扫描件读不出文字（会要求粘贴）；JD 抓取不做反爬（登录墙 / 验证码 / 前端渲染站点抓不到，
走手动兜底）。

---

## 10. 接手后建议的动作顺序

1. **跑通闸门**（§7）——确认环境正常：
   ```bash
   npm install && node scripts/build.mjs && node --test tests/*.test.js && node dev/shoot.mjs
   ```
   然后**打开 `dev/shots/` 的四张图**，和 §6 的设计约束对一遍。

2. **装进真实 DSH 跑一遍端到端**（沙箱做不了的那部分）：
   ```bash
   node scripts/pack.mjs
   # plugin_manager install_bundle target: <绝对路径>/release/dsh-realtime-interview-0.1.0.tgz
   ```
   按 `README.md` §用法 走一遍：新建面试 → 归档简历/JD → 让 agent 用
   `interview-prep` 出底稿 → 进「面试中」→ 提问 → 回答 → 报告页出分析。
   **重点验证三件事**：
   - 摄像头授权弹窗在 Electron 里到底怎么走（被拒后「重新检测授权状态」能不能救回来）；
   - 权限在系统设置里放行后，面板**是否自动接上**（`permissions.onchange` 那条路）；
   - 面板嵌在 DSH 主应用里**卡不卡**（`render-probe` 的 0 次重渲染不变量在真实宿主里是否还成立）。

3. **只在真的需要时改代码**。先确认问题在客户端还是服务端：
   - 界面 → `client.js`；
   - 状态/存盘/工具 → `src/host/service.js`；
   - 协议/字段 → `docs/API.md` + `docs/DETAIL.md`。

4. **改完跑闸门 + 看图**（§5 的循环），再提交。

---

## 11. 提交约定

- 分支：`main` 是主分支，直接推（个人仓库）。
- 提交信息用中文写清**为什么**，不只写改了什么。
- **没跑过 `node scripts/build.mjs` 的代码不算写完**（`AGENTS.md` §9）。
- 改界面时，**记得更新 `dev/shots/` 之外的截图引用**——截图不入库，
  交接文档里的图是说明用途，不是断言「当前就是这个像素级效果」。

---

## 12. 联系方式与上下文

- 上一个开发会话（云端沙箱）的完整上下文不在仓库里；上面这份文档 + `AGENTS.md`
  + `README.md` + `docs/` 覆盖了接手所需的全部约定。
- 设计方向、隐喻与取舍的理由在 `docs/DETAIL.md` §9.1。
- 有疑问**先读 `AGENTS.md`**——它就是为「让接手的人不必问人」而写的。
