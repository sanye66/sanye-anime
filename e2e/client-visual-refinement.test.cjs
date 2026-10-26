const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5190'
const output = path.resolve(__dirname, '../sanye_deploy/.local/client-visual-refinement')
const card = { id: 133, title: '无职转生 · 第一季', type: '电视动画', year: 2021, status: '已完结', tags: ['异世界', '冒险'], coverUrl: '/client-covers/your-name.jpg', updateText: '第一季 · 23 集', summary: '新的伙伴与旅程在异世界继续。', characters: [], similar: [] }

test('client visual hierarchy stays compact and theme controls are centered', { timeout: 60000 }, async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch()
  const cover = await fs.readFile(path.resolve(__dirname, '../sanye_client/public/client-covers/your-name.jpg'))
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/admin-profile/**', route => route.fulfill({ contentType: 'image/jpeg', body: cover }))
      await page.route('**/api/v1/**', route => {
        const pathname = new URL(route.request().url()).pathname
        const shelf = Array.from({ length: 8 }, (_, index) => ({ anime: { ...card, id: [133, 136, 127, 163][index % 4] }, createdAt: '2026-10-10' }))
        const data = pathname.endsWith('/home') ? { banners: [], sections: [{ key: 'recent', anime: [card] }, { key: 'popular', anime: [card] }], quickLinks: [] }
          : pathname.endsWith('/continue-watching') ? [{ animeId: 133, episodeId: 9876, episodeTitle: '', positionSeconds: 100, durationSeconds: 1200, completed: false }]
          : pathname.endsWith('/favorites') || pathname.endsWith('/history') ? { items: shelf, total: 8, totalPages: 1 }
          : pathname.endsWith('/episodes') ? []
          : pathname === '/api/v1/anime/133' ? card
          : { items: [card], total: 1, totalPages: 1 }
        return route.fulfill({ json: { code: 0, data } })
      })
      for (const theme of ['light', 'dark']) {
        await page.addInitScript(theme => localStorage.setItem('sanyeThemeModeV2', theme), theme)
        for (const route of ['/', '/anime-repository', '/anime/133', '/mine']) {
          await page.goto(origin + route)
          await page.locator('.page-stack').waitFor()
          await page.evaluate(() => document.fonts.ready)
          await page.waitForTimeout(150)
          const result = await page.evaluate(() => {
            const button = document.querySelector('.theme-toggle').getBoundingClientRect()
            const icon = document.querySelector('.theme-toggle svg').getBoundingClientRect()
            const flat = [...document.querySelectorAll('.repository-card, .mine-rail-card, .anime-cover-card')].every(node => getComputedStyle(node).boxShadow === 'none' && getComputedStyle(node).borderTopWidth === '0px')
            return { overflow: document.documentElement.scrollWidth > innerWidth, centered: Math.abs((button.left + button.width / 2) - (icon.left + icon.width / 2)) < 1 && Math.abs((button.top + button.height / 2) - (icon.top + icon.height / 2)) < 1, flat }
          })
          assert.equal(result.overflow, false, `${theme} ${width} ${route} 不应横向溢出`)
          assert.equal(result.centered, true, `${theme} ${width} 主题图标应居中`)
          assert.equal(result.flat, true, `${theme} ${route} 海报卡片不应有重复底板和阴影`)
          if (route === '/mine') {
            await page.getByText('上次观看 · 已观看 8%', { exact: true }).waitFor()
            assert.equal(await page.locator('.mine-continue-card').getAttribute('href'), '/anime/133?episode=9876&resume=1&t=100')
            assert.equal(await page.getByText('第 9876 集', { exact: false }).count(), 0)
            await page.getByRole('button', { name: '查看全部', exact: true }).first().click()
            await page.locator('.mine-rail.is-expanded').waitFor()
            assert.equal(await page.getByText('播放速度', { exact: true }).count(), 0)
          }
          const name = route === '/' ? 'home' : route.replaceAll('/', '-').slice(1)
          await page.locator('.page-stack img').evaluateAll(async images => {
            await Promise.all(images.map(image => { image.loading = 'eager'; return image.decode().catch(() => undefined) }))
          })
          await page.screenshot({ path: path.join(output, `${name}-${theme}-${width}-final.png`), fullPage: true, animations: 'disabled' })
        }
      }
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
