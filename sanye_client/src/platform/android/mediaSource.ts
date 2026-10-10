export type MediaType = 'hls' | 'mp4'

/** 只接收可直接送入 video 的资源；作品网页和第三方 iframe 不视为媒体。 */
export function mediaType(url: string): MediaType | null {
  return classify(url, false)
}

/**
 * 临时播放地址可带查询参数，但不进入本地作品身份或历史。
 * 来源解析出的地址经常没有 .m3u8/.mp4 后缀（CDN 路由地址），这里放宽为按 HLS 处理，
 * 真正能不能播由播放器失败回退决定，不再因为后缀不像就拒绝。
 */
export function playbackType(url: string): MediaType | null {
  return classify(url, true, 'hls')
}

function classify(url: string, allowQuery: boolean, fallback: MediaType | null = null): MediaType | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
    if (parsed.protocol !== 'https:' || (!allowQuery && parsed.search) || parsed.hash || parsed.username || parsed.password ||
      !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') ||
      (!allowQuery && /^[\d.]+$/.test(host)) || host.includes(':')) return null
    const resource = `${parsed.pathname}${parsed.search}`
    if (/\.m3u8(?:$|[^\w])/i.test(resource) || /(?:^|[?&])(?:format|type)=(?:hls|m3u8)(?:&|$)/i.test(parsed.search)) return 'hls'
    if (/\.mp4(?:$|[^\w])/i.test(resource)) return 'mp4'
    return fallback
  } catch {
    // 无法解析的地址不是可播放资源。
  }
  return null
}
