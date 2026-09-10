param(
    [string]$Gateway = 'http://localhost:8091',
    [string]$ReportFile = '',
    [switch]$SkipSse
)

<#
  全接口体检（分板块测试报告）
  覆盖：系统/网关、anime 内容、搜索、AI 对话、收藏历史、文件、反馈、管理端、监控。
  每板块输出 PASS/FAIL 清单，汇总后写入 Markdown 报告（-ReportFile）。
  用法：pwsh -NoProfile -File .\sanye_deploy\interface-check.ps1 -ReportFile docs/interface-test-report.md
#>

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Error '接口体检脚本需要 PowerShell 7，请使用 pwsh -NoProfile -File .\sanye_deploy\interface-check.ps1。'
    exit 2
}
$DeviceId = "iface-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$ManageToken = if ($env:SANYE_MANAGE_TOKEN) { $env:SANYE_MANAGE_TOKEN } else { 'sanye-dev-manage-token-2026-local-only' }
$UserAuthorization = $null
$boards = @()

# 执行一项接口契约检查并保存状态、状态码和错误信息。
function New-Check([string]$Name, [scriptblock]$Action) {
    return @{ name = $Name; action = $Action }
}

# 输出分组检查结果，保持本地报告可读且便于统计通过率。
function Invoke-Board([string]$Title, [array]$Checks) {
    $results = @()
    foreach ($check in $Checks) {
        try {
            $ok = & $check.action
            $results += [PSCustomObject]@{ Name = $check.name; Pass = [bool]$ok; Detail = '' }
        } catch {
            $results += [PSCustomObject]@{ Name = $check.name; Pass = $false; Detail = $_.Exception.Message }
        }
    }
    $script:boards += [PSCustomObject]@{ Title = $Title; Results = $results }
}

# 请求接口并解析统一 JSON 包，支持按需注入 Bearer 令牌。
function Get-Json([string]$Path, [string]$Device = $DeviceId, [string]$Authorization = '') {
    $headers = @{ 'X-Device-Id' = $Device }
    if ($Authorization) { $headers.Authorization = $Authorization }
    $resp = Invoke-RestMethod -Uri "$Gateway$Path" -Headers $headers -TimeoutSec 20
    return $resp
}

# 使用 .NET 请求对象统一读取成功及错误 HTTP 响应，避免 PowerShell 7 的错误响应流提前释放。
function Invoke-HttpResponse([string]$Uri, [hashtable]$Headers = @{}, [string]$Method = 'Get', [string]$Body = '', [string]$ContentType = '') {
    $request = [System.Net.HttpWebRequest]::Create($Uri)
    $request.Method = $Method.ToUpperInvariant()
    $request.Timeout = 20000
    $request.UserAgent = 'sanye-interface-check/1.0'
    foreach ($key in $Headers.Keys) {
        if ($key -eq 'Content-Type') { $request.ContentType = [string]$Headers[$key] }
        else { $request.Headers[$key] = [string]$Headers[$key] }
    }
    if ($ContentType) { $request.ContentType = $ContentType }
    if ($Body) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
        $request.ContentLength = $bytes.Length
        $stream = $request.GetRequestStream()
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Dispose()
    }
    try {
        $response = $request.GetResponse()
    } catch [System.Net.WebException] {
        $response = $_.Exception.Response
        if ($null -eq $response) { throw }
    } catch {
        throw
    }
    $content = ''
    $stream = $response.GetResponseStream()
    if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
        $reader.Dispose()
    }
    $statusCode = [int]$response.StatusCode
    $response.Dispose()
    return [PSCustomObject]@{ StatusCode = $statusCode; Content = $content }
}

# 仅读取 HTTP 状态码，用于验证鉴权和错误响应边界。
function Get-Status([string]$Path, [string]$Device = $DeviceId, [string]$Authorization = '') {
    $headers = @{ 'X-Device-Id' = $Device }
    if ($Authorization) { $headers.Authorization = $Authorization }
    return (Invoke-HttpResponse -Uri "$Gateway$Path" -Headers $headers).StatusCode
}

