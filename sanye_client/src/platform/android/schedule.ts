import type { CatalogSnapshotItem } from './catalogSnapshot'

const days = ['一', '二', '三', '四', '五', '六', '日'] as const

export function scheduleFromSnapshot(items: CatalogSnapshotItem[]) {
  return days.map((day) => ({
    label: `周${day}`,
    items: items.flatMap((item) => {
      const match = item.updateText.match(/周([一二三四五六日天])[\s　]*(\d{1,2}):(\d{2})[\s　]*更新/)
      if (!match || (match[1] === '天' ? '日' : match[1]) !== day) return []
      const hour = Number(match[2])
      const minute = Number(match[3])
      if (hour > 23 || minute > 59) return []
      return [{ ...item, time: `${String(hour).padStart(2, '0')}:${match[3]}` }]
    }).sort((left, right) => left.time.localeCompare(right.time)),
  }))
}
