# TURN-TAKING — 话轮驱动、自动/手动模式与暂停/继续

> 施工依据文档。产品纪律以 `AGENTS.md` 为准；界面契约以 `DESIGN.md` 为准；
> 本文只写**面试进行时的驱动链路**：谁唤醒助手、话轮怎么交接、模式怎么切换、
> 暂停/继续怎么把「人、设备、助手会话、卷宗资产」四样都接回来。
>
> 状态：**已施工（0.5.0）**。P0 + P1 全部落地；施工记录与对设计的偏离见 §11。
> 所有引用的宿主语义均已从装机包源码读实（见 §9 事实清单）。

**目录**：§0 一句话 · §1 这一层解决什么 · §2 目标与非目标 · §3 话轮状态机 · §4 自动/手动开关 ·
§5 唤醒派活 · §6 暂停与继续 · §7 变更清单 · §8 分期与验收 · §9 宿主事实清单 ·
§10 开放问题 · §11 施工记录

---

## 0. 一句话

**面试的主循环必须由事件驱动，不由用户手动驱动。**
「开始面试」「候选人答完」「暂停」「继续」都是事件；每个事件要么唤醒助手
（`sessionController.prompt`），要么改变采集状态——但**任何时候手动路径都还在**，
自动只是叠加，不是替代（AGENTS.md §7）。

---

## 1. 这一层解决什么

面试的主循环不是「用户点一下、插件记一笔」，而是一串事件：开始、答完、暂停、继续。
本文定的是这串事件怎么交接——**谁唤醒助手、话轮在什么时候算结束、手动与自动两条路
如何共存、暂停与继续怎么把设备、计时、助手会话、卷宗资产四样都接回来**。

施工前查证出的三个问题，定下了这一层的范围：

1. **面板 → 助手没有链路。** 「开始面试」与「发送」都只改本地状态，助手不知道发生了什么。
2. **话轮结束没有判定。** VAD 的 450ms 静音是*转写分段*阈值，人喘口气就切，
   不能当*话轮结束*用；只能靠用户手动点发送。
3. **助手会话是全局的。** 多场面试共用一个会话会串场；暂停/继续要精确找回
   *这一场*的会话，一个全局键撑不住这个语义。

---

## 2. 目标与非目标

**目标**

- G1 点「开始面试」后助手自动开场，无需用户去对话区做任何事。
- G2 候选人语音答完后，系统判定话轮结束、自动提交、自动唤醒助手出下一题。
- G3 自动/手动是一个**用户拥有的开关**：练习期可以纯手动；自动链路出 bug 时
  手动模式必须完整可用（兜底不是降级品，是平行主线）。
- G4 暂停/继续：中途有事一键暂停（设备灭灯、计时停走），回来一键继续
  （助手带着完整上下文接着问），DSH 重启/页面刷新后同样能续。
- G5 所有失败都有出路：派活失败可见、可重发；自动判定失败退回手动并说明。

**非目标**

- 不做 barge-in（候选人抢话打断 TTS）——回声消除没把握，列 P2 之后。
- 不做真正的流式 ASR/TTS——宿主与供应商协议都没有（AGENTS.md §6.5 纪律 3）。
- 不在面板里造聊天框（§10.1 纪律 2）——助手的主场仍是 DSH 对话区，面板是现场控制台。
- 插件不写面试题、不写话术（§5 硬边界）——「思考中」「请继续」这类**系统级**
  prompt 是调度指令，不是话术；面试官说的每一句话仍由模型生成。

---

## 3. 话轮状态机（核心）

「面试中」从一堆独立开关变成一个显式状态机。**唯一真源在客户端**（它拥有麦克风、
VAD、TTS 的实时状态），Host 只持久化粗粒度会话状态（§6.1），不镜像细粒度话轮状态
——避免两处真源（AGENTS.md §4 推论）。

```
                 ┌──────────────────────────────────────────┐
                 │                                          ▼
  idle ──start──▶ questioning ──TTS完──▶ listening ──判定答完──▶ submitting
                 ▲    (播报提问)          (VAD采集+分段转写)      │
                 │                                              │ 落盘+派活
                 │        thinking ◀────────────────────────────┘
                 │        (助手生成中，舞台显示状态)
                 └────────── 新 interviewer turn 到达（轮询发现）
```

