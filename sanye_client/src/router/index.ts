import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/homeView.vue') },
    { path: '/anime-repository', name: 'animeRepository', component: () => import('@/views/animeRepositoryView.vue') },
    { path: '/ai', name: 'ai', component: () => import('@/views/aiView.vue') },
    { path: '/mine', name: 'mine', component: () => import('@/views/mineView.vue') },
    { path: '/mine/model-config', name: 'modelConfig', component: () => import('@/views/modelConfigView.vue') },
    { path: '/mine/feedback', name: 'feedback', component: () => import('@/views/feedbackView.vue') },
    { path: '/schedule', name: 'schedule', component: () => import('@/views/scheduleView.vue') },
    { path: '/anime/:slug', name: 'animeDetail', component: () => import('@/views/animeDetailView.vue') },
    { path: '/official', name: 'officialHome', component: () => import('@/views/officialHomeView.vue') },
    { path: '/official/download', name: 'officialDownload', component: () => import('@/views/officialDownloadView.vue') },
    { path: '/official/about', name: 'officialAbout', component: () => import('@/views/officialAboutView.vue') },
    { path: '/official/legal', name: 'officialLegal', component: () => import('@/views/officialLegalView.vue') },
  ],
})

export default router
