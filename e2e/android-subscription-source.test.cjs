const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { createServer } = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')

test('安卓订阅走独立桥接，解析失败保留选集，RSS 不进入播放器', { timeout: 30000 }, async () => {
  const root = path.resolve(__dirname, '../sanye_client/dist-android')
  const server = createServer(async (req, res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
      if (!file.startsWith(root + path.sep) && file !== root) return res.writeHead(403).end()
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      res.end(await fs.readFile(file === root ? path.join(root, 'index.html') : file))
    } catch { res.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page.setDefaultTimeout(7000)
    await page.addInitScript(() => {
      const url = 'https://example.org/sub.json'
      const content = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 2, arguments: { name: '测试' } }] } })
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ active: url, items: [{ url, content, updatedAt: 1 }] }))
      window.__calls = []
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: ['SanyeCatalog', 'SanyeSource', 'SanyePlayer', 'App'].map(name => ({ name, methods: (name === 'SanyeSource' ? ['search', 'preview', 'subscriptionSearch', 'subscriptionPreview', 'subscriptionResolve'] : name === 'SanyeCatalog' ? ['list', 'listHistory', 'getSettings', 'recordProgress'] : name === 'App' ? ['getInfo', 'addListener'] : ['setLandscape', 'setImmersive', 'setKeepAwake']).map(name => ({ name, rtype: name === 'addListener' ? 'callback' : 'promise' })) })),
        nativeCallback: async () => 'listener',
        nativePromise: async (plugin, method, options) => {
          window.__calls.push(method)
          if (method === 'list' || method === 'listHistory') return { items: [] }
          if (method === 'getSettings') return { settings: { theme: 'dark', qualityProfile: 'off', frameTarget: 'off', playbackRate: 1 } }
          if (method === 'getInfo') return { version: 'test' }
          if (method === 'subscriptionSearch') return { hits: [{ title: '订阅作品', sourceUrl: 'https://example.org/detail', sourceIndex: options.sourceIndex, coverUrl: '', summary: '', kind: 'web' }, { title: '下载资源', sourceUrl: 'https://example.org/resource', sourceIndex: options.sourceIndex, coverUrl: '', summary: '', kind: 'resource', resourceUrl: 'magnet:?xt=urn:btih:1234' }] }
          if (method === 'subscriptionPreview') return { title: '订阅作品', sourceUrl: options.sourceUrl, coverUrl: '', summary: '', episodes: [1, 2].map(n => ({ id: `https://example.org/play/${n}`, title: `第${n}集`, sourceUrl: `https://example.org/play/${n}`, playbackUrl: '', mimeType: '', lineId: 'main' })) }
          if (method === 'subscriptionResolve') throw new Error('模拟解析失败')
          return {}
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole('button', { name: '搜索作品与来源', exact: true }).click()
    await page.getByRole('textbox', { name: '作品关键词' }).fill('订阅作品')
    await page.locator('.android-search-form').getByRole('button', { name: '搜索来源', exact: true }).click()
    await page.getByRole('link', { name: '外部下载' }).waitFor()
    assert.match(await page.getByRole('link', { name: '外部下载' }).getAttribute('href'), /^magnet:/)
    await page.getByRole('button', { name: '立即观看', exact: true }).click()
    await page.getByRole('region', { name: '作品详情' }).waitFor()
    await page.waitForFunction(() => window.__calls.includes('subscriptionResolve'))
    await page.getByRole('button', { name: '播放第1集', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '播放第2集', exact: true }).count(), 1)
    assert.equal(await page.locator('video').count(), 0)
    assert.equal(await page.evaluate(() => window.__calls.some(name => name === 'search' || name === 'preview')), false)
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})

