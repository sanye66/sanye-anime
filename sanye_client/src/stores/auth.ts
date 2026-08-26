import { defineStore } from 'pinia'
import { buildCasLoginUrl, clearSession, getAccessToken, isLoggedIn, setSession } from '@/auth/session'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    loggedIn: isLoggedIn(),
    user: null as { id: number; nickname: string } | null,
  }),
  getters: {
    token: (): string | null => getAccessToken(),
  },
  actions: {
    setSession(access: string, refresh: string): void {
      // 保存 CAS 会话并同步 Pinia 登录状态。
      setSession(access, refresh)
      this.loggedIn = true
    },
    logout(): void {
      // 清除本地会话和页面用户状态，后续请求回到匿名模式。
      clearSession()
      this.loggedIn = false
      this.user = null
    },
    loginRedirect(): void {
      // 将当前页面交给 CAS，登录完成后由路由守卫处理 ticket。
      window.location.assign(buildCasLoginUrl(window.location.href))
    },
  },
})
