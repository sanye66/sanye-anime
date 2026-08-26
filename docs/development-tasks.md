# sanye_anime 开发任务拆分与排期清单

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v2.3 |
| 文档状态 | 基线，P0 任务清单已拆分并持续记录实现与验收证据；搜索与导入性能优化已完成代码验证，真实来源耗时待环境复测 |
| 关联任务 | PRE-TODO-007（拆分开发任务并估时） |
| 关联文档 | [开发计划](./development-plan.md)、[详细技术设计](./technical-design.md)、[MVP 冻结清单](../product/mvp-freeze.md)、[开发待办事项](./development-todo.md) |
| 更新时间 | 2026-08-25 |

## 1. 拆分规则

1. 每个任务原则上 1 至 3 个有效工作日，可独立开发、测试和验收。
2. 每个任务承载一个可验收的业务结果，进入 `feature/<task>` 分支，合并前通过自动检查门禁。
3. 完成定义（DoD）通用项：代码实现 + 单元/集成测试 + 配置与迁移 + 日志脱敏 + 页面状态矩阵对应状态 + 运行验收证据；具体见各任务“完成定义”。
4. 任务之间只记录必要依赖；同阶段无依赖的任务可以并行（单人开发按顺序执行）。
5. 外部门禁（GAP/G 系列）未关闭的任务保持 `blocked-external`，不进入代码实现。

## 2. P0 任务清单

### 阶段 B：工程基础（预算 16 天，微服务与前端基线 D-024/D-025）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-B-01 | 仓库与分支规范落地 | 无 | 低 | 1d | feature/dev/test/release 分支规则、提交规范、合并清单写入 README/AGENTS；分支保护说明可用 | 开发计划 8.1 |
| T-B-02 | 自动检查门禁 | T-B-01 | 中 | 2d | 前端 typecheck/build、Java 编译与单测、依赖扫描、密钥扫描在 CI 可执行；失败阻止进入 test | TODO-012 |
| T-B-03 | 本地基础设施 Compose | T-B-01 | 高 | 2d | PostgreSQL/Redis/RabbitMQ/ES/MinIO/Nacos/Sentinel/XXL-JOB 固定镜像 + 健康检查 + 持久化卷；新机器可一键启动 | TODO-011 |
| T-B-04 | PostgreSQL 迁移与种子基线 | T-B-03 | 中 | 1d | Flyway 依赖、`spring.flyway` 配置与各服务 `V1__init.sql`（含 Outbox 表）已在 T-B-05 落地；本任务在 PG 就绪后执行空库/重复执行验证并补充种子数据 | TODO-003、TODO-004 |
| T-B-05 | 多服务工程骨架与网关 | T-B-01 | 高 | 3d | Maven 多模块（core/gateway + 8 服务）；共享 core（统一响应、错误码、异常、请求 ID、AuthContext、日志脱敏）；网关骨架（路由、鉴权前置、公开白名单）；每个服务独立 main/配置/端口；单元测试覆盖 | 设计 2、4、8.8 节 |
| T-B-06 | 基础设施运行验收 | T-B-03、T-B-04 | 高 | 2d | 管理端真实登录、权限路由、Quartz 生命周期与业务服务连接验收通过 | TODO-001 至 TODO-009 |
| T-B-07 | 服务间调用基线 | T-B-05 | 高 | 2d | OpenFeign 统一配置（超时/重试/熔断）、requestId 与调用方身份透传、公开 Feign 契约、幂等调用规则；跨服务调用冒烟通过 | 设计 8.1 节 |
| T-B-08 | 前端工程化与网关对接基线 | T-B-05、T-B-07 | 高 | 3d | ApiClient（token/requestId/错误码/重试）、路由守卫与 CAS 登录态、环境变量与网关地址、SSE 客户端、错误边界与 Web Vitals 上报、Nginx 静态托管与路由回退；客户端/官网/管理前端均可经网关访问 | 设计 16 节、C-P0-01 |

### 阶段 C：最小垂直链路（预算 12 天，微服务基线 D-024）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-C-01 | 客户端壳层与路由 | 无 | 中 | 2d | 左侧导航、顶部工具栏、用户区、亮暗主题正式实现；1100px 布局可用；路由与状态矩阵一致 | C-P0-01、C-P0-09 |
| T-C-02 | 首页壳层与一个作品详情页 | T-C-01 | 中 | 2d | 首页壳层 + 1 个作品详情页接真实接口；返回路径闭环；空/失败状态占位 | C-P0-02、C-P0-05 |
| T-C-03 | 匿名身份与额度最小链路 | T-C-01 | 中 | 3d | deviceId 匿名身份、额度键、幂等键、登录引导占位可用；无账号可完成一次 AI 请求 | C-P0-08、C-P0-09 |
| T-C-04 | AI 最小闭环（SSE + 推荐） | T-C-02、T-C-03 | 高 | 3d | 发送问题 → LangChain4j 流式回答 → 推荐卡片 → 回到详情；断线/停止/失败状态最小可用 | C-P0-06、C-P0-07 |
| T-C-05 | 网关路由与跨服务链路 | T-C-04、T-B-07 | 高 | 2d | 网关按服务名路由、鉴权前置与公开白名单；首页→auth/anime→ai_chat 跨服务链路打通；请求 ID 贯穿三服务 | C-P0-01、C-P0-08 |

### 阶段 D：首页与内容（预算 15 天）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-D-01 | 首页聚合接口与缓存 | T-C-02 | 中 | 3d | Banner/分区/卡片单次聚合返回；Redis 缓存 + 空值缓存 + TTL 抖动 + 事件失效；穿透/击穿/雪崩防护 | C-P0-02 |
| T-D-02 | 番剧仓库列表与筛选 | T-C-02 | 低 | 2d | 类型/状态/年份/关键词组合筛选 + 分页；只返回 PUBLISHED；空数据状态 | C-P0-04 |
| T-D-03 | 搜索结果页（ES） | T-B-03、T-B-04 | 高 | 3d | 索引/增量同步/别名重建/下架删除；BM25 查询 + 分页 + 高亮；ES 不可用降级 | C-P0-03 |
| T-D-04 | 作品详情完善 | T-C-02 | 中 | 2d | 角色、排期、相似作品、收藏状态、下架可见性；详情缓存与失效 | C-P0-05 |
| T-D-05 | 客户端首页前端 | T-D-01 | 中 | 2d | 分类/Banner/榜单/排期/卡片正式实现；图片失败占位；空分区隐藏 | C-P0-02 |
| T-D-06 | 官网 P0 页面与公开接口 | T-D-01 | 中 | 3d | 公开首页/产品介绍/下载/法律四页 + 公开只读接口；法律文案占位可配置；发布可见性正确 | O-P0-01 至 O-P0-05 |
| T-D-07 | 官网正文编辑 | T-D-06 | 低 | 2d | RuoYi 正文编辑（草稿/发布）+ 受控接口 + `/public/legal` 公开只读 + 官网 API 优先；GAP-013 文案审查前占位 | GAP-013、O-P0-05 |

### 阶段 D 增量任务（2026-08-21）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-D-08 | 公开媒体元数据导入与播放器 | T-D-04、T-F-03 | 高 | 3d | 授权来源白名单导入、剧集元数据持久化、客户端 iframe/video 播放器、选集切换、管理端导入、SSRF/版权边界测试 | [媒体评审](./media-import-review.md)、[媒体测试计划](./media-player-test-plan.md)、GAP-016 |

### 阶段 E：AI 核心能力（预算 20 天）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-E-01 | LangChain4j 集成基线 | T-C-04 | 高 | 3d | 模型适配层 + ChatMemory + ChatMemoryStore 持久化 + AiServices 接口；配置经环境变量/Nacos | C-P0-06 |
| T-E-02 | 会话与消息持久化 | T-E-01 | 中 | 2d | 会话 CRUD、消息唯一约束、历史打开/删除、所有权校验；状态矩阵一致 | C-P0-06、C-P0-09 |
| T-E-03 | RAG 检索 | T-E-01、T-D-03 | 高 | 3d | ES ContentRetriever（BM25、PUBLISHED 过滤、top-k）；剧透/安全规则文档注入；引用回源校验 | C-P0-06 |
| T-E-04 | 剧透模式与安全拒答 | T-E-01 | 高 | 2d | SAFE 提示词 + 规则文档 + 输出二次校验；拒答与剧透评测用例第一批通过 | C-P0-06、6.5 节 |
| T-E-05 | 停止/重试/断线补拉 | T-E-01 | 高 | 3d | 流 token 取消、generate_try 幂等、停止后不再注入、补拉接口 | C-P0-06、7.6 节 |
| T-E-06 | 额度系统 | T-E-01 | 高 | 3d | Redis Lua 原子扣减、预占/退还、request_id 唯一落账、对账任务；匿名 5/登录 30 | C-P0-06、D-006 |
| T-E-07 | 推荐卡片链路 | T-E-03 | 中 | 2d | 结构化输出解析、animeId 回源校验、前端卡片与详情跳转 | C-P0-06 |
| T-E-08 | AI 前端工作区 | T-E-01、T-E-02、T-E-03、T-E-04、T-E-05、T-E-06、T-E-07 | 中 | 2d | 空状态/会话列表/输入/流式展示/停止/重试/额度提示全部按状态矩阵实现 | C-P0-06、C-P0-09 |

### 阶段 F：账户与管理（预算 12 天）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-F-01 | CAS 完整接入 | T-C-03 | 高 | 3d | CAS 登录回调、serviceValidate、SLO、账号映射/自动建号、退出；ticket 防重放与限流 | C-P0-08、D-020 |
| T-F-02 | 收藏与我的 | T-F-01 | 中 | 3d | 收藏/取消（唯一约束）、我的页、历史记录、未登录引导；空状态 | C-P0-08 |
| T-F-03 | 管理端协作接口 | T-B-06 | 高 | 2d | 受控接口 + 服务间凭证 + 角色二次校验；内容审批写业务端单一数据源 | A-P0-03、A-P0-04 |
| T-F-04 | 管理端前端接口绑定 | T-F-03、T-D-04 | 中 | 3d | 内容管理/反馈处理页面绑定真实接口；加载/空/失败/无权限状态完整 | A-P0-02 至 A-P0-06、TODO-007 |
| T-F-05 | 任务管理接入 | T-B-06 | 中 | 1d | XXL-JOB 查看/立即执行/重试 + 权限控制 + 执行记录 | A-P0-07 |

### 阶段 G：质量与运维（预算 14 天，微服务基线 D-024）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-G-01 | 自动化测试门禁 | T-C-04、T-D-03、T-E-08、T-F-04 | 中 | 3d | 单元/集成/并发/缓存测试；核心覆盖率 ≥70%；Testcontainers 可用 | 开发计划 13.1 |
| T-G-02 | 安全整改与测试 | T-E-04、T-F-01 | 高 | 3d | 越权/注入/上传/SSRF/refresh 复用测试；FastJson2 替换；密钥扫描通过 | TD-10、6.7 节 |
| T-G-03 | 备份恢复与监控 | T-B-03、T-B-06 | 中 | 2d | PG 每日备份 + 恢复演练；HikariCP/线程池/队列/任务指标与告警 | TODO-013、TODO-014 |
| T-G-04 | AI 评测集与回归 | T-E-04 | 中 | 2d | ≥100 条评测集；剧透 ≥95%、引用 ≥90%、推荐可打开 ≥95% | 开发计划 11.1 |
| T-G-05 | 性能与稳定性 | T-E-08、T-F-02 | 中 | 2d | 线程池/连接池压测标定；弱网、断网、超时、重复点击场景通过 | TD-13 |
| T-G-06 | 跨服务故障与链路监控 | T-G-05 | 中 | 2d | 服务依赖故障注入（auth/anime/ai_chat 不可用）降级验证；网关与服务指标、跨服务 requestId 链路与告警通过 | 监控方案、设计 10 节 |

### 阶段 H：预发布回归（预算 10 天）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-H-01 | 全链路回归 | T-G-01、T-G-02、T-G-03、T-G-04、T-G-05 | 中 | 3d | 客户端/官网/管理端 E2E；1100/1280/1440 布局；登录/未登录双状态 | 开发计划 14 |
| T-H-02 | 发布候选与回滚 | T-H-01 | 中 | 2d | 发布检查清单、数据库变更检查、备份确认、回滚演练、已知问题记录 | TODO-015 |
| T-H-03 | 安全与合规复查 | T-G-02 | 高 | 2d | 法律文案（GAP-013）、版权证据（GAP-005）、日志脱敏复查；发布前清单通过 | GAP-013、GAP-005 |
| T-H-04 | 异常与兼容性专项 | T-G-05 | 中 | 3d | 断网/模型超时/队列故障/管理端依赖故障降级验证；P0 缺陷为 0 | 开发计划 14 |

### 阶段 I：上线与复盘（预算 6 天）

