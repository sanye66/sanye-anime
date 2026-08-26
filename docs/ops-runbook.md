# sanye_anime 故障处理手册

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.9 |
| 文档状态 | 第一批（T-G-03 第二批），覆盖当前已落地能力 |
| 适用范围 | 本地联调与后续测试/发布环境的 P0/P1 故障 |
| 关联文档 | [监控方案](./monitoring-design.md)、[开发待办](./development-todo.md) |
| 更新时间 | 2026-08-24 |

## 1. 使用方式

发生故障时按以下顺序处理：

1. **确认现象**：页面报错、接口超时、指标告警、日志异常。
2. **定位**：用本文第 4 节的命令与请求 ID 快速缩小范围。
3. **处理**：按第 5 节对应故障的处理步骤执行；不确定时先恢复可用（重启/降级/回滚），再根因分析。
4. **验证**：按第 6 节验证链路恢复。
5. **记录**：在 `docs/gap-register.md` 或发布证据中登记问题、处理与预防措施。

## 2. 服务与端口

| 服务 | 端口 | 职责 | 关键降级行为 |
| --- | --- | --- | --- |
| sanye-server-gateway | 8091（本机联调）/8080（容器内部） | 路由、鉴权前置、CORS | 业务路由要求 X-Device-Id，公开白名单放行 |
| sanye-server-auth | 8081 | 系统接口、前端错误上报 | 无 |
| sanye-server-anime | 8082 | 作品/首页/详情/官网公开接口 | 首页缓存 Redis 不可用时直接回源 |
| sanye-server-search | 8083 | ES 搜索/索引 | ES 不可用返回 4002，前端降级本地 |
| sanye-server-ai-chat | 8084 | AI 会话/SSE/额度/RAG | Redis 额度降级内存；ES RAG 空检索不阻塞 |
| sanye-server-favorite | 8085 | 收藏/历史 | 无 |
| sanye-server-file | 8086 | 文件上传/下载 | 无 |

本地启动：`pwsh -File .\sanye_deploy\run-local.ps1 -Infrastructure docker -Services gateway,auth,anime,search,ai-chat,favorite,file -Restart`
本地 PowerShell 脚本使用 PowerShell 7：`pwsh -File .\sanye_deploy\run-local.ps1 ...`
冒烟验证：`pwsh -File .\sanye_deploy\smoke-local.ps1`

## 3. 日志与请求 ID 定位

- 日志目录：`sanye_deploy/.local/logs/<服务>.log`（启动时 `-Restart` 覆盖）。
- 日志行格式：`时间 级别 [线程] [requestId] 类名 - 消息`；requestId 由网关注入并在 Feign 调用间透传（前端→网关→服务→下游）。
- 定位一条完整链路：把页面/接口返回的 `X-Request-Id` 或响应体 `requestId` 作为关键词，分别在各服务日志中搜索。
- 常见日志关键词：
  - `ERROR` / `WARN`：异常与降级提示
  - `Flyway`：数据库迁移
  - `RAG 检索命中` / `推荐回源`：AI 检索与推荐链路
  - `额度` / `quota`：额度相关

## 4. 监控与告警

### 4.1 指标端点

每个服务暴露 `/actuator/prometheus`（Prometheus 文本格式），可直接 `curl http://localhost:<端口>/actuator/prometheus` 查看。
- 业务服务：anime 8082、ai-chat 8084 等。
- 网关：`http://localhost:8090/actuator/prometheus`（独立管理端口，T-G-06；网关请求指标含 status=503 计数）。

Prometheus 抓取与告警规则（配置即代码）：

- 抓取配置：[`sanye_deploy/monitoring/prometheus.yml`](../sanye_deploy/monitoring/prometheus.yml)
- 告警规则：[`sanye_deploy/monitoring/prometheus-rules.yml`](../sanye_deploy/monitoring/prometheus-rules.yml)

### 4.2 告警阈值表

