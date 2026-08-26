<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type Artplayer from 'artplayer'
import type Hls from 'hls.js'
import { animeApi, type AnimeUrlPreviewResult } from '@/api/anime'
import { favoriteApi } from '@/api/favorite'
import { isAbortError, resolveAssetUrl } from '@/api/http'
import type { AnimeDetail, AnimeEpisode, AnimePlaybackOption } from '@/api/types'
import { animeCatalogMap } from '@/data/animeCatalog'
import { ANIME4K_PROFILE_LABELS, startAnime4KVideo, type Anime4KProfile, type Anime4KSession } from '@/video/anime4k'
import {
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

const slug = computed(() => String(route.params.slug ?? ''))
const previewSourceUrl = computed(() => typeof route.query.sourceUrl === 'string' ? route.query.sourceUrl.trim() : '')
const isExternalPreview = computed(() => route.name === 'externalWatch' && Boolean(previewSourceUrl.value))
const detail = ref<AnimeDetail | null>(null)
const loading = ref(false)
const failed = ref(false)
const collected = ref(false)
const favoriteStateVersion = ref(0)
const favoritePending = ref(false)
const episodes = ref<AnimeEpisode[]>([])
const episodesLoading = ref(false)
const episodesFailed = ref(false)
const selectedEpisodeId = ref<number | null>(null)
const selectedPlaybackUrl = ref('')
const playerError = ref(false)
const episodesUsingCache = ref(false)
const episodesRequestVersion = ref(0)
const anime4KEnabled = ref(false)
const anime4KProfile = ref<Anime4KProfile>('balanced')
const anime4KState = ref<'idle' | 'starting' | 'active' | 'unsupported' | 'failed'>('idle')
const playerContainer = ref<HTMLDivElement | null>(null)
let artPlayer: Artplayer | null = null
let artHls: Hls | null = null
let playerRequestVersion = 0
let anime4KSession: Anime4KSession | null = null
let anime4KRequestVersion = 0
let progressTimer = 0
let mediaLoadTimer = 0
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

/** 将 HLS level 接入 ArtPlayer 原生 quality 控件，切换时不重建播放器。 */
function mountHlsQuality(player: Artplayer, hls: Hls, requestVersion: number) {
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
    ],
    onSelect(item) {
      if (requestVersion === playerRequestVersion && artHls === hls) {
        hls.currentLevel = item.value === 'auto' ? -1 : Number(item.value)
      }
      player.notice.show = `切换清晰度: ${item.html}`
      return item.html
    },
  })
}

function anime4KControlText() {
  if (anime4KState.value === 'starting') return '增强…'
  if (anime4KState.value === 'active') return '增强+'
  return '增强'
}

