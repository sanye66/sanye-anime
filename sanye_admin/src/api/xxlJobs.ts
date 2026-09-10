import { http } from './http'

export interface XxlJobStatus {
  configured: boolean
  jobId: number
  jobName: string
  executorAppName: string
  executorOnline: boolean
}

export interface XxlJobLog {
  id: number
  triggerTime: string | null
  handleTime: string | null
  triggerCode: number
  handleCode: number
  triggerMessage: string
  handleMessage: string
}

const base = '/admin/monitor/xxl-job'
const options = { timeout: 25000 }
export const xxlJobApi = {
  status: () => http.get<XxlJobStatus>(base, options),
  trigger: () => http.post<void>(`${base}/trigger`, undefined, options),
  logs: (page: number, size: number, status: number) =>
    http.get<{ rows: XxlJobLog[]; total: number }>(`${base}/logs?pageNum=${page}&pageSize=${size}&status=${status}`, options),
}
