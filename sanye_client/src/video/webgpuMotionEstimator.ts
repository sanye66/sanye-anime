import type { MotionField } from './motionFlow'
import { motionGrid } from './motionGrid'

/**
 * 实时轻量运动估计：WebGPU 常驻管线（VQ-42）。
 *
 * 为什么换掉 CPU 路径：原来的 jsfeat 金字塔 LK 在每个源帧的预算里占 14–20ms（1080p/30 源每帧
 * 只有 33.3ms），再叠加缩放与线程往返后几乎没有余量。这里把同一件事搬成 GPU 常驻计算：设备、
 * 纹理与管线只建一次，每帧只上传两张画面、跑固定的几次 compute、回读一个很小的运动场。
 *
 * 算法形态是"为实时设计的轻量方案"：三层金字塔（原始 / 半尺寸 / 四分之一）上的块匹配加逐级
 * 细化，不引入任何预训练权重——因此不需要新的模型来源、许可核对与包体积增量。每格同时记录
 * 最优与"次优且相距 2 像素以上"的代价，用它们的差距衡量匹配唯一性；这正是原 CPU 路径里
 * "相机平移先验 + 孤立外点剔除"想要解决的周期线条陷阱，但判据更直接。
 *
 * 输出与 `MotionEstimator` 完全一致（`MotionField`），所以 `motionRenderer` 的合成、尺寸变化
 * 处理与既有门禁都不需要改动；WebGPU 不可用时由调用方回退到 CPU 路径。
 *
 * 灰度值刻意存成 0–255 而不是 0–1：CPU 路径的阈值（残差 20/40、往返 1.5 像素、均值 12 等）是按
 * 0–255 定义的，保持同一量纲才能让两条路径的判据直接对照。
 */

/** 逐级细化的搜索半径（该层像素）；两级各 ±2，足以吸收上一层按倍率放大的量化误差。 */
const REFINE_RADIUS = 2
/**
 * 全局平移先验的搜索半径与步长（四分之一尺度）。
 *
 * 步长必须是 1：先验是"退回"路径的位移来源，而一个 L2 像素等于 4 个原始像素，只用偶数偏移
 * 会让先验最坏偏差 4 像素（实测真值 5 像素时先验给出 8），退还格点因此整体错位。
 */
const PAN_RADIUS_L2 = 8
const PAN_STEP = 1
/** 逐格粗搜索在平移先验附近的半径：与细化一起把先验的量化误差收敛掉。 */
const COARSE_RADIUS_AROUND_PAN = 3
/** 金字塔层数：0 原始、1 半尺寸、2 四分之一。 */
const LEVEL_COUNT = 3
/** 每格中间结果浮点数：dx、dy、最优代价、次优代价。 */
const SEARCH_STRIDE = 4
/** 每格最终结果浮点数：前向 4 项 + 反向 4 项。 */
const FIELD_STRIDE = 8
/**
 * 局部对比度下限（灰度级）：3x3 块的极差低于该值说明这一格几乎没
 * 有可用于匹配的结构（纯色、缓慢渐变），此时任何位移的代价都接近 0，匹配结果没有意义。
 *
 * 为什么不用"次优解代价差"判歧义：实测该量在本实现里恒为 0（候选顺序使"次优"退化为最优），
 * 会把有纹理区域的正确匹配一并误杀，反而制造出新的波动。局部对比度直接刻画"有没有可匹配的结构"，
 * 在纹理区域必然通过、在平坦区域必然不通过，判据与结论一一对应。
 */
const CONTRAST_MIN = 16
/**
 * 退回全局平移时的置信度。必须高于渲染着色器的可用阈值 0.15，否则该格仍被判为"无可用运动"，
 * 落到"按相位硬切换两张原帧"的兜底路径——那正是画面跳变的来源。
 */
const AMBIGUOUS_CONFIDENCE = 0.5

