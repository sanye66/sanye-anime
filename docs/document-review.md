# sanye_anime 全量文档评审记录

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v4.9 |
| 文档状态 | 复查完成：CI、管理端权限契约、浏览器安全回归与依赖安全门禁已同步 |
| 评审范围 | 仓库全部 Markdown 文档（根文档、`product/`、`docs/`、`AiCoding/`）与交互原型 |
| 评审方式 | 逐文档通读 + 交叉引用核对 + 自动化检查（链接、阶段表述、文档边界、优先级、任务一致性） |
| 评审日期 | 2026-08-26 |

## 1. 评审范围

| 分组 | 文档 | 版本 | 评审结论 |
| --- | --- | --- | --- |
| 根文档 | [README.md](../README.md)、[AGENTS.md](../AGENTS.md) | - | 基本一致，索引补齐 |
| 产品 | [product-requirements.md](../product/product-requirements.md) | v0.5 | 修正 4 项 |
| 产品 | [feature-specification.md](../product/feature-specification.md) | v0.6 | 修正桌宠边界 |
| 产品 | [overall-architecture.md](../product/overall-architecture.md) | v0.3 | 角色基准，一致 |
| 产品 | [page-state-matrix.md](../product/page-state-matrix.md) | v0.2 | 一致 |
| 产品 | [mvp-freeze.md](../product/mvp-freeze.md) | v0.1 | 一致（前轮已修边界） |
| 产品 | [desktop-companion-requirements.md](../product/desktop-companion-requirements.md) | v0.2 | 透明边界与启动关系已同步 |
| 产品 | [visual-design-system.md](../product/visual-design-system.md) | - | 成为视觉唯一基准 |
| 产品 | [prototypes/README.md](../product/prototypes/README.md) | - | 与原型实现一致 |
| 工程 | [development-plan.md](./development-plan.md) | v0.11 | 修正 1 项 |
| 工程 | [desktop-companion-development-plan.md](./desktop-companion-development-plan.md) | v0.2 | 实现阶段与发布门禁已同步 |
| 工程 | [technical-architecture.md](./technical-architecture.md) | v0.3 | 修正 2 项 |
| 工程 | [technical-design.md](./technical-design.md) | v0.1 | 修正 1 项 |
| 工程 | [version-baseline.md](./version-baseline.md) | v0.2 | 一致 |
| 工程 | [backend-mvp.md](./backend-mvp.md) | v0.3 | 当前实现、真实接口路径与外部边界已同步 |
| 工程 | [ruoyi-admin-backend.md](./ruoyi-admin-backend.md) | v0.1 | 现状记录一致 |
| 工程 | [project-flow.md](./project-flow.md) | v0.8 | 一致 |
| 工程 | [decision-log.md](./decision-log.md) | v0.12 | D-026 已同步 |
| 工程 | [gap-register.md](./gap-register.md) | v0.11 | AI 外部阻塞已同步 |
| 工程 | [development-todo.md](./development-todo.md) | v0.19 | Docker 中间件统一配置脚本已同步 |
| 工程 | [development-tasks.md](./development-tasks.md) | v0.2 | AI 与桌宠证据已同步 |
| 工程 | [prototype-review.md](./prototype-review.md) | v0.4 | 评审/整改闭环 |
| 工程 | [document-change-rules.md](./document-change-rules.md) | v1.0 | 文档同步与自动检查规则 |
| 工程 | [anime-import.md](./anime-import.md) | v2.6 | 搜索页站内直接观看/导入观看、只读预览接口、详情路径、`imgUrl` 当前作品封面、并发导入和真实回归证据已同步 |
| 工程 | [media-player-development.md](./media-player-development.md) | v1.0 | 导入集数、线路 ID、`imgUrl` 封面解析、并发读取、导入超时、站内外部预览与 ArtPlayer/HLS 实现基准已同步 |
| 测试 | [media-player-test-plan.md](./media-player-test-plan.md) | v1.1 | ArtPlayer 外壳、媒体属性、清晰度菜单、独立季度卡片和真实 HLS 断言已同步 |
| 测试 | [media-player-test-report.md](./media-player-test-report.md) | v0.9 | ArtPlayer、真实 HLS 和清晰度专项结果已登记 |
| 测试 | [desktop-companion-test-report.md](./desktop-companion-test-report.md) | v0.1 | 本地构建通过，系统验收待环境 |
| 工程 | [document-review.md](./document-review.md)（本文档） | v4.5 | 本次外部搜索双路径观看、并发导入、封面解析和真实测速后的文档一致性复查 |

## 2. 评审方法

1. 逐文档检查：文档版本、状态、更新时间；内容完整性；内部一致性；与所属目录边界（product/ 只放产品内容，docs/ 只放工程内容）的合规性。
2. 交叉引用核对：优先级（P0/P1/P2）、阶段状态、决策编号（D-001 至 D-021）、差距编号（GAP-001 至 GAP-015）、待办编号（PRE-TODO/TODO/PET-TODO）、任务编号（T-xx）、角色命名、数据库表命名。
3. 自动化检查：`pnpm docs:check` 校验全仓 Markdown 相对链接、文档地图、桌宠/AI 当前事实和过期表述；专项评审继续核对四份阶段文档、product/ 边界、任务估时/依赖/P0 覆盖。
4. 原型核对：三端原型入口、页面、状态演示与状态矩阵、冻结清单一致。

## 3. 总体结论

- 文档体系完整：产品（定位/需求/功能/架构/视觉/状态/冻结/原型）→ 工程（计划/技术架构/技术设计/任务/待办/流程/决策/差距/基线/评审）形成闭环。
- 首轮共发现并修正 12 项问题；本次复查继续修正后端状态滞后、部署说明滞后、管理端权限入口和安全边界问题。
- 整体逻辑闭环成立：每个前置门禁阶段都有对应产出与证据，外部门禁和待评审决策按预期保持开放并登记在案。
- 遗留开放项均被显式登记：GAP-003/004/005/006/007/009/011/012/013/014/015、TODO-010/011/013/014/015、技术设计后续决策和桌宠系统发布验收。

## 4. 逐文档详细评审

### 4.1 根文档

**README.md**

- 版本与状态：当前状态表述与开发待办一致（PRE-TODO-008 已完成，外部环境与发布门禁单独登记）。
- 文档索引：产品文档缺桌宠产品需求、工程文档缺桌宠开发计划 → 已补充（D-12 相关）。
- 工程结构说明与 AGENTS.md 一致。

