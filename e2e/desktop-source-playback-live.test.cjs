const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const watchSeconds = Math.min(300, Math.max(30, Number(process.env.SANYE_LIVE_WATCH_SECONDS) || 30))

// 现场验收才执行；临时媒体地址只留在内存，不写入仓库或测试报告。
test('PC 播放器真实来源连续观看与定位后继续推进', {
  skip: process.env.SANYE_PC_REAL_SOURCE_CHECK !== '1', timeout: watchSeconds * 1000 + 70000,
}, async () => {
  const pageUrl = 'https://www.yhdmtv.cc/p/65395/153/4570085'
  const response = await fetch(pageUrl, { signal: AbortSignal.timeout(12000) })
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /你的名字/)
  const list = html.match(/temLineList\s*=\s*(\[[\s\S]*?\])\s*;/)?.[1]
  assert.ok(list, '来源选集清单不可用')
  const entry = JSON.parse(list).find(item => String(item.id) === '4570085')
  assert.ok(entry?.file, '来源选集没有媒体地址')
  const source = decodeURIComponent(Buffer.from(entry.file.slice(3), 'base64').toString('utf8'))
  assert.match(source, /^https:\/\/.+\.m3u8(?:\?.*)?$/i)

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.addInitScript(() => localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 'off', quality: 'off' })))
    await page.route('**/api/v1/**', route => {
      const episodes = route.request().url().includes('/episodes')
      return route.fulfill({ json: { code: 0, data: episodes
        ? [{ id: 1, episodeNo: 1, title: '正片', playbackUrl: source, mimeType: 'application/vnd.apple.mpegurl', sourcePageUrl: pageUrl }]
        : { id: 127, title: '你的名字。', type: '剧场版', tags: [], characters: [], similar: [] } } })
    })
    const started = Date.now()
    await page.goto(`${origin}/anime/127`)
    await page.locator('video').evaluate(video => { video.muted = true; void video.play().catch(() => {}) })
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5, null, { timeout: 30000 })
    const firstFrameMs = Date.now() - started
    const beginning = await page.locator('video').evaluate(video => video.currentTime)
    await page.waitForTimeout(watchSeconds * 1000)
    const continuous = await page.locator('video').evaluate(video => ({ time: video.currentTime, paused: video.paused, error: video.error?.code }))
    assert.equal(continuous.paused, false)
    assert.equal(continuous.error, undefined)
    assert.ok(continuous.time - beginning >= watchSeconds * 0.85, `连续观看 ${watchSeconds} 秒只推进 ${continuous.time - beginning} 秒`)
    const target = await page.locator('video').evaluate(video => {
      const next = Math.min(video.duration - 20, video.currentTime + 120)
      video.currentTime = next
      return next
    })
    await page.waitForFunction(expected => {
      const video = document.querySelector('video')
      return video && !video.seeking && video.currentTime >= expected - 1
    }, target, { timeout: 15000 })
    const afterSeek = await page.locator('video').evaluate(video => video.currentTime)
    await page.waitForTimeout(10000)
    const resumed = await page.locator('video').evaluate(video => video.currentTime)
    assert.ok(resumed - afterSeek >= 8, `定位后 10 秒只推进 ${resumed - afterSeek} 秒`)
    console.log(JSON.stringify({ firstFrameMs, continuousAdvanceSeconds: continuous.time - beginning, seekResumeSeconds: resumed - afterSeek }))
  } finally {
    await browser.close()
  }
})

test('PC 使用与安卓相同的默认订阅来源实际出画并持续推进', {
  skip: process.env.SANYE_PC_REAL_SOURCE_CHECK !== '1', timeout: 75000,
}, async () => {
  const response = await fetch('https://sub.creamycake.org/v1/css1.json', { signal: AbortSignal.timeout(12000) })
  assert.equal(response.status, 200)
  const config = await response.json()
  const sources = config.exportedMediaSourceDataList.mediaSources
  const sourceIndex = sources.findIndex(source => source.arguments?.name === 'wedm')
  assert.ok(sourceIndex >= 0)
  const rule = sources[sourceIndex].arguments.searchConfig
  const searchUrl = rule.searchUrl.replace('{keyword}', encodeURIComponent('无职转生'))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const selectHref = (html, selector, groupSelector) => page.evaluate(({ html, selector, groupSelector }) => {
      const document = new DOMParser().parseFromString(html, 'text/html')
      return (groupSelector ? document.querySelector(groupSelector)?.querySelector(selector) : document.querySelector(selector))?.getAttribute('href') || ''
    }, { html, selector, groupSelector })
    const searchHtml = await (await fetch(searchUrl, { signal: AbortSignal.timeout(12000) })).text()
    const detailHref = await selectHref(searchHtml, rule.selectorSubjectFormatA.selectLists)
    assert.ok(detailHref, '默认来源搜索没有作品')
    const detailUrl = new URL(detailHref, searchUrl).toString()
    const detailHtml = await (await fetch(detailUrl, { signal: AbortSignal.timeout(12000) })).text()
    const episodeHref = await selectHref(detailHtml, rule.selectorChannelFormatFlattened.selectEpisodesFromList,
      rule.selectorChannelFormatFlattened.selectEpisodeLists)
    assert.ok(episodeHref, '默认来源没有选集')
    const episodeUrl = new URL(episodeHref, detailUrl).toString()
    const episodeHtml = await (await fetch(episodeUrl, { signal: AbortSignal.timeout(12000) })).text()
    const rawPlayer = episodeHtml.match(/player_aaaa\s*=\s*(\{[^;]+\})/)?.[1]
    assert.ok(rawPlayer, '默认来源播放页没有静态播放器配置')
    const player = JSON.parse(rawPlayer)
    const media = player.encrypt === 2
      ? decodeURIComponent(Buffer.from(player.url, 'base64').toString('utf8'))
      : player.encrypt === 1 ? decodeURIComponent(player.url) : player.url
    assert.equal(new URL(media).protocol, 'https:')
    const mimeType = new URL(media).pathname.toLowerCase().endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4'
    await page.addInitScript(() => localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 'off', quality: 'off' })))
    await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: route.request().url().includes('/episodes')
      ? [{ id: 1, episodeNo: 1, title: '第1集', playbackUrl: media, mimeType, sourcePageUrl: episodeUrl }]
      : { id: 127, title: '无职转生', type: '电视动画', tags: [], characters: [], similar: [] } } }))
    const started = Date.now()
    await page.goto(`${origin}/anime/127`)
    await page.locator('video').evaluate(video => { video.muted = true; void video.play().catch(() => {}) })
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5, null, { timeout: 30000 })
    const firstFrameMs = Date.now() - started
    const beginning = await page.locator('video').evaluate(video => video.currentTime)
    await page.waitForTimeout(15000)
    const state = await page.locator('video').evaluate(video => ({ advance: video.currentTime, paused: video.paused, error: video.error?.code }))
    assert.equal(state.paused, false)
    assert.equal(state.error, undefined)
    assert.ok(state.advance - beginning >= 12, `默认来源 15 秒只推进 ${state.advance - beginning} 秒`)
    console.log(JSON.stringify({ sourceIndex, firstFrameMs, continuousAdvanceSeconds: state.advance - beginning }))
  } finally { await browser.close() }
})
