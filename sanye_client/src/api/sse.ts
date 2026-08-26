import { buildCasLoginUrl, clearSession, getAccessToken, getDeviceId } from '@/auth/session'
import { createRequestId, resolveApiBaseUrl } from './http'

export interface SseEvent {
  event: string
  data: Record<string, unknown>
}

export interface StreamHandlers {
  onEvent: (event: SseEvent) => void
  onDone?: () => void
  onError?: (error: Error) => void
}

/** 建立 AI SSE 连接，按事件边界解析数据并支持外部 AbortSignal 取消。 */
export async function streamChat(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  // 读取 SSE 分块并转换为业务事件；取消请求时不把用户主动中止当作错误提示。
  const base = resolveApiBaseUrl()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'X-Request-Id': createRequestId(),
    'X-Device-Id': getDeviceId(),
  }
  const token = getAccessToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      const text = await res.text()
      if (res.status === 401) {
        clearSession()
        window.location.assign(buildCasLoginUrl(window.location.href))
      }
      throw new Error(text || `HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let eventName = 'message'
    let dataLines: string[] = []
    // 将当前 SSE 事件的多行 data 合并后解析为业务事件。
    const flush = () => {
      if (dataLines.length === 0) return
      const raw = dataLines.join('\n')
      dataLines = []
      try {
        handlers.onEvent({ event: eventName, data: JSON.parse(raw) as Record<string, unknown> })
      } catch {
        handlers.onEvent({ event: eventName, data: { raw } })
      }
      eventName = 'message'
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
          else if (line === '') flush()
        }
        flush()
      }
    }
    // 处理最后一个 UTF-8 字符和没有以空行结尾的尾部事件，避免回答末字节或完成事件丢失。
    buffer += decoder.decode()
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
    }
    flush()
    handlers.onDone?.()
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    if (!aborted) {
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
