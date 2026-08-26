import { http } from './http'

export interface FeedbackSubmitBody {
  type: string
  content: string
  contact?: string
}

export const feedbackApi = {
  // 反馈正文和联系方式由服务端再次校验，前端只负责提交结构化数据。
  /** 提交用户反馈。 */
  submit: (body: FeedbackSubmitBody) => http.post<{ id: number }>('/feedback', body),
}