| 状态 | 麦克风 | VAD 判定 | TTS | 舞台主文案 |
|---|---|---|---|---|
| `questioning` | 开 | **挂起**（半双工门控） | 播 | 下三分之一字幕条（现有） |
| `listening` | 开 | 活跃 | 停 | 「请作答」+ 电平表 |
| `submitting` | 开 | 活跃（补充进下一轮草稿） | 停 | 倒计时条 / 「已提交」 |
| `thinking` | 开 | 活跃（同上） | 停 | 「面试官正在思考」（呼吸灯） |
| `paused` | **关**（释放） | 停 | 停 | 暂停板 + 「继续面试」大按钮 |

三条硬规则：

1. **半双工门控**：`questioning` 期间 VAD 分段照跑（字幕/语流不丢），但**话轮结束
   判定挂起**——扬声器回声会被 RMS 阈值误判为说话，外放场景必炸。TTS `onend` /
   回落播放结束 → 切 `listening`，判定才武装。
2. **一次回答只派活一次**：`submitting → thinking` 之后，直到新的 interviewer turn
   到达前，用户再说的话**进草稿不自动提交**（避免助手读到的转录和派活内容错位）。
   手动发送仍然可用——它走 `mode:'queue'`，宿主会排队合并，助手自己看得到。
3. **状态机坏了不塌面试**：任何状态迁移异常 → 回退 `listening` + 手动可用 +
   notify 说明。面板永远保留「手动发送」与「结束面试」两个物理出口。

### 3.1 话轮结束判定（双层静音）

- 第一层（已有）：450ms 静音切段转写——**不动**，字幕准实时与语流测量靠它。
- 第二层（新增）：连续 `turnEndSilenceMs`（默认 2000，可配 800–6000）无语音
  **且** `asr.pending === 0`（所有段都转写完，不丢尾句）→ 判定答完。
- 判定和语流测量**共用同一条 VAD 帧时间线**（`state.lastEndAt` 已经在算段间空档），
  提交时 `answerSegmentsRef` 原样带上——§6.10 的语流数据一点不少。

### 3.2 反悔窗口（自动提交 ≠ 静默发送）

判定答完后不立即提交，进入 `submitting` 倒计时（固定 2s，不做配置——配置项越少
越不像仪表盘）：

- 倒计时内**重新开口** → 取消，回 `listening`，草稿继续追加（「说完又补一句」
  是最像真人的细节，必须支持）；
- 倒计时内**点草稿/打字** → 视为要修改，本会话内切手动（用户意图优先）；
- 倒计时走完 → 调**现有** `submitAnswer` 同一条路（同一个 service 方法，§6 纪律）。

UI：草稿区上沿一条窄倒计时进度条 + 「已自动提交，撤销」四秒浮层（撤销 = 从
transcript 标记作废并重新入草稿，P1 可先只做「重新发送修正版」的弱化形态）。

### 3.3 长沉默 ≠ 答完

`listening` 持续超过 `longSilenceMs`（默认 20s）且草稿为空：

- **自动模式**：派活一条系统级 prompt「候选人已沉默约 N 秒」→ 助手按
  interview-conduct 技能既有策略换小切口重问。这不违反「插件不写话术」——
  插件只报告事实，说什么由模型决定。
- **手动模式**：只显示提示，不派活。

### 3.4 把等待演出来

`thinking` 期间（LLM + 工具往返 + TTS 首句，实测预期 5–10s）：

- 舞台显示「面试官正在思考」+ 呼吸灯（现有设计语言，DESIGN.md 的 6s 呼吸灯 token）；
- 逐句 TTS 流水已就位（§6.11）：第一句合成完就开口；
- 技能层引导短承接句开场（「嗯，明白了。那我想追问一下——」）：**由模型生成**，
  在 interview-conduct SKILL.md 的派活 prompt 模板里加一句「回答后先用一句话自然
  承接，再提出下一问」。短首句同时天然压缩首响感知延迟。

有状态提示的沉默是自然的，无提示的沉默是死机。

---

## 4. 自动 / 手动开关（用户拥有）

### 4.1 动机（用户原话整理）

