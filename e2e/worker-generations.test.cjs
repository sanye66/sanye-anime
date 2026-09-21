const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

function rendererHarness(deferResize = false, profile = 'off') {
  const uploads = [], updates = [], messages = [], resizes = [], flowMessages = []
  const renderers = []
  const enhancementChanges = []
  let flow, timerId = 0, animationId = 0, clock = 100
  const timers = new Map(), animationFrames = new Map()
  const bitmap = () => ({ width: 640, height: 360, closed: false, close() { this.closed = true } })
  class Renderer {
    constructor(canvas) { this.canvas = canvas; renderers.push(this) }
    gl = { getExtension: () => null }
    enhancementMs = profile === 'restore' ? 25 : 0
    enhancementQueueDepth = 0
    upload(_bitmap, time) { this.enhancementMs = profile === 'restore' ? 25 : 0; const frame = { time }; uploads.push(frame); return frame }
    release() {}
    updateFlow(frame) { updates.push(frame.time) }
    takeCompletedFrames() { return { frames: 0, gpuMs: 0 } }
    resetMeasurements() { this.enhancementMs = 0 }
    clearFramePool() {}
    setEnhancement(mode) { enhancementChanges.push(mode) }
    stop() {}
    disposePipeline() {}
  }
  const globals = {
    performance: { now: () => clock, timeOrigin: 10000 }, URL,
    clearTimeout: id => timers.delete(id),
    self: {
      setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay, at: clock + delay }); return id },
      requestAnimationFrame: callback => { const id = ++animationId; animationFrames.set(id, callback); return id },
      cancelAnimationFrame: id => animationFrames.delete(id),
      postMessage: value => messages.push(value)
    },
    Worker: class {
      constructor() { flow = this }
      postMessage(value) { flowMessages.push(value) }
      terminate() {}
    },
    createImageBitmap: () => deferResize ? new Promise(resolve => resizes.push(resolve)) : Promise.resolve(bitmap()),
  }
  const cache = { './motionRenderer': { MotionRenderer: Renderer } }
  const importMeta = context => {
    const visit = node => ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.MetaProperty
      ? context.factory.createStringLiteral('file:///fixture/worker.ts') : ts.visitEachChild(node, visit, context)
    return node => ts.visitNode(node, visit)
  }
  const load = name => {
    if (cache[name]) return cache[name]
    const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video', name + '.ts'), 'utf8')
    const exports = {}; cache[name] = exports
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      transformers: { before: [importMeta] } }).outputText
    vm.runInNewContext(compiled, { ...globals, exports, require: load })
    return exports
  }
  load('./interpolationRenderer.worker')
  const send = data => globals.self.onmessage({ data })
  send({ type: 'init', canvas: { addEventListener() {} }, profile, delay: 0.15, targetFps: 120 })
  const frame = (time, generation) => send({ type: 'frame', bitmap: bitmap(), time, generation, displayTime: 10100, rate: 1 })
  return { frame, send, bitmap, resizes, uploads, updates, messages, flowMessages, renderers, enhancementChanges,
    timers, animationFrames,
    advance: ms => { clock += ms; return clock },
    reply: data => flow.onmessage({ data: { field: {}, computeMs: 1, ...data } }) }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('a late flow response cannot unlock or replace the current pending frame', async () => {
  const harness = rendererHarness()
  harness.frame(0, 0); await flush()
  const oldGeneration = harness.flowMessages[0].generation
  harness.send({ type: 'reset', generation: 1 })
  harness.frame(1 / 30, 1); await flush()
  const currentGeneration = harness.flowMessages[1].generation
  harness.reply({ generation: oldGeneration })
  harness.frame(2 / 30, 1); await flush()
  assert.equal(harness.uploads.length, 2, 'stale completion must not clear the new busy flag')
  harness.reply({ generation: currentGeneration })
  assert.deepEqual(harness.updates, [1 / 30])
  harness.reply({ generation: oldGeneration, error: 'old failure' })
  harness.frame(3 / 30, 1); await flush()
  assert.equal(harness.uploads.length, 3)
  assert.ok(harness.messages.every(message => message.type !== 'error'))
})

