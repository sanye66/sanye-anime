const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')
const vm = require('node:vm')
const { chromium } = require('playwright')
const clientRequire = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))
const ts = clientRequire('typescript')
const source = readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/systemPlayback.ts'), 'utf8')
const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const flush = () => new Promise(resolve => setImmediate(resolve))

class Video extends EventTarget {
  paused = true
  ended = false
  error = null
  currentTime = 12
  duration = 100
  playbackRate = 1
  playCalls = 0
  pauseCalls = 0
  async play() { this.playCalls++; this.paused = false; this.dispatchEvent(new Event('play')) }
  pause() { this.pauseCalls++; if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')) } }
}

function setup(overrides = {}, native = true) {
  const states = []
  const releases = []
  const handlers = []
  let removals = 0
  const bridge = {
    getSystemPlaybackCapabilities: async () => ({ supported: true }),
    addListener: async (_event, listener) => { handlers.push(listener); return { remove: async () => { removals++ } } },
    updateSystemPlayback: async state => { states.push(state); return { accepted: true } },
    requestSystemPlaybackFocus: async () => ({ accepted: true }),
    releaseSystemPlayback: async state => { releases.push(state.id) },
    ...overrides,
  }
  const context = {
    exports: {}, setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds === 1500 ? 25 : milliseconds), clearTimeout,
    require: () => ({ Capacitor: { isNativePlatform: () => native, isPluginAvailable: () => native }, registerPlugin: () => bridge }),
  }
  vm.runInNewContext(script, context)
  return { ...context.exports, states, releases, handlers, removals: () => removals, bridge }
}

test('同步标题集名、暂停播放、跳转与播放速度，系统指令只作用当前会话', async () => {
  const api = setup()
  const video = new Video()
  let episode = '第1集'
  const dispose = api.attachSystemPlayback(video, () => ({ title: '测试番剧', episode }))
  await flush()
  assert.equal(api.states[0].title, '测试番剧')
  assert.equal(api.states[0].episode, episode)
  assert.equal(api.states[0].playing, false)
  assert.equal(api.states[0].initialize, true)
  const id = api.states[0].id
  api.handlers[0]({ id: '过期会话', action: 'play' })
  assert.equal(video.playCalls, 0)
  api.handlers[0]({ id, action: 'play' })
  await flush()
  assert.equal(api.states.at(-1).explicitPlay, true)
  assert.equal(api.states.at(-1).playing, true)
  api.handlers[0]({ id, action: 'seek', position: 130 })
  await flush()
  assert.equal(video.currentTime, 100)
  episode = '第2集'
  video.playbackRate = 1.5
  video.dispatchEvent(new Event('ratechange'))
  await flush()
  assert.equal(api.states.at(-1).episode, episode)
  assert.equal(api.states.at(-1).rate, 1.5)
  api.handlers[0]({ id, action: 'pause' })
  await flush()
  assert.equal(video.paused, true)
  assert.equal(api.states.at(-1).playing, false)
  dispose(); dispose()
  await flush()
  assert.equal(api.removals(), 1)
  assert.ok(api.releases.includes(id))
  const count = api.states.length
  video.dispatchEvent(new Event('play'))
  api.handlers[0]({ id, action: 'play' })
  await flush()
  assert.equal(api.states.length, count)
  assert.equal(video.playCalls, 1)
})

test('系统播放状态被拒后暂停且不自动重新播放', async () => {
  const api = setup()
  const video = new Video()
  const dispose = api.attachSystemPlayback(video, { title: '测试' })
  await flush()
  api.bridge.updateSystemPlayback = async state => { api.states.push(state); return { accepted: !state.playing } }
  await video.play()
  await flush()
  assert.equal(video.paused, true)
  assert.equal(video.playCalls, 1)
  assert.equal(api.states.at(-1).playing, false)
  dispose()
})

test('系统媒体状态同步失败不打断已经开始的 WebView 播放', async () => {
  for (const mode of ['reject', 'timeout']) {
    const api = setup({
      updateSystemPlayback: async state => {
        api.states.push(state)
        if (!state.playing) return { accepted: true }
        if (mode === 'reject') throw Error('系统媒体通知暂不可用')
        return new Promise(() => {})
      },
    })
    const video = new Video()
    const dispose = api.attachSystemPlayback(video, { title: '测试' })
    await flush()
    await video.play()
    await new Promise(resolve => setTimeout(resolve, 40))
    assert.equal(video.paused, false, `${mode} 不应暂停媒体`)
    assert.equal(video.play, Video.prototype.play, `${mode} 应释放失效的系统桥接`)
    assert.equal(api.removals(), 1)
    assert.ok(api.releases.length >= 1)
    dispose()
  }
})

