# sanye_anime 工程文档体系

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v2.6 |
| 文档状态 | 基线，企业级文档体系总览与文档地图 |
| 更新时间 | 2026-08-24 |
| 维护规则 | 遵循[文档变更规则](./document-change-rules.md)，新增/修订文档必须登记本文档索引并更新状态；文档间引用遵循第 3 节边界 |

## 1. 文档体系定位

`docs/` 只承载工程与交付文档（开发流程、技术架构、设计、任务、测试、安全、数据、运维、发布），
产品定位、功能、交互与产品验收标准放在 [../product/README.md](../product/README.md)。

企业级开发的文档体系要求每一份文档：

1. **可追溯**：需求 → 设计 → 任务 → 实现 → 测试 → 发布 全链路可回溯（见第 4 节闭环模型）。
2. **可执行**：读者拿到文档即可独立完成对应工作，不依赖对话记忆。
3. **状态明确**：每份文档有版本、状态（草案/评审中/基线/废弃）、更新日期和更新记录。
4. **交叉一致**：涉及同一对象（接口、表、配置、错误码）时，以唯一基准文档为准，其余文档引用而非复制。
5. **证据闭环**：声称“已完成/已验证”必须有测试报告、日志或脚本结果作为证据，并登记证据位置。

## 2. 文档地图

### 2.1 产品域（product/，面向产品决策与验收）

| 文档 | 定位 | 状态 |
| --- | --- | --- |
| [产品总体架构](../product/overall-architecture.md) | 三个产品端边界、P0/P1 模块、角色权限 | 基线 |
| [产品需求文档](../product/product-requirements.md) | 核心需求、用户故事、范围裁决 | 基线 |
| [功能详细说明](../product/feature-specification.md) | 功能级规格（AI-0xx、MINE-0xx、O-0xx） | 基线 |
| [MVP 冻结清单](../product/mvp-freeze.md) | P0/P1 范围冻结、验收口径 | 基线 |
| [页面状态矩阵](../product/page-state-matrix.md) | 页面状态与跳转（加载/空/错误/权限） | 基线 |
| [视觉设计系统](../product/visual-design-system.md) | 视觉唯一基准（色彩/排版/组件） | 基线 |
| [桌宠产品需求](../product/desktop-companion-requirements.md) | 桌宠独立产品需求 | 基线 |
| [原型说明](../product/prototypes/README.md) | 交互原型清单与演示方式 | 基线 |

### 2.2 架构与设计域（docs/，面向实现）

| 文档 | 定位 | 状态 |
| --- | --- | --- |
| [技术架构](./technical-architecture.md) | 微服务拆分、技术选型、部署拓扑、运行边界 | 基线 |
| [详细技术设计](./technical-design.md) | 模块级设计（认证/内容/AI/搜索/文件/监控/安全章节） | 基线 |
| [公开媒体导入评审](./media-import-review.md) | 公开来源元数据导入范围、合规风险和控制措施 | 基线 |
| [媒体开发设计](./media-player-development.md) | 媒体元数据、播放器、管理端导入和回滚设计 | 基线 |
| [作品元数据导入说明](./anime-import.md) | 公开详情页元数据和封面一键导入脚本 | 基线 |
| [接口与字段契约](./api-contract.md) | **接口唯一基准**：路径/方法/鉴权/字段/错误码 | 基线 |
| [数据库设计](./database-design.md) | **数据唯一基准**：schema、表字典、索引约束、迁移 | 基线 |
| [安全设计](./security-design.md) | 安全唯一基准：威胁模型、认证授权、输入输出、密钥、审计 | 基线 |
| [环境配置矩阵](./environment-config.md) | 环境变量与中间件连接唯一基准 | 基线 |

### 2.3 工程管理与流程域（docs/，面向交付管理）

| 文档 | 定位 | 状态 |
| --- | --- | --- |
| [开发计划](./development-plan.md) | 单人开发流程、阶段计划、前置门禁、工期 | 基线 |
| [开发任务清单](./development-tasks.md) | 任务拆分、依赖、完成定义、完成记录（含证据） | 基线 |
| [开发待办事项](./development-todo.md) | 每日/每项任务推进日志 | 基线 |
| [桌宠开发计划](./desktop-companion-development-plan.md) | 桌宠实现阶段、工期和发布门禁 | 基线 |
| [差距登记表](./gap-register.md) | 差距、外部门禁、关闭条件 | 基线 |
| [决策记录](./decision-log.md) | ADR：重大技术/范围决策与理由 | 基线 |
| [文档变更规则](./document-change-rules.md) | 唯一事实源、同步矩阵、自动校验和更新流程 | 基线 |
| [项目流程图](./project-flow.md) | 用户/运营/数据/发布流程（mermaid） | 基线 |
| [版本基线](./version-baseline.md) | 工具链/依赖/分支/版本策略 | 基线 |
| [RuoYi 管理后端接入说明](./ruoyi-admin-backend.md) | 管理端接入与适配记录 | 基线 |
| [后端 MVP 实现说明](./backend-mvp.md) | 早期 MVP 实现记录 | 基线 |

