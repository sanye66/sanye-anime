# 产品文档

本目录只包含面向产品设计的文档。

## 内容范围

- 产品定位和目标。
- 目标用户和使用场景。
- `sanye_anime` 客户端、`official` 官网和管理平台的产品边界；其中 `official` 页面归入 `sanye_client` 技术工程。
- 功能、页面、交互、状态、用户流程和验收标准。
- MVP 优先级和产品规则。

## 文档列表

- [产品需求文档](./product-requirements.md)
- [功能详细说明](./feature-specification.md)
- [页面状态矩阵](./page-state-matrix.md)
- [MVP 冻结清单](./mvp-freeze.md)
- [桌宠产品需求](./desktop-companion-requirements.md)
- [产品总体架构](./overall-architecture.md)
- [页面原型](./prototypes/README.md)

## 文档冻结基线

| 文档 | 冻结版本 | 状态 |
| --- | --- | --- |
| [产品需求文档](./product-requirements.md) | v0.5 | 冻结 |
| [功能详细说明](./feature-specification.md) | v0.5 | 冻结 |
| [页面状态矩阵](./page-state-matrix.md) | v0.2 | 冻结 |
| [MVP 冻结清单](./mvp-freeze.md) | v0.1 | 冻结 |
| [产品总体架构](./overall-architecture.md) | v0.3 | 冻结 |
| [桌宠产品需求](./desktop-companion-requirements.md) | v0.1 | 冻结 |
| [页面原型](./prototypes/README.md) | v0.1 | 冻结 |

冻结说明（2026-08-18）：

- 本目录只包含产品定位、用户场景、功能、页面、交互、状态和产品验收；不包含 API、数据库、部署或版本技术细节。
- 三个产品入口原型（客户端、官网、管理平台）与页面状态矩阵、MVP 冻结清单完成一致性核对：作品比较为 P2、深色主题为 P1、剧透模式默认避免剧透为 P0 回答规则、管理平台任务管理 P0 只含查看/立即执行/重试。
- 范围变更按 [MVP 冻结清单](./mvp-freeze.md) 第 7 节变更规则执行，并同步记录到 [决策记录](../docs/decision-log.md)。

技术实现、开发流程、版本基线、决策记录和工程差距放在 [../docs/README.md](../docs/README.md)。
