// Machine-independent audit: every DLL that the packaged executables import must
// either ship inside the package or be a Windows component. This is what proves
// the package does not silently borrow libraries from the build machine (for
// example an installed Visual C++ redistributable or a developer tool), which is
// exactly how "works here, fails on a clean PC" defects hide.
//
// Usage:
//   node sanye_desktop/verify-runtime-closure.cjs <package-or-runtime-root> [--list]
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { inspectPe } = require('./nativeDependencies.cjs')

// Windows ships these on every supported build. Anything else must be bundled.
const WINDOWS_PATTERNS = [
  /^api-ms-win-[a-z0-9-]+\.dll$/i,
  /^ext-ms-win-[a-z0-9-]+\.dll$/i,
]
const WINDOWS_COMPONENTS = new Set([
  'advapi32.dll', 'bcrypt.dll', 'bcryptprimitives.dll', 'cabinet.dll', 'cfgmgr32.dll', 'clbcatq.dll',
  'combase.dll', 'comctl32.dll', 'comdlg32.dll', 'crypt32.dll', 'cryptbase.dll', 'cryptsp.dll',
  'd2d1.dll', 'd3d11.dll', 'd3dcompiler_47.dll', 'dcomp.dll', 'dbgcore.dll', 'dbghelp.dll',
  'dnsapi.dll', 'dsound.dll', 'dwmapi.dll', 'dxgi.dll', 'gdi32.dll', 'gdi32full.dll', 'hid.dll',
  'imm32.dll', 'iphlpapi.dll', 'kernel.appcore.dll', 'kernel32.dll', 'kernelbase.dll', 'mf.dll',
  'mfcore.dll', 'mfplat.dll', 'mfuuid.dll', 'mmdevapi.dll', 'msacm32.dll', 'msasn1.dll', 'mscms.dll',
  'msctf.dll', 'msimg32.dll', 'msvcrt.dll', 'mswsock.dll', 'ncrypt.dll', 'netapi32.dll', 'normaliz.dll',
  'ntasn1.dll', 'ntdll.dll', 'ole32.dll', 'oleacc.dll', 'oleaut32.dll', 'opengl32.dll', 'powrprof.dll',
  'profapi.dll', 'psapi.dll', 'rpcrt4.dll', 'rsaenh.dll', 'sechost.dll', 'secur32.dll', 'setupapi.dll',
  'shcore.dll', 'shell32.dll', 'shlwapi.dll', 'sspicli.dll', 'user32.dll', 'userenv.dll', 'usp10.dll',
  'uxtheme.dll', 'version.dll', 'win32u.dll', 'winhttp.dll', 'wininet.dll', 'winmm.dll', 'winspool.drv',
  'wintrust.dll', 'ws2_32.dll', 'wsock32.dll', 'wtsapi32.dll', 'dwrite.dll',
  // Universal CRT components present on Windows 10 and later.
  'ucrtbase.dll', 'ucrtbased.dll', 'msvcp_win.dll', 'wldap32.dll', 'bcryptprimitives.dll',
])

const isWindowsComponent = name => WINDOWS_PATTERNS.some(pattern => pattern.test(name)) || WINDOWS_COMPONENTS.has(name.toLowerCase())

// Loaded from the graphics driver. The package must not ship it on its own (an
// ICD without a driver is useless), so it is reported separately instead of
// being counted as a bundled or missing library.
const GPU_DRIVER_LIBRARIES = new Set(['vulkan-1.dll'])

function resolvePackageRoot(input) {
  const resolved = path.resolve(input)
  const runtime = path.join(resolved, 'resources', 'runtime')
  if (fs.existsSync(runtime)) return { packageRoot: resolved, runtimeRoot: runtime }
  return { packageRoot: null, runtimeRoot: resolved }
}

// electron-builder embeds a SHA-256 of the asar header index (the file table
// Electron validates at startup) into the executable. Comparing it proves the
// shipped EXE is the one built from the app we verified, which matters when the
// EXE cannot be launched on the build machine.
function asarHeaderDigest(file) {
  const bytes = fs.readFileSync(file)
  const headerSize = bytes.readUInt32LE(12)
  if (!(headerSize > 0) || headerSize + 16 > bytes.length) throw new Error(`app.asar 头部无效：${file}`)
  const header = bytes.subarray(16, 16 + headerSize).toString('utf8').replace(/\0+$/, '')
  return crypto.createHash('sha256').update(Buffer.from(header, 'utf8')).digest('hex')
}

