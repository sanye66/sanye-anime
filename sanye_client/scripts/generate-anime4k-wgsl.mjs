/**
 * 生成 Anime4K 卷积段的 WGSL（VQ-57）。
 *
 * 背景：Android 侧的画质增强跑在 WebGL1（anime4k.js 的 GLSL 片段着色器），依赖
 * WEBGL_color_buffer_float 扩展；缺这个扩展的机型只能退回「性能」档，画质反而更差。
 * 这一轮把同一条链路搬到 WebGPU，前提是「像素输出必须与原链路同源」，因此不重写算法，
 * 而是把 anime4k.js 里机器生成的卷积段机械转译成 WGSL。
 *
 * 只转译规则模板能覆盖的部分：go_N 采样宏、mat4/vec4/vec2 字面量累加、gl_FragColor 赋值。
 * 需要运行时通道选择的收尾趟（Upscale 的 2× 映射）与带循环的 Clamp_Highlights 由
 * anime4kWgslManual.ts 手写，生成文件里只放机械部分。
 *
 * 用法：node sanye_client/scripts/generate-anime4k-wgsl.mjs
 * 幂等：输出与 anime4k.js 的当前版本一一对应，门禁会重跑生成器并比对结果。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const glslRoot = path.join(root, 'node_modules/anime4k.js/dist/glsl')
const output = path.join(root, 'src/video/anime4kWgsl.generated.ts')

/** 需要转译的着色器与其「哪些趟是规则卷积」的界定。 */
const sources = [
  { key: 'restoreS', file: 'Restore/Anime4K_Restore_CNN_S.mjs', conv: [0, 1, 2, 3], tail: 'conv' },
  // Restore_CNN_M 的收尾趟不是规则卷积（引用 g_0 之类的中间变量），无法机械转译，
  // 因此不纳入生成范围：「锐化」档保持走 WebGL，等它的收尾趟手写完再开放。
  { key: 'upscaleS', file: 'Upscale/Anime4K_Upscale_CNN_x2_S.mjs', conv: [0, 1, 2, 3], tail: 'manual' },
]

