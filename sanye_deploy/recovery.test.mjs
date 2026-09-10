import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, mkdir, symlink, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { validateConfig, inside, digest, run, verifyBundle, restore, backup, objectMetadata, clients } from './recovery.mjs'

const hash = data => createHash('sha256').update(data).digest('hex')
const configuration = () => ({
  quiesced: true,
  databases: [{ role: 'business', source: 'sanye_business', target: 'sanye_restored_business' }, { role: 'admin', source: 'sanye_admin', target: 'sanye_restored_admin' }],
  minio: { buckets: [{ source: 'sanye-source', target: 'sanye-target' }] },
  files: { source: '/sanye/source', target: '/sanye/target' },
})

async function bundle(change = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'sanye-recovery-test-'))
  const payload = Buffer.from('sanye synthetic archive')
  const entry = { size: payload.length, sha256: hash(payload) }
  const manifest = {
    version: 1, consistency: 'quiesced', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    databases: [{ role: 'business', source: 'sanye_business', file: 'business.dump', ...entry }, { role: 'admin', source: 'sanye_admin', file: 'admin.dump', ...entry }],
    buckets: [{ source: 'sanye-source', objects: [{ key: 'cover.png', file: 'remote.bin', contentType: 'image/png', ...entry }] }],
    files: [{ key: 'sanye-source/cover.png', file: 'local.bin', ...entry }],
    references: [{ id: 1, bucket: 'sanye-source', object_key: 'cover.png', size_bytes: payload.length, sha256: entry.sha256 }],
  }
  for (const file of ['business.dump', 'admin.dump', 'remote.bin', 'local.bin']) await writeFile(join(root, file), payload)
  change(manifest)
  const body = JSON.stringify(manifest)
  await writeFile(join(root, 'manifest.json'), body)
  await writeFile(join(root, 'manifest.sha256'), hash(body))
  await writeFile(join(root, 'COMPLETE'), 'complete')
  return root
}

test('rejects same targets, cross mapping, duplicates and overlapping storage', () => {
  assert.doesNotThrow(() => validateConfig(configuration()))
  for (const mutate of [
    c => { c.quiesced = false },
    c => { c.databases[0].target = c.databases[0].source },
    c => { c.databases[0].target = c.databases[1].source },
    c => { c.databases[0].target = c.databases[1].target },
    c => { c.minio.buckets[0].target = c.minio.buckets[0].source },
    c => { c.files.target = c.files.source + '/nested' },
    c => { c.databases = [c.databases[0]] },
  ]) { const c = configuration(); mutate(c); assert.throws(() => validateConfig(c)) }
})

test('rejects archive path traversal and Windows alternate data streams', () => {
  for (const value of ['../outside', '/outside', 'C:/outside', 'file:secret', 'x\\y', 'a//b', 'a/./b']) assert.throws(() => inside(tmpdir(), value))
  assert.ok(inside(tmpdir(), 'safe/file.bin').endsWith(join('safe', 'file.bin')))
})

test('rejects Windows aliases, device names and trailing-dot filename aliases', async () => {
  for (const value of ['CON', 'aux.txt', 'x/NUL.png', 'file.', 'dir /file', 'LPT1', 'bad?name']) assert.throws(() => inside(tmpdir(), value))
  if (process.platform !== 'win32') return
  const root = await mkdtemp(join(tmpdir(), 'sanye-recovery-case-'))
  const config = configuration()
  config.files = { source: join(root, 'Store'), target: join(root.toUpperCase(), 'STORE') }
  assert.throws(() => validateConfig(config), /overlap/)
  config.files.target = join(root, 'target')
  await mkdir(config.files.source)
  await assert.rejects(backup(config, join(root.toUpperCase(), 'STORE', 'backup')), /overlaps storage/)
  await assert.rejects(lstat(join(root, 'Store', 'backup')), { code: 'ENOENT' })
})

test('rejects linked manifest files and linked archive directories', async () => {
  const root = await bundle(m => { m.files[0].file = 'linked/local.bin' })
  const outside = await mkdtemp(join(tmpdir(), 'sanye-recovery-link-'))
  await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(verifyBundle(root), /Symbolic links/)
})

