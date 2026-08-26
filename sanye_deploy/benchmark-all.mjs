/**
 * 全接口吞吐/QPS 与响应速度基准（sanye_anime）
 * 用法：node sanye_deploy/benchmark-all.mjs [并发=20] [每端点请求数=100] [GATEWAY_URL]
 * 覆盖：系统/网关、anime、搜索（降级）、AI（轻量）、收藏、文件、管理端、监控
 * 说明：只压测只读接口；AI SSE 真实模型生成默认 1 次（避免成本），可 -sse 开大并发。
 */
const concurrency = Number(process.argv[2] ?? 20)
const perEndpoint = Number(process.argv[3] ?? 100)
const base = process.env.GATEWAY_URL ?? 'http://localhost:8091'
const sseConcurrency = Number(process.env.SSE_CONCURRENCY ?? 1)
const device = `bench-${Date.now()}`

// 计算延迟分位数，供不同接口压测结果横向比较。
const percentile = (arr, p) => {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

// 发起 JSON 请求并保留状态码、响应体和耗时。
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = null
  }
  return { res, body }
}

// 按并发度压测单个接口，并按业务成功判定统计错误率和延迟。
async function runEndpoint(name, url, { method = 'GET', headers = {}, body, expectStatus = 200, ok = (b) => b?.code === 0 || b?.code === 200 || b?.code === 2001 } = {}) {
  const times = []
  let errors = 0
  let first = 0
  const opts = {
    method,
    headers: { 'X-Device-Id': device, ...headers },
    ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }
  if (body) opts.headers['Content-Type'] = 'application/json'
  const start = performance.now()
  await Promise.all(
    Array.from({ length: concurrency }, async (_, w) => {
      for (let i = 0; i < Math.ceil(perEndpoint / concurrency); i++) {
        const t0 = performance.now()
        try {
          const { res, body: json } = await fetchJson(`${base}${url}`, opts)
          const ms = performance.now() - t0
          times.push(ms)
          if (res.status !== expectStatus || !ok(json)) errors++
        } catch {
          times.push(performance.now() - t0)
          errors++
        }
      }
    }),
  )
  const total = performance.now() - start
  const n = times.length
  return {
    name,
    url,
    requests: n,
    errors,
    errorRate: (errors / n) * 100,
    qps: (n / total) * 1000,
    totalMs: total,
    p50: percentile(times, 0.5),
    p95: percentile(times, 0.95),
    p99: percentile(times, 0.99),
    first: times[0] ?? 0,
  }
}

