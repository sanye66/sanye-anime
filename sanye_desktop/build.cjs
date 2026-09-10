const { build, Platform } = require('electron-builder')
const path = require('node:path')

async function main() {
  const thumbprint = process.env.SANYE_DESKTOP_CERT_SHA1
  if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK && !thumbprint) {
    throw new Error('Trusted code signing is required. Configure CSC_LINK / WIN_CSC_LINK and its password through the build environment, or SANYE_DESKTOP_CERT_SHA1 for a Windows certificate store identity. No installer was built.')
  }
  if (thumbprint && !/^[a-f0-9]{40}$/i.test(thumbprint)) throw new Error('SANYE_DESKTOP_CERT_SHA1 must be a 40-character certificate thumbprint')
  await build({
    projectDir: __dirname,
    targets: Platform.WINDOWS.createTarget(['nsis']),
    config: {
      directories: { output: path.join('dist', 'signed') },
      forceCodeSigning: true,
      win: { signAndEditExecutable: true, ...(thumbprint ? { signtoolOptions: { certificateSha1: thumbprint } } : {}) },
    },
  })
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
