<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { backupFiles, createPersonalBackup, pendingRestoreState, retryPendingRestore, restorePersonalBackup, validatePersonalBackup, type AndroidPersonalBackup } from './personalBackup'

const emit = defineEmits<{ restored: [] }>()
const busy = ref(false)
const message = ref('')
const error = ref('')
const preview = ref<AndroidPersonalBackup>()
const pending = ref(false)
onMounted(async () => {
  try { pending.value = !!(await pendingRestoreState()).pending }
  catch { error.value = '恢复日志暂时无法读取，请稍后重试。' }
})
async function retry() {
  busy.value = true; error.value = ''
  try {
    const outcome = await retryPendingRestore()
    pending.value = outcome.pending; message.value = outcome.message
    emit('restored')
  } catch { error.value = '订阅恢复尚未完成，日志仍保留，请释放存储空间后重试。' }
  finally { busy.value = false }
}
async function save() {
  busy.value = true; error.value = ''; message.value = ''
  try {
    const content = await createPersonalBackup()
    const result = await backupFiles.save({ content, name: `sanye-backup-${Date.now()}.json` })
    if (!result.cancelled) message.value = '备份已保存到所选位置。'
  } catch (failure) { error.value = failure instanceof Error ? failure.message : '备份保存失败，请重试。' }
  finally { busy.value = false }
}
async function pick() {
  busy.value = true; error.value = ''; message.value = ''; preview.value = undefined
  try {
    const result = await backupFiles.pick()
    if (!result.cancelled) preview.value = await validatePersonalBackup(result.content || '')
  } catch (failure) { error.value = failure instanceof Error ? failure.message : '备份读取失败，请重试。' }
  finally { busy.value = false }
}
async function restore() {
  if (!preview.value || busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    const outcome = await restorePersonalBackup(preview.value)
    if (outcome.partial) error.value = outcome.message
    else message.value = outcome.message
    pending.value = outcome.partial
    preview.value = undefined
    emit('restored')
  } catch (failure) { error.value = failure instanceof Error ? failure.message : '恢复失败，原有数据未更改。' }
  finally { busy.value = false }
}
</script>

<template>
  <details class="android-backup">
    <summary>本机备份</summary>
    <p>保存作品、观看历史、设置及来源规则。文件包含个人记录，请妥善保管。</p>
    <div class="android-backup-actions">
      <button type="button" :disabled="busy" @click="save">保存备份</button>
      <button type="button" :disabled="busy" @click="pick">选择备份</button>
      <button v-if="pending" type="button" :disabled="busy" @click="retry">重试未完成恢复</button>
    </div>
    <section v-if="preview" class="android-backup-preview" aria-label="恢复预览">
      <p>保存 {{ preview.personalData.savedMedia.length }} 条 · 历史 {{ preview.personalData.watchHistory.length }} 条 · 订阅 {{ preview.subscriptions.length }} 个 · 来源快照 {{ preview.sourceBindings.length }} 条</p>
      <p>合并到本机，不删除已有记录，不切换当前订阅；同一记录保留较新版本。</p>
      <div class="android-backup-actions">
        <button type="button" :disabled="busy" @click="restore">确认恢复</button>
        <button type="button" :disabled="busy" @click="preview = undefined">取消</button>
      </div>
    </section>
    <p v-if="busy" role="status">处理中…</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </details>
</template>

<style scoped>
.android-backup { margin-block: 16px; padding: 16px; border: 1px solid var(--android-border, #8885); border-radius: 16px; }
.android-backup summary { cursor: pointer; font-weight: 600; }
.android-backup p { font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.android-backup-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.android-backup button { min-height: 44px; padding: 10px 16px; border: 1px solid #8885; border-radius: 12px; color: inherit; background: transparent; cursor: pointer; }
.android-backup button:disabled { opacity: .5; cursor: wait; }
.android-backup-preview { margin-top: 12px; }
.android-backup [role="alert"] { color: var(--android-danger, #dc5252); }
</style>
