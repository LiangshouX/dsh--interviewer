/**
 * 面试官形象切换：**当场生效**，不必退出重进。
 *
 * 根因（这一版修的 bug）
 * ---------------------
 * 面板手里那份「有效配置」是**启动时取一次**的（`config` 端点不轮询——它很少变，
 * 跟着 6 秒轮询只是白烧 CPU）。而设置页存完之后只刷新了**自己的**快照，
 * 没人告诉面板「你的有效配置变了」。于是：
 *
 *   设置页存了新的面试官形象 → 面板的 `config.interviewerStyle` 还是旧的
 *   → 舞台上的脸纹丝不动 → 退出面试间重进（面板重新挂载 → 配置重取）才换过来。
 *
 * 这一份钉住三件事：
 *   ① **设置页存完，面板立刻重读有效配置**（原来缺的那一声）；
 *   ② **谁改了都算数**：配置在面板背后被改掉（agent 工具 / 手改配置文件），
 *      切进「面试中」也要跟上——所以刷新挂在「切进面试中」上，而不是某个按钮上；
 *   ③ **形象层真的换了**：换 id 时旧的那份要拆掉、新的那份按新 id 重建
 *      （在**同一个 canvas** 上——WebGL 上下文是按 canvas 记的）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { assembleClient } from '../scripts/build-client.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const require_ = createRequire(import.meta.url)

/** react / react-test-renderer 是开发期依赖：没装就跳过，别让整份测试红掉。 */
let React
let TestRenderer
try {
  React = require_('react')
  TestRenderer = require_('react-test-renderer')
} catch {
  React = undefined
}
const SKIP = React === undefined ? '没装 react / react-test-renderer' : false

if (React !== undefined) {
  // React 18 的 act 需要这个标志，否则会挂起等待。
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}
const h = React?.createElement
const act = TestRenderer?.act
const create = TestRenderer?.create

const AVATAR_A = 'interviewer-a'
const AVATAR_B = 'interviewer-b'

// ── 宿主那边的一份状态 ─────────────────────────────────────────────
//
// 面板读到的所有东西都从这里来。测试要做的只是**在面板背后改它**，
// 模拟「agent 工具改了设置」或「有人手改了配置文件」。

/** 新建一份「宿主状态」。 */
function makeHost() {
  return {
    /** 现在生效的形象 id。 */
    style: AVATAR_A,
    /** 'on' | 'off'——舞台上挂不挂那张脸。 */
    avatar: 'on',
    /** 面板发过来的每一次 POST（设置保存）。 */
    posts: [],
    /** 面板读 `config` 的次数——用来证明「保存之后确实重读了」。 */
    configReads: 0,
  }
}

/** `GET /config` 的响应：面板的「有效配置」。 */
function configPayload(host) {
  return {
    asrProvider: 'auto',
    ttsProvider: 'none',
    ttsRate: 1,
    ttsVoice: '',
    recordVideo: true,
    recordAudio: true,
    guardEnabled: true,
    cameraBackend: 'auto',
    answerMode: 'manual',
    turnEndSilenceMs: 2000,
    interviewerAvatar: host.avatar,
    interviewerStyle: host.style,
    interviewerAvatars: avatarList(),
    workspaceRoot: { path: '/tmp/iv-root', source: 'config', reason: '测试桩' },
    jdFetchTimeoutMs: 8000,
  }
}

/** 包里有的两份形象。 */
function avatarList() {
  return [
    { id: AVATAR_A, name: '形象甲' },
    { id: AVATAR_B, name: '形象乙' },
  ]
}

/** `GET /settings` 的响应：设置页的快照。 */
function settingsPayload(host) {
  const common = {
    asrProvider: 'auto',
    ttsProvider: 'none',
    ttsRate: 1,
    ttsVoice: '',
    ttsFormat: 'mp3',
    recordVideo: true,
    recordAudio: true,
    guardEnabled: true,
    cameraBackend: 'auto',
    answerMode: 'manual',
    turnEndSilenceMs: 2000,
    interviewerAvatar: host.avatar,
    interviewerStyle: host.style,
  }
  return {
    settings: { ...common },
    effective: { ...common },
    avatar: { selected: host.style, avatars: avatarList() },
    dataRoot: { path: '/tmp/iv-root', source: 'config', reason: '测试桩' },
    sessionsDir: '/tmp/iv-root/sessions',
    profilesDir: '/tmp/iv-root/profiles',
    settingsFile: '/tmp/iv-root/settings.json',
    hostWorkspace: { path: '/tmp/host' },
    wsreg: { registered: false },
    voices: { models: {}, providers: {} },
    presets: [],
    credentials: [],
    voice: { asr: {}, tts: {} },
    camera: {},
    backends: {},
    speechModel: {},
    explicit: [],
    locked: [],
  }
}

