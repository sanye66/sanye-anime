import { ref } from 'vue'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { http } from './api/http'

export interface SubscriptionSource { name: string; factoryId: string; version: number; retired?: boolean; provisional?: boolean }
export interface Subscription { url: string; name: string; sources: SubscriptionSource[]; content?: string; updatedAt?: number }
const key = 'sanye:subscriptions:v1'
const sitePresetKey = 'sanye:subscriptions:site-presets:v1'
const fengcheUrl = 'https://apps.fengctv.com.cn/'
const gongheguoUrl = 'https://v.dm-ghg.cn/'
// 站内公告指向 fcccc.cc；使用已核对的搜索、详情、选集、媒体和目录路径。
const fengcheContent = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{
  factoryId: 'web-selector', version: 2, arguments: {
    name: '风车动漫',
    searchConfig: {
      searchUrl: 'https://fcccc.cc/u/?wd={keyword}', subjectFormatId: 'a',
      selectorSubjectFormatA: { selectLists: 'article.u-movie > a[title][href^="/p/"]' },
      channelFormatId: 'no-channel',
      selectorChannelFormatNoChannel: { selectEpisodes: '#video_list_li .vlink a', selectEpisodeLinks: '' },
      matchVideo: { addHeadersToVideo: { referer: 'https://fcccc.cc/' } },
    },
    repositoryConfig: {
      version: 1, url: 'https://fcccc.cc/k/1-{page}/', subjectFormatId: 'a',
      selectorSubjectFormatA: { selectLists: 'article.u-movie > a[title][href^="/p/"]' },
      selectNextPage: 'li.next-page a:contains(下一页)',
    },
  },
}] } })
function fengchePreset(): Subscription {
  return { url: fengcheUrl, name: '风车动漫', content: fengcheContent,
    sources: parseSubscription(fengcheContent), updatedAt: Date.now() }
}
const gongheguoContent = JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{
  factoryId: 'web-selector', version: 2, arguments: {
    name: '动漫共和国',
    searchConfig: {
      searchUrl: 'https://omofun.org.cn/u/?wd={keyword}', subjectFormatId: 'a',
      selectorSubjectFormatA: { selectLists: 'article.u-movie > a[title][href^="/p/"]' },
      channelFormatId: 'no-channel',
      selectorChannelFormatNoChannel: { selectEpisodes: '#video_list_li .vlink a', selectEpisodeLinks: '' },
      matchVideo: { addHeadersToVideo: { referer: 'https://omofun.org.cn/' } },
    },
    repositoryConfig: {
      version: 1, url: 'https://omofun.org.cn/h/1-{page}/', subjectFormatId: 'a',
      selectorSubjectFormatA: { selectLists: 'article.u-movie > a[title][href^="/p/"]' },
      selectNextPage: 'li.next-page a:contains(下一页)',
    },
  },
}] } })
function gongheguoPreset(): Subscription {
  return { url: gongheguoUrl, name: '动漫共和国', content: gongheguoContent,
    sources: parseSubscription(gongheguoContent), updatedAt: Date.now() }
}
const defaults: Subscription[] = [
  { url: 'https://sub.creamycake.org/v1/css1.json', name: '网页来源订阅', sources: [] },
]
const bridge = registerPlugin<{ fetchSubscription(options: { url: string }): Promise<{ content: string }> }>('SanyeSource')
export function subscriptionUrl(value: string): string {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('订阅地址不正确，请填写完整网址。') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname) || url.hostname.endsWith('.local')) throw new Error('请填写以 https:// 开头的公开订阅网址。')
  return url.toString()
}
export function genericWebsiteContent(url: string, html = ''): string {
  const parsed = new URL(url)
  const origin = parsed.origin
  const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/i)?.[0] || ''
  const action = form.match(/\baction\s*=\s*["']([^"']+)["']/i)?.[1] || ''
  const method = form.match(/\bmethod\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() || 'get'
  const inputNames = [...form.matchAll(/<input\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]!)
  const keywordName = inputNames.find(name => /^(wd|q|keyword|query|search|s)$/i.test(name))
  let searchUrl = ''
  if (keywordName && method === 'get') {
    const target = new URL(action || parsed.pathname, parsed)
    if (target.origin === origin && target.protocol === 'https:') {
      target.searchParams.set(keywordName, '{keyword}')
      searchUrl = target.href.replace('%7Bkeyword%7D', '{keyword}')
    }
  }
  const recognized = !!searchUrl
  const cards = html.includes('u-movie') ? 'article.u-movie > a[title]'
    : html.includes('stui-vodlist') ? '.stui-vodlist__detail h4.title a'
      : 'a[href*="/p/"], a[href*="/vod"], a[href*="/detail"], a[href*="/anime"]'
  return JSON.stringify({ exportedMediaSourceDataList: { mediaSources: [{
    factoryId: recognized ? 'web-selector' : 'sanye-pending', version: recognized ? 2 : 1, arguments: {
      name: parsed.hostname,
      searchConfig: {
        searchUrl: searchUrl || `${origin}/`,
        subjectFormatId: 'a',
        selectorSubjectFormatA: { selectLists: cards },
        channelFormatId: 'no-channel',
        selectorChannelFormatNoChannel: { selectEpisodes: 'a[href*="/v/"], a[href*="/play"], a[href*="/episode"]', selectEpisodeLinks: '' },
        matchVideo: { addHeadersToVideo: { referer: `${origin}/` } },
      },
      ...(recognized ? { repositoryConfig: {
        version: 1, url: `${origin}/page/{page}`, subjectFormatId: 'a',
        selectorSubjectFormatA: { selectLists: cards },
        selectNextPage: 'a:contains(下一页), a:contains(下页), a[rel="next"]',
      } } : {}),
      importStatus: recognized ? '待验证' : '规则待识别',
    },
  }] } })
}
function isHtmlDocument(value: string): boolean {
  return /^\s*(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(value)
}
export function normalizeSubscriptionContent(url: string, content: string): string {
  try { parseSubscription(content); return content } catch (cause) {
    if (isHtmlDocument(content)) return genericWebsiteContent(url, content)
    throw cause
  }
}
export function parseSubscription(content: string): SubscriptionSource[] {
  if (new TextEncoder().encode(content).byteLength > 2 * 1024 * 1024) throw new Error('订阅文件太大，不能超过 2MB。')
  let data
  try { data = JSON.parse(content) } catch { throw new Error('订阅文件格式不正确，请检查地址。') }
  const list = data?.exportedMediaSourceDataList?.mediaSources
  if (!Array.isArray(list) || !list.length || list.length > 100) throw new Error('订阅需包含 1 至 100 个来源，请检查文件。')
  return list.map((source: { factoryId?: unknown; version?: unknown; arguments?: { name?: unknown; importStatus?: unknown } }) => {
    if (!source || typeof source.factoryId !== 'string' || !source.factoryId.trim() || typeof source.version !== 'number' || !Number.isInteger(source.version) || source.version < 1 || typeof source.arguments?.name !== 'string' || !source.arguments.name.trim()) throw new Error('订阅内容不完整，请更换订阅。')
    return { name: source.arguments.name.slice(0, 120), factoryId: source.factoryId, version: source.version,
      ...(source.arguments.importStatus === '待验证' ? { provisional: true } : {}),
      ...(source.factoryId === 'sanye-retired' ? { retired: true } : {}) }
  })
}
export interface SubscriptionChoice { url: string; sourceIndex: number; name: string; subscriptionName: string; recommended: boolean }
function sourceReady(source?: Pick<SubscriptionSource, 'factoryId' | 'version'>) { return source?.factoryId === 'web-selector' && source.version === 2 }
// 默认合集只提供本轮模拟器实际解码并连续播放的站点；保留正文和原索引用于历史恢复。
const verifiedDefaultSources = new Set(['wedm'])
// 默认来源的真实分页目录；保留远端规则的原索引，历史记录仍指向同一站点。
const wedmRepositoryConfig = {
  version: 1,
  url: 'https://www.vdm5.com/show_ribendongman--------{page}---.html',
  subjectFormatId: 'a',
  selectorSubjectFormatA: { selectLists: '.stui-vodlist__box .stui-vodlist__detail h4.title a' },
  selectNextPage: 'a:contains(下一页)',
}
/** 删除已复测失败的默认规则；保留空槽位置，历史原索引不能被挪到别的站点。 */
export function pruneSubscriptionContent(url: string, content: string): string {
  if (url !== defaults[0].url) return content
  parseSubscription(content)
  const data = JSON.parse(content)
  let changed = false
  data.exportedMediaSourceDataList.mediaSources = data.exportedMediaSourceDataList.mediaSources.map((source: { factoryId: string; version: number; arguments: { name: string; repositoryConfig?: typeof wedmRepositoryConfig } }) => {
    if (source.factoryId === 'sanye-retired') return source
    if (sourceReady(source) && verifiedDefaultSources.has(source.arguments.name)) {
      if (source.arguments.name !== 'wedm' || source.arguments.repositoryConfig) return source
      changed = true
      return { ...source, arguments: { ...source.arguments, repositoryConfig: wedmRepositoryConfig } }
    }
    changed = true
    return { factoryId: 'sanye-retired', version: 1, arguments: { name: '已移除节点' } }
  })
  return changed ? JSON.stringify(data) : content
}
function sourceSelectable(item: Subscription | undefined, index: number) {
  const source = item?.sources[index]
  return sourceReady(source) && (item?.url !== defaults[0].url || verifiedDefaultSources.has(source!.name))
}
function firstSourceIndex(item?: Subscription) { return item?.sources.findIndex((_, index) => sourceSelectable(item, index)) ?? -1 }
function load(): { items: Subscription[]; active: string; activeSourceIndex: number } {
  try {
    const data = JSON.parse(localStorage.getItem(key) || 'null')
    if (!Array.isArray(data?.items) || data.items.length > 20) throw new Error()
    const allItems: Subscription[] = data.items.map((item: Subscription) => {
      const url = subscriptionUrl(item.url)
      if (url === fengcheUrl || url === gongheguoUrl) {
        const preset = url === fengcheUrl ? fengchePreset() : gongheguoPreset()
        return { ...preset, name: typeof item.name === 'string' ? item.name.slice(0, 80) : preset.name }
      }
      let content = item.content, sources: SubscriptionSource[] = []
      try { if (content) { content = pruneSubscriptionContent(url, content); sources = parseSubscription(content) } }
      catch { content = undefined }
      return { url, name: typeof item.name === 'string' ? item.name.slice(0, 80) : '来源订阅', content, updatedAt: content ? item.updatedAt : undefined, sources }
    })
    const items = [...allItems]
    if (localStorage.getItem(sitePresetKey) !== '1') {
      if (items.length < 20 && !items.some(item => item.url === fengcheUrl)) items.push(fengchePreset())
      if (items.length < 20 && !items.some(item => item.url === gongheguoUrl)) items.push(gongheguoPreset())
      try { localStorage.setItem(sitePresetKey, '1') } catch {}
    }
    const active = items.some((item: Subscription) => item.url === data.active) ? data.active : ''
    const item = items.find(item => item.url === active)
    const activeSourceIndex = active && Number.isInteger(data.activeSourceIndex) && sourceSelectable(item, data.activeSourceIndex)
      ? data.activeSourceIndex : firstSourceIndex(item)
    const migrated = { items, active, activeSourceIndex }
    try { localStorage.setItem(key, JSON.stringify(migrated)) } catch {}
    return migrated
  } catch {
    try { localStorage.setItem(sitePresetKey, '1') } catch {}
    return { items: [...defaults, fengchePreset(), gongheguoPreset()], active: '', activeSourceIndex: -1 }
  }
}
export const subscriptionState = ref(load())
export const subscriptionRequests = ref<Record<string, { loading: boolean; error: string }>>({})
const refreshes = new Map<string, Promise<void>>()
const refreshAttempts = new Map<string, number>()
/** 安卓管理入口每天更新缓存；失败后短暂退避，重新打开不会连续请求。 */
export function subscriptionNeedsRefresh(item: Subscription) {
  if (item.url === fengcheUrl || item.url === gongheguoUrl) return !item.content
  return (!item.content || !item.updatedAt || Date.now() - item.updatedAt >= 24 * 60 * 60 * 1000)
    && Date.now() - (refreshAttempts.get(item.url) || 0) >= 60_000
}
/** 以完整配置隔离搜索缓存；同一地址刷新后也不能继续使用旧规则。 */
export function activeSubscription() {
  return subscriptionState.value.items.find(item => item.url === subscriptionState.value.active && item.content)
}
export function activeSubscriptionContent() { return activeSubscription()?.content || '' }
export function activeSubscriptionSourceIndex() { return subscriptionState.value.activeSourceIndex }
export function subscriptionChoices(): SubscriptionChoice[] {
  return subscriptionState.value.items.flatMap(item => item.sources.flatMap((source, sourceIndex) => sourceSelectable(item, sourceIndex)
    ? [{ url: item.url, sourceIndex, name: item.url === defaults[0].url && source.name === '樱花动漫' ? '樱花动漫（订阅）' : source.name,
      subscriptionName: item.name, recommended: item.url === defaults[0].url && source.name === 'wedm' }] : []))
}
/** 地址也属于选择身份；两个订阅正文相同仍是一次真实切换。 */
export function activeSubscriptionScope() { return `${subscriptionState.value.active}\u0000${activeSubscriptionSourceIndex()}\u0000${activeSubscriptionContent()}` }
export function subscriptionCacheKey() {
  const item = activeSubscription()
  return item ? `${item.url}:${activeSubscriptionSourceIndex()}:${item.updatedAt}` : 'builtin'
}
export interface SubscriptionHit {
  title: string; sourceUrl: string; coverUrl?: string; summary?: string
  sourceIndex: number; kind?: 'web' | 'resource'; resourceUrl?: string
}
export async function searchSubscription(keyword: string, options?: import('./api/http').RequestOptions): Promise<SubscriptionHit[]> {
  const item = activeSubscription()
  if (!item?.content) return []
  const sourceIndex = activeSubscriptionSourceIndex()
  // 没有可选网页规则时仅检索 RSS 资源，不能借用订阅内其他网页规则。
  const hits = await http.post<Array<SubscriptionHit & { type?: string }>>('/search/subscription/search', {
    content: item.content, keyword, sourceIndex,
  }, { ...options, timeout: options?.timeout ?? 40_000, retries: 0 })
  return hits.map(hit => ({ ...hit, type: undefined, sourceIndex: sourceIndex >= 0 ? sourceIndex : 0, kind: hit.type === 'resource' ? 'resource' : 'web' }))
}
export async function previewSubscription(sourceUrl: string, sourceIndex: number, options?: import('./api/http').RequestOptions, title?: string) {
  const item = activeSubscription()
  if (!item?.content) throw new Error('请重新选择订阅。')
  return http.post<import('./api/anime').AnimeUrlPreviewResult>('/search/subscription/preview', { content: item.content, sourceIndex, sourceUrl, title }, { ...options, timeout: options?.timeout ?? 30_000, retries: 0 })
}
export async function resolveSubscription(sourceUrl: string, sourceIndex: number, options?: import('./api/http').RequestOptions) {
  const item = activeSubscription()
  if (!item?.content) throw new Error('请重新选择订阅。')
  return http.post<{ url: string; mimeType: string; warnings?: string[] }>('/search/subscription/resolve', { content: item.content, sourceIndex, sourceUrl }, { ...options, timeout: options?.timeout ?? 30_000, retries: 0 })
}
function persist(next: typeof subscriptionState.value) {
  localStorage.setItem(key, JSON.stringify(next))
  subscriptionState.value = next
}
export async function refreshSubscription(url: string, name?: string) {
  url = subscriptionUrl(url)
  const existingRequest = refreshes.get(url)
  if (existingRequest) return existingRequest
  refreshAttempts.set(url, Date.now())
  subscriptionRequests.value[url] = { loading: true, error: '' }
  const refresh = (async () => {
  const presetContent = url === fengcheUrl ? fengcheContent : url === gongheguoUrl ? gongheguoContent : ''
  const pending = presetContent ? Promise.resolve({ content: presetContent }) : Capacitor.isNativePlatform()
    ? bridge.fetchSubscription({ url })
    : http.get<{ content: string }>(`/search/subscription?url=${encodeURIComponent(url)}`, { timeout: 15_000 })
  let timer: ReturnType<typeof setTimeout> | undefined
  const request = await Promise.race([pending, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('订阅加载超时，请重试。原订阅未改变。')), 15_000)
  })]).finally(() => clearTimeout(timer))
  const content = pruneSubscriptionContent(url, normalizeSubscriptionContent(url, request.content))
  const sources = parseSubscription(content)
  const item = { url, name: name?.trim().slice(0, 80) || subscriptionState.value.items.find(item => item.url === url)?.name || new URL(url).hostname, sources, content, updatedAt: Date.now() }
  const items = subscriptionState.value.items
  const existing = items.some(entry => entry.url === url)
  if (!existing && items.length >= 20) throw new Error('最多保存 20 个订阅')
  const selectedIndex = subscriptionState.value.activeSourceIndex
  const activeSourceIndex = subscriptionState.value.active === url && !sourceSelectable(item, selectedIndex) ? firstSourceIndex(item) : selectedIndex
  persist({ ...subscriptionState.value, activeSourceIndex, items: existing ? items.map(entry => entry.url === url ? item : entry) : [...items, item] })
  })()
  refreshes.set(url, refresh)
  try { await refresh }
  catch (cause) {
    const message = cause instanceof Error ? cause.message : ''
    subscriptionRequests.value[url].error = /订阅地址发生重定向/.test(message)
      ? '该地址当前跳转到其他网站，无法导入为订阅。'
      : /订阅服务器未返回成功响应|订阅内容必须是单个 JSON/.test(message)
        ? '该地址未返回订阅规则，无法导入。'
        : /^(订阅地址不正确|请填写以 https:\/\/|订阅文件太大|订阅文件格式不正确|订阅需包含|订阅内容不完整|订阅加载超时|最多保存 20 个订阅)/.test(message)
          ? message : '订阅加载失败，请重试。原订阅未改变。'
    throw cause
  } finally {
    subscriptionRequests.value[url].loading = false
    refreshes.delete(url)
  }
}
export function addSitePreset(url: string, name?: string): boolean {
  url = subscriptionUrl(url)
  if (url !== fengcheUrl && url !== gongheguoUrl) return false
  const existing = subscriptionState.value.items.some(item => item.url === url)
  if (!existing && subscriptionState.value.items.length >= 20) throw new Error('最多保存 20 个订阅')
  const preset = url === fengcheUrl ? fengchePreset() : gongheguoPreset()
  if (name?.trim()) preset.name = name.trim().slice(0, 80)
  persist({ ...subscriptionState.value, items: existing
    ? subscriptionState.value.items.map(item => item.url === url ? { ...preset, name: name?.trim() ? preset.name : item.name } : item)
    : [...subscriptionState.value.items, preset] })
  return true
}
export function selectSubscription(url: string, sourceIndex?: number) {
  if (url && !subscriptionState.value.items.some(item => item.url === url)) throw new Error('订阅不存在。')
  const item = subscriptionState.value.items.find(item => item.url === url)
  const index = url ? sourceIndex ?? firstSourceIndex(item) : -1
  if (url && sourceIndex !== undefined && (!Number.isInteger(index) || !sourceSelectable(item, index))) throw new Error('来源不可用，请重新选择。')
  persist({ ...subscriptionState.value, active: url, activeSourceIndex: index })
}
export function removeSubscription(url: string) {
  persist({ ...subscriptionState.value, items: subscriptionState.value.items.filter(item => item.url !== url), active: subscriptionState.value.active === url ? '' : subscriptionState.value.active, activeSourceIndex: subscriptionState.value.active === url ? -1 : subscriptionState.value.activeSourceIndex })
}
/** 备份合并不删除本机订阅，不覆盖较新的缓存，也不自动切换当前来源。 */
export function mergeSubscriptionBackup(items: Subscription[]) {
  const merged = new Map(subscriptionState.value.items.map(item => [item.url, item]))
  for (const input of items) {
    const url = subscriptionUrl(input.url)
    const content = input.content ? pruneSubscriptionContent(url, input.content) : undefined
    const sources = content ? parseSubscription(content) : []
    const current = merged.get(url)
    if (current && (current.updatedAt || 0) >= (input.updatedAt || 0)) continue
    merged.set(url, { url, name: input.name.slice(0, 80), content, updatedAt: input.updatedAt, sources })
  }
  if (merged.size > 20) throw new Error('合并后订阅超过 20 个，请先整理本机订阅。')
  persist({ ...subscriptionState.value, items: [...merged.values()] })
}
