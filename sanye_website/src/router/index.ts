import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/homeView.vue') },
    { path: '/about', name: 'about', component: () => import('@/views/aboutView.vue') },
    { path: '/legal', name: 'legal', component: () => import('@/views/legalView.vue') },
  ],
})

export default router
