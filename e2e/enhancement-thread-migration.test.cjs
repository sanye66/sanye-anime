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
const output = path.resolve(__dirname, '../sanye_deploy/.local/enhancement-thread')
const hlsDirectory = path.join(output, 'media')
const hlsPlaylist = path.join(hlsDirectory, 'stream.m3u8')
const profiles = ['fast', 'balanced', 'sharp', 'restore', 'upscale']

/** 直接驱动判定模块：仅增强路径必须固定在“不执行补帧”，且不受源帧率影响。 */
function loadDemandPolicy() {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/interpolationDemandPolicy.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports.InterpolationDemandPolicy
}

/** 本地 HLS 夹具：30 FPS、六段两秒分片，用于真实播放链路上的主线程占用测量。 */
before(async () => {
  await fsp.mkdir(hlsDirectory, { recursive: true })
  try {
    await fsp.access(hlsPlaylist)
    return
  } catch {}
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
}, { timeout: 240000 })

/** 主线程路径与渲染 Worker 的增强链路必须是同一条：档位链路只有一个定义位置。 */
test('the main-thread path and the worker path share one profile chain definition', () => {
  const runtime = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/anime4kRuntime.ts'), 'utf8')
  const enhancer = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/frameEnhancer.ts'), 'utf8')
  assert.match(runtime, /import \{ profileShaderChain \} from '\.\/frameEnhancer'/,
    '主线程 anime4k.js 路径必须复用渲染 Worker 的档位链路定义')
  assert.doesNotMatch(runtime, /Anime4K_(Deblur|Restore|Upscale|Clamp)/,
    '主线程路径不得再维护第二份档位链路，否则两条路径会漂移')
  for (const shader of ['Anime4K_Deblur_DoG', 'Anime4K_Clamp_Highlights', 'Anime4K_Restore_CNN_S',
    'Anime4K_Restore_CNN_M', 'Anime4K_Upscale_CNN_x2_S']) {
    assert.ok(enhancer.includes(shader), `档位链路缺少 ${shader}`)
  }
})

test('the enhancement-only mode never schedules flow analysis', () => {
  const Policy = loadDemandPolicy()
  const policy = new Policy({ forceBypass: true })
  let now = 0
  const modes = []
  // 源帧率从 24 到 120 都不能让仅增强路径重新开启补帧。
  for (const sourceFps of [24, 30, 55, 60, 120, 24, 60]) {
    for (let index = 0; index < 90; index++) {
      now += 1000 / 60
      modes.push(policy.observe({ nowMs: now, sourceFps, targetFps: 60 }))
    }
  }
  assert.ok(modes.every(mode => mode === 'none'), '仅增强路径不得执行光流补帧')
  assert.equal(policy.reason, '仅增强路径：不执行补帧')
  assert.equal(policy.snapshot(60).transitions, 0, '固定模式不应产生模式变化')
  assert.equal(policy.snapshot(60).forced, false)
})

/**
 * 同源同输出尺寸的像素对照：同一张源帧交给「主线程 anime4k.js 单帧管线」与「渲染 Worker 使用的渲染器」，
 * 逐字节比较两侧输出。执行位置变化不得改变像素，否则按 VQ-28 不采纳。
 */