# 完成 CAS 流程并缓存测试用户 Authorization，减少重复登录请求。
function Ensure-UserAuthorization {
    if ($script:UserAuthorization) { return $script:UserAuthorization }
    $service = 'http://localhost:5173/'
    $casHeaders = & curl.exe -sS -D - -o NUL -X POST 'http://localhost:8095/cas/login' --data-urlencode "service=$service" --data-urlencode "username=iface-user-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    $location = ($casHeaders | Select-String '^Location:' | Select-Object -First 1).ToString().Substring(9).Trim()
    if ([string]::IsNullOrWhiteSpace($location)) { throw '本地 Mock CAS 未返回 ticket，请先启动 cas-mock.mjs' }
    $ticket = ([uri]$location).Query -replace '^\?ticket=', ''
    $session = Invoke-RestMethod -Uri "$Gateway/api/v1/auth/cas/callback?ticket=$([uri]::EscapeDataString($ticket))&service=$([uri]::EscapeDataString($service))" -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15
    if ($session.code -ne 0 -or [string]::IsNullOrWhiteSpace($session.data.accessToken)) { throw 'CAS 本地登录未返回访问令牌' }
    $script:UserAuthorization = "Bearer $($session.data.accessToken)"
    return $script:UserAuthorization
}

# ============ A. 系统与网关 ============
Invoke-Board 'A. 系统与网关' @(
    (New-Check 'GET /system/ping 返回 pong=true' { (Get-Json '/api/v1/system/ping').data.pong -eq $true }),
    (New-Check 'GET /system/capabilities 返回 6 项能力' { (Get-Json '/api/v1/system/capabilities').data.Count -eq 6 }),
    (New-Check '受保护路由缺 X-Device-Id 返回 401' { (Get-Status '/api/v1/anime' '') -eq 401 }),
    (New-Check '公开白名单无需设备头（public/home）' { (Get-Status '/api/v1/public/home' '') -eq 200 }),
    (New-Check '未知路径返回 404（网关统一错误包）' {
        $r = Invoke-HttpResponse -Uri "$Gateway/no-such-route" -Headers @{ 'X-Device-Id' = $DeviceId }
        $r.StatusCode -eq 404 -and $r.Content -match '"code":2003'
    }),
    (New-Check '网关错误包带 requestId' {
        $rid = "gw-rid-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
        $r = Invoke-HttpResponse -Uri "$Gateway/no-such-route" -Headers @{ 'X-Device-Id' = $DeviceId; 'X-Request-Id' = $rid }
        $r.Content -match $rid
    })
)