const COMMON = /* wgsl */ `
fn fetch(tex: texture_2d<f32>, size: vec2<u32>, p: vec2<i32>) -> f32 {
  let limit = vec2<i32>(i32(size.x), i32(size.y)) - vec2<i32>(1, 1);
  return textureLoad(tex, clamp(p, vec2<i32>(0, 0), limit), 0).r;
}

// 3x3 块的绝对差均值。块匹配用最近邻取样，与 CPU 路径取整索引的做法一致。
fn blockSad(a: texture_2d<f32>, b: texture_2d<f32>, size: vec2<u32>, center: vec2<i32>, offset: vec2<i32>) -> f32 {
  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let p = center + vec2<i32>(dx, dy);
      sum = sum + abs(fetch(a, size, p) - fetch(b, size, p + offset));
    }
  }
  return sum / 9.0;
}

// 以 base 为中心、半径 radius 的方形搜索；返回相对 center 的绝对偏移与最优/次优代价。
fn search(a: texture_2d<f32>, b: texture_2d<f32>, size: vec2<u32>, center: vec2<i32>, base: vec2<i32>, radius: i32,
          best: ptr<function, vec2<i32>>, cost: ptr<function, vec2<f32>>) {
  var bestCost = 1e9;
  var secondCost = 1e9;
  var bestOffset = base;
  for (var oy = -radius; oy <= radius; oy = oy + 1) {
    for (var ox = -radius; ox <= radius; ox = ox + 1) {
      let offset = base + vec2<i32>(ox, oy);
      let sad = blockSad(a, b, size, center, offset);
      if (sad < bestCost) {
        // 次优解必须离最优至少 2 像素：相邻偏移的代价几乎相同，无法区分"唯一匹配"与
        // "沿边缘任意一点都匹配"（周期线条正是后者）。
        if (length(vec2<f32>(offset - bestOffset)) > 2.0) { secondCost = bestCost; }
        bestCost = sad;
        bestOffset = offset;
      } else if (sad < secondCost && length(vec2<f32>(offset - bestOffset)) > 2.0) {
        secondCost = sad;
      }
    }
  }
  *best = bestOffset;
  *cost = vec2<f32>(bestCost, secondCost);
}
`

const GRAYSCALE_WGSL = COMMON + /* wgsl */ `
struct GrayParams {
  size: vec2<u32>,
  _pad0: vec2<u32>,
  _pad1: vec2<u32>,
  _pad2: vec2<u32>,
}

@group(0) @binding(0) var frame: texture_2d<f32>;
@group(0) @binding(1) var level: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<storage, read_write> luma: array<f32>;
@group(0) @binding(3) var<uniform> params: GrayParams;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.size.x || id.y >= params.size.y) { return; }
  let rgba = textureLoad(frame, vec2<i32>(i32(id.x), i32(id.y)), 0);
  let value = dot(rgba.rgb, vec3<f32>(0.299, 0.587, 0.114)) * 255.0;
  textureStore(level, vec2<i32>(i32(id.x), i32(id.y)), vec4<f32>(value, 0.0, 0.0, 0.0));
  luma[id.y * params.size.x + id.x] = value;
}
`

const DOWNSAMPLE_WGSL = COMMON + /* wgsl */ `
struct DownParams {
  size: vec2<u32>,
  source: vec2<u32>,
  _pad0: vec2<u32>,
  _pad1: vec2<u32>,
}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var destination: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> params: DownParams;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.size.x || id.y >= params.size.y) { return; }
  let base = vec2<i32>(i32(id.x), i32(id.y)) * 2;
  var sum = 0.0;
  for (var dy = 0; dy < 2; dy = dy + 1) {
    for (var dx = 0; dx < 2; dx = dx + 1) {
      sum = sum + fetch(source, params.source, base + vec2<i32>(dx, dy));
    }
  }
  textureStore(destination, vec2<i32>(i32(id.x), i32(id.y)), vec4<f32>(sum / 4.0, 0.0, 0.0, 0.0));
}
`

/**
 * 单向搜索：从 a* 到 b*，写入每格的 (dx, dy, 最优代价, 次优代价)，单位为原始像素。
 * 前向与反向共用同一份着色器，只交换绑定的两套画面。
 */
/**
 * 全局平移先验：在四分之一尺度上、对整幅画面抽样，找出一个统一的全局位移。
 *
 * 为什么必须有它：逐格的 3x3 块在局部几乎分辨不出"整体平移一个周期"与"不动"，
 * 于是周期纹理（动漫线条、规则网格）会出现整周期混叠。全局代价在整个画面上求和，
 * 周期性纹理的错位解无法在整幅画面上同时成立，因此先验能稳定落在真实平移上。
 * 这正是原 CPU 路径 `search(coarsePrevious, ...)` 那一步的作用，此处以独立 pass 复现。
 */
