param(
    [string]$Scenario = 'anime',
    [string]$ResultFile = ''
)

<#
  依赖故障降级验证（T-H-04 本地部分）
  停掉指定服务，验证前端对应页面降级（本地回退/失败态/演示数据），随后恢复服务。
  场景：anime（首页/仓库/详情/内容管理）、ai-chat（AI 页/仪表盘）、favorite（我的页）、feedback（反馈页）。
  用法：.\sanye_deploy\degradation-check.ps1 -Scenario anime -ResultFile C:\temp\deg.txt
#>

$ErrorActionPreference = 'Stop'
$pass = 0
$fail = 0
$runLocal = Join-Path $PSScriptRoot 'run-local.ps1'
$repoRoot = Split-Path $PSScriptRoot -Parent
if ($ResultFile) { Set-Content -LiteralPath $ResultFile -Value '' -Encoding UTF8 }

$ports = @{ anime = 8082; 'ai-chat' = 8084; favorite = 8085; feedback = 8087 }
$port = $ports[$Scenario]
if (-not $port) { throw "未知场景：$Scenario（支持 anime/ai-chat/favorite/feedback）" }

# 输出带统一前缀的降级检查结果。
function Write-Result([string]$Text) {
    if ($ResultFile) { Add-Content -LiteralPath $ResultFile -Value $Text -Encoding UTF8 }
    Write-Host $Text
}

# 记录降级场景断言，并在脚本末尾汇总失败项。
function Assert-True([bool]$Condition, [string]$Name) {
    if ($Condition) { $script:pass++; Write-Result "[PASS] $Name" }
    else { $script:fail++; Write-Result "[FAIL] $Name" }
}

# 在启动降级依赖后等待端口可用，超时即判定环境不可测。
function Wait-Port([int]$Port, [int]$Seconds = 40) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

Write-Result "=== 故障降级场景：$Scenario（停端口 $port）==="
$nodeScript = Join-Path $repoRoot 'e2e\e2e-degradation.mjs'
try {
    # 基线：服务在线
    Assert-True (Wait-Port $port 5) "$Scenario 基线服务在线"

    # 停服务
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 3
    Assert-True (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) "$Scenario 已停止（端口释放）"

    # 运行 Playwright 降级验证（输出捕获到临时文件）
    $out = Join-Path $env:TEMP "deg-$Scenario.txt"
    # 始终执行仓库内脚本，避免临时目录残留旧版本导致降级验证失真。
    node $nodeScript $Scenario *> $out
    $nodeExit = $LASTEXITCODE
    Get-Content $out | ForEach-Object { Write-Result $_ }
    Assert-True ($nodeExit -eq 0) "$Scenario 降级验证全部通过（node exit 0）"
} finally {
    # 恢复服务（无论成败）
    if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
        Write-Result "[info] 恢复 $Scenario 服务..."
        & $runLocal -Services $Scenario -Restart | Out-Null
    }
    $ready = Wait-Port $port
    Assert-True $ready "$Scenario 服务恢复（端口就绪）"
}

Write-Result ''
Write-Result "故障降级验证结果：通过 $pass 项，失败 $fail 项"
if ($fail -gt 0) { exit 1 }
