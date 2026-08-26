import { onBeforeUnmount, ref } from 'vue'
import { animeApi } from '@/api/anime'
import { isAbortError, resolveAssetUrl } from '@/api/http'
import type { AnimeCard } from '@/api/types'
import { animeCatalogMap, compareAnimeCatalogOrder } from '@/data/animeCatalog'

export interface ShelfCard {
  slug: string
  title: string
  meta: string
  cover: string
  tone: string
  episode: string
  tag?: string
}

const tones = ['coral', 'blue', 'gold', 'pink', 'violet', 'teal']

/** 按正式片库顺序排列首页卡片，并重新分配展示色调。 */
function sortShelfCards(cards: ShelfCard[]): ShelfCard[] {
  return [...cards]
    .sort((left, right) => compareAnimeCatalogOrder(left.slug, right.slug))
    .map((card, index) => ({ ...card, tone: tones[index % tones.length] }))
}

/** 将服务端目录卡片转换为首页货架卡片。 */
function toShelfCard(card: AnimeCard, index: number): ShelfCard {
  // 将后端卡片转换为首页货架需要的展示字段，并为卡片分配循环色调。
  const local = animeCatalogMap[String(card.id)]
  return {
    slug: String(card.id),
    title: local?.title ?? card.title,
    meta: card.updateText ?? card.type,
    cover: resolveAssetUrl(local?.cover) ?? resolveAssetUrl(card.coverUrl && !card.coverUrl.includes('anime-placeholder') ? card.coverUrl : undefined) ?? '/covers/mushoku-oad.svg',
    tone: tones[index % tones.length],
    episode: card.status,
    tag: card.score !== undefined ? `★ ${card.score}` : undefined,
  }
}

/** 提供首页近期/热门数据、加载状态和可重试动作。 */
export function useHomeFeed() {
  const loading = ref(false)
  const error = ref(false)
  const recent = ref<ShelfCard[]>([])
  const popular = ref<ShelfCard[]>([])
  const imported = ref<ShelfCard[]>([])
  let requestController: AbortController | null = null

  /** 请求首页聚合并在失败时保留可重试错误态。 */
  async function load() {
    // 首页优先使用服务端聚合，失败时保留空状态让页面显示可重试提示。
    requestController?.abort()
    const controller = new AbortController()
    requestController = controller
    loading.value = true
    error.value = false
    try {
      const data = await animeApi.home('FEATURED', { signal: controller.signal })
      // 兼容服务端 section key 的大小写差异，缺失区块按空列表处理。
      const pick = (key: string) =>
        data.sections.find((section) => section.key.toLowerCase().includes(key))?.anime ?? []
      recent.value = sortShelfCards(pick('recent').map(toShelfCard))
      popular.value = sortShelfCards(pick('popular').map(toShelfCard)).slice(0, 3)
      // 导入作品没有评分或排期时由独立区块承接，避免被首页原有筛选规则隐藏。
      imported.value = pick('imported').map(toShelfCard)
    } catch (cause) {
      if (isAbortError(cause)) return
      error.value = true
      recent.value = []
      popular.value = []
      imported.value = []
    } finally {
      if (requestController === controller) {
        requestController = null
        loading.value = false
      }
    }
  }

  onBeforeUnmount(() => requestController?.abort())

  void load()

  return { loading, error, recent, popular, imported, retry: load }
}
