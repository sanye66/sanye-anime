# sanye_anime CI/CD

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.7 |
| 文档状态 | 基线（流水线唯一基准） |
| 唯一基准 | 是（CI 工作流、门禁、构建产物） |
| 关联文档 | [质量门禁](./quality-gates.md)、[发布管理](./release-management.md)、[环境配置](./environment-config.md)、[版本基线](./version-baseline.md) |
| 更新时间 | 2026-09-10 |

## 当前核对（2026-09-10）

当前基础检查已重新执行，详见[审计](./current-status-audit.md)。T-R-06 本地容器报告为 `sanye_deploy/.local/tr06/sanye_tr06_2e4e2557f579/report.json`，8 项通过，仅覆盖网关与 Web 冒烟。本次未查询远端 CI/分支保护或发布注册表；历史远端访问失败不能推断当前权限状态。

更新记录：2026-09-10，v1.7，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 1. 流水线总览

工作流：[.github/workflows/ci.yml](../.github/workflows/ci.yml)

触发：push 到 `feature-*`、`dev`、`test`、`release` 分支，或任意 PR。
并发：同分支取消进行中的旧任务（`concurrency.cancel-in-progress`）。

```text
┌─ frontend（前端类型与构建）
├─ backend（业务后端与管理后端编译测试）
├─ browser-security（自包含浏览器安全回归）
├─ dependency-scan（依赖漏洞）
├─ secret-scan（密钥扫描）
├─ docs（文档一致性检查）
└─ 任一失败 → PR 标记失败、阻断进入 test/release
```

## 2. 任务说明

### 2.1 frontend：前端类型检查与构建

- 环境：ubuntu-latest，pnpm 10.15.0（pnpm/action-setup@v6），Node.js 26.5.0（非 LTS；actions/setup-node@v7，pnpm 缓存）。
- 步骤：`pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm build`。
- 覆盖：`sanye_client`、`sanye_admin`、`sanye_pet`（workspace `pnpm -r`）。
- 门禁：类型错误或构建失败即阻断。

### 2.2 backend：后端编译与测试

- 环境：ubuntu-latest，Microsoft JDK 21.0.12（actions/setup-java@v6），Maven 3.9.16 由 [固定安装脚本](../sanye_deploy/setup-ci-maven.sh) 下载并校验 SHA-512；JVM 默认时区固定为 UTC。当前配置与本机版本对应，远端实际执行结果仍以作业日志为准。
- 步骤：
  - `mvn -B -f sanye_server/pom.xml test`：全模块编译 + 单测 + JaCoCo 覆盖率门禁（6 模块阈值，见 testing-strategy）。
  - `mvn -B -f sanye_admin_server/pom.xml test`：RuoYi 管理后端编译与测试，包含管理代理端点方法级权限契约。
- 门禁：编译/测试/覆盖率任一失败即阻断。

### 2.3 browser-security：浏览器安全回归

- 环境：ubuntu-latest、Node.js 26.5.0（非 LTS）、pnpm 10.15.0、Chromium。
- 步骤：冻结锁文件安装依赖，构建 `sanye_client`，启动本地 Vite preview，再执行季度排序、外部搜索候选、电影播放线路和清晰度选择四个自包含 Playwright 脚本。
- 命令：`pnpm e2e:ci`。
- 门禁：任一断言失败、预览服务启动失败或脚本异常退出即阻断。

### 2.4 dependency-scan：依赖漏洞扫描

- `pnpm audit --audit-level high`：前端依赖漏洞（high/critical 阻断，不使用未登记豁免）。
- Trivy Action v0.36.0 使用 Trivy v0.74.0 执行文件系统漏洞扫描：先以 JDK 21 跳过测试构建两套后端并安装到本地 Maven 仓库，复用 Maven 缓存以避免远端仓库限流；仅 HIGH/CRITICAL 阻断，并忽略尚无上游修复的条目。密钥扫描由独立 Gitleaks 作业负责。
- 结果纳入 PR 检查。

### 2.5 secret-scan：密钥扫描

- Gitleaks：含提交历史（`git log` 全量扫描）。
- 命中密钥/口令/Token 即阻断；误报豁免需登记说明。
- 与 [security-design.md](./security-design.md) §6 密钥策略一致。

### 2.6 docs：文档一致性检查

- 命令：`node sanye_deploy/check-docs.mjs`，本地等价入口为 `pnpm docs:check`。
- 门禁：Markdown 链接、当前事实或命令基线漂移即阻断。

## 3. 门禁与分支策略

| 分支 | CI 执行 | 进入条件 | 说明 |
| --- | --- | --- | --- |
| feature-* | 是 | 任务分支 | 任务范围代码 |
| dev | 是 | 合并门禁通过 | 日常集成 |
| test | 是 | dev 验收通过 | 验收环境 |
| release | 是 | 发布门禁通过 | 稳定基线，只允许修复 |

失败处理：PR 显示失败、分支保护阻止合并（GitHub branch protection 待配置）。

## 4. 构建产物与部署

当前阶段产物：

