const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '../sanye_client')] }))

const root = path.resolve(__dirname, '..')
const originalFile = path.join(root, 'sanye_deploy/.local/player-quality/pre-p2/sanye_client/src/video/motionFlow.ts')
const currentFile = path.join(root, 'sanye_client/src/video/motionFlow.ts')
const output = path.join(root, 'sanye_deploy/.local/player-quality/p2-motion-cpu.json')
function loadEstimator(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loaded = new Module(filename, module.parent)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(currentFile))
  loaded._compile(compiled, filename)
  return loaded.exports.MotionEstimator
}

const width = 256, height = 192
const texture = (x, y) => Math.max(0, Math.min(255,
  122 + 40 * Math.sin(x * 0.19 + y * 0.13) + 38 * Math.sin(x * 0.37 - y * 0.31)
  + 25 * Math.sin(x * 0.73 + y * 0.43) + 19 * Math.sin(x * 0.07 - y * 0.52)))
function image(map, overlay) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [u, v] = map(x, y)
    const value = overlay?.(x, y) ?? (u < 0 || v < 0 || u >= width || v >= height ? 35 : texture(u, v))
    const i = (y * width + x) * 4
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value
    pixels[i + 3] = 255
  }
  return pixels
}
const identity = (x, y) => [x, y]
const rotate = (x, y, angle) => {
  const cx = width / 2, cy = height / 2
  const dx = x - cx, dy = y - cy
  return [cx + dx * Math.cos(angle) - dy * Math.sin(angle), cy + dx * Math.sin(angle) + dy * Math.cos(angle)]
}
const scenarios = [
  { name: 'pan', inverse: (x, y) => [x - 8, y - 4], forward: (x, y) => [x + 8, y + 4] },
  { name: 'rotation-6deg', inverse: (x, y) => rotate(x, y, -Math.PI / 30), forward: (x, y) => rotate(x, y, Math.PI / 30) },
  { name: 'rotation-11deg', inverse: (x, y) => rotate(x, y, -Math.PI * 11 / 180), forward: (x, y) => rotate(x, y, Math.PI * 11 / 180) },
  { name: 'deformation', inverse: (x, y) => [x - 11 * Math.sin(y * 0.045), y], forward: (x, y) => [x + 11 * Math.sin(y * 0.045), y] },
  { name: 'occlusion', inverse: (x, y) => [x - 8, y], forward: (x, y) => [x + 8, y],
    overlay: (x, y) => x >= 110 && x < 146 && y >= 45 && y < 145 ? 220 : undefined,
    occluded: (x, y) => x + 8 >= 110 && x + 8 < 146 && y >= 45 && y < 145 },
  { name: 'thin-line', inverse: (x, y) => [x - 8, y], forward: (x, y) => [x + 8, y],
    beforeOverlay: (x, y) => x === 90 && y >= 25 && y < 165 ? 235 : undefined,
    overlay: (x, y) => x === 98 && y >= 25 && y < 165 ? 235 : undefined },
  { name: 'cut', inverse: identity, forward: identity, overlay: () => 10 },
]
function measure(Estimator, scenario) {
  const estimator = new Estimator()
  estimator.estimate(image(identity, scenario.beforeOverlay), width, height)
  const start = performance.now()
  const field = estimator.estimate(image(scenario.inverse, scenario.overlay), width, height)
  const elapsedMs = performance.now() - start
  let accepted = 0, error = 0, bad = 0, occludedConfident = 0, visible = 0, occluded = 0
  for (let row = 0; row < field.height; row++) for (let col = 0; col < field.width; col++) {
    const x = (col + 0.5) * width / field.width, y = (row + 0.5) * height / field.height
    const [tx, ty] = scenario.forward(x, y)
    if (x < 20 || y < 20 || x >= width - 20 || y >= height - 20 || tx < 20 || ty < 20 || tx >= width - 20 || ty >= height - 20) continue
    const confidence = field.data[(row * field.width + col) * 4 + 2]
    if (scenario.occluded?.(x, y)) { occluded++; if (confidence >= 0.15) occludedConfident++; continue }
    visible++
    if (confidence < 0.15) continue
    accepted++
    const dx = field.data[(row * field.width + col) * 4] * width / confidence
    const dy = field.data[(row * field.width + col) * 4 + 1] * height / confidence
    const epe = Math.hypot(dx - (tx - x), dy - (ty - y))
    error += epe
    if (epe > 3) bad++
  }
  return { elapsedMs, visible, accepted, coverage: accepted / visible, meanEpe: accepted ? error / accepted : null,
    bad, occluded, occludedConfident, sceneCut: field.sceneCut }
}
function benchmark(Estimator, scenario) {
  const estimator = new Estimator()
  const old = image(identity, scenario.beforeOverlay), current = image(scenario.inverse, scenario.overlay)
  const times = []
  for (let i = 0; i < 6; i++) {
    estimator.reset()
    estimator.estimate(old, width, height)
    const started = performance.now()
    estimator.estimate(current, width, height)
    if (i >= 2) times.push(performance.now() - started)
  }
  return times
}

module.exports = { width, height, image, identity, rotate, scenarios, loadEstimator, originalFile, currentFile }

if (require.main === module) test('deterministic motion error and confidence against the frozen pre-P2 estimator', () => {
  const before = loadEstimator(originalFile), after = loadEstimator(currentFile)
  const report = Object.fromEntries(scenarios.map(s => [s.name, { before: measure(before, s), after: measure(after, s) }]))
  const sparseMs = Object.fromEntries(scenarios.filter(s => s.name !== 'cut').map(s =>
    [s.name, { before: benchmark(before, s), after: benchmark(after, s) }]))
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify({ width, height, report, sparseMs }, null, 2))
  console.log('P2_MOTION_CPU', JSON.stringify(report))
  assert.equal(report.cut.before.sceneCut, true)
  assert.equal(report.cut.after.sceneCut, true)
  assert.ok(report.pan.after.coverage >= report.pan.before.coverage - 0.03)
  assert.ok(report.pan.after.meanEpe <= report.pan.before.meanEpe + 0.5)
  assert.ok(report['thin-line'].after.coverage >= report['thin-line'].before.coverage - 0.02)
  assert.ok(report['thin-line'].after.bad <= report['thin-line'].before.bad)
  for (const key of ['rotation-6deg', 'rotation-11deg', 'deformation']) {
    assert.ok(report[key].after.bad <= report[key].before.bad, `${key} confidently wrong flow increased`)
  }
  assert.ok(report['rotation-11deg'].after.bad <= report['rotation-11deg'].before.bad - 10)
  assert.ok(report['rotation-11deg'].after.coverage >= 0.3)
  assert.ok(report.occlusion.after.occludedConfident <= report.occlusion.before.occludedConfident)
  assert.ok(report.deformation.after.bad < report.deformation.before.bad)
  assert.equal(report.occlusion.after.occludedConfident, 0)
})
