const { test } = require('node:test')
const assert = require('node:assert/strict')
const { routeService, LocalRuntime, postgresEnvironment, freePort } = require('./runtime.cjs')
const http = require('node:http')
const net = require('node:net')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { localProcessEnvironment } = require('./processEnvironment.cjs')

// `sanye_deploy/.local/**` 被 .gitignore 忽略，干净检出（CI）里没有该目录，而 mkdtemp
// 不会创建父目录：先前这些用例在 `windows-2025` runner 上统一以 ENOENT 失败。
async function tempBase(prefix) {
  const base = path.resolve(__dirname, `../sanye_deploy/.local/${prefix}`)
  await fs.mkdir(path.dirname(base), { recursive: true })
  return fs.mkdtemp(base)
}

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

test('renderer port conflict falls back to the next free port instead of aborting startup', async () => {
  const runtime = new LocalRuntime('.', '.')
  const busy = []
  for (let index = 0; index < 2; index++) {
    const server = net.createServer()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    busy.push(server)
  }
  const fallback = await freePort()
  try {
    const used = await runtime.listen([...busy.map(server => server.address().port), fallback])
    assert.equal(used, fallback)
    assert.equal(runtime.server.address().port, fallback)
    assert.equal(runtime.preferredPort, busy[0].address().port)
    assert.equal(runtime.portFallback, true)
  } finally {
    runtime.server.closeAllConnections()
    await new Promise(resolve => runtime.server.close(resolve))
    await Promise.all(busy.map(server => new Promise(resolve => server.close(resolve))))
  }
})

test('a fully occupied renderer port range reports the blocked ports', async () => {
  const runtime = new LocalRuntime('.', '.')
  const servers = []
  for (let index = 0; index < 2; index++) {
    const server = net.createServer()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
  }
  try {
    await assert.rejects(runtime.listen(servers.map(server => server.address().port)), /均被其他程序占用/)
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
  }
})

test('a service that cannot spawn records the OS error in its log', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-log-'))
  const runtime = new LocalRuntime('.', data)
  await fs.mkdir(path.join(data, 'logs'), { recursive: true })
  const entry = runtime.launch('anime', path.join(data, 'missing-java.exe'), [], {})
  await new Promise(resolve => entry.child.once('error', resolve))
  let text = ''
  for (let attempt = 0; attempt < 100 && !text.includes('spawn failed'); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20))
    text = await fs.readFile(path.join(data, 'logs', 'anime.log'), 'utf8').catch(() => '')
  }
  assert.match(text, /spawn failed/)
  assert.match(text, /ENOENT/)
  await fs.rm(data, { recursive: true, force: true })
})

test('service readiness failure reports the wait budget and the log tail', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-log-'))
  const runtime = new LocalRuntime('.', data)
  await fs.mkdir(path.join(data, 'logs'), { recursive: true })
  await fs.writeFile(path.join(data, 'logs', 'anime.log'), 'APPLICATION FAILED TO START\nCaused by: java.net.BindException\n')
  const entry = { name: 'anime', child: { exitCode: null, signalCode: null }, error: null }
  await assert.rejects(runtime.waitHealthy(entry, 'http://127.0.0.1:1/actuator/health', 1000), error => {
    assert.match(error.message, /readiness timed out after \d+s/)
    assert.match(error.message, /java\.net\.BindException/)
    return true
  })
  await fs.rm(data, { recursive: true, force: true })
})

// The failure shown in the recipient screenshot ("anime failed to start") must
// carry the exit code and the log tail, not just point at a log file.
test('a service that exits during startup reports its exit code and log tail', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-log-'))
  const runtime = new LocalRuntime('.', data)
  await fs.mkdir(path.join(data, 'logs'), { recursive: true })
  await fs.writeFile(path.join(data, 'logs', 'anime.log'), 'Caused by: org.flywaydb.core.api.FlywayException: migration failed\n')
  const entry = { name: 'anime', child: { exitCode: 1, signalCode: null }, error: null }
  await assert.rejects(runtime.waitHealthy(entry, 'http://127.0.0.1:1/actuator/health', 5000), error => {
    assert.match(error.message, /anime 服务启动失败：进程已退出（退出码 1）/)
    assert.match(error.message, /anime\.log/)
    assert.match(error.message, /FlywayException/)
    return true
  })
  await fs.rm(data, { recursive: true, force: true })
})

test('a service killed during startup is identified as terminated rather than a code defect', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-log-'))
  const runtime = new LocalRuntime('.', data)
  await fs.mkdir(path.join(data, 'logs'), { recursive: true })
  const entry = { name: 'favorite', child: { exitCode: null, signalCode: 'SIGKILL' }, error: null }
  assert.equal(await runtime.stoppedReason(entry), '进程被强制结束（信号 SIGKILL，通常是被安全软件或系统策略终止）')
  const spawnFailure = { name: 'anime', child: { exitCode: null, signalCode: null }, error: Object.assign(new Error('spawn EPERM'), { code: 'EPERM' }) }
  assert.match(await runtime.stoppedReason(spawnFailure), /EPERM/)
  await fs.rm(data, { recursive: true, force: true })
})

