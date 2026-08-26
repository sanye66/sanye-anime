import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

/** 返回客户端统一接口信封。 */
function response(data) {
  return JSON.stringify({ code: 0, message: 'ok', data, requestId: 'movie-lines-e2e' })
}

try {
  await page.route('**/api/v1/anime/127/episodes', (route) => route.fulfill({
    contentType: 'application/json',
    body: response([
      { id: 12701, episodeNo: 1, title: '你的名字 日语原声', sourcePageUrl: 'https://example.com/jp', playbackUrl: 'https://example.com/jp.m3u8', mimeType: 'application/vnd.apple.mpegurl' },
      { id: 12702, episodeNo: 2, title: '你的名字 国语配音', sourcePageUrl: 'https://example.com/cn', playbackUrl: 'https://example.com/cn.m3u8', mimeType: 'application/vnd.apple.mpegurl' },
    ]),
  }))
  await page.route('**/api/v1/anime/127', (route) => route.fulfill({
    contentType: 'application/json',
    body: response({
      id: 127,
      title: '你的名字',
      originalTitle: '君の名は。',
      type: '剧场版',
      year: 2016,
      status: '已完结',
      tags: ['剧场版', '爱情', '奇幻'],
      updateText: '正片',
      summary: '电影播放线路语义专项测试。',
      characters: [],
      similar: [],
      schedule: [],
    }),
  }))
  await page.route('https://example.com/*.m3u8', (route) => route.abort())

  await page.goto(`${BASE}/anime/127`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.locator('.episode-button').first().waitFor({ timeout: 10_000 })

  const heading = (await page.locator('.anime-player-heading h3').textContent())?.trim()
  const listLabel = await page.locator('.anime-episode-list').getAttribute('aria-label')
  const options = (await page.locator('.episode-button').allTextContents()).map((text) => text.trim())
  const containsEpisodeWording = options.some((text) => /第\s*\d+\s*集/.test(text))

  if (heading !== '正片播放' || listLabel !== '语言与播放线路') {
    throw new Error(`电影播放器标题错误：${heading} / ${listLabel}`)
  }
  if (options.join(',') !== '日语原声,国语' || containsEpisodeWording) {
    throw new Error(`电影线路标签错误：${options.join(',')}`)
  }

  await page.locator('.episode-button').nth(1).click()
  const selected = (await page.locator('.episode-button.active').textContent())?.trim()
  if (selected !== '国语') throw new Error(`电影线路切换失败：${selected}`)

  console.log('PASS 剧场版显示正片播放，不显示第一集、第二集')
  console.log('PASS 电影语言线路识别与切换：日语原声 -> 国语')
  console.log('电影播放线路 Playwright：通过 2/2')
} finally {
  await browser.close()
}
