import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream, realpathSync } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { resolve, relative, sep, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from 'minio'
import http from 'node:http'
import https from 'node:https'

const check = (condition, message) => { if (!condition) throw new Error(message) }
const identifier = value => { check(/^sanye_[a-z0-9_]{1,55}$/.test(value), 'Invalid database identifier'); return value }
const quote = value => '"' + value.replaceAll('"', '""') + '"'
const literal = value => "'" + value.replaceAll("'", "''") + "'"
const exists = async path => lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })
const secret = name => { check(typeof name === 'string' && process.env[name], 'Required credential environment variable is missing'); return process.env[name] }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function canonicalPath(path) {
  let current = resolve(path)
  const tail = []
  while (true) {
    try { current = resolve(realpathSync.native(current), ...tail); break }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = resolve(current, '..')
      if (parent === current) break
      tail.unshift(relative(parent, current)); current = parent
    }
  }
  return process.platform === 'win32' ? current.toLowerCase() : current
}

export function pathsOverlap(a, b) {
  const first = canonicalPath(a), second = canonicalPath(b)
  return first === second || first.startsWith(second + sep) || second.startsWith(first + sep)
}

export function inside(root, name) {
  check(typeof name === 'string' && name.length > 0 && !name.includes('\\') && !name.includes(':') && !name.split('/').some(p => !p || p === '.' || p === '..'), 'Unsafe relative path')
  check(!name.split('/').some(p => /[<>"|?*\x00-\x1f]/.test(p) || /[ .]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)), 'Unsafe portable filename')
  const path = resolve(root, name)
  check(!isAbsolute(relative(root, path)) && !relative(root, path).startsWith('..' + sep), 'Path escapes root')
  return path
}

export async function terminate(child, timeout = 10000) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return { pid: child.pid, stopped: true }
  let closed = false
  const stopped = new Promise(resolveResult => child.once('close', () => { closed = true; resolveResult() }))
  if (process.platform === 'win32') {
    await new Promise(resolveResult => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      const timer = setTimeout(() => { killer.kill(); resolveResult() }, timeout)
      killer.once('error', () => { clearTimeout(timer); resolveResult() })
      killer.once('close', () => { clearTimeout(timer); resolveResult() })
    })
  } else {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }
  let timer
  await Promise.race([stopped, new Promise(r => { timer = setTimeout(r, timeout) })])
  clearTimeout(timer)
  check(closed || child.exitCode !== null || child.signalCode !== null, 'Process tree termination failed')
  return { pid: child.pid, stopped: true }
}

// Child output may contain credentials or SQL data. Only a fixed operation label is exposed on failure.
export async function run(tool, args, { env = {}, input, inputFile, outputFile, hashOutput = false, label = 'tool', timeout = 300000 } = {}) {
  check(tool?.command && Array.isArray(tool.args ?? []), 'Invalid tool configuration')
  const child = spawn(tool.command, [...(tool.args ?? []), ...args], {
    env: { ...process.env, ...env }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
  })
  const chunks = []
  const outputHash = createHash('sha256')
  let length = 0
  child.stderr.resume()
  let termination
  const stop = () => termination ??= terminate(child)
  const timer = setTimeout(() => { void stop().catch(() => { child.stdin.destroy(); child.stdout.destroy() }) }, timeout)
  const completed = new Promise((resolveResult, reject) => {
    child.once('error', () => reject(new Error(`${label} could not start`)))
    child.once('close', code => code === 0 ? resolveResult() : reject(new Error(`${label} failed`)))
  })
  const output = outputFile
    ? pipeline(child.stdout, createWriteStream(outputFile, { flags: 'wx', mode: 0o600 }))
    : new Promise((done, reject) => {
      child.stdout.on('data', data => {
        length += data.length
        if (hashOutput) { outputHash.update(data); return }
        if (length > 32 * 1024 * 1024) { reject(new Error(`${label} output limit exceeded`)); return }
        chunks.push(data)
      })
      child.stdout.once('error', reject)
      child.stdout.once('end', done)
    })
  const incoming = inputFile ? pipeline(createReadStream(inputFile), child.stdin) : new Promise((done, reject) => {
    child.stdin.once('error', reject)
    child.stdin.end(input ?? '', done)
  })
  try {
    const results = await Promise.allSettled([completed, incoming, output].map(p => p.catch(async error => { await stop(); throw error })))
    check(results.every(r => r.status === 'fulfilled'), `${label} failed`)
    return hashOutput ? { size: length, sha256: outputHash.digest('hex') } : Buffer.concat(chunks).toString('utf8').trim()
  } finally { clearTimeout(timer); if (termination) await termination; else if (child.exitCode === null && child.pid) await stop() }
}

export async function digest(path) {
  const stat = await lstat(path)
  check(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, 'Missing, empty or unsafe backup file')
  const hash = createHash('sha256')
  for await (const part of createReadStream(path)) hash.update(part)
  return { size: stat.size, sha256: hash.digest('hex') }
}

async function filesIn(root, prefix = '') {
  const result = []
  for (const entry of (await readdir(prefix ? inside(root, prefix) : root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name
    check(!entry.isSymbolicLink(), 'Symbolic links are not supported')
    if (entry.isDirectory()) result.push(...await filesIn(root, key))
    else { check(entry.isFile(), 'Unsupported storage entry'); result.push(key) }
  }
  return result
}

async function noLinks(path) {
  let current = resolve(path)
  while (true) {
    if (await exists(current)) check(!(await lstat(current)).isSymbolicLink(), 'Symbolic links are not supported')
    const parent = resolve(current, '..')
    if (parent === current) return
    current = parent
  }
}

async function databaseProperties(sql, side, database) {
  const value = JSON.parse(await sql(side, database, "select json_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'provider',datlocprovider) from pg_database where datname=current_database();"))
  check(value.provider === 'c', 'This recovery workflow requires libc database locales')
  return value
}

export function validateConfig(config) {
  check(config?.quiesced === true, 'Source writers must be paused and quiesced must be true')
  check(Array.isArray(config.databases) && config.databases.length >= 2, 'Business and admin databases are required')
  check(config.databases.some(d => d.role === 'business') && config.databases.some(d => d.role === 'admin'), 'Business and admin roles are required')
  for (const d of config.databases) { identifier(d.source); identifier(d.target); check(d.source !== d.target, 'Source and target database names must differ') }
  for (const field of ['source', 'target', 'role']) check(new Set(config.databases.map(d => d[field])).size === config.databases.length, 'Duplicate database mapping')
  check(!config.databases.some(d => config.databases.some(s => s.source === d.target)), 'Target database overlaps source inventory')
  check(config.minio?.buckets?.length > 0, 'MinIO bucket inventory is required')
  for (const b of config.minio.buckets) {
    check(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(b.source) && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(b.target), 'Invalid bucket name')
    check(b.source !== b.target, 'Source and target bucket names must differ')
  }
  for (const field of ['source', 'target']) check(new Set(config.minio.buckets.map(b => b[field])).size === config.minio.buckets.length, 'Duplicate bucket mapping')
  check(!config.minio.buckets.some(b => config.minio.buckets.some(s => s.source === b.target)), 'Target bucket overlaps source inventory')
  check(config.files?.source && config.files?.target, 'Local file storage paths are required')
  check(!pathsOverlap(config.files.source, config.files.target), 'Local storage paths overlap')
  return config
}

export function clients(config) {
  const pg = async (side, database, operation, args = [], options = {}) => {
    const c = config.postgres[side]
    const env = { PGHOST: c.host, PGPORT: String(c.port), PGUSER: c.user, PGPASSWORD: secret(c.passwordEnv), PGCONNECT_TIMEOUT: '10', PGOPTIONS: '-c timezone=UTC -c datestyle=ISO,YMD' }
    return run(config.postgres.tools[operation], [...(operation === 'psql' ? ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'] : []), '--no-password', '-d', database, ...args], { ...options, env, label: `PostgreSQL ${operation}` })
  }
  const sql = (side, database, query) => pg(side, database, 'psql', [], { input: query })
  const storageClients = new Map()
  const storage = side => {
    if (!storageClients.has(side)) {
      const c = config.minio[side], url = new URL(c.endpoint)
      check(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && ['http:', 'https:'].includes(url.protocol), 'Invalid MinIO endpoint')
      const timeout = config.minio.requestTimeoutMs ?? 300000
      check(Number.isInteger(timeout) && timeout >= 100 && timeout <= 300000, 'Invalid MinIO request timeout')
      const transport = {
        request(options, callback) {
          const request = (url.protocol === 'https:' ? https : http).request(options, response => {
            // Fail this recovery attempt rather than allow the SDK's long exponential retry loop.
            if ([408, 429, 499].includes(response.statusCode) || response.statusCode >= 500) {
              response.resume(); request.destroy(new Error('MinIO request rejected')); return
            }
            callback(response)
          })
          const timer = setTimeout(() => request.destroy(new Error('MinIO request deadline exceeded')), timeout)
          request.setTimeout(Math.min(30000, timeout), () => request.destroy(new Error('MinIO request stalled')))
          request.once('close', () => clearTimeout(timer))
          return request
        },
      }
      const client = new Client({ endPoint: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)), useSSL: url.protocol === 'https:', accessKey: secret(c.accessKeyEnv), secretKey: secret(c.secretKeyEnv), transport })
      storageClients.set(side, client)
    }
    return storageClients.get(side)
  }
  const list = async (side, bucket = '') => {
    try {
      if (!bucket) return (await storage(side).listBuckets()).map(b => ({ key: b.name, type: 'folder' }))
      const rows = []
      for await (const item of storage(side).listObjectsV2(bucket, '', true)) rows.push({ key: item.name, size: item.size, etag: item.etag, lastModified: item.lastModified.toISOString(), type: 'file' })
      return rows.sort((a, b) => a.key.localeCompare(b.key))
    } catch { throw new Error('MinIO inventory failed') }
  }
  return { pg, sql, list, storage }
}

export function objectMetadata(metadata) {
  check(metadata && typeof metadata === 'object' && !Array.isArray(metadata), 'Invalid object metadata')
  const entries = Object.entries(metadata).map(([key, value]) => {
    check(/^[a-zA-Z0-9!#$%&'*+.^_`|~-]+$/.test(key) && typeof value === 'string' && !/[\r\n\x00]/.test(value), 'Unsafe object metadata')
    check(!/^x-amz-(?:server-side-encryption|acl)/i.test(key) && !/^if-(?:match|none-match)$/i.test(key), 'Object encryption or ACL requires an explicit recovery policy')
    return [key.toLowerCase(), value]
  })
  check(new Set(entries.map(([key]) => key)).size === entries.length, 'Duplicate object metadata key')
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)))
}

async function objectAttributes(client, bucket, key) {
  try {
    const stat = await client.statObject(bucket, key)
    const tagRows = await client.getObjectTagging(bucket, key)
    return { metadata: objectMetadata(stat.metaData), tags: Object.fromEntries(tagRows.map(t => [t.Key, String(t.Value)]).sort(([a], [b]) => a.localeCompare(b))) }
  } catch (error) {
    if (error.message === 'Object encryption or ACL requires an explicit recovery policy') throw error
    throw new Error('MinIO object attributes failed')
  }
}

async function downloadObject(client, bucket, key, target) {
  try { await pipeline(await client.getObject(bucket, key), createWriteStream(target, { flags: 'wx', mode: 0o600 })) }
  catch { throw new Error('MinIO object download failed') }
}

async function objectDigest(client, bucket, key) {
  const hash = createHash('sha256'); let size = 0
  try {
    for await (const bytes of await client.getObject(bucket, key)) { size += bytes.length; hash.update(bytes) }
    return { size, sha256: hash.digest('hex') }
  } catch { throw new Error('MinIO object verification failed') }
}

export async function fingerprint(sql, side, database) {
  const raw = await sql(side, database, "select coalesce(json_agg(x order by schemaname, tablename), '[]') from (select schemaname, tablename from pg_tables where schemaname not in ('pg_catalog','information_schema')) x;")
  const result = []
  for (const row of JSON.parse(raw)) {
    const table = `${quote(row.schemaname)}.${quote(row.tablename)}`
    const value = await sql(side, database, `select json_build_object('count',count(*),'hash',md5(coalesce(string_agg(h,'' order by h),''))) from (select md5(to_jsonb(t)::text) h from ${table} t) s;`)
    result.push({ schema: row.schemaname, table: row.tablename, ...JSON.parse(value) })
  }
  const sequences = JSON.parse(await sql(side, database, "select coalesce(json_agg(x order by sequence_schema, sequence_name),'[]') from (select n.nspname as sequence_schema,c.relname as sequence_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname not in ('pg_catalog','information_schema')) x;"))
  for (const row of sequences) {
    const state = JSON.parse(await sql(side, database, `select row_to_json(t) from (select last_value,is_called from ${quote(row.sequence_schema)}.${quote(row.sequence_name)}) t;`))
    result.push({ schema: row.sequence_schema, sequence: row.sequence_name, ...state })
  }
  return result
}

async function fileReferences(sql, side, database) {
  check((await sql(side, database, "select to_regclass('sanye_file.sanye_file_object') is not null;")) === 't', 'File metadata table is missing')
  return JSON.parse(await sql(side, database, "select coalesce(json_agg(x order by id),'[]') from (select id,bucket,object_key,size_bytes,sha256 from sanye_file.sanye_file_object where status='ACTIVE') x;"))
}

function verifyReferences(refs, manifest) {
  for (const ref of refs) {
    const local = manifest.files.find(f => f.key === `${ref.bucket}/${ref.object_key}`)
    const remote = manifest.buckets.find(b => b.source === ref.bucket)?.objects.find(o => o.key === ref.object_key)
    check(local, 'File metadata references a missing local object')
    if (manifest.buckets.some(b => b.source === ref.bucket)) check(remote, 'File metadata references a missing MinIO object')
    for (const value of [local, remote].filter(Boolean)) check(value.size === Number(ref.size_bytes) && value.sha256 === ref.sha256, 'File metadata digest mismatch')
  }
}

export async function backup(config, directory) {
  validateConfig(config)
  const root = resolve(directory)
  check(!await exists(root), 'Backup directory already exists')
  await noLinks(root)
  await noLinks(config.files.source)
  for (const path of [config.files.source, config.files.target]) check(!pathsOverlap(root, path), 'Backup directory overlaps storage')
  await mkdir(resolve(root, '..'), { recursive: true, mode: 0o700 })
  await mkdir(root, { mode: 0o700 })
  await writeFile(inside(root, 'STARTED'), 'Only a bundle with COMPLETE and verified manifest checksums is restorable.\n', { flag: 'wx', mode: 0o600 })
  const { pg, sql, storage, list } = clients(config)
  const manifest = { version: 2, startedAt: new Date().toISOString(), consistency: 'quiesced', databases: [], buckets: [], files: [], tools: {
    dump: await run(config.postgres.tools.dump, ['--version']),
    restore: await run(config.postgres.tools.restore, ['--version']),
    minio: 'minio-js 8.0.6',
  } }
  for (const d of config.databases) {
    const before = await fingerprint(sql, 'source', d.source)
    check(before.some(t => d.role === 'business' ? t.schema === 'sanye_anime' : t.table === 'sanye_sys_user'), 'Required core tables are missing')
    const file = `database-${manifest.databases.length}.dump`
    await pg('source', d.source, 'dump', ['-Fc', '--no-owner', '--no-acl'], { outputFile: inside(root, file) })
    check(same(before, await fingerprint(sql, 'source', d.source)), 'Source database changed during backup')
    manifest.databases.push({ role: d.role, source: d.source, file, ...await digest(inside(root, file)), properties: await databaseProperties(sql, 'source', d.source), tables: before })
  }
  await mkdir(inside(root, 'objects'))
  for (const b of config.minio.buckets) {
    const before = await list('source', b.source)
    const bucket = { source: b.source, objects: [], inventory: before }
    for (const item of before) {
      check(item.type === 'file', 'Unsupported MinIO entry')
      inside(root, item.key)
      const file = `objects/${manifest.buckets.reduce((n, x) => n + x.objects.length, 0) + bucket.objects.length}.bin`
      const attributes = await objectAttributes(storage('source'), b.source, item.key)
      await downloadObject(storage('source'), b.source, item.key, inside(root, file))
      const hashed = await digest(inside(root, file))
      check(hashed.size === item.size, 'MinIO object size changed')
      check(same(attributes, await objectAttributes(storage('source'), b.source, item.key)), 'Source object attributes changed')
      bucket.objects.push({ key: item.key, file, contentType: attributes.metadata['content-type'], ...attributes, ...hashed })
    }
    check(same(before, await list('source', b.source)), 'Source bucket changed during backup')
    manifest.buckets.push(bucket)
  }
  await mkdir(inside(root, 'files'))
  const keys = await filesIn(config.files.source)
  for (const key of keys) {
    const source = inside(config.files.source, key), file = `files/${manifest.files.length}.bin`
    const before = await digest(source)
    await copyFile(source, inside(root, file))
    check(same(before, await digest(inside(root, file))) && same(before, await digest(source)), 'Local file changed during backup')
    manifest.files.push({ key, file, ...before })
  }
  check(same(keys, await filesIn(config.files.source)), 'Local file inventory changed')
  manifest.references = await fileReferences(sql, 'source', config.databases.find(d => d.role === 'business').source)
  verifyReferences(manifest.references, manifest)
  for (const d of manifest.databases) check(same(d.tables, await fingerprint(sql, 'source', d.source)), 'Source database changed before backup completed')
  for (const b of manifest.buckets) {
    check(same(b.inventory, await list('source', b.source)), 'Source bucket changed before backup completed')
    for (const o of b.objects) check(same({ metadata: o.metadata, tags: o.tags }, await objectAttributes(storage('source'), b.source, o.key)), 'Source object attributes changed before backup completed')
  }
  check(same(keys, await filesIn(config.files.source)), 'Local file inventory changed before backup completed')
  for (const f of manifest.files) check(same({ size: f.size, sha256: f.sha256 }, await digest(inside(config.files.source, f.key))), 'Source file changed before backup completed')
  manifest.completedAt = new Date().toISOString()
  manifest.durationMs = Date.parse(manifest.completedAt) - Date.parse(manifest.startedAt)
  const body = JSON.stringify(manifest, null, 2) + '\n'
  await writeFile(inside(root, 'manifest.json'), body, { flag: 'wx', mode: 0o600 })
  await writeFile(inside(root, 'manifest.sha256'), createHash('sha256').update(body).digest('hex'), { flag: 'wx', mode: 0o600 })
  await writeFile(inside(root, 'COMPLETE'), 'Backup inventory and checksums completed.\n', { flag: 'wx', mode: 0o600 })
  return manifest
}

export async function verifyBundle(directory) {
  const root = resolve(directory)
  await noLinks(root)
  for (const file of ['COMPLETE', 'manifest.json', 'manifest.sha256']) await noLinks(inside(root, file))
  check(await exists(inside(root, 'COMPLETE')), 'Backup is incomplete')
  const body = await readFile(inside(root, 'manifest.json'))
  check(createHash('sha256').update(body).digest('hex') === (await readFile(inside(root, 'manifest.sha256'), 'utf8')).trim(), 'Manifest checksum mismatch')
  const m = JSON.parse(body)
  check([1, 2].includes(m.version) && m.consistency === 'quiesced' && Number.isFinite(Date.parse(m.startedAt)) && Number.isFinite(Date.parse(m.completedAt)), 'Invalid backup manifest')
  check(m.databases?.some(d => d.role === 'business') && m.databases?.some(d => d.role === 'admin') && Array.isArray(m.buckets) && Array.isArray(m.files) && Array.isArray(m.references), 'Incomplete backup manifest')
  check(new Set(m.files.map(f => f.key)).size === m.files.length, 'Duplicate local file key')
  for (const b of m.buckets) check(new Set(b.objects.map(o => o.key)).size === b.objects.length, 'Duplicate MinIO object key')
  const entries = [...m.databases, ...m.buckets.flatMap(b => b.objects), ...m.files]
  check(new Set(entries.map(e => e.file)).size === entries.length, 'Duplicate archive path')
  for (const entry of entries) {
    await noLinks(inside(root, entry.file))
    check(same({ size: entry.size, sha256: entry.sha256 }, await digest(inside(root, entry.file))), 'Backup checksum mismatch')
  }
  for (const entry of m.files) inside(root, entry.key)
  for (const entry of m.buckets.flatMap(b => b.objects)) {
    inside(root, entry.key)
    check(typeof entry.contentType === 'string' && !/[\r\n\x00]/.test(entry.contentType), 'Unsafe object content type')
    if (m.version === 2) {
      check(same(entry.metadata, objectMetadata(entry.metadata)) && entry.metadata['content-type'] === entry.contentType, 'Invalid object metadata')
      check(entry.tags && typeof entry.tags === 'object' && !Array.isArray(entry.tags) && Object.entries(entry.tags).every(([k, v]) => k && typeof v === 'string'), 'Invalid object tags')
    }
  }
  verifyReferences(m.references, m)
  return m
}

export async function restore(config, directory) {
  validateConfig(config)
  const began = Date.now(), root = resolve(directory)
  const manifest = await verifyBundle(root)
  check(manifest.version === 2, 'V1 backup can be verified but must be recreated as V2 before full recovery')
  check(same(manifest.databases.map(d => [d.role, d.source]), config.databases.map(d => [d.role, d.source])), 'Database mapping does not match manifest')
  check(same(manifest.buckets.map(b => b.source), config.minio.buckets.map(b => b.source)), 'Bucket mapping does not match manifest')
  for (const path of [config.files.source, config.files.target]) check(!pathsOverlap(root, path), 'Backup directory overlaps storage')
  const { pg, sql, storage, list } = clients(config)
  const mappedKey = key => {
    const bucket = config.minio.buckets.find(b => key.startsWith(b.source + '/'))
    return bucket ? bucket.target + key.slice(bucket.source.length) : key
  }
  check(new Set(manifest.files.map(f => mappedKey(f.key))).size === manifest.files.length, 'Bucket mapping causes local file collisions')
  const dumpMajor = Number(manifest.tools?.dump?.match(/PostgreSQL\)\s+(\d+)/)?.[1])
  check(dumpMajor > 0, 'Backup PostgreSQL tool version is missing')
  const targetMajor = Number(await sql('target', 'postgres', "select current_setting('server_version_num')::int / 10000;"))
  check(targetMajor >= dumpMajor, 'Target PostgreSQL is older than the backup tool; use a compatible backup')
  for (const d of manifest.databases) {
    check(d.properties?.provider === 'c' && ['encoding', 'collate', 'ctype'].every(k => typeof d.properties[k] === 'string'), 'Missing or unsupported database locale')
    await run(config.postgres.tools.restore, ['--list'], { inputFile: inside(root, d.file), label: 'PostgreSQL archive validation' })
  }
  // Complete every preflight before creating any target. Existing targets are rejected even when empty.
  for (const d of config.databases) check((await sql('target', 'postgres', `select count(*) from pg_database where datname=${literal(d.target)};`)) === '0', 'Target database already exists')
  for (const b of config.minio.buckets) check(!await storage('target').bucketExists(b.target), 'Target bucket already exists')
  check(!await exists(config.files.target), 'Target file directory already exists')
  await noLinks(config.files.target)
  const reportFile = inside(root, `restore-${Date.now()}.json`)
  const report = { status: 'running', startedAt: new Date(began).toISOString(), backupStartedAt: manifest.startedAt, databases: [], buckets: [], files: config.files.target }
  try {
    for (const [i, d] of config.databases.entries()) {
      const properties = manifest.databases[i].properties
      check(properties?.provider === 'c', 'Missing or unsupported database locale')
      await sql('target', 'postgres', `create database ${quote(d.target)} template template0 encoding ${literal(properties.encoding)} lc_collate ${literal(properties.collate)} lc_ctype ${literal(properties.ctype)} locale_provider libc;`)
      report.databases.push(d.target)
      await pg('target', d.target, 'restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl'], { inputFile: inside(root, manifest.databases[i].file) })
      check(same(manifest.databases[i].tables, await fingerprint(sql, 'target', d.target)), 'Restored database contents differ')
      check(same(properties, await databaseProperties(sql, 'target', d.target)), 'Restored database locale differs')
    }
    for (const [i, b] of config.minio.buckets.entries()) {
      await storage('target').makeBucket(b.target)
      report.buckets.push(b.target)
      for (const item of manifest.buckets[i].objects) {
        const metadata = item.metadata ?? { 'content-type': item.contentType }, tags = item.tags ?? {}
        await storage('target').putObject(b.target, item.key, createReadStream(inside(root, item.file)), item.size, metadata)
        if (Object.keys(tags).length) await storage('target').setObjectTagging(b.target, item.key, tags)
        check(same({ size: item.size, sha256: item.sha256 }, await objectDigest(storage('target'), b.target, item.key)), 'Restored object digest mismatch')
        check(same({ metadata, tags }, await objectAttributes(storage('target'), b.target, item.key)), 'Restored object attributes differ')
      }
      check((await list('target', b.target)).length === manifest.buckets[i].objects.length, 'Restored bucket inventory differs')
    }
    await mkdir(resolve(config.files.target, '..'), { recursive: true, mode: 0o700 })
    await mkdir(config.files.target, { mode: 0o700 })
    for (const item of manifest.files) {
      const target = inside(config.files.target, mappedKey(item.key))
      await mkdir(resolve(target, '..'), { recursive: true })
      await copyFile(inside(root, item.file), target, 1)
      check(same({ size: item.size, sha256: item.sha256 }, await digest(target)), 'Restored local file digest mismatch')
    }
    const business = config.databases.find(d => d.role === 'business').target
    check(same(manifest.references, await fileReferences(sql, 'target', business)), 'Restored file metadata differs')
    // Apply the same bucket mapping to PostgreSQL metadata and the local file directory.
    for (const b of config.minio.buckets) {
      await sql('target', business, `update sanye_file.sanye_file_object set bucket=${literal(b.target)} where bucket=${literal(b.source)};`)
    }
    const expectedReferences = manifest.references.map(r => ({ ...r, bucket: config.minio.buckets.find(b => b.source === r.bucket)?.target ?? r.bucket }))
    check(same(expectedReferences, await fileReferences(sql, 'target', business)), 'Restored bucket mapping differs')
    for (const ref of expectedReferences) check(same({ size: Number(ref.size_bytes), sha256: ref.sha256 }, await digest(inside(config.files.target, `${ref.bucket}/${ref.object_key}`))), 'Mapped runtime file differs')
    report.bucketMapping = config.minio.buckets
    report.tableAndSequenceVerification = 'passed-before-bucket-mapping'
    report.fileMetadataVerification = 'passed-after-bucket-mapping'
    report.status = 'restored-and-verified'
    report.dataRestoreMs = Date.now() - began
    report.backupAgeAtRestoreStartMs = began - Date.parse(manifest.startedAt)
    report.applicationAcceptance = 'pending'
    return report
  } finally {
    if (report.status === 'running') report.status = 'failed-partial-targets-retained'
    report.completedAt = new Date().toISOString()
    await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [action, configFile, directory] = process.argv.slice(2)
    check(['backup', 'restore', 'verify'].includes(action) && configFile && directory, 'Usage: node recovery.mjs backup|restore|verify config.json backup-directory')
    const config = JSON.parse(await readFile(configFile, 'utf8'))
    if (action === 'verify') await verifyBundle(directory)
    else await (action === 'backup' ? backup : restore)(config, directory)
    console.log(`Recovery ${action}: passed`)
  } catch (error) { console.error(error instanceof SyntaxError ? 'Recovery configuration or manifest is invalid' : error.message); process.exitCode = 1 }
}
