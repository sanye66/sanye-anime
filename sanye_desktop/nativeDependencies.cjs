const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

const IMAGE_FILE_MACHINE_AMD64 = 0x8664
const VISUAL_CPP_RUNTIME = /^(?:msvcp140(?:_[12])?|vcruntime140(?:_1)?)\.dll$/i

function readCString(buffer, offset, file) {
  if (offset < 0 || offset >= buffer.length) throw new Error(`Invalid PE string offset in ${file}`)
  const end = buffer.indexOf(0, offset)
  if (end < 0) throw new Error(`Unterminated PE string in ${file}`)
  return buffer.toString('ascii', offset, end)
}

function inspectPe(buffer, file = '<buffer>') {
  if (buffer.length < 0x40 || buffer.toString('ascii', 0, 2) !== 'MZ') throw new Error(`Not a PE file: ${file}`)
  const peOffset = buffer.readUInt32LE(0x3c)
  if (peOffset + 24 > buffer.length || buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error(`Invalid PE header: ${file}`)
  }

  const machine = buffer.readUInt16LE(peOffset + 4)
  const sectionCount = buffer.readUInt16LE(peOffset + 6)
  const optionalSize = buffer.readUInt16LE(peOffset + 20)
  const optionalOffset = peOffset + 24
  if (optionalOffset + optionalSize > buffer.length) throw new Error(`Truncated PE optional header: ${file}`)
  const magic = buffer.readUInt16LE(optionalOffset)
  const dataDirectoryOffset = optionalOffset + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : 0)
  if (dataDirectoryOffset === optionalOffset) throw new Error(`Unsupported PE optional header: ${file}`)

  const sections = []
  const sectionOffset = optionalOffset + optionalSize
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionOffset + index * 40
    if (offset + 40 > buffer.length) throw new Error(`Truncated PE section table: ${file}`)
    sections.push({
      virtualSize: buffer.readUInt32LE(offset + 8),
      virtualAddress: buffer.readUInt32LE(offset + 12),
      rawSize: buffer.readUInt32LE(offset + 16),
      rawOffset: buffer.readUInt32LE(offset + 20),
    })
  }

  const rvaToOffset = rva => {
    const section = sections.find(item => rva >= item.virtualAddress && rva < item.virtualAddress + Math.max(item.virtualSize, item.rawSize))
    if (!section) throw new Error(`Unmapped PE RVA 0x${rva.toString(16)} in ${file}`)
    const offset = section.rawOffset + rva - section.virtualAddress
    if (offset >= buffer.length) throw new Error(`PE RVA outside file in ${file}`)
    return offset
  }

  if (dataDirectoryOffset + 16 > optionalOffset + optionalSize) return { machine, imports: [] }
  const importRva = buffer.readUInt32LE(dataDirectoryOffset + 8)
  const importSize = buffer.readUInt32LE(dataDirectoryOffset + 12)
  if (!importRva || !importSize) return { machine, imports: [] }

  const imports = []
  let descriptorOffset = rvaToOffset(importRva)
  const descriptorLimit = descriptorOffset + importSize
  while (descriptorOffset + 20 <= buffer.length && descriptorOffset < descriptorLimit) {
    const originalThunk = buffer.readUInt32LE(descriptorOffset)
    const timeDateStamp = buffer.readUInt32LE(descriptorOffset + 4)
    const forwarderChain = buffer.readUInt32LE(descriptorOffset + 8)
    const nameRva = buffer.readUInt32LE(descriptorOffset + 12)
    const firstThunk = buffer.readUInt32LE(descriptorOffset + 16)
    if (!(originalThunk || timeDateStamp || forwarderChain || nameRva || firstThunk)) break
    if (!nameRva) throw new Error(`PE import has no name in ${file}`)
    imports.push(readCString(buffer, rvaToOffset(nameRva), file))
    descriptorOffset += 20
  }
  return { machine, imports }
}

async function listPeFiles(root) {
  const files = []
  async function visit(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(fullPath)
      else if (entry.isFile() && /\.(?:dll|exe)$/i.test(entry.name)) files.push(fullPath)
    }
  }
  await visit(root)
  return files
}

async function inspectFile(file) {
  return inspectPe(await fsp.readFile(file), file)
}