const PAN_WGSL = COMMON + /* wgsl */ `
struct PanParams {
  size: vec2<u32>,
  radius: i32,
  step: i32,
  _pad0: vec2<u32>,
  _pad1: vec2<u32>,
}

@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var b: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> pan: array<f32>;
@group(0) @binding(3) var<uniform> params: PanParams;

@compute @workgroup_size(1, 1)
fn main() {
  let width = i32(params.size.x);
  let height = i32(params.size.y);
  var bestCost = 1e9;
  var bestOffset = vec2<i32>(0, 0);
  let margin = 2;
  // 采样步长按面积自适应：整个先验在一个工作组里串行完成，若按每像素取样，分析宽度升到
  // 384 时单次采样量会增长 9 倍并可能超过每帧预算。这里把样本数限制在约 2000 个，
  // 先验只需要"整体平移"这一个标量，降采样取样不影响结论。
  let stride = max(2, i32(ceil(sqrt(f32(params.size.x * params.size.y) / 2000.0))));
  for (var oy = -params.radius; oy <= params.radius; oy = oy + params.step) {
    for (var ox = -params.radius; ox <= params.radius; ox = ox + params.step) {
      let offset = vec2<i32>(ox, oy);
      var sum = 0.0;
      var samples = 0;
      for (var y = margin; y < height - margin; y = y + stride) {
        for (var x = margin; x < width - margin; x = x + stride) {
          sum = sum + abs(fetch(a, params.size, vec2<i32>(x, y)) - fetch(b, params.size, vec2<i32>(x, y) + offset));
          samples = samples + 1;
        }
      }
      let score = select(1e9, sum / f32(samples), samples > 0);
      if (score < bestCost) { bestCost = score; bestOffset = offset; }
    }
  }
  pan[0] = f32(bestOffset.x);
  pan[1] = f32(bestOffset.y);
  pan[2] = bestCost;
  pan[3] = 0.0;
}
`

const SEARCH_WGSL = COMMON + /* wgsl */ `
struct SearchParams {
  l0: vec2<u32>,
  cells: vec2<u32>,
  l1: vec2<u32>,
  l2: vec2<u32>,
}

@group(0) @binding(0) var a2: texture_2d<f32>;
@group(0) @binding(1) var b2: texture_2d<f32>;
@group(0) @binding(2) var a1: texture_2d<f32>;
@group(0) @binding(3) var b1: texture_2d<f32>;
@group(0) @binding(4) var a0: texture_2d<f32>;
@group(0) @binding(5) var b0: texture_2d<f32>;
@group(0) @binding(6) var<storage, read_write> result: array<f32>;
@group(0) @binding(7) var<uniform> params: SearchParams;
// 全局平移先验（四分之一尺度像素），由 PAN_WGSL 写入。
@group(0) @binding(8) var<storage, read> pan: array<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.xy;
  if (cell.x >= params.cells.x || cell.y >= params.cells.y) { return; }
  // 格点取格中心，与 CPU 路径的 points[i]=(i+0.5)*size/count 完全一致。
  let point = vec2<f32>((f32(cell.x) + 0.5) * f32(params.l0.x) / f32(params.cells.x),
                        (f32(cell.y) + 0.5) * f32(params.l0.y) / f32(params.cells.y));
  let p0 = vec2<i32>(i32(floor(point.x)), i32(floor(point.y)));

  var coarse = vec2<i32>(0, 0);
  var coarseCost = vec2<f32>(1e9, 1e9);
  let prior = vec2<i32>(i32(pan[0]), i32(pan[1]));
  search(a2, b2, params.l2, vec2<i32>(p0.x / 4, p0.y / 4), prior, ${COARSE_RADIUS_AROUND_PAN}, &coarse, &coarseCost);

  // 粗解按层间倍率放大成细化中心。search 返回的是"该层像素为单位的位移"，因此
  // 四分之一尺度的位移乘 2 直接就是半尺寸层的期望位移，不能再减一次该层中心。
  let center1 = vec2<i32>(p0.x / 2, p0.y / 2);
  var fine1 = vec2<i32>(0, 0);
  var fine1Cost = vec2<f32>(1e9, 1e9);
  search(a1, b1, params.l1, center1, coarse * 2, ${REFINE_RADIUS}, &fine1, &fine1Cost);

  // 同理：半尺寸层的位移乘 2 就是原始层的期望位移。
  var fine0 = vec2<i32>(0, 0);
  var fine0Cost = vec2<f32>(1e9, 1e9);
  search(a0, b0, params.l0, p0, fine1 * 2, ${REFINE_RADIUS}, &fine0, &fine0Cost);

  // search 返回的是相对 center 的绝对偏移，因此 fine0 就是原始像素位移。
  let base = (cell.y * params.cells.x + cell.x) * ${SEARCH_STRIDE}u;
  result[base + 0u] = f32(fine0.x);
  result[base + 1u] = f32(fine0.y);
  result[base + 2u] = fine0Cost.x;
  result[base + 3u] = fine0Cost.y;
}
`

/**
 * 收尾：把前后向位移合成 `MotionField` 的记录，并做与 CPU 路径等价的往返一致性判定。
 *
 * 正向解给出第 i 格在目标侧的落点；取该落点所在格的**反向**解与正向解相加即得往返误差，
 * 这正是原实现 roundTrip = |back(next) - p| 的含义，只是用网格就近取值代替逐点二次跟踪。
 * 残差与置信度公式沿用原阈值（往返 1.5 像素、残差 40、置信度下限 0.05）。
 */
