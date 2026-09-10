<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { searchApi, type ExternalSearchHit, type SearchHit } from '@/api/search'
import { animeApi } from '@/api/anime'
import { isAbortError, resolveAssetUrl } from '@/api/http'
import { animeCatalog, animeCatalogMap, compareAnimeCatalogOrder } from '@/data/animeCatalog'
import { desktopMode } from '@/desktop'

interface ResultEntry {
  id: string
  title: string
  type: string
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
const totalPages = ref(0)
const loading = ref(false)
const externalLoading = ref(false)
const externalSupplementLoading = ref(false)
const externalError = ref(false)
const importingUrl = ref('')
const importError = ref('')
const fallback = ref(false)
let requestController: AbortController | null = null
let externalController: AbortController | null = null
const coverFallbackTimers = new Map<HTMLImageElement, number>()

const fallbackCover = resolveAssetUrl('/covers/anime-placeholder.svg') ?? '/covers/mushoku-oad.svg'

/** 搜索框也接受樱花动漫搜索页 URL，并直接提取其中的 keyword。 */
function normalizeSearchInput(value: string): string {
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    if (/^(www\.)?yhdmtv\.cc$/i.test(url.hostname) && url.pathname === '/search/index.html') {
      return url.searchParams.get('keyword')?.trim() ?? ''
    }
  } catch {
    return trimmed
  }
  return trimmed
}

/** 用于严格标题匹配，忽略空白和标点但不匹配摘要或标签。 */
function comparable(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

function isPlaceholderCover(value?: string): boolean {
  return !value
    || value.includes('anime-placeholder')
    || /\/covers\/anime-\d+\.svg(?:$|\?)/.test(value)
}

const query = computed(() => normalizeSearchInput(keyword.value))
const filteredExternalResults = computed(() => chip.value === '全部'
  ? externalResults.value
  : externalResults.value.filter((anime) => anime.type === chip.value))
/** 外部来源有同标题确定信息时，校正片库的历史错误类型和占位封面。 */
const classifiedInternalResults = computed(() => {
  const externalByTitle = new Map(externalResults.value
    .map((anime) => [comparable(anime.title), anime]))
  return results.value.map((anime) => {
    const external = externalByTitle.get(comparable(anime.title))
    if (!external) return anime
    const resolvedType = external.type || anime.type
    const usesPlaceholder = isPlaceholderCover(anime.cover)
    const resolvedCover = usesPlaceholder && external.coverUrl
      ? (resolveAssetUrl(external.coverUrl) ?? anime.cover)
      : anime.cover
    if (resolvedType === anime.type && resolvedCover === anime.cover) return anime
    return {
      ...anime,
      type: resolvedType,
      cover: resolvedCover,
      meta: anime.meta.replace(` · ${anime.type} · `, ` · ${resolvedType} · `),
    }
  })
})
const filteredInternalResults = computed(() => chip.value === '全部'
  ? classifiedInternalResults.value
  : classifiedInternalResults.value.filter((anime) => anime.type === chip.value))
const resultCount = computed(() => filteredInternalResults.value.length + filteredExternalResults.value.length)

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
})

/** 将高亮 HTML 转成纯文本，避免兜底展示时把标记当作内容。 */
function plainText(highlight?: string): string {
  return (highlight ?? '').replace(/<[^>]+>/g, '')
}

/** 将搜索命中模型转换为结果列表展示模型。 */
function toEntry(hit: SearchHit): ResultEntry {
  const local = animeCatalogMap[String(hit.id)]
  const serviceCover = isPlaceholderCover(hit.coverUrl) ? undefined : hit.coverUrl
  return {
    id: String(hit.id),
    title: plainText(hit.titleHighlight) || hit.title,
    type: hit.type,
    meta: `${hit.year ?? ''} · ${hit.type} · ${hit.updateText ?? ''}`,
    tags: hit.tags ?? [],
    score: hit.score,
    summary: plainText(hit.summaryHighlight),
    cover: resolveAssetUrl(serviceCover)
      ?? resolveAssetUrl(local?.cover)
      ?? fallbackCover,
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
      cover: resolveAssetUrl(canonicalAnime?.cover) ?? entry.cover,
    }
    if (!existing || entry.id === season.preferredId) {
      grouped.set(key, canonical)
    }
  }
  result.push(...grouped.values())
  // 搜索接口可能按相关度返回季度，统一按正式目录恢复观看顺序。
  return result.sort((left, right) => compareAnimeCatalogOrder(left.id, right.id))
}

/** 同时发起站内和樱花源搜索，分类切换直接复用已返回的外部候选。 */
async function load(): Promise<void> {
  page.value = 1
  const queryText = query.value
  externalController?.abort()
  externalResults.value = []
  externalError.value = false
  externalLoading.value = false
  externalSupplementLoading.value = false
  if (queryText) void loadExternal(queryText)
  await loadInternal(queryText)
}

