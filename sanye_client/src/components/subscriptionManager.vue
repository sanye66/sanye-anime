<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { subscriptionState, subscriptionRequests, subscriptionNeedsRefresh, subscriptionChoices, refreshSubscription, selectSubscription, removeSubscription, addSitePreset } from '../subscriptions'
const props = defineProps<{ android?: boolean }>()
function sourceReady(source: { factoryId: string; version: number }) { return source.factoryId === 'web-selector' && source.version === 2 }
function sourceSummary(item: { sources: { factoryId: string; version: number; retired?: boolean; provisional?: boolean }[] }) {
  const sources = item.sources.filter(source => !source.retired)
  if (sources.some(source => source.factoryId === 'sanye-pending')) return '网页已导入 · 规则待识别'
  if (sources.some(source => source.provisional)) return '通用网页规则 · 待验证'
  const ready = sources.filter(sourceReady).length
  return `${sources.length} 个来源 · ${ready ? `${ready} 个可用于搜索` : '规则暂不支持'}`
}
const address = ref('')
const name = ref('')
const busy = ref(false)
const error = ref('')
const opened = ref(false)
const adding = ref(false)
const pendingDelete = ref('')
let selectionIntent = 0
const selecting = ref('')
function autoRefresh() {
  if (!props.android) return
  for (const item of subscriptionState.value.items) {
    if (subscriptionNeedsRefresh(item)) void refreshSubscription(item.url).catch(() => {})
  }
}
onMounted(autoRefresh)
watch(opened, value => {
  if (value) autoRefresh()
})
function domain(url: string) { try { return new URL(url).hostname } catch { return url } }
async function refresh(url: string, label?: string, add = false) {
  if (!add) { try { await refreshSubscription(url) } catch {} return }
  if (busy.value) return
  busy.value = true; error.value = ''
  try { if (!addSitePreset(url, label)) await refreshSubscription(url, label); address.value = ''; name.value = ''; adding.value = false }
  catch (cause) { error.value = subscriptionRequests.value[url]?.error
    || (cause instanceof Error && /^(订阅地址不正确|请填写以 https:\/\/)/.test(cause.message) ? cause.message : '订阅加载失败，请重试。原订阅未改变。') }
  finally { busy.value = false }
}
async function select(url: string, sourceIndex?: number) {
  const intent = ++selectionIntent
  selecting.value = url
  try {
    selectSubscription(url, sourceIndex)
    error.value = ''
    // 选择立即生效；网络刷新放到后台，不阻塞下一次点击。
    const item = subscriptionState.value.items.find(entry => entry.url === url)
    if (item && subscriptionNeedsRefresh(item)) void refreshSubscription(url).catch(() => {})
  } catch { if (intent === selectionIntent) error.value = '订阅不可用。' }
  finally { if (intent === selectionIntent) selecting.value = '' }
}
function remove(url: string) {
  if (pendingDelete.value !== url) { pendingDelete.value = url; return }
  try { removeSubscription(url); error.value = '' } catch { error.value = '删除失败，请重试。订阅未删除。' }
  pendingDelete.value = ''
}
</script>
<template>
  <section class="subscription-manager" :class="{ 'subscription-manager--android': android }" aria-label="来源订阅">
    <button v-if="!android" class="subscription-entry" type="button" :aria-expanded="opened" @click="opened = !opened">
      <span><strong>来源订阅</strong><small>{{ subscriptionState.items.find(item => item.url === subscriptionState.active)?.name || '已有来源' }} · 管理订阅</small></span>
      <span aria-hidden="true">{{ opened ? '−' : '›' }}</span>
    </button>
    <div v-if="opened || android" class="subscription-content">
    <header class="subscription-heading"><component :is="android ? 'h2' : 'h3'">我的订阅</component><button type="button" :aria-expanded="adding" @click="adding = !adding">{{ adding ? '取消' : '添加订阅' }}</button></header>
    <p v-if="!android" class="subscription-note">选择后立即用于搜索和播放。</p>
    <form v-if="adding" @submit.prevent="refresh(address, name, true)">
      <label>订阅名称<input v-model="name" maxlength="80" placeholder="选填" :disabled="busy" /></label>
      <label>订阅地址<input v-model="address" type="url" required placeholder="https://…/subscription.json" :disabled="busy" /></label>
      <button type="submit" :disabled="busy">{{ busy ? '正在添加…' : '保存订阅' }}</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="button" :disabled="busy" :aria-pressed="!subscriptionState.active" @click="select('')">{{ android ? '樱花动漫' : '使用已有来源' }}</button>
    <ul>
      <li v-for="item in subscriptionState.items" :key="item.url" :aria-busy="subscriptionRequests[item.url]?.loading || false">
        <div class="subscription-item-heading"><strong>{{ item.name }}</strong><small v-if="!android && subscriptionState.active === item.url" class="subscription-badge">已选订阅</small></div>
        <span v-if="!android" class="subscription-domain">{{ domain(item.url) }}</span>
        <small>{{ item.updatedAt ? sourceSummary(item) : '待读取' }}</small>
        <button v-if="!android" class="subscription-select" type="button" :disabled="busy" :aria-pressed="subscriptionState.active === item.url" @click="select(item.url)">{{ subscriptionState.active === item.url ? '已选择' : '选择订阅' }}</button>
        <div v-if="android" class="subscription-source-list">
          <button v-for="source in subscriptionChoices().filter(source => source.url === item.url)" :key="source.sourceIndex" type="button" :disabled="busy" :aria-pressed="subscriptionState.active === source.url && subscriptionState.activeSourceIndex === source.sourceIndex" @click="select(source.url, source.sourceIndex)">{{ source.name }} <small v-if="source.recommended" class="subscription-recommended">推荐</small>{{ subscriptionState.active === source.url && subscriptionState.activeSourceIndex === source.sourceIndex ? ' · 已选择' : '' }}</button>
        </div>
        <small v-if="subscriptionRequests[item.url]?.loading" role="status">更新中</small>
        <p v-if="subscriptionRequests[item.url]?.error && subscriptionState.active === item.url" role="alert">读取失败，仍使用当前缓存</p>
        <details v-if="!android"><summary>更多</summary>
          <p class="subscription-url">{{ item.url }}</p>
          <ul v-if="item.sources.some(source => !source.retired)"><li v-for="(source, index) in item.sources.filter(source => !source.retired)" :key="index">{{ source.name }}<small>{{ sourceReady(source) ? '网页播放来源' : '不可用' }}</small></li></ul>
        <div class="subscription-actions">
          <button type="button" :disabled="busy || subscriptionRequests[item.url]?.loading" @click="refresh(item.url)">刷新</button>
          <button type="button" :disabled="busy || subscriptionRequests[item.url]?.loading" @click="remove(item.url)">{{ pendingDelete === item.url ? '确认删除' : '删除' }}</button>
          <button v-if="pendingDelete === item.url" type="button" @click="pendingDelete = ''">取消</button>
        </div>
        <p v-if="pendingDelete === item.url" class="subscription-note">删除后需重新添加。删除已选订阅会恢复已有来源。</p>
        </details>
      </li>
    </ul>
    </div>
  </section>
