<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { animeCatalog, compareAnimeCatalogOrder } from '@/data/animeCatalog'
import { useHomeFeed } from '@/composables/useHomeFeed'
import type { ShelfCard } from '@/composables/useHomeFeed'
import { resolveAssetUrl } from '@/api/http'

type HeroSlide = {
  slug: string
  cover: string
  eyebrow: string
  status: string
  title: string
  emphasis: string
  description: string
  primaryLabel: string
  primaryPath: string
  secondaryLabel: string
  secondaryPath: string
  facts: Array<{ value: string; label: string }>
  sceneLabel: string
  sceneTitle: string
  sceneDescription: string
}

const heroSlides: HeroSlide[] = [
  {
    slug: '127',
    cover: '/client-covers/your-name.jpg',
    eyebrow: '剧场版 · 光影推荐',
    status: '已导入 · 可立即观看',
    title: '你的名字',
    emphasis: '在梦里与你相遇。',
    description: '跨越时空的相遇与错过，在黄昏的天空下重新连接。打开作品详情，开始这段关于记忆、约定与寻找的旅程。',
    primaryLabel: '查看作品详情',
    primaryPath: '/anime/127',
    secondaryLabel: '让 AI 推荐相似作品',
    secondaryPath: '/ai',
    facts: [{ value: '127', label: '作品编号' }, { value: '剧场版', label: '作品类型' }, { value: '已发布', label: '当前状态' }],
    sceneLabel: '精选推荐 / 01',
    sceneTitle: '你的名字',
    sceneDescription: '关于相遇、记忆与约定的故事',
  },
  {
    slug: '133',
    cover: '/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100607A039.jpg',
    eyebrow: '异世界 · 系列推荐',
    status: '五个篇章 · 已聚合',
    title: '无职转生',
    emphasis: '这一次，拿出真本事。',
    description: '从重新开始的人生，到逐步找回勇气与方向。进入无职转生系列，按季度选择想看的篇章和剧集。',
    primaryLabel: '查看作品详情',
    primaryPath: '/anime/133',
    secondaryLabel: '查看系列片库',
    secondaryPath: '/anime-repository',
    facts: [{ value: '133', label: '第一季代表' }, { value: '5', label: '系列篇章' }, { value: '22', label: '已验证剧集' }],
    sceneLabel: '精选推荐 / 02',
    sceneTitle: '无职转生',
    sceneDescription: '重新开始的人生与异世界冒险',
  },
]

const localRecent = animeCatalog
  .filter((anime) => anime.recentRank)
  .sort((left, right) => compareAnimeCatalogOrder(left.slug, right.slug))

const localPopular = animeCatalog
  .filter((anime) => anime.popularRank)
  .sort((left, right) => compareAnimeCatalogOrder(left.slug, right.slug))
  .slice(0, 3)
  .map((anime) => ({ ...anime, tag: `本周热度 ${anime.popularity}%` }))

const feed = useHomeFeed()

/** 将最近导入并入最近更新，导入作品优先展示，并按 slug 去重。 */
const recentAnime = computed<ShelfCard[]>(() => {
  const updatedAnime = feed.recent.value.length
    ? feed.recent.value
    : localRecent.map((anime) => ({
        slug: anime.slug,
        title: anime.title,
        meta: anime.meta,
        cover: resolveAssetUrl(anime.cover) ?? '/covers/mushoku-oad.svg',
        tone: anime.tone,
        episode: anime.episode,
      }))
  const importedIds = new Set(feed.imported.value.map((anime) => anime.slug))
  return [...feed.imported.value, ...updatedAnime]
    .filter((anime, index, list) => list.findIndex((item) => item.slug === anime.slug) === index)
    .sort((left, right) => {
      const importedOrder = Number(importedIds.has(right.slug)) - Number(importedIds.has(left.slug))
      return importedOrder || compareAnimeCatalogOrder(left.slug, right.slug)
    })
})

