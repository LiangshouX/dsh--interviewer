/**
 * 预置面试官形象：**只读资源路由** + 打包契约 + 设置项。
 *
 * 这一层值得单独测，因为它有一个「错了不报错」的失败模式：形象是增强，
 * 加载失败时面试照常——于是路由 404 了也没人喊，只是舞台上永远没有那张脸。
 * 所以这里把字节、头部、白名单、目录穿越、以及「素材真的在包里」都钉住。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InterviewService } from '../src/host/service.js'
import { registerApi } from '../src/host/api.js'
import { ASSET_DIR, BUNDLE_DEFAULTS, normalizeSetting, resolveConfig } from '../src/host/paths.js'
import { AVATAR_DIR, DEFAULT_AVATAR_ID, listAvatars, resolveAvatar } from '../src/host/avatar.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 一个临时 profile，别把测试写进用户真实的设置文件。 */
process.env.DSH_PROFILE_DIR = join(ROOT, '.tmp-test', `profile-isolated-${process.pid}-${Date.now()}`)

/**
 * 把 API 挂到一个真的 HTTP 服务上。
 *
 * **为什么不用假 req/res。** 这条路由是**二进制 + 流**（`createReadStream().pipe`），
 * 假 res 要么收不到 body，要么把「没有 content-length」这类 bug 掩盖掉。
 */
async function withApi(run) {
  const service = new InterviewService({ config: {} })
  let handler
  const ctx = {
    effect(fn) { return fn() },
    webServer: { register(spec) { handler = spec.handler; return () => {} } },
  }
  registerApi(ctx, service)
  const server = createServer((req, res) => { void handler(req, res) })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const port = server.address().port

  /** 原样发 path：`fetch` 会先把 `..` 归一化掉，测穿越必须自己发。 */
  const request = (method, path, headers = {}) => new Promise((settle, reject) => {
    const req = httpRequest({
      host: '127.0.0.1', port, method, path,
      headers: { host: `127.0.0.1:${port}`, ...headers },
    }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => settle({
        status: res.statusCode,
        type: res.headers['content-type'] ?? '',
        cache: res.headers['cache-control'] ?? '',
        etag: res.headers.etag ?? '',
        body: Buffer.concat(chunks),
      }))
    })
    req.on('error', reject)
    req.end()
  })

  try {
    await run({ service, port, request, get: path => request('GET', path) })
  } finally {
    // 客户端会 keep-alive，不等它：测试不该为了一个 socket 多花几秒。
    server.closeAllConnections?.()
    await new Promise(done => server.close(done))
  }
}

test('包里真的带着形象素材：rig / 图层 / 运行时 / 许可', async () => {
  const rig = JSON.parse(await readFile(join(ASSET_DIR, 'avatar', 'interviewer', 'rig.json'), 'utf8'))
  // 运行时真正吃的其实就这几样：rig 的几何 + built/ 的图 + layers.json 的矩形。
  assert.equal(rig.eyes.length, 2, '绑定里必须有两颗眼')
  for (const eye of rig.eyes) {
    assert.ok(eye.x0 < eye.x1, '眼部曲线必须给出 x0 < x1')
    assert.equal(eye.top.length, 24)
    assert.equal(eye.bot.length, 24)
  }
  assert.ok(rig.mouth.halfLen > 0 && rig.mouth.bow >= 0, '嘴部区域必须可画')

  const layers = JSON.parse(await readFile(join(ASSET_DIR, 'avatar', 'interviewer', 'built', 'layers.json'), 'utf8'))
  for (const name of ['eye0_ball', 'eye0_lash', 'eye0_low', 'eye0_crease', 'eye1_ball', 'eye1_lash', 'eye1_low', 'eye1_crease']) {
    assert.ok(layers.layers[name] !== undefined, `缺图层矩形：${name}`)
  }
  for (const name of ['base', 'hairmask']) {
    const bytes = await readFile(join(ASSET_DIR, 'avatar', 'interviewer', 'built', `${name}.png`))
    assert.ok(bytes.length > 0, `缺图：${name}.png`)
  }

  const manifest = JSON.parse(await readFile(join(ASSET_DIR, 'avatar', 'interviewer', 'avatar.json'), 'utf8'))
  assert.equal(manifest.format, 'mesh-avatar')
  // 口型参数随形象走：运行时直接吃这三个数，不给用户调。
  assert.equal(typeof manifest.lipSync.openness, 'number')

  const runtime = await readFile(join(ASSET_DIR, 'vendor', 'mesh-avatar.js'), 'utf8')
  // 三个外部驱动口型的接口是上游原生的——方案的地基。
  assert.ok(runtime.includes('setVoiceLevel'), '运行时没有 setVoiceLevel')
  assert.ok(runtime.includes('setLipSync'), '运行时没有 setLipSync')
  assert.ok(runtime.includes('setSpeaking'), '运行时没有 setSpeaking')

  const license = await readFile(join(ASSET_DIR, 'vendor', 'LICENSE-mesh-avatar.txt'), 'utf8')
  assert.match(license, /MIT License/)
  assert.match(license, /Yuki Shindo/)
})

