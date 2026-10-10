<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { Refresh, VideoPlay, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { xxlJobApi, type XxlJobStatus, type XxlJobLog } from '@/api/xxlJobs'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const status = ref<XxlJobStatus | null>(null)
const rows = ref<XxlJobLog[]>([])
const total = ref(0)
const page = ref(1)
const filter = ref(-1)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const actionError = ref('')
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detail = ref<XxlJobLog | null>(null)
let revision = 0
let detailRevision = 0
const canRun = computed(() => auth.hasPerm('monitor:job:changeStatus'))
const canRead = computed(() => auth.hasPerm('monitor:job:query'))

function message(err: unknown) { return err instanceof Error ? err.message : '请求失败，请稍后重试' }
function result(row: XxlJobLog): '成功' | '失败' | '执行中' | '待调度' {
  if (row.handleCode === 200) return '成功'
  if (row.handleCode > 0 || (row.triggerCode > 0 && row.triggerCode !== 200)) return '失败'
  return row.triggerCode === 200 ? '执行中' : '待调度'
}
function resultType(row: XxlJobLog) {
  const value = result(row)
  return value === '成功' ? 'success' : value === '失败' ? 'danger' : 'info'
}
function time(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
async function load() {
  const current = ++revision
  loading.value = true
  error.value = ''
  try {
    const next = await xxlJobApi.status()
    if (current !== revision) return
    status.value = next
    if (!next.configured) { rows.value = []; total.value = 0; return }
    if (!canRead.value) { error.value = '无权查看执行记录'; rows.value = []; total.value = 0; return }
    const logs = await xxlJobApi.logs(page.value, 10, filter.value)
    if (current !== revision) return
    rows.value = logs.rows
    total.value = logs.total
  } catch (err) {
    if (current === revision) { error.value = message(err); status.value = null; rows.value = []; total.value = 0 }
  } finally {
    if (current === revision) loading.value = false
  }
}
async function run() {
  if (submitting.value || !canRun.value || !status.value?.configured) return
  submitting.value = true
  actionError.value = ''
  try {
    await xxlJobApi.trigger()
    ElMessage.success('任务已提交，请查看执行记录')
    page.value = 1
    filter.value = -1
    await load()
  } catch (err) { actionError.value = message(err) }
  finally { submitting.value = false }
}
function showDetail(row: XxlJobLog) {
  detailOpen.value = true
  detailLoading.value = false
  detailError.value = ''
  detail.value = row
}
onMounted(() => void load())
onBeforeUnmount(() => { revision++; detailRevision++ })
</script>

<template>
  <section class="xxl-job-panel" aria-label="XXL-JOB 任务管理">
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-alert v-else-if="status && !status.configured" title="XXL-JOB 尚未配置" type="warning" :closable="false" show-icon />
    <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
    <div v-loading="loading" class="xxl-summary">
      <div><h3>作品索引对账与重建</h3><span v-if="status?.configured" class="xxl-metadata">任务 {{ status.jobId }} · {{ status.executorAppName }}</span></div>
      <el-tag v-if="status?.configured" :type="status.executorOnline ? 'success' : 'warning'">{{ status.executorOnline ? '执行器在线' : '执行器离线' }}</el-tag>
      <el-button v-if="canRun" type="primary" :icon="VideoPlay" :loading="submitting" :disabled="loading || !status?.executorOnline" @click="run">立即执行</el-button>
    </div>
    <div class="xxl-toolbar">
      <h3>执行记录</h3>
      <el-select v-model="filter" aria-label="执行状态" class="xxl-filter" :disabled="loading || !status?.configured" @change="page = 1; load()">
        <el-option label="全部状态" :value="-1" />
        <el-option label="成功" :value="1" />
        <el-option label="失败" :value="2" />
        <el-option label="进行中" :value="3" />
      </el-select>
      <el-tooltip content="刷新任务与执行记录"><el-button :icon="Refresh" aria-label="刷新 XXL-JOB" :disabled="loading" @click="load" /></el-tooltip>
    </div>
    <el-table v-loading="loading" :data="rows" class="admin-table" :empty-text="error ? '执行记录加载失败' : status?.configured ? '暂无执行记录' : '暂无可用任务'">
      <el-table-column prop="id" label="日志编号" width="100" />
      <el-table-column label="调度时间" min-width="180"><template #default="{ row }">{{ time(row.triggerTime) }}</template></el-table-column>
      <el-table-column label="完成时间" min-width="180"><template #default="{ row }">{{ time(row.handleTime) }}</template></el-table-column>
      <el-table-column label="结果" width="100"><template #default="{ row }"><el-tag :type="resultType(row)">{{ result(row) }}</el-tag></template></el-table-column>
      <el-table-column v-if="canRead || canRun" label="操作" width="160" fixed="right"><template #default="{ row }">
        <el-tooltip v-if="canRead" content="查看执行详情"><el-button :icon="View" aria-label="查看执行详情" @click="showDetail(row)" /></el-tooltip>
        <el-tooltip v-if="canRun && result(row) === '失败'" content="重新执行索引任务"><el-button :icon="Refresh" aria-label="重新执行索引任务" :disabled="submitting || !status?.executorOnline" @click="run" /></el-tooltip>
      </template></el-table-column>
    </el-table>
    <el-pagination v-if="total > 0" v-model:current-page="page" :page-size="10" :total="total" layout="prev, pager, next" :disabled="loading" class="xxl-pagination" @current-change="load" />
    <el-dialog v-model="detailOpen" title="XXL-JOB 执行详情" width="min(720px, 94vw)" @closed="detailRevision++">
      <div v-loading="detailLoading" class="xxl-detail">
        <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
        <template v-if="detail">
          <p>日志 {{ detail.id }} · {{ result(detail) }}</p>
          <h4>调度结果</h4><pre>{{ detail.triggerMessage || '-' }}</pre>
          <h4>执行结果</h4><pre>{{ detail.handleMessage || '-' }}</pre>
        </template>
      </div>
      <template #footer><el-button @click="detailOpen = false">关闭</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.xxl-job-panel { min-width: 0; }
.xxl-summary { display: flex; align-items: center; gap: 16px; padding: 20px 0; min-height: 96px; border-bottom: 1px solid var(--el-border-color-light); flex-wrap: wrap; }
.xxl-summary > div:first-child { flex: 1; min-width: 210px; }
.xxl-summary h3, .xxl-toolbar h3 { font-size: 16px; margin: 0 0 6px; }
.xxl-metadata { font-size: 13px; color: var(--el-text-color-secondary); overflow-wrap: anywhere; }
.xxl-toolbar { display: flex; align-items: center; gap: 12px; padding: 20px 0 14px; flex-wrap: wrap; }
.xxl-toolbar h3 { flex: 1; }
.xxl-filter { width: 140px; }
.xxl-pagination { margin-top: 20px; justify-content: flex-end; }
.xxl-detail { min-height: 140px; color: #273442; }
.xxl-job-panel :deep(.el-table__cell) { color: #273442; background: #fff; }
.xxl-job-panel :deep(th.el-table__cell) { color: #4b5c6d; }
.xxl-detail pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.7 monospace; max-height: 260px; overflow: auto; }
.xxl-job-panel > .el-alert { margin-top: 12px; }
</style>
