<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { animeCatalog } from '@/data/animeCatalog'

type HeroSlide = {
  slug: string
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
    slug: 'star-sea-echo',
    eyebrow: '黄昏观测 · 本周焦点',
    status: '今晚 22:00 更新',
    title: '今晚，去听一听',
    emphasis: '城市之外的回声。',
    description: '从一束落在湖面的光开始，找到下一部值得陪伴的作品。动漫发现、角色线索与 AI 对话，都在这片黄昏里展开。',
    primaryLabel: '让 AI 帮我找番',
    primaryPath: '/ai',
    secondaryLabel: '查看一周排期',
    secondaryPath: '/schedule',
    facts: [{ value: '01', label: '本周焦点' }, { value: '9.2', label: '观众评分' }, { value: '22:00', label: '下一集更新' }],
    sceneLabel: '黄昏观测 / 01',
    sceneTitle: '星海回声',
    sceneDescription: '一个关于远方信号的故事',
  },
  {
    slug: 'blue-hour',
    eyebrow: '夜色片单 · 角色线索',
    status: '本周更新 21:30',
    title: '在日落后的七分钟',
    emphasis: '看见城市的另一面。',
    description: '沿着最后一班电车的路线，追踪一段只在蓝色时刻出现的记忆。让 AI 帮你梳理角色关系，也找到适合今晚观看的章节。',
    primaryLabel: '查看作品详情',
    primaryPath: '/anime/blue-hour',
    secondaryLabel: '询问 AI 线索',
    secondaryPath: '/ai',
    facts: [{ value: '11', label: '最新集数' }, { value: '21:30', label: '更新时间' }, { value: '98%', label: '观众推荐' }],
    sceneLabel: '黄昏观测 / 02',
    sceneTitle: '蓝色时刻',
    sceneDescription: '一段只在暮色里出现的记忆',
  },
  {
    slug: 'letters-from-afar',
    eyebrow: '远方来信 · 治愈推荐',
    status: '适合今晚慢慢观看',
    title: '如果一封信穿过山海',
    emphasis: '你会把它寄给谁？',
    description: '一场关于旧车站、夏末和未寄出信件的旅程。打开作品详情，先从不剧透的故事线索开始了解。',
    primaryLabel: '打开远方来信',
    primaryPath: '/anime/letters-from-afar',
    secondaryLabel: '让 AI 推荐相似作品',
    secondaryPath: '/ai',
    facts: [{ value: '98%', label: '本周热度' }, { value: '治愈', label: '观看气质' }, { value: '08', label: '当前集数' }],
    sceneLabel: '黄昏观测 / 03',
    sceneTitle: '远方来信',
    sceneDescription: '一封穿过山海才抵达的回信',
  },
]

const recentAnime = animeCatalog
  .filter((anime) => anime.recentRank)
  .sort((left, right) => (left.recentRank ?? 99) - (right.recentRank ?? 99))

const popularAnime = animeCatalog
  .filter((anime) => anime.popularRank)
  .sort((left, right) => (left.popularRank ?? 99) - (right.popularRank ?? 99))
  .slice(0, 3)
  .map((anime) => ({ ...anime, tag: `本周热度 ${anime.popularity}%` }))

const collectedAnime = ref<string[]>([])
const remindedEpisode = ref(false)
const currentHeroIndex = ref(0)
const heroDragStartX = ref<number | null>(null)
const heroDragOffset = ref(0)
const isHeroDragging = ref(false)
const suppressHeroClick = ref(false)
const currentHero = computed(() => heroSlides[currentHeroIndex.value])
const currentHeroCover = computed(() => animeCatalog.find((anime) => anime.slug === currentHero.value.slug)?.cover ?? '')
const heroTrackStyle = computed(() => ({
  transform: `translate3d(calc(-${currentHeroIndex.value * (100 / heroSlides.length)}% + ${heroDragOffset.value}px), 0, 0)`,
}))
const router = useRouter()
const searchKeyword = ref('')

function submitSearch() {
  const keyword = searchKeyword.value.trim()
  router.push({
    path: '/anime-repository',
    query: keyword ? { keyword } : undefined,
  })
}

function toggleCollection(title: string) {
  collectedAnime.value = collectedAnime.value.includes(title)
    ? collectedAnime.value.filter((item) => item !== title)
    : [...collectedAnime.value, title]
}

function isCollected(title: string) {
  return collectedAnime.value.includes(title)
}

function goToHero(index: number) {
  currentHeroIndex.value = (index + heroSlides.length) % heroSlides.length
}

