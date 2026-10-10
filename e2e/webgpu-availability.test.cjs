// 前置事实探测：运行环境是否提供可用的 WebGPU 适配器。
// 该结论决定"实时轻量模型"能否落在 WebGPU 上，因此单独记录，不假设其可用。
const { test } = require('node:test')
const path = require('node:path')
const { createRequire } = require('node:module')
const { chromium } = createRequire(path.resolve(__dirname, 'package.json'))('playwright')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'

test('report whether the runtime exposes a usable WebGPU adapter', async () => {
  // 与其余浏览器门禁完全相同的启动参数，用于判断无头环境下到底有没有 WebGPU。
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(origin)
    const report = await page.evaluate(async () => {
      const result = { hasNavigatorGpu: typeof navigator !== 'undefined' && 'gpu' in navigator, adapter: null, device: null, features: null, error: null }
      if (!result.hasNavigatorGpu) return result
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
        if (!adapter) { result.error = 'requestAdapter returned null'; return result }
        const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null)
        result.adapter = info ? { vendor: info.vendor ?? null, architecture: info.architecture ?? null, device: info.device ?? null, description: info.description ?? null } : 'unavailable'
        result.features = [...adapter.features].slice(0, 20)
        const device = await adapter.requestDevice()
        result.device = { hasLost: typeof device.lost?.then === 'function' }
        device.destroy?.()
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error)
      }
      return result
    })
    console.log('WEBGPU_AVAILABILITY ' + JSON.stringify(report))
  } finally {
    await browser.close()
  }
})
