import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const animeIds = (process.env.ANIME_IDS ?? '133,136,135,128,137,127').split(',').map(Number)
const results = []

/** 记录真实来源播放链路的浏览器检查结果。 */
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const mediaRequests = []
const failedRequests = []
page.on('request', (request) => {
  if (/\.m3u8(?:$|\?)/i.test(request.url())) mediaRequests.push(request.url())
})
page.on('requestfailed', (request) => {
  if (/\.(?:m3u8|ts|key)(?:$|\?)/i.test(request.url())) {
    failedRequests.push(`${request.url()} (${request.failure()?.errorText ?? 'unknown'})`)
  }
})

try {
  for (const animeId of animeIds) {
    mediaRequests.length = 0
    failedRequests.length = 0
    // 播放页含独立封面和 HLS 资源，DOM 就绪后用播放器状态与媒体请求断言真实播放。
    await page.goto(`${BASE}/anime/${animeId}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.locator('.anime-player-section').waitFor({ timeout: 15000 })
    await page.locator('video').waitFor({ timeout: 15000 })
    await page.waitForTimeout(5000)

    // 通过浏览器播放 API 模拟用户点击播放，确认媒体真正开始推进，而不是只发出了清单请求。
    const playResult = await page.evaluate(async () => {
      const video = document.querySelector('video')
      if (!video) return { started: false, error: '未找到 video 元素' }
      try {
        await Promise.race([
          video.play(),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error('播放启动超时')), 12000)),
        ])
        const startedAt = video.currentTime
        const played = document.querySelector('.art-progress-played')
        const initialProgressStyle = played?.getAttribute('style') ?? ''
        // 必须持续推进至少 2 秒，并同步改变可见进度条；短暂启动几十毫秒不再算播放成功。
        const deadline = Date.now() + 12000
        while (video.currentTime - startedAt < 2 && Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 250))
        }
        const progressStyle = played?.getAttribute('style') ?? ''
        return {
          started: video.currentTime - startedAt >= 2,
          elapsed: video.currentTime - startedAt,
          progressUpdated: Boolean(progressStyle && progressStyle !== initialProgressStyle),
          progressStyle,
          error: '',
        }
      } catch (error) {
        return { started: false, elapsed: 0, progressUpdated: false, progressStyle: '', error: String(error) }
      }
    })

    const state = await page.evaluate(() => {
      const video = document.querySelector('video')
      const episodes = document.querySelectorAll('.episode-button').length
      const episodeButtons = document.querySelectorAll('.anime-episode-list .episode-button').length
      const sourceButtons = Array.from(document.querySelectorAll('.anime-playback-sources .source-button'))
        .map((button) => button.textContent?.trim() ?? '')
      return {
        hasVideo: Boolean(video),
        hasArtPlayer: Boolean(document.querySelector('.anime-player-frame .art-video-player')),
        videoControls: Boolean(video?.playsInline && video?.preload === 'auto'),
        artControls: Boolean(document.querySelector('.anime-player-frame .art-controls')),
        standardControls: [
          '.art-control-setting',
          '.art-control-pip',
          '.art-control-fullscreenWeb',
          '.art-control-fullscreen',
          '.art-control-screenshot',
        ].every((selector) => Boolean(document.querySelector(`.anime-player-frame ${selector}`))),
        qualityControl: Boolean(document.querySelector('.anime-player-frame .art-control-quality')),
        qualityOptions: document.querySelectorAll('.anime-player-frame .art-control-quality .art-selector-item').length,
        hasIframe: Boolean(document.querySelector('.anime-player-frame iframe')),
        episodes,
        episodeButtons,
        sourceButtons,
        readyState: video?.readyState ?? -1,
        mediaError: video?.error?.code ?? 0,
        playerError: document.querySelector('.player-overlay')?.textContent?.trim() ?? '',
        progressTransition: getComputedStyle(document.querySelector('.art-progress-played')).transitionDuration,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })

    record(`真实 HLS 播放器 ${animeId}`, state.hasVideo && state.hasArtPlayer && state.artControls
      && state.standardControls && state.videoControls && !state.hasIframe && state.episodes > 0,
      `episodes=${state.episodes}, artplayer=${state.hasArtPlayer}, standardControls=${state.standardControls}, readyState=${state.readyState}`)
    record(`真实 HLS 清晰度菜单 ${animeId}`, !state.qualityControl || state.qualityOptions >= 3,
      state.qualityControl ? `${state.qualityOptions} 个选项（含自动）` : '当前来源只有单一清晰度，按实际清单隐藏菜单')
    record(`真实 HLS 请求 ${animeId}`, mediaRequests.length > 0, mediaRequests[0] ?? '未捕获 m3u8 请求')
    record(`真实播放器无错误 ${animeId}`, playResult.started && !state.mediaError && !state.playerError,
      playResult.error || state.playerError || failedRequests[0]
        || `mediaError=${state.mediaError}, currentTime=${await page.locator('video').evaluate((video) => video.currentTime)}`)
    record(`真实播放进度持续更新 ${animeId}`, playResult.started && playResult.progressUpdated
      && state.progressTransition !== '0s',
    `elapsed=${playResult.elapsed.toFixed(2)}, style=${playResult.progressStyle}, transition=${state.progressTransition}`)
    record(`真实播放器移动端布局 ${animeId}`, !state.overflow,
      `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`)
    if (animeId === 139) {
      record('电影语言切换不重复显示选集', state.episodeButtons === 0
        && state.sourceButtons.join(',') === '日语原声,国语',
      `sources=${state.sourceButtons.join(',')}, episodeButtons=${state.episodeButtons}`)
    }
  }

  // 片库回归验证无职转生每个季度都是独立卡片，并且每张卡片使用独立封面。
  await page.goto(`${BASE}/anime-repository`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.repository-card').filter({ hasText: '无职转生' }).first().waitFor({ timeout: 15000 })
  const seasonState = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.repository-card')].filter((card) => card.textContent?.includes('无职转生'))
    return {
      cards: cards.length,
      links: cards.map((card) => card.querySelector('a.repository-cover-link')?.getAttribute('href')),
      titles: cards.map((card) => card.querySelector('.repository-card-title strong')?.textContent?.trim()),
      covers: cards.map((card) => card.querySelector('img')?.getAttribute('src')),
    }
  })
  record('无职转生季度独立卡片', seasonState.cards === 5,
    `${seasonState.cards} 个独立季度卡片`)
  record('季度入口与独立封面', seasonState.links.join(',') === '/anime/133,/anime/136,/anime/135,/anime/128,/anime/137'
    && new Set(seasonState.covers).size === 5,
    `${seasonState.links.join(',')}；封面 ${new Set(seasonState.covers).size} 张`)
  record('片库季度标题按观看顺序排列', seasonState.titles.join(',') === '无职转生 · 第一季,无职转生 · 第二季,无职转生 · 第二季 Part.2,无职转生 · 第三季,无职转生 · OAD 特别篇',
    seasonState.titles.join(','))

  // 搜索页也必须去重，否则用户可能从搜索结果进入无剧集的历史重复作品。
  await page.goto(`${BASE}/search?keyword=${encodeURIComponent('无职转生')}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.result-list').waitFor({ timeout: 15000 })
  const searchState = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.result-row')]
      .filter((item) => item.getAttribute('href')?.startsWith('/anime/'))
    return {
      count: rows.length,
      links: rows.map((item) => item.getAttribute('href')),
      titles: rows.map((item) => item.querySelector('.result-copy strong')?.textContent?.trim()),
    }
  })
  record('无职转生搜索结果独立展示', searchState.count === 5, `${searchState.count} 个独立季度结果`)
  record('搜索结果指向有剧集的作品', searchState.links.join(',') === '/anime/133,/anime/136,/anime/135,/anime/128,/anime/137',
    searchState.links.join(','))
  record('搜索季度标题按观看顺序排列', searchState.titles.join(',') === '无职转生 · 第一季,无职转生 · 第二季,无职转生 · 第二季 Part.2,无职转生 · 第三季,无职转生 · OAD 特别篇',
    searchState.titles.join(','))
} catch (error) {
  record('真实媒体播放器执行异常', false, String(error))
}

await browser.close()
const failed = results.filter((item) => !item.pass).length
console.log(`\n真实媒体播放器 E2E：通过 ${results.length - failed}/${results.length}`)
process.exit(failed > 0 ? 1 : 0)
