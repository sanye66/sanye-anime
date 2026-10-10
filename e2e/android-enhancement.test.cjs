const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')
const media = path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4')

test('安卓播放器按 PC 档位真实启动增强与补帧并保留原始播放回退', { skip: process.env.SANYE_ANDROID_ENHANCEMENT_CHECK !== '1', timeout: 45000 }, async (context) => {
  try { await readFile(media) } catch { context.skip('本机缺少已授权的测试视频素材'); return }
  const { fulfillLocalMedia } = await import('./local-media-range.mjs')
  const server = createServer(async (request, response) => {
    const file = path.resolve(root, '.' + decodeURI(request.url || '/'))
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    try {
      const target = file === root ? path.join(root, 'index.html') : file
      const bytes = await readFile(target)
      response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.route('https://example.org/enhanced.mp4', (route) => fulfillLocalMedia(route, media))
    await page.addInitScript(() => {
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [{ name: 'SanyeCatalog', methods: ['list', 'listHistory', 'getSettings', 'recordProgress'].map((name) => ({ name, rtype: 'promise' })) }],
        nativePromise: async (_, method) => method === 'getSettings'
          ? { settings: { theme: 'dark', autoPlay: false, playbackRate: 1 } }
          : method === 'list'
            ? { items: [{ id: 1, title: '增强样例', url: 'https://example.org/enhanced.mp4', coverUrl: '', summary: '', favorite: false, updatedAt: Date.now() }] }
            : { items: [] },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const enhancementSupport = await page.evaluate(() => Boolean('requestVideoFrameCallback' in HTMLVideoElement.prototype
      && 'transferControlToOffscreen' in HTMLCanvasElement.prototype))
    if (!enhancementSupport) { context.skip('当前浏览器不具备 PC 实时增强所需的视频帧回调或 OffscreenCanvas'); return }
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await page.getByRole('button', { name: '开始播放' }).click()
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.5)
    // 竖屏只保留放大按钮，画质与帧率入口在放大后使用。
    await page.setViewportSize({ width: 844, height: 390 })
    await page.getByRole('button', { name: '横屏放大' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor()
    const controls = page.locator('.android-player-stage:fullscreen .android-player-controls')
    const menu = page.locator('.android-player-menu')
    await controls.getByRole('button', { name: '画质' }).click()
    await menu.getByRole('button', { name: '均衡' }).click()
    await page.waitForFunction(() => Boolean(document.querySelector('.android-player-stage.sanye-realtime-interpolation-active')
      || document.querySelector('.android-player-stage')?.textContent?.includes('不支持')), null, { timeout: 12000 })
    await controls.getByRole('button', { name: /画质|均衡/ }).click()
    const qualityResult = await menu.textContent()
    assert.ok(qualityResult.includes('实际增强') || qualityResult.includes('不支持'))
    await controls.getByRole('button', { name: '帧率' }).click()
    await menu.getByRole('button', { name: '60 FPS' }).click()
    await page.waitForFunction(() => Boolean(document.querySelector('.android-player-stage.sanye-realtime-interpolation-active')
      || document.querySelector('.android-player-stage')?.textContent?.includes('不支持')), null, { timeout: 12000 })
    await controls.getByRole('button', { name: '60 FPS' }).click()
    await menu.getByText(/实际输出：\d+ FPS/).waitFor({ timeout: 12000 })
    assert.ok(await page.locator('.android-player-stage canvas').count() > 0)
    await menu.getByRole('button', { name: '原始' }).click()
    await controls.getByRole('button', { name: '均衡' }).click()
    await menu.getByRole('button', { name: '关闭' }).click()
    assert.equal(await page.locator('.android-player-stage canvas').count(), 0)
    assert.ok(await page.locator('video').evaluate((element) => element.currentTime) > 0.5)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
