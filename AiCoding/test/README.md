# AiCoding 测试证据入口

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线 |
| 更新时间 | 2026-08-26 |

当前测试入口：

```powershell
pnpm typecheck
pnpm build
pnpm docs:check
pnpm e2e:ci
mvn -B -f sanye_server/pom.xml test
```

命令结果必须写入 `docs/` 对应测试报告；本目录不复制历史数字，不把测试夹具当成正式运行数据。
