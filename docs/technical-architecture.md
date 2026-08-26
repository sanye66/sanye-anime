# sanye_anime AI 客户端技术架构与技术选型说明

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.4 |
| 文档状态 | Baseline，首版按微服务架构建设（D-024），外部兼容性仍待验证 |
| 适用范围 | PC 客户端、官网、业务服务、AI 服务和管理平台 |
| 关联文档 | [产品需求文档](../product/product-requirements.md)、[功能详细说明](../product/feature-specification.md)、[产品总体架构](../product/overall-architecture.md)、[详细技术设计](./technical-design.md)、[决策记录](./decision-log.md)、[版本基线](./version-baseline.md) |
| 开发计划 | [开发计划](./development-plan.md) |
| 更新时间 | 2026-08-18 |

## 1. 技术栈确认

### 1.1 已确定技术组件

| 层级 | 技术 | 在本项目中的职责 |
| --- | --- | --- |
| 微服务基础 | Spring Cloud Alibaba | 服务注册、配置、服务间调用等微服务基础能力 |
| 网关 | Spring Cloud Gateway | 统一入口、路由、鉴权前置、跨域与基础限流 |
| 注册与配置 | Nacos | 服务注册发现、配置管理、环境配置 |
| 流量治理 | Sentinel | 限流、熔断、降级和热点参数保护 |
| 消息队列 | RabbitMQ | 异步任务、事件通知、削峰和解耦 |
| 业务数据库 | PostgreSQL | 用户、动漫、会话、消息、收藏、排期等核心数据 |
| 搜索引擎 | Elasticsearch | 动漫名称、别名、角色和标签搜索，推荐候选检索 |
| 缓存 | Redis | 首页缓存、会话状态、限流计数、幂等和热点数据 |
| 对象存储 | MinIO | 头像、反馈附件、内容图片等文件存储 |
| 容器化 | Docker | 本地开发、测试和部署环境标准化 |
| 定时任务 | XXL-JOB | 排期同步、索引重建、缓存预热、数据清理等定时任务 |
| 管理平台 | RuoYi | 管理后台的用户、权限、内容、AI 反馈和运营配置 |
| 统一认证 | CAS（Apereo CAS） | 客户端与官网单点登录；业务端在 ticket 校验后签发本地会话凭证 |
| AI 编排 | LangChain4j | 模型调用、会话记忆（Memory）、RAG 检索和流式输出 |
| E2E 测试 | Playwright | 三端浏览器 E2E、API 契约测试与合成监控 |
| 监控 | Prometheus / Grafana / Alertmanager | 指标采集、看板与告警；覆盖基础设施、应用、业务、AI 成本与前端 |

### 1.2 口径说明

XXL-JOB 是分布式任务调度组件，不是编程语言。本文按“定时任务使用 XXL-JOB”记录。

版本和兼容基线统一记录在 [version-baseline.md](./version-baseline.md)。首版技术落地边界和外部验证项统一记录在 [decision-log.md](./decision-log.md) 与 [gap-register.md](./gap-register.md)。

## 2. 总体架构（微服务）

项目按微服务架构建设（决策 D-024）。客户端、官网与管理平台前端不变，后端拆分为网关和八个业务服务，管理端 RuoYi 独立运行。

```text
官网 / PC 客户端 / 管理平台前端
      |
      v
sanye_gateway（统一入口：路由、鉴权前置、跨域、限流、请求 ID）
      |
      +---> sanye_auth（CAS 登录、本地会话、账户、角色权限）
      +---> sanye_anime（作品、Banner、榜单、排期、详情）
      +---> sanye_search（Elasticsearch 检索、索引构建与同步）
      +---> sanye_ai_chat（会话、记忆、RAG、SSE 流式、额度、推荐）
      +---> sanye_favorite（收藏、浏览历史）
      +---> sanye_file（MinIO 上传/下载、文件元数据、扫描状态）
      +---> sanye_feedback（用户反馈、AI 反馈与处理）
      +---> sanye_job（XXL-JOB 执行器、同步与清理任务）
      +---> sanye_admin_server（RuoYi 管理端，独立应用）

基础设施：Nacos（注册/配置）、Sentinel（限流熔断）、RabbitMQ（事件）、
PostgreSQL（每服务独立 schema）、Redis（缓存/会话/幂等/额度）、
Elasticsearch、MinIO、XXL-JOB、Prometheus/Grafana/Alertmanager
```

