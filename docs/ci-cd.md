# sanye_anime CI/CD

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.4 |
| 文档状态 | 基线（流水线唯一基准） |
| 唯一基准 | 是（CI 工作流、门禁、构建产物） |
| 关联文档 | [质量门禁](./quality-gates.md)、[发布管理](./release-management.md)、[环境配置](./environment-config.md)、[版本基线](./version-baseline.md) |
| 更新时间 | 2026-08-26 |

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

- 环境：ubuntu-latest，pnpm 10.15.0（pnpm/action-setup@v6），Node 22（actions/setup-node@v7，pnpm 缓存）。
- 步骤：`pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm build`。
- 覆盖：`sanye_client`、`sanye_admin`、`sanye_pet`（workspace `pnpm -r`）。
- 门禁：类型错误或构建失败即阻断。

### 2.2 backend：后端编译与测试

- 环境：ubuntu-latest，Temurin JDK 21（actions/setup-java@v6），Maven 缓存；JVM 默认时区固定为 UTC，用于暴露依赖开发机时区的测试。
- 步骤：
  - `mvn -B -f sanye_server/pom.xml test`：全模块编译 + 单测 + JaCoCo 覆盖率门禁（6 模块阈值，见 testing-strategy）。
  - `mvn -B -f sanye_admin_server/pom.xml test`：RuoYi 管理后端编译与测试，包含管理代理端点方法级权限契约。
- 门禁：编译/测试/覆盖率任一失败即阻断。

### 2.3 browser-security：浏览器安全回归

- 环境：ubuntu-latest、Node 22、pnpm 10.15.0、Chromium。
- 步骤：冻结锁文件安装依赖，构建 `sanye_client`，启动本地 Vite preview，再执行季度排序、电影播放线路和清晰度选择三个自包含 Playwright 脚本。
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

镜像构建与容器部署：Docker 环境就绪后由 compose/deploy 流程接管（compose.yaml、images.lock，
GAP-003 待环境）；镜像推送、TLS 证书、生产部署暂未启用，登记 gap-register。

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
- 镜像构建与推送、测试环境自动部署（Docker/GAP-003）。
- 依赖豁免流程与 SBOM 导出。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v1.0 | 建立 CI/CD 基线：流水线、任务、门禁、产物、本地等价命令 | 企业级文档完善 |
| 2026-08-26 | v1.1 | 管理后端改为执行测试；新增三项自包含 Playwright 浏览器回归，并同步文档与高危依赖门禁 | `.github/workflows/ci.yml`、`pnpm e2e:ci`、管理端权限契约测试 |
| 2026-08-26 | v1.2 | 升级 GitHub 官方 Action 与 pnpm Action，修复 Trivy 无法解析；后端门禁固定 UTC 并修正跨时区测试夹具 | `.github/workflows/ci.yml`、`FavoriteServiceTest`、GitHub Actions 远端执行 |
| 2026-08-26 | v1.3 | 按 HIGH/CRITICAL 门槛修正 Trivy 扫描范围，升级后端安全补丁并固定 Trivy 引擎版本 | Maven 依赖树、Trivy v0.74.0、GitHub Actions 远端执行 |
| 2026-08-26 | v1.4 | Trivy 扫描前预填并缓存两套后端 Maven 依赖，避免 Maven Central HTTP 429；关闭与 Gitleaks 重复的 secret scanner | `.github/workflows/ci.yml`、GitHub Actions 远端日志 |
