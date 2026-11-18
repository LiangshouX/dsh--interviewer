# VOICE-TTS.md — 语音合成（TTS）模型速查

> 目的：**接入不用再去翻官方文档**。这里汇总 Qwen / MiniMax / MiMo 三家 TTS 的
> 模型 ID、默认系统音色（含简介）、端点、协议与最小请求示例，以及踩过的坑。
> 插件侧的链路/凭据/测试语义见 [VOICE.md](VOICE.md)；ASR 见 [VOICE-ASR.md](VOICE-ASR.md)；
> 未实现能力（克隆/设计/实时）见 [../ROADMAP.md](../ROADMAP.md)。
>
> 调研日期：2026-11-18。官方模型/音色会更新，**以官方为准**；本文给出来源链接便于复核。
> 标记「待核实」= 官方文档未明确或来自第三方实测，接入前请自行验证。

---

## 0. 一张表先看全

| 系列 | 插件预设 id | 协议 | 默认端点 | 凭据 ref | 模型举例 |
|---|---|---|---|---|---|
| Qwen-Audio-TTS | `dashscope-token-plan` / `dashscope` | **tts_v2 WebSocket** | `wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference` / `wss://dashscope.aliyuncs.com/api-ws/v1/inference` | `QIANWEN_TOKEN_PLAN_API_KEY` / `DASHSCOPE_API_KEY` | `qwen-audio-3.0-tts-plus` |
| CosyVoice | `dashscope`（同协议） | tts_v2 WebSocket / HTTP | 同上 / 百炼 | `DASHSCOPE_API_KEY` | `cosyvoice-v3-flash` |
| Qwen3-TTS | （未接，见 ROADMAP） | DashScope 原生 multimodal-generation HTTP | `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` | `DASHSCOPE_API_KEY` | `qwen3-tts-flash` |
| MiniMax | `minimax-token-plan` / `minimax-cn` | HTTP `t2a_v2`（音频=**hex**） | `https://api.minimax.cn/v1/t2a_v2` | `M_PLAN_API_KEY` / `MINIMAX_API_KEY` | `speech-02-hd` |
| MiMo | `mimo-token-plan` / `mimo` | HTTP `chat/completions`+`audio` | `https://token-plan-cn.xiaomimimo.com/v1` / `https://api.xiaomimimo.com/v1` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` / `MIMO_API_KEY` | `mimo-v2.5-tts` |
| OpenAI 兼容 | `openai` | HTTP `/audio/speech` | 任意兼容网关 | `OPENAI_API_KEY` | `gpt-4o-mini-tts` |
| 免密钥兜底 | `baidu` / `edge` / `browser` | 非公开朗读接口 / WS / `speechSynthesis` | — | 无 | — |

**通用坑（三家都适用）：**
- **key 与主机/平台要配对**：Token Plan 中转 key 只在该中转主机有效，打官方端点 401；反之亦然。
- **音色按模型**：跨模型混用音色报 `InvalidParameter` / `[cosyvoice:]Engine error [411]`（Qwen）或 `2043/2054`（MiniMax）。
- **HTTP 200 也可能业务失败**：MiniMax/MiMo 把业务码放响应体（`base_resp` / 内嵌 error），别只看 HTTP 状态。
- 音频编码各家不同：MiniMax=**hex**、MiMo/Qwen-HTTP=**base64**、Qwen-WS=**二进制帧**、OpenAI=**字节流**。解码别搞混。

---

## 1. Qwen / 阿里百炼

Qwen 系 TTS 有**三条不同的线**，协议互不兼容，别混：

| 线 | 模型 | 协议 |
|---|---|---|
| **Qwen-Audio-TTS** | `qwen-audio-3.0/3.1-tts-plus/flash` | tts_v2 WebSocket（插件所用）；另有 HTTP 非实时 |
| **CosyVoice** | `cosyvoice-v3-flash/plus` 等 | 同 tts_v2 / HTTP |
| **Qwen3-TTS** | `qwen3-tts-flash` | DashScope 原生 multimodal-generation HTTP（**不是** tts_v2） |

### 1.1 Qwen-Audio-TTS（插件 `dashscope` 预设）

**模型 ID 与音色数量**（官方完整音色表见 [Qwen-Audio-TTS 音色列表](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list)）：

| 模型 ID | 定位 | 系统音色数 |
|---|---|---|
| `qwen-audio-3.0-tts-plus` | 旗舰音色、少而精 | **2** |
| `qwen-audio-3.0-tts-flash` | 快速、音色较多 | 12 |
| `qwen-audio-3.1-tts-plus` | 新一代旗舰 | 4 |
| `qwen-audio-3.1-tts-flash` | 新一代快速、多语种/方言 | 139 |

> 「plus 音色少」是模型供给，不是漏配。要更多音色选 flash，或做音色克隆（ROADMAP 1.1）。

**音色表（3.0-tts-plus，完整 2 个）：**

| voice id | 名称 | 性别 | 简介 |
|---|---|---|---|
| `longanlingxin` | 龙安灵心 | 女 | 知心温暖音 |
| `longanlufeng` | 龙安鲁风 | 男 | 明亮开朗音 |

**音色表（3.0-tts-flash，完整 12 个）：**

| voice id | 名称 | 性别 | | voice id | 名称 | 性别 |
|---|---|---|---|---|---|---|
| `longanfengyue` | 龙安风悦 | 女 | | `longhuohuo_v3.6` | 龙火火 | 男 |
| `longanyuanfei` | 龙安元妃 | 女 | | `longchuanshu_v3.6` | 龙川叔 | 男 |
| `longanlingxi` | 龙安灵希 | 女 | | `loongmary` | loongmary | 女 |
| `longanxiaoxin` | 龙安小昕 | 女 | | `loongeva_v3.6` | loongeva | 女 |
| `longanhuan_v3.6` | 龙安欢 | 女 | | `loongjohn` | loongJohn | 男 |
| `longjielidou_v3.6` | 龙杰力豆 | 男 | | `longpaopao_v3.6` | 龙泡泡 | 女 |

**3.1-tts-plus（4）：** `longanlingxin_v3.1`(龙安灵心·女)、`xunanchuan_v3.1`(许南川·男)、`longanhuan_v3.1`(龙安欢·女)、`longanfengyue_v3.1`(龙安风悦·女)。
**3.1-tts-flash（139）：** 含上述 4 个 + 精品中文/英文/多语种/方言/小语种，全表见官方链接（插件 [voices.js](../src/host/voice/voices.js) 已内置完整 139 个）。

**端点（key 与主机配对，实测）：**

| 平台 | WebSocket 端点 | 凭据 | 可用 TTS 模型 |
|---|---|---|---|
| 千问 Token Plan 中转 | `wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference` | `QIANWEN_TOKEN_PLAN_API_KEY` | 仅 `qwen-audio-3.0-tts-plus`（**无 flash**） |
| 千问 AI 平台（北京/通用） | `wss://cn-beijing.maas.qianwenaiapi.com/api-ws/v1/inference` / `wss://maas.qianwenaiapi.com/...` | 该平台 key（非 Token Plan key） | 视平台 |
| 官方百炼 DashScope | `wss://dashscope.aliyuncs.com/api-ws/v1/inference` | `DASHSCOPE_API_KEY` | 全系 |

