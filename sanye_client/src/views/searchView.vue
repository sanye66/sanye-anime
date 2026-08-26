<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { searchApi, type ExternalSearchHit, type SearchHit } from '@/api/search'
import { animeApi } from '@/api/anime'
import { isAbortError, resolveAssetUrl } from '@/api/http'
import { animeCatalog, animeCatalogMap, compareAnimeCatalogOrder } from '@/data/animeCatalog'

interface ResultEntry {
  id: string
  title: string
  meta: string
  tags: string[]
  score?: number
  summary: string
  cover: string
}

const route = useRoute()
const router = useRouter()
const keyword = ref(String(route.query.keyword ?? ''))
const chip = ref('全部')
const chips = ['全部', '原创动画', '电视动画', '剧场版', '网络动画'] as const
const page = ref(1)
// 首屏只取必要结果，减少 ES 高亮、响应体和图片布局成本。
const size = 20
const results = ref<ResultEntry[]>([])
const externalResults = ref<ExternalSearchHit[]>([])
const total = ref(0)
const totalPages = ref(0)
const loading = ref(false)
const externalLoading = ref(false)
const importingUrl = ref('')
const importError = ref('')
const fallback = ref(false)
let requestController: AbortController | null = null
let externalController: AbortController | null = null
let currentQuery = ''
let externalLoadedQuery = ''

const query = computed(() => keyword.value.trim().toLowerCase())
const resultCount = computed(() => results.value.length + externalResults.value.length)

watch(
  () => route.query.keyword,
  (value) => {
    keyword.value = String(value ?? '')
    page.value = 1
    void load()
  },
)

watch(chip, () => {
  page.value = 1
  void load()
})

/** 将高亮 HTML 转成纯文本，避免兜底展示时把标记当作内容。 */
function plainText(highlight?: string): string {
  return (highlight ?? '').replace(/<[^>]+>/g, '')
}

/** 将搜索命中模型转换为结果列表展示模型。 */
function toEntry(hit: SearchHit): ResultEntry {
  const local = animeCatalogMap[String(hit.id)]
  return {
    id: String(hit.id),
    title: local?.title ?? (plainText(hit.titleHighlight) || hit.title),
    meta: `${hit.year ?? ''} · ${hit.type} · ${hit.updateText ?? ''}`,
    tags: hit.tags ?? [],
    score: hit.score,
    summary: plainText(hit.summaryHighlight),
    cover: resolveAssetUrl(local?.cover) ?? resolveAssetUrl(hit.coverUrl && !hit.coverUrl.includes('anime-placeholder') ? hit.coverUrl : undefined) ?? '/covers/mushoku-oad.svg',
  }
}

/** 将同一季度的重复来源映射到有剧集的正式作品，保留每个季度的独立入口。 */
function mushokuSeason(title: string): { label: string; preferredId: string } | null {
  if (!title.includes('无职转生')) return null
  if (/OAD/i.test(title)) return { label: 'OAD 特别篇', preferredId: '137' }
  if (/Ⅲ|第三季|第3季/.test(title)) return { label: '第三季', preferredId: '128' }
  if (/下部|Part\.?\s*2|第2部分/.test(title)) return { label: '第二季 Part.2', preferredId: '135' }
  if (/Ⅱ|第二季|第2季/.test(title)) return { label: '第二季', preferredId: '136' }
  return { label: '第一季', preferredId: '133' }
}

/** 在搜索结果页内去除同一季度的重复来源，但不合并不同季度。 */
function mergeMushokuResults(entries: ResultEntry[]): ResultEntry[] {
  const result: ResultEntry[] = []
  const grouped = new Map<string, ResultEntry>()
  for (const entry of entries) {
    const season = mushokuSeason(entry.title)
    if (!season) {
      result.push(entry)
      continue
    }
    const key = season.label
    const existing = grouped.get(key)
    const canonicalAnime = animeCatalogMap[season.preferredId]
    const canonical = {
      ...entry,
      id: season.preferredId,
      title: canonicalAnime?.title ?? `无职转生 · ${season.label}`,
      cover: canonicalAnime?.cover ?? entry.cover,
    }
    if (!existing || entry.id === season.preferredId) {
      grouped.set(key, canonical)
    }
  }
  result.push(...grouped.values())
  // 搜索接口可能按相关度返回季度，统一按正式目录恢复观看顺序。
  return result.sort((left, right) => compareAnimeCatalogOrder(left.id, right.id))
}

