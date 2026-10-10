const { build, Platform } = require('electron-builder')
const path = require('node:path')
const { checkPostgresVisualCppRuntime } = require('./nativeDependencies.cjs')

async function main() {
  const thumbprint = process.env.SANYE_DESKTOP_CERT_SHA1
  const selfSigned = true
  if (!thumbprint) throw new Error('All desktop installers require SANYE_DESKTOP_CERT_SHA1 from create-test-certificate.ps1')
  if (thumbprint && !/^[a-f0-9]{40}$/i.test(thumbprint)) throw new Error('SANYE_DESKTOP_CERT_SHA1 must be a 40-character certificate thumbprint')
  await checkPostgresVisualCppRuntime(path.join(__dirname, 'runtime', 'postgres'))
  await build({
    projectDir: __dirname,
    targets: Platform.WINDOWS.createTarget(['nsis']),
    config: {
      directories: { output: path.join('dist', selfSigned ? 'self-signed' : 'signed') },
      forceCodeSigning: true,
      win: { signAndEditExecutable: true, signtoolOptions: { certificateSha1: thumbprint, sign: path.join(__dirname, 'sign-test.cjs') } },
    },
  })
}

main().catch(error => { console.error(error.message); process.exit(1) })
