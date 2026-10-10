const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/quality-fluctuation')
const hlsDirectory = path.resolve(__dirname, '../sanye_deploy/.local/quality-fluctuation/media')
const longPlaylist = path.join(hlsDirectory, 'long.m3u8')

/** 双档本地 HLS 夹具：低档复用 640×360 分片，高档为同一素材的 1280×720 转码。 */
before(async () => {
  await fs.mkdir(output, { recursive: true })
  try {
    await fs.access(longPlaylist)
    return
  } catch {}
  await fs.mkdir(hlsDirectory, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    await page.exposeFunction('saveMedia', async (name, bytes) => {
      await fs.writeFile(path.join(hlsDirectory, name), Buffer.from(bytes))
    })
    await page.evaluate(async () => {
      const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
      const { interpolationAssets } = await import('/src/video/interpolation.ts')
      const engine = new FFmpeg()
      const variants = [
        ['low', '640x360', '900k'],
        ['high', '1280x720', '2600k'],
      ]
      try {
        await engine.load(interpolationAssets)
        for (const [name, size, bitrate] of variants) {
          const status = await engine.exec(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=12`,
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-preset', 'ultrafast',
            '-b:v', bitrate, '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2',
            '-hls_list_size', '0', `-hls_segment_filename`, `${name}%d.ts`, `${name}.m3u8`], 240000)
          if (status !== 0) throw new Error(`${name} fixture generation failed`)
        }
        for (const file of await engine.listDir('/')) {
          if (/^(low|high)\d*\.(ts|m3u8)$/.test(file.name)) await window.saveMedia(file.name, Array.from(await engine.readFile(file.name)))
        }
        await window.saveMedia('master.m3u8', [...new TextEncoder().encode([
          '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS',
          '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360,CODECS="avc1.42e01e,mp4a.40.2"',
          'low.m3u8',
          '#EXT-X-STREAM-INF:BANDWIDTH=2600000,RESOLUTION=1280x720,CODECS="avc1.42e01e,mp4a.40.2"',
          'high.m3u8', ''].join('\n'))])
        const longStatus = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=30',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30', '-c:v', 'libx264', '-preset', 'ultrafast',
          '-crf', '30', '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2',
          '-hls_list_size', '0', '-hls_segment_filename', 'long%d.ts', 'long.m3u8'], 300000)
        if (longStatus !== 0) throw new Error('long fixture generation failed')
        for (const file of await engine.listDir('/')) {
          if (/^long\d*\.(ts|m3u8)$/.test(file.name)) await window.saveMedia(file.name, Array.from(await engine.readFile(file.name)))
        }
      } finally { engine.terminate() }
    })
  } finally { await browser.close() }
}, { timeout: 300000 })

test('playback keeps a stable quality profile over a sustained window', { timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.addInitScript(() => {
      localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 60, quality: 'sharp' }))
      const original = window.createImageBitmap
      window.__captures = []
      window.createImageBitmap = function (...args) {
        window.__captures.push(Math.round(performance.now()))
        return original.apply(this, args)
      }
    })
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/api/v1/anime/external-preview?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
      title: '画质波动观测', originalTitle: '', type: '电影', tags: [],
      episodes: [{ id: 901, episodeNo: 1, title: '测试片段', playbackUrl: `${origin}/quality-hls/long.m3u8`, mimeType: 'application/vnd.apple.mpegurl' }],
    } } }))
    await page.route('**/quality-hls/*', async route => {
      const name = path.basename(new URL(route.request().url()).pathname)
      await route.fulfill({ path: path.join(hlsDirectory, name),
        contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
        headers: { 'Cache-Control': 'no-store' } })
    })
    await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/quality-hls/long.m3u8`)}`)
    await page.waitForFunction(() => {
      const video = document.querySelector('video')
      return video && video.readyState >= 3 && video.currentTime > 0.5
    }, null, { timeout: 40000 })
    await page.waitForSelector('.sanye-realtime-interpolation-active', { timeout: 20000 })
    await page.evaluate(async () => {
      const moduleUrl = performance.getEntriesByType('resource').map(entry => entry.name)
        .find(url => /artplayer(?:\.js|\/)/.test(url))
      const { default: Artplayer } = await import(moduleUrl)
      const player = Artplayer.instances[0]
      window.qualityLog = []
      const push = (kind, detail) => window.qualityLog.push({ t: Math.round(performance.now()), kind, ...detail })
      const menuText = selector => document.querySelector(`${selector} .art-selector-item.art-current`)?.textContent?.trim() ?? ''
      const video = player.video
      const host = video.closest('.art-video-player')
      const presented = []
      let presentedHandle = 0
      if (video.requestVideoFrameCallback) {
        const onPresented = now => { presented.push(Math.round(now)); presentedHandle = video.requestVideoFrameCallback(onPresented) }
        presentedHandle = video.requestVideoFrameCallback(onPresented)
      }
      window.qualityTimeline = { presented, captures: window.__captures }
      const state = { level: null, width: 0, height: 0, profile: '', cadence: '', active: false, pending: false }
      const mediaEvents = ['waiting', 'stalled', 'seeking', 'seeked', 'pause', 'play', 'playing', 'ended', 'emptied',
        'ratechange', 'loadeddata', 'canplay', 'durationchange', 'suspend', 'abort', 'error']
      for (const type of mediaEvents) {
        video.addEventListener(type, () => push('media', { type, currentTime: Math.round(video.currentTime * 1000) / 1000,
          readyState: video.readyState, paused: video.paused, networkState: video.networkState }))
      }
      if (player.hls) {
        for (const type of ['hlsError', 'hlsFragBuffered', 'hlsLevelSwitching', 'hlsBufferStalled', 'hlsFragLoaded']) {
          player.hls.on(type, (_event, data) => push(type, { currentTime: Math.round(video.currentTime * 1000) / 1000,
            level: player.hls.currentLevel, nextLevel: player.hls.nextLevel,
            details: data?.details ?? '', fatal: data?.fatal ?? null, type: data?.type ?? '' }))
        }
      }
      const sample = () => {
        const next = { level: player.hls?.currentLevel ?? null, width: video.videoWidth, height: video.videoHeight,
          profile: menuText('.art-control-anime4k'), cadence: menuText('.art-control-interpolation'),
          active: host.classList.contains('sanye-realtime-interpolation-active'),
          pending: host.classList.contains('sanye-media-pending') }
        for (const key of Object.keys(state)) if (state[key] !== next[key]) push(key, { from: state[key], to: next[key],
          currentTime: Math.round(video.currentTime * 1000) / 1000, readyState: video.readyState,
          duration: Math.round(video.duration * 1000) / 1000,
          bufferedEnd: video.buffered.length ? Math.round(video.buffered.end(video.buffered.length - 1) * 100) / 100 : null })
        Object.assign(state, next)
      }
      sample()
      window.qualityHost = host
      // 主线程卡顿期间采样循环本身也会被阻塞，因此用属性观察者补齐展示层切换记录。
      let lastActive = host.classList.contains('sanye-realtime-interpolation-active')
      new MutationObserver(() => {
        const now = host.classList.contains('sanye-realtime-interpolation-active')
        if (now !== lastActive) {
          push('active', { from: lastActive, to: now, currentTime: Math.round(video.currentTime * 1000) / 1000,
            duration: Math.round(video.duration * 1000) / 1000 })
          lastActive = now
        }
      }).observe(host, { attributes: true, attributeFilter: ['class'] })
      window.qualitySampler = setInterval(sample, 120)
      window.qualityTimer = setInterval(() => {
        const notice = document.querySelector('.art-notice-inner')?.textContent?.trim() ?? ''
        if (notice) push('notice', { text: notice })
      }, 250)
    })
    // 阶段一：稳定播放期间不得出现档位或补间层变化。
    await page.evaluate(() => { window.qualityLog = [] })
    await page.waitForTimeout(8000)
    const steadyEvents = await page.evaluate(() => window.qualityLog.slice())
    // 阶段二：注入 0.4 秒主线程卡顿，模拟真实环境的短时输入抖动；结束后补间层必须仍在显示。
    const activeAfterJitter = await page.evaluate(() => {
      window.qualityLog = []
      const end = performance.now() + 400
      while (performance.now() < end) {}
      return window.qualityHost.classList.contains('sanye-realtime-interpolation-active')
    })
    await page.waitForTimeout(2000)
    const jitterEvents = await page.evaluate(() => window.qualityLog.slice())
    // 阶段三：持续 1.5 秒中断后必须回退到原画，并能在新帧到达后恢复补间层。
    const activeAfterStall = await page.evaluate(() => {
      window.qualityLog = []
      const end = performance.now() + 1500
      while (performance.now() < end) {}
      return window.qualityHost.classList.contains('sanye-realtime-interpolation-active')
    })
    await page.waitForTimeout(2600)
    const sustainedEvents = await page.evaluate(() => window.qualityLog.slice())
    await page.screenshot({ path: path.join(output, 'sustained.png') })
    const report = { steadyEvents, jitterEvents, sustainedEvents, activeAfterJitter, activeAfterStall, pageErrors }
    report.timeline = await page.evaluate(() => window.qualityTimeline)
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    const summarize = list => ({
      levels: list.filter(event => event.kind === 'level').map(event => `${event.from}→${event.to}`),
      resolutions: list.filter(event => event.kind === 'width' || event.kind === 'height').map(event => `${event.kind}:${event.from}→${event.to}`),
      profiles: list.filter(event => event.kind === 'profile').map(event => `${event.from}→${event.to}`),
      cadences: list.filter(event => event.kind === 'cadence').map(event => `${event.from}→${event.to}`),
      activeToggles: list.filter(event => event.kind === 'active').length,
      pendingToggles: list.filter(event => event.kind === 'pending').length,
      mediaEvents: list.filter(event => event.kind === 'media').map(event => event.type),
      notices: [...new Set(list.filter(event => event.kind === 'notice').map(event => event.text))],
    })
    console.log('steady', JSON.stringify(summarize(steadyEvents)))
    console.log('jitter', JSON.stringify(summarize(jitterEvents)))
    console.log('sustained', JSON.stringify(summarize(sustainedEvents)))
    assert.deepEqual(pageErrors, [], '页面不应有未捕获错误')
    const allEvents = [...steadyEvents, ...jitterEvents, ...sustainedEvents]
    assert.ok(allEvents.length > 0, '观测窗口内必须有可记录的播放状态')
    assert.ok(allEvents.every(event => Number.isFinite(event.t)), '事件时间戳必须有效')
    const steadySummary = summarize(steadyEvents)
    // 媒体自然结束时的收起不算波动，其余切换都视为画质波动。
    const steadyFlips = steadyEvents.filter(event => event.kind === 'active' && event.from === true && event.to === false
      && !(event.duration && event.currentTime >= event.duration - 0.5))
    assert.deepEqual(steadyFlips, [], '稳定播放期间补间层不应整层切换')
    assert.deepEqual(steadySummary.profiles, [], '稳定播放期间不应出现增强档位变化')
    assert.deepEqual(steadySummary.cadences, [], '稳定播放期间不应出现帧率档位变化')
    assert.deepEqual(steadySummary.mediaEvents.filter(type => type !== 'loadeddata' && type !== 'canplay'
      && type !== 'durationchange' && type !== 'suspend' && type !== 'play' && type !== 'playing'), [],
    '稳定播放期间不应出现缓冲或定位事件')
    const jitterFlips = jitterEvents.filter(event => event.kind === 'active' && event.from === true && event.to === false)
    assert.equal(activeAfterJitter, true, '短时输入抖动后补间层必须仍在显示')
    assert.deepEqual(jitterFlips, [], '短时输入抖动不得整层切回原画')
    const sustainedFlips = sustainedEvents.filter(event => event.kind === 'active' && event.from === true && event.to === false)
    assert.ok(sustainedFlips.length >= 1, '持续中断必须回退到原画')
    assert.ok(sustainedEvents.some(event => event.kind === 'active' && event.to === true), '新帧到达后必须恢复补间层')
  } finally { await browser.close() }
})
