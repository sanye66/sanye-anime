const ACCESS_KEY = 'sanye_admin_access_token'
const REFRESH_KEY = 'sanye_admin_refresh_token'
const DEVICE_KEY = 'sanye_admin_device_id'

let accessToken: string | null = localStorage.getItem(ACCESS_KEY)

/** 保存管理端访问令牌和刷新令牌，并同步当前页面内存状态。 */
export function setSession(access: string, refresh: string): void {
  // 同步内存和本地令牌，保证管理端请求立即携带最新会话。
  accessToken = access
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

/** 返回管理端当前标签页内存中的访问令牌。 */
export function getAccessToken(): string | null {
  return accessToken
}

/** 清除管理端令牌，避免鉴权失败后继续携带旧凭证。 */
export function clearSession(): void {
  // 退出或鉴权失败时清理管理端全部会话凭证。
  accessToken = null
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

/** 根据访问令牌判断管理端是否处于登录态。 */
export function isLoggedIn(): boolean {
  return Boolean(accessToken)
}

/** 读取或创建管理端联调设备号，保证请求头稳定。 */
export function getDeviceId(): string {
  // 为匿名联调请求生成稳定设备号，正式管理员请求仍以账号权限为准。
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = createDeviceId()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

/** 生成管理端联调设备号，浏览器不支持 UUID 时使用随机兜底。 */
function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `admin-device-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 构造管理端登录地址，缺省使用本地登录路由。 */
export function buildAdminLoginUrl(): string {
  // 读取部署配置的管理端登录地址，缺省回到本地登录路由。
  return ((import.meta.env.VITE_ADMIN_LOGIN_URL as string | undefined) ?? '/login').replace(/\/$/, '')
}
