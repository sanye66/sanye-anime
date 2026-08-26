import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const scripts = [
  'e2e-verify.mjs',
  'e2e-media-player.mjs',
  'e2e-media-cache.mjs',
  'e2e-media-quality.mjs',
  'e2e-season-order.mjs',
  'e2e-movie-playback-lines.mjs',
  'e2e-layout.mjs',
  'e2e-buttons.mjs',
  'e2e-network.mjs',
  'e2e-audit.mjs',
  'e2e-joblogs.mjs',
  'e2e-user.mjs',
  'e2e-mask.mjs',
  'e2e-cas.mjs',
  'e2e-refresh.mjs',
]

/** 按固定顺序执行浏览器回归脚本，任一脚本失败即停止并返回非零退出码。 */
for (const script of scripts) {
  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, script)], {
      cwd: root,
      env: { ...process.env },
      stdio: 'inherit',
    })
    child.on('error', () => resolve(1))
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
  if (exitCode !== 0) {
    console.error(`Playwright 脚本失败：${script}（退出码 ${exitCode}）`)
    process.exit(exitCode)
  }
}

console.log(`Playwright 回归完成：${scripts.length} 个脚本全部通过`)
