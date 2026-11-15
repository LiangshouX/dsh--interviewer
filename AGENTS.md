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

## 3. 单一真源

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

## 4. 硬边界（违反就是设计错误）

| 边界 | 原因 |
|---|---|
| 插件**不写面试题** | 题目是模型（宿主侧）生成的；插件只管结构与留痕 |
| 插件**不写分析报告** | 同上。报告由模型写，插件负责落盘 |
| 插件**不外传简历与 JD** | 抓取只针对用户自己给的链接，落盘只在本机 |
| 插件**不发起付费生成** | 语音能力优先用浏览器原生 API |
| 插件**不缓存业务状态** | 见 §3 |
| 插件**不自己实现业务规则** | 阈值、话术、评分口径都不在插件里硬编码 |

---

## 5. 一个操作，两个调用者

界面上点一下「抓取 JD」和 agent 调 `interview_prepare`，必须走**同一个 service 方法**、
**同一套错误语义**。否则人和 agent 对「这份 JD 到底存进去没有」的理解会分叉，
插件就成了新的信息分裂源。

**新增任何操作时，先在 `src/host/service.js` 落一个方法，再分别挂到 API 和 tool 上。**
不要在 api.js 里直接写业务逻辑，也不要在 tools.js 里重新实现一遍。

---

## 6. 失败必须给出路

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

### 6.4 摄像头权限被拒

摄像头是氛围，不是刚需。拒绝权限就降级成没有画面，面试照常。

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

## 7. 目录约定

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

## 8. 提交前自检

```bash
node scripts/build.mjs     # 语法 + 插件半边 + 运行时冒烟测试
```

`build.mjs` 会拦住的：frontmatter 不合法、引用了不存在的包内路径、
manifest 字段缺失、`client.js` 没走 `window.__ModuleLoader__.load`、
任何 JS 语法错误、Host 半边跑不起来。

**没跑过 `build.mjs` 的代码不算写完。**

---

## 9. 客户端纪律

`client.js` 是单文件、无构建的浏览器 bundle。三条规矩：

1. **React 从模块表取**：`require('react')`，不要引 CDN、不要打包。
2. **不自己画聊天**。提问与回答的主流程在 DSH 对话区；面板是**现场控制台**
   （画面、录音、识别、当前问题、转录、报告），不要在面板里造一个聊天框
   去和助手重复对话。
3. **不要让面板成为唯一入口**。每个功能都要有键盘/文本兜底。

---

## 10. 渲染层的几条教训

来自同类插件的实测，写在这里免得重犯：

- **纵向 flex 容器里的子项会被压扁** → 给子项显式 `flex: '0 0 auto'` 或 `minHeight`。
- **祖先 `overflow: hidden` + 自身带 `filter` 的 `<img>` = 空白图片**。
- **渐变背景 + `backdrop-filter` 同一元素 = 内容不画**。
- **中文标题在窄列里会被压成一个字一行** → 横向 flex 的子项加 `minWidth: 0`，
  或给标题容器 `white-space: nowrap`。

---

## 11. 数据与隐私

- 简历、JD、转录、录像**全部留在本机**（默认 `~/DSH-INTERVIEWER/`）。
- 插件**不上传**任何东西。唯一的对外请求是用户自己给的 JD 链接。
- 录像是**可选**功能，默认可关；它制造氛围，不承担举证责任。
- 不要在代码或日志里打印简历/JD 的正文片段（`api.js` 的错误信息尤其注意）。
