const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')
const output = path.resolve(__dirname, '../sanye_deploy/.local/android-button-response')

/**
 * 安卓按钮「响应方式与速度」门禁。
 *
 * 起因（用户：「现在有些按钮的响应方式与速度存在不合理的地方」）：此前样式表里**没有任何按钮的 `:active` 规则**，
 * 触摸反馈只剩 WebView 松手后闪一下的默认灰罩 `rgba(0,0,0,.18)`，`touch-action` 也是默认 `auto`
 * （双击缩放等待），而主题切换、收藏这类「界面直接由设置/列表渲染」的按钮要等原生写入返回才变化
 * （实测原生写入 180ms 时分别是 198ms 与 187ms 才有反馈），连点两次还会真的写两次原生。
 *
 * 本文件把五件事变成可复核的门槛：
 *   1. 按下即有反馈：构建产物里存在按钮 `:active` 规则、根节点 `touch-action: manipulation`、
 *      默认点击高亮被关掉，且真实指针按住时按钮的计算样式确实变了；
 *   2. 先本地生效：原生写入延迟 300ms 时，主题切换与收藏的目标状态仍要在 150ms 内达成；
 *   3. 不重复写：连点两次收藏/保存，原生各只被调用一次；
 *   4. 检索取代：旧检索在途时改关键词会真的发起新检索（改前被静默丢弃，界面停在旧结果）；
 *   5. 应用内两步确认：清除观看历史第一次点只进入确认态、不写原生，第二次点才清除，且不再用原生对话框。
 */

const seedItems = [
  { id: 901, title: '样例甲', url: 'https://example.org/a.mp4', coverUrl: '', summary: '直链', favorite: false, updatedAt: Date.now() },
  { id: 902, title: '样例乙', url: 'https://example.org/b.mp4', coverUrl: '', summary: '直链', favorite: false, updatedAt: Date.now() - 1000 },
]

const bridge = (delays) => {
  window.__calls = []
  window.__confirmCalls = 0
  const nativeConfirm = window.confirm
  window.confirm = (...args) => { window.__confirmCalls += 1; return nativeConfirm ? nativeConfirm(...args) : true }
  window.__delays = delays || {}
  window.Capacitor = {
    getPlatform: () => 'android',
    PluginHeaders: [
      { name: 'SanyeCatalog', methods: ['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache'].map((name) => ({ name, rtype: 'promise' })) },
      { name: 'SanyeSource', methods: ['search', 'preview'].map((name) => ({ name, rtype: 'promise' })) },
      { name: 'SanyePlayer', methods: ['setLandscape', 'setImmersive', 'setKeepAwake'].map((name) => ({ name, rtype: 'promise' })) },
      { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'getInfo', rtype: 'promise' }] },
    ],
    nativeCallback: async (plugin, method, options, callback) => {
      if (plugin === 'App' && method === 'addListener') { window.__backHandlers = window.__backHandlers || []; window.__backHandlers.push(callback); return 'back-1' }
      return 'callback-1'
    },
    nativePromise: async (plugin, method, options) => {
      window.__calls.push({ plugin, method, options: JSON.parse(JSON.stringify(options || {})) })
      const delay = (window.__delays && window.__delays[method]) || 0
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      if (plugin === 'App') {
        if (method === 'getInfo') return { version: '5.2', build: '43' }
        return {}
      }
      if (method === 'list') return { items: window.__items }
      if (method === 'listHistory') return { items: window.__history }
      if (method === 'getSettings') return { settings: Object.assign({ theme: 'dark', autoPlay: false, playbackRate: 1, qualityProfile: 'off', frameTarget: 'off' }, window.__settings) }
      if (method === 'setSettings') { window.__settings = Object.assign({}, window.__settings, options.settings); return { settings: Object.assign({ theme: 'dark', autoPlay: false, playbackRate: 1, qualityProfile: 'off', frameTarget: 'off' }, window.__settings) } }
      if (method === 'setFavorite') {
        const target = window.__items.find((item) => item.id === options.id)
        if (target) target.favorite = options.favorite
        return { item: JSON.parse(JSON.stringify(target)) }
      }
      if (method === 'save') {
        window.__items.push({ id: 950 + window.__items.length, title: options.title, url: options.url, coverUrl: '', summary: '', favorite: !!options.favorite, updatedAt: Date.now() })
        return { item: window.__items.at(-1) }
      }
      if (method === 'clearHistory') { window.__history = []; return {} }
      if (method === 'search') return { hits: [{ title: '来源作品', sourceUrl: 'https://www.yhdmtv.cc/p/123', coverUrl: '', summary: '命中' }] }
      if (method === 'preview') return {
        title: '来源作品', sourceUrl: options.sourceUrl, coverUrl: '', summary: '简介',
        episodes: [{ id: `${options.sourceUrl}#1`, title: '第1集', sourceUrl: `${options.sourceUrl}#1`, playbackUrl: 'https://cdn.example.org/1.mp4', mimeType: 'video/mp4', lineId: 'main' }],
      }
      return {}
    },
  }
}

