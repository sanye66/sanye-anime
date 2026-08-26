<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { aiApi, type SseEvent } from '@/api/ai'
import { animeCatalog, animeCatalogMap } from '@/data/animeCatalog'
import { useAuthStore } from '@/stores/auth'
import { useQuotaStore } from '@/stores/quota'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  recommendation?: string
  recommendations?: { animeId: number; title: string; reason: string }[]
  stopped?: boolean
  failed?: boolean
  serverId?: number
}

interface ChatItem {
  id: string
  title: string
  time: string
}

const LOCAL_SESSION_ID = 'local-demo'

const route = useRoute()
const auth = useAuthStore()
const quota = useQuotaStore()

const conversations = ref<ChatItem[]>([])
const activeId = ref<string | null>(null)
const messagesByChat = ref<Record<string, ChatMessage[]>>({})
const loadingList = ref(false)
const loadingMessages = ref(false)
const backendReady = ref(false)
const input = ref('')
const pending = ref(false)
const controller = ref<AbortController | null>(null)
const spoilerMode = ref<'SAFE' | 'ALLOW'>('SAFE')
const lastClientMessageId = ref('')
const lastAssistantMessageId = ref(0)

const activeMessages = computed(() => (activeId.value ? messagesByChat.value[activeId.value] ?? [] : []))
const contextAnimeId = computed(() => {
  const value = Number(route.query.animeId ?? route.query.anime ?? '')
  return Number.isFinite(value) && value > 0 ? value : undefined
})
const contextTitle = computed(() => String(route.query.animeTitle ?? ''))
const contextAnime = computed(() => {
  if (contextTitle.value) {
    return {
      title: contextTitle.value,
      meta: '来自作品详情',
      slug: String(contextAnimeId.value ?? ''),
    }
  }
  const slug = String(route.query.anime ?? '')
  return animeCatalogMap[slug]
})
const quotaNote = computed(() =>
  auth.loggedIn ? '已登录 · 每日 30 次' : `匿名体验 · 每日 5 次，剩余 ${quota.remaining}`,
)
const quotaExhausted = computed(() => !auth.loggedIn && quota.remaining <= 0)

