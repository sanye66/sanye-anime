# AiCoding - sanye_anime Memory OS 文档入口

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 草案：按 AlphaFactory AiCoding 实例建立的 sanye_anime 初始记忆系统 |
| 适用范围 | `sanye_server`、`sanye_client`、`sanye_admin`、`official` 和 `sanye_pet` |
| 更新时间 | 2026-08-26 |
| 唯一事实源 | `product/`、`docs/` 与当前源代码；本目录负责检索、治理和历史追溯 |

本目录严格沿用实例的 Memory OS 分层：`Raw Ledger + Views + Policy`。实例中的 AlphaFactory 历史证据没有直接复制，因为其模块、接口、库表、环境和内部路径不属于本项目；迁移边界见 [MIGRATION-NOTICE.md](MIGRATION-NOTICE.md)。

## 1. Memory OS 架构

```text
Raw Ledger -> Derived Views -> Policy -> Commit -> Provenance
```

| 层级 | 目录 | 职责 |
| --- | --- | --- |
| Raw Ledger | `ledger/` | 追加记录 sanye_anime 的需求、决策、变更和证据 |
| Derived Views | `views/`、`design/` | 面向开发和推理的当前业务、架构、接口和数据视图 |
| Policy | `policy/` | 约束读取、写入、冲突解决和提交前检查 |
| Contracts | `contracts/` | 机器可读接口契约、示例和元数据 |
| System Context | `system/` | 工程启动、记忆恢复和遗留代码地图 |
| Retrieval Index | `index/` | 检索指南、来源映射和新鲜度统计 |
| Execution State | `plan/`、`development-plan/` | 当前执行计划、阶段门禁和验收记录 |

## 2. 会话启动顺序

1. `AiCoding/CONTENTS.md`
2. `AiCoding/index/retrieval-guide.md`
3. `AiCoding/views/concepts.md`
4. `AiCoding/system/engineering-bootstrap.md`
5. 按任务读取对应的 `views/`、`design/`、`policy/` 和 `contracts/`
6. 需要追溯历史时读取 `AiCoding/ledger/ledger-index.md` 和具体条目

大文件和历史证据必须遵守 `policy/retrieval-policy.md`。当前状态不得只引用历史报告；完成、验证和外部阻塞必须按 `policy/document-status-policy.md` 记录证据。

## 3. 当前有效入口

| 入口 | 用途 |
| --- | --- |
| `index/retrieval-guide.md` | 按任务类型选择最小上下文 |
| `index/freshness-report.md` | 文件统计、状态和治理待办 |
| `index/provenance-map.md` | 当前文档到产品、工程和源码的来源映射 |
| `views/frontend/README.md` | 客户端、官网、管理端和桌宠前端视图 |
| `views/api/README.md` | 当前真实 API 入口和契约状态 |
| `policy/agent-workflow-policy.md` | AI 编码会话读取、写入、验证和提交协议 |
| `system/memory-recovery.md` | 中断会话后的记忆恢复流程 |
| `contracts/README.md` | OpenAPI 和请求/响应示例入口 |

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-26 | v0.1 | 按 AlphaFactory AiCoding 的 Memory OS 分层建立 sanye_anime 初始入口和治理骨架 | 当前仓库 `README.md`、`AGENTS.md`、`product/`、`docs/` 与源码审计 |