let server
let browser
let origin

before(async () => {
  await fs.mkdir(output, { recursive: true })
  server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURI(request.url || '/'))
    const file = target === root ? path.join(root, 'index.html') : target
    try {
      const data = await readFile(file)
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}/`
  browser = await chromium.launch({ headless: true })
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => server?.close(resolve))
})

/** 打开一页：随包片库用固定种子，原生调用可配置延迟，并记录全部调用与对话框调用次数。 */
const launch = async (delays = {}, history = []) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark', hasTouch: true })
  const page = await context.newPage()
  await page.route('https://img.picbf.com/**', (route) => route.abort())
  await page.route('https://cdn.example.org/**', () => {})
  await page.route('https://example.org/**', () => {})
  await page.addInitScript(`window.__items = ${JSON.stringify(seedItems)}; window.__history = ${JSON.stringify(history)}; window.__settings = undefined`)
  await page.addInitScript(bridge, delays)
  await page.goto(origin)
  await page.locator('.android-hero').waitFor()
  return { context, page }
}

const countCalls = (page, method) => page.evaluate((name) => window.__calls.filter((entry) => entry.method === name).length, method)

/** 从「按下」到目标状态成立的毫秒数（用真实指针按下，避免合成触摸不触发 :active 的假结论）。 */
const pressToState = async (page, locator, predicate) => {
  const box = await locator.boundingBox()
  await page.evaluate((body) => {
    window.__stateAt = 0
    window.__stateStart = performance.now()
    window.__stateTest = new Function('return (' + body + ')')
    window.__stateTimer = setInterval(() => { if (!window.__stateAt && window.__stateTest()) window.__stateAt = performance.now() }, 4)
  }, predicate)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(20)
  await page.mouse.up()
  await page.waitForFunction(() => window.__stateAt > 0, null, { timeout: 5000 }).catch(() => {})
  const elapsed = await page.evaluate(() => { clearInterval(window.__stateTimer); return window.__stateAt ? window.__stateAt - window.__stateStart : 0 })
  await page.waitForTimeout(220)
  return Math.round(elapsed)
}

test('按下即有反馈：按钮 :active 规则、去掉默认高亮与双击缩放等待', async () => {
  const css = (await fs.readdir(path.resolve(root, 'assets'))).find((name) => name.endsWith('.css'))
  const text = await fs.readFile(path.resolve(root, 'assets', css), 'utf8')
  const activeRules = text.split('}').filter((chunk) => /:active/.test(chunk) && /button/.test(chunk.split('{')[0] || ''))
  assert.ok(activeRules.length >= 1, '构建产物里没有匹配按钮的 :active 规则，按下期间不可能有反馈')

  const { context, page } = await launch()
  try {
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.android-app')).touchAction), 'manipulation',
      '根节点必须是 touch-action: manipulation，否则双击缩放等待会把点按推迟约 300ms')
    const samples = ['.android-nav button:nth-child(2)', '.android-theme-toggle', '.android-top-search', '.android-catalog-open']
    const evidence = []
    for (const selector of samples) {
      // 真实按下会真的触发点击（导航、进详情都会把当前元素带走），每个抽样都重新回首页再量。
      await page.goto(origin)
      await page.locator('.android-hero').waitFor()
      const target = page.locator(selector).first()
      const idle = await target.evaluate((node) => {
        const style = getComputedStyle(node)
        return { transform: style.transform, opacity: style.opacity, highlight: style.getPropertyValue('-webkit-tap-highlight-color') }
      })
      assert.equal(idle.highlight, 'rgba(0, 0, 0, 0)', `${selector} 仍有 WebView 默认点击高亮：${idle.highlight}`)
      const box = await target.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(60)
      const held = await target.evaluate((node) => {
        const style = getComputedStyle(node)
        return { active: node.matches(':active'), transform: style.transform, opacity: style.opacity }
      })
      await page.mouse.up()
      await page.waitForTimeout(150)
      assert.ok(held.active, `${selector} 按下时未进入 :active`)
      assert.notEqual(held.transform, idle.transform, `${selector} 按下期间 transform 无变化（无按压反馈）`)
      evidence.push({ selector, idle: idle.transform, held: held.transform, opacity: Number(held.opacity).toFixed(3) })
    }
    await fs.writeFile(path.join(output, 'gate-pressed.json'), JSON.stringify({ activeRules: activeRules.length, samples: evidence }, null, 1), 'utf8')

    // 触摸路径：合成触摸不会给元素加 `:active`（实测按住 160ms 仍不命中），所以按下反馈另有
    // `pointerdown` 挂上的 `.is-pressed`。这里按真机顺序走一遍：按下必须立刻进按下态、抬起要复位、
    // 整条链路的 click 仍要落到按钮上（`touch-action: manipulation` 不能把点按吃掉）。
    await page.goto(origin)
    await page.locator('.android-hero').waitFor()
    const nav = page.locator('.android-nav button:nth-child(2)')
    const navBox = await nav.boundingBox()
    const client = await page.context().newCDPSession(page)
    const point = [{ x: navBox.x + navBox.width / 2, y: navBox.y + navBox.height / 2, radiusX: 8, radiusY: 8, force: 1, id: 1 }]
    const idleTransform = await nav.evaluate((node) => getComputedStyle(node).transform)
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point })
    await page.waitForTimeout(60)
    const pressed = await nav.evaluate((node) => ({ pressed: node.classList.contains('is-pressed'), transform: getComputedStyle(node).transform }))
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await page.waitForTimeout(150)
    const released = await nav.evaluate((node) => node.classList.contains('is-pressed'))
    assert.ok(pressed.pressed, '触摸按下时按钮没有进入按下态（is-pressed）')
    assert.notEqual(pressed.transform, idleTransform, '触摸按下时按钮没有任何样式变化')
    assert.equal(released, false, '触摸取消后按下态没有复位')
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point })
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForFunction(() => document.querySelector('.android-page-heading h1')?.textContent === '番剧仓库', null, { timeout: 4000 })
    await client.detach()
  } finally {
    await context.close()
  }
})

test('主题切换与收藏先本地生效，不等原生写入返回', async () => {
  const { context, page } = await launch({ setSettings: 300, setFavorite: 300 })
  try {
    const toggle = page.locator('.android-theme-toggle')
    const themeMs = await pressToState(page, toggle, "document.querySelector('.android-app')?.dataset.theme === 'light'")
    assert.ok(themeMs > 0 && themeMs <= 150, `主题切换要等 ${themeMs}ms 才变色（原生写入 300ms，应改为先本地生效）`)

    await page.getByRole('button', { name: '片库', exact: true }).click()
    const favorite = page.locator('.android-list li .android-actions button:nth-child(2)').first()
    await favorite.waitFor()
    const favoriteMs = await pressToState(page, favorite, "document.querySelector('.android-list li .android-actions button:nth-child(2)')?.textContent?.trim() === '已收藏'")
    assert.ok(favoriteMs > 0 && favoriteMs <= 150, `收藏要等 ${favoriteMs}ms 才翻转（原生写入 300ms，应改为先本地生效）`)
    await fs.writeFile(path.join(output, 'gate-optimistic.json'), JSON.stringify({ themeMs, favoriteMs }, null, 1), 'utf8')
  } finally {
    await context.close()
  }
})

test('连点两次不会重复写原生（收藏与保存各只写一次）', async () => {
  const { context, page } = await launch({ setFavorite: 250, save: 250 })
  try {
    await page.getByRole('button', { name: '片库', exact: true }).click()
    const favorite = page.locator('.android-list li .android-actions button:nth-child(2)').first()
    await favorite.waitFor()
    const beforeFavorite = await countCalls(page, 'setFavorite')
    // 同一帧内连点两次：此时 DOM 还没来得及把按钮置为 disabled（Vue 的更新在微任务里），
    // 也就是说第二次点击真的会进到处理函数里，必须靠「写入在途」守卫拦下。
    await page.evaluate(() => {
      const button = document.querySelectorAll('.android-list li .android-actions button')[1]
      button.click()
      button.click()
    })
    await page.waitForTimeout(700)
    const favoriteCalls = (await countCalls(page, 'setFavorite')) - beforeFavorite
    assert.equal(favoriteCalls, 1, `连点两次收藏触发了 ${favoriteCalls} 次原生写入`)

    await page.locator('.android-top-search').click()
    await page.locator('#source-keyword').fill('来源作品')
    await page.locator('.android-search-form button[type=submit]').click()
    await page.locator('.android-list li button', { hasText: '立即观看' }).first().click()
    await page.locator('.android-detail-actions button', { hasText: '保存到本机' }).first().waitFor()
    const beforeSave = await countCalls(page, 'save')
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.android-detail-actions button')].find((node) => node.textContent.trim() === '保存到本机')
      button.click()
      button.click()
    })
    await page.waitForTimeout(700)
    const saveCalls = (await countCalls(page, 'save')) - beforeSave
    assert.equal(saveCalls, 1, `连点两次保存触发了 ${saveCalls} 次原生写入（会在片库留下重复作品）`)
    await fs.writeFile(path.join(output, 'gate-duplicate.json'), JSON.stringify({ favoriteCalls, saveCalls }, null, 1), 'utf8')
  } finally {
    await context.close()
  }
})

test('旧检索在途时改关键词会取代旧检索，而不是被丢弃', async () => {
  const { context, page } = await launch({ search: 1200 })
  try {
    await page.locator('.android-top-search').click()
    await page.locator('#source-keyword').fill('第一')
    await page.locator('.android-search-form button[type=submit]').click()
    await page.waitForTimeout(150)
    await page.locator('#source-keyword').fill('第二')
    await page.waitForTimeout(2600)
    const searched = await page.evaluate(() => window.__calls.filter((entry) => entry.method === 'search').map((entry) => entry.options.keyword))
    assert.deepEqual(searched, ['第一', '第二'], `在途检索没有让位给新关键词，实际发出：${JSON.stringify(searched)}`)
    await fs.writeFile(path.join(output, 'gate-search.json'), JSON.stringify({ searched }, null, 1), 'utf8')
  } finally {
    await context.close()
  }
})

test('清除观看历史用应用内两步确认，不再弹原生对话框', async () => {
  const history = [{ mediaUrl: 'https://example.org/a.mp4', title: '样例甲', episodeId: 'direct', episodeTitle: '直链媒体', lineId: 'main', positionSeconds: 30, durationSeconds: 120, completed: false, updatedAt: Date.now() }]
  const { context, page } = await launch({}, history)
  try {
    await page.getByRole('button', { name: '历史', exact: true }).click()
    const clear = page.locator('.android-history-clear')
    await clear.waitFor()
    assert.equal((await clear.textContent()).trim(), '清除观看历史')
    await clear.click()
    await page.waitForTimeout(120)
    assert.match((await clear.textContent()).trim(), /再点一次确认清除/, '第一次点击应进入应用内确认态')
    assert.equal(await countCalls(page, 'clearHistory'), 0, '第一次点击不应写原生')
    await page.waitForTimeout(3200)
    assert.equal((await clear.textContent()).trim(), '清除观看历史', '3 秒不确认应自动复位')
    await clear.click()
    await page.waitForTimeout(60)
    await clear.click()
    await page.waitForFunction(() => window.__calls.some((entry) => entry.method === 'clearHistory'), null, { timeout: 4000 })
    assert.equal(await countCalls(page, 'clearHistory'), 1, '确认后应只清除一次')
    assert.equal(await page.evaluate(() => window.__confirmCalls), 0, '不应再调用原生 confirm 对话框')
    await fs.writeFile(path.join(output, 'gate-clear.json'), JSON.stringify({ cleared: 1, confirmCalls: 0 }, null, 1), 'utf8')
  } finally {
    await context.close()
  }
})
