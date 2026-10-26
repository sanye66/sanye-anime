import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { activeSubscriptionContent, activeSubscriptionScope, activeSubscriptionSourceIndex, subscriptionState } from '../../subscriptions'
import { watch } from 'vue'
import { measureExperience, recordExperience } from './experience'
import { androidCatalog, type SavedMedia, type WatchHistory } from './catalog'

export interface SourceContext { content: string; sourceIndex?: number }
export interface SourcePlaybackHeaders { Referer?: string; 'User-Agent'?: string }
export interface SourceResolveResult { playbackUrl: string; mimeType: string; warnings?: string[]; requestHeaders?: SourcePlaybackHeaders }

export interface SourceHit {
  title: string
  sourceUrl: string
  coverUrl: string
  summary: string
  sourceName?: string
  kind?: 'web' | 'resource'
  resourceUrl?: string
  responseMs?: number
  sourceIndex?: number
  sourceContext?: SourceContext
}

export interface SourceEpisode {
  id: string
  title: string
  sourceUrl?: string
  playbackUrl: string
  mimeType: string
  lineId?: string
  sourceContext?: SourceContext
  requestHeaders?: SourcePlaybackHeaders
}

export interface SourcePreview {
  title: string
  sourceUrl: string
  coverUrl: string
  summary: string
  episodes: SourceEpisode[]
  sourceContext?: SourceContext
  sourceIndex?: number
  sourceName?: string
}
export interface SourceSearchResult {
  hits: SourceHit[]
  warnings?: string[]
  completed?: number
  total?: number
}

interface AndroidSource {
  search(options: { keyword: string; searchGroup?: string; background?: boolean }): Promise<SourceSearchResult>
  preview(options: { sourceUrl: string }): Promise<SourcePreview>
  subscriptionSearch(options: { content: string; sourceIndex: number; keyword: string; requestId?: string; searchGroup?: string; background?: boolean }): Promise<SourceSearchResult>
  addListener(event: 'searchProgress', listener: (result: SourceSearchResult & { requestId: string }) => void): Promise<PluginListenerHandle>
  subscriptionPreview(options: { content: string; sourceUrl: string; sourceIndex?: number }): Promise<SourcePreview>
  subscriptionResolve(options: { content: string; sourceUrl: string; sourceIndex?: number }): Promise<SourceResolveResult>
}

