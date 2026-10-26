const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { resolveSource, rankCandidates, lineUrls, sourceUrls, snapshotSources, fetchText, lineReachable } = require('./sourceCandidates.cjs')
const primary = 'https://www.yhdmtv.cc/p/1/153/0'
const alternative = 'https://www.yhdmtv.cc/p/2/153/0'
const original = 'https://yinghuadongman.org.cn/p/3/'
const row = { title: '动漫 第一季', source: original, sourceUrl: primary, sourceUrls: [primary, alternative], lines: [] }
const card = (title, url = '/p/4/153/0') => `<div class="module-card-item"><a href="${url}"><div class="module-card-item-title"><strong>${title}</strong></div></a></div>`

test('离线及所有探测失败保留既有主来源、去重备选', async () => {
  for (const options of [{ offline: true }, { offline: false, fetchText: async () => { throw new Error('HTTP 522') } }]) {
    const result = await resolveSource(row, options)
    assert.equal(result.sourceUrl, primary)
    assert.deepEqual(result.sourceUrls, [primary, alternative, original])
  }
})

test('搜索缩短关键词仍按完整作品匹配，不跨季或混入 OAD', () => {
  const html = card('动漫 第一季') + card('动漫 第二季', '/p/5/') + card('动漫 第一季 OAD', '/p/6/')
  assert.deepEqual(rankCandidates(html, row.title), ['https://www.yhdmtv.cc/p/4/153/0'])
  assert.deepEqual(rankCandidates(html, '动漫'), [])
})

test('候选仅接受适配 HTTPS 数字详情路径，去重并拒绝凭据/端口/查询/外站', () => {
  assert.deepEqual(sourceUrls([primary, primary, 'https://user@www.yhdmtv.cc/p/1/', 'https://www.yhdmtv.cc:8443/p/1/', 'https://www.yhdmtv.cc/p/1/?url=evil', 'https://127.0.0.1/p/1/', 'https://www.yhdmtv.cc/p/../admin']), [primary])
})

test('损坏单条编码不会丢掉后续安全线路，不执行页面脚本', () => {
  const good = 'xxx' + Buffer.from('https://cdn.example.org/a.m3u8').toString('base64')
  const html = `temLineList=[{"file":"xxxJQ=="},{"file":"${good}"}]; globalThis.shouldNotRun=true`
  assert.deepEqual(lineUrls(html), ['https://cdn.example.org/a.m3u8'])
  assert.equal(globalThis.shouldNotRun, undefined)
})

test('更换主来源保留其余旧候选，短词命中续季不引入', async () => {
  const seen = []
  const result = await resolveSource(row, { offline: false, fetchText: async url => {
    seen.push(url)
    if (url.includes('search1')) return card('动漫 第二季')
    if (url === primary) throw new Error('timeout')
    return 'player_aaaa={"url":"https://cdn.example.org/a.m3u8"};'
  }, lineReachable: async () => true })
  assert.equal(result.sourceUrl, alternative)
  assert.deepEqual(result.sourceUrls, [alternative, primary, original])
  assert.equal(seen.some(url => url.endsWith('/p/4/153/0')), false)
})

test('来源正常时不依赖搜索，旧候选明确显示别季时不切换', async () => {
  const seen = []
  const result = await resolveSource(row, { offline: false, fetchText: async url => {
    seen.push(url)
    return `<h1>${url === primary ? '动漫 第二季' : row.title}</h1>player_aaaa={"url":"https://cdn.example.org/a.m3u8"};`
  }, lineReachable: async () => true })
  assert.equal(result.sourceUrl, alternative)
  assert.deepEqual(seen, [primary, alternative])
})

test('超时会中止请求，响应错误不会作为成功', async () => {
  const aborting = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }))
  await assert.rejects(fetchText(primary, 5, 1, aborting), /timeout/)
  assert.equal(await lineReachable('https://cdn.example.org/a.m3u8', 5, new Set(['cdn.example.org']), aborting), false)
  await assert.rejects(fetchText(primary, 5, 1, async () => ({ ok: false, status: 522 })), /522/)
})

test('健康探测只对明确主机执行 HEAD，不跟随重定向或读取正文', async () => {
  let calls = 0
  const fetcher = async (_url, options) => {
    calls++
    assert.equal(options.method, 'HEAD')
    assert.equal(options.redirect, 'error')
    return { status: 200, text: () => { throw new Error('不得读取媒体正文') } }
  }
  assert.equal(await lineReachable('https://cdn.example.org/a.m3u8', 5, new Set(['cdn.example.org']), fetcher), true)
  assert.equal(await lineReachable('https://evil.example/a', 5, new Set(['cdn.example.org']), fetcher), false)
  assert.equal(calls, 1)
  assert.equal(await lineReachable('https://cdn.example.org/a', 5, new Set(['cdn.example.org']), async () => ({ status: 302 })), false)
})

test('来源抓取禁止跨主机自动重定向及任意 URL', async () => {
  await assert.rejects(fetchText('https://evil.example/', 5, 1, async () => { throw new Error('不得访问') }), /未适配/)
  assert.equal(await fetchText(primary, 5, 1, async (_url, options) => {
    assert.equal(options.redirect, 'error')
    return { ok: true, text: async () => '页面' }
  }), '页面')
})

test('真实随包快照解析保持四个候选，不执行 TypeScript', () => {
  const text = fs.readFileSync(path.join(__dirname, '../sanye_client/src/platform/android/catalogSnapshot.ts'), 'utf8')
  const records = snapshotSources(text)
  assert.equal(records.get(127).sourceUrls.length, 4)
  assert.equal(records.get(127).title, '你的名字')
  assert.equal(snapshotSources('throw new Error("不能执行")').size, 0)
})