1. 练习初期想手动控制节奏，先适应；
2. 自动链路若有 bug 且无兜底，会把整个插件拖死——**手动必须是完整平行主线**，
   不是「自动坏了之后的残次品」。

### 4.2 设置项（SETTING_SPECS 白名单新增）

| key | kind | 值域 / 默认 | 说明 |
|---|---|---|---|
| `answerMode` | enum | `'manual'` \| `'auto'`，默认 **`manual`** | 话轮结束判定与自动提交总开关 |
| `turnEndSilenceMs` | number | 800–6000，默认 2000 | 第二层静音阈值（仅 auto 生效） |

**默认值决策**：首发默认 `manual`。理由：(a) 与现行为一致，升级不改变任何用户
已适应的节奏；(b) auto 的判定质量依赖 VAD 阈值在真实房间声学下的表现，未经验证
前不默认开；(c) auto 稳定一个版本后可以把默认翻成 `auto`——这是一行改动，
把这个决定留给有实测数据的时候。**开关只控制「判定+自动提交」，不控制派活**：
manual 模式下手动点发送同样唤醒助手（P0 与开关无关，永远生效）。

### 4.3 入口

- **Live 页快捷切换**：麦克风按钮旁一个两态 segmented control（自动 / 手动）。
  「我现在就想切」是面试进行中的即时需求，不该去设置页翻三层。
- **设置页**：正式条目 + 一句来源式说明（§10.0.1 文案纪律：一句话，不写说明书）。
- 切换即时生效、写入 settings（下次面试保持）。

### 4.4 自动降级（失败给出路）

| 异常 | 行为 |
|---|---|
| 自动提交 `POST .../turn` 失败 | notify + 草稿保留 + 本会话降 manual（不写 settings） |
| 派活失败（prompt 抛错） | 回答已落盘不回滚；transcript 记 system 行「派活失败：原因」；面板轮询到后显示「重新发给助手」按钮 |
| VAD/麦克风不可用 | auto 不可用，面板显示原因，键盘 + 手动发送照常（§6.3 纪律：麦克风坏了不能开不了口） |
| ASR 全链路失败 | 同上——判定依赖转写完成，转写断了判定就不武装 |

降级只影响**本会话**，不偷偷改用户设置；恢复自动要用户显式再点（静默换链路
是 §6.5 明令禁止的行为模式，同理适用于此）。

---

## 5. 唤醒派活（P0，一切的前提）

### 5.1 三个新派活点

全部复用现有 `controller.prompt` 通道与 `ensureAgentSession` 骨架：

| 方法 | 触发 | prompt 要点 |
|---|---|---|
| `requestAgentStart(sessionId)` | `start` 成功后（api.js `case 'start'` 内联动） | 「面试已开始。读 interview_get_context，按 interview-conduct 阶段 0 开场；开场白与第一问各记一条 interview_record_turn(role:interviewer)」 |
| `requestAgentContinue(sessionId, turn)` | `appendTurn(role:candidate)` 且 `status===running` | 「候选人刚回答：『{text}』（已入转录）。读 context 对齐清单，决定追问/下一题；先一句自然承接再提问，记录 interviewer turn。**回答原文直接内联**，省一次 context 往返」 |
| `requestAgentResume(sessionId, pausedMinutes)` | `resume` 成功后 | 「面试在暂停 N 分钟后继续。先 interview_get_context 重新对齐，再依据转录续接：上一问未答完就复述/换说法，已答完就自然过渡到下一轮」 |

细节纪律：

- **prompt 内容带回答原文**（continue）：助手不用先跑一趟 `interview_get_context`
  才知道候选人说了什么——省一个工具往返 ≈ 省 2–5s 首响。context 对齐仍然要做
  （技能纪律），但那是为了清单/语流，不是为了「听见回答」。
- **`mode: 'queue'`**：助手忙时进宿主 inbox 排队，不打断当前 turn。分段回答连发
  时天然合并。
- **`requestId` 幂等**：`start-${sessionId}` / `continue-${sessionId}-${row.ts}` /
  `resume-${sessionId}-${pausedAt}`。宿主按 requestId 去重（README：已入队的
  requestId 重试直接返回原接受结果）——客户端重试、轮询竞态都不会重复派活。
