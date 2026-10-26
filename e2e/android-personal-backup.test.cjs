const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const requireNodeCrypto = require('node:crypto')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const subscriptionKey = 'sanye:subscriptions:v1'
const bindingsKey = 'sanye:android-source-bindings:v1'
const rules = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 1, arguments: { name: '来源', script: 'throw new Error("不得执行")' } }] } })
function backup() {
  const personalData = { format: 'sanye-personal-data', version: 1, exportedAt: 10,
    savedMedia: [{ id: 8, title: '作品', url: 'https://example.org/video', coverUrl: '', summary: '', favorite: true, updatedAt: 10 }],
    watchHistory: [{ mediaUrl: 'https://example.org/video', title: '作品', episodeId: 'ep', episodeTitle: '第一集', lineId: 'main', coverUrl: '', positionSeconds: 20, durationSeconds: 100, completed: false, updatedAt: 10 }], settings: { theme: 'dark' } }
  return { format: 'sanye-android-backup', version: 1, personalData,
    subscriptions: [{ url: 'https://example.org/sub.json', name: '测试', content: rules, updatedAt: 10 }],
    sourceBindings: [{ key: 'saved:8', context: { content: rules, sourceIndex: 0 } },
      { key: 'history:https://example.org/video:ep:main', context: { content: rules, sourceIndex: 0 } }] }
}
function load(options = {}) {
  const storage = new Map(), calls = [], bindings = new Map()
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    removeItem: key => storage.delete(key),
    setItem: (key, value) => { if (options.storageFailure?.(key, value, calls)) throw new Error('容量不足'); storage.set(key, value) },
  }
  const result = options.result || { savedMedia: 1, watchHistory: 1, settings: 1, savedIdMap: { 8: 21 }, restoredSavedIds: [21], restoredHistory: backup().personalData.watchHistory }
  let pending = null
  const catalog = {
    validatePersonalData: async () => { calls.push('validate'); if (options.invalidNative) throw new Error('原生校验失败') },
    exportPersonalData: async () => ({ data: backup().personalData }),
    importPersonalData: async ({ data, recovery }) => { calls.push('import'); if (options.databaseFailure) throw new Error('事务失败'); pending = recovery; calls.push(data); return result },
    getRestoreState: async () => ({ pending }),
    completeRestore: async ({ token }) => { if (pending?.token === token) pending = null },
  }
  const core = { registerPlugin: () => ({}), Capacitor: { isNativePlatform: () => true } }
  const compile = (file, require) => {
    const exports = {}, context = { exports, require, TextEncoder, URL, localStorage, console, Date, crypto: requireNodeCrypto, setTimeout, clearTimeout }
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, context)
    return exports
  }
  const subscriptions = compile('../sanye_client/src/subscriptions.ts', name => name === 'vue' ? { ref: value => ({ value }) } : name === '@capacitor/core' ? core : { http: { get() { throw new Error('不得访问网络') } } })
  const source = {
    historySourceBindingKey: item => item.sourceKey ? `history:v2:${JSON.stringify([item.sourceKey, item.mediaUrl, item.episodeId, item.lineId])}` : `history:${item.mediaUrl}:${item.episodeId}:${item.lineId}`,
    exportSourceBindings: () => [...bindings].map(([key, context]) => ({ key, context })),
    mergeSourceBindings: entries => {
      calls.push('bindings')
      const merged = new Map(bindings)
      for (const entry of entries) merged.set(entry.key, entry.context)
      localStorage.setItem(bindingsKey, JSON.stringify([...merged]))
      for (const [key, context] of merged) bindings.set(key, context)
    },
  }
  const api = compile('../sanye_client/src/platform/android/personalBackup.ts', name => name === '@capacitor/core' ? core : name === './catalog' ? { androidCatalog: catalog } : name === './source' ? source : subscriptions)
  const reload = () => compile('../sanye_client/src/platform/android/personalBackup.ts', name => name === '@capacitor/core' ? core : name === './catalog' ? { androidCatalog: catalog } : name === './source' ? source : subscriptions)
  return { api, calls, storage, bindings, subscriptions, catalog, reload }
}

test('完整备份保留 SQLite 数据、订阅与来源快照，校验不执行脚本或请求网络', async () => {
  const { api, calls } = load()
  const data = await api.validatePersonalBackup(JSON.stringify(backup()))
  assert.equal(data.sourceBindings.length, 2)
  assert.deepEqual(calls, ['validate'])
})

test('错误版本、额外字段、重复身份、未知记录与越界规则全部拒绝', () => {
  const { api } = load()
  const reject = mutate => { const data = backup(); mutate(data); assert.throws(() => api.parsePersonalBackup(JSON.stringify(data))) }
  reject(data => { data.version = 3 })
  reject(data => { data.personalData.version = '1' })
  reject(data => { data.secret = 'x' })
  reject(data => { data.personalData.savedMedia[0].sourceContext = {} })
  reject(data => { data.personalData.savedMedia.push(data.personalData.savedMedia[0]) })
  reject(data => { data.personalData.watchHistory.push(data.personalData.watchHistory[0]) })
  reject(data => { data.sourceBindings[0].key = 'saved:99' })
  reject(data => { data.sourceBindings.push(data.sourceBindings[0]) })
  reject(data => { data.sourceBindings[0].context.sourceIndex = 1 })
  reject(data => { data.sourceBindings[0].context.content = '' })
  reject(data => { data.subscriptions[0].url = 'https://localhost/sub.json' })
  reject(data => { data.subscriptions[0].updatedAt = -1 })
  assert.throws(() => api.parsePersonalBackup('中'.repeat(api.maxBackupBytes / 2)))
})

