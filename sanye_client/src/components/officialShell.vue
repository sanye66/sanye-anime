<script setup lang="ts">
import { RouterLink } from 'vue-router'

const links = [
  { label: '首页', path: '/official' },
  { label: '产品', path: '/official/about' },
  { label: '下载', path: '/official/download' },
  { label: '隐私与条款', path: '/official/legal' },
]
</script>

<template>
  <div class="official-page">
    <header class="official-header">
      <RouterLink class="official-brand" to="/official">
        <span class="brand-mark">S</span>
        <span><strong>official</strong><small>三叶动漫</small></span>
      </RouterLink>
      <nav class="official-nav" aria-label="官网导航">
        <RouterLink v-for="link in links" :key="link.path" :to="link.path" class="official-nav-link">
          {{ link.label }}
        </RouterLink>
        <RouterLink class="official-entry" to="/">进入 sanye_anime →</RouterLink>
      </nav>
    </header>
    <main class="official-main"><slot /></main>
    <footer class="official-footer">
      <span>© 2026 official</span>
      <span>公开内容 · 使用条款 · 隐私政策</span>
    </footer>
  </div>
</template>
