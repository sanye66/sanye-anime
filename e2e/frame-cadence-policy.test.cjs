const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

function loadPolicy() {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/frameCadence.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports.FrameCadence
}

function observeAfterWarmup(policy, sample, count = 3) {
  for (let index = 0; index < count; index++) policy.observe(sample)
}

test('cadence policy distinguishes source delivery, flow, enhancement and render pressure', () => {
  const FrameCadence = loadPolicy()

  const delivery = new FrameCadence('auto')
  observeAfterWarmup(delivery, { outputFps: 72, gpuMs: 1, sourceFps: 24, missedPairs: 30, frameIntervalP95Ms: 30 })
  assert.equal(delivery.target, 120, 'lower cadence cannot repair missing source pairs')
  assert.equal(delivery.bottleneck, 'delivery')

  const flow = new FrameCadence('auto')
  observeAfterWarmup(flow, { outputFps: 75, gpuMs: 1, sourceFps: 30, computeMs: 24, droppedSourceFrames: 3 })
  assert.equal(flow.target, 120, 'analysis precision should adapt before presentation cadence')
  assert.equal(flow.bottleneck, 'flow')

  const enhancement = new FrameCadence('auto')
  observeAfterWarmup(enhancement, { outputFps: 76, gpuMs: 1, sourceFps: 30, enhancementMs: 24 })
  assert.equal(enhancement.target, 120, 'enhancement fallback should run before cadence downgrade')
  assert.equal(enhancement.bottleneck, 'enhancement')

  const render = new FrameCadence(165)
  observeAfterWarmup(render, { outputFps: 125, gpuMs: 7, sourceFps: 30, scheduleLateP95Ms: 6 }, 4)
  assert.ok(render.target < 165)
  assert.equal(render.bottleneck, 'render')
  assert.match(render.reason, /\u6e32\u67d3\u5e27\u9884\u7b97/)

  const onTarget = new FrameCadence(165)
  observeAfterWarmup(onTarget, { outputFps: 165, gpuMs: 4, sourceFps: 30, scheduleLateP95Ms: 5, frameIntervalP95Ms: 10 }, 5)
  assert.equal(onTarget.target, 165, 'phase jitter must not downgrade cadence while measured throughput is on target')
  assert.equal(onTarget.bottleneck, 'none')
})

test('cadence recovery is conservative and bounded by measured display refresh', () => {
  const FrameCadence = loadPolicy()
  const policy = new FrameCadence('auto')
  policy.observeDisplay(165)
  observeAfterWarmup(policy, { outputFps: 80, gpuMs: 11, sourceFps: 30 }, 4)
  const reduced = policy.target
  assert.ok(reduced < 120)
  for (let index = 0; index < 19; index++) policy.observe({ outputFps: reduced, gpuMs: 0.5, sourceFps: 30, frameIntervalP95Ms: 1000 / reduced })
  assert.equal(policy.target, reduced)
  policy.observe({ outputFps: reduced, gpuMs: 0.5, sourceFps: 30, frameIntervalP95Ms: 1000 / reduced })
  assert.ok(policy.target > reduced)
  assert.ok(policy.target <= 165)
})

test('flow analysis uses hysteresis to trade compute for detail and stays bounded by source width', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/flowAnalysisPolicy.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  const policy = new scope.exports.FlowAnalysisPolicy()
  assert.equal(policy.widthFor(1920), 128)
  observeAfterWarmup({ observe: sample => policy.observe(sample.computeMs, sample.sourceFps) }, { computeMs: 25, sourceFps: 30 })
  assert.equal(policy.widthFor(1920), 128)
  policy.observe(25, 30)
  for (let level = 0; level < 3; level++) {
    for (let index = 0; index < 119; index++) policy.observe(2, 30)
    assert.equal(policy.targetWidth, [128, 192, 256][level])
    policy.observe(2, 30)
  }
  assert.equal(policy.targetWidth, 384)
  assert.equal(policy.widthFor(320), 320)
  for (let index = 0; index < 180; index++) policy.observe(1, 30)
  assert.equal(policy.targetWidth, 384)
  policy.reset()
  assert.equal(policy.targetWidth, 384, 'seek and pause preserve validated precision')
  policy.reset(false)
  assert.equal(policy.targetWidth, 128, 'source size changes start at warmup detail')
  for (let index = 0; index < 4; index++) policy.observe(40, 48)
  assert.equal(policy.targetWidth, 128, 'initial samples are not sufficient to downgrade')
  for (let index = 0; index < 120; index++) policy.observe(2, 48)
  assert.equal(policy.targetWidth, 192)
  for (let index = 0; index < 7; index++) policy.observe(40, 48)
  assert.equal(policy.targetWidth, 192, 'a short compute spike does not immediately discard detail')
  policy.observe(40, 48)
  assert.equal(policy.targetWidth, 128)
  for (let index = 0; index < 359; index++) policy.observe(2, 48)
  assert.equal(policy.targetWidth, 128, 'an overloaded detail level needs a cooldown before re-promotion')
  policy.observe(2, 48)
  assert.equal(policy.targetWidth, 128, 'cooldown expiry alone must not retry the same rejected precision')
  for (let index = 0; index < 240; index++) policy.observe(1.2, 48)
  assert.equal(policy.targetWidth, 192, 'materially improved compute capacity can recover reduced detail')
})