| 告警 | 指标/表达式 | 阈值 | 严重度 |
| --- | --- | --- | --- |
| 服务不可用 | `up{job=~"sanye-.*"} == 0` | 持续 1 分钟 | critical |
| 连接池等待 | `hikaricp_connections_pending > 0` | 持续 1 分钟 | critical |
| 连接池饱和 | `active/max > 0.8` | 持续 2 分钟 | warning |
| AI 失败率 | `rate(failed)/rate(completed+failed) > 0.1` | 持续 5 分钟 | critical |
| AI 首字慢 | `histogram_quantile(0.75, first_token_bucket) > 3` | 持续 5 分钟 | warning |
| 首页错误率 | `rate(error)/rate(request) > 0.05` | 持续 5 分钟 | warning |
| 线程池拒绝 | `increase(rejected_total[5m]) > 0` | 持续 1 分钟 | critical |
| 队列堆积 | `sanye_threadpool_queue_size{pool="ai-gen"} > 50` | 持续 2 分钟 | warning |
| 搜索慢 | 搜索接口 `http_server_requests_seconds` P95 > 0.5s | 持续 5 分钟 | warning |
| JVM 堆高 | 堆 used/max > 0.85 | 持续 5 分钟 | warning |

未实现指标的规则（额度用尽突增、登录失败率、Outbox 滞留等）在规则文件中以注释保留，对应能力接入后启用。

## 5. 故障处理

### 5.1 服务不可用（网关或业务服务）

**症状**：`/actuator/health` 失败；接口 5xx/超时；Prometheus `up == 0`；`SanyeServiceDown` 告警。

**定位**：
```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 8080,8081,8082,8083,8084,8085,8086 }
Get-Content sanye_deploy/.local/logs/<服务>.log -Tail 50
```

**处理**：
1. 查看日志尾部定位启动失败原因（缺环境变量、端口占用、DB 连接失败等）。
2. 端口被占：找到占用进程并处理，或用 `run-local.ps1 -Restart` 重启。
3. 缺环境变量：按 `sanye_server/README.md` 设置 `DB_URL/DB_USERNAME/DB_PASSWORD/NACOS_ENABLED/SENTINEL_ENABLED`。
4. 重启：`.\sanye_deploy\run-local.ps1 -Services gateway,<服务> -Restart`。

**验证**：`/api/v1/system/ping` 返回 `pong=true`；`pwsh -File .\sanye_deploy\smoke-local.ps1` 通过。

### 5.2 数据库连接异常

**症状**：日志出现 `HikariPool` 连接失败、`FATAL: too many clients already`、Flyway 迁移失败；`SanyeHikariPoolPending` 告警。

**定位**：
```powershell
# 查看当前连接数（sanye_anime 库）
C:\Program Files\PostgreSQL\18\bin\psql.exe -U sanye -h 127.0.0.1 -p 5433 -d postgres -c "select count(*) from pg_stat_activity where datname='sanye_anime';"
```

**处理**：
1. **连接数打满**（本机多次出现）：各服务 HikariCP 已调优为 `minimum-idle: 5 / maximum-pool-size: 10`；若仍有问题，降低更多服务 `maximum-pool-size`，或调大 PG `max_connections` 后重启 PG。
2. 密码/主机错误：核对 `DB_USERNAME/DB_PASSWORD/DB_URL`（本地联调 PG 为 127.0.0.1:5433，账号 `sanye`）。
3. PG 未启动：`run-local.ps1` 会自动拉起 5433；单独验证 `pg_ctl status`。
4. 共享内存/子进程崩溃（Windows 本地实例）：日志出现 `could not reserve shared memory region ... error code 487` 或 `terminated by exception 0xC0000142` 时，Hikari 连接会全部挂起、接口 500/503；执行 `pg_ctl -D %LOCALAPPDATA%\sanye_dev_pg\data stop -m fast` 后重新 start，数据保留并自动恢复。

**验证**：服务日志出现 `HikariPool-1 - Start completed`；首页/AI 接口正常。

### 5.3 Redis 不可用

**症状**：AI 额度与首页缓存相关告警；日志 `Redis 额度计数不可用，降级内存计数` 或 `首页缓存读取不可用`。

**定位**：
```powershell
C:\Program Files\Redis\redis-cli.exe -h 127.0.0.1 -p 6379 ping
```

**处理**：
1. Redis 未启动：启动本地 Redis 服务（Windows 服务 `Redis`）或按部署文档拉起。
2. 密码错误：核对 `REDIS_PASSWORD`（本地 Redis 无密码）。
3. 不可恢复时：额度自动降级为进程内内存计数（重启丢失），首页缓存自动回源——业务可继续，但应尽快恢复 Redis。

**验证**：`redis-cli ping` 返回 `PONG`；额度接口返回正常；`sanye_home_cache_hit_total` 恢复增长。

### 5.4 AI 调用异常

