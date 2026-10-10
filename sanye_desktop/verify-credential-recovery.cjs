// Headless reproduction of the two recipient-visible startup failures that do
// not involve any window:
//
//   1. an existing local PostgreSQL cluster whose stored credential no longer
//      matches settings.json - PostgreSQL still answers pg_isready because it
//      never authenticates, so every Java service used to die with
//      "password authentication failed for user sanye";
//   2. a cluster left behind by a forced exit (Task Manager, crash, power loss),
//      which used to fail with "pre-existing shared memory block is still in use".
//
// It drives the packaged app.asar runtime.cjs, not the source tree, and never
// opens a window: the packaged executable is used only as a Node loader.
//
// Usage: node sanye_desktop/verify-credential-recovery.cjs "<package dir or exe>"
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const probeSource = `
const { LocalRuntime } = require(process.env.SANYE_PROBE_APPLICATION)
const runtime = new LocalRuntime(process.env.SANYE_PROBE_ROOT, process.env.SANYE_PROBE_DATA)
runtime.start().then(async () => {
  console.log('SANYE_PROBE ' + JSON.stringify({
    origin: runtime.origin, cookie: runtime.cookie, port: runtime.server.address().port,
    preferredPort: runtime.preferredPort, portFallback: runtime.portFallback, ready: runtime.ready,
  }))
  process.stdin.resume()
  process.stdin.on('data', async chunk => {
    if (!String(chunk).includes('stop')) return
    await runtime.stop()
    process.exit(0)
  })
}, error => {
  console.log('SANYE_PROBE_ERROR ' + JSON.stringify({ message: error.message }))
  process.exit(3)
})
`

function startProbe(loader, environment, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn(loader, ['-e', probeSource], { env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', settled = false
    const finish = (error, value) => { if (!settled) { settled = true; error ? reject(error) : resolve(value) } }
    const timer = setTimeout(() => { finish(new Error(`包内运行时启动超时（${timeout}ms）`)); child.kill() }, timeout)
    timer.unref?.()
    child.stdout.on('data', bytes => {
      stdout += bytes.toString()
      for (const line of stdout.split(/\r?\n/)) {
        if (line.startsWith('SANYE_PROBE ')) {
          clearTimeout(timer)
          finish(null, {
            probe: JSON.parse(line.slice('SANYE_PROBE '.length)),
            stop: async () => {
              child.stdin.write('stop\n')
              await new Promise(resolveStop => child.once('close', resolveStop))
            },
            // Hard-kill the whole tree and leave whatever is on disk behind.
            kill: () => {
              spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
              return new Promise(resolveStop => child.once('close', resolveStop))
            },
            stdout: () => stdout,
          })
          return
        }
        if (line.startsWith('SANYE_PROBE_ERROR ')) {
          clearTimeout(timer)
          finish(new Error(`包内运行时未能启动：${JSON.parse(line.slice('SANYE_PROBE_ERROR '.length)).message}`))
          return
        }
      }
    })
    child.stderr.on('data', bytes => { stderr += bytes.toString() })
    child.on('error', error => { clearTimeout(timer); finish(error) })
    child.on('close', code => {
      clearTimeout(timer)
      finish(new Error(`包内运行时提前退出（exit ${code}）：${stderr.trim() || stdout.trim()}`))
    })
  })
}

async function catalog(probe) {
  const response = await fetch(`${probe.origin}/api/v1/anime`, { headers: { cookie: `sanyeDesktop=${probe.cookie}` } })
  const text = await response.text()
  if (response.status !== 200) throw new Error(`目录接口返回 ${response.status}`)
  const body = JSON.parse(text)
  if (body.code !== 0 || !body.data?.items?.length) throw new Error(`目录数据为空：${text.slice(0, 200)}`)
  return body.data.items.length
}