test('the render worker reproduces the main-thread anime4k.js output for every profile', { timeout: 240000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async profiles => {
      const { ImageUpscaler } = await import('/node_modules/anime4k.js/dist/index.mjs')
      const { profileShaderChain } = await import('/src/video/frameEnhancer.ts')
      const { MotionRenderer } = await import('/src/video/motionRenderer.ts')
      const width = 320, height = 180
      // 受控源帧：平坦色块 + 硬边线条 + 渐变，覆盖恢复网络对边缘与平坦区的处理差异。
      const source = new OffscreenCanvas(width, height)
      const context = source.getContext('2d')
      const gradient = context.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#101828'); gradient.addColorStop(1, '#e8eef8')
      context.fillStyle = gradient; context.fillRect(0, 0, width, height)
      context.fillStyle = '#0b1220'; context.fillRect(16, 16, 96, 64)
      context.fillStyle = '#f7f9ff'; context.fillRect(128, 24, 160, 48)
      context.strokeStyle = '#ffffff'; context.lineWidth = 2
      for (let x = 8; x < width; x += 24) { context.beginPath(); context.moveTo(x, 104); context.lineTo(x + 12, 168); context.stroke() }
      context.fillStyle = '#ff5c33'; context.beginPath()
      context.arc(240, 140, 22, 0, Math.PI * 2); context.fill()
      const bitmap = await createImageBitmap(source)
      const read = (gl, w, h) => {
        const pixels = new Uint8Array(w * h * 4)
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        return pixels
      }
      const results = {}
      for (const profile of profiles) {
        const chain = profileShaderChain(profile)
        // 参照：anime4k.js 自带的单帧管线；与主线程 `VideoUpscaler` 使用同一套着色器与 hook 顺序。
        const referenceCanvas = document.createElement('canvas')
        const reference = new ImageUpscaler(chain)
        reference.attachSource(bitmap, referenceCanvas)
        reference.upscale()
        const referencePixels = read(referenceCanvas.getContext('webgl'), referenceCanvas.width, referenceCanvas.height)
        // 候选：渲染 Worker 内的同一渲染器（`setEnhancementProfile` 就是仅增强路径的入口）。
        const candidateCanvas = document.createElement('canvas')
        const renderer = new MotionRenderer(candidateCanvas, 0, false)
        renderer.setEnhancementProfile(profile, 0)
        const failure = renderer.enhancementFailure
        const still = { width: 1, height: 1, data: new Float32Array(4), sceneCut: false }
        const frame = renderer.upload(bitmap, 0, still, true)
        renderer.render(frame, frame, 1, true)
        const candidatePixels = read(renderer.gl, candidateCanvas.width, candidateCanvas.height)
        /**
         * 只按可见 RGB 判定像素一致性：播放画面是不透明的视频帧，alpha 不参与呈现。
         * `Deblur_DoG` 本身不写 alpha，两条路径的最终装配（库的平滑渲染 vs 纹理拷贝）对 alpha 的处理
         * 略有差别，因此单独记录而不是混进画质结论。
         */
        let differing = 0, maxDelta = 0, totalDelta = 0, alphaDiffering = 0, alphaMaxDelta = 0
        const samples = []
        const channels = Math.min(referencePixels.length, candidatePixels.length)
        for (let index = 0; index < channels; index++) {
          const delta = Math.abs(referencePixels[index] - candidatePixels[index])
          if (index % 4 === 3) {
            if (delta > 0) alphaDiffering++
            if (delta > alphaMaxDelta) alphaMaxDelta = delta
            continue
          }
          totalDelta += delta
          if (delta > maxDelta) maxDelta = delta
          if (delta > 0) {
            differing++
            if (samples.length < 8) {
              const pixel = index >> 2
              samples.push({ x: pixel % candidateCanvas.width, y: Math.floor(pixel / candidateCanvas.width), channel: index % 4,
                reference: referencePixels[index], candidate: candidatePixels[index], delta })
            }
          }
        }
        const compared = (channels / 4) * 3
        results[profile] = { failure,
          reference: { width: referenceCanvas.width, height: referenceCanvas.height },
          candidate: { width: candidateCanvas.width, height: candidateCanvas.height },
          rgbChannelsCompared: compared,
          meanAbsDelta: Math.round(totalDelta / compared * 1000) / 1000,
          differingChannels: differing, differingShare: Math.round(differing / compared * 10000) / 10000,
          maxDelta, alphaDiffering, alphaMaxDelta, samples }
        reference.detachSource(); renderer.stop()
      }
      return { width, height, results }
    }, profiles)
    await fsp.mkdir(output, { recursive: true })
    await fsp.writeFile(path.join(output, 'pixel-parity.json'), JSON.stringify(report, null, 2))
    console.log('ENHANCEMENT_PIXEL_PARITY', JSON.stringify(report.results))
    for (const profile of profiles) {
      const result = report.results[profile]
      assert.equal(result.failure, '', `${profile}：渲染 Worker 的增强链路必须可用`)
      // 同输出尺寸：必须与主线程 anime4k.js 路径一致（超分 2×，其余 1×）。
      assert.deepEqual(result.candidate, result.reference, `${profile}：输出尺寸必须与主线程路径一致`)
      const expectedScale = profile === 'upscale' ? 2 : 1
      assert.equal(result.reference.width, report.width * expectedScale, `${profile}：参照输出宽度应为源宽 × ${expectedScale}`)
      assert.equal(result.reference.height, report.height * expectedScale, `${profile}：参照输出高度应为源高 × ${expectedScale}`)
      // 像素不退化：允许浮点/采样实现带来的极小差异，不允许整体走样或结构性差异。
      assert.ok(result.maxDelta <= 2, `${profile}：最大像素偏差 ${result.maxDelta} 超过容许的 2/255`)
      assert.ok(result.differingShare <= 0.02,
        `${profile}：${(result.differingShare * 100).toFixed(2)}% 的通道与主线程路径不同，超过容许的 2%`)
      assert.ok(result.meanAbsDelta <= 0.5, `${profile}：平均像素偏差 ${result.meanAbsDelta} 超过容许的 0.5/255`)
    }
  } finally { await browser.close() }
})

