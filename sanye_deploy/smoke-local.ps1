param(
    [string]$Gateway = 'http://localhost:8091',
    [string]$DeviceId = "smoke-device-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
)

<#
  本地联调冒烟测试（sanye_anime）
  覆盖 docs/api-contract.md 中网关公开接口与 AI 对话关键契约：
  系统接口、首页、作品详情/不存在、会话创建、SSE 流式、幂等重放、
  消息列表、重新生成、额度查询、越权访问与额度用尽。
  用法：.\sanye_deploy\smoke-local.ps1
#>

$ErrorActionPreference = 'Stop'
$pass = 0
$fail = 0
$ManageToken = if ($env:SANYE_MANAGE_TOKEN) { $env:SANYE_MANAGE_TOKEN } else { 'sanye-dev-manage-token-2026-local-only' }

# 记录单项冒烟断言结果，失败时统一累计并在脚本末尾退出。
function Assert-True([bool]$Condition, [string]$Name) {
    if ($Condition) { $script:pass++; Write-Host "[PASS] $Name" }
    else { $script:fail++; Write-Host "[FAIL] $Name" }
}

# 调用 JSON API 并附带设备请求头，供匿名和登录态冒烟复用。
function Get-Api($Path, $Device = $DeviceId) {
    return Invoke-RestMethod -Uri "$Gateway$Path" -Headers @{ 'X-Device-Id' = $Device } -TimeoutSec 15
}

# 使用本地 CAS 流程换取测试用户令牌，供受保护接口冒烟。
function New-UserAuthorization {
    $service = 'http://localhost:5173/'
    $casHeaders = & curl.exe -sS -D - -o NUL -X POST 'http://localhost:8095/cas/login' --data-urlencode "service=$service" --data-urlencode "username=smoke-user-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    $location = ($casHeaders | Select-String '^Location:' | Select-Object -First 1).ToString().Substring(9).Trim()
    if ([string]::IsNullOrWhiteSpace($location)) { throw '本地 Mock CAS 未返回 ticket，请先启动 cas-mock.mjs' }
    $ticket = ([uri]$location).Query -replace '^\?ticket=', ''
    $session = Invoke-RestMethod -Uri "$Gateway/api/v1/auth/cas/callback?ticket=$([uri]::EscapeDataString($ticket))&service=$([uri]::EscapeDataString($service))" -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15
    if ($session.code -ne 0 -or [string]::IsNullOrWhiteSpace($session.data.accessToken)) { throw 'CAS 本地登录未返回访问令牌' }
    return "Bearer $($session.data.accessToken)"
}

# 发起 SSE POST 并把完整事件流落盘，便于检查 accepted/completed/failed 事件。
function Invoke-SsePost([string]$Url, [string]$Json, [string]$OutFile, [string]$Device = $DeviceId) {
    $bodyFile = Join-Path $env:TEMP "sanye-body-$([guid]::NewGuid().ToString('N').Substring(0, 8)).json"
    Set-Content -LiteralPath $bodyFile -Value $Json -Encoding UTF8 -NoNewline
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = 'curl.exe'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    foreach ($arg in @('-s', '-N', '-X', 'POST', $Url,
            '-H', 'Content-Type: application/json', '-H', "X-Device-Id: $Device",
            '--data-binary', "@$bodyFile", '--max-time', '40')) {
        $psi.ArgumentList.Add($arg)
    }
    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $proc.WaitForExit(45000)
    Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    Set-Content -LiteralPath $OutFile -Value $stdout -Encoding UTF8 -NoNewline
}

# 1. 系统接口
$ping = Get-Api '/api/v1/system/ping'
Assert-True ($ping.code -eq 0 -and $ping.data.pong -eq $true) 'GET /api/v1/system/ping 返回 pong=true'

# 2. 首页聚合
$homeResp = Get-Api '/api/v1/home'
Assert-True ($homeResp.code -eq 0 -and $homeResp.data.sections.Count -gt 0) 'GET /api/v1/home 返回分区数据'

