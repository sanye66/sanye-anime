[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$CertificatePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
if ($env:OS -ne 'Windows_NT') { throw 'This script requires Windows.' }
$file = (Resolve-Path -LiteralPath $CertificatePath).ProviderPath
if ([IO.Path]::GetExtension($file) -ne '.cer') { throw 'Only a public DER .cer certificate is accepted.' }
if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $ExpectedSha256) { throw 'Certificate SHA-256 does not match the trusted fingerprint.' }
$bytes = [IO.File]::ReadAllBytes($file)
if ([Security.Cryptography.X509Certificates.X509Certificate2]::GetCertContentType($bytes) -ne [Security.Cryptography.X509Certificates.X509ContentType]::Cert) {
    throw 'The input must contain one public certificate, not a private-key archive.'
}
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($bytes)
try {
    if ($certificate.HasPrivateKey -or $certificate.Subject -ne 'CN=sanye_anime Local Test Signing' -or $certificate.Subject -ne $certificate.Issuer) {
        throw 'This is not the expected sanye_anime self-signed test certificate.'
    }
    $eku = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' })
    if ($eku.Count -ne 1 -or $eku[0].EnhancedKeyUsages.Count -ne 1 -or $eku[0].EnhancedKeyUsages[0].Value -ne '1.3.6.1.5.5.7.3.3') {
        throw 'Certificate must be restricted to code signing.'
    }
    $constraints = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.19' })
    if ($constraints.Count -gt 0 -and $constraints[0].CertificateAuthority) { throw 'CA certificates are not accepted.' }
    if (-not $Uninstall -and ((Get-Date) -lt $certificate.NotBefore -or (Get-Date) -gt $certificate.NotAfter)) { throw 'Certificate is not currently valid.' }
    Write-Host "Subject: $($certificate.Subject)"
    Write-Host "Thumbprint: $($certificate.Thumbprint)"
    Write-Host 'Scope: current Windows user only. This trusts code signed with this key, not just one EXE.'
    Write-Host 'This does not disable or override Smart App Control, WDAC, or other system security policies.'
    foreach ($name in @('Root', 'TrustedPublisher')) {
        $target = "Cert:\CurrentUser\$name\$($certificate.Thumbprint)"
        if ($Uninstall) {
            if ((Test-Path -LiteralPath $target) -and $PSCmdlet.ShouldProcess($target, 'Remove this test certificate')) {
                Remove-Item -LiteralPath $target
            }
        } elseif (-not (Test-Path -LiteralPath $target)) {
            if ($PSCmdlet.ShouldProcess($target, 'Trust this pinned code-signing test certificate')) {
                Import-Certificate -FilePath $file -CertStoreLocation "Cert:\CurrentUser\$name" | Out-Null
            }
        }
    }
} finally { $certificate.Dispose() }