/** 优先调用全文搜索，ES 不可用时按本地目录执行相同筛选。 */
async function load(): Promise<void> {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  loading.value = true
  fallback.value = false
  const nextExternalQuery = keyword.value.trim()
  if (nextExternalQuery !== currentQuery) {
    externalController?.abort()
    externalController = null
    externalLoading.value = false
    currentQuery = nextExternalQuery
    externalLoadedQuery = ''
    externalResults.value = []
  }
  try {
    const result = await searchApi.search({
      keyword: keyword.value.trim() || undefined,
      type: chip.value === '全部' ? undefined : chip.value,
      page: page.value,
      size,
    }, { signal: controller.signal, timeout: 3_000, retries: 0 })
    results.value = mergeMushokuResults(result.items.map(toEntry))
    total.value = result.total + externalResults.value.length
    totalPages.value = result.totalPages
    if (!results.value.length && nextExternalQuery && externalLoadedQuery !== nextExternalQuery && !externalLoading.value) {
      void loadExternal(nextExternalQuery)
    } else if (results.value.length) {
      externalController?.abort()
      externalController = null
      externalLoading.value = false
      externalLoadedQuery = ''
      externalResults.value = []
    }
  } catch (cause) {
    if (isAbortError(cause)) return
    fallback.value = true
    const local = animeCatalog.filter((anime) => {
      const matchesQuery =
        !query.value ||
        `${anime.title}${anime.subtitle}${anime.tags.join('')}`.toLowerCase().includes(query.value)
      const matchesChip = chip.value === '全部' || anime.tags.includes(chip.value)
      return matchesQuery && matchesChip
    })
    results.value = local
      .map((anime) => ({
        id: anime.slug,
        title: anime.title,
        meta: `${anime.releaseYear} · ${anime.meta}`,
        tags: anime.tags.slice(0, 3),
        score: anime.popularity,
        summary: anime.description,
        cover: anime.cover,
      }))
      .sort((left, right) => compareAnimeCatalogOrder(left.id, right.id))
    total.value = resultCount.value
    totalPages.value = 1
    if (!results.value.length && nextExternalQuery && externalLoadedQuery !== nextExternalQuery && !externalLoading.value) {
      void loadExternal(nextExternalQuery)
    }
  } finally {
    if (requestController === controller) {
      requestController = null
      loading.value = false
    }
  }
}

async function loadExternal(queryText: string): Promise<void> {
  externalController?.abort()
  const controller = new AbortController()
  externalController = controller
  externalLoading.value = true
  try {
    externalResults.value = await searchApi.external(queryText, 20, { signal: controller.signal, timeout: 5_000, retries: 0 })
    total.value = resultCount.value
  } catch (cause) {
    if (!isAbortError(cause)) externalResults.value = []
  } finally {
    if (externalController === controller) {
      externalController = null
      externalLoading.value = false
      externalLoadedQuery = queryText
    }
  }
}

/** 将外部候选导入系统后跳转到作品详情页播放。 */
async function importAndOpen(hit: ExternalSearchHit): Promise<void> {
  if (importingUrl.value) return
  importingUrl.value = hit.sourceUrl
  importError.value = ''
  try {
    const result = await animeApi.importUrlFallback(hit.sourceUrl)
    await router.push(`/anime/${result.anime.id}`)
  } catch {
    importError.value = `《${hit.title}》导入失败，请稍后重试。`
  } finally {
    importingUrl.value = ''
  }
}

/** 在搜索结果页码大于一时向前翻页。 */
function prevPage() {
  if (page.value > 1) {
    page.value -= 1
    void load()
  }
}

/** 在未到最后一页时向后翻页。 */
function nextPage() {
  if (page.value < totalPages.value) {
    page.value += 1
    void load()
  }
}

onBeforeUnmount(() => {
  requestController?.abort()
  externalController?.abort()
})

void load()
</script>

