# sanye_admin

这是项目的 RuoYi 管理平台工程，面向内部运营，包含内容管理、审核发布、用户反馈、AI 运营、任务管理、权限和审计。

这是三个核心工程中的 RuoYi 管理平台工程，当前先建立 RuoYi-Vue 兼容的 Vue 3 和 Element Plus 前端骨架。它与 `sanye_client` 分开构建，面向内部运营人员；RuoYi 后端集成、权限服务和业务接口尚未接通。

## 常用命令

```bash
pnpm --filter @sanye/sanye_admin install
pnpm --filter @sanye/sanye_admin dev
pnpm --filter @sanye/sanye_admin build
```

默认本地地址为：`http://localhost:5175`。官网公开页面属于 `sanye_client`，不单独占用本工程端口。

## 当前范围

- 仪表盘骨架。
- 内容审核表格骨架。
- AI 和用户反馈骨架。
- Vue Router、Pinia 和 Element Plus 入口。
- 内容、反馈和仪表盘路由作为 RuoYi 菜单边界的前端占位。

产品范围：[../product/overall-architecture.md](../product/overall-architecture.md)
