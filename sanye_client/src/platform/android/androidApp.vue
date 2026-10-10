<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch as watchValue } from 'vue'
import type Hls from 'hls.js'
import { App } from '@capacitor/app'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { androidCatalog, type AndroidSettings, type FrameTargetSetting, type SavedMedia, type WatchHistory } from './catalog'
import { mediaType, playbackType, type MediaType } from './mediaSource'
import { androidSource, type SourceEpisode, type SourceHit, type SourcePreview } from './source'
import { catalogSnapshot, catalogSnapshotAsOf, type CatalogSnapshotItem } from './catalogSnapshot'
import { scheduleFromSnapshot } from './schedule'
import { titleKey } from '../../data/titleKey'
// 占位封面随包发布：Android 构建用相对资源路径，和随包目录封面走同一条导入方式。
import placeholderCover from './assets/anime-placeholder.svg'
import { parsePlaybackLine } from '../../video/playbackLines'
import { FRAME_RATE_OPTIONS, type FrameRateTarget } from '../../video/frameCadence'
import { ANIME4K_PROFILE_LABELS, type Anime4KProfile } from '../../video/anime4k'
import { ANDROID_ENHANCEMENT_LIMITS, MOBILE_ANIME4K_PROFILES } from '../../video/enhancementLimits'
import { createFragmentCache } from '../../video/hlsFragmentCache'
import { MotionStabilityPolicy } from '../../video/motionStabilityPolicy'
import { accumulatePlaybackStabilityTally, createPlaybackStabilityTally } from '../../video/playbackStabilityTally'
import type { InterpolationStats, RealtimeInterpolationSession } from '../../video/realtimeInterpolation'
import { AdaptationNotice } from '../../video/adaptationNotice'

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
const settings = ref<AndroidSettings>({ theme: 'system', autoPlay: false, playbackRate: 1, qualityProfile: 'off', frameTarget: 'off', volume: 1 })
/** 「我的」里可选的本机播放速度；与播放器实际落盘的 playbackRate 同一组取值。 */
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const
/** 「我的」页关于分区显示的版本号；读取失败时保持占位文案。 */
const appVersion = ref('')
const selected = ref<SavedMedia | null>(null)
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
const sourceHits = ref<SourceHit[]>([])
const failedCovers = ref(new Set<string>())
const sourcePreview = ref<SourcePreview | null>(null)
const sourceLoading = ref(false)
/** 是否真的搜过：没搜过就不该显示「没有找到匹配作品」。 */
const sourceSearched = ref(false)
const sourceError = ref('')
const activeEpisodeId = ref('direct')
const activeEpisodeTitle = ref('直链媒体')
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
function androidFragmentCache(HlsConstructor: Parameters<typeof createFragmentCache>[0]) {
  if (!fragmentCacheHandle) {
    fragmentCacheHandle = createFragmentCache(HlsConstructor, () => !hls?.latestLevelDetails?.live, 64 * 1024 * 1024)
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
const searchCache = new Map<string, { expires: number; hits: SourceHit[] }>()
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
watchValue(section, (next) => {
  if (next === 'history' || next === 'home') void reloadHistory()
  // 重新进搜索页（而不是从详情返回）等于开一次新检索：上一次的关键词、结果与空态都不再保留。
  if (next === 'search' && previousSection !== 'detail') resetSearch()
  previousSection = next
  if (next !== 'detail' && watchPage.value) { watchPage.value = false; if (selected.value) void closePlayer() }
})

/** 输入即搜：停止输入 420ms 后自动检索；同一关键词不重复打来源。 */
watchValue(sourceKeyword, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  const keyword = value.trim().toLocaleLowerCase()
  if (!keyword || keyword === lastHitsKeyword) return
  searchTimer = setTimeout(() => { searchTimer = null; void searchSources() }, 420)
})
const previewSaved = computed(() => items.value.find((item) => item.url === sourcePreview.value?.sourceUrl))
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
const playerEpisodes = computed(() => sourcePreview.value && selected.value?.url === sourcePreview.value.sourceUrl ? sourcePreview.value.episodes : [])
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
/** 同一作品内可尝试的其他线路：同集不同线路优先，其次同标题，最后同作品其他条目。 */
const alternatePlayableEpisodes = computed(() => {
  const active = { id: activeEpisodeId.value, title: activeEpisodeTitle.value, sourceUrl: activeEpisodeId.value, playbackUrl: '', mimeType: '', lineId: activeLineId.value }
  const activeNumber = episodeNumberKey(active)
  const activeRoute = episodeRouteKey(active)
  return playerEpisodes.value
    .filter((episode) => episode.id !== activeEpisodeId.value && !!episode.sourceUrl)
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
  for (const episode of sourcePreview.value?.episodes ?? []) {
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
  const group = episodeGroups.value.find((entry) => entry.episodes.some((candidate) => candidate.id === activeEpisodeId.value))
  if (!group) return null
  const index = group.episodes.findIndex((candidate) => candidate.id === activeEpisodeId.value)
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
/** 页面小标题：每个分区自己的定位，不再让所有页面共用一句「动漫发现工作区 / 探索」。 */
const pageKicker = computed(() => {
  switch (section.value) {
    case 'search': return '公开来源 · 检索'
    case 'library': return '本机片库 · 收藏'
    case 'schedule': return '更新日历 · 随包快照'
    case 'history': return '观看足迹 · 继续播放'
    case 'settings': return '我的空间 · 播放与数据'
    case 'detail': return watchPage.value ? '正在观看 · 来源详情' : '作品档案 · 来源详情'
    default: return '三叶动漫 · 安卓版'
  }
})
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
  return effective === null ? frameTarget.value === value : effective === value
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
  // A frame-rate choice must pin a real rendition. HLS ABR cannot filter by FPS alone.
  const level = chosenQuality.value
  // currentLevel pins the rendition and flushes incompatible buffered fragments.
  hls.currentLevel = level
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
  if (bySource) return bySource
  const key = titleKey(title)
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
  // 外站线路失败时先回退随包已有线路（与 PC 端口径一致）：同一个失效来源上的其他候选
  // 经常是同一批 CDN，逐条重试只会白白拖时间，用户看到的就是“点了没反应”。
  const activeIsBundled = bundledPool.value.some((episode) => episode.playbackUrl && episode.playbackUrl === activePlaybackUrl.value)
  if (!activeIsBundled && await switchToBundledLine()) return
  const candidate = alternatePlayableEpisodes.value.find((episode) => !lineFallbackTried.has(fallbackKey(episode)))
  if (!candidate) {
    // 同来源的线路都试过之后，已有线路可直接接管时静默切换（与 PC 端口径一致，不显示失败）。
    if (await switchToBundledLine()) return
    if (await tryNextSource()) return
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
function clearPlaybackStallWatchdog() {
  if (playbackStallTimer !== undefined) window.clearTimeout(playbackStallTimer)
  playbackStallTimer = undefined
}
function armPlaybackStallWatchdog() {
  if (playbackStallTimer !== undefined) return
  playbackStallTimer = window.setTimeout(() => {
    playbackStallTimer = undefined
    if (!hasFirstFrame.value || playerError.value || playbackEnded.value || !video.value) return
    void handlePlaybackFailure('当前线路长时间没有画面，已尝试其他线路；请检查网络或稍后重试。')
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
        void handlePlaybackFailure('当前线路长时间没有画面，已尝试其他线路；请检查网络或稍后重试。')
      }, 10_000)
    }, 10_000)
    return
  }
  stallTimer = window.setTimeout(() => {
    if (generation !== playbackGeneration || hasFirstFrame.value || playerError.value) return
    lineNotice.value = '线路较慢，正在继续加载…'
    stallTimer = window.setTimeout(() => {
      if (generation !== playbackGeneration || hasFirstFrame.value || playerError.value) return
      void handlePlaybackFailure('当前线路长时间没有画面，已尝试其他线路；请检查网络或稍后重试。')
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
    sourceError.value = '这条线路没有可重试的来源地址，请在选集里换一条线路。'
    return
  }
  const sourceUrl = episode.sourceUrl
  previewCache.delete(sourceUrl)
  await playSourceEpisode({ ...episode, playbackUrl: '', sourceUrl }, activeLineId.value === 'main' ? undefined : activeLineId.value)
}

function changeQuality(value: string) {
  chosenQuality.value = Number(value)
  if (chosenQuality.value < 0) chosenFps.value = 'auto'
  else if (chosenFps.value !== 'auto') chosenFps.value = String(qualityLevels.value[chosenQuality.value]?.fps ?? 'auto')
  applyStreamSelection()
}
function changeFps(value: string) {
  chosenFps.value = value
  if (value !== 'auto') {
    const choices = qualityLevels.value.filter((level) => level.fps === Number(value))
    if (!choices.some((level) => level.index === chosenQuality.value)) {
      const best = choices.sort((left, right) => (hls?.levels[right.index]?.bitrate ?? 0) - (hls?.levels[left.index]?.bitrate ?? 0))[0]
      if (!best) return
      chosenQuality.value = best.index
    }
  }
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
        showQualityNotice(adaptationNotice.next(previous, stats, performance.now()))
        guardMotionBackend(stats)
        publishPlaybackStability(stats)
      },
      onError: (message) => {
        if (request !== enhancementRequest) return
        // 先降一档重试一次，再考虑退回原画（VQ-53）。
        if (retryWithLighterProfile()) return
        stopEnhancement()
        // 档位是用户的意图：失败只提示一次并停下本次会话，不再把档位悄悄改回关闭
        //（用户看到的是「优化去哪了」）。用户再点一次档位即可重试。
        enhancementState.value = 'failed'
        notifyOnce(message || '当前设备或片源不支持实时增强，本次以原始画面播放。')
      },
    })
    if (request !== enhancementRequest || element !== video.value) { session.stop(); return }
    enhancementSession = session
    sessionInterpolating = wantInterpolation
    enhancementState.value = 'active'
  } catch (cause) {
    if (request !== enhancementRequest) return
    // 会话可能在抛错前已经把画面切到增强画布（类名由会话切换），这里显式清掉，
    // 否则失败后画面会停在增强画布上，表现为一块黑画面。
    playerStage.value?.classList.remove('sanye-realtime-interpolation-active')
    // 初始化失败同样先降一档重试一次（VQ-53）。
    if (retryWithLighterProfile()) return
    enhancementState.value = 'failed'
    notifyOnce(cause instanceof Error ? cause.message : '当前设备或片源不支持实时增强，本次以原始画面播放。')
  }
}

function changeQualityProfile(value: Anime4KProfile | 'off') {
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
  frameTarget.value = value
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
    showQualityNotice('运动估计已切到稳定模式')
  } else {
    forceCpuFlowBackend = true
    showQualityNotice('检测到画面波动，运动估计已回到 CPU 光流')
  }
  // 统计回调来自渲染 Worker：直接重启会终止正在处理消息的会话，放到下一个任务再执行。
  window.setTimeout(() => {
    if (video.value?.paused) return
    void applyEnhancement()
  }, 0)
}

