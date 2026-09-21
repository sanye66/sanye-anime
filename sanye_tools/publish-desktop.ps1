param([Parameter(Mandatory)][string]$PackagePath)
$ErrorActionPreference = 'Stop'
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
$exe = Join-Path $target '三叶动漫.exe'
$previous = $env:ELECTRON_RUN_AS_NODE
try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    & $exe --version
    if ($LASTEXITCODE -ne 0) { throw 'Desktop EXE preflight failed' }
} finally { $env:ELECTRON_RUN_AS_NODE = $previous }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktopTarget '三叶动漫.lnk'))
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = $target
$shortcut.IconLocation = "$exe,0"
$shortcut.Save()
# Recycle only verified desktop siblings. Running versions remain available.
Add-Type -AssemblyName Microsoft.VisualBasic
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
    if ($item.PSIsContainer) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($resolved, 'OnlyErrorDialogs', 'SendToRecycleBin') }
    else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($resolved, 'OnlyErrorDialogs', 'SendToRecycleBin') }
}
Write-Output "桌面交付完成：$exe"
