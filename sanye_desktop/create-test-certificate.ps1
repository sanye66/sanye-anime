[CmdletBinding(SupportsShouldProcess, DefaultParameterSetName = 'Until')]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../sanye_deploy/.local/certificates'),
    [Parameter(ParameterSetName = 'Days')][ValidateRange(1, 36500)][int]$ValidDays,
    [Parameter(ParameterSetName = 'Until')][datetime]$NotAfter = [datetime]::SpecifyKind([datetime]::new(9999, 12, 31), [DateTimeKind]::Utc)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This script requires Windows.' }
Get-Command New-SelfSignedCertificate -ErrorAction Stop | Out-Null
$output = [IO.Path]::GetFullPath($OutputDirectory)
$subject = 'CN=sanye_anime Local Test Signing'
$expires = if ($PSCmdlet.ParameterSetName -eq 'Days') { (Get-Date).AddDays($ValidDays) } else { $NotAfter }
if ($expires -le (Get-Date)) { throw 'Certificate expiration must be in the future.' }
if (-not $PSCmdlet.ShouldProcess('Cert:\CurrentUser\My', "Create a non-exportable test signing key for $subject")) { return }

New-Item -ItemType Directory -Path $output -Force | Out-Null
$certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject `
    -FriendlyName 'sanye_anime local test signing only' -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable `
    -NotAfter $expires
$publicFile = Join-Path $output ("sanye_test_{0}.cer" -f $certificate.Thumbprint)
Export-Certificate -Cert $certificate -FilePath $publicFile -Type CERT | Out-Null
$sha256 = (Get-FileHash -LiteralPath $publicFile -Algorithm SHA256).Hash
$metadata = [ordered]@{
    subject = $certificate.Subject
    thumbprint = $certificate.Thumbprint
    certificateSha256 = $sha256
    expires = $certificate.NotAfter.ToUniversalTime().ToString('o')
    publicCertificate = $publicFile
    privateKey = 'Non-exportable; retained in the creator CurrentUser\My store'
    purpose = 'Local testing only; does not establish public trust or Smart App Control acceptance'
}
$metadata | ConvertTo-Json | Set-Content -LiteralPath ($publicFile + '.json') -Encoding UTF8
Write-Output ([pscustomobject]$metadata)
Write-Host ('Build identity: $env:SANYE_DESKTOP_CERT_SHA1 = ''{0}''' -f $certificate.Thumbprint)
Write-Host 'Only distribute the .cer file. Verify its SHA-256 through a trusted channel before installation.'
Write-Host 'No certificate was added to Root or TrustedPublisher.'
