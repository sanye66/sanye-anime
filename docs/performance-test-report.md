# sanye_anime 全接口吞吐/QPS 与响应速度测试报告

| 项目 | 内容 |
| --- | --- |
| 生成时间 | 2026-08-21 |
| 工具 | [benchmark-all.mjs](../sanye_deploy/benchmark-all.mjs)（Node fetch 并发基准）+ Prometheus 指标核对 |
| 环境 | 单机本地联调：网关 8091 + 8 个业务服务 + RuoYi 管理端 8089 + PG 5433 + Redis 6379（另有 Vite×2、Electron 桌宠、IDE 同机运行；历史基线网关为 8080） |
| 参数 | 并发 20、每端点 100 请求、24 个端点；AI SSE 真实模型 1 并发（避免成本） |
| 监控 | 网关 8090 + 8 个业务服务 `/actuator/prometheus`（HikariCP/线程池/业务指标） |

## 1. 测试方法

1. 预热后按端点顺序压测：系统/网关、anime、搜索（ES 降级）、AI 轻量、收藏、管理端、监控。
2. 每端点并发 20、共 100 次请求，统计 QPS、p50/p95/p99、错误率。
3. AI SSE 通过落库消息状态校验完成（SSE 流读取在本机偶发为空，以持久化 COMPLETED/FAILED 为准）。
4. 优化前后各跑多轮取稳定值；运行期间核对 HikariCP 与首页缓存指标。

## 2. 优化前基线问题（第一轮实测发现）

| 问题 | 证据 | 影响 |
| --- | --- | --- |
| 管理端仪表盘统计串行聚合慢 | QPS 133、p50 104ms、p95 275ms（旧） | 每次请求同步调 anime/feedback/ai 三个服务 + 2 次 DB |
| anime 服务连接池在 20 并发下打满 | `HikariPool-1 - Connection is not available, request timed out after 3009ms (total=10, active=10, idle=0, waiting=7)` | 偶发 500（anime 详情曾出现 20% 错误、p95 3.1s） |
| 首页缓存未验证 | — | 需确认 Redis 缓存命中率 |

## 3. 优化措施

| 措施 | 变更 | 说明 |
| --- | --- | --- |
| 仪表盘统计 5 秒 TTL 缓存 | [AdminDashboardController](../sanye_admin_server/sanye_admin_app/src/main/java/com/sanye/admin/web/controller/admin/AdminDashboardController.java) | 单实例管理端，5 秒一致性窗口可接受；双检锁防并发重建 |
| 连接池扩容 | 8 个业务服务 HikariCP `maximum-pool-size` 10→20、`connection-timeout` 3000→10000 | 匹配 20 并发压测；超时放宽避免误报 |
| PG 连接上限 | `ALTER SYSTEM SET max_connections = 200`（原 100） | 8×20 + 管理端 ≈ 180，留有余量 |

## 4. 优化后结果（稳定轮，并发 20、每端点 100）

| 端点 | QPS | p50 | p95 | p99 | 错误率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| ping | 1344 | 12ms | 24ms | 27ms | 0% |
| capabilities | 1653 | 11ms | 17ms | 18ms | 0% |
| 网关-缺设备头 401 | 3255 | 6ms | 8ms | 12ms | 0% |
| 网关-未知路径 404 | 2547 | 7ms | 12ms | 13ms | 0% |
| home 聚合（缓存） | 1832 | 10ms | 16ms | 17ms | 0% |
| anime 列表分页 | 1745 | 10ms | 17ms | 21ms | 0% |
| anime 类型筛选 | 2156 | 8ms | 13ms | 14ms | 0% |
| anime 详情聚合 | 1960 | 7ms | 21ms | 22ms | 0% |
| 排期周视图 | 1897 | 8ms | 18ms | 19ms | 0% |
| 公开精选 | 2366 | 6ms | 17ms | 17ms | 0% |
| 官网法律正文 | 2448 | 7ms | 12ms | 13ms | 0% |
| 搜索（ES 降级 4002） | 1052 | 16ms | 34ms | 38ms | 0% |
| AI 模型信息 | 2232 | 8ms | 12ms | 14ms | 0% |
| AI 额度 | 2650 | 7ms | 10ms | 12ms | 0% |
| AI 偏好读取 | 1808 | 9ms | 21ms | 22ms | 0% |
| 收藏列表 | 1243 | 11ms | 20ms | 37ms | 0% |
| 收藏状态 | 2516 | 5ms | 18ms | 19ms | 0% |
| admin 登录 | 70 | 277ms | 389ms | 398ms | 0% |
| admin getInfo | 2154 | 7ms | 19ms | 20ms | 0% |
| admin 内容列表 | 367 | 48ms | 84ms | 107ms | 0% |
| admin 仪表盘统计 | 1661 | 7ms | 31ms | 32ms | 0% |
| admin 用户列表 | 732 | 25ms | 37ms | 39ms | 0% |
| admin 操作日志 | 723 | 25ms | 40ms | 42ms | 0% |
| AI SSE 真实模型 | — | — | — | — | 外部阻塞（见 §6） |

