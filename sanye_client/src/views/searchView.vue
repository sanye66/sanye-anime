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
const chips = ['全部', '原创动画', '电视动画', '剧场版', '网络动画'] as const
const chip = ref(chips.includes(route.query.type as typeof chips[number]) ? String(route.query.type) : '全部')
function routePage(): number {
  const requested = Number(route.query.page)
  return Number.isSafeInteger(requested) && requested > 0 ? requested : 1
}
const page = ref(routePage())
// 首屏只取必要结果，减少 ES 高亮、响应体和图片布局成本。
const size = 20
const results = ref<ResultEntry[]>([])
const externalResults = ref<ExternalSearchHit[]>([])
function watchLocation(hit: ExternalSearchHit) {
  const sources = [...new Set([hit.sourceUrl, ...(hit.alternativeSourceUrls ?? [])])]
  return { name: 'externalWatch', query: { sourceUrl: hit.sourceUrl, alternatives: sources.filter(source => source !== hit.sourceUrl).slice(0, 3), keyword: keyword.value } }
}
function versionCaption(title: string) {
  if (/国语|国配|中文配音/.test(title)) return '国语版'
  if (/粤语/.test(title)) return '粤语版'
  if (/英语|英文/.test(title)) return '英语版'
  if (/日语|原声/.test(title)) return '原声版'
  return '语言待确认'
}
const totalPages = ref(0)
const loading = ref(false)
const externalLoading = ref(false)
const externalSupplementLoading = ref(false)
const externalError = ref(false)
const importingUrl = ref('')
const importError = ref('')
const fallback = ref(false)
const searchError = ref('')
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

const query = computed(() => normalizeSearchInput(String(route.query.keyword ?? '')))
let loadedQuery = query.value
let loadedPage = page.value
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

watch(() => route.fullPath, () => {
  const nextKeyword = String(route.query.keyword ?? '')
  const nextChip = chips.includes(route.query.type as typeof chips[number]) ? String(route.query.type) : '全部'
  const nextPage = routePage()
  const keywordChanged = loadedQuery !== normalizeSearchInput(nextKeyword)
  const pageChanged = loadedPage !== nextPage
  loadedQuery = normalizeSearchInput(nextKeyword)
  loadedPage = nextPage
  keyword.value = nextKeyword
  chip.value = nextChip
  page.value = nextPage
  // 分类是对已返回候选的前端筛选；重建请求会清空站内结果与外部类型校正依据。
  if (keywordChanged) { void load(); return }
  if (pageChanged) void loadInternal(query.value)
})

function selectChip(type: string): void {
  if (chip.value === type) return
  void router.push({ path: '/search', query: { keyword: route.query.keyword, type: type === '全部' ? undefined : type } })
}

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
  searchError.value = ''
  results.value = []
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
    }, { signal: controller.signal, timeout: 10_000, retries: 0 })
    if (requestController !== controller) return
    results.value = mergeMushokuResults(result.items.map(toEntry))
    totalPages.value = result.totalPages
  } catch (cause) {
    if (isAbortError(cause) || requestController !== controller) return
    fallback.value = true
    searchError.value = cause instanceof Error ? cause.message : '搜索失败，请稍后重试'
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
  const type = chip.value === '全部' ? undefined : chip.value
  const completeRequest = searchApi.external(queryText, 20, type, options)
    .then((value) => ({ value, error: null as unknown }))
    .catch((error: unknown) => ({ value: null, error }))
  const preferredRequest = searchApi.externalPreferred(queryText, 20, type, options)
    .then((value) => ({ value, error: null as unknown }))
    .catch((error: unknown) => ({ value: null, error }))
  let completeDisplayed = false
  const [preferred, complete] = await Promise.all([
    preferredRequest.then((result) => {
      if (externalController === controller && result.value?.length && !completeDisplayed) {
        externalResults.value = result.value
        externalLoading.value = false
      }
      return result
    }),
    completeRequest.then((result) => {
      if (externalController === controller && result.value) {
        completeDisplayed = true
        externalResults.value = result.value
        externalLoading.value = false
        externalSupplementLoading.value = false
      }
      return result
    }),
  ])
  if (externalController === controller) {
    externalLoading.value = false
    externalSupplementLoading.value = false
    externalController = null
    externalError.value = !preferred.value && !complete.value
      && !isAbortError(preferred.error) && !isAbortError(complete.error)
  }
}

