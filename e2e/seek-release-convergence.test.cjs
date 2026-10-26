const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

function target() {
  const handlers = new Map()
  return { style: {}, addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name),
    fire: (name, args = {}) => handlers.get(name)?.({ pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopImmediatePropagation() {}, ...args }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) }
}

for (const cancel of [false, true]) test(cancel ? '中断拖动后等待在途定位，再恢复原位置和播放' : '松手不叠加定位，完成后落在最后目标并恢复播放', () => {
  const bar = target(), document = target(), window = target(), video = target()
  const writes = []
  let time = 10, plays = 0
  Object.assign(video, { paused: false, seeking: false, buffered: { length: 1, start: () => 0, end: () => 100 },
    pause() { this.paused = true }, play() { plays++; this.paused = false; return Promise.resolve() } })
  Object.defineProperty(video, 'currentTime', { get: () => time, set: value => { time = value; writes.push(value); video.seeking = true } })
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/seekControl.ts'), 'utf8')
  const scope = { exports: {}, document, window, performance: { now: () => 1000 } }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  scope.exports.installSeekControl({ template: { $progress: bar }, video, duration: 100, emit() {}, on() {}, off() {} })
  bar.fire('pointerdown', { clientX: 20 })
  document.fire('pointermove', { clientX: 80 })
  if (cancel) window.fire('blur')
  else document.fire('pointerup', { clientX: 85 })
  assert.deepEqual(writes, [20])
  assert.equal(plays, 0)
  video.seeking = false; video.fire('seeked')
  assert.deepEqual(writes, [20, cancel ? 10 : 85])
  assert.equal(plays, 0)
  video.seeking = false; video.fire('seeked')
  assert.equal(plays, 1)
})
