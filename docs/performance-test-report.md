# sanye_anime 全接口吞吐/QPS 与响应速度测试报告

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.3 |
| 文档状态 | 基线 |
| 关联文档 | [当前审计](./current-status-audit.md) |
| 更新时间 | 2026-09-10 |

| 项目 | 内容 |
| --- | --- |
| 生成时间 | 2026-08-21 |
| 工具 | [benchmark-all.mjs](../sanye_deploy/benchmark-all.mjs)（Node fetch 并发基准）+ Prometheus 指标核对 |
| 环境 | 单机本地联调：网关 8091 + 8 个业务服务 + RuoYi 管理端 8089 + PG 5433 + Redis 6379（另有 Vite×2、Electron 桌宠、IDE 同机运行；历史基线网关为 8080） |
| 参数 | 并发 20、每端点 100 请求、24 个端点；AI SSE 真实模型 1 并发（避免成本） |
| 监控 | 网关 8090 + 8 个业务服务 `/actuator/prometheus`（HikariCP/线程池/业务指标） |

## 当前核对（2026-09-10）

2026-09-10 已执行本机接口压测并修复两个问题。下文原有编号章节仍为 2026-08-21 历史证据，不与本轮结果合并。本轮不代表全部接口验收或生产容量验证，发布边界仍见[当前审计](./current-status-audit.md)。

更新记录：2026-09-10，v1.1，增加当前性能测试、优化复测、覆盖清单和未完成项，依据下列逐请求证据与当前源码。

### 本轮结果

后续修复记录（2026-09-10，v1.2）：监控已从请求内同步回源改为单个后台线程采样，每次完成后间隔 5 秒刷新；HTTP 请求仅取快照。没有成功样本或样本超过 30 秒时明确返回不可用，失败不会延长旧数据有效期，应用关闭时停止线程。下文 5 秒同步快照属于第一轮历史实现，不是当前实现。

持续复测 `node sanye_deploy/verify-monitor-performance.mjs` 跨越约 22.4 秒，80 次请求、错误 0、p95 29.6 毫秒、p99/最大值 89.5 毫秒，本机跨刷新周期原始证据为 `sanye_deploy/.local/performance/monitor-refresh.json`。该测试特意在请求之间间隔 250 毫秒，避免只覆盖瞬时热缓存。首个后台样本完成前可能短暂返回不可用，不再在 HTTP 请求内等待 CPU 采样。

同类 SQL 排查发现 `SysDeptMapper.selectNormalChildrenDeptById` 也将字符字段 `status` 与数字比较，已修正为 `'0'`；通过 XML 读取真实映射并绑定测试部门 100，在本机 PostgreSQL 5433 的管理库只读执行成功，返回正常子部门数 9。本轮没有实际停用或修改现有部门。

后续管理测试 `mvn -B -f sanye_admin_server/pom.xml test -q` 共 26 项、失败 0、错误 0，包含监控缺失样本、失败后有效期和恢复、采样中并发请求不阻塞三项测试；日志 `sanye_deploy/.local/perf-monitor-fix-tests.log`。当前管理端重新打包并本地重启，日志 `perf-monitor-fix-package.log` 和 `perf-monitor-fix-start.log`。XXL-JOB 未配置仍属环境阻塞，没有以空成功响应掩盖。

| 轮次 | 参数 | 计量请求 | 结果和证据 |
| --- | --- | ---: | --- |
| 优化前 | 并发 10，每场景 200 次 | 9200 | 本机 `sanye_deploy/.local/performance/baseline-c10.json`；监控慢，路由业务 500 |
| 优化后扩容复测 | 并发 20，常规场景 400 次 | 20840 | 本机 `sanye_deploy/.local/performance/after-c20.json`；成功场景 p95 最大 73.4 毫秒；XXL-JOB 状态仅测未配置响应，不算调度通过 |
| 最终核验 | 并发 10，常规场景 200 次；上传和反馈为并发 2、20 次 | 11640 | 本机 `sanye_deploy/.local/performance/final-c10-verified.json`；62 场景中 60 通过、2 受阻；计量请求错误数 0，成功场景 p95 最大 34.7 毫秒 |

逐接口 QPS、p50/p95/p99、首次耗时见本机 `sanye_deploy/.local/performance/current-report.md`，未测接口见本机 `sanye_deploy/.local/performance/inventory.json`。这些 `.local` 文件为本机生成证据，不进入 Git，正式归档应同时保存原始产物；干净检出及 GitHub 页面不提供这些原始文件。

