# sanye_anime 全系统监控方案

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.3 |
| 文档状态 | 设计基线，覆盖基础设施、应用、业务、前端与 AI 成本 |
| 关联文档 | [详细技术设计](./technical-design.md)、[接口与字段契约](./api-contract.md)、[按板块开发与测试方案](./module-dev-test-plan.md)、[开发任务清单](./development-tasks.md) |
| 更新时间 | 2026-09-10 |

## 当前核对（2026-09-10）

Outbox 和索引任务已有实现及受控故障证据，T-R-06 已提供容器健康及实例核验工具；详见[任务清单](./development-tasks.md)。Prometheus/Grafana/Alertmanager 目标部署和通知链路没有本次验收，不能因存在配置或健康接口而标记监控交付完成。

更新记录：2026-09-10，v0.3，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 可靠事件实测指标

anime 的 `/actuator/prometheus` 提供 `sanye_event_outbox_records{state="PENDING|SENT|DEAD"}`、`sanye_event_outbox_pending_age_seconds`、`sanye_event_outbox_retry_attempts`。发布/消费日志记录 eventId、aggregateId、version、attempts 或跳过版本；不记录消息正文和凭据。DEAD 非零或等待时长持续增长应进入人工诊断和受控补偿。

2026-09-09 更新记录（v0.2）：指标已在真实服务读取；故障演练保留 DEAD 与死信记录，所以这些值不表示全部历史失败记录已清空。事件故障告警接入完整监控栈属于后续部署范围。

## 1. 监控架构

```text
前端（Vue）                   业务后端（sanye_server）           管理后端（sanye_admin_server）
  Web Vitals / 错误上报  ->      Micrometer / Actuator   ->        Micrometer / Actuator
        |                            |                               |
        +----------------------------+-------------------------------+
                                     v
                           Prometheus（指标抓取）
                                     |
                        +------------+------------+
                        v                         v
                   Alertmanager（告警）        Grafana（看板）
                        |
                        +-> 邮件/钉钉/企微（占位）

基础设施导出器：postgres_exporter / redis_exporter / elasticsearch_exporter
               / rabbitmq_exporter（或内置指标）/ MinIO metrics / node_exporter
日志：结构化 JSON（文件或 Loki，P1），requestId 贯穿
链路：OpenTelemetry 追踪（P1），首版以 requestId + 指标兜底
```

## 2. 指标分层

| 层 | 覆盖 | 工具/来源 |
| --- | --- | --- |
| 基础设施 | PostgreSQL、Redis、ES、RabbitMQ、MinIO、Nacos、XXL-JOB、容器 | exporters + node_exporter |
| 应用 | JVM、HTTP、事务、HikariCP、线程池、缓存命中 | Micrometer + Actuator |
| 业务 | 登录、首页、搜索、AI、收藏、反馈、任务、队列 | 业务埋点（Counter/Histogram） |
| AI 成本 | 模型调用次数、token、耗时、成本 | `sanye_ai_usage` 聚合 + 指标 |
| 前端 | Web Vitals、错误率、接口失败率 | `@vitejs/plugin-legacy` 无关；web-vitals 库 + 上报接口 |

## 3. 指标清单与告警阈值

### 3.1 应用与池化资源

| 指标 | 来源 | 说明 | 告警阈值 |
| --- | --- | --- | --- |
| `hikaricp_connections_active` | HikariCP | 活跃连接 | pending>0 持续 1 分钟或 active=pool 上限 80% |
| `hikaricp_connections_pending` | HikariCP | 等待连接数 | >0 持续 1 分钟（P1） |
| `hikaricp_connections_leaked` | HikariCP | 泄漏连接 | 出现即告警（P1） |
| `sanye_threadpool_queue_size{pool}` | 自定义 | 各线程池队列 | 队列使用率 >80%（P2） |
| `sanye_threadpool_rejected_total{pool}` | 自定义 | 拒绝任务 | >0（P1） |
| `http_server_requests_seconds` | Actuator | 接口耗时 | 首页 P95 >2.5s；搜索 P95 >500ms |
| `jvm_memory_used_bytes` | JVM | 内存 | >85% 堆（P2） |
| `system_load_average` | OS | 负载 | 持续 >核数（P2） |

### 3.2 业务指标

| 指标 | 说明 | 告警阈值 |
| --- | --- | --- |
| `sanye_login_total{result}` | 登录成功/失败 | 失败率突增或单账号爆破（P1） |
| `sanye_home_request_total` | 首页请求 | 错误率 >5%（P1） |
| `sanye_search_latency_seconds` | 搜索耗时 | P95 >500ms（P1） |
| `sanye_ai_first_token_seconds` | AI 首字耗时 | P75 >3s（P1） |
| `sanye_ai_completed_total / failed_total` | AI 完成/失败 | 失败率 >10%（P1） |
| `sanye_ai_cost_cents_total` | 模型成本 | 日成本超阈值（P1） |
| `sanye_quota_exhausted_total` | 额度用尽次数 | 突增可能刷量（P2） |
| `sanye_favorite_total` | 收藏次数 | 异常突增/突降（P2） |
| `sanye_feedback_created_total` | 反馈提交 | 剧透类反馈突增（P1，质量信号） |

