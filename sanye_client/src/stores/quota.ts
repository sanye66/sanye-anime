import { defineStore } from 'pinia'
import { aiApi } from '@/api/ai'

const ANON_LIMIT = 5

/** 生成本地额度降级使用的自然日键。 */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 组合匿名设备额度的本地存储键。 */
function storageKey(): string {
  return `sanye_quota_anon_${todayKey()}`
}

/**
 * 额度状态：优先从后端 /ai/quota 读取（匿名 5 次/天、登录 30 次/天），
 * 后端不可用时回退到本地按设备日期计数。
 */
export const useQuotaStore = defineStore('quota', {
  state: () => ({
    used: 0,
    limit: ANON_LIMIT,
    anonymous: true,
    localFallback: false,
  }),
  getters: {
    /** 计算当前还可使用的额度，避免异常数据展示负数。 */
    remaining: (state) => Math.max(state.limit - state.used, 0),
  },
  actions: {
    async refresh(): Promise<void> {
      // 优先读取后端真实额度，后端不可用时切换到按设备日期计数的本地降级。
      try {
        const info = await aiApi.quota()
        this.used = info.used
        this.limit = info.limit
        this.anonymous = info.anonymous
        this.localFallback = false
      } catch {
        this.localFallback = true
        this.used = Number(localStorage.getItem(storageKey()) ?? 0)
        this.limit = ANON_LIMIT
        this.anonymous = true
      }
    },
    consume(): void {
      // 生成请求成功进入消费阶段后更新本地展示额度；仅降级模式写回浏览器。
      this.used += 1
      if (this.localFallback) {
        const key = storageKey()
        const next = Number(localStorage.getItem(key) ?? 0) + 1
        localStorage.setItem(key, String(next))
        this.used = next
      }
    },
  },
})
