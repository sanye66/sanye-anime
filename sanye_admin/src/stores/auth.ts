import { defineStore } from 'pinia'
import { adminAuthApi } from '@/api/admin'
import { buildAdminLoginUrl, clearSession, getAccessToken, isLoggedIn, setSession } from '@/auth/session'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    loggedIn: isLoggedIn(),
    user: null as { id: number; nickname: string } | null,
    permissions: [] as string[],
    serverRoutes: [] as string[],
  }),
  getters: {
    token: (): string | null => getAccessToken(),
  },
  actions: {
    setSession(access: string, refresh: string): void {
      // 保存登录令牌并同步管理端登录状态。
      setSession(access, refresh)
      this.loggedIn = true
    },
    logout(): void {
      // 清理权限、动态路由和本地会话，避免残留权限继续显示。
      clearSession()
      this.loggedIn = false
      this.user = null
      this.permissions = []
      this.serverRoutes = []
    },
    async loadUser(): Promise<void> {
      // 读取当前管理员信息和服务端路由，用于控制菜单与页面访问。
      if (!this.loggedIn) return
      try {
        const info = await adminAuthApi.getInfo()
        this.user = { id: info.user.userId, nickname: info.user.nickName }
        this.permissions = info.permissions ?? []
        try {
          const routers = await adminAuthApi.getRouters()
          const paths = new Set<string>()
          const collect = (items: unknown[]) => {
            for (const item of items) {
              if (!item || typeof item !== 'object') continue
              const route = item as { path?: unknown; children?: unknown }
              if (typeof route.path === 'string' && route.path) paths.add(route.path.startsWith('/') ? route.path : `/${route.path}`)
              if (Array.isArray(route.children)) collect(route.children)
            }
          }
          collect(routers.data ?? [])
          this.serverRoutes = [...paths]
        } catch {
          this.serverRoutes = []
        }
      } catch {
        // 保持现状，由后续请求兜底
      }
    },
    hasPerm(perm: string): boolean {
      // 超级管理员拥有通配权限，其余账号按精确权限匹配。
      return this.permissions.includes('*:*:*') || this.permissions.includes(perm)
    },
    hasRoute(path: string): boolean {
      // 判断服务端返回的动态路由是否允许进入对应管理页。
      return this.permissions.includes('*:*:*') || this.serverRoutes.includes(path)
    },
    loginRedirect(): void {
      // 跳转到配置的管理端登录入口。
      window.location.assign(buildAdminLoginUrl())
    },
  },
})
