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
      '好的。我在招商银行做了两年半后端，主要负责交易核心链路，包括订单、账务和清结算三个子系统。其中清结算的日终批处理是我从零搭起来的。'],
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

  const session = {
    id: 'iv-20261116-a3f1',
    title: '字节 · 高级后端工程师',
    role: 'candidate',
    status: 'running',
    createdAt: now - 5400000,
    startedAt: now - 3600000,
    endedAt: 0,
    updatedAt: now,
    profileId: 'pf-2026111-a2c9',
    dir: 'D:\\DSH-INTERVIEWER-ROOT\\workspaces\\iv-20261116-a3f1',
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
      jdUrl: 'https://jobs.bytedance.com/position/123456/detail',
      jdSections: { overview: '高级后端工程师', responsibilities: '…', requirements: '…', bonus: '…' },
      jdWarnings: [],
    },
    recordings: [
      { name: 'video-2026-11-16T03-12-44.webm', kind: 'video', bytes: 10485760, modifiedAt: now - 120000, path: 'x' },
      { name: 'audio-2026-11-16T03-14-02.webm', kind: 'audio', bytes: 1048576, modifiedAt: now - 60000, path: 'y' },
    ],
    report: '',
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

  const resumeText = `梁守 / 男 / 2.5 年后端 / 招商银行

教育
2018.09 - 2022.06  华中科技大学  软件工程  本科

工作经历
2022.07 - 至今  招商银行  总行信息技术部  后端开发工程师

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

  window.__FIXTURES__ = {
    route(path, preview) {      if (path.startsWith('/sessions')) {
        // 归档正文（准备页单独取，不跟轮询走）。
        if (path.endsWith('/documents')) {
          return {
            resume: resumeText,
            jd: jdText,
            jdMeta: { url: 'https://jobs.bytedance.com/position/123456/detail', sections: {}, warnings: [] },
          }
        }
        if (path === '/sessions') {
          return {
            sessions: [
              { ...session, checklistCount: 14, probedCount: 5, hasResume: true, hasJd: true, hasReport: false },
              {
                id: 'iv-20261115-9d2e', title: '阿里 · 金融科技开发', role: 'candidate', status: 'done',
                createdAt: now - 86400000, updatedAt: now - 80000000, hasResume: true, hasJd: true,
                checklistCount: 11, probedCount: 11, hasReport: true,
              },
              {
                id: 'iv-20261114-7b1c', title: '美团 · 后端开发（自测）', role: 'candidate', status: 'done',
                createdAt: now - 172800000, updatedAt: now - 170000000, hasResume: true, hasJd: false,
                checklistCount: 8, probedCount: 8, hasReport: true,
              },
            ],
          }
        }
        return state
      }
      if (path.startsWith('/profiles')) {
        return {
          profiles: [
            { id: 'pf-2026111-a2c9', title: '字节 · 高级后端工程师', company: '字节跳动', jdUrl: 'https://jobs.bytedance.com/…', jdChars: 2130, checklistCount: 14, sessions: ['iv-20261116-a3f1'], createdAt: now - 86400000, updatedAt: now - 3600000 },
            { id: 'pf-2026103-c8b4', title: '阿里 · 金融科技开发', company: '阿里巴巴', jdUrl: '', jdChars: 1980, checklistCount: 11, sessions: ['iv-20261115-9d2e'], createdAt: now - 172800000, updatedAt: now - 80000000 },
          ],
        }
      }
      if (path.startsWith('/config')) {
        return {
          asrProvider: 'auto', ttsProvider: 'auto', ttsRate: 1, ttsVoice: '',
          recordVideo: true, recordAudio: true, jdFetchTimeoutMs: 15000,
          workspaceRoot: { path: 'D:\\DSH-INTERVIEWER-ROOT', source: 'config', reason: '配置里指定的工作区根', exists: true },
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