const bridge = registerPlugin<AndroidSource>('SanyeSource')
// 已保存作品和历史记录使用地址对应的原始规则，不能随当前订阅切换误走默认白名单。
const contextKey = 'sanye:android-source-context:v1'
const contexts = new Map<string, string>()
const episodeContexts = new Map<string, string>()
const contextIndices = new Map<string, number>()
try {
  const saved = JSON.parse(localStorage.getItem(contextKey) || 'null')
  if (Array.isArray(saved?.urls) && Array.isArray(saved?.rules)) for (const pair of saved.urls) {
    const content = saved.rules[pair[1]]
    if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof content === 'string' && content.length <= 2 * 1024 * 1024) {
      contexts.set(pair[0], content)
      if (Number.isInteger(pair[2]) && pair[2] >= 0 && pair[2] < 100) contextIndices.set(pair[0], pair[2])
    }
  }
} catch { /* 损坏记录不覆盖用户当前订阅 */ }
function remember(url: string, content: string, persist = true, sourceIndex?: number) {
  contexts.delete(url)
  contexts.set(url, content)
  if (sourceIndex !== undefined) contextIndices.set(url, sourceIndex)
  else contextIndices.delete(url)
  if (contexts.size > 200) contexts.delete(contexts.keys().next().value!)
  if (persist) persistContexts()
}
function persistContexts() {
  // 只保留规则上下文；空间不足时保留当前会话，不阻断已成功的来源请求。
  try {
    const rules = [...new Set(contexts.values())]
    localStorage.setItem(contextKey, JSON.stringify({ rules, urls: [...contexts].map(([url, content]) => [url, rules.indexOf(content), contextIndices.get(url)]) }))
  } catch { /* 存储空间不足 */ }
}
export function sourceContent(sourceUrl?: string): string {
  return sourceUrl ? episodeContexts.get(sourceUrl) || contexts.get(sourceUrl) || '' : activeSubscriptionContent() || ''
}
export function sourceCacheKey(sourceUrl: string, context?: SourceContext): string {
  return `${context?.content ?? sourceContent(sourceUrl)}\u0000${context?.sourceIndex ?? contextIndices.get(sourceUrl) ?? ''}\u0000${sourceUrl}`
}
// 保存/历史的规则快照独立于当前订阅及搜索结果 URL 映射；旧记录仍使用原有兼容上下文。
const bindingsKey = 'sanye:android-source-bindings:v1'
const bindings = new Map<string, SourceContext>()
try {
  const data = JSON.parse(localStorage.getItem(bindingsKey) || 'null')
  if (Array.isArray(data?.entries) && Array.isArray(data?.rules)) for (const pair of data.entries) {
    const content = data.rules[pair[1]]
    if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof content === 'string' && content.length <= 2 * 1024 * 1024 && (pair[2] == null || Number.isInteger(pair[2]) && pair[2] >= 0 && pair[2] < 100)) bindings.set(pair[0], { content, sourceIndex: pair[2] ?? undefined })
  }
} catch { /* 旧记录按兼容路径读取 */ }
export function savedSourceContext(key: string): SourceContext | undefined { return bindings.get(key) }
export function historySourceBindingKey(entry: Pick<WatchHistory, 'mediaUrl' | 'episodeId' | 'lineId' | 'sourceKey'>): string {
  return entry.sourceKey
    ? `history:v2:${JSON.stringify([entry.sourceKey, entry.mediaUrl, entry.episodeId, entry.lineId])}`
    : `history:${entry.mediaUrl}:${entry.episodeId}:${entry.lineId}`
}
export async function migrateLegacySourceBindings(saved: SavedMedia[], history: WatchHistory[]) {
  const savedEntries = saved.flatMap(item => {
    const context = !item.sourceKey && !item.sourceContext ? savedSourceContext(`saved:${item.id}`) : undefined
    return context?.content ? [{ id: item.id, context }] : []
  })
  const historyEntries = history.flatMap(item => {
    const context = !item.sourceKey && !item.sourceContext ? savedSourceContext(historySourceBindingKey(item)) : undefined
    return context?.content ? [{ mediaUrl: item.mediaUrl, episodeId: item.episodeId, lineId: item.lineId, context }] : []
  })
  if (!savedEntries.length && !historyEntries.length) return { migrated: 0 }
  try {
    return await androidCatalog.migrateSourceBindings({ saved: savedEntries, history: historyEntries })
  } catch (error) {
    // 旧安装包缺少迁移接口时继续读取旧快照；真实数据库错误必须交给页面重试。
    if ((error as { code?: string })?.code === 'UNIMPLEMENTED') return { migrated: 0 }
    throw error
  }
}
export function persistSourceContext(key: string, context?: SourceContext) {
  bindings.delete(key)
  if (context) bindings.set(key, context)
  persistBindings()
}
function persistBindings() {
  const rules = [...new Set([...bindings.values()].map(value => value.content))]
  localStorage.setItem(bindingsKey, JSON.stringify({ rules, entries: [...bindings].map(([key, value]) => [key, rules.indexOf(value.content), value.sourceIndex]) }))
}
export function clearHistorySourceContexts() {
  for (const key of bindings.keys()) if (key.startsWith('history:')) bindings.delete(key)
  persistBindings()
}
export interface SourceBindingSnapshot { key: string; context: SourceContext }
export function exportSourceBindings(): SourceBindingSnapshot[] {
  return [...bindings].map(([key, context]) => ({ key, context: { ...context } }))
}
export function mergeSourceBindings(entries: SourceBindingSnapshot[]) {
  // 写存储成功之后才替换内存映射；容量不足不会让当前会话和重启后的规则不一致。
  const merged = new Map(bindings)
  for (const entry of entries) merged.set(entry.key, { ...entry.context })
  const rules = [...new Set([...merged.values()].map(value => value.content))]
  localStorage.setItem(bindingsKey, JSON.stringify({ rules, entries: [...merged].map(([key, value]) => [key, rules.indexOf(value.content), value.sourceIndex]) }))
  bindings.clear()
  for (const [key, context] of merged) bindings.set(key, context)
}
export function sourceHitKey(hit: SourceHit) { return `${hit.sourceIndex ?? ''}\u0000${hit.sourceUrl}` }
const searchCache = new Map<string, { expiresAt: number; result: SourceSearchResult }>()
const pendingSearches = new Map<string, { promise: Promise<SourceSearchResult>; callbacks: Set<(result: SourceSearchResult) => void>; latest?: SourceSearchResult }>()
const resolvedEpisodes = new Map<string, { expires: number; result: SourceResolveResult }>()
const pendingResolves = new Map<string, Promise<SourceResolveResult>>()
let searchSequence = 0
let scopeGeneration = 0
watch(activeSubscriptionScope, () => { scopeGeneration++; resolvedEpisodes.clear(); pendingResolves.clear() }, { flush: 'sync' })
export const androidSource = {
  async search(options: { keyword: string; refresh?: boolean; background?: boolean }, onProgress?: (result: SourceSearchResult) => void): Promise<SourceSearchResult> {
    const content = activeSubscriptionContent() || ''
    const sourceIndex = activeSubscriptionSourceIndex()
    if (subscriptionState.value.active && !content) throw new Error('订阅规则未加载，请在我的中重试。')
    if (content && (!Number.isInteger(sourceIndex) || sourceIndex < 0)) throw new Error('请选择一个可用来源。')
    const keyword = options.keyword.trim()
    const scope = activeSubscriptionScope()
    const generation = scopeGeneration
    const key = `${scope}\u0000${keyword}`
    const cached = searchCache.get(key)
    if (!options.refresh && cached && cached.expiresAt > Date.now()) {
      onProgress?.(cached.result)
      return cached.result
    }
    const pendingKey = `${generation}\u0000${options.background ? 'background' : 'interactive'}\u0000${key}`
    const existing = pendingSearches.get(pendingKey)
    if (existing) {
      if (onProgress) existing.callbacks.add(onProgress)
      if (existing.latest) onProgress?.(existing.latest)
      return existing.promise
    }
    const callbacks = new Set<(result: SourceSearchResult) => void>()
    if (onProgress) callbacks.add(onProgress)
    const requestId = `search-${Date.now()}-${++searchSequence}`
    const completeMeasure = measureExperience('search')
    const searchStarted = performance.now()
    let firstResults = false
    let listener: PluginListenerHandle | undefined
    const pending = { callbacks, latest: undefined as SourceSearchResult | undefined, promise: Promise.resolve({ hits: [] } as SourceSearchResult) }
    const publish = (result: SourceSearchResult) => {
      if (scopeGeneration !== generation || activeSubscriptionScope() !== scope) return
      if (content && result.hits.some(hit => hit.sourceIndex !== sourceIndex)) return
      if (result.hits.length && !firstResults) {
        firstResults = true
        recordExperience('search', 'partial', performance.now() - searchStarted, '', result.hits.length)
      }
      result.hits = result.hits.map(hit => ({ ...hit, sourceContext: { content, sourceIndex: hit.sourceIndex } }))
      let changed = false
      if (content) for (const hit of result.hits) if (hit.kind !== 'resource') {
        remember(hit.sourceUrl, content, false, hit.sourceIndex)
        changed = true
      }
      if (changed) persistContexts()
      pending.latest = result
      for (const callback of callbacks) callback(result)
    }
    pending.promise = (async () => {
      try {
        const headers = (Capacitor as unknown as { PluginHeaders?: Array<{ name: string; methods: Array<{ name: string }> }> }).PluginHeaders
        // Capacitor 的旧原生代理在缺 addListener 时会生成悬空 Promise，catch 本身无法兜底。
        if (content && headers?.find(header => header.name === 'SanyeSource')?.methods.some(method => method.name === 'addListener')) {
          // 旧插件或浏览器预览不支持事件时仍保留完整搜索回调。
          try { listener = await bridge.addListener('searchProgress', result => { if (result.requestId === requestId) publish(result) }) } catch { /* 兼容旧桥接 */ }
        }
        let timeout: ReturnType<typeof setTimeout> | undefined
        const searchOptions = { keyword, searchGroup: options.background ? 'android-repository' : 'android-interactive-search', background: !!options.background }
        const result = await Promise.race([
          content ? bridge.subscriptionSearch({ ...searchOptions, content, sourceIndex, requestId }) : bridge.search(searchOptions),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('来源搜索超时')), content ? 12_000 : 14_000) }),
        ]).finally(() => clearTimeout(timeout))
        if (scopeGeneration !== generation || activeSubscriptionScope() !== scope) {
          completeMeasure('cancelled')
          throw Object.assign(new Error('订阅已切换'), { code: 'E_SEARCH_CANCELLED' })
        }
        if (content && result.hits.some(hit => hit.sourceIndex !== sourceIndex)) throw new Error('搜索响应与当前来源不匹配。')
        completeMeasure(result.warnings?.length ? 'partial' : result.hits.length ? 'success' : 'empty', result.hits.length)
        publish(result)
        // 部分失败/超时不缓存，下一次主动重试仍可补齐来源。
        if (result.hits.length && !result.warnings?.length && (!result.total || result.completed === result.total)) {
          searchCache.delete(key)
          searchCache.set(key, { expiresAt: Date.now() + 30_000, result })
          if (searchCache.size > 12) searchCache.delete(searchCache.keys().next().value!)
        }
        return result
      } catch (cause) {
        completeMeasure((cause as { code?: string })?.code === 'E_SEARCH_CANCELLED' ? 'cancelled' : 'failed')
        throw cause
      } finally {
        if (pendingSearches.get(pendingKey) === pending) pendingSearches.delete(pendingKey)
        callbacks.clear()
        try { await listener?.remove() } catch { /* 页面已销毁 */ }
      }
    })()
    pendingSearches.set(pendingKey, pending)
    return pending.promise
  },
  async preview(options: { sourceUrl: string; sourceContext?: SourceContext }) {
    const completeMeasure = measureExperience('preview', options.sourceUrl)
    try {
    const context = options.sourceContext ?? { content: sourceContent(options.sourceUrl), sourceIndex: contextIndices.get(options.sourceUrl) }
    const content = context.content
    const preview = content ? await bridge.subscriptionPreview({ sourceUrl: options.sourceUrl, content, sourceIndex: context.sourceIndex }) : await bridge.preview({ sourceUrl: options.sourceUrl })
    const resolvedContext = { ...context, sourceIndex: preview.sourceIndex ?? context.sourceIndex }
    preview.sourceContext = resolvedContext
    preview.episodes = preview.episodes.map(episode => ({ ...episode, sourceContext: resolvedContext }))
    if (content && sourceContent(options.sourceUrl) === content) {
      remember(options.sourceUrl, content, true, resolvedContext.sourceIndex)
      for (const episode of preview.episodes) if (episode.sourceUrl) {
        episodeContexts.set(episode.sourceUrl, content)
        if (resolvedContext.sourceIndex !== undefined) contextIndices.set(episode.sourceUrl, resolvedContext.sourceIndex)
        if (episodeContexts.size > 1000) episodeContexts.delete(episodeContexts.keys().next().value!)
      }
    }
    completeMeasure(preview.episodes.length ? 'success' : 'empty', preview.episodes.length)
    return preview
    } catch (cause) { completeMeasure('failed'); throw cause }
  },
  async resolve(sourceUrl: string, context?: SourceContext) {
    const content = context?.content ?? sourceContent(sourceUrl)
    if (!content) return null
    const key = `${scopeGeneration}\u0000${sourceCacheKey(sourceUrl, { ...context, content })}`
    const cached = resolvedEpisodes.get(key)
    if (cached && cached.expires > Date.now()) return cached.result
    const existing = pendingResolves.get(key)
    if (existing) return existing
    const generation = scopeGeneration
    const completeMeasure = measureExperience('resolve', sourceUrl)
    const operation = new Promise<SourceResolveResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('来源解析超时，请重试或选择其他线路')), 10000)
      bridge.subscriptionResolve({ content, sourceUrl, sourceIndex: context?.sourceIndex ?? contextIndices.get(sourceUrl) })
        .then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
    }).then(result => {
      if (generation === scopeGeneration && result.playbackUrl) {
        resolvedEpisodes.set(key, { expires: Date.now() + 20000, result })
        if (resolvedEpisodes.size > 24) resolvedEpisodes.delete(resolvedEpisodes.keys().next().value!)
      }
      completeMeasure(result.playbackUrl ? 'success' : 'empty'); return result
    }, cause => { completeMeasure('failed'); throw cause })
    pendingResolves.set(key, operation)
    void operation.finally(() => { if (pendingResolves.get(key) === operation) pendingResolves.delete(key) }).catch(() => {})
    return operation
  },
}
