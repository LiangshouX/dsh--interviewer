import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAsrConfig, joinEndpoint } from '../src/host/asr.js'

/** A fake service carrying just what the ASR resolver reads. */
function fakeService(config = {}, host = undefined) {
  return { config, ctx: host }
}

/** A fake host that exposes one configured provider. */
function fakeHost(provider, extra = {}) {
  return {
    get(key) {
      if (key === 'agentDefaultModel') {
        return { currentSelection: () => ({ provider, model: extra.model ?? 'host-model' }) }
      }
      if (key === 'llm') {
        return {
          async listProviders() {
            return [{ id: provider, name: provider, ...extra.providerFields }]
          },
        }
      }
      return undefined
    },
  }
}

test('什么都没配时回落到浏览器识别，并说明原因', async () => {
  const settings = await resolveAsrConfig(fakeService({}, undefined))
  assert.equal(settings.mode, 'browser')
  assert.match(settings.reason, /回落/)
})

test('显式配了 key 与 baseUrl 就走服务端', async () => {
  const settings = await resolveAsrConfig(fakeService({
    asrProvider: 'auto',
    asrApiKey: 'sk-test',
    asrBaseUrl: 'https://api.example.com/v1',
    asrModel: 'whisper-1',
  }))
  assert.equal(settings.mode, 'server')
  assert.equal(settings.source, 'config')
  assert.equal(settings.endpoint, 'https://api.example.com/v1/audio/transcriptions')
  assert.equal(settings.model, 'whisper-1')
})

test('宿主给了端点与凭据时继承宿主', async () => {
  const settings = await resolveAsrConfig(fakeService({}, fakeHost('minimax', {
    model: 'minimax-speech',
    providerFields: { baseUrl: 'https://api.host.dev/v1', apiKey: 'sk-host' },
  })))
  assert.equal(settings.mode, 'server')
  assert.equal(settings.source, 'host')
  assert.equal(settings.provider, 'minimax')
  assert.match(settings.reason, /继承 DSH 宿主/)
})

test('宿主有模型但读不到凭据时明说，不假装能用', async () => {
  const settings = await resolveAsrConfig(fakeService({}, fakeHost('minimax', { model: 'm' })))
  assert.equal(settings.mode, 'browser')
  assert.match(settings.reason, /读不到/)
})

test('显式关闭服务端识别时不回落浏览器', async () => {
  const settings = await resolveAsrConfig(fakeService({ asrProvider: 'none' }))
  assert.equal(settings.mode, 'none')
})

test('端点拼接处理斜杠与绝对地址', () => {
  assert.equal(joinEndpoint('https://a.dev/v1/', ''), 'https://a.dev/v1/audio/transcriptions')
  assert.equal(joinEndpoint('https://a.dev/v1', '/x/y'), 'https://a.dev/v1/x/y')
  assert.equal(joinEndpoint('https://a.dev/v1', 'https://b.dev/z'), 'https://b.dev/z')
})