### 2.4 质量与测试域（docs/，面向验收证据）

| 文档 | 定位 | 状态 |
| --- | --- | --- |
| [测试策略](./testing-strategy.md) | 测试分层、门禁、报告体系唯一基准 | 基线 |
| [质量门禁](./quality-gates.md) | 编码/提交/合并/发布四道门禁清单 | 基线 |
| [按板块开发与测试方案](./module-dev-test-plan.md) | 每板块的接口/字段/Playwright 测试方案 | 基线 |
| [媒体测试计划](./media-player-test-plan.md) | 媒体导入、播放器和管理端导入验收 | 基线 |
| [媒体播放器测试报告](./media-player-test-report.md) | 媒体导入、播放器和相关接口的实际执行结果 | 已执行 |
| [接口测试报告](./interface-test-report.md) | 全接口体检报告（9 板块 60 项） | 已执行 |
| [按钮可用性报告](./button-test-report.md) | Playwright 按钮体检报告（425 项） | 已执行（动态基线） |
| [桌宠测试报告](./desktop-companion-test-report.md) | 桌宠本地构建证据与 Windows 验收缺口 | 已执行/待环境 |
| [全量文档评审记录](./document-review.md) | 文档交叉评审与一致性修正记录 | 已执行 |
| [原型评审记录](./prototype-review.md) | 原型评审与整改闭环 | 已执行 |

### 2.5 运维与发布域（docs/，面向运行与上线）

| 文档 | 定位 | 状态 |
| --- | --- | --- |
| [全系统监控方案](./monitoring-design.md) | 指标分层、指标清单、告警阈值唯一基准 | 基线 |
| [故障处理手册](./ops-runbook.md) | 症状→定位→处理→验证→回滚，含故障注入演练 | 基线 |
| [发布管理](./release-management.md) | 版本策略、发布检查清单、回滚、已知问题 | 基线 |
| [CI/CD](./ci-cd.md) | 流水线、门禁、扫描、构建产物唯一基准 | 基线 |

### 2.6 根文档

| 文档 | 定位 |
| --- | --- |
| [README.md](../README.md) | 项目总览、快速启动、目录结构 |
| [AGENTS.md](../AGENTS.md) | 协作规则、命名规范、提交规范（开发环境即读） |

## 3. 文档边界与唯一基准

为避免同一信息多处维护造成漂移，以下对象**只允许在唯一基准文档维护**，其余文档引用：

| 对象 | 唯一基准文档 | 其他文档的约束 |
| --- | --- | --- |
| 接口路径/字段/错误码 | [api-contract.md](./api-contract.md) | 不得复制接口表，只引用 |
| 数据库表/字段/迁移 | [database-design.md](./database-design.md) | 不得复制表结构，只引用 |
| 安全规则/密钥策略 | [security-design.md](./security-design.md) | 安全实现必须引用 |
| 环境变量 | [environment-config.md](./environment-config.md) | 配置实现必须引用 |
| 指标与告警阈值 | [monitoring-design.md](./monitoring-design.md) | 告警规则与文档一致 |
| 任务与完成证据 | [development-tasks.md](./development-tasks.md) | 完成必须登记证据 |
| 测试结果 | [testing-strategy.md](./testing-strategy.md) 与各报告 | 测试报告引用任务编号 |

文档边界规则（与 [AGENTS.md](../AGENTS.md) 一致）：

- `product/` 不写 API、数据库、部署、版本细节；`docs/` 不定义面向用户的产品需求。
- 接口契约、数据库、安全、环境配置四份文档是“契约类”文档，实现偏离时必须同步修订并登记决策。
- 文档正文、标题、表格说明使用中文；代码标识符、命令、路径、技术名称、分支名称保持原文。

## 4. 逻辑闭环模型