function showNextHero() {
  goToHero(currentHeroIndex.value + 1)
}

function showPreviousHero() {
  goToHero(currentHeroIndex.value - 1)
}

function handleHeroPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  heroDragStartX.value = event.clientX
  heroDragOffset.value = 0
  isHeroDragging.value = true
}

function handleHeroPointerMove(event: PointerEvent) {
  if (heroDragStartX.value === null) return
  const offset = event.clientX - heroDragStartX.value
  heroDragOffset.value = offset
  if (Math.abs(offset) > 8) event.preventDefault()
}

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
        <img :src="currentHeroCover" :alt="`${currentHero.sceneTitle} 动漫横幅`" />
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

    <section class="home-section anime-shelf-section recent-section"><div class="section-heading"><div><span class="eyebrow">刚刚抵达片库</span><h2>最近更新</h2></div><span class="section-hint">按更新时间排序</span></div><div class="anime-shelf-grid"><article v-for="anime in recentAnime" :key="anime.title" class="anime-cover-card" :class="`cover-${anime.tone}`"><RouterLink class="anime-cover-link" :to="`/anime/${anime.slug}`" :aria-label="`查看 ${anime.title} 详情`"><img :src="anime.cover" :alt="`${anime.title} 动漫封面`" /><span class="cover-shade"></span><span class="cover-episode">{{ anime.episode }}</span><span class="cover-play" aria-hidden="true">查看</span></RouterLink><div class="anime-cover-info"><div><strong>{{ anime.title }}</strong><span>{{ anime.meta }}</span></div><button class="cover-collect" type="button" :aria-label="isCollected(anime.title) ? `取消收藏 ${anime.title}` : `收藏 ${anime.title}`" :aria-pressed="isCollected(anime.title)" @click="toggleCollection(anime.title)">{{ isCollected(anime.title) ? '已收藏' : '收藏' }}</button></div></article></div></section>

    <section class="home-section anime-shelf-section popular-section"><div class="section-heading"><div><span class="eyebrow">正在被更多人打开</span><h2>热门动漫</h2></div><span class="section-hint">按本周热度排序</span></div><div class="anime-shelf-grid"><article v-for="anime in popularAnime" :key="anime.title" class="anime-cover-card" :class="`cover-${anime.tone}`"><RouterLink class="anime-cover-link" :to="`/anime/${anime.slug}`" :aria-label="`查看 ${anime.title} 详情`"><img :src="anime.cover" :alt="`${anime.title} 动漫封面`" /><span class="cover-shade"></span><span class="cover-popular">{{ anime.tag }}</span><span class="cover-play" aria-hidden="true">查看</span></RouterLink><div class="anime-cover-info"><div><strong>{{ anime.title }}</strong><span>{{ anime.meta }}</span></div><button class="cover-collect" type="button" :aria-label="isCollected(anime.title) ? `取消收藏 ${anime.title}` : `收藏 ${anime.title}`" :aria-pressed="isCollected(anime.title)" @click="toggleCollection(anime.title)">{{ isCollected(anime.title) ? '已收藏' : '收藏' }}</button></div></article></div></section>

    <section class="home-section schedule-section"><div class="section-heading"><div><span class="eyebrow">本周 · 星期四</span><h2>黄昏排期</h2></div><div class="schedule-heading-actions"><span class="schedule-date">09 月 18 日 — 20:00</span><RouterLink class="schedule-all-link" to="/schedule">查看一周排期 <span aria-hidden="true">→</span></RouterLink></div></div><div class="schedule-line"><div class="schedule-time"><strong>21:30</strong><span>还有 02:18</span></div><div class="schedule-pin pin-blue"></div><div class="schedule-copy"><strong>蓝色时刻 · 第 11 集</strong><span>只有日落后的七分钟，才能看见城市被遗忘的另一面。</span></div><RouterLink class="text-button" to="/anime/blue-hour">查看作品 →</RouterLink></div><div class="schedule-line current"><div class="schedule-time"><strong>22:00</strong><span>下一场</span></div><div class="schedule-pin pin-coral"></div><div class="schedule-copy"><strong>星海回声 · 第 04 集</strong><span>旧广播塔接收到一段来自失落地表的求救信号。</span></div><button class="text-button" type="button" :aria-pressed="remindedEpisode" @click="remindedEpisode = !remindedEpisode">{{ remindedEpisode ? '已提醒' : '加入提醒' }} →</button></div></section>
  </div>
</template>
