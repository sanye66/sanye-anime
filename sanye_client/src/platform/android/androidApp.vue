<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch as watchValue } from 'vue'
import type Hls from 'hls.js'
import { App } from '@capacitor/app'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { androidCatalog, type AndroidSettings, type FrameTargetSetting, type SavedMedia, type WatchHistory } from './catalog'
import { mediaType, playbackType, type MediaType } from './mediaSource'
import { androidSource, sourceContent, sourceCacheKey, sourceHitKey, savedSourceContext, persistSourceContext, clearHistorySourceContexts, historySourceBindingKey, migrateLegacySourceBindings, type SourceContext, type SourceEpisode, type SourceHit, type SourcePreview, type SourceSearchResult } from './source'
import { androidRepository } from './repository'
import { groupSearchVersions, createSearchVersionChecks, searchVersionKey, type SearchVersionGroup } from './searchVersions'
import { activeSubscription, activeSubscriptionContent, activeSubscriptionScope, activeSubscriptionSourceIndex, subscriptionChoices, subscriptionState, subscriptionRequests, subscriptionNeedsRefresh, refreshSubscription, selectSubscription } from '../../subscriptions'
import { recentSearches, rememberSearch, clearRecentSearches, removeRecentSearch } from './searchMemory'
import { catalogSnapshot, catalogSnapshotAsOf, type CatalogSnapshotItem } from './catalogSnapshot'
import { scheduleFromSnapshot } from './schedule'
import { titleKey } from '../../data/titleKey'
// 占位封面随包发布：Android 构建用相对资源路径，和随包目录封面走同一条导入方式。
import placeholderCover from './assets/anime-placeholder.svg'
import SubscriptionManager from '../../components/subscriptionManager.vue'
import AndroidCover from './androidCover.vue'
import AndroidDiagnostics from './androidDiagnostics.vue'
import AndroidBackup from './androidBackup.vue'
import { attachSystemPlayback } from './systemPlayback'
import { nativePlaybackAvailable, nextNativeSessionId, openNativePlayback, closeRetainedNativePlayback, failRetainedNativePlayback, type NativePlaybackProgress, type NativePlaybackSession } from './nativePlayback'
import { inlineMediaAvailable, inlineMediaLoader, prewarmInlineManifest } from './inlineMediaLoader'
import AndroidDownloads from './androidDownloads.vue'
import { androidDownloads, downloadsAvailable, validateDownloadUrl } from './downloads'
import { clearCoverCache, getCoverCacheStats, registerBundledCovers, startCoverCache } from './coverCache'
import { createPlaybackObservation, healthKey, recordPlaybackSample } from './experience'
import { parsePlaybackLine } from '../../video/playbackLines'
import { FRAME_RATE_OPTIONS, type FrameRateTarget } from '../../video/frameCadence'
import { ANIME4K_PROFILE_LABELS, type Anime4KProfile } from '../../video/anime4k'
import { ANDROID_ENHANCEMENT_LIMITS, MOBILE_ANIME4K_PROFILES } from '../../video/enhancementLimits'
import { createFragmentCache } from '../../video/hlsFragmentCache'
import { hlsPlaybackConfig, HlsMediaRecovery } from '../../video/hlsPlaybackPolicy'
import { MotionStabilityPolicy } from '../../video/motionStabilityPolicy'
import { accumulatePlaybackStabilityTally, createPlaybackStabilityTally } from '../../video/playbackStabilityTally'
import type { InterpolationStats, RealtimeInterpolationSession } from '../../video/realtimeInterpolation'
import { AdaptationNotice } from '../../video/adaptationNotice'

registerBundledCovers([placeholderCover, ...catalogSnapshot.map(item => item.coverUrl)])

const items = ref<SavedMedia[]>([])
const error = ref('')
/** 当前错误对应的重试动作；没有可重试的动作时不渲染「重试读取」，避免把用户引到无关操作上。 */
const retryAction = ref<null | (() => void)>(null)
/** 片库是否仍在读取：读取完成前显示加载占位，不要先闪一次「本机还没有保存作品」。 */
const catalogLoading = ref(true)
const historyError = ref('')
/** 一次性提示：同一条文案在一次运行里只出现一次，避免同一个错误在多个页面反复刷屏。 */
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | null = null
const shownNotices = new Set<string>()
const historyLoading = ref(true)
const filter = ref<'all' | 'favorites'>('all')
type Section = 'home' | 'search' | 'detail' | 'library' | 'history' | 'schedule' | 'settings'
const section = ref<Section>('home')
const detailReturn = ref<Section>('home')
const watchPage = ref(false)
const keyword = ref('')
const page = ref(1)
const history = ref<WatchHistory[]>([])
let historyReadRequest = 0
const settings = ref<AndroidSettings>({ theme: 'system', autoPlay: false, playbackRate: 1, qualityProfile: 'off', frameTarget: 'off', volume: 1 })
/** 播放器内可选的本机播放速度，与落盘设置使用相同取值。 */
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const
/** 「我的」页关于分区显示的版本号；读取失败时保持占位文案。 */
const appVersion = ref('')
const selected = ref<SavedMedia | null>(null)
let downloadedPlaybackUrl = ''
let downloadedNativeUrl = ''
let downloadedPlaybackId = ''
let offlineResumePosition = 0
const nativePlaybackActive = ref(false)
let media3Session: NativePlaybackSession | undefined
let retainedNativeId = ''
let nativePlaybackPosition: NativePlaybackProgress | undefined
let nativeOpening: AbortController | undefined
const downloadBusy = ref(false)
const canDownloadCurrent = computed(() => {
  if (!downloadsAvailable() || !selected.value || selected.value.url === downloadedPlaybackUrl) return false
  try { validateDownloadUrl(activePlaybackUrl.value); return true } catch { return false }
})
const video = ref<HTMLVideoElement | null>(null)
const playerStage = ref<HTMLDivElement | null>(null)
const stageFullscreen = ref(false)
const nativePlayer = registerPlugin<{
  setLandscape(options: { enabled: boolean }): Promise<void>
  setImmersive(options: { enabled: boolean }): Promise<void>
  setKeepAwake(options: { enabled: boolean }): Promise<void>
}>('SanyePlayer')
function setNativeLandscape(enabled: boolean) {
  if (Capacitor.isNativePlatform()) void nativePlayer.setLandscape({ enabled }).catch(() => {})
}
/** 横屏播放时收起系统栏，退出后恢复；WebView 不支持时保持默认状态。 */
function setNativeImmersive(enabled: boolean) {
  if (Capacitor.isNativePlatform()) void nativePlayer.setImmersive({ enabled }).catch(() => {})
}
/** 播放中保持屏幕常亮，暂停、出错或退出播放器时立刻恢复系统休眠策略。 */
function setNativeKeepAwake(enabled: boolean) {
  if (Capacitor.isNativePlatform()) void nativePlayer.setKeepAwake({ enabled }).catch(() => {})
}
const playing = ref(false)
const autoMuted = ref(false)
const playbackSeconds = ref(0)
const playbackDuration = ref(0)
const playbackVolume = ref(1)
const seekingPlayback = ref(false)
const seekDragging = ref(false)
const seekDragSeconds = ref(0)
const seekBar = ref<HTMLDivElement | null>(null)
const controlsBar = ref<HTMLDivElement | null>(null)
const menuAnchorRight = ref<number | null>(null)
const menuAnchorStyle = computed(() => (menuAnchorRight.value === null
  ? undefined
  : { marginRight: `${menuAnchorRight.value}px` }))
const playerError = ref('')
const sourceKeyword = ref('')
const sourceKeywordInput = ref<HTMLInputElement | null>(null)
function openSearchInput() {
  sourceKeyword.value = ''
  section.value = 'search'
  void nextTick(() => sourceKeywordInput.value?.focus())
}
const sourceHits = ref<SourceHit[]>([])
const failedCovers = ref(new Set<string>())
const repositoryHits = ref<SourceHit[]>([])
const repositoryLoading = ref(false)
const repositoryNextPages = ref<Record<number, number>>({})
const repositoryIsDirectory = ref(false)
const repositoryTruncated = ref(false)
const repositoryDisplayLimit = ref(40)
const repositoryQuery = ref('')
const repositoryOrder = ref<'source' | 'title'>('source')
const repositorySortOpen = ref(false)
const repositoryError = ref('')
const repositoryCache = new Map<string, { hits: SourceHit[]; nextPages: Record<number, number>; directory: boolean; truncated: boolean; limit: number; expires: number }>()
let repositoryRequest = 0
const currentSubscription = computed(() => subscriptionState.value.items.find(item => item.url === subscriptionState.value.active))
const usingSubscription = computed(() => !!currentSubscription.value)
const sourcePicker = ref<HTMLDialogElement>()
const pickingSource = ref('')
const pickerError = ref('')
let pickerIntent = 0
function dismissSourcePicker() { pickerIntent++; pickingSource.value = ''; sourcePicker.value?.close() }
const availableSourceChoices = computed(subscriptionChoices)
async function chooseSubscription(url: string, sourceIndex?: number) {
  pickingSource.value = url || 'builtin'; pickerError.value = ''
  const intent = ++pickerIntent
  try {
    if (intent !== pickerIntent) return
    selectSubscription(url, sourceIndex)
    sourcePicker.value?.close()
    const chosen = subscriptionState.value.items.find(item => item.url === url)
    if (chosen && subscriptionNeedsRefresh(chosen)) void refreshSubscription(url).catch(() => {})
  } catch { if (intent === pickerIntent) pickerError.value = '读取失败，请重试。当前来源未改变。' }
  finally { if (intent === pickerIntent) pickingSource.value = '' }
}
function showSourcePicker() {
  pickerError.value = ''; sourcePicker.value?.showModal()
  for (const item of subscriptionState.value.items) if (subscriptionNeedsRefresh(item)) void refreshSubscription(item.url).catch(() => {})
}
const recentKeywords = ref(recentSearches(activeSubscriptionScope()))
function clearSearchMemory() { clearRecentSearches(activeSubscriptionScope()); recentKeywords.value = [] }
function removeSearchMemory(word: string) { recentKeywords.value = removeRecentSearch(activeSubscriptionScope(), word) }
const sourceLabel = computed(() => availableSourceChoices.value.find(choice => choice.url === subscriptionState.value.active && choice.sourceIndex === activeSubscriptionSourceIndex())?.name || currentSubscription.value?.name || '樱花动漫')
const personalPanel = ref<'subscriptions' | 'downloads' | 'storage' | 'backup' | 'diagnostics'>('subscriptions')
const currentSourceStatus = computed(() => {
  const item = currentSubscription.value
  if (!item) return ''
  const state = subscriptionRequests.value[item.url]
  if (state?.loading) return item.content ? '更新中' : '读取中'
  if (state?.error) return item.content ? '更新失败，使用缓存' : '读取失败，请重试'
  if (!item.content) return '未读取，请重试'
  return ''
})
function hitSourceLabel(hit: SourceHit) {
  if (hit.sourceName) return hit.sourceName
  try { return new URL(hit.sourceUrl).hostname } catch { return '来源未知' }
}
const searchSourceFilter = ref('')
function searchSourceKey(hit: SourceHit) { return `${hit.sourceIndex ?? ''}\u0000${hitSourceLabel(hit)}` }
const searchSourceGroups = computed(() => {
  const groups = new Map<string, { key: string; name: string; count: number }>()
  for (const hit of groupSearchVersions(sourceHits.value)) { const key = searchSourceKey(hit), group = groups.get(key); if (group) group.count++; else groups.set(key, { key, name: hitSourceLabel(hit), count: 1 }) }
  return [...groups.values()]
})
const rejectedSearchVersions = ref(new Set<string>())
const searchVersionChecks = createSearchVersionChecks({
  preview: options => fetchPreview(options.sourceUrl, false, options.sourceContext),
  resolve: (url, context) => androidSource.resolve(url, context),
  onResult(result) {
    if (result.status !== 'unsupported') return
    rejectedSearchVersions.value = new Set(searchVersionChecks.rejectedKeys)
  },
})
const groupedSearchHits = computed(() => groupSearchVersions(sourceHits.value))
const visibleSourceHits = computed(() => searchSourceFilter.value ? groupedSearchHits.value.filter(hit => searchSourceKey(hit) === searchSourceFilter.value) : groupedSearchHits.value)
function searchVersionNotice(group: SearchVersionGroup): string {
  const unavailable = group.versions.filter(hit => rejectedSearchVersions.value.has(searchVersionKey(hit))).length
  return unavailable === group.versions.length ? '播放地址待重试' : unavailable ? `${unavailable} 个版本待重试` : ''
}
async function watchSearchVersions(group: SearchVersionGroup) {
  searchVersionChecks.cancel()
  const versions = group.versions
  const first = versions[0]
  if (!first) return
  await watchSearchResult(first.sourceUrl, undefined, versions.slice(1).map(hit => hit.sourceUrl), first)
}
const repositoryEntries = computed(() => {
  const ranked = [...repositoryHits.value].filter(hit => hit.kind !== 'resource')
    .filter(hit => hit.title.toLocaleLowerCase().includes(repositoryQuery.value.trim().toLocaleLowerCase()))
    .sort((a, b) => repositoryOrder.value === 'title' ? a.title.localeCompare(b.title, 'zh-CN', { numeric: true }) : 0)
  const seen = new Set<string>()
  return ranked.filter(hit => { const key = titleKey(hit.title) || hit.sourceUrl; if (seen.has(key)) return false; seen.add(key); return true })
})
const displayedRepositoryEntries = computed(() => repositoryEntries.value.slice(0, repositoryDisplayLimit.value))
const repositoryHasNextPage = computed(() => Object.keys(repositoryNextPages.value).length > 0)
function showMoreRepository() {
  if (repositoryDisplayLimit.value < repositoryEntries.value.length) {
    repositoryDisplayLimit.value += 40
    const cached = repositoryCache.get(activeSubscriptionScope())
    if (cached) cached.limit = repositoryDisplayLimit.value
    return
  }
  if (repositoryHasNextPage.value) void loadRepository(false, true)
}
watchValue(() => [...repositoryEntries.value, ...sourceHits.value].slice(0, 8).map(hit => displayCover(hit.title, hit.sourceUrl, hit.coverUrl)), covers => {
  // 只为首屏最多四个封面主机建连；不预下载整页图片。
  const origins = new Set<string>()
  for (const cover of covers) {
    try { const url = new URL(cover); if (url.protocol === 'https:' && origins.size < 4) origins.add(url.origin) } catch { /* 随包资源不需要建连 */ }
  }
  for (const origin of origins) warmMediaHost(origin)
})
async function loadRepository(refresh = false, more = false) {
  const content = activeSubscriptionContent()
  const scope = activeSubscriptionScope()
  const request = ++repositoryRequest
  if (!content) {
    repositoryLoading.value = false
    repositoryError.value = usingSubscription.value ? '来源未就绪，请重试。' : ''
    return
  }
  repositoryLoading.value = true; repositoryError.value = ''
  const cached = repositoryCache.get(scope)
  if (!refresh && !more && cached && cached.expires > Date.now()) {
    repositoryHits.value = [...cached.hits]
    repositoryNextPages.value = { ...cached.nextPages }
    repositoryIsDirectory.value = cached.directory
    repositoryTruncated.value = cached.truncated
    repositoryDisplayLimit.value = cached.limit
    repositoryLoading.value = false
    return
  }
  if (refresh || !more) { repositoryNextPages.value = {}; repositoryTruncated.value = false; repositoryDisplayLimit.value = 40 }
  else repositoryDisplayLimit.value += 40
  const publish = (result: SourceSearchResult) => {
    if (request !== repositoryRequest || activeSubscriptionScope() !== scope) return
    const merged = new Map(repositoryHits.value.map(hit => [sourceHitKey(hit), hit]))
    for (const hit of result.hits) merged.set(sourceHitKey(hit), hit)
    repositoryHits.value = [...merged.values()]
  }
  let repositoryComplete = false
  try {
    const capabilities = await androidRepository.capabilities(content, activeSubscriptionSourceIndex())
    if (request !== repositoryRequest || activeSubscriptionScope() !== scope) return
    const declared = capabilities.filter(capability => capability.repository && capability.search)
    repositoryIsDirectory.value = declared.length > 0
    if (declared.length) {
      if (!more && request === repositoryRequest && activeSubscriptionScope() === scope) repositoryHits.value = []
      const pending = declared.slice(0, 8).filter(capability => !more || repositoryNextPages.value[capability.sourceIndex])
      let cursor = 0, failures = 0
      const read = async () => {
        while (cursor < pending.length && request === repositoryRequest && activeSubscriptionScope() === scope) {
          const capability = pending[cursor++]!
          try {
            const page = await androidRepository.readPage({ content, sourceIndex: capability.sourceIndex, page: more ? repositoryNextPages.value[capability.sourceIndex] : 1 })
            if (request !== repositoryRequest || activeSubscriptionScope() !== scope) return
            publish({ hits: page.hits, warnings: page.warnings })
            if (page.truncated) repositoryTruncated.value = true
            if (page.warnings?.length) repositoryError.value = '部分来源暂不可用，可重试。'
            if (page.hasMore && page.nextPage) repositoryNextPages.value[capability.sourceIndex] = page.nextPage
            else delete repositoryNextPages.value[capability.sourceIndex]
          } catch { failures++ }
        }
      }
      await Promise.all([read(), read()])
      if (failures && request === repositoryRequest) repositoryError.value = repositoryHits.value.length ? '部分来源未返回' : '目录读取失败，请重试'
      repositoryComplete = failures === 0 && !repositoryError.value
    } else {
      if (more) return
      // 未声明目录规则的来源继续使用受控搜索候选，不把搜索结果冒充完整目录。
      const result = await androidSource.search({ keyword: '动漫', refresh, background: true }, publish)
      publish(result)
      if (result.warnings?.length && request === repositoryRequest) repositoryError.value = '部分来源暂不可用，可重试。'
      repositoryComplete = !result.warnings?.length && (!result.total || result.completed === undefined || result.completed >= result.total)
    }
    if (request !== repositoryRequest) return
    if (!repositoryEntries.value.length && !repositoryError.value) repositoryError.value = '暂无作品，试试搜索。'
  } catch (cause) {
    // 前台搜索抢占后台读取不是来源故障，保留已经得到的候选。
    if (request === repositoryRequest && (cause as { code?: string })?.code !== 'E_SEARCH_CANCELLED') repositoryError.value = '订阅作品读取失败，请重试或搜索具体作品名。'
  }
  finally {
    if (request === repositoryRequest && activeSubscriptionScope() === scope) {
      repositoryLoading.value = false
      if (repositoryComplete && repositoryHits.value.length && !repositoryError.value) {
        repositoryCache.delete(scope)
        repositoryCache.set(scope, { hits: [...repositoryHits.value], nextPages: { ...repositoryNextPages.value }, directory: repositoryIsDirectory.value, truncated: repositoryTruncated.value, limit: repositoryDisplayLimit.value, expires: Date.now() + 5 * 60_000 })
        if (repositoryCache.size > 4) repositoryCache.delete(repositoryCache.keys().next().value!)
      }
    }
  }
}
function openRepositoryHit(hit: SourceHit) {
  detailReturn.value = section.value === 'library' ? 'library' : 'home'
  void previewSource(hit.sourceUrl, false, hit)
}
const sourcePreview = ref<SourcePreview | null>(null)
const sourceLoading = ref(false)
const searchLoading = ref(false)
const searchProgress = ref('')
/** 是否真的搜过：没搜过就不该显示「没有找到匹配作品」。 */
const sourceSearched = ref(false)
const sourceError = ref('')
const activeEpisodeId = ref('direct')
const activeEpisodeTitle = ref('视频')
const activeLineId = ref('main')
const qualityLevels = ref<{ index: number; label: string; fps: number | null }[]>([])
const chosenQuality = ref(-1)
const chosenFps = ref('auto')
const activeLevel = ref(-1)
const qualityProfile = ref<Anime4KProfile | 'off'>('off')
const frameTarget = ref<FrameRateTarget | 'off'>('off')
const chromeMenu = ref<'quality' | 'fps' | 'episodes' | 'volume' | null>(null)
/** 画面亮度：在画面上左右滑动调，只压暗本机显示层，不改媒体本身与系统亮度。 */
const screenBrightness = ref(1)
const playerDim = computed(() => Math.max(0, Math.min(0.8, 1 - screenBrightness.value)))
/** 跟随系统时按钮图标要反映系统当前外观，否则暗色系统上会显示成“切浅色”。 */
const systemPrefersLight = ref(typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches)
const appearanceLight = computed(() => settings.value.theme === 'light' || (settings.value.theme === 'system' && systemPrefersLight.value))
const lightSchemeQuery = typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: light)')
function onSystemSchemeChange(event: MediaQueryListEvent) {
  systemPrefersLight.value = event.matches
}
/** 底部导航统一用同一套线性图标，避免不同字形大小不一。 */
const NAV_ICONS: Record<string, string[]> = {
  home: ['M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M15.8 15.8L20 20'],
  library: ['M4.5 4.5h6v6h-6z', 'M13.5 4.5h6v6h-6z', 'M4.5 13.5h6v6h-6z', 'M13.5 13.5h6v6h-6z'],
  schedule: ['M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z', 'M12 8.5V12l2.5 2'],
  history: ['M4.5 7h15', 'M4.5 12h15', 'M4.5 17h9'],
  settings: ['M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', 'M5.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5'],
}
/**
 * 界面图标统一走线性 SVG（VQ-61），与底部导航同一套描边风格。
 * 此前顶栏用 ⌕／☀／☾、播放器用 ▶／❚❚／⛶／⤢／🔊／🔇，都是自带字形的符号字符：
 * 不同码位会落到不同系统字体，实测同一行的字面高度与基线并不一致，浅色/深色下还会被系统 emoji 字体接管。
 */
const ICONS: Record<string, string[]> = {
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z', 'M15.8 15.8L20 20'],
  sun: ['M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z', 'M12 3.2v1.9', 'M12 18.9v1.9', 'M3.2 12h1.9', 'M18.9 12h1.9', 'M5.8 5.8l1.4 1.4', 'M16.8 16.8l1.4 1.4', 'M18.2 5.8l-1.4 1.4', 'M7.2 16.8l-1.4 1.4'],
  moon: ['M20.2 13.6A8.2 8.2 0 0 1 10.4 3.8a8.2 8.2 0 1 0 9.8 9.8z'],
  back: ['M14.5 5.5L8 12l6.5 6.5'],
  arrow: ['M5 12h13', 'M12.5 6.5L19 12l-6.5 5.5'],
  play: ['M8.5 5.5v13L19 12z'],
  pause: ['M9.5 5.5v13', 'M14.5 5.5v13'],
  volume: ['M5 9.8h2.8L12 6.4v11.2L7.8 14.2H5z', 'M15.4 9.4a4 4 0 0 1 0 5.2'],
  mute: ['M5 9.8h2.8L12 6.4v11.2L7.8 14.2H5z', 'M15.2 10.2l4 3.6', 'M19.2 10.2l-4 3.6'],
  expand: ['M4.5 9.5V4.5h5', 'M19.5 14.5v5h-5', 'M14.5 4.5h5v5', 'M9.5 19.5h-5v-5'],
  shrink: ['M9.5 4.5v5h-5', 'M14.5 19.5v-5h5', 'M19.5 9.5h-5v-5', 'M4.5 14.5h5v5'],
  brightness: ['M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z', 'M12 3.2v1.9', 'M12 18.9v1.9', 'M3.2 12h1.9', 'M18.9 12h1.9'],
  clock: ['M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8z', 'M12 8.4V12l2.6 2'],
  alert: ['M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8z', 'M12 8.2v4.6', 'M12 15.6v.1'],
}
const chromeVisible = ref(true)
const playbackEnded = ref(false)
/** 首帧到达前保留封面，避免刚进播放器就看到纯黑画面。 */
const hasFirstFrame = ref(false)
let playbackObservation: ReturnType<typeof createPlaybackObservation> | undefined
let releaseSystemPlayback: (() => void) | undefined
const lineNotice = ref('')
const enhancementState = ref<'idle' | 'starting' | 'active' | 'failed'>('idle')
const enhancementStats = ref<InterpolationStats | null>(null)
/**
 * GPU 运动估计的稳定性护栏（VQ-49）：健康窗口的内容倒退与跨周期跳变应为 0，
 * 连续两个脏窗口判定本机不适合 GPU，本次运行内不再尝试（用户重选档位会重新给一次机会）。
 */
const motionStability = new MotionStabilityPolicy()
let forceCpuFlowBackend = false
/** 稳定模式（VQ-55）：GPU 光流迟到拖累呈现时收紧分析网格，让运动场更早到达。 */
let flowConservative = false
/** 定位、换集与起播后的静默窗口：这段窗口内的内容跳变来自播放段边界，不计入后端判定。 */
let motionGuardResumeAt = 0
/** 档位或帧率被自动平衡时的瞬时提示，口径与桌面端 `AdaptationNotice` 一致。 */
const adaptationNotice = new AdaptationNotice()
/**
 * 舞台内提示（VQ-61）：放大/全屏时舞台是 `position: fixed; inset: 0; z-index: 30`，
 * 舞台外的线路提示与错误块（.android-player-notice／.android-player-error）完全看不见——
 * 用户只看到黑屏，也没有任何重试入口。这里把必须让用户看到的信息汇总成一条舞台内提示；
 * 未放大时仍用舞台外的原有提示，避免同一条文案出现两次。
 */
const buffering = ref(false)
const switchingLine = ref(false)
const backgroundPaused = ref(false)
const stageAlert = computed<{ text: string; action: '' | 'retry' | 'switch' | 'resume'; icon: string; urgent: boolean } | null>(() => {
  // 放大/全屏时舞台覆盖整个视口，所有提示都只能走这里；
  // 竖屏（未放大）时错误与线路提示仍用舞台外的原有位置，但「缓冲/切换/后台恢复」这三类
  // 原本完全没有提示，只有舞台内才有位置承载，所以也走这里（VQ-61）。
  if (!stageFullscreen.value && !backgroundPaused.value && !buffering.value && !switchingLine.value) return null
  if (playerError.value) return { text: playerError.value, action: alternatePlayableEpisodes.value.length ? 'switch' : 'retry', icon: 'alert', urgent: true }
  if (sourceError.value) return { text: sourceError.value, action: 'retry', icon: 'alert', urgent: true }
  if (backgroundPaused.value) return { text: '已从后台返回，画面已暂停。', action: 'resume', icon: 'play', urgent: false }
  if (switchingLine.value) return { text: '正在切换线路…', action: '', icon: 'clock', urgent: false }
  if (buffering.value) return { text: '网络较慢，正在缓冲…', action: '', icon: 'clock', urgent: false }
  if (lineNotice.value) return { text: lineNotice.value, action: '', icon: 'clock', urgent: false }
  return null
})
const qualityNotice = ref('')
let qualityNoticeTimer: number | undefined
function showQualityNotice(message: string) {
  if (!message) return
  qualityNotice.value = message
  if (qualityNoticeTimer !== undefined) window.clearTimeout(qualityNoticeTimer)
  qualityNoticeTimer = window.setTimeout(() => { qualityNotice.value = '' }, 3200)
}
/**
 * 画面里真正生效的画质档：会话已自动降档时按钮显示实际档位（用户请求档位仍保留在菜单里，
 * 与桌面端「菜单跟随生效档位、选择不写回」的口径一致），否则看不出「选了均衡其实跑的是性能」。
 */
const effectiveQualityProfile = computed<Anime4KProfile | 'off'>(() => {
  const stats = enhancementStats.value
  if (enhancementState.value !== 'active' || !stats) return qualityProfile.value
  return stats.effectiveProfile === 'off' ? qualityProfile.value : stats.effectiveProfile
})
/** 当前作品的来源候选：随包目录会给主来源与备用来源，搜索命中或片库作品只有一个。 */
const sourceQueue = ref<string[]>([])
const sourceTried = ref<string[]>([])
/**
 * 已有线路池：随包目录作品在 PC 随包里已核验的公开 HLS 直链。
 * 外站线路不可用或超过起播预算时静默接管播放，不再让用户等来源站往返。
 */
const bundledPool = ref<SourceEpisode[]>([])
/** 当前可接管的随包同名作品：接管时详情页也切到它的已有线路，列表不留失效的外站选集。 */
const bundledWork = ref<CatalogSnapshotItem | null>(null)
/**
 * 外站预览预算：超过才回退已有线路。与 PC 端的 8 秒口径一致——
 * 回退太早会把只是慢的线路判死，用户看到的是一次不必要的“降级”。
 */
const BUNDLED_TAKEOVER_BUDGET_MS = 8_000
/** 当前交给播放器的媒体地址，用于换线时跳过正在播的那一条。 */
const activePlaybackUrl = ref('')
let hls: Hls | null = null
/** 当前 <video> 上挂着的 volumechange 处理函数：换集时先摘旧的再挂新的，避免监听器泄漏（VQ-61）。 */
let volumeChangeHandler: (() => void) | null = null
/**
 * 分片缓存（VQ-48）：跨播放会话共用一份，换集、回看与重新进入同一集都能命中已下载分片；
 * 上限按手机留白收窄到 64MB，只有点播分片入库，直播清单不缓存。
 * 命中时沿用原传输耗时上报，避免内存命中把 ABR 带宽估计抬高。
 */
