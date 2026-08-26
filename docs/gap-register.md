# sanye_anime 差距登记表

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.16 |
| 文档状态 | 当前差距、负责人和阶段出口标准 |
| 适用范围 | 产品和架构基线之后仍需完成的工作 |
| 更新时间 | 2026-08-21 |

本表区分可以在仓库内完成的工作，以及需要代码、外部服务、法律证据、设计资产或真实部署环境才能完成的工作。

与管理后端真实运行、前端联调和交付相关的具体执行项，统一维护在 [开发待办事项](./development-todo.md)。本表保留差距状态和阶段出口标准，待办文档负责拆分具体工作和验收动作。

## 1. 状态定义

| 状态 | 含义 |
| --- | --- |
| `ready` | 无需外部审批，可以在仓库内实现 |
| `in-progress` | 已开始仓库工作，但阶段出口标准尚未完成 |
| `blocked-external` | 需要外部账户、来源、许可证、服务或环境 |
| `blocked-code` | 必须先完成应用骨架或运行时实现 |
| `verified` | 已有证据并且阶段出口标准通过 |

## 2. 当前差距

| 编号 | 领域 | 差距 | 状态 | 下一步 | 阶段出口标准 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| GAP-001 | 项目结构 | 三个核心前端/业务工程、RuoYi 管理后端、部署配置和 CI 均已建立并通过本地构建；完整部署联动仍待环境 | `in-progress` | 完成 Docker/发布环境联动 | `sanye_client`、`sanye_admin`、`sanye_server` 和 `sanye_admin_server` 构建并可按部署清单启动 | P0 |
| GAP-002 | CI/CD | CI 工作流已落地（T-B-02 完成：[ci.yml](../.github/workflows/ci.yml) 前端/后端/依赖扫描/密钥扫描四作业，本地验证通过）；镜像构建、注册表和分支保护仍待启用 | `in-progress` | 启用分支保护并在部署环境接入镜像发布 | 拉取请求检查通过，失败检查会阻止进入测试或发布分支 | P0 |
| GAP-003 | 运行环境 | Compose 已通过国内镜像完成 PostgreSQL、Redis、RabbitMQ、Elasticsearch、Kibana、MinIO、Nacos、Sentinel、XXL-JOB 及其独立 MySQL 的本地启动；10 个容器健康检查、每个对外暴露的中间件一个宿主机端口、控制台、关键端口和数据卷重启均已验证 | `verified` | 完成业务服务容器化部署后验证动态 Nacos 注册；RabbitMQ 消费者和正式 XXL-JOB 任务另见 GAP-009 | 新机器可以通过健康检查启动 MVP 所需依赖 | P0 |
| GAP-004 | 内容数据 | 尚无测试数据集或生产内容导入 | `blocked-external` | 获取授权来源并准备小型种子数据集 | 20 至 50 部测试作品具备来源、状态、图片和排期证据 | P0 |
| GAP-016 | 媒体版权与外部播放 | 媒体元数据导入与播放器代码已完成；目标站点内容授权、条款确认和真实外部播放器持续可用性尚未完成 | `blocked-external` | 获取书面授权并在目标环境执行真实来源播放验收 | 每个导入来源有授权证据；来源页、播放器、删除通知和版权投诉流程通过审查 | P0 |
| GAP-005 | 版权证据 | 动漫数据、图片和外部链接尚无字段级许可与来源记录 | `blocked-external` | 记录来源、授权范围、有效期和下架联系人 | 每个公开资源都能追溯到已批准的来源记录 | P0 |
| GAP-006 | AI 供应商 | 供应商已接入：硅基流动 OpenAI 兼容模式（LangChain4j OpenAI 兼容提供者），模型 `Qwen/Qwen2.5-7B-Instruct`；`/api/v1/ai/model-info` 配置读取正确，但真实模型请求返回 HTTP 402（账号余额/额度不足），系统失败链路已正确落库；成本上限、正式 SLO 与额度策略仍待账号侧 | `in-progress` | 额度恢复后完成受控真实模型集成测试（含会话记忆与 RAG），并登记成本上限、限流、超时和失败行为 | 记录供应商、模型、SDK、额度、超时、成本和失败行为 | P0 |
| GAP-007 | AI 评测 | 评测集已落地（T-G-04：100 条 + 回归框架 + 通过率门禁，[ai-evaluation.md](./ai-evaluation.md)）；ES RAG 本地命中已验证，真实模型评测受硅基流动额度阻塞 | `in-progress` | 额度恢复后复用评测集评估真实模型回答、延迟和 RAG 引用 | 至少 100 条案例具备分类、预期行为、评分和回归结果；真实模型与引用结果可复测 | P0 |
| GAP-008 | 视觉设计 | 产品文档只有低保真结构，尚无客户端、官网页面和管理平台的高保真页面与可复用视觉系统 | `ready` | 制作 `sanye_client`、官网页面和 `sanye_admin` 页面设计 | 主要 P0 流程具备加载、空状态、错误和正常状态的已确认页面 | P1 |
| GAP-009 | 版本兼容性 | RuoYi 管理后端 JDK 21 构建、PG/Quartz 适配、真实启动/登录/权限/Quartz/前端联调已验证；搜索 ES 索引命中、文件 MinIO 对象/元数据导入已完成本地验证；RabbitMQ 当前只有基础拓扑，没有真实生产者/消费者，XXL-JOB 当前没有业务任务 | `in-progress` | 接入 RabbitMQ 事件生产者/消费者、XXL-JOB 执行器与真实任务，并在目标环境复测 | 最小启动、构建、登录、搜索、存储和任务执行全部通过 | P0 |
| GAP-010 | 备份恢复 | 备份脚本已实现并实测生成（[backup-local.ps1](../sanye_deploy/backup-local.ps1)，dump 约 48KB，保留最近 N 份）；正式恢复演练待独立环境 | `blocked-external` | 在干净测试环境执行 pg_restore 和 MinIO 对象恢复并登记结果 | 干净测试环境能够恢复数据并完成结果校验 | P0 |
| GAP-011 | 可观测性 | 监控方案/指标/告警规则/故障手册已落地（T-G-03 两批 + T-G-06 故障注入 21/21）；Prometheus/Grafana/Alertmanager 实际部署与告警联调待环境 | `blocked-external` | 部署监控栈并验证告警触发和通知链路 | 登录、内容、搜索、AI、存储、队列、任务和数据库故障可观测 | P1 |
| GAP-012 | 发布运维 | 发布检查清单、回滚流程、已知问题模板已落地（[release-management.md](./release-management.md)、[quality-gates.md](./quality-gates.md)）；首次发布演练待发布环境 | `blocked-external` | 首次测试发布执行发布与回滚演练并登记记录 | 仅按文档即可完成一次发布和回滚 | P0 |
| GAP-013 | 法律文档 | 隐私政策、使用条款、版权声明和数据删除文案尚未完成审查；正文编辑能力已落地（T-D-07：RuoYi 编辑草稿/发布 → `/public/legal` → 官网可见，种子文案保持占位） | `blocked-external` | 确认法律文案和联系人，审查通过后经管理端发布 | 已发布法律文档具备负责人、审查日期和联系渠道 | P0 |
| GAP-014 | 官网运营 | 尚未选择域名、托管、TLS、公开联系人和分析策略 | `blocked-external` | 选择公开运行环境 | 官网可通过批准的域名访问，并具备法律和支持信息 | P1 |
| GAP-015 | 认证接入 | CAS 集成代码已完成并通过本地 Mock CAS 联调（T-F-01 本地部分：登录跳转、ticket 一次性校验、自动建号、JWT 签发、网关注入 X-User-Id、前端回调保存 token，实测闭环通过）；SLO 单点登出与正式 CAS 服务器替换仍待环境 | `blocked-external` | 部署真实 CAS 服务器替换 Mock，验证 SLO、refresh 轮换与正式账号映射 | CAS 登录、退出、单点登出与本地会话签发/吊销验证通过 | P0 |

