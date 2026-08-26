#requires -Version 5.1
<#
sanye_anime 中间件数据导入脚本

用途：
  1. 将各业务服务 Flyway SQL 和管理平台 SQL 导入 PostgreSQL。
  2. 将作品目录导入 Elasticsearch，将首页种子缓存导入 Redis。
  3. 将封面和文件元数据导入 MinIO/文件服务数据面。
  4. 将 Nacos 配置、RabbitMQ 基础事件拓扑和 XXL-JOB 初始化状态写入对应中间件。

运行前提：
  - 已执行 configure-middleware.ps1，或已经启动 full profile 的 Compose 容器。
  - 默认账号为本地开发账号；生产环境必须通过环境变量覆盖。
  - 脚本只执行幂等导入，不删除 Docker 数据卷，不执行 docker compose down -v。

运行方式：
  pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\import-middleware-data.ps1
  pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\import-middleware-data.ps1 -Profile minimal
#>
[CmdletBinding()]
param(
    [ValidateSet('minimal', 'full')]
    [string]$Profile = 'full',
    [switch]$SkipPostgres,
    [switch]$SkipRedis,
    [switch]$SkipElasticsearch,
    [switch]$SkipMinio,
    [switch]$SkipNacos,
    [switch]$SkipRabbitMq,
    [switch]$SkipXxlJob
)

$ErrorActionPreference = 'Stop'
$script:repoRoot = Split-Path $PSScriptRoot -Parent
$script:postgresContainer = 'sanye-postgres'
$script:postgresUser = $null
$script:postgresDb = $null
$script:adminDb = $null

# 输出统一格式的导入阶段，便于人工排查和 CI 采集。
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

# 按“脚本参数/环境变量/默认值”读取本地导入配置。
function Get-Setting {
    param(
        [string]$EnvironmentName,
        [string]$DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($EnvironmentName)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }
    return $value
}

