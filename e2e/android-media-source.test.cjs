const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '../sanye_client')] }))

const source = fs.readFileSync(path.resolve(__dirname, '../sanye_client/src/platform/android/mediaSource.ts'), 'utf8')
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const moduleContext = { exports: {} }
new Function('module', 'exports', javascript)(moduleContext, moduleContext.exports)
const { mediaType, playbackType } = moduleContext.exports

test('仅接受不含临时凭证的直链媒体', () => {
  assert.equal(mediaType('https://cdn.example.org/season/01.MP4'), 'mp4')
  assert.equal(mediaType('https://cdn.example.org/season/index.m3u8'), 'hls')
  assert.equal(mediaType('https://example.org/show/1'), null)
  assert.equal(mediaType('https://example.org/video.mp4?token=secret'), null)
  assert.equal(mediaType('http://example.org/video.mp4'), null)
  assert.equal(mediaType('https://user:password@example.org/video.mp4'), null)
  assert.equal(mediaType('https://127.0.0.1/video.mp4'), null)
  assert.equal(mediaType('https://device.local/video.mp4'), null)
  assert.equal(playbackType('https://cdn.example.org/index.m3u8?token=short-lived'), 'hls')
  // 来源解析出的地址可能没有后缀：直链校验放宽为按 HLS 处理，保存用的媒体校验仍要求明确后缀。
  assert.equal(playbackType('https://cdn.example.org/api/play/4570086?sign=abc'), 'hls')
  assert.equal(playbackType('https://10.0.0.8/hls/index.m3u8'), 'hls')
  assert.equal(mediaType('https://example.org/api/play/4570086'), null)
})
