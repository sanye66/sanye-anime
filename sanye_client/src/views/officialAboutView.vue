<script setup lang="ts">
import { RouterLink } from 'vue-router'
import OfficialShell from '@/components/officialShell.vue'
</script>

<template>
  <OfficialShell>
    <section class="official-inner-hero">
      <span class="official-eyebrow">产品介绍</span>
      <h1>让动漫的“下一步”，<br /><em>变得更容易。</em></h1>
      <p>sanye_anime 不是一个把所有内容堆在一起的目录，而是一张连接作品、问题和观看体验的桌面。</p>
    </section>
    <section class="official-manifesto">
      <span class="official-manifesto-mark">✦</span>
      <div>
        <span class="official-eyebrow">我们相信</span>
        <h2>好的推荐，不只是告诉你“看什么”，还应该让你知道“为什么是它”。</h2>
        <p>所以我们把搜索、作品信息和 AI 动漫助手放在一起，让每一次探索都能自然地继续下去。</p>
      </div>
    </section>
    <section class="official-about-grid">
      <article>
        <span>客户端</span>
        <h3>一张为长时间观看准备的桌面</h3>
        <p>多栏信息、清晰状态和快速切换，让你在作品、会话和收藏之间保持上下文。</p>
        <RouterLink class="official-text-link" to="/">进入 sanye_anime →</RouterLink>
      </article>
      <article>
        <span>AI 助手</span>
        <h3>先理解，再决定要不要被剧透</h3>
        <p>你可以控制回答范围，带着一部作品的上下文提问，也可以只说一句“帮我找一部类似的”。</p>
        <RouterLink class="official-text-link" to="/ai">试用 AI 工作区 →</RouterLink>
      </article>
    </section>
  </OfficialShell>
</template>
