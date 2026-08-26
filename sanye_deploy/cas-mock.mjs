// 本地 Mock CAS 服务器（T-F-01 联调）：模拟 Apereo CAS 的 /login 与 /serviceValidate。
// 用于本地验证 sanye_client 登录跳转、ticket 校验、账号自动建号与本地会话签发。
// 用法：node cas-mock.mjs（端口 8095）；正式环境替换为真实 CAS 服务器。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PORT = Number(process.env.CAS_MOCK_PORT ?? 8095)
const USER = process.env.CAS_MOCK_USER ?? 'sanye-user'
const tickets = new Map() // ticket -> { user, service, used }
const LOG_FILE = path.join(os.tmpdir(), 'cas-mock-request.log')

// 记录 CAS Mock 请求，便于核对 ticket 一次性校验和 service 参数。
function log(line) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`)
}

// 转义 XML 文本，避免测试账号或 service 破坏 Mock 响应结构。
function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 写入统一响应头和响应体，模拟 CAS 登录/校验接口。
function send(res, status, contentType, body) {
  res.writeHead(status, { 'Content-Type': contentType })
  res.end(body)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  // GET /cas/login?service=... → 模拟登录页
  if (path === '/cas/login' && req.method === 'GET') {
    const service = esc(url.searchParams.get('service') ?? '')
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>Mock CAS 登录</title></head>
      <body style="font-family:sans-serif;max-width:420px;margin:80px auto;text-align:center">
        <h2>Mock CAS 登录（联调）</h2>
        <p>测试账号：${esc(USER)}</p>
        <form method="post" action="/cas/login">
          <input type="hidden" name="service" value="${service}" />
          <p><input name="username" value="${esc(USER)}" style="padding:8px;width:240px" /></p>
          <p><button type="submit" style="padding:8px 24px">登录</button></p>
        </form>
      </body></html>`
    return send(res, 200, 'text/html; charset=utf-8', html)
  }

  // GET /cas/logout → 模拟 CAS 登出成功页
  if (path === '/cas/logout') {
    return send(res, 200, 'text/html; charset=utf-8',
      '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>已登出</title></head><body style="font-family:sans-serif;text-align:center;margin-top:80px"><h2>Mock CAS：已登出</h2><p>可以关闭此页或返回客户端。</p></body></html>')
  }

  // POST /cas/login → 生成一次性 ticket，302 回 service
  if (path === '/cas/login' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const params = new URLSearchParams(body)
      const service = params.get('service')
      const username = params.get('username')?.trim() || USER
      const ticket = `ST-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      tickets.set(ticket, { user: username, service, used: false })
      if (!service) return send(res, 400, 'text/plain', 'missing service')
      const sep = service.includes('?') ? '&' : '?'
      res.writeHead(302, { Location: `${service}${sep}ticket=${encodeURIComponent(ticket)}` })
      res.end()
    })
    return
  }

  // GET /cas/serviceValidate?ticket=&service= → CAS XML（一次性 ticket）
  if (path === '/cas/serviceValidate' && req.method === 'GET') {
    const ticket = url.searchParams.get('ticket')
    const service = url.searchParams.get('service')
    const record = ticket ? tickets.get(ticket) : undefined
    log(`validate ticket=${ticket} service=${service} record=${record ? JSON.stringify(record) : 'none'}`)
    if (!record || record.used || (service && record.service !== service)) {
      return send(res, 200, 'text/xml; charset=utf-8',
        '<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas"><cas:authenticationFailure code="INVALID_TICKET">ticket 无效或已使用</cas:authenticationFailure></cas:serviceResponse>')
    }
    record.used = true
    return send(res, 200, 'text/xml; charset=utf-8',
      `<cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas"><cas:authenticationSuccess><cas:user>${esc(record.user)}</cas:user></cas:authenticationSuccess></cas:serviceResponse>`)
  }

  send(res, 404, 'text/plain', 'not found')
})

server.listen(PORT, () => {
  console.log(`[cas-mock] Mock CAS 运行于 http://localhost:${PORT}（测试账号 ${USER}）`)
})
