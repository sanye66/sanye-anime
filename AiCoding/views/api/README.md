# API 视图入口

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线：接口清单待扩展 |
| 更新时间 | 2026-08-26 |

## 当前公共入口

| 领域 | 入口 | 实现 |
| --- | --- | --- |
| 系统探针 | `/api/v1/system/ping`、`/api/v1/system/capabilities` | `sanye-server-web` |
| CAS | `/api/v1/auth/cas/*` | `sanye-server-auth` |
| 文件 | `/api/v1/files/*` | `sanye-server-file` |
| 搜索 | `/api/v1/search/*` | `sanye-server-search` |
| 反馈 | `/api/v1/feedback/*`、管理反馈 | `sanye-server-feedback`、管理后端代理 |
| 管理内容 | `/anime/*`、`/dashboard/*`、`/legal/*` | `sanye_admin_server` |

完整字段、错误码和鉴权要求以 `docs/api-contract.md` 和 `contracts/openapi/sanye-anime.openapi.yaml` 为准；新增接口必须同步契约、调用方和测试证据。
