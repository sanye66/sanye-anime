import type { AnimeEpisode } from '@/api/types'

const EPISODE_TTL_MS = 10 * 60 * 1000
const MAX_PROGRESS_AGE_MS = 30 * 24 * 60 * 60 * 1000
const PREFETCH_TIMEOUT_MS = 6_000
const MEDIA_LINK_REL = 'sanye-media-source'

interface EpisodeCacheEntry {
  data: AnimeEpisode[]
  expiresAt: number
}

interface ProgressCacheEntry {
  episodeId: number
  currentTime: number
  duration: number
  updatedAt: number
}

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function episodesKey(animeId: string | number) {
  return `sanye:player:episodes:${animeId}`
}

function progressKey(animeId: string | number, episodeId: string | number) {
  return `sanye:player:progress:${animeId}:${episodeId}`
}

function selectedEpisodeKey(animeId: string | number) {
  return `sanye:player:selected:${animeId}`
}

function canUseUrl(value: string) {
  try {
    const url = new URL(value, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isHlsEpisode(episode?: AnimeEpisode | null) {
  if (!episode) return false
  return episode.mimeType?.includes('mpegurl') || episode.playbackUrl.toLowerCase().includes('.m3u8')
}

export function isVideoEpisode(episode?: AnimeEpisode | null) {
  if (!episode) return false
  return episode.mimeType?.startsWith('video/') || isHlsEpisode(episode)
}

export function normalizePlaybackEpisodes(source: AnimeEpisode[]) {
  const seen = new Set<string>()
  return source
    .filter((episode) => episode.playbackUrl && canUseUrl(episode.playbackUrl))
    .filter((episode) => {
      const key = `${episode.episodeNo}:${episode.playbackUrl}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => left.episodeNo - right.episodeNo || left.id - right.id)
}

export function readCachedEpisodes(animeId: string | number) {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(episodesKey(animeId))
    if (!raw) return null
    const entry = JSON.parse(raw) as EpisodeCacheEntry
    if (!Array.isArray(entry.data) || Date.now() > entry.expiresAt) return null
    return normalizePlaybackEpisodes(entry.data)
  } catch {
    return null
  }
}

export function writeCachedEpisodes(animeId: string | number, data: AnimeEpisode[]) {
  const store = storage()
  if (!store) return
  const normalized = normalizePlaybackEpisodes(data)
  const entry: EpisodeCacheEntry = {
    data: normalized,
    expiresAt: Date.now() + EPISODE_TTL_MS,
  }
  try {
    store.setItem(episodesKey(animeId), JSON.stringify(entry))
  } catch {
    // 本地缓存空间不足时不影响播放。
  }
}

export function readSelectedEpisodeId(animeId: string | number) {
  const store = storage()
  const value = store?.getItem(selectedEpisodeKey(animeId))
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function writeSelectedEpisodeId(animeId: string | number, episodeId: string | number) {
  try {
    storage()?.setItem(selectedEpisodeKey(animeId), String(episodeId))
  } catch {
    // 选集记忆是体验优化，失败时保持默认首集。
  }
}

export function readEpisodeProgress(animeId: string | number, episodeId: string | number) {
  const store = storage()
  if (!store) return 0
  try {
    const raw = store.getItem(progressKey(animeId, episodeId))
    if (!raw) return 0
    const entry = JSON.parse(raw) as ProgressCacheEntry
    if (Date.now() - entry.updatedAt > MAX_PROGRESS_AGE_MS) return 0
    if (entry.episodeId !== Number(episodeId)) return 0
    if (!Number.isFinite(entry.currentTime) || entry.currentTime < 1) return 0
    if (Number.isFinite(entry.duration) && entry.duration > 0 && entry.duration - entry.currentTime < 10) return 0
    return entry.currentTime
  } catch {
    return 0
  }
}

export function writeEpisodeProgress(animeId: string | number, episode: AnimeEpisode, video: HTMLVideoElement) {
  if (!Number.isFinite(video.currentTime) || video.currentTime < 1) return
  const entry: ProgressCacheEntry = {
    episodeId: episode.id,
    currentTime: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    updatedAt: Date.now(),
  }
  try {
    storage()?.setItem(progressKey(animeId, episode.id), JSON.stringify(entry))
  } catch {
    // 观看进度缓存失败不阻断播放器。
  }
}

export function warmMediaSource(url: string) {
  if (!canUseUrl(url)) return
  const parsed = new URL(url, window.location.href)
  const origin = parsed.origin
  for (const rel of ['dns-prefetch', 'preconnect']) {
    if (document.head.querySelector(`link[data-rel="${MEDIA_LINK_REL}"][rel="${rel}"][href="${origin}"]`)) continue
    const link = document.createElement('link')
    link.rel = rel
    link.href = origin
    link.crossOrigin = 'anonymous'
    link.dataset.rel = MEDIA_LINK_REL
    document.head.appendChild(link)
  }
}

export function prefetchHlsManifest(episode?: AnimeEpisode | null) {
  if (!episode || !isHlsEpisode(episode) || !canUseUrl(episode.playbackUrl)) return
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS)
  void fetch(episode.playbackUrl, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'force-cache',
    signal: controller.signal,
  }).catch(() => undefined).finally(() => window.clearTimeout(timer))
}

export function prefetchNeighborEpisodes(list: AnimeEpisode[], selected?: AnimeEpisode | null) {
  if (!selected) return
  warmMediaSource(selected.playbackUrl)
  const currentIndex = list.findIndex((episode) => episode.id === selected.id)
  if (currentIndex >= 0) {
    const next = list[currentIndex + 1]
    if (next) {
      // 只预取体积很小的清单，不提前下载下一集视频分片。
      warmMediaSource(next.playbackUrl)
      prefetchHlsManifest(next)
    }
  }
}
