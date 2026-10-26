const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile, mkdir } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

for (const platform of process.env.SANYE_SUBSCRIPTION_PLATFORM === 'android' ? ['android'] : ['android', 'web']) test(`${platform} 订阅添加验证、切换持久化、失败保留与删除不影响原配置`, { timeout: 60000 }, async () => {
  const root = path.resolve(__dirname, platform === 'android' ? '../sanye_client/dist-android' : '../sanye_client/dist')
  const output = path.resolve(__dirname, '../sanye_deploy/.local/subscription-manager')
  const server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
    if (target !== root && !target.startsWith(root + path.sep)) return response.writeHead(403).end()
    try {
      const file = target === root ? path.join(root, 'index.html') : target
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }
      response.setHeader('Content-Type', types[path.extname(file)] || 'text/html')
      response.end(await readFile(file))
    } catch { response.setHeader('Content-Type', 'text/html'); response.end(await readFile(path.join(root, 'index.html'))) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } })
    if (platform === 'android') await page.addInitScript(() => {
      window.androidBridge = {}
      window.subscriptionFetches = []
      window.Capacitor = { getPlatform: () => 'android', PluginHeaders: [
        { name: 'SanyeCatalog', methods: ['getSettings', 'setSettings', 'list', 'listHistory'].map(name => ({ name, rtype: 'promise' })) },
        { name: 'SanyeSource', methods: [{ name: 'fetchSubscription', rtype: 'promise' }] },
      ], nativePromise: async (plugin, method, options) => {
        if (method === 'getSettings') return { settings: { theme: 'light', playbackRate: 1, autoPlay: false } }
        if (method === 'setSettings') return { settings: { theme: 'light', playbackRate: 1, autoPlay: false, ...options.settings } }
        if (method === 'fetchSubscription') {
          const url = options.url
          window.subscriptionFetches.push(url)
          await new Promise(resolve => setTimeout(resolve, 120))
          if (sessionStorage.getItem('fail-subscription') === url) throw new Error('测试网络失败')
          return { content: url.includes('invalid') ? '{}' : JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: url.includes('bt1') ? 'rss' : 'web-selector', version: 2, arguments: { name: '测试来源' } }] } }) }
        }
        return { items: [] }
      } }
    })
    await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: new URL(route.request().url()).pathname.endsWith('/continue-watching') ? [] : { items: [], total: 0, totalPages: 0 } } }))
    await page.route('**/search/subscription?**', route => {
      const url = new URL(route.request().url()).searchParams.get('url')
      const invalid = url.includes('invalid')
      return route.fulfill({ json: { code: 0, data: { content: invalid ? '{}' : JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: url.includes('bt1') ? 'rss' : 'web-selector', version: 2, arguments: { name: '测试来源' } }] } }) } } })
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    if (platform === 'android') await page.getByRole('button', { name: '我的', exact: true }).click()
    else await page.goto(`http://127.0.0.1:${server.address().port}/mine`)
    const manager = page.getByRole('region', { name: '来源订阅' })
    if (platform === 'android') assert.equal(await manager.locator('.subscription-content > .subscription-note, .subscription-domain, .subscription-badge').count(), 0, '安卓不重复显示订阅说明、域名和已选标签')
    assert.equal(await manager.getByLabel('订阅地址').count(), 0, '默认不展开添加表单')
    if (platform === 'android') {
      await manager.getByRole('button', { name: /风车动漫/ }).waitFor()
      await manager.getByRole('button', { name: /动漫共和国/ }).waitFor()
      await manager.getByRole('button', { name: /风车动漫/ }).click()
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).active), 'https://apps.fengctv.com.cn/')
      await manager.getByRole('button', { name: '添加订阅', exact: true }).click()
      await manager.getByLabel('订阅地址').fill('https://example.org/custom.json')
      await manager.getByRole('button', { name: '保存订阅', exact: true }).click()
      await manager.getByText('example.org', { exact: true }).waitFor()
      await manager.getByRole('button', { name: '添加订阅', exact: true }).click()
      await manager.getByLabel('订阅地址').fill('https://127.0.0.1/private.json')
      await manager.getByRole('button', { name: '保存订阅', exact: true }).click()
      await manager.getByRole('alert').filter({ hasText: '公开订阅网址' }).waitFor()
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).active), 'https://apps.fengctv.com.cn/')
      return
    }
    assert.equal(await manager.locator('summary').count(), 0, '网页默认仅显示紧凑设置入口')
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: path.join(output, `${platform}-space-320.png`), fullPage: true })
    if (platform === 'web') await manager.getByRole('button', { name: /来源订阅/ }).click()
    else assert.equal(await manager.locator('.subscription-entry').count(), 0, '安卓直选列表不保留无效折叠按钮')
    assert.equal(await manager.locator('details[open]').count(), 0, '选择入口不依赖展开详情')
    assert.equal(await manager.locator('.subscription-select').first().isVisible(), true)
    await manager.locator('.subscription-select').first().dblclick()
    await manager.locator('.subscription-select[aria-pressed="true"]').waitFor()
    if (platform === 'android') {
      assert.equal(await page.evaluate(() => window.subscriptionFetches.filter(url => url.endsWith('css1.json')).length), 1, '自动读取与连续选择复用同一请求')
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).items.every(item => item.updatedAt))
      assert.equal(await page.evaluate(() => window.subscriptionFetches.length), 1, '打开管理只读取可播放订阅')
    }
    const active = await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).active)
    assert.equal(active, 'https://sub.creamycake.org/v1/css1.json')
    await manager.getByRole('button', { name: '添加订阅', exact: true }).click()
    await manager.getByLabel('订阅名称').fill('自定义 RSS')
    await manager.getByLabel('订阅地址').fill('https://example.org/custom.json')
    await manager.getByRole('button', { name: '保存订阅', exact: true }).click()
    await manager.getByText('自定义 RSS', { exact: true }).waitFor()
    await manager.getByRole('button', { name: '添加订阅', exact: true }).click()
    await manager.getByLabel('订阅地址').fill('https://example.org/invalid.json')
    await manager.getByRole('button', { name: '保存订阅', exact: true }).click()
    await manager.getByRole('alert').waitFor()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).active), active)
    await manager.getByLabel('订阅地址').fill('https://127.0.0.1/private.json')
    await manager.getByRole('button', { name: '保存订阅', exact: true }).click()
    await manager.getByRole('alert').filter({ hasText: '公开订阅网址' }).waitFor()
    if (platform === 'android') await page.evaluate(active => {
      const data = JSON.parse(localStorage.getItem('sanye:subscriptions:v1'))
      data.items.find(item => item.url === active).updatedAt = Date.now() - 25 * 60 * 60 * 1000
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify(data))
      sessionStorage.setItem('fail-subscription', active)
    }, active)
    const cachedContent = await page.evaluate(active => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).items.find(item => item.url === active).content, active)
    await page.reload()
    if (platform === 'android') await page.getByRole('button', { name: '我的', exact: true }).click()
    if (platform === 'web') await manager.getByRole('button', { name: /来源订阅/ }).click()
    await manager.locator('.subscription-select[aria-pressed="true"]').waitFor()
    if (platform === 'android') {
      await manager.getByRole('alert').filter({ hasText: '读取失败，仍使用当前缓存' }).waitFor()
      assert.equal(await page.evaluate(() => window.subscriptionFetches.length), 1, '仅刷新过期订阅，已加载新鲜订阅不重复读取')
      assert.equal(await page.evaluate(active => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).items.find(item => item.url === active).content, active), cachedContent, '失败保留原缓存')
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).active), active, '自动刷新失败保留原选择')
      await page.getByRole('button', { name: '首页', exact: true }).click()
      await page.getByRole('button', { name: '我的', exact: true }).click()
      assert.equal(await page.evaluate(() => window.subscriptionFetches.length), 1, '失败退避期间重新打开不重复请求')
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: path.join(output, `${platform}-320.png`), fullPage: true })
    if (platform === 'web') {
      await manager.locator('summary').first().click()
      await manager.getByRole('button', { name: '删除', exact: true }).first().click()
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).active), active)
      await manager.getByRole('button', { name: '确认删除', exact: true }).click()
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).active), '')
      assert.equal(await manager.getByRole('button', { name: '使用已有来源' }).getAttribute('aria-pressed'), 'true')
    }
    if (platform === 'web') {
      assert.equal(await page.locator('.mine-library-empty').count(), 1, '全空时仅展示一个合并空态')
      await page.route('**/favorites**', route => route.fulfill({ status: 503, json: { code: 503, message: '暂不可用' } }))
      await page.reload()
      await page.getByText('收藏加载失败，请重试。', { exact: true }).waitFor()
      assert.equal(await page.locator('.mine-library-empty').count() > 0, true, '读取失败保留重试入口')
      await page.unroute('**/favorites**')
      await page.reload()
      await manager.getByRole('button', { name: /来源订阅/ }).click()
    }
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      for (const theme of ['light', 'dark']) {
        if (platform === 'android') {
          const toggle = page.locator('.android-theme-toggle')
          const current = await page.locator('.android-app').getAttribute('data-theme')
          if (current !== theme) await toggle.click()
          await page.locator(`.android-app[data-theme="${theme}"]`).waitFor()
        } else await page.evaluate(theme => document.documentElement.dataset.sanyeTheme = theme, theme)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${platform} ${theme} ${width} 不横向溢出`)
        await page.screenshot({ path: path.join(output, `${platform}-manager-${theme}-${width}.png`), fullPage: true })
      }
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
