const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')
/** 随包已有线路的公开 CDN 主机（来自 PC 随包目录的 HLS 线路）。 */
const BUNDLED_MEDIA = /(?:ddbbffcdn|rrcdnbf6|bfllvip|lzcdn24|lzcdn31|lz-cdn16)\.com/
/** 搜索《你的名字》时命中的来源页；实时探测显示它的线路在 v8.qrssv.com（已失效）。 */
const SOURCE_PAGE = 'https://www.yhdmtv.cc/v/7880/155'
const DEAD_LINE = 'https://v8.qrssv.com/202402/17/Y8tNx6L5UV1/video/index.m3u8'
/** 同一部作品的另一种详情形态：编号与随包主来源 `/p/65395/153/0` 相同。 */
const PRIMARY_FORM_PAGE = 'https://www.yhdmtv.cc/v/65395/153'

async function serveApp() {
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
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) }
}

/** 隔离桥接：搜索命中《你的名字》；`mode` 决定来源预览的行为。 */
async function installBridge(page, mode, hitTitle = '你的名字。', hitUrl = SOURCE_PAGE) {
  await page.addInitScript(({ previewMode, title, url }) => {
    const settings = { theme: 'system', autoPlay: false, playbackRate: 1 }
    window.__previewCalls = []
    const names = (methodNames) => methodNames.map((name) => ({ name, rtype: 'promise' }))
    window.Capacitor = {
      getPlatform: () => 'android',
      PluginHeaders: [
        { name: 'SanyeCatalog', methods: names(['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache']) },
        { name: 'SanyeSource', methods: names(['search', 'preview']) },
      ],
      nativePromise: async (_, method, options) => {
        if (method === 'search') {
          return { hits: [{ title, sourceUrl: url, coverUrl: '', summary: '' }] }
        }
        if (method === 'preview') {
          window.__previewCalls.push(options.sourceUrl)
          if (previewMode === 'hang') return new Promise(() => {})
          return {
            title: '你的名字', sourceUrl: options.sourceUrl, coverUrl: '', summary: '',
            episodes: [
              // 与真实页面一致：外站线路指向已失效的 v8.qrssv.com。
              { id: 'v8', title: 'HD国语', sourceUrl: options.sourceUrl, playbackUrl: 'https://v8.qrssv.com/202402/17/Y8tNx6L5UV1/video/index.m3u8', mimeType: 'application/vnd.apple.mpegurl', lineId: '1' },
              { id: 'https://www.yhdmtv.cc/p/7880/155/1', title: '第01集', sourceUrl: 'https://www.yhdmtv.cc/p/7880/155/1', playbackUrl: '', mimeType: '', lineId: 'main' },
            ],
          }
        }
        if (method === 'list' || method === 'listHistory') return { items: [] }
        if (method === 'getSettings') return { settings: { ...settings } }
        if (method === 'recordProgress' || method === 'save') return { item: options }
        return { removed: 0 }
      },
    }
  }, { previewMode: mode, title: hitTitle, url: hitUrl })
}

async function watchFirstHit(page, origin, hitTitle = '你的名字。') {
  await page.goto(`${origin}/`)
  await page.locator('.android-top-search').click()
  await page.getByLabel('作品关键词').fill('你的名字')
  await page.getByRole('button', { name: '搜索来源' }).click()
  await page.getByText(hitTitle, { exact: true }).waitFor()
  return page.getByRole('button', { name: '立即观看' }).first()
}

/**
 * 速度优先：搜索命中随包同名作品时，外站线路不可用必须静默回退已有线路。
 * 第一种最坏情况：来源预览一直不返回（超预算直接接管）。
 */
