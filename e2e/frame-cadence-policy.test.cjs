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

test('a downgraded cadence never climbs back during playback', () => {
  const FrameCadence = loadPolicy()
  const policy = new FrameCadence('auto')
  policy.observeDisplay(165)
  observeAfterWarmup(policy, { outputFps: 80, gpuMs: 11, sourceFps: 30 }, 4)
  const reduced = policy.target
  assert.ok(reduced < 120)
  // 稳定优先（VQ-32）：降档后即使长时间有余量也不回升，避免呈现节奏随负载来回变化。
  for (let index = 0; index < 600; index++) policy.observe({ outputFps: reduced, gpuMs: 0.5, sourceFps: 30, frameIntervalP95Ms: 1000 / reduced })
  assert.equal(policy.target, reduced)
  assert.ok(policy.target <= 165)
  // 新播放段（reset）才回到请求档位与刷新能力允许的目标。
  policy.reset()
  assert.equal(policy.target, 165, '自动档在 165Hz 能力上回到能力上限')
})

test('the automatic target never exceeds the measured display capability', () => {
  const FrameCadence = loadPolicy()
  const sixtyHz = new FrameCadence('auto')
  sixtyHz.observeDisplay(60)
  assert.equal(sixtyHz.ceiling, 60, '60Hz 屏幕的自动上限是 60')
  assert.equal(sixtyHz.target, 60, '自动档必须按刷新能力运行')

  const highRefresh = new FrameCadence('auto')
  highRefresh.observeDisplay(165)
  assert.equal(highRefresh.target, 165, '自动档在 165Hz 能力上对齐能力上限')

  // 显式档位沿用用户请求：高于刷新能力时由呈现对齐把可见节奏放回刷新边界（VQ-31）。
  const capped240 = new FrameCadence(240)
  capped240.observeDisplay(120)
  assert.equal(capped240.target, 240, '显式 240 档保持请求目标，呈现口径由 VQ-31 约束')
})

test('one low refresh estimate does not disturb automatic cadence, but a confirmed display change does', () => {
  const FrameCadence = loadPolicy()
  const policy = new FrameCadence('auto')
  policy.observeDisplay(165)
  policy.observeDisplay(60)
  assert.equal(policy.target, 165)
  policy.observeDisplay(165)
  assert.equal(policy.target, 165)
  policy.observeDisplay(60)
  policy.observeDisplay(60)
  assert.equal(policy.target, 60)
  assert.equal(policy.displayHz, 60)
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
  // Cost grows with the analysed area (pyramid plus four LK passes measure steeper
  // than area in the observed range), so feed the cost of the rung currently in use.
  // A machine at 2 ms on the coarsest rung must climb until the next rung would
  // exceed the source frame interval, and then stay there.
  const referenceMs = 2
  const costAt = width => referenceMs * (width / 128) ** 2.6
  let previousWidth = policy.targetWidth
  let promotions = 0
  for (let index = 0; index < 600; index++) {
    const width = policy.targetWidth
    if (width !== previousWidth) { promotions++; previousWidth = width }
    policy.observe(costAt(width), 30)
  }
  assert.equal(policy.targetWidth, 256, 'idle compute must settle on the affordable rung, not the top rung')
  assert.equal(promotions, 2, 'the ladder must climb one rung at a time and stop')
  assert.equal(policy.widthFor(320), 256, 'a narrower source is capped by the validated rung')
  assert.equal(policy.widthFor(192), 192, 'analysis width never exceeds the source width')
  // A genuinely faster machine must be allowed to buy more detail at the same source rate.
  const faster = new scope.exports.FlowAnalysisPolicy()
  const fasterCostAt = width => 0.7 * (width / 128) ** 2.6
  for (let index = 0; index < 400; index++) faster.observe(fasterCostAt(faster.targetWidth), 30)
  assert.ok(faster.targetWidth > policy.targetWidth,
    `more measured headroom must buy a finer field: fast=${faster.targetWidth} baseline=${policy.targetWidth}`)
  policy.reset()
  assert.equal(policy.targetWidth, 256, 'seek and pause preserve validated precision')
  policy.reset(false)
  assert.equal(policy.targetWidth, 128, 'source size changes start at warmup detail')
  for (let index = 0; index < 4; index++) policy.observe(40, 48)
  assert.equal(policy.targetWidth, 128, 'initial samples are not sufficient to downgrade')
  const narrowCost = width => 1.5 * (width / 128) ** 2.6
  for (let index = 0; index < 100; index++) policy.observe(narrowCost(policy.targetWidth), 48)
  assert.equal(policy.targetWidth, 256, 'an idle 48 FPS source climbs to the affordable rung')
  for (let index = 0; index < 7; index++) policy.observe(40, 48)
  assert.equal(policy.targetWidth, 256, 'a short compute spike does not immediately discard detail')
  policy.observe(40, 48)
  assert.equal(policy.targetWidth, 192, 'sustained overrun demotes exactly one rung')
  for (let index = 0; index < 359; index++) policy.observe(narrowCost(policy.targetWidth), 48)
  assert.equal(policy.targetWidth, 192, 'an overloaded detail level needs a cooldown before re-promotion')
  policy.observe(narrowCost(192), 48)
  assert.equal(policy.targetWidth, 192, 'cooldown expiry alone must not retry the same rejected precision')
  const recoveredCost = width => 0.9 * (width / 128) ** 2.6
  for (let index = 0; index < 240; index++) policy.observe(recoveredCost(policy.targetWidth), 48)
  assert.equal(policy.targetWidth, 256, 'materially improved compute capacity can recover reduced detail')
})

