import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deviceSelector, locateFfmpeg, parseDeviceList } from '../src/host/camera.js'

/**
 * ffmpeg 的 `-list_devices` 输出长这样（stderr）：
 *
 * ```
 * [dshow @ 000002472ff5a440] "XiaoMi USB 2.0 Webcam" (video)
 * [dshow @ 000002472ff5a440]   Alternative name "@device_pnp_\\?\usb#..."
 * [dshow @ 000002472ff5a440] "麦克风阵列 (适用于数字麦克风的英特尔® 智音技术)" (audio)
 * [dshow @ 000002472ff5a440]   Alternative name "@device_cm_{...}"
 * ```
 */
const SAMPLE = `
[dshow @ 000002472ff5a440] "XiaoMi USB 2.0 Webcam" (video)
[dshow @ 000002472ff5a440]   Alternative name "@device_pnp_\\\\?\\usb#vid_2b7e&pid_c640#global"
[dshow @ 000002472ff5a440] "麦克风阵列 (适用于数字麦克风的英特尔® 智音技术)" (audio)
[dshow @ 000002472ff5a440]   Alternative name "@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}"
[dshow @ 000002472ff5a440]   Alternative name "@device_wave_{87356374-D4F0-47C4-BB49-97827E009E7A}"
`

test('设备列表解析：分出视频与音频', () => {
  const { video, audio } = parseDeviceList(SAMPLE)
  assert.equal(video.length, 1)
  assert.equal(audio.length, 1)
  assert.equal(video[0].name, 'XiaoMi USB 2.0 Webcam')
  assert.equal(audio[0].name, '麦克风阵列 (适用于数字麦克风的英特尔® 智音技术)')
})

test('设备列表解析：带上替代名（没有空格的稳定路径）', () => {
  const { video, audio } = parseDeviceList(SAMPLE)
  // 样例里的 `\\\\` 在 JS 字符串里是**两个**反斜杠——ffmpeg 打印的就是两个。
  assert.equal(video[0].alt, '@device_pnp_\\\\?\\usb#vid_2b7e&pid_c640#global')
  // 音频设备有两个替代名——取第一个就够。
  assert.equal(audio[0].alt, '@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}')
})

test('设备选择器：优先用替代名', () => {
  // **为什么优先替代名。** 显示名里有空格和中文，经过 shell 会被拆开，
  // 于是报一个莫名其妙的「找不到设备」。替代名是设备路径，没有空格。
  const selector = deviceSelector({ name: 'XiaoMi USB 2.0 Webcam', alt: '@device_pnp_\\?\\usb#x' })
  assert.equal(selector, 'video=@device_pnp_\\?\\usb#x')
  assert.equal(selector.includes(' '), false)
})

test('设备选择器：没有替代名时退回显示名', () => {
  const selector = deviceSelector({ name: '普通摄像头', alt: '' })
  assert.equal(selector, 'video=普通摄像头')
})

test('设备列表解析：空输入不炸', () => {
  const { video, audio } = parseDeviceList('')
  assert.deepEqual(video, [])
  assert.deepEqual(audio, [])
  assert.deepEqual(parseDeviceList(undefined).video, [])
})

test('ffmpeg 定位：配置里的路径优先', async () => {
  // 指向一个真实存在的东西——本机的 ffmpeg 在 PATH 上，但显式路径必须赢。
  const found = await locateFfmpeg({ ffmpegPath: 'ffmpeg' })
  if (found !== undefined) {
    assert.equal(found.source, 'config')
    assert.equal(found.path, 'ffmpeg')
  }
})

test('ffmpeg 定位：路径不存在时如实返回「没有」，不假装有', async () => {
  // **这是「机器没装 ffmpeg」那条降级路径的核心。**
  // 找不到就返回 undefined，让界面说「这台机器上没有摄像头采集程序」，
  // 而不是假装摄像头坏了、或者让用户去系统设置里白找。
  const found = await locateFfmpeg({ ffmpegPath: 'definitely-not-a-real-ffmpeg-binary-xyz' })
  assert.equal(found, undefined)
})

// ── 摄像头打不开时的"人话"翻译 ────────────────────────────────────────────

test('明确说"被占用"时，才说占用', async () => {
  const { explainCameraFailure } = await import('../src/host/camera.js')
  const explained = explainCameraFailure('Could not run graph (sometimes caused by a device already in use by other application)')
  assert.match(explained.reason, /占用/)
  assert.match(explained.hint, /微信|Chrome/)
})

test('绑定/激活失败（I/O error）不能说成"被占用"——实测可能是系统打不开', async () => {
  const { explainCameraFailure } = await import('../src/host/camera.js')
  for (const detail of [
    '[dshow @ 000] Unable to BindToObject for BisonCam,NB Pro',
    '[in#0 @ 000] Error opening input: I/O error',
  ]) {
    const explained = explainCameraFailure(detail)
    assert.match(explained.reason, /系统打不开/)
    assert.doesNotMatch(explained.reason, /占用/)
    assert.match(explained.hint, /物理开关|设备管理器/)
  }
})

test('设备名对不上与权限拒绝：给出不同的处理办法', async () => {
  const { explainCameraFailure } = await import('../src/host/camera.js')
  const missing = explainCameraFailure('Could not find video device with name [X] among source devices of type video')
  assert.match(missing.reason, /设备名/)
  assert.match(missing.hint, /重新/)
  const denied = explainCameraFailure('Access is denied')
  assert.match(denied.reason, /拒绝/)
  assert.match(denied.hint, /隐私/)
})

test('不认识的报错保留原文，不编造原因', async () => {
  const { explainCameraFailure } = await import('../src/host/camera.js')
  const explained = explainCameraFailure('something weird happened')
  assert.equal(explained.reason, 'something weird happened')
  assert.ok(explained.hint.length > 0)
})