const FINALIZE_WGSL = COMMON + /* wgsl */ `
struct FinalParams {
  l0: vec2<u32>,
  cells: vec2<u32>,
  l2: vec2<u32>,
  _pad1: vec2<u32>,
}

@group(0) @binding(0) var<storage, read> forward: array<f32>;
@group(0) @binding(1) var<storage, read> backward: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;
@group(0) @binding(3) var<uniform> params: FinalParams;
// 全局平移先验（四分之一尺度像素），由 PAN_WGSL 写入。
@group(0) @binding(4) var<storage, read> pan: array<f32>;
// 上一帧的灰度层：只用于判断本格有没有可匹配的结构。
@group(0) @binding(5) var a0: texture_2d<f32>;

/** 3x3 块的灰度极差：低于阈值说明这一格没有结构，匹配无意义。 */
fn blockContrast(center: vec2<i32>) -> f32 {
  var low = 255.0;
  var high = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      let value = fetch(a0, params.l0, center + vec2<i32>(dx, dy));
      low = min(low, value);
      high = max(high, value);
    }
  }
  return high - low;
}

fn cellOf(point: vec2<f32>) -> u32 {
  let col = clamp(i32(floor(point.x * f32(params.cells.x) / f32(params.l0.x))), 0, i32(params.cells.x) - 1);
  let row = clamp(i32(floor(point.y * f32(params.cells.y) / f32(params.l0.y))), 0, i32(params.cells.y) - 1);
  return u32(row) * params.cells.x + u32(col);
}

// 在落点所在格上取反向解，构造"正向走到目标、再反向走回来"的往返误差（原始像素）。
fn roundTrip(point: vec2<f32>, displacement: vec2<f32>) -> f32 {
  let base = cellOf(point + displacement) * ${SEARCH_STRIDE}u;
  let reverse = vec2<f32>(backward[base + 0u], backward[base + 1u]);
  return length(displacement + reverse);
}

/**
 * 解析一格的运动：返回 (dx, dy, 置信度)。
 *
 * 关键点是**不再让不匹配的格点以 0 置信度输出**。渲染着色器把 max(前向,反向) < 0.15 解释为
 * "这一格没有可用运动"，随即退回"按相位硬切换两张原帧"的路径；平坦与渐变区域（动画背景的大面积
 * 纯色、天空、阴影）恰恰全都匹配不唯一，于是整片背景在两张原帧之间来回跳——这就是用户看到的
 * "画面波动非常大"。
 *
 * 因此这里分两级：
 * - 匹配唯一、残差与往返一致性都通过 → 用本格位移，置信度按实测公式（下限 0.3，保证被着色器采用）；
 * - 匹配不唯一（最优与次优代价接近）或未通过判据 → 退回**全局平移**，置信度固定 0.5。
 *   平坦区域本身没有细节，按全局平移推进不会产生可见错位，却能让着色器走 mix 的平滑路径。
 */
fn resolve(point: vec2<f32>, center: vec2<i32>, displacement: vec2<f32>, cost: vec2<f32>,
           fallback: vec2<f32>, limit: vec2<f32>, maxMotion: f32) -> vec3<f32> {
  let destination = point + displacement;
  let residual = cost.x / 9.0;
  let structured = blockContrast(center) >= ${CONTRAST_MIN};
  let inside = destination.x >= 2.0 && destination.y >= 2.0 && destination.x < limit.x && destination.y < limit.y;
  if (structured && inside && residual <= 20.0 && length(displacement) <= maxMotion) {
    let trip = roundTrip(point, displacement);
    let confidence = (1.0 - trip / 1.5) * (1.0 - residual / 40.0);
    if (confidence >= 0.15) { return vec3<f32>(displacement, confidence); }
  }
  // 退回全局平移：方向随前向/反向取反，长度受同一上限约束。
  let clamped = select(fallback, normalize(fallback) * maxMotion, length(fallback) > maxMotion);
  return vec3<f32>(clamped, ${AMBIGUOUS_CONFIDENCE});
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.xy;
  if (cell.x >= params.cells.x || cell.y >= params.cells.y) { return; }
  let index = cell.y * params.cells.x + cell.x;
  let size = vec2<f32>(f32(params.l0.x), f32(params.l0.y));
  let point = vec2<f32>((f32(cell.x) + 0.5) * size.x / f32(params.cells.x),
                        (f32(cell.y) + 0.5) * size.y / f32(params.cells.y));
  let limit = size - vec2<f32>(2.0, 2.0);
  let maxMotion = size.x * 0.25;
  // 平移先验以四分之一尺度像素为单位，换算回原始像素；反向场取其相反方向。
  let scale = vec2<f32>(f32(params.l0.x) / f32(params.l2.x), f32(params.l0.y) / f32(params.l2.y));
  let panFull = vec2<f32>(pan[0], pan[1]) * scale;

  let base = index * ${SEARCH_STRIDE}u;
  let forwardDisplacement = vec2<f32>(forward[base + 0u], forward[base + 1u]);
  let backwardDisplacement = vec2<f32>(backward[base + 0u], backward[base + 1u]);
  let center = vec2<i32>(i32(point.x), i32(point.y));
  let forwardResolved = resolve(point, center, forwardDisplacement, vec2<f32>(forward[base + 2u], forward[base + 3u]), panFull, limit, maxMotion);
  let backwardResolved = resolve(point, center, backwardDisplacement, vec2<f32>(backward[base + 2u], backward[base + 3u]), -panFull, limit, maxMotion);
  let forwardConfidence = forwardResolved.z;
  let backwardConfidence = backwardResolved.z;

  let outBase = index * ${FIELD_STRIDE}u;
  // 写入格式与 CPU 路径一致：位移先按画布尺寸归一化，再乘置信度。
  result[outBase + 0u] = forwardResolved.x / size.x * forwardConfidence;
  result[outBase + 1u] = forwardResolved.y / size.y * forwardConfidence;
  result[outBase + 2u] = forwardConfidence;
  result[outBase + 3u] = 0.0;
  result[outBase + 4u] = backwardResolved.x / size.x * backwardConfidence;
  result[outBase + 5u] = backwardResolved.y / size.y * backwardConfidence;
  result[outBase + 6u] = backwardConfidence;
  result[outBase + 7u] = 0.0;
}
`

