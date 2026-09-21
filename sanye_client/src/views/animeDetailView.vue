<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type Artplayer from 'artplayer'
import type Hls from 'hls.js'
import { animeApi, type AnimeUrlPreviewResult } from '@/api/anime'
import { favoriteApi } from '@/api/favorite'
import { ApiError, isAbortError, resolveAssetUrl } from '@/api/http'
import type { AnimeDetail, AnimeEpisode, AnimePlaybackOption } from '@/api/types'
import { animeCatalogMap } from '@/data/animeCatalog'
import { desktopMode } from '@/desktop'
import { ANIME4K_PROFILE_LABELS, startAnime4KEnhancement, type Anime4KProfile, type Anime4KSession } from '@/video/anime4k'
import { startRealtimeInterpolation, releaseInterpolationAudio, type InterpolationStats } from '@/video/realtimeInterpolation'
import { installSeekControl, installHlsSeekControl } from '@/video/seekControl'
import { installPlaybackControl, useSmoothProgress } from '@/video/playbackControl'
import { createFragmentCache } from '@/video/hlsFragmentCache'
import { AdaptationNotice } from '@/video/adaptationNotice'
import { QualityObservability, type ClarityObservation, type QualityWindow } from '@/video/qualityObservability'
import { FRAME_RATE_OPTIONS, type FrameRateTarget } from '@/video/frameCadence'
import {
  readPlaybackPreferences,
  savePlaybackPreferences,
  playbackLanguage,
  rankPlaybackOptions,
  recordPlaybackRoute,
  clearStartupQuality,
  matchStartupQualityIndex,
  qualityLadderSignature,
  readStartupQuality,
  saveStartupQuality,
  type StartupQualityRecord,
} from '@/video/playbackPreferences'
const FrameInterpolationDialog = defineAsyncComponent(() => import('@/components/frameInterpolationDialog.vue'))
const interpolationOpen = ref(false)
let interpolationWasPlaying = false
function closeInterpolation() {
  interpolationOpen.value = false
  if (interpolationWasPlaying && artPlayer) void artPlayer.video.play().catch(() => {})
}
import {
  clearEpisodeProgress,
  normalizePlaybackEpisodes,
  prefetchNeighborEpisodes,
  readCachedEpisodes,
  readEpisodeProgress,
  readSelectedEpisodeId,
  warmMediaSource,
  writeCachedEpisodes,
  writeEpisodeProgress,
  writeSelectedEpisodeId,
} from '@/video/playerCache'

const route = useRoute()
const router = useRouter()

const PLAYER_STARTUP_TIMEOUT_MS = 15_000
const PLAYER_STALL_RECOVERY_MS = 10_000
const PROGRESS_WRITE_INTERVAL_MS = 1_000
/** 记忆档位首片超过该时间仍未出画即作废记忆并回到低档起播。 */
const STARTUP_QUALITY_FALLBACK_MS = 2_000

const slug = computed(() => String(route.params.slug ?? ''))
const previewSourceUrl = computed(() => typeof route.query.sourceUrl === 'string' ? route.query.sourceUrl.trim() : '')
const isExternalPreview = computed(() => route.name === 'externalWatch' && Boolean(previewSourceUrl.value))
const detail = ref<AnimeDetail | null>(null)
const loading = ref(false)
const failed = ref(false)
const previewError = ref('')
const collected = ref(false)
const favoriteStateVersion = ref(0)
const favoritePending = ref(false)
const episodes = ref<AnimeEpisode[]>([])
const episodesLoading = ref(false)
const episodesFailed = ref(false)
const selectedEpisodeId = ref<number | null>(null)
const selectedPlaybackUrl = ref('')
const playerLoading = ref(false)
const playerError = ref(false)
const episodesUsingCache = ref(false)
const episodesRequestVersion = ref(0)
const preferences = readPlaybackPreferences()
const anime4KEnabled = ref(preferences.quality !== 'off')
const interpolationEnabled = ref(preferences.frameRate !== 'off')
const interpolationTarget = ref<FrameRateTarget>(preferences.frameRate === 'off' ? 'auto' : preferences.frameRate)
const anime4KProfile = ref<Anime4KProfile>(preferences.quality === 'off' ? 'fast' : preferences.quality)
const playbackPhase = ref('正在加载视频')
const attemptedRoutes = new Set<string>()
const searchReturn = computed(() => ({ path: '/search', query: { keyword: typeof route.query.keyword === 'string' ? route.query.keyword : detail.value?.title || '' } }))
const playbackKey = computed(() => `${detail.value?.title || slug.value}:${detail.value?.year || ''}:${selectedEpisode.value?.episodeNo || 1}`)
const anime4KState = ref<'idle' | 'starting' | 'active' | 'unsupported' | 'failed'>('idle')
const playerContainer = ref<HTMLDivElement | null>(null)
let artPlayer: Artplayer | null = null
let artHls: Hls | null = null
let playerRequestVersion = 0
let anime4KSession: Anime4KSession | null = null
let interpolationStats: InterpolationStats | null = null
/** VQ-30 画质窗口汇总：把清晰度档位与渲染 Worker 的成本证据按秒合并。 */
let qualityObservability: QualityObservability | null = null
let anime4KRequestVersion = 0
let mediaLoadTimer = 0
let stallRecoveryTimer = 0
let mediaRevealTimer = 0
let mediaRevealFrameCallback = 0
let mediaRevealVideo: HTMLVideoElement | null = null
let mediaRevealVersion = 0
let flushPlayerProgress: (() => void) | null = null
let removePlayerProgressListeners: (() => void) | null = null
interface PlaybackSnapshot { currentTime: number; shouldPlay: boolean; volume: number; muted: boolean; rate: number }
let pendingPlaybackResume: PlaybackSnapshot | null = null
let lastPlaybackState: PlaybackSnapshot | null = null
let pendingPlaybackNotice = ''
let detailRequestController: AbortController | null = null
let episodesRequestController: AbortController | null = null

/** 从 HLS 清单中提取可展示的清晰度，并为重复高度保留最高码率。 */
function getHlsQualityLevels(hls: Hls) {
  const levelsByHeight = new Map<number, { index: number; height: number; bitrate: number }>()
  hls.levels.forEach((level, index) => {
    const height = Number(level.height)
    if (!Number.isFinite(height) || height <= 0) return
    const bitrate = Number(level.bitrate) || 0
    const current = levelsByHeight.get(height)
    if (!current || bitrate > current.bitrate) {
      levelsByHeight.set(height, { index, height, bitrate })
    }
  })
  return [...levelsByHeight.values()].sort((left, right) => right.height - left.height)
}

/** 当前清晰度档位采样：生效档位、阶梯最高档、升档带宽需求与限制条件（VQ-30）。 */
function readClarityObservation(hls: Hls): ClarityObservation {
  const levels = getHlsQualityLevels(hls)
  const index = hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel
  const level = index >= 0 ? hls.levels[index] : undefined
  const height = Number(level?.height) || 0
  const highest = levels[0]
  // 比当前档更高的最近一档：升档需要的带宽按播放器的升档系数换算，说明才能与自适应判定一致。
  const next = levels.filter(candidate => candidate.height > height).at(-1)
  const upFactor = Number(hls.config.abrBandWidthUpFactor) || 1
  const capped = hls.autoLevelCapping
  const bandwidthBps = Number(hls.bandwidthEstimate)
  return {
    levelIndex: level ? index : null,
    height,
    bitrate: Number(level?.bitrate) || 0,
    highestHeight: Number(highest?.height) || 0,
    highestBitrate: Number(highest?.bitrate) || 0,
    nextHeight: next?.height ?? 0,
    nextRequiredBps: next ? next.bitrate / upFactor : 0,
    mode: hls.manualLevel >= 0 ? 'manual' : 'auto',
    capHeight: capped >= 0 ? Number(hls.levels[capped]?.height) || -1 : -1,
    bandwidthBps: Number.isFinite(bandwidthBps) && bandwidthBps > 0 ? bandwidthBps : 0,
    startupFallback: startupQualityFallbackNote?.reason ?? '',
  }
}

/**
 * 采样画质窗口（VQ-30）：档位变化时提示「当前非最高档及原因」，
 * 窗口记录同时保留清晰度档位与渲染 Worker 的成本证据，供菜单里的可查询说明使用。
 */
