import jsfeat from 'jsfeat'

export interface MotionField { data: Float32Array; backward?: Float32Array; width: number; height: number; sceneCut: boolean }

/** Pyramidal Lucas-Kanade tracking is supplied by JSFeat; reject inconsistent round trips. */
export class MotionEstimator {
  private previous: InstanceType<typeof jsfeat.pyramid_t> | null = null
  reset() { this.previous = null }

  estimate(rgba: Uint8ClampedArray, width: number, height: number): MotionField {
    const current = new jsfeat.pyramid_t(Math.min(width, height) >= 192 ? 4 : 3)
    current.allocate(width, height, jsfeat.U8_t | jsfeat.C1_t)
    jsfeat.imgproc.grayscale(rgba, width, height, current.data[0])
    current.build(current.data[0], true)
    const spacing = width >= 256 ? 8 : 12
    const columns = Math.max(2, Math.floor(width / spacing))
    const rows = Math.max(2, Math.floor(height / spacing))
    const count = columns * rows
    const result: MotionField = { data: new Float32Array(count * 4), backward: new Float32Array(count * 4), width: columns, height: rows, sceneCut: true }
    const previous = this.previous
    this.previous = current
    if (!previous || previous.data[0].cols !== width || previous.data[0].rows !== height) return result
    const oldPixels = previous.data[0].data, newPixels = current.data[0].data
    const oldHistogram = new Uint32Array(32), newHistogram = new Uint32Array(32)
    let difference = 0
    for (let i = 0; i < width * height; i++) {
      difference += Math.abs(oldPixels[i] - newPixels[i])
      oldHistogram[oldPixels[i] >> 3]++; newHistogram[newPixels[i] >> 3]++
    }
    let histogramDistance = 0
    for (let i = 0; i < 32; i++) histogramDistance += Math.abs(oldHistogram[i] - newHistogram[i])
    histogramDistance /= 2 * width * height
    // A bounded camera-pan prior keeps periodic line art from trapping LK at a nearby repetition.
    const coarsePrevious = previous.data[2], coarseCurrent = current.data[2]
    const search = (a: Uint8Array, b: Uint8Array, w: number, h: number, centerX: number, centerY: number, radius: number, step: number) => {
      let best = Infinity, bx = 0, by = 0
      const margin = Math.max(Math.abs(centerX), Math.abs(centerY)) + radius + 1
      for (let dy = centerY - radius; dy <= centerY + radius; dy++) for (let dx = centerX - radius; dx <= centerX + radius; dx++) {
        let sum = 0, samples = 0
        for (let y = margin; y < h - margin; y += step) for (let x = margin; x < w - margin; x += step) {
          sum += Math.abs(a[y * w + x] - b[(y + dy) * w + x + dx]); samples++
        }
        const score = samples ? sum / samples : Infinity
        if (score < best) { best = score; bx = dx; by = dy }
      }
      return { x: bx, y: by, score: best }
    }
    const coarse = search(coarsePrevious.data, coarseCurrent.data, coarsePrevious.cols, coarsePrevious.rows, 0, 0,
      Math.min(8, Math.floor(coarsePrevious.rows / 4)), 2)
    const pan = search(oldPixels, newPixels, width, height, coarse.x * 4, coarse.y * 4, 3, 4)
    const points = new Float32Array(count * 2)
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const i = (y * columns + x) * 2
      points[i] = (x + 0.5) * width / columns
      points[i + 1] = (y + 0.5) * height / rows
    }
    // Each field lives in its own source coordinates; a negated forward field cannot describe disocclusion.
    const track = (from: typeof current, to: typeof current, output: Float32Array, direction: number) => {
      const next = new Float32Array(points.length), back = new Float32Array(points.length)
      const forwardStatus = new Uint8Array(count), backwardStatus = new Uint8Array(count)
      jsfeat.optical_flow_lk.track(from, to, points, next, count, 11, 20, forwardStatus, 0.01, 0.0001)
      jsfeat.optical_flow_lk.track(to, from, next, back, count, 11, 20, backwardStatus, 0.01, 0.0001)
      let valid = 0
      for (let i = 0; i < count; i++) {
        const offset = i * 2, x = points[offset], y = points[offset + 1]
        let nx = next[offset], ny = next[offset + 1]
        let roundTrip = Math.hypot(back[offset] - x, back[offset + 1] - y)
        const panX = x + pan.x * direction, panY = y + pan.y * direction
        if (pan.score < 10 && panX >= 2 && panY >= 2 && panX < width - 2 && panY < height - 2) {
          let panError = 0, localError = 0
          for (let py = -1; py <= 1; py++) for (let px = -1; px <= 1; px++) {
            const source = from.data[0].data[(Math.round(y) + py) * width + Math.round(x) + px]
            panError += Math.abs(source - to.data[0].data[(Math.round(panY) + py) * width + Math.round(panX) + px])
            localError += Math.abs(source - (to.data[0].data[(Math.round(ny) + py) * width + Math.round(nx) + px] ?? 255))
          }
          if (panError < 45 && (!forwardStatus[i] || roundTrip > 1.25 || panError <= localError)) {
            nx = panX; ny = panY; roundTrip = 0; forwardStatus[i] = backwardStatus[i] = 1
          }
        }
        const dx = nx - x, dy = ny - y
        if (!forwardStatus[i] || !backwardStatus[i] || roundTrip > 1.25
          || nx < 2 || ny < 2 || nx >= width - 2 || ny >= height - 2
          || Math.hypot(dx, dy) > width * 0.25) continue
        let residual = 0
        for (let py = -1; py <= 1; py++) for (let px = -1; px <= 1; px++) {
          residual += Math.abs(from.data[0].data[(Math.round(y) + py) * width + Math.round(x) + px]
            - to.data[0].data[(Math.round(ny) + py) * width + Math.round(nx) + px])
        }
        residual /= 9
        if (residual > 20) continue
        const confidence = Math.max(0.05, (1 - roundTrip / 1.5) * (1 - residual / 40))
        output[i * 4] = dx / width * confidence
        output[i * 4 + 1] = dy / height * confidence
        output[i * 4 + 2] = confidence
        valid++
      }
      // Reject isolated motion outliers without averaging across object boundaries.
      // Scene-cut coverage remains based on LK matches, not this local rejection.
      const raw = output.slice()
      for (let row = 1; row < rows - 1; row++) for (let col = 1; col < columns - 1; col++) {
        const index = (row * columns + col) * 4, confidence = raw[index + 2]
        if (confidence < 0.15) continue
        const vx = raw[index] * width / confidence, vy = raw[index + 1] * height / confidence
        let neighbors = 0, supporting = 0
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue
          const offset = ((row + oy) * columns + col + ox) * 4, weight = raw[offset + 2]
          if (weight < 0.15) continue
          neighbors++
          if (Math.hypot(vx - raw[offset] * width / weight, vy - raw[offset + 1] * height / weight) <= 4.5) supporting++
        }
        if (neighbors >= 3 && supporting <= 1) output.fill(0, index, index + 4)
      }
      return valid / count
    }
    const coverage = (track(previous, current, result.data, 1) + track(current, previous, result.backward!, -1)) / 2
    const meanDifference = difference / (width * height)
    result.sceneCut = meanDifference > 12 && (histogramDistance > 0.65 || (coverage < 0.08 && meanDifference > 28))
    return result
  }
}
