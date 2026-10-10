# 合并请求

提交合并请求前请按 [AGENTS.md](../AGENTS.md) 与 [开发流程](../docs/development-plan.md) 自查，并在描述里说明范围、证据与回滚方式。

## 变更说明

- 所属任务或分支：
- 涉及工程（`sanye_client` / `sanye_server` / `sanye_admin` / `sanye_android` / `sanye_desktop` / `sanye_pet`）：
- 主要改动与用户可见行为：
- 明确不做的部分（边界）：

## 自查清单

- [ ] 只改动当前任务范围内的文件，一个提交只完成一件事，提交信息符合 `<type>(<scope>): <subject>`。
- [ ] 未提交密钥、真实环境变量、构建产物、`node_modules`、数据库快照或大体积媒体文件。
- [ ] 成功、空数据、失败三类状态都已覆盖；失败路径给出可复核的错误信息。
- [ ] 已执行与改动范围对应的门禁：`pnpm typecheck`、`pnpm build`、相关 `node --test`／`pnpm e2e:ci`；安卓改动包含 `pnpm --filter @sanye/sanye_client build:android` 与 `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`。
- [ ] 文档或配置有实质修改时，已更新唯一事实源、版本、状态、更新时间和更新记录，并登记 [文档评审记录](../docs/document-review.md)、执行 `pnpm docs:check`。
- [ ] 数据库、接口或环境配置有变更时，已同步对应文档与迁移说明。
- [ ] 日志与截图已脱敏；结论与证据一致，未验证部分标记为 `待环境` 或 `blocked-external`。

## 验证证据

- 命令与结果（通过数/失败数、关键输出）：
- 截图或报告路径（如适用）：

## 回滚方式

- 回滚步骤或反向提交：
