const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')

/**
 * 连点两次搜索不能出现“搜不到”：
 * 同一关键词的第二次搜索命中客户端搜索结果缓存，不再重复打来源（这正是原来“第二次搜索
 * 抢不到来源线程、返回空列表”的窗口），界面全程保留上一次的结果。
 */
test('连点两次搜索不重复打来源、不出现搜不到', async () => {
  const server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURI(request.url || '/'))
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    const file = target === root ? path.join(root, 'index.html') : target
    try {
      const data = await readFile(file)
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await page.addInitScript(() => {
      const settings = { theme: 'system', autoPlay: false, playbackRate: 1 }
      const names = (methodNames) => methodNames.map((name) => ({ name, rtype: 'promise' }))
      window.__searchCalls = []
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [
          { name: 'SanyeCatalog', methods: names(['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache']) },
          { name: 'SanyeSource', methods: names(['search', 'preview']) },
        ],
        nativePromise: async (_, method, options) => {
          if (method === 'search') {
            window.__searchCalls.push(options.keyword)
            // 第一次正常返回；之后（换关键词）模拟来源没有命中，返回空列表。
            if (window.__searchCalls.length === 1) {
              return { hits: [{ title: '无职转生', sourceUrl: 'https://www.yhdmtv.cc/v/210580/153', coverUrl: '', summary: '' }] }
            }
            return { hits: [] }
          }
          if (method === 'preview') return { title: '无职转生', sourceUrl: options.sourceUrl, coverUrl: '', summary: '', episodes: [{ id: 'first', title: '第1集', sourceUrl: options.sourceUrl, playbackUrl: 'https://media.example.org/first.mp4', mimeType: 'video/mp4' }] }
          if (method === 'list' || method === 'listHistory') return { items: [] }
          if (method === 'getSettings') return { settings: { ...settings } }
          if (method === 'recordProgress' || method === 'save') return { item: options }
          return { removed: 0 }
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.locator('.android-top-search').click()
    await page.getByLabel('作品关键词').fill('无职转生')
    await page.getByRole('button', { name: '搜索来源' }).click()
    await page.getByText('无职转生', { exact: true }).waitFor()
    await page.locator('.android-top-search').click()
    assert.equal(await page.getByLabel('作品关键词').inputValue(), '', '再次进入搜索应直接删除旧关键词')
    assert.equal(await page.getByLabel('作品关键词').evaluate(input => input === document.activeElement), true, '清空后应聚焦输入框')
    assert.equal(await page.getByRole('button', { name: '清空搜索输入' }).count(), 0, '搜索框不新增清空按钮')
    await page.getByLabel('作品关键词').fill('无职转生')

    // 连点第二次：命中客户端缓存，不再请求来源，结果保持可见。
    await page.getByRole('button', { name: '搜索来源' }).click()
    await page.getByText('无职转生', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__searchCalls.length), 1, '同一关键词第二次搜索不应再打来源')
    assert.equal(await page.getByText('没有找到匹配作品').count(), 0, '同一关键词的空结果不得把已有结果清空')

    // 换关键词时必须清空旧结果，不能让上一次的作品留在列表里。
    await page.getByLabel('作品关键词').fill('天气之子')
    await page.getByRole('button', { name: '搜索来源' }).click()
    await page.getByText('没有找到匹配作品').waitFor()
    assert.equal(await page.getByText('无职转生', { exact: true }).count(), 0, '换关键词后不得残留上一次结果')
    assert.equal(await page.evaluate(() => window.__searchCalls.length), 2, '换关键词要靠来源返回空结果')
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

/**
 * 来源不可用必须是错误，不是空结果（VQ-60）：
 * 原生侧两个搜索入口都失败时返回错误，客户端据此静默重试一次、仍然失败才提示「暂不可用」。
 * 以前原生返回空列表，界面显示「没有找到匹配作品」，用户以为来源里没有这部作品。
 */
test('来源不可用时静默重试一次并提示暂不可用，而不是显示没有找到', async () => {
  const server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURI(request.url || '/'))
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    const file = target === root ? path.join(root, 'index.html') : target
    try {
      const data = await readFile(file)
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await page.addInitScript(() => {
      const settings = { theme: 'system', autoPlay: false, playbackRate: 1 }
      const names = (methodNames) => methodNames.map((name) => ({ name, rtype: 'promise' }))
      window.__searchCalls = 0
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [
          { name: 'SanyeCatalog', methods: names(['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache']) },
          { name: 'SanyeSource', methods: names(['search', 'preview']) },
        ],
        nativePromise: async (_, method, options) => {
          if (method === 'search') {
            window.__searchCalls += 1
            // 与原生新语义一致：两个入口都取不到页面时 reject，而不是 resolve({hits:[]})。
            throw new Error('来源搜索暂不可用，请检查网络或稍后重试')
          }
          if (method === 'preview') return { title: '', sourceUrl: options.sourceUrl, coverUrl: '', summary: '', episodes: [] }
          if (method === 'list' || method === 'listHistory') return { items: [] }
          if (method === 'getSettings') return { settings: { ...settings } }
          if (method === 'recordProgress' || method === 'save') return { item: options }
          return { removed: 0 }
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.locator('.android-top-search').click()
    await page.getByLabel('作品关键词').fill('无职转生')
    await page.getByRole('button', { name: '搜索来源' }).click()
    await page.getByText('搜索失败，请检查网络后重试。', { exact: true }).waitFor({ timeout: 5_000 })
    // 原生报错才会触发这一次静默重试：失败即报错，重试才真正生效。
    assert.equal(await page.evaluate(() => window.__searchCalls), 2, '来源不可用时应静默重试一次')
    assert.equal(await page.getByText('没有找到匹配作品').count(), 0, '来源不可用不得显示成“没有找到匹配作品”')
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
