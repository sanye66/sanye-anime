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
  await page.addInitScript(({ hitUrl, hitTitle, previewTitle, media, history, removed, episodes }) => {
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
          return { hits: [{ title: hitTitle, sourceUrl: hitUrl, coverUrl: '', summary: '' }] }
        }
        if (method === 'preview') {
          window.__previewCalls.push(callOptions.sourceUrl)
          return {
            title: previewTitle, sourceUrl: callOptions.sourceUrl, coverUrl: '', summary: '',
            episodes: episodes ?? [{ id: 'ep-1', title: '第1集', sourceUrl: callOptions.sourceUrl, playbackUrl: media, mimeType: 'video/mp4', lineId: 'main' }],
          }
        }
        if (method === 'list') return { items: [] }
        if (method === 'listHistory') {
          if (window.__holdHistory) return new Promise((resolve) => { window.__resolveHistory = resolve })
          return { items: history }
        }
        if (method === 'getSettings') return { settings: { ...settings } }
        if (method === 'setSettings') Object.assign(settings, callOptions.settings)
        if (method === 'recordProgress') { window.__progress.push(callOptions); return { item: callOptions } }
        if (method === 'save') return { item: callOptions }
        if (method === 'clearMediaCache') return { removed }
        return { removed: 0 }
      },
    }
  }, { hitUrl: options.hitUrl ?? HIT_URL, hitTitle: options.hitTitle ?? '测试作品', previewTitle: options.previewTitle ?? options.hitTitle ?? '测试作品', media: MEDIA, history: options.history ?? [], removed: options.removed ?? 3, episodes: options.episodes })
}

test('来源标题守住作品身份，同时允许标点差异和缺标题降级', async (t) => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    for (const scenario of [
      { name: 'OAD 不接受第三季来源', hitTitle: '无职转生 OAD', previewTitle: '无职转生第三季', reject: true },
      { name: '同作品标点和空白差异仍可播放', hitTitle: '测试 OAD：特别篇。', previewTitle: '测试OAD·特别篇', reject: false },
      { name: '缺标题仍使用搜索种子', hitTitle: '测试作品 OAD', previewTitle: '', reject: false },
    ]) {
      await t.test(scenario.name, async () => {
        const page = await browser.newPage({ viewport: { width: 320, height: 844 }, colorScheme: 'dark' })
        try {
          await installBridge(page, scenario)
          await page.route('https://cdn.example.org/**', () => {})
          await page.goto(app.origin)
          await page.locator('.android-top-search').click()
          await page.getByLabel('作品关键词').fill(scenario.hitTitle)
          await page.getByRole('button', { name: '搜索来源' }).click()
          await page.getByText(scenario.hitTitle, { exact: true }).waitFor()
          await page.getByRole('button', { name: '立即观看', exact: true }).click()
          if (scenario.reject) {
            await page.getByText('来源中的作品不对，请选择其他来源。').waitFor()
            assert.equal(await page.locator('video').count(), 0, '跨作品来源不得进入播放器')
            assert.equal(await page.locator('.android-episode-grid button').count(), 0, '跨作品选集不得留在详情')
          } else {
            await page.waitForFunction((url) => document.querySelector('video')?.getAttribute('src') === url, MEDIA)
            assert.equal(await page.locator('.android-detail-copy h2').textContent(), scenario.previewTitle || scenario.hitTitle)
          }
        } finally { await page.close() }
      })
    }
  } finally { await browser.close(); await app.close() }
})