test('同网址跨订阅与同站多规则的搜索、媒体地址、保存及续播保持真实归属', { timeout: 60000 }, async () => {
  const root = path.resolve(__dirname, '../sanye_client/dist-android')
  const server = createServer(async (req, res) => {
    try {
      const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
      if (!file.startsWith(root + path.sep) && file !== root) return res.writeHead(403).end()
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html')
      res.end(await fs.readFile(file === root ? path.join(root, 'index.html') : file))
    } catch { res.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    page.setDefaultTimeout(7000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const subscriptions = ['甲', '乙'].map(name => ({ name, url: `https://${name === '甲' ? 'a' : 'b'}.example.org/sub.json`, updatedAt: Date.now(), content: JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [0, 1].map(i => ({ factoryId: 'web-selector', version: 2, arguments: { name: `${name}来源${i}` } })) } }) }))
      if (!localStorage.getItem('sanye:subscriptions:v1')) localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ active: subscriptions[0].url, activeSourceIndex: 1, items: subscriptions }))
      window.__sourceCalls = []
      window.__fakeTime = 0
      Object.defineProperties(HTMLMediaElement.prototype, {
        src: { configurable: true, get() { return this.__src || '' }, set(value) { this.__src = value; window.__fakeTime = 0 } },
        currentSrc: { configurable: true, get() { return this.__src || '' } },
        readyState: { configurable: true, get: () => 4 },
        duration: { configurable: true, get: () => 120 },
        currentTime: { configurable: true, get: () => window.__fakeTime, set(value) { window.__fakeTime = value } },
      })
      HTMLMediaElement.prototype.load = function () {}
      HTMLMediaElement.prototype.play = async function () { this.dispatchEvent(new Event('play')) }
      HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event('pause')) }
      const stored = () => JSON.parse(sessionStorage.getItem('native-fixture') || '{"saved":[],"history":[]}')
      const persist = data => sessionStorage.setItem('native-fixture', JSON.stringify(data))
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: ['SanyeCatalog', 'SanyeSource', 'SanyePlayer', 'App'].map(name => ({ name, methods: (name === 'SanyeSource' ? ['search', 'preview', 'subscriptionSearch', 'subscriptionPreview', 'subscriptionResolve'] : name === 'SanyeCatalog' ? ['list', 'save', 'listHistory', 'recordProgress', 'getSettings', 'setSettings'] : name === 'App' ? ['getInfo', 'addListener'] : ['setLandscape', 'setImmersive', 'setKeepAwake']).map(name => ({ name, rtype: name === 'addListener' ? 'callback' : 'promise' })) })),
        nativeCallback: async () => 'listener',
        nativePromise: async (plugin, method, options) => {
          window.__sourceCalls.push({ method, ...options })
          if (method === 'list') return { items: stored().saved }
          if (method === 'listHistory') return { items: stored().history }
          if (method === 'getSettings') return { settings: { theme: 'dark', qualityProfile: 'off', frameTarget: 'off', playbackRate: 1 } }
          if (method === 'setSettings') return { settings: { theme: 'dark', qualityProfile: 'off', frameTarget: 'off', playbackRate: 1, ...options.settings } }
          if (method === 'getInfo') return { version: 'fixture' }
          if (method === 'save') {
            const item = { id: 1, ...options, favorite: false, updatedAt: Date.now() }
            const data = stored(); data.saved = [item, { ...item, id: 2, sourceContext: { ...item.sourceContext, sourceIndex: 0 } }]; persist(data); return { item }
          }
          if (method === 'recordProgress') {
            const item = { ...options, updatedAt: Date.now() }
            const data = stored(); data.history = [item]; persist(data); return { item }
          }
          if (method.startsWith('subscription')) {
            const name = JSON.parse(options.content).exportedMediaSourceDataList.mediaSources[0].arguments.name[0]
            if (method === 'subscriptionSearch') return { hits: [{ title: '同名作品', sourceUrl: 'https://shared.example.org/detail', sourceName: `${name}来源${options.sourceIndex}`, sourceIndex: options.sourceIndex, coverUrl: '', summary: '', kind: 'web' }] }
            if (method === 'subscriptionPreview') {
              if (options.sourceIndex === 0 && window.__delaySecondRule) {
                window.__secondRuleRequested = true
                await new Promise(resolve => setTimeout(resolve, 350))
              }
              return { title: '同名作品', sourceUrl: options.sourceUrl, sourceIndex: options.sourceIndex, coverUrl: '', summary: '', episodes: (options.sourceIndex === 0 ? [2, 3] : [1]).map(number => ({ id: `ep-${number}`, title: `第${number}集`, sourceUrl: `https://shared.example.org/play/${number}`, playbackUrl: '', mimeType: '', lineId: 'main' })) }
            }
            if (method === 'subscriptionResolve') return { playbackUrl: `https://media.example.org/${name === '甲' ? 'a' : 'b'}-${options.sourceIndex}.mp4`, mimeType: 'video/mp4' }
          }
          return {}
        },
      }
    })
    const openSearch = async () => {
      await page.getByRole('button', { name: '搜索作品与来源', exact: true }).click()
      await page.getByRole('textbox', { name: '作品关键词' }).fill('同名作品')
      await page.locator('.android-search-form').getByRole('button', { name: '搜索来源', exact: true }).click()
      await page.waitForFunction(() => document.querySelectorAll('.android-source-results li').length === 1)
      assert.equal(await page.getByRole('group', { name: '筛选搜索来源' }).count(), 0, '当前仅选择一个来源，不展示混源筛选')
    }
    const choose = async (name, sourceIndex = 1) => {
      await page.getByRole('button', { name: '片库', exact: true }).click()
      await page.getByRole('button', { name: '切换来源订阅', exact: true }).click()
      await page.getByRole('button', { name: `${name}来源${sourceIndex}`, exact: true }).click()
      const selection = await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')))
      assert.equal(selection.activeSourceIndex, sourceIndex)
      assert.equal(selection.active, `https://${name === '甲' ? 'a' : 'b'}.example.org/sub.json`)
    }
    const expectMedia = async expected => page.waitForFunction(expected => document.querySelector('video')?.src === expected, expected).catch(async cause => {
      throw new Error(`${cause.message}; 期望=${expected}; 实际=${await page.evaluate(() => document.querySelector('video')?.src)}; 请求=${JSON.stringify(await page.evaluate(() => window.__sourceCalls))}; 页面=${await page.locator('body').innerText()}`)
    })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await openSearch()
    assert.equal(await page.locator('.android-search-form .android-search-hint').count(), 0, '搜索输入不重复显示操作说明')
    assert.equal(await page.locator('.android-source-result-copy small').first().locator('..').locator('small').count(), 1, '搜索结果只保留来源，不逐条显示播放流程说明')
    assert.match(await page.locator('.android-source-results').innerText(), /甲来源1/)
    assert.equal(await page.locator('.android-source-results li').count(), 1, '只返回当前选择的甲来源1')
    await page.getByRole('button', { name: '立即观看', exact: true }).click()
    await expectMedia('https://media.example.org/a-1.mp4')
    await page.evaluate(() => { window.__fakeTime = 25; document.querySelector('video').dispatchEvent(new Event('timeupdate')) })
    await page.locator('.android-detail-more summary').click()
    await page.getByRole('button', { name: '保存到本机', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('native-fixture')).history.length === 1)
    await choose('乙')
    assert.equal(await page.locator('video').count(), 0, '切换订阅必须退出旧来源播放器，不保留旧手动线路')
    await openSearch()
    assert.match(await page.getByLabel('当前来源').innerText(), /乙/)
    assert.match(await page.locator('.android-source-results').innerText(), /乙来源1/)
    const output = path.resolve(__dirname, '../sanye_deploy/.local/android-subscription-identity')
    await fs.mkdir(output, { recursive: true })
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width} 搜索页无横向溢出`)
      await page.screenshot({ path: path.join(output, `search-${width}.png`), fullPage: true })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '切换浅色模式', exact: true }).click()
    await page.locator('.android-app[data-theme="light"]').waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '浅色来源筛选不横向溢出')
    await page.screenshot({ path: path.join(output, 'search-light-390.png'), fullPage: true })
    await page.getByRole('button', { name: '立即观看', exact: true }).click()
    await expectMedia('https://media.example.org/b-1.mp4')
    assert.equal(await page.evaluate(() => window.__fakeTime), 0, '乙不继承甲在同网址的播放进度')
    await page.getByRole('button', { name: '片库', exact: true }).click()
    assert.equal(await page.locator('.android-library-open').count(), 0, '已选乙订阅的仓库不能混入甲保存作品')
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByRole('button', { name: '樱花动漫', exact: true }).click()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.locator('.android-library-open').first().click()
    await expectMedia('https://media.example.org/a-1.mp4')
    await page.evaluate(() => {
      window.__fakeTime = 0
      window.__delaySecondRule = true
      const originalNow = Date.now
      Date.now = () => originalNow() + 120_000
    })
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.android-library-open').length === 2)
    await page.locator('.android-library-open').nth(1).click()
    await page.waitForFunction(() => window.__secondRuleRequested)
    assert.equal(await page.locator('.android-detail .android-episode-grid button').count(), 0, '同网址换规则时不沿用上一规则的选集占位')
    await expectMedia('https://media.example.org/a-0.mp4')
    assert.equal(await page.getByRole('button', { name: '播放第2集', exact: true }).count(), 1, '只显示当前规则返回的选集')
    // 不再写新的进度，保留甲的历史；重启页面时当前订阅仍是乙。
    await page.evaluate(() => { window.__fakeTime = 0 })
    await choose('乙')
    await page.reload()
    await page.getByRole('button', { name: '历史', exact: true }).click()
    await page.getByRole('button', { name: '继续播放', exact: true }).click()
    await expectMedia('https://media.example.org/a-1.mp4')
    await page.getByRole('button', { name: '排期', exact: true }).click()
    await page.getByText('当前订阅未提供排期信息。', { exact: true }).waitFor()
    assert.equal(await page.locator('.android-page-section[aria-label="一周排期"] ul').count(), 0, '订阅没有排期时不显示随包排期')
    await choose('甲', 0)
    await openSearch()
    assert.match(await page.locator('.android-source-results').innerText(), /甲来源0/)
    await page.getByRole('button', { name: '立即观看', exact: true }).click()
    await expectMedia('https://media.example.org/a-0.mp4')
    assert.equal(await page.getByRole('button', { name: '播放第1集', exact: true }).count(), 0, '同订阅切换规则不沿用上一规则选集')
    await choose('甲')
    await openSearch()
    assert.match(await page.locator('.android-source-results').innerText(), /甲来源1/)
    await page.getByRole('button', { name: '立即观看', exact: true }).click()
    await expectMedia('https://media.example.org/a-1.mp4')
    const calls = await page.evaluate(() => window.__sourceCalls)
    assert.equal(calls.some(call => call.method === 'search' || call.method === 'preview'), false, '订阅链路不回落内置桥接')
    assert.ok(calls.some(call => call.method === 'subscriptionResolve' && call.sourceIndex === 1 && call.content.includes('甲')))
    assert.ok(calls.some(call => call.method === 'subscriptionSearch' && call.sourceIndex === 0 && call.content.includes('甲')), '同地址规则切换会真实改变搜索请求')
    assert.ok(calls.filter(call => call.method === 'subscriptionSearch').every(call => [0, 1].includes(call.sourceIndex)), '每次搜索都显式携带当前唯一来源编号')
    assert.deepEqual(errors, [])
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('sanye:subscriptions:v1'))
      delete state.items.find(item => item.url === state.active).content
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify(state))
    })
    await page.reload()
    assert.equal(await page.locator('.android-hero').count(), 1, '订阅未就绪时首页仍保留固定作品')
    await page.getByRole('button', { name: '搜索作品与来源', exact: true }).click()
    await page.getByRole('textbox', { name: '作品关键词' }).fill('同名作品')
    await page.locator('.android-search-form').getByRole('button', { name: '搜索来源', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '来源未就绪' }).waitFor()
    assert.equal(await page.evaluate(() => window.__sourceCalls.some(call => call.method === 'search' || call.method === 'preview')), false, '未就绪订阅不隐式调用内置来源')
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