async function main() {
  const target = process.argv[2]
  if (!target) throw new Error('Usage: node sanye_desktop/verify-credential-recovery.cjs "<package dir or exe>"')
  const resolved = path.resolve(target)
  const root = resolved.toLowerCase().endsWith('.exe') ? path.dirname(resolved) : resolved
  const exe = path.join(root, '三叶动漫.exe')
  const application = path.join(root, 'resources', 'app.asar', 'runtime.cjs')
  const runtimeRoot = path.join(root, 'resources', 'runtime')
  await fsp.access(exe).catch(() => { throw new Error(`打包 EXE 不存在：${exe}`) })
  // A path inside app.asar is only readable by Electron, so plain Node can only
  // prove the archive itself is present; the loader reports a missing entry.
  await fsp.access(path.join(root, 'resources', 'app.asar')).catch(() => { throw new Error(`包内 app.asar 不存在：${application}`) })

  const base = path.resolve(process.env.SANYE_CREDENTIAL_RECOVERY_BASE || path.join(__dirname, '../sanye_deploy/.local'))
  await fsp.mkdir(base, { recursive: true })
  const work = await fsp.mkdtemp(path.join(base, 'credential-recovery-'))
  // A non-ASCII data directory on purpose: the recipient-visible failure was
  // reported from exactly this layout, and it forces the English-only mirror.
  const data = path.join(work, process.env.SANYE_CREDENTIAL_DATA_NAME || '中文用户 数据', 'local-services')
  const environment = { ...process.env, ELECTRON_RUN_AS_NODE: '1', SANYE_PROBE_APPLICATION: application, SANYE_PROBE_ROOT: runtimeRoot, SANYE_PROBE_DATA: data }
  const report = { root, application, data, passes: [], status: 'running' }

  try {
    // Pass 0: a healthy first start must import the seed.
    {
      const session = await startProbe(exe, environment)
      try { report.passes.push({ pass: 0, scenario: 'first-start', items: await catalog(session.probe) }) }
      finally { await session.stop() }
    }

    // Pass 1: corrupt the stored credential exactly as a stale settings.json
    // would, then require a repair instead of a failed start.
    const settingsPath = path.join(data, 'settings.json')
    const settings = JSON.parse(await fsp.readFile(settingsPath, 'utf8'))
    const stale = 'f'.repeat(64)
    await fsp.writeFile(settingsPath, JSON.stringify({ ...settings, databasePassword: stale }))
    {
      const session = await startProbe(exe, environment)
      try { report.passes.push({ pass: 1, scenario: 'stale-credential', items: await catalog(session.probe) }) }
      finally { await session.stop() }
    }
    const credentialLog = await fsp.readFile(path.join(data, 'logs', 'database-credentials.log'), 'utf8').catch(() => '')
    if (!credentialLog.trim()) throw new Error('凭据失配后未写入 database-credentials.log')
    report.credentialLogBytes = credentialLog.length
    report.credentialLogLeaksPassword = credentialLog.includes(stale)
    if (report.credentialLogLeaksPassword) throw new Error('凭据日志不得包含数据库口令')

    // Pass 2: kill the whole stack without a shutdown, then require the next
    // start to take over the leftover cluster.
    {
      const session = await startProbe(exe, environment)
      await session.kill()
    }
    // A non-ASCII data directory moves the cluster into the English-only mirror,
    // so the leftover file must be looked up at the path the package recorded.
    const layout = JSON.parse(await fsp.readFile(path.join(data, 'runtime-layout.json'), 'utf8'))
    const pidFile = path.join(layout.database, 'postmaster.pid')
    report.leftOverPidFile = fs.existsSync(pidFile)
    report.leftOverPidFilePath = pidFile
    if (!report.leftOverPidFile) throw new Error('强杀后未留下 postmaster.pid，本次无法证明残留接管')
    {
      const session = await startProbe(exe, environment)
      try { report.passes.push({ pass: 2, scenario: 'forced-exit', items: await catalog(session.probe) }) }
      finally { await session.stop() }
    }
    report.status = 'passed'
    console.log(`本地服务自愈验收通过：首次启动、凭据失配修复、强杀残留接管后均能提供目录数据（${report.passes.map(entry => `${entry.scenario}=${entry.items}`).join('，')}）`)
    console.log(`报告：${path.join(work, 'report.json')}`)
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    console.error(error.message)
    process.exitCode = 1
  } finally {
    await fsp.writeFile(path.join(work, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {})
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
