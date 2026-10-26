const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { createServer } = require('node:http')
const { chromium } = require('playwright')
const clientRequire = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))
const ts = clientRequire('typescript')
const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/nativePlayback.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function bridgeTest(bridge, recordExperience = () => {}) {
  const exports = {}
  vm.runInNewContext(code, { exports, setTimeout, clearTimeout, Date, Error, require: () => ({ recordExperience, recordNativePerformance: () => {}, Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true }, registerPlugin: () => bridge }) })
  return exports
}
test('原生诊断仅导出允许字段，过滤控制字符及无效版本数字', async () => {
  const api = bridgeTest({ capabilities: async () => ({ supported: true, pictureInPicture: true, appVersion: '5.5\u0000', appBuild: 46, androidSdk: -1,
    model: 'a'.repeat(200), manufacturer: 'device', engine: 'media3', privateUrl: 'https://private.example/token' }) })
  const report = await api.nativePlaybackDiagnostics()
  assert.equal(report.appVersion, '5.5'); assert.equal(report.appBuild, 46); assert.equal(report.androidSdk, undefined)
  assert.equal(report.model.length, 120); assert.equal(report.pictureInPicture, true)
  assert.equal(JSON.stringify(report).includes('private'), false)
})
test('首帧及最终诊断只记录一次，过期会话不进入诊断', async () => {
  let event
  const records = []
  const api = bridgeTest({ capabilities: async () => ({ supported: true }), addListener: async (_, callback) => { event = callback; return { remove: async () => {} } },
    open: async () => ({ accepted: true }), close: async () => {} }, (...args) => records.push(args))
  const session = await api.openNativePlayback({ sessionId: 'diagnostic', url: 'https://cdn.example.org/video?secret=1', rate: 1, positionSeconds: 0 }, () => {})
  const state = { id: 'diagnostic', position: 12, duration: 100, firstFrame: true, firstFrameMs: 300, watchedSeconds: 12, stallSeconds: 1 }
  event({ ...state, id: 'old' }); event(state); event(state)
  event({ ...state, reason: 'error', errorCode: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' })
  event({ ...state, closed: true })
  await session.result
  assert.deepEqual(records.map(record => record[0]), ['firstFrame', 'stall', 'playback'])
  assert.equal(records[2][1], 'failed'); assert.equal(records[2][5].engine, 'media3')
  assert.equal(records[2][5].code, 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED')
})
test('原生播放传递当前线路防盗链字段，不携带上次会话请求头', async () => {
  const calls = []
  const api = bridgeTest({ capabilities: async () => ({ supported: true }), addListener: async () => ({ remove: async () => {} }),
    open: async value => { calls.push(value); return { accepted: true } }, close: async () => {} })
  const headers = { Referer: 'https://source.example.org/play', 'User-Agent': 'Mozilla/5.0' }
  const first = await api.openNativePlayback({ sessionId: 'with-headers', url: 'https://media.example.org/one.m3u8', requestHeaders: headers }, () => {})
  const second = await api.openNativePlayback({ sessionId: 'without-headers', url: 'https://media.example.org/two.m3u8' }, () => {})
  assert.deepEqual(calls[0].requestHeaders, headers)
  assert.equal(calls[1].requestHeaders, undefined)
  first.close(); second.close()
})

test('原生播放会话隔离事件、清理监听与忽略过期结果', async () => {
  let event, removed = 0, closes = 0
  const api = bridgeTest({ capabilities: async () => ({ supported: true }), addListener: async (_, callback) => { event = callback; return { remove: async () => removed++ } }, open: async () => ({ accepted: true }), close: async () => { closes++; event({ id: 'one', position: 12, duration: 100, closed: true }) } })
  const events = []
  const session = await api.openNativePlayback({ sessionId: 'one' }, value => events.push(value))
  event({ id: 'other', position: 99, duration: 100 }); event({ id: 'one', position: 10, duration: 100 })
  assert.equal(events.length, 1)
  session.close(); session.close(); event({ id: 'one', position: 99, duration: 100 })
  assert.equal(events.length, 1); assert.equal(closes, 1); assert.equal(removed, 1)
  assert.equal((await session.result).positionSeconds, 12)
})
test('启动期间取消不打开原生播放窗口', async () => {
  let capability, opens = 0
  const api = bridgeTest({ capabilities: () => new Promise(resolve => { capability = resolve }), open: async () => opens++ })
  const controller = new AbortController()
  const opening = api.openNativePlayback({ sessionId: 'one' }, () => {}, controller.signal)
  controller.abort(); capability({ supported: true })
  await assert.rejects(opening, /取消/)
  assert.equal(opens, 0)
})
test('留窗切集只移交已知动作，携带替换标识且旧结果不会关闭新窗口', async () => {
  let event, opened, closes = 0, removed = 0
  const api = bridgeTest({ capabilities: async () => ({ supported: true, inPlaceSwitch: true }),
    addListener: async (_, callback) => { event = callback; return { remove: async () => removed++ } },
    open: async options => { opened = options; return { accepted: true } }, close: async () => closes++ })
  const session = await api.openNativePlayback({ sessionId: 'old', nextChoiceId: 'ep2', autoNext: true }, () => {})
  event({ id: 'old', position: 100, duration: 100, ended: true, reason: 'transition', action: 'next', closed: false })
  const result = await session.result
  assert.equal(result.retained, true); assert.equal(result.choiceId, 'ep2'); assert.equal(closes, 0); assert.equal(removed, 1)
  session.close(); assert.equal(closes, 0)
  const replacement = await api.openNativePlayback({ sessionId: 'new', replaceId: 'old' }, () => {})
  assert.equal(opened.replaceId, 'old')
  event({ id: 'old', position: 99, duration: 100, closed: true })
  replacement.close(); assert.equal(closes, 1)
  event({ id: 'new', position: 5, duration: 100, closed: true }); await replacement.result
})
test('未知留窗动作安全关闭，未声明能力的旧桥接不进入留窗模式', async () => {
  for (const supported of [true, false]) {
    let event, closes = 0
    const api = bridgeTest({ capabilities: async () => ({ supported: true, inPlaceSwitch: supported }), addListener: async (_, callback) => { event = callback; return { remove: async () => {} } },
      open: async () => ({ accepted: true }), close: async () => { closes++; event({ id: 'one', position: 0, duration: 100, closed: true }) } })
    const session = await api.openNativePlayback({ sessionId: 'one' }, () => {})
    event({ id: 'one', position: 0, duration: 100, reason: 'transition', action: 'unknown', closed: false })
    if (!supported) { assert.equal(closes, 0); session.close() }
    const result = await session.result
    assert.notEqual(result.retained, true); assert.equal(closes, 1)
  }
})
test('留窗故障仍记失败，替换解析失败可显式结束旧窗口', async () => {
  let event, failedId, closes = 0
  const records = []
  const api = bridgeTest({ capabilities: async () => ({ supported: true, inPlaceSwitch: true }),
    addListener: async (_, callback) => { event = callback; return { remove: async () => {} } },
    open: async () => ({ accepted: true }), close: async () => closes++,
    transitionFailed: async ({ id }) => { failedId = id } }, (...args) => records.push(args))
  const session = await api.openNativePlayback({ sessionId: 'failed', positionSeconds: 0, rate: 1 }, () => {})
  event({ id: 'failed', reason: 'transition', action: 'switch', closed: false, position: 25, duration: 100,
    firstFrame: true, watchedSeconds: 25, error: '网络错误', errorCode: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' })
  const result = await session.result
  assert.equal(result.retained, true); assert.equal(result.action, 'error'); assert.equal(closes, 0)
  assert.equal(records.find(record => record[0] === 'playback')[1], 'failed')
  await api.failRetainedNativePlayback('failed')
  assert.equal(failedId, 'failed')
})
test('原生选集只接受当前会话提供的选项，不把任意动作当成集数', async () => {
  for (const action of ['ep2', 'unknown']) {
    let event, opened
    const api = bridgeTest({ capabilities: async () => ({ supported: true }), addListener: async (_, listener) => { event = listener; return { remove: async () => {} } }, open: async request => { opened = request; return { accepted: true } }, close: async () => {} })
    const session = await api.openNativePlayback({ sessionId: 'choices', choices: [{ id: 'ep2', label: '第2集', selected: false }], lightTheme: true }, () => {})
    assert.equal(opened.lightTheme, true); assert.equal(opened.choices[0].id, 'ep2')
    event({ id: 'choices', position: 10, duration: 100, closed: true, reason: 'choice', action })
    const result = await session.result
    assert.equal(result.action, action === 'ep2' ? 'choice' : 'close')
  }
})
test('原生错误关闭当前窗口并回传真实观测，动作与超时预算传递给原生', async () => {
  let event, request, closes = 0, removed = 0
  const api = bridgeTest({ capabilities: async () => ({ supported: true }), addListener: async (_, callback) => { event = callback; return { remove: async () => removed++ } },
    open: async options => { request = options; return { accepted: true } }, close: async () => { closes++ } })
  const session = await api.openNativePlayback({ sessionId: 'one', positionSeconds: 0, rate: 1, firstFrameTimeoutMs: 20000, nextChoiceId: 'next' }, () => {})
  assert.equal(request.firstFrameTimeoutMs, 20000); assert.equal(request.hasNext, true)
  event({ id: 'one', position: 5, duration: 100, reason: 'error', firstFrame: true, firstFrameMs: 1200, watchedSeconds: 3, stallSeconds: 2 })
  const result = await session.result
  assert.equal(result.action, 'error'); assert.equal(result.firstFrameMs, 1200); assert.equal(result.watchedSeconds, 3)
  assert.equal(closes, 1); assert.equal(removed, 1)
})

test('远程播放使用内嵌视频并隔离旧事件，离线文件使用 Media3 保存续播进度', { timeout: 30000 }, async () => {
  const root = path.resolve(__dirname, '../sanye_client/dist-android')
  const server = createServer(async (request, response) => {
    try {
      const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname)
      if (file !== root && !file.startsWith(root + path.sep)) return response.writeHead(403).end()
      response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(await fsp.readFile(file === root ? path.join(root, 'index.html') : file))
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page.setDefaultTimeout(7000)
    await page.addInitScript(() => {
      window.androidBridge = {}; window.__opens = []; window.__progress = []; window.__listeners = []; window.__webPlays = 0; window.__offlineProgress = []; window.__nativeCloses = []
      Object.defineProperties(HTMLMediaElement.prototype, {
        src: { configurable: true, get() { return this.__src || '' }, set(value) { this.__src = value; this.__time = 0; queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))) } },
        currentSrc: { configurable: true, get() { return this.__src || '' } },
        duration: { configurable: true, get: () => 100 },
        readyState: { configurable: true, get: () => 4 },
        currentTime: { configurable: true, get() { return this.__time || 0 }, set(value) { this.__time = value } },
        paused: { configurable: true, get() { return !this.__playing } },
      })
      HTMLMediaElement.prototype.load = function () { queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))) }
      HTMLMediaElement.prototype.play = async function () { window.__webPlays++; this.__playing = true; this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')) }
      HTMLMediaElement.prototype.pause = function () { this.__playing = false; this.dispatchEvent(new Event('pause')) }
      const source = 'https://www.yhdmtv.cc/p/65395/153'
      const content = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 2, arguments: { name: '测试订阅', searchConfig: { searchUrl: 'https://www.yhdmtv.cc/search?wd={keyword}', subjectFormatId: 'a', channelFormatId: 'no-channel' } } }] } })
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ active: 'https://example.org/a.json', activeSourceIndex: 0, items: [{ url: 'https://example.org/a.json', content, updatedAt: Date.now() }] }))
      const methods = { SanyeCatalog: ['list', 'listHistory', 'getSettings', 'recordProgress', 'setSettings'], SanyeSource: ['subscriptionSearch', 'subscriptionPreview', 'subscriptionResolve', 'addListener', 'removeListener'], SanyeDownload: ['list', 'resume', 'play', 'recordProgress'], SanyeMedia3: ['capabilities', 'open', 'close', 'addListener', 'removeListener'], App: ['getInfo', 'addListener', 'removeListener'] }
      window.Capacitor = {
        convertFileSrc: file => `http://localhost/_capacitor_file_${file.slice(7)}`,
        PluginHeaders: Object.entries(methods).map(([name, methods]) => ({ name, methods: methods.map(name => ({ name, rtype: name === 'addListener' ? 'callback' : 'promise' })) })),
        nativeCallback: (plugin, method, options, callback) => { if (plugin === 'SanyeMedia3') window.__listeners.push(callback); return `${plugin}-${window.__listeners.length}` },
        nativePromise: async (plugin, method, options) => {
          if (plugin === 'SanyeDownload' && method === 'recordProgress') { window.__offlineProgress.push(options); return {} }
          if (plugin === 'SanyeDownload') return method === 'play' ? { id: 'one', position: 23, duration: 100, path: 'file:///data/user/0/com.sanye.sanye_anime/files/sanye_downloads/one.mp4', title: '本地视频' }
            : { items: [{ id: 'one', title: '本地视频', state: 'completed', bytes: 1024, total: 1024, error: '', createdAt: Date.now() }], usedBytes: 1024, maxStorageBytes: 2147483648, maxFileBytes: 536870912 }
          if (plugin === 'SanyeMedia3') {
            if (method === 'capabilities') return { supported: true, inPlaceSwitch: true }
            if (method === 'open') { window.__opens.push(options); return { accepted: true } }
            if (method === 'close') { window.__nativeCloses.push(options.id); const index = window.__opens.findIndex(request => request.id === options.id); window.__listeners[index]?.({ id: options.id, closed: true, position: 40, duration: 100, rate: 1.5, playing: false, ended: false }); return {} }
            return {}
          }
          if (method === 'list') return { items: [] }
          if (method === 'listHistory') return { items: [{ mediaUrl: source, title: '测试番剧', episodeId: 'ep1', lineId: 'main', episodeTitle: '第1集', positionSeconds: 30, durationSeconds: 100, completed: false, updatedAt: Date.now(), sourceContext: { content, sourceIndex: 0 } }] }
          if (method === 'getSettings' || method === 'setSettings') return { settings: { theme: 'light', playbackRate: 1.25, volume: 0.8, qualityProfile: 'off', frameTarget: 'off' } }
          if (method === 'recordProgress') { window.__progress.push(options); return { item: options } }
          if (method === 'subscriptionSearch') return { hits: [{ title: '测试番剧', sourceUrl: source, sourceIndex: 0 }] }
          if (method === 'subscriptionPreview') return { title: '测试番剧', sourceUrl: source, episodes: [{ id: 'ep1', title: '第1集', sourceUrl: `${source}/1`, playbackUrl: 'https://cdn.example.org/one.mp4', mimeType: 'video/mp4', lineId: 'main' }, { id: 'ep2', title: '第2集', sourceUrl: `${source}/2`, playbackUrl: 'https://cdn.example.org/two.mp4', mimeType: 'video/mp4', lineId: 'main' }] }
          if (method === 'getInfo') return { version: '测试', build: '1' }
          return {}
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole('button', { name: '历史', exact: true }).click()
    await page.getByRole('button', { name: /继续播放/ }).click()
    await page.waitForFunction(() => document.querySelector('video')?.src === 'https://cdn.example.org/one.mp4' && document.querySelector('video').currentTime === 30).catch(async cause => { throw new Error(`${cause.message}; 视频=${JSON.stringify(await page.locator('video').evaluate(video => ({ src: video.src, time: video.currentTime })))}; 页面=${await page.locator('body').innerText()}`) })
    assert.equal(await page.locator('video').evaluate(video => video.playbackRate), 1.25)
    assert.equal(await page.evaluate(() => window.__opens.length), 0, '远程播放即使原生引擎可用也留在内嵌视频')
    await page.locator('.android-player-surface').click({ position: { x: 20, y: 20 } })
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity === '0')
    assert.equal(await page.locator('.android-player-controls').evaluate(e => e.inert), true)
    await page.locator('.android-player-surface').click({ position: { x: 20, y: 20 } })
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity === '1')
    assert.equal(await page.locator('.android-player-controls').evaluate(e => e.inert), false)
    const edges = await page.evaluate(() => {
      const stage = document.querySelector('.android-player-stage').getBoundingClientRect()
      const time = document.querySelector('.android-player-time').getBoundingClientRect()
      const full = document.querySelector('.android-player-controls-row > :last-child').getBoundingClientRect()
      return { right: stage.right - full.right, bottom: stage.bottom - full.bottom, timeBottom: stage.bottom - time.bottom }
    })
    assert.ok(edges.right <= 5 && edges.bottom >= 24 && edges.bottom <= 32
      && edges.timeBottom === edges.bottom, `竖屏按钮应在进度条上方且时间对齐：${JSON.stringify(edges)}`)
    await page.evaluate(() => { window.__oldVideo = document.querySelector('video'); window.__oldVideo.currentTime = 50; window.__oldVideo.dispatchEvent(new Event('timeupdate')) })
    await page.getByRole('button', { name: '播放第2集', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('video')?.src === 'https://cdn.example.org/two.mp4')
    await page.evaluate(() => { document.querySelector('video').currentTime = 40; document.querySelector('video').dispatchEvent(new Event('timeupdate')) })
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.waitForFunction(() => window.__progress.some(entry => entry.episodeId === 'ep2'))
    await page.evaluate(() => { window.__oldVideo.currentTime = 99; window.__oldVideo.dispatchEvent(new Event('timeupdate')) })
    await page.waitForTimeout(50)
    const progress = await page.evaluate(() => window.__progress)
    assert.ok(progress.some(entry => entry.episodeId === 'ep1' && entry.positionSeconds === 50))
    assert.ok(progress.some(entry => entry.episodeId === 'ep2' && entry.positionSeconds === 40))
    assert.ok(progress.every(entry => entry.sourceContext?.sourceIndex === 0 && entry.sourceContext.content.includes('测试订阅')), '内嵌续播保存原订阅与规则身份')
    assert.equal(progress.filter(entry => entry.positionSeconds === 99).length, 0)
    assert.ok(await page.evaluate(() => window.__webPlays > 0))
    await page.getByRole('group', { name: '我的功能' }).getByRole('button', { name: '下载', exact: true }).click()
    await page.locator('.android-downloads summary').click()
    await page.getByRole('button', { name: '离线播放', exact: true }).click()
    await page.waitForFunction(() => window.__opens.length === 1)
    assert.equal(await page.evaluate(() => window.__opens[0].url), 'file:///data/user/0/com.sanye.sanye_anime/files/sanye_downloads/one.mp4')
    assert.equal(await page.evaluate(() => window.__opens[0].position), 23)
    assert.equal(await page.locator('video').count(), 0)
    await page.evaluate(() => window.__listeners[0]({ id: window.__opens[0].id, action: 'retry', closed: true, position: 40, duration: 100, playing: false, rate: 1 }))
    await page.waitForFunction(() => window.__opens.length === 2)
    assert.equal(await page.evaluate(() => window.__opens[1].position), 40)
    assert.ok(await page.evaluate(() => window.__offlineProgress.some(entry => entry.id === 'one' && entry.position === 40)))
    assert.equal(await page.evaluate(() => window.__opens[1].url), 'file:///data/user/0/com.sanye.sanye_anime/files/sanye_downloads/one.mp4')
    await page.getByRole('button', { name: '我的', exact: true }).click()
    assert.equal(await page.evaluate(() => window.__progress.some(entry => entry.mediaUrl.includes('localhost'))), false)
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
