const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')

/**
 * 带集数的选集必须从第一集开始按集数升序排列，且不同线路的同一集要能直接区分。
 *
 * 真实来源页的播放条目末段是来源自己的条目 id，不是集数（实测同一部作品 12 集的
 * id 为 4652475、4652476、…、55100），此前按它排序会把第 12 集排到第 1 集前面。
 */
test('带集数的选集从第一集开始排序，不同线路可直接区分', async () => {
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
    // 播放地址保持挂起：本轮只验证选集顺序与标签，不引入真实媒体状态。
    await page.route('https://cdn.example.org/**', () => {})
    await page.addInitScript(() => {
      const settings = { theme: 'system', autoPlay: false, playbackRate: 1 }
      const sourcePage = 'https://www.yhdmtv.cc/v/210580/153'
      // 与来源实测一致：三条线路（页签「加速云」「免费云」「火箭云」）的选集地址共用同一个
      // URL 线路段 `/p/210580/153/<条目id>`，只有线路名与条目 id 不同；12 集的条目 id 也不单调。
      const lines = [
        { name: '加速云', ids: [4652475, 4652476, 4652477, 4652467, 4652470, 4652473, 4652472, 4652468, 4652469, 4652471, 4652474, 55100] },
        { name: '免费云', ids: [55104, 55110, 55200, 55300, 55400] },
        { name: '火箭云', ids: [7525622, 7525623, 7525624, 7525625] },
      ]
      const episodes = lines.flatMap((line) => line.ids.map((id, index) => ({
        id: `https://www.yhdmtv.cc/p/210580/153/${id}`,
        title: `第${String(index + 1).padStart(2, '0')}集`,
        sourceUrl: `https://www.yhdmtv.cc/p/210580/153/${id}`,
        playbackUrl: `https://cdn.example.org/${line.name}-${index + 1}.m3u8`,
        mimeType: 'application/vnd.apple.mpegurl',
        lineId: line.name,
      })))
      // 来源页的两个选择器可能重复命中同一条线路的同一地址。
      episodes.push({ ...episodes[0] }, { ...episodes[1] })
      const names = (methodNames) => methodNames.map((name) => ({ name, rtype: 'promise' }))
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [
          { name: 'SanyeCatalog', methods: names(['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache']) },
          { name: 'SanyeSource', methods: names(['search', 'preview']) },
        ],
        nativePromise: async (_, method, options) => {
          if (method === 'search') return { hits: [{ title: '无职转生', sourceUrl: sourcePage, coverUrl: '', summary: '' }] }
          if (method === 'preview') return { title: '无职转生', sourceUrl: options.sourceUrl, coverUrl: '', summary: '', episodes }
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
    await page.getByRole('button', { name: '立即观看' }).first().click()
    await page.getByRole('heading', { name: '选集', exact: true }).waitFor()

    const groups = page.locator('.android-detail .android-episode-group')
    assert.equal(await groups.count(), 1, '只展开当前线路，不把三条线路集数铺成长页面')
    const firstLine = await groups.nth(0).locator('button').allTextContents()
    // 每条线路各自从第 1 集开始，按集数升序（来源页的 55100 / 4652467 这类条目 id 不参与排序）。
    assert.deepEqual(firstLine, Array.from({ length: 12 }, (_, index) => `第${index + 1}集`))
    await page.getByRole('group', { name: '选择播放线路' }).getByRole('button', { name: '免费云', exact: true }).click()
    assert.deepEqual((await groups.first().locator('button').allTextContents()).slice(0, 2), ['第1集', '第2集'])
    // 线路名来自来源页签（面板名），不再退化成来源内部编号「线路 153」，也不把线路名拼到集数上。
    assert.deepEqual(await page.getByRole('group', { name: '选择播放线路' }).locator('button').allTextContents(), ['加速云', '免费云', '火箭云'])

    // 播放器浮层用的是同一份顺序：放大后打开「选集」同样从第一集开始。
    await page.setViewportSize({ width: 844, height: 390 })
    await page.getByRole('button', { name: '横屏放大' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor()
    await page.locator('.android-player-stage:fullscreen').getByRole('button', { name: '选集' }).click()
    const menuGroups = page.locator('.android-player-menu .android-player-menu-group')
    assert.deepEqual(await menuGroups.locator('h4').allTextContents(), ['加速云', '免费云', '火箭云'], '浮层里也要标明每条线路')
    const menuButtons = menuGroups.nth(0).locator('button')
    assert.deepEqual((await menuButtons.allTextContents()).slice(0, 3), ['第1集', '第2集', '第3集'])
    await page.locator('.android-player-stage:fullscreen').getByRole('button', { name: '退出横屏' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor({ state: 'hidden' })
    await page.locator('.android-player video').evaluate(video => {
      video.dispatchEvent(new Event('loadeddata'))
      video.dispatchEvent(new Event('error'))
    })
    await page.locator('.android-player-error').waitFor()
    assert.equal(await page.locator('.android-player-error').evaluate(element => element.previousElementSibling?.classList.contains('android-player-stage')), true, '播放失败提示应紧跟播放器')
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
