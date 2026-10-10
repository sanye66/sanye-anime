const test = require('node:test')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

test('local portable builds keep the official Electron executable bytes', () => {
  const { portableConfig } = require('./build-portable.cjs')
  // Rewriting the executable makes it a brand-new unsigned file, which Smart App
  // Control blocks by hash on machines that enforce it. Leaving it untouched
  // keeps the reputation of the official Electron binary.
  assert.equal(portableConfig.win.signAndEditExecutable, false)
  assert.equal(portableConfig.forceCodeSigning, false)
  assert.equal(require('./package.json').build.win.icon, 'assets/icon.ico')
})

test('NSIS creates desktop and start-menu shortcuts', () => {
  const config = require('./package.json').build.nsis
  assert.equal(config.createDesktopShortcut, 'always')
  assert.equal(config.createStartMenuShortcut, true)
  assert.equal(config.shortcutName, '三叶动漫')
})

// DESK-EXE-1: the shipped executable must be the official Electron binary, never
// the electron-builder output. A rewritten executable is a brand-new unsigned
// file, which Smart App Control blocks by hash on machines that enforce it.
test('portable packaging restores and hash-checks the official Electron executable', () => {
  const script = require('node:fs').readFileSync(path.join(__dirname, '../sanye_tools/package-portable.ps1'), 'utf8')
  assert.match(script, /sanye_desktop\/node_modules\/electron\/dist\/electron\.exe/)
  assert.match(script, /Copy-Item -LiteralPath \$electron -Destination \$exe -Force/)
  assert.match(script, /Get-FileHash -LiteralPath \$exe[\s\S]*Get-FileHash -LiteralPath \$electron/)
  assert.match(script, /must stay byte-identical to the official Electron binary/)
})

// DESK-EXE-3: the product icon travels next to the untouched executable.
test('portable packaging ships the product icon and points the shortcut at it', () => {
  const script = require('node:fs').readFileSync(path.join(__dirname, '../sanye_tools/package-portable.ps1'), 'utf8')
  assert.match(script, /assets\/icon\.ico'\) -Destination \(Join-Path \$source 'icon\.ico'\)/)
  assert.match(script, /sanye_tools\/verify-icon\.cjs/)
  const publish = require('node:fs').readFileSync(path.join(__dirname, '../sanye_tools/publish-desktop.ps1'), 'utf8')
  assert.match(publish, /\$shortcut\.IconLocation = \(Join-Path \$target 'icon\.ico'\)/)
})

// DESK-EXE-4: nothing may be borrowed from the build machine.
test('portable packaging runs the dependency closure audit before delivery', () => {
  const script = require('node:fs').readFileSync(path.join(__dirname, '../sanye_tools/package-portable.ps1'), 'utf8')
  assert.match(script, /sanye_desktop\/verify-runtime-closure\.cjs/)
  const workflow = require('node:fs').readFileSync(path.join(__dirname, '../.github/workflows/desktop-check.yml'), 'utf8')
  assert.match(workflow, /pnpm test:desktop/)
})

test('NSIS copied security directory is cleared only when outside the generated file', () => {
  const { clearStaleCertificateDirectory } = require('./normalize-uninstaller.cjs')
  const bytes = Buffer.alloc(512)
  bytes.write('MZ'); bytes.writeUInt32LE(64, 60); bytes.writeUInt32LE(0x4550, 64)
  bytes.writeUInt16LE(224, 84); bytes.writeUInt16LE(0x10b, 88)
  bytes.writeUInt32LE(16, 88 + 92)
  const table = 88 + 128
  bytes.writeUInt32LE(1024, table); bytes.writeUInt32LE(100, table + 4)
  const before = Buffer.from(bytes)
  assert.equal(clearStaleCertificateDirectory(bytes), true)
  before.fill(0, table, table + 8)
  assert.deepEqual(bytes, before)
  bytes.writeUInt32LE(400, table); bytes.writeUInt32LE(100, table + 4)
  assert.equal(clearStaleCertificateDirectory(bytes), false)
  assert.throws(() => clearStaleCertificateDirectory(Buffer.alloc(4)), /Invalid/)
})

test('self-signed hook preserves third-party runtime binaries', async () => {
  const sign = require('./sign-test.cjs').default
  await sign({ path: path.join(__dirname, 'dist/self-signed/win-unpacked/resources/runtime/java/bin/java.exe') })
  await sign({ path: path.join(__dirname, 'dist/self-signed/win-unpacked/resources/runtime/postgres/bin/postgres.exe') })
})

test('signed build fails before packaging when no signing identity is configured', () => {
  const env = { ...process.env }
  for (const name of ['CSC_LINK', 'WIN_CSC_LINK', 'SANYE_DESKTOP_CERT_SHA1']) delete env[name]
  const result = spawnSync(process.execPath, [path.join(__dirname, 'build.cjs')], { env, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /All desktop installers require SANYE_DESKTOP_CERT_SHA1/)
})

test('NSIS signs its temporary generator before attempting to run it', async () => {
  require('electron-builder')
  const builderRequire = createRequire(require.resolve('electron-builder'))
  const { NsisTarget } = builderRequire('app-builder-lib/out/targets/nsis/NsisTarget.js')
  const calls = []
  const failedSigning = new Error('test signing rejected')
  // 26.15.x 的签名入口是 signIf，26.0.x 是 sign；两者都落到同一条断言。
  const rejectSigning = async file => { calls.push(['sign', file]); throw failedSigning }
  const context = {
    name: 'nsis', outDir: __dirname,
    options: {},
    packager: {
      appInfo: { sanitizedName: 'sanye_anime' },
      getResource: async () => null,
      sign: rejectSigning,
      signIf: rejectSigning,
    },
    computeFinalScript: async () => '',
    executeMakensis: async () => { calls.push(['compile']) },
  }
  await assert.rejects(NsisTarget.prototype.computeScriptAndSignUninstaller.call(context, {}, {}, 'temporary-installer.exe', '', new Map()), error => error === failedSigning)
  assert.deepEqual(calls, [['compile'], ['sign', 'temporary-installer.exe']])
})
