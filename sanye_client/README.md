# sanye_client

这是项目的 Vue 前端工程，承载 `sanye_anime` 客户端和 `official` 官网两类路由。它是三个核心工程中的 Vue 工程，不与 `official` 另建技术项目。客户端提供作品详情、AI 对话、收藏和个人历史；官网页面提供产品介绍、公开信息、法律信息和客户端入口。

## 常用命令

```bash
pnpm --filter @sanye/sanye_client install
pnpm --filter @sanye/sanye_client dev
pnpm --filter @sanye/sanye_client build
```

默认本地地址：`http://localhost:5173`。

## 当前范围

- 带内容发现分区的首页骨架。
- 带会话列表、快捷问题和上下文面板的 AI 工作区骨架。
- 带账户和个人数据占位内容的我的页面骨架。
- `official` 公开首页、产品介绍和法律信息页面属于本工程的公开页面范围。
- Vue Router 和 Pinia 入口。

`sanye_server` 已提供内存 MVP 接口，但本工程的页面尚未接通真实服务端数据。`official` 页面仍然由本工程的路由和视图承载。

产品范围：[../product/overall-architecture.md](../product/overall-architecture.md)
