<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { favoriteApi, type ContinueWatchingItem, type FavoriteItem, type HistoryItem } from '@/api/favorite'
import { resolveAssetUrl } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { animeCatalogMap, isSupportedAnimeId } from '@/data/animeCatalog'
import { bundledCover, handleCoverFallback, placeholderCover } from '@/data/coverFallback'
import { desktopMode } from '@/desktop'

interface ShelfEntry {
  id: string
  title: string
  meta: string
  cover: string
  score?: number
}

/** 货架首屏只取一页，点开「查看全部」后再按更大的页长读取同一接口。 */
const SHELF_PAGE_SIZE = 20
const SHELF_EXPANDED_SIZE = 60

const auth = useAuthStore()
const favorites = ref<ShelfEntry[]>([])
const history = ref<ShelfEntry[]>([])
const continueWatching = ref<ContinueWatchingItem[]>([])
const loadingFavorites = ref(false)
const loadingHistory = ref(false)
const favoritesFailed = ref(false)
const historyFailed = ref(false)
const continueWatchingFailed = ref(false)
const historyExpanded = ref(false)
const favoritesExpanded = ref(false)
const favoritesRail = ref<HTMLElement | null>(null)
const historyRail = ref<HTMLElement | null>(null)
const continueRail = ref<HTMLElement | null>(null)

/** 横向货架的左右滑动按钮：按当前可见宽度推进一屏，保留最后一屏的完整卡片。 */
function scrollRail(rail: HTMLElement | null, direction: number): void {
  if (!rail) return
  rail.scrollBy({ left: direction * Math.max(Math.round(rail.clientWidth * 0.85), 180), behavior: 'smooth' })
}

/** 将收藏和历史接口模型统一转换为个人页货架条目。 */
function toEntry(item: FavoriteItem | HistoryItem): ShelfEntry {
  const anime = item.anime
  const local = animeCatalogMap[String(anime.id)]
  return {
    id: String(anime.id),
    title: local?.title ?? anime.title,
    meta: `${anime.year ?? ''} · ${anime.type} · ${anime.updateText ?? ''}`,
    // 封面降级顺序：随包目录封面 → 接口封面 → 通用占位图，不再借用其他作品的封面。
    cover: resolveAssetUrl(local?.cover)
      ?? resolveAssetUrl(anime.coverUrl && !anime.coverUrl.includes('anime-placeholder') ? anime.coverUrl : undefined)
      ?? placeholderCover,
    score: anime.score,
  }
}

/**
 * 「继续观看」只带作品与选集编号，封面按随包目录、历史记录、占位图的顺序补齐，
 * 避免为每条进度再发一次详情请求。
 */
function continueCover(animeId: number): string {
  const local = animeCatalogMap[String(animeId)]
  const localized = resolveAssetUrl(local?.cover)
  if (localized) return localized
  const known = [...history.value, ...favorites.value].find((entry) => entry.id === String(animeId))
  return known?.cover ?? placeholderCover
}

/** 加载收藏列表，失败时只影响收藏区而不阻塞个人页。 */
async function loadFavorites() {
  loadingFavorites.value = true
  favoritesFailed.value = false
  try {
    const result = await favoriteApi.list(1, favoritesExpanded.value ? SHELF_EXPANDED_SIZE : SHELF_PAGE_SIZE)
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
    const result = await favoriteApi.history(1, historyExpanded.value ? SHELF_EXPANDED_SIZE : SHELF_PAGE_SIZE)
    history.value = result.items.filter((item) => isSupportedAnimeId(item.anime.id)).map(toEntry)
  } catch {
    historyFailed.value = true
    history.value = []
  } finally {
    loadingHistory.value = false
  }
}

async function loadContinueWatching() {
  continueWatchingFailed.value = false
  try {
    // 接口结构异常（例如成功响应里没有数组）时不能把页面渲染带崩，按“没有进度”处理。
    const items = await favoriteApi.continueWatching(20)
    continueWatching.value = Array.isArray(items) ? items : []
  }
  catch { continueWatchingFailed.value = true; continueWatching.value = [] }
}

/** 历史记录在横向货架与完整列表之间切换，展开时补足更多分页数据。 */
function toggleHistoryAll() {
  historyExpanded.value = !historyExpanded.value
  void loadHistory()
}

