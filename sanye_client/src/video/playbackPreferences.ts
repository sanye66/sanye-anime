import { FRAME_RATE_OPTIONS, type FrameRateTarget } from './frameCadence'
import { ANIME4K_PROFILE_LABELS, type Anime4KProfile } from './anime4k'
import type { AnimePlaybackOption } from '@/api/types'

const preferencesKey = 'sanye:playback:preferences:v1'
const routesKey = 'sanye:playback:routes:v1'
const startupQualityKey = 'sanye:playback:startup-quality:v1'
const autoQualityMaxAge = 7 * 86400000
const manualQualityMaxAge = 30 * 86400000
const startupQualityLimit = 50
export interface PlaybackPreferences {
  frameRate: FrameRateTarget | 'off'; quality: Anime4KProfile | 'off'
  /**
   * 仅增强路径（只开画质、不开补帧）的执行位置：默认 `worker`（渲染 Worker 内执行，VQ-28），
   * `main` 一键回到原 `anime4k.js` 主线程路径。该开关只用于隔离对照与回退，不出现在播放器菜单里。
   */
  enhancementPath: 'worker' | 'main'
  /**
   * 补帧延迟口径（VQ-29）：默认 `adaptive`（按实测需要收缩补帧延迟，起播与定位后的原画窗口随之缩短），
   * `fixed` 回到固定 150ms 的隔离对照。该开关只用于对照与回退，不出现在播放器菜单里。
   */
  interpolationDelay: 'adaptive' | 'fixed'
  /**
   * 呈现对齐口径（VQ-31）：默认 `refresh`，在目标高于刷新能力时按刷新边界提交并把边界内到期时隙
   * 按各自理想时刻补齐（一个刷新边界内最多补齐两个时隙，更高目标按跳过处理并交由既有帧率稳定逻辑）；
   * `deadline` 回到既有截止时刻计时器。该开关只用于隔离对照与回退，不出现在播放器菜单里，
   * 也不改变画质档位、补帧延迟与输出尺寸。
   */
  presentationAlignment: 'deadline' | 'refresh'
  volume: number; rate: number; language: string
}
const defaults: PlaybackPreferences = { frameRate: 'auto', quality: 'off', enhancementPath: 'worker',
  interpolationDelay: 'adaptive', presentationAlignment: 'refresh', volume: 0.7, rate: 1, language: '' }
function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage is optional. */ }
}
export function readPlaybackPreferences(): PlaybackPreferences {
  const raw = read(preferencesKey) as Partial<PlaybackPreferences> | null
  if (!raw || typeof raw !== 'object') return { ...defaults }
  return {
    frameRate: raw.frameRate === 'off' || raw.frameRate === 'auto' || FRAME_RATE_OPTIONS.includes(raw.frameRate as typeof FRAME_RATE_OPTIONS[number]) ? raw.frameRate! : defaults.frameRate,
    quality: raw.quality === 'off' || Object.prototype.hasOwnProperty.call(ANIME4K_PROFILE_LABELS, raw.quality || '') ? raw.quality! : defaults.quality,
    enhancementPath: raw.enhancementPath === 'main' ? 'main' : defaults.enhancementPath,
    interpolationDelay: raw.interpolationDelay === 'fixed' ? 'fixed' : defaults.interpolationDelay,
    presentationAlignment: raw.presentationAlignment === 'deadline' ? 'deadline' : defaults.presentationAlignment,
    volume: typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : defaults.volume,
    rate: typeof raw.rate === 'number' && raw.rate >= 0.25 && raw.rate <= 4 ? raw.rate : defaults.rate,
    language: ['国语', '原声', '粤语', '英语', ''].includes(raw.language || '') ? raw.language || '' : '',
  }
}
export function savePlaybackPreferences(change: Partial<PlaybackPreferences>) {
  write(preferencesKey, { ...readPlaybackPreferences(), ...change })
}
export function playbackLanguage(label = '') {
  if (/国语|国配|普通话|中文配音/.test(label)) return '国语'
  if (/粤语|粤配/.test(label)) return '粤语'
  if (/英语|英文/.test(label)) return '英语'
  if (/日语|日文|原声|中字/.test(label)) return '原声'
  return ''
}
function routeId(url: string) {
  try { const parsed = new URL(url, location.href); return parsed.origin + parsed.pathname } catch { return url.slice(0, 256) }
}
interface RouteRecord { key: string; url: string; time: number; success: boolean }
function records(): RouteRecord[] {
  const raw = read(routesKey)
  if (!Array.isArray(raw)) return []
  return raw.filter(item => item && typeof item.key === 'string' && typeof item.url === 'string' && typeof item.success === 'boolean' && Number.isFinite(item.time) && Date.now() - item.time < 7 * 86400000 && item.time <= Date.now()).slice(-100)
}
export function recordPlaybackRoute(key: string, url: string, success: boolean) {
  const id = routeId(url)
  write(routesKey, [...records().filter(item => item.key !== key || item.url !== id), { key, url: id, success, time: Date.now() }].slice(-100))
}
export function rankPlaybackOptions(options: AnimePlaybackOption[], key: string, language = '') {
  const history = records()
  const score = (option: AnimePlaybackOption) => {
    const previous = history.find(item => item.key === key && item.url === routeId(option.url))
    const failed = previous && !previous.success && Date.now() - previous.time < 10 * 60000
    return (failed ? -100 : previous?.success ? 10 : 0) + (language && playbackLanguage(option.label) === language ? 20 : 0)
  }
  return options.map((option, index) => ({ option, index })).sort((a, b) => score(b.option) - score(a.option) || a.index - b.index).map(item => item.option)
}