## 3. 已完成的改进

- 三端产品边界已记录在 [overall-architecture.md](../product/overall-architecture.md)。
- 主要产品和技术决策已记录在 [decision-log.md](./decision-log.md)。
- 产品需求和功能说明现在使用相同的 MVP 规则。
- 技术架构已明确按微服务建设（D-024）：网关 + 8 个业务服务，服务间通过 OpenFeign 与事件协作，单 PostgreSQL 按服务独立 schema。
- 版本基线不再把 Electron 作为未决的 MVP 事项。
- 根目录 README 已提供架构和文档索引。
- IDE、本地密钥和构建产物文件已加入 Git 排除规则。
- `sanye_server` 已具备 Spring Boot 启动类、Maven 入口、网关与业务服务、PostgreSQL/Redis 持久化和本地联调脚本；ES 搜索、MinIO 文件对象的本地数据面已验证，RabbitMQ 业务事件联动仍待实现。
- `sanye_admin_server` 已完成 RuoYi 模块接入、Java 21 Maven 构建和 PostgreSQL/Quartz 初步适配；构建证据为 2026-08-12 `BUILD SUCCESS`。
- `sanye_client` 和 `sanye_admin` 具备独立的 Vue 入口、路由、环境模板和构建命令；官网页面归入 `sanye_client` 规划，`sanye_admin` 保持 RuoYi 管理平台边界。
- 客户端与官网交互原型已完成首轮完整评审与整改，评审及整改记录见 [原型评审记录](./prototype-review.md)；P0 主流程可连续操作，主要问题已按结论处理，产品文档已补充 HOME-013 并记录决策 D-017。
- 客户端与官网 P0 页面状态矩阵已建立（见 [页面状态矩阵](../product/page-state-matrix.md)），AI 回答过程状态机已同步到原型。
- MVP 冻结清单已建立（三端 P0/P1/P2 边界、本期不做与变更规则），见 [MVP 冻结清单](../product/mvp-freeze.md)。
- 管理平台 P0 原型已完成（登录、角色权限可见性、内容管理闭环、反馈处理、任务与审计），状态矩阵见 [页面状态矩阵](../product/page-state-matrix.md) 第 6 节。
- 产品文档已按 2026-08-18 版本冻结，三个入口原型与页面状态矩阵、MVP 冻结清单一致性核对通过，冻结基线见 [产品文档目录](../product/README.md)。
- 客户端最小垂直链路联调已通过（2026-08-18）：历史网关 8080（当前本机联调 8091）→ auth/anime/ai-chat，`sanye_deploy/smoke-local.ps1` 17 项全通过，Playwright 客户端主链路 10 项全通过（首页→详情→AI SSE→推荐→详情、官网公开接口、配额、CORS/资源错误）。
- 本地联调数据库已就绪（2026-08-18）：PG 5433 本地实例（sanye / 123456）+ Redis 6379；`sanye-server-web` 引入 spring-boot-starter-jdbc 后 auth/anime/ai-chat 启动时 Flyway 空库迁移验证通过；AI 额度使用 Redis 计数（不可用时降级内存）。
- AI 服务 LangChain4j 集成基线已落地（2026-08-18）：StreamingChatModel 提供者抽象（AI_PROVIDER=dev 本地模拟 / openai 兼容）、ChatMemory 会话记忆、推荐卡片最小链路；RAG（ES ContentRetriever）与正式供应商接入见 GAP-006、T-E-01/T-E-03。
- 网关鉴权前置与跨服务链路已落地（2026-08-18，T-C-05）：业务路由要求 X-Device-Id（缺失返回 401/2001），公开白名单（public/system ping/covers/actuator）放行；ai-chat 通过 OpenFeign 回源 anime 校验推荐作品；AI 生成线程池 MDC 透传，请求 ID 贯穿 前端→网关→ai-chat→anime；冒烟 19/19、E2E 10/10。正式 CAS Token 校验（GAP-015 / T-F-01）接入后替换设备头前置。
- 首页聚合缓存已落地（2026-08-18，T-D-01）：Redis 缓存旁路 + 单飞防击穿 + 空值短 TTL 防穿透 + TTL 抖动防雪崩 + 失效钩子；缓存读写失败自动降级回源；管理端内容写入后的失效触发（Outbox 事件）待 T-F-03/T-E-02 接入。
- LangChain4j AiServices 与记忆持久化已落地（2026-08-18，T-E-01）：AiServices 助手 + ChatMemoryStore（PG，`sanye_ai_chat` schema，V2/V3 迁移）；RAG 检索（GAP-006 / T-E-03）与供应商正式接入待推进。
- 会话与消息持久化已落地（2026-08-18，T-E-02）：会话/消息存 PG（V4-V6 迁移），重启后历史与 AI 记忆可恢复；越权校验、删除级联、clientMessageId 幂等、生成前失败退额度均验证通过；RAG（T-E-03）与 ES 环境、正式供应商（GAP-006）待推进。
- 番剧仓库与详情聚合已落地（2026-08-18，T-D-02/T-D-04）：列表组合筛选 + 分页、详情角色/相似/排期/来源；内容仍为内存演示数据，正式内容管理写入（T-F-03）与授权来源（GAP-005）接入后替换。
- AI 安全与剧透防护已落地（2026-08-18，T-E-04）：SAFE 规则文档、拒答关键词预检、输出二次校验，评测第一批 10 项通过；完整评测集（≥100 条，GAP-007 / T-G-04）与 RAG 文档管理（T-E-03）待推进。
- 收藏与历史设备级过渡已落地（2026-08-18，T-F-02 过渡版）：favorite 服务收藏/历史按 owner_key 持久化（设备维度），作品信息跨服务回源；CAS（GAP-015 / T-F-01）接入后迁移到用户维度并做账号合并。
- 推荐卡片结构化回源已落地（2026-08-18，T-E-07）：模型输出 JSON 数组解析 + 严格回源校验（未发布/不存在丢弃）；RAG 检索（T-E-03）接入后替换静态候选池。
- 安全整改第一批已落地（2026-08-18，T-G-02）：入参校验加固（长度/正数）、SQL 注入按字面量处理、超长参数 1001、FastJson2 核查（源码零直接引用）；上传/SSRF（文件服务）、refresh 复用（CAS）待对应功能接入后补测。
- 可观测性与备份第一批已落地（2026-08-18，T-G-03）：全服务 /actuator/prometheus + AI/首页业务指标；本地 PG 备份脚本（pg_dump + 保留策略 + 恢复说明）；Prometheus/Grafana/告警落地（GAP-011 / TODO-014）待部署环境。
- 自动化测试门禁已落地（2026-08-18，T-G-01）：JaCoCo 覆盖率检查绑定 mvn test（CI 自动执行），排除样板类后 6 模块达标（core/web/gateway/anime/favorite ≥70%，ai-chat ≥40%）；Testcontainers 集成测试待 Docker 环境（GAP-003）。
- 搜索与 RAG 代码已落地（2026-08-18，历史记录）：search 服务 ES 索引/同步/BM25/分页/高亮/4002 降级；ai-chat LangChain4j ContentRetriever RAG。后续已完成 Docker ES 实例、15 部索引、搜索命中和 RAG 引用本地联调；正式环境容量、权限和网络验收仍按 GAP-009 处理。
- 性能与稳定性第一批已落地（2026-08-18，T-G-05）：线程池可配置与指标、HikariCP 指标、压测基线（load-test.mjs）；正式弱网/断网演练与真实负载压测待独立压测环境与真实模型。
- 文件服务与安全第二批已落地（2026-08-18，T-G-02）：上传/下载 + 大小/类型/扩展名白名单 + 路径穿越防护 + SHA-256 + 元数据入库；MinIO 对象存储与病毒扫描（scan_status）待 T-B-03 与后续。
- 告警配置与故障手册已落地（2026-08-18，T-G-03）：Prometheus 抓取/告警规则（配置即代码）+ 首页错误指标 + 故障手册；Prometheus/Grafana/Alertmanager 部署与告警联调待环境（GAP-011）。
- 管理端联调已收口（2026-08-20，TODO-005 至 TODO-009）：RuoYi 后端真实运行（PG sanye_admin + schema/Quartz 修复 + 种子，8089）经网关联通；内容、反馈、角色/菜单、Quartz、用户、审计和仪表盘均已完成真实接口绑定与本地验收；生产凭据和正式发布仍待环境。
- 管理端内容管理协作已落地（2026-08-18，T-F-03）：anime 受控管理接口（X-Caller-Name 凭证、状态联动公开可见性）+ RuoYi 代理 + 管理端内容页真实绑定；反馈管理接口与生产服务间凭证待后续。
- 用户反馈管理闭环已落地（2026-08-18，T-F-03 第二批）：feedback 服务提交/受控管理接口 + RuoYi 代理 + 管理端/客户端反馈页真实绑定；通知联动与生产服务间凭证待后续。
- 权限与动态路由已收口（2026-08-20，TODO-006）：RuoYi 方法级权限注解、管理端角色/菜单页面、前端守卫、按钮显隐和 `/admin/getRouters` 路由清单均已接入；角色菜单树接口增加权限与数据范围校验，新建角色空 ID 不再触发空指针。
- Quartz 任务生命周期已收口（2026-08-20，TODO-008）：管理前端已支持列表、立即执行、暂停、恢复、新建、编辑、删除、任务日志、失败记录提醒与日志跳转；操作按钮按权限显隐。
- 管理端仪表盘真实统计已收口（2026-08-20）：RuoYi `/dashboard/stats` 聚合 anime/feedback/任务/用户/AI 对话/成本，前端展示累计与当日成本、token 和近 7 天成本趋势；费率通过环境变量覆盖。
- Docker Compose 配置与运行验收（2026-08-21，T-B-03）：修复 Redis 健康检查密码注入；`full` profile 增加独立 MySQL 8.4.5、XXL-JOB 3.1.0 初始化表、MinIO/RabbitMQ/Nacos/Kibana/XXL-JOB 管理入口；补齐各服务健康检查；通过 DaoCloud/dockerproxy 国内镜像完成拉取，10 个容器全部 healthy，每个对外暴露的中间件仅一个宿主机端口，四个管理入口和 XXL-JOB 均可访问。
- 实现级技术设计稿与自评审已完成（安全、并发、分布式、缓存安全、测试与部署），见 [详细技术设计](./technical-design.md)；开放 TD 项目登记后续决策，不阻塞当前本地实现。
- 开发任务拆分已完成并通过一致性验证（41 个任务、1 至 3 天/任务、合计 95 天、三端 P0 全覆盖），见 [开发任务清单](./development-tasks.md)。
- 正式编码已启动（2026-08-18）：首个任务分支 `feature-T-B-01` 已创建并完成 T-B-01；T-B-02 自动检查门禁也已完成。
- 微服务基线已确立（2026-08-18，D-024）：网关 + 8 个业务服务 + RuoYi 管理端，单 PostgreSQL 按服务独立 schema；开发计划与任务清单已重新基线。

