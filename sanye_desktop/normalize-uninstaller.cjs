const fs = require('node:fs/promises')
const path = require('node:path')

function clearStaleCertificateDirectory(bytes) {
  if (bytes.length < 64 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('Invalid NSIS DOS header')
  const pe = bytes.readUInt32LE(60)
  if (pe + 24 > bytes.length || bytes.readUInt32LE(pe) !== 0x4550) throw new Error('Invalid NSIS PE header')
  const optional = pe + 24
  const optionalSize = bytes.readUInt16LE(pe + 20)
  if (optional + optionalSize > bytes.length || optionalSize < 2) throw new Error('Truncated NSIS optional header')
  const magic = bytes.readUInt16LE(optional)
  const directory = magic === 0x10b ? 96 : magic === 0x20b ? 112 : 0
  if (!directory || optionalSize < directory + 40 || bytes.readUInt32LE(optional + directory - 4) < 5) throw new Error('Missing NSIS security directory')
  const security = optional + directory + 32
  const offset = bytes.readUInt32LE(security)
  const length = bytes.readUInt32LE(security + 4)
  // NSIS copies the signed generator header without its certificate overlay.
  if (offset && length && offset >= bytes.length && offset + length > bytes.length) {
    bytes.fill(0, security, security + 8)
    return true
  }
  return false
}

async function normalizeUninstaller(file) {
  if (!path.basename(file).startsWith('__uninstaller-nsis-')) return
  const bytes = await fs.readFile(file)
  if (clearStaleCertificateDirectory(bytes)) await fs.writeFile(file, bytes)
}
module.exports = { clearStaleCertificateDirectory, normalizeUninstaller }
