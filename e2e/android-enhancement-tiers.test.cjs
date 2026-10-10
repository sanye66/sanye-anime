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

test('安卓档位只保留能跑的档位，其余交给自动降档', () => {
  const { MOBILE_ANIME4K_PROFILES, ANDROID_ENHANCEMENT_LIMITS } = loadModule('enhancementLimits.ts')
  // 用户反馈「画质与帧率还是只有两档」后开放锐化：它是可自动降档的中间档，菜单不再只有一档可选。
  assert.equal(JSON.stringify(MOBILE_ANIME4K_PROFILES), '["fast","balanced","sharp"]',
    '超分 2×（4 倍像素）与和均衡同链路的修复都不应在安卓菜单里，锐化应保留')
  assert.equal(ANDROID_ENHANCEMENT_LIMITS.analysisWidthCap, 192, '运动分析网格不再升到 256/384')
  assert.equal(ANDROID_ENHANCEMENT_LIMITS.analysisWidthCapOnGpu, 256,
    'GPU 常驻管线被确认后才放宽网格上限，实际档位仍由实测余量门控决定（VQ-49）')
  assert.equal(ANDROID_ENHANCEMENT_LIMITS.allowMidTierFallback, true, '「均衡」要能自动让位给「性能」')
})

test('安卓超预算阈值比默认更早判定降档', () => {
  const { EnhancementBudgetPolicy } = loadModule('enhancementBudgetPolicy.ts')
  const { ANDROID_ENHANCEMENT_LIMITS } = loadModule('enhancementLimits.ts')
  const budgetMs = 1000 / 30
  const sample = { enhancementMs: budgetMs * 0.55, budgetMs, queueDepth: 4 }
  const actions = (policy, samples) => {
    let last = 'hold'
    for (let index = 0; index < samples; index++) last = policy.observe({ nowMs: 1000 + index * 300, ...sample })
    return last
  }
  assert.equal(actions(new EnhancementBudgetPolicy(), 8), 'hold', '默认阈值下 55% 预算不算压力')
  // 安卓阈值更低（0.5/4），同一份样本算超预算；但必须“持续”覆盖 2 秒才降档。
  assert.equal(actions(new EnhancementBudgetPolicy(ANDROID_ENHANCEMENT_LIMITS.budget), 4), 'hold',
    '约 0.9 秒的瞬时超预算不应降档（降级不抢跑）')
  assert.equal(actions(new EnhancementBudgetPolicy(ANDROID_ENHANCEMENT_LIMITS.budget), 8), 'downgrade',
    '持续超过 2 秒的同一份样本应当降档')
})

test('运动分析网格上限真的挡住升档', () => {
  const { FlowAnalysisPolicy } = loadModule('flowAnalysisPolicy.ts')
  const cheap = { computeMs: 0.1, sourceFps: 30 }
  const climb = (policy) => {
    for (let index = 0; index < 240; index++) policy.observe(cheap.computeMs, cheap.sourceFps)
    return policy.targetWidth
  }
  assert.equal(climb(new FlowAnalysisPolicy()), 384, '不设上限时仍可升到最细网格（桌面行为不变）')
  assert.equal(climb(new FlowAnalysisPolicy({ maxWidth: 192 })), 192, '安卓上限 192 不得被越过')
})

test('显式帧率档只列屏幕能显示的档位', () => {
  const { frameRateTargetsForDisplay } = loadModule('frameCadence.ts')
  const list = (hz) => JSON.stringify(frameRateTargetsForDisplay(hz))
  assert.equal(list(60), '[60]')
  assert.equal(list(75), '[60]')
  assert.equal(list(90), '[60,90]')
  assert.equal(list(120), '[60,90,120]')
  assert.equal(list(144), '[60,90,120,144]')
  assert.equal(list(240), '[60,90,120,144,165,240]')
  assert.equal(list(0), '[60]', '刷新率未知时保守保留 60，由自动档运行时定档')
  assert.equal(list(Number.NaN), '[60]')
})
