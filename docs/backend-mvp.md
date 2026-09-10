# sanye_server 后端实现与验证边界

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.3 |
| 文档状态 | 基线 |
| 关联文档 | [版本基线](./version-baseline.md)、[开发任务清单](./development-tasks.md) |
| 更新时间 | 2026-09-10 |

> 状态说明（2026-09-09）：本文记录当前实现和本地联调边界。早期内存 MVP 设计已被 PostgreSQL、Redis、CAS 本地 Mock、受控管理接口和安全过滤器实现替代；可靠业务事件已在受控 Compose 环境完成发布、更新、下架、断连恢复、死信和补偿验收，证据见 [开发任务清单](./development-tasks.md)。

## 当前核对（2026-09-10）

当前后端已通过业务 291 项和管理 23 项测试，详见[审计](./current-status-audit.md)。真实事件与调度的受控完成证据分别归 T-R-02/03，完整目标环境启动、真实 CAS/AI 和发布回滚仍未验收。

更新记录：2026-09-10，v0.3，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 1. 文档目的

本文档记录当前 `sanye_server` 的可运行后端范围。它描述工程实现和验证边界，不替代 `product/` 中的产品需求文档，也不把外部环境验收误记为已完成。

## 2. 当前实现

`sanye_server` 按网关和业务服务拆分，当前主要模块如下：

| 模块 | 当前能力 | 当前数据形态 |
| --- | --- | --- |
| `sanye_core` | 统一响应、请求 ID、跨域、参数校验和异常处理 | 无状态 |
| `sanye_anime` | 作品列表、筛选、详情、排期、官网内容和管理 CRUD | PostgreSQL，已完成本地联调 |
| `sanye_ai_chat` | 会话/消息、SSE、额度、记忆、偏好、剧透安全、推荐和 RAG | PostgreSQL/Redis；ES 已完成本地联调，正式模型受供应商额度约束 |
| `sanye_favorite` | 当前用户收藏、历史和归属隔离 | PostgreSQL，已完成本地联调 |
| `sanye_feedback` | 用户提交、查询和受控管理处理 | PostgreSQL，已完成本地联调 |
| `sanye_file` | 登录上传、图片白名单和所有者私有下载 | 当前落本地磁盘；MinIO 数据面已导入验证，应用适配与扫描仍待实现 |
| `sanye_search` | Elasticsearch 搜索、索引和 RAG 适配 | ES 已完成本地索引/命中验证，不可用时按契约降级 |
| `sanye_gateway` | 路由、CORS、请求 ID、JWT 和统一错误 | 8091 本地联调已验证；8080 为历史端口 |

当前代码已具备本地认证、持久化、权限和降级闭环；正式 CAS、生产凭据、外部中间件、版权和发布环境仍未完成。

## 3. 接口范围

接口统一使用 `/api/v1` 前缀，成功响应包含 `code`、`message`、`data` 和 `requestId`。请求可以通过 `X-Request-Id` 传入请求标识；未传入时由服务端生成。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/v1/system/ping` | 检查服务是否运行 |
| `GET` | `/api/v1/system/capabilities` | 查看当前 MVP 能力 |
| `GET` | `/api/v1/anime` | 获取已发布作品 |
| `GET` | `/api/v1/search?keyword=` | Elasticsearch 搜索已发布作品 |
| `GET` | `/api/v1/anime/{animeId}` | 查看已发布作品详情 |
| `GET` | `/api/v1/ai/conversations` | 查看当前用户会话 |
| `POST` | `/api/v1/ai/conversations` | 创建 AI 会话 |
| `POST` | `/api/v1/ai/conversations/{conversationId}/messages` | 发送 AI 问题 |
| `GET` | `/api/v1/users/me/favorites` | 查看收藏 |
| `POST` | `/api/v1/users/me/favorites/{animeId}` | 添加收藏 |
| `DELETE` | `/api/v1/users/me/favorites/{animeId}` | 取消收藏 |
| `POST` | `/api/v1/feedback` | 提交用户反馈 |
| `GET` | `/api/v1/admin/anime` | 管理端查看全部作品 |
| `PATCH` | `/api/v1/admin/anime/{animeId}/status` | 修改作品状态 |
| `GET` | `/api/v1/admin/feedback` | 管理端查看全部反馈 |
| `PATCH` | `/api/v1/admin/feedback/{feedbackId}` | 修改反馈状态（body：`{status}`） |

网关只在我方 JWT 校验通过后注入 `X-User-Id`，匿名请求不能伪造该头；文件接口绑定登录用户所有权。服务间管理接口还要求 `X-Internal-Token`，生产令牌必须由外部密钥管理。

## 4. 启动与验证

工程基线统一为当前本机 Java 21.0.12、Maven 3.9.16。新工具链验证结果以 [开发任务清单](./development-tasks.md) 为准，历史联调记录不替代本轮验证。推荐使用本地 PostgreSQL 5433、Redis 6379 和部署脚本启动服务：

```powershell
$env:JAVA_HOME='C:\Users\10121\.jdks\microsoft-jdk-21.0.12'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn spring-boot:run
```

启动后访问：

```text
http://localhost:8091/api/v1/system/ping
```

## 5. 明确的实现限制

- Elasticsearch 搜索/RAG、MinIO 对象导入和 Nacos 配置数据面已完成本地 Docker 验证；可靠业务事件已接入 RabbitMQ 生产者/消费者和 Outbox，XXL-JOB 已接入索引重建执行器及 RuoYi 管理整合（T-R-03）；动态 Nacos 应用注册和完整应用容器部署已有核验脚本，真实目标实例验收仍待环境。
- 正式 CAS、生产数据库/Redis 凭据、AI 供应商成本上限和正式 SLO 尚未完成。
- 正式动漫数据、图片来源、版权授权、法律文案和官网域名/TLS 尚未完成。
- 发布环境的备份恢复、签名升级、回滚和多机性能验收尚未完成。

## 6. 后续替换顺序

1. 将业务服务、管理端和网关加入 Compose 网络，完成动态 Nacos 注册与容器内路由验证。
2. 替换正式 CAS、生产凭据和受控服务间令牌，完成安全与发布门禁。
3. 在目标环境复验已有 RabbitMQ 事件生产者/消费者、XXL-JOB 执行器任务；MinIO 文件扫描和监控采集按各自出口补充验收。
4. 完成授权内容、法律文案、备份恢复和正式发布回滚演练。

## 更新记录

2026-09-09，v0.2：可靠事件本地验收完成，引用 T-R-02，保留其他业务和正式环境差距。

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-09-09 | v0.1 | 统一当前本机 Java/Maven 基线与启动命令，保留历史验证边界 | 用户确认、[版本基线](./version-baseline.md) |