### 2.1 分层职责

| 层 | 主要职责 | 不应承担的职责 |
| --- | --- | --- |
| 客户端/官网/管理前端 | 页面渲染、交互状态、请求发起、流式展示 | 保存模型密钥、决定权限、拼装作品事实 |
| 网关 sanye_gateway | 统一入口、路由、鉴权前置、跨域、请求 ID、基础限流 | 业务逻辑、直接操作业务库 |
| 业务服务 | 各自领域内的业务、数据、缓存与事件 | 跨服务直连数据库、私自修改他人领域数据 |
| AI 服务 sanye_ai_chat | 意图识别、检索、上下文组装、模型调用、安全审核、SSE | 让客户端直接调用模型供应商 |
| 数据层 | 每服务独立 schema、ES、Redis、MinIO | 把 Redis 当作唯一事实来源 |
| 管理端 RuoYi | 内容管理、权限、反馈处理、任务监控 | 绕过网关与服务直接修改生产数据 |

## 3. 服务清单与边界（当前架构）

后端按微服务拆分（决策 D-024），每个服务可独立构建、独立容器部署、独立发布。

| 服务 | 主要职责 | 数据（PostgreSQL schema） | 主要依赖 |
| --- | --- | --- | --- |
| `sanye_gateway` | 统一入口、路由、鉴权前置、跨域、限流、请求 ID | 无 | Nacos、Sentinel、Redis |
| `sanye_auth` | CAS 登录、本地会话（JWT/Redis）、账户、角色权限 | `sanye_auth` | PostgreSQL、Redis、CAS |
| `sanye_anime` | 作品、Banner、榜单、排期、详情、发布状态 | `sanye_anime` | PostgreSQL、Redis |
| `sanye_search` | ES 检索、索引构建与同步 | `sanye_search` | Elasticsearch、PostgreSQL、RabbitMQ |
| `sanye_ai_chat` | 会话、消息、记忆、RAG、SSE、额度、推荐 | `sanye_ai_chat` | PostgreSQL、Redis、Elasticsearch、RabbitMQ、模型供应商 |
| `sanye_favorite` | 收藏、浏览历史 | `sanye_favorite` | PostgreSQL、Redis |
| `sanye_file` | 上传/下载授权、文件元数据、扫描状态 | `sanye_file` | MinIO、PostgreSQL、RabbitMQ |
| `sanye_feedback` | 用户反馈、AI 反馈与处理状态 | `sanye_feedback` | PostgreSQL、RabbitMQ |
| `sanye_job` | XXL-JOB 执行器、同步与清理任务 | `sanye_job` | XXL-JOB、PostgreSQL、RabbitMQ |
| `sanye_admin_server` | RuoYi 管理端（独立应用） | `sanye_admin`（RuoYi 表） | PostgreSQL、Redis |

### 3.1 边界规则

- 服务间不直连对方数据库，只通过网关/OpenFeign 调用或 RabbitMQ 事件协作。
- 数据一致性统一走“本地事务 + Outbox + 事件 + 对账”，禁止跨服务事务和两阶段提交。
- 公共能力（认证、额度、会话）由 `sanye_auth` 与 Redis 提供，其他服务通过其受控接口使用。
- 单 PostgreSQL 实例按服务独立 schema，schema 间不允许 SQL 级联访问。
- 服务粒度调整必须记录数据边界、迁移方案、回滚方案和新增运维成本。

### 3.2 物理部署（当前）

```text
Docker Compose：
  gateway + 8 个业务服务 + admin_server（各一容器）
  基础设施：postgres / redis / rabbitmq / elasticsearch / minio / nacos / xxl-job-admin
  可观测：prometheus / grafana / alertmanager
```

- 开发/测试：Compose 一键启动全部服务，每个服务独立端口与健康检查。
- 生产首版：单节点多容器部署，Kubernetes 延后评估。
- 每个服务独立配置环境变量，公共配置进 Nacos。

