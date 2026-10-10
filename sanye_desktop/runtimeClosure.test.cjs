const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const audit = path.join(__dirname, 'verify-runtime-closure.cjs')
const runtime = path.join(__dirname, 'runtime')
const prepared = fs.existsSync(path.join(runtime, 'java', 'bin', 'java.exe'))

const run = target => spawnSync(process.execPath, [audit, target], { encoding: 'utf8' })

test('prepared runtime depends only on bundled files and Windows components', { skip: !prepared }, () => {
  const result = run(runtime)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /依赖闭包校验通过/)
})

test('a runtime tree missing a bundled dependency is rejected', { skip: !prepared }, async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sanye-closure-'))
  await fsp.mkdir(path.join(root, 'java', 'bin'), { recursive: true })
  await fsp.copyFile(path.join(runtime, 'java', 'bin', 'java.exe'), path.join(root, 'java', 'bin', 'java.exe'))
  const result = run(root)
  assert.notEqual(result.status, 0, 'the audit must fail when imported DLLs are absent')
  assert.match(result.stderr, /依赖闭包不完整/)
  assert.match(result.stderr, /jli\.dll/)
  await fsp.rm(root, { recursive: true, force: true })
})
