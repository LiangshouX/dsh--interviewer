# VOICE-ASR.md — 语音识别（ASR）模型速查

> 目的：**接入不用再去翻官方文档**。汇总 Qwen / MiniMax / MiMo 及通用 ASR 的模型 ID、
> 端点、协议、请求/响应形状与坑。插件侧链路/凭据/测试语义见 [VOICE.md](VOICE.md)；
> TTS 见 [VOICE-TTS.md](VOICE-TTS.md)；未实现能力（实时 ASR 等）见 [../ROADMAP.md](../ROADMAP.md)。
>
> 调研日期：2026-11-18。官方会更新，**以官方为准**；「待核实」= 官方未明确或第三方实测。

---

## 0. 一张表先看全

| 来源 | 插件预设/链路 | 协议 | 端点 | 凭据 ref | 模型举例 |
|---|---|---|---|---|---|
| 宿主本地 SenseVoice | `host`（默认） | 宿主 `speechToText`（整段转写） | 本机模型，无网络 | 无 | SenseVoiceSmall(INT8) |
| Qwen3-ASR | （未接，ROADMAP 4.2） | **OpenAI 兼容 `chat/completions`+`input_audio`** 或 DashScope 原生 | `{WorkspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` | `qwen3-asr-flash` |
| Qwen-Audio-ASR | （未接） | DashScope 原生 multimodal-generation / WS duplex | 百炼 | `DASHSCOPE_API_KEY` | `qwen-audio-3.1-asr-flash` |
| MiniMax | `minimax`/`minimax-cn` | HTTP **multipart** `/v1/speech_to_text` | `https://api.minimax.cn/v1/speech_to_text` | `MINIMAX_API_KEY` | `asr-1.0` |
| MiMo | （未接） | HTTP `chat/completions`+`input_audio` | `https://api.xiaomimimo.com/v1` | `MIMO_API_KEY` | `mimo-v2.5-asr` |
| OpenAI 兼容网关 | `openai`/`openai-custom` | HTTP multipart `/audio/transcriptions` | 任意兼容网关 | `OPENAI_API_KEY`/`SILICONFLOW_API_KEY` | `whisper-1`/`FunAudioLLM/SenseVoiceSmall` |
| Paraformer/SenseVoice/Fun-ASR | （未接） | DashScope 异步 transcription / WS duplex | 百炼（Paraformer 仅北京） | `DASHSCOPE_API_KEY` | `paraformer-realtime-v2` |

**最重要的坑：Qwen ASR 的 OpenAI 兼容走 `chat/completions`+`input_audio`，不是 `/audio/transcriptions`。**
百炼官方**没有** `/compatible-mode/v1/audio/transcriptions` 端点；第三方 Token Plan 中转实测该路径 404。
把 Qwen ASR 当标准 OpenAI transcriptions 接会失败——要么走 `chat/completions`，要么走 DashScope 原生。

---

## 1. 宿主本地 SenseVoice（插件默认，零配置）

- 走宿主 `ctx.speechToText`（本 DSH 组成里为 `@deepseek-ai/dsh-experimental-speech-to-text-sensevoice`，
  模型 SenseVoiceSmall INT8 本机推理）。**整段转写、无流式**；准实时靠客户端按静音分段（≤6s）。
- 无需 API key、不出网。首次需「准备语音模型」（下载）。识别失败回落浏览器/键盘，不阻塞面试。
- 与 DashScope 的 `sensevoice-v1` **API 模型不是一回事**（一个是本机推理、一个是云端 API）。

## 2. Qwen / 百炼 ASR

三条线：**Qwen3-ASR**（`qwen3-asr-flash*`）、**Qwen-Audio-ASR**（`qwen-audio-3.0/3.1-asr-flash*`，"百聆"）、
**FunAudioLLM 系**（Paraformer/SenseVoice/Fun-ASR，非 Qwen，见 §6）。

### 2.1 模型总览