### 3.3 前端与全工程规划（D-025）

#### 3.3.1 前端工程

| 工程 | 框架 | 承载范围 | 对接方式 |
| --- | --- | --- | --- |
| `sanye_client` | Vue 3 + TypeScript + Vite | `sanye_anime` 客户端页面 + `official` 官网页面（路由分区） | 统一经网关 `/api/**`；CAS 登录跳转与回调 |
| `sanye_admin` | Vue 3 + TypeScript + Vite（RuoYi 前端） | 管理平台页面 | 经网关或直连管理后端；RuoYi 登录与权限 |

规则：

- 前端只通过网关访问业务接口，不直连业务服务；请求层统一封装 accessToken、requestId、错误码映射与重试。
- 构建产物静态托管（Nginx），history 路由回退，静态资源缓存与 CSP 头；环境变量注入网关地址。
- 前端安全：Vue 默认转义 + 富文本白名单、token 不入日志与 URL、模型密钥永不进前端、CSP 与错误边界。

#### 3.3.2 其他工程

| 工程/部分 | 定位 |
| --- | --- |
| `sanye_deploy` | 部署辅助：Compose、镜像锁、监控配置、备份/发布/回滚脚本（已初始化 `compose.yaml` 与 `images.lock`） |
| `sanye_website` | 早期独立官网过渡目录，不参与根工作区构建；官网页面统一在 `sanye_client` |
| 桌宠（P1） | Windows 桌面伴侣，随客户端唤起；见桌宠文档与 PET-TODO-001 至 008 |
| 监控栈 | Prometheus / Grafana / Alertmanager + 各中间件导出器，见 [全系统监控方案](./monitoring-design.md) |
| CI/CD | GitHub Actions：前端构建、后端多服务构建与测试、依赖/密钥扫描（T-B-02），后续补镜像与部署作业 |

## 4. 核心业务链路

### 4.1 首页内容链路

```text
客户端请求首页
  -> 统一访问入口完成鉴权和路由
  -> 动漫内容服务
  -> Redis 读取首页聚合缓存
  -> 缓存未命中时查询 PostgreSQL
  -> 返回 Banner、快捷入口和内容分区
  -> 异步记录曝光事件
```

规则：

- PostgreSQL 是作品和排期事实数据的来源。
- Redis 只缓存可重新构建的数据。
- 首页聚合接口不应为每一个内容卡片单独请求一次服务端。
- 内容更新后通过 RabbitMQ 或缓存失效机制刷新首页缓存。

### 4.2 搜索链路

```text
用户输入关键词
  -> 客户端防抖
  -> 统一访问入口
  -> 搜索服务
  -> Elasticsearch 查询标题、别名、角色和标签
  -> Redis 缓存热门关键词或热门结果
  -> 返回作品 ID 和高亮字段
  -> 客户端根据作品 ID 打开详情
```

规则：

- Elasticsearch 负责搜索，不作为作品主数据唯一来源。
- 作品详情仍由动漫内容服务返回。
- 搜索索引需要记录 `animeId`，不能只存展示文本。
- 作品下架后必须同步更新索引，避免搜索结果指向不可用作品。

### 4.3 AI 对话链路

```text
客户端发送问题
  -> 统一访问入口校验登录态、请求 ID 和限流
  -> AI 服务校验会话所有权和幂等 ID
  -> Redis 检查额度、幂等和短期会话状态
  -> PostgreSQL 保存用户消息
  -> AI 服务识别意图
  -> Elasticsearch / 动漫服务检索作品数据
  -> 组装剧透策略和上下文
  -> 服务端调用模型供应商
  -> 输出安全审核
  -> SSE 返回文本增量和作品 ID
  -> PostgreSQL 保存 AI 消息
  -> RabbitMQ 异步记录用量和质量事件
```

客户端只接收标准化的消息事件和作品 ID，不接触模型供应商地址、密钥和内部提示词。

### 4.4 番剧排期同步链路

```text
XXL-JOB 定时触发
  -> 排期同步任务读取授权数据源
  -> 校验和标准化作品、日期、集数和状态
  -> PostgreSQL 使用幂等写入
  -> RabbitMQ 发布“作品或排期已更新”事件
  -> 搜索服务更新 Elasticsearch 索引
  -> 内容服务删除相关 Redis 缓存
```

