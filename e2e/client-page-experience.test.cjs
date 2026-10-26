const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5190'
const output = path.resolve(__dirname, '../sanye_deploy/.local/client-page-experience')
const card = { id: 133, title: '无职转生 · 第一季', type: '电视动画', status: '已完结', year: 2021, tags: [], updateText: '已完结' }

test('AI 慢会话读取期间禁止切换、新建和发送，完成后恢复', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  let releaseMessages
  const heldMessages = new Promise(resolve => { releaseMessages = resolve })
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      let data = { used: 0, limit: 5, anonymous: true }
      if (pathname.endsWith('/conversations')) data = { items: [{ id: 1, title: '会话一' }, { id: 2, title: '会话二' }] }
      if (pathname.endsWith('/1/messages')) { await heldMessages; data = [{ id: 10, role: 'ASSISTANT', content: '会话一已加载', status: 'DONE' }] }
      if (pathname.endsWith('/2/messages')) data = [{ id: 20, role: 'ASSISTANT', content: '会话二已加载', status: 'DONE' }]
      return route.fulfill({ json: { code: 0, data } })
    })
    await page.goto(origin + '/ai', { waitUntil: 'domcontentloaded' })
    const newChat = page.getByRole('button', { name: '新建会话', exact: true })
    await page.locator('.pending-bubble').waitFor()
    assert.equal(await newChat.isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: /会话二/ }).count(), 0, '首次读取完成前不暴露可切换会话')
    assert.equal(await page.getByRole('textbox', { name: '询问 AI 助手' }).isDisabled(), true)
    releaseMessages()
    await page.getByText('会话一已加载', { exact: true }).waitFor()
    assert.equal(await newChat.isDisabled(), false)
    await page.getByRole('button', { name: /会话二/ }).click()
    await page.getByText('会话二已加载', { exact: true }).waitFor()
    assert.equal(await page.getByText('会话一已加载', { exact: true }).count(), 0)
  } finally { releaseMessages(); await browser.close() }
})

test('片库空筛选可恢复，排期进入作品，AI 停止后不产生延迟回复', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  await fs.mkdir(output, { recursive: true })
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/api/v1/**', route => {
        const url = new URL(route.request().url())
        if (url.pathname.includes('/ai/conversations')) return route.fulfill({ status: 503, json: { code: 5002 } })
        const items = url.searchParams.has('keyword') || url.searchParams.has('type') ? [] : [card]
        const data = url.pathname.endsWith('/schedule/week') ? { generatedAt: '2026-10-10T12:00:00+08:00', days: [{ day: 'saturday', items: [{ animeId: 133, title: card.title, time: '21:00', state: '待播出', episode: '第 1 集', description: '新的旅程', tone: 'blue' }] }] }
          : url.pathname.endsWith('/ai/quota') ? { used: 0, limit: 5, anonymous: true }
          : { items, total: items.length, totalPages: 1 }
        return route.fulfill({ json: { code: 0, data } })
      })
      for (const theme of ['light', 'dark']) {
        await page.addInitScript(theme => { localStorage.setItem('sanyeThemeModeV2', theme); localStorage.removeItem('sanye:schedule:watch-marks:v1') }, theme)
        await page.goto(origin + '/anime-repository?keyword=不存在&keep=1')
        await page.getByRole('heading', { name: '没有找到匹配作品' }).waitFor()
        await page.getByLabel('按类型筛选').selectOption('电视动画')
        await page.getByRole('button', { name: '查看全部作品', exact: true }).click()
        await page.locator('.repository-card').waitFor()
        assert.equal(new URL(page.url()).searchParams.has('keyword'), false)
        assert.equal(new URL(page.url()).searchParams.get('keep'), '1')
        assert.equal(await page.getByLabel('按类型筛选').inputValue(), '全部类型')
        assert.equal(await page.getByRole('button', { name: '清除筛选', exact: true }).count(), 0)
        await page.screenshot({ path: path.join(output, `repository-${theme}-${width}.png`), fullPage: true })

        await page.goto(origin + '/schedule')
        await page.getByRole('tab', { name: /周六/ }).click()
        const link = page.getByRole('link', { name: '查看作品', exact: true })
        await link.waitFor()
        assert.equal(await link.getAttribute('href'), '/anime/133')
        await page.getByRole('button', { name: '标记想看', exact: true }).click()
        assert.equal(await page.getByRole('button', { name: '已标记', exact: true }).getAttribute('aria-pressed'), 'true')
        await page.screenshot({ path: path.join(output, `schedule-${theme}-${width}.png`), fullPage: true })

        await page.goto(origin + '/ai')
        const input = page.getByRole('textbox', { name: '询问 AI 助手' })
        await input.fill('测试停止')
        await page.getByRole('button', { name: '发送', exact: true }).click()
        assert.equal(await page.getByRole('button', { name: '新建会话', exact: true }).isDisabled(), true)
        assert.equal(await page.locator('.conversation-item').first().isDisabled(), true)
        await page.getByRole('button', { name: '停止', exact: true }).click()
        // 等待 Vue 提交本次发送的用户消息，再统计停止后的消息数。
        await page.locator('.message-row').filter({ hasText: '测试停止' }).waitFor()
        const count = await page.locator('.message-row').count()
        await page.waitForTimeout(750)
        assert.equal(await page.locator('.message-row').count(), count, '停止后不得追加本地延迟回复')
        assert.equal(await input.isDisabled(), false)
        await input.fill('继续对话')
        await page.getByRole('button', { name: '发送', exact: true }).click()
        await page.getByText('收到！你可以多告诉我一些偏好', { exact: false }).waitFor()
        await page.screenshot({ path: path.join(output, `ai-${theme}-${width}.png`), fullPage: true })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        const shortControls = await page.locator('.repository-collect, .send-button, .spoiler-toggle, .schedule-reminder, .icon-button').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 44).length)
        assert.equal(shortControls, 0)
      }
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
})