function sampleQualityWindow(player: Artplayer, hls: Hls, requestVersion: number) {
  const observability = qualityObservability
  if (!observability || requestVersion !== playerRequestVersion || artHls !== hls) return
  const observation = readClarityObservation(hls)
  if (startupQualityFallbackNote && observation.levelIndex !== startupQualityFallbackNote.level) {
    startupQualityFallbackNote = null
  }
  const notice = observability.observeClarity(observation, performance.now())
  if (notice) player.notice.show = notice
}

/** 起播清晰度记忆的超时看门与本次尝试状态，只在播放器会话内有效。 */
let startupQualityTimer = 0
let startupQualityAttempt: { source: string; mode: StartupQualityRecord['mode']; index: number } | null = null
/** 记忆档位回落说明：只在下一次档位变化前的窗口里作为非最高档原因上报。 */
let startupQualityFallbackNote: { reason: string; level: number } | null = null

function clearStartupQualityTimer() {
  if (!startupQualityTimer) return
  window.clearTimeout(startupQualityTimer)
  startupQualityTimer = 0
}

/** 放弃本次记忆尝试；作废存储条目由调用方决定。 */
function abandonStartupQuality() {
  clearStartupQualityTimer()
  const attempt = startupQualityAttempt
  startupQualityAttempt = null
  return attempt
}

/** 记忆档位已经出画或已缓冲：本次记忆判定为有效，撤掉回落看门。 */
function confirmStartupQuality(level?: number) {
  const attempt = startupQualityAttempt
  if (!attempt || (level !== undefined && level !== attempt.index)) return
  clearStartupQualityTimer()
  startupQualityAttempt = null
}

/** 记忆档位在超时内没有出画：作废记忆并回到低档，避免首帧继续等待高码率分片。 */
function fallbackStartupQuality(hls: Hls, player: Artplayer, requestVersion: number) {
  const attempt = abandonStartupQuality()
  if (!attempt || requestVersion !== playerRequestVersion || artHls !== hls) return
  clearStartupQuality(attempt.source, attempt.mode)
  startupQualityFallbackNote = { reason: '记忆档位未出画，已回落低档', level: 0 }
  hls.startLevel = 0
  hls.stopLoad()
  hls.nextLoadLevel = 0
  hls.startLoad(Math.max(0, player.video.currentTime))
}

/** 记忆档位致命失败：作废存储条目，下次起播按低档起步。 */
function invalidateStartupQuality() {
  const attempt = abandonStartupQuality()
  if (attempt) clearStartupQuality(attempt.source, attempt.mode)
}

/**
 * 起播清晰度记忆：命中同一地址的历史档位时先按该档取首片，再交回带宽自适应。
 * 受窗口降档上限约束时取上限档；阶梯里找不到该高度或结果落在低档时，保持原有低档起步。
 */
function applyStartupQuality(hls: Hls, source: string, record: StartupQualityRecord | null, player: Artplayer, requestVersion: number) {
  abandonStartupQuality()
  if (!record) return
  const matched = matchStartupQualityIndex(hls.levels, record)
  const capped = hls.autoLevelCapping
  const index = capped >= 0 ? Math.min(matched, capped) : matched
  if (index <= 0) return
  hls.startLevel = index
  startupQualityAttempt = { source, mode: record.mode, index }
  startupQualityTimer = window.setTimeout(
    () => fallbackStartupQuality(hls, player, requestVersion), STARTUP_QUALITY_FALLBACK_MS)
}

/** 记录正在播放的实际档位，供下次起播直接使用。 */
function recordStartupQualityLevel(hls: Hls, source: string, levelIndex: number) {
  const level = hls.levels[levelIndex]
  const height = Number(level?.height) || 0
  if (!level || height <= 0) return false
  saveStartupQuality(source, {
    ladder: qualityLadderSignature(hls.levels),
    mode: 'auto',
    index: levelIndex,
    height,
    bitrate: Number(level.bitrate) || 0,
  })
  return true
}

/** 将 HLS level 接入 ArtPlayer 原生 quality 控件，切换时不重建播放器。 */
function mountHlsQuality(player: Artplayer, hls: Hls, requestVersion: number, source: string) {
  const levels = getHlsQualityLevels(hls)
  if (levels.length < 2) return

  // ArtPlayer 的原生 selector 会负责菜单、选中态和控制栏布局，这里只接入 HLS 切换动作。
  player.controls.update({
    name: 'quality',
    position: 'right',
    index: 10,
    style: { marginRight: '10px' },
    html: '自动',
    selector: [
      { html: '自动', value: 'auto', default: true },
      ...levels.map((level) => ({ html: `${level.height}P`, value: level.index })),
      // VQ-30 可查询说明：不改变档位，只解释当前为什么不是最高清晰度。
      { html: '当前清晰度说明', value: 'explain' },
    ],
    onSelect(item) {
      if (String(item.value) === 'explain') {
        const current = hls.manualLevel >= 0 ? String(hls.manualLevel) : 'auto'
        // 说明项不是档位：恢复档位的选中态，控件标签也回到实际档位。
        player.template.$player.querySelectorAll<HTMLElement>('.art-control-quality .art-selector-item')
          .forEach(node => node.classList.toggle('art-current', node.dataset.value === current))
        player.notice.show = qualityObservability?.explain() || '当前清晰度档位信息尚不可用'
        return current === 'auto' ? '自动' : `${Number(hls.levels[Number(current)]?.height) || 0}P`
      }
      if (requestVersion === playerRequestVersion && artHls === hls) {
        hls.nextLevel = item.value === 'auto' ? -1 : Number(item.value)
        // 手动档位视为强偏好；选择自动则交回带宽判定，只清掉手动记忆。
        if (item.value === 'auto') clearStartupQuality(source, 'manual')
        else {
          const level = levels.find(candidate => candidate.index === Number(item.value))
          if (level) {
            saveStartupQuality(source, {
              ladder: qualityLadderSignature(hls.levels),
              mode: 'manual',
              index: level.index,
              height: level.height,
              bitrate: level.bitrate,
            })
          }
        }
        sampleQualityWindow(player, hls, requestVersion)
      }
      player.notice.show = `切换清晰度: ${item.html}`
      return item.html
    },
  })
}

function updateAnime4KControl(player: Artplayer) {
  const effectiveFps = interpolationStats?.nextTargetFps ?? interpolationTarget.value
  const effectiveQuality = anime4KEnabled.value ? interpolationStats?.effectiveProfile ?? anime4KProfile.value : 'off'
  player.controls.update({
    name: 'interpolation', position: 'right', index: 8, html: '帧率',
    selector: [
      { html: '原始', value: 'off', default: !interpolationEnabled.value },
      { html: '自动', value: 'auto', default: interpolationEnabled.value && effectiveFps === 'auto' },
      ...FRAME_RATE_OPTIONS.map(value => ({
        html: `${value} FPS`,
        value,
        default: interpolationEnabled.value && effectiveFps === value,
      })),
    ],
    onSelect(item) {
      interpolationEnabled.value = item.value !== 'off'
      if (interpolationEnabled.value) interpolationTarget.value = item.value as FrameRateTarget
      savePlaybackPreferences({ frameRate: interpolationEnabled.value ? interpolationTarget.value : 'off' })
      void applyAnime4K(player, playerRequestVersion)
      return '帧率'
    },
  })
  player.controls.update({
    name: 'anime4k',
    position: 'right',
    index: 9,
    html: '画质',
    selector: [
      { html: '关闭', value: 'off', default: effectiveQuality === 'off' },
      ...Object.entries(ANIME4K_PROFILE_LABELS).map(([value, html]) => ({
        html,
        value,
        default: value === effectiveQuality,
      })),
    ],
    onSelect(item) {
      const value = String(item.value)
      if (value === 'off') {
        anime4KEnabled.value = false
        savePlaybackPreferences({ quality: 'off' })
        void applyAnime4K(player, playerRequestVersion)
        return '画质'
      }
      anime4KEnabled.value = true
      anime4KProfile.value = value as Anime4KProfile
      savePlaybackPreferences({ quality: anime4KProfile.value })
      void applyAnime4K(player, playerRequestVersion)
      return '画质'
    },
  })
}

const local = computed(() => animeCatalogMap[slug.value])

/** 剧场版只有一部正片，多个媒体记录代表语言或播放线路，而不是多集内容。 */
const isMovie = computed(() => detail.value?.type === '剧场版' || display.value?.tags.includes('剧场版') === true)