function updateAnime4KControl(player: Artplayer) {
  player.controls.update({
    name: 'anime4k',
    position: 'right',
    index: 9,
    html: anime4KControlText(),
    tooltip: anime4KEnabled.value ? `画质增强：${ANIME4K_PROFILE_LABELS[anime4KProfile.value]}` : '画质增强',
    selector: [
      { html: '关闭', value: 'off', default: !anime4KEnabled.value },
      ...Object.entries(ANIME4K_PROFILE_LABELS).map(([value, html]) => ({
        html,
        value,
        default: anime4KEnabled.value && value === anime4KProfile.value,
      })),
    ],
    onSelect(item) {
      const value = String(item.value)
      if (value === 'off') {
        anime4KEnabled.value = false
        stopAnime4K()
        updateAnime4KControl(player)
        player.notice.show = '已关闭 Anime4K'
        return
      }
      anime4KEnabled.value = true
      anime4KProfile.value = value as Anime4KProfile
      void applyAnime4K(player, playerRequestVersion)
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
  return option.label?.trim() || `线路 ${index + 1}`
}

/** 当前选中的剧集；默认选择接口返回的第一集。 */
const selectedEpisode = computed(() =>
  episodes.value.find((episode) => episode.id === selectedEpisodeId.value) ?? episodes.value[0],
)

const playbackOptions = computed(() => playbackOptionsOf(selectedEpisode.value))
const activePlaybackOption = computed(() => {
  const options = playbackOptions.value
  return options.find((option) => option.url === selectedPlaybackUrl.value) ?? options[0]
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
  try {
    if (isExternalPreview.value) {
      const preview = await animeApi.previewUrl(previewSourceUrl.value, { signal: controller.signal })
      detail.value = previewDetail(preview)
      episodes.value = normalizePlaybackEpisodes(preview.episodes)
      selectedEpisodeId.value = episodes.value[0]?.id ?? null
      selectedPlaybackUrl.value = ''
      episodesLoading.value = false
      episodesFailed.value = false
    } else {
      const slugValue = slug.value
      const mappedId = /^\d+$/.test(slugValue) ? Number(slugValue) : undefined
      if (mappedId === undefined) {
        // 本地目录作品（后端暂无对应数据面）：直接本地展示，不发起接口请求
        detail.value = null
      } else {
        detail.value = await animeApi.detail(mappedId, { signal: controller.signal })
        if (detail.value) {
          void recordHistory(detail.value.id)
          void refreshFavorite(detail.value.id)
          void loadEpisodes(detail.value.id)
        }
      }
    }
  } catch (cause) {
    if (isAbortError(cause)) return
    failed.value = true
    detail.value = null
  } finally {
    if (detailRequestController === controller) {
      detailRequestController = null
      loading.value = false
    }
  }
}

watch(
  () => `${slug.value}|${previewSourceUrl.value}`,
  () => {
    detailRequestController?.abort()
    episodesRequestController?.abort()
    detail.value = null
    episodesRequestVersion.value += 1
    episodes.value = []
    selectedEpisodeId.value = null
    selectedPlaybackUrl.value = ''
    episodesLoading.value = false
    episodesFailed.value = false
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
    episodes.value = normalized
    writeCachedEpisodes(animeId, normalized)
    const remembered = readSelectedEpisodeId(animeId)
    selectedEpisodeId.value = normalized.some((episode) => episode.id === remembered) ? remembered : normalized[0]?.id ?? null
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
  selectedEpisodeId.value = episode.id
  selectedPlaybackUrl.value = episode.playbackUrl
  if (detail.value && !isExternalPreview.value) writeSelectedEpisodeId(detail.value.id, episode.id)
  playerError.value = false
}

/** 手动或自动切换到当前剧集的下一条备用线路。 */
function advancePlaybackOption() {
  const options = playbackOptions.value
  if (options.length < 2) return false
  const currentIndex = Math.max(0, options.findIndex((option) => option.url === activePlaybackUrl.value))
  const next = options[currentIndex + 1]
  if (!next) return false
  selectedPlaybackUrl.value = next.url
  playerError.value = false
  return true
}

function selectPlaybackOption(option: AnimePlaybackOption) {
  selectedPlaybackUrl.value = option.url
  playerError.value = false
}

function stopAnime4K() {
  anime4KRequestVersion += 1
  anime4KSession?.stop()
  anime4KSession = null
  anime4KState.value = 'idle'
}

/** 释放 ArtPlayer 和 HLS 实例，避免切换剧集后继续请求上一集的分片。 */
function destroyVideoPlayer() {
  stopAnime4K()
  if (progressTimer) {
    window.clearInterval(progressTimer)
    progressTimer = 0
  }
  if (mediaLoadTimer) {
    window.clearTimeout(mediaLoadTimer)
    mediaLoadTimer = 0
  }
  artHls?.destroy()
  artHls = null
  artPlayer?.destroy()
  artPlayer = null
}

async function applyAnime4K(player: Artplayer, requestVersion: number) {
  const anime4KVersion = ++anime4KRequestVersion
  anime4KSession?.stop()
  anime4KSession = null

  if (!anime4KEnabled.value) {
    anime4KState.value = 'idle'
    updateAnime4KControl(player)
    return
  }

  anime4KState.value = 'starting'
  updateAnime4KControl(player)
  try {
    const session = await startAnime4KVideo(player.video, anime4KProfile.value)
    if (requestVersion !== playerRequestVersion || anime4KVersion !== anime4KRequestVersion || !anime4KEnabled.value) {
      session.stop()
      return
    }
    anime4KSession = session
    anime4KState.value = 'active'
    updateAnime4KControl(player)
    player.notice.show = `Anime4K ${ANIME4K_PROFILE_LABELS[anime4KProfile.value]}模式已开启`
  } catch {
    if (requestVersion !== playerRequestVersion || anime4KVersion !== anime4KRequestVersion) return
    anime4KEnabled.value = false
    anime4KState.value = 'failed'
    updateAnime4KControl(player)
    player.notice.show = '当前浏览器或视频源暂不支持 Anime4K'
  }
}

/**
 * 挂载 ArtPlayer；视频源统一使用 ArtPlayer 的标准控制栏和设置面板。
 * HLS 通过 customType 交给 hls.js，普通视频使用浏览器媒体能力。
 */
async function mountVideoPlayer() {
  const requestVersion = ++playerRequestVersion
  destroyVideoPlayer()
  await nextTick()
  if (requestVersion !== playerRequestVersion) return
  const episode = selectedEpisode.value
  const container = playerContainer.value
  if (!episode || !container || !isVideoElement.value) return
  const source = activePlaybackUrl.value
  const isHlsSource = activePlaybackIsHls.value
  if (!source) return
  warmMediaSource(source)

  try {
    // 播放器只在详情页真正出现且存在可播放媒体时加载，避免阻塞普通页面切换。
    const artplayerModule = import('artplayer')
    const hlsModule = isHlsSource ? import('hls.js') : Promise.resolve(undefined)
    const [{ default: Artplayer }, HlsModule] = await Promise.all([artplayerModule, hlsModule])
    const HlsConstructor = HlsModule?.default
    if (requestVersion !== playerRequestVersion) return
    const player = new Artplayer({
      id: `sanye-anime-${detail.value?.id ?? 'unknown'}`,
      container,
      url: source,
      type: isHlsSource ? 'm3u8' : '',
      poster: display.value?.cover,
      theme: '#e77d65',
      lang: 'zh-cn',
      volume: 0.7,
      autoplay: false,
      autoSize: true,
      autoMini: false,
      autoPlayback: true,
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
        preload: 'metadata',
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
              const hls = new HlsConstructor({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 30,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                capLevelToPlayerSize: true,
                manifestLoadingTimeOut: 4_000,
                levelLoadingTimeOut: 4_000,
                fragLoadingTimeOut: 5_000,
                manifestLoadingMaxRetry: 0,
                levelLoadingMaxRetry: 0,
                fragLoadingMaxRetry: 0,
                startFragPrefetch: true,
              })
              let networkRetries = 0
              let mediaRetries = 0
              artHls = hls
              art.hls = hls
              hls.on(HlsConstructor.Events.MEDIA_ATTACHED, () => {
                if (requestVersion === playerRequestVersion) hls.loadSource(url)
              })
              hls.on(HlsConstructor.Events.MANIFEST_PARSED, () => {
                if (requestVersion !== playerRequestVersion) return
                mountHlsQuality(player, hls, requestVersion)
                markPlayerLoaded()
              })
              hls.on(HlsConstructor.Events.ERROR, (_event, data) => {
                if (!data.fatal || requestVersion !== playerRequestVersion) return
                if (data.type === HlsConstructor.ErrorTypes.NETWORK_ERROR) {
                  // 只重试一次，持续 DNS/CDN 失败时交给备用线路处理，避免播放器无限空转。
                  if (networkRetries < 1) {
                    networkRetries += 1
                    hls.startLoad()
                  } else {
                    markPlayerError()
                  }
                } else if (data.type === HlsConstructor.ErrorTypes.MEDIA_ERROR) {
                  if (mediaRetries < 1) {
                    mediaRetries += 1
                    hls.recoverMediaError()
                  } else {
                    markPlayerError()
                  }
                } else {
                  markPlayerError()
                }
              })
              hls.attachMedia(video)
            },
          }
        : undefined,
    }, () => {
      // ArtPlayer 构造完成不代表清单已经可用，加载状态由媒体事件和超时统一判断。
    })
    artPlayer = player
    mediaLoadTimer = window.setTimeout(() => {
      if (requestVersion === playerRequestVersion && player.video.readyState < HTMLMediaElement.HAVE_METADATA) {
        markPlayerError()
      }
    }, 8_000)
    updateAnime4KControl(player)
    player.video.addEventListener('loadedmetadata', () => {
      if (requestVersion !== playerRequestVersion || !detail.value || isExternalPreview.value) return
      const progress = readEpisodeProgress(detail.value.id, episode.id)
      if (progress > 0 && progress < player.video.duration - 5) {
        player.video.currentTime = progress
        player.notice.show = `已恢复到 ${Math.floor(progress / 60)}:${String(Math.floor(progress % 60)).padStart(2, '0')}`
      }
    })
    player.video.addEventListener('loadeddata', () => {
      if (requestVersion !== playerRequestVersion) return
      markPlayerLoaded()
      clearPlayerMediaPendingSoon(player, requestVersion)
      if (anime4KEnabled.value && !anime4KSession) void applyAnime4K(player, requestVersion)
    })
    player.video.addEventListener('seeking', () => {
      if (requestVersion !== playerRequestVersion) return
      setPlayerMediaPending(player, true)
      artHls?.startLoad(player.video.currentTime)
    })
    player.video.addEventListener('seeked', () => {
      if (requestVersion === playerRequestVersion) clearPlayerMediaPendingSoon(player, requestVersion)
    })
    player.video.addEventListener('waiting', () => {
      if (requestVersion === playerRequestVersion) setPlayerMediaPending(player, true)
    })
    player.video.addEventListener('canplay', () => {
      if (requestVersion === playerRequestVersion) clearPlayerMediaPendingSoon(player, requestVersion)
    })
    player.video.addEventListener('playing', () => {
      if (requestVersion === playerRequestVersion) clearPlayerMediaPendingSoon(player, requestVersion)
    })
    progressTimer = window.setInterval(() => {
      if (requestVersion === playerRequestVersion && detail.value && !isExternalPreview.value && !player.video.paused) {
        writeEpisodeProgress(detail.value.id, episode, player.video)
      }
    }, 5_000)
    player.video.addEventListener('error', () => {
      if (requestVersion === playerRequestVersion) markPlayerError()
    })
  } catch {
    if (requestVersion === playerRequestVersion) markPlayerError()
  }
}

/** 媒体加载成功时清理当前错误状态。 */
function markPlayerLoaded() {
  if (mediaLoadTimer) {
    window.clearTimeout(mediaLoadTimer)
    mediaLoadTimer = 0
  }
  playerError.value = false
}

/** 媒体元素报告错误时显示统一的播放器失败状态。 */
function markPlayerError() {
  if (mediaLoadTimer) {
    window.clearTimeout(mediaLoadTimer)
    mediaLoadTimer = 0
  }
  if (advancePlaybackOption()) return
  playerError.value = true
}

/** seek 或缓冲期间临时露出原视频，避免增强 canvas 尚未绘制时出现黑屏。 */
function setPlayerMediaPending(player: Artplayer, pending: boolean) {
  player.video.closest('.art-video-player')?.classList.toggle('sanye-media-pending', pending)
}

/** 等媒体元素确认已有当前帧后再恢复增强层，避免 seek 后 canvas 空帧闪黑。 */
function clearPlayerMediaPendingSoon(player: Artplayer, requestVersion: number) {
  window.setTimeout(() => {
    if (requestVersion === playerRequestVersion && player.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setPlayerMediaPending(player, false)
    }
  }, 120)
}

/** 手动重新加载当前剧集视频。 */
function retryPlayer() {
  playerError.value = false
  if (advancePlaybackOption()) return
  void mountVideoPlayer()
}

/** 选集或播放线路变化后重新挂载播放器，保证 ArtPlayer 地址和按钮同步。 */
watch([selectedEpisode, activePlaybackUrl], () => {
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
    <button class="back-link detail-back-button" type="button" @click="goBack"><span aria-hidden="true">←</span> 返回</button>

    <div v-if="loading" class="feed-skeleton" aria-label="正在加载作品详情">
      <span></span><span></span><span></span>
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
          <div v-if="playerError" class="player-overlay" role="status">
            <span>播放器加载失败，请稍后重试或打开来源页。</span>
            <button class="secondary-button" type="button" @click="retryPlayer">重新加载</button>
          </div>
        </div>
        <div v-if="playbackOptions.length > 1" class="anime-playback-sources" role="group" aria-label="播放线路">
          <span>播放线路</span>
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
        <div class="anime-episode-list" role="list" :aria-label="playbackListLabel">
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
          <RouterLink class="secondary-button" to="/search">返回搜索结果</RouterLink>
        </div>
      </div>
    </section>

    <section v-else class="empty-state">
      <span class="empty-mark" aria-hidden="true">▣</span>
      <h3>{{ failed ? (isExternalPreview ? '暂时无法加载站内播放' : '网络异常，加载失败') : '作品不存在或已下架' }}</h3>
      <p>{{ failed ? (isExternalPreview ? '来源页面仍可打开，也可以稍后重试。' : '请检查网络后重试，或返回首页继续浏览。') : '返回首页继续发现其他作品。' }}</p>
      <template v-if="failed">
        <button class="primary-button" type="button" @click="void load()">重试</button>
        <a v-if="isExternalPreview" class="secondary-button" :href="previewSourceUrl" target="_blank" rel="noreferrer noopener">打开来源页</a>
        <RouterLink class="text-button" to="/">返回首页 →</RouterLink>
      </template>
      <RouterLink v-else class="primary-button" to="/">返回首页 →</RouterLink>
    </section>

    <section v-if="display" class="anime-detail-section">
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
