# sanye_deploy

这是部署辅助目录，不属于三个核心业务工程，负责本地和测试基础设施、固定版本镜像、环境模板、备份恢复脚本、发布检查和回滚流程。

XXL-JOB 索引任务配置以 [环境配置矩阵](../docs/environment-config.md) 为准。`verify-index-job.mjs` 使用本机既有 PostgreSQL、Elasticsearch 和 XXL-JOB 管理台，每次新建专用数据库、索引和不自动调度的任务，启动临时搜索与 job 实例并在结束时退出。运行前准备 `sanye_deploy/.local/tr03/build` 中当前源码构建的 search/job JAR，注入 `TR03_ADMIN_USER`、`TR03_ADMIN_PASSWORD`、`XXL_JOB_ACCESS_TOKEN`；`TR03_SOURCE_URL` 可指定只读作品来源，不设置时使用合成目录。脚本固定使用本机测试端口 18082、18083、18088、19999，端口冲突时须先调整验收环境；证据写入 `.local/tr03`，不提交凭据与运行产物。完整结果见 [开发任务清单](../docs/development-tasks.md)。

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.13 |
| 文档状态 | 基线，本地部署与可分享作品导入入口已同步 |
| 更新时间 | 2026-09-10 |
| 更新记录 | 2026-09-10：新增 T-R-06 候选镜像、配置绑定与实例核验入口，依据任务记录；保留既有恢复与敏感配置边界 |

