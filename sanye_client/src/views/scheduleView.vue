<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

type ScheduleItem = {
  time: string
  state: string
  title: string
  episode: string
  description: string
  tone: 'blue' | 'coral' | 'gold'
}

type ScheduleDayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

const days: Array<{ key: ScheduleDayKey; label: string; date: string }> = [
  { key: 'monday', label: '周一', date: '09 月 15 日' },
  { key: 'tuesday', label: '周二', date: '09 月 16 日' },
  { key: 'wednesday', label: '周三', date: '09 月 17 日' },
  { key: 'thursday', label: '周四', date: '09 月 18 日' },
  { key: 'friday', label: '周五', date: '09 月 19 日' },
  { key: 'saturday', label: '周六', date: '09 月 20 日' },
  { key: 'sunday', label: '周日', date: '09 月 21 日' },
]

const scheduleMap: Record<ScheduleDayKey, ScheduleItem[]> = {
  monday: [
    { time: '18:30', state: '待播出', title: '夏末余晖', episode: '第 08 集', description: '沿着旧铁轨回到夏天结束前的最后一天。', tone: 'gold' },
  ],
  tuesday: [
    { time: '20:00', state: '待播出', title: '远方来信', episode: '第 08 集', description: '山顶的灯亮起时，来自远方的回信终于抵达。', tone: 'coral' },
  ],
  wednesday: [
    { time: '19:30', state: '待播出', title: '蓝色时刻', episode: '第 10 集', description: '潮湿的站台亮起第一盏灯，城市开始交换秘密。', tone: 'blue' },
    { time: '22:00', state: '待播出', title: '潮汐与月光', episode: '第 02 集', description: '纸船沿着退潮的方向，带走两个人的秘密。', tone: 'gold' },
  ],
  thursday: [
    { time: '19:30', state: '已播出', title: '雨停之后', episode: '第 06 集', description: '雨后的电车站迎来一封没有署名的信。', tone: 'blue' },
    { time: '21:30', state: '即将播出', title: '蓝色时刻', episode: '第 11 集', description: '只有日落后的七分钟，才能看见城市被遗忘的另一面。', tone: 'blue' },
    { time: '22:00', state: '下一场', title: '星海回声', episode: '第 04 集', description: '旧广播塔接收到一段来自失落地表的求救信号。', tone: 'coral' },
    { time: '23:15', state: '稍后', title: '潮汐与月光', episode: '第 02 集', description: '纸船沿着退潮的方向，带走两个人的秘密。', tone: 'gold' },
  ],
  friday: [
    { time: '20:00', state: '待播出', title: '远方来信', episode: '第 09 集', description: '回信的最后一页，写着一条通往海边的路。', tone: 'coral' },
  ],
  saturday: [
    { time: '18:00', state: '待播出', title: '雨停之后', episode: '第 07 集', description: '他们决定在雨季结束前，走完那条巷子。', tone: 'blue' },
    { time: '21:00', state: '待播出', title: '星海回声', episode: '第 05 集', description: '流星雨之后，广播里出现了第二个声音。', tone: 'coral' },
  ],
  sunday: [
    { time: '22:30', state: '待播出', title: '夏末余晖', episode: '特别篇', description: '沿着旧铁轨回到夏天结束前的最后一天。', tone: 'gold' },
  ],
}

const selectedDay = ref<ScheduleDayKey>('thursday')
const remindedItems = ref<string[]>([])
const scheduleItems = computed(() => scheduleMap[selectedDay.value])
const totalScheduleCount = computed(() => Object.values(scheduleMap).reduce((total, items) => total + items.length, 0))

function toggleReminder(item: ScheduleItem) {
  const key = `${selectedDay.value}-${item.title}-${item.episode}`
  remindedItems.value = remindedItems.value.includes(key)
    ? remindedItems.value.filter((entry) => entry !== key)
    : [...remindedItems.value, key]
}

function hasReminder(item: ScheduleItem) {
  return remindedItems.value.includes(`${selectedDay.value}-${item.title}-${item.episode}`)
}
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