test('WebView 自身中断会同步暂停且不会再次请求播放，未经请求的播放事件不解除中断', async () => {
  let permissionRequests = 0
  let interrupted = false
  let playing = false
  const api = setup({
    requestSystemPlaybackFocus: async () => { permissionRequests++; interrupted = false; return { accepted: true } },
    updateSystemPlayback: async state => {
      if (playing && !state.playing) interrupted = true
      if (state.explicitPlay) interrupted = false
      playing = state.playing && !interrupted
      api.states.push(state)
      return { accepted: !state.playing || playing }
    },
  })
  const video = new Video()
  const dispose = api.attachSystemPlayback(video, { title: '焦点交接' })
  await video.play()
  await flush()
  Video.prototype.pause.call(video)
  await flush()
  assert.equal(api.states.at(-1).playing, false)
  assert.equal(permissionRequests, 1)
  assert.equal(video.playCalls, 1)
  await Video.prototype.play.call(video)
  await flush()
  assert.equal(video.paused, true)
  assert.ok(api.states.some(state => state.playing && !state.explicitPlay))
  await video.play()
  await flush()
  assert.equal(video.paused, false)
  assert.equal(permissionRequests, 2)
  dispose()
})

test('内嵌系统控制器只管理会话，不成为 WebView 的第二个音频焦点拥有者', () => {
  const controller = readFileSync(path.resolve(__dirname, '../sanye_android/android/app/src/main/java/com/sanye/sanye_anime/SystemPlaybackController.java'), 'utf8')
  assert.doesNotMatch(controller, /requestAudioFocus|abandonAudioFocus|AudioFocusRequest|OnAudioFocusChangeListener/)
})

test('先核对系统播放门控再启动视频，拒绝与暂停会取消待播放请求', async () => {
  let resolveFocus
  const api = setup({ requestSystemPlaybackFocus: () => new Promise(resolve => { resolveFocus = resolve }) })
  const video = new Video()
  const originalPlay = video.play
  const dispose = api.attachSystemPlayback(video, { title: '测试' })
  await flush()
  const denied = video.play()
  await flush()
  assert.equal(video.playCalls, 0)
  resolveFocus({ accepted: false })
  await assert.rejects(denied, /不允许播放/)
  const cancelled = video.play()
  await flush()
  video.pause()
  resolveFocus({ accepted: true })
  await assert.rejects(cancelled, /已取消/)
  await flush()
  assert.equal(api.states.at(-1).playing, false)
  assert.equal(video.playCalls, 0)
  dispose()
  assert.equal(video.play, originalPlay)
})

test('播放门控请求超时或视频启动失败时同步暂停状态并清理迟到授权', async () => {
  let resolveFocus
  const api = setup({ requestSystemPlaybackFocus: () => new Promise(resolve => { resolveFocus = resolve }) })
  const video = new Video()
  const dispose = api.attachSystemPlayback(video, { title: '测试' })
  await flush()
  await assert.rejects(video.play(), /超时/)
  const before = api.states.length
  resolveFocus({ accepted: true })
  await flush()
  assert.ok(api.states.length > before)
  assert.equal(api.states.at(-1).playing, false)
  assert.equal(video.playCalls, 0)
  dispose()
  const failedVideo = new Video()
  failedVideo.play = async () => { throw Error('媒体不可播放') }
  api.bridge.requestSystemPlaybackFocus = async () => ({ accepted: true })
  const disposeFailed = api.attachSystemPlayback(failedVideo, { title: '测试' })
  await assert.rejects(failedVideo.play(), /媒体不可播放/)
  await flush()
  assert.equal(api.states.at(-1).playing, false)
  disposeFailed()
})

test('普通浏览器与旧原生桥接安全降级，不影响视频', async () => {
  for (const native of [false, true]) {
    const api = setup({ getSystemPlaybackCapabilities: async () => { throw Error('UNIMPLEMENTED') } }, native)
    const video = new Video()
    const dispose = api.attachSystemPlayback(video, { title: '测试' })
    await video.play()
    await flush()
    assert.equal(api.states.length, 0)
    assert.equal(video.paused, false)
    dispose()
  }
})

test('挂起监听注册超时后迟到句柄仍被清理', async () => {
  let resolveListener
  let removed = false
  const api = setup({ addListener: () => new Promise(resolve => { resolveListener = resolve }) })
  const dispose = api.attachSystemPlayback(new Video(), { title: '测试' })
  await new Promise(resolve => setTimeout(resolve, 40))
  resolveListener({ remove: async () => { removed = true } })
  await flush()
  assert.equal(removed, true)
  assert.equal(api.states.length, 0)
  dispose()
})

