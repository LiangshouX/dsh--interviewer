# dsh-realtime-interview（模拟面试间）

把「一场真实的技术面试」搬进 DSH：**准备材料 → 出面试官底稿 → 实时面试 → 事后评估**。
数据全在本机；不写死在某个模型或某个厂商上。

> 跑起来的东西是 `release/` 里的 tarball，不是仓库目录。安装纪律见 [AGENTS.md](AGENTS.md)。

---

## 一分钟上手

```bash
node scripts/build.mjs     # 构建 + 全部闸门（语法 / SSR / 性能 / 布局）
node scripts/pack.mjs      # → release/dsh-realtime-interview-<version>.tgz
# 然后用 plugin_manager 的 remove_bundle → install_bundle 指向那个 tgz
```

刷新 DSH 页面，侧栏点「模拟面试间」。

- **一场面试 = 一个卷宗目录**：默认 `D:\DSH-REALTIME-INTERVIEW\workspaces\<id>\`
  （非系统盘优先；可在面板顶部「浏览…」换根，换根是**复制**不是移动）。
- **面试工作区会登记进 DSH 左侧项目列表**：助手派活默认落在同一个目录，
  不会把请求发到别的项目去。
- 数据根、申请来源、当前语音链路由面板「设置」页如实显示。

---

## 四个阶段

### 1. 准备（归档材料）

- 简历 / JD：粘贴、上传（txt/md/docx/pdf），或贴 JD 链接让插件先直连抓取。
- **卡片是总览，点开看全貌**：简历与 JD 支持放大预览（也能从预览里直接进编辑）。
- 简历库：存一次、多场复用；选进某一场时会在卷内留快照。
- 列表里的场次可以**归档**（收起来）、**删除**（两步确认，删目录）、
  **清理空场次**（只删没有任何内容的）；误触新建可在通知条上「撤销新建」。

### 2. 底稿（面试官底稿）

- 材料归档后点「让助手出底稿」，派活到**面试工作区的助手会话**；
  助手用 `interview_get_context` 读材料、用 `interview_save_checklist` 写回。
- 清单是**活文档**：默认收起、面试中不可见；过长时在限高容器里滚动。
- 清单生成后可一键「进入面试中」，不满意可以「重新生成」（二次确认，覆盖现有清单）。

### 3. 面试中

- **摄像头两条采集通道**：ffmpeg（DirectShow）优先，失败自动回落 Chromium
  （Media Foundation）。「申请摄像头与麦克风」一条按钮走完整条链路：
  浏览器麦克风 → 宿主摄像头，并逐步显示「✓ 麦克风已接入 · 摄像头正在尝试宿主采集…」。
- 语音：宿主 `speechToText`（SenseVoice 本地模型）→ 插件 HTTP 端点 → 浏览器识别 → 键盘；
  播报：宿主 TTS（暂无）→ 配好的模型（MiMo/OpenAI/MiniMax）→ 免密钥自然音 → 浏览器音色。
  面板永远显示**现在用的是哪条链路、为什么**。
- 语流观察（停顿、语速、填充词、重复、自我修正）由 Host 统一计算；
  只用于调整追问方式与报告「表达」一节，**不打分**。
- 录像/录音可关（设置页隐私开关）；录像由 Host 直接写进卷宗目录。

### 4. 报告

- 面试结束后，在「面试中」或「报告」页点「生成事后报告」让助手写；
  报告由模型写、插件落盘，产出后自动显示。
- **时长 < 3 分钟**视为试玩：不催生成报告，按钮会说明「太短，先不生成」。

---

## 设置页（在面试间里，不在 DSH 设置）

| 组 | 可改什么 |
|---|---|
| 语音识别 | 来源（auto/host/browser/minimax/openai/none）、端点、Base URL、模型、凭据变量名、语言 |
| 语音播报 | 来源（auto/host/mimo/openai/minimax/baidu/edge/browser/none）、模型、音色、Base URL、凭据变量名、格式、语速、风格 |
| 摄像头 | 采集后端（auto / 仅 ffmpeg / Chromium 优先）、ffmpeg 路径、Chrome/Edge 路径 |
| 隐私 | 允许录像、允许录音 |
| 面试间保护 | 离开确认总开关、恢复「以后不再提醒」 |
| 环境（只读） | 数据根与理由、面试/档案目录、设置文件、宿主工作区、DSH 工作区登记状态、宿主模型目录与体积、空场次清理 |

写入是**白名单 + 规格校验**：枚举/范围/类型不对会被拒绝并说明原因；
配置文件里显式写过的键优先于面板设置，同样会说明。密钥只存**变量名**，
经 DSH 的 `credentials` seam 解析，不落配置文件。

---

## 面试间保护

设备开着时：

- 面板内切页签 / 切面试 / 新建面试 → 先确认；面试进行中 → 二次确认；
- **从侧栏切到会话 / 自媒体工作台 / Skill-MCP 等** → 拦截点击、先确认，
  确认后释放设备并把这次点击重放回去；
- 关页签 / 刷新 → 浏览器原生确认；
- 面板被宿主卸载 → 兜底释放所有设备轨与 Host 摄像头。

---

## 数据与隐私

- 简历、JD、转录、录像、报告**全部留在本机**，插件不上传。
- 唯一的对外请求：用户自己提供的 JD 链接，或用户配置的语音服务端点。
- 录像是可选项；关掉后录制入口不出现。

---

## 开发

```bash
node scripts/build.mjs             # 构建 + 校验 + SSR + 性能 + 布局
node --test tests/*.test.js        # 单测（约 100+）
node scripts/render-probe.mjs --check
node scripts/layout-check.mjs --check
node dev/shoot.mjs                 # 截图到 dev/shots/
```

- `src/client/` 是浏览器半边源码，`client.js` 是 `scripts/build-client.mjs` 拼出来的生成物，**不许手改**。
- 视觉参考 `dsh-media-desk`：中性素雅、单一 accent、环境光与动效；主按钮用高对比中性色。
- 文档：[AGENTS.md](AGENTS.md)（开发纪律）、[docs/PRD.md](docs/PRD.md)（产品）、
  [docs/API.md](docs/API.md)（接口）、[docs/DETAIL.md](docs/DETAIL.md)（实现细节）。

## 已知边界

- 摄像头画面只能由 Host 采：DSH 桌面端渲染进程的权限处理只放行纯音频。
- 侧栏离开拦截依赖 DSH 侧栏以 click 触发导航（实测如此）；非 click 的程序化跳转拦不住，
  但卸载时一定会释放设备。
- 语音识别不支持流式：宿主的 `speechToText` 只有整段转写，准实时靠客户端分段。