test('GET 形象资源：正确的类型与字节', async () => {
  await withApi(async ({ get }) => {
    const rig = await get('/interviewer/avatar/asset/avatar/interviewer/rig.json')
    assert.equal(rig.status, 200)
    assert.match(rig.type, /application\/json/)
    assert.equal(rig.cache, 'no-cache')
    const parsed = JSON.parse(rig.body.toString('utf8'))
    // 尺寸不写死（换形象就会变）：只要有个正数，且与 layers.json 的 size 一致。
    const layers = JSON.parse((await get('/interviewer/avatar/asset/avatar/interviewer/built/layers.json')).body.toString('utf8'))
    assert.ok(parsed.image.width > 0 && parsed.image.height > 0)
    assert.deepEqual(layers.size, [parsed.image.width, parsed.image.height])

    const runtime = await get('/interviewer/avatar/asset/vendor/mesh-avatar.js')
    assert.equal(runtime.status, 200)
    assert.match(runtime.type, /text\/javascript/)
    assert.ok(runtime.body.length > 100_000, '运行时应该是那个 187KB 的文件')

    const png = await get('/interviewer/avatar/asset/avatar/interviewer/built/base.png')
    assert.equal(png.status, 200)
    assert.match(png.type, /image\/png/)
    assert.ok(png.body.length > 0)
  })
})

test('静态资源带 ETag，同一份再问一次回 304', async () => {
  await withApi(async ({ get, request }) => {
    const first = await get('/interviewer/avatar/asset/avatar/interviewer/rig.json')
    assert.match(first.etag, /^".+"$/, '必须带 ETag')
    const again = await request('GET', '/interviewer/avatar/asset/avatar/interviewer/rig.json', {
      'if-none-match': first.etag,
    })
    assert.equal(again.status, 304, 'ETag 命中应该是 304（省一次 187KB 的下发）')
    assert.equal(again.body.length, 0)
    // 换了内容（模拟包升级）就必须重新给整份。
    const stale = await request('GET', '/interviewer/avatar/asset/avatar/interviewer/rig.json', {
      'if-none-match': '"stale"',
    })
    assert.equal(stale.status, 200)
    assert.ok(stale.body.length > 0)
  })
})

test('目录穿越与白名单外的东西一律拿不到', async () => {
  await withApi(async ({ request }) => {
    // 注意：`new URL()` 会先把 `..` 归一化掉，所以有些穿越在进入我们的
    // 校验之前就已经不在这条路由下了。这里断言的是**结果**：
    // 不管绕哪条路，都拿不到包里的其它文件。
    const cases = [
      '/interviewer/avatar/asset/avatar/../../package.json',
      '/interviewer/avatar/asset/vendor/../../../src/host/api.js',
      '/interviewer/avatar/asset/src/host/api.js',
      '/interviewer/avatar/asset/avatar/%2e%2e/%2e%2e/package.json',
      '/interviewer/avatar/asset/..%2f..%2fpackage.json',
      '/interviewer/avatar/asset/avatar\\..\\..\\package.json',
      '/interviewer/avatar/asset/',
    ]
    for (const path of cases) {
      const result = await request('GET', path)
      assert.equal(result.status, 404, `${path} 不该被放行（拿到 ${result.status}）`)
      assert.ok(!result.body.toString('utf8').includes('"name": "dsh-realtime-interview"'),
        `${path} 泄露了包内容`)
    }
  })
})

