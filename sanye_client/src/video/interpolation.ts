import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import classWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url'
import { Parser } from 'm3u8-parser'

export type InterpolationProgress = { stage: string; percent: number }
const LIMIT = 256 * 1024 * 1024
export const interpolationAssets = { coreURL, wasmURL, classWorkerURL }

export class InterpolationJob {
  private engine = new FFmpeg()
  private controller = new AbortController()
  private downloaded = 0
  private stopped = false
  constructor(private progress: (value: InterpolationProgress) => void) {}

  cancel() { this.stopped = true; this.controller.abort(); this.engine.terminate() }
  private check() { if (this.stopped) throw new DOMException('Cancelled', 'AbortError') }
  private async download(url: string, max = LIMIT): Promise<Uint8Array> {
    this.check()
    const parsed = new URL(url, window.location.href)
    if (parsed.protocol !== 'https:' && parsed.origin !== window.location.origin) throw new Error('仅支持 HTTPS 或本机同源视频')
    const response = await fetch(parsed, { signal: this.controller.signal, credentials: 'omit' })
    if (!response.ok || !response.body) throw new Error(`视频下载失败（${response.status}）`)
    const reader = response.body.getReader()
    const parts: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length; this.downloaded += value.length
        if (size > max || this.downloaded > LIMIT) throw new Error('视频超过 256 MiB，请使用较短片段或较低清晰度线路')
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

  async convert(source: string | File, hls: boolean, height: number): Promise<Blob> {
    try {
      this.check()
      this.progress({ stage: '加载插帧引擎', percent: 0 })
      await this.engine.load(interpolationAssets)
      this.check()
      let input: string
      if (typeof source === 'string' && hls) input = await this.playlist(source, height)
      else {
        this.progress({ stage: '读取视频', percent: 5 })
        if (source instanceof File && source.size > LIMIT) throw new Error('本地文件不能超过 256 MiB')
        input = 'input-media'
        const data = typeof source === 'string' ? await this.download(source) : new Uint8Array(await source.arrayBuffer())
        this.check()
        await this.engine.writeFile(input, data)
      }
      const probe = await this.engine.ffprobe(['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', input, '-o', 'input-info.json'])
      // This core can report -1 after ffprobe writes a complete JSON result; validate that result below.
      if (probe > 0) throw new Error('无法读取视频时长')
      const info = JSON.parse(await this.engine.readFile('input-info.json', 'utf8') as string)
      const duration = Number(info.format?.duration)
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('视频时长无效')
      this.engine.on('progress', ({ time }) => this.progress({ stage: '生成 120fps 视频', percent: Math.min(98, 20 + time / 1e6 / duration * 78) }))
      this.progress({ stage: '生成 120fps 视频', percent: 20 })
      const status = await this.engine.exec([
        '-i', input, '-map', '0:v:0', '-map', '0:a?',
        '-vf', `scale=-2:trunc(min(ih\\,${height})/2)*2,tpad=stop_mode=clone:stop_duration=1,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-t', String(duration), '-movflags', '+faststart', 'output.mp4',
      ], 30 * 60 * 1000)
      this.check()
      if (status !== 0) throw new Error('插帧未完成，可能超出处理时间或内存限制；原始视频已保留')
      const verified = await this.engine.ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'json', 'output.mp4', '-o', 'output-info.json'])
      if (verified > 0) throw new Error('无法验证插帧结果')
      const outputInfo = JSON.parse(await this.engine.readFile('output-info.json', 'utf8') as string)
      if (outputInfo.streams?.[0]?.avg_frame_rate !== '120/1') throw new Error('输出帧率不是 120fps，已拒绝使用')
      const bytes = await this.engine.readFile('output.mp4')
      if (typeof bytes === 'string') throw new Error('插帧输出无效')
      this.progress({ stage: '120fps 视频已生成', percent: 100 })
      return new Blob([new Uint8Array(bytes)], { type: 'video/mp4' })
    } finally { this.engine.terminate() }
  }
}
