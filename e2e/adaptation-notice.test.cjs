const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const path = require('node:path')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const scope = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,
  '../sanye_client/src/video/adaptationNotice.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, scope)
const { AdaptationNotice } = scope.exports
const baseline = { requestedFps: 120, nextTargetFps: 120, requestedProfile: 'sharp', effectiveProfile: 'sharp', fallbackReason: '', cadenceReason: '' }

test('transient flow and delivery pressure stays silent without actual mode changes', () => {
  const notice = new AdaptationNotice()
  let previous = null
  for (let i = 0; i < 60; i++) {
    const current = { ...baseline, cadenceReason: i % 2 ? '运动分析耗时较高' : '' }
    assert.equal(notice.next(previous, current, i * 1000), '')
    previous = current
  }
})

test('actual fallback is notified once per mode with a cooldown, without changing preferences', () => {
  const notice = new AdaptationNotice()
  const lower = { ...baseline, nextTargetFps: 90, cadenceReason: '渲染帧预算不足' }
  assert.match(notice.next(baseline, lower, 0), /90 FPS/)
  assert.equal(notice.next(lower, { ...lower, nextTargetFps: 60 }, 1000), '')
  assert.equal(notice.next(baseline, lower, 30000), '')
  const quality = { ...lower, effectiveProfile: 'fast', fallbackReason: '增强预算不足' }
  assert.equal(notice.next(lower, quality, 31000), '增强预算不足')
  assert.equal(quality.requestedProfile, 'sharp')
  assert.equal(new AdaptationNotice().next(null, quality, 0), '增强预算不足')
})
