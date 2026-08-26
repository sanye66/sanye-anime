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
  INTERNAL_ERROR: 5001,
} as const
