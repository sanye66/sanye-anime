const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/source.ts'), 'utf8')
function load(bridge) {
  const exports = {}
  const storage = new Map()
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    require: () => ({ registerPlugin: () => ({}), androidCatalog: bridge, watch: () => {} }),
  })
  return exports
}
test('旧来源快照只迁移无原生归属的精确记录，跨规则历史键无歧义', async () => {
  let migrated
  const api = load({ migrateSourceBindings: async value => { migrated = value; return { migrated: 2 } } })
  api.persistSourceContext('saved:1', { content: 'original-rule', sourceIndex: 0 })
  api.persistSourceContext('saved:2', { content: 'obsolete-rule', sourceIndex: 1 })
  const history = { mediaUrl: 'https://example.org/a:b', episodeId: 'c:d', lineId: 'e' }
  api.persistSourceContext(api.historySourceBindingKey(history), { content: 'history-rule', sourceIndex: 2 })
  await api.migrateLegacySourceBindings([{ id: 1 }, { id: 2, sourceKey: 'native', sourceContext: { content: 'new-rule', sourceIndex: 1 } }], [history])
  assert.equal(migrated.saved.length, 1); assert.equal(migrated.saved[0].id, 1)
  assert.equal(migrated.saved[0].context.content, 'original-rule'); assert.equal(migrated.history[0].context.content, 'history-rule')
  assert.notEqual(api.historySourceBindingKey({ ...history, sourceKey: 'a' }), api.historySourceBindingKey({ ...history, sourceKey: 'b' }))
  assert.notEqual(api.historySourceBindingKey({ ...history, sourceKey: 'a' }), api.historySourceBindingKey({ ...history, mediaUrl: 'https://example.org/a', episodeId: 'b:c:d', sourceKey: 'a' }))
})
test('只兼容缺失的旧桥接接口，不吞掉真实迁移错误', async () => {
  const old = load({ migrateSourceBindings: async () => { throw { code: 'UNIMPLEMENTED' } } })
  old.persistSourceContext('saved:1', { content: 'rule' })
  assert.equal((await old.migrateLegacySourceBindings([{ id: 1 }], [])).migrated, 0)
  const current = load({ migrateSourceBindings: async () => { throw new Error('database full') } })
  current.persistSourceContext('saved:1', { content: 'rule' })
  await assert.rejects(current.migrateLegacySourceBindings([{ id: 1 }], []), /database full/)
})
