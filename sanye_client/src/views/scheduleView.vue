<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { scheduleApi, type ScheduleDayKey } from '@/api/schedule'
import { isSupportedAnimeId } from '@/data/animeCatalog'

type ScheduleItem = {
  animeId: number
  time: string
  state: string
  title: string
  episode: string
  description: string
  tone: 'blue' | 'coral' | 'gold' | 'pink' | 'violet' | 'teal'
}

type DayMeta = { key: ScheduleDayKey; label: string; date: string }

const DAY_META: Array<Omit<DayMeta, 'date'>> = [
  { key: 'monday', label: '周一' },
  { key: 'tuesday', label: '周二' },
  { key: 'wednesday', label: '周三' },
  { key: 'thursday', label: '周四' },
  { key: 'friday', label: '周五' },
  { key: 'saturday', label: '周六' },
  { key: 'sunday', label: '周日' },
]

const LOCAL_DATES: Record<ScheduleDayKey, string> = {
  monday: '09 月 15 日',
  tuesday: '09 月 16 日',
  wednesday: '09 月 17 日',
  thursday: '09 月 18 日',
  friday: '09 月 19 日',
  saturday: '09 月 20 日',
  sunday: '09 月 21 日',
}

const LOCAL_SCHEDULE_MAP: Record<ScheduleDayKey, ScheduleItem[]> = {
  monday: [
    { animeId: 128, time: '21:00', state: '待播出', title: '无职转生 · 第三季', episode: '第 10 集', description: '异世界的新篇章继续展开。', tone: 'violet' },
  ],
  tuesday: [
    { animeId: 133, time: '20:00', state: '待播出', title: '无职转生 · 第一季', episode: '第 01 集', description: '从重新开始的人生，认真走出第一步。', tone: 'blue' },
  ],
  wednesday: [
    { animeId: 136, time: '21:30', state: '待播出', title: '无职转生 · 第二季', episode: '第 01 集', description: '新的伙伴与旅程在异世界继续。', tone: 'gold' },
    { animeId: 135, time: '23:00', state: '待播出', title: '无职转生 · 第二季 Part.2', episode: '第 01 集', description: '第二季后半篇章开启新的命运交汇。', tone: 'pink' },
  ],
  thursday: [
    { animeId: 127, time: '20:00', state: '推荐观看', title: '你的名字', episode: '剧场版', description: '在黄昏天空下重新寻找彼此。', tone: 'coral' },
    { animeId: 137, time: '22:30', state: '稍后', title: '无职转生 · OAD 特别篇', episode: '第 01 集', description: '补充主线旅程中的重要片段。', tone: 'teal' },
  ],
  friday: [
    { animeId: 128, time: '21:00', state: '待播出', title: '无职转生 · 第三季', episode: '第 11 集', description: '新的挑战等待着重新出发的旅人。', tone: 'violet' },
  ],
  saturday: [
    { animeId: 136, time: '21:00', state: '待播出', title: '无职转生 · 第二季', episode: '第 02 集', description: '继续追踪异世界中的新线索。', tone: 'gold' },
  ],
  sunday: [
    { animeId: 135, time: '22:00', state: '待播出', title: '无职转生 · 第二季 Part.2', episode: '第 02 集', description: '旅程还在继续，新的选择即将到来。', tone: 'pink' },
  ],
}

/** 复制本地排期兜底数据，避免页面状态直接修改常量。 */
function copyLocalSchedule(): Record<ScheduleDayKey, ScheduleItem[]> {
  return Object.fromEntries(
    Object.entries(LOCAL_SCHEDULE_MAP).map(([key, items]) => [key, [...items]]),
  ) as Record<ScheduleDayKey, ScheduleItem[]>
}

/** 根据服务端生成日期计算当前周一至周日的展示日期。 */
function weekDatesFrom(iso: string): Record<ScheduleDayKey, string> {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return LOCAL_DATES
  const mondayOffset = (date.getDay() + 6) % 7
  const monday = new Date(date)
  monday.setDate(date.getDate() - mondayOffset)
  const dates = {} as Record<ScheduleDayKey, string>
  DAY_META.forEach((meta, index) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + index)
    dates[meta.key] = `${String(day.getMonth() + 1).padStart(2, '0')} 月 ${String(day.getDate()).padStart(2, '0')} 日`
  })
  return dates
}

