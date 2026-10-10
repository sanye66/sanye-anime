param(
    [string[]]$Services = @('gateway', 'auth', 'anime', 'search', 'ai-chat', 'favorite', 'file', 'feedback', 'job', 'admin-server'),
    [switch]$Restart,
    [ValidateSet('local', 'docker')]
    [string]$Infrastructure = 'local',
    [int]$GatewayPort = 8091,
    [ValidateSet('dev', 'openai')]
    # 默认沿用当前进程的 AI_PROVIDER，未配置或值非法时仍回退到本地模拟。
    [string]$AiProvider = $(if ($env:AI_PROVIDER -in @('dev', 'openai')) { $env:AI_PROVIDER } else { 'dev' })
)

<#
  本地联调启动脚本（sanye_anime）
  用途：启动网关与业务服务，供前后端联调。
        local 使用本机 PostgreSQL（5433）+ Redis（6379）；docker 使用 Compose 的 PostgreSQL（15432）、Redis（16379）和 ES（9200）。
        Nacos Console 固定占用宿主机 8080，因此本机网关默认使用 8091；动态 Nacos 注册仅在容器网络内启用。
  用法：
    .\sanye_deploy\run-local.ps1                                    # 启动默认核心服务和管理端
    .\sanye_deploy\run-local.ps1 -Infrastructure docker -Services gateway,auth,anime,search,ai-chat -Restart
  日志：sanye_deploy\.local\logs\<服务>.log
#>

$ErrorActionPreference = 'Stop'
if ($env:SANYE_ENV -and $env:SANYE_ENV -ne 'local') {
    throw 'run-local.ps1 requires a dedicated local shell; SANYE_ENV is not local.'
}
$repoRoot = Split-Path $PSScriptRoot -Parent
$localDir = Join-Path $PSScriptRoot '.local'
$logDir = Join-Path $localDir 'logs'
$pgLog = Join-Path $localDir 'pg-5433.log'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
# 兼容 pwsh -File 传入的逗号分隔字符串和 PowerShell 原生字符串数组。
$Services = @($Services | ForEach-Object { $_ -split ',' | ForEach-Object { $_.Trim() } } | Where-Object { $_ })
# 本地 PostgreSQL 数据目录独立于仓库，避免开发数据被版本控制和清理操作影响。
$pgData = Join-Path $env:LOCALAPPDATA 'sanye_dev_pg\data'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# 1. 准备数据库连接：local 自动维护本机实例，docker 只连接现有 Compose 数据卷。
if ($Infrastructure -eq 'local') {
    # 确保本地 PostgreSQL 联调实例（127.0.0.1:5433）可用；数据目录独立于仓库。
$pgRunning = $false
# 优先检查实际监听端口；Windows 下 pg_ctl status 可能因数据目录锁或权限返回误判。
$pgPortListener = @(netstat.exe -ano 2>$null | Select-String -Pattern '(^|\s)(127\.0\.0\.1|0\.0\.0\.0|\[::\]):5433\s+.*LISTENING\s+\d+\s*$')
if ($pgPortListener.Count -gt 0) {
    $pgRunning = $true
}
if (Test-Path (Join-Path $pgData 'PG_VERSION')) {
    if (-not $pgRunning) {
        & (Join-Path $pgBin 'pg_ctl.exe') -D $pgData status 2>$null | Out-Null
        $pgRunning = ($LASTEXITCODE -eq 0)
    }
}
if (-not $pgRunning) {
    Write-Host '[local] PostgreSQL 5433 未运行，准备启动本地联调实例...'
    if (-not (Test-Path (Join-Path $pgData 'PG_VERSION'))) {
        Write-Host "[local] 未找到 $pgData，执行 initdb 初始化..."
        & (Join-Path $pgBin 'initdb.exe') -D $pgData -U postgres -A trust -E UTF8 --no-locale | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'initdb 失败' }
    }
    & (Join-Path $pgBin 'pg_ctl.exe') -D $pgData -l $pgLog -o '-p 5433 -h 127.0.0.1' start | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 5433 启动失败，请查看日志' }
    Start-Sleep -Seconds 2
}
# 角色与库：本机实例可能由 sanye 超管初始化（无 postgres 角色），自动探测可用超管
$env:PGPASSWORD = '123456'
# 并行启动多个服务时使用进程独立的探测错误文件，避免互相占用同一个临时文件。
$probeErr = Join-Path $localDir ("pg-probe-{0}.err" -f $PID)
$probe = $null
& (Join-Path $pgBin 'psql.exe') -w -U sanye -h 127.0.0.1 -p 5433 -d postgres -t -A -c "SELECT count(*) FROM pg_roles WHERE rolname='postgres';" 2>$probeErr | ForEach-Object { $probe = $_ }
if ($null -eq $probe) {
    # sanye 角色尚不存在（新 initdb 实例），回退 postgres 超管
    $pgSuper = 'postgres'
} elseif ($probe -eq '1') {
    $pgSuper = 'postgres'
} else {
    $pgSuper = 'sanye'
}
Remove-Item -LiteralPath $probeErr -Force -ErrorAction SilentlyContinue
& (Join-Path $pgBin 'psql.exe') -w -U $pgSuper -h 127.0.0.1 -p 5433 -d postgres -c "DO `$`$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sanye') THEN ALTER ROLE sanye WITH LOGIN PASSWORD '123456' CREATEDB; ELSE CREATE ROLE sanye LOGIN PASSWORD '123456' CREATEDB; END IF; END `$`$;" | Out-Null
& (Join-Path $pgBin 'psql.exe') -w -U $pgSuper -h 127.0.0.1 -p 5433 -d postgres -t -A -c "SELECT 1 FROM pg_database WHERE datname='sanye_anime';" | ForEach-Object {
    if ($_ -ne '1') {
        & (Join-Path $pgBin 'psql.exe') -w -U $pgSuper -h 127.0.0.1 -p 5433 -d postgres -c 'CREATE DATABASE sanye_anime OWNER sanye;' | Out-Null
    }
}

