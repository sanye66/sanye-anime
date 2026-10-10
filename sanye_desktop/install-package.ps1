[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$certificateFile = Join-Path $PSScriptRoot 'sanye_test.cer'
$installer = Join-Path $PSScriptRoot 'sanye_anime Setup 0.1.0.exe'
$certificateHash = 'A0F645EFC3CF14F3EA92D96C9532AACC6FB2F5FD05AE2C2682B4373AFA248E1A'
$installerHash = '66AEE7A9FD43F47730E19BD26B955721E4014A1AB84F178FB1FEC10E1546BA2A'
try {
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $installerHash) { throw 'Installer checksum mismatch' }
    & (Join-Path $PSScriptRoot 'install-test-certificate.ps1') -CertificatePath $certificateFile -ExpectedSha256 $certificateHash -WhatIf
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne '79398737B4195416A6EC21802900F0D6F34F2118') { throw 'Unexpected installer signer' }
    $policy = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -ErrorAction SilentlyContinue
    if ($policy.VerifiedAndReputablePolicyState -eq 1) { throw 'Smart App Control is enforcing. This local test certificate cannot authorize this installer. Installation stopped before importing trust.' }
    if ($CheckOnly) { Write-Output "Package checks passed; trust unchanged. Signature status: $($signature.Status)"; exit 0 }
    & (Join-Path $PSScriptRoot 'install-test-certificate.ps1') -CertificatePath $certificateFile -ExpectedSha256 $certificateHash
    if ((Get-AuthenticodeSignature -LiteralPath $installer).Status -ne 'Valid') { throw 'Installer signature is not trusted; installation stopped' }
    $process = Start-Process -FilePath $installer -PassThru -Wait
    if ($process.ExitCode -eq 0) {
        try {
            Remove-Item -LiteralPath $installer -ErrorAction Stop
            Write-Output 'Installation completed; installer package deleted.'
        } catch {
            Write-Warning "Installation completed, but the installer package could not be deleted. You can delete it manually: $installer"
        }
    }
    exit $process.ExitCode
} catch { Write-Error $_; exit 1 }