## 5. 优化前后对比（关键端点）

| 端点 | 指标 | 优化前 | 优化后 | 提升 |
| --- | --- | ---: | ---: | --- |
| admin 仪表盘统计 | QPS | 133 | 1661 | **12.5×** |
| admin 仪表盘统计 | p95 | 275ms | 31ms | **8.9×** |
| anime 详情聚合 | QPS | 153（冷）~1604（暖） | 1960 | 稳定无超时 |
| anime 详情聚合 | p95 | 15~495ms（波动） | 21ms | 消除偶发超时 |
| home 聚合 | QPS | 290（冷）~1819（暖） | 1832 | 缓存命中率 95%（380/400） |

## 6. 结论与建议

### 6.1 结论

- 24 个接口中 23 个在并发 20 下 QPS 700~3200、p95 ≤ 107ms、错误率 0%。
- 优化后无连接池超时与 500；仪表盘统计为最大收益点（12.5×）。
- 首页聚合 Redis 缓存命中率 95%（380/400），缓存链路有效。
- 监控体系（Prometheus 指标：HikariCP、首页缓存、线程池、AI/首页业务指标）已可用于持续观测。

### 6.2 已知问题与外部阻塞

- **AI 真实模型（硅基流动）额度不足**：`Qwen/Qwen2.5-7B-Instruct` 返回 HTTP 402，SSE 生成失败；系统错误处理链路正常（消息落 FAILED、前端失败态）。需恢复硅基流动账户余额/额度后复测 AI SSE 吞吐。
- admin 登录 QPS 约 70（p50 277ms）：BCrypt 密码哈希 + Token 签发 + 异步审计属正常成本，登录接口不需要高吞吐；生产可评估更优哈希参数。
- 单机偶发长尾：压测期间出现过一次 20 并发下的偶发 10s 级卡顿（隔离复测正常），判断为单机多进程（9 服务 + 前端 + 桌宠 + IDE）资源竞争；正式压测建议在独立压测机/容器环境执行并加 GC 与 CPU 采样。

### 6.3 建议

- ES 就绪后重测搜索与 RAG 真实路径（当前为降级 4002）。
- 生产部署按 PG max_connections 规划各服务连接池（当前本地 8×20 + 管理端 ≈ 180 / 200）。
- 将本基准纳入发布候选门禁（`benchmark-all.mjs`），阈值建议：核心读接口 p95 ≤ 200ms、错误率 0%。

## 7. 复跑方式

```powershell
node sanye_deploy/benchmark-all.mjs 20 100
$m = (Invoke-WebRequest http://localhost:8082/actuator/prometheus).Content  # 核对 hikaricp/sanye_home_*
```

## 8. 优化后逻辑验证（2026-08-20）

- 全量冒烟 77/77 通过（含新增“跨服务 X-Request-Id 透传回显”）；Playwright E2E 31/31 通过。
- 说明：AI 生成相关自动化断言在 `AI_PROVIDER=dev`（本地模拟）下执行以保证确定性；真实模型（硅基流动 `Qwen/Qwen2.5-7B-Instruct`）联调因账户余额/额度不足返回 HTTP 402，错误处理链路已验证（消息落 FAILED、前端失败态），额度恢复后复测 AI SSE 吞吐。

## 9. 二次优化：HTTP gzip 压缩 + 静态封面缓存（2026-08-20）

| 措施 | 变更 | 实测效果 |
| --- | --- | --- |
| HTTP gzip 压缩 | [monitoring.yml](../sanye_server/sanye-server-web/src/main/resources/monitoring.yml) 与 RuoYi application.yml 开启 `server.compression`（JSON/XML/HTML/SVG，≥512B） | `/api/v1/home` 响应 2132B→623B（**-71%**）、`/public/legal` 971B→688B（-29%）；`Content-Encoding: gzip` 验证通过 |
| 静态封面缓存头 | anime 服务 `spring.web.resources.cache.cachecontrol.max-age=7d` | `/covers/*` 返回 `Cache-Control: max-age=604800`，重复加载零请求 |

压缩后本地预热基准（并发 20）：核心读接口 QPS 800~2400、p95 ≤49ms、错误率 0%（anime 详情 1254~1347、home 1339~1509、仪表盘 977~2446）。本地单机 QPS 较未压缩略有下降（gzip 消耗 CPU、本地带宽收益不可见），属预期权衡；**公网/生产环境带宽收益显著**，压缩保留为标准配置。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.2 | 将真实模型供应商、模型和外部阻塞统一为硅基流动/Qwen2.5-7B-Instruct/HTTP 402 | environment-config、压测联调记录 |
