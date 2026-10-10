const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/presentationScheduler.ts'), 'utf8')
const scope = { exports: {} }
vm.createContext(scope)
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
const { PresentationScheduler } = scope.exports

/** 按给定刷新周期连续推进刷新回调，返回每次绘制所在的刷新序号。 */
function refreshSlots(scheduler, hz, refreshes, startAt = 0) {
  const period = 1000 / hz
  const slots = []
  for (let index = 1; index <= refreshes; index++) {
    if (scheduler.onRefresh(startAt + index * period)) slots.push(index)
  }
  return slots
}

test('refresh-aligned display clock is used whenever the refresh can present the target', () => {
  const unknown = new PresentationScheduler()
  assert.equal(unknown.mode, 'timer', '未知刷新能力时保持截止时间计时器')
  assert.equal(unknown.wait(0), 0)

  const even = new PresentationScheduler()
  even.setTarget(60, 119.88, 0)
  assert.equal(even.mode, 'display', '整数倍刷新按每个目标帧落在刷新边界上')
  assert.equal(even.wait(0), 0, '展示模式不使用截止时间计时器等待')

  const uneven = new PresentationScheduler()
  uneven.setTarget(120, 144, 0)
  assert.equal(uneven.mode, 'display', '非整数倍刷新仍应落在刷新边界上，不退回计时器抖动')

  const slower = new PresentationScheduler()
  slower.setTarget(240, 60, 0)
  assert.equal(slower.mode, 'timer', '刷新能力低于目标帧率时必须保留计时器路径')
  assert.equal(slower.advanceTimer(0), 0)
  assert.ok(slower.wait(0) > 0, '计时器时钟按固定时隙推进等待')
})

test('display slots keep the target frame count on any refresh ratio without catch-up bursts', () => {
  const even = new PresentationScheduler()
  even.setTarget(120, 120, 0)
  const evenSlots = refreshSlots(even, 120, 240)
  assert.equal(evenSlots.length, 240, '等倍刷新每个刷新都绘制一帧')
  assert.equal(even.renderSlots, 240)

  const uneven = new PresentationScheduler()
  uneven.setTarget(120, 144, 0)
  const unevenSlots = refreshSlots(uneven, 144, 1440)
  const expected = 1440 * 120 / 144
  assert.ok(unevenSlots.length >= expected - 1 && unevenSlots.length <= expected + 1,
    `144Hz 上 120 目标应按 5:6 时隙呈现，实际 ${unevenSlots.length}`)
  const gaps = unevenSlots.slice(1).map((slot, index) => slot - unevenSlots[index])
  assert.ok(Math.max(...gaps) <= 2, '展示对齐不允许连续跳过两个以上刷新')
  assert.ok(gaps.filter(gap => gap === 2).length >= 200, '非整数倍比率的交替应由刷新周期承担')
  assert.equal(uneven.skippedSlots, 0, '展示模式按刷新计数，不存在追赶跳跃')

  const everyOther = new PresentationScheduler()
  everyOther.setTarget(60, 144, 0)
  assert.equal(refreshSlots(everyOther, 144, 144).length, 60, '半速目标不应因刷新更高而多画帧')
})

test('display clock is only trusted after the refresh callbacks actually arrive', () => {
  const online = new PresentationScheduler()
  online.setTarget(120, 144, 0)
  online.onRefresh(0)
  online.onRefresh(6.94)
  online.onRefresh(13.89)
  assert.equal(online.confirmDelivery(50), false)
  assert.equal(online.refreshConfirmed, true)
  assert.equal(online.mode, 'display')
  assert.equal(online.starvation, 0)
  assert.ok(online.refreshHz > 140 && online.refreshHz < 146, '刷新周期应由实际回调间隔估计')

  const starved = new PresentationScheduler()
  starved.setTarget(120, 144, 0)
  assert.equal(starved.confirmDelivery(100), false, '一次未确认不能立刻切换时钟')
  assert.equal(starved.starvation, 1)
  assert.equal(starved.confirmDelivery(200), true)
  assert.equal(starved.mode, 'timer', '刷新回调不交付时必须回退到计时器时钟')
  assert.equal(starved.refreshConfirmed, false)

  starved.reset(300)
  assert.equal(starved.mode, 'display', '会话重置后重新评估刷新对齐')
  assert.equal(starved.starvation, 0)
  assert.equal(starved.timerWakeups, 0)

  const incapable = new PresentationScheduler()
  incapable.setTarget(120, 144, 0)
  incapable.fallBackToTimer(10)
  assert.equal(incapable.mode, 'timer')
  assert.equal(incapable.wait(10), 0, '回退后首个时隙立即可绘制，不会空转等待')
})

test('timer clock skips missed slots instead of replaying them and reports the lateness', () => {
  const scheduler = new PresentationScheduler()
  scheduler.setTarget(240, 165, 0)
  assert.equal(scheduler.mode, 'timer')
  const interval = 1000 / 240
  assert.equal(scheduler.advanceTimer(0), 0, '按时到达的时隙没有迟到')
  assert.equal(scheduler.skippedSlots, 0)
  assert.equal(scheduler.renderSlots, 1)
  assert.ok(Math.abs(scheduler.wait(0) - interval) < 1e-6)

  const behind = 4 * interval + 1
  const late = scheduler.advanceTimer(behind)
  assert.ok(late > 3 * interval, '迟到必须按真实经过时间统计，不能只记一个时隙')
  assert.equal(scheduler.skippedSlots, 3, '过期时隙只跳过，不批量重放')
  assert.equal(scheduler.renderSlots, 2)
  assert.ok(scheduler.wait(behind) > 0, '跳过后仍推进到下一个时隙，不会连续补画')
  assert.ok(Math.abs(scheduler.wait(behind) - (interval - 1)) < 1e-6, '下一时隙保持固定相位')

  scheduler.noteTimerWake()
  scheduler.noteEarlyWake()
  const window = scheduler.takeWindow()
  assert.deepEqual([window.mode, window.renderSlots, window.skippedSlots, window.timerWakeups, window.earlyWakeups],
    ['timer', 2, 3, 1, 1])
  assert.equal(scheduler.takeWindow().renderSlots, 0, '窗口统计必须清零')
  assert.equal(scheduler.skippedSlots, 0)
})

test('target and refresh changes re-anchor the slot phase without changing the frame count policy', () => {
  const scheduler = new PresentationScheduler()
  scheduler.setTarget(120, 144, 0)
  assert.equal(scheduler.setTarget(120, 144, 50), false, '相同目标与刷新不重排，避免相位抖动')
  assert.equal(scheduler.setTarget(90, 144, 60), false, '同一种展示时钟内换挡不需要重排唤醒方式')
  assert.equal(scheduler.mode, 'display')
  const slots = refreshSlots(scheduler, 144, 1440, 60)
  assert.ok(Math.abs(slots.length - 1440 * 90 / 144) <= 1, '降档后按新的目标帧率占用刷新时隙')
  assert.equal(scheduler.setTarget(240, 144, 2000), true)
  assert.equal(scheduler.mode, 'timer', '目标高于刷新能力时切回计时器时钟')
})
