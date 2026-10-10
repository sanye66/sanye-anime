# sanye_server

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 文档状态 | 基线 |
| 关联文档 | [当前审计](../docs/current-status-audit.md) |
| 更新时间 | 2026-09-10 |

这是项目的 Spring 服务端微服务工程，负责账户、动漫内容、搜索、AI 对话、文件、反馈和定时任务。

## 当前核对（2026-09-10）

当前使用 Java 21.0.12 / Maven 3.9.16。业务事件与 XXL-JOB 索引重建已有实现和受控验收；缺失关键配置会在启动早期拒绝，不能只执行打包命令就认为可启动。环境注入见[配置矩阵](../docs/environment-config.md)，当前验证和运行缺口见[审计](../docs/current-status-audit.md)。

更新记录：2026-09-10，v1.0，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 工程定位

- 框架：Spring Boot、Spring Cloud Alibaba。
- 运行形态：微服务（D-024），网关 + 8 个业务服务，单 PostgreSQL 按服务独立 schema。
- 基础设施边界：Nacos、Sentinel、RabbitMQ、PostgreSQL、Elasticsearch、Redis、MinIO 和 XXL-JOB。
- Java 包根：`com.sanye.anime`。
- 应用入口：各服务独立 `*ServiceApplication`（auth 8081 / anime 8082 / search 8083 / ai-chat 8084 / favorite 8085 / file 8086 / feedback 8087 / job 8088），网关 `GatewayApplication` 容器内部默认 8080，本机联调由 `run-local.ps1` 映射为 8091。

## 目录结构

```text
sanye_server/
├── pom.xml
├── sanye-server-core/          # 统一响应、错误码、AuthContext、脱敏
├── sanye-server-web/           # 请求 ID、全局异常、Feign 基线、JDBC 共享
├── sanye-server-gateway/       # 网关：路由、CORS、请求 ID（容器 8080，本机联调 8091）
├── sanye-server-auth/          # 账户与权限、系统接口、前端错误上报（8081）
├── sanye-server-anime/         # 动漫内容：作品/首页/详情/官网公开接口（8082）
├── sanye-server-search/        # 搜索（8083，Elasticsearch 已完成本地联调）
├── sanye-server-ai-chat/       # AI 对话：SSE、LangChain4j、额度、推荐（8084）
├── sanye-server-favorite/      # 收藏与历史（8085）
├── sanye-server-file/          # 文件（8086）
├── sanye-server-feedback/      # 反馈（8087）
└── sanye-server-job/           # 任务（8088）
```

各服务默认通过 `lb://` 服务名路由，配合 Nacos 注册发现；本地联调无 Nacos 时使用
`application-local.yml`（SimpleDiscoveryClient 静态实例）或 `--spring.profiles.active=dev`
（网关静态 URI 路由）。

## 常用命令

```bash
mvn -f sanye_server/pom.xml install -DskipTests
.\sanye_deploy\run-local.ps1 -Infrastructure docker -Services gateway,auth,anime,ai-chat -Restart
.\sanye_deploy\smoke-local.ps1
```

联调环境变量：`DB_URL=jdbc:postgresql://localhost:5433/sanye_anime`、`DB_USERNAME=sanye`、
`DB_PASSWORD=123456`、`NACOS_ENABLED=false`、`SENTINEL_ENABLED=false`。Docker Compose 环境默认使用
PostgreSQL `15432`、Redis `16379`，账号为 `sanye`，密码为 `123456`；MinIO 因最低长度限制使用 `12345678`。
Nacos 注册与配置默认关闭，连接外部基础设施前通过环境变量显式开启；凭证只从环境变量或外部配置注入。

## 当前状态

- 多服务骨架、网关路由、共享 core/web、OpenFeign 基线与 Flyway 迁移已建立。
- 已联调接口：系统、首页、作品详情、官网公开接口、AI 会话与 SSE 流式（含推荐、停止、重生成、额度）。
- 本地认证（CAS Mock）、ES 搜索、会话持久化和 RAG 已完成本地联调；RabbitMQ 业务事件和 XXL-JOB 业务任务已完成受控验收，正式 CAS、真实模型额度以及目标环境动态 Nacos 注册仍待环境，具体限制见 [../docs/backend-mvp.md](../docs/backend-mvp.md)。
- Nacos、Sentinel、RabbitMQ、PostgreSQL、Elasticsearch、Redis、MinIO 和 XXL-JOB 的版本与验证门禁见 [../docs/version-baseline.md](../docs/version-baseline.md) 和 [../docs/gap-register.md](../docs/gap-register.md)。
