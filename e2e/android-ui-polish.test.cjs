const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '../sanye_client/dist-android')
const output = path.resolve(__dirname, '../sanye_deploy/.local/android-ui-polish')

/** 页面：导航按钮名、最小可断言内容与截图名；搜索已并入顶部搜索条，其余页面走底部导航。 */
const openSection = async (page, entry) => {
  if (entry.label === 'search') await page.locator('.android-top-search').click()
  else await page.getByRole('button', { name: entry.nav, exact: true }).click()
}

const pages = [
  { nav: '搜索', label: 'search', heading: '搜索作品' },
  { nav: '片库', label: 'library', heading: '番剧仓库' },
  { nav: '排期', label: 'schedule', heading: '一周排期' },
  { nav: '历史', label: 'history', heading: '继续观看' },
  { nav: '我的', label: 'settings', heading: '我的空间' },
]

/**
 * 覆盖「非首页分区与首页同一标准」：分区不再用整块面板包住、行内动作不再是实心亮色块、
 * 每页都有与首页同款的分区标题与说明，并在深/浅主题与 390/360 两种宽度下无横向溢出。
 */
test('非首页分区与首页同一套视觉语言，且深/浅主题都不溢出', { timeout: 120000 }, async () => {
  await fs.mkdir(output, { recursive: true })
  const server = createServer(async (request, response) => {
    const target = path.resolve(root, '.' + decodeURI(request.url || '/'))
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return }
    const file = target === root ? path.join(root, 'index.html') : target
    try {
      const data = await readFile(file)
      const contentTypes = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
      response.setHeader('Content-Type', contentTypes[path.extname(file)] || 'text/html')
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
    await page.route('https://img.picbf.com/**', (route) => route.abort())
    // 媒体请求保持挂起：用例只核对版式与控件，不依赖真实解码结果。
    await page.route('https://cdn.example.org/**', () => {})
    await page.addInitScript(() => {
      const items = [
        { id: 1, title: '已保存作品甲', url: 'https://example.org/a.mp4', favorite: true, updatedAt: Date.now(), summary: '本机保存的直链媒体。' },
        { id: 2, title: '已保存作品乙', url: 'https://www.yhdmtv.cc/p/123', favorite: false, updatedAt: Date.now() - 86400000, summary: '来源网页，点击后解析选集。' },
      ]
      const history = [
        { mediaUrl: 'https://example.org/a.mp4', title: '已保存作品甲', episodeId: 'direct', episodeTitle: 'EP02', lineId: 'main', positionSeconds: 300, durationSeconds: 1200, completed: false, updatedAt: Date.now() },
        { mediaUrl: 'https://www.yhdmtv.cc/p/123', title: '来源作品', episodeId: 'https://www.yhdmtv.cc/p/124', episodeTitle: '第2集', lineId: 'main', positionSeconds: 40, durationSeconds: 120, completed: true, updatedAt: Date.now() - 3600000 },
      ]
      const settings = { theme: 'system', autoPlay: false, playbackRate: 1, qualityProfile: 'off', frameTarget: 'off' }
      window.__settingsWrites = []
      const methodNames = ['list', 'save', 'setFavorite', 'listHistory', 'recordProgress', 'clearHistory', 'getSettings', 'setSettings', 'clearMediaCache']
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [
          { name: 'SanyeCatalog', methods: methodNames.map((name) => ({ name, rtype: 'promise' })) },
          { name: 'SanyeSource', methods: ['search', 'preview'].map((name) => ({ name, rtype: 'promise' })) },
        ],
        nativePromise: async (_, method, options) => {
          if (method === 'list') return { items }
          if (method === 'listHistory') return { items: history }
          if (method === 'getSettings') return { settings: { ...settings } }
          if (method === 'setSettings') {
            window.__settingsWrites.push({ ...options.settings })
            Object.assign(settings, options.settings)
            return { settings: { ...settings } }
          }
          if (method === 'recordProgress') return { item: options }
          if (method === 'search') return { hits: [
            { title: '来源候选甲', sourceUrl: 'https://www.yhdmtv.cc/p/900', coverUrl: '', summary: '' },
            { title: '来源候选乙', sourceUrl: 'https://www.yhdmtv.cc/p/901', coverUrl: '', summary: '' },
          ] }
          if (method === 'preview') return { title: '来源候选甲', sourceUrl: options.sourceUrl, coverUrl: window.__uiCover || '', summary: '海报与作品信息分开呈现，选集按来源保留。', episodes: Array.from({ length: 9 }, (_, index) => (
            { id: `${options.sourceUrl}/${index}`, title: index === 0 ? '01' : index === 1 ? 'EP02' : `第${index + 1}集`, sourceUrl: `${options.sourceUrl}/${index}`, playbackUrl: 'https://cdn.example.org/sample.m3u8', mimeType: 'application/vnd.apple.mpegurl', lineId: 'main' }
          )) }
          return { removed: 0 }
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.locator('.android-home .android-hero').waitFor()
    await page.evaluate(() => { window.__uiCover = new URL(document.querySelector('.android-catalog img').getAttribute('src'), location.href).href })
    // 顶栏品牌只保留文字：左上角的方块标已按要求移除，品牌名仍是「三叶动漫」。
    assert.equal(await page.locator('.android-brand-mark').count(), 0, '左上角的品牌方块标记应已移除')
    assert.equal(await page.locator('.android-brand strong').textContent(), '三叶动漫')

    const report = []
    for (const theme of ['dark', 'light']) {
      // 设置页下拉已删除：主题改由顶栏切换按钮驱动，按当前主题决定是否需要切换。
      if (await page.locator('.android-app').getAttribute('data-theme') !== theme) {
        await page.getByRole('button', { name: theme === 'dark' ? '切换深色模式' : '切换浅色模式' }).click()
      }
      await page.waitForFunction((value) => document.querySelector('.android-app')?.getAttribute('data-theme') === value, theme)
      for (const width of [390, 360, 320]) {
        await page.setViewportSize({ width, height: 844 })
        await page.getByRole('button', { name: '首页', exact: true }).click()
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForFunction(() => [...document.querySelectorAll('.android-home img')].every((image) => image.complete && image.naturalWidth > 0))
        const homeLayout = await page.locator('.android-catalog').evaluate((element) => ({ columns: getComputedStyle(element).gridTemplateColumns.split(' ').length, scrollWidth: document.documentElement.scrollWidth, width: innerWidth }))
        assert.equal(homeLayout.columns, 3, '手机推荐应为三列海报网格')
        assert.ok(homeLayout.scrollWidth <= homeLayout.width, '首页海报网格不得横向溢出')
        assert.equal(await page.locator('.android-catalog li').first().evaluate((element) => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)', '推荐海报不应带整块底板')
        assert.equal(await page.locator('.android-catalog li').first().evaluate((element) => getComputedStyle(element).paddingLeft), '0px', '推荐海报不应有卡内留白')
        const themeIcon = await page.locator('.android-theme-toggle').evaluate((button) => {
          const outer = button.getBoundingClientRect(); const icon = button.querySelector('svg').getBoundingClientRect()
          return { x: Math.abs(outer.x + outer.width / 2 - icon.x - icon.width / 2), y: Math.abs(outer.y + outer.height / 2 - icon.y - icon.height / 2) }
        })
        assert.ok(themeIcon.x < 1 && themeIcon.y < 1, '主题图标应水平和垂直居中')
        await page.screenshot({ path: path.join(output, `home-${theme}-${width}.png`) })
        for (const entry of pages) {
          await openSection(page, entry)
          await page.evaluate(() => window.scrollTo(0, 0))
          // 搜索页需要一次真实搜索才能看到结果卡片列表。
          if (entry.label === 'search') {
            await page.getByLabel('作品关键词').fill('来源')
            await page.getByRole('button', { name: '搜索来源' }).click()
            await page.getByText('来源候选甲').waitFor()
          }
          await page.getByRole('heading', { name: entry.heading }).waitFor()
          const state = await page.evaluate(() => {
            const app = document.querySelector('.android-app')
            const section = document.querySelector('.android-page-section')
            const sourceAction = document.querySelector('.android-source-context button')
            const action = section?.querySelector('.android-list li button')
            const style = section ? getComputedStyle(section) : null
            const actionStyle = action ? getComputedStyle(action) : null
            const groups = [...document.querySelectorAll('.android-setting-group')]
            const rows = [...document.querySelectorAll('.android-setting-row')]
            const listRow = section?.querySelector('.android-list li')
            const heading = document.querySelector('.android-page-heading')
            return {
              theme: app?.getAttribute('data-theme'),
              scrollWidth: document.documentElement.scrollWidth,
              innerWidth: window.innerWidth,
              sections: document.querySelectorAll('.android-page-section').length,
              sectionBorderWidth: style?.borderTopWidth ?? '',
              sectionBackground: style?.backgroundColor ?? '',
              notes: document.querySelectorAll('.android-page-heading-note').length,
              headingChars: (heading?.textContent ?? '').replace(/\s+/g, '').length,
              sectionChars: (section?.textContent ?? '').replace(/\s+/g, '').length,
              headingTitleSize: heading ? parseFloat(getComputedStyle(heading.querySelector('h1')).fontSize) : 0,
              sourceActionColor: sourceAction ? getComputedStyle(sourceAction).color : '',
              appBg: app ? getComputedStyle(app).getPropertyValue('--app-bg').trim() : '',
              actionBackground: actionStyle?.backgroundColor ?? '',
              actionRadius: actionStyle?.borderTopLeftRadius ?? '',
              rowRadius: listRow ? `${getComputedStyle(listRow).borderTopLeftRadius} ${getComputedStyle(listRow).borderTopRightRadius}` : '',
              cardChips: groups.length,
              layoutRows: rows.length,
              gridRows: rows.filter((row) => getComputedStyle(row).display === 'grid').length,
              firstListBorder: rows.length ? getComputedStyle(rows[0].parentElement).borderTopWidth : '',
            }
          })
          report.push({ theme, width, page: entry.label, ...state })
          assert.equal(state.sections > 0, true, `${entry.label} 还没有按页面分区处理`)
          assert.equal(state.sectionBorderWidth, '0px', `${entry.label} 分区仍在用整块面板边框`)
          assert.equal(state.sectionBackground, 'rgba(0, 0, 0, 0)', `${entry.label} 分区仍有面板底色`)
          // 文案精简：不再有重复的页面说明；动态订阅列表不以固定字数限制真实内容。
          assert.equal(state.notes, 0, `${entry.label} 仍在渲染多余的页面说明`)
          assert.equal(await page.locator('.android-page-heading .android-kicker').count(), 0, `${entry.label} 不重复显示标题前的小标签`)
          assert.equal(state.headingChars <= 22, true, `${entry.label} 标题区文案过长：${state.headingChars}`)
          assert.equal(state.scrollWidth <= state.innerWidth, true, `${entry.label} 在 ${width}px 出现横向溢出：${state.scrollWidth}`)
          assert.equal(state.headingTitleSize <= 34, true, `${entry.label} 标题字号偏大：${state.headingTitleSize}`)
          if (state.rowRadius && entry.label !== 'library') assert.equal(state.rowRadius, '14px 14px', `${entry.label} 卡片圆角未统一：${state.rowRadius}`)
          // 药丸（999px）过圆，统一收敛成适度圆角；这里同时卡住上界，防止再改回全圆。
          if (state.actionRadius) {
            assert.equal(state.actionRadius, entry.label === 'library' ? '0px' : '10px', `${entry.label} 动作按钮圆角未收敛：${state.actionRadius}`)
            assert.ok(parseFloat(state.actionRadius) <= 14, `${entry.label} 动作按钮又变回药丸：${state.actionRadius}`)
          }
          if (state.actionBackground) {
            assert.notEqual(state.actionBackground, 'rgb(234, 242, 196)', `${entry.label} 行内动作还是实心亮色块`)
          }
          if (entry.label === 'settings') {
            assert.equal(state.cardChips >= 1, true, `「我的」应按分组组织，实际分组 ${state.cardChips}`)
            // 画质与帧率的档位只在播放器放大后的浮层里选（用户要求「我要的是全屏状态下在那选」），
            // 「我的」不承担档位入口；同时「数据」区块（媒体缓存 / 诊断摘要）按产品要求继续删除。
            assert.equal(await page.locator('.android-setting-group').filter({ hasText: '数据' }).count(), 0, '「我的」仍在显示用户看不懂的数据区块')
            assert.equal(state.layoutRows, state.gridRows, '设置行应为「左名称 + 右控件」的两列排版')
            assert.equal(state.firstListBorder, '1px', '设置分组应是一张有描边的卡片')
          }
          if (entry.label === 'library') {
            assert.equal(await page.locator('.android-library-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2, '手机片库应采用两列海报网格')
            await page.getByRole('button', { name: '收藏', exact: true }).first().click()
            assert.equal(await page.locator('.android-library-grid li').count(), 1, '收藏筛选应保留')
            await page.getByRole('button', { name: '全部', exact: true }).click()
            await page.getByLabel('搜索本地作品').fill('作品乙')
            assert.equal(await page.locator('.android-library-grid li').count(), 1, '片库搜索应保留')
            await page.getByLabel('搜索本地作品').fill('')
            await page.waitForFunction(() => [...document.querySelectorAll('.android-library-grid img')].every((image) => image.complete && image.naturalWidth > 0))
          }
          await page.screenshot({ path: path.join(output, `${entry.label}-${theme}-${width}.png`) })
        }
        await page.locator('.android-top-search').click()
        await page.getByLabel('作品关键词').fill('来源')
        await page.getByRole('button', { name: '搜索来源' }).click()
        await page.getByRole('button', { name: '立即观看' }).first().click()
        await page.locator('.android-episode-grid button[aria-pressed=true]').waitFor()
        assert.deepEqual((await page.locator('.android-episode-grid button').allTextContents()).slice(0, 2), ['第1集', '第2集'], '纯数字和 EP 集号应采用同一显示格式')
        await page.waitForFunction(() => { const image = document.querySelector('.android-detail-cover'); return image?.complete && image.naturalWidth > 0 })
        assert.equal(await page.locator('.android-episode-grid button[aria-pressed=true]').count(), 1, '选集应只标记一个当前条目')
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '详情区不得横向溢出')
        await page.screenshot({ path: path.join(output, `detail-${theme}-${width}.png`) })
        await page.locator('.android-detail').scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(output, `detail-episodes-${theme}-${width}.png`) })
      }
      await page.setViewportSize({ width: 390, height: 844 })
      for (const entry of pages) {
        await openSection(page, entry)
        if (entry.label === 'search') {
          await page.getByLabel('作品关键词').fill('来源')
          await page.getByRole('button', { name: '搜索来源' }).click()
          await page.getByText('来源候选甲').waitFor()
        }
        await page.getByRole('heading', { name: entry.heading }).waitFor()
        await page.screenshot({ path: path.join(output, `${entry.label}-${theme}.png`) })
      }
    }
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 1), 'utf8')
    // 「我的」不再有下拉：画质与帧率的档位统一在播放器放大后的浮层里选。
    await page.getByRole('button', { name: '我的', exact: true }).click()
    await page.getByRole('heading', { name: '我的空间' }).waitFor()
    assert.equal(await page.locator('.android-app select').count(), 0, '「我的」不应再有任何下拉控件')

    // 详情页的动作与选集在浅色主题下也必须走同一套芯片，不能再出现深色实心块。
    await page.locator('.android-top-search').click()
    await page.getByLabel('作品关键词').fill('来源')
    await page.getByRole('button', { name: '搜索来源' }).click()
    await page.getByRole('button', { name: '立即观看' }).first().click()
    await page.locator('.android-detail-actions button').first().waitFor()
    await page.screenshot({ path: path.join(output, 'detail-light.png') })
    const detailButtons = await page.evaluate(() => ({
      actions: [...document.querySelectorAll('.android-detail-actions button')].map((button) => getComputedStyle(button).backgroundColor),
      episodes: [...document.querySelectorAll('.android-episode-grid button')].map((button) => getComputedStyle(button).backgroundColor),
    }))
    for (const background of [...detailButtons.actions, ...detailButtons.episodes]) {
      assert.notEqual(background, 'rgb(40, 58, 85)', `浅色主题下详情页仍在用深色实心块：${background}`)
    }

    // 强调色在两种主题下都必须取自主题变量，且与页面底色的对比度达标。
    const dark = report.find((row) => row.theme === 'dark' && row.page === 'search')
    const light = report.find((row) => row.theme === 'light' && row.page === 'search')
    assert.equal(dark.sourceActionColor, 'rgb(243, 200, 107)', '深色来源按钮的强调色应取主题变量')
    assert.equal(light.sourceActionColor, 'rgb(150, 80, 31)', '浅色来源按钮的强调色必须换成高对比的深琥珀')
    assert.equal(contrast(light.sourceActionColor, '#f7f3e9') >= 4.5, true, '浅色来源按钮对比度不足')
    assert.equal(contrast(dark.sourceActionColor, '#081428') >= 4.5, true, '深色来源按钮对比度不足')
    // 字体放大不能把设置名称挤成逐字竖排；同时覆盖最窄的手机宽度。
    for (const theme of ['dark', 'light']) {
      await page.emulateMedia({ colorScheme: theme })
      for (const width of [320, 390]) {
        for (const section of ['settings', 'history']) {
          await page.reload()
          await page.setViewportSize({ width, height: 844 })
          await page.locator('.android-home').waitFor()
          await openSection(page, pages.find((entry) => entry.label === section))
          await page.evaluate(() => {
            const elements = [...document.querySelectorAll('.android-app, .android-app *')]
            const sizes = elements.map((element) => parseFloat(getComputedStyle(element).fontSize))
            elements.forEach((element, index) => { element.style.fontSize = `${sizes[index] * 2}px` })
          })
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${section} 的 ${width}px 双倍字体不应溢出`)
          if (section === 'settings') {
            await page.getByRole('group', { name: '我的功能' }).getByRole('button', { name: '缓存', exact: true }).click()
            const label = page.locator('.android-setting-row strong').filter({ hasText: '媒体缓存' })
            assert.ok(await label.evaluate((element) => element.parentElement.clientWidth >= parseFloat(getComputedStyle(element).fontSize) * 4), '媒体缓存名称应有完整一行的宽度')
            assert.equal(await page.getByText('播放速度', { exact: true }).count(), 0, '设置页不应恢复播放速度入口')
          } else {
            assert.ok((await page.locator('.android-history-copy small').first().textContent()).includes('第2集'), '历史集数显示应与选集一致')
            assert.ok(await page.locator('.android-history-copy').first().evaluate((element) => element.clientWidth >= parseFloat(getComputedStyle(element.querySelector('strong')).fontSize) * 5), '放大字体后历史标题不应被动作按钮挤到仅两个字宽')
          }
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
          const covered = await page.evaluate(() => {
            const navTop = document.querySelector('.android-nav').getBoundingClientRect().top
            return [...document.querySelectorAll('.android-page-section button')].filter((button) => { const rect = button.getBoundingClientRect(); return button.checkVisibility() && rect.height > 0 && rect.top < innerHeight && rect.bottom > navTop + 1 }).map(button => ({ text: button.textContent, bottom: button.getBoundingClientRect().bottom, navTop, scroll: scrollY, height: document.documentElement.scrollHeight }))
          })
          assert.equal(covered.length, 0, `${section}/${theme}/${width} 页面末尾的操作不得被底部导航遮住：${JSON.stringify(covered)}`)
          await page.evaluate(() => window.scrollTo(0, 0))
          if (section === 'history') await page.waitForFunction(() => [...document.querySelectorAll('.android-history-list img')].filter((image) => image.getBoundingClientRect().top < innerHeight).every((image) => image.complete && image.naturalWidth > 0))
          await page.screenshot({ path: path.join(output, `${section}-${theme}-${width}-font2.png`) })
        }
      }
    }
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

/** 相对亮度对比度：与文档评审使用的口径一致（>=4.5 视为正文达标）。 */
function contrast(foreground, background) {
  const luminance = (color) => {
    const value = color.trim().startsWith('#') ? hexToRgb(color) : color.match(/\d+/g).slice(0, 3).map(Number)
    const [r, g, b] = value.map((channel) => {
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