let fragmentCacheHandle: ReturnType<typeof createFragmentCache> | null = null
let fragmentCacheScope = ''
function androidFragmentCache(HlsConstructor: Parameters<typeof createFragmentCache>[0], loader?: import('hls.js').HlsConfig['loader'], scope = '') {
  if (scope !== fragmentCacheScope) { fragmentCacheHandle?.clear(); fragmentCacheHandle = null; fragmentCacheScope = scope }
  if (!fragmentCacheHandle) {
    const runtime = loader ? { DefaultConfig: { ...HlsConstructor.DefaultConfig, loader } } as typeof HlsConstructor : HlsConstructor
    fragmentCacheHandle = createFragmentCache(runtime, () => !hls?.latestLevelDetails?.live, 64 * 1024 * 1024)
  }
  return fragmentCacheHandle
}
let enhancementSession: RealtimeInterpolationSession | null = null
/** 当前会话是否在执行补帧：原地换档只在「补帧与否」不变时可用（VQ-59）。 */
let sessionInterpolating = false
/** 定位预览的收尾计时器（VQ-59）。 */
let previewTimer: number | undefined
/**
 * 失败后的降档重试档位（VQ-53）。
 *
 * 手机上跑不动 CNN 档位时，直接退回原画会让用户看到「开了画质反而更差」；
 * 「性能」档通常仍能工作，所以先降一档重试一次，仍然失败才退回原画并提示。
 * 用户重新选档或换了作品都会清空，保证每次都是完整档位重新试。
 */
let enhancementRetryProfile: Anime4KProfile | null = null
/** 返回 true 表示已发起降档重试，调用方不要再走失败提示。 */
function retryWithLighterProfile(): boolean {
  if (qualityProfile.value === 'off' || qualityProfile.value === 'fast' || enhancementRetryProfile !== null) return false
  enhancementRetryProfile = 'fast'
  void applyEnhancement()
  return true
}
let enhancementRequest = 0
let enhancementAudioUsed = false
let nativeFullscreenActive = false
let playbackGeneration = 0
let episodeRequest = 0
let previewRequest = 0
let searchRequest = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null
let chromeTimer: number | undefined
const lineFallbackTried = new Set<string>()
const previewCache = new Map<string, { expires: number; value: SourcePreview }>()
const previewPending = new Map<string, Promise<SourcePreview>>()
/** 当前列表对应的关键词：同一关键词重复搜索时先不清空列表，避免中途看起来“搜不到”。 */
let lastHitsKeyword = ''
let lastSavedAt = 0
let progressQueue = Promise.resolve()
let backListener: PluginListenerHandle | null = null
/**
 * 组件是否已卸载（VQ-62）。
 *
 * `App.addListener` 返回的是 Promise：如果它在组件卸载之后才落地，卸载钩子里拿到的
 * `backListener` 还是 null，这个原生监听就永久留在桥接侧，下一次挂载再叠一条——
 * 表现为返回键被处理两次（例如一次退全屏、一次退播放器）。
 */
let unmounted = false
const filtered = computed(() => items.value.filter((item) =>
  (filter.value === 'all' || item.favorite) && item.title.toLocaleLowerCase().includes(keyword.value.trim().toLocaleLowerCase()),
))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / 20)))
const visible = computed(() => filtered.value.slice((page.value - 1) * 20, page.value * 20))
watchValue([filter, keyword], () => { page.value = 1 })
watchValue(pageCount, (count) => { page.value = Math.min(page.value, count) })
/** 上一次所在分区：从详情返回搜索结果要保留列表，只有重新点搜索入口才算新检索。 */
let previousSection = section.value
const sectionScroll = new Map<string, number>()
let navigationRevision = 0
watchValue(section, (next) => {
  sectionScroll.set(previousSection, window.scrollY)
  const revision = ++navigationRevision
  void nextTick().then(() => { if (revision === navigationRevision) window.scrollTo({ top: next === 'detail' ? 0 : sectionScroll.get(next) || 0, behavior: 'instant' }) })
  if (next === 'history' || next === 'home') void reloadHistory()
  if (previousSection === 'detail' && next === 'search') sourceError.value = ''
  // 重新进搜索页（而不是从详情返回）等于开一次新检索：上一次的关键词、结果与空态都不再保留。
  // 跨分区回来保留当前检索，订阅切换负责清掉旧作用域。
  previousSection = next
  if (next !== 'detail' && (watchPage.value || selected.value)) { watchPage.value = false; if (selected.value) void closePlayer() }
})

/** 输入即搜：停止输入 280ms 后自动检索；同一关键词不重复打来源。 */
watchValue(sourceKeyword, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  const keyword = value.trim().toLocaleLowerCase()
  if (!keyword) {
    searchRequest++; searchLoading.value = false; searchInFlightKeyword = ''
    sourceHits.value = []; sourceSearched.value = false; sourceError.value = ''; searchProgress.value = ''
    return
  }
  if (`${activeSubscriptionScope()}\u0000${keyword}` === lastHitsKeyword) return
  searchTimer = setTimeout(() => { searchTimer = null; void searchSources() }, 280)
})
const previewSaved = computed(() => items.value.find(item => item.url === sourcePreview.value?.sourceUrl
  && sourceCacheKey(item.url, item.sourceContext ?? savedSourceContext(`saved:${item.id}`) ?? { content: '' }) === sourceCacheKey(item.url, sourcePreview.value?.sourceContext)))
