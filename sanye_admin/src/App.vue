<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ChatDotRound, Collection, DataAnalysis, Document, Key, List, Location, Memo, Menu, Timer, User } from '@element-plus/icons-vue'
import { adminAuthApi } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const navigation = [
  { label: '三叶观测台', path: '/dashboard', icon: DataAnalysis, permission: '' },
  { label: '三叶档案', path: '/content', icon: Collection, permission: 'anime:content:list' },
  { label: '官网正文', path: '/official-content', icon: Document, permission: 'legal:content:list' },
  { label: '三叶回声', path: '/feedback', icon: ChatDotRound, permission: 'feedback:list' },
  { label: '任务管理', path: '/jobs', icon: Timer, permission: 'monitor:job:list' },
  { label: '任务日志', path: '/jobs/logs', icon: Memo, permission: 'monitor:job:list' },
  { label: '用户管理', path: '/users', icon: User, permission: 'system:user:list' },
  { label: '权限与审计', path: '/audit', icon: List, permission: 'monitor:operlog:list' },
  { label: '角色管理', path: '/roles', icon: Key, permission: 'system:role:list' },
  { label: '菜单管理', path: '/menus', icon: Menu, permission: 'system:menu:list' },
]

const theme = ref<'dark' | 'light'>(window.localStorage.getItem('sanyeThemeMode') === 'light' ? 'light' : 'dark')
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isLoginPage = computed(() => route.path === '/login')
const operatorName = computed(() => auth.user?.nickname ?? '记录员')
const operatorInitial = computed(() => operatorName.value.slice(0, 1))
const visibleNavigation = computed(() => navigation.filter((item) => !item.permission || auth.hasPerm(item.permission) || auth.hasRoute(item.path)))

/** 将管理端主题同步到根节点，供全局样式切换。 */
function applyTheme(value: 'dark' | 'light') {
  document.documentElement.dataset.sanyeTheme = value
}

watch(theme, (value) => {
  window.localStorage.setItem('sanyeThemeMode', value)
  applyTheme(value)
}, { immediate: true })

/** 在管理端暗色和亮色主题之间切换。 */
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

/** 通知服务端注销并清理本地权限，最后回到登录页。 */
async function logout(): Promise<void> {
  await adminAuthApi.logout().catch(() => undefined)
  auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <RouterView v-if="isLoginPage" />
  <el-container v-else class="admin-shell">
    <el-aside width="238px" class="admin-aside">
      <div class="admin-brand"><span class="brand-mark">三</span><div><strong>sanye_anime</strong><small>宫水三叶资料馆</small></div></div>
      <div class="archive-stamp"><span>宫水三叶</span><small>糸守町 · 2013</small></div>
      <nav class="admin-nav" aria-label="管理平台导航">
        <RouterLink v-for="item in visibleNavigation" :key="item.path" :to="item.path" class="admin-nav-item"><el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span></RouterLink>
      </nav>
      <div class="archive-people"><span class="archive-people-title">当前记录员</span><div class="person-row"><span class="person-avatar mitsuha">{{ operatorInitial }}</span><div><strong>{{ operatorName }}</strong><small>宫水神社 / 黄昏记录</small></div></div><div class="mitsuha-thread"><span class="thread-knot"></span><span>三叶的结绳记录持续中</span></div></div>
      <div class="admin-aside-foot"><span class="status-dot"></span>三叶记录正常</div>
    </el-aside>
    <el-container>
      <el-header class="admin-header"><div><span class="header-kicker">宫水神社 · 三叶的第 39 次记录</span><h1>三叶观测台</h1></div><div class="operator"><span class="weather-note"><Location /> 糸守湖畔 · 18°C</span><button class="theme-toggle" type="button" :aria-label="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :title="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :aria-pressed="theme === 'light'" @click="toggleTheme"><span aria-hidden="true">{{ theme === 'dark' ? '☼' : '☾' }}</span></button><span class="operator-avatar">{{ operatorInitial }}</span><span>{{ operatorName }}</span><el-button text @click="void logout()">退出记录</el-button></div></el-header>
      <el-main class="admin-main"><RouterView /></el-main>
    </el-container>
  </el-container>
</template>
