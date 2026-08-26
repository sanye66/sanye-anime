export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  requestId: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  size: number
  total: number
  totalPages: number
}

export const ErrorCode = {
  PARAM_INVALID: 1001,
  RATE_LIMITED: 1002,
  UNAUTHORIZED: 2001,
  FORBIDDEN: 2002,
  NOT_FOUND: 2003,
  BAD_STATE: 3001,
  QUOTA_EXHAUSTED: 3002,
  AI_PROVIDER_ERROR: 4001,
  SEARCH_UNAVAILABLE: 4002,
  SERVICE_UNAVAILABLE: 5002,
  INTERNAL_ERROR: 5001,
} as const

export interface UserSummary {
  id: number
  username: string
  nickname: string
  avatarUrl?: string
  status: string
}

export interface AnimeCard {
  id: number
  title: string
  originalTitle: string
  type: string
  year?: number
  score?: number
  status: string
  coverUrl?: string
  tags: string[]
  updateText?: string
}

export interface AnimeDetail {
  id: number
  title: string
  originalTitle: string
  type: string
  year?: number
  score?: number
  status: string
  coverUrl?: string
  tags: string[]
  updateText?: string
  summary?: string
  characters?: { name: string; role: string; avatarUrl?: string }[]
  similar?: AnimeCard[]
  schedule?: { episodeNo: number; airDate: string; status: string }[]
  isFavorite?: boolean
  source?: string
}

/** 播放页声明的一条备用线路；播放器只消费地址，不负责下载第三方媒体。 */
export interface AnimePlaybackOption {
  url: string
  mimeType: string
  label?: string
}

/** 作品剧集媒体元数据；播放器只消费地址，不负责下载第三方媒体。 */
export interface AnimeEpisode {
  id: number
  episodeNo: number
  title: string
  sourcePageUrl: string
  playbackUrl: string
  mimeType: string
  sourceLabel?: string
  playbackOptions?: AnimePlaybackOption[]
}

export interface Conversation {
  id: number
  title: string
  status: string
  spoilerMode: string
  contextAnimeId?: number
  lastMessage?: string
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: number
  conversationId: number
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  content: string
  status: string
  generateTry: number
  recommendations?: { animeId: number; title: string; reason: string }[]
  createdAt: string
}

export interface QuotaInfo {
  used: number
  limit: number
  resetAt: string
  anonymous: boolean
}
