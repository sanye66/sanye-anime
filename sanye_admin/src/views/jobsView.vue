<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminJobApi, adminJobLogApi, type AdminJob, type AdminJobBody } from '@/api/jobs'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const rows = ref<AdminJob[]>([])
const total = ref(0)
const page = ref(1)
const size = 10
const failureCount = ref(0)
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const jobForm = reactive<AdminJobBody>({
  jobName: '',
  jobGroup: 'DEFAULT',
  invokeTarget: '',
  cronExpression: '0 0/5 * * * ?',
  misfirePolicy: '0',
  concurrent: '1',
  status: '1',
  remark: '',
})

/** 按页加载 Quartz 任务列表。 */
async function load() {
  loading.value = true
  try {
    const result = await adminJobApi.list(page.value, size)
    if (result.code === 200) {
      rows.value = result.rows ?? []
      total.value = result.total ?? 0
    }
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/** 查询失败执行记录数量，供任务页告警提示使用。 */
async function loadFailureCount() {
  try {
    const result = await adminJobLogApi.list({ pageNum: 1, pageSize: 1, status: '1' })
    failureCount.value = result.total ?? 0
  } catch {
    failureCount.value = 0
  }
}

/** 清空任务编辑表单并恢复新建默认值。 */
function resetForm() {
  Object.assign(jobForm, {
    jobId: undefined,
    jobName: '',
    jobGroup: 'DEFAULT',
    invokeTarget: '',
    cronExpression: '0 0/5 * * * ?',
    misfirePolicy: '0',
    concurrent: '1',
    status: '1',
    remark: '',
  })
  editingId.value = null
}

/** 打开新建任务弹窗。 */
function openCreate() {
  resetForm()
  dialogVisible.value = true
}

/** 打开任务编辑弹窗并优先读取服务端详情。 */
async function openEdit(row: AdminJob) {
  resetForm()
  editingId.value = row.jobId
  dialogVisible.value = true
  try {
    Object.assign(jobForm, (await adminJobApi.detail(row.jobId)).data, { jobId: row.jobId })
  } catch {
    Object.assign(jobForm, row)
  }
}

/** 校验任务名称、调用目标和 CRON 后保存任务。 */
async function save() {
  if (!jobForm.jobName.trim() || !jobForm.invokeTarget.trim() || !jobForm.cronExpression.trim()) {
    ElMessage.warning('任务名称、调用目标和 CRON 表达式不能为空')
    return
  }
  try {
    const result = editingId.value ? await adminJobApi.edit(jobForm) : await adminJobApi.add(jobForm)
    if (result.code === 200) {
      ElMessage.success(editingId.value ? '任务已更新' : '任务已创建，当前默认暂停')
      dialogVisible.value = false
      void load()
    } else ElMessage.error(result.msg || '保存失败')
  } catch {
    ElMessage.error('保存失败，请检查 CRON 表达式和调用目标')
  }
}

/** 二次确认后删除指定任务。 */
async function remove(row: AdminJob) {
  try {
    await ElMessageBox.confirm(`确认删除任务「${row.jobName}」吗？`, '删除确认', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    const result = await adminJobApi.remove([row.jobId])
    if (result.code === 200) {
      ElMessage.success('任务已删除')
      void load()
    } else ElMessage.error(result.msg || '删除失败')
  } catch {
    // 取消操作不提示。
  }
}

/** 并行刷新任务列表和失败记录数量。 */
async function refresh() {
  await Promise.all([load(), loadFailureCount()])
}

/** 修改 Quartz 任务暂停/运行状态。 */
async function changeStatus(row: AdminJob, next: '0' | '1') {
  try {
    const result = await adminJobApi.changeStatus(row.jobId, next)
    if (result.code === 200) {
      row.status = next
      ElMessage.success(`任务「${row.jobName}」已${next === '1' ? '恢复' : '暂停'}`)
    } else {
      ElMessage.error(result.msg || '操作失败')
    }
  } catch {
    ElMessage.error('操作失败，请稍后重试')
  }
}

/** 立即提交指定任务执行，不改变任务原有调度状态。 */
async function runNow(row: AdminJob) {
  try {
    const result = await adminJobApi.run(row)
    if (result.code === 200) {
      ElMessage.success(`任务「${row.jobName}」已提交执行`)
    } else {
      ElMessage.error(result.msg || '执行失败')
    }
  } catch {
    ElMessage.error('执行失败，请稍后重试')
  }
}

onMounted(() => {
  void load()
  void loadFailureCount()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-heading">
      <div><span class="header-kicker">三叶的定时记录</span><h2>任务管理</h2><p>Quartz 定时任务的生命周期：查看、立即执行、暂停与恢复。</p></div>
      <span class="admin-page-count">共 {{ total }} 个任务</span>
    </div>
    <el-alert v-if="failureCount > 0" type="warning" :closable="false" show-icon title="存在失败任务执行记录"><template #default><span>当前有 {{ failureCount }} 条失败记录，请检查执行日志并确认是否需要重试。</span><el-button type="warning" link @click="$router.push('/jobs/logs')">查看日志</el-button></template></el-alert>
    <div class="admin-toolbar job-toolbar">
      <div class="admin-toolbar-spacer" />
      <el-button v-if="auth.hasPerm('monitor:job:add')" type="primary" @click="openCreate">新建任务</el-button>
      <el-button @click="void refresh()">刷新</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" class="admin-table" empty-text="暂无定时任务">
      <el-table-column prop="jobName" label="任务名称" min-width="160" />
      <el-table-column prop="jobGroup" label="分组" width="110" />
      <el-table-column prop="invokeTarget" label="调用目标" min-width="180" show-overflow-tooltip />
      <el-table-column prop="cronExpression" label="CRON 表达式" width="150" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === '1' ? 'success' : 'info'">{{ row.status === '1' ? '运行中' : '已暂停' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="290" fixed="right">
        <template #default="{ row }">
          <el-button v-if="auth.hasPerm('monitor:job:changeStatus')" size="small" type="primary" plain @click="runNow(row)">立即执行</el-button>
          <el-button v-if="auth.hasPerm('monitor:job:edit')" size="small" plain @click="void openEdit(row)">编辑</el-button>
          <el-button
            v-if="auth.hasPerm('monitor:job:changeStatus') && row.status === '1'"
            size="small"
            type="warning"
            plain
            @click="changeStatus(row, '0')"
          >
            暂停
          </el-button>
          <el-button v-else-if="auth.hasPerm('monitor:job:changeStatus')" size="small" type="success" plain @click="changeStatus(row, '1')">恢复</el-button>
          <el-button v-if="auth.hasPerm('monitor:job:remove')" size="small" type="danger" link @click="void remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑任务' : '新建任务'" width="640px">
      <el-form label-width="110px">
        <div class="job-form-grid"><el-form-item label="任务名称"><el-input v-model="jobForm.jobName" maxlength="64" /></el-form-item><el-form-item label="任务分组"><el-input v-model="jobForm.jobGroup" maxlength="30" /></el-form-item></div>
        <el-form-item label="调用目标"><el-input v-model="jobForm.invokeTarget" maxlength="500" placeholder="例如 sanyeTask.cleanupFiles()" /></el-form-item>
        <el-form-item label="CRON 表达式"><el-input v-model="jobForm.cronExpression" maxlength="255" placeholder="例如 0 0/5 * * * ?" /></el-form-item>
        <div class="job-form-grid"><el-form-item label="计划策略"><el-select v-model="jobForm.misfirePolicy"><el-option label="默认" value="0" /><el-option label="忽略错过" value="1" /><el-option label="立即触发一次" value="2" /><el-option label="不立即触发" value="3" /></el-select></el-form-item><el-form-item label="并发执行"><el-switch v-model="jobForm.concurrent" active-value="1" inactive-value="0" active-text="禁止" inactive-text="允许" /></el-form-item></div>
        <el-form-item label="任务备注"><el-input v-model="jobForm.remark" type="textarea" :rows="2" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="void save()">保存任务</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.job-toolbar { margin-top: -8px; }
.admin-toolbar-spacer { flex: 1; }
.job-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 640px) { .job-form-grid { grid-template-columns: 1fr; gap: 0; } }
</style>
