const path = require('node:path')
const { checkPostgresVisualCppRuntime } = require('./nativeDependencies.cjs')

const portableConfig = {
  directories: { output: path.join('dist', 'portable') },
  forceCodeSigning: false,
  // Do not rewrite the executable. Windows Smart App Control decides per file
  // hash and does not trust freshly built, unsigned binaries; an untouched
  // Electron binary keeps its existing reputation on recipient machines, while
  // every rewritten one becomes a brand-new unknown file. The application icon
  // travels next to the executable and is used by the desktop shortcut, tray and
  // window instead of being embedded into the PE resources.
  win: { signAndEditExecutable: false },
}

async function main() {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  if (process.env.CSC_LINK || process.env.WIN_CSC_LINK) {
    throw new Error('Remove CSC_LINK and WIN_CSC_LINK before building an unsigned local portable package')
  }
  await checkPostgresVisualCppRuntime(path.join(__dirname, 'runtime', 'postgres'))
  const { build, Platform } = require('electron-builder')
  if (process.argv[2]) portableConfig.directories.output = path.resolve(process.argv[2])
  await build({ projectDir: __dirname, targets: Platform.WINDOWS.createTarget(['dir']), config: portableConfig })
}

module.exports = { portableConfig }
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
