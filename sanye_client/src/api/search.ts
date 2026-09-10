import { http, type RequestOptions } from './http'
import type { PageResult } from './types'

export interface SearchHit {
  id: number
  title: string
  titleHighlight?: string
  originalTitle: string
  type: string
  year: number
  score: number
  status: string
  coverUrl?: string
  tags: string[]
  updateText?: string
  summaryHighlight?: string
}

export interface ExternalSearchHit {
  title: string
  sourceUrl: string
  coverUrl?: string
  summary?: string
  type?: string
}

export interface SearchParams {
  keyword?: string
  type?: string
  status?: string
  year?: number
  yearBefore?: number
  page?: number
  size?: number
}

export const searchApi = {
  // 搜索参数使用 URLSearchParams 编码，避免中文关键词破坏查询串。
  /** 执行全文搜索并返回分页结果。 */
  search: (params: SearchParams = {}, options?: RequestOptions) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') qs.set(key, String(value))
    })
    const query = qs.toString()
    return http.get<PageResult<SearchHit>>(`/search${query ? `?${query}` : ''}`, options)
  },
  /** 查询授权外部搜索页候选，点击后可导入观看。 */
  external: (keyword: string, size = 20, type?: string, options?: RequestOptions) => {
    const qs = new URLSearchParams({ keyword, size: String(size) })
    if (type) qs.set('type', type)
    return http.get<ExternalSearchHit[]>(`/search/external?${qs}`, options)
  },
  /** 只读取别名对应的最高相关结果，完整原词结果由 external 随后补齐。 */
  externalPreferred: (keyword: string, size = 20, type?: string, options?: RequestOptions) => {
    const qs = new URLSearchParams({ keyword, size: String(size), preferredOnly: 'true' })
    if (type) qs.set('type', type)
    return http.get<ExternalSearchHit[]>(`/search/external?${qs}`, options)
  },
}
