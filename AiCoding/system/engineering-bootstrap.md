# sanye_anime 工程启动上下文

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.2 |
| 文档状态 | 基线 |
| 更新时间 | 2026-09-09 |
| 关联文档 | [版本基线](../../docs/version-baseline.md)、[开发任务清单](../../docs/development-tasks.md) |
| 来源 | 根 `README.md`、`AGENTS.md`、`sanye_server/pom.xml`、各前端 `package.json` |

## 工程地图

```text
sanye-anime/
├── sanye_server/              # Spring Boot / Spring Cloud Alibaba，Java 21
├── sanye_admin_server/        # RuoYi 管理端后端，独立 Maven 工程
├── sanye_client/              # Vue 3 / TypeScript / Vite，客户端 + official
├── sanye_admin/                # RuoYi Vue 3 / Element Plus
├── sanye_pet/                  # Windows Electron 桌宠附属形态
├── sanye_deploy/               # Compose、启动和数据导入辅助脚本
├── e2e/                        # Playwright / Node E2E
├── product/                    # 产品唯一事实源
└── docs/                       # 工程唯一事实源
```

## 服务端模块

`sanye_server/pom.xml` 当前聚合：

- `sanye-server-core`：统一响应、错误码、请求 ID 和日志边界。
- `sanye-server-web`：公共 Web 能力和系统探针。
- `sanye-server-gateway`：网关、路由、鉴权前置和限流边界。
- `sanye-server-auth`：账户、CAS、会话和权限边界。
- `sanye-server-anime`：作品、剧集、媒体导入和封面元数据。
- `sanye-server-search`：站内索引和外部公开候选搜索。
- `sanye-server-ai-chat`：AI 会话、流式回答、记忆和额度。
- `sanye-server-favorite`：收藏、历史和偏好。
- `sanye-server-file`：文件和封面资源。
- `sanye-server-feedback`：反馈、举报和运营处理。
- `sanye-server-job`：任务边界和调度扩展。

管理后端 `sanye_admin_server/` 独立构建，不与业务服务共享运行时数据库或权限实现。

## 基线命令

```powershell
pnpm install
pnpm typecheck
pnpm build
pnpm docs:check
mvn -B -f sanye_server/pom.xml test
```

工具链统一为当前本机版本：Node.js 26.5.0（非 LTS）、pnpm 10.15.0、Java 21.0.12 和 Maven 3.9.16。端口、环境变量、外部 AI 额度和版权授权以 `docs/environment-config.md`、`docs/gap-register.md` 为准；本轮验证结果以 `docs/development-tasks.md` 为准。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-09-09 | v0.2 | 工程上下文统一为当前本机工具链，注明 Node.js 26.5.0 非 LTS 与验证入口 | 用户确认、[版本基线](../../docs/version-baseline.md) |
