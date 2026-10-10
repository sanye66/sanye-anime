const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')
const stylesheet = path.resolve(__dirname, '../sanye_client/src/platform/android/android.css')
const output = path.resolve(__dirname, '../sanye_deploy/.local/android-theme-parity')

/**
 * 安卓浅色主题一致性门禁。
 *
 * 默认主题是「跟随系统」（`data-theme=system`），而顶栏切换出来的是显式浅色（`data-theme=light`）：
 * 两条路径的浅色规则在样式表里各写一套，任何一条漏写都会让「跟随系统的用户」看到另一套外观——
 * 深蓝径向遮罩压在米色底上、选集按钮还是深蓝实心块、「收藏」筛选对比度只有 3.18。
 * 本文件用五条门槛把这种漏写变成可复核的失败：
 *   1. 静态：每条 `[data-theme=light]` 选择器都要有对应的 `[data-theme=system]` 规则（写在系统浅色媒体查询内）；
 *   2. 渲染：系统浅色与显式浅色在同一份数据下逐项 deepEqual，并断言不沿用深色底与深色实心块、关键文字对比度 ≥4.5；
 *   3. 结构：标题层级不跳级、「我的」不再出现自动播放开关（v0.14 已删除）；
 *   4. 文案：首页导语的随包收录量覆盖整包作品与线路，不是只取第一部作品；
 *   5. 兜底页：挂载失败时的 `.android-mount-failure` 在三套外观下都取主题令牌，按钮文字对比度 ≥4.5。
 * 证据写入 sanye_deploy/.local/android-theme-parity/。
 */

/**
 * 门槛 1：样式表里「显式浅色」与「系统浅色」必须成对存在。
 *
 * 起因：`.android-app` 的浅色渐变只写在 `[data-theme=light]` 上，系统浅色（默认主题就是 system）
 * 继续压着深色主题的蓝色径向遮罩，浅米底被压成灰蓝，正文对比度掉到 4.5 以下。
 */