const loading = ref(true)
const apiError = ref(false)
const scheduleMap = ref<Record<ScheduleDayKey, ScheduleItem[]>>(copyLocalSchedule())
const weekDates = ref<Record<ScheduleDayKey, string>>(LOCAL_DATES)

/** 加载服务端周排期；失败时保留本地排期并提示接口异常。 */
async function loadSchedule() {
  loading.value = true
  apiError.value = false
  try {
    const data = await scheduleApi.week()
    const next = copyLocalSchedule()
    for (const day of data.days) {
      const supportedItems = day.items.map((item) => ({
        animeId: item.animeId,
        time: item.time,
        state: item.state,
        title: item.title,
        episode: item.episode,
        description: item.description,
        tone: item.tone,
      })).filter((item) => isSupportedAnimeId(item.animeId))
      if (supportedItems.length) next[day.day] = supportedItems
    }
    scheduleMap.value = next
    weekDates.value = weekDatesFrom(data.generatedAt)
  } catch {
    apiError.value = true
  } finally {
    loading.value = false
  }
}

const selectedDay = ref<ScheduleDayKey>('thursday')
const remindedItems = ref<string[]>([])
const days = computed<DayMeta[]>(() =>
  DAY_META.map((meta) => ({ ...meta, date: weekDates.value[meta.key] })),
)
const scheduleItems = computed(() => scheduleMap.value[selectedDay.value])
const totalScheduleCount = computed(() =>
  Object.values(scheduleMap.value).reduce((total, items) => total + items.length, 0),
)

/** 切换单个节目的本地提醒标记。 */
function toggleReminder(item: ScheduleItem) {
  const key = `${selectedDay.value}-${item.title}-${item.episode}`
  remindedItems.value = remindedItems.value.includes(key)
    ? remindedItems.value.filter((entry) => entry !== key)
    : [...remindedItems.value, key]
}

/** 判断当前节目是否已经加入提醒。 */
function hasReminder(item: ScheduleItem) {
  return remindedItems.value.includes(`${selectedDay.value}-${item.title}-${item.episode}`)
}

onMounted(() => {
  void loadSchedule()
})
</script>

<template>
  <div class="page-stack schedule-page">
    <div class="schedule-page-heading">
      <div>
        <RouterLink class="back-link" to="/">← 返回首页</RouterLink>
        <span class="eyebrow">按时间找到下一集</span>
        <h2>一周排期</h2>
        <p>查看本周每天的动漫更新时间，提前收藏想看的作品。</p>
      </div>
      <div class="schedule-summary"><strong>{{ totalScheduleCount }}</strong><span>本周场次</span></div>
    </div>

    <div v-if="loading" class="schedule-status-hint" aria-live="polite">排期加载中…</div>
    <div v-else-if="apiError" class="schedule-status-hint schedule-status-error" role="status">
      接口暂不可用，当前展示本地演示数据
      <button class="schedule-retry" type="button" @click="loadSchedule">重试</button>
    </div>

    <div class="schedule-day-tabs" role="tablist" aria-label="排期日期">
      <button v-for="day in days" :key="day.key" class="schedule-day-tab" :class="{ active: selectedDay === day.key }" type="button" role="tab" :aria-selected="selectedDay === day.key" @click="selectedDay = day.key"><strong>{{ day.label }}</strong><span>{{ day.date }}</span></button>
    </div>

    <section class="schedule-list-panel" aria-label="排期列表">
      <article v-for="item in scheduleItems" :key="`${selectedDay}-${item.title}-${item.episode}`" class="schedule-detail-row" :class="`detail-${item.tone}`">
        <div class="schedule-detail-time"><strong>{{ item.time }}</strong><span>{{ item.state }}</span></div>
        <div class="schedule-detail-pin" aria-hidden="true"></div>
        <div class="schedule-detail-copy"><strong>{{ item.title }} <em>· {{ item.episode }}</em></strong><p>{{ item.description }}</p></div>
        <div class="schedule-detail-actions"><RouterLink class="text-button" to="/ai">问 AI</RouterLink><button class="schedule-reminder" type="button" :aria-pressed="hasReminder(item)" @click="toggleReminder(item)">{{ hasReminder(item) ? '已提醒' : '加入提醒' }}</button></div>
      </article>
    </section>
  </div>
</template>
