# 数据库视图入口

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线 |
| 更新时间 | 2026-08-26 |

业务后端按服务划分 schema：`sanye_auth`、`sanye_anime`、`sanye_search`、`sanye_ai_chat`、`sanye_favorite`、`sanye_file`、`sanye_feedback` 和 `sanye_job`。管理端使用独立的 `sanye_admin` 数据库。

表、字段、迁移顺序和回滚规则以 `docs/database-design.md` 与各服务 `db/migration` 为准。本文不复制 AlphaFactory 的 `zltaf_*` 表，也不为尚未落地的领域虚构 DDL。
