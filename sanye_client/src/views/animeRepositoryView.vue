<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { animeApi } from '@/api/anime'
import { favoriteApi } from '@/api/favorite'
import { isAbortError, resolveAssetUrl } from '@/api/http'
import type { AnimeCard } from '@/api/types'
import { animeCatalog, animeCatalogMap, compareAnimeCatalogOrder } from '@/data/animeCatalog'

type YearFilter = '全部年份' | '2026' | '2025' | '2024' | '2023' | '2022及更早'

interface RepoCard {
  id: string
  title: string
  meta: string
  tags: string[]
  score?: number
  cover: string
  finished: boolean
}

const route = useRoute()
const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const selectedType = ref('全部类型')
const selectedStatus = ref('全部状态')
const selectedYear = ref<YearFilter>('全部年份')
const page = ref(1)
// 当前正式片库规模小于接口上限，一次读取完整筛选结果并逐季展示。
const size = 50
const items = ref<RepoCard[]>([])
const total = ref(0)
const totalPages = ref(0)
const loading = ref(false)
const error = ref(false)
const fallback = ref(false)
const collectedIds = ref<string[]>([])
let requestController: AbortController | null = null

const typeOptions = ['全部类型', '原创动画', '电视动画', '剧场版', '网络动画']
const statusOptions = ['全部状态', '连载中', '已完结']
const yearOptions: YearFilter[] = ['全部年份', '2026', '2025', '2024', '2023', '2022及更早']

watch(
  () => route.query.keyword,
  (value) => {
    keyword.value = typeof value === 'string' ? value : ''
    page.value = 1
    void load()
  },
)

watch([selectedType, selectedStatus, selectedYear], () => {
  page.value = 1
  void load()
})

/** 将 API 作品卡片转换为仓库卡片展示模型。 */
function toRepoCard(card: AnimeCard): RepoCard {
  const local = animeCatalogMap[String(card.id)]
  return {
    id: String(card.id),
    title: local?.title ?? card.title,
    meta: `${card.year ?? ''} · ${card.type} · ${card.updateText ?? ''}`,
    tags: card.tags ?? [],
    score: card.score,
    cover: resolveAssetUrl(local?.cover) ?? resolveAssetUrl(card.coverUrl && !card.coverUrl.includes('anime-placeholder') ? card.coverUrl : undefined) ?? '/covers/mushoku-oad.svg',
    finished: card.updateText === '已完结',
  }
}

/** 按当前筛选条件加载仓库列表，失败时切换本地数据筛选。 */
async function load(): Promise<void> {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  loading.value = true
  error.value = false
  const yearValue = Number(selectedYear.value)
  try {
    const result = await animeApi.list({
      keyword: keyword.value.trim() || undefined,
      type: selectedType.value === '全部类型' ? undefined : selectedType.value,
      status: selectedStatus.value === '全部状态' ? undefined : selectedStatus.value,
      year: Number.isFinite(yearValue) ? yearValue : undefined,
      yearBefore: selectedYear.value === '2022及更早' ? 2022 : undefined,
      page: page.value,
      size,
    }, { signal: controller.signal })
    items.value = result.items.map(toRepoCard)
    total.value = items.value.length
    totalPages.value = 1
    fallback.value = false
  } catch (cause) {
    if (isAbortError(cause)) return
    fallback.value = true
    error.value = true
    items.value = filteredLocal.value.map((anime) => ({
      id: anime.slug,
      title: anime.title,
      meta: `${anime.releaseYear} · ${anime.meta}`,
      tags: anime.tags.slice(0, 3),
      score: anime.popularity,
      cover: anime.cover,
      finished: anime.status === '已完结',
    }))
    total.value = items.value.length
    totalPages.value = 1
  } finally {
    if (requestController === controller) {
      requestController = null
      loading.value = false
    }
  }
}

/** 每个季度直接作为独立卡片，并按目录统一定义的系列、正篇、Part 和特别篇顺序展示。 */
const repositoryCards = computed(() => {
  return [...items.value].sort((left, right) => compareAnimeCatalogOrder(left.id, right.id))
})

const filteredLocal = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  return animeCatalog.filter((anime) => {
    const matchesKeyword =
      !normalizedKeyword ||
      [anime.title, anime.subtitle, anime.description, ...anime.tags].join(' ').toLowerCase().includes(normalizedKeyword)
    const matchesType = selectedType.value === '全部类型' || anime.tags.includes(selectedType.value)
    const matchesStatus = selectedStatus.value === '全部状态' || anime.status === selectedStatus.value
    const matchesYear =
      selectedYear.value === '全部年份' ||
      (selectedYear.value === '2022及更早' ? anime.releaseYear <= 2022 : anime.releaseYear === Number(selectedYear.value))
    return matchesKeyword && matchesType && matchesStatus && matchesYear
  })
})

