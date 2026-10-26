const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/searchVersions.ts'), 'utf8')
const scope = { exports: {}, URL, setTimeout, clearTimeout }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope)
const { groupSearchVersions, searchVersionKey, createSearchVersionChecks } = scope.exports

function hit(title, id, extra = {}) {
  return { title, sourceUrl: `https://site.example/work/${id}`, coverUrl: '', summary: '', sourceName: '站点', sourceContext: { content: '订阅甲', sourceIndex: 0 }, ...extra }
}
function episode(title, id, extra = {}) {
  return { title, id, sourceUrl: `https://site.example/episode/${id}`, playbackUrl: '', mimeType: '', ...extra }
}
function preview(episodes) { return { title: '作品', sourceUrl: '', coverUrl: '', summary: '', episodes } }
const empty = { playbackUrl: '', mimeType: '' }

test('统一标点字幕清晰度和相同季数字写法，保留季、上下部、Part、剧场版和 OAD 身份', () => {
  const titles = ['作品：第二季 [1080p]', '作品 第2季【中日字幕】', '作品 Season 02', '作品 S2', '作品 第一季', '作品 上部', '作品 下部', '作品 Part 1', '作品 Part 2', '作品 剧场版', '作品 OAD', '作品 OVA', '作品']
  const groups = groupSearchVersions(titles.map((title, index) => hit(title, index)))
  assert.equal(groups.length, 10)
  assert.equal(groups[0].versions.length, 4)
  assert.equal(groups[0].title, titles[0])
  assert.equal(groupSearchVersions([hit('作品 [BD] [中字]', 1), hit('作 品', 2)]).length, 1)
  assert.equal(groupSearchVersions([hit('作品 Part 01', 1), hit('作品 Part 1', 2)]).length, 1)
  assert.equal(groupSearchVersions([hit('作品1080p', 1), hit('作品中日字幕', 2)]).length, 1)
})

test('不同订阅、站点或来源索引不能合并，相同 URL 仍按原规则隔离', () => {
  const original = hit('作品', 1)
  const hits = [original, { ...original, sourceContext: { content: '订阅乙', sourceIndex: 0 } }, { ...original, sourceContext: { content: '订阅甲', sourceIndex: 1 } }, { ...original, sourceName: '其他站' }, { ...original, sourceUrl: 'https://other.example/work/1' }]
  assert.equal(groupSearchVersions(hits).length, 5)
  assert.equal(new Set(hits.map(searchVersionKey)).size, 5)
  const remaining = groupSearchVersions([original, hit('作品 高清', 2)], new Set([searchVersionKey(original)]))
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].sourceUrl, hits[0].sourceUrl.replace('/1', '/2'))
  assert.equal(groupSearchVersions([original, original])[0].versions.length, 1)
})

test('详情无选集才淘汰，使用作品原始来源上下文', async () => {
  const candidate = hit('作品', 1)
  let received
  let resolves = 0
  const results = []
  const checks = createSearchVersionChecks({ preview: async options => { received = options; return preview([]) }, resolve: async () => { resolves++; return empty }, onResult: result => results.push(result) })
  const [result] = await checks.enqueue([candidate])
  assert.equal(received.sourceContext.content, candidate.sourceContext.content)
  assert.equal(received.sourceContext.sourceIndex, candidate.sourceContext.sourceIndex)
  assert.equal(result.status, 'unsupported')
  assert.equal(result.reason, 'no-episodes')
  assert.equal(resolves, 0)
  assert.equal(checks.rejectedKeys.has(searchVersionKey(candidate)), true)
  assert.equal(results.length, 1)
  assert.equal(groupSearchVersions([candidate], checks.rejectedKeys).length, 0)
  checks.reset()
  assert.equal(checks.rejectedKeys.size, 0)
})

test('仅检查同集线路，全部明确不支持或空解析才淘汰', async () => {
  const candidate = hit('作品', 1)
  const used = []
  const context = { content: '原始选集规则', sourceIndex: 3 }
  const checks = createSearchVersionChecks({
    preview: async () => preview([episode('第01集', 'a'), episode('第2集', 'later'), episode('1', 'b', { sourceContext: context })]),
    resolve: async (url, received) => { used.push(url); if (url.endsWith('/b')) { assert.equal(received, context); throw { code: 'UNSUPPORTED_MEDIA' } } return empty },
  })
  const [result] = await checks.enqueue([candidate])
  assert.equal(result.status, 'unsupported')
  assert.equal(used.length, 2)
  assert.equal(used.some(url => url.endsWith('/later')), false)
})

test('直链和成功解析只报告 resolved，不等同实播通过且不拉取完整媒体', async () => {
  let resolves = 0
  const checks = createSearchVersionChecks({ preview: async () => preview([episode('1', 'a')]), resolve: async () => { resolves++; return { playbackUrl: 'https://media.example/a.m3u8', mimeType: '' } } })
  const [result] = await checks.enqueue([hit('作品', 1)])
  assert.equal(result.status, 'resolved')
  assert.equal(result.playbackVerified, false)
  assert.equal(resolves, 1)
  const direct = createSearchVersionChecks({ preview: async () => preview([episode('1', 'a', { playbackUrl: 'https://media.example/a.mp4' })]), resolve: async () => { throw Error('不应调用') } })
  assert.equal((await direct.enqueue([hit('作品', 2)]))[0].reason, 'direct-url')
})