> Token Plan 的 **HTTP `compatible-mode/v1` 中转不开音频路径**（`/audio/speech`、`/audio/transcriptions` 一律 400/404）。
> Qwen 的 TTS 走 `api-ws` WebSocket；Qwen 的 ASR 走 **原生 `multimodal-generation` 端点**
> （`https://token-plan.maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation`，
> 模型 `qwen-audio-3.0-asr-flash`，2026-11-18 实测 200）。两者都不是 compatible-mode 那条 HTTP 路。

**协议 A：tts_v2 WebSocket（插件所用）** — 事件驱动：
`run-task`(配 model/voice/format) → 等 `task-started` → `continue-task`(送文本) → `finish-task` → 收**二进制音频帧** + `result-generated` → `task-finished`。失败回 `task-failed`(带 error_code/error_message)。

```jsonc
// run-task
{ "header": { "action": "run-task", "task_id": "<uuid>", "streaming": "duplex" },
  "payload": { "task_group": "audio", "task": "tts", "function": "SpeechSynthesizer",
    "model": "qwen-audio-3.0-tts-plus", "input": {},
    "parameters": { "text_type": "PlainText", "voice": "longanlingxin",
                    "format": "mp3", "sample_rate": 22050, "rate": 1, "volume": 50 } } }
// continue-task（task-started 后）
{ "header": { "action": "continue-task", "task_id": "<uuid>", "streaming": "duplex" },
  "payload": { "input": { "text": "你好，欢迎参加模拟面试。" } } }
// finish-task
{ "header": { "action": "finish-task", "task_id": "<uuid>", "streaming": "duplex" },
  "payload": { "input": {} } }
```
握手头：`Authorization: Bearer <KEY>`。format ∈ pcm/wav/mp3/opus；sample_rate ∈ 8000/16000/22050(默认)/24000/44100/48000；rate ∈ [0.5,2]。

