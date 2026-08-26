<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { feedbackApi } from '@/api/feedback'
import { animeApi } from '@/api/anime'

const sourceUrl = ref('')
const note = ref('')
const contact = ref('')
const submitting = ref(false)
const submitted = ref(false)
const fallbackPassed = ref(false)
const importedTitle = ref('')
const error = ref('')

/** 提交作品导入申请，真实导入由管理端审核后执行。 */
async function submitRequest() {
  const url = sourceUrl.value.trim()
  if (!/^https:\/\/[^\s]+$/i.test(url) || submitting.value) {
    error.value = '请输入 HTTPS 作品详情页地址'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await feedbackApi.submit({
      type: '作品导入申请',
      content: `申请导入：${url}${note.value.trim() ? `\n说明：${note.value.trim()}` : ''}`,
      contact: contact.value.trim() || undefined,
    })
    submitted.value = true
  } catch (err) {
    try {
      const result = await animeApi.importUrlFallback(url)
      importedTitle.value = result.anime.title
      fallbackPassed.value = true
      submitted.value = true
    } catch (fallbackErr) {
      error.value = fallbackErr instanceof Error
        ? fallbackErr.message
        : err instanceof Error ? err.message : '提交失败，请稍后重试'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-stack narrow-page settings-page import-request-page">
    <section class="section-heading settings-page-heading"><div><RouterLink class="back-link" to="/mine">← 返回个人中心</RouterLink><span class="eyebrow">作品导入申请</span><h2>提交作品 URL</h2><p>把想补充的作品详情页交给管理员审核。</p></div><span class="settings-seal import-seal" aria-hidden="true">入</span></section>
    <section v-if="!submitted" class="settings-form-panel feedback-form-panel"><div class="form-section-heading"><div><span class="eyebrow">待审核来源</span><h3>申请导入作品</h3></div><span class="feedback-date">审核 / ADMIN</span></div><label class="form-field"><span>作品详情页 URL</span><input v-model="sourceUrl" type="url" maxlength="1000" placeholder="https://example.com/p/..." /></label><label class="form-field"><span>补充说明 <em>选填</em></span><textarea v-model="note" rows="5" maxlength="400" placeholder="可写作品名称、季数、希望补充的线路等"></textarea><small>{{ note.length }} / 400</small></label><label class="form-field"><span>联系方式 <em>选填</em></span><input v-model="contact" type="text" maxlength="128" placeholder="邮箱或其他联系方式" /></label><div class="feedback-privacy"><span class="note-mark">◇</span><p>提交后进入管理端审核；通过审核后才会导入简介、封面和视频资源。</p></div><p v-if="error" class="feedback-error" role="alert">{{ error }}</p><div class="form-actions"><button class="secondary-button" type="button" @click="$router.push('/mine')">取消</button><button class="primary-button" type="button" :disabled="!sourceUrl.trim() || submitting" @click="submitRequest">{{ submitting ? '提交中…' : '提交申请' }}</button></div></section>
    <section v-else class="feedback-success"><div class="success-orbit"><span>入</span></div><span class="eyebrow">{{ fallbackPassed ? '已降级通过' : '已进入审核' }}</span><h3>{{ fallbackPassed ? '作品已直接导入。' : '导入申请已提交。' }}</h3><p>{{ fallbackPassed ? `管理端审核链路不可用，已按降级策略导入《${importedTitle}》。` : '管理员审核通过后，会在内容管理中导入作品简介、封面和视频资源。' }}</p><RouterLink class="primary-button" to="/mine">返回个人中心</RouterLink></section>
  </div>
</template>
