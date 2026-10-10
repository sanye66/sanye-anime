/**
 * 播放策略层纯逻辑单测（VQ-52 建立）。
 *
 * 这些模块是不依赖 WebGL/Worker 的判定本体，直接用 node 的类型擦除能力导入 TS 源码运行，
 * 因此可以在毫秒级跑完，作为播放管线改动的第一道门禁——此前管线只有需要浏览器与真机源片的
 * e2e 用例，且没有一条进入 CI，改判定语义只能靠人工验证。
 *
 * 覆盖三件在真实反馈里出过问题的事：
 * 1. 增强档位降档只能由「持续超预算」触发，瞬时抖动不降档，且降档后必须重新累积。
 * 2. 地板档（没有更省的处理链）必须显式返回 null，调用方据此走正常交付而不是丢帧。
 * 3. 帧率目标只降不升，播放段内不回升，只有新播放段才恢复。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { EnhancementBudgetPolicy } from '../sanye_client/src/video/enhancementBudgetPolicy.ts'
import { nextLowerProfile, ANDROID_ENHANCEMENT_LIMITS } from '../sanye_client/src/video/enhancementLimits.ts'
import { JudgementGrace } from '../sanye_client/src/video/judgementGrace.ts'
import { presentationStale, PRESENTATION_LAG_TOLERANCE_MS } from '../sanye_client/src/video/presentationWatchdog.ts'
import { FrameCadence, frameRateTargetsForDisplay } from '../sanye_client/src/video/frameCadence.ts'
import { MotionStabilityPolicy } from '../sanye_client/src/video/motionStabilityPolicy.ts'
import { InterpolationDelayPolicy } from '../sanye_client/src/video/interpolationDelayPolicy.ts'

const budgetSample = (nowMs, enhancementMs, budgetMs = 16, queueDepth = 0) => ({ nowMs, enhancementMs, budgetMs, queueDepth })

test('增强预算：健康管线始终不降档', () => {
  const policy = new EnhancementBudgetPolicy()
  for (let i = 0; i < 40; i++) {
    assert.equal(policy.observe(budgetSample(i * 50, 4)), 'hold', '健康管线不应降档')
  }
})

test('增强预算：单帧尖峰不降档，恢复后压力段清零', () => {
  const policy = new EnhancementBudgetPolicy()
  assert.equal(policy.observe(budgetSample(0, 40)), 'hold')
  assert.equal(policy.observe(budgetSample(100, 2)), 'hold')
  assert.equal(policy.observe(budgetSample(200, 2)), 'hold')
  assert.equal(policy.snapshot(200).samples, 0, '恢复后压力段应清零')
})

test('增强预算：持续超预算满 pressureMs 与样本数才降档一次', () => {
  const policy = new EnhancementBudgetPolicy()
  assert.equal(policy.observe(budgetSample(0, 40)), 'hold')
  assert.equal(policy.observe(budgetSample(300, 40)), 'hold')
  assert.equal(policy.observe(budgetSample(700, 40)), 'hold', '时长够了但样本数不足时不降档')
  assert.equal(policy.observe(budgetSample(900, 40)), 'downgrade')
  assert.equal(policy.observe(budgetSample(1000, 40)), 'hold', '一次压力段只降一档')
})

test('增强预算：队列积压独立触发降档', () => {
  const policy = new EnhancementBudgetPolicy()
  policy.observe(budgetSample(0, 0, 16, 6))
  policy.observe(budgetSample(300, 0, 16, 6))
  assert.equal(policy.observe(budgetSample(900, 0, 16, 6)), 'downgrade')
})

test('增强预算：noteDowngrade 重新开窗（地板档不丢帧的前提）', () => {
  const policy = new EnhancementBudgetPolicy()
  policy.observe(budgetSample(0, 40))
  policy.observe(budgetSample(300, 40))
  assert.equal(policy.observe(budgetSample(900, 40)), 'downgrade')
  policy.noteDowngrade()
  assert.equal(policy.observe(budgetSample(1000, 40)), 'hold', 'noteDowngrade 后必须重新累积')
})

test('增强预算：安卓限制沿用更长的压力窗口', () => {
  const policy = new EnhancementBudgetPolicy(ANDROID_ENHANCEMENT_LIMITS.budget)
  assert.equal(ANDROID_ENHANCEMENT_LIMITS.budget.pressureMs, 2000)
  policy.observe(budgetSample(0, 40))
  policy.observe(budgetSample(1000, 40))
  assert.equal(policy.observe(budgetSample(1900, 40)), 'hold', '安卓端 1.9s 还不该降档')
  assert.equal(policy.observe(budgetSample(2100, 40)), 'downgrade')
})

test('档位链：地板档必须返回 null，调用方不能按「已降档」处理', () => {
  assert.equal(nextLowerProfile('upscale', false), 'restore')
  assert.equal(nextLowerProfile('restore', false), 'fast')
  // 性能档就是地板：继续按降档分支返回会让当前帧既不呈现也不释放。
  assert.equal(nextLowerProfile('fast', false), null)
  // 桌面限制下「均衡」没有更省的处理链，同为地板；安卓放宽后可以降到性能档。
  assert.equal(nextLowerProfile('balanced', false), null)
  assert.equal(nextLowerProfile('balanced', true), 'fast')
  assert.equal(nextLowerProfile('sharp', true), 'fast')
  assert.equal(nextLowerProfile('off', true), null)
})

test('帧率目标：显式档位原样使用，自动档按刷新能力定档', () => {
  assert.equal(new FrameCadence(90).target, 90)
  assert.equal(new FrameCadence(90).ceiling, 90)
  const auto = new FrameCadence('auto')
  assert.equal(auto.ceiling, 120, '刷新能力未知时自动档取 120 档')
  auto.observeDisplay(120)
  assert.equal(auto.ceiling, 120)
  assert.equal(auto.target, 120)
  auto.observeDisplay(240)
  assert.equal(auto.ceiling, 165, '自动档上限是 165 档')
})

test('帧率目标：持续超载只降不升，新播放段才恢复', () => {
  const cadence = new FrameCadence('auto')
  cadence.observeDisplay(120)
  const overload = { outputFps: 40, gpuMs: 20 }
  cadence.observe(overload)
  cadence.observe(overload)
  assert.equal(cadence.target, 120, '前两个样本处于预热期，不降档')
  cadence.observe(overload)
  cadence.observe(overload)
  assert.equal(cadence.target, 60, '持续渲染超预算应稳定到实测可持续档位')
  assert.match(cadence.reason, /已稳定目标帧率/)
  for (let i = 0; i < 6; i++) cadence.observe({ outputFps: 120, gpuMs: 2 })
  assert.equal(cadence.target, 60, '播放段内只降不升')
  cadence.reset(false)
  assert.equal(cadence.target, 60, '内部重建（如降画质）保留已稳定的目标帧率')
  cadence.reset(true)
  assert.equal(cadence.target, 120, '新播放段恢复请求档位')
})

test('帧率档位菜单：高于刷新能力的档位不展示', () => {
  assert.deepEqual(frameRateTargetsForDisplay(60), [60])
  assert.deepEqual(frameRateTargetsForDisplay(120), [60, 90, 120])
  assert.deepEqual(frameRateTargetsForDisplay(240), [60, 90, 120, 144, 165, 240])
  assert.deepEqual(frameRateTargetsForDisplay(0), [60], '刷新能力未知时保守只留 60')
})

test('运动后端护栏：连续两个脏窗口才放弃 GPU，干净窗口清零', () => {
  const policy = new MotionStabilityPolicy()
  assert.equal(policy.observe({ backend: 'webgpu', contentBacksteps: 1 }), null, '单个脏窗口不放弃')
  assert.equal(policy.observe({ backend: 'webgpu', contentBacksteps: 0 }), null)
  assert.equal(policy.consecutiveArtifacts, 0, '干净窗口清零连续计数')
  assert.equal(policy.observe({ backend: 'webgpu', contentJumps: 2 }), null)
  assert.equal(policy.observe({ backend: 'webgpu', contentJumps: 3 }), 'cpu')
  assert.equal(policy.observe({ backend: 'jsfeat', contentBacksteps: 5 }), null, 'CPU 窗口不参与判定')
})

test('运动场迟到不算后端不稳：先回稳定模式，仍迟到才回 CPU（VQ-55）', () => {
  const policy = new MotionStabilityPolicy()
  // 迟到造成的相位停顿：先给一次稳定模式重试，而不是直接换成慢 3-4 倍的 CPU 光流。
  assert.equal(policy.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 2 }), 'retry')
  assert.equal(policy.conservativeRetried, true)
  assert.equal(policy.consecutiveArtifacts, 0, '迟到不计入「场不对」的连击')
  // 稳定模式下仍然迟到：连续两个脏窗口后交回 CPU。
  assert.equal(policy.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 1 }), null)
  assert.equal(policy.observe({ backend: 'webgpu', contentBacksteps: 1, flowStarvedFrames: 1 }), 'cpu')
  // 干净窗口同样清空迟到计数。
  const fresh = new MotionStabilityPolicy()
  assert.equal(fresh.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 1 }), 'retry')
  assert.equal(fresh.observe({ backend: 'webgpu', contentJumps: 0, flowStarvedFrames: 0 }), null)
  assert.equal(fresh.consecutiveLatencyArtifacts, 0)
  // 没有迟到却持续抖动，说明场本身不对：按原口径两个脏窗口回 CPU。
  const wrong = new MotionStabilityPolicy()
  assert.equal(wrong.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 0 }), null)
  assert.equal(wrong.observe({ backend: 'webgpu', contentBacksteps: 2, flowStarvedFrames: 0 }), 'cpu')
  // 关闭两段处置时行为与旧口径一致：迟到同样按脏窗口累计。
  const direct = new MotionStabilityPolicy({ allowConservativeRetry: false })
  assert.equal(direct.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 4 }), null)
  assert.equal(direct.observe({ backend: 'webgpu', contentJumps: 3, flowStarvedFrames: 4 }), 'cpu')
})

test('插值延迟：播放期内不收缩，停顿只登记到下个播放段', () => {
  const options = { nominalMs: 120, minMs: 40, restoreStepMs: 20, changeCooldownMs: 1000 }
  const policy = new InterpolationDelayPolicy(options)
  assert.equal(policy.beginEpoch(0, 16.67), 40, '首段按学习值起播')
  policy.observeWindow({ neededMs: 200, stallFrames: 1, rewinds: 0, missedPairs: 0 })
  assert.equal(policy.snapshot(true).effectiveMs, 40, '播放期内不得收缩或加宽')
  assert.equal(policy.pendingRestore, true)
  assert.equal(policy.beginEpoch(1000, 16.67), 60, '下个播放段恢复一步安全余量')
  assert.equal(policy.widenTo(2000, 100, 16.67), 100, '未接管呈现时按实测需要加宽')
  assert.equal(policy.widenTo(3000, 500, 16.67), 120, '加宽受会话上限约束')
  assert.equal(policy.widenInEpoch(3500, 500, 16.67), 120, '冷却期内播放中的加宽被拒绝')
  assert.equal(policy.widenInEpoch(5000, 500, 16.67), 120, '已在上限时不再变化')
})

test('判定静默窗口只在放大/旋转后的有限时间内生效（VQ-51）', () => {
  const grace = new JudgementGrace()
  assert.equal(grace.active(0), false, '默认不在静默窗口内')
  grace.defer(1000, 2000)
  assert.equal(grace.resumeAt, 3000)
  assert.equal(grace.active(1000), true, '窗口起点即生效')
  assert.equal(grace.active(2999), true, '窗口内不判定')
  assert.equal(grace.active(3000), false, '窗口一过立即恢复判定：真撑不住仍要降档')
  // 非法与超长输入不能把护栏整体关掉。
  grace.defer(5000, Number.NaN)
  assert.equal(grace.active(5000), false, '非法时长不产生窗口')
  grace.defer(5000, -100)
  assert.equal(grace.active(5000), false, '负数不产生窗口')
  grace.defer(5000, 999_999)
  assert.equal(grace.resumeAt, 5000 + JudgementGrace.maxMs, '超长窗口被截断到上限')
  assert.equal(grace.active(14_999), true)
  assert.equal(grace.active(15_000), false)
})

test('呈现看门狗只在画布真的落后时报警，且容忍补间延迟（VQ-53）', () => {
  const base = { currentTime: 10, drawnTime: 10, playing: true, delayMs: 0 }
  assert.equal(presentationStale(base), false, '同步推进不算落后')
  assert.equal(presentationStale({ ...base, drawnTime: 9.5 }), false, '半秒内落后在容忍量里')
  assert.equal(presentationStale({ ...base, drawnTime: 9 }), true, '落后超过容忍量要报警')
  // 补间延迟本身就会让画布落后原画，必须算进容忍量。
  assert.equal(presentationStale({ ...base, drawnTime: 9, delayMs: 700 }), false, '延迟已计入容忍量')
  assert.equal(presentationStale({ ...base, drawnTime: 8, delayMs: 700 }), true, '延迟之外再落后才报警')
  // 暂停、缓冲与「还没画过」都不该报警：这三种情况本来就该由状态机处理。
  assert.equal(presentationStale({ ...base, drawnTime: 0, playing: false }), false, '暂停不报警')
  assert.equal(presentationStale({ ...base, drawnTime: null }), false, '没有绘制记录不报警')
  assert.equal(PRESENTATION_LAG_TOLERANCE_MS > 0, true)
})
