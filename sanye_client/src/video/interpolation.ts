import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import classWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url'
import { InterpolationSourceLoader, type InterpolationProgress } from './interpolationSource'

/**
 * Optical-flow interpolation (the browser-compatible engine).
 *
 * 它完全跑在随包的 FFmpeg 核心里，不依赖任何原生组件，因此在 Web 构建、没有
 * 显卡驱动的机器以及不含神经运行时的包里都能工作。
 *
 * 2026-09-22 起这一模块不再有桌面界面入口：神经补帧（RIFE）离线导出已从产品下线并删除，
 * 播放期实时补帧由 `interpolationRenderer.worker.ts` 承担。本模块与其 `interpolationAssets`
 * 保留给 e2e 生成受控测试片源，且不进入桌面构建产物。
 */
export type { InterpolationProgress } from './interpolationSource'

export const OUTPUT_FPS = 120
export const interpolationAssets = { coreURL, wasmURL, classWorkerURL }

export class InterpolationJob {
  private engine = new FFmpeg()
  private controller = new AbortController()
  private stopped = false
  constructor(private progress: (value: InterpolationProgress) => void) {}

  cancel() { this.stopped = true; this.controller.abort(); this.engine.terminate() }
  private check() { if (this.stopped) throw new DOMException('Cancelled', 'AbortError') }

  async convert(source: string | File, hls: boolean, height: number): Promise<Blob> {
    try {
      this.check()
      this.progress({ stage: '加载插帧引擎', percent: 0 })
      await this.engine.load(interpolationAssets)
      this.check()
      const loader = new InterpolationSourceLoader(this.engine, this.controller.signal, this.progress)
      const info = await loader.load(source, hls, height)
      const duration = info.duration
      this.engine.on('progress', ({ time }) => this.progress({ stage: `生成 ${OUTPUT_FPS}fps 视频`, percent: Math.min(98, 20 + time / 1e6 / duration * 78) }))
      this.progress({ stage: `生成 ${OUTPUT_FPS}fps 视频`, percent: 20 })
      const status = await this.engine.exec([
        '-i', info.input, '-map', '0:v:0', '-map', '0:a?',
        '-vf', `scale=-2:trunc(min(ih\\,${height})/2)*2,tpad=stop_mode=clone:stop_duration=1,minterpolate=fps=${OUTPUT_FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-t', String(duration), '-movflags', '+faststart', 'output.mp4',
      ], 30 * 60 * 1000)
      this.check()
      if (status !== 0) throw new Error('插帧未完成，可能超出处理时间或内存限制；原始视频已保留')
      const verified = await this.engine.ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'json', 'output.mp4', '-o', 'output-info.json'])
      if (verified > 0) throw new Error('无法验证插帧结果')
      const outputInfo = JSON.parse(await this.engine.readFile('output-info.json', 'utf8') as string)
      if (outputInfo.streams?.[0]?.avg_frame_rate !== `${OUTPUT_FPS}/1`) throw new Error(`输出帧率不是 ${OUTPUT_FPS}fps，已拒绝使用`)
      const bytes = await this.engine.readFile('output.mp4')
      if (typeof bytes === 'string') throw new Error('插帧输出无效')
      this.progress({ stage: `${OUTPUT_FPS}fps 视频已生成`, percent: 100 })
      return new Blob([new Uint8Array(bytes)], { type: 'video/mp4' })
    } finally { this.engine.terminate() }
  }
}