test('a service that dies after startup reports its exit code and log tail', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-log-'))
  const runtime = new LocalRuntime('.', data)
  const failures = []
  runtime.onFailure = error => failures.push(error.message)
  runtime.ready = true
  await fs.mkdir(path.join(data, 'logs'), { recursive: true })
  // A real process that exits immediately, with a log line that must be surfaced.
  const entry = runtime.launch('anime', process.execPath, ['-e', 'console.error("OutOfMemoryError: Java heap space")'])
  for (let attempt = 0; attempt < 150 && !failures.length; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(failures.length, 1, 'expected exactly one unexpected-stop report')
  assert.match(failures[0], /anime 服务意外停止（退出码 0）/)
  assert.match(failures[0], /OutOfMemoryError/)
  await fs.rm(data, { recursive: true, force: true })
})

test('startup failures are recorded where the failure dialog points', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-log-'))
  const runtime = new LocalRuntime('.', data)
  await runtime.recordFailure(new Error('synthetic startup failure'))
  const text = await fs.readFile(path.join(data, 'logs', 'startup-error.log'), 'utf8')
  assert.match(text, /synthetic startup failure/)
  assert.match(text, /"data":/)
  assert.match(text, /"children":/)
  await fs.rm(data, { recursive: true, force: true })
})

test('a package missing a required runtime file reports which file to restore', async () => {
  const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-package-'))
  const root = path.join(packageRoot, 'resources', 'runtime')
  await fs.mkdir(root, { recursive: true })
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-data-'))
  const runtime = new LocalRuntime(root, data)
  await assert.rejects(runtime.preflight(), error => {
    assert.match(error.message, /软件包文件缺失或被安全软件隔离/)
    assert.match(error.message, /jars\/anime\.jar/)
    assert.match(error.message, /加入信任/)
    return true
  })
  await fs.mkdir(path.join(root, 'jars'), { recursive: true })
  await fs.writeFile(path.join(root, 'jars', 'anime.jar'), 'jar')
  const inventory = await runtime.inventory()
  assert.equal(inventory.find(entry => entry.path === 'jars/anime.jar').present, true)
  assert.equal(inventory.find(entry => entry.path === 'postgres/bin/postgres.exe').present, false)
  await fs.rm(packageRoot, { recursive: true, force: true })
  await fs.rm(data, { recursive: true, force: true })
})

test('long startup phases keep reporting elapsed time instead of looking frozen', async () => {
  const runtime = new LocalRuntime('.', '.')
  const statuses = []
  runtime.onStatus = status => statuses.push(status)
  const previous = process.env.SANYE_DESKTOP_PROGRESS_MS
  process.env.SANYE_DESKTOP_PROGRESS_MS = '5'
  try {
    await runtime.withProgress('初始化本地数据库', () => new Promise(resolve => setTimeout(resolve, 30)))
  } finally {
    if (previous === undefined) delete process.env.SANYE_DESKTOP_PROGRESS_MS
    else process.env.SANYE_DESKTOP_PROGRESS_MS = previous
  }
  assert.match(statuses[0], /初始化本地数据库（已等待 0 秒）/)
  assert.ok(statuses.length >= 2, `expected repeated progress updates, got ${statuses.length}`)
})

test('a machine without room for the local database fails before writing a cluster', async () => {
  // Keep the package layout inside the temp directory so the manifest lookup
  // never reaches outside the sandbox.
  const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-package-'))
  const root = path.join(packageRoot, 'resources', 'runtime')
  await fs.mkdir(root, { recursive: true })
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-desktop-data-'))
  const required = ['java/bin/java.exe', 'postgres/bin/postgres.exe', 'postgres/bin/pg_ctl.exe', 'postgres/bin/pg_isready.exe',
    'postgres/bin/psql.exe', 'postgres-template/PG_VERSION', 'client/index.html', 'seed.sql', 'jars/anime.jar', 'jars/search.jar', 'jars/favorite.jar']
  for (const file of required) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
    // The jars need a readable archive structure to get past the integrity check.
    const bytes = file.endsWith('.jar')
      ? Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])])
      : Buffer.from('placeholder')
    await fs.writeFile(path.join(root, file), bytes)
  }
  const runtime = new LocalRuntime(root, data)
  const previous = process.env.SANYE_DESKTOP_MIN_FREE_MB
  process.env.SANYE_DESKTOP_MIN_FREE_MB = '100000000'
  try {
    await assert.rejects(runtime.preflight(), error => {
      assert.match(error.message, /本地磁盘可用空间不足/)
      assert.match(error.message, /MB，首次启动至少需要 100000000MB/)
      return true
    })
  } finally {
    if (previous === undefined) delete process.env.SANYE_DESKTOP_MIN_FREE_MB
    else process.env.SANYE_DESKTOP_MIN_FREE_MB = previous
  }
  await fs.rm(packageRoot, { recursive: true, force: true })
  await fs.rm(data, { recursive: true, force: true })
})