**症状**：SSE 收到 `message.failed`；日志 `AI 流式生成失败` / `AI 生成任务异常`；`SanyeAiErrorRateHigh` / `SanyeAiFirstTokenSlow` 告警。

**定位**：
```powershell
Get-Content sanye_deploy/.local/logs/ai-chat.log -Tail 100 | Select-String "AI 流式生成失败|AI 生成任务异常|ERROR"
curl.exe -s http://localhost:8084/actuator/prometheus | Select-String "sanye_ai_(failed|completed)_total"
```

**处理**：
1. 检查模型提供者配置（`AI_PROVIDER` / `AI_API_KEY` / `AI_BASE_URL`）；联调默认 `dev` 本地模拟模型，无需外部密钥。
2. 检查线程池：队列堆积时降低并发或调大 `AI_POOL_*`。
3. 检查额度与 Redis：见 5.3。
4. 生成前失败会自动退还额度（预占与退还逻辑）；确认 `sanye_ai_failed_total` 是否持续增长。

**验证**：AI 工作区发送消息收到 `message.completed`；失败率指标回落。

### 5.5 ES 不可用（搜索/RAG）

**症状**：搜索接口返回 4002；`SearchBootstrap` 日志 `搜索索引初始化失败（搜索降级）`；RAG 检索返回空。

**定位**：
```powershell
try { Invoke-RestMethod -Uri 'http://localhost:9200' -TimeoutSec 5 } catch { "ES 不可达" }
Get-Content sanye_deploy/.local/logs/search.log -Tail 20
```

**处理**：
1. 启动 ES 8.17（Docker Compose `elasticsearch` 服务或本机安装）。
2. ES 恢复后：`POST /api/v1/search/reindex` 重建索引，或等待服务重启自动同步（索引为空时）。
3. 恢复前：搜索页自动降级本地数据，AI 回答不受影响（RAG 空检索）。

**验证**：`GET /api/v1/search?keyword=星海` 返回结果；`sanye_anime` 索引 `_count` 与作品数一致。

### 5.5.1 ES API 与 Kibana 控制台入口

- `http://localhost:9200` 是 Elasticsearch REST API，返回 JSON 属于正常现象，不是可视化页面。
- `full` profile 启动 Kibana 8.17 控制台，访问 `http://localhost:5601`；Nacos Console 使用默认入口 `http://localhost:8080/`。
- MinIO 控制台访问 `http://localhost:9001`，账号 `sanye`，密码 `12345678`；RabbitMQ 管理台访问 `http://localhost:15672`，账号 `sanye`，密码 `123456`；XXL-JOB 管理台访问 `http://localhost:18080/`，账号 `sanye`，密码 `123456`。
- Nacos Console 根路径 `http://localhost:8080/` 和 XXL-JOB 根路径 `http://localhost:18080/` 均应返回 200；Nacos API `8848` 仅用于容器网络内服务。
- 如果 Kibana 未打开，执行 `docker compose -f sanye_deploy/compose.yaml --profile full ps kibana`，确认状态为 `healthy`，再检查 `http://localhost:5601/api/status`。

### 5.5.2 统一配置脚本

Docker 中间件统一使用 [configure-middleware.ps1](../sanye_deploy/configure-middleware.ps1) 配置。脚本会启动 `full` profile，等待 10 个容器健康，然后同步 PostgreSQL 角色和数据库权限、Redis ACL、RabbitMQ 管理员、MinIO root 账号、XXL-JOB MySQL 应用用户和 XXL-JOB 管理台管理员，并验证所有管理入口。默认还会调用 [import-middleware-data.ps1](../sanye_deploy/import-middleware-data.ps1) 导入项目数据。

```powershell
pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\configure-middleware.ps1
```

只启动基础中间件时使用 `-Profile minimal`。已有数据卷改密码时，目标密码通过 `-RedisPassword`、`-XxlJobMysqlRootPassword` 等参数提供；旧 Redis/MySQL root 密码分别通过 `-CurrentRedisPassword`、`-CurrentXxlJobMysqlRootPassword` 提供。脚本只修改账号权限和服务配置，不删除数据卷；完成后应查看脚本输出的 `docker compose ps` 和入口 HTTP 验证结果。

只重新导入项目数据时执行：

```powershell
pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\import-middleware-data.ps1
```

