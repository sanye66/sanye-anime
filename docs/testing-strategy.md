# sanye_anime 测试策略

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.5 |
| 文档状态 | 基线（测试体系唯一基准） |
| 唯一基准 | 是（测试分层、门禁、报告体系） |
| 关联文档 | [质量门禁](./quality-gates.md)、[按板块测试方案](./module-dev-test-plan.md)、[接口测试报告](./interface-test-report.md)、[按钮可用性报告](./button-test-report.md)、[开发任务清单](./development-tasks.md) |
| 更新时间 | 2026-09-10 |

## 当前核对（2026-09-10）

当前执行结果见[当前审计](./current-status-audit.md)：业务 291、管理 23、脚本 40、自包含浏览器 13 项通过。下面 77/60/548 等数字保留为 8 月历史报告基线，不能作为当前版本回归结论。普通 Maven `test` 不自动计入独立数据库 `*IT`；真实中间件专项需要隔离环境并单独登记。

更新记录：2026-09-10，v1.5，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 1. 测试目标与原则

1. **每完成一个板块即验证**：开发任务完成定义必须包含测试证据（见 development-tasks）。
2. **分层互补**：单元测试保逻辑、冒烟保契约、E2E 保主链路、体检保全量接口、故障注入保韧性。
3. **证据可追溯**：每个测试结果登记到 development-tasks 对应任务，报告文件持久化到 docs/。
4. **门禁自动化**：CI 强制 typecheck、build、`mvn test`（含 JaCoCo 覆盖率）、依赖与密钥扫描。
5. **回归闭环**：修改公共契约（接口/数据/安全/配置）后必须全量回归（见第 6 节）。

## 2. 测试分层

| 层 | 工具 | 执行时机 | 覆盖重点 | 数量基线 |
| --- | --- | --- | --- | --- |
| 单元测试 | JUnit 5 + Mockito | CI `mvn test` | 服务/存储/安全/工具逻辑、边界、错误码 | 各模块 surefire（当前 9 模块全过） |
| 前端静态 | vue-tsc / pnpm build | CI | 类型错误、构建产物 | 三端通过 |
| 冒烟测试 | smoke-local.ps1 | 本地联调/CI 可选 | 网关公开接口、AI SSE、权限、管理端代理 | 77 项 |
| E2E | Playwright（`e2e/`） | 本地联调 | 客户端主链路、管理端闭环、降级 | 31 项主链路，专项见仓库脚本 |
| 接口体检 | interface-check.ps1 | 每次接口变更后 | 9 板块 60 项全接口 + 错误码 | 60 项 |
| 按钮体检 | `e2e/e2e-buttons.mjs` | 前端 UI 变更后 | 客户端+管理端按钮可用性 | 425 项（动态，完整套件内本次为 420 项） |
| 故障注入 | fault-injection.ps1 | 监控/网关变更后 | 网关统一错误包、自愈恢复 | 21 项 |
| 性能压测 | load-test.mjs | 性能标定 | home P95、AI SSE 并发、幂等 | 基线记录 |
| 安全测试 | 单测+冒烟+体检 | 随各层 | 注入/越权/凭证/额度/脱敏 | 见 security-design §7 |

## 3. 单元测试规范

- 每个业务服务核心类（Service/Store/Security）有单测；Controller 由冒烟/E2E 覆盖（JaCoCo 排除样板类）。
- 覆盖：正常路径、空/边界、非法参数（错误码）、状态流转、权限/越权、并发（需要时）。
- 覆盖率门禁（JaCoCo 0.8.13，BUNDLE 指令覆盖率）：

| 模块 | 阈值 | 当前 |
| --- | ---: | ---: |
| sanye-server-core | ≥70% | 97.2% |
| sanye-server-web | ≥70% | 92.0% |
| sanye-server-gateway | ≥70% | 通过（含错误过滤器/处理器测试） |
| sanye-server-anime | ≥70% | 通过（含 store 双实现测试） |
| sanye-server-favorite | ≥70% | 97.1% |
| sanye-server-ai-chat | ≥40% | 通过（SSE/JDBC 由冒烟/E2E 覆盖，Testcontainers 待 Docker） |

