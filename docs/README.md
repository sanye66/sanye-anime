# sanye_anime 工程文档体系

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v2.31 |
| 文档状态 | 基线，企业级文档体系总览与文档地图 |
| 更新时间 | 2026-09-21 |
| 维护规则 | 遵循[文档变更规则](./document-change-rules.md)，新增/修订文档必须登记本文档索引并更新状态；文档间引用遵循第 3 节边界 |

更新记录：2026-09-21，v2.31，执行[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P6 的 VQ-31 高刷与物理呈现：新增 `presentationLayers.ts`，把源帧（媒体元素 `presentedFrames` 增量）、生成帧（GPU 完成计数，含补间帧）、合成器提交（渲染 Worker 每次提交绘制）与可观察呈现（画布作为可见层时的主线程动画帧数）分成四层分别记录，窗口固定标注 `physical: 'unverified'`，并按「刷新对齐 / 受刷新上限约束 / 计时器节拍 / 未确认」判读口径；`PresentationScheduler` 新增 `PresentationAlignment`，默认 `refresh` 在目标高于刷新能力时按刷新边界提交并按各自理想时刻补齐边界内到期时隙（上界 4），边界回调不交付时退回截止时刻计时器，`deadline` 保留隔离对照。新增专项入口 `e2e/high-refresh-presentation.test.cjs`（2 项通过）：本机 60Hz、1080p、30 FPS 源、锐化档下 120 目标窗口为源帧 30 · 生成帧 120 · 提交 120 · 呈现 60，被呈现帧相对刷新边界的陈旧度 P95 由隔离对照 17.3ms 降到 6.5ms；同一改动使 `e2e/realtime-interpolation.test.cjs` 的 1080p / 30 FPS → 120 目标锐化门禁由 111/111/96 FPS 且末窗降档到 60 变为 120/120/119 FPS、帧间隔 P95 8.33ms、跳过期时隙 0，`e2e/player-quality.test.cjs` 的 1080p 高刷矩阵 17 组全部通过（144 为 146/143、165 为 167/164、240 平衡到性能档后为 233/227）。实现决策、验收口径与命令证据分别见 D-029、播放器设计、测试计划与专项报告；120/144/165Hz 物理呈现、整片、跨显卡与桌面安装物仍待环境。

更新记录：2026-09-21，v2.30，执行[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P6 的 VQ-30 画质可观测性：新增汇总模块 `qualityObservability.ts`，按一秒窗口合并实际清晰度档位（生效档、阶梯最高档、升档带宽需求、窗口尺寸上限、手动/自动来源、带宽估计）与渲染 Worker 的 `stallFrames`、`analysisWidth`、`qualityFallbacks`、媒体等待次数，原因按「手动选择 → 记忆回落 → 窗口尺寸上限 → 带宽不足 → 播放停顿 → 带宽自适应」归纳；档位变化给一次瞬时提示，清晰度菜单新增「当前清晰度说明」可查询入口，最近 30 个窗口挂到播放器实例 `sanyeQualityWindows` 作为诊断通道，不新增常驻面板。新增专项入口 `e2e/quality-observability.test.cjs`（4 项通过，开发服务与生产构建预览各一次）：真实降档窗口为 `当前 360P（最高 720P）：带宽自适应：估算 3.2Mb/s`，同窗口落后帧 21–25、运动分析宽度 128、回退历史为空，界面提示与窗口汇总逐字一致，可查询说明等于最新窗口摘要。实现决策、验收口径与命令证据分别见播放器设计、测试计划和专项报告；真实显卡、片源、跨网络、跨设备与桌面安装物仍待环境。

更新记录：2026-09-21，v2.29，执行[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P6 的 VQ-29 补帧延迟自适应收缩：新增判定模块 `interpolationDelayPolicy.ts`（下限 = 2 个源帧间隔、上限 150ms；未接管呈现前按实测需要加宽，连续干净窗口有余量时逐级收缩，目标越过最新源帧时按步恢复余量），帧队列保留深度按会话上限计算，音频延迟用 40ms 斜坡跟随，`interpolationDelay: 'fixed'` 保留固定 150ms 隔离对照。新增专项入口 `e2e/interpolation-delay-adaptive.test.cjs`（5 项通过）：三次运行的三轮中位数显示首帧 → 补间层就绪由 192.9/211.7/196.6ms 降到 114.4/119.5/116.9ms，定位后原画窗口由 262.0/267.6/257.4ms 降到 176.1/181.3/175.1ms，音画偏差 0ms、正常推进回跳 0、输出尺寸与档位不变。实现决策、验收口径与命令证据分别见播放器设计、测试计划和专项报告；真实显卡、片源、跨设备与桌面安装物仍待环境。


更新记录：2026-09-20，v2.28，执行[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P6 的 VQ-28 仅增强路径移入渲染 Worker：主线程与 Worker 共用档位链路 `profileShaderChain`，Worker 新增 `interpolation: false` 执行模式（不建运动估计线程、无插值延迟与音频路由、固定不补帧、不做自动降档）与仅增强专用绘制路径，`enhancementPath` 保留一键回到原路径并支持初始化失败自动回退，统计新增 `enhancementOnly`。新增专项入口 `e2e/enhancement-thread-migration.test.cjs`（5 项通过）：五档同源同尺寸 RGB 像素对照逐字节一致（性能档 alpha 差异单独记录）；640×360 30 FPS 受控窗口主线程长任务由 61 次（最长 65ms）降为 0，帧间隔中位数 33.3ms。实现决策、验收口径与命令证据分别见播放器设计、测试计划和专项报告；真实显卡、片源与桌面安装物仍待环境。

更新记录：2026-09-20，v2.27，执行[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P6 的 VQ-27 源帧率达标跳过光流补帧：新增中位数判定模块 `interpolationDemandPolicy.ts`（源帧率 `≥ 目标 × 0.92` 且覆盖 400ms / 6 样本进入旁路，`≤ 目标 × 0.8` 且覆盖 700ms / 8 样本才回到补帧），主线程按媒体时间上报相邻画面间隔，渲染 Worker 在旁路时不再缩放、投递光流分析与上传运动场，只保留增强与原帧呈现，统计新增 `interpolationNeed`、`flowSkippedFrames` 与 `interpolationDemand`，并以 `interpolationDemand: 'always'` 保留隔离对照。新增专项入口 `e2e/interpolation-bypass.test.cjs`（9 项通过）；真实 60 FPS 播放每窗跳过 45–49 次光流分析、分析次数 0、合成帧 0、停顿帧 0，对照每帧纹理上传中位数 3.05 对旁路 1.0。实现决策、验收口径与命令证据分别见播放器设计、测试计划和专项报告；真实片源、跨显卡与桌面安装物仍待环境。

更新记录：2026-09-20，v2.26，执行[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P6 的 VQ-26 增强档位有界恢复：降档由“3 个慢帧即永久降档”改为墙钟持续压力判定（800ms、不少于 3 个样本），恢复加入 5 秒冷却、3 秒稳定门槛、失败退避与可恢复上限；新增判定模块 `enhancementBudgetPolicy.ts` 与专项入口 `e2e/enhancement-recovery.test.cjs`。实现决策、验收口径与命令证据分别见播放器设计、测试计划和专项报告；真实显卡、片源与桌面安装物仍待环境。

更新记录：2026-09-20，v2.25，执行[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P6 的 VQ-25 起播清晰度记忆：按播放地址记录上次成功的实际档位与阶梯签名（自动 7 天、手动 30 天），起播优先定档，超时或致命失败回落低档并作废记录；起播时间线入口新增记忆、过期与带宽不足场景。实现决策、验收口径与命令证据分别见播放器设计、测试计划和专项报告；VQ-26 以后与真实片源、桌面安装物仍待环境。

更新记录：2026-09-20，v2.24，登记[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)新阶段 P6 方案（VQ-25～VQ-31）：起播清晰度、增强档位有界恢复、源帧率达标跳过补帧、仅增强路径移入 Worker、原画窗口自适应、画质可观测性与高刷复测，并新增起播时间线测量入口 `e2e/startup-quality-timeline.test.cjs`。条目均为待执行，产品口径待确认。

更新记录：2026-09-20，v2.23，按用户反馈修正画质偶尔波动（VQ-24）：不再把采集间隔当作时间轴跳变重建管线，目标落在帧窗口外时用最近可用帧维持增强与补间层，只有内容停止推进 800ms 才回退并自动恢复；新增画质稳定性观测入口 `e2e/quality-fluctuation.test.cjs`。根因、受控窗口与未解决项见播放器设计与专项报告。

更新记录：2026-09-20，v2.22，按用户反馈修正进度条更新缓慢并测量拖动定位与播放期卡顿：进度条写入改为跟随播放期动画帧，新增专用测量入口 `e2e/progress-seek-latency.test.cjs`。未解决项（定位后原画窗口、仅增强路径在主线程执行）保留在播放器设计与专项报告，不由无头浏览器结果推定真实显卡与网络定位表现。

更新记录：2026-09-20，v2.21，[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)补充 P1 工作包 VQ-19～VQ-21：刷新对齐展示时钟、长帧与处理阻塞治理、画质保护。实现决策、验收口径和命令证据分别见播放器设计、测试计划和专项报告，不由无头浏览器结果推定物理高刷、整片或桌面安装物表现。

更新记录：2026-09-18，v2.20，[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)执行第四步 P3：RIFE v4.6 许可、隔离推理和同源光流对照；本机决策为暂不采用，实时链路未验证，P4 条件未满足。状态、决策和实测分别见任务清单、播放器设计与专项报告。

更新记录：2026-09-18，v2.19，[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)进入第三步 P2 运动、GPU 管线和档位预算；任务状态及有限收益分别见任务清单、播放器设计和专项报告，不由局部指标推定全部画质场景改善。

更新记录：2026-09-18，v2.18，[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)进入第二步 P1 调度、启动及设备评估；任务状态、技术决策及同源对照分别维护在任务清单、播放器设计和专项报告。

更新记录：2026-09-18，v2.17，[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)进入 P0 执行，正式任务状态与证据分别维护在任务清单和播放器报告；后续阶段、真实素材及物理显示验收不由受控基线推定完成。

更新记录：2026-09-18，v2.16，登记[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)草案，包含真实样本评估、调度成本、GPU 管线、神经补帧和实际显示验收；计划不代表已实现或已发布。

新增运维入口：[独立环境备份与恢复](./backup-recovery.md)，涵盖 T-R-04 的数据范围、工具配置、非覆盖恢复、应用验收和 RPO/RTO 口径。

更新记录：2026-09-10，v2.9，登记独立恢复操作说明；依据 `recovery.mjs`、专项测试及开发任务清单。

## 一键操作入口（2026-09-16）

更新记录：2026-09-16，v2.13，登记[一键操作脚本](../sanye_tools/README.md)，集中提供免安装打包、前端启动、桌面测试、文档检查和输出目录入口；完整构建流程与验证边界见[本地桌面运行与打包](./local-desktop.md)。

## 当前核对（2026-09-10）

新增[第三方许可说明](./third-party-notices.md)，区分项目自有代码 MIT 授权、第三方组件原有许可与素材权利。更新记录：2026-09-10，v2.12，登记免费签名申请前的许可边界核对。

新增[本地桌面运行与打包](./local-desktop.md)，记录本机服务交付、便携运行时与独立数据目录。更新记录：2026-09-10，v2.11，登记桌面交付技术入口。

新增[当前代码、进度与可用性审计](./current-status-audit.md)，集中记录本次检查、历史证据和正常使用阻塞。本文地图中的 8 月测试数字属于历史基线；当前结果与任务状态分别以审计和开发任务清单为准。

更新记录：2026-09-10，v2.10，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

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
| [安卓独立版需求](../product/android-requirements.md) | 独立边界与功能建议，尚未变更已有冻结范围 | 草案 |
| [原型说明](../product/prototypes/README.md) | 交互原型清单与演示方式 | 基线 |

### 2.2 架构与设计域（docs/，面向实现）

| 文档 | 定位 | 状态 |
| --- | --- | --- |
| [技术架构](./technical-architecture.md) | 微服务拆分、技术选型、部署拓扑、运行边界 | 基线 |
| [详细技术设计](./technical-design.md) | 模块级设计（认证/内容/AI/搜索/文件/监控/安全章节） | 基线 |
| [全功能性能优化方案与教学](./performance-optimization-guide.md) | 客户端、管理端、服务端与桌宠的性能方案、原理教学和体积门禁 | 基线 |
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
| [画质与帧率进阶优化开发计划](./player-quality-development-plan.md) | 五个优化方向、阶段依赖、工作包、模型评估与显示验收 | 基线，P0～P3 状态见任务清单；P3 暂不采用，P4 条件未满足；P6 的 VQ-25～VQ-31 已实施（VQ-31 在本机 60Hz 完成分层计量与呈现对齐，120/144/165Hz 物理呈现待环境） |
| [开发任务清单](./development-tasks.md) | 任务拆分、依赖、完成定义、完成记录（含证据） | 基线 |
| [开发待办事项](./development-todo.md) | 每日/每项任务推进日志 | 基线 |
| [桌宠开发计划](./desktop-companion-development-plan.md) | 桌宠实现阶段、工期和发布门禁 | 基线 |
| [安卓独立版开发计划](./android-development-plan.md) | Windows 复用矩阵、12 板块开发、完整链路与安卓独立验收 | 草案 |
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

### 2.7 AI 编码记忆系统（AiCoding/，面向检索与治理）

| 文档 | 定位 | 状态 |
| --- | --- | --- |
| [AiCoding 入口](../AiCoding/CONTENTS.md) | Memory OS 分层、会话启动顺序和当前入口 | 草案 |
| [AiCoding 迁移说明](../AiCoding/MIGRATION-NOTICE.md) | AlphaFactory 实例到 sanye_anime 的迁移边界和敏感信息规则 | 基线 |
| [AiCoding 检索指南](../AiCoding/index/retrieval-guide.md) | 按任务选择最小上下文 | 基线 |
| [AiCoding 工作流策略](../AiCoding/policy/agent-workflow-policy.md) | AI 编码读取、写入、验证和提交协议 | 基线 |

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
| 2026-08-26 | v2.7 | 增加 AiCoding Memory OS 入口、迁移边界、检索指南和 AI 编码工作流索引；明确其不替代 product/docs 唯一事实源 | `AiCoding/CONTENTS.md`、`AiCoding/MIGRATION-NOTICE.md` |
| 2026-08-26 | v2.8 | 增加全功能性能优化方案与教学文档，登记三端入口体积门禁、服务端查询与并发优化证据 | `pnpm perf:check`、Maven 定向 Reactor、`pnpm docs:check` |
| 2026-09-17 | v2.14 | 登记安卓独立版开发计划，明确与 Windows 解耦、无服务器首版边界及真机验收门禁 | `docs/android-development-plan.md` |
| 2026-09-17 | v2.15 | 同步安卓 v0.2 产品和技术草案，补充 Windows 复用依据、板块依赖、失败恢复与链路验收，合并重复索引 | 安卓需求与开发计划；`pnpm docs:check` |
