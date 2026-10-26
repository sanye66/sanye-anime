const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/androidApp.vue'), 'utf8')

function load(start, end, scope) {
  vm.createContext(scope)
  const body = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))
  vm.runInContext(ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope)
  return scope
}

test('码流切换保留正在播放的缓冲，仍锁定 HLS 手动档位', () => {
  const calls = []
  const hls = {
    manualLevel: -1,
    set loadLevel(level) { calls.push(['load', level]); this.manualLevel = level },
    set nextLevel(level) { calls.push(['next', level]); this.manualLevel = level },
    set currentLevel(level) { calls.push(['flush', level]); this.manualLevel = level },
  }
  const scope = load('function applyStreamSelection(', 'function fallbackKey', {
    hls, chosenQuality: { value: -1 }, hasFirstFrame: { value: false },
  })
  scope.applyStreamSelection()
  scope.chosenQuality.value = 1
  scope.applyStreamSelection()
  scope.hasFirstFrame.value = true
  scope.chosenQuality.value = 2
  scope.applyStreamSelection()
  scope.applyStreamSelection()
  scope.chosenQuality.value = -1
  scope.applyStreamSelection()
  assert.deepEqual(calls, [['load', 1], ['next', 2], ['next', -1]])
})

test('帧率档位必须存在于清单，选择后落到对应的最高码率画质档', () => {
  const qualityLevels = { value: [{ index: 0, fps: 24 }, { index: 1, fps: 60 }, { index: 2, fps: 60 }] }
  const chosenQuality = { value: 0 }, chosenFps = { value: 'auto' }
  const calls = []
  const scope = load('function changeQuality(value: string)', '/** 进入定位预览', {
    qualityLevels, chosenQuality, chosenFps, hls: { levels: [{ bitrate: 100 }, { bitrate: 200 }, { bitrate: 400 }] },
    applyStreamSelection: () => calls.push(chosenQuality.value), Number,
  })
  scope.changeFps('120')
  assert.equal(chosenFps.value, 'auto')
  assert.deepEqual(calls, [])
  scope.changeFps('60')
  assert.equal(chosenFps.value, '60')
  assert.equal(chosenQuality.value, 2)
  scope.changeQuality('0')
  assert.equal(chosenQuality.value, 0)
  assert.equal(chosenFps.value, '24')
  scope.changeQuality('99')
  assert.equal(chosenQuality.value, 0)
  assert.deepEqual(calls, [2, 0])
})

test('画质弹层只呈现画质档位', () => {
  const menu = source.slice(source.indexOf('<template v-if="chromeMenu === \'quality\'">'), source.indexOf('<template v-else-if="chromeMenu === \'fps\'">'))
  assert.match(menu, /changeQualityProfile\('off'\)/)
  assert.match(menu, /changeQuality\(String\(level.index\)\)/)
  assert.doesNotMatch(menu, /AndroidPlaybackTools|播放速度|下载当前视频|导入字幕|定时暂停/)
  assert.match(menu, /:aria-pressed="activeLevel === level.index"/)
})

test('画质说明显示生效码流，而非尚未生效的手动选择', () => {
  const qualityLevels = { value: [
    { label: '360P · 900 kbps' }, { label: '1080P · 4500 kbps' },
  ] }
  const scope = load('function currentStreamQualityNotice()', '/** 浮层右缘', {
    hls: { levels: [{ height: 360, bitrate: 900_000 }, { height: 1080, bitrate: 4_500_000 }] },
    qualityLevels, activeLevel: { value: 0 }, chosenQuality: { value: 1 },
  })
  assert.equal(scope.currentStreamQualityNotice(), '当前片源 360P · 900 kbps；最高 1080P；手动选档。')
  scope.activeLevel.value = 1
  scope.chosenQuality.value = -1
  assert.equal(scope.currentStreamQualityNotice(), '当前片源 1080P · 4500 kbps；最高 1080P；自动选档。')
})