- **派活不阻塞 HTTP 响应**：`appendTurn` 先返回（面板立刻「回答已记录」），
  prompt 异步发出；失败走 §4.4 的 system 行 + 重发按钮。
- **长沉默派活**（§3.3）：`silence-${sessionId}-${ts}`，同通道。

### 5.2 修 `ensureAgentSession`：prompt 直达，create 只用一次

宿主事实（README.zh.md，装机包读实）：

> 「queue 变更、模型、重命名、**prompt** 和文件引用操作可以**解析或恢复**普通
> Session」；「请求指明的 sessionId 在满足以下条件时被复用：**仍为空白**（尚未
> 开始任何轮次）……指明的 Session 若已开始……改为新建 Session。」

所以正确姿势：

```
ensureAgentSession(interviewSessionId):
  1. 读该面试的 agentSessionId（§6.2，存 session.json）
  2. 有 → 直接返回（prompt 时宿主自会恢复冷会话，历史在持久日志里）
  3. 没有 → create({workspaceId}) 一次，把返回的 id 写进 session.json
```

- **不再**把已存在的 id 塞给 create——那会踩「非空白 → 另建新会话」的语义。
- prompt 失败若返回 `session/not-found`（会话被删）→ 清掉存的 id，走 create 重建，
  并在 system 行记「助手会话已重建，上下文从卷宗恢复」（卷宗是唯一真源，
  助手会话只是工作记忆——这正是 §4 单一真源架构给的底气）。
- `session/writer-held` / ArchivedSessionGate（归档会话拒跑 model step）→ notify
  说明「助手会话被占用/已归档，请在 DSH 里恢复」+ 重发按钮。

---

## 6. 暂停 / 继续（G4）

### 6.1 会话状态机扩展

```
SESSION_STATUS: draft → ready → running ⇄ paused → done
```

- `pause` 仅接受 `running`；`resume` 仅接受 `paused`；`finish` 接受 `running|paused`
  （暂停中也能直接结束）。非法迁移返回明确错误（同现有 updateSession 风格）。
- **api.js 新路由**：`sessions/{id}/pause`、`sessions/{id}/resume`
  → `service.pauseSession(id)` / `service.resumeSession(id)`（先落 service 方法，
  再挂 API 与 tool——§6 纪律）。
- **工具面**：`interview_pause` / `interview_resume`（助手也能执行暂停，比如用户
  在对话区说「先停一下」）。

### 6.2 session.json 新字段（updateSession allowed 列表同步扩）

| 字段 | 类型 | 语义 |
|---|---|---|
| `pausedAt` | number | 最近一次暂停时刻；resume 时清空 |
| `pausedMs` | number | 累计暂停时长（跨多次暂停累加） |
| `agentSessionId` | string | **这一场**面试专属的宿主助手会话（从全局 settings 迁来） |

**计时公式修正**（getState.stats）：

```js
durationMs = (endedAt ?? updatedAt ?? 0) - (startedAt ?? createdAt ?? 0) - (pausedMs ?? 0)
```

不修就会把「暂停两小时」算进面试时长，报告与 `tooShortForReport`(<3min) 判断全歪。

**agentSessionId 不做任何迁移**：session 里没有这个字段（老场次）或为空串
（新建场次）时，第一次派活就 create 一个自己的会话。全局 `settings.agentSessionId`
只是「最近一次 create 用过的会话」的诊断面包屑（`interview_agent_session` 工具
能查），**不参与派活寻址**——继承它等于让新岗位的 JD 请求落进另一场面试的对话里
（AGENTS §6.14 的「会话乱飞」）。

### 6.3 暂停动作清单

Host `pauseSession(id)`：

1. 校验 `status === 'running'`；
2. `status='paused'`、`pausedAt=now`；
3. transcript 追加 system 行：`面试暂停`（报告时间线自然可见，语流统计不受影响
   ——system 行本就被 `turns` 过滤排除）；
4. **不 cancel 进行中的助手 turn**：它多半正在生成下一问，生成完落盘无害——
   恢复时那一问就在转录里等着。cancel 反而制造「半截问题」。（P2 可加配置。）
5. 返回新 meta。

客户端（收到 paused 状态或本地点暂停）：

1. `releaseAllMedia()` + `camera/stop`——**指示灯必须灭**。用户人走了，摄像头
   麦克风还开着，比功能坏了更严重（§10.3 的存在理由）；
