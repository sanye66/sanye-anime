# AiCoding 来源映射

| 目标视图 | 当前来源 | 证据状态 |
| --- | --- | --- |
| `views/domain-overview.md` | `product/overall-architecture.md` | 基线 |
| `views/frontend/README.md` | `sanye_client/`、`sanye_admin/`、`sanye_pet/`、`product/page-state-matrix.md` | 基线/待环境混合 |
| `views/api/README.md` | `docs/api-contract.md`、服务端 Controller | 基线，契约仍需扩展 |
| `views/architecture/README.md` | `docs/technical-architecture.md`、`sanye_server/pom.xml` | 基线 |
| `views/database/README.md` | `docs/database-design.md`、`sanye_server/**/db/migration` | 基线 |
| `system/engineering-bootstrap.md` | 根 README、POM、各 package.json | 基线 |
| `ledger/S001-bootstrap.md` | 本次目录迁移审计 | 草案 |

## 规则

新视图必须记录至少一个真实源码或唯一事实源。只有聊天内容、临时日志和外部推测不能作为当前事实来源。