const popularAnime = computed<ShelfCard[]>(() =>
  feed.popular.value.length
    ? feed.popular.value
    : localPopular.map((anime) => ({
        slug: anime.slug,
        title: anime.title,
        meta: anime.meta,
        cover: resolveAssetUrl(anime.cover) ?? '/covers/mushoku-oad.svg',
        tone: anime.tone,
        episode: anime.episode,
        tag: anime.tag,
    })),
)

const collectedAnime = ref<string[]>([])
const remindedEpisode = ref(false)
const currentHeroIndex = ref(0)
const heroDragStartX = ref<number | null>(null)
const heroDragOffset = ref(0)
const isHeroDragging = ref(false)
const suppressHeroClick = ref(false)
const currentHero = computed(() => heroSlides[currentHeroIndex.value])
const currentHeroCover = computed(() => resolveAssetUrl(currentHero.value.cover) ?? '/covers/anime-placeholder.svg')
const heroTrackStyle = computed(() => ({
  transform: `translate3d(calc(-${currentHeroIndex.value * (100 / heroSlides.length)}% + ${heroDragOffset.value}px), 0, 0)`,
}))
const router = useRouter()
const searchKeyword = ref('')

/** 从首页搜索框跳转到仓库筛选页。 */
function submitSearch() {
  const keyword = searchKeyword.value.trim()
  router.push({
    path: '/anime-repository',
    query: keyword ? { keyword } : undefined,
  })
}

/** 切换首页卡片的本地收藏展示状态。 */
function toggleCollection(title: string) {
  collectedAnime.value = collectedAnime.value.includes(title)
    ? collectedAnime.value.filter((item) => item !== title)
    : [...collectedAnime.value, title]
}

/** 判断首页卡片是否已被本地标记收藏。 */
function isCollected(title: string) {
  return collectedAnime.value.includes(title)
}

/** 将轮播索引限制在合法范围并切换当前精选。 */
function goToHero(index: number) {
  currentHeroIndex.value = (index + heroSlides.length) % heroSlides.length
}

/** 切换到下一张首页精选。 */
function showNextHero() {
  goToHero(currentHeroIndex.value + 1)
}

/** 切换到上一张首页精选。 */
function showPreviousHero() {
  goToHero(currentHeroIndex.value - 1)
}

/** 记录轮播拖拽起点，忽略非主鼠标按键。 */
function handleHeroPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  heroDragStartX.value = event.clientX
  heroDragOffset.value = 0
  isHeroDragging.value = true
}

/** 更新轮播拖拽偏移，达到阈值前保持当前幻灯片。 */
function handleHeroPointerMove(event: PointerEvent) {
  if (heroDragStartX.value === null) return
  const offset = event.clientX - heroDragStartX.value
  heroDragOffset.value = offset
  if (Math.abs(offset) > 8) event.preventDefault()
}

/** 结束轮播拖拽，按偏移阈值决定是否切换幻灯片。 */
function finishHeroDrag() {
  if (heroDragStartX.value === null) return
  const offset = heroDragOffset.value
  if (Math.abs(offset) > 52) {
    if (offset < 0) showNextHero()
    else showPreviousHero()
    suppressHeroClick.value = true
  }
  heroDragStartX.value = null
  heroDragOffset.value = 0
  isHeroDragging.value = false
}

/** 拖拽结束后抑制紧随其后的点击，避免误触跳转。 */
function handleHeroClick(event: MouseEvent) {
  if (!suppressHeroClick.value) return
  event.preventDefault()
  event.stopPropagation()
  suppressHeroClick.value = false
}
</script>