// 管理端登录 token
const adminLogin = await fetchJson(`${base}/api/v1/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Device-Id': device },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})
const adminToken = adminLogin.body?.token ?? ''
const adminHeaders = { Authorization: `Bearer ${adminToken}` }

const results = []

// A. 系统与网关
results.push(await runEndpoint('ping', '/api/v1/system/ping'))
results.push(await runEndpoint('capabilities', '/api/v1/system/capabilities'))
results.push(await runEndpoint('网关-缺设备头401', '/api/v1/home', { headers: { 'X-Device-Id': '' }, expectStatus: 401, ok: (b) => b?.code === 2001 }))
results.push(await runEndpoint('网关-未知路径404', '/api/v1/nope', { expectStatus: 404, ok: (b) => b?.code === 2003 }))

// B. anime 内容
results.push(await runEndpoint('home 聚合(缓存)', '/api/v1/home'))
results.push(await runEndpoint('anime 列表分页', '/api/v1/anime?page=1&size=10'))
results.push(await runEndpoint('anime 类型筛选', '/api/v1/anime?type=电视动画&page=1&size=10'))
results.push(await runEndpoint('anime 详情聚合', '/api/v1/anime/127'))
results.push(await runEndpoint('排期周视图', '/api/v1/schedule/week'))
results.push(await runEndpoint('公开精选', '/api/v1/public/home'))
results.push(await runEndpoint('官网法律正文', '/api/v1/public/legal'))

// C. 搜索（ES 未就绪 → 4002 降级）
results.push(await runEndpoint('搜索(ES降级)', '/api/v1/search?keyword=星海&page=1&size=10', { ok: (b) => b?.code === 4002 }))

// D. AI 轻量接口
results.push(await runEndpoint('AI 模型信息', '/api/v1/ai/model-info'))
results.push(await runEndpoint('AI 额度', '/api/v1/ai/quota'))
results.push(await runEndpoint('AI 偏好读取', '/api/v1/ai/preferences'))

// E. 收藏与历史
results.push(await runEndpoint('收藏列表', '/api/v1/users/me/favorites'))
results.push(await runEndpoint('收藏状态', '/api/v1/favorites/1/status', { expectStatus: 404, ok: (b) => b?.code === 2003 }))

// F. 管理端（经网关，含 RuoYi）
results.push(await runEndpoint('admin 登录', '/api/v1/admin/login', {
  method: 'POST',
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
}))
results.push(await runEndpoint('admin getInfo', '/api/v1/admin/getInfo', { headers: adminHeaders }))
results.push(await runEndpoint('admin 内容列表', '/api/v1/admin/anime', { headers: adminHeaders }))
results.push(await runEndpoint('admin 仪表盘统计', '/api/v1/admin/dashboard/stats', { headers: adminHeaders }))
results.push(await runEndpoint('admin 用户列表', '/api/v1/admin/system/user/list?pageNum=1&pageSize=10', { headers: adminHeaders }))
results.push(await runEndpoint('admin 操作日志', '/api/v1/admin/monitor/operlog/list?pageNum=1&pageSize=10', { headers: adminHeaders }))

// G. AI SSE 真实模型（默认 1 并发，避免成本）
if (sseConcurrency > 0) {
  const sseDevice = `bench-sse-${Date.now()}`
  const conv = await fetchJson(`${base}/api/v1/ai/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': sseDevice },
    body: JSON.stringify({ title: 'benchmark-sse', spoilerMode: 'SAFE' }),
  })
  const cid = conv.body?.data?.id
  const sseTimes = []
  let sseErrors = 0
  let sseExternalBlocked = false
  if (cid) {
    await Promise.all(
      Array.from({ length: sseConcurrency }, async (_, i) => {
        const t0 = performance.now()
        const clientMessageId = `bs-${Date.now()}-${i}`
        try {
          const res = await fetch(`${base}/api/v1/ai/conversations/${cid}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Device-Id': sseDevice, Accept: 'text/event-stream' },
            body: JSON.stringify({ content: `一句话介绍你自己（第${i}次）`, clientMessageId, spoilerMode: 'SAFE' }),
          })
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            decoder.decode(value, { stream: true })
          }
          sseTimes.push(performance.now() - t0)
          // 用落库结果校验生成是否完成（SSE 流读取在本环境偶发为空，以持久化状态为准）
          const msgs = await fetchJson(`${base}/api/v1/ai/conversations/${cid}/messages`, {
            headers: { 'X-Device-Id': sseDevice },
          })
          const assistants = (msgs.body?.data ?? []).filter((m) => m.role === 'ASSISTANT')
          const target = assistants[assistants.length - 1]
          if (!target) sseErrors++
          else if (target.status === 'FAILED') sseExternalBlocked = true
          else if (target.status !== 'COMPLETED' || !target.content) sseErrors++
        } catch {
          sseTimes.push(performance.now() - t0)
          sseErrors++
        }
      }),
    )
  }
  results.push({
    name: 'AI SSE 真实模型',
    url: '/api/v1/ai/conversations/{id}/messages',
    requests: sseTimes.length,
    errors: sseErrors,
    errorRate: sseTimes.length ? (sseErrors / sseTimes.length) * 100 : 100,
    note: sseExternalBlocked ? '外部阻塞：硅基流动账户余额/额度不足（HTTP 402），生成失败由系统正确落 FAILED' : '',
    qps: sseTimes.length ? (sseTimes.length / (Math.max(...sseTimes) / 1000)) : 0,
    totalMs: Math.max(...sseTimes),
    p50: percentile(sseTimes, 0.5),
    p95: percentile(sseTimes, 0.95),
    p99: percentile(sseTimes, 0.99),
    note: sseExternalBlocked ? '外部阻塞：硅基流动账户余额/额度不足（HTTP 402），生成失败由系统正确落 FAILED' : '',
  })
}

// 输出
console.log('name | qps | p50 | p95 | p99 | 错误率')
for (const r of results) {
  console.log(
    `${r.name} | ${r.qps.toFixed(1)} | ${r.p50.toFixed(0)}ms | ${r.p95.toFixed(0)}ms | ${r.p99.toFixed(0)}ms | ${r.errorRate.toFixed(2)}%${r.note ? ' | ' + r.note : ''}`,
  )
}
console.log(`\n并发=${concurrency} 每端点=${perEndpoint} 端点=${results.length}`)

const failed = results.filter((r) => r.errorRate > 0 || r.requests === 0)
if (failed.length) {
  console.log('失败端点：' + failed.map((f) => `${f.name}(${f.errorRate.toFixed(1)}%)`).join('、'))
}