2. 停 TTS、停 VAD 判定、停自动提交倒计时；
3. 高频轮询（1.5s）降为低频（`usePoll(null)` 暂停或 6s）——paused 是静止态，
   空闲轮询不许引发重渲染（§11 红线）；
4. 未提交的草稿**保留在组件 state**，暂停板上显示「有未提交的回答草稿」；
   页面刷新草稿会丢（浏览器 state 本就不持久）——暂停板文案给出路：
   「恢复后可重新口述或粘贴」。不做草稿持久化（过度设计，草稿是瞬态物）；
5. 舞台换成暂停板：计时冻结显示、REC 灭、大按钮「继续面试」+ 次按钮「结束面试」。

### 6.4 继续动作清单

Host `resumeSession(id)`：

1. 校验 `status === 'paused'`；
2. `pausedMs += now - pausedAt`、清 `pausedAt`、`status='running'`；
3. system 行：`面试继续（本次暂停 X 分钟）`；
4. 异步派活 `requestAgentResume(id, pausedMinutes)`（§5.1）。

客户端：

1. 重新申请媒体（用户手势内发起，权限路径与 start 相同）；
2. 媒体就绪 → 状态机回 `thinking`（等助手恢复语境后的第一个问题）或 `listening`
   （若转录里已有一个暂停前落盘的未答问题）；
3. 轮询恢复 1.5s。

### 6.5 助手会话的记录与恢复（调研结论）

**结论：宿主的会话持久化把最难的一半免费送掉了。** 装机包读实的事实链：

1. Session 日志是 durable 的（`sessionPersistence`），Agent 实例是易失的；
   冷会话被 `prompt` 唤醒时**历史完整重建进模型上下文**——「上下文面试」不依赖
   Agent 进程活着，DSH 重启也不丢。
2. 因此恢复 = 向存好的 `agentSessionId` 发一条 resume prompt。没有「导出/导入
   会话」这种伪需求，也不需要插件自己重建对话历史。
3. 双保险：resume prompt 要求助手先 `interview_get_context` 重新对齐——即使助手
   会话丢了/换了（被删、被归档、writer-held 重建），**卷宗（transcript + checklist +
   简历/JD）才是唯一真源**，新助手会话照样能从卷宗无损续接。这是 §4 架构的红利：
   暂停/继续的可靠性上限由磁盘文件决定，不由宿主会话决定。

### 6.6 崩溃 / 重启韧性（与手动暂停同一条路）

页面刷新、DSH 重启、崩溃后的「非意图中断」与手动暂停走**同一条恢复路径**：

- `status` 在磁盘上还是 `running`，但面板没有活的采集流 → LiveView mount 时检测
  「running 且本地无流」= 中断态，显示恢复板：「这场面试还在进行——继续 / 结束」。
- 「继续」= 客户端 resume 流程（媒体 + 轮询），**不改 Host 状态、不派活**
  （助手会话没人动过，转录停在原地，用户接着答就行）；若转录最后一行是
  interviewer 提问 → 直接 `listening`。
- 若 DSH 整个重启过：助手会话冷了，第一次 continue 派活时 prompt 自动唤醒（§6.5）。
- `paused` 状态下面板重开 → 直接显示暂停板，走 §6.4。

**设计原则：resume 路径 = 恢复路径。** 不做两套。

---

## 7. 数据 / API / 工具变更清单

| 层 | 变更 |
|---|---|
| `paths.js` | SETTING_SPECS + `answerMode`(enum) + `turnEndSilenceMs`(number 800–6000) |
| `service.js` | `SESSION_STATUS.PAUSED`；`pauseSession` / `resumeSession`；`requestAgentStart` / `requestAgentContinue` / `requestAgentResume`；`ensureAgentSession(interviewSessionId)` 改造（§5.2）；`appendTurn` 联动 continue 派活；`getState` 的 durationMs 扣 pausedMs、session 投影 + pausedAt/pausedMs/agentSessionId；updateSession allowed 列表扩 |
| `api.js` | `sessions/{id}/pause`、`sessions/{id}/resume`；`case 'start'` 联动 requestAgentStart |
| `tools.js` | `interview_pause` / `interview_resume`；`interview_request_agent` 的 task 枚举 + `start` / `continue` / `resume`（诊断与手动兜底用） |
| `80-views.js` | 话轮状态机、倒计时条、thinking 状态、暂停板/恢复板、auto/manual 快捷切换、派活失败重发按钮 |
| `81-settings.js` | `answerMode` / `turnEndSilenceMs` 条目 |
| SKILL.md | interview-conduct：+「回答后先一句自然承接再提问」「沉默/暂停恢复的处理」两小节 |
| `tests/` | 状态迁移合法性矩阵、pausedMs/durationMs 计算、appendTurn→派活触发条件判定表、requestId 幂等 |

