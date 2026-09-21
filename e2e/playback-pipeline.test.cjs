const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs/promises')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const fixture = path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4')
const output = path.resolve(__dirname, '../sanye_deploy/.local/playback-pipeline')
const detail = { id: 127, title: '播放流程验收', type: '电视动画', tags: [], characters: [], similar: [] }
const episodes = [1, 2].map(id => ({ id, episodeNo: id, title: `第 ${id} 集`, playbackUrl: `/pipeline-${id}.mp4`, mimeType: 'video/mp4' }))
async function media(page) {
  const bytes = await fs.readFile(fixture)
  await page.route('**/pipeline-*.mp4', route => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '')
    if (!range) return route.fulfill({ body: bytes, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes' } })
    const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
    return route.fulfill({ status: 206, body: bytes.subarray(start, end + 1), contentType: 'video/mp4',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } })
  })
  await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: [] } }))
}

test('search to playback, single-source retry and back navigation preserve user state', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await media(page)
    await page.addInitScript(() => localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 'off', quality: 'off' })))
    await page.route('**/api/v1/search?*', route => route.fulfill({ json: { code: 0, data: {
      items: [{ id: 127, title: detail.title, type: detail.type, tags: [], year: 2026 }], page: 2, size: 20, total: 21, totalPages: 2,
    } } }))
    await page.route('**/api/v1/anime/127', route => route.fulfill({ json: { code: 0, data: detail } }))
    await page.route('**/api/v1/anime/127/episodes', route => route.fulfill({ json: { code: 0, data: episodes } }))
    await page.goto(`${origin}/search?keyword=播放&type=${encodeURIComponent('电视动画')}&page=2`)
    await page.locator('.search-results a.result-row').first().click()
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2)
    await page.locator('video').evaluate(async video => {
      window.mediaEvents = []
      for (const type of ['loadedmetadata', 'loadstart', 'loadeddata', 'seeking', 'seeked', 'emptied']) document.addEventListener(type, event => {
        if (event.target instanceof HTMLVideoElement) mediaEvents.push({ type, time: event.target.currentTime, duration: event.target.duration })
      }, true)
      video.muted = true; video.volume = 0.35; video.playbackRate = 1.5
      await new Promise(resolve => { video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 3 })
      video.dispatchEvent(new Event('error'))
    })
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2 && document.querySelector('video')?.currentTime >= 3, null, { timeout: 5000 }).catch(async error => {
      const state = await page.locator('video').evaluate(video => ({ time: video.currentTime, ready: video.readyState, error: video.error?.code, src: video.currentSrc, paused: video.paused, volume: video.volume, rate: video.playbackRate, events: mediaEvents }))
      throw new Error(`${error.message}: ${JSON.stringify(state)}`)
    })
    assert.deepEqual(await page.locator('video').evaluate(video => ({ paused: video.paused, volume: video.volume, rate: video.playbackRate })),
      { paused: true, volume: 0.35, rate: 1.5 })
    await page.locator('.detail-back-button').click()
    await page.waitForURL('**/search?*')
    assert.equal(new URL(page.url()).searchParams.get('page'), '2')
    assert.equal(new URL(page.url()).searchParams.get('type'), '电视动画')
    await page.getByText(detail.title, { exact: true }).waitFor()
  } finally { await browser.close() }
})

test('detail and episodes load concurrently and mount even when episodes finish first', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await media(page)
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('sanye:player:selected:')) throw new DOMException('Storage denied', 'SecurityError')
        return getItem.call(this, key)
      }
    })
    let release
    const gate = new Promise(resolve => { release = resolve })
    let requested = false
    await page.route('**/api/v1/anime/127', async route => { await gate; await route.fulfill({ json: { code: 0, data: detail } }) })
    await page.route('**/api/v1/anime/127/episodes', route => { requested = true; return route.fulfill({ json: { code: 0, data: episodes } }) })
    await page.goto(`${origin}/anime/127`)
    try {
      await page.waitForResponse(response => response.url().endsWith('/anime/127/episodes'), { timeout: 1500 }).catch(() => {})
      assert.equal(requested, true, 'playlist request must not wait for the blocked detail response')
    } finally { release() }
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2)
    assert.equal(await page.locator('video').count(), 1)
  } finally { await browser.close() }
})

test('background playlist refresh keeps the selected video, playback and preferences intact', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await media(page)
    await page.addInitScript(episodes => {
      localStorage.setItem('sanye:player:episodes:127', JSON.stringify({ data: episodes, expiresAt: Date.now() + 60000 }))
      localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 'off', quality: 'off' }))
    }, episodes)
    let release
    const gate = new Promise(resolve => { release = resolve })
    await page.route('**/api/v1/anime/127', route => route.fulfill({ json: { code: 0, data: detail } }))
    await page.route('**/api/v1/anime/127/episodes', async route => {
      await gate
      await route.fulfill({ json: { code: 0, data: episodes.map(item => ({ ...item, title: `${item.title} 已刷新` })) } })
    })
    await page.goto(`${origin}/anime/127`)
    try {
      await page.getByRole('button', { name: '第 2 集', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2)
      await page.locator('video').evaluate(async video => { window.originalVideo = video; video.muted = true; video.volume = 0.4; video.playbackRate = 1.25; await video.play() })
    } finally { release() }
    await page.getByRole('button', { name: '第 2 集 已刷新', exact: true }).waitFor()
    const result = await page.locator('video').evaluate(video => ({ same: video === window.originalVideo, paused: video.paused,
      volume: video.volume, rate: video.playbackRate, secondEpisode: video.currentSrc.endsWith('pipeline-2.mp4') }))
    assert.deepEqual(result, { same: true, paused: false, volume: 0.4, rate: 1.25, secondEpisode: true })
  } finally { await browser.close() }
})

