<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

const navigation = [
  { label: '首页', path: '/', icon: '⌂' },
  { label: '番剧仓库', path: '/anime-repository', icon: '▦' },
  { label: 'AI 助手', path: '/ai', icon: '✦' },
  { label: '一周排期', path: '/schedule', icon: '◷' },
  { label: '个人中心', path: '/mine', icon: '○' },
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
  <div class="app-shell">
    <div class="client-sky" aria-hidden="true">
      <span class="sky-cloud cloud-one"></span>
      <span class="sky-cloud cloud-two"></span>
      <span class="sky-cloud cloud-three"></span>
      <span class="sky-mountain mountain-back"></span>
      <span class="sky-mountain mountain-front"></span>
      <span class="sky-orbit orbit-one"></span>
      <span class="sky-orbit orbit-two"></span>
      <span class="sky-star client-star-one"></span>
      <span class="sky-star client-star-two"></span>
      <span class="sky-star client-star-three"></span>
      <span class="client-meteor meteor-one"></span>
      <span class="client-meteor meteor-two"></span>
      <span class="client-meteor meteor-three"></span>
    </div>
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">S</div>
        <div>
          <strong>sanye_anime</strong>
          <span>带着故事脉络观看</span>
        </div>
      </div>

      <nav class="main-nav" aria-label="主导航">
        <RouterLink v-for="item in navigation" :key="item.path" :to="item.path" class="nav-item">
          <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <span class="status-dot"></span>
        <span>产品原型预览</span>
      </div>
    </aside>

    <main class="main-panel">
      <header class="topbar">
        <div>
          <span class="eyebrow">动漫发现工作区</span>
          <h1>发现下一段故事</h1>
        </div>
        <div class="topbar-actions">
          <button class="theme-toggle" type="button" :aria-label="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :title="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :aria-pressed="theme === 'light'" @click="toggleTheme"><span aria-hidden="true">{{ theme === 'dark' ? '☼' : '☾' }}</span></button>
          <button class="profile-button" type="button">登录</button>
        </div>
      </header>
      <RouterView />
    </main>
  </div>
</template>
