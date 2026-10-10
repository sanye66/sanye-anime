// 源帧等待位门禁（VQ-41，无窗口）。
//
// 被测对象是真实的 `interpolationRenderer.worker.ts`：用假的渲染器与假的光流线程按顺序驱动
// `frame` / `reset` 消息，观察它在「上一帧还没处理完又来一帧」时到底是丢弃还是暂存。
// 旧口径直接丢弃，运动分析的一次尖峰就少一个源帧，帧窗口出现空洞（用户看到的「停一下」）；
// 新口径最多保留一个源帧，处理完当前帧立即按到达顺序补上，只有真的连续超预算才丢帧。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

/** 与 worker-generations.test.cjs 同构的夹具，额外记录每个源帧位图以便断言等待位是否被关闭。 */
function rendererHarness() {
  const uploads = [], updates = [], messages = [], flowMessages = [], bitmaps = []
  const renderers = []
  let flow, timerId = 0, animationId = 0, clock = 100
  const timers = new Map(), animationFrames = new Map()
  const bitmap = () => { const value = { width: 640, height: 360, closed: false, close() { this.closed = true } }; bitmaps.push(value); return value }
  class Renderer {
    constructor(canvas) { this.canvas = canvas; renderers.push(this) }
    gl = { getExtension: () => null }
    enhancementMs = 0
    enhancementQueueDepth = 0
    upload(_bitmap, time) { const frame = { time }; uploads.push(frame); return frame }
    release() {}
    updateFlow(frame) { updates.push(frame.time) }
    takeCompletedFrames() { return { frames: 0, gpuMs: 0 } }
    resetMeasurements() {}
    clearFramePool() {}
    setEnhancement() {}
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
    Worker: class { constructor() { flow = this } postMessage(value) { flowMessages.push(value) } terminate() {} },
    createImageBitmap: () => Promise.resolve(bitmap()),
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
  send({ type: 'init', canvas: { addEventListener() {} }, profile: 'off', delay: 0.15, targetFps: 120 })
  const frame = (time, generation = 0) => {
    const image = bitmap()
    send({ type: 'frame', bitmap: image, time, generation, displayTime: 10100, rate: 1 })
    return image
  }
  return { frame, send, bitmaps, uploads, updates, messages, flowMessages, renderers,
    scheduledCount: () => timerId + animationId,
    lastBitmap: () => bitmaps[bitmaps.length - 1],
    reply: data => flow.onmessage({ data: { field: {}, computeMs: 1, ...data } }),
    latestFlowGeneration: () => flowMessages[flowMessages.length - 1].generation }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('unchanged display estimates keep the existing presentation wakeup', () => {
  const harness = rendererHarness()
  harness.send({ type: 'display', hz: 60, generation: 0 })
  const scheduled = harness.scheduledCount()
  harness.send({ type: 'display', hz: 60.3, generation: 0 })
  assert.equal(harness.scheduledCount(), scheduled, 'small measurement noise must not rearm the clock')
  harness.send({ type: 'display', hz: 120, generation: 0 })
  assert.ok(harness.scheduledCount() > scheduled, 'a real refresh change must rearm the clock')
})

test('a frame arriving while the previous one is in analysis is deferred instead of dropped', async () => {
  const harness = rendererHarness()
  harness.frame(0); await flush()
  assert.equal(harness.uploads.length, 1, '首帧立即上传')
  assert.equal(harness.flowMessages.length, 1, '首帧进入运动分析')

  // 运动分析仍在途时到达第二个源帧：旧口径在这里直接丢弃并少一帧画面。
  const deferred = harness.frame(1 / 30); await flush()
  assert.equal(harness.uploads.length, 1, '等待位里的源帧不得抢先上传')
  assert.equal(deferred.closed, false, '等待位必须持有位图，不能提前关闭')

  harness.reply({ generation: harness.latestFlowGeneration() })
  await flush()
  assert.deepEqual(harness.updates, [0], '当前帧先带运动场进入帧队列')
  assert.equal(harness.uploads.length, 2, '让出等待位后必须补上被推迟的源帧')
  assert.equal(harness.flowMessages.length, 2, '补上的源帧同样要进入运动分析')
  assert.equal(harness.flowMessages[1].mediaTime, 1 / 30, '补上的必须是那一帧本身，而不是被替换成更新的帧')

  harness.reply({ generation: harness.latestFlowGeneration() })
  assert.deepEqual(harness.updates, [0, 1 / 30], '两帧都要保留，且顺序与到达顺序一致')
  assert.ok(harness.messages.every(message => message.type !== 'error'), '暂存不是失败路径')
})

test('the waiting slot holds exactly one frame, so a sustained overrun still drops the newest arrival', async () => {
  const harness = rendererHarness()
  harness.frame(0); await flush()
  const deferred = harness.frame(1 / 30); await flush()
  const dropped = harness.frame(2 / 30); await flush()
  assert.equal(harness.uploads.length, 1, '等待位只保留一个源帧')
  assert.equal(deferred.closed, false, '等待位里的位图仍然有效')
  assert.equal(dropped.closed, true, '等待位已占用时必须关闭并丢弃最新到达的帧，避免无界积压')

  harness.reply({ generation: harness.latestFlowGeneration() })
  await flush()
  assert.equal(harness.flowMessages.length, 2, '只补等待位里的那一帧')
  assert.equal(harness.flowMessages[1].mediaTime, 1 / 30, '保留较早的那一帧，保证帧窗口连续而不是跳到最新')
})

test('a reset clears the waiting slot so a new playback segment never inherits an old frame', async () => {
  const harness = rendererHarness()
  harness.frame(0); await flush()
  const deferred = harness.frame(1 / 30); await flush()
  harness.send({ type: 'reset', generation: 1 })
  assert.equal(deferred.closed, true, '播放段边界必须关闭等待位里的位图')

  harness.frame(2 / 30, 1); await flush()
  assert.equal(harness.uploads.length, 2, '重置后只处理新播放段的帧')
  assert.equal(harness.flowMessages.length, 2)
  assert.equal(harness.flowMessages[1].mediaTime, 2 / 30, '旧播放段的等待帧不得跨段补上')
})
