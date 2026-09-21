const { test, before } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { existsSync } = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const childProcess = require('node:child_process')
const { provisionDatabase, configureOffline, preparePostgresLayout, asciiRootCandidates, isAsciiPath } = require('./postgresTemplate.cjs')

// sanye_deploy/.local 被 Git 忽略，干净检出中不存在；先建立父目录，避免测试依赖本机残留产物。
before(async () => {
  await fs.mkdir(path.resolve(__dirname, '../sanye_deploy/.local'), { recursive: true })
})

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
  return root
}

test('ASCII directories are used in place and never mirrored', async () => {
  const base = await fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/ascii-layout-'))
  try {
    const root = await applicationRoot(base)
    const data = path.join(base, 'userdata')
    const mirror = path.join(base, 'mirror')
    const layout = await preparePostgresLayout({ root, data, env: { SANYE_DESKTOP_ASCII_ROOT: mirror } })
    assert.equal(layout.relocatedRuntime, false)
    assert.equal(layout.relocatedData, false)
    assert.equal(layout.runtime, path.join(root, 'postgres'))
    assert.equal(layout.executable, path.join(root, 'postgres', 'bin', 'postgres.exe'))
    assert.equal(layout.database, path.join(data, 'postgres'))
    assert.equal(layout.seed, path.join(root, 'seed.sql'))
    assert.equal(layout.asciiRoot, null)
    await assert.rejects(fs.access(mirror), { code: 'ENOENT' })
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('non-ASCII package paths mirror PostgreSQL into an ASCII runtime that is reused', async () => {
  const base = await fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/ascii-layout-'))
  try {
    const root = await applicationRoot(base, '三叶动漫_免安装版')
    const data = path.join(base, 'userdata')
    const mirror = path.join(base, 'mirror')
    const env = { LOCALAPPDATA: 'D:\\用户\\AppData\\Local', ProgramData: 'C:\\ProgramData', SANYE_DESKTOP_ASCII_ROOT: mirror }
    const layout = await preparePostgresLayout({ root, data, env })
    assert.equal(layout.relocatedRuntime, true)
    assert.equal(layout.relocatedData, false)
    assert.equal(layout.asciiRoot, mirror)
    assert.ok(isAsciiPath(layout.runtime) && isAsciiPath(layout.executable) && isAsciiPath(layout.seed), 'PostgreSQL paths must be ASCII')
    assert.ok(layout.runtime.startsWith(mirror + path.sep))
    assert.equal(await fs.readFile(path.join(layout.runtime, 'share', 'postgres.bki'), 'utf8'), 'bki')
    assert.equal(await fs.readFile(path.join(layout.runtime, 'bin', 'postgres.exe'), 'utf8'), 'postgres-binary')
    assert.equal(await fs.readFile(layout.seed, 'utf8'), "SELECT '三叶动漫';")
    assert.match(await fs.readFile(path.join(layout.runtime, 'sanye-runtime.json'), 'utf8'), /"version": 2/)
    const owner = path.dirname(layout.runtime)
    await fs.writeFile(path.join(owner, 'unrelated.txt'), 'kept')
    const again = await preparePostgresLayout({ root, data, env })
    assert.equal(again.runtime, layout.runtime)
    assert.equal(await fs.readFile(path.join(owner, 'unrelated.txt'), 'utf8'), 'kept')
    // A truncated mirror is rebuilt from the package before PostgreSQL starts.
    await fs.rm(path.join(layout.runtime, 'share', 'postgres.bki'))
    const repaired = await preparePostgresLayout({ root, data, env })
    assert.equal(repaired.runtime, layout.runtime)
    assert.equal(await fs.readFile(path.join(repaired.runtime, 'share', 'postgres.bki'), 'utf8'), 'bki')
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('non-ASCII user data directories move one existing database into the ASCII runtime', async t => {
  const base = await fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/ascii-layout-'))
  try {
    const root = await applicationRoot(base)
    const data = path.join(base, '中文 用户 数据')
    const legacy = path.join(data, 'postgres')
    await fs.mkdir(path.join(legacy, 'global'), { recursive: true })
    await fs.writeFile(path.join(legacy, 'PG_VERSION'), '18')
    await fs.writeFile(path.join(legacy, 'global', 'pg_control'), 'control')
    const env = { SANYE_DESKTOP_ASCII_ROOT: path.join(base, 'mirror') }
    const layout = await preparePostgresLayout({ root, data, env })
    assert.equal(layout.relocatedRuntime, false)
    assert.equal(layout.relocatedData, true)
    assert.equal(layout.migratedData, legacy)
    assert.equal(layout.moved, true)
    assert.ok(isAsciiPath(layout.database))
    assert.equal(await fs.readFile(path.join(layout.database, 'global', 'pg_control'), 'utf8'), 'control')
    await assert.rejects(fs.access(legacy), { code: 'ENOENT' })
    // Later starts keep the relocated database and do not migrate again.
    await fs.writeFile(path.join(layout.database, 'global', 'pg_control'), 'control-after-start')
    const restarted = await preparePostgresLayout({ root, data, env })
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
    const copied = await preparePostgresLayout({ root: fresh, data: secondData, env: { SANYE_DESKTOP_ASCII_ROOT: path.join(base, 'mirror') } })
    assert.equal(copied.moved, false)
    assert.equal(await fs.readFile(path.join(copied.database, 'global', 'pg_control'), 'utf8'), 'second')
    assert.equal(await fs.readFile(path.join(secondLegacy, 'global', 'pg_control'), 'utf8'), 'second')
    t.mock.restoreAll()
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

test('mirror candidates skip unusable directories and report a clear failure', async () => {
  const base = await fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/ascii-layout-'))
  try {
    const root = await applicationRoot(base, '三叶动漫')
    const data = path.join(base, 'userdata')
    const blocked = path.join(base, 'blocked')
    await fs.writeFile(blocked, 'not a directory')
    const programData = path.join(base, 'programdata')
    const layout = await preparePostgresLayout({ root, data, env: { SANYE_DESKTOP_ASCII_ROOT: path.join(blocked, 'sanye_anime'), ProgramData: programData } })
    assert.equal(layout.asciiRoot, path.join(programData, 'sanye_anime'))
    assert.equal(layout.attempts.length, 1)
    assert.ok(layout.attempts[0].candidate.startsWith(path.join(blocked, 'sanye_anime') + path.sep))
    assert.match(layout.attempts[0].candidate, /users[\\/][a-f0-9]{16}$/)
    assert.ok(layout.runtime.startsWith(path.join(programData, 'sanye_anime') + path.sep))
    await assert.rejects(preparePostgresLayout({ root, data, env: {} }), /解压到纯英文路径/)
    // An intact database directory that is not a PostgreSQL cluster is never replaced.
    const partialData = path.join(base, '中文 数据 不完整')
    const partial = path.join(partialData, 'postgres')
    await fs.mkdir(partial, { recursive: true })
    await fs.writeFile(path.join(partial, 'keep'), 'user data')
    await assert.rejects(preparePostgresLayout({ root, data: partialData, env: { SANYE_DESKTOP_ASCII_ROOT: path.join(base, 'mirror') } }), /目录不完整/)
    assert.equal(await fs.readFile(path.join(partial, 'keep'), 'utf8'), 'user data')
  } finally { await fs.rm(base, { recursive: true, force: true }) }
})

// 该用例断言 Windows 盘符路径的候选顺序，其他平台用不到这些候选。
test('ASCII mirror candidates come from the local profile before machine-wide directories', { skip: process.platform !== 'win32' }, () => {
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
  const base = await fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/provision-log-test-'))
  const logFile = path.join(base, 'logs', 'database-provision.log')
  const password = 'c'.repeat(64)
  let scenario = 'missing-dll'
  t.mock.method(childProcess, 'spawn', (executable, args, options) => {
    assert.equal(options.env.PGOPTIONS, undefined)
    assert.equal(options.env.PGCLIENTENCODING, 'UTF8')
    const child = new EventEmitter()
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.kill = () => {}
    child.stdin.on('finish', () => {
      if (scenario === 'missing-dll') child.emit('close', 0xc0000135, null)
      else if (scenario === 'sql-error') {
        child.stdout.write(`ALTER ROLE sanye LOGIN PASSWORD '${password}';\nsanye_provisioned`)
        child.stderr.write('ER'); child.stderr.write(`ROR: rejected '${password}'\n`)
        child.emit('close', 0, null)
      } else if (scenario === 'spawn-error') {
        child.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }))
        child.emit('close', -2, null)
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

// runtime/postgres-template 由本机 prepare:runtime 生成，干净检出与 CI 中不存在。
test('template copy restores ZIP-omitted directories and preserves existing databases', { skip: process.platform !== 'win32' || !existsSync(path.join(__dirname, 'runtime', 'postgres-template')) }, async () => {
  const original = path.join(__dirname, 'runtime')
  const base = await fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/template-test-'))
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