/** 查询站内片库；失败时执行相同的标题和分类精确筛选。 */
async function loadInternal(queryText: string): Promise<void> {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  loading.value = true
  fallback.value = false
  try {
    if (!queryText) {
      if (desktopMode) {
        results.value = []
        totalPages.value = 0
        return
      }
      const local = animeCatalog.filter((anime) => chip.value === '全部' || anime.type === chip.value)
      results.value = local.map(toLocalEntry)
      totalPages.value = 1
      return
    }
    const result = await searchApi.search({
      keyword: queryText,
      page: page.value,
      size,
    }, { signal: controller.signal, timeout: 3_000, retries: 0 })
    results.value = mergeMushokuResults(result.items.map(toEntry))
    totalPages.value = result.totalPages
  } catch (cause) {
    if (isAbortError(cause)) return
    fallback.value = true
    if (desktopMode) { results.value = []; totalPages.value = 0; return }
    const local = animeCatalog.filter((anime) => {
      const matchesQuery = !queryText || comparable(anime.title).includes(comparable(queryText))
      const matchesChip = chip.value === '全部' || anime.type === chip.value
      return matchesQuery && matchesChip
    })
    results.value = local.map(toLocalEntry)
      .sort((left, right) => compareAnimeCatalogOrder(left.id, right.id))
    totalPages.value = 1
  } finally {
    if (requestController === controller) {
      requestController = null
      loading.value = false
    }
  }
}

function toLocalEntry(anime: (typeof animeCatalog)[number]): ResultEntry {
  return {
    id: anime.slug,
    title: anime.title,
    type: anime.type,
    meta: `${anime.releaseYear} · ${anime.meta}`,
    tags: anime.tags.slice(0, 3),
    score: anime.popularity,
    summary: anime.description,
    cover: resolveAssetUrl(anime.cover) ?? fallbackCover,
  }
}

async function loadExternal(queryText: string): Promise<void> {
  externalController?.abort()
  const controller = new AbortController()
  externalController = controller
  externalLoading.value = true
  externalSupplementLoading.value = true
  externalError.value = false
  const options = { signal: controller.signal, timeout: 18_000, retries: 0 }
  const completeRequest = searchApi.external(queryText, 20, undefined, options)
    .then((value) => ({ value, error: null as unknown }))
    .catch((error: unknown) => ({ value: null, error }))
  const preferredRequest = searchApi.externalPreferred(queryText, 20, undefined, options)
    .then((value) => ({ value, error: null as unknown }))
    .catch((error: unknown) => ({ value: null, error }))
  const preferred = await preferredRequest
  if (externalController !== controller) return
  if (preferred.value) {
    externalResults.value = preferred.value
  } else if (isAbortError(preferred.error)) {
    return
  }
  externalLoading.value = false
  const complete = await completeRequest
  if (externalController !== controller) return
  if (complete.value) {
    externalResults.value = complete.value
  } else if (!preferred.value && !isAbortError(complete.error)) {
    externalResults.value = []
    externalError.value = true
  }
  if (externalController === controller) {
    externalSupplementLoading.value = false
    externalController = null
    if (!preferred.value && !complete.value) {
      externalLoading.value = false
    }
  }
}

/** 重新搜索时同步 URL，便于返回和刷新后保持同一关键词。 */
function submitSearch(): void {
  const routeKeyword = String(route.query.keyword ?? '')
  if (keyword.value.trim() !== routeKeyword) {
    void router.push({ path: '/search', query: { keyword: keyword.value.trim() } })
    return
  }
  void load()
}

function clearCoverFallbackTimer(image: HTMLImageElement): void {
  const timer = coverFallbackTimers.get(image)
  if (timer !== undefined) window.clearTimeout(timer)
  coverFallbackTimers.delete(image)
}

function applyCoverFallback(image: HTMLImageElement): void {
  if (image.dataset.fallbackApplied) return
  image.dataset.fallbackApplied = 'true'
  image.src = fallbackCover
}

/** 图片 CDN 持续挂起时主动回退，不能只依赖不会触发的 error 事件。 */
function watchCover(element: unknown): void {
  if (!(element instanceof HTMLImageElement)) return
  clearCoverFallbackTimer(element)
  if (element.src !== fallbackCover) delete element.dataset.fallbackApplied
  if (element.complete) {
    if (!element.naturalWidth) applyCoverFallback(element)
    return
  }
  const requestedSrc = element.src
  const timer = window.setTimeout(() => {
    coverFallbackTimers.delete(element)
    if (element.isConnected && element.src === requestedSrc
      && (!element.complete || !element.naturalWidth)) {
      applyCoverFallback(element)
    }
  }, 5_000)
  coverFallbackTimers.set(element, timer)
}

function handleCoverLoad(event: Event): void {
  clearCoverFallbackTimer(event.currentTarget as HTMLImageElement)
}

/** 外部封面明确加载失败时使用稳定占位图，避免留下破损图片。 */
function handleCoverError(event: Event): void {
  const image = event.currentTarget as HTMLImageElement
  clearCoverFallbackTimer(image)
  applyCoverFallback(image)
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
    void loadInternal(query.value)
  }
}

