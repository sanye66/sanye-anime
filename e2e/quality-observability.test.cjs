const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const output = path.resolve(__dirname, '../sanye_deploy/.local/quality-observability')
const hlsDirectory = path.resolve(__dirname, '../sanye_deploy/.local/quality-fluctuation/media')

/** 直接加载判定模块，用固定时间线复现窗口汇总与提示语义；无浏览器或无 GPU 时仍可执行。 */
function loadModule() {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/qualityObservability.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports
}

/** 三档阶梯：360P/720P/1080P；升档需求按播放器配置的升档系数换算。 */
const UP_FACTOR = 0.85
const LADDER = {
  '360': { levelIndex: 0, height: 360, bitrate: 900_000, nextHeight: 720, nextRequiredBps: 2_600_000 / UP_FACTOR },
  '720': { levelIndex: 1, height: 720, bitrate: 2_600_000, nextHeight: 1080, nextRequiredBps: 4_500_000 / UP_FACTOR },
}
const clarity = (overrides = {}) => ({
  levelIndex: 1, height: 720, bitrate: 2_600_000, highestHeight: 1080, highestBitrate: 4_500_000,
  nextHeight: 1080, nextRequiredBps: 4_500_000 / UP_FACTOR,
  mode: 'auto', capHeight: -1, bandwidthBps: 6_000_000, startupFallback: '', ...overrides,
})
const TOP = clarity({ levelIndex: 2, height: 1080, bitrate: 4_500_000, nextHeight: 0, nextRequiredBps: 0 })
const LOW = clarity({ ...LADDER['360'], bandwidthBps: 1_000_000 })

test('per-window aggregation keeps clarity level and worker cost evidence together', () => {
  const { QualityObservability, QUALITY_WINDOW_HISTORY } = loadModule()
  const observability = new QualityObservability()
  assert.equal(observability.observeClarity(clarity(), 0), '')
  observability.observeStats({ stallFrames: 2, analysisWidth: 320, effectiveProfile: 'fast', requestedProfile: 'sharp',
    qualityFallbacks: [{ from: 'sharp', to: 'fast', reason: '增强耗时持续超出处理预算', atMs: 120 }] })
  assert.equal(observability.observeClarity(clarity(), 1000), '', '同一档位的连续窗口不新增提示')
  const window = observability.latest
  assert.equal(window.levelIndex, 1)
  assert.equal(window.height, 720)
  assert.equal(window.highestHeight, 1080)
  assert.equal(window.mode, 'auto')
  assert.equal(window.belowHighest, true)
  assert.equal(window.stallFrames, 2, '窗口必须带上落后帧')
  assert.equal(window.analysisWidth, 320, '窗口必须带上运动分析宽度')
  assert.equal(window.awaited, null, '没有媒体等待时窗口保留空值')
  assert.equal(window.effectiveProfile, 'fast')
  assert.equal(window.requestedProfile, 'sharp')
  assert.equal(window.qualityFallbacks.length, 1, '窗口必须带上回退历史')
  assert.equal(window.reason, '带宽自适应：估算 6Mb/s')
  assert.equal(window.summary, '当前 720P（最高 1080P）：带宽自适应：估算 6Mb/s')
  assert.equal(observability.explain(), `当前 720P（最高 1080P）：带宽自适应：估算 6Mb/s；画质当前为性能档（请求锐化档）：增强耗时持续超出处理预算；本窗口落后 2 帧；本窗口运动分析宽度 320`)

  // 清单解析前档位未知：不写入窗口，也不带着空档位进入汇总历史。
  const blank = new QualityObservability()
  assert.equal(blank.observeClarity(clarity({ levelIndex: null, height: 0 }), 0), '')
  assert.equal(blank.history.length, 0)
  assert.equal(blank.explain(), '')

  for (let index = 0; index < QUALITY_WINDOW_HISTORY + 5; index++) {
    observability.observeClarity(clarity({ mode: 'manual' }), 2000 + index * 1000)
  }
  assert.equal(observability.history.length, QUALITY_WINDOW_HISTORY, '窗口历史必须有上限')
})

