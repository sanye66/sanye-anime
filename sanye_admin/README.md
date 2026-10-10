# sanye_admin

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 文档状态 | 基线 |
| 关联文档 | [当前审计](../docs/current-status-audit.md) |
| 更新时间 | 2026-09-10 |

这是项目的 RuoYi 管理平台工程，面向内部运营，包含内容管理、审核发布、用户反馈、AI 运营、任务管理、权限和审计。

这是三个核心工程中的 RuoYi 管理平台工程，采用 RuoYi-Vue 兼容的 Vue 3 和 Element Plus 前端。它与 `sanye_client` 分开构建，面向内部运营人员；登录、权限、内容、反馈、任务、用户和审计页面已按本地网关接口接通，仍有依赖外部基础设施的生产能力需要在部署环境验收。

## 当前核对（2026-09-10）

任务页已同时提供 RuoYi Quartz 和独立 XXL-JOB 索引任务入口，包含状态、受控触发、日志及权限边界。生产登录与调度依赖真实管理后端和调度平台配置；当前已验证和待环境范围见[审计](../docs/current-status-audit.md)。

更新记录：2026-09-10，v1.0，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

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