导入脚本会按迁移标记跳过已导入 SQL，验证业务库 6 部正式作品、管理库用户/菜单、ES 文档、Redis 首页键、MinIO 对象和文件元数据、Nacos 配置、RabbitMQ 拓扑以及 XXL-JOB 初始化状态。当前正式片库仅包含《你的名字》和无职转生各独立篇章；没有真实 RabbitMQ 消费者和 XXL-JOB 任务，所以不导入伪造消息或可执行任务；服务注册实例由应用启动时动态产生。仅需账号配置时使用 `configure-middleware.ps1 -SkipDataImport`。

### 5.6 文件存储故障

**症状**：上传返回 5001；日志 `文件写入失败` / `文件读取失败`。

**定位**：
```powershell
Get-ChildItem sanye_deploy/.local/files -Recurse | Measure-Object
```

**处理**：
1. 磁盘空间/权限：确认存储目录（`FILE_STORAGE_DIR`，默认 `sanye_deploy/.local/files`）可写、空间充足。
2. 元数据与文件不一致：删除孤儿元数据或重新上传（文件对象不涉及业务主数据，可安全重建）。
3. 大文件被拒属正常（≤5MB 白名单）。

**验证**：上传 SVG 返回 id；`GET /api/v1/files/{id}` 返回 200。

### 5.7 线程池/队列堆积

**症状**：AI 回答变慢或超时；`SanyeThreadPoolQueueHigh` / `SanyeThreadPoolRejected` 告警。

**处理**：
1. 调大 `AI_POOL_CORE/MAX/QUEUE` 并重启 ai-chat（默认 4/8/64）。
2. 排查模型提供者延迟（真实模型）或并发风暴。
3. 拒绝策略为 CallerRuns（调用方线程兜底执行），通常不会拒绝；若 `rejected_total` 增长说明负载远超容量。

### 5.8 额度异常

**症状**：`3002 额度用尽` 频发；匿名用户无法提问。

**定位**：
```powershell
curl.exe -s http://localhost:8091/api/v1/ai/quota -H "X-Device-Id: <设备>"
C:\Program Files\Redis\redis-cli.exe -h 127.0.0.1 -p 6379 keys "sanye:quota:*"
```

**处理**：
1. 确认是否为正常用尽（匿名每日 5 次）；登录后 30 次。
2. Redis 计数异常时清对应键或等次日重置；确认生成前失败自动退还逻辑未误退。
3. 疑似刷量：观察 `sanye_quota_exhausted_total`（规则待启用）并加强限流。

### 5.9 跨服务故障注入演练（T-G-06）

脚本 [fault-injection.ps1](../sanye_deploy/fault-injection.ps1) 自动完成“停服务 → 验证网关统一错误包 → 验证指标 → 恢复 → 验证自愈”：

```powershell
# 全场景（anime/auth/ai-chat）
.\sanye_deploy\fault-injection.ps1
# 指定场景并把结果写入文件（供自动化捕获）
.\sanye_deploy\fault-injection.ps1 -Scenarios anime,ai-chat -ResultFile C:\temp\fault-result.txt
```

预期行为：
- 上游故障时网关返回 HTTP 503 + `{code:5002, requestId}`（requestId 与请求头一致）。
- 网关 `http://localhost:8090/actuator/prometheus` 出现 `status="503"` 计数。
- 脚本无论断言成败都会恢复服务（try/finally），恢复后接口返回 200。
- 注意：脚本会短暂停掉目标服务，避免在业务高峰期执行。

## 6. 恢复与回滚通用步骤

1. **重启服务**：`.\sanye_deploy\run-local.ps1 -Services <服务> -Restart`。
2. **重建可重建数据**：搜索索引 `POST /api/v1/search/reindex`；AI 记忆与会话存 PG，服务重启不丢。
3. **数据库恢复**：`.\sanye_deploy\backup-local.ps1` 生成备份；恢复按脚本头部说明执行 `pg_restore`。
4. **回滚代码**：任务分支未合并前直接切换分支重建 jar；已发布按 `docs/development-plan.md` 第 15/16 节回滚流程执行。
5. **验证**：每次操作后执行 `pwsh -File .\sanye_deploy\smoke-local.ps1`（当前 77 项）。

## 7. 指标查询示例（PromQL）

