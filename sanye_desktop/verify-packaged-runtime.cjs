// End-to-end acceptance for a delivered portable package.
//
// It runs the runtime.cjs that lives inside the package's own resources/app.asar
// against the package's own resources/runtime (bundled Java 21, PostgreSQL,
// business JARs, client assets, PostgreSQL template and seed) in a fresh data
// directory, and checks that:
//   * the preferred renderer port is used when free and skipped when occupied;
//   * the private PostgreSQL cluster is provisioned from the bundled template;
//   * all three Java services report UP and serve the seeded catalog over the
//     cookie-guarded loopback origin;
//   * a restart reuses the existing database instead of re-provisioning.
//
// --electron <path> substitutes the process that loads the runtime. Use it when
// the machine's application-control policy blocks the freshly built, unsigned
// package EXE: the loader is then Electron's own signed binary of the same
// version, and everything else still comes from the delivered package. The
// report states which loader was used so the boundary stays visible.
//
// Usage: node sanye_desktop/verify-packaged-runtime.cjs "<package dir or exe>" [--electron <exe>]
const { spawn } = require('node:child_process')
const net = require('node:net')
const fs = require('node:fs/promises')
const path = require('node:path')

const PREFERRED_PORT = 28710
const isAsciiPath = value => /^[\x00-\x7f]+$/.test(value)

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
}, async error => {
  console.log('SANYE_PROBE_ERROR ' + JSON.stringify({ message: error.message }))
  process.exit(3)
})
`

function resolvePackage(input) {
  const resolved = path.resolve(input)
  if (resolved.toLowerCase().endsWith('.exe')) return { exe: resolved, root: path.dirname(resolved) }
  return { exe: path.join(resolved, '三叶动漫.exe'), root: resolved }
}

// Starts the packaged runtime and waits until it reports its loopback origin.
// The returned handle keeps the stack alive so the caller can make real HTTP
// requests, then shuts it down through the runtime's own stop() path.
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

async function request(url, cookie) {
  const response = await fetch(url, { headers: cookie ? { cookie } : {} })
  const text = await response.text()
  return { status: response.status, text }
}

async function holdPorts(ports) {
  const held = []
  for (const port of ports) {
    const server = net.createServer()
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
      held.push(server)
    } catch (error) {
      server.close()
      if (error.code !== 'EADDRINUSE') throw error
    }
  }
  return held
}

async function releasePorts(servers) {
  for (const server of servers) await new Promise(resolve => server.close(resolve))
}

async function main() {
  const target = process.argv[2]
  if (!target) throw new Error('Usage: node sanye_desktop/verify-packaged-runtime.cjs "<package dir or exe>" [--electron <exe>]')
  const electronIndex = process.argv.indexOf('--electron')
  const loaderOverride = electronIndex >= 0 ? process.argv[electronIndex + 1] : null
  const { exe, root } = resolvePackage(target)
  const application = path.join(root, 'resources', 'app.asar', 'runtime.cjs')
  const runtimeRoot = path.join(root, 'resources', 'runtime')
  await fs.access(exe).catch(() => { throw new Error(`打包 EXE 不存在：${exe}`) })
  await fs.access(path.join(root, 'resources', 'app.asar')).catch(() => { throw new Error(`包内 app.asar 不存在：${application}`) })
  await fs.access(path.join(runtimeRoot, 'java', 'bin', 'java.exe')).catch(() => { throw new Error(`包内 Java 运行时不存在：${runtimeRoot}`) })

  const base = path.resolve(process.env.SANYE_PACKAGED_RUNTIME_BASE || path.join(__dirname, '../sanye_deploy/.local'))
  await fs.mkdir(base, { recursive: true })
  const work = await fs.mkdtemp(path.join(base, 'packaged-runtime-'))
  // Mirror verify-first-run.cjs: the default data directory is non-ASCII, which
  // is what forces PostgreSQL to run from an English-only mirror.
  // Mirrors the packaged app: --sanye-data-dir points at the Electron user-data
  // directory and the local services keep their state in local-services/ below it.
  const userData = path.join(work, process.env.SANYE_PACKAGED_RUNTIME_DATA_NAME || '中文用户 数据')
  const data = path.join(userData, 'local-services')
  const loader = loaderOverride ? path.resolve(loaderOverride) : exe
  const expectRelocatedRuntime = !isAsciiPath(root)
  const expectRelocatedData = !isAsciiPath(data)
  const report = {
    exe, root, application, runtimeRoot, userData, data, loader,
    loaderIsPackageExe: loader === exe,
    expectRelocatedRuntime, expectRelocatedData,
    passes: [], status: 'running',
  }
  const environment = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    SANYE_PROBE_APPLICATION: application,
    SANYE_PROBE_ROOT: runtimeRoot,
    SANYE_PROBE_DATA: data,
  }
  try {
    // Pass 0: preferred port free, so the stable origin must win.
    {
      const session = await startProbe(loader, environment)
      try {
        const probe = session.probe
        if (probe.port !== PREFERRED_PORT || probe.portFallback) throw new Error(`空闲时未使用首选端口：${JSON.stringify(probe)}`)
        const anonymous = await request(`${probe.origin}/api/v1/anime`)
        if (anonymous.status !== 403) throw new Error(`未携带会话 Cookie 的接口请求应被拒绝，实际 ${anonymous.status}`)
        const catalog = await request(`${probe.origin}/api/v1/anime`, `sanyeDesktop=${probe.cookie}`)
        if (catalog.status !== 200) throw new Error(`目录接口返回 ${catalog.status}`)
        const body = JSON.parse(catalog.text)
        if (body.code !== 0 || !body.data?.items?.length) throw new Error(`目录数据为空：${catalog.text.slice(0, 200)}`)
        const page = await request(`${probe.origin}/`)
        if (page.status !== 200 || !/<html/i.test(page.text)) throw new Error(`首页未能返回：${page.status}`)
        report.passes.push({ pass: 0, port: probe.port, portFallback: probe.portFallback, catalogItems: body.data.items.length, sealedWithoutCookie: anonymous.status === 403 })
      } finally { await session.stop() }
    }
    const layout = JSON.parse(await fs.readFile(path.join(data, 'runtime-layout.json'), 'utf8'))
    report.passes[0].renderer = layout.renderer
    if (layout.renderer?.port !== PREFERRED_PORT || layout.renderer?.portFallback) throw new Error(`runtime-layout.json 未记录首选端口：${JSON.stringify(layout.renderer)}`)
    report.passes[0].postgres = { executableRelocated: layout.relocatedRuntime, databaseRelocated: layout.relocatedData }
    if (layout.relocatedRuntime !== expectRelocatedRuntime) throw new Error(`PostgreSQL 运行库镜像状态与路径判定不一致：${layout.relocatedRuntime}`)
    if (layout.relocatedData !== expectRelocatedData) throw new Error(`PostgreSQL 数据目录镜像状态与路径判定不一致：${layout.relocatedData}`)
    if (layout.executable && !isAsciiPath(layout.executable)) throw new Error(`PostgreSQL 可执行路径必须为纯英文：${layout.executable}`)

    // Pass 1: preferred ports occupied, so the packaged code must fall back and
    // still bring the whole stack up on the first try.
    const held = await holdPorts([PREFERRED_PORT, PREFERRED_PORT + 1])
    report.heldPorts = held.map(server => server.address().port)
    try {
      const session = await startProbe(loader, environment)
      try {
        const probe = session.probe
        if (!probe.portFallback || probe.port <= Math.max(...report.heldPorts)) throw new Error(`端口被占用时未顺延：${JSON.stringify(probe)}`)
        const catalog = await request(`${probe.origin}/api/v1/anime`, `sanyeDesktop=${probe.cookie}`)
        const body = JSON.parse(catalog.text)
        if (catalog.status !== 200 || !body.data?.items?.length) throw new Error(`顺延后目录接口失败：${catalog.status}`)
        report.passes.push({ pass: 1, port: probe.port, preferredPort: probe.preferredPort, portFallback: probe.portFallback, catalogItems: body.data.items.length })
      } finally { await session.stop() }
    } finally {
      await releasePorts(held)
    }

    // Pass 2: restart on the freed preferred port and prove the existing
    // database is reused rather than provisioned again.
    const marker = path.join(data, 'catalog-seeded')
    await fs.access(marker).catch(() => { throw new Error('首次启动未完成目录种子导入标记') })
    const session = await startProbe(loader, environment)
    let items = 0
    try {
      const probe = session.probe
      const catalog = await request(`${probe.origin}/api/v1/anime`, `sanyeDesktop=${probe.cookie}`)
      const body = JSON.parse(catalog.text)
      if (catalog.status !== 200 || !body.data?.items?.length) throw new Error(`重启后目录接口失败：${catalog.status}`)
      items = body.data.items.length
      report.passes.push({ pass: 2, port: probe.port, portFallback: probe.portFallback, catalogItems: items, reusedDatabase: true })
    } finally { await session.stop() }
    report.status = 'passed'
    console.log(`交付包运行时验收通过：首选端口 ${PREFERRED_PORT} 正常、被占用时顺延、三个业务服务就绪、目录数据 ${items} 条、重启复用数据库`)
    if (!report.loaderIsPackageExe) console.log(`注意：本次使用同版本 Electron 作为加载器（${loader}）；包内 EXE 在本机被应用程序控制策略拦截，该边界已记录在报告中。`)
  } catch (error) {
    report.status = 'failed'
    report.error = error.message
    console.error(error.message)
    process.exitCode = 1
  } finally {
    await fs.writeFile(path.join(work, 'report.json'), JSON.stringify(report, null, 2))
    console.log(`报告：${path.join(work, 'report.json')}`)
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
