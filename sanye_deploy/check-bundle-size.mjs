import { readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const KIB = 1024
const budgets = [
  { name: 'client', directory: 'sanye_client/dist', gzipKiB: 75 },
  { name: 'admin', directory: 'sanye_admin/dist', gzipKiB: 220 },
  { name: 'pet', directory: 'sanye_pet/dist/renderer', gzipKiB: 70 },
]

function entryAssets(html) {
  const paths = new Set()
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const asset = match[1]
    if (asset.includes('/assets/')) paths.add(asset.replace(/^\.?\//, ''))
  }
  return [...paths]
}

async function measureEntry(directory) {
  const absoluteDirectory = resolve(directory)
  const html = await readFile(resolve(absoluteDirectory, 'index.html'), 'utf8')
  let rawBytes = 0
  let gzipBytes = 0
  const assets = entryAssets(html)
  for (const asset of assets) {
    const path = resolve(absoluteDirectory, asset.replace(/^\//, ''))
    const content = await readFile(path)
    rawBytes += (await stat(path)).size
    gzipBytes += gzipSync(content).byteLength
  }
  return { assets, rawBytes, gzipBytes }
}

let failed = false
console.log('Frontend entry bundle budgets:')
for (const budget of budgets) {
  const result = await measureEntry(budget.directory)
  const rawKiB = result.rawBytes / KIB
  const gzipKiB = result.gzipBytes / KIB
  const status = gzipKiB <= budget.gzipKiB ? 'PASS' : 'FAIL'
  if (status === 'FAIL') failed = true
  console.log(`${status} ${budget.name}: ${rawKiB.toFixed(1)} KiB raw, ${gzipKiB.toFixed(1)} KiB gzip, budget ${budget.gzipKiB} KiB gzip`)
}

if (failed) {
  process.exitCode = 1
}
