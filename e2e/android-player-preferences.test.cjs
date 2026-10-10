const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')
const mediaHost = 'https://cdn.example.org'

/**
 * 覆盖 VQ-47/VQ-48：画质与帧率档位随设置恢复并落盘，播放前先和媒体主机建链。
 *
 * 媒体请求保持挂起，因此不需要真实解码就能核对播放准备阶段的行为；
 * GPU 运动估计的后端切换发生在渲染 Worker 内，不作为本用例的断言对象。
 */
test('画质与帧率随设置恢复并写回，起播前预连接媒体主机', { timeout: 60000 }, async () => {
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
    // 媒体分片保持挂起：用例只核对起播前的准备与设置落盘，不依赖解码结果。
    await page.route(`${mediaHost}/**`, () => {})
    await page.addInitScript(() => {
      const settings = { theme: 'system', autoPlay: false, playbackRate: 1, qualityProfile: 'balanced', frameTarget: '60' }
      window.__settingsWrites = []
      const methodNames = ['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache']
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [
          { name: 'SanyeCatalog', methods: methodNames.map((name) => ({ name, rtype: 'promise' })) },
          { name: 'SanyeSource', methods: ['search', 'preview'].map((name) => ({ name, rtype: 'promise' })) },
        ],
        nativePromise: async (_, method, options) => {
          if (method === 'getSettings') return { settings: { ...settings } }
          if (method === 'setSettings') {
            window.__settingsWrites.push({ ...options.settings })
            Object.assign(settings, options.settings)
            return { settings: { ...settings } }
          }
          if (method === 'list' || method === 'listHistory') return { items: [] }
          if (method === 'recordProgress') return { item: options }
          if (method === 'search') return { hits: [{ title: '样例作品', sourceUrl: 'https://www.yhdmtv.cc/p/900', coverUrl: '', summary: '' }] }
          if (method === 'preview') return {
            title: '样例作品', sourceUrl: options.sourceUrl, coverUrl: '', summary: '',
            episodes: [{ id: options.sourceUrl, title: '第1集', sourceUrl: options.sourceUrl,
              playbackUrl: 'https://cdn.example.org/sample.m3u8', mimeType: 'application/vnd.apple.mpegurl', lineId: 'main' }],
          }
          return { removed: 0 }
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.locator('.android-home .android-hero').waitFor()
    await page.locator('.android-top-search').click()
    await page.getByLabel('作品关键词').fill('样例作品')
    await page.getByRole('button', { name: '搜索来源' }).click()
    await page.getByRole('button', { name: '立即观看' }).first().click()
    await page.locator('.android-player--inline video').waitFor()

    // 起播前先和媒体主机建链：首片请求省掉 DNS/TLS 等待。
    const warmed = await page.evaluate(() => [...document.head.querySelectorAll('link[data-rel="sanye-media-source"]')]
      .map((link) => `${link.getAttribute('rel')} ${link.getAttribute('href')}`))
    assert.ok(warmed.includes('preconnect https://cdn.example.org'), `未预连接媒体主机：${warmed.join('|')}`)
    assert.ok(warmed.includes('dns-prefetch https://cdn.example.org'), `未预解析媒体主机：${warmed.join('|')}`)

    // 竖屏只保留播放、进度与放大按钮：档位按钮在放大（横屏）后使用。
    await page.getByRole('button', { name: '横屏放大' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor()
    const controls = page.locator('.android-player-stage:fullscreen .android-player-controls')
    // 恢复的档位直接显示在控制条上：进入播放器不需要重新选择。
    const toolLabels = await controls.locator('.android-player-tool').allTextContents()
    const qualityTrigger = controls.getByRole('button', { name: '均衡', exact: true })
    assert.equal(await qualityTrigger.count(), 1, `未按设置恢复画质档：${toolLabels.join('|')}`)
    assert.equal(await controls.getByRole('button', { name: '60 FPS', exact: true }).count(), 1, `未按设置恢复帧率档：${toolLabels.join('|')}`)

    await qualityTrigger.click()
    const qualityMenu = page.locator('.android-player-menu')
    await qualityMenu.waitFor()
    assert.equal(await qualityMenu.getByRole('button', { name: '均衡', exact: true }).getAttribute('aria-pressed'), 'true')
    await qualityMenu.getByRole('button', { name: '性能', exact: true }).click()
    await page.waitForFunction(() => (window.__settingsWrites || []).some((entry) => entry.qualityProfile === 'fast'))

    await controls.getByRole('button', { name: '60 FPS', exact: true }).click()
    const fpsMenu = page.locator('.android-player-menu')
    await fpsMenu.waitFor()
    // 浮层里的档位文案是纯档位名（用户要求列表收到「帧率」两个字宽，去掉 FPS 后缀）。
    assert.equal(await fpsMenu.getByRole('button', { name: '60', exact: true }).getAttribute('aria-pressed'), 'true')
    await fpsMenu.getByRole('button', { name: '自动', exact: true }).click()
    await page.waitForFunction(() => (window.__settingsWrites || []).some((entry) => entry.frameTarget === 'auto'))

    const writes = await page.evaluate(() => window.__settingsWrites)
    assert.ok(writes.some((entry) => entry.qualityProfile === 'fast'), `画质档没有落盘：${JSON.stringify(writes)}`)
    assert.ok(writes.some((entry) => entry.frameTarget === 'auto'), `帧率档没有落盘：${JSON.stringify(writes)}`)
    // 只写改动的那一项，避免一次点击覆盖另一项偏好。
    assert.equal(writes.filter((entry) => entry.qualityProfile).length, 1, JSON.stringify(writes))
    assert.equal(writes.filter((entry) => entry.frameTarget).length, 1, JSON.stringify(writes))
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