规则：

- 同一来源记录必须有稳定的外部 ID，避免重复创建作品。
- 同步任务支持失败重试和断点记录。
- 未确认的更新数据不能覆盖更高可信度的人工修正数据。
- 任务成功只代表本批次写入成功，不代表客户端已经刷新；页面可见性需要单独验证。

### 4.5 文件上传链路

```text
客户端请求上传凭证
  -> 文件服务校验用户权限和文件类型
  -> MinIO 保存对象
  -> 文件服务校验对象大小、媒体类型和病毒风险
  -> PostgreSQL 保存文件元数据
  -> 返回短期访问地址或业务资源 ID
```

规则：

- MinIO 对象 Key 不直接暴露为公共业务 URL。
- 需要访问私有文件时使用短期签名 URL。
- 文件元数据和业务记录要能关联删除。
- 客户端不能自定义任意对象 Key，避免覆盖其他文件。

## 5. 组件使用规范

### 5.1 Spring Cloud Alibaba 使用规范

- 用于微服务注册发现、配置和服务治理整合。
- 服务之间通过明确的 API 或事件通信。
- 配置按环境分离：开发、测试、预发布、生产。
- 业务服务启动时必须检查关键配置是否存在。
- 不把密码、模型 Key 和 MinIO 密钥写入 Git 或普通配置文件。

### 5.2 Nacos 使用规范

建议配置分组：

| 分组 | 内容 |
| --- | --- |
| `COMMON_GROUP` | 公共服务地址、日志和序列化配置 |
| `BUSINESS_GROUP` | 业务开关、额度和分页参数 |
| `AI_GROUP` | 模型路由、超时、上下文和安全参数 |
| `JOB_GROUP` | XXL-JOB 执行器和任务参数 |

接入状态（2026-08-18）：`sanye_gateway` 与 8 个业务服务已引入 Nacos discovery/config 依赖；每个服务通过环境变量开关控制（`NACOS_ENABLED`、`NACOS_SERVER_ADDR`、`NACOS_USERNAME`、`NACOS_PASSWORD`），本地默认关闭；启用后按上表分组加载配置（业务配置 `sanye-{service}.yaml` + 共享配置 `sanye-common.yaml`）并注册服务，网关以 `lb://` 按服务名路由。

规则：

- 敏感配置使用密文或外部密钥管理，不明文放在 Nacos。
- 配置修改需要记录操作人、时间和版本。
- 动态配置只用于可安全热更新的参数。
- 模型供应商密钥变更不能依赖客户端发布。

### 5.3 Sentinel 使用规范

建议保护的接口：

| 接口 | 策略 |
| --- | --- |
| AI 发送消息 | 按用户、匿名设备和 IP 限流 |
| 搜索接口 | 防止高频输入和恶意扫描 |
| 首页聚合接口 | 热点保护和缓存降级 |
| 文件上传 | 单用户并发数、大小和频率限制 |
| 登录接口 | 验证码和账号维度限流 |

降级规则：

- AI 服务不可用时，客户端获得明确错误码，不返回伪造的 AI 成功结果。
- 首页 Redis 可用但数据库短暂异常时，可以返回最近缓存。
- Elasticsearch 不可用时，搜索接口展示服务暂不可用；不建议直接对 PostgreSQL 做无约束模糊查询。

### 5.4 RabbitMQ 使用规范

建议事件：

| 事件 | 生产者 | 消费者 |
| --- | --- | --- |
| `anime.updated` | 动漫服务、同步任务 | 搜索服务、缓存刷新 |
| `schedule.updated` | 排期任务 | 动漫服务、搜索服务 |
| `ai.message.completed` | AI 服务 | 用量统计、质量分析 |
| `ai.feedback.created` | AI 服务 | 反馈服务、运营统计 |
| `file.uploaded` | 文件服务 | 内容校验或缩略图任务 |

消息要求：