| 模型 ID | 定位 | 实时性 | 上限 | 协议 |
|---|---|---|---|---|
| `qwen3-asr-flash` | LLM 基座多语种 ASR，自动语种+情感识别，支持上下文 | 非实时同步 | ≤5min/≤10MB | OpenAI 兼容 chat/completions；DashScope 同步 |
| `qwen3-asr-flash-filetrans` | 长音频异步转写，句/字级时间戳、多音轨 | 异步 | ≤12h/≤2GB | 仅 DashScope 异步 transcription |
| `qwen3-asr-flash-realtime` | 实时流式，服务端 VAD/手动断句，**无时间戳** | 实时 | — | WS `/api-ws/v1/realtime`（OpenAI Realtime 风格） |
| `qwen-audio-3.0-asr-flash` | 百聆：30 语种、汉语七大方言+口音、古诗词优化 | 非实时同步 | ≤5min/≤2GB | DashScope 原生 multimodal-generation |
| `qwen-audio-3.1-asr-flash` | 3.0 升级：59 语种、文本润色、说话人分离 | 非实时同步 | ≤5min/≤2GB | 同上 |
| `qwen-audio-3.0/3.1-asr-flash-filetrans` | 长音频异步，时间戳固定开、说话人分离 | 异步 | ≤12h/≤2GB | DashScope 异步 transcription |
| `qwen-audio-3.0/3.1-asr-flash-streaming` | 持续转写（会议/字幕），中间+最终结果 | 实时 | 不限 | WS `/api-ws/v1/inference`（duplex） |
| `qwen-audio-3.1-asr-flash-message` | 短段语音（输入法/语音消息），仅 16kHz | 实时 | — | 同上 |

语言：qwen3 系 27 语种（zh 含普通话/四川/闽南/吴、yue、en、ja、ko、de、fr、ru、pt、ar、it、es、hi、id、th、tr、uk、vi、cs、da、fil、fi、is、ms、no、pl、sv）；qwen-audio 系 30/59 语种。
地域：Qwen 系北京+新加坡（美国弗吉尼亚仅 qwen3-asr-flash）；**Paraformer 全系仅北京**。

### 2.2 qwen3-asr-flash — OpenAI 兼容（推荐复用 OpenAI SDK）

`POST https://{WorkspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1/chat/completions`
（北京旧域名 `dashscope.aliyuncs.com/compatible-mode/v1` 仍可用；新加坡 `dashscope-intl` / `{WorkspaceId}.ap-southeast-1`）。

```bash
curl -X POST 'https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions' \
 -H "Authorization: Bearer $DASHSCOPE_API_KEY" -H "Content-Type: application/json" \
 -d '{ "model":"qwen3-asr-flash",
       "messages":[{"role":"user","content":[
         {"type":"input_audio","input_audio":{"data":"{YOUR_AUDIO_URL}"}}]}],
       "stream":false, "asr_options":{"enable_itn":false} }'
```
- 本地音频：`data` 传 `data:audio/wav;base64,<...>`（编码后仍 ≤10MB）；不支持本地路径。
- `asr_options` 非 OpenAI 标准：Python SDK 放 `extra_body`、Node SDK 放顶层。`language` 单值（混合语种勿设）；`enable_itn` 默认 false（仅中英）。
- 可选 system message 放上下文（背景文本/实体词表），不支持角色提示词。
- **返回文本**：非流式 `choices[0].message.content`(字符串)；流式拼 `choices[].delta.content`。
  语种/情感在 `choices[].message.annotations[]`（`type:"audio_info"`，`language`、`emotion`∈neutral/happy/sad/angry/fearful/surprised/disgusted，情感固定开）。**此路径无时间戳**。

### 2.3 qwen3-asr-flash — DashScope 原生同步

`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
body `{model, input:{messages:[{role:user,content:[{audio:"<URL>"}]}]}, parameters:{asr_options:{...}}}`；`X-DashScope-SSE: enable` 可流式。
**返回文本** `output.choices[0].message.content[0].text`；`usage.seconds`=音频秒数。

### 2.4 长音频异步（filetrans / paraformer-v2 / sensevoice-v1 同端点族）

```bash
# 提交（X-DashScope-Async 必带；新域名下 parameters 必带哪怕 {}）
curl -X POST 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription' \
 -H "Authorization: Bearer $DASHSCOPE_API_KEY" -H "Content-Type: application/json" \
 -H "X-DashScope-Async: enable" \
 -d '{ "model":"qwen3-asr-flash-filetrans", "input":{"file_url":"{YOUR_AUDIO_URL}"},
       "parameters":{"channel_id":[0],"enable_itn":false,"enable_words":true} }'
