import type { MotionField } from './motionFlow'
import type { Anime4KProfile } from './anime4k'
import { FrameEnhancer, interpolationShaderChain, profileShaderChain,
  type FrameEnhancement } from './frameEnhancer'
import type { Anime4KShaderConstructor } from 'anime4k.js/shaders'

/** `flow` 表示这一帧已经上传了可用的运动场；跳过光流补帧时该帧只有原帧纹理（VQ-27）。 */
export interface MotionFrame { texture: WebGLTexture; flow: WebGLTexture; backward: WebGLTexture; time: number; cut: boolean; flowUploaded: boolean }
interface TimerExtension {
  TIME_ELAPSED_EXT: number; QUERY_RESULT_AVAILABLE_EXT: number; QUERY_RESULT_EXT: number; GPU_DISJOINT_EXT: number
  createQueryEXT(): WebGLQuery; deleteQueryEXT(query: WebGLQuery): void
  beginQueryEXT(target: number, query: WebGLQuery): void; endQueryEXT(target: number): void
  getQueryObjectEXT(query: WebGLQuery, parameter: number): unknown
}

const vertex = `attribute vec2 position; varying vec2 uv;
void main(){uv=vec2((position.x+1.0)*0.5,(1.0-position.y)*0.5);gl_Position=vec4(position,0,1);}`
const fragment = `precision highp float;
varying vec2 uv; uniform sampler2D previousFrame,currentFrame,motion,reverseMotion;
uniform float phase,cut,sharpness; uniform vec2 pixel;
vec3 sharpen(sampler2D image,vec2 p,vec3 c){
  if(sharpness<=0.0)return c;
  vec3 horizontalA=texture2D(image,p+vec2(pixel.x,0)).rgb;
  vec3 horizontalB=texture2D(image,p-vec2(pixel.x,0)).rgb;
  vec3 verticalA=texture2D(image,p+vec2(0,pixel.y)).rgb;
  vec3 verticalB=texture2D(image,p-vec2(0,pixel.y)).rgb;
  vec3 low=min(c,min(min(horizontalA,horizontalB),min(verticalA,verticalB)));
  vec3 high=max(c,max(max(horizontalA,horizontalB),max(verticalA,verticalB)));
  return clamp(c+sharpness*(c-(horizontalA+horizontalB+verticalA+verticalB)*0.25),low,high);
}
void main(){
  if(cut>0.5){
    gl_FragColor=vec4(phase<0.999?sharpen(previousFrame,uv,texture2D(previousFrame,uv).rgb):sharpen(currentFrame,uv,texture2D(currentFrame,uv).rgb),1);return;
  }
  if(phase<=0.001||phase>=0.999){
    gl_FragColor=vec4(phase<=0.001?sharpen(previousFrame,uv,texture2D(previousFrame,uv).rgb):sharpen(currentFrame,uv,texture2D(currentFrame,uv).rgb),1);return;
  }
  vec2 pa=uv,pb=uv;
  vec3 forward,backward;
  for(int i=0;i<2;i++){
    forward=texture2D(motion,pa).xyz;backward=texture2D(reverseMotion,pb).xyz;
    pa=uv-phase*forward.xy/max(forward.z,0.01);
    pb=uv-(1.0-phase)*backward.xy/max(backward.z,0.01);
  }
  vec3 a=texture2D(previousFrame,pa).rgb,b=texture2D(currentFrame,pb).rgb;
  float ca=forward.z,cb=backward.z;
  if(any(lessThan(pa,vec2(0)))||any(greaterThan(pa,vec2(1))))ca=0.0;
  if(any(lessThan(pb,vec2(0)))||any(greaterThan(pb,vec2(1))))cb=0.0;
  if(ca>=0.15&&cb>=0.15){
    float consistency=1.0-smoothstep(0.008,0.045,length(forward.xy/max(forward.z,0.01)+backward.xy/max(backward.z,0.01)));
    ca*=consistency;cb*=consistency;
  }
  float disagreement=max(max(abs(a.r-b.r),abs(a.g-b.g)),abs(a.b-b.b));
  vec3 c;float detailFrame=phase<0.5?0.0:1.0;
  if(max(ca,cb)<0.15){
    pa=pb=uv;a=texture2D(previousFrame,uv).rgb;b=texture2D(currentFrame,uv).rgb;
    c=phase<0.5?a:b;
  }else if(min(ca,cb)<0.15||disagreement>0.2){
    if(disagreement>0.2 && min(ca,cb)>=0.15){
      pa=pb=uv;a=texture2D(previousFrame,uv).rgb;b=texture2D(currentFrame,uv).rgb;
      c=phase<0.5?a:b;
    }else if(ca>cb*1.3){c=a;detailFrame=0.0;}
    else if(cb>ca*1.3){c=b;detailFrame=1.0;}
    else{c=phase<0.5?a:b;}
  }else{
    c=mix(a,b,phase);
  }
  vec3 selected=detailFrame<0.5?sharpen(previousFrame,pa,a):sharpen(currentFrame,pb,b);
  c+=selected-(detailFrame<0.5?a:b);
  gl_FragColor=vec4(clamp(c,0.0,1.0),1);
}`