**AGENTS.md**

- 命名规范（`sanye_` 前缀、包名、小驼峰、数据库表前缀、文档边界）与仓库实际一致；无冲突。

### 4.2 产品文档（product/）

**product-requirements.md（v0.5）**

- 完整性：定位、目标用户、场景、结构、功能、视觉、交互、状态、规则、指标完整。
- 发现的问题：
  - D-01（高）：5.2 视觉方向仍写“白色背景、青色主色”，与 [visual-design-system.md](../product/visual-design-system.md)（黄昏星轨：深夜蓝/黄昏蓝/彗星珊瑚/星光金，客户端深色默认）和原型冲突 → 已改为黄昏星轨并引用视觉设计系统。
  - D-02（高）：5.3 “Ctrl/Cmd + K 新建会话”与功能说明 PC-004（⌘K 为全局搜索入口）和原型实现（⌘K 聚焦搜索）冲突 → 已改为“全局搜索 ⌘K 聚焦，新建会话快捷键 P1 设置”。
  - D-03（低）：4.2 复制回答、反馈回答未标注 P1 → 已标注。
  - D-04（低）：6.3 “逐个比较”与作品比较 P2 裁决冲突 → 已改为“逐个查看，正式比较能力 P2”。
- 一致性确认：8.2 AI 状态表与状态矩阵第 7 节一致；AI 额度（匿名 5/登录 30）与决策 D-006 一致。

**feature-specification.md（v0.6）**

- 完整性：PC-001 至 MINE-010、ACCOUNT、FLOW、页面验收、P0/P1/P2 清单完整。
- 发现的问题：
  - D-05（低）：AI-012 剧透模式标记 P1，但“默认避免剧透”属于 P0 回答规则，未加说明 → 已补充说明并与冻结清单裁决一致。
- 范围说明：本文件只定义客户端功能；官网页面由 overall-architecture 4.2 与冻结清单定义，符合文档边界，登记不视为缺失。
- 一致性确认：HOME-009/013（搜索与仓库边界）、作品比较 P2、深色主题 P1 均与冻结清单一致。

**overall-architecture.md（v0.3）**

- 完整性：三端边界、模块优先级、主流程、管理角色、内容生命周期、MVP 范围完整。
- 角色模型（5.2 七个角色）确认为全仓唯一基准；技术架构与技术设计中的角色命名已对齐（D-06/D-10/D-11）。
- 一致性确认：MVP 范围（9.2）与冻结清单一致；发布优先级（9.1）与开发计划一致。

**page-state-matrix.md（v0.2）**

- 完整性：统一状态定义、通用跳转、客户端 7 行、官网 4 行、管理平台 9 行、AI 状态机、原型同步清单、验收标准完整。
- 一致性确认：三端矩阵行与冻结清单 P0 页面一一对应；AI 状态机与产品需求 8.2、原型演示一致。

**mvp-freeze.md（v0.1）**

- 完整性：三端 P0/P1/P2、本期不做、依赖门禁、变更规则、范围裁决完整。
- 一致性确认：作品比较 P2、剧透默认 P0 规则、任务管理 P0 范围、搜索与仓库边界均有裁决；依赖表已去除技术名词（前轮修正）。

**desktop-companion-requirements.md（v0.2）**

- 完整性：P0/P1/P2、角色状态、流程、验收和外部发布门禁完整；透明无背景、互动按钮、客户端启动自动拉起和单实例关系已冻结。

**visual-design-system.md**

- 确认为视觉唯一基准；与原型（黄昏天空/流星/亮暗主题）、修复后的需求文档一致。

**prototypes/README.md**

- 三端原型入口、页面范围、操作说明与原型实现一致（管理平台入口、AI 状态演示均已登记）。

### 4.3 工程文档（docs/）

**development-plan.md（v0.11）**

- 完整性：单人开发流程、前置门禁、阶段排期、工作量预算、质量门禁、CI/CD、风险完整。
- 发现的问题：
  - D-08（中）：4.2 “第 4 周必须完成端到端样板”与第 5 节排期（第 5 至 6 周垂直链路）冲突 → 已改为“第 6 周前”。
- 一致性确认：阶段预算与任务清单汇总（95 天 + 前置门禁 8-10 = 103-105 天）一致。

**desktop-companion-development-plan.md（v0.2）**

- 完整性：阶段工期（22 + 5 缓冲）、实现状态、具体工作、质量门禁、风险和发布门禁完整；本地核心代码已完成，Windows 兼容与安装发布待环境。

**technical-architecture.md（v0.3）**

- 完整性：技术栈、总体架构、未来边界、核心链路、组件规范、AI 要求、一致性与安全要求、环境、验收清单、决策完整。
- 发现的问题：
  - D-09（中）：5.5 核心表名未使用 `sanye_` 前缀（如 `user_account`、`anime`），违反命名规范且与技术设计 DDL 不一致 → 已统一为 `sanye_` 前缀。
  - D-10（中）：5.11 管理角色（内容运营/运维/客服）与总体架构 5.2 角色命名不一致 → 已对齐并建立代码角色映射说明。
- 一致性确认：CAS、LangChain4j、HikariCP、线程池等新增组件已登记；表名与版本基线规则一致。

**technical-design.md（v0.1）**

- 完整性：数据模型（DDL）、统一契约、分模块实现、安全、并发、分布式、缓存安全、异常降级、测试、部署、门禁、待评审决策（TD-01 至 TD-16）、自评审（SR-01 至 SR-11）、附录完整。
- 发现的问题：
  - D-11（低）：5.1.5 代码角色与产品角色名称需建立显式映射 → 已补充并与总体架构 5.2 对齐。
- 内部一致性确认：CAS（5.1、6.1）、LangChain4j 记忆/RAG（5.6.6）、线程池/连接池（7.8/7.9）、缓存安全（第 9 节）、错误码与状态矩阵附录 B 一致。

**version-baseline.md（v0.2）**

- 完整性：服务端、治理、数据中间件、任务容器、管理平台版本与锁定文件、升级规则、验证清单完整。
- 一致性确认：CAS Client、LangChain4j 已登记为 review；外部验证项 7/8 与差距登记对应。

**backend-mvp.md（v0.2）**

- 当前实现、JWT 身份边界、文件所有权和外部环境开放项已与 README、`sanye_server` 实现同步。

**ruoyi-admin-backend.md（v0.1）**

