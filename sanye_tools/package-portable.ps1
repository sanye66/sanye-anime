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
    Invoke-Step 'pnpm' @('--dir', 'sanye_pet', 'build:runner')
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
    # Restore the official Electron bytes. Electron-builder rewrites the
    # executable (icon/version resources plus the asar integrity resource), and
    # every rewritten, unsigned executable is a brand-new file that Windows Smart
    # App Control blocks by hash on machines that enforce it - even though the
    # untouched official binary runs there. The product icon therefore ships next
    # to the executable and is used by the shortcut, tray and window.
    $electron = Join-Path $repo 'sanye_desktop/node_modules/electron/dist/electron.exe'
    Copy-Item -LiteralPath $electron -Destination $exe -Force
    if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $electron -Algorithm SHA256).Hash) {
        throw 'Portable executable was modified; it must stay byte-identical to the official Electron binary'
    }
    Copy-Item -LiteralPath (Join-Path $repo 'sanye_desktop/assets/icon.ico') -Destination (Join-Path $source 'icon.ico')
    Write-Host 'Verify the packaged runtime does not borrow libraries from this build machine'
    Invoke-Step 'node' @('sanye_desktop/verify-runtime-closure.cjs', $source)
    Invoke-Step 'node' @('sanye_tools/verify-icon.cjs', $exe)
    $env:ELECTRON_RUN_AS_NODE = '1'
    $exeProbe = 'passed'
    try { Invoke-Step $exe @('--version') }
    catch {
        # A machine with Smart App Control (or an equivalent application-control
        # policy) blocks freshly built unsigned binaries by hash. That is an
        # environment condition, not a defect in this package, so record it and
        # fall back to the strongest verification still available here: run the
        # package's own app.asar runtime (PostgreSQL, the three business JARs,
        # client assets and seed) with an Electron binary of the same version.
        if ($_.Exception.Message -notmatch '应用程序控制策略|Device Guard|blocked by your organization|application control policy') { throw }
        $exeProbe = 'blocked-by-policy'
        Write-Warning "本机应用程序控制策略阻止了未签名的 $exe；改为用同版本 Electron 加载包内运行时做验收。"
        Invoke-Step 'node' @('sanye_desktop/verify-packaged-runtime.cjs', $source, '--electron', (Join-Path $repo 'sanye_desktop/node_modules/electron/dist/electron.exe'))
    }
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
    # 交付物的每个文件都属于同一次构建，因此 ZIP 条目统一写入本次构建时间。
    #
    # 不做这一步就会原样保留来源文件的时间戳：Electron 官方 dist 用 1980-01-01 这个固定值
    # （Chromium 的可复现构建约定），Java 运行时是 2026-06-11，PostgreSQL 是 2026-07-14……
    # 结果是一个包里混着从 1980 到现在几十种日期：接收方分不清这是哪一版，1980 还会被当成
    # 解压损坏或时间异常。构建编号本身已经精确到毫秒，直接用它作为统一时间最不歧义。
    # ZIP 的 DOS 时间戳精度是 2 秒，写入时会向下取整。先把构建时间对齐到偶数秒，ZIP 条目与
    # 桌面解压目录（publish-desktop.ps1 用同一个值）才会逐秒一致，便于核对。
    $buildTime = [datetime]::ParseExact($buildId, 'yyyyMMdd-HHmmss-fff', [Globalization.CultureInfo]::InvariantCulture)
    $buildTime = $buildTime.AddMilliseconds(-$buildTime.Millisecond).AddSeconds(-($buildTime.Second % 2))
    $archive = [IO.Compression.ZipFile]::Open($partial, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $files) {
            # 时间戳必须在打开条目写入之前设置：Create 模式下一旦条目被写过，.NET 会拒绝再改时间
            # （Cannot modify entry in Create mode after entry has been opened for writing）。
            # 因此不用 CreateEntryFromFile，改为自建条目 + 流式拷贝。
            $entry = $archive.CreateEntry("$name/$($file.path)", [IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = $buildTime
            # 变量名必须避开 $output（输出目录）与 $input（PowerShell 自动变量），否则会覆盖脚本状态。
            $sourceStream = [IO.File]::OpenRead((Join-Path $source $file.path))
            try {
                $entryStream = $entry.Open()
                try { $sourceStream.CopyTo($entryStream, 1MB) } finally { $entryStream.Dispose() }
            } finally { $sourceStream.Dispose() }
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
    $signatureStatus = (Get-AuthenticodeSignature -LiteralPath $exe).Status.ToString()
    $report = [ordered]@{ buildId = $buildId; zip = $zip; sha256 = $hash; verifiedEntries = $files.Count; icon = 'packaged icon.ico'; executable = 'official Electron binary (not modified)'; exeProbe = $exeProbe; signature = $signatureStatus; interactiveAcceptance = 'not-run'; log = Join-Path $logRoot "portable-$buildId.log" }
    if ($exeProbe -eq 'blocked-by-policy') {
        $report.runtimeAcceptance = 'passed via same-version Electron loader (package EXE blocked by this machine''s application control policy)'
    }
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