/** 根据作品类型切换播放器区标题，避免把电影线路误称为选集。 */
const playerSectionTitle = computed(() => isMovie.value ? '正片播放' : '选集播放')

/** 根据作品类型提供准确的列表辅助说明。 */
const playbackListLabel = computed(() => isMovie.value ? '语言与播放线路' : '剧集列表')

/**
 * 电影优先从来源标题识别语言，无法识别时显示线路编号；
 * 连载作品继续使用接口剧集标题和集数。
 */
function playbackOptionLabel(episode: AnimeEpisode, index: number): string {
  if (!isMovie.value) return episode.title || `第 ${episode.episodeNo} 集`
  const sourceText = `${episode.title ?? ''} ${episode.sourceLabel ?? ''}`
  if (/国语|国配|普通话|中文配音/.test(sourceText)) return '国语'
  if (/日语|日文|原声/.test(sourceText)) return '日语原声'
  if (/粤语|粤配/.test(sourceText)) return '粤语'
  if (/英语|英文/.test(sourceText)) return '英语'
  return episodes.value.length === 1 ? '播放正片' : `播放线路 ${index + 1}`
}

/** 兼容旧接口的单地址记录，并去掉外部页面重复声明的线路。 */
function playbackOptionsOf(episode?: AnimeEpisode): AnimePlaybackOption[] {
  if (!episode?.playbackUrl) return []
  const options: AnimePlaybackOption[] = []
  const seen = new Set<string>()
  for (const option of episode.playbackOptions ?? []) {
    if (!option?.url || seen.has(option.url)) continue
    seen.add(option.url)
    options.push(option)
  }
  if (!seen.has(episode.playbackUrl)) {
    options.unshift({ url: episode.playbackUrl, mimeType: episode.mimeType, label: episode.sourceLabel })
  }
  return options
}

function playbackSourceLabel(option: AnimePlaybackOption, index: number): string {
  const matchingEpisode = episodes.value.find((episode) => episode.playbackUrl === option.url)
  const episodeLabel = matchingEpisode?.title?.trim()
  if (episodeLabel && /国语|国配|普通话|中文配音|日语|日文|原声|粤语|粤配|英语|英文/.test(episodeLabel)) {
    if (/日语|日文|原声/.test(episodeLabel)) return '日语原声'
    return episodeLabel
  }
  return option.label?.trim() || `线路 ${index + 1}`
}

/** 当前选中的剧集；默认选择接口返回的第一集。 */
const selectedEpisode = computed(() =>
  episodes.value.find((episode) => episode.id === selectedEpisodeId.value) ?? episodes.value[0],
)

const playbackOptions = computed(() => rankPlaybackOptions(playbackOptionsOf(selectedEpisode.value), playbackKey.value, readPlaybackPreferences().language))
const showEpisodeList = computed(() => {
  if (episodes.value.length < 2 || playbackOptions.value.length < 2) return true
  const sourceUrls = new Set(playbackOptions.value.map((option) => option.url))
  return !episodes.value.every((episode) => sourceUrls.has(episode.playbackUrl))
})
const activePlaybackOption = computed(() => {
  const options = playbackOptions.value
  return options.find((option) => option.url === selectedPlaybackUrl.value) ?? options[0]
})
const activePlaybackLabel = computed(() => {
  const option = activePlaybackOption.value
  if (!option) return ''
  const index = Math.max(0, playbackOptions.value.findIndex(candidate => candidate.url === option.url))
  return playbackSourceLabel(option, index)
})
const activePlaybackUrl = computed(() => activePlaybackOption.value?.url ?? '')
const activePlaybackIsHls = computed(() => {
  const option = activePlaybackOption.value
  return Boolean(option && (option.mimeType?.includes('mpegurl') || option.url.toLowerCase().includes('.m3u8')))
})

/** HLS 和普通视频统一交给 ArtPlayer，HTML 外部页只提供来源入口。 */
const isVideoElement = computed(() => {
  const option = activePlaybackOption.value
  return Boolean(option && (option.mimeType?.startsWith('video/') || activePlaybackIsHls.value))
})
// 来源页未声明直连媒体时，后端会保留白名单来源中的 iframe 播放器地址。
const isExternalFrame = computed(() => activePlaybackOption.value?.mimeType === 'text/html')

const display = computed(() => {
  if (detail.value) {
    return {
      title: detail.value.title,
      subtitle: detail.value.originalTitle,
      tags: detail.value.tags ?? [],
      status: detail.value.status,
      description: detail.value.summary ?? '',
      update: detail.value.updateText ?? '',
      cover: resolveAssetUrl(animeCatalogMap[String(detail.value.id)]?.cover) ?? resolveAssetUrl(detail.value.coverUrl && !detail.value.coverUrl.includes('anime-placeholder') ? detail.value.coverUrl : undefined) ?? '/covers/mushoku-oad.svg',
      characters: detail.value.characters ?? [],
      similar: (detail.value.similar ?? []).map((item) => ({
        id: String(item.id),
        title: item.title,
        score: item.score,
        cover: resolveAssetUrl(animeCatalogMap[String(item.id)]?.cover) ?? resolveAssetUrl(item.coverUrl && !item.coverUrl.includes('anime-placeholder') ? item.coverUrl : undefined) ?? '/covers/mushoku-oad.svg',
      })),
      schedule: detail.value.schedule ?? [],
    }
  }
  if (local.value) {
    return {
      title: local.value.title,
      subtitle: local.value.subtitle,
      tags: local.value.tags,
      status: local.value.status,
      description: local.value.description,
      update: local.value.update,
      cover: local.value.cover,
      characters: [],
      similar: [],
      schedule: [],
    }
  }
  return null
})

/** 将只读外部预览转换成详情页可复用的展示模型，不参与收藏和观看历史。 */
function previewDetail(preview: AnimeUrlPreviewResult): AnimeDetail {
  return {
    id: 0,
    title: preview.title,
    originalTitle: preview.originalTitle,
    type: preview.type,
    year: preview.year,
    status: '外部预览',
    coverUrl: preview.coverUrl,
    tags: preview.tags ?? [],
    updateText: preview.updateText ?? '',
    summary: preview.summary ?? '',
    characters: [],
    similar: [],
    schedule: [],
    source: '外部预览',
  }
}

/** 根据 slug 或外部来源地址加载详情，失败时使用本地目录模型。 */
async function load() {
  detailRequestController?.abort()
  const controller = new AbortController()
  detailRequestController = controller
  loading.value = true
  failed.value = false
  previewError.value = ''
  attemptedRoutes.clear()
  lastPlaybackState = null
  try {
    if (isExternalPreview.value) {
      const alternatives = Array.isArray(route.query.alternatives) ? route.query.alternatives : [route.query.alternatives]
      const sources = [...new Set([previewSourceUrl.value, ...alternatives.filter((value): value is string => typeof value === 'string')])].slice(0, 4)
      let accepted: AnimeUrlPreviewResult | undefined
      const receive = (preview: AnimeUrlPreviewResult) => {
        controller.signal.throwIfAborted()
        const playable = normalizePlaybackEpisodes(preview.episodes).filter(episode =>
          episode.mimeType === 'text/html' || episode.mimeType?.startsWith('video/')
          || episode.mimeType?.includes('mpegurl') || /\.m3u8(?:$|\?)/i.test(episode.playbackUrl))
        if (!playable.length) throw new Error('该来源没有可播放的视频资源')
        if (!accepted) {
          accepted = { ...preview, episodes: playable }
          detail.value = previewDetail(preview)
          episodes.value = playable
          selectedEpisodeId.value = playable[0]!.id
          selectedPlaybackUrl.value = ''
          episodesLoading.value = false
          episodesFailed.value = false
          loading.value = false
          return
        }
        // Append alternatives in place so a late response never remounts a playing video.
        if (accepted.type !== '剧场版' || episodes.value.length !== 1 || playable.length !== 1 || preview.title !== accepted.title) return
        const episode = episodes.value[0]!
        const options = new Map((episode.playbackOptions ?? []).map(option => [option.url, option]))
        const next = playable[0]!
        for (const option of [{ url: next.playbackUrl, mimeType: next.mimeType, label: next.title || next.sourceLabel }, ...(next.playbackOptions ?? [])]) {
          if (option.url !== episode.playbackUrl && !options.has(option.url)) options.set(option.url, option)
        }
        episode.playbackOptions = [...options.values()]
        if (playerError.value) advancePlaybackOption('已找到备用线路，正在切换')
      }
      const results = await Promise.allSettled(sources.map(async source => {
        let preview: AnimeUrlPreviewResult
        try { preview = await animeApi.previewUrl(source, { signal: controller.signal, timeout: 20_000, retries: 0 }) }
        catch (error) {
          if (!(error instanceof ApiError) || error.code !== 5002) throw error
          controller.signal.throwIfAborted()
          preview = await animeApi.previewUrl(source, { signal: controller.signal, timeout: 15_000, retries: 0 })
        }
        receive(preview)
      }))
      controller.signal.throwIfAborted()
      if (!accepted) throw results.find(result => result.status === 'rejected')?.reason ?? new Error('所有来源暂不可用')
    } else {
      const slugValue = slug.value
      const mappedId = /^\d+$/.test(slugValue) ? Number(slugValue) : undefined
      if (mappedId === undefined) {
        // 本地目录作品（后端暂无对应数据面）：直接本地展示，不发起接口请求
        detail.value = null
      } else {
        void loadEpisodes(mappedId)
        const nextDetail = await animeApi.detail(mappedId, { signal: controller.signal })
        controller.signal.throwIfAborted()
        detail.value = nextDetail
        if (detail.value) {
          void recordHistory(detail.value.id)
          void refreshFavorite(detail.value.id)
        }
      }
    }
  } catch (cause) {
    if (isAbortError(cause)) return
    episodesRequestController?.abort()
    failed.value = true
    previewError.value = cause instanceof Error ? cause.message : '来源解析失败，请稍后重试'
    detail.value = null
  } finally {
    if (detailRequestController === controller) {
      detailRequestController = null
      loading.value = false
    }
  }
}