# → output.task_id / task_status=PENDING
# 轮询
curl 'https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}' -H "Authorization: Bearer $DASHSCOPE_API_KEY"
# SUCCEEDED 后取 transcription_url（24h 内下载）
```
- qwen3-filetrans 用 `input.file_url`(单个)+`language/enable_itn/enable_words/channel_id`；
  paraformer-v2/fun-asr/qwen-audio-filetrans 用 `input.file_urls`(数组)+`language_hints/diarization_enabled/speaker_count/vocabulary_id/...`。
- 结果 JSON：`transcripts[].text`(整段)、`transcripts[].sentences[]`(句级 begin/end_time/text/speaker_id)、`sentences[].words[]`(字/词级)。
- qwen3 系取 `output.result.transcription_url`；paraformer/fun-asr/qwen-audio 系取 `output.results[].transcription_url`。

### 2.5 qwen-audio-3.0/3.1-asr-flash — 同步 multimodal-generation

`POST .../api/v1/services/aigc/multimodal-generation/generation`，
body `{model, input:{messages:[{role:user,content:[{type:"input_audio",input_audio:{data:"<URL>"}}]}]}, parameters:{format:"wav", sample_rate:"16000"}}`。
- `parameters.format` **必填**（与实际音频一致）；可选 `language_hints`(≤4)、`vocabulary`/`vocabulary_id`(热词)、`keep_dialect`、`speaker_diarization_enabled`(仅 3.1)。
- 上下文：按轮次加 user/input_text + assistant/text（各≤5 条、每轮≤400 字符），含 input_audio 的 user 放最后。
- **返回文本** `output.text`(累计)、`output.sentence`(当前句 sentence_end/begin/end_time/words)；说话人分离读 `output.sentences[].speaker_id`。**时间戳固定开**。

### 2.6 实时 WebSocket（两条协议族）

- **`/api-ws/v1/realtime`**（OpenAI Realtime 风格，`qwen3-asr-flash-realtime`）：
  头 `Authorization: Bearer`+`OpenAI-Beta: realtime=v1`；发 `session.update`(modalities:["text"], input_audio_format:pcm, sample_rate:16000, turn_detection:server_vad) → 持续 `input_audio_buffer.append`(base64 PCM16) →（Manual 模式 `input_audio_buffer.commit`）→ **`session.finish` 再关连接**。
  最终文本在 `conversation.item.input_audio_transcription.completed.transcript`；中间在 `.text` 事件。**不发 session.finish 直接关会丢结果**；无时间戳。
- **`/api-ws/v1/inference`**（DashScope duplex，paraformer-realtime-v2 / qwen-audio-streaming/message / fun-asr-realtime）：
  `run-task`(task_group:audio, task:asr, function:recognition, parameters:{format:pcm, sample_rate:16000, language_hints}) → 等 task-started → 二进制音频帧 → `finish-task`。
  结果在 `task-result` 事件 `payload.output.sentence`(text/begin/end_time/words，sentence_end=true 为最终)；中间结果会修订应**替换**非拼接；过滤 heartbeat 空句。

### 2.7 Qwen ASR 坑

- **不是 `/audio/transcriptions`**（见 §0）。Token Plan 中转 compatible-mode 不开音频路径（404）。
- 北京/新加坡 API Key 不通用；WS 鉴权在握手阶段（401/403）。
- `asr_options`(qwen3 系) 与 `language_hints`(qwen-audio/paraformer/fun-asr 系) 是两套参数别混；language 单值 vs language_hints 多值上限各家不同。
- 异步漏带 `X-DashScope-Async` 无法提交；新域名 parameters 必填；transcription_url 24h 过期及时落盘；OSS `oss://` 临时 URL 仅 RESTful 支持（48h/100QPS 勿生产）。
- qwen3-asr-flash 同步/Base64 ≤10MB/5min；要时间戳用 filetrans 或 qwen-audio 系。

## 3. MiniMax ASR

**模型 `asr-1.0`**（枚举唯一）。端点 `POST https://api.minimax.cn/v1/speech_to_text`（国际 `api.minimax.io`）。
协议 **HTTP multipart/form-data**（非 WS；不支持音频流式输入，实时需客户端 VAD 切段+输出流式）。

```bash
curl 'https://api.minimax.cn/v1/speech_to_text' \
 -H "Authorization: Bearer ${MINIMAX_API_KEY}" \
 -F 'model="asr-1.0"' -F 'file=@"/path/audio.mp3"'
# 说话人分离+逐句时间戳：-F 'response_format="verbose_json"'
# 流式输出+指定语种：-H 'language: zh' -F 'stream="true"' --no-buffer
```
- 语种走 **HTTP 头 `language`**(BCP-47)；不传=多语种混合自动（含中英混说）。20 语种。
- 音频 ≤**500 秒**(超 400 不截断)、≤**50MB**(超 413)；格式 wav/aiff/flac/alac(m4a)/mp3/aac/opus/ogg，**不收裸 PCM**；建议单声道 16kHz 或压缩格式。
- `response_format` ∈ json(默认 text+duration)/verbose_json(+n_speakers+segments 逐句时间戳+说话人)/srt/vtt；`stream=true`→SSE 逐段 delta（**仅 json 可流式**）；`timestamp_level=word` 字/词级（仅 verbose/srt/vtt）。
- **错误体系=OpenAI 风格 HTTP 状态码**（400/401/402/413/422/429/500），体 `{"type":"error","error":{type,message,http_code},"request_id"}`。**别按 TTS 的 base_resp 解析 ASR 错误**。
- 计费按音频时长（响应 `duration` 秒）。

