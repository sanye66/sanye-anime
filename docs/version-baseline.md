# sanye_anime AI PC 客户端技术版本基线

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.4 |
| 文档状态 | Baseline，项目初始化时执行兼容性验证 |
| 适用范围 | Spring 服务端、Vue 客户端、RuoYi 管理平台和基础设施 |
| 关联文档 | [产品总体架构](../product/overall-architecture.md)、[技术架构](./technical-architecture.md)、[开发计划](./development-plan.md)、[决策记录](./decision-log.md)、[差距登记表](./gap-register.md) |
| 更新时间 | 2026-08-21 |

## 1. 版本选择结论

本项目采用以下兼容基线：

```text
Java 21 LTS
  -> Spring Boot 3.5.x
  -> Spring Cloud 2025.0.x
  -> Spring Cloud Alibaba 2025.0.0.0
```

Spring Cloud Alibaba `2025.0.0.0` 的官方发布说明以 Spring Boot 3.5.0 和 Spring Cloud 2025.0.0 为依赖基线。本项目先采用这一条 Boot 3 兼容线，不直接切换到 Spring Boot 4，避免 RuoYi、第三方组件和内部代码同时发生大版本迁移。

### 1.1 版本状态

| 状态 | 含义 |
| --- | --- |
| `baseline` | 项目默认版本，初始化工程必须使用 |
| `managed` | 由上层 BOM 管理，不允许模块单独覆盖 |
| `pinned` | Docker 镜像或前端依赖必须锁定具体版本 |
| `review` | 需要在正式开发前做兼容性验证 |
| `deferred` | 不进入 MVP，只有满足决策条件后才引入 |

## 2. 服务端版本基线

| 技术 | 版本选择 | 状态 | 版本规则 |
| --- | --- | --- | --- |
| JDK | 21 LTS | baseline | 只接受 Java 21，统一时区和编码 |
| Maven | 3.9.9 | pinned | 构建环境统一，禁止开发机自行升级 |
| Spring Boot | 3.5.x，初始使用 3.5.0 基线 | managed | 由 Spring Cloud Alibaba 兼容线验证后再选择补丁版本 |
| Spring Cloud | 2025.0.x，初始使用 2025.0.0 | managed | 由 BOM 统一管理 |
| Spring Cloud Alibaba | 2025.0.0.0 | baseline | 所有微服务使用同一版本 |
| Spring Cloud Gateway | 随 Spring Cloud 2025.0.x | managed/review | MVP 网关统一入口；验证 WebFlux 网关与 Spring Boot 3.5、Nacos、Sentinel 的兼容性 |
| OpenFeign | 随 Spring Cloud 2025.0.x | managed | 不单独指定版本 |
| MyBatis-Plus | 3.5.x | review | 与 Spring Boot 3.5、JDK 21 做启动和事务验证 |
| Lombok | 1.18.36+ | review | 必须验证 JDK 21 编译和 IDE 注解处理 |
| Jackson | 随 Spring Boot 3.5.x | managed | 禁止模块自行覆盖 |
| HikariCP | 随 Spring Boot 3.5.x | managed | 统一连接池配置 |
| Apereo CAS Client | 待定 | review | 与 Spring Boot 3.5、JDK 21 的兼容性验证后锁定；确认 CAS 服务器版本与协议（v3 serviceValidate） |
| LangChain4j | 1.x（待定） | review | 与 Spring Boot 3.5、JDK 21、ES Java Client 的兼容性验证后锁定；包含 spring-boot-starter 与模型适配器 |

### 2.1 服务端基线规则

- 所有 Spring 依赖通过 Spring Cloud Alibaba BOM、Spring Cloud BOM 和 Spring Boot BOM 管理。
- 业务模块的 `pom.xml` 不允许随意覆盖 BOM 中的版本。
- Java 编译目标、测试运行时和 Docker 运行时都使用 Java 21。
- 第一个服务启动前必须完成依赖树检查，确认不存在同一组件多个主版本。
- 生产补丁升级必须先在 `dev` 和 `test` 环境验证，再进入 `release`。

## 3. 微服务治理组件

