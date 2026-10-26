export const COVER_CACHE_NAME = 'sanye_android_covers_v1'
export const COVER_CACHE_LIMITS = { entries: 240, bytes: 32 * 1024 * 1024, imageBytes: 2 * 1024 * 1024 }
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'])
const bundledCovers = new Set<string>()
// 只由应用入口登记构建器导入的资源；来源和备份不能登记任意 data 地址。
export function registerBundledCovers(values: string[]) { for (const value of values) bundledCovers.add(value) }
const pending = new Map<string, Promise<Blob | undefined>>()
const visiblePending = new Set<string>()
type CoverBridge = { isNativePlatform?: () => boolean; isPluginAvailable?: (name: string) => boolean; nativePromise?: (plugin: string, method: string, options: object) => Promise<{ data?: string; mime?: string }> }
function nativeBridge(): CoverBridge | undefined {
  const bridge = (globalThis as typeof globalThis & { Capacitor?: CoverBridge }).Capacitor
  return bridge?.isNativePlatform?.() && bridge.isPluginAvailable?.('SanyeCover') && bridge.nativePromise ? bridge : undefined
}

export function usesNativeCoverFetch(): boolean { return !!nativeBridge() }

async function nativeBlob(url: string): Promise<Blob | undefined> {
  const bridge = nativeBridge()
  if (!bridge) return undefined
  try {
    // 当前来源的新浪封面经过失效图片代理；已验证原始 HTTPS 图片可安全读取。
    const proxy = new URL(url)
    const original = proxy.hostname === 'images.weserv.nl' ? proxy.searchParams.get('url') : null
    const direct = original && cacheableCoverUrl(original)
    const requestUrl = direct && new URL(direct).hostname === 'lz.sinaimg.cn' ? direct : url
    const result = await bridge.nativePromise!('SanyeCover', 'fetch', { url: requestUrl })
    if (!result.data || result.data.length > Math.ceil(COVER_CACHE_LIMITS.imageBytes / 3) * 4) return undefined
    const bytes = Uint8Array.from(atob(result.data), value => value.charCodeAt(0))
    return readBounded(new Response(bytes, { headers: { 'content-type': result.mime ?? '' } }))
  } catch { return undefined }
}
const controllers = new Set<AbortController>()
const networkWaiters: { url: string; visible: boolean; resume: () => void }[] = []
let networkActive = 0
let generation = 0
let writes: Promise<unknown> = Promise.resolve()

// 保守地排除所有 IP 字面量及本地名称；DNS 重绑定防护仍需原生网络层。
export function cacheableCoverUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return undefined
    if (!/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || /^[\d.]+$/.test(host)) return undefined
    if (/(^|\.)(localhost|local|localdomain|internal|lan|home|test|invalid|example|arpa|onion)$/.test(host)) return undefined
    url.hash = ''
    return url.href
  } catch { return undefined }
}

export function displayableCoverUrl(value: string): string {
  if (bundledCovers.has(value)) return value
  // 本地打包资源不经远程缓存，也不允许协议相对地址绕过检查。
  if (value.includes('\\')) return ''
  if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('./') || value.startsWith('../')) return value
  return cacheableCoverUrl(value) ? value : ''
}

function storageAvailable(): boolean {
  return typeof caches !== 'undefined' && typeof location !== 'undefined'
    && (location.protocol === 'https:' || (location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)))
}

function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = writes.then(action, action)
  writes = next.catch(() => undefined)
  return next
}

async function readBounded(response: Response): Promise<Blob | undefined> {
  const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!response.ok || !imageTypes.has(type) || Number(response.headers.get('content-length')) > COVER_CACHE_LIMITS.imageBytes) return undefined
  if (!response.body) return undefined
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > COVER_CACHE_LIMITS.imageBytes) { await reader.cancel(); return undefined }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  if (!size) return undefined
  const blob = new Blob(chunks, { type })
  const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer())
  const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end))
  const valid = type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => head[i] === byte)
    : type === 'image/jpeg' ? head[0] === 255 && head[1] === 216 && head[2] === 255
    : type === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
    : type === 'image/webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    : ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 32))
  return valid ? blob : undefined
}

