<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'
import { getRefreshToken } from '@/auth/session'
import { prefetchRoute } from '@/router'
import { desktopMode } from '@/desktop'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/** 先通知服务端注销，再清理本地会话并回到首页。 */
async function logout() {
  await authApi.logout(getRefreshToken()).catch(() => {})
  auth.logout()
  await router.push('/')
}

const navigation = [
  { label: '首页', path: '/', icon: '⌂' },
  { label: '番剧仓库', path: '/anime-repository', icon: '▦' },
  { label: 'AI 动漫助手', path: '/ai', icon: '✦' },
  { label: '一周排期', path: '/schedule', icon: '◷' },
  { label: '我的', path: '/mine', icon: '○' },
].filter((item) => !desktopMode || item.path !== '/ai')

const themeStorageKey = 'sanyeThemeModeV2'
const theme = ref<'dark' | 'light'>(window.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light')
const collapsed = ref(window.matchMedia('(min-width: 701px) and (max-width: 1100px)').matches)
const searchKeyword = ref('')

/** 将主题值同步到根节点，供全局样式切换。 */
function applyTheme(value: 'dark' | 'light') {
  document.documentElement.dataset.sanyeTheme = value
}

watch(
  theme,
  (value) => {
    window.localStorage.setItem(themeStorageKey, value)
    applyTheme(value)
  },
  { immediate: true },
)

/** 在暗色和亮色主题之间切换。 */
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

/** 判断导航项是否匹配当前路由，支持业务子路由高亮。 */
const isActive = (path: string) => route.path === path || (path !== '/' && route.path.startsWith(path))
const pageTitle = computed(() => (route.meta.title as string | undefined) ?? 'sanye_anime')
function goBack() {
  const previous = router.options.history.state.back
  if (typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//') && previous !== route.fullPath) {
    router.back()
  } else {
    void router.replace(route.path.startsWith('/anime/') ? '/anime-repository' : '/')
  }
}

watch(() => route.query.keyword, value => { searchKeyword.value = typeof value === 'string' ? value : '' }, { immediate: true })

/** 提交全局搜索并将关键词带入搜索结果页。 */
function submitSearch() {
  const keyword = searchKeyword.value.trim()
  if (!keyword) return
  void router.push({ path: '/search', query: { keyword } })
}

/** 在鼠标或键盘即将进入导航项时提前加载目标页面代码。 */
function warmRoute(path: string) {
  prefetchRoute(path)
}

/** 捕获所有内部链接的意图，让作品卡片等内容入口也能提前加载页面代码。 */
function warmInternalLink(event: Event) {
  if (!(event.target instanceof Element)) return
  const link = event.target.closest<HTMLAnchorElement>('a[href]')
  if (!link) return
  const url = new URL(link.href, window.location.href)
  if (url.origin !== window.location.origin) return
  prefetchRoute(`${url.pathname}${url.search}`)
}

/** 聚焦顶部搜索输入框，供快捷键调用。 */
function focusSearch() {
  document.querySelector<HTMLInputElement>('.topbar-search input')?.focus()
}

/** 处理 Cmd/Ctrl+K 搜索快捷键。 */
function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    focusSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pointerover', warmInternalLink, { passive: true })
  window.addEventListener('focusin', warmInternalLink)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointerover', warmInternalLink)
  window.removeEventListener('focusin', warmInternalLink)
})
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed }">
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
      <button class="sidebar-collapse" type="button" :aria-label="collapsed ? '展开导航' : '收起导航'" :title="collapsed ? '展开导航' : '收起导航'" :aria-expanded="!collapsed" aria-controls="main-navigation" @click="collapsed = !collapsed">
        <span aria-hidden="true">{{ collapsed ? '›' : '‹' }}</span>
      </button>
      <div class="brand">
        <div class="brand-mark">S</div>
        <div>
          <strong>sanye_anime</strong>
          <span>带着故事脉络观看</span>
        </div>
      </div>

      <nav id="main-navigation" class="main-nav" aria-label="主导航">
        <RouterLink
          v-for="item in navigation"
          :key="item.path"
          :to="item.path"
          :aria-label="item.label"
          :title="collapsed ? item.label : undefined"
          class="nav-item"
          :class="{ 'is-active': isActive(item.path) }"
          @mouseenter="warmRoute(item.path)"
          @focus="warmRoute(item.path)"
        >
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
        <div class="page-heading">
          <button v-if="route.path !== '/'" type="button" class="page-back" aria-label="返回上一级" title="返回上一级" @click="goBack"><span aria-hidden="true">←</span></button>
          <div>
          <span class="eyebrow">动漫发现工作区</span>
          <h1>{{ pageTitle }}</h1>
          </div>
        </div>
        <div class="topbar-actions">
          <form class="topbar-search" role="search" @submit.prevent="submitSearch">
            <span class="topbar-search-icon" aria-hidden="true">⌕</span>
            <input v-model="searchKeyword" aria-label="全局搜索" placeholder="搜索作品" maxlength="50" />
            <button type="submit" class="search-submit" aria-label="提交全局搜索" title="搜索" :disabled="!searchKeyword.trim()">搜索</button>
          </form>
          <button
            class="theme-toggle"
            type="button"
            :aria-label="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
            :title="theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
            :aria-pressed="theme === 'light'"
            @click="toggleTheme"
          >
            <span aria-hidden="true">{{ theme === 'dark' ? '☼' : '☾' }}</span>
          </button>
          <template v-if="auth.loggedIn">
            <span class="user-name">{{ auth.user?.nickname ?? '用户' }}</span>
            <button class="avatar-button" type="button" title="个人中心" @click="void router.push('/mine')">
              {{ auth.user?.nickname?.slice(0, 1) ?? '林' }}
            </button>
            <button class="logout-button" type="button" title="退出登录" @click="void logout()">退出</button>
          </template>
          <button v-else-if="!desktopMode" class="profile-button" type="button" @click="auth.loginRedirect()">登录</button>
        </div>
      </header>
      <RouterView v-slot="{ Component }">
        <Suspense>
          <component :is="Component" />
          <template #fallback>
            <div class="route-loading" aria-live="polite">
              <span class="route-loading-mark" aria-hidden="true">◌</span>
              <span>页面加载中…</span>
            </div>
          </template>
        </Suspense>
      </RouterView>
    </main>
  </div>
</template>
