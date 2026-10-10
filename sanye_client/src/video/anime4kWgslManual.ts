/**
 * Anime4K 里不适合机械转译的两段，手写成 WGSL（VQ-57）。
 *
 * 为什么手写：
 * - Clamp_Highlights 用循环取邻域亮度极值，并跨三趟传递中间结果（STATSMAX），不是规则卷积模板；
 * - Upscale_CNN_x2_S 的收尾趟要按运行时子像素序号挑通道（GLSL 是 if/else 链 + 动态下标），
 *   WGSL 不允许动态下标 vec4，因此改写成显式比较。
 *
 * 两段与生成段落共用同一份 48 字节 uniform 布局和同一套绑定（0 主输入、1 最近邻采样器、
 * 2 uniform、3 次输入、4 线性采样器），因此运行时不区分段落来源。
 */
const HEADER = `struct Params { resolution: vec2f, texel: vec2f, sourceSize: vec2f, pad0: vec2f, pad1: vec2f, pad2: vec2f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var secondary: texture_2d<f32>;
@group(0) @binding(4) var secondarySampler: sampler;

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}
`


/** Clamp_Highlights 趟 0：横向 5 邻域亮度极大值，写入 STATSMAX 的中间结果。 */
export const ANIME4K_WGSL_CLAMP_STATS_HORIZONTAL = `struct Params { resolution: vec2f, texel: vec2f, sourceSize: vec2f, pad0: vec2f, pad1: vec2f, pad2: vec2f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var secondary: texture_2d<f32>;
@group(0) @binding(4) var secondarySampler: sampler;

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

fn luma(rgba: vec4f) -> f32 { return dot(vec4f(0.299, 0.587, 0.114, 0.0), rgba); }

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / params.resolution;
  var gmax = 0.0;
  for (var i = 0; i < 5; i = i + 1) {
    let g = luma(textureSampleLevel(source, sourceSampler, uv + params.texel * vec2f(f32(i) - 2.0, 0.0), 0.0));
    gmax = max(g, gmax);
  }
  return vec4f(gmax, 0.0, 0.0, 0.0);
}
`

/** Clamp_Highlights 趟 1：在趟 0 的结果上取纵向 5 邻域极大值。 */
export const ANIME4K_WGSL_CLAMP_STATS_VERTICAL = `struct Params { resolution: vec2f, texel: vec2f, sourceSize: vec2f, pad0: vec2f, pad1: vec2f, pad2: vec2f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var secondary: texture_2d<f32>;
@group(0) @binding(4) var secondarySampler: sampler;

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / params.resolution;
  var gmax = 0.0;
  for (var i = 0; i < 5; i = i + 1) {
    let g = textureSampleLevel(source, sourceSampler, uv + params.texel * vec2f(0.0, f32(i) - 2.0), 0.0).x;
    gmax = max(g, gmax);
  }
  return vec4f(gmax, 0.0, 0.0, 0.0);
}
`

/** Clamp_Highlights 趟 2：按邻域极大值压回高光，保持色相。 */
export const ANIME4K_WGSL_CLAMP_HIGHLIGHTS = `struct Params { resolution: vec2f, texel: vec2f, sourceSize: vec2f, pad0: vec2f, pad1: vec2f, pad2: vec2f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var secondary: texture_2d<f32>;
@group(0) @binding(4) var secondarySampler: sampler;

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

fn luma(rgba: vec4f) -> f32 { return dot(vec4f(0.299, 0.587, 0.114, 0.0), rgba); }

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / params.resolution;
  let current = textureSampleLevel(source, sourceSampler, uv, 0.0);
  let currentLuma = luma(current);
  let newLuma = min(currentLuma, textureSampleLevel(secondary, secondarySampler, uv, 0.0).x);
  return vec4f(current.rgb - vec3f(currentLuma - newLuma), 1.0);
}
`

/** Upscale_CNN_x2_S 收尾趟：按子像素序号取通道并叠加原始画面（2× 输出）。 */
export const ANIME4K_WGSL_UPSCALE_X2_TAIL = `struct Params { resolution: vec2f, texel: vec2f, sourceSize: vec2f, pad0: vec2f, pad1: vec2f, pad2: vec2f }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var secondary: texture_2d<f32>;
@group(0) @binding(4) var secondarySampler: sampler;

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let x = f32((index << 1u) & 2u);
  let y = f32(index & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = position.xy / params.resolution;
  let f0 = fract(uv * params.sourceSize);
  let channels = textureSampleLevel(source, sourceSampler, uv + (vec2f(0.5) - f0) * params.texel, 0.0);
  let index = i32(floor(f0.y * 2.0)) * 2 + i32(floor(f0.x * 2.0));
  var c0 = channels.x;
  if (index == 1) { c0 = channels.y; } else if (index == 2) { c0 = channels.z; } else if (index == 3) { c0 = channels.w; }
  return vec4f(c0, c0, c0, 0.0) + textureSampleLevel(secondary, secondarySampler, uv, 0.0);
}
`

/** Clamp_Highlights 的三趟，顺序与 anime4k.js 中的 program_0..2 一致。 */
export const ANIME4K_WGSL_CLAMP_PASSES = [ANIME4K_WGSL_CLAMP_STATS_HORIZONTAL, ANIME4K_WGSL_CLAMP_STATS_VERTICAL, ANIME4K_WGSL_CLAMP_HIGHLIGHTS] as const
