const path = require('node:path')

function localProcessEnvironment(source = process.env) {
  const allowed = new Set(['systemroot', 'windir', 'temp', 'tmp', 'userprofile', 'appdata', 'localappdata', 'comspec', 'programdata'])
  const environment = Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toLowerCase())))
  const systemRoot = Object.entries(source).find(([key]) => key.toLowerCase() === 'systemroot')?.[1]
  if (process.platform === 'win32' && !systemRoot) throw new Error('Windows system directory is unavailable')
  // Child executables and their third-party DLLs must come from the package.
  environment.PATH = systemRoot ? [path.win32.join(systemRoot, 'System32'), systemRoot].join(';') : ''
  return environment
}

module.exports = { localProcessEnvironment }