const previewCover = computed(() => sourcePreview.value ? displayCover(sourcePreview.value.title, sourcePreview.value.sourceUrl, sourcePreview.value.coverUrl) : '')
/** 播放器底图优先用已保存作品封面，其次当前来源预览封面，最后按标题回退随包封面。 */
const playerArtwork = computed(() => {
  const item = selected.value
  if (!item) return ''
  return item.coverUrl || (sourcePreview.value?.sourceUrl === item.url ? sourcePreview.value?.coverUrl : '') || savedCover(item)
})
/** 首帧到达前保留封面，只有真正有画面时才让出视频区域。 */
const showPoster = computed(() => !hasFirstFrame.value && !playbackEnded.value && !!playerArtwork.value && !failedCovers.value.has(playerArtwork.value))
/** 备用来源按钮：当前在主来源时给出下一条候选，否则回到主来源。 */
const alternateMovieSource = computed(() => {
  const primary = sourceTried.value[0] ?? ''
  const current = sourcePreview.value?.sourceUrl ?? ''
  if (!primary || !current) return ''
  if (current === primary) return sourceQueue.value[0] ?? sourceTried.value[1] ?? ''
  return primary
})
const alternateSourceLabel = computed(() => sourcePreview.value?.sourceUrl === sourceTried.value[0] ? '切换备用来源' : '返回原来源')
function belongsToActiveSubscription(context?: SourceContext) {
  if (!usingSubscription.value) return true
  const content = activeSubscriptionContent()
  return !!content && context?.content === content && context.sourceIndex === activeSubscriptionSourceIndex()
}
const currentPreviewEpisodes = computed(() => {
  const preview = sourcePreview.value
  if (!preview || !belongsToActiveSubscription(preview.sourceContext)) return []
  const seen = new Set<string>()
  return preview.episodes.filter((episode) => {
    if (!belongsToActiveSubscription(episode.sourceContext ?? preview.sourceContext)) return false
    const key = `${episode.lineId || 'main'}\u0000${episode.sourceUrl || episode.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})
const playerEpisodes = computed(() => sourcePreview.value && selected.value?.url === sourcePreview.value.sourceUrl ? currentPreviewEpisodes.value : [])
function episodeNumberKey(episode: SourceEpisode): string {
  try {
    const path = new URL(episode.sourceUrl || episode.id).pathname.replace(/\/$/, '')
    const match = path.match(/^\/v\/[^/]+-(\d+)$/) ?? path.match(/^\/v\/[^/]+-\d+-(\d+)$/)
    return match?.[1] || episode.title.replace(/\s+/g, '').match(/(?:第|EP|E)(\d+)/i)?.[1] || episode.id
  } catch { return episode.title.replace(/\s+/g, '').match(/(?:第|EP|E)(\d+)/i)?.[1] || episode.id }
}
function episodeRouteKey(episode: SourceEpisode): string {
  try {
    const path = new URL(episode.sourceUrl || episode.id).pathname.replace(/\/$/, '')
    return path.match(/^\/v\/[^/]+-(\d+)-\d+$/)?.[1] || episode.lineId || 'main'
  } catch { return episode.lineId || 'main' }
}
/** 只认同集身份；无法确定集数时不把其他条目当作可自动接管的线路。 */
function sameEpisode(left: SourceEpisode, right: SourceEpisode): boolean {
  if (left.id === right.id) return true
  // 随包电影可能把不同配音线路标成「第 1 集／第 2 集」；单片身份明确时按线路处理。
  if (movieLike.value && episodeSortNumber(left) === null) return true
  const leftNumber = episodeSortNumber(left)
  const rightNumber = episodeSortNumber(right)
  if (leftNumber !== null || rightNumber !== null) return leftNumber !== null && leftNumber === rightNumber
  return movieLike.value || Boolean(left.title.trim() && left.title.trim() === right.title.trim())
}

function activeSourceEpisode(): SourceEpisode {
  return playerEpisodes.value.find((episode) => episode.id === activeEpisodeId.value && (episode.lineId || 'main') === activeLineId.value)
    ?? { id: activeEpisodeId.value, title: activeEpisodeTitle.value, sourceUrl: activeEpisodeId.value, playbackUrl: '', mimeType: '', lineId: activeLineId.value }
}

/** 同一作品同一集的其他线路，不用下一集兜底播放失败。 */
const alternatePlayableEpisodes = computed(() => {
  const active = activeSourceEpisode()
  const activeNumber = episodeNumberKey(active)
  const activeRoute = episodeRouteKey(active)
  return playerEpisodes.value
    .filter((episode) => (episode.id !== activeEpisodeId.value || (episode.lineId || 'main') !== activeLineId.value)
      && !!(episode.sourceUrl || episode.playbackUrl) && sameEpisode(active, episode))
    .map((episode) => ({
      episode,
      rank: episodeNumberKey(episode) === activeNumber && episodeRouteKey(episode) !== activeRoute ? 0 : episode.title === active.title ? 1 : 2,
    }))
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.episode)
})
/** 条目所属线路的语言/字幕标签（只认来源明确写出的语言或字幕，不用条目标题兜底）。 */
function languageKey(episode: SourceEpisode): string {
  return parsePlaybackLine(episode.title, episode.lineId).label
    || parsePlaybackLine(decodedUrl(episode.playbackUrl)).label
    || ''
}

/** 同一组里所有条目共有的线路标签（例如整条线路都写着「国语」），取不到返回空。 */
function sharedLineLabel(entries: SourceEpisode[]): string {
  const labels = entries.map(languageKey)
  return labels.length && labels.every((label) => label && label === labels[0]) ? labels[0]! : ''
}

/** 线路名兜底：来源给的线路名（面板名），都没有才按顺序编号。 */
function lineGroupName(entries: SourceEpisode[], index: number): string {
  const panel = entries.map((episode) => episode.lineId).find((line) => line && line !== 'main' && !/^\d+$/.test(line))
  return panel ? displayText(panel) : `线路 ${index + 1}`
}

const episodeSections = computed(() => {
  const groups = new Map<string, SourceEpisode[]>()
  for (const episode of currentPreviewEpisodes.value) {
    const key = episodeGroupKey(episode)
    groups.set(key, [...(groups.get(key) ?? []), episode])
  }
  // 线路顺序保持来源顺序（面板/选集在页面里的先后）：来源的第一条线路通常也是最常用的那条，
  // 不能按线路名重排（中文按拼音排会把「火箭云」排到「加速云」前面）。
  const ordered = [...groups]
  // 同一个来源编号里如果混着多条不同语言/字幕的线路（例如同一部电影的「HD国语」「HD中字」），
  // 必须拆成各自独立的线路列表：同一条线路的选集从第 1 集开始排，不把同一集的不同线路并在一起。
  const sections: { name: string; episodes: SourceEpisode[] }[] = []
  for (const [, episodes] of ordered) {
    const keys = [...new Set(episodes.map(languageKey).filter(Boolean))]
    if (keys.length < 2) {
      sections.push({ name: sharedLineLabel(episodes) || lineGroupName(episodes, sections.length), episodes })
      continue
    }
    for (const key of keys) sections.push({ name: key, episodes: episodes.filter((episode) => languageKey(episode) === key) })
    const rest = episodes.filter((episode) => !languageKey(episode))
    if (rest.length) sections.push({ name: lineGroupName(rest, sections.length), episodes: rest })
  }
  return sections
})

/**
 * 单片（电影／剧场版／OVA）：每条线路都只有一个条目时不存在「选集」，
 * 按钮要描述线路本身，不能再把线路写成「第 1 集／第 2 集」。
 */
const movieLike = computed(() => episodeSections.value.length > 0
  && episodeSections.value.every((section) => section.episodes.length === 1))

const episodeGroups = computed(() => {
  const sections = episodeSections.value
  // 单片把所有线路并成一行「线路」：点一下就是换线路，而不是让人以为有第 1 集、第 2 集。
  if (movieLike.value) return [{ key: '线路', episodes: sections.map((section) => section.episodes[0]!) }]
  const single = sections.length <= 1
  const named = sections.map((section) => ({ name: single ? '选集' : section.name, episodes: [...section.episodes].sort(compareEpisodes) }))
  const used = new Map<string, number>()
  return named.map((group) => {
    const count = (used.get(group.name) ?? 0) + 1
    used.set(group.name, count)
    return { key: count > 1 ? `${group.name} ${count}` : group.name, episodes: group.episodes }
  })
})

const selectedEpisodeGroup = ref('')
const episodePage = ref(0)
const episodeDescending = ref(false)
const detailGroup = computed(() => episodeGroups.value.find(group => group.key === selectedEpisodeGroup.value) || episodeGroups.value[0])
const detailEpisodeList = computed(() => episodeDescending.value ? [...(detailGroup.value?.episodes || [])].reverse() : detailGroup.value?.episodes || [])
const detailEpisodes = computed(() => detailEpisodeList.value.slice(episodePage.value * 30, (episodePage.value + 1) * 30))
watchValue(episodeGroups, () => { selectedEpisodeGroup.value = ''; episodePage.value = 0 })
watchValue([activeEpisodeId, activeLineId], () => {
  const group = episodeGroups.value.find(group => group.episodes.some(episode => episode.id === activeEpisodeId.value && (episode.lineId || 'main') === activeLineId.value))
  if (group) {
    selectedEpisodeGroup.value = group.key
    const index = detailEpisodeList.value.findIndex(episode => episode.id === activeEpisodeId.value && (episode.lineId || 'main') === activeLineId.value)
    episodePage.value = Math.max(0, Math.floor(index / 30))
  }
})
function chooseEpisodeGroup(key: string) { selectedEpisodeGroup.value = key; episodePage.value = 0 }
const previewResume = computed(() => history.value.filter(entry => entry.mediaUrl === sourcePreview.value?.sourceUrl && sameHistorySource(entry.sourceContext, sourcePreview.value?.sourceContext) && !entry.completed && entry.positionSeconds > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0])
async function playPreviewPrimary() {
  if (previewResume.value) { await continueWatching(previewResume.value); return }
  const episode = detailGroup.value?.episodes[0]
  if (episode) await playSourceEpisode(episode)
}
const homeContinue = computed(() => {
  const content = activeSubscriptionContent(), seen = new Set<string>()
  return history.value.filter(entry => {
    if (entry.completed || entry.positionSeconds <= 0 || (entry.sourceContext?.content || '') !== content) return false
    const key = `${entry.sourceKey || ''}\u0000${entry.mediaUrl}`
    if (seen.has(key)) return false
    seen.add(key); return true
  }).slice(0, 6)
})
/**
 * 选集按钮文案：只写这一条线路里的集数或条目名（线路归属由分组名表示），
 * 同一条线路内部重名时才补序号。
 */
const episodeLabels = computed(() => {
  const labels = new Map<string, string>()
  // 单片：按钮就是线路名，配合分组名「线路」使用，不再出现第几集。
  if (movieLike.value) {
    for (const section of episodeSections.value) {
      for (const episode of section.episodes) labels.set(fallbackKey(episode), section.name)
    }
    return labels
  }
  for (const group of episodeGroups.value) {
    const seen = new Map<string, number>()
    for (const episode of group.episodes) {
      const label = lineLabel(episode)
      const count = (seen.get(label) ?? 0) + 1
      seen.set(label, count)
      labels.set(fallbackKey(episode), count > 1 ? `${label} ${count}` : label)
    }
  }
  return labels
})
function episodeLabel(episode: SourceEpisode): string {
  return episodeLabels.value.get(fallbackKey(episode)) ?? lineLabel(episode)
}
/** 播放结束后的“下一集”：只在当前分组内按来源顺序推进，不跨作品或跨线路挑片。 */
const nextEpisode = computed(() => {
  const group = episodeGroups.value.find((entry) => entry.episodes.some((candidate) => candidate.id === activeEpisodeId.value && (candidate.lineId || 'main') === activeLineId.value))
  if (!group) return null
  const index = group.episodes.findIndex((candidate) => candidate.id === activeEpisodeId.value && (candidate.lineId || 'main') === activeLineId.value)
  return group.episodes[index + 1] ?? null
})
/** 剧集用“下一集”，电影的多语言/多线路条目用“继续”，避免把线路当成集数。 */
const nextEpisodeLabel = computed(() => {
  const next = nextEpisode.value
  if (!next) return ''
  // 单片模式下 next 就是另一条线路：直接写线路名，不写它的集号。
  if (movieLike.value) return `继续 · ${episodeLabel(next)}`
  const title = displayText(next.title)
  return /(?:第\s*\d+\s*[集话]|(?:EP|E)\s*\d+)/i.test(title) ? `下一集 · ${title}` : `继续 · ${title}`
})
const snapshotSchedule = scheduleFromSnapshot(catalogSnapshot)
/**
 * 首页首屏的「已核验线路」必须是整包合计，不是首部作品的线路数。
 * 旧写法用 catalogSnapshot[0].lines.length，把 71 条线路的随包内容说成了 2 条。
 */
const snapshotLineCount = catalogSnapshot.reduce((total, entry) => total + entry.lines.length, 0)
const displayText = (value: string) => value.replace(/樱花动漫/g, '公开来源')
/** 仅统一来源明确给出的纯集号；线路名、字幕及特殊篇名保持原文。 */
function episodeDisplayText(value: string): string {
  const title = displayText(value).trim()
  if (title === '直链媒体') return '视频'
  const number = title.match(/^(?:第\s*|EP\s*|E\s*)?([0-9]+)\s*(?:集|话)?$/i)?.[1]
  return number ? `第${Number(number)}集` : title
}
const availableFps = computed(() => [...new Set(qualityLevels.value.map((level) => level.fps).filter((fps): fps is number => fps !== null))].sort((a, b) => a - b))
/**
 * 画质档只列手机能稳定运行的档位（VQ-45）：超分 2×（4 倍像素）、锐化（CNN_M）与
 * 纯画质路径下与「均衡」同链路的「修复」不再出现在安卓菜单里；桌面端不受影响。
 */
const qualityOptions = MOBILE_ANIME4K_PROFILES.map((profile) => [profile, ANIME4K_PROFILE_LABELS[profile]] as [Anime4KProfile, string])
/**
 * 帧率梯级全量列出且全部可选（原始／自动／60／90／120／144／165／240）：
 * 补帧与插帧的职责就是把帧率提上去，档位不按屏幕刷新率过滤，也不再提示「本机上限」。
 * 稳定性交给既有护栏——持续超预算自动降档（VQ-26）与光流稳定性回退（VQ-49）。
 */
const frameRateOptions = FRAME_RATE_OPTIONS.map((fps) => ({ value: fps as FrameRateTarget, label: `${fps} FPS` }))
/**
 * 列表里高亮的必须是**实时生效**的挡位，而不是用户请求的挡位：发生过降级，列表要跟着走到生效档。
 * 只用高亮表达状态，不加任何文字后缀——列表的尺寸与文案是锁定决策，不许随挡位、降级或选中项变化。
 */
function isQualityOptionActive(profile: Anime4KProfile | 'off') {
  return effectiveQualityProfile.value === profile
}

/** 帧率的实时挡位：实测目标帧率落在列表某一档时高亮那一档；落不到列表档位时回退到用户选择。 */
const effectiveFrameOption = computed<FrameRateTarget | null>(() => {
  const stats = enhancementStats.value
  if (!stats || frameTarget.value === 'off') return null
  const effective = Math.round(stats.targetFps)
  return FRAME_RATE_OPTIONS.find((fps) => fps === effective) ?? null
})

function isFrameOptionActive(value: FrameRateTarget | 'off') {
  const effective = effectiveFrameOption.value
  return value === 'off' ? frameTarget.value === 'off' : effective !== null && effective === value
}
const qualityPending = computed(() => chosenQuality.value >= 0 && activeLevel.value !== chosenQuality.value)
const fpsPending = computed(() => chosenFps.value !== 'auto' && qualityLevels.value[activeLevel.value]?.fps !== Number(chosenFps.value))
/** 拖动范围：完整时长不可用（如仍在缓冲）时退回已缓冲范围，保证进度条始终可拖动。 */
const seekMax = computed(() => {
  if (Number.isFinite(playbackDuration.value) && playbackDuration.value > 0) return playbackDuration.value
  const element = video.value
  if (element && element.seekable.length) return element.seekable.end(element.seekable.length - 1)
  return 0
})
/** 进度条展示位置：拖动中以指针位置为准，其余时间跟随实际播放进度。 */
const seekPositionSeconds = computed(() => (seekDragging.value ? seekDragSeconds.value : playbackSeconds.value))
const seekReady = computed(() => seekMax.value > 0)
const seekPercent = computed(() => (seekMax.value > 0
  ? Math.min(100, Math.max(0, seekPositionSeconds.value / seekMax.value * 100))
  : 0))
function episodeMediaType(episode: SourceEpisode): MediaType | null {
  // 没有直链的条目依然不可播；有直链但类型说不清时按 HLS 交给播放器试，避免“后缀不像”就判死。
  if (!episode.playbackUrl) return null
  return playbackType(episode.playbackUrl)
    ?? (episode.mimeType.toLowerCase().includes('mpegurl') ? 'hls' : episode.mimeType.toLowerCase().includes('mp4') ? 'mp4' : 'hls')
}

function applyStreamSelection() {
  if (!hls) return
  const level = chosenQuality.value
  // 所有切档均保留正在播放的分片；自动档也由下一片接管，避免清空当前缓冲。
  if (hls.manualLevel === level) return
  if (!hasFirstFrame.value) hls.loadLevel = level
  else hls.nextLevel = level
}

function fallbackKey(episode: SourceEpisode): string {
  return `${episode.id}:${episode.lineId || 'main'}:${episode.playbackUrl || episode.sourceUrl || ''}`
}

/**
 * 随包已有线路：PC 随包目录里已核验过的公开 HLS 直链。
 * 这些地址不需要来源站往返，点击立即观看可以直接起播。
 */
function bundledEpisodes(work?: CatalogSnapshotItem | null): SourceEpisode[] {
  if (!work?.lines?.length) return []
  // 随包行既可能是同一部作品的选集，也可能是同一部作品的两条线路（例如《你的名字》的
  // 正片与「HD中字」）。只有当地址里写出了不同的语言/字幕时才拆成不同线路，
  // 否则保持成一部作品的一条选集列表（第 1 集在最前）。
  const keys = work.lines.map((line) => parsePlaybackLine(decodedUrl(line.playbackUrl)).label)
  const splitLines = new Set(keys.filter(Boolean)).size >= 2 || (keys.some(Boolean) && keys.some((key) => !key))
  return work.lines.map((line, index) => ({
    id: `bundled:${work.id}:${line.id || index + 1}`,
    title: line.title || `第 ${index + 1} 集`,
    playbackUrl: line.playbackUrl,
    mimeType: line.mimeType || 'application/vnd.apple.mpegurl',
    lineId: splitLines ? keys[index] || `线路 ${index + 1}` : 'main',
  }))
}

/**
 * 来源页身份：主机 + 作品编号 + 线路编号。站点把同一部作品写成 `/v/<作品>/<线路>`（详情）
 * 与 `/p/<作品>/<线路>/<集>`（播放）两种形态，编号相同即同一部作品，比标题字符串可靠。
 */
function sourceWorkIdentity(url: string): string {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.replace(/\/$/, '').split('/')
    const work = (segments[2] ?? '').split('-')[0]
    const line = (segments[3] ?? '').split('-')[0]
    return work && line ? `${parsed.host.toLowerCase()}|${work}|${line}` : ''
  } catch { return '' }
}

/**
 * 找到随包同名作品（只认自带已有线路的作品）：
 * 先按主来源地址精确匹配，再按主来源的作品编号匹配（站点同一部作品有 `/v/<作品>/<线路>`
 * 与 `/p/<作品>/<线路>/<集>` 两种写法，编号相同即同一部作品），最后按归一化标题匹配。
 * 备选来源不参与身份匹配：来源站会把同名但不同的作品挂进来（例如《你的名字是玫瑰》），
 * 按标题或备选来源硬认会把用户带去别的作品。
 */
function bundledWorkFor(title?: string, sourceUrl = ''): CatalogSnapshotItem | undefined {
  const identity = sourceUrl ? sourceWorkIdentity(sourceUrl) : ''
  const bySource = sourceUrl
    ? catalogSnapshot.find((item) => item.lines.length
      && (item.sourceUrl === sourceUrl || (identity !== '' && sourceWorkIdentity(item.sourceUrl) === identity)))
    : undefined
  const key = titleKey(title)
  // 地址可能被来源复用；明确标题冲突时不能借旧目录把特别篇切成另一季。
  if (bySource && (!key || titleKey(bySource.title) === key)) return bySource
  return key ? catalogSnapshot.find((item) => item.lines.length && titleKey(item.title) === key) : undefined
}

/** 详情页切到随包已有线路：标题、封面、简介与选集都用随包数据，不再显示失效的外站选集。 */
function adoptBundledPreview(work: CatalogSnapshotItem, pool: SourceEpisode[]) {
  sourceTried.value = [work.sourceUrl]
  sourceQueue.value = [...new Set(work.sourceUrls ?? [])].filter((url) => url !== work.sourceUrl)
  // 已经在观看工作区时保留原返回目标（搜索页/历史），不能把返回按钮指回详情页自己。
  if (section.value !== 'detail') detailReturn.value = section.value
  section.value = 'detail'
  watchPage.value = true
  lineNotice.value = ''
  sourceError.value = ''
  sourceLoading.value = false
  sourcePreview.value = {
    title: work.title,
    sourceUrl: work.sourceUrl,
    coverUrl: work.coverUrl,
    summary: work.summary,
    episodes: pool,
  }
  warmPreviewHosts(sourcePreview.value)
}

/** 用已有线路直接进入详情并起播指定选集（默认按统一选线优先级挑一条）：不发来源请求，点击即可出画面。 */
async function playBundledEpisode(work: CatalogSnapshotItem, episode?: SourceEpisode) {
  if (selected.value) await closePlayer()
  const pool = bundledEpisodes(work)
  if (!pool.length) return
  // 默认从第一集起播（与选集列表的排序一致），不再按语言优先级挑线路。
  const target = episode ?? [...pool].sort(compareEpisodes)[0] ?? pool[0]!
  lineFallbackTried.clear()
  bundledPool.value = pool
  bundledWork.value = work
  adoptBundledPreview(work, pool)
  await playSourceEpisode(target)
}

/** 线路池里还有没试过的已有线路时静默切过去继续播，不显示失败提示。 */
async function switchToBundledLine(): Promise<boolean> {
  const next = bundledPool.value.find((episode) => episode.playbackUrl
    && episode.playbackUrl !== activePlaybackUrl.value
    && sameEpisode(activeSourceEpisode(), episode)
    && !lineFallbackTried.has(fallbackKey(episode)))
  if (!next) return false
  lineFallbackTried.add(fallbackKey(next))
  playerError.value = ''
  // 接管时把详情页也切到已有线路，否则列表会停在一堆已经失效的外站选集上。
  if (bundledWork.value && sourcePreview.value?.sourceUrl !== bundledWork.value.sourceUrl) adoptBundledPreview(bundledWork.value, bundledPool.value)
  await playSourceEpisode(next)
  return true
}

/** 线路失败时自动尝试同作品的其他候选线路，并给出可见提示，不静默换成其他作品。 */
async function handlePlaybackFailure(message: string) {
  playbackObservation?.failure()
  lineFallbackTried.add(fallbackKey(activeSourceEpisode()))
  // 外站线路失败时先回退随包已有线路（与 PC 端口径一致）：同一个失效来源上的其他候选
  // 经常是同一批 CDN，逐条重试只会白白拖时间，用户看到的就是“点了没反应”。
  const activeIsBundled = bundledPool.value.some((episode) => episode.playbackUrl && episode.playbackUrl === activePlaybackUrl.value)
  if (!activeIsBundled && await switchToBundledLine()) return
  const candidate = alternatePlayableEpisodes.value.find((episode) => !lineFallbackTried.has(fallbackKey(episode)))
  if (!candidate) {
    // 同来源的线路都试过之后，已有线路可直接接管时静默切换（与 PC 端口径一致，不显示失败）。
    if (await switchToBundledLine()) return
    if (sourceQueue.value.length && await tryNextSource()) return
    playerError.value = message
    return
  }
  lineFallbackTried.add(fallbackKey(candidate))
  playerError.value = ''
  await playSourceEpisode(candidate)
  lineNotice.value = `原线路不可用，已切换到 ${displayText(candidate.title)}`
}

let stallTimer: number | undefined
/**
 * 首帧之后的卡顿看门狗（VQ-61）：此前的 stall 看门狗四个分支都带 `hasFirstFrame` 直接返回，
 * 首帧之后定格就只能等 hls 自己的 fragLoadingTimeOut×重试（最坏 20s×4）才拿到 fatal。
 * 这里在 waiting 时起表，每次 timeupdate 清表；超时仍未前进就按线路失败处理（换线/接管）。
 */
let playbackStallTimer: number | undefined
let playbackStallPosition = 0
function clearPlaybackStallWatchdog() {
  if (playbackStallTimer !== undefined) window.clearTimeout(playbackStallTimer)
  playbackStallTimer = undefined
}
function armPlaybackStallWatchdog() {
  const element = video.value
  if (playbackStallTimer !== undefined || !element || element.paused || element.seeking || seekingPlayback.value || !hasFirstFrame.value) return
  playbackStallPosition = element.currentTime
  playbackStallTimer = window.setTimeout(() => {
    playbackStallTimer = undefined
    if (!hasFirstFrame.value || playerError.value || playbackEnded.value || video.value !== element || element.paused || element.seeking || seekingPlayback.value || element.currentTime > playbackStallPosition + 0.05) return
    void handlePlaybackFailure('播放等待时间过长，请换条线路或重试。')
  }, 12_000)
}
function clearStallWatchdog() {
  if (stallTimer !== undefined) window.clearTimeout(stallTimer)
  stallTimer = undefined
}
/**
 * 首帧预算：外站线路不能靠“一直等”来判定，尤其是有随包已有线路可接管时。
 * 没有已有线路可回退时保持原来的宽松口径（12 秒提示“仍在加载”，再 18 秒才换线路），
 * 避免把只是慢的线路误判成失败；有已有线路可接管时同样先给 10 秒提示、20 秒才静默换线——
 * 回退太快会把慢线路当成坏线路，用户看到的就是没必要的“降级”。
 */
function bundledTakeoverAvailable(): boolean {
  return bundledPool.value.some((episode) => episode.playbackUrl
    && episode.playbackUrl !== activePlaybackUrl.value
    && !lineFallbackTried.has(fallbackKey(episode)))
}

function armStallWatchdog(generation: number) {
  clearStallWatchdog()
  if (bundledTakeoverAvailable()) {
    stallTimer = window.setTimeout(() => {
      if (generation !== playbackGeneration || hasFirstFrame.value || playerError.value) return
      lineNotice.value = '线路较慢，正在继续加载…'
      stallTimer = window.setTimeout(() => {
        if (generation !== playbackGeneration || hasFirstFrame.value || playerError.value) return
        void handlePlaybackFailure('播放等待时间过长，请换条线路或重试。')
      }, 10_000)
    }, 10_000)
    return
  }
  stallTimer = window.setTimeout(() => {
    if (generation !== playbackGeneration || hasFirstFrame.value || playerError.value) return
    lineNotice.value = '线路较慢，正在继续加载…'
    stallTimer = window.setTimeout(() => {
      if (generation !== playbackGeneration || hasFirstFrame.value || playerError.value) return
      void handlePlaybackFailure('播放等待时间过长，请换条线路或重试。')
    }, 18_000)
  }, 12_000)
}

/** 重试当前线路：清空已尝试集合并丢弃选集页缓存，重新解析一次播放地址。 */
async function retryCurrentLine() {
  const preview = sourcePreview.value
  const episode = preview?.episodes.find((candidate) => candidate.id === activeEpisodeId.value)
  playerError.value = ''
  lineNotice.value = ''
  lineFallbackTried.clear()
  if (!preview || !episode) return
  // 随包线路没有来源页地址（bundledEpisodes 只给直链，id 形如 bundled:<作品>:<线路>）：
  // 拿它当来源页地址请求会被原生按「非公网主机」拒绝，用户点了「重试当前线路」什么也不会发生（VQ-61）。
  // 这类线路的重试就是从原直链重建一次播放会话。
  if (!episode.sourceUrl) {
    if (episode.playbackUrl) { await playSourceEpisode({ ...episode }); return }
    sourceError.value = '这条线路无法重试，请在选集里换条线路。'
    return
  }
  const sourceUrl = episode.sourceUrl
  previewCache.delete(sourceCacheKey(sourceUrl))
  await playSourceEpisode({ ...episode, playbackUrl: '', sourceUrl }, activeLineId.value === 'main' ? undefined : activeLineId.value)
}

function changeQuality(value: string) {
  const level = Number(value)
  if (!Number.isInteger(level) || (level !== -1 && !qualityLevels.value.some((entry) => entry.index === level))) return
  chosenQuality.value = level
  if (chosenQuality.value < 0) chosenFps.value = 'auto'
  else if (chosenFps.value !== 'auto') chosenFps.value = String(qualityLevels.value[chosenQuality.value]?.fps ?? 'auto')
  applyStreamSelection()
}
function changeFps(value: string) {
  if (value !== 'auto') {
    const choices = qualityLevels.value.filter((level) => level.fps === Number(value))
    if (!choices.length) return
    if (!choices.some((level) => level.index === chosenQuality.value)) {
      const best = choices.sort((left, right) => (hls?.levels[right.index]?.bitrate ?? 0) - (hls?.levels[left.index]?.bitrate ?? 0))[0]
      chosenQuality.value = best.index
    }
  }
  chosenFps.value = value
  applyStreamSelection()
}

/** 进入定位预览：拖动期间只要原帧，重活先停掉（VQ-59）。 */
function beginSeekPreview() {
  if (previewTimer !== undefined) { window.clearTimeout(previewTimer); previewTimer = undefined }
  enhancementSession?.setPreview(true)
}

/** 结束定位预览并恢复用户档位（VQ-59）。 */
function endSeekPreview() {
  if (previewTimer !== undefined) { window.clearTimeout(previewTimer); previewTimer = undefined }
  enhancementSession?.setPreview(false)
}

function stopEnhancement() {
  ++enhancementRequest
  endSeekPreview()
  enhancementSession?.stop()
  enhancementSession = null
  sessionInterpolating = false
  enhancementStats.value = null
  enhancementState.value = 'idle'
  if (qualityNoticeTimer !== undefined) window.clearTimeout(qualityNoticeTimer)
  qualityNoticeTimer = undefined
  qualityNotice.value = ''
}

async function applyEnhancement() {
  const element = video.value
  if (!element) return
  const wantEnhancement = qualityProfile.value !== 'off'
  const wantInterpolation = frameTarget.value !== 'off'
  const profile = qualityProfile.value === 'off' ? 'off' : (enhancementRetryProfile ?? qualityProfile.value)
  /**
   * 原地换档（VQ-59）：会话在跑、且「补帧与否」没变时，切档与降级只下发一次重配置。
   * 以前一律停会话再重建：画布被移除又插回、音频延迟被清零再抬回，用户就是画面跳一下、声音抖一下。
   */
  if (enhancementSession && sessionInterpolating === wantInterpolation && (wantEnhancement || wantInterpolation)) {
    motionStability.reset()
    motionGuardResumeAt = performance.now() + 2_500
    enhancementState.value = 'active'
    // 不补帧时目标帧率沿用「自动」，与起播口径一致；是否补帧由会话本身决定。
    const nextTarget: FrameRateTarget = frameTarget.value === 'off' || !wantInterpolation ? 'auto' : frameTarget.value
    enhancementSession.configure({ profile: wantEnhancement ? profile : 'off', targetFps: nextTarget })
    return
  }
  stopEnhancement()
  if (!wantEnhancement && !wantInterpolation) return
  if (element.paused || element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    // 暂停中（或当前帧数据还没就绪）不能起会话：这里以前直接 return，菜单把档位显示成已选中、
    // 画面却没有任何变化，也没有一句提示，用户看到的就是「选了档位没用」（VQ-62）。
    // 恢复播放时 onPlayerPlay 会带着同一档位补挂会话，这里只把「稍后生效」讲清楚。
    showQualityNotice('恢复播放后生效')
    return
  }
  const request = enhancementRequest
  // 会话起点重置护栏：起播前两秒的内容跳变来自流水线预热，不作为后端判定依据（VQ-49）。
  motionStability.reset()
  motionGuardResumeAt = performance.now() + 2_500
  enhancementState.value = 'starting'
  try {
    const { startRealtimeInterpolation } = await import('../../video/realtimeInterpolation')
    if (request !== enhancementRequest || element !== video.value) return
    if (frameTarget.value !== 'off') enhancementAudioUsed = true
    const session = await startRealtimeInterpolation(element, {
      enhance: qualityProfile.value !== 'off', profile: profile === 'off' ? 'fast' : profile,
      interpolation: frameTarget.value !== 'off', targetFps: frameTarget.value === 'off' ? 'auto' : frameTarget.value,
      // 用户显式选了帧率档就按档位补帧（VQ-53）：'auto' 只在内容适合时补间，选 120 却经常拿到原始
      // 帧率，用户看到的就是「帧率很差」。只有「自动」档才交给需求策略按内容判断。
      interpolationDemand: frameTarget.value === 'auto' ? 'auto' : 'always',
      interpolationDelay: 'adaptive', presentationAlignment: 'refresh', measureStages: false,
      // 安卓上限（VQ-45）：收窄运动分析网格、收紧超预算阈值，并允许「均衡」自动回退到「性能」。
      limits: ANDROID_ENHANCEMENT_LIMITS,
      // 帧率优先（VQ-47）：运动估计先用常驻 GPU 管线（同源实测中位 4.4ms 对 CPU 14–20ms），
      // 设备没有硬件适配器、着色器编译失败或运行期设备丢失都由 worker 回退 CPU，页面不分支；
      // 一旦护栏判定本机 GPU 光流会造成画面波动，本次运行改回 CPU（VQ-49）。
      flowBackend: forceCpuFlowBackend ? 'cpu' : 'webgpu', flowConservative,
      onStats: (stats) => {
        if (request !== enhancementRequest) return
        const previous = enhancementStats.value
        enhancementStats.value = stats
        if (adaptationNotice.next(previous, stats, performance.now())) showQualityNotice('已调整画面，让播放更流畅')
        guardMotionBackend(stats)
        publishPlaybackStability(stats)
      },
      onError: () => {
        if (request !== enhancementRequest) return
        // 先降一档重试一次，再考虑退回原画（VQ-53）。
        if (retryWithLighterProfile()) return
        stopEnhancement()
        // 档位是用户的意图：失败只提示一次并停下本次会话，不再把档位悄悄改回关闭
        //（用户看到的是「优化去哪了」）。用户再点一次档位即可重试。
        enhancementState.value = 'failed'
        notifyOnce('画面优化暂不可用，已恢复原画；可重新选择档位。')
      },
    })
    if (request !== enhancementRequest || element !== video.value) { session.stop(); return }
    enhancementSession = session
    sessionInterpolating = wantInterpolation
    enhancementState.value = 'active'
  } catch {
    if (request !== enhancementRequest) return
    // 会话可能在抛错前已经把画面切到增强画布（类名由会话切换），这里显式清掉，
    // 否则失败后画面会停在增强画布上，表现为一块黑画面。
    playerStage.value?.classList.remove('sanye-realtime-interpolation-active')
    // 初始化失败同样先降一档重试一次（VQ-53）。
    if (retryWithLighterProfile()) return
    enhancementState.value = 'failed'
    notifyOnce('画面优化暂不可用，已恢复原画；可重新选择档位。')
  }
}

function changeQualityProfile(value: Anime4KProfile | 'off') {
  if (qualityProfile.value === value && enhancementState.value !== 'failed') return
  qualityProfile.value = value
  // 用户重新选档即重新给 GPU 一次机会：护栏只在判定波动后按本次运行收回，稳定模式也一并复位。
  forceCpuFlowBackend = false
  flowConservative = false
  motionStability.reset()
  // 用户重新选档也重新给完整档位一次机会：重试降档只在本轮生效。
  enhancementRetryProfile = null
  // 档位随设置落盘：下一次点开作品直接以该档位起播，不需要重选。
  void updateSettings({ qualityProfile: value })
  void applyEnhancement()
}

/** 落盘用的字符串档位：原生侧只接受字符串，数字会整条拒绝。 */
function frameTargetSetting(value: FrameRateTarget | 'off'): FrameTargetSetting {
  return value === 'off' || value === 'auto' ? value : `${value}`
}

function changeFrameTarget(value: FrameRateTarget | 'off') {
  if (frameTarget.value === value && enhancementState.value !== 'failed') return
  frameTarget.value = value
  enhancementStats.value = null
  forceCpuFlowBackend = false
  flowConservative = false
  void updateSettings({ frameTarget: frameTargetSetting(value) })
  void applyEnhancement()
}

/** 恢复画质档：只接受安卓菜单里存在的档位，其余（含来源不可信的取值）按关闭处理。 */
function restoreQualityProfile(value: unknown): Anime4KProfile | 'off' {
  return typeof value === 'string' && (MOBILE_ANIME4K_PROFILES as readonly string[]).includes(value)
    ? value as Anime4KProfile : 'off'
}
/** 恢复帧率档：接受自动档与既有档位集合；已知刷新能力时按屏幕收敛，测不到时保留原档等实测结果。 */
function restoreFrameTarget(value: unknown): FrameRateTarget | 'off' {
  if (value === 'auto') return 'auto'
  const target = Number(value)
  if (!(FRAME_RATE_OPTIONS as readonly number[]).includes(target)) return 'off'
  return target as FrameRateTarget
}

/**
 * GPU 光流稳定性护栏（VQ-49）。
 *
 * 只在 GPU 窗口参与判定：连续两个脏窗口（出现内容倒退，或单窗口跨周期跳变达到上限）才判定
 * 本机不适合 GPU 光流，并立即用 CPU 后端重启同一档位的会话。重启走的是播放器既有的档位切换
 * 路径，只换运动估计后端，画质档、补帧目标与输出尺寸都不变；定位、换集与起播后的静默窗口
 * 不参与判定，避免把播放段边界的一次性跳变当成后端问题。
 */
/**
 * 只读播放诊断（VQ-58）：把渲染 Worker 每个统计窗口的抖动计数累加成会话总量，并挂到 window 上，
 * 供真机排查和 Playwright 稳定性门禁读取。统计窗口自己会清零，只有页面侧累加才能回答
 * 「这次播放到底抖没抖」。不参与决策、不渲染 UI，用户看不到任何变化。
 */
const playbackStabilityTally = createPlaybackStabilityTally()
function publishPlaybackStability(stats: InterpolationStats) {
  accumulatePlaybackStabilityTally(playbackStabilityTally, stats)
  if (typeof window === 'undefined') return
  const host = window as unknown as { __sanyePlaybackStats?: InterpolationStats; __sanyePlaybackTally?: typeof playbackStabilityTally }
  host.__sanyePlaybackStats = stats
  host.__sanyePlaybackTally = playbackStabilityTally
}

function guardMotionBackend(stats: InterpolationStats) {
  if (forceCpuFlowBackend) return
  if (seekingPlayback.value || performance.now() < motionGuardResumeAt) { motionStability.reset(); return }
  const verdict = motionStability.observe({
    backend: stats.flowBackend === 'webgpu' || stats.flowBackend === 'jsfeat' ? stats.flowBackend : '',
    contentBacksteps: stats.contentBacksteps,
    contentJumps: stats.contentJumps,
    // 运动场迟到（VQ-55）：GPU 光流异步往返造成的相位停顿不是「场不对」，
    // 直接换成慢 3–4 倍的 CPU 光流只会让帧率更差，所以先收紧网格重试一次。
    flowStarvedFrames: stats.flowStarvedFrames,
  })
  if (!verdict) return
  if (verdict === 'retry') {
    flowConservative = true
    showQualityNotice('已调整画面，让播放更稳定')
  } else {
    forceCpuFlowBackend = true
    showQualityNotice('画面不稳，已调整播放方式')
  }
  // 统计回调来自渲染 Worker：直接重启会终止正在处理消息的会话，放到下一个任务再执行。
  window.setTimeout(() => {
    if (video.value?.paused) return
    void applyEnhancement()
  }, 0)
}

async function switchToFallbackLine() {
  const candidate = alternatePlayableEpisodes.value.find(episode => !lineFallbackTried.has(fallbackKey(episode)))
  if (!candidate) {
    playerError.value = '当前选集没有其他可用线路。'
    return
  }
  playerError.value = ''
  lineFallbackTried.add(fallbackKey(candidate))
  await playSourceEpisode(candidate)
}

function onPlayerPlay() {
  const element = video.value
  const observation = playbackObservation
  if (element?.requestVideoFrameCallback) element.requestVideoFrameCallback(() => {
    if (video.value === element && playbackObservation === observation && !element.paused && !element.seeking) {
      observation?.firstFrame()
      onFirstFrame()
    }
  })
  playing.value = true
  playerError.value = ''
  sourceError.value = ''
  if (lineNotice.value === '线路较慢，正在继续加载…') lineNotice.value = ''
  // 起播即撤掉「已从后台返回」的提示（VQ-62）：这条提示的前提是画面停着，
  // 真正播起来之后还留着它会让用户以为还需要再点一次。
  backgroundPaused.value = false
  // 结束态下重新起播（点重播或直接拖动后播放）都必须先撤掉结束遮罩。
  playbackEnded.value = false
  clearStallWatchdog()
  if (!enhancementSession && enhancementState.value === 'idle' && (qualityProfile.value !== 'off' || frameTarget.value !== 'off')) void applyEnhancement()
}

/** 首帧数据就绪：撤掉封面并结束起播等待。 */
function onFirstFrame() {
  // loadeddata 可能是定位前的旧帧；续播/拖动还在 seeking 时保留等待保护。
  if (video.value?.seeking) return
  // 邻集预热要等当前集拿到画面，避免与首片争用同一来源连接。
  const warm = pendingAdjacentWarm
  pendingAdjacentWarm = null
  warm?.()
  hasFirstFrame.value = true
  buffering.value = false
  switchingLine.value = false
  // 只有真的在播时才撤掉「后台暂停」提示（VQ-62）：从后台切回前台时部分机型会重新走一次
  // loadeddata，而这个回调以前无条件清掉 backgroundPaused —— 画面明明还停着，
  // 恢复入口却消失了，用户只能盯着一张定格画面。
  if (!video.value?.paused) backgroundPaused.value = false
  clearStallWatchdog()
  clearPlaybackStallWatchdog()
  if (!video.value?.paused) armPlaybackStallWatchdog()
  syncPlaybackDuration()
}

/** 首帧之后的缓冲/卡顿（VQ-61）：给舞台内提示并起看门狗，恢复播放时由 timeupdate 清掉。 */
function onVideoWaiting() {
  if (!hasFirstFrame.value || playerError.value || video.value?.paused || video.value?.seeking || seekingPlayback.value) return
  playbackObservation?.waiting()
  buffering.value = true
  armPlaybackStallWatchdog()
}

/** 播放错误：起播失败自动换线路，已经出画面的中途错误只提示，不打断当前内容。 */
function onVideoError(message: string) {
  playbackObservation?.failure()
  clearStallWatchdog()
  clearPlaybackStallWatchdog()
  buffering.value = false
  switchingLine.value = false
  setNativeKeepAwake(false)
  if (hasFirstFrame.value || !selected.value) { playerError.value = message; return }
  void handlePlaybackFailure(message)
}

/** 点画面切换控制条显隐；播放中 3.2 秒后自动收起，暂停、出错或打开浮层时保持可见。 */
function clearChromeTimer() {
  if (chromeTimer !== undefined) window.clearTimeout(chromeTimer)
  chromeTimer = undefined
}
function scheduleChromeHide() {
  clearChromeTimer()
  // 竖屏控制条由点按显隐；仅全屏播放时自动收起，避免换集和静音入口自行消失。
  if (!stageFullscreen.value || !playing.value || playerError.value || chromeMenu.value) return
  chromeTimer = window.setTimeout(() => { chromeVisible.value = false }, 3200)
}
function showChrome() {
  chromeVisible.value = true
  scheduleChromeHide()
}
/** 收起已展开的浮层时控制条保持可见，避免同一次点按把列表和控件条一起收走。 */
function closeChromeMenu() {
  chromeMenu.value = null
  showChrome()
}
function togglePlayerChrome() {
  if (chromeVisible.value) { clearChromeTimer(); chromeVisible.value = false }
  else showChrome()
}
/**
 * 点画面（含控制条空白处）的统一点按口径：有浮层先收浮层并保持控制条可见，再点一次才收控制条。
 * 滑动被识别后浏览器仍会补一次点击，这里按标记忽略，避免调完亮度/音量顺手把控制条收掉。
 */
function onPlayerSurfaceTap() {
  if (gestureTapSuppressed) { gestureTapSuppressed = false; return }
  if (chromeMenu.value) { closeChromeMenu(); return }
  togglePlayerChrome()
}
/** 画面中央播放键：同样要忽略滑动刚结束时补发的那次点击，避免滑完亮度顺手暂停。 */
function onBigPlayTap() {
  if (gestureTapSuppressed) { gestureTapSuppressed = false; return }
  togglePlayback()
}

function onFullscreenChange() {
  // 原生返回键退出放大、以及系统收回全屏都走这里：同样给判定一个静默窗口（VQ-51）。
  deferEnhancementJudgement()
  if (document.fullscreenElement === playerStage.value) { nativeFullscreenActive = true; stageFullscreen.value = true }
  else if (nativeFullscreenActive || document.fullscreenElement || !playerStage.value?.classList.contains('android-player-stage--expanded')) {
    nativeFullscreenActive = false
    stageFullscreen.value = false
  }
  if (!stageFullscreen.value) { chromeMenu.value = null; void screen.orientation?.unlock?.(); setNativeLandscape(false); setNativeImmersive(false) }
}
function currentStreamQualityNotice() {
  if (!hls) return '此片源没有可切换的清晰度档位；画面增强不会改变片源码率。'
  if (!qualityLevels.value.length || activeLevel.value < 0) return '正在确认片源的实际清晰度。'
  const current = qualityLevels.value[activeLevel.value]?.label ?? '未知档位'
  const highest = [...hls.levels].sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0))[0]
  const maximum = highest?.height ? `${highest.height}P` : '未知'
  return `当前片源 ${current}；最高 ${maximum}；${chosenQuality.value < 0 ? '自动选档' : '手动选档'}。`
}
/** 浮层右缘与触发按钮文字的右缘对齐：位置和宽度都跟着这颗按钮，不额外占位。 */
function toggleChromeMenu(menu: 'quality' | 'fps' | 'episodes' | 'volume', event?: MouseEvent) {
  const next = chromeMenu.value === menu ? null : menu
  chromeMenu.value = next
  if (!next) { scheduleChromeHide(); return }
  if (next === 'quality') showQualityNotice(currentStreamQualityNotice())
  chromeVisible.value = true
  clearChromeTimer()
  const button = (event?.currentTarget as HTMLElement | null) ?? null
  const bar = controlsBar.value
  if (!button || !bar) { menuAnchorRight.value = null; return }
  const barBox = bar.getBoundingClientRect()
  const paddingRight = Number.parseFloat(window.getComputedStyle(bar).paddingRight) || 0
  menuAnchorRight.value = Math.max(0, Math.round(barBox.right - paddingRight - button.getBoundingClientRect().right))
}

async function togglePlayerFullscreen() {
  try {
    if (stageFullscreen.value) {
      if (document.fullscreenElement === playerStage.value) await document.exitFullscreen()
      stageFullscreen.value = false
      chromeMenu.value = null
      void screen.orientation?.unlock?.()
      setNativeLandscape(false)
      setNativeImmersive(false)
    } else {
      if (playerStage.value?.requestFullscreen) await playerStage.value.requestFullscreen()
      stageFullscreen.value = true
      // Some WebViews do not expose orientation lock; fullscreen still works when users rotate the phone.
      try { await (screen.orientation as ScreenOrientation & { lock?: (value: 'landscape') => Promise<void> })?.lock?.('landscape') }
      catch { /* 设备不支持强制横屏时保留可旋转全屏。 */ }
      setNativeLandscape(true)
      setNativeImmersive(true)
    }
  } catch {
    // Android WebView versions without the Fullscreen API still get an in-app player overlay.
    stageFullscreen.value = true
    setNativeLandscape(true)
    setNativeImmersive(true)
  }
  // 放大/退出放大要切横屏与沉浸模式，呈现表面重建的几帧会超预算：这段时间不判定降档（VQ-51）。
  deferEnhancementJudgement()
  showChrome()
}

/**
 * 呈现表面尺寸变化（放大/退出放大、旋转、窗口变化）后的判定静默窗口（VQ-51）。
 *
 * 重建开销只是一次性的：不静默就会被护栏当成「持续不足」，把帧率目标或画质档降下来，
 * 而一个播放段内的降档不会回升——用户看到的就是「全屏之后画质帧率下降很多」。
 */
let judgementDeferUntil = 0
function deferEnhancementJudgement(ms = 2_000) {
  const session = enhancementSession
  if (!session) return
  judgementDeferUntil = performance.now() + ms
  // 放大/退出放大/旋转是新的呈现条件：帧率目标交还用户选的档位，只在静默窗口内不判定，
  // 窗口过后仍按实测判定，所以真撑不住的设备还是会降档，但不会再被一次重建永久压住（VQ-53）。
  session.deferJudgement(ms, true)
}
/** 尺寸变化可能连续触发（旋转过程），窗口内合并，避免反复重开判定窗口。 */
function deferEnhancementJudgementOnce() {
  if (!enhancementSession || performance.now() < judgementDeferUntil) return
  deferEnhancementJudgement()
}

// 播放状态驱动控件自动隐藏与屏幕常亮；暂停、出错或菜单展开时控件保持可见。
watchValue([playing, chromeMenu, playerError], () => {
  const keepAwake = playing.value && !playerError.value
  setNativeKeepAwake(keepAwake)
  if (keepAwake && !chromeMenu.value) scheduleChromeHide()
  else if (!chromeMenu.value) showChrome()
})

function savedCover(item: SavedMedia): string {
  return displayCover(item.title, item.url, item.coverUrl)
}

function displayCover(title: string, sourceUrl: string, remote = ''): string {
  // 当前订阅的作品不得借用随包同名作品的图片。
  if (usingSubscription.value) return remote && !failedCovers.value.has(remote) ? remote : ''
  // 随包封面只在作品身份一致时使用：先比对来源地址，再按归一化标题比对同名作品
  //（来源标题常只差标点，例如「你的名字。」与随包目录的「你的名字」）。
  const key = titleKey(title)
  const known = catalogSnapshot.find((item) => item.sourceUrl === sourceUrl || (key && titleKey(item.title) === key))
  return [known?.coverUrl, remote].find(url => url && !failedCovers.value.has(url)) || ''
}

/**
 * 观看历史卡片封面：优先用记录时保存的封面，其次按作品身份回退到随包封面，
 * 最后用随包占位图——历史卡片没有独立的「暂无封面」占位块，缺图时必须是可渲染的图片。
 */
function historyCover(entry: WatchHistory): string {
  if (entry.coverUrl && !failedCovers.value.has(entry.coverUrl)) return entry.coverUrl
  const recovered = recoveredHistoryCovers.value.get(historySourceBindingKey(entry))
  if (recovered && !failedCovers.value.has(recovered)) return recovered
  const sourceHit = [...sourceHits.value, ...repositoryHits.value].find(hit =>
    (hit.sourceUrl === entry.mediaUrl || titleKey(hit.title) === titleKey(entry.title))
      && sameHistorySource(hit.sourceContext, entry.sourceContext))
  if (sourceHit?.coverUrl && !failedCovers.value.has(sourceHit.coverUrl)) return sourceHit.coverUrl
  if (sourcePreview.value && sameHistorySource(sourcePreview.value.sourceContext, entry.sourceContext)
      && (sourcePreview.value.sourceUrl === entry.mediaUrl || titleKey(sourcePreview.value.title) === titleKey(entry.title))) {
    if (sourcePreview.value.coverUrl && !failedCovers.value.has(sourcePreview.value.coverUrl)) return sourcePreview.value.coverUrl
  }
  const known = entry.sourceContext?.content ? '' : catalogSnapshot.find(item => item.sourceUrl === entry.mediaUrl || titleKey(item.title) === titleKey(entry.title))?.coverUrl
  if (known) return known
  // 旧记录（封面字段还没落盘的时代）用同一部作品在片库里的封面补上，最后才用随包占位图。
  const saved = items.value.find((item) => sameHistorySource(item.sourceContext, entry.sourceContext)
    && (item.url === entry.mediaUrl || (!!titleKey(item.title) && titleKey(item.title) === titleKey(entry.title))))
  return saved?.coverUrl || placeholderCover
}
const recoveredHistoryCovers = ref(new Map<string, string>())
const historyCoverAttempts = new Set<string>()
async function recoverHistoryCovers() {
  const entries = history.value.filter(entry => (!entry.coverUrl || failedCovers.value.has(entry.coverUrl)) && entry.sourceContext?.content
    && !historyCoverAttempts.has(historySourceBindingKey(entry))).slice(0, 12)
  let index = 0
  const read = async () => {
    while (index < entries.length) {
      const entry = entries[index++]!
      const key = historySourceBindingKey(entry)
      historyCoverAttempts.add(key)
      try {
        let cover = ''
        if (!mediaType(entry.mediaUrl)) {
          try {
            const preview = await fetchPreview(entry.mediaUrl, false, entry.sourceContext)
            if (!preview.title || titleKey(preview.title) === titleKey(entry.title)) cover = preview.coverUrl
          } catch { /* 来源详情失效时再查当前同源作品。 */ }
        }
        // 历史记录保存的是媒体直链，不能把它当来源详情页重新解析；当前订阅仍可用作品标题补一次同源搜索。
        if (!cover && (entry.sourceContext?.content || '') === (activeSubscriptionContent() || '')) {
          const result = await withNativeTimeout(androidSource.search({ keyword: entry.title, background: true }), 8_000)
          const hit = result.hits.find(candidate => titleKey(candidate.title) === titleKey(entry.title)
            && sameHistorySource(candidate.sourceContext, entry.sourceContext))
          cover = hit?.coverUrl || ''
        }
        if (cover && history.value.some(item => historySourceBindingKey(item) === key)) {
          recoveredHistoryCovers.value = new Map(recoveredHistoryCovers.value).set(key, cover)
          startCoverCache(cover)
        }
      } catch { /* 单张旧历史缺图不阻塞列表或其他封面。 */ }
    }
  }
  await Promise.all([read(), read()])
}

/** 图片加载失败时换成随包占位图，而不是把图片隐藏掉。 */
function usePlaceholderCover(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image || image.src === new URL(placeholderCover, document.baseURI).href) return
  image.src = placeholderCover
}

/** 历史卡片的进度文案：已看完直接说明，否则给出百分比。 */
function historyProgress(entry: WatchHistory) {
  if (entry.completed) return '已看完'
  const percent = entry.durationSeconds > 0
    ? Math.min(100, Math.round(entry.positionSeconds / entry.durationSeconds * 100))
    : 0
  return percent > 0 ? `已观看 ${percent}%` : '刚开始'
}

/** 历史记录只在直接播放时记录封面；随包封面是相对资源，不入库，渲染时再按标题回退。 */
const activeCoverUrl = computed(() => {
  const item = selected.value
  if (item) return displayCover(item.title, item.url, item.coverUrl ||
    (sourcePreview.value?.sourceUrl === item.url && sameHistorySource(sourcePreview.value.sourceContext, item.sourceContext) ? sourcePreview.value.coverUrl : ''))
  const preview = sourcePreview.value
  if (preview) return displayCover(preview.title, preview.sourceUrl, preview.coverUrl)
  return ''
})

function coverFailed(url: string) { failedCovers.value = new Set(failedCovers.value).add(url) }
function episodeGroupKey(episode: SourceEpisode): string {
  // 来源给出的线路名（面板名，如「加速云」「火箭云」）优先：站点把同一部作品的多条线路
  // 写在同一个 URL 线路段下（实测三条线路的选集地址都是 `/p/210580/153/<条目id>`），
  // 用地址里的编号分组会把三条线路并成一条，这正是“线路没有区分开”的原因。
  const named = episode.lineId && episode.lineId !== 'main' ? episode.lineId : ''
  if (named) return /^\d+$/.test(named) ? `线路 ${named}` : displayText(named)
  try {
    const path = new URL(episode.sourceUrl || episode.id).pathname
    const line = path.match(/^\/v\/[^/]+-(\d+)-\d+\/?$/)?.[1] ?? path.match(/^\/p\/[^/]+\/([^/]+)\/\d+\/?$/)?.[1]
    return line ? `线路 ${line}` : '选集'
  } catch { return '选集' }
}

/** 线路名统一解析：与 PC 端共用同一套语言/字幕识别，只写「中字」时不推断配音语言。 */
/** 媒体地址里的百分号编码会影响关键词匹配，解析前先还原成可读文本。 */
function decodedUrl(value?: string): string {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * 选集标签：标题自己写了集数（`第 3 集`／`EP3`）时就用标题——线路归属由分组名表示，
 * 不能再让线路名盖掉集数（否则一条 24 集的「中字」线路会变成 24 个「中字」按钮）。
 * 标题看不出集数时才用线路的语言/字幕标签（标题、线路名、媒体地址依次看）。
 */
function lineLabel(episode: SourceEpisode): string {
  const title = episodeDisplayText(episode.title)
  if (episodeSortNumber(episode) !== null && title.trim()) return title
  const meta = parsePlaybackLine(title, episode.lineId)
  if (meta.label) return meta.label
  const fromUrl = parsePlaybackLine(decodedUrl(episode.playbackUrl)).label
  return fromUrl || title
}

/** 未指定语言偏好时的默认选线优先级：存在「国语中字」就默认播它。 */
function lineScore(episode: SourceEpisode): number {
  return Math.max(
    parsePlaybackLine(episode.title, episode.lineId).defaultScore,
    parsePlaybackLine(decodedUrl(episode.playbackUrl)).defaultScore,
  )
}

/**
 * 选集排序用的集数：先看标题自己写的编号（`第 3 集`／`EP3`／`3`），
 * 再看可靠的地址形态 `/v/<作品>-<线路>-<集>`。
 * 来源播放页的 `/p/.../<编号>` 末段是来源自己的条目 id 而不是集数
 *（实测同一部作品的 12 集 id 为 4652475、4652476、…、55100），按它排序会把
 * 第 12 集排到第 1 集前面，因此不再用它当集数。
 */
function episodeSortNumber(episode: SourceEpisode): number | null {
  const title = displayText(episode.title).replace(/\s+/g, '')
  const titled = title.match(/(?:第|EP|E|Vol\.?)(\d+)/i)?.[1] ?? title.match(/^(\d+)(?:[集话])?$/)?.[1]
  if (titled) return Number(titled)
  try {
    const path = new URL(episode.sourceUrl || episode.id).pathname.replace(/\/$/, '')
    const routed = path.match(/^\/v\/[^/]+-\d+-(\d+)$/)?.[1]
    return routed ? Number(routed) : null
  } catch { return null }
}

/**
 * 选集排序：两侧都能读出集数时按集数升序（第一集在最前）。
 * 只有一侧能读出集数时保持来源顺序：来源的「当前播放页」这类条目没有集数，
 * 若统一推到末尾会让选集推进（下一集）在该条目上断掉。
 */
function compareEpisodes(left: SourceEpisode, right: SourceEpisode): number {
  const leftNumber = episodeSortNumber(left)
  const rightNumber = episodeSortNumber(right)
  if (leftNumber === null || rightNumber === null) return 0
  return leftNumber - rightNumber
}

/** `立即播放` 与 `/p/.../0` 是来源的占位页，不是真正的选集，自动起播时要跳过。 */
function isPlaceholderEpisode(episode: SourceEpisode): boolean {
  return /\/0\/?$/.test(episode.sourceUrl || episode.id) || /^(立即播放|播放|点击播放)$/.test(episode.title.trim())
}

/** 自动起播优先选已经带直链、且不是占位页的条目。 */
function pickPlayableEpisode(episodes: SourceEpisode[]): SourceEpisode | undefined {
  // 默认播放同样按线路优先级挑：有「国语中字」时不先播中字或原声线路。
  const preferred = (list: SourceEpisode[]) => [...list].sort((left, right) => lineScore(right) - lineScore(left))[0]
  return preferred(episodes.filter((episode) => episodeMediaType(episode)))
    ?? preferred(episodes.filter((episode) => !!episode.sourceUrl && !isPlaceholderEpisode(episode)))
    ?? episodes[0]
}

/** 下一条还没试过的候选：跳过占位页、已带直链的条目和已经试过的线路，避免来回跳。 */
function nextUntriedEpisode(episode: SourceEpisode): SourceEpisode | undefined {
  const ordered = episodeGroups.value.flatMap((group) => group.episodes)
  const start = ordered.findIndex((candidate) => candidate.id === episode.id)
  const rotated = start >= 0 ? [...ordered.slice(start + 1), ...ordered.slice(0, start)] : ordered
  return rotated.find((candidate) => !!candidate.sourceUrl
    && (candidate.id !== episode.id || candidate.lineId !== episode.lineId)
    && sameEpisode(episode, candidate)
    && !lineFallbackTried.has(fallbackKey(candidate))
    && !isPlaceholderEpisode(candidate)
    && !episodeMediaType(candidate))
}

function rememberPreview(sourceUrl: string, value: SourcePreview) {
  previewCache.delete(sourceUrl)
  if (previewCache.size >= 40) previewCache.delete(previewCache.keys().next().value!)
  // Episode pages can carry short-lived media URLs; cache those only briefly.
  const ttl = value.episodes.some((episode) => episode.playbackUrl) ? 15_000 : 60_000
  previewCache.set(sourceUrl, { expires: Date.now() + ttl, value })
}

function fetchPreview(sourceUrl: string, fresh = false, context?: SourceContext): Promise<SourcePreview> {
  const cacheKey = sourceCacheKey(sourceUrl, context)
  // 刷新当前来源时只失效当前条目，保留相邻作品的缓存，避免返回搜索页后再次等待网络。
  if (fresh) previewCache.delete(cacheKey)
  const cached = previewCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value)
  let pending = fresh ? undefined : previewPending.get(cacheKey)
  if (!pending) {
    // JS 侧也要有期限（VQ-61）：只靠原生 15s 兜底时，插件抛错或桥接丢消息会让这个 Promise
    // 永远悬空——previewPending 里那条记录也就永远留在原地，该地址本次运行内一直走悬空路径。
    pending = withNativeTimeout(androidSource.preview({ sourceUrl, sourceContext: context }), 15_000).then((preview) => {
      if (previewPending.get(cacheKey) === pending) rememberPreview(cacheKey, preview)
      return preview
    }).finally(() => { if (previewPending.get(cacheKey) === pending) previewPending.delete(cacheKey) })
    previewPending.set(cacheKey, pending)
  }
  return pending
}

/**
 * 搜索结果返回后预热第一条来源详情，用户点“立即观看”时通常直接命中缓存，
 * 不必再等一次详情页往返；预热失败不影响列表展示。
 */
let topHitWarm: { key: string; promise: Promise<void> } | null = null
function warmTopHit(hits: SourceHit[]): Promise<void> {
  const first = hits[0]
  if (!first || first.kind === 'resource') return Promise.resolve()
  const scope = activeSubscriptionScope()
  const key = sourceCacheKey(first.sourceUrl, first.sourceContext)
  if (topHitWarm?.key === key) return topHitWarm.promise
  const promise = fetchPreview(first.sourceUrl, false, first.sourceContext).then(async preview => {
    if (scope !== activeSubscriptionScope() || section.value !== 'search') return
    if (preview.coverUrl) startCoverCache(preview.coverUrl)
    const episode = pickPlayableEpisode(preview.episodes)
    if (!episode) return
    const resolved = episode.playbackUrl ? episode : episode.sourceUrl
      ? await androidSource.resolve(episode.sourceUrl, episode.sourceContext ?? preview.sourceContext) : null
    if (scope === activeSubscriptionScope() && section.value === 'search' && resolved?.playbackUrl
      && playbackType(resolved.playbackUrl) === 'hls') await prewarmInlineManifest(resolved.playbackUrl, resolved.requestHeaders)
  }).catch(() => { /* 预热失败时保持原有加载路径 */ })
  const entry = { key, promise }
  topHitWarm = entry
  void promise.finally(() => { if (topHitWarm === entry) topHitWarm = null })
  return promise
}

// 当前集进入 playing 后才预热相邻集，不让下一集解析争用首帧请求。
let pendingAdjacentWarm: (() => void) | null = null
function scheduleAdjacentWarm(episode: SourceEpisode, preview: SourcePreview) {
  const generation = playbackGeneration
  const warm = () => {
    if (generation === playbackGeneration && sourcePreview.value === preview) warmAdjacentEpisode(episode, preview)
  }
  if (video.value && !video.value.paused && video.value.readyState >= 3) warm()
  else pendingAdjacentWarm = warm
}

async function episodeOptions(sourceUrl: string, context?: SourceContext): Promise<SourceEpisode[]> {
  return (await fetchPreview(sourceUrl, false, context)).episodes
}

function warmAdjacentEpisode(episode: SourceEpisode, preview: SourcePreview) {
  if (sourcePreview.value !== preview) return
  const group = episodeGroups.value.find((entry) => entry.episodes.some((candidate) => candidate.id === episode.id))
  if (!group) return
  const index = group.episodes.findIndex((candidate) => candidate.id === episode.id)
  const next = group.episodes[index + 1] ?? group.episodes[index - 1]
  if (next?.sourceUrl && !next.playbackUrl && next.sourceUrl !== episode.sourceUrl) {
    if ((next.sourceContext ?? preview.sourceContext)?.content) {
      void androidSource.resolve(next.sourceUrl, next.sourceContext ?? preview.sourceContext).catch(() => {})
      return
    }
    void episodeOptions(next.sourceUrl, next.sourceContext).then((options) => {
      if (sourcePreview.value !== preview) return
      const resolved = resolvePlayableLine(options.filter((candidate) => episodeMediaType(candidate)), next, next.lineId === 'main' ? '' : next.lineId || '', false)
      if (resolved?.playbackUrl) {
        if (inlineMediaAvailable()) void prewarmInlineManifest(resolved.playbackUrl, resolved.requestHeaders)
        else { warmMediaHost(resolved.playbackUrl); prefetchHlsManifest(resolved.playbackUrl) }
      }
    }).catch(() => { /* 复用解析缓存，预热失败不改变选集或触发换线。 */ })
  }
  // 下一集已经有直链时提前建立连接并预取很轻的清单（VQ-48）：换集少一次 DNS/TLS 与清单往返。
  if (next?.playbackUrl) {
    if (inlineMediaAvailable()) void prewarmInlineManifest(next.playbackUrl, next.requestHeaders)
    else if (!nativePlaybackAvailable()) { warmMediaHost(next.playbackUrl); prefetchHlsManifest(next.playbackUrl) }
  }
}

const WARM_LINK_REL = 'sanye-media-source'
const PREFETCH_MANIFEST_TIMEOUT_MS = 6_000
const manifestPrefetches = new Map<string, { expires: number; controller: AbortController }>()
/**
 * 预连接媒体主机：起播与换集前先完成 DNS/TLS 握手，省掉首片请求里的建连等待。
 * 只按来源地址的 origin 建链，不改变请求内容，失败也不影响原有加载路径。
 */
function warmMediaHost(url?: string) {
  if (!url) return
  let origin = ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return
    origin = parsed.origin
  } catch { return }
  for (const rel of ['dns-prefetch', 'preconnect']) {
    if (document.head.querySelector(`link[data-rel="${WARM_LINK_REL}"][rel="${rel}"][href="${origin}"]`)) continue
    const link = document.createElement('link')
    link.rel = rel
    link.href = origin
    link.crossOrigin = 'anonymous'
    link.dataset.rel = WARM_LINK_REL
    document.head.appendChild(link)
  }
}
/**
 * 只预取体积很小的清单，不提前下载下一集视频分片：清单命中后换集只等分片，
 * 也避免在移动网络上产生用户没要求的流量。失败交给正常加载路径。
 */
function prefetchHlsManifest(url?: string) {
  if (!url || playbackType(url) !== 'hls') return
  const cached = manifestPrefetches.get(url)
  if (cached && cached.expires > Date.now()) return
  if (cached) cached.controller.abort()
  if (manifestPrefetches.size >= 8) {
    const oldest = manifestPrefetches.keys().next().value!
    manifestPrefetches.get(oldest)?.controller.abort()
    manifestPrefetches.delete(oldest)
  }
  const controller = new AbortController()
  const entry = { expires: Date.now() + 15_000, controller }
  manifestPrefetches.set(url, entry)
  const timer = window.setTimeout(() => controller.abort(), PREFETCH_MANIFEST_TIMEOUT_MS)
  void fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'force-cache', signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) { if (manifestPrefetches.get(url) === entry) manifestPrefetches.delete(url); return }
      await response.text()
    })
    .catch(() => { if (manifestPrefetches.get(url) === entry) manifestPrefetches.delete(url) })
    .finally(() => window.clearTimeout(timer))
}

/** 详情页解析完成时预热前几条线路的媒体主机（最多 3 个 origin），点选集时少一次建连等待。 */
function warmPreviewHosts(preview: SourcePreview) {
  const origins = new Set<string>()
  for (const episode of preview.episodes) {
    if (!episode.playbackUrl) continue
    try {
      const parsed = new URL(episode.playbackUrl)
      if (parsed.protocol !== 'https:') continue
      origins.add(parsed.origin)
    } catch { continue }
    if (origins.size >= 3) break
  }
  for (const origin of origins) warmMediaHost(origin)
}

/**
 * 起播关键路径上的两个模块在空闲时预热（VQ-49）。
 *
 * `hls.js`（523KB／gzip 162KB）与实时增强模块原本都在点击「立即观看」之后才动态导入，
 * 这段读盘与解析会算进首帧；预热只提前加载同一份产物，不创建会话、不改变任何行为。
 */
function prewarmPlaybackModules() {
  const load = () => {
    void import('hls.js').catch(() => { /* 预热失败时仍按原路径在起播时加载 */ })
    void import('../../video/realtimeInterpolation').catch(() => { /* 同上 */ })
  }
  const idle = window.requestIdleCallback
  if (typeof idle === 'function') idle(load, { timeout: 2_000 })
  else window.setTimeout(load, 300)
}

/**
 * @param waitForWrites 是否先等在途写入落库。
 *   保存队列内部会调用本函数，若在队列内部再等自己就会自锁，因此队列内部传 false（VQ-55）。
 */
async function reloadHistory(waitForWrites = true) {
  const request = ++historyReadRequest
  historyLoading.value = true
  try {
    // 读之前先等在途写入落库（VQ-55）：退出播放器后马上点进观看历史时，
    // 列表不能读到写入之前的旧数据——用户看到的就是「退出后历史没更新，过一会儿才有」。
    if (waitForWrites) {
      // 等在途写入落库，但不能被一次卡住的写入无限期拖住：读取本身必须能完成，
      // 否则历史页会一直停在「正在读取」而不显示任何条目（VQ-55）。
      await Promise.race([
        progressQueue.catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 1_200)),
      ])
    }
    // 读取同样要有上限（VQ-60）：原生一旦不回消息，这里的 finally 永不执行，
    // 历史页会永久停在「正在读取」而不是给出可重试的失败。
    let items = (await withNativeTimeout(androidCatalog.listHistory(), 8_000)).items
    const migration = await withNativeTimeout(migrateLegacySourceBindings([], items), 8_000)
    if (migration.migrated) items = (await withNativeTimeout(androidCatalog.listHistory(), 8_000)).items
    // 页面切换、退出播放器和进度落盘可能同时触发读取；旧响应不能把新历史快照覆盖掉。
    if (request !== historyReadRequest) return
    history.value = items.map(entry => ({ ...entry, sourceContext: entry.sourceContext ?? savedSourceContext(historySourceBindingKey(entry)) ?? { content: '' } }))
    if (section.value === 'history') void recoverHistoryCovers()
    historyError.value = ''
  } catch {
    if (request === historyReadRequest) historyError.value = '观看历史加载失败，请重试。已有记录仍保留。'
  } finally {
    if (request === historyReadRequest) historyLoading.value = false
  }
}

function disposePlayer(preserveNative = false) {
  pendingAdjacentWarm = null
  if (!preserveNative && retainedNativeId) { void closeRetainedNativePlayback(retainedNativeId).catch(() => {}); retainedNativeId = '' }
  nativeOpening?.abort()
  nativeOpening = undefined
  media3Session?.close()
  media3Session = undefined
  if (downloadedPlaybackId && nativePlaybackPosition) void androidDownloads.recordProgress(downloadedPlaybackId, nativePlaybackPosition.positionSeconds, nativePlaybackPosition.durationSeconds).catch(() => {})
  nativePlaybackActive.value = false
  nativePlaybackPosition = undefined
  releaseSystemPlayback?.()
  releaseSystemPlayback = undefined
  playbackObservation?.finish()
  playbackObservation = undefined
  playbackGeneration++
  pendingSeekTarget = null
  pendingLinePosition = null
  if (seekFrame) { window.cancelAnimationFrame(seekFrame); seekFrame = 0 }
  // 关闭播放器前先落一次进度：pause 事件是异步派发的，等它回到页面时 src 已经被清掉、
  // currentTime 归零，persistProgress 会在开头直接返回——用户看到的就是「看完退出后没有历史」。
  void persistProgress()
  // 换了作品就重新给完整档位一次机会：降档重试只对同一次播放生效。
  enhancementRetryProfile = null
  stopEnhancement()
  video.value?.pause()
  playing.value = false
  playbackEnded.value = false
  hasFirstFrame.value = false
  clearStallWatchdog()
  clearPlaybackStallWatchdog()
  buffering.value = false
  switchingLine.value = false
  chromeMenu.value = null
  chromeVisible.value = true
  gesturePointerId = null
  gestureMode = 'none'
  gestureTapSuppressed = false
  clearChromeTimer()
  playbackSeconds.value = 0
  playbackDuration.value = 0
  seekingPlayback.value = false
  seekDragging.value = false
  seekDragSeconds.value = 0
  hls?.destroy()
  hls = null
  qualityLevels.value = []
  chosenQuality.value = -1
  chosenFps.value = 'auto'
  activeLevel.value = -1
  if (video.value) {
    // 监听器挂在同一个 <video> 上：不摘掉的话每次换集都会多一份（VQ-61）。
    if (volumeChangeHandler) video.value.removeEventListener('volumechange', volumeChangeHandler)
    volumeChangeHandler = null
    video.value.removeAttribute('src')
    video.value.load()
  }
}

/**
 * 给原生调用加超时（VQ-54）。
 *
 * 原生 Promise 一旦悬空（插件抛错、WebView 被冻结、桥接丢消息），串行保存队列会永久卡住，
 * 之后每次「保存进度」都排在它后面永远不执行。超时只影响队列能否继续，不改写库语义。
 */
function withNativeTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('原生调用超时')), ms)
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value) },
      (error: unknown) => { window.clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))) },
    )
  })
}

/** 原生侧的长度与字符上限：超长或含控制字符会被整条拒掉，写库前先收敛。 */
function safeLabel(value: string, limit: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit)
}

/**
 * 封面只是展示字段，但原生侧对封面单独校验（https、无凭证/片段、端口必须是 443、≤2048 字符），
 * 不合法时会连整条记录一起拒掉：一个封面导致播放进度整条丢失是不合理的（VQ-60）。
 * 这里先按同一套规则收敛，坏封面降级为空串，记录照常入库。
 */
function safeCoverUrl(value: string): string {
  const trimmed = safeLabel(value, 2048)
  if (!trimmed) return ''
  if (trimmed.startsWith('/assets/')) return trimmed.includes('..') ? '' : trimmed
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return ''
    if (parsed.port && parsed.port !== '443') return ''
    // 原生还会拒掉非公网主机（没有点号、纯数字 IP、`.local`/`.localhost`/`.internal`）：
    // 这里必须同样收敛，否则这类封面会在原生侧把整条记录一起拒掉，等于没修。
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
    if (!host.includes('.') || /^[0-9.]+$/.test(host)) return ''
    if (/\.(local|localhost|internal)$/.test(host)) return ''
    return trimmed
  } catch {
    return ''
  }
}

function persistProgress(completed = false): Promise<void> {
  const element = video.value
  const item = selected.value
  if (!element || !item || (!completed && element.currentTime <= 0)) return Promise.resolve()
  // 下载文件独立于公网作品身份，不把本地路径写入个人历史或规则备份。
  if (item.url === downloadedPlaybackUrl) {
    if (!downloadedPlaybackId || !Number.isFinite(element.duration) || element.duration <= 0) return Promise.resolve()
    return androidDownloads.recordProgress(downloadedPlaybackId, Math.min(element.currentTime, element.duration), element.duration)
      .catch(() => { notifyOnce('离线进度未能保存，请稍后重试。') })
  }
  // 作品地址必须是公网 https（来源播放页地址带查询参数也算有效——原生此前按「直链媒体」
  // 校验，带一个参数就整条拒绝，表现就是「播放进度保存失败」）；其余情况跳过本次记录。
  const mediaUrl = safeLabel(item.url, 2048)
  if (!/^https:\/\/[^\s]+$/i.test(mediaUrl)) {
    notifyOnce('当前作品地址无法保存观看进度。')
    return Promise.resolve()
  }
  const position = Number.isFinite(element.currentTime) && element.currentTime > 0 ? element.currentTime : 0
  const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 0
  // 秒级覆盖保护（VQ-61）：换线路/自动回退起播会从 0 开始，若直接落库就会把同一集更靠前的进度
  // 覆盖成「几秒」，历史列表里那条也会排到最前，「继续播放」于是从 0 开始。
  // 只在「已有进度明显更靠前、而当前还在开头」时跳过本次写入；正常快进与看到结尾都不受影响。
  const previous = bestHistoryRecord(mediaUrl, activeEpisodeId.value || item.url)
  if (!completed && previous && previous.positionSeconds > 60 && position < previous.positionSeconds - 60) return Promise.resolve()
  const entry = {
    mediaUrl, title: safeLabel(item.title, 120) || '未命名作品', sourceContext: item.sourceContext,
    // 有的来源没有独立线路/条目 id，也没有条目标题：这三个字段是展示用的，
    // 空值会让原生侧整条历史被拒（就是「有的会保存失败」），统一给出可读的非空值。
    episodeId: safeLabel(activeEpisodeId.value || item.url, 256),
    lineId: safeLabel(activeLineId.value || 'main', 256),
    episodeTitle: safeLabel(displayText(activeEpisodeTitle.value) || displayText(item.title), 120) || '正片',
    // 远端 HTTPS 封面与随包相对封面都要入库：只存远端会让随包作品的观看历史没有封面。
    // 坏封面只降级为空串，不再让整条进度被原生拒绝（VQ-60）。
    coverUrl: safeCoverUrl(activeCoverUrl.value),
    // 时长未知（直播/清单还没解析完）时给 0，位置不能超过时长；两者都必须有限。
    positionSeconds: duration > 0 ? Math.min(position, duration) : position, durationSeconds: duration, completed,
  }
  progressQueue = progressQueue.then(async () => {
    // 原生调用可能永远不回调（插件内部抛错、WebView 被冻结）：没有超时的话，
    // 这一个悬空的 Promise 会把后面所有保存都卡在队列里——用户看到的就是「从此再也存不下历史」。
    const result = await withNativeTimeout(androidCatalog.recordProgress(entry), 8_000)
    if (!result.item.sourceContext && !result.item.sourceKey) persistSourceContext(historySourceBindingKey(result.item), item.sourceContext)
    if (completed || section.value === 'history') await reloadHistory(false)
  }).catch(() => {
    notifyOnce('这次播放进度未能保存，不影响继续观看。')
  })
  return progressQueue
}

function onTimeUpdate() {
  if (video.value) playbackObservation?.tick(video.value.currentTime, !video.value.paused, seekingPlayback.value || seekDragging.value)
  // 画面在前进就说明缓冲结束、卡顿解除（VQ-61）。
  if (!seekingPlayback.value && !video.value?.seeking && video.value && video.value.currentTime > playbackStallPosition + 0.05) {
    clearPlaybackStallWatchdog()
    if (buffering.value) buffering.value = false
    if (!video.value.paused && !video.value.ended) armPlaybackStallWatchdog()
  }
  if (!seekingPlayback.value) playbackSeconds.value = video.value?.currentTime || 0
  if (video.value && video.value.currentTime > 0 && Date.now() - lastSavedAt > 5000) {
    lastSavedAt = Date.now()
    void persistProgress()
  }
}
function syncPlaybackDuration() {
  const element = video.value
  if (!element) return
  const duration = Number.isFinite(element.duration) && element.duration > 0
    ? element.duration
    : (element.seekable.length ? element.seekable.end(element.seekable.length - 1) : 0)
  if (duration > 0) playbackDuration.value = duration
}
function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  if (seconds === 0 && playbackDuration.value <= 0) return '--:--'
  const total = Math.floor(seconds)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function togglePlayback() {
  const element = video.value
  if (!element) return
  if (element.paused) void element.play().catch(() => { playerError.value = '播放失败，请检查当前线路或网络。' })
  else if (autoMuted.value) { element.muted = false; autoMuted.value = false }
  else element.pause()
}

function onPlaybackEnded() {
  playbackObservation?.finish()
  playing.value = false
  playbackEnded.value = true
  chromeVisible.value = true
  clearChromeTimer()
  void persistProgress(true)
}
function playNextEpisode() {
  const next = nextEpisode.value
  if (next) void playSourceEpisode(next)
}
function restartPlayback() {
  const element = video.value
  if (!element) return
  playbackEnded.value = false
  element.currentTime = 0
  void element.play().catch(() => { playerError.value = '播放失败，请检查当前线路或网络。' })
}

/** 音量：可拖动的竖条，拖到 0 即静音；档位取 5% 粒度，避免过于跳。 */
const volumeBar = ref<HTMLDivElement | null>(null)
let volumeDragging = false
const volumePercent = computed(() => (video.value?.muted ? 0 : Math.round(playbackVolume.value * 100)))
/** 音量落盘的合并计时器（VQ-61）：拖动期间只写最后一次。 */
let volumeSaveTimer: number | undefined
function setVolumeLevel(level: number) {
  playbackVolume.value = level
  const element = video.value
  if (element) {
    element.volume = level
    element.muted = level === 0
    autoMuted.value = element.muted
  }
  // 音量随设置落盘（VQ-61）：此前只存在内存里，每次启动都跳回 100%。
  // 拖动会连续触发，合并成一次写入，避免刷爆桥接。
  if (volumeSaveTimer !== undefined) window.clearTimeout(volumeSaveTimer)
  volumeSaveTimer = window.setTimeout(() => {
    volumeSaveTimer = undefined
    void updateSettings({ volume: Number(level.toFixed(2)) })
  }, 400)
}
function setVolumeFromPointer(event: PointerEvent) {
  const bar = volumeBar.value
  if (!bar) return
  const rect = bar.getBoundingClientRect()
  if (rect.height <= 0) return
  const ratio = 1 - (event.clientY - rect.top) / rect.height
  setVolumeLevel(Math.min(1, Math.max(0, Math.round(ratio * 20) / 20)))
}
function beginVolumeDrag(event: PointerEvent) {
  if (!event.isPrimary) return
  event.preventDefault()
  clearChromeTimer()
  const bar = event.currentTarget as HTMLElement | null
  try { bar?.setPointerCapture?.(event.pointerId) } catch { /* 指针捕获不可用时仍按元素自身事件处理 */ }
  volumeDragging = true
  setVolumeFromPointer(event)
}
function moveVolumeDrag(event: PointerEvent) {
  if (!volumeDragging || !event.isPrimary) return
  event.preventDefault()
  setVolumeFromPointer(event)
}
function endVolumeDrag() {
  if (!volumeDragging) return
  volumeDragging = false
  scheduleChromeHide()
}
function onVolumeKeydown(event: KeyboardEvent) {
  const step = event.key === 'ArrowUp' ? 0.05 : event.key === 'ArrowDown' ? -0.05 : 0
  if (!step && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  clearChromeTimer()
  const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : playbackVolume.value + step
  setVolumeLevel(Math.min(1, Math.max(0, Math.round(target * 20) / 20)))
}
/**
 * 画面手势：左右滑动调进度，左半屏上下滑动调亮度，右半屏上下滑动调音量。
 * 位移小于阈值仍按“点画面”处理；识别为滑动后松手补发的点击不再切换控制条；
 * 控制条自身的进度与按钮不参与画面手势，拖动进度条仍然是精确调整的方式。
 */
const GESTURE_MARGIN = 10
let gesturePointerId: number | null = null
let gestureMode: 'none' | 'brightness' | 'volume' | 'seek' = 'none'
let gestureStartX = 0
let gestureStartY = 0
let gestureStartBrightness = 1
let gestureStartVolume = 1
let gestureStartSeconds = 0
let gestureStartSide: 'left' | 'right' = 'left'
let gestureTapSuppressed = false
let gestureTapTimer: number | undefined
/**
 * 画面手势提示（VQ-56）：只服务亮度与音量。
 *
 * 用户先要求「画中画进度条上面和中间的提示条都删掉」，随后澄清「我说的是中间的进度提示不是音量与亮度」：
 * 要删的是屏幕中间那条**进度**提示（旧实现在 `kind === 'seek'` 时显示「当前时间 / 总时长」），亮度与音量提示保留。
 * 因此这里的类型里没有 `seek`，进度手势不设置任何提示，也不存在顺手把进度提示加回来的路径。
 */
const gestureHint = ref<{ kind: 'brightness' | 'volume'; percent: number } | null>(null)
let gestureHintTimer: number | undefined
const GESTURE_HINT_HOLD_MS = 700
function showGestureHint(kind: 'brightness' | 'volume', percent: number) {
  if (gestureHintTimer !== undefined) { window.clearTimeout(gestureHintTimer); gestureHintTimer = undefined }
  gestureHint.value = { kind, percent: Math.min(100, Math.max(0, Math.round(percent))) }
}
/** 抬手后延迟收起：松手立刻消失会让用户看不到最终值。 */
function clearGestureHint() {
  if (gestureHintTimer !== undefined) { window.clearTimeout(gestureHintTimer); gestureHintTimer = undefined }
  if (!gestureHint.value) return
  gestureHintTimer = window.setTimeout(() => { gestureHint.value = null; gestureHintTimer = undefined }, GESTURE_HINT_HOLD_MS)
}
/** 进度手势不带提示：把可能还在显示的亮度或音量提示立即收掉。 */
function dismissGestureHint() {
  if (gestureHintTimer !== undefined) { window.clearTimeout(gestureHintTimer); gestureHintTimer = undefined }
  gestureHint.value = null
}
function setScreenBrightness(value: number): number {
  const next = Math.min(1, Math.max(0.2, value))
  screenBrightness.value = next
  return next
}
function gestureSpan(axis: 'x' | 'y'): number {
  const box = video.value?.getBoundingClientRect()
  const size = axis === 'x' ? box?.width : box?.height
  return Math.max(1, size || (axis === 'x' ? window.innerWidth : window.innerHeight))
}
function beginSurfaceGesture(event: PointerEvent) {
  if (!event.isPrimary) return
  // 新手势从干净状态开始：上一次的提示不会跨手势残留。
  dismissGestureHint()
  if ((event.target as Element | null)?.closest?.('.android-player-controls')) return
  gesturePointerId = event.pointerId
  gestureMode = 'none'
  gestureStartX = event.clientX
  gestureStartY = event.clientY
  gestureStartBrightness = screenBrightness.value
  gestureStartVolume = playbackVolume.value
  gestureStartSeconds = seekPositionSeconds.value
  const box = video.value?.getBoundingClientRect()
  gestureStartSide = box && event.clientX - box.left < box.width / 2 ? 'left' : 'right'
}
function moveSurfaceGesture(event: PointerEvent) {
  if (gesturePointerId !== event.pointerId) return
  const dx = event.clientX - gestureStartX
  const dy = event.clientY - gestureStartY
  if (gestureMode === 'none') {
    if (Math.abs(dx) < GESTURE_MARGIN && Math.abs(dy) < GESTURE_MARGIN) return
    // 横向优先判定为调进度：左右滑动是最常用的长距离手势。
    gestureMode = Math.abs(dx) >= Math.abs(dy) ? 'seek' : gestureStartSide === 'left' ? 'brightness' : 'volume'
    // 进度提示按用户要求不再出现：横滑一旦成立就把亮度/音量提示收掉，避免中途串台。
    if (gestureMode === 'seek') dismissGestureHint()
    gestureTapSuppressed = true
    if (gestureTapTimer !== undefined) window.clearTimeout(gestureTapTimer)
    gestureTapTimer = window.setTimeout(() => { gestureTapSuppressed = false; gestureTapTimer = undefined }, 600)
    clearChromeTimer()
    try { (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId) } catch { /* 指针捕获不可用时仍按元素自身事件处理 */ }
  }
  event.preventDefault()
  if (gestureMode === 'seek') {
    // 进度手势只更新画面与时间，不再显示屏幕中间的进度提示（VQ-56）。
    const max = seekMax.value
    if (max <= 0) return
    // 屏幕宽度对应约 60% 时长，长片也能一次滑到目标附近。
    const delta = (dx / gestureSpan('x')) * max * 0.6
    const target = Math.min(max, Math.max(0, gestureStartSeconds + delta))
    seekDragging.value = true
    seekDragSeconds.value = target
    previewSeek(target)
    return
  }
  if (gestureMode === 'brightness') {
    // 上滑变亮、下滑变暗：与音量一致按画面高度换算，手指不用长距离移动。
    const applied = setScreenBrightness(gestureStartBrightness - dy / gestureSpan('y'))
    showGestureHint('brightness', applied * 100)
    return
  }
  const next = Math.min(1, Math.max(0, Math.round((gestureStartVolume - dy / gestureSpan('y')) * 20) / 20))
  setVolumeLevel(next)
  showGestureHint('volume', next * 100)
}
function endSurfaceGesture(event: PointerEvent) {
  if (gesturePointerId !== event.pointerId) return
  gesturePointerId = null
  const mode = gestureMode
  gestureMode = 'none'
  if (mode === 'seek') commitSeek()
  if (mode === 'brightness' || mode === 'volume') clearGestureHint()
  if (mode !== 'none') scheduleChromeHide()
}
/**
 * 进度条拖动：整个 30px 高容器都是命中区，视觉上只画一条细轨道。
 * 拖动期间按帧更新指针位置，已缓冲目标采用短节流，未缓冲目标减少网络定位；
 * 松手时提交最终位置。HLS 每次定位都会中止在途分片，因此预览有节流上限。
 */
function seekSecondsAt(clientX: number, rect: DOMRect | null = null): number {
  const box = rect ?? seekBar.value?.getBoundingClientRect() ?? null
  const max = seekMax.value
  if (!box || max <= 0) return seekDragSeconds.value
  const fraction = box.width > 0 ? (clientX - box.left) / box.width : 0
  return Math.min(1, Math.max(0, fraction)) * max
}
/** 拖动期间缓存滑条几何，避免每次指针移动都强制重排。 */
let seekRect: DOMRect | null = null
let seekFrame = 0
let seekPendingX = 0
let lastPreviewSeekAt = 0
let pendingSeekTarget: { generation: number; seconds: number } | null = null
/**
 * 定位预览（VQ-59）：拖动期间把画质链路降成只出原帧，并把「最小位移」按进度条分辨率折算。
 * 原来固定 2 秒位移对短视频等于大半个进度条，手指拖动几乎不产生新画面，用户感到「拖不动」。
 */
function previewSeek(target: number) {
  const element = video.value
  if (!element || seekMax.value <= 0 || element.seeking || pendingSeekTarget) return
  const now = Date.now()
  let buffered = false
  for (let index = 0; index < element.buffered.length; index++) {
    if (target >= element.buffered.start(index) && target < element.buffered.end(index) - 0.15) { buffered = true; break }
  }
  // 已缓冲的目标跟手预览；未缓冲目标减少分片请求。一次定位落位前不反复中止 HLS 下载。
  if (now - lastPreviewSeekAt < (buffered ? 50 : 280)) return
  const minStep = Math.max(0.2, seekMax.value / 480)
  if (Number.isFinite(element.currentTime) && Math.abs(element.currentTime - target) < minStep) return
  lastPreviewSeekAt = now
  try { element.currentTime = target } catch { /* 缓冲范围未就绪时忽略本次预览 */ }
  playbackSeconds.value = target
}
/** 取消拖动时要写回的播放位置（VQ-61）：预览已经改过 element.currentTime，必须记下原位置。 */
let seekOriginSeconds = 0
function beginSeek(event: PointerEvent) {
  if (seekMax.value <= 0 || !event.isPrimary) return
  // 进度交互一开始就清空画面提示（VQ-56）：亮度/音量提示的 700ms 延迟展示不能跨到定位动作里。
  dismissGestureHint()
  event.preventDefault()
  // 播放中控件会自动隐藏，拖动必须先撤销隐藏计时，否则滑条会在手指按下后消失。
  clearChromeTimer()
  const bar = event.currentTarget as HTMLElement | null
  try { bar?.setPointerCapture?.(event.pointerId) } catch { /* 指针捕获不可用时按元素自身事件继续处理 */ }
  seekRect = bar?.getBoundingClientRect() ?? null
  lastPreviewSeekAt = 0
  seekOriginSeconds = Number.isFinite(video.value?.currentTime) ? (video.value?.currentTime ?? 0) : 0
  seekDragging.value = true
  seekingPlayback.value = true
  beginSeekPreview()
  seekDragSeconds.value = seekSecondsAt(event.clientX, seekRect)
  previewSeek(seekDragSeconds.value)
}
function moveSeek(event: PointerEvent) {
  if (!seekDragging.value || !event.isPrimary) return
  event.preventDefault()
  // 指针事件可能一帧来多次：合并到下一帧统一更新，拖动更跟手。
  seekPendingX = event.clientX
  if (seekFrame) return
  seekFrame = window.requestAnimationFrame(() => {
    seekFrame = 0
    seekDragSeconds.value = seekSecondsAt(seekPendingX, seekRect)
    previewSeek(seekDragSeconds.value)
  })
}
/** 提交一次定位：先保留目标时间，等媒体真正落位后再由 timeupdate 校正显示。 */
function commitSeekTo(target: number) {
  const element = video.value
  const max = seekMax.value
  seekDragging.value = false
  seekingPlayback.value = true
  // 定位是播放段边界：静默窗口内不参与 GPU 后端判定（VQ-49）。
  motionStability.reset()
  motionGuardResumeAt = performance.now() + 2_500
  playbackSeconds.value = target
  // 播完后再定位等于重新选位置，结束遮罩必须让开，否则画面会被“本集播放结束”压住。
  if (max <= 0 || target < max - 0.5) playbackEnded.value = false
  if (element) {
    pendingSeekTarget = { generation: playbackGeneration, seconds: target }
    if (!element.seeking) onSeekSettled()
  } else {
    seekingPlayback.value = false
  }
  syncPlaybackDuration()
  scheduleChromeHide()
  // 落位后留出解码与缓冲的时间，再把完整档位接回来（VQ-59）：立即恢复会让拖动末尾又变卡。
  if (enhancementSession) {
    const session = enhancementSession
    if (previewTimer !== undefined) window.clearTimeout(previewTimer)
    previewTimer = window.setTimeout(() => { previewTimer = undefined; if (enhancementSession === session) session.setPreview(false) }, 400)
  }
}
/** 松手的最终目标不参与预览节流，等待当前定位结束后只提交最后一次选择。 */
function onSeekSettled() {
  const element = video.value
  if (!element || element.seeking) return
  const pending = pendingSeekTarget
  pendingSeekTarget = null
  if (pending && pending.generation === playbackGeneration) {
    try {
      if (Math.abs(element.currentTime - pending.seconds) > 0.05) element.currentTime = pending.seconds
    } catch { /* 尚未可定位时保留媒体实际位置，不保存虚假的目标时间。 */ }
    if (element.seeking) return
  }
  if (seekDragging.value) return
  seekingPlayback.value = false
  playbackSeconds.value = Number.isFinite(element.currentTime) ? element.currentTime : 0
  clearPlaybackStallWatchdog()
  if (!element.paused) armPlaybackStallWatchdog()
  void persistProgress()
}
function commitSeek(event?: PointerEvent) {
  if (!seekDragging.value) return
  if (seekFrame) { window.cancelAnimationFrame(seekFrame); seekFrame = 0 }
  const target = event ? seekSecondsAt(event.clientX, seekRect) : seekDragSeconds.value
  seekRect = null
  commitSeekTo(target)
}
/** 指针中断（来电、系统手势、指针离开）时回到拖动前的位置，不把预览位置当成用户选择。 */
function cancelSeek() {
  if (!seekDragging.value) return
  if (seekFrame) { window.cancelAnimationFrame(seekFrame); seekFrame = 0 }
  seekRect = null
  // 包含从 0 秒开始的拖动；取消也等当前预览落位再恢复，不留下预览进度。
  commitSeekTo(seekOriginSeconds)
}
/** 键盘与读屏用户同样可以定位：左右 5 秒，Home/End 直达首尾。 */
function onSeekKeydown(event: KeyboardEvent) {
  if (seekMax.value <= 0) return
  const step = event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0
  const target = event.key === 'Home' ? 0
    : event.key === 'End' ? seekMax.value
      : step ? playbackSeconds.value + step : NaN
  if (!Number.isFinite(target)) return
  event.preventDefault()
  clearChromeTimer()
  commitSeekTo(Math.min(seekMax.value, Math.max(0, target)))
}

/** 同一作品同一集在本地记录里最靠前的未完成进度（跨线路取最大，VQ-61）。 */
function bestHistoryRecord(mediaUrl: string, episodeId: string) {
  return history.value
    .filter((entry) => entry.mediaUrl === mediaUrl && (!episodeId || entry.episodeId === episodeId) && sameHistorySource(entry.sourceContext, selected.value?.sourceContext) && !entry.completed && entry.positionSeconds > 0)
    .sort((left, right) => right.positionSeconds - left.positionSeconds)[0]
}
function sameHistorySource(left?: SourceContext, right?: SourceContext) {
  return (left?.content || '') === (right?.content || '')
    && left?.sourceIndex === right?.sourceIndex
}
/** 落位：把已看过的进度写进 <video>；时长为 0（清单还没解析完）或已接近结尾时不动。 */
function applyResumePosition(element: HTMLVideoElement, record: { positionSeconds: number; completed: boolean } | undefined) {
  if (!record || record.completed || record.positionSeconds <= 0) return false
  if (!Number.isFinite(element.duration) || record.positionSeconds >= element.duration - 5) return false
  // HLS 已从续播分片起播时不再次定位，避免取消首片并重复下载。
  if (Math.abs(element.currentTime - record.positionSeconds) > 0.25) {
    try { element.currentTime = record.positionSeconds } catch { return false }
  }
  playbackSeconds.value = record.positionSeconds
  return true
}
/**
 * 续播定位（VQ-61 修复）。
 *
 * ① 先按原线路精确匹配；找不到就取同一集任意线路里最靠前的进度——换线或自动回退起播后，
 *    新线路会写出一条「开头几秒」的记录，按原来的严格匹配续播就会从 0 重播；
 * ② history 只在首页/历史分区刷新，同一会话里回到看过的集可能读到旧快照，
 *    本地查不到记录时补一次读取再落位（此时画面通常还没超过 3 秒，回跳不会打断内容）。
 */
function restorePosition() {
  const element = video.value
  const item = selected.value
  if (!element || !item) return
  const generation = playbackGeneration
  // HLS 在首片追加后自行落到 startPosition。metadata 时 currentTime 仍可能为 0，
  // 此时再手动 seek 会取消已下载的首片，甚至对同一 URL 重读。
  if (hlsResumeGeneration === generation) { pendingLinePosition = null; return }
  const episodeId = activeEpisodeId.value
  const lineId = activeLineId.value
  if (pendingLinePosition?.generation === generation) {
    const seconds = pendingLinePosition.seconds
    pendingLinePosition = null
    if (seconds >= 0 && Number.isFinite(element.duration) && seconds < element.duration) {
      try { element.currentTime = seconds; playbackSeconds.value = seconds; return } catch { /* 继续走历史续播。 */ }
    }
  }
  const current = () => generation === playbackGeneration && video.value === element && selected.value?.url === item.url
    && activeEpisodeId.value === episodeId && activeLineId.value === lineId && !seekingPlayback.value
  if (item.url === downloadedPlaybackUrl) { if (offlineResumePosition > 0) applyResumePosition(element, { positionSeconds: offlineResumePosition, completed: false }); return }
  const exact = () => history.value.find((entry) => entry.mediaUrl === item.url && entry.episodeId === episodeId && entry.lineId === lineId && sameHistorySource(entry.sourceContext, item.sourceContext))
  if (!current()) return
  if (applyResumePosition(element, exact() ?? bestHistoryRecord(item.url, episodeId))) return
  void reloadHistory(false).then(() => {
    if (!current() || element.currentTime >= 3) return
    applyResumePosition(element, exact() ?? bestHistoryRecord(item.url, episodeId))
  }).catch(() => { /* 读取失败时保持从头播放 */ })
}

let pendingLinePosition: { generation: number; seconds: number } | null = null
let hlsResumeGeneration = -1

function saveNativeProgress(item: SavedMedia, episodeId: string, episodeTitle: string, lineId: string, coverUrl: string, event: NativePlaybackProgress): Promise<void> {
  const position = event.positionSeconds, duration = event.durationSeconds
  if (!/^https:\/\//i.test(item.url) || /^https:\/\/localhost(?:[:/]|$)/i.test(item.url)
    || !Number.isFinite(position) || position <= 0 || !Number.isFinite(duration) || duration < 0) return Promise.resolve()
  const entry = {
    mediaUrl: safeLabel(item.url, 2048), title: safeLabel(item.title, 120) || '未命名作品', sourceContext: item.sourceContext,
    episodeId: safeLabel(episodeId, 256), episodeTitle: safeLabel(displayText(episodeTitle), 120) || '正片',
    lineId: safeLabel(lineId, 256), coverUrl: safeCoverUrl(coverUrl),
    positionSeconds: duration > 0 ? Math.min(position, duration) : position, durationSeconds: duration, completed: event.completed,
  }
  progressQueue = progressQueue.then(async () => {
    const result = await withNativeTimeout(androidCatalog.recordProgress(entry), 8000)
    if (!result.item.sourceContext && !result.item.sourceKey) persistSourceContext(historySourceBindingKey(result.item), item.sourceContext)
  }).catch(() => { notifyOnce('这次播放进度未能保存，不影响继续观看。') })
  return progressQueue
}

async function startMedia3Playback(item: SavedMedia, url: string, type: MediaType, generation: number, linePosition: number | null, autoPlay: boolean) {
  const localPlayback = item.url === downloadedPlaybackUrl
  const offlineId = localPlayback ? downloadedPlaybackId : ''
  let offlineWrittenAt = 0
  const id = nextNativeSessionId(), episodeId = activeEpisodeId.value, episodeTitle = activeEpisodeTitle.value, lineId = activeLineId.value
  const coverUrl = activeCoverUrl.value
  const choices = new Map<string, SourceEpisode>()
  const choiceId = (episode: SourceEpisode) => `${episode.id}\u0000${episode.lineId || 'main'}`
  for (const episode of playerEpisodes.value) choices.set(choiceId(episode), episode)
  const nextChoice = nextEpisode.value
  const currentGroup = episodeGroups.value.find(group => group.episodes.some(episode => episode.id === episodeId && (episode.lineId || 'main') === lineId))
  const currentIndex = currentGroup?.episodes.findIndex(episode => episode.id === episodeId && (episode.lineId || 'main') === lineId) ?? -1
  const previousChoice = currentGroup && currentIndex > 0 ? currentGroup.episodes[currentIndex - 1] : undefined
  const records = history.value.filter(entry => entry.mediaUrl === item.url && entry.episodeId === episodeId && sameHistorySource(entry.sourceContext, item.sourceContext))
  const exact = records.find(entry => entry.lineId === lineId)
  const best = records.filter(entry => !entry.completed).sort((a, b) => b.positionSeconds - a.positionSeconds)[0]
  const resume = exact ?? best
  const position = linePosition ?? (localPlayback ? offlineResumePosition : resume && !resume.completed && (!resume.durationSeconds || resume.positionSeconds < resume.durationSeconds - 5) ? resume.positionSeconds : 0)
  const opening = new AbortController()
  nativeOpening = opening
  try {
    const session = await openNativePlayback({
      sessionId: id, url: localPlayback ? downloadedNativeUrl : url,
      mimeType: type === 'hls' ? 'application/x-mpegURL' : 'video/mp4', title: item.title, episodeTitle,
      requestHeaders: activeSourceEpisode().requestHeaders,
      positionSeconds: position, rate: settings.value.playbackRate, volume: playbackVolume.value, autoPlay,
      nextChoiceId: nextChoice ? choiceId(nextChoice) : undefined,
      previousChoiceId: previousChoice ? choiceId(previousChoice) : undefined,
      choices: [...choices].slice(0, 500).map(([id, episode]) => ({ id, group: episodeGroups.value.find(group => group.episodes.includes(episode))?.key || '选集', label: episodeLabel(episode).slice(0, 160), selected: episode.id === episodeId && (episode.lineId || 'main') === lineId })),
      firstFrameTimeoutMs: bundledTakeoverAvailable() ? 20_000 : 30_000,
      lightTheme: appearanceLight.value,
      replaceId: retainedNativeId || undefined, autoNext: settings.value.autoPlay,
    }, event => {
      if (generation !== playbackGeneration || opening.signal.aborted) return
      nativePlaybackPosition = event
      if (offlineId && (Date.now() - offlineWrittenAt >= 5000 || event.completed)) {
        offlineWrittenAt = Date.now()
        void androidDownloads.recordProgress(offlineId, event.positionSeconds, event.durationSeconds).catch(() => { notifyOnce('离线进度未能保存，请稍后重试。') })
      }
      if (Date.now() - lastSavedAt >= 5000 || event.completed) {
        lastSavedAt = Date.now()
        void saveNativeProgress(item, episodeId, episodeTitle, lineId, coverUrl, event)
      }
    }, opening.signal)
    if (generation !== playbackGeneration || opening.signal.aborted) { session.close(); return }
    media3Session = session
    retainedNativeId = ''
    void session.result.then(async result => {
      if (offlineId) void androidDownloads.recordProgress(offlineId, result.positionSeconds, result.durationSeconds).catch(() => {})
      // 进度按队列落盘，切集无需等待一次 SQLite 往返。
      void saveNativeProgress(item, episodeId, episodeTitle, lineId, coverUrl, result)
      if (!localPlayback && typeof result.started === 'boolean') recordPlaybackSample(healthKey(item.url, item.sourceContext), {
        started: result.started, failed: result.action === 'error', firstFrameMs: result.firstFrameMs ?? 0,
        watchedSeconds: result.watchedSeconds ?? 0, stallSeconds: result.stallSeconds ?? 0,
      })
      if (generation !== playbackGeneration || opening.signal.aborted) return
      media3Session = undefined
      if (result.retained) retainedNativeId = id
      if (PLAYBACK_RATES.some(rate => rate === result.rate) && result.rate !== settings.value.playbackRate) void updateSettings({ playbackRate: result.rate })
      if (result.volume !== undefined && result.volume !== settings.value.volume) void updateSettings({ volume: result.volume })
      if (result.action === 'retry') {
        nativePlaybackPosition = result
        if (sourcePreview.value?.sourceUrl === item.url && !mediaType(item.url) && !localPlayback) {
          await retryCurrentLine()
          if (generation === playbackGeneration) { disposePlayer(); selected.value = null; watchPage.value = false }
        } else await watch(item, url, episodeId, episodeTitle, lineId, true, type)
        if (retainedNativeId === id && generation === playbackGeneration) { await failRetainedNativePlayback(id); retainedNativeId = ''; disposePlayer(); selected.value = null; watchPage.value = false }
        return
      }
      if (result.action === 'switch') {
        nativePlaybackPosition = result
        await switchToFallbackLine()
        if (generation !== playbackGeneration) return
        sourceError.value = playerError.value || '当前选集没有其他可用线路。'
      }
      if (result.action === 'choice' && result.choiceId) {
        const episode = choices.get(result.choiceId)
        if (episode) {
          nativePlaybackPosition = result
          await playSourceEpisode(episode)
          if (retainedNativeId === id && generation === playbackGeneration) { await failRetainedNativePlayback(id); retainedNativeId = ''; disposePlayer(); selected.value = null; watchPage.value = false }
          return
        }
      }
      if (result.action === 'error') {
        nativePlaybackPosition = result
        await handlePlaybackFailure(result.error || '播放失败，请换条线路或重试。')
        if (generation !== playbackGeneration) return
        sourceError.value = playerError.value || result.error || '这条线路暂时无法播放，请选择其他线路。'
        if (!sourcePreview.value) notifyOnce(sourceError.value)
      }
      if (retainedNativeId === id) { await failRetainedNativePlayback(id); retainedNativeId = '' }
      disposePlayer()
      selected.value = null
      watchPage.value = false
      void reloadHistory()
    }).catch(failure => {
      if (generation !== playbackGeneration || opening.signal.aborted) return
      sourceError.value = failure instanceof Error ? failure.message : '原生播放器未能完成播放，请重试。'
      if (!sourcePreview.value) notifyOnce(sourceError.value)
      disposePlayer(); selected.value = null; watchPage.value = false
    })
  } catch (failure) {
    if (generation !== playbackGeneration || opening.signal.aborted) return
    sourceError.value = failure instanceof Error ? failure.message : '原生播放器启动失败，请重试。'
    if (!sourcePreview.value) notifyOnce(sourceError.value)
    disposePlayer(); selected.value = null; watchPage.value = false
  }
}

async function watch(item: SavedMedia, playbackUrl = item.url, episodeId = 'direct', episodeTitle = '视频', lineId = 'main', forcePlay = true, mediaHint: MediaType | null = null) {
  const type = playbackType(playbackUrl) ?? mediaHint
  if (!type) { playerError.value = '这个地址暂时无法播放，请选择其他线路。'; return }
  const keepPlaying = nativePlaybackPosition?.playing || (!!video.value && !video.value.paused)
  ++episodeRequest
  sourceLoading.value = false
  // 换集/换线时画面会短暂空白、声音中断：给一个舞台内「正在切换线路…」提示（VQ-61）。
  const previousSelection = selected.value
  const previousEpisode = activeSourceEpisode()
  const targetEpisode = sourcePreview.value?.episodes.find((episode) => episode.id === episodeId)
    ?? { id: episodeId, title: episodeTitle, sourceUrl: episodeId, playbackUrl, mimeType: '', lineId }
  const sameWork = previousSelection && sameHistorySource(previousSelection.sourceContext, item.sourceContext) && (previousSelection.url === item.url
    || (bundledWork.value?.sourceUrl === item.url && titleKey(previousSelection.title) === titleKey(item.title)))
  const linePosition = sameWork && sameEpisode(previousEpisode, targetEpisode)
    && (nativePlaybackPosition !== undefined || activeLineId.value !== lineId || activePlaybackUrl.value !== playbackUrl)
    ? (nativePlaybackPosition?.positionSeconds ?? (seekingPlayback.value ? playbackSeconds.value : video.value?.currentTime ?? playbackSeconds.value)) : null
  const switchingEpisode = previousSelection !== null
    && (previousSelection.url !== item.url || !sameHistorySource(previousSelection.sourceContext, item.sourceContext) || activeEpisodeId.value !== episodeId || activeLineId.value !== lineId)
  switchingLine.value = switchingEpisode
  activePlaybackUrl.value = playbackUrl
  // 起播前先和媒体主机建链（VQ-48）：首片请求不再额外等一次 DNS/TLS。
  warmMediaHost(playbackUrl)
  // Capture the outgoing identity before replacing the player; persistence must not stall playback.
  void persistProgress()
  disposePlayer(Boolean(retainedNativeId && nativePlaybackAvailable() && sameWork))
  const generation = playbackGeneration
  if (item.url !== downloadedPlaybackUrl) { downloadedPlaybackId = ''; offlineResumePosition = 0 }
  switchingLine.value = switchingEpisode
  if (linePosition !== null && Number.isFinite(linePosition)) pendingLinePosition = { generation, seconds: linePosition }
  selected.value = item
  activeEpisodeId.value = episodeId
  activeEpisodeTitle.value = episodeTitle
  activeLineId.value = lineId
  playerError.value = ''
  lastSavedAt = 0
  if (nativePlaybackAvailable() && item.url === downloadedPlaybackUrl) {
    nativePlaybackActive.value = true
    await startMedia3Playback(item, playbackUrl, type, generation, linePosition, settings.value.autoPlay || keepPlaying || forcePlay)
    return
  }
  await nextTick()
  if (generation !== playbackGeneration) return
  const element = video.value
  if (!element) return
  element.playbackRate = settings.value.playbackRate
  releaseSystemPlayback = attachSystemPlayback(element, () => ({ title: selected.value?.title || 'sanye_anime', episode: activeEpisodeTitle.value }))
  playbackObservation = item.url === downloadedPlaybackUrl ? undefined : createPlaybackObservation(healthKey(item.url, item.sourceContext))
  element.volume = playbackVolume.value
  if (volumeChangeHandler) element.removeEventListener('volumechange', volumeChangeHandler)
  volumeChangeHandler = () => {
    if (element === video.value && !element.muted) playbackVolume.value = element.volume
  }
  element.addEventListener('volumechange', volumeChangeHandler)
  if (type === 'hls') {
    const { default: HlsRuntime } = await import('hls.js')
    if (generation !== playbackGeneration) return
    if (HlsRuntime.isSupported()) {
      // 与网页共用加载和带宽策略，手机采用更小的缓冲窗口，分片缓存仍用于换集和回看。
      const mediaRecovery = new HlsMediaRecovery()
      const headers = targetEpisode.requestHeaders || {}
      const NativeLoader = inlineMediaAvailable() ? inlineMediaLoader(HlsRuntime, headers) : undefined
      const resume = history.value.find(entry => entry.mediaUrl === item.url && entry.episodeId === episodeId
        && entry.lineId === lineId && sameHistorySource(entry.sourceContext, item.sourceContext)) ?? bestHistoryRecord(item.url, episodeId)
      const startPosition = linePosition ?? (resume && !resume.completed && resume.positionSeconds > 0
        && (!resume.durationSeconds || resume.positionSeconds < resume.durationSeconds - 5) ? resume.positionSeconds : 0)
      if (startPosition > 0 || linePosition !== null) hlsResumeGeneration = generation
      hls = new HlsRuntime({
        ...hlsPlaybackConfig(true),
        startPosition,
        ...(NativeLoader ? { loader: NativeLoader } : {}),
        fLoader: androidFragmentCache(HlsRuntime, NativeLoader, `${sourceCacheKey(item.url, item.sourceContext)}\u0000${JSON.stringify(headers)}`).Loader,
      })
      hls.on(HlsRuntime.Events.ERROR, (_, data) => {
        if (generation !== playbackGeneration) return
        if (!data.fatal) {
          // 非致命错误此前直接丢弃（VQ-61）：分片重试/缓冲停滞期间给一个舞台内提示，
          // 长时间不恢复由 waiting 看门狗兜底换线。
          if (data.details === 'bufferStalledError' || data.details === 'fragLoadError' || data.details === 'fragLoadTimeOut') {
            if (hasFirstFrame.value) buffering.value = true
          }
          return
        }
        clearStallWatchdog()
        clearPlaybackStallWatchdog()
        if (data.type === HlsRuntime.ErrorTypes.MEDIA_ERROR && hls && mediaRecovery.attempt()) {
          hls.recoverMediaError()
          armStallWatchdog(generation)
          armPlaybackStallWatchdog()
          return
        }
        void handlePlaybackFailure('播放失败，请换条线路或重试。')
      })
      hls.on(HlsRuntime.Events.MANIFEST_PARSED, () => {
        if (generation !== playbackGeneration || !hls) return
        qualityLevels.value = hls.levels.map((level, index) => ({
          index, fps: Number.isFinite(level.frameRate) && level.frameRate > 0 ? level.frameRate : null,
          label: `${level.height ? `${level.height}P` : `档位 ${index + 1}`}${level.bitrate ? ` · ${Math.round(level.bitrate / 1000)} kbps` : ''}${level.frameRate ? ` · ${level.frameRate} FPS` : ''}`,
        }))
        // 起播前选择的清晰度/帧率在清单就绪后立即生效，而不是停留在“已选择”。
        applyStreamSelection()
      })
      hls.on(HlsRuntime.Events.LEVEL_SWITCHED, (_, data) => {
        if (generation !== playbackGeneration) return
        const previous = activeLevel.value
        activeLevel.value = data.level
        // 自动档位下降时明确告知（VQ-61）：弱网下画面变糊但没有任何提示，用户会以为画质坏了。
        if (chosenQuality.value < 0 && previous >= 0 && data.level < previous) {
          const level = qualityLevels.value[data.level]
          showQualityNotice(`网络较慢，已自动降到${level?.label.split(' · ')[0] ?? '更低清晰度'}`)
        }
      })
      hls.loadSource(playbackUrl)
      hls.attachMedia(element)
    } else if (element.canPlayType('application/vnd.apple.mpegurl')) element.src = playbackUrl
    else playerError.value = '此设备暂时无法播放这条线路，请换条线路。'
  } else if (type === 'mp4') {
    element.src = playbackUrl
  }
  armStallWatchdog(generation)
  if ((settings.value.autoPlay || keepPlaying || forcePlay) && !playerError.value) void playWhenReady(element, generation)
}

async function playWhenReady(element: HTMLVideoElement, generation: number) {
  if (generation !== playbackGeneration || element !== video.value || playerError.value) return
  try {
    await element.play()
  } catch (failure) {
    // 起播被后台暂停、切集或手动暂停取消后，不得用静音重试偷偷恢复。
    if (generation !== playbackGeneration || element !== video.value || document.hidden || backgroundPaused.value) return
    if (failure instanceof Error && (failure.name === 'AbortError' || failure.message === '播放请求已取消')) return
    // Android WebView 通常禁止带声音的自动播放；按 PC 端外部预览策略静音重试，
    // 视频先开始播放，用户点击声音按钮后再恢复音频，不把系统策略误报为线路失败。
    element.muted = true
    try {
      await element.play()
      if (generation === playbackGeneration) autoMuted.value = true
    } catch {
      if (generation === playbackGeneration) playerError.value = '播放失败，请检查当前线路或网络。'
    }
  }
}

async function continueWatching(entry: WatchHistory) {
  const context = entry.sourceContext ?? savedSourceContext(historySourceBindingKey(entry)) ?? { content: '' }
  // 「继续观看」必须落到带播放器和作品详情的页面：先切到详情，再解析并播放原来的选集/线路。
  watchPage.value = true
  section.value = 'detail'
  detailReturn.value = 'history'
  if (!mediaType(entry.mediaUrl)) {
    // 历史记录指向随包作品时直接用已有线路续播，不再让来源站往返决定等待时间。
    const work = (context?.content ?? sourceContent(entry.mediaUrl)) ? undefined : bundledWorkFor(entry.title, entry.mediaUrl)
    const pool = bundledEpisodes(work)
    const bundled = pool.find((candidate) => candidate.id === entry.episodeId && (candidate.lineId || 'main') === entry.lineId)
      ?? pool.find((candidate) => candidate.id === entry.episodeId)
    if (work && bundled) { await playBundledEpisode(work, bundled); return }
    // 这条历史不属于随包作品：清掉上一部作品的已有线路池，避免换线时串到别的作品。
    bundledPool.value = []
    bundledWork.value = null
    await previewSource(entry.mediaUrl, false, { title: entry.title, coverUrl: entry.coverUrl || '', summary: '', sourceContext: context })
    const episode = sourcePreview.value?.episodes.find((candidate) => candidate.id === entry.episodeId && (candidate.lineId || 'main') === entry.lineId)
      ?? sourcePreview.value?.episodes.find((candidate) => candidate.id === entry.episodeId && !candidate.playbackUrl)
    if (!episode) {
      // 解析不到原选集时留在详情页，用户可以直接在下面的选集列表里挑一条；历史记录不会丢。
      sourceError.value = '原选集暂时无法播放，请在下方重新选择。历史记录仍保留。'
      if (!sourcePreview.value) { section.value = 'library'; fail('作品加载失败，请稍后再试。历史记录仍保留。') }
      return
    }
    await playSourceEpisode(episode, entry.lineId)
    return
  }
  await watch({ id: -1, title: entry.title, url: entry.mediaUrl, favorite: false, updatedAt: entry.updatedAt }, entry.mediaUrl, entry.episodeId, entry.episodeTitle, entry.lineId)
}

/** 重新进入搜索页：清掉上一次的关键词、结果与空态，避免“上一次的文字还在”。 */
function resetSearch() {
  searchRequest++
  searchLoading.value = false
  searchProgress.value = ''
  searchInFlightKeyword = ''
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
  sourceKeyword.value = ''
  sourceHits.value = []
  sourceError.value = ''
  sourceSearched.value = false
  sourcePreview.value = null
  lastHitsKeyword = ''
}

/**
 * 第一次检索最容易撞上来源冷启动（线程/连接刚建立）而单次超时：
 * 静默隔 350ms 重试一次，仍然失败才把错误交给界面。
 * 两次都加 JS 侧期限（VQ-61）：原生 15s 兜底之外再守一道，避免接口永久悬空时按钮一直禁用。
 */
async function requestHits(keyword: string, request: number, progress: (result: SourceSearchResult) => void): Promise<SourceSearchResult> {
  if (activeSubscriptionContent()) return await withNativeTimeout(androidSource.search({ keyword }, progress), 13_000)
  try { return await withNativeTimeout(androidSource.search({ keyword }, progress), 15_000) }
  catch (cause) {
    if ((cause as { code?: string })?.code === 'E_SEARCH_CANCELLED' || request !== searchRequest) return { hits: [] }
    await new Promise((resolve) => setTimeout(resolve, 350))
    if (request !== searchRequest) return { hits: [] }
    return await withNativeTimeout(androidSource.search({ keyword }, progress), 15_000)
  }
}

/** 当前在途检索的关键词：同一个关键词不重复打来源，新的关键词取代旧检索（不再直接丢弃）。 */
let searchInFlightKeyword = ''
watchValue(activeSubscriptionScope, () => {
  searchVersionChecks.reset()
  rejectedSearchVersions.value = new Set()
  recentKeywords.value = recentSearches(activeSubscriptionScope())
  repositoryQuery.value = ''
  repositorySortOpen.value = false
  // 保存原播放器进度后退出，旧订阅的选集与手动候选不留在新作用域。
  if (selected.value) void closePlayer()
  watchPage.value = false
  if (section.value === 'detail') section.value = 'home'
  repositoryRequest++
  repositoryHits.value = []
  repositoryNextPages.value = {}; repositoryIsDirectory.value = false; repositoryTruncated.value = false; repositoryLoading.value = false
  repositoryError.value = ''
  searchRequest++; previewRequest++; episodeRequest++
  sourceLoading.value = false
  searchLoading.value = false
  searchProgress.value = ''
  sourceError.value = ''; sourceSearched.value = false
  searchInFlightKeyword = ''; lastHitsKeyword = ''
  sourceHits.value = []; sourcePreview.value = null
  searchSourceFilter.value = ''
  sourceQueue.value = []; bundledPool.value = []; bundledWork.value = null
  if (section.value === 'library') void loadRepository()
  if (section.value === 'search' && sourceKeyword.value.trim()) void nextTick(() => searchSources())
}, { flush: 'sync' })
async function searchSources() {
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
  const keyword = sourceKeyword.value.trim()
  if (!keyword) return
  if (usingSubscription.value && !activeSubscriptionContent()) {
    sourceError.value = '来源未就绪，请重新选择。'
    sourceSearched.value = true
    return
  }
  const normalizedKeyword = keyword.toLocaleLowerCase()
  const cacheKey = `${activeSubscriptionScope()}\u0000${normalizedKeyword}`
  // 原来这里是 `if (sourceLoading.value) return`：旧检索还在跑时，用户改了关键词再触发检索会被**静默丢弃**
  // ——实测输入框显示「第二」、列表还是「第一」的结果，而桥接只收到一次 search。现在改成：同一关键词不重复发，
  // 不同关键词直接取代（stale 响应本来就由 searchRequest 序号丢弃）。
  if (searchLoading.value && cacheKey === searchInFlightKeyword) return
  const request = ++searchRequest
  searchInFlightKeyword = cacheKey
  searchLoading.value = true
  searchProgress.value = '正在搜索来源…'
  sourceError.value = ''
  sourceSearched.value = true
  recentKeywords.value = rememberSearch(activeSubscriptionScope(), keyword)
  // 连点两次搜索时不要先把上一次的结果清空：清空 + 来源请求排队会让界面看起来“搜不到”。
  if (cacheKey !== lastHitsKeyword) { searchVersionChecks.cancel(); sourceHits.value = []; searchSourceFilter.value = '' }
  sourcePreview.value = null
  const publish = (result: SourceSearchResult) => {
    if (request !== searchRequest || `${activeSubscriptionScope()}\u0000${sourceKeyword.value.trim().toLocaleLowerCase()}` !== cacheKey) return
    const hits = result.hits
    if (sourceKeyword.value.trim().toLocaleLowerCase() === normalizedKeyword) {
      // 同一关键词的空结果（来源抖动或竞速超时）保留上一次的结果，而不是直接显示“没有找到”。
      if (hits.length || !sourceHits.value.length) {
        const merged = new Map(sourceHits.value.map(hit => [sourceHitKey(hit), hit]))
        for (const hit of hits) merged.set(sourceHitKey(hit), hit)
        sourceHits.value = [...merged.values()]
        lastHitsKeyword = cacheKey
      }
      warmTopHit(sourceHits.value)
    }
    searchProgress.value = result.total ? `搜索中 ${result.completed ?? 0}/${result.total}` : '搜索中…'
  }
  try {
    const result = await requestHits(keyword, request, publish)
    if (request !== searchRequest) return
    publish(result)
    // 搜索先展示，后台最多两项核查；检查只更新提示，不删除已展示的作品。
    // 首条预热优先；离开搜索或更换关键词后，旧任务不再入队。
    void warmTopHit(sourceHits.value).then(() => {
      if (request === searchRequest && section.value === 'search') {
        void searchVersionChecks.enqueue(result.hits.filter(hit => hit.kind !== 'resource'))
      }
    })
    if (usingSubscription.value) {
      const merged = new Map(repositoryHits.value.map(hit => [sourceHitKey(hit), hit]))
      for (const hit of result.hits) merged.set(sourceHitKey(hit), hit)
      repositoryHits.value = [...merged.values()].slice(0, 200)
    }
    if (result.warnings?.length) sourceError.value = '部分来源暂不可用，可重试。'
  }
  catch { if (request === searchRequest) sourceError.value = '搜索失败，请检查网络后重试。' }
  // 只有最新一次请求能收掉「读取中」：被取代的旧请求结束时不能把新请求的状态一起清掉。
  finally { if (request === searchRequest) { searchLoading.value = false; searchProgress.value = ''; searchInFlightKeyword = '' } }
}

async function previewSource(sourceUrl: string, fresh = false, seed?: { title: string; coverUrl: string; summary: string; sourceContext?: SourceContext }): Promise<boolean> {
  const request = ++previewRequest
  const previousSection = section.value
  sourceLoading.value = true
  sourceError.value = ''
  // 详情区先用搜索命中或已保存作品的标题、封面和简介占位，避免点击后长时间空白，
  // 也避免在上一次预览未失效时短暂显示上一部作品的选集。
  const context = seed?.sourceContext ?? { content: sourceContent(sourceUrl) }
  const previous = sourcePreview.value?.sourceUrl === sourceUrl && sameHistorySource(sourcePreview.value.sourceContext, context) ? sourcePreview.value : null
  const expectedTitle = seed?.title || previous?.title
    || sourceHits.value.find((hit) => hit.sourceUrl === sourceUrl && sameHistorySource(hit.sourceContext, context))?.title
    || items.value.find((item) => item.url === sourceUrl && sameHistorySource(item.sourceContext, context))?.title
    || catalogSnapshot.find((item) => item.sourceUrl === sourceUrl)?.title || ''
  sourcePreview.value = {
    title: seed?.title || previous?.title || '',
    sourceUrl,
    coverUrl: seed?.coverUrl || previous?.coverUrl || '',
    summary: seed?.summary || previous?.summary || '',
    episodes: previous?.episodes ?? [],
    sourceContext: context,
  }
  try {
    const preview = await fetchPreview(sourceUrl, fresh, context)
    if (request !== previewRequest) return false
    // 来源有明确标题时必须仍是用户选择的作品；缺标题继续使用既有种子降级。
    const sameWorkVersion = groupSearchVersions([
      { title: expectedTitle || '', sourceUrl, coverUrl: '', summary: '', sourceContext: context },
      { title: preview.title, sourceUrl, coverUrl: '', summary: '', sourceContext: context },
    ]).length === 1
    if (titleKey(expectedTitle) && preview.title.trim() && !sameWorkVersion) {
      sourcePreview.value = { ...sourcePreview.value!, episodes: [] }
      sourceError.value = '来源中的作品不对，请选择其他来源。'
      return false
    }
    const known = sourceHits.value.find((hit) => hit.sourceUrl === preview.sourceUrl && sameHistorySource(hit.sourceContext, preview.sourceContext))
      ?? items.value.find((item) => item.url === preview.sourceUrl && sameHistorySource(item.sourceContext, preview.sourceContext))
    sourcePreview.value = {
      ...preview,
      // 原生不再因为页面没有标题就整次失败（VQ-60）：标题缺省时用搜索命中或已保存作品的标题补上，
      // 不能把进入详情前的占位标题覆盖成空串。
      title: preview.title || seed?.title || previous?.title || '',
      coverUrl: known?.coverUrl || seed?.coverUrl || previous?.coverUrl || preview.coverUrl || '',
      summary: preview.summary || seed?.summary || previous?.summary || known?.summary || '',
    }
    const repositoryKey = `${sourcePreview.value.sourceContext?.sourceIndex ?? ''}\u0000${sourceUrl}`
    if (usingSubscription.value && repositoryHits.value.some(hit => sourceHitKey(hit) === repositoryKey)) {
      repositoryHits.value = repositoryHits.value.map(hit => sourceHitKey(hit) === repositoryKey ? { ...hit, coverUrl: hit.coverUrl || sourcePreview.value?.coverUrl || preview.coverUrl } : hit)
    }
    if (previousSection !== 'detail') detailReturn.value = previousSection
    section.value = 'detail'
    // 详情页一解析完就预热该作品几条线路的媒体主机：点选集时不必再等一次建连（VQ-49）。
    warmPreviewHosts(sourcePreview.value)
    return true
  }
  catch { if (request === previewRequest) sourceError.value = '作品加载失败，请重试或换个来源。'; return false }
  finally { if (request === previewRequest) sourceLoading.value = false }
}

/** 依次尝试备用来源，成功播放返回 true；全部失败返回 false 交给调用方显示错误。 */
async function tryNextSource(): Promise<boolean> {
  const expected = sourcePreview.value
  const seed = expected ? { title: expected.title, coverUrl: expected.coverUrl, summary: expected.summary, sourceContext: expected.sourceContext } : undefined
  while (sourceQueue.value.length) {
    const next = sourceQueue.value[0]!
    sourceQueue.value = sourceQueue.value.slice(1)
    sourceTried.value = [...sourceTried.value, next]
    const ok = await previewSource(next, false, seed)
    const preview = sourcePreview.value
    if (!ok || !preview || !preview.episodes.length) continue
    lineNotice.value = '主来源不可用，已切换到备用来源'
    const first = pickPlayableEpisode(preview.episodes)
    if (!first) continue
    await playSourceEpisode(first)
    return true
  }
  return false
}

async function playSaved(item: SavedMedia) {
  await watchSearchResult(item.url, { ...item, sourceContext: item.sourceContext ?? savedSourceContext(`saved:${item.id}`) ?? { content: '' } })
}

async function watchSearchResult(sourceUrl: string, saved?: SavedMedia, candidates: string[] = [], chosenHit?: SourceHit) {
  const hit = chosenHit ?? sourceHits.value.find(candidate => candidate.sourceUrl === sourceUrl)
  const context = saved ? saved.sourceContext ?? { content: sourceContent(saved.url) } : hit?.sourceContext
  const subscription = context?.content ?? sourceContent(sourceUrl)
  if (selected.value) await closePlayer()
  watchPage.value = true
  lineFallbackTried.clear()
  lineNotice.value = ''
  const ordered = [...new Set([sourceUrl, ...candidates])]
  sourceTried.value = [sourceUrl]
  sourceQueue.value = ordered.slice(1)
  if (saved && mediaType(saved.url)) {
    detailReturn.value = section.value
    sourcePreview.value = { title: saved.title, sourceUrl: saved.url, coverUrl: savedCover(saved), summary: saved.summary || '',
      episodes: [{ id: 'direct', title: '视频', sourceUrl: saved.url, playbackUrl: saved.url, mimeType: '', lineId: 'main' }] }
    section.value = 'detail'
    await watch(saved)
    return
  }
  // 先切到观看工作区展示播放器占位，来源解析在后台继续，避免点击后长时间停留在搜索页。
  detailReturn.value = section.value
  section.value = 'detail'
  const seed = {
    title: saved?.title || hit?.title || '',
    coverUrl: saved?.coverUrl || hit?.coverUrl || '',
    summary: saved?.summary || hit?.summary || '',
    sourceContext: context,
  }
  // 随包已有线路：外站线路不可用或超过起播预算时静默接管，用户不必等来源站超时。
  // 当前订阅的同一部作品若没有可播线路，也可用随包已有线路接管；作品身份仍由标题/来源守卫确认。
  const work = bundledWorkFor(seed.title, sourceUrl)
  const bundled = bundledEpisodes(work)
  bundledPool.value = bundled
  bundledWork.value = work ?? null
  const previewTask = previewSource(sourceUrl, false, seed)
  if (!work || !bundled.length) {
    const ok = await previewTask
    const preview = sourcePreview.value
    // 原生来源可能将详情地址规范化为另一域名、补齐或移除末尾斜杠；
    // previewRequest 已经负责淘汰旧请求，这里不能再用原始字符串阻断自动播放。
    if (!preview || section.value !== 'detail') return
    // 主来源不可用（整站不可达或没有可选条目）时自动尝试随包目录里的备用来源。
    if ((!ok || !preview.episodes.length) && sourceQueue.value.length && await tryNextSource()) return
    // 优先使用已经解析出的媒体地址；没有直链时才交给 playSourceEpisode 读取选集页。
    // 不能把任意网页地址当作媒体地址交给 video，否则片库会被误报为“不可播放”。
    const first = pickPlayableEpisode(preview.episodes)
    if (first) await playSourceEpisode(first)
    return
  }
  const sourceReady = await Promise.race([
    previewTask.then(() => Boolean(sourcePreview.value?.episodes.length)),
    new Promise<boolean>((resolve) => { window.setTimeout(() => resolve(false), BUNDLED_TAKEOVER_BUDGET_MS) }),
  ])
  const preview = sourcePreview.value
  if (!preview || section.value !== 'detail') return
  if (sourceReady) {
    const first = pickPlayableEpisode(preview.episodes)
    if (first) { await playSourceEpisode(first); return }
  }
  // 外站没有在预算内给出可播条目：丢弃迟到的外站预览，静默改用已有线路起播。
  previewRequest++
  sourceLoading.value = false
  sourceError.value = ''
  await playBundledEpisode(work)
}

async function browseBundledItem(item: CatalogSnapshotItem) {
  if (usingSubscription.value) {
    const scope = activeSubscriptionScope()
    const request = ++previewRequest
    sourceLoading.value = true
    sourceError.value = ''
    detailReturn.value = 'home'
    watchPage.value = false
    sourcePreview.value = { title: item.title, sourceUrl: item.sourceUrl, coverUrl: item.coverUrl, summary: '', episodes: [], sourceContext: { content: activeSubscriptionContent() } }
    section.value = 'detail'
    const fallback = async (expectedRequest = request) => {
      if (expectedRequest !== previewRequest || activeSubscriptionScope() !== scope) return
      if (bundledEpisodes(item).length) await playBundledEpisode(item)
      else sourceError.value = '当前来源暂不可用，请检查网络后重试。'
    }
    try {
      if (!activeSubscriptionContent()) { await fallback(); return }
      const result = await withNativeTimeout(androidSource.search({ keyword: item.title }), 13_000)
      if (request !== previewRequest || activeSubscriptionScope() !== scope) return
      const hit = result.hits.find(candidate => candidate.kind !== 'resource' && titleKey(candidate.title) === titleKey(item.title))
      if (!hit) { await fallback(); return }
      const previewAttempt = previewRequest + 1
      const ready = await previewSource(hit.sourceUrl, false, { ...hit, coverUrl: hit.coverUrl || item.coverUrl })
      if (!ready || !sourcePreview.value?.episodes.length) await fallback(previewAttempt)
    } catch { await fallback() }
    finally { if (request === previewRequest) sourceLoading.value = false }
    return
  }
  // 随包推荐作品自带已有线路：点“查看”直接进入带播放器的详情，不再等待来源页。
  const pool = bundledEpisodes(item)
  if (pool.length) { await playBundledEpisode(item); return }
  await watchSearchResult(item.sourceUrl, undefined, item.sourceUrls ?? [])
}

async function switchMovieSource() {
  const target = alternateMovieSource.value
  if (!target) return
  if (selected.value) await closePlayer()
  watchPage.value = true
  const previous = sourcePreview.value
  await previewSource(target, false, previous ? { title: previous.title, coverUrl: previous.coverUrl, summary: previous.summary } : undefined)
  // A separate source can list different edits; let the user choose an episode explicitly.
}

async function togglePreviewFavorite() {
  const item = previewSaved.value
  if (item) await toggleFavorite(item)
}

/**
 * 保存/收藏当前来源：按钮在写入期间禁用并改文案，避免连点两次真的存两条（实测连点两次 `save` 调用 2 次，
 * 会在本机片库留下两条同地址作品）。
 */
const previewSaving = ref(false)
async function savePreview() {
  const preview = sourcePreview.value
  if (!preview || previewSaving.value) return
  previewSaving.value = true
  try { const result = await androidCatalog.save({ title: preview.title, url: preview.sourceUrl, coverUrl: safeCoverUrl(preview.coverUrl), summary: preview.summary, sourceContext: preview.sourceContext }); if (!result.item.sourceContext && !result.item.sourceKey) persistSourceContext(`saved:${result.item.id}`, preview.sourceContext); await reload(); error.value = ''; filter.value = 'all'; keyword.value = ''; section.value = 'library' }
  catch { sourceError.value = '保存失败，请重试。' }
  finally { previewSaving.value = false }
}

async function collectPreview() {
  const preview = sourcePreview.value
  if (!preview || previewSaving.value) return
  previewSaving.value = true
  try {
    const result = await androidCatalog.save({ title: preview.title, url: preview.sourceUrl, coverUrl: safeCoverUrl(preview.coverUrl), summary: preview.summary, favorite: true, sourceContext: preview.sourceContext })
    if (!result.item.sourceContext && !result.item.sourceKey) persistSourceContext(`saved:${result.item.id}`, preview.sourceContext)
    await reload()
    sourceError.value = ''
  } catch { sourceError.value = '收藏失败，请重试。' }
  finally { previewSaving.value = false }
}

/** 详情页线路分组名（如“加速云”）与播放页 temLineList 的线路编号不是同一套标识，
 *  来源地址末段编号才是两者共享的稳定身份。 */
function episodeLineIdentity(url: string): string {
  try {
    const segments = new URL(url).pathname.replace(/\/$/, '').split('/')
    const last = segments[segments.length - 1] ?? ''
    return segments[1] === 'v' ? last.split('-').pop() ?? '' : last
  } catch { return '' }
}

/** 解析所选条目对应的可播放线路：先精确线路，再用来源自身编号和条目标题兜底。
 *  历史续播（required=true）只认原始线路，不静默换到其他配音或字幕。 */
function resolvePlayableLine(playable: SourceEpisode[], episode: SourceEpisode, requestedLine: string, required: boolean): SourceEpisode | undefined {
  const byLine = (value: string) => playable.find((candidate) => (candidate.lineId || 'main') === value)
  if (required) return byLine(requestedLine)
  if (requestedLine) {
    const exact = byLine(requestedLine)
    if (exact) return exact
  }
  const identity = episodeLineIdentity(episode.sourceUrl || episode.id)
  const byIdentity = identity ? byLine(identity) : undefined
  if (byIdentity) return byIdentity
  const byTitle = episode.title ? playable.find((candidate) => candidate.title === episode.title) : undefined
  if (byTitle) return byTitle
  const main = byLine('main')
  if (main) return main
  if (playable.length === 1 && (!playable[0].sourceUrl || playable[0].sourceUrl === episode.sourceUrl)) return playable[0]
  return undefined
}

async function playSourceEpisode(episode: SourceEpisode, requiredLineId?: string) {
  const preview = sourcePreview.value
  if (!preview) return
  ++previewRequest
  const request = ++episodeRequest
  sourceError.value = ''
  lineNotice.value = ''
  // 解析失败或没有受支持直链时，按顺序再试下一条候选（每条只试一次），不把用户留在错误上。
  const retryNextEpisode = async (message: string) => {
    const candidate = nextUntriedEpisode(episode)
    if (!candidate) {
      if (sourceQueue.value.length && await tryNextSource()) return
      sourceError.value = message
      return
    }
    lineFallbackTried.add(fallbackKey(candidate))
    lineNotice.value = `已自动尝试同集其他线路：${displayText(candidate.title)}`
    await playSourceEpisode(candidate)
  }
  if (!episode.playbackUrl && episode.sourceUrl) {
    sourceLoading.value = true
    try {
      const direct = await androidSource.resolve(episode.sourceUrl, episode.sourceContext ?? preview.sourceContext)
      const options = direct ? [{ ...episode, playbackUrl: direct.playbackUrl, mimeType: direct.mimeType, requestHeaders: direct.requestHeaders }] : await episodeOptions(episode.sourceUrl, episode.sourceContext ?? preview.sourceContext)
      if (request !== episodeRequest || preview !== sourcePreview.value) return
      const requestedLine = requiredLineId || (episode.lineId && episode.lineId !== 'main' ? episode.lineId : '')
      const playable = options.filter((candidate) => episodeMediaType(candidate))
      const resolved = resolvePlayableLine(playable, episode, requestedLine, Boolean(requiredLineId))
      if (!resolved) {
        // 历史续播只认原线路；首次观看也只能尝试同集其他线路。
        if (requiredLineId) { sourceError.value = '原线路暂不可用，请手动换线。历史记录仍保留。'; return }
        await retryNextEpisode(requestedLine ? '这条线路暂不可用，请手动换线。' : '这集暂时无法播放，请换线或稍后重试。')
        return
      }
      // 只有真正匹配到所选线路时才沿用分组名；否则保存来源自身编号，历史续播才能命中同一条。
      const lineId = requestedLine && (resolved.lineId || 'main') === requestedLine ? requestedLine : resolved.lineId || 'main'
      episode = { ...resolved, id: episode.id, title: episode.title, lineId }
      // 后续原生启动和同集重试必须沿用这次解析的防盗链字段。
      if (episode.requestHeaders) preview.episodes = preview.episodes.map(candidate =>
        candidate.id === episode.id && (candidate.lineId || 'main') === lineId ? { ...candidate, requestHeaders: episode.requestHeaders } : candidate)
    } catch (failure) {
      if (request !== episodeRequest) return
      if ((episode.sourceContext ?? preview.sourceContext)?.content ?? sourceContent(episode.sourceUrl)) {
        if (!requiredLineId && /未找到静态媒体直链|没有可播放选集/.test(failure instanceof Error ? failure.message : String(failure))) {
          await retryNextEpisode('这个版本暂未取得播放地址，请换线或稍后重试。')
          return
        }
        sourceError.value = '这条线路暂不可用，请换线或重试。'
        return
      }
      if (!requiredLineId) { await retryNextEpisode('该集来源页暂不可用，请稍后重试。'); return }
      sourceError.value = '原线路暂不可用，请手动换线。历史记录仍保留。'
      return
    }
    finally { if (request === episodeRequest) sourceLoading.value = false }
  }
  if (request !== episodeRequest || preview !== sourcePreview.value) return
  if (requiredLineId && (episode.lineId || 'main') !== requiredLineId) { sourceError.value = '原线路暂不可用，请手动换线。历史记录仍保留。'; return }
  const episodeType = episodeMediaType(episode)
  if (!episodeType) {
    if (!requiredLineId) { await retryNextEpisode('这集暂时无法播放，请换线或刷新选集。'); return }
    sourceError.value = '原线路暂不可用，请手动换线。历史记录仍保留。'
    return
  }
  await watch({ id: -2, title: preview.title, url: preview.sourceUrl, coverUrl: preview.coverUrl, favorite: false, updatedAt: Date.now(), sourceContext: preview.sourceContext },
    episode.playbackUrl, episode.id, episode.title, episode.lineId || 'main', true, episodeType)
  scheduleAdjacentWarm(episode, preview)
}

async function closePlayer() {
  ++episodeRequest
  sourceLoading.value = false
  if (document.fullscreenElement === playerStage.value) void document.exitFullscreen().catch(() => {})
  stageFullscreen.value = false
  nativeFullscreenActive = false
  setNativeLandscape(false)
  setNativeImmersive(false)
  setNativeKeepAwake(false)
  // 退出观看页面即保存：disposePlayer 在清空 src 之前落一次进度。
  // 刷新历史列表不再阻塞关闭动作（VQ-62）：写入已经排在 progressQueue 上，而读取侧
  // reloadHistory 自己会等在途写入落库（VQ-55 的原意由此保留，退出后马上点进历史仍是新数据）；
  // 这里 await 的代价是「换作品/换集前先关播放器」的三处调用（playBundledEpisode 等）
  // 每次都要多等一次原生写入 + 一次列表读取，点下一集因此先卡一个往返。
  disposePlayer()
  selected.value = null
  playerError.value = ''
  void reloadHistory()
}

function onVisibilityChange() {
  if (document.hidden && video.value) {
    // 回到前台不自动起播（系统与浏览器策略下并不可靠），但必须留下可点的恢复入口（VQ-61）：
    // 此前只 pause+落盘，用户回来看到定格画面，没有任何提示。
    backgroundPaused.value = Boolean(selected.value) && !playbackEnded.value
    video.value.pause()
    void persistProgress()
    return
  }
  if (!document.hidden && video.value?.paused && selected.value && !playbackEnded.value) {
    // 回到前台如果画面仍是暂停的，恢复入口必须还在（VQ-62）：loadeddata／play 这些回调
    // 都有机会把 backgroundPaused 清掉，一旦清了，用户看到的就是定格画面 + 没有任何提示。
    backgroundPaused.value = true
  }
}
/** 从后台恢复：用户点提示里的按钮才继续播放。 */
function resumeFromBackground() {
  backgroundPaused.value = false
  const element = video.value
  if (!element) return
  setNativeKeepAwake(true)
  void element.play().catch(() => { backgroundPaused.value = true })
}

/** 一次性提示：同一条文案只播一次，几秒后自动收回，不占用全局错误条。 */
function notifyOnce(message: string) {
  if (!message || shownNotices.has(message)) return
  shownNotices.add(message)
  notice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = ''; noticeTimer = null }, 6000)
}

/**
 * 设置落盘：先改本地再写原生。
 *
 * 原来等 `setSettings` 返回后才替换 `settings.value`，而主题与播放速度都是**直接由它渲染**的，
 * 于是界面的变化要等一次原生往返（实测原生写入 180ms 时，顶栏主题切换要 198ms 才变色）。
 * 现在先乐观更新，写入失败再回滚；并用请求序号避免并发写入时旧响应覆盖新状态。
 */
let settingsRequest = 0
async function updateSettings(update: Partial<AndroidSettings>) {
  const request = ++settingsRequest
  const previous = settings.value
  settings.value = { ...previous, ...update }
  try {
    const saved = (await androidCatalog.setSettings({ settings: update })).settings
    if (request === settingsRequest) settings.value = saved
  } catch {
    if (request !== settingsRequest) return
    settings.value = previous
    notifyOnce('设置保存失败，请重试。')
  }
}
function setPlaybackRate(value: number) {
  if (PLAYBACK_RATES.some(rate => rate === value)) void updateSettings({ playbackRate: value })
}
async function playDownloaded(item: { url: string; nativeUrl?: string; title: string; id?: string; position?: number; duration?: number }) {
  if (selected.value) await closePlayer()
  downloadedPlaybackUrl = item.url
  downloadedNativeUrl = item.nativeUrl || ''
  downloadedPlaybackId = item.id || ''
  offlineResumePosition = item.duration && item.position && item.position < item.duration - 5 ? item.position : 0
  ++previewRequest
  sourcePreview.value = null
  sourceError.value = ''
  detailReturn.value = 'settings'
  section.value = 'detail'
  watchPage.value = true
  const saved: SavedMedia = { id: -Date.now(), title: item.title, url: item.url, favorite: false, updatedAt: Date.now() }
  await watch(saved, item.url, 'downloaded', item.title, 'local', true, 'mp4')
}
async function downloadCurrent() {
  if (!canDownloadCurrent.value || downloadBusy.value) return
  downloadBusy.value = true
  try {
    await androidDownloads.enqueue(activePlaybackUrl.value, `${selected.value?.title || '视频'} ${activeEpisodeTitle.value}`.slice(0, 200))
    notifyOnce('已加入下载队列。')
  } catch (failure) { notifyOnce(failure instanceof Error ? failure.message : '下载添加失败，请重试。') }
  finally { downloadBusy.value = false }
}
async function restorePersonalViews() {
  await Promise.all([reload(), reloadHistory(), reloadSettings()])
}
async function reloadSettings() {
  const request = ++settingsRequest
  try {
    const loaded = (await withNativeTimeout(androidCatalog.getSettings(), 8_000)).settings
    if (request !== settingsRequest) return
    const restoredQuality = restoreQualityProfile(loaded.qualityProfile)
    const restoredFrame = restoreFrameTarget(loaded.frameTarget)
    const restoredVolume = typeof loaded.volume === 'number' && Number.isFinite(loaded.volume) && loaded.volume >= 0 && loaded.volume <= 1 ? loaded.volume : 1
    qualityProfile.value = restoredQuality
    frameTarget.value = restoredFrame
    playbackVolume.value = restoredVolume
    settings.value = { ...loaded, theme: loaded.theme ?? 'system', autoPlay: loaded.autoPlay ?? false,
      playbackRate: loaded.playbackRate ?? 1, qualityProfile: restoredQuality, frameTarget: frameTargetSetting(restoredFrame), volume: restoredVolume }
  } catch { if (request === settingsRequest) fail('设置暂时无法读取。') }
}
watchValue(() => settings.value.playbackRate, rate => { if (video.value) video.value.playbackRate = rate })

/**
 * 清除观看历史：用应用内二次确认替代 `window.confirm`。
 *
 * 原生模态对话框是 WebView 自己画的：样式与应用无关、会挡住界面并冻结页面脚本，
 * 在「设置 → 立即生效」这套交互里显得格格不入。改成同一颗按钮的两步确认：
 * 第一次点变成「再点一次确认清除」，3 秒不点自动复位；确认期间按钮禁用，避免连点重复写入。
 */
const clearArmed = ref(false)
const clearRunning = ref(false)
let clearArmTimer: number | null = null
function disarmClearHistory() {
  clearArmed.value = false
  if (clearArmTimer !== null) { window.clearTimeout(clearArmTimer); clearArmTimer = null }
}
async function clearHistory() {
  if (clearRunning.value) return
  if (!clearArmed.value) {
    clearArmed.value = true
    if (clearArmTimer !== null) window.clearTimeout(clearArmTimer)
    clearArmTimer = window.setTimeout(() => { clearArmed.value = false; clearArmTimer = null }, 3000)
    return
  }
  disarmClearHistory()
  clearRunning.value = true
  try { await androidCatalog.clearHistory(); clearHistorySourceContexts(); await reloadHistory() }
  catch { fail('清除失败，请重试。历史记录仍保留。') }
  finally { clearRunning.value = false }
}

/** 统一的错误出口：只有带重试动作的错误才渲染「重试读取」。 */
/**
 * 清理媒体缓存（VQ-61）：分片缓存最多 64MB，且此前没有任何清理入口
 * （`clearMediaCache` 在桥接里声明了却从未被调用）。这里清原生缓存目录 + 内存里的分片表。
 */
const cacheClearing = ref(false)
const coverCacheStatus = ref('')
const coverCacheClearing = ref(false)
async function refreshCoverCacheStatus() {
  const stats = await getCoverCacheStats()
  coverCacheStatus.value = stats.available ? `${stats.entries} 张 · ${(stats.bytes / 1024 / 1024).toFixed(1)} MB` : '当前环境使用系统图片缓存'
}
async function clearCoverImages() {
  if (coverCacheClearing.value) return
  coverCacheClearing.value = true
  try {
    const cleared = await clearCoverCache()
    await refreshCoverCacheStatus()
    notifyOnce(cleared ? '封面缓存已清理，收藏和历史不受影响。' : '当前环境没有可清理的独立封面缓存。')
  } finally { coverCacheClearing.value = false }
}
watchValue(section, value => { if (value !== 'search') searchVersionChecks.cancel(); if (value !== 'library') repositorySortOpen.value = false; if (value === 'library') void loadRepository(); if (value === 'settings') void refreshCoverCacheStatus(); if (value === 'history') void recoverHistoryCovers() })
async function clearMediaCache() {
  if (cacheClearing.value) return
  cacheClearing.value = true
  try {
    await withNativeTimeout(androidCatalog.clearMediaCache(), 8_000)
    fragmentCacheHandle?.clear()
    fragmentCacheHandle = null
    notifyOnce('媒体缓存已清理。')
  } catch {
    notifyOnce('媒体缓存暂时无法清理，请稍后重试。')
  } finally {
    cacheClearing.value = false
  }
}

function fail(message: string, retry: (() => void) | null = null) {
  error.value = message
  retryAction.value = retry
}

function clearError() {
  error.value = ''
  retryAction.value = null
}

async function reload() {
  catalogLoading.value = true
  try {
    // 同上：片库读取有上限，超时走失败重试而不是一直停在「正在读取」（VQ-60）。
    let raw = (await withNativeTimeout(androidCatalog.list(), 8_000)).items
    const migration = await withNativeTimeout(migrateLegacySourceBindings(raw, []), 8_000)
    if (migration.migrated) raw = (await withNativeTimeout(androidCatalog.list(), 8_000)).items
    items.value = raw.map(item => ({ ...item, sourceContext: item.sourceContext ?? savedSourceContext(`saved:${item.id}`) ?? { content: '' } }))
    clearError()
  } catch {
    fail('片库加载失败，请重试。已有作品仍保留。', () => { void reload() })
  } finally {
    catalogLoading.value = false
  }
}

/**
 * 收藏：先翻转星标再写原生，失败回滚；同一部作品的写入在途时忽略再次点击。
 *
 * 之前要等 `setFavorite` 返回才更新列表（实测原生写入 180ms 时反馈要 187ms 才出现），
 * 而且连点两次会真的发两次原生写入（实测 2 次）——第二次拿到的还是旧状态，用户看到的是「点了没动」。
 */
const favoritePending = new Set<number>()
async function toggleFavorite(item: SavedMedia) {
  if (favoritePending.has(item.id)) return
  favoritePending.add(item.id)
  const wanted = !item.favorite
  const applyFavorite = (favorite: boolean) => {
    items.value = items.value.map((saved) => saved.id === item.id ? { ...saved, favorite } : saved)
  }
  applyFavorite(wanted)
  try {
    const updated = (await androidCatalog.setFavorite({ id: item.id, favorite: wanted })).item
    if (updated) applyFavorite(updated.favorite)
  } catch {
    applyFavorite(item.favorite)
    fail('收藏保存失败，请重试。')
  } finally {
    favoritePending.delete(item.id)
  }
}

/**
 * 按下反馈：`pointerdown` 在按下当帧一定到达（合成触摸实测 `pointerdown`／`touchstart` 都准时到达），
 * 而 WebView 何时给元素加 `:active` 取决于手势判定（可滚动页面里要等确认不是滑动），因此按下反馈不能只靠 `:active`。
 * 这里在按下时给命中的按钮挂 `is-pressed`，抬起、取消、开始滑动或 1.2 秒兜底时清掉；样式与 `:active` 共用同一条规则。
 */
let pressedTimer: number | null = null
// 记住当前按下的那一颗，滑动时不必每帧去查 DOM（`touchmove` 会持续调用复位）。
let pressedButton: HTMLElement | null = null
function clearPressed() {
  if (pressedTimer !== null) { window.clearTimeout(pressedTimer); pressedTimer = null }
  pressedButton?.classList.remove('is-pressed')
  pressedButton = null
}
function markPressed(event: Event) {
  const button = (event.target as Element | null)?.closest?.('button') as HTMLButtonElement | null
  if (!button || button.disabled) return
  clearPressed()
  pressedButton = button
  button.classList.add('is-pressed')
  // 兜底：手指移出窗口或事件被系统吞掉时自己复位，避免按钮一直停在按下态。
  pressedTimer = window.setTimeout(clearPressed, 1200)
}

onMounted(() => {
  // 与原生 v9 迁移同步清掉旧历史的来源快照；一次成功后不影响此后新产生的观看记录。
  try {
    const key = 'sanye:android-history-reset:6.2'
    if (localStorage.getItem(key) !== 'done') { clearHistorySourceContexts(); localStorage.setItem(key, 'done') }
  } catch { /* 本地存储不可用时，数据库迁移仍负责清空观看历史。 */ }
  if (downloadsAvailable()) void androidDownloads.resume().catch(() => { notifyOnce('下载队列恢复失败，请在离线下载中重试。') })
  const subscription = currentSubscription.value
  if (subscription && subscriptionNeedsRefresh(subscription)) void refreshSubscription(subscription.url).catch(() => { /* 离线时继续使用已选缓存 */ })
  void reload()
  void reloadHistory()
  // 设置读取同样是设置页能否离开「读取中」的前提（VQ-60）。
  void reloadSettings()
  prewarmPlaybackModules()
  void (async () => {
    try { const info = await App.getInfo(); appVersion.value = `${info.version}（${info.build}）` }
    catch { appVersion.value = '未知' }
  })()
  document.addEventListener('visibilitychange', onVisibilityChange)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  // 旋转与窗口尺寸变化同样会重建呈现表面：一并请求判定静默窗口（VQ-51）。
  window.addEventListener('resize', deferEnhancementJudgementOnce)
  window.addEventListener('orientationchange', deferEnhancementJudgementOnce)
  lightSchemeQuery?.addEventListener('change', onSystemSchemeChange)
  void App.addListener('backButton', () => {
    if (sourcePicker.value?.open) { dismissSourcePicker(); return }
    if (document.fullscreenElement) { void document.exitFullscreen(); return }
    if (chromeMenu.value) { chromeMenu.value = null; scheduleChromeHide(); return }
    if (stageFullscreen.value) { stageFullscreen.value = false; setNativeLandscape(false); setNativeImmersive(false); return }
    if (selected.value) { void closePlayer(); return }
    if (section.value === 'detail') { section.value = detailReturn.value; return }
    if (section.value !== 'home') { section.value = 'home'; return }
    void App.exitApp()
  }).then((listener) => {
    // 卸载后才落地就直接摘掉，不留悬挂监听（VQ-62）。
    if (unmounted) { void listener.remove(); return }
    backListener = listener
  }).catch(() => { /* 浏览器样例不提供安卓返回键。 */ })
})
onBeforeUnmount(() => {
  searchVersionChecks.cancel()
  const element = video.value
  unmounted = true
  for (const entry of manifestPrefetches.values()) entry.controller.abort()
  manifestPrefetches.clear()
  // 组件卸载时把在途计时器全部收掉（VQ-61）：此前只有部分计时器被清，退出播放页后
  // 提示、按住态、搜索防抖等回调仍会跑一次，甚至会碰到已经销毁的播放器状态。
  const timers: Array<ReturnType<typeof setTimeout> | number | null | undefined> = [
    noticeTimer, gestureHintTimer, pressedTimer, clearArmTimer, gestureTapTimer, searchTimer,
    chromeTimer, stallTimer, playbackStallTimer, previewTimer, qualityNoticeTimer, volumeSaveTimer,
  ]
  for (const timer of timers) if (timer !== undefined && timer !== null) window.clearTimeout(timer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('resize', deferEnhancementJudgementOnce)
  window.removeEventListener('orientationchange', deferEnhancementJudgementOnce)
  lightSchemeQuery?.removeEventListener('change', onSystemSchemeChange)
  setNativeLandscape(false)
  setNativeImmersive(false)
  setNativeKeepAwake(false)
  void persistProgress()
  disposePlayer()
  if (element && enhancementAudioUsed) void import('../../video/realtimeInterpolation').then(({ releaseInterpolationAudio }) => releaseInterpolationAudio(element))
  void backListener?.remove()
})
</script>

<template>
  <main class="android-app" :data-theme="settings.theme" @pointerdown="markPressed" @pointerup="clearPressed" @pointercancel="clearPressed" @touchmove.passive="clearPressed">
    <header class="android-topbar">
      <div class="android-brand"><strong>三叶动漫</strong></div>
      <button class="android-top-search" type="button" aria-label="搜索作品与来源" :aria-current="section === 'search' || (section === 'detail' && detailReturn === 'search') ? 'page' : undefined" @click="openSearchInput"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="search"><path v-for="shape in ICONS.search ?? []" :key="shape" :d="shape" /></svg><span class="android-top-search-label">搜索作品或来源</span></button>
      <button class="android-theme-toggle" type="button" :aria-label="appearanceLight ? '切换深色模式' : '切换浅色模式'" @click="updateSettings({ theme: appearanceLight ? 'dark' : 'light' })"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="appearanceLight ? 'moon' : 'sun'"><path v-for="shape in (appearanceLight ? ICONS.moon : ICONS.sun) ?? []" :key="shape" :d="shape" /></svg></button>
    </header>

    <div v-if="section === 'home' || section === 'search' || section === 'library'" class="android-source-context" aria-label="当前来源">
      <div><strong>{{ sourceLabel }}</strong><span v-if="currentSourceStatus" role="status">{{ currentSourceStatus }}</span></div>
      <button type="button" aria-label="切换来源订阅" @click="showSourcePicker">切换</button>
    </div>

    <!-- 一次性提示：同一条文案一次运行只出现一次，几秒后自动收回。 -->
    <dialog ref="sourcePicker" class="android-source-sheet" aria-labelledby="source-sheet-title" @cancel="dismissSourcePicker" @click="($event.target === sourcePicker) && dismissSourcePicker()">
      <div class="android-sheet-heading"><h2 id="source-sheet-title">选择订阅</h2><button type="button" aria-label="关闭来源选择" @click="dismissSourcePicker">关闭</button></div>
      <button class="android-source-choice" type="button" :aria-pressed="!usingSubscription" @click="chooseSubscription('')"><strong>樱花动漫</strong><span>{{ !usingSubscription ? '已启用' : '选择' }}</span></button>
      <button v-for="item in availableSourceChoices" :key="`${item.url}:${item.sourceIndex}`" class="android-source-choice" type="button" :aria-pressed="subscriptionState.active === item.url && activeSubscriptionSourceIndex() === item.sourceIndex" @click="chooseSubscription(item.url, item.sourceIndex)"><strong>{{ item.name }} <em v-if="item.recommended" class="android-source-recommended">推荐</em></strong><span>{{ subscriptionState.active === item.url && activeSubscriptionSourceIndex() === item.sourceIndex ? '当前' : '' }}</span></button>
      <p v-if="pickerError" class="android-error" role="alert">{{ pickerError }}</p>
      <button class="android-secondary-button" type="button" @click="dismissSourcePicker(); personalPanel = 'subscriptions'; section = 'settings'">管理订阅</button>
    </dialog>
    <p v-if="notice" class="android-notice" role="status">{{ notice }}</p>

    <nav class="android-nav" aria-label="安卓功能导航">
      <button v-for="entry in ([['home', '首页'], ['library', '片库'], ['schedule', '排期'], ['history', '历史'], ['settings', '我的']] as const)"
        :key="entry[0]" type="button" :aria-current="section === entry[0] || (section === 'detail' && detailReturn === entry[0]) ? 'page' : undefined" @click="section = entry[0]"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path v-for="shape in NAV_ICONS[entry[0]]" :key="shape" :d="shape" /></svg></span><small>{{ entry[1] }}</small></button>
    </nav>

    <div v-if="section !== 'home'" class="android-page-heading"><button v-if="section === 'detail'" class="android-back" type="button" @click="section = detailReturn"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="back"><path v-for="shape in ICONS.back ?? []" :key="shape" :d="shape" /></svg> 返回{{ detailReturn === 'search' ? '搜索结果' : detailReturn === 'library' ? '片库' : '上一页' }}</button><h1>{{ section === 'search' ? '搜索作品' : section === 'detail' ? (watchPage ? '观看作品' : '作品详情') : section === 'library' ? '番剧仓库' : section === 'history' ? '继续观看' : section === 'schedule' ? '一周排期' : '我的空间' }}</h1></div>

    <div v-if="section === 'detail' && watchPage && !selected && !sourceError" class="android-watch-top android-watch-placeholder" role="status">
      <AndroidCover v-if="previewCover && !failedCovers.has(previewCover)" :src="previewCover" loading="eager" alt="" referrerpolicy="no-referrer" @error="coverFailed(previewCover)" />
      <div><strong>{{ displayText(sourcePreview?.title || '选择选集开始观看') }}</strong></div>
    </div>

    <section v-if="selected && !nativePlaybackActive" class="android-player" :class="watchPage && section === 'detail' ? 'android-player--inline' : 'android-player--overlay'" aria-label="视频播放">
      <div v-if="!watchPage || section !== 'detail'" class="android-section-title"><h2>{{ displayText(selected.title) }}</h2></div>
      <p v-if="lineNotice && !stageFullscreen" class="android-player-notice">{{ lineNotice }}</p>
      <div
        ref="playerStage"
        class="android-player-stage"
        :class="{ 'android-player-stage--expanded': stageFullscreen, 'android-player-stage--compact': !stageFullscreen }"
        aria-label="横屏播放器"
        @click="onPlayerSurfaceTap"
        @dblclick="togglePlayback"
        @pointerdown="beginSurfaceGesture"
        @pointermove="moveSurfaceGesture"
        @pointerup="endSurfaceGesture"
        @pointercancel="endSurfaceGesture"
        @dragstart.prevent
      >
        <div class="android-player-viewport">
        <AndroidCover v-if="showPoster" class="android-player-poster" :src="playerArtwork" loading="eager" alt="" referrerpolicy="no-referrer" @error="coverFailed(playerArtwork)" />
        <video ref="video" playsinline preload="metadata" @loadedmetadata="syncPlaybackDuration(); restorePosition()" @loadeddata="onFirstFrame()" @durationchange="syncPlaybackDuration" @progress="syncPlaybackDuration" @timeupdate="onTimeUpdate" @seeked="onSeekSettled" @play="playing = true" @playing="onPlayerPlay()" @canplay="syncPlaybackDuration()" @pause="playing = false; buffering = false; clearPlaybackStallWatchdog(); playbackObservation?.pause(); persistProgress()" @ended="onPlaybackEnded" @waiting="onVideoWaiting" @stalled="onVideoWaiting" @error="onVideoError('无法加载视频，请检查来源、格式或网络连接。')" />
        <div class="android-player-dim" :style="{ opacity: playerDim }" aria-hidden="true"></div>
        <div
          class="android-player-surface"
          aria-hidden="true"
          @click.stop="onPlayerSurfaceTap"
        ></div>
        <div v-if="playbackEnded" class="android-player-ended" role="status">
          <p>本集播放结束</p>
          <div>
            <button v-if="nextEpisode" type="button" @click.stop="playNextEpisode">{{ nextEpisodeLabel }}</button>
            <button type="button" class="android-player-ghost" @click.stop="restartPlayback">重播</button>
          </div>
        </div>
        <button v-else-if="!playing" type="button" class="android-player-big-play" aria-label="播放" @click.stop="onBigPlayTap"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="play"><path v-for="shape in ICONS.play ?? []" :key="shape" :d="shape" /></svg></button>
        <div v-if="stageAlert" class="android-player-alert" :class="{ 'android-player-alert--calm': !stageAlert.urgent }" role="alert">
          <svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="stageAlert.icon"><path v-for="shape in ICONS[stageAlert.icon] ?? []" :key="shape" :d="shape" /></svg>
          <p>{{ stageAlert.text }}</p>
          <button v-if="stageAlert.action === 'switch'" type="button" @click.stop="switchToFallbackLine()">切换线路</button>
          <button v-else-if="stageAlert.action === 'retry'" type="button" @click.stop="void retryCurrentLine()">重试当前线路</button>
          <button v-else-if="stageAlert.action === 'resume'" type="button" @click.stop="resumeFromBackground()">继续播放</button>
        </div>
        <div v-if="gestureHint" class="android-player-hud" role="status">
          <svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="gestureHint.kind === 'brightness' ? 'brightness' : 'volume'"><path v-for="shape in (gestureHint.kind === 'brightness' ? ICONS.brightness : ICONS.volume) ?? []" :key="shape" :d="shape" /></svg>
          <strong>{{ gestureHint.percent }}%</strong>
        </div>
        <p v-if="qualityNotice" class="android-player-adapt" role="status">{{ qualityNotice }}</p>
        </div>
        <div ref="controlsBar" class="android-player-controls" :class="{ 'is-hidden': !chromeVisible }" :inert="!chromeVisible" aria-label="播放控制" @click.stop="onPlayerSurfaceTap">
          <div
            ref="seekBar"
            class="android-player-seek"
            :class="{ 'is-dragging': seekDragging, 'is-disabled': !seekReady }"
            role="slider"
            tabindex="0"
            aria-label="播放进度"
            :aria-valuemin="0"
            :aria-valuemax="Math.round(seekMax)"
            :aria-valuenow="Math.round(seekPositionSeconds)"
            :aria-valuetext="`${formatPlaybackTime(seekPositionSeconds)} / ${formatPlaybackTime(playbackDuration)}`"
            :aria-disabled="!seekReady"
            :title="`${formatPlaybackTime(seekPositionSeconds)} / ${formatPlaybackTime(playbackDuration)}`"
            @pointerdown="beginSeek"
            @pointermove="moveSeek"
            @pointerup="commitSeek"
            @pointercancel="cancelSeek"
            @lostpointercapture="commitSeek"
            @keydown="onSeekKeydown"
            @click.stop
          >
            <span class="android-player-seek-track" aria-hidden="true">
              <span class="android-player-seek-fill" :style="{ width: `${seekPercent}%` }"></span>
              <span class="android-player-seek-thumb" :style="{ left: `${seekPercent}%` }"></span>
            </span>
          </div>
          <div class="android-player-controls-row">
            <button type="button" class="android-player-play" :aria-label="playing ? '暂停播放' : '开始播放'" @click.stop="togglePlayback"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="playing ? 'pause' : 'play'"><path v-for="shape in (playing ? ICONS.pause : ICONS.play) ?? []" :key="shape" :d="shape" /></svg></button>
            <span class="android-player-time">{{ formatPlaybackTime(seekPositionSeconds) }}<em>/ {{ formatPlaybackTime(playbackDuration) }}</em></span>
            <button v-if="nextEpisode" type="button" class="android-player-tool android-player-tool--text" :aria-label="nextEpisodeLabel" @click.stop="playNextEpisode">下一集</button>
            <span class="android-player-spacer" aria-hidden="true"></span>
            <button type="button" class="android-player-tool android-player-icon" aria-haspopup="dialog" aria-label="音量" :aria-expanded="chromeMenu === 'volume'" :aria-pressed="!!video?.muted" @click.stop="toggleChromeMenu('volume', $event)"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="video?.muted ? 'mute' : 'volume'"><path v-for="shape in (video?.muted ? ICONS.mute : ICONS.volume) ?? []" :key="shape" :d="shape" /></svg></button>
            <button type="button" class="android-player-tool android-player-tool--text" aria-haspopup="dialog" :aria-expanded="chromeMenu === 'episodes'" @click.stop="toggleChromeMenu('episodes', $event)">选集</button>
            <button type="button" class="android-player-tool android-player-tool--advanced" aria-haspopup="dialog" :aria-expanded="chromeMenu === 'quality'" @click.stop="toggleChromeMenu('quality', $event)">{{ effectiveQualityProfile !== 'off' ? ANIME4K_PROFILE_LABELS[effectiveQualityProfile] : chosenQuality < 0 ? '画质' : `${qualityLevels[chosenQuality]?.label.split(' · ')[0] || '画质'}${qualityPending ? '…' : ''}` }}</button>
            <button type="button" class="android-player-tool android-player-tool--advanced" aria-haspopup="dialog" :aria-expanded="chromeMenu === 'fps'" @click.stop="toggleChromeMenu('fps', $event)">{{ frameTarget !== 'off' ? frameTarget === 'auto' ? '自动帧率' : `${frameTarget} FPS` : chosenFps === 'auto' ? '帧率' : `${chosenFps} FPS${fpsPending ? '…' : ''}` }}</button>
            <button type="button" class="android-player-tool android-player-icon" :aria-label="stageFullscreen ? '退出横屏' : '横屏放大'" @click.stop="togglePlayerFullscreen"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="stageFullscreen ? 'shrink' : 'expand'"><path v-for="shape in (stageFullscreen ? ICONS.shrink : ICONS.expand) ?? []" :key="shape" :d="shape" /></svg></button>
          </div>
          <div v-if="chromeMenu" class="android-player-menu" role="dialog" aria-modal="false" :style="menuAnchorStyle" :aria-label="chromeMenu === 'quality' ? '画质选项' : chromeMenu === 'fps' ? '帧率选项' : chromeMenu === 'volume' ? '音量选项' : '选集选项'" @click.stop>
            <template v-if="chromeMenu === 'quality'">
              <div class="android-player-list-group">
                <button type="button" class="android-player-list-item" :aria-pressed="isQualityOptionActive('off')" @click="changeQualityProfile('off')">关闭</button>
                <button v-for="[profile, label] in qualityOptions" :key="profile" type="button" class="android-player-list-item" :aria-pressed="isQualityOptionActive(profile)" @click="changeQualityProfile(profile)">{{ label }}</button>
              </div>
              <div v-if="qualityLevels.length > 1" class="android-player-list-group">
                <button type="button" class="android-player-list-item" :aria-pressed="chosenQuality === -1" @click="changeQuality('-1')">自动</button>
                <button v-for="level in qualityLevels" :key="level.index" type="button" class="android-player-list-item" :aria-pressed="activeLevel === level.index" :title="level.label.split(' · ')[0]" @click="changeQuality(String(level.index))">{{ level.label.split(' · ')[0] }}</button>
              </div>
            </template>
            <template v-else-if="chromeMenu === 'fps'">
              <div class="android-player-list-group">
                <button type="button" class="android-player-list-item" :aria-pressed="isFrameOptionActive('off')" @click="changeFrameTarget('off')">原始</button>
                <button type="button" class="android-player-list-item" :aria-pressed="isFrameOptionActive('auto')" @click="changeFrameTarget('auto')">自动</button>
                <button v-for="option in frameRateOptions" :key="option.value" type="button" class="android-player-list-item"
                  :aria-pressed="isFrameOptionActive(option.value)" :title="option.label" @click="changeFrameTarget(option.value)">{{ option.value }}</button>
              </div>
              <div v-if="availableFps.length > 1" class="android-player-list-group">
                <button type="button" class="android-player-list-item" :aria-pressed="chosenFps === 'auto'" title="随片源" @click="changeFps('auto')">原帧</button>
                <button v-for="fps in availableFps" :key="fps" type="button" class="android-player-list-item" :aria-pressed="activeLevel >= 0 && qualityLevels[activeLevel]?.fps === fps" :title="`${fps} FPS`" @click="changeFps(String(fps))">{{ fps }}</button>
              </div>
            </template>
            <template v-else-if="chromeMenu === 'volume'">
              <div
                ref="volumeBar"
                class="android-player-volume-bar"
                role="slider"
                tabindex="0"
                aria-label="音量"
                :aria-valuemin="0"
                :aria-valuemax="100"
                :aria-valuenow="volumePercent"
                :aria-valuetext="`${volumePercent}%`"
                @pointerdown="beginVolumeDrag"
                @pointermove="moveVolumeDrag"
                @pointerup="endVolumeDrag"
                @pointercancel="endVolumeDrag"
                @lostpointercapture="endVolumeDrag"
                @keydown="onVolumeKeydown"
                @click.stop
              >
                <span class="android-player-volume-fill" :style="{ height: `${volumePercent}%` }"></span>
                <span class="android-player-volume-thumb" :style="{ bottom: `${volumePercent}%` }"></span>
              </div>
            </template>
            <template v-else>
              <p v-if="!playerEpisodes.length">当前视频没有其他选项</p>
              <div v-for="group in episodeGroups" :key="group.key" class="android-player-menu-group">
                <h4 v-if="episodeGroups.length > 1">{{ group.key }}</h4>
                <button v-for="episode in group.episodes" :key="`${episode.id}:${episode.lineId || 'main'}`" type="button"
                  :disabled="episode.id === activeEpisodeId && (episode.lineId || 'main') === activeLineId"
                  :aria-label="`播放${episodeLabel(episode)}`" @click="chromeMenu = null; scheduleChromeHide(); playSourceEpisode(episode)">{{ episodeLabel(episode) }}</button>
              </div>
            </template>
          </div>
        </div>
      </div>
      <!-- 放大/全屏时这些提示看不见（舞台 fixed inset:0），此时由舞台内的 .android-player-alert 接管。 -->
      <div v-if="playerError && !stageFullscreen" class="android-player-error" role="alert">
        <p class="android-error">{{ playerError }}</p>
        <button v-if="alternatePlayableEpisodes.length" type="button" @click="switchToFallbackLine">切换可用线路</button>
        <button type="button" @click="void retryCurrentLine()">重试当前线路</button>
      </div>
      <p v-if="sourceError && !stageFullscreen" role="alert" class="android-error">{{ sourceError }}</p>
      <div v-if="playerEpisodes.length && !(watchPage && section === 'detail')" class="android-player-episodes" aria-label="切换选集与线路">
        <h3>选集与线路</h3>
        <div v-for="group in episodeGroups" :key="group.key" class="android-episode-group"><h4>{{ group.key }}</h4>
          <div class="android-episode-grid"><button v-for="episode in group.episodes" :key="`${episode.id}:${episode.lineId || 'main'}`" type="button"
            :disabled="episode.id === activeEpisodeId && (episode.lineId || 'main') === activeLineId"
            :aria-label="`播放${episodeLabel(episode)}`" @click="playSourceEpisode(episode)">{{ episodeLabel(episode) }}</button></div>
        </div>
      </div>
    </section>

    <section v-if="section === 'home' || (section === 'library' && usingSubscription)" class="android-home" aria-label="订阅作品仓库">
      <section v-if="section === 'home' && homeContinue.length" class="android-home-continue" aria-label="最近观看"><div class="android-sheet-heading"><h2>继续观看</h2><button type="button" class="android-secondary-button" @click="section = 'history'">全部</button></div><div class="android-continue-shelf"><button v-for="entry in homeContinue" :key="historySourceBindingKey(entry)" type="button" @click="continueWatching(entry)"><AndroidCover :src="historyCover(entry)" alt="" loading="lazy" /><strong>{{ entry.title }}</strong><small>{{ entry.episodeTitle }} · {{ historyProgress(entry) }}</small></button></div></section>
      <template v-if="section === 'library' && usingSubscription">
        <div class="android-section-heading"><h2>订阅作品</h2><button type="button" :disabled="repositoryLoading" @click="loadRepository(true)">{{ repositoryLoading ? '读取中…' : '刷新作品' }}</button></div>
        <p class="android-repository-count" role="status">已显示 {{ displayedRepositoryEntries.length }} 部 · 已读取 {{ repositoryEntries.length }} 部<template v-if="repositoryHasNextPage"> · 还有后续页面</template><template v-else-if="repositoryHits.length && !repositoryIsDirectory"> · 当前只显示搜索候选</template><template v-else-if="repositoryTruncated"> · 部分页面达到读取上限</template><template v-else-if="repositoryHits.length && !repositoryError && !repositoryLoading"> · 当前来源已读完</template></p>
        <div class="android-repository-toolbar"><input v-model="repositoryQuery" aria-label="筛选已读取作品" placeholder="筛选已读取作品" autocomplete="off" /><button type="button" class="android-repository-sort-toggle" :aria-expanded="repositorySortOpen" aria-controls="android-repository-sort-options" @click="repositorySortOpen = !repositorySortOpen">排序：{{ repositoryOrder === 'source' ? '来源顺序' : '名称' }} <span aria-hidden="true">{{ repositorySortOpen ? '⌃' : '⌄' }}</span></button></div>
        <div v-if="repositorySortOpen" id="android-repository-sort-options" class="android-repository-sort-options" role="group" aria-label="作品排序方式" @keydown.esc="repositorySortOpen = false">
          <button type="button" :aria-pressed="repositoryOrder === 'source'" @click="repositoryOrder = 'source'; repositorySortOpen = false">来源顺序<small>按当前来源返回的次序</small></button>
          <button type="button" :aria-pressed="repositoryOrder === 'title'" @click="repositoryOrder = 'title'; repositorySortOpen = false">名称<small>已读取作品按名称排列</small></button>
        </div>
        <p v-if="repositoryLoading" class="android-empty" role="status">加载中…</p>
        <p v-if="repositoryError" class="android-error" role="alert">{{ repositoryError }} <button type="button" :disabled="repositoryLoading" @click="loadRepository(true)">重试读取</button></p>
        <ul class="android-list android-catalog android-subscription-catalog"><li v-for="(entry, index) in displayedRepositoryEntries" :key="sourceHitKey(entry)">
          <button type="button" class="android-catalog-open" :aria-label="`查看 ${entry.title} 详情`" @click="openRepositoryHit(entry)">
            <AndroidCover :src="displayCover(entry.title, entry.sourceUrl, entry.coverUrl) || placeholderCover" alt="" width="160" height="224" :loading="index < 4 ? 'eager' : 'lazy'" :fetchpriority="index < 2 ? 'high' : 'auto'" decoding="async" referrerpolicy="no-referrer" @error="coverFailed(displayCover(entry.title, entry.sourceUrl, entry.coverUrl))" />
            <span class="android-catalog-copy"><strong>{{ entry.title }}</strong><small>{{ entry.sourceName || '订阅来源' }}</small></span>
          </button>
        </li></ul>
        <p v-if="repositoryQuery && !repositoryEntries.length && repositoryHits.length" class="android-empty">已读取的作品中没有匹配项，可换个词或继续读取。</p>
        <button v-if="repositoryDisplayLimit < repositoryEntries.length || repositoryHasNextPage" class="android-repository-more" type="button" :disabled="repositoryLoading" @click="showMoreRepository">{{ repositoryDisplayLimit < repositoryEntries.length ? '显示更多已读取作品' : '读取下一页' }}</button>
        <button v-if="!repositoryHits.length && !repositoryLoading" type="button" @click="section = 'search'">搜索具体作品</button>
      </template>
      <template v-else>
      <div class="android-hero">
        <div class="android-hero-copy"><span class="android-hero-tag">{{ catalogSnapshot[0]?.updateText || '精选推荐' }}</span><h2>{{ catalogSnapshot[0]?.title }}</h2><p>精选 {{ catalogSnapshot.length }} 部作品 · {{ snapshotLineCount }} 条播放线路</p><button type="button" :disabled="sourceLoading" @click="browseBundledItem(catalogSnapshot[0]!)">查看作品详情 <svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="arrow"><path v-for="shape in ICONS.arrow ?? []" :key="shape" :d="shape" /></svg></button></div>
        <div class="android-hero-art"><AndroidCover v-if="catalogSnapshot[0]?.coverUrl" :src="catalogSnapshot[0].coverUrl" loading="eager" alt="" decoding="async" /></div>
      </div>
      <div class="android-section-heading"><h2>推荐作品</h2><button type="button" @click="section = 'library'">我的片库 <svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="arrow"><path v-for="shape in ICONS.arrow ?? []" :key="shape" :d="shape" /></svg></button></div>
      <ul class="android-list android-catalog"><li v-for="entry in catalogSnapshot" :key="entry.id">
        <button type="button" class="android-catalog-open" :disabled="sourceLoading" :aria-label="`查看 ${entry.title} 详情`" @click="browseBundledItem(entry)">
          <AndroidCover :src="entry.coverUrl || placeholderCover" alt="" width="160" height="224" loading="lazy" decoding="async" @error="usePlaceholderCover" />
          <span class="android-catalog-copy"><strong>{{ entry.title }}</strong><small>{{ entry.updateText || '更新时间未知' }}</small></span>
        </button>
      </li></ul>
      </template>
    </section>

    <section v-if="section === 'search'" class="android-panel android-page-section" aria-label="公开来源搜索">
      <form class="android-search-form" @submit.prevent="searchSources">
        <input id="source-keyword" ref="sourceKeywordInput" v-model="sourceKeyword" aria-label="作品关键词" maxlength="50" required placeholder="输入作品名称" enterkeyhint="search" autocomplete="off" />
        <button type="submit" :disabled="sourceLoading || (searchLoading && searchInFlightKeyword === `${activeSubscriptionScope()}\u0000${sourceKeyword.trim().toLocaleLowerCase()}`)">{{ searchLoading ? '读取中…' : '搜索来源' }}</button>
      </form>
      <section v-if="recentKeywords.length && !sourceKeyword.trim()" class="android-search-memory" aria-label="搜索记录"><div class="android-search-memory-heading"><h2>最近搜索</h2><button type="button" class="android-secondary-button" @click="clearSearchMemory">清空</button></div><div class="android-search-memory-list"><div v-for="word in recentKeywords" :key="word" class="android-search-memory-item"><button type="button" class="android-search-memory-word" @click="sourceKeyword = word; searchSources()">{{ word }}</button><button type="button" class="android-search-memory-remove" :aria-label="`删除搜索记录 ${word}`" @click="removeSearchMemory(word)">×</button></div></div></section>
      <!-- 一级标题是页面 h1，这里必须是 h2：原来用 h3 会让文档大纲从 1 直接跳到 3。 -->
      <div class="android-search-results-heading"><h2 class="android-search-source-heading">在线来源</h2><span v-if="groupedSearchHits.length">{{ groupedSearchHits.length }} 部作品</span></div>
      <div v-if="searchSourceGroups.length > 1" class="android-source-filters" role="group" aria-label="筛选搜索来源">
        <button type="button" :aria-pressed="!searchSourceFilter" @click="searchSourceFilter = ''">全部 {{ groupedSearchHits.length }}</button>
        <button v-for="group in searchSourceGroups" :key="group.key" type="button" :aria-pressed="searchSourceFilter === group.key" @click="searchSourceFilter = group.key">{{ group.name }} {{ group.count }}</button>
      </div>
      <p v-if="searchLoading" role="status" class="android-search-hint">{{ searchProgress }}</p>
      <p v-if="sourceError" role="alert" class="android-error"><span>{{ sourceError }}</span> <button type="button" :disabled="searchLoading" @click="searchSources">重新搜索</button></p>
      <p v-else-if="sourceSearched && !searchLoading && !sourceHits.length" class="android-empty">没有找到匹配作品</p>
      <ul v-if="sourceHits.length" class="android-list android-source-results"><li v-for="(hit, hitIndex) in visibleSourceHits" :key="sourceHitKey(hit)">
        <AndroidCover v-if="displayCover(hit.title, hit.sourceUrl, hit.coverUrl) && !failedCovers.has(displayCover(hit.title, hit.sourceUrl, hit.coverUrl))" class="android-cover" :src="displayCover(hit.title, hit.sourceUrl, hit.coverUrl)" alt="" :loading="hitIndex < 2 ? 'eager' : 'lazy'" decoding="async" referrerpolicy="no-referrer" @error="coverFailed(displayCover(hit.title, hit.sourceUrl, hit.coverUrl))" />
        <AndroidCover v-else class="android-cover" :src="placeholderCover" alt="暂无封面" loading="lazy" />
        <div class="android-source-result-copy"><strong>{{ displayText(hit.title) }}</strong><small>{{ hitSourceLabel(hit) }}<template v-if="hit.versions.length > 1"> · {{ hit.versions.length }} 个版本</template><template v-if="searchVersionNotice(hit)"> · {{ searchVersionNotice(hit) }}</template></small></div>
        <a v-if="hit.kind === 'resource' && hit.resourceUrl" :href="hit.resourceUrl" target="_blank" rel="noopener noreferrer">外部下载</a>
        <button v-else type="button" :disabled="sourceLoading" @click="watchSearchVersions(hit)">{{ searchVersionNotice(hit) === '播放地址待重试' ? '尝试播放' : '立即观看' }}</button>
      </li></ul>
    </section>

    <section v-if="section === 'detail' && sourcePreview" class="android-panel android-detail" aria-label="作品详情">
        <div class="android-detail-episodes">
          <p v-if="sourceLoading && !sourcePreview.episodes.length" role="status">正在加载选集…</p>
          <p v-else-if="!sourcePreview.episodes.length">暂无选集，请刷新或换源。</p>
          <div v-else class="android-sheet-heading"><h3>{{ movieLike ? '播放线路' : '选集' }}</h3><button v-if="!movieLike" type="button" class="android-secondary-button" @click="episodeDescending = !episodeDescending; episodePage = 0">{{ episodeDescending ? '倒序' : '正序' }}</button></div>
          <div v-if="episodeGroups.length > 1" class="android-source-filters" role="group" aria-label="选择播放线路"><button v-for="group in episodeGroups" :key="group.key" type="button" :aria-pressed="detailGroup?.key === group.key" @click="chooseEpisodeGroup(group.key)">{{ group.key }}</button></div>
          <div v-if="detailGroup && detailEpisodeList.length > 30" class="android-episode-ranges" role="group" aria-label="选集分段"><button v-for="index in Math.ceil(detailEpisodeList.length / 30)" :key="index" type="button" :aria-pressed="episodePage === index - 1" @click="episodePage = index - 1">{{ (index - 1) * 30 + 1 }}–{{ Math.min(index * 30, detailEpisodeList.length) }}</button></div>
          <div v-for="group in (detailGroup ? [detailGroup] : [])" :key="group.key" class="android-episode-group">
            <h4>{{ group.key }}</h4>
            <div class="android-episode-grid"><button v-for="episode in detailEpisodes" :key="`${episode.id}:${episode.lineId || 'main'}`" type="button"
              :aria-label="`播放${episodeLabel(episode)}`" :aria-pressed="selected !== null && activeEpisodeId === episode.id && activeLineId === (episode.lineId || 'main')" @click="playSourceEpisode(episode)">{{ episodeLabel(episode) }}</button></div>
          </div>
        </div>
        <div class="android-detail-hero">
          <AndroidCover v-if="previewCover && !failedCovers.has(previewCover)" class="android-detail-cover" :src="previewCover" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" @error="coverFailed(previewCover)" />
          <AndroidCover v-else class="android-detail-cover" :src="placeholderCover" alt="暂无封面" loading="eager" />
          <div class="android-detail-copy"><h2>{{ displayText(sourcePreview.title) }}</h2><small class="android-detail-source">{{ hitSourceLabel(sourcePreview) }}</small></div>
          <div class="android-detail-actions">
            <button type="button" class="android-primary-button" :disabled="sourceLoading || !sourcePreview.episodes.length" @click="playPreviewPrimary">{{ previewResume ? '继续观看' : '播放' }}</button>
            <button v-if="alternateMovieSource" type="button" :disabled="sourceLoading" @click="switchMovieSource">{{ alternateSourceLabel }}</button>
            <button v-if="!previewSaved" type="button" :disabled="previewSaving" @click="collectPreview">{{ previewSaving ? '收藏中…' : '收藏作品' }}</button>
            <button v-else type="button" @click="togglePreviewFavorite">{{ previewSaved.favorite ? '取消收藏' : '收藏作品' }}</button>
            <details class="android-detail-more"><summary>更多</summary><div class="android-detail-more-content"><button v-if="!previewSaved" type="button" :disabled="previewSaving" @click="savePreview">保存到本机</button><button type="button" :disabled="sourceLoading" @click="previewSource(sourcePreview.sourceUrl, true, sourcePreview)">刷新选集</button><div class="android-setting-row"><label for="android-auto-play">自动连播</label><input id="android-auto-play" type="checkbox" :checked="settings.autoPlay" @change="updateSettings({ autoPlay: ($event.target as HTMLInputElement).checked })" /></div></div></details>
          </div>
        </div>
        <details open class="android-summary android-detail-description"><summary>剧情简介</summary><p>{{ sourcePreview.summary ? displayText(sourcePreview.summary) : sourceLoading ? '正在加载详情…' : '该来源暂未提供剧情简介。' }}</p></details>
        <p v-if="sourceError" role="alert" class="android-error">{{ sourceError }}</p>
    </section>

    <p v-if="error" class="android-error" role="alert">{{ error }} <button v-if="retryAction" type="button" @click="retryAction()">重试读取</button></p>

    <section v-if="section === 'library' && !usingSubscription" class="android-page-section android-library" aria-label="本地作品">
      <div class="android-section-title">
        <div><h2>本地作品 <small>{{ items.length }}</small></h2></div>
        <div role="group" aria-label="筛选作品">
          <button type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
          <button type="button" :aria-pressed="filter === 'favorites'" @click="filter = 'favorites'">收藏</button>
        </div>
      </div>
      <label for="android-search">搜索本地作品</label>
      <input id="android-search" v-model="keyword" type="search" placeholder="输入作品名称" />
      <p v-if="catalogLoading" class="android-empty" role="status">正在读取本机片库…</p>
      <!-- 读取失败时不再声称「还没有保存作品」，否则会把“读不到”说成“确实没有”。 -->
      <p v-else-if="!visible.length && !error" class="android-empty">{{ keyword.trim() ? '没有符合搜索条件的本地作品。' : filter === 'favorites' ? '还没有收藏作品。' : '本机还没有保存作品。' }}</p>
      <ul v-else class="android-list android-library-grid">
        <li v-for="item in visible" :key="item.id">
          <button class="android-library-open" type="button" :disabled="sourceLoading" :aria-label="`查看 ${displayText(item.title)} 详情`" @click="playSaved(item)"><AndroidCover class="android-cover" :src="savedCover(item) || placeholderCover" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="usePlaceholderCover" /><strong>{{ displayText(item.title) }}</strong></button>
          <small class="android-library-meta">{{ mediaType(item.url) ? '已保存视频' : '已保存作品' }} · {{ new Date(item.updatedAt).toLocaleDateString('zh-CN') }}</small>
          <div class="android-actions"><button type="button" :disabled="sourceLoading" @click="playSaved(item)">{{ mediaType(item.url) ? '播放' : '查看选集' }}</button>
          <button type="button" :aria-label="item.favorite ? `取消收藏${item.title}` : `收藏${item.title}`" @click="toggleFavorite(item)">{{ item.favorite ? '已收藏' : '收藏' }}</button></div>
        </li>
      </ul>
      <div v-if="pageCount > 1" class="android-pagination"><button type="button" :disabled="page <= 1" @click="page--">上一页</button><span>第 {{ page }} / {{ pageCount }} 页</span><button type="button" :disabled="page >= pageCount" @click="page++">下一页</button></div>
    </section>

    <section v-if="section === 'history'" class="android-panel android-page-section">
      <div class="android-section-title">
        <div><h2>观看历史</h2></div>
      </div>
      <p v-if="historyLoading" class="android-empty" role="status">正在读取观看历史…</p>
      <!-- 历史读取失败必须在本页可见并可重试：此前它借用全局 error，而全局的「重试读取」只重读片库。 -->
      <p v-else-if="historyError" class="android-error" role="alert">{{ historyError }} <button type="button" @click="reloadHistory()">重试读取</button></p>
      <p v-else-if="!history.length" class="android-empty">尚无观看记录。</p>
      <!-- 竖列表：一屏内左右滑动翻找在手机上既容易误触又看不到全部，改成与片库同一套行式列表。 -->
      <ul v-else class="android-list android-history-list">
        <li v-for="entry in history" :key="historySourceBindingKey(entry)">
          <AndroidCover class="android-cover" :src="historyCover(entry)" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="coverFailed(historyCover(entry)); void recoverHistoryCovers()" />
          <div class="android-history-copy">
            <strong>{{ displayText(entry.title) }}</strong>
            <small>{{ episodeDisplayText(entry.episodeTitle) }} · {{ historyProgress(entry) }}</small>
            <progress v-if="!entry.completed && entry.durationSeconds > 0" :value="entry.positionSeconds" :max="entry.durationSeconds"></progress>
          </div>
          <button type="button" @click="continueWatching(entry)">{{ entry.completed ? '重新观看' : '继续播放' }}</button>
        </li>
      </ul>
      <button v-if="history.length" type="button" class="android-history-clear android-secondary-button" :class="{ 'is-armed': clearArmed }" :disabled="clearRunning" :aria-pressed="clearArmed" @click="clearHistory">{{ clearRunning ? '正在清除…' : clearArmed ? '再点一次确认清除' : '清除观看历史' }}</button>
    </section>

    <section v-if="section === 'schedule'" class="android-panel android-page-section" aria-label="一周排期">
      <template v-if="usingSubscription"><p class="android-empty">当前订阅未提供排期信息。</p><button type="button" @click="section = 'library'">查看订阅作品</button></template>
      <template v-else>
      <p>随包排期 · {{ new Date(catalogSnapshotAsOf).toLocaleDateString('zh-CN') }}</p>
      <div v-for="day in snapshotSchedule" :key="day.label" :class="{ 'is-empty': !day.items.length }">
        <h2>{{ day.label }}</h2>
        <p v-if="!day.items.length">暂无</p>
        <ul v-else class="android-list"><li v-for="item in day.items" :key="item.id"><div><strong>{{ item.title }}</strong><small>更新时间：{{ item.time }}</small></div><button type="button" :disabled="sourceLoading" @click="browseBundledItem(item)">查看</button></li></ul>
      </div>
      </template>
    </section>

    <section v-if="section === 'settings'" class="android-panel android-page-section" aria-label="个人设置">
      <div class="android-personal-nav" role="group" aria-label="我的功能">
        <button v-for="entry in ([['subscriptions', '订阅'], ['downloads', '下载'], ['storage', '缓存'], ['backup', '备份'], ['diagnostics', '诊断']] as const)" :key="entry[0]" type="button" :aria-pressed="personalPanel === entry[0]" @click="personalPanel = entry[0]">{{ entry[1] }}</button>
      </div>
      <SubscriptionManager v-show="personalPanel === 'subscriptions'" android />

      <div v-show="personalPanel === 'storage'" class="android-setting-group">
        <span class="android-kicker">存储</span>
        <div class="android-setting-list">
          <div class="android-setting-row android-setting-row--storage"><div><strong>媒体缓存</strong></div></div>
        </div>
        <!-- 此前桥接里的 clearMediaCache 声明了却从未被调用：缓存只能等系统回收（VQ-61）。 -->
        <button type="button" class="android-secondary-button android-cache-clear" :disabled="cacheClearing" @click="clearMediaCache">{{ cacheClearing ? '正在清理媒体缓存…' : '清理媒体缓存' }}</button>
        <div class="android-setting-row"><div><strong>封面缓存</strong></div><span class="android-setting-value">{{ coverCacheStatus || '读取中…' }}</span></div>
        <button type="button" class="android-secondary-button android-cache-clear" :disabled="coverCacheClearing" @click="clearCoverImages">{{ coverCacheClearing ? '正在清理…' : '清理封面缓存' }}</button>
      </div>

      <AndroidDiagnostics v-show="personalPanel === 'diagnostics'" />
      <AndroidBackup v-show="personalPanel === 'backup'" @restored="restorePersonalViews" />
      <AndroidDownloads v-show="personalPanel === 'downloads'" @play="playDownloaded" />

      <div class="android-setting-group">
        <span class="android-kicker">关于</span>
        <div class="android-setting-list">
          <div class="android-setting-row"><div><strong>版本</strong></div><span class="android-setting-value">{{ appVersion || '读取中…' }}</span></div>
        </div>
      </div>

    </section>

  </main>
</template>
