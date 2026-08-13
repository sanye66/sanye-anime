<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

const clientUrl = import.meta.env.VITE_CLIENT_URL ?? 'http://localhost:5173'
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
  <div class="site-shell">
    <div class="sky-scene" aria-hidden="true">
      <span class="sky-sunset-halo"></span>
      <span class="sky-cloud sky-cloud-one"></span>
      <span class="sky-cloud sky-cloud-two"></span>
      <span class="sky-cloud sky-cloud-three"></span>
      <span class="sky-cloud sky-cloud-four"></span>
      <span class="sky-horizon"></span>
      <span class="sky-star sky-star-one"></span>
      <span class="sky-star sky-star-two"></span>
      <span class="sky-star sky-star-three"></span>
      <span class="sky-star sky-star-four"></span>
      <span class="sky-star sky-star-five"></span>
      <span class="meteor meteor-one"><i></i></span>
      <span class="meteor meteor-two"><i></i></span>
      <span class="meteor meteor-three"><i></i></span>
      <span class="meteor meteor-four"><i></i></span>
      <span class="meteor meteor-five"><i></i></span>
      <span class="meteor meteor-six"><i></i></span>
    </div>
    <header class="site-header">
      <RouterLink class="brand" to="/"><span class="brand-mark">S</span><strong>Sanye Anime</strong></RouterLink>
      <nav aria-label="官网导航">
        <RouterLink to="/about">产品介绍</RouterLink>
        <RouterLink to="/legal">法律信息</RouterLink>
        <button class="theme-toggle" type="button" :aria-label="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :title="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'" :aria-pressed="theme === 'light'" @click="toggleTheme"><span aria-hidden="true">{{ theme === 'dark' ? '☼' : '☾' }}</span></button>
        <a class="header-cta" :href="clientUrl">打开客户端</a>
      </nav>
    </header>
    <RouterView />
    <footer class="site-footer"><span>Sanye Anime</span><span>带着故事脉络发现动漫。</span></footer>
  </div>
</template>
