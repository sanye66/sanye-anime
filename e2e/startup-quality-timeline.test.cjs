const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/startup-quality')
const hlsDirectory = path.resolve(__dirname, '../sanye_deploy/.local/quality-fluctuation/media')
const masterPlaylist = path.join(hlsDirectory, 'master.m3u8')

/** 双档本地 HLS 夹具：640×360 与 1280×720，用于观察起播清晰度爬升。 */
before(async () => {
  await fs.mkdir(output, { recursive: true })
  try {
    await fs.access(masterPlaylist)
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
        for (const [name, size, bitrate] of [['low', '640x360', '900k'], ['high', '1280x720', '2600k']]) {
          const status = await engine.exec(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=12`,
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-c:v', 'libx264', '-preset', 'ultrafast',
            '-b:v', bitrate, '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2',
            '-hls_list_size', '0', '-hls_segment_filename', `${name}%d.ts`, `${name}.m3u8`], 240000)
          if (status !== 0) throw new Error(`${name} fixture generation failed`)
        }
        for (const file of await engine.listDir('/')) {
          if (/^(low|high)\d*\.(ts|m3u8)$/.test(file.name)) await window.saveMedia(file.name, Array.from(await engine.readFile(file.name)))
        }
        await window.saveMedia('master.m3u8', [...new TextEncoder().encode([
          '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS',
          '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=640x360,CODECS="avc1.42e01e,mp4a.40.2"', 'low.m3u8',
          '#EXT-X-STREAM-INF:BANDWIDTH=2600000,RESOLUTION=1280x720,CODECS="avc1.42e01e,mp4a.40.2"', 'high.m3u8', ''].join('\n'))])
      } finally { engine.terminate() }
    })
  } finally { await browser.close() }
}, { timeout: 300000 })

/**
 * 每个文档安装一次时间线采样：标记使用 `performance.timeOrigin + performance.now()` 的绝对时刻，
 * 因此可以跨「点击搜索结果的时刻」计算导航耗时。标记写入 `window.__startupMarks`，按文档重新开始。
 */
function installTimeline() {
  const marks = []
  const seen = {}
  window.__startupMarks = marks
  const record = (key, name, extra = {}) => {
    if (seen[key]) return
    seen[key] = true
    marks.push({ name, at: Math.round((performance.timeOrigin + performance.now()) * 10) / 10, ...extra })
  }
  let video = null
  const step = () => {
    video = video ?? document.querySelector('video')
    const host = document.querySelector('.art-video-player')
    if (host) record('player', 'player-mounted')
    if (video) {
      const mediaTime = Math.round(video.currentTime * 1000) / 1000
      if (video.readyState >= 2) record('ready', 'ready-data', { mediaTime, width: video.videoWidth })
      if (!video.paused && video.currentTime > 0) record('playing', 'playing', { mediaTime, width: video.videoWidth })
      if (host?.classList.contains('sanye-realtime-interpolation-active'))
        record('interpolation', 'interpolation-active', { mediaTime, width: video.videoWidth })
      if (video.videoWidth >= 1280) record('high', 'high-level', { mediaTime, width: video.videoWidth })
    }
    if (!seen.high) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** 服务本地双档 HLS，并返回分片请求记录；可按时序注入高档分片延迟，模拟带宽不足。 */
async function serveFixture(page, highSegmentDelay = () => 0) {
  const requests = []
  await page.route('**/quality-hls/*', async route => {
    const name = path.basename(new URL(route.request().url()).pathname)
    if (name.endsWith('.ts')) requests.push(name)
    const delay = /^high\d*\.ts$/.test(name) ? Number(highSegmentDelay()) || 0 : 0
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    try {
      await route.fulfill({ path: path.join(hlsDirectory, name),
        contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
        headers: { 'Cache-Control': 'max-age=600' } })
    } catch {
      // 档位切换会中止在途分片，已被取消的请求不再响应。
    }
  })
  return requests
}

test('search to playback keeps first frame and quality ramp measurable', { timeout: 240000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const report = {}
    for (const [label, target, quality] of [['interpolation-60', 60, 'off'], ['interpolation-60-sharp', 60, 'sharp']]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const pageErrors = []
      page.on('pageerror', error => pageErrors.push(String(error)))
      await page.addInitScript(preferences => {
        localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify(preferences))
      }, { frameRate: target, quality })
      await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
      await page.route('**/api/v1/search?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
        items: [{ id: 127, title: '起播画质测量', titleHighlight: '起播画质测量', coverUrl: '', type: '电视动画',
          year: 2026, updateText: '更新至第 1 集', tags: [] }], page: 1, size: 12, total: 1, totalPages: 1 } } }))
      await page.route('**/api/v1/anime/127', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
        id: 127, title: '起播画质测量', originalTitle: '', type: '电视动画', year: 2026, status: '连载中',
        tags: [], summary: '', characters: [], similar: [], schedule: [] } } }))
      await page.route('**/api/v1/anime/127/episodes', route => route.fulfill({ json: { code: 0, message: 'ok', data: [
        { id: 901, episodeNo: 1, title: '第 1 集', playbackUrl: `${origin}/quality-hls/master.m3u8`,
          mimeType: 'application/vnd.apple.mpegurl', sourceLabel: '本地夹具' }] } }))
      const requests = await serveFixture(page)
      // 搜索页 → 点击结果 → 详情页挂载播放器 → 起播
      await page.addInitScript(installTimeline)
      await page.goto(`${origin}/search?keyword=%E8%B5%B7%E6%92%AD`)
      const firstResult = page.locator('a.result-row').first()
      await firstResult.waitFor({ timeout: 20000 })
      const clickedAt = Date.now()
      await firstResult.click()
      await page.waitForFunction(() => document.querySelector('.art-video-player'), null, { timeout: 20000 })
      await page.evaluate(() => { void document.querySelector('video')?.play().catch(() => undefined) })
      await page.waitForFunction(() => document.querySelector('.sanye-realtime-interpolation-active'), null, { timeout: 30000 })
      await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) >= 1280, null, { timeout: 30000 })
      const marks = await page.evaluate(() => window.__startupMarks)
      report[label] = { clickedAt, marks, fragmentRequests: requests.length, pageErrors }
      await page.screenshot({ path: path.join(output, `search-${label}.png`) })
      await page.close()
    }
    // 直接观看路径：外部预览自动起播，观察清晰度爬升时刻
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.addInitScript(() => localStorage.setItem('sanye:playback:preferences:v1',
      JSON.stringify({ frameRate: 60, quality: 'sharp' })))
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/api/v1/anime/external-preview?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
      title: '起播画质测量', originalTitle: '', type: '电影', tags: [],
      episodes: [{ id: 901, episodeNo: 1, title: '片段', playbackUrl: `${origin}/quality-hls/master.m3u8`,
        mimeType: 'application/vnd.apple.mpegurl' }] } } }))
    await serveFixture(page)
    await page.addInitScript(installTimeline)
    const externalClickedAt = Date.now()
    await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/quality-hls/master.m3u8`)}`)
    await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) >= 1280, null, { timeout: 30000 })
    report['external-autoplay'] = { clickedAt: externalClickedAt, marks: await page.evaluate(() => window.__startupMarks) }
    await page.screenshot({ path: path.join(output, 'external-autoplay.png') })
    await page.close()
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    for (const [label, result] of Object.entries(report)) {
      const marks = result.marks
      const at = name => marks.find(mark => mark.name === name) ?? null
      const offset = name => {
        const mark = at(name)
        return mark ? Math.round((mark.at - result.clickedAt) * 10) / 10 : null
      }
      console.log(label, JSON.stringify({ player: offset('player-mounted'), ready: offset('ready-data'),
        playing: offset('playing'), interpolation: offset('interpolation-active'),
        interpolationMediaTime: at('interpolation-active')?.mediaTime ?? null,
        highLevel: offset('high-level'), highLevelMediaTime: at('high-level')?.mediaTime ?? null }))
      assert.deepEqual(result.pageErrors ?? [], [], `${label}：页面不应有未捕获错误`)
      assert.ok(at('ready-data'), `${label}：必须记录首帧可解码时刻`)
      assert.ok(at('interpolation-active'), `${label}：开启补帧后必须记录补间层就绪时刻`)
      assert.ok(at('high-level'), `${label}：带宽足够时必须记录升到高档`)
    }
  } finally { await browser.close() }
})

const startupQualityKey = 'sanye:playback:startup-quality:v1'
const fixtureSourceSuffix = '/quality-hls/master.m3u8'

test('startup quality memory keeps high level at first frame and falls back when unavailable', { timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  const report = {}
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    let highSegmentDelayMs = 0
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/api/v1/search?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
      items: [{ id: 127, title: '起播画质测量', titleHighlight: '起播画质测量', coverUrl: '', type: '电视动画',
        year: 2026, updateText: '更新至第 1 集', tags: [] }], page: 1, size: 12, total: 1, totalPages: 1 } } }))
    await page.route('**/api/v1/anime/127', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
      id: 127, title: '起播画质测量', originalTitle: '', type: '电视动画', year: 2026, status: '连载中',
      tags: [], summary: '', characters: [], similar: [], schedule: [] } } }))
    await page.route('**/api/v1/anime/127/episodes', route => route.fulfill({ json: { code: 0, message: 'ok', data: [
      { id: 901, episodeNo: 1, title: '第 1 集', playbackUrl: `${origin}/quality-hls/master.m3u8`,
        mimeType: 'application/vnd.apple.mpegurl', sourceLabel: '本地夹具' }] } }))
    await serveFixture(page, () => highSegmentDelayMs)
    await page.addInitScript(installTimeline)

    // 每个场景都从搜索页重新进入，并清掉续播进度，避免定位影响起播时间线。
    const clearProgress = () => page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sanye:player:progress:') || key.startsWith('sanye:player:selected:')) localStorage.removeItem(key)
      }
    })
    const readRecords = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), startupQualityKey)
    const runSearchPlayback = async (label, waitHighLevel, waitForPlayback = true) => {
      await page.goto(`${origin}/search?keyword=%E8%B5%B7%E6%92%AD`)
      await clearProgress()
      const firstResult = page.locator('a.result-row').first()
      await firstResult.waitFor({ timeout: 20000 })
      const clickedAt = Date.now()
      await firstResult.click()
      await page.waitForFunction(() => document.querySelector('.art-video-player'), null, { timeout: 20000 })
      await page.evaluate(() => { void document.querySelector('video')?.play().catch(() => undefined) })
      await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, { timeout: 30000 })
      if (waitHighLevel) await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) >= 1280, null, { timeout: 30000 })
      // 播放稳定并完成升档后播放器才回写实际档位记忆，需要读取记忆时必须先等到该时刻。
      if (waitForPlayback) await page.waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) >= 3.2, null, { timeout: 30000 })
      report[label] = { clickedAt, marks: await page.evaluate(() => window.__startupMarks), records: await readRecords() }
      await fs.writeFile(path.join(output, 'startup-quality-memory.json'), JSON.stringify(report, null, 2))
    }
    const summarize = (label) => {
      const entry = report[label]
      const at = name => entry.marks.find(mark => mark.name === name) ?? null
      const offset = name => {
        const mark = at(name)
        return mark ? Math.round((mark.at - entry.clickedAt) * 10) / 10 : null
      }
      // 起播即高档时首帧与升档在同一渲染帧完成，首帧取最早带画面宽度的标记。
      const firstFrame = entry.marks.find(mark => mark.width) ?? null
      return { player: offset('player-mounted'), ready: offset('ready-data'), playing: offset('playing'),
        highLevel: offset('high-level'), firstFrame: firstFrame?.name ?? null,
        firstFrameAt: firstFrame ? Math.round((firstFrame.at - entry.clickedAt) * 10) / 10 : null,
        firstFrameWidth: firstFrame?.width ?? 0 }
    }
    const remembered = (records) => records.filter(item => item.source.endsWith(fixtureSourceSuffix))

    // 场景 1：冷启动没有记忆，先出低档首帧，再靠带宽升档（对照基线约 2.3 秒）。
    await runSearchPlayback('cold-start', true)
    const cold = summarize('cold-start')
    assert.equal(cold.firstFrameWidth, 640, '冷启动：首帧应为低档')
    assert.ok(cold.highLevel !== null && cold.highLevel - cold.firstFrameAt > 500, '冷启动：高档应明显晚于首帧')

    // 场景 2：同一地址已有成功记录，首帧即高档。
    const stored = remembered(await readRecords())
    assert.ok(stored.some(item => item.height >= 720), `首次成功播放后应写入高档起播记忆：${JSON.stringify(stored)}`)
    await runSearchPlayback('quality-memory', true)
    const warm = summarize('quality-memory')
    assert.equal(warm.firstFrameWidth, 1280, '有记忆：首帧应直接是高档')
    assert.ok(warm.highLevel !== null && warm.highLevel - warm.firstFrameAt <= 50, '有记忆：高档到位不应晚于首帧')

    // 场景 3：记忆过期，回到低档起步。
    await page.evaluate(([key, suffix]) => {
      const records = JSON.parse(localStorage.getItem(key) || '[]')
      localStorage.setItem(key, JSON.stringify(records.map(item =>
        item.source.endsWith(suffix) ? { ...item, time: Date.now() - 40 * 86400000 } : item)))
    }, [startupQualityKey, fixtureSourceSuffix])
    await runSearchPlayback('expired-memory', true)
    const expired = summarize('expired-memory')
    assert.equal(expired.firstFrameWidth, 640, '记忆过期：应回到低档起步')

    // 场景 4：记忆档位分片不可用（带宽不足），首片仍在回落窗口内出画，并作废该记忆。
    const fresh = stored.map(item => ({ ...item, time: Date.now() }))
    assert.ok(fresh.length, '需要可用记忆构造带宽不足场景')
    await page.evaluate(([key, records]) => {
      const source = item => item.source.endsWith('/quality-hls/master.m3u8')
      const rest = JSON.parse(localStorage.getItem(key) || '[]').filter(item => !source(item))
      localStorage.setItem(key, JSON.stringify([...rest, ...records]))
    }, [startupQualityKey, fresh])
    highSegmentDelayMs = 8000
    await runSearchPlayback('slow-high-level', false, false)
    highSegmentDelayMs = 0
    const slow = summarize('slow-high-level')
    assert.equal(slow.firstFrameWidth, 640, '带宽不足：应回落到低档出首帧')
    assert.ok(slow.firstFrameAt !== null && slow.firstFrameAt < 6000, '带宽不足：首帧不应等待高档分片超时')
    assert.ok(!remembered(report['slow-high-level'].records).some(item => item.height >= 720),
      '带宽不足：记忆应作废或改写为实际低档')

    await fs.writeFile(path.join(output, 'startup-quality-memory.json'), JSON.stringify(report, null, 2))
    for (const label of Object.keys(report)) {
      console.log(label, JSON.stringify(summarize(label)), `records=${remembered(report[label].records).length}`)
    }
    assert.deepEqual(pageErrors, [], '页面不应有未捕获错误')
  } finally { await browser.close() }
})
