/**
 * 运动场网格的唯一口径。
 *
 * CPU 路径（`motionFlow.ts`）与 GPU 路径（`webgpuMotionEstimator.ts`）必须使用同一份格点定义，
 * 否则两条路径的输出宽度、采样位置与置信度阈值都不可比，回退时会看到画质跳变。
 * 因此把间距与行列数抽到这里，只保留一处定义。
 */
export function motionGrid(width: number, height: number) {
  const spacing = width >= 256 ? 8 : 12
  return {
    columns: Math.max(2, Math.floor(width / spacing)),
    rows: Math.max(2, Math.floor(height / spacing)),
  }
}