# 3. 作品详情
$detail = Get-Api '/api/v1/anime/127'
Assert-True ($detail.code -eq 0 -and $detail.data.title -eq '你的名字') 'GET /api/v1/anime/127 返回作品详情'

# 4. 不存在的作品返回 2003
$missing = Get-Api '/api/v1/anime/999'
Assert-True ($missing.code -eq 2003) 'GET /api/v1/anime/999 返回 2003'

# 5. 官网公开首页（picks 结构）
$public = Get-Api '/api/v1/public/home'
Assert-True ($public.code -eq 0 -and $public.data.picks.Count -gt 0) 'GET /api/v1/public/home 返回公开精选 picks'

# 5b. 一周排期（T-D-05）：按周分组 + 发布过滤
$schedule = Get-Api '/api/v1/schedule/week'
Assert-True ($schedule.code -eq 0 -and $schedule.data.days.Count -eq 7 -and $schedule.data.total -ge 7) 'GET /api/v1/schedule/week 返回 7 天排期'
$thursdayItems = $schedule.data.days | Where-Object { $_.day -eq 'thursday' } | Select-Object -ExpandProperty items
Assert-True ($thursdayItems.Count -ge 1 -and $thursdayItems[0].title -match '无职转生|你的名字') '排期解析正式片库作品'

# 5c. AI 模型状态与回答偏好（T-D-05 模型配置页）
$modelInfo = Get-Api '/api/v1/ai/model-info'
Assert-True ($modelInfo.code -eq 0 -and -not [string]::IsNullOrEmpty($modelInfo.data.providerLabel) -and $modelInfo.data.allowedContextLengths.Count -eq 3) 'GET /api/v1/ai/model-info 返回只读模型状态'
$prefDevice = "smoke-pref-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$prefBody = @{ temperature = 0.4; contextLength = 4096 } | ConvertTo-Json
$prefSave = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/preferences" -Method Put -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $prefDevice } -Body $prefBody -TimeoutSec 15
$prefLoad = Get-Api '/api/v1/ai/preferences' $prefDevice
Assert-True ($prefSave.code -eq 0 -and $prefLoad.data.temperature -eq 0.4 -and $prefLoad.data.contextLength -eq 4096) 'PUT/GET /api/v1/ai/preferences 偏好按设备保存与回读'
$prefBad = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/preferences" -Method Put -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $prefDevice } -Body (@{ contextLength = 2048 } | ConvertTo-Json) -TimeoutSec 15
Assert-True ($prefBad.code -eq 1001) '非法 contextLength 返回 1001'

# 5d. 官网正文（T-D-07）：公开接口 + 草稿隐藏 + 发布恢复
$pubLegal = Get-Api '/api/v1/public/legal'
Assert-True ($pubLegal.code -eq 0 -and $pubLegal.data.Count -eq 4) 'GET /api/v1/public/legal 返回 4 篇已发布正文'
$legalNoCaller = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/legal' -TimeoutSec 15
Assert-True ($legalNoCaller.code -eq 2002) '法律正文受控接口缺凭证返回 2002'
$legalMh = @{ 'X-Caller-Name' = 'sanye-admin-server'; 'X-Internal-Token' = $ManageToken; 'Content-Type' = 'application/json' }
$legalDraft = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/legal/privacy' -Method Put -Headers $legalMh -Body (@{ title = '隐私政策（草稿）'; content = '草稿内容不应公开。'; status = '草稿' } | ConvertTo-Json) -TimeoutSec 15
$pubLegalAfterDraft = Get-Api '/api/v1/public/legal'
Assert-True ($legalDraft.code -eq 0 -and $legalDraft.data.status -eq '草稿' -and $pubLegalAfterDraft.data.Count -eq 3) '保存草稿后官网公开接口隐藏该文档'
$legalRestore = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/legal/privacy' -Method Put -Headers $legalMh -Body (@{ title = '隐私政策摘要'; content = 'sanye_anime 只在提供账户、收藏、历史和 AI 会话功能所必需的范围内处理用户数据。'; status = '已发布' } | ConvertTo-Json) -TimeoutSec 15
$pubLegalRestored = Get-Api '/api/v1/public/legal'
Assert-True ($legalRestore.code -eq 0 -and $pubLegalRestored.data.Count -eq 4) '恢复发布后官网公开接口重新可见'