async function switchToFallbackLine() {
  const candidate = alternatePlayableEpisodes.value[0]
  if (!candidate) {
    playerError.value = '当前选集没有其他可用线路。'
    return
  }
  playerError.value = ''
  await playSourceEpisode(candidate)
}

function onPlayerPlay() {
  playing.value = true
  hasFirstFrame.value = true
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
  hasFirstFrame.value = true
  buffering.value = false
  switchingLine.value = false
  // 只有真的在播时才撤掉「后台暂停」提示（VQ-62）：从后台切回前台时部分机型会重新走一次
  // loadeddata，而这个回调以前无条件清掉 backgroundPaused —— 画面明明还停着，
  // 恢复入口却消失了，用户只能盯着一张定格画面。
  if (!video.value?.paused) backgroundPaused.value = false
  clearStallWatchdog()
  clearPlaybackStallWatchdog()
  syncPlaybackDuration()
}

/** 首帧之后的缓冲/卡顿（VQ-61）：给舞台内提示并起看门狗，恢复播放时由 timeupdate 清掉。 */
function onVideoWaiting() {
  if (!hasFirstFrame.value || playerError.value) return
  buffering.value = true
  armPlaybackStallWatchdog()
}

/** 播放错误：起播失败自动换线路，已经出画面的中途错误只提示，不打断当前内容。 */
function onVideoError(message: string) {
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
  if (!playing.value || playerError.value || chromeMenu.value) return
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
/** 浮层右缘与触发按钮文字的右缘对齐：位置和宽度都跟着这颗按钮，不额外占位。 */
function toggleChromeMenu(menu: 'quality' | 'fps' | 'episodes' | 'volume', event?: MouseEvent) {
  const next = chromeMenu.value === menu ? null : menu
  chromeMenu.value = next
  if (!next) { scheduleChromeHide(); return }
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
  // 随包封面只在作品身份一致时使用：先比对来源地址，再按归一化标题比对同名作品
  //（来源标题常只差标点，例如「你的名字。」与随包目录的「你的名字」）。
  const key = titleKey(title)
  const known = catalogSnapshot.find((item) => item.sourceUrl === sourceUrl || (key && titleKey(item.title) === key))
  return known?.coverUrl || remote
}

/**
 * 观看历史卡片封面：优先用记录时保存的封面，其次按作品身份回退到随包封面，
 * 最后用随包占位图——历史卡片没有独立的「暂无封面」占位块，缺图时必须是可渲染的图片。
 */
function historyCover(entry: WatchHistory): string {
  if (entry.coverUrl) return entry.coverUrl
  const known = displayCover(entry.title, entry.mediaUrl)
  if (known) return known
  // 旧记录（封面字段还没落盘的时代）用同一部作品在片库里的封面补上，最后才用随包占位图。
  const saved = items.value.find((item) => item.url === entry.mediaUrl
    || (!!titleKey(item.title) && titleKey(item.title) === titleKey(entry.title)))
  return saved ? savedCover(saved) : placeholderCover
}

/** 图片加载失败时换成随包占位图，而不是把图片隐藏掉。 */
function usePlaceholderCover(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image || image.src === placeholderCover) return
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
  if (item) return displayCover(item.title, item.url, item.coverUrl)
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
  const title = displayText(episode.title)
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
    && candidate.id !== episode.id
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

function fetchPreview(sourceUrl: string, fresh = false): Promise<SourcePreview> {
  // 刷新当前来源时只失效当前条目，保留相邻作品的缓存，避免返回搜索页后再次等待网络。
  if (fresh) previewCache.delete(sourceUrl)
  const cached = previewCache.get(sourceUrl)
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.value)
  let pending = fresh ? undefined : previewPending.get(sourceUrl)
  if (!pending) {
    // JS 侧也要有期限（VQ-61）：只靠原生 15s 兜底时，插件抛错或桥接丢消息会让这个 Promise
    // 永远悬空——previewPending 里那条记录也就永远留在原地，该地址本次运行内一直走悬空路径。
    pending = withNativeTimeout(androidSource.preview({ sourceUrl }), 15_000).then((preview) => {
      if (previewPending.get(sourceUrl) === pending) rememberPreview(sourceUrl, preview)
      return preview
    }).finally(() => { if (previewPending.get(sourceUrl) === pending) previewPending.delete(sourceUrl) })
    previewPending.set(sourceUrl, pending)
  }
  return pending
}

