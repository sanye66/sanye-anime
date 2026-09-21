const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')

;(async () => {
  const output = path.resolve(__dirname, '../sanye_deploy/.local/player-menus')
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch()
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      await page.route('**/api/v1/**', async route => {
        const url = new URL(route.request().url())
        const data = url.pathname.endsWith('/episodes') ? [{ id: 1, episodeNo: 1, title: '播放正片', playbackUrl: '/menu-fixture.mp4', mimeType: 'video/mp4', sourcePageUrl: '' }] : { id: 127, title: '你的名字', originalTitle: '', type: '剧场版', status: '已发布', tags: [], characters: [], similar: [] }
        await route.fulfill({ json: { code: 0, data } })
      })
      await page.route('**/menu-fixture.mp4', route => route.fulfill({ path: path.resolve(output, '../realtime-interpolation/source-1080p.mp4'), contentType: 'video/mp4' }))
      await page.goto('http://127.0.0.1:5188/anime/127')
      const player = page.locator('.art-video-player')
      await player.waitFor()
      await player.scrollIntoViewIfNeeded()
      await page.locator('video').evaluate(async video => { video.muted = true; await video.play() })
      await page.waitForTimeout(700)
      await page.locator('video').evaluate(video => video.pause())
      await player.hover()
      for (const [control, label] of [['interpolation', '帧率'], ['anime4k', '画质']]) {
        const menu = page.locator(`.art-control-${control}`)
        assert.equal(await menu.locator('.art-selector-value').innerText(), label)
        await menu.hover()
        await menu.locator('.art-selector-list').waitFor({ state: 'visible' })
        await page.screenshot({ path: path.join(output, `${control}-${width}.png`) })
        if (control === 'interpolation') {
          await menu.locator('.art-selector-item').filter({ hasText: '144 FPS' }).click()
          assert.equal(await menu.locator('.art-selector-value').innerText(), '帧率')
        }
      }
      assert.equal(await page.locator('.art-setting-interpolationRate').count(), 0)
      await page.close()
    }
    console.log(`Menus verified; screenshots: ${output}`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
