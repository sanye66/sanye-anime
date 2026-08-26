# sanye_anime

sanye_anime 是一个面向 PC Web 的动漫发现产品，核心能力是 AI 动漫助手。

项目按技术框架划分为三个核心工程：`sanye_server`（Spring）、`sanye_client`（Vue）和 `sanye_admin`（RuoYi）。产品上分为 `sanye_anime` 客户端、`official` 官网和 RuoYi 管理平台；`official` 不是独立技术工程，公开页面属于 `sanye_client` 的页面和路由范围。

## 功能范围

### sanye_anime（客户端产品，技术工程为 sanye_client）

- 精选、新番、剧场版浏览。
- Banner、热门榜单和番剧排期。
- 动漫搜索和作品详情。
- AI 动漫问答和找番推荐。
- 剧情问题、角色资料和观看顺序引导。
- 避免剧透和允许剧透模式。
- 流式回答、停止和重新生成。
- 可跳转到作品详情的推荐卡片。
- 会话历史、重命名、归档和删除。
- 收藏、浏览记录、偏好、反馈和隐私控制。
- `official` 官网公开首页、产品介绍、法律信息和 `sanye_anime` 客户端入口页面。

### sanye_server（Spring 工程）

- 账户、动漫内容、搜索、AI 对话、文件、反馈和定时任务模块。
- Spring Boot、Spring Cloud Alibaba 和中间件集成边界。
- Spring Boot 启动类、Maven 构建入口和模块包骨架已经建立。

### sanye_admin（RuoYi 管理平台工程）

- 仪表盘页面骨架。
- 动漫内容审核和发布页面骨架。
- 用户反馈与 AI 反馈运营页面骨架。
- RuoYi 权限、任务和审计边界。

管理平台后端已经独立接入到 `sanye_admin_server/`，与业务后端 `sanye_server/` 分开构建。当前已完成 RuoYi 模块接入、Java 包名迁移、PostgreSQL 初步适配、Redis/Token 环境变量配置和 Quartz JDBC 配置。

## 三个核心工程入口

| 工程 | 技术框架 | 目录 | 本地地址或构建入口 |
| --- | --- | --- | --- |
| `sanye_server` | Spring Boot / Spring Cloud Alibaba | `sanye_server/` | Maven，Java 21，使用 `mvn spring-boot:run` |
| `sanye_client` | Vue 3 / TypeScript / Vite | `sanye_client/` | `http://localhost:5173`，`pnpm dev:client` |
| `sanye_admin` | RuoYi / Vue 3 / Element Plus | `sanye_admin/` | `http://localhost:5175`，`pnpm dev:admin` |

`official` 官网公开页面属于 `sanye_client`，不单独占用端口。`sanye_website/` 是早期独立官网骨架的迁移过渡目录，当前不参与根工作区构建。

## 工程结构

```text
sanye_server                       Spring 工程
├── sanye-server-core              共享库（统一响应/错误码/请求 ID/日志脱敏）
├── sanye-server-gateway           网关（路由/鉴权前置/限流）
├── sanye-server-auth              账户与权限服务
├── sanye-server-anime             动漫内容服务
├── sanye-server-search            搜索服务
├── sanye-server-ai-chat           AI 对话服务
├── sanye-server-favorite          收藏服务
├── sanye-server-file              文件服务
├── sanye-server-feedback          反馈服务
└── sanye-server-job               任务服务

sanye_client                       Vue 工程
├── sanye_anime 客户端页面：首页、搜索、作品详情、AI、我的
└── official 官网页面：公开首页、产品介绍、法律信息、客户端入口

sanye_admin                        RuoYi 工程
├── 内容管理与审核
├── 用户与反馈
├── AI 运营
├── 任务管理
└── 权限与审计

sanye_deploy                       部署辅助目录
```

## 常用命令

```bash
pnpm install
pnpm typecheck
pnpm build
```

Docker 中间件统一配置：

```powershell
pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\configure-middleware.ps1
```

统一配置脚本默认会继续执行项目数据导入；只导入数据可执行 `pwsh -ExecutionPolicy Bypass -File .\sanye_deploy\import-middleware-data.ps1`。完整地址、容器网络地址、用户名、密码、改密参数和数据数量见 [环境配置矩阵](docs/environment-config.md)；Docker 启动说明见 [sanye_deploy README](sanye_deploy/README.md)。

