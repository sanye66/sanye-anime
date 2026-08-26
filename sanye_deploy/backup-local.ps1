param(
    [string]$DbName = 'sanye_anime',
    [int]$Keep = 7
)

<#
  本地联调数据库备份脚本（sanye_anime，T-G-03 第一批）
  用途：备份本地联调 PostgreSQL（127.0.0.1:5433，sanye / 123456）
  用法：
    .\sanye_deploy\backup-local.ps1                       # 备份并保留最近 7 份
    .\sanye_deploy\backup-local.ps1 -Keep 14              # 保留最近 14 份
  恢复：
    psql -U sanye -h 127.0.0.1 -p 5433 -d postgres -c "DROP DATABASE IF EXISTS sanye_anime;"
    psql -U sanye -h 127.0.0.1 -p 5433 -d postgres -c "CREATE DATABASE sanye_anime OWNER sanye;"
    pg_restore -U sanye -h 127.0.0.1 -p 5433 -d sanye_anime -c .\sanye_deploy\backups\sanye_anime-<时间戳>.dump
#>

$ErrorActionPreference = 'Stop'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$backupDir = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $backupDir "sanye_anime-$stamp.dump"
$env:PGPASSWORD = '123456'

# 先写入自定义格式 dump，再检查文件存在且非空，避免把失败结果当作备份。
Write-Host "[backup] 开始备份 $DbName -> $file"
& (Join-Path $pgBin 'pg_dump.exe') -U sanye -h 127.0.0.1 -p 5433 -Fc -f $file $DbName
if ($LASTEXITCODE -ne 0) { throw "pg_dump 失败（exit $LASTEXITCODE）" }
if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) { throw '备份文件为空' }

$size = (Get-Item $file).Length
Write-Host "[backup] 备份完成：$file（$size bytes）"

# 按修改时间保留最近 Keep 份，旧文件仅限于备份目录内清理。
Get-ChildItem $backupDir -Filter 'sanye_anime-*.dump' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $Keep |
    ForEach-Object {
        Write-Host "[backup] 清理旧备份：$($_.Name)"
        Remove-Item -LiteralPath $_.FullName -Force
    }

$retained = (Get-ChildItem $backupDir -Filter 'sanye_anime-*.dump' | Measure-Object).Count
Write-Host "[backup] 当前保留 $retained 份备份"
