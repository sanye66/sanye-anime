const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { chromium } = require('playwright')
const clientRequire = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))
const ts = clientRequire('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/coverCache.ts'), 'utf8')
const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const { parse, compileScript } = clientRequire('vue/compiler-sfc')
const componentSource = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/androidCover.vue'), 'utf8')
const componentScript = compileScript(parse(componentSource).descriptor, { id: 'cover-cache-test', inlineTemplate: true }).content
const componentModule = ts.transpileModule(componentScript, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('from "vue"', 'from "/vue.js"').replaceAll("from 'vue'", "from '/vue.js'").replaceAll("from './coverCache'", "from '/cache.js'").replaceAll("import placeholderCover from './assets/anime-placeholder.svg';", 'const placeholderCover = "/placeholder.svg";')
const cacheModule = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR3sAAAAASUVORK5CYII=', 'base64')

test('失效代理的新浪封面直接安全读取原图，嵌套本地地址和其他代理不被改写', async () => {
  const server = createServer((_request, response) => response.end('<!doctype html>'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(code => { window.exports = {}; (0, eval)(code); window.coverCache = window.exports }, script)
    const requests = await page.evaluate(async data => {
      const calls = []
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, nativePromise: async (_, method, options) => { if (method === 'fetch') calls.push(options.url); return { mime: 'image/png', data } } }
      for (const url of ['https://images.weserv.nl/?url=https://lz.sinaimg.cn/a.jpg', 'https://images.weserv.nl/?url=https://127.0.0.1/a.jpg', 'https://images.weserv.nl/?url=https://other.example.org/a.jpg']) {
        const image = await window.coverCache.getCoverSource(url); image.release()
      }
      return calls
    }, png.toString('base64'))
    assert.deepEqual(requests, ['https://lz.sinaimg.cn/a.jpg', 'https://images.weserv.nl/?url=https://127.0.0.1/a.jpg', 'https://images.weserv.nl/?url=https://other.example.org/a.jpg'])
    const fallback = await page.evaluate(async () => {
      window.Capacitor.nativePromise = () => Promise.reject(new Error('封面下载失败'))
      const result = await window.coverCache.getCoverSource('https://covers.sanye-cdn.com/fallback.png')
      return result.src
    })
    assert.equal(fallback, 'https://covers.sanye-cdn.com/fallback.png', '原生下载失败后应让 WebView 尝试安全的原地址')
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})

test('原生首屏只下载一次，切换隔离旧结果并释放对象地址', async () => {
  const files = { '/vue.js': fs.readFileSync(clientRequire.resolve('vue/dist/vue.esm-browser.prod.js'), 'utf8'), '/component.js': componentModule, '/cache.js': cacheModule, '/placeholder.svg': fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/assets/anime-placeholder.svg')) }
  const server = createServer((request, response) => {
    response.setHeader('content-type', request.url === '/placeholder.svg' ? 'image/svg+xml' : files[request.url] ? 'text/javascript' : 'text/html')
    response.end(files[request.url] || '<!doctype html><div id="app"></div>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.route('https://covers.sanye-cdn.com/**', route => route.abort())
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(async data => {
      window.nativeJobs = {}
      window.nativeRequests = 0
      window.errors = 0
      window.released = 0
      window.browserRequests = 0
      window.fetch = () => { window.browserRequests++; throw new Error('原生环境不得先请求浏览器') }
      const revoke = URL.revokeObjectURL.bind(URL)
      URL.revokeObjectURL = value => { window.released++; revoke(value) }
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
        nativePromise: (_plugin, method, options) => method === 'fetch' ? new Promise(resolve => {
          window.nativeRequests++
          window.nativeJobs[options.url] = () => resolve({ mime: 'image/png', data })
        }) : Promise.resolve({}) }
      const { createApp, h, ref } = await import('/vue.js')
      const { default: Cover } = await import('/component.js')
      window.coverValue = ref('https://covers.sanye-cdn.com/old.png')
      window.app = createApp({ render: () => h(Cover, { src: window.coverValue.value, loading: 'eager', onError: event => { window.errors++; window.errorTarget = event.target?.tagName } }) })
      window.app.mount('#app')
    }, png.toString('base64'))
    await page.waitForFunction(() => !!window.nativeJobs['https://covers.sanye-cdn.com/old.png'] && document.querySelector('img').complete)
    assert.match(await page.locator('img').getAttribute('src'), /placeholder\.svg$/, '下载期间应先显示随包占位封面')
    await page.evaluate(() => { window.coverValue.value = 'https://covers.sanye-cdn.com/new.png' })
    await page.waitForFunction(() => !!window.nativeJobs['https://covers.sanye-cdn.com/new.png'])
    await page.evaluate(() => window.nativeJobs['https://covers.sanye-cdn.com/new.png']())
    await page.waitForFunction(() => document.querySelector('img').naturalWidth === 1)
    const current = await page.locator('img').getAttribute('src')
    assert.match(current, /^blob:/)
    assert.equal(await page.evaluate(() => window.browserRequests), 0)
    await page.evaluate(() => window.nativeJobs['https://covers.sanye-cdn.com/old.png']())
    await page.waitForFunction(async () => (await (await import('/cache.js')).getCoverCacheStats()).entries === 2)
    assert.equal(await page.locator('img').getAttribute('src'), current)
    assert.deepEqual(await page.evaluate(() => [window.nativeRequests, window.errors, window.released]), [2, 0, 1])
    await page.evaluate(() => {
      window.Capacitor.nativePromise = () => Promise.reject(new Error('封面下载失败'))
      window.coverValue.value = 'https://covers.sanye-cdn.com/rejected.png'
    })
    await page.waitForFunction(() => window.errors === 1)
    assert.deepEqual(await page.evaluate(() => [window.browserRequests, window.errorTarget]), [0, 'IMG'])
    assert.equal(await page.evaluate(() => { window.app.unmount(); return window.released }), 2)
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})

test('原生封面最多四路，清理取消并隔离活跃与排队结果', async () => {
  const server = createServer((_request, response) => response.end('<!doctype html>'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(code => { window.exports = {}; (0, eval)(code); window.coverCache = window.exports }, script)
    const result = await page.evaluate(async data => {
      let active = 0, maximum = 0, requests = 0, cancellations = 0
      const finish = []
      window.fetch = async () => { throw new Error('CORS') }
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
        nativePromise: (_plugin, method) => {
          if (method === 'cancelAll') { cancellations++; return Promise.resolve({}) }
          requests++; active++; maximum = Math.max(maximum, active)
          return new Promise(resolve => finish.push(() => { active--; resolve({ mime: 'image/png', data }) }))
        } }
      const jobs = [0, 1, 2, 3, 4, 5].map(index => window.coverCache.getCoverSource(`https://covers.sanye-cdn.com/${index}.png`))
      while (finish.length < 4) await new Promise(resolve => setTimeout(resolve, 5))
      await window.coverCache.clearCoverCache()
      finish.forEach(done => done())
      const sources = await Promise.all(jobs)
      const stats = await window.coverCache.getCoverCacheStats()
      return { maximum, requests, cancellations, cached: sources.filter(source => source.cached).length, entries: stats.entries }
    }, png.toString('base64'))
    assert.deepEqual(result, { maximum: 4, requests: 4, cancellations: 1, cached: 0, entries: 0 })
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})

test('可见封面先于后台预热下载，已排队的同地址也会提升优先级', async () => {
  const server = createServer((_request, response) => response.end('<!doctype html>'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(code => { window.exports = {}; (0, eval)(code); window.coverCache = window.exports }, script)
    const order = await page.evaluate(async data => {
      const finish = [], requests = []
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
        nativePromise: (_plugin, method, options) => method === 'fetch' ? new Promise(resolve => {
          requests.push(options.url.split('/').at(-1))
          finish.push(() => resolve({ mime: 'image/png', data }))
        }) : Promise.resolve({}) }
      const api = window.coverCache
      const url = name => `https://covers.sanye-cdn.com/${name}.png`
      const active = ['1', '2', '3', '4'].map(name => api.getCoverSource(url(name)))
      while (requests.length < 4) await new Promise(resolve => setTimeout(resolve, 0))
      api.startCoverCache(url('background'))
      api.startCoverCache(url('promoted'))
      const visible = api.getCoverSource(url('visible'))
      const promoted = api.getCoverSource(url('promoted'))
      // 缓存读取是异步的，先等所有候选进入下载等待队列。
      await new Promise(resolve => setTimeout(resolve, 50))
      for (let expected = 5; expected <= 7; expected++) {
        finish[expected - 5]()
        while (requests.length < expected) await new Promise(resolve => setTimeout(resolve, 0))
      }
      for (let index = 3; index < finish.length; index++) finish[index]()
      const results = await Promise.all([...active, visible, promoted])
      results.forEach(result => result.release())
      return requests
    }, png.toString('base64'))
    assert.deepEqual(order.slice(4), ['promoted.png', 'visible.png', 'background.png'])
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})

test('浏览器真实 Cache Storage 支持持久化、离线命中、去重、拒绝不安全输入与清理', async () => {
  const server = createServer((_request, response) => response.end('<!doctype html><title>封面缓存验证</title>'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const base = `http://127.0.0.1:${server.address().port}`
  let calls = 0
  await context.route('https://covers.sanye-cdn.com/**', async route => {
    calls++
    const url = route.request().url()
    // 路由填充会绕过浏览器跨域检查；用拒绝请求模拟 CORS 导致的 fetch 失败。
    if (/failure|cors/.test(url)) return route.abort()
    const body = url.includes('large') ? Buffer.alloc(2 * 1024 * 1024 + 1) : /svg|spoof/.test(url) ? '<svg/>' : png
    const headers = { 'content-type': url.includes('svg') ? 'image/svg+xml' : 'image/png', 'access-control-allow-origin': '*' }
    await route.fulfill({ status: 200, headers, body })
  })
  async function boot() {
    await page.goto(base)
    await page.evaluate(code => { window.exports = {}; (0, eval)(code); window.coverCache = window.exports }, script)
  }
  try {
    await boot()
    const result = await page.evaluate(async () => {
      const api = window.coverCache
      await api.clearCoverCache()
      const values = await Promise.all(Array.from({ length: 8 }, () => api.getCoverSource('https://covers.sanye-cdn.com/one.png')))
      const image = new Image()
      image.src = values[0].src
      await image.decode()
      const data = { cached: values.every(value => value.cached), separateUrls: new Set(values.map(value => value.src)).size, width: image.naturalWidth, stats: await api.getCoverCacheStats() }
      const url = values[0].src
      values.forEach(value => { value.release(); value.release() })
      try { await fetch(url); data.revoked = false } catch { data.revoked = true }
      return data
    })
    assert.equal(calls, 1)
    assert.equal(result.cached, true)
    assert.equal(result.separateUrls, 8)
    assert.equal(result.width, 1)
    assert.equal(result.revoked, true)
    assert.equal(result.stats.entries, 1)
    assert.equal(result.stats.bytes, png.length)
    await boot() // 模块与页面重新加载后，仍从浏览器持久存储命中。
    await context.setOffline(true)
    assert.equal(await page.evaluate(async () => { const value = await window.coverCache.getCoverSource('https://covers.sanye-cdn.com/one.png'); const image = new Image(); image.src = value.src; await image.decode(); value.release(); return value.cached }), true)
    assert.equal(calls, 1)
    await context.setOffline(false)
    const fallback = await page.evaluate(async () => {
      const api = window.coverCache
      const values = []
      for (const name of ['failure', 'svg', 'large', 'spoof', 'cors']) { const result = await api.getCoverSource(`https://covers.sanye-cdn.com/${name}`); values.push([result.cached, result.src]) }
      return { values, blocked: ['https://127.0.0.1/a', 'http://covers.sanye-cdn.com/a', 'https://foo.local/a', 'https://[::1]/a', 'https://user:password@covers.sanye-cdn.com/a', '//127.0.0.1/a', '/\\127.0.0.1/a'].map(url => api.displayableCoverUrl(url)), stats: await api.getCoverCacheStats() }
    })
    assert.deepEqual(fallback.values, ['failure', 'svg', 'large', 'spoof', 'cors'].map(name => [false, `https://covers.sanye-cdn.com/${name}`]))
    assert.deepEqual(fallback.blocked, ['', '', '', '', '', '', ''])
    assert.equal(fallback.stats.entries, 1)
    assert.equal(await page.evaluate(() => window.coverCache.clearCoverCache()), true)
    assert.equal((await page.evaluate(() => window.coverCache.getCoverCacheStats())).entries, 0)
    await context.unroute('https://covers.sanye-cdn.com/**')
    await context.setOffline(true)
    assert.equal(await page.evaluate(async () => (await window.coverCache.getCoverSource('https://covers.sanye-cdn.com/one.png')).cached), false)
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})

test('容量和条目限制会淘汰最早的封面，清理不会被在途请求重新写入', async () => {
  const server = createServer((_request, response) => response.end('<!doctype html>'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(code => { window.exports = {}; (0, eval)(code); window.coverCache = window.exports }, script)
    const result = await page.evaluate(async bytes => {
      const api = window.coverCache
      const image = new Uint8Array(bytes)
      api.COVER_CACHE_LIMITS.entries = 2
      api.COVER_CACHE_LIMITS.bytes = image.length * 2
      window.fetch = async () => new Response(image, { headers: { 'content-type': 'image/png' } })
      for (let i = 0; i < 3; i++) (await api.getCoverSource(`https://covers.sanye-cdn.com/${i}.png`)).release()
      await api.getCoverCacheStats()
      const cache = await caches.open(api.COVER_CACHE_NAME)
      const retained = (await cache.keys()).map(key => key.url)
      api.COVER_CACHE_LIMITS.bytes = image.length
      ;(await api.getCoverSource('https://covers.sanye-cdn.com/next.png')).release()
      const small = await api.getCoverCacheStats()
      let resolveFetch
      window.fetch = () => new Promise(resolve => { resolveFetch = resolve })
      const running = api.getCoverSource('https://covers.sanye-cdn.com/pending.png')
      while (!resolveFetch) await new Promise(resolve => setTimeout(resolve, 0))
      await api.clearCoverCache()
      resolveFetch(new Response(image, { headers: { 'content-type': 'image/png' } }))
      const old = await running
      return { retained, small, after: await api.getCoverCacheStats(), oldCached: old.cached }
    }, [...png])
    assert.deepEqual(result.retained, ['https://covers.sanye-cdn.com/1.png', 'https://covers.sanye-cdn.com/2.png'])
    assert.equal(result.small.entries, 1)
    assert.equal(result.small.bytes, png.length)
    assert.equal(result.after.entries, 0)
    assert.equal(result.oldCached, false)
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})

test('真实 Vue 组件屏外不拉取，保留图片属性、失败事件与卸载释放', async () => {
  const vue = fs.readFileSync(clientRequire.resolve('vue/dist/vue.esm-browser.prod.js'), 'utf8')
  const files = { '/vue.js': vue, '/component.js': componentModule, '/cache.js': cacheModule }
  const server = createServer((request, response) => {
    response.setHeader('content-type', files[request.url] ? 'text/javascript' : 'text/html')
    response.end(files[request.url] || '<!doctype html><div id="app"></div>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 400, height: 500 } })
  let calls = 0
  const delayed = []
  await page.route('https://covers.sanye-cdn.com/**', route => {
    calls++
    if (route.request().resourceType() === 'fetch' && route.request().url().includes('visible')) {
      delayed.push(() => route.fulfill({ headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' }, body: png }))
      return
    }
    return route.request().url().includes('failure') ? route.abort() : route.fulfill({ headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' }, body: png })
  })
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(async () => {
      const { createApp, h } = await import('/vue.js')
      const { default: Cover } = await import('/component.js')
      window.errors = 0
      window.released = 0
      window.releasedUrls = []
      const revoke = URL.revokeObjectURL.bind(URL)
      URL.revokeObjectURL = url => { window.released++; window.releasedUrls.push(url); revoke(url) }
      window.app = createApp({ render: () => h('div', { style: 'min-height:3000px' }, [
        h(Cover, { src: 'https://covers.sanye-cdn.com/visible.png', class: 'visible', loading: 'eager', fetchpriority: 'high', width: 90, height: 120, referrerpolicy: 'no-referrer', alt: '封面' }),
        h(Cover, { src: 'https://covers.sanye-cdn.com/failure.png', class: 'failure', onError: event => { window.errors++; event.target.src = '/fallback.png' } }),
        h(Cover, { src: 'https://covers.sanye-cdn.com/below.png', class: 'below', width: 90, height: 120, style: 'position:absolute;top:2500px' }),
      ]) })
      window.app.mount('#app')
    })
    await page.waitForFunction(() => document.querySelector('.visible').naturalWidth === 1 && window.errors > 0)
    assert.equal(await page.locator('.below').getAttribute('src'), null)
    const initialCalls = calls
    assert.ok(initialCalls >= 4 && initialCalls <= 5) // 失败原图最多增加一次有界恢复；未结束的请求复用。
    assert.equal(await page.locator('.visible').getAttribute('src'), 'https://covers.sanye-cdn.com/visible.png')
    assert.equal(delayed.length, 1)
    const attrs = await page.locator('.visible').evaluate(image => [image.getAttribute('loading'), image.getAttribute('fetchpriority'), image.width, image.height, image.getAttribute('referrerpolicy'), image.alt])
    assert.deepEqual(attrs, ['eager', 'high', 90, 120, 'no-referrer', '封面'])
    await delayed[0]()
    await page.locator('.below').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => document.querySelector('.below').naturalWidth === 1)
    await page.waitForFunction(async () => (await (await import('/cache.js')).getCoverCacheStats()).entries === 2)
    assert.equal(calls, initialCalls + 2)
    await page.evaluate(() => window.app.unmount())
    await page.evaluate(async () => {
      const { createApp, h } = await import('/vue.js')
      const { default: Cover } = await import('/component.js')
      window.app = createApp({ render: () => h('div', [
        h(Cover, { src: 'https://covers.sanye-cdn.com/visible.png', class: 'cached-one', loading: 'eager' }),
        h(Cover, { src: 'https://covers.sanye-cdn.com/below.png', class: 'cached-two', loading: 'eager' }),
      ]) })
      window.app.mount('#app')
    })
    await page.waitForFunction(() => ['.cached-one', '.cached-two'].every(selector => {
      const image = document.querySelector(selector)
      return image?.src.startsWith('blob:') && image.naturalWidth === 1
    }))
    assert.match(await page.locator('.cached-one').getAttribute('src'), /^blob:/)
    assert.equal(calls, initialCalls + 2) // 命中时不加载原地址，也不后台访问外站。
    const cachedUrls = await page.evaluate(() => [document.querySelector('.cached-one').src, document.querySelector('.cached-two').src])
    const releasedUrls = await page.evaluate(() => { window.app.unmount(); return window.releasedUrls })
    assert.ok(cachedUrls.every(url => releasedUrls.includes(url)), '缓存图片对象地址在卸载后必须释放')
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})

test('后台下载最多两路，去重且清理会中止活跃请求并隔离排队请求', async () => {
  const server = createServer((_request, response) => response.end('<!doctype html>'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(code => { window.exports = {}; (0, eval)(code); window.coverCache = window.exports }, script)
    const result = await page.evaluate(async bytes => {
      const api = window.coverCache
      const image = new Uint8Array(bytes)
      let active = 0, maximum = 0, requests = 0, aborted = 0
      const finish = []
      window.fetch = (_url, options) => new Promise((resolve, reject) => {
        requests++; active++; maximum = Math.max(maximum, active)
        options.signal.addEventListener('abort', () => { aborted++; active--; reject(new DOMException('中止', 'AbortError')) }, { once: true })
        finish.push(() => { active--; resolve(new Response(image, { headers: { 'content-type': 'image/png' } })) })
      })
      const first = 'https://covers.sanye-cdn.com/first.png'
      api.startCoverCache(first)
      api.startCoverCache(first)
      const jobs = [api.getCoverSource(first)]
      for (let i = 1; i < 7; i++) jobs.push(api.getCoverSource(`https://covers.sanye-cdn.com/${i}.png`))
      while (requests < 2) await new Promise(resolve => setTimeout(resolve, 0))
      const started = requests
      const peek = await api.peekCoverSource(first)
      finish[0]()
      while (requests < 3) await new Promise(resolve => setTimeout(resolve, 0))
      await api.clearCoverCache()
      const values = await Promise.all(jobs)
      values.forEach(value => value.release())
      return { maximum, started, requests, aborted, peek: { cached: peek.cached, src: peek.src }, stats: await api.getCoverCacheStats() }
    }, [...png])
    assert.equal(result.maximum, 2)
    assert.equal(result.started, 2)
    assert.equal(result.requests, 3)
    assert.equal(result.aborted, 2)
    assert.deepEqual(result.peek, { cached: false, src: 'https://covers.sanye-cdn.com/first.png' })
    assert.equal(result.stats.entries, 0)
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})

test('图片显示不等待持久化扫描，同地址复用下载且原生失败保留安全图片地址', async () => {
  const server = createServer((_request, response) => response.end('<!doctype html>'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.evaluate(code => { window.exports = {}; (0, eval)(code); window.coverCache = window.exports }, script)
    const result = await page.evaluate(async data => {
      const api = window.coverCache
      let requests = 0, browserRequests = 0, finishWrite
      const cache = await caches.open(api.COVER_CACHE_NAME)
      const put = cache.put.bind(cache)
      cache.put = (...args) => new Promise(resolve => { finishWrite = async () => { await put(...args); resolve() } })
      const open = caches.open.bind(caches)
      caches.open = name => name === api.COVER_CACHE_NAME ? Promise.resolve(cache) : open(name)
      window.fetch = () => { browserRequests++; throw new Error('浏览器请求不可用') }
      window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true,
        nativePromise: (_plugin, method) => { requests++; return method === 'fetch' ? Promise.resolve({ mime: 'image/png', data }) : Promise.resolve({}) } }
      const url = 'https://covers.sanye-cdn.com/ready.png'
      const first = await api.getCoverSource(url)
      while (!finishWrite) await new Promise(resolve => setTimeout(resolve, 0))
      const second = await api.getCoverSource(url)
      const cached = [first.cached, second.cached]
      first.release(); second.release()
      await finishWrite()
      await api.getCoverCacheStats()
      window.Capacitor.nativePromise = () => { requests++; return Promise.reject(new Error('原生安全检查拒绝')) }
      const rejected = await api.getCoverSource('https://covers.sanye-cdn.com/rejected.png')
      return { cached, requests, browserRequests, rejectedSrc: rejected.src }
    }, png.toString('base64'))
    assert.deepEqual(result, { cached: [true, true], requests: 2, browserRequests: 0, rejectedSrc: 'https://covers.sanye-cdn.com/rejected.png' })
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
})