- 事件携带事件 ID、类型、版本、产生时间和业务主键。
- 消费者必须幂等，重复投递不能重复写入或重复扣费。
- 配置重试队列和死信队列。
- 消费失败时保留可追踪的原因和请求 ID。
- 不能把大段 AI 对话正文直接作为高频消息载荷；消息中传业务 ID，正文由授权服务读取。

### 5.5 PostgreSQL 使用规范

核心表建议：

| 表 | 作用 |
| --- | --- |
| `sanye_user_account` | 用户和账户状态 |
| `sanye_user_auth` | 登录凭证关联信息（CAS 主体绑定） |
| `sanye_anime` | 作品主数据 |
| `sanye_anime_schedule` | 播出排期 |
| `sanye_anime_banner` | Banner 配置 |
| `sanye_conversation` | AI 会话 |
| `sanye_conversation_message` | AI 消息 |
| `sanye_user_favorite` | 收藏关系 |
| `sanye_user_watch_history` | 观看或查看记录 |
| `sanye_ai_feedback` | AI 回答反馈 |
| `sanye_file_object` | MinIO 文件元数据 |
| `sanye_job_sync_record` | 同步任务执行记录 |

规则：

- 主数据、会话和权限关系必须落 PostgreSQL。
- 重要写入使用唯一约束保证幂等，如 `client_message_id + conversation_id`。
- 删除策略要区分逻辑删除和物理删除，并与隐私政策一致。
- 事务只覆盖本地数据库；跨服务一致性通过事件、状态和补偿实现。
- 生产环境禁止依赖无条件级联删除清理用户大批量数据。
- 数据库连接池统一使用 HikariCP，连接只用于短事务，禁止在事务内发起远程调用或等待外部服务；线程池与连接池的参数和监控见 [详细技术设计](./technical-design.md) 7.8、7.9 节。

### 5.6 Elasticsearch 使用规范

建议索引：

- `anime_search_v1`：标题、别名、类型、角色、简介关键词。
- `anime_schedule_v1`：日期、更新时间、作品 ID和状态。
- `anime_tag_v1`：题材、情绪、风格和人群标签。

索引规则：

- 使用别名指向当前版本索引，支持重建和切换。
- `animeId` 是关联主键，不以标题作为唯一标识。
- 重建索引由 XXL-JOB 执行，完成后通过别名原子切换。
- 作品下架、标题修改、别名修改必须有增量更新事件。
- 搜索结果返回命中的业务 ID，不在 ES 中维护用户收藏等高频变化状态。

### 5.7 Redis 使用规范

建议 Key 约定：

| Key 示例 | 用途 | 过期策略 |
| --- | --- | --- |
| `anime:home:{tab}` | 首页聚合缓存 | 短期过期 + 主动失效 |
| `anime:detail:{id}` | 作品详情缓存 | 按内容更新失效 |
| `ai:quota:user:{id}:{date}` | 登录用户额度 | 到自然日结束 |
| `ai:quota:anon:{device}:{date}` | 匿名额度 | 到自然日结束 |
| `ai:idempotency:{clientMessageId}` | AI 请求幂等 | 短期保留 |
| `ai:session:{id}` | 流式生成短期状态 | 短期过期 |
| `auth:refresh:{id}` | 刷新凭证状态 | 由凭证有效期控制 |

规则：

- Redis 不保存用户唯一事实数据。
- Key 中的用户标识使用内部 ID 或脱敏值，不能拼接手机号等敏感信息。
- 额度、幂等和锁定逻辑优先使用原子操作或 Lua。
- 缓存穿透、击穿和雪崩需要分别设计空值缓存、互斥重建和过期抖动。

### 5.8 MinIO 使用规范

对象分类建议：

| Bucket / 前缀 | 内容 | 访问方式 |
| --- | --- | --- |
| `user-assets/` | 用户头像和反馈附件 | 私有，短期签名 URL |
| `content-assets/` | 授权的作品图片 | 根据版权策略公开或签名 |
| `export-assets/` | 导出或运营文件 | 私有，权限校验 |

规则：

- 上传前校验扩展名、媒体类型、大小和文件名。
- 服务端重新生成安全文件名和对象 Key。
- 删除文件时同步删除元数据或标记状态。
- 用户无权限时不能通过猜测 URL 读取文件。