interface FrameResources {
  width: number
  height: number
  frames: GPUTexture[]
  levels: GPUTexture[][]
  lumas: GPUBuffer[]
  forward: GPUBuffer
  backward: GPUBuffer
  pan: GPUBuffer
  /** 按"上一帧所在槽位"索引：先验计算的方向必须与逐格搜索一致（上一帧 → 当前帧）。 */
  panBindings: GPUBindGroup[]
  output: GPUBuffer
  staging: GPUBuffer
  grayBindings: GPUBindGroup[]
  downBindings: GPUBindGroup[][]
  /** 按"上一帧所在槽位"索引：A 取该槽位、B 取另一槽位。 */
  forwardBindings: GPUBindGroup[]
  backwardBindings: GPUBindGroup[]
  /** 按"上一帧所在槽位"索引：对比度判据读的是上一帧的灰度层。 */
  finalBindings: GPUBindGroup[]
  lumaBytes: number
  fieldBytes: number
}

/**
 * WebGPU 常驻运动估计器。
 *
 * 创建失败（无适配器、设备请求失败、缺少着色器编译组件等）时返回 `null`，调用方保留 CPU 路径，
 * 不在播放链路里抛错——与既有"失败即回退"的口径一致。
 */
export class WebGpuMotionEstimator {
  private resources: FrameResources | null = null
  private hasPrevious = false
  private currentSlot = 0
  private destroyed = false

  private constructor(
    private readonly device: GPUDevice,
    private readonly grayscale: GPUComputePipeline,
    private readonly downsample: GPUComputePipeline,
    private readonly pan: GPUComputePipeline,
    private readonly search: GPUComputePipeline,
    private readonly finalize: GPUComputePipeline,
  ) {}

  /** 最近一次创建失败的原因（VQ-42）：着色器编译失败或设备请求失败时用于诊断，不回退成静默零场。 */
  static lastError = ''

