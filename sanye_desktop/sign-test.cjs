const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const path = require('node:path')
const { normalizeUninstaller } = require('./normalize-uninstaller.cjs')

exports.default = async configuration => {
  const file = path.resolve(configuration.path)
  const runtime = path.join(__dirname, 'dist', 'self-signed', 'win-unpacked', 'resources', 'runtime') + path.sep
  if (file.toLowerCase().startsWith(runtime.toLowerCase())) return
  await normalizeUninstaller(file)
  const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  await promisify(execFile)(shell, ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'sign-test-file.ps1'), '-FilePath', file, '-Thumbprint', process.env.SANYE_DESKTOP_CERT_SHA1], { windowsHide: true, timeout: 60000 })
}