test('显式浅色规则都有对应的系统浅色规则', async () => {
  const css = (await readFile(stylesheet, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
  const explicit = new Set()
  const system = new Set()
  let index = 0
  let buffer = ''
  const stack = []
  while (index < css.length) {
    const char = css[index]
    if (char === '{') {
      const prelude = buffer.trim()
      buffer = ''
      if (prelude.startsWith('@media')) {
        stack.push(prelude)
      } else if (prelude.startsWith('@')) {
        stack.push(null)
      } else {
        let depth = 1
        let cursor = index + 1
        while (cursor < css.length && depth > 0) {
          if (css[cursor] === '{') depth += 1
          if (css[cursor] === '}') depth -= 1
          cursor += 1
        }
        const media = stack.filter(Boolean).join(' && ')
        for (const selector of prelude.split(',').map((value) => value.trim()).filter(Boolean)) {
          if (selector.includes('[data-theme=light]')) explicit.add(selector)
          if (selector.includes('[data-theme=system]') && media.includes('prefers-color-scheme: light')) system.add(selector)
        }
        index = cursor
        continue
      }
    } else if (char === '}') {
      stack.pop()
      buffer = ''
    } else {
      buffer += char
    }
    index += 1
  }
  assert.ok(explicit.size > 10, `显式浅色规则太少，解析可能失效：${explicit.size}`)
  const missing = [...explicit].map((selector) => selector.replace(/\[data-theme=light\]/g, '[data-theme=system]')).filter((selector) => !system.has(selector))
  assert.deepEqual(missing, [], `系统浅色缺少这些对应规则（系统浅色会沿用深色主题的值）：\n${missing.join('\n')}`)
})

/** 页面桥接：固定主题、固定数据，两条浅色路径除了 data-theme 之外完全一致。 */
const initScript = () => {
  const items = [{ id: 1, title: '已保存作品甲', url: 'https://example.org/a.mp4', favorite: true, updatedAt: Date.now(), summary: '本机保存的直链媒体。' }]
  const history = [{ mediaUrl: 'https://example.org/a.mp4', title: '已保存作品甲', episodeId: 'direct', episodeTitle: '直链媒体', lineId: 'main', positionSeconds: 300, durationSeconds: 1200, completed: false, updatedAt: Date.now() }]
  const settings = { theme: window.__theme, autoPlay: false, playbackRate: 1, qualityProfile: 'off', frameTarget: 'off' }
  window.Capacitor = {
    getPlatform: () => 'android',
    PluginHeaders: [
      { name: 'SanyeCatalog', methods: ['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache'].map((name) => ({ name, rtype: 'promise' })) },
      { name: 'SanyeSource', methods: ['search', 'preview'].map((name) => ({ name, rtype: 'promise' })) },
    ],
    nativePromise: async (_, method, options) => {
      if (method === 'list') return { items }
      if (method === 'listHistory') return { items: history }
      if (method === 'getSettings') return { settings: { ...settings } }
      if (method === 'setSettings') { Object.assign(settings, options.settings); return { settings: { ...settings } } }
      if (method === 'search') return { hits: [{ title: '来源候选甲', sourceUrl: 'https://www.yhdmtv.cc/p/900', coverUrl: '', summary: '' }] }
      if (method === 'preview') return { title: '来源候选甲', sourceUrl: options.sourceUrl, coverUrl: '', summary: '', episodes: [
        { id: options.sourceUrl, title: '第1集', sourceUrl: options.sourceUrl, playbackUrl: 'https://cdn.example.org/sample.m3u8', mimeType: 'application/vnd.apple.mpegurl', lineId: 'main' },
        { id: `${options.sourceUrl}#2`, title: '第2集', sourceUrl: options.sourceUrl, playbackUrl: 'https://cdn.example.org/sample2.m3u8', mimeType: 'application/vnd.apple.mpegurl', lineId: 'main' },
      ] }
      return {}
    },
  }
}

/** 取元素贴字像素里出现最多的颜色，作为元素文字背后的真实背景色。 */
const dominantBackground = async (page, locator) => {
  const front = await locator.evaluate((node) => {
    const match = getComputedStyle(node).color.match(/[\d.]+/g).map(Number)
    return { r: match[0], g: match[1], b: match[2], a: match[3] ?? 1 }
  })
  const png = (await locator.screenshot()).toString('base64')
  const background = await page.evaluate(async ({ png, front }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${png}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    const histogram = new Map()
    for (let cursor = 0; cursor < data.length; cursor += 4) {
      const [r, g, b] = [data[cursor], data[cursor + 1], data[cursor + 2]]
      if (Math.abs(r - front.r) + Math.abs(g - front.g) + Math.abs(b - front.b) < 120) continue
      const key = `${r >> 2},${g >> 2},${b >> 2}`
      const entry = histogram.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
      entry.count += 1
      entry.r += r
      entry.g += g
      entry.b += b
      histogram.set(key, entry)
    }
    let best = null
    for (const entry of histogram.values()) if (!best || entry.count > best.count) best = entry
    return best ? { r: Math.round(best.r / best.count), g: Math.round(best.g / best.count), b: Math.round(best.b / best.count) } : null
  }, { png, front })
  if (!background) return { front: `rgb(${front.r}, ${front.g}, ${front.b})`, background: null, contrast: 1 }
  const composited = front.a < 1
    ? { r: front.r * front.a + background.r * (1 - front.a), g: front.g * front.a + background.g * (1 - front.a), b: front.b * front.a + background.b * (1 - front.a) }
    : front
  return { front: `rgb(${front.r}, ${front.g}, ${front.b})`, background: `rgb(${background.r}, ${background.g}, ${background.b})`, contrast: Number(contrast(composited, background).toFixed(2)) }
}

/** 两条浅色路径（系统浅色 / 顶栏显式浅色）在同一页面上的关键取值。 */
const collect = async (page) => {
  const state = {}
  // 片库：筛选芯片
  await page.getByRole('button', { name: '片库', exact: true }).click()
  await page.getByRole('heading', { name: '番剧仓库' }).waitFor()
  const filter = page.locator('.android-page-section .android-section-title button').filter({ hasText: '收藏' }).first()
  await filter.waitFor()
  state.filter = await dominantBackground(page, filter)
  state.filterChip = await filter.evaluate((node) => getComputedStyle(node).color)
  state.listItem = await page.locator('.android-page-section .android-list li').first().evaluate((node) => getComputedStyle(node).backgroundColor)
  // 历史：历史卡片
  await page.getByRole('button', { name: '历史', exact: true }).click()
  await page.getByRole('heading', { name: '继续观看' }).waitFor()
  state.historyCard = await page.locator('.android-history-list li').first().evaluate((node) => getComputedStyle(node).backgroundColor)
  // 详情：占位封面、选集按钮、末位动作
  await page.locator('.android-top-search').click()
  await page.getByLabel('作品关键词').fill('来源')
  await page.getByRole('button', { name: '搜索来源' }).click()
  await page.getByRole('button', { name: '立即观看' }).first().click()
  await page.locator('.android-detail-actions button').first().waitFor()
  await page.locator('.android-episode-grid button').first().waitFor()
  state.cover = await page.locator('.android-cover-empty').first().evaluate((node) => ({ image: getComputedStyle(node).backgroundImage, color: getComputedStyle(node).color }))
  state.episode = await page.locator('.android-episode-grid button').first().evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color }))
  const action = page.locator('.android-detail-actions button').last()
  state.action = await dominantBackground(page, action)
  state.appBackground = await page.locator('.android-app').evaluate((node) => getComputedStyle(node).backgroundImage)
  return state
}

