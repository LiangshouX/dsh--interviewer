#!/usr/bin/env node
/**
 * 把一张立绘做成本插件能用的面试官形象（**作者工具，不进发布包**）。
 *
 * 为什么要有它
 * ------------
 * 形象是"一张图 → 一套绑定 → 几个 PNG"的产物，靠手搓不可能对齐。这一步用
 * [RuiC-2D](https://github.com/HRuiCcc/RuiC-2D)（MIT）的 Python 流水线跑一次，
 * 产物（`avatar.json` / `rig.json` / `built/`）放进 `assets/avatar/<id>/` 即可。
 *
 * **运行时不需要 Python、不需要 RuiC-2D。** 这里只是**生成素材**的一次性工具：
 * 插件装到别人机器上时，读的只有那几个 JSON/PNG。
 *
 * 用法
 * ----
 *   node dev/make-avatar.mjs <图片> <形象id> \
 *     --left 434,392 --right 586,392 --mouth 512,506 \
 *     [--name "面试官 · 某某"] [--remove-background] \
 *     [--contours left.json,right.json] \
 *     [--ruic <RuiC-2D目录>] [--python <python可执行文件>]
 *
 *   · `--left/--right/--mouth`：左眼中心、右眼中心、嘴中心的**像素坐标**
 *     （在图上量，或者用任何看图工具读）。这三个点决定整张脸的绑定。
 *   · `--contours`：可选，两只眼睛的 24 点轮廓（JSON 数组）。没给就用椭圆近似——
 *     杏仁眼/欧式眼这类特殊形状给了会准很多。
 *   · `--remove-background`：图本身没有透明底时用（流水线会跑 grabCut 去背）。
 *   · `--ruic` / `--python`：也可以走环境变量 `RUIC_DIR` / `RUIC_PYTHON`。
 *
 * 跑完会打印产物路径与该形象在面板里的名字。放好之后：
 *   `node scripts/build.mjs` → `node scripts/pack.mjs` → 装 tarball，
 *   设置页的「面试官形象」下拉里就会多出这一份（Host 扫目录，不需要改代码）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AVATAR_ROOT = join(ROOT, 'assets', 'avatar')
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/

/** 极简参数解析：够用就好，不引依赖。 */
function parseArgs(argv) {
  const options = { positional: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      options.positional.push(token)
      continue
    }
    const key = token.slice(2)
    if (['remove-background', 'help'].includes(key)) {
      options[key] = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`参数 --${key} 需要一个值`)
    }
    options[key] = value
    index += 1
  }
  return options
}

/** 解析 `x,y`。 */
function parsePoint(text, label) {
  const parts = String(text ?? '').split(',').map(item => Number(item.trim()))
  if (parts.length !== 2 || parts.some(item => !Number.isFinite(item))) {
    throw new Error(`${label} 要写成「x,y」（像素坐标），收到：${text}`)
  }
  return parts
}

/**
 * 把源图转成 1024 长边以内的 PNG data URL。
 *
 * **为什么转 PNG。** 流水线只做 RGBA 处理；JPG 读进来没有 alpha 通道，
 * 去背/分层就全靠运气。这里用 Chromium 的 `sharp` 不一定装了，所以用
 * 最简单的办法：非 PNG 就报错让作者自己转（一条命令的事），不引入依赖。
 */
