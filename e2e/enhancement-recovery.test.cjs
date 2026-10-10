const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const origin = process.env.SANYE_FRONTEND_URL || 'http://localhost:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/enhancement-recovery')
const INTERVAL = 1000 / 30

function loadPolicy() {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/enhancementBudgetPolicy.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports.EnhancementBudgetPolicy
}

/**
 * 以固定 30 FPS 采样间隔驱动策略，返回动作时间线。
 * 稳定优先（VQ-32）下策略只有 `hold` 与 `downgrade` 两种动作，档位在一次会话内不再升档。
 */
function drive(policy, options) {
  const timeline = []
  let now = options.from ?? 0
  for (const sample of options.samples) {
    now += INTERVAL
    const action = policy.observe({ nowMs: now, enhancementMs: options.enhancementMs ?? 0, budgetMs: options.budgetMs ?? 16.7,
      queueDepth: sample.queueDepth ?? options.queueDepth ?? 0 })
    timeline.push({ atMs: now, action })
    options.onAction?.(action, now)
  }
  return { timeline, actions: timeline.map(entry => entry.action), endedAt: now }
}

const actionsOf = (result, kind) => result.timeline.filter(entry => entry.action === kind)
const otherActions = result => result.timeline.filter(entry => entry.action !== 'hold')
const across = count => Array(count).fill({})
const pressured = count => Array(count).fill({ queueDepth: 8 })

test('transient spikes stay on the requested profile while sustained pressure downgrades', () => {
  const EnhancementBudgetPolicy = loadPolicy()
  const transient = drive(new EnhancementBudgetPolicy(), { samples: [...pressured(3), ...across(30)] })
  assert.deepEqual(otherActions(transient), [], '约 0.1 秒的增强积压尖峰不得降档')

  const jitter = drive(new EnhancementBudgetPolicy(), { samples: [...pressured(12), ...across(40)] })
  assert.deepEqual(otherActions(jitter), [], '亚秒级抖动（约 0.4 秒）不得降档')

  const sustained = drive(new EnhancementBudgetPolicy(), { samples: pressured(60) })
  const downgrades = actionsOf(sustained, 'downgrade')
  assert.ok(downgrades.length >= 1, '持续预算压力必须降档')
  assert.ok(downgrades[0].atMs - sustained.timeline[0].atMs >= 790,
    '降档必须覆盖完整压力窗口，而不是按单帧判定')
  assert.deepEqual(sustained.actions.slice(0, 20), Array(20).fill('hold'), '压力段未满时不得降档')
  assert.ok(downgrades.slice(1).every((entry, index) => entry.atMs - downgrades[index].atMs >= 790),
    '每次降档都必须重新累积一个完整压力段')
})

test('enhancement cost and queue depth both require a sustained window', () => {
  const EnhancementBudgetPolicy = loadPolicy()
  const cost = drive(new EnhancementBudgetPolicy(), { samples: across(60), enhancementMs: 20, budgetMs: 16.7 })
  assert.ok(actionsOf(cost, 'downgrade').length >= 1, '增强耗时持续超预算同样按压力段降档')
  assert.deepEqual(cost.actions.slice(0, 20), Array(20).fill('hold'), '窗口未满时不得按单帧耗时降档')

  const headroom = drive(new EnhancementBudgetPolicy(), { samples: across(60), enhancementMs: 4, budgetMs: 16.7 })
  assert.deepEqual(otherActions(headroom), [], '预算内耗时不得触发降档')

  const intermittent = drive(new EnhancementBudgetPolicy(), {
    samples: across(60).map((sample, index) => index % 4 === 3 ? { queueDepth: 8 } : sample) })
  assert.deepEqual(otherActions(intermittent), [], '四分之一样本超预算不构成持续压力')

  // 队列在每次统计窗口末尾排空会插入单个有余量样本；单个样本不得中断持续压力段。
  const drained = drive(new EnhancementBudgetPolicy(), {
    samples: across(60).map((sample, index) => index % 12 === 11 ? sample : { queueDepth: 8 }) })
  const drains = actionsOf(drained, 'downgrade')
  assert.ok(drains.length >= 1, '周期性排空不得阻止持续压力判定')
  assert.ok(drains[0].atMs - drained.timeline[0].atMs >= 790 && drains[0].atMs - drained.timeline[0].atMs <= 1000,
    '周期性排空只允许推迟一个样本，不得把压力段重新计时')
})

test('a sustained headroom window never raises the profile again', () => {
  const EnhancementBudgetPolicy = loadPolicy()
  const policy = new EnhancementBudgetPolicy()
  const pressure = drive(policy, { samples: pressured(60) })
  const downgradedAt = actionsOf(pressure, 'downgrade')[0].atMs
  policy.noteDowngrade()

  // 稳定优先（VQ-32）：降档后长期有余量也不升档，避免清晰度在播放中反复变化。
  const steady = drive(policy, { from: pressure.endedAt, samples: across(1800) })
  assert.deepEqual(otherActions(steady), [], '连续 60 秒有余量也不得再次升档')
  assert.equal(policy.snapshot(steady.endedAt).samples, 0, '稳定窗口不累积压力样本')
})

