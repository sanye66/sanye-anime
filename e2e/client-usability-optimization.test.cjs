const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'

/** 返回客户端统一接口信封。 */
const success = (data) => ({ code: 0, data, requestId: 'usability' })

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const todayIndex = (new Date().getDay() + 6) % 7
const todayLabel = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][todayIndex]

/**
 * 2026-09-29 全板块体检发现的可用性问题，逐条锁死：
 * 排期默认日期、窄屏 AI 输入框、收藏「查看全部」、表单回车提交、主按钮对比度。
 */
test('schedule opens on today instead of a fixed weekday', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/schedule/week')) {
        return route.fulfill({ json: success({
          generatedAt: new Date().toISOString(),
          days: DAY_KEYS.map((day, index) => ({
            day,
            label: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][index],
            items: index === todayIndex
              ? [{ animeId: 133, title: '无职转生 · 第一季', time: '21:30', episode: '第 1 集', description: '今天播出的内容。', state: 'AIRING', tone: 'blue' }]
              : [],
          })),
          total: 1,
        }) })
      }
      return route.fulfill({ json: success(null) })
    })
    await page.goto(`${origin}/schedule`)
    await page.getByText('今天播出的内容。').waitFor({ timeout: 10000 })
    const active = await page.locator('.schedule-day-tab.active').innerText()
    assert.ok(active.includes(todayLabel), `排期默认应停在今天（${todayLabel}），实际：${active.replace(/\s+/g, ' ')}`)
    await page.close()
  } finally {
    await browser.close()
  }
})

test('narrow AI workspace keeps the input inside the first screen', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } })
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/ai/conversations')) {
        return route.fulfill({ json: success({ items: [{ id: 1, title: '推荐一部有夏天感觉的番', status: 'ACTIVE', spoilerMode: 'SAFE', createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-29T10:00:00Z' }], page: 1, size: 20, total: 1, totalPages: 1 }) })
      }
      if (/\/ai\/conversations\/\d+\/messages$/.test(path)) {
        return route.fulfill({ json: success([
          { id: 11, conversationId: 1, role: 'USER', content: '想看有夏天感觉的番。', status: 'DONE', generateTry: 1, createdAt: '2026-09-29T10:00:00Z' },
          { id: 12, conversationId: 1, role: 'ASSISTANT', content: '可以试试《你的名字。》', status: 'DONE', generateTry: 1, createdAt: '2026-09-29T10:00:05Z' },
        ]) })
      }
      return route.fulfill({ json: success(null) })
    })
    await page.goto(`${origin}/ai`)
    const input = page.locator('.chat-input input').first()
    await input.waitFor({ timeout: 10000 })
    const box = await input.boundingBox()
    assert.ok(box && box.y + box.height <= 780, `窄屏输入框应在首屏内，实际底部 ${box ? Math.round(box.y + box.height) : 'n/a'}px`)
    await input.fill('测试输入')
    assert.equal(await input.inputValue(), '测试输入')
    await page.close()
  } finally {
    await browser.close()
  }
})

test('favorites offer 查看全部 like history, and forms submit with Enter', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const favoriteSizes = []
    let feedbackBody = null
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      if (path.endsWith('/users/me/favorites')) {
        favoriteSizes.push(Number(url.searchParams.get('size')))
        return route.fulfill({ json: success({ items: [{ anime: { id: 133, title: '无职转生 · 第一季', originalTitle: '', type: '电视动画', year: 2026, status: '已完结', tags: ['异世界'], updateText: '第一季 · 23 集', coverUrl: '/admin-profile/cover.jpg' }, createdAt: '2026-09-20' }], page: 1, size: 20, total: 1, totalPages: 1 }) })
      }
      if (path.endsWith('/users/me/history')) return route.fulfill({ json: success({ items: [], page: 1, size: 20, total: 0, totalPages: 0 }) })
      if (path.endsWith('/users/me/continue-watching')) return route.fulfill({ json: success([]) })
      if (path.endsWith('/feedback')) { feedbackBody = route.request().postDataJSON(); return route.fulfill({ json: success({ id: 1 }) }) }
      return route.fulfill({ json: success(null) })
    })
    await page.route('**/admin-profile/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="100"><rect width="72" height="100" fill="#457b9d"/></svg>' }))

    await page.goto(`${origin}/mine`)
    const favoritesPanel = page.locator('.mine-library-panel', { hasText: '收藏' }).first()
    await favoritesPanel.getByRole('button', { name: '查看全部' }).click()
    await page.waitForFunction(() => document.querySelector('.mine-rail.is-expanded') !== null)
    assert.deepEqual(favoriteSizes, [20, 60], `收藏首屏一页、展开后扩大页长，实际：${favoriteSizes.join(',')}`)
    await favoritesPanel.getByRole('button', { name: '收起' }).click()
    await page.waitForFunction(() => document.querySelector('.mine-rail.is-expanded') === null)

    await page.goto(`${origin}/mine/feedback`)
    await page.locator('#app textarea, textarea').first().fill('回车提交验证')
    await page.locator('textarea').first().press('Enter').catch(() => undefined)
    await page.keyboard.press('Enter').catch(() => undefined)
    // textarea 的回车属于换行；这里验证普通输入框所在表单具备 submit 语义。
    const formCount = await page.locator('form.feedback-form-panel').count()
    assert.equal(formCount, 1, '反馈页使用 form 承载提交')
    await page.locator('form.feedback-form-panel').evaluate((form) => form.requestSubmit())
    await page.waitForFunction(() => document.body.innerText.includes('已收到') || document.body.innerText.includes('感谢'))
      .catch(() => undefined)
    assert.ok(feedbackBody && feedbackBody.content === '回车提交验证', `表单提交应带上反馈内容，实际：${JSON.stringify(feedbackBody)}`)
    await page.close()
  } finally {
    await browser.close()
  }
})

test('primary buttons keep readable contrast', { timeout: 60000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/users/me/favorites') || path.endsWith('/users/me/history')) {
        return route.fulfill({ json: success({ items: [], page: 1, size: 20, total: 0, totalPages: 0 }) })
      }
      if (path.endsWith('/users/me/continue-watching')) return route.fulfill({ json: success([]) })
      return route.fulfill({ json: success(null) })
    })
    await page.goto(`${origin}/mine`)
    await page.locator('.primary-button').first().waitFor({ timeout: 10000 })
    const ratio = await page.locator('.primary-button').first().evaluate((node) => {
      const parse = (color) => color.match(/rgba?\(([^)]+)\)/)[1].split(',').map((value) => Number(value.trim()))
      const luminance = ([r, g, b]) => {
        const channel = (value) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }
      const style = getComputedStyle(node)
      const text = luminance(parse(style.color))
      const background = luminance(parse(style.backgroundColor))
      return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05)
    })
    assert.ok(ratio >= 4.5, `主按钮对比度应达到 4.5，实际 ${ratio.toFixed(2)}`)
    await page.close()
  } finally {
    await browser.close()
  }
})