| 技术 | 版本选择 | 状态 | 说明 |
| --- | --- | --- | --- |
| Nacos Server | 3.0.3 | pinned | 注册中心和配置中心统一版本 |
| Nacos Client | 随 Spring Cloud Alibaba 2025.0.0.0 | managed | 不在业务模块手动覆盖 |
| Sentinel Core | 1.8.8 | baseline | 限流、熔断和降级 |
| Sentinel Dashboard | 1.8.8 | pinned | 仅管理环境部署，生产访问受限 |
| Spring Cloud LoadBalancer | 随 Spring Cloud 2025.0.x | managed | 不单独指定版本 |
| Spring Cloud OpenFeign | 随 Spring Cloud 2025.0.x | managed | 服务间调用统一版本 |

### 3.1 Nacos 规则

- Nacos Server 和 Client 不跨大版本混用。
- 配置按 `local`、`dev`、`test`、`staging`、`prod` 分环境管理。
- 敏感信息不明文写入配置文件。
- 配置变更必须有版本、操作人和回滚记录。

### 3.2 Sentinel 规则

- Sentinel 只负责流量治理，不承担业务权限判断。
- 生产规则不能只保存在本地内存，需要有持久化策略。
- 登录、搜索、AI 发送、文件上传和管理操作必须建立独立规则。
- Dashboard 不对公网开放。

## 4. 数据和中间件版本基线

| 技术 | 版本选择 | 状态 | 兼容约束 |
| --- | --- | --- | --- |
| PostgreSQL | 16.x | pinned | 首版不跨 PostgreSQL 大版本升级 |
| PostgreSQL JDBC | 42.7.x | managed/review | 与 JDK 21、PostgreSQL 16 验证 |
| Redis Server | 7.4.x | pinned | 单机开发和生产集群使用同一主版本 |
| Lettuce | 随 Spring Boot 3.5.x | managed | 不混用不同 Redis 客户端 |
| Elasticsearch | 8.17.x | pinned | ES、Kibana 和 Java Client 使用同一小版本 |
| Kibana | 8.17.0 | pinned | Elasticsearch 可视化控制台，与 ES 保持同一小版本 |
| Elasticsearch Java Client | 8.17.x | baseline | 不使用跨主版本客户端 |
| RabbitMQ | 4.1.x | pinned | 使用 Erlang 27.x 运行时 |
| Erlang | 27.x | pinned | 与 RabbitMQ 镜像匹配 |
| MinIO | 固定发布日期镜像 | pinned | 禁止使用 `latest` |

### 4.1 PostgreSQL 规则

- PostgreSQL 16 作为首版稳定基线，不因为开发环境方便直接使用更高主版本。
- 表结构通过迁移脚本管理，禁止手工修改生产表结构。
- 所有核心表必须有创建时间、更新时间和必要的状态字段。
- 数据库连接、事务隔离、备份和恢复在 test 环境先验证。

### 4.2 Redis 规则

- Redis 只做缓存、短期状态、额度和幂等，不作为唯一事实数据源。
- Key 命名、过期时间和数据类型统一登记。
- 额度和幂等使用原子操作。
- 生产环境关闭不必要的高风险命令权限。

### 4.3 Elasticsearch 规则

- Elasticsearch 8.17.x、Kibana 8.17.x 和 Java Client 8.17.x 必须保持同一小版本。
- 使用索引别名完成重建和切换。
- 作品主数据以 PostgreSQL 为准，ES 只保存可重建的搜索副本。
- 升级 ES 前必须做全量索引重建和回滚演练。

### 4.4 RabbitMQ 规则

- RabbitMQ 4.1.x 使用 Erlang 27.x。
- 生产者和消费者都必须携带事件 ID。
- 重试队列、死信队列和消费幂等作为首版必选能力。
- RabbitMQ 升级必须验证消息确认、顺序、重试和死信行为。

### 4.5 MinIO 规则

- MinIO 使用固定发布日期镜像，例如项目初始化时锁定一条经过验证的 `RELEASE.*` 标签。
- 禁止使用 `latest`、浮动日期或未记录来源的镜像。
- 生产 Bucket 默认私有，使用短期签名地址访问。
- 升级前必须验证对象读写、分片上传、删除和权限策略。

## 5. 任务、容器和管理平台版本基线

