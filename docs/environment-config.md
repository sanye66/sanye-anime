# sanye_anime 环境配置矩阵

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v2.7 |
| 文档状态 | 基线（环境变量与中间件连接唯一基准） |
| 唯一基准 | 是（环境变量、连接配置） |
| 关联文档 | [数据库设计](./database-design.md)、[安全设计](./security-design.md)、[部署说明](../sanye_deploy/README.md)、[CI/CD](./ci-cd.md) |
| 更新时间 | 2026-08-25 |

## 1. 环境分层

| 环境 | 用途 | 中间件 | 说明 |
| --- | --- | --- | --- |
| local（本地联调） | 日常开发 | PG 5433、Redis 6379 本地 | `run-local.ps1` 默认静态服务发现；Nacos/Sentinel 关闭 |
| dev（集成） | 持续集成/联调 | Docker Compose 网络 | 应用容器使用 `nacos:8848`；宿主机启动的 Java 服务不能直接复用容器内 gRPC 注册端口 |
| test（验收） | 发布前验收 | 完整中间件 | CI 门禁通过后部署 |
| prod（生产） | 正式运行 | 完整中间件 + TLS | 发布门禁通过；域名与证书（GAP-014） |

## 2. 后端环境变量（sanye_server）

### 2.1 数据与中间件

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| DB_URL | jdbc:postgresql://localhost:15432/sanye_anime | 本地联调覆盖为 5433；Docker 宿主机默认端口为 15432 |
| DB_USERNAME | sanye | 数据库账号 |
| DB_PASSWORD | 123456 | Docker 本地开发默认值；生产环境变量注入，禁止入库 |
| REDIS_HOST / REDIS_PORT / REDIS_USERNAME / REDIS_PASSWORD | 127.0.0.1 / 6379 / default / 空 | `run-local.ps1` 的本地 Redis；Docker 宿主机默认为 16379 / sanye / 123456，容器内部仍为 6379 |
| POSTGRES_HOST_PORT / REDIS_HOST_PORT | 15432 / 16379 | Docker 宿主机映射端口，可按机器占用情况覆盖 |
| RABBITMQ_HOST_PORT / MINIO_HOST_PORT | 15672 / 9001 | RabbitMQ 管理台和 MinIO 控制台宿主机端口；业务端口 `5672/9000` 仅在容器网络内使用 |
| KIBANA_HOST_PORT | 5601 | Kibana 8.17 控制台宿主机映射端口；ES `9200` 仅提供 REST API；每个对外暴露的中间件只映射一个宿主机端口 |
| XXL_JOB_MYSQL_USER / XXL_JOB_MYSQL_PASSWORD / XXL_JOB_MYSQL_ROOT_PASSWORD | sanye / 123456 / 123456 | `full` profile 的 XXL-JOB MySQL 应用账号、应用密码和 root 密码，仅限本地开发 |
| MINIO_USER / MINIO_PASSWORD | sanye / 12345678 | MinIO root 账号；MinIO 强制密码至少 8 位，因此不能使用统一的 6 位开发密码 |
| DOCKER_MIRROR | docker.m.daocloud.io | Docker Hub 基础镜像国内镜像源；生产环境按部署网络覆盖 |
| DOCKER_SPECIAL_MIRROR | dockerproxy.net | Sentinel 等非基础镜像国内镜像源；生产环境按部署网络覆盖 |
| NACOS_AUTH_TOKEN | 本地 Base64 占位值 | Nacos 3.x 必填认证 token；本地默认值仅用于开发，生产必须由密钥管理注入 |
| NACOS_AUTH_IDENTITY_KEY / VALUE | sanye_anime_local / sanye_anime_local_value | Nacos 3.x 必填内部身份校验字段；生产必须覆盖 |
| NACOS_ENABLED | false | 宿主机静态联调关闭；完整应用容器部署时打开 |
| NACOS_SERVER_ADDR / USERNAME / PASSWORD | nacos:8848 / 空 | 仅适用于 Docker 服务网络；Nacos Console 宿主机入口为 `http://localhost:8080/`，宿主机应用保持静态发现，避免把 Console 端口误当 API/gRPC 端口 |
| SENTINEL_ENABLED | false | Sentinel 限流开关 |
| MANAGEMENT_PORT | 8090 | 网关独立管理端口（prometheus） |

