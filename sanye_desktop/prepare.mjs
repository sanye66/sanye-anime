import { cp, mkdir, access, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const root = path.join(here, 'runtime')
const java = process.env.SANYE_DESKTOP_JAVA_HOME || process.env.JAVA_HOME
const postgres = process.env.SANYE_DESKTOP_PG_HOME || 'C:/Program Files/PostgreSQL/18'
if (!java) throw new Error('Set SANYE_DESKTOP_JAVA_HOME or JAVA_HOME to the Java 21 runtime')
const sources = [
  [path.join(java, 'bin/java.exe'), 'Java runtime'],
  [path.join(postgres, 'bin/postgres.exe'), 'PostgreSQL runtime'],
  [path.join(repo, 'sanye_client/dist-desktop/index.html'), 'desktop client build'],
  ...['anime', 'search', 'favorite'].map(name => [path.join(repo, `sanye_server/sanye-server-${name}/target/sanye-server-${name}-0.1.0-SNAPSHOT.jar`), name]),
]
for (const [file, name] of sources) await access(file).catch(() => { throw new Error(`Missing ${name}: ${file}`) })
await mkdir(root, { recursive: true })
await cp(java, path.join(root, 'java'), { recursive: true })
for (const dir of ['bin', 'lib', 'share']) await cp(path.join(postgres, dir), path.join(root, 'postgres', dir), { recursive: true })
for (const file of ['server_license.txt', 'commandlinetools_3rd_party_licenses.txt']) await cp(path.join(postgres, file), path.join(root, 'postgres', file))
await cp(path.join(repo, 'sanye_client/dist-desktop'), path.join(root, 'client'), { recursive: true })
await mkdir(path.join(root, 'jars'), { recursive: true })
const manifest = { version: 1, createdAt: new Date().toISOString(), services: {} }
for (const name of ['anime', 'search', 'favorite']) {
  const src = path.join(repo, `sanye_server/sanye-server-${name}/target/sanye-server-${name}-0.1.0-SNAPSHOT.jar`)
  await cp(src, path.join(root, 'jars', `${name}.jar`))
  manifest.services[name] = createHash('sha256').update(await readFile(src)).digest('hex')
}
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
await import('./export-seed.mjs')
console.log('Prepared portable Java, PostgreSQL, application JARs and desktop client; no user database copied.')
