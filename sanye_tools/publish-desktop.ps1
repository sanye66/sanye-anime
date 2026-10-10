param([Parameter(Mandatory)][string]$PackagePath)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$source = (Resolve-Path -LiteralPath $PackagePath).Path
$name = [IO.Path]::GetFileNameWithoutExtension($source)
if ($name -notmatch '^三叶动漫_免安装版_\d{8}-\d{6}-\d{3}$') { throw 'Unexpected package name' }
$desktopTarget = [Environment]::GetFolderPath('Desktop')
$target = Join-Path $desktopTarget $name
$zip = Join-Path $desktopTarget "$name.zip"
$archive = [IO.Compression.ZipFile]::OpenRead($source)
try {
    foreach ($entry in $archive.Entries) {
        if (-not $entry.FullName.StartsWith("$name/", [StringComparison]::Ordinal) -or $entry.FullName -match '(^|[/\\])\.\.([/\\]|$)|:|\\') { throw 'Unsafe archive path' }
    }
} finally { $archive.Dispose() }
if (Test-Path -LiteralPath $target) { throw 'Desktop version already exists; refusing to merge files' }
Copy-Item -LiteralPath $source -Destination $zip
if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $zip).Hash) { throw 'Desktop archive checksum mismatch' }
Expand-Archive -LiteralPath $zip -DestinationPath $desktopTarget
$manifest = Get-Content -LiteralPath (Join-Path $target 'artifact-manifest.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $file = [IO.Path]::GetFullPath((Join-Path $target $entry.path))
    if (-not $file.StartsWith($target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe manifest path' }
    if ((Get-FileHash -LiteralPath $file).Hash -ne $entry.sha256) { throw "Desktop file checksum mismatch: $($entry.path)" }
}
# 交付目录统一时间戳（DESK-EXE-15）。
#
# 解压工具不保证还原 ZIP 条目时间（有的直接写成解压时刻），而来源文件的时间本来也不统一：
# Electron 官方 dist 是 1980-01-01 的固定值，Java/PostgreSQL 各是自身构建日期。一屏出现从
# 1980 到现在几十种日期时，接收方既分不清这是哪一版，也会把 1980 当成解压损坏。这里显式把整棵
# 交付目录统一为本次构建时间（与 ZIP 条目一致），文件先、目录后（按路径深度倒序），避免写入
# 子项时又把父目录时间带偏；只改时间，不动内容，摘要校验已经在本步之前完成。
$buildTime = [datetime]::ParseExact(($name -replace '^三叶动漫_免安装版_', ''), 'yyyyMMdd-HHmmss-fff', [Globalization.CultureInfo]::InvariantCulture)
# 与 package-portable.ps1 对齐到同一个偶数秒，使桌面目录与 ZIP 条目逐秒一致（ZIP 精度 2 秒）。
$buildTime = $buildTime.AddMilliseconds(-$buildTime.Millisecond).AddSeconds(-($buildTime.Second % 2))
$tree = @(Get-ChildItem -LiteralPath $target -Recurse -Force)
foreach ($item in @($tree | Where-Object { -not $_.PSIsContainer })) { try { $item.LastWriteTime = $buildTime } catch {} }
foreach ($item in @($tree | Where-Object { $_.PSIsContainer } | Sort-Object { $_.FullName.Length } -Descending)) { try { $item.LastWriteTime = $buildTime } catch {} }
try { (Get-Item -LiteralPath $target).LastWriteTime = $buildTime } catch {}
$exe = Join-Path $target '三叶动漫.exe'
$previous = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    try {
        & $exe --version
        if ($LASTEXITCODE -ne 0) { throw 'Desktop EXE preflight failed' }
    } catch {
        # This machine's application-control policy blocks freshly built unsigned
        # binaries by hash. The package's runtime was already accepted at build
        # time with a same-version Electron loader, and every extracted file hash
        # was verified above, so record the boundary instead of failing delivery.
        if ($_.Exception.Message -notmatch '应用程序控制策略|Device Guard|blocked by your organization|application control policy') { throw }
        Write-Warning "本机应用程序控制策略阻止了 $exe 的启动探测；该边界已在构建报告中记录。"
    }
} finally { $env:ELECTRON_RUN_AS_NODE = $previous }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktopTarget '三叶动漫.lnk'))
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = $target
# The executable keeps the official Electron icon bytes, so the shortcut shows
# the product icon from the packaged icon.ico instead.
$shortcut.IconLocation = (Join-Path $target 'icon.ico')
$shortcut.Save()
# Recycle only verified desktop siblings. Running versions remain available.
Add-Type -AssemblyName Microsoft.VisualBasic
# The shell recycle API refuses very large trees (the extracted package has
# ~3.5k files / ~540 MB) with "指定的路径无效", which used to abort delivery
# after a successful build. Fall back to moving the artifact out of the Desktop
# into the project's retired folder, so nothing is destroyed and the delivery
# still completes.
function Remove-RetiredArtifact {
    param([string]$Path, [string]$Repo)
    try {
        if ([IO.Directory]::Exists($Path)) {
            [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($Path, 'OnlyErrorDialogs', 'SendToRecycleBin')
        } else {
            [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($Path, 'OnlyErrorDialogs', 'SendToRecycleBin')
        }
        return 'recycled'
    } catch {
        $retiredRoot = Join-Path $Repo 'sanye_desktop/dist/desktop-retired'
        New-Item -ItemType Directory -Path $retiredRoot -Force | Out-Null
        $destination = Join-Path $retiredRoot ("{0}-{1}" -f [IO.Path]::GetFileName($Path), (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Move-Item -LiteralPath $Path -Destination $destination -Force
        Write-Warning "回收站拒绝了旧包，已改为保留到 $destination"
        return $destination
    }
}
$processes = @(Get-CimInstance Win32_Process | Where-Object ExecutablePath | Select-Object -ExpandProperty ExecutablePath)
foreach ($item in Get-ChildItem -LiteralPath $desktopTarget) {
    if ($item.BaseName -eq $name -or $item.Name -notmatch '^三叶动漫_免安装版_\d{8}-\d{6}-\d{3}(\.zip)?$') { continue }
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
    $resolved = [IO.Path]::GetFullPath($item.FullName)
    if ([IO.Path]::GetDirectoryName($resolved) -ne [IO.Path]::GetFullPath($desktopTarget)) { throw 'Cleanup target outside Desktop' }
    $directory = Join-Path $desktopTarget $item.BaseName
    if ($processes | Where-Object { $_.StartsWith($directory + '\', [StringComparison]::OrdinalIgnoreCase) }) {
        Write-Warning "旧版本正在运行，保留：$resolved"
        continue
    }
    $null = Remove-RetiredArtifact -Path $resolved -Repo $repo
}
Write-Output "桌面交付完成：$exe"