test('切换播放器后旧异步状态和释放不会操控新视频', async () => {
  const api = setup()
  const first = new Video()
  const second = new Video()
  const disposeFirst = api.attachSystemPlayback(first, { title: '旧番剧' })
  await flush()
  const oldId = api.states[0].id
  const disposeSecond = api.attachSystemPlayback(second, { title: '新番剧' })
  await flush()
  const newId = api.states.at(-1).id
  assert.notEqual(oldId, newId)
  assert.ok(api.releases.includes(oldId))
  api.handlers[0]({ id: oldId, action: 'play' })
  assert.equal(first.playCalls, 0)
  disposeFirst()
  assert.equal(api.releases.includes(newId), false)
  disposeSecond()
})

test('无效时间被规整，缓冲和结束状态被同步，进度事件限流', async () => {
  const api = setup()
  const video = new Video()
  video.duration = Infinity
  video.currentTime = NaN
  const dispose = api.attachSystemPlayback(video, { title: '直播' })
  await flush()
  assert.equal(api.states[0].duration, 0)
  assert.equal(api.states[0].position, 0)
  video.dispatchEvent(new Event('waiting'))
  await flush()
  assert.equal(api.states.at(-1).buffering, true)
  video.dispatchEvent(new Event('timeupdate'))
  await flush()
  const count = api.states.length
  video.dispatchEvent(new Event('timeupdate'))
  await flush()
  assert.equal(api.states.length, count)
  video.ended = true
  video.dispatchEvent(new Event('ended'))
  await flush()
  assert.equal(api.states.at(-1).ended, true)
  assert.equal(api.states.at(-1).buffering, false)
  dispose()
})

test('真实浏览器 HTMLVideoElement 的播放门控、系统暂停和方法还原', async () => {
  const sound = Buffer.alloc(44 + 32000)
  sound.write('RIFF', 0); sound.writeUInt32LE(sound.length - 8, 4); sound.write('WAVEfmt ', 8)
  sound.writeUInt32LE(16, 16); sound.writeUInt16LE(1, 20); sound.writeUInt16LE(1, 22)
  sound.writeUInt32LE(8000, 24); sound.writeUInt32LE(16000, 28)
  sound.writeUInt16LE(2, 32); sound.writeUInt16LE(16, 34)
  sound.write('data', 36); sound.writeUInt32LE(32000, 40)
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage()
    await page.setContent('<video id="player" controls></video>')
    await page.evaluate(({ code, media }) => {
      window.states = []
      window.removed = false
      window.released = false
      const bridge = {
        getSystemPlaybackCapabilities: async () => ({ supported: true }),
        addListener: async (_name, handler) => { window.action = handler; return { remove: async () => { window.removed = true } } },
        updateSystemPlayback: async state => { window.states.push(state); return { accepted: true } },
        requestSystemPlaybackFocus: () => new Promise(resolve => { window.grant = resolve }),
        releaseSystemPlayback: async () => { window.released = true },
      }
      window.exports = {}
      window.require = () => ({ Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true }, registerPlugin: () => bridge })
      ;(0, eval)(code)
      const video = document.querySelector('video')
      video.src = media
      window.originalPlay = video.play
      window.dispose = window.exports.attachSystemPlayback(video, { title: '浏览器媒体验证', episode: '第1集' })
    }, { code: script, media: `data:audio/wav;base64,${sound.toString('base64')}` })
    await page.waitForFunction(() => window.states.length > 0 && document.querySelector('video').readyState > 0)
    await page.evaluate(() => { window.pendingPlay = document.querySelector('video').play() })
    await page.waitForFunction(() => Boolean(window.grant))
    assert.equal(await page.evaluate(() => document.querySelector('video').paused), true)
    await page.evaluate(async () => { window.grant({ accepted: true }); await window.pendingPlay })
    await page.waitForFunction(() => window.states.at(-1).playing)
    const playing = await page.evaluate(() => ({ paused: document.querySelector('video').paused, title: window.states.at(-1).title }))
    assert.equal(playing.paused, false)
    assert.equal(playing.title, '浏览器媒体验证')
    await page.evaluate(() => window.action({ id: window.states.at(-1).id, action: 'pause' }))
    await page.waitForFunction(() => document.querySelector('video').paused && !window.states.at(-1).playing)
    await page.evaluate(() => window.dispose())
    await page.waitForFunction(() => window.removed && window.released)
    assert.equal(await page.evaluate(() => document.querySelector('video').play === window.originalPlay), true)
  } finally {
    await browser.close()
  }
})
