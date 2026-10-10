param(
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$Thumbprint
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$Thumbprint"
if (-not $certificate.HasPrivateKey -or $certificate.Subject -ne 'CN=sanye_anime Local Test Signing') {
    throw 'Expected the local test signing identity with its private key.'
}
$signature = Set-AuthenticodeSignature -LiteralPath $FilePath -Certificate $certificate -HashAlgorithm SHA256
if ($signature.Status -ne 'Valid') { throw "Test signature validation failed: $($signature.Status) $($signature.StatusMessage)" }
Write-Output "Local test signature verified: $FilePath"
