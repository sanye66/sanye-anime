declare module 'jsfeat' {
  class matrix_t { data: Uint8Array; cols: number; rows: number }
  class pyramid_t {
    constructor(levels: number)
    data: matrix_t[]
    allocate(width: number, height: number, type: number): void
    build(input: matrix_t, skipFirst?: boolean): void
  }
  const jsfeat: {
    U8_t: number; C1_t: number; pyramid_t: typeof pyramid_t
    imgproc: { grayscale(data: Uint8ClampedArray, width: number, height: number, target: matrix_t): void }
    optical_flow_lk: { track(previous: pyramid_t, current: pyramid_t, points: Float32Array, next: Float32Array,
      count: number, window: number, iterations: number, status: Uint8Array, epsilon: number, eigen: number): void }
  }
  export default jsfeat
}
