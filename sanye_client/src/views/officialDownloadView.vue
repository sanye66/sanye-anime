<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import OfficialShell from '@/components/officialShell.vue'

const notice = ref('')

/** 展示当前安装包发布状态，并在短暂提示后自动清除。 */
function showPackageStatus() {
  notice.value = '桌面安装包尚未发布，当前可直接体验网页版客户端原型。'
  window.setTimeout(() => {
    notice.value = ''
  }, 2600)
}
</script>

<template>
  <OfficialShell>
    <section class="official-download-hero">
      <div>
        <RouterLink class="official-back" to="/official">← 返回官网首页</RouterLink>
        <span class="official-eyebrow">sanye_anime / 电脑客户端</span>
        <h1>让每一次打开，<br /><em>都像看见黄昏。</em></h1>
        <p>这里是 sanye_anime 的 PC 客户端入口。当前网页端已可直接体验全部页面交互。</p>
        <div class="official-actions">
          <RouterLink class="official-primary" to="/">直接体验客户端 →</RouterLink>
          <button class="official-text-link" type="button" @click="showPackageStatus">查看安装包状态</button>
        </div>
        <p v-if="notice" class="official-toast" role="status">{{ notice }}</p>
      </div>
      <div class="official-download-visual" aria-hidden="true">
        <span class="official-meteor-line"></span>
        <strong>三</strong>
        <small>宫水三叶<br />资料档案</small>
      </div>
    </section>
    <section class="official-status">
      <div>
        <span class="official-eyebrow">当前版本</span>
        <h3>交互原型 0.1.0</h3>
        <p>网页端已可直接打开；Windows、macOS 安装包将在正式开发与签名完成后提供。</p>
      </div>
      <span class="official-status-badge">静态演示版</span>
    </section>
  </OfficialShell>
</template>