| 编号 | 任务 | 依赖 | 风险 | 估时 | 完成定义（关键项） | 关联 |
| --- | --- | --- | --- | ---: | --- | --- |
| T-I-01 | 灰度发布与观察 | T-H-02 | 中 | 2d | 小范围灰度；观察错误率、AI 成本、队列堆积与数据写入；回滚条件明确 | 开发计划 15 |
| T-I-02 | 正式发布与回滚验证 | T-I-01 | 中 | 2d | 全量发布；按手册完成一次实际回滚演练并记录 | 开发计划 15 |
| T-I-03 | 复盘与文档归档 | T-I-02 | 低 | 2d | 发布证据、已知问题、监控基线、下一版本计划归档 | 开发计划 18 |

## 3. 依赖顺序总览

```text
T-B-01 -> T-B-02 -> T-B-05
       -> T-B-03 -> T-B-04 -> T-B-06 -> T-F-03 -> T-F-04
                                     -> T-F-05
                                     -> T-G-03
T-B-05 -> T-B-07 -> T-C-05
T-B-05/T-B-07 -> T-B-08
T-B-01 -> T-C-01 -> T-C-02 -> T-C-04 -> T-E-01 -> T-E-02/T-E-03/T-E-04/T-E-05/T-E-06
T-C-01 -> T-C-03
T-B-03/T-B-04 -> T-D-03 -> T-E-03
T-C-04/T-B-07 -> T-C-05
T-C-02 -> T-D-01 -> T-D-05 / T-D-06
       -> T-D-02 / T-D-04
T-E-03 -> T-E-07 -> T-E-08
T-E-01..T-E-07 -> T-E-08
T-C-03 -> T-F-01 -> T-F-02
T-G-01/T-G-02/T-G-04/T-G-05 -> T-H-01 -> T-H-02 -> T-I-01 -> T-I-02 -> T-I-03
T-G-02 -> T-H-03
T-G-05 -> T-H-04
T-G-05 -> T-G-06 -> T-H-01
```

## 4. 工期汇总与计划一致性核对

| 阶段 | 任务数 | 合计（有效工作日） | 开发计划预算 | 一致性 |
| --- | ---: | ---: | ---: | --- |
| B 工程基础 | 8 | 16 | 16 | 一致（D-024/D-025） |
| C 垂直链路 | 5 | 12 | 12 | 一致（D-024） |
| D 首页与内容 | 6 | 15 | 15 | 一致 |
| E AI 核心 | 8 | 20 | 20 | 一致 |
| F 账户与管理 | 5 | 12 | 12 | 一致 |
| G 质量与运维 | 6 | 14 | 14 | 一致（D-024） |
| H 预发布回归 | 4 | 10 | 10 | 一致 |
| I 上线与复盘 | 3 | 6 | 6 | 一致 |
| 核心合计（不含前置门禁） | 45 | 105 | 105 | 一致（D-024/D-025） |
| 前置门禁 A（已完成） | - | 8 至 10 | 8 至 10 | 一致 |
| 核心 MVP 合计 | - | 113 至 115 | 113 至 115 | 一致（D-024/D-025） |

另预留 2 至 4 周缓冲处理返工、外部依赖和重大问题；桌宠增量 22 个有效工作日另计（见第 6 节）。

## 5. P0 功能覆盖核对

| P0 功能 | 覆盖任务 |
| --- | --- |
| C-P0-01 主窗口与壳层 | T-C-01、T-C-05、T-B-08 |
| C-P0-02 首页 | T-C-02、T-D-01、T-D-05 |
| C-P0-03 搜索结果页 | T-D-03 |
| C-P0-04 番剧仓库 | T-D-02 |
| C-P0-05 作品详情 | T-C-02、T-D-04 |
| C-P0-06 AI 工作区 | T-C-04、T-E-01 至 T-E-08 |
| C-P0-07 详情进入 AI 并返回 | T-C-04、T-E-08 |
| C-P0-08 登录引导、收藏、我的 | T-C-03、T-F-01、T-F-02 |
| C-P0-09 页面状态全覆盖 | T-C-01、T-C-03、T-D-02、T-E-02、T-E-08、T-F-04 |
| O-P0-01、O-P0-02、O-P0-03、O-P0-04、O-P0-05 官网 | T-D-06 |
| A-P0-01 登录与权限 | T-B-06、T-F-03 |
| A-P0-02、A-P0-03、A-P0-04、A-P0-05、A-P0-06 管理端 | T-F-03、T-F-04 |
| A-P0-07 任务管理 | T-F-05 |

## 6. P1 桌宠任务登记（核心 MVP 稳定后执行）

桌宠任务沿用 [桌宠开发计划](./desktop-companion-development-plan.md) 与开发待办 PET-TODO-001 至 PET-TODO-008，有效工作量 22 天，另预留 5 天处理 Windows 缩放、多屏、素材和安装问题。进入桌宠阶段前重新评估任务粒度并登记到本文档。

## 7. 拆分后验证记录（2026-08-18）

1. 每个任务估时均为 1 至 3 个有效工作日（45 个任务全部满足）。
2. 依赖图无环，且按 B→C→D→E→F→G→H→I 可顺序执行；同阶段无依赖任务可并行。
3. 核心阶段合计 105 天，加前置门禁 A（8 至 10 天）共 113 至 115 天，与开发计划一致（微服务与前端基线 D-024/D-025）。
4. MVP 冻结清单中客户端 9 项、官网 5 项、管理平台 7 项 P0 全部有覆盖任务。
5. 外部门禁任务（CAS 服务器、AI 供应商、法律文案、版权、RuoYi 运行环境）保持 `blocked-external` 或 `待环境`，不进入代码实现。
6. 任务清单与详细技术设计章节一一对应，无设计缺口任务。
7. 2026-08-18 按决策 D-024/D-025 重新基线：新增 T-B-07（服务间调用基线）、T-B-08（前端工程化与网关对接）、T-C-05（网关路由与跨服务链路）、T-G-06（跨服务故障与链路监控），阶段预算与总计已同步调整。
8. 前端与全部工程已纳入规划：`sanye_client`（客户端+官网）、`sanye_admin`、`sanye_deploy`、`sanye_website`（过渡）、桌宠 P1 与监控栈，见技术架构 3.3 节与详细技术设计 16 节。

## 8. 正式开发启动记录

- 2026-08-18 用户确认进入正式业务代码开发；前七项门禁证据已核对通过。
- 首个任务分支 `feature-T-B-01` 已创建（仓库存在历史 `feature` 分支，Git 不允许 `feature/<task>` 同名前缀，暂用连字符形式；`feature` 分支归档后恢复 `feature/<task>`，见决策 D-023），承载 T-B-01（仓库与分支规范）。
- T-B-01 完成定义已达成：分支规则、提交规范、合并自查清单已写入 AGENTS.md；T-B-02 自动检查门禁已完成。

## 9. 执行记录

