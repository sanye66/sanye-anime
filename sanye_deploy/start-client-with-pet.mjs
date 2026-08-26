import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const children = []

/** 启动子进程并保留句柄，主进程退出时统一清理开发服务。 */
function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    // Windows 的 pnpm.cmd 需要由 shell 解析，Linux/macOS 仍保持直接执行。
    shell: process.platform === 'win32',
    windowsHide: true,
    ...options,
  })
  children.push(child)
  return child
}

/** 轮询本地服务，确保 Electron 打开时目标页面已经可访问。 */
async function waitForUrl(url, label) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // 开发服务器尚未就绪时继续等待。
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`${label}在 30 秒内未就绪`)
}

/** 判断本地服务是否已经存在，重复执行启动命令时复用现有服务。 */
async function isUrlReady(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

/** 退出时关闭客户端、桌宠渲染器和 Electron，避免留下孤儿进程。 */
function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.on('SIGINT', () => {
  stopChildren()
  process.exit(0)
})
process.on('SIGTERM', () => {
  stopChildren()
  process.exit(0)
})

// 客户端是桌宠的宿主入口；重复执行命令时不重复创建 Vite 服务。
if (!(await isUrlReady('http://localhost:5173'))) {
  start(pnpmCommand, ['--filter', '@sanye/sanye_client', 'dev'])
}

try {
  await waitForUrl('http://localhost:5173', '客户端开发服务器')
  if (!(await isUrlReady('http://localhost:5199'))) {
    start(pnpmCommand, ['--dir', 'sanye_pet', 'dev'])
  }
  await waitForUrl('http://localhost:5199', '桌宠渲染器')
  const electronCommand = process.platform === 'win32'
    ? path.resolve('sanye_pet/node_modules/electron/dist/electron.exe')
    : path.resolve('sanye_pet/node_modules/.bin/electron')
  start(electronCommand, ['.'], {
    cwd: path.resolve('sanye_pet'),
    env: {
      ...process.env,
      PET_DEV: '1',
      VITE_DEV_SERVER_URL: 'http://localhost:5199',
      SANYE_CLIENT_URL: 'http://localhost:5173',
    },
  })
} catch (error) {
  console.error(`[sanye] ${error instanceof Error ? error.message : String(error)}`)
  stopChildren()
  process.exitCode = 1
}

for (const child of children) {
  child.once('exit', (code) => {
    if (code && code !== 0) process.exitCode = code
  })
}
