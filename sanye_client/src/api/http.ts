import { buildCasLoginUrl, clearSession, getAccessToken, getDeviceId, getRefreshToken, setSession } from '@/auth/session'
import { ErrorCode } from './types'
import { desktopMode } from '@/desktop'

export class ApiError extends Error {
  /** 保存业务错误码和请求编号，供页面提示与问题追踪使用。 */
  constructor(
    public readonly code: number,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message)
  }
}

const DEFAULT_TIMEOUT = 10_000
const MAX_GET_RETRIES = 1

interface ApiEnvelope {
  code?: number
  message?: string
  data?: unknown
  requestId?: string
}

/** 生成客户端链路编号，优先使用浏览器 UUID 以降低碰撞概率。 */
export function createRequestId(): string {
  // 优先使用浏览器原生 UUID，为每个请求生成可跨服务追踪的编号。
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * 后端返回的相对资源路径（如 /covers/anime-1.svg）统一解析到网关地址。
 */
export function resolveAssetUrl(path?: string): string | undefined {
  // 将后端相对资源路径拼接到网关地址，绝对 URL 保持原样。
  if (!path) return path
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) return path
  if (!path.startsWith('/')) return path
  if (desktopMode) return path
  // 正式目录的优化封面随客户端发布，避免每次从管理端下载原始大图。
  if (path === '/client-covers/your-name.jpg') return path
  const gateway = ((import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? 'http://localhost:8091').replace(/\/$/, '')
  return `${gateway}${path}`
}

/** 解析 API 基础地址：开发环境直连网关，避免 Vite 代理带来的本地加载延迟。 */
export function resolveApiBaseUrl(): string {
  return ((import.meta.env.VITE_API_BASE_URL as string | undefined)
    ?? (import.meta.env.DEV ? 'http://localhost:8091/api/v1' : '/api/v1')).replace(/\/$/, '')
}

export interface RequestOptions {
  timeout?: number
  retries?: number
  signal?: AbortSignal
}

/** 判断请求是否由页面切换主动取消，而不是接口真的失败。 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

type RefreshOutcome = 'refreshed' | 'invalid' | 'unavailable'

let refreshInFlight: Promise<RefreshOutcome> | null = null

/**
 * 单飞 refresh：并发 401 只发起一次 refresh，其余请求复用同一个 Promise，
 * 避免多请求同时用旧 refreshToken 轮换导致令牌一次性失效的竞态。
 */
async function doRefresh(): Promise<RefreshOutcome> {
  // 只使用 refreshToken 调用刷新接口，避免把旧 accessToken 带入刷新流程。
  const refresh = getRefreshToken()
  if (!refresh) return 'invalid'
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 10_000)
  try {
    const base = resolveApiBaseUrl()
    const res = await fetch(`${base}/auth/cas/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': getDeviceId() },
      body: JSON.stringify({ refreshToken: refresh }),
      signal: controller.signal,
    })
    const text = await res.text()
    const body = text ? (JSON.parse(text) as ApiEnvelope) : null
    if (body?.code === 0 && body.data) {
      const data = body.data as { accessToken: string; refreshToken: string }
      setSession(data.accessToken, data.refreshToken)
      return 'refreshed'
    }
    if (res.status >= 500 || body?.code === ErrorCode.SERVICE_UNAVAILABLE || body?.code === ErrorCode.INTERNAL_ERROR) {
      return 'unavailable'
    }
    return 'invalid'
  } catch {
    return 'unavailable'
  } finally {
    window.clearTimeout(timer)
    refreshInFlight = null
  }
}

/** 合并并发 refresh 调用，避免同一令牌被多个请求同时轮换。 */
function refreshOnce(): Promise<RefreshOutcome> {
  // 合并并发刷新请求，避免多个 401 同时轮换同一个 refreshToken。
  if (!refreshInFlight) {
    refreshInFlight = doRefresh()
  }
  return refreshInFlight
}

/** 执行统一 JSON 请求，集中处理超时、刷新、重试、错误码和请求编号。 */
async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {},
                          retriedAuth = false): Promise<T> {
  // 统一处理请求编号、设备身份、超时、鉴权刷新、GET 重试和业务错误。
  const base = resolveApiBaseUrl()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT)
  const externalSignal = options.signal
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  const method = (init.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'X-Request-Id': createRequestId(),
    'X-Device-Id': getDeviceId(),
    ...(init.headers as Record<string, string> | undefined),
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const token = getAccessToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const retries = options.retries ?? (method === 'GET' ? MAX_GET_RETRIES : 0)
  try {
    const res = await fetch(`${base}${path}`, { ...init, headers, signal: controller.signal })
    const text = await res.text()
    let parsed: ApiEnvelope | null = null
    if (text) {
      try {
        parsed = JSON.parse(text) as ApiEnvelope
      } catch {
        parsed = null
      }
    }
    const body = parsed
    if (!res.ok || (body && body.code !== 0)) {
      const code = body?.code ?? res.status
      if (code === ErrorCode.UNAUTHORIZED && !desktopMode) {
        if (!retriedAuth) {
          const outcome = await refreshOnce()
          if (outcome === 'refreshed') {
            return request<T>(path, init, options, true)
          }
          if (outcome === 'invalid') {
            clearSession()
            const current = window.location.href
            if (!current.includes('/auth/cas/callback') && !current.includes('/auth/cas/')) {
              window.location.assign(buildCasLoginUrl(current))
            }
            throw new ApiError(code, '登录状态已失效，请重新登录', body?.requestId)
          }
          // refresh 服务暂不可用：保留会话、不跳转，仅提示稍后重试
          throw new ApiError(ErrorCode.SERVICE_UNAVAILABLE, '登录状态刷新失败，请稍后重试', body?.requestId)
        }
        clearSession()
        const current = window.location.href
        if (!current.includes('/auth/cas/callback') && !current.includes('/auth/cas/')) {
          window.location.assign(buildCasLoginUrl(current))
        }
      }
      throw new ApiError(code, body?.message ?? `请求失败（HTTP ${res.status}）`, body?.requestId)
    }
    return body?.data as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (externalSignal?.aborted) throw err
    if (retries > 0) {
      return request<T>(path, init, { ...options, retries: retries - 1 })
    }
    if (isAbortError(err)) {
      throw new ApiError(ErrorCode.RATE_LIMITED, '请求超时，请稍后重试')
    }
    throw new ApiError(ErrorCode.INTERNAL_ERROR, '网络异常，请检查网络后重试')
  } finally {
    window.clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }
}

export const http = {
  // 这些方法只负责组装 HTTP 动词和 JSON 请求体，具体策略统一收口到 request。
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: 'GET' }, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: 'DELETE' }, options),
}