/** `GET /sessions/<id>` 的响应：一场进行中的面试。 */
function sessionPayload() {
  return {
    session: {
      id: 'iv-test',
      title: '形象切换场',
      company: '测试公司',
      position: '后端工程师',
      role: 'candidate',
      status: 'running',
      createdAt: 1,
      startedAt: 2,
      endedAt: 0,
      updatedAt: 3,
      profileId: '',
      dir: '/tmp/iv-test',
    },
    revision: 'r1',
    checklist: { version: 2, items: [], adjustments: [] },
    transcript: [],
    transcriptTotal: 0,
    transcriptTruncated: false,
    documents: { resumeChars: 0, jdChars: 0, jdUrl: '', jdSections: {}, jdWarnings: [] },
    recordings: [],
    report: '',
    stats: { asked: 0, answered: 0, durationMs: 0, checklistTotal: 0, checklistProbed: 0, adjustments: 0 },
  }
}

/**
 * 一个假的 `fetch`。
 *
 * **它就是那台「宿主」**：面板往哪儿问，它就答什么；面板 POST 设置，
 * 它就把设置存下来（于是下一次读 `config` 就是新值）。
 */
function makeFetch(host) {
  return async (url, options = {}) => {
    const target = String(url)
    const method = String(options?.method ?? 'GET').toUpperCase()
    const json = data => ({ ok: true, json: async () => ({ ok: true, data }) })

    if (method === 'POST') {
      let payload = {}
      try { payload = JSON.parse(String(options?.body ?? '{}')) } catch { /* 忽略 */ }
      host.posts.push({ resource: target.replace('/interviewer/api/', ''), payload })
      // 存下来：设置页改的每一项都在这儿生效。
      if (typeof payload.interviewerStyle === 'string' && payload.interviewerStyle !== '') {
        host.style = payload.interviewerStyle
      }
      if (typeof payload.interviewerAvatar === 'string') host.avatar = payload.interviewerAvatar
      return json({ invalid: [], ignored: [] })
    }

    if (target.includes('/avatar/asset/')) {
      return json({ format: 'mesh-avatar', version: 1, name: '测试形象' })
    }
    if (target.includes('/config')) {
      host.configReads += 1
      return json(configPayload(host))
    }
    if (target.includes('/settings')) return json(settingsPayload(host))
    if (target.includes('/documents')) return json({ resume: '', jd: '', jdMeta: {} })
    if (target.endsWith('/sessions')) return json({ sessions: [sessionPayload().session] })
    if (target.includes('/sessions/')) return json(sessionPayload())
    if (target.includes('/profiles')) return json({ profiles: [] })
    if (target.includes('/resumes')) return json({ resumes: [] })
    if (target.includes('/voice')) return json({ asr: { provider: 'browser' }, tts: { provider: 'none' } })
    return json(sessionPayload())
  }
}

/**
 * 装起面板（用**源码**拼出来的 client bundle）。
 *
 * 用 `assembleClient()` 而不是读 `client.js`：测的是源码，不是上次构建的产物。
 */
async function mountPanel(host) {
  const source = await assembleClient()
  let main
  const windowStub = {
    __ModuleLoader__: {
      load(definition) {
        const module = definition.factory(name => {
          if (name === 'react') return React
          throw new Error(`avatar-switch: 未预期的模块 ${name}`)
        })
        module.apply({
          effect: () => () => {},
          locale: { register: () => () => {}, bind: () => key => key },
          slots: {
            register(spec, component) {
              if (spec?.name === 'main') main = component
              return () => {}
            },
            inject(name, factory) {
              const disposer = factory()
              return () => { if (typeof disposer === 'function') disposer() }
            },
          },
        })
      },
    },
  }
  const sandbox = {
    window: windowStub,
    console,
    fetch: makeFetch(host),
    navigator: {},
    // vm 上下文里没有 Web API 的全局（`apiGet` 拼查询串要用 URLSearchParams）。
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  }
  runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.equal(typeof main, 'function', 'client bundle 没有注册 main 槽')
  const renderer = create(h(main))
  return renderer
}

/** 让挂起的 promise 与定时器都跑完（等待放在 act 里面，避免 act 挂住）。 */
async function flush(ms = 0) {
  await act(async () => {
    await new Promise(done => setTimeout(done, ms))
  })
}

