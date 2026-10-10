import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { importSeedBundle } from './seed-bundle.mjs'

test('offline seed requires matching bytes and rejects traversal before writing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sanye-seed-'))
  try {
    const sql = 'begin; commit;'
    const manifest = { version: 1, files: [{ path: 'seed.sql', sha256: createHash('sha256').update(sql).digest('hex') }] }
    await writeFile(path.join(root, 'seed.sql'), sql)
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest))
    await importSeedBundle(root, path.join(root, 'out'))
    assert.equal(await readFile(path.join(root, 'out/seed.sql'), 'utf8'), sql)
    await importSeedBundle(path.join(root, 'out'), path.join(root, 'snapshot'), 'seed-manifest.json')
    assert.equal(await readFile(path.join(root, 'snapshot/seed.sql'), 'utf8'), sql)
    await writeFile(path.join(root, 'seed.sql'), 'altered')
    await assert.rejects(importSeedBundle(root, path.join(root, 'bad')), /checksum mismatch/)
    await assert.rejects(readFile(path.join(root, 'bad/seed.sql')), { code: 'ENOENT' })
    manifest.files[0].path = 'client/../escape'
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest))
    await assert.rejects(importSeedBundle(root, path.join(root, 'bad')), /Invalid or duplicate/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
