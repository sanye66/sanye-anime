<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { androidDownloads, downloadSize, downloadsAvailable, type DownloadSnapshot, type DownloadState, type OfflinePlaybackItem } from './downloads'

const emit = defineEmits<{ play: [item: OfflinePlaybackItem] }>()
const available = downloadsAvailable()
const snapshot = ref<DownloadSnapshot>({ items: [], usedBytes: 0, maxStorageBytes: 2 * 1024 ** 3, maxFileBytes: 512 * 1024 ** 2 })
const title = ref('')
const url = ref('')
const error = ref('')
const busy = ref(false)
const confirming = ref('')
const opened = ref(false)
const states: Record<DownloadState, string> = { queued: '排队中', downloading: '下载中', completed: '已下载', failed: '下载失败', cancelled: '已取消' }
const pending = computed(() => snapshot.value.items.some(item => item.state === 'queued' || item.state === 'downloading'))
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let revision = 0
function message(failure: unknown) { return failure instanceof Error ? failure.message : '下载操作失败，请重试' }
async function refresh(resume = false) {
  if (!available || disposed || busy.value) return
  const request = ++revision
  try {
    const result = await (resume ? androidDownloads.resume() : androidDownloads.list())
    if (!disposed && request === revision) snapshot.value = result
  } catch (failure) { if (!disposed && request === revision) error.value = message(failure) }
}
function schedule() {
  clearTimeout(timer)
  if (disposed || !available || !opened.value) return
  timer = setTimeout(async () => { await refresh(); schedule() }, pending.value ? 1000 : 5000)
}
async function action(operation: () => Promise<DownloadSnapshot>, success?: () => void) {
  if (busy.value || disposed) return
  busy.value = true
  const request = ++revision
  error.value = ''
  try {
    const result = await operation()
    if (!disposed && request === revision) { snapshot.value = result; success?.() }
  } catch (failure) { if (!disposed && request === revision) error.value = message(failure) }
  finally { if (!disposed && request === revision) { busy.value = false; schedule() } }
}
async function add() {
  await action(() => androidDownloads.enqueue(url.value.trim(), title.value), () => { title.value = ''; url.value = '' })
}
async function play(id: string) {
  if (busy.value || disposed) return
  const request = ++revision
  busy.value = true; error.value = ''
  try {
    const item = await androidDownloads.play(id)
    if (!disposed && request === revision) emit('play', item)
  } catch (failure) { if (!disposed && request === revision) error.value = message(failure) }
  finally { if (!disposed && request === revision) busy.value = false }
}
async function remove(id: string) {
  if (confirming.value !== id) return
  await action(() => androidDownloads.remove(id, true), () => { confirming.value = '' })
}
function toggle(event: Event) {
  opened.value = (event.target as HTMLDetailsElement).open
  if (opened.value) void refresh().then(schedule)
  else clearTimeout(timer)
}
onMounted(() => { void refresh(true) })
onUnmounted(() => { disposed = true; ++revision; clearTimeout(timer) })
</script>

<template>
  <details class="android-setting-group android-downloads" @toggle="toggle">
    <summary>离线下载<span v-if="snapshot.items.length"> · {{ snapshot.items.length }}</span></summary>
    <p class="android-repository-note">仅支持公网 HTTPS MP4 直链；暂不支持 HLS、DASH、加密媒体和解析页。单个文件不超过 512 MiB，总容量不超过 2 GiB。</p>
    <p v-if="!available" class="android-empty">离线下载仅在已安装的安卓应用中可用，浏览器预览不会下载视频。</p>
    <template v-else>
      <form class="android-download-form" @submit.prevent="add">
        <label>下载名称<input v-model="title" maxlength="200" autocomplete="off" placeholder="作品与集数" :disabled="busy" /></label>
        <label>MP4 直链<input v-model="url" type="url" maxlength="4096" autocomplete="off" placeholder="https://…/video.mp4" :disabled="busy" /></label>
        <button type="submit" class="android-primary-button" :disabled="busy || !title.trim() || !url.trim()">{{ busy ? '处理中…' : '加入下载队列' }}</button>
      </form>
      <p class="android-repository-note">已用 {{ downloadSize(snapshot.usedBytes) }} / {{ downloadSize(snapshot.maxStorageBytes) }}</p>
      <p v-if="!snapshot.items.length" class="android-empty">暂无下载任务</p>
      <ul v-else class="android-download-list">
        <li v-for="item in snapshot.items" :key="item.id" class="android-download-item">
          <strong>{{ item.title }}</strong>
          <span role="status">{{ states[item.state] }} · {{ downloadSize(item.bytes) }}<template v-if="item.total"> / {{ downloadSize(item.total) }}</template></span>
          <progress v-if="item.state === 'downloading'" :value="item.total ? item.bytes : undefined" :max="item.total || 1" :aria-label="`${item.title} 下载进度`"></progress>
          <p v-if="item.error" class="android-error">{{ item.error }}</p>
          <div class="android-utility-actions">
            <button v-if="item.state === 'completed'" type="button" class="android-secondary-button" :disabled="busy" @click="play(item.id)">{{ item.position > 0 && item.position < item.duration - 5 ? '继续观看' : '离线播放' }}</button>
            <button v-if="item.state === 'downloading' || item.state === 'queued'" type="button" class="android-secondary-button" :disabled="busy" @click="action(() => androidDownloads.cancel(item.id))">取消下载</button>
            <button v-if="item.state === 'failed' || item.state === 'cancelled'" type="button" class="android-secondary-button" :disabled="busy" @click="action(() => androidDownloads.retry(item.id))">重新下载</button>
            <button v-if="item.state !== 'downloading'" type="button" class="android-secondary-button" :disabled="busy" @click="confirming = item.id">删除下载</button>
          </div>
          <div v-if="confirming === item.id" class="android-download-confirm" role="group" aria-label="确认删除下载">
            <p>删除“{{ item.title }}”的下载文件和任务？此操作不会删除收藏或观看历史。</p>
            <button type="button" class="android-secondary-button" :disabled="busy" @click="remove(item.id)">确认删除</button>
            <button type="button" class="android-secondary-button" :disabled="busy" @click="confirming = ''">保留</button>
          </div>
        </li>
      </ul>
      <button type="button" class="android-secondary-button" :disabled="busy" @click="refresh()">刷新下载状态</button>
    </template>
    <p v-if="error" role="alert" class="android-error">{{ error }}</p>
  </details>
</template>
