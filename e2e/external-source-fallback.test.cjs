const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const path = require('node:path')

test('external film survives broken media and a failed primary preview without mixing series', { timeout: 90000 }, async () => {
  const browser = await chromium.launch()
  try {
    for (const mode of ['media-failure', 'preview-failure', 'transient-alternative', 'series']) {
      const page = await browser.newPage()
      let alternativeRequests = 0
      await page.route('**/api/v1/**', async route => {
        if (!route.request().url().includes('external-preview')) return route.fulfill({ json: { code: 0, data: [] } })
        const primary = new URL(route.request().url()).searchParams.get('sourceUrl')?.includes('/primary')
        if (!primary) alternativeRequests++
        if (!primary && mode === 'transient-alternative' && alternativeRequests === 1) return route.fulfill({ json: { code: 5002, message: '来源暂不可用' } })
        if (primary && mode === 'preview-failure') return route.fulfill({ json: { code: 5002, message: '来源暂不可用' } })
        return route.fulfill({ json: { code: 0, data: {
          title: '同名影片', originalTitle: '', type: mode === 'series' ? '电视动画' : '剧场版', tags: [],
          episodes: [{ id: 1, episodeNo: 1, title: 'HD', playbackUrl: primary ? '/broken.mp4' : '/available.mp4', mimeType: 'video/mp4', sourcePageUrl: '', playbackOptions: [] }],
        } } })
      })
      await page.route('**/broken.mp4', route => route.abort('namenotresolved'))
      await page.route('**/available.mp4', route => route.fulfill({ path: path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4'), contentType: 'video/mp4' }))
      const query = new URLSearchParams({ sourceUrl: 'https://www.yhdmtv.cc/primary', alternatives: 'https://www.yhdmtv.cc/alternative' })
      await page.goto(`http://127.0.0.1:5188/watch/external?${query}`)
      await page.locator('video').waitFor()
      if (mode === 'series') {
        await page.waitForTimeout(1000)
        assert.ok((await page.locator('video').getAttribute('src')).includes('/broken.mp4'))
        assert.equal(await page.getByRole('button', { name: '公开 HLS 播放源', exact: true }).count(), 0)
      } else {
        await page.waitForFunction(() => { const v = document.querySelector('video'); return v?.currentSrc.includes('/available.mp4') && v.currentTime > 0.2 }, undefined, { timeout: 25000 })
      }
      if (mode === 'transient-alternative') assert.equal(alternativeRequests, 2)
      await page.close()
    }
  } finally { await browser.close() }
})

test('first playable preview does not wait for slow sources, empty resources fail clearly, and late fallback recovers', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    for (const mode of ['slow-primary', 'slow-alternative', 'empty-primary', 'all-empty', 'late-recovery']) {
      console.log('preview scenario:', mode)
      const page = await browser.newPage()
      let release
      const delayed = new Promise(resolve => { release = resolve })
      await page.route('**/api/v1/**', async route => {
        if (!route.request().url().includes('external-preview')) return route.fulfill({ json: { code: 0, data: [] } })
        const primary = new URL(route.request().url()).searchParams.get('sourceUrl')?.includes('/primary')
        if ((primary && mode === 'slow-primary') || (!primary && ['slow-alternative', 'late-recovery'].includes(mode))) await delayed
        const empty = mode === 'all-empty' || (primary && mode === 'empty-primary')
        await route.fulfill({ json: { code: 0, data: { title: '同名影片', type: '剧场版', tags: [], episodes: empty ? [] : [{ id: 1, episodeNo: 1, title: 'HD', playbackUrl: primary && mode === 'late-recovery' ? '/broken.mp4' : '/available.mp4', mimeType: 'video/mp4', sourcePageUrl: '' }] } } })
      })
      await page.route('**/broken.mp4', route => route.abort('namenotresolved'))
      await page.route('**/available.mp4', route => route.fulfill({ path: path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4'), contentType: 'video/mp4' }))
      const query = new URLSearchParams({ sourceUrl: 'https://www.yhdmtv.cc/primary', alternatives: 'https://www.yhdmtv.cc/alternative' })
      await page.goto(`http://127.0.0.1:5188/watch/external?${query}`)
      if (mode === 'all-empty') {
        await page.getByText('该来源没有可直接播放的视频资源', { exact: true }).waitFor()
        assert.equal(await page.locator('video').count(), 0)
      } else {
        if (mode === 'late-recovery') {
          await page.getByText('播放器加载失败，请稍后重试或打开来源页。', { exact: true }).waitFor()
          release()
        }
        // These assertions run while the delayed source is still unresolved.
        await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2, undefined, { timeout: 5000 }).catch(async error => {
          console.log(await page.locator('video').evaluate(v => ({ src: v.currentSrc, paused: v.paused, ready: v.readyState, time: v.currentTime })))
          console.log(await page.locator('.anime-player-section').innerText())
          throw error
        })
        await page.evaluate(() => { window.testVideo = document.querySelector('video') })
        release()
        await page.waitForTimeout(300)
        assert.ok(await page.evaluate(() => window.testVideo === document.querySelector('video')))
      }
      release()
      await page.close()
    }
  } finally { await browser.close() }
})
