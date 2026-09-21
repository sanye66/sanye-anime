$ErrorActionPreference = 'Stop'
$directory = Join-Path ([IO.Path]::GetTempPath()) ('sanye-cert-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $directory | Out-Null
$key = [Security.Cryptography.RSA]::Create(3072)
$certificate = $null
try {
    $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
        'CN=sanye_anime Local Test Signing', $key,
        [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $oids = [Security.Cryptography.OidCollection]::new()
    $oids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3')) | Out-Null
    $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids, $true))
    $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
    $certificate = $request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-1), [DateTimeOffset]::Now.AddDays(1))
    $file = Join-Path $directory 'test.cer'
    [IO.File]::WriteAllBytes($file, $certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    & "$PSScriptRoot/install-test-certificate.ps1" -CertificatePath $file -ExpectedSha256 $hash -WhatIf
    foreach ($store in @('Root', 'TrustedPublisher')) {
        if (Test-Path -LiteralPath "Cert:\CurrentUser\$store\$($certificate.Thumbprint)") { throw 'WhatIf unexpectedly installed a certificate' }
    }
    $rejected = $false
    try { & "$PSScriptRoot/install-test-certificate.ps1" -CertificatePath $file -ExpectedSha256 ('0' * 64) -WhatIf }
    catch { if ($_.Exception.Message -notmatch 'SHA-256 does not match') { throw }; $rejected = $true }
    if (-not $rejected) { throw 'Wrong fingerprint was accepted' }
    Write-Output 'PASS: installation preview, unchanged trust stores, wrong fingerprint rejection'
} finally {
    if ($certificate) { $certificate.Dispose() }
    $key.Dispose()
    Remove-Item -LiteralPath (Join-Path $directory 'test.cer') -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $directory -ErrorAction SilentlyContinue
}