/** 收藏与观看历史保持同一种展开方式，避免收藏多了以后无法翻看。 */
function toggleFavoritesAll() {
  favoritesExpanded.value = !favoritesExpanded.value
  void loadFavorites()
}

/** 有历史记录就提供「查看全部 / 收起」：展开后从横向货架切换成一次性看完的网格。 */
const showHistoryAllAction = computed(() => history.value.length > 0)

/** 收藏同样提供「查看全部 / 收起」。 */
const showFavoritesAllAction = computed(() => favorites.value.length > 0)

function progressLabel(item: ContinueWatchingItem) {
  if (item.completed) return '已看完，可重新观看'
  const percent = item.durationSeconds > 0 ? Math.min(100, Math.round(item.positionSeconds / item.durationSeconds * 100)) : 0
  const episode = item.episodeTitle ? item.episodeTitle : `第 ${item.episodeId} 集`
  return `${episode} · 已观看 ${percent}%`
}

function continueTitle(item: ContinueWatchingItem) {
  return animeCatalogMap[String(item.animeId)]?.title ?? `作品 ${item.animeId}`
}

/**
 * 「继续观看」直达带播放器的作品详情页，并把已保存的进度交给播放器续播：
 * `episode` 选中原选集，`resume` + `t` 让播放器从记录的秒数继续播放。
 */
function continueWatchingPath(item: ContinueWatchingItem): string {
  const seconds = item.completed ? 0 : Math.max(0, Math.floor(item.positionSeconds))
  return `/anime/${item.animeId}?episode=${item.episodeId}&resume=1&t=${seconds}`
}

