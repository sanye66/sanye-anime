const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../sanye_client/node_modules/typescript')

const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/subscriptions.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const moduleObject = { exports: {} }
const storage = new Map()
vm.runInNewContext(compiled, {
  module: moduleObject, exports: moduleObject.exports, URL, TextEncoder, Date, setTimeout, clearTimeout,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  require: name => name === 'vue' ? { ref: value => ({ value }) }
    : name === '@capacitor/core' ? { Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }
      : { http: {} },
})
const { pruneSubscriptionContent, parseSubscription, subscriptionChoices, genericWebsiteContent, normalizeSubscriptionContent } = moduleObject.exports

test('任意 HTTPS 网站正文可转换为通用网页来源规则，并保留原网址身份', () => {
  const url = 'https://example.test/catalog/'
  const content = normalizeSubscriptionContent(url, '<!doctype html><html><body><form action="/search" method="get"><input name="wd"></form></body></html>')
  const source = JSON.parse(content).exportedMediaSourceDataList.mediaSources[0]
  assert.equal(source.factoryId, 'web-selector')
  assert.equal(source.arguments.name, 'example.test')
  assert.equal(source.arguments.searchConfig.searchUrl, 'https://example.test/search?wd={keyword}')
  assert.equal(source.arguments.repositoryConfig.url, 'https://example.test/page/{page}')
  assert.equal(normalizeSubscriptionContent(url, content), content)
  assert.match(genericWebsiteContent(url), /example\.test/)
  const pending = JSON.parse(normalizeSubscriptionContent(url, '<html><body>仅有首页</body></html>')).exportedMediaSourceDataList.mediaSources[0]
  assert.equal(pending.factoryId, 'sanye-pending')
  assert.equal(pending.arguments.importStatus, '规则待识别')
})

test('两个网站别名预置为独立来源，刷新使用各自已验证的 HTTPS 内容站点', async () => {
  const state = moduleObject.exports.subscriptionState.value
  const sites = [
    ['https://apps.fengctv.com.cn/', 'https://fcccc.cc/u/?wd={keyword}', 'https://fcccc.cc/k/1-{page}/'],
    ['https://v.dm-ghg.cn/', 'https://omofun.org.cn/u/?wd={keyword}', 'https://omofun.org.cn/h/1-{page}/'],
  ]
  for (const [alias, search, repository] of sites) {
    const item = state.items.find(entry => entry.url === alias)
    assert.ok(item, `${alias} 应出现在默认订阅`)
    const rule = JSON.parse(item.content).exportedMediaSourceDataList.mediaSources[0]
    assert.equal(rule.arguments.searchConfig.searchUrl, search)
    assert.equal(rule.arguments.repositoryConfig.url, repository)
    await moduleObject.exports.refreshSubscription(alias)
    assert.equal(moduleObject.exports.subscriptionState.value.items.find(entry => entry.url === alias).content, item.content)
  }
  assert.equal(storage.get('sanye:subscriptions:site-presets:v1'), '1')
})

test('删掉站点后可用原网址重新添加，旧缓存规则会恢复为当前本地规则', () => {
  const sub = moduleObject.exports
  const alias = 'https://apps.fengctv.com.cn/'
  sub.removeSubscription(alias)
  assert.equal(sub.subscriptionState.value.items.some(item => item.url === alias), false)
  assert.equal(sub.addSitePreset(alias), true)
  assert.equal(sub.subscriptionState.value.items.some(item => item.url === alias), true)
  const state = JSON.parse(storage.get('sanye:subscriptions:v1'))
  const item = state.items.find(entry => entry.url === alias)
  item.content = '{"old":true}'
  storage.set('sanye:subscriptions:v1', JSON.stringify(state))
  const reloaded = { exports: {} }
  vm.runInNewContext(compiled, {
    module: reloaded, exports: reloaded.exports, URL, TextEncoder, Date, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    require: name => name === 'vue' ? { ref: value => ({ value }) }
      : name === '@capacitor/core' ? { Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }
        : { http: {} },
  })
  assert.match(reloaded.exports.subscriptionState.value.items.find(entry => entry.url === alias).content, /fcccc\.cc/)
})

test('默认订阅只为已验证站点增加真实分页目录，保留来源索引和推荐身份', () => {
  const url = 'https://sub.creamycake.org/v1/css1.json'
  const original = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [
    { factoryId: 'web-selector', version: 2, arguments: { name: '其他来源' } },
    { factoryId: 'web-selector', version: 2, arguments: { name: 'wedm', searchConfig: { searchUrl: 'https://www.vdm5.com/search.html?wd={keyword}' } } },
  ] } })
  const result = JSON.parse(pruneSubscriptionContent(url, original))
  const sources = result.exportedMediaSourceDataList.mediaSources
  assert.equal(sources[0].factoryId, 'sanye-retired')
  assert.equal(sources[1].arguments.name, 'wedm')
  assert.equal(sources[1].arguments.repositoryConfig.url, 'https://www.vdm5.com/show_ribendongman--------{page}---.html')
  assert.equal(sources[1].arguments.repositoryConfig.selectNextPage, 'a:contains(下一页)')
  assert.equal(parseSubscription(JSON.stringify(result))[1].name, 'wedm')
  assert.equal(pruneSubscriptionContent('https://example.org/other.json', original), original)
  moduleObject.exports.subscriptionState.value = { items: [{ url, name: '默认订阅', sources: parseSubscription(JSON.stringify(result)), content: JSON.stringify(result) }], active: url, activeSourceIndex: 1 }
  const choices = subscriptionChoices()
  assert.equal(choices.length, 1)
  assert.equal(choices[0].sourceIndex, 1)
  assert.equal(choices[0].recommended, true)
})
