# CI 工作流

本目录用于存放构建、测试、依赖扫描、密钥扫描、镜像构建和发布验证工作流。

当前状态（T-B-02 已完成，2026-08-18）：

- `ci.yml`：推送 `feature-*`、`dev`、`test`、`release` 或创建 PR 时执行。
  - 前端：`pnpm typecheck` + `pnpm build`。
  - 后端：`sanye_server` 编译与测试、`sanye_admin_server` 构建。
  - 依赖扫描：`pnpm audit` + Trivy 文件系统扫描。
  - 密钥扫描：Gitleaks（含提交历史）。
- 任一检查失败将阻止进入 `test` 与 `release` 分支。

质量门禁：[../../docs/development-plan.md](../../docs/development-plan.md)
实现说明：[../../docs/development-tasks.md](../../docs/development-tasks.md)（T-B-02）
