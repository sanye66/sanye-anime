const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/interpolation-delay')
const hlsDirectory = path.resolve(__dirname, '../sanye_deploy/.local/seek-performance')
const hlsPlaylist = path.join(hlsDirectory, 'stream.m3u8')

/** 受控 HLS 夹具：640×360、30 FPS、12 秒、六段两秒分片，带音频用于核对音画延迟跟随。 */
before(async () => {
  await fsp.mkdir(output, { recursive: true })
  try {
    await fsp.access(hlsPlaylist)
    return
  } catch {}
  await fsp.mkdir(hlsDirectory, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    await page.exposeFunction('saveMedia', async (name, bytes) => {
      await fsp.writeFile(path.join(hlsDirectory, name), Buffer.from(bytes))
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
}, { timeout: 300000 })

/** 直接加载判定模块，用固定时间线复现语义；浏览器不可用或无 GPU 时仍可执行。 */
function loadPolicy() {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/interpolationDelayPolicy.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports.InterpolationDelayPolicy
}

const cleanWindow = (nowMs, neededMs) => ({ nowMs, neededMs, missedPairs: 0, stallFrames: 0, rewinds: 0 })

test('the delay starts at the smallest usable window and only grows before the canvas takes over', () => {
  const Policy = loadPolicy()
  const policy = new Policy()
  // 30 FPS 源的起播下限是两个源帧间隔：原画窗口不再固定等满 150ms。
  assert.equal(policy.beginEpoch(0, 1000 / 30), 66.66666666666667)
  assert.equal(policy.startMs, policy.effectiveMs)
  // 窗口覆盖不到目标时刻时按实测需要加宽，并保持单调不减。
  const widened = policy.widenTo(20, 96, 1000 / 30)
  assert.equal(widened, 96)
  assert.ok(policy.widenTo(40, 10, 1000 / 30) >= widened, '未覆盖窗口时不得反向收缩')
  // 会话上限固定，任何加宽都不得越过固定延迟口径。
  assert.equal(policy.widenTo(60, 400, 1000 / 30), policy.nominalMs)
  assert.equal(policy.nominalMs, 150)
  assert.equal(policy.floorMs, 66.66666666666667)
})

test('a stalled or rewinding window defers the restore to the next playback segment', () => {
  const Policy = loadPolicy()
  const policy = new Policy()
  policy.beginEpoch(0, 1000 / 30)
  const widened = policy.widenTo(10, 100, 1000 / 30)
  assert.equal(widened, 100)
  // 播放段首个窗口是预热窗口：起播与定位后的首帧间隔还不稳定，不据此登记压力。
  assert.equal(policy.observeWindow({ nowMs: 600, neededMs: 20, missedPairs: 5, stallFrames: 4, rewinds: 0 }), 'hold')
  assert.equal(policy.pendingRestore, false, '预热窗口不得登记恢复')
  assert.equal(policy.effectiveMs, 100)
  assert.equal(policy.observeWindow({ nowMs: 1200, neededMs: 20, missedPairs: 0, stallFrames: 1, rewinds: 0 }), 'hold')
  assert.equal(policy.effectiveMs, 100, '停顿窗口内不得改变延迟')
  assert.equal(policy.pendingRestore, true)
  assert.equal(policy.observeWindow({ nowMs: 2400, neededMs: 20, missedPairs: 3, stallFrames: 0, rewinds: 0 }), 'hold')
  assert.equal(policy.effectiveMs, 100, '未命中配对的窗口同样不得改变延迟')
  // 恢复只在下一个播放段起点发生，且每次只走一步。
  assert.equal(policy.beginEpoch(3600, 1000 / 30), 140)
  assert.equal(policy.pendingRestore, false)
  assert.equal(policy.beginEpoch(7200, 1000 / 30), 140, '没有新的压力时不继续加宽')
})

test('sustained stalls restore margin in-epoch while advancing playback never rewinds', () => {
  const Policy = loadPolicy()
  const policy = new Policy()
  policy.beginEpoch(0, 1000 / 30)
  assert.equal(policy.effectiveMs, 66.66666666666667)
  // 冷却窗口内不得立即恢复。
  assert.equal(policy.widenInEpoch(300, 120, 1000 / 30), 66.66666666666667)
  // 冷却过后按实测需要恢复一步。
  assert.equal(policy.widenInEpoch(1200, 120, 1000 / 30), 120)
  assert.equal(policy.inEpochRestores, 1)
  // 继续停顿按步长推进，且不超过会话上限。
  assert.equal(policy.widenInEpoch(2400, 400, 1000 / 30), 150)
  assert.equal(policy.widenInEpoch(3600, 400, 1000 / 30), 150, '到达会话上限后不再变化')
  assert.equal(policy.snapshot(true).restores, policy.inEpochRestores, '播放段内恢复与起点恢复分开计数')
})

test('headroom shrinks the delay by one step per clean window down to the floor', () => {
  const Policy = loadPolicy()
  const policy = new Policy()
  policy.beginEpoch(0, 1000 / 30)
  policy.widenTo(0, 150, 1000 / 30)
  assert.equal(policy.effectiveMs, 150)
  const timeline = []
  let now = 1000
  for (let window = 0; window < 12; window++) {
    const action = policy.observeWindow(cleanWindow(now, 30))
    timeline.push({ now, action, effectiveMs: policy.effectiveMs })
    now += 1000
  }
  const shrinks = timeline.filter(entry => entry.action === 'shrink')
  assert.ok(shrinks.length >= 3, `连续有余量时应逐步收缩：${JSON.stringify(timeline)}`)
  // 每次只走一步且绝不越过下限；收缩是冷却是 1000ms，两次收缩之间留出完整窗口。
  for (let index = 1; index < shrinks.length; index++)
    assert.ok(shrinks[index - 1].effectiveMs - shrinks[index].effectiveMs <= policy.shrinkStepMs
      && shrinks[index].effectiveMs < shrinks[index - 1].effectiveMs,
    `每步收缩不得超过一个步长：${JSON.stringify(shrinks)}`)
  assert.ok(timeline.every(entry => entry.effectiveMs >= policy.floorMs))
  assert.equal(policy.effectiveMs, policy.floorMs, '有余量时最终收敛到最小可用窗口')
  assert.equal(policy.restores, 0, '稳定播放期不得出现会拉回画面的加宽')
})

/**
 * 挂载外部预览播放器：记录播放/补间层时刻、渲染 Worker 上报的延迟快照，并服务本地 HLS 分片。
 * `interpolationDelay` 为 `fixed` 时是固定 150ms 的对照，为 `adaptive` 时是本次优化。
 */
async function openScenario(browser, interpolationDelay) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(String(error)))
  await page.addInitScript(preferences => {
    localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify(preferences))
    const marks = []
    const seen = {}
    window.__delayMarks = marks
    window.__delayMessages = []
    const record = (key, name) => {
      if (seen[key]) return
      seen[key] = true
      const video = document.querySelector('video')
      marks.push({ name, at: Math.round((performance.timeOrigin + performance.now()) * 10) / 10,
        mediaTime: video ? Math.round(video.currentTime * 1000) / 1000 : null })
    }
    const step = () => {
      const video = document.querySelector('video')
      const host = document.querySelector('.art-video-player')
      if (video) {
        if (video.readyState >= 2) record('ready', 'ready-data')
        if (!video.paused && video.currentTime > 0) record('playing', 'playing')
        if (host?.classList.contains('sanye-realtime-interpolation-active')) record('active', 'interpolation-active')
      }
      if (!seen.active) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    const nativeCreateDelay = AudioContext.prototype.createDelay
    AudioContext.prototype.createDelay = function (...args) {
      const node = nativeCreateDelay.apply(this, args)
      window.__delayNode = node
      return node
    }
    const NativeWorker = window.Worker
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args)
        if (String(args[0]).includes('interpolationRenderer')) this.addEventListener('message', ({ data }) => {
          const host = document.querySelector('.art-video-player')
          window.__delayMessages.push({ type: data.type, active: data.active ?? null, delayMs: data.delayMs ?? null,
            at: Math.round((performance.timeOrigin + performance.now()) * 10) / 10, stats: data.stats ?? null,
            // 音画同步门禁直接读实际生效的音频延迟节点，而不是页面回填后的统计字段；
            // `pageActive` 取页面自身接受的呈现状态，避免把因代次不符被丢弃的旧消息计入门禁。
            audioDelayMs: window.__delayNode ? window.__delayNode.delayTime.value * 1000 : null,
            pageActive: host ? host.classList.contains('sanye-realtime-interpolation-active') : false })
        })
      }
    }
  }, { frameRate: 60, quality: 'off', interpolationDelay })
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
  await page.route('**/api/v1/anime/external-preview?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
    title: '补帧延迟测量', originalTitle: '', type: '电影', tags: [],
    episodes: [{ id: 901, episodeNo: 1, title: '测试片段', playbackUrl: `${origin}/seek-hls/stream.m3u8`,
      mimeType: 'application/vnd.apple.mpegurl' }] } } }))
  await page.route('**/seek-hls/*', route => {
    const name = path.basename(new URL(route.request().url()).pathname)
    return route.fulfill({ path: path.join(hlsDirectory, name),
      contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
      headers: { 'Cache-Control': 'max-age=600' } })
  })
  await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/seek-hls/stream.m3u8`)}`)
  await page.waitForFunction(() => window.__delayMarks.some(mark => mark.name === 'interpolation-active'),
    null, { timeout: 30000 })
  return { page, pageErrors }
}

