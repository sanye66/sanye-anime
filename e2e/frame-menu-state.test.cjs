const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

test('frame menu follows effective downgrade and recovery while retaining requested ceiling', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/views/animeDetailView.vue'), 'utf8')
  const parsed = ts.createSourceFile('view.ts', source.slice(source.indexOf('\n') + 1, source.indexOf('</script>')), ts.ScriptTarget.Latest)
  const fn = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'updateAnime4KControl')
  assert.ok(fn)
  const cadenceSource = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/frameCadence.ts'), 'utf8')
  const scope = { exports: {}, interpolationStats: null, interpolationTarget: { value: 165 }, interpolationEnabled: { value: true }, anime4KEnabled: { value: false }, anime4KProfile: { value: 'fast' }, ANIME4K_PROFILE_LABELS: { fast: '性能' }, playerRequestVersion: 1, applyAnime4K() {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(cadenceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  scope.FRAME_RATE_OPTIONS = scope.exports.FRAME_RATE_OPTIONS
  vm.runInContext(ts.transpileModule(fn.getText(parsed), {}).outputText, scope)
  const cadence = new scope.exports.FrameCadence(165)
  const menu = () => {
    let selector
    scope.updateAnime4KControl({ controls: { update(control) { if (control.name === 'interpolation') { assert.equal(control.html, '帧率'); selector = control.selector } } } })
    return selector.filter(item => item.default).map(item => item.value)
  }
  assert.equal(JSON.stringify(menu()), '[165]')
  for (let i = 0; i < 5; i++) cadence.observe(50, 12)
  scope.interpolationStats = { targetFps: 165, nextTargetFps: cadence.target }
  assert.equal(JSON.stringify(menu()), '[60]')
  assert.equal(scope.interpolationTarget.value, 165)
  for (let i = 0; i < 20; i++) cadence.observe(cadence.target, 0.5)
  scope.interpolationStats = { targetFps: 60, nextTargetFps: cadence.target }
  assert.equal(JSON.stringify(menu()), '[90]')
  scope.interpolationEnabled.value = false
  assert.equal(JSON.stringify(menu()), '["off"]')
  scope.interpolationEnabled.value = true
  scope.interpolationTarget.value = 'auto'
  scope.interpolationStats = { nextTargetFps: 60 }
  assert.equal(JSON.stringify(menu()), '[60]')
  scope.ANIME4K_PROFILE_LABELS = { fast: '性能', restore: '修复', upscale: '超分 2×' }
  scope.anime4KEnabled.value = true; scope.anime4KProfile.value = 'upscale'
  const qualityMenu = () => {
    let selector
    scope.updateAnime4KControl({ controls: { update(control) {
      if (control.name === 'anime4k') { assert.equal(control.html, '画质'); selector = control.selector }
    } } })
    return JSON.stringify(selector.filter(item => item.default).map(item => item.value))
  }
  scope.interpolationStats = { nextTargetFps: 120, effectiveProfile: 'fast' }
  assert.equal(qualityMenu(), '["fast"]')
  assert.equal(scope.anime4KProfile.value, 'upscale', 'automatic fallback must retain the user preference')
  scope.interpolationStats.effectiveProfile = 'restore'
  assert.equal(qualityMenu(), '["restore"]')
  scope.interpolationStats = null
  assert.equal(qualityMenu(), '["upscale"]')
  scope.anime4KEnabled.value = false
  assert.equal(qualityMenu(), '["off"]')
})
