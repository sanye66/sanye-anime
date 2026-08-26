const ACCESS_KEY = 'sanye_access_token'
const REFRESH_KEY = 'sanye_refresh_token'
const DEVICE_KEY = 'sanye_device_id'

let accessToken: string | null = localStorage.getItem(ACCESS_KEY)

/** 保存访问令牌和刷新令牌，并立即更新当前标签页内存状态。 */
export function setSession(access: string, refresh: string): void {
  // 同步内存令牌和本地持久化令牌，确保当前标签页立即生效。
  accessToken = access
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

/** 返回当前标签页内存中的访问令牌。 */
export function getAccessToken(): string | null {
  return accessToken
}

/** 读取持久化 refreshToken，供刷新接口交换新会话。 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

/** 清除访问令牌和刷新令牌，使后续请求回到匿名模式。 */
export function clearSession(): void {
  // 注销或刷新失败时同时清理两个令牌，避免继续携带失效凭证。
  accessToken = null
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

/** 根据当前访问令牌判断是否存在本地登录态。 */
export function isLoggedIn(): boolean {
  return Boolean(accessToken)
}

/** 读取或创建稳定设备号，匿名接口据此维持设备维度状态。 */
export function getDeviceId(): string {
  // 匿名能力依赖稳定设备号，首次访问时生成并持久化。
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = createDeviceId()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

/** 生成匿名设备号，浏览器不支持 UUID 时使用时间和随机串兜底。 */
function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 构造 CAS 登录地址，并编码回调 service 以恢复原页面。 */
export function buildCasLoginUrl(service: string): string {
  // 将当前页面作为 service 编码后交给 CAS，回调时可恢复原始页面。
  const base = ((import.meta.env.VITE_CAS_LOGIN_URL as string | undefined) ?? '/cas/login').replace(/\/$/, '')
  return `${base}?service=${encodeURIComponent(service)}`
}