function verifyAsarIntegrity(packageRoot) {
  const exe = path.join(packageRoot, '三叶动漫.exe')
  const asar = path.join(packageRoot, 'resources', 'app.asar')
  if (!fs.existsSync(exe) || !fs.existsSync(asar)) return null
  const actual = asarHeaderDigest(asar)
  const embedded = fs.readFileSync(exe).toString('latin1').match(/"value":"([0-9a-f]{64})"/i)?.[1]?.toLowerCase() ?? null
  // The portable build restores the official Electron executable, which carries
  // no asar integrity resource; other build flavours do embed one and must match.
  if (!embedded) return { embedded: null, actual, matches: true, note: '可执行文件未内嵌 asar 摘要（保持官方 Electron 二进制）' }
  return { embedded, actual, matches: embedded === actual }
}

// The Windows loader searches the directory of the executable first, so a DLL is
// only "shipped" when it sits next to (or in a known subdirectory of) the entry.
function loaders(entry) {
  return [path.dirname(entry), path.join(path.dirname(entry), 'server'), path.join(path.dirname(entry), 'lib')]
}

function findInPackage(name, entry) {
  for (const directory of loaders(entry)) {
    const candidate = path.join(directory, name)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function closure(entry, report) {
  const pending = [entry]
  const seen = new Set()
  while (pending.length) {
    const file = pending.pop()
    const key = file.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const { machine, imports } = inspectPe(fs.readFileSync(file), file)
    if (machine !== 0x8664) throw new Error(`native file is not x64: ${file}`)
    for (const name of imports) {
      const resolved = findInPackage(name, entry)
      if (resolved) { report.bundled.add(path.relative(report.base, resolved)); pending.push(resolved); continue }
      if (GPU_DRIVER_LIBRARIES.has(name.toLowerCase())) { report.gpuDriver.add(`${name} (由显卡驱动提供)`); continue }
      if (isWindowsComponent(name)) { report.windows.add(name); continue }
      if (fs.existsSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', name))) {
        report.unknown.add(`${name} (only found in this machine's System32)`)
        continue
      }
      report.missing.add(`${name} (imported by ${path.relative(report.base, file)})`)
    }
  }
}

function main() {
  const input = process.argv[2]
  if (!input) throw new Error('Usage: node sanye_desktop/verify-runtime-closure.cjs <package-or-runtime-root> [--list]')
  const list = process.argv.includes('--list')
  const { packageRoot, runtimeRoot } = resolvePackageRoot(input)
  const base = packageRoot || runtimeRoot
  const entries = [
    path.join(runtimeRoot, 'java', 'bin', 'java.exe'),
    ...['postgres', 'pg_ctl', 'pg_isready', 'psql'].map(name => path.join(runtimeRoot, 'postgres', 'bin', `${name}.exe`)),
  ]
  if (packageRoot) entries.unshift(path.join(packageRoot, '三叶动漫.exe'))
  const report = { base, bundled: new Set(), windows: new Set(), unknown: new Set(), missing: new Set() }
  report.gpuDriver = new Set()
  for (const entry of entries) {
    if (!fs.existsSync(entry)) { report.missing.add(`missing executable ${path.relative(base, entry)}`); continue }
    closure(entry, report)
  }
  const asarIntegrity = packageRoot ? verifyAsarIntegrity(packageRoot) : null
  if (asarIntegrity && !asarIntegrity.matches) {
    report.missing.add(`三叶动漫.exe 内嵌的 app.asar 头部摘要与 resources/app.asar 不一致（exe=${asarIntegrity.embedded ?? '未找到'}，asar=${asarIntegrity.actual}）`)
  }
  const result = {
    root: base,
    asarIntegrity,
    bundledFiles: [...report.bundled].sort(),
    gpuDriverLibraries: [...report.gpuDriver].sort(),
    windowsComponents: [...report.windows].sort(),
    notBundledButPresentOnThisMachine: [...report.unknown].sort(),
    missing: [...report.missing].sort(),
  }
  if (list) console.log(JSON.stringify(result, null, 2))
  if (result.missing.length || result.notBundledButPresentOnThisMachine.length) {
    if (!list) console.error(JSON.stringify(result, null, 2))
    throw new Error(`依赖闭包不完整：${result.missing.length} 项完全缺失，${result.notBundledButPresentOnThisMachine.length} 项只在本机 System32 中存在`)
  }
  const integrityNote = !asarIntegrity ? ''
    : asarIntegrity.embedded ? '；EXE 内嵌 app.asar 摘要与包内 app.asar 一致' : '；可执行文件保持官方 Electron 二进制（未内嵌 asar 摘要）'
  console.log(`依赖闭包校验通过：包内自带 ${result.bundledFiles.length} 个文件，系统组件 ${result.windowsComponents.length} 项，显卡驱动库 ${result.gpuDriverLibraries.length} 项，未借用本机任何第三方运行库${integrityNote}`)
}

try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
