const test = require('node:test')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

test('signed build fails before packaging when no signing identity is configured', () => {
  const env = { ...process.env }
  for (const name of ['CSC_LINK', 'WIN_CSC_LINK', 'SANYE_DESKTOP_CERT_SHA1']) delete env[name]
  const result = spawnSync(process.execPath, [path.join(__dirname, 'build.cjs')], { env, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Trusted code signing is required/)
})

test('NSIS signs its temporary generator before attempting to run it', async () => {
  require('electron-builder')
  const builderRequire = createRequire(require.resolve('electron-builder'))
  const { NsisTarget } = builderRequire('app-builder-lib/out/targets/nsis/NsisTarget.js')
  const calls = []
  const failedSigning = new Error('test signing rejected')
  const context = {
    name: 'nsis', outDir: __dirname,
    options: {},
    packager: {
      appInfo: { sanitizedName: 'sanye_anime' },
      getResource: async () => null,
      signIf: async file => { calls.push(['sign', file]); throw failedSigning },
    },
    computeFinalScript: async () => '',
    executeMakensis: async () => { calls.push(['compile']) },
  }
  await assert.rejects(NsisTarget.prototype.computeScriptAndSignUninstaller.call(context, {}, {}, 'temporary-installer.exe', '', new Map()), error => error === failedSigning)
  assert.deepEqual(calls, [['compile'], ['sign', 'temporary-installer.exe']])
})
