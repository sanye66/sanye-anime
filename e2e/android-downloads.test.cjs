const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { createServer } = require('node:http')
const { chromium } = require('playwright')
const clientRequire = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))
const ts = clientRequire('typescript')
const { parse, compileScript } = clientRequire('vue/compiler-sfc')
const root = path.resolve(__dirname, '../sanye_client')
const bridgeSource = fs.readFileSync(path.join(root, 'src/platform/android/downloads.ts'), 'utf8')
const componentSource = fs.readFileSync(path.join(root, 'src/platform/android/androidDownloads.vue'), 'utf8')

test('非原生预览拒绝下载，格式校验与删除确认不调用桥接', async () => {
  let calls = 0
  const native = new Proxy({}, { get: () => async () => { calls++; throw new Error('不应调用') } })
  function load(available) {
    const scope = {
      exports: {}, URL, Error,
      require: () => ({ Capacitor: { isNativePlatform: () => available, isPluginAvailable: () => available }, registerPlugin: () => native }),
      fetch: () => { throw new Error('不应使用浏览器下载') },
    }
    vm.runInNewContext(ts.transpileModule(bridgeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
    return scope.exports
  }
  await assert.rejects(load(false).androidDownloads.enqueue('https://cdn.sanye.org/a.mp4', '视频'), /已安装的安卓/)
  const available = load(true)
  for (const url of ['http://cdn.sanye.org/a.mp4', 'https://cdn.sanye.org/a.m3u8', 'https://cdn.sanye.org/a.mpd', 'https://user:secret@cdn.sanye.org/a.mp4']) {
    await assert.rejects(available.androidDownloads.enqueue(url, '视频'), /HTTPS MP4/)
  }
  await assert.rejects(available.androidDownloads.remove('one', false), /确认删除/)
  assert.equal(calls, 0)
})

test('原生桥接全部操作在十秒挂起后回错，超时恢复请求不会重复启动服务', async () => {
  const timers = new Map()
  let timerId = 0
  const calls = []
  const scope = {
    exports: {}, URL, Error,
    setTimeout: (callback, milliseconds) => { assert.equal(milliseconds, 10_000); timers.set(++timerId, callback); return timerId },
    clearTimeout: id => timers.delete(id),
    require: () => ({
      Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
      registerPlugin: () => new Proxy({}, { get: (_target, method) => () => { calls.push(method); return new Promise(() => {}) } }),
    }),
  }
  vm.runInNewContext(ts.transpileModule(bridgeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  const api = scope.exports.androidDownloads
  const waiting = [api.list(), api.resume(), api.resume(), api.enqueue('https://cdn.sanye.org/a.mp4', '视频'),
    api.cancel('one'), api.retry('one'), api.remove('one', true), api.play('one')]
  const settled = Promise.allSettled(waiting)
  for (const callback of [...timers.values()]) callback()
  assert.equal((await settled).filter(result => result.status === 'rejected' && /超时/.test(result.reason.message)).length, waiting.length)
  assert.equal(calls.filter(method => method === 'resume').length, 1)
  await assert.rejects(api.resume(), /恢复下载超时/)
  assert.equal(calls.filter(method => method === 'resume').length, 1)
})

test('离线观看进度通过独立下载接口保存，恢复字段透传且拒绝非有限数值', async () => {
  const calls = []
  const scope = {
    exports: {}, URL, Error, setTimeout, clearTimeout,
    require: () => ({
      Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true, convertFileSrc: path => `local:${path}` },
      registerPlugin: () => ({
        play: async ({ id }) => ({ id, path: 'file:///data/private/video.mp4', title: '离线视频', position: 12.5, duration: 100, mimeType: 'video/mp4' }),
        recordProgress: async options => { calls.push(options) },
      }),
    }),
  }
  vm.runInNewContext(ts.transpileModule(bridgeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  const api = scope.exports.androidDownloads
  const item = await api.play('download-id')
  assert.equal(item.id, 'download-id'); assert.equal(item.position, 12.5); assert.equal(item.duration, 100); assert.equal(item.mimeType, 'video/mp4')
  await api.recordProgress(item.id, 20, 100)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ id: 'download-id', position: 20, duration: 100 }])
  for (const position of [NaN, Infinity, -1, 101]) await assert.rejects(api.recordProgress(item.id, position, 100), /进度无效/)
  assert.equal(calls.length, 1)
})

test('并发恢复共用原生请求，成功后重复挂载只读取列表', async () => {
  let finish
  let resumes = 0
  let lists = 0
  const snapshot = { items: [], usedBytes: 0, maxStorageBytes: 2147483648, maxFileBytes: 536870912 }
  const scope = {
    exports: {}, URL, Error, setTimeout, clearTimeout,
    require: () => ({
      Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
      registerPlugin: () => ({ resume: () => { resumes++; return new Promise(resolve => { finish = resolve }) }, list: async () => { lists++; return snapshot } }),
    }),
  }
  vm.runInNewContext(ts.transpileModule(bridgeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  const api = scope.exports.androidDownloads
  const waiting = [api.resume(), api.resume(), api.resume()]
  assert.equal(resumes, 1)
  finish(snapshot)
  assert.deepEqual(await Promise.all(waiting), [snapshot, snapshot, snapshot])
  await api.resume(); await api.resume()
  assert.equal(resumes, 1)
  assert.equal(lists, 2)
})

test('运行组件显示真实桥接状态，可取消重试，错误可见，确认删除及本地播放地址正确', async () => {
  const componentScript = compileScript(parse(componentSource).descriptor, { id: 'android-downloads', inlineTemplate: true }).content
  const componentModule = ts.transpileModule(componentScript, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replaceAll('from "vue"', 'from "/vue.js"').replaceAll("from 'vue'", "from '/vue.js'")
    .replaceAll("from './downloads'", "from '/downloads.js'")
  const bridgeModule = ts.transpileModule(bridgeSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replaceAll("from '@capacitor/core'", "from '/capacitor.js'")
  const capacitorModule = `
    export const Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, convertFileSrc: path => 'http://localhost/_capacitor_file_' + path.slice(7) };
    export const registerPlugin = () => new Proxy({}, { get: (_target, method) => (...args) => window.downloadBridge[method](...args) });
  `
  const entry = `<!doctype html><meta charset="utf-8"><div id="app"></div><output id="played"></output><script type="module">
    import { createApp } from '/vue.js'; import Downloads from '/component.js';
    window.calls = []; window.items = [
      { id: 'running', title: '下载中的视频', state: 'downloading', bytes: 524288, total: 1048576, error: '', createdAt: 1 },
      { id: 'finished', title: '本地视频', state: 'completed', bytes: 1048576, total: 1048576, error: '', createdAt: 2 },
      { id: 'failed', title: '失败的视频', state: 'failed', bytes: 0, total: 0, error: '文件不完整，请重试', createdAt: 3 }
    ];
    const snapshot = () => structuredClone({ items: window.items, usedBytes: 1572864, maxStorageBytes: 2147483648, maxFileBytes: 536870912 });
    window.downloadBridge = {
      list: async () => snapshot(), resume: async () => { window.calls.push(['resume']); return snapshot(); },
      enqueue: async options => { window.calls.push(['enqueue', options]); throw new Error('下载服务启动失败，请重试'); },
      cancel: async ({id}) => { window.calls.push(['cancel', id]); window.items.find(item => item.id === id).state = 'cancelled'; return snapshot(); },
      retry: async ({id}) => { window.calls.push(['retry', id]); window.items.find(item => item.id === id).state = 'queued'; return snapshot(); },
      remove: async options => { window.calls.push(['remove', options]); window.items = window.items.filter(item => item.id !== options.id); return snapshot(); },
      play: async ({id}) => { window.calls.push(['play', id]); return { path: 'file:///data/user/0/com.sanye.sanye_anime/files/sanye_downloads/one.mp4', title: '本地视频' }; }
    };
    window.mountDownloads = () => {
      window.downloadApp = createApp(Downloads, { onPlay: value => { window.played = value; document.querySelector('#played').textContent = value.title; } });
      window.downloadApp.mount('#app');
    };
    window.mountDownloads();
  </script>`
  const server = createServer((request, response) => {
    const resources = { '/component.js': componentModule, '/downloads.js': bridgeModule, '/capacitor.js': capacitorModule,
      '/vue.js': fs.readFileSync(path.join(root, 'node_modules/vue/dist/vue.esm-browser.js'), 'utf8') }
    response.setHeader('Content-Type', request.url in resources ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8')
    response.end(resources[request.url] || entry)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.locator('summary').click()
    const running = page.locator('li').filter({ hasText: '下载中的视频' })
    await running.getByRole('button', { name: '取消下载' }).waitFor()
    assert.equal(await running.locator('progress').getAttribute('value'), '524288')
    await running.getByRole('button', { name: '取消下载' }).click()
    await running.getByRole('button', { name: '重新下载' }).waitFor()
    assert.match(await running.innerText(), /已取消/)
    await running.getByRole('button', { name: '重新下载' }).click()
    await running.getByRole('button', { name: '取消下载' }).waitFor()
    assert.match(await running.innerText(), /排队中/)
    const completed = page.locator('li').filter({ hasText: '本地视频' })
    await completed.getByRole('button', { name: '离线播放' }).click()
    await page.waitForFunction(() => Boolean(window.played))
    assert.deepEqual(await page.evaluate(() => window.played), {
      id: 'finished', position: 0, duration: 0, mimeType: 'video/mp4',
      url: 'http://localhost/_capacitor_file_/data/user/0/com.sanye.sanye_anime/files/sanye_downloads/one.mp4', title: '本地视频',
      nativeUrl: 'file:///data/user/0/com.sanye.sanye_anime/files/sanye_downloads/one.mp4',
    })
    const failed = page.locator('li').filter({ hasText: '失败的视频' })
    assert.match(await failed.innerText(), /文件不完整/)
    await failed.getByRole('button', { name: '删除下载' }).click()
    assert.equal(await page.evaluate(() => window.calls.filter(call => call[0] === 'remove').length), 0)
    await failed.getByRole('button', { name: '保留', exact: true }).click()
    await failed.getByRole('button', { name: '删除下载' }).click()
    await failed.getByRole('button', { name: '确认删除', exact: true }).click()
    await page.waitForFunction(() => window.items.length === 2)
    assert.equal((await page.evaluate(() => window.calls.find(call => call[0] === 'remove')))[1].confirmed, true)
    await page.getByLabel('下载名称', { exact: true }).fill('新视频')
    await page.getByLabel('MP4 直链', { exact: true }).fill('https://cdn.sanye.org/a.m3u8')
    await page.getByRole('button', { name: '加入下载队列' }).click()
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /暂不支持 HLS/)
    assert.equal(await page.evaluate(() => window.calls.filter(call => call[0] === 'enqueue').length), 0)
    await page.getByLabel('MP4 直链', { exact: true }).fill('https://cdn.sanye.org/a.mp4')
    await page.getByRole('button', { name: '加入下载队列' }).click()
    await page.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('下载服务启动失败'))
    await page.clock.install()
    await page.evaluate(() => { window.downloadBridge.enqueue = () => new Promise(() => {}) })
    await page.getByRole('button', { name: '加入下载队列' }).click()
    assert.equal(await page.getByRole('button', { name: '处理中…' }).isDisabled(), true)
    await page.clock.fastForward(10_001)
    await page.getByRole('button', { name: '加入下载队列' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '加入下载队列' }).isEnabled(), true)
    assert.match(await page.getByRole('alert').innerText(), /超时/)
    await page.evaluate(() => {
      window.played = null
      window.downloadBridge.play = () => new Promise(resolve => { window.finishDelayedPlay = resolve })
    })
    await completed.getByRole('button', { name: '离线播放' }).click()
    await page.waitForFunction(() => Boolean(window.finishDelayedPlay))
    await page.evaluate(async () => {
      window.downloadApp.unmount()
      window.finishDelayedPlay({ path: 'file:///data/user/0/com.sanye.sanye_anime/files/sanye_downloads/one.mp4', title: '迟到播放' })
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    })
    assert.equal(await page.evaluate(() => window.played), null)
    await page.evaluate(() => window.mountDownloads())
    await page.locator('summary').waitFor()
    assert.equal(await page.evaluate(() => window.calls.filter(call => call[0] === 'resume').length), 1)
    assert.equal(errors.length, 0, errors.join('\n'))
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