/** 将 ISO 时间转换为会话列表使用的相对时间。 */
function formatTime(iso?: string): string {
  if (!iso) return '刚刚'
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '刚刚'
  const diff = Date.now() - time
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

/** 向当前会话追加一条本地消息，供流式事件即时刷新界面。 */
function addMessage(message: ChatMessage): void {
  if (!activeId.value) return
  const list = messagesByChat.value[activeId.value] ?? []
  list.push(message)
  messagesByChat.value[activeId.value] = list
}

/** 后端不可用时生成本地演示回复，保持 AI 页面可浏览。 */
function cannedReply(question: string): ChatMessage {
  const wantRecommend = question.includes('推荐') || question.includes('相似')
  if (wantRecommend) {
    const current = contextAnime.value
    const pool = animeCatalog.filter((item) => !current || item.slug !== current.slug)
    const pick = pool[0] ?? animeCatalog[0]
    return {
      role: 'assistant',
      text: `推荐理由：${pick.subtitle}。适合喜欢${pick.tags.slice(0, 2).join('、')}的作品。`,
      recommendation: `/anime/${pick.slug}`,
    }
  }
  if (contextAnime.value) {
    const item = contextAnime.value
    return {
      role: 'assistant',
      text:
        spoilerMode.value === 'ALLOW'
          ? `关于《${item.title}》：${'description' in item ? item.description : '这部作品很适合现在聊一聊。'}`
          : `关于《${item.title}》我可以在不剧透的范围内介绍故事开端。${'description' in item ? item.description.slice(0, 40) : ''}……`,
    }
  }
  return {
    role: 'assistant',
    text: '收到！你可以多告诉我一些偏好，比如题材、节奏或心情，我来帮你找更合适的作品。',
  }
}

/** 创建用于后端幂等去重的客户端消息编号。 */
function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 加载会话列表；接口失败时切换到本地演示会话。 */
async function loadConversations(): Promise<void> {
  loadingList.value = true
  try {
    const page = await aiApi.conversations({ page: 1, size: 50 })
    conversations.value = page.items.map((item) => ({
      id: String(item.id),
      title: item.title,
      time: formatTime(item.updatedAt),
    }))
    backendReady.value = true
    if (conversations.value.length > 0) {
      await openChat(conversations.value[0].id)
    } else {
      activeId.value = null
    }
  } catch {
    backendReady.value = false
    conversations.value = [{ id: LOCAL_SESSION_ID, title: '演示会话', time: '刚刚' }]
    activeId.value = LOCAL_SESSION_ID
    messagesByChat.value[LOCAL_SESSION_ID] = [
      { role: 'assistant', text: '当前服务未连接，以下是本地演示。你可以先体验界面，服务恢复后会自动切换。' },
    ]
  } finally {
    loadingList.value = false
  }
}

/** 打开会话并按需加载消息，避免重复请求已经缓存的会话。 */
async function openChat(id: string): Promise<void> {
  activeId.value = id
  if (id === LOCAL_SESSION_ID || !backendReady.value) return
  if (messagesByChat.value[id]) return
  loadingMessages.value = true
  try {
    const messages = await aiApi.messages(Number(id))
    messagesByChat.value[id] = messages.map((message) => ({
      role: message.role === 'USER' ? 'user' : 'assistant',
      text: message.content,
      recommendation:
        message.recommendations && message.recommendations.length > 0
          ? `/anime/${message.recommendations[0].animeId}`
          : undefined,
      recommendations: message.recommendations ?? undefined,
      stopped: message.status === 'STOPPED',
      serverId: message.id,
    }))
  } catch {
    messagesByChat.value[id] = []
  } finally {
    loadingMessages.value = false
  }
}

/** 创建服务端会话，服务不可用时创建本地演示会话。 */
async function newChat(): Promise<void> {
  if (backendReady.value) {
    try {
      const conversation = await aiApi.createConversation({
        title: '新会话',
        spoilerMode: spoilerMode.value,
        contextAnimeId: contextAnimeId.value,
      })
      conversations.value.unshift({
        id: String(conversation.id),
        title: conversation.title,
        time: '刚刚',
      })
      activeId.value = String(conversation.id)
      messagesByChat.value[String(conversation.id)] = [
        { role: 'assistant', text: '新会话已准备好。你可以告诉我一部作品、一个角色，或者你现在想看的感觉。' },
      ]
      return
    } catch {
      // 后端不可用时降级为本地会话
    }
  }
  const id = `chat-${Date.now().toString(36)}`
  conversations.value.unshift({ id, title: '新会话', time: '现在' })
  activeId.value = id
  messagesByChat.value[id] = [
    { role: 'assistant', text: '新会话已准备好。你可以告诉我一部作品、一个角色，或者你现在想看的感觉。' },
  ]
}

/** 删除服务端会话或本地演示会话，并选择新的活动会话。 */
async function deleteChat(id: string): Promise<void> {
  if (!backendReady.value || id === LOCAL_SESSION_ID) return
  try {
    await aiApi.deleteConversation(Number(id))
  } catch {
    return
  }
  conversations.value = conversations.value.filter((item) => item.id !== id)
  delete messagesByChat.value[id]
  if (activeId.value === id) {
    const next = conversations.value[0]
    if (next) {
      await openChat(next.id)
    } else {
      activeId.value = null
    }
  }
}

/** 清理生成中的请求控制器和输入状态。 */
function finish(): void {
  pending.value = false
  controller.value = null
}

/** 校验额度和输入后发送消息，并处理完整 SSE 生命周期。 */
async function send(): Promise<void> {
  const text = input.value.trim()
  if (!text || pending.value || quotaExhausted.value) return
  if (!activeId.value) {
    await newChat()
    if (!activeId.value) return
  }
  const clientMessageId = createClientMessageId()
  lastClientMessageId.value = clientMessageId
  lastAssistantMessageId.value = 0
  addMessage({ role: 'user', text })
  input.value = ''
  quota.consume()
  pending.value = true
  controller.value = new AbortController()

  if (!backendReady.value || activeId.value === LOCAL_SESSION_ID) {
    window.setTimeout(() => {
      addMessage(cannedReply(text))
      finish()
    }, 600)
    return
  }

  let assistantAdded = false
  let emittedAny = false
  let pendingRecommendations: { animeId: number; title: string; reason: string }[] = []

  // 根据服务端消息编号查找或创建助手消息，兼容网络分片导致的事件先后变化。
  function ensureAssistantMessage(serverId = 0): ChatMessage {
    const messages = activeMessages.value
    const existing = messages.find((message) => message.role === 'assistant' && (!serverId || message.serverId === serverId))
    if (existing) return existing
    const message: ChatMessage = {
      role: 'assistant',
      text: '',
      serverId: serverId || undefined,
      recommendations: pendingRecommendations.length ? pendingRecommendations : undefined,
      recommendation: pendingRecommendations.length ? `/anime/${pendingRecommendations[0].animeId}` : undefined,
    }
    addMessage(message)
    assistantAdded = true
    return message
  }

  try {
    await aiApi.sendMessage(
      Number(activeId.value),
      { content: text, clientMessageId, spoilerMode: spoilerMode.value },
      {
        onEvent: (event: SseEvent) => {
          emittedAny = true
          if (event.event === 'message.accepted') {
            lastAssistantMessageId.value = Number(event.data.messageId ?? 0)
            ensureAssistantMessage(lastAssistantMessageId.value)
          } else if (event.event === 'message.delta') {
            const delta = String(event.data.delta ?? '')
            const messageId = Number(event.data.messageId ?? lastAssistantMessageId.value)
            lastAssistantMessageId.value = messageId || lastAssistantMessageId.value
            ensureAssistantMessage(lastAssistantMessageId.value).text += delta
          } else if (event.event === 'recommendation') {
            const recommendations = (event.data.recommendations as Array<{ animeId: number; title: string; reason: string }> | undefined) ?? []
            if (recommendations.length > 0) {
              pendingRecommendations = recommendations
              const messageId = Number(event.data.messageId ?? lastAssistantMessageId.value)
              const assistant = ensureAssistantMessage(messageId)
              assistant.recommendations = recommendations
              assistant.recommendation = `/anime/${recommendations[0].animeId}`
            }
          } else if (event.event === 'message.completed') {
            // 完成事件可能没有正文增量（例如幂等重放），保留可见的收敛状态。
            const messageId = Number(event.data.messageId ?? lastAssistantMessageId.value)
            const assistant = ensureAssistantMessage(messageId)
            if (!assistant.text && !assistant.failed) assistant.text = '回答已完成。'
            finish()
            void quota.refresh()
          } else if (event.event === 'message.failed') {
            const reason = String(event.data.reason ?? 'AI 服务暂不可用，请稍后重试')
            const messages = activeMessages.value
            const last = messages[messages.length - 1]
            if (last && last.role === 'assistant' && last.text === '' && !assistantAdded) {
              messages.pop()
            }
            addMessage({ role: 'assistant', text: reason, failed: true })
            finish()
            void quota.refresh()
          } else if (event.event === 'message.stopped') {
            const messages = activeMessages.value
            const last = messages[messages.length - 1]
            if (last && last.role === 'assistant') {
              last.stopped = true
              if (!last.text) last.text = '回答已停止生成。'
            }
            finish()
          }
        },
        onDone: finish,
        onError: () => {
          finish()
          if (!emittedAny) {
            addMessage(cannedReply(text))
          } else {
            const messages = activeMessages.value
            const last = messages[messages.length - 1]
            if (last && last.role === 'assistant' && last.text === '') {
              last.text = '回答已中断，请重试。'
            }
          }
          void quota.refresh()
        },
      },
      controller.value.signal,
    )
  } catch {
    finish()
    addMessage(cannedReply(text))
    void quota.refresh()
  }
  if (pending.value) finish()
}

/** 主动中止当前 SSE 请求，并将助手消息标记为已停止。 */
function stop(): void {
  controller.value?.abort()
  if (lastAssistantMessageId.value > 0) {
    void aiApi.stop(lastAssistantMessageId.value).catch(() => undefined)
  }
  const messages = activeMessages.value
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant' && !last.failed) {
    last.stopped = true
    if (!last.text) last.text = '回答已停止生成。'
  }
  finish()
}

