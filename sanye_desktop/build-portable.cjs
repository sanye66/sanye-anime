const path = require('node:path')
const { checkPostgresVisualCppRuntime } = require('./nativeDependencies.cjs')

const portableConfig = {
  directories: { output: path.join('dist', 'portable') },
  forceCodeSigning: false,
  win: { signAndEditExecutable: true },
}

async function main() {
  // Resource editing also embeds the icon, even when no signing identity is used.
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
