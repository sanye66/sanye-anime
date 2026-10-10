<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { searchApi, type ExternalSearchHit } from '@/api/search'
import { animeApi } from '@/api/anime'
import { isAbortError, resolveAssetUrl } from '@/api/http'
import { animeCatalogMap } from '@/data/animeCatalog'
import { bundledCover, placeholderCover } from '@/data/coverFallback'
import { titleKey } from '@/data/titleKey'
import { desktopMode } from '@/desktop'
import { parsePlaybackLine } from '@/video/playbackLines'

const route = useRoute()
const router = useRouter()
const keyword = ref(String(route.query.keyword ?? ''))
const chips = ['全部', '原创动画', '电视动画', '剧场版', '网络动画'] as const
const chip = ref(chips.includes(route.query.type as typeof chips[number]) ? String(route.query.type) : '全部')
const externalResults = ref<ExternalSearchHit[]>([])
const externalLoading = ref(false)
const externalSupplementLoading = ref(false)
const externalError = ref(false)
const importingUrl = ref('')
const importError = ref('')
let externalController: AbortController | null = null
const coverFallbackTimers = new Map<HTMLImageElement, number>()

const fallbackCover = placeholderCover

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

const query = computed(() => normalizeSearchInput(String(route.query.keyword ?? '')))
const filteredExternalResults = computed(() => chip.value === '全部'
  ? externalResults.value
  : externalResults.value.filter((anime) => anime.type === chip.value))

/** 直接观看入口携带同一部作品的其他来源页，供站内播放器补齐备用线路。 */
function watchLocation(hit: ExternalSearchHit) {
  const sources = [...new Set([hit.sourceUrl, ...(hit.alternativeSourceUrls ?? [])])]
  return { name: 'externalWatch', query: { sourceUrl: hit.sourceUrl, alternatives: sources.filter(source => source !== hit.sourceUrl).slice(0, 3), keyword: keyword.value } }
}

/**
 * 随包目录里已经导入过同名作品时，优先给站内线路：来源站点的直连地址会失效或防盗链，
 * 而随包线路是本地已验证可播的媒体，标题只差标点也能命中（「你的名字。」与「你的名字」）。
 */
function bundledMatch(hit: ExternalSearchHit) {
  const key = titleKey(hit.title)
  if (!key) return undefined
  return Object.values(animeCatalogMap).find((entry) => titleKey(entry.title) === key)
}

/**
 * 行内封面：命中随包作品时一律用随包封面。
 *
 * 来源站点的封面会串到别的作品（实测《你的名字是玫瑰》条目挂着《你的名字》海报，
 * 播放页的第一张「相关推荐」海报还会按天轮换），所以站内作品不再采用来源封面。
 */
function hitCover(hit: ExternalSearchHit): string {
  const packaged = bundledMatch(hit)
  return resolveAssetUrl(packaged?.cover)
    ?? resolveAssetUrl(hit.coverUrl)
    ?? bundledCover(hit.title)
    ?? fallbackCover
}

/** 只在来源标题明确写了语言版本时显示标签，未知语言不再显示占位文案。 */
function versionCaption(title: string) {
  const { language } = parsePlaybackLine(title)
  if (language === '国语') return '国语版'
  if (language === '粤语') return '粤语版'
  if (language === '英语') return '英语版'
  if (language === '原声') return '原声版'
  return ''
}

watch(() => route.fullPath, () => {
  keyword.value = String(route.query.keyword ?? '')
  chip.value = chips.includes(route.query.type as typeof chips[number]) ? String(route.query.type) : '全部'
  void load()
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

function selectChip(type: string): void {
  if (chip.value === type) return
  void router.push({ path: '/search', query: { keyword: route.query.keyword, type: type === '全部' ? undefined : type } })
}

/** 搜索页只展示外部来源候选：片库作品改在番剧仓库里按标题查找。 */
async function load(): Promise<void> {
  const queryText = query.value
  externalController?.abort()
  externalResults.value = []
  externalError.value = false
  externalLoading.value = false
  externalSupplementLoading.value = false
  if (queryText) await loadExternal(queryText)
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
  if (externalLoading.value || externalSupplementLoading.value) return
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

/** 封面失败时的降级顺序：随包同名精修封面 → 通用占位图。 */
function degradeCover(image: HTMLImageElement): void {
  const bundled = image.dataset.bundledCover
  if (bundled && image.src !== bundled) {
    delete image.dataset.fallbackApplied
    image.src = bundled
    return
  }
  applyCoverFallback(image)
}

/** 图片 CDN 持续挂起时主动回退，不能只依赖不会触发的 error 事件。 */
function watchCover(element: unknown): void {
  if (!(element instanceof HTMLImageElement)) return
  clearCoverFallbackTimer(element)
  if (element.src !== fallbackCover) delete element.dataset.fallbackApplied
  if (element.complete) {
    if (!element.naturalWidth) degradeCover(element)
    return
  }
  const requestedSrc = element.src
  const timer = window.setTimeout(() => {
    coverFallbackTimers.delete(element)
    if (element.isConnected && element.src === requestedSrc
      && (!element.complete || !element.naturalWidth)) {
      degradeCover(element)
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
  degradeCover(image)
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

onBeforeUnmount(() => {
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
      </div>
    </section>

    <section class="search-results">
      <div v-if="externalLoading" class="feed-skeleton" aria-label="正在搜索"><span></span><span></span><span></span></div>

      <div v-if="filteredExternalResults.length" class="result-list">
        <article
          v-for="(anime, index) in filteredExternalResults"
          :key="anime.sourceUrl"
          class="result-row external-result-row"
        >
          <span class="result-rank">{{ String(index + 1).padStart(2, '0') }}</span>
          <img :ref="watchCover" class="search-cover" :src="hitCover(anime)" :data-bundled-cover="bundledCover(anime.title)" :alt="`${anime.title} 封面`" loading="eager" decoding="async" referrerpolicy="no-referrer" @load="handleCoverLoad" @error="handleCoverError" />
          <span class="result-copy">
            <strong>{{ anime.title }}</strong>
            <span v-if="anime.type || versionCaption(anime.title)" class="tag-list">
                <em v-if="anime.type">{{ anime.type }}</em>
                <em v-if="versionCaption(anime.title)">{{ versionCaption(anime.title) }}</em>
            </span>
          </span>
          <span class="external-result-actions">
            <RouterLink class="secondary-button" :to="watchLocation(anime)">直接观看</RouterLink>
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

      <div v-if="externalError" class="empty-state">
        <h3>搜索失败</h3>
        <button type="button" class="secondary-button" @click="loadExternal(query)">重试</button>
      </div>

      <div v-else-if="!externalLoading && !filteredExternalResults.length" class="empty-state">
        <h3>{{ query ? '没有找到匹配作品' : '输入作品名称开始搜索' }}</h3>
        <RouterLink v-if="!desktopMode && query" class="primary-button" to="/ai">让 AI 帮我找番</RouterLink>
      </div>
    </section>
  </div>
</template>