---

## 8. 分期与验收

| 期 | 内容 | 验收闸门 |
|---|---|---|
| **P0** | §5 全部（start/continue 派活 + ensureAgentSession 修复 + per-session agentSessionId）| 手动模式全流程可跑通：点开始→助手开场→答→发送→下一题；派活失败有重发按钮 |
| **P1** | §3 + §4（状态机、双层静音、反悔窗口、开关、降级）+ §6（暂停/继续） | auto 模式 3 轮无手动干预；暂停 10 分钟 + DSH 重启后继续，助手上下文对齐；`build.mjs` 全绿（perf + render-probe + SSR） |
| **P2** | 撤销提交、cancel 进行中 turn 的选项、barge-in 评估、auto 默认值翻转评估 | 单独评审 |

P0 不做，P1 的自动提交只是把「手动点完没反应」升级成「自动发完没反应」。

**全流程手测脚本（P1 验收）**：开始面试 → auto 模式答 3 轮（含一轮说完补一句）→
切 manual 答 1 轮 → 暂停 → 关 DSH → 重开 → 继续 → 答 1 轮 → 结束 → 出报告。
检查点：计时不含暂停；转录含 system 暂停/继续行；语流数据完整；助手会话始终是
同一个（对照 session.json 的 agentSessionId）；设备指示灯在暂停期间熄灭。

---

## 9. 调研事实清单（来源可溯）

**宿主 `@deepseek-ai/dsh-api-session-controller`**（装机包
`app.asar/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/`，
README.zh.md + src/index.ts + src/commands.ts 读实）：

1. `prompt` 先 `resolveAgent(sessionId)`——**prompt 可以解析或恢复普通 Session**
   （冷会话被唤醒，持久日志重建上下文）。
2. `create` 只复用**空白**会话；非空白的指定 id →「保持不变，改为新建 Session」。⚠
3. prompt 按 `requestId` 幂等去重：已入队/已入日志的 requestId 重试直接返回原接受结果。
4. `mode:'queue'` → `agent.followup(message)`，忙时进 inbox 排队；`mode:'steer'` →
   `agent.steer(message)` 插进当前 turn。本设计全用 queue。
5. `cancel` 存在：「取消活跃 Agent turn，不丢 pending inbox」。
6. `ArchivedSessionGate`：**归档会话拒跑任何 model step**（迟到唤醒以 blocked 收口）；
   取消归档即解除。→ 派活失败出路要覆盖这一种。
7. 恢复会话时写句柄被占 → `session/writer-held`。
8. 空 content 的 prompt 有窄用途（失败续跑），本设计不用。

**插件侧（施工前基线；行号会随语音改动漂移，以符号为准。9 与 10 已被 §6 改掉）**：

9. `SESSION_STATUS = {draft, ready, running, done}`——无 paused。
10. `getState.stats.durationMs = (endedAt ?? updatedAt) - (startedAt ?? createdAt)`
    ——纯墙钟差。
11. `usePoll(fn, intervalMs)`：`null` 暂停轮询（50-hooks.js 注释明示）。
12. `mediaInUse()` / `releaseAllMedia()` / beforeunload 守卫已存在（§10.3 体系）。
13. `appendTurn` 已接受 `role:'system'`；`getState` 的 turns 统计排除 system 行。
14. SETTING_SPECS 是白名单 + 规格校验（paths.js），新键必须在这里注册。
15. VAD 参数：450ms 切段 / 6s 上限 / 350ms 下限 / RMS 0.012（60-voice.js 常量区）。

**待实测复核（施工时）**：

