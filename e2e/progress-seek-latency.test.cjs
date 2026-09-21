const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const output = path.resolve(__dirname, '../sanye_deploy/.local/progress-seek-latency')
const hlsDirectory = path.resolve(__dirname, '../sanye_deploy/.local/seek-performance')
const hlsPlaylist = path.join(hlsDirectory, 'stream.m3u8')

/** 本地 HLS 夹具：六段两秒分片，用于真实解码、进度跟踪与定位测量。 */
before(async () => {
  await fs.mkdir(output, { recursive: true })
  try {
    await fs.access(hlsPlaylist)
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
      try {
        await engine.load(interpolationAssets)
        const status = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=12',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-preset', 'ultrafast',
          '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2',
          '-hls_list_size', '0', 'stream.m3u8'], 180000)
        if (status !== 0) throw new Error('HLS fixture generation failed')
        for (const file of await engine.listDir('/')) {
          if (/^stream.*\.(ts|m3u8)$/.test(file.name)) await window.saveMedia(file.name, Array.from(await engine.readFile(file.name)))
        }
      } finally { engine.terminate() }
    })
  } finally { await browser.close() }
}, { timeout: 240000 })

/** 挂载外部预览播放器，服务本地 HLS 分片并返回分片请求记录。 */
async function openPlayer(page, preferences) {
  const requests = []
  await page.addInitScript(value => {
    localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify(value))
    const original = window.createImageBitmap
    window.__captures = []
    window.createImageBitmap = function (...args) {
      window.__captures.push(performance.now())
      return original.apply(this, args)
    }
  }, preferences)
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
  await page.route('**/api/v1/anime/external-preview?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
    title: '进度与定位测量', originalTitle: '', type: '电影', tags: [],
    episodes: [{ id: 901, episodeNo: 1, title: '测试片段', playbackUrl: `${origin}/seek-hls/stream.m3u8`, mimeType: 'application/vnd.apple.mpegurl' }],
  } } }))
  await page.route('**/seek-hls/*', route => {
    const name = path.basename(new URL(route.request().url()).pathname)
    if (name.endsWith('.ts')) requests.push(name)
    return route.fulfill({ path: path.join(hlsDirectory, name),
      contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
      headers: { 'Cache-Control': 'max-age=600' } })
  })
  await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/seek-hls/stream.m3u8`)}`)
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return video && video.currentTime > 0.3 && video.readyState >= 3 && video.buffered.length
      && video.buffered.end(video.buffered.length - 1) > 9
  }, null, { timeout: 30000 })
  return requests
}