/** 统计起播时间线、激活时刻的延迟与窗口内的延迟快照。 */
async function readStartup(page) {
  return page.evaluate(() => {
    const marks = window.__delayMarks
    const at = name => marks.find(mark => mark.name === name) ?? null
    const stats = window.__delayMessages.filter(message => message.stats)
      .map(message => ({ ...message.stats, audioDelayMs: message.audioDelayMs, pageActive: message.pageActive }))
    const activation = window.__delayMessages.find(message => message.type === 'active' && message.active)
    // 只统计页面真正接管呈现的窗口：暂停、定位缓冲期间音频延迟为 0，不属于音画偏差。
    const active = stats.filter(value => value.interpolationDelay?.active && value.pageActive)
    const drift = active.map(value => Math.abs(value.audioDelayMs - value.interpolationDelay.effectiveMs))
    const playback = at('playing'), ready = at('ready-data'), interpolation = at('interpolation-active')
    return { marks, stats, activationDelayMs: activation?.delayMs ?? null,
      audioDelayMs: active.map(value => Math.round(value.audioDelayMs * 10) / 10),
      effectiveMs: active.map(value => value.interpolationDelay.effectiveMs),
      startMs: active.map(value => value.interpolationDelay.startMs),
      awaitingMs: stats.map(value => value.interpolationDelay?.awaitingMs ?? null).filter(value => value !== null),
      rewinds: stats.reduce((total, value) => total + (value.interpolationDelay?.rewinds ?? 0), 0),
      resumeRewinds: stats.reduce((total, value) => total + (value.interpolationDelay?.resumeRewinds ?? 0), 0),
      rewindMaxMs: stats.reduce((max, value) => Math.max(max, value.interpolationDelay?.rewindMaxMs ?? 0), 0),
      recoveryWindows: stats.filter(value => (value.interpolationDelay?.resumeRewinds ?? 0) > 0)
        .map(value => ({ stallFrames: value.stallFrames, missedPairs: value.missedPairs,
          effectiveMs: value.interpolationDelay.effectiveMs })),
      missedPairs: stats.reduce((total, value) => total + value.missedPairs, 0),
      stallFrames: stats.reduce((total, value) => total + value.stallFrames, 0),
      maxDriftMs: drift.length ? Math.round(Math.max(...drift) * 10) / 10 : null,
      interpolatedFrames: stats.reduce((total, value) => total + value.interpolatedFrames, 0),
      output: stats.at(-1) ? [stats.at(-1).outputWidth, stats.at(-1).outputHeight] : null,
      windows: stats.length, activeWindows: active.length,
      profile: stats.at(-1)?.effectiveProfile ?? null,
      rawWindowMs: playback && interpolation ? Math.round((interpolation.at - playback.at) * 10) / 10 : null,
      rawWindowMediaSeconds: playback && interpolation
        ? Math.round((interpolation.mediaTime - playback.mediaTime) * 1000) / 1000 : null }
  })
}

