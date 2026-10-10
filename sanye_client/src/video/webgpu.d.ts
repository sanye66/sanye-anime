/**
 * WebGPU 的最小本地类型声明（VQ-42）。
 *
 * TypeScript 5.7 的 `lib.dom.d.ts` 尚未包含 WebGPU，而仓库不希望为一个类型声明新增依赖；
 * 这里沿用 `jsfeat.d.ts`、`m3u8-parser.d.ts` 的做法，只声明 `webgpuMotionEstimator.ts`
 * 实际使用到的接口。成员签名按 WebGPU 规范收敛到本项目的用法，未使用的重载不在此声明。
 */

interface GPU {
  requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance'; forceFallbackAdapter?: boolean }): Promise<GPUAdapter | null>
}

interface GPUAdapter {
  readonly features: ReadonlySet<string>
  readonly info?: { vendor?: string; architecture?: string; device?: string; description?: string }
  requestDevice(descriptor?: Record<string, unknown>): Promise<GPUDevice>
}

interface GPUDevice {
  readonly queue: GPUQueue
  createShaderModule(descriptor: { code: string }): GPUShaderModule
  createComputePipeline(descriptor: { layout: 'auto' | GPUPipelineLayout; compute: { module: GPUShaderModule; entryPoint: string } }): GPUComputePipeline
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture
  createBuffer(descriptor: { size: number; usage: number; mappedAtCreation?: boolean }): GPUBuffer
  createBindGroup(descriptor: { layout: GPUBindGroupLayout; entries: GPUBindGroupEntry[] }): GPUBindGroup
  createCommandEncoder(): GPUCommandEncoder
  destroy?(): void
}

interface GPUPipelineLayout {}

interface GPUShaderModule {
  getCompilationInfo?(): Promise<GPUCompilationInfo>
}

interface GPUCompilationInfo {
  readonly messages: GPUCompilationMessage[]
}

interface GPUCompilationMessage {
  readonly type: 'error' | 'warning' | 'info'
  readonly message: string
  readonly lineNum?: number
  readonly linePos?: number
}

interface GPUComputePipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout
}

interface GPUBindGroupLayout {}

interface GPUBindGroup {}

interface GPUBindGroupEntry {
  binding: number
  resource: GPUBufferBinding | GPUTextureView | GPUSampler
}

interface GPUBufferBinding {
  buffer: GPUBuffer
  offset?: number
  size?: number
}

interface GPUSampler {}

interface GPUTextureView {}

interface GPUTextureDescriptor {
  size: number[] | { width: number; height: number; depthOrArrayLayers?: number }
  format: string
  usage: number
  mipLevelCount?: number
  sampleCount?: number
  dimension?: '1d' | '2d' | '3d'
}

interface GPUTexture {
  createView(descriptor?: Record<string, unknown>): GPUTextureView
  destroy(): void
}

interface GPUBuffer {
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>
  getMappedRange(offset?: number, size?: number): ArrayBuffer
  unmap(): void
  destroy(): void
}

interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: ArrayBufferView | ArrayBuffer, dataOffset?: number, size?: number): void
  copyExternalImageToTexture(source: { source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement },
    destination: { texture: GPUTexture; origin?: number[] }, copySize: number[] | { width?: number; height?: number; depthOrArrayLayers?: number }): void
}

interface GPUCommandBuffer {}

interface GPUCommandEncoder {
  beginComputePass(descriptor?: Record<string, unknown>): GPUComputePassEncoder
  copyBufferToBuffer(source: GPUBuffer, sourceOffset: number, destination: GPUBuffer, destinationOffset: number, size: number): void
  finish(): GPUCommandBuffer
}

interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void
  setBindGroup(index: number, bindGroup: GPUBindGroup): void
  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void
  end(): void
}

declare const GPUTextureUsage: {
  readonly COPY_SRC: number
  readonly COPY_DST: number
  readonly TEXTURE_BINDING: number
  readonly STORAGE_BINDING: number
  readonly RENDER_ATTACHMENT: number
}

declare const GPUBufferUsage: {
  readonly MAP_READ: number
  readonly MAP_WRITE: number
  readonly COPY_SRC: number
  readonly COPY_DST: number
  readonly INDEX: number
  readonly VERTEX: number
  readonly UNIFORM: number
  readonly STORAGE: number
}

declare const GPUMapMode: {
  readonly READ: number
  readonly WRITE: number
}

interface Navigator {
  readonly gpu?: GPU
}

/**
 * 以下是 VQ-57（Anime4K 超分走 WebGPU）用到的补充声明：渲染管线、渲染趟、采样器与回读。
 * 与上文一致，只声明本项目实际使用的成员，描述符按规范收敛为宽松类型，不引入新依赖。
 */
interface GPUDevice {
  createRenderPipeline(descriptor: Record<string, unknown>): GPURenderPipeline
  createBindGroupLayout(descriptor: Record<string, unknown>): GPUBindGroupLayout
  createPipelineLayout(descriptor: Record<string, unknown>): GPUPipelineLayout
  createSampler(descriptor?: Record<string, unknown>): GPUSampler
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: Record<string, unknown>): GPURenderPassEncoder
  copyTextureToBuffer(source: Record<string, unknown>, destination: Record<string, unknown>, copySize: number[] | Record<string, unknown>): void
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout
}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void
  setBindGroup(index: number, bindGroup: GPUBindGroup): void
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void
  end(): void
}

declare const GPUShaderStage: {
  readonly VERTEX: number
  readonly FRAGMENT: number
  readonly COMPUTE: number
}