- 现状记录与 README、开发待办一致；正式环境未完成项单独登记，TODO-001 至 TODO-009 的本地联调证据已归档。

**project-flow.md（v0.8）**

- 总体流程、用户流程、发布流程与阶段状态一致（前置门禁已关闭，当前进入外部环境与发布收口）。

**decision-log.md（v0.12）**

- D-001 至 D-021 可追溯，变更规则完整；D-017 至 D-021 与产品文档、技术设计同步。

**gap-register.md（v0.11）**

- GAP-001 至 GAP-015 状态、下一步、出口标准完整；GAP-006 已统一为硅基流动 `Qwen/Qwen2.5-7B-Instruct`，HTTP 402 作为当前外部阻塞；与待办、任务、决策映射一致。

**development-todo.md（v0.11）**

- PRE-TODO-001 至 007 均有完成证据；发现的问题：
  - D-12（低）：PRE-TODO-006 状态为“进行中”但阶段已推进到 PRE-TODO-008 → 已改为“已完成（用户指示继续，后续问题另行登记）”。
- TODO-001 至 015、PET-TODO-001 至 008 与任务清单、桌宠计划对应。

**development-tasks.md（v0.2）**

- 41 个任务：估时 1-3 天、依赖可解析且无环、阶段合计 95 天、三端 P0 全覆盖，自动化验证通过（见第 6.4 节）。

**document-change-rules.md（v1.0）**

- 建立唯一事实源、变更触发矩阵、状态和证据规则；新增 `pnpm docs:check`，用于 Markdown 链接和当前桌宠/AI 事实校验。

**desktop-companion-test-report.md（v0.1）**

- 已登记桌宠类型检查和构建证据；Windows 多屏、缩放、锁屏、安装签名和 Electron 真实窗口回归仍按待环境处理。

**prototype-review.md（v0.4）**

- 评审记录、问题清单（M/N）、整改记录闭环；N-12 管理平台入口已修复。

## 5. 跨文档一致性核对

| 检查项 | 结果 |
| --- | --- |
| 阶段状态（README、开发计划、待办、项目流程） | 一致：PRE-TODO-008 已完成，当前进入外部环境与发布验收 |
| 作品比较优先级 | 全仓 P2（需求、功能、冻结、决策） |
| 深色主题优先级 | 全仓 P1 |
| 剧透模式 | 默认避免剧透为 P0 规则，设置项 P1 |
| AI 额度 | 匿名 5 次/日、登录 30 次/日（D-006） |
| 搜索与仓库边界 | 顶部搜索进结果页，仓库承担浏览全部（D-017、HOME-013） |
| 认证方案 | CAS 单点登录 + 本地会话凭证（D-020、TD-01/TD-11/TD-12） |
| AI 编排 | LangChain4j 模型/记忆/RAG（D-021、TD-14/TD-15/TD-16） |
| 角色命名 | 以总体架构 5.2 为基准，技术架构/设计已对齐 |
| 数据库表命名 | 全仓 `sanye_` 前缀（技术架构已修正） |
| 文档边界 | product/ 无 API、数据库、部署、版本技术细节（扫描通过） |
| 原型 ↔ 状态矩阵 ↔ 冻结 | 三端 P0 页面与演示全覆盖 |
| 任务清单 ↔ 计划/待办/门禁 | 汇总一致、TODO/GAP 映射完整 |

## 6. 整体逻辑闭环验证

### 6.1 前置门禁证据链

| 阶段 | 产出 | 证据 |
| --- | --- | --- |
| PRE-TODO-001 原型评审 | 评审记录 + 问题清单 + 整改 | [prototype-review.md](./prototype-review.md) |
| PRE-TODO-002 页面状态矩阵 | 三端状态矩阵 + AI 状态机 | [page-state-matrix.md](../product/page-state-matrix.md) |
| PRE-TODO-003 MVP 冻结 | 三端 P0/P1/P2 + 裁决 | [mvp-freeze.md](../product/mvp-freeze.md)、D-018 |
| PRE-TODO-004 管理平台原型 | 管理平台可交互原型 + 状态矩阵第 6 节 | [prototypes/README.md](../product/prototypes/README.md) |
| PRE-TODO-005 产品文档冻结 | 冻结基线 + 一致性核对 | [产品文档目录](../product/README.md)、D-019 |
| PRE-TODO-006 技术设计 | 实现级设计 + 自评审 + 待评审决策 | [technical-design.md](./technical-design.md)、D-020/D-021 |
| PRE-TODO-007 任务拆分 | 41 个任务 + 验证 | [development-tasks.md](./development-tasks.md) |
| PRE-TODO-008 正式编码 | 已完成 | 首个任务 T-B-01 与后续任务证据 |

### 6.2 输入输出链

```text
产品需求/功能/架构（product/）
  -> 页面状态矩阵（状态与跳转）
  -> MVP 冻结清单（范围与裁决）
  -> 交互原型（三端可操作验证）
  -> 技术设计（实现方案：安全/并发/分布式/缓存/池化）
  -> 任务清单（41 个任务与 DoD）
  -> 验收与发布（阶段 G/H/I + 门禁 GAP/G）
```

每一环的输出都是下一环的输入，且均有引用与证据；无“孤儿”文档或未登记的功能。

### 6.3 预期保持开放的缺口（闭环外登记项）

- 外部门禁：GAP-004 内容数据、GAP-005 版权、GAP-006 AI 供应商、GAP-013 法律、GAP-014 官网运营、GAP-015 CAS 认证；G-001 至 G-009。
- 管理端本地真实运行验收：TODO-001 至 TODO-009 已完成；生产凭据、Docker 和外部服务仍按 TODO-010/011/013-015 处理。
- 技术设计后续决策：TD-01 至 TD-16（不阻塞当前本地实现，按业务和环境条件关闭）。
- 桌宠 P1：PET-TODO-001 至 008（核心 MVP 稳定后执行）。

### 6.4 自动化验证结果

| 检查 | 结果 |
| --- | --- |
| Markdown 相对链接 | 全仓无断链 |
| 阶段表述一致性 | 四份阶段文档一致 |
| 任务估时 1-3 天 | 41/41 通过 |
| 任务依赖可解析、无环 | 通过 |
| 阶段合计与计划一致 | 95 天（+门禁 = 103-105） |
| 三端 P0 覆盖 | 全部覆盖 |
| product/ 文档边界 | 无技术细节泄漏 |
| 优先级冲突扫描 | 作品比较/深色主题/剧透/额度一致 |