/** 登录用户调用收藏接口，匿名用户仅切换本地展示标记。 */
async function toggleCollection(id: string) {
  if (fallback.value) {
    collectedIds.value = collectedIds.value.includes(id)
      ? collectedIds.value.filter((item) => item !== id)
      : [...collectedIds.value, id]
    return
  }
  const target = !collectedIds.value.includes(id)
  collectedIds.value = target
    ? [...collectedIds.value, id]
    : collectedIds.value.filter((item) => item !== id)
  try {
    if (target) {
      await favoriteApi.add(id)
    } else {
      await favoriteApi.remove(id)
    }
  } catch {
    collectedIds.value = collectedIds.value.filter((item) => item !== id)
  }
}

/** 判断作品是否已经在当前页面标记收藏。 */
function isCollected(id: string) {
  return collectedIds.value.includes(id)
}

/** 在仓库分页范围内向前翻页。 */
function prevPage() {
  if (page.value > 1) {
    page.value -= 1
    void load()
  }
}

/** 在仓库分页范围内向后翻页。 */
function nextPage() {
  if (page.value < totalPages.value) {
    page.value += 1
    void load()
  }
}

onBeforeUnmount(() => requestController?.abort())

void load()
</script>

<template>
  <div class="page-stack anime-repository-page">
    <section class="section-heading repository-heading">
      <div>
        <span class="eyebrow">作品内容库 · 全部收录</span>
        <h2>番剧仓库</h2>
        <p>集中浏览全部番剧，按关键词、类型、状态和年份找到下一部作品。</p>
      </div>
      <div class="repository-summary"><strong>{{ total }}</strong><span>部作品</span></div>
    </section>

    <section class="repository-toolbar" aria-label="番剧筛选工具">
      <label class="repository-select"><span>类型</span><select v-model="selectedType" aria-label="按类型筛选"><option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option></select></label>
      <label class="repository-select"><span>状态</span><select v-model="selectedStatus" aria-label="按状态筛选"><option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option></select></label>
      <label class="repository-select repository-year"><span>年份</span><select v-model="selectedYear" aria-label="按年份筛选"><option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option></select></label>
    </section>

    <div class="repository-result-line">
      <span>当前显示 {{ total }} 部作品</span>
      <span v-if="keyword || selectedType !== '全部类型' || selectedStatus !== '全部状态' || selectedYear !== '全部年份'">筛选条件已生效</span>
      <span v-else>完整片库</span>
    </div>

    <div v-if="error && fallback" class="feed-error"><span>接口暂不可用，已展示本地演示数据。</span><button type="button" class="text-button" @click="void load()">重试</button></div>

    <section v-if="loading" class="feed-skeleton" aria-label="正在加载番剧列表"><span></span><span></span><span></span><span></span></section>

    <section v-else-if="items.length" class="repository-grid" aria-label="番剧列表">
      <article v-for="anime in repositoryCards" :key="anime.id" class="repository-card">
        <RouterLink class="repository-cover-link" :to="`/anime/${anime.id}`" :aria-label="`查看 ${anime.title} 详情`">
          <img :src="anime.cover" :alt="`${anime.title} 动漫封面`" loading="lazy" decoding="async" />
          <span class="cover-shade"></span>
          <span class="repository-status" :class="{ finished: anime.finished }">{{ anime.finished ? '已完结' : '连载中' }}</span>
          <span class="repository-popularity">{{ anime.score !== undefined ? `★ ${anime.score}` : '新作' }}</span>
          <span class="cover-play" aria-hidden="true">查看</span>
        </RouterLink>
        <div class="repository-card-body">
          <div class="repository-card-title">
            <div><strong>{{ anime.title }}</strong><span>{{ anime.meta }}</span></div>
            <button class="repository-collect" type="button" :aria-label="isCollected(anime.id) ? `取消收藏 ${anime.title}` : `收藏 ${anime.title}`" :aria-pressed="isCollected(anime.id)" @click="toggleCollection(anime.id)">{{ isCollected(anime.id) ? '已收藏' : '收藏' }}</button>
          </div>
          <div class="repository-tags"><span v-for="tag in anime.tags" :key="tag">{{ tag }}</span></div>
        </div>
      </article>
    </section>

    <section v-else class="repository-empty" aria-live="polite"><span class="mine-library-icon" aria-hidden="true">⌁</span><h3>没有找到匹配作品</h3><p>试试更换关键词、类型、状态或年份。</p></section>

    <nav v-if="totalPages > 1 && !fallback" class="repository-pagination" aria-label="分页">
      <button type="button" class="secondary-button" :disabled="page <= 1" @click="prevPage">← 上一页</button>
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <button type="button" class="secondary-button" :disabled="page >= totalPages" @click="nextPage">下一页 →</button>
    </nav>
  </div>
</template>