watch(
  () => `${slug.value}|${previewSourceUrl.value}|${JSON.stringify(route.query.alternatives)}`,
  () => {
    detailRequestController?.abort()
    episodesRequestController?.abort()
    detail.value = null
    episodesRequestVersion.value += 1
    episodes.value = []
    selectedEpisodeId.value = null
    selectedPlaybackUrl.value = ''
    pendingPlaybackResume = null
    pendingPlaybackNotice = ''
    episodesLoading.value = false
    episodesFailed.value = false
    playerLoading.value = false
    playerError.value = false
    episodesUsingCache.value = false
    void load()
  },
  { immediate: true },
)

/** 刷新当前用户对作品的收藏状态，匿名或失败时保持本地状态。 */
async function refreshFavorite(animeId: number) {
  const requestVersion = ++favoriteStateVersion.value
  try {
    const result = await favoriteApi.status(animeId)
    // 只接受当前作品、当前版本的结果，避免详情加载与点击收藏产生竞态覆盖。
    if (requestVersion === favoriteStateVersion.value) {
      collected.value = result.favorite
    }
  } catch {
    if (requestVersion === favoriteStateVersion.value) {
      collected.value = false
    }
  }
}

/** 读取剧集媒体元数据；播放列表失败不阻断作品详情展示。 */
async function loadEpisodes(animeId: number) {
  episodesRequestController?.abort()
  const controller = new AbortController()
  episodesRequestController = controller
  const requestVersion = ++episodesRequestVersion.value
  const cached = readCachedEpisodes(animeId)
  if (cached?.length) {
    episodes.value = cached
    selectedEpisodeId.value = readSelectedEpisodeId(animeId) ?? cached[0].id
    episodesUsingCache.value = true
    playerError.value = false
  }
  episodesLoading.value = !cached?.length
  episodesFailed.value = false
  playerError.value = false
  try {
    const result = await animeApi.episodes(animeId, { signal: controller.signal })
    // 路由快速切换时丢弃旧作品的迟到响应，避免播放器串集。
    if (requestVersion !== episodesRequestVersion.value) return
    const normalized = normalizePlaybackEpisodes(result)
    const currentId = selectedEpisodeId.value
    const remembered = readSelectedEpisodeId(animeId)
    const nextId = normalized.some(episode => episode.id === currentId) ? currentId
      : normalized.some(episode => episode.id === remembered) ? remembered : normalized[0]?.id ?? null
    const refreshed = normalized.find(episode => episode.id === nextId)
    if (artPlayer && nextId === currentId && !playbackOptionsOf(refreshed).some(option => option.url === activePlaybackUrl.value)) {
      rememberPlaybackPosition()
    }
    episodes.value = normalized
    writeCachedEpisodes(animeId, normalized)
    selectedEpisodeId.value = nextId
    episodesUsingCache.value = false
  } catch (cause) {
    if (isAbortError(cause)) return
    if (requestVersion !== episodesRequestVersion.value) return
    if (cached?.length) {
      episodes.value = cached
      selectedEpisodeId.value = readSelectedEpisodeId(animeId) ?? cached[0].id
      episodesUsingCache.value = true
    } else {
      episodes.value = []
      selectedEpisodeId.value = null
      episodesFailed.value = true
    }
  } finally {
    if (requestVersion === episodesRequestVersion.value && episodesRequestController === controller) {
      episodesRequestController = null
      episodesLoading.value = false
    }
  }
}

/** 切换剧集时重置播放器错误状态，允许同一播放器重新加载。 */
function selectEpisode(episode: AnimeEpisode) {
  if (episode.id === selectedEpisode.value?.id) return
  attemptedRoutes.clear()
  lastPlaybackState = null
  flushPlayerProgress?.()
  pendingPlaybackResume = null
  pendingPlaybackNotice = ''
  selectedEpisodeId.value = episode.id
  selectedPlaybackUrl.value = episode.playbackUrl
  if (detail.value && !isExternalPreview.value) writeSelectedEpisodeId(detail.value.id, episode.id)
  playerError.value = false
}

/** 记录换线前的播放位置，避免自动或手动切换线路后从头播放。 */
function rememberPlaybackPosition() {
  const video = artPlayer?.video
  if (!video) return
  if (video.readyState < 2 && lastPlaybackState) {
    pendingPlaybackResume = { ...lastPlaybackState }
    return pendingPlaybackResume
  }
  pendingPlaybackResume = {
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    shouldPlay: !video.paused && !video.ended,
    volume: video.volume, muted: video.muted, rate: video.playbackRate,
  }
  return pendingPlaybackResume
}

/** 手动或自动切换到当前剧集的下一条备用线路。 */
function advancePlaybackOption(notice = '') {
  const options = playbackOptions.value
  if (options.length < 2) return false
  attemptedRoutes.add(activePlaybackUrl.value)
  const language = playbackLanguage(activePlaybackOption.value?.label) || readPlaybackPreferences().language
  const next = rankPlaybackOptions(options, playbackKey.value, language).find(option => !attemptedRoutes.has(option.url)
    && (!language || !playbackLanguage(option.label) || playbackLanguage(option.label) === language))
  if (!next) return false
  if (!pendingPlaybackResume) rememberPlaybackPosition()
  if (pendingPlaybackResume && pendingPlaybackResume.currentTime === 0 && isExternalPreview.value
    && artPlayer && artPlayer.video.readyState < 2) pendingPlaybackResume.shouldPlay = true
  playbackPhase.value = '正在切换备用线路'
  pendingPlaybackNotice = notice
  selectedPlaybackUrl.value = next.url
  playerError.value = false
  return true
}

function selectPlaybackOption(option: AnimePlaybackOption) {
  if (option.url === activePlaybackUrl.value) return
  rememberPlaybackPosition()
  attemptedRoutes.clear()
  const language = playbackLanguage(option.label)
  if (language) savePlaybackPreferences({ language })
  pendingPlaybackNotice = ''
  selectedPlaybackUrl.value = option.url
  playerError.value = false
}

function stopAnime4K() {
  anime4KRequestVersion += 1
  anime4KSession?.stop()
  anime4KSession = null
  interpolationStats = null
  anime4KState.value = 'idle'
}

/** 释放 ArtPlayer 和 HLS 实例，避免切换剧集后继续请求上一集的分片。 */
function destroyVideoPlayer() {
  interpolationOpen.value = false
  flushPlayerProgress?.()
  flushPlayerProgress = null
  removePlayerProgressListeners?.()
  removePlayerProgressListeners = null
  stopAnime4K()
  if (artPlayer) releaseInterpolationAudio(artPlayer.video)
  if (mediaLoadTimer) {
    window.clearTimeout(mediaLoadTimer)
    mediaLoadTimer = 0
  }
  clearStallRecovery()
  clearPlayerMediaReveal()
  abandonStartupQuality()
  qualityObservability = null
  startupQualityFallbackNote = null
  artHls?.destroy()
  artHls = null
  artPlayer?.destroy()
  artPlayer = null
}

