import { readFile } from 'node:fs/promises'
const src = await readFile('client.js', 'utf8')
const { maskSource, findCalls } = await import('./fix-keys.mjs').catch(() => ({}))