### 5.9 Docker 使用规范

开发环境建议至少包含：

```text
nacos
sentinel-dashboard（可选）
postgresql
redis
rabbitmq
elasticsearch
minio
xxl-job-admin
```

规则：

- 每个服务使用环境变量或配置注入，不把生产密码写入镜像。
- 数据库、Redis、RabbitMQ、MinIO 和 ES 的数据目录使用持久化卷。
- 镜像固定基础版本，避免无意升级。
- 健康检查区分进程存活、服务就绪和依赖可用。
- 本地 Docker Compose 配置和生产部署配置分开管理。

### 5.10 XXL-JOB 使用规范

建议任务：

| 任务 | 周期 | 说明 |
| --- | --- | --- |
| `scheduleSync` | 每小时或按来源要求 | 同步番剧排期 |
| `animeSync` | 每日或按来源要求 | 同步作品元数据 |
| `rebuildAnimeIndex` | 手动或每日低峰 | 重建 ES 索引 |
| `refreshHomeCache` | 内容更新后或定时 | 首页缓存预热 |
| `cleanupExpiredSessions` | 每日 | 清理过期匿名会话或临时状态 |
| `cleanupFiles` | 每日 | 清理无业务引用的 MinIO 文件 |
| `aggregateAiUsage` | 每小时或每日 | 汇总模型用量、耗时和成本 |

任务规则：

- 每个任务必须可重复执行，不能依赖“只执行一次”。
- 大任务按分页或游标处理，不能一次加载全表。
- 任务需要记录开始、结束、成功数量、失败数量和错误摘要。
- 失败任务支持重试；超过重试次数进入告警或人工处理。
- 任务执行器只负责执行，业务幂等和数据一致性由业务服务保证。

### 5.11 RuoYi 管理平台

当前管理平台后端位于 `sanye_admin_server/`，是独立于 `sanye_server/` 的 Spring Boot 管理应用。已接入 RuoYi 的 common、system、framework、quartz、generator 和 app 模块，统一使用 `com.sanye.admin` 包名；数据库驱动和初始化脚本按 PostgreSQL 适配，Redis、Token、数据源和 Druid 凭据通过环境变量注入。`sanye_admin/` 已完成真实接口绑定，覆盖仪表盘、内容、官网正文、反馈、任务/任务日志、用户、角色、菜单和审计页面。

已验证：JDK 21 下管理后端 Maven 打包成功；本地 PostgreSQL/Redis、真实登录、权限守卫、角色菜单授权、Quartz 任务与日志、管理前端联调均有自动化或冒烟证据。正式凭据、生产安全配置和部署发布仍属于环境门禁。

管理平台功能建议：

- 管理员登录、角色和菜单权限。
- 用户查询、状态管理和必要的账号处理。
- 动漫作品、别名、类型、Banner 和排期管理。
- 搜索索引状态和重建任务触发。
- AI 反馈查看、分类、处理和关闭。
- 敏感词和安全策略配置。
- AI 模型路由、额度和业务开关配置。
- XXL-JOB 任务状态、失败记录和手动重试入口。
- 操作日志和审计记录。

管理平台权限至少拆分为：

| 角色 | 权限 |
| --- | --- |
| 超级管理员 | 系统和权限管理 |
| 内容编辑 | 作品、Banner、排期和标签的创建与编辑 |
| 内容审核员 | 内容审核、发布、驳回和下架 |
| AI 运营 | AI 反馈、提示词配置和质量数据 |
| 数据运营 | 数据同步、搜索重建和数据修正 |
| 客服运营 | 用户反馈和基础账号查询 |
| 审计员 | 只读审计记录和报告 |

角色命名与 [产品总体架构](../product/overall-architecture.md) 5.2 保持一致；代码级权限标识（`ADMIN`、`CONTENT_EDITOR`、`CONTENT_REVIEWER`、`AUDITOR` 等）与角色名称的映射见 [详细技术设计](./technical-design.md) 5.1 节。

RuoYi 只能通过受控业务接口访问业务数据，不能为了方便直接修改核心表绕过服务层规则。

## 6. AI 对话的技术实现要求

### 6.1 客户端与服务端通信

