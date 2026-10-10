const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')
const APP_SOURCE = path.resolve(__dirname, '../sanye_client/src/platform/android/androidApp.vue')
const HIT_URL = 'https://www.yhdmtv.cc/p/65395/153'
const MEDIA = 'https://cdn.example.org/episode.mp4'

async function serveApp() {
  const server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURI(request.url || '/'))
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    const file = target === root ? path.join(root, 'index.html') : target
    try {
      const data = await readFile(file)
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html')
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) }
}

/**
 * 隔离桥接：搜索命中一条来源，预览固定给出一集直链（媒体请求一律挂起，由测试自己派发媒体事件）。
 * `history` 用于落位与「秒级覆盖保护」的样例数据。
 */
async function installBridge(page, options = {}) {
  await page.addInitScript(({ hitUrl, media, history, removed }) => {
    window.__calls = []
    window.__progress = []
    window.__previewCalls = []
    const settings = { theme: 'system', autoPlay: false, playbackRate: 1, qualityProfile: 'off', frameTarget: 'off', volume: 1 }
    const names = (methodNames) => methodNames.map((name) => ({ name, rtype: 'promise' }))
    window.Capacitor = {
      getPlatform: () => 'android',
      PluginHeaders: [
        { name: 'SanyeCatalog', methods: names(['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache']) },
        { name: 'SanyeSource', methods: names(['search', 'preview']) },
      ],
      nativePromise: async (_, method, callOptions) => {
        window.__calls.push({ method, options: callOptions })
        if (method === 'search') {
          return { hits: [{ title: '测试作品', sourceUrl: hitUrl, coverUrl: '', summary: '' }] }
        }
        if (method === 'preview') {
          window.__previewCalls.push(callOptions.sourceUrl)
          return {
            title: '测试作品', sourceUrl: callOptions.sourceUrl, coverUrl: '', summary: '',
            episodes: [{ id: 'ep-1', title: '第1集', sourceUrl: callOptions.sourceUrl, playbackUrl: media, mimeType: 'video/mp4', lineId: 'main' }],
          }
        }
        if (method === 'list') return { items: [] }
        if (method === 'listHistory') return { items: history }
        if (method === 'getSettings') return { settings: { ...settings } }
        if (method === 'setSettings') Object.assign(settings, callOptions.settings)
        if (method === 'recordProgress') { window.__progress.push(callOptions); return { item: callOptions } }
        if (method === 'save') return { item: callOptions }
        if (method === 'clearMediaCache') return { removed }
        return { removed: 0 }
      },
    }
  }, { hitUrl: HIT_URL, media: MEDIA, history: options.history ?? [], removed: options.removed ?? 3 })
}

/** 打开播放器：搜索 → 立即观看 → 等到 <video> 出现（不真的起播，媒体请求保持挂起）。 */
async function openPlayer(page, origin) {
  await page.route('https://cdn.example.org/**', () => { /* 媒体请求挂起：避免真实解码带来的不确定性 */ })
  await page.goto(`${origin}/`)
  await page.locator('.android-top-search').click()
  await page.getByLabel('作品关键词').fill('测试作品')
  await page.getByRole('button', { name: '搜索来源' }).click()
  await page.getByText('测试作品', { exact: true }).waitFor()
  await page.locator('.android-search-source-heading ~ ul').getByRole('button', { name: '立即观看' }).first().click()
  await page.locator('.android-player--inline video').waitFor()
  await page.waitForFunction(() => !!document.querySelector('video')?.getAttribute('src'))
}

/** 把 <video> 的时间轴换成可控的假实现：不依赖真实解码就能验证续播、覆盖保护与拖动取消。 */
async function stubTimeline(page, seconds, duration = 1400) {
  await page.evaluate(({ seconds: start, duration: total }) => {
    const element = document.querySelector('video')
    window.__time = start
    Object.defineProperty(element, 'currentTime', {
      configurable: true,
      get: () => window.__time,
      set: (value) => { window.__time = value },
    })
    Object.defineProperty(element, 'duration', { configurable: true, get: () => total })
  }, { seconds, duration })
}

