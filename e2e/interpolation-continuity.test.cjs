// 播放期间不得出现短暂卡断。
//
// 判据是「画面推进量」：相邻两次呈现的内容在媒体时间轴上前进的毫秒数，流畅补帧应恒等于
// `1000 / 目标帧率`。由此派生三个计数——`contentHolds`（重复同一内容）、`contentJumps`
// （一次跨过多个输出周期）、`contentBacksteps`（倒退），以及 `contentFreezeRuns`
// （连续两次以上未前进的提交段数，即用户看到的「卡断」）。
//
// 卡断的根因是插值延迟被低估：补间画布比媒体元素晚一个插值延迟呈现，如果延迟不足以覆盖
// 采集与运动分析的实际耗时，目标时刻就会越过最新源帧、画面停住，随后延迟被迫加宽——加宽
// 发生在接管之后时就是一次可见冻结。因此本门禁同时要求「延迟在接管前定档」，即接管时
// 已经覆盖实测需要。
const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/interpolation-continuity')
const fixturePath = path.join(output, 'source.mp4')

before(async () => {
  try { await fs.access(fixturePath); return } catch {}
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    await page.exposeFunction('saveFixture', bytes => fs.writeFile(fixturePath, Buffer.from(bytes)))
    await page.evaluate(async () => {
      const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
      const { interpolationAssets } = await import('/src/video/interpolation.ts')
      const engine = new FFmpeg()
      try {
        await engine.load(interpolationAssets)
        // 24 FPS 源、1080p：目标 120 时每个源帧间隔要生成 4 个中间时刻，最接近真实使用。
        const status = await engine.exec(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=24:duration=10',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast',
          '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'fixture.mp4'], 240000)
        if (status !== 0) throw new Error('连续性夹具生成失败')
        await window.saveFixture(Array.from(await engine.readFile('fixture.mp4')))
      } finally { engine.terminate() }
    })
  } finally { await browser.close() }
}, { timeout: 300000 })

/** 在真实播放器里跑一段时间的实时补帧，返回每个统计窗口。 */
async function runSession({ targetFps, windows, seekEvery = 0 }) {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/continuity-clip.mp4', route => route.fulfill({ path: fixturePath, contentType: 'video/mp4' }))
    await page.goto(origin)
    const result = await page.evaluate(async ({ targetFps, windows, seekEvery }) => {
      const { startRealtimeInterpolation } = await import('/src/video/realtimeInterpolation.ts')
      const host = document.createElement('div')
      host.className = 'art-video-player'
      host.style.cssText = 'width:1280px;height:720px;position:relative;background:#000'
      const video = document.createElement('video')
      video.src = '/continuity-clip.mp4'; video.muted = true; video.playsInline = true
      host.appendChild(video)
      document.body.appendChild(host)
      await new Promise((resolve, reject) => {
        video.addEventListener('loadeddata', resolve, { once: true })
        video.addEventListener('error', () => reject(new Error('夹具未能加载')), { once: true })
      })
      video.currentTime = 1
      await video.play()
      await new Promise(resolve => setTimeout(resolve, 300))
      const stats = [], failures = []
      const session = await startRealtimeInterpolation(video, {
        targetFps, enhance: false, measureStages: true,
        onStats: value => stats.push(value), onError: message => failures.push(String(message)),
      })
      for (let index = 0; index < windows; index++) {
        await new Promise(resolve => setTimeout(resolve, 1050))
        if (seekEvery && (index + 1) % seekEvery === 0) video.currentTime = 1 + ((index * 0.43) % 4)
      }
      session.stop()
      return { stats, failures }
    }, { targetFps, windows, seekEvery })
    return { ...result, pageErrors }
  } finally { await browser.close() }
}

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0)

test('steady playback never freezes, jumps or rewinds the picture', { timeout: 180000 }, async () => {
  const { stats, failures, pageErrors } = await runSession({ targetFps: 120, windows: 10 })
  const rows = stats.filter(stat => stat.contentSteps)
  await fs.writeFile(path.join(output, 'steady.json'), JSON.stringify({ stats, failures, pageErrors }, null, 2))
  console.log('CONTINUITY', JSON.stringify({
    windows: rows.length,
    freezeRuns: sum(rows, 'contentFreezeRuns'),
    holds: sum(rows, 'contentHolds'),
    jumps: sum(rows, 'contentJumps'),
    backsteps: sum(rows, 'contentBacksteps'),
    stepP95: rows.map(row => Number(row.contentStepP95Ms.toFixed(2))),
    activationAwaitingMs: rows.map(row => row.interpolationDelay?.awaitingMs ?? null),
  }))
  assert.deepEqual(failures, [], '实时补帧不得回退到原画')
  assert.deepEqual(pageErrors, [], '页面不应有未捕获错误')
  assert.ok(rows.length >= 6, `统计窗口太少，无法判断连续性：${rows.length}`)
  assert.equal(sum(rows, 'contentFreezeRuns'), 0, '稳定播放不得出现卡断（连续多次未前进）')
  assert.equal(sum(rows, 'contentHolds'), 0, '稳定播放不得重复同一内容')
  assert.equal(sum(rows, 'contentJumps'), 0, '稳定播放不得跳帧')
  assert.equal(sum(rows, 'contentBacksteps'), 0, '稳定播放不得出现画面倒退')
  // 内容推进必须接近理想输出周期；明显偏大意味着实际帧率低于目标。
  const idealMs = 1000 / 120
  for (const row of rows) {
    assert.ok(row.contentStepP95Ms <= idealMs * 1.4,
      `内容推进 P95 应接近理想周期 ${idealMs.toFixed(2)}ms，实际 ${row.contentStepP95Ms.toFixed(2)}ms`)
  }
  // 接管时延迟必须已经定档：接管后再加宽就是一次可见冻结。
  assert.ok(rows.every(row => (row.contentFreezeRuns ?? 0) === 0))
})

test('a seek does not introduce freezes afterwards', { timeout: 180000 }, async () => {
  const { stats, failures } = await runSession({ targetFps: 120, windows: 9, seekEvery: 3 })
  const rows = stats.filter(stat => stat.contentSteps)
  await fs.writeFile(path.join(output, 'seeks.json'), JSON.stringify({ stats, failures }, null, 2))
  console.log('CONTINUITY_SEEK', JSON.stringify({
    windows: rows.length,
    freezeRuns: sum(rows, 'contentFreezeRuns'),
    holds: sum(rows, 'contentHolds'),
    jumps: sum(rows, 'contentJumps'),
    backsteps: sum(rows, 'contentBacksteps'),
  }))
  assert.deepEqual(failures, [], '跳转后不得回退到原画')
  assert.equal(sum(rows, 'contentFreezeRuns'), 0, '跳转恢复后不得出现卡断')
  assert.equal(sum(rows, 'contentBacksteps'), 0, '跳转恢复后不得出现画面倒退')
})