/**
 * 搜索结果返回后预热第一条来源详情，用户点“立即观看”时通常直接命中缓存，
 * 不必再等一次详情页往返；预热失败不影响列表展示。
 */
function warmTopHit(hits: SourceHit[]) {
  const first = hits[0]
  if (!first) return
  if (previewCache.has(first.sourceUrl) || previewPending.has(first.sourceUrl)) return
  void fetchPreview(first.sourceUrl).catch(() => { /* 预热失败时保持原有加载路径 */ })
}

async function episodeOptions(sourceUrl: string): Promise<SourceEpisode[]> {
  return (await fetchPreview(sourceUrl)).episodes
}

function warmAdjacentEpisode(episode: SourceEpisode, preview: SourcePreview) {
  if (sourcePreview.value !== preview) return
  const group = episodeGroups.value.find((entry) => entry.episodes.some((candidate) => candidate.id === episode.id))
  if (!group) return
  const index = group.episodes.findIndex((candidate) => candidate.id === episode.id)
  const next = group.episodes[index + 1] ?? group.episodes[index - 1]
  if (next?.sourceUrl && !next.playbackUrl && next.sourceUrl !== episode.sourceUrl) void episodeOptions(next.sourceUrl).catch(() => {})
  // 下一集已经有直链时提前建立连接并预取很轻的清单（VQ-48）：换集少一次 DNS/TLS 与清单往返。
  if (next?.playbackUrl) { warmMediaHost(next.playbackUrl); prefetchHlsManifest(next.playbackUrl) }
}

const WARM_LINK_REL = 'sanye-media-source'
const PREFETCH_MANIFEST_TIMEOUT_MS = 6_000
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
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PREFETCH_MANIFEST_TIMEOUT_MS)
  void fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'force-cache', signal: controller.signal })
    .catch(() => undefined)
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
    history.value = (await withNativeTimeout(androidCatalog.listHistory(), 8_000)).items
    historyError.value = ''
  } catch {
    historyError.value = '观看历史暂时无法读取，原有记录不会自动清除。'
  } finally {
    historyLoading.value = false
  }
}

function disposePlayer() {
  playbackGeneration++
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
    mediaUrl, title: safeLabel(item.title, 120) || '未命名作品',
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
    await withNativeTimeout(androidCatalog.recordProgress(entry), 8_000)
    if (completed || section.value === 'history') await reloadHistory(false)
  }).catch((cause: unknown) => {
    // 原生侧的拒绝原因要露出来：此前统一吞成一句「保存失败」，排查时无法区分是地址被拒、
    // 参数非法还是数据库不可写（用户看到的是「观看历史就是存不下来」）。
    const reason = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
    const detail = safeLabel(reason, 80)
    notifyOnce(detail ? `播放进度保存失败，本次记录已跳过：${detail}` : '播放进度保存失败，本次记录已跳过。')
  })
  return progressQueue
}

