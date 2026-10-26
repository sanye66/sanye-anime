const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../sanye_client/node_modules/typescript')
const vue = require('../sanye_client/node_modules/vue')
const url = 'https://example.org/sub.json'
const content = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [
  { factoryId: 'unsupported', version: 1, arguments: { name: '不支持' } },
  { factoryId: 'web-selector', version: 2, arguments: { name: '来源甲' } },
  { factoryId: 'web-selector', version: 2, arguments: { name: '来源乙' } },
] } })
function fixture(saved = {}, bridge = {}) {
  const storage = new Map([['sanye:subscriptions:v1', JSON.stringify({ active: url, items: [{ url, name: '合集', content }], ...saved })], ['sanye:subscriptions:site-presets:v1', '1']])
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  const modules = {}
  function load(file) {
    const module = { exports: {} }
    const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../sanye_client/src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(code, { module, exports: module.exports, TextEncoder, URL, localStorage, setTimeout, clearTimeout, performance, require(name) {
      if (name === 'vue') return vue
      if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => true }, registerPlugin: () => bridge }
      if (name === '../../subscriptions') return modules.subscriptions
      if (name === './experience') return { measureExperience: () => () => {}, recordExperience: () => {} }
      return {}
    } })
    return module.exports
  }
  modules.subscriptions = load('subscriptions.ts')
  return { subscriptions: modules.subscriptions, source: () => load('platform/android/source.ts'), repository: () => load('platform/android/repository.ts'), storage }
}
test('旧合集迁移选择第一条可用来源，保留原索引与所有订阅，切换可持久化', () => {
  const { subscriptions: sub, storage } = fixture()
  assert.equal(sub.activeSubscriptionSourceIndex(), 1)
  assert.deepEqual(Array.from(sub.subscriptionChoices(), item => [item.name, item.sourceIndex]), [['来源甲', 1], ['来源乙', 2]])
  assert.equal(sub.subscriptionState.value.items.length, 1)
  const before = sub.activeSubscriptionScope()
  sub.selectSubscription(url, 2)
  assert.notEqual(sub.activeSubscriptionScope(), before)
  assert.equal(JSON.parse(storage.get('sanye:subscriptions:v1')).activeSourceIndex, 2)
  assert.throws(() => sub.selectSubscription(url, 0), /来源不可用/)
  sub.selectSubscription('')
  assert.equal(sub.activeSubscriptionContent(), '')
  assert.equal(sub.activeSubscriptionSourceIndex(), -1)
})
test('同一合集选择不同来源只发送一次带原索引的请求，缓存与结果上下文隔离', async () => {
  const calls = []
  const f = fixture({}, { async subscriptionSearch(options) {
    calls.push(options)
    return { hits: [{ title: '作品', sourceUrl: 'https://example.org/work', sourceIndex: options.sourceIndex }], completed: 1, total: 1 }
  }, async search(options) { calls.push(options); return { hits: [] } } })
  const { androidSource } = f.source()
  const first = await androidSource.search({ keyword: '作品' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].sourceIndex, 1)
  assert.equal(first.hits[0].sourceContext.sourceIndex, 1)
  f.subscriptions.selectSubscription(url, 2)
  const second = await androidSource.search({ keyword: '作品' })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].sourceIndex, 2)
  assert.equal(second.hits[0].sourceContext.sourceIndex, 2)
  await androidSource.search({ keyword: '作品' })
  assert.equal(calls.length, 2)
  f.subscriptions.selectSubscription('')
  await androidSource.search({ keyword: '作品' })
  assert.equal(calls.length, 3)
  assert.equal(calls[2].content, undefined)
})
test('迁移保留旧 BT 订阅及没有缓存的用户订阅，已选索引重启不变', () => {
  const saved = { activeSourceIndex: 2, items: [{ url, name: '合集', content }, { url: 'https://sub.creamycake.org/v1/bt1.json', name: '旧订阅' }, { url: 'https://example.org/pending.json', name: '未加载' }] }
  const { subscriptions: sub } = fixture(saved)
  assert.equal(sub.subscriptionState.value.items.length, 3)
  assert.equal(sub.activeSubscriptionSourceIndex(), 2)
})
test('目录能力只保留选中原索引，目录请求和作品快照使用相同索引', async () => {
  const calls = []
  const f = fixture({}, {
    async subscriptionCapabilities() { return { sources: [{ sourceIndex: 1 }, { sourceIndex: 2 }] } },
    async subscriptionRepository(options) { calls.push(options); return { sourceIndex: options.sourceIndex, page: options.page, hits: [{ sourceIndex: options.sourceIndex }], hasMore: false } },
  })
  const { androidRepository } = f.repository()
  const capabilities = await androidRepository.capabilities(content, 2)
  assert.equal(capabilities.length, 1)
  assert.equal(capabilities[0].sourceIndex, 2)
  const page = await androidRepository.readPage({ content, sourceIndex: 2 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].sourceIndex, 2)
  assert.equal(page.hits[0].sourceContext.sourceIndex, 2)
})
test('相同作品地址的详情、播放解析始终传递结果自身来源快照', async () => {
  const calls = []
  const f = fixture({}, {
    async subscriptionSearch(options) { return { hits: [{ sourceUrl: 'https://example.org/work', sourceIndex: options.sourceIndex }] } },
    async subscriptionPreview(options) { calls.push(options); return { sourceIndex: options.sourceIndex, episodes: [] } },
    async subscriptionResolve(options) { calls.push(options); return { playbackUrl: 'https://example.org/media.m3u8' } },
  })
  const { androidSource } = f.source()
  const first = (await androidSource.search({ keyword: '作品' })).hits[0]
  f.subscriptions.selectSubscription(url, 2)
  await androidSource.search({ keyword: '作品' })
  await androidSource.preview({ sourceUrl: first.sourceUrl, sourceContext: first.sourceContext })
  await androidSource.resolve(first.sourceUrl, first.sourceContext)
  assert.deepEqual(calls.map(call => call.sourceIndex), [1, 1])
})
test('切换后旧请求不能发布结果，跨来源响应拒绝进入结果和缓存', async () => {
  let finish
  const f = fixture({}, { subscriptionSearch: () => new Promise(resolve => { finish = resolve }) })
  const { androidSource } = f.source()
  let published = 0
  const pending = androidSource.search({ keyword: '作品' }, () => published++)
  f.subscriptions.selectSubscription(url, 2)
  finish({ hits: [{ sourceIndex: 1 }] })
  await assert.rejects(pending, { code: 'E_SEARCH_CANCELLED' })
  assert.equal(published, 0)
  const invalid = androidSource.search({ keyword: '作品' })
  finish({ hits: [{ sourceIndex: 1 }] })
  await assert.rejects(invalid, /与当前来源不匹配/)
})
test('默认合集只列出本轮可播放来源，旧选择迁移且保留原规则与历史正文', () => {
  const defaultUrl = 'https://sub.creamycake.org/v1/css1.json'
  const content = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: ['叽哔动漫', '樱花动漫', '番茄动漫', 'wedm'].map(name => ({ factoryId: 'web-selector', version: 2, arguments: { name } })) } })
  const { subscriptions: sub } = fixture({ active: defaultUrl, activeSourceIndex: 0, items: [{ url: defaultUrl, content }] })
  assert.equal(sub.activeSubscriptionSourceIndex(), 3)
  assert.deepEqual(Array.from(sub.subscriptionChoices(), x => [x.name, x.sourceIndex]), [['wedm', 3]])
  assert.equal(sub.subscriptionState.value.items[0].sources.length, 4)
  assert.throws(() => sub.selectSubscription(defaultUrl, 2), /来源不可用/)
})