test('worker aligns a display-capable target to animation frames and reset cancels it', async () => {
  const harness = rendererHarness()
  harness.frame(0, 0); await flush()
  // 刷新能力未知时按刷新边界驱动提交（目标 120 > 未知刷新），并只保留一次有界的交付确认。
  assert.equal(harness.animationFrames.size, 1, '未知刷新能力时按刷新边界驱动提交')
  assert.equal(harness.timers.size, 1, '边界交付确认只挂一次有界计时器')
  assert.ok([...harness.timers.values()][0].delay >= 120, '交付确认必须是有界等待')
  harness.send({ type: 'display', hz: 144, generation: 0 })
  assert.equal(harness.animationFrames.size, 1, '非整数倍刷新也要按刷新边界呈现')
  const guarded = [...harness.timers.values()]
  assert.equal(guarded.length, 1, '展示对齐不再逐帧挂计时器')
  assert.ok(guarded[0].delay >= 120, '只保留一次有界的刷新交付确认')
  harness.send({ type: 'reset', generation: 1 })
  assert.equal(harness.animationFrames.size, 0, 'pause or seek reset must cancel the old display callback')
  assert.equal(harness.timers.size, 0, '暂停或跳转重置必须同时取消确认计时器')
})

test('worker keeps the timer clock but drives submissions from refresh boundaries above display refresh', async () => {
  const harness = rendererHarness()
  harness.frame(0, 0); await flush()
  harness.send({ type: 'display', hz: 60, generation: 0 })
  // 目标高于刷新能力时仍是计时器时钟（不按刷新比例抽样），只是提交时刻由刷新边界给出。
  assert.equal(harness.animationFrames.size, 1, '高于刷新能力时按刷新边界驱动提交')
  assert.equal(harness.timers.size, 1, '边界交付确认只挂一次计时器')
  assert.ok([...harness.timers.values()][0].delay >= 120, '边界交付确认是有界等待，不是逐帧时隙')
})

test('boundary-driven submissions fall back to the deadline timer when refresh callbacks never arrive', async () => {
  const harness = rendererHarness()
  harness.frame(0, 0); await flush()
  const guard = [...harness.timers.entries()].at(-1)
  harness.timers.delete(guard[0])
  guard[1].callback()
  assert.equal(harness.animationFrames.size, 0, '退回计时器路径时必须取消未交付的边界回调')
  const timer = [...harness.timers.values()].at(-1)
  assert.ok(timer && timer.delay < 120, '未知刷新能力时退回按目标帧周期挂截止时间计时器')
})

test('a stale resize closes its image without clearing a new capture in flight', async () => {
  const harness = rendererHarness(true)
  harness.frame(0, 0)
  harness.send({ type: 'reset', generation: 1 })
  harness.frame(1 / 30, 1)
  const staleImage = harness.bitmap()
  harness.resizes[0](staleImage); await flush()
  assert.equal(staleImage.closed, true)
  harness.frame(2 / 30, 1); await flush()
  assert.equal(harness.uploads.length, 2)
  harness.resizes[1](harness.bitmap()); await flush()
  assert.equal(harness.flowMessages.length, 1)
  harness.reply({ generation: harness.flowMessages[0].generation })
  assert.deepEqual(harness.updates, [1 / 30])
})

test('reset discards the old enhancement overload streak before resuming', async () => {
  const harness = rendererHarness(false, 'restore')
  for (const time of [0, 1 / 30]) {
    harness.frame(time, 0); await flush()
    harness.reply({ generation: harness.flowMessages.at(-1).generation })
  }
  harness.send({ type: 'reset', generation: 1 })
  harness.frame(2 / 30, 1); await flush()
  assert.equal(harness.renderers.length, 1, 'old overload samples must not downgrade a newly reset session')
  assert.equal(harness.enhancementChanges.length, 0)
  assert.equal(harness.flowMessages.length, 3)
})
