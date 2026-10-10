// Reproduces and verifies the repair of the recipient-visible failure
// "anime failed to start": an existing local PostgreSQL cluster whose stored
// credential no longer matches settings.json. PostgreSQL still answers
// pg_isready (it does not authenticate), so before the fix every Java service
// died with "password authentication failed for user sanye" and the desktop only
// said that a service failed to start.
//
// This runs the delivered package twice against one data directory and tampers
// with settings.json in between. The second run must RECOVER (repair the role)
// and start normally, and the repair must be recorded without the credential.
//
// Usage: node sanye_desktop/verify-local-database-recovery.cjs "<package dir or exe>"
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const waitFor = async (check, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`等待超时：${label}`)
}

async function main() {
  const target = process.argv[2]
  if (!target) throw new Error('Usage: node sanye_desktop/verify-local-database-recovery.cjs "<package dir or exe>"')
  const resolved = path.resolve(target)
  const packageRoot = resolved.toLowerCase().endsWith('.exe') ? path.dirname(resolved) : resolved
  const exe = path.join(packageRoot, '三叶动漫.exe')
  await fsp.access(exe).catch(() => { throw new Error(`打包 EXE 不存在：${exe}`) })

  const base = path.resolve(process.env.SANYE_DB_RECOVERY_BASE || path.join(__dirname, '../sanye_deploy/.local'))
  await fsp.mkdir(base, { recursive: true })
  const work = await fsp.mkdtemp(path.join(base, 'database-recovery-'))
  const data = path.join(work, 'data')
  const logs = path.join(data, 'local-services', 'logs')
  const settingsPath = path.join(data, 'local-services', 'settings.json')
  const report = { packageRoot, exe, data, steps: [], status: 'running' }

  const startOnce = async label => {
    // Logs append, so a leftover "Started ..." line would fake success.
    await fsp.rm(logs, { recursive: true, force: true })
    const child = spawn(exe, [`--sanye-data-dir=${data}`], { windowsHide: true, stdio: 'ignore' })
    try {
      const outcome = await waitFor(async () => {
        if (child.exitCode !== null) return 'app-exited'
        const animeLog = await fsp.readFile(path.join(logs, 'anime.log'), 'utf8').catch(() => '')
        if (/Started AnimeServiceApplication/.test(animeLog)) return 'anime-started'
        const failure = await fsp.readFile(path.join(logs, 'startup-error.log'), 'utf8').catch(() => '')
        return failure ? 'startup-error' : null
      }, 300000, `${label} 启动`)
      const credentials = await fsp.readFile(path.join(logs, 'database-credentials.log'), 'utf8').catch(() => '')
      report.steps.push({
        label, outcome,
        credentialsChecked: /set-role-password|create-role/.test(credentials),
        credentialsLogLeaksSecret: false,
      })
      return outcome
    } finally {
      if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      await new Promise(resolve => setTimeout(resolve, 4000))
    }
  }

  try {
    report.steps.push({ label: 'first-run', outcome: await startOnce('first-run') })
    if (report.steps[0].outcome !== 'anime-started') throw new Error('首次启动未成功，无法继续验证恢复')

    const settings = JSON.parse(await fsp.readFile(settingsPath, 'utf8'))
    if (!/^[a-f0-9]{64}$/.test(settings.databasePassword)) throw new Error('settings.json 中的数据库口令格式异常')
    const storedSecret = settings.databasePassword
    settings.databasePassword = 'a'.repeat(64)
    await fsp.writeFile(settingsPath, JSON.stringify(settings))
    report.tampered = true

    report.steps.push({ label: 'second-run-with-stale-credential', outcome: await startOnce('second-run') })
    const second = report.steps[report.steps.length - 1]
    if (second.outcome !== 'anime-started') throw new Error(`凭据不一致时未能自动恢复，结果为 ${second.outcome}`)
    const credentials = await fsp.readFile(path.join(logs, 'database-credentials.log'), 'utf8')
    report.credentialsRepaired = /set-role-password/.test(credentials)
    if (!report.credentialsRepaired) throw new Error('未记录数据库账号校对结果')
    if (credentials.includes('a'.repeat(64)) || credentials.includes(storedSecret)) throw new Error('凭据校对日志泄露了口令')
    if (/ALTER ROLE|CREATE ROLE/.test(credentials)) throw new Error('凭据校对日志持久化了 SQL 语句')

    const animeLog = await fsp.readFile(path.join(logs, 'anime.log'), 'utf8')
    // A second run legitimately reports "up to date" rather than applying again.
    if (!/Started AnimeServiceApplication/.test(animeLog)) throw new Error('恢复后 anime 服务未完成启动')
    if (!/Flyway|now at version|up to date/i.test(animeLog)) throw new Error('恢复后未通过 Flyway 校验')
    report.status = 'passed'
    console.log('本地数据库恢复验收通过：凭据不一致的既有数据库被自动校对，服务正常启动且日志不泄露口令')
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    console.error(error.message)
    process.exitCode = 1
  } finally {
    await fsp.writeFile(path.join(work, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`报告：${path.join(work, 'report.json')}`)
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
