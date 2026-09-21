const fs = require('node:fs/promises')
const path = require('node:path')
const childProcess = require('node:child_process')
const { execFile } = childProcess
const { promisify } = require('node:util')
const { randomBytes, createHash } = require('node:crypto')
const { localProcessEnvironment } = require('./processEnvironment.cjs')

const ASCII_PATH = /^[\x00-\x7f]+$/
const isAsciiPath = value => typeof value === 'string' && ASCII_PATH.test(value)
const fatalError = message => Object.assign(new Error(message), { fatal: true })

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// The bundled PostgreSQL binaries validate their own executable path after the
// Windows C runtime converted argv[0] for the active ANSI code page. Package
// folders such as "三叶动漫_免安装版" become '?' there, and postmaster aborts with
// "could not locate my own executable path" (exit code 0x00000001). 8.3 short
// names cannot be relied on because most non-system volumes disable them, so
// the runtime is mirrored into an ASCII-only directory instead of being renamed.
function asciiRootCandidates(env = process.env) {
  const candidates = []
  const add = value => {
    if (!value || !path.isAbsolute(value) || !isAsciiPath(value)) return
    const normalized = path.normalize(value)
    if (!candidates.includes(normalized)) candidates.push(normalized)
  }
  add(env.SANYE_DESKTOP_ASCII_ROOT)
  for (const name of ['LOCALAPPDATA', 'APPDATA', 'ProgramData', 'PUBLIC']) {
    if (env[name]) add(path.join(env[name], 'sanye_anime'))
  }
  if (env.SystemDrive) add(path.join(env.SystemDrive + path.sep, 'sanye_anime'))
  return candidates
}

async function writableDirectory(directory) {
  await fs.mkdir(directory, { recursive: true })
  const probe = path.join(directory, `.sanye-write-${randomBytes(8).toString('hex')}`)
  await fs.writeFile(probe, 'sanye', { flag: 'wx' })
  await fs.rm(probe, { force: true })
}

async function exists(target) {
  try { await fs.access(target); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

async function directories(directory, prefix = '') {
  const result = []
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    result.push(name, ...await directories(directory, name))
  }
  return result
}

async function inventory(directory, prefix = '') {
  const files = []
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await inventory(directory, name))
    else if (entry.isFile()) files.push({ path: name, sha256: sha256(await fs.readFile(path.join(directory, name))) })
    else throw new Error('Database template cannot contain links')
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

// Metadata listing used to detect missing or truncated files without hashing
// the whole 146 MB runtime on every start.
async function listing(directory, prefix = '') {
  const entries = []
  for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) entries.push({ path: name, directory: true, size: 0 }, ...await listing(directory, name))
    else if (entry.isFile()) entries.push({ path: name, directory: false, size: (await fs.stat(path.join(directory, name))).size })
    else throw new Error('数据库运行库不能包含链接或特殊文件')
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}

async function mirrorTree(source, target, { hardlink = true } = {}) {
  await fs.mkdir(target, { recursive: true })
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) { await mirrorTree(from, to, { hardlink }); continue }
    if (!entry.isFile()) throw new Error('数据库运行库不能包含链接或特殊文件')
    // Same-volume mirrors share the packaged bytes; other volumes fall back to
    // a plain copy, including for link-unsupported file systems.
    if (hardlink) {
      try { await fs.link(from, to); continue }
      catch (error) {
        if (!['EXDEV', 'EPERM', 'EACCES', 'EMLINK', 'ENOSYS', 'EINVAL', 'EOPNOTSUPP'].includes(error.code)) throw error
      }
    }
    await fs.copyFile(from, to)
  }
}

async function sameVolume(source, target) {
  const from = path.parse(path.resolve(source)).root.toLowerCase()
  const to = path.parse(path.resolve(target)).root.toLowerCase()
  return from === to
}

async function ensureFreeSpace(directory, required) {
  if (typeof fs.statfs !== 'function') return
  const stats = await fs.statfs(directory)
  const available = stats.bavail * stats.bsize
  if (available < required) throw fatalError('本地磁盘可用空间不足，无法准备数据库运行环境')
}

