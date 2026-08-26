# AiCoding 迁移说明

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线：迁移边界说明 |
| 更新时间 | 2026-08-26 |

## 1. 来源与范围

本目录的目录分层、会话启动顺序、Ledger/View/Policy 关系和文档治理方式参考 `C:\Users\10121\IdeaProjects\AlphaFactory\AiCoding`。源目录共 1,336 个文件，包含 AlphaFactory 专属的历史需求、接口、数据库、部署和验收证据。

## 2. 不直接复制的内容

以下内容不能作为 `sanye_anime` 的当前事实，因此没有原样迁移：

- AlphaFactory 的历史 Ledger、内部运行报告、旧测试报告和路径证据。
- `zlt-*`、`zltaf_*`、`zlt-official` 专属模块、路由、表名和 OpenAPI 示例。
- 内部 IP、SSH 路径、供应商账号、测试密钥、数据库密码和真实环境参数。

这些内容若对迁移有参考价值，必须先在目标代码和目标文档中找到证据，再登记为新的 sanye_anime Ledger。禁止使用批量字符串替换制造看似完整但不真实的历史。

## 3. 目标事实边界

当前事实以以下入口为准：

- 产品范围：`product/`
- 工程、接口、环境和质量门禁：`docs/`
- 服务端：`sanye_server/` 与 `sanye_admin_server/`
- 前端：`sanye_client/`、`sanye_admin/`、`sanye_pet/`
- 部署：`sanye_deploy/`

本目录中的状态使用“草案”“基线”“待环境”和“blocked-external”，不把源项目的完成记录转移到本项目。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-26 | v0.1 | 建立跨项目迁移边界并登记未复制的历史和敏感信息类型 | AlphaFactory AiCoding 目录审计 |