<template>
  <div class="page-stack search-page">
    <section class="search-panel">
      <div class="large-search">
        <span aria-hidden="true">⌕</span>
        <input v-model="keyword" aria-label="搜索作品" placeholder="搜索作品、角色、类型或关键词" autofocus @keyup.enter="void load()" />
        <kbd>⌘ K</kbd>
      </div>
      <div class="filter-row">
        <button
          v-for="item in chips"
          :key="item"
          type="button"
          class="filter-chip"
          :class="{ 'is-active': chip === item }"
          @click="chip = item"
        >
          {{ item }}
        </button>
        <span class="result-count">{{ resultCount }} 部作品</span>
      </div>
    </section>

    <section class="search-results">
      <div class="section-heading">
        <div>
          <span class="eyebrow">搜索结果</span>
          <h2>{{ query ? `关于“${keyword}”` : '推荐作品' }}</h2>
        </div>
        <span v-if="externalResults.length" class="sort-label">外部候选支持直接观看或导入后观看</span>
        <span v-else-if="fallback" class="sort-label">搜索服务暂不可用，已展示本地演示数据</span>
        <span v-else class="sort-label">按相关度排序 ⌄</span>
      </div>

      <div v-if="loading" class="feed-skeleton" aria-label="正在搜索"><span></span><span></span><span></span></div>

      <div v-else-if="results.length" class="result-list">
        <RouterLink
          v-for="(anime, index) in results"
          :key="anime.id"
          :to="`/anime/${anime.id}`"
          class="result-row"
        >
          <span class="result-rank">{{ String(index + 1).padStart(2, '0') }}</span>
          <img class="search-cover" :src="anime.cover" :alt="`${anime.title} 封面`" loading="lazy" decoding="async" />
          <span class="result-copy">
            <strong>{{ anime.title }}</strong>
            <small>{{ anime.meta }}</small>
            <p>{{ anime.summary }}</p>
            <span class="tag-list"><em v-for="tag in anime.tags" :key="tag">{{ tag }}</em></span>
          </span>
          <span class="result-score">
            <strong>{{ anime.score !== undefined ? `★ ${anime.score}` : '' }}</strong>
            <small>{{ anime.meta }}</small>
          </span>
          <span class="result-arrow" aria-hidden="true">→</span>
        </RouterLink>
      </div>

      <div v-if="!loading && externalLoading" class="feed-skeleton" aria-label="正在查询外部候选"><span></span><span></span><span></span></div>

      <div v-if="!loading && externalResults.length" class="result-list">
        <article
          v-for="(anime, index) in externalResults"
          :key="anime.sourceUrl"
          class="result-row external-result-row"
        >
          <span class="result-rank">{{ String(index + 1).padStart(2, '0') }}</span>
          <img class="search-cover" :src="resolveAssetUrl(anime.coverUrl) ?? '/covers/mushoku-oad.svg'" :alt="`${anime.title} 封面`" loading="lazy" decoding="async" />
          <span class="result-copy">
            <strong>{{ anime.title }}</strong>
            <small :title="anime.sourceUrl">{{ anime.sourceUrl }}</small>
            <p>{{ anime.summary || '可直接打开来源播放，也可以导入简介、封面和视频资源后在站内观看。' }}</p>
            <span class="tag-list"><em>外部候选</em><em>直接观看</em><em>导入观看</em></span>
          </span>
          <span class="external-result-actions">
            <RouterLink
              class="secondary-button"
              :to="{ name: 'externalWatch', query: { sourceUrl: anime.sourceUrl } }"
            >直接观看</RouterLink>
            <button
              class="primary-button"
              type="button"
              :disabled="Boolean(importingUrl)"
              @click="void importAndOpen(anime)"
            >{{ importingUrl === anime.sourceUrl ? '导入中…' : '导入观看' }}</button>
          </span>
        </article>
      </div>

      <p v-if="importError" class="search-import-error" role="alert">{{ importError }}</p>

      <div v-else-if="!loading && !externalLoading && !results.length && !externalResults.length" class="empty-state">
        <span class="empty-mark" aria-hidden="true">⌕</span>
        <h3>还没有找到匹配作品</h3>
        <p>换一个关键词，或者让 AI 帮你找到更合适的作品。</p>
        <RouterLink class="primary-button" to="/ai">让 AI 帮我找番 →</RouterLink>
      </div>

      <nav v-if="totalPages > 1 && !fallback" class="repository-pagination" aria-label="分页">
        <button type="button" class="secondary-button" :disabled="page <= 1" @click="prevPage">← 上一页</button>
        <span>第 {{ page }} / {{ totalPages }} 页</span>
        <button type="button" class="secondary-button" :disabled="page >= totalPages" @click="nextPage">下一页 →</button>
      </nav>
    </section>
  </div>
</template>