/** 按文案找页签（认 role='tab'，别按圆角或类名找——那些会变）。 */
function findTab(renderer, label) {
  return renderer.root.findAll(node => node.props?.role === 'tab' && node.props?.children === label)[0]
}

/** 点一个页签。 */
async function clickTab(renderer, label) {
  const tab = findTab(renderer, label)
  assert.ok(tab !== undefined, `找不到页签「${label}」`)
  await act(async () => { tab.props.onClick() })
}

/** 按文案找按钮。 */
function findButton(renderer, label) {
  return renderer.root.findAll(node =>
    typeof node.props?.onClick === 'function'
    && typeof node.props?.children === 'string'
    && node.props.children.includes(label))[0]
}

/** 面试间那一页——它拿到的 `config` 就是舞台上用的那份。 */
function findLiveView(renderer) {
  return renderer.root.findAll(node => node.type?.name === 'LiveView')[0]
}

/** 形象下拉：按「选项里有哪几份形象」认它，别按顺序。 */
function findAvatarSelect(renderer) {
  const selects = renderer.root.findAll(node => node.type === 'select')
  return selects.find(node => {
    const children = node.props?.children
    const list = Array.isArray(children) ? children : [children]
    return list.some(child => child?.props?.value === AVATAR_B)
  })
}

/**
 * 取一个测试节点里的全部文字。
 *
 * react-test-renderer 的实例**没有** `toJSON`（那是渲染器的），所以自己走一遍
 * `children`（字符串与子实例混在一起）。
 */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  let children
  try { children = node.children } catch { return '' }
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(textOf).join('')
  return ''
}

/** 「在舞台上显示预置面试官」那个勾选框：按它所在的 label 认。 */
function findAvatarCheckbox(renderer) {
  const labels = renderer.root.findAll(node => node.type === 'label')
  for (const label of labels) {
    if (!textOf(label).includes('面试官')) continue
    const input = label.findAll(node => node.type === 'input' && node.props?.type === 'checkbox')[0]
    if (input !== undefined) return input
  }
  return undefined
}

test('设置页存完形象，面板立刻重读有效配置（不用退出重进）', { skip: SKIP }, async () => {
  const host = makeHost()
  const renderer = await mountPanel(host)
  try {
    await flush()

    await clickTab(renderer, '设置')
    await flush()

    const select = findAvatarSelect(renderer)
    assert.ok(select !== undefined, '设置页没有渲染形象下拉')
    await act(async () => { select.props.onChange({ target: { value: AVATAR_B } }) })

    const before = host.configReads
    const save = findButton(renderer, '保存形象设置')
    assert.ok(save !== undefined, '设置页没有「保存形象设置」按钮')
    await act(async () => { save.props.onClick() })
    await flush()

    // ① 设置确实写出去了。
    const post = host.posts.find(item => item.payload.interviewerStyle === AVATAR_B)
    assert.ok(post !== undefined, '保存没有把新的形象写出去')

    // ② **面板重读了有效配置**——原来缺的就是这一声。
    assert.ok(
      host.configReads > before,
      '保存之后没有重读有效配置：面试间会一直用旧的那份（这就是这个 bug）',
    )

    // ③ 进面试间，拿到的是新形象。
    await clickTab(renderer, '面试中')
    await flush()
    const live = findLiveView(renderer)
    assert.ok(live !== undefined, '面试间没有渲染出来')
    assert.equal(live.props.config.interviewerStyle, AVATAR_B, '面试间拿到的还是旧形象')
  } finally {
    await act(async () => { renderer.unmount() })
  }
})

test('把面试官形象关掉，也要立刻生效', { skip: SKIP }, async () => {
  const host = makeHost()
  const renderer = await mountPanel(host)
  try {
    await flush()

    await clickTab(renderer, '设置')
    await flush()

    const checkbox = findAvatarCheckbox(renderer)
    assert.ok(checkbox !== undefined, '设置页没有「在舞台上显示预置面试官」那个勾选框')
    await act(async () => { checkbox.props.onChange({ target: { checked: false } }) })

    const save = findButton(renderer, '保存形象设置')
    assert.ok(save !== undefined, '设置页没有「保存形象设置」按钮')
    await act(async () => { save.props.onClick() })
    await flush()

    await clickTab(renderer, '面试中')
    await flush()
    const live = findLiveView(renderer)
    assert.ok(live !== undefined, '面试间没有渲染出来')
    assert.equal(live.props.config.interviewerAvatar, 'off', '关掉之后面试间还在挂那张脸')
  } finally {
    await act(async () => { renderer.unmount() })
  }
})