test('只允许 GET；未知文件是 404', async () => {
  await withApi(async ({ request }) => {
    const post = await request('POST', '/interviewer/avatar/asset/avatar/interviewer/rig.json')
    assert.equal(post.status, 405)

    const missing = await request('GET', '/interviewer/avatar/asset/avatar/interviewer/nope.png')
    assert.equal(missing.status, 404)
  })
})

test('设置项 interviewerAvatar：白名单里有，默认 on，只认 on/off', async () => {
  assert.equal(normalizeSetting('interviewerAvatar', 'on').ok, true)
  assert.equal(normalizeSetting('interviewerAvatar', 'off').ok, true)
  assert.equal(normalizeSetting('interviewerAvatar', 'maybe').ok, false)
  assert.equal(normalizeSetting('interviewerAvatar', true).ok, false)

  assert.equal(BUNDLE_DEFAULTS.interviewerAvatar, 'on')
  assert.equal(resolveConfig({}).interviewerAvatar, 'on')
  assert.equal(resolveConfig({ interviewerAvatar: 'off' }).interviewerAvatar, 'off')
  // 大小写/空白由 oneOf 归一
  assert.equal(resolveConfig({ interviewerAvatar: ' OFF ' }).interviewerAvatar, 'off')
})

test('发版补丁与 BUNDLE_DEFAULTS 保持一致（漏一处 = 配置写了不生效）', async () => {
  const patch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /interviewerAvatar: 'on'/, 'cordis.patch.yml 的 config 块缺 interviewerAvatar')
  assert.match(patch, /interviewerStyle: ''/, 'cordis.patch.yml 的 config 块缺 interviewerStyle')
  assert.equal(BUNDLE_DEFAULTS.interviewerStyle, '')
})

test('形象清单由目录发现：默认那份排第一，每份都真有四样文件', async () => {
  const avatars = await listAvatars()
  assert.ok(avatars.length >= 1, '至少要有默认那份形象')
  assert.equal(avatars[0].id, DEFAULT_AVATAR_ID, '默认形象必须排第一（下拉默认项别随字母序漂）')
  assert.equal(avatars[0].default, true)
  assert.ok(avatars[0].name.length > 0, '清单里要有能认出来的名字')

  // 「放一个目录就是一份形象」的前提：清单里的每一份都必须真能跑起来。
  for (const avatar of avatars) {
    const dir = join(AVATAR_DIR, avatar.id)
    const rig = JSON.parse(await readFile(join(dir, 'rig.json'), 'utf8'))
    assert.equal(rig.eyes.length, 2, `${avatar.id}: 绑定里必须有两颗眼`)
    assert.ok(rig.mouth.halfLen > 0, `${avatar.id}: 嘴部区域必须可画`)
    const layers = JSON.parse(await readFile(join(dir, 'built', 'layers.json'), 'utf8'))
    for (const name of ['eye0_ball', 'eye0_lash', 'eye1_ball', 'eye1_lash']) {
      assert.ok(layers.layers[name] !== undefined, `${avatar.id}: 缺图层 ${name}`)
    }
    const manifest = JSON.parse(await readFile(join(dir, 'avatar.json'), 'utf8'))
    assert.equal(typeof manifest.lipSync?.openness, 'number', `${avatar.id}: 缺口型参数`)
  }
})

