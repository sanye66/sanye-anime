import { reportFrontendError } from '@/api/system'

type VitalName = 'LCP' | 'CLS' | 'INP' | 'TTFB'

/** 上报单项性能指标，失败时由 API 层静默处理。 */
function report(name: VitalName, value: number): void {
  // 性能数据只用于监控，发送失败不影响管理端交互。
  reportFrontendError({ type: 'web-vital', message: `${name}=${Math.round(value)}` })
}

export function initWebVitals(): void {
  // 注册浏览器性能观察器并上报管理端首屏关键指标。
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return
  try {
    const lcp = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const entry = entries[entries.length - 1]
      if (entry) report('LCP', entry.startTime)
    })
    lcp.observe({ type: 'largest-contentful-paint', buffered: true })

    const cls = new PerformanceObserver((list) => {
      let value = 0
      for (const entry of list.getEntries()) {
        value += (entry as PerformanceEntry & { value?: number }).value ?? 0
      }
      report('CLS', value)
    })
    cls.observe({ type: 'layout-shift', buffered: true })

    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav) report('TTFB', nav.responseStart)
  } catch {
    // 浏览器不支持时忽略
  }
}