## 7. 修复记录（2026-08-18）

| 编号 | 文档 | 问题 | 处理 |
| --- | --- | --- | --- |
| D-01 | product-requirements.md | 5.2 视觉方向与视觉设计系统冲突 | 改为黄昏星轨并引用视觉设计系统 |
| D-02 | product-requirements.md | 5.3 ⌘K 语义冲突 | 改为全局搜索聚焦，新建会话快捷键 P1 |
| D-03 | product-requirements.md | 4.2 复制/反馈未标 P1 | 标注 P1 |
| D-04 | product-requirements.md | 6.3 “逐个比较”与作品比较 P2 冲突 | 改为逐个查看，比较能力 P2 |
| D-05 | feature-specification.md | AI-012 剧透 P1 与 P0 默认规则未说明 | 补充说明并与冻结裁决一致 |
| D-06 | technical-architecture.md | 5.11 角色命名不一致 | 对齐总体架构 5.2 角色 |
| D-07 | technical-architecture.md | 5.5 表名缺 `sanye_` 前缀 | 统一前缀 |
| D-08 | development-plan.md | 4.2 “第 4 周”与排期冲突 | 改为“第 6 周前” |
| D-09 | technical-design.md | 5.1.5 代码角色与产品角色映射缺失 | 补充映射说明 |
| D-10 | README.md | 产品/工程文档索引缺桌宠两份文档 | 补充链接 |
| D-11 | development-todo.md | PRE-TODO-006 状态与阶段推进矛盾 | 标记已完成（问题后补登记） |
| D-12 | development-todo.md | 证据清单未登记全量评审 | 本文档即证据，已登记 |

另：前轮已修复并复核通过的问题包括作品比较 P1→P2、冻结清单依赖表技术名词、管理平台原型入口（N-12）、日期星期基准、FastJson2 序列化风险登记等。

## 8. 结论与维护规则

1. 整体逻辑闭环成立：产品定义 → 状态 → 冻结 → 原型 → 设计 → 任务 → 验收 → 发布证据链完整，无阻塞性文档矛盾。
2. 开放项均为显式登记的门禁、待验收或待评审事项，不构成闭环缺口。
3. 后续维护规则：任何文档变更必须同步更新版本、状态、更新时间与关联文档；产品范围变更走冻结清单第 7 节变更规则并登记决策；技术实现变更先更新技术设计再回填技术架构。

## 9. 第二轮评审（企业级文档完善，2026-08-19）

### 9.1 评审范围

新增 8 份企业级文档 + 文档体系总览重写，并对既有文档交叉引用执行一致性检查。

| 文档 | 版本 | 评审结论 |
| --- | --- | --- |
| docs/README.md（重写为文档体系总览） | v2.0 | 通过：文档地图、唯一基准、闭环模型、质量规范 |
| 安全设计 security-design.md | v1.0 | 通过：威胁模型、访问控制、输入输出、数据、密钥、审计、安全测试映射 |
| 数据库设计 database-design.md | v1.0 | 通过：schema 划分、表字典、迁移清单、ER、生命周期、SQL 规范（与迁移文件核对一致） |
| 测试策略 testing-strategy.md | v1.0 | 通过：分层、覆盖率门禁、报告体系、缺陷、回归策略 |
| 质量门禁 quality-gates.md | v1.0 | 通过：五道门禁与检查清单（对齐 AGENTS.md 与 development-plan） |
| 发布管理 release-management.md | v1.0 | 通过：版本策略、流程、检查清单、回滚、记录模板 |
| CI/CD ci-cd.md | v1.0 | 通过：与 ci.yml 实际配置一致 |
| 环境配置 environment-config.md | v2.7 | 通过：与 application*.yml、run-local.ps1、compose.yaml 和统一配置脚本核对一致 |
| 需求追溯矩阵 traceability-matrix.md | v1.0 | 通过：核心能力追溯与任务/接口/测试证据对应 |
| 版本基线 version-baseline.md | v0.3 | 通过：追加文档体系版本基线章节 |

### 9.2b 深化复核（同日追加）

- api-contract.md v0.2：追加第 13 节“接口响应示例（实测）”，示例与运行中服务返回结构逐项核对一致
  （详情/列表/配额/模型信息/偏好/收藏/SSE/管理端信封），并补齐统一错误包与 SSE 事件示例。
- ops-runbook.md：追加第 9 节实测演练记录（故障注入 21/21、备份生成、弱网状态、全量启动验证）。
- technical-design.md v0.2：补充请求链路时序图、核心状态机（内容/消息/反馈/会话）、AI 对话主链路时序图。
- module-dev-test-plan.md v0.2：补充 S10-S13 板块用例编号与回归集合（排期/官网正文/模型配置/内容 CRUD/AI 评测/故障/布局）。

### 9.2 一致性校验

- 相对链接自动校验：docs 全部 Markdown 相对引用均有效（0 断链）。
- 环境变量核对：新文档 environment-config 覆盖全部 `${ENV}` 变量（后端 40 项 + 管理端 13 项 + 前端两组）。
- 迁移核对：database-design 迁移清单与实际 V*.sql 文件一致（anime V1-V4、ai-chat V1-V7、favorite/feedback/file V1-V2、auth/job/search V1）。
- 测试证据核对：traceability-matrix 的“已完成”状态均对应 development-tasks 完成记录与测试报告数量。
- 门禁核对：quality-gates 与 AGENTS.md 提交规范、development-plan 第 16 节、ci.yml 保持一致。
- 文档边界核对：新增文档未向 product/ 写入 API/数据库/部署细节；product/ 未被修改。

### 9.3 结论

企业级文档体系闭环成立：需求（product）→ 追溯矩阵 → 设计（接口/数据/安全/环境唯一基准）→
任务与门禁 → 测试证据（单测/冒烟/E2E/体检/按钮/故障注入）→ 发布与回滚 → 运维监控 → 反馈登记。
新增文档全部登记 docs/README.md 文档地图，无阻塞性矛盾。

## 10. Docker 中间件统一配置复核（2026-08-21）

### 10.1 复核范围

