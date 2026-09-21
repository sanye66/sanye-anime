const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const desktopRequire = createRequire(path.join(__dirname, '../sanye_desktop/package.json'))
const builderRequire = createRequire(desktopRequire.resolve('electron-builder'))
const libraryRequire = createRequire(builderRequire.resolve('app-builder-lib'))
const resedit = libraryRequire('resedit')

const ico = fs.readFileSync(path.join(__dirname, '../sanye_desktop/assets/icon.ico'))
const expected = []
for (let i = 0; i < ico.readUInt16LE(4); i++) {
  const offset = 6 + i * 16
  expected.push(ico.subarray(ico.readUInt32LE(offset + 12), ico.readUInt32LE(offset + 12) + ico.readUInt32LE(offset + 8)))
}
const exe = resedit.NtExecutable.from(fs.readFileSync(process.argv[2]), { ignoreCert: true })
const entries = resedit.NtExecutableResource.from(exe).entries
const groups = resedit.Resource.IconGroupEntry.fromEntries(entries)
if (!expected.length || !groups.length) throw new Error('Missing icon resources')
for (const group of groups) {
  if (group.icons.length !== expected.length) throw new Error('Icon size count mismatch')
  const actual = group.icons.map(icon => Buffer.from(entries.find(entry => entry.type === 3 && entry.id === icon.iconID && entry.lang === group.lang).bin))
  if (expected.some(bytes => !actual.some(item => bytes.equals(item)))) throw new Error('EXE icon differs from assets/icon.ico')
}
console.log(`EXE icon verified: ${expected.length} sizes match assets/icon.ico`)
