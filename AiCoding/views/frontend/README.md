# 前端视图入口

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线 |
| 更新时间 | 2026-08-26 |

| 工程 | 承载范围 | 事实入口 |
| --- | --- | --- |
| `sanye_client` | `sanye_anime` 客户端和 `official` 官网页面、路由 | `product/page-state-matrix.md`、`docs/project-flow.md` |
| `sanye_admin` | RuoYi 内容、反馈、任务、权限和审计页面 | `docs/ruoyi-admin-backend.md`、源码路由 |
| `sanye_pet` | Windows 桌宠显示、唤起客户端和轻量交互 | `product/desktop-companion-requirements.md` |

前端状态必须覆盖 loading、空数据、失败、无权限和成功；页面不得自行决定用户权限、AI 额度或发布状态。
