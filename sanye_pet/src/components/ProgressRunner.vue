<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const progress = ref(0)
const width = ref(200)
const height = ref(8)
const running = ref(false)
const frames = import.meta.glob('../assets/mitsuha/running-right-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const runningFrames = Object.entries(frames).sort(([a], [b]) => a.localeCompare(b)).map(([, url]) => url)
const frame = ref(0)
let frameTimer: ReturnType<typeof setInterval> | undefined
let unsubscribe: (() => void) | undefined
let stopTimer: ReturnType<typeof setTimeout> | undefined
const runnerLeft = computed(() => `${8 + Math.max(0, Math.min(1, progress.value / 100)) * width.value}px`)

onMounted(() => {
  frameTimer = setInterval(() => { if (running.value) frame.value = (frame.value + 1) % runningFrames.length }, 110)
  unsubscribe = window.petApi?.onProgress(({ percent, barWidth, barHeight }) => {
    if (percent !== progress.value) {
      running.value = true
      if (stopTimer) clearTimeout(stopTimer)
      stopTimer = setTimeout(() => { running.value = false }, 350)
    }
    progress.value = percent
    width.value = barWidth
    height.value = Math.max(8, barHeight)
  })
})
onBeforeUnmount(() => { unsubscribe?.(); if (stopTimer) clearTimeout(stopTimer); if (frameTimer) clearInterval(frameTimer) })
</script>

<template>
  <div class="runner-stage" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100" aria-label="实际任务进度">
    <div class="runner-track" :style="{ width: `${width}px`, height: `${height}px` }">
      <div class="runner-fill" :style="{ width: `${progress}%` }" />
    </div>
    <img class="runner-person" :src="runningFrames[frame]" :style="{ left: runnerLeft }" alt="" aria-hidden="true" />
  </div>
</template>

<style scoped>
.runner-stage { position: relative; width: 100%; height: 100%; }
.runner-track { position: absolute; top: 64px; left: 32px; overflow: hidden; border-radius: 999px; background: #403e50; box-shadow: 0 1px 5px #211d2c; }
.runner-fill { height: 100%; border-radius: inherit; background: #f3c878; }
.runner-person { position: absolute; top: 10px; width: 48px; height: 48px; transition: left .22s linear; filter: drop-shadow(0 2px 2px #251b3e); }
@media (prefers-reduced-motion: reduce) { .runner-person { transition: none; } }
</style>