/** 重新搜索时同步 URL，便于返回和刷新后保持同一关键词。 */
function submitSearch(): void {
  const routeKeyword = String(route.query.keyword ?? '')
  if (keyword.value.trim() !== routeKeyword) {
    void router.push({ path: '/search', query: { keyword: keyword.value.trim(), type: chip.value === '全部' ? undefined : chip.value } })
    return
  }
  if (loading.value || externalLoading.value || externalSupplementLoading.value) return
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
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : '请稍后重试'
    importError.value = `《${hit.title}》导入失败：${reason}`
  } finally {
    importingUrl.value = ''
  }
}

/** 在搜索结果页码大于一时向前翻页。 */
function prevPage() {
  if (page.value > 1) {
    void router.push({ path: '/search', query: { ...route.query, page: page.value - 1 === 1 ? undefined : String(page.value - 1) } })
  }
}

/** 在未到最后一页时向后翻页。 */
function nextPage() {
  if (page.value < totalPages.value) {
    void router.push({ path: '/search', query: { ...route.query, page: String(page.value + 1) } })
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
      <form class="large-search" role="search" @submit.prevent="submitSearch">
        <span aria-hidden="true">⌕</span>
        <input v-model="keyword" aria-label="搜索作品" placeholder="输入作品名称" autofocus />
        <button type="submit" class="search-submit" :disabled="!keyword.trim()">搜索</button>
      </form>
      <div class="filter-row">
        <button
          v-for="item in chips"
          :key="item"
          type="button"
          class="filter-chip"
          :class="{ 'is-active': chip === item }"
          @click="selectChip(item)"
        >
          {{ item }}
        </button>
        <span class="result-count">{{ resultCount }} 部作品</span>
      </div>
    </section>

    <section class="search-results">
      <div v-if="searchError" class="search-request-error" role="alert"><span>{{ searchError }}</span><button type="button" class="secondary-button" :disabled="loading" @click="loadInternal(query)">重试片库搜索</button></div>
      <div class="section-heading">
        <div>
          <span class="eyebrow">搜索结果</span>
          <h2>{{ query ? `关于“${query}”` : '推荐作品' }}</h2>
        </div>
        <span v-if="externalLoading" class="sort-label">正在搜索</span>
        <span v-else-if="externalSupplementLoading" class="sort-label">高相关结果已显示，正在补充原词结果</span>
        <span v-else-if="externalError" class="sort-label">外部搜索暂不可用 <button type="button" class="secondary-button" @click="loadExternal(query)">重试外部搜索</button></span>
        <span v-else-if="fallback" class="sort-label">{{ desktopMode ? '搜索服务暂不可用，请重试' : '搜索服务暂不可用，已展示本地演示数据' }}</span>
        <span v-else class="sort-label">按相关度排序 ⌄</span>
      </div>

      <div v-if="externalLoading" class="search-source-block">
        <div class="search-source-heading"><h3>匹配作品</h3><span>搜索中</span></div>
        <div class="feed-skeleton" aria-label="正在搜索"><span></span><span></span><span></span></div>
      </div>

      <div v-else-if="filteredExternalResults.length" class="search-source-block">
        <div class="search-source-heading"><h3>匹配作品</h3><span>{{ filteredExternalResults.length }} 部{{ externalSupplementLoading ? '，补充中' : '' }}</span></div>
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
              <p>{{ anime.summary || '可直接打开来源播放，也可以导入简介、封面和视频资源后在站内观看。' }}</p>
              <span class="tag-list"><em>{{ anime.type || '未分类' }}</em><em>{{ versionCaption(anime.title) }}</em></span>
            </span>
            <span class="external-result-actions">
              <RouterLink
                class="secondary-button"
                :to="watchLocation(anime)"
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

      <div v-else-if="!searchError && !loading && !externalLoading && !externalSupplementLoading && !filteredInternalResults.length && !filteredExternalResults.length" class="empty-state">
        <span class="empty-mark" aria-hidden="true">⌕</span>
        <h3>{{ query ? '还没有找到匹配作品' : '输入作品名称开始搜索' }}</h3>
        <p>{{ desktopMode ? '可以搜索“你的名字”或“无职转生”，也可以尝试其他作品名称。' : '换一个关键词，或者让 AI 帮你找到更合适的作品。' }}</p>
        <RouterLink v-if="!desktopMode" class="primary-button" to="/ai">让 AI 帮我找番 →</RouterLink>
      </div>

      <nav v-if="totalPages > 1 && !fallback" class="repository-pagination" aria-label="分页">
        <button type="button" class="secondary-button" :disabled="page <= 1" @click="prevPage">← 上一页</button>
        <span>第 {{ page }} / {{ totalPages }} 页</span>
        <button type="button" class="secondary-button" :disabled="page >= totalPages" @click="nextPage">下一页 →</button>
      </nav>
    </section>
  </div>
</template>
