import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
let internalStartedAt = 0
let externalPreferredStartedAt = 0
let externalCompleteStartedAt = 0
let legacyCoverRequests = 0

function envelope(data) {
  return { code: 0, message: 'ok', data, requestId: 'search-external-e2e' }
}

try {
  const coverFixture = {
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" fill="#334"/></svg>',
  }
  await page.route('**/admin-profile/**', (route) => route.fulfill(coverFixture))
  await page.route('**/covers/**', (route) => route.fulfill(coverFixture))
  await page.route('**/api/v1/monitor/frontend-errors', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(envelope(null)),
  }))
  await page.route('**/covers/anime-placeholder.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" fill="#334"/></svg>',
  }))
  await page.route('https://covers.invalid/**', (route) => route.abort())
  await page.route('https://media.example/direct.m3u8', (route) => route.fulfill({
    contentType: 'application/vnd.apple.mpegurl',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-ENDLIST',
  }))
  await page.route('**/api/v1/anime/external-preview**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(envelope({
      title: '目标电视动画',
      originalTitle: '',
      type: '电视动画',
      year: 2026,
      summary: '直接观看测试',
      tags: ['测试'],
      updateText: '已完结',
      coverUrl: '/covers/anime-placeholder.svg',
      sourceUrl: 'https://yhdmtv.cc/p/2/153/0',
      episodes: [{
        id: 1,
        episodeNo: 1,
        title: '第1集',
        sourcePageUrl: 'https://yhdmtv.cc/p/2/153/1',
        playbackUrl: 'https://media.example/direct.m3u8',
        mimeType: 'application/vnd.apple.mpegurl',
        sourceLabel: '测试 HLS',
      }],
    })),
  }))
  await page.route('**/covers/anime-139.svg', (route) => {
    legacyCoverRequests += 1
    return route.abort()
  })
  await page.route('**/api/v1/search**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/search/external')) {
      const preferredOnly = url.searchParams.get('preferredOnly') === 'true'
      if (preferredOnly) externalPreferredStartedAt = Date.now()
      else externalCompleteStartedAt = Date.now()
      await new Promise((resolve) => setTimeout(resolve, preferredOnly ? 100 : 700))
      const items = [
        { title: '目标剧场版', sourceUrl: 'https://yhdmtv.cc/p/1/364/0', coverUrl: 'https://covers.invalid/movie.jpg', type: '剧场版', summary: '电影候选' },
        { title: '目标电视动画', sourceUrl: 'https://yhdmtv.cc/p/2/153/0', coverUrl: 'https://covers.invalid/tv.jpg', type: '电视动画', summary: '电视候选' },
      ]
      if (!preferredOnly) {
        items.push({ title: '原词补充结果', sourceUrl: 'https://yhdmtv.cc/p/3/153/0', coverUrl: 'https://covers.invalid/raw.jpg', type: '网络动画', summary: '原词候选' })
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(items)),
      })
      return
    }
    internalStartedAt = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 900))
    const type = url.searchParams.get('type')
    const items = type && type !== '电视动画' ? [] : [{
      id: 139,
      title: '目标剧场版',
      titleHighlight: '目标剧场版',
      originalTitle: '',
      type: '电视动画',
      year: 2026,
      score: 9.2,
      status: '已发布',
      coverUrl: '/covers/anime-139.svg',
      tags: ['电影'],
      updateText: '已完结',
      summaryHighlight: '历史片库类型错误，应按同标题外部来源校正',
    }, {
      id: 133,
      title: '目标作品已在片库',
      titleHighlight: '目标作品已在片库',
      originalTitle: '',
      type: '电视动画',
      year: 2026,
      score: 9.1,
      status: '已发布',
      coverUrl: '/covers/anime-placeholder.svg',
      tags: ['冒险'],
      updateText: '已完结',
      summaryHighlight: '站内候选',
    }]
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ items, page: 1, size: 20, total: items.length, totalPages: 1 })),
    })
  })

  await page.goto(`${BASE}/search?keyword=${encodeURIComponent('目标')}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.locator('.external-result-row').getByText('目标剧场版', { exact: true }).waitFor({ timeout: 2_000 })
  if (await page.getByText('目标作品已在片库', { exact: true }).count()) {
    throw new Error('樱花候选被站内慢请求阻塞')
  }
  if (await page.getByText('原词补充结果', { exact: true }).count()) {
    throw new Error('原词慢结果阻塞了正式标题的渐进展示')
  }
  if (!internalStartedAt || !externalPreferredStartedAt || !externalCompleteStartedAt
      || Math.max(internalStartedAt, externalPreferredStartedAt, externalCompleteStartedAt)
        - Math.min(internalStartedAt, externalPreferredStartedAt, externalCompleteStartedAt) > 250) {
    throw new Error(`三路搜索未并行：internal=${internalStartedAt}, preferred=${externalPreferredStartedAt}, complete=${externalCompleteStartedAt}`)
  }

  const externalCover = page.locator('.external-result-row .search-cover').first()
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector)
    return image instanceof HTMLImageElement && image.src.includes('anime-placeholder.svg') && image.naturalWidth > 0
  }, '.external-result-row .search-cover')
  if (!(await externalCover.getAttribute('referrerpolicy'))?.includes('no-referrer')) {
    throw new Error('外部封面未禁用来源头')
  }

  await page.getByText('原词补充结果', { exact: true }).waitFor({ timeout: 2_000 })
  await page.getByText('目标作品已在片库', { exact: true }).waitFor({ timeout: 2_000 })
  if (legacyCoverRequests) {
    throw new Error(`仍请求不存在的历史占位封面：${legacyCoverRequests}`)
  }
  await page.getByRole('button', { name: '剧场版', exact: true }).click()
  await page.locator('.external-result-row').getByText('目标剧场版', { exact: true }).waitFor({ timeout: 2_000 })
  const movieRows = await page.locator('.external-result-row').allTextContents()
  if (movieRows.length !== 1 || !movieRows[0].includes('目标剧场版')) {
    throw new Error(`剧场版分类不严格：${movieRows.join('|')}`)
  }
  const correctedInternalRows = await page.locator('.result-row:not(.external-result-row)')
    .filter({ hasText: '目标剧场版' }).allTextContents()
  if (correctedInternalRows.length !== 1 || !correctedInternalRows[0].includes('剧场版')
      || correctedInternalRows[0].includes('电视动画')) {
    throw new Error(`片库历史类型未按外部确定分类校正：${correctedInternalRows.join('|')}`)
  }

  await page.getByRole('button', { name: '电视动画', exact: true }).click()
  await page.getByText('目标电视动画', { exact: true }).waitFor({ timeout: 2_000 })
  const televisionRows = await page.locator('.external-result-row').allTextContents()
  if (televisionRows.length !== 1 || !televisionRows[0].includes('目标电视动画')) {
    throw new Error(`电视动画分类不严格：${televisionRows.join('|')}`)
  }
  if (await page.locator('.result-row:not(.external-result-row)').filter({ hasText: '目标剧场版' }).count()) {
    throw new Error('片库历史错误类型仍混入电视动画分类')
  }

  const actions = page.locator('.external-result-row .external-result-actions')
  if (await actions.getByText('直接观看', { exact: true }).count() !== 1
      || await actions.getByText('导入观看', { exact: true }).count() !== 1) {
    throw new Error('外部候选缺少直接观看或导入观看')
  }

  await actions.getByText('直接观看', { exact: true }).click()
  await page.locator('.anime-player-frame video').waitFor({ timeout: 5_000 })
  const directWatchState = await page.locator('.anime-player-frame video').evaluate((video) => ({
    autoplay: video.autoplay,
    muted: video.muted,
  }))
  if (!directWatchState.autoplay || !directWatchState.muted) {
    throw new Error(`直接观看未自动静音启动：${JSON.stringify(directWatchState)}`)
  }
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await page.getByText('目标电视动画', { exact: true }).waitFor({ timeout: 2_000 })

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileCover = page.locator('.external-result-row .search-cover').first()
  const mobileBox = await mobileCover.boundingBox()
  if (!await mobileCover.isVisible() || !mobileBox || mobileBox.width < 40 || mobileBox.height < 60) {
    throw new Error(`窄屏搜索封面被隐藏或尺寸异常：${JSON.stringify(mobileBox)}`)
  }

  console.log('搜索外部候选 Playwright：通过 5/5')
} finally {
  await browser.close()
}