export class MotionRenderer {
  readonly gl: WebGLRenderingContext
  private program: WebGLProgram
  private buffer: WebGLBuffer
  private textures = new Set<WebGLTexture>()
  private storage = new Map<WebGLTexture, { width: number; height: number; type: number }>()
  private reusable: MotionFrame[] = []
  private pooled = new Set<MotionFrame>()
  private disposed = false
  private position: number
  private uniforms: Record<string, WebGLUniformLocation | null>
  private textureAllocations = 0
  private textureUpdates = 0
  private timer: TimerExtension | null = null
  private pending: { query: WebGLQuery; interpolated: boolean }[] = []
  private enhancementPending: WebGLQuery[] = []
  private completed = 0
  private completedInterpolated = 0
  private gpuMs = 0
  private completionPixel = new Uint8Array(4)
  private enhancementSamples = 0
  private enhancer: FrameEnhancer | null = null
  /** 当前增强链路的身份：用于判断能否复用程序完成超分→修复的有界降档。 */
  private enhancementKind: string | null = null
  private sourceTexture: WebGLTexture | null = null
  enhancementMs = 0
  enhancementFailure = ''
  get enhancementQueueDepth() { return this.enhancementPending.length }
  get resourceStats() {
    let ownedTextureBytes = 0
    for (const value of this.storage.values()) ownedTextureBytes += value.width * value.height * (value.type === this.gl.FLOAT ? 16 : 4)
    return { textures: this.textures.size, pooledFrames: this.reusable.length, ownedTextureBytes,
      textureAllocations: this.textureAllocations, textureUpdates: this.textureUpdates }
  }
  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas, private sharpness = 0.1, private measureCompletion = false, enhancement?: FrameEnhancement) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null
    if (!gl || !gl.getExtension('OES_texture_float') || !gl.getExtension('OES_texture_float_linear')) {
      throw new Error('当前设备不支持运动补帧所需的 GPU 纹理')
    }
    this.gl = gl
    if (enhancement) {
      try {
        this.enhancer = new FrameEnhancer(gl, interpolationShaderChain(enhancement))
        this.enhancementKind = enhancement
        this.sourceTexture = this.texture()
      }
      catch (error) { this.enhancementFailure = error instanceof Error ? error.message : '修复不可用，已回退性能档'; this.sharpness = 0.05 }
    }
    this.timer = measureCompletion ? gl.getExtension('EXT_disjoint_timer_query') as TimerExtension | null : null
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(error || '补帧着色器编译失败') }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment)
    this.program = gl.createProgram()!
    gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program)
    gl.deleteShader(vs); gl.deleteShader(fs)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) { gl.deleteProgram(this.program); throw new Error('补帧着色器链接失败') }
    this.buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    gl.useProgram(this.program)
    const location = gl.getAttribLocation(this.program, 'position')
    this.position = location
    this.uniforms = Object.fromEntries(['previousFrame', 'currentFrame', 'motion', 'reverseMotion', 'phase', 'cut', 'sharpness', 'pixel']
      .map(name => [name, gl.getUniformLocation(this.program, name)]))
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
  }
  private texture() {
    const gl = this.gl, texture = gl.createTexture()!
    this.textures.add(texture)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return texture
  }
  private sameStorage(texture: WebGLTexture, width: number, height: number, type: number) {
    const old = this.storage.get(texture)
    return old?.width === width && old.height === height && old.type === type
  }
  private recordStorage(texture: WebGLTexture, width: number, height: number, type: number, allocated: boolean) {
    this.storage.set(texture, { width, height, type })
    if (allocated) this.textureAllocations++
    else this.textureUpdates++
  }
  private uploadField(texture: WebGLTexture, field: MotionField, data: Float32Array) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, texture)
    const allocated = !this.sameStorage(texture, field.width, field.height, gl.FLOAT)
    if (allocated) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.FLOAT, data)
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.width, field.height, gl.RGBA, gl.FLOAT, data)
    this.recordStorage(texture, field.width, field.height, gl.FLOAT, allocated)
  }
  upload(image: TexImageSource, time: number, field: MotionField, deferFlow = false): MotionFrame {
    if (this.disposed) throw new Error('渲染资源已释放')
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0)
    const reusable = this.reusable.pop()
    if (reusable) this.pooled.delete(reusable)
    const texture = reusable?.texture ?? this.texture()
    const width = 'videoWidth' in image ? image.videoWidth : 'naturalWidth' in image ? image.naturalWidth : 'displayWidth' in image ? image.displayWidth : image.width
    const height = 'videoHeight' in image ? image.videoHeight : 'naturalHeight' in image ? image.naturalHeight : 'displayHeight' in image ? image.displayHeight : image.height
    const source = this.sourceTexture ?? texture
    gl.bindTexture(gl.TEXTURE_2D, source)
    const allocated = !this.sameStorage(source, width, height, gl.UNSIGNED_BYTE)
    if (allocated) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image)
    this.recordStorage(source, width, height, gl.UNSIGNED_BYTE, allocated)
    if (this.enhancer && this.sourceTexture) {
      const start = performance.now()
      this.pollEnhancement()
      const query = this.enhancementPending.length < 8 ? this.timer?.createQueryEXT() : null
      if (query) this.timer!.beginQueryEXT(this.timer!.TIME_ELAPSED_EXT, query)
      let size: { width: number; height: number; allocated: boolean }
      let enhanced = false
      try {
        size = this.enhancer.process(this.sourceTexture, width, height, texture)
        this.recordStorage(texture, size.width, size.height, gl.UNSIGNED_BYTE, size.allocated)
        enhanced = true
      } finally {
        if (query) {
          this.timer!.endQueryEXT(this.timer!.TIME_ELAPSED_EXT)
          if (enhanced) { this.enhancementPending.push(query); gl.flush() }
          else this.timer!.deleteQueryEXT(query)
        }
        if (!enhanced) {
          if (reusable) this.deleteFrame(reusable)
          else this.deleteTexture(texture)
        }
      }
      if (!this.timer && this.enhancementSamples++ % 15 === 0) {
        // Sample real completion occasionally on platforms without timer queries.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.completionPixel)
        this.enhancementMs = performance.now() - start
      }
      if (this.canvas.width !== size.width) this.canvas.width = size.width
      if (this.canvas.height !== size.height) this.canvas.height = size.height
    }
    const flow = reusable?.flow ?? this.texture()
    const backward = reusable?.backward ?? this.texture()
    if (!deferFlow) { this.uploadField(flow, field, field.data); this.uploadBackward(backward, field) }
    return { texture, flow, backward, time, cut: field.sceneCut, flowUploaded: !deferFlow }
  }
  private uploadBackward(texture: WebGLTexture, field: MotionField) {
    const data = field.backward ?? field.data.map((value, index) => index % 4 < 2 ? -value : value)
    this.uploadField(texture, field, data)
  }
  /** `frameOnly` 只输出 `previous` / `current` 中的一张原帧，不读取运动场（VQ-27 跳过补帧时的绘制路径）。 */
  render(previous: MotionFrame, current: MotionFrame, phase: number, frameOnly = false) {
    const gl = this.gl
    const started = performance.now()
    this.pollCompleted()
    if (this.pending.length >= 16) return
    const query = this.timer?.createQueryEXT()
    if (query) this.timer!.beginQueryEXT(this.timer!.TIME_ELAPSED_EXT, query)
    gl.useProgram(this.program)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.disableVertexAttribArray(0); gl.disableVertexAttribArray(1)
    const position = this.position
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    for (const [unit, name, texture] of [[0, 'previousFrame', previous.texture], [1, 'currentFrame', current.texture], [2, 'motion', current.flow], [3, 'reverseMotion', current.backward]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(this.uniforms[name], unit)
    }
    gl.uniform1f(this.uniforms.phase, Math.max(0, Math.min(1, phase)))
    gl.uniform1f(this.uniforms.cut, frameOnly || current.cut ? 1 : 0)
    gl.uniform1f(this.uniforms.sharpness, this.sharpness)
    gl.uniform2f(this.uniforms.pixel, 1 / this.canvas.width, 1 / this.canvas.height)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    const interpolated = !frameOnly && !current.cut && phase > 0.01 && phase < 0.99
    if (query) {
      this.timer!.endQueryEXT(this.timer!.TIME_ELAPSED_EXT)
      this.pending.push({ query, interpolated })
      gl.flush()
    } else if (this.measureCompletion) {
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.completionPixel)
      this.completed++
      this.gpuMs += performance.now() - started
      if (interpolated) this.completedInterpolated++
    }
  }
  private pollCompleted() {
    const timer = this.timer
    if (!timer) return
    while (this.pending.length && timer.getQueryObjectEXT(this.pending[0].query, timer.QUERY_RESULT_AVAILABLE_EXT)) {
      const entry = this.pending.shift()!
      if (!this.gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        this.completed++
        this.gpuMs += Number(timer.getQueryObjectEXT(entry.query, timer.QUERY_RESULT_EXT)) / 1e6
        if (entry.interpolated) this.completedInterpolated++
      }
      timer.deleteQueryEXT(entry.query)
    }
  }
  private pollEnhancement() {
    const timer = this.timer
    if (!timer) return
    while (this.enhancementPending.length && timer.getQueryObjectEXT(this.enhancementPending[0], timer.QUERY_RESULT_AVAILABLE_EXT)) {
      const query = this.enhancementPending.shift()!
      if (!this.gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        const elapsed = Number(timer.getQueryObjectEXT(query, timer.QUERY_RESULT_EXT)) / 1e6
        this.enhancementMs = this.enhancementMs ? this.enhancementMs * 0.75 + elapsed * 0.25 : elapsed
      }
      timer.deleteQueryEXT(query)
    }
  }
  takeCompletedFrames() {
    this.pollCompleted()
    this.pollEnhancement()
    const result = { frames: this.completed, interpolated: this.completedInterpolated, gpuMs: this.completed ? this.gpuMs / this.completed : 0 }
    this.completed = this.completedInterpolated = 0
    this.gpuMs = 0
    return result
  }
  updateFlow(frame: MotionFrame, field: MotionField) {
    this.uploadField(frame.flow, field, field.data)
    this.uploadBackward(frame.backward, field)
    frame.cut = field.sceneCut
    frame.flowUploaded = true
  }
  release(frame: MotionFrame) {
    if (this.disposed || this.pooled.has(frame)) return
    if (this.reusable.length >= 24) { this.deleteFrame(frame); return }
    this.pooled.add(frame)
    this.reusable.push(frame)
  }
  private deleteFrame(frame: MotionFrame) {
    for (const texture of [frame.texture, frame.flow, frame.backward]) this.deleteTexture(texture)
  }
  private deleteTexture(texture: WebGLTexture) {
    this.gl.deleteTexture(texture); this.textures.delete(texture); this.storage.delete(texture)
  }
  resetMeasurements() {
    for (const entry of this.pending) this.timer?.deleteQueryEXT(entry.query)
    for (const query of this.enhancementPending) this.timer?.deleteQueryEXT(query)
    this.pending = []; this.enhancementPending = []
    this.completed = this.completedInterpolated = this.gpuMs = this.enhancementMs = this.enhancementSamples = 0
  }
  clearFramePool() {
    for (const frame of this.reusable) this.deleteFrame(frame)
    this.reusable = []; this.pooled.clear()
  }
  setEnhancement(mode: FrameEnhancement | undefined, sharpness: number) {
    this.applyEnhancement(mode ? interpolationShaderChain(mode) : null, mode ?? 'off', sharpness)
  }
  /**
   * 仅增强路径（VQ-28）：用与主线程 `anime4k.js` 完全一致的档位链路执行增强，
   * 因此「只开画质、不开补帧」移入渲染 Worker 只改变执行位置，不改变像素输出。
   */
  setEnhancementProfile(profile: Anime4KProfile, sharpness = 0) {
    this.applyEnhancement(profileShaderChain(profile), profile, sharpness)
  }
  private applyEnhancement(chain: Anime4KShaderConstructor[] | null, kind: string, sharpness: number) {
    if (this.disposed) throw new Error('渲染资源已释放')
    this.resetMeasurements(); this.clearFramePool()
    this.sharpness = sharpness; this.enhancementFailure = ''
    if (this.enhancer && this.enhancementKind === 'upscale' && kind === 'restore') this.enhancer.downgradeToRestore()
    else if (this.enhancementKind !== kind) {
      this.enhancer?.stop(); this.enhancer = null
      try { if (chain) this.enhancer = new FrameEnhancer(this.gl, chain) }
      catch (error) { this.enhancementFailure = error instanceof Error ? error.message : '修复不可用，已回退性能档'; this.sharpness = 0.05 }
    }
    this.enhancementKind = this.enhancer ? kind : null
    if (this.enhancer && !this.sourceTexture) this.sourceTexture = this.texture()
    if (!this.enhancer && this.sourceTexture) {
      this.deleteTexture(this.sourceTexture); this.sourceTexture = null
    }
  }
  disposePipeline() {
    if (this.disposed) return
    this.disposed = true
    this.enhancer?.stop()
    for (const entry of this.pending) this.timer?.deleteQueryEXT(entry.query)
    for (const query of this.enhancementPending) this.timer?.deleteQueryEXT(query)
    this.pending = []
    this.enhancementPending = []
    for (const texture of this.textures) this.gl.deleteTexture(texture)
    this.textures.clear(); this.storage.clear(); this.reusable = []; this.pooled.clear()
    this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program)
  }
  stop() {
    this.disposePipeline()
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
