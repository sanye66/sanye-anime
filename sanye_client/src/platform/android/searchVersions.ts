import type { SourceContext, SourceEpisode, SourceHit, SourcePreview, SourceResolveResult } from './source'

export type SearchVersionGroup = SourceHit & { versions: SourceHit[] }
export type SearchVersionStatus = 'resolved' | 'unsupported' | 'unknown'
export interface SearchVersionResult {
  key: string
  hit: SourceHit
  status: SearchVersionStatus
  reason: string
  playbackVerified: false
}

function sourceScope(hit: SourceHit) {
  let origin = hit.sourceUrl
  try { origin = new URL(hit.sourceUrl).origin } catch {}
  return JSON.stringify([hit.sourceContext?.content ?? '', hit.sourceContext?.sourceIndex ?? hit.sourceIndex ?? '', hit.sourceName ?? '', origin])
}

export function searchVersionKey(hit: SourceHit) {
  return `${sourceScope(hit)}\u0000${hit.sourceUrl}`
}

function seasonNumber(value: string) {
  if (/^\d+$/.test(value)) return String(Number(value))
  const digits = '零一二三四五六七八九'
  if (value === '十') return '10'
  if (value.includes('十')) {
    const [tens, units] = value.split('十')
    return String((tens ? digits.indexOf(tens) : 1) * 10 + (units ? digits.indexOf(units) : 0))
  }
  return String(digits.indexOf(value))
}

function workTitle(title: string) {
  let value = title.normalize('NFKC').toLowerCase().trim()
  const edition = '(?:简体|繁体|简繁|中日|中文|中字|字幕|国语|日语|粤语|双语|简体中字|繁体中字|中文字幕|中日字幕|高清|超清|蓝光|bd|hd|4k|2160p|1080p|720p)'
  const suffix = new RegExp(`(?:\\s*[\\[（(【]\\s*${edition}(?:[\\s/、+_-]*${edition})*\\s*[\\]）)】]|(?:\\s+|[-_])${edition})$`, 'i')
  const attachedSuffix = /(?:中日字幕|中文字幕|简体中字|繁体中字|2160p|1080p|720p)$/i
  let previous = ''
  while (previous !== value) { previous = value; value = value.replace(suffix, '').replace(attachedSuffix, '').trim() }
  value = value.replace(/第\s*([一二三四五六七八九十\d]+)\s*季/g, (_, number: string) => `season${seasonNumber(number)}`)
    .replace(/\bseason\s*0*(\d+)\b|\bs\s*0*(\d+)\b/g, (_, season: string, short: string) => `season${Number(season || short)}`)
    .replace(/\bpart\s*0*(\d+)\b/g, (_, number: string) => `part${Number(number)}`)
  return value.replace(/[\s\p{P}]/gu, '')
}

export function groupSearchVersions(hits: readonly SourceHit[], rejectedKeys: ReadonlySet<string> = new Set()): SearchVersionGroup[] {
  const groups = new Map<string, SearchVersionGroup>()
  for (const hit of hits) {
    if (rejectedKeys.has(searchVersionKey(hit))) continue
    const title = workTitle(hit.title)
    const key = `${sourceScope(hit)}\u0000${title || hit.sourceUrl}`
    const group = groups.get(key)
    if (!group) groups.set(key, { ...hit, versions: [hit] })
    else if (!group.versions.some(version => searchVersionKey(version) === searchVersionKey(hit))) group.versions.push(hit)
  }
  return [...groups.values()]
}

interface SearchVersionChecksOptions {
  preview(options: { sourceUrl: string; sourceContext?: SourceContext }): Promise<SourcePreview>
  resolve(sourceUrl: string, context?: SourceContext): Promise<SourceResolveResult | null>
  onResult?(result: SearchVersionResult): void
  timeoutMs?: number
}

function explicitlyUnsupported(cause: unknown) {
  if (!cause || typeof cause !== 'object') return false
  const error = cause as { code?: string; message?: string }
  return error.code === 'UNSUPPORTED' || error.code === 'UNSUPPORTED_SOURCE' || error.code === 'UNSUPPORTED_MEDIA'
    || /^(?:unsupported(?: source| media)?|来源不支持播放|不支持此来源播放)$/i.test(error.message ?? '')
    || /未找到静态媒体直链|没有可播放选集|来源索引无效或规则不受支持/.test(error.message ?? '')
}

