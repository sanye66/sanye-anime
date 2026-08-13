import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/dashboardView.vue') },
    { path: '/content', name: 'content', component: () => import('@/views/contentView.vue') },
    { path: '/feedback', name: 'feedback', component: () => import('@/views/feedbackView.vue') },
  ],
})

export default router