test('放大后错误提示渲染在舞台内，且保留可点的重试入口', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await installBridge(page)
    await openPlayer(page, app.origin)
    await page.setViewportSize({ width: 844, height: 390 })
    await page.getByRole('button', { name: '横屏放大' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor()

    // 已经出过画面的中途错误不再自动换线，而是直接给提示：放大时舞台覆盖整个视口，
    // 舞台外的错误块完全看不见，提示与重试入口都必须渲染在舞台内。
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('loadeddata')))
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('error')))
    const alert = page.locator('.android-player-stage .android-player-alert')
    await alert.waitFor({ timeout: 8000 })
    assert.match(await alert.textContent(), /无法加载/, '放大后必须能看到播放错误')
    assert.equal(await page.locator('.android-player-error').count(), 0, '放大时舞台外的错误块不应重复渲染')

    const before = await page.evaluate(() => window.__previewCalls.length)
    await page.locator('.android-player-stage').getByRole('button', { name: '重试当前线路' }).click()
    await page.waitForFunction((count) => window.__previewCalls.length > count, before, { timeout: 8000 })
  } finally {
    await browser.close()
    await app.close()
  }
})

test('首帧之后的卡顿给出舞台内提示，恢复播放后自动消失', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await installBridge(page)
    await openPlayer(page, app.origin)
    const alert = page.locator('.android-player-alert')

    // 首帧之前不提示（起播等待另有 10s/12s 的既有口径），首帧之后定格必须提示。
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('waiting')))
    assert.equal(await alert.count(), 0, '首帧之前的 waiting 不该占用舞台内提示')
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('loadeddata')))
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('waiting')))
    await alert.waitFor({ timeout: 4000 })
    assert.match(await alert.textContent(), /缓冲/, '首帧之后的卡顿必须给出缓冲提示')

    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('timeupdate')))
    await page.waitForFunction(() => !document.querySelector('.android-player-alert'))
  } finally {
    await browser.close()
    await app.close()
  }
})

test('从后台回到前台给出可点的继续播放入口', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await installBridge(page)
    await openPlayer(page, app.origin)
    await page.evaluate(() => {
      const element = document.querySelector('video')
      window.__plays = 0
      element.play = () => { window.__plays += 1; return Promise.resolve() }
    })

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const alert = page.locator('.android-player-alert')
    await alert.waitFor({ timeout: 4000 })
    assert.match(await alert.textContent(), /后台/, '回到前台必须提示画面已暂停')
    await alert.getByRole('button', { name: '继续播放' }).click()
    assert.equal(await page.evaluate(() => window.__plays), 1, '点「继续播放」才继续播放')
    await page.waitForFunction(() => !document.querySelector('.android-player-alert'))
  } finally {
    await browser.close()
    await app.close()
  }
})

test('拖动进度被系统中断时回到拖动前的位置，提交时才生效', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await installBridge(page)
    await openPlayer(page, app.origin)
    await stubTimeline(page, 42)
    // 时长就绪后进度条才可交互（未就绪时 aria-disabled=true 且 beginSeek 直接返回）。
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('loadedmetadata')))
    const seek = page.getByRole('slider', { name: '播放进度' })
    await page.waitForFunction(() => document.querySelector('[role="slider"][aria-label="播放进度"]')?.getAttribute('aria-disabled') === 'false')
    const box = await seek.boundingBox()
    const y = box.y + box.height / 2

    await page.mouse.move(box.x + box.width * 0.2, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 6 })
    await page.waitForTimeout(250)
    assert.ok(await page.evaluate(() => window.__time) > 42, '拖动期间预览应改到新位置')
    // 来电、系统手势、指针离开：取消拖动后画面必须回到原位，而不是停在被拖到的位置。
    await seek.dispatchEvent('pointercancel')
    await page.waitForTimeout(120)
    assert.equal(await page.evaluate(() => window.__time), 42, '取消拖动必须回到拖动前的位置')

    await page.mouse.move(box.x + box.width * 0.2, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5, y, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(150)
    const committed = await page.evaluate(() => window.__time)
    assert.ok(Math.abs(committed - 700) < 220, `松手后应落在拖动位置附近，实际 ${committed}`)
  } finally {
    await browser.close()
    await app.close()
  }
})

