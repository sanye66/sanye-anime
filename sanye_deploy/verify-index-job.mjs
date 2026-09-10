import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, openSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'sanye_deploy/.local/tr03')
mkdirSync(out, { recursive: true })
const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
const database = `sanye_tr03_${suffix}`
const alias = `${database}_live`
const groupName = `sanye_job_${suffix}`
const token = randomUUID()
const evidence = []
const processes = []
let retainedAdmin
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 60000 }).trim()
const record = (name, detail) => { evidence.push({ name, detail, at: new Date().toISOString() }); console.log(name) }
const delay = ms => new Promise(r => setTimeout(r, ms))
async function until(name, action, attempts = 90) {
  for (let i = 0; i < attempts; i++) { try { if (await action()) return } catch {} await delay(1000) }
  throw new Error(`Timed out: ${name}`)
}
const admin = 'http://localhost:18080'
const es = 'http://localhost:9200'
let cookie = ''
async function platform(path, fields) {
  const r = await fetch(admin + path, { method: 'POST', headers: { Cookie: cookie }, body: new URLSearchParams(fields) })
  const c = r.headers.get('set-cookie'); if (c) cookie = c.split(';')[0]
  if (!r.ok) throw new Error(`Scheduler HTTP ${r.status}`)
  const result = await r.json()
  if (result.code !== undefined && result.code !== 200) throw new Error(`Scheduler rejected ${path}`)
  return result
}
const headers = { 'X-Caller-Name': 'sanye-server-job', 'X-Internal-Token': token }
async function rebuild() { return (await fetch('http://localhost:18083/api/v1/search/reindex', { method: 'POST', headers })).json() }
let mode = 'normal'
const fixture = createServer(async (req, res) => {
  if (mode === 'slow') await delay(6000)
  const cards = [1, 2].map(id => ({ id, title: `sanye_tr03_${id}`, originalTitle: '', type: 'TV', year: 2026,
    score: 8, status: '已发布', coverUrl: '', tags: [], updateText: '' }))
  res.setHeader('Content-Type', 'application/json')
  if (mode !== 'fail' && process.env.TR03_SOURCE_URL) {
    const upstream = await fetch(process.env.TR03_SOURCE_URL + req.url)
    res.statusCode = upstream.status
    res.end(await upstream.text())
    return
  }
  res.end(JSON.stringify(mode === 'fail' ? { code: 500, data: null } : { code: 0, data: { items: cards, page: 1, size: 50, total: 2, totalPages: 1 } }))
})
async function aliasTarget() { return Object.keys(await (await fetch(`${es}/_alias/${alias}`)).json())[0] }
function start(module, env, jarOverride) {
  const java = resolve(process.env.USERPROFILE, '.jdks/microsoft-jdk-21.0.12/bin/java.exe')
  const jar = jarOverride ?? resolve(out, `build/sanye-server-${module}/target/sanye-server-${module}-0.1.0-SNAPSHOT.jar`)
  const child = spawn(java, ['-jar', jar], { env: { ...process.env, ...env, SANYE_ENV: 'local' }, windowsHide: true,
    stdio: ['ignore', openSync(resolve(out, `${suffix}-${module}.log`), 'a'), openSync(resolve(out, `${suffix}-${module}.err.log`), 'a')] })
  processes.push(child)
  return child
}
try {
  assert.ok(process.env.TR03_ADMIN_USER && process.env.TR03_ADMIN_PASSWORD && process.env.XXL_JOB_ACCESS_TOKEN, 'Scheduler credentials must be injected')
  await new Promise(r => fixture.listen(18082, '127.0.0.1', r))
  const source = await (await fetch('http://127.0.0.1:18082/api/v1/anime?page=1&size=50')).json()
  assert.equal(source.code, 0)
  const expected = source.data.total
  const missingId = source.data.items[0]?.id
  assert.ok(missingId, 'Acceptance requires a nonempty published catalog')
  const pgEnv = JSON.parse(docker('inspect', 'sanye-postgres'))[0].Config.Env
  const pg = key => pgEnv.find(x => x.startsWith(`${key}=`)).slice(key.length + 1)
  docker('exec', 'sanye-postgres', 'createdb', '-U', pg('POSTGRES_USER'), database)
  const env = { DB_URL: `jdbc:postgresql://localhost:15432/${database}`, DB_USERNAME: pg('POSTGRES_USER'), DB_PASSWORD: pg('POSTGRES_PASSWORD'),
    NACOS_ENABLED: 'false', SENTINEL_ENABLED: 'false', SPRING_RABBITMQ_LISTENER_SIMPLE_AUTO_STARTUP: 'false',
    SANYE_ANIME_SERVICE_URL: 'http://localhost:18082', ES_INDEX: alias, SANYE_MANAGE_TOKEN: token, SANYE_INTERNAL_CALL_TOKEN: token }
  start('search', { ...env, SERVER_PORT: '18083' })
  await until('search ready', async () => (await fetch('http://localhost:18083/api/v1/search')).ok)
  await until('initial index built', async () => (await (await fetch(`${es}/${alias}/_count`)).json()).count === expected)
  assert.notEqual((await (await fetch('http://localhost:18083/api/v1/search/reindex', { method: 'POST' })).json()).code, 0)
  assert.equal((await rebuild()).data.indexed, expected)
  record('isolated rebuild and authorization', { database, alias, expected, source: process.env.TR03_SOURCE_URL ?? 'synthetic fixture' })
  mode = 'slow'
  const first = rebuild()
  await delay(1000)
  assert.notEqual((await rebuild()).code, 0)
  assert.equal((await first).code, 0)
  mode = 'normal'
  record('concurrent rebuild rejected', {})
  const before = await aliasTarget()
  mode = 'fail'
  assert.notEqual((await rebuild()).code, 0)
  assert.equal(await aliasTarget(), before)
  mode = 'normal'
  record('failed source preserves old alias', { before })
  await platform('/login', { userName: process.env.TR03_ADMIN_USER, password: process.env.TR03_ADMIN_PASSWORD })
  await platform('/jobgroup/save', { appname: groupName, title: 'sanye_tr03', addressType: '0' })
  const groups = await platform('/jobgroup/pageList', { start: '0', length: '100', appname: groupName, title: '' })
  const groupId = groups.data.find(g => g.appname === groupName).id
  start('job', { ...env, SERVER_PORT: '18088', XXL_JOB_ENABLED: 'true', XXL_JOB_ADMIN_ADDRESSES: admin,
    XXL_JOB_EXECUTOR_APPNAME: groupName, XXL_JOB_EXECUTOR_ADDRESS: 'http://host.docker.internal:19999/',
    XXL_JOB_EXECUTOR_PORT: '19999', SANYE_SEARCH_SERVICE_URL: 'http://localhost:18083', XXL_JOB_LOG_PATH: resolve(out, `${suffix}-executor`) })
  await until('executor registration', async () => {
    const r = await platform('/jobgroup/pageList', { start: '0', length: '100', appname: groupName, title: '' })
    return r.data.find(g => g.id === groupId)?.registryList?.length > 0
  })
  record('scheduler automatic executor registration', { groupId, groupName })
  const added = await platform('/jobinfo/add', { jobGroup: String(groupId), jobDesc: groupName, author: 'sanye_tr03',
    scheduleType: 'NONE', scheduleConf: '', glueType: 'BEAN', executorHandler: 'rebuildAnimeIndex', executorParam: '',
    executorRouteStrategy: 'FIRST', executorBlockStrategy: 'DISCARD_LATER', executorTimeout: '60', executorFailRetryCount: '0', misfireStrategy: 'DO_NOTHING' })
  const jobId = Number(added.content)
  assert.ok(jobId > 0)
  const logs = () => platform('/joblog/pageList', { start: '0', length: '20', jobGroup: String(groupId), jobId: String(jobId), logStatus: '-1', filterTime: '' })
  async function trigger(expected) {
    const prior = new Set((await logs()).data.map(x => x.id))
    await platform('/jobinfo/trigger', { id: String(jobId), executorParam: '', addressList: '' })
    let row
    await until('scheduler callback', async () => { row = (await logs()).data.find(x => !prior.has(x.id) && x.handleCode === expected); return !!row })
    record('scheduler execution callback', { jobId, logId: row.id, triggerCode: row.triggerCode, handleCode: row.handleCode })
  }
  await fetch(`${es}/${alias}/_doc/${missingId}?refresh=true`, { method: 'DELETE' })
  await fetch(`${es}/${alias}/_doc/sanye_tr03_extra?refresh=true`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: -1, title: 'sanye_tr03_extra' }) })
  await trigger(200)
  assert.equal((await fetch(`${es}/${alias}/_doc/${missingId}`)).status, 200)
  assert.equal((await fetch(`${es}/${alias}/_doc/sanye_tr03_extra`)).status, 404)
  record('scheduler repaired missing and extra documents', { target: await aliasTarget() })
  const good = await aliasTarget()
  mode = 'fail'
  await trigger(500)
  assert.equal(await aliasTarget(), good)
  mode = 'normal'
  await trigger(200)
  record('scheduler failure retains index and retry recovers', { good, recovered: await aliasTarget() })
  mode = 'slow'
  const prior = new Set((await logs()).data.map(x => x.id))
  await platform('/jobinfo/trigger', { id: String(jobId), executorParam: '', addressList: '' })
  await delay(1000)
  await platform('/jobinfo/trigger', { id: String(jobId), executorParam: '', addressList: '' })
  await until('duplicate platform trigger', async () => {
    const rows = (await logs()).data.filter(x => !prior.has(x.id))
    return rows.some(x => x.handleCode === 200) && rows.some(x => x.triggerCode === 500)
  })
  record('scheduler duplicate trigger discarded', { jobId })
  mode = 'normal'
  if (process.env.TR03_ADMIN_JAR) {
    for (const file of ['sanye_admin_schema.sql', 'sanye_admin_quartz_schema.sql']) {
      execFileSync('docker', ['exec', '-i', 'sanye-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pg('POSTGRES_USER'), '-d', database],
        { input: readFileSync(resolve(root, 'sanye_admin_server/sql', file)), stdio: ['pipe', 'ignore', 'pipe'] })
    }
    docker('exec', 'sanye-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', pg('POSTGRES_USER'), '-d', database,
      '-c', "delete from sanye_sys_role_menu where role_id=2 and menu_id in (select menu_id from sanye_sys_menu where perms='monitor:job:changeStatus')")
    const redisName = `sanye_tr03_redis_${suffix}`
    const redisImage = JSON.parse(docker('inspect', 'sanye-redis'))[0].Config.Image
    docker('run', '-d', '--name', redisName, '-p', '127.0.0.1:16380:6379', redisImage)
    const adminProcess = start('admin', { SERVER_PORT: '18089', SANYE_ADMIN_DATASOURCE_URL: env.DB_URL,
      SANYE_ADMIN_DATASOURCE_USERNAME: env.DB_USERNAME, SANYE_ADMIN_DATASOURCE_PASSWORD: env.DB_PASSWORD,
      SANYE_ADMIN_REDIS_HOST: '127.0.0.1', SANYE_ADMIN_REDIS_PORT: '16380', SANYE_ADMIN_REDIS_USERNAME: '', SANYE_ADMIN_REDIS_PASSWORD: '',
      SANYE_ADMIN_TOKEN_SECRET: randomUUID(), SANYE_XXL_ADMIN_URL: admin, SANYE_XXL_ADMIN_USERNAME: process.env.TR03_ADMIN_USER,
      SANYE_XXL_ADMIN_PASSWORD: process.env.TR03_ADMIN_PASSWORD, SANYE_XXL_ADMIN_JOB_ID: String(jobId), SANYE_XXL_ADMIN_EXECUTOR_APPNAME: groupName },
      resolve(process.env.TR03_ADMIN_JAR))
    await until('RuoYi ready', async () => (await fetch('http://localhost:18089/captchaImage')).ok)
    try {
      const { verifyLiveAdmin } = await import('../e2e/verify-xxl-admin-live.mjs')
      await verifyLiveAdmin(value => { mode = value }, out, suffix)
      record('RuoYi browser trigger, failure retry, logs and authorization', { database, jobId, groupName })
      if (process.env.TR03_KEEP_ADMIN === 'true') {
        retainedAdmin = adminProcess
        adminProcess.unref()
        record('RuoYi review environment retained', { pid: adminProcess.pid, redisName, url: 'http://127.0.0.1:5176/jobs?scheduler=xxl' })
      }
    } finally {
      if (!retainedAdmin) docker('stop', redisName)
    }
  }
} finally {
  processes.filter(p => p !== retainedAdmin).forEach(p => p.kill())
  fixture.closeAllConnections(); fixture.close()
  writeFileSync(resolve(out, `${suffix}-evidence.json`), JSON.stringify(evidence, null, 2))
}
