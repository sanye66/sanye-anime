import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(root, '..')
const base = 'http://127.0.0.1:4173'
export const scripts = [
  { script: 'e2e-season-order.mjs' },
  { script: 'e2e-search-external.mjs' },
  { script: 'e2e-movie-playback-lines.mjs' },
  { script: 'e2e-media-quality.mjs' },
  { script: 'desktop-stall-recovery.test.cjs', args: ['--test'] },
  { script: 'search-partial-results.test.cjs', args: ['--test', '--test-concurrency=1'] },
  { script: 'subscription-manager.test.cjs', args: ['--test', '--test-concurrency=1', '--test-name-pattern=^web '] },
  { script: 'subscription-playback.test.cjs', args: ['--test', '--test-concurrency=1'] },
  { script: 'client-page-experience.test.cjs', args: ['--test', '--test-concurrency=1'] },
]

export function stopProcessTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    if (child.exitCode === null && child.signalCode === null) {
      const result = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', timeout: 10000 })
      if (result.error || result.status !== 0) child.kill('SIGKILL')
    }
  } else {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }
}

export async function runScript({ script, args = [] }, { signal, timeoutMs = 180000, onSpawn, origin = base } = {}) {
  if (signal?.aborted) throw signal.reason
  const child = spawn(process.execPath, [...args, path.resolve(root, script)], {
    cwd: root,
    env: { ...process.env, BASE: origin, SANYE_FRONTEND_URL: origin, PW_WORKERS: '1' },
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  })
  onSpawn?.(child)
  let timeout
  let abort
  try {
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
      timeout = setTimeout(() => reject(new Error('CI Playwright 脚本超时：' + script)), timeoutMs)
      abort = () => reject(signal.reason)
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
    if (exitCode !== 0) throw new Error('CI Playwright 脚本失败：' + script + '（退出码 ' + exitCode + '）')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
    stopProcessTree(child)
    if (child.pid && child.exitCode === null && child.signalCode === null) await new Promise((resolve, reject) => {
      const cleanupTimeout = setTimeout(() => reject(new Error('CI Playwright 子进程清理超时：' + script)), 5000)
      child.once('exit', () => { clearTimeout(cleanupTimeout); resolve() })
    })
  }
}

async function waitForPreview(preview, signal, spawnError) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (signal.aborted) throw signal.reason
    if (spawnError()) throw spawnError()
    if (preview.exitCode !== null || preview.signalCode !== null) throw new Error('客户端预览服务提前退出：' + (preview.exitCode ?? preview.signalCode))
    try {
      const response = await fetch(base, { signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]) })
      if (response.ok) return
    } catch {
      if (signal.aborted) throw signal.reason
    }
    await delay(300, undefined, { signal })
  }
  throw new Error('客户端预览服务在 20 秒内未就绪')
}

export async function runCi() {
  const controller = new AbortController()
  const interrupt = signal => controller.abort(new Error('CI Playwright 收到终止信号：' + signal))
  const onSigint = () => interrupt('SIGINT')
  const onSigterm = () => interrupt('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
  const viteCli = path.join(workspaceRoot, 'sanye_client', 'node_modules', 'vite', 'bin', 'vite.js')
  const preview = spawn(process.execPath, [viteCli, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: path.join(workspaceRoot, 'sanye_client'),
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  })
  let spawnError
  preview.once('error', error => { spawnError = error })
  try {
    await waitForPreview(preview, controller.signal, () => spawnError)
    for (const script of scripts) await runScript(script, { signal: controller.signal })
    console.log('CI Playwright 回归完成：' + scripts.length + ' 个脚本全部通过')
  } finally {
    stopProcessTree(preview)
    process.removeListener('SIGINT', onSigint)
    process.removeListener('SIGTERM', onSigterm)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runCi() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