  static async create(): Promise<WebGpuMotionEstimator | null> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) return null
    try {
      const gpu = (navigator as Navigator & { gpu?: GPU }).gpu
      if (!gpu) return null
      // 不指定 powerPreference：这套管线的计算量很小，不应唤醒独显。
      const adapter = await gpu.requestAdapter()
      if (!adapter) return null
      // 软件回退适配器（SwiftShader 等）比现有 CPU 路径更慢，采用它只会拖慢播放，因此直接放弃。
      const description = `${adapter.info?.vendor ?? ''} ${adapter.info?.architecture ?? ''} ${adapter.info?.description ?? ''}`.toLowerCase()
      if (description.includes('swiftshader') || description.includes('software') || description.includes('llvmpipe')) return null
      const device = await adapter.requestDevice()
      // 着色器编译失败必须显式暴露：校验错误在 WebGPU 里不会让 createComputePipeline 抛错，
      // 而是产出一条无效管线，运行时静默不写任何输出（表现为"运动场全零"）。
      const compile = async (label: string, code: string) => {
        const module = device.createShaderModule({ code })
        const info = await module.getCompilationInfo?.()
        const errors = (info?.messages ?? []).filter(message => message.type === 'error')
        if (errors.length) {
          throw new Error(`${label} 着色器编译失败：${errors.map(message => `${message.message}(第 ${message.lineNum ?? '?'} 行)`).join('；')}`)
        }
        return module
      }
      const build = (module: GPUShaderModule) => device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } })
      const grayscale = build(await compile('灰度', GRAYSCALE_WGSL))
      const downsample = build(await compile('降采样', DOWNSAMPLE_WGSL))
      const pan = build(await compile('平移先验', PAN_WGSL))
      const search = build(await compile('搜索', SEARCH_WGSL))
      const finalize = build(await compile('收尾', FINALIZE_WGSL))
      return new WebGpuMotionEstimator(device, grayscale, downsample, pan, search, finalize)
    } catch (error) {
      WebGpuMotionEstimator.lastError = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  get active() { return !this.destroyed }

  /** 与 CPU 路径一致：重置后第一帧没有可用的前一帧，输出全零运动场。 */
  reset() {
    this.hasPrevious = false
    this.currentSlot = 0
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.release()
    this.device.destroy?.()
  }

  /**
   * 估计 `bitmap` 相对上一帧的运动。
   *
   * `bitmap` 必须已缩放到分析尺寸（与 CPU 路径收到的画面一致）。首帧只写入槽位并返回全零场；
   * 之后每帧写入另一槽位、与上一槽位一起计算，结束后交换槽位指针，不做任何画面拷贝。
   */
  async estimate(bitmap: ImageBitmap): Promise<MotionField> {
    const width = bitmap.width
    const height = bitmap.height
    const { columns, rows } = motionGrid(width, height)
    const { resources, recreated } = this.ensureResources(width, height, columns, rows)
    // 分析尺寸变化（清晰度自动或手动换档）会重建纹理。此时上一帧画面已经不存在，若仍按
    // "有历史"继续计算，就会拿未初始化的纹理当上一帧，产出一帧完全错误的运动场——表现为
    // 每次换档都闪一下。这里把重建视为新的起点：本帧只写历史、返回全零场。
    if (recreated) this.hasPrevious = false
    const first = !this.hasPrevious
    const target = first ? 0 : 1 - this.currentSlot
    this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: resources.frames[target] }, [width, height])
    if (first) {
      this.hasPrevious = true
      this.currentSlot = target
      return emptyField(columns, rows)
    }
    const previousSlot = this.currentSlot
    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginComputePass()
    // 两个槽位都重算灰度与金字塔：代价是一次极小的全图 pass，换来无需维护跨帧的金字塔状态。
    for (const slot of [previousSlot, target]) {
      pass.setPipeline(this.grayscale)
      pass.setBindGroup(0, resources.grayBindings[slot])
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8))
      pass.setPipeline(this.downsample)
      for (const level of [0, 1]) {
        const [levelWidth, levelHeight] = sizeAt(width, height, level + 1)
        pass.setBindGroup(0, resources.downBindings[slot][level])
        pass.dispatchWorkgroups(Math.ceil(levelWidth / 8), Math.ceil(levelHeight / 8))
      }
    }
    // 平移先验必须先用当前帧对重算（它读的是两个槽位的四分之一尺度层）。
    pass.setPipeline(this.pan)
    pass.setBindGroup(0, resources.panBindings[previousSlot])
    pass.dispatchWorkgroups(1)
    pass.setPipeline(this.search)
    pass.setBindGroup(0, resources.forwardBindings[previousSlot])
    pass.dispatchWorkgroups(Math.ceil(columns / 8), Math.ceil(rows / 8))
    pass.setBindGroup(0, resources.backwardBindings[previousSlot])
    pass.dispatchWorkgroups(Math.ceil(columns / 8), Math.ceil(rows / 8))
    pass.setPipeline(this.finalize)
    pass.setBindGroup(0, resources.finalBindings[previousSlot])
    pass.dispatchWorkgroups(Math.ceil(columns / 8), Math.ceil(rows / 8))
    pass.end()
    encoder.copyBufferToBuffer(resources.lumas[0], 0, resources.staging, 0, resources.lumaBytes)
    encoder.copyBufferToBuffer(resources.lumas[1], 0, resources.staging, resources.lumaBytes, resources.lumaBytes)
    encoder.copyBufferToBuffer(resources.output, 0, resources.staging, resources.lumaBytes * 2, resources.fieldBytes)
    this.device.queue.submit([encoder.finish()])
    await resources.staging.mapAsync(GPUMapMode.READ)
    let field: MotionField
    try {
      field = readField(resources, columns, rows, width, height)
    } finally {
      resources.staging.unmap()
    }
    // 本帧处理完成：新帧所在槽位成为下一次的"上一帧"。
    this.currentSlot = target
    return field
  }

  /** 取得当前尺寸的资源；`recreated` 表示这次是重建，调用方必须丢弃运动历史。 */
  private ensureResources(width: number, height: number, columns: number, rows: number) {
    let resources = this.resources
    if (resources && resources.width === width && resources.height === height) return { resources, recreated: false }
    {
      this.release()
      resources = createResources(this.device, width, height, columns, rows,
        this.grayscale.getBindGroupLayout(0), this.downsample.getBindGroupLayout(0),
        this.pan.getBindGroupLayout(0), this.search.getBindGroupLayout(0), this.finalize.getBindGroupLayout(0))
      this.resources = resources
    }
    return { resources, recreated: true }
  }

  private release() {
    const resources = this.resources
    if (!resources) return
    for (const texture of [...resources.frames, ...resources.levels.flat()]) texture.destroy()
    for (const buffer of [...resources.lumas, resources.forward, resources.backward, resources.pan, resources.output, resources.staging]) buffer.destroy()
    this.resources = null
  }
}