// Every packaged file must be present at the same size; unrelated files that
// own the mirror directory are ignored.
async function mirrorMatches(source, target) {
  const expected = await listing(source)
  const recorded = await listing(target).catch(() => null)
  if (!recorded) return false
  const actual = new Map(recorded.map(entry => [entry.path, entry.size]))
  return expected.every(entry => actual.get(entry.path) === entry.size)
}

// Mirror <package>/resources/runtime/postgres into an ASCII-only directory that
// is keyed by the bundled postgres.exe so several installations can coexist.
async function ensureAsciiRuntime(source, base) {
  const digest = sha256(await fs.readFile(path.join(source, 'bin', 'postgres.exe')))
  const target = path.join(base, `postgres-${digest.slice(0, 16)}`)
  const marker = path.join(target, 'sanye-runtime.json')
  const reusable = await fs.readFile(marker, 'utf8').then(JSON.parse).catch(() => null)
  if (reusable?.version === 2 && reusable.postgresSha256 === digest && await mirrorMatches(source, target)) return target
  const hardlink = await sameVolume(source, target)
  if (!hardlink) await ensureFreeSpace(base, (await listing(source)).reduce((total, entry) => total + entry.size, 0) * 1.1 + 33554432)
  await fs.rm(target, { recursive: true, force: true })
  await mirrorTree(source, target, { hardlink })
  if (JSON.stringify(await inventory(target)) !== JSON.stringify(await inventory(source))) throw fatalError('数据库运行库复制校验失败，请重新下载完整软件包')
  await fs.writeFile(marker, JSON.stringify({ version: 2, source, postgresSha256: digest, createdAt: new Date().toISOString() }, null, 2))
  return target
}

