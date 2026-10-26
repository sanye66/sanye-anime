import { Capacitor, registerPlugin } from '@capacitor/core'

export type DownloadState = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled'
export interface DownloadItem {
  id: string
  title: string
  state: DownloadState
  bytes: number
  total: number
  error: string
  createdAt: number
  position: number
  duration: number
  mimeType: 'video/mp4'
}
export interface OfflinePlaybackItem {
  id: string
  url: string
  nativeUrl: string
  title: string
  position: number
  duration: number
  mimeType: 'video/mp4'
}
export interface DownloadSnapshot {
  items: DownloadItem[]
  usedBytes: number
  maxStorageBytes: number
  maxFileBytes: number
}
interface DownloadPlugin {
  list(): Promise<DownloadSnapshot>
  resume(): Promise<DownloadSnapshot>
  enqueue(options: { url: string; title: string }): Promise<DownloadSnapshot>
  cancel(options: { id: string }): Promise<DownloadSnapshot>
  retry(options: { id: string }): Promise<DownloadSnapshot>
  remove(options: { id: string; confirmed: boolean }): Promise<DownloadSnapshot>
  play(options: { id: string }): Promise<{ id: string; path: string; title: string; position: number; duration: number; mimeType: 'video/mp4' }>
  recordProgress(options: { id: string; position: number; duration: number }): Promise<void>
}
const nativeDownloads = registerPlugin<DownloadPlugin>('SanyeDownload')
const DOWNLOAD_BRIDGE_TIMEOUT = 10_000
let resumeRequest: Promise<DownloadSnapshot> | undefined
let resumed = false
function withDownloadTimeout<T>(pending: Promise<T>, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${operation}超时，请刷新确认任务状态后重试`)), DOWNLOAD_BRIDGE_TIMEOUT)
    pending.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
export function downloadsAvailable() { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SanyeDownload') }
function requireNative() {
  if (!downloadsAvailable()) throw new Error('离线下载仅在已安装的安卓应用中可用')
}
export function validateDownloadUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('请输入完整的 HTTPS MP4 直链') }
  if (value.length > 4096 || url.protocol !== 'https:' || url.username || url.password || url.hash
    || url.port && url.port !== '443' || !url.pathname.toLowerCase().endsWith('.mp4')) {
    throw new Error('仅支持公网 HTTPS MP4 直链，暂不支持 HLS、DASH 或解析页')
  }
  return value
}
export const androidDownloads = {
  async list() { requireNative(); return withDownloadTimeout(nativeDownloads.list(), '读取下载状态') },
  async resume() {
    requireNative()
    if (resumed) return androidDownloads.list()
    if (!resumeRequest) {
      const pending = nativeDownloads.resume().then(result => { resumed = true; return result })
      resumeRequest = withDownloadTimeout(pending, '恢复下载')
      void pending.catch(() => { resumeRequest = undefined })
    }
    return resumeRequest
  },
  async enqueue(url: string, title: string) {
    requireNative()
    validateDownloadUrl(url)
    if (!title.trim() || title.length > 200) throw new Error('请填写不超过 200 字的下载名称')
    return withDownloadTimeout(nativeDownloads.enqueue({ url, title: title.trim() }), '加入下载队列')
  },
  async cancel(id: string) { requireNative(); return withDownloadTimeout(nativeDownloads.cancel({ id }), '取消下载') },
  async retry(id: string) { requireNative(); return withDownloadTimeout(nativeDownloads.retry({ id }), '重新下载') },
  async remove(id: string, confirmed: boolean) {
    requireNative()
    if (!confirmed) throw new Error('请先确认删除下载文件')
    return withDownloadTimeout(nativeDownloads.remove({ id, confirmed }), '删除下载')
  },
  async recordProgress(id: string, position: number, duration: number) {
    requireNative()
    if (!Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration < position || duration > 604800) {
      throw new Error('离线观看进度无效')
    }
    return withDownloadTimeout(nativeDownloads.recordProgress({ id, position, duration }), '保存离线观看进度')
  },
  async play(id: string): Promise<OfflinePlaybackItem> {
    requireNative()
    const result = await withDownloadTimeout(nativeDownloads.play({ id }), '读取本地播放地址')
    if (!result.path.startsWith('file:///')) throw new Error('本地下载文件地址无效')
    return { id: result.id || id, url: Capacitor.convertFileSrc(result.path), nativeUrl: result.path, title: result.title,
      position: result.position || 0, duration: result.duration || 0, mimeType: result.mimeType || 'video/mp4' }
  },
}
export function downloadSize(bytes: number) {
  return `${(Math.max(0, bytes) / (1024 * 1024)).toFixed(1)} MiB`
}
