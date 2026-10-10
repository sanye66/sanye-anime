import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleFromSnapshot } from '../sanye_client/src/platform/android/schedule.ts'

test('排期只依据明确的星期时间文本，不虚构集数与播出状态', () => {
  const entries = [
    { id: 1, title: '甲', sourceUrl: 'https://example.org/a', summary: '', coverUrl: '', updateText: '周日 21:00 更新' },
    { id: 2, title: '乙', sourceUrl: 'https://example.org/b', summary: '', coverUrl: '', updateText: '周天 08:05 更新' },
    { id: 3, title: '丙', sourceUrl: 'https://example.org/c', summary: '', coverUrl: '', updateText: '已完结' },
    { id: 4, title: '丁', sourceUrl: 'https://example.org/d', summary: '', coverUrl: '', updateText: '周日 25:99 更新' },
  ]
  const week = scheduleFromSnapshot(entries)
  assert.equal(week.length, 7)
  assert.deepEqual(week[6].items.map((item) => [item.title, item.time]), [['乙', '08:05'], ['甲', '21:00']])
  assert.equal(week.slice(0, 6).every((day) => day.items.length === 0), true)
  assert.equal('episode' in week[6].items[0], false)
})