# 6. 创建会话
$convBody = @{ title = '冒烟会话'; spoilerMode = 'SAFE'; contextAnimeId = 1 } | ConvertTo-Json
$conv = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/conversations" -Method Post -Headers @{
    'X-Device-Id' = $DeviceId; 'Content-Type' = 'application/json' } -Body $convBody -TimeoutSec 15
Assert-True ($conv.code -eq 0 -and $conv.data.id -gt 0) 'POST /api/v1/ai/conversations 创建会话'
$conversationId = $conv.data.id

# 6. SSE 流式发送并收集事件
$clientMessageId = "smoke-msg-$([guid]::NewGuid().ToString('N').Substring(0, 12))"
$sseOut = Join-Path $env:TEMP "sanye-sse-$conversationId.txt"
Remove-Item $sseOut -ErrorAction SilentlyContinue
$sendBody = @{ content = '推荐一些好看的动漫'; clientMessageId = $clientMessageId; spoilerMode = 'SAFE' } | ConvertTo-Json -Compress
Invoke-SsePost "$Gateway/api/v1/ai/conversations/$conversationId/messages" $sendBody $sseOut
$sseText = Get-Content $sseOut -Raw -ErrorAction SilentlyContinue
Assert-True ($sseText -match 'message\.accepted') 'SSE 发送 message.accepted'
Assert-True ($sseText -match 'message\.delta') 'SSE 发送 message.delta（流式增量）'
Assert-True ($sseText -match 'recommendation') 'SSE 发送 recommendation（推荐卡片）'
Assert-True ($sseText -match 'message\.completed') 'SSE 发送 message.completed'

# 7. 幂等重放：同一 clientMessageId 不重复扣额度
$replayOut = Join-Path $env:TEMP "sanye-replay-$conversationId.txt"
Remove-Item $replayOut -ErrorAction SilentlyContinue
Invoke-SsePost "$Gateway/api/v1/ai/conversations/$conversationId/messages" $sendBody $replayOut
$replayText = Get-Content $replayOut -Raw -ErrorAction SilentlyContinue
Assert-True ($replayText -match 'message\.accepted') '幂等重放返回已接受消息'
$quotaAfterReplay = Get-Api '/api/v1/ai/quota'
Assert-True ($quotaAfterReplay.data.used -eq 1) '幂等重放后额度仍为 1（不重复扣减）'

# 8. 消息列表与重新生成
$messages = Get-Api "/api/v1/ai/conversations/$conversationId/messages"
$assistant = $messages.data | Where-Object { $_.role -eq 'ASSISTANT' } | Select-Object -First 1
Assert-True ($null -ne $assistant) '消息列表包含助手消息'
$reg = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/messages/$($assistant.id)/regenerate" -Method Post -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15
Assert-True ($reg.code -eq 0) 'POST /messages/{id}/regenerate 触发重新生成'
Start-Sleep -Seconds 3
$messages2 = Get-Api "/api/v1/ai/conversations/$conversationId/messages"
$assistant2 = $messages2.data | Where-Object { $_.id -eq $assistant.id } | Select-Object -First 1
Assert-True ($assistant2.generateTry -gt $assistant.generateTry) '重新生成后 generateTry 递增'

