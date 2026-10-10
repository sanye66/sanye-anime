const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const childProcess = require('node:child_process')
const { provisionDatabase, configureOffline, setRolePassword, prepareRuntimeLayout, asciiRootCandidates, isAsciiPath } = require('./postgresTemplate.cjs')

// `sanye_deploy/.local/**` 被 .gitignore 忽略，干净检出（CI）里没有该目录，而 mkdtemp
// 不会创建父目录：先前这些用例在 `windows-2025` runner 上统一以 ENOENT 失败。
async function tempBase(prefix) {
  const base = path.resolve(__dirname, `../sanye_deploy/.local/${prefix}`)
  await fs.mkdir(path.dirname(base), { recursive: true })
  return fs.mkdtemp(base)
}
async function fakeRuntime(directory) {
  await fs.mkdir(path.join(directory, 'bin'), { recursive: true })
  await fs.mkdir(path.join(directory, 'share'), { recursive: true })
  await fs.writeFile(path.join(directory, 'bin', 'postgres.exe'), 'postgres-binary')
  await fs.writeFile(path.join(directory, 'bin', 'psql.exe'), 'psql-binary')
  await fs.writeFile(path.join(directory, 'share', 'postgres.bki'), 'bki')
}

async function applicationRoot(base, name = 'app') {
  const root = path.join(base, name)
  await fakeRuntime(path.join(root, 'postgres'))
  await fs.writeFile(path.join(root, 'seed.sql'), "SELECT '三叶动漫';")
  await fs.mkdir(path.join(root, 'java', 'bin'), { recursive: true })
  await fs.writeFile(path.join(root, 'java', 'bin', 'java.exe'), 'java-binary')
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, createdAt: '2026-09-21T00:00:00.000Z' }))
  await fs.mkdir(path.join(root, 'jars'), { recursive: true })
  for (const service of ['anime', 'search', 'favorite']) {
    await fs.writeFile(path.join(root, 'jars', `${service}.jar`), `jar-${service}`)
  }
  return root
}

