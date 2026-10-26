export interface SubtitleCue { start: number; end: number; text: string }
export function parseSubtitles(content: string): SubtitleCue[] {
  if (new TextEncoder().encode(content).length > 2 * 1024 * 1024) throw new Error('字幕文件不能超过 2 MiB')
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  const timestamp = (value: string) => {
    const match = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value)
    if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return NaN
    return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
  }
  const cues: SubtitleCue[] = []
  for (const block of normalized.split(/\n[ \t]*\n/)) {
    const lines = block.split('\n')
    const timing = lines.findIndex(line => line.includes('-->'))
    if (timing < 0) continue
    const match = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[timing]!)
    if (!match) throw new Error('字幕时间格式无效')
    const start = timestamp(match[1]!), end = timestamp(match[2]!)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 86400) throw new Error('字幕时间范围无效')
    // 本地文本只作字幕显示，不执行 HTML，也不将文件正文持久化或上传。
    const text = lines.slice(timing + 1).join('\n').replace(/<[^>]*>/g, '').trim()
    if (!text || text.length > 4096) throw new Error('字幕内容无效')
    cues.push({ start, end, text })
    if (cues.length > 10000) throw new Error('字幕条目不能超过 10000 条')
  }
  if (!cues.length) throw new Error('请选择 SRT 或 WebVTT 字幕')
  return cues.sort((a, b) => a.start - b.start)
}
