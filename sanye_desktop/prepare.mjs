import { cp, mkdir, access, writeFile, readFile, rm, mkdtemp, rename } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { importSeedBundle } from './seed-bundle.mjs'
import postgresTemplate from './postgresTemplate.cjs'
import nativeDependencies from './nativeDependencies.cjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const root = path.join(here, 'runtime')
const seedBundle = process.env.SANYE_DESKTOP_SEED_BUNDLE
if (process.env.CI && !seedBundle) throw new Error('CI requires SANYE_DESKTOP_SEED_BUNDLE; local database export is forbidden in CI')
const java = process.env.SANYE_DESKTOP_JAVA_HOME || process.env.JAVA_HOME
const postgres = process.env.SANYE_DESKTOP_PG_HOME || 'C:/Program Files/PostgreSQL/18'
if (!java) throw new Error('Set SANYE_DESKTOP_JAVA_HOME or JAVA_HOME to a Java 21 runtime')
const sources = [
  [path.join(java, 'bin/java.exe'), 'Java runtime'],
  [path.join(java, 'bin/jlink.exe'), 'Java runtime linker'],
  [path.join(postgres, 'bin/postgres.exe'), 'PostgreSQL runtime'],
  [path.join(repo, 'sanye_client/dist-desktop/index.html'), 'desktop client build'],
  ...['anime', 'search', 'favorite'].map(name => [path.join(repo, `sanye_server/sanye-server-${name}/target/sanye-server-${name}-0.1.0-SNAPSHOT.jar`), name]),
]
for (const [file, name] of sources) await access(file).catch(() => { throw new Error(`Missing ${name}: ${file}`) })
await mkdir(root, { recursive: true })
const stagingRoot = path.join(repo, 'sanye_deploy/.local')
await mkdir(stagingRoot, { recursive: true })
const staging = await mkdtemp(path.join(stagingRoot, 'sanye-jlink-'))
const linked = path.join(staging, 'java')
const javaMajor = Number((await promisify(execFile)(path.join(java, 'bin/java.exe'), ['-version'], { windowsHide: true })).stderr.match(/version "(\d+)/)?.[1] || 0)
if (javaMajor !== 21) throw new Error(`桌面运行时要求 Java 21，当前为 Java ${javaMajor || '未知'}`)
await promisify(execFile)(path.join(java, 'bin/jlink.exe'), [
  '--module-path', path.join(java, 'jmods'), '--add-modules', 'ALL-MODULE-PATH',
  '--strip-debug', '--no-header-files', '--no-man-pages', '--compress=2', '--output', linked,
], { windowsHide: true, timeout: 120000 })
await access(path.join(linked, 'bin/java.exe'))
// JMOD native files may lack the vendor Authenticode signature. Preserve original binaries.
await cp(path.join(java, 'bin'), path.join(linked, 'bin'), { recursive: true })
await cp(path.join(java, 'legal'), path.join(linked, 'legal'), { recursive: true })
await promisify(execFile)(path.join(linked, 'bin/java.exe'), ['--version'], { windowsHide: true, timeout: 30000 })
// Retain the previous generated runtime outside the package for rollback.
try { await rename(path.join(root, 'java'), path.join(staging, 'previous-java')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
await rename(linked, path.join(root, 'java'))
for (const dir of ['bin', 'lib', 'share']) await cp(path.join(postgres, dir), path.join(root, 'postgres', dir), { recursive: true })
for (const file of ['server_license.txt', 'commandlinetools_3rd_party_licenses.txt']) await cp(path.join(postgres, file), path.join(root, 'postgres', file))
await nativeDependencies.repairPostgresVisualCppRuntime(path.join(root, 'java', 'bin'), path.join(root, 'postgres'))
// Keep only runtime data; development modules and extension build metadata do not serve the bundled services.
for (const directory of ['java/jmods', 'java/include', 'postgres/lib/pgxs', 'postgres/lib/pkgconfig', 'postgres/share/doc']) await rm(path.join(root, directory), { recursive: true, force: true })
await postgresTemplate.buildTemplate(root)
try { await rename(path.join(root, 'client'), path.join(staging, 'previous-client')) }
catch (error) { if (error.code !== 'ENOENT') throw error }
await cp(path.join(repo, 'sanye_client/dist-desktop'), path.join(root, 'client'), { recursive: true })
await mkdir(path.join(root, 'jars'), { recursive: true })
const manifest = { version: 1, createdAt: new Date().toISOString(), javaImage: { modules: 'ALL-MODULE-PATH', compression: 'zip-6', stripDebug: true }, services: {} }
for (const name of ['anime', 'search', 'favorite']) {
  const src = path.join(repo, `sanye_server/sanye-server-${name}/target/sanye-server-${name}-0.1.0-SNAPSHOT.jar`)
  await cp(src, path.join(root, 'jars', `${name}.jar`))
  manifest.services[name] = createHash('sha256').update(await readFile(src)).digest('hex')
}
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
if (seedBundle) await importSeedBundle(path.resolve(seedBundle), root)
else await import('./export-seed.mjs')
console.log('Prepared portable Java, PostgreSQL, application JARs and desktop client; no user database copied.')