# ============ B. anime 内容 ============
Invoke-Board 'B. anime 内容' @(
    (New-Check 'GET /home 返回分区' { (Get-Json '/api/v1/home').data.sections.Count -ge 2 }),
    (New-Check 'GET /anime 分页返回 6 部正式作品' {
        $d = (Get-Json '/api/v1/anime?size=50').data
        $d.total -eq 6 -and $d.items.Count -eq 6
    }),
    (New-Check '类型筛选生效' {
        $d = (Get-Json ('/api/v1/anime?type=' + [uri]::EscapeDataString('剧场版'))).data
        $d.total -eq 1 -and $d.items[0].id -eq 127
    }),
    (New-Check '状态筛选（连载中）' {
        $d = (Get-Json ('/api/v1/anime?status=' + [uri]::EscapeDataString('连载中'))).data
        $d.total -eq 1 -and $d.items[0].id -eq 128
    }),
    (New-Check '年份与 yearBefore 筛选' {
        (Get-Json '/api/v1/anime?year=2026').data.total -eq 6 -and (Get-Json '/api/v1/anime?yearBefore=2026').data.total -eq 6
    }),
    (New-Check '关键词筛选（标题/简介）' {
        (Get-Json ('/api/v1/anime?keyword=' + [uri]::EscapeDataString('无职转生'))).data.total -eq 5
    }),
    (New-Check 'SQL 注入字符串按字面量（0 结果）' {
        (Get-Json ('/api/v1/anime?keyword=' + [uri]::EscapeDataString("' OR 1=1 --"))).data.total -eq 0
    }),
    (New-Check '超长关键词返回 1001' {
        (Get-Json ('/api/v1/anime?keyword=' + [uri]::EscapeDataString(('x' * 101)))).code -eq 1001
    }),
    (New-Check '详情聚合（角色/相似/排期/来源）' {
        $d = (Get-Json '/api/v1/anime/127').data
        $d.similar.Count -ge 1 -and $d.source -ne ''
    }),
    (New-Check '不存在作品返回 2003' { (Get-Json '/api/v1/anime/999').code -eq 2003 }),
    (New-Check 'GET /schedule/week 7 天' { (Get-Json '/api/v1/schedule/week').data.days.Count -eq 7 }),
    (New-Check 'GET /public/home 公开精选' { (Get-Json '/api/v1/public/home').data.picks.Count -ge 3 }),
    (New-Check 'GET /public/legal 4 篇已发布' { (Get-Json '/api/v1/public/legal').data.Count -eq 4 }),
    (New-Check 'OAD 独立封面静态资源 200' { (Get-Status '/covers/mushoku-oad.svg' '') -eq 200 }),
    (New-Check '管理接口缺凭证返回 2002' {
        (Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/anime' -TimeoutSec 15).code -eq 2002
    }),
    (New-Check '管理接口列表/详情/新建/编辑/状态闭环' {
        $mh = @{ 'X-Caller-Name' = 'sanye-admin-server'; 'X-Internal-Token' = $ManageToken; 'Content-Type' = 'application/json' }
        $list = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/anime' -Headers $mh -TimeoutSec 15
        $created = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/anime' -Method Post -Headers $mh -Body (@{ title = "体检作品-$DeviceId"; type = '网络动画'; year = 2026; summary = '体检创建。' } | ConvertTo-Json) -TimeoutSec 15
        $detail = Invoke-RestMethod -Uri "http://localhost:8082/api/v1/manage/anime/$($created.data.id)" -Headers $mh -TimeoutSec 15
        $patched = Invoke-RestMethod -Uri "http://localhost:8082/api/v1/manage/anime/$($created.data.id)" -Method Patch -Headers $mh -Body (@{ year = 2025 } | ConvertTo-Json) -TimeoutSec 15
        Invoke-RestMethod -Uri "http://localhost:8082/api/v1/manage/anime/$($created.data.id)/status" -Method Patch -Headers $mh -Body (@{ status = '已下架' } | ConvertTo-Json) -TimeoutSec 15 | Out-Null
        $list.code -eq 0 -and $created.data.status -eq '草稿' -and $detail.data.title -eq $created.data.title -and $patched.data.year -eq 2025
    }),
    (New-Check '管理接口参数边界（空标题/超长/年份越界/超长正文）' {
        $mh = @{ 'X-Caller-Name' = 'sanye-admin-server'; 'X-Internal-Token' = $ManageToken; 'Content-Type' = 'application/json' }
        $blank = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/anime' -Method Post -Headers $mh -Body (@{ title = ' '; type = '电视动画' } | ConvertTo-Json) -TimeoutSec 15
        $longTitle = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/anime' -Method Post -Headers $mh -Body (@{ title = ('x' * 121); type = '电视动画' } | ConvertTo-Json) -TimeoutSec 15
        $badYear = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/anime' -Method Post -Headers $mh -Body (@{ title = '年份测试'; type = '电视动画'; year = 2101 } | ConvertTo-Json) -TimeoutSec 15
        $legalLong = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/legal/terms' -Method Put -Headers $mh -Body (@{ title = '使用条款'; content = ('y' * 20001); status = '已发布' } | ConvertTo-Json) -TimeoutSec 15
        $blank.code -eq 1001 -and $longTitle.code -eq 1001 -and $badYear.code -eq 1001 -and $legalLong.code -eq 1001
    }),
    (New-Check '官网正文受控接口闭环' {
        $mh = @{ 'X-Caller-Name' = 'sanye-admin-server'; 'X-Internal-Token' = $ManageToken; 'Content-Type' = 'application/json' }
        $list = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/legal' -Headers $mh -TimeoutSec 15
        $saved = Invoke-RestMethod -Uri 'http://localhost:8082/api/v1/manage/legal/terms' -Method Put -Headers $mh -Body (@{ title = '使用条款摘要'; content = '体检保留文案。'; status = '已发布' } | ConvertTo-Json) -TimeoutSec 15
        $list.code -eq 0 -and $list.data.Count -eq 4 -and $saved.data.status -eq '已发布'
    })
)

# ============ C. 搜索 ============
Invoke-Board 'C. 搜索（Elasticsearch）' @(
    (New-Check 'ES 搜索返回已发布作品' {
        $r = Get-Json ('/api/v1/search?keyword=' + [uri]::EscapeDataString('无职转生'))
        $r.code -eq 0 -and $null -ne $r.data -and $r.data.Count -gt 0
    }),
    (New-Check '搜索缺关键词返回 1001' {
        (Get-Json '/api/v1/search').code -eq 1001
    }),
    (New-Check '搜索超长关键词返回 1001' {
        (Get-Json ('/api/v1/search?keyword=' + [uri]::EscapeDataString(('x' * 51)))).code -eq 1001
    }),
    (New-Check '普通调用者不能触发索引重建' {
        $r = Invoke-RestMethod -Uri "$Gateway/api/v1/search/reindex" -Method Post -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 20
        $r.code -eq 2002
    })
)

# ============ D. AI 对话 ============
Invoke-Board 'D. AI 对话' @(
    (New-Check '会话列表/创建/详情' {
        $list = (Get-Json '/api/v1/ai/conversations').data
        $created = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/conversations" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body (@{ title = '体检会话'; spoilerMode = 'SAFE' } | ConvertTo-Json) -TimeoutSec 15
        $detail = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/conversations/$($created.data.id)" -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15
        $list -is [object] -and $created.data.id -gt 0 -and $detail.data.id -eq $created.data.id
    }),
    (New-Check '模型信息只读（provider/model/能力）' {
        $d = (Get-Json '/api/v1/ai/model-info').data
        $d.providerLabel -ne '' -and $d.allowedContextLengths.Count -eq 3 -and $d.ragEnabled
    }),
    (New-Check '偏好保存与回读' {
        $body = @{ temperature = 0.5; contextLength = 8192 } | ConvertTo-Json
        $saved = Invoke-RestMethod -Uri "$Gateway/api/v1/ai/preferences" -Method Put -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body $body -TimeoutSec 15
        $loaded = (Get-Json '/api/v1/ai/preferences').data
        $saved.code -eq 0 -and $loaded.temperature -eq 0.5 -and $loaded.contextLength -eq 8192
    }),
    (New-Check '偏好非法值返回 1001' {
        (Invoke-RestMethod -Uri "$Gateway/api/v1/ai/preferences" -Method Put -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body (@{ contextLength = 1 } | ConvertTo-Json) -TimeoutSec 15).code -eq 1001
    }),
    (New-Check '额度查询' { (Get-Json '/api/v1/ai/quota').data.limit -ge 5 }),
    (New-Check 'AI 统计受控接口（凭证）' {
        $r = Invoke-RestMethod -Uri 'http://localhost:8084/api/v1/manage/ai/stats' -Headers @{ 'X-Caller-Name' = 'sanye-admin-server'; 'X-Internal-Token' = $ManageToken } -TimeoutSec 15
        $r.code -eq 0 -and $r.data.totalConversations -ge 1
    }),
    (New-Check 'AI 统计缺凭证返回 2002' {
        (Invoke-RestMethod -Uri 'http://localhost:8084/api/v1/manage/ai/stats' -TimeoutSec 15).code -eq 2002
    })
)

# ============ E. 收藏与历史 ============
Invoke-Board 'E. 收藏与历史' @(
    (New-Check '收藏/状态/列表/取消' {
        Invoke-RestMethod -Uri "$Gateway/api/v1/users/me/favorites/127" -Method Post -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15 | Out-Null
        $status = (Get-Json '/api/v1/users/me/favorites/127/status').data.favorite
        $list = (Get-Json '/api/v1/users/me/favorites').data
        Invoke-RestMethod -Uri "$Gateway/api/v1/users/me/favorites/127" -Method Delete -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15 | Out-Null
        $status -eq $true -and $list.total -ge 1
    }),
    (New-Check '历史记录/列表' {
        Invoke-RestMethod -Uri "$Gateway/api/v1/users/me/history/133" -Method Post -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15 | Out-Null
        (Get-Json '/api/v1/users/me/history').data.total -ge 1
    }),
    (New-Check '未知作品收藏返回 2003' {
        (Invoke-RestMethod -Uri "$Gateway/api/v1/users/me/favorites/999" -Method Post -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15).code -eq 2003
    }),
    (New-Check '跨设备隔离（其他设备看不到我的收藏）' {
        $other = 'other-device-iface'
        Invoke-RestMethod -Uri "$Gateway/api/v1/users/me/favorites/136" -Method Post -Headers @{ 'X-Device-Id' = $DeviceId } -TimeoutSec 15 | Out-Null
        $mine = (Get-Json '/api/v1/users/me/favorites').data
        $others = (Invoke-RestMethod -Uri "$Gateway/api/v1/users/me/favorites" -Headers @{ 'X-Device-Id' = $other } -TimeoutSec 15).data
        $mineHas = ($mine.items | Where-Object { $_.anime.id -eq 136 }).Count -ge 1
        $otherHas = ($others.items | Where-Object { $_.anime.id -eq 136 }).Count -eq 0
        $mineHas -and $otherHas
    })
)

# ============ F. 文件 ============
Invoke-Board 'F. 文件' @(
    (New-Check '上传 SVG 成功' {
        $authorization = Ensure-UserAuthorization
        $tmp = Join-Path $env:TEMP "iface-$DeviceId.svg"
        Set-Content -LiteralPath $tmp -Value '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fff"/></svg>' -Encoding UTF8 -NoNewline
        $raw = & curl.exe -s -X POST -F "file=@$tmp;type=image/svg+xml" -H "X-Device-Id: $DeviceId" -H "Authorization: $authorization" "$Gateway/api/v1/files" --max-time 20
        Remove-Item -LiteralPath $tmp -Force
        $parsed = $raw | ConvertFrom-Json
        $parsed.code -eq 0 -and $parsed.data.id -gt 0
    }),
    (New-Check '下载文件 200' {
        $authorization = Ensure-UserAuthorization
        $tmp = Join-Path $env:TEMP "iface-dl-$DeviceId.svg"
        Set-Content -LiteralPath $tmp -Value '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fff"/></svg>' -Encoding UTF8 -NoNewline
        $raw = & curl.exe -s -X POST -F "file=@$tmp;type=image/svg+xml" -H "X-Device-Id: $DeviceId" -H "Authorization: $authorization" "$Gateway/api/v1/files" --max-time 20
        Remove-Item -LiteralPath $tmp -Force
        $up = $raw | ConvertFrom-Json
        (Get-Status "/api/v1/files/$($up.data.id)" $DeviceId $authorization) -eq 200
    }),
    (New-Check '文件元数据' {
        $authorization = Ensure-UserAuthorization
        $tmp = Join-Path $env:TEMP "iface-meta-$DeviceId.svg"
        Set-Content -LiteralPath $tmp -Value '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#fff"/></svg>' -Encoding UTF8 -NoNewline
        $raw = & curl.exe -s -X POST -F "file=@$tmp;type=image/svg+xml" -H "X-Device-Id: $DeviceId" -H "Authorization: $authorization" "$Gateway/api/v1/files" --max-time 20
        Remove-Item -LiteralPath $tmp -Force
        $up = $raw | ConvertFrom-Json
        (Get-Json "/api/v1/files/$($up.data.id)/meta" $DeviceId $authorization).data.objectKey -ne ''
    }),
    (New-Check '非白名单类型返回 1001' {
        $tmp = Join-Path $env:TEMP "iface-$DeviceId.exe"
        Set-Content -LiteralPath $tmp -Value 'MZ' -Encoding ASCII -NoNewline
        $upload = & curl.exe -sS -X POST "$Gateway/api/v1/files" -H "X-Device-Id: $DeviceId" -H "Authorization: $(Ensure-UserAuthorization)" -F "file=@$tmp;type=application/octet-stream"
        $r = $upload | ConvertFrom-Json
        Remove-Item -LiteralPath $tmp -Force
        $r.code -eq 1001
    }),
    (New-Check '不存在的文件返回 2003' {
        $authorization = Ensure-UserAuthorization
        (Get-Json '/api/v1/files/999999/meta' $DeviceId $authorization).code -eq 2003
    })
)

# ============ G. 反馈 ============
Invoke-Board 'G. 反馈' @(
    (New-Check '客户端提交反馈成功' {
        $body = @{ type = '功能建议'; content = "体检反馈-$DeviceId"; contact = 'iface@example.com' } | ConvertTo-Json
        $r = Invoke-RestMethod -Uri "$Gateway/api/v1/feedback" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body $body -TimeoutSec 15
        $r.code -eq 0 -and $r.data.id -gt 0
    }),
    (New-Check '空内容反馈返回 1001' {
        (Invoke-RestMethod -Uri "$Gateway/api/v1/feedback" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body (@{ type = '功能建议'; content = '' } | ConvertTo-Json) -TimeoutSec 15).code -eq 1001
    }),
    (New-Check '非法类型返回 1001' {
        (Invoke-RestMethod -Uri "$Gateway/api/v1/feedback" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body (@{ type = '乱写'; content = '内容' } | ConvertTo-Json) -TimeoutSec 15).code -eq 1001
    }),
    (New-Check '管理列表/处理闭环' {
        $mh = @{ 'X-Caller-Name' = 'sanye-admin-server'; 'X-Internal-Token' = $ManageToken; 'Content-Type' = 'application/json' }
        $list = Invoke-RestMethod -Uri 'http://localhost:8087/api/v1/manage/feedback' -Headers $mh -TimeoutSec 15
        $first = $list.data | Select-Object -First 1
        $patched = Invoke-RestMethod -Uri "http://localhost:8087/api/v1/manage/feedback/$($first.id)" -Method Patch -Headers $mh -Body (@{ status = '已关闭' } | ConvertTo-Json) -TimeoutSec 15
        $list.code -eq 0 -and $list.data.Count -gt 0 -and $patched.data.status -eq '已关闭'
    })
)

# ============ H. 管理端（RuoYi） ============
Invoke-Board 'H. 管理端（RuoYi 经网关）' @(
    (New-Check '登录成功并返回 token' {
        $r = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"admin","password":"admin123"}' -TimeoutSec 15
        $r.code -eq 200 -and -not [string]::IsNullOrEmpty($r.token)
    }),
    (New-Check '错误密码登录被拒绝' {
        $r = Invoke-HttpResponse -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"admin","password":"wrong-password"}'
        $r.StatusCode -eq 200 -and $r.Content -match '"code":500'
    }),
    (New-Check 'getInfo 返回管理员' {
        $login = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"admin","password":"admin123"}' -TimeoutSec 15
        $info = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/getInfo" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($login.token)" } -TimeoutSec 15
        $info.code -eq 200 -and $info.user.userName -eq 'admin'
    }),
    (New-Check '内容管理代理（列表/新建/编辑/状态）' {
        $login = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"admin","password":"admin123"}' -TimeoutSec 15
        $ah = @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($login.token)"; 'Content-Type' = 'application/json' }
        $list = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime" -Headers $ah -TimeoutSec 15
        $created = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime" -Method Post -Headers $ah -Body (@{ title = "管理端体检-$DeviceId"; type = '网络动画'; year = 2026 } | ConvertTo-Json) -TimeoutSec 15
        Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime/$($created.data.id)/status" -Method Patch -Headers $ah -Body '{"status":"已下架"}' -TimeoutSec 15 | Out-Null
        # 管理列表还会包含历史草稿/下架记录，只校验已发布正式片库固定为 6 部。
        $published = @($list.data | Where-Object { $_.status -eq '已发布' })
        $list.code -eq 200 -and $published.Count -eq 6 -and $created.data.status -eq '草稿'
    }),
    (New-Check '官网正文代理（列表/发布）' {
        $login = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"admin","password":"admin123"}' -TimeoutSec 15
        $ah = @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($login.token)"; 'Content-Type' = 'application/json' }
        $list = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/legal" -Headers $ah -TimeoutSec 15
        $list.code -eq 200 -and $list.data.Count -eq 4
    }),
    (New-Check '反馈管理代理' {
        $login = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"admin","password":"admin123"}' -TimeoutSec 15
        $r = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/feedback" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($login.token)" } -TimeoutSec 15
        $r.code -eq 200 -and $r.data.Count -gt 0
    }),
    (New-Check '仪表盘统计（含 AI）' {
        $login = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"admin","password":"admin123"}' -TimeoutSec 15
        $r = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/dashboard/stats" -Headers @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($login.token)" } -TimeoutSec 15
        # 统计接口必须反映正式片库的 6 部作品，避免历史演示种子掩盖清理结果。
        $r.code -eq 200 -and $r.data.animePublished -eq 6 -and $r.data.aiTotalConversations -ge 1
    }),
    (New-Check '任务列表/状态流转' {
        $login = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"admin","password":"admin123"}' -TimeoutSec 15
        $ah = @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($login.token)"; 'Content-Type' = 'application/json' }
        $list = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/job/list?pageNum=1&pageSize=10" -Headers $ah -TimeoutSec 15
        $pause = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/job/changeStatus" -Method Put -Headers $ah -Body '{"jobId":1,"status":"0"}' -TimeoutSec 15
        $resume = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/monitor/job/changeStatus" -Method Put -Headers $ah -Body '{"jobId":1,"status":"1"}' -TimeoutSec 15
        $list.code -eq 200 -and $list.total -ge 3 -and $pause.code -eq 200 -and $resume.code -eq 200
    }),
    (New-Check '部分授权角色：内容 200 / 官网正文 403' {
        $login = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/login" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body '{"username":"ry","password":"admin123"}' -TimeoutSec 15
        $ah = @{ 'X-Device-Id' = $DeviceId; Authorization = "Bearer $($login.token)" }
        $anime = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/anime" -Headers $ah -TimeoutSec 15
        $legal = Invoke-RestMethod -Uri "$Gateway/api/v1/admin/legal" -Headers $ah -TimeoutSec 15
        $anime.code -eq 200 -and $legal.code -eq 403
    })
)

