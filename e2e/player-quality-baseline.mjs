import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises'
import { resolve, join, relative, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fulfillLocalMedia } from './local-media-range.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'sanye_deploy/.local/player-quality')
const catalogPath = join(output, 'samples.json')
const scenes = ['pan', 'fast-action', 'deformation', 'occlusion', 'fine-lines-subtitles', 'gradient', 'scene-cut', 'low-bitrate-noise']
const args = process.argv.slice(2)
const command = args.shift()
const option = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1] }
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fileHash = async file => sha(await readFile(file))
const readCatalog = async () => { try { return JSON.parse(await readFile(catalogPath, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return []; throw error } }
const required = (name, value) => { if (!value) throw new Error(`Missing --${name}`); return value }
const reference = option('reference')
if (reference && !/^pre-p\d+$/.test(reference)) throw new Error('Reference must name a pre-pN source snapshot')
const videoDirectory = reference ? join(output, reference, 'sanye_client/src/video') : join(root, 'sanye_client/src/video')

async function register() {
  const file = resolve(required('file', option('file')))
  const origin = required('origin', option('origin'))
  const truth = required('truth', option('truth'))
  const categories = required('scenes', option('scenes')).split(',')
  const license = required('license', option('license'))
  const fps = Number(required('fps', option('fps')))
  const start = Number(option('start') ?? 0)
  const end = Number(required('end', option('end')))
  if (!['synthetic', 'real'].includes(origin) || !['ground-truth', 'subjective'].includes(truth)
    || !categories.length || !categories.every(value => scenes.includes(value))
    || !Number.isFinite(fps) || fps <= 0 || !Number.isFinite(start) || start < 0
    || !Number.isFinite(end) || end <= start) throw new Error('Invalid origin, truth, scenes, fps or time range')
  const id = required('id', option('id'))
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error('Invalid sample id')
  const catalog = await readCatalog()
  if (catalog.some(item => item.id === id)) throw new Error(`Sample already exists: ${id}`)
  const browser = await chromium.launch()
  let metadata
  try {
    const page = await browser.newPage()
    await page.route('**/quality-sample.mp4', route => fulfillLocalMedia(route, file))
    await page.goto(option('url') ?? process.env.SANYE_FRONTEND_URL ?? 'http://127.0.0.1:5188')
    metadata = await page.evaluate(() => new Promise((done, fail) => {
      const video = document.createElement('video')
      video.onloadedmetadata = () => done({ width: video.videoWidth, height: video.videoHeight, durationSeconds: video.duration })
      video.onerror = () => fail(new Error('Cannot decode sample metadata'))
      video.src = '/quality-sample.mp4'
    }))
  } finally { await browser.close() }
  if (Number.isFinite(metadata.durationSeconds) && end > metadata.durationSeconds + 0.01) throw new Error('Clip range exceeds media duration')
  const item = { id, file, sha256: await fileHash(file), bytes: (await stat(file)).size, ...metadata,
    startSeconds: start, endSeconds: end, sourceFps: fps, fpsProvenance: required('fps-source', option('fps-source')),
    origin, truth, license, groundTruthFile: truth === 'ground-truth' ? required('truth-file', option('truth-file')) : null,
    scenes: categories }
  if (item.groundTruthFile) {
    item.groundTruthFile = resolve(item.groundTruthFile)
    item.groundTruthSha256 = await fileHash(item.groundTruthFile)
  }
  await mkdir(output, { recursive: true })
  catalog.push(item)
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
  console.log(JSON.stringify(item, null, 2))
}

async function registerGenerated() {
  const version = option('version') ?? 'v1', selected = option('scene'), url = option('url')
  if (!/^v[0-9]+$/.test(version) || (selected && !scenes.includes(selected))) throw new Error('Invalid scene or version')
  const suffix = version === 'v1' ? '' : `-${version}`
  for (const name of selected ? [selected] : scenes) {
    const id = `generated-${name}${suffix}`
    if ((await readCatalog()).some(item => item.id === id)) continue
    args.splice(0, args.length, '--id', id, '--file', join(output, 'generated', `${name}${suffix}.mp4`),
      '--origin', 'synthetic', '--truth', 'subjective', '--scenes', name,
      '--license', 'Locally generated FFmpeg lavfi test scenes by e2e/generate-quality-scenes.mjs; no external media',
      '--fps', '30', '--fps-source', 'e2e/generate-quality-scenes.mjs lavfi rate=30 (nominal)', '--end', '2.9')
    if (url) args.push('--url', url)
    await register()
  }
}

async function verifyGenerated() {
  const browser = await chromium.launch()
  const version = option('version') ?? 'v1'
  const selected = option('scene')
  if (!/^v[0-9]+$/.test(version) || (selected && !scenes.includes(selected))) throw new Error('Invalid scene or version')
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 250 } })
    await page.goto(option('url') ?? process.env.SANYE_FRONTEND_URL ?? 'http://127.0.0.1:5188')
    for (const name of selected ? [selected] : scenes) {
      const suffix = version === 'v1' ? '' : `-${version}`
      const file = join(output, 'generated', `${name}${suffix}.mp4`)
      await page.route('**/quality-generated.mp4', route => fulfillLocalMedia(route, file))
      const sample = await page.evaluate(async () => {
        const video = document.createElement('video'); video.muted = true
        document.body.replaceChildren(video)
        await new Promise((done, fail) => { video.onloadedmetadata = done; video.onerror = fail; video.src = '/quality-generated.mp4' })
        await new Promise(done => { video.onseeked = done; video.currentTime = 0.5 })
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const context = canvas.getContext('2d'); context.drawImage(video, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        const distinct = new Set()
        for (let i = 0; i < pixels.length; i += 80) distinct.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`)
        video.replaceWith(canvas)
        return { width: canvas.width, height: canvas.height, sampledColors: distinct.size }
      })
      await page.screenshot({ path: join(output, 'generated', `${name}${suffix}.png`) })
      await page.unroute('**/quality-generated.mp4')
      if (sample.width !== 320 || sample.height !== 180 || sample.sampledColors < 2) throw new Error(`Invalid scene pixels: ${name} ${JSON.stringify(sample)}`)
      console.log(JSON.stringify({ scene: name, ...sample }))
    }
  } finally { await browser.close() }
}

async function fingerprint() {
  const videoSources = (await readdir(videoDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => `sanye_client/src/video/${entry.name}`).sort()
  const files = ['e2e/player-quality-baseline.mjs', 'e2e/local-media-range.mjs', 'pnpm-lock.yaml', 'sanye_client/package.json', ...videoSources]
  const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, await fileHash(file.startsWith('sanye_client/src/video/')
    ? join(videoDirectory, file.split('/').at(-1)) : join(root, file))])))
  let gitHead = null
  try { gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() } catch {}
  const dist = join(root, 'sanye_client/dist')
  let buildSha256 = null
  try {
    const collected = []
    async function walk(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name)
      if (entry.isDirectory()) await walk(file)
      else if (entry.isFile()) collected.push([relative(dist, file).replaceAll('\\', '/'), await fileHash(file)])
    } }
    await walk(dist)
    buildSha256 = sha(JSON.stringify(collected.sort((a, b) => a[0].localeCompare(b[0]))))
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  return { gitHead, reference: reference ?? 'workspace', sourceSha256: sha(JSON.stringify(sources)), sources, buildSha256,
    buildMatchesServedSource: null, note: 'Build hash is an inventory of existing dist files; a development server serves source, not dist.' }
}

async function run() {
  const sample = (await readCatalog()).find(item => item.id === required('sample', option('sample')))
  if (!sample) throw new Error('Unknown sample; register it first')
  if (await fileHash(sample.file) !== sample.sha256) throw new Error('Sample checksum changed')
  const targetFps = option('target') === 'auto' ? 'auto' : Number(option('target') ?? 120)
  const profile = option('profile') ?? 'sharp'
  if (!['off', 'fast', 'balanced', 'sharp', 'restore', 'upscale'].includes(profile) || (targetFps !== 'auto' && ![60, 90, 120, 144, 165, 240].includes(targetFps))) throw new Error('Invalid profile or target')
  const seconds = Number(option('seconds') ?? 4)
  const sustainedSeconds = Number(option('sustained-seconds') ?? 30)
  if (!Number.isFinite(seconds) || !(seconds >= 2 && seconds <= 1800)
    || !Number.isFinite(sustainedSeconds) || !(sustainedSeconds >= 30 && sustainedSeconds <= 1800))
    throw new Error('Seconds must be 2..1800 and sustained-seconds 30..1800')
  const id = new Date().toISOString().replaceAll(':', '-') + '-' + process.pid
  const dir = join(output, id)
  await mkdir(dir, { recursive: true })
  const sourceFingerprint = await fingerprint()
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] })
  const cdp = await browser.newBrowserCDPSession()
  const processInfo = async () => {
    try { return (await cdp.send('SystemInfo.getProcessInfo')).processInfo } catch { return null }
  }
  const cpuDelta = (before, after, elapsedMs, logicalCores) => {
    if (!before || !after) return { processCpuTimeMs: null, processCpuPercentOneCore: null,
      processCpuPercentLogicalCapacity: null, processes: null }
    const byPid = new Map(before.map(process => [process.id, process.cpuTime]))
    const processes = after.filter(process => byPid.has(process.id)).map(process => ({ pid: process.id,
      type: process.type, cpuTimeMs: Math.max(0, (process.cpuTime - byPid.get(process.id)) * 1000) }))
    const processCpuTimeMs = processes.reduce((sum, process) => sum + process.cpuTimeMs, 0)
    return { processCpuTimeMs, processCpuPercentOneCore: elapsedMs > 0 ? processCpuTimeMs / elapsedMs * 100 : null,
      processCpuPercentLogicalCapacity: elapsedMs > 0 && logicalCores > 0 ? processCpuTimeMs / elapsedMs / logicalCores * 100 : null,
      processes, limitation: 'Chromium process time includes browser background work; new processes lack a starting sample.' }
  }
  const evidence = { schema: 1, id, sample: { ...sample, file: null, groundTruthFile: null },
    fingerprint: sourceFingerprint, parameters: { targetFps, profile, seconds, sustainedSeconds,
      warmupSeconds: 2, scenarios: ['cold', 'warm', 'sustained', 'interference'] },
    startedAt: new Date().toISOString(), clock: { stage: 'performance.now monotonic', unit: 'ms', workerCrossContext: 'performance.timeOrigin + performance.now' },
    device: null, scenarios: {}, limitations: { cpuProcessTimeMs: null, availableVramBytes: null, energyJoules: null,
      physicalDisplayFps: null, mediaDecodeMs: null } }
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/quality-sample.mp4', route => fulfillLocalMedia(route, sample.file))
    await page.goto(option('url') ?? process.env.SANYE_FRONTEND_URL ?? 'http://127.0.0.1:5188')
    evidence.device = await page.evaluate(() => {
      const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        gpuRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        gpuVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
        driverVersion: null, powerSource: null, display: { width: screen.width, height: screen.height, pixelRatio: devicePixelRatio,
        colorDepth: screen.colorDepth, estimatedRefreshHz: null }, browserVersion: navigator.userAgent }
    })
    if (process.platform === 'win32') {
      try {
        const adapters = JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command',
          'Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate | ConvertTo-Json -Compress'],
        { encoding: 'utf8', timeout: 10000 }))
        evidence.device.adapters = Array.isArray(adapters) ? adapters : [adapters]
        const adapter = evidence.device.adapters.find(item => evidence.device.gpuRenderer?.includes(item.Name)) ?? evidence.device.adapters[0]
        evidence.device.driverVersion = adapter?.DriverVersion ?? null
        evidence.device.display.estimatedRefreshHz = adapter?.CurrentRefreshRate ?? null
      } catch { evidence.device.adapters = null }
    }
    if (option('power')) {
      if (!['ac', 'battery'].includes(option('power'))) throw new Error('--power must be ac or battery')
      evidence.device.powerSource = option('power')
      evidence.device.powerSourceProvenance = 'operator-supplied during run'
    }
    let scenarioCpuStart = null, scenarioWallStart = null
    await page.exposeFunction('markQualityMeasurement', async () => {
      scenarioCpuStart = await processInfo()
      scenarioWallStart = performance.now()
    })
    for (const scenario of evidence.parameters.scenarios) {
      scenarioCpuStart = scenarioWallStart = null
      try {
        evidence.scenarios[scenario] = await page.evaluate(async ({ scenario, seconds, sustainedSeconds, sample, targetFps, profile, moduleUrl }) => {
          const { startRealtimeInterpolation, releaseInterpolationAudio } = await import(moduleUrl)
          const player = document.createElement('div'); player.className = 'art-video-player'
          const video = document.createElement('video'); video.muted = true
          player.append(video); document.body.replaceChildren(player)
          const stats = [], errors = [], longTasks = []
          let measurementStarted = false, measuredAt = 0
          const observer = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')
            ? new PerformanceObserver(list => { for (const entry of list.getEntries())
              if (measurementStarted && entry.startTime >= measuredAt) longTasks.push(entry.duration) }) : null
          observer?.observe({ entryTypes: ['longtask'] })
          let session, interference, loopCount = 0, videoFrameHandle = 0
          let firstMediaTime = null, minMediaTime = Infinity, maxMediaTime = -Infinity, outsideClipFrames = 0
          const waitStart = performance.now()
          try {
            if (scenario === 'cold') {
              await window.markQualityMeasurement()
              measuredAt = performance.now(); measurementStarted = true
            }
            await new Promise((done, fail) => { video.onloadedmetadata = done; video.onerror = () => fail(new Error('Sample could not be loaded')); video.src = '/quality-sample.mp4' })
            video.loop = sample.startSeconds === 0 && sample.endSeconds >= video.duration - 0.11
            video.addEventListener('timeupdate', () => {
              if (!video.loop && video.currentTime >= sample.endSeconds - 0.12) {
                loopCount++; video.currentTime = sample.startSeconds
              }
            })
            video.addEventListener('seeking', () => { if (video.loop && video.currentTime < 0.2 && measurementStarted) loopCount++ })
            if (sample.startSeconds > 0) await new Promise(done => { video.onseeked = done; video.currentTime = sample.startSeconds })
            const playbackStarted = performance.now()
            await video.play()
            const playbackReadyMs = performance.now() - playbackStarted
            const firstFrame = new Promise((done, fail) => {
              const timeout = setTimeout(() => fail(new Error('No decoded video frame after seek')), 5000)
              const observeFrame = (_now, metadata) => {
                const time = metadata.mediaTime
                if (firstMediaTime === null) { firstMediaTime = time; clearTimeout(timeout); done() }
                minMediaTime = Math.min(minMediaTime, time); maxMediaTime = Math.max(maxMediaTime, time)
                if (time < sample.startSeconds - 0.25 || time > sample.endSeconds + 0.25) outsideClipFrames++
                videoFrameHandle = video.requestVideoFrameCallback(observeFrame)
              }
              videoFrameHandle = video.requestVideoFrameCallback(observeFrame)
            })
            await firstFrame
            if (firstMediaTime < sample.startSeconds - 0.25 || firstMediaTime > sample.endSeconds)
              throw new Error(`Decoded frame at ${firstMediaTime}s did not match requested seek ${sample.startSeconds}s`)
            session = await startRealtimeInterpolation(video, { enhance: profile !== 'off', profile,
              targetFps, measureStages: true, onStats: value => {
                if (measurementStarted) stats.push({ atMs: performance.now() - waitStart, ...value })
              },
              onError: value => errors.push(value) })
            if (scenario === 'warm' || scenario === 'sustained') {
              await new Promise(done => setTimeout(done, 2000))
              stats.length = 0; longTasks.length = 0
            }
            if (scenario === 'interference') interference = setInterval(() => {
              const until = performance.now() + 12
              while (performance.now() < until) Math.sqrt(Math.random())
            }, 100)
            if (scenario !== 'cold') await window.markQualityMeasurement()
            const started = performance.now()
            if (scenario !== 'cold') measuredAt = started
            measurementStarted = true
            await new Promise(done => setTimeout(done, (scenario === 'sustained' ? sustainedSeconds : seconds) * 1000))
            const elapsedMs = performance.now() - started
            const memory = performance.memory?.usedJSHeapSize ?? null
            return { elapsedMs, playbackReadyMs, loopCount, firstMediaTime, minMediaTime, maxMediaTime,
              outsideClipFrames, completeWindows: stats.length,
              approximateWindowCoverage: Math.min(1, stats.length * 1000 / elapsedMs),
              stats, errors, longTasksMs: longTasks,
              mainThreadJsHeapBytes: memory, active: player.classList.contains('sanye-realtime-interpolation-active'),
              videoTimeSeconds: video.currentTime, inputDimensions: [video.videoWidth, video.videoHeight] }
          } finally { if (interference) clearInterval(interference); if (videoFrameHandle) video.cancelVideoFrameCallback(videoFrameHandle)
            observer?.disconnect(); session?.stop();
            releaseInterpolationAudio(video); video.pause(); video.removeAttribute('src'); video.load() }
        }, { scenario, seconds, sustainedSeconds, sample, targetFps, profile,
          moduleUrl: reference ? `/@fs/${videoDirectory.replaceAll('\\', '/')}/realtimeInterpolation.ts` : '/src/video/realtimeInterpolation.ts' })
      } catch (error) { evidence.scenarios[scenario] = { error: String(error) } }
      evidence.scenarios[scenario].cpu = cpuDelta(scenarioCpuStart, await processInfo(),
        scenarioWallStart === null ? 0 : performance.now() - scenarioWallStart, evidence.device.hardwareConcurrency)
      await writeFile(join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
    }
  } finally {
    try {
      evidence.finishedAt = new Date().toISOString()
      evidence.finishedFingerprint = await fingerprint()
      evidence.sourceChangedDuringRun = evidence.fingerprint.sourceSha256 !== evidence.finishedFingerprint.sourceSha256
      await writeFile(join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
    } finally { await browser.close() }
  }
  console.log(join(dir, 'evidence.json'))
  if (evidence.sourceChangedDuringRun || Object.values(evidence.scenarios).some(value => value.error || value.errors?.length || !value.stats?.length)) process.exitCode = 1
}

async function compare() {
  const baseline = JSON.parse(await readFile(resolve(required('baseline', option('baseline'))), 'utf8'))
  const candidate = JSON.parse(await readFile(resolve(required('candidate', option('candidate'))), 'utf8'))
  if (baseline.sourceChangedDuringRun !== false || candidate.sourceChangedDuringRun !== false)
    throw new Error('Source stability is missing or changed during a run; collect a stable baseline before comparison')
  const environment = run => ({ gpuRenderer: run.device.gpuRenderer, driverVersion: run.device.driverVersion,
    powerSource: run.device.powerSource, display: run.device.display, userAgent: run.device.userAgent })
  const unknowns = ['gpuRenderer', 'driverVersion', 'powerSource'].filter(key => environment(baseline)[key] == null || environment(candidate)[key] == null)
  if (unknowns.length && option('allow-unknown-environment') !== 'true') throw new Error(`Environment unverified (${unknowns.join(', ')}); record external power state in evidence or pass --allow-unknown-environment true for exploratory comparison`)
  if (baseline.sample.sha256 !== candidate.sample.sha256 || baseline.sample.startSeconds !== candidate.sample.startSeconds
    || baseline.sample.endSeconds !== candidate.sample.endSeconds || JSON.stringify(baseline.parameters) !== JSON.stringify(candidate.parameters)
    || JSON.stringify(environment(baseline)) !== JSON.stringify(environment(candidate)))
    throw new Error('Sample, parameters or device differ; cannot compare directly')
  const dimensions = run => run.parameters.scenarios.map(key => [...new Set(run.scenarios[key]?.stats?.map(s =>
    JSON.stringify([s.outputWidth, s.outputHeight, s.effectiveProfile])) ?? [])].sort())
  if (JSON.stringify(dimensions(baseline)) !== JSON.stringify(dimensions(candidate)))
    throw new Error('Output dimensions or effective profiles differ; inspect fallback and compare separately')
  const result = { baseline: baseline.id, candidate: candidate.id, environmentVerified: unknowns.length === 0,
    unknownEnvironment: unknowns, sourceChanged: baseline.fingerprint.sourceSha256 !== candidate.fingerprint.sourceSha256,
    scenarios: Object.fromEntries(baseline.parameters.scenarios.map(key => {
      const summarize = run => ({ windows: run.scenarios[key]?.stats?.length ?? 0,
        outputFps: run.scenarios[key]?.stats?.map(s => s.outputFps) ?? [],
        effectiveTargetFps: run.scenarios[key]?.stats?.map(s => s.targetFps) ?? [],
        effectiveProfiles: run.scenarios[key]?.stats?.map(s => s.effectiveProfile) ?? [],
        qualityFallbacks: run.scenarios[key]?.stats?.at(-1)?.qualityFallbacks ?? null,
        ownedTextureBytes: run.scenarios[key]?.stats?.map(s => s.resources?.ownedTextureBytes ?? null) ?? [],
        textureAllocationsTotal: run.scenarios[key]?.stats?.at(-1)?.resources?.textureAllocations ?? null,
        frameIntervalP95Ms: run.scenarios[key]?.stats?.map(s => s.frameIntervalP95Ms) ?? [],
        scheduleLateP95Ms: run.scenarios[key]?.stats?.map(s => s.scheduleLateP95Ms) ?? [],
        presentationClock: run.scenarios[key]?.stats?.map(s => s.presentationClock ?? null) ?? [],
        refreshHz: run.scenarios[key]?.stats?.map(s => s.refreshHz ?? null) ?? [],
        refreshTicks: run.scenarios[key]?.stats?.map(s => s.refreshTicks ?? null) ?? [],
        timerWakeups: run.scenarios[key]?.stats?.map(s => s.timerWakeups ?? null) ?? [],
        earlyWakeups: run.scenarios[key]?.stats?.map(s => s.earlyWakeups ?? null) ?? [],
        skippedSlots: run.scenarios[key]?.stats?.map(s => s.skippedSlots ?? null) ?? [],
        renderTickP95Ms: run.scenarios[key]?.stats?.map(s => s.renderTickP95Ms ?? null) ?? [],
        renderTickMaxMs: run.scenarios[key]?.stats?.map(s => s.renderTickMaxMs ?? null) ?? [],
        longRenderTicks: run.scenarios[key]?.stats?.map(s => s.longRenderTicks ?? null) ?? [],
        longFrameRatio: run.scenarios[key]?.stats?.map(s => s.longFrameRatio ?? null) ?? [],
        gpuCompleteMs: run.scenarios[key]?.stats?.map(s => s.gpuMs) ?? [],
        missedPairs: run.scenarios[key]?.stats?.map(s => s.missedPairs) ?? [],
        cpuProcessTimeMs: run.scenarios[key]?.cpu?.processCpuTimeMs ?? null,
        cpuPercentLogicalCapacity: run.scenarios[key]?.cpu?.processCpuPercentLogicalCapacity ?? null,
        uploadP95Ms: run.scenarios[key]?.stats?.map(s => s.measurement?.uploadP95Ms ?? null) ?? [],
        errors: run.scenarios[key]?.errors ?? [run.scenarios[key]?.error ?? 'missing'] })
      return [key, { baseline: summarize(baseline), candidate: summarize(candidate) }]
    })) }
  console.log(JSON.stringify(result, null, 2))
}

try {
  if (command === 'register') await register()
  else if (command === 'register-generated') await registerGenerated()
  else if (command === 'verify-generated') await verifyGenerated()
  else if (command === 'run') await run()
  else if (command === 'compare') await compare()
  else throw new Error('Usage: node e2e/player-quality-baseline.mjs register|run|compare --options')
} catch (error) { console.error(error); process.exitCode = 1 }
