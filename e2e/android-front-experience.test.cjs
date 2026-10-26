const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile, mkdir } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

test('当前页选订阅、记忆搜索、当前线路分段选集与首页续播形成完整流程', { timeout: 45000 }, async () => {
  const root = path.resolve(__dirname, '../sanye_client/dist-android')
  const server = createServer(async (request, response) => {
    try {
      const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
      if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end()
      response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(await readFile(file === root ? path.join(root, 'index.html') : file))
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    page.setDefaultTimeout(7000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('https://covers.example.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="224"><rect width="160" height="224" fill="#24616a"/></svg>' }))
    await page.addInitScript(() => {
      const subscriptions = ['甲', '乙'].map((name, index) => ({ name, url: `https://example.org/${index}.json`, updatedAt: Date.now(), content: JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 2, arguments: { name } }] } }) }))
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ items: subscriptions, active: subscriptions[0].url }))
      window.__calls = []
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [{ name: 'SanyeCatalog', methods: ['list', 'listHistory', 'getSettings', 'setSettings', 'recordProgress'].map(name => ({ name, rtype: 'promise' })) }, { name: 'SanyeSource', methods: ['subscriptionCapabilities', 'subscriptionSearch', 'subscriptionPreview', 'subscriptionResolve'].map(name => ({ name, rtype: 'promise' })) }],
        nativePromise: async (plugin, method, options) => {
          window.__calls.push({ method, ...options })
          if (method === 'list') return { items: [] }
          if (method === 'listHistory') return { items: [{ mediaUrl: 'https://example.org/old', title: '甲未看完', episodeTitle: '第3集', episodeId: 'ep3', lineId: 'main', positionSeconds: 30, durationSeconds: 100, completed: false, updatedAt: Date.now(), sourceContext: { content: subscriptions[0].content, sourceIndex: 0 } }] }
          if (method === 'getSettings') return { settings: { theme: 'dark', playbackRate: 1, volume: 1, qualityProfile: 'off', frameTarget: 'off' } }
          if (method === 'setSettings') return { settings: { theme: 'dark', playbackRate: 1, volume: 1, qualityProfile: 'off', frameTarget: 'off', ...options.settings } }
          if (method === 'subscriptionCapabilities') return { sources: [] }
          if (method === 'subscriptionSearch') return { hits: [{ title: options.content.includes('甲') ? '甲作品' : '乙作品', sourceUrl: 'https://example.org/work', sourceIndex: 0 }] }
          if (method === 'subscriptionPreview') return { title: options.sourceUrl.endsWith('/old') ? '甲未看完' : options.content.includes('甲') ? '甲作品' : '乙作品', sourceUrl: options.sourceUrl, coverUrl: options.sourceUrl.endsWith('/old') ? 'https://covers.example.org/history.svg' : '', summary: '作品简介', episodes: ['线路甲', '线路乙'].flatMap(line => Array.from({ length: 65 }, (_, i) => ({ id: `${line}-${i + 1}`, title: `第${i + 1}集`, lineId: line, sourceUrl: `https://example.org/${line}/${i + 1}`, playbackUrl: '', mimeType: '' }))) }
          if (method === 'subscriptionResolve') throw new Error('测试不启动媒体')
          return {}
        }, nativeCallback: () => 'listener',
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole('region', { name: '最近观看' }).waitFor().catch(async error => { throw new Error(`${error.message}; 页面=${await page.locator('body').innerText()}; 错误=${JSON.stringify(errors)}; 请求=${JSON.stringify(await page.evaluate(() => window.__calls))}`) })
    await page.getByRole('button', { name: '切换来源订阅' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '乙', exact: true }).click()
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await page.getByRole('button', { name: '首页', exact: true }).getAttribute('aria-current'), 'page')
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '查看 乙作品 详情' }).waitFor()
    assert.equal(await page.getByRole('region', { name: '最近观看' }).count(), 0, '乙订阅不能展示甲续播')
    await page.getByRole('button', { name: '搜索作品与来源' }).click()
    await page.getByLabel('作品关键词').fill('作品')
    await page.locator('.android-source-results li').waitFor()
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByRole('button', { name: '搜索作品与来源' }).click()
    assert.equal(await page.getByLabel('作品关键词').inputValue(), '', '再次进入搜索清空输入，旧词从搜索记忆取回')
    await page.locator('.android-search-memory').getByRole('button', { name: '作品', exact: true }).click()
    await page.locator('.android-source-results li').waitFor()
    await page.getByRole('button', { name: '立即观看' }).click()
    await page.getByRole('group', { name: '选集分段' }).waitFor()
    assert.equal(await page.locator('.android-detail-description p').isVisible(), true, '剧情详情默认展开')
    assert.equal(await page.locator('.android-detail-description p').innerText(), '作品简介')
    assert.equal(await page.locator('.android-detail .android-episode-group').count(), 1)
    assert.equal(await page.locator('.android-detail .android-episode-grid button').count(), 30)
    await page.getByRole('group', { name: '选集分段' }).getByRole('button', { name: '31–60', exact: true }).click()
    assert.equal(await page.locator('.android-detail .android-episode-grid button').first().innerText(), '第31集')
    await page.getByRole('group', { name: '选择播放线路' }).getByRole('button', { name: '线路乙', exact: true }).click()
    assert.equal(await page.locator('.android-detail .android-episode-grid button').first().innerText(), '第1集')
    await page.getByRole('button', { name: '正序', exact: true }).click()
    assert.equal(await page.locator('.android-detail .android-episode-grid button').first().innerText(), '第65集')
    await page.getByRole('button', { name: '倒序', exact: true }).click()
    const output = path.resolve(__dirname, '../.runtime/android-front-experience'); await mkdir(output, { recursive: true })
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      await page.locator('.android-detail-more summary').click()
      const layout = await page.evaluate(() => {
        const more = document.querySelector('.android-detail-more-content').getBoundingClientRect()
        const hero = document.querySelector('.android-detail-hero').getBoundingClientRect()
        const buttons = [...document.querySelectorAll('.android-detail-more-content button')].map(e => e.getBoundingClientRect())
        return { bounded: more.left >= hero.left && more.right <= hero.right, noOverlap: buttons.length < 2 || buttons[0].right <= buttons[1].left, settingBelow: document.querySelector('.android-detail-more .android-setting-row').getBoundingClientRect().top >= Math.max(...buttons.map(e => e.bottom)) }
      })
      assert.ok(layout.bounded && layout.noOverlap && layout.settingBelow, JSON.stringify({ width, layout }))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: path.join(output, `episodes-${width}.png`), fullPage: true })
      await page.locator('.android-detail-more summary').click()
    }
    await page.getByRole('button', { name: '搜索作品与来源' }).click()
    await page.getByRole('button', { name: '切换浅色模式' }).click()
    await page.getByRole('button', { name: '切换来源订阅' }).click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: path.join(output, 'source-sheet.png') })
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.getByRole('button', { name: '历史', exact: true }).click()
    await page.waitForFunction(() => {
      const image = document.querySelector('.android-history-list img')
      return image?.src.endsWith('/history.svg') && image.complete && image.naturalWidth > 0
    })
    const recovered = await page.evaluate(() => window.__calls.find(call => call.method === 'subscriptionPreview' && call.sourceUrl.endsWith('/old')))
    assert.match(recovered.content, /甲/, '旧历史按原订阅补封面，不能使用当前乙订阅')
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.screenshot({ path: path.join(output, 'personal-tabs.png'), fullPage: true })
    assert.equal(await page.getByRole('group', { name: '我的功能' }).count(), 1)
    assert.equal(await page.locator('.android-personal-nav button').count(), 5)
    assert.deepEqual(errors, [])
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
