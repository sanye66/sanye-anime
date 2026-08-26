#requires -Version 5.1
<#!
sanye_anime Docker 中间件统一配置脚本

用途：
  1. 使用 Compose 启动最小或完整中间件环境。
  2. 对已有数据卷原地同步账号、密码、权限和 XXL-JOB 管理员。
  3. 调用 import-middleware-data.ps1 导入项目业务数据并验证各中间件。
  4. 对每个中间件执行健康检查、连接检查并输出可复制的连接信息。

默认运行完整环境：
  pwsh -ExecutionPolicy Bypass -File .\configure-middleware.ps1

最小环境：
  pwsh -ExecutionPolicy Bypass -File .\configure-middleware.ps1 -Profile minimal

说明：
  - 默认账号和密码仅用于本地开发，生产环境必须通过参数或环境变量覆盖。
  - 本脚本不会删除数据卷，也不会执行 docker compose down -v。
  - 修改已有数据卷中的旧密码时，可通过 Current* 参数提供旧凭据。
#>
[CmdletBinding()]
param(
    [ValidateSet('minimal', 'full')]
    [string]$Profile = 'full',
    [switch]$SkipComposeUp,
    [switch]$ForceRecreate,
    [switch]$SkipDataImport,

    [string]$PostgresUser,
    [string]$PostgresPassword,
    [string]$PostgresDb,
    [string]$PostgresHostPort,
    [string]$CurrentPostgresUser,

    [string]$RedisUsername,
    [string]$RedisPassword,
    [string]$RedisHostPort,
    [string]$CurrentRedisUsername,
    [string]$CurrentRedisPassword,

    [string]$RabbitmqUser,
    [string]$RabbitmqPassword,
    [string]$RabbitmqHostPort,

    [string]$MinioUser,
    [string]$MinioPassword,
    [string]$MinioHostPort,

    [string]$XxlJobMysqlUser,
    [string]$XxlJobMysqlPassword,
    [string]$XxlJobMysqlRootPassword,
    [string]$CurrentXxlJobMysqlRootPassword,

    [string]$KibanaHostPort
)

$ErrorActionPreference = 'Stop'
$script:composeFile = Join-Path $PSScriptRoot 'compose.yaml'

# 输出统一格式的阶段和结果，便于人工执行与 CI 采集日志。
function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[x] $Message" -ForegroundColor Red
}

# 按“脚本参数 > 当前进程环境变量 > 本地默认值”读取配置。
function Get-Setting {
    param(
        [string]$Provided,
        [string]$EnvironmentName,
        [string]$DefaultValue
    )

    if (-not [string]::IsNullOrWhiteSpace($Provided)) {
        return $Provided
    }
    $environmentValue = [Environment]::GetEnvironmentVariable($EnvironmentName)
    if (-not [string]::IsNullOrWhiteSpace($environmentValue)) {
        return $environmentValue
    }
    return $DefaultValue
}

# 仅在日志中展示凭证的首尾字符，避免把完整密码写入执行日志。
function Format-Masked {
    param([string]$Value)

    if ([string]::IsNullOrEmpty($Value) -or $Value.Length -le 4) {
        return '****'
    }
    return $Value.Substring(0, 2) + '****' + $Value.Substring($Value.Length - 2)
}