- [sanye_deploy/configure-middleware.ps1](../sanye_deploy/configure-middleware.ps1)：脚本参数、Compose 启动、已有数据卷账号同步、权限配置和连接验证。
- [sanye_deploy/compose.yaml](../sanye_deploy/compose.yaml)：10 个中间件服务、宿主机端口、容器网络地址和健康检查。
- [environment-config.md](./environment-config.md)：宿主机地址、容器网络地址、用户名、密码和无认证边界。
- [sanye_deploy/README.md](../sanye_deploy/README.md)、[ops-runbook.md](./ops-runbook.md)：脚本入口、改密流程和故障处理说明。

### 10.2 复核结论

- 默认账号、密码、数据库名、宿主机端口和容器服务名与 Compose 逐项一致；MinIO 使用 `12345678` 以满足八位密码限制。
- PostgreSQL、Redis、RabbitMQ、MinIO 和 XXL-JOB MySQL 由脚本执行原地配置；Elasticsearch、Kibana、Nacos、Sentinel 的无认证状态由脚本执行 HTTP 验证。
- Nacos Console 当前唯一宿主机入口为 `http://localhost:8080/`；本机网关使用 `http://localhost:8091`，Nacos API `8848`/gRPC `9848` 仅登记为容器网络地址。
- 脚本不会删除数据卷；修改已有数据卷密码时通过 `Current*` 参数提供旧凭据，风险和回滚边界已写入部署与运维文档。
- `configure-middleware.ps1` PowerShell AST 语法检查通过；实际服务连通性验证在脚本执行记录中登记，文档自动校验继续执行。

## 11. 中间件数据导入复核（2026-08-21）

### 11.1 复核范围

- [sanye_deploy/import-middleware-data.ps1](../sanye_deploy/import-middleware-data.ps1)：业务迁移追踪、管理库初始化、ES/Redis/MinIO/Nacos/RabbitMQ/XXL-JOB 数据导入和重复执行规则。
- [sanye_deploy/nacos/](../sanye_deploy/nacos/)：共享配置和业务配置种子文件。
- `environment-config.md`、`sanye_deploy/README.md`、`ops-runbook.md`、`development-todo.md`：导入命令、数据数量、运行边界和未伪造数据说明。

### 11.2 复核结论

- Docker PostgreSQL 已实际建立 8 个业务 schema，作品 15 条、法律正文 4 条、MinIO 文件元数据 21 条；独立 `sanye_admin` 库含 2 个管理用户、92 个菜单和 Quartz 表。
- Elasticsearch `sanye_anime` 索引含 15 条作品文档；Redis 含 3 个按项目实际 key 前缀写入的首页缓存；MinIO `sanye-anime/covers/` 含 21 个封面对象。
- Nacos 已回读 COMMON_GROUP 1 条和 BUSINESS_GROUP 9 条配置；RabbitMQ 基础拓扑存在但消息为 0；XXL-JOB 管理员和执行器组存在且任务表保持 0 条。
- 导入脚本使用迁移标记、对象键和固定业务主键实现重复执行保护；管理平台带 `DROP TABLE` 的初始化 SQL 只在空库执行，已有表无标记时主动跳过并告警。
- 文档中的“动态服务注册、真实消息消费者、真实 XXL-JOB 任务和正式备份恢复演练”仍明确为运行/发布环境后续验收，不以静态种子数据冒充完成。

## 12. 作品聚合与真实 HLS 播放复查（2026-08-24）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| `player_aaaa` 配置解析 | 修复：兼容没有末尾分号的公开 JSON 配置 | `MediaImportServiceTest` 6 项媒体单测通过 |
| 无职转生片库展示 | 修复：五个篇章分别展示为独立卡片，季度顺序为第一季、第二季、第二季 Part.2、第三季、OAD；每张卡片使用独立封面和详情入口 | `e2e/e2e-media-player-live.mjs` 独立卡片与封面断言 |
| 剧集数据 | 已导入代表作品 133/136/135/128/137，分别为 23/24/12/9/1 集；电影作品 `127` 保留两条播放线路 | 公开 `GET /api/v1/anime/{id}/episodes` |
| 你的名字播放 | 作品 `127` 保留两条播放线路，客户端按正片和语言/线路展示；浏览器正片实际播放推进 | 真实 HLS Playwright 28/28、电影线路专项 2/2 |
| 真实 HLS 播放 | 6 个代表作品均渲染 ArtPlayer 和 `<video>`，清单请求、实际播放推进、媒体状态和移动端布局通过 | 真实 HLS Playwright 28/28 |
| 全量回归 | 后端 210/210、11 个 Playwright 脚本 540/540、独立按钮 425/425（套件内 420/420） | `mvn test`、`pnpm e2e:all`、`node e2e/e2e-buttons.mjs` |
| 外部边界 | 版权授权、来源条款和 CDN 持续可用性仍为 `GAP-016=blocked-external` | 外部授权凭证尚未提供 |

## 13. 正式片库与当前文档基线复查（2026-08-24）

### 13.1 复查范围

- 当前运行库、搜索索引和清理脚本：`V7__remove_demo_test_catalog.sql`、`V8__normalize_official_catalog_metadata.sql`、`cleanup-anime-test-data.ps1`、`AnimeIndexService.syncAll()`。
- 当前接口、部署、运维、发布和评测文档：`environment-config.md`、`sanye_deploy/README.md`、`ops-runbook.md`、`interface-test-report.md`、`api-contract.md`、`release-readiness.md`、`traceability-matrix.md`、`ai-evaluation.md`。
- 当前体检入口：`interface-check.ps1` 的作品列表/仪表盘断言，以及管理端失败回退数据。

### 13.2 复查结论

- 当前正式运行片库固定为 6 条：`127`《你的名字》、`133` 无职转生第一季、`136` 无职转生第二季、`135` 无职转生第二季 Part.2、`128` 无职转生第三季、`137` 无职转生 OAD；每个篇章保留独立封面和详情入口。
- PostgreSQL 当前作品数据和 Elasticsearch 当前作品索引均按 6 条正式作品记录维护；历史 V3 的 15 部种子、旧导入结果和旧测试报告仅作为有日期的历史证据保留。
- `interface-check.ps1` 已将管理端内容列表和仪表盘发布数量断言改为 6；管理端失败回退的作品统计不再显示 1286 部旧演示数量。
- 单元测试中的虚构作品夹具和媒体测试 URL 仍被测试代码隔离使用，不会进入默认运行目录、客户端白名单、管理端正式回退或 Elasticsearch 正式索引；删除这些夹具会降低单元测试覆盖，故不作为运行数据处理。