test('ASCII directories are used in place and never mirrored', async () => {
  const base = await tempBase('ascii-layout-')
  try {
    const root = await applicationRoot(base)
    const data = path.join(base, 'userdata')
    const mirror = path.join(base, 'mirror')
    const layout = await prepareRuntimeLayout({ root, data, env: { SANYE_DESKTOP_ASCII_ROOT: mirror } })
    assert.equal(layout.relocatedRuntime, false)
    assert.equal(layout.relocatedData, false)
    assert.equal(layout.runtime, path.join(root, 'postgres'))
    assert.equal(layout.executable, path.join(root, 'postgres', 'bin', 'postgres.exe'))
    assert.equal(layout.database, path.join(data, 'postgres'))
    assert.equal(layout.seed, path.join(root, 'seed.sql'))
    assert.equal(layout.relocatedJava, false)
    assert.equal(layout.relocatedJars, false)
    assert.equal(layout.java, path.join(root, 'java'))
    assert.equal(layout.jars, path.join(root, 'jars'))
    assert.equal(layout.asciiRoot, null)
    await assert.rejects(fs.access(mirror), { code: 'ENOENT' })
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('non-ASCII package paths mirror PostgreSQL, Java and the JARs into an ASCII runtime that is reused', async () => {
  const base = await tempBase('ascii-layout-')
  try {
    const root = await applicationRoot(base, '三叶动漫_免安装版')
    const data = path.join(base, 'userdata')
    const mirror = path.join(base, 'mirror')
    const env = { LOCALAPPDATA: 'D:\\用户\\AppData\\Local', ProgramData: 'C:\\ProgramData', SANYE_DESKTOP_ASCII_ROOT: mirror }
    const layout = await prepareRuntimeLayout({ root, data, env })
    assert.equal(layout.relocatedRuntime, true)
    assert.equal(layout.relocatedData, false)
    assert.equal(layout.relocatedJava, true)
    assert.equal(layout.relocatedJars, true)
    assert.equal(layout.asciiRoot, mirror)
    assert.ok(isAsciiPath(layout.runtime) && isAsciiPath(layout.executable) && isAsciiPath(layout.seed), 'PostgreSQL paths must be ASCII')
    // The Windows JDK launcher converts java.home and -jar through the active
    // ANSI code page, so neither the executable nor the JARs may keep a
    // non-ASCII path.
    assert.ok(isAsciiPath(path.join(layout.java, 'bin', 'java.exe')), 'Java executable must be ASCII')
    assert.ok(isAsciiPath(path.join(layout.jars, 'favorite.jar')), 'service JARs must be ASCII')
    assert.ok(layout.runtime.startsWith(mirror + path.sep))
    assert.equal(await fs.readFile(path.join(layout.runtime, 'share', 'postgres.bki'), 'utf8'), 'bki')
    assert.equal(await fs.readFile(path.join(layout.runtime, 'bin', 'postgres.exe'), 'utf8'), 'postgres-binary')
    assert.equal(await fs.readFile(path.join(layout.java, 'bin', 'java.exe'), 'utf8'), 'java-binary')
    assert.equal(await fs.readFile(path.join(layout.jars, 'anime.jar'), 'utf8'), 'jar-anime')
    assert.equal(await fs.readFile(layout.seed, 'utf8'), "SELECT '三叶动漫';")
    assert.match(await fs.readFile(path.join(layout.runtime, 'sanye-runtime.json'), 'utf8'), /"version": 2/)
    const owner = path.dirname(layout.runtime)
    await fs.writeFile(path.join(owner, 'unrelated.txt'), 'kept')
    const again = await prepareRuntimeLayout({ root, data, env })
    assert.equal(again.runtime, layout.runtime)
    assert.equal(again.java, layout.java)
    assert.equal(again.jars, layout.jars)
    assert.equal(await fs.readFile(path.join(owner, 'unrelated.txt'), 'utf8'), 'kept')
    // A truncated mirror is rebuilt from the package before anything starts.
    await fs.rm(path.join(layout.runtime, 'share', 'postgres.bki'))
    await fs.rm(path.join(layout.jars, 'anime.jar'))
    const repaired = await prepareRuntimeLayout({ root, data, env })
    assert.equal(repaired.runtime, layout.runtime)
    assert.equal(await fs.readFile(path.join(repaired.runtime, 'share', 'postgres.bki'), 'utf8'), 'bki')
    assert.equal(repaired.java, layout.java)
    assert.equal(repaired.jars, layout.jars)
    assert.equal(await fs.readFile(path.join(repaired.jars, 'anime.jar'), 'utf8'), 'jar-anime')
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('a rebuilt package is mirrored again instead of reusing the previous Java runtime', async () => {
  const base = await tempBase('ascii-layout-')
  try {
    const root = await applicationRoot(base, '三叶动漫_免安装版')
    const data = path.join(base, 'userdata')
    const env = { SANYE_DESKTOP_ASCII_ROOT: path.join(base, 'mirror') }
    const first = await prepareRuntimeLayout({ root, data, env })
    // A new build rewrites manifest.json and the service JARs; the mirror is
    // keyed on both, so the recipient never runs the previous services.
    await fs.writeFile(path.join(root, 'jars', 'favorite.jar'), 'jar-favorite-second-build')
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, createdAt: '2026-09-21T01:00:00.000Z' }))
    const second = await prepareRuntimeLayout({ root, data, env })
    assert.notEqual(second.jars, first.jars)
    assert.equal(await fs.readFile(path.join(second.jars, 'favorite.jar'), 'utf8'), 'jar-favorite-second-build')
    // The previous build's Java mirror is removed instead of accumulating under
    // the same user profile.
    await assert.rejects(fs.access(path.dirname(first.jars)), { code: 'ENOENT' })
    assert.equal(await fs.readFile(path.join(second.java, 'bin', 'java.exe'), 'utf8'), 'java-binary')
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('non-ASCII user data directories move one existing database into the ASCII runtime', async t => {
  const base = await tempBase('ascii-layout-')
  try {
    const root = await applicationRoot(base)
    const data = path.join(base, '中文 用户 数据')
    const legacy = path.join(data, 'postgres')
    await fs.mkdir(path.join(legacy, 'global'), { recursive: true })
    await fs.writeFile(path.join(legacy, 'PG_VERSION'), '18')
    await fs.writeFile(path.join(legacy, 'global', 'pg_control'), 'control')
    const env = { SANYE_DESKTOP_ASCII_ROOT: path.join(base, 'mirror') }
    const layout = await prepareRuntimeLayout({ root, data, env })
    assert.equal(layout.relocatedRuntime, false)
    assert.equal(layout.relocatedData, true)
    // Only the package path forces a Java mirror; an ASCII package keeps the
    // bundled Java runtime and JARs in place.
    assert.equal(layout.relocatedJava, false)
    assert.equal(layout.relocatedJars, false)
    assert.equal(layout.java, path.join(root, 'java'))
    assert.equal(layout.jars, path.join(root, 'jars'))
    assert.equal(layout.migratedData, legacy)
    assert.equal(layout.moved, true)
    assert.ok(isAsciiPath(layout.database))
    assert.equal(await fs.readFile(path.join(layout.database, 'global', 'pg_control'), 'utf8'), 'control')
    await assert.rejects(fs.access(legacy), { code: 'ENOENT' })
    // Later starts keep the relocated database and do not migrate again.
    await fs.writeFile(path.join(layout.database, 'global', 'pg_control'), 'control-after-start')
    const restarted = await prepareRuntimeLayout({ root, data, env })
    assert.equal(restarted.database, layout.database)
    assert.equal(restarted.migratedData, null)
    assert.equal(await fs.readFile(path.join(restarted.database, 'global', 'pg_control'), 'utf8'), 'control-after-start')
    // A cross-volume move is impossible, so the database is copied and the
    // original directory stays untouched as a safety copy.
    const fresh = await applicationRoot(path.join(base, 'other'), 'app')
    const secondData = path.join(base, '中文 用户 数据 二')
    const secondLegacy = path.join(secondData, 'postgres')
    await fs.mkdir(path.join(secondLegacy, 'global'), { recursive: true })
    await fs.writeFile(path.join(secondLegacy, 'PG_VERSION'), '18')
    await fs.writeFile(path.join(secondLegacy, 'global', 'pg_control'), 'second')
    const rename = fs.rename
    t.mock.method(fs, 'rename', (from, to) => {
      if (from === secondLegacy) throw Object.assign(new Error('cross device'), { code: 'EXDEV' })
      return rename.call(fs, from, to)
    })
    const copied = await prepareRuntimeLayout({ root: fresh, data: secondData, env: { SANYE_DESKTOP_ASCII_ROOT: path.join(base, 'mirror') } })
    assert.equal(copied.moved, false)
    assert.equal(await fs.readFile(path.join(copied.database, 'global', 'pg_control'), 'utf8'), 'second')
    assert.equal(await fs.readFile(path.join(secondLegacy, 'global', 'pg_control'), 'utf8'), 'second')
    t.mock.restoreAll()
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('mirror candidates skip unusable directories and report a clear failure', async () => {
  const base = await tempBase('ascii-layout-')
  try {
    const root = await applicationRoot(base, '三叶动漫')
    const data = path.join(base, 'userdata')
    const blocked = path.join(base, 'blocked')
    await fs.writeFile(blocked, 'not a directory')
    const programData = path.join(base, 'programdata')
    const layout = await prepareRuntimeLayout({ root, data, env: { SANYE_DESKTOP_ASCII_ROOT: path.join(blocked, 'sanye_anime'), ProgramData: programData } })
    assert.equal(layout.asciiRoot, path.join(programData, 'sanye_anime'))
    assert.equal(layout.attempts.length, 1)
    assert.ok(layout.attempts[0].candidate.startsWith(path.join(blocked, 'sanye_anime') + path.sep))
    assert.match(layout.attempts[0].candidate, /users[\\/][a-f0-9]{16}$/)
    assert.ok(layout.runtime.startsWith(path.join(programData, 'sanye_anime') + path.sep))
    await assert.rejects(prepareRuntimeLayout({ root, data, env: {} }), /解压到纯英文路径/)
    // An intact database directory that is not a PostgreSQL cluster is never replaced.
    const partialData = path.join(base, '中文 数据 不完整')
    const partial = path.join(partialData, 'postgres')
    await fs.mkdir(partial, { recursive: true })
    await fs.writeFile(path.join(partial, 'keep'), 'user data')
    await assert.rejects(prepareRuntimeLayout({ root, data: partialData, env: { SANYE_DESKTOP_ASCII_ROOT: path.join(base, 'mirror') } }), /目录不完整/)
    assert.equal(await fs.readFile(path.join(partial, 'keep'), 'utf8'), 'user data')
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('ASCII mirror candidates come from the local profile before machine-wide directories', () => {
  assert.deepEqual(asciiRootCandidates({
    SANYE_DESKTOP_ASCII_ROOT: 'D:\\三叶动漫\\runtime',
    LOCALAPPDATA: 'C:\\Users\\10121\\AppData\\Local',
    APPDATA: 'C:\\用户\\AppData\\Roaming',
    ProgramData: 'C:\\ProgramData',
    SystemDrive: 'C:',
  }), [
    'C:\\Users\\10121\\AppData\\Local\\sanye_anime',
    'C:\\ProgramData\\sanye_anime',
    'C:\\sanye_anime',
  ])
  assert.equal(isAsciiPath('C:\\三叶动漫\\win-unpacked'), false)
  assert.equal(isAsciiPath('C:\\Users\\10121\\AppData\\Local'), true)
})

test('offline configuration reports loader failures and persists diagnostics without credentials', async t => {
  const base = await tempBase('provision-log-test-')
  const logFile = path.join(base, 'logs', 'database-provision.log')
  const password = 'c'.repeat(64)
  let scenario = 'missing-dll'
  t.mock.method(childProcess, 'spawn', (executable, args, options) => {
    assert.equal(options.env.PGOPTIONS, undefined)
    assert.equal(options.env.PGCLIENTENCODING, 'UTF8')
    const child = new EventEmitter()
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.kill = () => {}
      let sql = ''
      child.stdin.on('data', chunk => { sql += chunk.toString() })
      child.stdin.on('finish', () => {
        if (scenario === 'missing-dll') child.emit('close', 0xc0000135, null)
        else if (scenario === 'sql-error') {
          child.stdout.write(`ALTER ROLE sanye LOGIN PASSWORD '${password}';\nsanye_provisioned`)
          child.stderr.write('ER'); child.stderr.write(`ROR: rejected '${password}'\n`)
          child.emit('close', 0, null)
        } else if (scenario === 'spawn-error') {
          child.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }))
          child.emit('close', -2, null)
        } else if (scenario === 'role-missing' && sql.startsWith('ALTER')) {
          child.stderr.write('ERROR: role "sanye" does not exist\n')
          child.emit('close', 0, null)
        } else {
          child.stdout.write(`ALTER ROLE sanye LOGIN PASSWORD '${password}';\nsanye_provisioned`)
          child.stderr.write('LOG: path C:/error-free/cluster\n')
          child.emit('close', 0, null)
        }
      })
      return child
    })
  try {
    await assert.rejects(configureOffline('postgres.exe', base, password, logFile), /0xc0000135.*缺少运行库 DLL/)
    scenario = 'sql-error'
    await assert.rejects(configureOffline('postgres.exe', base, password, logFile), error => /ERROR: rejected/.test(error.message) && !error.message.includes(password))
    scenario = 'spawn-error'
    await assert.rejects(configureOffline('postgres.exe', base, password, logFile), /spawn: ENOENT/)
    scenario = 'success'
    await configureOffline('postgres.exe', base, password, logFile)
    const log = await fs.readFile(logFile, 'utf8')
    assert.match(log, /exit=0xc0000135/)
    assert.match(log, /ERROR: rejected '\[REDACTED\]'/)
    assert.ok(!log.includes(password))
    assert.ok(!log.includes('ALTER ROLE'))
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

// The recipient-visible defect: a cluster whose stored credential no longer
// matches settings.json. PostgreSQL reports itself ready (pg_isready does not
// authenticate) and every Java service then exits with "password authentication
// failed", which the desktop only reported as "anime failed to start".
test('an existing cluster with a stale credential is repaired instead of failing', async t => {
  const base = await tempBase('credential-repair-test-')
  const logFile = path.join(base, 'logs', 'database-credentials.log')
  const password = 'd'.repeat(64)
  const sql = []
  t.mock.method(childProcess, 'spawn', (executable, args, options) => {
    assert.deepEqual(args.slice(0, 2), ['--single', '-D'])
    assert.equal(options.env.PGCLIENTENCODING, 'UTF8')
    const child = new EventEmitter()
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.kill = () => {}
    let received = ''
    child.stdin.on('data', chunk => { received += chunk.toString() })
    child.stdin.on('finish', () => {
      sql.push(received)
      child.stdout.write(received + 'sanye_provisioned')
      child.stderr.write('LOG: ok\n')
      child.emit('close', 0, null)
    })
    return child
  })
  try {
    assert.deepEqual(await setRolePassword('postgres.exe', base, password, logFile), { repaired: true, created: false })
    assert.match(sql[0], /^ALTER ROLE sanye LOGIN PASSWORD '[a-f0-9]{64}';/)
    const log = await fs.readFile(logFile, 'utf8')
    assert.match(log, /set-role-password exit=0x00000000/)
    assert.ok(!log.includes(password), 'the credential must never be written to disk')
    assert.ok(!log.includes('ALTER ROLE'), 'the SQL statement must not be persisted')
    await assert.rejects(setRolePassword('postgres.exe', base, 'short', logFile), /Invalid database password/)
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('a cluster without the application role gets it created', async t => {
  const base = await tempBase('credential-create-test-')
  const logFile = path.join(base, 'logs', 'database-credentials.log')
  const password = 'e'.repeat(64)
  const sql = []
  t.mock.method(childProcess, 'spawn', () => {
    const child = new EventEmitter()
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.kill = () => {}
    let received = ''
    child.stdin.on('data', chunk => { received += chunk.toString() })
    child.stdin.on('finish', () => {
      sql.push(received)
      if (received.startsWith('ALTER')) {
        child.stderr.write('ERROR: role "sanye" does not exist\n')
        child.emit('close', 0, null)
        return
      }
      child.stdout.write('sanye_provisioned')
      child.emit('close', 0, null)
    })
    return child
  })
  try {
    assert.deepEqual(await setRolePassword('postgres.exe', base, password, logFile), { repaired: true, created: true })
    assert.match(sql[1], /^CREATE ROLE sanye LOGIN PASSWORD '[a-f0-9]{64}';/)
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

// `runtime/` 被 .gitignore 忽略，需要在本地执行 `pnpm desktop:prepare` 才会生成；CI 的干净
// runner 上没有这份模板，缺 postgres-template 时跳过，与 runtimeClosure／seedCoverage 的守卫一致。
const templatePrepared = require('node:fs').existsSync(path.join(__dirname, 'runtime', 'postgres-template'))

test('template copy restores ZIP-omitted directories and preserves existing databases', { skip: process.platform !== 'win32' || !templatePrepared }, async () => {
  const original = path.join(__dirname, 'runtime')
  const base = await tempBase('template-test-')
  const root = path.join(base, '中文软件')
  const destination = path.join(base, '中文 数据')
  try {
    await fs.mkdir(root)
    await fs.symlink(path.join(original, 'postgres'), path.join(root, 'postgres'), 'junction')
    const source = path.join(root, 'postgres-template')
    await fs.cp(path.join(original, 'postgres-template'), source, { recursive: true })
    // A file-only ZIP removes these empty directories.
    await fs.rmdir(path.join(source, 'pg_notify'))
    assert.equal(await provisionDatabase(root, destination, 'a'.repeat(64)), true)
    assert.ok((await fs.stat(path.join(destination, 'pg_notify'))).isDirectory())
    const before = await fs.readFile(path.join(destination, 'global/pg_control'))
    assert.equal(await provisionDatabase(root, destination, 'b'.repeat(64)), false)
    assert.deepEqual(await fs.readFile(path.join(destination, 'global/pg_control')), before)
    const partial = path.join(base, 'incomplete')
    await fs.mkdir(partial)
    await fs.writeFile(path.join(partial, 'keep'), 'user data')
    await assert.rejects(provisionDatabase(root, partial, 'a'.repeat(64)), /目录不完整/)
    assert.equal(await fs.readFile(path.join(partial, 'keep'), 'utf8'), 'user data')
    await fs.appendFile(path.join(source, 'postgresql.conf'), '\n# corrupted\n')
    await assert.rejects(provisionDatabase(root, path.join(base, 'corrupt'), 'a'.repeat(64)), /校验失败/)
    await assert.rejects(fs.access(path.join(base, 'corrupt')), { code: 'ENOENT' })
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})