# 默认启动包含管理端时同步创建独立管理库，避免全新本地实例因缺库而启动失败。
& (Join-Path $pgBin 'psql.exe') -w -U $pgSuper -h 127.0.0.1 -p 5433 -d postgres -t -A -c "SELECT 1 FROM pg_database WHERE datname='sanye_admin';" | ForEach-Object {
    if ($_ -ne '1') {
        & (Join-Path $pgBin 'psql.exe') -w -U $pgSuper -h 127.0.0.1 -p 5433 -d postgres -c 'CREATE DATABASE sanye_admin OWNER sanye;' | Out-Null
    }
}
$adminTable = & (Join-Path $pgBin 'psql.exe') -w -U $pgSuper -h 127.0.0.1 -p 5433 -d sanye_admin -t -A -c "SELECT CASE WHEN to_regclass('public.sanye_sys_user') IS NULL THEN 0 ELSE 1 END;"
if (($adminTable -join '').Trim() -ne '1') {
    $adminSchema = Join-Path $repoRoot 'sanye_admin_server/sql/sanye_admin_schema.sql'
    $adminQuartz = Join-Path $repoRoot 'sanye_admin_server/sql/sanye_admin_quartz_schema.sql'
    & (Join-Path $pgBin 'psql.exe') -w -U $pgSuper -h 127.0.0.1 -p 5433 -d sanye_admin -v ON_ERROR_STOP=1 -f $adminSchema | Out-Null
    & (Join-Path $pgBin 'psql.exe') -w -U $pgSuper -h 127.0.0.1 -p 5433 -d sanye_admin -v ON_ERROR_STOP=1 -f $adminQuartz | Out-Null
    Write-Host '[local] 管理平台数据库已初始化（sanye_admin）'
} else {
    Write-Host '[local] 管理平台数据库已存在，跳过破坏性初始化（sanye_admin）'
}
    Write-Host '[local] PostgreSQL 5433 就绪（sanye / 123456）'
} else {
    # Docker 模式不执行 initdb、改卷或删卷，避免误操作已导入的中间件数据。
    Write-Host '[docker] 使用 Compose 中间件：PostgreSQL 15432、Redis 16379、Elasticsearch 9200。'
    # 启动业务服务前先确认 Docker 数据面健康，避免服务反复启动并写入误导性错误日志。
    foreach ($container in @('sanye-postgres', 'sanye-redis', 'sanye-elasticsearch')) {
        $health = docker inspect --format '{{.State.Health.Status}}' $container 2>$null
        if ($LASTEXITCODE -ne 0 -or $health -ne 'healthy') {
            throw "Docker 容器 $container 未处于 healthy 状态，请先执行 configure-middleware.ps1。"
        }
    }
}

