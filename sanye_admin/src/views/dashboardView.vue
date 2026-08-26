<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { adminDashboardApi, type AdminDashboardStats } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const stats = ref<AdminDashboardStats | null>(null)
const failed = ref(false)
const auth = useAuthStore()

const metrics = computed(() => [
  { label: '已发布作品', value: (stats.value?.animePublished ?? 6).toLocaleString(), trend: `共 ${stats.value?.animeTotal ?? 6} 部收录` },
  { label: '待处理反馈', value: String(stats.value?.feedbackPending ?? 24), trend: `${stats.value?.feedbackProcessing ?? 0} 条处理中`, warning: (stats.value?.feedbackPending ?? 0) > 0 },
  { label: 'AI 对话次数', value: (stats.value?.aiTotalConversations ?? 24891).toLocaleString(), trend: `今日 ${stats.value?.aiTodayMessages ?? 0} 条消息` },
  { label: '运行中任务', value: String(stats.value?.jobs ?? 3), trend: 'Quartz 定时任务' },
  { label: 'AI 累计成本', value: formatCents(stats.value?.aiTotalCostCents ?? 0), trend: `今日 ${formatCents(stats.value?.aiTodayCostCents ?? 0)}` },
])

const todos = computed(() => [
  { label: '内容审核', detail: `${stats.value?.animeReview ?? 0} 部作品等待审核`, priority: (stats.value?.animeReview ?? 0) > 0 ? '高' : '中', path: '/content', permission: 'anime:content:list' },
  { label: '用户反馈', detail: `${stats.value?.feedbackPending ?? 6} 条反馈需要优先处理`, priority: (stats.value?.feedbackPending ?? 0) > 0 ? '高' : '中', path: '/feedback', permission: 'feedback:list' },
  { label: '任务失败', detail: `${stats.value?.failedJobs ?? 0} 条失败执行记录待确认`, priority: (stats.value?.failedJobs ?? 0) > 0 ? '高' : '中', path: '/jobs/logs', permission: 'monitor:job:list' },
].filter((todo) => auth.hasPerm(todo.permission)))

const attentionCount = computed(() => (stats.value?.animeReview ?? 0) + (stats.value?.feedbackPending ?? 0))
const usageTrend = computed(() => stats.value?.aiUsageTrend ?? [])
const maxTrendCost = computed(() => Math.max(1, ...usageTrend.value.map((item) => item.costCents)))

/** 将后端以分为单位的成本格式化为人民币展示值。 */
function formatCents(value: number) {
  return `￥${(value / 100).toFixed(2)}`
}

const activities = [
  { operator: '陈编辑', text: '发布了', target: '《无职转生 · 第三季》', time: '10 分钟前' },
  { operator: 'AI 运营', text: '更新了', target: '剧透安全规则 v1.4', time: '1 小时前' },
]

onMounted(async () => {
  try {
    const result = await adminDashboardApi.stats()
    stats.value = result.data
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-welcome">
      <div>
        <span class="admin-kicker">运营概览</span>
        <h2>早上好，林默。</h2>
        <p>{{ failed ? '统计接口暂不可用，展示演示数据。' : `当前有 ${attentionCount} 项工作需要关注。` }}</p>
      </div>
      <el-button v-if="auth.hasPerm('anime:content:list')" type="primary" @click="$router.push('/content')">处理待审核内容</el-button>
    </div>
    <div class="admin-metric-grid">
      <article v-for="item in metrics" :key="item.label" class="admin-metric">
        <span class="admin-metric-label">{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small :class="{ warning: item.warning }">{{ item.trend }}</small>
      </article>
    </div>
    <div class="admin-columns">
      <el-card shadow="never" class="admin-card">
        <template #header><span>需要关注</span></template>
        <div class="admin-todo-list">
          <RouterLink v-for="todo in todos" :key="todo.label" :to="todo.path" class="admin-todo">
            <span class="admin-todo-dot" :class="todo.priority === '高' ? 'high' : 'mid'"></span>
            <span><strong>{{ todo.label }}</strong><small>{{ todo.detail }}</small></span>
            <em>{{ todo.priority }}</em>
          </RouterLink>
        </div>
      </el-card>
      <el-card shadow="never" class="admin-card">
        <template #header><span>最近动态</span></template>
        <div class="admin-activity">
          <div v-for="(item, index) in activities" :key="index">
            <strong>{{ item.operator }}</strong> {{ item.text }} <b>{{ item.target }}</b>
            <small>{{ item.time }}</small>
          </div>
        </div>
      </el-card>
    </div>
    <el-card shadow="never" class="admin-card usage-card">
      <template #header><div class="usage-heading"><span>AI 用量趋势</span><small>近 7 天 · 成本按分记录</small></div></template>
      <div class="usage-summary"><span>输入 token <strong>{{ (stats?.aiTotalPromptTokens ?? 0).toLocaleString() }}</strong></span><span>输出 token <strong>{{ (stats?.aiTotalCompletionTokens ?? 0).toLocaleString() }}</strong></span><span>累计成本 <strong>{{ formatCents(stats?.aiTotalCostCents ?? 0) }}</strong></span></div>
      <div v-if="usageTrend.length" class="usage-chart" aria-label="AI 成本趋势图">
        <div v-for="item in usageTrend" :key="item.day" class="usage-column"><span class="usage-value">{{ formatCents(item.costCents) }}</span><div class="usage-track"><i :style="{ height: `${Math.max(4, (item.costCents / maxTrendCost) * 100)}%` }"></i></div><small>{{ item.day.slice(5) }}</small></div>
      </div>
      <el-empty v-else description="暂无 AI 用量记录" :image-size="70" />
    </el-card>
  </div>
</template>

<style scoped>
.usage-card { min-height: 250px; }
.usage-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.usage-heading small, .usage-summary { color: #87919d; font-size: 11px; }
.usage-summary { display: flex; gap: 28px; flex-wrap: wrap; }
.usage-summary strong { margin-left: 6px; color: #d19b66; font-size: 18px; }
.usage-chart { display: flex; align-items: flex-end; gap: 16px; height: 150px; margin-top: 24px; padding: 0 10px; border-bottom: 1px solid rgba(156, 201, 216, .18); }
.usage-column { display: grid; flex: 1; grid-template-rows: 18px 1fr 18px; gap: 6px; min-width: 42px; height: 100%; text-align: center; }
.usage-value, .usage-column small { color: #98a9b6; font-size: 10px; }
.usage-track { position: relative; align-self: end; height: 100%; border-radius: 4px 4px 0 0; background: rgba(156, 201, 216, .08); }
.usage-track i { position: absolute; right: 20%; bottom: 0; left: 20%; display: block; border-radius: 4px 4px 0 0; background: linear-gradient(180deg, #f2c66e, #b96e64); }
@media (max-width: 700px) { .usage-summary { gap: 12px; }.usage-chart { gap: 6px; padding: 0; }.usage-value { overflow: hidden; font-size: 9px; text-overflow: ellipsis; } }
</style>
