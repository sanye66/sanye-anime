export const desktopMode = import.meta.env.VITE_DESKTOP_MODE === 'true'

/**
 * 桌面模式判定（VQ-42 后本文件只剩这一项）。
 *
 * 这里原本还暴露神经补帧（RIFE 离线导出）的主进程桥。该能力在 2026-09-22 下线，
 * 连同它的运行时、主进程模块与 IPC 通道一并移除，因此不再有需要跨进程转发的能力。
 * 播放期实时补帧由渲染 Worker 内的 WebGPU / CPU 光流承担，不经过本文件。
 */