async function applyAnime4K(player: Artplayer, requestVersion: number) {
  const adaptationNotice = new AdaptationNotice()
  const anime4KVersion = ++anime4KRequestVersion
  anime4KSession?.stop()
  anime4KSession = null
  interpolationStats = null

  if (!anime4KEnabled.value && !interpolationEnabled.value) {
    anime4KState.value = 'idle'
    updateAnime4KControl(player)
    return
  }

  anime4KState.value = 'starting'
  updateAnime4KControl(player)
  const onError = (message: string) => {
    if (requestVersion !== playerRequestVersion || anime4KVersion !== anime4KRequestVersion) return
    anime4KEnabled.value = false
    interpolationEnabled.value = false
    stopAnime4K()
    anime4KState.value = 'failed'
    updateAnime4KControl(player)
    player.notice.show = message
  }
  try {
    const onStats = (stats: InterpolationStats) => {
      if (requestVersion !== playerRequestVersion || anime4KVersion !== anime4KRequestVersion) return
      // 画质窗口（VQ-30）合并本窗口的落后帧、分析宽度与回退历史，供档位说明自证原因。
      qualityObservability?.observeStats(stats)
      // 帧率与档位提示只属于补帧路径：仅增强路径移入 Worker 后不引入新的用户可见文案（VQ-28）。
      if (interpolationEnabled.value) {
        const notice = adaptationNotice.next(interpolationStats, stats, performance.now())
        if (notice) player.notice.show = notice
      }
      interpolationStats = stats
      // Keep the existing open menu and its listeners while reflecting the effective adaptive rate.
      const selected = String(interpolationEnabled.value ? stats.nextTargetFps : 'off')
      player.template.$player.querySelectorAll<HTMLElement>('.art-control-interpolation .art-selector-item').forEach(item => {
        item.classList.toggle('art-current', item.dataset.value === selected)
      })
      player.template.$player.querySelectorAll<HTMLElement>('.art-control-anime4k .art-selector-item').forEach(item => {
        item.classList.toggle('art-current', item.dataset.value === stats.effectiveProfile)
      })
    }
    const session: Anime4KSession = interpolationEnabled.value
      ? await startRealtimeInterpolation(player.video, {
        profile: anime4KProfile.value,
        enhance: anime4KEnabled.value,
        targetFps: interpolationTarget.value,
        interpolationDelay: readPlaybackPreferences().interpolationDelay,
        presentationAlignment: readPlaybackPreferences().presentationAlignment,
        onStats,
        onError,
      })
      : await startAnime4KEnhancement(player.video, {
        profile: anime4KProfile.value,
        path: readPlaybackPreferences().enhancementPath,
        onStats,
        onError,
      })
    if (requestVersion !== playerRequestVersion || anime4KVersion !== anime4KRequestVersion) {
      session.stop()
      return
    }
    anime4KSession = session
    anime4KState.value = 'active'
    updateAnime4KControl(player)
  } catch (error) {
    if (requestVersion !== playerRequestVersion || anime4KVersion !== anime4KRequestVersion) return
    anime4KEnabled.value = false
    interpolationEnabled.value = false
    anime4KState.value = 'failed'
    updateAnime4KControl(player)
    player.notice.show = error instanceof Error ? error.message : '当前设备或视频源暂不支持运动补帧'
  }
}

/**
 * 挂载 ArtPlayer；视频源统一使用 ArtPlayer 的标准控制栏和设置面板。
 * HLS 通过 customType 交给 hls.js，普通视频使用浏览器媒体能力。
 */
