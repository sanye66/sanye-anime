const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/source.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function load(bridge) {
  const exports = {}, callbacks = []; let now = 1000
  vm.runInNewContext(compiled, { exports, setTimeout, clearTimeout, Date: { now: () => now }, localStorage: { getItem: () => null, setItem: () => {} },
    require: () => ({ registerPlugin: () => bridge, watch: (_, callback) => callbacks.push(callback), measureExperience: () => () => {} }) })
  return { api: exports.androidSource, change: () => callbacks.forEach(callback => callback()), advance: () => { now += 21000 } }
}
test('下一集解析复用在途与短期结果，按规则和来源编号隔离，过期重新请求', async () => {
  let calls = 0, finish
  const { api, advance } = load({ subscriptionResolve: async () => { calls++; return new Promise(resolve => { finish = resolve }) } })
  const a = api.resolve('https://example.org/ep2', { content: 'rule', sourceIndex: 1 })
  const b = api.resolve('https://example.org/ep2', { content: 'rule', sourceIndex: 1 })
  assert.equal(calls, 1)
  finish({ playbackUrl: 'https://cdn.example.org/2.mp4', mimeType: 'video/mp4' })
  await Promise.all([a, b]); await api.resolve('https://example.org/ep2', { content: 'rule', sourceIndex: 1 })
  assert.equal(calls, 1)
  const c = api.resolve('https://example.org/ep2', { content: 'rule', sourceIndex: 2 }); assert.equal(calls, 2)
  finish({ playbackUrl: 'https://cdn.example.org/other.mp4', mimeType: 'video/mp4' }); await c
  advance(); const expired = api.resolve('https://example.org/ep2', { content: 'rule', sourceIndex: 1 }); assert.equal(calls, 3)
  finish({ playbackUrl: 'https://cdn.example.org/new.mp4', mimeType: 'video/mp4' }); await expired
})
test('订阅切换隔离迟到解析，失败结果不会污染后续重试', async () => {
  let calls = 0, finish
  const { api, change } = load({ subscriptionResolve: async () => { calls++; return new Promise(resolve => { finish = resolve }) } })
  const old = api.resolve('https://example.org/ep', { content: 'rule' }); change()
  finish({ playbackUrl: 'https://cdn.example.org/old.mp4', mimeType: 'video/mp4' }); await old
  const fresh = api.resolve('https://example.org/ep', { content: 'rule' }); assert.equal(calls, 2)
  finish({ playbackUrl: 'https://cdn.example.org/new.mp4', mimeType: 'video/mp4' }); await fresh
  let attempts = 0
  const failing = load({ subscriptionResolve: async () => { if (++attempts === 1) throw new Error('network'); return { playbackUrl: 'https://cdn.example.org/ok.mp4', mimeType: 'video/mp4' } } }).api
  await assert.rejects(failing.resolve('https://example.org/ep', { content: 'rule' }), /network/)
  await failing.resolve('https://example.org/ep', { content: 'rule' }); assert.equal(attempts, 2)
})