test('音量随设置落盘', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await installBridge(page)
    await openPlayer(page, app.origin)

    await page.getByRole('button', { name: '音量' }).click()
    const volume = page.getByRole('slider', { name: '音量' })
    await volume.waitFor()
    assert.equal(await volume.getAttribute('aria-valuenow'), '100', '默认音量应为 100%')
    // 拖动音量条到 20% 附近（键盘方向键会让控制条收起，这里用真实的指针拖动）。
    const box = await volume.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8, { steps: 5 })
    await page.mouse.up()
    // 以前音量只存在内存里，每次启动都跳回 100%：这里必须落进设置（拖动期间合并写入）。
    await page.waitForFunction(() => window.__calls.some((call) => call.method === 'setSettings' && typeof call.options.settings.volume === 'number' && call.options.settings.volume < 1), null, { timeout: 5000 })
  } finally {
    await browser.close()
    await app.close()
  }
})

test('「我的」可以直接清理媒体缓存', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await installBridge(page, { removed: 7 })
    await page.route('https://cdn.example.org/**', () => {})
    await page.goto(`${app.origin}/`)
    await page.getByRole('button', { name: '我的' }).click()
    await page.getByRole('button', { name: '清理媒体缓存' }).click()
    await page.waitForFunction(() => window.__calls.some((call) => call.method === 'clearMediaCache'), null, { timeout: 5000 })
    await page.getByText(/已清理媒体缓存（7 项）/).waitFor()
  } finally {
    await browser.close()
    await app.close()
  }
})

test('续播跨线路取最靠前进度，且开头几秒的落库不会覆盖已有进度', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    // 同一集的记录挂在另一条线路（lineId: other）：换线/自动回退起播后不能再从 0 重播。
    await installBridge(page, {
      history: [{
        mediaUrl: HIT_URL, title: '测试作品', episodeId: 'ep-1', lineId: 'other', episodeTitle: '第1集',
        positionSeconds: 1000, durationSeconds: 1400, completed: false, updatedAt: 1,
      }],
    })
    await openPlayer(page, app.origin)
    await stubTimeline(page, 0)
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('loadedmetadata')))
    await page.waitForFunction(() => window.__time === 1000, null, { timeout: 4000 })

    // 秒级覆盖保护：回到开头几秒时不得把 1000 秒的记录覆盖掉。
    await page.evaluate(() => { window.__time = 3 })
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('pause')))
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate(() => window.__progress.filter((entry) => entry.positionSeconds < 100).length), 0, '开头几秒不得覆盖更靠前的进度')

    // 正常快进之后照旧落库。
    await page.evaluate(() => { window.__time = 960 })
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('pause')))
    await page.waitForFunction(() => window.__progress.some((entry) => Math.round(entry.positionSeconds) === 960), null, { timeout: 4000 })
  } finally {
    await browser.close()
    await app.close()
  }
})

test('随包线路重试不再用 bundled: 标识请求来源页，HLS 也带上移动端参数', async () => {
  const source = await readFile(APP_SOURCE, 'utf8')
  const start = source.indexOf('async function retryCurrentLine')
  assert.ok(start > 0, '找不到 retryCurrentLine')
  const body = source.slice(start, start + 1400)
  assert.match(body, /if \(!episode\.sourceUrl\)/, '随包线路（没有来源页地址）必须单独分流')
  assert.match(body, /playSourceEpisode\(\{ \.\.\.episode \}\)/, '随包线路重试应直接用原直链重建会话')
  assert.doesNotMatch(body, /episode\.sourceUrl \|\| episode\.id/, '不得再拿 bundled: 标识当来源页地址')

  const hlsStart = source.indexOf('new HlsRuntime(')
  assert.ok(hlsStart > 0, '找不到 HlsRuntime 配置')
  const hlsConfig = source.slice(hlsStart, hlsStart + 900)
  assert.match(hlsConfig, /capLevelToPlayerSize: true/, '清晰度不能超过舞台实际像素')
  assert.match(hlsConfig, /maxBufferSize: 40 \* 1000 \* 1000/, '移动端缓冲上限必须收敛')
})