async function mountVideoPlayer() {
  destroyVideoPlayer()
  const requestVersion = ++playerRequestVersion
  // 画质窗口按播放器会话重建：切换剧集或线路后不沿用上一段的档位与成本证据。
  const qualityWindows = new QualityObservability()
  qualityObservability = qualityWindows
  playerLoading.value = false
  await nextTick()
  if (requestVersion !== playerRequestVersion) return
  const episode = selectedEpisode.value
  const container = playerContainer.value
  if (!episode || !container || !isVideoElement.value) return
  const source = activePlaybackUrl.value
  const isHlsSource = activePlaybackIsHls.value
  if (!source) return
  selectedPlaybackUrl.value = source
  playerLoading.value = true
  if (!pendingPlaybackNotice) playbackPhase.value = '正在加载视频'
  warmMediaSource(source)

  try {
    // 播放器只在详情页真正出现且存在可播放媒体时加载，避免阻塞普通页面切换。
    const artplayerModule = import('artplayer')
    const hlsModule = isHlsSource ? import('hls.js') : Promise.resolve(undefined)
    const [{ default: Artplayer }, HlsModule] = await Promise.all([artplayerModule, hlsModule])
    const HlsConstructor = HlsModule?.default
    if (requestVersion !== playerRequestVersion) return
    useSmoothProgress(Artplayer)
    const player = new Artplayer({
      id: `sanye-anime-${detail.value?.id ?? 'unknown'}`,
      container,
      url: source,
      type: isHlsSource ? 'm3u8' : '',
      poster: display.value?.cover,
      theme: '#e77d65',
      lang: 'zh-cn',
      volume: pendingPlaybackResume?.volume ?? readPlaybackPreferences().volume,
      // 浏览器只稳定允许静音自动播放；外部“直接观看”应在解析完成后立即开始。
      autoplay: pendingPlaybackResume?.shouldPlay ?? isExternalPreview.value,
      muted: pendingPlaybackResume?.muted ?? isExternalPreview.value,
      autoSize: false,
      autoMini: false,
      // 续播由按剧集区分的 sanye 缓存负责，避免 ArtPlayer 以作品 id 混用不同剧集的时间。
      autoPlayback: false,
      backdrop: true,
      flip: true,
      setting: true,
      screenshot: true,
      aspectRatio: true,
      hotkey: true,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      playbackRate: true,
      miniProgressBar: true,
      lock: true,
      gesture: true,
      fastForward: true,
      autoOrientation: true,
      airplay: true,
      playsInline: true,
      mutex: true,
      moreVideoAttr: {
        crossOrigin: 'anonymous',
        playsInline: true,
        preload: isHlsSource ? 'auto' : 'metadata',
      },
      customType: isHlsSource
        ? {
            m3u8(video, url, art) {
              if (requestVersion !== playerRequestVersion) return
              if (!HlsConstructor) {
                markPlayerError()
                return
              }
              // 优先使用 hls.js 以统一提供清晰度切换；不支持 MSE 时才回退浏览器原生 HLS。
              const hlsSupported = HlsConstructor.isSupported()
              if (!hlsSupported && video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url
                video.load()
                return
              }
              if (!hlsSupported) {
                markPlayerError()
                return
              }
              const fragmentCache = createFragmentCache(HlsConstructor, () => hls.latestLevelDetails?.live === false)
              const startupQuality = readStartupQuality(url)
              const hls: Hls = new HlsConstructor({
                fLoader: fragmentCache.Loader,
                // 起播由本地清晰度记忆接管：清单解析后先定档，再显式开始加载。
                autoStartLoad: false,
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90,
                maxBufferLength: 90,
                maxMaxBufferLength: 180,
                // 先用低档尽快出首帧，再按实测带宽升档，减少高码率首片阻塞。
                startLevel: 0,
                capLevelToPlayerSize: true,
                // 带宽存在短时抖动时不要立即升档，避免清晰度来回跳变导致重新缓冲。
                abrBandWidthFactor: 0.9,
                abrBandWidthUpFactor: 0.85,
                abrEwmaFastVoD: 4,
                abrEwmaSlowVoD: 15,
                abrEwmaFastLive: 3,
                abrEwmaSlowLive: 9,
                maxStarvationDelay: 4,
                maxLoadingDelay: 4,
                manifestLoadingTimeOut: 12_000,
                levelLoadingTimeOut: 12_000,
                fragLoadingTimeOut: 20_000,
                manifestLoadingMaxRetry: 2,
                manifestLoadingRetryDelay: 1_000,
                manifestLoadingMaxRetryTimeout: 8_000,
                levelLoadingMaxRetry: 3,
                levelLoadingRetryDelay: 1_000,
                levelLoadingMaxRetryTimeout: 8_000,
                fragLoadingMaxRetry: 4,
                fragLoadingRetryDelay: 1_000,
                fragLoadingMaxRetryTimeout: 10_000,
                startFragPrefetch: true,
              })
              let networkRetries = 0
              let mediaRetries = 0
              artHls = hls
              art.hls = hls
              hls.on(HlsConstructor.Events.DESTROYING, fragmentCache.clear)
              hls.on(HlsConstructor.Events.MEDIA_ATTACHED, () => {
                if (requestVersion === playerRequestVersion) hls.loadSource(url)
              })
              hls.on(HlsConstructor.Events.MANIFEST_PARSED, () => {
                if (requestVersion !== playerRequestVersion) return
                mountHlsQuality(player, hls, requestVersion, url)
                applyStartupQuality(hls, url, startupQuality, player, requestVersion)
                sampleQualityWindow(player, hls, requestVersion)
                hls.startLoad()
              })
              // 档位切换时立即采样：瞬时提示不必等到下一次 timeupdate。
              hls.on(HlsConstructor.Events.LEVEL_SWITCHED, () => {
                if (requestVersion !== playerRequestVersion) return
                sampleQualityWindow(player, hls, requestVersion)
              })
              hls.on(HlsConstructor.Events.FRAG_BUFFERED, (_event, data) => {
                if (requestVersion === playerRequestVersion) confirmStartupQuality(data.frag.level)
              })
              hls.on(HlsConstructor.Events.ERROR, (_event, data) => {
                if (!data.fatal || requestVersion !== playerRequestVersion) return
                // 记忆档位致命失败时作废记录，下次起播回到低档起步。
                invalidateStartupQuality()
                if (data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR) {
                  // 只重试一次，持续 DNS/CDN 失败时交给备用线路处理，避免播放器无限空转。
                  if (networkRetries < 1) {
                    networkRetries += 1
                    hls.startLoad()
                  } else {
                    markPlayerError('当前线路网络异常，已尝试切换备用线路')
                  }
                } else if (data.type === HlsConstructor.ErrorTypes.MEDIA_ERROR) {
                  if (mediaRetries < 1) {
                    mediaRetries += 1
                    hls.recoverMediaError()
                  } else {
                    markPlayerError('当前线路解码异常，已尝试切换备用线路')
                  }
                } else {
                  markPlayerError('当前线路不可用，已尝试切换备用线路')
                }
              })
              hls.attachMedia(video)
              installHlsSeekControl(video, hls)
            },
          }
        : {},
    }, () => {
      // ArtPlayer 构造完成不代表清单已经可用，加载状态由媒体事件和超时统一判断。
    })
    artPlayer = player
    // 诊断通道：把按窗口汇总的画质记录（VQ-30）挂到播放器实例上，供自证与自动化读取，不进入界面。
    const diagnostics = player as Artplayer & { sanyeQualityWindows?: readonly QualityWindow[] }
    diagnostics.sanyeQualityWindows = qualityWindows.history
    installSeekControl(player)
    installPlaybackControl(player)
    mediaLoadTimer = window.setTimeout(() => {
      if (requestVersion === playerRequestVersion && player.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        markPlayerError()
      }
    }, PLAYER_STARTUP_TIMEOUT_MS)
    updateAnime4KControl(player)
    let hasAppliedInitialResume = false
    player.video.addEventListener('loadedmetadata', () => {
      if (requestVersion !== playerRequestVersion || hasAppliedInitialResume) return
      hasAppliedInitialResume = true
      const resume = pendingPlaybackResume
      pendingPlaybackResume = null
      player.video.playbackRate = resume?.rate ?? readPlaybackPreferences().rate
      if (resume) {
        player.video.volume = resume.volume
        player.video.muted = resume.muted
        const canResume = resume.currentTime > 0
          && (!Number.isFinite(player.video.duration) || resume.currentTime < player.video.duration - 1)
        if (canResume) player.video.currentTime = resume.currentTime
        if (resume.shouldPlay) void player.video.play().catch(() => undefined)
        else player.video.pause()
        return
      }
      if (detail.value && !isExternalPreview.value) {
        const progress = readEpisodeProgress(detail.value.id, episode.id)
        if (progress > 0 && progress < player.video.duration - 5) {
          player.video.currentTime = progress
          player.notice.show = `已恢复到 ${Math.floor(progress / 60)}:${String(Math.floor(progress % 60)).padStart(2, '0')}`
        }
      }
    })
    player.video.addEventListener('loadeddata', () => {
      if (requestVersion !== playerRequestVersion) return
      markPlayerLoaded()
      confirmStartupQuality()
      selectedPlaybackUrl.value = source
      clearStallRecovery()
      clearPlayerMediaPendingSoon(player, requestVersion)
      if (pendingPlaybackNotice) {
        player.notice.show = pendingPlaybackNotice
        pendingPlaybackNotice = ''
      }
      if (!player.video.paused && (anime4KEnabled.value || interpolationEnabled.value) && !anime4KSession
        && anime4KState.value !== 'starting') void applyAnime4K(player, requestVersion)
    })
    let successfulPlayback = false
    for (const event of ['timeupdate', 'pause', 'seeked', 'volumechange', 'ratechange']) {
      player.video.addEventListener(event, () => {
        const video = player.video
        if (requestVersion !== playerRequestVersion || video.readyState < 2 || video.seeking) return
        lastPlaybackState = { currentTime: video.currentTime, shouldPlay: !video.paused && !video.ended, volume: video.volume, muted: video.muted, rate: video.playbackRate }
      })
    }
    player.video.addEventListener('timeupdate', () => {
      if (requestVersion !== playerRequestVersion || successfulPlayback || player.video.currentTime < 2 || player.video.readyState < 2) return
      successfulPlayback = true
      recordPlaybackRoute(playbackKey.value, source, true)
    })
    // 只在实际播放档位发生变化时更新记忆：既记录升档后的真实档位，也不把带宽回落写成长期偏好。
    let recordedQualityLevel = -1
    player.video.addEventListener('timeupdate', () => {
      const hls = artHls
      if (!hls || requestVersion !== playerRequestVersion || player.video.currentTime < 1 || player.video.readyState < 2) return
      const levelIndex = hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel
      if (levelIndex === recordedQualityLevel) return
      if (recordStartupQualityLevel(hls, source, levelIndex)) recordedQualityLevel = levelIndex
    })
    // 播放期持续采样清晰度档位：跨窗口边界时汇总画质窗口并说明非最高档原因（VQ-30）。
    player.video.addEventListener('timeupdate', () => {
      const hls = artHls
      if (!hls || requestVersion !== playerRequestVersion || player.video.paused) return
      sampleQualityWindow(player, hls, requestVersion)
    })
    player.video.addEventListener('volumechange', () => {
      if (requestVersion === playerRequestVersion) savePlaybackPreferences({ volume: player.video.volume })
    })
    player.video.addEventListener('ratechange', () => {
      if (requestVersion === playerRequestVersion) savePlaybackPreferences({ rate: player.video.playbackRate })
    })
    player.video.addEventListener('seeking', () => {
      if (requestVersion !== playerRequestVersion) return
      setPlayerMediaPending(player, true)
    })
    player.video.addEventListener('seeked', () => {
      if (requestVersion === playerRequestVersion) {
        clearStallRecovery()
        clearPlayerMediaPendingSoon(player, requestVersion)
      }
    })
    player.video.addEventListener('waiting', () => {
      if (requestVersion === playerRequestVersion) {
        setPlayerMediaPending(player, true)
        scheduleStallRecovery(player, requestVersion)
        qualityObservability?.noteWaiting()
      }
    })
    player.video.addEventListener('canplay', () => {
      if (requestVersion === playerRequestVersion) {
        clearStallRecovery()
        clearPlayerMediaPendingSoon(player, requestVersion)
      }
    })
    player.video.addEventListener('playing', () => {
      if (requestVersion === playerRequestVersion) {
        if ((anime4KEnabled.value || interpolationEnabled.value) && !anime4KSession
          && anime4KState.value !== 'starting') void applyAnime4K(player, requestVersion)
        clearStallRecovery()
        clearPlayerMediaPendingSoon(player, requestVersion)
      }
    })
    if (detail.value && !isExternalPreview.value) {
      const animeId = detail.value.id
      let lastProgressWriteAt = 0
      const persistProgress = (force = false) => {
        const now = Date.now()
        if (!force && now - lastProgressWriteAt < PROGRESS_WRITE_INTERVAL_MS) return
        writeEpisodeProgress(animeId, episode, player.video)
        lastProgressWriteAt = now
      }
      const handleTimeUpdate = () => persistProgress()
      const handleProgressBoundary = () => persistProgress(true)
      const handleSeeked = () => {
        if (player.video.currentTime < 1) clearEpisodeProgress(animeId, episode.id)
        else persistProgress(true)
      }
      player.video.addEventListener('timeupdate', handleTimeUpdate)
      player.video.addEventListener('seeked', handleSeeked)
      player.video.addEventListener('pause', handleProgressBoundary)
      player.video.addEventListener('ended', handleProgressBoundary)
      window.addEventListener('pagehide', handleProgressBoundary)
      flushPlayerProgress = handleProgressBoundary
      removePlayerProgressListeners = () => {
        player.video.removeEventListener('timeupdate', handleTimeUpdate)
        player.video.removeEventListener('seeked', handleSeeked)
        player.video.removeEventListener('pause', handleProgressBoundary)
        player.video.removeEventListener('ended', handleProgressBoundary)
        window.removeEventListener('pagehide', handleProgressBoundary)
      }
    }
    player.video.addEventListener('error', () => {
      if (requestVersion === playerRequestVersion) markPlayerError('当前线路播放失败，已尝试切换备用线路')
    })
  } catch {
    if (requestVersion === playerRequestVersion) markPlayerError('播放器加载失败，已尝试切换备用线路')
  }
}

