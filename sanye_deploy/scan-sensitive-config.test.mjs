import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { audit, scanText } from './scan-sensitive-config.mjs'

const canary = ['canary', 'credential', '928135'].join('-')
function run(cwd, program, args) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, `${program} failed`)
}
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'sanye-secret-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  run(root, 'git', ['init', '-q'])
  run(root, 'git', ['config', 'user.email', 'test@example.invalid'])
  run(root, 'git', ['config', 'user.name', 'Audit Test'])
  return root
}

test('detects assignments, credential URLs, private keys, provider tokens without values', () => {
  const token = 'ghp_' + 'a'.repeat(36)
  const text = `password: ${canary}\nhttps://user:${canary}@example.invalid\n-----BEGIN PRIVATE KEY-----\n${token}`
  const findings = scanText(text, 'settings.yml')
  assert.deepEqual(new Set(findings.map(item => item.rule)), new Set(['sensitive-assignment', 'credential-url', 'private-key', 'provider-token']))
  assert.ok(findings.every(item => item.category === 'potential-secret'))
  assert.ok(!JSON.stringify(findings).includes(canary))
  assert.ok(!JSON.stringify(findings).includes(token))
})

test('distinguishes explicit examples and environment references from embedded defaults', () => {
  const findings = scanText('password: ${DB_PASSWORD}\nsecret: change-me\napi_key: ${API_KEY:}\npassword: ${DB_PASSWORD:' + canary + '}\npassword: ' + canary, 'config.example.yml')
  assert.deepEqual(findings.map(item => item.category), ['example-or-reference', 'example-or-reference', 'example-or-reference', 'potential-secret', 'potential-secret'])
})

test('scans XML credentials and ignores empty literals or code variable references', () => {
  assert.equal(scanText(`<password>${canary}</password>`, 'settings.xml')[0].category, 'potential-secret')
  assert.equal(scanText("const password = ''; const secret = settings.secret;", 'settings.ts').length, 0)
  assert.equal(scanText(`const password = '${canary}';`, 'settings.ts')[0].category, 'potential-secret')
})

test('detects generic management tokens, internal tokens and camel-case token secrets', () => {
  for (const key of ['manage-token', 'internal-token', 'TokenSecret', 'token']) {
    assert.equal(scanText(`${key}: ${canary}`, 'settings.yml')[0].category, 'potential-secret')
  }
  assert.equal(scanText('command: --requirepass ${REDIS_PASSWORD:-' + canary + '}', 'compose.yml')[0].rule, 'sensitive-environment-fallback')
  assert.equal(scanText('command: --requirepass ${REDIS_PASSWORD}', 'compose.yml').length, 0)
})

test('first-party mode scans application and sanye JARs and reports skipped dependency boundary', async t => {
  const root = await fixture(t)
  await mkdir(path.join(root, 'output', 'BOOT-INF', 'classes'), { recursive: true })
  await mkdir(path.join(root, 'output', 'BOOT-INF', 'lib'), { recursive: true })
  await writeFile(path.join(root, '.gitignore'), 'output/\n')
  await writeFile(path.join(root, 'output', 'BOOT-INF', 'classes', 'application.yml'), `internal-token: ${canary}`)
  run(root, 'tar', ['--format', 'zip', '-cf', 'output/BOOT-INF/lib/sanye-common.jar', '-C', 'output/BOOT-INF/classes', 'application.yml'])
  await writeFile(path.join(root, 'output', 'BOOT-INF', 'lib', 'third-party.jar'), 'unreadable third-party fixture')
  run(root, 'tar', ['--format', 'zip', '-cf', 'output/app.jar', '-C', 'output', 'BOOT-INF'])
  const report = await audit({ root, artifacts: ['output/app.jar'], artifactMode: 'first-party' })
  assert.deepEqual(report.errors, [])
  assert.equal(report.coverage.excludedArchiveEntries.length, 1)
  assert.ok(report.coverage.excludedArchiveEntries[0].endsWith('third-party.jar'))
  assert.ok(report.findings.some(item => item.location.includes('!/sanye-common.jar!/') || item.location.includes('/sanye-common.jar!/')))
  const full = await audit({ root, artifacts: ['output/app.jar'] })
  assert.ok(full.errors.some(item => item.scope === 'artifact'))
})

test('scans untracked files and credentials removed from reachable Git history', async t => {
  const root = await fixture(t)
  await writeFile(path.join(root, 'old.yml'), `password: ${canary}\n`)
  run(root, 'git', ['add', 'old.yml'])
  run(root, 'git', ['commit', '-qm', 'fixture'])
  await rm(path.join(root, 'old.yml'))
  run(root, 'git', ['add', '-u'])
  run(root, 'git', ['commit', '-qm', 'remove fixture'])
  await writeFile(path.join(root, 'untracked.yml'), `secret: ${canary}\n`)
  const report = await audit({ root, history: true })
  assert.equal(report.passed, false)
  assert.deepEqual(report.errors, [])
  assert.ok(report.findings.some(item => item.scope === 'history' && item.location.endsWith(':old.yml')))
  assert.ok(report.findings.some(item => item.scope === 'worktree' && item.location === 'untracked.yml'))
  assert.ok(!JSON.stringify(report).includes(canary))
})

test('scans ignored logs and JAR entry content when explicitly selected', async t => {
  const root = await fixture(t)
  await writeFile(path.join(root, '.gitignore'), 'output/\n')
  await mkdir(path.join(root, 'output'))
  await writeFile(path.join(root, 'output', 'runtime.log'), `password=${canary}\n`)
  await writeFile(path.join(root, 'output', 'application.yml'), `secret: ${canary}\n`)
  run(root, 'tar', ['--format', 'zip', '-cf', 'output/app.jar', '-C', 'output', 'application.yml'])
  run(root, 'tar', ['--format', 'zip', '-cf', 'output/outer.jar', '-C', 'output', 'app.jar'])
  const report = await audit({ root, logs: ['output/runtime.log'], artifacts: ['output/outer.jar'] })
  assert.deepEqual(report.errors, [])
  assert.ok(report.findings.some(item => item.scope === 'log'))
  assert.ok(report.findings.some(item => item.scope === 'artifact' && item.location.includes('!/app.jar!/application.yml')))
  assert.ok(!JSON.stringify(report).includes(canary))
})

test('missing inputs and corrupt archives fail closed without echoing input content', async t => {
  const root = await fixture(t)
  await writeFile(path.join(root, 'broken.jar'), canary)
  const report = await audit({ root, logs: ['missing.log'], artifacts: ['broken.jar'] })
  assert.equal(report.passed, false)
  assert.ok(report.errors.some(item => item.scope === 'log'))
  assert.ok(report.errors.some(item => item.scope === 'artifact'))
  assert.ok(!JSON.stringify(report).includes(canary))
})