test('网络、超时、嗅探失败和缺少解析上下文保持 unknown 并允许重试', async () => {
  for (const cause of [Error('网络错误'), Error('来源解析超时，请重试或选择其他线路')]) {
    let attempts = 0
    const checks = createSearchVersionChecks({ preview: async () => preview([episode('1', 'a')]), resolve: async () => { attempts++; throw cause } })
    assert.equal((await checks.enqueue([hit('作品', 1)]))[0].status, 'unknown')
    assert.equal(checks.rejectedKeys.size, 0)
    await checks.enqueue([hit('作品', 1)])
    assert.equal(attempts, 2)
  }
  const checks = createSearchVersionChecks({ preview: async () => preview([episode('1', 'a')]), resolve: async () => null })
  assert.equal((await checks.enqueue([hit('作品', 1)]))[0].status, 'unknown')
})

test('每作品最多三条同集线路，未检查的线路阻止永久淘汰', async () => {
  let calls = 0
  const checks = createSearchVersionChecks({ preview: async () => preview(['a', 'b', 'c', 'd'].map(id => episode('1', id))), resolve: async () => { calls++; return empty } })
  const [result] = await checks.enqueue([hit('作品', 1)])
  assert.equal(calls, 3)
  assert.equal(result.status, 'unknown')
  assert.equal(checks.rejectedKeys.size, 0)
})

test('最多两并发，取消队列并隔离旧代次的迟到详情结果', async () => {
  const pending = []
  const callbacks = []
  let active = 0
  let maximum = 0
  const checks = createSearchVersionChecks({
    preview: async () => { active++; maximum = Math.max(maximum, active); return new Promise(resolve => pending.push(value => { active--; resolve(value) })) },
    resolve: async () => { throw Error('取消后不应解析') },
    onResult: result => callbacks.push(result),
  })
  const old = checks.enqueue([hit('作品', 1), hit('作品', 2), hit('作品', 3)])
  assert.equal(pending.length, 2)
  checks.reset()
  const current = checks.enqueue([hit('新作品', 4)])
  pending.shift()(preview([]))
  pending.shift()(preview([]))
  await old
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(pending.length, 1)
  pending.shift()(preview([]))
  await current
  assert.equal(maximum, 2)
  assert.equal(callbacks.length, 1)
  assert.equal(callbacks[0].hit.title, '新作品')
  assert.equal(checks.rejectedKeys.size, 1)
})

test('解析完成后取消也不能污染新代次', async () => {
  let finish
  const callbacks = []
  const checks = createSearchVersionChecks({ preview: async () => preview([episode('1', 'a')]), resolve: async () => new Promise(resolve => { finish = resolve }), onResult: result => callbacks.push(result) })
  const operation = checks.enqueue([hit('作品', 1)])
  await new Promise(resolve => setImmediate(resolve))
  checks.cancel()
  finish(empty)
  await operation
  assert.equal(callbacks.length, 0)
  assert.equal(checks.rejectedKeys.size, 0)
})

test('详情永不返回时超时标记未知并释放队列，迟到结果不能淘汰', async () => {
  let late
  const callbacks = []
  const checks = createSearchVersionChecks({ timeoutMs: 15,
    preview: async ({ sourceUrl }) => sourceUrl.endsWith('/1') ? new Promise(resolve => { late = resolve }) : preview([]),
    resolve: async () => empty,
    onResult: result => callbacks.push(result),
  })
  const results = await checks.enqueue([hit('作品', 1), hit('作品', 2), hit('作品', 3)])
  assert.equal(results[0].status, 'unknown')
  assert.equal(results[1].status, 'unsupported')
  assert.equal(results[2].status, 'unsupported')
  late(preview([]))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(callbacks.length, 3)
  assert.equal(checks.rejectedKeys.has(searchVersionKey(hit('作品', 1))), false)
})

test('取消立即结束等待，但旧请求完成前不突破两并发', async () => {
  let finish
  const checks = createSearchVersionChecks({ preview: async () => new Promise(resolve => { finish = resolve }), resolve: async () => empty })
  const operation = checks.enqueue([hit('作品', 1)])
  checks.cancel()
  assert.equal((await operation).length, 0)
  finish(preview([]))
})

test('当前静态解析器明确拒绝的媒体版本从结果中剔除', async () => {
 const candidate=hit('作品',1);const checks=createSearchVersionChecks({preview:async()=>preview([episode('1','a')]),resolve:async()=>{throw Error('未找到静态媒体直链；此来源可能需要脚本、播放器嗅探或验证码，请保留选集并换线')}});assert.equal((await checks.enqueue([candidate]))[0].status,'unsupported');assert.equal(checks.rejectedKeys.has(searchVersionKey(candidate)),true)
})