async function loadBlob(url: string, epoch: number, visible: boolean): Promise<Blob | undefined> {
  try {
    let cache: Cache | undefined
    try { if (storageAvailable()) cache = await caches.open(COVER_CACHE_NAME) } catch {}
    const existing = await cache?.match(url)
    if (existing) {
      const blob = await readBounded(existing)
      if (blob) return generation === epoch ? blob : undefined
      await serialize(() => cache!.delete(url))
    }
    let blob: Blob | undefined
    if (networkActive >= (nativeBridge() ? 4 : 2)) await new Promise<void>(resume => networkWaiters.push({ url, visible: visible || visiblePending.has(url), resume }))
    else networkActive++
    try {
      if (generation !== epoch) return undefined
      const controller = new AbortController()
      controllers.add(controller)
      const timer = setTimeout(() => controller.abort(), 8000)
      try {
        if (nativeBridge()) blob = await nativeBlob(url)
        else {
          try { blob = await readBounded(await fetch(url, { mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal })) } catch {}
        }
      } finally { clearTimeout(timer); controllers.delete(controller) }
    } finally {
      const priority = networkWaiters.findIndex(waiter => waiter.visible)
      const next = networkWaiters.splice(priority >= 0 ? priority : 0, 1)[0]
      if (next) next.resume()
      else networkActive--
    }
    if (!blob || generation !== epoch) return undefined
    const image = blob
    if (!cache) return image
    void serialize(async () => {
      if (generation !== epoch) return
      const keys = await cache.keys()
      let bytes = 0
      const entries: { request: Request; size: number }[] = []
      for (const request of keys) {
        const response = await cache.match(request)
        const size = Number(response?.headers.get('content-length'))
        if (!Number.isFinite(size) || size <= 0 || size > COVER_CACHE_LIMITS.imageBytes) { await cache.delete(request); continue }
        bytes += size
        entries.push({ request, size })
      }
      while (entries.length >= COVER_CACHE_LIMITS.entries || bytes + image.size > COVER_CACHE_LIMITS.bytes) {
        const oldest = entries.shift()
        if (!oldest) break
        await cache.delete(oldest.request)
        bytes -= oldest.size
      }
      await cache.put(url, new Response(image, { headers: { 'content-type': image.type, 'content-length': String(image.size) } }))
    }).catch(() => undefined)
    return generation === epoch ? image : undefined
  } catch { return undefined }
}

export interface CoverSource { src: string; cached: boolean; release: () => void }

function ensureBlob(url: string, visible = false): Promise<Blob | undefined> {
  let job = pending.get(url)
  if (visible) visiblePending.add(url)
  if (job && visible) {
    const waiter = networkWaiters.find(item => item.url === url)
    if (waiter) waiter.visible = true
  }
  if (!job) {
    job = loadBlob(url, generation, visible)
    pending.set(url, job)
    void job.finally(async () => { await writes; if (pending.get(url) === job) { pending.delete(url); visiblePending.delete(url) } })
  }
  return job
}

function coverSource(value: string, blob?: Blob): CoverSource {
  const fallback = { src: displayableCoverUrl(value), cached: false, release: () => {} }
  if (!blob) return fallback
  try {
    const src = URL.createObjectURL(blob)
    let released = false
    return { src, cached: true, release: () => { if (!released) { released = true; URL.revokeObjectURL(src) } } }
  } catch { return fallback }
}

// 仅查本地缓存，永不等待远程下载；未命中直接返回可显示的原地址。
export async function peekCoverSource(value: string): Promise<CoverSource> {
  const url = cacheableCoverUrl(value)
  if (!url || !storageAvailable()) return coverSource(value)
  try {
    const response = await (await caches.open(COVER_CACHE_NAME)).match(url)
    return coverSource(value, response ? await readBounded(response) : undefined)
  } catch { return coverSource(value) }
}

// 后台只补缓存，不分配对象地址，也不触发当前图片重新加载。
export function startCoverCache(value: string): void {
  const url = cacheableCoverUrl(value)
  if (url && (storageAvailable() || nativeBridge())) void ensureBlob(url)
}

// 原生图片使用一次安全下载的结果；浏览器图片仍可直接显示原地址。
export async function getCoverSource(value: string): Promise<CoverSource> {
  const url = cacheableCoverUrl(value)
  const blob = url && (storageAvailable() || nativeBridge()) ? await ensureBlob(url, true) : undefined
  // 原生下载可能被图片站拒绝；保留经过 HTTPS 校验的图片地址，让 WebView 再试一次。
  return coverSource(value, blob)
}

export async function getCoverCacheStats(): Promise<{ entries: number; bytes: number; available: boolean }> {
  if (!storageAvailable()) return { entries: 0, bytes: 0, available: false }
  try {
    return await serialize(async () => {
      const cache = await caches.open(COVER_CACHE_NAME)
      const keys = await cache.keys()
      let bytes = 0
      for (const key of keys) bytes += Number((await cache.match(key))?.headers.get('content-length')) || 0
      return { entries: keys.length, bytes, available: true }
    })
  } catch { return { entries: 0, bytes: 0, available: false } }
}

export async function clearCoverCache(): Promise<boolean> {
  generation++
  void nativeBridge()?.nativePromise?.('SanyeCover', 'cancelAll', {}).catch(() => undefined)
  for (const controller of controllers) controller.abort()
  pending.clear()
  visiblePending.clear()
  if (!storageAvailable()) return false
  try { await serialize(() => caches.delete(COVER_CACHE_NAME)); return true } catch { return false }
}