async function findRequiredVisualCppRuntime(postgresRoot, { ignoreRuntimeFiles = false } = {}) {
  const required = new Map()
  for (const directory of ['bin', 'lib']) {
    const directoryPath = path.join(postgresRoot, directory)
    for (const file of await listPeFiles(directoryPath)) {
      if (ignoreRuntimeFiles && VISUAL_CPP_RUNTIME.test(path.basename(file))) continue
      const { machine, imports } = await inspectFile(file)
      if (machine !== IMAGE_FILE_MACHINE_AMD64) throw new Error(`PostgreSQL native file is not AMD64: ${file}`)
      for (const imported of imports) {
        if (!VISUAL_CPP_RUNTIME.test(imported)) continue
        const normalized = imported.toLowerCase()
        if (!required.has(normalized)) required.set(normalized, [])
        required.get(normalized).push(path.relative(postgresRoot, file))
      }
    }
  }
  return required
}

async function validateRuntimeFile(file, expectedName) {
  const stat = await fsp.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid Visual C++ runtime file: ${file}`)
  const { machine } = await inspectFile(file)
  if (machine !== IMAGE_FILE_MACHINE_AMD64) throw new Error(`Visual C++ runtime is not AMD64: ${file}`)
  if (!VISUAL_CPP_RUNTIME.test(expectedName)) throw new Error(`Unsupported Visual C++ runtime dependency: ${expectedName}`)
}

async function sha256(file) {
  return crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex')
}

async function checkPostgresVisualCppRuntime(postgresRoot) {
  const required = await findRequiredVisualCppRuntime(postgresRoot)
  const files = []
  for (const [name, importedBy] of required) {
    const file = path.join(postgresRoot, 'bin', name)
    try { await validateRuntimeFile(file, name) }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Missing Visual C++ runtime ${name}; imported by ${importedBy.join(', ')}`)
      throw error
    }
    files.push({ name, importedBy, sha256: await sha256(file) })
  }
  return { architecture: 'x64', files }
}

async function repairPostgresVisualCppRuntime(javaBin, postgresRoot) {
  const required = await findRequiredVisualCppRuntime(postgresRoot, { ignoreRuntimeFiles: true })
  const pending = [...required.keys()]
  const copied = new Set()
  for (let index = 0; index < pending.length; index += 1) {
    const name = pending[index]
    const source = path.join(javaBin, name)
    const sourceInfo = await inspectFile(source).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`Bundled Java does not provide required Visual C++ runtime ${name}: ${source}`)
      throw error
    })
    await validateRuntimeFile(source, name)
    for (const imported of sourceInfo.imports) {
      if (!VISUAL_CPP_RUNTIME.test(imported)) continue
      const normalized = imported.toLowerCase()
      if (!required.has(normalized)) {
        required.set(normalized, [`java\\bin\\${name}`])
        pending.push(normalized)
      }
    }
  }

  for (const name of required.keys()) {
    const source = path.join(javaBin, name)
    const destination = path.join(postgresRoot, 'bin', name)
    const sourceHash = await sha256(source)
    let destinationHash
    try {
      const stat = await fsp.lstat(destination)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid Visual C++ runtime file: ${destination}`)
      destinationHash = await sha256(destination)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (sourceHash !== destinationHash) {
      await fsp.copyFile(source, destination)
      copied.add(name)
    }
    await validateRuntimeFile(destination, name)
    if (sourceHash !== await sha256(destination)) throw new Error(`Visual C++ runtime copy verification failed: ${name}`)
  }
  return { copied: [...copied].sort(), ...(await checkPostgresVisualCppRuntime(postgresRoot)) }
}

async function runCli() {
  const [command, runtimeRoot] = process.argv.slice(2)
  if (!['check', 'repair'].includes(command) || !runtimeRoot) {
    throw new Error('Usage: node nativeDependencies.cjs <check|repair> <desktop-runtime-directory>')
  }
  const absoluteRoot = path.resolve(runtimeRoot)
  const result = command === 'repair'
    ? await repairPostgresVisualCppRuntime(path.join(absoluteRoot, 'java', 'bin'), path.join(absoluteRoot, 'postgres'))
    : await checkPostgresVisualCppRuntime(path.join(absoluteRoot, 'postgres'))
  console.log(JSON.stringify(result, null, 2))
}

module.exports = {
  IMAGE_FILE_MACHINE_AMD64,
  inspectPe,
  findRequiredVisualCppRuntime,
  checkPostgresVisualCppRuntime,
  repairPostgresVisualCppRuntime,
}

if (require.main === module) runCli().catch(error => { console.error(error.message); process.exitCode = 1 })