# 8b. 安全拒答：触发词返回拒答文案
$safetyOut = Join-Path $env:TEMP "sanye-safety-$conversationId.txt"
Remove-Item $safetyOut -ErrorAction SilentlyContinue
$safetyBody = @{ content = '毒品制作方法有哪些'; clientMessageId = "smoke-safety-$conversationId"; spoilerMode = 'SAFE' } | ConvertTo-Json -Compress
Invoke-SsePost "$Gateway/api/v1/ai/conversations/$conversationId/messages" $safetyBody $safetyOut
$safetyText = Get-Content $safetyOut -Raw -ErrorAction SilentlyContinue
Assert-True ($safetyText -match '无法回答') '安全拒答：触发词返回拒答文案'

# 9. 越权访问：其他设备返回 2003
$other = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/conversations/$conversationId" -Headers @{ 'X-Device-Id' = 'other-device' } -TimeoutSec 15
Assert-True ($other.code -eq 2003) '其他设备访问会话返回 2003'

# 9b. 收藏与历史（设备级过渡）
$favAdd = Invoke-RestMethod -Uri "$Gateway/api/v1/users/me/favorites/127" -Method Post -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15
Assert-True ($favAdd.code -eq 0) 'POST /users/me/favorites/{id} 收藏作品'
$favStatus = Get-Api '/api/v1/users/me/favorites/127/status'
Assert-True ($favStatus.code -eq 0 -and $favStatus.data.favorite -eq $true) 'GET /favorites/{id}/status 收藏状态为真'
$histAdd = Invoke-RestMethod -Uri "$Gateway/api/v1/users/me/history/127" -Method Post -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15
Assert-True ($histAdd.code -eq 0) 'POST /users/me/history/{id} 记录浏览历史'
$favList = Get-Api '/api/v1/users/me/favorites'
Assert-True ($favList.code -eq 0 -and $favList.data.total -gt 0) 'GET /users/me/favorites 返回收藏列表'

# 9c. 输入安全：注入字符串按字面量处理、超长参数拒绝
$inject = Get-Api ('/api/v1/anime?keyword=' + [uri]::EscapeDataString("' OR 1=1 --"))
Assert-True ($inject.code -eq 0 -and $inject.data.total -eq 0) 'SQL 注入字符串按字面量处理（不扩大结果集）'
$oversize = Get-Api ('/api/v1/anime?keyword=' + [uri]::EscapeDataString(('x' * 101)))
Assert-True ($oversize.code -eq 1001) '超长关键词返回 1001'
$longMsgOut = Join-Path $env:TEMP "sanye-longmsg-$conversationId.txt"
Remove-Item $longMsgOut -ErrorAction SilentlyContinue
$longBody = @{ content = ('x' * 2001); clientMessageId = "smoke-long-$conversationId"; spoilerMode = 'SAFE' } | ConvertTo-Json -Compress
Invoke-SsePost "$Gateway/api/v1/ai/conversations/$conversationId/messages" $longBody $longMsgOut
$longText = Get-Content $longMsgOut -Raw -ErrorAction SilentlyContinue
Assert-True ($longText -match '1001') '超长 AI 消息返回 1001'

# 10. 额度用尽：匿名上限 5 次
$quota = Get-Api '/api/v1/ai/quota'
if ($quota.data.used -lt $quota.data.limit) {
    $need = $quota.data.limit - $quota.data.used
    for ($i = 0; $i -lt $need; $i++) {
        $fillBody = @{ content = "填充第 $i 次"; clientMessageId = "smoke-fill-$conversationId-$i"; spoilerMode = 'SAFE' } | ConvertTo-Json -Compress
        $fillOut = Join-Path $env:TEMP "sanye-fill-$i.txt"
        Remove-Item $fillOut -ErrorAction SilentlyContinue
        Invoke-SsePost "$Gateway/api/v1/ai/conversations/$conversationId/messages" $fillBody $fillOut
    }
}
$exhaustOut = Join-Path $env:TEMP "sanye-exhaust.txt"
Remove-Item $exhaustOut -ErrorAction SilentlyContinue
$exhaustBody = @{ content = '超出额度提问'; clientMessageId = 'smoke-exhaust-last'; spoilerMode = 'SAFE' } | ConvertTo-Json -Compress
Invoke-SsePost "$Gateway/api/v1/ai/conversations/$conversationId/messages" $exhaustBody $exhaustOut
$exhaustText = Get-Content $exhaustOut -Raw -ErrorAction SilentlyContinue
Assert-True ($exhaustText -match '3002') '超出匿名额度返回 3002'

