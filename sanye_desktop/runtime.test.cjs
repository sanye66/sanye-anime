const { test } = require('node:test')
const assert = require('node:assert/strict')
const { routeService, LocalRuntime } = require('./runtime.cjs')
const http = require('node:http')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

test('desktop exposes public reading and device collections, never internal/admin endpoints', () => {
  assert.equal(routeService('/api/v1/search?keyword=x', 'GET'), 'search')
  assert.equal(routeService('/api/v1/anime/1', 'GET'), 'anime')
  assert.equal(routeService('/api/v1/users/me/favorites/1', 'POST'), 'favorite')
  for (const url of ['/api/v1/search/reindex', '/api/v1/admin/anime', '/api/v1/auth/cas/login', '/api/v1/ai/chat']) assert.equal(routeService(url, 'POST'), null)
  assert.equal(routeService('/api/v1/anime/1', 'POST'), null)
  assert.equal(routeService('/api/v1/anime/import-url', 'POST'), 'anime')
})

test('loopback proxy rejects foreign origin and strips identity/internal credentials', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-test-'))
  const runtime = new LocalRuntime(data, data)
  let received
  const backend = http.createServer((req, res) => { received = req.headers; res.end('{}') })
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  runtime.ports.anime = backend.address().port
  runtime.ready = true
  const server = http.createServer((req, res) => { void runtime.serve(req, res) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  runtime.origin = `http://127.0.0.1:${server.address().port}`
  try {
    const endpoint = runtime.origin + '/api/v1/home'
    assert.equal((await fetch(endpoint)).status, 403)
    const cookie = `sanyeDesktop=${runtime.cookie}`
    assert.equal((await fetch(endpoint, { headers: { cookie, origin: 'https://foreign.example' } })).status, 403)
    assert.equal((await fetch(endpoint, { headers: { cookie, 'x-user-id': '1', 'x-internal-token': 'synthetic', 'x-device-id': 'local-device' } })).status, 200)
    assert.equal(received['x-user-id'], undefined)
    assert.equal(received['x-internal-token'], undefined)
    assert.equal(received.cookie, undefined)
    assert.equal(received['x-device-id'], 'local-device')
    assert.equal((await fetch(runtime.origin + '/api/v1/admin/users', { headers: { cookie } })).status, 404)
  } finally {
    server.closeAllConnections(); backend.closeAllConnections()
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => backend.close(resolve))])
    await fs.rm(data, { recursive: true, force: true })
  }
})