// A Chinese user profile makes the default PostgreSQL data directory unusable
// for the same reason, so an existing database is moved (or copied) once.
async function relocateDatabase(base, legacy) {
  const repository = path.join(base, 'data')
  const target = path.join(repository, 'postgres')
  if (await exists(path.join(target, 'PG_VERSION'))) return { directory: target, migrated: false }
  if (await exists(target)) throw fatalError('数据库目录不完整，已保留原目录，请联系开发者恢复')
  await fs.mkdir(repository, { recursive: true })
  if (!await exists(legacy)) return { directory: target, migrated: false }
  if (!await exists(path.join(legacy, 'PG_VERSION'))) throw fatalError('数据库目录不完整，已保留原目录，请联系开发者恢复')
  try { await fs.rename(legacy, target); return { directory: target, migrated: true, moved: true } }
  catch (error) { if (!['EXDEV', 'EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error }
  // Cross-volume move: keep the original directory untouched as a safety copy.
  await mirrorTree(legacy, target, { hardlink: false })
  if (JSON.stringify(await listing(target)) !== JSON.stringify(await listing(legacy))) throw fatalError('本地数据库迁移校验失败，原数据库未修改，请联系开发者')
  return { directory: target, migrated: true, moved: false }
}

async function ensureAsciiSeed(seed, base) {
  const target = path.join(base, 'seed.sql')
  const bytes = await fs.readFile(seed)
  const existing = await fs.readFile(target).catch(() => null)
  if (existing?.equals(bytes)) return target
  await fs.mkdir(base, { recursive: true })
  await fs.writeFile(target, bytes)
  return target
}

// PostgreSQL processes must only ever receive ASCII paths: the executable, its
// data directory, the seed file and the working directory.
async function preparePostgresLayout({ root, data, env = process.env }) {
  const bundled = path.join(root, 'postgres')
  const applicationData = path.join(data, 'postgres')
  const seed = path.join(root, 'seed.sql')
  const applied = (runtime, database, seedFile, extra = {}) => ({
    version: 1, root, data, bundled, applicationData,
    runtime, bin: path.join(runtime, 'bin'), executable: path.join(runtime, 'bin', 'postgres.exe'),
    database, seed: seedFile, asciiRoot: null, relocatedRuntime: runtime !== bundled, relocatedData: database !== applicationData,
    ...extra,
  })
  if (isAsciiPath(root) && isAsciiPath(data)) return applied(bundled, applicationData, seed)
  const key = sha256(Buffer.from(data.toLowerCase(), 'utf8')).slice(0, 16)
  const attempts = []
  for (const candidate of asciiRootCandidates(env)) {
    const base = path.join(candidate, 'users', key)
    try {
      await writableDirectory(base)
      const runtime = isAsciiPath(root) ? bundled : await ensureAsciiRuntime(bundled, base)
      const relocated = isAsciiPath(data) ? null : await relocateDatabase(base, applicationData)
      const seedFile = isAsciiPath(root) ? seed : await ensureAsciiSeed(seed, base)
      return applied(runtime, relocated?.directory ?? applicationData, seedFile, { asciiRoot: candidate, migratedData: relocated?.migrated ? applicationData : null, moved: relocated?.moved ?? false, attempts })
    } catch (error) {
      if (error.fatal) throw error
      attempts.push({ candidate: base, code: error.code || null, message: error.message })
    }
  }
  const detail = attempts.length ? `；最后错误：${attempts[attempts.length - 1].message}` : ''
  throw fatalError(`软件目录或用户数据目录包含非英文字符，且没有可用的英文本地目录。请把完整软件包解压到纯英文路径（例如 D:\\sanye_anime）后重试${detail}`)
}

async function configureOffline(executable, data, password, logFile) {
  if (!/^[a-f0-9]{64}$/.test(password)) throw new Error('Invalid database password')
  const result = await new Promise(resolve => {
    // Single-user mode opens no network listener. Credentials travel over stdin.
    const base = localProcessEnvironment()
    const child = childProcess.spawn(executable, ['--single', '-D', data, '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic', 'postgres'], {
      windowsHide: true, cwd: path.dirname(executable),
      env: { ...base, LANG: 'C', LC_ALL: 'C', LC_CTYPE: 'C', LC_MESSAGES: 'C', PGCLIENTENCODING: 'UTF8', TZ: 'Asia/Shanghai' }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = '', stderr = '', failure = ''
    const timer = setTimeout(() => { failure = 'process timed out after 120000ms'; child.kill() }, 120000)
    child.stdout.on('data', bytes => {
      output += bytes.toString()
      if (output.length > 1048576) { output = output.slice(0, 1048576); failure = 'stdout exceeded limit'; child.kill() }
    })
    child.stderr.on('data', bytes => {
      stderr += bytes.toString()
      if (stderr.length > 1048576) { stderr = stderr.slice(0, 1048576); failure = 'stderr exceeded limit'; child.kill() }
    })
    child.stdin.on('error', error => { failure ||= `stdin: ${error.code || 'write failed'}` })
    child.on('error', error => { failure = `spawn: ${error.code || 'failed'}` })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, stderr, failure, confirmed: output.includes('sanye_provisioned') })
    })
    child.stdin.end(`ALTER ROLE sanye LOGIN PASSWORD '${password}';\nSELECT 'sanye_provisioned';\n`)
  })
  const status = result.code === null ? 'unavailable' : `0x${(result.code >>> 0).toString(16).padStart(8, '0')}`
  // Never persist stdout: the single-user backend echoes SQL containing the password.
  const diagnostic = `${new Date().toISOString()} exit=${status} signal=${result.signal || 'none'} confirmed=${result.confirmed}\n${result.failure}\n${result.stderr}`.replaceAll(password, '[REDACTED]')
  if (logFile) {
    await fs.mkdir(path.dirname(logFile), { recursive: true })
    await fs.appendFile(logFile, diagnostic + '\n')
  }
  if (result.code !== 0 || result.failure || /\b(?:ERROR|FATAL|PANIC):/i.test(result.stderr) || !result.confirmed) {
    const hints = { '0xc0000135': '缺少运行库 DLL，请重新下载完整软件包', '0xc000007b': '运行库架构不匹配或文件损坏', '0xc0000142': '运行库初始化失败' }
    const detail = hints[status] || result.failure || result.stderr.trim().split(/\r?\n/).find(line => /\b(?:ERROR|FATAL|PANIC):/i.test(line)) || '未收到数据库配置成功确认'
    throw new Error(`本地数据库离线配置失败（${status}）：${detail.replaceAll(password, '[REDACTED]').slice(0, 500)}。原数据库未修改${logFile ? '；详情见 database-provision.log' : ''}`)
  }
}

async function buildTemplate(root) {
  root = path.resolve(root)
  if (!/^[\x00-\x7f]+$/.test(root)) throw new Error('Build PostgreSQL template from an ASCII build workspace')
  const work = await fs.mkdtemp(path.join(root, 'sanye_pg_build_'))
  const cluster = path.join(work, 'cluster')
  const target = path.join(root, 'postgres-template')
  try {
    const pwfile = path.join(work, 'password')
    await fs.writeFile(pwfile, randomBytes(32).toString('hex'), { mode: 0o600 })
    await promisify(execFile)(path.join(root, 'postgres/bin/initdb.exe'), ['-D', cluster, '-U', 'sanye', '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', `--pwfile=${pwfile}`], {
      windowsHide: true, timeout: 120000, env: { ...process.env, LANG: 'C', LC_ALL: 'C', TZ: 'Asia/Shanghai' },
    })
    const manifest = { version: 1, postgresSha256: sha256(await fs.readFile(path.join(root, 'postgres/bin/postgres.exe'))), directories: await directories(cluster), files: await inventory(cluster) }
    await fs.writeFile(path.join(cluster, 'sanye-template.json'), JSON.stringify(manifest))
    await fs.rm(target, { recursive: true, force: true })
    await fs.rename(cluster, target)
  } finally { await fs.rm(work, { recursive: true, force: true }) }
}

async function provisionDatabase(root, destination, password, executable = path.join(root, 'postgres/bin/postgres.exe')) {
  try {
    await fs.access(path.join(destination, 'PG_VERSION'))
    return false
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  // Never merge a template into an incomplete or unrecognized user database.
  try {
    await fs.access(destination)
    throw new Error('数据库目录不完整，已保留原目录，请联系开发者恢复')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const source = path.join(root, 'postgres-template')
  const manifest = JSON.parse(await fs.readFile(path.join(source, 'sanye-template.json'), 'utf8'))
  if (manifest.version !== 1 || manifest.postgresSha256 !== sha256(await fs.readFile(executable))) throw new Error('数据库模板与运行时版本不匹配，请重新下载完整软件包')
  const work = await fs.mkdtemp(path.join(path.dirname(destination), 'sanye_pg_create_'))
  const cluster = path.join(work, 'cluster')
  try {
    await fs.cp(source, cluster, { recursive: true })
    await fs.rm(path.join(cluster, 'sanye-template.json'))
    // ZIP archives may omit empty directories required by PostgreSQL.
    for (const name of manifest.directories) {
      if (!/^[a-zA-Z0-9_/]+$/.test(name) || name.startsWith('/')) throw new Error('Invalid database template directory')
      await fs.mkdir(path.join(cluster, name), { recursive: true })
    }
    if (JSON.stringify(await inventory(cluster)) !== JSON.stringify(manifest.files)) throw new Error('数据库模板文件校验失败，请重新下载完整软件包')
    await configureOffline(executable, cluster, password, path.join(path.dirname(destination), 'logs', 'database-provision.log'))
    await fs.rename(cluster, destination)
    return true
  } finally { await fs.rm(work, { recursive: true, force: true }) }
}

module.exports = { buildTemplate, provisionDatabase, configureOffline, preparePostgresLayout, asciiRootCandidates, isAsciiPath, mirrorTree, listing }
if (require.main === module) buildTemplate(process.argv[2] || path.join(__dirname, 'runtime')).then(() => console.log('PostgreSQL template prepared')).catch(error => { console.error(error.message); process.exitCode = 1 })
