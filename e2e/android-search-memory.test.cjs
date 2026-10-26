const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const compiled = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/searchMemory.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
function load(initial = '{}', fail = false) {
  let stored = initial
  const exports = {}
  vm.runInNewContext(compiled, { exports, localStorage: { getItem: () => stored, setItem: (_, value) => { if (fail) throw new Error('full'); stored = value } } })
  return { api: exports, stored: () => stored }
}
test('搜索记忆按订阅规则隔离、去重限量、可清除，不持久化规则正文', () => {
  const { api, stored } = load()
  for (let i = 0; i < 12; i++) api.rememberSearch('甲订阅规则正文', `作品${i}`)
  api.rememberSearch('乙订阅规则正文', '乙作品')
  assert.equal(api.recentSearches('甲订阅规则正文').length, 8)
  assert.equal(api.recentSearches('乙订阅规则正文')[0], '乙作品')
  assert.equal(stored().includes('规则正文'), false)
  api.rememberSearch('甲订阅规则正文', '作品11')
  assert.equal(api.recentSearches('甲订阅规则正文').length, 8)
  api.clearRecentSearches('甲订阅规则正文')
  assert.equal(api.recentSearches('甲订阅规则正文').length, 0)
  assert.equal(api.recentSearches('乙订阅规则正文').length, 1)
})
test('破损或满额本地存储不阻断搜索，条目和作用域容量有界', () => {
  assert.equal(load('null').api.recentSearches('scope').length, 0)
  assert.equal(load('{').api.recentSearches('scope').length, 0)
  assert.doesNotThrow(() => load('{}', true).api.rememberSearch('scope', '作品'))
  const { api, stored } = load()
  for (let i = 0; i < 40; i++) api.rememberSearch(`scope-${i}`, '作品')
  assert.equal(Object.keys(JSON.parse(stored())).length, 20)
})
