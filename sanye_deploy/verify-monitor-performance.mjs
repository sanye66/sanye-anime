import fs from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const base = 'http://127.0.0.1:8091'
const login = await fetch(`${base}/api/v1/admin/login`, {
  method:'POST', headers:{'Content-Type':'application/json','X-Device-Id':'sanye_perf_monitor_refresh'},
  body:JSON.stringify({username:process.env.PERF_ADMIN_USERNAME,password:process.env.PERF_ADMIN_PASSWORD}),
  signal:AbortSignal.timeout(10000),
}).then(r=>r.json())
if (!login.token) throw new Error('管理员登录失败')
const headers = { Authorization:`Bearer ${login.token}`, 'X-Device-Id':'sanye_perf_monitor_refresh' }
const samples = []
const started = performance.now()
// 低速持续请求跨越多个后台采样周期，避免只测热缓存突发。
for (let i=0;i<80;i++) {
  const start = performance.now()
  try {
    const response = await fetch(`${base}/api/v1/admin/monitor/server`,{headers,signal:AbortSignal.timeout(5000)})
    const body = await response.json()
    samples.push({ms:performance.now()-start,ok:response.ok&&body.code===200&&!!body.data?.cpu,status:response.status,code:body.code})
  } catch { samples.push({ms:performance.now()-start,ok:false}) }
  await delay(250)
}
const sorted = samples.map(r=>r.ms).sort((a,b)=>a-b)
const result = {generatedAt:new Date().toISOString(),durationMs:performance.now()-started,requests:samples.length,errors:samples.filter(r=>!r.ok).length,p95:sorted[Math.ceil(sorted.length*.95)-1],p99:sorted[Math.ceil(sorted.length*.99)-1],max:sorted.at(-1),samples}
await fs.mkdir('sanye_deploy/.local/performance',{recursive:true})
await fs.writeFile('sanye_deploy/.local/performance/monitor-refresh.json',JSON.stringify(result,null,2))
console.log(JSON.stringify({...result,samples:undefined}))
if (result.errors || result.p95>200) process.exitCode=1
