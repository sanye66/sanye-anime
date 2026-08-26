# sanye_anime 当前视图入口

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线 |
| 更新时间 | 2026-08-26 |

`views/` 是从 `product/`、`docs/` 和源码派生的当前视图，不替代唯一事实源。

| 目录 | 入口 |
| --- | --- |
| `api/` | API 路径、鉴权和响应边界 |
| `architecture/` | 三端架构和模块依赖 |
| `business/` | 内容、AI、账户和运营规则 |
| `database/` | schema、迁移和数据生命周期 |
| `domain/`、`domains/` | 领域边界和各业务域 |
| `flows/` | 用户、内容、AI 和发布流程 |
| `frontend/` | 客户端、官网、管理端和桌宠前端 |

新增视图必须在 `index/provenance-map.md` 登记来源。
