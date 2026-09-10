import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

type RouteLoader = () => Promise<unknown>

const routeLoaders: Record<string, RouteLoader> = {
  login: () => import('@/views/loginView.vue'),
  dashboard: () => import('@/views/dashboardView.vue'),
  content: () => import('@/views/contentView.vue'),
  officialContent: () => import('@/views/officialContentView.vue'),
  feedback: () => import('@/views/feedbackView.vue'),
  jobs: () => import('@/views/jobsView.vue'),
  jobLogs: () => import('@/views/jobLogsView.vue'),
  users: () => import('@/views/userManagementView.vue'),
  audit: () => import('@/views/auditView.vue'),
  roles: () => import('@/views/roleView.vue'),
  menus: () => import('@/views/menuView.vue'),
}
const prefetchedRoutes = new Set<string>()

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', meta: { title: '登录', public: true }, component: routeLoaders.login },
    { path: '/dashboard', name: 'dashboard', meta: { title: '仪表盘', auth: true }, component: routeLoaders.dashboard },
    { path: '/content', name: 'content', meta: { title: '内容管理', auth: true }, component: routeLoaders.content },
    { path: '/official-content', name: 'officialContent', meta: { title: '官网正文', auth: true }, component: routeLoaders.officialContent },
    { path: '/feedback', name: 'feedback', meta: { title: '用户反馈', auth: true }, component: routeLoaders.feedback },
    { path: '/jobs', name: 'jobs', meta: { title: '任务管理', auth: true }, component: routeLoaders.jobs },
    { path: '/jobs/logs', name: 'jobLogs', meta: { title: '任务日志', auth: true }, component: routeLoaders.jobLogs },
    { path: '/users', name: 'users', meta: { title: '用户管理', auth: true }, component: routeLoaders.users },
    { path: '/audit', name: 'audit', meta: { title: '权限与审计', auth: true }, component: routeLoaders.audit },
    { path: '/roles', name: 'roles', meta: { title: '角色管理', auth: true }, component: routeLoaders.roles },
    { path: '/menus', name: 'menus', meta: { title: '菜单管理', auth: true }, component: routeLoaders.menus },
  ],
})

/** 在用户表达导航意图时预取目标页面代码。 */
export function prefetchRoute(to: string): void {
  const resolved = router.resolve(to)
  const name = typeof resolved.name === 'string' ? resolved.name : ''
  const loader = routeLoaders[name]
  if (loader && !prefetchedRoutes.has(name)) {
    prefetchedRoutes.add(name)
    void loader()
  }
}

// 路由守卫先恢复管理员信息，再按页面权限拦截未授权访问。
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (auth.loggedIn && auth.permissions.length === 0) {
    await auth.loadUser()
  }
  if (to.meta.auth === true && !auth.loggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/content' && !auth.hasPerm('anime:content:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/official-content' && !auth.hasPerm('legal:content:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/feedback' && !auth.hasPerm('feedback:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/jobs' && !auth.hasPerm('monitor:job:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/jobs/logs' && !auth.hasPerm('monitor:job:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/users' && !auth.hasPerm('system:user:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/audit' && !auth.hasPerm('monitor:operlog:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/roles' && !auth.hasPerm('system:role:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/menus' && !auth.hasPerm('system:menu:list')) {
    return { path: '/dashboard' }
  }
  if (to.path === '/login' && auth.loggedIn) {
    return { path: '/dashboard' }
  }
  document.title = to.meta.title ? `${to.meta.title} · sanye_anime 管理平台` : 'sanye_anime 管理平台'
  return true
})

export default router
