import { http } from './http'
import { streamChat, type SseEvent, type StreamHandlers } from './sse'
import type { Conversation, Message, PageResult, QuotaInfo } from './types'

export interface SendMessageBody {
  content: string
  clientMessageId: string
  spoilerMode?: 'SAFE' | 'ALLOW'
}

export interface ConversationListParams {
  page?: number
  size?: number
}

export interface AiModelInfo {
  provider: string
  providerLabel: string
  model: string
  temperature: number
  memoryStore: string
  memoryLabel: string
  ragEnabled: boolean
  safetyEnabled: boolean
  preferenceStore: string
  allowedContextLengths: number[]
}

export interface AiPreference {
  temperature?: number | null
  contextLength?: number | null
  modelName?: string | null
  updatedAt?: string | null
}

export interface SavePreferenceBody {
  temperature?: number | null
  contextLength?: number | null
  modelName?: string | null
}

export const aiApi = {
  // AI API 保持页面只关心业务参数，分页编码和 SSE 传输交由公共层处理。
  /** 查询 AI 会话分页。 */
  conversations: (params: ConversationListParams = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) qs.set(key, String(value))
    })
    const query = qs.toString()
    return http.get<PageResult<Conversation>>(`/ai/conversations${query ? `?${query}` : ''}`)
  },
  /** 创建 AI 会话。 */
  createConversation: (body?: { title?: string; spoilerMode?: string; contextAnimeId?: number }) =>
    http.post<Conversation>('/ai/conversations', body ?? {}),
  /** 读取单个 AI 会话。 */
  getConversation: (id: string | number) => http.get<Conversation>(`/ai/conversations/${id}`),
  /** 更新 AI 会话元数据。 */
  updateConversation: (id: string | number, body: { title?: string; spoilerMode?: string; contextAnimeId?: number; status?: string }) =>
    http.patch<Conversation>(`/ai/conversations/${id}`, body),
  /** 删除 AI 会话。 */
  deleteConversation: (id: string | number) => http.delete<void>(`/ai/conversations/${id}`),
  /** 增量读取会话消息。 */
  messages: (id: string | number, after?: string | number) =>
    http.get<Message[]>(`/ai/conversations/${id}/messages${after !== undefined ? `?after=${after}` : ''}`),
  /** 发送用户消息并消费 SSE 事件。 */
  sendMessage: (id: string | number, body: SendMessageBody, handlers: StreamHandlers, signal?: AbortSignal) =>
    streamChat(`/ai/conversations/${id}/messages`, body, handlers, signal),
  /** 请求停止助手生成。 */
  stop: (messageId: string | number) => http.post<void>(`/ai/messages/${messageId}/stop`),
  /** 请求重新生成助手回答。 */
  regenerate: (messageId: string | number) => http.post<void>(`/ai/messages/${messageId}/regenerate`),
  /** 查询 AI 额度。 */
  quota: () => http.get<QuotaInfo>('/ai/quota'),
  /** 查询服务端模型信息。 */
  modelInfo: () => http.get<AiModelInfo>('/ai/model-info'),
  /** 读取 AI 偏好。 */
  preferences: () => http.get<AiPreference>('/ai/preferences'),
  /** 保存 AI 偏好。 */
  savePreferences: (body: SavePreferenceBody) => http.put<AiPreference>('/ai/preferences', body),
}

export type { SseEvent }