test('open frame-rate controls stay stable while reflecting adaptive statistics', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await media(page)
    await page.route('**/api/v1/anime/127', route => route.fulfill({ json: { code: 0, data: detail } }))
    await page.route('**/api/v1/anime/127/episodes', route => route.fulfill({ json: { code: 0, data: episodes } }))
    await page.goto(`${origin}/anime/127`)
    await page.locator('video').evaluate(async video => { video.muted = true; video.loop = true; await video.play() })
    await page.locator('.sanye-realtime-interpolation-active').waitFor()
    const control = page.locator('.art-control-interpolation')
    await page.locator('.art-video-player').hover()
    await control.hover()
    await control.evaluate(element => { window.originalControl = element })
    await page.waitForTimeout(2200)
    assert.equal(await control.evaluate(element => element === window.originalControl), true, 'statistics must not replace an open menu')
    assert.match(await control.locator('.art-selector-item.art-current').innerText(), /\d+ FPS/)
    assert.equal(await page.evaluate(async () => (await import('/src/video/playbackPreferences.ts')).readPlaybackPreferences().frameRate), 'auto')
    await fs.mkdir(output, { recursive: true })
    await page.screenshot({ path: path.join(output, 'desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.anime-player-section').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(output, 'mobile.png') })
    assert.ok(await page.locator('.anime-player-frame').evaluate(element => element.getBoundingClientRect().right <= innerWidth))
  } finally { await browser.close() }
})

test('quality enhancement context loss restores the source without interrupting playback', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await media(page)
    // 该用例驱动页面主线程持有的 WebGL 上下文，因此固定走原 anime4k.js 路径（`enhancementPath: 'main'`）；
    // 默认的仅增强路径在渲染 Worker 内持有上下文，页面无法对其调用 loseContext，其不可用回退另见 `enhancement-thread-migration`。
    await page.addInitScript(() => localStorage.setItem('sanye:playback:preferences:v1',
      JSON.stringify({ frameRate: 'off', quality: 'fast', enhancementPath: 'main' })))
    await page.route('**/api/v1/anime/127', route => route.fulfill({ json: { code: 0, data: detail } }))
    await page.route('**/api/v1/anime/127/episodes', route => route.fulfill({ json: { code: 0, data: episodes } }))
    await page.goto(`${origin}/anime/127`)
    await page.locator('video').evaluate(async video => { video.muted = true; await video.play(); window.originalVideo = video })
    await page.locator('.sanye-anime4k-active').waitFor()
    await page.locator('.anime4k-canvas').evaluate(canvas => canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext())
    await page.locator('.anime4k-canvas').waitFor({ state: 'detached' })
    assert.deepEqual(await page.locator('video').evaluate(video => ({ same: video === originalVideo, paused: video.paused,
      enhanced: video.closest('.art-video-player').classList.contains('sanye-anime4k-active'), opacity: getComputedStyle(video).opacity })),
    { same: true, paused: false, enhanced: false, opacity: '1' })
  } finally { await browser.close() }
})

test('HLS quality change keeps the current decoded fragment and player', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await media(page)
    await page.addInitScript(() => localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 'off', quality: 'off' })))
    await page.route('**/api/v1/anime/127', route => route.fulfill({ json: { code: 0, data: detail } }))
    await page.route('**/api/v1/anime/127/episodes', route => route.fulfill({ json: { code: 0, data: [{ ...episodes[0], playbackUrl: '/pipeline-hls/master.m3u8', mimeType: 'application/vnd.apple.mpegurl' }] } }))
    await page.route('**/pipeline-hls/*', route => {
      const name = path.basename(new URL(route.request().url()).pathname)
      if (name === 'master.m3u8') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body:
        '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=450000,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720\nhigh.m3u8\n' })
      return route.fulfill({ path: path.resolve(output, '../seek-performance', name.endsWith('.m3u8') ? 'stream.m3u8' : name),
        contentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' })
    })
    await page.goto(`${origin}/anime/127`)
    await page.locator('video').evaluate(async video => { video.muted = true; await video.play() })
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.3)
    await page.evaluate(async () => {
      const entry = performance.getEntriesByType('resource').find(item => item.name.includes('/artplayer.js?'))
      const { default: Artplayer } = await import(entry.name)
      window.pipelinePlayer = Artplayer.instances[0]; window.originalVideo = pipelinePlayer.video; window.flushes = []
      pipelinePlayer.hls.on('hlsBufferFlushing', (_event, data) => flushes.push({ start: data.startOffset, end: data.endOffset, time: originalVideo.currentTime }))
    })
    await page.locator('.art-control-quality .art-selector-item').filter({ hasText: /^720P$/ }).dispatchEvent('click')
    await page.waitForTimeout(250)
    const result = await page.evaluate(() => ({ same: pipelinePlayer.video === originalVideo, paused: originalVideo.paused,
      level: pipelinePlayer.hls.manualLevel, ready: originalVideo.readyState, flushes }))
    assert.equal(result.same, true); assert.equal(result.paused, false); assert.equal(result.level, 1); assert.ok(result.ready >= 2)
    assert.ok(result.flushes.every(item => item.time < item.start || item.time >= item.end), JSON.stringify(result))
  } finally { await browser.close() }
})
