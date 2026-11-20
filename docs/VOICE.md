# VOICE.md — 语音配置闭环（配 → 存 → 测 → 用）

> **这份文件管插件侧**：预设表（唯一真源）、凭据规则、回落链、测试与失败语义。
> 界面契约在 [DESIGN.md §9](DESIGN.md)；**厂商侧**（全部可用模型、音色、协议细节、
> 官方文档链接）在 [VOICE-ASR.md](VOICE-ASR.md) 与 [VOICE-TTS.md](VOICE-TTS.md)——
> 接入不用再去翻官方文档。

**目录**：§1 四条腿 · §2 宿主事实 · §3 预设与协议 · §4 凭据发现规则 ·
§5 安全边界 · §6 测试语义 · §7 失败语义 · §8 不做什么

---

## 1. 结论先写

不依赖宿主模型是对的，但这条路要算走通，必须四条腿都在界面里看得见：

| 腿 | 现在怎么走 | 在哪 |
|---|---|---|
| **配** | 设置页「语音识别 / 语音播报」两区：服务下拉、端点、模型、语言/音色、凭据 | `src/client/81-settings.js` |
| **存** | 密钥写宿主 `ctx.credentials.set(ref, value)`，**不写插件设置文件** | `src/host/voice/credentials.js` |
| **测** | `POST voice/test`：播报合成一句固定短句；识别录 2 秒真音频走完整回落链 | `InterviewService.testVoice` |
| **用** | `describeAsr` / `describeTts` 是唯一判定；面板与 agent 读同一份 | `src/host/voice/asr.js` / `tts.js` |

界面只显示「已配置 / 未配置 + 来源」，**密钥值不出现在任何响应、错误、
日志或设置文件里**。

### 1.1 接口

| 方法 | 路径 | 语义 |
|---|---|---|
| `GET` | `voice/presets` | `{presets:[{kind,id,group,groupLabel,vendor,label,protocol,protocolLabel,baseUrl,model,models,voice,apiKeyEnv,keyless,locked,notes}]}`，设置页服务下拉的唯一来源 |
| `GET` | `voice/credentials` | `{credentials:[{ref,configured,source,writable}]}`，只有名字与状态 |
| `POST` | `voice/credentials` | `{action:'set', ref, value}` 或 `{action:'clear', ref}`；响应只有 `ref` 与状态，**没有 value** |
| `POST` | `voice/test` | `{kind:'tts'}` 或 `{kind:'asr', dataBase64, mimeType}`；真跑链路，失败带 `reason` + `hint` |

设置快照（`GET settings`）里也带同一份 `presets` / `credentials` 与整条
`voice` 状态，设置页一次轮询就能把「现在用、能选什么、配没配」全画出来。

---

## 2. 已从装机包读实的事实（别再猜）

| 事实 | 后果 |
|---|---|
| `ctx.credentials` 由 `@deepseek-ai/dsh-credentials-local` 实现：`resolve` / `describe` / `set` / `unset` / `readRecord` / `listRecords` / `modifyRecord` / `deleteRecord` | 插件只用 `resolve/describe/set/unset`；`listRecords` 只取 ref 名 |
| `set()` 写 `<DSH_HOME>/.credentials.yaml` 的 `refs:` 段，0600、热重载、写完立刻生效 | 写进宿主后**无需重启**；环境变量那条路才需要重启 |
| 空字符串会被 `set()` 拒绝 | 要删除必须 `unset()`；UI 里「清除」是独立动作 |
| ref 必须匹配 `/^[A-Za-z_][A-Za-z0-9_]*$/` | 插件在 seam 之前先校验，非法名不进 YAML |
| `ctx.llm.listProviders()` 只返回 `{id,name}` | 没有 baseUrl / apiKey / apiKeyEnv；「继承宿主聊天 provider 当语音端点」**不成立** |
| 宿主**没有** TTS 服务；ASR 服务（`ctx.speechToText`）在本 DSH 组成里没启用 | 播报走插件自己的 HTTP 链路或免密钥自然音；识别回落浏览器 |
| DSH profile 的 `cordis.patch.yml` 里 `*.apiKeyEnv` 是凭据引用名 | 这是「可继承」的唯一干净形状：同名的 `credentials.resolve()` 能取到值 |

---

## 3. 预设与协议（插件侧的唯一真源）

预设表在 `src/host/voice/presets.js`，**设置页下拉、配置校验（`paths.js` 的枚举）
都只从这里派生**，前端不硬编码 provider。每项带
`{kind,id,group,label,protocol,baseUrl,model,models,voice,apiKeyEnv,keyless,locked,notes}`；
`notes` 是悬停一句话，`keyless` 决定要不要凭据行，`locked` 是「端点/协议/模型固定」。

