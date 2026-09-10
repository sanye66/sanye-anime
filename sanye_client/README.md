# sanye_client

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 文档状态 | 基线 |
| 关联文档 | [当前审计](../docs/current-status-audit.md) |
| 更新时间 | 2026-09-10 |

这是项目的 Vue 前端工程，承载 `sanye_anime` 客户端和 `official` 官网两类路由。它是三个核心工程中的 Vue 工程，不与 `official` 另建技术项目。客户端提供作品详情、AI 对话、收藏和个人历史；官网页面提供产品介绍、公开信息、法律信息和客户端入口。

## 当前核对（2026-09-10）

仅启动 Web、不启动桌宠时使用根命令 `pnpm dev:client-only`；`pnpm dev:client` 会联动桌宠。登录需独立 Mock CAS 和对齐后的 Vite 配置，见[环境矩阵](../docs/environment-config.md)。静态页面、回退数据及 dev AI 不代表完整服务可用，当前证据见[审计](../docs/current-status-audit.md)。

更新记录：2026-09-10，v1.0，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 常用命令

```bash
pnpm --filter @sanye/sanye_client install
pnpm --filter @sanye/sanye_client dev
pnpm --filter @sanye/sanye_client build
```

默认本地地址：`http://localhost:5173`。

## 当前范围

- 带内容发现分区的首页，并通过客户端 API 加载排期、推荐和统计数据。
- 带会话列表、快捷问题和上下文面板的 AI 工作区，并通过 SSE 接收流式回答。
- 带账户、收藏和个人历史数据的我的页面。
- `official` 公开首页、产品介绍和法律信息页面属于本工程的公开页面范围。
- Vue Router 和 Pinia 入口。

客户端页面已接通 `sanye_server` 的 MVP 接口；在服务端不可用或返回空数据时，页面保留可识别的空态和本地演示数据。`official` 页面仍然由本工程的路由和视图承载。

产品范围：[../product/overall-architecture.md](../product/overall-architecture.md)
