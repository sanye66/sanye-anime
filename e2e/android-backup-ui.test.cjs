const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')
const clientRequire = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))

test('备份界面通过系统桥接保存，选文件仅预览，确认后恢复且取消无失败提示', { timeout: 60000 }, async () => {
  const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href)
  const server = await createServer({ root: path.resolve(__dirname, '../sanye_client'), configFile: false,
    cacheDir: path.resolve(__dirname, '../.runtime/android-backup-vite-cache'),
    resolve: { alias: { '@': path.resolve(__dirname, '../sanye_client/src') } },
    optimizeDeps: { entries: [] },
    plugins: [(await import(pathToFileURL(clientRequire.resolve('@vitejs/plugin-vue')).href)).default(), {
      name: 'backup-test-page',
      configureServer(vite) {
        vite.middlewares.use('/__backup', async (req, res) => {
          res.setHeader('Content-Type', 'text/html')
          res.end(await vite.transformIndexHtml('/__backup', '<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script type="module">import { createApp, h } from "vue"; import Backup from "/src/platform/android/androidBackup.vue"; createApp({render:()=>h(Backup,{onRestored:()=>window.__restored++})}).mount("#app");</script></body></html>'))
        })
      },
    }],
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    page.setDefaultTimeout(10000)
    await page.addInitScript(() => {
      window.__calls = []; window.__restored = 0; window.__cancel = false; window.__pending = null; window.__failComplete = false
      const content = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{ factoryId: 'web-selector', version: 1, arguments: { name: '来源', script: 'throw new Error("禁止执行")' } }] } })
      const personalData = { format: 'sanye-personal-data', version: 1, exportedAt: 10,
        savedMedia: [{ id: 8, title: '作品', url: 'https://example.org/video', coverUrl: '', summary: '', favorite: true, updatedAt: 10 }],
        watchHistory: [], settings: { theme: 'dark' } }
      window.__backup = { format: 'sanye-android-backup', version: 1, personalData,
        subscriptions: [{ url: 'https://example.org/sub.json', name: '来源', content, updatedAt: 10 }],
        sourceBindings: [{ key: 'saved:8', context: { content, sourceIndex: 0 } }] }
      localStorage.setItem('sanye:subscriptions:v1', JSON.stringify({ active: 'https://example.org/new.json', items: [{ url: 'https://example.org/new.json', name: '本机', content, updatedAt: 20 }] }))
      localStorage.setItem('sanye:android-source-bindings:v1', JSON.stringify({ rules: [content], entries: [['saved:8', 0, 0]] }))
      window.Capacitor = {
        getPlatform: () => 'android',
        PluginHeaders: [
          { name: 'SanyeCatalog', methods: ['exportPersonalData', 'validatePersonalData', 'importPersonalData', 'getRestoreState', 'completeRestore'].map(name => ({ name, rtype: 'promise' })) },
          { name: 'SanyeBackupFiles', methods: ['save', 'pick'].map(name => ({ name, rtype: 'promise' })) },
        ],
        nativePromise: async (plugin, method, options) => {
          window.__calls.push({ plugin, method, options })
          if (method === 'exportPersonalData') return { data: personalData }
          if (method === 'validatePersonalData') return { valid: true }
          if (method === 'getRestoreState') return { pending: window.__pending }
          if (method === 'completeRestore') {
            if (window.__failComplete) throw new Error('模拟收口失败')
            if (window.__pending?.token === options.token) window.__pending = null
            return {}
          }
          if (method === 'save') return { cancelled: window.__cancel }
          if (method === 'pick') return { cancelled: window.__cancel, content: JSON.stringify(window.__backup) }
          if (method === 'importPersonalData') {
            window.__pending = options.recovery
            return { savedMedia: 1, watchHistory: 0, settings: 1, savedIdMap: { 8: 21 }, restoredSavedIds: [21], restoredHistory: [] }
          }
          throw new Error('禁止其他原生操作')
        },
      }
    })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__backup`)
    await page.getByText('本机备份', { exact: true }).click()
    await page.getByRole('button', { name: '保存备份', exact: true }).click()
    await page.getByText('备份已保存到所选位置。', { exact: true }).waitFor()
    const exported = await page.evaluate(() => JSON.parse(window.__calls.find(call => call.method === 'save').options.content))
    assert.equal(exported.sourceBindings[0].key, 'saved:8')
    assert.ok(exported.subscriptions.some(item => item.url === 'https://example.org/new.json'), '本机订阅必须进入备份')
    assert.equal(new Set(exported.subscriptions.map(item => item.url)).size, exported.subscriptions.length, '自动预设与本机订阅不得重复')
    await page.getByRole('button', { name: '选择备份', exact: true }).click()
    await page.getByRole('button', { name: '确认恢复', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__calls.some(call => call.method === 'importPersonalData')), false)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '确认恢复', exact: true }).count(), 0)
    await page.getByRole('button', { name: '选择备份', exact: true }).click()
    await page.getByRole('button', { name: '确认恢复', exact: true }).click()
    await page.getByText('恢复完成：保存 1 条、历史 0 条。', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__restored), 1)
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sanye:subscriptions:v1')).active), 'https://example.org/new.json')
    const nativeImport = await page.evaluate(() => window.__calls.find(call => call.method === 'importPersonalData').options)
    assert.equal(nativeImport.data.savedMedia[0].sourceContext.sourceIndex, 0)
    assert.ok(nativeImport.recovery.token)
    assert.equal(await page.evaluate(() => window.__calls.filter(call => call.method === 'completeRestore').length), 1)
    await page.evaluate(() => { window.__cancel = true })
    await page.getByRole('button', { name: '选择备份', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('[role="status"]').length === 0)
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.equal(await page.getByRole('button', { name: '确认恢复', exact: true }).count(), 0)
    await page.getByRole('button', { name: '保存备份', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('[role="status"]').length === 0)
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.equal(await page.evaluate(() => window.__calls.filter(call => call.method === 'importPersonalData').length), 1)
    await page.evaluate(() => { window.__cancel = false; window.__failComplete = true })
    await page.getByRole('button', { name: '选择备份', exact: true }).click()
    await page.getByRole('button', { name: '确认恢复', exact: true }).click()
    await page.getByRole('button', { name: '重试未完成恢复', exact: true }).waitFor()
    assert.match(await page.getByRole('alert').textContent(), /日志已保留/)
    await page.screenshot({ path: path.resolve(__dirname, '../.runtime/android-backup-pending-ui.png') })
    await page.evaluate(() => { window.__failComplete = false })
    await page.getByRole('button', { name: '重试未完成恢复', exact: true }).click()
    await page.getByText('待完成恢复已收口，来源规则与订阅已恢复。', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '重试未完成恢复', exact: true }).count(), 0)
    assert.equal(await page.evaluate(() => window.__pending), null)
    await page.screenshot({ path: path.resolve(__dirname, '../.runtime/android-backup-ui.png') })
  } finally { await browser.close(); await server.close() }
})
