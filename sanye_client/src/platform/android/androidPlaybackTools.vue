<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { parseSubtitles, type SubtitleCue } from './subtitles'
const props = defineProps<{ video: HTMLVideoElement | null; rate: number; canDownload?: boolean; downloadBusy?: boolean }>()
const emit = defineEmits<{ rate: [value: number]; download: [] }>()
const message = ref(''), subtitleName = ref(''), offset = ref(0), sleepMinutes = ref(0)
const subtitleInput = ref<HTMLInputElement | null>(null)
let subtitles: SubtitleCue[] = [], track: TextTrack | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0
function clearTrack() {
  if (!track) return
  // disabled 状态下 Chromium 的 cues 可能为 null，先 hidden 才能真正清除旧时间轴。
  track.mode = 'hidden'
  while (track.cues?.length) track.removeCue(track.cues[0]!)
  track.mode = 'disabled'
}
function applySubtitles() {
  clearTrack()
  const element = props.video
  if (!element || !subtitles.length) return
  const shift = Number.isFinite(offset.value) ? Math.max(-120, Math.min(120, offset.value)) : 0
  track = Array.from(element.textTracks).find(item => item.label === '本地字幕') ?? element.addTextTrack('subtitles', '本地字幕', 'zh')
  for (const item of subtitles) {
    const start = Math.max(0, item.start + shift), end = item.end + shift
    if (end > start) track.addCue(new VTTCue(start, end, item.text))
  }
  track.mode = 'showing'
}
async function loadSubtitle(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0], request = ++generation
  input.value = ''
  if (!file) return
  try {
    if (!/\.(srt|vtt)$/i.test(file.name) || file.size > 2 * 1024 * 1024) throw new Error('请选择不超过 2 MiB 的 SRT 或 WebVTT 字幕')
    const parsed = parseSubtitles(await file.text())
    if (request !== generation) return
    subtitles = parsed; subtitleName.value = file.name; offset.value = 0; message.value = ''; applySubtitles()
  } catch (error) { if (request === generation) message.value = error instanceof Error ? error.message : '字幕读取失败，请重试' }
}
function removeSubtitles() { ++generation; clearTrack(); subtitles = []; subtitleName.value = ''; message.value = '' }
function setSleep() {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (sleepMinutes.value > 0) timer = setTimeout(() => { props.video?.pause(); sleepMinutes.value = 0; timer = undefined }, sleepMinutes.value * 60000)
}
watch(() => props.video, applySubtitles)
watch(offset, applySubtitles)
onBeforeUnmount(() => { ++generation; clearTrack(); if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="android-playback-tools">
    <div class="android-playback-tools-row">
      <button v-if="canDownload" type="button" :disabled="downloadBusy" @click="emit('download')">{{ downloadBusy ? '加入中…' : '下载当前视频' }}</button>
      <label>速度 <select :value="rate" @change="emit('rate', Number(($event.target as HTMLSelectElement).value))"><option v-for="value in [0.75, 1, 1.25, 1.5, 2]" :key="value" :value="value">{{ value }}×</option></select></label>
      <label>定时暂停 <select v-model.number="sleepMinutes" @change="setSleep"><option :value="0">关闭</option><option v-for="value in [15, 30, 60, 90]" :key="value" :value="value">{{ value }} 分钟</option></select></label>
    </div>
    <div class="android-subtitle-picker"><button type="button" @click="subtitleInput?.click()">导入字幕</button><input ref="subtitleInput" hidden type="file" accept=".srt,.vtt,text/vtt" aria-label="导入本地字幕" @change="loadSubtitle" /></div>
    <div v-if="subtitleName" class="android-playback-tools-row"><span class="android-subtitle-name">{{ subtitleName }}</span><button type="button" @click="removeSubtitles">关闭字幕</button><label>偏移（秒）<input v-model.number="offset" type="number" min="-120" max="120" step="0.5" aria-label="字幕时间偏移" /></label></div>
    <p v-if="message" role="alert" class="android-error">{{ message }}</p>
  </div>
</template>