/** 挂载外部预览播放器：按场景写入播放偏好，并代理 Worker 消息以便取证。 */
async function openPlayer(page, preferences) {
  await page.addInitScript(value => {
    localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify(value))
    const NativeWorker = window.Worker
    window.__enhancementWorker = { ready: [], windows: [] }
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args)
        this.addEventListener('message', event => {
          if (event.data?.type === 'ready') window.__enhancementWorker.ready.push(event.data)
          if (event.data?.type === 'stats') window.__enhancementWorker.windows.push({ at: performance.now(), stats: event.data.stats })
        })
      }
    }
  }, preferences)
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
  await page.route('**/api/v1/anime/external-preview?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
    title: '仅增强路径线程测量', originalTitle: '', type: '电影', tags: [],
    episodes: [{ id: 903, episodeNo: 1, title: '测试片段', playbackUrl: `${origin}/enhancement-hls/stream.m3u8`,
      mimeType: 'application/vnd.apple.mpegurl' }],
  } } }))
  await page.route('**/enhancement-hls/*', route => {
    const name = path.basename(new URL(route.request().url()).pathname)
    return route.fulfill({ path: path.join(hlsDirectory, name),
      contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
      headers: { 'Cache-Control': 'no-store' } })
  })
  await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/enhancement-hls/stream.m3u8`)}`)
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return video && video.readyState >= 3 && video.currentTime > 0.3
  }, null, { timeout: 60000 })
}

/** 逐帧采样主线程：长任务、帧间隔与最终呈现状态。 */
async function sampleWindow(page, seconds) {
  await page.evaluate(async seconds => {
    const longTasks = [], frames = []
    let observer
    try {
      observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration) })
      observer.observe({ type: 'longtask', buffered: false })
    } catch {}
    await new Promise(resolve => {
      const started = performance.now()
      let last = 0
      const step = now => {
        if (last) frames.push(now - last)
        last = now
        if (now - started < seconds * 1000) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
    observer?.disconnect()
    frames.sort((left, right) => left - right)
    const video = document.querySelector('video')
    const enhanced = document.querySelector('.anime-player-frame .anime4k-canvas')
    const workerCanvas = document.querySelector('.anime-player-frame .realtime-interpolation-canvas')
    const visible = element => Boolean(element && getComputedStyle(element).visibility === 'visible')
    window.__sampleResult = {
      seconds,
      longTasksMs: longTasks.map(value => Math.round(value * 10) / 10),
      longTaskCount: longTasks.length,
      frameIntervalP50Ms: frames.length ? Math.round(frames[Math.floor(frames.length / 2)] * 10) / 10 : null,
      frameIntervalMaxMs: frames.length ? Math.round(frames.at(-1) * 10) / 10 : null,
      advancedSeconds: Math.round((video?.currentTime ?? 0) * 100) / 100,
      mainThreadCanvas: visible(enhanced) ? { kind: 'anime4k', width: enhanced.width, height: enhanced.height } : null,
      workerCanvasVisible: visible(workerCanvas),
    }
  }, seconds)
  return page.evaluate(() => window.__sampleResult)
}