**排列顺序是产品顺序，也是下拉顺序：**

```
控制（自动 / 宿主 / 关闭）
→ 预设供应商：Qwen、MiMo、MiniMax —— 每家两条：Token Plan / API 直连
→ 任意 OpenAI 协议兼容（自定义端点 / SiliconFlow）
→ 免密钥免费方案（百度朗读 / Edge 神经音色 / 浏览器）
```

**预设供应商是「配好的一对」，不许拼。** Token Plan 的 key 只在自己的中转上有效，
Qwen 中转没有 flash 模型，Qwen/MiMo 的 ASR 都不在 `/audio/transcriptions` 上——
把这些端点暴露成可编辑输入框，只会制造「看起来填对了却一直失败」。
所以 `locked: true` 的预设：端点和模型只读，凭据名由预设决定；要自定义端点请选
「任意 OpenAI 协议兼容」。`asrBaseUrl` / `asrModel` / `asrEndpoint` / `ttsBaseUrl`
这些键只对非 locked 的预设生效。

厂商侧的全部可用模型、每个模型的限制、音色表与官方文档链接，见
[VOICE-ASR.md](VOICE-ASR.md) 与 [VOICE-TTS.md](VOICE-TTS.md)。

### 3.1 语音识别（ASR）

| 预设 id | 协议 | 端点 | 模型 | 默认凭据 |
|---|---|---|---|---|
| `auto` / `host` / `browser` / `none` | 控制项 | — | — | — |
| `qwen-token-plan` | DashScope 原生 `multimodal-generation` | `https://token-plan.maas.qianwenaiapi.com` | `qwen-audio-3.0-asr-flash` | `QIANWEN_TOKEN_PLAN_API_KEY` |
| `qwen` | 同上 | `https://dashscope.aliyuncs.com` | `qwen-audio-3.0-asr-flash` | `DASHSCOPE_API_KEY` |
| `mimo-token-plan` | `chat/completions` + `input_audio` | `https://token-plan-cn.xiaomimimo.com/v1` | `mimo-v2.5-asr` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` |
| `mimo` | 同上 | `https://api.xiaomimimo.com/v1` | `mimo-v2.5-asr` | `MIMO_API_KEY` |
| `minimax-token-plan` | MiniMax `speech_to_text` | `https://api.minimax.cn` | `asr-1.0` | `M_PLAN_API_KEY` |
| `minimax-cn` | 同上 | `https://api.minimax.cn` | `asr-1.0` | `MINIMAX_API_KEY` |
| `openai-custom` | OpenAI 兼容 | **必须自己填** | `whisper-1` | `OPENAI_API_KEY` |
| `openai` | OpenAI 兼容 | `https://api.siliconflow.cn/v1` | `FunAudioLLM/SenseVoiceSmall` | `SILICONFLOW_API_KEY` |

**四套协议，语言位置各不相同**：DashScope 用 `parameters.language_hints`；
MiMo 用 `asr_options.language`；OpenAI 兼容放表单字段 `language`；
MiniMax 放 HTTP 头 `language:`。协议选错通常表现为 404 / 400，错误信息不友好，
所以 `transcribeHttp` 把实际端点、协议、模型、状态码与下一步一起带回来。

`auto` 的候选顺序 = 预设表 `auto: true` 的声明顺序（宿主继承的端点 → 六条预设供应商
→ OpenAI 兼容）。**同一个 `asrApiKey` 明文 key 不会被分发给所有预设供应商**——
否则配了 MiMo 的 key 会先拿 Qwen 的端点撞出 401。

MiniMax 的 `GroupId` 是查询参数（`?GroupId=…`），设置页有独立字段，
也认 `MINIMAX_GROUP_ID` 环境变量；留空就不带。

### 3.2 语音播报（TTS）

