import fs from 'node:fs/promises'
import path from 'node:path'

const input = process.argv[2] ?? 'sanye_deploy/.local/performance/final-c10-verified.json'
const data = JSON.parse(await fs.readFile(input,'utf8'))
const inventory = []
async function walk(dir) {
  for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
    const file = path.join(dir,entry.name)
    if (entry.isDirectory() && !['target','.git','node_modules'].includes(entry.name)) await walk(file)
    else if (entry.isFile() && entry.name.endsWith('Controller.java') && file.replaceAll('\\','/').includes('/src/main/java/')) {
      const source = await fs.readFile(file,'utf8')
      const declaration = source.indexOf('public class ')
      if (declaration < 0) continue
      const before = source.slice(0,declaration)
      const prefix = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?"([^"]*)"/.exec(before)?.[1] ?? ''
      // 当前控制器采用直接 Spring 映射注解；未解析继承、组合注解或运行时生成路由。
      const pattern = /@(Get|Post|Put|Patch|Delete|Request)Mapping(?:\s*\(([^)]*)\))?/g
      for (const match of source.slice(declaration).matchAll(pattern)) {
        const suffixes = [...(match[2] ?? '').matchAll(/"([^"]*)"/g)].map(m=>m[1])
        const suffix = suffixes.find(s=>s.startsWith('/')) ?? ''
        const route = (prefix + suffix) || '/'
        const method = match[1] === 'Request' ? 'ANY' : match[1].toUpperCase()
        const gatewayRoute = file.includes('sanye_admin_server') ? '/api/v1/admin'+route : route
        const matcher = new RegExp('^'+gatewayRoute.split(/\{[^}]+\}/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]+')+'/?$')
        const tested = data.results.find(r=>(r.method??'GET')===method && matcher.test(r.url.split('?')[0]))
        inventory.push({method,route:gatewayRoute,file:file.replaceAll('\\','/'),line:source.slice(0,declaration+match.index).split('\n').length,state:tested?.state??'未压测',reason:tested ? '' : /clear|clean|remove|forceLogout|resetPwd|changeStatus|updateAuthRole/i.test(route) || method==='DELETE' ? '需隔离资源与可验证恢复' : /import|external|reindex|trigger/.test(route) ? '需专用来源或中间件' : '需补充成功请求夹具'})
      }
    }
  }
}
await walk('sanye_server')
await walk('sanye_admin_server')
// 静态路由优先于 /{id}，避免把 /list 的成功误计为详情覆盖。
for (const item of inventory) item.state = '未压测'
for (const result of data.results) {
  const candidates = inventory.filter(item => {
    const matcher = new RegExp('^'+item.route.split(/\{[^}]+\}/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]+')+'/?$')
    return item.method === (result.method??'GET') && matcher.test(result.url.split('?')[0])
  }).sort((a,b)=>(a.route.match(/\{/g)?.length??0)-(b.route.match(/\{/g)?.length??0))
  if (candidates[0]) { candidates[0].state = result.state; candidates[0].reason = '' }
}
for (const item of inventory) if (item.state==='未压测'&&!item.reason) item.reason='需补充成功请求夹具'
const n = v => typeof v==='number'?v.toFixed(1):'—'
const report = [
  '# sanye_anime 本轮接口性能明细', '',
  `生成时间：${data.generatedAt}。原始证据：\`${input}\`。`, '',
  `并发 ${data.concurrency}，每个常规场景 ${data.count} 请求；上传和反馈为 2 并发、20 请求。预热不计入统计；耗时包含响应体读取；分位数仅统计成功响应，失败单独计数。`, '',
  '| 方法 | 接口 | 状态 | 请求 | 错误 | QPS | p50 毫秒 | p95 毫秒 | p99 毫秒 | 首次请求毫秒 |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...data.results.map(r=>`| ${r.method??'GET'} | \`${r.url}\` | ${{passed:'通过',slow:'慢',blocked:'受阻',failed:'失败'}[r.state]} | ${r.requests??0} | ${r.errors??'—'} | ${n(r.qps)} | ${n(r.p50)} | ${n(r.p95)} | ${n(r.p99)} | ${n(r.warmupMs)} |`),
  '', '## 源码接口覆盖清单', '',
  `静态发现 ${inventory.length} 条直接映射。包含业务服务与 RuoYi；共享 SystemController 只计算源码定义，不按服务副本重复计算。此清单不是运行时 OpenAPI：继承、多个路径别名、Actuator、静态资源和 SSE 协议事件不在解析范围。`, '',
  '| 方法 | 网关路径或内部路径 | 状态 | 原因 | 源码 |',
  '| --- | --- | --- | --- | --- |',
  ...inventory.map(r=>`| ${r.method} | \`${r.route}\` | ${r.state==='passed'?'通过':r.state==='blocked'?'受阻':r.state} | ${r.reason} | ${r.file}:${r.line} |`), ''
].join('\n')
await fs.mkdir('sanye_deploy/.local/performance',{recursive:true})
await fs.writeFile('sanye_deploy/.local/performance/current-report.md',report)
await fs.writeFile('sanye_deploy/.local/performance/inventory.json',JSON.stringify(inventory,null,2))
console.log(JSON.stringify({definitions:inventory.length,covered:inventory.filter(r=>r.state!=='未压测').length,scenarios:data.results.length,passed:data.results.filter(r=>r.state==='passed').length,requests:data.results.reduce((s,r)=>s+(r.requests??0),0),blocked:data.results.filter(r=>r.state==='blocked').map(r=>r.url)}))
