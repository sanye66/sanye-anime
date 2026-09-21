const { _electron } = require('../e2e/node_modules/playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const redistributableDll = /^(?:vcruntime\d+(?:_[a-z0-9]+)*|msvcp\d+(?:_[a-z0-9]+)*|concrt\d+(?:_[a-z0-9]+)*)\.dll$/i
const isAsciiPath = value => typeof value === 'string' && /^[\x00-\x7f]+$/.test(value)

function isWithin(file, root) {
  const relative = path.relative(path.resolve(root), path.resolve(file))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function isolatedWindowsEnvironment(base) {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR
  assert.ok(systemRoot && path.isAbsolute(systemRoot), 'Windows system directory is unavailable')
  const profile = path.join(base, 'isolated-user')
  const appData = path.join(profile, 'AppData', 'Roaming')
  const localAppData = path.join(profile, 'AppData', 'Local')
  const temp = path.join(localAppData, 'Temp')
  await Promise.all([profile, appData, localAppData, temp].map(directory => fs.mkdir(directory, { recursive: true })))
  const windowsPath = [path.join(systemRoot, 'System32'), systemRoot]
  const environment = {
    SystemRoot: systemRoot,
    WINDIR: systemRoot,
    SystemDrive: path.parse(systemRoot).root.replace(/[\\/]$/, ''),
    ComSpec: path.join(systemRoot, 'System32', 'cmd.exe'),
    OS: 'Windows_NT',
    PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
    PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE || 'AMD64',
    NUMBER_OF_PROCESSORS: process.env.NUMBER_OF_PROCESSORS || '1',
    USERPROFILE: profile,
    HOMEDRIVE: path.parse(profile).root.replace(/[\\/]$/, ''),
    HOMEPATH: profile.slice(path.parse(profile).root.length - 1),
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    TEMP: temp,
    TMP: temp,
    PATH: windowsPath.join(';'),
  }
  const prohibited = /^(?:electron_run_as_node|java_home|jdk_home|node_options|node_path|classpath|maven_home|m2_home|gradle_home|pg.*)$/i
  assert.deepEqual(Object.keys(environment).filter(key => prohibited.test(key)), [])
  assert.ok(environment.PATH.split(';').every(entry => isWithin(entry, systemRoot)), 'PATH must contain Windows directories only')
  return {
    environment,
    evidence: {
      USERPROFILE: profile,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      TEMP: temp,
      PATH: windowsPath,
      pathWindowsOnly: true,
      syntheticPathsUnderTestBase: [profile, appData, localAppData, temp].every(directory => isWithin(directory, base)),
      prohibitedVariablesAbsent: ['ELECTRON_RUN_AS_NODE', 'JAVA_HOME', 'JDK_HOME', 'NODE_OPTIONS', 'NODE_PATH', 'CLASSPATH', 'MAVEN_HOME', 'M2_HOME', 'GRADLE_HOME', 'PG*'],
      excludedHostVariables: Object.keys(process.env).filter(key => prohibited.test(key)).sort(),
    },
  }
}

async function collectProcessEvidence({ exe, data, launcherPid, pgPid, layout }) {
  const packageRoot = path.dirname(exe)
  const runtimeRoot = path.join(packageRoot, 'resources', 'runtime')
  const javaExe = path.join(runtimeRoot, 'java', 'bin', 'java.exe')
  const postgresExe = layout.executable
  const powershell = path.join(process.env.SystemRoot || process.env.WINDIR, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
$all = @(Get-CimInstance Win32_Process)
$mainMatches = @($all | Where-Object {
  $_.ExecutablePath -and $_.CommandLine -and
  [IO.Path]::GetFullPath($_.ExecutablePath).Equals([IO.Path]::GetFullPath($env:SANYE_EVIDENCE_EXE), [StringComparison]::OrdinalIgnoreCase) -and
  $_.CommandLine.IndexOf($env:SANYE_EVIDENCE_DATA_ARGUMENT, [StringComparison]::OrdinalIgnoreCase) -ge 0
})
if ($mainMatches.Count -ne 1) { throw "Expected one packaged Electron main process, found $($mainMatches.Count)" }
$targets = @(
  [pscustomobject]@{ Role = 'electron-main'; ProcessId = [int]$mainMatches[0].ProcessId; ExpectedExecutable = $env:SANYE_EVIDENCE_EXE },
  [pscustomobject]@{ Role = 'postgres'; ProcessId = [int]$env:SANYE_EVIDENCE_PG_PID; ExpectedExecutable = $env:SANYE_EVIDENCE_POSTGRES }
)
foreach ($service in @('anime', 'search', 'favorite')) {
  $jar = [IO.Path]::Combine($env:SANYE_EVIDENCE_RUNTIME, 'jars', "$service.jar")
  $serviceMatches = @($all | Where-Object {
    $_.ExecutablePath -and $_.CommandLine -and
    [IO.Path]::GetFullPath($_.ExecutablePath).Equals([IO.Path]::GetFullPath($env:SANYE_EVIDENCE_JAVA), [StringComparison]::OrdinalIgnoreCase) -and
    $_.CommandLine.IndexOf($jar, [StringComparison]::OrdinalIgnoreCase) -ge 0
  })
  if ($serviceMatches.Count -ne 1) { throw "Expected one packaged $service Java process, found $($serviceMatches.Count)" }
  $targets += [pscustomobject]@{ Role = "java-$service"; ProcessId = [int]$serviceMatches[0].ProcessId; ExpectedExecutable = $env:SANYE_EVIDENCE_JAVA }
}
$processes = foreach ($target in $targets) {
  $info = $all | Where-Object ProcessId -eq $target.ProcessId | Select-Object -First 1
  if (-not $info) { throw "Process $($target.ProcessId) for $($target.Role) disappeared" }
  $modules = @((Get-Process -Id $target.ProcessId -ErrorAction Stop).Modules | ForEach-Object {
    [pscustomobject]@{ name = $_.ModuleName; path = $_.FileName }
  })
  [pscustomobject]@{
    role = $target.Role
    pid = [int]$target.ProcessId
    parentPid = [int]$info.ParentProcessId
    executablePath = $info.ExecutablePath
    expectedExecutable = $target.ExpectedExecutable
    commandLine = $info.CommandLine
    modules = $modules
  }
}
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 28710 -ErrorAction Stop | ForEach-Object {
  [pscustomobject]@{ address = $_.LocalAddress; port = [int]$_.LocalPort; pid = [int]$_.OwningProcess }
})
[pscustomobject]@{ processes = @($processes); listeners = $listeners } | ConvertTo-Json -Depth 6 -Compress
`
  const { stdout } = await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: {
      ...process.env,
      SANYE_EVIDENCE_PG_PID: String(pgPid),
      SANYE_EVIDENCE_EXE: exe,
      SANYE_EVIDENCE_DATA_ARGUMENT: `--sanye-data-dir=${data}`,
      SANYE_EVIDENCE_POSTGRES: postgresExe,
      SANYE_EVIDENCE_JAVA: javaExe,
      SANYE_EVIDENCE_RUNTIME: runtimeRoot,
    },
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  })
  const evidence = JSON.parse(stdout)
  evidence.processes = Array.isArray(evidence.processes) ? evidence.processes : [evidence.processes]
  evidence.listeners = evidence.listeners ? (Array.isArray(evidence.listeners) ? evidence.listeners : [evidence.listeners]) : []
  assert.equal(evidence.processes.length, 5)
  assert.deepEqual(evidence.processes.map(item => item.role).sort(), ['electron-main', 'java-anime', 'java-favorite', 'java-search', 'postgres'])
  const electronMain = evidence.processes.find(item => item.role === 'electron-main')
  assert.ok(isAsciiPath(layout.runtime) && isAsciiPath(layout.database), 'PostgreSQL paths must be ASCII-only')
  assert.ok(isAsciiPath(postgresExe), 'PostgreSQL executable must live in an ASCII-only directory')
  for (const item of evidence.processes) {
    assert.equal(path.resolve(item.executablePath).toLowerCase(), path.resolve(item.expectedExecutable).toLowerCase(), `${item.role} executable path`)
    assert.ok(isWithin(item.executablePath, packageRoot) || isWithin(item.executablePath, layout.runtime), `${item.role} executable must be inside the package or the ASCII PostgreSQL runtime`)
    if (item.role !== 'electron-main') assert.equal(item.parentPid, electronMain.pid, `${item.role} must be owned by the packaged Electron main process`)
    if (item.role.startsWith('java-')) {
      assert.match(item.commandLine, /--server\.address=127\.0\.0\.1/i)
      const service = item.role.slice('java-'.length)
      assert.ok(item.commandLine.toLowerCase().includes(path.join(runtimeRoot, 'jars', `${service}.jar`).toLowerCase()))
    }
    if (item.role === 'postgres') {
      assert.ok(item.commandLine.toLowerCase().includes(layout.database.toLowerCase()))
      assert.ok(item.commandLine.toLowerCase().includes(layout.runtime.toLowerCase()))
      assert.match(item.commandLine, /(?:^|\s)-h\s+127\.0\.0\.1(?:\s|$)/i)
    }
    assert.ok(item.modules.length > 0, `${item.role} module list must not be empty`)
    for (const module of item.modules) {
      const underWindows = isWithin(module.path, process.env.SystemRoot || process.env.WINDIR)
      const underPackage = isWithin(module.path, packageRoot)
      const underPostgres = isWithin(module.path, layout.runtime)
      assert.ok(underWindows || underPackage || underPostgres, `${item.role} loaded a module outside Windows, the package and the ASCII PostgreSQL runtime: ${module.path}`)
      assert.ok(!(underWindows && redistributableDll.test(module.name)), `${item.role} loaded Windows VC++ redistributable: ${module.path}`)
    }
  }
  assert.deepEqual(evidence.listeners, [{ address: '127.0.0.1', port: 28710, pid: electronMain.pid }])
  evidence.launcherPid = launcherPid
  evidence.packageRoot = packageRoot
  evidence.postgresLayout = { runtime: layout.runtime, data: layout.database, asciiRoot: layout.asciiRoot, relocatedRuntime: layout.relocatedRuntime, relocatedData: layout.relocatedData }
  evidence.windowsRoot = process.env.SystemRoot || process.env.WINDIR
  evidence.modulePolicy = 'Every non-Windows module is package- or ASCII-runtime-contained; Windows VC++ redistributable DLLs are rejected.'
  return evidence
}

async function main() {
  const exe = path.resolve(process.argv[2])
  const base = await fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/first-run-'))
  // Defaults to a non-ASCII data directory; SANYE_FIRST_RUN_DATA_NAME covers the
  // ASCII branch of the PostgreSQL layout as well.
  const data = path.join(base, process.env.SANYE_FIRST_RUN_DATA_NAME || '中文用户 数据')
  const { environment, evidence: environmentEvidence } = await isolatedWindowsEnvironment(base)
  const report = { exe, data, isolatedEnvironment: environmentEvidence, postgresLayouts: [], processEvidence: [], httpEvidence: [], checks: [], status: 'running' }
  try {
    for (let pass = 0; pass < 2; pass++) {
      const app = await _electron.launch({ executablePath: exe, args: [`--sanye-data-dir=${data}`], env: environment, timeout: 30000 })
      const child = app.process()
      try {
        const page = await app.firstWindow()
        await page.waitForURL('http://127.0.0.1:28710/', { timeout: 240000 })
        await page.locator('.home-hero').waitFor()
        const catalogResult = await page.evaluate(async () => {
          const response = await fetch('/api/v1/anime')
          return { url: response.url, body: await response.json() }
        })
        assert.equal(catalogResult.body.code, 0)
        assert.ok(catalogResult.body.data.items.length)
        assert.equal(new URL(catalogResult.url).origin, 'http://127.0.0.1:28710')
        const httpOrigins = await page.evaluate(() => [...new Set(performance.getEntriesByType('resource')
          .map(entry => entry.name).filter(url => /^https?:/i.test(url)).map(url => new URL(url).origin))])
        assert.deepEqual(httpOrigins, ['http://127.0.0.1:28710'])
        // The packaged app records where it runs PostgreSQL, which is an
        // ASCII-only mirror whenever the package or data path is not ASCII.
        const layout = JSON.parse(await fs.readFile(path.join(data, 'local-services/runtime-layout.json'), 'utf8'))
        assert.ok(isAsciiPath(layout.runtime) && isAsciiPath(layout.database), 'PostgreSQL runtime and data directory must be ASCII-only')
        assert.ok(isAsciiPath(layout.executable) && isAsciiPath(layout.seed), 'PostgreSQL executable and seed file must be ASCII-only')
        if (layout.asciiRoot) assert.ok(isAsciiPath(layout.asciiRoot))
        report.postgresLayouts.push({ pass, ...layout })
        report.checks.push(`ascii-postgres-paths-pass-${pass}`)
        if (layout.relocatedRuntime) report.checks.push(`ascii-postgres-runtime-mirror-pass-${pass}`)
        if (layout.relocatedData) report.checks.push(`ascii-postgres-data-mirror-pass-${pass}`)
        const pgPid = Number((await fs.readFile(path.join(layout.database, 'postmaster.pid'), 'utf8')).split(/\r?\n/)[0])
        assert.ok(Number.isSafeInteger(pgPid) && pgPid > 0)
        const processEvidence = await collectProcessEvidence({ exe, data, launcherPid: child.pid, pgPid, layout })
        report.processEvidence.push({ pass, ...processEvidence })
        report.httpEvidence.push({ pass, pageOrigin: new URL(page.url()).origin, apiUrl: catalogResult.url, resourceOrigins: httpOrigins, listener: processEvidence.listeners[0] })
        report.checks.push(`isolated-environment-pass-${pass}`, `packaged-process-and-module-origins-pass-${pass}`, `local-http-owned-pass-${pass}`)
        const logs = await fs.readdir(path.join(data, 'local-services/logs'))
        assert.ok(!logs.includes('initdb.log'))
        // Capture the packaged window directly; CDP screenshots can stall on the desktop compositor.
        const capture = await app.evaluate(async ({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0]
          const image = await Promise.race([
            window.capturePage(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Native window capture timed out')), 15000)),
          ])
          if (image.isEmpty()) throw new Error('Packaged window capture is empty')
          const bitmap = image.toBitmap(), colors = new Set()
          for (let offset = 0; offset < bitmap.length; offset += Math.max(4, Math.floor(bitmap.length / 256 / 4) * 4)) {
            colors.add(`${bitmap[offset]},${bitmap[offset + 1]},${bitmap[offset + 2]}`)
          }
          if (colors.size < 3) throw new Error('Packaged window capture is blank')
          return { png: image.toPNG().toString('base64'), size: image.getSize(), colors: colors.size }
        })
        await fs.writeFile(path.join(base, `startup-${pass}.png`), Buffer.from(capture.png, 'base64'))
        report.checks.push(`native-window-capture-${capture.size.width}x${capture.size.height}`)
        report.checks.push(pass ? 'packaged-restart' : 'packaged-first-start-chinese-data-no-initdb')
      } finally {
        const exited = new Promise(resolve => child.once('exit', resolve))
        await app.evaluate(({ app }) => app.quit()).catch(() => {})
        const timer = setTimeout(() => { child.kill() }, 60000)
        await exited
        clearTimeout(timer)
        assert.equal(child.exitCode, 0)
      }
    }
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.error = error.stack || error.message; process.exitCode = 1 }
  finally {
    await fs.writeFile(path.join(base, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ ...report, report: path.join(base, 'report.json') }))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
