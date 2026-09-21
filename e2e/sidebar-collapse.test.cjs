const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

test('navigation toggle remains clickable and resizes desktop layout without breaking mobile navigation', async () => {
  const browser = await chromium.launch()
  const output = path.resolve(__dirname, '../sanye_deploy/.local/sidebar-review')
  await fs.mkdir(output, { recursive: true })
  try {
    for (const width of [1280, 900]) {
      const page = await browser.newPage({ viewport: { width, height: 840 } })
      await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: { items: [], total: 0 } } }))
      await page.goto(process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5187/')
      await page.locator('.home-hero img').first().waitFor()
      await page.locator('img').evaluateAll(async images => {
        for (const img of images) img.loading = 'eager'
        await Promise.all(images.map(img => img.decode().catch(() => {})))
      })
      assert.deepEqual(await page.locator('img').evaluateAll(images => images.filter(img => !img.naturalWidth).map(img => img.src)), [])
      const button = page.locator('.sidebar-collapse')
      for (const collapsed of [false, true, false]) {
        if (await button.getAttribute('aria-expanded') !== String(!collapsed)) await button.click()
        const geometry = await page.evaluate(() => {
          const b = document.querySelector('.sidebar-collapse').getBoundingClientRect()
          const s = document.querySelector('.sidebar').getBoundingClientRect()
          const m = document.querySelector('.main-panel').getBoundingClientRect()
          const brand = document.querySelector('.brand').getBoundingClientRect()
          return { bx: b.x, by: b.y, br: b.right, bb: b.bottom, bw: b.width, bh: b.height, sx: s.x, sr: s.right, sw: s.width, mx: m.x, brandY: brand.y }
        })
        assert.equal(geometry.sw, collapsed ? 64 : 248)
        assert.ok(geometry.bx >= geometry.sx && geometry.br <= geometry.sr)
        assert.ok(geometry.bw >= 40 && geometry.bh >= 40 && geometry.bb <= geometry.brandY)
        assert.ok(Math.abs(geometry.mx - geometry.sr) <= 1)
        await page.screenshot({ path: path.join(output, `${width}-${collapsed ? 'collapsed' : 'expanded'}.png`) })
      }
      await button.focus()
      await page.keyboard.press('Enter')
      assert.equal(await button.getAttribute('aria-expanded'), 'false')
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(await button.isVisible(), false)
      for (const label of await page.locator('.main-nav .nav-item span:last-child').all()) assert.equal(await label.isVisible(), true)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.screenshot({ path: path.join(output, `${width}-to-mobile.png`) })
      await page.close()
    }
  } finally { await browser.close() }
})
