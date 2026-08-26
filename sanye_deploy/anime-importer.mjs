import { URL } from 'node:url'

/** 默认允许的公开来源域名；新增站点必须通过命令行显式加入。 */
export const DEFAULT_ALLOWED_HOSTS = new Set([
  'yinghco.com.cn',
  'www.yinghco.com.cn',
  'yinghuadongman.org.cn',
  'yhdmtv.cc',
  'www.yhdmtv.cc',
  'mdzywtupian.com',
  'www.mdzywtupian.com',
  'img.jisuimage.com',
  'www.mdzypic.com',
  'img.lzipic.com',
  'img.picbf.com',
  'img.bdzyimg1.com',
  'img.bfzypic.com',
  'img.lzzyimg.com',
  'mtzy1.com',
])

/** 解码页面常见 HTML 实体，避免标题和简介写入实体编码。 */
function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}

/** 清理 HTML 标签和连续空白，只保留可登记的文本。 */
function cleanText(value, max = 2000) {
  return decodeHtml(String(value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** 解析单个 meta 标签的属性，兼容单引号、双引号和无引号属性。 */
function parseAttributes(tag) {
  const attributes = {}
  const pattern = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

/** 提取页面 meta 信息，优先使用 Open Graph，其次使用 name 属性。 */
function readMeta(html) {
  const values = new Map()
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0])
    const key = (attributes.property ?? attributes.name ?? '').toLowerCase()
    if (key && attributes.content) values.set(key, attributes.content)
  }
  return values
}

/** 把 JSON-LD 中可能嵌套的对象展开，便于读取作品描述和封面。 */
function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd)
  if (value && typeof value === 'object') {
    return [value, ...Object.values(value).flatMap(item => (item && typeof item === 'object' ? flattenJsonLd(item) : []))]
  }
  return []
}

/** 读取页面公开 JSON-LD，不执行页面脚本。 */
function readJsonLd(html) {
  const result = []
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      result.push(...flattenJsonLd(JSON.parse(match[1])))
    } catch {
      // 非法 JSON-LD 不影响其他公开字段解析。
    }
  }
  return result
}

/** 将来源页的相对封面地址转换为绝对 HTTPS 地址。 */
function absoluteHttpsUrl(value, pageUrl) {
  if (!value) return ''
  try {
    const url = new URL(value, pageUrl)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

/** 从 title 元素中提取站点标题，避免把脚本和样式当成作品内容。 */
function readTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return cleanText(match?.[1] ?? '', 120)
}

/** 读取详情页指定 class 的 HTML 片段，兼容站点的旧式模板结构。 */
function readClassBlock(html, className) {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<([a-z][\\w:-]*)\\b[^>]*class=["'][^"']*\\b${escapedClass}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'))
  return match?.[2] ?? ''
}

/** 从动漫详情页标题中移除“在线观看”和站点后缀，避免污染客户端标题。 */
function readDetailTitle(html) {
  const block = readClassBlock(html, 'article-title')
  return cleanText(block, 120)
    .replace(/(?:在线(?:观看|播放|免费观看)|在线观看)\s*$/i, '')
    .replace(/\s*[|｜-]\s*(?:日本动漫大全|樱花动漫).*$/i, '')
    .trim()
}

/** 从详情页视频信息区域读取封面，优先于相关推荐中的缩略图。 */
function readDetailCover(html, pageUrl) {
  const block = readClassBlock(html, 'video_img')
  const match = block.match(/<img\b[^>]*(?:src|data-original)=["']([^"']+)["'][^>]*>/i)
  return absoluteHttpsUrl(match?.[1] ?? '', pageUrl)
}

/** 从详情页信息区域读取首播年份和站点分类，避免依赖搜索页文案。 */
function readDetailInfo(html) {
  const block = readClassBlock(html, 'video_info')
  const type = block.match(/<strong>类型[:：]<\/strong>\s*([^<]+)/i)?.[1] ?? ''
  const published = block.match(/<strong>首播[:：]<\/strong>\s*([^<]+)/i)?.[1] ?? ''
  return { type: cleanText(type, 40), published: cleanText(published, 40) }
}

/** 从搜索页、分类页等公开列表中提取详情链接，不访问播放器路径。 */
export function extractDetailUrls(html, pageUrl, maxResults = 100) {
  const urls = []
  const seen = new Set()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), pageUrl)
      if (url.protocol !== 'https:' || !/^\/p\/[^/]+\/?$/i.test(url.pathname)) continue
      url.hash = ''
      const normalized = url.toString()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        urls.push(normalized)
      }
    } catch {
      // 列表中的非法链接不影响其他作品导入。
    }
    if (urls.length >= maxResults) break
  }
  return urls
}

