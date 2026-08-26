<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { publicApi } from '@/api/public'
import type { AnimeCard } from '@/api/types'
import { animeCatalog, isSupportedAnimeId } from '@/data/animeCatalog'
import OfficialShell from '@/components/officialShell.vue'

const loading = ref(false)
const failed = ref(false)
const picks = ref<AnimeCard[]>([])

const displayPicks = computed(() => {
  const supportedPicks = picks.value.filter((item) => isSupportedAnimeId(item.id))
  return supportedPicks.length
    ? supportedPicks.map((item) => ({ slug: String(item.id), title: item.title, tags: item.tags, score: item.score }))
    : animeCatalog
        .slice(0, 3)
        .map((item) => ({ slug: item.slug, title: item.title, tags: item.tags.slice(0, 2), score: item.popularity }))
})

/** 加载官网公开精选，失败时保留本地演示数据。 */
async function load() {
  loading.value = true
  failed.value = false
  try {
    picks.value = (await publicApi.home()).picks
  } catch {
    failed.value = true
    picks.value = []
  } finally {
    loading.value = false
  }
}

void load()
</script>

<template>
  <OfficialShell>
    <section class="official-hero">
      <div class="official-hero-copy">
        <span class="official-eyebrow">为每一次观看，找到更多线索</span>
        <h1>你的下一部动漫，<br /><em>不必靠运气。</em></h1>
        <p>sanye_anime 把作品发现、角色信息和 AI 对话放在同一张桌面上。先找到想看的故事，再决定要不要深入其中。</p>
        <div class="official-actions">
          <RouterLink class="official-primary" to="/">打开 sanye_anime →</RouterLink>
          <RouterLink class="official-text-link" to="/official/download">下载客户端 ↓</RouterLink>
          <RouterLink class="official-text-link" to="/official/about">了解产品 →</RouterLink>
        </div>
      </div>
      <div class="official-hero-art" aria-hidden="true">
        <span class="official-meteor-line"></span>
        <span class="official-hero-note">好故事<br />就在<br />下一页</span>
      </div>
    </section>

    <section class="official-strip">
      <span class="brand-mark">S</span>
      <div>
        <span class="official-eyebrow">电脑客户端</span>
        <h3>把这段星空带在身边。</h3>
        <p>下载 sanye_anime PC 客户端，获得完整的动漫发现与 AI 对话工作区。</p>
      </div>
      <RouterLink class="official-text-link" to="/official/download">查看下载信息 →</RouterLink>
    </section>

    <section class="official-features">
      <div class="official-features-head">
        <span class="official-eyebrow">三种方式，进入一部作品</span>
        <h2>从“想看什么”到“为什么喜欢”。</h2>
      </div>
      <div class="official-feature-grid">
        <article><span class="official-feature-no">01</span><h3>先发现</h3><p>从精选、新番、榜单和排期开始，不错过下一部刚好适合你的作品。</p></article>
        <article><span class="official-feature-no">02</span><h3>再理解</h3><p>打开作品详情，快速了解角色、标签、观看顺序和不剧透的内容提示。</p></article>
        <article><span class="official-feature-no">03</span><h3>继续问</h3><p>让 AI 帮你找番、梳理剧情和解释关系，但答案永远给你选择权。</p></article>
      </div>
    </section>

    <section class="official-picks">
      <div class="official-picks-head">
        <div><span class="official-eyebrow">公开精选</span><h2>最近值得打开的故事</h2></div>
        <RouterLink class="official-text-link" to="/">浏览全部 →</RouterLink>
      </div>
      <div v-if="loading" class="feed-skeleton"><span></span><span></span><span></span></div>
      <div v-else class="official-pick-grid">
        <RouterLink v-for="item in displayPicks" :key="item.slug" :to="`/anime/${item.slug}`" class="official-pick">
          <strong>{{ item.title }}</strong>
          <small>{{ item.tags.join(' · ') }} · ★ {{ item.score }}</small>
        </RouterLink>
      </div>
      <p v-if="failed" class="official-fallback">公开内容接口暂不可用，当前展示本地演示数据。</p>
    </section>
  </OfficialShell>
</template>
