<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import MitsuhaPet, { type PetState } from '@/components/MitsuhaPet.vue'

type PetSettings = {
  scale: number
  opacity: number
  animation: boolean
  bubbles: boolean
  reminders: boolean
  quietStart: string
  quietEnd: string
  startOnBoot: boolean
}

const defaultSettings: PetSettings = {
  scale: 1,
  opacity: 1,
  animation: true,
  bubbles: true,
  reminders: false,
  quietStart: '22:00',
  quietEnd: '08:00',
  startOnBoot: false,
}

const state = ref<PetState>('idle')
const bubble = ref('')
const bubbleDismissed = ref(false)
const panelOpen = ref(false)
const menuOpen = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const offlineSim = ref(false)
const quickAskOpen = ref(false)
const quickQuestion = ref('')
const clientUrl = ref('http://localhost:5173')
const settingsOpen = ref(false)
const settings = reactive<PetSettings>({ ...defaultSettings })

let sleepTimer: ReturnType<typeof setTimeout> | undefined
let wakeTimer: ReturnType<typeof setTimeout> | undefined
let reminderTimer: ReturnType<typeof setTimeout> | undefined

const bubbleText = computed(() => {
  if (bubbleDismissed.value || !settings.bubbles) return ''
  if (offlineSim.value) return '暂时无法连接…'
  if (bubble.value) return bubble.value
  if (state.value === 'sleep') return ''
  if (state.value === 'attention') return '有什么想看的吗？'
  return '你好，我是三叶～'
})

/** 在桌宠空闲一段时间后进入睡眠，交互发生时由 wake 唤醒。 */
function scheduleSleep() {
  if (sleepTimer) clearTimeout(sleepTimer)
  if (offlineSim.value) return
  sleepTimer = setTimeout(() => {
    if (!panelOpen.value && !menuOpen.value && state.value !== 'dialogue' && !offlineSim.value) {
      state.value = 'sleep'
      return
    }
    scheduleSleep()
  }, 60_000)
}

/** 判断当前时间是否处于跨午夜也能正确处理的安静时段。 */
function isQuietTime() {
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const [startHour, startMinute] = settings.quietStart.split(':').map(Number)
  const [endHour, endMinute] = settings.quietEnd.split(':').map(Number)
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  return start <= end ? current >= start && current < end : current >= start || current < end
}

/** 按提醒开关和安静时段安排周期提醒。 */
function scheduleReminder() {
  if (reminderTimer) clearTimeout(reminderTimer)
  if (!settings.reminders || offlineSim.value) return
  reminderTimer = setTimeout(() => {
    if (!isQuietTime() && !panelOpen.value && !menuOpen.value && state.value !== 'sleep') {
      showBubble('想休息一下吗？最近的内容还在等你。')
      state.value = 'attention'
      window.setTimeout(() => {
        if (state.value === 'attention') state.value = 'idle'
      }, 3_000)
    }
    scheduleReminder()
  }, 30 * 60 * 1000)
}

/** 将桌宠设置交给宿主进程持久化，并重新计算提醒定时器。 */
function persistSettings() {
  void window.petApi?.setSettings({ ...settings })
  scheduleReminder()
}

/** 恢复默认设置并给出即时反馈。 */
function restoreSettings() {
  Object.assign(settings, defaultSettings)
  persistSettings()
  showBubble('设置已恢复默认')
}

/** 唤醒睡眠桌宠并重新安排空闲睡眠计时。 */
function wake() {
  if (state.value === 'sleep') {
    state.value = 'idle'
    bubble.value = '欢迎回来～'
    bubbleDismissed.value = false
  }
  scheduleSleep()
}

/** 打开绑定的客户端；浏览器预览没有 Electron IPC 时使用普通新窗口兜底。 */
async function openClient(path?: string) {
  state.value = 'dialogue'
  panelOpen.value = false
  quickAskOpen.value = false
  let result: { ok: boolean; reason?: string } | undefined
  if (window.petApi) {
    result = await window.petApi.openClient(path ?? '/')
  } else {
    try {
      const url = new URL(path ?? '/', clientUrl.value).toString()
      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      result = { ok: opened !== null }
    } catch (error) {
      result = { ok: false, reason: error instanceof Error ? error.message : '无法打开客户端' }
    }
  }
  if (result && !result.ok) {
    state.value = 'offline'
    showBubble('客户端暂时无法打开，请确认客户端地址。')
    return
  }
  window.setTimeout(() => {
    if (state.value === 'dialogue') state.value = offlineSim.value ? 'offline' : 'idle'
  }, 1_500)
}