项目基线使用 Java 21、Node.js 22 LTS 和 pnpm 10.15.0。目前 `sanye_client`、`sanye_admin` 和 `sanye_server` 都有独立的工程入口；本地业务实现与基础设施联动已完成验证，正式环境仍需完成 CAS、版权、法律文案、域名和真实 AI 额度验收。

## 文档目录

项目命名和入口规则定义在 [AGENTS.md](AGENTS.md)。

产品文档：

- [产品文档目录](product/README.md)
- [产品总体架构](product/overall-architecture.md)
- [产品需求文档](product/product-requirements.md)
- [功能详细说明](product/feature-specification.md)
- [页面状态矩阵](product/page-state-matrix.md)
- [MVP 冻结清单](product/mvp-freeze.md)
- [桌宠产品需求](product/desktop-companion-requirements.md)

工程文档：

- [工程文档目录](docs/README.md)
- [开发计划](docs/development-plan.md)
- [桌宠开发计划](docs/desktop-companion-development-plan.md)
- [技术架构](docs/technical-architecture.md)
- [详细技术设计](docs/technical-design.md)
- [开发任务清单](docs/development-tasks.md)
- [版本基线](docs/version-baseline.md)
- [项目流程图](docs/project-flow.md)
- [原型评审记录](docs/prototype-review.md)
- [全量文档评审记录](docs/document-review.md)
- [接口与字段契约](docs/api-contract.md)
- [按板块开发与测试方案](docs/module-dev-test-plan.md)
- [全系统监控方案](docs/monitoring-design.md)
- [决策记录](docs/decision-log.md)
- [差距登记表](docs/gap-register.md)
- [开发待办事项](docs/development-todo.md)

## 当前状态

- 前置门禁（原型评审、状态矩阵、MVP 冻结、管理平台原型、产品文档冻结、技术设计、任务拆分、首个任务分支）和 T-B-02 自动检查门禁已关闭，当前进入外部环境、发布验收与代码质量收口阶段。
- Vue 客户端和 RuoYi 管理平台前端骨架已经初始化。
- 后端按微服务架构建设（[docs/decision-log.md](docs/decision-log.md) D-024），前端与全部工程纳入首版（D-025）：网关 + 8 个业务服务 + RuoYi 管理端；`sanye_client`（客户端+官网）与 `sanye_admin` 统一经网关对接（T-B-08）；Maven 多模块骨架（core/web/gateway + 8 服务）已按 T-B-05 完成并构建通过。
- `sanye_admin_server` 已使用 JDK 21 完成 `mvn clean package -DskipTests=true` 构建；Docker PostgreSQL、Redis、RabbitMQ、Elasticsearch、Kibana、MinIO、Nacos、Sentinel 和 XXL-JOB 已通过统一脚本完成本地配置与连接验证。
- 业务后端持久化、正式认证、AI 供应商额度和生产级基础设施安全配置仍按 [docs/gap-register.md](docs/gap-register.md) 登记，不能把本地开发凭据当作生产配置。
- 剩余外部依赖和实现门禁记录在 [docs/gap-register.md](docs/gap-register.md)。

## 管理后端本地启动

先创建 PostgreSQL 数据库和 Redis，再执行：

```powershell
psql -d sanye_admin -f sanye_admin_server/sql/sanye_admin_schema.sql
psql -d sanye_admin -f sanye_admin_server/sql/sanye_admin_quartz_schema.sql

$env:JAVA_HOME='C:\Users\10121\.jdks\microsoft-jdk-21.0.12'
$env:SANYE_ADMIN_DATASOURCE_URL='jdbc:postgresql://localhost:15432/sanye_admin'
$env:SANYE_ADMIN_DATASOURCE_USERNAME='sanye'
$env:SANYE_ADMIN_DATASOURCE_PASSWORD='123456'
$env:SANYE_ADMIN_REDIS_HOST='localhost'
$env:SANYE_ADMIN_REDIS_PORT='16379'
$env:SANYE_ADMIN_REDIS_PASSWORD='123456'
$env:SANYE_ADMIN_TOKEN_SECRET='replace-with-a-long-random-secret'

mvn -f sanye_admin_server/pom.xml spring-boot:run -pl sanye_admin_app -am
```

初始化脚本和运行参数仅适用于开发环境示例，生产环境必须使用独立密钥和受控配置。