/** 统一清理站点标题，过滤搜索页和首页等非作品标题。 */
function normalizeAnimeTitle(value) {
  return cleanText(value, 120)
    .replace(/(?:在线(?:观看|播放|免费观看)|在线观看)\s*$/i, '')
    .replace(/\s*[|｜-]\s*(?:日本动漫大全|樱花动漫).*$/i, '')
    .trim()
}

/** 把关键词拆成去重标签，并限制单个标签长度。 */
function parseTags(value) {
  return [...new Set(String(value ?? '').split(/[,，、|/]/)
    .map(item => cleanText(item, 32))
    .filter(Boolean))].slice(0, 12)
}

/** 判断来源页面是否足以登记一部作品，而不是首页、列表或通用说明页。 */
function isUsefulTitle(title) {
  return Boolean(title) && !/^(樱花动漫|sakura anime|首页|动漫首页|搜索.*)$/i.test(title)
}

/** 解析作品公开元数据；只读 HTML，不提取或下载视频播放器内容。 */
export function parseAnimePage(html, pageUrl, overrides = {}) {
  const meta = readMeta(html)
  const jsonLd = readJsonLd(html)
  const jsonItem = jsonLd.find(item => item.name || item.headline || item.title) ?? {}
  const detailInfo = readDetailInfo(html)
  const rawTitle = overrides.title || meta.get('og:title') || meta.get('twitter:title')
    || jsonItem.name || jsonItem.headline || readDetailTitle(html) || readTitle(html)
  const title = normalizeAnimeTitle(rawTitle)
  const detailSummary = cleanText(readClassBlock(html, 'jianjie'), 2000)
  const description = cleanText(overrides.summary || detailSummary || meta.get('og:description') || meta.get('description')
    || jsonItem.description || '', 2000).replace(/^剧情[:：]\s*/i, '')
  const image = typeof jsonItem.image === 'object' ? jsonItem.image.url : jsonItem.image
  const coverUrl = absoluteHttpsUrl(overrides.coverUrl || meta.get('og:image') || meta.get('twitter:image')
    || image || readDetailCover(html, pageUrl), pageUrl)
  const published = overrides.year || detailInfo.published || jsonItem.datePublished || jsonItem.dateCreated
  const yearMatch = String(published || html).match(/(?:19|20)\d{2}/)
  const inferredType = /剧场版|电影|你的名字/i.test(title) ? '剧场版'
    : detailInfo.type && /电影|剧场/.test(detailInfo.type) ? '剧场版' : '电视动画'
  const keywords = overrides.tags || meta.get('keywords') || jsonItem.keywords || ''
  return {
    title,
    originalTitle: cleanText(overrides.originalTitle || '', 120),
    type: cleanText(overrides.type || inferredType, 20),
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    summary: description,
    tags: parseTags(keywords).filter(tag => tag !== title && !/在线观看|在线播放/.test(tag)),
    updateText: cleanText(overrides.updateText || '', 50),
    coverUrl,
    sourceUrl: pageUrl,
    useful: isUsefulTitle(title),
  }
}

/** 校验来源地址必须是 HTTPS 且命中显式白名单，阻止脚本读取本地服务。 */
export function validateSourceUrl(value, allowedHosts = DEFAULT_ALLOWED_HOSTS) {
  const url = new URL(String(value))
  if (url.protocol !== 'https:' || !url.hostname || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`来源地址不在 HTTPS 白名单中：${value}`)
  }
  return url
}

/** 限制响应大小并支持超时读取，避免来源站点返回无限内容。 */
export async function fetchBytes(url, { maxBytes, timeoutMs = 10000, headers = {} }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers })
    if (!response.ok) throw new Error(`请求失败 ${response.status}：${url}`)
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > maxBytes) throw new Error(`响应超过 ${maxBytes} 字节：${url}`)
    const reader = response.body?.getReader()
    if (!reader) return { bytes: new Uint8Array(), contentType: response.headers.get('content-type') || '' }
    const chunks = []
    let total = 0
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error(`响应超过 ${maxBytes} 字节：${url}`)
      }
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { bytes, contentType: response.headers.get('content-type') || '' }
  } finally {
    clearTimeout(timer)
  }
}