test('the policy exposes no recovery path or backoff state', () => {
  const EnhancementBudgetPolicy = loadPolicy()
  const policy = new EnhancementBudgetPolicy()
  assert.equal(typeof policy.noteRecovery, 'undefined', '稳定优先口径删除了恢复入口')
  assert.equal(policy.cooldownMs, undefined, '恢复冷却已随恢复一并删除')
  assert.deepEqual(Object.keys(policy.snapshot(0)).sort(), ['samples', 'spanMs'], '快照只保留压力段样本与覆盖时长')
  assert.deepEqual(
    drive(policy, { samples: [...pressured(60), ...across(600)] }).actions.filter(action => action !== 'hold' && action !== 'downgrade'),
    [], '策略不得返回 hold / downgrade 以外的动作')
})

const LADDER = { fast: 0, restore: 1, upscale: 2 }

test('the render worker keeps the enhancement profile monotone with the shared policy', { timeout: 180000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const width = 640, height = 360
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      document.body.replaceChildren(canvas)
      const worker = new Worker('/src/video/interpolationRenderer.worker.ts', { type: 'module' })
      const stats = [], errors = []
      worker.onmessage = ({ data }) => {
        if (data.type === 'stats') stats.push(data.stats)
        if (data.type === 'error') errors.push(data.message)
      }
      worker.onerror = event => errors.push(event.message)
      const source = new OffscreenCanvas(width, height), ctx = source.getContext('2d')
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
      const started = performance.now()
      let generation = 0
      const frame = async () => {
        const time = (performance.now() - started) / 1000
        ctx.fillStyle = '#203040'; ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#dddddd'
        ctx.fillRect(Math.floor(time * 60) % (width - 80), height / 4, 80, height / 2)
        const bitmap = await createImageBitmap(source)
        worker.postMessage({ type: 'frame', bitmap, time, displayTime: performance.timeOrigin + started + time * 1000,
          rate: 1, generation }, [bitmap])
      }
      try {
        const offscreen = canvas.transferControlToOffscreen()
        worker.postMessage({ type: 'init', canvas: offscreen, profile: 'upscale', delay: 0.15, targetFps: 60 }, [offscreen])
        // 受控夹具：2× 超分在该分辨率下持续超出增强预算，用于观测降档与有界恢复。
        const deadline = performance.now() + 34000
        while (performance.now() < deadline) { await frame(); await sleep(8) }
        await sleep(1500)
        generation++
        worker.postMessage({ type: 'reset', generation })
      } finally { worker.terminate() }
      return { stats, errors }
    })
    await fsp.mkdir(output, { recursive: true })
    await fsp.writeFile(path.join(output, 'worker-report.json'), JSON.stringify(report, null, 2))
    const { stats, errors } = report
    assert.deepEqual(errors, [])
    assert.ok(stats.length >= 20, '必须收集到足够的统计窗口')
    assert.ok(stats.every(stat => stat.requestedProfile === 'upscale'), '请求档位在会话内必须保持不变')
    assert.ok(stats.every(stat => stat.recoveryCeiling === undefined), '稳定优先口径不再上报可恢复上限')
    assert.ok(stats.every(stat => stat.outputWidth <= 1280 && stat.outputHeight <= 720), '输出尺寸不得超过 2× 上限')
    assert.ok(stats.every((stat, index) => index === 0
      || LADDER[stat.effectiveProfile] <= LADDER[stats[index - 1].effectiveProfile]),
      '生效档位在会话内只能单调下降')

    const changes = stats.at(-1).qualityFallbacks
    const downgrades = changes.filter(entry => LADDER[entry.to] < LADDER[entry.from])
    const recoveries = changes.filter(entry => LADDER[entry.to] > LADDER[entry.from])
    console.log('ENHANCEMENT_RECOVERY', JSON.stringify({ windows: stats.length, changes,
      downgrades: downgrades.length, recoveries: recoveries.length,
      profiles: [...new Set(stats.map(stat => stat.effectiveProfile))],
      flags: stats.map(stat => stat.qualityChange).filter(Boolean) }))
    assert.ok(downgrades.length >= 2, '受控夹具必须出现持续预算压力降档（2× 超分→修复档→性能档）')
    assert.equal(recoveries.length, 0, '稳定优先口径不得在播放中升档')
    assert.ok(changes.every((entry, index) => index === 0 || entry.from === changes[index - 1].to), '档位变化记录必须首尾相接')
    assert.ok(changes.every(entry => Math.abs(LADDER[entry.to] - LADDER[entry.from]) === 1),
      '档位每次只允许下降一档，不得跳过中间档位')
    assert.ok(changes.every(entry => !entry.reason.includes('恢复')), '回退记录里不得出现升档记录')
    for (const [index, entry] of changes.entries()) {
      if (index === 0) continue
      assert.ok(entry.atMs - changes[index - 1].atMs >= 790, '连续降档必须各自覆盖压力窗口')
    }
    assert.ok(changes.some(entry => entry.reason.includes('超出处理预算')), '降档必须写入回退记录')
    // 档位变化必须在上报窗口里带出类型，菜单据此跟随实际档位。降档内部的 `reset` 会把统计窗口
    // 重新锚定，两次相邻降档可能落进同一个上报窗口（类型相同，只保留最后一次），因此只要求
    // 至少有一个窗口带出类型，且类型数量不超过变化次数。
    const flagged = stats.filter(stat => stat.qualityChange).length
    assert.ok(flagged >= 1, '档位变化必须在上报窗口中带出类型')
    assert.ok(flagged <= changes.length)
    assert.ok(stats.every(stat => !stat.qualityChange || stat.qualityChange === 'downgrade'),
      '上报窗口只允许出现降档标记')
  } finally { await browser.close() }
})