/** 拖动进度条定位：记录松开到补间层恢复的时长，以及恢复时的延迟快照。 */
async function seekAndMeasure(page, fromFraction, toFraction) {
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
    window.seekObserver = new MutationObserver(() => marks.push({
      name: player.classList.contains('sanye-realtime-interpolation-active') ? 'active-on' : 'active-off',
      t: performance.now() }))
    window.seekObserver.observe(player, { attributes: true, attributeFilter: ['class'] })
    video.addEventListener('seeking', () => marks.push({ name: 'seeking', t: performance.now() }), { once: true })
    video.addEventListener('seeked', () => marks.push({ name: 'seeked', t: performance.now() }), { once: true })
    window.__delayMessages.length = 0
  })
  await page.mouse.move(box.x + box.width * fromFraction, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * toFraction, box.y + box.height / 2, { steps: 12 })
  await page.evaluate(() => { window.releaseAt = performance.now() })
  await page.mouse.up()
  let settled = true
  try {
    await page.waitForFunction(() => {
      const marks = window.seekMarks ?? []
      const video = document.querySelector('video')
      return marks.some(mark => mark.name === 'seeked') && !video.seeking && video.readyState >= 2
    }, null, { timeout: 15000 })
    await page.waitForFunction(() => document.querySelector('.art-video-player')
      ?.classList.contains('sanye-realtime-interpolation-active'), null, { timeout: 15000 })
  } catch { settled = false }
  return page.evaluate(settled => {
    const marks = window.seekMarks
    const released = window.releaseAt ?? null
    const since = name => {
      const mark = marks.find(entry => entry.name === name)
      return mark && released !== null ? Math.round((mark.t - released) * 10) / 10 : null
    }
    const afterRelease = marks.filter(mark => released !== null && mark.t >= released)
    const lastOff = afterRelease.filter(mark => mark.name === 'active-off').at(-1)
    const resumed = (lastOff ? marks.filter(mark => mark.t > lastOff.t) : afterRelease)
      .find(mark => mark.name === 'active-on')
    const activation = window.__delayMessages.find(message => message.type === 'active' && message.active)
    const stats = window.__delayMessages.filter(message => message.stats)
      .map(message => ({ ...message.stats, audioDelayMs: message.audioDelayMs, pageActive: message.pageActive }))
    const active = stats.filter(value => value.interpolationDelay?.active && value.pageActive)
    const drift = active.map(value => Math.abs(value.audioDelayMs - value.interpolationDelay.effectiveMs))
    return { settled, seekingMs: since('seeking'), seekedMs: since('seeked'),
      activeMs: resumed ? Math.round((resumed.t - released) * 10) / 10 : null,
      activationDelayMs: activation?.delayMs ?? null,
      awaitingMs: stats.map(value => value.interpolationDelay?.awaitingMs ?? null).filter(value => value !== null),
      stats,
      rewinds: stats.reduce((total, value) => total + (value.interpolationDelay?.rewinds ?? 0), 0),
      resumeRewinds: stats.reduce((total, value) => total + (value.interpolationDelay?.resumeRewinds ?? 0), 0),
      maxDriftMs: drift.length ? Math.round(Math.max(...drift) * 10) / 10 : null,
      interpolatedFrames: stats.reduce((total, value) => total + value.interpolatedFrames, 0),
      target: document.querySelector('video').currentTime }
  }, settled)
}