test('port attempts are recorded so a fully blocked range is diagnosable', async () => {
  const runtime = new LocalRuntime('.', '.')
  const servers = []
  for (let index = 0; index < 2; index++) {
    const server = net.createServer()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
  }
  const ports = servers.map(server => server.address().port)
  try {
    await assert.rejects(runtime.listen(ports), /均被其他程序占用/)
    assert.deepEqual(runtime.portAttempts.map(attempt => attempt.port), ports)
    assert.ok(runtime.portAttempts.every(attempt => attempt.code === 'EADDRINUSE'))
  } finally {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
  }
})

test('runtime resolves PostgreSQL and Java paths without cmd.exe short names', async () => {
  const source = await fs.readFile(path.join(__dirname, 'runtime.cjs'), 'utf8')
  assert.doesNotMatch(source, /cmd\.exe|windowsShortPath/)
  assert.match(source, /prepareRuntimeLayout\(\{ root: this\.root, data: this\.data \}\)/)
  // Executable, data directory, working directory and seed file all come from
  // the prepared layout instead of the package path.
  assert.match(source, /provisionDatabase\(this\.root, this\.pgData, settings\.databasePassword, this\.pgExecutable\)/)
  assert.match(source, /'-f', this\.pgSeed\]/)
  assert.match(source, /path\.dirname\(executable\)/)
  // The JVM converts java.home and -jar through the machine's ANSI code page,
  // so it is started from the prepared layout as well.
  assert.match(source, /this\.javaExecutable = path\.join\(this\.layout\.java, 'bin', 'java\.exe'\)/)
  assert.match(source, /this\.jarDirectory = this\.layout\.jars/)
  assert.match(source, /path\.join\(this\.jarDirectory, `\$\{service\}\.jar`\)/)
  assert.match(source, /this\.launch\(service, this\.javaExecutable, args/)
})