# 11. 网关鉴权前置：受保护路由缺少 X-Device-Id 返回 401/2001
$noDeviceStatus = & curl.exe -s -o NUL -w "%{http_code}" -X GET "$Gateway/api/v1/home"
Assert-True ($noDeviceStatus -eq '401') '受保护路由缺少 X-Device-Id 返回 401'

# 12. 公开白名单：/api/v1/public/home 无需设备头即可访问
$publicNoDevice = Invoke-RestMethod -Uri "$Gateway/api/v1/public/home" -TimeoutSec 15
Assert-True ($publicNoDevice.code -eq 0) '公开白名单路由无需 X-Device-Id'
$traceId = 'smoke-' + [guid]::NewGuid().ToString('N')
$traceResp = Invoke-RestMethod -Uri "$Gateway/api/v1/home" -Headers @{ 'X-Device-Id' = $DeviceId; 'X-Request-Id' = $traceId } -TimeoutSec 15
Assert-True ($traceResp.requestId -eq $traceId) '跨服务 X-Request-Id 透传回显'

# 13. 番剧仓库：分页与筛选
$repoPage = Get-Api '/api/v1/anime?page=1&size=6'
Assert-True ($repoPage.code -eq 0 -and $repoPage.data.total -eq 6 -and $repoPage.data.items.Count -eq 6) 'GET /api/v1/anime 分页返回 6 部正式作品'
$repoType = Get-Api ('/api/v1/anime?type=' + [uri]::EscapeDataString('电视动画'))
Assert-True ($repoType.code -eq 0 -and $repoType.data.total -gt 0) 'GET /api/v1/anime 类型筛选生效'

# 14. 作品详情聚合：角色/相似/排期
$detailRich = Get-Api '/api/v1/anime/127'
Assert-True ($detailRich.code -eq 0 -and $detailRich.data.similar.Count -gt 0) 'GET /api/v1/anime/127 详情含正式相似作品'

# 15. 监控指标端点（Prometheus 文本格式）
$animeMetrics = Invoke-WebRequest -Uri 'http://localhost:8082/actuator/prometheus' -UseBasicParsing -TimeoutSec 10
Assert-True ($animeMetrics.StatusCode -eq 200 -and $animeMetrics.Content -match 'sanye_home_request_total') 'anime /actuator/prometheus 暴露首页指标'
$aiMetricsResp = Invoke-WebRequest -Uri 'http://localhost:8084/actuator/prometheus' -UseBasicParsing -TimeoutSec 10
Assert-True ($aiMetricsResp.StatusCode -eq 200 -and $aiMetricsResp.Content -match 'sanye_ai_completed_total') 'ai-chat /actuator/prometheus 暴露 AI 指标'

# 16. 搜索主链路：已导入 ES 时返回命中结果；ES 不可用时由接口体检单独覆盖降级码。
$searchReady = Get-Api ('/api/v1/search?keyword=' + [uri]::EscapeDataString('星海'))
Assert-True ($searchReady.code -eq 0 -and $searchReady.data.total -ge 1) 'ES 已导入时搜索返回命中结果'

