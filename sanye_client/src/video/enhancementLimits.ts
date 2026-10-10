import type { Anime4KProfile } from './anime4k'
import type { EnhancementBudgetOptions } from './enhancementBudgetPolicy'

/**
 * 安卓端可选画质档（VQ-45）：只保留手机 GPU 能稳定运行的档位。
 *
 * - `锐化` = `Clamp_Highlights` + `Restore_CNN_M`，比「均衡」的 `Restore_CNN_S` 更重；
 * - `超分 2×` 再追加 `Upscale_CNN_x2_S`，同一画面的着色像素量变成 4 倍：640×360 的 2× 超分在
 *   受控夹具里约 1 秒就降到性能档，手机只会更差；
 * - `修复` 在纯画质路径与「均衡」是同一条链路（`anime4k.ts` 的 `profileShaderChain`），
 *   菜单里没有必要同时留两个结果相同的档位。
 *
 * 用户反馈「画质与帧率还是只有两档」后开放「锐化」：它在手机上仍属可自动降档的中间档
 *（`allowMidTierFallback` 打开时持续超预算会退回性能），所以中档不再只有一档可选。
 * 超分 2× 与「修复」仍然不进菜单：前者是 4 倍着色像素量，后者在纯画质路径与「均衡」同链路。
 */
export const MOBILE_ANIME4K_PROFILES: readonly Anime4KProfile[] = ['fast', 'balanced', 'sharp']

/**
 * 一次增强会话的资源上限。
 *
 * 这些开关只影响「同一档位在手机上怎么跑」，不改变档位本身的语义：运动分析网格收窄、
 * 更早认定超预算、允许「均衡」在持续超预算时降到「性能」，避免某一档一直卡在承载不住的状态。
 */
export interface EnhancementLimits {
  /** 运动分析网格宽度上限；`FlowAnalysisPolicy` 默认可以从 128 一路升到 384。 */
  analysisWidthCap?: number
  /**
   * GPU 运动估计被确认可用时的网格上限（VQ-49）：常驻 GPU 管线的逐帧成本远低于 CPU，
   * 实测有余量时允许升到更细的网格拿到更准的运动场；不传时与 `analysisWidthCap` 相同。
   */
  analysisWidthCapOnGpu?: number
  /** 增强预算判定覆盖项（压力阈值与积压上限）。 */
  budget?: EnhancementBudgetOptions
  /**
   * 允许「均衡」「锐化」在持续超预算时回退到「性能」。
   * 超分 2× → 修复 → 性能 的链路两种平台都有；这两个中间档位默认不降，安卓端才打开。
   */
  allowMidTierFallback?: boolean
}

/**
 * 安卓手机：本机记录显示 1080p/30 源在 128 最粗分析档已占约 45% 帧预算，
 * 因此不再向上探到 256/384；超预算阈值比默认收紧（0.62/6 → 0.5/4），
 * 但压力段要求连续覆盖 2 秒（默认 0.8 秒）才降档——阈值决定“算不算超预算”，
 * 时长决定“是不是持续超预算”，后者放宽是为了不让一次瞬时抖动就降级。
 */
/**
 * 档位降一阶：超分 2× → 修复 → 性能；开启 `allowMidTierFallback` 时「均衡」「锐化」→「性能」。
 *
 * 其余档位返回 `null`，表示**已经在地板档、没有更省的处理链可让**。调用方必须把这个 `null`
 * 当成“不再降档”而不是“降档后可以丢帧”：降档路径依赖重置会话释放帧，地板档不重置，
 * 直接按降档处理会让当前帧既不呈现也不释放（纹理泄漏 + 少输出一帧）。
 *
 * 以纯函数导出，便于在没有 GPU/Worker 的环境直接验证地板档语义。
 */
export function nextLowerProfile(profile: Anime4KProfile | 'off', allowMidTierFallback: boolean): Anime4KProfile | null {
  if (profile === 'upscale') return 'restore'
  if (profile === 'restore') return 'fast'
  if (allowMidTierFallback && (profile === 'balanced' || profile === 'sharp')) return 'fast'
  return null
}

export const ANDROID_ENHANCEMENT_LIMITS: EnhancementLimits = {
  analysisWidthCap: 192,
  // GPU 被实测确认后放宽到 256：升档仍要投影利用率低于 0.48 且样本足够，CPU 设备不会走到这里。
  analysisWidthCapOnGpu: 256,
  budget: { enhancementRatio: 0.5, queueDepthLimit: 4, pressureMs: 2_000 },
  allowMidTierFallback: true,
}
