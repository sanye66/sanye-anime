const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

test('较晚返回的旧历史响应不会覆盖当前集数，旧失败也不会污染最新成功态', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/androidApp.vue'), 'utf8')
  const body = source.slice(source.indexOf('async function reloadHistory('), source.indexOf('\nfunction disposePlayer('))
  const pending = []
  const scope = {
    historyReadRequest: 0,
    section: { value: 'home' }, recoverHistoryCovers: async () => {},
    history: { value: [] }, historyError: { value: '' }, historyLoading: { value: false },
    progressQueue: Promise.resolve(),
    withNativeTimeout: promise => promise,
    androidCatalog: { listHistory: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
    savedSourceContext: () => undefined, sourceContent: () => '',
    migrateLegacySourceBindings: async () => ({ migrated: 0 }), historySourceBindingKey: () => 'legacy',
    Promise, window: { setTimeout },
  }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope)
  const old = scope.reloadHistory(false)
  const latest = scope.reloadHistory(false)
  pending[1].resolve({ items: [{ episodeTitle: '第8集' }] })
  await latest
  pending[0].resolve({ items: [{ episodeTitle: '第2集' }] })
  await old
  assert.equal(scope.history.value[0].episodeTitle, '第8集')
  assert.equal(scope.historyLoading.value, false)
  const staleFailure = scope.reloadHistory(false)
  const success = scope.reloadHistory(false)
  pending[3].resolve({ items: [{ episodeTitle: '第9集' }] })
  await success
  pending[2].reject(new Error('旧请求读取失败'))
  await staleFailure
  assert.equal(scope.history.value[0].episodeTitle, '第9集')
  assert.equal(scope.historyError.value, '')
})
