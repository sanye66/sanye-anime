import { chromium } from 'playwright'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const output = resolve(import.meta.dirname, '../sanye_deploy/.local/player-quality/generated')
const origin = process.env.SANYE_FRONTEND_URL ?? 'http://127.0.0.1:5188'
const chosen = process.argv.includes('--scene') ? process.argv[process.argv.indexOf('--scene') + 1] : null
const version = process.argv.includes('--version') ? process.argv[process.argv.indexOf('--version') + 1] : 'v1'
const sceneNames = ['pan', 'fast-action', 'deformation', 'occlusion', 'fine-lines-subtitles', 'gradient', 'scene-cut', 'low-bitrate-noise']
if ((chosen && !sceneNames.includes(chosen)) || !/^v[0-9]+$/.test(version)) throw new Error('Invalid scene or version')
const fileFor = name => join(output, `${name}${version === 'v1' ? '' : `-${version}`}.mp4`)
for (const name of chosen ? [chosen] : sceneNames) {
  try { await access(fileFor(name)); throw new Error(`Generated media already exists: ${fileFor(name)}. Choose a new --version.`) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.route('**/api/v1/**', route => route.fulfill({ status: 503, body: '' }))
  await page.goto(origin)
  await page.exposeFunction('saveQualityScene', async (name, bytes) => {
    const file = fileFor(name)
    const buffer = Buffer.from(bytes)
    await writeFile(file, buffer, { flag: 'wx' })
    console.log(JSON.stringify({ scene: name, file, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') }))
  })
  await page.evaluate(async ({ chosen, version }) => {
    const { FFmpeg } = await import('/node_modules/@ffmpeg/ffmpeg/dist/esm/index.js')
    const { interpolationAssets } = await import('/src/video/interpolation.ts')
    const engine = new FFmpeg()
    await engine.load(interpolationAssets)
    const recipes = [
      ['pan', ['-f', 'lavfi', '-i', 'testsrc2=size=480x180:rate=30:duration=3', '-vf', 'crop=320:180:x=mod(n*3\\,160):y=0']],
      ['fast-action', ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=3', '-vf', 'scroll=horizontal=0.08']],
      ['deformation', ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=3', '-vf', 'geq=r=p(X+12*sin(Y/18+N/3)\\,Y):g=p(X+12*sin(Y/18+N/3)\\,Y):b=p(X+12*sin(Y/18+N/3)\\,Y)']],
      ['occlusion', ['-f', 'lavfi', '-i', 'testsrc2=size=480x180:rate=30:duration=3', '-vf', 'crop=320:180:x=mod(n*3\\,160):y=0,drawbox=x=120:y=40:w=70:h=100:c=black:t=fill']],
      ['fine-lines-subtitles', ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=3', '-vf', [
        'drawgrid=w=8:h=8:t=1:c=white', 'drawbox=x=76:y=136:w=81:h=36:c=black:t=fill',
        'drawbox=x=84:y=141:w=3:h=25:c=white:t=fill', 'drawbox=x=99:y=141:w=3:h=25:c=white:t=fill',
        'drawbox=x=84:y=152:w=18:h=3:c=white:t=fill', 'drawbox=x=118:y=141:w=24:h=3:c=white:t=fill',
        'drawbox=x=128:y=141:w=3:h=25:c=white:t=fill', 'drawbox=x=118:y=163:w=24:h=3:c=white:t=fill'
      ].join(',')]],
      ['gradient', ['-f', 'lavfi', '-i', 'color=c=gray:size=320x180:rate=30:duration=3', '-vf', 'geq=r=255*X/W:g=255*X/W:b=255*X/W']],
      ['scene-cut', ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=1.5', '-f', 'lavfi', '-i', 'color=c=blue:size=320x180:rate=30:duration=1.5', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]']],
      ['low-bitrate-noise', ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=3', '-vf', 'noise=alls=18:allf=t:all_seed=42']]
    ]
    try {
      for (const [name, input] of recipes) {
        if (chosen && name !== chosen) continue
        const target = `${name}-${version}.mp4`
        const bitrate = name === 'low-bitrate-noise' ? '75k' : '800k'
        const status = await engine.exec([...input, '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', bitrate,
          '-pix_fmt', 'yuv420p', '-an', target], 90000)
        if (status !== 0) throw new Error(`FFmpeg failed on ${name}: ${status}`)
        await window.saveQualityScene(name, Array.from(await engine.readFile(target)))
        await engine.deleteFile(target)
      }
    } finally { engine.terminate() }
  }, { chosen, version })
} finally { await browser.close() }