/** 读取来源 HTML，统一 User-Agent 和响应上限。 */
export async function fetchHtml(url, options = {}) {
  const result = await fetchBytes(url, {
    maxBytes: options.maxBytes ?? 2 * 1024 * 1024,
    timeoutMs: options.timeoutMs,
    headers: { 'User-Agent': 'sanye_anime-metadata-import/1.0', ...options.headers },
  })
  return new TextDecoder().decode(result.bytes)
}

/** 根据 MIME 类型生成安全的上传文件后缀。 */
function imageExtension(contentType, url) {
  const mime = contentType.toLowerCase().split(';')[0]
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/gif') return '.gif'
  if (mime === 'image/avif') return '.avif'
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg'
  const suffix = new URL(url).pathname.match(/\.(png|jpe?g|webp|gif|avif)$/i)?.[0]
  return suffix?.toLowerCase() || '.jpg'
}

/** 下载公开封面并上传到管理端，返回客户端可公开读取的网关相对地址。 */
export async function uploadCover(adminBase, token, deviceId, coverUrl, allowedHosts) {
  const cover = new URL(coverUrl)
  if (cover.protocol !== 'https:' || !allowedHosts.has(cover.hostname.toLowerCase())) {
    throw new Error(`封面域名不在白名单中，已跳过上传：${coverUrl}`)
  }
  const result = await fetchBytes(cover.toString(), {
    maxBytes: 10 * 1024 * 1024,
    timeoutMs: 30000,
    headers: { 'User-Agent': 'sanye_anime-cover-import/1.0', Accept: 'image/*' },
  })
  if (!result.contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`封面响应不是图片：${result.contentType || '未知类型'}`)
  }
  const extension = imageExtension(result.contentType, cover.toString())
  const form = new FormData()
  form.append('file', new Blob([result.bytes], { type: result.contentType }), `anime-cover${extension}`)
  const response = await fetch(`${adminBase}/common/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId },
    body: form,
  })
  const body = await response.json()
  if (!response.ok || ![0, 200].includes(body.code)) throw new Error(body.msg || '封面上传失败')
  const fileName = body.fileName || body.data?.fileName
  if (!fileName) throw new Error('管理端未返回封面文件路径')
  return `/admin-profile${fileName}`
}

/** 管理端 JSON 请求，兼容 RuoYi 的 code=200 和业务 code=0。 */
async function adminRequest(adminBase, token, deviceId, path, init = {}) {
  const headers = { 'X-Device-Id': deviceId, ...(init.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${adminBase}${path}`, { ...init, headers })
  const body = await response.json()
  if (!response.ok || ![0, 200].includes(body.code)) throw new Error(body.msg || body.message || `管理端请求失败 ${response.status}`)
  return body
}

/** 登录 RuoYi 管理端并返回短期访问令牌。 */
export async function loginAdmin(adminBase, username, password, deviceId) {
  const body = await adminRequest(adminBase, '', deviceId, '/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  const token = body.token || body.data?.token
  if (!token) throw new Error('管理端登录响应中没有 token')
  return token
}

/** 创建或按标题更新作品，并可选流转为已发布。 */
export async function upsertAnime(adminBase, token, deviceId, metadata, publish = false) {
  const listBody = await adminRequest(adminBase, token, deviceId, '/anime')
  const rows = listBody.data || listBody.rows || []
  const existing = rows.find(row => row.title === metadata.title)
  const payload = {
    title: metadata.title,
    originalTitle: metadata.originalTitle,
    type: metadata.type,
    year: metadata.year == null ? undefined : String(metadata.year),
    summary: metadata.summary,
    tags: metadata.tags.join(','),
    updateText: metadata.updateText,
    sourceUrl: metadata.sourceUrl,
    coverUrl: metadata.coverUrl,
  }
  const cleaned = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
  const saved = existing
    ? await adminRequest(adminBase, token, deviceId, `/anime/${existing.id}`, { method: 'PATCH', body: JSON.stringify(cleaned) })
    : await adminRequest(adminBase, token, deviceId, '/anime', { method: 'POST', body: JSON.stringify(cleaned) })
  const anime = saved.data
  if (publish) {
    await adminRequest(adminBase, token, deviceId, `/anime/${anime.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: '已发布' }),
    })
  }
  return { id: anime.id, action: existing ? 'updated' : 'created', published: publish }
}
