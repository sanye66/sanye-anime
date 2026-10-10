import type { Anime4KProfile } from './anime4k'
import { ANIME4K_WGSL_CONV } from './anime4kWgsl.generated'
import { ANIME4K_WGSL_CLAMP_PASSES, ANIME4K_WGSL_UPSCALE_X2_TAIL } from './anime4kWgslManual'

/**
 * Anime4K 档位在 WebGPU 上的执行计划（VQ-57）。
 *
 * 一段 = 一个片元趟：读主输入（上一趟或原始帧）、可选的次输入（该着色器的外部输入，
 * 收尾趟用它做残差）与输出倍率。字段与 anime4k.js 的 program 编号一一对应，因此
 * 「同一档位在 GL 与 WebGPU 上跑的是同一串趟、同一份权重」这件事是可复核的。
 */
export interface Anime4kWebgpuPass {
  readonly code: string
  readonly primary: 'input' | number
  readonly secondary: 'input' | number | null
  /** 输出尺寸相对原始帧的倍率：只有上采样收尾趟是 2。 */
  readonly scale: number
}

export interface Anime4kWebgpuPlan {
  readonly profile: Anime4KProfile
  readonly passes: readonly Anime4kWebgpuPass[]
  readonly scale: number
}

/**
 * Clamp_Highlights 的三趟接在 `external` 之后，并返回链尾序号。
 *
 * 原链路的执行顺序是「先 MAIN 链、再 PREKERNEL 链」：`Restore_CNN_S` 与 `Upscale_CNN_x2_S` 的
 * `hook_PREKERNEL` 是空实现，而 `Clamp_Highlights` 的 `hook_PREKERNEL` 会真的再跑三趟，
 * 因此可见结果是 clamp(restore(clamp(输入)))——末尾这次 clamp 不能省。
 */
function appendClamp(passes: Anime4kWebgpuPass[], external: 'input' | number, scale: number): number {
  const first = passes.length
  passes.push({ code: ANIME4K_WGSL_CLAMP_PASSES[0], primary: external, secondary: null, scale })
  passes.push({ code: ANIME4K_WGSL_CLAMP_PASSES[1], primary: first, secondary: null, scale })
  passes.push({ code: ANIME4K_WGSL_CLAMP_PASSES[2], primary: external, secondary: first + 1, scale })
  return passes.length - 1
}
/**
 * 档位 → WebGPU 计划。返回 \`null\` 表示该档位还没有 WebGPU 实现，调用方必须回退 WebGL 路径。
 * 「性能」档用的是 Deblur_DoG（带自定义函数的非卷积链路），本文件不覆盖，因此保持回退。
 */
/**
 * 把一段卷积链接到 `external` 之后：第 0 趟读 external，其余读上一趟；每趟的次输入都是 external，
 * 供带残差的收尾趟使用（不带残差的趟不会读它）。返回链尾趟的序号。
 */
function appendChain(passes: Anime4kWebgpuPass[], codes: readonly string[], external: 'input' | number,
  tail?: { code: string; scale: number }): number {
  let primary: 'input' | number = external
  let last = -1
  for (const code of codes) {
    passes.push({ code, primary, secondary: external, scale: 1 })
    last = passes.length - 1
    primary = last
  }
  if (tail) {
    passes.push({ code: tail.code, primary, secondary: external, scale: tail.scale })
    last = passes.length - 1
  }
  if (last < 0) throw new Error('appendChain 至少需要一趟')
  return last
}

/**
 * 档位 → WebGPU 计划。返回 `null` 表示该档位还没有 WebGPU 实现，调用方必须回退 WebGL 路径。
 */
export function anime4kWebgpuPlan(profile: Anime4KProfile): Anime4kWebgpuPlan | null {
  // 「性能」用 Deblur_DoG、「锐化」用 Restore_CNN_M，两者的收尾趟都不是规则卷积，保持 WebGL 回退。
  if (profile === 'fast' || profile === 'sharp') return null
  const passes: Anime4kWebgpuPass[] = []
  const prekernel = appendClamp(passes, 'input', 1)
  const restored = appendChain(passes, ANIME4K_WGSL_CONV.restoreS, prekernel)
  if (profile !== 'upscale') {
    appendClamp(passes, restored, 1)
    return { profile, passes, scale: 1 }
  }
  const upscaled = appendChain(passes, ANIME4K_WGSL_CONV.upscaleS, restored, { code: ANIME4K_WGSL_UPSCALE_X2_TAIL, scale: 2 })
  appendClamp(passes, upscaled, 2)
  return { profile, passes, scale: 2 }
}