function episodeIdentity(episode: SourceEpisode) {
  const title = episode.title.normalize('NFKC').trim().toLowerCase()
  const number = title.match(/^(?:第\s*)?(\d+)\s*(?:集|话|話)?$/) ?? title.match(/^(?:ep(?:isode)?\s*)(\d+)$/)
  return number ? `episode${Number(number[1])}` : title || episode.id
}

export function createSearchVersionChecks(options: SearchVersionChecksOptions) {
  let generation = 0
  let active = 0
  const seen = new Set<string>()
  const rejectedKeys = new Set<string>()
  const running = new Set<{ finish(result: SearchVersionResult | null): void }>()
  const queue: { hit: SourceHit; generation: number; finish(result: SearchVersionResult | null): void }[] = []

  function bounded<Value>(operation: Promise<Value>): Promise<Value> {
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs! > 0 ? options.timeoutMs! : 12000
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('版本检查超时')), timeoutMs)
      operation.then(value => { clearTimeout(timer); resolve(value) }, cause => { clearTimeout(timer); reject(cause) })
    })
  }

  async function check(hit: SourceHit, current: number): Promise<SearchVersionResult> {
    const result = (status: SearchVersionStatus, reason: string): SearchVersionResult => ({ key: searchVersionKey(hit), hit, status, reason, playbackVerified: false })
    let preview: SourcePreview
    const context = hit.sourceContext ? { ...hit.sourceContext, sourceIndex: hit.sourceContext.sourceIndex ?? hit.sourceIndex } : undefined
    try { preview = await bounded(options.preview({ sourceUrl: hit.sourceUrl, sourceContext: context })) }
    catch { return result('unknown', 'detail-error') }
    if (current !== generation) return result('unknown', 'cancelled')
    if (!preview || !Array.isArray(preview.episodes)) return result('unknown', 'invalid-detail')
    if (!preview.episodes.length) return result('unsupported', 'no-episodes')
    const first = preview.episodes[0]!
    const lines = preview.episodes.filter(episode => episodeIdentity(episode) === episodeIdentity(first))
    let unknown = lines.length > 3
    for (const episode of lines.slice(0, 3)) {
      if (current !== generation) return result('unknown', 'cancelled')
      if (episode.playbackUrl) return result('resolved', 'direct-url')
      if (!episode.sourceUrl) { unknown = true; continue }
      try {
        const resolved = await bounded(options.resolve(episode.sourceUrl, episode.sourceContext ?? preview.sourceContext ?? context))
        if (resolved?.playbackUrl) return result('resolved', 'resolved-url')
        if (!resolved || typeof resolved.playbackUrl !== 'string') unknown = true
      } catch (cause) { if (!explicitlyUnsupported(cause)) unknown = true }
    }
    return result(unknown ? 'unknown' : 'unsupported', unknown ? 'inconclusive-lines' : 'unsupported-lines')
  }

  function pump() {
    while (active < 2 && queue.length) {
      const job = queue.shift()!
      active++
      running.add(job)
      void check(job.hit, job.generation).then(result => {
        if (job.generation !== generation) { job.finish(null); return }
        if (result.status === 'unsupported') rejectedKeys.add(result.key)
        if (result.status === 'unknown') seen.delete(result.key)
        job.finish(result)
        try { options.onResult?.(result) } catch {}
      }, () => {
        if (job.generation === generation) seen.delete(searchVersionKey(job.hit))
        job.finish(null)
      }).finally(() => { running.delete(job); active--; pump() })
    }
  }

  function cancel() {
    generation++
    for (const job of queue.splice(0)) job.finish(null)
    for (const job of running) job.finish(null)
    seen.clear()
  }

  return {
    rejectedKeys,
    enqueue(hits: readonly SourceHit[]): Promise<SearchVersionResult[]> {
      const jobs: Promise<SearchVersionResult | null>[] = []
      for (const hit of hits) {
        const key = searchVersionKey(hit)
        if (seen.has(key) || rejectedKeys.has(key)) continue
        seen.add(key)
        jobs.push(new Promise(finish => queue.push({ hit, generation, finish })))
      }
      pump()
      return Promise.all(jobs).then(results => results.filter((result): result is SearchVersionResult => result !== null))
    },
    cancel,
    reset() { cancel(); rejectedKeys.clear() },
  }
}