test('flow analysis does not oscillate into a precision level that already exceeded budget', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/flowAnalysisPolicy.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  const policy = new scope.exports.FlowAnalysisPolicy()

  // 60 FPS leaves a 16.7 ms frame interval; 2.5 ms on the coarsest rung leaves room
  // for exactly one more rung before the projected cost crosses the margin.
  const costAt = width => 2.5 * (width / 128) ** 2.6
  for (let index = 0; index < 4; index++) policy.observe(costAt(128), 60)
  for (let index = 0; index < 120; index++) policy.observe(costAt(policy.targetWidth), 60)
  assert.equal(policy.targetWidth, 192, 'high source FPS does not impose a low-detail ceiling when compute has headroom')
  for (let index = 0; index < 8; index++) policy.observe(12, 60)
  assert.equal(policy.targetWidth, 128)

  for (let index = 0; index < 720; index++) policy.observe(costAt(policy.targetWidth), 60)
  assert.equal(policy.targetWidth, 128, 'the same measured capacity must not repeatedly retry a rejected precision')
  // The machine gets materially faster: the same rung now costs a third as much.
  const improvedCostAt = width => 1.0 * (width / 128) ** 2.6
  for (let index = 0; index < 240; index++) policy.observe(improvedCostAt(policy.targetWidth), 60)
  assert.equal(policy.targetWidth, 256, 'a material compute improvement allows the rejected precision to recover')
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
  policy.observeDisplay(144)
  observeAfterWarmup(policy, { outputFps: 100, gpuMs: 9, sourceFps: 30 }, 4)
  const reduced = policy.target
  assert.ok(reduced < 120)
  // 120 目标落在 144Hz 刷新边界上时间隔按刷新周期交替，P95 间隔约为两个刷新周期。
  for (let index = 0; index < 60; index++)
    policy.observe({ outputFps: reduced, gpuMs: 0.5, sourceFps: 30, frameIntervalP95Ms: 1000 / reduced * 2, longFrameRatio: 0 })
  assert.equal(policy.target, reduced, '刷新边界交替不是长帧，但降档后不再回升')

  const legacy = new FrameCadence(120)
  legacy.observeDisplay(144)
  observeAfterWarmup(legacy, { outputFps: 100, gpuMs: 9, sourceFps: 30 }, 4)
  const legacyReduced = legacy.target
  for (let index = 0; index < 20; index++)
    legacy.observe({ outputFps: legacyReduced, gpuMs: 0.5, sourceFps: 30, frameIntervalP95Ms: 1000 / legacyReduced * 2 })
  assert.equal(legacy.target, legacyReduced, '缺少长帧比例时仍按原有 P95 间隔口径判定抖动')

  const unstable = new FrameCadence(120)
  unstable.observeDisplay(144)
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
