const { test } = require('node:test')
const assert = require('node:assert/strict')
const { routeService, LocalRuntime, postgresEnvironment } = require('./runtime.cjs')
const http = require('node:http')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { localProcessEnvironment } = require('./processEnvironment.cjs')

test('packaged processes cannot resolve developer tools or native libraries from user PATH', () => {
  const environment = localProcessEnvironment({
    SystemRoot: 'C:\\Windows', Path: 'C:\\Java\\bin;C:\\PostgreSQL\\bin;C:\\DeveloperTools',
    JAVA_HOME: 'C:\\Java', PGHOME: 'C:\\PostgreSQL', PGOPTIONS: '-c broken=1',
    NODE_OPTIONS: '--require injected.cjs', TEMP: 'C:\\Temp', APPDATA: 'C:\\User\\AppData',
  })
  assert.deepEqual(environment, {
    SystemRoot: 'C:\\Windows', TEMP: 'C:\\Temp', APPDATA: 'C:\\User\\AppData',
    PATH: 'C:\\Windows\\System32;C:\\Windows',
  })
})

test('desktop exposes public reading and device collections, never internal/admin endpoints', () => {
  assert.equal(routeService('/api/v1/search?keyword=x', 'GET'), 'search')
  assert.equal(routeService('/api/v1/anime/1', 'GET'), 'anime')
  assert.equal(routeService('/api/v1/users/me/favorites/1', 'POST'), 'favorite')
  for (const url of ['/api/v1/search/reindex', '/api/v1/admin/anime', '/api/v1/auth/cas/login', '/api/v1/ai/chat']) assert.equal(routeService(url, 'POST'), null)
  assert.equal(routeService('/api/v1/anime/1', 'POST'), null)
  assert.equal(routeService('/api/v1/anime/import-url', 'POST'), 'anime')
})

test('postgres environment is independent from the Windows active code page', () => {
  assert.deepEqual(postgresEnvironment('secret'), {
    PGPASSWORD: 'secret', PGCLIENTENCODING: 'UTF8', LANG: 'C', LC_ALL: 'C',
    LC_CTYPE: 'C', LC_MESSAGES: 'C', TZ: 'Asia/Shanghai',
  })
})

test('database readiness tolerates slow startup and stops retrying when the server exits', async () => {
  const runtime = new LocalRuntime('.', '.')
  runtime.pgBin = '.'
  runtime.pgEntry = { child: { exitCode: null, signalCode: null } }
  let attempts = 0
  runtime.command = async () => { if (++attempts < 4) throw new Error('starting') }
  await runtime.waitDatabase([], {}, 1000, 1)
  assert.equal(attempts, 4)
  runtime.pgEntry.child.exitCode = 1
  await assert.rejects(runtime.waitDatabase([], {}, 1000, 1), /postgres.log/)
  assert.equal(attempts, 4)
  runtime.pgEntry.child.exitCode = null
  runtime.command = async () => { throw new Error('starting') }
  await assert.rejects(runtime.waitDatabase([], {}, 10, 1), /启动超时/)
})

test('runtime requires a prebuilt PostgreSQL template instead of initdb', async () => {
  const source = await fs.readFile(path.join(__dirname, 'runtime.cjs'), 'utf8')
  assert.match(source, /postgres-template\/PG_VERSION/)
  assert.doesNotMatch(source, /initdb\.exe['\"]/)
})

test('runtime resolves PostgreSQL paths without cmd.exe short names', async () => {
  const source = await fs.readFile(path.join(__dirname, 'runtime.cjs'), 'utf8')
  assert.doesNotMatch(source, /cmd\.exe|windowsShortPath/)
  assert.match(source, /preparePostgresLayout\(\{ root: this\.root, data: this\.data \}\)/)
  // Executable, data directory, working directory and seed file all come from
  // the prepared layout instead of the package path.
  assert.match(source, /provisionDatabase\(this\.root, this\.pgData, settings\.databasePassword, this\.pgExecutable\)/)
  assert.match(source, /'-f', this\.pgSeed\]/)
  assert.match(source, /path\.dirname\(executable\)/)
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
