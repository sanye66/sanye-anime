# sanye_admin

这是项目的 RuoYi 管理平台工程，面向内部运营，包含内容管理、审核发布、用户反馈、AI 运营、任务管理、权限和审计。

这是三个核心工程中的 RuoYi 管理平台工程，采用 RuoYi-Vue 兼容的 Vue 3 和 Element Plus 前端。它与 `sanye_client` 分开构建，面向内部运营人员；登录、权限、内容、反馈、任务、用户和审计页面已按本地网关接口接通，仍有依赖外部基础设施的生产能力需要在部署环境验收。

## 常用命令

```bash
pnpm --filter @sanye/sanye_admin install
pnpm --filter @sanye/sanye_admin dev
pnpm --filter @sanye/sanye_admin build
```

默认本地地址为：`http://localhost:5175`。官网公开页面属于 `sanye_client`，不单独占用本工程端口。

## 当前范围

- 仪表盘与运营指标页面。
- 内容管理、审核发布和官网正文编辑页面。
- AI 运营、用户反馈、任务、用户和审计页面。
- Vue Router、Pinia 和 Element Plus 入口。
- 内容、反馈、任务和审计路由按 RuoYi 权限边界控制可见性和操作权限。

产品范围：[../product/overall-architecture.md](../product/overall-architecture.md)