test('non-highest reasons follow structural limits, bandwidth, stalls and adaptive order', () => {
  const { describeClarityReason } = loadModule()
  const reasonOf = (overrides) => describeClarityReason({ ...clarity(), belowHighest: true, reason: '', summary: '', ...overrides })
  assert.equal(describeClarityReason({ ...clarity(), belowHighest: false }), '', '最高档不产生原因')
  assert.equal(reasonOf({ mode: 'manual' }), '手动选择')
  assert.equal(reasonOf({ startupFallback: '记忆档位未出画，已回落低档' }), '记忆档位未出画，已回落低档')
  assert.equal(reasonOf({ capHeight: 360 }), '播放窗口尺寸上限 360P')
  assert.equal(reasonOf({ capHeight: 1080 }), '带宽自适应：估算 6Mb/s', '上限不低于阶梯最高档时不能算作原因')
  assert.equal(reasonOf({ bandwidthBps: 1_000_000 }), '带宽不足：估算 1Mb/s，1080P 档需 5.3Mb/s')
  assert.equal(reasonOf({ bandwidthBps: 6_000_000, awaited: 2 }), '播放中停顿 2 次')
  assert.equal(reasonOf({ bandwidthBps: 0, awaited: 0 }), '带宽自适应')
})

test('the change notice fires once per automatic downgrade and clears at the top level', () => {
  const { QualityObservability } = loadModule()
  const observability = new QualityObservability()
  assert.equal(observability.observeClarity(TOP, 0), '', '首个窗口不提示')
  const dropped = observability.observeClarity(LOW, 1000)
  assert.match(dropped, /^清晰度已调整：当前 360P（最高 1080P）：/)
  assert.match(dropped, /带宽不足/)
  assert.equal(observability.observeClarity(LOW, 2000), '', '同一档位不重复提示')
  // 最小间隔内的新降档先登记，档位不再变化时在间隔结束后补齐说明，不被静默吞掉。
  assert.equal(observability.observeClarity(clarity({ ...LADDER['720'] }), 3000), '')
  assert.equal(observability.observeClarity(clarity({ ...LADDER['720'] }), 4000), '', '最小间隔内仍不播报')
  assert.match(observability.observeClarity(clarity({ ...LADDER['720'] }), 6000), /^清晰度已调整：当前 720P（最高 1080P）：/)
  // 回到最高档后，同类降档可以再次提示，说明提示不会永久静默。
  assert.equal(observability.observeClarity(TOP, 30_000), '')
  assert.match(observability.observeClarity(LOW, 31_000), /^清晰度已调整：当前 360P（最高 1080P）：/)
  // 手动选择由清晰度菜单自身的切换提示说明，档位说明不重复播报。
  assert.equal(observability.observeClarity(clarity({ mode: 'manual', ...LADDER['720'] }), 47_000), '')
})

/**
 * 记录播放器提示与画质窗口：提示来自通知控件，窗口来自播放器实例上的诊断通道，
 * 两者都不依赖测试直接读取组件内部状态。
 */
function installObservers() {
  window.__qualityNotices = []
  window.__qualityWindows = []
  const start = () => {
    const inner = document.querySelector('.art-notice-inner')
    if (!inner) return requestAnimationFrame(start)
    const record = () => {
      const text = inner.textContent?.trim() ?? ''
      if (!text || window.__qualityNotices.at(-1)?.text === text) return
      window.__qualityNotices.push({ text, at: Math.round(performance.now()) })
    }
    record()
    new MutationObserver(record).observe(inner, { childList: true, characterData: true, subtree: true })
  }
  start()
  const sample = async () => {
    const moduleUrl = performance.getEntriesByType('resource').map(entry => entry.name)
      // 开发服务是 `/deps/artplayer.js`，构建产物是 `/assets/artplayer-<hash>.js`，两种入口都要能解析。
      .find(url => /artplayer[-.\w]*\.js(?:\?|$)/.test(url))
    if (moduleUrl && !window.__qualityPlayer) {
      const { default: Artplayer } = await import(moduleUrl)
      window.__qualityPlayer = Artplayer.instances[0] ?? null
    }
    const windows = window.__qualityPlayer?.sanyeQualityWindows
    if (windows?.length) window.__qualityWindows = windows.map(entry => ({ ...entry }))
    setTimeout(sample, 200)
  }
  void sample()
}