# 校验将被拼接进受控 SQL 的标识符，阻断意外的 SQL 注入边界。
function Assert-SqlIdentifier {
    param(
        [string]$Value,
        [string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "$Name 只能包含字母、数字和下划线，且不能以数字开头。"
    }
}

# 将受控字符串转换为 PostgreSQL 字面量，保留中文和单引号内容。
function ConvertTo-PostgresLiteral {
    param([string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

# 调用 Docker 命令并统一检查退出码；错误信息截断以避免日志失控。
function Invoke-DockerExec {
    param(
        [string]$Container,
        [string[]]$Arguments
    )

    $output = & docker exec $Container @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = ($output -join [Environment]::NewLine).Trim()
        if ($message.Length -gt 800) {
            $message = $message.Substring(0, 800)
        }
        throw "容器 $Container 执行命令失败：$message"
    }
    return $output
}

# 检查容器处于运行状态，避免把导入失败误判为 SQL 或 API 问题。
function Assert-ContainerRunning {
    param([string]$Container)

    $running = (& docker inspect --format '{{.State.Running}}' $Container 2>$null).Trim()
    if ($running -ne 'true') {
        throw "容器 $Container 未运行，请先执行 configure-middleware.ps1。"
    }
}

# 执行 PostgreSQL 查询并返回去掉首尾空白的文本结果。
function Invoke-PostgresSql {
    param(
        [string]$Sql,
        [string]$Database = $script:postgresDb,
        [string]$User = $script:postgresUser
    )

    $result = Invoke-DockerExec -Container $script:postgresContainer -Arguments @(
        'psql', '-v', 'ON_ERROR_STOP=1', '-U', $User, '-d', $Database, '-tAc', $Sql
    )
    return (($result -join [Environment]::NewLine).Trim())
}

# 执行返回多行结果的 PostgreSQL 查询，保留每一行独立内容供 JSON bulk 导入使用。
function Invoke-PostgresLines {
    param(
        [string]$Sql,
        [string]$Database = $script:postgresDb,
        [string]$User = $script:postgresUser
    )

    $result = Invoke-DockerExec -Container $script:postgresContainer -Arguments @(
        'psql', '-v', 'ON_ERROR_STOP=1', '-U', $User, '-d', $Database, '-tAc', $Sql
    )
    return @($result | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ })
}

# 通过 docker cp 和容器内 psql 执行 UTF-8 SQL 文件，避免 PowerShell 管道改变中文编码。
function Invoke-PostgresFile {
    param(
        [string]$File,
        [string]$Database,
        [string]$User,
        [string]$SearchPath
    )

    if (-not (Test-Path -LiteralPath $File)) {
        throw "未找到 PostgreSQL SQL 文件：$File"
    }
    $remoteFile = "/tmp/sanye-import-$([Guid]::NewGuid().ToString('N')).sql"
    & docker cp $File "$($script:postgresContainer):$remoteFile" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "复制 SQL 文件失败：$File"
    }
    try {
        $arguments = @('psql', '-1', '-v', 'ON_ERROR_STOP=1', '-U', $User, '-d', $Database)
        if (-not [string]::IsNullOrWhiteSpace($SearchPath)) {
            # psql 的 -c 与 -f 在同一会话中按参数顺序执行，确保迁移文件使用目标 schema。
            $arguments += @('-c', "set search_path to $SearchPath;")
        }
        $arguments += @('-f', $remoteFile)
        Invoke-DockerExec -Container $script:postgresContainer -Arguments $arguments | Out-Null
    } finally {
        & docker exec $script:postgresContainer rm -f $remoteFile 2>$null | Out-Null
    }
}

# 创建导入追踪表，保证业务迁移和管理平台初始化脚本重复执行时不会重复导入。
function Initialize-MigrationTable {
    param([string]$Database)

    Invoke-PostgresSql -Database $Database -Sql @"
create table if not exists public.sanye_deploy_migration (
    component varchar(64) not null,
    version varchar(64) not null,
    file_name varchar(255) not null,
    checksum varchar(64) not null,
    applied_at timestamptz not null default now(),
    primary key (component, version)
);
"@ | Out-Null
}

# 创建 Flyway 原生历史表，保证脚本导入的数据能被服务启动时的 Flyway 识别。
function Initialize-FlywayHistoryTable {
    param([string]$Schema)

    Assert-SqlIdentifier $Schema 'Flyway schema'
    $schemaId = '"' + $Schema + '"'
    Invoke-PostgresSql -Database $script:postgresDb -Sql @"
create schema if not exists $schemaId;
create table if not exists ${schemaId}.flyway_schema_history (
    installed_rank integer not null primary key,
    version varchar(50),
    description varchar(200) not null,
    type varchar(20) not null,
    script varchar(1000) not null,
    checksum integer,
    installed_by varchar(100) not null,
    installed_on timestamp without time zone not null default now(),
    execution_time integer not null,
    success boolean not null
);
create index if not exists flyway_schema_history_s_idx
    on ${schemaId}.flyway_schema_history (success);
"@ | Out-Null
}

# 将手工导入的迁移登记到 Flyway 历史表；checksum 留空表示由自定义 SHA-256 追踪表负责文件完整性校验。
function Sync-FlywayHistory {
    param(
        [string]$Schema,
        [string]$Version,
        [System.IO.FileInfo]$File
    )

    Assert-SqlIdentifier $Schema 'Flyway schema'
    $schemaId = '"' + $Schema + '"'
    # Flyway 历史表只接受数字版本；自定义追踪表保留 V1 形式以匹配文件名。
    $flywayVersion = $Version -replace '^V', ''
    $versionLiteral = ConvertTo-PostgresLiteral $flywayVersion
    $description = ($File.BaseName -split '__', 2)[1]
    if ([string]::IsNullOrWhiteSpace($description)) {
        $description = $File.BaseName
    }
    $descriptionLiteral = ConvertTo-PostgresLiteral ($description.Replace('_', ' '))
    $scriptLiteral = ConvertTo-PostgresLiteral $File.Name
    $installedByLiteral = ConvertTo-PostgresLiteral $script:postgresUser
    Invoke-PostgresSql -Database $script:postgresDb -Sql @"
update ${schemaId}.flyway_schema_history
set version = regexp_replace(version, '^V', '')
where version like 'V%';
"@ | Out-Null
    $historyExists = Invoke-PostgresSql -Database $script:postgresDb -Sql "select 1 from ${schemaId}.flyway_schema_history where version = $versionLiteral limit 1;"
    if ($historyExists -eq '1') {
        return
    }
    $nextRank = Invoke-PostgresSql -Database $script:postgresDb -Sql "select coalesce(max(installed_rank), 0) + 1 from ${schemaId}.flyway_schema_history;"
    Invoke-PostgresSql -Database $script:postgresDb -Sql @"
insert into ${schemaId}.flyway_schema_history
    (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success)
values ($nextRank, $versionLiteral, $descriptionLiteral, 'SQL', $scriptLiteral,
        null, $installedByLiteral, now(), 0, true);
"@ | Out-Null
}

# 查询某个迁移是否已经成功登记。
function Test-MigrationApplied {
    param(
        [string]$Database,
        [string]$Component,
        [string]$Version
    )

    $componentLiteral = ConvertTo-PostgresLiteral $Component
    $versionLiteral = ConvertTo-PostgresLiteral $Version
    return (Invoke-PostgresSql -Database $Database -Sql "select 1 from public.sanye_deploy_migration where component=$componentLiteral and version=$versionLiteral;") -eq '1'
}

# 导入单个 Flyway 文件并写入 checksum；已应用迁移只做跳过，不覆盖业务数据。
function Invoke-TrackedMigration {
    param(
        [string]$Database,
        [string]$Component,
        [string]$Schema,
        [System.IO.FileInfo]$File
    )

    $version = ($File.BaseName -split '__')[0]
    $checksum = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    Initialize-FlywayHistoryTable -Schema $Schema
    if (Test-MigrationApplied -Database $Database -Component $Component -Version $version) {
        Write-Host "  跳过已导入：$Component/$version"
        Sync-FlywayHistory -Schema $Schema -Version $version -File $File
        return
    }

    Invoke-PostgresSql -Database $Database -Sql "create schema if not exists $Schema;" | Out-Null
    Write-Host "  导入迁移：$Component/$version -> $Schema"
    Invoke-PostgresFile -File $File.FullName -Database $Database -User $script:postgresUser -SearchPath "$Schema,public"
    $componentLiteral = ConvertTo-PostgresLiteral $Component
    $versionLiteral = ConvertTo-PostgresLiteral $version
    $fileLiteral = ConvertTo-PostgresLiteral $File.Name
    $checksumLiteral = ConvertTo-PostgresLiteral $checksum
    Invoke-PostgresSql -Database $Database -Sql @"
insert into public.sanye_deploy_migration (component, version, file_name, checksum)
values ($componentLiteral, $versionLiteral, $fileLiteral, $checksumLiteral)
on conflict (component, version) do update set file_name=excluded.file_name, checksum=excluded.checksum;
"@ | Out-Null
    Sync-FlywayHistory -Schema $Schema -Version $version -File $File
    Write-Ok "已导入迁移：$Component/$version"
}

# 返回按 V 编号排序的服务迁移清单，源文件只读取 src/main/resources，排除构建产物。
function Get-ServiceMigrations {
    $services = @(
        [pscustomobject]@{ Component = 'anime'; Schema = 'sanye_anime'; RelativePath = 'sanye_server/sanye-server-anime/src/main/resources/db/migration' },
        [pscustomobject]@{ Component = 'auth'; Schema = 'sanye_auth'; RelativePath = 'sanye_server/sanye-server-auth/src/main/resources/db/migration' },
        [pscustomobject]@{ Component = 'ai-chat'; Schema = 'sanye_ai_chat'; RelativePath = 'sanye_server/sanye-server-ai-chat/src/main/resources/db/migration' },
        [pscustomobject]@{ Component = 'favorite'; Schema = 'sanye_favorite'; RelativePath = 'sanye_server/sanye-server-favorite/src/main/resources/db/migration' },
        [pscustomobject]@{ Component = 'file'; Schema = 'sanye_file'; RelativePath = 'sanye_server/sanye-server-file/src/main/resources/db/migration' },
        [pscustomobject]@{ Component = 'feedback'; Schema = 'sanye_feedback'; RelativePath = 'sanye_server/sanye-server-feedback/src/main/resources/db/migration' },
        [pscustomobject]@{ Component = 'job'; Schema = 'sanye_job'; RelativePath = 'sanye_server/sanye-server-job/src/main/resources/db/migration' },
        [pscustomobject]@{ Component = 'search'; Schema = 'sanye_search'; RelativePath = 'sanye_server/sanye-server-search/src/main/resources/db/migration' }
    )
    foreach ($service in $services) {
        $directory = Join-Path $script:repoRoot $service.RelativePath
        $files = @(Get-ChildItem -LiteralPath $directory -File -Filter 'V*.sql' | Sort-Object @{ Expression = { [int]($_.BaseName -replace '^V(\d+).*', '$1') } })
        if ($files.Count -eq 0) {
            throw "服务 $($service.Component) 没有找到迁移文件：$directory"
        }
        foreach ($file in $files) {
            [pscustomobject]@{ Component = $service.Component; Schema = $service.Schema; File = $file }
        }
    }
}

# 导入业务服务全部 PostgreSQL schema，并保留 Flyway 兼容的版本顺序。
function Import-ServicePostgresData {
    Write-Step '导入业务服务 PostgreSQL 迁移和种子数据'
    Initialize-MigrationTable -Database $script:postgresDb
    foreach ($migration in Get-ServiceMigrations) {
        Invoke-TrackedMigration -Database $script:postgresDb -Component $migration.Component `
            -Schema $migration.Schema -File $migration.File
    }
    Write-Ok '业务服务 PostgreSQL 数据导入完成'
}

# 创建管理平台独立数据库，并把 RuoYi 与 Quartz PostgreSQL 表初始化到该库。
function Import-AdminPostgresData {
    Write-Step "导入管理平台 PostgreSQL 数据库：$script:adminDb"
    $adminDbLiteral = ConvertTo-PostgresLiteral $script:adminDb
    $exists = Invoke-PostgresSql -Database 'postgres' -Sql "select 1 from pg_database where datname=$adminDbLiteral;"
    if ($exists -ne '1') {
        Invoke-PostgresSql -Database 'postgres' -Sql "create database $script:adminDb owner $script:postgresUser;"
        Write-Ok "已创建管理平台数据库：$script:adminDb"
    }
    Invoke-PostgresSql -Database $script:adminDb -Sql "grant all on schema public to $script:postgresUser; alter default privileges in schema public grant all on tables to $script:postgresUser; alter default privileges in schema public grant all on sequences to $script:postgresUser;" | Out-Null
    Initialize-MigrationTable -Database $script:adminDb

    $schemaFile = Join-Path $script:repoRoot 'sanye_admin_server/sql/sanye_admin_schema.sql'
    $quartzFile = Join-Path $script:repoRoot 'sanye_admin_server/sql/sanye_admin_quartz_schema.sql'
    $hasAdminTables = Invoke-PostgresSql -Database $script:adminDb -Sql "select case when to_regclass('public.sanye_sys_user') is null then 0 else 1 end;"
    if (-not (Test-MigrationApplied -Database $script:adminDb -Component 'admin' -Version 'schema')) {
        if ($hasAdminTables -eq '1') {
            Write-Warn '管理平台表已存在但没有导入标记，为避免 DROP TABLE 未自动重跑管理平台初始化脚本。'
        } else {
            Invoke-PostgresFile -File $schemaFile -Database $script:adminDb -User $script:postgresUser -SearchPath 'public'
            $schemaChecksum = (Get-FileHash -LiteralPath $schemaFile -Algorithm SHA256).Hash.ToLowerInvariant()
            $schemaChecksumLiteral = ConvertTo-PostgresLiteral $schemaChecksum
            Invoke-PostgresSql -Database $script:adminDb -Sql "insert into public.sanye_deploy_migration(component,version,file_name,checksum) values ('admin','schema','sanye_admin_schema.sql',$schemaChecksumLiteral) on conflict (component,version) do nothing;" | Out-Null
            Write-Ok '已导入管理平台表和种子数据'
        }
    }
    $hasQuartzTables = Invoke-PostgresSql -Database $script:adminDb -Sql "select case when to_regclass('public.sanye_qrtz_job_details') is null then 0 else 1 end;"
    if (-not (Test-MigrationApplied -Database $script:adminDb -Component 'admin' -Version 'quartz')) {
        if ($hasQuartzTables -eq '1') {
            Write-Warn 'Quartz 表已存在但没有导入标记，为避免 DROP TABLE 未自动重跑 Quartz 初始化脚本。'
        } else {
            Invoke-PostgresFile -File $quartzFile -Database $script:adminDb -User $script:postgresUser -SearchPath 'public'
            $quartzChecksum = (Get-FileHash -LiteralPath $quartzFile -Algorithm SHA256).Hash.ToLowerInvariant()
            $quartzChecksumLiteral = ConvertTo-PostgresLiteral $quartzChecksum
            Invoke-PostgresSql -Database $script:adminDb -Sql "insert into public.sanye_deploy_migration(component,version,file_name,checksum) values ('admin','quartz','sanye_admin_quartz_schema.sql',$quartzChecksumLiteral) on conflict (component,version) do nothing;" | Out-Null
            Write-Ok '已导入管理平台 Quartz 表结构'
        }
    }
}

# 查询作品主数据并构造 ES 搜索文档，避免依赖尚未启动的搜索服务。
function Get-AnimeSearchRows {
    $sql = @"
select json_build_object(
  'id', id,
  'title', title,
  'originalTitle', original_title,
  'type', type,
  'year', year,
  'score', score,
  'status', status,
  'coverUrl', '/covers/anime-' || id || '.svg',
  'tags', tags_json,
  'updateText', update_text,
  'summary', coalesce(summary, '')
)::text
from sanye_anime.sanye_anime
where deleted_at is null and status = '已发布'
order by id;
"@
    return @(Invoke-PostgresLines -Database $script:postgresDb -Sql $sql)
}

# 创建 ES 索引映射；索引已存在时保留已有映射和数据。
function Ensure-ElasticsearchIndex {
    param([string]$BaseUrl)

    $index = 'sanye_anime'
    try {
        Invoke-WebRequest -UseBasicParsing -Method Head -Uri "$BaseUrl/$index" -TimeoutSec 15 | Out-Null
        Write-Host "  ES 索引已存在：$index"
        return
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -ne 404) {
            throw "检查 ES 索引失败：$($_.Exception.Message)"
        }
    }
    $properties = [ordered]@{
        id = @{ type = 'long' }
        title = @{ type = 'text' }
        originalTitle = @{ type = 'text' }
        type = @{ type = 'keyword' }
        year = @{ type = 'integer' }
        score = @{ type = 'double' }
        status = @{ type = 'keyword' }
        coverUrl = @{ type = 'keyword' }
        tags = @{ type = 'text' }
        updateText = @{ type = 'keyword' }
        summary = @{ type = 'text' }
    }
    $body = ([ordered]@{ mappings = [ordered]@{ properties = $properties } } | ConvertTo-Json -Depth 20 -Compress)
    Invoke-RestMethod -Method Put -Uri "$BaseUrl/$index" -ContentType 'application/json; charset=utf-8' -Body $body | Out-Null
    Write-Ok "已创建 ES 索引：$index"
}

# 通过 bulk API 幂等覆盖作品文档，并等待刷新后验证文档数量。
function Import-ElasticsearchData {
    param([string]$BaseUrl)

    Write-Step '导入 Elasticsearch 作品索引'
    Ensure-ElasticsearchIndex -BaseUrl $BaseUrl
    $rows = Get-AnimeSearchRows
    if ($rows.Count -eq 0) {
        throw 'PostgreSQL 中没有可导入 ES 的已发布作品。'
    }
    $bulkLines = New-Object System.Collections.Generic.List[string]
    foreach ($row in $rows) {
        $document = $row.Trim()
        $parsed = $document | ConvertFrom-Json
        $metadata = [ordered]@{ index = [ordered]@{ _index = 'sanye_anime'; _id = [string]$parsed.id } }
        $bulkLines.Add(($metadata | ConvertTo-Json -Compress))
        $bulkLines.Add($document)
    }
    $bulkBody = ($bulkLines -join "`n") + "`n"
    $bulkResult = Invoke-RestMethod -Method Post -Uri "$BaseUrl/_bulk?refresh=wait_for" -ContentType 'application/x-ndjson; charset=utf-8' -Body $bulkBody
    if ($bulkResult.errors -eq $true) {
        throw 'ES bulk 导入返回 errors=true，请检查 Elasticsearch 响应。'
    }
    $count = [int](Invoke-RestMethod -Method Get -Uri "$BaseUrl/sanye_anime/_count").count
    if ($count -lt $rows.Count) {
        throw "ES 文档数量校验失败：期望至少 $($rows.Count)，实际 $count。"
    }
    Write-Ok "ES 作品索引已导入：$count 条文档"
}

# 执行 Redis CLI；所有缓存写入都使用项目实际的 sanye:home: 前缀。
function Invoke-RedisCli {
    param([string[]]$Command)

    return Invoke-DockerExec -Container 'sanye-redis' -Arguments (@(
        'redis-cli', '--no-auth-warning', '--user', $script:redisUser, '-a', $script:redisPassword
    ) + $Command)
}

# 从 PostgreSQL 生成与 HomeResponse 记录结构一致的首页 JSON，作为可回源的初始化缓存。
function Get-HomeSeedJson {
    $cardExpression = "json_build_object('id', id, 'title', title, 'originalTitle', original_title, 'type', type, 'year', year, 'score', score, 'status', status, 'coverUrl', '/covers/anime-' || id || '.svg', 'tags', tags_json, 'updateText', update_text)"
    $recent = Invoke-PostgresSql -Database $script:postgresDb -Sql "select coalesce(json_agg(x.card order by x.year desc), '[]'::json) from (select $cardExpression as card, year from sanye_anime.sanye_anime where deleted_at is null and status='已发布' and (update_text like '%更新%' or update_text='已完结') order by year desc limit 4) x;"
    $popular = Invoke-PostgresSql -Database $script:postgresDb -Sql "select coalesce(json_agg(x.card order by x.score desc), '[]'::json) from (select $cardExpression as card, score from sanye_anime.sanye_anime where deleted_at is null and status='已发布' order by score desc limit 4) x;"
    $homeData = [ordered]@{
        banners = @()
        sections = @(
            [ordered]@{ key = 'recent'; title = '最近更新'; anime = @($recent | ConvertFrom-Json) }
            [ordered]@{ key = 'popular'; title = '热门动漫'; anime = @($popular | ConvertFrom-Json) }
        )
        quickLinks = @()
    }
    return ($homeData | ConvertTo-Json -Depth 20 -Compress)
}

# 写入首页缓存和种子版本标识；缓存数据可被业务回源覆盖，TTL 与代码默认值保持一致。
function Import-RedisData {
    Write-Step '导入 Redis 首页种子缓存'
    $json = Get-HomeSeedJson
    foreach ($tab in @('FEATURED', 'LATEST', 'POPULAR')) {
        $key = "sanye:home:home:$tab"
        Invoke-RedisCli -Command @('SET', $key, $json, 'EX', '300') | Out-Null
    }
    Invoke-RedisCli -Command @('SET', 'sanye:middleware:seed-version', '2026-08-21-data-import', 'EX', '86400') | Out-Null
    $keyCount = (Invoke-RedisCli -Command @('SCAN', '0', 'MATCH', 'sanye:home:*', 'COUNT', '100')) -join ' '
    if ($keyCount -notmatch 'sanye:home:home:FEATURED') {
        throw 'Redis 首页种子缓存验证失败。'
    }
    Write-Ok 'Redis 首页缓存已导入：FEATURED/LATEST/POPULAR'
}

# 将文件复制到 MinIO 的对象 bucket，同时复制到当前文件服务本地根目录，避免元数据与运行时读取路径不一致。
function Import-MinioData {
    param([string]$Bucket = 'sanye-anime')

    Write-Step "导入 MinIO 封面对象：$Bucket"
    $coverDir = Join-Path $script:repoRoot 'sanye_server/sanye-server-anime/src/main/resources/static/covers'
    $files = @(Get-ChildItem -LiteralPath $coverDir -File | Sort-Object Name)
    if ($files.Count -eq 0) {
        throw "没有找到封面资源：$coverDir"
    }
    Invoke-DockerExec -Container 'sanye-minio' -Arguments @('mc', 'alias', 'set', 'sanye-local', 'http://127.0.0.1:9000', $script:minioUser, $script:minioPassword) | Out-Null
    Invoke-DockerExec -Container 'sanye-minio' -Arguments @('mc', 'mb', '--ignore-existing', "sanye-local/$Bucket") | Out-Null
    $localRoot = Join-Path $script:repoRoot "sanye_deploy/.local/files/$Bucket/covers"
    New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
    $remoteTemp = '/tmp/sanye-anime-covers'
    Invoke-DockerExec -Container 'sanye-minio' -Arguments @('sh', '-c', "mkdir -p '$remoteTemp'") | Out-Null

    foreach ($file in $files) {
        $remoteFile = "$remoteTemp/$($file.Name)"
        & docker cp $file.FullName "sanye-minio:$remoteFile" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "复制封面到 MinIO 容器失败：$($file.Name)"
        }
        Invoke-DockerExec -Container 'sanye-minio' -Arguments @('mc', 'cp', $remoteFile, "sanye-local/$Bucket/covers/$($file.Name)") | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $localRoot $file.Name) -Force
    }
    $objects = @(Invoke-DockerExec -Container 'sanye-minio' -Arguments @('mc', 'ls', '--recursive', "sanye-local/$Bucket/covers") | Where-Object { $_ -match '\.svg\s*$' })
    if ($objects.Count -lt $files.Count) {
        throw "MinIO 对象数量校验失败：期望至少 $($files.Count)，实际 $($objects.Count)。"
    }

    $values = New-Object System.Collections.Generic.List[string]
    foreach ($file in $files) {
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $contentType = if ($file.Extension -ieq '.svg') { 'image/svg+xml' } else { 'application/octet-stream' }
        $objectKey = "covers/$($file.Name)"
        $values.Add("(" + (ConvertTo-PostgresLiteral $Bucket) + "," + (ConvertTo-PostgresLiteral $objectKey) + "," + (ConvertTo-PostgresLiteral $file.Name) + "," + (ConvertTo-PostgresLiteral $contentType) + ",$($file.Length)," + (ConvertTo-PostgresLiteral $hash) + ",'PASS',null,'ACTIVE')")
    }
    $sql = "insert into sanye_file.sanye_file_object (bucket,object_key,original_name,content_type,size_bytes,sha256,scan_status,owner_user_id,status) values " + ($values -join ',') + " on conflict (object_key) do update set bucket=excluded.bucket, original_name=excluded.original_name, content_type=excluded.content_type, size_bytes=excluded.size_bytes, sha256=excluded.sha256, scan_status='PASS', status='ACTIVE'; select setval('sanye_file.sanye_file_object_id_seq', coalesce((select max(id) from sanye_file.sanye_file_object), 1), true);"
    Invoke-PostgresSql -Database $script:postgresDb -Sql $sql | Out-Null
    $metadataCount = Invoke-PostgresSql -Database $script:postgresDb -Sql "select count(*) from sanye_file.sanye_file_object where bucket='sanye-anime' and object_key like 'covers/%';"
    if ([int]$metadataCount -lt $files.Count) {
        throw "文件元数据数量校验失败：期望至少 $($files.Count)，实际 $metadataCount。"
    }
    Write-Ok "MinIO 已导入 $($files.Count) 个封面对象，文件元数据已同步 $metadataCount 条"
}

# 使用 Nacos 3.x 的兼容配置接口写入 YAML 文件，并在同一容器内回读确认。
function Publish-NacosConfig {
    param(
        [string]$File,
        [string]$Group
    )

    $dataId = (Get-Item -LiteralPath $File).Name
    $content = Get-Content -LiteralPath $File -Raw
    $command = "curl -fsS --max-time 20 -X POST 'http://127.0.0.1:8848/nacos/v1/cs/configs' --data-urlencode 'dataId=$dataId' --data-urlencode 'group=$Group' --data-urlencode 'type=yaml' --data-urlencode 'content@-'"
    $response = $content | & docker exec -i sanye-nacos sh -c $command 2>&1
    if ($LASTEXITCODE -ne 0 -or (($response -join '').Trim() -ne 'true')) {
        throw "Nacos 配置发布失败：$dataId/$Group；响应：$(($response -join ' ').Trim())"
    }
    $encodedDataId = [Uri]::EscapeDataString($dataId)
    $encodedGroup = [Uri]::EscapeDataString($Group)
    $read = Invoke-DockerExec -Container 'sanye-nacos' -Arguments @('curl', '-fsS', "http://127.0.0.1:8848/nacos/v1/cs/configs?dataId=$encodedDataId&group=$encodedGroup")
    if (($read -join [Environment]::NewLine) -notmatch 'sanye_anime|server:|spring:') {
        throw "Nacos 配置回读内容异常：$dataId/$Group"
    }
    Write-Ok "Nacos 配置已导入：$dataId/$Group"
}

# 导入共享配置和 8 个应用配置；服务注册实例属于运行时状态，不在静态数据脚本中伪造。
function Import-NacosData {
    Write-Step '导入 Nacos 配置数据'
    Publish-NacosConfig -File (Join-Path $script:repoRoot 'sanye_deploy/nacos/sanye-common.yaml') -Group 'COMMON_GROUP'
    $files = @(Get-ChildItem -LiteralPath (Join-Path $script:repoRoot 'sanye_deploy/nacos') -File -Filter 'sanye-server-*.yaml' | Sort-Object Name)
    foreach ($file in $files) {
        Publish-NacosConfig -File $file.FullName -Group 'BUSINESS_GROUP'
    }
    $configCount = 0
    foreach ($file in @((Join-Path $script:repoRoot 'sanye_deploy/nacos/sanye-common.yaml')) + $files.FullName) {
        if (Test-Path -LiteralPath $file) { $configCount++ }
    }
    Write-Ok "Nacos 配置导入完成：$configCount 条；服务实例由应用启动后动态注册"
}

# 创建项目事件交换机、审计队列和全量绑定；当前代码没有消费者，因此不发送伪造业务消息。
function Import-RabbitMqData {
    Write-Step '导入 RabbitMQ 项目事件拓扑'
    $admin = @('--username', $script:rabbitUser, '--password', $script:rabbitPassword, '--vhost', '/')
    Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments (@('rabbitmqadmin') + $admin + @('declare', 'exchange', 'name=sanye.events', 'type=topic', 'durable=true')) | Out-Null
    Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments (@('rabbitmqadmin') + $admin + @('declare', 'queue', 'name=sanye.events.audit', 'durable=true', 'auto_delete=false')) | Out-Null
    Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments (@('rabbitmqadmin') + $admin + @('declare', 'binding', 'source=sanye.events', 'destination_type=queue', 'destination=sanye.events.audit', 'routing_key=#')) | Out-Null
    $exchangeOutput = Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments (@('rabbitmqadmin') + $admin + @('list', 'exchanges', 'name'))
    $queueOutput = Invoke-DockerExec -Container 'sanye-rabbitmq' -Arguments (@('rabbitmqadmin') + $admin + @('list', 'queues', 'name'))
    $exchanges = $exchangeOutput -join [Environment]::NewLine
    $queues = $queueOutput -join [Environment]::NewLine
    if ($exchanges -notmatch 'sanye.events' -or $queues -notmatch 'sanye.events.audit') {
        throw 'RabbitMQ 事件拓扑验证失败。'
    }
    Write-Ok 'RabbitMQ 已导入 sanye.events 交换机和 sanye.events.audit 队列（当前无业务消息）'
}

# 计算 XXL-JOB 管理台使用的 MD5 密码摘要。
function Get-Md5Hex {
    param([string]$Value)
    $md5 = [System.Security.Cryptography.MD5]::Create()
    try {
        return (($md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Value)) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $md5.Dispose()
    }
}

# 执行 XXL-JOB MySQL 查询；密码只作为当前容器内命令参数使用，不写入仓库。
function Invoke-XxlMySql {
    param([string]$Sql)
    $result = Invoke-DockerExec -Container 'sanye-xxl-job-mysql' -Arguments @(
        'mysql', ('-u' + $script:xxlUser), ('-p' + $script:xxlPassword), '-N', '-B', '-e', $Sql
    )
    # MySQL 将“命令行密码不安全”写到 stderr；它不是查询结果，过滤后再做数字校验。
    return @($result | Where-Object { $_.ToString() -notmatch '^mysql:\s*\[Warning\]' })
}

# 确保 XXL-JOB 管理员、执行器组和调度锁存在；没有项目真实任务时保持 xxl_job_info 为空。
function Import-XxlJobData {
    Write-Step '核验 XXL-JOB 初始化数据'
    $hash = Get-Md5Hex $script:xxlPassword
    $mysqlHash = $hash.Replace("'", "''")
    $sql = @"
insert into xxl_job.xxl_job_user (username,password,role,permission)
values ('sanye','$mysqlHash',1,null)
on duplicate key update password=values(password), role=1, permission=null;
insert into xxl_job.xxl_job_group (id,app_name,title,address_type,address_list,update_time)
values (1,'sanye-anime-executor','sanye_anime',0,null,now())
on duplicate key update app_name=values(app_name), title=values(title), update_time=now();
insert into xxl_job.xxl_job_lock (lock_name) values ('schedule_lock') on duplicate key update lock_name=values(lock_name);
"@
    Invoke-XxlMySql -Sql $sql | Out-Null
    $userCount = [int]((Invoke-XxlMySql -Sql "select count(*) from xxl_job.xxl_job_user;") -join '').Trim()
    $groupCount = [int]((Invoke-XxlMySql -Sql "select count(*) from xxl_job.xxl_job_group;") -join '').Trim()
    $jobCount = [int]((Invoke-XxlMySql -Sql "select count(*) from xxl_job.xxl_job_info;") -join '').Trim()
    if ($userCount -lt 1 -or $groupCount -lt 1 -or $jobCount -ne 0) {
        throw "XXL-JOB 数据校验失败：用户=$userCount，执行器=$groupCount，任务=$jobCount。"
    }
    Write-Ok 'XXL-JOB 初始化数据已确认：管理员 1、执行器组 1、业务任务 0'
}

try {
    if (-not (Test-Path -LiteralPath (Join-Path $script:repoRoot 'sanye_server'))) {
        throw "未找到项目根目录：$script:repoRoot"
    }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker 引擎不可用。'
    }

    $script:postgresUser = Get-Setting 'POSTGRES_USER' 'sanye'
    $script:postgresPassword = Get-Setting 'POSTGRES_PASSWORD' '123456'
    $script:postgresDb = Get-Setting 'POSTGRES_DB' 'sanye_anime'
    $script:adminDb = Get-Setting 'SANYE_ADMIN_DATASOURCE_DB' 'sanye_admin'
    $script:redisUser = Get-Setting 'REDIS_USERNAME' 'sanye'
    $script:redisPassword = Get-Setting 'REDIS_PASSWORD' '123456'
    $script:rabbitUser = Get-Setting 'RABBITMQ_USER' 'sanye'
    $script:rabbitPassword = Get-Setting 'RABBITMQ_PASSWORD' '123456'
    $script:minioUser = Get-Setting 'MINIO_USER' 'sanye'
    $script:minioPassword = Get-Setting 'MINIO_PASSWORD' '12345678'
    $script:xxlUser = Get-Setting 'XXL_JOB_MYSQL_USER' 'sanye'
    $script:xxlPassword = Get-Setting 'XXL_JOB_MYSQL_PASSWORD' '123456'
    $esHost = Get-Setting 'ES_HOST' 'http://localhost:9200'

    Assert-SqlIdentifier $script:postgresUser 'POSTGRES_USER'
    Assert-SqlIdentifier $script:postgresDb 'POSTGRES_DB'
    Assert-SqlIdentifier $script:adminDb 'SANYE_ADMIN_DATASOURCE_DB'
    Assert-SqlIdentifier $script:redisUser 'REDIS_USERNAME'
    Assert-SqlIdentifier $script:rabbitUser 'RABBITMQ_USER'
    Assert-SqlIdentifier $script:minioUser 'MINIO_USER'
    Assert-SqlIdentifier $script:xxlUser 'XXL_JOB_MYSQL_USER'
    Assert-ContainerRunning -Container 'sanye-postgres'
    if (-not $SkipPostgres -or $Profile -eq 'full') {
        if (-not $SkipPostgres) {
            Import-ServicePostgresData
            Import-AdminPostgresData
        }
    }
    if (-not $SkipElasticsearch) {
        Assert-ContainerRunning -Container 'sanye-elasticsearch'
        Import-ElasticsearchData -BaseUrl $esHost
    }
    if (-not $SkipRedis) {
        Assert-ContainerRunning -Container 'sanye-redis'
        Import-RedisData
    }
    if (-not $SkipMinio) {
        Assert-ContainerRunning -Container 'sanye-minio'
        Import-MinioData
    }
    if ($Profile -eq 'full' -and -not $SkipNacos) {
        Assert-ContainerRunning -Container 'sanye-nacos'
        Import-NacosData
    }
    if ($Profile -eq 'full' -and -not $SkipRabbitMq) {
        Assert-ContainerRunning -Container 'sanye-rabbitmq'
        Import-RabbitMqData
    }
    if ($Profile -eq 'full' -and -not $SkipXxlJob) {
        Assert-ContainerRunning -Container 'sanye-xxl-job-mysql'
        Import-XxlJobData
    }
    Write-Step '中间件实际数据导入完成'
    Write-Host 'PostgreSQL：业务 schema、管理平台数据库和 Quartz 已导入。'
    Write-Host 'Elasticsearch：sanye_anime 索引已由 PostgreSQL 作品数据构建。'
    Write-Host 'Redis：首页种子缓存已写入，运行时仍可按 TTL 回源刷新。'
    Write-Host 'MinIO：static/covers 封面已上传，文件元数据已同步。'
    Write-Host 'Nacos：共享配置和业务配置已写入，服务实例将在应用启动时动态注册。'
    Write-Host 'RabbitMQ：仅导入项目事件拓扑，当前代码没有真实消费者，因此没有伪造消息。'
    Write-Host 'XXL-JOB：仅确认管理员和执行器组，当前项目没有真实调度任务，任务表保持为空。'
    exit 0
} catch {
    Write-Fail $_.Exception.Message
    exit 2
}
