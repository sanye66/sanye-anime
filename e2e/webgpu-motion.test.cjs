// WebGPU 运动估计门禁（VQ-42）。
//
// 为什么用 Electron 而不是普通无头 Chromium：Playwright 自带的 Chromium 只带 dxil.dll、缺
// dxcompiler.dll，Dawn 无法创建 D3D12 设备（requestDevice 报 dxil.dll Windows Error 87），
// 因此 WebGPU 路径只能在真实 Electron 里验证。探针使用隐藏窗口，不创建可见窗口、不启动本地服务。
//
// 断言内容：首帧必须输出全零场并标记场景切换；两帧完全相同时位移必须为 0；已知整体平移必须被
// 还原；逐帧耗时必须明显低于 CPU 路径的 14–20ms。
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const origin = process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5173'
const probe = path.resolve(__dirname, 'webgpu-motion-probe')
const reportPath = path.resolve(__dirname, '../sanye_deploy/.local/webgpu-motion/report.json')
const electron = path.resolve(__dirname, '../sanye_desktop/node_modules/electron/dist/electron.exe')

async function originReachable() {
  try { await fetch(origin, { signal: AbortSignal.timeout(4000) }); return true } catch { return false }
}

test('the WebGPU motion estimator recovers known motion within the per-frame budget', { timeout: 180000 }, async t => {
  if (!(await originReachable())) {
    t.skip(`无法连接前端服务 ${origin}；先启动 pnpm --filter @sanye/sanye_client dev`)
    return
  }
  assert.ok(fs.existsSync(electron), `Electron 二进制不存在：${electron}`)
  fs.rmSync(reportPath, { force: true })
  const result = spawnSync(electron, ['.'], { cwd: probe, env: { ...process.env, SANYE_WEBGPU_ORIGIN: origin }, timeout: 150000 })
  assert.ok(fs.existsSync(reportPath), `探针没有产出报告：${result.stderr?.toString() ?? ''}`)
  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(payload.status, 'passed', `探针执行失败：${payload.error ?? ''}`)
  const report = payload.report
  console.log('WEBGPU_MOTION ' + JSON.stringify({ supported: report.supported, identicalFrames: report.identicalFrames,
    measurement: report.measurement, timing: report.timing, worker: report.worker, flatRegions: report.flatRegions }))
  assert.deepEqual(report.errors, [], '探针不应记录错误')
  assert.equal(report.supported, true, 'WebGPU 设备必须可用（创建失败原因见 errors）')

  // 首帧没有可比较的前一帧：必须全零且标记场景切换，与 CPU 路径一致。
  assert.equal(report.firstFrameZero.confidenceMax, 0, '首帧置信度必须为 0')
  assert.equal(report.firstFrameZero.sceneCut, true, '首帧必须标记为场景切换')

  // 两帧完全相同的对照：正确解是 (0,0)，且必须高度可信。
  assert.ok(report.identicalFrames.confidentCells >= report.identicalFrames.totalCells * 0.9,
    `相同帧必须几乎全部可信：${report.identicalFrames.confidentCells}/${report.identicalFrames.totalCells}`)
  assert.ok(Math.abs(report.identicalFrames.medianForwardX) <= 0.5, `相同帧的 X 位移必须为 0，实际 ${report.identicalFrames.medianForwardX}`)
  assert.ok(Math.abs(report.identicalFrames.medianForwardY) <= 0.5, `相同帧的 Y 位移必须为 0，实际 ${report.identicalFrames.medianForwardY}`)

  // 已知整体平移：中位位移必须与真值一致（允许 1 像素取整误差）。
  const measurement = report.measurement
  assert.ok(measurement.confidentCells >= measurement.totalCells * 0.7,
    `已知平移下应有足够可信格点：${measurement.confidentCells}/${measurement.totalCells}`)
  assert.ok(Math.abs(measurement.medianForwardX - measurement.expectedX) <= 1,
    `X 位移必须还原真值：期望 ${measurement.expectedX}，实际 ${measurement.medianForwardX}`)
  assert.ok(Math.abs(measurement.medianForwardY - measurement.expectedY) <= 1,
    `Y 位移必须还原真值：期望 ${measurement.expectedY}，实际 ${measurement.medianForwardY}`)
  assert.ok(measurement.maxConfidence > 0.9, `已知平移必须给出高置信度，实际 ${measurement.maxConfidence}`)
  assert.ok(measurement.backwardConfident > 0, '反向场必须同时可用，否则往返一致性判据失效')

  // CPU 路径实测 14–20ms；GPU 路径必须留下明显余量（24 FPS 源的每帧预算是 41.67ms）。
  assert.ok(measurement.sceneCut === false, '已知平移不是场景切换')
  assert.ok(report.timing.medianMs < 10, `逐帧中位耗时应低于 10ms，实际 ${report.timing.medianMs}ms`)
  assert.ok(report.timing.p95Ms < 15, `逐帧 P95 耗时应低于 15ms，实际 ${report.timing.p95Ms}ms`)

  // 集成：真实光流线程必须选用 GPU 后端，且第二帧就要给出与真值一致的位移。
  assert.ok(report.worker, '必须返回光流线程的集成结果')
  assert.equal(report.worker.backend, 'webgpu', `光流线程应选用 WebGPU 后端，实际 ${report.worker.backend}（${report.worker.fallbackReason ?? '无回退原因'}）`)
  assert.deepEqual(report.worker.backends.slice(-1), ['webgpu'], `后端序列末尾必须是 WebGPU，实际 ${JSON.stringify(report.worker.backends)}`)
  assert.equal(report.worker.firstSceneCut, true, '线程中的首帧仍须标记场景切换')
  assert.ok(Math.abs(report.worker.summary.medianForwardX - report.worker.expectedX) <= 1,
    `线程输出的 X 位移必须还原真值 ${report.worker.expectedX}，实际 ${report.worker.summary.medianForwardX}`)
  assert.ok(Math.abs(report.worker.summary.medianForwardY - report.worker.expectedY) <= 1,
    `线程输出的 Y 位移必须还原真值 ${report.worker.expectedY}，实际 ${report.worker.summary.medianForwardY}`)

  // 关键回归：平坦/渐变区域必须仍然产出"可用"运动（两个方向置信度都不低于 0.15），
  // 否则渲染着色器会退回按相位硬切换原帧，用户看到整片背景来回跳。
  assert.ok(report.flatRegions, '必须返回平坦区域可用性度量')
  assert.ok(report.flatRegions.flatUsableShare >= 0.9,
    `平坦区域可用格点占比必须不低于 0.9，实际 ${report.flatRegions.flatUsableShare}`)
  assert.ok(report.flatRegions.usableShare >= 0.9,
    `整幅画面可用格点占比必须不低于 0.9，实际 ${report.flatRegions.usableShare}`)
})
