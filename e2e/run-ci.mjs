import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(root, '..')
const base = 'http://127.0.0.1:4173'
const scripts = [
  'e2e-season-order.mjs',
  'e2e-movie-playback-lines.mjs',
  'e2e-media-quality.mjs',
]
const viteCli = path.join(workspaceRoot, 'sanye_client', 'node_modules', 'vite', 'bin', 'vite.js')
const preview = spawn(process.execPath, [
  viteCli, 'preview',
  '--host', '127.0.0.1', '--port', '4173', '--strictPort',
], {
  cwd: path.join(workspaceRoot, 'sanye_client'),
  detached: process.platform !== 'win32',
  stdio: 'inherit',
})

async function waitForPreview() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (preview.exitCode !== null) throw new Error(`客户端预览服务提前退出：${preview.exitCode}`)
    try {
      const response = await fetch(base)
      if (response.ok) return
    } catch {
      // 预览服务仍在启动。
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('客户端预览服务在 20 秒内未就绪')
}

function stopPreview() {
  if (!preview.pid || preview.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(preview.pid), '/t', '/f'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(-preview.pid, 'SIGTERM')
    } catch {
      preview.kill('SIGTERM')
    }
  }
}

try {
  await waitForPreview()
  for (const script of scripts) {
    const child = spawn(process.execPath, [path.join(root, script)], {
      cwd: root,
      env: { ...process.env, BASE: base },
      stdio: 'inherit',
    })
    const exitCode = await new Promise((resolve) => {
      child.on('error', () => resolve(1))
      child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
    })
    if (exitCode !== 0) throw new Error(`CI Playwright 脚本失败：${script}（退出码 ${exitCode}）`)
  }
  console.log(`CI Playwright 回归完成：${scripts.length} 个脚本全部通过`)
} finally {
  stopPreview()
}
