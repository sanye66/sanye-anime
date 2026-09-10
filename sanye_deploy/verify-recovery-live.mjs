// Requires current Maven-packaged anime/file/gateway/admin JARs, Java 21,
// Docker Desktop and the already installed PostgreSQL/MinIO/Redis images.
// Only newly named containers and this run's ignored evidence directory are mutated.
import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile, cp } from 'node:fs/promises'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { backup, restore, verifyBundle, clients, run, digest, terminate } from './recovery.mjs'

const id = randomBytes(6).toString('hex')
const root = resolve('sanye_deploy/.local/tr04', id)
const containers = [], applications = []
const report = { task: 'T-R-04', runId: id, startedAt: new Date().toISOString(), status: 'running', checks: [], containers, limitations: ['Synthetic isolated dataset; external CAS and deployed production acceptance are outside this drill', 'Current file HTTP backend reads local disk; MinIO objects verified independently including metadata and tags'] }
const java = process.env.SANYE_RECOVERY_JAVA ?? 'java'
const psql = process.env.SANYE_RECOVERY_PSQL ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe' : 'psql')
const check = (value, label) => { if (!value) throw new Error(label); report.checks.push(label) }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const docker = args => run({ command: 'docker' }, args, { label: 'Isolated Docker operation' })
async function port() {
  const server = createServer()
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const value = server.address().port
  await new Promise(r => server.close(r))
  return value
}
async function waitFor(action, label, duration = 90000) {
  const end = Date.now() + duration
  while (Date.now() < end) {
    try { if (await action()) return } catch {}
    await sleep(600)
  }
  throw new Error(label)
}
async function reject(action, label, expected) {
  let error
  try { await action() } catch (failure) { error = failure }
  check(error && expected.test(error.message), label)
}
async function container(kind, image, args, internalPort, envNames = []) {
  const name = `sanye_tr04_${kind}_${id}`
  const externalPort = await port()
  await docker(['run', '-d', '--name', name, '-p', `127.0.0.1:${externalPort}:${internalPort}`, ...envNames.flatMap(n => ['-e', n]), image, ...args])
  containers.push(name)
  return { name, port: externalPort }
}
async function application(name, jar, env, args = []) {
  report.artifacts ??= []
  report.artifacts.push({ name, path: jar, ...await digest(jar) })
  const httpPort = await port()
  const child = spawn(java, ['-Xmx256m', '-jar', jar, `--server.port=${httpPort}`, `--management.server.port=${httpPort}`, '--server.address=127.0.0.1', '--logging.level.root=WARN', '--logging.level.com.sanye.admin=WARN', '--spring.quartz.auto-startup=false', '--sanye.event.enabled=false', '--sanye.event.publisher-enabled=false', '--spring.rabbitmq.listener.simple.auto-startup=false', '--management.health.rabbit.enabled=false', ...args], { env: { ...process.env, NACOS_ENABLED: 'false', SENTINEL_ENABLED: 'false', ...env }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  const logs = []
  let startError
  child.once('error', () => { startError = true })
  child.stdout.on('data', b => logs.push(b)); child.stderr.on('data', b => logs.push(b))
  applications.push({ child, name, logs })
  await waitFor(async () => {
    if (startError || child.exitCode !== null) throw new Error('Application exited')
    const res = await fetch(`http://127.0.0.1:${httpPort}/${name === 'admin' ? 'captchaImage' : 'actuator/health'}`, { signal: AbortSignal.timeout(1500) })
    const body = await res.json()
    return res.ok && (name === 'admin' ? body.code === 200 : body.status === 'UP')
  }, `${name} startup failed`, 120000)
  return httpPort
}
async function main() {
  await mkdir(root, { recursive: true })
  check(/(?:openjdk|java) 21[.\s]/.test(await run({ command: java }, ['--version'])), 'java-21-toolchain-preflight')
  report.scripts = await Promise.all(['recovery.mjs', 'verify-recovery-live.mjs'].map(async name => ({ name, ...await digest(resolve('sanye_deploy', name)) })))
  for (const key of ['POSTGRES_PASSWORD', 'MINIO_ROOT_PASSWORD', 'SANYE_TR04_JWT', 'SANYE_TR04_ADMIN_PASSWORD']) process.env[key] = randomBytes(24).toString('hex')
  process.env.SANYE_TR04_ADMIN_PASSWORD = randomBytes(9).toString('hex')
  process.env.POSTGRES_USER = 'sanye'; process.env.MINIO_ROOT_USER = 'sanye_tr04'
  const images = (await docker(['inspect', 'sanye-postgres', 'sanye-minio', 'sanye-redis', '--format', '{{.Config.Image}}'])).split(/\r?\n/)
  const sourcePg = await container('pg_source', images[0], [], 5432, ['POSTGRES_USER', 'POSTGRES_PASSWORD'])
  const targetPg = await container('pg_target', images[0], [], 5432, ['POSTGRES_USER', 'POSTGRES_PASSWORD'])
  const sourceMinio = await container('minio_source', images[1], ['server', '/data'], 9000, ['MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD'])
  const targetMinio = await container('minio_target', images[1], ['server', '/data'], 9000, ['MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD'])
  const redis = await container('redis', images[2], ['redis-server', '--save', '', '--appendonly', 'no'], 6379)
  const config = {
    quiesced: true,
    postgres: {
      tools: { psql: { command: psql }, ...Object.fromEntries([['dump', 'pg_dump'], ['restore', 'pg_restore']].map(([key, cmd]) => [key, { command: 'docker', args: ['exec', '-i', '-e', 'PGHOST=host.docker.internal', ...['PGPORT', 'PGUSER', 'PGPASSWORD', 'PGCONNECT_TIMEOUT', 'PGOPTIONS'].flatMap(n => ['-e', n]), key === 'restore' ? targetPg.name : sourcePg.name, cmd] }])) },
      source: { host: '127.0.0.1', port: sourcePg.port, user: 'sanye', passwordEnv: 'POSTGRES_PASSWORD' },
      target: { host: '127.0.0.1', port: targetPg.port, user: 'sanye', passwordEnv: 'POSTGRES_PASSWORD' },
    },
    databases: [{ role: 'business', source: 'sanye_source_business', target: 'sanye_target_business' }, { role: 'admin', source: 'sanye_source_admin', target: 'sanye_target_admin' }],
    minio: {
      source: { endpoint: `http://127.0.0.1:${sourceMinio.port}`, accessKeyEnv: 'MINIO_ROOT_USER', secretKeyEnv: 'MINIO_ROOT_PASSWORD' },
      target: { endpoint: `http://127.0.0.1:${targetMinio.port}`, accessKeyEnv: 'MINIO_ROOT_USER', secretKeyEnv: 'MINIO_ROOT_PASSWORD' },
      buckets: [{ source: 'sanye-source-files', target: 'sanye-target-files' }],
    },
    files: { source: resolve(root, 'source-files'), target: resolve(root, 'target-files') },
  }
  await writeFile(resolve(root, 'config.json'), JSON.stringify(config, null, 2))
  const { sql, storage } = clients(config)
  for (const side of ['source', 'target']) await waitFor(() => sql(side, 'postgres', 'select 1;').then(v => v === '1'), `${side} postgres readiness`)
  for (const side of ['source', 'target']) await waitFor(() => storage(side).listBuckets().then(() => true), `${side} MinIO readiness`)
  for (const db of config.databases) await sql('source', 'postgres', `create database ${db.source};`)
  const migrationOutput = await run({ command: java }, ['-Dloader.main=com.sanye.anime.sanye_anime.store.RecoveryMigrationFixture', `-Dloader.path=${resolve('sanye_server/sanye-server-anime/target/test-classes')}`, '-cp', resolve('sanye_server/sanye-server-anime/target/sanye-server-anime-0.1.0-SNAPSHOT.jar'), 'org.springframework.boot.loader.launch.PropertiesLauncher', resolve('.')], { env: { SANYE_RECOVERY_DB_URL: `jdbc:postgresql://127.0.0.1:${sourcePg.port}/sanye_source_business`, SANYE_RECOVERY_DB_USER: 'sanye', SANYE_RECOVERY_DB_PASSWORD: process.env.POSTGRES_PASSWORD }, label: 'Recovery Flyway fixture' })
  check(migrationOutput.includes('RECOVERY_FLYWAY_VALIDATED=8'), 'source-eight-schemas-flyway-migrate-validate-repeat')
  report.migrations = JSON.parse(await sql('source', 'sanye_source_business', "select json_agg(table_schema order by table_schema) from information_schema.tables where table_name='flyway_schema_history';"))
  for (const file of ['sanye_admin_schema.sql', 'sanye_admin_quartz_schema.sql']) await sql('source', 'sanye_source_admin', await readFile(resolve('sanye_admin_server/sql', file), 'utf8'))
  await sql('source', 'sanye_source_admin', `create extension pgcrypto; update sanye_sys_user set password=crypt('${process.env.SANYE_TR04_ADMIN_PASSWORD}', gen_salt('bf')) where user_id=1; update sanye_sys_config set config_value='false' where config_key='sys.account.captchaEnabled';`)
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=', 'base64')
  const key = 'recovery-proof.png', bucket = config.minio.buckets[0].source
  await mkdir(resolve(config.files.source, bucket), { recursive: true })
  await writeFile(resolve(config.files.source, bucket, key), bytes)
  await storage('source').makeBucket(bucket)
  await storage('source').putObject(bucket, key, bytes, bytes.length, { 'Content-Type': 'image/png; charset=binary', 'Content-Disposition': 'inline; filename="recovery-proof.png"', 'Cache-Control': 'public, max-age=300', 'recovery-owner': 'sanye' })
  await storage('source').setObjectTagging(bucket, key, { purpose: 'restore', scope: 'test' })
  await sql('source', 'sanye_source_business', `insert into sanye_file.sanye_file_object(id,bucket,object_key,original_name,content_type,size_bytes,sha256,scan_status,owner_user_id) values(91004,'${bucket}','${key}','${key}','image/png',${bytes.length},'${hash(bytes)}','PASS',91004); insert into sanye_anime.sanye_anime(id,title,type,status,source,update_text) values(91004,'Recovery proof','TV','已发布','isolated-recovery',null);`)
  report.dataPointAt = new Date().toISOString()
  const bundle = resolve(root, 'backup')
  const manifest = await backup(config, bundle)
  check((await verifyBundle(bundle)).databases.length === 2, 'business-and-admin-backup-verified')
  report.backup = { startedAt: manifest.startedAt, completedAt: manifest.completedAt, durationMs: manifest.durationMs, tablesAndSequences: manifest.databases.map(d => ({ role: d.role, count: d.tables.length })) }
  const corrupt = resolve(root, 'corrupt')
  await cp(bundle, corrupt, { recursive: true })
  await writeFile(resolve(corrupt, manifest.databases[0].file), 'damaged')
  await reject(() => restore(config, corrupt), 'corrupt-dump-rejected-before-target-mutation', /Backup checksum mismatch/)
  await writeFile(resolve(corrupt, manifest.databases[0].file), '')
  await reject(() => restore(config, corrupt), 'empty-dump-rejected-before-target-mutation', /empty/)
  await sql('source', 'sanye_source_business', `insert into sanye_file.sanye_file_object(id,bucket,object_key,size_bytes,sha256) values(91005,'${bucket}','missing.png',${bytes.length},'${hash(bytes)}');`)
  await reject(() => backup(config, resolve(root, 'missing-object')), 'missing-referenced-object-backup-rejected', /missing local object/)
  await sql('source', 'sanye_source_business', 'delete from sanye_file.sanye_file_object where id=91005;')
  await storage('source').removeObject(bucket, key)
  await reject(() => backup(config, resolve(root, 'missing-minio-object')), 'missing-minio-object-backup-rejected', /missing MinIO object/)
  // The negative fixture is excluded from the immutable successful backup.
  const preflightConfig = structuredClone(config)
  for (const d of preflightConfig.databases) d.target += '_preflight'
  await storage('target').makeBucket('sanye-existing-files')
  preflightConfig.minio.buckets[0].target = 'sanye-existing-files'
  await reject(() => restore(preflightConfig, bundle), 'existing-target-bucket-rejected', /Target bucket already exists/)
  check(await sql('target', 'postgres', "select count(*) from pg_database where datname in ('sanye_target_business_preflight','sanye_target_admin_preflight');") === '0', 'existing-bucket-preflight-created-no-databases')
  preflightConfig.minio.buckets[0].target = 'sanye-preflight-files'
  preflightConfig.files.target = resolve(root, 'existing-target-files')
  await mkdir(preflightConfig.files.target)
  await reject(() => restore(preflightConfig, bundle), 'existing-target-file-directory-rejected', /Target file directory already exists/)
  check(await sql('target', 'postgres', "select count(*) from pg_database where datname in ('sanye_target_business_preflight','sanye_target_admin_preflight');") === '0', 'existing-directory-preflight-created-no-databases')
  check(!(await clients(preflightConfig).list('target')).some(b => b.key.replace(/\/$/, '') === 'sanye-preflight-files'), 'existing-directory-preflight-created-no-bucket')
  const failureConfig = structuredClone(config)
  for (const d of failureConfig.databases) d.target += '_failure'
  failureConfig.postgres.tools.restore = { command: process.execPath, args: ['-e', 'process.exit(process.argv.includes("--list") ? 0 : 7)', '--'] }
  await reject(() => restore(failureConfig, bundle), 'restore-tool-failure-propagated', /PostgreSQL restore failed/)
  const failureReports = await Promise.all((await readdir(bundle)).filter(f => /^restore-.*\.json$/.test(f)).map(f => readFile(resolve(bundle, f), 'utf8').then(JSON.parse)))
  check(failureReports.some(r => r.status === 'failed-partial-targets-retained' && r.databases.includes('sanye_target_business_failure')), 'partial-restore-report-identifies-retained-target')
  check(await sql('target', 'postgres', "select count(*) from pg_database where datname='sanye_target_business_failure';") === '1', 'failed-restore-retains-only-new-database')
  check(await sql('target', 'postgres', "select count(*) from pg_database where datname='sanye_target_admin_failure';") === '0', 'failed-restore-does-not-continue-to-next-database')
  await docker(['stop', sourcePg.name, sourceMinio.name])
  check((await docker(['inspect', sourcePg.name, sourceMinio.name, '--format', '{{.State.Running}}'])).split(/\r?\n/).every(v => v === 'false'), 'source-database-and-object-storage-offline-before-restore')
  const began = Date.now()
  report.simulatedFailureAt = new Date(began).toISOString()
  report.restore = await restore(config, bundle)
  check(report.restore.status === 'restored-and-verified', 'full-data-restore-verified')
  const objectStat = await storage('target').statObject('sanye-target-files', key)
  const objectTags = await storage('target').getObjectTagging('sanye-target-files', key)
  check(objectStat.metaData['content-type'] === 'image/png; charset=binary' && objectStat.metaData['cache-control'] === 'public, max-age=300' && objectStat.metaData['content-disposition'] === 'inline; filename="recovery-proof.png"' && objectStat.metaData['recovery-owner'] === 'sanye' && objectTags.some(t => t.Key === 'purpose' && t.Value === 'restore'), 'restored-object-mime-headers-custom-metadata-and-tags')
  await reject(() => restore(config, bundle), 'existing-target-restore-rejected', /Target database already exists/)
  const appEnv = { SANYE_ENV: 'local', AUTH_TOKEN_SECRET: process.env.SANYE_TR04_JWT, DB_URL: `jdbc:postgresql://127.0.0.1:${targetPg.port}/sanye_target_business`, DB_USERNAME: 'sanye', DB_PASSWORD: process.env.POSTGRES_PASSWORD, REDIS_HOST: '127.0.0.1', REDIS_PORT: String(redis.port), REDIS_USERNAME: '', REDIS_PASSWORD: '', HOME_CACHE_ENABLED: 'false', FILE_STORAGE_DIR: config.files.target, SANYE_AUTH_TOKENSECRET: process.env.SANYE_TR04_JWT }
  const jar = async module => resolve('sanye_server', `sanye-server-${module}`, 'target', (await readdir(`sanye_server/sanye-server-${module}/target`)).find(f => f.endsWith('.jar')))
  const animePort = await application('anime', await jar('anime'), appEnv)
  const filePort = await application('file', await jar('file'), appEnv)
  const adminPort = await application('admin', resolve('sanye_admin_server/sanye_admin_app/target/sanye_admin_app.jar'), {
    ...appEnv, SANYE_ADMIN_DATASOURCE_URL: `jdbc:postgresql://127.0.0.1:${targetPg.port}/sanye_target_admin`, SANYE_ADMIN_DATASOURCE_USERNAME: 'sanye', SANYE_ADMIN_DATASOURCE_PASSWORD: process.env.POSTGRES_PASSWORD,
    SANYE_ADMIN_REDIS_HOST: '127.0.0.1', SANYE_ADMIN_REDIS_PORT: String(redis.port), SANYE_ADMIN_REDIS_USERNAME: '', SANYE_ADMIN_REDIS_PASSWORD: '', SANYE_ADMIN_TOKEN_SECRET: process.env.SANYE_TR04_JWT, SANYE_ADMIN_UPLOAD_PATH: resolve(root, 'admin-uploads'),
  })
  const gatewayPort = await application('gateway', await jar('gateway'), { ...appEnv, SANYE_ADMIN_SERVICE_URL: `http://127.0.0.1:${adminPort}` }, [
    `--spring.cloud.gateway.routes[1].uri=http://127.0.0.1:${animePort}`, '--spring.cloud.gateway.routes[1].id=anime', '--spring.cloud.gateway.routes[1].predicates[0]=Path=/api/v1/anime/**',
    `--spring.cloud.gateway.routes[0].uri=http://127.0.0.1:${filePort}`, '--spring.cloud.gateway.routes[0].id=file', '--spring.cloud.gateway.routes[0].predicates[0]=Path=/api/v1/files/**',
  ])
  const base = `http://127.0.0.1:${gatewayPort}`
  const detailResponse = await fetch(`${base}/api/v1/anime/91004`, { headers: { 'X-Device-Id': 'tr04' } })
  const detail = await detailResponse.json()
  check(detailResponse.ok && detail.code === 0 && detail.data?.title === 'Recovery proof' && detail.data.updateText === null && detail.data.schedule.length === 0, 'restored-null-update-text-content-http-read')
  for (const status of ['连载中', '已完结', '已发布']) {
    const response = await fetch(`${base}/api/v1/anime?status=${encodeURIComponent(status)}`, { headers: { 'X-Device-Id': 'tr04' }, signal: AbortSignal.timeout(10000) })
    const body = await response.json()
    check(response.ok && body.code === 0 && body.data.total === (status === '已发布' ? 1 : 0), `restored-null-update-text-filter-${status}`)
  }
  check(await sql('target', 'sanye_target_business', 'select update_text is null from sanye_anime.sanye_anime where id=91004;') === 't', 'null-source-value-preserved-without-data-rewrite')
  check((await sql('target', 'sanye_target_business', "select count(*) from information_schema.tables where table_name='flyway_schema_history';")) === '8', 'restored-flyway-history-preserved-and-app-validation-enabled')
  const login = await fetch(`http://127.0.0.1:${adminPort}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: process.env.SANYE_TR04_ADMIN_PASSWORD }) }).then(r => r.json())
  check(login.code === 200 && typeof login.token === 'string', 'restored-admin-real-password-login')
  const info = await fetch(`http://127.0.0.1:${adminPort}/getInfo`, { headers: { Authorization: `Bearer ${login.token}` } }).then(r => r.json())
  check(info.code === 200 && info.user?.userId === 1, 'restored-admin-authenticated-user-info')
  function token(userId) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: userId, username: 'recovery', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+600 })).toString('base64url')
    const input = `${header}.${payload}`
    return `${input}.${createHmac('sha256', process.env.SANYE_TR04_JWT).update(input).digest('base64url')}`
  }
  const download = await fetch(`${base}/api/v1/files/91004`, { headers: { Authorization: `Bearer ${token(91004)}` } })
  check(download.ok && hash(Buffer.from(await download.arrayBuffer())) === hash(bytes), 'restored-owner-file-through-gateway-sha256')
  const forbidden = await fetch(`${base}/api/v1/files/91004`, { headers: { Authorization: `Bearer ${token(91006)}` } })
  const forbiddenBody = await forbidden.json()
  check(forbidden.status === 200 && forbiddenBody.code === 2003 && forbiddenBody.data === null, 'other-owner-file-read-denied')
  const anonymous = await fetch(`${base}/api/v1/files/91004`, { headers: { 'X-Device-Id': 'tr04', 'X-User-Id': '91004' } })
  const anonymousBody = await anonymous.json()
  check(anonymous.status === 200 && anonymousBody.code === 2001 && anonymousBody.data === null, 'anonymous-forged-owner-file-read-denied')
  report.rtoMs = Date.now() - began
  report.rpoMs = began - Date.parse(manifest.startedAt)
  report.dataPointToBackupLatencyMs = Date.parse(manifest.startedAt) - Date.parse(report.dataPointAt)
  report.syntheticValidRecordsLost = 0
  report.acceptanceCompletedAt = new Date().toISOString()
  report.restore.applicationAcceptance = 'passed'
  report.restore.applicationAcceptedAt = report.acceptanceCompletedAt
  report.status = 'passed'
}

try { await main() } catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1 }
finally {
  report.processCleanup = []
  for (const { child, name } of applications) {
    try { report.processCleanup.push({ name, ...await terminate(child) }) }
    catch { report.processCleanup.push({ name, stopped: false }); report.status = 'failed'; process.exitCode = 1 }
  }
  for (const { name, logs } of applications) {
    let body = Buffer.concat(logs).toString('utf8')
    for (const key of ['POSTGRES_PASSWORD', 'MINIO_ROOT_PASSWORD', 'SANYE_TR04_JWT', 'SANYE_TR04_ADMIN_PASSWORD']) if (process.env[key]) body = body.replaceAll(process.env[key], '[REDACTED]')
    await writeFile(resolve(root, `${name}.log`), body)
  }
  report.cleanup = []
  for (const name of containers) {
    try { await docker(['stop', name]); report.cleanup.push({ name, stopped: true }) }
    catch { report.cleanup.push({ name, stopped: false }); report.status = 'failed'; process.exitCode = 1 }
  }
  report.completedAt = new Date().toISOString()
  await mkdir(root, { recursive: true })
  await writeFile(resolve(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ status: report.status, report: resolve(root, 'report.json'), checks: report.checks, error: report.error }))
}
