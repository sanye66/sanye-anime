import { ref } from 'vue'

type Stage = 'search' | 'preview' | 'resolve' | 'firstFrame' | 'stall' | 'playback' | 'seek'
type Outcome = 'success' | 'partial' | 'empty' | 'failed' | 'cancelled'
export interface ExperienceEvent { stage: Stage; outcome: Outcome; milliseconds: number; at: number; source: string; count?: number; engine?: 'web' | 'media3'; code?: string }
export const experienceEvents = ref<ExperienceEvent[]>([])
export interface NativePerformance { at: number; width?: number; height?: number; fps?: number; bitrate?: number; droppedFrames?: number; seekLatencyMs?: number; bufferedMs?: number; decoder?: string }
export const nativePerformance = ref<NativePerformance>()
export function recordNativePerformance(value: Record<string, unknown>) {
  const snapshot: NativePerformance = { at: Date.now() }
  const bounds = { width: 16384, height: 16384, fps: 240, bitrate: 1_000_000_000, droppedFrames: 1_000_000_000, seekLatencyMs: 300000, bufferedMs: 300000 }
  for (const [key, limit] of Object.entries(bounds)) {
    const number = value[key]
    if (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= limit) Object.assign(snapshot, { [key]: number })
  }
  if (typeof value.decoder === 'string' && /^[a-zA-Z0-9_.-]{1,120}$/.test(value.decoder)) snapshot.decoder = value.decoder
  if (Object.keys(snapshot).length > 1) nativePerformance.value = snapshot
}
export function sourceHost(value = ''): string {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.hostname : '' } catch { return '' }
}
export function recordExperience(stage: Stage, outcome: Outcome, milliseconds: number, source = '', count?: number, detail?: { engine?: 'web' | 'media3'; code?: string }) {
  experienceEvents.value = [...experienceEvents.value, {
    stage, outcome, milliseconds: Math.round(Math.max(0, Math.min(3_600_000, Number.isFinite(milliseconds) ? milliseconds : 0))),
    at: Date.now(), source: sourceHost(source), ...(Number.isFinite(count) ? { count: Math.max(0, Math.round(count!)) } : {}),
    ...(detail?.engine ? { engine: detail.engine } : {}),
    ...(detail?.code && /^[A-Z0-9_]{1,80}$/.test(detail.code) ? { code: detail.code } : {}),
  }].slice(-100)
}
export function measureExperience(stage: Stage, source = '') {
  const start = performance.now()
  let finished = false
  return (outcome: Outcome, count?: number) => {
    if (finished) return
    finished = true
    recordExperience(stage, outcome, performance.now() - start, source, count)
  }
}
export function clearExperience() { experienceEvents.value = []; nativePerformance.value = undefined }

interface PlaybackSample { at: number; started: boolean; failed: boolean; firstFrameMs: number; watchedSeconds: number; stallSeconds: number }
const storageKey = 'sanye:android-source-health:v2'
const histories = new Map<string, PlaybackSample[]>()
export const sourceHealthRevision = ref(0)
// 不落盘网址、关键词或规则正文；键只用于分开不同规则，不能作为安全身份。
function fingerprint(value: string): string {
  let hash = 2166136261
  let second = 5381
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
    second = Math.imul(second, 33) ^ value.charCodeAt(i)
  }
  return `${(hash >>> 0).toString(36)}-${(second >>> 0).toString(36)}`
}
const validKey = (key: unknown): key is string => typeof key === 'string' && /^[a-z0-9]{1,7}-[a-z0-9]{1,7}$/.test(key)
const validSample = (sample: PlaybackSample) => sample && typeof sample.started === 'boolean' && typeof sample.failed === 'boolean'
  && Number.isFinite(sample.at) && sample.at > 0 && sample.at <= Date.now()
  && ['firstFrameMs', 'watchedSeconds', 'stallSeconds'].every(key => Number.isFinite(sample[key as keyof PlaybackSample])
    && Number(sample[key as keyof PlaybackSample]) >= 0 && Number(sample[key as keyof PlaybackSample]) <= 86400_000)