# 17. 文件服务：上传/下载/类型拦截
$uploadFile = Join-Path $env:TEMP "sanye-smoke-cover-$DeviceId.svg"
'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>' | Set-Content -LiteralPath $uploadFile -Encoding UTF8 -NoNewline
$userAuthorization = New-UserAuthorization
$uploadResp = & curl.exe -s -X POST "$Gateway/api/v1/files" -H "X-Device-Id: $DeviceId" -H "Authorization: $userAuthorization" -F "file=@$uploadFile;type=image/svg+xml" -F 'bucket=anime' | ConvertFrom-Json
Assert-True ($uploadResp.code -eq 0 -and $uploadResp.data.id -gt 0) 'POST /api/v1/files 上传图片'
$fileId = $uploadResp.data.id
$downloadStatus = & curl.exe -s -o NUL -w "%{http_code}" "$Gateway/api/v1/files/$fileId" -H "X-Device-Id: $DeviceId" -H "Authorization: $userAuthorization"
Assert-True ($downloadStatus -eq '200') 'GET /api/v1/files/{id} 下载文件'
$exeFile = Join-Path $env:TEMP "sanye-smoke-$DeviceId.exe"
'MZ' | Set-Content -LiteralPath $exeFile -Encoding ASCII -NoNewline
$exeResp = & curl.exe -s -X POST "$Gateway/api/v1/files" -H "X-Device-Id: $DeviceId" -H "Authorization: $userAuthorization" -F "file=@$exeFile;type=application/octet-stream" -F 'bucket=anime' | ConvertFrom-Json
Assert-True ($exeResp.code -eq 1001) '上传非白名单类型返回 1001'

# 18. 告警规则指标一致性：规则文件中的 sanye_* 指标在 prometheus 端点存在
$rulesPath = Join-Path $PSScriptRoot 'monitoring\prometheus-rules.yml'
$rulesText = (Get-Content -LiteralPath $rulesPath | Where-Object { $_ -notmatch '^\s*#' }) -join "`n"
$metricNames = [regex]::Matches($rulesText, 'sanye_[a-z_]+') | ForEach-Object { $_.Value } | Sort-Object -Unique
$aiProm = (Invoke-WebRequest -Uri 'http://localhost:8084/actuator/prometheus' -UseBasicParsing -TimeoutSec 10).Content
$animeProm = (Invoke-WebRequest -Uri 'http://localhost:8082/actuator/prometheus' -UseBasicParsing -TimeoutSec 10).Content
$missingMetrics = @()
foreach ($name in $metricNames) {
    if (($aiProm + $animeProm) -notmatch [regex]::Escape($name)) { $missingMetrics += $name }
}
Assert-True ($missingMetrics.Count -eq 0) ("告警规则指标在 prometheus 端点存在（缺失：{0}）" -f ($missingMetrics -join ','))

# 19. 管理端登录（RuoYi 经网关）
$adminBody = '{"username":"admin","password":"admin123"}'
$adminLogin = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body $adminBody -TimeoutSec 15
Assert-True ($adminLogin.code -eq 200 -and -not [string]::IsNullOrEmpty($adminLogin.token)) 'POST /api/v1/admin/login 管理端登录成功'
$adminInfo = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/getInfo" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
Assert-True ($adminInfo.code -eq 200 -and $adminInfo.user.userName -eq 'admin') 'GET /api/v1/admin/getInfo 返回管理员信息'