onMounted(() => {
  const question = route.query.question
  if (typeof question === 'string') input.value = question.slice(0, 120)
  void quota.refresh()
  void loadConversations()
})

// 离开 AI 页面时中止仍在生成的流，避免后台持续占用连接和主线程。
onBeforeUnmount(() => controller.value?.abort())
</script>

<template>
  <div class="ai-layout">
    <aside class="conversation-list">
      <div class="section-heading compact">
        <div><span class="eyebrow">你的空间</span><h2>会话</h2></div>
        <button class="icon-button" type="button" aria-label="新建会话" @click="void newChat()">＋</button>
      </div>
      <button class="new-chat-button" type="button" @click="void newChat()">＋ 新建会话</button>
      <div v-if="loadingList" class="conversation-empty">正在加载会话…</div>
      <div v-else-if="conversations.length === 0" class="conversation-empty">还没有会话，点击上方按钮开始。</div>
      <div v-else class="conversation-group">
        <div v-for="item in conversations" :key="item.id" class="conversation-item-wrap">
          <button
            class="conversation-item"
            :class="{ active: activeId === item.id }"
            type="button"
            @click="void openChat(item.id)"
          >
            <span>{{ item.title }}</span>
            <small>{{ item.time }}</small>
          </button>
          <button
            v-if="backendReady && item.id !== LOCAL_SESSION_ID"
            class="conversation-delete"
            type="button"
            aria-label="删除会话"
            title="删除会话"
            @click.stop="void deleteChat(item.id)"
          >
            ×
          </button>
        </div>
      </div>
    </aside>

    <section class="chat-panel">
      <header class="chat-header">
        <div>
          <span class="eyebrow">当前会话</span>
          <h2>{{ conversations.find((item) => item.id === activeId)?.title ?? 'AI 动漫助手' }}</h2>
        </div>
        <div class="chat-top-actions">
          <button
            class="spoiler-toggle"
            type="button"
            :class="{ 'is-active': spoilerMode === 'ALLOW' }"
            :aria-pressed="spoilerMode === 'ALLOW'"
            @click="spoilerMode = spoilerMode === 'SAFE' ? 'ALLOW' : 'SAFE'"
          >
            {{ spoilerMode === 'SAFE' ? '避免剧透' : '允许剧透' }}
          </button>
          <button v-if="pending" class="stop-button" type="button" @click="stop">停止</button>
        </div>
      </header>

      <div class="chat-messages">
        <div v-if="loadingMessages" class="message-row assistant">
          <div class="message-bubble pending-bubble"><span class="typing-dots"><i></i><i></i><i></i></span></div>
        </div>
        <div
          v-for="(message, index) in activeMessages"
          :key="index"
          class="message-row"
          :class="message.role"
        >
          <div class="message-bubble">
            <span class="message-name">{{ message.role === 'assistant' ? '三叶助手' : '你' }}</span>
            <p :class="{ 'message-failed': message.failed }">{{ message.text }}</p>
            <div v-if="message.recommendations && message.recommendations.length" class="message-recommendations">
              <RouterLink
                v-for="rec in message.recommendations"
                :key="rec.animeId"
                class="message-recommendation"
                :to="`/anime/${rec.animeId}`"
              >
                <strong>{{ rec.title }}</strong>
                <small>{{ rec.reason }}</small>
              </RouterLink>
            </div>
            <RouterLink v-if="message.recommendation" class="message-recommendation" :to="message.recommendation">
              查看推荐作品 →
            </RouterLink>
            <small v-if="message.stopped" class="message-stopped-note">已停止生成</small>
          </div>
        </div>
        <div v-if="pending" class="message-row assistant">
          <div class="message-bubble pending-bubble">
            <span class="message-name">三叶助手</span>
            <span class="typing-dots"><i></i><i></i><i></i></span>
          </div>
        </div>
      </div>

      <form class="chat-input" @submit.prevent="void send()">
        <input v-model="input" aria-label="询问 AI 助手" placeholder="问问关于动漫的任何事……" :disabled="pending || quotaExhausted" />
        <button class="send-button" type="submit" :disabled="pending || quotaExhausted || !input.trim()">发送</button>
      </form>
    </section>

    <aside class="context-panel">
      <span class="eyebrow">当前上下文</span>
      <div v-if="contextAnime" class="context-anime">
        <strong>{{ contextAnime.title }}</strong>
        <small>{{ contextAnime.meta }}</small>
        <RouterLink class="text-button" :to="`/anime/${contextAnime.slug || contextAnimeId}`">查看详情 →</RouterLink>
      </div>
      <div v-else class="context-anime">
        <strong>尚未选择作品</strong>
        <small>打开作品详情页后，故事脉络会显示在对话旁边。</small>
      </div>
      <div class="quota-note" :class="{ 'is-exhausted': quotaExhausted }">
        <strong>{{ quotaNote }}</strong>
        <small v-if="quotaExhausted">今日匿名额度已用完，登录后每日可使用 30 次。</small>
      </div>
      <button v-if="quotaExhausted" class="primary-button login-guide" type="button" @click="auth.loginRedirect()">
        登录继续体验
      </button>
      <p v-if="!auth.loggedIn && !quotaExhausted" class="context-note">
        匿名体验限制每日 5 次；登录后同步收藏与历史。
      </p>
    </aside>
  </div>
</template>
