import { MotionEstimator } from './motionFlow'
import { WebGpuMotionEstimator } from './webgpuMotionEstimator'
import type { MotionField } from './motionFlow'

/**
 * 运动估计线程（VQ-42）。
 *
 * 优先使用 WebGPU 常驻管线；不可用（没有适配器、设备请求失败、缺少着色器编译组件）时回退到
 * 原有的 jsfeat CPU 路径。两条路径产出同一格式的 `MotionField`，因此下游合成与门禁不变。
 *
 * 帧必须按到达顺序处理：GPU 路径是异步的，若允许并发就会让后一帧先返回，帧窗口随之错序。
 * 这里用一条 promise 链串行化，保证顺序与 CPU 路径完全一致。
 */
const cpu = new MotionEstimator()
let gpu: WebGpuMotionEstimator | null = null

/**
 * 运动估计后端选择（VQ-45）。
 *
 * 读取顺序：Worker URL 的 `sanyeFlowBackend` 查询参数（供门禁与现场排查指定）→ 构建期
 * `VITE_FLOW_BACKEND` → 默认 `cpu`。
 *
 * VQ-47 起页面还可以在运行期请求后端（安卓默认先试 GPU）：`requestBackend` 只把初始后端切到
 * `webgpu` 并开始探测，设备不支持时逐帧判定自动落到 CPU，不需要页面分支或重建线程。
 *
 * 为什么默认是 CPU：WebGPU 路径在平坦与渐变区域曾把整片背景交给"按相位硬切换两张原帧"的兜底
 * 路径，用户实测为「画面波动非常大」。修正后它按全局平移平滑推进，但**真实片源下的观感尚未取得
 * 证据**（无头 Chromium 没有 WebGPU，只能在真实 Electron 里验证）。因此默认用已知平滑的 CPU
 * 路径，WebGPU 作为显式可选加速；取得真实片源对照数据后再决定是否改默认。
 */
type FlowBackend = 'cpu' | 'webgpu'
function selectBackend(): FlowBackend {
  let requested = ''
  try { requested = new URL(self.location.href).searchParams.get('sanyeFlowBackend') ?? '' } catch {}
  if (!requested) requested = (import.meta.env.VITE_FLOW_BACKEND as string | undefined) ?? ''
  return requested.toLowerCase() === 'webgpu' ? 'webgpu' : 'cpu'
}
let flowBackend: FlowBackend = selectBackend()

/**
 * 设备探测：构建期/查询参数选中 WebGPU，或页面在运行期请求 GPU 后端时发起。
 * **任何一帧都不会等待它**：设备请求在部分环境（软件回退适配器、驱动初始化）可能要几百毫秒，
 * 若让首帧等它，补间层会因为内容停止推进超过回退阈值而整层收起。
 */
let gpuProbe: Promise<void> | null = null
function primeGpuBackend() {
  if (flowBackend !== 'webgpu' || gpuProbe) return
  gpuProbe = (async () => { try { gpu = await WebGpuMotionEstimator.create() } catch { gpu = null } })()
}
/**
 * 页面运行期请求后端（安卓默认尝试 GPU 加速）。只切换初始后端并开始探测：
 * 设备没有硬件适配器、着色器编译失败或运行期设备丢失时，下面的逐帧判定会自动落到 CPU，
 * 不需要页面重建线程，也不需要额外分支。
 */
function requestBackend(next: FlowBackend) {
  if (next !== 'webgpu' || flowBackend === 'webgpu') return
  flowBackend = 'webgpu'
  primeGpuBackend()
}
primeGpuBackend()
/** GPU 是否已经接收过画面；首次启用前需要先喂一帧建立历史，否则会返回"首帧全零 + 场景切换"。 */
let gpuPrimed = false
let generation = -1
let chain: Promise<void> = Promise.resolve()

interface FrameRequest {
  bitmap: ImageBitmap
  mediaTime: number
  generation: number
  sentAt?: number
}

/** 页面运行期请求运动估计后端（安卓默认尝试 GPU），不携带帧。 */
interface BackendCommand {
  type: 'backend'
  backend: FlowBackend
}

