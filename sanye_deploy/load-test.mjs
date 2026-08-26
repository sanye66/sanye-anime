/**
 * 本地并发压测与稳定性检查（T-G-05 第一批）
 * 用法：
 *   node sanye_deploy/load-test.mjs [home并发=20] [AI并发=5] [GATEWAY_URL=http://localhost:8091]
 * 覆盖：
 *   - home 接口并发延迟分位数（p50/p95/p99）
 *   - AI SSE 并发完成率与延迟
 *   - 幂等重放（重复点击场景）：同 clientMessageId 重发不重复扣额度
 *   - 配额一致性
 */
const homeConcurrency = Number(process.argv[2] ?? 20)
const aiConcurrency = Number(process.argv[3] ?? 5)
const base = process.env.GATEWAY_URL ?? 'http://localhost:8091'
const device = `load-${Date.now()}`

// 控制 SSE 压测的轮询节奏，避免测试客户端忙等。
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// 计算首页和 AI 请求延迟分位数。
const percentile = (arr, p) => {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}
const format = (ms) => `${ms.toFixed(0)}ms`

// 测量一次异步操作的耗时并把异常交给调用方统计。
async function timed(fn) {
  const start = performance.now()
  await fn()
  return performance.now() - start
}

const failures = []

// 1. home 并发
const homeTimes = await Promise.all(
  Array.from({ length: homeConcurrency }, () =>
    timed(async () => {
      const res = await fetch(`${base}/api/v1/home`, { headers: { 'X-Device-Id': device } })
      if (!res.ok) throw new Error(`home HTTP ${res.status}`)
      const body = await res.json()
      if (body.code !== 0) throw new Error(`home code ${body.code}`)
    }),
  ),
).catch((err) => {
  failures.push(`home: ${err.message}`)
  return []
})

// 2. AI SSE 并发（匿名上限 5，默认并发 5）
const convRes = await fetch(`${base}/api/v1/ai/conversations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Device-Id': device },
  body: JSON.stringify({ title: 'load-test', spoilerMode: 'SAFE' }),
}).then((r) => r.json())
const convId = convRes.data?.id
if (!convId) {
  failures.push(`创建会话失败: ${JSON.stringify(convRes)}`)
}

// 发送一条 SSE 消息并等待 completed/failed 事件，用于 AI 并发和幂等验证。
async function sendAndWait(clientMessageId, content) {
  const res = await fetch(`${base}/api/v1/ai/conversations/${convId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': device, Accept: 'text/event-stream' },
    body: JSON.stringify({ content, clientMessageId, spoilerMode: 'SAFE' }),
  })
  if (!res.ok) throw new Error(`AI HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  if (!text.includes('message.completed')) throw new Error('AI 流未完成')
}

const aiTimes = []
const aiErrors = []
if (convId) {
  await Promise.all(
    Array.from({ length: aiConcurrency }, (_, i) =>
      timed(() => sendAndWait(`load-msg-${i}`, `压测问题 ${i}`))
        .then((ms) => aiTimes.push(ms))
        .catch((err) => aiErrors.push(`ai-${i}: ${err.message}`)),
    ),
  )
}

// 3. 幂等重放：同 clientMessageId 重发，应幂等完成且不扣额度
let replayOk = false
let replayMs = 0
if (convId) {
  await timed(() => sendAndWait('load-msg-0', '压测问题 0 重放')).then((ms) => {
    replayOk = true
    replayMs = ms
  }).catch(() => {
    replayOk = false
  })
}

// 4. 配额一致性：used 应等于 aiConcurrency（重放不增加）
const quotaRes = await fetch(`${base}/api/v1/ai/quota`, { headers: { 'X-Device-Id': device } }).then((r) => r.json())
const quotaOk = quotaRes.data?.used === aiConcurrency
if (!quotaOk) {
  failures.push(`配额不一致 used=${quotaRes.data?.used} 期望=${aiConcurrency}`)
}

console.log(`=== sanye_anime 本地压测报告 ===`)
console.log(`home 并发 ${homeConcurrency}: p50=${format(percentile(homeTimes, 0.5))} p95=${format(percentile(homeTimes, 0.95))} p99=${format(percentile(homeTimes, 0.99))}`)
console.log(`AI SSE 并发 ${aiConcurrency}: 成功 ${aiTimes.length}/${aiConcurrency} p50=${format(percentile(aiTimes, 0.5))} p95=${format(percentile(aiTimes, 0.95))}`)
console.log(`幂等重放: ${replayOk ? '通过' : '失败'}（${format(replayMs)}）`)
console.log(`配额一致性: used=${quotaRes.data?.used} 期望=${aiConcurrency} ${quotaOk ? '通过' : '失败'}`)
if (aiErrors.length) console.log(`AI 失败明细: ${aiErrors.join('; ')}`)
if (failures.length) console.log(`失败项: ${failures.join('; ')}`)

const passed = homeTimes.length === homeConcurrency && aiErrors.length === 0 && replayOk && quotaOk
console.log(`\n压测结论: ${passed ? 'PASS' : 'FAIL'}`)
process.exit(passed ? 0 : 1)