/** 逐帧采样进度条与主线程调度，返回原始样本供上层统计。 */
async function sampleWindow(page, seconds) {
  await page.evaluate(async seconds => {
    const video = document.querySelector('video')
    const player = video.closest('.art-video-player')
    const track = document.querySelector('.art-progress')
    const played = document.querySelector('.art-progress-played')
    const frames = [], writes = [], toggles = [], longTasks = []
    let observer
    try {
      observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration) })
      observer.observe({ type: 'longtask', buffered: false })
    } catch {}
    const widthObserver = new MutationObserver(() => writes.push({ t: performance.now(), width: played.style.width }))
    widthObserver.observe(played, { attributes: true, attributeFilter: ['style'] })
    const presented = []
    let presentedHandle = 0
    if (video.requestVideoFrameCallback) {
      const onPresented = now => { presented.push(now); presentedHandle = video.requestVideoFrameCallback(onPresented) }
      presentedHandle = video.requestVideoFrameCallback(onPresented)
    }
    const capturesBefore = window.__captures.length
    await new Promise(resolve => {
      const started = performance.now()
      let last = 0, previousActive = player.classList.contains('sanye-realtime-interpolation-active')
      const step = now => {
        const full = track.getBoundingClientRect().width || 1
        const active = player.classList.contains('sanye-realtime-interpolation-active')
        frames.push({ delta: last ? now - last : 0, currentTime: video.currentTime, duration: video.duration,
          fraction: played.getBoundingClientRect().width / full, styleWidth: played.style.width,
          paused: video.paused, rate: video.playbackRate, readyState: video.readyState, active,
          pending: player.classList.contains('sanye-media-pending') })
        if (active !== previousActive) { toggles.push({ t: now - started, active }); previousActive = active }
        last = now
        if (now - started < seconds * 1000) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
    observer?.disconnect()
    widthObserver.disconnect()
    if (presentedHandle && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(presentedHandle)
    const quality = video.getVideoPlaybackQuality()
    window.sampleWindowResult = { frames, writes, toggles, longTasks, presented,
      captures: window.__captures.slice(capturesBefore),
      droppedVideoFrames: quality.droppedVideoFrames, totalVideoFrames: quality.totalVideoFrames }
  }, seconds)
  return page.evaluate(() => window.sampleWindowResult)
}

/** 拖动进度条：先确认控件可见并命中，再记录定位与补帧层恢复时间。 */
async function scrub(page, fromFraction, toFraction) {
  await page.locator('.art-video-player').hover()
  await page.waitForFunction(() => document.querySelector('.art-control-progress')?.getBoundingClientRect().height > 0,
    null, { timeout: 5000 })
  const box = await page.locator('.art-control-progress').boundingBox()
  await page.evaluate(() => {
    const player = document.querySelector('video').closest('.art-video-player')
    const video = document.querySelector('video')
    const marks = []
    window.seekMarks = marks
    window.seekObserver?.disconnect()
    window.seekObserver = new MutationObserver(() => {
      marks.push({ name: player.classList.contains('sanye-realtime-interpolation-active') ? 'active-on' : 'active-off',
        pending: player.classList.contains('sanye-media-pending'), t: performance.now() })
    })
    window.seekObserver.observe(player, { attributes: true, attributeFilter: ['class'] })
    video.addEventListener('seeking', () => marks.push({ name: 'seeking', t: performance.now() }), { once: true })
    video.addEventListener('seeked', () => marks.push({ name: 'seeked', t: performance.now() }), { once: true })
  })
  await page.mouse.move(box.x + box.width * fromFraction, box.y + box.height / 2)
  await page.mouse.down()
  const grabbed = await page.waitForFunction(() => document.querySelector('video').paused, null, { timeout: 3000 })
    .then(() => true).catch(() => false)
  await page.mouse.move(box.x + box.width * toFraction, box.y + box.height / 2, { steps: 12 })
  // 应用的定位控件会 stopImmediatePropagation，松开时刻由测量侧在抬起前记录。
  await page.evaluate(() => { window.releaseAt = performance.now() })
  await page.mouse.up()
  let settled = true
  try {
    await page.waitForFunction(() => {
      const marks = window.seekMarks ?? []
      const video = document.querySelector('video')
      return marks.some(mark => mark.name === 'seeked') && !video.seeking && video.readyState >= 2
    }, null, { timeout: 12000 })
    await page.waitForFunction(() => document.querySelector('.art-video-player')?.classList.contains('sanye-realtime-interpolation-active'),
      null, { timeout: 12000 })
    await page.waitForFunction(() => !document.querySelector('.art-video-player')?.classList.contains('sanye-media-pending'),
      null, { timeout: 12000 })
  } catch { settled = false }
  return page.evaluate(({ grabbed, settled }) => {
    const marks = window.seekMarks
    const at = name => marks.find(mark => mark.name === name)?.t ?? null
    const released = window.releaseAt ?? null
    const since = (name, skip = 0) => {
      const hits = marks.filter(mark => mark.name === name)
      if (skip >= hits.length || released === null) return null
      return Math.round((hits[skip].t - released) * 10) / 10
    }
    // 定位期间补帧层先关闭再恢复，恢复时刻取松开之后最后一次关闭之后的首个开启。
    const resume = (() => {
      if (released === null) return null
      const afterRelease = marks.filter(mark => mark.t >= released)
      const lastOff = afterRelease.filter(mark => mark.name === 'active-off').at(-1)
      const resumed = (lastOff ? marks.filter(mark => mark.t > lastOff.t) : afterRelease)
        .find(mark => mark.name === 'active-on')
      return resumed ? Math.round((resumed.t - released) * 10) / 10 : null
    })()
    const pendingMarks = marks.filter(mark => released !== null && mark.t >= released && typeof mark.pending === 'boolean')
    const pendingOn = pendingMarks.find(mark => mark.pending)
    const pendingOff = pendingOn ? pendingMarks.find(mark => !mark.pending && mark.t > pendingOn.t) : null
    const video = document.querySelector('video')
    const host = video.closest('.art-video-player')
    return { grabbed, settled, seekingMs: since('seeking'), seekedMs: since('seeked'),
      activeMs: resume, pendingOnMs: pendingOn ? Math.round((pendingOn.t - released) * 10) / 10 : null,
      pendingOffMs: pendingOff ? Math.round((pendingOff.t - released) * 10) / 10 : null,
      target: Math.round(video.currentTime * 1000) / 1000,
      duration: Math.round(video.duration * 1000) / 1000, readyState: video.readyState, seeking: video.seeking,
      paused: video.paused, pending: host.classList.contains('sanye-media-pending'),
      active: host.classList.contains('sanye-realtime-interpolation-active'),
      marks: marks.map(mark => ({ name: mark.name, offset: released === null ? null : Math.round((mark.t - released) * 10) / 10 })) }
  }, { grabbed, settled })
}

/** 把播放位置放回可定位区间，避免短夹具先播完导致各场景不可比。 */
async function positionAt(page, fraction) {
  await page.evaluate(fraction => {
    const video = document.querySelector('video')
    video.currentTime = video.duration * fraction
    void video.play().catch(() => {})
  }, fraction)
  await page.waitForFunction(fraction => {
    const video = document.querySelector('video')
    return !video.seeking && Math.abs(video.currentTime - video.duration * fraction) < 1.2 && video.readyState >= 2
  }, fraction, { timeout: 15000 })
  await page.waitForTimeout(400)
}

/** 统计逐帧样本：主线程帧间隔、进度条跟踪误差、写入节奏与静止时段。 */
function summarize(sample, seconds) {
  const deltas = sample.frames.map(frame => frame.delta).slice(1).sort((a, b) => a - b)
  const at = fraction => deltas[Math.min(deltas.length - 1, Math.ceil(deltas.length * fraction) - 1)] ?? 0
  const lags = sample.frames.filter(frame => frame.duration > 0)
    .map(frame => Math.abs(frame.fraction * frame.duration - frame.currentTime)).sort((a, b) => a - b)
  const lagAt = fraction => lags[Math.min(lags.length - 1, Math.ceil(lags.length * fraction) - 1)] ?? 0
  let frozen = 0, frozenMax = 0, lastFraction = sample.frames[0]?.fraction ?? 0, frozenStart = 0
  for (const frame of sample.frames.slice(1)) {
    if (Math.abs(frame.fraction - lastFraction) < 1e-9) { frozen++; frozenStart += frame.delta }
    else { frozenMax = Math.max(frozenMax, frozenStart); frozenStart = 0 }
    lastFraction = frame.fraction
  }
  const writes = sample.writes.map((write, index) => index ? write.t - sample.writes[index - 1].t : 0).slice(1)
  const sortedWrites = [...writes].sort((a, b) => a - b)
  const intervals = list => {
    const gaps = list.slice(1).map((value, index) => value - list[index]).sort((a, b) => a - b)
    return { count: list.length,
      p50: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10 : null,
      p95: gaps.length ? Math.round(gaps[Math.min(gaps.length - 1, Math.ceil(gaps.length * 0.95) - 1)] * 10) / 10 : null,
      max: gaps.length ? Math.round(gaps.at(-1) * 10) / 10 : null }
  }
  const targets = sample.frames.filter(frame => frame.duration > 0 && frame.styleWidth)
    .map(frame => Math.abs(parseFloat(frame.styleWidth) / 100 * frame.duration - frame.currentTime)).sort((a, b) => a - b)
  const targetAt = fraction => Math.round((targets[Math.min(targets.length - 1, Math.ceil(targets.length * fraction) - 1)] ?? 0) * 10) / 10
  return { seconds: Math.round(seconds * 100) / 100, frames: sample.frames.length,
    pausedFrames: sample.frames.filter(frame => frame.paused).length,
    advancedSeconds: Math.round(((sample.frames.at(-1)?.currentTime ?? 0) - (sample.frames[0]?.currentTime ?? 0)) * 100) / 100,
    playbackRate: sample.frames.at(-1)?.rate ?? null,
    rafP50Ms: Math.round(at(0.5) * 10) / 10, rafP95Ms: Math.round(at(0.95) * 10) / 10,
    rafP99Ms: Math.round(at(0.99) * 10) / 10, rafMaxMs: Math.round((deltas.at(-1) ?? 0) * 10) / 10,
    rafOver25: deltas.filter(value => value > 25).length, rafOver50: deltas.filter(value => value > 50).length,
    longTasksMs: sample.longTasks.map(value => Math.round(value * 10) / 10),
    progressWrites: writes.length,
    progressWriteIntervalP50Ms: sortedWrites.length ? Math.round(sortedWrites[Math.floor(sortedWrites.length / 2)] * 10) / 10 : null,
    progressWriteIntervalMaxMs: sortedWrites.length ? Math.round(sortedWrites.at(-1) * 10) / 10 : null,
    progressLagP50Ms: Math.round(lagAt(0.5) * 10) / 10, progressLagP95Ms: Math.round(lagAt(0.95) * 10) / 10,
    progressLagMaxMs: Math.round((lags.at(-1) ?? 0) * 10) / 10,
    progressTargetLagP50Ms: targetAt(0.5), progressTargetLagP95Ms: targetAt(0.95),
    progressTargetLagMaxMs: Math.round((targets.at(-1) ?? 0) * 10) / 10,
    progressFrozenFrames: frozen, progressLongestFrozenMs: Math.round(frozenMax * 10) / 10,
    captureIntervals: intervals(sample.captures), presentedIntervals: intervals(sample.presented),
    captures: sample.captures.length, presented: sample.presented.length,
    interpolationToggles: sample.toggles.length, pendingFrames: sample.frames.filter(frame => frame.pending).length,
    droppedVideoFrames: sample.droppedVideoFrames, totalVideoFrames: sample.totalVideoFrames,
    excerpt: sample.frames.slice(0, 12).map(frame => ({ delta: Math.round(frame.delta * 10) / 10,
      currentTime: Math.round(frame.currentTime * 1000) / 1000, fraction: Math.round(frame.fraction * 10000) / 10000,
      styleWidth: frame.styleWidth, paused: frame.paused })) }
}

test('progress bar, scrub latency and playback smoothness stay within budget', { timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const report = {}
    const failures = []
    const scenarios = [
      ['control', { frameRate: 'off', quality: 'off' }],
      ['enhancement-only', { frameRate: 'off', quality: 'sharp' }],
      ['interpolation', { frameRate: 60, quality: 'off' }],
      ['interpolation-sharp', { frameRate: 60, quality: 'sharp' }],
    ]
    for (const [name, preferences] of scenarios) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const pageErrors = []
      page.on('pageerror', error => pageErrors.push(String(error)))
      try {
        const requests = await openPlayer(page, preferences)
        // 画质与补帧都由渲染 Worker 的增强画布承载：采样前先等它生效，窗口内不再计入首次点亮。
        if (preferences.frameRate !== 'off' || preferences.quality !== 'off') {
          await page.waitForSelector('.sanye-realtime-interpolation-active', { timeout: 20000 })
        }
        await page.waitForTimeout(700)
        const seconds = preferences.frameRate === 'off' ? 3 : 5
        const sample = summarize(await sampleWindow(page, seconds), seconds)
        await positionAt(page, 0.15)
        const seeks = [await scrub(page, 0.2, 0.7), await scrub(page, 0.7, 0.25), await scrub(page, 0.25, 0.9)]
        report[name] = { preferences, sample, seeks, pageErrors, fragmentRequests: requests.length }
        await page.screenshot({ path: path.join(output, `progress-${name}.png`) })
      } catch (error) {
        report[name] = { preferences, harnessError: String(error), pageErrors }
        failures.push(`${name}：${error}`)
      } finally { await page.close() }
    }
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    assert.deepEqual(failures, [], '测量入口必须完成每个场景')
    for (const [name, result] of Object.entries(report)) {
      const { sample, seeks } = result
      const interpolated = result.preferences.frameRate !== 'off'
      assert.ok(sample.progressWrites >= sample.frames * 0.8,
        `${name}：进度条只在 ${sample.progressWrites}/${sample.frames} 个渲染帧上更新`)
      // 进度条应跟随页面自身的渲染节奏；阈值随该场景实测的最长帧放宽，避免把环境帧率当成本次缺陷。
      const frameBoundMs = Math.max(80, sample.rafMaxMs * 1.5)
      assert.ok(sample.progressWriteIntervalMaxMs <= frameBoundMs,
        `${name}：进度条写入最长间隔 ${sample.progressWriteIntervalMaxMs} 毫秒，超过 ${Math.round(frameBoundMs)} 毫秒`)
      assert.ok(sample.progressLongestFrozenMs <= Math.max(45, sample.rafMaxMs),
        `${name}：进度条最长静止 ${sample.progressLongestFrozenMs} 毫秒`)
      assert.ok(sample.progressTargetLagP95Ms <= 60,
        `${name}：进度条目标位置滞后 P95 ${sample.progressTargetLagP95Ms} 毫秒`)
      assert.equal(sample.pausedFrames, 0, `${name}：采样窗口内必须持续播放`)
      assert.ok(sample.advancedSeconds >= sample.seconds * 0.8,
        `${name}：采样窗口只前进了 ${sample.advancedSeconds} 秒`)
      assert.equal(sample.interpolationToggles, 0, `${name}：稳定播放期间补帧层不应反复切换`)
      assert.deepEqual(result.pageErrors, [], `${name}：页面不应有未捕获错误`)
      if (interpolated) {
        // 增强在渲染 Worker 内执行时，主线程不应出现增强处理造成的长任务。
        assert.deepEqual(sample.longTasksMs, [], `${name}：补帧与增强同开时主线程不应出现长任务`)
      }
      assert.ok(seeks.every(seek => seek.grabbed), `${name}：拖动必须先命中进度条`)
      assert.ok(seeks.every(seek => seek.seekingMs !== null && seek.seekingMs <= 60),
        `${name}：松开到进入定位超过 60 毫秒：${JSON.stringify(seeks.map(seek => seek.seekingMs))}`)
      assert.ok(seeks.every(seek => seek.seekedMs !== null && seek.seekedMs <= 350),
        `${name}：定位完成超过 350 毫秒：${JSON.stringify(seeks.map(seek => seek.seekedMs))}`)
      if (interpolated) {
        assert.ok(seeks.every(seek => seek.activeMs !== null && seek.activeMs <= 1200),
          `${name}：补帧层恢复超过 1200 毫秒：${JSON.stringify(seeks.map(seek => seek.activeMs))}`)
      }
    }
  } finally { await browser.close() }
})