async function process(frame: FrameRequest) {
  const receivedAt = frame.sentAt ? performance.now() : 0
  try {
    if (frame.generation !== generation) {
      cpu.reset()
      gpu?.reset()
      gpuPrimed = false
      generation = frame.generation
    }
    const start = performance.now()
    const analysisStarted = frame.sentAt ? performance.now() : 0
    let field: MotionField
    let backend: 'webgpu' | 'jsfeat'
    if (gpu && !gpuPrimed) {
      // 刚切到 GPU：先让 GPU 建立历史（该次返回值丢弃），本帧仍交付 CPU 结果。
      // 这样切换瞬间不会出现"全零运动场 + 场景切换"造成的可见回退。
      await gpu.estimate(frame.bitmap)
      gpuPrimed = true
      field = cpu.estimate(readPixels(frame.bitmap), frame.bitmap.width, frame.bitmap.height)
      backend = 'jsfeat'
    } else if (gpu) {
      field = await gpu.estimate(frame.bitmap)
      backend = 'webgpu'
    } else {
      field = cpu.estimate(readPixels(frame.bitmap), frame.bitmap.width, frame.bitmap.height)
      backend = 'jsfeat'
    }
    const computeMs = performance.now() - start
    self.postMessage({ mediaTime: frame.mediaTime, generation: frame.generation, field, computeMs,
      backend,
      flowQueueMs: frame.sentAt ? Math.max(0, receivedAt - (frame.sentAt - performance.timeOrigin)) : null,
      analysisMs: frame.sentAt ? performance.now() - analysisStarted : null, sentAt: frame.sentAt },
      { transfer: field.backward ? [field.data.buffer, field.backward.buffer] : [field.data.buffer] })
  } catch (error) {
    // GPU 路径一旦在运行期失败就退回 CPU，避免一次设备丢失让整段播放失去补帧。
    if (gpu) {
      gpu.destroy()
      gpu = null
      try { await retryOnCpu(frame) } catch (retryError) { report(retryError, frame) }
      return
    }
    report(error, frame)
  } finally {
    frame.bitmap.close()
  }
}

async function retryOnCpu(frame: FrameRequest) {
  const start = performance.now()
  const field = cpu.estimate(readPixels(frame.bitmap), frame.bitmap.width, frame.bitmap.height)
  self.postMessage({ mediaTime: frame.mediaTime, generation: frame.generation, field, computeMs: performance.now() - start,
    backend: 'jsfeat', fallbackReason: 'WebGPU 运行期失败，已回退 CPU 光流',
    flowQueueMs: null, analysisMs: null, sentAt: frame.sentAt },
    { transfer: field.backward ? [field.data.buffer, field.backward.buffer] : [field.data.buffer] })
}

function report(error: unknown, frame: FrameRequest) {
  self.postMessage({ error: error instanceof Error ? error.message : '光流计算失败', generation: frame.generation })
}

/**
 * CPU 路径需要 `Uint8ClampedArray`；GPU 路径直接消费位图，因此只在回退时读取。
 * 画布按尺寸复用：回退路径仍要跑满帧率，每帧新建画布会额外增加分配开销。
 */
let readback: OffscreenCanvas | null = null
function readPixels(bitmap: ImageBitmap): Uint8ClampedArray {
  if (!readback || readback.width !== bitmap.width || readback.height !== bitmap.height) {
    readback = new OffscreenCanvas(bitmap.width, bitmap.height)
  }
  const context = readback.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height)
  return context.getImageData(0, 0, bitmap.width, bitmap.height).data
}

self.onmessage = (event: MessageEvent<FrameRequest | BackendCommand>) => {
  const message = event.data
  if (isBackendCommand(message)) { requestBackend(message.backend); return }
  // 串行化：后一帧必须等前一帧处理完，避免异步返回顺序与采集顺序不一致。
  chain = chain.then(() => process(message)).catch(() => {})
}

function isBackendCommand(message: FrameRequest | BackendCommand): message is BackendCommand {
  return (message as BackendCommand).type === 'backend'
}
