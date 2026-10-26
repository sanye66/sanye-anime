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

test('清单初始自动档不清空缓冲，起播前指定画质不取消首片', () => {
  const calls = []
  const hls = { manualLevel: -1, set loadLevel(value) { calls.push(['load', value]); this.manualLevel = value }, set nextLevel(value) { calls.push(['next', value]); this.manualLevel = value } }
  const scope = load('function applyStreamSelection(', 'function fallbackKey', {
    hls, chosenQuality: { value: -1 }, hasFirstFrame: { value: false },
  })
  scope.applyStreamSelection()
  assert.deepEqual(calls, [])
  scope.chosenQuality.value = 1
  scope.applyStreamSelection()
  assert.deepEqual(calls, [['load', 1]])
  scope.applyStreamSelection()
  assert.equal(calls.length, 1)
  scope.hasFirstFrame.value = true
  scope.chosenQuality.value = -1
  scope.applyStreamSelection()
  assert.deepEqual(calls, [['load', 1], ['next', -1]])
})

test('已缓冲目标采用短节流，未缓冲目标避免连续网络定位', () => {
  let now = 1000
  const seeks = []
  const element = { seeking: false, buffered: { length: 1, start: () => 0, end: () => 30 }, get currentTime() { return seeks.at(-1) ?? 0 }, set currentTime(value) { seeks.push(value) } }
  const scope = load('function previewSeek(', '/** 取消拖动时', {
    video: { value: element }, seekMax: { value: 100 }, playbackSeconds: { value: 0 },
    pendingSeekTarget: null, lastPreviewSeekAt: 0, Date: { now: () => now }, Math, Number,
  })
  scope.previewSeek(10)
  now += 60
  scope.previewSeek(20)
  assert.deepEqual(seeks, [10, 20])
  now += 60
  scope.previewSeek(50)
  assert.equal(seeks.length, 2)
  now += 230
  scope.previewSeek(50)
  assert.deepEqual(seeks, [10, 20, 50])
  element.seeking = true
  now += 400
  scope.previewSeek(60)
  assert.equal(seeks.length, 3)
})

test('manifest 预取合并在途和短期命中，失败不污染下一次请求', async () => {
  let now = 1000
  const requests = []
  const scope = load('function prefetchHlsManifest(', '/** 详情页解析完成时', {
    manifestPrefetches: new Map(), PREFETCH_MANIFEST_TIMEOUT_MS: 6000,
    Date: { now: () => now }, AbortController, playbackType: () => 'hls',
    window: { setTimeout, clearTimeout },
    fetch: (_, options) => new Promise((resolve, reject) => requests.push({ resolve, reject, options })),
  })
  scope.prefetchHlsManifest('https://media.example/1.m3u8')
  scope.prefetchHlsManifest('https://media.example/1.m3u8')
  assert.equal(requests.length, 1)
  requests[0].resolve({ ok: true, text: async () => '#EXTM3U' })
  await new Promise(setImmediate)
  scope.prefetchHlsManifest('https://media.example/1.m3u8')
  assert.equal(requests.length, 1)
  now += 15001
  scope.prefetchHlsManifest('https://media.example/1.m3u8')
  assert.equal(requests.length, 2)
  requests[1].reject(new Error('网络不可用'))
  await new Promise(setImmediate)
  scope.prefetchHlsManifest('https://media.example/1.m3u8')
  assert.equal(requests.length, 3)
  requests[2].resolve({ ok: true, text: async () => '#EXTM3U' })
  await new Promise(setImmediate)
})

test('下一集预热等待复用的来源解析，再预连接并预取媒体清单', async () => {
  const current = { id: 'ep1', title: '第1集', sourceUrl: 'https://source.example/1', playbackUrl: '' }
  const next = { id: 'ep2', title: '第2集', sourceUrl: 'https://source.example/2', playbackUrl: '', lineId: 'main' }
  const preview = { episodes: [current, next] }
  const calls = []
  let finish
  const scope = load('function warmAdjacentEpisode(', "const WARM_LINK_REL", {
    sourcePreview: { value: preview }, episodeGroups: { value: [{ episodes: [current, next] }] },
    episodeOptions: (url) => { calls.push(['parse', url]); return new Promise((resolve) => { finish = resolve }) },
    episodeMediaType: (episode) => Boolean(episode.playbackUrl), resolvePlayableLine: (options) => options[0],
    warmMediaHost: (url) => calls.push(['warm', url]), prefetchHlsManifest: (url) => calls.push(['prefetch', url]),
    inlineMediaAvailable: () => false,
  })
  scope.warmAdjacentEpisode(current, preview)
  assert.deepEqual(calls, [['parse', next.sourceUrl]])
  finish([{ playbackUrl: 'https://media.example/2.m3u8' }])
  await new Promise(setImmediate)
  assert.deepEqual(calls.slice(1), [['warm', 'https://media.example/2.m3u8'], ['prefetch', 'https://media.example/2.m3u8']])
})