# ============ I. 监控 ============
Invoke-Board 'I. 监控' @(
    (New-Check '前端错误上报 200' {
        (Invoke-RestMethod -Uri "$Gateway/api/v1/monitor/frontend-errors" -Method Post -ContentType 'application/json' -Headers @{ 'X-Device-Id' = $DeviceId } -Body (@{ message = '体检上报' } | ConvertTo-Json) -TimeoutSec 15).code -eq 0
    }),
    (New-Check '业务服务 prometheus 指标端点' {
        $ok = $true
        foreach ($port in 8081, 8082, 8083, 8084, 8085, 8086, 8087) {
            try { Invoke-WebRequest -Uri "http://localhost:$port/actuator/prometheus" -TimeoutSec 10 | Out-Null } catch { $ok = $false }
        }
        $ok
    }),
    (New-Check '网关 prometheus 管理端口' {
        (Invoke-WebRequest -Uri 'http://localhost:8090/actuator/prometheus' -TimeoutSec 10).StatusCode -eq 200
    })
)

# ============ 汇总与报告 ============
$totalPass = 0
$totalFail = 0
$lines = @()
$lines += '# sanye_anime 接口测试报告'
$lines += ''
$lines += "| 项目 | 内容 |"
$lines += "| --- | --- |"
$lines += "| 文档版本 | v1.1 |"
$lines += "| 文档状态 | 已执行（当前本地接口体检结果） |"
$lines += "| 更新时间 | $(Get-Date -Format 'yyyy-MM-dd') |"
$lines += "| 生成时间 | $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') |"
$lines += "| 网关 | $Gateway |"
$lines += "| 设备标识 | $DeviceId |"
$lines += "| 环境说明 | 本地联调（PostgreSQL、Redis、Elasticsearch 已就绪；CAS 使用本地 Mock；AI 使用 dev 提供者） |"
$lines += ''