**协议 B：HTTP 非实时（官方另一条路，需 WorkspaceId）** — 一次提交整段文本：
`POST https://{WorkspaceId}.{region}.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`
body `{model, input:{text, voice, format, sample_rate}}`；非流式回 `output.audio.url`（再 GET 下载）；
流式加头 `X-DashScope-SSE: enable`，回 `output.audio.data`(base64 分片)。
来源：[非实时语音合成](https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide)。

**坑：** 音色跨模型 411；Token Plan 无 flash；`maas`/`cn-beijing.maas`/`dashscope` 认不同 key；
实时对话模型 `qwen-audio-*-realtime-*` 是**另一类目**（S2S），本插件不支持（ROADMAP 1.3）。

### 1.2 CosyVoice

模型：`cosyvoice-v3-flash`、`cosyvoice-v3-plus`（另有 v2/v1 存量）。协议与 Qwen-Audio-TTS 相同（tts_v2 WS / HTTP 非实时）。
音色（v3-flash 部分）：`longanyang`(龙安洋·男)、`longanhuan`(龙安欢·女)、`longhuhu_v3`、`longxiaochun_v3`、`longxiaoxia_v3`、`longlaotie_v3`、`longshuo_v3`、`longshu_v3` 等；v3-plus：`longanyang`、`longanhuan`。全表见 [CosyVoice 音色列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)。

### 1.3 Qwen3-TTS（协议不同，插件尚未接）

**模型：** `qwen3-tts-flash`（非实时）、`qwen3-tts-flash-realtime`（实时 WS）、`qwen3-tts-vc-*`（复刻音色，待核实）。
**`qwen3-tts-instruct-flash` 已下线**（指令控制改用 `qwen-audio-3.1-tts-*` 的 `instruction` 参数）；旧 `qwen-tts`/`qwen-tts-latest` 也已下线。

**协议 = DashScope 原生 multimodal-generation HTTP**（**不是** tts_v2、**不是** `/audio/speech`；官方未见 OpenAI 兼容 `/audio/speech`，待核实）：
`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`（国际 `dashscope-intl`），
body `{model:"qwen3-tts-flash", input:{text, voice:"Cherry", language_type:"Chinese"}}`；流式加 `X-DashScope-SSE: enable`。

- `input.text` **≤600 字符**（长文本切段分次，或走 realtime 分段 append）；`voice` 必填；`language_type` ∈ Auto(默认)/Chinese/English/German/Italian/Portuguese/Spanish/Japanese/Korean/French/Russian（单一语种显式指定效果更好）。
- **音频位置**：非流式 `output.audio.url`（完整 WAV，**24h 有效**）；流式中间 chunk `output.audio.data`=base64 **PCM16/24kHz/单声道**、末 chunk data 空+给 url。`usage.characters` 计费（token 字段恒 0）。
- **实时** `qwen3-tts-flash-realtime`：`wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-flash-realtime`，事件 `session.update`(voice/mode/response_format/sample_rate) → `input_text_buffer.append`(分段文本) → `input_text_buffer.commit` → `session.finish`；音频在 `response.audio.delta.delta`(base64)。mode=server_commit(默认智能断句)/commit(客户端控制)。
- 音色 48 个为 flash 与 realtime **共用**；除方言音色外同一音色支持 10 语种；**方言靠选方言音色**（无 instruction 参数）。voice id 大小写敏感、含空格原样传。

