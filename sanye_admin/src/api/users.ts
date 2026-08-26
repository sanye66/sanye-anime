import { httpRaw } from './http'

export interface AdminSysUser {
  userId: number
  userName: string
  nickName: string
  dept?: { deptName?: string }
  phonenumber?: string
  email?: string
  sex?: string
  status: string
  createTime?: string
  loginIp?: string
  loginDate?: string
  remark?: string
  admin?: boolean
}

export interface UserListResponse {
  code: number
  msg: string
  rows: AdminSysUser[]
  total: number
}

export interface UserActionResponse {
  code: number
  msg: string
}

export interface UserQuery {
  pageNum: number
  pageSize: number
  userName?: string
  phonenumber?: string
  status?: string
}

export const adminUserApi = {
  /** 分页查询系统用户。 */
  list: (query: UserQuery) => {
    const params = new URLSearchParams()
    params.set('pageNum', String(query.pageNum))
    params.set('pageSize', String(query.pageSize))
    if (query.userName) params.set('userName', query.userName)
    if (query.phonenumber) params.set('phonenumber', query.phonenumber)
    if (query.status) params.set('status', query.status)
    return httpRaw.get<UserListResponse>(`/admin/system/user/list?${params.toString()}`)
  },
  /** 查询系统用户详情。 */
  detail: (userId: number) =>
    httpRaw.get<{ code: number; msg: string; data: AdminSysUser }>(`/admin/system/user/${userId}`),
  /** 修改用户启用状态。 */
  changeStatus: (userId: number, status: string) =>
    httpRaw.put<UserActionResponse>('/admin/system/user/changeStatus', { userId, status }),
  /** 重置用户密码。 */
  resetPwd: (userId: number, password: string) =>
    httpRaw.put<UserActionResponse>('/admin/system/user/resetPwd', { userId, password }),
}
