<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { InterpolationJob } from '@/video/interpolation'

const props = defineProps<{ source: string; hls: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const inputMode = ref<'current' | 'file'>('current')
const file = ref<File | null>(null)
const height = ref(480)
const busy = ref(false)
const stage = ref('')
const percent = ref(0)
const error = ref('')
const output = ref('')
let job: InterpolationJob | null = null
let generation = 0

function cancel() {
  generation++
  job?.cancel(); job = null
  busy.value = false
  stage.value = '已取消处理'
}
function close() { cancel(); emit('close') }
function choose(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0] || null }
async function start() {
  if (busy.value) return
  const source = inputMode.value === 'file' ? file.value : props.source
  if (!source) { error.value = '请选择视频文件'; return }
  const version = ++generation
  error.value = ''; busy.value = true; percent.value = 0
  if (output.value) URL.revokeObjectURL(output.value)
  output.value = ''
  job = new InterpolationJob(value => {
    if (version === generation) { stage.value = value.stage; percent.value = value.percent }
  })
  try {
    const blob = await job.convert(source, inputMode.value === 'current' && props.hls, height.value)
    if (version === generation) output.value = URL.createObjectURL(blob)
  } catch (cause) {
    if (version === generation) error.value = cause instanceof Error ? cause.message : '插帧失败，请选择其他视频重试'
  } finally { if (version === generation) { busy.value = false; job = null } }
}
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => { cancel(); if (output.value) URL.revokeObjectURL(output.value) })
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="interpolation-dialog" aria-labelledby="interpolation-title" @cancel.prevent="close">
          <header><h2 id="interpolation-title">120fps 插帧</h2><button type="button" aria-label="关闭插帧窗口" title="关闭" @click="close">×</button></header>
      <p class="interpolation-note">预处理模式：生成完成后播放。处理可能较慢，原视频保持暂停。</p>
      <fieldset :disabled="busy"><legend>视频来源</legend>
        <label><input v-model="inputMode" type="radio" value="current" /> 当前线路</label>
        <label><input v-model="inputMode" type="radio" value="file" /> 本地视频</label>
        <input v-if="inputMode === 'file'" type="file" accept="video/*" aria-label="选择插帧视频" @change="choose" />
        <label class="interpolation-resolution">输出分辨率 <select v-model="height" aria-label="插帧分辨率"><option :value="480">最高 480p</option><option :value="720">最高 720p</option><option :value="1080">最高 1080p</option></select></label>
      </fieldset>
      <p class="interpolation-note">最大输入 256 MiB。仅支持可读取的非加密点播视频；显示 120 帧需支持 120Hz 的屏幕。</p>
      <div v-if="busy || stage" class="interpolation-progress" role="status"><span>{{ stage }}</span><progress v-if="busy" :value="percent" max="100" aria-label="插帧进度"></progress></div>
      <p v-if="error" role="alert" class="interpolation-error">{{ error }}</p>
      <video v-if="output" :src="output" controls playsinline aria-label="120fps 插帧结果"></video>
      <footer>
        <button v-if="busy" type="button" class="secondary-button" @click="cancel">取消处理</button>
        <button v-else type="button" class="primary-button" :disabled="inputMode === 'file' && !file" @click="start">生成 120fps</button>
        <a v-if="output" class="secondary-button" :href="output" download="sanye-120fps.mp4">保存视频</a>
        <button type="button" class="secondary-button" @click="close">返回原视频</button>
      </footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.interpolation-dialog { width: min(720px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 20px; border: 1px solid #59616b; border-radius: 8px; background: #171c21; color: #f1f3f5; overflow: auto; }
.interpolation-dialog::backdrop { background: rgba(0, 0, 0, .7); }
header, footer { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
h2 { margin: 0; font-size: 20px; }
header button { width: 40px; height: 40px; flex: 0 0 40px; background: transparent; color: inherit; border: 0; cursor: pointer; font-size: 24px; }
fieldset { display: flex; flex-wrap: wrap; gap: 16px; margin: 16px 0; padding: 12px; border: 1px solid #58616b; }
label { display: flex; align-items: center; gap: 6px; }
.interpolation-resolution { width: 100%; }
select { padding: 8px; color: #f1f3f5; background: #30373d; border: 1px solid #69717a; }
input[type=file] { max-width: 100%; }
.interpolation-note { color: #c5cbd0; font-size: 13px; line-height: 1.7; }
.interpolation-error { color: #ffaaa2; overflow-wrap: anywhere; }
.interpolation-progress { display: grid; gap: 8px; margin-block: 12px; }
progress { width: 100%; accent-color: #61b7a5; }
video { width: 100%; aspect-ratio: 16/9; display: block; background: #000; margin-block: 16px; }
footer { margin-top: 16px; flex-wrap: wrap; justify-content: flex-end; }
</style>