T-R-06 发布工具位于 `release/`，以 [CI/CD](../docs/ci-cd.md#t-r-06-候选镜像与实例核验) 和[环境矩阵](../docs/environment-config.md#t-r-06-候选构建与受控配置) 为唯一操作与配置基准。`pnpm test:release` 执行安全门禁回归；`node sanye_deploy/release/smoke-local.mjs` 在固定运行镜像下使用现有网关 JAR 和客户端 dist 创建专用容器及网络，验证健康、非 root、页面与代理后清理本次运行资源，保留本地镜像和 `.local/tr06` 报告。此冒烟不创建候选提交、不连接业务数据库、不推送注册表，也不启动桌宠；运行前须按环境矩阵指定两个镜像变量。

敏感配置以 [环境矩阵](../docs/environment-config.md#t-r-05-环境与启动校验) 为准。`pnpm test:sensitive-config` 执行扫描器回归；`pnpm security:config-scan` 扫描工作区和本地可达 Git 历史。日志及产物使用 `node sanye_deploy/scan-sensitive-config.mjs --history --log <日志目录> --artifact <JAR> --artifact-mode first-party --output <脱敏报告>`；归档检查需要 Java 21，自研模式逐项记录排除的第三方 JAR。未决候选或读取错误返回非零。

`node sanye_deploy/verify-sensitive-startup.mjs` 使用当前 gateway/admin JAR 验证缺失及占位凭据拒绝、随机密钥注入后网关健康状态与日志脱敏；结束时停止本次进程，证据写入 `.local/tr05/startup`。`SANYE_VERIFY_JAVA` 可指定 Java 21 可执行文件。本地入口显式使用 `SANYE_ENV=local`，其他环境须注入对应凭据；本项不连接生产库或轮换真实凭据。

独立恢复入口：`recovery.mjs backup|verify|restore <配置文件> <备份目录>`；PowerShell 使用 `backup-local.ps1 -Config <配置> -OutputDirectory <新目录>`、`restore-local.ps1 -Config <配置> -BackupDirectory <目录>`。参数化配置见 [环境矩阵](../docs/environment-config.md#独立恢复配置)，完整操作、停写前提、失败现场及指标口径见 [独立恢复说明](../docs/backup-recovery.md)。旧单库脚本已替换，不再删除原数据库或自动清理旧备份。测试入口为 `pnpm test:recovery`，隔离真实演练为 `node sanye_deploy/verify-recovery-live.mjs`。

先执行 `pnpm install --frozen-lockfile` 安装包含 MinIO SDK 的工具依赖。V2 清单补齐对象属性、标签和 identity 序列；V1 仅允许只读校验，完整恢复前需生成 V2。真实演练先使用 Flyway 建立源库，备份后停止源数据库和对象服务，再启动恢复目标进行应用验收，保留空值作品回归和中途恢复失败的现场证据。

2026-09-09 更新（v1.6）：本机 RabbitMQ 额外映射 AMQP 5672，连接和开关见 [环境矩阵](../docs/environment-config.md)。使用 `run-local.ps1 -Infrastructure docker` 启动服务；客户端使用 `pnpm dev:client-only` 可排除桌宠。

可靠事件验收入口：`node sanye_deploy/verify-reliable-events.mjs <专用合成作品编号> <阶段>`。阶段包含 `baseline`、`cache`、`disconnect`、`enqueue`、`restart-check`、`exhaust`、`consumer-failure`。必须使用标题以 `sanye_tr02_` 开头的专用作品。故障阶段会停止并恢复本机指定 RabbitMQ 或 ES 容器，不能对共享生产实例执行。`enqueue` 后由操作者重启 anime/search，再运行 `restart-check`。死信回放保留原队列消息供复核，不清空队列；JSON 证据在 `.local/tr02`，不提交凭据、数据库或日志产物。

当前状态（T-B-03 本地运行验收完成，2026-08-21）：

- `compose.yaml` 已初始化：PostgreSQL 16、Redis 7.4、RabbitMQ 4.1、Elasticsearch 8.17、Kibana 8.17、MinIO、Nacos 3.0.3、Sentinel 1.8.8、XXL-JOB Admin 3.1.0 及其 MySQL 8.4.5 数据库，均含健康检查与持久化卷；国内镜像地址登记在 `images.lock`。
- Nacos、Kibana、Sentinel、XXL-JOB 和 XXL-JOB MySQL 通过 `--profile full` 按需启动（最小环境只需 PostgreSQL、Redis、RabbitMQ、Elasticsearch、MinIO）。
- Redis 健康检查使用容器内 `REDIS_PASSWORD`，XXL-JOB 不再依赖宿主机 MySQL；完整 profile 可在新机器上独立启动。
- 默认使用 DaoCloud 国内镜像，Sentinel 使用 `dockerproxy.net`；可通过 `DOCKER_MIRROR` 和 `DOCKER_SPECIAL_MIRROR` 覆盖镜像源。
- `full` profile 提供五个管理入口：MinIO `http://localhost:9001`、RabbitMQ `http://localhost:15672`、Nacos Console `http://localhost:8080/`、Kibana `http://localhost:5601`、XXL-JOB `http://localhost:18080/`；Elasticsearch `http://localhost:9200` 仍是 REST API，不是可视化页面。
- 已使用国内镜像完成 `full` profile 镜像拉取；10 个容器全部 healthy，Nacos/Sentinel/XXL-JOB/Kibana 对外端口返回 200；保留数据卷重启后 10 个容器仍全部 healthy，XXL-JOB 初始化数据保持完整。
- `configure-middleware.ps1` 是中间件统一配置入口：会启动 Compose、同步已有数据卷中的账号密码与权限，调用数据导入脚本，并验证数据库、ACL、管理台和 REST 入口；脚本不会删除数据卷。
- 业务服务本机联调使用 `run-local.ps1`。由于 Nacos Console 固定占用宿主机 `8080`，本机网关默认使用 `8091`；脚本会先检查 PostgreSQL `5433` 实际监听状态，并只检查网关/管理端自身端口，不把未启动的下游服务误判为启动失败。连接 Docker 已导入数据时执行 `pwsh -File .\sanye_deploy\run-local.ps1 -Infrastructure docker -Restart`。
- Docker 中间件联调模式使用静态服务发现，连接 PostgreSQL `15432`、Redis `16379` 和 Elasticsearch `9200`；Nacos 动态注册需要将业务服务部署到 Compose 网络，不能在只暴露 Console 单端口的宿主机模式下伪装开启。
- `import-middleware-data.ps1` 是可单独重跑的数据导入入口；当前实测已导入 8 个业务 PostgreSQL schema、独立管理库、6 条正式 ES 作品文档、3 个 Redis 首页缓存键、21 个 MinIO 封面对象/元数据、10 条 Nacos 配置和 RabbitMQ 项目事件拓扑。正式片库仅保留 `127`《你的名字》和 `128/133/135/136/137` 无职转生各独立篇章。
- Docker 默认宿主机端口为 PostgreSQL `15432`、Redis `16379`、RabbitMQ 管理台 `15672`、Elasticsearch `9200`、Kibana `5601`、MinIO 控制台 `9001`、Nacos Console `8080`、Sentinel `8858`、XXL-JOB `18080`；每个对外暴露的中间件只映射一个宿主机端口。RabbitMQ AMQP `5672`、MinIO 对象 API `9000`、Nacos API/gRPC `8848/9848` 和 XXL-JOB MySQL 只在容器网络内使用；本机网关固定使用 `8091`，不再与 Nacos Console 冲突。
- 本地联调脚本默认沿用进程中的 `AI_PROVIDER`；未配置时使用 `dev` 模拟模型。使用 Docker 已导入数据时执行 `run-local.ps1 -Infrastructure docker`，它连接 PG `15432`、Redis `16379` 和 ES `9200`，但仍使用静态服务发现；动态 Nacos 注册需要把业务服务部署到 Compose 网络。
- 开发环境口令为占位值，禁止用于任何非本地环境。

## 当前核对（2026-09-10）

当前发布候选工具已存在于 `sanye_deploy/release/`，流程见[CI/CD](../docs/ci-cd.md)，状态为 T-R-06 进行中。完整业务环境与实际回滚尚未验收。启动脚本不自动启动 Mock CAS；本地登录地址与配置步骤见[环境矩阵](../docs/environment-config.md)，当前保障范围见[审计](../docs/current-status-audit.md)。

更新记录：2026-09-10，v1.13，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 一键配置脚本

`setup-docker.ps1` 一键完成：管理员提权 → 检查虚拟化 → 启用 WSL2 功能（需要时）→ 更新 WSL 内核并设置默认版本 2 → 启动 Docker Desktop → 等待引擎 → 拉起中间件并等待健康检查 → 汇总结果。

运行方式（任选其一）：

```powershell
# 使用 PowerShell 7（pwsh；脚本含 UTF-8 中文与现代 .NET 进程参数）
pwsh -ExecutionPolicy Bypass -File .\setup-docker.ps1
```

可选参数：`-SkipDockerDesktop`（引擎已运行时跳过启动）、`-FullProfile`（同时启动 Nacos/Kibana/Sentinel/XXL-JOB）。

Docker 引擎就绪后，使用统一配置脚本完成所有中间件配置：

```powershell
pwsh -ExecutionPolicy Bypass -File .\configure-middleware.ps1
```

脚本默认使用完整 `full` profile；只启动 PostgreSQL、Redis、RabbitMQ、Elasticsearch 和 MinIO 时使用：

```powershell
pwsh -ExecutionPolicy Bypass -File .\configure-middleware.ps1 -Profile minimal
```

脚本会配置 PostgreSQL、Redis ACL、RabbitMQ 管理权限、MinIO root 账号、XXL-JOB MySQL 应用用户和 XXL-JOB 管理台管理员，随后默认执行 `import-middleware-data.ps1`，把项目迁移、种子、索引、缓存、对象、Nacos 配置和基础队列拓扑写入中间件，并检查 Elasticsearch、Kibana、Nacos、Sentinel 等无登录服务。已有数据卷改密码时，使用对应的 `CurrentRedisPassword` 或 `CurrentXxlJobMysqlRootPassword` 参数提供旧密码；完整参数和连接矩阵见 [环境配置矩阵](../docs/environment-config.md)。

### 项目数据导入

统一配置脚本会自动导入。只需要重复导入数据时执行：

```powershell
pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\import-middleware-data.ps1
```

导入脚本使用 `public.sanye_deploy_migration` 记录业务迁移版本和 checksum，重复执行不会重复创建表或重复插入种子。管理平台数据库为 `sanye_admin`，业务数据库为 `sanye_anime`。导入脚本只初始化历史基础拓扑和种子，不自动创建调度任务；T-R-02 事件拓扑由应用声明，T-R-03 执行器需显式启用，任务由受控管理台配置。服务实例由应用启动后动态注册到 Nacos。

仅启动最小 profile 时，使用 `-Profile minimal`；此模式跳过 Nacos 和 XXL-JOB 数据导入。配置阶段如需只配置不导入数据，使用 `configure-middleware.ps1 -SkipDataImport`。

### 作品元数据和封面一键导入

`import-anime.mjs` 接收一个或多个公开作品详情页、搜索页或分类页 URL，读取 HTML 中的标题、简介、年份、标签和公开详情模板封面信息，登录 RuoYi 管理端，上传封面并创建或更新作品。搜索页会自动展开 `/p/` 详情链接；脚本只处理作品元数据和封面，不访问 `/v/` 播放地址。脚本默认创建“草稿”，确认来源授权和内容正确后再传 `--publish`。

```powershell
$env:SANYE_ADMIN_PASSWORD = 'admin123'
pnpm import:anime -- 'https://yinghuadongman.org.cn/p/52685/' --publish
```

不传 URL 时脚本会提示粘贴地址；发给别人使用时，可把 `import-anime.env.example` 复制为 `import-anime.env` 后填写管理端地址、账号和密码，再执行同一条命令。只想检查页面能否解析时追加 `--dry-run`，不会登录、上传封面或写库。原有 `--url` 可重复参数仍保留：

```powershell
node .\sanye_deploy\import-anime.mjs `
  --url 'https://yinghuadongman.org.cn/u/?wd=无职转生' `
  --url 'https://yinghuadongman.org.cn/p/52685/' `
  --continue-on-error
```

批量导入建议使用 `--continue-on-error`。详情页单条失败会继续后续 URL，完成后以非零退出码提示重试；封面 CDN 单条失败只输出警告并保留作品元数据，更新已有作品时不会清空原有站内封面。

默认管理 API 为 `http://localhost:8091/api/v1/admin`，账号默认 `admin`；可用 `--admin-url`、`--username`、`--password` 覆盖。来源和封面域名必须命中脚本白名单，未登记的授权图片 CDN 使用 `--allow-host` 显式追加。脚本只导入公开元数据和封面，不下载、转码、缓存、代理视频，也不会绕过登录、验证码、DRM、Referer 或访问控制。

目标站点首页是壳页面时，脚本会拒绝创建通用首页记录；请改传其公开搜索页或每部作品的详情页。当前验证的 `https://www.yinghco.com.cn/zh-cn/app.html` 通过 iframe 展示 `yinghuadongman.org.cn` 的公开目录，搜索“无职转生”可发现 13 个条目，搜索“你的名字”可发现 2 个同名条目和 1 个无关相似标题；实际导入时应使用搜索页或明确的详情页，避免把相似标题误导入。

凭据配置：compose 中的用户名/密码全部由环境变量注入（缺省开发占位值）。可通过脚本参数或环境变量设置：

```powershell
.\setup-docker.ps1 -PostgresUser admin -PostgresPassword 'xxx' `
                   -RedisPassword 'xxx' -RabbitmqUser admin -RabbitmqPassword 'xxx' `
                   -MinioUser admin -MinioPassword 'xxx'
```

对应环境变量：`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`、`POSTGRES_HOST_PORT`、`REDIS_USERNAME`、`REDIS_PASSWORD`、`REDIS_HOST_PORT`、`RABBITMQ_USER`、`RABBITMQ_PASSWORD`、`RABBITMQ_HOST_PORT`、`MINIO_USER`、`MINIO_PASSWORD`、`MINIO_HOST_PORT`、`XXL_JOB_MYSQL_USER`、`XXL_JOB_MYSQL_PASSWORD`、`XXL_JOB_MYSQL_ROOT_PASSWORD`、`NACOS_AUTH_TOKEN`、`NACOS_AUTH_IDENTITY_KEY`、`NACOS_AUTH_IDENTITY_VALUE`、`KIBANA_HOST_PORT`。默认账号均为 `sanye`；RabbitMQ 管理台使用 `sanye / 123456`，MinIO 控制台使用 `sanye / 12345678`，PostgreSQL、Redis、XXL-JOB MySQL 和 XXL-JOB 管理台使用 `sanye / 123456`。Elasticsearch、Kibana、Nacos Console、Sentinel 当前按本地开发配置关闭登录认证；Nacos API 仅在容器网络内提供。首次创建由 Compose 初始化，已有数据卷的账号密码和权限由 `configure-middleware.ps1` 原地同步；不要在未备份时使用 `docker compose down -v`。

退出码：`0` 完成；`2` Docker 引擎或中间件启动失败；`3` 已启用新 Windows 功能，需要重启电脑后再次运行。

前提：CPU 虚拟化已开启（虚拟机需开嵌套虚拟化，物理机需在 BIOS 开启 Intel VT-x / AMD-V），否则 WSL2/Docker 无法启动。

版本基线：[../docs/version-baseline.md](../docs/version-baseline.md)
