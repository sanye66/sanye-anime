<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { aiApi, type AiModelInfo } from '@/api/ai'

const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saveError = ref(false)
const saved = ref(false)

const modelInfo = ref<AiModelInfo | null>(null)
const temperature = ref(0.7)
const contextLength = ref<'' | '4096' | '8192' | '16384'>('')

/** 并行读取服务端模型信息和当前归属人的偏好。 */
async function loadConfig() {
  loading.value = true
  loadError.value = false
  try {
    const [info, preference] = await Promise.all([aiApi.modelInfo(), aiApi.preferences()])
    modelInfo.value = info
    temperature.value = preference.temperature ?? info.temperature
    contextLength.value =
      preference.contextLength == null ? '' : (String(preference.contextLength) as '' | '4096' | '8192' | '16384')
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

/** 将页面选择转换为后端类型并保存，成功后刷新提示状态。 */
async function saveConfig() {
  saving.value = true
  saveError.value = false
  saved.value = false
  try {
    await aiApi.savePreferences({
      temperature: temperature.value,
      contextLength: contextLength.value === '' ? null : Number(contextLength.value),
    })
    saved.value = true
    window.setTimeout(() => {
      saved.value = false
    }, 2400)
  } catch {
    saveError.value = true
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadConfig()
})
</script>

<template>
  <div class="page-stack narrow-page settings-page">
    <section class="section-heading settings-page-heading"><div><RouterLink class="back-link" to="/mine">← 返回个人中心</RouterLink><span class="eyebrow">AI 对话设置</span><h2>模型配置</h2><p>查看服务端模型状态，为三叶的 AI 对话选择回答偏好。</p></div><span class="settings-seal" aria-hidden="true">三</span></section>

    <div v-if="loading" class="settings-status-hint" aria-live="polite">模型配置加载中…</div>
    <div v-else-if="loadError" class="settings-status-hint settings-status-error" role="status">
      模型配置接口暂不可用，请稍后重试
      <button class="settings-retry" type="button" @click="loadConfig">重试</button>
    </div>

    <template v-else-if="modelInfo">
      <section class="settings-form-panel">
        <div class="settings-form-section">
          <div class="form-section-heading"><div><span class="eyebrow">连接设置</span><h3>模型服务</h3></div><span class="connection-state connection-online"><i></i>已连接</span></div>
          <div class="model-status-grid">
            <div class="model-status-item"><span>模型提供方</span><strong>{{ modelInfo.providerLabel }}</strong></div>
            <div class="model-status-item"><span>当前模型</span><strong>{{ modelInfo.model }}</strong></div>
            <div class="model-status-item"><span>服务端温度</span><strong>{{ modelInfo.temperature.toFixed(1) }}</strong></div>
            <div class="model-status-item"><span>会话记忆</span><strong>{{ modelInfo.memoryLabel }}</strong></div>
            <div class="model-status-item"><span>检索增强（RAG）</span><strong>{{ modelInfo.ragEnabled ? '已启用' : '未启用' }}</strong></div>
            <div class="model-status-item"><span>剧透安全规则</span><strong>{{ modelInfo.safetyEnabled ? '已启用' : '未启用' }}</strong></div>
          </div>
          <small class="field-note">模型服务与密钥由服务端运维配置，客户端不保存任何模型凭证。</small>
        </div>
        <div class="settings-form-section">
          <div class="form-section-heading"><div><span class="eyebrow">回答风格</span><h3>回答偏好</h3></div></div>
          <label class="form-field slider-field"><span>创造性 <output>{{ temperature.toFixed(1) }}</output></span><input v-model.number="temperature" type="range" min="0" max="1" step="0.1" /></label>
          <label class="form-field"><span>上下文长度</span><select v-model="contextLength"><option value="">跟随服务端默认</option><option value="4096">4,096 个词元（记忆 10 条）</option><option value="8192">8,192 个词元（记忆 20 条）</option><option value="16384">16,384 个词元（记忆 30 条）</option></select></label>
          <div class="preference-note"><span class="note-mark">✦</span><div><strong>三叶的对话会记住什么？</strong><p>上下文长度决定 AI 会话的记忆窗口：越长越能理解当前对话；偏好按设备保存，并随你的账号一起迁移。</p></div></div>
        </div>
        <div class="form-actions"><button class="secondary-button" type="button" @click="$router.push('/mine')">取消</button><button class="primary-button" type="button" :disabled="saving" @click="saveConfig">{{ saving ? '保存中…' : '保存配置' }}</button></div>
        <p v-if="saved" class="form-success" role="status">回答偏好已保存，AI 会话将按新设置生效。</p>
        <p v-else-if="saveError" class="form-error" role="alert">保存失败，请稍后重试。</p>
      </section>
    </template>
  </div>
</template>