企业级研发闭环：`需求 → 产品 → 架构/设计 → 任务 → 实现 → 测试 → 部署 → 运维 → 发布 → 反馈`。
每一条链路都必须有文档落点，且下游引用上游、上游承诺下游可验证：

```text
需求/范围（product-requirements、mvp-freeze、feature-specification）
   │  追溯：traceability-matrix（需求项 → 任务 → 接口 → 测试证据 → 验收）
   ▼
架构与设计（technical-architecture、technical-design、api-contract、database-design、security-design）
   │  约束：development-plan（门禁）、development-tasks（任务拆分与完成定义）
   ▼
实现（development-tasks 完成记录 + 代码 + 迁移）
   │  证据：mvn test / pnpm build / 冒烟 / E2E / 接口体检 / 按钮体检
   ▼
测试与质量（testing-strategy、quality-gates、interface-test-report、button-test-report）
   │  门禁：覆盖率 / 扫描 / 类型检查 / 构建 / 评审
   ▼
部署与配置（environment-config、ci-cd、run-local/compose/nginx）
   │  运行证据：服务启动日志、健康检查
   ▼
运维与监控（monitoring-design、ops-runbook、fault-injection）
   │  告警 / 备份 / 故障演练 / 恢复
   ▼
发布与反馈（release-management、gap-register、decision-log）
       发布检查清单 → 回滚 → 已知问题 → 反馈回到需求
```

### 4.1 闭环校验方法

每次进入新阶段或发布前，按以下问题自查（对应文档应能给出证据）：

1. 本阶段需求来自哪条产品需求项？（traceability-matrix 可查）
2. 设计是否落在唯一基准文档？（api-contract / database-design / security-design）
3. 任务是否在 development-tasks 登记并定义完成条件？
4. 实现是否有测试证据？（单测/冒烟/E2E/体检报告，含通过数）
5. 配置与环境变量是否登记？（environment-config）
6. 运维与告警是否覆盖？（monitoring-design / ops-runbook）
7. 发布是否有检查清单与回滚？（release-management）
8. 遗留问题是否登记？（gap-register / 已知问题）

## 5. 文档质量规范（企业级标准）

### 5.1 文档头部元信息

每份正式文档以表格开头：

```markdown
| 项目 | 内容 |
| --- | --- |
| 文档版本 | vX.Y |
| 文档状态 | 草案 / 评审中 / 基线 / 已废弃 |
| 关联文档 | 上游与下游文档链接 |
| 唯一基准 | 是 / 否（若是，注明对象） |
| 更新时间 | YYYY-MM-DD |
```

### 5.2 文档生命周期

| 状态 | 含义 | 进入条件 |
| --- | --- | --- |
| 草案 | 初稿，未评审 | 首次创建 |
| 评审中 | 已提交评审，待确认 | 草案完成 |
| 基线 | 评审通过，作为实现/验收依据 | 交叉评审通过且登记 document-review |
| 已废弃 | 不再适用 | 被新文档/决策取代并登记 decision-log |

### 5.3 更新记录

每次实质修改在文档末尾追加更新记录：

```markdown
## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v2.0 | 重写为文档体系总览 | 企业级文档完善 |
```

### 5.4 评审与一致性检查

- 新增/修订契约类文档（接口、数据、安全、环境）必须执行一次全量文档交叉评审并登记 [document-review.md](./document-review.md)。
- 自动化检查：执行 `pnpm docs:check`，检查 Markdown 相对链接、文档变更规则索引、桌宠/AI 当前事实和已知过期表述；链接有效性、文档边界（product/docs）、阶段表述、任务一致性、错误码/字段与 api-contract 一致性仍需在专项评审中核对。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v2.0 | 重写为文档体系总览：文档地图、唯一基准、闭环模型、质量规范 | 企业级文档完善 |
| 2026-08-21 | v2.1 | 增加文档变更规则、桌宠测试报告索引和 `pnpm docs:check` 自动校验 | 文档一致性收口 |
| 2026-08-24 | v2.5 | 同步清理临时数据后的当前测试基线：独立按钮体检 425/425、全量 Playwright 540/540（套件内按钮 420/420）；历史版本数字保留在各自更新记录中 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all`、`pnpm docs:check` |
| 2026-08-24 | v2.6 | 同步本次有效回归：全量 Playwright 548/548、套件内按钮 428/428、真实 HLS 专项 34/34、清晰度专项 3/3；独立按钮稳定报告 425/425 保留为动态基线 | `pnpm e2e:all`、`e2e/e2e-media-player-live.mjs`、`pnpm e2e:media-quality` |
