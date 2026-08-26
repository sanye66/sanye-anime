import { reportFrontendError } from '@/api/system'

type VitalName = 'LCP' | 'CLS' | 'INP' | 'TTFB'

/** 上报单项性能指标，监控链路异常不阻断页面交互。 */
function report(name: VitalName, value: number): void {
  // 性能指标采用尽力上报，监控链路异常不阻断用户交互。
  reportFrontendError({ type: 'web-vital', message: `${name}=${Math.round(value)}` })
}

export function initWebVitals(): void {
  // 注册浏览器性能观察器，收集 LCP、CLS、INP 和导航耗时。
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

    const inp = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const entry = entries[entries.length - 1] as PerformanceEntry & { duration?: number }
      if (entry) report('INP', entry.duration ?? 0)
    })
    inp.observe({ type: 'event', buffered: true })

    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav) report('TTFB', nav.responseStart)
  } catch {
    // 浏览器不支持时忽略
  }
}
