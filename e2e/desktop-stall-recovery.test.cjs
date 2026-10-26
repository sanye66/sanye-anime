const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist')

test('PC 单线路持续缓冲只重连一次，然后给出可操作的失败状态', { timeout: 45000 }, async () => {
  const server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURI(request.url || '/'))
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    const file = target === root || !path.extname(target) ? path.join(root, 'index.html') : target
    try {
      const data = await readFile(file)
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch()
  try {
    const openPlayer = async () => {
      const page = await browser.newPage()
      await page.route('**/api/v1/**', route => {
        const data = route.request().url().includes('/episodes')
          ? [{ id: 1, episodeNo: 1, title: '正片', playbackUrl: '/single.mp4', mimeType: 'video/mp4', sourcePageUrl: '' }]
          : { id: 127, title: '缓冲验收', type: '剧场版', tags: [], characters: [], similar: [] }
        return route.fulfill({ json: { code: 0, data } })
      })
      await page.route('**/single.mp4', () => new Promise(() => {}))
      await page.goto(`http://127.0.0.1:${server.address().port}/anime/127`)
      await page.locator('video').waitFor()
      await page.clock.install()
      await page.locator('video').evaluate(video => {
        window.__reconnects = 0
        window.__paused = true
        video.load = () => { window.__reconnects += 1 }
        Object.defineProperty(video, 'readyState', { configurable: true, get: () => 2 })
        Object.defineProperty(video, 'paused', { configurable: true, get: () => window.__paused })
        Object.defineProperty(video, 'currentTime', { configurable: true, get: () => 1, set: () => {} })
        video.dispatchEvent(new Event('loadeddata'))
      })
      return page
    }
    const page = await openPlayer()
    await page.locator('video').evaluate(video => video.dispatchEvent(new Event('waiting')))
    await page.clock.fastForward(10500)
    assert.equal(await page.evaluate(() => window.__reconnects), 0)
    await page.locator('video').evaluate(video => {
      window.__paused = false
      video.dispatchEvent(new Event('waiting'))
    })
    await page.clock.fastForward(10500)
    await page.clock.fastForward(10500)
    await page.getByText('播放失败，请重试或打开来源页。').waitFor()
    assert.equal(await page.evaluate(() => window.__reconnects), 1)
    assert.equal(await page.getByRole('button', { name: '重新加载' }).count(), 1)
    await page.close()

    const silent = await openPlayer()
    await silent.locator('video').evaluate(video => { window.__paused = false; video.dispatchEvent(new Event('playing')) })
    await silent.clock.fastForward(10500)
    await silent.clock.fastForward(10500)
    await silent.getByText('播放失败，请重试或打开来源页。').waitFor()
    assert.equal(await silent.evaluate(() => window.__reconnects), 1, '没有 waiting 事件也只能重连一次')
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
