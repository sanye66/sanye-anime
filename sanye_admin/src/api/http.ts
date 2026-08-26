import { buildAdminLoginUrl, clearSession, getAccessToken, getDeviceId } from '@/auth/session'
import { ErrorCode } from './types'

export class ApiError extends Error {
  /** 保存管理端业务错误码和链路编号，供页面提示和审计排查使用。 */
  constructor(
    public readonly code: number,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message)
  }
}

const DEFAULT_TIMEOUT = 10_000

interface ApiEnvelope {
  code?: number
  message?: string
  msg?: string
  data?: unknown
  requestId?: string
}

/** 生成管理端链路编号，便于把页面请求与服务端审计日志关联。 */
export function createRequestId(): string {
  // 为每次管理请求生成链路编号，便于与后端审计日志关联。
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface RequestOptions {
  timeout?: number
}

/** 兼容 RuoYi 业务码和 HTTP 状态码，统一判断是否需要重新登录。 */
function isUnauthorized(code: number, status: number): boolean {
  // 统一识别 RuoYi 业务码和 HTTP 状态码中的未授权情况。
  return code === ErrorCode.UNAUTHORIZED || code === 401 || status === 401
}

/** 处理管理端业务响应、超时、令牌注入和未授权跳转。 */
async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const base = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1').replace(/\/$/, '')
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT)
  const headers: Record<string, string> = {
    'X-Request-Id': createRequestId(),
    'X-Device-Id': getDeviceId(),
    ...(init.headers as Record<string, string> | undefined),
  }
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`
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
    const success = res.ok && body && (body.code === 0 || body.code === 200)
    if (!success) {
      const code = body?.code ?? res.status
      if (isUnauthorized(code, res.status)) {
        clearSession()
        window.location.assign(buildAdminLoginUrl())
      }
      throw new ApiError(code, body?.msg ?? body?.message ?? `请求失败（HTTP ${res.status}）`, body?.requestId)
    }
    return body?.data as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(ErrorCode.RATE_LIMITED, '请求超时，请稍后重试')
    }
    throw new ApiError(ErrorCode.INTERNAL_ERROR, '网络异常，请检查网络后重试')
  } finally {
    window.clearTimeout(timer)
  }
}

/** 保留 RuoYi 顶层 code/msg/data/rows 字段，供登录和表格接口使用。 */
async function requestRaw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1').replace(/\/$/, '')
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)
  const headers: Record<string, string> = {
    'X-Request-Id': createRequestId(),
    'X-Device-Id': getDeviceId(),
    ...(init.headers as Record<string, string> | undefined),
  }
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`
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
    const success = res.ok && parsed && (parsed.code === 0 || parsed.code === 200)
    if (!success) {
      const code = parsed?.code ?? res.status
      if (isUnauthorized(code, res.status)) {
        clearSession()
        window.location.assign(buildAdminLoginUrl())
      }
      throw new ApiError(code, parsed?.msg ?? parsed?.message ?? `请求失败（HTTP ${res.status}）`, parsed?.requestId)
    }
    return parsed as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(ErrorCode.RATE_LIMITED, '请求超时，请稍后重试')
    }
    throw new ApiError(ErrorCode.INTERNAL_ERROR, '网络异常，请检查网络后重试')
  } finally {
    window.clearTimeout(timer)
  }
}

export const http = {
  // 业务封装自动剥离 data，适合 sanye 管理代理接口。
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: 'GET' }, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { method: 'DELETE' }, options),
}

export const httpRaw = {
  // 原始封装保留 RuoYi 响应结构，避免表格 rows/total 丢失。
  get: <T>(path: string) => requestRaw<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => requestRaw<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => requestRaw<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => requestRaw<T>(path, { method: 'DELETE' }),
}
