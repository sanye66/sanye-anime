import { http } from './http'

export interface CasSession {
  accessToken: string
  refreshToken: string
  expiresIn: number
  isNewAccount: boolean
  user: { id: number; username: string; nickname: string }
}

export const authApi = {
  // CAS 登录相关接口只负责会话交换，令牌保存由 session 模块统一处理。
  /** 获取 CAS 登录地址。 */
  casLoginUrl: (service: string) => http.get<{ redirectUrl: string }>(`/auth/cas/login?service=${encodeURIComponent(service)}`),
  /** 用 CAS ticket 换取本地会话。 */
  casCallback: (ticket: string, service: string) =>
    http.get<CasSession>(`/auth/cas/callback?ticket=${encodeURIComponent(ticket)}&service=${encodeURIComponent(service)}`),
  /** 轮换本地刷新令牌。 */
  refresh: (refreshToken: string) => http.post<CasSession>('/auth/cas/refresh', { refreshToken }),
  /** 注销本地刷新令牌并获取 CAS 登出地址。 */
  logout: (refreshToken: string | null) => http.post<{ redirectUrl: string }>('/auth/cas/logout', { refreshToken }),
}
