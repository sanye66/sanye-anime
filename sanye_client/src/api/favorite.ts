import { http } from './http'
import type { AnimeCard, PageResult } from './types'

export interface FavoriteItem {
  anime: AnimeCard
  createdAt: string
}

export interface HistoryItem {
  anime: AnimeCard
  lastViewAt: string
}

export const favoriteApi = {
  // 收藏与历史接口统一使用当前登录用户或设备归属。
  /** 查询收藏分页。 */
  list: (page = 1, size = 20) =>
    http.get<PageResult<FavoriteItem>>(`/users/me/favorites?page=${page}&size=${size}`),
  /** 查询作品收藏状态。 */
  status: (animeId: string | number) =>
    http.get<{ favorite: boolean }>(`/users/me/favorites/${animeId}/status`),
  /** 添加收藏。 */
  add: (animeId: string | number) => http.post<void>(`/users/me/favorites/${animeId}`),
  /** 删除收藏。 */
  remove: (animeId: string | number) => http.delete<void>(`/users/me/favorites/${animeId}`),
  /** 查询观看历史分页。 */
  history: (page = 1, size = 20) =>
    http.get<PageResult<HistoryItem>>(`/users/me/history?page=${page}&size=${size}`),
  /** 记录作品观看历史。 */
  recordView: (animeId: string | number) => http.post<void>(`/users/me/history/${animeId}`),
}