/** 媒体加载成功时清理当前错误状态。 */
function markPlayerLoaded() {
  if (mediaLoadTimer) {
    window.clearTimeout(mediaLoadTimer)
    mediaLoadTimer = 0
  }
  playerLoading.value = false
  playerError.value = false
}

/** 媒体元素报告错误时显示统一的播放器失败状态。 */
function markPlayerError(notice = '') {
  if (!pendingPlaybackResume) rememberPlaybackPosition()
  recordPlaybackRoute(playbackKey.value, activePlaybackUrl.value, false)
  if (mediaLoadTimer) {
    window.clearTimeout(mediaLoadTimer)
    mediaLoadTimer = 0
  }
  clearStallRecovery()
  if (advancePlaybackOption(notice)) return
  playerLoading.value = false
  playerError.value = true
}

function clearStallRecovery() {
  if (!stallRecoveryTimer) return
  window.clearTimeout(stallRecoveryTimer)
  stallRecoveryTimer = 0
}

/** 持续缓冲超过阈值时切换备用线路；单线路则重新连接当前媒体。 */
function scheduleStallRecovery(player: Artplayer, requestVersion: number) {
  clearStallRecovery()
  stallRecoveryTimer = window.setTimeout(() => {
    stallRecoveryTimer = 0
    const video = player.video
    if (requestVersion !== playerRequestVersion || video.paused || video.ended || video.seeking
      || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return
    if (advancePlaybackOption('当前线路持续缓冲，已自动切换备用线路')) return
    if (artHls) {
      artHls.startLoad(video.currentTime)
    } else {
      rememberPlaybackPosition()
      video.load()
    }
    player.notice.show = '当前线路较慢，正在重新连接'
  }, PLAYER_STALL_RECOVERY_MS)
}

/** seek 或缓冲期间临时露出原视频，避免增强 canvas 尚未绘制时出现黑屏。 */
function setPlayerMediaPending(player: Artplayer, pending: boolean) {
  player.video.closest('.art-video-player')?.classList.toggle('sanye-media-pending', pending)
}

/** seek 后的首张解码帧一到就恢复增强层；旧浏览器保留短延时回退。 */
function clearPlayerMediaPendingSoon(player: Artplayer, requestVersion: number) {
  clearPlayerMediaReveal()
  const video = player.video
  const revealVersion = ++mediaRevealVersion
  mediaRevealVideo = video
  const reveal = () => {
    if (revealVersion !== mediaRevealVersion || requestVersion !== playerRequestVersion
      || player.video !== video || video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    clearPlayerMediaReveal()
    if (requestVersion === playerRequestVersion) setPlayerMediaPending(player, false)
  }
  if (video.requestVideoFrameCallback) mediaRevealFrameCallback = video.requestVideoFrameCallback(reveal)
  mediaRevealTimer = window.setTimeout(reveal, 120)
}

function clearPlayerMediaReveal() {
  mediaRevealVersion += 1
  if (mediaRevealTimer) window.clearTimeout(mediaRevealTimer)
  if (mediaRevealFrameCallback && mediaRevealVideo?.cancelVideoFrameCallback) {
    mediaRevealVideo.cancelVideoFrameCallback(mediaRevealFrameCallback)
  }
  mediaRevealTimer = 0
  mediaRevealFrameCallback = 0
  mediaRevealVideo = null
}

/** 手动重新加载当前剧集视频。 */
function retryPlayer() {
  playerError.value = false
  if (advancePlaybackOption('已切换备用线路')) return
  const resume = pendingPlaybackResume ?? rememberPlaybackPosition()
  if (resume && isExternalPreview.value && resume.currentTime === 0) resume.shouldPlay = true
  attemptedRoutes.clear()
  void mountVideoPlayer()
}

/** 选集或播放线路变化后重新挂载播放器，保证 ArtPlayer 地址和按钮同步。 */
watch([() => detail.value?.id, () => selectedEpisode.value?.id, activePlaybackUrl], () => {
  void mountVideoPlayer()
  prefetchNeighborEpisodes(episodes.value, selectedEpisode.value)
}, { flush: 'post' })

/** 详情页离开时释放 HLS 网络连接和媒体资源。 */
onBeforeUnmount(() => {
  playerRequestVersion += 1
  detailRequestController?.abort()
  episodesRequestController?.abort()
  destroyVideoPlayer()
})

/** 登录后尽力记录观看历史，不让历史接口影响详情展示。 */
function recordHistory(animeId: number) {
  void favoriteApi.recordView(animeId).catch(() => undefined)
}

/** 切换收藏状态，登录用户同步服务端，匿名用户只更新页面状态。 */
async function toggleFavorite() {
  if (!detail.value || favoritePending.value) return
  const animeId = detail.value.id
  const target = !collected.value
  const requestVersion = ++favoriteStateVersion.value
  favoritePending.value = true
  collected.value = target
  try {
    if (target) {
      await favoriteApi.add(animeId)
    } else {
      await favoriteApi.remove(animeId)
    }
  } catch {
    // 请求失败时只回滚本次操作，不能覆盖已经开始的新作品请求。
    if (requestVersion === favoriteStateVersion.value) {
      collected.value = !target
    }
  } finally {
    if (requestVersion === favoriteStateVersion.value) {
      favoritePending.value = false
    }
  }
}

/** 返回上一页；没有历史记录时回到作品仓库。 */
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    void router.push('/')
  }
}
</script>