来源：[Qwen3-TTS API](https://help.aliyun.com/zh/model-studio/qwen-tts-api)、[Realtime WebSocket](https://help.aliyun.com/zh/model-studio/interactive-process-of-qwen-tts-realtime-synthesis)。

**系统音色（48 个，含简介；官方 [Qwen3-TTS 音色列表](https://help.aliyun.com/zh/model-studio/qwen-tts-voice-list)）：**

普通话/人设：

| voice | 名称 | 性别 | 简介 |
|---|---|---|---|
| `Cherry` | 芊悦 | 女 | 阳光积极、亲切自然小姐姐 |
| `Serena` | 苏瑶 | 女 | 温柔小姐姐 |
| `Ethan` | 晨煦 | 男 | 标准普通话带北方口音，阳光温暖活力 |
| `Chelsie` | 千雪 | 女 | 二次元虚拟女友 |
| `Momo` | 茉兔 | 女 | 撒娇搞怪 |
| `Vivian` | 十三 | 女 | 拽拽的可爱小暴躁 |
| `Moon` | 月白 | 男 | 率性帅气 |
| `Maia` | 四月 | 女 | 知性温柔 |
| `Kai` | 凯 | 男 | 耳朵的一场 SPA |
| `Nofish` | 不吃鱼 | 男 | 不会翘舌音的设计师 |
| `Bella` | 萌宝 | 女 | 小萝莉 |
| `Jennifer` | 詹妮弗 | 女 | 品牌级电影质感美语女声 |
| `Ryan` | 甜茶 | 男 | 节奏拉满戏感炸裂 |
| `Katerina` | 卡捷琳娜 | 女 | 御姐韵律回味十足 |
| `Aiden` | 艾登 | 男 | 精通厨艺的美语大男孩 |
| `Eldric Sage` | 沧明子 | 男 | 沉稳睿智老者 |
| `Mia` | 乖小妹 | 女 | 温顺乖巧 |
| `Mochi` | 沙小弥 | 男 | 聪明伶俐小大人 |
| `Bellona` | 燕铮莺 | 女 | 洪亮清晰千面人声 |
| `Vincent` | 田叔 | 男 | 沙哑烟嗓江湖豪情 |
| `Bunny` | 萌小姬 | 女 | 萌属性小萝莉 |
| `Neil` | 阿闻 | 男 | 专业新闻主持人 |
| `Elias` | 墨讲师 | 女 | 严谨又擅叙事的知识讲解 |
| `Arthur` | 徐大爷 | 男 | 质朴岁月嗓音 |
| `Nini` | 邻家妹妹 | 女 | 软黏嗓音 |
| `Seren` | 小婉 | 女 | 温和舒缓助眠 |
| `Pip` | 顽屁小孩 | 男 | 调皮童真 |
| `Stella` | 少女阿月 | 女 | 迷糊少女+爱与正义 |

外语：

| voice | 名称 | 性别 | 简介 |
|---|---|---|---|
| `Bodega` | 博德加 | 男 | 热情西班牙大叔 |
| `Sonrisa` | 索尼莎 | 女 | 热情开朗拉美大姐 |
| `Alek` | 阿列克 | 男 | 战斗民族的冷与暖 |
| `Dolce` | 多尔切 | 男 | 慵懒意大利大叔 |
| `Sohee` | 素熙 | 女 | 温柔开朗韩国欧尼 |
| `Ono Anna` | 小野杏 | 女 | 鬼灵精怪青梅竹马（日） |
| `Lenn` | 莱恩 | 男 | 理性叛逆德国青年 |
| `Emilien` | 埃米尔安 | 男 | 浪漫法国大哥哥 |
| `Andre` | 安德雷 | 男 | 磁性沉稳男生 |
| `Radio Gol` | 拉迪奥·戈尔 | 男 | 足球诗人解说 |

方言：

| voice | 名称 | 性别 | 简介 |
|---|---|---|---|
| `Jada` | 上海-阿珍 | 女 | 风风火火沪上阿姐 |
| `Dylan` | 北京-晓东 | 男 | 北京胡同少年 |
| `Li` | 南京-老李 | 男 | 耐心瑜伽老师 |
| `Marcus` | 陕西-秦川 | 男 | 面宽话短心实声沉 |
| `Roy` | 闽南-阿杰 | 男 | 诙谐直爽台湾哥仔 |
| `Peter` | 天津-李彼得 | 男 | 天津相声捧哏 |
| `Sunny` | 四川-晴儿 | 女 | 甜到心里的川妹子 |
| `Eric` | 四川-程川 | 男 | 跳脱市井成都男子 |
| `Rocky` | 粤语-阿强 | 男 | 幽默风趣在线陪聊 |
| `Kiki` | 粤语-阿清 | 女 | 甜美港妹闺蜜 |

> 注意 voice id 含空格（`Eldric Sage`/`Ono Anna`/`Radio Gol`）需原样保留。

---

## 2. MiniMax

官方文档已迁 Mintlify：中国站 `platform.minimax.cn`、国际站 `platform.minimax.io`；**任意文档页加 `.md` 后缀拿原文**。

**模型 ID（T2A v2 枚举 8 个）：**

| 模型 ID | 定位 | 状态 |
|---|---|---|
| `speech-2.8-hd` | 新一代 HD，情绪渲染+19 种语气词标签 `(laughs)` 等 | 在售旗舰 |
| `speech-2.8-turbo` | 新一代 Turbo，极速 | 在售 |
| `speech-2.6-hd` | 极致音质韵律、超低延时 | 在售 |
| `speech-2.6-turbo` | 极速、适合语音聊天/Agent | 在售 |
| `speech-02-hd` | 韵律稳定、复刻相似度好（**插件默认**） | 在售 |
| `speech-02-turbo` | 韵律稳定、小语种增强 | 在售 |
| `speech-01-hd` / `speech-01-turbo` | 旧版 | 存量兼容，新用户可用性待核实 |

> `speech-2.5-*-preview` 已被 2.6/2.8 取代（不在当前枚举）；语气词标签仅 2.8；`whisper` 情绪 2.8 不支持。新集成建议 `speech-02-hd`(稳) 或 `speech-2.6-turbo`(快)。

**系统音色（官方共 327 个、约 30 语种；全表 [system-voice-id](https://platform.minimax.cn/docs/faq/system-voice-id.md)）。** 调用保留 voice_id 大小写与内部空格。经典音色跨代通用；新式 `Chinese (Mandarin)_*` 为最新系统音色。可用 `POST /v1/get_voice {"voice_type":"system"}` 查当前账号可用音色。

中文经典（16，含 8 个 `-jingpin` beta 变体）：

| voice_id | 中文名 | 性别 | | voice_id | 中文名 | 性别 |
|---|---|---|---|---|---|---|
| `male-qn-qingse` | 青涩青年 | 男 | | `female-shaonv` | 少女（**插件默认**） | 女 |
| `male-qn-jingying` | 精英青年 | 男 | | `female-yujie` | 御姐 | 女 |
| `male-qn-badao` | 霸道青年 | 男 | | `female-chengshu` | 成熟女性 | 女 |
| `male-qn-daxuesheng` | 青年大学生 | 男 | | `female-tianmei` | 甜美女性 | 女 |

（各加 `-jingpin` 后缀即 beta 变体，适用模型待核实。）

中文新式（节选，ID 含空格需原样）：`Chinese (Mandarin)_Gentleman`(温润男声·男)、`Chinese (Mandarin)_News_Anchor`(新闻女声·女)、`Chinese (Mandarin)_Reliable_Executive`(沉稳高管·男)、`Chinese (Mandarin)_Warm_Bestie`(温暖闺蜜·女)、`Chinese (Mandarin)_Sweet_Lady`(甜美女声·女)、`Chinese (Mandarin)_Radio_Host`(电台男主播·男) 等 28 个。
角色/人设：`clever_boy`、`cute_boy`、`lovely_girl`、`junlang_nanyou`、`badao_shaoye`、`wumei_yujie` 等 14 个。
粤语（6，需 `language_boost:"Chinese,Yue"`）：`Cantonese_GentleLady`、`Cantonese_ProfessionalHost（F)` 等（注意全角括号）。
英文（16）：`English_Trustworthy_Man`、`English_Graceful_Lady`、`Charming_Lady`、`Sweet_Girl` 等。

**端点 / 鉴权 / GroupId：**

| 站点 | TTS 端点 |
|---|---|
| 中国 | `https://api.minimax.cn/v1/t2a_v2`（华北低延迟 `api-bj.minimaxi.com`） |
| 国际 | `https://api.minimax.io/v1/t2a_v2`（美西 `api-uw.minimax.io`） |
| 旧域名 | `api.minimax.chat`(旧中国)/`api.minimaxi.com`(旧国际)，存续待核实 |

头 `Authorization: Bearer $MINIMAX_API_KEY`。**GroupId**：现行 OpenAPI 已无此参数；旧账户需 URL 拼 `?GroupId=<id>`（插件保留兼容，`MINIMAX_GROUP_ID` 为社区惯例变量名）。

**请求 / 响应（音频=hex！）：**

```bash
curl -X POST "https://api.minimax.cn/v1/t2a_v2" \
  -H "Authorization: Bearer ${MINIMAX_API_KEY}" -H "Content-Type: application/json" \
  -d '{ "model":"speech-02-hd", "text":"你好，欢迎参加模拟面试。", "stream":false,
        "voice_setting":{"voice_id":"female-shaonv","speed":1,"vol":1,"pitch":0},
        "audio_setting":{"sample_rate":32000,"bitrate":128000,"format":"mp3","channel":1} }'
```
响应 `data.audio` = **十六进制字符串**（`Buffer.from(hex,'hex')` 解码，别当 base64）；`base_resp.status_code` 业务码：0 成功、1004 鉴权、1008 余额、2013 参数、**2043 模型不支持该 voice**、2054 voice 不存在、**2056 超 M Plan 额度**、2069 模型下线。计费字符看 `extra_info.usage_characters`。
参数：`speed`[0.5,2]、`vol`(0,10]、`pitch`[-12,12]、`emotion`(happy/sad/…/fluent/whisper)、`format`∈mp3/pcm/flac/wav/opus…、`language_boost`、`output_format`∈hex/url(url 仅非流式 24h)。
流式 `stream:true`→SSE hex 分片；另有 WS `wss://api.minimax.cn/ws/v1/t2a_v2`、双向 `..._bidi`；长文本异步 `POST /v1/t2a_async_v2`(≤10 万字符)。

---

## 3. MiMo（小米）

官方文档 `mimo.mi.com/docs`；**静态全文 = `https://mimo.mi.com/static/docs/<同路径>.md?plain=1`**。

**模型 ID（仅 3 个 TTS；v2.6 是文本模型不是语音）：**

| 模型 ID | 定位 | 音色来源 |
|---|---|---|
| `mimo-v2.5-tts` | 预置精品音色，支持唱歌标签`(唱歌)`+低延迟流式 | `audio.voice`=预置 id（默认 `mimo_default`） |
| `mimo-v2.5-tts-voicedesign` | 文本描述设计音色 | **不传 audio.voice**；user 消息=描述（必填） |
| `mimo-v2.5-tts-voiceclone` | 数秒参考音频零样本复刻 | `audio.voice`=参考音频 base64 dataURI（必填） |

**预置音色（仅 mimo-v2.5-tts，官方 9 个）：**

| voice id | 名称 | 语言 | 性别 | 简介 |
|---|---|---|---|---|
| `mimo_default` | 默认 | 随集群 | 随集群 | 中国集群=冰糖，其他=Mia |
| `冰糖` | 冰糖 | 中 | 女 | 清爽 |
| `茉莉` | 茉莉 | 中 | 女 | 轻柔 |
| `苏打` | 苏打 | 中 | 男 | 中性偏年轻 |
| `白桦` | 白桦 | 中 | 男 | 偏沉稳 |
| `Mia` | Mia | 英 | 女 | 海外默认 |
| `Chloe` | Chloe | 英 | 女 | 语速最慢 |
| `Milo` | Milo | 英 | 男 | 语速偏慢 |
| `Dean` | Dean | 英 | 男 | — |

> 音色 id 就是中文字符串本身；写错报 `Unknown voice: X`（报错会列全部可选）。听感简介来自第三方实测，仅供参考。

**端点 / 协议：** `POST https://api.xiaomimimo.com/v1/chat/completions`（**不是 /audio/speech**，后者 404）。
头 `api-key: $MIMO_API_KEY` 或 `Authorization: Bearer`。**目标文本必须放 assistant 消息**；user 放风格指令（voicedesign 必填）。**无语速参数**（speed 被忽略），语速靠指令/标签。

```jsonc
// 预置音色
{ "model":"mimo-v2.5-tts",
  "messages":[ {"role":"user","content":"语速偏快、语气轻松"},
               {"role":"assistant","content":"大家好，欢迎参加今天的模拟面试。"} ],
  "audio":{"voice":"mimo_default","format":"wav"}, "stream":false }
// 响应音频在 choices[0].message.audio.data（base64）
```
```jsonc
// voicedesign：不传 audio.voice，user=描述
{ "model":"mimo-v2.5-tts-voicedesign",
  "messages":[ {"role":"user","content":"20 多岁年轻女性，清亮温柔，语速适中，亲切自信"},
               {"role":"assistant","content":"你好，我是今天的面试官。"} ],
  "audio":{"format":"wav"}, "stream":false }
// voiceclone：audio.voice=参考音频 dataURI（mp3/wav，base64 后 ≤10MB，带 data: 前缀）
{ "model":"mimo-v2.5-tts-voiceclone",
  "messages":[ {"role":"user","content":""}, {"role":"assistant","content":"你好。"} ],
  "audio":{"format":"wav","voice":"data:audio/wav;base64,<...>"}, "stream":false }
```
format ∈ wav/mp3/pcm/pcm16（流式默认 pcm，建议显式 pcm16=24kHz 单声道）；不支持 opus/aac。`audio.transcript` 恒 null（无时间戳）。

**凭据 / 坑：** `MIMO_API_KEY`（官方按量，`sk-`）/ `XIAOMI_TOKEN_PLAN_CN_API_KEY`（Token Plan，`tp-`），**互不通用**（混用 401）。
Token Plan 专属 base `https://token-plan-cn.xiaomimimo.com/v1`（-sgp/-ams 同构）；插件把它单列成
`mimo-token-plan` 预设。官方文档名义上「套餐仅限编程工具用途」，但 Token Plan 端点确实暴露
`mimo-v2.5-asr` / `mimo-v2.5-tts` / `-voiceclone` / `-voicedesign` 四个模型；能不能真调取决于手里套餐，
401 时界面会直接指路「MiMo · API 直连」。
`base_resp.status_code` 官方未记载（插件防御性保留，**待核实**）；更稳是检查 `audio.data` 是否为空+内嵌 error。voiceclone 精确时长官方仅说「数秒」+≤10MB（插件 5–30s 为自定建议）。

---

## 4. 兜底与通用

- **OpenAI 兼容**（插件 `openai`）：`POST {base}/audio/speech`，body `{model,input,voice,response_format}`，响应=音频字节。任何实现该路径的网关可用（SiliconFlow 等）。
- **免密钥**（插件 `baidu`/`edge`）：百度朗读 HTTP / Edge 神经音色 WS（非公开端点，Edge 部分出口 403）。零配置兜底，音质低于模型但可用。
- **浏览器音色**：`speechSynthesis`，永远的最后一步。

## 5. 凭据 ref 对照

| ref | 平台 |
|---|---|
| `DASHSCOPE_API_KEY` | 官方百炼 DashScope |
| `QIANWEN_TOKEN_PLAN_API_KEY` / `QWEN_TOKEN_PLAN_API_KEY` | 千问 Token Plan 中转 |
| `M_PLAN_API_KEY` / `MINIMAX_M_PLAN_API_KEY` | MiniMax Token Plan（M Plan） |
| `MINIMAX_API_KEY` | MiniMax 按量 |
| `MINIMAX_GROUP_ID` | MiniMax 旧账户 GroupId（社区惯例） |
| `MIMO_API_KEY` | MiMo 官方按量 |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | 小米 MiMo Token Plan（中转） |
| `OPENAI_API_KEY` / `SILICONFLOW_API_KEY` | OpenAI / SiliconFlow 兼容 |

> 密钥只进宿主 `ctx.credentials`，不进插件配置文件（见 VOICE.md）。
