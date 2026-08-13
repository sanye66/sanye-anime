<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { animeCatalogMap } from '@/data/animeCatalog'

const route = useRoute()

const detail = computed(() => animeCatalogMap[String(route.params.slug)] ?? animeCatalogMap['star-sea-echo'])
const collected = ref(false)
</script>

<template>
  <div class="page-stack anime-detail-page">
    <RouterLink class="back-link" to="/">← 返回首页</RouterLink>
    <section class="anime-detail-hero">
      <div class="anime-detail-cover"><img :src="detail.cover" :alt="`${detail.title} 动漫封面`" /></div>
      <div class="anime-detail-copy"><span class="eyebrow">作品详情</span><h2>{{ detail.title }}</h2><p class="anime-detail-subtitle">{{ detail.subtitle }}</p><div class="anime-detail-tags"><span v-for="tag in detail.tags" :key="tag">{{ tag }}</span><span>{{ detail.status }}</span></div><p class="anime-detail-description">{{ detail.description }}</p><div class="anime-detail-meta"><span>更新安排</span><strong>{{ detail.update }}</strong></div><div class="anime-detail-actions"><RouterLink class="primary-button" to="/ai">问 AI 关于这部作品</RouterLink><button class="secondary-button" type="button" :aria-pressed="collected" @click="collected = !collected">{{ collected ? '已收藏' : '收藏作品' }}</button></div></div>
    </section>
    <section class="anime-detail-section"><div><span class="eyebrow">观看前先了解</span><h3>故事线索</h3></div><p>打开 AI 助手可以继续询问角色关系、观看顺序和不剧透的剧情解释。</p></section>
  </div>
</template>
