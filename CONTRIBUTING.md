# 参与贡献

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 文档状态 | 基线 |
| 更新时间 | 2026-10-13 |
| 关联文档 | [协作规则](./AGENTS.md)、[开发流程](./docs/development-plan.md)、[质量门禁](./docs/quality-gates.md) |

欢迎提交可复现的问题和范围明确的修改。项目仍处于内部集成阶段，实际能力与限制以[当前审计](./docs/current-status-audit.md)为准。

## 报告问题

通过仓库的问题模板记录版本或提交、运行平台、复现步骤、预期结果和实际结果。日志先移除账号、令牌、订阅正文、带凭据的地址及个人数据。安全问题按[安全政策](./SECURITY.md)私密报告，不在公开问题中附利用细节。

## 提交修改

1. 阅读 `AGENTS.md`，使用 `feature-<task>` 任务分支。针对现有缺陷先写出可复现证据；大范围架构和产品变更先说明影响。
2. 使用仓库固定工具链和锁文件安装依赖：`pnpm install --frozen-lockfile`。本机 Java 21.0.12，云端编译补丁范围见[CI/CD](./docs/ci-cd.md)。各端启动入口见 [README](./README.md)。
3. 保留无关改动，只暂存本次任务的明确路径或修改块；禁止提交凭据、构建产物、数据库或媒体文件。
4. 运行对应检查：前端 `pnpm typecheck`、`pnpm build`；业务后端 `mvn -f sanye_server/pom.xml test`；管理后端 `mvn -f sanye_admin_server/pom.xml test`；桌面 `pnpm test:desktop`。安卓构建、同步与原生检查见[安卓工程](./sanye_android/README.md)。
5. 实质修改文档时同步唯一事实源、版本、更新时间及评审记录，并执行 `pnpm docs:check`。提交信息采用 `<type>(<scope>): <subject>`。
6. 使用 PR 模板说明问题、行为变化、检查结果、未验证环境及恢复方法。测试跳过须解释原因，不能计为通过。

测试使用隔离数据，禁止对未确认的共享或生产环境执行写入、压测、迁移和恢复。未提供运行环境时，明确报告源码检查范围。

## 许可证与协作

贡献自有代码须具有相应授权，并遵守[项目许可证](./LICENSE)和[第三方许可说明](./docs/third-party-notices.md)。不得提交未经授权的动漫素材。讨论与评审遵守[行为准则](./CODE_OF_CONDUCT.md)。

## 更新记录

2026-10-13，v1.0：建立外部贡献入口，复用现有工具链、分支和质量规则；文档验收登记于[评审记录](./docs/document-review.md)。