| 技术 | 版本选择 | 状态 | 说明 |
| --- | --- | --- | --- |
| XXL-JOB Core | 3.1.0 | baseline | 执行器依赖统一版本 |
| XXL-JOB Admin | 3.1.0 | pinned/review | 与执行器保持同版本 |
| Docker Engine | 27.x | pinned | 开发、测试环境统一主版本 |
| Docker Compose | v2.32.x | pinned | 使用 Compose Specification |
| Prometheus | 3.x（待定） | pinned | 指标采集，镜像锁定后登记 |
| Grafana | 11.x（待定） | pinned | 指标看板与告警，镜像锁定后登记 |
| RuoYi-Vue | 3.9.x | review | 管理平台独立锁版本 |
| RuoYi 前端 Node.js | 22 LTS | pinned | 管理平台构建环境 |
| Node.js | 22 LTS | pinned | Vue 客户端和 RuoYi 管理平台统一运行时 |
| pnpm | 10.15.0 | pinned | 前端依赖安装和锁文件统一 |
| Vue | 3.5.x | baseline | PC Web 客户端建议基线 |
| TypeScript | 5.7.x | baseline | PC Web 客户端类型系统 |
| Vite | 6.x | baseline | PC Web 客户端构建工具 |
| Playwright | 1.x（待定） | review | E2E 测试工具，Node 22 环境，版本验证后锁定 |

### 5.1 PC 客户端形态

在没有另行确认前，PC 客户端默认按 PC Web 形态开发：

```text
Vue 3.5.x + TypeScript 5.7.x + Vite 6.x + Node.js 22 LTS
```

如果后续确定使用桌面客户端，再单独增加 Electron 版本，不在当前版本基线中提前引入桌面壳层。

### 5.2 RuoYi 兼容边界

RuoYi 版本不能直接假定与 Spring Cloud Alibaba 版本共用同一个父工程。首版按管理平台独立构建和部署处理：

- RuoYi 使用自身锁定的 3.9.x 版本线。
- RuoYi 不直接覆盖业务服务的 Spring Cloud BOM。
- 管理平台与业务服务通过明确的业务能力协作。
- 如果采用 RuoYi-Vue-Plus 或其他 Boot 3 分支，必须另建兼容性验证记录，不能混用标准 RuoYi 依赖。

## 6. 版本锁定文件

项目初始化后必须提交以下锁定文件：

| 文件 | 作用 |
| --- | --- |
| `pom.xml` | Java 服务父工程、BOM 和插件版本 |
| `.mvn/wrapper/maven-wrapper.properties` | Maven Wrapper 版本 |
| `package.json` | Vue 客户端和 RuoYi 管理平台前端版本范围 |
| `pnpm-lock.yaml` | 前端完整依赖版本 |
| `compose.yaml` | 本地基础设施镜像标签 |
| `.tool-versions` 或等价文件 | JDK、Node.js、Maven 和 pnpm 版本 |
| `sanye_deploy/images.lock` | 测试和生产镜像摘要或固定标签 |
| `docs/version-record.md` | 每次版本升级的验证结果和回滚记录 |

## 7. 版本升级规则

### 7.1 允许的升级

- 安全补丁升级：发现高危漏洞时可以加急验证。
- 同一小版本内的补丁升级：通过构建、测试和灰度后合并。
- 依赖升级必须关联变更原因、影响范围和验证结果。

### 7.2 需要技术评审的升级

- Spring Boot、Spring Cloud、Spring Cloud Alibaba 主版本或小版本升级。
- PostgreSQL、Redis、RabbitMQ、Elasticsearch、Nacos 的主版本升级。
- RuoYi 大版本升级。
- JDK 21 升级到新的 LTS 大版本。
- 前端框架、构建工具和 Electron 主版本升级。

### 7.3 禁止事项

- 禁止使用 `latest` 镜像。
- 禁止业务模块自行覆盖 BOM 管理的依赖。
- 禁止只在开发机验证后直接升级生产。
- 禁止在同一个发布中同时升级 Spring 基座、数据库和消息中间件主版本。
- 禁止没有回滚方案的生产依赖升级。

## 8. 首次落地验证清单

### 8.1 RuoYi 管理后端当前验证结果