/** 请求宿主隐藏桌宠窗口。 */
function hidePet() {
  window.petApi?.hide()
}

/** 展示限时气泡，并清理上一条气泡的计时器。 */
function showBubble(text: string) {
  if (!settings.bubbles) return
  bubbleDismissed.value = false
  bubble.value = text
  if (wakeTimer) clearTimeout(wakeTimer)
  wakeTimer = setTimeout(() => {
    bubble.value = ''
  }, 2600)
}

/** 点击空白区域关闭面板、菜单和当前气泡。 */
function onBlankClick() {
  panelOpen.value = false
  menuOpen.value = false
  quickAskOpen.value = false
  bubble.value = ''
  bubbleDismissed.value = true
  if (!offlineSim.value && state.value !== 'sleep') state.value = 'idle'
}

/** 处理桌宠单击，切换快捷面板或提示离线状态。 */
function onSingleClick() {
  // 拖动结束后 Electron 会继续派发 click，必须吞掉这次 click 避免误开面板。
  if (suppressClick) {
    suppressClick = false
    return
  }
  wake()
  bubbleDismissed.value = false
  if (state.value === 'offline') {
    showBubble('暂时无法连接，稍后再试试吧')
    return
  }
  panelOpen.value = !panelOpen.value
  quickAskOpen.value = false
  state.value = panelOpen.value ? 'attention' : 'idle'
  if (panelOpen.value) showBubble('找我有什么事吗？')
}

/** 双击直接打开客户端首页。 */
function onDoubleClick() {
  showBubble('回客户端看看吧～')
  void openClient('/')
}

/** 定位右键菜单并关闭其他浮层。 */
function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  wake()
  panelOpen.value = false
  quickAskOpen.value = false
  menuOpen.value = true
  menuX.value = Math.min(Math.max(8, e.clientX), window.innerWidth - 158)
  menuY.value = Math.min(Math.max(8, e.clientY), window.innerHeight - 278)
}

/** 执行右键菜单动作，包括打开、隐藏、置顶、离线模拟和退出。 */
function menuAction(action: string) {
  menuOpen.value = false
  if (action === 'client') void openClient('/')
  if (action === 'ai') void openClient('/ai')
  if (action === 'hide') window.petApi?.hide()
  if (action === 'top') window.petApi?.toggleTop()
  if (action === 'offline') {
    offlineSim.value = !offlineSim.value
    state.value = offlineSim.value ? 'offline' : 'idle'
    showBubble(offlineSim.value ? '模拟断网：暂时无法连接' : '网络已恢复')
    scheduleSleep()
  }
  if (action === 'quit') window.petApi?.quit()
}

/** 打开快速提问表单并切换到注意状态。 */
function openQuickAsk() {
  quickAskOpen.value = true
  showBubble('想问什么？')
  state.value = 'attention'
}

/** 清空并关闭快速提问表单。 */
function cancelQuickAsk() {
  quickAskOpen.value = false
  quickQuestion.value = ''
  state.value = 'idle'
  bubble.value = ''
}

/** 校验问题后跳转到客户端 AI 页面并带入问题。 */
function submitQuickAsk() {
  const question = quickQuestion.value.trim()
  if (!question) return
  quickQuestion.value = ''
  void openClient(`/ai?question=${encodeURIComponent(question)}`)
  showBubble('正在打开 AI 助手～')
}

// 拖动
let dragging = false
let lastX = 0
let lastY = 0
let dragMoved = false
let suppressClick = false

