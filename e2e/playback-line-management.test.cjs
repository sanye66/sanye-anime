const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const base = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5188'
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')

/** 直接加载客户端模块，验证线路名解析规则本身。 */
function loadLines() {
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/playbackLines.ts'), 'utf8')
  const scope = { exports: {} }
  vm.createContext(scope)
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  return scope.exports
}

test('line parser normalizes language and subtitle naming', () => {
  const { parsePlaybackLine } = loadLines()
  const mandarin = parsePlaybackLine('HD国语中字')
  assert.equal(mandarin.language, '国语')
  assert.equal(mandarin.chineseSubtitle, true)
  assert.equal(mandarin.label, '国语中字')
  assert.ok(mandarin.defaultScore > parsePlaybackLine('HD国语').defaultScore)

  const subtitleOnly = parsePlaybackLine('HD中字')
  assert.equal(subtitleOnly.language, '', '只写中字时不推断配音语言')
  assert.equal(subtitleOnly.label, '中字')

  assert.equal(parsePlaybackLine('HD国语').label, '国语')
  assert.equal(parsePlaybackLine('粤语中字').label, '粤语中字')
  assert.equal(parsePlaybackLine('日语中字').label, '日语原声中字')
  assert.equal(parsePlaybackLine('HD').label, '')
  assert.equal(parsePlaybackLine('HD').defaultScore, 0)
})

test('movie detail plays 国语中字 by default and labels every line once', { timeout: 30000 }, async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const episodes = [{
      id: 1,
      episodeNo: 1,
      title: 'HD中字',
      sourcePageUrl: 'https://www.yhdmtv.cc/p/1/2/0',
      playbackUrl: '/line-mid.mp4',
      mimeType: 'video/mp4',
      playbackOptions: [
        { url: '/line-cn.mp4', mimeType: 'video/mp4', label: 'HD国语' },
        { url: '/line-cn-2.mp4', mimeType: 'video/mp4', label: 'HD国语' },
        { url: '/line-cn-sub.mp4', mimeType: 'video/mp4', label: 'HD国语中字' },
      ],
    }]
    await page.route('**/api/v1/**', async route => {
      if (route.request().url().includes('external-preview')) {
        return route.fulfill({ json: { code: 0, data: {
          title: '线路管理验收',
          originalTitle: '',
          type: '剧场版',
          year: 2026,
          summary: '',
          tags: [],
          updateText: '',
          coverUrl: '/covers/anime-placeholder.svg',
          sourceUrl: 'https://www.yhdmtv.cc/p/1/2/0',
          episodes,
        } } })
      }
      return route.fulfill({ json: { code: 0, data: null } })
    })
    const fixture = path.resolve(__dirname, '../sanye_deploy/.local/realtime-interpolation/source-1080p.mp4')
    await page.route('**/line-*.mp4', route => route.fulfill({ path: fixture, contentType: 'video/mp4' }))

    const query = new URLSearchParams({ sourceUrl: 'https://www.yhdmtv.cc/p/1/2/0' })
    await page.goto(`${base}/watch/external?${query}`)
    await page.locator('.anime-playback-sources summary').waitFor()
    await page.locator('.anime-playback-sources summary').click()
    await page.locator('.anime-playback-source-options button').first().waitFor()
    const labels = (await page.locator('.anime-playback-source-options button').allTextContents()).map(text => text.trim())
    assert.deepEqual(labels, ['国语中字', '国语', '国语 2', '中字'], '线路标签应按默认优先级排序并可区分')
    assert.match(await page.locator('.anime-playback-sources summary').innerText(), /当前：国语中字/)
    await page.waitForFunction(() => {
      const video = document.querySelector('.anime-player-frame video')
      return video instanceof HTMLVideoElement && `${video.currentSrc}${video.src}`.includes('/line-cn-sub.mp4')
    }, null, { timeout: 10000 })
    const active = (await page.locator('.episode-button.source-button.active').textContent()).trim()
    assert.equal(active, '国语中字')
  } finally {
    await browser.close()
  }
})
