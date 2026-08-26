import { http } from './http'

export interface FrontendErrorPayload {
  type: string
  message: string
  stack?: string
  url?: string
  detail?: string
}

export const systemApi = {
  // 系统探活和能力列表用于前端诊断，不承载业务写入。
  /** 检查系统存活状态。 */
  ping: () => http.get<{ pong: boolean }>('/system/ping'),
  /** 获取后端能力列表。 */
  capabilities: () => http.get<string[]>('/system/capabilities'),
}

/** 尽力上报前端异常，监控接口失败不能影响用户当前操作。 */
export function reportFrontendError(payload: FrontendErrorPayload): void {
  // 错误上报采用尽力而为策略，监控接口异常不能反过来影响页面。
  void http
    .post('/monitor/frontend-errors', {
      ...payload,
      url: window.location.href,
    })
    .catch(() => undefined)
}
