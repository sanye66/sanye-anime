<script setup lang="ts">
import { ref } from 'vue'

const modelName = ref('sanye-anime-chat')
const endpoint = ref('https://api.example.com/v1')
const apiKey = ref('')
const temperature = ref(0.7)
const contextLength = ref('8192')
const saved = ref(false)

function saveConfig() {
  saved.value = true
  window.setTimeout(() => {
    saved.value = false
  }, 2400)
}
</script>

<template>
  <div class="page-stack narrow-page settings-page">
    <section class="section-heading settings-page-heading"><div><RouterLink class="back-link" to="/mine">← 返回个人中心</RouterLink><span class="eyebrow">AI 对话设置</span><h2>模型配置</h2><p>为三叶的 AI 对话选择模型和回答偏好。</p></div><span class="settings-seal" aria-hidden="true">三</span></section>
    <section class="settings-form-panel">
      <div class="settings-form-section"><div class="form-section-heading"><div><span class="eyebrow">连接设置</span><h3>模型服务</h3></div><span class="connection-state"><i></i>未连接</span></div><label class="form-field"><span>模型名称</span><input v-model="modelName" type="text" placeholder="输入模型名称" /></label><label class="form-field"><span>服务地址</span><input v-model="endpoint" type="url" placeholder="输入模型服务地址" /></label><label class="form-field"><span>API 密钥</span><input v-model="apiKey" type="password" placeholder="仅用于本地预览，不会上传" /></label><small class="field-note">当前为客户端原型配置，保存后仅保留在当前页面。</small></div>
      <div class="settings-form-section"><div class="form-section-heading"><div><span class="eyebrow">回答风格</span><h3>回答偏好</h3></div></div><label class="form-field slider-field"><span>创造性 <output>{{ temperature.toFixed(1) }}</output></span><input v-model="temperature" type="range" min="0" max="1" step="0.1" /></label><label class="form-field"><span>上下文长度</span><select v-model="contextLength"><option value="4096">4,096 个词元</option><option value="8192">8,192 个词元</option><option value="16384">16,384 个词元</option></select></label><div class="preference-note"><span class="note-mark">✦</span><div><strong>三叶的对话会记住什么？</strong><p>上下文越长，AI 越能理解当前对话；模型服务仍需在后续开发阶段接入。</p></div></div></div>
      <div class="form-actions"><button class="secondary-button" type="button" @click="$router.push('/mine')">取消</button><button class="primary-button" type="button" @click="saveConfig">保存配置</button></div>
      <p v-if="saved" class="form-success" role="status">模型配置已保存到当前预览。</p>
    </section>
  </div>
</template>