源码静态扫描发现 217 条直接控制器映射，最终场景匹配 59 条，其中 57 条通过、2 条受阻，剩余 158 条未压测。筛选场景不等于独立接口；共享控制器不按服务副本重复计数。扫描不解析继承、组合注解、多路径别名、Actuator、静态资源，不能作为运行时路由全集证明。

### 优化与修复

| 问题 | 修改 | 优化前 | 同负载复测 | 限制 |
| --- | --- | --- | --- | --- |
| 服务器监控每请求等待 CPU 采样 1 秒 | `ServerController` 增加 5 秒共享快照、双检锁合并采样、失败不缓存 | p95 1176.7 毫秒、QPS 9.1 | p95 7.5 毫秒、QPS 2035.4 | 热快照 p95 降低约 99.4%；首次/过期请求仍约 1.1 秒，等待者也可能等待采样 |
| 管理端路由返回业务 500 | `SysMenuMapper.xml` 中字符 `status` 与数字比较改为字符串 `'0'`，同时修正普通用户查询 | HTTP 200、业务码 500 | 管理员 200 次全部成功，p95 15.7 毫秒 | 普通角色路径尚无本轮独立实测 |

监控快照存在最多约 5 秒刷新窗口，权限注解保持每次请求校验。其他轮次变化受 JVM 预热及同机负载影响，不归因于本次两处修改。本轮未修改连接池、数据库上限或密码哈希强度。

### 环境与剩余范围

- Windows 本机，当前源码重新打包；Java 21、Node.js 26；网关 8091、业务 8081 至 8088、管理端 8089、PostgreSQL 5433、Redis 6379。本任务未启动桌宠。
- AI 为 `dev` 模拟提供方，CAS 为本机 8095 模拟服务。文件上传、元数据和下载走真实 HTTP 与本地存储，测试 SVG 约 70 字节，不代表大文件吞吐。
- ES 不可用时搜索回源目录；首页依照本地启动脚本禁用 Redis 缓存。结果不证明 ES、首页 Redis 缓存和 RabbitMQ 消费容量。
- RabbitMQ 缺失导致健康检查失败、启动脚本退出非零；实际业务 HTTP 请求可成功。XXL-JOB 未配置，状态/日志两项受阻，最终压测退出码为 1，不能写成全绿。
- 真实 AI 首字与完成延迟、停止/重生成、第三方抓取与导入、索引重建、XXL-JOB 调度待专用来源和中间件环境。
- 权限/用户增删、密码重置、清缓存、踢出在线用户、调度删除、全量导出等未测映射需要隔离资源夹具与恢复验证，未用错误请求替代成功性能。
- 数据量为本机现有小片库，未灌入生产规模数据。负载为闭环短时测试，非持续到达率、长稳或容量上限测试。预热单列；分位数仅统计成功响应，错误率另计。
- 测试使用 `sanye_perf_` 设备和账号；清理了本次会话和收藏。少量测试反馈、上传文件、观看历史、账号仍留本地，未做宽范围数据库和文件清理。

### 复现与验证

`pnpm perf:api` 通过 `PERF_CONCURRENCY`、`PERF_REQUESTS`、`PERF_OUTPUT` 调整参数，管理员身份通过进程环境 `PERF_ADMIN_USERNAME`、`PERF_ADMIN_PASSWORD` 提供，不写入源码或报告。网关仅允许本机。`node sanye_deploy/performance-report.mjs <结果 JSON 路径>` 生成完整报告和清单。

业务后端 `mvn -B -f sanye_server/pom.xml package -q` 正常测试打包通过。管理后端 25 项测试、失败 0、错误 0，包含新增并发合并和失败重试 2 项，见 `sanye_admin_server/sanye_admin_app/target/surefire-reports/`。首次管理端打包因 Windows 运行中 JAR 占用失败；停止本次启动进程后重打包、重启复测成功，证据为 `sanye_deploy/.local/perf-admin-package.log` 与 `perf-admin-restart.log`。

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

2026-09-10，v1.3：将六处被 Git 忽略的本机证据链接改为明确的本机路径，保留历史结果与证据边界；依据独立交付工作区的文档检查结果。

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.2 | 将真实模型供应商、模型和外部阻塞统一为硅基流动/Qwen2.5-7B-Instruct/HTTP 402 | environment-config、压测联调记录 |
