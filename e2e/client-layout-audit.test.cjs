const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const output = path.resolve(__dirname, '../sanye_deploy/.local/client-layout-audit')

test('client navigation and search controls fit their containers in both themes', { timeout: 120000 }, async () => {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch()
  const results = [], failures = []
  try {
    for (const width of [360, 390, 700, 800, 1024, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/api/v1/**', route => {
        const pathname = new URL(route.request().url()).pathname
        const data = pathname.endsWith('/home') ? { banners: [], sections: [], quickLinks: [] }
          : pathname.endsWith('/search/external') ? []
          : pathname.endsWith('/schedule/week') ? { generatedAt: '2026-09-17T00:00:00Z', days: [], total: 0 }
          : pathname.endsWith('/favorites') || pathname.endsWith('/history') ? { items: [], total: 0, totalPages: 0 }
          : { items: [], total: 0, totalPages: 0 }
        return route.fulfill({ json: { code: 0, data } })
      })
      for (const theme of ['light', 'dark']) {
        for (const route of ['/', '/search?keyword=布局验收', '/anime-repository', '/schedule', '/mine']) {
          await page.goto(origin + route)
          await page.locator('.page-stack').waitFor()
          await page.evaluate(theme => document.documentElement.dataset.sanyeTheme = theme, theme)
          const search = page.getByRole('textbox', { name: '全局搜索', exact: true })
          await search.fill('布局验收长标题')
          const measured = await page.evaluate(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
            const forms = [...document.querySelectorAll('.topbar-search, .large-search')].map(form => {
              const button = form.querySelector('.search-submit'), input = form.querySelector('input')
              const bounds = rect(form), control = rect(button), field = rect(input)
              return { name: form.className, bounds, control, field,
                fits: control.left >= bounds.left + 2 && control.right <= bounds.right - 2
                  && control.top >= bounds.top + 2 && control.bottom <= bounds.bottom - 2,
                inputFits: field.left >= bounds.left && field.right <= control.left && field.width >= 48 }
            })
            const header = rect(document.querySelector('.topbar')), title = rect(document.querySelector('.page-heading')),
              actions = rect(document.querySelector('.topbar-actions'))
            return { forms, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
              headerFits: actions.right <= header.right + 1 && (actions.left >= title.right || actions.top >= title.bottom) }
          })
          results.push({ width, theme, route, ...measured })
          if (measured.pageWidth > width || !measured.headerFits || measured.forms.some(form => !form.fits || !form.inputFits)) failures.push(results.at(-1))
          if (route.startsWith('/search') && [390, 800, 1280].includes(width)) await page.screenshot({ path: path.join(output, `search-${theme}-${width}.png`) })
        }
      }
      if (errors.length) failures.push({ width, errors })
      await page.close()
    }
    await fs.writeFile(path.join(output, 'layout.json'), JSON.stringify({ results, failures }, null, 2))
    assert.equal(failures.length, 0, `layout failures: ${JSON.stringify(failures.slice(0, 3))}; full report: ${output}`)
  } finally { await browser.close() }
})
