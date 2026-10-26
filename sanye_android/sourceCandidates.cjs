/**
 * 安卓随包目录的来源挑选。
 *
 * 背景：随包作品原先固定指向 `yinghuadongman.org.cn`，该站整站不可用（HTTP 522）时，
 * 首页推荐与详情全部报“来源页暂无法预览”，而同一个作品在 `yhdmtv.cc` 上是可用的。
 * 这里在生成快照时做一次挑选：
 *   1. 先保留已生成快照的主来源和备选；能解析出可探测线路时继续用它；
 *   2. 否则按标题在公开搜索里取同名 `/p/` 候选，逐个探测详情页线路；
 *   3. 第一个通过探测的候选作为主来源，其余候选作为备选一并写入快照。
 * 探测只读取适配公开页面与随包线路主机的响应头，不下载媒体内容；离线
 * （`SANYE_ANDROID_CATALOG_OFFLINE=1`）或全部探测失败时保留既有候选。
 */

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/127 Mobile Safari/537.36'
const SEARCH_BASE = 'https://www.yhdmtv.cc/public/auto/search1.html?keyword='
const MAX_CANDIDATES = 4
const OFFLINE = process.env.SANYE_ANDROID_CATALOG_OFFLINE === '1'
const SOURCE_HOSTS = new Set(['yinghuadongman.org.cn', 'www.yinghuadongman.org.cn', 'yhdmtv.cc', 'www.yhdmtv.cc'])

function safeUrl(value, hosts = SOURCE_HOSTS, detail = false) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || !hosts.has(url.hostname) || (detail && (url.search || !/^\/p\/\d+(?:\/\d+){0,2}\/?$/.test(url.pathname)))) return null
    return url.toString()
  } catch { return null }
}

function sourceUrls(values) {
  return [...new Set(values.map(value => safeUrl(value, SOURCE_HOSTS, true)).filter(Boolean))]
}

