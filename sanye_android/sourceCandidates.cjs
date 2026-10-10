/**
 * 安卓随包目录的来源挑选。
 *
 * 背景：随包作品原先固定指向 `yinghuadongman.org.cn`，该站整站不可用（HTTP 522）时，
 * 首页推荐与详情全部报“来源页暂无法预览”，而同一个作品在 `yhdmtv.cc` 上是可用的。
 * 这里在生成快照时做一次挑选：
 *   1. 先探测配置来源页；能解析出至少一条可访问线路就继续用它；
 *   2. 否则按标题在公开搜索里取同名 `/p/` 候选，逐个探测详情页线路；
 *   3. 第一个通过探测的候选作为主来源，其余候选作为备选一并写入快照。
 * 探测只读取公开页面与清单地址的状态，不下载媒体内容；离线（`SANYE_ANDROID_CATALOG_OFFLINE=1`）
 * 或全部探测失败时退回配置来源，保持原有行为。
 */

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/127 Mobile Safari/537.36'
const SEARCH_BASE = 'https://www.yhdmtv.cc/public/auto/search1.html?keyword='
const MAX_CANDIDATES = 4
const OFFLINE = process.env.SANYE_ANDROID_CATALOG_OFFLINE === '1'

function normalizeTitle(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

async function fetchText(url, timeoutMs = 25000, attempts = 2) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 1500))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

/** 只判断线路地址是否可访问；支持 Range 时只取前 1KB，不下载完整媒体。 */
async function lineReachable(url, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Range: 'bytes=0-1023' },
      signal: controller.signal,
    })
    return response.status >= 200 && response.status < 400
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** 搜索页里与本作品同名的 `/p/` 候选；越接近完整标题越靠前，保持来源页顺序。 */
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
    if (!candidateKey || !candidateKey.includes(key)) continue
    const rank = candidateKey === key ? 0 : candidateKey.startsWith(key) ? 1 : candidateKey.endsWith(key) ? 2 : 3
    const url = new URL(play, 'https://www.yhdmtv.cc').toString()
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
            const encoded = String(entry?.file ?? '')
            if (encoded.length <= 3) continue
            const decoded = Buffer.from(encoded.slice(3), 'base64').toString('utf8')
            const url = decodeURIComponent(decoded)
            if (url) urls.push(url)
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
 * 任何探测失败都退回配置来源，保证离线构建仍然可用。
 */
async function resolveSource(row) {
  const fallback = { sourceUrl: row.source, sourceUrls: [row.source], switched: false }
  if (OFFLINE) return fallback
  const candidates = []
  try {
    for (const keyword of searchKeywords(row.title)) {
      const html = await fetchText(`${SEARCH_BASE}${encodeURIComponent(keyword)}`)
      candidates.push(...rankCandidates(html, keyword))
    }
  } catch { /* 搜索不可用时只探测配置来源 */ }
  const ordered = [...new Set([row.source, ...candidates])].slice(0, MAX_CANDIDATES + 1)
  for (const candidate of ordered) {
    let page = ''
    try {
      page = await fetchText(candidate)
    } catch {
      continue
    }
    const lines = lineUrls(page)
    if (!lines.length) continue
    const live = await Promise.all(lines.slice(0, 2).map(line => lineReachable(line)))
    if (!live.some(Boolean)) continue
    // 备选顺序：先放其他通过候选来源页的地址，把探测失败的配置来源放到最后。
    const alternatives = [
      ...candidates.filter(item => item !== candidate),
      ...(row.source !== candidate ? [row.source] : []),
    ].slice(0, MAX_CANDIDATES - 1)
    return { sourceUrl: candidate, sourceUrls: [candidate, ...alternatives], switched: candidate !== row.source }
  }
  return fallback
}

module.exports = { resolveSource, rankCandidates, lineUrls, searchKeywords }
