const { test } = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const { rankCandidates, lineUrls, searchKeywords } = require('../sanye_android/sourceCandidates.cjs')

const root = path.resolve(__dirname, '..')
// `sanye_desktop/runtime/**` 被 .gitignore 忽略（约 548MB，含 PostgreSQL 模板、Java 运行时与
// seed.sql，需要本地执行 `pnpm desktop:prepare`）：CI 的干净检出没有 seed.sql，此前顶层
// `readFileSync` 直接 ENOENT，整个文件失败。现在依赖 seed 的两项按守卫跳过，只比对
// catalogSnapshot.ts 与来源候选逻辑的那项照常执行。
const seedPath = path.join(root, 'sanye_desktop/runtime/seed.sql')
const seed = existsSync(seedPath) ? readFileSync(seedPath, 'utf8') : ''
const catalogMatch = seed.match(/json_populate_recordset\(null::sanye_anime\.sanye_anime, '(\[[^\r\n]*\])'\)/)
const published = catalogMatch ? JSON.parse(catalogMatch[1]).filter((item) => item.status === '已发布' && item.source) : []
const snapshot = readFileSync(path.join(root, 'sanye_client/src/platform/android/catalogSnapshot.ts'), 'utf8')

test('安卓随包目录只取 PC 已发布作品，来源候选都在白名单内', { skip: !seed }, () => {
  assert.equal((snapshot.match(/\{ id: \d+, title:/g) || []).length, published.length)
  for (const item of published) {
    assert.ok(snapshot.includes(`{ id: ${item.id}, title: ${JSON.stringify(item.title)}, sourceUrl:`), `缺少作品 ${item.id}`)
  }
  // 主来源与备选来源必须都是白名单 HTTPS 地址，且主来源排在第一位。
  const allowed = new Set(['yhdmtv.cc', 'www.yhdmtv.cc', 'yinghuadongman.org.cn', 'www.yinghuadongman.org.cn'])
  const entries = [...snapshot.matchAll(/sourceUrl: "([^"]+)", sourceUrls: (\[[^\]]*\])/g)]
  assert.equal(entries.length, published.length)
  for (const [, sourceUrl, raw] of entries) {
    const urls = JSON.parse(raw)
    assert.equal(urls[0], sourceUrl, 'sourceUrls 第一位必须是主来源')
    assert.ok(urls.length >= 1 && urls.length <= 4, `来源候选数量应在 1-4：${urls.length}`)
    for (const url of urls) {
      const parsed = new URL(url)
      assert.equal(parsed.protocol, 'https:')
      assert.ok(allowed.has(parsed.hostname), `来源不在白名单：${url}`)
    }
  }
})

test('随包已有线路与 PC 随包选集逐条一致，可直接起播', { skip: !seed }, () => {
  const episodeMatch = seed.match(/json_populate_recordset\(null::sanye_anime\.sanye_anime_episode, '(\[[^\r\n]*\])'\)/)
  assert.ok(episodeMatch, 'PC 随包选集格式已变化')
  const episodes = JSON.parse(episodeMatch[1])
  const entries = [...snapshot.matchAll(/\{ id: (\d+), title: .*?lines: (\[[^\]]*\]), summary:/g)]
  assert.equal(entries.length, published.length, '每个随包作品都要有已有线路字段')
  for (const [, id, raw] of entries) {
    const expected = episodes
      .filter((episode) => episode.anime_id === Number(id) && /^https:\/\//i.test(episode.playback_url ?? ''))
      .sort((left, right) => left.episode_no - right.episode_no || String(left.id).localeCompare(String(right.id)))
    const lines = JSON.parse(raw)
    assert.deepEqual(lines.map((line) => line.id), expected.map((episode) => String(episode.id)),
      `作品 ${id} 的已有线路与 PC 随包选集不一致`)
    assert.deepEqual(lines.map((line) => line.playbackUrl), expected.map((episode) => episode.playback_url),
      `作品 ${id} 的已有线路地址与 PC 随包选集不一致`)
    for (const line of lines) {
      assert.match(line.playbackUrl, /^https:\/\//, `已有线路必须是 HTTPS：${line.playbackUrl}`)
      assert.ok(line.title.length > 0, `已有线路缺少标题：${line.id}`)
      assert.match(line.mimeType, /(?:mpegurl|mp4)/, `已有线路缺少可播类型：${line.mimeType}`)
    }
  }
  // 《你的名字》这类来源线路经常失效的作品必须自带可直接起播的 HLS 线路。
  const yourName = entries.find(([, id]) => id === '127')?.[2] ?? ''
  assert.ok(yourName.includes('.m3u8'), `随包《你的名字》缺少可起播线路：${yourName}`)
})

test('随包来源挑选只接受同名候选并跳过占位线路', () => {
  const html = `
    <div class="module-card-item module-item"><div class="module-card-item-title"><a href="/v/1/1"><strong>无关作品</strong></a></div>
      <div class="module-card-item-footer"><a href="/p/9999/1/0" class="play-btn">播放</a></div></div>
    <div class="module-card-item module-item"><div class="module-card-item-title"><a href="/v/2/2"><strong>你的名字。</strong></a></div>
      <div class="module-card-item-footer"><a href="/p/7880/155/0" class="play-btn">播放</a></div></div>
    <div class="module-card-item module-item"><div class="module-card-item-title"><a href="/v/3/3"><strong>你的名字</strong></a></div>
      <div class="module-card-item-footer"><a href="/p/65395/153/0" class="play-btn">播放</a></div></div>`
  const ranked = rankCandidates(html, '你的名字')
  assert.equal(ranked.length, 2, `只保留同名候选：${ranked.join(',')}`)
  assert.ok(ranked.every(url => !url.includes('/p/9999/1/0')))
  assert.deepEqual(searchKeywords('无职转生Ⅲ 到了异世界就拿出真本事 第三季').slice(0, 2),
    ['无职转生Ⅲ 到了异世界就拿出真本事 第三季', '无职转生Ⅲ'])

  const encoded = Buffer.from('https://example.com/index.m3u8').toString('base64')
  const lines = lineUrls(`<script>var player_aaaa={"url":"https:\\/\\/example.com/direct.m3u8"};</script>
    <script>var temLineList=[{"id":1,"name":"HD国语","file":"abc${encoded}"}];</script>`)
  assert.deepEqual(lines, ['https://example.com/direct.m3u8', 'https://example.com/index.m3u8'])
})