## 4. MiMo ASR

**模型 `mimo-v2.5-asr`**（唯一；无 `mimo-asr`）。端点 `POST https://api.xiaomimimo.com/v1/chat/completions`（**不是 /audio/transcriptions**）。
音频作为 user 消息的 `input_audio` 内容部分；与 MiMo TTS 共用端点但**消息形状完全不同**（ASR user content 是数组）。

```jsonc
{ "model":"mimo-v2.5-asr",
  "messages":[{"role":"user","content":[
    {"type":"input_audio","input_audio":{"data":"data:audio/wav;base64,<...>"}}]}],
  "asr_options":{"language":"zh"}, "stream":false }
// 纯 base64 不带前缀时 input_audio:{data:"<b64>", format:"wav"}，format 必填
```
- 音频仅 wav/mp3（官方口径；第三方报错暗示接受面或更宽，待核实），base64 后 ≤10MB，单条。
- `asr_options.language` ∈ auto(默认)/zh/en；确定语言建议手动指定。中英双语+自动检测，原生粤语/吴语/闽南/四川等方言，自动加标点。
- **返回文本** `choices[0].message.content`；`usage.seconds`=音频秒、`prompt_tokens_details.audio_tokens`。**无时间戳**。流式 `stream:true`→`delta.content`。
- 凭据同 MiMo TTS：`sk-` 官方 / `tp-` Token Plan 不通用；Token Plan 禁非 Coding 后端调用。

## 5. OpenAI 兼容 `/audio/transcriptions`（通用网关）

插件 `openai`/`openai-custom` 预设走标准 `POST {base}/audio/transcriptions`（multipart `file`+`model`，可选 `language`）。
适用于**真正实现该路径的网关**（如 SiliconFlow `FunAudioLLM/SenseVoiceSmall`、官方 OpenAI `whisper-1`）。
**注意：百炼 Qwen ASR 与 MiMo ASR 都不走这条**（见 §2/§4）；只有标准 OpenAI 兼容网关才认。

## 6. Paraformer / SenseVoice / Fun-ASR（DashScope，非 Qwen 系，作对照）

| 模型 ID | 定位 | 实时性 | 协议 |
|---|---|---|---|
| `paraformer-v2` / `paraformer-8k-v2` | 性价比录音文件转写，热词/说话人分离/时间戳校准 | 异步 | DashScope 异步 transcription，**仅北京** |
| `paraformer-realtime-v2` / `-8k-v2` | 实时流式，任意采样率，语义/VAD 断句可切 | 实时 | WS `/api-ws/v1/inference` duplex，**仅北京** |
| `sensevoice-v1` | 50+ 语种+情感+音频事件富信息 | 异步 | 旧异步 transcription（新版概述页已不列，官方 demo 仍在用，待核实） |
| `fun-asr` / `fun-asr-flash-*` | Paraformer/SenseVoice 后继统一品牌 | 异步/同步 | 异步 transcription / 同步 SSE |
| `fun-asr-realtime` / `-8k-realtime` | Fun-ASR 实时 | 实时 | WS `/api-ws/v1/inference` |

协议形状同 §2.4（异步）/§2.6（duplex WS）。来源：[Paraformer 非实时 HTTP](https://help.aliyun.com/zh/model-studio/paraformer-recorded-speech-recognition-restful-api)、[Paraformer WS](https://help.aliyun.com/zh/model-studio/websocket-for-paraformer-real-time-service)、[Fun-ASR HTTP](https://help.aliyun.com/zh/model-studio/fun-asr-recorded-speech-recognition-http-api)。

## 7. 凭据与错误速查

| ref | 平台 |
|---|---|
| `DASHSCOPE_API_KEY` | 官方百炼（北京/新加坡 key 不通用） |
| `QIANWEN_TOKEN_PLAN_API_KEY` | 千问 Token Plan 中转（compatible-mode 不开音频路径） |
| `MINIMAX_API_KEY` | MiniMax（TTS/ASR 共用） |
| `MIMO_API_KEY` | MiMo 官方按量（TTS/ASR 共用） |
| `OPENAI_API_KEY`/`SILICONFLOW_API_KEY` | 标准 OpenAI 兼容 transcriptions 网关 |

错误解析三家不同：**Qwen**=HTTP 状态+响应 code/message（DashScope）或 OpenAI 风格；**MiniMax ASR**=OpenAI 风格 HTTP 状态（别用 base_resp）；**MiMo**=HTTP 状态+内嵌 error（base_resp 待核实）。
插件侧统一「失败带 reason+hint、回落浏览器/键盘不阻塞面试」（VOICE.md）。