# 校验 PostgreSQL/MySQL 用户名和数据库名，防止标识符注入。
function Assert-SqlIdentifier {
    param(
        [string]$Value,
        [string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "$Name 只能包含字母、数字和下划线，且不能以数字开头。"
    }
}

# 校验凭证不能包含换行，避免破坏容器命令参数和 SQL 执行边界。
function Assert-CredentialText {
    param(
        [string]$Value,
        [string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -match '[\r\n]') {
        throw "$Name 不能为空且不能包含换行。"
    }
}

# 校验宿主机端口，提前阻止 Compose 因非法端口值启动失败。
function Assert-HostPort {
    param(
        [string]$Value,
        [string]$Name
    )

    $port = 0
    if (-not [int]::TryParse($Value, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
        throw "$Name 必须是 1 到 65535 之间的端口。"
    }
}

# 将值转换为 PostgreSQL 字符串字面量，供受控 SQL 使用。
function ConvertTo-PostgresLiteral {
    param([string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

# 将值转换为 PostgreSQL 双引号标识符，供受控 SQL 使用。
function ConvertTo-PostgresIdentifier {
    param([string]$Value)
    Assert-SqlIdentifier $Value 'PostgreSQL 标识符'
    return '"' + $Value.Replace('"', '""') + '"'
}

# 将值转换为 MySQL 字符串字面量，兼容密码中的反斜杠和单引号。
function ConvertTo-MySqlLiteral {
    param([string]$Value)
    $escaped = $Value.Replace('\', '\\').Replace("'", "\'")
    return "'" + $escaped + "'"
}

# 调用 docker exec，并统一检查原生命令退出码；异常日志不输出敏感参数。
function Invoke-DockerExec {
    param(
        [string]$Container,
        [string[]]$Arguments
    )

    $output = & docker exec $Container @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = ($output -join [Environment]::NewLine).Trim()
        if ($message.Length -gt 500) {
            $message = $message.Substring(0, 500)
        }
        throw "容器 $Container 执行命令失败：$message"
    }
    return $output
}

# 调用 Compose，统一注入 compose 文件并检查退出码。
function Invoke-Compose {
    param([string[]]$Arguments)

    & docker compose -f $script:composeFile @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose 执行失败，退出码：$LASTEXITCODE"
    }
}

# 使用 Docker API 判断引擎是否可用，避免后续错误被误判为服务配置问题。
function Test-DockerEngine {
    docker info *> $null
    return ($LASTEXITCODE -eq 0)
}

# 等待 Compose 中的健康检查全部通过，返回超时前的服务状态。
function Wait-Healthy {
    param(
        [string[]]$Containers,
        [int]$TimeoutSeconds = 180
    )

    $rounds = [math]::Ceiling($TimeoutSeconds / 5)
    for ($round = 0; $round -lt $rounds; $round++) {
        $allHealthy = $true
        $states = @()
        foreach ($container in $Containers) {
            $health = (& docker inspect --format '{{.State.Health.Status}}' $container 2>$null).Trim()
            if ([string]::IsNullOrWhiteSpace($health)) {
                $health = 'missing'
            }
            $states += "$container=$health"
            if ($health -ne 'healthy') {
                $allHealthy = $false
            }
        }
        Write-Host ($states -join ' | ')
        if ($allHealthy) {
            return
        }
        Start-Sleep -Seconds 5
    }
    throw "中间件健康检查超时：$($Containers -join ', ')"
}

# 执行 PostgreSQL SQL；容器内 Unix socket 认证避免把当前密码暴露到命令行。
function Invoke-PostgresSql {
    param(
        [string]$Sql,
        [string]$Database,
        [string]$User
    )

    return Invoke-DockerExec -Container 'sanye-postgres' -Arguments @(
        'psql', '-v', 'ON_ERROR_STOP=1', '-U', $User, '-d', $Database, '-tAc', $Sql
    )
}

# 在 PostgreSQL 中创建或更新角色、数据库和 schema 权限。
function Sync-Postgres {
    param(
        [string]$User,
        [string]$Password,
        [string]$Database,
        [string]$CurrentUser
    )

    Write-Step '同步 PostgreSQL 账号、数据库和权限'
    $userId = ConvertTo-PostgresIdentifier $User
    $userLiteral = ConvertTo-PostgresLiteral $User
    $passwordLiteral = ConvertTo-PostgresLiteral $Password
    $databaseId = ConvertTo-PostgresIdentifier $Database
    $databaseLiteral = ConvertTo-PostgresLiteral $Database

    $roleExists = (Invoke-PostgresSql -Sql "SELECT 1 FROM pg_roles WHERE rolname=$userLiteral;" -Database 'postgres' -User $CurrentUser).Trim()
    if ($roleExists -eq '1') {
        Invoke-PostgresSql -Sql "ALTER ROLE $userId WITH LOGIN PASSWORD $passwordLiteral;" -Database 'postgres' -User $CurrentUser | Out-Null
    } else {
        Invoke-PostgresSql -Sql "CREATE ROLE $userId LOGIN PASSWORD $passwordLiteral;" -Database 'postgres' -User $CurrentUser | Out-Null
    }

    $databaseExists = (Invoke-PostgresSql -Sql "SELECT 1 FROM pg_database WHERE datname=$databaseLiteral;" -Database 'postgres' -User $CurrentUser).Trim()
    if ($databaseExists -ne '1') {
        Invoke-PostgresSql -Sql "CREATE DATABASE $databaseId OWNER $userId;" -Database 'postgres' -User $CurrentUser | Out-Null
    } else {
        Invoke-PostgresSql -Sql "ALTER DATABASE $databaseId OWNER TO $userId; GRANT ALL PRIVILEGES ON DATABASE $databaseId TO $userId;" -Database 'postgres' -User $CurrentUser | Out-Null
    }

    $grantSql = "GRANT ALL ON SCHEMA public TO $userId; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $userId; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $userId;"
    Invoke-PostgresSql -Sql $grantSql -Database $Database -User $CurrentUser | Out-Null
    $result = (Invoke-PostgresSql -Sql "SELECT current_database() || ' / ' || current_user;" -Database $Database -User $User).Trim()
    Write-Ok "PostgreSQL 已配置：$result"
}

# 执行 Redis CLI，并允许使用当前旧凭据完成已有 ACL 数据卷的密码迁移。
function Invoke-RedisCli {
    param(
        [string]$AuthUser,
        [string]$AuthPassword,
        [string[]]$Command
    )

    $arguments = @('redis-cli', '--no-auth-warning', '--user', $AuthUser, '-a', $AuthPassword) + $Command
    return Invoke-DockerExec -Container 'sanye-redis' -Arguments $arguments
}

# 创建或更新 Redis ACL 用户，并关闭默认匿名用户。
function Sync-Redis {
    param(
        [string]$User,
        [string]$Password,
        [string]$CurrentUser,
        [string]$CurrentPassword
    )

    Write-Step '同步 Redis ACL 用户和密码'
    $authUser = $CurrentUser
    $authPassword = $CurrentPassword
    try {
        Invoke-RedisCli -AuthUser $authUser -AuthPassword $authPassword -Command @('PING') | Out-Null
    } catch {
        if ($CurrentUser -eq $User -and $CurrentPassword -eq $Password) {
            throw
        }
        Write-Warn 'Redis 当前凭据与目标配置不一致，尝试使用目标凭据连接。'
        $authUser = $User
        $authPassword = $Password
        Invoke-RedisCli -AuthUser $authUser -AuthPassword $authPassword -Command @('PING') | Out-Null
    }

    Invoke-RedisCli -AuthUser $authUser -AuthPassword $authPassword -Command @(
        'ACL', 'SETUSER', $User, 'on', (">" + $Password), '~*', '+@all'
    ) | Out-Null
    Invoke-RedisCli -AuthUser $User -AuthPassword $Password -Command @('ACL', 'SETUSER', 'default', 'off') | Out-Null
    Invoke-RedisCli -AuthUser $User -AuthPassword $Password -Command @('PING') | Out-Null
    Write-Ok "Redis 已配置：$User / $(Format-Masked $Password)，宿主机端口 $env:REDIS_HOST_PORT"
}

# 执行 RabbitMQ 管理命令，创建或修改管理用户并授权默认 vhost。
function Sync-RabbitMq {
    param(
        [string]$User,
        [string]$Password
    )

    Write-Step '同步 RabbitMQ 管理用户和权限'
    try {
        Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments @('rabbitmqctl', 'change_password', $User, $Password) | Out-Null
    } catch {
        Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments @('rabbitmqctl', 'add_user', $User, $Password) | Out-Null
    }
    Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments @('rabbitmqctl', 'set_user_tags', $User, 'administrator', 'management') | Out-Null
    Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments @('rabbitmqctl', 'set_permissions', '-p', '/', $User, '.*', '.*', '.*') | Out-Null
    Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments @('rabbitmqctl', 'authenticate_user', $User, $Password) | Out-Null
    Write-Ok "RabbitMQ 已配置：$User / $(Format-Masked $Password)，管理台端口 $env:RABBITMQ_HOST_PORT"
}

# 执行 XXL-JOB MySQL 命令，统一数据库用户、root 用户和管理台管理员账号。
function Invoke-XxlJobMySql {
    param(
        [string]$Username,
        [string]$Password,
        [string]$Sql
    )

    return Invoke-DockerExec -Container 'sanye-xxl-job-mysql' -Arguments @(
        'mysql', ("-u" + $Username), ("-p" + $Password), '--protocol=socket', '-e', $Sql
    )
}

# 计算 XXL-JOB 3.1.0 使用的 MD5 密码摘要。
function Get-Md5Hex {
    param([string]$Value)

    $md5 = [System.Security.Cryptography.MD5]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        return (($md5.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $md5.Dispose()
    }
}

# 同步 XXL-JOB MySQL 应用用户，并将管理台账号固定为同一套本地开发凭据。
function Sync-XxlJob {
    param(
        [string]$User,
        [string]$Password,
        [string]$RootPassword,
        [string]$CurrentRootPassword
    )

    Write-Step '同步 XXL-JOB MySQL 与管理台账号'
    $rootPassword = $RootPassword
    try {
        Invoke-XxlJobMySql -Username 'root' -Password $rootPassword -Sql 'SELECT 1;' | Out-Null
    } catch {
        if ($CurrentRootPassword -eq $RootPassword) {
            throw 'XXL-JOB MySQL root 密码不可用；如已有数据卷使用旧密码，请提供 -CurrentXxlJobMysqlRootPassword。'
        }
        $rootPassword = $CurrentRootPassword
        Invoke-XxlJobMySql -Username 'root' -Password $rootPassword -Sql 'SELECT 1;' | Out-Null
    }

    $userLiteral = ConvertTo-MySqlLiteral $User
    $passwordLiteral = ConvertTo-MySqlLiteral $Password
    $rootPasswordLiteral = ConvertTo-MySqlLiteral $RootPassword
    $userHost = "$userLiteral@'%'"
    $adminHash = Get-Md5Hex $Password
    $adminHashLiteral = ConvertTo-MySqlLiteral $adminHash
    $sql = @"
CREATE USER IF NOT EXISTS $userHost IDENTIFIED BY $passwordLiteral;
ALTER USER $userHost IDENTIFIED BY $passwordLiteral;
GRANT ALL PRIVILEGES ON xxl_job.* TO $userHost;
INSERT INTO xxl_job.xxl_job_user (username, password, role, permission)
VALUES ($userLiteral, $adminHashLiteral, 1, NULL)
ON DUPLICATE KEY UPDATE password=VALUES(password), role=1, permission=NULL;
ALTER USER 'root'@'%' IDENTIFIED BY $rootPasswordLiteral;
ALTER USER 'root'@'localhost' IDENTIFIED BY $rootPasswordLiteral;
FLUSH PRIVILEGES;
"@
    Invoke-XxlJobMySql -Username 'root' -Password $rootPassword -Sql $sql | Out-Null

    Invoke-XxlJobMySql -Username $User -Password $Password -Sql 'SELECT DATABASE(), CURRENT_USER();' | Out-Null
    Write-Ok "XXL-JOB MySQL 已配置：$User / $(Format-Masked $Password)，数据库 xxl_job"
    Write-Ok "XXL-JOB 管理台账号已配置：$User / $(Format-Masked $Password)"
}

# 使用 MinIO 自带 mc 检查对象存储 root 账号和 S3 API，数据卷保持不变。
function Sync-Minio {
    param(
        [string]$User,
        [string]$Password
    )

    Write-Step '同步 MinIO 控制台账号并验证对象 API'
    Invoke-DockerExec -Container 'sanye-minio' -Arguments @(
        'mc', 'alias', 'set', 'sanye-local', 'http://127.0.0.1:9000', $User, $Password
    ) | Out-Null
    Invoke-DockerExec -Container 'sanye-minio' -Arguments @('mc', 'admin', 'info', 'sanye-local') | Out-Null
    Write-Ok "MinIO 已配置：$User / $(Format-Masked $Password)，控制台端口 $env:MINIO_HOST_PORT"
}

# 访问宿主机管理入口，覆盖无需账号的 ES/Kibana/Nacos/Sentinel 和需登录的页面入口。
function Test-HttpEndpoint {
    param(
        [string]$Name,
        [string]$Uri
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -MaximumRedirection 3 -TimeoutSec 15
        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
            throw "HTTP $($response.StatusCode)"
        }
        Write-Ok "$Name：HTTP $($response.StatusCode) $Uri"
    } catch {
        throw "$Name 访问失败：$Uri；$($_.Exception.Message)"
    }
}

# 读取当前配置、注入 Compose 环境变量并执行全流程。
try {
    if (-not (Test-Path $script:composeFile)) {
        throw "未找到 Compose 文件：$script:composeFile"
    }
    if (-not (Test-DockerEngine)) {
        throw 'Docker 引擎不可用，请先启动 Docker Desktop，或先执行 setup-docker.ps1。'
    }

    $postgresUser = Get-Setting $PostgresUser 'POSTGRES_USER' 'sanye'
    $postgresPassword = Get-Setting $PostgresPassword 'POSTGRES_PASSWORD' '123456'
    $postgresDb = Get-Setting $PostgresDb 'POSTGRES_DB' 'sanye_anime'
    $postgresHostPort = Get-Setting $PostgresHostPort 'POSTGRES_HOST_PORT' '15432'
    $currentPostgresUser = Get-Setting $CurrentPostgresUser 'POSTGRES_CURRENT_USER' $postgresUser

    $redisUsername = Get-Setting $RedisUsername 'REDIS_USERNAME' 'sanye'
    $redisPassword = Get-Setting $RedisPassword 'REDIS_PASSWORD' '123456'
    $redisHostPort = Get-Setting $RedisHostPort 'REDIS_HOST_PORT' '16379'
    $currentRedisUsername = Get-Setting $CurrentRedisUsername 'REDIS_CURRENT_USERNAME' $redisUsername
    $currentRedisPassword = Get-Setting $CurrentRedisPassword 'REDIS_CURRENT_PASSWORD' $redisPassword

    $rabbitmqUser = Get-Setting $RabbitmqUser 'RABBITMQ_USER' 'sanye'
    $rabbitmqPassword = Get-Setting $RabbitmqPassword 'RABBITMQ_PASSWORD' '123456'
    $rabbitmqHostPort = Get-Setting $RabbitmqHostPort 'RABBITMQ_HOST_PORT' '15672'

    $minioUser = Get-Setting $MinioUser 'MINIO_USER' 'sanye'
    $minioPassword = Get-Setting $MinioPassword 'MINIO_PASSWORD' '12345678'
    $minioHostPort = Get-Setting $MinioHostPort 'MINIO_HOST_PORT' '9001'

    $xxlJobMysqlUser = Get-Setting $XxlJobMysqlUser 'XXL_JOB_MYSQL_USER' 'sanye'
    $xxlJobMysqlPassword = Get-Setting $XxlJobMysqlPassword 'XXL_JOB_MYSQL_PASSWORD' '123456'
    $xxlJobMysqlRootPassword = Get-Setting $XxlJobMysqlRootPassword 'XXL_JOB_MYSQL_ROOT_PASSWORD' '123456'
    $currentXxlJobMysqlRootPassword = Get-Setting $CurrentXxlJobMysqlRootPassword 'XXL_JOB_MYSQL_CURRENT_ROOT_PASSWORD' $xxlJobMysqlRootPassword
    $kibanaHostPort = Get-Setting $KibanaHostPort 'KIBANA_HOST_PORT' '5601'

    Assert-SqlIdentifier $postgresUser 'POSTGRES_USER'
    Assert-SqlIdentifier $postgresDb 'POSTGRES_DB'
    Assert-SqlIdentifier $currentPostgresUser 'POSTGRES_CURRENT_USER'
    Assert-SqlIdentifier $redisUsername 'REDIS_USERNAME'
    Assert-SqlIdentifier $currentRedisUsername 'REDIS_CURRENT_USERNAME'
    Assert-SqlIdentifier $rabbitmqUser 'RABBITMQ_USER'
    Assert-SqlIdentifier $minioUser 'MINIO_USER'
    Assert-SqlIdentifier $xxlJobMysqlUser 'XXL_JOB_MYSQL_USER'
    Assert-CredentialText $postgresPassword 'POSTGRES_PASSWORD'
    Assert-CredentialText $redisPassword 'REDIS_PASSWORD'
    Assert-CredentialText $currentRedisPassword 'REDIS_CURRENT_PASSWORD'
    Assert-CredentialText $rabbitmqPassword 'RABBITMQ_PASSWORD'
    Assert-CredentialText $minioPassword 'MINIO_PASSWORD'
    Assert-CredentialText $xxlJobMysqlPassword 'XXL_JOB_MYSQL_PASSWORD'
    Assert-CredentialText $xxlJobMysqlRootPassword 'XXL_JOB_MYSQL_ROOT_PASSWORD'
    Assert-CredentialText $currentXxlJobMysqlRootPassword 'XXL_JOB_MYSQL_CURRENT_ROOT_PASSWORD'
    if ($minioPassword.Length -lt 8) {
        throw 'MINIO_PASSWORD 长度不能小于 8 位，这是 MinIO 的最低要求。'
    }
    Assert-HostPort $postgresHostPort 'POSTGRES_HOST_PORT'
    Assert-HostPort $redisHostPort 'REDIS_HOST_PORT'
    Assert-HostPort $rabbitmqHostPort 'RABBITMQ_HOST_PORT'
    Assert-HostPort $minioHostPort 'MINIO_HOST_PORT'
    Assert-HostPort $kibanaHostPort 'KIBANA_HOST_PORT'

    # 只向当前 PowerShell 进程注入 Compose 所需配置，不落盘、不修改用户级环境变量。
    $env:POSTGRES_USER = $postgresUser
    $env:POSTGRES_PASSWORD = $postgresPassword
    $env:POSTGRES_DB = $postgresDb
    $env:POSTGRES_HOST_PORT = $postgresHostPort
    $env:REDIS_USERNAME = $redisUsername
    $env:REDIS_PASSWORD = $redisPassword
    $env:REDIS_HOST_PORT = $redisHostPort
    $env:RABBITMQ_USER = $rabbitmqUser
    $env:RABBITMQ_PASSWORD = $rabbitmqPassword
    $env:RABBITMQ_HOST_PORT = $rabbitmqHostPort
    $env:MINIO_USER = $minioUser
    $env:MINIO_PASSWORD = $minioPassword
    $env:MINIO_HOST_PORT = $minioHostPort
    $env:XXL_JOB_MYSQL_USER = $xxlJobMysqlUser
    $env:XXL_JOB_MYSQL_PASSWORD = $xxlJobMysqlPassword
    $env:XXL_JOB_MYSQL_ROOT_PASSWORD = $xxlJobMysqlRootPassword
    $env:KIBANA_HOST_PORT = $kibanaHostPort

    Write-Step '目标中间件配置'
    Write-Host "PostgreSQL  : localhost:$postgresHostPort / $postgresUser / $(Format-Masked $postgresPassword) / $postgresDb"
    Write-Host "Redis       : localhost:$redisHostPort / $redisUsername / $(Format-Masked $redisPassword)"
    Write-Host "RabbitMQ    : localhost:$rabbitmqHostPort / $rabbitmqUser / $(Format-Masked $rabbitmqPassword)"
    Write-Host "Elasticsearch: localhost:9200 / 无认证"
    Write-Host "Kibana      : localhost:$kibanaHostPort / 无认证"
    Write-Host "MinIO       : localhost:$minioHostPort / $minioUser / $(Format-Masked $minioPassword)"
    Write-Host 'Nacos       : localhost:8080/ / 无认证；容器 API 为 nacos:8848'
    Write-Host 'Sentinel    : localhost:8858 / 无认证'
    if ($Profile -eq 'full') {
        Write-Host "XXL-JOB DB  : xxl-job-mysql:3306/xxl_job / $xxlJobMysqlUser / $(Format-Masked $xxlJobMysqlPassword)"
        Write-Host "XXL-JOB     : localhost:18080/ / $xxlJobMysqlUser / $(Format-Masked $xxlJobMysqlPassword)"
    }

    if (-not $SkipComposeUp) {
        Write-Step "启动 Compose 中间件（profile=$Profile）"
        $configArgs = @()
        $upArgs = @()
        if ($Profile -eq 'full') {
            $configArgs += @('--profile', 'full')
            $upArgs += @('--profile', 'full')
        }
        $configArgs += @('config', '--quiet')
        Invoke-Compose -Arguments $configArgs
        if ($ForceRecreate) {
            $upArgs += '--force-recreate'
        }
        $upArgs += @('up', '-d')
        if ($Profile -eq 'minimal') {
            $upArgs += @('postgres', 'redis', 'rabbitmq', 'elasticsearch', 'minio')
        }
        Invoke-Compose -Arguments $upArgs
    }

    $targets = @('sanye-postgres', 'sanye-redis', 'sanye-rabbitmq', 'sanye-elasticsearch', 'sanye-minio')
    if ($Profile -eq 'full') {
        $targets += @('sanye-nacos', 'sanye-sentinel', 'sanye-kibana', 'sanye-xxl-job-mysql', 'sanye-xxl-job-admin')
    }
    Write-Step '等待中间件健康检查'
    Wait-Healthy -Containers $targets

    Sync-Postgres -User $postgresUser -Password $postgresPassword -Database $postgresDb -CurrentUser $currentPostgresUser
    Sync-Redis -User $redisUsername -Password $redisPassword -CurrentUser $currentRedisUsername -CurrentPassword $currentRedisPassword
    Sync-RabbitMq -User $rabbitmqUser -Password $rabbitmqPassword
    Sync-Minio -User $minioUser -Password $minioPassword
    if ($Profile -eq 'full') {
        Sync-XxlJob -User $xxlJobMysqlUser -Password $xxlJobMysqlPassword -RootPassword $xxlJobMysqlRootPassword -CurrentRootPassword $currentXxlJobMysqlRootPassword
    }

    Write-Step '验证管理入口和 REST 接口'
    Test-HttpEndpoint -Name 'Elasticsearch REST' -Uri 'http://localhost:9200/'
    Test-HttpEndpoint -Name 'MinIO Console' -Uri "http://localhost:$minioHostPort/"
    Test-HttpEndpoint -Name 'RabbitMQ Management' -Uri "http://localhost:$rabbitmqHostPort/"
    if ($Profile -eq 'full') {
        Test-HttpEndpoint -Name 'Kibana Console' -Uri "http://localhost:$kibanaHostPort/"
        Test-HttpEndpoint -Name 'Nacos Console' -Uri 'http://localhost:8080/'
        Test-HttpEndpoint -Name 'Sentinel Dashboard' -Uri 'http://localhost:8858/'
        Test-HttpEndpoint -Name 'XXL-JOB Admin' -Uri 'http://localhost:18080/'
    }

    if (-not $SkipDataImport) {
        Write-Step '导入项目数据到各中间件'
        $importScript = Join-Path $PSScriptRoot 'import-middleware-data.ps1'
        if (-not (Test-Path -LiteralPath $importScript)) {
            throw "未找到数据导入脚本：$importScript"
        }
        $pwsh = Get-Command 'pwsh' -ErrorAction SilentlyContinue
        if ($null -eq $pwsh) {
            $pwsh = Get-Command 'powershell' -ErrorAction Stop
        }
        & $pwsh.Source -NoProfile -ExecutionPolicy Bypass -File $importScript -Profile $Profile
        if ($LASTEXITCODE -ne 0) {
            throw "项目数据导入失败，退出码：$LASTEXITCODE"
        }
    }

    Write-Step '配置完成'
    Invoke-Compose -Arguments @('ps')
    Write-Host '统一配置脚本已完成：账号、权限、项目数据和各中间件验证均已同步。'
    Write-Host '下次重复执行：pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\configure-middleware.ps1'
    exit 0
} catch {
    Write-Fail $_.Exception.Message
    Write-Host '处理建议：检查 Docker Desktop/WSL2、端口占用和数据卷旧密码；修改已有密码时提供对应 Current* 参数。' -ForegroundColor Yellow
    exit 2
}
