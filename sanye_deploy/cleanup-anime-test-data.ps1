param(
    [ValidateSet('local', 'docker')]
    [string]$Infrastructure = 'local',
    [string]$EsUrl = 'http://localhost:9200'
)

<#
  清理本地开发环境中的演示作品、冒烟作品和 E2E 临时作品。
  正式片库固定保留：你的名字 127，以及无职转生 128/133/135/136/137。
  脚本只清理作品关联数据和搜索索引，不删除用户、反馈、文件或中间件数据卷。
#>

$ErrorActionPreference = 'Stop'
$keepIds = '127,128,133,135,136,137'
$sql = @"
begin;
delete from sanye_anime.sanye_anime_alias where anime_id not in ($keepIds);
delete from sanye_anime.sanye_anime_banner where anime_id not in ($keepIds);
delete from sanye_anime.sanye_anime_episode where anime_id not in ($keepIds);
delete from sanye_anime.sanye_anime_schedule where anime_id not in ($keepIds);
delete from sanye_anime.sanye_anime_tag where anime_id not in ($keepIds);
delete from sanye_favorite.sanye_user_favorite where anime_id not in ($keepIds);
delete from sanye_favorite.sanye_user_watch_history where anime_id not in ($keepIds);
delete from sanye_search.sanye_search_sync_record where anime_id not in ($keepIds);
delete from sanye_ai_chat.sanye_conversation where context_anime_id is not null and context_anime_id not in ($keepIds);
delete from sanye_anime.sanye_anime where id not in ($keepIds);
select setval('sanye_anime.sanye_anime_id_seq', coalesce((select max(id) from sanye_anime.sanye_anime), 1), true);
commit;
"@

if ($Infrastructure -eq 'local') {
    $psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    if (-not (Test-Path -LiteralPath $psql)) {
        throw "未找到 PostgreSQL 客户端：$psql"
    }
    $env:PGPASSWORD = '123456'
    $sql | & $psql -U sanye -h 127.0.0.1 -p 5433 -d sanye_anime -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw '本机 PostgreSQL 清理失败' }
} else {
    $sql | docker exec -i sanye-postgres psql -U sanye -d sanye_anime -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'Docker PostgreSQL 清理失败' }
}

# ES 是独立数据面；删除旧文档后由搜索服务的 reindex 接口重新写入正式片库。
$deleteBody = @{ query = @{ bool = @{ must_not = @{ terms = @{ id = @(127, 128, 133, 135, 136, 137) } } } } } | ConvertTo-Json -Depth 10 -Compress
try {
    Invoke-RestMethod -Uri "$EsUrl/sanye_anime/_delete_by_query?refresh=true" -Method Post -ContentType 'application/json' -Body $deleteBody | Out-Null
    Write-Host '[cleanup] Elasticsearch 旧作品索引已清理'
} catch {
    Write-Warning "Elasticsearch 清理跳过：$($_.Exception.Message)"
}

Write-Host '[cleanup] 已保留作品：127, 128, 133, 135, 136, 137'