### 2.2 Docker 中间件连接矩阵

以下是 `sanye_deploy/compose.yaml` 与 [configure-middleware.ps1](../sanye_deploy/configure-middleware.ps1) 的本地开发默认配置。宿主机应用使用“宿主机地址”，Compose 内部服务使用“容器网络地址”。密码是本地占位值，禁止直接用于生产环境。

| 中间件 | 宿主机地址 | 容器网络地址 | 数据库/用途 | 用户名 | 密码 | 认证说明 |
| --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL 16.4 | `localhost:15432` | `postgres:5432` | `sanye_anime` | `sanye` | `123456` | 启用密码认证 |
| Redis 7.4 | `localhost:16379` | `redis:6379` | 缓存、额度和会话 | `sanye` | `123456` | Redis ACL；`default` 用户关闭 |
| RabbitMQ 4.1 | 管理台 `http://localhost:15672` | AMQP `rabbitmq:5672` | 消息队列 | `sanye` | `123456` | 管理员，默认 vhost `/` |
| Elasticsearch 8.17 | REST `http://localhost:9200` | `http://elasticsearch:9200` | 搜索和 RAG | 无 | 无 | 本地关闭认证 |
| Kibana 8.17 | `http://localhost:5601` | `http://kibana:5601` | Elasticsearch 控制台 | 无 | 无 | 本地关闭认证 |
| MinIO | 控制台 `http://localhost:9001` | S3 API `http://minio:9000` | 对象存储 | `sanye` | `12345678` | root 账号；密码至少 8 位 |
| Nacos 3.0.3 | Console `http://localhost:8080/` | API `http://nacos:8848`，gRPC `nacos:9848` | 服务注册与配置 | 无 | 无 | 本地关闭登录认证；身份 token 仅供 Nacos 内部校验 |
| Sentinel 1.8.8 | `http://localhost:8858` | `sentinel:8858` | 限流控制台 | 无 | 无 | 本地关闭登录认证 |
| XXL-JOB MySQL 8.4.5 | 不暴露宿主机端口 | `xxl-job-mysql:3306` | `xxl_job` | `sanye` | `123456` | 应用用户；root 密码同为 `123456` |
| XXL-JOB Admin 3.1.0 | `http://localhost:18080/` | `xxl-job-admin:8080` | 调度管理台 | `sanye` | `123456` | 管理台账号存储在 `xxl_job_user` |

PostgreSQL 宿主机 JDBC 地址为 `jdbc:postgresql://localhost:15432/sanye_anime`；容器内 JDBC 地址为 `jdbc:postgresql://postgres:5432/sanye_anime`。Redis 宿主机连接使用 `localhost:16379`、用户 `sanye`、密码 `123456`；容器内连接使用 `redis:6379`。XXL-JOB MySQL 只在 Compose 网络中使用，不应从宿主机直接连接。

### 2.3 统一脚本配置方式

Docker 引擎启动后，使用以下脚本完成完整环境启动、已有数据卷账号密码同步、权限配置和连接验证：

```powershell
pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\configure-middleware.ps1
```

脚本默认配置就是上表中的 `sanye` 账号和本地开发密码；最小环境使用 `-Profile minimal`。修改已有数据卷中的密码时，应同时提供旧凭据，例如：

```powershell
pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\configure-middleware.ps1 `
  -PostgresPassword '新密码' `
  -CurrentRedisPassword '旧 Redis 密码' `
  -XxlJobMysqlRootPassword '新 MySQL root 密码' `
  -CurrentXxlJobMysqlRootPassword '旧 MySQL root 密码' `
  -ForceRecreate