test('flow analysis does not oscillate into a precision level that already exceeded budget', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/flowAnalysisPolicy.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  const policy = new scope.exports.FlowAnalysisPolicy()

  for (let index = 0; index < 4; index++) policy.observe(2.5, 60)
  for (let index = 0; index < 120; index++) policy.observe(2.5, 60)
  assert.equal(policy.targetWidth, 192, 'high source FPS does not impose a low-detail ceiling when compute has headroom')
  for (let index = 0; index < 8; index++) policy.observe(12, 60)
  assert.equal(policy.targetWidth, 128)

  for (let index = 0; index < 720; index++) policy.observe(2.5, 60)
  assert.equal(policy.targetWidth, 128, 'the same measured capacity must not repeatedly retry a rejected precision')
  for (let index = 0; index < 240; index++) policy.observe(1.5, 60)
  assert.equal(policy.targetWidth, 192, 'a material compute improvement allows the rejected precision to recover')
})

test('cadence reset recovers a transient low target while honoring display and requested ceilings', () => {
  const FrameCadence = loadPolicy()
  const policy = new FrameCadence('auto')
  policy.observeDisplay(90)
  observeAfterWarmup(policy, { outputFps: 65, gpuMs: 13, sourceFps: 48 }, 4)
  assert.equal(policy.target, 60)
  policy.reset()
  assert.equal(policy.target, 90)
  assert.equal(policy.bottleneck, 'none')
  assert.equal(policy.reason, '')
})

test('display-aligned alternation is judged by long-frame ratio instead of interval P95', () => {
  const FrameCadence = loadPolicy()
  const policy = new FrameCadence(120)
  observeAfterWarmup(policy, { outputFps: 100, gpuMs: 9, sourceFps: 30 }, 4)
  const reduced = policy.target
  assert.ok(reduced < 120)
  // 120 目标落在 144Hz 刷新边界上时间隔按刷新周期交替，P95 间隔约为两个刷新周期。
  for (let index = 0; index < 19; index++)
    policy.observe({ outputFps: reduced, gpuMs: 0.5, sourceFps: 30, frameIntervalP95Ms: 1000 / reduced * 2, longFrameRatio: 0 })
  assert.equal(policy.target, reduced, '升降档仍需连续稳定窗口，单窗口不来回切换')
  policy.observe({ outputFps: reduced, gpuMs: 0.5, sourceFps: 30, frameIntervalP95Ms: 1000 / reduced * 2, longFrameRatio: 0 })
  assert.ok(policy.target > reduced, '刷新边界交替不是长帧，不应阻止稳定恢复')

  const legacy = new FrameCadence(120)
  observeAfterWarmup(legacy, { outputFps: 100, gpuMs: 9, sourceFps: 30 }, 4)
  const legacyReduced = legacy.target
  for (let index = 0; index < 20; index++)
    legacy.observe({ outputFps: legacyReduced, gpuMs: 0.5, sourceFps: 30, frameIntervalP95Ms: 1000 / legacyReduced * 2 })
  assert.equal(legacy.target, legacyReduced, '缺少长帧比例时仍按原有 P95 间隔口径判定抖动')

  const unstable = new FrameCadence(120)
  observeAfterWarmup(unstable, { outputFps: 100, gpuMs: 3, sourceFps: 30, longFrameRatio: 0.2 }, 4)
  assert.ok(unstable.target < 120, '长帧比例过高仍必须降档')
  assert.equal(unstable.bottleneck, 'render')
})

test('sustained long render ticks count as render pressure', () => {
  const FrameCadence = loadPolicy()
  const policy = new FrameCadence(120)
  observeAfterWarmup(policy, { outputFps: 118, gpuMs: 2, sourceFps: 30, renderTickP95Ms: 5.2 }, 4)
  assert.ok(policy.target < 120)
  assert.equal(policy.bottleneck, 'render')
  assert.match(policy.reason, /\u6e32\u67d3\u5e27\u9884\u7b97/)
})