# 2. 环境变量：本机静态发现模式；Docker 模式连接已导入数据的中间件。
if ($Infrastructure -eq 'docker') {
    $env:DB_URL = 'jdbc:postgresql://localhost:15432/sanye_anime'
    $env:REDIS_HOST = '127.0.0.1'
    $env:REDIS_PORT = '16379'
    $env:REDIS_USERNAME = 'sanye'
    $env:REDIS_PASSWORD = '123456'
    $env:ES_HOST = 'http://127.0.0.1:9200'
    $env:NACOS_SERVER_ADDR = '127.0.0.1:8848'
    $env:SANYE_ADMIN_DATASOURCE_URL = 'jdbc:postgresql://localhost:15432/sanye_admin'
    $env:SANYE_ADMIN_REDIS_PORT = '16379'
    $env:SANYE_ADMIN_REDIS_USERNAME = 'sanye'
    $env:SANYE_ADMIN_REDIS_PASSWORD = '123456'
    # 读取本机容器现有连接值，不输出凭据，也不修改容器账户。
    $rabbitContainer = docker inspect sanye-rabbitmq | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw '无法读取本机 RabbitMQ 容器连接配置。' }
    foreach ($setting in $rabbitContainer[0].Config.Env) {
        if ($setting.StartsWith('RABBITMQ_DEFAULT_USER=')) {
            $env:SPRING_RABBITMQ_USERNAME = $setting.Substring('RABBITMQ_DEFAULT_USER='.Length)
        }
        if ($setting.StartsWith('RABBITMQ_DEFAULT_PASS=')) {
            $env:SPRING_RABBITMQ_PASSWORD = $setting.Substring('RABBITMQ_DEFAULT_PASS='.Length)
        }
    }
    $env:SPRING_RABBITMQ_HOST = '127.0.0.1'
    $env:SPRING_RABBITMQ_PORT = '5672'
    $env:SPRING_RABBITMQ_PUBLISHER_CONFIRM_TYPE = 'correlated'
    $env:SPRING_RABBITMQ_PUBLISHER_RETURNS = 'true'
    $env:SANYE_EVENT_ENABLED = 'true'
    $env:SANYE_EVENT_PUBLISHER_ENABLED = 'true'
} else {
    $env:DB_URL = 'jdbc:postgresql://localhost:5433/sanye_anime'
    $env:REDIS_HOST = '127.0.0.1'
    $env:REDIS_PORT = '6379'
    # 本机 Redis 联调实例关闭认证；空用户名避免 Lettuce 发送两参数 AUTH。
    $env:REDIS_USERNAME = ''
    $env:REDIS_PASSWORD = ''
    $env:SANYE_ADMIN_DATASOURCE_URL = 'jdbc:postgresql://localhost:5433/sanye_admin'
    $env:SANYE_ADMIN_REDIS_PORT = '6379'
    $env:SANYE_ADMIN_REDIS_USERNAME = ''
    $env:SANYE_ADMIN_REDIS_PASSWORD = ''
    # 本机 Redis 是无认证实例；本地联调关闭首页缓存和 Redis 健康检查，避免 Spring 使用默认凭据发送 AUTH。
    $env:HOME_CACHE_ENABLED = 'false'
    $env:MANAGEMENT_HEALTH_REDIS_ENABLED = 'false'
}
$env:SANYE_ENV = 'local'
if (-not $env:AUTH_TOKEN_SECRET) { $env:AUTH_TOKEN_SECRET = 'sanye-local-jwt-secret-2026' }
$env:DB_USERNAME = 'sanye'
$env:DB_PASSWORD = '123456'
$env:GATEWAY_PORT = [string]$GatewayPort
$env:NACOS_ENABLED = 'false'
$env:SENTINEL_ENABLED = 'false'
$env:AI_PROVIDER = $AiProvider
$env:FILE_STORAGE_DIR = (Join-Path $repoRoot 'sanye_deploy/.local/files')
$env:SANYE_ADMIN_DATASOURCE_USERNAME = 'sanye'
$env:SANYE_ADMIN_DATASOURCE_PASSWORD = '123456'
$env:SANYE_ADMIN_TOKEN_SECRET = 'sanye-dev-secret-2026-local-only'
$env:SANYE_MANAGE_TOKEN = 'sanye-dev-manage-token-2026-local-only'
$env:SANYE_ADMIN_REDIS_HOST = '127.0.0.1'