### 13.3 复查证据

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 正式作品数量 | 通过，6 条 | V7/V8 迁移、`cleanup-anime-test-data.ps1`、公开作品接口 |
| 搜索索引数量 | 通过，6 条 | `AnimeIndexService.syncAll()` 先清理旧文档再全量写入 |
| 接口体检基线 | 已同步为 6 条作品 | `interface-test-report.md`、`interface-check.ps1` |
| 文档检查 | 通过，572/572 | `pnpm docs:check` |

## 14. 清晰度选择与完整回归复查（2026-08-24）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 多码率清晰度菜单 | 通过，真实 HLS level 显示自动、720P、360P | `pnpm e2e:media-quality` 3/3 |
| 清晰度切换行为 | 通过，选择 360P 后保持 ArtPlayer 控件并请求对应子清单；不重建播放器 | `e2e/e2e-media-quality.mjs` |
| 单清晰度来源 | 通过，6 个真实来源按实际清单隐藏清晰度菜单，不伪造档位 | `e2e/e2e-media-player-live.mjs` 34/34 |
| 全量回归 | 通过，后端 210/210、全量 Playwright 548/548、套件内按钮 428/428、三端 typecheck/build 通过 | `mvn -f sanye_server/pom.xml test`、`pnpm e2e:all`、`pnpm typecheck`、`pnpm build` |
| 外部边界 | 仍为 `GAP-016=blocked-external`，版权授权、来源条款和外部播放器持续可用性未取得外部证据 | 外部授权凭证尚未提供 |

## 15. 动漫季度统一排序复查（2026-08-25）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 统一排序来源 | 通过，系列和季度顺序集中登记在正式目录，不再由页面分别硬编码 | `sanye_client/src/data/animeCatalog.ts` |
| 片库顺序 | 通过，乱序接口数据恢复为第一季、第二季、第二季 Part.2、第三季、OAD | `node e2e/e2e-season-order.mjs`，1/1 |
| 搜索顺序 | 通过，接口搜索与本地回退共用目录比较方法 | `node e2e/e2e-season-order.mjs`，1/1 |
| 编译门禁 | 通过 | 客户端 typecheck、生产构建 |

## 16. 搜索与导入性能复查（2026-08-25）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 站内搜索首屏 | 每页 50 条降为 20 条，3 秒超时且不重试；只有站内为空才查询外部候选 | `searchView.vue`、客户端 typecheck/build |
| 索引滞后 | ES 零命中或不可用时回源动漫公开目录，新导入作品不必等待全量重建 | `SearchServiceTest.zeroHitIndexFallsBackToAnimeCatalog`、search 12/12 |
| 外部搜索 | 有效结果缓存 120 秒、空结果缓存 10 秒，并发同关键词请求单飞合并 | `ExternalSearchServiceTest.cachesAndMergesConcurrentExternalSearches`、search 12/12 |
| 导入查重 | 来源和标题从全表/N+1 查询改为单条 SQL，V9 增加部分索引 | `JdbcAnimeCatalogStore`、`V9__import_lookup_indexes.sql` |
| 选集抓取与写库 | 固定 8 路线程池一次提交全部选集，剧集快照批量写入 | `MediaImportService`、`JdbcAnimeMediaStore`、anime 76/76 |
| 外部耗时 | 代码与单元测试已完成；本轮真实来源请求被站点防火墙拦截，真实耗时为待环境复测 | `Invoke-WebRequest` 防火墙响应，不登记为性能通过 |

