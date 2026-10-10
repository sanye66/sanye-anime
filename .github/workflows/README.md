# CI 工作流

本目录用于存放构建、测试、依赖扫描、密钥扫描、镜像构建和发布验证工作流。门禁定义与本地等价命令见 [CI/CD](../../docs/ci-cd.md)；分支模型与提交规范见 [AGENTS.md](../../AGENTS.md)。

当前工作流（2026-10-10）：

- `ci.yml`：推送 `feature-*`、`dev`、`test`、`release` 或创建 PR 时执行，同分支取消旧任务。
  - `docs`：`node sanye_deploy/check-docs.mjs`（Markdown 链接与当前事实）。
  - `frontend`：`pnpm typecheck`、播放策略与管理端会话等纯逻辑回归、`pnpm build`。
  - `backend`：`sanye_server` 与 `sanye_admin_server` 编译与测试，Maven 由固定脚本安装并校验 SHA-512。
  - `browser-security`：`pnpm e2e:ci` 自包含 Playwright 回归。
  - `dependency-scan`：`pnpm audit:deps` 与 Trivy 文件系统扫描（结果交 `pnpm audit:trivy` 判定，两者共用 `sanye_deploy/audit-exemptions.json` 登记式豁免）。
  - `secret-scan`：Gitleaks（含提交历史）。
- `android-check.yml`：推送 `feature-*`、`dev`、`test`、`release` 或创建 PR，且命中 `sanye_client/`、`sanye_android/`、`e2e/`、安卓需求与计划文档、`package.json`、`pnpm-lock.yaml`、本工作流时执行。
  - 构建安卓前端产物、安装 Chromium，执行 `pnpm test:player-policy` 与 15 个安卓端 e2e 文件。
  - `capacitor sync` 后执行 `pnpm test:verify-android-assets` 与 `pnpm verify:android-assets`：包内 `android/app/src/main/assets/public` 必须与 `sanye_client/dist-android` 逐文件 SHA-256 一致（忽略 Capacitor 生成的 `cordova.js`／`cordova_plugins.js`），防止只跑 `build:android` 而漏 `cap sync` 打出旧页面资源。
  - 随后执行 `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`。
  - 无论成败都上传单元测试 XML 与 lint 报告（`if: always()`）。
- `desktop-check.yml`：推送命中桌面相关路径或创建 PR 时执行（`windows-2025`）。
  - `pnpm test:desktop`、`pnpm typecheck`、`pnpm build`、`pnpm --filter @sanye/sanye_client build:desktop`。
  - 校验桌面服务源码可打包，并保留后端 surefire 报告。
- `release-candidate.yml`：仅允许从 `test` 分支手动触发，构建候选镜像。

任一检查失败将阻止进入 `test` 与 `release` 分支。上述为本目录工作流的定义；远端实际执行结果以作业日志为准，本地等价命令见 [CI/CD](../../docs/ci-cd.md) 第 5 节。

质量门禁：[../../docs/development-plan.md](../../docs/development-plan.md)
实现说明：[../../docs/development-tasks.md](../../docs/development-tasks.md)（T-B-02）
