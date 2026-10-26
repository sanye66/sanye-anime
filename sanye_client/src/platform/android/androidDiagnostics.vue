<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { clearExperience, clearSourceHealth, experienceEvents, nativePerformance } from './experience'
import { nativePlaybackDiagnostics, type NativePlaybackCapabilities } from './nativePlayback'
const names = { search: '搜索', preview: '读取选集', resolve: '解析地址', firstFrame: '首帧', stall: '播放缓冲', playback: '有效观看', seek: '定位画面' }
const outcomes = { success: '成功', partial: '部分完成', empty: '无结果', failed: '失败', cancelled: '已取消' }
const environment = ref<NativePlaybackCapabilities>()
onMounted(() => { void nativePlaybackDiagnostics().then(value => { environment.value = value }) })
const report = computed(() => JSON.stringify({ format: 'sanye-android-diagnostics', version: 3, exportedAt: Date.now(), environment: environment.value, video: nativePerformance.value, events: experienceEvents.value }, null, 2))
const showReport = ref(false)
const copyMessage = ref('')
async function copy() {
  showReport.value = true
  try { await navigator.clipboard.writeText(report.value); copyMessage.value = '诊断已复制' }
  catch { copyMessage.value = '请长按下方文本复制' }
}
function clear() { clearExperience(); clearSourceHealth(); copyMessage.value = '诊断和来源观测已清除'; showReport.value = false }
</script>

<template>
  <details class="android-setting-group android-diagnostics">
    <summary>播放与搜索诊断</summary>
    <p class="android-repository-note">记录设备与应用版本、耗时和错误码，不含搜索词、完整地址或订阅正文，不自动上传。</p>
    <p v-if="!experienceEvents.length" class="android-empty">搜索或播放后可查看耗时。</p>
    <p v-if="nativePerformance">{{ nativePerformance.width ?? '—' }} × {{ nativePerformance.height ?? '—' }}<span v-if="nativePerformance.fps"> · 片源 {{ nativePerformance.fps.toFixed(2) }} 帧/秒</span><span v-if="nativePerformance.droppedFrames !== undefined"> · 掉帧 {{ nativePerformance.droppedFrames }}</span></p>
    <ol v-if="experienceEvents.length" class="android-diagnostic-events">
      <li v-for="(event, index) in [...experienceEvents].reverse().slice(0, 12)" :key="`${event.at}:${index}`">
        <span>{{ names[event.stage] }} · {{ outcomes[event.outcome] }}</span><strong>{{ (event.milliseconds / 1000).toFixed(2) }} 秒</strong>
        <small v-if="event.source">{{ event.source }}</small>
        <small v-if="event.engine || event.code">{{ event.engine === 'media3' ? '原生播放' : '' }} {{ event.code }}</small>
      </li>
    </ol>
    <div class="android-utility-actions"><button type="button" class="android-secondary-button" @click="copy">复制诊断</button><button type="button" class="android-secondary-button" @click="clear">清除观测</button></div>
    <p v-if="copyMessage" role="status">{{ copyMessage }}</p>
    <textarea v-if="showReport" :value="report" readonly aria-label="诊断文本" rows="6"></textarea>
  </details>
</template>
