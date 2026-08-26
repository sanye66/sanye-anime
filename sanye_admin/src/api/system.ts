import { http } from './http'
import { httpRaw } from './http'

export interface FrontendErrorPayload {
  type: string
  message: string
  stack?: string
  url?: string
  detail?: string
}

export function reportFrontendError(payload: FrontendErrorPayload): void {
  // 监控上报采用尽力而为策略，不让上报失败影响管理操作。
  void http
    .post('/monitor/frontend-errors', {
      ...payload,
      url: window.location.href,
    })
    .catch(() => undefined)
}

export interface AdminRole {
  roleId: number
  roleName: string
  roleKey: string
  roleSort: number
  status: string
  dataScope?: string
  menuCheckStrictly?: boolean
  remark?: string
  createTime?: string
  menuIds?: number[]
}

export interface AdminMenu {
  menuId: number
  menuName: string
  parentId: number
  parentName?: string
  orderNum: number
  path?: string
  component?: string
  routeName?: string
  menuType: 'M' | 'C' | 'F'
  visible: string
  status: string
  perms?: string
  icon?: string
  children?: AdminMenu[]
}

export interface AdminTableResponse<T> {
  code: number
  msg: string
  rows: T[]
  total: number
}

export interface AdminActionResponse {
  code: number
  msg: string
}

export interface RoleMenuTreeResponse {
  code: number
  msg: string
  checkedKeys: number[]
  menus: AdminMenu[]
}

export interface AdminRoleBody {
  roleId?: number
  roleName: string
  roleKey: string
  roleSort: number
  status: string
  menuIds?: number[]
  menuCheckStrictly?: boolean
  remark?: string
}

export interface AdminMenuBody {
  menuId?: number
  menuName: string
  parentId: number
  orderNum: number
  path?: string
  component?: string
  routeName?: string
  menuType: 'M' | 'C' | 'F'
  visible: string
  status: string
  perms?: string
  icon?: string
}

export const adminRoleApi = {
  list: (page: number, size: number, roleName?: string) => {
    const params = new URLSearchParams({ pageNum: String(page), pageSize: String(size) })
    if (roleName) params.set('roleName', roleName)
    return httpRaw.get<AdminTableResponse<AdminRole>>(`/admin/system/role/list?${params.toString()}`)
  },
  detail: (roleId: number) => httpRaw.get<{ code: number; msg: string; data: AdminRole }>(`/admin/system/role/${roleId}`),
  optionselect: () => httpRaw.get<{ code: number; msg: string; data: AdminRole[] }>('/admin/system/role/optionselect'),
  add: (body: AdminRoleBody) => httpRaw.post<AdminActionResponse>('/admin/system/role', body),
  edit: (body: AdminRoleBody) => httpRaw.put<AdminActionResponse>('/admin/system/role', body),
  changeStatus: (roleId: number, status: string) => httpRaw.put<AdminActionResponse>('/admin/system/role/changeStatus', { roleId, status }),
  remove: (roleIds: number[]) => httpRaw.delete<AdminActionResponse>(`/admin/system/role/${roleIds.join(',')}`),
  menuTree: (roleId: number) => httpRaw.get<RoleMenuTreeResponse>(`/admin/system/menu/roleMenuTreeselect/${roleId}`),
}

export const adminMenuApi = {
  list: (menuName?: string, menuType?: string) => {
    const params = new URLSearchParams()
    if (menuName) params.set('menuName', menuName)
    if (menuType) params.set('menuType', menuType)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return httpRaw.get<{ code: number; msg: string; data: AdminMenu[] }>(`/admin/system/menu/list${suffix}`)
  },
  detail: (menuId: number) => httpRaw.get<{ code: number; msg: string; data: AdminMenu }>(`/admin/system/menu/${menuId}`),
  add: (body: AdminMenuBody) => httpRaw.post<AdminActionResponse>('/admin/system/menu', body),
  edit: (body: AdminMenuBody) => httpRaw.put<AdminActionResponse>('/admin/system/menu', body),
  remove: (menuId: number) => httpRaw.delete<AdminActionResponse>(`/admin/system/menu/${menuId}`),
}