test('恢复 id 映射且较新的保存、历史记录不被旧规则覆盖', async () => {
  const { api, bindings, subscriptions } = load()
  const active = subscriptions.subscriptionState.value.active
  const outcome = await api.restorePersonalBackup(backup())
  assert.equal(outcome.partial, false)
  assert.equal(bindings.size, 0)
  assert.equal(bindings.has('saved:8'), false)
  assert.equal(subscriptions.subscriptionState.value.active, active)
  const protectedData = load({ result: { savedMedia: 0, watchHistory: 0, settings: 0, savedIdMap: { 8: 21 }, restoredSavedIds: [], restoredHistory: [] } })
  protectedData.bindings.set('saved:21', { content: '新规则' })
  protectedData.bindings.set(backup().sourceBindings[1].key, { content: '新历史规则' })
  await protectedData.api.restorePersonalBackup(backup())
  assert.equal(protectedData.bindings.get('saved:21').content, '新规则')
  assert.equal(protectedData.bindings.get(backup().sourceBindings[1].key).content, '新历史规则')
})

test('容量预检失败、原生校验失败和数据库事务失败均不导入规则', async () => {
  for (const options of [
    { storageFailure: key => key === 'sanye:backup-capacity-probe:v1' },
    { invalidNative: true }, { databaseFailure: true },
  ]) {
    const state = load(options)
    state.storage.set(subscriptionKey, '原订阅'); state.storage.set(bindingsKey, '原快照')
    const previous = state.subscriptions.subscriptionState.value
    await assert.rejects(state.api.restorePersonalBackup(backup()))
    assert.equal(state.storage.get(subscriptionKey), '原订阅')
    assert.equal(state.storage.get(bindingsKey), '原快照')
    assert.equal(state.subscriptions.subscriptionState.value, previous)
    assert.equal(state.calls.includes('bindings'), false)
    if (!options.databaseFailure) assert.equal(state.calls.includes('import'), false)
  }
})

test('数据库提交后订阅落盘失败保留恢复日志，重启后可重试收口', async () => {
  let failed = true
  const state = load({ storageFailure: (key, value, calls) => failed && key === subscriptionKey && calls.includes('import') && value !== '原订阅' })
  state.storage.set(subscriptionKey, '原订阅'); state.storage.set(bindingsKey, '原快照')
  const previous = state.subscriptions.subscriptionState.value
  const outcome = await state.api.restorePersonalBackup(backup())
  assert.equal(outcome.partial, true)
  assert.match(outcome.message, /来源规则已恢复.*日志已保留/)
  assert.equal(state.storage.get(subscriptionKey), '原订阅')
  assert.equal(state.storage.get(bindingsKey), '原快照')
  assert.equal(state.subscriptions.subscriptionState.value, previous)
  assert.equal(state.bindings.size, 0)
  assert.ok((await state.catalog.getRestoreState()).pending)
  failed = false
  const restarted = state.reload()
  await restarted.retryPendingRestore()
  assert.equal((await state.catalog.getRestoreState()).pending, null)
  assert.equal(state.subscriptions.subscriptionState.value.active, previous.active)
  await restarted.retryPendingRestore()
  assert.equal(state.calls.filter(value => value === 'import').length, 1)
})

test('订阅超出合并上限先拒绝，不触碰 SQLite', async () => {
  const state = load()
  state.subscriptions.subscriptionState.value.items = Array.from({ length: 20 }, (_, index) => ({ url: `https://example.org/${index}.json`, name: '已有', sources: [] }))
  await assert.rejects(state.api.restorePersonalBackup(backup()), /超过 20/)
  assert.equal(state.calls.includes('import'), false)
})

test('旧备份规则按精确记录提升为原生上下文，v2 同地址不同规则可并存', async () => {
  const state = load()
  await state.api.restorePersonalBackup(backup())
  const imported = state.calls.find(value => value && typeof value === 'object')
  assert.equal(imported.version, 2)
  assert.equal(imported.savedMedia[0].sourceContext.content, rules)
  assert.equal(imported.watchHistory[0].sourceContext.sourceIndex, 0)
  const unbound = backup()
  unbound.personalData.savedMedia[0].sourceKey = ''
  assert.equal(state.api.promoteBackupSources(unbound).savedMedia[0].sourceKey, undefined)
  const data = backup()
  data.version = 2; data.personalData.version = 2; data.sourceBindings = []
  data.personalData.savedMedia[0].sourceContext = { content: rules, sourceIndex: 0 }
  const secondRules = rules.replace('来源', '另一来源')
  data.personalData.savedMedia.push({ ...data.personalData.savedMedia[0], id: 9, sourceContext: { content: secondRules, sourceIndex: 0 } })
  data.personalData.watchHistory[0].sourceContext = { content: rules, sourceIndex: 0 }
  data.personalData.watchHistory.push({ ...data.personalData.watchHistory[0], sourceContext: { content: secondRules, sourceIndex: 0 } })
  await state.api.validatePersonalBackup(JSON.stringify(data))
  data.personalData.savedMedia[1].sourceContext = data.personalData.savedMedia[0].sourceContext
  assert.throws(() => state.api.parsePersonalBackup(JSON.stringify(data)))
})