test('外站来源过慢时静默回退随包已有线路并直接起播', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    const bundledRequests = []
    await page.route(BUNDLED_MEDIA, (route) => { bundledRequests.push(route.request().url()) })
    await installBridge(page, 'hang')
    const watch = await watchFirstHit(page, app.origin)
    const takeoverRequest = page.waitForRequest((request) => BUNDLED_MEDIA.test(request.url()), { timeout: 15_000 })
    const startedAt = Date.now()
    await watch.click()
    await takeoverRequest
    const elapsed = Date.now() - startedAt
    // 外站预览预算 8 秒（PC 同口径）：超过才回退已有线路，不把只是慢的线路判死。
    assert.ok(elapsed <= 10_000, `外站过慢时应在起播预算内回退已有线路，实际 ${elapsed}ms`)
    assert.equal(await page.locator('.android-player--inline video').count(), 1)
    assert.equal(await page.locator('.android-player-error').count(), 0, '回退已有线路不得显示失败提示')
    assert.equal(await page.locator('.android-player-notice').count(), 0, '回退已有线路不得显示换线提示')
    // 《你的名字》是单片：两条线路各只有一个条目，按线路并成一行「线路」，
    // 不能把线路写成「第 1 集／第 2 集」（用户看到的正是这个错误描述）。
    assert.deepEqual(await page.locator('.android-detail .android-episode-group h4').allTextContents(), ['线路'])
    assert.equal(await page.locator('.android-detail .android-episode-group button').allTextContents().then((items) => items.join('|')), '线路 1|中字')
    assert.equal(await page.getByRole('button', { name: '切换备用来源' }).count(), 1)

    // 再次点击「立即观看」仍然直接回退已有线路：外站不可用不会把用户挡在错误上。
    // 竖屏播放器不再有画面上的 ✕，从观看页回到搜索结果走页面返回按钮。
    await page.getByRole('button', { name: '返回搜索结果' }).click()
    const retryRequest = page.waitForRequest((request) => BUNDLED_MEDIA.test(request.url()), { timeout: 10_000 })
    await page.getByRole('button', { name: '立即观看' }).first().click()
    await retryRequest
    assert.equal(await page.locator('.android-player-error').count(), 0, '再次回退已有线路同样不得显示失败提示')
    assert.ok(bundledRequests.length >= 2, `已有线路应被播放器加载：${bundledRequests.join('|')}`)
  } finally {
    await browser.close()
    await app.close()
  }
})

/**
 * 第二种情况：来源预览正常返回，但外站线路本身不可用（v8.qrssv.com 已失效）。
 * 标题还带后缀（真实搜索常出现「你的名字。剧场版」这类写法），因此这里只用来源页编号
 * （`/v/65395/153` 与随包主来源 `/p/65395/153/0` 同作品）来确认能认出《你的名字》。
 * 必须在首帧预算内静默换到已有线路，不能在同一个失效来源上逐条重试到超时。
 */
test('外站线路加载失败时静默回退随包已有线路', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    const deadLineRequests = []
    await page.route('https://v8.qrssv.com/**', (route) => { deadLineRequests.push(route.request().url()); return route.abort() })
    await page.route(BUNDLED_MEDIA, () => {})
    await installBridge(page, 'dead-line', '你的名字。剧场版', PRIMARY_FORM_PAGE)
    const watch = await watchFirstHit(page, app.origin, '你的名字。剧场版')
    const takeoverRequest = page.waitForRequest((request) => BUNDLED_MEDIA.test(request.url()), { timeout: 15_000 })
    const startedAt = Date.now()
    await watch.click()
    await takeoverRequest
    const elapsed = Date.now() - startedAt
    assert.ok(deadLineRequests.length > 0, '应先尝试来源页给出的外站线路')
    assert.ok(elapsed <= 9_000, `外站线路失效时应在首帧预算内回退已有线路，实际 ${elapsed}ms`)
    assert.equal(await page.locator('.android-player-error').count(), 0, '换到已有线路不得显示失败提示')
    assert.equal(await page.locator('.android-player-notice').count(), 0, '换到已有线路不得显示换线提示')
    // 换线后详情页展示随包已有线路，而不是停在失效的来源选集上。
    // 《你的名字》是单片：两条线路各只有一个条目，按线路并成一行「线路」，
    // 不能把线路写成「第 1 集／第 2 集」（用户看到的正是这个错误描述）。
    assert.deepEqual(await page.locator('.android-detail .android-episode-group h4').allTextContents(), ['线路'])
    assert.equal(await page.locator('.android-detail .android-episode-group button').allTextContents().then((items) => items.join('|')), '线路 1|中字')
  } finally {
    await browser.close()
    await app.close()
  }
})