| 预设 id | 协议 | 端点 | 默认模型 / 音色 | 凭据 |
|---|---|---|---|---|
| `auto` / `host` / `browser` / `none` | 控制项 | — | — | — |
| `dashscope-token-plan` | tts_v2 WebSocket | `wss://token-plan.maas.qianwenaiapi.com/api-ws/v1/inference` | `qwen-audio-3.0-tts-plus` / `longanlingxin` | `QIANWEN_TOKEN_PLAN_API_KEY` |
| `dashscope` | tts_v2 WebSocket | `wss://dashscope.aliyuncs.com/api-ws/v1/inference` | `qwen-audio-3.0-tts-plus` / `longanlingxin` | `DASHSCOPE_API_KEY` |
| `mimo-token-plan` | `chat/completions` + `audio` | `https://token-plan-cn.xiaomimimo.com/v1` | `mimo-v2.5-tts` / `mimo_default` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` |
| `mimo` | 同上 | `https://api.xiaomimimo.com/v1` | `mimo-v2.5-tts` / `mimo_default` | `MIMO_API_KEY` |
| `minimax-token-plan` | `/v1/t2a_v2` | `https://api.minimax.cn` | `speech-02-hd` / `female-shaonv` | `M_PLAN_API_KEY` |
| `minimax-cn` | `/v1/t2a_v2` | `https://api.minimax.cn` | `speech-02-hd` / `female-shaonv` | `MINIMAX_API_KEY` |
| `openai` | `/audio/speech` | 可自定义（默认 `https://api.openai.com/v1`） | 可自定义 / `alloy` | `OPENAI_API_KEY` |
| `baidu` / `edge` | 免密钥朗读 / WS | 非公开端点 | — | 无 |

`auto` 的顺序就是预设表里的 `auto: true` 声明顺序：
**Qwen → MiMo → MiniMax → OpenAI 兼容 → 百度 → Edge → 浏览器**。
Qwen 的模型只能从该预设声明的 `models` 里选（Token Plan 只有
`qwen-audio-3.0-tts-plus`），音色按模型查 `voices.js`——跨模型混用会报
`InvalidParameter` / `[cosyvoice:]Engine error [411]`。

### 3.3 协议实现的落点

各协议的实现细节在 `src/host/voice/tts/`：

- `dashscope.js`：tts_v2 WebSocket（run-task / continue-task / finish-task + 二进制帧）；
  Token Plan 与官方百炼是**两条端点**，`dashscope` 只连官方，Token Plan 用另一个预设。
- `mimo.js`：目标文本放 **assistant** 消息，音色进 `audio.voice`；
  voicedesign 不能传 `audio.voice`（音色由 user 描述），
  voiceclone 需要 `ttsReferenceAudio` 样本。同时带 `api-key` 与 `Bearer`。
- `openai.js`：JSON `{model,input,voice,response_format}`，响应体就是音频字节；
  网关 200 但回 JSON 错误体时按内容判定为失败。
- `minimax.js`：音频是 **十六进制**（`data.audio`），不是 base64；
  业务错误在 `base_resp.status_code/status_msg`，**HTTP 200 也可能是失败**。
  这两点都必须把业务码与原文带回界面（例如 2056 = Token Plan 用量上限）。
- `baidu.js` / `edge.js`：免密钥兜底。百度实测可用；Edge 在部分网络出口被 WAF 拦成 403。

---

## 4. 凭据发现规则

`discoverCredentials(ctx)` 按可信度合并三个来源，去重后逐个 `describeSecret`：

1. **profile 的 `cordis.patch.yml`** 里所有 `apiKeyEnv:` 名（也认
   `apiKeyEnvName` / `api_key_env`）。profile 目录 = `DSH_PROFILE_DIR`，
   与 `settingsPath()` 同一套优先级；文件不存在/读不了就跳过，**不抛**。
2. 宿主 credentials 存储里 `listRecords()` 的 ref 名（只取 `ref`/`name`/`id`，
   **不读值**）。
3. 常见候选名：`MIMO_API_KEY`、`XIAOMI_TOKEN_PLAN_CN_API_KEY`、`M_PLAN_API_KEY`、
   `MINIMAX_M_PLAN_API_KEY`、`OPENAI_API_KEY`、`MINIMAX_API_KEY`、
   `SILICONFLOW_API_KEY`、`DASHSCOPE_API_KEY`、`QWEN_TOKEN_PLAN_API_KEY`、
   `QIANWEN_TOKEN_PLAN_API_KEY`。

返回 `[{ref, configured, source, writable}]`，**没有值**。已配置的排前面。
`source` 与 `resolveSecret` 的顺序一致：`host`（宿主凭据）优先，
其次 `env`（环境变量），否则 `none`——所以界面上写「已配置」的，
转写/合成时真的取得到。

---

## 5. 安全边界（不可破）

1. **只进不出。** 密钥可以写进宿主凭据存储；任何 HTTP 响应、错误信息、
   日志、单测断言信息里都不得出现值。设置页只显示「已配置 / 未配置 + 来源」。
2. **不写插件设置文件。** `dsh-realtime-interview.json` 的白名单里有
   `asrApiKeyEnv` / `ttsApiKeyEnv`（凭据**名**），没有密钥字段。
3. **没有 seam 就诚实地失败。** 宿主没有 `ctx.credentials` 时，
   `setVoiceCredential` 返回 `{ok:false, reason, hint}`，hint 是
   「在启动 DSH 前设置环境变量 `<REF>`，然后重启 DSH」。**绝不**回落成
   把明文写进本地 JSON。
