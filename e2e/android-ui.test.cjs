const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')

/** 播放器浮层没有“完成”按钮：点画面收起浮层，同时保持控制条可见。 */
async function closePlayerMenu(page) {
  await page.locator('.android-player-stage').click({ position: { x: 18, y: 18 } })
  await page.locator('.android-player-menu').waitFor({ state: 'detached' })
}

/**
 * 播放器里没有任何关闭入口：退出统一走安卓返回键。
 * 返回键先收全屏、再收浮层菜单，最后才收播放器，所以这里按两次（真机同样是连按两次）。
 */
async function exitPlayer(page) {
  await page.evaluate(() => window.__fireAndroidBack())
  await page.waitForFunction(() => !document.fullscreenElement)
  // 第一次返回可能只收掉了全屏/浮层菜单：播放器还开着才补按一次。
  if (await page.locator('video').count()) await page.evaluate(() => window.__fireAndroidBack())
  await page.waitForFunction(() => document.querySelectorAll('video').length === 0)
}

/**
 * 用户要求删掉画面上的两处提示：拖动进度条上方的画中画预览，以及画面中间的提示条；
 * 随后澄清「我说的是中间的进度提示不是音量与亮度」——要删的是**进度**提示，亮度与音量提示保留。
 * 因此：亮度、音量手势期间必须出现对应的居中提示；进度相关场景（拖动进度条、横滑定位）
 * 一律不允许出现提示条与画中画预览。
 */
async function gestureOverlays(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.android-player-stage')
    if (!stage) return { hints: [], icons: [], previews: [] }
    return {
      hints: [...stage.querySelectorAll('[class*="hud"]')].map((element) => (element.textContent || '').trim()),
      icons: [...stage.querySelectorAll('[class*="hud"] svg[data-icon]')].map((element) => element.getAttribute('data-icon')),
      previews: [...stage.querySelectorAll('[class*="seek-preview"]')].map((element) => String(element.className)),
    }
  })
}
/** 亮度与音量手势：提示条必须在场、图标与百分比正确，且没有画中画预览。 */
async function assertGestureHint(page, kind, scene) {
  const { hints, icons, previews } = await gestureOverlays(page)
  assert.equal(previews.length, 0, `${scene}期间出现了画中画预览：${previews.join('|')}`)
  assert.equal(hints.length, 1, `${scene}期间应有且只有一条手势提示，实际：${JSON.stringify(hints)}`)
  // VQ-61：图标统一改成线性 SVG，用 data-icon 断言，不再依赖 ☀／🔊 这类自带字形的符号字符。
  const icon = kind === 'brightness' ? 'brightness' : 'volume'
  assert.ok(icons.includes(icon), `${scene}的提示应带 ${icon} 图标，实际：${JSON.stringify(icons)}`)
  assert.match(hints[0], /\d+%/, `${scene}的提示应显示百分比，实际：${hints[0]}`)
}
/** 进度手势：不允许出现提示条，也不允许出现画中画预览。 */
async function assertNoSeekOverlay(page, scene) {
  const { hints, previews } = await gestureOverlays(page)
  assert.equal(hints.length, 0, `${scene}期间不应出现进度提示，实际：${JSON.stringify(hints)}`)
  assert.equal(previews.length, 0, `${scene}期间出现了画中画预览：${previews.join('|')}`)
}

