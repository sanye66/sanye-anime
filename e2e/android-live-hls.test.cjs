const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

// Optional network acceptance. A third-party source and its CDN may change at any time;
// never persist its temporary media URL or count an unset fixture as a pass.
const fixture = process.env.SANYE_ANDROID_SOURCE_FIXTURE
test('真实来源 HLS 在本机移动视口浏览器推进播放时间', { skip: !fixture, timeout: 60000 }, async () => {
  const html = await readFile(path.join(fixture, 'playback.html'), 'utf8')
  const config = html.match(/player_aaaa\s*=\s*(\{.*?\})\s*;?/s)?.[1]
  const candidate = config?.match(/["']?url["']?\s*:\s*(["'])(.*?)\1/s)?.[2]?.replaceAll('\\/', '/')
  const media = new URL(candidate)
  assert.equal(media.protocol, 'https:')
  assert.match(media.pathname, /\.m3u8$/i)
  const script = await readFile(require.resolve('hls.js', { paths: [path.join(__dirname, '../sanye_client')] }))
  const server = createServer((request, response) => {
    if (request.url === '/hls.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); return }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<video muted playsinline controls></video><script src="/hls.js"></script>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const result = await page.evaluate(async (url) => {
      if (!window.Hls?.isSupported()) return '浏览器不支持 HLS.js'
      const element = document.querySelector('video')
      const player = new window.Hls({ enableWorker: true })
      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve('30 秒内未推进播放时间'), 30000)
        player.on(window.Hls.Events.ERROR, (_, data) => {
          if (data.fatal) { clearTimeout(timer); resolve(`媒体错误：${data.type}/${data.details}`) }
        })
        element.addEventListener('timeupdate', () => {
          if (element.currentTime > 0.5 && element.readyState >= 2) { clearTimeout(timer); resolve('已推进') }
        })
        player.on(window.Hls.Events.MANIFEST_PARSED, () => { void element.play().catch(() => { clearTimeout(timer); resolve('播放策略拒绝') }) })
        player.loadSource(url)
        player.attachMedia(element)
      })
    }, media.toString())
    assert.equal(result, '已推进')
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
