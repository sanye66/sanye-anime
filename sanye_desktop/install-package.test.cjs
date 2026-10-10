const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

for (const scenario of [
  { name: 'success', code: 0, deleted: true },
  { name: 'cancelled', code: 1 },
  { name: 'failed', code: 2 },
  { name: 'check', code: 0 },
  { name: 'invalid-hash', code: 1 },
  { name: 'locked', code: 0 },
  { name: 'sac-enforced', code: 1 },
]) {
  test(`installer cleanup: ${scenario.name}`, { skip: process.platform !== 'win32' }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanye-install-'))
    try {
      fs.copyFileSync(path.join(__dirname, 'install-package.ps1'), path.join(directory, 'install-package.ps1'))
      fs.writeFileSync(path.join(directory, 'install-test-certificate.ps1'), '')
      const installer = path.join(directory, 'sanye_anime Setup 0.1.0.exe')
      fs.writeFileSync(installer, 'synthetic installer')
      fs.writeFileSync(path.join(directory, 'keep.zip'), 'unrelated archive')
      fs.writeFileSync(path.join(directory, 'run.ps1'), `
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1')
function Import-Module { }
function Get-ItemProperty { [pscustomobject]@{ VerifiedAndReputablePolicyState = ${scenario.name === 'sac-enforced' ? 1 : 0} } }
function Get-FileHash { [pscustomobject]@{ Hash = '${scenario.name === 'invalid-hash' ? 'invalid' : '66AEE7A9FD43F47730E19BD26B955721E4014A1AB84F178FB1FEC10E1546BA2A'}' } }
function Get-AuthenticodeSignature { [pscustomobject]@{ Status = 'Valid'; SignerCertificate = [pscustomobject]@{ Thumbprint = '79398737B4195416A6EC21802900F0D6F34F2118' } } }
function Start-Process {
    param($FilePath, [switch]$PassThru, [switch]$Wait)
    if (-not $Wait -or -not $PassThru -or -not (Test-Path -LiteralPath $FilePath)) { throw 'Invalid installer launch' }
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'started'), 'started')
    [pscustomobject]@{ ExitCode = ${scenario.code} }
}
${scenario.name === 'locked' ? "function Remove-Item { param($LiteralPath, $ErrorAction); throw 'File is locked' }" : ''}
& (Join-Path $PSScriptRoot 'install-package.ps1') ${scenario.name === 'check' ? '-CheckOnly' : ''}
exit $LASTEXITCODE
`)
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, 'run.ps1')], { encoding: 'utf8' })
      assert.equal(result.status, scenario.code, result.stdout + result.stderr)
      assert.equal(fs.existsSync(installer), !scenario.deleted)
      assert.equal(fs.existsSync(path.join(directory, 'started')), !['check', 'invalid-hash', 'sac-enforced'].includes(scenario.name))
      if (scenario.name === 'sac-enforced') assert.match(result.stderr, /Smart App Control is enforcing/)
      assert.equal(fs.readFileSync(path.join(directory, 'keep.zip'), 'utf8'), 'unrelated archive')
      if (scenario.name === 'locked') assert.match(result.stdout, /could not be deleted/)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
}