4. **空串与换行在本地拦下。** 宿主拒空字符串；换行可能是粘贴事故。
   要删除已保存的凭据只有 `clearVoiceCredential`（`unset`）。
5. **出口统一擦除。** `src/host/voice/redact.js` 把已知密钥值替换成 `***`，
   在合成失败、识别失败、写入失败三处调用——网关在错误体里回显 key 是
   现实存在的情况，不能靠「provider 应该不会」来假设。
6. **UI 输入框** `type=password`、`autocomplete=off`，保存成功后立刻清空；
   值不进入表单 state 之外的任何地方。
7. **agent 工具不暴露写入。** 凭据只由人在设置页写入；agent 工具面不接受
   `value`，避免密钥进入对话转录。

---

## 6. 测试语义

`POST voice/test` 的两个分支都**走真实链路**，不 mock：

### `kind = "tts"`

- 文本固定为一句短句（`VOICE_TEST_SENTENCE`），便于听感与耗时对比；
- 成功返回 `{ok:true, mode, provider, label, model, voice, ms, mimeType, audioBase64}`，
  面板拿到音频后**真的播一遍**；
- 如果实际链路是浏览器系统音色（Host 合成不了），面板用
  `speechSynthesis` 真播一句，并明确显示「浏览器系统音色 · 已播放」——
  用户有权知道自己听到的是哪条路；
- 失败返回 `{ok:false, mode, provider, ms, reason, hint}`：reason 含 HTTP 码 /
  超时 / 缺凭据 / 协议不匹配，hint 是下一步能做的事。

### `kind = "asr"`

- 入参 `{dataBase64, mimeType}`。设置页现场录 2 秒，用
  `decodeToMono16k` + `encodeWav` 转成 16 kHz 单声道 WAV 再上传
  （浏览器只能录 webm，而识别服务通常不收 webm）；
- 走 `transcribeAudio` 的完整回落链，返回
  `{ok, mode, text, attempts, ms, provider?, model?, protocol?}`；
  `attempts` 里每项是 `{mode, ok, reason?, hint?}`——谁试过、为什么失败；
- 没有音频时不发请求，直接给「去录 2 秒」或「用键盘输入」的出路。

---

## 7. 失败语义（AGENTS.md §7）

所有失败都是 `{ok:false, reason, hint}`，`hint` 必须是**下一步能做的事**，
不是一个更长的错误。当前实现的对应关系：

| 现象 | reason 里写什么 | hint 里给什么 |
|---|---|---|
| 缺凭据 | 缺哪个 ref（只写名字） | 选已有凭据 / 填一个 / 改用环境变量 + 重启 |
| HTTP 401 / 403 | 状态码 + 服务返回体的前 300 字符（已擦密钥） | **Token Plan 的 key 只在自己的中转有效**；确认凭据名与预设配对 |
| HTTP 404 | 状态码与端点 | 这个预设被改过：OpenAI 兼容是 `/audio/transcriptions`，MiniMax 是 `/v1/speech_to_text`，MiMo 是 `/chat/completions`，Qwen 是 DashScope 原生端点 |
| HTTP 400 | 状态码与返回体 | 音频格式（要 wav/mp3，不要 webm）、模型与端点不配对、参数不支持 |
| 超时 | 具体毫秒数 | 检查网络/代理；换一条兜底链路 |
| 200 但无音频/文字 | 缺的字段 | 换模型 / 检查额度 / 先用键盘 |
| MiniMax 业务码 | `base_resp.status_code` + `status_msg` 原文（如 2056 用量上限） | 升级套餐 / 换 Qwen、MiMo、OpenAI 兼容 |
| MiMo 401 | HTTP 401 | **Token Plan 的 tp- key 打官方端点必 401**；要官方音频用官方按量 key |
| 写凭据没有 seam | 宿主不提供 `ctx.credentials` | 环境变量 + 重启 DSH；插件设置文件里从来没存过密钥 |

---

## 8. 不做什么

- 不把宿主的聊天 provider 当语音端点（宿主没给 baseUrl）；
- 不让「预设供应商」的端点/模型可编辑——Token Plan 与官方主机、key、模型是成对的，
  可编辑只会制造「看起来填对了却一直失败」；要自定义端点选「OpenAI 兼容」；
- 不静默换链路：每次转写带 `attempts`，每次播报回落都说 `reason`；
- 不把密钥写进插件设置文件，也不在 agent 工具面提供写入入口；
- 不做流式：宿主的识别是整段转写，「准实时」靠客户端按静音切段。
