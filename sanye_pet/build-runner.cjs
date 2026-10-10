const { spawnSync } = require('node:child_process')
const path = require('node:path')

const vite = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js')
const result = spawnSync(process.execPath, [vite, 'build'], {
  cwd: __dirname,
  env: { ...process.env, SANYE_RUNNER_ONLY: '1' },
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
