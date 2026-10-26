const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5190'

async function installSyntheticMedia(page) {
  await page.addInitScript(() => {
    Object.defineProperties(HTMLMediaElement.prototype, {
      src: { configurable: true, get() { return this.__testSrc || '' }, set(value) {
        this.__testSrc = value
        this.__testTime = 0.5
        queueMicrotask(() => {
          this.dispatchEvent(new Event('loadedmetadata'))
          this.dispatchEvent(new Event('loadeddata'))
          this.dispatchEvent(new Event('timeupdate'))
        })
      } },
      currentSrc: { configurable: true, get() { return this.__testSrc || '' } },
      currentTime: { configurable: true, get() { return this.__testTime || 0 }, set(value) { this.__testTime = value } },
      readyState: { configurable: true, get() { return 4 } },
      duration: { configurable: true, get() { return 30 } },
      paused: { configurable: true, get() { return !this.__testPlaying } },
    })
    HTMLMediaElement.prototype.load = function () { queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))) }
    HTMLMediaElement.prototype.play = async function () {
      this.__testPlaying = true
      this.__testTime = Math.max(0.5, this.__testTime || 0)
      this.dispatchEvent(new Event('play'))
      this.dispatchEvent(new Event('loadeddata'))
      this.dispatchEvent(new Event('timeupdate'))
      this.dispatchEvent(new Event('playing'))
    }
    HTMLMediaElement.prototype.pause = function () { this.__testPlaying = false; this.dispatchEvent(new Event('pause')) }
  })
}

test('订阅搜索进入选集，点击只解析当前集，切换配置不复用旧结果', { timeout: 45000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const resolved = []
    await installSyntheticMedia(page)
    await page.addInitScript(() => {
      const url = 'https://example.org/sub.json'
      const content = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 2, arguments: { name: '测试来源' } }] } })
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ active: url, items: [{ url, name: '测试订阅', content, updatedAt: 1 }] }))
    })
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      const body = route.request().postDataJSON()
      let data = []
      if (url.pathname.endsWith('/subscription/search')) data = [{ title: '订阅作品', sourceUrl: 'https://example.org/anime/1', type: 'anime' }]
      else if (url.pathname.endsWith('/subscription/preview')) data = { title: '订阅作品', sourceUrl: body.sourceUrl, tags: [], type: 'anime', episodes: [1, 2].map(n => ({ id: n, episodeNo: n, title: `第${n}集`, sourcePageUrl: `https://example.org/play/${n}`, playbackUrl: '', mimeType: '', sourceLabel: '主线' })) }
      else if (url.pathname.endsWith('/subscription/resolve')) {
        resolved.push(body.sourceUrl)
        data = { url: `https://example.org/video/${body.sourceUrl.endsWith('/2') ? 2 : 1}.mp4`, mimeType: 'video/mp4', warnings: [] }
      }
      await route.fulfill({ json: { code: 0, data } })
    })
    await page.goto(origin + '/search?keyword=订阅作品')
    await page.getByRole('link', { name: '直接观看' }).click()
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2)
    assert.equal(resolved[0], 'https://example.org/play/1')
    assert.equal(resolved.includes('https://example.org/play/2'), false)
    await page.getByRole('button', { name: /第2集/ }).click()
    await page.waitForFunction(() => document.querySelector('video')?.src.includes('/video/2.mp4') && document.querySelector('video')?.currentTime > 0.2)
    assert.equal(resolved.at(-1), 'https://example.org/play/2')
    await page.goto(origin + '/search?keyword=订阅作品')
    await page.getByRole('link', { name: '直接观看' }).waitFor()
    await page.getByRole('link', { name: '我的', exact: true }).first().click()
    const manager = page.getByRole('region', { name: '来源订阅' })
    await manager.getByRole('button', { name: /来源订阅/ }).click()
    await manager.getByRole('button', { name: '使用已有来源', exact: true }).click()
    await page.goBack()
    await page.getByRole('heading', { name: '没有找到匹配作品' }).waitFor()
    assert.equal(await page.getByRole('link', { name: '直接观看' }).count(), 0)
  } finally { await browser.close() }
})

test('RSS 结果仅显示资源入口，不生成在线播放或导入按钮', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.addInitScript(() => {
      const url = 'https://example.org/rss.json'
      const content = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'rss', version: 1, arguments: { name: '下载来源' } }] } })
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ active: url, items: [{ url, content, updatedAt: 1 }] }))
    })
    await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: route.request().url().includes('/subscription/search') ? [{ title: '下载资源', sourceUrl: 'magnet:?xt=urn:btih:1234', type: 'resource' }] : [] } }))
    await page.goto(origin + '/search?keyword=下载资源')
    await page.getByRole('link', { name: '打开资源' }).waitFor()
    assert.match(await page.getByRole('link', { name: '打开资源' }).getAttribute('href'), /^magnet:/)
    assert.equal(await page.getByRole('link', { name: '直接观看' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: '导入观看' }).count(), 0)
    assert.equal(await page.locator('video').count(), 0)
  } finally { await browser.close() }
})

test('同站多规则只使用当前来源编号完成搜索、选集与解析', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const requests = []
    await installSyntheticMedia(page)
    await page.addInitScript(() => {
      const url = 'https://example.org/two-rules.json'
      const content = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [
        { factoryId: 'web-selector', version: 2, arguments: { name: '旧规则' } },
        { factoryId: 'web-selector', version: 2, arguments: { name: '当前规则' } },
      ] } })
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ active: url, activeSourceIndex: 1, items: [{ url, name: '双规则', content, updatedAt: 1 }] }))
    })
    await page.route('**/api/v1/**', route => {
      const url = new URL(route.request().url())
      const body = route.request().postDataJSON()
      if (url.pathname.includes('/subscription/')) requests.push({ path: url.pathname, sourceIndex: body.sourceIndex })
      let data = []
      if (url.pathname.endsWith('/subscription/search')) data = [{ title: '当前规则作品', sourceUrl: 'https://example.org/anime/1', type: 'anime' }]
      else if (url.pathname.endsWith('/subscription/preview')) data = { title: '当前规则作品', sourceUrl: body.sourceUrl, tags: [], type: 'anime', episodes: [{ id: 1, episodeNo: 1, title: '第1集', sourcePageUrl: 'https://example.org/play/1', playbackUrl: '', mimeType: '', sourceLabel: '当前规则' }] }
      else if (url.pathname.endsWith('/subscription/resolve')) data = { url: 'https://example.org/video/1.mp4', mimeType: 'video/mp4', warnings: [] }
      return route.fulfill({ json: { code: 0, data } })
    })
    await page.goto(origin + '/search?keyword=当前规则作品')
    await page.getByRole('link', { name: '直接观看' }).click()
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2)
    assert.ok(requests.some(item => item.path.endsWith('/subscription/search')))
    assert.ok(requests.some(item => item.path.endsWith('/subscription/preview')))
    assert.ok(requests.some(item => item.path.endsWith('/subscription/resolve')))
    assert.ok(requests.every(item => item.sourceIndex === 1), JSON.stringify(requests))
    const legacyUrl = new URL(page.url())
    legacyUrl.searchParams.delete('sourceIndex')
    requests.length = 0
    await page.goto(legacyUrl.toString())
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2)
    assert.ok(requests.some(item => item.path.endsWith('/subscription/preview')))
    assert.ok(requests.every(item => item.sourceIndex === 1), `旧链接不能回退到首条规则：${JSON.stringify(requests)}`)
  } finally { await browser.close() }
})
