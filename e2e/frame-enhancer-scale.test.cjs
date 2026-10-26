const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const clientRequire = createRequire(path.resolve(__dirname, '../sanye_client/package.json'))
const ts = clientRequire('typescript')
const shaders = Object.fromEntries(Object.entries(clientRequire('anime4k.js/shaders'))
  .map(([name, value]) => [name, value.default ?? value]))

function fixture(chain) {
  const outputs = [], allocations = [], destroyed = []
  const gl = {
    getExtension: () => ({}), createFramebuffer: () => ({}), deleteFramebuffer() {},
    enableVertexAttribArray() {}, bindFramebuffer() {}, framebufferTexture2D() {},
    checkFramebufferStatus: () => 1, FRAMEBUFFER_COMPLETE: 1,
    activeTexture() {}, bindTexture() {}, copyTexSubImage2D() {},
    texImage2D: (...args) => allocations.push([args[3], args[4]]),
  }
  const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/video/frameEnhancer.ts'), 'utf8')
  const scope = { exports: {}, require: () => shaders }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, scope)
  const wrappers = chain.map(([x, y], index) => class {
    magnification() { return [x, y] }
    hook_MAIN(textures) {
      outputs.push([textures.get('OUTPUT').width, textures.get('OUTPUT').height])
      const main = textures.get('MAIN')
      textures.set('MAIN', { ...main, width: main.width * x, height: main.height * y })
    }
    hook_PREKERNEL() {}
    destroy() { destroyed.push(index) }
  })
  return { enhancer: new scope.exports.FrameEnhancer(gl, wrappers), outputs, allocations, destroyed }
}

test('installed Anime4K 2x model supplies a 2x output target rather than a 4x target', () => {
  const magnifications = [shaders.Anime4K_Clamp_Highlights, shaders.Anime4K_Restore_CNN_S,
    shaders.Anime4K_Upscale_CNN_x2_S].map(Shader => Shader.prototype.magnification())
  const { enhancer, outputs, allocations, destroyed } = fixture(magnifications)
  const destination = {}
  assert.equal(enhancer.scale, 2)
  assert.deepEqual({ ...enhancer.process({}, 320, 180, destination) }, { width: 640, height: 360, allocated: true })
  assert.ok(outputs.every(([width, height]) => width === 640 && height === 360))
  enhancer.process({}, 320, 180, destination)
  assert.deepEqual(allocations, [[640, 360]], '同尺寸缓存不重复分配纹理')
  enhancer.downgradeToRestore()
  assert.equal(enhancer.scale, 1)
  assert.deepEqual({ ...enhancer.process({}, 320, 180, destination) }, { width: 320, height: 180, allocated: true })
  assert.deepEqual(outputs.slice(-2), [[320, 180], [320, 180]])
  assert.deepEqual(destroyed, [2])
  enhancer.stop()
})

test('output targets compose independent axis multipliers instead of multiplying pixel area', () => {
  const { enhancer, outputs } = fixture([[2, 1], [1, 3]])
  assert.deepEqual({ ...enhancer.process({}, 100, 80, {}) }, { width: 200, height: 240, allocated: true })
  assert.deepEqual(outputs, [[200, 240], [200, 240]])
  enhancer.stop()
})

test('the real WebGL enhancement renders 2x pixels and retains valid output after restore downgrade', async () => {
  const { chromium } = require('playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
    await page.goto(process.env.SANYE_FRONTEND_URL || 'http://127.0.0.1:5187')
    const result = await page.evaluate(async () => {
      const { FrameEnhancer, interpolationShaderChain } = await import('/src/video/frameEnhancer.ts')
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl')
      gl.getExtension('OES_texture_float'); gl.getExtension('OES_texture_float_linear')
      const image = document.createElement('canvas'); image.width = 160; image.height = 90
      const ctx = image.getContext('2d')
      ctx.fillStyle = '#df3527'; ctx.fillRect(0, 0, 80, 90)
      ctx.fillStyle = '#227bde'; ctx.fillRect(80, 0, 80, 90)
      const texture = () => {
        const value = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, value)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        return value
      }
      const source = texture()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      const destination = texture(), enhancer = new FrameEnhancer(gl, interpolationShaderChain('upscale'))
      const framebuffer = gl.createFramebuffer(), reports = []
      try {
        for (const mode of ['upscale', 'restore']) {
          if (mode === 'restore') enhancer.downgradeToRestore()
          const size = enhancer.process(source, 160, 90, destination)
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, destination, 0)
          const left = new Uint8Array(4), right = new Uint8Array(4)
          gl.readPixels(size.width / 4, size.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, left)
          gl.readPixels(size.width * 3 / 4, size.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, right)
          reports.push({ mode, scale: enhancer.scale, ...size, left: [...left], right: [...right], error: gl.getError() })
        }
      } finally {
        enhancer.stop(); gl.deleteTexture(source); gl.deleteTexture(destination); gl.deleteFramebuffer(framebuffer)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
      return reports
    })
    console.log('FRAME_ENHANCER_SCALE', JSON.stringify(result))
    assert.deepEqual(result.map(entry => [entry.scale, entry.width, entry.height]), [[2, 320, 180], [1, 160, 90]])
    for (const entry of result) {
      assert.equal(entry.error, 0)
      assert.ok(entry.left[0] > entry.left[2] + 50, '增强和降档后的左侧必须保留红色有效画面')
      assert.ok(entry.right[2] > entry.right[0] + 50, '增强和降档后的右侧必须保留蓝色有效画面')
    }
  } finally { await browser.close() }
})