- AI 失败率：`rate(sanye_ai_failed_total[5m]) / (rate(sanye_ai_completed_total[5m]) + rate(sanye_ai_failed_total[5m]))`
- AI 首字 P75：`histogram_quantile(0.75, sum(rate(sanye_ai_first_token_seconds_bucket[5m])) by (le))`
- 首页缓存命中率：`rate(sanye_home_cache_hit_total[5m]) / rate(sanye_home_request_total[5m])`
- 线程池队列：`sanye_threadpool_queue_size{pool="ai-gen"}`
- 连接池活跃：`hikaricp_connections_active{pool="HikariPool-1"}`

## 8. 待补充（对应能力接入后）

- CAS 登录失败与账号爆破（`sanye_login_total`）
- RabbitMQ 队列堆积与 Outbox 滞留
- MinIO/对象存储健康
- XXL-JOB 任务失败
- 正式弱网/断网演练与发布回滚演练记录

## 9. 实测演练记录（2026-08-19）

### 9.1 故障注入演练

执行：[fault-injection.ps1](../sanye_deploy/fault-injection.ps1)（`-Scenarios anime,auth,ai-chat`）。

| 场景 | 基线 | 故障期（网关） | requestId 贯穿 | 指标 | 恢复 | 自愈 |
| --- | --- | --- | --- | --- | --- | --- |
| anime 停 | 200 | 503 + code 5002 | 一致 | status=503 计数出现 | 端口就绪 | 200 |
| auth 停 | 200 | 503 + code 5002 | 一致 | status=503 计数出现 | 端口就绪 | 200 |
| ai-chat 停 | 200 | 503 + code 5002 | 一致 | status=503 计数出现 | 端口就绪 | 200 |

结论：21/21 通过；网关统一错误包、requestId 贯穿、prometheus 5xx 计数、自动恢复闭环成立。
演练遗留注意：脚本会短暂停服，避免业务高峰执行；结果文件可用 `-ResultFile` 捕获。

### 9.2 备份与恢复

执行：[backup-local.ps1](../sanye_deploy/backup-local.ps1)。

- 备份：`pg_dump` 自定义格式，时间戳文件，保留最近 N 份；实测生成 dump 约 48KB。
- 恢复步骤（见本手册 §6 与备份脚本注释）：停止写入 → `pg_restore` 到目标库 → 健康检查 → 冒烟。
- 状态：本地备份已验证生成；正式恢复演练待生产环境（登记 gap-register）。

### 9.3 弱网/断网

- 前端兜底已实现：HTTP 超时 10s、SSE 180s、生成 3min；失败回退本地数据/重试。
- 正式弱网演练（注入延迟/断网）待压测环境，归 G 后续任务（gap-register）。

### 9.4 服务启动验证

2026-08-19 全量重启 10 个后端服务（网关 + auth/anime/search/ai-chat/favorite/file/feedback/job + admin-server）：
全部正常启动（日志含 `Started …Application`，无 Flyway/连接错误），健康检查通过。

### 9.5 中间件数据导入验证（2026-08-21）

执行：[import-middleware-data.ps1](../sanye_deploy/import-middleware-data.ps1)。

| 数据面 | 验证结果 |
| --- | --- |
| PostgreSQL | `sanye_anime` 业务库 8 个 schema、15 部作品、4 篇法律正文；`sanye_admin` 2 个用户、92 个菜单、Quartz 表结构 |
| Elasticsearch | `sanye_anime` 索引 15 条作品文档 |
| Redis | 3 个 `sanye:home:home:*` 首页缓存键 |
| MinIO | `sanye-anime/covers/` 21 个对象，`sanye_file` 21 条元数据 |
| Nacos | `COMMON_GROUP` 1 条、`BUSINESS_GROUP` 9 条，共 10 条配置 |
| RabbitMQ | `sanye.events` 交换机、`sanye.events.audit` 队列和绑定存在，消息数 0 |
| XXL-JOB | 管理员 1、执行器组 1、业务任务 0 |

结论：完整导入命令成功，重复执行按迁移标记和对象键幂等覆盖，不删除 Docker 数据卷。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.7 | 增加统一中间件配置脚本的执行、改密和验证流程 | `configure-middleware.ps1`、Compose 状态和连接检查 |
| 2026-08-21 | v0.8 | 增加项目数据导入、重复执行和各中间件数量验证流程 | `import-middleware-data.ps1` 实际导入结果 |
| 2026-08-24 | v0.9 | 将当前导入说明收口为 6 部正式作品，并说明历史验证表保留为历史证据 | V7/V8 迁移、正式作品接口与搜索重建验证 |