/** 打开播放器：搜索 → 立即观看 → 等到 <video> 出现（不真的起播，媒体请求保持挂起）。 */
async function openPlayer(page, origin) {
  await page.route('https://cdn.example.org/**', () => { /* 媒体请求挂起：避免真实解码带来的不确定性 */ })
  await page.goto(`${origin}/`)
  await page.locator('.android-top-search').click()
  await page.getByLabel('作品关键词').fill('测试作品')
  await page.getByRole('button', { name: '搜索来源' }).click()
  await page.getByText('测试作品', { exact: true }).waitFor()
  await page.locator('.android-source-results').getByRole('button', { name: '立即观看' }).first().click()
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
    await page.evaluate(() => {
      const startTimer = window.setTimeout.bind(window)
      const stopTimer = window.clearTimeout.bind(window)
      window.__stallTimerCanceled = false
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 12_000) { window.__stallTimer = callback; return 987654321 }
        return startTimer(callback, delay, ...args)
      }
      window.clearTimeout = (id) => {
        if (id === 987654321) { window.__stallTimerCanceled = true; return }
        stopTimer(id)
      }
    })

    // 首帧之前不提示（起播等待另有 10s/12s 的既有口径），首帧之后定格必须提示。
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('waiting')))
    assert.equal(await alert.count(), 0, '首帧之前的 waiting 不该占用舞台内提示')
    await page.locator('video').evaluate((element) => {
      Object.defineProperty(element, 'paused', { configurable: true, get: () => false })
      element.requestVideoFrameCallback = (callback) => { window.__firstFrameCallback = callback }
      element.dispatchEvent(new Event('playing'))
      element.dispatchEvent(new Event('waiting'))
    })
    assert.equal(await alert.count(), 0, 'playing 早于首帧时仍应保留起播等待，不能误判为播放后卡顿')
    assert.equal(await page.evaluate(() => window.__stallTimer), undefined)
    await page.locator('video').evaluate((element) => {
      Object.defineProperty(element, 'seeking', { configurable: true, get: () => window.__seeking })
      window.__seeking = true
      element.dispatchEvent(new Event('loadeddata'))
      window.__seeking = false
      window.__firstFrameCallback()
      element.dispatchEvent(new Event('waiting'))
    })
    await alert.waitFor({ timeout: 4000 })
    assert.match(await alert.textContent(), /缓冲/, '定位时忽略的 loadeddata 应由首帧回调补上')
    await page.locator('video').evaluate((element) => { window.__time = 1; element.dispatchEvent(new Event('timeupdate')) })
    await page.locator('video').evaluate((element) => {
      window.__time = 10
      window.__paused = false
      Object.defineProperty(element, 'currentTime', { configurable: true, get: () => window.__time })
      Object.defineProperty(element, 'paused', { configurable: true, get: () => window.__paused })
      element.dispatchEvent(new Event('loadeddata'))
      window.__paused = true
      element.dispatchEvent(new Event('waiting'))
    })
    assert.equal(await alert.count(), 0, '暂停时的 waiting 不该触发缓冲提示或换线')
    assert.equal(await page.evaluate(() => window.__stallTimer), undefined)
    await page.evaluate(() => { window.__stallTimerCanceled = false })
    await page.locator('video').evaluate((element) => { window.__paused = false; element.dispatchEvent(new Event('waiting')) })
    await alert.waitFor({ timeout: 4000 })
    assert.match(await alert.textContent(), /缓冲/, '首帧之后的卡顿必须给出缓冲提示')
    assert.equal(await page.evaluate(() => typeof window.__stallTimer), 'function')

    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('timeupdate')))
    assert.match(await alert.textContent(), /缓冲/, '时间未前进不能清掉卡顿提示')
    assert.equal(await page.evaluate(() => window.__stallTimerCanceled), false)
    await page.locator('video').evaluate((element) => { window.__time = 10.2; element.dispatchEvent(new Event('timeupdate')) })
    await page.waitForFunction(() => !document.querySelector('.android-player-alert'))
    assert.equal(await page.evaluate(() => window.__stallTimerCanceled), true)
  } finally {
    await browser.close()
    await app.close()
  }
})

test('首帧后没有 waiting 事件也会识别播放时间停滞', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await installBridge(page)
    await openPlayer(page, app.origin)
    await page.evaluate(() => {
      window.__timers = []
      const original = window.setTimeout.bind(window)
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 12_000) { window.__timers.push(callback); return 987654321 }
        return original(callback, delay, ...args)
      }
      const video = document.querySelector('video')
      Object.defineProperty(video, 'paused', { configurable: true, get: () => false })
      Object.defineProperty(video, 'currentTime', { configurable: true, get: () => window.__time ?? 0 })
      video.dispatchEvent(new Event('loadeddata'))
    })
    assert.equal(await page.evaluate(() => window.__timers.length), 1)
    await page.locator('video').evaluate(video => { window.__time = 1; video.dispatchEvent(new Event('timeupdate')) })
    assert.equal(await page.evaluate(() => window.__timers.length), 2)
    await page.locator('video').evaluate(video => { window.__time = 1; video.dispatchEvent(new Event('timeupdate')) })
    assert.equal(await page.evaluate(() => window.__timers.length), 2, '时间不前进时不能反复延长故障计时')
    await page.evaluate(() => window.__timers.at(-1)())
    await page.getByText('播放等待时间过长，请换条线路或重试。').waitFor()
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

    await page.getByRole('button', { name: '横屏放大' }).click()
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
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByRole('group', { name: '我的功能' }).getByRole('button', { name: '缓存', exact: true }).click()
    await page.getByRole('button', { name: '清理媒体缓存' }).click()
    await page.waitForFunction(() => window.__calls.some((call) => call.method === 'clearMediaCache'), null, { timeout: 5000 })
    await page.getByText('媒体缓存已清理。').waitFor()
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
  assert.match(hlsConfig, /hlsPlaybackConfig\(true\)/, '移动端使用共享缓冲与清晰度策略；数值由策略行为测试覆盖')
})