// java.exe and the JVM itself turn every path into the active ANSI code page, so
// a package folder such as "三叶动漫_免安装版" reaches them as '?' and the
// services fail before their own code runs. The layout must therefore hand the
// runtime ASCII-only paths for the JARs and the Java executable.
test('a non-ASCII package path never reaches the JVM', async () => {
  const base = await tempBase('jvm-layout-')
  try {
    const root = path.join(base, '三叶动漫_免安装版')
    for (const [file, content] of [
      ['postgres/bin/postgres.exe', 'postgres-binary'],
      ['seed.sql', 'select 1'],
      ['java/bin/java.exe', 'java-binary'],
      ['manifest.json', '{"version":1}'],
      ['jars/anime.jar', 'jar-anime'],
      ['jars/search.jar', 'jar-search'],
      ['jars/favorite.jar', 'jar-favorite'],
    ]) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await fs.writeFile(path.join(root, file), content)
    }
    const data = path.join(base, 'userdata')
    const mirror = path.join(base, 'mirror')
    const runtime = new LocalRuntime(root, data)
    const previous = process.env.SANYE_DESKTOP_ASCII_ROOT
    process.env.SANYE_DESKTOP_ASCII_ROOT = mirror
    try {
      const layout = await runtime.prepareLayout()
      assert.ok(layout.relocatedJava && layout.relocatedJars, 'Java and the JARs must be mirrored')
      assert.ok(/^[\x00-\x7f]+$/.test(runtime.javaExecutable), `Java executable must be ASCII: ${runtime.javaExecutable}`)
      assert.ok(/^[\x00-\x7f]+$/.test(runtime.jarDirectory), `JAR directory must be ASCII: ${runtime.jarDirectory}`)
      assert.equal(await fs.readFile(path.join(runtime.jarDirectory, 'favorite.jar'), 'utf8'), 'jar-favorite')
      const recorded = JSON.parse(await fs.readFile(path.join(data, 'runtime-layout.json'), 'utf8'))
      assert.equal(recorded.java, layout.java)
      assert.equal(recorded.jars, layout.jars)
    } finally {
      if (previous === undefined) delete process.env.SANYE_DESKTOP_ASCII_ROOT
      else process.env.SANYE_DESKTOP_ASCII_ROOT = previous
    }
  } finally { await fs.rm(base, { recursive: true, force: true }) }
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

// A truncated or quarantined jar used to surface minutes later as a bare
// "anime failed to start"; the packaged manifest makes it a startup error that
// names the damaged file instead.
test('package integrity is checked against the shipped manifest before startup', async () => {
  // Build a real package layout inside the temp directory: the manifest is read
  // from two levels above the runtime root, so the test must not point that
  // lookup at anything outside its own sandbox.
  const packageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-integrity-package-'))
  const root = path.join(packageRoot, 'resources', 'runtime')
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-integrity-data-'))
  const runtime = new LocalRuntime(root, data)
  try {
    for (const file of ['java/bin/java.exe', 'postgres/bin/postgres.exe', 'postgres/bin/pg_ctl.exe', 'postgres/bin/pg_isready.exe',
      'postgres/bin/psql.exe', 'postgres-template/PG_VERSION', 'client/index.html', 'seed.sql', 'jars/anime.jar', 'jars/search.jar', 'jars/favorite.jar']) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await fs.writeFile(path.join(root, file), 'placeholder')
    }
    // Without a manifest the size check is skipped, but the jar structure check
    // still rejects a file that is not a readable archive.
    const withoutManifest = await runtime.packageIntegrity()
    assert.equal(withoutManifest.checked, false)
    assert.equal(withoutManifest.problems.length, 3, `expected three unusable jars, got ${withoutManifest.problems.length}`)
    assert.ok(withoutManifest.problems.every(problem => /不是可读的 JAR 文件/.test(problem)))

    // A jar with a valid end-of-central-directory record passes.
    const eocd = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    for (const service of ['anime', 'search', 'favorite']) {
      await fs.writeFile(path.join(root, 'jars', `${service}.jar`), Buffer.concat([Buffer.from('PK\x03\x04'), eocd]))
    }
    assert.equal((await runtime.packageIntegrity()).problems.length, 0)

    // With a manifest, a size mismatch is reported with both numbers.
    const manifest = {
      version: 1,
      files: [{ path: 'resources/runtime/jars/anime.jar', size: 999999, sha256: 'x' }],
    }
    await fs.writeFile(path.join(packageRoot, 'artifact-manifest.json'), JSON.stringify(manifest))
    const mismatched = await runtime.packageIntegrity()
    assert.equal(mismatched.checked, true)
    assert.equal(mismatched.problems.length, 1)
    assert.match(mismatched.problems[0], /jars\/anime\.jar 大小不符（应为 999999 字节，实际 \d+ 字节）/)
  } finally {
    await fs.rm(packageRoot, { recursive: true, force: true })
    await fs.rm(data, { recursive: true, force: true })
  }
})

// After a crash or a forced kill the cluster stays attached, and PostgreSQL then
// refuses to start with "pre-existing shared memory block is still in use". The
// app owns the data directory, so it must reclaim it instead of giving up.
test('a cluster left behind by a killed session is reclaimed before reuse', async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'sanye-orphan-'))
  const runtime = new LocalRuntime('/root', data)
  runtime.pgData = path.join(data, 'postgres')
  runtime.pgBin = '/bin'
  await fs.mkdir(runtime.pgData, { recursive: true })
  const pidFile = path.join(runtime.pgData, 'postmaster.pid')
  try {
    // Nothing to reclaim when the cluster was shut down cleanly.
    assert.deepEqual(await runtime.reclaimOrphanedDatabase(), { reclaimed: false, locked: false, stale: false })

    // A pid file left by a forced kill points at a process that no longer
    // exists; waiting for it would hang, so it must be cleared.
    await fs.writeFile(pidFile, '999999\n')
    assert.deepEqual(await runtime.reclaimOrphanedDatabase(), { reclaimed: true, locked: false, stale: true })
    assert.equal(await fs.readFile(pidFile, 'utf8').catch(() => null), null)

    // A pid file that still belongs to a live process is stopped through pg_ctl.
    await fs.writeFile(pidFile, `${process.pid}\n`)
    const statuses = []
    runtime.onStatus = status => statuses.push(status)
    let stopped = null
    runtime.command = async (name, executable, args) => {
      stopped = { name, executable, args }
      await fs.rm(pidFile) // pg_ctl stopped the leftover server
    }
    assert.deepEqual(await runtime.reclaimOrphanedDatabase(), { reclaimed: true, locked: false, stale: false })
    assert.equal(stopped.name, 'database-orphan-stop')
    assert.match(stopped.executable, /pg_ctl\.exe$/)
    assert.deepEqual(stopped.args, ['-D', runtime.pgData, '-m', 'fast', '-w', '-t', '60', 'stop'])
    assert.ok(statuses.some(status => /接管上次未正常退出的本地数据库/.test(status)))
  } finally { await fs.rm(data, { recursive: true, force: true }) }
})