<template>
  <div class="page-stack home-page">
    <form class="home-search" role="search" aria-label="搜索番剧" @submit.prevent="submitSearch">
      <div class="home-search-field">
        <span class="home-search-icon" aria-hidden="true">⌕</span>
        <input v-model="searchKeyword" type="search" placeholder="搜索番剧、类型或故事线索" aria-label="搜索番剧、类型或故事线索" />
      </div>
      <button class="home-search-button" type="submit" aria-label="开始搜索" title="开始搜索"><span aria-hidden="true">→</span></button>
    </form>
    <section class="hero-panel home-hero" aria-roledescription="轮播图" aria-label="首页精选内容" @pointerdown="handleHeroPointerDown" @pointermove="handleHeroPointerMove" @pointerup="finishHeroDrag" @pointercancel="finishHeroDrag" @pointerleave="finishHeroDrag" @click.capture="handleHeroClick">
      <div class="hero-copy hero-copy-viewport">
        <div class="hero-copy-track" :class="{ 'is-dragging': isHeroDragging }" :style="heroTrackStyle">
          <article v-for="(slide, index) in heroSlides" :key="slide.slug" class="hero-copy-slide" :aria-hidden="index !== currentHeroIndex" :inert="index !== currentHeroIndex">
            <div class="hero-meta"><span class="eyebrow">{{ slide.eyebrow }}</span><span class="hero-status"><i></i>{{ slide.status }}</span></div>
            <h2>{{ slide.title }}<br /><em>{{ slide.emphasis }}</em></h2>
            <p>{{ slide.description }}</p>
            <div class="hero-actions"><RouterLink class="primary-button" :to="slide.primaryPath">{{ slide.primaryLabel }}</RouterLink><RouterLink class="secondary-button" :to="slide.secondaryPath">{{ slide.secondaryLabel }}</RouterLink></div>
            <div class="hero-facts"><span v-for="fact in slide.facts" :key="fact.label"><strong>{{ fact.value }}</strong><small>{{ fact.label }}</small></span></div>
          </article>
        </div>
      </div>
      <div class="hero-art" aria-label="精选动漫横幅展示区">
        <RouterLink class="hero-art-link" :to="currentHero.primaryPath" :aria-label="`查看 ${currentHero.sceneTitle} 详情`" :title="`查看 ${currentHero.sceneTitle} 详情`">
          <img :src="currentHeroCover" :alt="`${currentHero.sceneTitle} 动漫横幅`" />
        </RouterLink>
        <span class="scene-label">{{ currentHero.sceneLabel }}</span>
        <span class="art-caption">{{ currentHero.sceneTitle }}<br /><small>{{ currentHero.sceneDescription }}</small></span>
        <div class="hero-carousel-controls" aria-label="切换首页精选内容">
          <button class="hero-carousel-arrow" type="button" aria-label="上一张精选内容" title="上一张" @click.stop="showPreviousHero">←</button>
          <div class="hero-carousel-pagination" role="tablist" aria-label="精选内容页码">
            <button v-for="(slide, index) in heroSlides" :key="slide.slug" class="hero-carousel-page" :class="{ active: currentHeroIndex === index }" type="button" role="tab" :aria-label="`查看第 ${index + 1} 张精选内容`" :aria-selected="currentHeroIndex === index" @click.stop="goToHero(index)">{{ String(index + 1).padStart(2, '0') }}</button>
          </div>
          <button class="hero-carousel-arrow" type="button" aria-label="下一张精选内容" title="下一张" @click.stop="showNextHero">→</button>
        </div>
      </div>
    </section>

    <section class="ai-feature-strip"><div class="ai-feature-icon">✦</div><div><span class="eyebrow">三叶的 AI 动漫助手</span><h3>把你脑海里的那种感觉，说给我听。</h3><p>“想看一部有夏天、流星和一点点遗憾的故事。”</p></div><RouterLink class="strip-action" to="/ai">开始对话 <span>→</span></RouterLink></section>

    <section class="home-section anime-shelf-section recent-section"><div class="section-heading"><div><span class="eyebrow">刚刚抵达片库</span><h2>最近更新</h2></div><span class="section-hint">按更新时间排序</span></div><template v-if="feed.loading.value"><div class="feed-skeleton"><span></span><span></span><span></span></div></template><template v-else><div v-if="feed.error.value" class="feed-error"><span>首页接口暂不可用，已展示本地演示数据。</span><button type="button" class="text-button" @click="feed.retry()">重试</button></div><div class="anime-shelf-grid"><article v-for="anime in recentAnime" :key="anime.title" class="anime-cover-card" :class="`cover-${anime.tone}`"><RouterLink class="anime-cover-link" :to="`/anime/${anime.slug}`" :aria-label="`查看 ${anime.title} 详情`"><img :src="anime.cover" :alt="`${anime.title} 动漫封面`" loading="lazy" decoding="async" /><span class="cover-shade"></span><span class="cover-episode">{{ anime.episode }}</span><span class="cover-play" aria-hidden="true">查看</span></RouterLink><div class="anime-cover-info"><div><strong>{{ anime.title }}</strong><span>{{ anime.meta }}</span></div><button class="cover-collect" type="button" :aria-label="isCollected(anime.title) ? `取消收藏 ${anime.title}` : `收藏 ${anime.title}`" :aria-pressed="isCollected(anime.title)" @click="toggleCollection(anime.title)">{{ isCollected(anime.title) ? '已收藏' : '收藏' }}</button></div></article></div></template></section>

    <section class="home-section anime-shelf-section popular-section"><div class="section-heading"><div><span class="eyebrow">正在被更多人打开</span><h2>热门动漫</h2></div><span class="section-hint">按本周热度排序</span></div><template v-if="feed.loading.value"><div class="feed-skeleton"><span></span><span></span><span></span></div></template><template v-else><div v-if="feed.error.value" class="feed-error"><span>首页接口暂不可用，已展示本地演示数据。</span><button type="button" class="text-button" @click="feed.retry()">重试</button></div><div class="anime-shelf-grid"><article v-for="anime in popularAnime" :key="anime.title" class="anime-cover-card" :class="`cover-${anime.tone}`"><RouterLink class="anime-cover-link" :to="`/anime/${anime.slug}`" :aria-label="`查看 ${anime.title} 详情`"><img :src="anime.cover" :alt="`${anime.title} 动漫封面`" loading="lazy" decoding="async" /><span class="cover-shade"></span><span class="cover-popular">{{ anime.tag }}</span><span class="cover-play" aria-hidden="true">查看</span></RouterLink><div class="anime-cover-info"><div><strong>{{ anime.title }}</strong><span>{{ anime.meta }}</span></div><button class="cover-collect" type="button" :aria-label="isCollected(anime.title) ? `取消收藏 ${anime.title}` : `收藏 ${anime.title}`" :aria-pressed="isCollected(anime.title)" @click="toggleCollection(anime.title)">{{ isCollected(anime.title) ? '已收藏' : '收藏' }}</button></div></article></div></template></section>

    <section class="home-section schedule-section"><div class="section-heading"><div><span class="eyebrow">本周 · 精选排期</span><h2>黄昏排期</h2></div><div class="schedule-heading-actions"><span class="schedule-date">无职转生 · 21:30</span><RouterLink class="schedule-all-link" to="/schedule">查看一周排期 <span aria-hidden="true">→</span></RouterLink></div></div><div class="schedule-line"><div class="schedule-time"><strong>21:30</strong><span>今晚推荐</span></div><div class="schedule-pin pin-blue"></div><div class="schedule-copy"><strong>无职转生 · 第二季 · 第 01 集</strong><span>新的伙伴与旅程在异世界继续。</span></div><RouterLink class="text-button" to="/anime/136">查看作品 →</RouterLink></div><div class="schedule-line current"><div class="schedule-time"><strong>20:00</strong><span>剧场版</span></div><div class="schedule-pin pin-coral"></div><div class="schedule-copy"><strong>你的名字 · 剧场版</strong><span>在黄昏天空下重新寻找彼此。</span></div><button class="text-button" type="button" :aria-pressed="remindedEpisode" @click="remindedEpisode = !remindedEpisode">{{ remindedEpisode ? '已提醒' : '加入提醒' }} →</button></div></section>
  </div>
</template>
