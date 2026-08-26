# sanye_anime 全量测试报告

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v3.2 |
| 报告日期 | 2026-08-24 |
| 测试环境 | 本地联调：客户端 5173、管理端 5175、网关 8091；CAS 使用 Mock 8095（历史执行记录曾使用 8080） |
| 数据依赖 | PostgreSQL、Redis、Elasticsearch 已就绪；CAS 使用本地 Mock；AI 使用 dev 提供者 |
| 测试结论 | **全部执行项通过，无失败项** |

## 1. 总体结果

| 测试层 | 执行内容 | 通过 | 失败 | 结论 |
| --- | --- | ---: | ---: | --- |
| 后端单元测试 | `sanye_server` JUnit 5 + Mockito，含 JaCoCo 门禁 | 210 | 0 | 通过 |
| 管理后端测试 | `sanye_admin_server` 编译与 Surefire 生命周期 | 构建通过 | 0 | 通过（当前无测试源） |
| 前端类型检查 | 客户端、管理端、桌宠 3 个工程 | 3/3 | 0 | 通过 |
| 前端生产构建 | 客户端、管理端、桌宠 3 个工程 | 3/3 | 0 | 通过 |
| Playwright 主链路 | 客户端、官网、管理端关键流程（`e2e/e2e-verify.mjs`） | 32 | 0 | 通过 |
| Playwright 按钮体检 | 20 个页面全部可交互控件及页面断言（`e2e/e2e-buttons.mjs`） | 428 | 0 | 通过 |
| Playwright 弱网/断网 | 断网、恢复、4 秒延迟 | 13 | 0 | 通过 |
| Playwright 布局回归 | 1100、1280、1440 三档，登录/未登录 | 39 | 0 | 通过 |
| Playwright 权限与审计 | 操作日志、登录日志、筛选、详情 | 7 | 0 | 通过 |
| Playwright 认证专项 | CAS 登录、401 自动续期 | 6 | 0 | 通过 |
| Playwright 管理专项 | 任务日志、用户管理、日志脱敏 | 19 | 0 | 通过 |
| Playwright 媒体播放器专项 | iframe 安全属性、HLS video、选集切换、季度/搜索聚合、移动端播放器 | 38 | 0 | 通过 |
| Playwright 服务故障降级 | anime、ai-chat、favorite、feedback 停服 | 8 | 0 | 通过 |
| 接口体检 | 9 个接口板块 | 60 | 0 | 通过 |
| 本地冒烟 | 网关、业务、AI、管理端、监控 | 77 | 0 | 通过 |
| 网关故障注入 | anime、ai-chat、auth 停服与恢复 | 21 | 0 | 通过 |

说明：不同测试层存在覆盖重叠，表中数字是各层独立断言数，不做跨层去重。本次 `pnpm e2e:all` 的 11 个脚本合计 `548/548`，其中按钮体检为 `428/428`；此前稳定独立执行 `node e2e/e2e-buttons.mjs` 的报告为 `425/425`，动态页面数据变化会造成控件数差异。另行执行的媒体播放器专项为 `4/4`，多码率清晰度专项为 `3/3`，真实 HLS、实际播放推进、季度与搜索聚合专项为 `34/34`，服务故障降级专项为 `8/8`，分别记录，不能相加作为去重后的通过数。

## 2. 单元测试报告

### 2.1 主后端

命令：`mvn -f sanye_server/pom.xml test`

| 模块 | 测试数 | 失败 | 覆盖内容 | 结果 |
| --- | ---: | ---: | --- | --- |
| `sanye-server-core` | 18 | 0 | 认证上下文、JWT、错误码、敏感信息脱敏、统一响应 | 通过 |
| `sanye-server-web` | 10 | 0 | Web 自动配置、Feign、HTTP 错误契约 | 通过 |
| `sanye-server-gateway` | 20 | 0 | 网关鉴权、公开白名单、错误过滤、请求链路 | 通过 |
| `sanye-server-auth` | 0 | 0 | 当前无 Surefire 测试源 | 构建通过 |
| `sanye-server-anime` | 65 | 0 | 目录、筛选、详情聚合、排期、媒体导入与播放器元数据 | 通过 |
| `sanye-server-search` | 7 | 0 | 搜索参数、ES 不可用降级、错误码 | 通过 |
| `sanye-server-ai-chat` | 64 | 0 | 会话、消息、SSE、额度、记忆、RAG、安全 | 通过 |
| `sanye-server-favorite` | 11 | 0 | 收藏、历史、设备隔离、边界校验 | 通过 |
| `sanye-server-file` | 10 | 0 | 文件类型、大小、上传、下载、安全校验 | 通过 |
| `sanye-server-feedback` | 5 | 0 | 反馈提交、状态流转、参数边界 | 通过 |
| `sanye-server-job` | 0 | 0 | 当前无 Surefire 测试源 | 构建通过 |
| **合计** | **210** | **0** | 9 个模块有实际单元测试 | **通过** |

JaCoCo 覆盖率检查全部通过。测试日志中出现的 Mockito 动态代理和 RAG/依赖不可用日志属于测试环境警告或预期降级，不影响断言结果。

### 2.2 管理后端与前端

