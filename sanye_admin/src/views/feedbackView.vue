<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { adminApi, type AdminFeedback, type FeedbackStatus } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const rows = ref<AdminFeedback[]>([])
const tab = ref<'全部' | FeedbackStatus>('全部')
const importingId = ref<string | null>(null)

const demoRows: AdminFeedback[] = [
  { id: 'f1', title: 'AI 回答包含了未观看集数的内容', user: '用户 10382', type: '剧透反馈', priority: '高', time: '10 分钟前', status: '待处理' },
  { id: 'f2', title: '《无职转生 · 第一季》角色资料有一处错误', user: '用户 10211', type: '内容纠错', priority: '中', time: '1 小时前', status: '处理中' },
  { id: 'f3', title: '希望增加按情绪找番', user: '用户 09931', type: '功能建议', priority: '低', time: '昨天', status: '已关闭' },
  { id: 'f4', title: '申请导入：https://example.com/p/900/', user: '用户 09932', type: '作品导入申请', priority: '中', time: '刚刚', status: '待处理', content: '申请导入：https://example.com/p/900/\n说明：希望补充这部作品。' },
]

/** 加载反馈列表，服务异常时展示用于联调的演示数据。 */
async function load() {
  loading.value = true
  try {
    rows.value = await adminApi.feedback()
  } catch {
    rows.value = demoRows
  } finally {
    loading.value = false
  }
}
void load()

const filtered = computed(() => (tab.value === '全部' ? rows.value : rows.value.filter((row) => row.status === tab.value)))

/** 按待处理→处理中→已关闭→待处理循环推进反馈状态。 */
async function advance(row: AdminFeedback) {
  const next: FeedbackStatus = row.status === '待处理' ? '处理中' : row.status === '处理中' ? '已关闭' : '待处理'
  try {
    await adminApi.feedbackStatus(row.id, next)
    row.status = next
    ElMessage.success(`反馈 #${row.id} 状态已更新为「${next}」`)
  } catch {
    ElMessage.error(`反馈 #${row.id} 状态更新失败`)
  }
}

function requestUrl(row: AdminFeedback) {
  return (row.content || row.title).match(/https:\/\/[^\s，。；;,]+/i)?.[0] || ''
}

/** 审核客户端提交的作品 URL，确认后由管理端执行真实导入。 */
async function importRequest(row: AdminFeedback) {
  const sourceUrl = requestUrl(row)
  if (!sourceUrl) {
    ElMessage.warning('这条申请中没有可用的 HTTPS 地址')
    return
  }
  importingId.value = row.id
  try {
    const result = await adminApi.animeImportUrl(sourceUrl, false)
    await adminApi.feedbackStatus(row.id, '已关闭')
    row.status = '已关闭'
    ElMessage.success(`已审核导入《${result.anime.title}》，视频资源 ${result.episodesImported} 条`)
  } catch {
    ElMessage.error('审核导入失败，请检查来源白名单和页面格式')
  } finally {
    importingId.value = null
  }
}

/** 将当前反馈列表导出为带 BOM 的 CSV，兼容中文表格软件。 */
function exportRows() {
  if (!rows.value.length) return
  const headers = ['反馈', '用户', '类型', '优先级', '时间', '状态']
  const values = rows.value.map((row) => [row.title, row.user, row.type, row.priority, row.time, row.status])
  const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`
  const csv = [headers, ...values].map((line) => line.map(escapeCell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sanye-feedback-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(link)
  link.click()
  window.setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 1000)
  ElMessage.success(`已导出 ${rows.value.length} 条反馈记录`)
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-welcome">
      <div>
        <span class="admin-kicker">反馈与质量</span>
        <h2>用户反馈</h2>
        <p>处理用户问题，记录 AI 质量和内容修正结果。</p>
      </div>
      <el-button :disabled="loading || !rows.length" :icon="Download" @click="exportRows">导出记录</el-button>
    </div>
    <el-radio-group v-model="tab" class="admin-toolbar">
      <el-radio-button value="全部">全部</el-radio-button>
      <el-radio-button value="待处理">待处理</el-radio-button>
      <el-radio-button value="处理中">处理中</el-radio-button>
      <el-radio-button value="已关闭">已关闭</el-radio-button>
    </el-radio-group>
    <el-table v-loading="loading" :data="filtered" class="admin-table" empty-text="这个状态下没有反馈">
      <el-table-column label="反馈">
        <template #default="{ row }">
          <strong>{{ row.title }}</strong>
          <small class="admin-sub">{{ row.user }} · {{ row.type }} · {{ row.time }}</small>
          <small v-if="row.content && row.content !== row.title" class="admin-sub feedback-content">{{ row.content }}</small>
        </template>
      </el-table-column>
      <el-table-column label="优先级" width="110">
        <template #default="{ row }">
          <el-tag :type="row.priority === '高' ? 'danger' : row.priority === '中' ? 'warning' : 'info'">
            {{ row.priority }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="row.status === '已关闭' ? 'info' : row.status === '处理中' ? 'primary' : 'warning'">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240">
        <template #default="{ row }">
          <el-button v-if="row.type === '作品导入申请' && auth.hasPerm('anime:content:edit')" size="small" type="success" plain :loading="importingId === row.id" @click="importRequest(row)">
            审核导入
          </el-button>
          <el-button v-if="auth.hasPerm('feedback:status')" size="small" type="primary" plain @click="advance(row)">
            {{ row.status === '待处理' ? '开始处理' : row.status === '处理中' ? '关闭' : '重新打开' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
