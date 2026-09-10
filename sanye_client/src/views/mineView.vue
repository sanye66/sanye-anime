<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { favoriteApi, type FavoriteItem, type HistoryItem } from '@/api/favorite'
import { resolveAssetUrl } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { animeCatalogMap, isSupportedAnimeId } from '@/data/animeCatalog'
import { desktopMode } from '@/desktop'

interface ShelfEntry {
  id: string
  title: string
  meta: string
  cover: string
  score?: number
}

const auth = useAuthStore()
const favorites = ref<ShelfEntry[]>([])
const history = ref<ShelfEntry[]>([])
const loadingFavorites = ref(false)
const loadingHistory = ref(false)
const favoritesFailed = ref(false)
const historyFailed = ref(false)

/** 将收藏和历史接口模型统一转换为个人页货架条目。 */
function toEntry(item: FavoriteItem | HistoryItem): ShelfEntry {
  const anime = item.anime
  const local = animeCatalogMap[String(anime.id)]
  return {
    id: String(anime.id),
    title: local?.title ?? anime.title,
    meta: `${anime.year ?? ''} · ${anime.type} · ${anime.updateText ?? ''}`,
    cover: resolveAssetUrl(local?.cover) ?? resolveAssetUrl(anime.coverUrl && !anime.coverUrl.includes('anime-placeholder') ? anime.coverUrl : undefined) ?? '/covers/mushoku-oad.svg',
    score: anime.score,
  }
}

/** 加载收藏列表，失败时只影响收藏区而不阻塞个人页。 */
async function loadFavorites() {
  loadingFavorites.value = true
  favoritesFailed.value = false
  try {
    const result = await favoriteApi.list(1, 20)
    favorites.value = result.items.filter((item) => isSupportedAnimeId(item.anime.id)).map(toEntry)
  } catch {
    favoritesFailed.value = true
    favorites.value = []
  } finally {
    loadingFavorites.value = false
  }
}

/** 加载观看历史列表，失败时保留独立错误状态。 */
async function loadHistory() {
  loadingHistory.value = true
  historyFailed.value = false
  try {
    const result = await favoriteApi.history(1, 20)
    history.value = result.items.filter((item) => isSupportedAnimeId(item.anime.id)).map(toEntry)
  } catch {
    historyFailed.value = true
    history.value = []
  } finally {
    loadingHistory.value = false
  }
}

onMounted(() => {
  void loadFavorites()
  void loadHistory()
})
</script>

<template>
  <div class="page-stack narrow-page">
    <section class="section-heading"><div><span class="eyebrow">宫水三叶的个人空间</span><h2>个人中心</h2></div></section>
    <section class="profile-panel">
      <div class="avatar profile-avatar">S</div>
      <div>
        <h3>{{ auth.loggedIn ? '欢迎回来' : '欢迎来到 sanye_anime' }}</h3>
        <p>{{ desktopMode ? '收藏与观看历史' : '管理你的收藏、历史记录和 AI 对话，让每一次相遇都被好好记录。' }}</p>
      </div>
      <button v-if="!desktopMode && !auth.loggedIn" class="primary-button" type="button" @click="auth.loginRedirect()">登录</button>
    </section>
    <div class="mine-library-grid">
      <section class="mine-library-panel">
        <div class="mine-library-heading"><div><span class="eyebrow">已保存的作品</span><h3>收藏</h3></div><span class="mine-library-count">{{ favorites.length }} 部</span></div>
        <div v-if="loadingFavorites" class="feed-skeleton"><span></span><span></span></div>
        <div v-else-if="favoritesFailed" class="mine-library-empty"><p>收藏接口暂不可用，请稍后重试。</p><button class="text-button" type="button" @click="void loadFavorites()">重试</button></div>
        <div v-else-if="favorites.length" class="mine-shelf">
          <RouterLink v-for="item in favorites" :key="item.id" class="mine-shelf-card" :to="`/anime/${item.id}`">
            <img :src="item.cover" :alt="`${item.title} 封面`" loading="lazy" decoding="async" />
            <div><strong>{{ item.title }}</strong><small>{{ item.meta }}</small><small v-if="item.score !== undefined">★ {{ item.score }}</small></div>
          </RouterLink>
        </div>
        <div v-else class="mine-library-empty"><span class="mine-library-icon" aria-hidden="true">◇</span><p>还没有收藏作品，遇到喜欢的动漫就保存下来。</p><RouterLink class="text-button" to="/">去发现动漫 →</RouterLink></div>
      </section>
      <section class="mine-library-panel">
        <div class="mine-library-heading"><div><span class="eyebrow">最近看过的作品</span><h3>历史记录</h3></div><span class="mine-library-count">{{ history.length }} 条</span></div>
        <div v-if="loadingHistory" class="feed-skeleton"><span></span><span></span></div>
        <div v-else-if="historyFailed" class="mine-library-empty"><p>历史接口暂不可用，请稍后重试。</p><button class="text-button" type="button" @click="void loadHistory()">重试</button></div>
        <div v-else-if="history.length" class="mine-shelf">
          <RouterLink v-for="item in history" :key="item.id" class="mine-shelf-card" :to="`/anime/${item.id}`">
            <img :src="item.cover" :alt="`${item.title} 封面`" loading="lazy" decoding="async" />
            <div><strong>{{ item.title }}</strong><small>{{ item.meta }}</small><small v-if="item.score !== undefined">★ {{ item.score }}</small></div>
          </RouterLink>
        </div>
        <div v-else class="mine-library-empty"><span class="mine-library-icon" aria-hidden="true">◷</span><p>看过的动漫和作品详情会记录在这里。</p><RouterLink class="text-button" to="/">开始浏览 →</RouterLink></div>
      </section>
    </div>
    <div v-if="!desktopMode" class="settings-list personal-settings-list">
      <RouterLink class="settings-entry" to="/mine/model-config"><span class="settings-entry-icon" aria-hidden="true">✦</span><span class="settings-entry-copy"><strong>模型配置</strong><small>选择 AI 模型，调整回答参数和上下文长度。</small></span><span class="settings-entry-arrow" aria-hidden="true">→</span></RouterLink>
      <RouterLink class="settings-entry" to="/mine/import-request"><span class="settings-entry-icon" aria-hidden="true">入</span><span class="settings-entry-copy"><strong>申请导入作品</strong><small>提交作品详情页 URL，等待管理端审核后导入。</small></span><span class="settings-entry-arrow" aria-hidden="true">→</span></RouterLink>
      <RouterLink class="settings-entry" to="/mine/feedback"><span class="settings-entry-icon" aria-hidden="true">⌁</span><span class="settings-entry-copy"><strong>问题反馈</strong><small>告诉我们遇到的问题，帮助完善你的使用体验。</small></span><span class="settings-entry-arrow" aria-hidden="true">→</span></RouterLink>
    </div>
  </div>
</template>
