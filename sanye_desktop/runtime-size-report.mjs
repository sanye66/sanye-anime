import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve(process.argv[2] || 'sanye_desktop/runtime')
async function size(dir) { let total = 0; for (const e of await readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); total += e.isDirectory() ? await size(p) : (await stat(p)).size } return total }
for (const name of ['java', 'postgres', 'jars', 'client']) console.log(`${name}: ${(await size(path.join(root, name)) / 1048576).toFixed(2)} MiB`)
