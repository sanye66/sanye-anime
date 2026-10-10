import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, lstat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function importSeedBundle(source, destination, manifestName = 'manifest.json') {
  const manifest = JSON.parse(await readFile(path.join(source, manifestName), 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid seed bundle manifest')
  const names = new Set()
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || !/^(seed\.sql|client\/[a-zA-Z0-9_./-]+)$/.test(entry.path) || entry.path.split('/').some(p => p === '..' || !p) || names.has(entry.path)) throw new Error('Invalid or duplicate seed bundle path')
    names.add(entry.path)
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid seed bundle checksum')
    let current = source
    for (const segment of entry.path.split('/')) {
      current = path.join(current, segment)
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Seed bundle links are forbidden')
    }
    const content = await readFile(current)
    if (createHash('sha256').update(content).digest('hex') !== entry.sha256) throw new Error(`Seed checksum mismatch: ${entry.path}`)
  }
  if (!names.has('seed.sql')) throw new Error('Seed bundle has no seed.sql')
  // Validate the entire bundle before copying any file into the runtime.
  for (const entry of manifest.files) {
    const target = path.join(destination, entry.path)
    await mkdir(path.dirname(target), { recursive: true })
    await cp(path.join(source, entry.path), target)
  }
  await writeFile(path.join(destination, 'seed-manifest.json'), JSON.stringify(manifest, null, 2))
}