/** 只解析生成器写出的 JSON 字段，不执行快照中的 TypeScript 或其他脚本。 */
function snapshotSources(text) {
  const records = new Map()
  const pattern = /^\s*\{ id: (\d+), title: ("(?:\\.|[^"\\])*"), sourceUrl: ("(?:\\.|[^"\\])*"), sourceUrls: (\[[^\r\n]*?\]), lines:/gm
  for (const match of String(text).matchAll(pattern)) {
    try {
      records.set(Number(match[1]), { title: JSON.parse(match[2]), sourceUrl: JSON.parse(match[3]), sourceUrls: sourceUrls(JSON.parse(match[4])) })
    } catch { /* 损坏的记录不作为可信候选 */ }
  }
  return records
}

function normalizeTitle(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

async function fetchText(url, timeoutMs = 8000, attempts = 1, fetcher = fetch) {
  if (!safeUrl(url)) throw new Error('来源地址未适配')
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetcher(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal, redirect: 'error' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

/** 只探测已随包线路主机的响应头，不读取或下载视频正文，也不跟随跳转。 */
async function lineReachable(url, timeoutMs = 5000, hosts = new Set(), fetcher = fetch) {
  if (!safeUrl(url, hosts)) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, {
      method: 'HEAD', redirect: 'error', headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })
    return response.status >= 200 && response.status < 300
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** 搜索页里与本作品完整同名的 `/p/` 候选；保持来源页顺序。 */
function rankCandidates(html, title) {
  const key = normalizeTitle(title)
  if (!key) return []
  const scored = new Map()
  // 只按卡片容器切分：`module-card-item-title` / `-footer` / `-class` 也是同类名，必须排除。
  for (const block of String(html).split(/<div class="module-card-item(?![\w-])/).slice(1)) {
    const play = block.match(/href="(\/p\/[^"]+)"/)?.[1]
    if (!play) continue
    const rawTitle = block.match(/<div class="module-card-item-title">[\s\S]*?<strong>\s*([\s\S]*?)\s*<\/strong>/)?.[1]
      ?? block.match(/alt="([^"]*)"/)?.[1] ?? ''
    const name = rawTitle.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim()
    const candidateKey = normalizeTitle(name)
    // 检索词可缩短，作品匹配不能缩短；禁止将第一季、续季或 OAD 混作同一部作品。
    if (!candidateKey || candidateKey !== key) continue
    const rank = 0
    const url = safeUrl(new URL(play, 'https://www.yhdmtv.cc').toString(), SOURCE_HOSTS, true)
    if (!url) continue
    if (!scored.has(url) || scored.get(url) > rank) scored.set(url, rank)
  }
  return [...scored].sort((left, right) => left[1] - right[1]).map(([url]) => url)
}

/** 详情页公开声明的播放地址：`player_aaaa.url` 与 `temLineList[].file`（去掉三字符前缀的 Base64）。 */
function lineUrls(html) {
  const text = String(html)
  const urls = []
  const player = text.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;?/)
  if (player) {
    const url = player[1].match(/["']?url["']?\s*:\s*["']([^"']+)["']/)?.[1]
    if (url) urls.push(url.replaceAll('\\/', '/'))
  }
  const lineListIndex = text.indexOf('temLineList')
  if (lineListIndex >= 0) {
    const start = text.indexOf('[', text.indexOf('=', lineListIndex + 11))
    if (start >= 0) {
      let depth = 0
      let quote = null
      let escaped = false
      let end = -1
      for (let index = start; index < text.length; index += 1) {
        const char = text[index]
        if (quote) {
          if (escaped) escaped = false
          else if (char === '\\') escaped = true
          else if (char === quote) quote = null
          continue
        }
        if (char === '"' || char === "'") quote = char
        else if (char === '[') depth += 1
        else if (char === ']' && --depth === 0) { end = index; break }
      }
      if (end > start) {
        try {
          for (const entry of JSON.parse(text.slice(start, end + 1))) {
            try {
              const encoded = String(entry?.file ?? '')
              if (encoded.length <= 3) continue
              const decoded = Buffer.from(encoded.slice(3), 'base64').toString('utf8')
              const url = decodeURIComponent(decoded)
              if (url) urls.push(url)
            } catch { /* 单条损坏编码不丢弃后续有效线路 */ }
          }
        } catch { /* 单个数组解析失败不影响其他来源 */ }
      }
    }
  }
  return [...new Set(urls)].filter(url => /^https:\/\//i.test(url))
}

/** 标题可能很长，补一组更短的检索词，避免整句标题在来源站搜不到。 */
function searchKeywords(title) {
  const words = [title, String(title).split(/[：:（(·～\s]/)[0], String(title).replace(/[（(][^)）]*[)）]/g, '')]
  return [...new Set(words.map(word => word.trim()).filter(word => normalizeTitle(word).length >= 2))]
}

/**
 * 为一条随包作品挑选来源：返回主来源、备选来源与是否发生切换。
 * 探测失败或离线时保留既有来源，避免一次网络故障擦掉已积累的备选。
 */
async function resolveSource(row, options = {}) {
  const existing = sourceUrls([row.sourceUrl, ...(row.sourceUrls ?? []), row.source])
  if (!existing.length) throw new Error('作品来源地址未适配')
  const fallback = { sourceUrl: existing[0], sourceUrls: existing.slice(0, MAX_CANDIDATES), switched: existing[0] !== row.source }
  if (options.offline ?? OFFLINE) return fallback
  const read = options.fetchText ?? fetchText
  const mediaHosts = new Set((row.lines ?? []).map(line => {
    try { return new URL(line.playbackUrl).hostname } catch { return '' }
  }).filter(host => host && !/^\d+[.\d]*$/.test(host) && !host.includes(':') && host.includes('.') && !host.endsWith('.local') && !host.endsWith('.localhost')))
  const probe = options.lineReachable ?? (url => lineReachable(url, 5000, mediaHosts))
  async function reachable(candidate) {
    try {
      const page = await read(candidate)
      const heading = page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
      if (heading && normalizeTitle(heading.replace(/<[^>]+>/g, '')) !== normalizeTitle(row.title)) return false
      const lines = lineUrls(page)
      const live = await Promise.all(lines.slice(0, 2).map(line => Promise.resolve().then(() => probe(line)).catch(() => false)))
      return live.some(Boolean)
    } catch { return false }
  }
  const result = (candidate, ordered) => ({ sourceUrl: candidate,
    sourceUrls: [candidate, ...ordered.filter(item => item !== candidate)].slice(0, MAX_CANDIDATES), switched: candidate !== row.source })
  // 正常主来源不依赖搜索服务；只有既有候选都失败才发现新候选。
  for (const candidate of existing) {
    if (await reachable(candidate)) return result(candidate, existing)
  }
  const candidates = []
  for (const keyword of searchKeywords(row.title)) {
    try {
      const html = await read(`${SEARCH_BASE}${encodeURIComponent(keyword)}`)
      candidates.push(...rankCandidates(html, row.title))
    } catch { /* 一个检索词失败不阻断其他候选 */ }
  }
  const ordered = sourceUrls([...existing, ...candidates]).slice(0, MAX_CANDIDATES + 1)
  for (const candidate of ordered.filter(item => !existing.includes(item))) {
    if (await reachable(candidate)) return result(candidate, ordered)
  }
  return fallback
}

module.exports = { resolveSource, rankCandidates, lineUrls, searchKeywords, safeUrl, sourceUrls, snapshotSources, fetchText, lineReachable }
