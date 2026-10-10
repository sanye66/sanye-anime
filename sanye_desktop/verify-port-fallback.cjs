// Verifies that the delivered package still starts every owned local service
// when another program already owns the preferred renderer port. The probe runs
// the runtime.cjs that is inside resources/app.asar, so it exercises the shipped
// code rather than the working tree.
//
// Usage: node sanye_desktop/verify-port-fallback.cjs "<package>/三叶动漫.exe"
const { spawn } = require('node:child_process')
const net = require('node:net')
const fs = require('node:fs/promises')
const path = require('node:path')

const PREFERRED_PORT = 28710
const probe = [
  "const { LocalRuntime } = require(process.env.SANYE_PROBE_APPLICATION)",
  "const runtime = new LocalRuntime(process.env.SANYE_PROBE_ROOT, process.env.SANYE_PROBE_DATA)",
  'runtime.start().then(async origin => {',
  "  console.log('PACKAGED_STARTED ' + origin + ' fallback=' + runtime.portFallback + ' preferred=' + runtime.preferredPort)",
  '  await runtime.stop()',
  "}, error => { console.log('PACKAGED_ERROR: ' + error.message); process.exitCode = 3 })",
].join('\n')

function runProbe(exe, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-e', probe], { env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', bytes => { stdout += bytes.toString() })
    child.stderr.on('data', bytes => { stderr += bytes.toString() })
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

async function main() {
  const exe = path.resolve(process.argv[2] || '')
  const packageRoot = path.dirname(exe)
  const application = path.join(packageRoot, 'resources', 'app.asar', 'runtime.cjs')
  const root = process.argv[3] ? path.resolve(process.argv[3]) : path.join(packageRoot, 'resources', 'runtime')
  await fs.access(exe).catch(() => { throw new Error(`打包 EXE 不存在：${exe}`) })
  // The asar archive is only readable through Electron, so probe its container.
  await fs.access(path.join(packageRoot, 'resources', 'app.asar')).catch(() => { throw new Error(`包内 app.asar 不存在：${application}`) })
  const base = path.resolve(process.env.SANYE_PORT_PROBE_BASE || path.join(__dirname, '../sanye_deploy/.local'))
  await fs.mkdir(base, { recursive: true })
  const work = await fs.mkdtemp(path.join(base, 'port-fallback-'))
  const data = path.join(work, 'data')
  // Hold the preferred port so the packaged code must fall back; a second
  // listener proves the scan continues past a single busy port when available.
  const held = []
  for (const port of [PREFERRED_PORT, PREFERRED_PORT + 1]) {
    const server = net.createServer()
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
      held.push({ port, server })
    } catch (error) {
      server.close()
      if (error.code !== 'EADDRINUSE') throw error
    }
  }
  const report = { exe, application, root, data, heldPorts: held.map(item => item.port), status: 'running' }
  try {
    const result = await runProbe(exe, {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      SANYE_PROBE_APPLICATION: application,
      SANYE_PROBE_ROOT: root,
      SANYE_PROBE_DATA: data,
    })
    report.stdout = result.stdout.trim()
    report.stderr = result.stderr.trim()
    report.exitCode = result.code
    const match = report.stdout.match(/PACKAGED_STARTED http:\/\/127\.0\.0\.1:(\d+) fallback=(\w+) preferred=(\d+)/)
    if (!match) throw new Error(`包内运行时未启动成功：${report.stdout || report.stderr || `exit ${result.code}`}`)
    const [, port, fallback, preferred] = match
    if (Number(preferred) !== PREFERRED_PORT) throw new Error(`首选端口记录错误：${preferred}`)
    if (Number(port) === PREFERRED_PORT || fallback !== 'true') throw new Error(`未在被占用端口上顺延：${report.stdout}`)
    if (Number(port) <= (report.heldPorts.at(-1) ?? PREFERRED_PORT)) throw new Error(`顺延端口未跳过已占用端口：${report.stdout}`)
    report.port = Number(port)
    report.renderer = JSON.parse(await fs.readFile(path.join(data, 'runtime-layout.json'), 'utf8')).renderer
    if (report.renderer.port !== report.port || report.renderer.portFallback !== true) throw new Error('runtime-layout.json 未记录顺延后的源站')
    report.status = 'passed'
    console.log(`端口顺延验证通过：首选 ${PREFERRED_PORT} 被占用，本地服务在 ${port} 就绪（检查 ${report.heldPorts.length} 个被占用端口）`)
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    console.error(error.message)
    process.exitCode = 1
  } finally {
    for (const item of held) await new Promise(resolve => item.server.close(resolve))
    await fs.writeFile(path.join(work, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`报告：${path.join(work, 'report.json')}`)
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
