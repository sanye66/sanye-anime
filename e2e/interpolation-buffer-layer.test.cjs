// 缓冲期间不得拆掉补间层。
//
// 补间画布比媒体元素晚一个插值延迟（默认 150ms、按下限 2 个源帧间隔收窄）呈现。如果每次
// `waiting` 都立刻收层露出原视频，画面就会先向前跳一个延迟、恢复后再向后跳回来——用户看到的
// 正是一次次前后跳变。本门禁在真实播放中注入缓冲事件，要求：
//   1. 短时缓冲保持补间层，不露出原视频；
//   2. 画面内容不倒退（`contentBacksteps` 为 0）；
//   3. 真正跳转（`seeking`）仍然立即收层，保护「seek 后尚未绘制」的黑屏窗口。
const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/interpolation-buffer-layer')
const fixturePath = path.join(output, 'source.mp4')
const hlsDirectory = path.join(output, 'hls')
const masterPath = path.join(hlsDirectory, 'master.m3u8')

before(async () => {
  try { await fs.access(fixturePath); await fs.access(masterPath); return } catch {}
  await fs.mkdir(output, { recursive: true })
  await fs.mkdir(hlsDirectory, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    await page.exposeFunction('saveFixture', (name, bytes) => fs.writeFile(path.join(output, name), Buffer.from(bytes)))
    await page.exposeFunction('saveHls', (name, bytes) => fs.writeFile(path.join(hlsDirectory, name), Buffer.from(bytes)))
    await page.evaluate(async () => {
      const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
      const { interpolationAssets } = await import('/src/video/interpolation.ts')
      const engine = new FFmpeg()
      try {
        await engine.load(interpolationAssets)
        // 24 FPS 源：补到 120 目标时每个源帧间隔要生成 4 个中间时刻，最接近真实使用。
        const status = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24:duration=8',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-preset', 'ultrafast',
          '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'fixture.mp4'], 180000)
        if (status !== 0) throw new Error('缓冲层夹具生成失败')
        await window.saveFixture('source.mp4', Array.from(await engine.readFile('fixture.mp4')))
        // 双档 HLS：用于验证清晰度自适应切换不会重置补间层。
        for (const [name, size, bitrate] of [['low', '640x360', '800k'], ['high', '1280x720', '2400k']]) {
          const variant = await engine.exec(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=24:duration=8`,
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-preset', 'ultrafast',
            '-b:v', bitrate, '-g', '48', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'hls', '-hls_time', '1',
            '-hls_list_size', '0', '-hls_segment_filename', `${name}%d.ts`, `${name}.m3u8`], 240000)
          if (variant !== 0) throw new Error(`${name} 清晰度夹具生成失败`)
        }
        for (const file of await engine.listDir('/')) {
          if (/^(low|high)\d*\.(ts|m3u8)$/.test(file.name)) await window.saveHls(file.name, Array.from(await engine.readFile(file.name)))
        }
        await window.saveHls('master.m3u8', [...new TextEncoder().encode([
          '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS',
          '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.42e01e,mp4a.40.2"', 'low.m3u8',
          '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720,CODECS="avc1.42e01e,mp4a.40.2"', 'high.m3u8', ''].join('\n'))])
      } finally { engine.terminate() }
    })
  } finally { await browser.close() }
}, { timeout: 240000 })

test('a brief buffer gap keeps the interpolated layer instead of revealing the source video', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.addInitScript(() => {
      localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 120, quality: 'off' }))
    })
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/anime/external-preview')) {
        return route.fulfill({ json: { code: 0, message: 'ok', data: {
          title: '缓冲层观测', originalTitle: '', type: '电影', tags: [],
          episodes: [{ id: 902, episodeNo: 1, title: '测试片段',
            playbackUrl: `${origin}/buffer-fixture/source.mp4`, mimeType: 'video/mp4' }],
        } } })
      }
      return route.fulfill({ status: 503, body: '' })
    })
    await page.route('**/buffer-fixture/*', route => route.fulfill({ path: fixturePath, contentType: 'video/mp4' }))
    await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/buffer-fixture/source.mp4`)}`)
    await page.waitForFunction(() => {
      const video = document.querySelector('video')
      return video && video.readyState >= 3 && video.currentTime > 0.4
    }, null, { timeout: 40000 })
    await page.waitForSelector('.sanye-realtime-interpolation-active', { timeout: 30000 })
    // 让渲染线程完成预热与延迟定档，随后才开始注入缓冲事件。
    await page.waitForTimeout(2500)

    const result = await page.evaluate(async () => {
      const player = document.querySelector('.art-video-player')
      const video = player.querySelector('video')
      const transitions = []
      let lastActive = player.classList.contains('sanye-realtime-interpolation-active')
      let lastPending = player.classList.contains('sanye-media-pending')
      new MutationObserver(() => {
        const active = player.classList.contains('sanye-realtime-interpolation-active')
        const pending = player.classList.contains('sanye-media-pending')
        if (active !== lastActive) transitions.push({ kind: 'active', to: active, at: Math.round(performance.now()) })
        if (pending !== lastPending) transitions.push({ kind: 'pending', to: pending, at: Math.round(performance.now()) })
        lastActive = active; lastPending = pending
      }).observe(player, { attributes: true, attributeFilter: ['class'] })

      // 真实播放中每 500ms 注入一次浏览器会在缓冲时抛出的 `waiting`，共 6 次。
      const during = { activeKept: 0, pendingRevealed: 0, samples: 6 }
      for (let index = 0; index < during.samples; index++) {
        video.dispatchEvent(new Event('waiting'))
        await new Promise(resolve => setTimeout(resolve, 60))
        if (player.classList.contains('sanye-realtime-interpolation-active')) during.activeKept++
        if (player.classList.contains('sanye-media-pending')) during.pendingRevealed++
        await new Promise(resolve => setTimeout(resolve, 440))
      }
      const buffered = { active: player.classList.contains('sanye-realtime-interpolation-active'),
        pending: player.classList.contains('sanye-media-pending') }
      // 缓冲阶段的事件到此为止：下面那次真实跳转会（且应该会）收层，不能混进缓冲阶段的判据。
      const bufferTransitions = transitions.slice()
      // 对照：真正的跳转必须立刻收层，避免「seek 后尚未绘制」露出黑屏。
      video.currentTime = video.currentTime + 0.5
      await new Promise(resolve => setTimeout(resolve, 1200))
      return { bufferTransitions, seekTransitions: transitions.slice(bufferTransitions.length), during, buffered,
        afterSeek: { active: player.classList.contains('sanye-realtime-interpolation-active') } }
    })

    await page.waitForTimeout(1500)
    const report = { ...result, stats: await page.evaluate(() => {
      const stats = window.__sanyeStats ?? null
      return stats
    }) }
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    console.log('BUFFER_LAYER', JSON.stringify(report))

    assert.equal(result.during.pendingRevealed, 0, '缓冲期间不得露出原视频层（露出会把画面向前跳一个插值延迟）')
    assert.equal(result.during.activeKept, result.during.samples, '缓冲期间补间层必须保持显示')
    assert.equal(result.buffered.active, true, '缓冲结束后补间层仍在显示')
    assert.equal(result.buffered.pending, false, '缓冲结束后不得残留原视频揭示状态')
    const bufferFlips = result.bufferTransitions.filter(entry => entry.kind === 'active')
    assert.deepEqual(bufferFlips, [], `缓冲期间补间层不得整层切换：${JSON.stringify(result.bufferTransitions)}`)
    assert.equal(result.bufferTransitions.filter(entry => entry.kind === 'pending').length, 0,
      '缓冲期间不得切换原视频揭示状态')
    // 跳转是播放段边界：必须先收层（避免「seek 后尚未绘制」露出黑屏），随后在新片段上恢复补间层。
    assert.ok(result.seekTransitions.some(entry => entry.kind === 'active' && entry.to === false),
      `跳转必须先收层：${JSON.stringify(result.seekTransitions)}`)
    assert.ok(result.seekTransitions.some(entry => entry.kind === 'active' && entry.to === true),
      `跳转后必须恢复补间层：${JSON.stringify(result.seekTransitions)}`)
    assert.equal(result.afterSeek.active, true, '跳转完成后补间层应已恢复')
  } finally { await browser.close() }
})

// 清晰度自适应切换（ABR）与手动换档都只改变像素尺寸，不改变时间轴。此前它会把整条管线重置
// 并收起补间层，页面随即露出比画布晚一个插值延迟的原视频，于是每次码率切换都出现一次前后跳变。
test('a quality-level switch keeps the interpolated layer instead of resetting it', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.addInitScript(() => {
      localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 120, quality: 'off' }))
    })
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/anime/external-preview')) {
        return route.fulfill({ json: { code: 0, message: 'ok', data: {
          title: '清晰度切换观测', originalTitle: '', type: '电影', tags: [],
          episodes: [{ id: 903, episodeNo: 1, title: '测试片段',
            playbackUrl: `${origin}/level-fixture/master.m3u8`, mimeType: 'application/vnd.apple.mpegurl' }],
        } } })
      }
      return route.fulfill({ status: 503, body: '' })
    })
    await page.route('**/level-fixture/*', route => {
      const name = path.basename(new URL(route.request().url()).pathname)
      return route.fulfill({ path: path.join(hlsDirectory, name),
        contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
        headers: { 'Cache-Control': 'no-store' } })
    })
    await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/level-fixture/master.m3u8`)}`)
    await page.waitForFunction(() => {
      const video = document.querySelector('video')
      return video && video.readyState >= 3 && video.currentTime > 0.4
    }, null, { timeout: 40000 })
    await page.waitForSelector('.sanye-realtime-interpolation-active', { timeout: 30000 })
    await page.locator('.art-video-player').hover()
    await page.locator('.art-control-quality').waitFor({ timeout: 20000 })
    // 让渲染线程完成预热与延迟定档，随后才开始观测换档。
    await page.waitForTimeout(2500)
    const switched = await page.evaluate(async () => {
      const moduleUrl = performance.getEntriesByType('resource').map(entry => entry.name)
        .find(url => /artplayer(?:\.js|\/)/.test(url))
      const { default: Artplayer } = await import(moduleUrl)
      const player = Artplayer.instances[0]
      const host = player.video.closest('.art-video-player')
      const video = player.video
      const hls = player.hls
      const before = { width: video.videoWidth, height: video.videoHeight, level: hls?.currentLevel ?? null }
      const flips = []
      let lastActive = host.classList.contains('sanye-realtime-interpolation-active')
      let lastPending = host.classList.contains('sanye-media-pending')
      new MutationObserver(() => {
        const active = host.classList.contains('sanye-realtime-interpolation-active')
        const pending = host.classList.contains('sanye-media-pending')
        if (active !== lastActive) flips.push({ kind: 'active', to: active })
        if (pending !== lastPending) flips.push({ kind: 'pending', to: pending })
        lastActive = active; lastPending = pending
      }).observe(host, { attributes: true, attributeFilter: ['class'] })
      if (!hls || !hls.levels || hls.levels.length < 2) return { skipped: true, before, flips: [], after: before }
      // 选一个分辨率不同的档位并立即切换：菜单用的是延迟生效的 `nextLevel`，无法确定性地验证分辨率变化。
      const index = hls.levels.findIndex(level => level.height !== before.height)
      if (index < 0) return { skipped: true, before, flips: [], after: before }
      hls.currentLevel = index
      // HLS 在下一个分片边界换档，最多等 8 秒。
      const deadline = performance.now() + 8000
      while (performance.now() < deadline && video.videoHeight === before.height) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      await new Promise(resolve => setTimeout(resolve, 1200))
      return { skipped: false, label: `${hls.levels[index].height}P`, before, flips,
        after: { width: video.videoWidth, height: video.videoHeight, level: hls.currentLevel },
        active: host.classList.contains('sanye-realtime-interpolation-active'),
        pending: host.classList.contains('sanye-media-pending') }
    })
    await fs.writeFile(path.join(output, 'level-switch.json'), JSON.stringify(switched, null, 2))
    console.log('LEVEL_SWITCH', JSON.stringify(switched))
    assert.equal(switched.skipped, false, '夹具必须同时提供两个清晰度档位')
    assert.notEqual(`${switched.after.height}`, `${switched.before.height}`,
      `换档必须真的改变解码分辨率：${switched.before.height} → ${switched.after.height}`)
    assert.equal(switched.active, true, '换档后补间层必须仍在显示')
    assert.equal(switched.pending, false, '换档不得露出原视频')
    assert.deepEqual(switched.flips, [], `换档不得整层重置补间层：${JSON.stringify(switched.flips)}`)
  } finally { await browser.close() }
})