test('迁移、刷新和备份都删除失效规则正文，不挪动保留节点编号', async()=>{
 const defaultUrl='https://sub.creamycake.org/v1/css1.json';const content=JSON.stringify({exportedMediaSourceDataList:{mediaSources:[{factoryId:'web-selector',version:2,arguments:{name:'樱花动漫',searchConfig:{searchUrl:'https://failed.example.org/search'}}},{factoryId:'web-selector',version:2,arguments:{name:'wedm',searchConfig:{searchUrl:'https://www.vdm5.com/search'}}}]}});const f=fixture({active:defaultUrl,activeSourceIndex:0,items:[{url:defaultUrl,content}]},{fetchSubscription:async()=>({content})});const sub=f.subscriptions;assert.equal(sub.activeSubscriptionSourceIndex(),1);const check=()=>{const item=sub.subscriptionState.value.items[0];assert.equal(item.sources[0].retired,true);assert.equal(item.sources[1].name,'wedm');assert.ok(!item.content.includes('failed.example.org'));assert.equal(sub.subscriptionChoices().length,1)};check();await sub.refreshSubscription(defaultUrl);check();sub.mergeSubscriptionBackup([{url:defaultUrl,name:'旧备份',content,updatedAt:Date.now()+1000}]);check();assert.equal(sub.pruneSubscriptionContent(defaultUrl,sub.subscriptionState.value.items[0].content),sub.subscriptionState.value.items[0].content);assert.equal(sub.pruneSubscriptionContent('https://custom.example.org/sub.json',content),content)
})