test('配置在面板背后被改掉，切进「面试中」也要跟上', { skip: SKIP }, async () => {
  const host = makeHost()
  const renderer = await mountPanel(host)
  try {
    await flush()

    await clickTab(renderer, '面试中')
    await flush()
    const first = findLiveView(renderer)
    assert.ok(first !== undefined, '面试间没有渲染出来')
    assert.equal(first.props.config.interviewerStyle, AVATAR_A, '一开始就该是默认那份形象')

    // 面板背后：有人改了设置（agent 工具 / 手改配置文件），面板自己不知道。
    host.style = AVATAR_B

    await clickTab(renderer, '准备')
    await flush()
    await clickTab(renderer, '面试中')
    await flush()

    const live = findLiveView(renderer)
    assert.ok(live !== undefined, '面试间没有渲染出来')
    assert.equal(
      live.props.config.interviewerStyle,
      AVATAR_B,
      '切进「面试中」没有重读有效配置：不是设置页改的也要算数',
    )
  } finally {
    await act(async () => { renderer.unmount() })
  }
})

test('换形象 id：旧的那份要拆掉，新的按新 id 重建（同一个 canvas）', { skip: SKIP }, async () => {
  // 这一层单独测形象 hook：上面几条测的是「面板拿到的配置对不对」，
  // 这一条测的是「拿到新 id 之后，舞台上那张脸真的换了」。
  //
  // 形象模块是拼装进 bundle 的一个片段（不是 ES 模块），所以这里**单独**把它
  // 加载进一个 vm 上下文：片段里的 `function` 声明会落到全局对象上，
  // 于是能直接拿到 `useAvatar`。
  const source = await readFile(join(ROOT, 'src', 'client', '61-avatar.js'), 'utf8')
  const created = []
  const windowStub = {
    MeshAvatar: {
      async createMeshAvatar(canvas, options) {
        const avatar = {
          canvas,
          options,
          destroyed: false,
          setSpeaking() {},
          setVoiceLevel() {},
          setParameters() {},
          advance() {},
          setAutoIdle() {},
          setAutoMotion() {},
          setLipSync() {},
          destroy() { this.destroyed = true },
        }
        created.push(avatar)
        return avatar
      },
    },
  }
  const sandbox = {
    React,
    h,
    useState: React.useState,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
    useMemo: React.useMemo,
    useRef: React.useRef,
    window: windowStub,
    document: { createElement: () => ({ setAttribute() {}, appendChild() {} }) },
    fetch: async () => ({ ok: true, json: async () => ({ format: 'mesh-avatar', version: 1, name: '测试形象' }) }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    performance: { now: () => 0 },
    console,
  }
  runInNewContext(source, sandbox, { filename: '61-avatar.js' })
  const useAvatar = sandbox.useAvatar
  assert.equal(typeof useAvatar, 'function', '没从形象模块里取到 useAvatar')

  const canvas = {
    closest: () => null,
    parentElement: {
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    },
  }
  function Probe(props) {
    const { canvasRef } = useAvatar({ phase: 'idle', avatarId: props.avatarId })
    return h('canvas', { ref: canvasRef })
  }

  const renderer = create(h(Probe, { avatarId: AVATAR_A }), { createNodeMock: () => canvas })
  try {
    await act(async () => { await new Promise(done => setTimeout(done, 0)) })
    assert.equal(created.length, 1, '第一份形象没有建起来')
    assert.ok(
      String(created[0].options.assetsBase).includes(`/${AVATAR_A}/`),
      '第一份形象不是设置里选的那份',
    )

    await act(async () => { renderer.update(h(Probe, { avatarId: AVATAR_B })) })
    await act(async () => { await new Promise(done => setTimeout(done, 0)) })

    assert.equal(created.length, 2, '换 id 之后没有重建形象')
    assert.equal(created[0].destroyed, true, '旧的那份没有拆掉（WebGL 上下文会一直占着）')
    assert.ok(
      String(created[1].options.assetsBase).includes(`/${AVATAR_B}/`),
      '重建的不是新 id 那一份',
    )
    // 同一个 canvas 上重建：WebGL 上下文是按 canvas 记的，换 canvas 反而多要一个上下文。
    assert.equal(created[1].canvas, canvas, '重建没有落在同一个 canvas 上')
  } finally {
    await act(async () => { renderer.unmount() })
  }
})