/** 在未到最后一页时向后翻页。 */
function nextPage() {
  if (page.value < totalPages.value) {
    page.value += 1
    void loadInternal(query.value)
  }
}

onBeforeUnmount(() => {
  requestController?.abort()
  externalController?.abort()
  for (const timer of coverFallbackTimers.values()) window.clearTimeout(timer)
  coverFallbackTimers.clear()
})

void load()
</script>

<template>
  <div class="page-stack search-page">
    <section class="search-panel">
      <div class="large-search">
        <span aria-hidden="true">⌕</span>
        <input v-model="keyword" aria-label="搜索作品" placeholder="搜索作品名称或粘贴樱花动漫搜索 URL" autofocus @keyup.enter="submitSearch" />
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
          <h2>{{ query ? `关于“${query}”` : '推荐作品' }}</h2>
        </div>
        <span v-if="externalLoading" class="sort-label">正在查询樱花动漫</span>
        <span v-else-if="externalSupplementLoading" class="sort-label">高相关结果已显示，正在补充原词结果</span>
        <span v-else-if="externalError" class="sort-label">樱花源响应超时，站内结果仍可使用</span>
        <span v-else-if="externalResults.length" class="sort-label">樱花候选与片库结果已分开显示</span>
        <span v-else-if="fallback" class="sort-label">{{ desktopMode ? '搜索服务暂不可用，请重试' : '搜索服务暂不可用，已展示本地演示数据' }}</span>
        <span v-else class="sort-label">按相关度排序 ⌄</span>
      </div>

      <div v-if="externalLoading" class="search-source-block">
        <div class="search-source-heading"><h3>樱花动漫候选</h3><span>来源搜索中</span></div>
        <div class="feed-skeleton" aria-label="正在查询樱花动漫"><span></span><span></span><span></span></div>
      </div>

      <div v-else-if="filteredExternalResults.length" class="search-source-block">
        <div class="search-source-heading"><h3>樱花动漫候选</h3><span>{{ filteredExternalResults.length }} 部{{ externalSupplementLoading ? '，补充中' : '' }}</span></div>
        <div class="result-list">
          <article
            v-for="(anime, index) in filteredExternalResults"
            :key="anime.sourceUrl"
            class="result-row external-result-row"
          >
            <span class="result-rank">{{ String(index + 1).padStart(2, '0') }}</span>
            <img :ref="watchCover" class="search-cover" :src="resolveAssetUrl(anime.coverUrl) ?? fallbackCover" :alt="`${anime.title} 封面`" loading="eager" decoding="async" referrerpolicy="no-referrer" @load="handleCoverLoad" @error="handleCoverError" />
            <span class="result-copy">
              <strong>{{ anime.title }}</strong>
              <small :title="anime.sourceUrl">{{ anime.sourceUrl }}</small>
              <p>{{ anime.summary || '可直接打开来源播放，也可以导入简介、封面和视频资源后在站内观看。' }}</p>
              <span class="tag-list"><em>{{ anime.type || '未分类' }}</em><em>樱花候选</em></span>
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
      </div>

      <div v-if="loading" class="search-source-block">
        <div class="search-source-heading"><h3>已在片库</h3><span>匹配中</span></div>
        <div class="feed-skeleton" aria-label="正在查询片库"><span></span><span></span><span></span></div>
      </div>

      <div v-else-if="filteredInternalResults.length" class="search-source-block">
        <div class="search-source-heading"><h3>{{ query ? '已在片库' : '推荐作品' }}</h3><span>{{ filteredInternalResults.length }} 部</span></div>
        <div class="result-list">
          <RouterLink
            v-for="(anime, index) in filteredInternalResults"
            :key="anime.id"
            :to="`/anime/${anime.id}`"
            class="result-row"
          >
            <span class="result-rank">{{ String(index + 1).padStart(2, '0') }}</span>
            <img :ref="watchCover" class="search-cover" :src="anime.cover" :alt="`${anime.title} 封面`" loading="eager" decoding="async" referrerpolicy="no-referrer" @load="handleCoverLoad" @error="handleCoverError" />
            <span class="result-copy">
              <strong>{{ anime.title }}</strong>
              <small>{{ anime.meta }}</small>
              <p>{{ anime.summary }}</p>
              <span class="tag-list"><em>{{ anime.type }}</em><em v-for="tag in anime.tags" :key="tag">{{ tag }}</em></span>
            </span>
            <span class="result-score">
              <strong>{{ anime.score !== undefined ? `★ ${anime.score}` : '' }}</strong>
              <small>{{ anime.meta }}</small>
            </span>
            <span class="result-arrow" aria-hidden="true">→</span>
          </RouterLink>
        </div>
      </div>

      <p v-if="importError" class="search-import-error" role="alert">{{ importError }}</p>

      <div v-else-if="!loading && !externalLoading && !filteredInternalResults.length && !filteredExternalResults.length" class="empty-state">
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
