const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')
test('安卓下载入口播放本地文件，不重新解析来源或写入公网观看历史', async () => {
  const root = path.resolve(__dirname, '../sanye_client/dist-android')
  const output = path.resolve(__dirname, '../sanye_deploy/.local/android-download-playback')
  const server = createServer(async (request, response) => {
    try {
      const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
      if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end()
      response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(await fs.readFile(file === root ? path.join(root, 'index.html') : file))
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page.setDefaultTimeout(7000)
    await page.addInitScript(() => {
      window.__calls = []
      window.androidBridge = {}
      const methods = {
        SanyeCatalog: ['list', 'listHistory', 'getSettings', 'recordProgress'],
        SanyeSource: ['preview', 'search'], SanyeDownload: ['list', 'resume', 'play'],
        SanyePlayer: ['setLandscape', 'setImmersive', 'setKeepAwake'], App: ['getInfo', 'addListener'],
      }
      window.Capacitor = {
        getPlatform: () => 'android', convertFileSrc: file => `http://localhost/_capacitor_file_${file.slice(7)}`,
        PluginHeaders: Object.entries(methods).map(([name, methods]) => ({ name, methods: methods.map(name => ({ name, rtype: name === 'addListener' ? 'callback' : 'promise' })) })),
        nativeCallback: () => 'listener',
        nativePromise: async (plugin, method) => {
          window.__calls.push([plugin, method])
          if (plugin === 'SanyeDownload') return method === 'play' ? { path: 'file:///data/user/0/com.sanye.sanye_anime/files/downloads/one.mp4', title: '离线测试视频' }
            : { items: [{ id: 'one', title: '离线测试视频', state: 'completed', bytes: 1024, total: 1024, error: '', createdAt: Date.now() }], usedBytes: 1024, maxStorageBytes: 2147483648, maxFileBytes: 536870912 }
          if (method === 'list' || method === 'listHistory') return { items: [] }
          if (method === 'getSettings') return { settings: { theme: 'light', playbackRate: 1, volume: 1, qualityProfile: 'off', frameTarget: 'off' } }
          if (method === 'getInfo') return { version: '测试', build: '1' }
          if (method === 'preview' || method === 'search') throw new Error('离线播放不应请求来源')
          return {}
        },
      }
      HTMLMediaElement.prototype.play = async function () {}
    })
    await page.route('http://localhost/_capacitor_file_/**', route => route.abort())
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.locator('.android-downloads summary').click()
    await page.getByRole('button', { name: '离线播放', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('video')?.src.includes('/_capacitor_file_'))
    assert.equal(await page.locator('h1').textContent(), '观看作品')
    await page.locator('video').evaluate(video => { Object.defineProperty(video, 'currentTime', { configurable: true, value: 12 }); video.dispatchEvent(new Event('timeupdate')) })
    await page.locator('.android-playback-tools summary').click()
    await fs.mkdir(output, { recursive: true })
    await page.screenshot({ path: path.join(output, 'local-playback-390.png'), fullPage: true })
    await page.getByRole('button', { name: '我的', exact: true }).click()
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.filter(([plugin]) => plugin === 'SanyeSource').length, 0)
    assert.equal(calls.filter(([, method]) => method === 'recordProgress').length, 0)
    assert.ok(calls.some(([plugin, method]) => plugin === 'SanyeDownload' && method === 'resume'))
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
