const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../sanye_client/node_modules/typescript')
const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/repository.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const moduleObject = { exports: {} }
vm.runInNewContext(compiled, { module: moduleObject, exports: moduleObject.exports, TextEncoder, setTimeout, clearTimeout, require: () => ({ registerPlugin: () => ({}) }) })
const { createRepository } = moduleObject.exports

test('目录请求固定订阅快照、来源与页码，作品保留精确来源身份', async () => {
  const calls = []
  const repository = createRepository({
    async subscriptionCapabilities(options) { calls.push(options); return { sources: [{ sourceIndex: 2, repository: true, pagination: true }] } },
    async subscriptionRepository(options) { calls.push(options); return { hits: [{ title: '作品', sourceIndex: 2 }], sourceIndex: 2, page: 1, hasMore: true, nextPage: 2, truncated: false, warnings: [] } },
  })
  assert.equal((await repository.capabilities('订阅甲'))[0].sourceIndex, 2)
  const page = await repository.readPage({ content: '订阅甲', sourceIndex: 2 })
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ content: '订阅甲' }, { content: '订阅甲', sourceIndex: 2, page: 1 }])
  assert.deepEqual(JSON.parse(JSON.stringify(page.hits[0].sourceContext)), { content: '订阅甲', sourceIndex: 2 })
})
test('不完整请求不得推测默认来源，不合法页码不得调用原生', async () => {
  let calls = 0
  const repository = createRepository({ async subscriptionRepository() { calls++; return {} } })
  for (const options of [{ content: '', sourceIndex: 0 }, { content: '甲', sourceIndex: -1 }, { content: '甲', sourceIndex: 0.1 }, { content: '甲', sourceIndex: 0, page: 0 }, { content: '甲', sourceIndex: 0, page: 10001 }]) await assert.rejects(repository.readPage(options))
  assert.equal(calls, 0)
})
test('原生响应中的其他来源、错误页码或跳页被拒绝', async () => {
  const base = { hits: [{ sourceIndex: 2 }], sourceIndex: 2, page: 1, hasMore: false, truncated: false, warnings: [] }
  for (const result of [{ ...base, sourceIndex: 3 }, { ...base, page: 2 }, { ...base, hits: [{ sourceIndex: 3 }] }, { ...base, hasMore: true, nextPage: 3 }]) {
    const repository = createRepository({ async subscriptionRepository() { return result } })
    await assert.rejects(repository.readPage({ content: '甲', sourceIndex: 2, page: 1 }), /不匹配/)
  }
})
