param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist/distribution'),
    [ValidatePattern('^[a-zA-Z0-9.-]*$')][string]$BuildId = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$source = Join-Path $PSScriptRoot 'dist/self-signed'
$installerPath = Join-Path $source 'sanye_anime Setup 0.1.0.exe'
$installerSignature = Get-AuthenticodeSignature -LiteralPath $installerPath
if ($installerSignature.Status -ne 'Valid' -or -not $installerSignature.SignerCertificate) {
    throw 'Distribution requires a valid signed installer.'
}
if ($installerSignature.SignerCertificate.Subject -eq $installerSignature.SignerCertificate.Issuer) {
    throw 'Refusing to distribute a self-signed installer. Smart App Control requires a trusted/reputable Windows signing identity.'
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$name = 'sanye_anime-0.1.0-windows-x64-test'
if ($BuildId) { $name += '-' + $BuildId }
$zipPath = Join-Path $output ($name + '.zip')
if (Test-Path -LiteralPath $zipPath) { throw 'Distribution exists; archive it before building another candidate.' }
$readmeName = -join ([char[]]@(0x5B89, 0x88C5, 0x8BF4, 0x660E))
$readmeName += '.txt'
$files = @('install-with-certificate.cmd', 'install-package.ps1', 'install-test-certificate.ps1', 'sanye_test.cer', 'sanye_anime Setup 0.1.0.exe', $readmeName)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot $readmeName) -Destination (Join-Path $source $readmeName) -Force
foreach ($script in @('install-with-certificate.cmd', 'install-package.ps1', 'install-test-certificate.ps1')) {
    $text = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $script))
    if ($script -eq 'install-package.ps1') {
        $installerHash = (Get-FileHash -LiteralPath (Join-Path $source 'sanye_anime Setup 0.1.0.exe') -Algorithm SHA256).Hash
        $text = $text -replace '(?m)^\$installerHash = ''[A-Fa-f0-9]{64}''', ('$installerHash = ''' + $installerHash + '''')
    }
    [IO.File]::WriteAllText((Join-Path $source $script), $text, (New-Object Text.UTF8Encoding($script.EndsWith('.ps1'))))
}
& $env:ComSpec /d /c "`"$source/install-with-certificate.cmd`" --check"
if ($LASTEXITCODE -ne 0) { throw 'Distribution preflight failed' }
foreach ($file in $files) { if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) { throw "Missing distribution file: $file" } }
$archive = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $source $file), "$name/$file", [IO.Compression.CompressionLevel]::NoCompression) | Out-Null
    }
} finally { $archive.Dispose() }
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($archive.Entries.Count -ne $files.Count) { throw 'Unexpected archive entries' }
    foreach ($entry in $archive.Entries) {
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose(); $sha.Dispose() }
        $expected = (Get-FileHash -LiteralPath (Join-Path $source $entry.Name) -Algorithm SHA256).Hash
        if ($actual -ne $expected) { throw "Archive verification failed: $($entry.Name)" }
    }
} finally { $archive.Dispose() }
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
"$hash  $name.zip" | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding ASCII
Write-Output "Verified $($files.Count) archive entries: $zipPath"
Write-Output "SHA256: $hash"