/** 记录桌宠拖动起点，并捕获当前指针事件。 */
function onPointerDown(e: PointerEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.pet-character')) return
  wake()
  dragging = true
  dragMoved = false
  lastX = e.screenX
  lastY = e.screenY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

/** 根据指针增量请求宿主移动桌宠窗口。 */
function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const dx = e.screenX - lastX
  const dy = e.screenY - lastY
  if (dx !== 0 || dy !== 0) {
    window.petApi?.moveBy(dx, dy)
    dragMoved = true
    lastX = e.screenX
    lastY = e.screenY
  }
}

/** 结束桌宠拖动状态。 */
function onPointerUp() {
  if (dragging && dragMoved) suppressClick = true
  dragging = false
}

// 启动时读取宿主配置，恢复设置并启动睡眠/提醒计时器。
onMounted(async () => {
  window.petApi?.getConfig().then((cfg) => {
    clientUrl.value = cfg.clientUrl
    Object.assign(settings, cfg.settings)
    scheduleReminder()
  })
  scheduleSleep()
})

// 组件卸载时清理所有延时任务，避免窗口关闭后继续执行回调。
onBeforeUnmount(() => {
  if (sleepTimer) clearTimeout(sleepTimer)
  if (wakeTimer) clearTimeout(wakeTimer)
  if (reminderTimer) clearTimeout(reminderTimer)
})
</script>

<template>
  <div
    class="pet-stage"
    :class="{ sleeping: state === 'sleep', 'motion-off': !settings.animation }"
    :style="{ opacity: settings.opacity, '--pet-scale': String(settings.scale) }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click="onBlankClick"
    @contextmenu="onContextMenu"
    @pointerenter="wake"
  >
    <!-- 透明窗口只保留角色本体，角色区域同时作为拖动手柄。 -->
    <div
      class="pet-character"
      :class="{ dragging }"
      @click.stop="onSingleClick"
      @dblclick.stop="onDoubleClick"
    >
      <MitsuhaPet :state="state" />
    </div>

    <!-- 气泡 -->
    <Transition name="pop">
      <div v-if="bubbleText && !panelOpen" class="pet-bubble" @click.stop="onSingleClick">
        <span>{{ bubbleText }}</span>
      </div>
    </Transition>

    <!-- 快捷面板 -->
    <Transition name="pop">
      <div v-if="panelOpen" class="pet-panel" @click.stop>
        <button type="button" @click="void openClient('/')">打开客户端</button>
        <button v-if="!quickAskOpen" type="button" @click="openQuickAsk">问三叶一个问题</button>
        <form v-else class="quick-ask" @submit.prevent="submitQuickAsk">
          <label for="quick-question">问三叶</label>
          <input id="quick-question" v-model="quickQuestion" placeholder="输入你的问题" maxlength="120" autofocus />
          <div class="quick-ask-actions">
            <button type="button" @click="cancelQuickAsk">取消</button>
            <button type="submit" :disabled="!quickQuestion.trim()">进入 AI</button>
          </div>
        </form>
        <button type="button" @click="void openClient('/mine')">继续最近内容</button>
        <button type="button" @click="settingsOpen = !settingsOpen">{{ settingsOpen ? '收起设置' : '桌宠设置' }}</button>
        <div v-if="settingsOpen" class="pet-settings">
          <label><span>大小</span><input v-model.number="settings.scale" type="range" min="0.75" max="1.25" step="0.05" @change="persistSettings" /></label>
          <label><span>透明度</span><input v-model.number="settings.opacity" type="range" min="0.55" max="1" step="0.05" @change="persistSettings" /></label>
          <label class="pet-check"><input v-model="settings.animation" type="checkbox" @change="persistSettings" /><span>启用动作</span></label>
          <label class="pet-check"><input v-model="settings.bubbles" type="checkbox" @change="persistSettings" /><span>显示气泡</span></label>
          <label class="pet-check"><input v-model="settings.reminders" type="checkbox" @change="persistSettings" /><span>允许提醒</span></label>
          <div class="quiet-time"><span>安静时段</span><div><input v-model="settings.quietStart" type="time" @change="persistSettings" /><b>至</b><input v-model="settings.quietEnd" type="time" @change="persistSettings" /></div></div>
          <label class="pet-check"><input v-model="settings.startOnBoot" type="checkbox" @change="persistSettings" /><span>开机启动</span></label>
          <button type="button" class="settings-reset" @click="restoreSettings">恢复默认</button>
        </div>
        <button type="button" @click="hidePet">隐藏桌宠</button>
      </div>
    </Transition>

    <!-- 右键菜单 -->
    <Transition name="pop">
      <div v-if="menuOpen" class="pet-menu" :style="{ left: menuX + 'px', top: menuY + 'px' }" @click.stop>
        <button type="button" @click="menuAction('client')">打开客户端</button>
        <button type="button" @click="menuAction('ai')">进入 AI 助手</button>
        <button type="button" @click="menuAction('hide')">隐藏</button>
        <button type="button" @click="menuAction('top')">切换窗口置顶</button>
        <button type="button" @click="menuAction('offline')">{{ offlineSim ? '恢复在线' : '模拟断网' }}</button>
        <button type="button" class="danger" @click="menuAction('quit')">退出</button>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.pet-stage {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
}

