import { createReadStream } from 'node:fs'
import { readdir, writeFile, lstat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'sanye_desktop/dist')
const files = []
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Artifact links are forbidden')
    if (entry.isDirectory()) await scan(file)
    else if (entry.isFile() && entry.name !== 'artifact-manifest.json') {
      if (entry.name.endsWith('.incomplete')) throw new Error('Incomplete artifact present')
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(file)) hash.update(chunk)
      files.push({ path: path.relative(root, file).split(path.sep).join('/'), size: (await lstat(file)).size, sha256: hash.digest('hex') })
    }
  }
}
await scan(root)
if (!files.length) throw new Error('No artifacts found')
files.sort((a, b) => a.path.localeCompare(b.path))
await writeFile(path.join(root, 'artifact-manifest.json'), JSON.stringify({ version: 1, commit: process.env.GITHUB_SHA || null, signatureAcceptance: 'not-verified', files }, null, 2))
console.log(`Recorded ${files.length} artifact hashes`)