## 4. 复查节奏

1. 每个开发阶段结束时更新本表。
2. 没有命令结果、截图、报告、记录或其他证据时，不得将差距标记为 `verified`。
3. 每个已完成差距都要关联实现变更或外部证据。
4. 发布候选版本前重新评估 P1 差距，并在下一版本前评估 P2 范围。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.11 | 将 GAP-006 统一为硅基流动/Qwen2.5-7B-Instruct，并明确 HTTP 402 为当前外部阻塞 | environment-config、真实联调结果 |
| 2026-08-21 | v0.12 | 更新 GAP-003：登记 Compose 自包含修复、Docker Desktop 升级和 WSL 引擎启动阻塞 | T-B-03 配置修复与本地诊断 |
| 2026-08-21 | v0.13 | 将 GAP-003 更新为已验证，并记录国内镜像、full profile 和数据卷重启证据 | T-B-03 本地运行验收 |
| 2026-08-21 | v0.14 | 补充 Nacos 控制台和 Kibana，更新 full profile 为 10 个健康容器 | Nacos/Kibana 实测 |
| 2026-08-21 | v0.15 | 收口每个中间件只映射一个宿主机端口，更新 Nacos 控制台访问地址 | Compose 端口配置与重启验证 |
| 2026-08-21 | v0.16 | 将 MinIO/RabbitMQ 唯一宿主机端口调整为管理控制台并补充登录入口 | 控制台访问验证 |
| 2026-08-21 | v0.17 | 修正备份、监控和发布差距的状态分类；登记 Nacos/网关端口冲突与本机 Docker 联调边界 | `run-local.ps1`、Compose、发布审计 |