export function healthKey(url: string, context?: { content: string; sourceIndex?: number }) {
  return fingerprint(`${context?.content || 'builtin'}\u0000${context?.sourceIndex ?? ''}\u0000${sourceHost(url)}`)
}
try {
  const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]')
  if (Array.isArray(saved) && saved.length <= 100) for (const row of saved) {
    if (!Array.isArray(row) || !validKey(row[0]) || !Array.isArray(row[1]) || row[1].length > 30) continue
    const samples = row[1].filter(validSample)
    histories.set(row[0], samples.slice(-30))
  }
} catch { /* 损坏或不可用的统计不影响播放。 */ }

export function recordPlaybackSample(key: string, sample: Omit<PlaybackSample, 'at'>) {
  if (!validKey(key) || !validSample({ ...sample, at: Date.now() })) return
  // 用户在起播前离开、或只打开几秒，不作为来源质量样本。
  if (!sample.failed && (!sample.started || sample.watchedSeconds < 10)) return
  const samples = histories.get(key) || []
  histories.delete(key)
  histories.set(key, [...samples, { ...sample, at: Date.now() }].slice(-30))
  if (histories.size > 100) histories.delete(histories.keys().next().value!)
  try { localStorage.setItem(storageKey, JSON.stringify([...histories])) } catch { /* 内存统计仍可使用。 */ }
  sourceHealthRevision.value++
}
export function sourcePlaybackHealth(key: string) {
  // 仅近 30 日观测有效；不让很久以前成功的来源永远排在前面。
  const samples = (histories.get(key) || []).filter(sample => Date.now() - sample.at < 30 * 86400_000)
  if (!samples.length) return null
  let weights = 0, successes = 0, latency = 0, stall = 0
  for (const sample of samples) {
    const weight = Math.pow(0.5, Math.max(0, Date.now() - sample.at) / (7 * 86400_000))
    weights += weight
    successes += weight * (sample.started && !sample.failed ? 1 : 0)
    latency += weight * (sample.started ? Math.max(0, 1 - sample.firstFrameMs / 15_000) : 0)
    stall += weight * (sample.started ? Math.max(0, 1 - sample.stallSeconds / Math.max(1, sample.watchedSeconds) * 5) : 0)
  }
  return { samples: samples.length, score: samples.length >= 3 ? Math.round((successes * 60 + latency * 20 + stall * 20) / weights) : null }
}
export function clearSourceHealth() {
  histories.clear()
  try { localStorage.removeItem(storageKey) } catch { /* 不影响当前播放。 */ }
  sourceHealthRevision.value++
}

// 只统计前进的媒体时间，暂停、拖动、切后台不计算为观看或卡顿。
export function createPlaybackObservation(key: string) {
  const start = performance.now()
  let started = false, failed = false, firstFrameMs = 0, watchedSeconds = 0, stallSeconds = 0
  let lastTime: number | undefined, lastTick = performance.now(), stallStart: number | undefined, finished = false
  const endStall = () => {
    if (stallStart === undefined) return
    const seconds = Math.max(0, (performance.now() - stallStart) / 1000)
    stallSeconds += seconds; stallStart = undefined
    if (seconds >= 0.1) recordExperience('stall', 'partial', seconds * 1000)
  }
  return {
    firstFrame() { if (!finished && !started) { started = true; firstFrameMs = performance.now() - start; recordExperience('firstFrame', 'success', firstFrameMs) } },
    tick(time: number, playing: boolean, seeking: boolean) {
      if (finished || !Number.isFinite(time) || time < 0) return
      const now = performance.now(), elapsed = (now - lastTick) / 1000
      const advancing = playing && !seeking && lastTime !== undefined && time > lastTime && elapsed <= 2 && time - lastTime <= Math.max(0.5, elapsed * 4)
      if (advancing) {
        if (!started) { started = true; firstFrameMs = now - start; recordExperience('firstFrame', 'success', firstFrameMs) }
        watchedSeconds += Math.min(time - lastTime!, elapsed)
        endStall()
      }
      lastTime = time; lastTick = now
    },
    waiting() { if (!finished && started && stallStart === undefined) stallStart = performance.now() },
    pause() { endStall(); lastTime = undefined; lastTick = performance.now() },
    failure() { if (!finished) failed = true },
    finish() {
      if (finished) return
      finished = true; endStall()
      recordPlaybackSample(key, { started, failed, firstFrameMs, watchedSeconds, stallSeconds })
      if (started || failed) recordExperience('playback', failed ? 'failed' : 'success', watchedSeconds * 1000)
    },
  }
}
