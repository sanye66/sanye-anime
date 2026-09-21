const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const desktop = process.env.SANYE_DESKTOP_MODE === 'true'
const card = { id: 127, title: '你的名字', type: '剧场版', year: 2016, status: '已完结', updateText: '已完结', tags: [], coverUrl: '/client-covers/your-name.jpg' }
const success = data => ({ code: 0, data })

test('weekly schedule uses server empty days and retries an unavailable response', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    let fail = false
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => ({
      day, label: day, items: day === 'thursday' ? [{ animeId: 127, title: '你的名字', time: '20:00', episode: '正片', description: '测试排期', state: '待播出', tone: 'blue' }] : [],
    }))
    await page.route('**/api/v1/schedule/week', route => fail
      ? route.fulfill({ status: 503, json: { code: 5002, message: '不可用' } })
      : route.fulfill({ json: success({ generatedAt: '2026-09-17', days, total: 1 }) }))
    await page.goto(`${origin}/schedule`)
    await page.getByText('测试排期').waitFor()
    assert.equal(await page.locator('.schedule-detail-row').count(), 1)
    await page.getByRole('button', { name: '标记想看', exact: true }).click()
    await page.reload()
    await page.getByRole('button', { name: '已标记', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '已标记', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.getByRole('button', { name: '已标记', exact: true }).click()
    await page.getByRole('button', { name: '标记想看', exact: true }).waitFor()
    await page.getByRole('tab', { name: /周一/ }).click()
    await page.getByText('当天暂无排期').waitFor()
    assert.equal(await page.locator('.schedule-detail-row').count(), 0)
    fail = true
    await page.reload()
    await page.getByRole('button', { name: '重试' }).waitFor()
    assert.equal(await page.locator('.schedule-detail-row').count(), desktop ? 0 : 2)
    if (desktop) assert.match(await page.locator('.schedule-status-error').innerText(), /排期加载失败/)
    fail = false
    await page.getByRole('button', { name: '重试' }).click()
    await page.getByText('测试排期').waitFor()
    assert.equal(await page.locator('.schedule-detail-row').count(), 1)
  } finally {
    await browser.close()
  }
})

test('repository distinguishes failed loading and restores a failed favorite mutation', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    let listFails = true
    let favoriteFails = false
    await page.route('**/api/v1/anime?**', route => listFails
      ? route.fulfill({ status: 503, json: { code: 5002, message: '不可用' } })
      : route.fulfill({ json: success({ items: [card], page: 1, size: 50, total: 1, totalPages: 1 }) }))
    await page.route('**/api/v1/users/me/favorites/127', route => route.fulfill({
      status: favoriteFails ? 503 : 200,
      json: favoriteFails ? { code: 5002, message: '不可用' } : success(null),
    }))
    await page.goto(`${origin}/anime-repository`)
    await page.getByRole('button', { name: '重试' }).waitFor()
    if (desktop) {
      await page.getByText('片库加载失败，请稍后重试。').waitFor()
      assert.equal(await page.getByText('没有找到匹配作品').count(), 0)
    }
    listFails = false
    await page.getByRole('button', { name: '重试' }).click()
    const collect = page.getByRole('button', { name: '收藏 你的名字' })
    await collect.waitFor()
    await collect.click()
    const remove = page.getByRole('button', { name: '取消收藏 你的名字' })
    await remove.waitFor()
    favoriteFails = true
    await remove.click()
    await remove.waitFor()
    assert.equal(await remove.getAttribute('aria-pressed'), 'true')
    await page.getByText('收藏操作失败，请重试。').waitFor()
  } finally {
    await browser.close()
  }
})

test('personal shelf loads history independently when favorites fail', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    let favoritesFail = true
    await page.route('**/api/v1/users/me/favorites?**', route => favoritesFail
      ? route.fulfill({ status: 503, json: { code: 5002, message: '不可用' } })
      : route.fulfill({ json: success({ items: [{ anime: card, createdAt: '2026-09-17' }], total: 1, totalPages: 1 }) }))
    await page.route('**/api/v1/users/me/history?**', route => route.fulfill({
      json: success({ items: [{ anime: card, lastViewAt: '2026-09-17' }], total: 1, totalPages: 1 }),
    }))
    await page.goto(`${origin}/mine`)
    await page.getByText('收藏接口暂不可用，请稍后重试。').waitFor()
    assert.equal(await page.locator('.mine-library-panel').nth(1).locator('.mine-shelf-card').count(), 1)
    favoritesFail = false
    await page.getByRole('button', { name: '重试' }).click()
    await page.locator('.mine-library-panel').first().locator('.mine-shelf-card').waitFor()
    assert.equal(await page.locator('.mine-shelf-card').count(), 2)
  } finally {
    await browser.close()
  }
})
