const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

function loadModule(file) {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video', file), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports
}

/**
 * 覆盖 VQ-49：GPU 网格上限只在后端被确认后放宽、实际档位仍受实测余量门控；
 * 画面波动的自愈护栏只在连续两个 GPU 脏窗口后回退，且 CPU 窗口与干净窗口都不累计。
 */
test('GPU 后端确认后才放宽运动分析网格，且升档仍受余量门控', () => {
  const { FlowAnalysisPolicy } = loadModule('flowAnalysisPolicy.ts')
  const settle = (policy, computeMs, samples = 400) => {
    for (let index = 0; index < samples; index++) policy.observe(computeMs, 30)
    return policy.targetWidth
  }
  // 同一份「余量充足」的样本：CPU 上限停在 192，GPU 上限才允许到 256。
  assert.equal(settle(new FlowAnalysisPolicy({ maxWidth: 192 }), 1.5), 192)
  const gpu = new FlowAnalysisPolicy({ maxWidth: 256 })
  assert.equal(settle(gpu, 1.5), 256)
  // 后端回到 CPU 时立即收回上限，不得停在界外。
  gpu.setMaxWidth(192)
  assert.equal(gpu.targetWidth, 192, '收回上限后目标网格必须立即降回界内')
  // 没有余量时即使上限放宽也不升档：稳定性优先于网格精度。
  assert.equal(settle(new FlowAnalysisPolicy({ maxWidth: 256 }), 30), 128, '实测超预算时不得升档')
})

test('GPU 波动护栏只在连续两个脏窗口后回退', () => {
  const { MotionStabilityPolicy } = loadModule('motionStabilityPolicy.ts')
  const policy = new MotionStabilityPolicy()
  assert.equal(policy.observe({ backend: 'webgpu', contentBacksteps: 1, contentJumps: 0 }), null,
    '一次内容倒退不能立刻判定后端有问题')
  assert.equal(policy.observe({ backend: 'webgpu', contentBacksteps: 0, contentJumps: 0 }), null)
  assert.equal(policy.consecutiveArtifacts, 0, '干净窗口要清空连续计数')
  assert.equal(policy.observe({ backend: 'webgpu', contentBacksteps: 1 }), null)
  assert.equal(policy.observe({ backend: 'webgpu', contentJumps: 2 }), 'cpu', '连续两个脏窗口才回退')
})

test('CPU 窗口与重置不参与 GPU 判定', () => {
  const { MotionStabilityPolicy } = loadModule('motionStabilityPolicy.ts')
  const policy = new MotionStabilityPolicy()
  assert.equal(policy.observe({ backend: 'jsfeat', contentBacksteps: 3, contentJumps: 3 }), null, 'CPU 窗口不判定')
  assert.equal(policy.observe({ backend: '', contentBacksteps: 2 }), null, '未交付运动场的窗口不判定')
  assert.equal(policy.consecutiveArtifacts, 0)
  assert.equal(policy.observe({ backend: 'webgpu', contentBacksteps: 1 }), null)
  policy.reset()
  assert.equal(policy.consecutiveArtifacts, 0, '重置后连续计数归零')
  assert.equal(policy.observe({ backend: 'webgpu', contentBacksteps: 1 }), null)
  // 运动场迟到（VQ-55）：先稳定模式重试，再迟到才回 CPU，不能把延迟当成场不对。
  assert.equal(policy.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 2 }), 'retry')
  assert.equal(policy.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 2 }), null)
  assert.equal(policy.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 2 }), 'cpu')
})

/**
 * 覆盖 VQ-58：用户要求「不出现任何画面抖动」，而 Worker 的统计窗口每次上报都会清零计数，
 * 因此必须由页面侧累加成会话总量才可能回答「这次播放抖没抖」。这里锁定累计口径。
 */
test('播放稳定性累计：窗口计数求和、最大值取最大、后端变化只在非空之间计数', () => {
  const { createPlaybackStabilityTally, accumulatePlaybackStabilityTally } = loadModule('playbackStabilityTally.ts')
  const tally = createPlaybackStabilityTally()
  accumulatePlaybackStabilityTally(tally, {
    flowBackend: 'webgpu', effectiveProfile: 'balanced', contentHolds: 0, contentJumps: 2, contentBacksteps: 0,
    contentFreezeRuns: 0, contentFreezeMaxFrames: 0, contentFreezeFrames: 0, schedulerStarvation: 0, skippedSlots: 1,
    longRenderTicks: 3, renderTickMaxMs: 21.5, frameIntervalMaxMs: 40, stallFrames: 0, flowStarvedFrames: 4,
    flowBorrowedFrames: 3, qualityChange: '',
  })
  // 结束/开始窗口里后端为空代表「本窗口没有交付运动场」，不是换后端。
  accumulatePlaybackStabilityTally(tally, { flowBackend: '', effectiveProfile: 'balanced', longRenderTicks: 1, renderTickMaxMs: 18 })
  accumulatePlaybackStabilityTally(tally, {
    flowBackend: 'jsfeat', effectiveProfile: 'fast', longRenderTicks: 0, renderTickMaxMs: 12, frameIntervalMaxMs: 33,
    schedulerStarvation: 2, contentBacksteps: 1, qualityChange: 'downgrade',
  })
  assert.equal(tally.windows, 3)
  assert.equal(tally.contentJumps, 2)
  assert.equal(tally.contentBacksteps, 1, '倒退次数按窗口累加')
  assert.equal(tally.schedulerStarvation, 2)
  assert.equal(tally.skippedSlots, 1)
  assert.equal(tally.longRenderTicks, 4)
  assert.equal(tally.renderTickMaxMs, 21.5, '最坏渲染节拍取最大值')
  assert.equal(tally.frameIntervalMaxMs, 40)
  assert.equal(tally.flowStarvedFrames, 4, '迟到帧数要累加，用于判断抖动是否来自运动场延迟')
  assert.equal(tally.flowBorrowedFrames, 3)
  assert.equal(tally.backendSwitches, 1, 'webgpu → jsfeat 算一次后端切换')
  assert.equal(tally.qualityDowngrades, 1)
  assert.equal(tally.lastBackend, 'jsfeat')
  assert.equal(tally.lastProfile, 'fast')
})

test('播放稳定性累计：干净窗口不产生任何抖动计数', () => {
  const { createPlaybackStabilityTally, accumulatePlaybackStabilityTally } = loadModule('playbackStabilityTally.ts')
  const tally = createPlaybackStabilityTally()
  for (let index = 0; index < 5; index++) {
    accumulatePlaybackStabilityTally(tally, {
      flowBackend: 'webgpu', effectiveProfile: 'balanced', contentHolds: 0, contentJumps: 0, contentBacksteps: 0,
      contentFreezeRuns: 0, contentFreezeMaxFrames: 0, contentFreezeFrames: 0, schedulerStarvation: 0,
      skippedSlots: 0, longRenderTicks: 0, renderTickMaxMs: 6, frameIntervalMaxMs: 17, stallFrames: 0,
      flowStarvedFrames: 0, flowBorrowedFrames: 0, qualityChange: '',
    })
  }
  assert.equal(tally.windows, 5)
  for (const key of ['contentHolds', 'contentJumps', 'contentBacksteps', 'contentFreezeRuns', 'contentFreezeMaxFrames',
    'contentFreezeFrames', 'schedulerStarvation', 'skippedSlots', 'longRenderTicks', 'stallFrames',
    'flowStarvedFrames', 'flowBorrowedFrames', 'backendSwitches', 'qualityDowngrades']) {
    assert.equal(tally[key], 0, key + ' 必须保持 0')
  }
})