const launch = async (theme, scheme = 'light') => {
  await fs.mkdir(output, { recursive: true })
  const server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURI(request.url || '/'))
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    const file = target === root ? path.join(root, 'index.html') : target
    try {
      const data = await readFile(file)
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme })
  await page.route('https://img.picbf.com/**', (route) => route.abort())
  await page.route('https://cdn.example.org/**', () => {})
  await page.route('https://www.yhdmtv.cc/**', () => {})
  await page.addInitScript(`window.__theme = ${JSON.stringify(theme)}`)
  await page.addInitScript(initScript)
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.locator('.android-home .android-hero').waitFor()
  return { page, browser, server }
}

/**
 * 门槛 2：系统浅色（默认主题路径）必须与顶栏显式浅色渲染一致，并且不再沿用深色主题的底色。
 * 两条路径在同一份数据、同一宽度下逐项比对，任何一项不同都说明有一条路径漏了规则。
 */
test('系统浅色与显式浅色渲染一致，且不沿用深色底', { timeout: 180000 }, async () => {
  const system = await launch('system')
  const forced = await launch('light')
  let systemState
  let forcedState
  try {
    assert.equal(await system.page.locator('.android-app').getAttribute('data-theme'), 'system', '默认主题应为跟随系统')
    assert.equal(await forced.page.locator('.android-app').getAttribute('data-theme'), 'light', '显式浅色路径应写入 data-theme=light')
    systemState = await collect(system.page)
    forcedState = await collect(forced.page)
  } finally {
    await system.browser.close()
    await forced.browser.close()
    await new Promise((resolve) => system.server.close(resolve))
    await new Promise((resolve) => forced.server.close(resolve))
  }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ system: systemState, forced: forcedState }, null, 1), 'utf8')

  // 系统浅色下页面底色不能再压深色主题的蓝色径向遮罩（rgba(42, 74, 118)）。
  assert.ok(systemState.appBackground.includes('rgba(250, 216, 181'), `系统浅色页面底色仍是深色遮罩：${systemState.appBackground}`)
  assert.ok(!systemState.appBackground.includes('rgba(42, 74, 118'), `系统浅色页面底色仍带蓝色遮罩：${systemState.appBackground}`)
  // 深色主题的实心块不能再出现在系统浅色里。
  assert.notEqual(systemState.episode.background, 'rgb(40, 58, 85)', '系统浅色下选集按钮仍是深色实心块')
  assert.notEqual(systemState.historyCard, 'rgba(7, 18, 34, 0.28)', '系统浅色下历史条目仍是深色半透明底')
  assert.ok(systemState.cover.image.includes('linear-gradient(145deg, rgb(239, 232, 218)'), `系统浅色下缺封面占位块不是米色系：${systemState.cover.image}`)
  // 文字对比度：筛选芯片与末位动作都要达到 4.5（此前分别是 3.18 与 3.6–4.4）。
  assert.ok(systemState.filter.contrast >= 4.5, `系统浅色下「收藏」筛选对比度不足：${JSON.stringify(systemState.filter)}`)
  assert.ok(systemState.action.contrast >= 4.5, `系统浅色下末位动作对比度不足：${JSON.stringify(systemState.action)}`)
  assert.ok(forcedState.filter.contrast >= 4.5, `显式浅色下「收藏」筛选对比度不足：${JSON.stringify(forcedState.filter)}`)
  assert.ok(forcedState.action.contrast >= 4.5, `显式浅色下末位动作对比度不足：${JSON.stringify(forcedState.action)}`)
  // 两条浅色路径逐项一致。
  assert.deepEqual(systemState, forcedState, `系统浅色与显式浅色的渲染结果不一致：\n${JSON.stringify({ system: systemState, forced: forcedState }, null, 1)}`)
})

