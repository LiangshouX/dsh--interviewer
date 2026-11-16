/**
 * 语音识别入口（兼容层）。
 *
 * 实现已经搬进 `voice/`：宿主优先的编排在 `voice/asr.js`，插件自己的
 * HTTP 链路在 `voice/http-asr.js`，宿主 `speechToText` 的适配在
 * `voice/host-asr.js`。
 *
 * **为什么还留这个文件。** 它是插件的公开面：`api.js`、旧测试与
 * 别人写的脚本都从 `src/host/asr.js` 取 `resolveAsrConfig` / `transcribe`。
 * 删掉它等于把一次内部重构变成一次破坏性变更。新代码请直接用
 * `voice/asr.js`（`describeAsr` / `transcribeAudio`）。
 *
 * `resolveAsrConfig` 现在的语义是「**插件自己的 HTTP 链路**会怎么走」，
 * 而且**不含密钥**；要问"整条链路现在用哪个"，用 `describeAsr`。
 */
export {
  describeHttpAsr as resolveAsrConfig,
  describeHttpAsr,
  resolveHttpAsr,
  transcribeHttp as transcribe,
  transcribeHttp,
  endpointFor,
  joinEndpoint,
  pickProtocol,
  stripVersionSegment,
} from './voice/http-asr.js'

export { describeAsr, transcribeAudio, ASR_MODE } from './voice/asr.js'