test('a real automatic clarity drop is explained by the same window data and stays queryable', { timeout: 300000 }, async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    await fsp.mkdir(output, { recursive: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.addInitScript(() => {
      localStorage.setItem('sanye:playback:preferences:v1', JSON.stringify({ frameRate: 60, quality: 'fast' }))
      localStorage.removeItem('sanye:playback:startup-quality:v1')
    })
    await page.addInitScript(installObservers)
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.route('**/api/v1/anime/external-preview?*', route => route.fulfill({ json: { code: 0, message: 'ok', data: {
      title: '画质可观测性测量', originalTitle: '', type: '电影', tags: [],
      episodes: [{ id: 901, episodeNo: 1, title: '测试片段', playbackUrl: `${origin}/quality-hls/master.m3u8`,
        mimeType: 'application/vnd.apple.mpegurl' }] } } }))
    // 高档分片固定延迟 3 秒：本机下载速度远高于该档位码率，只有延迟才能复现带宽不足的真实降档。
    await page.route('**/quality-hls/*', async route => {
      const name = path.basename(new URL(route.request().url()).pathname)
      if (/^high\d*\.ts$/.test(name)) await new Promise(resolve => setTimeout(resolve, 3000))
      return route.fulfill({ path: path.join(hlsDirectory, name),
        contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
        headers: { 'Cache-Control': 'max-age=600' } })
    })
    await page.goto(`${origin}/watch/external?sourceUrl=${encodeURIComponent(`${origin}/quality-hls/master.m3u8`)}`)
    // 大窗口不触发尺寸上限，先观察带宽自适应升到 720P，再因高档下载变慢回落到 360P。
    await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) >= 1280, null, { timeout: 40000 })
    await page.waitForSelector('.sanye-realtime-interpolation-active', { timeout: 40000 })
    const beforeDrop = await page.evaluate(() => ({
      level: window.__qualityPlayer?.hls?.currentLevel ?? null,
      width: document.querySelector('video').videoWidth,
      windows: window.__qualityWindows.length,
    }))
    // 只有「先升到 720P，再因高档下载变慢自动回落」才会产生档位变化提示；起播低档起步不算档位变化。
    // 同时等到画面确实回落到 360P、且提示文案能在窗口汇总里找到同一份说明。
    await page.waitForFunction(() => {
      const notices = window.__qualityNotices
      return (document.querySelector('video')?.videoWidth ?? 0) <= 640
        && notices.some(entry => entry.text.startsWith('清晰度已调整'))
        && window.__qualityWindows.some(entry => entry.belowHighest
          && notices.some(notice => notice.text === `清晰度已调整：${entry.summary}`))
    }, null, { timeout: 90000 })
    const dropped = await page.evaluate(() => ({
      level: window.__qualityPlayer?.hls?.currentLevel ?? null,
      cap: window.__qualityPlayer?.hls?.autoLevelCapping ?? null,
      height: document.querySelector('video').videoHeight,
      windows: [...window.__qualityWindows],
      notices: [...window.__qualityNotices],
    }))
    // 可查询说明：从既有清晰度菜单里再查一次，不新增常驻面板。
    await page.locator('.art-control-quality').click()
    const explainItem = page.locator('.art-control-quality .art-selector-item').filter({ hasText: '当前清晰度说明' })
    assert.equal(await explainItem.count(), 1, '清晰度菜单必须提供可查询说明入口')
    await explainItem.dispatchEvent('click')
    await page.waitForTimeout(300)
    const queried = await page.evaluate(() => ({
      notices: [...window.__qualityNotices],
      latestWindow: window.__qualityWindows.at(-1),
      label: document.querySelector('.art-control-quality .art-selector-value')?.textContent?.trim() ?? '',
      options: [...document.querySelectorAll('.art-control-quality .art-selector-item')].map(item => item.textContent.trim()),
    }))
    await page.screenshot({ path: path.join(output, 'clarity-drop.png') })
    await fsp.writeFile(path.join(output, 'report.json'), JSON.stringify({ beforeDrop, dropped, queried }, null, 2))
    const downgrade = dropped.windows.findLast(entry => entry.height === 360 && entry.belowHighest)
    console.log('QUALITY_OBSERVABILITY', JSON.stringify({ beforeDrop, cap: dropped.cap, level: dropped.level,
      downgrade, notices: dropped.notices.map(entry => entry.text) }))

    assert.deepEqual(pageErrors, [], '页面不应有未捕获错误')
    assert.equal(beforeDrop.width, 1280, '带宽足够时自适应应先升到 720P')
    assert.equal(dropped.cap, 1, '大窗口下尺寸上限不应限制到 360P')
    assert.equal(dropped.height, 360, '生效画面应回落到 360P')
    assert.equal(downgrade.levelIndex, 0)
    assert.equal(downgrade.highestHeight, 720)
    assert.equal(downgrade.mode, 'auto')
    assert.ok(Number.isInteger(downgrade.stallFrames), '窗口必须汇总落后帧')
    assert.ok(Number.isInteger(downgrade.analysisWidth) && downgrade.analysisWidth > 0, '窗口必须汇总运动分析宽度')
    assert.ok(Array.isArray(downgrade.qualityFallbacks), '窗口必须汇总回退历史')
    assert.ok(Number.isFinite(downgrade.bandwidthBps) && downgrade.bandwidthBps > 0, '窗口必须记录带宽估计')
    const notice = dropped.notices.find(entry => entry.text.startsWith('清晰度已调整'))
    assert.ok(notice, `降档必须给出界面说明，实际提示 ${JSON.stringify(dropped.notices.map(entry => entry.text))}`)
    assert.match(notice.text, /当前 360P（最高 720P）/)
    // 界面说明必须来自真实汇总的窗口记录，且原因能被同一窗口的数据证实。
    const noticeWindow = dropped.windows.findLast(entry => `清晰度已调整：${entry.summary}` === notice.text)
    assert.ok(noticeWindow, `界面说明必须来自已汇总的窗口数据：${notice.text}`)
    assert.equal(noticeWindow.belowHighest, true)
    assert.ok(noticeWindow.height < noticeWindow.highestHeight)
    if (noticeWindow.reason.startsWith('带宽不足')) {
      assert.ok(noticeWindow.bandwidthBps < noticeWindow.nextRequiredBps,
        `带宽不足的原因必须能被同窗口带宽数据证实：${JSON.stringify(noticeWindow)}`)
    } else {
      assert.match(noticeWindow.reason, /^(带宽自适应|播放中停顿|播放窗口尺寸上限|手动选择|记忆档位)/,
        `非最高档原因必须落在既有归纳内：${noticeWindow.reason}`)
    }
    assert.deepEqual(queried.options.slice(0, 3), ['自动', '720P', '360P'], '既有清晰度选项必须保留')
    assert.equal(queried.label, '自动', '说明项不得把控件标签替换成说明文字')
    const queriedNotice = queried.notices.findLast(entry => entry.text.startsWith('当前 '))
    assert.ok(queriedNotice, '可查询说明必须给出当前档位说明')
    assert.ok(queriedNotice.text.startsWith(queried.latestWindow.summary),
      `可查询说明必须与最新窗口汇总一致：${queriedNotice.text} / ${queried.latestWindow.summary}`)
  } finally {
    await browser.close()
  }
})
