import { MotionEstimator } from './motionFlow'

const estimator = new MotionEstimator()
const canvas = new OffscreenCanvas(192, 108)
const context = canvas.getContext('2d', { willReadFrequently: true })!
let generation = -1
self.onmessage = (event: MessageEvent<{ bitmap: ImageBitmap; mediaTime: number; generation: number; sentAt?: number }>) => {
  const frame = event.data
  const receivedAt = frame.sentAt ? performance.now() : 0
  try {
    if (frame.generation !== generation) { estimator.reset(); generation = frame.generation }
    const width = frame.bitmap.width
    const height = frame.bitmap.height
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    context.drawImage(frame.bitmap, 0, 0, width, height)
    const start = performance.now()
    const pixels = context.getImageData(0, 0, width, height).data
    const analysisStarted = frame.sentAt ? performance.now() : 0
    const field = estimator.estimate(pixels, width, height)
    frame.bitmap.close()
    self.postMessage({ mediaTime: frame.mediaTime, generation: frame.generation, field, computeMs: performance.now() - start,
      flowQueueMs: frame.sentAt ? Math.max(0, receivedAt - (frame.sentAt - performance.timeOrigin)) : null,
      analysisMs: frame.sentAt ? performance.now() - analysisStarted : null, sentAt: frame.sentAt },
      { transfer: field.backward ? [field.data.buffer, field.backward.buffer] : [field.data.buffer] })
  } catch (error) {
    frame.bitmap.close()
    self.postMessage({ error: error instanceof Error ? error.message : '光流计算失败', generation: frame.generation })
  }
}
