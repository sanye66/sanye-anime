import { rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { importSeedBundle } from '../sanye_desktop/seed-bundle.mjs'

const destination = process.argv[2]
if (!destination) throw new Error('Missing seed snapshot destination')
const source = process.env.SANYE_DESKTOP_SEED_BUNDLE || fileURLToPath(new URL('../sanye_desktop/runtime/', import.meta.url))
await importSeedBundle(source, destination, process.env.SANYE_DESKTOP_SEED_BUNDLE ? 'manifest.json' : 'seed-manifest.json')
await rename(`${destination}/seed-manifest.json`, `${destination}/manifest.json`)
console.log('Verified fixed seed and cover snapshot; no database export performed.')
