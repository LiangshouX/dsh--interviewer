/**
 * 预览用的假数据。
 *
 * 目的是**在浏览器里看到真实渲染**，不是测功能。所以数据要像真的：
 * 一场进行到一半的面试——简历已存、JD 已抓、清单有 14 项、问了 5 项、
 * 转录 30 轮、有一份还没写的报告。
 */
(function () {
  const now = Date.now()

  const checklist = Array.from({ length: 14 }, (_, index) => ({
    id: `c${index + 1}`,
    topic: [
      '订单系统的限流与降级设计',
      '分布式事务与最终一致性',
      'JVM 内存排查与调优实践',
      '慢查询优化与索引设计',
      '缓存击穿/穿透/雪崩的治理',
      '消息队列的选型与消费幂等',
      '服务注册发现与容错',
      '链路追踪与告警收敛',
      '大促场景下的容量规划',
      '分库分表与数据迁移方案',
      '分布式锁的正确性边界',
      '线上故障复盘与改进闭环',
      '技术选型的取舍与论证',
      '团队协作与技术方案评审',
    ][index],
    why: [
      'JD 要求「负责高并发稳定性」，简历项目 B 写日订单 800 万',
      'JD 要求「保证数据一致性」，项目里做过跨库改造',
      '简历写了 JVM 调优，想确认是真做过还是背的',
      'JD 要求「数据库性能优化」',
      '候选人简历里有 Redis 缓存，想确认深度',
      '项目里用 MQ 做解耦，JD 也提到异步化',
      '简历提了 Spring Cloud，JD 要求微服务治理',
      'JD 要求「完善可观测性体系」',
      '候选人经历过大促，JD 是电商方向',
      '数据量增长后的分库分表，候选人提到过',
      '简历项目里的分布式锁，想问清边界',
      'JD 要求「线上问题定位与复盘」',
      '简历有架构设计经历，JD 要求技术决策',
      'JD 要求跨团队协作，候选人做过方案评审',
    ][index],
    level: index % 3 === 0 ? 'core' : index % 3 === 1 ? 'deep' : 'bonus',
    source: index % 4 === 0 ? 'research' : index % 3 === 2 ? 'resume' : 'jd',
    tags: [],
    probed: index < 5,
    note: '',
    evidence: index < 5 ? [{ at: now - 600000, note: '答得清楚' }] : [],
  }))

  // 转录是**成对**的：一问一答。别用取模拼——那会让「答」的位置
  // 出现上一问的文本，看着像 bug。
  const dialogue = [
    ['先做个自我介绍吧，讲一段你认为最能代表你的经历。',
      '好的。我在恒信银行做了两年半后端，主要负责交易核心链路，包括订单、账务和清结算三个子系统。其中清结算的日终批处理是我从零搭起来的。'],
    ['你刚才提到日终批处理，峰值流量大概是多少？当时的瓶颈在哪里？',
      '日终大概两百万笔，集中在晚上十一点到凌晨一点。最初的瓶颈是数据库的批量更新，单条提交跑了四十分钟，后来改成了批量合并提交加临时表，降到大概二十分钟。'],
    ['为什么选择临时表而不是直接用 MySQL 的批量插入？两者在你这个场景下的差别是什么？',
      '临时表方案我们评估过。直接批量插入在两百万行这个量级会产生很大的 redo log 和 binlog，锁的持有时间也长。临时表是先在内存表里聚合，再一次性写入，行数少了两个数量级。'],
    ['这个过程中有遇到数据一致性的问题吗？比如临时表写了一半失败怎么办？',
      '有。临时表和正式表之间我们是靠事务保证的，写入和标记在一个事务里。另外批处理有重试机制，每次重试会先清理上一轮的中间状态，用的是批次号隔离。'],
    ['很好。那我们换个方向——你简历里提到在银行做信创私有化交付，这部分你具体负责什么？',
      '我负责的是适配层。国产数据库和中间件的行为跟开源版本有差异，我写了一层适配来屏蔽差异，然后做了一整套回归测试。'],
    ['举一个具体的差异例子，说明你怎么处理的。',
      '比如国产数据库对自增主键的支持跟 MySQL 不一样，在并发插入的时候会跳号。我们的逻辑依赖主键连续，所以要改成应用层发号，用号段模式。'],
    ['那发号器的号段大小你怎么定的？',
      '初始是 1000，实测下来在写入压力最高的时候补号段的频率大概是每两秒一次，能撑住。后来根据监控调整到了 5000。'],
    ['你们怎么监控批处理的状态？出问题了怎么定位？',
      '批处理有独立的看板，看每批次的处理条数、耗时和失败数。失败会落到补偿表里，人工确认后重跑，重跑按批次号幂等。'],
  ]

  // 注意 `.flat()` 的位置：Array.from 的 mapper 返回**数组**时不会自动摊平，
  // 得在 Array.from 之后再 flat，否则每行都是数组，role/text 全是 undefined。
  const transcript = Array.from({ length: 16 }, (_, pair) => ([
    { role: 'interviewer', text: dialogue[pair % dialogue.length][0] },
    { role: 'candidate', text: dialogue[pair % dialogue.length][1] },
  ])).flat().map((row, index) => ({
    ts: now - (32 - index) * 45000,
    role: row.role,
    text: row.text,
    meta: {},
  }))

  const presetAll = typeof window !== 'undefined' ? window.__PRESET__ : undefined
  const presetStatus = presetAll === undefined || presetAll === null ? undefined : presetAll.status
  const session = {
    id: 'iv-20261116-a3f1',
    title: '远星 · 高级后端工程师',
    role: 'candidate',
    // 预设可以改状态（`status: 'done'` 用来截「续接板」，`paused` 截暂停板）。
    status: typeof presetStatus === 'string' ? presetStatus : 'running',
    // 左栏按公司分组：没有这两项，截图里所有场次都会掉进「未整理」，
    // 分组、折叠、行内岗位名三件事就全看不见了。
    company: '远星科技',
    position: '高级后端工程师',
    createdAt: now - 5400000,
    startedAt: now - 3600000,
    endedAt: 0,
    updatedAt: now,
    profileId: 'pf-2026111-a2c9',
    dir: 'D:\\DSH-REALTIME-INTERVIEW-ROOT\\workspaces\\iv-20261116-a3f1',
    // 助手会话：拉 JD / 出底稿 / 开场 / 写报告共用的那个宿主对话（AGENTS §6.14）。
    agentSessionId: 'sess_7f3a91c2',
    agent: {
      sessionId: 'sess_7f3a91c2',
      createdAt: now - 5400000,
      workspaceId: 'ws-20261116-b7d2',
      rebuilds: 0,
      dispatches: [{ at: now - 120000, kind: 'checklist', requestId: 'checklist-demo', explicit: false }],
      lastDispatchAt: now - 120000,
    },
  }

  const state = {
    session,
    revision: 'a:1:2|b:3:4|c:5:6|d:-',
    checklist: { version: 2, items: checklist, adjustments: [] },
    transcript,
    transcriptTotal: transcript.length,
    transcriptTruncated: false,
    documents: {
      resumeChars: 4820,
      jdChars: 2130,
      jdUrl: 'https://jobs.example.com/position/123456/detail',
      jdSections: { overview: '高级后端工程师', responsibilities: '…', requirements: '…', bonus: '…' },
      jdWarnings: [],
    },
    recordings: [
      { name: 'video-2026-11-16T03-12-44.webm', kind: 'video', bytes: 10485760, modifiedAt: now - 120000, path: 'x' },
      { name: 'audio-2026-11-16T03-14-02.webm', kind: 'audio', bytes: 1048576, modifiedAt: now - 60000, path: 'y' },
    ],
    report: '',
    // 等助手返回的任务：截图用 `tasks: 'drafting' | 'report-failed'` 演出来。
    // 真代码里这是 Host 根据派发记录 + 宿主会话状态算的，不是客户端自己编的。
    agentTasks: (() => {
      const preset = typeof window !== 'undefined' ? window.__PRESET__ : undefined
      const kind = preset === undefined || preset === null ? undefined : preset.tasks
      if (kind === 'drafting') {
        return { checklist: { kind: 'checklist', status: 'waiting', at: now - 4000, requestId: 'checklist-demo' } }
      }
      if (kind === 'report-failed') {
        return {
          report: {
            kind: 'report', status: 'failed', at: now - 70000, requestId: 'report-demo',
            reason: '助手这一轮结束了，但没有写回报告',
            hint: '再点一次「生成事后报告」；也可以在对话里让助手用 interview_finish 写。',
          },
        }
      }
      return {}
    })(),
    stats: {
      asked: 15, answered: 15, durationMs: 3600000,
      checklistTotal: 14, checklistProbed: 5, adjustments: 2,
    },
  }

  const report = `# 面试评估报告

## 结论

**建议推进到下一轮。** 候选人在分布式一致性与信创适配两块有真实工程深度，
不是背出来的；JVM 调优那题答得偏浅，建议下一轮由技术面补一轮。

## 逐考点评估

| 考点 | 命中 | 依据 |
|---|---|---|
| 订单系统的限流与降级 | 深挖到位 | 主动提到令牌桶参数与灰度顺序 |
| 分布式事务与最终一致性 | 答得含糊 | 只说了"用消息表"，没提幂等与补偿 |
| JVM 内存排查与调优 | 没答上来 | 承认"当时是团队一起看的" |
| 慢查询优化与索引设计 | 深挖到位 | 给出了 explain 的实际输出 |

## 亮点

- **清结算批处理**：从 40 分钟优化到 20 分钟，路径清晰，能说出取舍
- **信创适配层**：举了自增主键跳号的具体例子，不是泛泛而谈

## 风险点

- JVM 调优停留在概念层，简历上的措辞偏重
- 对"一致性"的表述偏口号，需要下一轮压测

## 如果重来

1. JVM 那题换成"你实际调过哪个参数、效果如何"，更容易问出真东西
2. 分布式事务先问"你们线上出过一致性问题吗"，从故事进
`

  const resumeText = `陈屿 / 男 / 2.5 年后端 / 恒信银行

教育
2018.09 - 2022.06  南岭大学  软件工程  本科

工作经历
2022.07 - 至今  恒信银行  总行信息技术部  后端开发工程师

2023.03 - 2024.09  交易核心链路（订单、账务、清结算）
- 负责订单中心与账务系统的接口开发与治理，日订单峰值 320 万笔。
- 牵头清结算日终批处理从零搭建：初版单条提交耗时 40 分钟，改为临时表聚合 +
  批量合并提交后降到 20 分钟，单批次 200 万笔。
- 引入幂等键与批次号隔离机制，保证批处理重试不会重复入账。
- 线上问题定位与复盘：主导 3 起资金类生产故障的根因分析，输出改进项 11 条。

2024.09 - 至今  信创私有化交付（适配层）
- 负责国产数据库 / 中间件与开源版本的差异适配层，屏蔽 6 类行为差异。
- 针对自增主键跳号问题，改造为应用层号段发号（初始段长 1000，
  压测后调整为 5000），保证主键连续的业务依赖。
- 搭建适配层回归测试集，覆盖 180 条用例，随版本发布执行。

2022.07 - 2023.03  零售客户系统
- 参与订单查询链路优化，慢查询从 1.8s 降到 120ms，索引重建 + 读模型拆分。

技能
Java 8/11/17、Spring Boot、Spring Cloud、MySQL、Redis、RocketMQ、Kafka、
Nginx、Prometheus / Grafana、Kubernetes`

  const jdText = `高级后端工程师（交易方向）

岗位职责
1. 负责交易核心链路的架构设计与研发，支撑高并发场景下的稳定性；
2. 负责分布式事务、幂等、一致性等关键问题的方案设计与落地；
3. 负责线上问题的定位、复盘与改进闭环，推动工程质量文化；
4. 参与大促等流量高峰场景的容量规划与预案。

任职要求
1. 3 年以上后端研发经验，本科及以上学历，计算机相关专业；
2. 精通 Java，熟悉 JVM 内存模型与常见调优手段；
3. 具备高并发系统设计经验，熟悉限流、降级、熔断等治理手段；
4. 熟悉 MySQL 索引原理与性能优化，有慢查询治理经验；
5. 有缓存（Redis）使用经验，理解缓存击穿 / 穿透 / 雪崩的成因与治理；
6. 熟悉 RocketMQ / Kafka，具备消息消费幂等与顺序性处理经验；
7. 有可观测性体系（Prometheus / Grafana / 链路追踪）建设经验；
8. 具备良好的技术选型与方案评审能力，有跨团队协作经验。

加分项
- 有大促容量规划与压测经验；
- 有分库分表、数据迁移的落地经验；
- 开源社区贡献。`

  // 报告页要看到真东西。
  state.report = report

  // 字数与正文保持一致：硬编码的数字迟早和正文对不上，截图里就会出现
  // 「卡片 4820 字 / 弹层 670 字」这种自相矛盾。
  state.documents.resumeChars = resumeText.length
  state.documents.jdChars = jdText.length

  // ── 设置页的假数据 ────────────────────────────────────────────────
  //
  // 设置页是**唯一一页能回答「这台机器现在用的是哪条链路」**的界面，
  // 所以假数据必须把两种真实处境都演出来：
  //   · 已配置：宿主的凭据里已经有钥匙，语音走服务端模型；
  //   · 未配置（预设 `voice: 'unconfigured'`）：只有免密钥/浏览器兜底，
  //     界面上要能看出「没配」和「下一步能做什么」。
  //
  // 形状与 host 的 `voicePresets()` 一致：分组、只读标记、按预设给的模型清单。
  // 这里只放**有代表性的子集**——下拉里的完整顺序由 Host 决定，界面不硬编码。
  const presets = [
    { id: 'auto', kind: 'asr', group: 'control', groupLabel: '', label: '自动', protocol: 'auto', protocolLabel: 'auto', baseUrl: '', model: '', models: [], voice: '', apiKeyEnv: '', keyless: true, locked: false, notes: '宿主 → 预设供应商 → 浏览器' },
    { id: 'qwen-token-plan', kind: 'asr', group: 'vendor', groupLabel: '预设供应商', vendor: 'qwen', label: 'Qwen · Token Plan（千问中转）', protocol: 'dashscope-asr', protocolLabel: 'DashScope multimodal-generation', baseUrl: 'https://token-plan.maas.qianwenaiapi.com', model: 'qwen-audio-3.0-asr-flash', models: [], voice: '', apiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY', keyless: false, locked: true, notes: '千问 Token Plan 中转' },
    { id: 'mimo', kind: 'asr', group: 'vendor', groupLabel: '预设供应商', vendor: 'mimo', label: 'MiMo · API 直连（官方按量）', protocol: 'chat-audio', protocolLabel: 'chat/completions + input_audio', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-asr', models: [], voice: '', apiKeyEnv: 'MIMO_API_KEY', keyless: false, locked: true, notes: 'chat/completions + input_audio' },
    { id: 'openai-custom', kind: 'asr', group: 'compatible', groupLabel: '任意 OpenAI 协议兼容', vendor: '', label: 'OpenAI 兼容 · 自定义端点', protocol: 'openai', protocolLabel: 'OpenAI /audio/transcriptions', baseUrl: '', model: 'whisper-1', models: [], voice: '', apiKeyEnv: 'OPENAI_API_KEY', keyless: false, locked: false, notes: '任何 /audio/transcriptions 网关' },
    { id: 'browser', kind: 'asr', group: 'free', groupLabel: '免密钥免费方案', vendor: '', label: '浏览器 Web Speech（免密钥）', protocol: 'browser', protocolLabel: '浏览器 Web Speech', baseUrl: '', model: '', models: [], voice: '', apiKeyEnv: '', keyless: true, locked: false, notes: '零配置兜底' },
    { id: 'mimo', kind: 'tts', group: 'vendor', groupLabel: '预设供应商', vendor: 'mimo', label: 'MiMo TTS · API 直连（官方按量）', protocol: 'chat-audio', protocolLabel: 'chat/completions + input_audio', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-tts', models: [
      { id: 'mimo-v2.5-tts', label: 'MiMo TTS · 预置音色（默认）' },
      { id: 'mimo-v2.5-tts-voicedesign', label: 'MiMo TTS · 文本描述音色' },
    ], voice: 'mimo_default', apiKeyEnv: 'MIMO_API_KEY', keyless: false, locked: true, notes: '小米 MiMo，走 chat/completions 带 audio 的协议' },
    { id: 'dashscope-token-plan', kind: 'tts', group: 'vendor', groupLabel: '预设供应商', vendor: 'qwen', label: 'Qwen TTS · Token Plan（千问中转）', protocol: 'dashscope', protocolLabel: 'DashScope tts_v2 WebSocket', baseUrl: 'wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference', model: 'qwen-audio-3.0-tts-plus', models: [{ id: 'qwen-audio-3.0-tts-plus', label: 'Qwen-Audio 3.0 TTS Plus · 旗舰（2 音色）' }], voice: 'longanlingxin', apiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY', keyless: false, locked: true, notes: 'tts_v2 WebSocket；该中转只有 plus' },
    { id: 'openai', kind: 'tts', group: 'compatible', groupLabel: '任意 OpenAI 协议兼容', vendor: 'openai', label: 'OpenAI 兼容 · /audio/speech（自定义端点）', protocol: 'openai', protocolLabel: 'OpenAI /audio/speech', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', models: [], voice: 'alloy', apiKeyEnv: 'OPENAI_API_KEY', keyless: false, locked: false, notes: '任何实现 /audio/speech 的网关' },
    { id: 'baidu', kind: 'tts', group: 'free', groupLabel: '免密钥免费方案', vendor: '', label: '百度朗读（免密钥）', protocol: 'baidu', protocolLabel: '百度朗读', baseUrl: '', model: '', models: [], voice: '', apiKeyEnv: '', keyless: true, locked: false, notes: '不需要密钥，音质一般但永远能用' },
    { id: 'edge', kind: 'tts', group: 'free', groupLabel: '免密钥免费方案', vendor: '', label: 'Edge 神经音色（免密钥）', protocol: 'edge', protocolLabel: 'Edge 神经音色', baseUrl: '', model: '', models: [], voice: 'zh-CN-XiaoxiaoNeural', apiKeyEnv: '', keyless: true, locked: false, notes: 'Edge 的在线自然音，不需要密钥' },
  ]

  const configuredCredentials = [
    { ref: 'XIAOMI_TOKEN_PLAN_CN_API_KEY', configured: true, source: 'host' },
    { ref: 'M_PLAN_API_KEY', configured: true, source: 'host' },
    { ref: 'QIANWEN_TOKEN_PLAN_API_KEY', configured: true, source: 'host' },
    { ref: 'SILICONFLOW_API_KEY', configured: true, source: 'host' },
    { ref: 'OPENAI_API_KEY', configured: false, source: 'none' },
    { ref: 'MIMO_API_KEY', configured: false, source: 'none' },
    { ref: 'DASHSCOPE_API_KEY', configured: false, source: 'none' },
  ]
  const missingCredentials = configuredCredentials.map(entry => ({ ...entry, configured: false, source: 'none' }))

  /** 已配置 / 未配置两套语音链路。谁被截图，由预设的 `voice` 字段决定。 */
  const voiceChain = (configured) => ({
    asr: configured
      ? {
        mode: 'server', source: 'host', provider: 'qwen-token-plan', protocol: 'dashscope-asr',
        endpoint: 'https://token-plan.maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation',
        model: 'qwen-audio-3.0-asr-flash', language: 'zh',
        apiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY',
        // 设置页的「现在用」一行读 `server.*`；顶层的同名字段留给旧视图。
        server: {
          label: 'Qwen · Token Plan（千问中转）',
          protocol: 'dashscope-asr',
          protocolLabel: 'DashScope multimodal-generation',
          baseUrl: 'https://token-plan.maas.qianwenaiapi.com',
          endpoint: 'https://token-plan.maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation',
          model: 'qwen-audio-3.0-asr-flash',
        },
        reason: '使用 Qwen · Token Plan；凭据来自环境变量 QIANWEN_TOKEN_PLAN_API_KEY。',
      }
      : {
        mode: 'browser', source: 'browser', provider: 'web-speech',
        endpoint: '', model: '', language: 'zh', apiKeyEnv: '',
        reason: '没有可用的服务端凭据，识别回落到浏览器 Web Speech，键盘输入始终可用',
      },
    tts: configured
      ? {
        mode: 'server', source: 'host', provider: 'dashscope-token-plan',
        label: 'Qwen TTS · Token Plan（千问中转）',
        protocol: 'dashscope',
        endpoint: 'wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference', model: 'qwen-audio-3.0-tts-plus',
        voice: 'longanlingxin', apiKeyEnv: 'QIANWEN_TOKEN_PLAN_API_KEY',
        reason: '使用 Qwen TTS · Token Plan；凭据来自环境变量 QIANWEN_TOKEN_PLAN_API_KEY。',
      }
      : {
        mode: 'browser', source: 'browser', provider: 'system-voice',
        endpoint: '', model: '', voice: '系统音色', apiKeyEnv: '',
        reason: '没有可用的播报凭据，先用浏览器系统音色，听感会明显不同',
      },
  })

  const settingsSnapshot = (configured) => ({
    settings: {
      asrProvider: configured ? 'qwen-token-plan' : 'auto',
      asrEndpoint: '',
      asrBaseUrl: '',
      asrModel: '',
      asrApiKeyEnv: '',
      asrLanguage: 'zh',
      ttsProvider: configured ? 'dashscope-token-plan' : 'auto',
      ttsModel: configured ? 'qwen-audio-3.0-tts-plus' : '',
      ttsVoice: configured ? 'longanlingxin' : '',
      ttsBaseUrl: '',
      ttsApiKeyEnv: '',
      ttsFormat: '',
      ttsRate: 1,
      ttsStyle: '',
      cameraBackend: 'auto',
      ffmpegPath: '',
      chromiumPath: '',
      recordVideo: true,
      recordAudio: true,
      guardEnabled: true,
      guardQuiet: false,
    },
    // 设置快照里直接带预设表与凭据清单（设置页不再各自去取一次）。
    presets,
    credentials: configured ? configuredCredentials : missingCredentials,
    effective: {
      asrProvider: configured ? 'qwen-token-plan' : 'auto',
      asrEndpoint: '',
      asrBaseUrl: '',
      asrModel: '',
      asrApiKeyEnv: '',
      asrLanguage: 'zh',
      ttsProvider: configured ? 'dashscope-token-plan' : 'auto',
      ttsBaseUrl: '',
      ttsModel: configured ? 'qwen-audio-3.0-tts-plus' : '',
      ttsVoice: configured ? 'longanlingxin' : '',
      ttsApiKeyEnv: '',
      ttsFormat: 'mp3',
      ttsRate: 1,
      ttsStyle: '',
    },
    voice: { ...voiceChain(configured), credentials: configured ? configuredCredentials : missingCredentials, presets },
    camera: { backend: 'ffmpeg', running: false },
    backends: {
      ffmpeg: { found: true, path: 'D:\\tools\\ffmpeg\\bin\\ffmpeg.exe', source: 'config' },
      chromium: { found: true, path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', source: 'system' },
    },
    speechModel: {
      exists: true, dir: 'C:\\Users\\example\\.dsh\\models\\sensevoice',
      bytes: 268435456, files: 12, provider: 'sherpa-onnx',
    },
    dataRoot: {
      path: 'D:\\DSH-REALTIME-INTERVIEW-ROOT',
      source: 'config',
      reason: '配置里指定的工作区根（非系统盘，简历与录像不占系统盘）',
      exists: true,
    },
    sessionsDir: 'D:\\DSH-REALTIME-INTERVIEW-ROOT\\workspaces',
    profilesDir: 'D:\\DSH-REALTIME-INTERVIEW-ROOT\\profiles',
    settingsFile: 'C:\\Users\\example\\.dsh\\profiles\\desktop\\dsh-realtime-interview.json',
    hostWorkspace: { path: 'D:\\Code\\Node\\DSH-INTERVIEWER-ROOT' },
    workspaceRegistration: {
      registered: true,
      title: 'dsh-realtime-interview',
      workspaceId: 'ws-20261116-b7d2',
    },
    emptySessions: [],
    session: { id: session.id, dir: session.dir, artifacts: state.recordings },
  })

  // 预览里的可写状态：保存简历 / JD、入库、换简历都要真的改变它，
  // 否则「保存后刷新还是旧正文」——截图和探针都会被假数据骗。
  const docs = { resume: resumeText, jd: jdText }
  const library = [
    { id: 'rs-20261116-a91c', title: '远星科技 · 高级后端工程师', text: resumeText, chars: resumeText.length, createdAt: now - 5400000, updatedAt: now - 3600000 },
    { id: 'rs-20261110-b72d', title: '云澜科技 · 金融科技开发（Java）', text: '云澜科技 · 金融科技开发\n\n3 年 Java 后端，做过支付清结算与账务系统。', chars: 42, createdAt: now - 700000000, updatedAt: now - 690000000 },
    { id: 'rs-20261028-c18e', title: '青柚社区 · 后端开发工程师（社区方向 · 推荐与内容安全）', text: '青柚社区 · 后端开发\n\n内容安全与推荐链路的服务端开发。', chars: 28, createdAt: now - 1800000000, updatedAt: now - 1790000000 },
  ]

  /**
   * 一段假播报音频：220Hz 正弦 + 音节包络（16kHz 单声道 WAV，base64）。
   *
   * 它存在的唯一理由：**让"TTS 字节 → 分析器 → 音量 → 口型"这条链在预览里真的跑一遍。**
   * 静态假数据（回一个 `{}`）只会走到浏览器音色兜底，而兜底按设计就没有口型。
   */
  const demoSpeechWav = () => {
    const sampleRate = 16000
    const seconds = 2.2
    const count = Math.floor(sampleRate * seconds)
    const buffer = new ArrayBuffer(44 + count * 2)
    const view = new DataView(buffer)
    const text = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
    }
    text(0, 'RIFF')
    view.setUint32(4, 36 + count * 2, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, count * 2, true)
    for (let index = 0; index < count; index += 1) {
      const t = index / sampleRate
      // 每 0.28s 一个音节：振幅 0.62 × 半正弦包络 → 听起来像"在说话"，RMS 也在响。
      const syllable = Math.abs(Math.sin((Math.PI * t) / 0.28))
      const rise = Math.min(1, t * 8)
      const sample = Math.sin(2 * Math.PI * 220 * t) * 0.62 * syllable * rise
      view.setInt16(44 + index * 2, Math.round(sample * 32767), true)
    }
    let binary = ''
    const bytes = new Uint8Array(buffer)
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
    return btoa(binary)
  }

  window.__FIXTURES__ = {
    route(path, preview, method = 'GET', body = {}) {
      // 播报：**给一段真音频**。
      //
      // **为什么预览也要真字节。** 口型是"TTS 音频 → 分析器 → 音量 → 嘴"这条链，
      // 只回 `{}`（假的失败）就永远只能看到浏览器音色兜底——而兜底**本来就没有
      // 口型**。要验证「说话时嘴在动」，就得真的有一段能被 WebAudio 分析的波形。
      //
      // **必须在 POST 分支之前。** POST 分支对认不出的写操作会兜底回 `{ok:true}`，
      // 放到后面就永远轮不到这里（踩过一次：截图里嘴一动不动，以为口型坏了）。
      if (path === '/tts/speak') {
        return { ok: true, audioBase64: demoSpeechWav(), mimeType: 'audio/wav' }
      }
      if (method === 'POST') {
        const parts = path.split('/').filter(part => part !== '')
        if (parts[0] === 'resume' && parts[1] === 'extract') {
          // 预览里把上传的文件真的解成文字——否则「上传后进编辑态」
          // 这条路径在截图/探针里永远是空的。
          let text = ''
          try {
            const bytes = Uint8Array.from(atob(String(body?.dataBase64 ?? '')), ch => ch.charCodeAt(0))
            text = new TextDecoder().decode(bytes).trim()
          } catch (error) {
            text = ''
          }
          const filename = String(body?.filename ?? '').toLowerCase()
          if (body?.plainOnly === true && !/\.(txt|md|markdown|text)$/.test(filename)) {
            return { ok: false, kind: 'unknown', text: '', warnings: ['JD 只收纯文本（.txt / .md）。请另存为纯文本再传，或把正文粘贴进来。'], chars: 0 }
          }
          if (text === '') return { ok: false, kind: 'unknown', text: '', warnings: ['文件是空的'], chars: 0 }
          return { ok: true, kind: 'plain', text, warnings: [], chars: text.length }
        }
        if (parts[0] === 'sessions') {
          if (parts.length === 1) {
            return { session: { ...session, id: 'iv-20261117-new1', title: '新面试', status: 'draft' } }
          }
          // 「记录清理」：批量删（逐场回结果，进行中的会被拒）。
          if (parts[1] === 'delete-batch') {
            const ids = Array.isArray(body?.ids) ? body.ids : []
            return {
              deleted: ids.map(id => ({ sessionId: id, title: id })),
              refused: [],
              deletedCount: ids.length,
              refusedCount: 0,
            }
          }
          // 重置：清掉面试过程的记录，状态回 draft。
          if (parts[2] === 'reset') {
            state.session.status = 'draft'
            state.transcript = []
            state.report = ''
            state.stats.durationMs = 0
            state.stats.asked = 0
            state.stats.answered = 0
            state.stats.checklistProbed = 0
            return {
              ok: true,
              sessionId: parts[1],
              cleared: {
                turns: 30, interviewTurns: 15, report: true, recordings: 0,
                checklistProbed: 5, checklistAdjustments: 2, agentTasks: 0, hostSessionDetached: true,
              },
              kept: { recordings: 2, checklistItems: 14, resume: true, jd: true },
              session: state.session,
            }
          }
          // 续接：状态回 running（transcript / 底稿 / 计时都不动）。
          if (parts[2] === 'continue') {
            state.session.status = 'running'
            return { session: state.session }
          }
          // 改元信息（POST sessions/<id>）：预览里要真的改掉，否则
          // 「保存了但页头/列表没变」在截图和探针里都看不出来。
          if (parts.length === 2) {
            const text = value => (typeof value === 'string' ? value.trim() : '')
            const company = body?.company === undefined ? text(state.session.company) : text(body.company)
            const position = body?.position === undefined ? text(state.session.position) : text(body.position)
            state.session.company = company
            state.session.position = position
            const title = body?.title === undefined ? text(state.session.title) : text(body.title)
            state.session.title = title === '' ? `${company} · ${position}` : title
            return { session: state.session }
          }
          if (parts[2] === 'resume') {
            docs.resume = String(body?.text ?? '')
            state.documents.resumeChars = docs.resume.length
            return { chars: docs.resume.length }
          }
          if (parts[2] === 'jd') {
            docs.jd = String(body?.text ?? '')
            state.documents.jdChars = docs.jd.length
            return { chars: docs.jd.length, session: state.session }
          }
          return { ok: true }
        }
        if (parts[0] === 'resumes') {
          if (parts.length === 1) {
            const text = String(body?.text ?? docs.resume)
            const created = {
              id: `rs-${Date.now()}`, title: String(body?.title ?? '未命名简历'),
              text, chars: text.length, createdAt: Date.now(), updatedAt: Date.now(),
            }
            library.unshift(created)
            return { resume: created }
          }
          if (parts[2] === 'delete') {
            const at = library.findIndex(item => item.id === parts[1])
            if (at >= 0) library.splice(at, 1)
            return { deleted: true, id: parts[1] }
          }
          // 没有第二段 = 把库里这份用到这一场。
          const found = library.find(item => item.id === parts[1])
          if (found !== undefined) {
            docs.resume = found.text
            state.documents.resumeChars = found.text.length
          }
          return { resume: found ?? { id: parts[1], title: parts[1], text: docs.resume, chars: docs.resume.length } }
        }
        return { ok: true }
      }
      // 预设里 `voice: 'unconfigured'` 时，给设置页演「这台机器还没有钥匙」
      // 的那一套——「已配置」看一万遍也看不出「未配置」长什么样。
      const configured = !(typeof window !== 'undefined'
        && window.__PRESET__ !== undefined
        && window.__PRESET__ !== null
        && window.__PRESET__.voice === 'unconfigured')

      // 设置页的取数。**凭据永远只回名字与来源，不回值**（假数据也一样）。
      if (path === '/voice/credentials' || path.startsWith('/voice/credentials?')) {
        return { credentials: configured ? configuredCredentials : missingCredentials }
      }
      if (path === '/voice/presets' || path.startsWith('/voice/presets?')) {
        return { presets }
      }
      if (path.startsWith('/voice')) {
        return {
          ...voiceChain(configured),
          credentials: configured ? configuredCredentials : missingCredentials,
          presets,
        }
      }
      if (path.startsWith('/settings')) {
        return settingsSnapshot(configured)
      }
      if (path.startsWith('/sessions')) {
        // 归档正文（准备页单独取，不跟轮询走）。
        if (path.endsWith('/documents')) {
          return {
            resume: docs.resume,
            jd: docs.jd,
            jdMeta: { url: 'https://jobs.example.com/position/123456/detail', sections: {}, warnings: [] },
          }
        }
        if (path === '/sessions/records') {
          // 「记录清理」弹层：每场的记录体量（真代码里只在打开弹层时算）。
          return {
            sessions: [
              {
                id: session.id, title: session.title, company: session.company, position: session.position,
                status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt,
                archived: false, turns: 30, hasResume: true, hasJd: true, hasReport: false,
                checklistCount: 14, recordings: 2, bytes: 12582912, running: session.status === 'running',
              },
              {
                id: 'iv-20261115-9d2e', title: '云澜 · 金融科技开发', company: '云澜科技', position: '金融科技开发',
                status: 'done', createdAt: now - 86400000, updatedAt: now - 80000000,
                archived: false, turns: 42, hasResume: true, hasJd: true, hasReport: true,
                checklistCount: 11, recordings: 0, bytes: 3145728, running: false,
              },
              {
                // 误触新建留下的空场次：清理弹层里的主要目标。
                id: 'iv-20261117-e1f2', title: '新面试', company: '新建公司 2026-11-17', position: '新建岗位 2026-11-17',
                status: 'draft', createdAt: now - 600000, updatedAt: now - 600000,
                archived: false, turns: 0, hasResume: false, hasJd: false, hasReport: false,
                checklistCount: 0, recordings: 0, bytes: 0, running: false,
              },
            ],
          }
        }
        if (path === '/sessions/empty') {
          return { candidates: [{ id: 'iv-20261117-e1f2', title: '新面试', createdAt: now - 600000 }] }
        }
        if (path === '/sessions') {
          // 空状态预设：一场都还没有。左栏与主区的「一句话 + 一个动作」
          // 只有在真的没有场次时才会渲染，不给它一档就永远截不到。
          const preset = typeof window !== 'undefined' ? window.__PRESET__ : undefined
          if (preset !== undefined && preset !== null && preset.empty === true) return { sessions: [] }
          return {
            sessions: [
              { ...session, checklistCount: 14, probedCount: 5, hasResume: true, hasJd: true, hasReport: false },
              {
                id: 'iv-20261115-9d2e', title: '云澜 · 金融科技开发', role: 'candidate', status: 'done',
                company: '云澜科技', position: '金融科技开发',
                createdAt: now - 86400000, updatedAt: now - 80000000, hasResume: true, hasJd: true,
                checklistCount: 11, probedCount: 11, hasReport: true,
              },
              {
                id: 'iv-20261114-7b1c', title: '拾光网络 · 后端开发（自测）', role: 'candidate', status: 'done',
                company: '拾光网络', position: '后端开发（自测）',
                createdAt: now - 172800000, updatedAt: now - 170000000, hasResume: true, hasJd: false,
                checklistCount: 8, probedCount: 8, hasReport: true,
              },
              {
                // 同公司第二场 + 一个明显过长的标题：用来目检「组里有几场」
                // 和「被截断的标题悬停能看全」。
                id: 'iv-20261112-4e8a', title: '远星科技 · 高级后端工程师（三面 · 数据库与高并发场景设计）',
                role: 'candidate', status: 'done',
                company: '远星科技', position: '高级后端工程师',
                createdAt: now - 300000000, updatedAt: now - 200000000, hasResume: true, hasJd: true,
                checklistCount: 12, probedCount: 12, hasReport: true,
              },
            ],
          }
        }
        return state
      }
      if (path === '/resumes' || path.startsWith('/resumes?')) {
        // 简历库：三份名字要**认得出来**（公司 · 岗位），其中一份名字很长，
        // 用来检查下拉弹层里的省略号与整行点击。
        return {
          resumes: library.map(({ id, title, chars, createdAt, updatedAt }) => ({ id, title, chars, createdAt, updatedAt })),
        }
      }
      if (path.startsWith('/profiles')) {
        return {
          profiles: [
            { id: 'pf-2026111-a2c9', title: '远星 · 高级后端工程师', company: '远星科技', jdUrl: 'https://jobs.example.com/…', jdChars: 2130, checklistCount: 14, sessions: ['iv-20261116-a3f1'], createdAt: now - 86400000, updatedAt: now - 3600000 },
            { id: 'pf-2026103-c8b4', title: '云澜 · 金融科技开发', company: '云澜科技', jdUrl: '', jdChars: 1980, checklistCount: 11, sessions: ['iv-20261115-9d2e'], createdAt: now - 172800000, updatedAt: now - 80000000 },
          ],
        }
      }
      if (path.startsWith('/config')) {
        return {
          asrProvider: 'auto', ttsProvider: 'auto', ttsRate: 1, ttsVoice: '',
          recordVideo: true, recordAudio: true, jdFetchTimeoutMs: 15000,
          workspaceRoot: { path: 'D:\\DSH-REALTIME-INTERVIEW-ROOT', source: 'config', reason: '配置里指定的工作区根', exists: true },
        }
      }
      if (path.startsWith('/asr')) {
        return {
          mode: preview.media === 'denied' ? 'browser' : 'server',
          source: 'host', provider: 'minimax', model: 'asr-1.0', protocol: 'minimax',
          endpoint: 'https://api.minimaxi.com/v1/speech_to_text',
          reason: '继承 DSH 宿主的 minimax 配置（凭据来自宿主的 credentials）。',
          language: 'zh',
        }
      }
      return {}
    },
    report,
    state,
    checklist,
    transcript,
  }
})()
