// 从 PC 已随包交付的目录生成安卓离线作品快照；不打包用户数据或数据库文件。
// 快照包含两部分：
//   1. 已发布作品的来源页（主来源 + 备选来源）：配置来源（如 yinghuadongman.org.cn）整站
//      不可用时，改用到公开搜索能命中、且详情页至少有一条可访问 HLS 线路的同名来源页；
//   2. 同一批作品在 PC 随包目录里已核验的公开 HLS 线路（`sanye_anime_episode.playback_url`）：
//      外站线路不可用或过慢时安卓直接回退这些已有线路，不必再等来源站往返。
const fs = require('node:fs')
const path = require('node:path')
const { resolveSource, safeUrl, snapshotSources } = require('./sourceCandidates.cjs')

const project = path.resolve(__dirname, '..')
const desktop = path.join(project, 'sanye_desktop', 'runtime')
const client = path.join(desktop, 'client')
const destination = path.join(project, 'sanye_client', 'src', 'platform', 'android')
const snapshotPath = path.join(destination, 'catalogSnapshot.ts')
const existingSources = fs.existsSync(snapshotPath) ? snapshotSources(fs.readFileSync(snapshotPath, 'utf8')) : new Map()
const sql = fs.readFileSync(path.join(desktop, 'seed.sql'), 'utf8')
const match = sql.match(/json_populate_recordset\(null::sanye_anime\.sanye_anime, '(\[[^\r\n]*\])'\)/)
if (!match) throw new Error('PC 随包作品目录格式已变化，不能生成安卓快照')
const rows = JSON.parse(match[1]).filter(item => item.status === '已发布' && item.source)
const episodeMatch = sql.match(/json_populate_recordset\(null::sanye_anime\.sanye_anime_episode, '(\[[^\r\n]*\])'\)/)
if (!episodeMatch) throw new Error('PC 随包选集格式已变化，不能生成安卓快照的已有线路')
const episodesByAnime = new Map()
for (const episode of JSON.parse(episodeMatch[1])) {
  const playbackUrl = String(episode.playback_url || '').trim()
  if (!/^https:\/\//i.test(playbackUrl)) continue
  const episodeNumber = Number(episode.episode_no) || 0
  const list = episodesByAnime.get(episode.anime_id) ?? []
  list.push({
    id: String(episode.id),
    episodeNumber,
    title: String(episode.title || '').trim() || `第 ${episodeNumber} 集`,
    playbackUrl,
    mimeType: String(episode.mime_type || '').trim()
      || (/\.m3u8(?:$|[^\w])/i.test(playbackUrl) ? 'application/vnd.apple.mpegurl' : 'video/mp4'),
  })
  episodesByAnime.set(episode.anime_id, list)
}
for (const list of episodesByAnime.values()) list.sort((left, right) => left.episodeNumber - right.episodeNumber || left.id.localeCompare(right.id))
const snapshotAt = rows.map(row => row.updated_at || row.published_at).sort().at(-1) || ''
const base = rows.map(row => {
  if (!safeUrl(row.source, undefined, true)) throw new Error(`作品 ${row.id} 的来源未适配`)
  const previous = existingSources.get(row.id)
  const retained = previous?.title === row.title ? previous : {}
  const coverPath = row.id === 127
    ? path.join(client, 'client-covers', 'your-name.jpg')
    : row.cover_url && path.resolve(client, '.' + row.cover_url.replaceAll('/', path.sep))
  if (coverPath && (!coverPath.startsWith(client + path.sep) || !fs.existsSync(coverPath))) {
    throw new Error(`作品 ${row.id} 的 PC 封面缺失，不能生成不完整快照`)
  }
  const ext = coverPath ? path.extname(coverPath).toLowerCase() : ''
  if (ext && !['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext)) throw new Error(`作品 ${row.id} 的封面格式不支持`)
  const lines = (episodesByAnime.get(row.id) ?? []).map(({ episodeNumber, ...line }) => line)
  return { ...retained, id: row.id, title: row.title, source: row.source, summary: row.summary || '',
    updateText: row.update_text || '', coverPath, coverName: coverPath ? `${row.id}${ext}` : null, lines }
})

async function main() {
  const prepared = []
  for (const row of base) prepared.push({ ...row, ...(await resolveSource(row)) })

  if (process.argv.includes('--check')) {
    process.stdout.write(JSON.stringify(prepared.map(({ id, title, sourceUrl, sourceUrls, switched }) => ({ id, title, sourceUrl, sourceUrls, switched })), null, 2) + '\n')
    return
  }

  const assets = path.join(destination, 'assets')
  fs.mkdirSync(assets, { recursive: true })
  for (const row of prepared) if (row.coverPath) fs.copyFileSync(row.coverPath, path.join(assets, row.coverName))
  const imports = prepared.filter(row => row.coverName).map(row => `import cover${row.id} from './assets/${row.coverName}'`).join('\n')
  const entries = prepared.map(row => `  { id: ${row.id}, title: ${JSON.stringify(row.title)}, sourceUrl: ${JSON.stringify(row.sourceUrl)}, sourceUrls: ${JSON.stringify(row.sourceUrls)}, lines: ${JSON.stringify(row.lines)}, summary: ${JSON.stringify(row.summary)}, updateText: ${JSON.stringify(row.updateText)}, coverUrl: ${row.coverName ? `cover${row.id}` : "''"} },`).join('\n')
  fs.writeFileSync(path.join(destination, 'catalogSnapshot.ts'), `// 从 PC 随包 seed.sql 生成的已发布作品快照（含已核验的公开 HLS 线路）；不可作为实时来源或观看成功证据。\n${imports}\n\nexport interface CatalogSnapshotLine { id: string; title: string; playbackUrl: string; mimeType: string }\nexport interface CatalogSnapshotItem { id: number; title: string; sourceUrl: string; sourceUrls: string[]; lines: CatalogSnapshotLine[]; summary: string; updateText: string; coverUrl: string }\nexport const catalogSnapshotAsOf = ${JSON.stringify(snapshotAt)}\nexport const catalogSnapshot: CatalogSnapshotItem[] = [\n${entries}\n]\n`)
  process.stdout.write(`已生成 ${prepared.length} 条已发布作品快照及 ${prepared.filter(row => row.coverName).length} 张封面\n`)
  for (const row of prepared) {
    process.stdout.write(`  ${row.id} ${row.source} -> ${row.sourceUrl}${row.sourceUrls.length > 1 ? `（另有 ${row.sourceUrls.length - 1} 条备选）` : ''}${row.lines.length ? `（已有线路 ${row.lines.length} 条）` : ''}${row.switched ? ' [已切换]' : ''}\n`)
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
