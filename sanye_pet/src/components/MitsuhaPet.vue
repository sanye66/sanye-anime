<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type PetState = 'idle' | 'attention' | 'dialogue' | 'sleep' | 'offline'

const props = defineProps<{
  state: PetState
}>()

const spriteSheetUrl = new URL('../assets/mitsuha/spritesheet.webp', import.meta.url).href

type SpriteAnimation = {
  row: number
  durations: number[]
}

const animations: Record<PetState, SpriteAnimation> = {
  idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  attention: { row: 3, durations: [140, 140, 140, 280] },
  dialogue: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  sleep: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  offline: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
}

const frame = ref(0)
const spriteStatus = ref<'loading' | 'ready' | 'failed'>('loading')
let frameTimer: ReturnType<typeof setTimeout> | undefined
let spritePreload: HTMLImageElement | undefined

const animation = computed(() => animations[props.state])

const spriteStyle = computed(() => ({
  backgroundImage: `url("${spriteSheetUrl}")`,
  backgroundPosition: `${(frame.value / 7) * 100}% ${animation.value.row * 10}%`,
}))

/** 清理当前精灵帧定时器，避免状态切换后多个动画循环并行。 */
function clearFrameTimer() {
  if (frameTimer) {
    clearTimeout(frameTimer)
    frameTimer = undefined
  }
}

/** 按当前状态的帧时长循环播放精灵动画。 */
function scheduleNextFrame() {
  clearFrameTimer()
  if (document.hidden) return
  const durations = animation.value.durations
  frameTimer = setTimeout(() => {
    frame.value = (frame.value + 1) % durations.length
    scheduleNextFrame()
  }, durations[frame.value] ?? durations[0])
}

/** 窗口不可见时暂停帧循环，重新显示后从当前帧继续。 */
function syncAnimationVisibility() {
  if (document.hidden) {
    clearFrameTimer()
  } else {
    scheduleNextFrame()
  }
}

// 状态改变时从第一帧重新播放，避免新状态沿用旧动画进度。
watch(
  () => props.state,
  () => {
    frame.value = 0
    scheduleNextFrame()
  },
  { immediate: true },
)

// 预加载精灵图并记录加载失败状态，失败时由模板显示 CSS 兜底角色。
onMounted(() => {
  document.addEventListener('visibilitychange', syncAnimationVisibility)
  spritePreload = new Image()
  spritePreload.onload = () => {
    spriteStatus.value = 'ready'
  }
  spritePreload.onerror = () => {
    spriteStatus.value = 'failed'
  }
  spritePreload.src = spriteSheetUrl
})

// 组件卸载时释放定时器和图片回调。
onBeforeUnmount(() => {
  clearFrameTimer()
  document.removeEventListener('visibilitychange', syncAnimationVisibility)
  if (spritePreload) {
    spritePreload.onload = null
    spritePreload.onerror = null
  }
})
</script>

<template>
  <div
    class="mitsuha-pet"
    :class="[`state-${props.state}`, { 'sprite-failed': spriteStatus === 'failed' }]"
    :style="spriteStyle"
    role="img"
    aria-label="宫水三叶桌宠"
  >
    <span v-if="spriteStatus === 'failed'" class="sprite-fallback" aria-hidden="true" />
  </div>
</template>

<style scoped>
.mitsuha-pet {
  position: relative;
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
  background-size: 800% 1100%;
  image-rendering: auto;
  pointer-events: none;
  transform-origin: center bottom;
}

.sprite-fallback {
  position: absolute;
  left: 31%;
  top: 22%;
  width: 38%;
  height: 62%;
  border-radius: 48% 48% 38% 38%;
  background: #f3d1b7;
  box-shadow: inset 0 -28px 0 #263052, 0 6px 0 #1d223c;
}

.sprite-fallback::before {
  content: "";
  position: absolute;
  left: -5%;
  top: -6%;
  width: 110%;
  height: 45%;
  border-radius: 50% 50% 36% 36%;
  background: #2a2030;
}

.sprite-fallback::after {
  content: "";
  position: absolute;
  right: -18%;
  top: 8%;
  width: 24%;
  height: 20%;
  border-radius: 50%;
  background: #bd3049;
  box-shadow: 5px 8px 0 #8e263b;
}

.state-idle,
.state-dialogue,
.state-offline {
  animation: sprite-breathe 3.2s ease-in-out infinite;
}

.state-attention {
  animation: sprite-attention 1.8s ease-in-out infinite;
}

.state-sleep {
  animation: sprite-sleep 5.2s ease-in-out infinite;
  filter: saturate(0.86) brightness(0.94);
}

.state-offline {
  filter: grayscale(0.78) opacity(0.9);
}

@keyframes sprite-breathe {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-3px);
  }
}

@keyframes sprite-attention {
  0%,
  100% {
    transform: translateX(-2px) rotate(-1deg);
  }

  50% {
    transform: translateX(2px) rotate(1deg);
  }
}

@keyframes sprite-sleep {
  0%,
  100% {
    transform: translateY(1px) scale(0.985);
  }

  50% {
    transform: translateY(-2px) scale(1);
  }
}
</style>
