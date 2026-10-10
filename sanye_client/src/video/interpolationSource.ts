import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { Parser } from 'm3u8-parser'

/**
 * Shared source preparation for both interpolation engines.
 *
 * The optical-flow engine and the neural engine need the same three things from
 * a playback source: a file the local FFmpeg core can read, the real duration and
 * the real source frame rate. Keeping this in one place means the two engines
 * cannot drift apart on which lines are supported or how large an input may be.
 */
export type InterpolationSourceInfo = {
  /** Name of the file inside the FFmpeg core file system. */
  input: string
  duration: number
  frameRate: number
  width: number
  height: number
  bytes: number
}

export type InterpolationProgress = { stage: string; percent: number }

export const INTERPOLATION_LIMIT = 256 * 1024 * 1024

function parseFrameRate(value: unknown): number {
  if (typeof value !== 'string' || !value.includes('/')) return Number(value) || 0
  const [numerator, denominator] = value.split('/').map(Number)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0
  return numerator / denominator
}

export class InterpolationSourceLoader {
  private downloaded = 0

  constructor(
    private engine: FFmpeg,
    private signal: AbortSignal,
    private progress: (value: InterpolationProgress) => void,
  ) {}

  private check() { if (this.signal.aborted) throw new DOMException('Cancelled', 'AbortError') }

  private async download(url: string, max = INTERPOLATION_LIMIT): Promise<Uint8Array> {
    this.check()
    const parsed = new URL(url, window.location.href)
    if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) throw new Error('仅支持 HTTPS 或本机同源视频')
    const response = await fetch(parsed, { signal: this.signal, credentials: 'omit' })
    if (!response.ok || !response.body) throw new Error(`视频下载失败（${response.status}）`)
    const reader = response.body.getReader()
    const parts: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length; this.downloaded += value.length
        if (size > max || this.downloaded > INTERPOLATION_LIMIT) throw new Error('视频超过 256 MiB，请使用较短片段或较低清晰度线路')
        parts.push(value)
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    const result = new Uint8Array(size)
    let offset = 0
    for (const part of parts) { result.set(part, offset); offset += part.length }
    return result
  }

  private async playlist(url: string, height: number, depth = 0): Promise<string> {
    if (depth > 3) throw new Error('播放列表嵌套过深')
    const bytes = await this.download(url, 2 * 1024 * 1024)
    const parser = new Parser()
    parser.push(new TextDecoder().decode(bytes)); parser.end()
    const manifest = parser.manifest
    if (manifest.playlists?.length) {
      const variants = [...manifest.playlists].sort((a, b) => (a.attributes?.RESOLUTION?.height || 0) - (b.attributes?.RESOLUTION?.height || 0))
      const selected = variants.find(item => (item.attributes?.RESOLUTION?.height || 0) >= height) || variants[variants.length - 1]
      if (selected.attributes?.AUDIO) throw new Error('该线路使用独立音轨，暂不支持插帧，请选择合并音轨线路或本地视频')
      return this.playlist(new URL(selected.uri, url).href, height, depth + 1)
    }
    const segments = manifest.segments || []
    if (!manifest.endList || !segments.length) throw new Error('暂不支持直播插帧，请使用完整点播视频')
    if (segments.some(s => !Number.isFinite(s.duration) || s.duration <= 0)) throw new Error('播放列表时长无效')
    if (segments.length > 10000 || segments.some(s => s.key || s.byterange || s.map)) throw new Error('该播放列表使用加密或特殊分片，暂不支持插帧；原始播放不受影响')
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...segments.map(s => s.duration)))}`, '#EXT-X-MEDIA-SEQUENCE:0']
    for (let index = 0; index < segments.length; index++) {
      this.check()
      this.progress({ stage: `下载分片 ${index + 1}/${segments.length}`, percent: index / segments.length * 20 })
      const name = `segment-${index}.ts`
      await this.engine.writeFile(name, await this.download(new URL(segments[index].uri, url).href))
      if (segments[index].discontinuity) lines.push('#EXT-X-DISCONTINUITY')
      lines.push(`#EXTINF:${segments[index].duration},`, name)
    }
    lines.push('#EXT-X-ENDLIST')
    await this.engine.writeFile('input.m3u8', lines.join('\n'))
    return 'input.m3u8'
  }

  async load(source: string | File, hls: boolean, height: number): Promise<InterpolationSourceInfo> {
    this.check()
    let input: string
    let bytes = 0
    if (typeof source === 'string' && hls) input = await this.playlist(source, height)
    else {
      this.progress({ stage: '读取视频', percent: 5 })
      if (source instanceof File && source.size > INTERPOLATION_LIMIT) throw new Error('本地文件不能超过 256 MiB')
      input = 'input-media'
      const data = typeof source === 'string' ? await this.download(source) : new Uint8Array(await source.arrayBuffer())
      bytes = data.byteLength
      this.check()
      await this.engine.writeFile(input, data)
    }
    const probe = await this.engine.ffprobe([
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'format=duration:stream=avg_frame_rate,r_frame_rate,width,height',
      '-of', 'json', input, '-o', 'input-info.json',
    ])
    // This core can report -1 after ffprobe writes a complete JSON result; validate that result below.
    if (probe > 0) throw new Error('无法读取视频时长')
    const info = JSON.parse(await this.engine.readFile('input-info.json', 'utf8') as string)
    const duration = Number(info.format?.duration)
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('视频时长无效')
    const stream = info.streams?.[0] || {}
    const frameRate = parseFrameRate(stream.avg_frame_rate) || parseFrameRate(stream.r_frame_rate)
    return {
      input,
      duration,
      frameRate: Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 0,
      width: Number(stream.width) || 0,
      height: Number(stream.height) || 0,
      bytes,
    }
  }
}