/**
 * 起播清晰度记忆：记录上次成功播放的实际档位，供同一地址下次起播直接使用。
 * 只保存档位身份而不是播放地址；阶梯变化时按同高度和最近码率重新匹配，失败或超时由播放器作废。
 */
export interface StartupQualityRecord {
  source: string; ladder: string; mode: 'auto' | 'manual'
  index: number; height: number; bitrate: number; time: number
}

/** 档位阶梯签名：序号只在同一阶梯内有效，阶梯变化时退化为按高度匹配。 */
export function qualityLadderSignature(levels: Array<{ height?: number; bitrate?: number }>) {
  return levels.map(level => `${Number(level.height) || 0}x${Number(level.bitrate) || 0}`).join(',')
}

function startupQualityRecords(): StartupQualityRecord[] {
  const raw = read(startupQualityKey)
  if (!Array.isArray(raw)) return []
  return (raw as StartupQualityRecord[]).filter(item => item && typeof item.source === 'string' && typeof item.ladder === 'string'
    && (item.mode === 'auto' || item.mode === 'manual')
    && Number.isFinite(item.index) && item.index >= 0
    && Number.isFinite(item.height) && item.height > 0
    && Number.isFinite(item.bitrate) && Number.isFinite(item.time) && item.time <= Date.now())
}

function qualityMaxAge(mode: StartupQualityRecord['mode']) {
  return mode === 'manual' ? manualQualityMaxAge : autoQualityMaxAge
}

/** 读取地址当前的起播记忆；手动选择视为强偏好，优先于自动记录，过期条目按无记忆处理。 */
export function readStartupQuality(url: string) {
  const source = routeId(url)
  const now = Date.now()
  const usable = startupQualityRecords().filter(item => item.source === source && now - item.time < qualityMaxAge(item.mode))
  const newest = (mode: StartupQualityRecord['mode']) => usable
    .filter(item => item.mode === mode).sort((left, right) => right.time - left.time)[0]
  return newest('manual') ?? newest('auto') ?? null
}

/** 写入起播记忆；同地址同来源只保留最新一条，避免长期累积。 */
export function saveStartupQuality(url: string, record: Omit<StartupQualityRecord, 'source' | 'time'> & { time?: number }) {
  const source = routeId(url)
  const next: StartupQualityRecord = { ...record, source, time: record.time ?? Date.now() }
  write(startupQualityKey, [...startupQualityRecords().filter(item => item.source !== source || item.mode !== next.mode), next].slice(-startupQualityLimit))
}

/** 作废起播记忆：失败回落时清掉使用的来源，用户改回自动时只清手动强偏好。 */
export function clearStartupQuality(url: string, mode?: StartupQualityRecord['mode']) {
  const source = routeId(url)
  write(startupQualityKey, startupQualityRecords()
    .filter(item => item.source !== source || (mode ? item.mode !== mode : false)).slice(-startupQualityLimit))
}

/** 把记忆档位匹配到当前清单：阶梯一致时沿用原序号，否则按同高度和最近码率回退匹配。 */
export function matchStartupQualityIndex(levels: Array<{ height?: number; bitrate?: number }>, record: StartupQualityRecord | null) {
  if (!record || !levels.length) return -1
  const matchedHeight = Number(levels[record.index]?.height) || 0
  if (qualityLadderSignature(levels) === record.ladder && matchedHeight === record.height) return record.index
  const candidates = levels.map((level, index) => ({ index, height: Number(level.height) || 0, bitrate: Number(level.bitrate) || 0 }))
    .filter(level => level.height === record.height)
  if (!candidates.length) return -1
  return candidates.sort((left, right) => Math.abs(left.bitrate - record.bitrate) - Math.abs(right.bitrate - record.bitrate))[0].index
}
