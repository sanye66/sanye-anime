import { httpRaw } from './http'

export interface AdminOperLog {
  operId: number
  title: string
  businessType: number
  method: string
  requestMethod: string
  operatorType: number
  operName: string
  deptName?: string
  operUrl: string
  operIp: string
  operLocation?: string
  operParam?: string
  jsonResult?: string
  status: number
  errorMsg?: string
  operTime?: string
  costTime?: number
}

export interface AdminLoginLog {
  infoId: number
  userName: string
  status: string
  ipaddr: string
  loginLocation?: string
  browser?: string
  os?: string
  msg?: string
  loginTime?: string
}

export interface LogListResponse<T> {
  code: number
  msg: string
  rows: T[]
  total: number
}

export interface AuditQuery {
  pageNum: number
  pageSize: number
  keyword?: string
  status?: string
}

export const adminAuditApi = {
  /** 分页查询操作日志。 */
  operlogList: (query: AuditQuery) => {
    const params = new URLSearchParams()
    params.set('pageNum', String(query.pageNum))
    params.set('pageSize', String(query.pageSize))
    if (query.keyword) params.set('operName', query.keyword)
    if (query.status) params.set('status', query.status)
    return httpRaw.get<LogListResponse<AdminOperLog>>(`/admin/monitor/operlog/list?${params.toString()}`)
  },
  /** 查询操作日志详情。 */
  operlogDetail: (operId: number) =>
    httpRaw.get<{ code: number; msg: string; data: AdminOperLog }>(`/admin/monitor/operlog/${operId}`),
  /** 分页查询登录日志。 */
  logininforList: (query: AuditQuery) => {
    const params = new URLSearchParams()
    params.set('pageNum', String(query.pageNum))
    params.set('pageSize', String(query.pageSize))
    if (query.keyword) params.set('userName', query.keyword)
    if (query.status) params.set('status', query.status)
    return httpRaw.get<LogListResponse<AdminLoginLog>>(`/admin/monitor/logininfor/list?${params.toString()}`)
  },
  /** 查询登录日志详情。 */
  logininforDetail: (infoId: number) =>
    httpRaw.get<{ code: number; msg: string; data: AdminLoginLog }>(`/admin/monitor/logininfor/${infoId}`),
}

export const OPER_TYPE_LABELS: Record<number, string> = {
  0: '其它',
  1: '新增',
  2: '修改',
  3: '删除',
  4: '授权',
  5: '导出',
  6: '导入',
  7: '强退',
  8: '生成代码',
  9: '清空数据',
}

const SENSITIVE_KEY_RE =
  /"((?:password|oldPassword|newPassword|confirmPassword|token|accessToken|refreshToken|access_token|refresh_token|secret|clientSecret|client_secret|apiKey|api_key|authorization))"\s*:\s*"([^"]*)"/gi

/**
 * 展示层兜底脱敏：操作日志请求参数/返回结果中的凭证类字段统一掩码为 ***，
 * 防止后端偶发未过滤或历史脏数据把明文令牌/口令展示给有审计权限的人。
 */
export function maskSensitiveJson(text?: string): string {
  // 在审计页面再次掩码凭证字段，防止历史日志中的明文直接展示。
  if (!text) return text ?? ''
  return text.replace(SENSITIVE_KEY_RE, '"$1":"***"')
}
