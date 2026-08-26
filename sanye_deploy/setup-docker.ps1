#requires -Version 5.1
<#
sanye_anime Docker 环境引导与中间件启动脚本

用法（任选其一）：
  1. 右键本文件 -> “使用 PowerShell 运行”（会自动请求管理员权限）。
  2. 管理员 PowerShell 执行：
     powershell -ExecutionPolicy Bypass -File .\setup-docker.ps1
  3. Docker 引擎就绪后执行统一配置：
     pwsh -ExecutionPolicy Bypass -File .\configure-middleware.ps1

可选参数：
  -SkipDockerDesktop   不自动启动 Docker Desktop（假设引擎已运行）
  -FullProfile         同时启动 Nacos / Sentinel / XXL-JOB（需要额外镜像）

退出码：
  0  全部完成
  2  Docker 引擎或中间件启动失败
  3  已启用新 Windows 功能，需要重启电脑后再次运行

说明：本脚本默认使用开发口令（sanye / 123456）和不冲突的宿主机端口，仅限本地环境。
#>
[CmdletBinding()]
param(
    [switch]$SkipDockerDesktop,
    [switch]$FullProfile,
    [string]$PostgresUser,
    [string]$PostgresPassword,
    [string]$RedisUsername,
    [string]$RedisPassword,
    [string]$RabbitmqUser,
    [string]$RabbitmqPassword,
    [string]$MinioUser,
    [string]$MinioPassword,
    [string]$XxlJobMysqlRootPassword,
    [string]$XxlJobMysqlUser,
    [string]$XxlJobMysqlPassword,
    [string]$PostgresHostPort,
    [string]$RedisHostPort
)

$ErrorActionPreference = 'Stop'
$script:composeFile = Join-Path $PSScriptRoot 'compose.yaml'

# 输出部署阶段标题和三种结果级别，保持交互日志一致。
function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "[x] $msg" -ForegroundColor Red }

# 从环境变量或交互输入读取部署凭证，避免把真实密钥写入脚本。
function Get-CredValue {
    param([string]$Provided, [string]$EnvName, [string]$Default)
    if ($Provided) { return $Provided }
    $v = [Environment]::GetEnvironmentVariable($EnvName)
    if ($v) { return $v }
    return $Default
}

# 仅保留凭证首尾少量字符用于日志确认，防止泄露完整值。
function Format-Masked {
    param([string]$Value)
    if ($Value.Length -le 4) { return '****' }
    return $Value.Substring(0, 2) + '****' + $Value.Substring($Value.Length - 2)
}