onMounted(() => {
  void loadFavorites()
  void loadHistory()
  void loadContinueWatching()
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
        <div class="mine-library-heading">
          <div><span class="eyebrow">已保存的作品</span><h3>收藏</h3></div>
          <div class="mine-rail-actions">
            <span class="mine-library-count">{{ favorites.length }} 部</span>
            <div v-if="favorites.length && !favoritesExpanded" class="mine-rail-nav">
              <button type="button" aria-label="向左滑动收藏" title="向左滑动" @click="scrollRail(favoritesRail, -1)">←</button>
              <button type="button" aria-label="向右滑动收藏" title="向右滑动" @click="scrollRail(favoritesRail, 1)">→</button>
            </div>
            <button v-if="showFavoritesAllAction" class="text-button mine-rail-toggle" type="button" @click="toggleFavoritesAll">{{ favoritesExpanded ? '收起' : '查看全部' }}</button>
          </div>
        </div>
        <div v-if="loadingFavorites" class="feed-skeleton"><span></span><span></span></div>
        <div v-else-if="favoritesFailed" class="mine-library-empty"><p>收藏接口暂不可用，请稍后重试。</p><button class="text-button" type="button" @click="void loadFavorites()">重试</button></div>
        <div v-else-if="favorites.length" ref="favoritesRail" class="mine-rail" :class="{ 'is-expanded': favoritesExpanded }">
          <RouterLink v-for="item in favorites" :key="item.id" class="mine-rail-card" :to="`/anime/${item.id}`">
            <img :src="item.cover" :data-bundled-cover="bundledCover(item.title)" :alt="`${item.title} 封面`" loading="lazy" decoding="async" @error="handleCoverFallback" />
            <div class="mine-rail-copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.meta }}</small>
              <small v-if="item.score !== undefined">★ {{ item.score }}</small>
            </div>
          </RouterLink>
        </div>
        <div v-else class="mine-library-empty"><span class="mine-library-icon" aria-hidden="true">◇</span><p>还没有收藏作品，遇到喜欢的动漫就保存下来。</p><RouterLink class="text-button" to="/">去发现动漫 →</RouterLink></div>
      </section>
      <section class="mine-library-panel">
        <div class="mine-library-heading">
          <div><span class="eyebrow">最近看过的作品</span><h3>观看历史</h3></div>
          <div class="mine-rail-actions">
            <span class="mine-library-count">{{ history.length }} 条</span>
            <div v-if="history.length && !historyExpanded" class="mine-rail-nav">
              <button type="button" aria-label="向左滑动观看历史" title="向左滑动" @click="scrollRail(historyRail, -1)">←</button>
              <button type="button" aria-label="向右滑动观看历史" title="向右滑动" @click="scrollRail(historyRail, 1)">→</button>
            </div>
            <button v-if="showHistoryAllAction" class="text-button mine-rail-toggle" type="button" @click="toggleHistoryAll">{{ historyExpanded ? '收起' : '查看全部' }}</button>
          </div>
        </div>
        <div v-if="loadingHistory" class="feed-skeleton"><span></span><span></span></div>
        <div v-else-if="historyFailed" class="mine-library-empty"><p>历史接口暂不可用，请稍后重试。</p><button class="text-button" type="button" @click="void loadHistory()">重试</button></div>
        <div v-else-if="history.length" ref="historyRail" class="mine-rail" :class="{ 'is-expanded': historyExpanded }">
          <RouterLink v-for="item in history" :key="item.id" class="mine-rail-card" :to="`/anime/${item.id}`">
            <img :src="item.cover" :data-bundled-cover="bundledCover(item.title)" :alt="`${item.title} 封面`" loading="lazy" decoding="async" @error="handleCoverFallback" />
            <div class="mine-rail-copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.meta }}</small>
              <small v-if="item.score !== undefined">★ {{ item.score }}</small>
            </div>
          </RouterLink>
        </div>
        <div v-else class="mine-library-empty"><span class="mine-library-icon" aria-hidden="true">◷</span><p>看过的动漫和作品详情会记录在这里。</p><RouterLink class="text-button" to="/">开始浏览 →</RouterLink></div>
      </section>
    </div>
    <section class="mine-library-panel continue-watching-panel">
      <div class="mine-library-heading">
        <div><span class="eyebrow">接着上次的进度</span><h3>继续观看</h3></div>
        <div class="mine-rail-actions">
          <span class="mine-library-count">{{ continueWatching.length }} 条</span>
          <div v-if="continueWatching.length" class="mine-rail-nav">
            <button type="button" aria-label="向左滑动继续观看" title="向左滑动" @click="scrollRail(continueRail, -1)">←</button>
            <button type="button" aria-label="向右滑动继续观看" title="向右滑动" @click="scrollRail(continueRail, 1)">→</button>
          </div>
        </div>
      </div>
      <div v-if="continueWatchingFailed" class="mine-library-empty"><p>继续观看暂时无法读取。</p><button class="text-button" type="button" @click="void loadContinueWatching()">重试</button></div>
      <div v-else-if="continueWatching.length" ref="continueRail" class="mine-rail mine-rail-continue">
        <RouterLink v-for="item in continueWatching" :key="`${item.animeId}:${item.episodeId}`" class="mine-rail-card mine-continue-card" :to="continueWatchingPath(item)">
          <img :src="continueCover(item.animeId)" :data-bundled-cover="bundledCover(continueTitle(item))" :alt="`${continueTitle(item)} 封面`" loading="lazy" decoding="async" @error="handleCoverFallback" />
          <div class="mine-rail-copy">
            <strong>{{ continueTitle(item) }}</strong>
            <small>{{ progressLabel(item) }}</small>
            <progress :value="item.positionSeconds" :max="Math.max(item.durationSeconds, 1)"></progress>
          </div>
        </RouterLink>
      </div>
      <div v-else class="mine-library-empty"><span class="mine-library-icon" aria-hidden="true">▶</span><p>开始播放后，会在这里保留你的观看进度。</p></div>
    </section>
    <div v-if="!desktopMode" class="settings-list personal-settings-list">
      <RouterLink class="settings-entry" to="/mine/model-config"><span class="settings-entry-icon" aria-hidden="true">✦</span><span class="settings-entry-copy"><strong>模型配置</strong><small>选择 AI 模型，调整回答参数和上下文长度。</small></span><span class="settings-entry-arrow" aria-hidden="true">→</span></RouterLink>
      <RouterLink class="settings-entry" to="/mine/import-request"><span class="settings-entry-icon" aria-hidden="true">入</span><span class="settings-entry-copy"><strong>申请导入作品</strong><small>提交作品详情页 URL，等待管理端审核后导入。</small></span><span class="settings-entry-arrow" aria-hidden="true">→</span></RouterLink>
      <RouterLink class="settings-entry" to="/mine/feedback"><span class="settings-entry-icon" aria-hidden="true">⌁</span><span class="settings-entry-copy"><strong>问题反馈</strong><small>告诉我们遇到的问题，帮助完善你的使用体验。</small></span><span class="settings-entry-arrow" aria-hidden="true">→</span></RouterLink>
    </div>
  </div>
</template>