async function imageDataUrl(file) {
  const bytes = await readFile(file)
  const ext = file.toLowerCase().slice(file.lastIndexOf('.'))
  if (ext !== '.png') {
    throw new Error(`请先把图转成 PNG（透明底更好）：${file}。当前是 ${ext}。`)
  }
  return `data:image/png;base64,${bytes.toString('base64')}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help === true || args.positional.length < 2) {
    console.log('用法：node dev/make-avatar.mjs <图片.png> <形象id> --left x,y --right x,y --mouth x,y [--name 名字] [--remove-background] [--contours left.json,right.json]')
    process.exit(args.help === true ? 0 : 1)
  }
  const [imagePath, avatarId] = args.positional
  if (!ID_RE.test(avatarId)) {
    throw new Error(`形象 id 只能是字母/数字/下划线/连字符（≤40 字符）：${avatarId}`)
  }
  if (avatarId === 'interviewer') {
    throw new Error('interviewer 是默认形象的 id：要么覆盖它，要么换一个 id（覆盖请手动做，别让脚本悄悄顶掉）')
  }
  const image = resolve(imagePath)
  if (!existsSync(image)) throw new Error(`图片不存在：${image}`)

  const ruic = resolve(args.ruic ?? process.env.RUIC_DIR ?? '')
  if (!existsSync(join(ruic, 'tools', 'pipeline.py'))) {
    throw new Error(`找不到 RuiC-2D：${ruic || '(未指定)'}。用 --ruic <目录> 或环境变量 RUIC_DIR 指过去。`)
  }
  const python = args.python ?? process.env.RUIC_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')

  const anchors = [
    parsePoint(args.left, '--left'),
    parsePoint(args.right, '--right'),
    parsePoint(args.mouth, '--mouth'),
  ]
  const eyeContours = []
  if (typeof args.contours === 'string') {
    for (const file of args.contours.split(',').map(item => item.trim()).filter(Boolean)) {
      const contour = JSON.parse(await readFile(resolve(file), 'utf8'))
      if (!Array.isArray(contour) || contour.length < 8) {
        throw new Error(`轮廓至少 8 个点：${file}`)
      }
      eyeContours.push(contour)
    }
  }

  const name = typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim() : `面试官 ${avatarId}`
  const projectId = `avatar-${avatarId}-${Date.now().toString(36)}`
  const payload = {
    image: await imageDataUrl(image),
    name,
    anchors,
    ...(eyeContours.length === 2 ? { eyeContours } : {}),
    ...(args['remove-background'] === true ? { removeBackground: true } : {}),
  }

  console.log(`› 用 RuiC-2D 建绑定：${basename(image)} → ${avatarId}`)
  // Windows 上 Python 默认按 GBK 读文件，中文 rig/workspace 会直接炸——
  // 强制 UTF-8（这是本机实测踩过的坑，不是预防性代码）。
  const env = { ...process.env, PYTHONUTF8: '1' }
  execFileSync(python, [join(ruic, 'tools', 'pipeline.py'), 'create', projectId], {
    cwd: ruic,
    input: JSON.stringify(payload),
    stdio: ['pipe', 'inherit', 'inherit'],
    env,
  })

  const project = join(ruic, 'projects', projectId)
  const target = join(AVATAR_ROOT, avatarId)
  // 先清空再拷：同一 id 重跑时，上一版多出来的图层不能留着
  // （`layers.json` 是清单，多一个文件无害，但少一个就是 404）。
  await rm(target, { recursive: true, force: true })
  await mkdir(join(target, 'built'), { recursive: true })
  for (const file of ['avatar.json', 'rig.json']) {
    await copyFile(join(project, file), join(target, file))
  }
  await cp(join(project, 'built'), join(target, 'built'), { recursive: true })
  // 原图留一份：万一以后要重建绑定（+ 也是「这张脸是自制的」的证据）。
  await copyFile(image, join(target, 'source.png'))

  const manifest = JSON.parse(await readFile(join(target, 'avatar.json'), 'utf8'))
  manifest.name = name
  await writeFile(join(target, 'avatar.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8')

  await writeFile(join(target, 'NOTICE.txt'), [
    `形象：${name}（${avatarId}）`,
    '',
    '这张脸的来源与授权：',
    `  原图：${basename(image)}（随包留在 source.png）`,
    '  绑定：用 RuiC-2D（MIT）的作者工具链在本地跑出来，运行时不依赖它。',
    '  运行时：assets/vendor/mesh-avatar.js（MIT, © Yuki Shindo）',
    '',
    '如果原图不是你自己的作品，请先确认它有随插件分发（含商用）的授权；',
    '第三方角色包（例如 LivLiv）的许可是「仅非商业、须署名、禁止单独分发」，不能放进来。',
    '',
  ].join('\n'), 'utf8')

  console.log('')
  console.log(`✓ 形象已就位：assets/avatar/${avatarId}/`)
  console.log('  下一步：node scripts/build.mjs → node scripts/pack.mjs → 装 tarball；')
  console.log(`  设置页「面试官形象」下拉里会出现「${name}」（Host 扫目录发现，不用改代码）。`)
}

main().catch(error => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
