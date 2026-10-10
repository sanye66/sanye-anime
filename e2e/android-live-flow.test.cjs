const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const fixture = process.env.SANYE_ANDROID_SOURCE_FIXTURE
const root = path.resolve(__dirname, '../sanye_client/dist-android')
test('安卓前端首页到选集及真实 HLS 在浏览器内播放', { skip: !fixture, timeout: 60000 }, async () => {
  const html = await readFile(path.join(fixture, 'playback.html'), 'utf8')
  const config = html.match(/player_aaaa\s*=\s*(\{.*?\})\s*;?/s)?.[1]
  const candidate = config?.match(/["']?url["']?\s*:\s*(["'])(.*?)\1/s)?.[2]?.replaceAll('\\/', '/')
  const media = new URL(candidate)
  assert.equal(media.protocol, 'https:')
  assert.match(media.pathname, /\.m3u8$/i)
  const server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURI(request.url || '/'))
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    const file = target === root ? path.join(root, 'index.html') : target
    try {
      const data = await readFile(file)
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })
    await page.addInitScript((url) => {
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [
          { name: 'SanyeCatalog', methods: ['list', 'listHistory', 'getSettings', 'recordProgress'].map((name) => ({ name, rtype: 'promise' })) },
          { name: 'SanyeSource', methods: ['search', 'preview'].map((name) => ({ name, rtype: 'promise' })) },
        ],
        nativePromise: async (_, method, options) => {
          if (method === 'list' || method === 'listHistory') return { items: [] }
          if (method === 'getSettings') return { settings: { theme: 'dark', autoPlay: false, playbackRate: 1 } }
          if (method === 'preview' && options.sourceUrl.includes('/v/')) return {
            title: '你的名字', sourceUrl: options.sourceUrl, coverUrl: '', summary: '',
            episodes: [{ id: options.sourceUrl, title: '当前播放页', sourceUrl: options.sourceUrl,
              playbackUrl: url, mimeType: 'application/vnd.apple.mpegurl', lineId: 'main' }],
          }
          if (method === 'preview') return {
            title: '你的名字', sourceUrl: options.sourceUrl, coverUrl: '', summary: '',
            episodes: [{ id: 'https://yinghuadongman.org.cn/v/52685-2-1/', title: 'HD国语',
              sourceUrl: 'https://yinghuadongman.org.cn/v/52685-2-1/', playbackUrl: '', mimeType: '', lineId: 'main' }],
          }
          return { item: options }
        },
      }
    }, media.toString())
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.getByRole('button', { name: '查看作品详情' }).click()
    await page.getByRole('button', { name: '播放HD国语' }).click()
    await page.locator('video').waitFor()
    await page.locator('video').evaluate((element) => { element.muted = true; void element.play().catch(() => {}) })
    await page.waitForFunction(() => {
      const video = document.querySelector('video')
      return video && video.currentTime > 0.5 && video.readyState >= 2
    }, null, { timeout: 30000 })
    assert.ok(await page.getByRole('heading', { name: '你的名字' }).count() >= 1)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
