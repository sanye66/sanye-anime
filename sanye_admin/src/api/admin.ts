import { http, type RequestOptions } from './http'
import { httpRaw } from './http'

export type AnimeStatus = '已发布' | '待审核' | '草稿' | '已下架'
export type FeedbackStatus = '待处理' | '处理中' | '已关闭'

export interface AdminAnime {
  id: string
  title: string
  originalTitle: string
  type: string
  source: string
  status: AnimeStatus
  updated: string
}

export interface AdminAnimeDetail {
  id: string
  title: string
  originalTitle: string
  type: string
  year: number
  summary: string
  tags: string[]
  updateText: string
  coverUrl: string
  sourceUrl: string
  source: string
  status: AnimeStatus
  updated: string
}

export interface AnimeDraftBody {
  title: string
  originalTitle?: string
  type: string
  year?: number
  summary?: string
  tags?: string
  updateText?: string
  sourceUrl?: string
  coverUrl?: string
}

export interface AnimeUrlImportResult {
  anime: AdminAnimeDetail
  episodesImported: number
}

export interface AdminFeedback {
  id: string
  title: string
  user: string
  type: string
  priority: '高' | '中' | '低'
  time: string
  status: FeedbackStatus
  content?: string
  contact?: string
}

export type LegalStatus = '草稿' | '已发布'

export interface AdminLegalDocument {
  key: 'privacy' | 'terms' | 'copyright' | 'contact'
  title: string
  content: string
  status: LegalStatus
  updatedBy: string
  updatedAt: string
}

export const adminApi = {
  // 管理代理接口将 RuoYi 路径映射到动画、反馈和官网正文服务。
  /** 查询作品管理列表。 */
  anime: () => http.get<AdminAnime[]>('/admin/anime'),
  /** 查询作品管理详情。 */
  animeDetail: (id: string) => http.get<AdminAnimeDetail>(`/admin/anime/${id}`),
  /** 创建作品草稿。 */
  animeCreate: (body: AnimeDraftBody) => http.post<AdminAnimeDetail>('/admin/anime', body),
  /** 使用授权 URL 一键导入作品简介、封面和视频资源。 */
  animeImportUrl: (sourceUrl: string, publish: boolean, options?: RequestOptions) =>
    http.post<AnimeUrlImportResult>('/admin/anime/import-url', { sourceUrl, publish }, {
      ...options,
      timeout: options?.timeout ?? 60_000,
    }),
  /** 更新作品内容。 */
  animeUpdate: (id: string, body: AnimeDraftBody) => http.patch<AdminAnimeDetail>(`/admin/anime/${id}`, body),
  /** 更新作品发布状态。 */
  animeStatus: (id: string, status: AnimeStatus) => http.patch<AdminAnime>(`/admin/anime/${id}/status`, { status }),
  /** 导入授权来源页面的剧集媒体元数据。 */
  animeEpisodesImport: (id: string, sourceUrl: string, options?: RequestOptions) =>
    http.post<Array<{ id: number; episodeNo: number; title: string }>>(`/admin/anime/${id}/episodes/import`, { sourceUrl }, {
      ...options,
      timeout: options?.timeout ?? 60_000,
    }),
  /** 查询反馈管理列表。 */
  feedback: () => http.get<AdminFeedback[]>('/admin/feedback'),
  /** 更新反馈处理状态。 */
  feedbackStatus: (id: string, status: FeedbackStatus) => http.patch<AdminFeedback>(`/admin/feedback/${id}`, { status }),
  /** 查询官网法律正文列表。 */
  legal: () => http.get<AdminLegalDocument[]>('/admin/legal'),
  /** 保存或发布官网法律正文。 */
  legalSave: (key: string, body: { title: string; content: string; status: LegalStatus }) =>
    http.put<AdminLegalDocument>(`/admin/legal/${key}`, body),
}

export interface AdminLoginResponse {
  code: number
  msg: string
  token: string
}

export interface AdminUserInfo {
  user: { userId: number; userName: string; nickName: string }
  roles: string[]
  permissions: string[]
}

export interface AdminDashboardStats {
  animeTotal: number
  animePublished: number
  animeReview: number
  animeOffline: number
  feedbackTotal: number
  feedbackPending: number
  feedbackProcessing: number
  feedbackClosed: number
  jobs: number
  users: number
  aiTotalConversations: number
  aiTotalMessages: number
  aiTodayConversations: number
  aiTodayMessages: number
  aiTotalCostCents: number
  aiTodayCostCents: number
  aiTotalPromptTokens: number
  aiTotalCompletionTokens: number
  aiUsageTrend: Array<{ day: string; conversations: number; messages: number; costCents: number }>
  failedJobs: number
}

export interface AdminDashboardStatsEnvelope {
  code: number
  msg: string
  data: AdminDashboardStats
}

export const adminAuthApi = {
  // 管理登录和路由信息使用 RuoYi 原始响应结构。
  /** 登录 RuoYi 管理平台。 */
  login: (username: string, password: string) =>
    httpRaw.post<AdminLoginResponse>('/admin/login', { username, password }),
  /** 读取当前管理员信息和权限。 */
  getInfo: () => httpRaw.get<AdminUserInfo>('/admin/getInfo'),
  /** 通知后端注销当前会话。 */
  logout: () => http.post<void>('/admin/logout'),
  /** 读取服务端动态路由。 */
  getRouters: () => httpRaw.get<{ code: number; msg: string; data: unknown[] }>('/admin/getRouters'),
}

export const adminDashboardApi = {
  // 仪表盘接口返回聚合后的内容、反馈、任务和 AI 指标。
  /** 读取管理端仪表盘统计快照。 */
  stats: () => httpRaw.get<AdminDashboardStatsEnvelope>('/admin/dashboard/stats'),
}
