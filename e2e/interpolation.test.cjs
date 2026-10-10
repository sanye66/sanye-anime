const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

test('motion interpolation generates 120fps with audio and supports cancellation', { timeout: 180000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const fixtures = new Map()
    await page.exposeFunction('setHlsFixtures', entries => { for (const entry of entries) fixtures.set(entry.name, Buffer.from(entry.data)) })
    await page.route('**/interpolation-fixture/**', route => {
      const name = new URL(route.request().url()).pathname.split('/').pop()
      const data = fixtures.get(name)
      return data ? route.fulfill({ body: data }) : route.fulfill({ status: 404 })
    })
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5187/')
    const result = await page.evaluate(async () => {
      const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
      const { InterpolationJob, interpolationAssets } = await import('/src/video/interpolation.ts')
      const fixture = new FFmpeg()
      let job
      try {
        await fixture.load(interpolationAssets)
        const create = await fixture.exec(['-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=12:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'source.mp4'])
        if (create !== 0) throw new Error('Cannot create motion test video')
        const input = await fixture.readFile('source.mp4')
        const file = new File([input], 'source.mp4', { type: 'video/mp4' })
        const stages = []
        job = new InterpolationJob(progress => stages.push(progress.stage))
        const output = await job.convert(file, false, 480)
        await fixture.writeFile('result.mp4', new Uint8Array(await output.arrayBuffer()))
        await fixture.ffprobe(['-v', 'error', '-show_entries', 'stream=codec_type,avg_frame_rate,nb_frames,duration', '-of', 'json', 'result.mp4', '-o', 'result.json'])
        const metadata = JSON.parse(await fixture.readFile('result.json', 'utf8'))
        // Hash decoded pixels: interpolated frames must differ, not just repeat source frames.
        await fixture.exec(['-i', 'result.mp4', '-map', '0:v:0', '-f', 'framemd5', 'frames.txt'])
        const frames = (await fixture.readFile('frames.txt', 'utf8')).split('\n').filter(line => line && !line.startsWith('#'))
        const distinct = new Set(frames.map(line => line.split(',').pop().trim())).size
        await fixture.exec(['-i', 'source.mp4', '-c', 'copy', '-hls_time', '0.5', '-hls_list_size', '0', 'fixture.m3u8'])
        const names = (await fixture.listDir('/')).filter(entry => entry.name.startsWith('fixture.')).map(entry => entry.name)
        names.push(...(await fixture.listDir('/')).filter(entry => /^fixture\d+\.ts$/.test(entry.name)).map(entry => entry.name))
        const served = []
        for (const name of names) served.push({ name, data: Array.from(await fixture.readFile(name)) })
        await window.setHlsFixtures(served)
        const hlsJob = new InterpolationJob(() => {})
        const hlsResult = await hlsJob.convert(location.origin + '/interpolation-fixture/fixture.m3u8', true, 480)
        const cancelled = new InterpolationJob(() => {})
        cancelled.cancel()
        let rejected = false
        try { await cancelled.convert(file, false, 480) } catch { rejected = true }
        return { metadata, distinct, frames: frames.length, bytes: output.size, hlsBytes: hlsResult.size, stages, cancelled: rejected, source: Array.from(input) }
      } finally { job?.cancel(); fixture.terminate() }
    })
    const video = result.metadata.streams.find(s => s.codec_type === 'video')
    assert.equal(video.avg_frame_rate, '120/1')
    assert.ok(result.metadata.streams.some(s => s.codec_type === 'audio'))
    assert.equal(result.frames, 120)
    assert.ok(Math.abs(Number(video.duration) - 1) < .02)
    assert.ok(result.distinct > 12, 'must create more distinct frames than the 12fps input')
    assert.equal(result.cancelled, true)
    assert.ok(result.hlsBytes > 0)
    const directory = path.resolve(__dirname, '../sanye_deploy/.local/interpolation')
    await fs.mkdir(directory, { recursive: true })
    const { source, ...report } = result
    await fs.writeFile(path.join(directory, 'source.mp4'), new Uint8Array(source))
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally { await browser.close() }
})
