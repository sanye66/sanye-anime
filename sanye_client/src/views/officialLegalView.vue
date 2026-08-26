<script setup lang="ts">
import { onMounted, ref } from 'vue'
import OfficialShell from '@/components/officialShell.vue'
import { publicApi } from '@/api/public'

const tab = ref('privacy')
const loading = ref(true)
const apiError = ref(false)

const labels: Record<string, string> = {
  privacy: '隐私政策',
  terms: '使用条款',
  copyright: '版权与内容来源',
  contact: '联系我们',
}

const fallbackCopy: Record<string, { title: string; paragraphs: string[] }> = {
  privacy: {
    title: '隐私政策摘要',
    paragraphs: [
      'sanye_anime 只在提供账户、收藏、历史和 AI 会话功能所必需的范围内处理用户数据。你可以在客户端设置中查看、导出或删除属于自己的数据。',
      'AI 回答是基于已发布作品信息生成的辅助内容，不应替代官方来源。你可以使用避免剧透模式，并在发现内容问题时提交反馈。',
    ],
  },
  terms: {
    title: '使用条款摘要',
    paragraphs: [
      'sanye_anime 提供动漫内容发现、搜索与 AI 对话服务，公开内容仅用于信息展示。',
      '用户应对自己提交的问题、反馈和账户操作负责；产品不提供未授权的观看、下载或资源聚合。',
    ],
  },
  copyright: {
    title: '版权与内容来源',
    paragraphs: [
      '作品信息、图片和外部链接必须经过来源审核，并在发布记录中保留授权范围与有效期。',
      '权利人提出异议后，相关内容会按流程下架并保留审计记录。',
    ],
  },
  contact: {
    title: '联系我们',
    paragraphs: [
      '关于隐私、内容来源和账号数据的疑问，可以通过客户端的问题反馈入口提交。',
      '公开联系渠道将在正式上线前由运营团队统一公布。',
    ],
  },
}

const docs = ref<Record<string, { title: string; paragraphs: string[] }>>(fallbackCopy)

/** 按空行拆分法律正文，过滤空段落供页面逐段渲染。 */
function paragraphsOf(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

/** 读取公开法律正文并与内置兜底文案合并。 */
async function loadLegal() {
  loading.value = true
  apiError.value = false
  try {
    const list = await publicApi.legal()
    const next: Record<string, { title: string; paragraphs: string[] }> = {}
    for (const doc of list) {
      next[doc.key] = { title: doc.title, paragraphs: paragraphsOf(doc.content) }
    }
    docs.value = { ...fallbackCopy, ...next }
  } catch {
    apiError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadLegal()
})
</script>

<template>
  <OfficialShell>
    <section class="official-legal">
      <div class="official-legal-head">
        <span class="official-eyebrow">法律信息</span>
        <h1>使用前，<br /><em>先了解边界。</em></h1>
        <p>这里展示产品使用、隐私和内容来源相关的公开说明。正式上线前，文案需要经过审查并替换为最终版本。</p>
        <p v-if="loading" class="official-legal-status" aria-live="polite">正文加载中…</p>
        <p v-else-if="apiError" class="official-legal-status official-legal-status-error" role="status">正文接口暂不可用，当前展示内置公开说明</p>
      </div>
      <aside class="official-legal-menu">
        <button
          v-for="(label, key) in labels"
          :key="key"
          type="button"
          :class="{ 'is-active': tab === key }"
          @click="tab = key"
        >
          {{ label }}
        </button>
      </aside>
      <div class="official-legal-copy">
        <h2>{{ docs[tab].title }}</h2>
        <p v-for="(text, index) in docs[tab].paragraphs" :key="index">{{ text }}</p>
      </div>
    </section>
  </OfficialShell>
</template>