function onTimeUpdate() {
  // 画面在前进就说明缓冲结束、卡顿解除（VQ-61）。
  if (playbackStallTimer !== undefined) { window.clearTimeout(playbackStallTimer); playbackStallTimer = undefined }
  if (buffering.value) buffering.value = false
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
  const box = playerStage.value?.getBoundingClientRect()
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
  const box = playerStage.value?.getBoundingClientRect()
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
 * 拖动期间按帧更新指针位置，并按 280ms 节流预览定位，让画面跟着手指走；
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
/**
 * 拖动期间的节流预览定位：让画面跟着手指走，但相邻预览至少间隔 280ms
 * 且目标位移超过 2 秒，避免 HLS 反复中止在途分片反而更卡。
 */
/**
 * 定位预览（VQ-59）：拖动期间把画质链路降成只出原帧，并把「最小位移」按进度条分辨率折算。
 * 原来固定 2 秒位移对短视频等于大半个进度条，手指拖动几乎不产生新画面，用户感到「拖不动」。
 */
function previewSeek(target: number) {
  const element = video.value
  if (!element || seekMax.value <= 0) return
  const now = Date.now()
  if (now - lastPreviewSeekAt < 140) return
  const minStep = Math.max(0.4, seekMax.value / 240)
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
  seekingPlayback.value = false
  // 定位是播放段边界：静默窗口内不参与 GPU 后端判定（VQ-49）。
  motionStability.reset()
  motionGuardResumeAt = performance.now() + 2_500
  playbackSeconds.value = target
  // 播完后再定位等于重新选位置，结束遮罩必须让开，否则画面会被“本集播放结束”压住。
  if (max <= 0 || target < max - 0.5) playbackEnded.value = false
  if (element) {
    try { element.currentTime = target } catch { /* 缓冲范围未就绪时忽略本次定位 */ }
  }
  syncPlaybackDuration()
  void persistProgress()
  scheduleChromeHide()
  // 落位后留出解码与缓冲的时间，再把完整档位接回来（VQ-59）：立即恢复会让拖动末尾又变卡。
  if (enhancementSession) {
    const session = enhancementSession
    if (previewTimer !== undefined) window.clearTimeout(previewTimer)
    previewTimer = window.setTimeout(() => { previewTimer = undefined; if (enhancementSession === session) session.setPreview(false) }, 400)
  }
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
  seekDragging.value = false
  seekingPlayback.value = false
  // 拖动过程中预览已经改过 element.currentTime（previewSeek）：只同步 UI 是不够的，
  // 画面会停在被拖到的位置，随后的定时保存还会把它当成真实进度（VQ-61）。
  const element = video.value
  if (element && seekOriginSeconds > 0) {
    try { element.currentTime = seekOriginSeconds } catch { /* 缓冲范围未就绪时忽略 */ }
  }
  playbackSeconds.value = element && Number.isFinite(element.currentTime) ? element.currentTime : playbackSeconds.value
  // 与 commitSeekTo 一致：落位后留出解码时间再把完整档位接回来，避免取消瞬间抖一下。
  if (enhancementSession) {
    const session = enhancementSession
    if (previewTimer !== undefined) window.clearTimeout(previewTimer)
    previewTimer = window.setTimeout(() => { previewTimer = undefined; if (enhancementSession === session) session.setPreview(false) }, 400)
  }
  scheduleChromeHide()
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
    .filter((entry) => entry.mediaUrl === mediaUrl && (!episodeId || entry.episodeId === episodeId) && !entry.completed && entry.positionSeconds > 0)
    .sort((left, right) => right.positionSeconds - left.positionSeconds)[0]
}
/** 落位：把已看过的进度写进 <video>；时长为 0（清单还没解析完）或已接近结尾时不动。 */
function applyResumePosition(element: HTMLVideoElement, record: { positionSeconds: number; completed: boolean } | undefined) {
  if (!record || record.completed || record.positionSeconds <= 0) return false
  if (!Number.isFinite(element.duration) || record.positionSeconds >= element.duration - 5) return false
  try { element.currentTime = record.positionSeconds } catch { return false }
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
  const exact = () => history.value.find((entry) => entry.mediaUrl === item.url && entry.episodeId === activeEpisodeId.value && entry.lineId === activeLineId.value)
  if (applyResumePosition(element, exact() ?? bestHistoryRecord(item.url, activeEpisodeId.value))) return
  void reloadHistory(false).then(() => {
    if (video.value !== element || element.currentTime >= 3) return
    applyResumePosition(element, exact() ?? bestHistoryRecord(item.url, activeEpisodeId.value))
  }).catch(() => { /* 读取失败时保持从头播放 */ })
}

async function watch(item: SavedMedia, playbackUrl = item.url, episodeId = 'direct', episodeTitle = '直链媒体', lineId = 'main', forcePlay = true, mediaHint: MediaType | null = null) {
  const type = playbackType(playbackUrl) ?? mediaHint
  if (!type) { playerError.value = '此地址不是可直接播放的 MP4 或 HLS 媒体；作品网页需要后续来源适配。'; return }
  const keepPlaying = !!video.value && !video.value.paused
  ++episodeRequest
  sourceLoading.value = false
  // 换集/换线时画面会短暂空白、声音中断：给一个舞台内「正在切换线路…」提示（VQ-61）。
  const previousSelection = selected.value
  const switchingEpisode = previousSelection !== null
    && (previousSelection.url !== item.url || activeEpisodeId.value !== episodeId || activeLineId.value !== lineId)
  switchingLine.value = switchingEpisode
  activePlaybackUrl.value = playbackUrl
  // 起播前先和媒体主机建链（VQ-48）：首片请求不再额外等一次 DNS/TLS。
  warmMediaHost(playbackUrl)
  // Capture the outgoing identity before replacing the player; persistence must not stall playback.
  void persistProgress()
  disposePlayer()
  const generation = playbackGeneration
  selected.value = item
  activeEpisodeId.value = episodeId
  activeEpisodeTitle.value = episodeTitle
  activeLineId.value = lineId
  playerError.value = ''
  lastSavedAt = 0
  await nextTick()
  if (generation !== playbackGeneration) return
  const element = video.value
  if (!element) return
  element.playbackRate = settings.value.playbackRate
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
      // 与 PC 播放器同一套超时/重试口径：既能容忍手机网络的慢，也不会让失效线路把起播拖到几十秒。
      // 分片缓存与缓冲窗口按手机口径取值：换集/回看命中内存分片时不再重新下载，
      // 60 秒前向缓冲把常见网络抖动挡在起播与拖动之后（VQ-48）。
      hls = new HlsRuntime({
        fLoader: androidFragmentCache(HlsRuntime).Loader,
        enableWorker: true,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        backBufferLength: 60,
        // 移动端收敛（VQ-61）：默认 maxBufferSize 是 60MB，与 64MB 分片缓存叠加时峰值内存偏高；
        // capLevelToPlayerSize 让清晰度不超过舞台实际像素，390px 宽的竖屏不会再白拉 1080P。
        capLevelToPlayerSize: true,
        maxBufferSize: 40 * 1000 * 1000,
        startLevel: -1,
        manifestLoadingTimeOut: 12_000,
        manifestLoadingMaxRetry: 2,
        manifestLoadingMaxRetryTimeout: 8_000,
        levelLoadingTimeOut: 12_000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 20_000,
        fragLoadingMaxRetry: 4,
        fragLoadingMaxRetryTimeout: 10_000,
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
        let host = ''
        try { host = new URL(playbackUrl).host } catch { host = '' }
        void handlePlaybackFailure(host
          ? `当前线路（${host}）加载失败，已尝试其他可用线路；请检查网络或稍后重试。`
          : '当前线路加载失败，已尝试其他可用线路；请检查网络或稍后重试。')
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
    else playerError.value = '此设备暂不支持 HLS 播放。'
  } else if (type === 'mp4') {
    element.src = playbackUrl
  }
  armStallWatchdog(generation)
  if ((settings.value.autoPlay || keepPlaying || forcePlay) && !playerError.value) void playWhenReady(element, generation)
}

async function playWhenReady(element: HTMLVideoElement, generation: number) {
  if (element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
    await new Promise<void>((resolve) => {
      let timer: number | undefined
      const done = () => {
        if (timer !== undefined) window.clearTimeout(timer)
        element.removeEventListener('canplay', done)
        element.removeEventListener('error', done)
        resolve()
      }
      element.addEventListener('canplay', done, { once: true })
      element.addEventListener('error', done, { once: true })
      timer = window.setTimeout(done, 8000)
    })
  }
  if (generation !== playbackGeneration || element !== video.value || playerError.value) return
  try {
    await element.play()
  } catch {
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
  // 「继续观看」必须落到带播放器和作品详情的页面：先切到详情，再解析并播放原来的选集/线路。
  section.value = 'detail'
  detailReturn.value = 'history'
  if (!mediaType(entry.mediaUrl)) {
    // 历史记录指向随包作品时直接用已有线路续播，不再让来源站往返决定等待时间。
    const work = bundledWorkFor(entry.title, entry.mediaUrl)
    const pool = bundledEpisodes(work)
    const bundled = pool.find((candidate) => candidate.id === entry.episodeId && (candidate.lineId || 'main') === entry.lineId)
      ?? pool.find((candidate) => candidate.id === entry.episodeId)
    if (work && bundled) { await playBundledEpisode(work, bundled); return }
    // 这条历史不属于随包作品：清掉上一部作品的已有线路池，避免换线时串到别的作品。
    bundledPool.value = []
    bundledWork.value = null
    await previewSource(entry.mediaUrl)
    const episode = sourcePreview.value?.episodes.find((candidate) => candidate.id === entry.episodeId && (candidate.lineId || 'main') === entry.lineId)
      ?? sourcePreview.value?.episodes.find((candidate) => candidate.id === entry.episodeId && !candidate.playbackUrl)
    if (!episode) {
      // 解析不到原选集时留在详情页，用户可以直接在下面的选集列表里挑一条；历史记录不会丢。
      sourceError.value = '原选集目前无法解析；历史记录已保留，可在下方选集里手动选择。'
      if (!sourcePreview.value) { section.value = 'library'; fail('原作品目前无法解析，历史记录已保留。') }
      return
    }
    await playSourceEpisode(episode, entry.lineId)
    return
  }
  await watch({ id: -1, title: entry.title, url: entry.mediaUrl, favorite: false, updatedAt: entry.updatedAt }, entry.mediaUrl, entry.episodeId, entry.episodeTitle, entry.lineId)
}

/** 重新进入搜索页：清掉上一次的关键词、结果与空态，避免“上一次的文字还在”。 */
function resetSearch() {
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
async function requestHits(keyword: string): Promise<SourceHit[]> {
  try { return (await withNativeTimeout(androidSource.search({ keyword }), 15_000)).hits }
  catch {
    await new Promise((resolve) => setTimeout(resolve, 350))
    return (await withNativeTimeout(androidSource.search({ keyword }), 15_000)).hits
  }
}

/** 当前在途检索的关键词：同一个关键词不重复打来源，新的关键词取代旧检索（不再直接丢弃）。 */
let searchInFlightKeyword = ''
async function searchSources() {
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = null }
  const keyword = sourceKeyword.value.trim()
  if (!keyword) return
  const cacheKey = keyword.toLocaleLowerCase()
  // 原来这里是 `if (sourceLoading.value) return`：旧检索还在跑时，用户改了关键词再触发检索会被**静默丢弃**
  // ——实测输入框显示「第二」、列表还是「第一」的结果，而桥接只收到一次 search。现在改成：同一关键词不重复发，
  // 不同关键词直接取代（stale 响应本来就由 searchRequest 序号丢弃）。
  if (sourceLoading.value && cacheKey === searchInFlightKeyword) return
  const request = ++searchRequest
  searchInFlightKeyword = cacheKey
  sourceLoading.value = true
  sourceError.value = ''
  sourceSearched.value = true
  // 连点两次搜索时不要先把上一次的结果清空：清空 + 来源请求排队会让界面看起来“搜不到”。
  if (cacheKey !== lastHitsKeyword) sourceHits.value = []
  sourcePreview.value = null
  try {
    const cached = searchCache.get(cacheKey)
    const useCached = !!(cached && cached.expires > Date.now())
    const hits = useCached ? cached!.hits : await requestHits(keyword)
    if (request !== searchRequest) return
    if (hits.length && !useCached) {
      if (searchCache.size >= 20) searchCache.delete(searchCache.keys().next().value!)
      searchCache.set(cacheKey, { expires: Date.now() + 45_000, hits })
    }
    if (sourceKeyword.value.trim().toLocaleLowerCase() === cacheKey) {
      // 同一关键词的空结果（来源抖动或竞速超时）保留上一次的结果，而不是直接显示“没有找到”。
      if (hits.length || !sourceHits.value.length) {
        sourceHits.value = hits
        lastHitsKeyword = cacheKey
      }
      warmTopHit(sourceHits.value)
    }
  }
  catch { if (request === searchRequest) sourceError.value = '公开来源暂不可用，请检查网络后重试；本地片库不受影响。' }
  // 只有最新一次请求能收掉「读取中」：被取代的旧请求结束时不能把新请求的状态一起清掉。
  finally { if (request === searchRequest) { sourceLoading.value = false; searchInFlightKeyword = '' } }
}

async function previewSource(sourceUrl: string, fresh = false, seed?: { title: string; coverUrl: string; summary: string }): Promise<boolean> {
  const request = ++previewRequest
  const previousSection = section.value
  sourceLoading.value = true
  sourceError.value = ''
  // 详情区先用搜索命中或已保存作品的标题、封面和简介占位，避免点击后长时间空白，
  // 也避免在上一次预览未失效时短暂显示上一部作品的选集。
  const previous = sourcePreview.value?.sourceUrl === sourceUrl ? sourcePreview.value : null
  sourcePreview.value = {
    title: seed?.title || previous?.title || '',
    sourceUrl,
    coverUrl: seed?.coverUrl || previous?.coverUrl || '',
    summary: seed?.summary || previous?.summary || '',
    episodes: previous?.episodes ?? [],
  }
  try {
    const preview = await fetchPreview(sourceUrl, fresh)
    if (request !== previewRequest) return false
    const known = sourceHits.value.find((hit) => hit.sourceUrl === preview.sourceUrl)
      ?? items.value.find((item) => item.url === preview.sourceUrl)
    sourcePreview.value = {
      ...preview,
      // 原生不再因为页面没有标题就整次失败（VQ-60）：标题缺省时用搜索命中或已保存作品的标题补上，
      // 不能把进入详情前的占位标题覆盖成空串。
      title: preview.title || seed?.title || previous?.title || '',
      coverUrl: preview.coverUrl || known?.coverUrl || '',
      summary: preview.summary || known?.summary || '',
    }
    if (previousSection !== 'detail') detailReturn.value = previousSection
    section.value = 'detail'
    // 详情页一解析完就预热该作品几条线路的媒体主机：点选集时不必再等一次建连（VQ-49）。
    warmPreviewHosts(sourcePreview.value)
    return true
  }
  catch { if (request === previewRequest) sourceError.value = '该来源页暂无法预览，未更改本地片库。'; return false }
  finally { if (request === previewRequest) sourceLoading.value = false }
}

/** 依次尝试备用来源，成功播放返回 true；全部失败返回 false 交给调用方显示错误。 */
async function tryNextSource(): Promise<boolean> {
  while (sourceQueue.value.length) {
    const next = sourceQueue.value[0]!
    sourceQueue.value = sourceQueue.value.slice(1)
    sourceTried.value = [...sourceTried.value, next]
    const ok = await previewSource(next)
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
  await watchSearchResult(item.url, item)
}

async function watchSearchResult(sourceUrl: string, saved?: SavedMedia, candidates: string[] = []) {
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
      episodes: [{ id: 'direct', title: '直链媒体', sourceUrl: saved.url, playbackUrl: saved.url, mimeType: '', lineId: 'main' }] }
    section.value = 'detail'
    await watch(saved)
    return
  }
  // 先切到观看工作区展示播放器占位，来源解析在后台继续，避免点击后长时间停留在搜索页。
  detailReturn.value = section.value
  section.value = 'detail'
  const hit = sourceHits.value.find((candidate) => candidate.sourceUrl === sourceUrl)
  const seed = {
    title: saved?.title || hit?.title || '',
    coverUrl: saved?.coverUrl || hit?.coverUrl || '',
    summary: saved?.summary || hit?.summary || '',
  }
  // 随包已有线路：外站线路不可用或超过起播预算时静默接管，用户不必等来源站超时。
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
  await previewSource(target)
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
  try { await androidCatalog.save({ title: preview.title, url: preview.sourceUrl, coverUrl: safeCoverUrl(preview.coverUrl), summary: preview.summary }); await reload(); error.value = ''; filter.value = 'all'; keyword.value = ''; section.value = 'library' }
  catch { sourceError.value = '保存来源失败，原片库未更改。' }
  finally { previewSaving.value = false }
}

async function collectPreview() {
  const preview = sourcePreview.value
  if (!preview || previewSaving.value) return
  previewSaving.value = true
  try {
    await androidCatalog.save({ title: preview.title, url: preview.sourceUrl, coverUrl: safeCoverUrl(preview.coverUrl), summary: preview.summary, favorite: true })
    await reload()
    sourceError.value = ''
  } catch { sourceError.value = '收藏失败，本机原有作品和收藏未更改。' }
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
    if (!candidate) { sourceError.value = message; return }
    lineFallbackTried.add(fallbackKey(candidate))
    lineNotice.value = `已自动尝试其他选集：${displayText(candidate.title)}`
    await playSourceEpisode(candidate)
  }
  if (!episode.playbackUrl && episode.sourceUrl) {
    sourceLoading.value = true
    try {
      const options = await episodeOptions(episode.sourceUrl)
      if (request !== episodeRequest || preview !== sourcePreview.value) return
      const requestedLine = requiredLineId || (episode.lineId && episode.lineId !== 'main' ? episode.lineId : '')
      const playable = options.filter((candidate) => episodeMediaType(candidate))
      const resolved = resolvePlayableLine(playable, episode, requestedLine, Boolean(requiredLineId))
      if (!resolved) {
        // 历史续播只认原线路，不能自动换；首次观看则允许自动尝试下一条选集。
        if (requiredLineId) { sourceError.value = '原线路目前不可用；历史记录已保留，不会自动切换到其他线路。'; return }
        await retryNextEpisode(requestedLine ? '所选线路目前不可用；不会自动切换到其他线路。' : '该集目前没有可播放直链，已保留选集地址。')
        return
      }
      // 只有真正匹配到所选线路时才沿用分组名；否则保存来源自身编号，历史续播才能命中同一条。
      const lineId = requestedLine && (resolved.lineId || 'main') === requestedLine ? requestedLine : resolved.lineId || 'main'
      episode = { ...resolved, id: episode.id, title: episode.title, lineId }
    } catch {
      if (request !== episodeRequest) return
      if (!requiredLineId) { await retryNextEpisode('该集来源页暂不可用，请稍后重试。'); return }
      sourceError.value = '原线路目前不可用；历史记录已保留。'
      return
    }
    finally { if (request === episodeRequest) sourceLoading.value = false }
  }
  if (request !== episodeRequest || preview !== sourcePreview.value) return
  if (requiredLineId && (episode.lineId || 'main') !== requiredLineId) { sourceError.value = '原线路目前不可用；历史记录已保留。'; return }
  const episodeType = episodeMediaType(episode)
  if (!episodeType) {
    if (!requiredLineId) { await retryNextEpisode('当前选集没有受支持的 MP4 或 HLS 地址，请换线路或刷新选集。'); return }
    sourceError.value = '原线路目前不可用；历史记录已保留。'
    return
  }
  await watch({ id: -2, title: preview.title, url: preview.sourceUrl, favorite: false, updatedAt: Date.now() },
    episode.playbackUrl, episode.id, episode.title, episode.lineId || 'main', true, episodeType)
  warmAdjacentEpisode(episode, preview)
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
    notifyOnce('设置保存失败，原有偏好未更改。')
  }
}

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
  try { await androidCatalog.clearHistory(); await reloadHistory() }
  catch { fail('清理历史失败，原有记录未更改。') }
  finally { clearRunning.value = false }
}