test('安卓独立入口在隔离桥接样例中显示真实空库、保存和收藏', async () => {
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
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark' })
    await page.route('https://img.picbf.com/**', (route) => route.abort())
    // 示例媒体主机保持挂起：真实请求会失败并触发“无画面自动换线路”，让播放状态不确定。
    const mediaRequests = []
    await page.route('https://cdn.example.org/**', (route) => { mediaRequests.push(route.request().url()) })
    // 直链样例保持挂起：用例只核对控件与版式，不引入真实媒体错误。
    await page.route('https://example.org/**', () => {})
    // 随包已有线路的公开 CDN 同样挂起并记录：断言“已有线路可直接起播、不再等来源页”。
    await page.route(/^https:\/\/(?:[a-z0-9-]+\.)?(?:ddbbffcdn\.com|rrcdnbf6\.com|bfllvip\.com|lzcdn24\.com|lzcdn31\.com|lz-cdn16\.com)\//i,
      (route) => { mediaRequests.push(route.request().url()) })
    await page.addInitScript(() => {
      const items = []
      const history = []
      // 已删除手动直链导入：用持久化种子模拟既有直链作品，刷新后进入本机片库。
      const seededDirect = JSON.parse(window.localStorage.getItem('__seedDirectItems') || '[]')
      window.__seedDirectItem = (title, url) => {
        const saved = JSON.parse(window.localStorage.getItem('__seedDirectItems') || '[]')
        saved.push({ title, url })
        window.localStorage.setItem('__seedDirectItems', JSON.stringify(saved))
      }
      seededDirect.forEach((entry, index) => items.push({ id: 900 + index, title: entry.title, url: entry.url, coverUrl: '', summary: '', favorite: false, updatedAt: Date.now() - index }))
      const seededCatalog = JSON.parse(window.localStorage.getItem('__seedCatalogItems') || '[]')
      seededCatalog.forEach((entry, index) => items.push({ id: 3 + index, title: entry.title, url: entry.url, coverUrl: '', summary: '', favorite: false, updatedAt: Date.now() }))
      window.__seedSourceHistory = (lineId, coverUrl) => history.push({ mediaUrl: 'https://www.yhdmtv.cc/p/123', title: '来源作品', episodeId: 'https://www.yhdmtv.cc/p/124', lineId, episodeTitle: '第2集', coverUrl: coverUrl || '', positionSeconds: 36, durationSeconds: 120, completed: false, updatedAt: Date.now() })
      window.__seedAndroidCatalog = () => {
        window.localStorage.setItem('__seedCatalogItems', JSON.stringify(
          Array.from({ length: 20 }, (_, index) => ({ title: `样例${index}`, url: `https://example.org/${index}.mp4` })),
        ))
      }
      window.__androidCalls = []
    window.__progressPayloads = []
      window.__androidSettings = []
      window.__previewUrls = []
      // 播放器里的关闭入口已全部删除，退出统一走安卓返回键：这里捕获那条回调供测试模拟真机返回。
      window.__androidBackHandlers = []
      window.__fireAndroidBack = () => { const handler = window.__androidBackHandlers.at(-1); if (handler) handler() }
      const methodNames = ['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache']
      const settings = { theme: 'system', autoPlay: false, playbackRate: 1 }
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [
          { name: 'SanyeCatalog', methods: methodNames.map((name) => ({ name, rtype: 'promise' })) },
          { name: 'SanyeSource', methods: ['search', 'preview'].map((name) => ({ name, rtype: 'promise' })) },
          { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }] },
        ],
        // 监听类方法（App.addListener）走 nativeCallback：真实安卓桥会把监听回调交给原生，
        // 这里把回调存下来，测试就能像真机返回键一样触发同一条代码路径。
        nativeCallback: async (plugin, method, options, callback) => {
          window.__androidCalls.push(method)
          if (plugin === 'App' && method === 'addListener') {
            if (options.eventName === 'backButton') window.__androidBackHandlers.push(callback)
            return 'back-1'
          }
          return 'callback-1'
        },
        nativePromise: async (plugin, method, options, callback) => {
          window.__androidCalls.push(method)
          if (plugin === 'App') {
            if (method === 'addListener') {
              if (options.eventName === 'backButton') window.__androidBackHandlers.push(callback)
              return { callbackId: 'back-1', remove: async () => {} }
            }
            return {}
          }
          if (method === 'preview') window.__previewUrls.push(options.sourceUrl)
          if (method === 'search') return { hits: [
            { title: '来源作品', sourceUrl: 'https://www.yhdmtv.cc/p/123', coverUrl: 'https://img.picbf.com/upload/cover.jpg', summary: '樱花动漫在线提供' },
            // 来源标题只差标点时也要命中随包同名封面（封面本身在测试中被拦截）。
            { title: '你的名字。', sourceUrl: 'https://example.com/movie', coverUrl: 'https://img.picbf.com/missing.jpg', summary: '' },
          ] }
          // 随包《你的名字》现在指向可用来源 yhdmtv（生成时按线路可用性挑选）。
          if (method === 'preview' && options.sourceUrl === 'https://www.yhdmtv.cc/p/65395/153/0') return {
            title: '你的名字', sourceUrl: options.sourceUrl, coverUrl: '', summary: '跨越时空的相遇与错过，在黄昏的天空下重新连接。',
            episodes: [
              { id: 'https://yinghuadongman.org.cn/v/52685-2-2/', title: 'HD中字', sourceUrl: 'https://yinghuadongman.org.cn/v/52685-2-2/', playbackUrl: '', mimeType: '', lineId: 'main' },
              { id: 'https://yinghuadongman.org.cn/v/52685-1-1/', title: '正片', sourceUrl: 'https://yinghuadongman.org.cn/v/52685-1-1/', playbackUrl: '', mimeType: '', lineId: 'main' },
              { id: 'https://yinghuadongman.org.cn/v/52685-2-1/', title: 'HD国语', sourceUrl: 'https://yinghuadongman.org.cn/v/52685-2-1/', playbackUrl: '', mimeType: '', lineId: 'main' },
            ],
          }
          // 其他 yhdmtv 候选（随包目录的备用来源）统一给一条中字线路。
          if (method === 'preview' && /yhdmtv\.cc\/(p|v)\//.test(options.sourceUrl)
              && !/\/(p\/123|p\/124)$/.test(options.sourceUrl)
              && options.sourceUrl !== 'https://www.yhdmtv.cc/p/65395/153/4570085') return {
            title: '你的名字', sourceUrl: options.sourceUrl, coverUrl: '', summary: '备用来源',
            episodes: [{ id: 'https://www.yhdmtv.cc/p/65395/153/4570085', title: 'HD中字', sourceUrl: 'https://www.yhdmtv.cc/p/65395/153/4570085', playbackUrl: '', mimeType: '', lineId: 'main' }],
          }
          if (method === 'preview' && options.sourceUrl === 'https://www.yhdmtv.cc/p/65395/153/4570085') return {
            title: '你的名字', sourceUrl: options.sourceUrl, coverUrl: '', summary: '',
            episodes: [{ id: options.sourceUrl, title: 'HD中字', sourceUrl: options.sourceUrl, playbackUrl: 'https://cdn.example.org/subtitle.m3u8', mimeType: 'application/vnd.apple.mpegurl', lineId: 'main' }],
          }
          if (method === 'preview') return options.sourceUrl.endsWith('/p/124')
            ? { title: '来源作品', sourceUrl: options.sourceUrl, coverUrl: '', summary: '', episodes: [
              { id: options.sourceUrl, title: '第2集', sourceUrl: options.sourceUrl, playbackUrl: 'https://cdn.example.org/second.mp4', mimeType: 'video/mp4', lineId: 'main' },
              { id: options.sourceUrl, title: '备用线路', sourceUrl: options.sourceUrl, playbackUrl: 'https://cdn.example.org/alternate.mp4', mimeType: 'video/mp4', lineId: '2' },
            ] }
            : { title: '来源作品', sourceUrl: options.sourceUrl, coverUrl: '', summary: '来源提供的作品简介', episodes: [
              { id: 'current', title: '当前播放页', sourceUrl: options.sourceUrl, playbackUrl: 'https://cdn.example.org/episode.mp4', mimeType: 'video/mp4', lineId: 'main' },
              { id: 'https://www.yhdmtv.cc/p/124', title: '第2集', sourceUrl: 'https://www.yhdmtv.cc/p/124', playbackUrl: '', mimeType: '', lineId: 'main' },
            ] }
          if (method === 'list') return { items: [...items].sort((a, b) => b.updatedAt - a.updatedAt || b.id - a.id) }
          if (method === 'listHistory') {
          // 一次性失败开关：用于验证历史读取失败能在历史页就地重试，且不会去重读片库。
          if (window.localStorage.getItem('__failHistoryOnce') === '1') {
            window.localStorage.removeItem('__failHistoryOnce')
            throw new Error('history unavailable')
          }
          return { items: [...history] }
        }
          if (method === 'recordProgress') { window.__progressPayloads.push({ ...options }); return { item: options } }
          if (method === 'getSettings') return { settings: { ...settings } }
          if (method === 'save') {
            const item = items.find((value) => value.url === options.url)
            if (item) { item.title = options.title; if (options.favorite) item.favorite = true }
            else items.push({ id: items.length + 1, title: options.title, url: options.url, coverUrl: options.coverUrl || '', summary: options.summary || '', favorite: !!options.favorite, updatedAt: Date.now() })
            return { item: item || items.at(-1) }
          }
          if (method === 'setFavorite') {
            const item = items.find((value) => value.id === options.id)
            item.favorite = options.favorite
            return { item }
          }
          if (method === 'setSettings') {
            if (window.__failSettings) throw new Error('settings unavailable')
            Object.assign(settings, options.settings); window.__androidSettings.push({ ...options.settings }); return { settings: { ...settings } }
          }
          return { removed: 0 }
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    assert.equal(await page.title(), '三叶动漫')
    assert.equal(await page.locator('.android-brand strong').textContent(), '三叶动漫')
    // 首页只保留推荐内容：用推荐区块本身确认已进入首页。
    await page.locator('.android-home .android-hero').waitFor()
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-app')).getPropertyValue('--app-bg').trim() === '#081428')
    // 首页主视觉的说明行不能再用 11.5px 小字：贴在亮封面上会糊成一片。
    assert.equal(await page.locator('.android-hero-copy p').evaluate((element) => getComputedStyle(element).fontSize), '12.5px', '首页主视觉说明字号偏小')
    // 随包封面路径留给后面历史封面用例复用（真实存在的资源，不会触发占位图回退）。
    const bundledCover = await page.locator('.android-catalog img').first().getAttribute('src')
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-home.png'), fullPage: true })
    await page.setViewportSize({ width: 360, height: 740 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    assert.equal(await page.getByRole('button', { name: '我的', exact: true }).isVisible(), true)
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-360.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '排期' }).click()
    await page.getByRole('heading', { name: '一周排期' }).waitFor()
    assert.equal(await page.getByText('来源目录记录：21:00').count(), 1)
    await page.locator('.android-top-search').click()
    await page.getByLabel('作品关键词').fill('你的名字')
    // 搜索页只展示外部来源结果：本机片库与随包目录改在「片库」页按关键词筛选。
    assert.equal(await page.getByText('你的名字', { exact: true }).count(), 0)
    // 输入即搜：停止输入 420ms 后自动请求来源，不需要先点按钮。
    await page.waitForFunction(() => window.__androidCalls.includes('search'), null, { timeout: 5000 })
    assert.equal(await page.getByText('来源作品', { exact: true }).count() >= 1, true, '输入即搜没有自动呈现结果')
    await page.getByRole('heading', { name: '在线来源' }).waitFor()
    assert.equal(await page.getByText('由已配置的公开来源提供').count(), 0)
    await page.getByRole('button', { name: '搜索来源' }).click()
    await page.getByText('来源作品', { exact: true }).waitFor()
    // 来源标题只差标点时按归一化标题命中随包封面，不留破图也不显示「暂无封面」。
    const searchCovers = await page.locator('.android-search-source-heading ~ ul li img.android-cover')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src') || ''))
    assert.ok(searchCovers.some((src) => /\/assets\/127-[^/]+\.jpg$/.test(src)), `来源封面缺失时未回退随包同名封面：${searchCovers.join('|')}`)
    await page.getByRole('button', { name: '立即观看' }).first().click()
    await page.locator('.android-player--inline video').waitFor()
    await page.waitForFunction(() => document.querySelector('.android-player--inline video')?.getAttribute('src')?.includes('episode.mp4'))
    await page.getByRole('heading', { name: '选集与线路' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '版本', exact: true }).count(), 0)
    await page.getByRole('button', { name: '返回搜索结果' }).click()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByText('本机还没有保存作品。').waitFor()
    assert.equal(await page.getByText('本机还没有保存作品。').count(), 1)
    // 读取完成前先显示加载占位，不允许先闪一次「本机还没有保存作品」再被数据替换。
    assert.equal(await page.getByText('正在读取本机片库…').count(), 0, '片库读取完成后不应残留加载占位')
    // 历史读取失败必须在历史页可见并能就地重试（此前借用全局 error，而全局按钮只重读片库）。
    // 开关要在切到历史之前设置：进入历史会触发一次 listHistory，这一次要让它失败。
    await page.evaluate(() => window.localStorage.setItem('__failHistoryOnce', '1'))
    await page.getByRole('button', { name: '历史', exact: true }).click()
    const historyRetry = page.locator('.android-page-section').filter({ hasText: '观看历史' }).getByRole('button', { name: '重试读取' })
    await historyRetry.waitFor()
    await historyRetry.click()
    await page.getByRole('button', { name: '历史', exact: true }).click()
    await page.getByText('尚无观看记录。').waitFor()
    assert.equal(await historyRetry.count(), 0, '历史重试成功后不应残留错误条')
    // 已删除手动直链导入：既有直链作品由来源页「保存到本机」产生，这里用种子写入后刷新一次。
    await page.evaluate(() => {
      window.__seedDirectItem('测试作品', 'https://example.org/video.mp4')
      window.__seedDirectItem('HLS 样例', 'https://example.org/master.m3u8')
    })
    await page.reload()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    assert.equal(await page.getByText('测试作品').count(), 1)
    // 搜索页只展示外部来源，本机作品改在「片库」页筛选后播放。
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByLabel('搜索本地作品').fill('测试作品')
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await page.locator('.android-player--inline video').waitFor()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '收藏测试作品' }).click()
    await page.getByRole('button', { name: '收藏', exact: true }).click()
    assert.equal(await page.getByText('测试作品').count(), 1)
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-ui.png'), fullPage: true })
    await page.getByRole('button', { name: '我的', exact: true }).click()
    // 设置页不再承担档位选择（画质/帧率统一在播放器放大后选），也不保留历史与数据下拉。
    await page.getByRole('heading', { name: '我的空间' }).waitFor()
    assert.equal(await page.locator('.android-app select').count(), 0, '「我的」不应再有任何下拉控件')
    await page.getByRole('button', { name: '切换浅色模式' }).click()
    await page.locator('.android-app[data-theme="light"]').waitFor()
    await page.getByRole('button', { name: '首页' }).click()
    assert.equal(await page.locator('.android-nav').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgba(255, 252, 244, 0.96)')
    // 浅色（含跟随系统为浅色）下推荐卡文字必须跟着主题变量走：此前硬编码近白色，
    // 白字压在米色卡面上对比度只有 1.0（用户反馈「首页下面的推荐内容文字是白色的看不清楚」）。
    const catalogContrast = await page.locator('.android-catalog li').first().evaluate((card) => {
      const parse = (value) => { const match = /rgba?\(([^)]+)\)/.exec(value || ''); if (!match) return null; const parts = match[1].split(',').map(Number); return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 } }
      const luminance = (color) => { const channel = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }; return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b) }
      let node = card; let back = null
      while (node && !back) { const color = parse(getComputedStyle(node).backgroundColor); if (color && color.a > 0.5) back = color; node = node.parentElement }
      const fore = parse(getComputedStyle(card.querySelector('strong')).color); const base = back || { r: 13, g: 20, b: 30 }
      const l1 = luminance(fore); const l2 = luminance(base)
      return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100
    })
    assert.ok(catalogContrast >= 4.5, `浅色主题下推荐卡文字对比度不足：${catalogContrast}`)
    // 设置保存失败只在顶栏下提示一次：同一个错误不再到处刷屏（用户要求「出现一次就行了」）。
    await page.evaluate(() => { window.__failSettings = true })
    await page.getByRole('button', { name: '切换深色模式' }).click()
    await page.locator('.android-notice').waitFor()
    await page.getByRole('button', { name: '切换深色模式' }).click()
    await page.waitForTimeout(400)
    assert.equal(await page.locator('.android-notice').count(), 1, '设置保存失败提示重复出现')
    assert.equal(await page.locator('.android-notice').textContent(), '设置保存失败，原有偏好未更改。')
    assert.equal(await page.locator('.android-error').filter({ hasText: '设置保存失败' }).count(), 0, '设置保存失败又占用了全局错误条')
    await page.evaluate(() => { window.__failSettings = false })
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-home-light.png'), fullPage: true })
    await page.getByRole('button', { name: '切换深色模式' }).click()
    await page.locator('.android-app[data-theme="dark"]').waitFor()
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByRole('button', { name: '首页' }).click()
    // 手动直链观看已删除：从片库播放已保存的直链作品来验证控件显隐时序。
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByLabel('搜索本地作品').fill('测试作品')
    await page.getByRole('button', { name: '播放', exact: true }).click()
    assert.equal(await page.locator('video').count(), 1)
    // 播放器卡必须与列表卡共用同一套卡面：同圆角、同渐变卡底，画面不再是纯黑直角块。
    const playerFit = await page.evaluate(() => {
      const cardStyle = getComputedStyle(document.querySelector('.android-player--inline'))
      const stageStyle = getComputedStyle(document.querySelector('.android-player--inline .android-player-stage'))
      return {
        radius: `${cardStyle.borderTopLeftRadius} ${cardStyle.borderTopRightRadius}`,
        surface: cardStyle.backgroundImage,
        stageRadius: stageStyle.borderTopLeftRadius,
        stageBackground: stageStyle.backgroundColor,
      }
    })
    assert.equal(playerFit.radius, '12px 18px', `播放器卡圆角未与列表卡统一：${JSON.stringify(playerFit)}`)
    assert.match(playerFit.surface, /^linear-gradient/, `播放器卡仍是实心底色：${JSON.stringify(playerFit)}`)
    // 画面与卡片只保留一层边框：画面铺满卡片宽度、自身不再重复圆角与描边，
    // 否则「卡圆角 + 描边 + 画面圆角」三层嵌套看起来就是一个套娃。
    assert.equal(playerFit.stageRadius, '0px', `画面重复了第二层圆角：${JSON.stringify(playerFit)}`)
    assert.notEqual(playerFit.stageBackground, 'rgb(0, 0, 0)', `画面黑位仍是纯黑：${JSON.stringify(playerFit)}`)
    // 内嵌播放器不再重复详情卡的作品标题；竖屏画面右上角不再有挡画面的 ✕（关闭走页面返回）。
    assert.equal(await page.locator('.android-player--inline .android-section-title').count(), 0, '内嵌播放器重复渲染了作品标题')
    // 播放器不再提供任何关闭入口（画面、标题行、观看页标题都没有），退出只走安卓返回键。
    assert.equal(await page.locator('.android-player-close, .android-player-exit, .android-player-collapse').count(), 0, '播放器仍在渲染关闭入口')
    const playerTaps = await page.evaluate(() => ({
      play: Math.round(document.querySelector('.android-player-play').getBoundingClientRect().height),
      stage: Math.round(document.querySelector('.android-player-stage').getBoundingClientRect().width),
      player: Math.round(document.querySelector('.android-player').getBoundingClientRect().width),
    }))
    assert.ok(playerTaps.play >= 44, `播放按钮触控偏小：${JSON.stringify(playerTaps)}`)
    assert.ok(playerTaps.stage >= playerTaps.player - 2, `画面没有铺满播放器宽度：${JSON.stringify(playerTaps)}`)
    // 进度条排在按钮行下面：此前它被控件条顶在按钮上方，竖屏单手够不着。
    assert.equal(await page.locator('.android-player-controls > .android-player-seek').evaluate((element) => getComputedStyle(element).order), '2', '进度条没有压到控件行下面')
    assert.equal(await page.locator('video').getAttribute('controls'), null)
    await page.getByRole('button', { name: '开始播放' }).waitFor()
    assert.equal(await page.getByRole('slider', { name: '播放进度' }).getAttribute('aria-disabled'), 'true')
    assert.equal(await page.locator('.android-player-big-play').count(), 1)
    // 触控高度必须明显大于视觉轨道，否则手机上几乎点不中、拖不动。
    assert.equal(await page.getByRole('slider', { name: '播放进度' }).evaluate((element) => getComputedStyle(element).height), '28px')
    // 档位选择统一放在放大后的浮层里（用户要求「我要的是全屏状态下在那选」）：
    // 竖屏保留播放、进度、时间、下一集、选集、音量与放大，画质/帧率仍进放大后使用（VQ-61）。
    const compactControls = page.locator('.android-player-controls')
    assert.equal(await compactControls.getByRole('button', { name: '开始播放' }).isVisible(), true)
    assert.equal(await compactControls.getByRole('button', { name: '横屏放大' }).isVisible(), true)
    assert.equal(await compactControls.getByRole('button', { name: '画质' }).isVisible(), false)
    assert.equal(await compactControls.getByRole('button', { name: '帧率' }).isVisible(), false)
    // 竖屏必须能换集与静音：此前整组 --more 都被隐藏，换集只能先进横屏（VQ-61）。
    assert.equal(await compactControls.getByRole('button', { name: '选集' }).isVisible(), true)
    assert.equal(await compactControls.getByRole('button', { name: '音量' }).isVisible(), true)
    // 点画面切换控制条显隐：再点一次恢复；播放中 3.2 秒后自动隐藏，暂停后保持可见。
    const controlsOpacity = () => page.evaluate(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity)
    await page.locator('.android-player-stage').click({ position: { x: 18, y: 18 } })
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity === '0')
    await page.locator('.android-player-stage').click({ position: { x: 18, y: 18 } })
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity === '1')
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('play')))
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity === '0', null, { timeout: 6000 })
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('pause')))
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity === '1')
    assert.equal(await controlsOpacity(), '1')
    await page.setViewportSize({ width: 844, height: 390 })
    await page.getByRole('button', { name: '横屏放大' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor()
    const controls = page.locator('.android-player-stage:fullscreen .android-player-controls')
    assert.equal(await controls.getByRole('button', { name: '选集' }).isVisible(), true)
    assert.equal(await controls.getByRole('button', { name: '帧率' }).isVisible(), true)
    assert.equal(await controls.getByRole('button', { name: '画质' }).isVisible(), true)
    // 命中区不得小于 36px，且浮层入口要声明弹出的语义。
    const toolBoxes = await controls.locator('.android-player-tool').evaluateAll((elements) => elements.map((element) => ({
      height: element.getBoundingClientRect().height, haspopup: element.getAttribute('aria-haspopup'),
    })))
    assert.equal(toolBoxes.every((box) => box.height >= 36), true, JSON.stringify(toolBoxes))
    // 控件宽度不得跟着自己的文字走：标签在「帧率／自动帧率／120 FPS」间切换时按钮必须仍等宽同位。
    const toolWidths = await controls.locator('.android-player-tool').evaluateAll((elements) =>
      elements.map((element) => ({ text: element.textContent.trim(), width: Math.round(element.getBoundingClientRect().width * 10) / 10 })))
    assert.equal(new Set(toolWidths.map((tool) => tool.width)).size, 1, `控件行按钮宽度不一致：${JSON.stringify(toolWidths)}`)
    const rowBeforeTier = await controls.locator('.android-player-tool').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().x)))
    await controls.getByRole('button', { name: '帧率' }).click()
    await page.locator('.android-player-menu .android-player-list-item').filter({ hasText: /^120$/ }).first().click()
    await page.waitForTimeout(200)
    const rowAfterTier = await controls.locator('.android-player-tool').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().x)))
    assert.deepEqual(rowAfterTier, rowBeforeTier, `切换帧率档后控件位置发生位移：${JSON.stringify({ rowBeforeTier, rowAfterTier })}`)
    // 还原成原始档（按钮标签回到「帧率」），后面的断言仍按标签定位入口。
    await closePlayerMenu(page)
    await controls.locator('.android-player-tool').filter({ hasText: '120 FPS' }).click()
    await page.locator('.android-player-menu .android-player-list-item').filter({ hasText: '原始' }).first().click()
    await page.waitForTimeout(150)
    assert.equal(await controls.getByRole('button', { name: '帧率' }).count(), 1, '还原原始档后标签没有回到「帧率」')
    await closePlayerMenu(page)
    assert.equal(await controls.getByRole('button', { name: '画质' }).getAttribute('aria-haspopup'), 'dialog')
    // 放大态必须是纯黑底：视频宽高比与屏幕不一致时，两侧露出的应该是黑边而不是页面/系统底色
    // （用户反馈「全屏之后视频画面没有占满屏幕旁边还有白色的」）。
    assert.equal(await page.locator('.android-player-stage:fullscreen').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(0, 0, 0)', '放大态画面底色不是纯黑')
    // 用户反馈「全屏之后画面会出现缺失」：实测 cover 会把 16:9 片源在 844×390 上上下各切掉约 8.7%，
    // 画面主体（视频与补帧画布）在放大态必须完整显示，铺底靠黑色背景而不是裁切。
    assert.equal(await page.locator('.android-player-stage:fullscreen video').evaluate((element) => getComputedStyle(element).objectFit), 'contain', '放大态视频被裁掉了画面')
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)', '放大态页面底色不是纯黑')
    // 增强档位的唯一入口就是这里（放大后的浮层）：画质能给关闭/性能/均衡，帧率能给原始/自动/60，
    // 选中后按钮文案直接变成档位名，并写进设置供下次起播恢复。
    await controls.getByRole('button', { name: '画质' }).click()
    const qualityMenu = page.locator('.android-player-stage:fullscreen .android-player-menu')
    assert.deepEqual((await qualityMenu.locator('.android-player-list-item').allTextContents()).slice(0, 4), ['关闭', '性能', '均衡', '锐化'], '放大后画质浮层缺少增强档位')
    await qualityMenu.getByRole('button', { name: '均衡' }).click()
    await page.waitForFunction(() => window.__androidCalls.includes('setSettings'))
    assert.equal(await controls.locator('.android-player-controls-row').getByRole('button', { name: '均衡' }).isVisible(), true, '选中档位后按钮没有回写档位名')
    assert.equal(await page.evaluate(() => window.__androidSettings.at(-1).qualityProfile), 'balanced', '画质档没有落盘')
    await controls.getByRole('button', { name: '帧率' }).click()
    const fpsMenu = page.locator('.android-player-stage:fullscreen .android-player-menu')
    assert.deepEqual((await fpsMenu.locator('.android-player-list-item').allTextContents()).slice(0, 3), ['原始', '自动', '60'], '放大后帧率浮层缺少增强档位')
    // 用户澄清：列表收到「帧率」两个字的宽度，档位文案只用纯档位名，不带 FPS 后缀。
    assert.ok(Math.abs((await fpsMenu.boundingBox()).width - (await controls.locator('.android-player-tool').filter({ hasText: '帧率' }).boundingBox()).width) <= 1, '帧率列表没有与触发按钮等宽')
    assert.equal(await fpsMenu.getByText(/FPS/).count(), 0, '帧率浮层不应再出现 FPS 后缀')
    // 帧率梯级要列全且全部可选（用户反馈「还是只有两档」，并要求不要提示本机帧率）。
    const fpsLadder = await fpsMenu.locator('.android-player-list-item').allTextContents()
    for (const fps of ['90', '120']) assert.ok(fpsLadder.some((text) => text === fps), `帧率梯级缺少 ${fps}：${JSON.stringify(fpsLadder)}`)
    assert.equal(await fpsMenu.locator('.android-player-list-item[disabled]').count(), 0, '补帧就是用来提帧率的，档位不应按屏幕刷新率禁用')
    assert.equal(await fpsMenu.locator('.android-player-list-item em').count(), 0, '帧率档不应再提示本机上限')
    // 数值档位必须按字符串落盘：以前把数字 60 直接发给原生，原生只收字符串会整条拒绝，
    // 表现就是「设置保存失败」而且档位永远存不下来。
    await fpsMenu.locator('.android-player-list-group').first().getByRole('button', { name: '60', exact: true }).click()
    await page.waitForFunction(() => window.__androidSettings.at(-1)?.frameTarget === '60')
    assert.equal(await controls.locator('.android-player-controls-row').getByRole('button', { name: '60 FPS' }).isVisible(), true, '选中帧率档后按钮没有回写档位名')
    assert.equal(await page.evaluate(() => typeof window.__androidSettings.at(-1).frameTarget), 'string', '帧率档没有按字符串落盘')
    // 增强失败只提示一次、且保留用户档位：不再退回「画质」让人以为优化没了。
    await page.waitForTimeout(700)
    assert.equal(await controls.locator('.android-player-controls-row').getByRole('button', { name: '均衡' }).isVisible(), true, '增强失败把用户选的画质档清掉了')
    assert.equal(await page.locator('.android-player-stage:fullscreen .android-notice, .android-player-menu p[role="alert"]').count(), 0, '增强失败提示又塞回了播放器菜单')
    // 复位到关闭，后续断言仍能按「画质」「帧率」两个名字找到入口。
    const rowTools = controls.locator('.android-player-controls-row')
    await closePlayerMenu(page)
    await rowTools.getByRole('button', { name: '均衡' }).click()
    await page.locator('.android-player-menu').getByRole('button', { name: '关闭' }).click()
    await closePlayerMenu(page)
    await rowTools.getByRole('button', { name: '60 FPS' }).click()
    await page.locator('.android-player-menu').getByRole('button', { name: '原始' }).click()
    await closePlayerMenu(page)
    assert.equal(await rowTools.getByRole('button', { name: '画质' }).isVisible(), true, '复位后画质入口没有回到默认文案')
    assert.equal(await rowTools.getByRole('button', { name: '帧率' }).isVisible(), true, '复位后帧率入口没有回到默认文案')
    // 音量是可拖动的竖条：拖到中间约为 50%，拖到底部为静音。
    assert.equal(await page.getByRole('slider', { name: '音量' }).count(), 0)
    await controls.getByRole('button', { name: '音量' }).click()
    const volumeBar = page.getByRole('slider', { name: '音量' })
    const volumeBox = await volumeBar.boundingBox()
    await page.mouse.move(volumeBox.x + volumeBox.width / 2, volumeBox.y + volumeBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(volumeBox.x + volumeBox.width / 2, volumeBox.y + volumeBox.height - 1, { steps: 4 })
    await page.mouse.up()
    assert.equal(await page.locator('video').evaluate((element) => element.muted), true)
    await page.mouse.move(volumeBox.x + volumeBox.width / 2, volumeBox.y + volumeBox.height - 1)
    await page.mouse.down()
    await page.mouse.move(volumeBox.x + volumeBox.width / 2, volumeBox.y + volumeBox.height * 0.5, { steps: 6 })
    await page.mouse.up()
    const volumeAfterDrag = await page.locator('video').evaluate((element) => Math.round(element.volume * 100))
    assert.ok(Math.abs(volumeAfterDrag - 50) <= 6, String(volumeAfterDrag))
    await closePlayerMenu(page)
    // 画质浮层为最简竖排列表：一行一项，无卡片底板，当前项高亮。
    const qualityTrigger = controls.getByRole('button', { name: '画质' })
    await qualityTrigger.click()
    await page.locator('.android-player-menu').waitFor()
    const balancedOption = page.locator('.android-player-menu').getByRole('button', { name: '均衡' })
    assert.equal(await balancedOption.count(), 1)
    // 安卓档位（用户反馈「还是只有两档」后开放锐化）：性能/均衡/锐化三档，
    // 超分 2×（4 倍着色像素量）与纯画质路径同链路的「修复」仍然不进菜单。
    assert.equal(await page.locator('.android-player-menu').getByRole('button', { name: '性能' }).count(), 1)
    assert.equal(await page.locator('.android-player-menu').getByRole('button', { name: '锐化' }).count(), 1)
    assert.equal(await page.locator('.android-player-menu').getByRole('button', { name: '超分 2×' }).count(), 0)
    assert.equal(await page.locator('.android-player-menu').getByRole('button', { name: '修复' }).count(), 0)
    assert.equal(await balancedOption.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)')
    // 未选中项只靠分隔线分列，没有卡片描边。
    assert.equal(await balancedOption.evaluate((element) => getComputedStyle(element).borderTopWidth), '0px')
    assert.equal(await balancedOption.evaluate((element) => getComputedStyle(element).borderLeftWidth), '0px')
    assert.equal(await page.locator('.android-player-menu').getAttribute('role'), 'dialog')
    // 没有任何标题栏、“完成”按钮或分组说明文字，矩形只装选项本身。
    assert.equal(await page.locator('.android-player-menu-head').count(), 0)
    assert.equal(await page.locator('.android-player-menu strong, .android-player-menu h4, .android-player-list-group > span').count(), 0)
    // 当前项只用高亮表示，没有勾选列，避免文字对不齐。
    assert.equal(await page.locator('.android-player-menu .android-player-list-item i').count(), 0)
    const pressedOption = page.locator('.android-player-menu .android-player-list-item[aria-pressed="true"]')
    assert.equal(await pressedOption.count(), 1)
    assert.equal(await pressedOption.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgba(234, 242, 196, 0.22)')
    // 宽度统一（用户反馈「宽度始终和文字一样」）：组内每一行等宽，不再由文字长短决定；
    // 选中高亮铺满整行，这样「关闭」与「锐化」才是同一套列表。
    const optionWidths = await page.locator('.android-player-menu .android-player-list-item').evaluateAll((elements) =>
      elements.map((element) => ({ text: element.textContent.trim(), width: Math.round(element.getBoundingClientRect().width * 10) / 10 })))
    assert.ok(optionWidths.length >= 4, JSON.stringify(optionWidths))
    assert.equal(new Set(optionWidths.map((option) => option.width)).size, 1, `浮层行宽不统一：${JSON.stringify(optionWidths)}`)
    assert.equal(await pressedOption.evaluate((element) => element.getBoundingClientRect().width), optionWidths[0].width, '选中高亮没有铺满整行')
    // 浮层贴在触发按钮上方，宽度就是触发按钮那两个字的宽度（用户澄清「我说的不是按钮是
    // 点击按钮之后的列表」），既不跟着最长文字变，也不至于把按钮行撑开。
    const menuBox = await page.locator('.android-player-menu').boundingBox()
    const controlsBox = await controls.boundingBox()
    const seekBarBox = await page.locator('.android-player-seek').boundingBox()
    const triggerBox = await qualityTrigger.boundingBox()
    const menuBottom = menuBox.y + menuBox.height
    // 列表与触发按钮等宽（用户口径「等宽就好」），既不贴着文字变窄，也不被最长文字撑开。
    assert.ok(Math.abs(menuBox.width - triggerBox.width) <= 1, `列表没有与触发按钮等宽：${JSON.stringify({ menu: menuBox.width, trigger: triggerBox.width })}`)
    assert.ok(menuBox.height <= 210, JSON.stringify(menuBox))
    // 列表尺寸是锁定决策（用户口径「列表的大小的决策永远不要变」）：换选中项之后，浮层盒子与每一行的
    // 宽度必须逐项一致，列表文案也只能是纯挡位名——不允许出现「已降到/生效」这类后缀把列表撑变形。
    const optionWidthsBefore = await page.locator('.android-player-menu .android-player-list-item').evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().width * 10) / 10))
    const menuBoxBefore = await page.locator('.android-player-menu').boundingBox()
    await page.locator('.android-player-menu .android-player-list-item').filter({ hasText: /^锐化$/ }).first().click()
    await page.waitForTimeout(250)
    // 选中档位后触发按钮的文案会变成档位名，不能再按「画质」两个字定位；浮层也可能还开着，开了就不要点关。
    if (!await page.locator('.android-player-menu').count()) {
      await controls.locator('.android-player-tool--more').filter({ hasText: '锐化' }).first().click()
      await page.locator('.android-player-menu').waitFor()
    }
    await page.waitForTimeout(200)
    const optionWidthsAfter = await page.locator('.android-player-menu .android-player-list-item').evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().width * 10) / 10))
    const menuBoxAfter = await page.locator('.android-player-menu').boundingBox()
    assert.deepEqual(optionWidthsAfter, optionWidthsBefore, `换选中项后浮层行宽变化：${JSON.stringify({ optionWidthsBefore, optionWidthsAfter })}`)
    const sameMenuBox = Math.abs(menuBoxAfter.width - menuBoxBefore.width) <= 0.5
      && Math.abs(menuBoxAfter.height - menuBoxBefore.height) <= 0.5
      && Math.abs(menuBoxAfter.x - menuBoxBefore.x) <= 0.5
      && Math.abs(menuBoxAfter.y - menuBoxBefore.y) <= 0.5
    assert.equal(sameMenuBox, true, `换选中项后浮层盒子变化：${JSON.stringify({ menuBoxBefore, menuBoxAfter })}`)
    assert.deepEqual((await page.locator('.android-player-menu .android-player-list-item').allTextContents()).slice(0, 4),
      ['关闭', '性能', '均衡', '锐化'], '列表文案必须只有纯挡位名，不能加降级/生效后缀')
    // 高亮落在实时生效的挡位：本环境没有降级，生效档就等于刚选中的档。
    const pressedAfterSwitch = page.locator('.android-player-menu .android-player-list-item[aria-pressed="true"]')
    assert.equal(await pressedAfterSwitch.count(), 1, '列表必须恰好高亮一个实时挡位')
    assert.equal((await pressedAfterSwitch.textContent()).trim(), '锐化', '高亮没有落在刚生效的挡位上')
    // 复位到关闭：后续断言仍要按「画质」两个字定位入口。
    await page.locator('.android-player-menu .android-player-list-item').filter({ hasText: /^关闭$/ }).first().click()
    await page.waitForTimeout(200)
    // 浮层向上展开、贴在触发按钮上方（进度条已移到按钮行下面，不再以进度条为上沿参照）。
    assert.ok(menuBottom <= triggerBox.y + 10, `浮层没有向上展开：${JSON.stringify({ menuBox, triggerBox })}`)
    assert.ok(triggerBox.y - menuBottom <= 40, `浮层离触发按钮太远：${JSON.stringify({ menuBox, triggerBox })}`)
    // 进度条必须压在按钮行下面：此前它排在按钮上面，被控件条顶在画面中部。
    assert.ok(seekBarBox.y >= triggerBox.y - 2, `进度条又回到按钮上方：${JSON.stringify({ seekBarBox, triggerBox })}`)
    assert.ok(menuBottom <= controlsBox.y + controlsBox.height - 40, JSON.stringify({ menuBox, controlsBox }))
    // 位置与宽度对齐触发按钮：浮层右缘与「画质」文字的右缘齐平。
    assert.ok(Math.abs((menuBox.x + menuBox.width) - (triggerBox.x + triggerBox.width)) <= 2, JSON.stringify({ menuBox, triggerBox }))
    await closePlayerMenu(page)
    assert.equal(await page.locator('.android-player-menu').count(), 0)
    const placement = await controls.locator('.android-player-tool').last().evaluate((element) => {
      const box = element.getBoundingClientRect()
      const video = element.closest('.android-player-stage').querySelector('video').getBoundingClientRect()
      return { right: innerWidth - box.right, bottom: innerHeight - box.bottom, videoBottom: video.bottom, insideVideo: box.bottom <= video.bottom && box.right <= video.right }
    })
    assert.ok(placement.right < 50 && placement.bottom < 100 && placement.insideVideo && placement.videoBottom >= 389, JSON.stringify(placement))
    // 帧率梯级全列且全部可选：补帧与插帧的职责就是提帧率，档位不再按屏幕刷新率过滤，
    // 也不再出现「本机上限」提示（用户明确要求）。
    await controls.getByRole('button', { name: '帧率' }).click()
    await page.locator('.android-player-menu').waitFor()
    const listedTargets = (await page.locator('.android-player-menu .android-player-list-item').allTextContents())
      .map((text) => Number((/^(\d+)$/.exec(text.trim()) ?? [])[1]))
      .filter((value) => Number.isFinite(value))
    assert.deepEqual(listedTargets, [60, 90, 120, 144, 165, 240], JSON.stringify(listedTargets))
    assert.equal(await page.locator('.android-player-menu .android-player-list-item[disabled]').count(), 0, '帧率档不应被禁用')
    assert.equal(await page.locator('.android-player-menu').getByText(/本机上限/).count(), 0, '不应再提示本机帧率')
    await closePlayerMenu(page)
    await controls.getByRole('button', { name: '选集' }).click()
    // 片库直链作品的选集里只有这条直链本身，既不出现来源线路，也不再是空态。
    assert.equal(await page.locator('.android-player-menu').getByText('当前媒体没有来源选集').count(), 0)
    const directEpisodes = page.locator('.android-player-menu .android-player-menu-group button')
    await directEpisodes.first().waitFor()
    assert.equal(await directEpisodes.count(), 1)
    await closePlayerMenu(page)
    assert.equal(await page.locator('.android-player-menu').count(), 0)
    // 浮层展开时点画面任意位置都要一次收起：点控制条空白处同理，且两种点法都保持控制条可见，
    // 必须再点一次画面才收控制条（不需要连点触发按钮两次）。
    await controls.getByRole('button', { name: '帧率' }).click()
    await page.locator('.android-player-menu').waitFor()
    const spacerBox = await page.locator('.android-player-stage .android-player-spacer').boundingBox()
    await page.mouse.click(spacerBox.x + spacerBox.width / 2, spacerBox.y + spacerBox.height / 2)
    await page.locator('.android-player-menu').waitFor({ state: 'detached' })
    assert.equal(await controlsOpacity(), '1')
    await controls.getByRole('button', { name: '画质' }).click()
    await page.locator('.android-player-menu').waitFor()
    await closePlayerMenu(page)
    assert.equal(await controlsOpacity(), '1')
    await page.locator('.android-player-stage').click({ position: { x: 18, y: 18 } })
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity === '0')
    await page.locator('.android-player-stage').click({ position: { x: 18, y: 18 } })
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.android-player-controls')).opacity === '1')
    // 画面手势不看控制条：左半屏上下滑动调亮度，右半屏上下滑动调音量
    //（横向滑动调进度需要媒体已有时长，见下文 HLS 段落）。
    const gestureStage = await page.locator('.android-player-stage').boundingBox()
    const dimBeforeSwipe = await page.locator('.android-player-dim').evaluate((element) => Number(getComputedStyle(element).opacity))
    // 左半屏下滑变暗（初始亮度已经是最大，上滑没有变化空间）。
    await page.mouse.move(gestureStage.x + gestureStage.width * 0.25, gestureStage.y + gestureStage.height * 0.25)
    await page.mouse.down()
    await page.mouse.move(gestureStage.x + gestureStage.width * 0.25, gestureStage.y + gestureStage.height * 0.7, { steps: 8 })
    // 用户澄清「我说的是中间的进度提示不是音量与亮度」：调亮度必须显示亮度提示。
    await assertGestureHint(page, 'brightness', '调亮度')
    await page.mouse.up()
    const dimAfterSwipe = await page.locator('.android-player-dim').evaluate((element) => Number(getComputedStyle(element).opacity))
    assert.ok(dimAfterSwipe > dimBeforeSwipe, `左半屏下滑应变暗：${dimBeforeSwipe} -> ${dimAfterSwipe}`)
    // 同一区域上滑恢复亮度：证明上下手势按左半屏归属亮度。
    await page.mouse.move(gestureStage.x + gestureStage.width * 0.25, gestureStage.y + gestureStage.height * 0.7)
    await page.mouse.down()
    await page.mouse.move(gestureStage.x + gestureStage.width * 0.25, gestureStage.y + gestureStage.height * 0.25, { steps: 8 })
    await page.mouse.up()
    const dimAfterUp = await page.locator('.android-player-dim').evaluate((element) => Number(getComputedStyle(element).opacity))
    assert.ok(dimAfterUp < dimAfterSwipe, `左半屏上滑应变亮：${dimAfterSwipe} -> ${dimAfterUp}`)
    // 滑动被识别后浏览器补发的那次点击要被忽略，否则滑完会把控制条一起收掉。
    assert.equal(await controlsOpacity(), '1')
    const volumeBeforeGesture = await page.locator('video').evaluate((element) => element.volume)
    // 右半屏上滑：音量按屏幕高度比例增长。
    await page.mouse.move(gestureStage.x + gestureStage.width * 0.75, gestureStage.y + gestureStage.height * 0.55)
    await page.mouse.down()
    await page.mouse.move(gestureStage.x + gestureStage.width * 0.75, gestureStage.y + gestureStage.height * 0.15, { steps: 8 })
    // 音量手势同样保留提示。
    await assertGestureHint(page, 'volume', '调音量')
    await page.mouse.up()
    const volumeAfterGesture = await page.locator('video').evaluate((element) => ({ volume: element.volume, muted: element.muted }))
    assert.equal(volumeAfterGesture.muted, false)
    assert.ok(volumeAfterGesture.volume >= volumeBeforeGesture + 0.3, JSON.stringify({ volumeBeforeGesture, volumeAfterGesture }))
    // 放大后补帧画布与视频同一口径：完整显示画面，不用裁切换铺满。
    const expandedFit = await page.evaluate(() => {
      const stage = document.querySelector('.android-player-stage')
      const canvas = document.createElement('canvas')
      canvas.className = 'realtime-interpolation-canvas'
      const poster = document.createElement('img')
      poster.className = 'android-player-poster'
      stage.append(canvas, poster)
      const fit = { canvas: getComputedStyle(canvas).objectFit, poster: getComputedStyle(poster).objectFit }
      canvas.remove()
      poster.remove()
      return fit
    })
    assert.deepEqual(expandedFit, { canvas: 'contain', poster: 'cover' })
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-player-landscape.png') })
    await page.getByRole('button', { name: '退出横屏' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.android-player-stage--expanded').count(), 0)
    await page.locator('.android-player-stage').evaluate((stage) => { stage.requestFullscreen = () => Promise.reject(new Error('WebView 不支持')) })
    await page.getByRole('button', { name: '横屏放大' }).click()
    await page.locator('.android-player-stage--expanded').waitFor()
    assert.equal(await page.locator('.android-player-stage--expanded .android-player-controls').isVisible(), true)
    await page.getByRole('button', { name: '退出横屏' }).click()
    assert.equal(await page.locator('.android-player-stage--expanded').count(), 0)
    await page.setViewportSize({ width: 390, height: 844 })
    await exitPlayer(page)
    assert.equal(await page.locator('video').count(), 0)
    assert.equal(await page.evaluate(() => window.__androidCalls.filter((method) => method === 'recordProgress').length), 0)
    await page.route('https://example.org/master.m3u8', (route) => route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/vnd.apple.mpegurl' }, body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,FRAME-RATE=24.000\nhttps://example.org/low.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2200000,RESOLUTION=1280x720,FRAME-RATE=60.000\nhttps://example.org/high.m3u8\n' }))
    await page.route('https://example.org/{low,high}.m3u8', (route) => route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/vnd.apple.mpegurl' }, body: '#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:5,\nhttps://example.org/segment.ts\n#EXT-X-ENDLIST\n' }))
    await page.getByRole('button', { name: '片库', exact: true }).click()
    // 前面的用例把筛选切到了「收藏」，这里恢复「全部」才看得到这条直链样例。
    await page.getByRole('button', { name: '全部', exact: true }).click()
    await page.getByLabel('搜索本地作品').fill('HLS 样例')
    await page.getByRole('button', { name: '播放', exact: true }).click()
    // 进度条在时长已知时可拖动：按住并移动指针，时间显示立即跟随，松手才提交一次定位。
    await page.locator('video').evaluate((element) => { Object.defineProperty(element, 'duration', { value: 100, configurable: true }); element.dispatchEvent(new Event('durationchange')) })
    await page.waitForFunction(() => document.querySelector('.android-player-seek')?.getAttribute('aria-valuemax') === '100')
    const seekBar = page.getByRole('slider', { name: '播放进度' })
    if (await page.locator('.android-player-controls.is-hidden').count()) {
      await page.locator('.android-player-stage').click({ position: { x: 18, y: 18 } })
      await page.waitForFunction(() => !document.querySelector('.android-player-controls').classList.contains('is-hidden'))
    }
    const seekBox = await seekBar.boundingBox()
    await page.mouse.move(seekBox.x + seekBox.width * 0.2, seekBox.y + seekBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(seekBox.x + seekBox.width * 0.5, seekBox.y + seekBox.height / 2, { steps: 4 })
    assert.equal(await seekBar.evaluate((element) => element.classList.contains('is-dragging')), true)
    assert.match(await page.locator('.android-player-time').innerText(), /00:(4[7-9]|5[0-3])/)
    // 进度提示按用户要求删除：拖动进度条期间既不能有提示条，也不能有画中画预览。
    await assertNoSeekOverlay(page, '拖动进度条')
    await page.mouse.up()
    await assertNoSeekOverlay(page, '松开进度条')
    // 抬手后 700ms 收起：延迟窗口内不得残留。
    await page.waitForTimeout(900)
    await assertNoSeekOverlay(page, '松开进度条之后')
    const committed = await seekBar.evaluate((element) => ({ now: Number(element.getAttribute('aria-valuenow')), dragging: element.classList.contains('is-dragging') }))
    assert.equal(committed.dragging, false)
    assert.ok(Math.abs(committed.now - 50) <= 2, JSON.stringify(committed))
    // 排版：进度条命中区不得再塞进按钮行底下（此前用负上边距重叠 4px，点按钮会被进度条抢走），
    // 同时视觉轨道与按钮行的距离要收在 6–18px，不能像用户反馈那样「分隔太远」。
    const controlsSpacing = await page.evaluate(() => {
      const row = document.querySelector('.android-player-controls-row').getBoundingClientRect()
      const seek = document.querySelector('.android-player-seek').getBoundingClientRect()
      const track = document.querySelector('.android-player-seek-track').getBoundingClientRect()
      return { overlap: Math.round((seek.top - row.bottom) * 10) / 10, trackGap: Math.round((track.top + track.height / 2 - row.bottom) * 10) / 10 }
    })
    assert.ok(controlsSpacing.overlap >= 0, `进度条命中区压住了按钮行：${JSON.stringify(controlsSpacing)}`)
    assert.ok(controlsSpacing.trackGap >= 3 && controlsSpacing.trackGap <= 12, `进度条离按钮行过远或过近：${JSON.stringify(controlsSpacing)}`)
    // 进度负载必须落在原生校验范围内：公网 https 地址、标题不超长、位置与时长有限。
    // 此前来源播放页地址带查询参数会被原生按「直链媒体」整条拒掉，用户看到「播放进度保存失败」。
    await page.locator('video').evaluate((element) => {
      try { Object.defineProperty(element, 'currentTime', { value: 42, configurable: true }) } catch {}
      element.dispatchEvent(new Event('pause'))
    })
    await page.waitForFunction(() => (window.__progressPayloads || []).length > 0)
    const progressPayload = await page.evaluate(() => window.__progressPayloads.at(-1))
    assert.match(progressPayload.mediaUrl, /^https:\/\/[^\s]+$/i, `进度记录地址不是公网 https：${progressPayload.mediaUrl}`)
    assert.ok(progressPayload.title.length > 0 && progressPayload.title.length <= 120, `进度记录标题长度越界：${progressPayload.title.length}`)
    assert.ok(Number.isFinite(progressPayload.positionSeconds) && progressPayload.positionSeconds >= 0, '进度记录位置不是有限非负数')
    assert.ok(Number.isFinite(progressPayload.durationSeconds) && progressPayload.durationSeconds >= 0, '进度记录时长不是有限非负数')
    // 横向滑动画面同样改变进度（此时媒体已有时长）：右滑前进、左滑回退，并显示时间提示。
    const gestureSeekBefore = Number(await seekBar.getAttribute('aria-valuenow'))
    const gestureSeekStage = await page.locator('.android-player-stage').boundingBox()
    const gestureSeekY = gestureSeekStage.y + gestureSeekStage.height * 0.3
    await page.mouse.move(gestureSeekStage.x + gestureSeekStage.width * 0.5, gestureSeekY)
    await page.mouse.down()
    await page.mouse.move(gestureSeekStage.x + gestureSeekStage.width * 0.5 + 30, gestureSeekY, { steps: 6 })
    const seekGestureForward = Number(await seekBar.getAttribute('aria-valuenow'))
    await page.mouse.move(gestureSeekStage.x + gestureSeekStage.width * 0.5 - 120, gestureSeekY, { steps: 6 })
    const seekGestureBack = Number(await seekBar.getAttribute('aria-valuenow'))
    // 横滑定位属于进度手势：全程不得出现任何提示条。
    await assertNoSeekOverlay(page, '横滑定位')
    await page.mouse.up()
    assert.ok(seekGestureForward > gestureSeekBefore,
      `右滑应前进：${gestureSeekBefore} -> ${seekGestureForward}`)
    assert.ok(seekGestureBack < seekGestureForward,
      `左滑应回退：${seekGestureForward} -> ${seekGestureBack}`)
    assert.equal(await seekBar.evaluate((element) => element.classList.contains('is-dragging')), false)
    const stageBox2 = await page.locator('.android-player-stage').boundingBox()
    await page.mouse.move(stageBox2.x + stageBox2.width * 0.5, stageBox2.y + stageBox2.height * 0.35)
    await page.mouse.down()
    await page.mouse.move(stageBox2.x + stageBox2.width * 0.5 - 30, stageBox2.y + stageBox2.height * 0.35, { steps: 6 })
    await page.mouse.up()
    const afterBackSwipe = Number(await seekBar.getAttribute('aria-valuenow'))
    assert.ok(afterBackSwipe < committed.now, `左滑应回退进度：${committed.now} -> ${afterBackSwipe}`)
    assert.equal(await seekBar.evaluate((element) => element.classList.contains('is-dragging')), false)
    // 鼠标拖动可能被合成成一次点击而收起控制条，这里恢复可见再继续后续拖动断言。
    if (await page.locator('.android-player-controls.is-hidden').count()) {
      await page.locator('.android-player-stage').click({ position: { x: 18, y: 18 } })
      await page.waitForFunction(() => !document.querySelector('.android-player-controls').classList.contains('is-hidden'))
    }
    // 播完后再定位必须撤掉结束遮罩，否则画面会被“本集播放结束”一直压住。
    await page.locator('video').evaluate((element) => element.dispatchEvent(new Event('ended')))
    await page.locator('.android-player-ended').waitFor()
    const endedBox = await seekBar.boundingBox()
    await page.mouse.move(endedBox.x + endedBox.width * 0.4, endedBox.y + endedBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(endedBox.x + endedBox.width * 0.3, endedBox.y + endedBox.height / 2, { steps: 2 })
    await page.mouse.up()
    assert.equal(await page.locator('.android-player-ended').count(), 0)
    await page.getByRole('button', { name: '横屏放大' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor()
    await page.locator('.android-player-controls').getByRole('button', { name: '画质' }).click()
    await page.locator('.android-player-menu').getByRole('button', { name: /720P/ }).click()
    await closePlayerMenu(page)
    await page.locator('.android-player-controls').getByRole('button', { name: '帧率' }).click()
    await page.locator('.android-player-menu').getByRole('button', { name: '24', exact: true }).click()
    await closePlayerMenu(page)
    assert.equal(await page.locator('.android-player-controls').getByRole('button', { name: '24 FPS…' }).count(), 1)
    assert.equal(await page.locator('.android-player-controls').getByRole('button', { name: '360P…' }).count(), 1)
    await page.locator('.android-player-controls').getByRole('button', { name: '360P…' }).click()
    assert.equal(await page.locator('.android-player-menu').getByRole('button', { name: /360P/ }).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.android-player-menu').getByRole('button', { name: '自动' }).count(), 1)
    await page.locator('.android-player-menu').getByRole('button', { name: /720P/ }).click()
    await closePlayerMenu(page)
    assert.equal(await page.locator('.android-player-controls').getByRole('button', { name: '60 FPS…' }).count(), 1)
    await page.locator('.android-player-controls').getByRole('button', { name: '60 FPS…' }).click()
    await page.locator('.android-player-menu').getByRole('button', { name: '24', exact: true }).click()
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-player-quality.png') })
    await closePlayerMenu(page)
    await page.getByRole('button', { name: '退出横屏' }).click()
    await exitPlayer(page)
    await page.locator('.android-top-search').click()
    await page.getByLabel('作品关键词').fill('来源作品')
    await page.getByRole('button', { name: '搜索来源' }).click()
    await page.getByRole('heading', { name: '在线来源' }).waitFor()
    // 搜索成功后预热第一条来源详情，用户点“立即观看”时直接命中缓存，不再等一次详情往返。
    await page.waitForFunction(() => window.__previewUrls.includes('https://www.yhdmtv.cc/p/123'))
    const searchCalls = await page.evaluate(() => window.__androidCalls.filter((method) => method === 'search').length)
    await page.getByRole('button', { name: '搜索来源' }).click()
    assert.equal(await page.evaluate(() => window.__androidCalls.filter((method) => method === 'search').length), searchCalls)
    assert.equal(await page.getByText('樱花动漫在线提供').count(), 0)
    assert.equal(await page.getByText('公开来源在线提供').count(), 0)
    assert.equal(await page.getByRole('button', { name: '预览' }).count(), 0)
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-search.png'), fullPage: true })
    await page.locator('.android-search-source-heading ~ ul').getByRole('button', { name: '立即观看' }).first().click()
    await page.getByRole('heading', { name: '观看作品' }).waitFor()
    await page.locator('.android-player--inline video').waitFor()
    // 竖屏控制条保留播放、时间、进度、下一集、选集、音量与放大入口，画质/帧率进放大后使用（VQ-61）。
    // 首屏不再有“选集 · 线路”与“正在连接线路…”文字。
    assert.equal(await page.locator('.android-player-caption, .android-player-loading').count(), 0)
    const compactBar = page.locator('.android-player-controls')
    assert.equal(await compactBar.getByRole('button', { name: /^下一集/ }).isVisible(), true)
    assert.equal(await compactBar.getByRole('button', { name: '选集' }).isVisible(), true)
    assert.equal(await compactBar.getByRole('button', { name: '横屏放大' }).isVisible(), true)
    assert.equal(await page.locator('.android-player--inline').evaluate((element) => getComputedStyle(element).borderTopWidth), '1px')
    await page.setViewportSize({ width: 844, height: 390 })
    await page.getByRole('button', { name: '横屏放大' }).click()
    await page.locator('.android-player-stage:fullscreen').waitFor()
    assert.equal(await page.locator('.android-player-controls.is-hidden').count(), 0)
    assert.equal(await page.locator('.android-player-controls').getByRole('button', { name: /^下一集/ }).isVisible(), true)
    await page.locator('.android-player-controls').getByRole('button', { name: '选集' }).click()
    await page.locator('.android-player-menu').getByRole('button', { name: '播放第2集' }).click()
    // 首屏不再显示“选集 · 线路”说明文字，改用详情选集列表的选中态确认已切到第 2 集。
    await page.waitForFunction(() => document.querySelector('video')?.src?.includes('second.mp4'))
    assert.equal(await page.locator('.android-player-stage:fullscreen').count(), 1)
    await page.getByRole('button', { name: '退出横屏' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.locator('.android-player--inline').evaluate((player) => !!(player.compareDocumentPosition(document.querySelector('.android-detail')) & Node.DOCUMENT_POSITION_FOLLOWING)), true)
    assert.equal(await page.locator('.android-top-search').getAttribute('aria-current'), 'page')
    await page.locator('.android-detail-copy').getByRole('heading', { name: '来源作品' }).waitFor()
    await page.getByLabel('暂无封面').last().waitFor()
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-detail.png'), fullPage: true })
    assert.equal(await page.locator('.android-detail-cover.android-cover-empty').count(), 1)
    await page.setViewportSize({ width: 360, height: 780 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '切换浅色模式' }).click()
    await page.locator('.android-app[data-theme="light"] .android-player--inline').waitFor()
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-player-light.png') })
    await page.getByRole('button', { name: '切换深色模式' }).click()
    await page.getByRole('button', { name: '返回搜索结果' }).click()
    await page.getByRole('button', { name: '立即观看' }).last().click()
    const beforeRefresh = await page.evaluate(() => window.__androidCalls.filter((method) => method === 'preview').length)
    await page.getByRole('button', { name: '刷新选集' }).click()
    await page.waitForFunction((count) => window.__androidCalls.filter((method) => method === 'preview').length > count, beforeRefresh)
    await page.getByRole('heading', { name: '选集与线路' }).waitFor()
    assert.equal(await page.locator('.android-detail-hero .android-detail-actions').count(), 1)
    assert.equal(await page.locator('.android-detail').evaluate((detail) => detail.lastElementChild?.classList.contains('android-episode-group')), true)
    assert.equal(await page.locator('video').count(), 1)
    await page.getByRole('region', { name: '作品详情' }).getByRole('button', { name: '播放第2集' }).click()
    await page.waitForFunction(() => document.querySelector('video')?.src === 'https://cdn.example.org/second.mp4')
    // 竖屏播放器不再有画面上的 ✕：选集、进度与「保存到本机」都在同一页，直接继续操作即可。
    assert.equal(await page.evaluate(() => window.__androidCalls.filter((method) => method === 'save').length), 0)
    await page.getByRole('button', { name: '保存到本机' }).click()
    await page.getByText('来源作品').waitFor()
    assert.equal(await page.evaluate(() => window.__androidCalls.includes('save')), true)
    await page.getByText('来源提供的作品简介').waitFor()
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-library.png'), fullPage: true })
    await page.getByRole('button', { name: '片库', exact: true }).click()
    const previewCalls = await page.evaluate(() => window.__androidCalls.filter((method) => method === 'preview').length)
    await page.getByRole('button', { name: '查看选集' }).click()
    await page.getByRole('heading', { name: '观看作品' }).waitFor()
    await page.locator('.android-player--inline video').waitFor()
    const catalogReads = await page.evaluate(() => window.__androidCalls.filter((method) => method === 'list').length)
    await page.getByRole('button', { name: '收藏作品' }).click()
    await page.getByRole('button', { name: '取消收藏' }).waitFor()
    assert.equal(await page.evaluate(() => window.__androidCalls.filter((method) => method === 'list').length), catalogReads)
    await page.getByRole('button', { name: '返回片库' }).click()
    await page.getByRole('button', { name: '查看选集' }).click()
    await page.getByRole('button', { name: '播放当前播放页' }).click()
    assert.equal(await page.locator('video').count(), 1)
    assert.equal(await page.evaluate(() => window.__androidCalls.filter((method) => method === 'preview').length), previewCalls)
    await exitPlayer(page)
    // 历史封面沿用记录时落盘的封面（随包相对路径也算），不再一律退回占位图。
    await page.evaluate((src) => window.__seedSourceHistory('2', src), bundledCover)
    await page.getByRole('button', { name: '历史' }).click()
    // 历史读取现在会先等在途写入落库（VQ-55），因此要等列表真正渲染出来再量布局，
    // 否则会在「加载中」的空列表上取样。
    await page.waitForFunction(() => document.querySelectorAll('.android-history-list li').length > 0)
    // 观看历史改成竖列表：卡片上下排列，不再是一排左右滑动的卡片。
    const historyRows = await page.locator('.android-history-list li').evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { x: Math.round(box.x), y: Math.round(box.y) }
    }))
    assert.ok(historyRows.length >= 1, '观看历史没有渲染条目')
    assert.equal(historyRows.every((row) => row.x === historyRows[0].x), true, `观看历史不是竖列表：${JSON.stringify(historyRows)}`)
    assert.equal(await page.locator('.android-history-actions').count(), 0, '观看历史仍在渲染左右滑动/查看全部按钮')
    assert.equal(await page.locator('.android-history-list .android-cover').count(), historyRows.length, '观看历史缺少封面')
    assert.equal(await page.locator('.android-history-list .android-cover').first().getAttribute('src'), bundledCover, '观看历史没有沿用记录里的封面')
    await page.getByRole('button', { name: '继续播放' }).click()
    assert.equal(await page.locator('video').count(), 1)
    assert.equal(await page.evaluate(() => window.__androidCalls.filter((method) => method === 'preview').length), previewCalls)
    await exitPlayer(page)
    await page.evaluate(() => window.__seedSourceHistory('missing'))
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '历史' }).click()
    await page.getByRole('button', { name: '继续播放' }).last().click()
    await page.getByText('原线路目前不可用；历史记录已保留，不会自动切换到其他线路。').waitFor()
    assert.equal(await page.locator('video').count(), 0)
    await page.evaluate(() => window.__seedAndroidCatalog())
    // 手动导入已删除：改用持久化种子 + 一次刷新，让片库读到 22 条作品（20 条样例 + 2 条直链）。
    await page.reload()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByRole('button', { name: '全部', exact: true }).click()
    await page.getByLabel('搜索本地作品').fill('')
    await page.getByText('第 1 / 2 页').waitFor()
    await page.getByRole('button', { name: '下一页' }).click()
    await page.getByText('第 2 / 2 页').waitFor()
    await page.getByLabel('搜索本地作品').fill('不存在的名称')
    await page.getByText('没有符合搜索条件的本地作品。').waitFor()
    await page.getByRole('button', { name: '首页' }).click()
    const bundledLineRequest = page.waitForRequest(
      (request) => /(?:ddbbffcdn|rrcdnbf6|bfllvip|lzcdn24|lzcdn31|lz-cdn16)\.com/.test(request.url()), { timeout: 15_000 })
    await page.getByRole('button', { name: /查看作品详情/ }).click()
    await page.getByRole('heading', { name: '观看作品' }).waitFor()
    await page.locator('.android-player--inline video').waitFor()
    await bundledLineRequest
    // 随包推荐作品自带已有线路（速度优先）：点开直接起播，不再先请求来源页等选集解析。
    assert.equal(await page.evaluate(() => window.__previewUrls.includes('https://www.yhdmtv.cc/p/65395/153/0')), false,
      '已有线路可直达播放时不应再请求来源页')
    assert.ok(mediaRequests.some((url) => /(?:ddbbffcdn|rrcdnbf6|bfllvip|lzcdn24|lzcdn31|lz-cdn16)\.com/.test(url)),
      `应立即起播随包已有线路：${mediaRequests.join('|')}`)
    assert.equal(await page.locator('.android-player--inline').evaluate((player) => !!(player.compareDocumentPosition(document.querySelector('.android-detail')) & Node.DOCUMENT_POSITION_FOLLOWING)), true)
    assert.match(await page.locator('.android-detail-cover').getAttribute('src'), /\/assets\/127-[^/]+\.jpg$/)
    // 《你的名字》是单片：两条线路（正片 / HD中字）各只有一条记录，按线路并成一张列表。
    // 电影不能把线路描述成「第 1 集／第 2 集」——那正是用户报的错误描述。
    assert.deepEqual(await page.locator('.android-detail .android-episode-group h4').allTextContents(), ['线路'])
    assert.deepEqual(await page.locator('.android-detail .android-episode-group button').allTextContents(), ['线路 1', '中字'])
    await page.screenshot({ path: path.join(os.tmpdir(), 'sanye-android-bundled-detail.png') })
    // 外站候选仍然可选：切到备用来源后显示来源自己的选集，再点“返回原来源”。
    await page.getByRole('button', { name: '切换备用来源' }).click()
    await page.getByRole('button', { name: '返回原来源' }).waitFor()
    assert.equal(await page.locator('.android-detail .android-episode-group button').allTextContents().then((items) => items.join('|')), '中字')
    const subtitleRequest = page.waitForRequest((request) => request.url().includes('subtitle.m3u8'), { timeout: 15_000 })
    await page.getByRole('button', { name: '播放中字' }).click()
    await page.waitForFunction(() => window.__previewUrls.includes('https://www.yhdmtv.cc/p/65395/153/4570085'))
    await subtitleRequest
    // 关闭播放器时必须落下最后一段进度（VQ-54）：pause 事件是异步派发的，等它回到页面时
    // src 已被清空、currentTime 归零，persistProgress 开头就返回——用户看到的就是
    //「看完退出后观看历史里没有这一条」。
    await page.locator('video').evaluate((element) => {
      try { Object.defineProperty(element, 'currentTime', { value: 63, configurable: true }) } catch {}
    })
    const payloadsBeforeExit = await page.evaluate(() => (window.__progressPayloads || []).length)
    await exitPlayer(page)
    await page.waitForFunction((before) => (window.__progressPayloads || []).length > before, payloadsBeforeExit)
    const closingPayload = await page.evaluate(() => window.__progressPayloads.at(-1))
    assert.ok(Math.abs(closingPayload.positionSeconds - 63) < 1, '关闭播放器时没有保存最后进度：' + JSON.stringify(closingPayload))
    // 用户要求「退出观看页面就保存观看历史」：退出后必须先落库、再刷新列表，
    // 否则用户马上点进观看历史会读到写入之前的旧列表，观感就是「保存太慢」。
    const callsAfterExit = await page.evaluate(() => window.__androidCalls.slice())
    const savedAt = callsAfterExit.lastIndexOf('recordProgress')
    const rereadAt = callsAfterExit.lastIndexOf('listHistory')
    assert.ok(savedAt >= 0, '退出观看页面没有写入观看历史：' + callsAfterExit.join('>'))
    assert.ok(rereadAt > savedAt, '退出观看页面后没有在落库之后立刻刷新观看历史：' + callsAfterExit.join('>'))
    await page.getByRole('button', { name: '收藏作品' }).click()
    await page.getByRole('button', { name: '取消收藏' }).waitFor()
    await page.getByRole('button', { name: '片库', exact: true }).click()
    await page.getByLabel('搜索本地作品').fill('')
    assert.match((await page.locator('.android-list img').evaluateAll((images) =>
      images.map((image) => image.getAttribute('src')).join('|'))), /\/assets\/127-[^/]+\.jpg/)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
