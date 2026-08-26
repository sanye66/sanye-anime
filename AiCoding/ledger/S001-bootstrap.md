# S001 AiCoding 初始迁移

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-08-26 |
| 状态 | 草案 |
| 触发 | 用户要求按 AlphaFactory AiCoding 实例建立 sanye-anime AiCoding |
| 证据 | `C:\Users\10121\IdeaProjects\AlphaFactory\AiCoding` 目录审计、当前仓库 `README.md`、`AGENTS.md`、`product/`、`docs/` 和源码 |

## 决策

保留实例的 Memory OS 分层和治理入口，按 sanye_anime 当前真实三工程、管理后端、桌宠和部署结构重写入口视图。AlphaFactory 专属历史、接口、库表、内部路径和凭据不迁移。

## 风险

- 当前 AiCoding 仍是初始骨架，接口和数据库视图需要继续按源码扩展。
- 本次未宣称外部 AI、版权、生产部署或账户授权已完成。
- 当前仓库存在用户已有未提交改动，提交时必须只纳入 `AiCoding/`。
