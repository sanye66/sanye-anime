<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { ChatDotRound, Collection, DataAnalysis, Location } from '@element-plus/icons-vue'

const navigation = [
  { label: '三叶观测台', path: '/dashboard', icon: DataAnalysis },
  { label: '三叶档案', path: '/content', icon: Collection },
  { label: '三叶回声', path: '/feedback', icon: ChatDotRound },
]

const theme = ref<'dark' | 'light'>(window.localStorage.getItem('sanyeThemeMode') === 'light' ? 'light' : 'dark')

function applyTheme(value: 'dark' | 'light') {
  document.documentElement.dataset.sanyeTheme = value
}

watch(theme, (value) => {
  window.localStorage.setItem('sanyeThemeMode', value)
  applyTheme(value)
}, { immediate: true })

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <el-container class="admin-shell">
    <el-aside width="238px" class="admin-aside">
      <div class="admin-brand"><span class="brand-mark">三</span><div><strong>sanye_anime</strong><small>宫水三叶资料馆</small></div></div>
      <div class="archive-stamp"><span>宫水三叶</span><small>糸守町 · 2013</small></div>
      <nav class="admin-nav" aria-label="管理平台导航">
        <RouterLink v-for="item in navigation" :key="item.path" :to="item.path" class="admin-nav-item"><el-icon><component :is="item.icon" /></el-icon><span>{{ item.label }}</span></RouterLink>
      </nav>
      <div class="archive-people"><span class="archive-people-title">当前记录员</span><div class="person-row"><span class="person-avatar mitsuha">三</span><div><strong>宫水三叶</strong><small>宫水神社 / 黄昏记录</small></div></div><div class="mitsuha-thread"><span class="thread-knot"></span><span>三叶的结绳记录持续中</span></div></div>
      <div class="admin-aside-foot"><span class="status-dot"></span>三叶记录正常</div>
    </el-aside>
    <el-container>
      <el-header class="admin-header"><div><span class="header-kicker">宫水神社 · 三叶的第 39 次记录</span><h1>三叶观测台</h1></div><div class="operator"><span class="weather-note"><Location /> 糸守湖畔 · 18°C</span><button class="theme-toggle" type="button" :aria-label="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :title="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :aria-pressed="theme === 'light'" @click="toggleTheme"><span aria-hidden="true">{{ theme === 'dark' ? '☼' : '☾' }}</span></button><span class="operator-avatar">三</span><span>宫水三叶</span><el-button text>退出记录</el-button></div></el-header>
      <el-main class="admin-main"><RouterView /></el-main>
    </el-container>
  </el-container>
</template>
