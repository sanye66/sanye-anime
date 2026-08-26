# sanye_anime 质量门禁

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 文档状态 | 基线（质量门禁唯一基准） |
| 唯一基准 | 是（提交/合并/发布门禁清单） |
| 关联文档 | [开发计划](./development-plan.md)、[测试策略](./testing-strategy.md)、[CI/CD](./ci-cd.md)、[发布管理](./release-management.md)、[AGENTS.md](../AGENTS.md) |
| 更新时间 | 2026-08-19 |

## 1. 门禁总览

```text
编码前门禁（前置评审） → 提交门禁（pre-commit 自查） → CI 门禁（自动化） → 合并门禁（dev 自查） → 发布门禁（release 清单）
```

| 门禁 | 触发 | 通过条件 | 阻断动作 |
| --- | --- | --- | --- |
| 编码前 | 新阶段/新板块启动 | 需求→设计→任务已登记；外部门禁明确 | 禁止进入编码 |
| 提交 | 每次 git commit | 提交信息规范、单任务、无密钥/构建产物 | 禁止提交 |
| CI | push/PR（feature-*、dev、test、release） | typecheck、build、mvn test、依赖/密钥扫描 0 失败 | 阻止进入 test/release |
| 合并 | 合并到 dev | 只含当前任务范围；测试与文档已更新；配置/迁移同步 | 禁止合并 |
| 发布 | 打 release | 发布检查清单全过、回滚就绪 | 禁止上线 |

## 2. 编码前门禁（前置门禁）

进入正式编码前必须满足（依据 development-plan §7）：

1. 原型评审与整改闭环（prototype-review）。
2. MVP 范围冻结（mvp-freeze）。
3. 页面状态矩阵基线（page-state-matrix）。
4. 产品文档与技术设计评审通过（document-review）。
5. 任务拆分与完成定义登记（development-tasks）。
6. 外部门禁确认（gap-register：数据授权、法律文案、CAS、AI 供应商等）。

## 3. 提交门禁（pre-commit 自查）

每次提交前自查：

- [ ] 提交信息格式 `<type>(<scope>): <subject>`（feat/fix/docs/refactor/test/chore），一个提交一件事。
- [ ] 不含密钥、环境变量真实值、构建产物、node_modules、数据库快照、大媒体。
- [ ] 只改当前任务范围文件。
- [ ] 相关单测已跑并通过；前端改动通过 typecheck。
- [ ] 涉及契约（接口/数据/安全/配置）已同步唯一基准文档。

## 4. CI 门禁

流水线定义见 [ci-cd.md](./ci-cd.md)，检查项：

| 检查 | 命令/工具 | 失败处理 |
| --- | --- | --- |
| 前端类型 | pnpm typecheck | 阻断 |
| 前端构建 | pnpm build | 阻断 |
| 后端编译测试 | mvn -B -f sanye_server/pom.xml test（含 JaCoCo） | 阻断 |
| 管理端构建 | mvn -B -f sanye_admin_server/pom.xml package | 阻断 |
| 依赖漏洞 | pnpm audit + Trivy | 高危阻断 |
| 密钥扫描 | Gitleaks（含历史） | 命中即阻断 |

## 5. 合并门禁（合并到 dev 自查）

依据 AGENTS.md 与 development-plan §16，合并前：

- [ ] 只修改当前任务范围。
- [ ] 成功、空数据、失败、无权限四类状态已覆盖（对应测试）。
- [ ] 测试与文档已更新（报告引用、任务完成记录）。
- [ ] 配置、迁移与版本记录同步（database-design / environment-config / version-baseline）。
- [ ] 日志无敏感内容。
- [ ] 明确回滚方式（release-management / ops-runbook）。

## 6. 发布门禁

见 [release-management.md](./release-management.md) §4 发布检查清单：
全量回归、备份确认、迁移确认、密钥与配置、回滚演练、已知问题清单、发布记录。

## 7. 门禁执行记录

- CI 结果：GitHub Actions（ci.yml）。
- 本地门禁证据：冒烟/体检/E2E 报告（testing-strategy §4）。
- 每次发布登记发布记录到 release-management。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v1.0 | 建立质量门禁基线：五道门禁、检查清单、执行记录 | 企业级文档完善 |
