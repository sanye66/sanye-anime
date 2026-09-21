const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const { mkdtemp, mkdir, writeFile, readFile, rm } = require('node:fs/promises')
const {
  IMAGE_FILE_MACHINE_AMD64,
  inspectPe,
  checkPostgresVisualCppRuntime,
  repairPostgresVisualCppRuntime,
} = require('./nativeDependencies.cjs')

function peFixture(imports, machine = IMAGE_FILE_MACHINE_AMD64) {
  const buffer = Buffer.alloc(0x800)
  buffer.write('MZ')
  buffer.writeUInt32LE(0x80, 0x3c)
  buffer.write('PE\0\0', 0x80, 'ascii')
  buffer.writeUInt16LE(machine, 0x84)
  buffer.writeUInt16LE(1, 0x86)
  buffer.writeUInt16LE(0xf0, 0x94)
  const optional = 0x98
  buffer.writeUInt16LE(0x20b, optional)
  buffer.writeUInt32LE(16, optional + 108)
  const descriptorsRva = 0x1000
  const descriptorSize = (imports.length + 1) * 20
  buffer.writeUInt32LE(descriptorsRva, optional + 120)
  buffer.writeUInt32LE(descriptorSize, optional + 124)
  const section = optional + 0xf0
  buffer.write('.rdata\0\0', section, 'ascii')
  buffer.writeUInt32LE(0x600, section + 8)
  buffer.writeUInt32LE(0x1000, section + 12)
  buffer.writeUInt32LE(0x600, section + 16)
  buffer.writeUInt32LE(0x200, section + 20)
  let stringOffset = 0x200 + descriptorSize
  imports.forEach((name, index) => {
    buffer.writeUInt32LE(0x1000 + stringOffset - 0x200, 0x200 + index * 20 + 12)
    buffer.write(`${name}\0`, stringOffset, 'ascii')
    stringOffset += Buffer.byteLength(name) + 1
  })
  return buffer.subarray(0, Math.max(0x400, stringOffset))
}

async function fixtureTree() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sanye-native-dependencies-'))
  const javaBin = path.join(root, 'java', 'bin')
  const postgresRoot = path.join(root, 'postgres')
  await mkdir(javaBin, { recursive: true })
  await mkdir(path.join(postgresRoot, 'bin'), { recursive: true })
  await mkdir(path.join(postgresRoot, 'lib'), { recursive: true })
  return { root, javaBin, postgresRoot }
}

test('inspectPe reads the import directory instead of matching arbitrary file strings', () => {
  const fixture = peFixture(['KERNEL32.dll', 'VCRUNTIME140.dll'])
  fixture.write('MSVCP140.dll', 0x350, 'ascii')
  assert.deepEqual(inspectPe(fixture), {
    machine: IMAGE_FILE_MACHINE_AMD64,
    imports: ['KERNEL32.dll', 'VCRUNTIME140.dll'],
  })
})

test('repair copies the AMD64 Visual C++ dependency closure from bundled Java', async t => {
  const { root, javaBin, postgresRoot } = await fixtureTree()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(postgresRoot, 'bin', 'postgres.exe'), peFixture(['VCRUNTIME140.dll']))
  await writeFile(path.join(postgresRoot, 'lib', 'libicu.dll'), peFixture(['MSVCP140.dll']))
  await writeFile(path.join(javaBin, 'vcruntime140.dll'), peFixture(['KERNEL32.dll']))
  await writeFile(path.join(javaBin, 'msvcp140.dll'), peFixture(['VCRUNTIME140_1.dll']))
  await writeFile(path.join(javaBin, 'vcruntime140_1.dll'), peFixture(['KERNEL32.dll']))

  const result = await repairPostgresVisualCppRuntime(javaBin, postgresRoot)

  assert.deepEqual(result.copied, ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'])
  assert.deepEqual(result.files.map(file => file.name).sort(), result.copied)
  assert.deepEqual(
    await readFile(path.join(postgresRoot, 'bin', 'msvcp140.dll')),
    await readFile(path.join(javaBin, 'msvcp140.dll')),
  )

  await writeFile(path.join(postgresRoot, 'bin', 'vcruntime140.dll'), peFixture(['USER32.dll']))
  const refreshed = await repairPostgresVisualCppRuntime(javaBin, postgresRoot)
  assert.deepEqual(refreshed.copied, ['vcruntime140.dll'])
  assert.deepEqual(
    await readFile(path.join(postgresRoot, 'bin', 'vcruntime140.dll')),
    await readFile(path.join(javaBin, 'vcruntime140.dll')),
  )
})

test('check rejects a package whose imported Visual C++ runtime is missing', async t => {
  const { root, postgresRoot } = await fixtureTree()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(postgresRoot, 'bin', 'postgres.exe'), peFixture(['VCRUNTIME140.dll']))

  await assert.rejects(
    checkPostgresVisualCppRuntime(postgresRoot),
    /Missing Visual C\+\+ runtime vcruntime140\.dll; imported by bin[\\/]postgres\.exe/,
  )
})

test('repair rejects a non-AMD64 runtime source', async t => {
  const { root, javaBin, postgresRoot } = await fixtureTree()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(postgresRoot, 'bin', 'postgres.exe'), peFixture(['VCRUNTIME140.dll']))
  await writeFile(path.join(javaBin, 'vcruntime140.dll'), peFixture([], 0x14c))

  await assert.rejects(
    repairPostgresVisualCppRuntime(javaBin, postgresRoot),
    /Visual C\+\+ runtime is not AMD64/,
  )
})