## 4. 测试报告体系

| 报告 | 位置 | 更新规则 |
| --- | --- | --- |
| 接口测试报告 | docs/interface-test-report.md | 每次接口契约变更后重跑 interface-check.ps1 -ReportFile 覆盖 |
| 按钮可用性报告 | docs/button-test-report.md | 前端 UI/交互变更后重跑 e2e-buttons.mjs 并更新 |
| 冒烟结果 | sanye_deploy/smoke-local.ps1 输出 | 联调/发布前必须 0 失败 |
| E2E 结果 | `e2e/` 脚本输出 | 发布前必须 0 失败 |
| 覆盖率报告 | 各模块 target/site/jacoco | CI 自动生成 |
| 任务完成证据 | development-tasks.md 完成记录 | 每任务登记测试通过数与报告引用 |

## 5. 缺陷管理

- 发现缺陷：登记到 development-todo（日期、现象、复现步骤、影响面）。
- 修复：关联任务/提交，补对应测试（回归用例），重跑相关层 + 全量回归（按第 6 节）。
- 严重度：
  - P0：阻断主流程/数据安全（必须当轮修复）；
  - P1：影响主要功能但有绕行（当轮或立即修复）；
  - P2：体验/边缘问题（排期修复）。
- 未修复缺陷登记 gap-register 或“已知问题”清单（release-management §5）。

## 6. 回归策略

触发全量回归（mvn test + 冒烟 + E2E + 接口体检 + 三端构建）的条件：

1. 修改公共契约：接口路径/字段/错误码、数据库表/迁移、安全规则、环境配置。
2. 修改网关/鉴权/路由。
3. 修改数据面存储实现（内存 ↔ PG 切换）。
4. 发布前（release-management 发布检查清单）。

局部回归：单模块单测 + 相关冒烟项，仅当改动严格限定在该模块且不影响契约。

## 7. 测试环境与数据

- 本地联调：PG 5433 + Redis 6379 + 10 个后端服务 + 两个前端 dev server。
- 依赖故障专项采用降级验证：ES/搜索服务故障 → 搜索失败态和重试；Elasticsearch 已就绪时主链路必须命中真实作品；CAS 使用本地 Mock 验证回调和会话交换。
- 正式作品数据：仅保留《你的名字》127 和无职转生 128/133/135/136/137 六条记录；冒烟/E2E 的临时作品、反馈和会话不属于正式片库，执行 `sanye_deploy/cleanup-anime-test-data.ps1` 后清理作品数据和搜索索引。

## 8. 测试执行命令速查

```powershell
# 后端全量测试（含覆盖率门禁）
mvn -f sanye_server/pom.xml test
# 前端类型与构建
pnpm typecheck; pnpm build
# 冒烟 / E2E / 接口体检 / 按钮体检 / 故障注入
pwsh -File .\sanye_deploy\smoke-local.ps1
pnpm e2e:verify
pwsh -File .\sanye_deploy\interface-check.ps1 -ReportFile docs/interface-test-report.md
pnpm e2e:all
pwsh -File .\sanye_deploy\fault-injection.ps1 -ResultFile $env:TEMP\fault-result.txt
```

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v1.0 | 建立测试策略基线：分层、规范、报告、缺陷、回归、环境 | 企业级文档完善 |
| 2026-08-24 | v1.2 | 将运行数据基线收口为六条正式作品，新增测试作品与搜索索引清理脚本 | `V7__remove_demo_test_catalog.sql`、`cleanup-anime-test-data.ps1` |
| 2026-08-24 | v1.3 | 将内存回退和管理端回退同步收口为六部正式作品，并记录 HLS 分片主动中止不计为资源错误的体检规则 | `AnimeMemoryStore.java`、`contentView.vue`、`e2e-buttons.mjs` |
| 2026-08-24 | v1.4 | 更新完整回归后的按钮体检与全量 Playwright 当前基线，并明确历史记录不回写 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all` |
