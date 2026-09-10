import fs from 'node:fs/promises'
import path from 'node:path'

const base = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8091'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('仅允许本机性能测试')
const count = Number(process.env.PERF_REQUESTS ?? 200)
const concurrency = Number(process.env.PERF_CONCURRENCY ?? 10)
if (![count, concurrency].every(n => Number.isInteger(n) && n > 0 && n <= 10000)) throw new Error('请求数和并发必须为正整数且不超过 10000')
const device = `sanye_perf_${Date.now()}`
const results = []
const headers = { 'X-Device-Id': device }
const output = process.env.PERF_OUTPUT ?? 'sanye_deploy/.local/performance/results.json'
const filter = process.env.PERF_FILTER
const quantile = (values, p) => values.length ? [...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1] : null

async function request(url, options = {}) {
  const start = performance.now()
  try {
    const response = await fetch(new URL(url, base), { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15000) })
    const text = await response.text()
    let json
    try { json = JSON.parse(text) } catch {}
    return { ms: performance.now()-start, status: response.status, code: json?.code, json, bytes: Buffer.byteLength(text) }
  } catch (error) { return { ms: performance.now()-start, status: 0, code: error.name } }
}
const success = r => r.status === 200 && [0, 200].includes(r.code)
async function run(url, options = {}, settings = {}) {
  if (filter && !url.includes(filter)) return
  const samples = []
  const n = settings.count ?? count
  const c = settings.concurrency ?? concurrency
  const accept = settings.accept ?? success
  const warmup = await request(url, options)
  if (!accept(warmup)) {
    results.push({ method: options.method ?? 'GET', url, state: 'blocked', status: warmup.status, code: warmup.code, warmupMs: warmup.ms })
    console.log(`BLOCKED ${url}: ${warmup.status}/${warmup.code}`)
    return
  }
  for (let i=0;i<5;i++) await request(url, options)
  let next = 0
  const start = performance.now()
  await Promise.all(Array.from({length:Math.min(c,n)}, async () => {
    while (next++ < n) samples.push(await request(url, options))
  }))
  const duration = performance.now()-start
  const good = samples.filter(accept)
  const latency = good.map(r => r.ms)
  const p95 = quantile(latency,.95)
  const result = { method: options.method ?? 'GET', url, state: good.length < n ? 'failed' : p95 > (settings.limit ?? 200) ? 'slow' : 'passed', requests:n, concurrency:c, errors:n-good.length, errorRate:(n-good.length)/n, qps:n/duration*1000, goodput:good.length/duration*1000, p50:quantile(latency,.5), p95, p99:quantile(latency,.99), max:latency.length ? Math.max(...latency) : null, duration, warmupMs:warmup.ms, statuses:Object.fromEntries([...new Set(samples.map(r=>`${r.status}/${r.code}`))].map(k=>[k,samples.filter(r=>`${r.status}/${r.code}`===k).length])), samples:samples.map(({ms,status,code})=>({ms,status,code})) }
  results.push(result)
  console.log(`${result.state} ${result.method} ${url} p95=${p95?.toFixed(1)}ms errors=${result.errors}/${n}`)
}
const post = body => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
try {
  for (const url of ['/api/v1/system/ping','/api/v1/system/capabilities','/api/v1/home','/api/v1/anime?size=20','/api/v1/anime?keyword=星海&size=20','/api/v1/schedule/week','/api/v1/public/home','/api/v1/public/legal','/api/v1/search?keyword=星海&size=20','/api/v1/ai/model-info','/api/v1/ai/quota','/api/v1/ai/preferences','/api/v1/ai/conversations','/api/v1/users/me/favorites','/api/v1/users/me/history','/api/v1/auth/cas/login']) await run(url)
  const catalog = await request('/api/v1/anime?size=20')
  const id = catalog.json?.data?.items?.[0]?.id
  if (id) {
    for (const url of [`/api/v1/anime/${id}`,`/api/v1/anime/${id}/episodes`,`/api/v1/users/me/favorites/${id}/status`]) await run(url)
    await run(`/api/v1/users/me/favorites/${id}`, {method:'POST'})
    await run(`/api/v1/users/me/history/${id}`, {method:'POST'})
    await run(`/api/v1/users/me/favorites/${id}`, {method:'DELETE'})
  }
  const conversation = await request('/api/v1/ai/conversations',post({title:device,spoilerMode:'SAFE'}))
  const cid = conversation.json?.data?.id
  if (cid) {
    for (const url of [`/api/v1/ai/conversations/${cid}`,`/api/v1/ai/conversations/${cid}/messages`]) await run(url)
    await run(`/api/v1/ai/conversations/${cid}`, {...post({title:device}),method:'PATCH'})
    await request(`/api/v1/ai/conversations/${cid}`,{method:'DELETE'})
  }
  await run('/api/v1/monitor/frontend-errors',post({type:'performance',message:device,url:'http://localhost/'}))
  await run('/api/v1/ai/preferences', {...post({temperature:0.7,contextLength:4096}),method:'PUT'})
  await run('/api/v1/feedback', post({type:'SUGGESTION',content:`性能测试 ${device}`,contact:''}),{count:20,concurrency:2})
  const service = 'http://localhost:5173/'
  const ticketResponse = await fetch('http://127.0.0.1:8095/cas/login', {method:'POST',body:new URLSearchParams({service,username:device}),redirect:'manual',signal:AbortSignal.timeout(5000)}).catch(()=>null)
  const location = ticketResponse?.headers.get('location')
  if (location) {
    const ticket = new URL(location).searchParams.get('ticket')
    const session = await request(`/api/v1/auth/cas/callback?${new URLSearchParams({service,ticket})}`)
    const access = session.json?.data?.accessToken
    if (access) {
      const auth = {Authorization:`Bearer ${access}`}
      const form = new FormData()
      form.append('file',new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'],{type:'image/svg+xml'}),'performance.svg')
      const uploaded = await request('/api/v1/files',{method:'POST',headers:auth,body:form})
      const fid = uploaded.json?.data?.id
      await run('/api/v1/files',{method:'POST',headers:auth,body:form},{count:20,concurrency:2})
      if (fid) {
        await run(`/api/v1/files/${fid}/meta`,{headers:auth})
        await run(`/api/v1/files/${fid}`,{headers:auth},{accept:r=>r.status===200 && r.bytes>0})
      }
    } else results.push({url:'/api/v1/auth/cas/callback',state:'blocked',status:session.status,code:session.code})
  } else results.push({url:'/api/v1/auth/cas/callback',state:'blocked',code:'CAS mock unavailable'})
  if (process.env.PERF_ADMIN_USERNAME && process.env.PERF_ADMIN_PASSWORD) {
    const options = post({username:process.env.PERF_ADMIN_USERNAME,password:process.env.PERF_ADMIN_PASSWORD})
    const login = await request('/api/v1/admin/login',options)
    const token = login.json?.token
    if (token) {
      const auth = {headers:{Authorization:`Bearer ${token}`}}
      for (const suffix of ['getInfo','getRouters','anime','dashboard/stats','feedback','legal','system/user/list','system/role/list','system/menu/list','system/menu/treeselect','system/dept/list','system/post/list','system/post/optionselect','system/dict/type/list','system/dict/type/optionselect','system/dict/data/list','system/config/list','system/notice/list','system/role/optionselect','system/user/deptTree','system/user/profile','monitor/operlog/list','monitor/logininfor/list','monitor/online/list','monitor/job/list','monitor/jobLog/list','monitor/server','monitor/cache','monitor/cache/getNames','monitor/xxl-job/logs']) await run(`/api/v1/admin/${suffix}`,auth)
      await run('/api/v1/admin/monitor/xxl-job',auth,{accept:r=>success(r)&&r.json?.data?.configured===true&&r.json?.data?.executorOnline===true})
    } else results.push({url:'/api/v1/admin/login',state:'blocked',status:login.status,code:login.code})
  }
} finally {
  await fs.mkdir(path.dirname(output),{recursive:true})
  await fs.writeFile(output,JSON.stringify({generatedAt:new Date().toISOString(),base,device,node:process.version,count,concurrency,mode:'本地数据库，匿名隔离设备，成功响应延迟，闭环负载',results},null,2))
}
process.exitCode = results.some(r=>r.state !== 'passed') ? 1 : 0
