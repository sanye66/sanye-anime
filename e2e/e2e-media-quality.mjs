import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const results = []

/** 记录清晰度专项断言，失败时输出可定位的浏览器状态。 */
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const qualityRequests = []
const mediaRequests = []
const failedRequests = []
const pageErrors = []
const consoleMessages = []

page.on('pageerror', (error) => pageErrors.push(String(error)))
page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))
page.on('request', (request) => {
  if (request.url().includes('media.example')) mediaRequests.push(request.url())
})
page.on('requestfailed', (request) => {
  if (request.url().includes('media.example')) failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? 'unknown'})`)
})

page.on('request', (request) => {
  const path = new URL(request.url()).pathname
  if (path.endsWith('/low.m3u8') || path.endsWith('/high.m3u8')) qualityRequests.push(path)
})

try {
  // 强制走 hls.js 分支，覆盖原生 HLS 浏览器无法提供 level 切换 API 的场景。
  await page.addInitScript(() => {
    const canPlayType = HTMLMediaElement.prototype.canPlayType
    HTMLMediaElement.prototype.canPlayType = function (type) {
      if (type === 'application/vnd.apple.mpegurl') return ''
      return canPlayType.call(this, type)
    }
  })

  // 模拟接口只提供一个 HLS 剧集，主清单提供 360P 和 720P 两个真实 level。
  await page.route('**/api/v1/anime/127/episodes', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [{
          id: 901,
          episodeNo: 1,
          title: '清晰度测试集',
          sourcePageUrl: 'https://media.example/source/901',
          playbackUrl: 'https://media.example/master.m3u8',
          mimeType: 'application/vnd.apple.mpegurl',
          sourceLabel: '测试 HLS 清单',
        }],
        requestId: 'e2e-media-quality',
      }),
    })
  })

  await page.route('https://media.example/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let body = ''
    if (path.endsWith('/master.m3u8')) {
      body = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-STREAM-INF:BANDWIDTH=450000,RESOLUTION=640x360,CODECS="avc1.42e01e,mp4a.40.2"',
        'low.m3u8',
        '#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720,CODECS="avc1.42e01e,mp4a.40.2"',
        'high.m3u8',
      ].join('\n')
    } else if (path.endsWith('/low.m3u8') || path.endsWith('/high.m3u8')) {
      body = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:4',
        '#EXT-X-ENDLIST',
      ].join('\n')
    }
    await route.fulfill({
      contentType: 'application/vnd.apple.mpegurl',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body,
    })
  })

  await page.goto(`${BASE}/anime/127`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.anime-player-section').waitFor({ timeout: 15000 })
  await page.locator('.art-video-player').waitFor({ timeout: 15000 })
  await page.locator('.art-control-quality').waitFor({ state: 'attached', timeout: 15000 })

  const options = page.locator('.art-control-quality .art-selector-item')
  const optionTexts = await options.allTextContents()
  record('HLS 多清晰度菜单', optionTexts.includes('自动') && optionTexts.includes('720P') && optionTexts.includes('360P'),
    optionTexts.join('、'))

  await page.locator('.art-control-quality').hover()
  await options.filter({ hasText: '360P' }).click()
  await page.waitForTimeout(500)
  const selectedText = await page.locator('.art-control-quality .art-selector-value').textContent()
  record('清晰度切换保持 ArtPlayer 控件', selectedText?.trim() === '360P', selectedText?.trim() ?? '')
  record('清晰度切换请求对应 HLS level', qualityRequests.some((path) => path.endsWith('/low.m3u8')),
    [...new Set(qualityRequests)].join(', ') || '未请求子清单')
} catch (error) {
  let debug = { player: false, video: '', controls: '', body: '' }
  try {
    debug = await page.evaluate(() => ({
      player: Boolean(document.querySelector('.art-video-player')),
      video: document.querySelector('video')?.src ?? '',
      controls: document.querySelector('.art-controls')?.textContent?.trim() ?? '',
      body: document.querySelector('.anime-player-section')?.textContent?.trim() ?? '',
    }))
  } catch {
    // 页面已关闭或导航失败时保留默认诊断信息。
  }
  record('清晰度专项执行异常', false,
    `${String(error)}；页面错误：${pageErrors.join(' | ') || '无'}；控制台=${consoleMessages.join(' | ') || '无'}；播放器=${debug.player} video=${debug.video} controls=${debug.controls.slice(0, 120)}；请求=${mediaRequests.join(', ')}；失败=${failedRequests.join(' | ')}`)
}

await browser.close()
const failed = results.filter((item) => !item.pass).length
console.log(`\n清晰度专项 Playwright：通过 ${results.length - failed}/${results.length}`)
process.exit(failed > 0 ? 1 : 0)