建议使用 SSE 实现单向流式回答：

```text
POST /api/v1/ai/conversations/{conversationId}/messages
  -> 返回 streamId 或直接建立 SSE
  -> message.accepted
  -> message.delta
  -> recommendation
  -> message.completed / message.failed
```

如果当前访问边界或部署环境不适合 SSE，再评估 WebSocket。无论采用哪种方式，都必须定义：

- 断线重连。
- 重复事件去重。
- 停止生成。
- 生成完成后的补拉。
- 错误码和超时。

### 6.2 AI 上下文来源

```text
当前问题
  + 最近对话消息
  + 作品结构化数据
  + ES 检索结果
  + 剧透模式
  + 安全策略
  -> AI 服务组装受控上下文
  -> 模型生成回答
```

不允许：

- 客户端直接提交完整作品事实作为唯一依据。
- 模型直接生成可执行的播放或下载地址。
- 把所有历史消息无上限传给模型。
- 把用户私密对话写入 RabbitMQ 的公共日志消息。

AI 服务使用 LangChain4j：会话记忆持久化到 PostgreSQL（ChatMemoryStore），RAG 检索基于 Elasticsearch 经典检索（BM25 ContentRetriever），详细实现见 [详细技术设计](./technical-design.md) 5.6 节。

### 6.3 AI 失败降级

| 故障 | 降级行为 |
| --- | --- |
| Redis 不可用 | 暂停额度和幂等敏感操作，避免错误扣费；根据策略拒绝或降级 |
| ES 不可用 | 普通问答可继续，推荐和搜索返回不可用提示 |
| PostgreSQL 不可用 | 不创建新会话，不伪造保存成功 |
| 模型供应商超时 | 返回 `AI_TIMEOUT`，保留用户消息，支持重试 |
| RabbitMQ 不可用 | 核心对话不依赖异步统计完成；本地记录待补偿事件 |
| MinIO 不可用 | 文本聊天可用，附件上传暂不可用 |

## 7. 数据一致性和幂等要求

### 7.1 消息幂等

- 客户端生成 `clientMessageId`。
- 服务端以 `conversationId + clientMessageId` 建唯一约束。
- 首次请求创建用户消息。
- 重复请求返回原消息状态，不重复调用模型或扣除额度。
- AI 重试使用新的生成尝试 ID，但不重复创建用户消息。

### 7.2 数据库与消息队列

跨服务事件建议使用 Outbox 或等价的可靠事件发布方式：

```text
本地事务：写入业务数据 + 写入待发布事件
  -> 事件发布任务读取待发布事件
  -> RabbitMQ 发布
  -> 消费者幂等处理
  -> 标记事件已完成
```

不要在数据库事务中直接假设 RabbitMQ 一定发布成功，也不要在消息消费失败时无条件丢弃事件。

### 7.3 缓存一致性

- 更新 PostgreSQL 成功后再删除或更新 Redis。
- 重要内容更新事件触发缓存失效。
- 缓存失效失败时由 XXL-JOB 定期修复或预热。
- 页面显示成功以业务数据库和接口结果为准，不以客户端本地乐观状态为准。

## 8. 安全要求

- 所有外部请求经过统一安全边界。
- 认证使用 CAS 单点登录；ticket 必须服务端校验，service 地址白名单，本地会话凭证负责 API 鉴权与即时吊销。
- AI 模型 Key、数据库密码、Redis 密码、MinIO 密钥不得进入客户端和 Git。
- 管理平台采用 RBAC，敏感操作需要操作日志。
- 会话、消息、收藏和反馈接口必须做资源所有权校验。
- 文件下载使用短期签名地址并校验业务权限。
- 对外部内容源做字段白名单和内容清洗。
- 日志脱敏用户 ID、手机号、凭证、问题内容和文件地址。
- 限制上传文件大小、类型和数量，防止对象存储被滥用。

## 9. 环境规划

| 环境 | 用途 | 数据要求 |
| --- | --- | --- |
| local | 开发调试 | Docker 本地组件，使用测试数据 |
| dev | 联合开发 | 可重置，禁止真实用户数据 |
| test | 自动化和验收 | 固定测试数据，可构造异常 |
| staging | 发布前验证 | 接近生产配置，数据脱敏 |
| prod | 正式服务 | 备份、监控、告警和审计完整 |

