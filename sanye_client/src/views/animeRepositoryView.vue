<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { animeCatalog } from '@/data/animeCatalog'

type YearFilter = '全部年份' | '2026' | '2025' | '2024' | '2023' | '2022及更早'

const route = useRoute()
const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const selectedGenre = ref('全部类型')
const selectedStatus = ref('全部状态')
const selectedYear = ref<YearFilter>('全部年份')
const collectedSlugs = ref<string[]>([])

const genreOptions = ['全部类型', ...new Set(animeCatalog.flatMap((anime) => anime.tags))]
const statusOptions = ['全部状态', '连载中', '已完结']
const yearOptions: YearFilter[] = ['全部年份', '2026', '2025', '2024', '2023', '2022及更早']

watch(() => route.query.keyword, (value) => {
  keyword.value = typeof value === 'string' ? value : ''
})

const filteredAnime = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  const result = animeCatalog.filter((anime) => {
    const matchesKeyword = !normalizedKeyword || [anime.title, anime.subtitle, anime.description, ...anime.tags].join(' ').toLowerCase().includes(normalizedKeyword)
    const matchesGenre = selectedGenre.value === '全部类型' || anime.tags.includes(selectedGenre.value)
    const matchesStatus = selectedStatus.value === '全部状态' || anime.status === selectedStatus.value
    const matchesYear = selectedYear.value === '全部年份'
      || (selectedYear.value === '2022及更早' ? anime.releaseYear <= 2022 : anime.releaseYear === Number(selectedYear.value))
    return matchesKeyword && matchesGenre && matchesStatus && matchesYear
  })

  return result
})

function toggleCollection(slug: string) {
  collectedSlugs.value = collectedSlugs.value.includes(slug)
    ? collectedSlugs.value.filter((item) => item !== slug)
    : [...collectedSlugs.value, slug]
}

function isCollected(slug: string) {
  return collectedSlugs.value.includes(slug)
}
</script>

<template>
  <div class="page-stack anime-repository-page">
    <section class="section-heading repository-heading">
      <div>
        <span class="eyebrow">作品内容库 · 全部收录</span>
        <h2>番剧仓库</h2>
        <p>集中浏览全部番剧，按关键词、类型、状态和年份找到下一部作品。</p>
      </div>
      <div class="repository-summary"><strong>{{ filteredAnime.length }}</strong><span>部作品</span></div>
    </section>

    <section class="repository-toolbar" aria-label="番剧筛选工具">
      <label class="repository-select"><span>类型</span><select v-model="selectedGenre" aria-label="按类型筛选"><option v-for="genre in genreOptions" :key="genre" :value="genre">{{ genre }}</option></select></label>
      <label class="repository-select"><span>状态</span><select v-model="selectedStatus" aria-label="按状态筛选"><option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option></select></label>
      <label class="repository-select repository-year"><span>年份</span><select v-model="selectedYear" aria-label="按年份筛选"><option v-for="year in yearOptions" :key="year" :value="year">{{ year }}</option></select></label>
    </section>

    <div class="repository-result-line"><span>当前显示 {{ filteredAnime.length }} 部作品</span><span v-if="keyword || selectedGenre !== '全部类型' || selectedStatus !== '全部状态' || selectedYear !== '全部年份'">筛选条件已生效</span><span v-else>完整片库</span></div>

    <section v-if="filteredAnime.length" class="repository-grid" aria-label="番剧列表">
      <article v-for="anime in filteredAnime" :key="anime.slug" class="repository-card">
        <RouterLink class="repository-cover-link" :to="`/anime/${anime.slug}`" :aria-label="`查看 ${anime.title} 详情`">
          <img :src="anime.cover" :alt="`${anime.title} 动漫封面`" />
          <span class="cover-shade"></span>
          <span class="repository-status" :class="{ finished: anime.status === '已完结' }">{{ anime.status }}</span>
          <span class="repository-popularity">热度 {{ anime.popularity }}%</span>
          <span class="cover-play" aria-hidden="true">查看</span>
        </RouterLink>
        <div class="repository-card-body">
          <div class="repository-card-title"><div><strong>{{ anime.title }}</strong><span>{{ anime.releaseYear }} · {{ anime.episode }} · {{ anime.meta }}</span></div><button class="repository-collect" type="button" :aria-label="isCollected(anime.slug) ? `取消收藏 ${anime.title}` : `收藏 ${anime.title}`" :aria-pressed="isCollected(anime.slug)" @click="toggleCollection(anime.slug)">{{ isCollected(anime.slug) ? '已收藏' : '收藏' }}</button></div>
          <p>{{ anime.subtitle }}</p>
          <div class="repository-tags"><span v-for="tag in anime.tags" :key="tag">{{ tag }}</span></div>
        </div>
      </article>
    </section>

    <section v-else class="repository-empty" aria-live="polite"><span class="mine-library-icon" aria-hidden="true">⌁</span><h3>没有找到匹配作品</h3><p>试试更换关键词、类型、状态或年份。</p></section>
  </div>
</template>
