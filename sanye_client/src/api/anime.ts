import { http, type RequestOptions } from './http'
import type { AnimeCard, AnimeDetail, AnimeEpisode, PageResult } from './types'

export interface AnimeUrlImportResult {
  anime: {
    id: string | number
    title: string
    status: string
  }
  episodesImported: number
}

export interface AnimeUrlPreviewResult {
  title: string
  originalTitle: string
  type: string
  year?: number
  summary?: string
  tags: string[]
  updateText?: string
  coverUrl?: string
  sourceUrl: string
  episodes: AnimeEpisode[]
}

export interface HomeBanner {
  animeId: number
  title: string
  imageUrl?: string
  tagline?: string
}

export interface HomeSection {
  key: string
  title: string
  anime: AnimeCard[]
}

export interface HomeResponse {
  banners: HomeBanner[]
  sections: HomeSection[]
  quickLinks: unknown[]
}

export interface AnimeListParams {
  keyword?: string
  type?: string
  status?: string
  year?: number
  yearBefore?: number
  page?: number
  size?: number
}

export const animeApi = {
  // 动漫目录接口与服务端公开路由保持一一对应。
  /** 获取首页聚合。 */
  home: (tab = 'FEATURED', options?: RequestOptions) => http.get<HomeResponse>(`/home?tab=${encodeURIComponent(tab)}`, options),
  /** 按条件查询动漫分页。 */
  list: (params: AnimeListParams = {}, options?: RequestOptions) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') qs.set(key, String(value))
    })
    const query = qs.toString()
    return http.get<PageResult<AnimeCard>>(`/anime${query ? `?${query}` : ''}`, options)
  },
  /** 获取作品详情。 */
  detail: (id: string | number, options?: RequestOptions) => http.get<AnimeDetail>(`/anime/${id}`, options),
  /** 获取已发布作品的剧集媒体元数据。 */
  episodes: (id: string | number, options?: RequestOptions) => http.get<AnimeEpisode[]>(`/anime/${id}/episodes`, options),
  /** 降级导入：审核链路不可用时由客户端直接提交白名单 URL。 */
  importUrlFallback: (sourceUrl: string, options?: RequestOptions) =>
    http.post<AnimeUrlImportResult>('/anime/import-url', { sourceUrl }, { ...options, timeout: options?.timeout ?? 60_000 }),
  /** 读取外部作品预览数据，供站内播放器直接观看，不写入片库。 */
  previewUrl: (sourceUrl: string, options?: RequestOptions) =>
    http.get<AnimeUrlPreviewResult>(`/anime/external-preview?sourceUrl=${encodeURIComponent(sourceUrl)}`, {
      ...options,
      timeout: options?.timeout ?? 60_000,
    }),
}
