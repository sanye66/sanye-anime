const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs/promises')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5190'
const output = path.resolve(__dirname, '../sanye_deploy/.local/client-appearance')

test('light pages retain readable playback and optional detail source controls', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  await fs.mkdir(output, { recursive: true })
  const media = await fs.readFile(path.resolve(output, '../realtime-interpolation/source-1080p.mp4'))
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      await page.addInitScript(() => localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 'off', quality: 'off' })))
      const card = { id: 987, title: '你的名字', type: '剧场版', status: '已完结', tags: ['青春', '奇幻'], coverUrl: '/client-covers/your-name.jpg', summary: '跨越时空的相遇与约定。', characters: [], similar: [] }
      await page.route('**/api/v1/**', route => {
        const url = new URL(route.request().url())
        const data = url.pathname.endsWith('/episodes') ? [{ id: 1, episodeNo: 1, title: '正片', playbackUrl: '/ui-line-a.mp4', mimeType: 'video/mp4', playbackOptions: [
          { url: '/ui-line-a.mp4', mimeType: 'video/mp4', label: '原声 A' },
          { url: '/ui-line-b.mp4', mimeType: 'video/mp4', label: '原声 B' },
        ] }] : url.pathname.endsWith('/home') ? { banners: [], sections: [{ key: 'recent', anime: [card] }, { key: 'popular', anime: [card] }], quickLinks: [] }
          : url.pathname === '/api/v1/anime/987' ? card : { items: [], total: 0, totalPages: 0 }
        return route.fulfill({ json: { code: 0, data } })
      })
      await page.route('**/ui-line-*.mp4', route => route.fulfill({ body: media, contentType: 'video/mp4' }))
      await page.goto(origin)
      assert.equal(await page.locator('html').getAttribute('data-sanye-theme'), 'light')
      await page.locator('.home-hero img').first().waitFor()
      await page.waitForFunction(() => [...document.querySelectorAll('.home-hero img')].some(image => image.complete && image.naturalWidth > 0))
      await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true })
      for (let slide = 0; slide < 2; slide++) {
        const buttonFits = await page.locator('.hero-copy-slide[aria-hidden="false"] .primary-button').evaluate(button => {
          const bounds = button.closest('.hero-copy-viewport').getBoundingClientRect()
          const box = button.getBoundingClientRect()
          return box.left >= bounds.left - 1 && box.right <= bounds.right + 1
        })
        assert.ok(buttonFits, `hero slide ${slide} action must fit at ${width}px`)
        await page.locator('.hero-carousel-arrow').last().click()
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.getByRole('button', { name: '切换到暗色模式', exact: true }).click()
      await page.reload()
      assert.equal(await page.locator('html').getAttribute('data-sanye-theme'), 'dark')
      await page.getByRole('button', { name: '切换到亮色模式', exact: true }).click()
      await page.goto(origin + '/anime/987')
      await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2)
      const sources = page.locator('details.anime-playback-sources')
      assert.equal(await sources.getAttribute('open'), null)
      assert.equal(await sources.getByRole('button', { name: '原声 B', exact: true }).isVisible(), false)
      await sources.locator('summary').click()
      await sources.getByRole('button', { name: '原声 B', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('video')?.currentSrc.includes('ui-line-b.mp4'))
      await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2 && !document.querySelector('.player-loading-overlay'))
      assert.equal(await sources.getByRole('button', { name: '原声 B', exact: true }).getAttribute('aria-pressed'), 'true')
      const fullscreenFits = await page.locator('.art-control-fullscreen').evaluate(control => {
        const bounds = control.closest('.anime-player-frame').getBoundingClientRect()
        const button = control.getBoundingClientRect()
        return button.left >= bounds.left && button.right <= bounds.right
      })
      assert.ok(fullscreenFits, `fullscreen control must fit at ${width}px`)
      await page.screenshot({ path: path.join(output, `detail-open-${width}.png`), fullPage: true })
      await sources.locator('summary').click()
      await page.screenshot({ path: path.join(output, `detail-${width}.png`), fullPage: true })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.close()
    }
  } finally { await browser.close() }
})