test('相邻集等待真实播放事件，旧播放代次不能发起预热', () => {
  const preview = {}
  const calls = []
  const scope = load('let pendingAdjacentWarm:', 'async function episodeOptions', {
    playbackGeneration: 1, sourcePreview: { value: preview }, video: { value: { paused: false, readyState: 1 } },
    warmAdjacentEpisode: (...args) => calls.push(args),
  })
  scope.scheduleAdjacentWarm({ id: 'ep1' }, preview)
  assert.equal(calls.length, 0)
  vm.runInContext('pendingAdjacentWarm()', scope)
  assert.equal(calls.length, 1)
  scope.scheduleAdjacentWarm({ id: 'ep2' }, preview)
  scope.playbackGeneration = 2
  vm.runInContext('pendingAdjacentWarm()', scope)
  assert.equal(calls.length, 1)
})

test('首条详情已有缓存仍预热媒体，同一在途任务只执行一次', async () => {
  let finish
  const calls = []
  const scope = load('let topHitWarm:', '// 当前集进入 playing', {
    activeSubscriptionScope: () => 'current', sourceCacheKey: url => url, section: { value: 'search' },
    fetchPreview: () => { calls.push('preview'); return Promise.resolve({ episodes: [{ sourceUrl: 'ep1' }] }) },
    pickPlayableEpisode: episodes => episodes[0],
    androidSource: { resolve: () => { calls.push('resolve'); return new Promise(resolve => { finish = resolve }) } },
    playbackType: () => 'hls', prewarmInlineManifest: async () => { calls.push('manifest') },
  })
  const hits = [{ sourceUrl: 'work1' }]
  const first = scope.warmTopHit(hits)
  assert.equal(scope.warmTopHit(hits), first)
  await new Promise(setImmediate)
  finish({ playbackUrl: 'https://media.example/1.m3u8' })
  await first
  assert.deepEqual(calls, ['preview', 'resolve', 'manifest'])
})

test('续播异步回调同时校验 generation 与集数线路，不依赖 video 元素更换', async () => {
  const element = { currentTime: 0, duration: 1000 }
  let finish
  const positions = []
  const scope = load('function restorePosition(', 'let pendingLinePosition:', {
    video: { value: element }, selected: { value: { url: 'https://source.example/work' } }, playbackGeneration: 1, hlsResumeGeneration: -1,
    activeEpisodeId: { value: 'ep1' }, activeLineId: { value: 'main' }, pendingLinePosition: null,
    seekingPlayback: { value: false }, history: { value: [] }, playbackSeconds: { value: 0 },
    downloadedPlaybackUrl: '', offlineResumePosition: 0,
    reloadHistory: () => new Promise((resolve) => { finish = resolve }), bestHistoryRecord: () => undefined,
    applyResumePosition: (_, record) => { if (record) positions.push(record.positionSeconds); return Boolean(record) }, Number,
  })
  scope.restorePosition()
  scope.playbackGeneration = 2
  scope.activeEpisodeId.value = 'ep2'
  scope.history.value = [{ mediaUrl: 'https://source.example/work', episodeId: 'ep2', lineId: 'main', positionSeconds: 500 }]
  finish()
  await new Promise(setImmediate)
  assert.deepEqual(positions, [], '旧读取不能使用新集的活动身份落位')
  scope.history.value = []
  scope.restorePosition()
  scope.activeLineId.value = 'other'
  scope.history.value = [{ mediaUrl: 'https://source.example/work', episodeId: 'ep2', lineId: 'other', positionSeconds: 600 }]
  finish()
  await new Promise(setImmediate)
  assert.deepEqual(positions, [], '即使 generation 未变，线路身份变化也必须拒绝旧回调')
})

test('HLS 已指定续播位置时 metadata 不再次 seek 或补读历史', () => {
  let seeks = 0, reads = 0
  const element = { get currentTime() { return 0 }, set currentTime(_) { seeks++ }, duration: 1000 }
  const scope = load('function restorePosition(', 'let pendingLinePosition:', {
    video: { value: element }, selected: { value: { url: 'work' } }, playbackGeneration: 3, hlsResumeGeneration: 3,
    pendingLinePosition: { generation: 3, seconds: 100 }, reloadHistory: () => { reads++; return Promise.resolve() },
  })
  scope.restorePosition()
  assert.equal(seeks, 0)
  assert.equal(reads, 0)
  assert.equal(scope.pendingLinePosition, null)
})
