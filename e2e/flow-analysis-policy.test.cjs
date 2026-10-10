// The flow analysis ladder decides how precisely motion is estimated, and its
// starting point is the coarsest level. These cases pin the two behaviours that
// matter: a machine with obvious headroom must climb quickly instead of parking
// on the coarse grid, and a machine that is already near budget must not.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

function loadPolicy() {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/flowAnalysisPolicy.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports.FlowAnalysisPolicy
}

/**
 * Measured shape of the flow cost: the pyramid build plus four LK passes grow
 * faster than area. `referenceMs` is what the coarsest rung costs on the machine
 * being simulated, so the same policy can be exercised as idle or as loaded.
 */
const costAt = (width, referenceMs) => referenceMs * (width / 128) ** 2.6

/** Run the ladder with a self-consistent cost for the rung it is currently on. */
function climb(policy, referenceMs, sourceFps, samples, { constant } = {}) {
  const widths = []
  for (let index = 0; index < samples; index++) {
    const computeMs = constant ?? costAt(policy.targetWidth, referenceMs)
    policy.observe(computeMs, sourceFps)
    widths.push(policy.targetWidth)
  }
  return widths
}

test('an idle machine climbs out of the coarsest analysis grid within a fraction of a second', () => {
  const FlowAnalysisPolicy = loadPolicy()
  const policy = new FlowAnalysisPolicy()
  // 1080p, 30 FPS source, 2 ms at the coarsest rung: the whole frame budget is
  // 33.3 ms, so this machine has room to analyse in more detail.
  const widths = climb(policy, 2, 30, 60)
  assert.equal(widths[0], 128, 'the ladder still starts at the coarsest level')
  const reached = (width) => widths.indexOf(width)
  assert.ok(reached(192) >= 0 && reached(192) < 20, `192 must be reached quickly, saw ${JSON.stringify(widths.slice(0, 24))}`)
  assert.ok(reached(256) >= 0 && reached(256) < 60, `256 must be reached within about two seconds, saw ${JSON.stringify(widths.slice(0, 60))}`)
  // Fast promotion must still respect the projected budget: the next rung would
  // cost more than the source frame interval, so it must stop at 256.
  assert.ok(policy.targetWidth <= 256, `must not promote past the affordable rung: ${policy.targetWidth}`)
})

test('a machine near the frame budget keeps the long promotion requirement', () => {
  const FlowAnalysisPolicy = loadPolicy()
  const policy = new FlowAnalysisPolicy()
  // 60 FPS source (16.7 ms budget) where the coarsest rung already costs 8 ms:
  // utilisation is high enough that the ladder must not promote on a short streak.
  const widths = climb(policy, 8, 60, 20)
  assert.equal(widths[0], 128)
  assert.equal(policy.targetWidth, 128, `must not fast-promote near budget: ${JSON.stringify(widths)}`)
})

test('sustained overrun still demotes before the fast path can promote again', () => {
  const FlowAnalysisPolicy = loadPolicy()
  const policy = new FlowAnalysisPolicy()
  // Climb to a higher rung first, then overload it.
  climb(policy, 2, 30, 40)
  const climbed = policy.targetWidth
  assert.ok(climbed > 128, `expected a higher rung before overload, saw ${climbed}`)
  const widths = climb(policy, 2, 30, 12, { constant: 40 })
  assert.ok(policy.targetWidth < climbed, `overload must demote: ${JSON.stringify(widths)}`)
})