/** 真实播放对照：同一夹具与档位，只切换执行位置，比较主线程长任务与呈现层。 */
test('enhancement-only playback runs in the worker and keeps the same output size', { timeout: 300000 }, async () => {
  const scenarios = [
    ['main-sharp', { frameRate: 'off', quality: 'sharp', enhancementPath: 'main' }],
    ['worker-sharp', { frameRate: 'off', quality: 'sharp', enhancementPath: 'worker' }],
    ['worker-fast', { frameRate: 'off', quality: 'fast', enhancementPath: 'worker' }],
  ]
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const report = {}
    const failures = []
    for (const [name, preferences] of scenarios) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const pageErrors = []
      page.on('pageerror', error => pageErrors.push(String(error)))
      try {
        await openPlayer(page, preferences)
        if (preferences.enhancementPath === 'worker') {
          await page.waitForFunction(() => (window.__enhancementWorker?.ready ?? []).length > 0, null, { timeout: 30000 })
        } else {
          await page.waitForSelector('.anime-player-frame .sanye-anime4k-active', { timeout: 30000 })
        }
        await page.waitForTimeout(900)
        const sample = await sampleWindow(page, 4)
        const { ready, windows } = await page.evaluate(() => ({ ready: window.__enhancementWorker?.ready ?? [],
          windows: (window.__enhancementWorker?.windows ?? []).slice(-4) }))
        report[name] = { preferences, sample, ready, windows: windows.map(entry => entry.stats), pageErrors }
      } catch (error) {
        report[name] = { preferences, harnessError: String(error), pageErrors }
        failures.push(`${name}：${error}`)
      } finally { await page.close() }
    }
    await fsp.mkdir(output, { recursive: true })
    await fsp.writeFile(path.join(output, 'playback-report.json'), JSON.stringify(report, null, 2))
    console.log('ENHANCEMENT_THREAD_PLAYBACK', JSON.stringify(Object.fromEntries(Object.entries(report).map(([name, value]) => [name,
      { longTaskCount: value.sample?.longTaskCount, longTaskMaxMs: value.sample?.longTasksMs?.at(-1) ?? null,
        frameIntervalP50Ms: value.sample?.frameIntervalP50Ms,
        mainThreadCanvas: value.sample?.mainThreadCanvas, workerCanvasVisible: value.sample?.workerCanvasVisible,
        ready: value.ready?.[0], windows: value.windows?.map(stats => ({ enhancementOnly: stats.enhancementOnly,
          need: stats.interpolationNeed, profile: stats.effectiveProfile, output: `${stats.outputWidth}x${stats.outputHeight}`,
          interpolated: stats.interpolatedFrames, skipped: stats.flowSkippedFrames, stallFrames: stats.stallFrames })) }]))))
    assert.deepEqual(failures, [], '测量入口必须完成每个场景')

    for (const [name, result] of Object.entries(report)) {
      assert.deepEqual(result.pageErrors, [], `${name}：页面不应有未捕获错误`)
      assert.ok(result.sample.advancedSeconds > 3, `${name}：采样窗口必须持续播放`)
    }
    // 对照：同一夹具与同一档位下，主线程执行 Anime4K 的窗口。
    const baseline = report['main-sharp']
    assert.ok(baseline.sample.mainThreadCanvas, '原路径必须仍在页面主线程挂载 anime4k 画布')
    assert.equal(baseline.ready.length, 0, '原路径不得启动渲染 Worker')
    assert.equal(baseline.sample.workerCanvasVisible, false)
    // 对照必须体现主线程成本，否则本入口无法证明“移入 Worker”的收益（长任务或主线程帧间隔至少一项显著更高）。
    const workerSharpSample = report['worker-sharp'].sample
    assert.ok(baseline.sample.longTaskCount > 0
      || baseline.sample.frameIntervalP50Ms > workerSharpSample.frameIntervalP50Ms * 1.2,
    `原路径未体现主线程成本：长任务 ${baseline.sample.longTaskCount} 次，主线程帧间隔中位数 ${baseline.sample.frameIntervalP50Ms}ms`)
    for (const name of ['worker-sharp', 'worker-fast']) {
      const result = report[name]
      // 验收：仅增强路径移入渲染 Worker 后，受控窗口内主线程不再出现长任务。
      assert.deepEqual(result.sample.longTasksMs, [], `${name}：仅增强路径不应在页面主线程产生长任务`)
      assert.equal(result.sample.mainThreadCanvas, null, `${name}：原主线程画布不应再参与呈现`)
      assert.ok(result.sample.workerCanvasVisible, `${name}：渲染 Worker 画布必须可见`)
      assert.equal(result.ready.length, 1, `${name}：只允许一次 Worker 初始化握手`)
      assert.equal(result.ready[0].enhancementOnly, true)
      assert.equal(result.ready[0].enhancementError, undefined, `${name}：档位链路必须初始化成功`)
      assert.ok(result.windows.length >= 2, `${name}：至少需要两个统计窗口，实际 ${result.windows.length}`)
      for (const stats of result.windows) {
        assert.equal(stats.enhancementOnly, true, `${name}：只应上报仅增强路径`)
        assert.equal(stats.interpolationNeed, 'none', `${name}：仅增强路径不得执行补帧`)
        assert.equal(stats.interpolatedFrames, 0, `${name}：不得产出合成帧`)
        assert.ok(stats.flowSkippedFrames > 0, `${name}：必须记录被跳过的光流分析`)
        assert.equal(stats.effectiveProfile, result.preferences.quality, `${name}：必须保持用户请求的档位`)
        // 同源同输出尺寸：与主线程路径一致（本夹具 640×360，非超分档位）。
        assert.equal(stats.outputWidth, 640, `${name}：输出宽度必须等于源宽`)
        assert.equal(stats.outputHeight, 360, `${name}：输出高度必须等于源高`)
        assert.equal(stats.stallFrames, 0, `${name}：稳定窗口不应出现停顿帧`)
      }
    }
  } finally { await browser.close() }
})