- ⚠ 事实 2 的实际行为：向 create 传非空白 id 是否真的另建新会话（若是，§1-3 的
  漂移 bug 实锤，全局 agentSessionId 一直在变）。
- ⚠ 冷会话 prompt 唤醒的端到端延迟（影响 resume 体验文案要不要加「正在唤醒助手」）。
- ⚠ queue 模式下助手正跑长 turn 时新 prompt 的实际排队表现。

---

## 10. 开放问题

1. **自动提交的可撤销形态**：已定为「重新发送修正版」（弱撤销，见 §11-8）。
   强撤销（转录作废行）没做——它要给转录加「作废」语义，报告端也得跟着认。
2. **paused 状态下 finish 的报告口径**：暂停中直接结束，报告要不要标注「未完成」？
   倾向 transcript system 行已留痕即可，报告由模型自己看着写（插件不写业务规则）。
3. **多场面试并行**：per-session agentSessionId 之后，两场面试可以同时 running 吗？
   倾向允许（数据互不干扰），但面板同时只呈现一场——不在本期解决。

---

## 11. 施工记录（0.5.0，对设计的偏离与补充）

施工落点：`src/host/{service,api,tools,paths}.js`、`src/client/{60-voice,80-views,90-panel,81-settings}.js`、
`src/skills/interview-conduct/SKILL.md`、`tests/turn-taking.test.js`。P0 + P1 全部完成；
P2（强撤销、cancel 进行中 turn、barge-in、auto 默认值翻转）未做。

对正文的**偏离**（都是施工时发现的硬约束，语义不变）：

1. **resume 的 HTTP 路由叫 `sessions/<id>/unpause`**，不是 §6.1 写的 `resume`——
   `sessions/<id>/resume` 早就是「存简历正文」的老路由，语义撞车。
   service 方法仍叫 `resumeSession`，工具仍叫 `interview_resume`。
2. **start 的 requestId 是 `start-<id>-<startedAt>`**（§5.1 写的是 `start-<id>`）：
   宿主按 requestId 持久去重，纯 `start-<id>` 会让「结束后重开一场」永远派不出
   新开场。双击/重试的防重由 `startSession` 的 running-no-op 保证，不靠 requestId。
3. **恢复板只在挂载时判定一次**（挂载时 running 且无流 = 中断恢复）：
   本次挂载里用户自己点「开始面试」进入 running 的，仍显示常规申请板。
4. **agentSessionId 没有迁移**（session.json 里没有这个字段或为空串 → 建自己的）：
   新建场次从 `createSession` 起就带 `agentSessionId: ''`。若场次去继承全局
   面包屑，两场面试又会共用一个助手——§1-3 要消灭的串场会复活。
5. **`clearAgentSession` 置空串而不是删字段**：删字段会让会话重新变成「老场次」，
   把刚死掉的全局面包屑继承回来（重建测试抓到的真 bug）。
6. **continue 派活只认 `meta.source === 'panel'` 的 candidate 行**（§5.1 写的是
   「role:candidate 且 running」）：助手自己经 `interview_record_turn` 记的回答
   若也触发，等于自己给自己排队派活，可能自触发成环。面板提交（手动或自动）
   是唯一的「候选人答完了」事件源；开关只管判定、不管派活，语义不变。
7. **长沉默阈值 `longSilenceMs = 20000` 是客户端常量**，不进 SETTING_SPECS
   （§4.2 的白名单只有两项；配置项越少越不像仪表盘，§3.2 同理）。
8. **撤销做弱形态**（§10-1 的前者）：自动提交后 notify「已自动提交」并说明
   「接着说/打字再手动提交一次」= 重新发送修正版；不给转录加作废语义。

施工新增的测试：`tests/turn-taking.test.js`（状态迁移矩阵、计时扣暂停、
appendTurn 联动判定表、per-session 会话与迁移、session-not-found 重建、
失败留痕与重发、设置值域）+ `tests/api.test.js` 的话轮路由用例。
闸门全绿：`build.mjs`（perf / render-probe 空闲 0 重渲染 / React 警告 0 /
布局 8 宽度 × 4 页签）、`node --test tests/*.test.js`、`dev/check-flows.mjs`、
`dev/shoot.mjs` 看图（恢复板/暂停板/回答节奏组/思考眉标）。
