// Drive the INSTALLED package's skill provider and prove the scoping.
//
// 装进 profile 的那一份，和仓库里跑测试的是同一份代码；这个脚本直接驱动
// **已安装的那一份**，确认发出去的东西行为是对的。
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const INSTALLED = process.env.DSH_IV_INSTALLED
  ?? 'C:/Users/X-L-S/.dsh/profiles/desktop/node_modules/dsh-realtime-interview/src/host/skills.js'
const ROOT = 'D:\\DSH-REALTIME-INTERVIEW'

const mod = await import(pathToFileURL(INSTALLED).href)

let provider
const ctx = {
  get: name => (name === 'skills'
    ? {
        registerProvider(create) {
          provider = create({ signal: new AbortController().signal, invalidate() {} })
          return () => {}
        },
      }
    : undefined),
}
mod.registerInterviewSkills(ctx, { effectiveRoot: async () => ROOT })

const names = observation => observation.candidates.map(c => c.name).sort()

console.log('已安装的 provider：', INSTALLED)
console.log('面试工作区根     :', JSON.stringify(names(await provider.list({ cwd: ROOT }))))
console.log('它的子目录       :', JSON.stringify(names(await provider.list({ cwd: join(ROOT, 'workspaces', 'iv-1') }))))
console.log('别的工作区       :', JSON.stringify(names(await provider.list({ cwd: 'D:\\Code\\Node\\HASEE-DSH-INTERVIEWER-ROOT' }))))
console.log('没有工作目录     :', JSON.stringify(names(await provider.list({}))))

const inside = await provider.list({ cwd: ROOT })
const candidate = inside.candidates[0]
const body = await provider.get(candidate, { cwd: ROOT })
console.log('工作区内取正文   :', body ? `OK（${body.content.length} 字符）` : '拿不到')
const leaked = await provider.get(candidate, { cwd: 'D:\\elsewhere' })
console.log('工作区外取正文   :', leaked ? '不该拿到！' : '拿不到（正确）')
