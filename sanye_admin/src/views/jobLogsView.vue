<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminJobLogApi, type AdminJobLog } from '@/api/jobs'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const rows = ref<AdminJobLog[]>([])
const total = ref(0)
const page = ref(1)
const size = 10
const jobName = ref('')
const status = ref('')

const detailVisible = ref(false)
const detail = ref<AdminJobLog | null>(null)

/** 按任务名称、状态和页码加载执行日志。 */
async function load() {
  loading.value = true
  try {
    const result = await adminJobLogApi.list({
      pageNum: page.value,
      pageSize: size,
      jobName: jobName.value || undefined,
      status: status.value || undefined,
    })
    if (result.code === 200) {
      rows.value = result.rows ?? []
      total.value = result.total ?? 0
    } else {
      rows.value = []
      total.value = 0
    }
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/** 清空日志筛选条件并回到第一页。 */
function resetFilter() {
  jobName.value = ''
  status.value = ''
  page.value = 1
  void load()
}

/** 读取执行日志详情，详情接口失败时回退当前行。 */
async function openDetail(row: AdminJobLog) {
  try {
    const result = await adminJobLogApi.detail(row.jobLogId)
    detail.value = result.data ?? row
  } catch {
    detail.value = row
  }
  detailVisible.value = true
}

/** 确认后删除单条任务执行记录。 */
async function removeRow(row: AdminJobLog) {
  try {
    await ElMessageBox.confirm(`确认删除任务「${row.jobName}」的这条执行记录吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    const result = await adminJobLogApi.remove([row.jobLogId])
    if (result.code === 200) {
      ElMessage.success('执行记录已删除')
      void load()
    } else {
      ElMessage.error(result.msg || '删除失败')
    }
  } catch {
    ElMessage.error('删除失败，请稍后重试')
  }
}

/** 二次确认后清空全部任务执行记录。 */
async function cleanLogs() {
  try {
    await ElMessageBox.confirm(`确认清空全部 ${total.value} 条执行记录吗？此操作不可恢复。`, '清空确认', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    const result = await adminJobLogApi.clean()
    if (result.code === 200) {
      ElMessage.success('执行记录已清空')
      void load()
    } else {
      ElMessage.error(result.msg || '清空失败')
    }
  } catch {
    ElMessage.error('清空失败，请稍后重试')
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-heading">
      <div><span class="header-kicker">三叶的执行回响</span><h2>任务日志</h2><p>Quartz 定时任务的每次执行记录：耗时、状态与异常信息，可检索与清理。</p></div>
      <span class="admin-page-count">共 {{ total }} 条记录</span>
    </div>
    <div class="admin-toolbar">
      <el-input v-model="jobName" placeholder="按任务名称检索" clearable class="admin-search" @keyup.enter="page = 1; void load()" />
      <el-select v-model="status" placeholder="执行状态" clearable style="width: 140px">
        <el-option label="正常" value="0" />
        <el-option label="失败" value="1" />
      </el-select>
      <el-button type="primary" plain @click="page = 1; void load()">查询</el-button>
      <el-button @click="resetFilter">重置</el-button>
      <div class="admin-toolbar-spacer" />
      <el-button @click="void load()">刷新</el-button>
      <el-button v-if="auth.hasPerm('monitor:job:remove')" type="danger" plain @click="cleanLogs">清空</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" class="admin-table" empty-text="暂无任务执行记录">
      <el-table-column prop="jobLogId" label="日志序号" width="90" />
      <el-table-column prop="jobName" label="任务名称" min-width="140" />
      <el-table-column prop="jobGroup" label="分组" width="100" />
      <el-table-column prop="invokeTarget" label="调用目标" min-width="170" show-overflow-tooltip />
      <el-table-column prop="jobMessage" label="日志信息" min-width="180" show-overflow-tooltip />
      <el-table-column label="执行状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === '0' ? 'success' : 'danger'">{{ row.status === '0' ? '正常' : '失败' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="startTime" label="开始时间" width="160" />
      <el-table-column prop="endTime" label="结束时间" width="160" />
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="openDetail(row)">详情</el-button>
          <el-button v-if="auth.hasPerm('monitor:job:remove')" size="small" type="danger" plain @click="removeRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="admin-pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="size"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="void load()"
      />
    </div>

    <el-dialog v-model="detailVisible" title="执行记录详情" width="640px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="日志序号">{{ detail.jobLogId }}</el-descriptions-item>
        <el-descriptions-item label="任务名称">{{ detail.jobName }}</el-descriptions-item>
        <el-descriptions-item label="分组">{{ detail.jobGroup }}</el-descriptions-item>
        <el-descriptions-item label="调用目标">{{ detail.invokeTarget }}</el-descriptions-item>
        <el-descriptions-item label="日志信息">{{ detail.jobMessage }}</el-descriptions-item>
        <el-descriptions-item label="执行状态">
          <el-tag :type="detail.status === '0' ? 'success' : 'danger'">{{ detail.status === '0' ? '正常' : '失败' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="开始时间">{{ detail.startTime ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="结束时间">{{ detail.endTime ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="异常信息">
          <pre class="joblog-exception">{{ detail.exceptionInfo || '无' }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-toolbar-spacer {
  flex: 1;
}

.admin-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.joblog-exception {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
  line-height: 1.6;
}
</style>