$map = @{
    'gateway'  = @{ Jar = 'sanye-server-gateway\target\sanye-server-gateway-0.1.0-SNAPSHOT.jar'; Port = $GatewayPort; Args = @('--spring.profiles.active=local', "--server.port=$GatewayPort") }
    'auth'     = @{ Jar = 'sanye-server-auth\target\sanye-server-auth-0.1.0-SNAPSHOT.jar'; Port = 8081; Args = @() }
    'anime'    = @{ Jar = 'sanye-server-anime\target\sanye-server-anime-0.1.0-SNAPSHOT.jar'; Port = 8082; Args = @() }
    'search'   = @{ Jar = 'sanye-server-search\target\sanye-server-search-0.1.0-SNAPSHOT.jar'; Port = 8083; Args = @() }
    'ai-chat'  = @{ Jar = 'sanye-server-ai-chat\target\sanye-server-ai-chat-0.1.0-SNAPSHOT.jar'; Port = 8084; Args = @() }
    'favorite' = @{ Jar = 'sanye-server-favorite\target\sanye-server-favorite-0.1.0-SNAPSHOT.jar'; Port = 8085; Args = @() }
    'file'     = @{ Jar = 'sanye-server-file\target\sanye-server-file-0.1.0-SNAPSHOT.jar'; Port = 8086; Args = @() }
    'feedback' = @{ Jar = 'sanye-server-feedback\target\sanye-server-feedback-0.1.0-SNAPSHOT.jar'; Port = 8087; Args = @() }
    'job'      = @{ Jar = 'sanye-server-job\target\sanye-server-job-0.1.0-SNAPSHOT.jar'; Port = 8088; Args = @() }
    'admin-server' = @{ Jar = '..\sanye_admin_server\sanye_admin_app\target\sanye_admin_app.jar'; Port = 8089; Args = @('--server.port=8089') }
}

# 3. 启动服务（只允许重启本项目 Java 进程，禁止按端口误杀 Docker 或其他应用）
foreach ($name in $Services) {
    $entry = $map[$name]
    if (-not $entry) { throw "未知服务：$name" }
    $listening = Get-NetTCPConnection -State Listen -LocalPort $entry.Port -ErrorAction SilentlyContinue
    $owners = @($listening | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($owner in $owners) {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $owner" -ErrorAction SilentlyContinue
        $commandLine = [string]$processInfo.CommandLine
        if ($commandLine -notmatch 'sanye-server-|sanye_admin_app\.jar') {
            throw "端口 $($entry.Port) 已被非本项目进程占用（PID=$owner，进程=$($processInfo.Name)）。请释放端口或使用 -GatewayPort 指定其他网关端口。"
        }
    }
    if ($listening -and -not $Restart) {
        Write-Host "[local] $name 已在端口 $($entry.Port) 运行，跳过（加 -Restart 强制重启）"
        continue
    }
    if ($listening -and $Restart) {
        $owners | ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    }
    $jar = Join-Path $repoRoot (Join-Path 'sanye_server' $entry.Jar)
    if (-not (Test-Path $jar)) {
        if ($name -eq 'admin-server') {
            Write-Host "[local] 缺少 $jar，先构建独立管理端"
            & mvn -B -f (Join-Path $repoRoot 'sanye_admin_server/pom.xml') package -DskipTests
        } else {
            Write-Host "[local] 缺少 $jar，先构建业务服务"
            & mvn -B -f (Join-Path $repoRoot 'sanye_server/pom.xml') install -DskipTests
        }
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $jar)) {
            throw "服务 $name 缺少可运行 JAR 且自动构建失败：$jar"
        }
    }
    $out = Join-Path $logDir "$name.log"
    Write-Host "[local] 启动 $name -> http://localhost:$($entry.Port)（日志：$out）"
    Start-Process -FilePath 'java.exe' -ArgumentList (@('-jar', $jar) + $entry.Args) `
        -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError (Join-Path $logDir "$name.err.log")
}

function Wait-ServiceReady([string]$name, [int]$port) {
    # 网关和管理端的启动状态只检查监听端口，避免把未启动的下游服务或受保护路由误判为自身未就绪。
    if ($name -in @('gateway', 'admin-server')) {
        for ($attempt = 1; $attempt -le 60; $attempt++) {
            $listener = @(netstat.exe -ano 2>$null | Select-String -Pattern "(^|\s)(127\.0\.0\.1|0\.0\.0\.0|\[::\]):$port\s+.*LISTENING\s+\d+\s*$")
            if ($listener.Count -gt 0) {
                Write-Host "[local] $name 已就绪（端口 $port）"
                return
            }
            Start-Sleep -Seconds 1
        }
        throw "服务 $name 在 60 秒内未就绪，请查看 $logDir\$name.log 和对应 err.log。"
    }
    $uri = "http://localhost:$port/actuator/health"
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $uri -TimeoutSec 2 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Host "[local] $name 已就绪（$uri）"
                return
            }
        } catch {
            # 启动阶段端口尚未监听或依赖尚未完成，继续轮询并在超时后给出日志位置。
        }
        Start-Sleep -Seconds 1
    }
    throw "服务 $name 在 60 秒内未就绪，请查看 $logDir\$name.log 和对应 err.log。"
}

Write-Host '[local] 启动命令已提交，开始检查服务就绪状态：'
foreach ($name in $Services) {
    $entry = $map[$name]
    Wait-ServiceReady -name $name -port $entry.Port
}
Write-Host "  网关:    http://localhost:$GatewayPort/api/v1/system/ping"
