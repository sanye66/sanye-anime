import { http } from './http'
import type { AnimeCard } from './types'

export interface PublicHomeResponse {
  picks: AnimeCard[]
}

export interface PublicLegalDocument {
  key: string
  title: string
  content: string
  updatedAt: string
}

export const publicApi = {
  // 官网公开内容只读取已发布精选和法律正文。
  /** 获取官网精选作品。 */
  home: () => http.get<PublicHomeResponse>('/public/home'),
  /** 获取官网公开法律正文。 */
  legal: () => http.get<PublicLegalDocument[]>('/public/legal'),
}
