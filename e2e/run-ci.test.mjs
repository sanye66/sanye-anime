import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runScript } from './run-ci.mjs'

function fixture(t, source) {
  const directory = mkdtempSync(path.join(tmpdir(), 'sanye_ci_runner_'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const script = path.join(directory, 'fixture.cjs')
  writeFileSync(script, source)
  return { script }
}

test('runner propagates preview origins and limits browser workers', async t => {
  await runScript(fixture(t, "if (process.env.BASE !== 'http://fixture.invalid' || process.env.SANYE_FRONTEND_URL !== process.env.BASE || process.env.PW_WORKERS !== '1') process.exit(2)"), { origin: 'http://fixture.invalid' })
})

test('runner fails on script errors', async t => {
  await assert.rejects(runScript(fixture(t, 'process.exit(7)')), /退出码 7/)
})

test('runner terminates a timed out process before returning', async t => {
  let child
  await assert.rejects(runScript(fixture(t, 'setInterval(() => {}, 1000)'), { timeoutMs: 150, onSpawn: spawned => { child = spawned } }), /超时/)
  assert.ok(child.exitCode !== null || child.signalCode !== null)
})

test('runner aborts active work and cleans up the process', async t => {
  const controller = new AbortController()
  let child
  const running = runScript(fixture(t, 'setInterval(() => {}, 1000)'), { signal: controller.signal, onSpawn: spawned => { child = spawned } })
  controller.abort(new Error('fixture interrupted'))
  await assert.rejects(running, /fixture interrupted/)
  assert.ok(child.exitCode !== null || child.signalCode !== null)
})