环境隔离要求：

- Nacos 配置、数据库、Redis、RabbitMQ、MinIO、ES 集群和 XXL-JOB 执行器按环境隔离。
- 禁止开发环境连接生产数据库或生产对象存储。
- 生产配置只能通过受控发布流程变更。

## 10. 技术验收清单

### 基础设施

- [ ] 服务可以从 Nacos 注册和发现。
- [ ] 配置按环境隔离，敏感项不明文提交。
- [ ] Sentinel 对 AI、搜索、登录和上传接口生效。
- [ ] RabbitMQ 重试、死信和消费者幂等已验证。
- [ ] PostgreSQL 数据迁移和索引已纳入发布流程。
- [ ] ES 索引可以重建并通过别名切换。
- [ ] Redis Key、过期时间和失效策略已统一。
- [ ] MinIO 文件权限和签名 URL 已验证。
- [ ] Docker 服务有健康检查和持久化卷。
- [ ] XXL-JOB 失败重试和告警已验证。

### AI 链路

- [ ] 客户端不包含模型供应商密钥。
- [ ] 消息幂等和重复点击已验证。
- [ ] SSE 断线、停止、重试和补拉已验证。
- [ ] AI 回答与作品 ID 卡片可以正确关联。
- [ ] 剧透模式在检索、提示词和输出审核中一致生效。
- [ ] 额度扣减不会因重试重复发生。
- [ ] 失败时用户消息不会丢失或伪造成功。

### 管理平台

- [x] RuoYi 角色权限可以限制内容、反馈、任务、用户和管理页面操作（AI 成本统计按管理端权限聚合）。
- [ ] 作品和排期修改可以触发缓存与索引更新。
- [ ] AI 反馈可以检索、处理和审计。
- [x] Quartz 任务可以查看执行记录、立即执行、暂停/恢复和删除；失败记录可从任务页跳转日志处理。

## 11. 已确定的首版技术决策

1. 首版按微服务架构建设（D-024）：网关 + 八个业务服务 + RuoYi 管理端，覆盖原模块化单体方案；服务可独立构建、部署与发布。
2. 首版引入 Spring Cloud Gateway 作为统一入口，承担路由、鉴权前置、跨域、限流和请求 ID。
3. 服务间通过 OpenFeign 与 RabbitMQ 事件协作，禁止跨服务直连数据库；数据一致性走“本地事务 + Outbox + 事件 + 对账”。
4. 首版使用 Elasticsearch 做全文和结构化检索，不引入向量数据库和 Embedding 链路；AI 语义检索列为 P1。
5. 首版使用单 PostgreSQL 实例，每服务独立 schema，不做读写分离、分库分表；通过索引、分页和归档控制规模。
6. RabbitMQ 使用持久化消息、最大 3 次重试和死信处理；首版不依赖延迟队列插件。
7. 本地和 test 使用 Docker Compose 启动全部服务与基础设施；生产首版按单节点多容器部署设计，Kubernetes 延后评估。
8. RuoYi 作为独立管理平台运行，管理角色与普通用户角色分离；兼容性必须在项目初始化阶段验证。
9. XXL-JOB Admin 独立部署，首版只配置一个执行器组；任务必须支持幂等、失败记录和手动重试。
10. 服务间调用必须配置超时、重试与熔断降级，并携带 requestId 与调用方身份，便于链路追踪与审计。

## 12. 单人开发的企业级最低线

单人开发不降低以下要求：

- 代码通过自动构建、测试、依赖扫描和密钥扫描后才能进入 `test`。
- 核心业务数据每天备份，每月至少恢复演练一次。
- 生产配置、密钥和用户数据与开发环境隔离。
- AI 具备固定评测集、剧透测试、安全拒答和成本限制。
- 发布有版本记录、已知问题、回滚步骤和责任人。
- 运行指标至少覆盖登录、首页、搜索、AI、数据库、缓存、消息和定时任务。
- 任何新服务拆分必须先证明能够降低复杂度或提高故障隔离能力。