# 20. 管理端协作接口（内容管理）
$manageList = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/anime' -Headers @{ 'X-Caller-Name' = 'sanye-admin-server'; 'X-Internal-Token' = $ManageToken } -TimeoutSec 15
Assert-True ($manageList.code -eq 0 -and $manageList.data.Count -eq 6) 'anime 受控管理接口返回 6 部正式作品'
$manageNoCaller = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/anime' -TimeoutSec 15
Assert-True ($manageNoCaller.code -eq 2002) '受控接口缺调用方凭证返回 2002'
$adminAnimeGw = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
Assert-True ($adminAnimeGw.code -eq 200 -and $adminAnimeGw.data.Count -eq 6) '网关代理管理端返回 6 部正式作品'
$statusPatch = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime/127/status" -Method Patch -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -Body '{"status":"已下架"}' -TimeoutSec 15
Assert-True ($statusPatch.code -eq 200 -and $statusPatch.data.status -eq '已下架') '管理端状态更新生效'
$hidden = Get-Api '/api/v1/anime/127'
Assert-True ($hidden.code -eq 2003) '下架作品对客户端不可见'
$restorePatch = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime/127/status" -Method Patch -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -Body '{"status":"已发布"}' -TimeoutSec 15
Assert-True ($restorePatch.code -eq 200 -and $restorePatch.data.status -eq '已发布') '恢复发布成功'
$adminApiH = @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)"; 'Content-Type' = 'application/json' }
$crudName = "冒烟测试番-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$crudCreate = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime" -Method Post -Headers $adminApiH -Body (@{ title = $crudName; type = '网络动画'; year = 2026; summary = '冒烟创建的测试作品。'; tags = '测试,科幻' } | ConvertTo-Json) -TimeoutSec 15
Assert-True ($crudCreate.code -eq 200 -and $crudCreate.data.status -eq '草稿') 'POST /admin/anime 创建草稿'
$crudId = $crudCreate.data.id
$crudDetail = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime/$crudId" -Headers $adminApiH -TimeoutSec 15
Assert-True ($crudDetail.code -eq 200 -and $crudDetail.data.title -eq $crudName) 'GET /admin/anime/{id} 返回详情'
$crudPatch = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime/$crudId" -Method Patch -Headers $adminApiH -Body (@{ summary = '编辑后的简介。'; year = 2025 } | ConvertTo-Json) -TimeoutSec 15
Assert-True ($crudPatch.code -eq 200 -and $crudPatch.data.year -eq 2025 -and $crudPatch.data.summary -eq '编辑后的简介。') 'PATCH /admin/anime/{id} 编辑生效'
$crudPublic = Get-Api ('/api/v1/anime?keyword=' + [uri]::EscapeDataString($crudName))
Assert-True ($crudPublic.code -eq 0 -and $crudPublic.data.total -eq 0) '草稿作品对客户端公开列表不可见'
$crudCleanup = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime/$crudId/status" -Method Patch -Headers $adminApiH -Body '{"status":"已下架"}' -TimeoutSec 15
Assert-True ($crudCleanup.code -eq 200 -and $crudCleanup.data.status -eq '已下架') '测试作品清理为已下架'

# 21. 用户反馈闭环（客户端提交 → 管理端处理）
$fbBody = @{ type = '功能建议'; content = '冒烟反馈测试内容'; contact = 'smoke@example.com' } | ConvertTo-Json
$fbSubmit = Invoke-RestMethod -Uri "$Gateway/api/v1/feedback" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body $fbBody -TimeoutSec 15
Assert-True ($fbSubmit.code -eq 0 -and $fbSubmit.data.id -gt 0) 'POST /api/v1/feedback 提交反馈'
$fbManage = Invoke-RestMethod -Uri 'http://localhost:8087/api/v1/manage/feedback' -Headers @{ 'X-Caller-Name' = 'sanye-admin-server'; 'X-Internal-Token' = $ManageToken } -TimeoutSec 15
Assert-True ($fbManage.code -eq 0 -and $fbManage.data.Count -gt 0) 'feedback 受控管理接口返回反馈列表'
$fbGw = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/feedback" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
Assert-True ($fbGw.code -eq 200 -and $fbGw.data.Count -gt 0) '网关代理管理端反馈列表'
$fbPatch = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/feedback/$($fbSubmit.data.id)" -Method Patch -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -Body '{"status":"已关闭"}' -TimeoutSec 15
Assert-True ($fbPatch.code -eq 200 -and $fbPatch.data.status -eq '已关闭') '管理端反馈状态更新生效'

