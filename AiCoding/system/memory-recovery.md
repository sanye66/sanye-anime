# AiCoding 记忆恢复流程

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线 |
| 更新时间 | 2026-08-26 |

会话中断后按以下顺序恢复：

1. 读取 `CONTENTS.md` 和 `MIGRATION-NOTICE.md`。
2. 读取 `index/freshness-report.md`，确认当前文档是否仍为草案。
3. 检查 `git status --short --branch`，识别用户已有未提交改动。
4. 读取 `ledger/ledger-index.md` 和当前任务关联的 Ledger。
5. 对照 `views/`、`design/` 和真实源码，确认摘要未超过证据范围。
6. 继续执行计划中的验证；不要把上次会话的假设当成完成状态。

恢复记录至少包含：当前分支、最后一个已验证命令、未完成事项、外部阻塞和下一步证据。