function stagesOf(text) {
  return [...text.matchAll(/const fragment_\d+_shader = \`([\s\S]*?)\`/g)].map((match) => match[1])
}

function mainBody(glsl) {
  const start = glsl.indexOf('void main() {')
  if (start < 0) throw new Error('未找到 main')
  return glsl.slice(start + 'void main() {'.length, glsl.lastIndexOf('}'))
}

/** 采样宏 → WGSL 表达式。返回 { relu } 说明该趟是否带 ReLU 分支。 */
function reluOf(glsl) {
  if (/#define go_1\(x_off, y_off\) \(max\(-\(/.test(glsl)) return true
  return false
}

function translateConvPass(glsl) {
  const relu = reluOf(glsl)
  let body = mainBody(glsl)
  // 逐语句：mat4(...) * go_N(...) / vec4(...) 累加 / gl_FragColor 赋值。
  body = body.replace(/vec4\s+(\w+)\s*=\s*/g, 'var $1: vec4f = ')
  body = body.replace(/\bmat4\(/g, 'mat4x4f(')
  body = body.replace(/\bvec4\(/g, 'vec4f(')
  body = body.replace(/\bvec2\(/g, 'vec2f(')
  // 收尾趟的残差项：result + MAIN_tex(MAIN_pos) 读的是本着色器的外部输入（绑定 3）。
  // 必须先整体匹配，否则会被拆成「return result;+ …」。
  body = body.replace(/gl_FragColor\s*=\s*(\w+)\s*\+\s*MAIN_tex\(MAIN_pos\)\s*;?/g,
    'return $1 + textureSampleLevel(secondary, secondarySampler, uv, 0.0);')
  body = body.replace(/gl_FragColor\s*=\s*(\w+)\s*;?/g, 'return $1;')
  // go_0（无 ReLU 分支时）与 go_0/go_1（ReLU 分支）都落到同一个采样函数上。
  body = body.replace(/go_0\(([^()]*)\)/g, (_all, args) => 'sampleAt(uv, ' + args + ')')
  if (relu) body = body.replace(/go_1\(([^()]*)\)/g, (_all, args) => 'sampleReLU(-1.0, uv, ' + args + ')')
  const indent = body.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => '  ' + line).join('\n')
  const sampleHelpers = relu
    ? [
        'fn sampleAt(uv: vec2f, x: f32, y: f32) -> vec4f { return textureSampleLevel(source, sourceSampler, uv + params.texel * vec2f(x, y), 0.0); }',
        'fn sampleReLU(sign: f32, uv: vec2f, x: f32, y: f32) -> vec4f { return max(sampleAt(uv, x, y) * sign, vec4f(0.0)); }',
      ]
    : ['fn sampleAt(uv: vec2f, x: f32, y: f32) -> vec4f { return textureSampleLevel(source, sourceSampler, uv + params.texel * vec2f(x, y), 0.0); }']
  return [
    // 与手写段落共用同一份 48 字节 uniform 布局：resolution 输出尺寸、texel 输入像素步长、
    // sourceSize 输入像素尺寸（上采样收尾趟要用它算 fract），其余为对齐填充。
    'struct Params { resolution: vec2f, texel: vec2f, sourceSize: vec2f, pad0: vec2f, pad1: vec2f, pad2: vec2f }',
    '@group(0) @binding(0) var source: texture_2d<f32>;',
    '@group(0) @binding(1) var sourceSampler: sampler;',
    '@group(0) @binding(2) var<uniform> params: Params;',
    '@group(0) @binding(3) var secondary: texture_2d<f32>;',
    '@group(0) @binding(4) var secondarySampler: sampler;',
    '',
    ...sampleHelpers,
    '',
    '@vertex fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {',
    '  let x = f32((index << 1u) & 2u);',
    '  let y = f32(index & 2u);',
    '  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);',
    '}',
    '',
    '@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {',
    '  let uv = position.xy / params.resolution;',
    ...indent.split('\n'),
    '}',
  ].join('\n')
}


/** 生成后自检：不得残留 GLSL 语法，也不得出现未转译的宏。 */
function assertTranslated(key, index, code) {
  const leftovers = [/texture2D/, /gl_FragColor/, /\bvec[234]\(/, /\bmat[234]\(/, /\bivec[234]/, /#define/, /precision \w+ float/, /\bvarying\b/, /uniform sampler2D/, /MAIN_/, /conv2d_/]
  for (const pattern of leftovers) {
    if (pattern.test(code)) throw new Error(key + ' 第 ' + index + ' 趟仍含 GLSL 语法：' + pattern)
  }
  if (!/return \w+([^\n]*);/.test(code)) throw new Error(key + ' 第 ' + index + ' 趟没有返回值')
  // 未转译的裸标识符（例如 Restore_CNN_M 收尾趟的 g_0）：宁可在生成期失败，也不产出无效 WGSL。
  // 未转译的裸标识符（例如 Restore_CNN_M 收尾趟引用的 g_0）：宁可在生成期失败，也不产出无效 WGSL。
  const stray = code.match(/\b(g_\d+|conv2d\w*|MAIN_\w+)\b/)
  if (stray) throw new Error(key + ' 第 ' + index + ' 趟出现未转译标识符：' + stray[0])
  if (/;\s*[+*\/]|;;/.test(code)) throw new Error(key + ' 第 ' + index + ' 趟语句拼接破损')
  if (/\)\s*;\s*\w+\s*\(/.test(code)) throw new Error(key + ' 第 ' + index + ' 趟在 return 之后还有表达式')
}

const entries = []
for (const source of sources) {
  const text = await readFile(path.join(glslRoot, source.file), 'utf8')
  const stages = stagesOf(text)
  const passes = source.conv.map((index) => { const code = translateConvPass(stages[index]); assertTranslated(source.key, index, code); return code })
  entries.push('  ' + source.key + ': [' + passes.map((code) => '\n    ' + JSON.stringify(code) + ',').join('') + '\n  ],')
}

const file = [
  '// 由 scripts/generate-anime4k-wgsl.mjs 生成，请勿手改。',
  '// 来源：anime4k.js/dist/glsl 的卷积段；手写的 Clamp_Highlights 与上采样收尾趟见 anime4kWgslManual.ts。',
  '',
  'export const ANIME4K_WGSL_CONV: Record<string, readonly string[]> = {',
  ...entries,
  '}',
  '',
].join('\n')
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, file, 'utf8')
console.log('已生成 ' + output + '（' + file.length + ' 字节）')