/** 门槛 3：标题层级不跳级（此前 h3 → h2 的混用让大纲出现 1→3 的跳级）。 */
test('标题层级不跳级，且「我的」不再有自动播放开关', { timeout: 120000 }, async () => {
  const { page, browser, server } = await launch('system')
  try {
    const outlineOf = () => page.evaluate(() => [...document.querySelectorAll('.android-app h1, .android-app h2, .android-app h3, .android-app h4')]
      .filter((node) => {
        const style = getComputedStyle(node)
        return style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().width > 0
      })
      .map((node) => ({ level: Number(node.tagName.slice(1)), text: (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24) })))
    const pages = [
      { label: '首页', open: async () => {} },
      { label: '片库', open: async () => page.getByRole('button', { name: '片库', exact: true }).click() },
      { label: '排期', open: async () => page.getByRole('button', { name: '排期', exact: true }).click() },
      { label: '历史', open: async () => page.getByRole('button', { name: '历史', exact: true }).click() },
      { label: '我的', open: async () => page.getByRole('button', { name: '我的', exact: true }).click() },
    ]
    const report = {}
    for (const entry of pages) {
      await entry.open()
      await page.waitForTimeout(200)
      const outline = await outlineOf()
      report[entry.label] = outline
      for (let index = 1; index < outline.length; index += 1) {
        assert.ok(outline[index].level - outline[index - 1].level <= 1,
          `${entry.label} 标题层级跳级：${outline[index - 1].level}（${outline[index - 1].text}）→ ${outline[index].level}（${outline[index].text}）`)
      }
      // 有页面标题区的分区必须只有一个一级标题，且分区标题统一为二级。
      const headings = await page.locator('.android-page-heading').count()
      if (headings) assert.equal(outline.filter((item) => item.level === 1).length, 1, `${entry.label} 一级标题数量不对：${JSON.stringify(outline)}`)
      assert.equal(await page.locator('.android-section-title h3').count(), 0, `${entry.label} 分区标题还在用三级标题`)
    }
    await fs.writeFile(path.join(output, 'outline.json'), JSON.stringify(report, null, 1), 'utf8')
    // 自动播放开关在 v0.14 就已删除（播放一律由用户操作触发），不能在「我的」里复活。
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByRole('heading', { name: '我的空间' }).waitFor()
    const settingsText = (await page.locator('.android-page-section').first().textContent()) || ''
    assert.equal(settingsText.includes('自动播放'), false, '「我的」又出现了自动播放开关')
    assert.equal(await page.getByText('进入播放页后自动开始').count(), 0, '「我的」又出现了自动播放说明')
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

/** 门槛 4：首页导语里的收录条数必须覆盖整包作品与线路，不能只取第一部作品。 */
test('首页导语统计整包收录量', { timeout: 120000 }, async () => {
  const { page, browser, server } = await launch('system')
  try {
    const copy = await page.locator('.android-hero').textContent()
    const match = copy.match(/随包收录\s*(\d+)\s*部作品\s*·\s*(\d+)\s*条已核验线路/)
    assert.ok(match, `首页导语没有收录统计：${copy}`)
    const [, works, lines] = match.map(Number)
    console.log(`[theme-parity] 首页导语随包收录：${works} 部作品 / ${lines} 条线路`)
    assert.ok(works >= 6, `随包作品数偏少：${works}`)
    assert.ok(lines >= works * 3, `线路数明显只统计了第一部作品：${works} 部 / ${lines} 条`)
    assert.ok(lines >= 40, `线路数偏少，可能又退化成单部作品的线路数：${lines}`)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

/**
 * 门槛 5：挂载失败兜底页在三套外观下都要可读。
 *
 * `sanye_client/src/android.ts` 在 `app.mount()` 抛错时把这段标记写进 `#app`。它曾经写死深色卡面
 * （`#172330`／`#e7edf5`）与浅黄字按钮（`#eaf2c4`），浅色主题下按钮文字压在近白卡面上几乎看不见；
 * 这里注入与源码一致的标记，逐套外观量卡面底色与按钮文字对比度。
 */
test('挂载失败兜底页在三套外观下都可读', { timeout: 180000 }, async () => {
  const markup = '<div class="android-mount-failure" role="alert"><strong>界面加载失败</strong><p>本地界面没有成功启动，请重试；若反复出现，请把这一步的控制台输出一并反馈。</p><button type="button">重新加载</button></div>'
  const report = {}
  for (const [theme, scheme] of [['light', 'light'], ['system', 'light'], ['dark', 'dark']]) {
    const { page, browser, server } = await launch(theme, scheme)
    try {
      await page.evaluate((html) => { document.querySelector('#app').innerHTML = html }, markup)
      const card = await page.locator('.android-mount-failure').evaluate((node) => getComputedStyle(node).backgroundColor)
      const border = await page.locator('.android-mount-failure').evaluate((node) => getComputedStyle(node).borderTopWidth)
      const copy = await page.locator('.android-mount-failure p').evaluate((node) => getComputedStyle(node).color)
      const button = await dominantBackground(page, page.locator('.android-mount-failure button'))
      report[theme] = { card, border, copy, button }
      // VQ-61：兜底页在 .android-app 之外渲染，令牌必须落在 :root 上；此前 var(--page-card) 解析不到，
      // 卡面是透明背景、边框 0px（实测 rgba(0, 0, 0, 0) 与 0px），整页只剩文字浮在页面底色上。
      assert.ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(card), `${theme} 外观下兜底页卡面令牌没有解析：${card}`)
      assert.notEqual(border, '0px', `${theme} 外观下兜底页边框令牌没有解析`)
      assert.ok(button.contrast >= 4.5, `${theme} 外观下兜底页按钮文字对比度不足：${JSON.stringify(button)}`)
    } finally {
      await browser.close()
      await new Promise((resolve) => server.close(resolve))
    }
  }
  await fs.writeFile(path.join(output, 'mount-failure.json'), JSON.stringify(report, null, 1), 'utf8')
  assert.notEqual(report.light.card, 'rgb(23, 35, 48)', '显式浅色下兜底页仍是写死的深色卡面')
  assert.notEqual(report.system.card, 'rgb(23, 35, 48)', '系统浅色下兜底页仍是写死的深色卡面')
  assert.notEqual(report.light.card, report.dark.card, '兜底页卡面必须跟随外观，而不是一套写死颜色')
})

/** 相对亮度对比度：与文档评审口径一致（>=4.5 视为正文达标）。 */
function contrast(foreground, background) {  const luminance = (color) => {
    const value = color && typeof color === 'object' && 'r' in color
      ? [color.r, color.g, color.b]
      : Array.isArray(color)
        ? color
        : String(color).trim().startsWith('#')
          ? hexToRgb(color)
          : String(color).match(/[\d.]+/g).slice(0, 3).map(Number)
    const [r, g, b] = value.slice(0, 3).map((channel) => {
      const normalized = channel / 255
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [a, b] = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (a + 0.05) / (b + 0.05)
}

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
}
