export type AnimeTone = 'coral' | 'blue' | 'gold' | 'pink' | 'violet' | 'teal'

export type AnimeCatalogItem = {
  slug: string
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

export const animeCatalog: AnimeCatalogItem[] = [
  {
    slug: 'star-sea-echo',
    title: '星海回声',
    subtitle: '在失落的广播塔，听见来自远方的回应',
    cover: '/covers/star-sea-echo.svg',
    tone: 'coral',
    tags: ['奇幻', '悬疑'],
    description: '旧广播塔在流星雨后接收到一段无法解释的声音。两个寻找答案的人，沿着海岸线追踪每一个微弱的回声。',
    update: '每周三 22:00 更新',
    releaseYear: 2026,
    status: '连载中',
    episode: '第 04 集',
    meta: '今天更新 · 22:00',
    popularity: 92,
    recentRank: 1,
  },
  {
    slug: 'blue-hour',
    title: '蓝色时刻',
    subtitle: '日落后的七分钟，城市会短暂地改变',
    cover: '/covers/blue-hour.svg',
    tone: 'blue',
    tags: ['都市', '群像'],
    description: '电车驶过最后一片蓝色天空，几个陌生人在城市的缝隙里交换各自的秘密。',
    update: '每周三 21:30 更新',
    releaseYear: 2026,
    status: '连载中',
    episode: '第 11 集',
    meta: '昨天更新 · 21:30',
    popularity: 98,
    recentRank: 2,
  },
  {
    slug: 'summer-afterglow',
    title: '夏末余晖',
    subtitle: '骑着自行车，回到那个夏天结束之前',
    cover: '/covers/summer-afterglow.svg',
    tone: 'gold',
    tags: ['青春', '成长'],
    description: '一段关于旧铁轨、夏日风和没有说出口的告别故事。',
    update: '全 12 集 · 已完结',
    releaseYear: 2025,
    status: '已完结',
    episode: '第 08 集',
    meta: '周一更新 · 已完结',
    popularity: 86,
    recentRank: 3,
  },
  {
    slug: 'letters-from-afar',
    title: '远方来信',
    subtitle: '山顶的灯亮起时，回信终于抵达',
    cover: '/covers/letter-from-faraway.svg',
    tone: 'pink',
    tags: ['奇幻', '治愈'],
    description: '女孩在山顶的旧邮局里工作，每一封来自远方的信都带着一段未完的旅程。',
    update: '每周五 20:00 更新',
    releaseYear: 2025,
    status: '连载中',
    episode: '第 08 集',
    meta: '本周五更新 · 20:00',
    popularity: 98,
    popularRank: 1,
  },
  {
    slug: 'tide-and-moonlight',
    title: '潮汐与月光',
    subtitle: '让纸船替我们保守这个夏天的秘密',
    cover: '/covers/tide-and-moon.svg',
    tone: 'violet',
    tags: ['青春', '群像'],
    description: '潮水涨落之间，两个朋友在海边寻找一座只在月光下出现的岛。',
    update: '每周六 23:15 更新',
    releaseYear: 2024,
    status: '连载中',
    episode: '第 02 集',
    meta: '本周六更新 · 23:15',
    popularity: 95,
    popularRank: 2,
  },
  {
    slug: 'after-the-rain',
    title: '雨停之后',
    subtitle: '雨会停，故事也会继续',
    cover: '/covers/after-the-rain.svg',
    tone: 'teal',
    tags: ['日常', '成长'],
    description: '雨后的城市总有新的方向，几位住在巷口的人开始重新认识自己的生活。',
    update: '每周一 19:30 更新',
    releaseYear: 2023,
    status: '连载中',
    episode: '第 06 集',
    meta: '本周一更新 · 19:30',
    popularity: 91,
    popularRank: 3,
  },
]

export const animeCatalogMap: Record<string, AnimeCatalogItem> = Object.fromEntries(animeCatalog.map((anime) => [anime.slug, anime]))