test('adaptive delay shortens the raw window at start and after seek without back-jumps', { timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const report = { fixed: [], adaptive: [] }
    const seeks = [[0.2, 0.7], [0.7, 0.25], [0.25, 0.9]]
    for (const mode of ['fixed', 'adaptive']) {
      // 起播窗口受播放器元素起播抖动影响，单次对照噪声可达几十毫秒；每种口径跑三轮取中位数比较。
      for (let round = 0; round < 3; round++) {
        const { page, pageErrors } = await openScenario(browser, mode)
        try {
          const startup = await readStartup(page)
          // 稳定播放 4 秒后开始定位：这段窗口用于核对音画延迟跟随与画面回跳。
          await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 4, null, { timeout: 30000 })
          const stable = await readStartup(page)
          const seekResults = []
          for (const [from, to] of seeks) {
            seekResults.push(await seekAndMeasure(page, from, to))
            // 渲染 Worker 每满一秒上报一个统计窗口；窗口从本次播放段重新计时，留出完整周期再拖动下一次。
            await page.waitForTimeout(1800)
          }
          const resumed = await readStartup(page)
          if (round === 0) await page.screenshot({ path: path.join(output, `delay-${mode}.png`) })
          report[mode].push({ startup, stable, seeks: seekResults, resumed, pageErrors })
        } finally { await page.close() }
      }
    }
    await fsp.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    const median = values => {
      const sorted = [...values].filter(value => value !== null && Number.isFinite(value)).sort((a, b) => a - b)
      return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
    }
    /** 单轮指标：起播窗口、三轮拖动中位数、逐窗口门禁与输出来自同一轮次。 */
    const summarizeRun = (result, round) => {
      const seekActive = result.seeks.map(seek => seek.activeMs)
      const laterStats = result.seeks.flatMap(seek => seek.stats)
      const ready = result.startup.marks.find(mark => mark.name === 'ready-data')
      const active = result.startup.marks.find(mark => mark.name === 'interpolation-active')
      return { round,
        startupRawWindowMs: result.startup.rawWindowMs,
        startupRawWindowFromReadyMs: ready && active ? Math.round((active.at - ready.at) * 10) / 10 : null,
        startupActivationDelayMs: result.startup.activationDelayMs,
        // 起播窗口的首帧到补间层就绪时长由本播放段的统计窗口上报，因此从稳定段快照读取。
        startupAwaitingMs: result.stable.awaitingMs.at(-1) ?? null,
        changes: result.stable.stats.at(-1)?.interpolationDelay.changes ?? null,
        widens: result.stable.stats.at(-1)?.interpolationDelay.widens ?? null,
        shrinks: result.stable.stats.at(-1)?.interpolationDelay.shrinks ?? null,
        restores: result.stable.stats.at(-1)?.interpolationDelay.restores ?? null,
        stableEffectiveMs: result.stable.effectiveMs.slice(-1)[0] ?? null,
        stableRewinds: result.stable.rewinds, stableRewindMaxMs: result.stable.rewindMaxMs,
        stableResumeRewinds: result.stable.resumeRewinds,
        stableRecoveryWindows: result.stable.recoveryWindows,
        stableMaxDriftMs: result.stable.maxDriftMs, stableAudioDelayMs: result.stable.audioDelayMs,
        missedPairs: [result.startup.missedPairs, result.stable.missedPairs, result.resumed.missedPairs],
        stallFrames: [result.startup.stallFrames, result.stable.stallFrames, result.resumed.stallFrames],
        seekActiveMs: seekActive, seekActiveMedianMs: median(seekActive),
        seekAwaitingMs: result.seeks.map(seek => seek.awaitingMs.at(-1) ?? null),
        seekActivationDelayMs: result.seeks.map(seek => seek.activationDelayMs),
        seekSettled: result.seeks.map(seek => seek.settled),
        seekRewinds: result.seeks.reduce((total, seek) => total + seek.rewinds, 0),
        seekResumeRewinds: result.seeks.reduce((total, seek) => total + seek.resumeRewinds, 0),
        seekMaxDriftMs: Math.max(...result.seeks.map(seek => seek.maxDriftMs ?? 0)),
        seekMissedPairs: laterStats.reduce((total, value) => total + value.missedPairs, 0),
        interpolatedFrames: result.startup.interpolatedFrames + result.stable.interpolatedFrames
          + laterStats.reduce((total, value) => total + value.interpolatedFrames, 0) + result.resumed.interpolatedFrames,
        output: result.stable.output, profile: result.stable.profile }
    }
    const summary = {}
    for (const mode of ['fixed', 'adaptive']) {
      const rounds = report[mode].map(summarizeRun)
      summary[mode] = { rounds,
        startupAwaitingMedianMs: median(rounds.map(round => round.startupAwaitingMs)),
        startupRawWindowMedianMs: median(rounds.map(round => round.startupRawWindowFromReadyMs)),
        seekActiveMedianMs: median(rounds.map(round => round.seekActiveMedianMs)),
        activationDelayMs: median(rounds.map(round => round.startupActivationDelayMs)),
        maxDriftMs: Math.max(...rounds.map(round => Math.max(round.stableMaxDriftMs ?? 0, round.seekMaxDriftMs ?? 0))),
        rewinds: rounds.reduce((total, round) => total + round.stableRewinds + round.seekRewinds, 0),
        resumeRewinds: rounds.reduce((total, round) => total + round.stableResumeRewinds + round.seekResumeRewinds, 0),
        restores: rounds.reduce((total, round) => total + (round.restores ?? 0), 0),
        interpolatedFrames: rounds.reduce((total, round) => total + round.interpolatedFrames, 0),
        output: rounds.at(-1).output, profile: rounds.at(-1).profile }
      console.log('INTERPOLATION_DELAY', mode, JSON.stringify(summary[mode]))
    }
    await fsp.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2))
    for (const [mode, rounds] of Object.entries(report))
      rounds.forEach((result, index) => assert.deepEqual(result.pageErrors, [], `${mode} 第 ${index + 1} 轮：页面不应有未捕获错误`))

    const fixed = summary.fixed, adaptive = summary.adaptive
    // 对照必须仍然等窗口填满：起播与每次定位恢复都固定 150ms。
    assert.equal(fixed.activationDelayMs, 150, '固定延迟对照的起播延迟必须保持 150ms')
    assert.ok(fixed.rounds.every(round => round.stableEffectiveMs === 150), '固定延迟对照必须保持 150ms')
    assert.ok(fixed.rounds.every(round => round.seekActivationDelayMs.every(value => value === 150)),
      `固定延迟对照定位恢复必须保持 150ms：${JSON.stringify(fixed.rounds.map(round => round.seekActivationDelayMs))}`)
    assert.ok(fixed.startupAwaitingMedianMs >= 150,
      `固定延迟对照的首帧到补间层就绪时长应在 150ms 以上，实际 ${fixed.startupAwaitingMedianMs}ms`)
    // 优化：起播延迟按实测需要收缩，原画窗口随之缩短，但仍不早于音画同步允许范围。
    assert.ok(adaptive.activationDelayMs > 0 && adaptive.activationDelayMs < 150,
      `起播时生效延迟必须收缩到 150ms 以内，实际 ${adaptive.activationDelayMs}ms`)
    assert.ok(adaptive.startupAwaitingMedianMs <= fixed.startupAwaitingMedianMs - 40,
      `自适应首帧到补间层就绪时长（三轮中位数）应比固定延迟至少快 40ms：自适应 ${adaptive.startupAwaitingMedianMs}ms，固定 ${fixed.startupAwaitingMedianMs}ms`)
    // 定位后原画窗口同步缩短，且恢复时同样使用收缩后的延迟。
    assert.ok(adaptive.rounds.every(round => round.seekSettled.every(Boolean)), '每次拖动都必须完成定位并恢复补间层')
    assert.ok(adaptive.seekActiveMedianMs <= fixed.seekActiveMedianMs - 40,
      `定位后原画窗口中位数应同步缩短：自适应 ${adaptive.seekActiveMedianMs}ms，固定 ${fixed.seekActiveMedianMs}ms`)
    // 定位恢复的生效延迟必须落在 [下限, 会话上限] 内；负载下先恢复余量时允许回到 150ms。
    assert.ok(adaptive.rounds.every(round => round.seekActivationDelayMs.every(value => value > 0 && value <= 150)),
      `定位恢复时的生效延迟必须落在会话上限以内：${JSON.stringify(adaptive.rounds.map(round => round.seekActivationDelayMs))}`)
    assert.ok(adaptive.rounds.every(round => round.startupActivationDelayMs > 0 && round.startupActivationDelayMs < 150),
      `每次起播的生效延迟都必须收缩到 150ms 以内：${JSON.stringify(adaptive.rounds.map(round => round.startupActivationDelayMs))}`)
    // 稳定段与定位后都不得出现画面回跳，音频延迟跟随视频延迟。
    assert.equal(adaptive.rewinds, 0, '正常推进期间（稳定播放与定位恢复）都不得出现画面回跳')
    // 只有“目标越过最新源帧”的停顿窗口才允许恢复余量，且恢复带来的回退单独计数、次数不超过恢复次数。
    const recoveryWindows = adaptive.rounds.flatMap(round => round.stableRecoveryWindows)
    assert.ok(recoveryWindows.every(window => window.stallFrames > 0 || window.missedPairs > 0),
      `恢复余量只允许发生在已经停顿的窗口：${JSON.stringify(recoveryWindows)}`)
    assert.ok(adaptive.resumeRewinds <= adaptive.restores,
      `恢复余量造成的回退不得超过恢复次数：${adaptive.resumeRewinds} 次回退 / ${adaptive.restores} 次恢复`)
    assert.ok(adaptive.rounds.every(round => round.stableEffectiveMs <= 150),
      `自适应延迟不得超过会话上限：${JSON.stringify(adaptive.rounds.map(round => round.stableEffectiveMs))}`)
    assert.ok(adaptive.maxDriftMs !== null && adaptive.maxDriftMs <= 40,
      `稳定段与定位后的音画绝对偏差必须 ≤ 40ms，实际 ${adaptive.maxDriftMs}ms`)
    // 补帧本身没有被延迟优化替换：30 FPS 源在 60 目标下仍要产出合成帧，输出尺寸与档位不变。
    assert.ok(adaptive.interpolatedFrames > 0, '自适应延迟下仍必须生成补间帧')
    assert.deepEqual(adaptive.output, fixed.output, '输出尺寸必须与固定延迟一致')
    assert.equal(adaptive.profile, fixed.profile, '生效画质档位必须与固定延迟一致')
  } finally { await browser.close() }
})