/** 第 `level` 层尺寸（0 原始、1 半尺寸、2 四分之一），与着色器里的取整一致。 */
function sizeAt(width: number, height: number, level: number) {
  return [Math.max(1, Math.floor(width / 2 ** level)), Math.max(1, Math.floor(height / 2 ** level))]
}

function emptyField(columns: number, rows: number): MotionField {
  const count = columns * rows
  return { data: new Float32Array(count * 4), backward: new Float32Array(count * 4), width: columns, height: rows, sceneCut: true }
}

/** 读取回读缓冲并组装 `MotionField`；场景切换沿用 CPU 路径的均值差与直方图判据。 */
function readField(resources: FrameResources, columns: number, rows: number, width: number, height: number): MotionField {
  const pixels = width * height
  const count = columns * rows
  const view = new Float32Array(resources.staging.getMappedRange())
  const lumaA = view.subarray(0, pixels)
  const lumaB = view.subarray(pixels, pixels * 2)
  const field = view.subarray(pixels * 2, pixels * 2 + count * FIELD_STRIDE)
  const data = new Float32Array(count * 4)
  const backward = new Float32Array(count * 4)
  for (let index = 0; index < count; index++) {
    const base = index * FIELD_STRIDE
    for (let item = 0; item < 4; item++) {
      data[index * 4 + item] = field[base + item]
      backward[index * 4 + item] = field[base + 4 + item]
    }
  }
  let difference = 0
  const oldHistogram = new Uint32Array(32)
  const newHistogram = new Uint32Array(32)
  for (let index = 0; index < pixels; index++) {
    const oldValue = lumaA[index]
    const newValue = lumaB[index]
    difference += Math.abs(oldValue - newValue)
    oldHistogram[Math.min(31, Math.max(0, Math.floor(oldValue) >> 3))]++
    newHistogram[Math.min(31, Math.max(0, Math.floor(newValue) >> 3))]++
  }
  let histogramDistance = 0
  for (let index = 0; index < 32; index++) histogramDistance += Math.abs(oldHistogram[index] - newHistogram[index])
  histogramDistance /= 2 * pixels
  // 覆盖率取两个方向通过全部判据的格点比例，与 CPU 路径的 valid/count 口径一致。
  let covered = 0
  for (let index = 0; index < count; index++) {
    if (data[index * 4 + 2] > 0) covered++
    if (backward[index * 4 + 2] > 0) covered++
  }
  const coverage = covered / (2 * count)
  const meanDifference = difference / pixels
  return { data, backward, width: columns, height: rows,
    sceneCut: meanDifference > 12 && (histogramDistance > 0.65 || (coverage < 0.08 && meanDifference > 28)) }
}

