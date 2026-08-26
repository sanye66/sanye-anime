# sanye_anime 检索指南

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线 |
| 更新时间 | 2026-08-26 |

## 最小读取集

| 任务 | 首先读取 | 继续读取 |
| --- | --- | --- |
| 新会话或陌生模块 | `CONTENTS.md`、`views/concepts.md`、`system/engineering-bootstrap.md` | 对应工程入口 |
| 产品页面 | `product/feature-specification.md`、`product/page-state-matrix.md` | `views/frontend/` |
| API | `docs/api-contract.md`、`views/api/README.md` | `contracts/openapi/sanye-anime.openapi.yaml`、源码 Controller |
| 数据库 | `docs/database-design.md` | `views/database/README.md`、迁移 SQL |
| AI | `product/product-requirements.md`、`docs/ai-evaluation.md` | `views/ai/README.md`（建立后）和 `sanye-server-ai-chat` |
| 媒体导入 | `docs/anime-import.md`、`docs/media-player-development.md` | `views/domains/media.md` |
| 管理端 | `docs/ruoyi-admin-backend.md` | `views/frontend/admin-platform.md`、管理端 Controller |
| 发布或提交 | `policy/agent-workflow-policy.md`、`policy/document-status-policy.md` | `docs/release-readiness.md`、`docs/gap-register.md` |

## 读取约束

- 先读索引和摘要，再按任务读取局部文件。
- 超过 20 KB 的文件使用 `rg` 定位章节，不在主会话整文件复制。
- 历史 Ledger 只能用于解释变化，不能覆盖当前事实文档。
- 发现冲突时记录来源和日期，按 `policy/conflict-resolution.md` 裁决。
