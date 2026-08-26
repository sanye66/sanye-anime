import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', name: 'login', meta: { title: '登录', public: true }, component: () => import('@/views/loginView.vue') },
    { path: '/dashboard', name: 'dashboard', meta: { title: '仪表盘', auth: true }, component: () => import('@/views/dashboardView.vue') },
    { path: '/content', name: 'content', meta: { title: '内容管理', auth: true }, component: () => import('@/views/contentView.vue') },
    { path: '/official-content', name: 'officialContent', meta: { title: '官网正文', auth: true }, component: () => import('@/views/officialContentView.vue') },
    { path: '/feedback', name: 'feedback', meta: { title: '用户反馈', auth: true }, component: () => import('@/views/feedbackView.vue') },
    { path: '/jobs', name: 'jobs', meta: { title: '任务管理', auth: true }, component: () => import('@/views/jobsView.vue') },
    { path: '/jobs/logs', name: 'jobLogs', meta: { title: '任务日志', auth: true }, component: () => import('@/views/jobLogsView.vue') },
    { path: '/users', name: 'users', meta: { title: '用户管理', auth: true }, component: () => import('@/views/userManagementView.vue') },
    { path: '/audit', name: 'audit', meta: { title: '权限与审计', auth: true }, component: () => import('@/views/auditView.vue') },
    { path: '/roles', name: 'roles', meta: { title: '角色管理', auth: true }, component: () => import('@/views/roleView.vue') },
    { path: '/menus', name: 'menus', meta: { title: '菜单管理', auth: true }, component: () => import('@/views/menuView.vue') },
  ],
})

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