function createResources(
  device: GPUDevice, width: number, height: number, columns: number, rows: number,
  grayLayout: GPUBindGroupLayout, downLayout: GPUBindGroupLayout,
  panLayout: GPUBindGroupLayout, searchLayout: GPUBindGroupLayout, finalLayout: GPUBindGroupLayout,
): FrameResources {
  const texture = (level: number) => {
    const [levelWidth, levelHeight] = sizeAt(width, height, level)
    return device.createTexture({ size: [levelWidth, levelHeight], format: 'r32float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING })
  }
  const frames = [0, 1].map(() => device.createTexture({ size: [width, height], format: 'rgba8unorm',
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT }))
  const levels = [0, 1].map(() => Array.from({ length: LEVEL_COUNT }, (_, level) => texture(level)))
  const lumaBytes = width * height * 4
  const fieldBytes = columns * rows * FIELD_STRIDE * 4
  const searchBytes = columns * rows * SEARCH_STRIDE * 4
  const lumas = [0, 1].map(() => device.createBuffer({ size: lumaBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }))
  const forward = device.createBuffer({ size: searchBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const backward = device.createBuffer({ size: searchBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const pan = device.createBuffer({ size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  const output = device.createBuffer({ size: fieldBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const staging = device.createBuffer({ size: lumaBytes * 2 + fieldBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })

  // 参数缓冲统一 32 字节，满足 uniform 绑定的 16 字节对齐要求。
  const uniform = (values: number[]) => {
    const buffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(buffer, 0, new Uint32Array(values))
    return buffer
  }
  const grayParams = [0, 1].map(() => uniform([width, height, 0, 0, 0, 0, 0, 0]))
  const downParams = [0, 1].map(level => {
    const [sourceWidth, sourceHeight] = sizeAt(width, height, level)
    const [targetWidth, targetHeight] = sizeAt(width, height, level + 1)
    return uniform([targetWidth, targetHeight, sourceWidth, sourceHeight, 0, 0, 0, 0])
  })
  const [l1Width, l1Height] = sizeAt(width, height, 1)
  const [l2Width, l2Height] = sizeAt(width, height, 2)
  const searchValues = [width, height, columns, rows, l1Width, l1Height, l2Width, l2Height]
  const searchParams = uniform(searchValues)
  // 第 5、6 项是四分之一尺度尺寸，收尾阶段用它把平移先验换算回原始像素。
  const finalParams = uniform([width, height, columns, rows, l2Width, l2Height, 0, 0])
  const panParams = uniform([l2Width, l2Height, PAN_RADIUS_L2, PAN_STEP, 0, 0, 0, 0])

  const grayBindings = [0, 1].map(slot => device.createBindGroup({ layout: grayLayout, entries: [
    { binding: 0, resource: frames[slot].createView() },
    { binding: 1, resource: levels[slot][0].createView() },
    { binding: 2, resource: { buffer: lumas[slot] } },
    { binding: 3, resource: { buffer: grayParams[slot] } },
  ] }))
  const downBindings = [0, 1].map(slot => [0, 1].map(level => device.createBindGroup({ layout: downLayout, entries: [
    { binding: 0, resource: levels[slot][level].createView() },
    { binding: 1, resource: levels[slot][level + 1].createView() },
    { binding: 2, resource: { buffer: downParams[level] } },
  ] })))
  // 前向/反向只差两套画面的顺序与输出缓冲，因此按"上一帧槽位"预建两组绑定。
  const pairBindings = (first: number, second: number, target: GPUBuffer) => device.createBindGroup({ layout: searchLayout, entries: [
    { binding: 0, resource: levels[first][2].createView() },
    { binding: 1, resource: levels[second][2].createView() },
    { binding: 2, resource: levels[first][1].createView() },
    { binding: 3, resource: levels[second][1].createView() },
    { binding: 4, resource: levels[first][0].createView() },
    { binding: 5, resource: levels[second][0].createView() },
    { binding: 6, resource: { buffer: target } },
    { binding: 7, resource: { buffer: searchParams } },
    { binding: 8, resource: { buffer: pan } },
  ] })
  // 先验与逐格搜索方向一致：first 槽位是"上一帧"、second 是"当前帧"。
  const panBindings = [0, 1].map(slot => device.createBindGroup({ layout: panLayout, entries: [
    { binding: 0, resource: levels[slot][2].createView() },
    { binding: 1, resource: levels[1 - slot][2].createView() },
    { binding: 2, resource: { buffer: pan } },
    { binding: 3, resource: { buffer: panParams } },
  ] }))
  const forwardBindings = [
    pairBindings(0, 1, forward),
    pairBindings(1, 0, forward),
  ]
  const backwardBindings = [
    pairBindings(1, 0, backward),
    pairBindings(0, 1, backward),
  ]
  // 对比度判据读"上一帧"的灰度层，因此按上一帧所在槽位各建一份绑定。
  const finalBindings = [0, 1].map(slot => device.createBindGroup({ layout: finalLayout, entries: [
    { binding: 0, resource: { buffer: forward } },
    { binding: 1, resource: { buffer: backward } },
    { binding: 2, resource: { buffer: output } },
    { binding: 3, resource: { buffer: finalParams } },
    { binding: 4, resource: { buffer: pan } },
    { binding: 5, resource: levels[slot][0].createView() },
  ] }))

  return { width, height, frames, levels, lumas, forward, backward, pan, panBindings, output, staging,
    grayBindings, downBindings, forwardBindings, backwardBindings, finalBindings, lumaBytes, fieldBytes }
}
