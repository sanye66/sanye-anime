import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const id = Number(args[0])
if (!Number.isSafeInteger(id) || id <= 0) throw new Error('An explicit synthetic anime ID is required')
const stage = args[1] ?? 'baseline'
const log = []
const docker = (...cmd) => execFileSync('docker', cmd, { encoding: 'utf8', timeout: 60000 }).trim()
const sql = (query) => docker('exec', 'sanye-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'sanye', '-d', 'sanye_anime', '-t', '-A', '-c', query)
const wait = ms => new Promise(r => setTimeout(r, ms))
const config = readFileSync(resolve(root, 'sanye_deploy/run-local.ps1'), 'utf8')
const token = process.env.SANYE_MANAGE_TOKEN ?? config.match(/\$env:SANYE_MANAGE_TOKEN = '([^']+)'/)[1]
const headers = { 'Content-Type': 'application/json', 'X-Caller-Name': 'sanye-admin-server', 'X-Internal-Token': token }
const rabbitEnv = JSON.parse(docker('inspect', 'sanye-rabbitmq'))[0].Config.Env
const value = key => rabbitEnv.find(v => v.startsWith(`${key}=`)).slice(key.length + 1)
const brokerAuth = 'Basic ' + Buffer.from(`${value('RABBITMQ_DEFAULT_USER')}:${value('RABBITMQ_DEFAULT_PASS')}`).toString('base64')
async function broker(path, method = 'GET', body) {
  const r = await fetch(`http://localhost:15672/api/${path}`, { method, headers: { Authorization: brokerAuth, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  if (!r.ok) throw new Error(`Broker HTTP ${r.status}`)
  return r.status === 204 ? null : r.json()
}
async function api(path, method = 'POST', body = {}) {
  const r = await fetch(`http://localhost:8082/api/v1/manage/anime/${id}${path}`, { method, headers, body: JSON.stringify(body) })
  const result = await r.json()
  if (!r.ok || result.code !== 0) throw new Error(`Business operation failed: HTTP ${r.status}, code=${result.code}`)
  return result
}
function evidence(name, detail) { const row = { time: new Date().toISOString(), name, detail }; log.push(row); console.log(JSON.stringify(row)) }
async function until(name, test, seconds = 30) {
  for (let n = 0; n < seconds * 2; n++) { if (await test()) return; await wait(500) }
  throw new Error(`Timed out: ${name}`)
}
function latest() {
  return JSON.parse(sql(`select row_to_json(e) from (select event_id,aggregate_version,status,attempts,payload from sanye_anime.sanye_event_outbox where aggregate_id=${id} order by aggregate_version desc limit 1) e`))
}
function inbox() { return Number(sql(`select coalesce(max(version),0) from sanye_search.sanye_search_event_inbox where aggregate_id=${id}`)) }
async function es() { const r = await fetch(`http://localhost:9200/${encodeURIComponent(process.env.ES_INDEX ?? 'sanye_anime_live')}/_doc/${id}`); return { status: r.status, data: await r.json() } }
async function settled(label) {
  const e = latest()
  await until(label, () => latest().status === 'SENT' && inbox() === e.aggregate_version)
  evidence(label, { eventId: e.event_id, version: e.aggregate_version, attempts: latest().attempts })
  return e
}
async function send(event) {
  const r = await broker('exchanges/%2F/sanye.events/publish', 'POST', { properties: { delivery_mode: 2, content_type: 'application/json', message_id: event.eventId }, routing_key: event.type, payload: JSON.stringify(event), payload_encoding: 'string' })
  if (!r.routed) throw new Error('Event was not routed')
}
function envelope(e) { return { eventId: e.event_id, type: 'anime.status.changed', aggregateId: String(id), version: e.aggregate_version, payload: e.payload, occurredAt: new Date().toISOString() } }

try {
  const title = sql(`select title from sanye_anime.sanye_anime where id=${id}`)
  if (!title.startsWith('sanye_tr02_')) throw new Error('Refusing to modify a non-synthetic anime')
  if (stage === 'baseline') {
    const unauthorized = await fetch(`http://localhost:8082/api/v1/manage/anime/${id}/events/compensate`, { method: 'POST' })
    const denied = await unauthorized.json()
    if (denied.code === 0) throw new Error('Unauthenticated compensation was accepted')
    evidence('compensation authorization', { http: unauthorized.status, code: denied.code })
    await api('/status', 'PATCH', { status: '已发布' })
    const published = await settled('published through business transaction')
    if ((await es()).status !== 200) throw new Error('Published document missing')
    await api('', 'PATCH', { title: `sanye_tr02_${randomUUID()}` })
    await settled('updated through business transaction')
    if ((await es()).data._source.title !== sql(`select title from sanye_anime.sanye_anime where id=${id}`)) throw new Error('Update snapshot mismatch')
    await api('/status', 'PATCH', { status: '已下架' })
    const removed = await settled('unpublished through business transaction')
    if ((await es()).status !== 404) throw new Error('Unpublished document remains')
    await send(envelope(published)); await send(envelope(removed)); await wait(2500)
    if (inbox() !== removed.aggregate_version || (await es()).status !== 404) throw new Error('Duplicate or old event resurrected content')
    evidence('duplicate and old publish after deletion', { version: inbox(), es: 404 })
    const before = (await broker('queues/%2F/sanye.events.dead')).messages
    await send({ ...envelope(removed), eventId: randomUUID(), version: removed.aggregate_version + 1, payload: { ...removed.payload, id: -1 } })
    await until('dead letter', async () => (await broker('queues/%2F/sanye.events.dead')).messages > before)
    evidence('malformed message exhausted retries and reached DLQ', { before, after: (await broker('queues/%2F/sanye.events.dead')).messages })
    await api('/events/compensate'); await settled('authoritative compensation after dead letter')
    if ((await es()).status !== 404) throw new Error('Compensation visibility mismatch')
  } else if (stage === 'disconnect') {
    docker('stop', 'sanye-rabbitmq')
    try {
      await api('', 'PATCH', { summary: 'sanye_tr02 broker unavailable' })
      await until('persistent publish retry', () => latest().attempts > 0, 20)
      if (latest().status === 'SENT') throw new Error('Marked sent without broker')
      evidence('broker disconnected', latest())
    } finally { docker('start', 'sanye-rabbitmq') }
    await settled('broker reconnect eventual delivery')
  } else if (stage === 'restart-check') {
    await settled('application restart recovered pending event')
  } else if (stage === 'cache') {
    const settings = JSON.parse(docker('inspect', 'sanye-redis'))[0].Config.Env
    const redisSetting = key => settings.find(s => s.startsWith(`${key}=`)).slice(key.length + 1)
    const redis = (...command) => docker('exec', '-e', `REDISCLI_AUTH=${redisSetting('REDIS_PASSWORD')}`, 'sanye-redis', 'redis-cli', '--user', redisSetting('REDIS_USERNAME'), ...command)
    redis('SET', 'sanye:home:home:tr02_acceptance', 'synthetic', 'EX', '120')
    await api('/events/compensate'); await settled('cache event published')
    await until('cache invalidation', () => redis('EXISTS', 'sanye:home:home:tr02_acceptance') === '0')
    evidence('Redis cache invalidated by event', { key: 'sanye:home:home:tr02_acceptance', exists: false })
  } else if (stage === 'exhaust') {
    docker('stop', 'sanye-rabbitmq')
    try {
      await api('', 'PATCH', { summary: 'sanye_tr02 retry exhaustion' })
      await until('publisher exhausted retries', () => latest().status === 'DEAD', 90)
      if (latest().attempts !== 5) throw new Error('Unexpected retry count')
      evidence('five failed deliveries persisted DEAD', latest())
    } finally { docker('start', 'sanye-rabbitmq') }
    await api('/events/compensate'); await settled('compensated exhausted event with new authoritative version')
  } else if (stage === 'consumer-failure') {
    const before = inbox()
    let failed
    docker('stop', 'sanye-elasticsearch')
    try {
      await api('', 'PATCH', { summary: 'sanye_tr02 consumer failure' })
      failed = latest()
      await until('consumer failure reached DLQ', async () => {
        const messages = await broker('queues/%2F/sanye.events.dead/get', 'POST', { count: 100, ackmode: 'ack_requeue_true', encoding: 'auto' })
        return messages.some(m => m.properties.message_id === failed.event_id)
      }, 45)
      if (inbox() !== before) throw new Error('Inbox advanced while ES was unavailable')
      evidence('ES failure leaves inbox unchanged and retains dead letter', { eventId: failed.event_id, previousVersion: before })
    } finally { docker('start', 'sanye-elasticsearch') }
    await until('ES recovery', async () => { try { return (await fetch('http://localhost:9200/_cluster/health')).ok } catch { return false } }, 60)
    const messages = await broker('queues/%2F/sanye.events.dead/get', 'POST', { count: 100, ackmode: 'ack_requeue_true', encoding: 'auto' })
    const original = messages.find(m => m.properties.message_id === failed.event_id)
    if (!original) throw new Error('Original dead message missing')
    await send(JSON.parse(original.payload))
    await settled('exact dead-letter envelope replayed after ES recovery')
  } else if (stage === 'enqueue') {
    await api('', 'PATCH', { summary: `sanye_tr02 restart ${randomUUID()}` })
    evidence('pending before application restart', latest())
  } else throw new Error('Unknown verification stage')
} finally {
  const directory = resolve(root, 'sanye_deploy/.local/tr02')
  mkdirSync(directory, { recursive: true })
  writeFileSync(resolve(directory, `${stage}-${Date.now()}.json`), JSON.stringify({ id, stage, log }, null, 2))
}