## 17. CI 与依赖安全门禁复查（2026-08-26）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 导入降级策略 | 保留；审核链路失败时，客户端仍可调用公开 `/anime/import-url` 完成降级导入 | `importRequestView.vue`、`anime.ts`、`AnimeController` |
| 管理后端门禁 | CI 由跳过测试改为执行 `mvn test`；管理代理端点增加方法级权限契约，仪表盘要求已登录 | `.github/workflows/ci.yml`、`AdminControllerSecurityTest` |
| 浏览器回归 | CI 构建客户端并执行季度排序、电影线路和清晰度三个自包含 Playwright 脚本 | `e2e/run-ci.mjs`、`pnpm e2e:ci` |
| 依赖安全 | Vite 6.4.3、Electron 44.0.0、Element Plus 2.14.5 已升级并固定；high/critical 漏洞由 `pnpm audit --audit-level high` 阻断 | `version-baseline.md`、三端 `package.json`、`pnpm-lock.yaml`、`.github/workflows/ci.yml` |
| 外部边界 | 分支保护、镜像发布、生产凭据与正式环境部署不在本次代码验证范围，状态不变 | `ci-cd.md`、`gap-register.md` v0.18 |

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-18 | v0.1 | 首轮全量文档评审 | 全量评审 |
| 2026-08-19 | v0.2 | 二轮评审：企业级文档完善与交叉引用校验 | 企业级文档完善 |
| 2026-08-21 | v0.3 | 修正桌宠透明无背景与客户端启动绑定；统一硅基流动/Qwen2.5-7B-Instruct/HTTP 402；新增文档变更规则、自动校验脚本和桌宠测试报告 | 文档一致性收口 |
| 2026-08-21 | v0.4 | 复查 Docker Compose：同步 Redis 健康检查、XXL-JOB MySQL full profile、环境变量、任务状态和 WSL 引擎外部阻塞；`pnpm docs:check` 通过 515 项 | T-B-03 配置修复与本地诊断 |
| 2026-08-21 | v0.5 | 复查 WSL2 恢复后的国内镜像拉取、full profile 健康检查和数据卷重启证据，清除旧的环境阻塞描述 | T-B-03 本地运行验收 |
| 2026-08-21 | v0.6 | 评审并登记公开媒体元数据导入与播放器文档、接口、迁移、配置、任务和外部版权差距 | T-D-08 媒体评审与实现 |
| 2026-08-21 | v0.6 | 复查 Docker 宿主机端口调整、统一中间件凭据和 MinIO 最低密码长度限制 | 端口与凭据实测 |
| 2026-08-21 | v0.7 | 复查 Redis ACL 用户与业务服务 username 配置 | Redis ACL 实测 |
| 2026-08-21 | v0.8 | 修复 Nacos 控制台端口缺失，增加 Kibana 8.17 控制台并同步 Docker 端口、镜像和健康检查文档 | Compose 配置、Nacos/Kibana HTTP 200、10 容器 healthy |
| 2026-08-21 | v0.9 | 按要求收口每个中间件仅一个宿主机端口，并同步 Nacos 单端口控制台访问地址 | Compose 端口配置与重启验证 |
| 2026-08-21 | v1.0 | 修复 MinIO/RabbitMQ 管理台不可访问，调整唯一宿主机端口并补充四个控制台入口与登录说明 | Compose 配置、HTTP 状态和管理页验证 |
| 2026-08-21 | v1.1 | 按 Nacos 3.x 默认 Console 配置恢复宿主机 `8080/` 入口，明确 API 端口仅在容器网络内使用 | Nacos Console 日志与 HTTP 验证 |
| 2026-08-21 | v1.2 | 将 XXL-JOB 管理台上下文调整为根路径，统一管理入口访问方式 | XXL-JOB 根路径 HTTP 验证 |
| 2026-08-21 | v1.3 | 复核统一中间件配置脚本、10 个服务连接矩阵、已有数据卷改密流程和文档引用 | `configure-middleware.ps1` AST、Compose 与本地中间件验证 |
| 2026-08-21 | v1.4 | 复查中间件实际数据导入脚本、数量校验、重复执行边界和 Nacos 配置种子 | `import-middleware-data.ps1` 成功执行与中间件查询结果 |
| 2026-08-21 | v1.5 | 修复 Nacos/网关端口状态、启动脚本进程保护和本机 Docker 联调边界；同步追溯与发布状态 | `run-local.ps1`、端口核对、文档自动检查 |
| 2026-08-21 | v1.6 | 复核媒体专项测试报告、接口 60/60、全量 Playwright 11 脚本和按钮报告当前计数 | 最终本地联调验证、`pnpm docs:check` |
| 2026-08-24 | v1.6 | 登记公开作品元数据导入扩展、封面多 CDN 白名单、管理端可执行 JAR 重打包和本地启动探测修复 | 5 项导入器单测、管理端/网关/动漫服务启动日志、作品导入输出 |
| 2026-08-24 | v1.7 | 复核作品批量导入结果（管理端 ID 127-140）；登记导入器单条继续处理、封面失败降级和已有封面保护；OAD 封面因来源 CDN 不可用保留为缺失状态 | `import-anime.mjs`、管理端 API、导入日志、`pnpm docs:check` |
| 2026-08-24 | v1.8 | 修复动漫服务旧动态占位路径导致的破图，增加通用占位封面并重启网关/动漫服务；复核 14 部作品发布状态、公开接口和封面 HTTP 结果 | 动漫模块 `63/63`、管理端与公开接口核对、封面 200、`pnpm docs:check` |
| 2026-08-24 | v1.9 | 将管理端 E2E 作品总量断言改为不低于初始种子基线，兼容公开作品导入和 E2E 新建数据；全量 Playwright 11 个脚本 549/549 通过 | `e2e:all`、`pnpm docs:check` |
| 2026-08-24 | v2.0 | 修复测试报告与文档地图、追溯矩阵、发布评估之间的旧基线漂移；按钮专项实测更新为 430/430，并将全量 E2E 549/549 纳入自动检查 | `node e2e/e2e-buttons.mjs`、`pnpm docs:check` |
| 2026-08-24 | v2.1 | 复查无职转生季度聚合和真实 HLS 播放；修复无分号播放器配置解析，登记 5 个代表作品、22/22 真实 HLS 专项、210/210 后端单测、563/563 全量 E2E 和 444/444 按钮体检 | `MediaImportServiceTest`、`mvn test`、`e2e-media-player-live.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v2.2 | 补齐作品 `127` 的两条媒体线路，切换不可播放线路并通过真实播放推进校验；同步季度聚合、搜索聚合和 28/28 专项证据 | `e2e-media-player-live.mjs`、管理端媒体导入接口、`pnpm docs:check` |
| 2026-08-24 | v2.3 | 复查 ArtPlayer 5.4.0 替换、HLS customType 接入、控制属性和资源销毁边界；同步播放器设计、测试计划、测试报告、任务与待办 | `e2e/e2e-media-player-live.mjs`、`pnpm --filter @sanye/sanye_client typecheck`、`pnpm docs:check` |
| 2026-08-24 | v2.4 | 按全量 Playwright 实际输出将当前按钮体检基线统一为 444/444，并同步自动文档检查入口和发布报告 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all`、`pnpm docs:check` |
| 2026-08-24 | v2.5 | 复查首页最近导入与最近更新合并规则，确认单一“最近更新”区块、导入优先和去重行为 | `homeView.vue`、`e2e-verify.mjs`、客户端 typecheck/build |
| 2026-08-24 | v2.6 | 复查首页精选推荐已切换为《你的名字》和《无职转生》，确认详情入口和封面路径 | `homeView.vue`、`e2e-verify.mjs`、客户端 typecheck |
| 2026-08-24 | v2.7 | 复查无职转生各篇章独立卡片、独立封面、搜索入口和客户端正式内容白名单；确认其他演示作品不再进入客户端内容层 | `animeRepositoryView.vue`、`searchView.vue`、`animeCatalog.ts`、客户端 typecheck |
| 2026-08-24 | v2.8 | 清理运行库中的历史演示、冒烟和 E2E 作品，正式数据基线收口为 127/128/133/135/136/137 六条记录；搜索全量重建先删除旧索引，避免残留测试文档 | `V7__remove_demo_test_catalog.sql`、`cleanup-anime-test-data.ps1`、`AnimeIndexService.syncAll()` |
| 2026-08-24 | v2.9 | 将内存回退目录和管理端失败回退同步收口为六部正式作品；修正按钮体检对 HLS 分片主动中止的误报，当前主链路 32/32、按钮 419/419、全量 Playwright 539/539；`pnpm docs:check` 通过 | `AnimeMemoryStore.java`、`contentView.vue`、`e2e-buttons.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v3.0 | 复核完整回归后的动态页面和正式片库数据基线，按钮体检更新为 428/428、全量 Playwright 更新为 548/548；保留历史记录，不回写旧版本数字 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all`、`pnpm docs:check` |
| 2026-08-24 | v3.1 | 清理 E2E 临时作品后复核正式片库，独立按钮体检 425/425、全量 Playwright 540/540（套件内按钮 420/420）；PostgreSQL 与 Elasticsearch 均保留 6 部正式作品 | `cleanup-anime-test-data.ps1`、`node e2e/e2e-buttons.mjs`、`pnpm e2e:all`、数据库/ES 查询 |
| 2026-08-24 | v3.1 | 复查并收口当前文档中的 15 部旧运行数据为 6 部正式片库；同步接口体检门槛、接口契约示例、发布/追溯/评测文档，并明确单元测试夹具与正式运行数据边界 | V7/V8 迁移、`interface-check.ps1`、`pnpm docs:check` |
| 2026-08-24 | v3.2 | 复查清晰度选择实现和测试证据，登记多码率 3/3、真实 HLS 34/34、全量 Playwright 548/548、后端 210/210 与三端构建门禁 | `e2e/e2e-media-quality.mjs`、`e2e/e2e-media-player-live.mjs`、`mvn test`、`pnpm e2e:all` |
| 2026-08-25 | v3.3 | 复查动漫系列与季度统一排序规则，登记片库和搜索乱序接口专项 2/2 与客户端编译证据 | `animeCatalog.ts`、`e2e/e2e-season-order.mjs`、客户端 typecheck/build |
| 2026-08-25 | v3.4 | 复查剧场版正片和语言线路展示，确认《你的名字》不再出现第一集、第二集文案 | `animeDetailView.vue`、电影线路专项 2/2、客户端 typecheck/build |
| 2026-08-25 | v3.5 | 复查作品元数据导入脚本可分享入口，登记位置参数 URL、交互粘贴、本地配置模板、预览模式和命令入口 | `import-anime.mjs`、`import-anime.env.example`、`pnpm test:anime-import`、`pnpm docs:check` |
| 2026-08-25 | v3.6 | 复查管理端 URL 一键导入入口，登记简介、封面和视频资源组合导入接口及前端按钮 | `AnimeUrlImportServiceTest`、`AdminAnimeController`、`contentView.vue`、管理端构建 |
| 2026-08-25 | v3.7 | 复查客户端作品导入申请入口和管理端反馈审核链路，确认客户端只提交申请、后台审核后导入 | `importRequestView.vue`、`FeedbackServiceTest`、`feedbackView.vue`、客户端/管理端类型检查 |
| 2026-08-25 | v3.8 | 复查作品导入降级策略，确认审核链路不可用时客户端可调用公开降级导入接口直通 | `AnimeController`、`anime.ts`、`importRequestView.vue`、动漫服务测试 |
| 2026-08-25 | v3.9 | 复查外部搜索候选链路，确认站内无结果时按 `yhdmtv.cc/search/index.html?keyword=` 展示候选并支持点击导入观看 | `ExternalSearchServiceTest`、`searchView.vue`、`search.ts`、搜索服务测试 |
| 2026-08-25 | v4.0 | 复查搜索框直接粘贴 `yhdmtv.cc/search/index.html?keyword=` URL 的解析链路，确认服务端会提取 `keyword` 后查询候选 | `ExternalSearchServiceTest`、搜索服务测试、客户端 typecheck/build、`pnpm docs:check` |
| 2026-08-25 | v4.1 | 复查外部搜索动态结果接口和真实多段 `/p/` 详情链接，确认重启后的直连、网关、关键词和完整 URL 输入均返回候选 | `ExternalSearchServiceTest` 10 项、Maven package、搜索服务日志、直连/网关接口实测 |
| 2026-08-25 | v4.2 | 复查 URL 导入故障修复，确认嵌套 `temLineList`、作品标题、客户端/管理端 60 秒请求超时和服务端 30 秒单页读取超时已同步 | `mvn -B -f sanye_server/pom.xml -pl sanye-server-anime -am test`、客户端/管理端 typecheck/build、网关导入实测、`pnpm docs:check` |
| 2026-08-25 | v4.3 | 复查 URL 导入集数和封面修复，确认详情页 2 集只导入 2 条、线路地址按 ID 匹配、封面不再命中站点 Logo | `MediaImportServiceTest` 9 项、`mvn -B -f sanye_server/pom.xml -pl sanye-server-anime -am test`、网关导入与剧集接口实测 |
| 2026-08-25 | v4.4 | 复查外部搜索直接观看/导入观看双路径和导入并发读取，确认直接观看不触发导入，导入后仍跳转站内播放器 | `searchView.vue`、`AnimeUrlImportService`、`MediaImportService`、anime 74 项测试、客户端 typecheck |
| 2026-08-25 | v4.5 | 修正外部候选存在时的空状态误提示；复查播放页 `imgUrl` 当前作品封面、当前页复用、2 集导入和真实导入耗时，并同步媒体设计文档版本 | `searchView.vue`、`MediaImportServiceTest` 10 项、动漫服务直连 URL 导入实测、anime 75 项测试、客户端 typecheck、`pnpm docs:check` |
| 2026-08-25 | v4.5 | 修正外部候选存在时的空状态误提示；复查播放页 `imgUrl` 当前作品封面、2 集导入和真实导入耗时，并同步媒体设计文档版本 | `searchView.vue`、动漫服务直连 URL 导入实测、客户端 typecheck、`pnpm docs:check` |
| 2026-08-25 | v4.6 | 将外部候选“直接观看”改为站内 `/watch/external` 只读预览，复用 ArtPlayer/HLS 播放器；同步预览接口契约、导入说明和媒体设计，并确认 76 项动漫测试通过 | `AnimeController`、`AnimeUrlPreviewResult`、`searchView.vue`、站内 Playwright 回归、动漫模块 surefire 报告、`pnpm docs:check` |
| 2026-08-25 | v4.7 | 复查搜索与导入性能优化，登记目录回源、外部缓存与请求合并、V9 查重索引、8 路受控抓取和剧集批量写入 | search 12/12、anime 76/76、客户端 typecheck/build、`pnpm docs:check` |
| 2026-08-26 | v4.8 | 复查 CI、管理端权限契约、浏览器安全回归和依赖漏洞门禁；确认公开导入降级策略保持不变 | `.github/workflows/ci.yml`、`AdminControllerSecurityTest`、`pnpm e2e:ci`、`pnpm audit --audit-level high` |
| 2026-08-26 | v4.9 | 登记按 AlphaFactory AiCoding 实例建立的 sanye_anime Memory OS 骨架、迁移边界、检索入口和契约初稿；明确 AlphaFactory 历史、内部路径和凭据未迁移 | `AiCoding/CONTENTS.md`、`AiCoding/MIGRATION-NOTICE.md`、`AiCoding/ledger/S001-bootstrap.md` |
