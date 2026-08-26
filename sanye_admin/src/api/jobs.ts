import { httpRaw } from './http'

export interface AdminJob {
  jobId: number
  jobName: string
  jobGroup: string
  invokeTarget: string
  cronExpression: string
  misfirePolicy: string
  concurrent: string
  status: string
  createTime?: string
  remark?: string
}

export type AdminJobBody = Omit<AdminJob, 'jobId' | 'createTime'> & { jobId?: number }

export interface JobListResponse {
  code: number
  msg: string
  rows: AdminJob[]
  total: number
}

export interface JobActionResponse {
  code: number
  msg: string
}

export interface AdminJobLog {
  jobLogId: number
  jobName: string
  jobGroup: string
  invokeTarget: string
  jobMessage: string
  status: string
  exceptionInfo?: string
  startTime?: string
  endTime?: string
  createTime?: string
}

export interface JobLogListResponse {
  code: number
  msg: string
  rows: AdminJobLog[]
  total: number
}

export interface JobLogQuery {
  pageNum: number
  pageSize: number
  jobName?: string
  status?: string
}

export const adminJobApi = {
  /** 分页查询定时任务。 */
  list: (page: number, size: number) =>
    httpRaw.get<JobListResponse>(`/admin/monitor/job/list?pageNum=${page}&pageSize=${size}`),
  /** 修改定时任务运行状态。 */
  changeStatus: (jobId: number, status: string) =>
    httpRaw.put<JobActionResponse>('/admin/monitor/job/changeStatus', { jobId, status }),
  /** 立即执行定时任务。 */
  run: (job: AdminJob) => httpRaw.put<JobActionResponse>('/admin/monitor/job/run', job),
  /** 查询定时任务详情。 */
  detail: (jobId: number) => httpRaw.get<{ code: number; msg: string; data: AdminJob }>(`/admin/monitor/job/${jobId}`),
  /** 新增定时任务。 */
  add: (body: AdminJobBody) => httpRaw.post<JobActionResponse>('/admin/monitor/job', body),
  /** 编辑定时任务。 */
  edit: (body: AdminJobBody) => httpRaw.put<JobActionResponse>('/admin/monitor/job', body),
  /** 删除定时任务。 */
  remove: (jobIds: number[]) => httpRaw.delete<JobActionResponse>(`/admin/monitor/job/${jobIds.join(',')}`),
}

export const adminJobLogApi = {
  /** 分页查询定时任务执行日志。 */
  list: (query: JobLogQuery) => {
    const params = new URLSearchParams()
    params.set('pageNum', String(query.pageNum))
    params.set('pageSize', String(query.pageSize))
    if (query.jobName) params.set('jobName', query.jobName)
    if (query.status) params.set('status', query.status)
    return httpRaw.get<JobLogListResponse>(`/admin/monitor/jobLog/list?${params.toString()}`)
  },
  /** 查询单条执行日志详情。 */
  detail: (jobLogId: number) =>
    httpRaw.get<{ code: number; msg: string; data: AdminJobLog }>(`/admin/monitor/jobLog/${jobLogId}`),
  /** 删除指定执行日志。 */
  remove: (jobLogIds: number[]) =>
    httpRaw.delete<JobActionResponse>(`/admin/monitor/jobLog/${jobLogIds.join(',')}`),
  /** 清空全部执行日志。 */
  clean: () => httpRaw.delete<JobActionResponse>('/admin/monitor/jobLog/clean'),
}
