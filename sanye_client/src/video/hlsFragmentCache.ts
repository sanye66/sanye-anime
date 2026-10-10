import type Hls from 'hls.js'
import type { FragmentLoaderContext, HlsConfig, Loader, LoaderConfiguration, LoaderCallbacks, LoaderResponse } from 'hls.js'

interface Entry { response: LoaderResponse; bytes: ArrayBuffer; elapsed: number; expires: number }

/** One cache per HLS session; signed URLs, byte ranges and request headers stay distinct. */
export function createFragmentCache(HlsConstructor: typeof Hls, isVod: () => boolean, maxBytes = 192 * 1024 * 1024) {
  const entries = new Map<string, Entry>()
  let bytes = 0
  const remove = (key: string) => { const item = entries.get(key); if (item) bytes -= item.bytes.byteLength; entries.delete(key) }
  const Base = HlsConstructor.DefaultConfig.loader as new (config: HlsConfig) => Loader<FragmentLoaderContext>
  class FragmentLoader extends Base {
    private generation = 0
    private cachedCallbacks: LoaderCallbacks<FragmentLoaderContext> | null = null
    override load(context: FragmentLoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<FragmentLoaderContext>) {
      const generation = ++this.generation
      const key = JSON.stringify([context.url, context.rangeStart, context.rangeEnd,
        Object.entries(context.headers || {}).sort(([a], [b]) => a.localeCompare(b))])
      const eligible = isVod() && context.responseType === 'arraybuffer' && !context.progressData
      const cached = eligible ? entries.get(key) : undefined
      if (cached && cached.expires <= Date.now()) remove(key)
      else if (cached) {
        entries.delete(key); entries.set(key, cached)
        this.context = context
        this.stats.aborted = false
        this.cachedCallbacks = callbacks
        queueMicrotask(() => {
          if (generation !== this.generation || this.stats.aborted) return
          const now = performance.now()
          this.stats.loaded = this.stats.total = cached.bytes.byteLength
          // Preserve measured transfer duration so a RAM hit does not inflate ABR bandwidth.
          this.stats.loading = { start: now - cached.elapsed, first: now - cached.elapsed, end: now }
          this.cachedCallbacks = null
          callbacks.onSuccess({ ...cached.response, data: cached.bytes.slice(0) }, this.stats, context, null)
        })
        return
      }
      super.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, loadedContext, networkDetails) => {
          if (generation !== this.generation) return
          const data = response.data
          const cacheControl: string = networkDetails?.getResponseHeader?.('Cache-Control')
            || networkDetails?.headers?.get?.('Cache-Control') || ''
          if (eligible && data instanceof ArrayBuffer && data.byteLength > 0 && data.byteLength <= maxBytes
            && !/no-store|no-cache/i.test(cacheControl)) {
            remove(key)
            while (bytes + data.byteLength > maxBytes && entries.size) remove(entries.keys().next().value!)
            const age = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i)
            const ttl = Math.min(600_000, age ? Number(age[1]) * 1000 : 600_000)
            entries.set(key, { response: { url: response.url, code: response.code }, bytes: data.slice(0),
              elapsed: Math.max(1, stats.loading.end - stats.loading.start), expires: Date.now() + ttl })
            bytes += data.byteLength
          }
          callbacks.onSuccess(response, stats, loadedContext, networkDetails)
        },
      })
    }
    override abort() {
      this.generation++
      const callbacks = this.cachedCallbacks
      this.cachedCallbacks = null
      if (callbacks && this.context) {
        this.stats.aborted = true
        callbacks.onAbort?.(this.stats, this.context, null)
      } else super.abort()
    }
    override destroy() { this.generation++; this.cachedCallbacks = null; super.destroy() }
  }
  return { Loader: FragmentLoader, clear: () => { entries.clear(); bytes = 0 } }
}
