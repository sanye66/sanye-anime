import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'

type RouteLoader = () => Promise<unknown>

// 保留路由加载器引用，供应用在用户悬停链接时提前准备页面代码。
const routeLoaders: Record<string, RouteLoader> = {
  home: () => import('@/views/homeView.vue'),
  animeRepository: () => import('@/views/animeRepositoryView.vue'),
  search: () => import('@/views/searchView.vue'),
  ai: () => import('@/views/aiView.vue'),
  mine: () => import('@/views/mineView.vue'),
  modelConfig: () => import('@/views/modelConfigView.vue'),
  importRequest: () => import('@/views/importRequestView.vue'),
  feedback: () => import('@/views/feedbackView.vue'),
  schedule: () => import('@/views/scheduleView.vue'),
  animeDetail: () => import('@/views/animeDetailView.vue'),
  externalWatch: () => import('@/views/animeDetailView.vue'),
  officialHome: () => import('@/views/officialHomeView.vue'),
  officialDownload: () => import('@/views/officialDownloadView.vue'),
  officialAbout: () => import('@/views/officialAboutView.vue'),
  officialLegal: () => import('@/views/officialLegalView.vue'),
}
const prefetchedRoutes = new Set<string>()

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', meta: { title: '首页' }, component: routeLoaders.home },
    { path: '/anime-repository', name: 'animeRepository', meta: { title: '番剧仓库' }, component: routeLoaders.animeRepository },
    { path: '/search', name: 'search', meta: { title: '搜索结果' }, component: routeLoaders.search },
    { path: '/ai', name: 'ai', meta: { title: 'AI 动漫助手' }, component: routeLoaders.ai },
    { path: '/mine', name: 'mine', meta: { title: '我的' }, component: routeLoaders.mine },
    { path: '/mine/model-config', name: 'modelConfig', meta: { title: '模型配置' }, component: routeLoaders.modelConfig },
    { path: '/mine/import-request', name: 'importRequest', meta: { title: '作品导入申请' }, component: routeLoaders.importRequest },
    { path: '/mine/feedback', name: 'feedback', meta: { title: '问题反馈' }, component: routeLoaders.feedback },
    { path: '/schedule', name: 'schedule', meta: { title: '一周排期' }, component: routeLoaders.schedule },
    { path: '/watch/external', name: 'externalWatch', meta: { title: '直接观看' }, component: routeLoaders.externalWatch },
    { path: '/anime/:slug', name: 'animeDetail', meta: { title: '作品详情' }, component: routeLoaders.animeDetail },
    { path: '/official', name: 'officialHome', meta: { title: 'official', public: true }, component: routeLoaders.officialHome },
    { path: '/official/download', name: 'officialDownload', meta: { title: '下载', public: true }, component: routeLoaders.officialDownload },
    { path: '/official/about', name: 'officialAbout', meta: { title: '产品介绍', public: true }, component: routeLoaders.officialAbout },
    { path: '/official/legal', name: 'officialLegal', meta: { title: '隐私与条款', public: true }, component: routeLoaders.officialLegal },
  ],
})

/** 在点击前加载目标页面代码，避免懒加载从点击后才开始。 */
export function prefetchRoute(to: string): void {
  const resolved = router.resolve(to)
  const name = typeof resolved.name === 'string' ? resolved.name : ''
  const loader = routeLoaders[name]
  if (loader && !prefetchedRoutes.has(name)) {
    prefetchedRoutes.add(name)
    void loader()
  }
}

// 路由守卫负责 CAS ticket 换会话、受保护页面拦截和页面标题同步。
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  const ticket = typeof to.query.ticket === 'string' ? to.query.ticket : undefined
  if (ticket) {
    try {
      const service = window.location.origin + to.path
      const session = await authApi.casCallback(ticket, service)
      auth.setSession(session.accessToken, session.refreshToken)
      auth.user = { id: session.user.id, nickname: session.user.nickname }
    } catch {
      // ticket 校验失败：清除参数继续匿名使用
    }
    const query = { ...to.query }
    delete query.ticket
    return { path: to.path, query, replace: true }
  }
  if (to.meta.auth === true && !auth.loggedIn) {
    auth.loginRedirect()
    return false
  }
  document.title = to.meta.title ? `${to.meta.title} · sanye_anime` : 'sanye_anime'
  return true
})

// 每次路由切换回到页面顶部，避免复用视图时保留旧滚动位置。
router.afterEach(() => {
  window.scrollTo(0, 0)
})

export default router
