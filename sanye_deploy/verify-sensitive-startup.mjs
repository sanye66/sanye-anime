import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { terminate } from './recovery.mjs'

const root = path.resolve('sanye_deploy/.local/tr05/startup')
const report = { task: 'T-R-05', startedAt: new Date().toISOString(), checks: [], artifacts: [], status: 'running' }
const secrets = Array.from({ length: 4 }, () => randomBytes(32).toString('hex'))
const processes = []
const java = process.env.SANYE_VERIFY_JAVA ?? 'java'
const jars = {
  gateway: path.resolve('sanye_server/sanye-server-gateway/target/sanye-server-gateway-0.1.0-SNAPSHOT.jar'),
  admin: path.resolve('sanye_admin_server/sanye_admin_app/target/sanye_admin_app.jar'),
}
function check(condition, label) {
  report.checks.push({ label, passed: Boolean(condition) })
  if (!condition) throw new Error(label)
}
async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
async function launch(name, credentials) {
  const httpPort = await freePort()
  const env = { ...process.env, SANYE_ENV: 'test', NACOS_ENABLED: 'false', SENTINEL_ENABLED: 'false',
    AUTH_TOKEN_SECRET: '', SANYE_ADMIN_TOKEN_SECRET: '', SANYE_MANAGE_TOKEN: '',
    ...credentials }
  // Clear alternate Spring binding names so a developer session cannot satisfy a negative case.
  for (const key of Object.keys(env)) if (/^(?:SPRING_APPLICATION_JSON|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|SPRING_PROFILES_ACTIVE|SANYE_AUTH_TOKENSECRET|TOKEN_SECRET)$/i.test(key)) delete env[key]
  const args = ['-Xmx256m', '-jar', jars[name], `--server.port=${httpPort}`, `--management.server.port=${httpPort}`,
    '--server.address=127.0.0.1', '--spring.main.banner-mode=off',
    '--management.health.rabbit.enabled=false',
    '--logging.level.root=WARN', '--logging.level.com.sanye.admin=INFO']
  const child = spawn(java, args, { env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  const entry = { child, name, chunks: [], httpPort }
  processes.push(entry)
  entry.closed = new Promise(resolve => { child.once('error', () => resolve(-1)); child.once('close', resolve) })
  child.stdout.on('data', bytes => entry.chunks.push(bytes))
  child.stderr.on('data', bytes => entry.chunks.push(bytes))
  return entry
}
async function rejected(name, credentials, key) {
  const entry = await launch(name, credentials)
  let timer
  const code = await Promise.race([entry.closed, new Promise(resolve => { timer = setTimeout(() => resolve(null), 30000) })])
  clearTimeout(timer)
  check(code !== null && code !== 0 && Buffer.concat(entry.chunks).toString().includes(key), `${name}-reject-${report.checks.length}`)
}
try {
  await mkdir(root, { recursive: true })
  report.scriptSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex')
  for (const [name, filename] of Object.entries(jars)) {
    report.artifacts.push({ name, path: path.relative(process.cwd(), filename), sha256: createHash('sha256').update(await readFile(filename)).digest('hex') })
  }
  await rejected('gateway', {}, 'sanye.auth.token-secret')
  await rejected('gateway', { AUTH_TOKEN_SECRET: 'change-this-secret-in-environment' }, 'sanye.auth.token-secret')
  await rejected('admin', {}, 'token.secret')
  await rejected('admin', { SANYE_ADMIN_TOKEN_SECRET: secrets[0], SANYE_MANAGE_TOKEN: 'change-this-secret-in-environment' }, 'sanye-admin.manage-token')
  const entry = await launch('gateway', { AUTH_TOKEN_SECRET: secrets[1] })
  let healthy = false
  const deadline = Date.now() + 60000
  while (Date.now() < deadline && entry.child.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${entry.httpPort}/actuator/health`, { signal: AbortSignal.timeout(1000) })
      healthy = response.ok && (await response.json()).status === 'UP'
      if (healthy) break
    } catch { }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  check(healthy, 'gateway-injected-credential-health-up')
  report.status = 'passed'
} catch (failure) {
  report.status = 'failed'
  report.failure = 'Startup verification failed; consult redacted checks and logs.'
  process.exitCode = 1
} finally {
  for (const [index, entry] of processes.entries()) {
    try { await terminate(entry.child); await entry.closed }
    catch { report.status = 'failed'; process.exitCode = 1 }
    const log = Buffer.concat(entry.chunks).toString('utf8')
    const leaked = secrets.some(secret => log.includes(secret))
    report.checks.push({ label: `${entry.name}-${index}-log-no-injected-secret`, passed: !leaked })
    if (leaked) { report.status = 'failed'; process.exitCode = 1 }
    let redacted = log
    for (const secret of secrets) redacted = redacted.replaceAll(secret, '[REDACTED]')
    await writeFile(path.join(root, `${entry.name}-${index}.log`), redacted)
  }
  report.processesStopped = processes.every(entry => entry.child.exitCode !== null || entry.child.signalCode !== null)
  if (!report.processesStopped) { report.status = 'failed'; process.exitCode = 1 }
  report.finishedAt = new Date().toISOString()
  await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}
