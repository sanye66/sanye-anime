const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const { createReadStream, createWriteStream } = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const net = require('node:net')
const { randomBytes } = require('node:crypto')

const services = ['anime', 'search', 'favorite']
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

function routeService(url, method) {
  const p = new URL(url, 'http://localhost').pathname
  if (p === '/api/v1/anime/import-url' && method === 'POST') return 'anime'
  if (/^\/api\/v1\/users\/me\/(favorites|history)(\/|$)/.test(p) && ['GET', 'POST', 'DELETE'].includes(method)) return 'favorite'
  if (method !== 'GET' && method !== 'HEAD') return null
  if (p === '/api/v1/search' || p === '/api/v1/search/external') return 'search'
  if (p === '/api/v1/home' || /^\/api\/v1\/(anime|schedule|public)(\/|$)/.test(p) || p.startsWith('/covers/')) return 'anime'
  return null
}

class LocalRuntime {
  constructor(root, data, onStatus = () => {}, onFailure = () => {}) {
    this.root = root; this.data = data; this.onStatus = onStatus; this.onFailure = onFailure
    this.children = []; this.ports = {}; this.stopping = false
    this.cookie = randomBytes(32).toString('hex')
  }

  launch(name, executable, args, env = {}) {
    const log = createWriteStream(path.join(this.data, 'logs', `${name}.log`), { flags: 'a' })
    const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['systemroot', 'windir', 'temp', 'tmp', 'path', 'userprofile', 'appdata', 'localappdata', 'comspec', 'programdata'].includes(key.toLowerCase())))
    const child = spawn(executable, args, { cwd: this.data, env: { ...base, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const entry = { name, child, log, error: null }
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
    child.on('error', error => { entry.error = error; log.end() })
    child.on('exit', () => {
      log.end()
      if (this.ready && !this.stopping) this.onFailure(new Error(`${name} stopped unexpectedly`))
    })
    this.children.push(entry)
    return entry
  }

  async command(name, executable, args, env) {
    const entry = this.launch(name, executable, args, env)
    const deadline = Date.now() + 120000
    while (entry.child.exitCode === null && entry.child.signalCode === null && !entry.error && Date.now() < deadline) await delay(100)
    if (entry.error || entry.child.exitCode !== 0) throw new Error(`${name} failed; see logs`)
  }

  async waitHealthy(entry, url) {
    for (let attempt = 0; attempt < 180; attempt++) {
      if (this.stopping || entry.error || entry.child.exitCode !== null || entry.child.signalCode !== null) throw new Error(`${entry.name} failed to start; see logs`)
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
        if (response.ok && (await response.json()).status === 'UP') return
      } catch {}
      await delay(500)
    }
    throw new Error(`${entry.name} readiness timed out; see logs`)
  }

  async start(port = 28710) {
    await fs.mkdir(path.join(this.data, 'logs'), { recursive: true })
    for (const file of ['java/bin/java.exe', 'postgres/bin/postgres.exe', 'postgres/bin/initdb.exe', 'client/index.html', 'seed.sql', ...services.map(s => `jars/${s}.jar`)]) await fs.access(path.join(this.root, file))
    // Reserve the stable renderer origin before starting any owned data process.
    this.server = http.createServer((req, res) => { void this.serve(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end() }) })
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(port, '127.0.0.1', resolve) })
    this.origin = `http://127.0.0.1:${this.server.address().port}`
    let settings
    try { settings = JSON.parse(await fs.readFile(path.join(this.data, 'settings.json'), 'utf8')) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      settings = { databasePassword: randomBytes(32).toString('hex') }
      await fs.writeFile(path.join(this.data, 'settings.json'), JSON.stringify(settings), { flag: 'wx' })
    }
    if (!/^[a-f0-9]{64}$/.test(settings.databasePassword)) throw new Error('Invalid local database configuration')
    this.pgData = path.join(this.data, 'postgres')
    this.pgBin = path.join(this.root, 'postgres', 'bin')
    this.onStatus('初始化本地数据库')
    const pgEnv = { PGPASSWORD: settings.databasePassword }
    try { await fs.access(path.join(this.pgData, 'PG_VERSION')) }
    catch {
      const pwfile = path.join(this.data, 'init-password.tmp')
      await fs.writeFile(pwfile, settings.databasePassword, { mode: 0o600 })
      try { await this.command('initdb', path.join(this.pgBin, 'initdb.exe'), ['-D', this.pgData, '-U', 'sanye', '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale', `--pwfile=${pwfile}`], pgEnv) }
      finally { await fs.rm(pwfile, { force: true }) }
    }
    const pgPort = await freePort()
    this.pgPort = pgPort
    this.pgEntry = this.launch('postgres', path.join(this.pgBin, 'postgres.exe'), ['-D', this.pgData, '-p', String(pgPort), '-h', '127.0.0.1'], pgEnv)
    const pgArgs = ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'sanye', '-d', 'postgres']
    await this.command('database-ready', path.join(this.pgBin, 'pg_isready.exe'), pgArgs, pgEnv).catch(async () => {
      await delay(1500)
      await this.command('database-ready', path.join(this.pgBin, 'pg_isready.exe'), pgArgs, pgEnv)
    })
    // Each application uses its own Flyway schema inside this private database.
    const baseEnv = {
      SANYE_ENV: 'local', DB_URL: `jdbc:postgresql://127.0.0.1:${pgPort}/postgres`, DB_USERNAME: 'sanye', DB_PASSWORD: settings.databasePassword,
      NACOS_ENABLED: 'false', SENTINEL_ENABLED: 'false', HOME_CACHE_ENABLED: 'false',
      SANYE_MANAGE_TOKEN: randomBytes(32).toString('hex'), CATALOG_STORE: 'pg', MEDIA_STORE: 'pg', LEGAL_STORE: 'pg',
    }
    for (const service of services) {
      this.onStatus(`启动 ${service}`)
      this.ports[service] = await freePort()
      const args = ['-Xms64m', '-Xmx384m', '-jar', path.join(this.root, 'jars', `${service}.jar`),
        '--server.address=127.0.0.1', `--server.port=${this.ports[service]}`, '--management.server.port=' + this.ports[service],
        '--management.health.redis.enabled=false', '--management.health.rabbit.enabled=false',
        '--management.health.elasticsearch.enabled=false', '--spring.rabbitmq.listener.simple.auto-startup=false',
        '--sanye.event.enabled=false', '--sanye.event.publisher-enabled=false', '--sanye.search.catalog-only=true',
        '--spring.datasource.hikari.maximum-pool-size=5', '--spring.datasource.hikari.minimum-idle=1']
      const entry = this.launch(service, path.join(this.root, 'java/bin/java.exe'), args,
        { ...baseEnv, SANYE_ANIME_SERVICE_URL: `http://127.0.0.1:${this.ports.anime}` })
      await this.waitHealthy(entry, `http://127.0.0.1:${this.ports[service]}/actuator/health`)
      if (service === 'anime') {
        const marker = path.join(this.data, 'catalog-seeded')
        try { await fs.access(marker) }
        catch {
          await this.command('fixed-catalog', path.join(this.pgBin, 'psql.exe'), [...pgArgs, '-v', 'ON_ERROR_STOP=1', '-f', path.join(this.root, 'seed.sql')], { ...pgEnv, PGCLIENTENCODING: 'UTF8' })
          await fs.writeFile(marker, '1')
        }
      }
    }
    this.ready = true
    return this.origin
  }

  async serve(req, res) {
    if (req.headers.host !== new URL(this.origin).host) { res.writeHead(403); res.end(); return }
    const pathname = new URL(req.url, this.origin).pathname
    const target = routeService(req.url, req.method)
    if (target || pathname.startsWith('/api/') || pathname.startsWith('/covers/')) {
      if (!req.headers.cookie?.split(';').some(c => c.trim() === `sanyeDesktop=${this.cookie}`) || (req.headers.origin && req.headers.origin !== this.origin)) { res.writeHead(403); res.end(); return }
      if (!target) { res.writeHead(404); res.end(); return }
      if (!this.ready) { res.writeHead(503); res.end(); return }
      const headers = { ...req.headers, host: `127.0.0.1:${this.ports[target]}` }
      for (const key of ['cookie', 'authorization', 'x-user-id', 'x-caller-name', 'x-internal-token', 'connection']) delete headers[key]
      const upstream = http.request({ host: '127.0.0.1', port: this.ports[target], path: req.url, method: req.method, headers }, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res)
      })
      upstream.setTimeout(45000, () => upstream.destroy())
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
      req.on('aborted', () => upstream.destroy()); req.pipe(upstream)
      return
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
    const root = path.join(this.root, 'client')
    const file = path.resolve(root, '.' + decodeURIComponent(pathname))
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return }
    let actual = file
    try { if (!(await fs.stat(file)).isFile()) actual = path.join(root, 'index.html') }
    catch { if (path.extname(file)) { res.writeHead(404); res.end(); return }; actual = path.join(root, 'index.html') }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' }
    res.writeHead(200, { 'Content-Type': mime[path.extname(actual)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' })
    if (req.method === 'HEAD') res.end()
    else createReadStream(actual).on('error', () => res.destroy()).pipe(res)
  }

  async stop() {
    if (this.stopPromise) return this.stopPromise
    this.stopping = true; this.ready = false
    this.stopPromise = (async () => {
      if (this.server?.listening) { this.server.closeAllConnections(); await new Promise(resolve => this.server.close(resolve)) }
      for (const entry of [...this.children].reverse()) {
        if (entry === this.pgEntry || entry.child.exitCode !== null || entry.child.signalCode !== null || !entry.child.pid) continue
        entry.child.kill()
        for (let i = 0; i < 100 && entry.child.exitCode === null && entry.child.signalCode === null; i++) await delay(100)
        if (entry.child.exitCode === null && entry.child.signalCode === null) throw new Error(`Could not stop ${entry.name}`)
      }
      if (this.pgEntry && this.pgEntry.child.exitCode === null && this.pgEntry.child.signalCode === null) {
        await this.command('database-stop', path.join(this.pgBin, 'pg_ctl.exe'), ['-D', this.pgData, '-m', 'fast', '-w', '-t', '30', 'stop'])
      }
    })()
    return this.stopPromise
  }
}

module.exports = { LocalRuntime, routeService, freePort }
