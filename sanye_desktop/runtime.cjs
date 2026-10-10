const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const { createReadStream, createWriteStream } = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const net = require('node:net')
const { randomBytes } = require('node:crypto')
const { provisionDatabase, prepareRuntimeLayout, setRolePassword } = require('./postgresTemplate.cjs')
const { localProcessEnvironment } = require('./processEnvironment.cjs')

const services = ['anime', 'search', 'favorite']
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
// Files that must exist inside the package for the local services to run. A
// security product that quarantines one of them is the most common reason a
// package works on one PC and reports a startup failure on another.
const requiredFiles = () => [
  'java/bin/java.exe',
  ...['postgres', 'pg_ctl', 'pg_isready', 'psql'].map(name => `postgres/bin/${name}.exe`),
  'postgres-template/PG_VERSION',
  'client/index.html',
  'seed.sql',
  ...services.map(service => `jars/${service}.jar`),
]
// The renderer origin owns this application's local storage, so the preferred
// port stays first. A nearby free port is only used when another program
// already owns the preferred one, which otherwise aborts the whole startup.
const rendererPorts = () => Array.from({ length: 10 }, (_, index) => 28710 + index)
const serviceReadyTimeout = () => {
  const configured = Number(process.env.SANYE_DESKTOP_SERVICE_READY_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : 240000
}
const databaseReadyTimeout = () => {
  const configured = Number(process.env.SANYE_DESKTOP_DATABASE_READY_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : 180000
}

// A ZIP/JAR ends with an end-of-central-directory record. Reading its signature
// is a cheap way to prove the archive is structurally intact; a truncated file
// (interrupted extraction, quarantined download, full disk) fails here and the
// JVM would otherwise exit with "Invalid or corrupt jarfile".
async function readableJar(file) {
  const handle = await fs.open(file, 'r').catch(() => null)
  if (!handle) return false
  try {
    const size = (await handle.stat()).size
    const window = Math.min(size, 66000)
    if (window < 22) return false
    const buffer = Buffer.alloc(window)
    await handle.read(buffer, 0, window, size - window)
    return buffer.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  } finally { await handle.close() }
}

function postgresEnvironment(password) {
  return {
    PGPASSWORD: password,
    PGCLIENTENCODING: 'UTF8',
    LANG: 'C',
    LC_ALL: 'C',
    LC_CTYPE: 'C',
    LC_MESSAGES: 'C',
    TZ: 'Asia/Shanghai',
  }
}

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
    this.children = []; this.ports = {}; this.stopping = false; this.portAttempts = []
    this.cookie = randomBytes(32).toString('hex')
  }

  launch(name, executable, args, env = {}, cwd = this.data) {
    const log = createWriteStream(path.join(this.data, 'logs', `${name}.log`), { flags: 'a' })
    const base = localProcessEnvironment()
    const child = spawn(executable, args, { cwd, env: { ...base, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const entry = { name, child, log, error: null }
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
    // The spawn error never reaches stdout or stderr, so record it here or the
    // log the user is asked to send stays empty.
    child.on('error', error => { entry.error = error; log.write(`\n[sanye] 进程启动失败 spawn failed: ${error.code || ''} ${error.message}\n`); log.end() })
    child.on('exit', code => {
      log.end()
      // Services that die after startup are reported with their exit code and log tail.
      if (this.ready && !this.stopping) {
        void this.detailWithLog(name, `${name} 服务意外停止（退出码 ${code}）。日志文件：${name}.log`)
          .then(message => this.onFailure(new Error(message)))
      }
    })
    this.children.push(entry)
    return entry
  }

  async readLogTail(name, limit = 800) {
    try {
      const text = await fs.readFile(path.join(this.data, 'logs', `${name}.log`), 'utf8')
      return text.trim().split(/\r?\n/).slice(-8).join('\n').slice(-limit)
    } catch { return '' }
  }

  async detailWithLog(name, message) {
    const tail = await this.readLogTail(name)
    return tail ? `${message}\n${tail}` : message
  }

  // A first start on a slow or freshly scanned machine can take minutes. Showing
  // elapsed time keeps the user (and a remote support call) from assuming a hang.
  async withProgress(label, work) {
    let seconds = 0
    const interval = Number(process.env.SANYE_DESKTOP_PROGRESS_MS) > 0 ? Number(process.env.SANYE_DESKTOP_PROGRESS_MS) : 5000
    this.onStatus(`${label}（已等待 ${seconds} 秒）`)
    const ticker = setInterval(() => {
      seconds += Math.max(1, Math.round(interval / 1000))
      this.onStatus(`${label}（已等待 ${seconds} 秒）`)
    }, interval)
    ticker.unref?.()
    try { return await work() } finally { clearInterval(ticker) }
  }

  async preflight() {
    const missing = []
    for (const file of requiredFiles()) {
      const target = path.join(this.root, file)
      const stat = await fs.stat(target).catch(() => null)
      if (!stat || !stat.isFile() || stat.size === 0) missing.push(file)
    }
    if (missing.length) {
      throw new Error(`软件包文件缺失或被安全软件隔离：${missing.join('、')}。请重新完整解压软件包；如果杀毒软件提示已清除或隔离相关文件，请先恢复并加入信任，然后重试。`)
    }
    const integrity = await this.packageIntegrity()
    if (integrity.problems.length) {
      throw new Error(`软件包文件不完整或已损坏：${integrity.problems.join('；')}。请删除当前目录后重新完整解压软件包（不要只拖出单个文件，也不要直接在压缩软件里运行）；如果杀毒软件报过清除或隔离，请先恢复并加入信任。`)
    }
    // A machine that has never run the app must still have room for the private
    // database; failing here with a clear message beats a half-written cluster.
    await fs.mkdir(this.data, { recursive: true })
    if (typeof fs.statfs !== 'function') return
    const stats = await fs.statfs(this.data)
    const availableMb = Math.floor((stats.bavail * stats.bsize) / 1048576)
    const requiredMb = Number(process.env.SANYE_DESKTOP_MIN_FREE_MB) > 0 ? Number(process.env.SANYE_DESKTOP_MIN_FREE_MB) : 1024
    if (availableMb < requiredMb) {
      throw new Error(`本地磁盘可用空间不足：数据目录所在磁盘剩余约 ${availableMb}MB，首次启动至少需要 ${requiredMb}MB。请清理磁盘后重试。`)
    }
  }

  // The package ships artifact-manifest.json with the exact size and hash of
  // every file, so an interrupted extraction, a full disk or a security product
  // that truncated a file can be detected before anything starts. Sizes alone
  // catch truncation; the archive signature catches a jar that survived with the
  // wrong bytes.
  async packageIntegrity() {
    const problems = []
    const manifestPath = path.join(this.root, '..', '..', 'artifact-manifest.json')
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8').catch(() => 'null'))
    if (manifest?.files) {
      const expected = new Map(manifest.files.map(entry => [String(entry.path).replace(/\\/g, '/').toLowerCase(), entry]))
      for (const file of requiredFiles()) {
        const entry = expected.get(`resources/runtime/${file}`.toLowerCase())
        if (!entry) continue
        const stat = await fs.stat(path.join(this.root, file)).catch(() => null)
        if (!stat) problems.push(`${file} 缺失`)
        else if (stat.size !== entry.size) problems.push(`${file} 大小不符（应为 ${entry.size} 字节，实际 ${stat.size} 字节）`)
      }
    }
    for (const service of services) {
      const jar = path.join(this.root, 'jars', `${service}.jar`)
      if (!await readableJar(jar)) problems.push(`jars/${service}.jar 不是可读的 JAR 文件`)
    }
    return { checked: !!manifest?.files, problems }
  }

  async inventory() {
    const entries = []
    for (const file of requiredFiles()) {
      const target = path.join(this.root, file)
      const stat = await fs.stat(target).catch(() => null)
      entries.push({ path: file, present: !!stat, size: stat?.size ?? 0 })
    }
    return entries
  }

  async command(name, executable, args, env) {
    // PostgreSQL tools resolve paths from their own location: keep the working
    // directory next to the executable instead of the user data directory.
    const entry = this.launch(name, executable, args, env, path.dirname(executable))
    const deadline = Date.now() + 120000
    while (entry.child.exitCode === null && entry.child.signalCode === null && !entry.error && Date.now() < deadline) await delay(100)
    if (entry.error || entry.child.exitCode !== 0) throw new Error(await this.detailWithLog(name, `${name} failed; see logs`))
  }

  // A previous session can die without releasing the cluster (Task Manager,
  // power loss, crash). PostgreSQL then refuses both startup and repair with
  // "pre-existing shared memory block is still in use", which is exactly the
  // "it worked yesterday and now it never starts" report. The desktop owns this
  // data directory and a second instance is prevented by the single-instance
  // lock, so a server still attached to it is a leftover: stop it and take over.
  async reclaimOrphanedDatabase() {
    const pidFile = path.join(this.pgData, 'postmaster.pid')
    const content = await fs.readFile(pidFile, 'utf8').catch(() => null)
    if (!content) return { reclaimed: false, locked: false, stale: false }
    const pid = Number(content.split(/\r?\n/)[0])
    // A forced kill (Task Manager, crash, power loss) leaves postmaster.pid
    // behind. PostgreSQL then refuses both startup and repair with
    // "pre-existing shared memory block is still in use", so a pid file whose
    // process is gone must be cleared instead of waited on.
    const alive = Number.isSafeInteger(pid) && pid > 0 && (() => {
      try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
    })()
    if (!alive) {
      await fs.rm(pidFile, { force: true })
      return { reclaimed: true, locked: false, stale: true }
    }
    this.onStatus('接管上次未正常退出的本地数据库')
    try {
      await this.command('database-orphan-stop', path.join(this.pgBin, 'pg_ctl.exe'), ['-D', this.pgData, '-m', 'fast', '-w', '-t', '60', 'stop'])
    } catch {
      // "no server running" for a stale pid file is expected and harmless; the
      // readiness loop below decides whether the cluster was really released.
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      if (!await fs.readFile(pidFile, 'utf8').catch(() => null)) return { reclaimed: true, locked: false, stale: false }
      await delay(500)
    }
    return { reclaimed: false, locked: true, stale: false }
  }

  // The screenshot-level failure ("anime failed to start") is reported with its
  // concrete reason and the tail of that service's log, so the dialog the user
  // sees already contains what a remote diagnosis needs.
  async stoppedReason(entry) {
    if (entry.error) return `进程无法启动（${entry.error.code || 'unknown'}：${entry.error.message}）`
    if (entry.child.signalCode) return `进程被强制结束（信号 ${entry.child.signalCode}，通常是被安全软件或系统策略终止）`
    if (entry.child.exitCode !== null) return `进程已退出（退出码 ${entry.child.exitCode}）`
    return '进程已停止'
  }

  async waitHealthy(entry, url, timeout = serviceReadyTimeout()) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (this.stopping || entry.error || entry.child.exitCode !== null || entry.child.signalCode !== null) {
        const reason = await this.stoppedReason(entry)
        throw new Error(await this.detailWithLog(entry.name, `${entry.name} 服务启动失败：${reason}。日志文件：${entry.name}.log`))
      }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
        if (response.ok && (await response.json()).status === 'UP') return
      } catch {}
      await delay(500)
    }
    throw new Error(await this.detailWithLog(entry.name, `${entry.name} readiness timed out after ${Math.round(timeout / 1000)}s; see logs`))
  }

  async waitDatabase(args, env, timeout = 120000, interval = 500) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const entry = this.pgEntry
      if (this.stopping || entry.error || entry.child.exitCode !== null || entry.child.signalCode !== null) throw new Error(await this.detailWithLog('postgres', '本地数据库启动失败，请查看 postgres.log'))
      try {
        await this.command('database-ready', path.join(this.pgBin, 'pg_isready.exe'), [...args, '-t', '2'], env)
        return
      } catch { await delay(interval) }
    }
    throw new Error(await this.detailWithLog('postgres', '本地数据库启动超时，请查看 postgres.log 和 database-ready.log'))
  }

  // Reserve the renderer origin before starting any owned data process.
  async listen(ports = rendererPorts()) {
    // Callers may name one port or a range; an occupied single port falls back
    // to the next free one just like a range.
    const candidates = Array.isArray(ports) ? ports : [ports]
    this.server = http.createServer((req, res) => { void this.serve(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end() }) })
    for (const port of candidates) {
      try {
        await new Promise((resolve, reject) => {
          const onError = error => { this.server.removeListener('listening', onListening); reject(error) }
          const onListening = () => { this.server.removeListener('error', onError); resolve() }
          this.server.once('error', onError)
          this.server.once('listening', onListening)
          this.server.listen(port, '127.0.0.1')
        })
        this.preferredPort = candidates[0]
        this.portFallback = port !== candidates[0]
        return port
      } catch (error) {
        this.portAttempts.push({ port, code: error.code || error.message })
        if (error.code !== 'EADDRINUSE') throw error
      }
    }
    throw new Error(`本地服务端口 ${candidates[0]}-${candidates[candidates.length - 1]} 均被其他程序占用，请关闭占用这些端口的程序后重试`)
  }

  async start(ports = rendererPorts()) {
    try { return await this.run(ports) } catch (error) {
      // The recipient can send this file back when the dialog alone is not enough.
      await this.recordFailure(error).catch(() => {})
      throw error
    }
  }

  async recordFailure(error) {
    const directory = path.join(this.data, 'logs')
    await fs.mkdir(directory, { recursive: true })
    const files = await this.inventory().catch(() => [])
    const record = {
      at: new Date().toISOString(),
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
      root: this.root,
      data: this.data,
      // Shows whether PostgreSQL, Java and the JARs run from an ASCII mirror.
      layout: this.layout ?? null,
      origin: this.origin ?? null,
      preferredPort: this.preferredPort ?? null,
      portFallback: this.portFallback ?? null,
      portAttempts: this.portAttempts,
      ports: { ...this.ports },
      postgresPort: this.pgPort ?? null,
      ready: !!this.ready,
      children: this.children.map(entry => ({
        name: entry.name, pid: entry.child.pid ?? null,
        exitCode: entry.child.exitCode ?? null, signalCode: entry.child.signalCode ?? null,
        spawnError: entry.error ? `${entry.error.code || ''} ${entry.error.message}` : null,
      })),
      // A quarantined or partially extracted JAR/EXE shows up here.
      missingPackageFiles: files.filter(entry => !entry.present || entry.size === 0).map(entry => entry.path),
      packageFiles: files,
      process: {
        platform: process.platform, arch: process.arch,
        node: process.versions.node, electron: process.versions.electron ?? null,
        osVersion: process.getSystemVersion?.() ?? null,
        totalMemoryMb: Math.round((require('node:os').totalmem?.() ?? 0) / 1048576) || null,
      },
    }
    const logs = {}
    for (const name of ['anime', 'search', 'favorite', 'postgres', 'database-ready', 'fixed-catalog']) logs[name] = await this.readLogTail(name, 2000)
    await fs.writeFile(path.join(directory, 'startup-error.log'),
      `[sanye] 本地服务启动失败 ${record.at}\n${JSON.stringify(record, null, 2)}\n${JSON.stringify(logs, null, 2)}\n\n`, { flag: 'a' })
  }

  // PostgreSQL resolves its own executable path, and the Windows JDK launcher
  // converts java.home and every argument, through the active ANSI code page. A
  // non-ASCII package or user data path therefore reaches them as '?' unless the
  // layout below moves that path into an ASCII-only mirror.
  async prepareLayout() {
    await fs.mkdir(this.data, { recursive: true })
    this.layout = await prepareRuntimeLayout({ root: this.root, data: this.data })
    // Record the renderer origin next to the layout so a returned, otherwise
    // successful run still shows whether the preferred port drifted.
    await fs.writeFile(path.join(this.data, 'runtime-layout.json'), JSON.stringify({
      ...this.layout,
      renderer: { origin: this.origin ?? null, port: this.server?.address()?.port ?? null, preferredPort: this.preferredPort ?? null, portFallback: this.portFallback ?? null },
      at: new Date().toISOString(),
    }, null, 2))
    this.pgData = this.layout.database
    this.pgBin = this.layout.bin
    this.pgExecutable = this.layout.executable
    this.pgSeed = this.layout.seed
    this.pgCwd = path.dirname(this.pgExecutable)
    // The JVM only ever sees these two paths, never the packaged ones.
    this.javaExecutable = path.join(this.layout.java, 'bin', 'java.exe')
    this.jarDirectory = this.layout.jars
    return this.layout
  }

  async run(ports = rendererPorts()) {
    await fs.mkdir(path.join(this.data, 'logs'), { recursive: true })
    await this.preflight()
    await this.listen(ports)
    this.origin = `http://127.0.0.1:${this.server.address().port}`
    let settings
    try { settings = JSON.parse(await fs.readFile(path.join(this.data, 'settings.json'), 'utf8')) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      settings = { databasePassword: randomBytes(32).toString('hex') }
      await fs.writeFile(path.join(this.data, 'settings.json'), JSON.stringify(settings), { flag: 'wx' })
    }
    if (!/^[a-f0-9]{64}$/.test(settings.databasePassword)) throw new Error('Invalid local database configuration')
    this.onStatus('准备本地运行环境')
    await this.prepareLayout()
    this.onStatus('初始化本地数据库')
    const pgEnv = postgresEnvironment(settings.databasePassword)
    const provisioned = await this.withProgress('初始化本地数据库', () => provisionDatabase(this.root, this.pgData, settings.databasePassword, this.pgExecutable))
    // PostgreSQL answers pg_isready without authenticating, so an existing
    // cluster whose credential no longer matches settings.json still looked
    // healthy and then killed every Java service with "password authentication
    // failed". Re-assert the role before anything connects to it.
    if (!provisioned) {
      const orphan = await this.withProgress('接管上次未正常退出的本地数据库', () => this.reclaimOrphanedDatabase())
      if (orphan.locked) {
        throw new Error('本地数据库仍被其他进程占用，可能是另一个“三叶动漫”实例正在运行。请关闭其它实例后重试；仍然失败时重启电脑。')
      }
      await this.withProgress('校验本地数据库账号', () => setRolePassword(
        this.pgExecutable, this.pgData, settings.databasePassword,
        path.join(this.data, 'logs', 'database-credentials.log'),
      ))
    }
    const pgPort = await freePort()
    this.pgPort = pgPort
    this.pgEntry = this.launch('postgres', this.pgExecutable, ['-D', this.pgData, '-p', String(pgPort), '-h', '127.0.0.1'], pgEnv, this.pgCwd)
    const pgArgs = ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'sanye', '-d', 'postgres']
    this.onStatus('等待本地数据库就绪')
    await this.withProgress('等待本地数据库就绪', () => this.waitDatabase(pgArgs, pgEnv, databaseReadyTimeout()))
    // pg_isready only proves the server accepts connections. Authenticate for
    // real, so a credential problem is reported here instead of surfacing as a
    // mysterious service exit two steps later.
    try {
      await this.command('database-login', path.join(this.pgBin, 'psql.exe'), [...pgArgs, '-X', '-w', '-t', '-c', 'select 1'], pgEnv)
    } catch (error) {
      throw new Error(`本地数据库账号校验失败：应用无法使用保存的账号连接本地数据库。请查看 database-login.log 与 database-credentials.log 后重试。原始信息：${error.message}`)
    }
    // Each application uses its own Flyway schema inside this private database.
    const baseEnv = {
      SANYE_ENV: 'local', DB_URL: `jdbc:postgresql://127.0.0.1:${pgPort}/postgres`, DB_USERNAME: 'sanye', DB_PASSWORD: settings.databasePassword,
      NACOS_ENABLED: 'false', SENTINEL_ENABLED: 'false', HOME_CACHE_ENABLED: 'false',
      SANYE_MANAGE_TOKEN: randomBytes(32).toString('hex'), CATALOG_STORE: 'pg', MEDIA_STORE: 'pg', LEGAL_STORE: 'pg',
    }
    // The services do not depend on one another for readiness. Allocate their
    // ports first, then start and probe them together to avoid additive waits.
    await Promise.all(services.map(async service => { this.ports[service] = await freePort() }))
    await Promise.all(services.map(async service => {
      this.onStatus(`启动 ${service}`)
      const args = ['-Xms64m', '-Xmx384m', '-jar', path.join(this.jarDirectory, `${service}.jar`),
        '--server.address=127.0.0.1', `--server.port=${this.ports[service]}`, '--management.server.port=' + this.ports[service],
        '--management.health.redis.enabled=false', '--management.health.rabbit.enabled=false',
        '--management.health.elasticsearch.enabled=false', '--spring.rabbitmq.listener.simple.auto-startup=false',
        '--sanye.event.enabled=false', '--sanye.event.publisher-enabled=false', '--sanye.search.catalog-only=true',
        '--spring.datasource.hikari.maximum-pool-size=5', '--spring.datasource.hikari.minimum-idle=1']
      const entry = this.launch(service, this.javaExecutable, args,
        { ...baseEnv, SANYE_ANIME_SERVICE_URL: `http://127.0.0.1:${this.ports.anime}` })
      await this.withProgress(`启动 ${service}`, () => this.waitHealthy(entry, `http://127.0.0.1:${this.ports[service]}/actuator/health`))
      if (service === 'anime') {
        const marker = path.join(this.data, 'catalog-seeded')
        try { await fs.access(marker) }
        catch {
          await this.command('fixed-catalog', path.join(this.pgBin, 'psql.exe'), [...pgArgs, '-X', '-w', '-v', 'ON_ERROR_STOP=1', '-f', this.pgSeed], pgEnv)
          await fs.writeFile(marker, '1')
        }
      }
    }))
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

module.exports = { LocalRuntime, routeService, freePort, postgresEnvironment, rendererPorts }