| 任务 | 状态 | 证据 | 完成日期 |
| --- | --- | --- | --- |
| T-B-01 仓库与分支规范 | 已完成 | AGENTS.md 分支/提交/合并规范落地；任务分支 `feature-T-B-01` 创建 | 2026-08-18 |
| T-B-02 自动检查门禁 | 已完成 | [.github/workflows/ci.yml](../.github/workflows/ci.yml)（前端、后端、依赖扫描、密钥扫描四作业）；本地验证：YAML 校验、`pnpm typecheck`、`pnpm build`、`mvn -f sanye_server/pom.xml test`、`mvn -f sanye_admin_server/pom.xml package -DskipTests=true`、密钥模式扫描全部通过 | 2026-08-18 |
| T-B-03 本地基础设施 Compose | 已完成（本地验证） | `compose.yaml` 已补齐 Redis 密码健康检查、MinIO `9001`、RabbitMQ `15672`、Nacos Console `8080/`、Kibana `5601` 和 XXL-JOB 根路径 `18080/` 管理入口，以及各服务健康检查和 XXL-JOB MySQL 8.4.5 + 3.1.0 初始化表；通过 DaoCloud/dockerproxy 国内镜像完成拉取；最小环境与 `full` profile 共 10 个容器全部 healthy，每个对外暴露的中间件只映射一个宿主机端口，五个管理入口和其他服务端口返回 200，保留数据卷重启后状态和初始化数据有效 | 2026-08-21 |
| T-B-05 多服务工程骨架与网关 | 已完成 | `sanye_server` 重构为聚合父工程 + 11 个模块（`sanye-server-core`、`sanye-server-web`、`sanye-server-gateway` + 8 个业务服务）；每个服务独立 main/配置/端口，网关含路由与请求 ID 过滤器；`mvn -f sanye_server/pom.xml test` 全部模块构建成功（core 6 用例 + web 契约 3 用例通过） | 2026-08-18 |
| T-B-07 服务间调用基线 | 已完成 | 新增 OpenFeign 基线（`FeignSupportConfig` 开启 Feign、默认 `Retryer.NEVER_RETRY`）、请求头透传（X-Request-Id/X-User-Id/X-Device-Id/X-Caller-Name）、错误解码映射（401/403/404/429/5xx → 业务错误码）、默认连接/读超时（feign-defaults.yml 由 8 个服务导入）；`mvn test` 全模块通过（web 7 用例含 Feign 4 用例）；跨服务冒烟已执行并持续覆盖（AI 推荐回源、favorite 回源、dashboard 聚合、legal 代理，冒烟新增“跨服务 X-Request-Id 透传回显”达 77/77） | 2026-08-20 |
| T-B-08 前端工程化与网关对接基线 | 已完成 | `sanye_client`：ApiClient（token/requestId/错误码/401 重定向/GET 重试/超时）、SSE 流式客户端、会话与 Pinia 认证 store、CAS 登录跳转、路由守卫与页面标题、Web Vitals 与前端错误上报、`.env` 网关/CAS 配置；`sanye_deploy/nginx/client.conf` 静态托管 + 网关代理 + 安全响应头；`sanye_admin` 同步落地工程化基线（ApiClient、会话 store、路由守卫 + 登录占位页、错误上报、环境配置）；`pnpm typecheck` 与 `pnpm build` 全过 | 2026-08-18 |
| T-C-01 客户端壳层与路由 | 已完成 | `App.vue` 壳层升级：全局搜索入口（提交进 `/search`）、用户区登录态（登录→CAS 跳转、已登录头像）、侧边栏收起、页面标题随路由联动、⌘K 聚焦搜索；新增 `/search` 路由与 `searchView.vue`（关键词/标签筛选、结果列表、空状态引导 AI）；壳层与搜索页样式（含亮色覆盖与 1100px 响应式）；`pnpm typecheck` 与 `pnpm build` 通过 | 2026-08-18 |
| T-C-02 首页壳层与作品详情页 | 已完成 | 新增 `src/api/anime.ts`（home/list/detail 接口契约）与 `useHomeFeed`（加载/失败/本地回退）；homeView 最近导入与最近更新合并为单一“最近更新”区块，导入作品优先展示并按 slug 去重，热门动漫仍独立展示；首页与 animeDetailView 均为 API 优先 + 骨架屏/失败重试/本地回退；animeDetailView 保留加载、接口失败回退提示、作品不存在/下架空状态、返回按钮来源路径、收藏未登录跳 CAS、问 AI 携带作品参数；`pnpm typecheck`、`pnpm build` 与首页 Playwright 31/31 通过 | 2026-08-24 |
| T-C-03 匿名身份与额度最小链路 | 已完成 | 新增 `src/api/ai.ts`（会话/消息/停止/重试/额度，按接口契约）与 `stores/quota.ts`（匿名每日 5 次，按设备与日期持久化）；aiView 重写为可用的 AI 工作区：deviceId 匿名请求头、clientMessageId 幂等键、发送→SSE 流式（后端未就绪时本地回退演示回答）、停止、推荐卡片回详情、剧透开关、额度显示与用尽登录引导；`pnpm typecheck` 与 `pnpm build` 通过 | 2026-08-18 |
| T-C-04 AI 最小闭环（SSE + 推荐） | 已完成 | 后端 `sanye-server-ai-chat` 实现会话/消息内存存储、SSE 事件（accepted/delta/recommendation/completed/failed/stopped）、额度预占与退还（Redis 计数，降级内存）、停止/重生成、幂等重放；LangChain4j 1.17.2 接入（StreamingChatModel 提供者 + 本地模拟模型 + ChatMemory 会话记忆 + 推荐卡片）；前端 AI 工作区 API 化（会话列表/创建/消息历史/SSE 事件/额度服务端优先，失败回退本地演示）；联调冒烟 17/17 项通过、Playwright E2E 10/10 项通过 | 2026-08-18 |
| T-C-05 网关路由与跨服务链路 | 已完成 | 网关新增 `GatewayAuthFilter` 鉴权前置（业务路由要求 X-Device-Id，缺失返回 401/2001）与公开白名单（`/api/v1/public/**`、`/api/v1/system/ping`、`/covers/**`、`/actuator/**`，OPTIONS 放行）；ai-chat 新增 `AnimeClient` Feign 客户端，推荐卡片 animeId 回源 anime 服务校验存在且已发布，服务不可用时回退静态池；AI 生成线程池增加 MDC 透传（TaskDecorator），请求 ID 贯穿 前端→网关→ai-chat→Feign→anime 验证通过；单元测试：网关 4 项、推荐回源 4 项；冒烟 19/19、E2E 10/10 通过 | 2026-08-18 |
| T-D-01 首页聚合接口与缓存 | 已完成 | `HomeAggregationService`：按 tab 单飞回源（防击穿）、空结果短 TTL 缓存（防穿透）、TTL 基线 300s + 随机 0-60s 抖动（防雪崩）、`invalidate(tab)` 失效钩子（管理端写入接入后经 Outbox 触发）；`RedisHomeCache` 读写失败静默降级回源；anime 服务接入 spring-boot-starter-data-redis；单元测试 4 项（命中跳过回源、并发单飞、空缓存短 TTL、失效）；实测 Redis 键 `sanye:home:home:FEATURED` 存在且 TTL 337s；冒烟/E2E 全通过 | 2026-08-18 |
| T-D-02 番剧仓库列表与筛选 | 已完成 | `AnimeCatalogService`：关键词（标题/别名/标签/简介）+ 类型 + 状态（连载中/已完结映射）+ 年份（精确 + yearBefore）+ 分页（仅返回已发布，size 上限 50）；作品目录扩充至 15 部；前端仓库页 API 化（筛选联动、分页导航、加载/空/失败回退本地数据、收藏本地态）；单元测试 7 项（发布过滤、关键词、类型、状态映射、年份、分页、详情聚合）；实测分页 15 部/3 页、类型与关键词筛选；冒烟 22/22、E2E 12/12 | 2026-08-18 |
| T-D-04 作品详情完善 | 已完成 | 详情聚合：角色（2-3 人/作）、相似作品（共享标签 Top3，排除自身）、排期（连载中 3 集）、来源字段；前端详情页渲染角色/相似/排期区块（空数据隐藏，亮暗主题适配）；收藏状态保持 false（正式收藏在 T-F-02）；实测 `/api/v1/anime/1` 返回 chars=3/similar=3/schedule=3；E2E 12/12 | 2026-08-18 |
| T-E-01 LangChain4j 集成基线 | 已完成 | AiServices 助手接口 `AnimeAssistant`（@MemoryId + @SystemMessage 剧透模板注入 + TokenStream）；会话记忆 ChatMemory 默认 PG 持久化：V2/V3 迁移（`sanye_ai_chat_memory`，schema 可配置）、`JdbcChatMemoryStore`（全量覆盖写入）、`AI_MEMORY_STORE=memory` 回退内存实现；AnswerStreamer 改为经 AiServices 生成（自动读写记忆）；单元测试 ChatMessageCodec 4 项；实测 SSE 完成后 SYSTEM/USER/ASSISTANT 记忆行落库；冒烟/E2E 全通过 | 2026-08-18 |
| T-E-02 会话与消息持久化 | 已完成 | `JdbcConversationStore` 替换内存实现（`AI_CONVERSATION_STORE=pg` 默认，可回退 memory）：会话/消息 CRUD、clientMessageId 幂等（唯一约束兜底）、所有权按 owner_key 校验、消息 status/generateTry/推荐 JSON 持久化；迁移 V4-V6（owner_key 列、id 序列、role/client_message_id 约束修正）；发送失败在生成前退还额度；前端会话列表增加删除入口（悬停 ×，API 删除后刷新）；实测：消息完整落库（USER+ASSISTANT COMPLETED）、重启后会话与历史恢复、越权 2003、删除级联清理；冒烟 19/19、E2E 10/10、全模块测试通过 | 2026-08-18 |
| T-E-04 剧透模式与安全拒答 | 已完成 | `SafetyRules`：SAFE 规则文档注入提示词（含结局/违法/中立等 5 条）、拒答关键词预检（毒品/杀人/炸弹/色情/盗版/破解/自杀/人肉）、剧透敏感识别、输出二次校验（正则防误判"结局是否…"）；AnswerStreamer 接入：拒答先于模型调用直接返回文案、SAFE 完成时二次校验并替换泄露内容（新增 replaceMessageContent）；评测第一批 SafetyEvaluationTest 8 项 + DevMock 流式/剧透 2 项；实测：SAFE 结局问题无泄露、触发词返回拒答、ALLOW 正常放行；冒烟 23/23、E2E 13/13 | 2026-08-18 |
| T-F-02（设备级过渡）收藏与我的 | 已完成（过渡版） | favorite 服务实现收藏/历史 CRUD（owner_key=device:xxx 或 user:xxx，V2 迁移改主键与唯一约束，CAS 接入后自动映射用户维度）；作品信息经 AnimeClient 回源 anime 服务；接口：收藏增删查、状态、历史记录/列表（分页）；网关补充 `/users/me/history/**` 路由；前端：新增 favorite.ts、我的页 API 化（收藏/历史卡片+空态+失败重试+登录引导）、详情页收藏状态/切换（设备级，不再强制跳 CAS）+ 浏览历史自动记录、仓库页收藏走真实接口；单测 8 项（未知作品拒绝、增删、状态、历史 upsert、ownerKey）；实测增删查/状态/历史/跨设备隔离全通过；冒烟 27/27、E2E 15/15 | 2026-08-18 |
| T-E-07 推荐卡片结构化回源 | 已完成 | `RecommendationParser`：从模型回答提取 JSON 数组（`[{animeId,title,reason}]`，正则+Jackson，畸形/缺失返回空）；`RecommendationExtractor.verifyStrict`：真实模型路径严格回源校验（存在且已发布才保留，最多 3 个，服务不可用返回空不降级）；AnswerStreamer：预提取为空时解析模型输出并严格校验后发 recommendation 事件；前端推荐卡片升级为多卡片（标题+理由+跳详情），历史消息回显推荐数组；单测新增 6 项（解析 4 + 严格校验 2）；冒烟 27/27、E2E 15/15 | 2026-08-18 |
| T-G-02（第一批）安全整改与测试 | 已完成（第一批） | 输入校验加固：会话标题 ≤50、contextAnimeId 正整数、关键词 ≤100、type/status ≤20、animeId 正整数（PARAM_INVALID）；安全测试套件：SQL 注入字符串按字面量处理不扩大结果集、超长参数 1001、非正 animeId 拒绝、会话创建参数校验；FastJson 核查：源码零直接引用，Sentinel 传递依赖为 fastjson2 2.0.58（v2 线）；越权（跨设备隔离）、SSE 拒答、额度等既有安全项持续覆盖；冒烟新增注入/超长 3 项达 30/30、E2E 15/15；上传/SSRF/refresh 复用待对应功能（文件服务、CAS 会话）接入后补测 | 2026-08-18 |
| T-G-03（第一批）备份恢复与监控 | 已完成（第一批） | 监控：web 模块引入 micrometer-registry-prometheus + 共享 `monitoring.yml`（8 个业务服务与网关统一暴露 `/actuator/prometheus`）；业务指标 `sanye_ai_completed_total/failed_total/refused_total/first_token_seconds`（AiMetrics，AnswerStreamer 埋点）与 `sanye_home_request_total/cache_hit_total/cache_miss_total`（HomeMetrics，首页聚合埋点）；备份：[backup-local.ps1](../sanye_deploy/backup-local.ps1)（pg_dump 自定义格式、时间戳文件、保留最近 N 份、含恢复说明）；实测：prometheus 端点含自定义指标、备份生成 48KB dump；冒烟 32/32（新增指标 2 项）、E2E 15/15 | 2026-08-18 |
| T-G-01 自动化测试门禁 | 已完成 | JaCoCo 0.8.13 接入父工程（prepare-agent + report + check 绑定 test 阶段，CI 的 `mvn test` 自动强制执行）；检查规则按 BUNDLE 指令覆盖率，排除样板类（Application/model/client/config/monitor/controller，由 E2E/冒烟覆盖）；阈值：core 97.2%、web 92.0%、gateway 92.1%、anime 85.2%、favorite 97.1% 均 ≥70%，ai-chat 44.5% ≥40%（SSE/JDBC 集成路径由冒烟/E2E 覆盖，Testcontainers 待 Docker 环境后提升）；新增测试：core 12 项（AuthContext/ErrorCode/脱敏边界）、gateway 2 项（请求 ID 注入/保留）、ai-chat 10 项（内存会话存储 CRUD/幂等/重生成、会话服务发送/重放/越权/额度、GenerationRegistry、ChatMemoryManager）、favorite 2 项（列表/历史 RowMapper）；全模块 `mvn test` 通过且 6 个覆盖率门禁全部满足 | 2026-08-18 |
| T-D-03 搜索结果页（ES） | 已完成（本地联调，正式环境待验证） | search 服务（8083）：ES Java Client 8.17、`sanye_anime` 索引映射、启动自动建索引+空索引全量同步、`POST /api/v1/search/reindex` 手动重建；BM25 多字段匹配（title^3/originalTitle^2/tags/summary）+ 已发布/类型/状态/年份/yearBefore 过滤 + 分页 + 高亮；ES 不可用返回 4002；前端搜索页 API 化并保留失败回退；Docker ES 8.17 已导入 15 部业务索引，搜索命中、高亮和 RAG 引用已完成本地验证；正式环境连接、容量和权限仍待目标环境验收 | 2026-08-21 |
| T-E-03 RAG 检索 | 已完成（本地联调，正式环境待验证） | ai-chat 实现 LangChain4j ContentRetriever（`AnimeContentRetriever`）：ES BM25（title^3/tags/summary）+ 已发布过滤 + top-k(3)，经 DefaultRetrievalAugmentor 注入提示词；本地模拟模型识别检索注入的《作品》标题并在回答中引用；ES 不可用返回空列表不阻塞回答；引用回源校验沿用 T-E-07 严格校验；单测覆盖 ES 降级；已完成 Docker ES 索引导入、搜索命中与 RAG 检索命中验证 | 2026-08-21 |
| T-G-05（第一批）性能与稳定性 | 已完成（第一批） | AI 生成线程池参数可配置（`sanye.ai.generation-pool.*`，env：AI_POOL_CORE/MAX/QUEUE）；新增 `ThreadPoolMetrics`（`sanye_threadpool_queue_size/active_threads/pool_size/rejected_total{pool="ai-gen"}`）；HikariCP 连接池指标随 actuator 暴露（实测 `hikaricp_connections 20`）；新增压测脚本 [load-test.mjs](../sanye_deploy/load-test.mjs)（home 并发延迟分位数、AI SSE 并发完成率、幂等重放、配额一致性）；实测基线：home 并发 20 p50=137ms/p95=302ms、AI SSE 并发 5 成功率 5/5 p50=2413ms/p95=3592ms、幂等重放 28ms 不扣额度；弱网/断网由前端本地回退与超时（HTTP 10s/SSE 180s/生成 3min）兜底，正式弱网演练待压测环境（归 G 后续）；冒烟 33/33、全模块测试通过 | 2026-08-18 |
| T-G-02（第二批）文件上传与安全边界 | 已完成（第二批） | file 服务（8086）实现上传/下载/元数据：本地磁盘（`FILE_STORAGE_DIR`，默认 `sanye_deploy/.local/files`）+ PG 元数据（V2 迁移 id 序列）；安全边界：大小 ≤5MB、内容类型白名单（png/jpg/jpeg/webp/svg/gif）、扩展名白名单、服务端 UUID 生成 objectKey、bucket 限制为单一安全路径段并做根目录校验（防路径穿越）、SHA-256 摘要、scan_status=PASS（dev 基线，病毒扫描归 P1）；网关路由文件接口但要求 `X-Device-Id`，上传另需登录，下载/元数据暂按文件 ID 读取；连接池调优：各业务服务 HikariCP 改 min-idle 5 / max 10（本地 PG 连接数限制 100，6 服务此前打满）；单测覆盖超限/类型/扩展名/安全目录/上传鉴权/上传落盘/下载/穿越/不存在；实测上传 SVG→id、下载 200、.exe 返回 1001；冒烟 36/36（新增 3 项） | 2026-08-18 |
| T-G-03（第二批）告警配置与故障手册 | 已完成（第二批） | 首页新增错误指标 `sanye_home_error_total`（错误率告警可用）；Prometheus 抓取配置 [prometheus.yml](../sanye_deploy/monitoring/prometheus.yml)（7 服务 + 导出器注释）+ 告警规则 [prometheus-rules.yml](../sanye_deploy/monitoring/prometheus-rules.yml)（服务可用/连接池/AI 失败率与首字/首页错误率/线程池拒绝与队列/搜索 P95/JVM 堆，阈值与监控设计 3 节一致，未实现指标以注释保留）；故障手册 [ops-runbook.md](./ops-runbook.md)（症状/定位命令/处理/验证/回滚，覆盖服务/数据库/Redis/AI/ES/文件/队列/额度 8 类故障 + PromQL 示例 + 恢复回滚通用步骤）；冒烟新增“告警规则指标一致性”检查（规则中的 sanye_* 指标均在实际 prometheus 端点存在）达 37/37；全模块测试通过 | 2026-08-18 |
| T-F-04（第一批）管理端真实登录与网关联通 | 已完成（第一批） | RuoYi 后端（sanye_admin_server）本地运行：建 `sanye_admin` 库（PG 5433）+ 执行 PG 适配 schema（修复残留 MySQL `key` 子句、Quartz 布尔列 varchar→boolean）与 Quartz schema + 种子数据；端口 8089（避开 job 8088），关闭验证码（dev）；网关新增 `/api/v1/admin/**` 路由（StripPrefix=3 → RuoYi 根路径）；RuoYi CORS 改为 `sanye-admin.cors-enabled` 开关（默认关，统一经网关 CORS，SecurityConfig 空过滤器占位）；管理前端：http.ts 适配 RuoYi 响应（code 200 成功/msg 字段/完整响应体 httpRaw）+ 补 X-Device-Id（修复网关 401 死循环）+ loginView 真实登录表单 + adminAuthApi（login/getInfo/logout）；run-local.ps1 增加 admin-server；实测：经网关 `POST /api/v1/admin/login`（admin/admin123）→ token、`getInfo` → admin 用户；冒烟 39/39（新增登录/getInfo 2 项）、E2E 17/17（新增管理端登录）、前端三端构建通过；内容/反馈自定义接口未实现，管理端页面保持本地回退 | 2026-08-18 |
| T-F-03 管理端协作接口（内容管理） | 已完成（第一批） | anime 服务新增受控管理接口 `/api/v1/manage/anime`（网关不暴露）：列表 + 状态更新（草稿/待审核/已发布/已下架），`X-Caller-Name` 调用方校验（缺失返回 2002，dev 凭证基线）；`AnimeManageService` 管理发布状态并联动公开可见性（下架作品从公开列表/详情消失，返回 2003）；RuoYi 新增 [AdminAnimeController](../sanye_admin_server/sanye_admin_app/src/main/java/com/sanye/admin/web/controller/admin/AdminAnimeController.java)（`/anime` 代理，经 RestClient + X-Caller-Name 调业务服务，受 RuoYi 安全链保护构成角色二次校验）；管理前端内容页状态按钮调用真实接口（下架/重新发布）；单测 AnimeManageService 4 项；实测：直连列表/凭证校验/网关代理/下架可见性联动/恢复发布全通过；冒烟 45/45（新增 6 项）、E2E 19/19（新增管理端内容状态流转 2 项） | 2026-08-18 |
| T-F-03（第二批）用户反馈管理接口 | 已完成（第二批） | feedback 服务（8087）实现反馈闭环：`POST /api/v1/feedback` 客户端提交（类型白名单/内容 ≤500 字/设备归属，V2 迁移 device_key/contact/序列）；受控管理接口 `/api/v1/manage/feedback` 列表 + 状态更新（待处理/处理中/已关闭，写处理日志，X-Caller-Name 校验）；RuoYi 代理 [AdminFeedbackController](../sanye_admin_server/sanye_admin_app/src/main/java/com/sanye/admin/web/controller/admin/AdminFeedbackController.java)（`/feedback`）；管理端反馈页状态按钮调真实接口；客户端反馈页真实提交（成功/失败态、发送中禁用）；单测 FeedbackService 5 项；实测：客户端提交→管理列表→网关代理→状态处理全通过；冒烟 49/49（新增 4 项）、E2E 21/21（新增客户端反馈提交与管理端处理 2 项） | 2026-08-18 |
| TODO-006（第一批）权限与动态路由 | 已完成（第一批） | 后端：RuoYi 代理接口加方法级权限注解（`@PreAuthorize`，anime:content:list/status、feedback:list/status，@EnableMethodSecurity 已启用）；前端：auth store 加载 getInfo 权限（修复 RuoYi getInfo 顶层字段与 http.get 剥离 data 不匹配问题，改用 httpRaw.get）、`hasPerm` 助手、路由守卫按权限拦截（/content 需 anime:content:list、/feedback 需 feedback:list，无权限重定向 /dashboard）、内容/反馈页操作按钮按权限显隐；实测：admin（*:*:*）200、普通角色 ry 访问 /admin/anime 返回 403、前端 ry 登录访问 /content 被守卫重定向；冒烟 51/51（新增 ry 登录/403 2 项）、E2E 22/22（新增无权限守卫拦截 1 项） | 2026-08-18 |
| TODO-008（第一批）Quartz 任务生命周期 | 已完成（第一批） | 复用 RuoYi 内置任务接口（/monitor/job/*，monitor:job:* 权限）经网关绑定：新增管理前端任务管理页 [jobsView.vue](../sanye_admin/src/views/jobsView.vue)（任务列表/CRON/状态、立即执行、暂停/恢复，httpRaw.put 支持 RuoYi 顶层响应）+ 路由 `/jobs`（需 monitor:job:list 权限）+ 导航项；Quartz 表已在管理端启动时修复（布尔列 boolean、序列）；实测经网关：列表 3 个种子任务、暂停→已暂停、立即执行、恢复→运行中；冒烟 55/55（新增 4 项）、E2E 24/24（新增任务暂停/恢复 2 项） | 2026-08-18 |
| 管理端仪表盘真实统计 | 已完成 | RuoYi 新增 [AdminDashboardController](../sanye_admin_server/sanye_admin_app/src/main/java/com/sanye/admin/web/controller/admin/AdminDashboardController.java)（`/dashboard/stats`）：经服务间调用聚合 anime/feedback 管理数据（发布/待审核/下架、待处理/处理中/已关闭）+ 本地统计任务/用户；前端仪表盘 [dashboardView.vue](../sanye_admin/src/views/dashboardView.vue) 绑定真实统计（已发布作品/待处理反馈/运行中任务/注册用户、关注事项计数），失败回退演示数据；修复 httpRaw 完整信封需取 `.data` 的问题；实测经网关：作品 15/反馈 8/任务 3/用户 2；冒烟 56/56（新增仪表盘统计 1 项）、E2E 25/25（新增仪表盘真实统计 1 项）；期间处理环境重启（PG 5433 恢复、全服务拉起） | 2026-08-19 |
| AI 对话统计聚合与权限菜单种子 | 已完成 | ai-chat 新增受控统计接口 [AiManageController](../sanye_server/sanye-server-ai-chat/src/main/java/com/sanye/anime/sanye_ai_chat/manage/AiManageController.java)（`/api/v1/manage/ai/stats`：会话/消息总数与今日增量，X-Caller-Name 校验）；RuoYi 仪表盘聚合 AI 统计（aiTotalConversations/aiTodayMessages 等）；前端仪表盘新增“AI 对话次数”指标（今日消息）；内容/反馈权限菜单种子（menu 1061-1064：anime:content:list/status、feedback:list/status）写入运行库与 schema 文件（供角色授权）；实测：AI 52 会话/325 消息/今日 22；冒烟 56/56（仪表盘断言含 AI）、E2E 25/25 | 2026-08-19 |
| 角色授权验证（权限闭环） | 已完成 | 将 `anime:content:list` 菜单授权给普通角色（role 2，sanye_sys_role_menu）；验证权限闭环：ry 登录后 getInfo 权限含 anime:content:list、内容管理接口 200（15 条）、反馈管理仍 403；前端部分授权用户守卫：ry 可访问 /content、访问 /feedback 被重定向 /dashboard；冒烟 57/57（更新授权/未授权 2 项）、E2E 25/25（部分授权守卫 1 项） | 2026-08-19 |
| T-D-05（排期页真实绑定） | 已完成 | 客户端最后一个本地数据页面完成 API 化：anime 服务新增 `WeeklyScheduleService` + `ScheduleController`（`GET /api/v1/schedule/week`，解析 `周X HH:mm 更新` 文案按周分组、仅返回已发布作品、按一季起点确定性推导集数 1-26、当天已过时间标记“已播出”、blue/coral/gold 色调）；前端新增 `schedule.ts` API 客户端，scheduleView 改为 API 优先（加载提示、失败回退本地演示数据 + 重试、本周日期随 generatedAt 动态计算）；单测 7 项（7 天顺序/解析/完结剧场版排除/下架排除/集数范围/时间排序/色调状态稳定）；冒烟 59/59（新增排期 2 项）、E2E 26/26（新增排期页 1 项）、全模块 `mvn test` 通过、三端 typecheck/build 通过 | 2026-08-19 |
| 模型配置页真实绑定 | 已完成 | ai-chat 服务新增 `AiPreferenceService` + `AiPreferenceController`：`GET /api/v1/ai/model-info`（只读模型状态：提供方/模型/服务端温度/记忆存储/RAG/安全规则，不下发密钥与内部地址）、`GET/PUT /api/v1/ai/preferences`（设备/用户维度回答偏好，PG 持久化 `sanye_ai_preference` V7 迁移 + 内存回退，temperature 0-1/contextLength 4096/8192/16384/modelName ≤50 校验）；上下文长度真实映射 AI 会话记忆窗口（4096→10、8192→20、16384→30），保存后按 owner 失效重建（ChatMemoryManager + ConversationStore.ownerOf/conversationIdsOf）；前端 modelConfigView 重写：模型状态只读展示（已连接）、移除密钥/地址输入（产品边界：客户端不保存模型凭证）、创造性滑块 + 上下文长度保存（失败重试/保存态）；单测 10 项（偏好服务 8 + 记忆窗口 2）；冒烟 62/62（新增模型状态/偏好保存/参数校验 3 项）、E2E 27/27（新增模型配置页 1 项）、全模块 `mvn test` 通过、三端 typecheck/build 通过 | 2026-08-19 |
| T-D-07 官网正文编辑 | 已完成 | anime 服务：`sanye_legal_document` 表（Flyway V2 迁移 + 4 篇种子文案）+ `LegalDocumentService`（公开只读已发布/管理端含草稿/标题 100 字/正文 20000 字/状态白名单校验）+ `LegalPublicController`（`/api/v1/public/legal` 匿名白名单，不返回 status/updatedBy）+ `LegalManageController`（`/api/v1/manage/legal`，X-Caller-Name 校验）；RuoYi：`AdminLegalController`（`/legal` 代理，方法级权限 `legal:content:list/edit`）+ 菜单种子 1065/1066；管理前端 `officialContentView.vue`（文档列表 + 编辑面板 + 保存草稿/保存并发布 + 权限按钮显隐）+ 路由守卫与导航；官网 `officialLegalView.vue` API 优先 + 占位回退（空行分段渲染）；单测 8 项（已发布过滤/含草稿/未知 key/标题正文校验/状态校验/发布可见/草稿隐藏）；冒烟 68/68（新增公开/受控/草稿隐藏/代理权限 6 项）、E2E 29/29（新增官网法律页 + 编辑发布闭环 2 项）、全模块 `mvn test` 通过、三端 typecheck/build 通过；GAP-013 文案审查仍 blocked-external，编辑能力已落地 | 2026-08-19 |
| T-D-08 公开媒体元数据导入与播放器 | 已完成（代码；真实来源授权与持续可用性待环境） | 新增 `sanye_anime_episode` V5 迁移、PG/内存媒体存储、HTTPS 来源白名单和响应限制；受控导入接口与 RuoYi 内容编辑代理；客户端详情页使用 ArtPlayer 5.4.0（GitHub MIT）承载 video 控制栏，HLS 经 `customType.m3u8` 接入 hls.js，支持选集切换、真实清晰度选择、来源页、空/失败/重试状态；管理端新增“导入播放源”；媒体导入单测 65 项、后端全量单测 210 项、媒体播放器 Playwright 4/4、清晰度专项 3/3、真实 HLS/实际播放推进与季度独立卡片/搜索独立结果 34/34、全量 Playwright 548/548、全量套件按钮体检 428/428、三端 typecheck/build 通过；无职转生五个篇章分别使用独立卡片和封面，作品 `127` 保留两条 HLS 播放线路并按电影正片语义展示；未下载第三方媒体文件，真实来源授权与持续可用性归 GAP-016 | 2026-08-25 |
| T-G-06 跨服务故障与链路监控 | 已完成 | 网关新增统一错误包：`GatewayErrorResponseFilter`（上游 5xx 未提交响应改写为 503 + `{code:5002, requestId}`）+ `GatewayErrorWebExceptionHandler`（连接拒绝/超时异常路径 5002，NotFoundException/ResponseStatusException 404 → 2003）；`ErrorCode` 与前端 types.ts 新增 5002 SERVICE_UNAVAILABLE；网关独立管理端口 8090 + micrometer-registry-prometheus（网关自身请求指标可观测，含 status=503 计数）；故障注入脚本 [fault-injection.ps1](../sanye_deploy/fault-injection.ps1)（anime/auth/ai-chat 三场景：基线 200 → 停服务 → 网关 503+5002+requestId 贯穿 → prometheus 503 计数 → try/finally 恢复 → 自愈 200，支持 -ResultFile 供自动化捕获）；单测 7 项（网关错误过滤器 3 + 异常处理器 4）；实测故障注入 21/21、全模块 `mvn test` 通过、冒烟 68/68、E2E 29/29、三端 typecheck/build 通过；故障手册新增 5.9 演练章节 | 2026-08-19 |
| T-F-03（深化）内容 CRUD 与发布闭环 | 已完成 | `AnimeMemoryStore` 目录数据面改为可变（CopyOnWriteArrayList + ConcurrentHashMap SUMMARY，管理端写入/替换，`resetForTest` 恢复种子避免测试污染）；`AnimeManageService` 新增 create（title/type 必填、year 1900-2100、tags 逗号分隔去重、默认草稿）/ update（按 id 替换、非空字段更新、保留发布状态）/ get（AdminAnimeDetailView 含简介/标签/更新文案）；`AnimeManageController` 新增 `GET /{id}`、`POST`、`PATCH /{id}`（X-Caller-Name 校验）；RuoYi `AdminAnimeController` 代理对应接口（权限 `anime:content:edit`，菜单种子 1067 已入 schema 与运行库）；管理前端 contentView 新建/编辑 dialog（标题/别名/类型/年份/简介/标签/更新文案，权限按钮显隐，草稿创建后进列表）；发布联动：草稿公开不可见、发布后详情/列表/排期可见；单测新增 4 项（创建草稿不可见/校验/编辑保状态/未知 id）；冒烟 73/73（新增创建/详情/编辑/草稿不可见/清理 5 项）、E2E 31/31（新增新建草稿+编辑 2 项）、全模块 `mvn test` 通过、三端 typecheck/build 通过 | 2026-08-19 |
| T-G-04 AI 评测集与回归 | 已完成 | 评测集 100 条（[evaluation-set.json](../sanye_server/sanye-server-ai-chat/src/test/resources/ai-evaluation/evaluation-set.json)：剧透 36/拒答 26/推荐 22/边界 16）；回归框架 [AiEvaluationSuiteTest](../sanye_server/sanye-server-ai-chat/src/test/java/com/sanye/anime/sanye_ai_chat/ai/AiEvaluationSuiteTest.java)（纯 Java 组合 SafetyRules + DevMock，逐条统计并断言阈值）；实测通过率：剧透 100%、拒答 100%、推荐 100%、边界 100%、引用识别 100%（4 条注入/格式，ES 联调后补真实命中）；评测驱动修复 3 项：剧透泄露检测正则对齐（结局是(?!否)）、SafetyRules 拒答关键词扩充 7 个变体（怎么杀人/炸弹怎么做/自制炸弹等）、DevMock 推荐意图词扩充（帮我找/类似/有没有/适合）；文档 [ai-evaluation.md](./ai-evaluation.md)；全模块 `mvn test` 通过（含 SafetyEvaluationTest 8 项） | 2026-08-19 |
| T-H-01（补项）布局与双状态回归 | 已完成 | 新增 Playwright 回归脚本与报告 [layout-regression-report.md](./layout-regression-report.md)：三档视口（1100/1280/1440）遍历客户端 7 页（首页/仓库/详情/AI/排期/我的/官网）+ 管理端守卫/登录/4 页，检查横向溢出（≤1px）、关键区块可见、无 JS/请求错误；未登录匿名链路可用、管理端守卫重定向 /login、admin 登录后各页正常；实测 39/39 通过；与既有 E2E 31 项共同覆盖 T-H-01 主链路与双状态要求 | 2026-08-19 |
| T-H-04（本地部分）依赖故障降级 | 已完成 | 新增降级验证（e2e-degradation.mjs + degradation-check.ps1），覆盖停 anime/ai-chat/favorite/feedback 四类故障：客户端首页/仓库本地回退、详情失败态、我的页收藏历史降级、AI 页可用；管理端内容页演示回退、仪表盘统计降级；8/8 通过，无白屏与页面异常；报告 [degradation-report.md](./degradation-report.md)；模型超时/队列故障/RabbitMQ 归外部环境验证 | 2026-08-19 |
| T-H-02（本地演练）发布候选评估 | 已完成（正式发布待环境） | 执行发布检查清单并产出 [release-readiness.md](./release-readiness.md)：全量回归（mvn test BUILD SUCCESS + AI 评测 100 条 + 记忆评测 5 项）、冒烟 77、E2E 主链路 32、接口体检 60、布局 39、按钮套件 428、全量 Playwright 548、媒体播放器专项 4、清晰度专项 3、真实 HLS/实际播放推进/聚合 34、故障注入 21、降级 8、备份生成（106KB dump）；正式片库和回退目录均只保留六部正式作品；结论：功能与质量就绪（内部预览），正式发布受 CAS/域名/版权/法律文案/真实 AI 额度等外部环境阻塞；回滚方案与已知问题登记 | 2026-08-24 |
| T-F-01（本地联调部分）CAS 单点登录 | 已完成（正式 CAS 服务器替换待环境） | 实现 CAS 本地最小闭环：core 新增 JwtService（HS256 签发/校验，无第三方依赖）+ 单测 2 项；auth 新增 CasController/CasService（/auth/cas/login 跳转、/callback 经 /serviceValidate 一次性 ticket 校验、自动建号 sanye_user_auth+account、JWT 签发）+ V2 迁移（账户/认证表 id 序列）+ 配置（CAS_SERVER_URL/AUTH_TOKEN_SECRET）；网关 Bearer JWT 校验注入 X-User-Id（我方 token 有效才注入，RuoYi 等第三方 token 降级设备匿名，无提权风险）+ 网关测试 2 项；AuthContextFilter 从 X-User-Id 读取 userId；前端 auth.ts casCallback + 路由守卫处理 ticket 存 token；本地 Mock CAS（sanye_deploy/cas-mock.mjs 端口 8095）；实测闭环：登录跳转→ticket→回调 JWT→用户态收藏（owner_key=user:2）→无效 token 降级匿名，Playwright 前端登录 4/4；全量 mvn test/冒烟 73/E2E 31 通过；SLO 与真实 CAS 服务器替换归外部环境 | 2026-08-19 |
| T-F-01（本地联调部分）refresh 轮换与退出 | 已完成 | 在 CAS 最小闭环基础上补齐会话生命周期：POST /auth/cas/refresh（refreshToken 持久化于 sanye_user_auth.refresh_token_id，轮换签发新对、旧 refresh 一次性失效防复用）、POST /auth/cas/logout（吊销 refresh + 返回 CAS 登出地址）、mock CAS /cas/logout；前端右上角登录态显示昵称与退出按钮（调 logout 清 session 回首页）；实测：登录→refresh 轮换→旧 refresh 复用 2001→logout 后 refresh 2001；全量 mvn test/冒烟 73/E2E 31/CAS 前端 4/4 通过；SLO 回调通知与真实 CAS 服务器替换归外部环境 | 2026-08-19 |
| T-F-01（本地联调部分）前端 401 自动刷新与修复 | 已完成 | 客户端 [http.ts](../sanye_client/src/api/http.ts) 401 自动续期改造：单飞 refresh（模块级 in-flight Promise，并发 401 只发起一次 `POST /auth/cas/refresh`，其余请求复用同一 Promise 等待后重放，避免多请求同时用旧 refreshToken 轮换导致令牌一次性失效竞态）；区分 refresh 结果——`refreshed`（setSession 后重放原请求）/ `invalid`（清会话跳 CAS）/ `unavailable`（保留会话不跳转，仅提示稍后重试）；网关 [GatewayAuthFilter](../sanye_server/sanye-server-gateway/src/main/java/com/sanye/anime/sanye_gateway/GatewayAuthFilter.java) 将 `/api/v1/monitor/**` 加入公开前缀（修复管理端登录后前端错误上报携带 RuoYi token 被网关 401 弹回登录页的回归）并区分两种 401 文案（缺少设备头 / 我方凭证无效）；网关单测新增 monitor 公开断言；实测：e2e-refresh 2/2、e2e-verify 31/31（含管理端真实登录/仪表盘统计/内容流转）、e2e-cas 4/4、冒烟 73/73、全模块 `mvn test` BUILD SUCCESS、客户端 typecheck 通过 | 2026-08-20 |
| T-F-05 任务管理接入（执行记录） | 已完成 | 补齐任务管理最后一块“执行记录”：管理前端新增任务日志页 [jobLogsView.vue](../sanye_admin/src/views/jobLogsView.vue)（按任务名称/状态检索、分页、详情弹窗含异常信息、单条删除与清空，删除/清空按钮按 monitor:job:remove 显隐）+ [jobs.ts](../sanye_admin/src/api/jobs.ts) 新增 adminJobLogApi（list/detail/remove/clean 绑定 RuoYi `/monitor/jobLog/*`）+ [http.ts](../sanye_admin/src/api/http.ts) httpRaw 补充 DELETE 方法 + 路由 `/jobs/logs`（monitor:job:list 守卫）+ 导航入口“任务日志”；后端复用 RuoYi 内置 SysJobLogController（list/export/getInfo/remove/clean，权限 monitor:job:list/query/remove），无需新增后端代码；实测：任务日志页 Playwright 6/6（列表渲染、状态筛选、详情弹窗、删除单条、ry 有权限可访问、无控制台错误）、冒烟新增“任务日志返回执行记录”达 74/74、E2E 31/31、admin typecheck/build 通过 | 2026-08-20 |
| A-P0-05 用户管理基础 | 已完成 | 管理前端新增用户管理页 [userManagementView.vue](../sanye_admin/src/views/userManagementView.vue)（按用户名/手机号/状态检索、分页、详情弹窗、重置密码弹窗 6-20 位校验、启用/停用确认流转，重置密码按 system:user:resetPwd、状态切换按 system:user:edit 显隐，admin 账号禁用状态操作）+ [users.ts](../sanye_admin/src/api/users.ts) 新增 adminUserApi（list/detail/changeStatus/resetPwd 绑定 RuoYi `/system/user/*`）+ 路由 `/users`（system:user:list 守卫）+ 导航入口“用户管理”；后端复用 RuoYi 内置 SysUserController，无需新增后端代码；实测：用户管理页 Playwright 8/8（列表渲染含管理员标签、按用户名检索、详情弹窗、重置密码表单校验不破坏真实账号、临时用户停用/启用状态流转、无控制台错误）、冒烟新增“用户列表返回账号数据”达 75/75、E2E 31/31、admin typecheck/build 通过；临时测试用户已清理 | 2026-08-20 |
| A-P0-06 权限与审计 | 已完成 | 管理前端新增权限与审计页 [auditView.vue](../sanye_admin/src/views/auditView.vue)：双 Tab——“操作日志”（按操作人/状态检索、分页、操作类型映射、状态标签、详情弹窗含请求参数/返回结果/异常信息完整展示）与“登录日志”（按用户名/状态检索、浏览器/系统/状态列、详情弹窗；登录日志 Tab 按 monitor:logininfor:list 权限显隐）+ [audit.ts](../sanye_admin/src/api/audit.ts) 新增 adminAuditApi（operlogList/detail、logininforList/detail 绑定 RuoYi `/monitor/operlog/*`、`/monitor/logininfor/*`）+ 路由 `/audit`（monitor:operlog:list 守卫）+ 导航入口“权限与审计”；后端复用 RuoYi 内置 SysOperlogController/SysLogininforController，无需新增后端代码；实测：权限与审计页 Playwright 7/7（操作日志列表/状态筛选/详情、登录日志列表/状态筛选/详情、无控制台错误）、冒烟新增“操作日志返回审计记录”达 76/76、E2E 31/31、admin typecheck/build 通过；管理端 P0（A-P0-01..07）至此全部闭环 | 2026-08-20 |
| T-H-03（内部部分）日志脱敏复查 | 已完成（GAP-013/GAP-005 仍 blocked-external） | 复查发现审计页详情展示的 operParam 若含口令/令牌会被有 monitor:operlog:query 权限的人看到，双保险加固：后端 [LogAspect](../sanye_admin_server/sanye_admin_framework/src/main/java/com/sanye/admin/framework/aspectj/LogAspect.java) `EXCLUDE_PROPERTIES` 扩展（password/oldPassword/newPassword/confirmPassword/token/accessToken/refreshToken/access_token/refresh_token/secret/clientSecret/client_secret/apiKey/api_key/authorization），记录操作日志前统一剔除；前端 [audit.ts](../sanye_admin/src/api/audit.ts) 新增 `maskSensitiveJson` 展示层兜底掩码（审计详情请求参数/返回结果/异常信息）；admin-server 重建（framework+app）并重启验证；实测：临时用户重置密码后操作日志记录与审计页展示均无明文密码（e2e-mask 5/5）、e2e-audit 7/7、冒烟 76/76、E2E 31/31、admin typecheck/build 通过；GAP-013 法律文案审查与 GAP-005 版权证据仍 blocked-external | 2026-08-20 |
| T-G-05（第二批）弱网/断网前端专项 | 已完成 | 浏览器层网络故障模拟 [e2e-network.mjs]（Playwright 路由拦截，无需停服务）：断网场景覆盖客户端 9 页（首页/仓库/详情/排期/搜索/我的/官网首页/官网法律/AI），断言降级文案、非白屏、无页面异常；断网恢复自愈（解除拦截后点重试，真实数据恢复）；弱网场景（API 延迟 4s）验证首页加载骨架先出现、数据到达后骨架消失、卡片正常渲染；**顺带修复详情页误导性空态**——断网时此前显示“作品不存在或已下架”，现改为“网络异常，加载失败 + 重试”（[animeDetailView.vue](../sanye_client/src/views/animeDetailView.vue)）；按钮体检脚本优化（入队前去重+缩短等待，全量约 4 分钟）并将任务日志/用户管理/权限与审计纳入管理端页面清单；实测：弱网/断网专项 13/13、按钮体检 394/394、e2e-verify 31/31、冒烟 76/76、客户端 typecheck/build 通过；报告更新 [degradation-report.md](./degradation-report.md) v1.1 与 [button-test-report.md](./button-test-report.md) v2 | 2026-08-20 |
| AI 供应商接入（硅基流动 OpenAI 兼容模式） | 进行中（真实模型受外部额度阻塞） | 使用本机用户级环境变量配置 `AI_PROVIDER=openai`、`AI_BASE_URL=https://api.siliconflow.cn/v1/`、`AI_MODEL=Qwen/Qwen2.5-7B-Instruct`（温度 0.7），密钥仅注入 `AI_API_KEY`，仓库与日志零落盘；重启 ai-chat 后 `GET /api/v1/ai/model-info` 返回 provider/model 正确；真实模型请求返回 HTTP 402（账号余额/额度不足），系统按设计落 `message.failed`/`4001`，自动化回答链路使用 `AI_PROVIDER=dev` 完成确定性验证；GAP-006 保持 `in-progress`，RAG 因 ES 未启动按设计降级为空检索，不阻塞回答 | 2026-08-21 |
| 内部收尾（T-B-07 收口 / 过期记录清理 / run-local 修复） | 已完成 | run-local.ps1 探测与初始化 psql 全部加 `-w` 免交互并预置 PGPASSWORD（冷启动不再卡死，实测 1.3 秒跑完）；冒烟新增“跨服务 X-Request-Id 透传回显”达 77/77（T-B-07 收口为已完成）；development-tasks.md 中 T-B-04（部分）、T-F-04（提前执行）两条过期记录更新为已完成（由后续记录取代） | 2026-08-20 |
| 仪表盘统计与接口体检收口 | 已完成 | 修复 AI 用量趋势查询的 PostgreSQL `day` 别名冲突；文件元数据体检携带所有者令牌并同步 `api-contract.md`；部署 PowerShell 脚本统一 UTF-8 BOM。全模块 `mvn test`、三端类型检查/构建、冒烟 77/77、接口体检 60/60 通过 | 2026-08-20 |
| 桌宠阶段启动（PET-TODO-001 至 006） | 进行中（核心代码已完成，系统发布验收待环境） | 新增 [sanye_pet](../sanye_pet) 应用（`@sanye/sanye_pet`，Electron 33 + Vite + Vue 3 + TS，加入 pnpm workspace）：透明无背景原创角色与互动按钮、五种角色状态、单击/双击/右键/拖动/托盘交互、客户端启动自动拉起与单实例复用、异步客户端唤起、失败反馈、大小/透明度/动效/气泡/提醒/安静时段/开机启动设置与持久化均已实现；实测 typecheck/build 通过；PET-TODO-002 的正式授权、PET-TODO-003/007 的多屏缩放锁屏和性能观察、PET-TODO-008 的安装签名与升级回滚仍待环境 | 2026-08-21 |
| 全接口吞吐/QPS 基准与性能优化（T-G-05 补项） | 已完成（真实模型 AI SSE 待额度恢复） | 新增全接口基准 [benchmark-all.mjs](../sanye_deploy/benchmark-all.mjs)（24 端点 × 并发 20 × 100 请求，含网关错误路径与管理端，AI SSE 以落库状态校验）；基线发现并修复：①管理端仪表盘统计串行聚合慢（QPS 133/p95 275ms）→ 5 秒本地 TTL 缓存 + 双检锁（优化后 QPS 1661/p95 31ms，12.5×）；②anime 服务 HikariCP 20 并发打满（total=10 active=10 waiting=7，3s 超时 500）→ 8 个业务服务连接池 10→20、connection-timeout 3s→10s、PG max_connections 100→200；优化后 23/24 端点 QPS 700~3200、p95 ≤107ms、错误率 0%，首页缓存命中率 95%（380/400）；报告 [performance-test-report.md](./performance-test-report.md)；优化后逻辑验证：冒烟 77/77、E2E 31/31（AI 生成断言在 dev-mock 下执行）；**真实模型阻塞：硅基流动账户余额/额度不足（HTTP 402）**，生成失败由系统正确落 FAILED，额度恢复后复测 AI SSE；已知项：admin 登录 QPS~70 属 BCrypt+审计正常成本、单机偶发长尾建议压测机验证 | 2026-08-21 |
| T-B-04 PostgreSQL 迁移与种子基线（作品目录持久化） | 已完成 | 新增 `AnimeCatalogStore` 接口（内存 `InMemoryAnimeCatalogStore` / PG `JdbcAnimeCatalogStore` 双实现，`sanye.catalog.store=pg|memory` 默认 pg）；V3 迁移扩展 `sanye_anime`（score/update_text/tags_json/characters_json + id 序列 + 15 部种子，全幂等）+ V4 修复历史环境序列（V3 早期版本种子前 setval 导致序列停在 1）；`AnimeCatalogService` / `AnimeManageService` / `WeeklyScheduleService` / 公开精选改经 store（关键词搜索用 `summaryById` 避免 N+1）；重启后作品、简介、标签、角色、排期与发布状态全部保留（实测：创建 id=16 发布 → 重启 → 公开 16 与管理状态保留）；单测新增 13 项（store 接口 default 4 + JDBC mock 9）；全模块 `mvn test` 通过（anime 覆盖率门禁达标）、冒烟 73/73、E2E 31/31、三端构建通过；正式连接配置（5432 实例口令）仍待环境，本地联调使用 5433 | 2026-08-19 |
| T-B-04（部分）PostgreSQL 迁移与种子基线 | 已完成（由 T-B-04 正式记录取代） | 早期空库迁移验证记录；后续 T-B-04 已完成 PG 持久化、种子与重启保留实测，本行仅保留历史证据；正式连接配置（5432 实例口令）仍待环境 | 2026-08-20 |
| T-D-06（提前执行，D-025）官网 P0 页面 | 已完成（公开接口联调） | 官网壳层组件 + 公开首页/产品介绍/下载/法律四页；后端 `/api/v1/public/home` 调整为 `{picks: AnimeCard[]}` 与前端 `public.ts` 对齐，网关补充 `/api/v1/public/**` 与 `/covers/**` 路由；Playwright 验证官网公开精选来自后端；`pnpm typecheck` / `pnpm build` 通过 | 2026-08-18 |
| T-F-04（提前执行，D-025）管理端 P0 页面 | 已完成（由后续批次记录取代） | 早期前端先行记录；后续 T-F-04 第一批（真实登录/网关联通）与 TODO-006/007、仪表盘、任务、用户、审计等批次已完成真实接口绑定，本行仅保留历史证据 | 2026-08-20 |

### 联调支撑记录（2026-08-18，任务分支 `feature-T-B-01`，未提交 git）

- 网关补充 CORS（`globalcors`，允许 localhost 任意端口）、`/api/v1/public/**` 与 `/covers/**` 路由；本地 profile（`application-local.yml` 静态实例 + `application-dev.yml` 静态 URI）可直接启动。
- `sanye-server-web` 增加 `spring-boot-starter-jdbc`（HikariCP），业务服务启动即校验 PG 连接并执行 Flyway 迁移；联调环境变量：`DB_URL=jdbc:postgresql://localhost:5433/sanye_anime`、`DB_USERNAME=sanye`、`DB_PASSWORD=123456`、`NACOS_ENABLED=false`、`SENTINEL_ENABLED=false`。
- 前端错误上报端点 `POST /api/v1/monitor/frontend-errors` 落于 auth 服务（结构化日志，监控指标待 T-G-03），网关路由 `/api/v1/monitor/**`。
- 前端资源路径规范化：`resolveAssetUrl` 将后端相对资源（如 `/covers/anime-1.svg`）拼接到网关地址。
- 冒烟与 E2E 证据：`sanye_deploy/smoke-local.ps1` 17 项全通过；Playwright 客户端主链路（首页→详情→AI SSE→推荐→详情、官网公开接口、配额展示、CORS/资源错误）10 项全通过。

## 10. 阶段 C 闭环记录（2026-08-18）

阶段 C（最小垂直链路）T-C-01 至 T-C-05 全部完成：

- T-C-01 客户端壳层与路由（已完成）、T-C-02 首页壳层与作品详情（已完成）、T-C-03 匿名身份与额度最小链路（已完成）、T-C-04 AI 最小闭环（已完成）、T-C-05 网关路由与跨服务链路（已完成）。
- 阶段出口验证：后端冒烟 19/19、Playwright E2E 10/10、`mvn test` 全 11 模块通过、`pnpm typecheck` / `pnpm build`（client/admin）通过；请求 ID 贯穿三服务证据见 ai-chat 日志（本地 `[req-cross-102]` 与 Feign 回源 `remoteRequestId=req-cross-102` 一致）。
- 下一步进入阶段 D（首页与内容）与阶段 E（AI 核心能力）：建议按依赖先做 T-D-01（首页聚合接口与缓存）与 T-E-01（LangChain4j 集成基线，会话记忆持久化）。

## 11. 阶段 D/E 启动记录（2026-08-18）

- T-D-01（首页聚合接口与缓存）与 T-E-01（LangChain4j 集成基线）已完成：首页聚合经 Redis 缓存（单飞/空值缓存/TTL 抖动/失效钩子，缓存降级回源）；AI 回答改经 AiServices 生成，会话记忆（ChatMemory + ChatMemoryStore）默认落 PG（`sanye_ai_chat` schema，V2/V3 迁移），`AI_MEMORY_STORE=memory` 可回退内存。
- 验证：`mvn test` 全 11 模块 BUILD SUCCESS（新增 HomeAggregationService 4 项、ChatMessageCodec 4 项）；冒烟 19/19；Playwright E2E 10/10；首页缓存键 TTL 337s；PG 记忆表含 SYSTEM/USER/ASSISTANT 完整会话行。
- 历史下一步记录：T-D-02、T-D-04、T-E-02 已完成；当前下一步是外部环境解锁后的 ES/RAG、MinIO、RabbitMQ、正式 CAS 与发布验收。

## 12. 阶段 E 推进记录（2026-08-18）

- T-E-02（会话与消息持久化）已完成：会话/消息由内存迁移到 PG（`sanye_ai_chat` schema，V4-V6 迁移），服务重启后会话列表、消息历史与 AI 记忆全部可恢复；越权访问返回 2003；删除会话级联清理消息；生成前失败自动退还额度；前端会话列表支持删除。
- 验证：`mvn test` 全模块 BUILD SUCCESS；冒烟 19/19；Playwright E2E 10/10；重启前后会话 id=2 与 USER/ASSISTANT 消息完整恢复的实测证据。
- 下一步建议：T-D-02（番剧仓库列表与筛选）、T-D-04（作品详情完善）、T-E-03（RAG 检索，需 ES 环境）、T-E-04（剧透模式与安全拒答）。

## 13. 阶段 D 推进记录（2026-08-18）

- T-D-02（番剧仓库列表与筛选）与 T-D-04（作品详情完善）已完成：作品目录扩充至 15 部；列表支持关键词/类型/状态/年份组合筛选与分页；详情返回角色、相似作品（共享标签 Top3）、排期与来源；前端仓库页 API 化（分页 + 筛选联动 + 失败回退），详情页新增角色/相似/排期区块。
- 验证：`mvn test` 全模块 BUILD SUCCESS（新增 AnimeCatalogService 7 项）；冒烟 22/22（新增分页/筛选/详情聚合 3 项）；Playwright E2E 12/12（新增仓库分页筛选、详情角色相似排期 2 项）；`pnpm typecheck` / `pnpm build`（client/admin）通过。
- 下一步建议：T-E-03（RAG 检索，需 ES 环境）、T-E-04（剧透模式与安全拒答）、T-D-03（搜索页 ES，依赖 ES）、T-F-02（收藏与我的，依赖 CAS）。

## 14. 阶段 E 安全能力记录（2026-08-18）

- T-E-04（剧透模式与安全拒答）已完成：SAFE 规则文档注入 + 拒答关键词预检 + 输出二次校验（正则避免“结局是否”误判）；拒答先于模型调用，不生成无谓内容；SAFE 完成时二次校验并替换泄露；评测第一批 10 项用例通过（拒答 8 类触发词、剧透敏感识别、SAFE/ALLOW 行为、泄露替换、规则文档覆盖、本地模型流式与不泄露）。
- 验证：`mvn test` 全模块 BUILD SUCCESS；冒烟 23/23（新增安全拒答项）；Playwright E2E 13/13（新增 SAFE 剧透防护项）；`pnpm typecheck` / `pnpm build`（client/admin）通过。
- 下一步建议：T-F-02（收藏与我的，依赖 CAS，可先设备级过渡）、T-E-03 / T-D-03（RAG 与搜索，需 ES 环境）、T-E-07（推荐卡片结构化回源，依赖 T-E-03）。

## 15. 阶段 F 设备级过渡记录（2026-08-18）

- T-F-02（收藏与我的，设备级过渡版）已完成：favorite 服务上线（8085），收藏/历史按 owner_key 持久化（设备维度），作品信息跨服务回源；前端"我的"页 API 化，详情页收藏切换 + 浏览历史自动记录，仓库页收藏走真实接口；登录引导保留，CAS 接入后 owner_key 自动切用户维度（T-F-01 完成后迁移）。
- 验证：`mvn test` 全模块 BUILD SUCCESS（新增 FavoriteService 8 项）；冒烟 27/27（新增收藏/历史 4 项）；Playwright E2E 15/15（新增收藏切换、我的页 2 项）；`pnpm typecheck` / `pnpm build`（client/admin）通过。
- 下一步建议：T-F-01（CAS 完整接入，需 CAS 服务器外部环境）、T-E-03 / T-D-03（RAG 与搜索，需 ES）、T-E-07（推荐卡片结构化回源）。

## 16. 阶段 E 推荐链路记录（2026-08-18）

- T-E-07（推荐卡片结构化回源）已完成：结构化输出解析（模型回答内 JSON 数组）+ 严格回源校验（真实模型路径，未校验数据不出卡片）+ 前端多卡片渲染；开发路径沿用预提取候选（回源校验已有），真实模型路径使用解析+严格校验，两条路径均经 AnimeClient 校验。
- 验证：`mvn test` 全模块 BUILD SUCCESS（新增解析 4 项 + 严格校验 2 项）；冒烟 27/27；Playwright E2E 15/15（推荐卡片链路）；`pnpm typecheck` / `pnpm build`（client/admin）通过。
- 下一步建议：T-F-01（CAS，需外部环境）、T-E-03 / T-D-03（RAG 与搜索，需 ES 环境）、T-G 系列质量门禁（自动化测试覆盖率、安全整改）。

## 17. 安全整改第一批记录（2026-08-18）

- T-G-02 第一批完成：入参校验加固（标题/关键词/类型/状态/animeId 长度与正数校验，统一 PARAM_INVALID）；SQL 注入字符串实测按字面量处理（结果集不扩大）；超长参数实测返回 1001；FastJson 核查无直接引用（传递依赖已是 fastjson2 v2 线）；越权/拒答/额度等既有安全项持续覆盖。
- 验证：`mvn test` 全模块 BUILD SUCCESS（新增安全用例 14 项：anime 3、favorite 1、ai-chat 会话校验 7、解析/校验等既有）；冒烟 30/30（新增注入/超长关键词/超长 AI 消息 3 项）；E2E 15/15。
- 待补：上传/SSRF（file 服务功能）、refresh 复用（CAS 会话）在对应功能接入后补测；覆盖率 ≥70% 与 Testcontainers 归 T-G-01。

## 18. 可观测性与备份第一批记录（2026-08-18）

- T-G-03 第一批完成：全部业务服务与网关暴露 `/actuator/prometheus`（共享 monitoring.yml + micrometer-registry-prometheus）；AI 完成/失败/拒答/首字耗时与首页请求/缓存命中/未命中指标已埋点；本地 PG 备份脚本（pg_dump 自定义格式 + 保留策略 + 恢复说明）运行生成 48KB dump。
- 验证：`mvn test` 全模块 BUILD SUCCESS；冒烟 32/32（新增 prometheus 端点与自定义指标 2 项）；E2E 15/15。
- 待补：Prometheus/Grafana/Alertmanager 采集（T-B-03 Compose 或部署环境）、导出器（PG/Redis/ES）、告警阈值落地与故障手册（归 TODO-014 后续）。

## 19. 测试门禁记录（2026-08-18）

- T-G-01 完成：JaCoCo 覆盖率门禁接入父工程并绑定 `mvn test`（CI 自动强制执行）；排除样板类后的指令覆盖率：core 97.2% / web 92.0% / gateway 92.1% / anime 85.2% / favorite 97.1%（≥70%），ai-chat 44.5%（≥40%，SSE/JDBC 路径由冒烟/E2E 覆盖，Testcontainers 待 Docker 环境后提升）。
- 新增测试 26 项（core 12 / gateway 2 / ai-chat 10 / favorite 2）；全模块 `mvn test` BUILD SUCCESS；冒烟 32/32、E2E 15/15 回归通过。
- 待补：Testcontainers 集成测试（需 Docker 环境）、ai-chat 覆盖率随 SSE/JDBC 集成测试提升、核心覆盖率目标在集成测试接入后上调。

## 20. 搜索与 RAG 代码收口记录（2026-08-18）

- T-D-03 与 T-E-03 代码完成：search 服务（8083）ES 索引/同步/BM25 检索/降级，ai-chat RAG ContentRetriever（LangChain4j 检索增强）与模拟模型引用；前端搜索页 API 化并保留本地回退。
- 验证（无 ES 环境）：search 返回 4002 降级、AI 回答正常完成（RAG 空检索不阻塞）、冒烟 33/33（新增搜索降级）、E2E 16/16、全模块测试通过（search 覆盖率门禁 0.25，ai-chat ≥40%）。
- 待环境：ES 8.17 实例启动（官方源限速约 80KB/s、Docker 引擎暂不可用，用户暂停 Docker 操作）、索引命中/高亮/RAG 引用联调验证；恢复方式待定（本机安装或 Docker 就绪后按 compose 拉起）。

## 21. 性能与稳定性第一批记录（2026-08-18）

- T-G-05 第一批完成：AI 生成线程池参数可配置（env），线程池指标（队列/活跃/池大小/拒绝计数）与 HikariCP 连接池指标经 /actuator/prometheus 暴露；压测脚本 load-test.mjs 落地并跑出本地基线：home 并发 20（p50 137ms / p95 302ms）、AI SSE 并发 5（5/5 完成，p50 2413ms / p95 3592ms）、幂等重放 28ms 不扣额度、配额一致。
- 验证：`mvn test` 全模块 BUILD SUCCESS；冒烟 33/33；压测 PASS。
- 待补：正式弱网/断网演练与更真实负载（需独立压测环境与真实模型）、连接池参数按压测调优归 T-G-05 后续。

## 22. 文件服务与安全第二批记录（2026-08-18）

- T-G-02 第二批完成：file 服务（8086）上传/下载/元数据（本地磁盘 + PG，白名单校验、bucket 安全路径段、路径穿越防护、SHA-256）；网关路由文件接口并要求 `X-Device-Id`，上传另需登录；连接池调优（min-idle 5 / max 10）解决本地 PG 连接数打满；单测 9 项；冒烟 36/36。
- 待补：MinIO 对象存储接入（T-B-03）、病毒扫描（scan_status）、生产环境上传配额与文件所有权校验、SSRF 类 URL 抓取不在本服务范围（无外部 URL 拉取）。

## 23. 告警配置与故障手册记录（2026-08-18）

- T-G-03 第二批完成：首页错误指标落地；Prometheus 抓取配置与告警规则（配置即代码，指标与监控设计阈值对齐）；故障处理手册覆盖 8 类故障（服务/数据库/Redis/AI/ES/文件/队列/额度）与恢复回滚通用步骤；冒烟新增告警规则指标一致性检查（37/37）。
- 待补：Prometheus/Grafana/Alertmanager 实际部署与告警联调（待 Docker/部署环境）、导出器（PG/Redis/ES）、故障演练记录。

## 24. 管理端联调第一批记录（2026-08-18）

- T-F-04 第一批完成：RuoYi 后端本地真实运行（PG sanye_admin 库 + schema/Quartz 修复 + 种子），经网关 `/api/v1/admin/**` 联通；管理前端真实登录表单 + RuoYi 响应适配 + X-Device-Id 修复；冒烟 39/39、E2E 17/17（管理端登录进入仪表盘）。
- 修复记录：`sanye_admin_schema.sql` 两处残留 MySQL `key` 子句 → PG 索引；Quartz 布尔列 varchar(1)/varchar(8) → boolean（PG 驱动绑定不匹配）；RuoYi CORS 与网关重复 → 属性开关默认关闭；管理前端缺 X-Device-Id → 网关 401 死循环。
- 待补：内容管理/反馈自定义接口（T-F-03/T-F-04 后续）、角色权限与菜单动态路由验收（TODO-006）、Quartz 任务生命周期（TODO-008）、管理端页面真实接口绑定（内容/反馈/任务）。

## 25. 管理端协作接口记录（2026-08-18）

- T-F-03 内容管理第一批完成：anime 受控管理接口（调用方凭证 + 状态联动公开可见性）；RuoYi 代理控制器；管理端内容页真实绑定（下架/重新发布经网关→RuoYi→anime）；单测 4 项；冒烟 45/45、E2E 19/19。
- 待补：用户反馈管理接口（feedback 服务）、角色二次校验强化（生产服务间凭证）、内容管理写入 PG（T-E 持久化后替换内存状态）。

## 26. 用户反馈管理接口记录（2026-08-18）

- T-F-03 第二批完成：feedback 服务（8087）客户端提交 + 受控管理接口 + RuoYi 代理；管理端反馈页真实处理（待处理→处理中→已关闭）；客户端反馈页真实提交（成功/失败状态）；单测 5 项；冒烟 49/49、E2E 21/21。
- 待补：反馈处理日志详情查看、通知/邮件联动（P1）、生产服务间凭证。

## 27. 权限与动态路由第一批记录（2026-08-18）

- TODO-006 第一批完成：RuoYi 代理接口方法级权限注解 + 管理前端权限感知（getInfo 权限加载/守卫拦截/按钮显隐）；修复 getInfo 顶层字段解析问题；实测 admin 200、普通角色 403、前端守卫重定向；冒烟 51/51、E2E 22/22。
- 待补：角色/菜单管理页（RuoYi 系统管理）、为内容/反馈菜单种子权限串以便角色授权、动态菜单路由（按权限生成导航）。

## 28. Quartz 任务生命周期记录（2026-08-18）

- TODO-008 第一批完成：管理前端任务管理页（列表/立即执行/暂停/恢复）经网关绑定 RuoYi /monitor/job/*；Quartz schema 修复后任务初始化/执行正常；冒烟 55/55、E2E 24/24。
- 待补：任务新增/编辑表单、任务日志查看（/monitor/jobLog）、执行失败告警联动（监控规则）。

## 29. 管理端仪表盘真实统计记录（2026-08-19）

- 管理端仪表盘统计接口与前端绑定完成：RuoYi 聚合业务服务（anime/feedback）+ 本地任务/用户计数；前端四指标与关注事项真实数据（失败回退演示数据）；修复 httpRaw 信封取 `.data` 问题；冒烟 56/56、E2E 25/25。
- 环境说明：2026-08-19 机器重启导致 PG 5433 未正常关闭、全部服务停止；已恢复 PG（自动恢复）、重启全部业务服务与前端，验证全链路通过。
- 待补：AI 对话总量/成本等跨服务统计（需 ai-chat 聚合接口）、仪表盘图表化。

## 30. AI 统计与权限菜单种子记录（2026-08-19）

- AI 对话统计聚合完成：ai-chat 受控统计接口 + RuoYi 仪表盘聚合 + 前端“AI 对话次数”指标；内容/反馈权限菜单种子（1061-1064）写入运行库与 schema 文件；冒烟 56/56、E2E 25/25。
- 待补：AI 成本统计（sanye_ai_usage 聚合）、角色管理页授权（在 RuoYi 系统管理中将新权限授予受限角色）、仪表盘图表化。

## 31. 角色授权验证记录（2026-08-19）

- 权限闭环验证完成：菜单种子 → 角色授权（role 2 授予 anime:content:list）→ 用户权限生效（ry 内容 200/反馈 403）→ 前端守卫（/content 放行、/feedback 拦截）；冒烟 57/57、E2E 25/25。
- 待补：RuoYi 角色管理页操作化（前端接入 /system/role 授权界面）、AI 成本统计、仪表盘图表化。

## 32. 二次性能优化与回归记录（2026-08-20）

- 二次性能优化已完成并生效（HTTP gzip 压缩 + 静态封面缓存头）：`sanye_server/sanye-server-web/src/main/resources/monitoring.yml` 与 `sanye_admin_server/sanye_admin_app/src/main/resources/application.yml` 开启 `server.compression`（JSON/XML/HTML/SVG，≥512B）；实测 `/api/v1/home` 2132B→623B（-71%）、`/api/v1/public/legal` 971B→688B（-29%），`Content-Encoding: gzip` 验证通过；anime 服务配置 `spring.web.resources.cache.cachecontrol.max-age: 7d`，`/covers/*` 返回 `Cache-Control: max-age=604800`。基准数据见 [docs/performance-test-report.md](performance-test-report.md) 第 9 节。
- 优化后逻辑回归（历史端口记录，当前网关为 8091、业务服务仍为 8081~8089）：冒烟 77/77、Playwright E2E 31/31 全部通过。
- 故障记录与修复：回归期间本地 PG 5433 出现 autovacuum 子进程崩溃（0xC0000142）后无法保留共享内存（error 487），业务接口 500/503、响应体损坏；已按 ops-runbook 5.2 新增步骤用 `pg_ctl stop -m fast` 重启本地联调实例，自动恢复完成，表结构与数据完好。
- AI 当前使用硅基流动真实配置：8084 读取用户级环境变量（`AI_PROVIDER=openai`、`AI_MODEL=Qwen/Qwen2.5-7B-Instruct`、`AI_BASE_URL=https://api.siliconflow.cn/v1/`、`AI_API_KEY`），`/api/v1/ai/model-info` 返回 provider=openai/model=Qwen/Qwen2.5-7B-Instruct；真实 SSE 链路 message.accepted → 模型调用返回 HTTP 402 → 系统正确落 4001 FAILED（账户余额/额度不足，外部阻塞，额度恢复后复测 AI SSE 吞吐）。密钥仅存用户环境变量，未落盘、未提交 git。
- 本次所有验证均未提交 git（按用户要求）。

## 33. 当前代码收口记录（2026-08-20）

- 角色与菜单管理已完成：`sanye_admin` 新增角色列表/新建/编辑/菜单授权/启停/删除和菜单树维护页面，绑定 RuoYi `/system/role/*`、`/system/menu/*`；角色菜单树接口增加 `system:role:query` 权限和角色数据范围校验，新建角色使用 `roleId=0` 时返回空授权集合，避免后端空指针。
- Quartz 管理已完成：任务页支持新建、编辑、删除、立即执行、暂停/恢复；任务日志页支持检索、详情、单条删除和清空；失败执行记录在任务页提示并可跳转日志，立即执行与状态操作按 `monitor:job:changeStatus` 显示。
- AI 成本统计已完成：`sanye_ai_usage` 记录真实或估算 token、延迟和成本，管理端展示累计/当日成本、输入输出 token 和近 7 天趋势；费率通过 `AI_COST_INPUT_CENTS_PER_1K`、`AI_COST_OUTPUT_CENTS_PER_1K` 环境变量配置，默认值只用于本地联调。
- 桌宠 PET-TODO-004/005/006 代码闭环已完成：角色状态、异步客户端唤起、失败反馈、设置持久化和安静时段均已实现；PET-TODO-003/007/008 的多屏缩放、锁屏、性能、安装签名和升级回滚仍需 Windows/发布环境验收。

## 34. 文档一致性收口记录（2026-08-21）

- 已将 AI 供应商、模型、HTTP 402 外部阻塞统一为 [环境配置矩阵](./environment-config.md) 的当前事实；历史百炼配置不再作为当前实现描述。
- 已将桌宠边界统一为透明无背景、互动按钮、客户端启动自动拉起和单实例复用；系统兼容与发布验收仍按 PET-TODO-003/007/008 登记。

## 35. Docker 配置收口记录（2026-08-21）

- T-B-03 配置修复：Redis 健康检查现在读取容器内 `REDIS_PASSWORD`；`full` profile 使用独立 `xxl-job-mysql` 和 `sanye_deploy/xxl-job/mysql-schema.sql`，XXL-JOB 不再依赖宿主机数据库。
- 验证证据：`docker compose -f sanye_deploy/compose.yaml config --quiet` 通过；`--profile full config --services` 能解析 10 个服务；`setup-docker.ps1` PowerShell 语法检查通过；`pnpm docs:check` 通过 515 项。
- WSL2/Docker 已恢复：WSL2 `2.7.12.0`、Docker Server `29.7.2`、Compose `5.4.0` 正常；已通过 DaoCloud/dockerproxy 国内镜像完成 `full` profile 拉取、健康检查和数据卷重启验证。

## 36. 控制台入口修复记录（2026-08-21）

- Nacos Console 按默认配置使用宿主机 `8080` 和根路径 `/`；Nacos API `8848`/gRPC `9848` 仅在容器网络内使用。
- Elasticsearch `9200` 仅为 REST API，新增同版本 Kibana `8.17.0`，访问 `http://localhost:5601`；full profile 现为 10 个容器。
- 实测：Nacos 控制台、Kibana 首页和 Kibana status API 均 HTTP 200，10 个容器均 healthy。

## 37. 单端口映射收口记录（2026-08-21）

- RabbitMQ 仅映射管理台 `15672`，MinIO 仅映射控制台 `9001`，Nacos Console 仅映射 `8080`；RabbitMQ AMQP `5672`、MinIO 对象 API `9000` 和 Nacos API/gRPC 仅在容器网络内使用。
- 所有对外暴露的中间件服务均保持一个宿主机端口；XXL-JOB MySQL 仅供容器网络访问；Kibana 作为独立控制台服务保留唯一端口 `5601`。

## 38. 中间件统一配置脚本（2026-08-21）

- 新增 [configure-middleware.ps1](../sanye_deploy/configure-middleware.ps1)，默认启动 `full` profile，并以脚本方式完成 PostgreSQL、Redis、RabbitMQ、MinIO、XXL-JOB MySQL 和 XXL-JOB 管理台账号密码及权限同步。
- 脚本同时验证 Elasticsearch、Kibana、Nacos、Sentinel、MinIO、RabbitMQ 和 XXL-JOB 管理入口；不删除数据卷，已有数据卷修改密码时支持 `Current*` 参数提供旧凭据。
- 地址、容器网络地址、用户名、密码和认证边界统一登记在 [环境配置矩阵](./environment-config.md) 第 2.2 节；部署入口和故障处理见 [sanye_deploy README](../sanye_deploy/README.md) 与 [故障处理手册](./ops-runbook.md) 第 5.5.2 节。

## 39. 公开媒体导入与播放器记录（2026-08-21）

- T-D-08 已完成代码闭环：页面元数据导入只读取配置白名单中的 HTTPS 来源页及同源选集页，提取页面可见 `iframe`，不访问或下载第三方媒体流；媒体元数据落 PostgreSQL `sanye_anime_episode`，可切换内存实现。
- 客户端详情页新增 iframe/video 播放器、选集切换、来源页、空数据、接口失败和播放器重载状态；管理端内容页新增授权播放源导入弹窗并复用 `anime:content:edit` 权限。
- 验证证据：anime 模块 Maven 单测 65 项通过且 JaCoCo 门禁通过；后端全量单测 210 项通过；媒体播放器 Playwright 4/4，清晰度专项 3/3，真实 HLS、实际播放推进与季度/搜索聚合 34/34；全量 Playwright 11 个脚本 548/548，套件内按钮体检 428/428，独立按钮稳定报告 425/425；正式片库、内存回退和管理端回退均仅保留六部作品；接口体检 60/60、三端 typecheck、前端构建和文档检查通过。真实来源版权授权、站点条款和外部播放器持续可用性登记为 GAP-016。

## 40. 动漫季度统一排序记录（2026-08-25）

- 正式目录为每部作品登记系列顺序和季度顺序，正篇按季数递增，同一季的 `Part.2` 紧随该季，OAD 等特别篇排在正篇之后。
- 番剧仓库、搜索接口结果和搜索本地回退共用同一比较方法；收藏、观看历史、最近更新和热门列表仍保持各自业务排序。
- 验证证据：客户端 typecheck、生产构建通过；乱序接口专项 Playwright 2/2，片库与搜索均恢复为第一季、第二季、第二季 Part.2、第三季、OAD。

## 41. 搜索与导入性能优化记录（2026-08-25）

- T-D-03 搜索首屏改为 20 条、3 秒超时且不重试；ES 零命中或不可用时回源动漫公开目录，只有站内为空时才查询外部候选。外部候选增加有效结果 120 秒、空结果 10 秒缓存，并合并同关键词并发请求。
- T-D-08 导入查重改为按来源和标题单条查询，新增 V9 部分索引；选集页面改为固定 8 路线程池一次提交，剧集快照改为 JDBC 批量写入。
- 代码验证：search 12/12、anime 76/76，客户端 typecheck/build 通过；真实外部来源本轮被站点防火墙拦截，端到端耗时保持 `待环境`，解除条件为授权来源恢复可访问后复测冷/热导入。
- V9 回滚：删除两个部分索引即可，不删除业务数据；命令以 [数据库设计](./database-design.md) 第 6 节为准。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.3 | 更新 T-B-03 的 Compose 配置、XXL-JOB MySQL 依赖、Docker Desktop/WSL 实际状态和验证证据 | Docker 配置修复与本地诊断 |
| 2026-08-21 | v0.4 | 补充国内镜像拉取、full profile 健康检查和数据卷重启验证结果 | Docker Compose 实际运行验收 |
| 2026-08-21 | v0.5 | 增加 Nacos 控制台端口和 Kibana，并完成 10 容器健康与控制台 HTTP 验证 | Nacos/Kibana 实测 |
| 2026-08-21 | v0.6 | 收口每个中间件仅一个宿主机端口，调整 Nacos 控制台访问地址 | Compose 端口配置与重启验证 |
| 2026-08-21 | v0.7 | 将 RabbitMQ/MinIO 的唯一宿主机端口调整为可登录管理控制台 | 控制台访问验证 |
| 2026-08-21 | v0.8 | 将 Nacos Console 宿主机入口恢复为默认 `8080/`，同步 API 内部网络说明 | Nacos Console HTTP 验证 |
| 2026-08-21 | v0.9 | 将 XXL-JOB 管理台上下文调整为根路径 `/`，消除端口根路径 404 | XXL-JOB 根路径 HTTP 验证 |
| 2026-08-21 | v1.0 | 增加统一中间件配置脚本、连接矩阵和已有数据卷账号权限同步证据 | `configure-middleware.ps1` 语法与本地执行验证 |
| 2026-08-21 | v1.1 | 登记 T-D-08 公开媒体元数据导入与播放器实现、测试证据和授权外部差距 | 媒体评审、代码实现与单测/E2E |
| 2026-08-21 | v1.2 | 补充媒体专项测试报告、全量回归和接口体检结果 | 最终本地联调验证 |
| 2026-08-24 | v1.3 | 记录 ArtPlayer 5.4.0 替换、HLS customType 接入和控制属性验证 | `e2e/e2e-media-player-live.mjs`、媒体开发设计 |
| 2026-08-24 | v1.4 | 合并首页最近导入与最近更新区块，补充单区块与去重回归断言 | `sanye_client/src/views/homeView.vue`、`e2e/e2e-verify.mjs` |
| 2026-08-24 | v1.5 | 将首页精选推荐内容替换为《你的名字》和《无职转生》，补充推荐作品回归断言 | `sanye_client/src/views/homeView.vue`、`e2e/e2e-verify.mjs` |
| 2026-08-24 | v1.6 | 将无职转生各篇章改为独立片库卡片和独立封面，并隐藏其他演示作品 | `animeRepositoryView.vue`、`searchView.vue`、`animeCatalog.ts`、`e2e-media-player-live.mjs` |
| 2026-08-24 | v1.8 | 同步完整回归后的全量基线：Playwright 548/548、按钮体检 428/428 | `pnpm e2e:all`、`node e2e/e2e-buttons.mjs` |
| 2026-08-24 | v1.9 | 清理 E2E 临时数据后同步当前基线：全量 Playwright 540/540、独立按钮体检 425/425（完整套件内 420/420） | `pnpm e2e:all`、`node e2e/e2e-buttons.mjs`、`pnpm docs:check` |
| 2026-08-24 | v2.0 | 登记多码率 HLS 清晰度专项 3/3、真实 HLS 专项 34/34、有效全量 Playwright 548/548 和套件内按钮 428/428；明确独立按钮 425/425 为已完成的稳定历史报告 | `pnpm e2e:media-quality`、`e2e/e2e-media-player-live.mjs`、`pnpm e2e:all` |
| 2026-08-25 | v2.1 | 将动漫系列与季度顺序收口为统一目录元数据，片库和搜索共用排序规则并增加乱序接口专项回归 | `animeCatalog.ts`、`e2e/e2e-season-order.mjs`、客户端 typecheck/build |
| 2026-08-25 | v2.2 | 将剧场版的多条媒体记录改为语言或播放线路展示，消除第一集、第二集错误语义 | `animeDetailView.vue`、`e2e/e2e-movie-playback-lines.mjs` |
| 2026-08-25 | v2.3 | 登记搜索目录回源与外部缓存、V9 导入查重索引、8 路受控抓取和剧集批量写入；真实来源耗时保留为待环境复测 | search 12/12、anime 76/76、客户端 typecheck/build、`pnpm docs:check` |
