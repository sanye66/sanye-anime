const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5191'
const output = path.resolve(__dirname, '../sanye_deploy/.local/client-accessibility')

async function prepare(page) {
  await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 0, data: { banners: [], sections: [], quickLinks: [], items: [], total: 0, totalPages: 0 } } }))
  await page.goto(origin)
  await page.locator('#main-content').waitFor()
}

test('键盘可跳过导航并感知路由切换和返回', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      await prepare(page)
      await page.keyboard.press('Tab')
      assert.equal(await page.locator('.skip-link').evaluate(element => element === document.activeElement), true)
      await fs.mkdir(output, { recursive: true })
      await page.screenshot({ path: path.join(output, `skip-${width}.png`), fullPage: true })
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => document.activeElement?.id === 'main-content')
      await page.keyboard.press('Control+k')
      assert.equal(await page.locator('.topbar-search input').evaluate(element => element === document.activeElement), true)
      await page.locator('.main-nav a[href="/schedule"]').focus()
      await page.keyboard.press('Enter')
      await page.waitForURL('**/schedule')
      await page.waitForFunction(() => document.activeElement?.id === 'main-content')
      assert.equal(await page.title(), '一周排期 · sanye_anime')
      assert.equal(await page.locator('main').getAttribute('aria-labelledby'), 'page-title')
      assert.equal(await page.locator('#page-title').textContent(), '一周排期')
      await page.goBack()
      await page.waitForFunction(() => document.activeElement?.id === 'main-content')
      assert.equal(await page.title(), '首页 · sanye_anime')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true })
      await page.close()
    }
  } finally { await browser.close() }
})

test('插帧窗口支持焦点圈定、Escape 和关闭后返回', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
    await prepare(page)
    await page.evaluate(async () => {
      const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js')
      const { default: Dialog } = await import('/src/components/frameInterpolationDialog.vue')
      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;top:100px;left:24px;z-index:999'
      document.body.append(container)
      createApp({ setup() {
        const open = ref(false)
        return () => h('div', [
          h('button', { id: 'dialog-opener', onClick: () => { open.value = true } }, '打开插帧'),
          open.value && h(Dialog, { source: '', hls: false, title: '键盘测试', onClose: () => { open.value = false } }),
        ])
      } }).mount(container)
    })
    const close = page.getByRole('button', { name: '关闭插帧窗口' })
    const last = page.getByRole('button', { name: '返回原视频' })
    await page.locator('#dialog-opener').click()
    await close.waitFor()
    assert.equal(await close.evaluate(element => element === document.activeElement), true)
    await page.keyboard.press('Shift+Tab')
    assert.equal(await last.evaluate(element => element === document.activeElement), true)
    await page.keyboard.press('Tab')
    assert.equal(await close.evaluate(element => element === document.activeElement), true)
    await page.keyboard.press('Control+k')
    assert.equal(await close.evaluate(element => element === document.activeElement), true)
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))), true)
    }
    await fs.mkdir(output, { recursive: true })
    assert.equal(await page.locator('#interpolation-title').evaluate(element => getComputedStyle(element).color), 'rgb(241, 243, 245)')
    await page.locator('dialog').screenshot({ path: path.join(output, 'dialog-390.png') })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('dialog') && document.activeElement?.id === 'dialog-opener')
    await page.locator('#dialog-opener').click()
    await close.waitFor()
    await last.click()
    await page.waitForFunction(() => !document.querySelector('dialog') && document.activeElement?.id === 'dialog-opener')
  } finally { await browser.close() }
})
