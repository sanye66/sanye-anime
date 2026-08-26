import { http } from './http'

export type ScheduleDayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface WeeklyScheduleItem {
  animeId: number
  title: string
  time: string
  episode: string
  description: string
  state: string
  tone: 'blue' | 'coral' | 'gold'
}

export interface ScheduleDay {
  day: ScheduleDayKey
  label: string
  items: WeeklyScheduleItem[]
}

export interface WeeklySchedule {
  generatedAt: string
  days: ScheduleDay[]
  total: number
}

export const scheduleApi = {
  // 排期页面只调用服务端周排期聚合接口。
  /** 获取当前周排期。 */
  week: () => http.get<WeeklySchedule>('/schedule/week'),
}
