// WebGPU 增强门禁（VQ-57）。
//
// 为什么用 Electron：Playwright 自带的 Chromium 缺 dxcompiler.dll，Dawn 创建不了 D3D12 设备，
// WebGPU 只能在真实 Electron 里验收（与 webgpu-motion.test.cjs 同因）。
//
// 断言的是「可复现的事实」：设备可用、WGSL 全部编译通过、逐帧耗时在预算内、
// 输出与 WebGL 参考实现的差异不超过当前实测上限。**像素完全一致尚未达成**，
// 因此这里记录实测差异而不是断言一致；一旦接进播放器，必须先把这个门禁收紧到逐像素一致。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const origin = process.env.SANYE_WEBGPU_ORIGIN || 'http://localhost:5173'
const probe = path.resolve(__dirname, 'webgpu-enhance-probe')
const reportPath = path.resolve(__dirname, '../sanye_deploy/.local/webgpu-enhance/report.json')
const electron = path.resolve(__dirname, '../sanye_desktop/node_modules/electron/dist/electron.exe')

async function originReachable() {
  try { await fetch(origin, { signal: AbortSignal.timeout(4000) }); return true } catch { return false }
}

test('the WebGPU Anime4K port compiles and stays within the measured difference from the WebGL chain', { timeout: 180000 }, async t => {
  if (!(await originReachable())) {
    t.skip(`无法连接前端服务 ${origin}；先启动 pnpm dev:client-only`)
    return
  }
  assert.ok(fs.existsSync(electron), `Electron 二进制不存在：${electron}`)
  fs.rmSync(reportPath, { force: true })
  // ELECTRON_RUN_AS_NODE 会让 Electron 退化成纯 Node（app 为 undefined），必须清掉。
  const env = { ...process.env, SANYE_WEBGPU_ORIGIN: origin }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(electron, ['.'], { cwd: probe, env, timeout: 150000 })
  assert.ok(fs.existsSync(reportPath), `探针没有产出报告：${result.stderr?.toString() ?? ''}`)
  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(payload.status, 'passed', `探针执行失败：${payload.error ?? ''}`)
  const report = payload.report
  console.log('WEBGPU_ENHANCE ' + JSON.stringify({ available: report.webgpu.available,
    balanced: report.profiles.balanced?.difference ?? null, upscale: report.profiles.upscale?.difference ?? null,
    timings: Object.fromEntries(Object.entries(report.profiles).map(([key, value]) => [key, value.webgpu?.ms ?? null])) }))

  assert.equal(report.webgpu.available, true, 'WebGPU 设备必须可用')
  const balanced = report.profiles.balanced
  assert.equal(balanced.webgpu.supported, true, '均衡档必须有 WebGPU 计划')
  assert.deepEqual(balanced.webgpu.compilation, [], 'WGSL 不得有编译错误')
  assert.deepEqual(balanced.webgl.supported, true, 'WebGL 参考路径必须可用')

  const upscale = report.profiles.upscale
  assert.equal(upscale.webgpu.supported, true, '超分档必须有 WebGPU 计划')
  assert.deepEqual(upscale.webgpu.compilation, [], 'WGSL 不得有编译错误')
  assert.deepEqual(upscale.webgpu.uncaptured, [], 'WebGPU 不得出现未捕获错误')
  assert.equal(upscale.webgpu.scale, 2, '超分档必须放大 2 倍')
  assert.equal(upscale.webgpu.width, 384, '192 输入在超分档必须得到 384 输出')

  // 差异上限取本轮实测值并留出余量：数字变大即说明有东西退化，而不是「差一点」。
  for (const [name, ceiling] of [['balanced', 12], ['upscale', 22]]) {
    const measured = report.profiles[name].difference.sameRowOrder.meanAbs
    assert.ok(measured < ceiling, `${name} 档与 WebGL 参考的平均差 ${measured.toFixed(2)} 超过上限 ${ceiling}`)
  }
  assert.equal(report.profiles.sharp.webgpu.supported, false, '锐化档尚未有 WebGPU 实现，必须明确回退')
})