<template>
  <div class="page-stack anime-detail-page">
    <FrameInterpolationDialog v-if="interpolationOpen" :source="activePlaybackUrl" :hls="activePlaybackIsHls" :title="display?.title || '视频'" @close="closeInterpolation" />
    <button class="back-link detail-back-button" type="button" @click="goBack"><span aria-hidden="true">←</span> 返回</button>

    <div v-if="loading" class="detail-loading-state" role="status" aria-live="polite">
      <span class="detail-loading-face" aria-hidden="true"><i></i><i></i><b></b></span>
      <span class="detail-loading-copy">
        <strong>{{ isExternalPreview ? '正在解析来源' : '正在打开作品' }}</strong>
        <small>{{ isExternalPreview ? '读取作品与播放线路…' : '准备作品详情与播放列表…' }}</small>
      </span>
      <span class="detail-loading-progress" role="progressbar" :aria-label="isExternalPreview ? '正在读取直接观看资源' : '正在加载作品详情'"><i></i></span>
    </div>

    <section v-if="display && detail" class="anime-player-section" aria-label="剧集播放器">
      <div class="anime-player-heading">
        <div>
          <span class="eyebrow">{{ isExternalPreview ? '直接观看 · 站内播放器' : '授权来源播放' }}</span>
          <h3>{{ playerSectionTitle }}</h3>
          <small v-if="episodesUsingCache" class="player-cache-note">已使用本地播放列表，正在后台刷新。</small>
        </div>
        <a v-if="selectedEpisode" class="text-button" :href="selectedEpisode.sourcePageUrl" target="_blank" rel="noreferrer noopener">查看来源 →</a>
      </div>
      <div v-if="episodesLoading" class="player-empty" aria-live="polite">正在读取播放列表…</div>
      <div v-else-if="episodesFailed" class="player-empty player-error" role="status">
        <span>播放列表暂时不可用。</span><button class="text-button" type="button" @click="void loadEpisodes(detail.id)">重试</button>
      </div>
      <div v-else-if="!episodes.length" class="player-empty" role="status">该作品暂时没有可用的授权播放源。</div>
      <template v-else>
        <div class="anime-player-frame">
          <div
            v-if="isVideoElement"
            :key="`${selectedEpisode?.id ?? 'episode'}:${activePlaybackUrl}`"
            ref="playerContainer"
            class="artplayer-container"
            aria-label="ArtPlayer 视频播放器"
          ></div>
          <iframe
            v-else-if="isExternalFrame"
            :key="`${selectedEpisode?.id ?? 'episode'}:${activePlaybackUrl}`"
            class="external-player-frame"
            :src="activePlaybackUrl"
            :title="`${display?.title || '动漫'} 外部播放器`"
            allow="autoplay; fullscreen; picture-in-picture"
            allowfullscreen
            referrerpolicy="no-referrer"
          ></iframe>
          <div v-else class="player-external" role="status">
            <span>当前剧集暂未解析到直连视频源。</span>
            <a
              v-if="selectedEpisode"
              class="secondary-button"
              :href="selectedEpisode.sourcePageUrl"
              target="_blank"
              rel="noreferrer noopener"
            >
              打开来源页
            </a>
          </div>
          <div v-if="playerLoading && !playerError" class="player-loading-overlay" role="status" aria-live="polite">
            <span class="detail-loading-face compact" aria-hidden="true"><i></i><i></i><b></b></span>
            <strong>{{ playbackPhase }}</strong>
            <small>正在连接播放线路…</small>
            <span class="detail-loading-progress compact" role="progressbar" aria-label="正在加载视频"><i></i></span>
          </div>
          <div v-if="playerError" class="player-overlay" role="status">
            <span>播放器加载失败，请稍后重试或打开来源页。</span>
            <button v-if="playbackOptions.length > 1" class="text-button" type="button" @click="retryPlayer">切换线路</button>
            <button v-if="isExternalPreview" class="text-button" type="button" @click="void load()">重新解析来源</button>
            <RouterLink class="text-button" :to="searchReturn">返回搜索结果</RouterLink>
            <button class="secondary-button" type="button" @click="retryPlayer">重新加载</button>
          </div>
        </div>
        <details v-if="playbackOptions.length > 1" class="anime-playback-sources">
          <summary>播放线路 · {{ playbackOptions.length }} 条 <small>当前：{{ activePlaybackLabel }}</small></summary>
          <div class="anime-playback-source-options" role="group" aria-label="播放线路">
            <button
              v-for="(option, index) in playbackOptions"
              :key="option.url"
              class="episode-button source-button"
              :class="{ active: option.url === activePlaybackUrl }"
              type="button"
              :aria-pressed="option.url === activePlaybackUrl"
              @click="selectPlaybackOption(option)"
            >
              {{ playbackSourceLabel(option, index) }}
            </button>
          </div>
        </details>
        <div v-if="showEpisodeList" class="anime-episode-list" role="list" :aria-label="playbackListLabel">
          <button
            v-for="(episode, index) in episodes"
            :key="episode.id"
            class="episode-button"
            :class="{ active: episode.id === selectedEpisode?.id }"
            type="button"
            :aria-pressed="episode.id === selectedEpisode?.id"
            @click="selectEpisode(episode)"
          >
            {{ playbackOptionLabel(episode, index) }}
          </button>
        </div>
      </template>
    </section>

    <section v-if="display" class="anime-detail-hero">
      <div class="anime-detail-cover">
        <img :src="display.cover" :alt="`${display.title} 动漫封面`" loading="eager" decoding="async" />
      </div>
      <div class="anime-detail-copy">
        <span class="eyebrow">作品详情</span>
        <h2>{{ display.title }}</h2>
        <p class="anime-detail-subtitle">{{ display.subtitle }}</p>
        <div class="anime-detail-tags">
          <span v-for="tag in display.tags" :key="tag">{{ tag }}</span>
          <span>{{ display.status }}</span>
        </div>
        <p class="anime-detail-description">{{ display.description }}</p>
        <div class="anime-detail-meta"><span>更新安排</span><strong>{{ display.update }}</strong></div>
        <p v-if="failed" class="detail-fallback-note">接口暂不可用，当前展示本地演示数据。</p>
        <div v-if="!isExternalPreview" class="anime-detail-actions">
          <RouterLink
            v-if="!desktopMode"
            class="primary-button"
            :to="
              detail
                ? `/ai?animeId=${detail.id}&animeTitle=${encodeURIComponent(detail.title)}`
                : `/ai?anime=${slug}`
            "
          >
            问 AI 关于这部作品
          </RouterLink>
          <button class="secondary-button" type="button" :disabled="favoritePending" :aria-pressed="collected" @click="toggleFavorite">
            {{ collected ? '已收藏' : '收藏作品' }}
          </button>
        </div>
        <div v-else class="anime-detail-actions">
          <RouterLink class="secondary-button" :to="searchReturn">返回搜索结果</RouterLink>
        </div>
      </div>
    </section>

    <section v-else-if="!loading" class="empty-state">
      <span class="empty-mark" aria-hidden="true">▣</span>
      <h3>{{ failed ? (isExternalPreview ? '暂时无法加载站内播放' : '网络异常，加载失败') : '作品不存在或已下架' }}</h3>
      <p>{{ failed ? (isExternalPreview ? previewError : '请检查网络后重试，或返回首页继续浏览。') : '返回首页继续发现其他作品。' }}</p>
      <template v-if="failed">
        <button class="primary-button" type="button" @click="void load()">重试</button>
        <a v-if="isExternalPreview" class="secondary-button" :href="previewSourceUrl" target="_blank" rel="noreferrer noopener">打开来源页</a>
        <RouterLink class="text-button" to="/">返回首页 →</RouterLink>
      </template>
      <RouterLink v-else class="primary-button" to="/">返回首页 →</RouterLink>
    </section>

    <section v-if="display && !desktopMode" class="anime-detail-section">
      <div><span class="eyebrow">观看前先了解</span><h3>故事线索</h3></div>
      <p>打开 AI 助手可以继续询问角色关系、观看顺序和不剧透的剧情解释。</p>
    </section>

    <section v-if="display && display.characters.length" class="anime-detail-section content-section">
      <div><span class="eyebrow">主要登场</span><h3>角色</h3></div>
      <div class="detail-characters">
        <div v-for="character in display.characters" :key="character.name" class="detail-character">
          <strong>{{ character.name }}</strong>
          <small>{{ character.role }}</small>
        </div>
      </div>
    </section>

    <section v-if="display && display.schedule.length" class="anime-detail-section content-section">
      <div><span class="eyebrow">播出安排</span><h3>排期</h3></div>
      <ul class="detail-schedule">
        <li v-for="item in display.schedule" :key="item.episodeNo">
          <span>第 {{ item.episodeNo }} 集</span>
          <span>{{ item.airDate }}</span>
          <span>{{ item.status === 'AIRING' ? '播出中' : '待播出' }}</span>
        </li>
      </ul>
    </section>

    <section v-if="display && display.similar.length" class="anime-detail-section content-section">
      <div><span class="eyebrow">你可能也会喜欢</span><h3>相似作品</h3></div>
      <div class="detail-similar">
        <RouterLink v-for="item in display.similar" :key="item.id" class="detail-similar-card" :to="`/anime/${item.id}`">
          <img :src="item.cover" :alt="`${item.title} 封面`" loading="lazy" decoding="async" />
          <div class="detail-similar-copy">
            <strong>{{ item.title }}</strong>
            <small>{{ item.score !== undefined ? `★ ${item.score}` : '相似推荐' }}</small>
            <span>查看</span>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
