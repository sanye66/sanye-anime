// Acceptance check for the "could not locate my own executable path" defect:
// the bundled PostgreSQL must initialise, start, seed and stop even when the
// package directory and the user data directory contain characters the target
// Windows code page cannot represent.
const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { randomBytes } = require('node:crypto')
const { preparePostgresLayout, provisionDatabase } = require('./postgresTemplate.cjs')
const { postgresEnvironment, freePort } = require('./runtime.cjs')
const { localProcessEnvironment } = require('./processEnvironment.cjs')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const isAsciiPath = value => typeof value === 'string' && /^[\x00-\x7f]+$/.test(value)

async function run(executable, args, env) {
  const child = spawn(executable, args, { cwd: path.dirname(executable), env: { ...localProcessEnvironment(), ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', bytes => { stdout += bytes })
  child.stderr.on('data', bytes => { stderr += bytes })
  const code = await new Promise(resolve => child.on('close', resolve))
  return { code, stdout, stderr }
}

async function executablePathOf(pid) {
  const powershell = path.join(process.env.SystemRoot || process.env.WINDIR, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ExecutablePath`
  const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 30000 })
  return stdout.trim()
}

async function main() {
  const runtime = path.join(__dirname, 'runtime')
  const base = await fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/ascii-runtime-'))
  const packageRoot = path.join(base, '三叶动漫_免安装版')
  const data = path.join(base, '中文 用户 数据')
  const asciiRoot = path.join(base, 'ascii')
  const report = { base, packageRoot, data, checks: [], status: 'running' }
  let child = null
  try {
    await fs.mkdir(packageRoot, { recursive: true })
    for (const entry of ['postgres', 'postgres-template']) await fs.cp(path.join(runtime, entry), path.join(packageRoot, entry), { recursive: true })
    await fs.cp(path.join(runtime, 'seed.sql'), path.join(packageRoot, 'seed.sql'))
    const layout = await preparePostgresLayout({ root: packageRoot, data, env: { ...process.env, SANYE_DESKTOP_ASCII_ROOT: asciiRoot } })
    report.layout = { runtime: layout.runtime, executable: layout.executable, database: layout.database, seed: layout.seed, asciiRoot: layout.asciiRoot, relocatedRuntime: layout.relocatedRuntime, relocatedData: layout.relocatedData, migratedData: layout.migratedData }
    for (const [name, value] of Object.entries({ runtime: layout.runtime, executable: layout.executable, database: layout.database, seed: layout.seed, asciiRoot: layout.asciiRoot })) {
      if (!isAsciiPath(value)) throw new Error(`${name} must be ASCII-only: ${value}`)
      report.checks.push(`ascii-${name}`)
    }
    const password = randomBytes(32).toString('hex')
    const provisioned = await provisionDatabase(packageRoot, layout.database, password, layout.executable)
    if (!provisioned) throw new Error('Expected a newly provisioned database')
    report.checks.push('provision-from-chinese-package-path')
    const environment = postgresEnvironment(password)
    const port = await freePort()
    child = spawn(layout.executable, ['-D', layout.database, '-p', String(port), '-h', '127.0.0.1'], {
      cwd: path.dirname(layout.executable), env: { ...localProcessEnvironment(), ...environment }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let log = ''
    child.stdout.on('data', bytes => { log += bytes })
    child.stderr.on('data', bytes => { log += bytes })
    const pgArgs = ['-h', '127.0.0.1', '-p', String(port), '-U', 'sanye', '-d', 'postgres']
    let ready = false
    for (let attempt = 0; attempt < 120 && !ready; attempt++) {
      await delay(500)
      if (child.exitCode !== null) break
      const probe = await run(path.join(layout.bin, 'pg_isready.exe'), [...pgArgs, '-t', '2'], environment).catch(error => ({ code: -1, stderr: error.message }))
      ready = probe.code === 0
    }
    if (!ready) throw new Error(`PostgreSQL did not accept connections: ${log.slice(0, 400)}`)
    report.checks.push('postgres-ready-from-ascii-mirror')
    const pid = Number((await fs.readFile(path.join(layout.database, 'postmaster.pid'), 'utf8')).split(/\r?\n/)[0])
    const running = await executablePathOf(pid)
    if (path.resolve(running).toLowerCase() !== path.resolve(layout.executable).toLowerCase()) throw new Error(`PostgreSQL runs from ${running}`)
    report.runningPostgres = running
    report.checks.push('running-executable-inside-ascii-mirror')
    // psql receives the seed path as an argument, so an ASCII mirror is
    // required for the packed catalogue seed as well.
    const seeded = await run(path.join(layout.bin, 'psql.exe'), [...pgArgs, '-X', '-w', '-tA', '-c', 'SELECT 1'], environment)
    if (seeded.code !== 0 || seeded.stdout.trim() !== '1') throw new Error(`Client query failed (${seeded.code}): ${seeded.stderr.slice(0, 300)}`)
    const seed = await fs.stat(layout.seed)
    if (!seed.isFile() || seed.size === 0) throw new Error(`Seed file is missing: ${layout.seed}`)
    report.checks.push('client-tools-and-seed-path-in-ascii-mirror')
    const stopped = await run(path.join(layout.bin, 'pg_ctl.exe'), ['-D', layout.database, '-m', 'fast', '-w', '-t', '30', 'stop'], environment)
    if (stopped.code !== 0) throw new Error(`Stopping failed (${stopped.code}): ${stopped.stderr.slice(0, 300)}`)
    report.checks.push('graceful-stop')
    // The mirror shares the packaged bytes on the same volume; only the fresh
    // test database holds real disk space, so remove the run's own copies.
    for (const directory of [packageRoot, asciiRoot, data]) await fs.rm(directory, { recursive: true, force: true })
    report.cleaned = true
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    process.exitCode = 1
  } finally {
    if (child && child.exitCode === null) child.kill()
    await fs.writeFile(path.join(base, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ ...report, report: path.join(base, 'report.json') }, null, 2))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