- `mvn -f sanye_admin_server/pom.xml test`：7 个模块构建成功，当前没有 Surefire 测试源。
- `pnpm typecheck`：`sanye_client`、`sanye_admin`、`sanye_pet` 全部通过。
- `pnpm build`：三个工程全部生产构建成功。管理端存在 Element Plus 产物超过 500 KB 的 Rollup 警告，但不影响构建。
- 前端当前未配置 Vitest/Jest 单元测试脚本，因此前端逻辑由类型检查、接口体检和 Playwright 覆盖；这属于测试体系后续可增强项，不是本次失败项。

## 3. 按板块接口与页面报告

| 板块 | 接口体检 | Playwright/专项证据 | 结果 |
| --- | ---: | --- | --- |
| 系统与网关 | 6/6 | 故障注入包含 503、5002、requestId、Prometheus 21/21 | 通过 |
| anime 内容、详情、排期 | 18/18 | 首页、仓库、详情、收藏、排期、管理端内容闭环；anime 停服降级 4/4 | 通过 |
| 搜索 | 4/4 | 搜索正常/ES 未就绪降级、断网页面降级 | 通过 |
| AI 对话 | 7/7 | 上下文、SSE、推荐、SAFE、额度、模型偏好；ai-chat 停服降级 2/2 | 通过 |
| 收藏与历史 | 4/4 | 收藏/取消、我的页面、跨设备隔离；favorite 停服降级 1/1 | 通过 |
| 文件 | 5/5 | SVG 上传、下载、类型与不存在文件校验 | 通过 |
| 反馈 | 4/4 | 客户端提交、管理端处理；feedback 停服降级 1/1 | 通过 |
| 管理平台 | 9/9 | 登录、仪表盘、内容 CRUD、反馈、任务、用户、角色、审计、正文发布 | 通过 |
| 官网 | 公开接口纳入 anime 板块 18/18 | 官网首页、介绍、下载、法律正文与管理端发布闭环 | 通过 |
| 认证与会话 | 网关鉴权断言通过 | CAS 4/4，401 自动 refresh 2/2，权限守卫通过 | 通过 |
| 监控与日志 | 3/3 | Prometheus、操作日志、登录日志、任务日志、脱敏验证 | 通过 |
| 布局与响应式 | 不适用 | 3 个视口、双状态、39/39，无横向溢出和页面错误 | 通过 |
| 桌宠 | 不适用 | `typecheck`、`build` 通过；当前未配置 Electron Playwright harness | 通过构建门禁 |

## 4. Playwright 页面报告

| 脚本 | 覆盖范围 | 结果 |
| --- | --- | --- |
| `e2e-verify.mjs` | 客户端主链路、AI、官网、管理端真实闭环 | 32/32 |
| `e2e-buttons.mjs` | 客户端 12 页、管理端 8 页按钮与链接 | 428/428（本次全量套件内）；此前稳定独立报告 425/425 |
| `e2e-network.mjs` | 9 个页面断网、恢复、弱网骨架 | 13/13 |
| `e2e-layout.mjs` | 1100/1280/1440 与管理端登录守卫 | 39/39 |
| `e2e-audit.mjs` | 操作日志、登录日志、筛选和详情 | 7/7 |
| `e2e-cas.mjs` | Mock CAS 登录回调 | 4/4 |
| `e2e-refresh.mjs` | 过期 access token 自动续期与重放 | 2/2 |
| `e2e-joblogs.mjs` | 任务日志查询、筛选、详情、删除、权限 | 6/6 |
| `e2e-user.mjs` | 用户创建、查询、详情、密码校验、停用/启用 | 8/8 |
| `e2e-mask.mjs` | 操作日志密码脱敏与 UI 无明文 | 5/5 |
| `degradation-check.ps1` + `e2e-degradation.mjs` | 四类服务停服后的页面降级 | 8/8 |
| `e2e-media-player.mjs` | 详情页播放器、iframe 安全属性、选集和移动端布局 | 4/4 |
| `e2e-media-player-live.mjs` | 六个代表作品真实 HLS、实际播放推进、video 元素、季度与搜索聚合 | 34/34（独立专项） |
| `e2e-media-quality.mjs` | 模拟多码率 HLS 的自动、720P、360P 菜单和 level 切换 | 3/3（独立专项） |
| **合计** | `pnpm e2e:all` 11 个脚本 | **548/548** |

Playwright 脚本已纳入仓库 [`e2e/`](../e2e/)，按钮与降级明细分别见[按钮可用性报告](./button-test-report.md)和[依赖故障降级报告](./degradation-report.md)。完整证据还包括独立执行的服务故障降级专项 `8/8`。

## 5. 结论与遗留项

本轮所有已配置测试和质量门禁均通过，未发现阻断发布的功能、接口、布局或页面脚本错误。CAS 使用 Mock、Electron 桌宠未配置 Playwright harness、前端未配置 Vitest/Jest 是测试环境或测试体系现状，已在对应结果中明确标注，不作为通过率中的隐藏失败。

后续可增强项：为客户端、管理端和桌宠补充 Vitest/Electron Playwright harness；客户端与管理端 Playwright 脚本已具备仓库内可持续执行入口。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-24 | v3.2 | 同步本次有效回归结果：后端 210/210、全量 Playwright 548/548、按钮体检 428/428（套件内）、真实 HLS 专项 34/34、清晰度专项 3/3、三端 typecheck/build 通过 | `mvn -f sanye_server/pom.xml test`、`pnpm e2e:all`、`pnpm e2e:media-quality`、`pnpm typecheck`、`pnpm build` |