.pet-stage.dragging {
  cursor: grabbing;
}

.pet-character {
  position: absolute;
  left: 50%;
  bottom: 16px;
  width: 248px;
  height: 286px;
  transform: translateX(-50%) scale(var(--pet-scale, 1));
  filter: drop-shadow(0 10px 14px rgba(20, 16, 40, 0.45));
  z-index: 3;
}

.pet-character.dragging {
  filter: drop-shadow(0 14px 18px rgba(20, 16, 40, 0.55));
}

.motion-off * {
  animation: none !important;
  transition: none !important;
}

.pet-bubble {
  position: absolute;
  left: 50%;
  top: 10px;
  max-width: 230px;
  transform: translateX(-50%);
  background: rgba(255, 252, 244, 0.96);
  color: #2b2f4a;
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 6px 18px rgba(20, 16, 40, 0.35);
  cursor: pointer;
}

.pet-bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -8px;
  transform: translateX(-50%);
  border: 8px solid transparent;
  border-top-color: rgba(255, 252, 244, 0.96);
  border-bottom: none;
}

.pet-panel,
.pet-menu {
  position: absolute;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(31, 28, 58, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
}

.pet-panel {
  left: 50%;
  top: 54px;
  width: 190px;
  transform: translateX(-50%);
}

.pet-panel button,
.pet-menu button {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #f2ead8;
  font-size: 13px;
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
}

.pet-panel button:hover,
.pet-menu button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.quick-ask {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}

.quick-ask label {
  color: #f2ead8;
  font-size: 12px;
}

.quick-ask input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 7px 8px;
  color: #f2ead8;
  background: rgba(0, 0, 0, 0.2);
  outline: none;
}

.quick-ask input:focus {
  border-color: rgba(255, 211, 128, 0.8);
}

.quick-ask-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.quick-ask-actions button {
  padding: 6px 8px;
  font-size: 12px;
}

.quick-ask-actions button:last-child {
  color: #231e34;
  background: #f3c878;
}

.quick-ask-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.pet-settings {
  display: grid;
  gap: 8px;
  margin: 2px 4px 4px;
  padding: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.pet-settings label,
.quiet-time {
  display: grid;
  gap: 4px;
  color: #d6d0c2;
  font-size: 11px;
}

.pet-settings input[type='range'] {
  width: 100%;
  accent-color: #f3c878;
}

.pet-check {
  display: flex !important;
  align-items: center;
  gap: 6px !important;
}

.pet-check input {
  accent-color: #f3c878;
}

.quiet-time > div {
  display: flex;
  align-items: center;
  gap: 5px;
}

.quiet-time input[type='time'] {
  min-width: 0;
  width: 78px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 5px;
  padding: 4px;
  color: #f2ead8;
  background: rgba(0, 0, 0, 0.2);
  font: inherit;
}

.quiet-time b {
  color: #f3c878;
  font-weight: 400;
}

.pet-settings .settings-reset {
  padding: 5px 7px;
  color: #ffb1a5;
  font-size: 11px;
}

.pet-menu button.danger {
  color: #ff9c9c;
}

.pet-menu {
  position: fixed;
  min-width: 150px;
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
