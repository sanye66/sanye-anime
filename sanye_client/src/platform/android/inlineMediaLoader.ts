import { Capacitor, registerPlugin } from '@capacitor/core'
import type Hls from 'hls.js'
import type { HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js'
import type { SourcePlaybackHeaders } from './source'

interface MediaFetch {
  read(options: { id: string; url: string; headers: SourcePlaybackHeaders; rangeStart?: number; rangeEnd?: number }): Promise<{ data: string; url: string; status: number; elapsedMs: number }>
  cancel(options: { id: string }): Promise<void>
}
const bridge = registerPlugin<MediaFetch>('SanyeMediaFetch')
let sequence = 0
type MediaResponse = Awaited<ReturnType<MediaFetch['read']>>
const manifests = new Map<string, { expires: number; promise: Promise<MediaResponse> }>()
function manifestKey(url: string, headers: SourcePlaybackHeaders) { return JSON.stringify([url, headers.Referer || '', headers['User-Agent'] || '']) }
function readManifest(url: string, headers: SourcePlaybackHeaders): Promise<MediaResponse> {
  const key = manifestKey(url, headers), cached = manifests.get(key)
  if (cached && cached.expires > Date.now()) return cached.promise
  if (manifests.size >= 8) manifests.delete(manifests.keys().next().value!)
  const entry = { expires: Date.now() + 15000, promise: bridge.read({ id: `manifest-${Date.now()}-${++sequence}`, url, headers }) }
  manifests.set(key, entry)
  void entry.promise.then(value => {
    const text = value.data.length <= 256 * 1024 ? atob(value.data) : ''
    // 错误网页与动态直播列表不能被缓存，重试和直播刷新必须重新读取。
    if ((!/^\s*#EXTM3U/.test(text) || !text.includes('#EXT-X-ENDLIST') && !text.includes('#EXT-X-STREAM-INF'))
      && manifests.get(key) === entry) manifests.delete(key)
  }, () => { if (manifests.get(key) === entry) manifests.delete(key) })
  return entry.promise
}
/** 只预热两层 HLS 清单，不读取视频分片；实际加载共享同一原生请求。 */
export async function prewarmInlineManifest(url: string, headers: SourcePlaybackHeaders = {}) {
  if (!inlineMediaAvailable()) return
  try {
    const value = await readManifest(url, headers)
    if (value.data.length > 256 * 1024) return
    const rows = atob(value.data).split(/\r?\n/)
    const child = rows.find((row, i) => i > 0 && rows[i - 1]?.startsWith('#EXT-X-STREAM-INF') && row && !row.startsWith('#'))
    if (child) await readManifest(new URL(child, value.url).href, headers)
  } catch { /* 预热失败交给正式加载，不能阻塞搜索或播放。 */ }
}
export function inlineMediaAvailable() { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SanyeMediaFetch') }

export function inlineMediaLoader(HlsConstructor: typeof Hls, headers: SourcePlaybackHeaders = {}) {
  const Base = HlsConstructor.DefaultConfig.loader as new (config: HlsConfig) => Loader<LoaderContext>
  return class InlineLoader extends Base {
    private id = ''
    private epoch = 0
    private timer?: ReturnType<typeof setTimeout>
    override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      if (!inlineMediaAvailable()) { super.load(context, config, callbacks); return }
      const epoch = ++this.epoch
      this.context = context
      this.id = `inline-${Date.now()}-${++sequence}`
      this.stats.aborted = false
      this.stats.loading.start = performance.now()
      const current = () => epoch === this.epoch && !this.stats.aborted
      this.timer = setTimeout(() => {
        if (!current()) return
        this.abort(); callbacks.onTimeout(this.stats, context, null)
      }, Math.min(20000, config.loadPolicy?.maxLoadTimeMs || config.timeout || 20000))
      const ranged = context.rangeEnd !== undefined && context.rangeStart !== undefined && context.rangeEnd > context.rangeStart
      const response = context.responseType !== 'arraybuffer' && !ranged ? readManifest(context.url, headers)
        : bridge.read({ id: this.id, url: context.url, headers,
          ...(ranged ? { rangeStart: context.rangeStart, rangeEnd: context.rangeEnd } : {}) })
      void response.then(value => {
        if (!current()) return
        clearTimeout(this.timer)
        this.id = ''
        // 大分片用逐字节写入，避免 Uint8Array.from 的字符串迭代与每字节回调阻塞首帧。
        const binary = atob(value.data)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const data = context.responseType === 'arraybuffer' ? bytes.buffer : new TextDecoder().decode(bytes)
        const end = performance.now()
        this.stats.loaded = this.stats.total = bytes.byteLength
        this.stats.loading.first = this.stats.loading.start
        this.stats.loading.end = end
        callbacks.onSuccess({ url: value.url, data, code: value.status }, this.stats, context, null)
      }, failure => {
        if (!current()) return
        clearTimeout(this.timer)
        this.id = ''
        callbacks.onError({ code: 0, text: failure instanceof Error ? failure.message : '媒体请求失败' }, context, null, this.stats)
      })
    }
    override abort() {
      if (!this.id) { super.abort(); return }
      const id = this.id
      this.id = ''
      this.epoch++; this.stats.aborted = true; clearTimeout(this.timer)
      void bridge.cancel({ id }).catch(() => {})
    }
    override destroy() { this.abort(); super.destroy() }
  }
}