- [x] `sanye_admin_server` 已建立独立 Maven 根工程和 6 个功能模块。
- [x] Java 包名统一为 `com.sanye.admin`，启动类为 `SanyeAdminServerApplication`。
- [x] 使用 JDK 21 执行 `mvn clean package -DskipTests=true` 构建成功。
- [x] PostgreSQL 初始化脚本、Quartz 初始化脚本和环境变量配置已建立。
- [x] PostgreSQL、Redis、本地 CAS Mock、真实管理登录和权限链路已完成本地联调。
- [x] `sanye_admin` 前端主要 P0 页面已绑定真实管理接口。
- [ ] 正式环境凭据、容器联动、真实 CAS、外部中间件和发布流程仍待环境验收。

- [ ] Java 21、Spring Boot 3.5.x、Spring Cloud 2025.0.x、Spring Cloud Alibaba 2025.0.0.0 可以完成最小服务启动。
- [ ] Nacos 3.0.3 可以完成服务注册和配置读取。
- [ ] Sentinel 1.8.8 可以对 AI 和登录功能生效。
- [ ] PostgreSQL 16、Redis 7.4、RabbitMQ 4.1、Elasticsearch 8.17、MinIO 固定镜像可以通过 Docker 启动。
- [ ] XXL-JOB 3.1.0 Admin 和执行器可以完成一次任务执行。
- [ ] RuoYi-Vue 3.9.x 可以独立启动并完成权限登录。
- [ ] PC Web 客户端可以使用 Node.js 22、pnpm 10.15.0、Vue 3.5、TypeScript 5.7 和 Vite 6 构建。
- [ ] 所有镜像和依赖没有使用浮动版本。
- [ ] 版本升级和回滚记录模板已经建立。

## 9. 保留的外部验证项

以下项目不能仅靠文档确认，必须在代码、依赖、镜像或外部服务可用后验证，具体出口见 [gap-register.md](./gap-register.md)：

1. Spring Cloud Alibaba 2025.0.0.0 与最终 Spring Boot 3.5.x 补丁版本的启动和构建兼容性。
2. RuoYi-Vue 3.9.x 与独立管理平台部署方式的兼容性。
3. MinIO 具体 `RELEASE.*` 镜像标签和安全扫描结果。
4. Elasticsearch 8.17.x 与最终 Java Client 的启动、索引和重建验证。
5. AI 模型供应商、调用 SDK、模型成本、速率限制和服务协议。
6. 生产 Docker Engine、Compose 和基础设施镜像的安全扫描结果。
7. CAS 服务器（自建或外部）与 CAS Client 的 ticket 校验、单点登出和账号映射验证。
8. LangChain4j 与模型适配器、会话记忆持久化和 ES RAG 检索的启动与流式验证。

## 10. 文档体系版本基线（v0.3）

企业级文档体系完善后，契约类文档作为唯一基准，版本状态如下（详见
[docs/README.md](./README.md) 文档地图与 [document-review.md](./document-review.md) 二轮评审）：

| 文档 | 版本 | 状态 | 唯一基准 |
| --- | --- | --- | --- |
| 工程文档体系总览 docs/README.md | v2.0 | 基线 | 文档地图与闭环模型 |
| 接口与字段契约 api-contract.md | v0.2 | 基线 | 接口/字段/错误码/响应示例 |
| 数据库设计 database-design.md | v1.0 | 基线 | 表/字段/迁移 |
| 安全设计 security-design.md | v1.0 | 基线 | 安全规则/密钥/审计 |
| 环境配置 environment-config.md | v1.0 | 基线 | 环境变量/连接 |
| 测试策略 testing-strategy.md | v1.0 | 基线 | 测试分层/门禁/报告 |
| 质量门禁 quality-gates.md | v1.0 | 基线 | 五道门禁清单 |
| 发布管理 release-management.md | v1.0 | 基线 | 发布检查清单/回滚 |
| CI/CD ci-cd.md | v1.0 | 基线 | 流水线/门禁/产物 |
| 需求追溯矩阵 traceability-matrix.md | v1.0 | 基线 | 需求→任务→测试追溯 |

新增文档维护规则：契约类文档（接口/数据/安全/环境）变更必须同步
[document-review.md](./document-review.md) 评审记录，并更新 docs/README.md 索引。