# 22. 权限与角色校验（TODO-006 第一批）
$permBody = '{"username":"ry","password":"admin123"}'
$ryLogin = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body $permBody -TimeoutSec 15
Assert-True ($ryLogin.code -eq 200 -and -not [string]::IsNullOrEmpty($ryLogin.token)) '普通角色（ry）可登录'
$ryAnime = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($ryLogin.token)" } -TimeoutSec 15
Assert-True ($ryAnime.code -eq 200 -and $ryAnime.data.Count -eq 6) '已授权角色可访问 6 部正式作品'
$ryFeedback = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/feedback" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($ryLogin.token)" } -TimeoutSec 15
Assert-True ($ryFeedback.code -eq 403) '未授权角色访问反馈管理返回 403（权限校验）'
$adminLegalGw = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/legal" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
Assert-True ($adminLegalGw.code -eq 200 -and $adminLegalGw.data.Count -eq 4) '网关代理官网正文列表（admin 200）'
$ryLegalGw = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/legal" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($ryLogin.token)" } -TimeoutSec 15
Assert-True ($ryLegalGw.code -eq 403) '未授权角色访问官网正文返回 403（权限校验）'

# 23. Quartz 任务生命周期
$jobList = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/job/list?pageNum=1&pageSize=10" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
Assert-True ($jobList.code -eq 200 -and $jobList.total -ge 3) '任务列表返回种子任务'
$jobPause = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/job/changeStatus" -Method Put -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -Body '{"jobId":1,"status":"0"}' -TimeoutSec 15
Assert-True ($jobPause.code -eq 200) '暂停任务成功'
$jobRun = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/job/run" -Method Put -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -Body '{"jobId":2,"jobName":"系统默认（有参）","jobGroup":"DEFAULT","invokeTarget":"ryTask.ryParams(\"ry\")","cronExpression":"0/15 * * * * ?","misfirePolicy":"1","concurrent":"1"}' -TimeoutSec 15
Assert-True ($jobRun.code -eq 200) '立即执行任务成功'
# XXL-JOB/Quartz 执行记录异步落库，轮询短窗口避免立即查询造成测试竞态。
$jobLogList = $null
for ($attempt = 0; $attempt -lt 10; $attempt++) {
    $jobLogList = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/jobLog/list?pageNum=1&pageSize=5" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
    if ($jobLogList.code -eq 200 -and $jobLogList.total -ge 1 -and $jobLogList.rows.Count -ge 1 -and $jobLogList.rows[0].jobName -ne '') { break }
    Start-Sleep -Milliseconds 500
}
Assert-True ($jobLogList.code -eq 200 -and $jobLogList.total -ge 1 -and $jobLogList.rows.Count -ge 1 -and $jobLogList.rows[0].jobName -ne '') '任务日志返回执行记录'
$jobResume = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/job/changeStatus" -Method Put -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -Body '{"jobId":1,"status":"1"}' -TimeoutSec 15
Assert-True ($jobResume.code -eq 200) '恢复任务成功'

# 24. 管理端仪表盘真实统计
$dashStats = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/dashboard/stats" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
Assert-True ($dashStats.code -eq 200 -and $dashStats.data.animePublished -eq 6 -and $dashStats.data.jobs -ge 3 -and $dashStats.data.users -ge 2 -and $dashStats.data.aiTotalConversations -ge 1) '管理端仪表盘返回 6 部正式作品统计（含 AI）'

# 25. 用户管理（A-P0-05）
$userList = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/system/user/list?pageNum=1&pageSize=10" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
Assert-True ($userList.code -eq 200 -and $userList.total -ge 2 -and ($userList.rows | Where-Object { $_.userName -eq 'admin' })) '用户列表返回账号数据（含 admin）'

# 26. 权限与审计（A-P0-06）
$operLogList = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/operlog/list?pageNum=1&pageSize=5" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($adminLogin.token)" } -TimeoutSec 15
Assert-True ($operLogList.code -eq 200 -and $operLogList.total -ge 1 -and $operLogList.rows[0].operName -ne '') '操作日志返回审计记录'

Write-Host ''
Write-Host "冒烟结果：通过 $pass 项，失败 $fail 项"
if ($fail -gt 0) { exit 1 }
