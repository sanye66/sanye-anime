const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs/promises')
const origin = 'http://127.0.0.1:5188'
const output = path.resolve(__dirname, '../sanye_deploy/.local/playback-experience')

test('preferences validate storage and route ranking expires failures without changing language', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: [] } }))
    await page.goto(origin)
    const result = await page.evaluate(async () => {
      const p = await import('/src/video/playbackPreferences.ts')
      localStorage.clear()
      const options = [{ url: '/a.mp4', label: '日语原声', mimeType: 'video/mp4' }, { url: '/b.mp4', label: '国语', mimeType: 'video/mp4' }, { url: '/c.mp4', label: '日语原声', mimeType: 'video/mp4' }]
      p.savePlaybackPreferences({ frameRate: 144, quality: 'sharp', volume: 0.3, rate: 1.5, language: '原声' })
      p.recordPlaybackRoute('film', '/c.mp4', true)
      p.recordPlaybackRoute('film', '/a.mp4', false)
      const ranked = p.rankPlaybackOptions(options, 'film', '原声').map(item => item.url)
      const saved = p.readPlaybackPreferences()
      localStorage.setItem('sanye:playback:preferences:v1', '{')
      const corrupt = p.readPlaybackPreferences()
      const records = JSON.parse(localStorage.getItem('sanye:playback:routes:v1'))
      records.forEach(item => item.time = Date.now() - 11 * 60000)
      localStorage.setItem('sanye:playback:routes:v1', JSON.stringify(records))
      const expired = p.rankPlaybackOptions(options, 'film', '原声').map(item => item.url)
      // 起播清晰度记忆：自动记录、手动强偏好、阶梯变化匹配、过期与清除
      const source = location.origin + '/media/master.m3u8'
      const ladder = p.qualityLadderSignature([{ height: 360, bitrate: 900000 }, { height: 720, bitrate: 2600000 }])
      p.saveStartupQuality(source, { ladder, mode: 'auto', index: 1, height: 720, bitrate: 2600000 })
      const autoQuality = p.readStartupQuality(source)?.height
      p.saveStartupQuality(source, { ladder, mode: 'manual', index: 0, height: 360, bitrate: 900000 })
      const manualQuality = p.readStartupQuality(source)?.mode
      const rematchedQuality = p.matchStartupQualityIndex([{ height: 480, bitrate: 700000 }, { height: 360, bitrate: 950000 }], p.readStartupQuality(source))
      const unmatchedQuality = p.matchStartupQualityIndex([{ height: 1080, bitrate: 5000000 }], p.readStartupQuality(source))
      p.clearStartupQuality(source, 'manual')
      const afterManualClear = p.readStartupQuality(source)?.height
      p.saveStartupQuality(source, { ladder, mode: 'auto', index: 1, height: 720, bitrate: 2600000, time: Date.now() - 8 * 86400000 })
      const expiredQuality = p.readStartupQuality(source)
      p.clearStartupQuality(source)
      const clearedQuality = p.readStartupQuality(source)
      return { ranked, saved, corrupt, expired, autoQuality, manualQuality, rematchedQuality, unmatchedQuality, afterManualClear, expiredQuality, clearedQuality }
    })
    assert.deepEqual(result.ranked, ['/c.mp4', '/b.mp4', '/a.mp4'])
    assert.deepEqual(result.expired, ['/c.mp4', '/a.mp4', '/b.mp4'])
    assert.equal(result.saved.frameRate, 144)
    assert.equal(result.saved.volume, 0.3)
    assert.equal(result.corrupt.frameRate, 'auto')
    assert.equal(result.autoQuality, 720)
    assert.equal(result.manualQuality, 'manual')
    assert.equal(result.rematchedQuality, 1)
    assert.equal(result.unmatchedQuality, -1)
    assert.equal(result.afterManualClear, 720)
    assert.equal(result.expiredQuality, null)
    assert.equal(result.clearedQuality, null)
  } finally { await browser.close() }
})

