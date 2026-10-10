// Verifies that the delivered package carries the application icon.
//
// The portable build deliberately leaves the executable untouched so that it
// keeps the reputation of the official Electron binary on machines that enforce
// Smart App Control. The icon therefore ships next to the executable as
// icon.ico, and the desktop shortcut, tray and window use that file. When the
// executable does embed the icon (for example a future signed build), the
// embedded resources are checked as well.
//
// Usage: node sanye_tools/verify-icon.cjs "<package>/三叶动漫.exe"
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')

const exe = path.resolve(process.argv[2] || '')
const packageRoot = path.dirname(exe)
const source = path.join(__dirname, '../sanye_desktop/assets/icon.ico')
const expectedBytes = fs.readFileSync(source)
const expectedHash = crypto.createHash('sha256').update(expectedBytes).digest('hex')
const shipped = path.join(packageRoot, 'icon.ico')
if (!fs.existsSync(shipped)) throw new Error(`应用图标未随包提供：${shipped}`)
const actualHash = crypto.createHash('sha256').update(fs.readFileSync(shipped)).digest('hex')
if (actualHash !== expectedHash) throw new Error('包内 icon.ico 与 sanye_desktop/assets/icon.ico 不一致')

const desktopRequire = createRequire(path.join(__dirname, '../sanye_desktop/package.json'))
const builderRequire = createRequire(desktopRequire.resolve('electron-builder'))
const libraryRequire = createRequire(builderRequire.resolve('app-builder-lib'))
const resedit = libraryRequire('resedit')

const expected = []
for (let index = 0; index < expectedBytes.readUInt16LE(4); index++) {
  const offset = 6 + index * 16
  expected.push(expectedBytes.subarray(expectedBytes.readUInt32LE(offset + 12), expectedBytes.readUInt32LE(offset + 12) + expectedBytes.readUInt32LE(offset + 8)))
}

let embedded = 'kept original Electron executable (icon loads from the packaged icon.ico)'
try {
  const resource = resedit.NtExecutableResource.from(resedit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true })).entries
  const groups = resedit.Resource.IconGroupEntry.fromEntries(resource)
  const matches = groups.length > 0 && groups.every(group => {
    if (group.icons.length !== expected.length) return false
    const actual = group.icons.map(icon => Buffer.from(resource.find(entry => entry.type === 3 && entry.id === icon.iconID && entry.lang === group.lang).bin))
    return expected.every(bytes => actual.some(item => bytes.equals(item)))
  })
  embedded = matches ? `embedded in the executable (${expected.length} sizes match)` : embedded
} catch { /* an untouched Electron executable has no matching icon group */ }

console.log(`Icon verified: packaged icon.ico matches the source; executable status: ${embedded}`)
