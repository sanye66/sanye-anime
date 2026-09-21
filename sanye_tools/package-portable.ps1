param([string]$OutputDirectory, [switch]$NoOpen, [switch]$PublishDesktop)
$ErrorActionPreference = 'Stop'
$null = Add-Type -AssemblyName System.IO.Compression
$null = Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repo 'sanye_desktop/dist/portable-packages' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
$buildId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$work = Join-Path $repo "sanye_desktop/dist/portable-$buildId"
$logRoot = Join-Path $repo 'sanye_deploy/.local/tool-logs'
New-Item -ItemType Directory -Path $output, $logRoot -Force | Out-Null
$lock = $null
$transcript = $false
$previousSeed = $env:SANYE_DESKTOP_SEED_BUNDLE
$previousNodeMode = $env:ELECTRON_RUN_AS_NODE
function Invoke-Step([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
Push-Location -LiteralPath $repo
try {
    $lock = [IO.File]::Open((Join-Path $logRoot 'portable-build.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    Start-Transcript -Path (Join-Path $logRoot "portable-$buildId.log") | Out-Null
    $transcript = $true
    . (Join-Path $repo 'sanye_deploy/use-local-toolchain.ps1')
    foreach ($command in @('node', 'pnpm', 'mvn')) { Get-Command $command -ErrorAction Stop | Out-Null }
    $pg = if ($env:SANYE_DESKTOP_PG_HOME) { $env:SANYE_DESKTOP_PG_HOME } else { 'C:/Program Files/PostgreSQL/18' }
    if (-not (Test-Path -LiteralPath (Join-Path $pg 'bin/postgres.exe'))) { throw 'PostgreSQL runtime missing; set SANYE_DESKTOP_PG_HOME' }
    Write-Host '[1/8] Verify dependencies and fixed seed resources'
    Invoke-Step 'pnpm' @('install', '--frozen-lockfile')
    $seed = Join-Path $repo "sanye_deploy/.local/portable-seed-$buildId"
    Invoke-Step 'node' @('sanye_tools/prepare-seed.mjs', $seed)
    $env:SANYE_DESKTOP_SEED_BUNDLE = $seed
    Write-Host '[2/8] Typecheck and build desktop frontend'
    Invoke-Step 'pnpm' @('typecheck')
    Invoke-Step 'pnpm' @('--dir', 'sanye_client', 'build:desktop')
    Write-Host '[3/8] Build Java services'
    Invoke-Step 'mvn' @('-B', '-ntp', '-f', 'sanye_server/pom.xml', '-pl', 'sanye-server-anime,sanye-server-search,sanye-server-favorite', '-am', 'package', '-DskipTests')
    Write-Host '[4/8] Prepare bundled runtime'
    Invoke-Step 'pnpm' @('desktop:prepare')
    Write-Host '[5/8] Desktop regression tests'
    Invoke-Step 'pnpm' @('test:desktop')
    Write-Host '[6/8] Build and verify application icon'
    Invoke-Step 'node' @('sanye_desktop/build-portable.cjs', $work)
    $source = Join-Path $work 'win-unpacked'
    $exe = Join-Path $source '三叶动漫.exe'
    Invoke-Step 'node' @('sanye_tools/verify-icon.cjs', $exe)
    $env:ELECTRON_RUN_AS_NODE = '1'
    Invoke-Step $exe @('--version')
    $env:ELECTRON_RUN_AS_NODE = $previousNodeMode
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '免安装使用说明.txt') -Destination $source
    Copy-Item -LiteralPath (Join-Path $repo 'sanye_desktop/启动三叶动漫.cmd') -Destination $source
    Invoke-Step 'node' @('sanye_desktop/artifact-manifest.mjs', $source)
    Write-Host '[7/8] Compress and verify every archived file'
    $name = "三叶动漫_免安装版_$buildId"
    $zip = Join-Path $output "$name.zip"
    $partial = "$zip.incomplete"
    $manifest = Get-Content (Join-Path $source 'artifact-manifest.json') -Raw | ConvertFrom-Json
    $files = @($manifest.files) + @([pscustomobject]@{ path = 'artifact-manifest.json'; size = (Get-Item (Join-Path $source 'artifact-manifest.json')).Length; sha256 = (Get-FileHash (Join-Path $source 'artifact-manifest.json')).Hash })
    $archive = [IO.Compression.ZipFile]::Open($partial, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $source $file.path), "$name/$($file.path)", [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $archive.Dispose() }
    $archive = [IO.Compression.ZipFile]::OpenRead($partial)
    try {
        if ($archive.Entries.Count -ne $files.Count) { throw 'Archive entry count mismatch' }
        foreach ($file in $files) {
            $entry = $archive.GetEntry("$name/$($file.path)")
            if (-not $entry -or $entry.Length -ne $file.size) { throw "Missing or truncated: $($file.path)" }
            $stream = $entry.Open()
            try { $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)) } finally { $stream.Dispose() }
            if ($hash -ne $file.sha256) { throw "Archive checksum mismatch: $($file.path)" }
        }
    } finally { $archive.Dispose() }
    Move-Item -LiteralPath $partial -Destination $zip
    $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
    $report = [ordered]@{ buildId = $buildId; zip = $zip; sha256 = $hash; verifiedEntries = $files.Count; icon = 'matched'; exeProbe = 'passed'; signature = (Get-AuthenticodeSignature -LiteralPath $exe).Status.ToString(); interactiveAcceptance = 'not-run'; log = Join-Path $logRoot "portable-$buildId.log" }
    [IO.File]::WriteAllText((Join-Path $output "$name.report.json"), ($report | ConvertTo-Json))
    Write-Host "[8/8] Completed: $zip" -ForegroundColor Green
    if ($PublishDesktop) { & (Join-Path $PSScriptRoot 'publish-desktop.ps1') -PackagePath $zip }
    if (-not $NoOpen) { Start-Process explorer.exe -ArgumentList "`"$output`"" }
} finally {
    $env:SANYE_DESKTOP_SEED_BUNDLE = $previousSeed
    $env:ELECTRON_RUN_AS_NODE = $previousNodeMode
    if ($transcript) { Stop-Transcript | Out-Null }
    if ($lock) { $lock.Dispose() }
    Pop-Location
}