</template>
<style scoped>
.subscription-manager { margin-block: 16px; color: inherit; --subscription-line: var(--app-border, var(--sanye-line)); --subscription-muted: var(--app-muted, var(--sanye-muted)); }
button, input { font: inherit; box-sizing: border-box; }
button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--subscription-line); border-radius: 8px; background: transparent; color: inherit; box-shadow: none; cursor: pointer; }
.subscription-entry { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; padding: 16px 0; border: 0; border-block: 1px solid var(--subscription-line); border-radius: 0; text-align: left; }
.subscription-entry > span:first-child { display: grid; gap: 4px; min-width: 0; }
.subscription-entry strong { font-size: 15px; font-weight: 600; }
.subscription-entry > span:last-child { font-size: 22px; }
.subscription-content { padding-block: 20px 4px; }
.subscription-heading, .subscription-item-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h2, h3 { margin: 0; font-size: 18px; } p, small { font-size: 13px; line-height: 1.65; } small, .subscription-note, .subscription-domain { color: var(--subscription-muted); }
.subscription-note { max-width: 60ch; margin-block: 12px 16px; }
form, label { display: grid; gap: 8px; } form { gap: 12px; margin-block: 16px 24px; max-width: 560px; }
input { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; border: 1px solid var(--subscription-line); border-radius: 8px; background: transparent; color: inherit; }
ul { list-style: none; margin: 16px 0 0; padding: 0; } li { display: grid; gap: 6px; padding: 18px 0; border-top: 1px solid var(--subscription-line); }
.subscription-domain, .subscription-url { overflow-wrap: anywhere; font-size: 12px; }
.subscription-badge { padding: 2px 7px; border: 1px solid var(--subscription-line); border-radius: 4px; }
.subscription-select { justify-self: start; margin-top: 4px; }
button[type=submit], button[aria-pressed=true] { background: var(--brand-lime, var(--client-accent)); color: var(--brand-ink, var(--client-accent-ink)); }
button:disabled { opacity: .55; cursor: default; }
:is(button, input, summary):focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
summary { padding-block: 10px; min-height: 44px; box-sizing: border-box; cursor: pointer; font-size: 13px; }
.subscription-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; } details ul { margin: 8px 0; }
.subscription-manager--android .subscription-entry { padding-block: 10px; }
.subscription-manager--android .subscription-content { padding-top: 12px; }
.subscription-manager--android > .subscription-content > ul > li { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding-block: 12px; }
.subscription-manager--android .subscription-item-heading { grid-column: 1; }
.subscription-manager--android .subscription-select { grid-column: 2; grid-row: 1 / 4; align-self: center; margin: 0; min-width: 76px; }
.subscription-manager--android details, .subscription-manager--android li > p, .subscription-manager--android li > small[role=status] { grid-column: 1 / -1; }
.subscription-manager--android .subscription-domain { font-size: 11px; }
.subscription-source-list { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
.subscription-source-list button { text-align: left; }
.subscription-recommended { display: inline-block; margin-inline: 4px; padding: 1px 6px; border: 1px solid currentColor; border-radius: 999px; color: var(--page-accent, var(--brand-lime)); font-size: 11px; line-height: 1.5; }
button[aria-pressed=true] .subscription-recommended { color: inherit; }
</style>