test('preserves MIME parameters and custom attributes while rejecting header injection', async () => {
  const metadata = objectMetadata({ 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Disposition': 'inline; filename="proof.svg"', 'Cache-Control': 'public, max-age=300', 'recovery-owner': 'sanye' })
  assert.equal(metadata['content-type'], 'image/svg+xml; charset=utf-8')
  assert.equal(metadata['content-disposition'], 'inline; filename="proof.svg"')
  assert.throws(() => objectMetadata({ 'content-type': 'image/png\r\nx-secret:bad' }), /Unsafe/)
  assert.throws(() => objectMetadata({ 'x-amz-server-side-encryption': 'aws:kms' }), /explicit recovery policy/)
  const root = await bundle(m => {
    m.version = 2
    m.buckets[0].objects[0].contentType = metadata['content-type']
    m.buckets[0].objects[0].metadata = metadata
    m.buckets[0].objects[0].tags = { purpose: 'recovery' }
  })
  assert.deepEqual((await verifyBundle(root)).buckets[0].objects[0].metadata, metadata)
})

test('verifies intact bundle and detects byte corruption before contacting targets', async () => {
  const root = await bundle()
  await verifyBundle(root)
  await writeFile(join(root, 'business.dump'), 'corrupt archive')
  await assert.rejects(restore(configuration(), root), /checksum mismatch/)
})

test('rejects empty and missing backup objects', async () => {
  const root = await bundle()
  await writeFile(join(root, 'remote.bin'), '')
  await assert.rejects(verifyBundle(root), /empty/)
  const missing = await bundle(m => { m.buckets[0].objects[0].file = 'missing.bin' })
  await assert.rejects(verifyBundle(missing))
})

test('requires local runtime objects and configured MinIO counterparts', async () => {
  const localMissing = await bundle(m => { m.files = [] })
  await assert.rejects(verifyBundle(localMissing), /missing local object/)
  const remoteMissing = await bundle(m => { m.buckets[0].objects = [] })
  await assert.rejects(verifyBundle(remoteMissing), /missing MinIO object/)
  const badMetadata = await bundle(m => { m.references[0].sha256 = 'a'.repeat(64) })
  await assert.rejects(verifyBundle(badMetadata), /metadata digest mismatch/)
})

test('rejects incomplete bundle and modified manifest', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'sanye-recovery-incomplete-'))
  await assert.rejects(verifyBundle(empty), /incomplete/)
  const root = await bundle()
  await writeFile(join(root, 'manifest.json'), '{}')
  await assert.rejects(verifyBundle(root), /Manifest checksum mismatch/)
})

test('legacy bundle remains inspectable but cannot claim complete V2 recovery', async () => {
  const root = await bundle()
  assert.equal((await verifyBundle(root)).version, 1)
  await assert.rejects(restore(configuration(), root), /recreated as V2/)
})

test('rejects duplicate archive files and traversal even with recalculated manifest checksum', async () => {
  const duplicate = await bundle(m => { m.files[0].file = 'remote.bin' })
  await assert.rejects(verifyBundle(duplicate), /Duplicate archive path/)
  const traversal = await bundle(m => { m.files[0].file = '../outside' })
  await assert.rejects(verifyBundle(traversal), /Unsafe relative path/)
})

test('streams binary tool output and verifies it without creating a second copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sanye-recovery-stream-'))
  const file = join(root, 'binary.bin')
  const args = ['-e', 'process.stdout.write(Buffer.from([0,255,10,13,128]))']
  await run({ command: process.execPath }, args, { outputFile: file })
  const actual = await digest(file)
  assert.equal(actual.size, 5)
  assert.deepEqual(await run({ command: process.execPath }, args, { hashOutput: true }), actual)
  assert.deepEqual([...await readFile(file)], [0, 255, 10, 13, 128])
})

test('does not expose stderr or credentials when a tool fails', async () => {
  await assert.rejects(run({ command: process.execPath }, ['-e', 'console.error("sensitive-value");process.exit(2)'], { label: 'Archive validation' }), error => error.message === 'Archive validation failed')
  await assert.rejects(run({ command: 'sanye-nonexistent-program' }, [], { label: 'Archive validation' }), /Archive validation failed/)
})

test('timeout stops the recorded tool process and its descendant', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'sanye-recovery-process-'))
  const pidFile = join(root, 'descendant.pid')
  const script = `const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'inherit'}); writeFileSync(process.env.SANYE_TEST_PID_FILE,String(child.pid)); setInterval(()=>{},1000)`
  await assert.rejects(run({ command: process.execPath }, ['-e', script], { env: { SANYE_TEST_PID_FILE: pidFile }, timeout: 1500 }), /tool failed/)
  const pid = Number(await readFile(pidFile, 'utf8'))
  let running = true
  try {
    process.kill(pid, 0)
    if (process.platform === 'linux' && /\) Z /.test(await readFile(`/proc/${pid}/stat`, 'utf8'))) running = false
  } catch (error) { if (['ESRCH', 'ENOENT'].includes(error.code)) running = false; else throw error }
  assert.equal(running, false, 'Tool descendant must be terminated')
})

test('MinIO stalls and retryable failures terminate within the configured request deadline', { timeout: 10000 }, async () => {
  let requests = 0, status = 0
  const server = createServer((req, res) => { requests++; if (status) { res.writeHead(status); res.end() } })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  process.env.SANYE_TEST_STORAGE_USER = 'test-user'
  process.env.SANYE_TEST_STORAGE_PASSWORD = 'test-secret'
  const config = { minio: { requestTimeoutMs: 150, target: { endpoint: `http://127.0.0.1:${server.address().port}`, accessKeyEnv: 'SANYE_TEST_STORAGE_USER', secretKeyEnv: 'SANYE_TEST_STORAGE_PASSWORD' } } }
  try {
    await assert.rejects(clients(config).storage('target').listBuckets(), /deadline|stalled/)
    assert.equal(requests, 1)
    status = 503
    await assert.rejects(clients(config).storage('target').listBuckets(), /request rejected/)
    assert.equal(requests, 2)
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); delete process.env.SANYE_TEST_STORAGE_USER; delete process.env.SANYE_TEST_STORAGE_PASSWORD }
})