test('设置里写了个不存在的形象：拒绝并说明，且不会把舞台搞成没脸', async () => {
  // 解析层回落：空 / 未知 id 都解析成默认那份。
  assert.equal((await resolveAvatar('')).selected, DEFAULT_AVATAR_ID)
  assert.equal((await resolveAvatar('nope')).selected, DEFAULT_AVATAR_ID)
  assert.equal((await resolveAvatar(DEFAULT_AVATAR_ID)).selected, DEFAULT_AVATAR_ID)

  await withApi(async ({ service }) => {
    const bad = await service.updateSettings({ interviewerStyle: 'nope' })
    assert.equal(bad.invalid.some(item => item.key === 'interviewerStyle'), true, '未知 id 必须被拒绝')
    assert.match(bad.invalid.find(item => item.key === 'interviewerStyle').reason, /nope/)

    const good = await service.updateSettings({ interviewerStyle: DEFAULT_AVATAR_ID })
    assert.deepEqual(good.invalid, [])
    const options = await service.avatarOptions()
    assert.equal(options.selected, DEFAULT_AVATAR_ID)
  })
})

test('GET /config 把形象开关带给面板', async () => {
  await withApi(async ({ get, service }) => {
    const response = await get('/interviewer/api/config')
    assert.equal(response.status, 200)
    const body = JSON.parse(response.body.toString('utf8'))
    assert.equal(body.ok, true)
    assert.equal(body.data.interviewerAvatar, 'on')
    // 面板要知道「有哪几份、现在用哪一份」——默认那份是解析过的 id。
    assert.equal(body.data.interviewerStyle, DEFAULT_AVATAR_ID)
    assert.ok(Array.isArray(body.data.interviewerAvatars))
    assert.equal(body.data.interviewerAvatars[0].id, DEFAULT_AVATAR_ID)
    // 关掉之后要如实回报（面板据此不挂形象）。
    await service.updateSettings({ interviewerAvatar: 'off' })
    const next = await get('/interviewer/api/config')
    assert.equal(JSON.parse(next.body.toString('utf8')).data.interviewerAvatar, 'off')
  })
})

test('口型链路的三条硬约束在 bundle 里（错了不报错，只是「面试官没声音」）', async () => {
  // 这一条是**静态**守卫。音频图接管是"要么全对、要么全错"的操作：
  // 少了 connect(destination) 就是静音，而静音不会抛错、也没有断言能抓。
  const client = await readFile(join(ROOT, 'client.js'), 'utf8')

  // 1. 接管 `<audio>` 的输出（口型的源头）。
  assert.match(client, /createMediaElementSource/, '没有接管音频元素')
  // 2. 接管后必须回接 destination，否则面试官没有声音。
  assert.match(client, /source\.connect\(context\.destination\)/, '接管后没有接回 destination：声音会消失')
  // 3. 上下文没跑起来就**不接管**（接管=静音，比没有口型更糟）。
  assert.match(client, /context\.state !== 'running'/, '没有检查 AudioContext 是否在跑')
  // 4. 同一个元素只接一次（第二次 createMediaElementSource 会抛错）。
  assert.match(client, /analyserRef\.current !== undefined/, '没有为「只接一次」设守卫')
  // 5. 音量通道是**非响应式**的：值只活在 ref 里，读取函数恒定身份。
  assert.match(client, /const readLevel = useCallback/, '没有非响应式音量通道')
  assert.match(client, /const levelRef = useRef\(0\)/, '音量没有走 ref 通道')
  assert.match(client, /levelRef\.current = level/, '音量没有被写进 ref')
  // 6. 形象层真的把音量喂给了运行时。
  assert.match(client, /avatar\.setVoiceLevel\(/, '没有把音量喂给形象')
  // 7. 形象挂在舞台上，且开关通到了视图。
  assert.match(client, /AvatarPiP/, '视图没有挂形象')
  assert.match(client, /interviewerAvatar !== 'off'/, '开关没有接到视图')
  // 8. 挂的是**设置里选的那一份**，且读不到时回落默认那份（不是空脸）。
  assert.match(client, /avatarBaseUrl\(avatarId\)/, '形象地址没有按 id 拼')
  assert.match(client, /AVATAR_DEFAULT_ID/, '没有默认形象的兜底 id')
  assert.match(client, /loadAvatarFiles\(AVATAR_DEFAULT_ID\)/, '选中的形象读不到时没有回落默认')
  assert.match(client, /avatarId: config\?\.interviewerStyle/, '视图没有把选中的形象传下去')
})