# 1) 管理员检查与自动提权
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn '当前不是管理员，正在请求提升权限……'
    try {
        # 提权后转发已绑定参数，确保 -FullProfile 和自定义凭据不会静默丢失。
        $forwardedArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
        foreach ($entry in $PSBoundParameters.GetEnumerator()) {
            if ($entry.Value -is [System.Management.Automation.SwitchParameter]) {
                if ($entry.Value.IsPresent) { $forwardedArguments += "-$($entry.Key)" }
            } elseif ($null -ne $entry.Value) {
                $forwardedArguments += "-$($entry.Key)"
                $forwardedArguments += "`"$($entry.Value)`""
            }
        }
        Start-Process -FilePath 'powershell.exe' -ArgumentList $forwardedArguments -Verb RunAs
    } catch {
        Write-Fail '提权失败，请右键本文件选择“以管理员身份运行”。'
        exit 1
    }
    exit 0
}

# 2) 虚拟化检查
Write-Step '检查 CPU 虚拟化支持'
try {
    $cpu = Get-CimInstance Win32_Processor
    Write-Host ("VirtualizationFirmwareEnabled = " + $cpu.VirtualizationFirmwareEnabled)
    if ($cpu.VirtualizationFirmwareEnabled -ne $true) {
        Write-Warn '虚拟化固件未开启：若是虚拟机请开启“嵌套虚拟化”，若是物理机请进 BIOS 开启 Intel VT-x / AMD-V；否则 WSL2/Docker 无法启动。'
        Write-Host '脚本会继续尝试，但引擎很可能起不来；建议先解决虚拟化再运行。' -ForegroundColor Yellow
    }
} catch {
    Write-Warn ("虚拟化检测失败：{0}" -f $_.Exception.Message)
}

# 3) 启用 WSL2 所需 Windows 功能
Write-Step '启用 Windows 功能：适用于 Linux 的 Windows 子系统 与 虚拟机平台'
$features = @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')
$needReboot = $false
foreach ($name in $features) {
    try {
        $state = (Get-WindowsOptionalFeature -Online -FeatureName $name).State
        if ($state -eq 'Enabled') {
            Write-Ok "$name 已启用"
        } else {
            Write-Host "启用 $name ..."
            & dism.exe /online /enable-feature /featurename:$name /all /norestart | Out-Null
            $needReboot = $true
        }
    } catch {
        Write-Warn "$name 查询/启用失败：$($_.Exception.Message)"
    }
}
if ($needReboot) {
    Write-Warn '已启用新的 Windows 功能，需要重启电脑后再次运行本脚本。'
    exit 3
}

# 4) WSL 内核更新与默认版本（带超时，避免虚拟化未就绪时卡死）
# 在限定时间内执行 WSL 命令，防止 Docker 探测永久阻塞部署流程。
function Invoke-WslWithTimeout {
    param([string[]]$Arguments, [int]$TimeoutMs = 30000)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'wsl.exe'
    $psi.Arguments = ($Arguments -join ' ')
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    if (-not $p.WaitForExit($TimeoutMs)) {
        try { $p.Kill() } catch { }
        return $null
    }
    return ($p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()).Trim()
}

Write-Step 'WSL 内核更新与默认版本设置'
$wslUpdate = Invoke-WslWithTimeout @('--update') 60000
if ($null -eq $wslUpdate) {
    Write-Warn 'wsl --update 超时（WSL 可能未正常安装或虚拟化未就绪），跳过。'
} else {
    Write-Host $wslUpdate
}
$wslVer = Invoke-WslWithTimeout @('--set-default-version', '2') 30000
if ($null -eq $wslVer) {
    Write-Warn 'wsl --set-default-version 2 超时，跳过（虚拟化未就绪时会卡住）。'
} else {
    Write-Host $wslVer
}

# 5) 启动 Docker Desktop 并等待引擎
Write-Step '启动 Docker Desktop 并等待引擎就绪'
# 检查 Docker 引擎和 Compose 可用性，提前给出环境级错误。
function Test-DockerEngine {
    docker info *> $null
    return ($LASTEXITCODE -eq 0)
}
if (-not (Test-DockerEngine)) {
    $dd = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (Test-Path $dd) {
        if (-not $SkipDockerDesktop) {
            Start-Process -FilePath $dd -WindowStyle Hidden | Out-Null
        }
        Write-Host '等待 Docker 引擎……（最多 5 分钟）'
        $ok = $false
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 5
            if (Test-DockerEngine) { $ok = $true; break }
        }
        if (-not $ok) {
            Write-Fail 'Docker 引擎未能就绪（常见原因：WSL2/虚拟化未就绪）。请打开 Docker Desktop 查看提示后重试。'
            exit 2
        }
    } else {
        Write-Fail '未找到 Docker Desktop.exe，请先安装 Docker Desktop。'
        exit 2
    }
}
Write-Ok 'Docker 引擎就绪'

# 5.5) Compose 启动参数（参数/环境变量优先，缺省开发占位值）
Write-Step '配置中间件凭据'
$postgresUser     = Get-CredValue $PostgresUser     'POSTGRES_USER'     'sanye'
$postgresPassword = Get-CredValue $PostgresPassword 'POSTGRES_PASSWORD' '123456'
$redisUsername    = Get-CredValue $RedisUsername    'REDIS_USERNAME'    'sanye'
$redisPassword    = Get-CredValue $RedisPassword    'REDIS_PASSWORD'    '123456'
$rabbitmqUser     = Get-CredValue $RabbitmqUser     'RABBITMQ_USER'     'sanye'
$rabbitmqPassword = Get-CredValue $RabbitmqPassword 'RABBITMQ_PASSWORD' '123456'
$minioUser        = Get-CredValue $MinioUser        'MINIO_USER'        'sanye'
$minioPassword    = Get-CredValue $MinioPassword    'MINIO_PASSWORD'    '12345678'
$xxlJobMysqlUser = Get-CredValue $XxlJobMysqlUser 'XXL_JOB_MYSQL_USER' 'sanye'
$xxlJobMysqlPassword = Get-CredValue $XxlJobMysqlPassword 'XXL_JOB_MYSQL_PASSWORD' '123456'
$xxlJobMysqlRootPassword = Get-CredValue $XxlJobMysqlRootPassword 'XXL_JOB_MYSQL_ROOT_PASSWORD' '123456'
$postgresHostPort = Get-CredValue $PostgresHostPort 'POSTGRES_HOST_PORT' '15432'
$redisHostPort = Get-CredValue $RedisHostPort 'REDIS_HOST_PORT' '16379'
$rabbitmqHostPort = [Environment]::GetEnvironmentVariable('RABBITMQ_HOST_PORT'); if (-not $rabbitmqHostPort) { $rabbitmqHostPort = '15672' }
$minioHostPort = [Environment]::GetEnvironmentVariable('MINIO_HOST_PORT'); if (-not $minioHostPort) { $minioHostPort = '9001' }
$kibanaHostPort = [Environment]::GetEnvironmentVariable('KIBANA_HOST_PORT'); if (-not $kibanaHostPort) { $kibanaHostPort = '5601' }

$env:POSTGRES_USER = $postgresUser
$env:POSTGRES_PASSWORD = $postgresPassword
$env:POSTGRES_HOST_PORT = $postgresHostPort
$env:POSTGRES_DB = [Environment]::GetEnvironmentVariable('POSTGRES_DB'); if (-not $env:POSTGRES_DB) { $env:POSTGRES_DB = 'sanye_anime' }
$env:REDIS_PASSWORD = $redisPassword
$env:REDIS_USERNAME = $redisUsername
$env:REDIS_HOST_PORT = $redisHostPort
$env:RABBITMQ_USER = $rabbitmqUser
$env:RABBITMQ_PASSWORD = $rabbitmqPassword
$env:MINIO_USER = $minioUser
$env:MINIO_PASSWORD = $minioPassword
$env:XXL_JOB_MYSQL_ROOT_PASSWORD = $xxlJobMysqlRootPassword
$env:XXL_JOB_MYSQL_USER = $xxlJobMysqlUser
$env:XXL_JOB_MYSQL_PASSWORD = $xxlJobMysqlPassword

Write-Host "PostgreSQL : $postgresUser / $(Format-Masked $postgresPassword)"
Write-Host "Redis      : $redisUsername / $(Format-Masked $redisPassword)"
Write-Host "RabbitMQ   : $rabbitmqUser / $(Format-Masked $rabbitmqPassword)"
Write-Host "MinIO      : $minioUser / $(Format-Masked $minioPassword)"
Write-Host "XXL-JOB DB : $(Format-Masked $xxlJobMysqlRootPassword)"
Write-Host "Docker 端口 : PostgreSQL $postgresHostPort / Redis $redisHostPort"
$defaultUser = 'sanye'
$defaultPass = '123456'
$defaultMinioPass = '12345678'
$custom = ($postgresUser -ne $defaultUser -or $postgresPassword -ne $defaultPass -or $redisUsername -ne $defaultUser -or $redisPassword -ne $defaultPass -or
           $rabbitmqUser -ne $defaultUser -or $rabbitmqPassword -ne $defaultPass -or $minioUser -ne $defaultUser -or $minioPassword -ne $defaultMinioPass -or
           $xxlJobMysqlUser -ne $defaultUser -or $xxlJobMysqlPassword -ne $defaultPass -or $postgresHostPort -ne '15432' -or $redisHostPort -ne '16379')
if ($custom) {
    Write-Warn '检测到自定义凭据：本脚本负责 Compose 启动，不直接修改已有数据卷中的账号。'
    Write-Warn '请在本脚本完成后执行 configure-middleware.ps1，并在改密时提供对应 Current* 参数。'
}

# 6) 拉起中间件
Write-Step '启动中间件（docker compose up -d）'
if (-not (Test-Path $script:composeFile)) {
    Write-Fail "未找到 compose 文件：$script:composeFile"
    exit 2
}
if ($FullProfile) {
    & docker compose -f $script:composeFile --profile full up -d
} else {
    & docker compose -f $script:composeFile up -d postgres redis rabbitmq elasticsearch minio
}
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'docker compose up 失败，请查看上方输出。'
    exit 2
}

# 7) 等待健康并汇总
Write-Step '等待服务健康（最多 3 分钟）'
Start-Sleep -Seconds 5
$targets = @('sanye-postgres', 'sanye-redis', 'sanye-rabbitmq', 'sanye-elasticsearch', 'sanye-minio')
if ($FullProfile) {
    # full profile 还要等待治理、调度、搜索控制台和 XXL-JOB 的关键依赖。
    $targets += @('sanye-nacos', 'sanye-sentinel', 'sanye-kibana', 'sanye-xxl-job-mysql', 'sanye-xxl-job-admin')
}
$allHealthy = $false
for ($i = 0; $i -lt 36; $i++) {
    $all = $true
    foreach ($c in $targets) {
        $status = docker inspect --format '{{.State.Health.Status}}' $c 2>$null
        if ($status -ne 'healthy') { $all = $false }
    }
    if ($all) { $allHealthy = $true; break }
    Start-Sleep -Seconds 5
}
if (-not $allHealthy) {
    Write-Warn '部分服务未达到 healthy，请查看状态：'
}
docker compose -f $script:composeFile ps

Write-Step '完成'
Write-Host "中间件地址：PostgreSQL $postgresHostPort / Redis $redisHostPort / RabbitMQ 管理台 $rabbitmqHostPort / Elasticsearch REST 9200 / Kibana 控制台 $kibanaHostPort / MinIO 控制台 $minioHostPort / Nacos Console 8080"
if ($FullProfile) { Write-Host "控制台地址：MinIO http://localhost:$minioHostPort / RabbitMQ http://localhost:$rabbitmqHostPort / Nacos http://localhost:8080/ / Kibana http://localhost:$kibanaHostPort / XXL-JOB http://localhost:18080/" }
Write-Host '开发口令：PostgreSQL/Redis/RabbitMQ/XXL-JOB 为 sanye / 123456；MinIO 为 sanye / 12345678（仅限本地）。'
Write-Host '统一账号权限与连接验证：pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\configure-middleware.ps1'
Write-Host '下次启动中间件：docker compose -f sanye_deploy/compose.yaml up -d'
