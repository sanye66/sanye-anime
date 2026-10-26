const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { createServer } = require('node:http')
const { readFile, mkdir } = require('node:fs/promises')
const path = require('node:path')

test('安卓仓库使用当前订阅真实候选、首屏封面回退与来源切换隔离', { timeout: 45000 }, async () => {
  const root = path.resolve(__dirname, '../sanye_client/dist-android')
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
      if (!file.startsWith(root + path.sep)) return res.writeHead(403).end()
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' }
      res.setHeader('Content-Type', types[path.extname(file)] || 'text/html')
      res.end(await readFile(file))
    } catch { res.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    page.setDefaultTimeout(7000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://img.example.org/**', route => route.abort())
    await page.addInitScript(() => {
      const items = ['甲', '乙'].map((name, i) => ({ name, url: `https://source${i}.example.org/sub.json`, updatedAt: Date.now(), content: JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 2, arguments: { name } }] } }) }))
      items.push({ ...items[1], name: '同规则订阅', url: 'https://source2.example.org/sub.json' })
      items.push({ name: '网页来源订阅', url: 'https://sub.creamycake.org/v1/css1.json', updatedAt: Date.now(), content: JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 2, arguments: { name: 'wedm' } }] } }) })
      items.push({ name: '待加载', url: 'https://cold.example.org/sub.json', sources: [] })
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ active: items[0].url, items }))
      window.__calls = []
      window.androidBridge = {}
      const listeners = new Map()
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: ['SanyeCatalog', 'SanyeSource', 'SanyePlayer', 'App'].map(name => ({ name, methods: (name === 'SanyeSource' ? ['search', 'preview', 'subscriptionSearch', 'subscriptionPreview', 'subscriptionResolve', 'subscriptionCapabilities', 'subscriptionRepository', 'fetchSubscription', 'addListener', 'removeListener'] : name === 'SanyeCatalog' ? ['list', 'listHistory', 'getSettings', 'recordProgress'] : name === 'App' ? ['getInfo', 'addListener'] : ['setLandscape', 'setImmersive', 'setKeepAwake']).map(name => ({ name, rtype: ['addListener', 'removeListener'].includes(name) ? 'callback' : 'promise' })) })),
        nativeCallback: async (plugin, method, options, callback) => {
          if (plugin === 'SanyeSource' && method === 'addListener') listeners.set('listener', callback)
          if (method === 'removeListener') listeners.delete(options.callbackId)
          return 'listener'
        },
        nativePromise: async (plugin, method, options) => {
          window.__calls.push({ method, ...options })
          if (method === 'fetchSubscription') {
            await new Promise(resolve => { window.__completeCold = resolve })
            return { content: JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 2, arguments: { name: '丙' } }] } }) }
          }
          if (method === 'list') return { items: [{ id: 9, title: '其他订阅保存作品', url: 'https://old.example.org/work/9', favorite: true, updatedAt: Date.now() }] }
          if (method === 'listHistory') return { items: [] }
          if (method === 'getSettings') return { settings: { theme: 'dark', qualityProfile: 'off', frameTarget: 'off', playbackRate: 1 } }
          if (method === 'getInfo') return { version: 'test' }
          if (method === 'subscriptionCapabilities') return { sources: window.__directory ? [{ sourceIndex: 0, search: true, repository: true, pagination: true }] : [] }
          if (method === 'subscriptionRepository') return { hits: window.__largeDirectory ? Array.from({ length: options.page === 3 ? 5 : 100 }, (_, index) => ({ title: `乙目录作品${(options.page - 1) * 100 + index}`, sourceUrl: `https://b.example.org/directory/item/${(options.page - 1) * 100 + index}`, sourceIndex: 0 })) : [{ title: `乙目录第${options.page}页`, sourceUrl: `https://b.example.org/directory/${options.page}`, sourceIndex: 0 }], sourceIndex: 0, page: options.page, hasMore: window.__largeDirectory ? options.page < 3 : options.page === 1, nextPage: window.__largeDirectory ? options.page < 3 ? options.page + 1 : undefined : options.page === 1 ? 2 : undefined, warnings: [], truncated: !!window.__largeDirectory && options.page !== 3 }
          if (method === 'subscriptionSearch') {
            if (options.keyword !== '动漫') {
              window.__homeTitle = options.keyword
              return { hits: [{ title: options.keyword, sourceUrl: 'https://a.example.org/work/home', sourceIndex: 0, coverUrl: '', summary: '' }] }
            }
            if (window.__emptySubscription) return { hits: [], completed: 1, total: 1 }
            const name = JSON.parse(options.content).exportedMediaSourceDataList.mediaSources[0].arguments.name
            const hits = Array.from({ length: 48 }, (_, i) => ({ title: `${name}作品${i}`, sourceUrl: `https://${name === '甲' ? 'a' : 'b'}.example.org/work/${i}`, sourceIndex: options.sourceIndex, sourceName: `${name}来源`, coverUrl: 'https://img.example.org/broken.jpg', responseMs: i * 10, summary: '', kind: 'web' }))
            for (const callback of listeners.values()) callback({ requestId: options.requestId, hits: hits.slice(0, 2), completed: 1, total: 2 })
            await new Promise(resolve => setTimeout(resolve, name === '甲' && window.__delayA ? 800 : 100))
            if (name === '甲' && window.__delayA) window.__lateA = true
            return { hits, completed: 2, total: 2 }
          }
          if (method === 'subscriptionPreview') return { title: options.sourceUrl.endsWith('/home') ? window.__homeTitle : `${options.sourceUrl.includes('//a.') ? '甲' : '乙'}作品${options.sourceUrl.split('/').at(-1)}`, sourceUrl: options.sourceUrl, coverUrl: '', summary: '', episodes: [1, 2].map(n => ({ id: options.sourceUrl + `/ep/${n}`, title: `第${n}集`, sourceUrl: options.sourceUrl + `/ep/${n}`, playbackUrl: '', mimeType: '', lineId: 'main' })) }
          return {}
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.locator('.android-hero').waitFor()
    const fixedTitles = await page.locator('.android-catalog-copy strong').allTextContents()
    const fixedCover = await page.locator('.android-catalog-open img').first().getAttribute('src')
    assert.ok(fixedTitles.length > 0)
    assert.equal(await page.locator('.android-subscription-catalog').count(), 0, '首页固定作品不被当前订阅仓库覆盖')
    await page.locator('.android-catalog-open').first().click()
    await page.getByRole('button', { name: '播放第1集', exact: true }).waitFor()
    assert.equal(await page.locator('.android-detail-cover').getAttribute('src'), fixedCover, '解析没有封面时保留首页封面')
    assert.equal(await page.evaluate(() => window.__calls.some(call => call.method === 'preview' || call.method === 'search')), false, '首页详情选集只解析当前订阅')
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.android-subscription-catalog li').length >= 2)
    assert.equal(await page.locator('.android-subscription-catalog button').first().isEnabled(), true)
    await page.waitForFunction(() => document.querySelectorAll('.android-subscription-catalog li').length === 40).catch(async cause => {
      throw new Error(`${cause.message}; 页面错误=${JSON.stringify(errors)}; 请求=${JSON.stringify(await page.evaluate(() => window.__calls))}; 页面=${await page.locator('body').innerText()}`)
    })
    assert.deepEqual(errors, [])
    assert.match(await page.locator('.android-subscription-catalog').innerText(), /甲作品0/)
    assert.equal(await page.locator('.android-source-context small, .android-source-context [role="status"]').count(), 0, '已就绪来源只显示名称，不常驻额外提示')
    assert.equal(await page.locator('.android-catalog-copy').first().locator('small').count(), 1, '作品卡片只保留一行来源')
    assert.match(await page.locator('.android-repository-count').innerText(), /已显示 40 部 · 已读取 48 部.*当前只显示搜索候选/)
    await page.getByRole('button', { name: '排序：来源顺序' }).click()
    assert.equal(await page.getByRole('group', { name: '作品排序方式' }).isVisible(), true)
    const output = path.resolve(__dirname, '../sanye_deploy/.local/android-repository-source')
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: path.join(output, 'sort-open-390.png') })
    await page.getByRole('group', { name: '作品排序方式' }).getByRole('button', { name: /^名称/ }).click()
    assert.equal(await page.getByRole('button', { name: '排序：名称' }).getAttribute('aria-expanded'), 'false')
    await page.getByRole('button', { name: '排序：名称' }).click()
    await page.getByRole('group', { name: '作品排序方式' }).getByRole('button', { name: /^来源顺序/ }).press('Escape')
    assert.equal(await page.getByRole('group', { name: '作品排序方式' }).count(), 0)
    await page.getByRole('button', { name: '显示更多已读取作品' }).click()
    assert.equal(await page.locator('.android-subscription-catalog li').count(), 48)
    assert.equal(await page.locator('.android-subscription-catalog img').first().getAttribute('loading'), 'eager')
    await page.waitForFunction(() => { const image = document.querySelector('.android-subscription-catalog img'); return image?.complete && image.naturalWidth > 0 && !image.src.startsWith('https://img.example.org/') })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: path.join(output, 'repository-390.png') })
    await page.getByRole('button', { name: '片库', exact: true }).click()
    assert.equal(await page.locator('.android-subscription-catalog li').count(), 48, '番剧仓库能继续展示已读取候选')
    assert.equal(await page.locator('.android-library').count(), 0, '当前订阅仓库不得混入其他订阅保存作品')
    await page.locator('.android-subscription-catalog button').first().tap()
    await page.getByRole('region', { name: '作品详情' }).waitFor()
    await page.getByRole('button', { name: '播放第1集', exact: true }).waitFor().catch(async cause => { throw new Error(`${cause.message}; 页面=${await page.locator('body').innerText()}; 请求=${JSON.stringify(await page.evaluate(() => window.__calls))}`) })
    assert.equal(await page.getByRole('button', { name: '播放第1集', exact: true }).count(), 1)
    await page.getByRole('button', { name: '首页', exact: true }).click()
    assert.deepEqual(await page.locator('.android-catalog-copy strong').allTextContents(), fixedTitles)
    await page.evaluate(() => { window.__delayA = true })
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '刷新作品', exact: true }).click()
    await page.getByRole('button', { name: '我的', exact: true }).click()
    assert.equal(await page.locator('.subscription-entry').count(), 0, '安卓订阅直接可选，不保留无效折叠入口')
    assert.equal(await page.locator('.subscription-source-list .subscription-recommended').allTextContents().then(values => values.join(',')), '推荐', '仅给已验证来源显示推荐')
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '切换来源订阅', exact: true }).click()
    assert.equal(await page.locator('.android-source-choice .android-source-recommended').allTextContents().then(values => values.join(',')), '推荐', '切换弹窗与管理页使用相同推荐判定')
    for (const [name, alias, host] of [
      ['风车动漫', 'https://apps.fengctv.com.cn/', 'fcccc.cc'],
      ['动漫共和国', 'https://v.dm-ghg.cn/', 'omofun.org.cn'],
    ]) {
      await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}`) }).click()
      const selected = await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('sanye:subscriptions:v1'))
        return { active: state.active, content: state.items.find(item => item.url === state.active)?.content }
      })
      assert.equal(selected.active, alias)
      assert.match(selected.content, new RegExp(host.replaceAll('.', '\\.')))
      await page.getByRole('button', { name: '切换来源订阅', exact: true }).click()
    }
    await page.getByRole('button', { name: '乙', exact: true }).first().click()
    await page.getByRole('button', { name: '首页', exact: true }).click()
    assert.deepEqual(await page.locator('.android-catalog-copy strong').allTextContents(), fixedTitles, '切换订阅仍保留首页全部固定作品')
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '查看 乙作品0 详情', exact: true }).waitFor()
    await page.waitForFunction(() => window.__lateA === true)
    assert.doesNotMatch(await page.locator('.android-subscription-catalog').innerText(), /甲作品/)
    const cachedRequests = await page.evaluate(() => window.__calls.filter(call => call.method === 'subscriptionSearch').length)
    await page.getByRole('button', { name: '切换来源订阅', exact: true }).click()
    await page.getByRole('button', { name: '甲', exact: true }).click()
    await page.getByRole('button', { name: '查看 甲作品0 详情', exact: true }).waitFor()
    await page.getByRole('button', { name: '切换来源订阅', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '待加载', exact: true }).count(), 0, '尚未读取的订阅不能伪装成可选择来源')
    await page.getByRole('button', { name: '乙', exact: true }).first().click()
    assert.equal(await page.getByRole('dialog').count(), 0, '已有来源立即选择，不等待其他订阅读取')
    assert.match(await page.getByLabel('当前来源').innerText(), /乙/)
    await page.getByRole('button', { name: '查看 乙作品0 详情', exact: true }).waitFor()
    await page.evaluate(() => window.__completeCold())
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).items.some(item => item.name === '待加载' && item.content)).catch(async cause => { throw new Error(`${cause.message}; 请求=${JSON.stringify(await page.evaluate(() => window.__calls.filter(call => call.method === 'fetchSubscription')))}; 状态=${await page.evaluate(() => localStorage.getItem('sanye:subscriptions:v1'))}; 错误=${JSON.stringify(errors)}`) })
    assert.match(await page.getByLabel('当前来源').innerText(), /乙/, '取消的迟到订阅读取不能覆盖最后一次选择')
    assert.equal(await page.evaluate(() => window.__calls.filter(call => call.method === 'subscriptionSearch').length), cachedRequests, '切回已读取订阅直接复用其独立缓存')
    const calls = await page.evaluate(() => window.__calls.filter(call => call.method === 'subscriptionSearch'))
    assert.ok(calls.some(call => call.content.includes('甲')))
    assert.ok(calls.some(call => call.content.includes('乙')))
    assert.ok(calls.every(call => call.sourceIndex === 0), '仓库搜索始终使用当前选中的唯一来源')
    assert.ok(calls.every(call => call.keyword === '动漫' || call.keyword === fixedTitles[0]))
    await page.evaluate(() => { window.__directory = true })
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '刷新作品', exact: true }).click()
    await page.getByRole('button', { name: '查看 乙目录第1页 详情', exact: true }).waitFor()
    await page.getByRole('button', { name: '读取下一页', exact: true }).click()
    await page.getByRole('button', { name: '查看 乙目录第2页 详情', exact: true }).waitFor()
    const directoryCalls = await page.evaluate(() => window.__calls.filter(call => call.method === 'subscriptionRepository'))
    assert.deepEqual(directoryCalls.map(call => call.page), [1, 2])
    assert.ok(directoryCalls.every(call => call.sourceIndex === 0 && call.content.includes('乙')))
    await page.screenshot({ path: path.join(output, 'declared-directory-390.png') })
    await page.evaluate(() => { window.__largeDirectory = true })
    await page.getByRole('button', { name: '刷新作品', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.android-repository-count')?.textContent?.includes('已读取 100 部'))
    await page.getByRole('button', { name: '显示更多已读取作品' }).click()
    await page.getByRole('button', { name: '显示更多已读取作品' }).click()
    await page.getByRole('button', { name: '读取下一页' }).click()
    await page.waitForFunction(() => document.querySelector('.android-repository-count')?.textContent?.includes('已读取 200 部'))
    await page.getByRole('button', { name: '显示更多已读取作品' }).click()
    await page.getByRole('button', { name: '读取下一页' }).click()
    await page.waitForFunction(() => document.querySelector('.android-repository-count')?.textContent?.includes('已读取 205 部'))
    assert.equal(await page.locator('.android-subscription-catalog li').count(), 205, '已读取的目录不得截断为 200 部')
    assert.match(await page.locator('.android-repository-count').innerText(), /部分页面达到读取上限/, '来源单页上限不能显示为完整片库')
    await page.evaluate(() => { window.__largeDirectory = false })
    await page.evaluate(() => { window.__directory = false })
    await page.getByRole('button', { name: '我的', exact: true }).click()
    const before = await page.evaluate(() => window.__calls.filter(call => call.method === 'subscriptionSearch').length)
    await page.evaluate(() => { window.__emptySubscription = true })
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '切换来源订阅', exact: true }).click()
    await page.locator('.android-source-choice').filter({ hasText: '乙' }).nth(1).click()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.waitForFunction(count => window.__calls.filter(call => call.method === 'subscriptionSearch').length > count, before)
    assert.equal(await page.locator('.android-subscription-catalog li').count(), 0, '不同地址同正文的订阅切换仍应清掉旧结果，不借用原订阅缓存')
    assert.equal(await page.locator('.android-library').count(), 0)
    await page.screenshot({ path: path.join(output, 'current-subscription-empty-390.png') })
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByRole('button', { name: '樱花动漫', exact: true }).click()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '查看 其他订阅保存作品 详情', exact: true }).waitFor()
    await page.screenshot({ path: path.join(output, 'local-preserved-390.png') })
    assert.deepEqual(errors, [])
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