/** 统一的错误出口：只有带重试动作的错误才渲染「重试读取」。 */
/**
 * 清理媒体缓存（VQ-61）：分片缓存最多 64MB，且此前没有任何清理入口
 * （`clearMediaCache` 在桥接里声明了却从未被调用）。这里清原生缓存目录 + 内存里的分片表。
 */
const cacheClearing = ref(false)
async function clearMediaCache() {
  if (cacheClearing.value) return
  cacheClearing.value = true
  try {
    const result = await withNativeTimeout(androidCatalog.clearMediaCache(), 8_000)
    fragmentCacheHandle?.clear()
    fragmentCacheHandle = null
    notifyOnce(`已清理媒体缓存${result && typeof result.removed === 'number' ? `（${result.removed} 项）` : ''}。`)
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
    items.value = (await withNativeTimeout(androidCatalog.list(), 8_000)).items
    clearError()
  } catch {
    fail('无法读取本地片库。请重试；已有数据不会自动清除。', () => { void reload() })
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
    fail('收藏状态保存失败，原有数据未更改。')
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
  void reload()
  void reloadHistory()
  // 设置读取同样是设置页能否离开「读取中」的前提（VQ-60）。
  void withNativeTimeout(androidCatalog.getSettings(), 8_000).then((value) => {
    const loaded = value.settings
    // 画质与帧率随设置一起恢复（VQ-48）：点开作品即以用户上次的档位起播，不需要每次重选。
    const restoredQuality = restoreQualityProfile(loaded.qualityProfile)
    const restoredFrame = restoreFrameTarget(loaded.frameTarget)
    // 音量随设置恢复（VQ-61）：起播前就设好，避免先以 100% 出声再跳变。
    const restoredVolume = typeof loaded.volume === 'number' && Number.isFinite(loaded.volume) && loaded.volume >= 0 && loaded.volume <= 1 ? loaded.volume : 1
    qualityProfile.value = restoredQuality
    frameTarget.value = restoredFrame
    playbackVolume.value = restoredVolume
    // 旧版本插件或测试桥接可能缺字段，这里补齐后再交给模板使用。
    settings.value = { ...loaded, theme: loaded.theme ?? 'system', autoPlay: loaded.autoPlay ?? false,
      playbackRate: loaded.playbackRate ?? 1, qualityProfile: restoredQuality, frameTarget: frameTargetSetting(restoredFrame), volume: restoredVolume }
  }).catch(() => { fail('设置暂时无法读取。') })
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
  const element = video.value
  unmounted = true
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
      <button class="android-top-search" type="button" aria-label="搜索作品与来源" :aria-current="section === 'search' || (section === 'detail' && detailReturn === 'search') ? 'page' : undefined" @click="section = 'search'"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="search"><path v-for="shape in ICONS.search ?? []" :key="shape" :d="shape" /></svg><span class="android-top-search-label">搜索作品或来源</span></button>
      <button class="android-theme-toggle" type="button" :aria-label="appearanceLight ? '切换深色模式' : '切换浅色模式'" @click="updateSettings({ theme: appearanceLight ? 'dark' : 'light' })"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="appearanceLight ? 'moon' : 'sun'"><path v-for="shape in (appearanceLight ? ICONS.moon : ICONS.sun) ?? []" :key="shape" :d="shape" /></svg></button>
    </header>

    <!-- 一次性提示：同一条文案一次运行只出现一次，几秒后自动收回。 -->
    <p v-if="notice" class="android-notice" role="status">{{ notice }}</p>

    <nav class="android-nav" aria-label="安卓功能导航">
      <button v-for="entry in ([['home', '首页'], ['library', '片库'], ['schedule', '排期'], ['history', '历史'], ['settings', '我的']] as const)"
        :key="entry[0]" type="button" :aria-current="section === entry[0] || (section === 'detail' && detailReturn === entry[0]) ? 'page' : undefined" @click="section = entry[0]"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path v-for="shape in NAV_ICONS[entry[0]]" :key="shape" :d="shape" /></svg></span><small>{{ entry[1] }}</small></button>
    </nav>

    <div v-if="section !== 'home'" class="android-page-heading"><button v-if="section === 'detail'" class="android-back" type="button" @click="section = detailReturn"><svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="back"><path v-for="shape in ICONS.back ?? []" :key="shape" :d="shape" /></svg> 返回{{ detailReturn === 'search' ? '搜索结果' : detailReturn === 'library' ? '片库' : '上一页' }}</button><span class="android-kicker">{{ pageKicker }}</span><h1>{{ section === 'search' ? '搜索作品' : section === 'detail' ? (watchPage ? '观看作品' : '作品详情') : section === 'library' ? '番剧仓库' : section === 'history' ? '继续观看' : section === 'schedule' ? '一周排期' : '我的空间' }}</h1></div>

    <div v-if="section === 'detail' && watchPage && !selected" class="android-watch-top android-watch-placeholder" role="status">
      <img v-if="previewCover && !failedCovers.has(previewCover)" :src="previewCover" alt="" referrerpolicy="no-referrer" @error="coverFailed(previewCover)" />
      <div><strong>{{ displayText(sourcePreview?.title || '选择选集开始观看') }}</strong></div>
    </div>

    <section v-if="selected" class="android-player" :class="watchPage && section === 'detail' ? 'android-player--inline' : 'android-player--overlay'" aria-label="视频播放">
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
        <img v-if="showPoster" class="android-player-poster" :src="playerArtwork" alt="" referrerpolicy="no-referrer" @error="coverFailed(playerArtwork)" />
        <video ref="video" playsinline preload="metadata" @loadedmetadata="syncPlaybackDuration(); restorePosition()" @loadeddata="onFirstFrame()" @durationchange="syncPlaybackDuration" @progress="syncPlaybackDuration" @timeupdate="onTimeUpdate" @play="playing = true" @playing="onPlayerPlay()" @canplay="syncPlaybackDuration()" @pause="playing = false; persistProgress()" @ended="onPlaybackEnded" @waiting="onVideoWaiting" @stalled="onVideoWaiting" @error="onVideoError('无法加载视频，请检查来源、格式或网络连接。')" />
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
        <div ref="controlsBar" class="android-player-controls" :class="{ 'is-hidden': !chromeVisible }" aria-label="播放控制" @click.stop="onPlayerSurfaceTap">
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
                <button v-for="level in qualityLevels" :key="level.index" type="button" class="android-player-list-item" :aria-pressed="chosenQuality === level.index" :title="level.label" @click="changeQuality(String(level.index))">{{ level.label.split(' · ')[0] }}</button>
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
                <button v-for="fps in availableFps" :key="fps" type="button" class="android-player-list-item" :aria-pressed="chosenFps === String(fps)" :title="`${fps} FPS`" @click="changeFps(String(fps))">{{ fps }}</button>
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
              <p v-if="!playerEpisodes.length">当前媒体没有来源选集</p>
              <div v-for="group in episodeGroups" :key="group.key" class="android-player-menu-group">
                <h4 v-if="episodeGroups.length > 1">{{ group.key }}</h4>
                <button v-for="episode in group.episodes" :key="`${episode.id}:${episode.lineId || 'main'}`" type="button"
                  :disabled="episode.id === activeEpisodeId && (episode.lineId || 'main') === activeLineId"
                  :aria-label="`播放${episodeLabel(episode)}`" @click="chromeMenu = null; scheduleChromeHide(); playSourceEpisode(episode)">{{ episodeLabel(episode) }}</button>
              </div>
            </template>
          </div>
        </div>
        <!-- 舞台内提示（VQ-61）：放大/全屏时舞台覆盖整个视口，舞台外的提示与错误块不可见，
             这里给出唯一一条需要用户看到/操作的信息（错误、缓冲、切换、后台恢复、线路提示）。 -->
        <div v-if="stageAlert" class="android-player-alert" :class="{ 'android-player-alert--calm': !stageAlert.urgent }" role="alert">
          <svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="stageAlert.icon"><path v-for="shape in ICONS[stageAlert.icon] ?? []" :key="shape" :d="shape" /></svg>
          <p>{{ stageAlert.text }}</p>
          <button v-if="stageAlert.action === 'switch'" type="button" @click.stop="switchToFallbackLine()">切换线路</button>
          <button v-else-if="stageAlert.action === 'retry'" type="button" @click.stop="void retryCurrentLine()">重试当前线路</button>
          <button v-else-if="stageAlert.action === 'resume'" type="button" @click.stop="resumeFromBackground()">继续播放</button>
        </div>
        <!-- 画面手势提示（VQ-56）：只显示亮度与音量；屏幕中间的进度提示按用户要求不出现。 -->
        <div v-if="gestureHint" class="android-player-hud" role="status">
          <svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" :data-icon="gestureHint.kind === 'brightness' ? 'brightness' : 'volume'"><path v-for="shape in (gestureHint.kind === 'brightness' ? ICONS.brightness : ICONS.volume) ?? []" :key="shape" :d="shape" /></svg>
          <strong>{{ gestureHint.percent }}%</strong>
        </div>
        <p v-if="qualityNotice" class="android-player-adapt" role="status">{{ qualityNotice }}</p>
      </div>
      <div v-if="playerEpisodes.length && !(watchPage && section === 'detail')" class="android-player-episodes" aria-label="切换选集与线路">
        <h3>选集与线路</h3>
        <div v-for="group in episodeGroups" :key="group.key" class="android-episode-group"><h4>{{ group.key }}</h4>
          <div class="android-episode-grid"><button v-for="episode in group.episodes" :key="`${episode.id}:${episode.lineId || 'main'}`" type="button"
            :disabled="episode.id === activeEpisodeId && (episode.lineId || 'main') === activeLineId"
            :aria-label="`播放${episodeLabel(episode)}`" @click="playSourceEpisode(episode)">{{ episodeLabel(episode) }}</button></div>
        </div>
      </div>
      <!-- 放大/全屏时这些提示看不见（舞台 fixed inset:0），此时由舞台内的 .android-player-alert 接管。 -->
      <div v-if="playerError && !stageFullscreen" class="android-player-error" role="alert">
        <p class="android-error">{{ playerError }}</p>
        <button v-if="alternatePlayableEpisodes.length" type="button" @click="switchToFallbackLine">切换可用线路</button>
        <button type="button" @click="void retryCurrentLine()">重试当前线路</button>
      </div>
      <p v-if="sourceError && !stageFullscreen" role="alert" class="android-error">{{ sourceError }}</p>
    </section>

    <section v-if="section === 'home'" class="android-home">
      <div class="android-hero">
        <div class="android-hero-copy"><span class="android-hero-tag">{{ catalogSnapshot[0]?.updateText || '精选推荐' }}</span><h2>{{ catalogSnapshot[0]?.title }}</h2><p>随包收录 {{ catalogSnapshot.length }} 部作品 · {{ snapshotLineCount }} 条已核验线路</p><button type="button" :disabled="sourceLoading" @click="browseBundledItem(catalogSnapshot[0]!)">查看作品详情 <svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="arrow"><path v-for="shape in ICONS.arrow ?? []" :key="shape" :d="shape" /></svg></button></div>
        <div class="android-hero-art"><img v-if="catalogSnapshot[0]?.coverUrl" :src="catalogSnapshot[0].coverUrl" alt="" /><span aria-hidden="true">精选推荐</span></div>
      </div>
      <div class="android-section-heading"><div><span class="android-kicker">三叶精选</span><h2>推荐作品</h2></div><button type="button" @click="section = 'library'">全部 <svg class="android-icon" viewBox="0 0 24 24" aria-hidden="true" data-icon="arrow"><path v-for="shape in ICONS.arrow ?? []" :key="shape" :d="shape" /></svg></button></div>
      <ul class="android-list android-catalog"><li v-for="entry in catalogSnapshot" :key="entry.id">
        <button type="button" class="android-catalog-open" :disabled="sourceLoading" :aria-label="`查看 ${entry.title} 详情`" @click="browseBundledItem(entry)">
          <img :src="entry.coverUrl" alt="" loading="lazy" />
          <span class="android-catalog-copy"><strong>{{ entry.title }}</strong><small>{{ entry.updateText || '更新时间未知' }}</small></span>
        </button>
      </li></ul>
    </section>

    <section v-if="section === 'search'" class="android-panel android-page-section" aria-label="公开来源搜索">
      <form class="android-search-form" @submit.prevent="searchSources">
        <label for="source-keyword">作品关键词</label>
        <input id="source-keyword" v-model="sourceKeyword" maxlength="50" required placeholder="输入作品名称" />
        <button type="submit" :disabled="sourceLoading">{{ sourceLoading ? '读取中…' : '搜索来源' }}</button>
        <p class="android-search-hint">输入即搜：停止输入后自动检索公开来源，也可以直接点「搜索来源」。</p>
      </form>
      <!-- 一级标题是页面 h1，这里必须是 h2：原来用 h3 会让文档大纲从 1 直接跳到 3。 -->
      <h2 class="android-search-source-heading">在线来源</h2>
      <p v-if="sourceError" role="alert" class="android-error">{{ sourceError }}</p>
      <p v-else-if="sourceSearched && !sourceLoading && !sourceHits.length" class="android-empty">没有找到匹配作品</p>
      <ul v-if="sourceHits.length" class="android-list"><li v-for="hit in sourceHits" :key="hit.sourceUrl">
        <img v-if="displayCover(hit.title, hit.sourceUrl, hit.coverUrl) && !failedCovers.has(displayCover(hit.title, hit.sourceUrl, hit.coverUrl))" class="android-cover" :src="displayCover(hit.title, hit.sourceUrl, hit.coverUrl)" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="coverFailed(displayCover(hit.title, hit.sourceUrl, hit.coverUrl))" />
        <span v-else class="android-cover android-cover-empty" aria-label="暂无封面">暂无封面</span>
        <div><strong>{{ displayText(hit.title) }}</strong></div>
        <button type="button" :disabled="sourceLoading" @click="watchSearchResult(hit.sourceUrl)">立即观看</button>
      </li></ul>
    </section>

    <section v-if="section === 'detail' && sourcePreview" class="android-panel android-detail" aria-label="作品详情">
        <div class="android-detail-hero">
          <img v-if="previewCover && !failedCovers.has(previewCover)" class="android-detail-cover" :src="previewCover" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="coverFailed(previewCover)" />
          <span v-else class="android-detail-cover android-cover-empty" aria-label="暂无封面">暂无封面</span>
          <div class="android-detail-copy"><span class="android-kicker">作品档案</span><h2>{{ displayText(sourcePreview.title) }}</h2><p>{{ displayText(sourcePreview.summary || '来源没有提供简介。') }}</p><small>{{ sourcePreview.episodes.length }} 个条目</small></div>
          <div class="android-detail-actions">
            <button v-if="alternateMovieSource" type="button" :disabled="sourceLoading" @click="switchMovieSource">{{ alternateSourceLabel }}</button>
            <button v-if="!previewSaved" type="button" :disabled="previewSaving" @click="savePreview">{{ previewSaving ? '保存中…' : '保存到本机' }}</button>
            <button v-if="!previewSaved" type="button" :disabled="previewSaving" @click="collectPreview">{{ previewSaving ? '收藏中…' : '收藏作品' }}</button>
            <button v-else type="button" @click="togglePreviewFavorite">{{ previewSaved.favorite ? '取消收藏' : '收藏作品' }}</button>
            <button type="button" :disabled="sourceLoading" @click="previewSource(sourcePreview.sourceUrl, true)">刷新选集</button>
          </div>
        </div>
        <p v-if="sourceError" role="alert" class="android-error">{{ sourceError }}</p>
        <p v-if="sourceLoading && !sourcePreview.episodes.length" role="status">正在读取选集与线路…</p>
        <p v-else-if="!sourcePreview.episodes.length">当前页未找到受支持的 MP4/HLS 直链，可保留来源并稍后重试。</p>
        <h3 v-else>选集与线路 <small>选择后即可观看</small></h3>
        <div v-for="group in episodeGroups" :key="group.key" class="android-episode-group">
          <h4>{{ group.key }}</h4>
          <div class="android-episode-grid"><button v-for="episode in group.episodes" :key="`${episode.id}:${episode.lineId || 'main'}`" type="button"
            :aria-label="`播放${episodeLabel(episode)}`" @click="playSourceEpisode(episode)">{{ episodeLabel(episode) }}</button></div>
        </div>
    </section>

    <p v-if="error" class="android-error" role="alert">{{ error }} <button v-if="retryAction" type="button" @click="retryAction()">重试读取</button></p>

    <section v-if="section === 'library'" class="android-page-section" aria-label="本地作品">
      <div class="android-section-title">
        <div><h2>本地作品</h2></div>
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
      <ul v-else class="android-list">
        <li v-for="item in visible" :key="item.id">
          <img class="android-cover" :src="savedCover(item) || placeholderCover" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="usePlaceholderCover" />
          <div><strong>{{ displayText(item.title) }}</strong><small>{{ displayText(item.summary || '来源未提供简介') }}</small><small>{{ mediaType(item.url) ? '本机直链' : '来源网页' }} · {{ new Date(item.updatedAt).toLocaleDateString('zh-CN') }}</small></div>
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
        <li v-for="entry in history" :key="`${entry.mediaUrl}:${entry.episodeId}:${entry.lineId}`">
          <img class="android-cover" :src="historyCover(entry)" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="usePlaceholderCover" />
          <div class="android-history-copy">
            <strong>{{ displayText(entry.title) }}</strong>
            <small>{{ displayText(entry.episodeTitle) }} · {{ historyProgress(entry) }}</small>
            <progress v-if="!entry.completed && entry.durationSeconds > 0" :value="entry.positionSeconds" :max="entry.durationSeconds"></progress>
          </div>
          <button type="button" @click="continueWatching(entry)">{{ entry.completed ? '重新观看' : '继续播放' }}</button>
        </li>
      </ul>
      <button v-if="history.length" type="button" class="android-history-clear android-secondary-button" :class="{ 'is-armed': clearArmed }" :disabled="clearRunning" :aria-pressed="clearArmed" @click="clearHistory">{{ clearRunning ? '正在清除…' : clearArmed ? '再点一次确认清除' : '清除观看历史' }}</button>
    </section>

    <section v-if="section === 'schedule'" class="android-panel android-page-section" aria-label="一周排期">
      <p>截至 {{ new Date(catalogSnapshotAsOf).toLocaleDateString('zh-CN') }}，只收录来源目录写明星期与时间的作品。</p>
      <div v-for="day in snapshotSchedule" :key="day.label" :class="{ 'is-empty': !day.items.length }">
        <h2>{{ day.label }}</h2>
        <p v-if="!day.items.length">暂无</p>
        <ul v-else class="android-list"><li v-for="item in day.items" :key="item.id"><div><strong>{{ item.title }}</strong><small>来源目录记录：{{ item.time }}</small></div><button type="button" :disabled="sourceLoading" @click="browseBundledItem(item)">查看</button></li></ul>
      </div>
    </section>

    <section v-if="section === 'settings'" class="android-panel android-page-section">

      <div class="android-setting-group">
        <span class="android-kicker">播放</span>
        <div class="android-setting-list">
          <!-- 这里不再提供「自动播放」开关：起播一律由用户操作触发（watch 的 forcePlay 默认 true），
               该开关点了没有任何效果；偏好字段与 PC 端保持一致保留，只不作为用户可见开关
               （v0.14 移除、v0.41 同时要求去掉每行设置后面的解释句）。 -->
          <div class="android-setting-row android-setting-row--stack">
            <div><strong>播放速度</strong></div>
            <div class="android-setting-chips">
              <button v-for="rate in PLAYBACK_RATES" :key="rate" type="button" :aria-pressed="Math.abs(settings.playbackRate - rate) < 0.001" @click="updateSettings({ playbackRate: rate })">{{ rate }}×</button>
            </div>
          </div>
        </div>
      </div>

      <div class="android-setting-group">
        <span class="android-kicker">存储</span>
        <div class="android-setting-list">
          <div class="android-setting-row"><div><strong>媒体缓存</strong></div><span class="android-setting-value">播放分片缓存，最多 64MB</span></div>
        </div>
        <!-- 此前桥接里的 clearMediaCache 声明了却从未被调用：缓存只能等系统回收（VQ-61）。 -->
        <button type="button" class="android-secondary-button android-cache-clear" :disabled="cacheClearing" @click="clearMediaCache">{{ cacheClearing ? '正在清理媒体缓存…' : '清理媒体缓存' }}</button>
      </div>

      <div class="android-setting-group">
        <span class="android-kicker">关于</span>
        <div class="android-setting-list">
          <div class="android-setting-row"><div><strong>版本</strong></div><span class="android-setting-value">{{ appVersion || '读取中…' }}</span></div>
        </div>
      </div>

    </section>

  </main>
</template>
