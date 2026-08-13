# sanye_server 后端 MVP 实现说明

## 1. 文档目的

本文档记录当前 `sanye_server` 已完成的最小可运行后端范围。它描述工程实现和验证边界，不替代 `product/` 中的产品需求文档。

## 2. 当前实现

`sanye_server` 使用一个 Spring Boot 应用承载多个业务模块，当前已实现以下模块：

| 模块 | 当前能力 | 当前数据形态 |
| --- | --- | --- |
| `sanye_core` | 统一响应、请求 ID、跨域、参数校验和异常处理 | 无状态 |
| `sanye_anime` | 公开作品列表、搜索、详情、管理端状态修改 | 内存作品目录 |
| `sanye_ai_chat` | 会话列表、创建会话、发送问题和避免剧透分支 | 内存会话 |
| `sanye_favorite` | 当前用户收藏、添加收藏、取消收藏 | 内存集合 |
| `sanye_feedback` | 用户提交反馈、查看自己的反馈 | 内存列表 |
| `sanye_admin` | 管理端查看全部作品和反馈、修改状态 | 复用内存业务服务 |

当前实现的目标是让前后端可以先联调业务流程，不代表已经具备生产级认证、持久化、权限或 AI 模型接入能力。

## 3. 接口范围

接口统一使用 `/api/v1` 前缀，成功响应包含 `code`、`message`、`data` 和 `requestId`。请求可以通过 `X-Request-Id` 传入请求标识；未传入时由服务端生成。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/v1/system/ping` | 检查服务是否运行 |
| `GET` | `/api/v1/system/capabilities` | 查看当前 MVP 能力 |
| `GET` | `/api/v1/anime` | 获取已发布作品 |
| `GET` | `/api/v1/anime/search?keyword=` | 搜索已发布作品 |
| `GET` | `/api/v1/anime/{animeId}` | 查看已发布作品详情 |
| `GET` | `/api/v1/ai/conversations` | 查看当前用户会话 |
| `POST` | `/api/v1/ai/conversations` | 创建 AI 会话 |
| `POST` | `/api/v1/ai/conversations/{conversationId}/messages` | 发送 AI 问题 |
| `GET` | `/api/v1/users/me/favorites` | 查看收藏 |
| `POST` | `/api/v1/users/me/favorites/{animeId}` | 添加收藏 |
| `DELETE` | `/api/v1/users/me/favorites/{animeId}` | 取消收藏 |
| `GET` | `/api/v1/feedback` | 查看当前用户反馈 |
| `POST` | `/api/v1/feedback` | 提交用户反馈 |
| `GET` | `/api/v1/admin/anime` | 管理端查看全部作品 |
| `PATCH` | `/api/v1/admin/anime/{animeId}/status` | 修改作品状态 |
| `GET` | `/api/v1/admin/feedback` | 管理端查看全部反馈 |
| `PATCH` | `/api/v1/admin/feedback/{feedbackId}/status` | 修改反馈状态 |

MVP 阶段使用 `X-User-Id` 作为临时用户隔离标识，默认值为 `demo-user`。该方式只用于联调，不能作为正式登录方案。

## 4. 启动与验证

工程基线要求 Java 21 或更高版本、Maven 3.9.x。当前仓库配置默认关闭 Nacos 注册和配置，因此不启动外部中间件也可以验证内存 MVP。

```powershell
$env:JAVA_HOME='C:\Users\10121\.jdks\openjdk-26.0.2'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn spring-boot:run
```

启动后访问：

```text
http://localhost:8080/api/v1/system/ping
```

## 5. 明确的实现限制

- 重启服务会丢失作品状态、会话、收藏和反馈数据。
- 当前没有正式用户登录、令牌校验、RuoYi 权限校验和管理员角色校验。
- 当前 AI 返回为规则化演示文本，没有连接模型供应商、检索库或流式输出。
- 当前管理端接口没有接入审计记录、批量操作和状态机校验。
- 当前作品目录没有接入 PostgreSQL、Elasticsearch、MinIO 或内容来源审核流程。
- 当前 RabbitMQ、Redis、Nacos、Sentinel 和 XXL-JOB 只保留依赖与配置边界，尚未进入业务运行链路。

## 6. 后续替换顺序

1. 先接入 PostgreSQL 和数据库迁移，将内存作品、用户、收藏、会话和反馈替换为持久化仓储。
2. 接入正式身份认证和 RuoYi 权限，移除 `X-User-Id` 演示身份。
3. 为作品搜索接入 Elasticsearch，为热点查询和会话限流接入 Redis。
4. 为图片和文件接入 MinIO，为内容发布、索引和缓存刷新接入 RabbitMQ。
5. 接入 AI 模型、检索增强、剧透控制、额度和评测回归。
6. 接入 XXL-JOB、Nacos、Sentinel、日志指标和 CI 发布门禁。
