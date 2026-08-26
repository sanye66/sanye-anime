<script setup lang="ts">
import { ref } from 'vue'
import { feedbackApi } from '@/api/feedback'

const feedbackType = ref('功能建议')
const description = ref('')
const contact = ref('')
const submitted = ref(false)
const submitting = ref(false)
const error = ref('')

/** 校验反馈正文后提交，并分别展示成功和失败状态。 */
async function submitFeedback() {
  if (!description.value.trim() || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await feedbackApi.submit({
      type: feedbackType.value,
      content: description.value.trim(),
      contact: contact.value.trim() || undefined,
    })
    submitted.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : '提交失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-stack narrow-page settings-page feedback-page">
    <section class="section-heading settings-page-heading"><div><RouterLink class="back-link" to="/mine">← 返回个人中心</RouterLink><span class="eyebrow">回声信箱</span><h2>问题反馈</h2><p>把你遇到的问题或想要的功能告诉我们。</p></div><span class="settings-seal feedback-seal" aria-hidden="true">⌁</span></section>
    <section v-if="!submitted" class="settings-form-panel feedback-form-panel"><div class="form-section-heading"><div><span class="eyebrow">你的留言</span><h3>写下这条回声</h3></div><span class="feedback-date">三叶 / 01</span></div><label class="form-field"><span>反馈类型</span><select v-model="feedbackType"><option>功能建议</option><option>使用问题</option><option>内容错误</option><option>其他反馈</option></select></label><label class="form-field"><span>问题描述</span><textarea v-model="description" rows="7" maxlength="500" placeholder="请描述你遇到的情况，或告诉我们你希望增加什么功能"></textarea><small>{{ description.length }} / 500</small></label><label class="form-field"><span>联系方式 <em>选填</em></span><input v-model="contact" type="text" placeholder="邮箱或其他联系方式" /></label><div class="feedback-privacy"><span class="note-mark">◇</span><p>反馈只用于改进产品。请不要填写密码、API 密钥等敏感信息。</p></div><p v-if="error" class="feedback-error" role="alert">{{ error }}</p><div class="form-actions"><button class="secondary-button" type="button" @click="$router.push('/mine')">取消</button><button class="primary-button" type="button" :disabled="!description.trim() || submitting" @click="submitFeedback">{{ submitting ? '发送中…' : '发送反馈' }}</button></div></section>
    <section v-else class="feedback-success"><div class="success-orbit"><span>三</span></div><span class="eyebrow">已收到回声</span><h3>你的回声已经被听见。</h3><p>感谢你的反馈。我们会把这条记录带回宫水神社的工作台。</p><RouterLink class="primary-button" to="/mine">返回个人中心</RouterLink></section>
  </div>
</template>
