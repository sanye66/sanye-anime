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
├── sanye_core                     模块化单体核心应用
├── sanye_auth                     账户与权限模块
├── sanye_anime                    动漫内容模块
├── sanye_search                   搜索模块
├── sanye_ai_chat                  AI 对话模块
├── sanye_file                     文件模块
├── sanye_feedback                 反馈模块
└── sanye_job                      任务模块

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

项目基线使用 Java 21、Node.js 22 LTS 和 pnpm 10.15.0。目前 `sanye_client`、`sanye_admin` 和 `sanye_server` 都有独立的工程入口；业务实现和基础设施联动仍在开发中。

## 文档目录

项目命名和入口规则定义在 [AGENTS.md](AGENTS.md)。

产品文档：

- [产品文档目录](product/README.md)
- [产品总体架构](product/overall-architecture.md)
- [产品需求文档](product/product-requirements.md)
- [功能详细说明](product/feature-specification.md)

工程文档：

- [工程文档目录](docs/README.md)
- [开发计划](docs/development-plan.md)
- [技术架构](docs/technical-architecture.md)
- [版本基线](docs/version-baseline.md)
- [项目流程图](docs/project-flow.md)
- [决策记录](docs/decision-log.md)
- [差距登记表](docs/gap-register.md)
- [开发待办事项](docs/development-todo.md)

## 当前状态

- Vue 客户端和 RuoYi 管理平台前端骨架已经初始化。
- Spring 服务端已具备内存 MVP 接口，覆盖作品、搜索、AI 会话、收藏、反馈和管理端状态操作。
- `sanye_admin_server` 已使用 JDK 21 完成 `mvn clean package -DskipTests=true` 构建；真实 PostgreSQL、Redis 启动、管理端登录和前端接口绑定仍未验收。
- 业务后端持久化、正式认证、AI 供应商、基础设施联动和 CI 工作流尚未接通。
- 剩余外部依赖和实现门禁记录在 [docs/gap-register.md](docs/gap-register.md)。

## 管理后端本地启动

先创建 PostgreSQL 数据库和 Redis，再执行：

```powershell
psql -d sanye_admin -f sanye_admin_server/sql/sanye_admin_schema.sql
psql -d sanye_admin -f sanye_admin_server/sql/sanye_admin_quartz_schema.sql

$env:JAVA_HOME='C:\Users\10121\.jdks\microsoft-jdk-21.0.12'
$env:SANYE_ADMIN_DATASOURCE_URL='jdbc:postgresql://localhost:5432/sanye_admin'
$env:SANYE_ADMIN_DATASOURCE_USERNAME='sanye_admin'
$env:SANYE_ADMIN_DATASOURCE_PASSWORD='replace-me'
$env:SANYE_ADMIN_REDIS_HOST='localhost'
$env:SANYE_ADMIN_REDIS_PORT='6379'
$env:SANYE_ADMIN_TOKEN_SECRET='replace-with-a-long-random-secret'

mvn -f sanye_admin_server/pom.xml spring-boot:run -pl sanye_admin_app -am
```

初始化脚本和运行参数仅适用于开发环境示例，生产环境必须使用独立密钥和受控配置。