| 产物 | 位置 | 消费方 |
| --- | --- | --- |
| sanye_server 各服务 jar | 各模块 target/*.jar | run-local / compose / 部署 |
| sanye_admin_server jar | sanye_admin_app/target/sanye_admin_app.jar | 管理端部署 |
| 前端 dist | sanye_client/dist、sanye_admin/dist | nginx 静态托管 |

候选应用镜像入口为 [release-candidate.yml](../.github/workflows/release-candidate.yml)，仅允许从 `test` 分支手动触发。现有 `compose.yaml`、`images.lock` 仍属于本地中间件配置，不能视为测试环境锁定清单。远端镜像推送、TLS、测试部署及生产部署仍待环境；当前证据见 T-R-06。

### T-R-06 候选镜像与实例核验

1. `check-ci.mjs` 要求当前分支、完整候选提交对应的最新 push CI 已成功；运行中、取消或失败不能复用旧成功记录。远端分支保护另由 `check-remote.mjs` 只读检查，不能用流水线文件代替远端强制规则。
2. 工作流从独立 checkout 执行冻结依赖安装、类型检查、前端构建及两套后端 `clean package`，保留测试和覆盖率门禁。新增工作流使用固定 Action 提交；运行时基础镜像固定于 [base-images.json](../sanye_deploy/release/base-images.json)，Java 为 Temurin 21.0.12，构建 JDK 仍为 Microsoft 21.0.12。
3. `prepare.mjs` 拒绝提交不符、脏工作区和已存在输出目录。仅复制一个可执行 JAR 或前端 dist、健康探针与容器配置进入各自上下文。`candidate.json` 记录提交、源码树、锁文件、POM、迁移 SQL 和上下文文件摘要；此入口须消费刚完成的干净构建，不能仅靠同提交标记证明任意历史 target 文件来自源码。
4. `build.mjs` 重验上下文摘要，构建 12 个 `linux/amd64` 镜像：网关、八个业务服务、管理后端、客户端和管理前端。推送目标为 GHCR 中当前所有者的 `sanye_*` 包，使用完整提交标签及 OCI revision，最终 `release.json` 记录注册表摘要、基础镜像和工作流运行号。`--push` 成功后才生成全摘要引用的 `compose.json`；本地 `--load` 结果不作为可拉取发布清单。
5. 受控主机准备配置后，`bind-config.mjs` 绑定配置版本、维护人、目标、配置文件指纹、上一发布清单及备份和迁移评审材料指纹。它只确认材料存在且绑定，不判定材料中的恢复成功或迁移兼容结论。具体字段见[环境矩阵](./environment-config.md#t-r-06-候选构建与受控配置)。
6. 部署后运行 `verify.mjs`，核对发布清单、配置指纹与实际容器环境、镜像 ID 和镜像内 revision、容器健康状态，并在指定 Nacos namespace 中核对九个业务实例的 IP、端口、健康状态和提交元数据。管理后端根路径只证明存活；真实登录、数据库、对象、事件、调度及回滚属于 T-R-07 验收。

工作流只发布候选镜像与证据，不自动部署主机。T-R-06 当前没有固定候选提交、真实注册表推送或十二实例验收记录，不得称为测试环境就绪。镜像按摘要固定保证消费同一内容，不承诺 Maven 下载和容器输出逐字节可重现；第三方镜像安全审计仍须通过发布门禁。

```powershell
pnpm test:release
node sanye_deploy/release/check-remote.mjs sanye66/sanye-anime <新报告.json>
# 以下命令在干净构建或已确认的受控环境执行，变量见环境矩阵。
node sanye_deploy/release/prepare.mjs prepare <全新上下文目录>
node sanye_deploy/release/build.mjs <上下文目录> --push
node sanye_deploy/release/bind-config.mjs <release.json> <部署计划.json>
node sanye_deploy/release/verify.mjs <release.json> <新实例报告.json>
```

## 5. 本地等价命令

CI 各步骤本地等价命令：

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
$env:MAVEN_OPTS = '-Duser.timezone=UTC'
mvn -B -f sanye_server/pom.xml test
mvn -B -f sanye_admin_server/pom.xml test
pnpm e2e:ci
pnpm audit --audit-level high
pnpm docs:check
```

## 6. 待完善（外部环境）

- GitHub branch protection（PR 必须全绿才能合并）。
- 候选镜像实际推送、测试主机部署与回滚验收（T-R-06/07）；构建入口已实现，环境证据未完成。
- 依赖豁免流程与 SBOM 导出。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-09-10 | v1.6 | 新增候选镜像构建、配置指纹、实例与远端门禁核验；明确未部署边界 | T-R-06 本地回归与容器冒烟、远端保护 HTTP 401 记录 |
| 2026-08-19 | v1.0 | 建立 CI/CD 基线：流水线、任务、门禁、产物、本地等价命令 | 企业级文档完善 |
| 2026-08-26 | v1.1 | 管理后端改为执行测试；新增三项自包含 Playwright 浏览器回归，并同步文档与高危依赖门禁 | `.github/workflows/ci.yml`、`pnpm e2e:ci`、管理端权限契约测试 |
| 2026-08-26 | v1.2 | 升级 GitHub 官方 Action 与 pnpm Action，修复 Trivy 无法解析；后端门禁固定 UTC 并修正跨时区测试夹具 | `.github/workflows/ci.yml`、`FavoriteServiceTest`、GitHub Actions 远端执行 |
| 2026-08-26 | v1.3 | 按 HIGH/CRITICAL 门槛修正 Trivy 扫描范围，升级后端安全补丁并固定 Trivy 引擎版本 | Maven 依赖树、Trivy v0.74.0、GitHub Actions 远端执行 |
| 2026-08-26 | v1.4 | Trivy 扫描前预填并缓存两套后端 Maven 依赖，避免 Maven Central HTTP 429；关闭与 Gitleaks 重复的 secret scanner | `.github/workflows/ci.yml`、GitHub Actions 远端日志 |
| 2026-09-09 | v1.5 | 同步 Node.js 26.5.0 与 Java 21 工具链；本机补丁版本和 CI 执行证据分别登记，本次修改不代表远端流水线通过 | 用户确认、[版本基线](./version-baseline.md)、`.github/workflows/ci.yml` |
