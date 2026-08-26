<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminAuthApi } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const username = ref('admin')
const password = ref('')
const loading = ref(false)
const error = ref('')

/** 校验登录表单，交换 RuoYi token 并返回用户原目标页。 */
async function submit() {
  if (!username.value.trim() || !password.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await adminAuthApi.login(username.value.trim(), password.value)
    auth.setSession(result.token, '')
    const redirect = String(route.query.redirect ?? '/dashboard')
    void router.push(redirect)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败，请检查账号密码'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-view">
    <section class="login-card">
      <span class="brand-mark">三</span>
      <span class="header-kicker">sanye_anime 运营管理平台</span>
      <h1>登录管理平台</h1>
      <form class="login-form" @submit.prevent="void submit()">
        <label>
          <span>账号</span>
          <input v-model="username" autocomplete="username" aria-label="账号" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" aria-label="密码" />
        </label>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        <el-button type="primary" native-type="submit" :loading="loading">登录</el-button>
      </form>
    </section>
  </div>
</template>