test('同集换线保留实时进度，跨集切换拒绝旧续播回调与失败兜底', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const episode = (id, title, lineId) => ({ id, title, lineId, sourceUrl: `${HIT_URL}/${id}`, playbackUrl: `https://cdn.example.org/${id}.mp4`, mimeType: 'video/mp4' })
    await installBridge(page, { hitUrl: 'https://www.yhdmtv.cc/p/999999/153', episodes: [episode('ep-1', '第1集', 'main'), episode('ep-1-other', '第1集', 'other'), episode('ep-2', '第2集', 'main')] })
    await openPlayer(page, app.origin)
    await stubTimeline(page, 42)
    await page.evaluate(() => { window.__holdHistory = true; document.querySelector('video').dispatchEvent(new Event('loadedmetadata')) })
    await page.waitForFunction(() => Boolean(window.__resolveHistory))
    await page.evaluate(() => { window.__oldResolveHistory = window.__resolveHistory })
    if (await page.getByRole('button', { name: '横屏放大' }).count()) await page.getByRole('button', { name: '横屏放大' }).click()
    await page.getByRole('button', { name: '选集', exact: true }).click()
    await page.locator('.android-player-menu').getByRole('button', { name: '播放第1集' }).last().click()
    await page.waitForFunction(() => document.querySelector('video').getAttribute('src')?.includes('ep-1-other'))
    await page.evaluate(() => { window.__time = 0; document.querySelector('video').dispatchEvent(new Event('loadedmetadata')) })
    assert.equal(await page.evaluate(() => window.__time), 42, '同集换线不能等落库或从头开始')
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('loadeddata')))
    await page.getByRole('button', { name: '选集', exact: true }).click()
    await page.locator('.android-player-menu').getByRole('button', { name: '播放第2集' }).click()
    await page.waitForFunction(() => document.querySelector('video').getAttribute('src')?.includes('ep-2'))
    await page.evaluate(() => {
      window.__time = 0
      window.__holdHistory = false
      window.__oldResolveHistory({ items: [{ mediaUrl: 'https://www.yhdmtv.cc/p/999999/153', episodeId: 'ep-1', lineId: 'main', positionSeconds: 800, completed: false }] })
    })
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(() => window.__time), 0, '同一个 video 元素换集后旧异步读取不能定位新集')
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('error')))
    await page.waitForTimeout(100)
    assert.match(await page.locator('video').getAttribute('src'), /ep-2/, '第二集没有备用线路时不得回退第一集')
  } finally { await browser.close(); await app.close() }
})

test('定位在途时不重复预览，松手等待落位后收敛到最后目标', async () => {
  const app = await serveApp()
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await installBridge(page)
    await openPlayer(page, app.origin)
    await stubTimeline(page, 0, 100)
    await page.evaluate(() => {
      const element = document.querySelector('video')
      window.__seeking = false
      window.__seeks = []
      Object.defineProperty(element, 'seeking', { configurable: true, get: () => window.__seeking })
      Object.defineProperty(element, 'buffered', { configurable: true, value: { length: 1, start: () => 0, end: () => 100 } })
      Object.defineProperty(element, 'currentTime', { configurable: true, get: () => window.__time, set: (value) => { window.__time = value; window.__seeking = true; window.__seeks.push(value) } })
      element.dispatchEvent(new Event('loadedmetadata'))
    })
    const bar = page.getByRole('slider', { name: '播放进度' })
    const box = await bar.boundingBox()
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width * 0.2, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.8, y, { steps: 10 })
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.__seeks.length), 1, '在途时不得重复设置 currentTime')
    await page.evaluate(() => { window.__seeking = false; document.querySelector('video').dispatchEvent(new Event('seeked')) })
    const state = await page.evaluate(() => ({ seeks: window.__seeks, time: window.__time }))
    assert.equal(state.seeks.length, 2)
    assert.ok(Math.abs(state.time - 80) < 2, `松手应收敛到 80 秒，实际 ${state.time}`)
    await page.evaluate(() => { window.__seeking = false; document.querySelector('video').dispatchEvent(new Event('seeked')) })
    assert.equal(await bar.getAttribute('aria-valuenow'), '80')
  } finally { await browser.close(); await app.close() }
})

test('HLS 从同作品同集历史位置直接加载，避免先取开头再取消分片', async()=>{
 const app=await serveApp(),browser=await chromium.launch();try{const page=await browser.newPage({viewport:{width:390,height:844}});const hitUrl='https://www.yhdmtv.cc/p/999991/153';await installBridge(page,{hitUrl,history:[{mediaUrl:hitUrl,title:'测试番剧',episodeId:'ep-1',episodeTitle:'第1集',lineId:'main',positionSeconds:30,durationSeconds:100,completed:false,updatedAt:Date.now()}],episodes:[{id:'ep-1',title:'第1集',sourceUrl:hitUrl,playbackUrl:'https://cdn.example.org/a.m3u8',mimeType:'application/x-mpegURL',lineId:'main'}]});await page.route('**/assets/hls-*.js',route=>route.fulfill({contentType:'text/javascript',body:`export default class Hls { static DefaultConfig={loader:class {}}; static Events={ERROR:'error',MANIFEST_PARSED:'manifest',LEVEL_SWITCHED:'level'};static ErrorTypes={MEDIA_ERROR:'media'};static isSupported(){return true};constructor(config){window.__hlsStart=config.startPosition;this.levels=[]};on(){};loadSource(url){window.__hlsSource=url};attachMedia(video){video.src='https://cdn.example.org/mock.mp4'};destroy(){} }`}));await openPlayer(page,app.origin);assert.equal(await page.evaluate(()=>window.__hlsStart),30);assert.equal(await page.evaluate(()=>window.__hlsSource),'https://cdn.example.org/a.m3u8') }finally{await browser.close();await app.close()}
})