/** 一键回到原路径：渲染 Worker 不可用时必须自动回退主线程 anime4k.js 路径，而不是丢弃画质。 */
test('an unavailable render worker falls back to the original main-thread path', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await openPlayer(page, { frameRate: 'off', quality: 'sharp', enhancementPath: 'worker' })
    // 让渲染 Worker 的模块加载失败：初始化握手失败时必须回退原主线程路径。
    await page.route('**/interpolationRenderer.worker.ts*', route => route.abort())
    await page.reload()
    await page.waitForFunction(() => {
      const video = document.querySelector('video')
      return video && video.readyState >= 3 && video.currentTime > 0.3
    }, null, { timeout: 60000 })
    await page.waitForSelector('.anime-player-frame .sanye-anime4k-active', { timeout: 30000 })
    const result = await page.evaluate(() => {
      const video = document.querySelector('video')
      const reference = document.querySelector('.anime-player-frame .anime4k-canvas')
      return { mainThreadPath: Boolean(reference), workerCanvas: Boolean(document.querySelector('.anime-player-frame .realtime-interpolation-canvas')),
        workerStarted: (window.__enhancementWorker?.ready ?? []).length, paused: video.paused, currentTime: video.currentTime }
    })
    await fsp.mkdir(output, { recursive: true })
    await fsp.writeFile(path.join(output, 'fallback-report.json'), JSON.stringify({ result, pageErrors }, null, 2))
    console.log('ENHANCEMENT_FALLBACK', JSON.stringify(result))
    assert.deepEqual(pageErrors, [], '回退过程不应产生未捕获错误')
    assert.equal(result.mainThreadPath, true, 'Worker 不可用时必须回退到主线程 anime4k.js 路径')
    assert.equal(result.workerStarted, 0, '失败路径不得留下可用的 Worker 会话')
    assert.equal(result.paused, false, '回退不得打断播放')
  } finally { await browser.close() }
})
