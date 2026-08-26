export type AnimeTone = 'coral' | 'blue' | 'gold' | 'pink' | 'violet' | 'teal'

export type AnimeCatalogItem = {
  slug: string
  seriesKey: string
  seriesOrder: number
  seasonOrder: number
  title: string
  subtitle: string
  cover: string
  tone: AnimeTone
  tags: string[]
  description: string
  update: string
  releaseYear: number
  status: '连载中' | '已完结'
  episode: string
  meta: string
  popularity: number
  recentRank?: number
  popularRank?: number
}

/** 客户端正式内容白名单：仅保留已导入的《你的名字》和无职转生各独立篇章。 */
export const SUPPORTED_ANIME_IDS = ['127', '133', '136', '135', '128', '137'] as const

/** 判断接口返回的作品是否属于当前客户端正式片库。 */
export function isSupportedAnimeId(id: string | number): boolean {
  return SUPPORTED_ANIME_IDS.includes(String(id) as (typeof SUPPORTED_ANIME_IDS)[number])
}

/**
 * 按正式目录中的作品系列和季度顺序比较两个作品 ID。
 * 未登记的接口数据排在正式目录之后，并返回相同权重以保留接口原始顺序。
 */
export function compareAnimeCatalogOrder(leftId: string | number, rightId: string | number): number {
  const left = animeCatalogMap[String(leftId)]
  const right = animeCatalogMap[String(rightId)]
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  return left.seriesOrder - right.seriesOrder || left.seasonOrder - right.seasonOrder
}

export const animeCatalog: AnimeCatalogItem[] = [
  {
    slug: '127',
    seriesKey: 'your-name',
    seriesOrder: 100,
    seasonOrder: 100,
    title: '你的名字',
    subtitle: '关于相遇、记忆与约定的故事',
    cover: '/client-covers/your-name.jpg',
    tone: 'coral',
    tags: ['剧场版', '爱情', '奇幻'],
    description: '在远离大都会的小山村，两个素不相识的少年少女在梦中交换人生，并开始寻找彼此。',
    update: '剧场版 · 已发布',
    releaseYear: 2026,
    status: '已完结',
    episode: '全 1 部',
    meta: '剧场版 · 已导入',
    popularity: 100,
    recentRank: 1,
    popularRank: 1,
  },
  {
    slug: '133',
    seriesKey: 'mushoku-tensei',
    seriesOrder: 200,
    seasonOrder: 100,
    title: '无职转生 · 第一季',
    subtitle: '到了异世界就拿出真本事',
    cover: '/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100607A039.jpg',
    tone: 'blue',
    tags: ['异世界', '冒险', '成长'],
    description: '重新开始的人生，终于有机会认真生活并拿出真正的本事。',
    update: '第一季 · 23 集',
    releaseYear: 2026,
    status: '已完结',
    episode: '23 集',
    meta: '无职转生 · 第一季',
    popularity: 99,
    recentRank: 2,
    popularRank: 2,
  },
  {
    slug: '136',
    seriesKey: 'mushoku-tensei',
    seriesOrder: 200,
    seasonOrder: 200,
    title: '无职转生 · 第二季',
    subtitle: '到了异世界就拿出真本事',
    cover: '/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100612A042.jpg',
    tone: 'gold',
    tags: ['异世界', '冒险', '魔法'],
    description: '鲁迪乌斯继续在异世界前行，面对新的伙伴、选择与成长。',
    update: '第二季 · 24 集',
    releaseYear: 2026,
    status: '已完结',
    episode: '24 集',
    meta: '无职转生 · 第二季',
    popularity: 98,
    recentRank: 3,
    popularRank: 3,
  },
  {
    slug: '135',
    seriesKey: 'mushoku-tensei',
    seriesOrder: 200,
    seasonOrder: 201,
    title: '无职转生 · 第二季 Part.2',
    subtitle: '到了异世界就拿出真本事',
    cover: '/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100611A041.jpg',
    tone: 'pink',
    tags: ['异世界', '冒险', '剧情'],
    description: '第二季后半篇章，新的旅程继续展开，重要的命运交汇即将到来。',
    update: '第二季 Part.2 · 12 集',
    releaseYear: 2026,
    status: '已完结',
    episode: '12 集',
    meta: '无职转生 · 第二季 Part.2',
    popularity: 97,
    recentRank: 4,
  },
  {
    slug: '128',
    seriesKey: 'mushoku-tensei',
    seriesOrder: 200,
    seasonOrder: 300,
    title: '无职转生 · 第三季',
    subtitle: '到了异世界就拿出真本事',
    cover: '/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100559A034.jpg',
    tone: 'violet',
    tags: ['异世界', '冒险', '奇幻'],
    description: '异世界的新篇章已经开启，鲁迪乌斯将面对更大的舞台和挑战。',
    update: '第三季 · 9 集',
    releaseYear: 2026,
    status: '连载中',
    episode: '9 集',
    meta: '无职转生 · 第三季',
    popularity: 96,
    recentRank: 5,
  },
  {
    slug: '137',
    seriesKey: 'mushoku-tensei',
    seriesOrder: 200,
    seasonOrder: 900,
    title: '无职转生 · OAD 特别篇',
    subtitle: '到了异世界就拿出真本事',
    cover: '/covers/mushoku-oad.svg',
    tone: 'teal',
    tags: ['异世界', '特别篇', '冒险'],
    description: '无职转生系列特别篇，补充主线旅程中的重要片段。',
    update: 'OAD 特别篇 · 1 集',
    releaseYear: 2026,
    status: '已完结',
    episode: '1 集',
    meta: '无职转生 · OAD 特别篇',
    popularity: 95,
    recentRank: 6,
  },
]

export const animeCatalogMap: Record<string, AnimeCatalogItem> = Object.fromEntries(animeCatalog.map((anime) => [anime.slug, anime]))