```

脚本参数只注入当前 PowerShell 进程，不会把密码写入仓库；配置完成后会输出 Compose 状态，并验证 PostgreSQL、Redis、RabbitMQ、MinIO、XXL-JOB MySQL 连接以及 Elasticsearch、Kibana、Nacos、Sentinel、XXL-JOB 管理入口。

### 2.4 各服务配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| CATALOG_STORE / CATALOG_SCHEMA | pg / sanye_anime | 作品目录存储（pg/memory）与 schema |
| LEGAL_STORE / LEGAL_SCHEMA | pg / sanye_anime | 法律正文存储与 schema |
| MEDIA_STORE / MEDIA_SCHEMA | pg / sanye_anime | 剧集媒体元数据存储与 schema |
| MEDIA_IMPORT_ALLOWED_HOSTS | yhdmtv.cc,www.yhdmtv.cc | 授权来源 HTTPS 域名白名单，逗号分隔 |
| MEDIA_IMPORT_TIMEOUT_MS / MAX_BYTES / MAX_EPISODES | 30000 / 2097152 / 20 | 来源 HTML 读取超时、最大大小和单次最大剧集数 |
| HOME_CACHE_ENABLED / TTL / EMPTY_TTL | true / 300 / 30 | 首页缓存：开关、TTL 秒、空值 TTL 秒 |
| AI_PROVIDER | dev | dev（本地模拟）/ openai（在线） |
| AI_API_KEY / AI_BASE_URL / AI_MODEL / AI_TEMPERATURE | 见下方“AI 供应商实测配置” | OpenAI 兼容模型配置（密钥仅环境注入，不入仓库） |
| AI_MEMORY_STORE | pg | 记忆存储（pg/memory） |
| AI_CONVERSATION_STORE / SCHEMA | pg / sanye_ai_chat | 会话存储与 schema |
| AI_PREFERENCE_STORE / SCHEMA | pg / sanye_ai_chat | 偏好存储与 schema |
| AI_COST_INPUT_CENTS_PER_1K / AI_COST_OUTPUT_CENTS_PER_1K | 0.12 / 0.36 | AI 输入/输出每千 token 成本，单位为人民币分；用于管理端成本统计 |
| AI_POOL_CORE / MAX / QUEUE | 4 / 8 / 64 | AI 生成线程池 |
| QUOTA_STORAGE | redis | 额度存储（redis/memory） |
| ES_HOST / ES_INDEX / RAG_TOP_K | http://127.0.0.1:9200 / sanye_anime / 3 | ES 搜索与 RAG |
| SANYE_SEARCH_EXTERNAL_BASE | https://yhdmtv.cc/search/index.html?keyword= | 外部搜索页面模板；仅用于解析和校验用户粘贴的搜索 URL |
| SANYE_SEARCH_EXTERNAL_RESULTS_BASE | https://yhdmtv.cc/public/auto/search1.html?keyword= | 外部搜索公开动态结果接口模板；服务端只读取公开候选元数据 |
| MANAGE_ALLOWED_CALLER | sanye-admin-server | 受控接口调用方名称（仅作附加校验） |
| SANYE_MANAGE_TOKEN | 空（本地脚本自动注入） | 受控管理接口共享令牌；生产必须使用外部密钥管理并轮换 |
| CAS_SERVER_URL | http://localhost:8095 | CAS 服务器地址（dev 指向本地 Mock CAS，正式替换真实 CAS） |
| AUTH_TOKEN_SECRET | sanye-local-jwt-secret-2026 | 本地会话 JWT 密钥（生产必须覆盖） |
| AUTH_ACCESS_TTL_SECONDS | 1800 | access token 有效期（秒） |
| AUTH_SCHEMA | sanye_auth | auth 服务 schema |
| FILE_STORAGE_DIR | sanye_deploy/.local/files | 文件存储目录 |
| FAVORITE_SCHEMA / FEEDBACK_SCHEMA / FILE_SCHEMA | 对应服务名 | 各服务 schema（配置项，本地可忽略） |

## 3. 管理端环境变量（sanye_admin_server）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| SANYE_ADMIN_DATASOURCE_URL / USERNAME / PASSWORD | 15432 sanye / 123456 | RuoYi Docker 数据源；独立本地联调仍由 `run-local.ps1` 覆盖为 5433，数据库默认 `sanye_admin` |
| SANYE_ADMIN_DATASOURCE_DB | sanye_admin | `import-middleware-data.ps1` 创建管理平台独立数据库时使用；应用 JDBC URL 仍通过 `SANYE_ADMIN_DATASOURCE_URL` 指定 |
| SANYE_ADMIN_DRUID_USERNAME / PASSWORD | 空 | Druid 监控账号（生产启用） |
| SANYE_ADMIN_REDIS_HOST / PORT / USERNAME / PASSWORD | 127.0.0.1 / 16379 / sanye / 123456 | RuoYi Docker Redis；独立本地联调由 `run-local.ps1` 覆盖为 6379 / default / 空密码 |
| SANYE_ADMIN_TOKEN_SECRET | sanye-dev-secret-2026-local-only | JWT 密钥（本地默认；生产必须覆盖） |
| SANYE_ADMIN_UPLOAD_PATH | 空 | RuoYi 上传目录 |
| SANYE_AI_SERVICE_URL | http://localhost:8084 | ai-chat 服务地址（仪表盘统计） |
| SANYE_ANIME_SERVICE_URL | http://localhost:8082 | anime 服务地址（内容/官网正文代理） |
| SANYE_FEEDBACK_SERVICE_URL | http://localhost:8087 | feedback 服务地址 |

## 2.5 中间件实际数据导入

统一配置入口会在健康检查、账号权限同步和管理入口验证之后，自动调用 [import-middleware-data.ps1](../sanye_deploy/import-middleware-data.ps1)。数据导入脚本可单独重复执行，不删除数据卷，并使用 PostgreSQL `public.sanye_deploy_migration` 记录服务迁移版本和 checksum。

| 中间件 | 导入内容 | 当前验证结果 | 说明 |
| --- | --- | --- | --- |
| PostgreSQL `sanye_anime` | anime/auth/ai-chat/favorite/file/feedback/job/search 8 个 schema 的 `V*.sql` | 6 部正式作品、4 篇法律正文、22 条迁移记录、21 条文件元数据 | 业务库与管理库分离；V3 历史种子经 V7 清理、V8 元数据规范化后，当前运行库仅保留《你的名字》和无职转生各独立篇章 |
| PostgreSQL `sanye_admin` | RuoYi 管理表和 Quartz 表 | 2 个管理用户、92 个菜单、Quartz 表已创建 | 管理库首次导入时执行，已有表无标记时不会执行包含 `DROP TABLE` 的初始化脚本 |
| Elasticsearch | `sanye_anime` 索引和作品搜索文档 | 6 条正式作品文档 | 文档由 PostgreSQL 当前正式作品数据生成，可重复 bulk 覆盖；重建前清理旧文档 |
| Redis | `sanye:home:home:FEATURED/LATEST/POPULAR` 和导入版本键 | 3 个首页缓存键 | Redis 是运行时缓存，TTL 过期后由服务回源刷新 |
| MinIO | `sanye-anime/covers/*` 封面对象 | 21 个对象、21 条 `sanye_file` 元数据 | 同步到本地文件服务目录，避免当前文件服务仍使用本地存储时出现元数据孤儿 |
| Nacos | `sanye-common.yaml`、8 个业务服务 YAML、网关 YAML | COMMON_GROUP 1 条、BUSINESS_GROUP 9 条，共 10 条 | Nacos API 仅通过 `nacos:8848` 容器网络访问；实例由服务运行时注册 |
| RabbitMQ | `sanye.events` topic 交换机、`sanye.events.audit` 持久队列和 `#` 绑定 | 拓扑存在、消息数 0 | 当前代码没有真实消费者和发布者，不导入伪造消息 |
| XXL-JOB | 管理员、执行器组、调度锁 | 用户 1、执行器组 1、业务任务 0 | 当前项目没有真实 XXL-JOB 任务，不创建会自动执行的任务 |

重复导入命令：

```powershell
pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\import-middleware-data.ps1
```

仅运行最小中间件时使用 `-Profile minimal`；仅同步账号而不导入项目数据时使用 `configure-middleware.ps1 -SkipDataImport`。生产环境不得使用文档中的本地开发凭据，生产对象、配置和任务必须经过发布审批与备份流程。

## 4. 前端环境变量

### 4.1 sanye_client（客户端 + 官网）

| 变量 | local | prod | 说明 |
| --- | --- | --- | --- |
| VITE_API_BASE_URL | /api/v1 | /api/v1 | 网关 API 前缀（同源代理） |
| VITE_GATEWAY_URL | 空 | 空 | 资源（covers 等）网关地址（空 = 同源） |
| VITE_CAS_LOGIN_URL | http://localhost:8443/cas/login | https://cas.sanye.example/cas/login | CAS 登录地址 |

本地同源由 Vite proxy 实现（`/api`、`/covers` → http://localhost:8091）；生产由 nginx 代理（client.conf）。Nacos Console 保留 `http://localhost:8080/`，不与网关共用端口。

### 4.2 sanye_admin（管理平台）

| 变量 | local | 说明 |
| --- | --- | --- |
| VITE_API_BASE_URL | http://localhost:8091/api/v1 | 网关 API（跨源，CORS 允许 localhost） |
| VITE_GATEWAY_URL | http://localhost:8091 | 网关地址 |
| VITE_ADMIN_LOGIN_URL | /login | 登录页 |

## 5. 密钥与安全配置

- 密钥类变量（AI_API_KEY、DB_PASSWORD、SANYE_ADMIN_TOKEN_SECRET、SANYE_MANAGE_TOKEN）只经环境注入，`.env*` 不入库。

### AI 供应商实测配置（2026-08-21，硅基流动 OpenAI 兼容模式）

- 供应商：硅基流动（OpenAI 兼容模式），模型 `Qwen/Qwen2.5-7B-Instruct`（温度 0.7）。
- 环境变量：`AI_PROVIDER=openai`、`AI_BASE_URL=https://api.siliconflow.cn/v1/`、
  `AI_MODEL=Qwen/Qwen2.5-7B-Instruct`、`AI_API_KEY=<SiliconFlow API Key>`。
- 密钥位置：仅写入本机**用户级环境变量**（`[Environment]::SetEnvironmentVariable('AI_API_KEY', …, 'User')`），
  未写入仓库任何文件；ai-chat 进程从环境读取，日志与 model-info 接口不返回密钥。
- 联调证据：重启 ai-chat 后 `GET /api/v1/ai/model-info` 返回
  `provider=openai / model=Qwen/Qwen2.5-7B-Instruct`；直连模型接口返回 HTTP 402（账号余额/额度不足），
  项目 SSE 返回 `message.failed` 与 `4001`，浏览器 AI 工作区展示失败/重试状态且服务不崩溃。
- 生产必须覆盖本地默认值（如 token secret、trust 认证、验证码关闭），发布前核对
  release-management 发布检查清单与 security-design §6。
- 服务间凭证（MANAGE_ALLOWED_CALLER）生产升级为轮换令牌。
- 成本费率必须按供应商正式价目表覆盖 `AI_COST_INPUT_CENTS_PER_1K` 与
  `AI_COST_OUTPUT_CENTS_PER_1K`；未覆盖时仅适用于本地联调，不代表正式账单。

## 6. 配置一致性校验

- 新增/修改环境变量后同步本表，并在 document-review 登记。
- 本地启动环境变量由 [run-local.ps1](../sanye_deploy/run-local.ps1) 统一设置；
  Docker 环境见 [compose.yaml](../sanye_deploy/compose.yaml) 与 images.lock。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v1.0 | 建立环境配置基线：环境分层、后端/管理端/前端变量、密钥规则 | 企业级文档完善 |
| 2026-08-21 | v1.1 | 补齐硅基流动真实模型配置、HTTP 402 外部阻塞和文档一致性约束 | 真实联调结果、GAP-006 |
| 2026-08-21 | v1.2 | 登记 XXL-JOB full profile 的 MySQL 密码变量，并同步 Compose 自包含部署规则 | T-B-03、sanye_deploy/compose.yaml |
| 2026-08-21 | v1.3 | 登记国内 Docker 镜像源变量，并同步 Compose 与镜像锁定清单 | T-B-03、国内镜像拉取验证 |
| 2026-08-21 | v1.4 | 登记 Nacos 3.x 必填身份参数，并记录 WSL2/国内镜像下的 full profile 验证 | T-B-03 本地运行验收 |
| 2026-08-21 | v1.5 | 统一 Docker 中间件账号和开发密码，调整 PostgreSQL/Redis 宿主机端口，并登记 MinIO 八位密码限制 | Docker 端口与凭据实测 |
| 2026-08-21 | v1.6 | 为 Redis 增加 sanye ACL 用户，并同步业务服务和管理端的 username 配置 | Redis ACL 实测 |
| 2026-08-21 | v1.7 | 增加 Nacos 3.x 独立控制台映射和 Kibana 8.17 控制台端口 | Nacos/Kibana Compose 配置与端口实测 |
| 2026-08-21 | v1.8 | 收口为每个中间件只映射一个宿主机端口，Nacos 控制台改用 `8848/nacos/index.html` | Compose 端口配置与重启验证 |
| 2026-08-21 | v1.9 | 将 RabbitMQ 和 MinIO 的唯一宿主机端口调整为管理控制台端口 | 控制台访问验证 |
| 2026-08-21 | v2.0 | 将 XXL-JOB 管理台初始化账号统一为 `sanye/123456` | XXL-JOB 登录验证 |
| 2026-08-21 | v2.1 | 将 Nacos Console 宿主机入口恢复为默认 `8080/`，API 8848 仅保留容器网络访问 | Nacos Console 日志与 HTTP 验证 |
| 2026-08-21 | v2.2 | 增加统一中间件配置脚本、完整连接矩阵、已有数据卷账号密码同步和连接验证说明 | `configure-middleware.ps1` 脚本与本地实测 |
| 2026-08-21 | v2.3 | 增加媒体元数据存储、来源白名单、导入限制配置 | 媒体导入评审与实现设计 |
| 2026-08-21 | v2.3 | 增加项目数据实际导入脚本、PostgreSQL/ES/Redis/MinIO/Nacos/RabbitMQ/XXL-JOB 导入结果和重复执行规则 | `import-middleware-data.ps1` 实际执行与中间件数量校验 |
| 2026-08-21 | v2.4 | 统一本机网关为 8091，保留 Nacos Console 8080，并补充本机静态发现与 Docker 中间件联调边界 | `run-local.ps1`、Vite 代理和 Compose 端口核对 |
| 2026-08-24 | v2.5 | 将当前 PostgreSQL/Elasticsearch 数据基线收口为 6 部正式作品，明确 V3 历史种子与 V7/V8 当前清理结果 | `V7__remove_demo_test_catalog.sql`、`V8__normalize_official_catalog_metadata.sql`、作品接口实测 |
| 2026-08-25 | v2.6 | 登记外部搜索页面与动态结果接口模板配置，明确只读取公开候选元数据 | `application.yml`、搜索服务测试、直连/网关搜索实测 |
| 2026-08-25 | v2.7 | 将公开媒体导入单页读取默认超时调整为 30 秒，匹配外部来源连续页面读取场景 | `sanye-server-anime/application.yml`、动漫服务测试、网关导入实测 |