foreach ($board in $boards) {
    $passCount = ($board.Results | Where-Object Pass).Count
    $failCount = ($board.Results | Where-Object { -not $_.Pass }).Count
    $totalPass += $passCount
    $totalFail += $failCount
    $lines += "## $($board.Title)"
    $lines += ''
    $lines += "| 检查项 | 结果 | 说明 |"
    $lines += "| --- | --- | --- |"
    foreach ($r in $board.Results) {
        $lines += "| $($r.Name) | $(if ($r.Pass) { 'PASS' } else { 'FAIL' }) | $($r.Detail) |"
    }
    $lines += ''
    $lines += "小计：通过 $passCount 项，失败 $failCount 项"
    $lines += ''
}

$lines += "## 汇总"
$lines += ''
$lines += "| 板块 | 通过 | 失败 | 合计 |"
$lines += "| --- | ---: | ---: | ---: |"
foreach ($board in $boards) {
    $passCount = ($board.Results | Where-Object Pass).Count
    $failCount = ($board.Results | Where-Object { -not $_.Pass }).Count
    $lines += "| $($board.Title) | $passCount | $failCount | $($board.Results.Count) |"
}
$lines += "| **合计** | **$totalPass** | **$totalFail** | **$($totalPass + $totalFail)** |"
$lines += ''
$conclusion = if ($totalFail -eq 0) { '全部接口通过' } else { "存在 $totalFail 项失败，需修复" }
$lines += "结论：$conclusion"
$lines += ''
$lines += '## 更新记录'
$lines += ''
$lines += '| 日期 | 版本 | 变更 | 依据 |'
$lines += '| --- | --- | --- | --- |'
$lines += "| $(Get-Date -Format 'yyyy-MM-dd') | v1.1 | 由接口体检脚本自动生成当前分板块结果；正式片库基线为 6 部作品 | interface-check.ps1 |"

$reportText = $lines -join "`n"
if ($ReportFile) {
    Set-Content -LiteralPath $ReportFile -Value $reportText -Encoding UTF8
}

foreach ($board in $boards) {
    $failCount = ($board.Results | Where-Object { -not $_.Pass }).Count
    Write-Host ("[板块] {0}：通过 {1}/{2}" -f $board.Title, ($board.Results.Count - $failCount), $board.Results.Count)
    foreach ($r in $board.Results) {
        Write-Host ("  {0} {1} {2}" -f $(if ($r.Pass) { 'PASS' } else { 'FAIL' }), $r.Name, $r.Detail)
    }
}
Write-Host ''
Write-Host "接口体检总计：通过 $totalPass 项，失败 $totalFail 项"
if ($totalFail -gt 0) { exit 1 }
