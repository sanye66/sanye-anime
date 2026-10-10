const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

// Opt-in check: obtain the temporary media URL from the allowlisted source page each run.
// Never store the URL, playlist, segments, or cookies in the repository.
test('公开来源选集在浏览器真实推进播放', { skip: process.env.SANYE_ANDROID_REAL_SOURCE_CHECK !== '1', timeout: 60000 }, async () => {
  const pageUrl = 'https://www.yhdmtv.cc/p/65395/153/4570085'
  const response = await fetch(pageUrl, { signal: AbortSignal.timeout(12000) })
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /你的名字/)
  const selected = html.match(/temLineList\s*=\s*(\[[\s\S]*?\])\s*;/)?.[1]
  assert.ok(selected, '选集清单不可用')
  const episodes = JSON.parse(selected)
  const entry = episodes.find((item) => String(item.id) === '4570085')
  assert.ok(entry?.file, '选集没有媒体地址')
  const decoded = decodeURIComponent(Buffer.from(entry.file.slice(3), 'base64').toString('utf8'))
  const media = new URL(decoded)
  assert.equal(media.protocol, 'https:')
  assert.match(media.pathname, /\.m3u8$/i)

  const script = await readFile(require.resolve('hls.js', { paths: [path.join(__dirname, '../sanye_client')] }))
  const server = createServer((request, res) => {
    if (request.url === '/hls.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); return }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<video muted playsinline></video><script src="/hls.js"></script>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const result = await page.evaluate(async (source) => {
      const element = document.querySelector('video')
      if (!window.Hls?.isSupported()) return '浏览器不支持 HLS'
      const player = new window.Hls({ enableWorker: true })
      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve('播放时间未推进'), 25000)
        player.on(window.Hls.Events.ERROR, (_, data) => {
          if (data.fatal) { clearTimeout(timer); resolve(`媒体错误：${data.type}/${data.details}`) }
        })
        element.addEventListener('timeupdate', () => {
          if (element.currentTime > 0.5 && element.readyState >= 2) { clearTimeout(timer); resolve('已推进') }
        })
        player.on(window.Hls.Events.MANIFEST_PARSED, () => { void element.play().catch(() => { clearTimeout(timer); resolve('浏览器拒绝播放') }) })
        player.loadSource(source)
        player.attachMedia(element)
      })
    }, media.toString())
    assert.equal(result, '已推进')
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
