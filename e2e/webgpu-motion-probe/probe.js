/**
 * 在真实 Electron（带 dxcompiler.dll/dxil.dll）里验证 WebGPU 运动估计器。
 *
 * 该探针运行的浏览器上下文由 `main.cjs` 提供：隐藏窗口 + 本地 vite 来源（WebGPU 需要安全上下文）。
 * 它不创建可见窗口，也不启动本地服务。
 */
const WIDTH = 128
const HEIGHT = 72
/** 合成画面相对上一帧的整体位移（像素），用于给出已知答案的对照。 */
const SHIFT_X = 5
const SHIFT_Y = 2

/**
 * 逐像素确定性噪声，定义在整个整数域上。
 *
 * 块匹配需要**唯一**极小值：自相似或周期图案（以及少量随机小方块）会在多个偏移上给出相近代价，
 * 判读结果就没有意义。这里用逐像素噪声保证真值处才有唯一最小代价，从而能对"找到的位移是否等于
 * 已知位移"做严格断言；真实片源的观感由既有像素门禁负责。
 */
function noise(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/**
 * 生成"整体平移 (offsetX, offsetY)"的一帧：B(x,y)=P(x-offsetX, y-offsetY)。
 *
 * 纹理必须同时具备两种尺度，否则金字塔会失效：只有高频噪声时，降采样后的粗层不再相关，
 * 粗搜索等于随机取点；只有低频正弦时，平面内又会出现多个近似解。这里用互不成整数倍的
 * 低频正弦给出粗层唯一结构，再叠加逐像素细节让细层能把误差收敛到 1 像素以内。
 */
function pattern(x, y) {
  const coarse = 48 * Math.sin((x / 37.7) * Math.PI * 2) * Math.cos((y / 23.3) * Math.PI * 2)
    + 30 * Math.sin(((x + y) / 11.9) * Math.PI * 2)
  return Math.max(0, Math.min(255, 128 + coarse + 22 * noise(x, y)))
}

async function bitmap(offsetX, offsetY) {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT)
  const context = canvas.getContext('2d')
  const image = context.createImageData(WIDTH, HEIGHT)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const value = Math.round(pattern(x - offsetX, y - offsetY))
      const index = (y * WIDTH + x) * 4
      image.data[index] = value
      image.data[index + 1] = value
      image.data[index + 2] = value
      image.data[index + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return createImageBitmap(canvas)
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

export async function run() {
  const report = { supported: false, firstFrameZero: null, measurement: null, timing: null, errors: [] }
  // 探针以 blob 模块运行，相对路径无法解析，因此用页面来源拼绝对地址。
  const module = await import(`${location.origin}/src/video/webgpuMotionEstimator.ts`)
  const estimator = await module.WebGpuMotionEstimator.create()
  if (!estimator) {
    report.errors.push(`WebGpuMotionEstimator.create() 返回 null：${module.WebGpuMotionEstimator.lastError || '未记录原因'}`)
    return report
  }
  report.supported = true
  try {
    // 第一帧没有前一帧可比较：必须输出全零场，并标记为场景切换（与 CPU 路径一致）。
    const first = await estimator.estimate(await bitmap(0, 0))
    report.firstFrameZero = {
      confidenceMax: Math.max(...Array.from(first.data).filter((_, index) => index % 4 === 2)),
      sceneCut: first.sceneCut,
      columns: first.width,
      rows: first.height,
    }

    // 对照一：两帧完全相同。最优偏移必须是 0，残差必须接近 0，置信度必须接近 1；
    // 若这一项失败，说明问题在纹理/绑定等管线环节，而不是搜索质量。
    const identical = await estimator.estimate(await bitmap(0, 0))
    report.identicalFrames = summarize(identical)

    // 后续帧：画面整体平移 (SHIFT_X, SHIFT_Y)，正向位移应与之相符。
    const shifted = await estimator.estimate(await bitmap(SHIFT_X, SHIFT_Y))
    const forwardX = []
    const forwardY = []
    const confidences = []
    for (let index = 0; index < shifted.width * shifted.height; index++) {
      const confidence = shifted.data[index * 4 + 2]
      confidences.push(confidence)
      // 置信度就绪时位移已按置信度归一化，这里先还原再判读。
      if (confidence > 0) {
        forwardX.push(shifted.data[index * 4] / confidence * WIDTH)
        forwardY.push(shifted.data[index * 4 + 1] / confidence * HEIGHT)
      }
    }
    report.measurement = {
      columns: shifted.width,
      rows: shifted.height,
      confidentCells: forwardX.length,
      totalCells: shifted.width * shifted.height,
      medianForwardX: median(forwardX),
      medianForwardY: median(forwardY),
      // 分开统计"采信本格匹配"与"退回全局平移"两类格点，避免混合中位数掩盖真实分布。
      ...splitByConfidence(shifted),
      expectedX: SHIFT_X,
      expectedY: SHIFT_Y,
      maxConfidence: Math.max(...confidences),
      // 反向场同样要给出可用的位移，否则合成端的往返一致性判据会全部失效。
      backwardConfident: Array.from(shifted.backward).filter((_, index) => index % 4 === 2 && shifted.backward[index] > 0).length,
      sceneCut: shifted.sceneCut,
      motionMagnitudeMedian: median(forwardX.map((value, index) => Math.hypot(value, forwardY[index]))),
    }

    // 计时：连续若干帧的逐帧估计耗时，用于判断是否满足实时预算。
    const timings = []
    for (let index = 0; index < 24; index++) {
      const offset = (index % 2 === 0 ? SHIFT_X : -SHIFT_X) + SHIFT_X
      const frame = await bitmap(offset, SHIFT_Y)
      const started = performance.now()
      await estimator.estimate(frame)
      timings.push(performance.now() - started)
    }
    timings.sort((left, right) => left - right)
    report.timing = {
      samples: timings.length,
      medianMs: Math.round(timings[Math.floor(timings.length / 2)] * 100) / 100,
      p95Ms: Math.round(timings[Math.ceil(timings.length * 0.95) - 1] * 100) / 100,
      maxMs: Math.round(timings[timings.length - 1] * 100) / 100,
      width: WIDTH,
      height: HEIGHT,
    }

    // 集成检查：直接驱动真实的光流线程，确认接线后走的是 GPU 后端而不是静默回退。
    // 上面只验证了估计器本身，这一步才验证"Worker 真的用上了它"。
    report.worker = await runWorker()
    // 关键回归场景：动画背景常见的大面积平坦/渐变区域。这些区域匹配必然不唯一，
    // 修复前的实现会让它们以 0 置信度输出，渲染着色器随即退回"按相位硬切换两张原帧"，
    // 表现为整片背景来回跳（用户报告的「画面波动非常大」）。
    report.flatRegions = await runFlatRegions(estimator)
  } catch (error) {
    report.errors.push(error instanceof Error ? `${error.message}` : String(error))
  } finally {
    estimator.destroy()
  }
  return report
}

/** 按置信度把格点分成"采信匹配"（>=0.9）与"退回全局平移"（约 0.5）两类并分别统计位移。 */
function splitByConfidence(field) {
  const acceptedX = []
  const fallbackX = []
  let accepted = 0
  let fallback = 0
  for (let index = 0; index < field.width * field.height; index++) {
    const confidence = field.data[index * 4 + 2]
    const displacement = field.data[index * 4 + 1] / (confidence || 1) * HEIGHT
    void displacement
    const x = field.data[index * 4] / (confidence || 1) * WIDTH
    if (confidence >= 0.9) { accepted++; acceptedX.push(x) }
    else if (confidence > 0.3) { fallback++; fallbackX.push(x) }
  }
  return { acceptedCells: accepted, acceptedMedianX: median(acceptedX),
    fallbackCells: fallback, fallbackMedianX: median(fallbackX) }
}

/**
 * 平坦与渐变区域的可用性度量。
 *
 * 判据直接对齐渲染着色器：只有前向与反向置信度**都不低于 0.15**，着色器才会走 mix 的平滑路径；
 * 否则该格被当作"无可用运动"并硬切换原帧。因此这里报告的是"可用格点占比"。
 * 画面构成：左半平坦纯色、右上渐变、右下高频纹理，并整体平移 (SHIFT_X, SHIFT_Y)。
 */
async function runFlatRegions(estimator) {
  const width = 128
  const height = 72
  const build = async (offsetX, offsetY) => {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    const image = context.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 左半：平坦纯色（匹配完全无解）；右上：缓慢渐变（近似无解）；右下：高频纹理（唯一解）。
        let value = 120
        if (x >= width / 2 && y < height / 2) value = 128 + (x - width / 2)
        else if (x >= width / 2) value = Math.round(pattern(x - offsetX, y - offsetY))
        const index = (y * width + x) * 4
        image.data[index] = value
        image.data[index + 1] = value
        image.data[index + 2] = value
        image.data[index + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
    return createImageBitmap(canvas)
  }
  await estimator.estimate(await build(0, 0))
  const field = await estimator.estimate(await build(SHIFT_X, SHIFT_Y))
  const cells = field.width * field.height
  let usable = 0
  let flatUsable = 0
  let flatTotal = 0
  for (let index = 0; index < cells; index++) {
    const forward = field.data[index * 4 + 2]
    const backward = field.backward[index * 4 + 2]
    // 着色器的平滑路径要求两个方向都可用。
    const ok = forward >= 0.15 && backward >= 0.15
    if (ok) usable++
    const column = index % field.width
    if (column < field.width / 2) { flatTotal++; if (ok) flatUsable++ }
  }
  return { cells, usableCells: usable, usableShare: Math.round(usable / cells * 1000) / 1000,
    flatCells: flatTotal, flatUsableCells: flatUsable,
    flatUsableShare: flatTotal ? Math.round(flatUsable / flatTotal * 1000) / 1000 : null,
    columns: field.width, rows: field.height }
}

/**
 * 用真实 Worker 跑三帧，返回逐帧后端与最后一帧的运动场摘要。
 *
 * 需要三帧是设计使然：第 1 帧可能仍在探测设备（探测不阻塞帧），第 2 帧用于给 GPU 建立历史
 * （该帧仍交付 CPU 结果），第 3 帧起才由 GPU 出结果。这里把序列完整记录下来，而不是只看最后一项。
 */
async function runWorker() {
  // 显式请求 WebGPU 后端：默认已是 CPU（见 motionFlow.worker.ts 的后端选择说明）。
  const worker = new Worker(new URL(`${location.origin}/src/video/motionFlow.worker.ts?sanyeFlowBackend=webgpu`), { type: 'module' })
  const replies = []
  const waitFor = index => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Worker 第 ${index + 1} 帧无响应`)), 20000)
    const check = () => {
      if (replies.length > index) { clearTimeout(timer); resolve(replies[index]) }
      else setTimeout(check, 20)
    }
    check()
  })
  worker.onmessage = event => replies.push(event.data)
  try {
    // 设备探测不阻塞帧，且可能比前几帧更慢，因此持续发送直到后端切换（有上界）。
    // 画面在两个位置之间交替，使每一步的期望位移大小恒为 (SHIFT_X, SHIFT_Y)，符号随方向翻转。
    const limit = 40
    let index = 0
    while (index < limit && replies.at(-1)?.backend !== 'webgpu') {
      const forward = index % 2 === 0
      const [offsetX, offsetY] = forward ? [0, 0] : [SHIFT_X, SHIFT_Y]
      worker.postMessage({ bitmap: await bitmap(offsetX, offsetY), mediaTime: index / 30, generation: 0 })
      await waitFor(index)
      index++
    }
    const initial = replies[0]
    const moved = replies.at(-1)
    // 期望位移直接由最后两帧的偏移差得到，避免符号推导出错。
    const offsetOf = step => (step % 2 === 0 ? [0, 0] : [SHIFT_X, SHIFT_Y])
    const previousOffset = offsetOf(index - 2)
    const lastOffset = offsetOf(index - 1)
    return { backends: replies.map(reply => reply.backend ?? null),
      backend: moved.backend ?? null,
      fallbackReason: moved.fallbackReason ?? null,
      firstSceneCut: initial.field?.sceneCut ?? null,
      expectedX: lastOffset[0] - previousOffset[0],
      expectedY: lastOffset[1] - previousOffset[1],
      frames: replies.length,
      summary: moved.field ? summarize(moved.field) : null,
      computeMs: Math.round(moved.computeMs * 100) / 100 }
  } finally {
    worker.terminate()
  }
}

/** 把一帧运动场压缩成可判读的摘要：置信格数、位移中位数与最大置信度。 */
function summarize(field) {
  const forwardX = []
  const forwardY = []
  const confidences = []
  for (let index = 0; index < field.width * field.height; index++) {
    const confidence = field.data[index * 4 + 2]
    confidences.push(confidence)
    if (confidence > 0) {
      forwardX.push(field.data[index * 4] / confidence * WIDTH)
      forwardY.push(field.data[index * 4 + 1] / confidence * HEIGHT)
    }
  }
  return { columns: field.width, rows: field.height, totalCells: field.width * field.height,
    confidentCells: forwardX.length, maxConfidence: Math.max(...confidences),
    medianForwardX: median(forwardX), medianForwardY: median(forwardY), sceneCut: field.sceneCut }
}
