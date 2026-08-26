param(
    [string[]]$Scenarios = @('anime', 'auth', 'ai-chat'),
    [string]$Gateway = 'http://localhost:8091',
    [string]$ResultFile = ''
)

<#
  跨服务故障注入验证（T-G-06）
  场景：停掉 anime / auth / ai-chat 服务，验证：
  1. 网关返回统一错误包（HTTP 503 + code 5002 + requestId 贯穿）；
  2. 网关 prometheus 指标出现 5xx 计数（可观测性）；
  3. 恢复服务后接口自动回 200（自愈闭环）。
  用法：.\sanye_deploy\fault-injection.ps1 -Scenarios anime,ai-chat
  输出：默认控制台；指定 -ResultFile 时同时写入结果文件（供自动化捕获）。
#>

$ErrorActionPreference = 'Stop'
$pass = 0
$fail = 0
$runLocal = Join-Path $PSScriptRoot 'run-local.ps1'
if ($ResultFile) {
    Set-Content -LiteralPath $ResultFile -Value '' -Encoding UTF8
}

# 输出故障注入步骤和检查结论。
function Write-Result([string]$Text) {
    if ($ResultFile) {
        Add-Content -LiteralPath $ResultFile -Value $Text -Encoding UTF8
    }
    Write-Host $Text
}

# 记录预期故障是否被正确转换为统一错误响应。
function Assert-True([bool]$Condition, [string]$Name) {
    if ($Condition) { $script:pass++; Write-Result "[PASS] $Name" }
    else { $script:fail++; Write-Result "[FAIL] $Name" }
}

# 调用目标接口并保留请求编号，验证故障响应的契约字段。
function Get-JsonResponse([string]$Path, [string]$RequestId, [string]$Device = 'fault-inject-device') {
    $resp = Invoke-WebRequest -Uri "$Gateway$Path" -Headers @{
        'X-Request-Id' = $RequestId
        'X-Device-Id'  = $Device
    } -SkipHttpErrorCheck -TimeoutSec 20
    $body = $null
    if ($resp.Content) {
        try { $body = $resp.Content | ConvertFrom-Json } catch { $body = $null }
    }
    return [PSCustomObject]@{ Status = [int]$resp.StatusCode; Body = $body }
}

# 等待被注入故障的服务端口进入可测试状态。
function Wait-Port([int]$Port, [int]$Seconds = 40) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

$serviceMap = @{
    'anime'  = @{ Port = 8082; CheckPath = '/api/v1/anime/127'; Service = 'anime' }
    'auth'   = @{ Port = 8081; CheckPath = '/api/v1/system/ping'; Service = 'auth' }
    'ai-chat' = @{ Port = 8084; CheckPath = '/api/v1/ai/quota'; Service = 'ai-chat' }
}

foreach ($name in $Scenarios) {
    $entry = $serviceMap[$name]
    if (-not $entry) { throw "未知故障场景：$name（支持 anime/auth/ai-chat）" }
    $rid = "fault-$name-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
    Write-Result "`n=== 故障场景：$name（端口 $($entry.Port)）==="

    try {
        # 1. 基线
        $baseline = Get-JsonResponse $entry.CheckPath $rid
        Assert-True ($baseline.Status -eq 200) "$name 基线接口返回 200（当前状态 $($baseline.Status)）"

        # 2. 注入故障：停止服务进程
        $conn = Get-NetTCPConnection -State Listen -LocalPort $entry.Port -ErrorAction SilentlyContinue
        if (-not $conn) {
            Assert-True $false "$name 端口 $($entry.Port) 无监听进程，无法注入"
            return
        }
        $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 3
        Assert-True (-not (Get-NetTCPConnection -State Listen -LocalPort $entry.Port -ErrorAction SilentlyContinue)) "$name 已停止（端口释放）"

        # 3. 故障期验证：网关统一错误包 + requestId 贯穿
        $fault = Get-JsonResponse $entry.CheckPath $rid
        $bodyOk = $null -ne $fault.Body -and $fault.Body.code -eq 5002
        $requestIdOk = $null -ne $fault.Body -and $fault.Body.requestId -eq $rid
        Assert-True ($fault.Status -eq 503 -and $bodyOk) "$name 故障期网关返回 503 + code=5002（实际 $($fault.Status)）"
        Assert-True $requestIdOk "$name 故障响应 requestId 贯穿一致（$rid）"

        # 4. 可观测性：网关 prometheus 出现 5xx 计数
        $prom = (Invoke-WebRequest -Uri "http://localhost:8090/actuator/prometheus" -TimeoutSec 20).Content
        Assert-True ($prom -match 'status="503"') "$name 故障期网关指标出现 status=503 计数"
    } finally {
        # 5. 无论上述断言是否失败，都恢复服务
        if (-not (Get-NetTCPConnection -State Listen -LocalPort $entry.Port -ErrorAction SilentlyContinue)) {
            Write-Result "[info] 恢复 $name 服务..."
            & $runLocal -Services $entry.Service -Restart | Out-Null
        }
        $ready = Wait-Port $entry.Port
        Assert-True $ready "$name 服务恢复（端口 $($entry.Port) 就绪）"
    }

    # 6. 恢复后验证
    $restored = Get-JsonResponse $entry.CheckPath $rid
    Assert-True ($restored.Status -eq 200) "$name 恢复后接口返回 200（实际 $($restored.Status)）"
}

Write-Result ''
Write-Result "故障注入结果：通过 $pass 项，失败 $fail 项"
if ($fail -gt 0) { exit 1 }