### 3.3 基础设施与队列/任务

| 指标 | 说明 | 告警阈值 |
| --- | --- | --- |
| `pg_up` / `pg_locks` | PG 可用性/锁等待 | 不可用（P0）；锁等待>10s（P1） |
| `redis_up` / `redis_memory_used_bytes` | Redis | 不可用（P0）；内存 >80%（P1） |
| `elasticsearch_cluster_health_status` | ES | 非 green（P1） |
| `rabbitmq_queue_messages{queue}` | 队列堆积 | >1000（P1） |
| `rabbitmq_consumers_unacked` | 未确认消息 | 持续 >0（P1） |
| `minio_health` | MinIO | 不可用（P1） |
| `xxl_job_failed_total` | 任务失败 | >0（P1） |
| `sanye_outbox_pending_total` | Outbox 待发布 | >100 或滞留>5 分钟（P1） |

### 3.4 前端指标

| 指标 | 说明 | 阈值 |
| --- | --- | --- |
| LCP | 最大内容绘制 | 首页 ≤2.5s |
| CLS | 布局偏移 | ≤0.1 |
| 前端接口失败率 | 请求错误 | >5%（P1） |
| JS 错误率 | 未捕获异常 | 突增（P1） |

## 4. 日志与链路

- 日志统一结构化 JSON：`{ts, level, requestId, service, module, userId(脱敏), path, code, latencyMs}`。
- 脱敏：手机号、邮箱、token、完整问题正文、文件地址按字段级规则处理；AI 对话正文不进普通日志。
- 保留：业务日志 30 天、审计日志 180 天、访问日志 30 天（按环境可调整）。
- 链路：所有入口生成 `requestId`（MDC 贯穿线程池，TaskDecorator 传递）；OpenTelemetry trace 列为 P1，首版用 requestId + 指标定位。

## 5. 健康检查与告警

### 5.1 健康检查

- `/actuator/health/liveness`：进程存活。
- `/actuator/health/readiness`：依赖就绪（PG/Redis/ES/RabbitMQ/MinIO 按模块声明），未就绪不接流量。
- Docker healthcheck 区分进程、就绪、依赖三级。

### 5.2 告警分级

| 级别 | 定义 | 示例 | 响应 |
| --- | --- | --- | --- |
| P0 | 核心不可用/数据风险 | DB/Redis 不可用、登录全挂、AI 大面积失败 | 立即处理，4 小时恢复或降级 |
| P1 | 功能受损/质量风险 | 搜索变慢、队列堆积、AI 失败率升高 | 当天处理 |
| P2 | 容量/体验风险 | 内存水位、线程池队列、额度异常 | 排期处理 |

- 通知渠道：邮件/钉钉/企业微信（占位配置，生产前确认）。
- 告警合并与静默：同类告警 5 分钟合并一次；维护窗口可静默；避免告警风暴。

## 6. 监控与测试联动

1. Playwright 合成监控：对 staging/prod 定时执行冒烟集合（模块测试方案第 3 节），覆盖首页、搜索、AI、管理端发布、官网；失败自动生成 trace/截图并告警。
2. E2E 断言关键指标：AI 首字时间、首页接口耗时在测试环境记录并对比基线。
3. 前端错误上报：`POST /api/v1/monitor/frontend-errors`（body：`{type, message, stack?, url, route, deviceId}`），错误率进指标与告警。
4. 发布前回归包含监控验证：指标面板数据变化、告警规则命中、日志无脱敏泄漏。

## 7. 看板清单（Grafana）

| 看板 | 内容 |
| --- | --- |
| 总览 | 可用性、错误率、QPS、延迟、告警状态 |
| 业务 | 首页/搜索/AI/收藏/反馈/登录漏斗与耗时 |
| AI | 首字耗时、完成率、失败原因、成本、额度 |
| 基础设施 | PG/Redis/ES/RabbitMQ/MinIO 资源与健康 |
| 应用 | JVM、HikariCP、线程池、HTTP |
| 前端 | Web Vitals、错误率、接口失败率 |

## 8. 落地与门禁

- 部署：`sanye_deploy/monitoring/` 提供 Prometheus、Grafana、Alertmanager 与导出器 compose 配置，配置即代码。
- 任务映射：T-G-03（备份恢复与监控）、TODO-014（可观测性与故障手册）、GAP-011（可观测性）、T-H-01（回归含监控验证）。
- 上线门禁：指标面板可查、告警规则生效、日志脱敏复查通过、合成监控上线。
