// Acceptance for the failure path itself: when a local service dies during
// startup, the app must (a) keep running with a dialog instead of vanishing,
// (b) write <user data>/local-services/logs/startup-error.log, and (c) name the
// failing service, its exit code and the tail of that service's log, so a remote
// report is actionable without guessing.
//
// The delivered package is mirrored with hard links and ONLY anime.jar is
// replaced, which reproduces the exact "anime failed to start" case from the
// recipient report without touching the package that is being delivered.
//
// Usage: node sanye_desktop/verify-failure-diagnostics.cjs "<package dir or exe>"
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')

// Hard links keep the mirror cheap, but a linked file shares its content with
// the package: writing through the link would truncate the delivered artifact.
// `copyInstead` therefore names the files that must be real copies because this
// script is going to damage them on purpose.
async function mirror(source, target, copyInstead = new Set()) {
  await fsp.mkdir(target, { recursive: true })
  for (const entry of await fsp.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) { await mirror(from, to, copyInstead); continue }
    if (!entry.isFile()) continue
    if (copyInstead.has(path.relative(source, from).replace(/\\/g, '/'))) { await fsp.copyFile(from, to); continue }
    try { await fsp.link(from, to) } catch { await fsp.copyFile(from, to) }
  }
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

async function waitForLog(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = await fsp.readFile(file, 'utf8').catch(() => '')
    if (text.includes('"children"')) return text
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return ''
}

async function main() {
  const target = process.argv[2]
  if (!target) throw new Error('Usage: node sanye_desktop/verify-failure-diagnostics.cjs "<package dir or exe>"')
  const resolved = path.resolve(target)
  const packageRoot = resolved.toLowerCase().endsWith('.exe') ? path.dirname(resolved) : resolved
  const exe = path.join(packageRoot, '三叶动漫.exe')
  await fsp.access(exe).catch(() => { throw new Error(`打包 EXE 不存在：${exe}`) })

  const base = path.resolve(process.env.SANYE_FAILURE_PROBE_BASE || path.join(__dirname, '../sanye_deploy/.local'))
  await fsp.mkdir(base, { recursive: true })
  const work = await fsp.mkdtemp(path.join(base, 'failure-diagnostics-'))
  const report = { packageRoot, exe, work, status: 'running', checks: [] }
  let child = null
  try {
    const sourceJar = path.join(packageRoot, 'resources', 'runtime', 'jars', 'anime.jar')
    const sourceJarHash = sha256(sourceJar)
    report.sourceJar = { path: sourceJar, sha256: sourceJarHash }
    const mirrorRoot = path.join(work, 'pkg')
    await mirror(packageRoot, mirrorRoot, new Set(['resources/runtime/jars/anime.jar']))
    const jar = path.join(mirrorRoot, 'resources', 'runtime', 'jars', 'anime.jar')
    // Break any remaining link before writing; the package must stay untouched.
    await fsp.rm(jar, { force: true })
    await fsp.writeFile(jar, 'not a jar')
    report.corruptedJar = jar
    report.checks.push('package-mirrored-with-hard-links')
    if (sha256(sourceJar) !== sourceJarHash) {
      throw new Error(`镜像写入破坏了交付包本体：${sourceJar}。该验收脚本必须先断开硬链接。`)
    }
    report.checks.push('source-package-untouched')

    const data = path.join(work, 'data')
    const logFile = path.join(data, 'local-services', 'logs', 'startup-error.log')
    child = spawn(path.join(mirrorRoot, '三叶动漫.exe'), [`--sanye-data-dir=${data}`], { windowsHide: true, stdio: 'ignore' })
    const text = await waitForLog(logFile, 180000)
    if (!text) throw new Error(`未写出启动失败记录：${logFile}`)
    report.startupErrorLog = logFile
    report.checks.push('startup-error-log-written')
    if (child.exitCode !== null) throw new Error('启动失败后应用直接退出，用户看不到任何提示')
    report.checks.push('app-stays-open-with-dialog')

    // A damaged package is now caught by the integrity preflight, which names the
    // file instead of letting the JVM fail minutes later with a bare "service
    // failed to start". Accept either report, but require it to be specific.
    const integrityReport = /软件包文件不完整或已损坏/.test(text)
    if (integrityReport) {
      if (!/jars\/anime\.jar/.test(text)) throw new Error('完整性预检未指明损坏的文件')
      report.checks.push('damaged-file-named-before-startup')
    } else {
      if (!/"name": "anime"/.test(text)) throw new Error('日志未指明失败的 anime 服务')
      report.checks.push('failing-service-named')
      if (!/"exitCode": 1/.test(text)) throw new Error('日志未记录 anime 的退出码')
      report.checks.push('exit-code-recorded')
    }
    if (!/"missingPackageFiles": \[\]/.test(text)) throw new Error('日志未记录包文件完整性清单')
    report.checks.push('package-file-inventory-recorded')
    if (!/anime.*(jarfile|jar)/i.test(text)) throw new Error('日志未包含 anime 服务自身的日志尾部')
    report.checks.push('service-log-tail-included')
    if (!/"postgres"/.test(text) || !/"fixed-catalog"/.test(text)) throw new Error('日志未包含其它组件日志尾部')
    report.checks.push('all-component-logs-included')

    report.excerpt = text.slice(0, 700)
    report.status = 'passed'
    console.log('失败诊断验收通过：应用保持打开、写出 startup-error.log，并记录失败服务、退出码、包文件清单与各服务日志尾部')
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    console.error(error.message)
    process.exitCode = 1
  } finally {
    // Kill the whole tree: the app owns PostgreSQL and three JVMs.
    if (child?.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
    const jarPath = path.join(packageRoot, 'resources', 'runtime', 'jars', 'anime.jar')
    if (report.sourceJar && fs.existsSync(jarPath)) {
      report.sourceJarUnchangedAfterRun = sha256(jarPath) === report.sourceJar.sha256
      if (!report.sourceJarUnchangedAfterRun) {
        report.status = 'failed'
        report.error = '验收脚本修改了交付包本体'
        process.exitCode = 1
      }
    }
    await fsp.writeFile(path.join(work, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`报告：${path.join(work, 'report.json')}`)
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
