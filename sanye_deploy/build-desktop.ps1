[CmdletBinding()]
param(
  [switch]$SkipServerBuild,
  [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
  function Invoke-Step([string]$Name, [scriptblock]$Action) { & $Action; if ($LASTEXITCODE -ne 0) { throw "$Name 失败，退出码 $LASTEXITCODE" } }
  Write-Host '[1/5] 构建桌面前端'
  Invoke-Step '桌面前端构建' { pnpm --dir sanye_client build:desktop }
  if (-not $SkipServerBuild) {
    Write-Host '[2/5] 构建桌面业务服务'
    Invoke-Step '服务端构建' { mvn -B -ntp -f sanye_server/pom.xml -pl sanye-server-anime,sanye-server-search,sanye-server-favorite -am package -DskipTests }
  } else { Write-Host '[2/5] 跳过服务端构建' }
  Write-Host '[3/5] 准备桌面运行时'
  Invoke-Step '桌面运行时准备' { pnpm desktop:prepare }
  if (-not $SkipTests) {
    Write-Host '[4/5] 运行桌面包测试'
    Invoke-Step '桌面测试' { pnpm test:desktop }
  } else { Write-Host '[4/5] 跳过桌面包测试' }
  Write-Host '[5/5] 构建 Windows 安装包'
  Invoke-Step '自签名安装包构建' { pnpm --filter @sanye/sanye_desktop dist:self-signed }
  Write-Host "桌面安装包已生成：$repo\sanye_desktop\dist"
} finally { Pop-Location }
