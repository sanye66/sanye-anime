import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const results = []

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const hlsRequests = []
let failEpisodes = false
let episodeRequests = 0

try {
  await page.route('**/api/v1/anime/127/episodes', async (route) => {
    episodeRequests += 1
    if (failEpisodes) {
      await route.abort('failed')
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: [
          { id: 401, episodeNo: 1, title: '缓存第 1 集', sourcePageUrl: 'https://media.example/source/401', playbackUrl: 'https://media.example/one.m3u8', mimeType: 'application/vnd.apple.mpegurl' },
          { id: 402, episodeNo: 2, title: '缓存第 2 集', sourcePageUrl: 'https://media.example/source/402', playbackUrl: 'https://media.example/two.m3u8', mimeType: 'application/vnd.apple.mpegurl' },
        ],
        requestId: 'e2e-media-cache',
      }),
    })
  })

  await page.route('**/api/v1/anime/127', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 127,
          title: '缓存测试作品',
          originalTitle: 'Cache Test',
          type: 'TV',
          year: 2026,
          status: '已发布',
          coverUrl: '/covers/mushoku-oad.svg',
          tags: ['测试'],
          updateText: '缓存验证',
          summary: '播放器缓存策略专项测试。',
          characters: [],
          similar: [],
          schedule: [],
        },
        requestId: 'e2e-media-cache-detail',
      }),
    })
  })

  await page.route('https://media.example/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('.m3u8')) hlsRequests.push(path)
    await route.fulfill({
      contentType: 'application/vnd.apple.mpegurl',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:4', '#EXT-X-ENDLIST'].join('\n'),
    })
  })

  await page.goto(`${BASE}/anime/127`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.episode-button').first().waitFor({ timeout: 15000 })
  record('剧集接口首次读取', episodeRequests === 1, `requests=${episodeRequests}`)

  await page.locator('.episode-button').nth(1).click()
  const selectedCache = await page.evaluate(() => localStorage.getItem('sanye:player:selected:127'))
  const episodeCacheLength = await page.evaluate(() => {
    const raw = localStorage.getItem('sanye:player:episodes:127')
    return raw ? JSON.parse(raw).data.length : 0
  })
  record('播放器选集写入缓存', selectedCache === '402' && episodeCacheLength === 2,
    `selected=${selectedCache}, length=${episodeCacheLength}`)
  record('下一集 HLS 清单预取', hlsRequests.includes('/two.m3u8'), [...new Set(hlsRequests)].join(', ') || '未请求')

  failEpisodes = true
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.episode-button').first().waitFor({ timeout: 15000 })
  const cachedButtons = await page.locator('.episode-button').allTextContents()
  const activeText = await page.locator('.episode-button.active').textContent()
  record('剧集接口失败时使用缓存', cachedButtons.length === 2 && activeText?.includes('缓存第 2 集'),
    `${cachedButtons.join('、')} / active=${activeText?.trim() ?? ''}`)
} catch (error) {
  record('播放器缓存专项执行异常', false, String(error))
}

await browser.close()
const failed = results.filter((item) => !item.pass).length
console.log(`\n播放器缓存专项 Playwright：通过 ${results.length - failed}/${results.length}`)
process.exit(failed > 0 ? 1 : 0)