test('playback survives sustained looping, seeking, paused same-language failover and reload preferences', { timeout: 120000 }, async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.addInitScript(() => {
      if (!localStorage.getItem('sanye:playback:preferences:v1')) localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 'off', quality: 'off' }))
    })
    await page.route('**/api/v1/**', route => {
      const data = route.request().url().includes('/episodes') ? [{ id: 1, episodeNo: 1, title: '正片', playbackUrl: '/line-a.mp4', mimeType: 'video/mp4', sourcePageUrl: '', playbackOptions: [
        { url: '/line-a.mp4', mimeType: 'video/mp4', label: '日语原声 A' }, { url: '/line-zh.mp4', mimeType: 'video/mp4', label: '国语' }, { url: '/line-b.mp4', mimeType: 'video/mp4', label: '日语原声 B' },
      ] }] : { id: 127, title: '播放验收', type: '剧场版', tags: [], characters: [], similar: [] }
      return route.fulfill({ json: { code: 0, data } })
    })
    const media = await fs.readFile(path.resolve(output, '../realtime-interpolation/source-1080p.mp4'))
    await page.route('**/line-*.mp4', route => {
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '')
      if (!range) return route.fulfill({ body: media, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes' } })
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
      return route.fulfill({ status: 206, body: media.subarray(start, end + 1), contentType: 'video/mp4', headers: { 'Content-Range': `bytes ${start}-${end}/${media.length}`, 'Accept-Ranges': 'bytes' } })
    })
    await page.goto(origin + '/anime/127')
    await page.locator('video').evaluate(async v => { v.muted = true; v.loop = true; await v.play() })
    const samples = []
    for (let i = 0; i < (process.env.SANYE_QUICK_TEST ? 1 : 12); i++) {
      await page.waitForTimeout(5000)
      samples.push(await page.locator('video').evaluate(v => ({ frames: v.getVideoPlaybackQuality().totalVideoFrames, paused: v.paused, time: v.currentTime, error: v.error?.code })))
    }
    assert.ok(samples.every(item => !item.paused && !item.error))
    if (!process.env.SANYE_QUICK_TEST) assert.ok(samples.at(-1).frames > samples[0].frames + 500)
    await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 4; v.volume = 0.35; v.playbackRate = 1.5 })
    await page.waitForFunction(() => !document.querySelector('video').seeking && document.querySelector('video').currentTime >= 3.9)
    await page.locator('video').evaluate(v => v.dispatchEvent(new Event('error')))
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v?.currentSrc.includes('line-b.mp4') && v.readyState >= 2 && v.currentTime >= 3.9 }).catch(async error => {
      console.log(await page.locator('video').evaluate(v => ({ src: v.currentSrc, time: v.currentTime, paused: v.paused, ready: v.readyState })))
      throw error
    })
    const preserved = await page.locator('video').evaluate(v => ({ paused: v.paused, volume: v.volume, rate: v.playbackRate, muted: v.muted }))
    assert.deepEqual(preserved, { paused: true, volume: 0.35, rate: 1.5, muted: true })
    await page.locator('video').evaluate(v => v.play())
    await page.waitForTimeout(2500)
    await page.reload()
    await page.waitForFunction(() => document.querySelector('video')?.currentSrc.includes('line-b.mp4'))
    await page.locator('.art-video-player').hover()
    await page.locator('.art-control-interpolation').hover()
    await page.locator('.art-control-interpolation .art-selector-item').filter({ hasText: /^90 FPS$/ }).click()
    await page.locator('.art-control-anime4k').hover()
    await page.locator('.art-control-anime4k .art-selector-item').filter({ hasText: /^锐化$/ }).click()
    await page.reload()
    await page.locator('.art-control-interpolation').waitFor()
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:playback:preferences:v1')))
    assert.equal(stored.frameRate, 90)
    assert.equal(stored.quality, 'sharp')
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.anime-player-section').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(output, 'mobile.png') })
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ samples, preserved, stored, status: 'passed', durationSeconds: samples.length * 5 }, null, 2))
  } finally { await browser.close() }
})
