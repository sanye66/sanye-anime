# Playwright 验收脚本

本目录保存客户端、官网和管理端的可复现浏览器验收脚本，不再依赖 `%TEMP%\\sanye-e2e` 临时目录。

## 前置条件

- Node.js 22 LTS、pnpm 10.15.0。
- 网关 `8091`、客户端 `5173`、管理端 `5175` 已启动。
- 已安装 Chromium：`pnpm --filter @sanye/sanye_e2e exec playwright install chromium`。
- AI 自动化验收使用 `AI_PROVIDER=dev`；真实供应商额度不作为本地测试前置条件。

## 执行

```powershell
pnpm install
pnpm e2e:verify
pnpm e2e:all
```

`e2e:all` 执行主链路、布局、按钮、网络、审计、任务日志、用户、脱敏、CAS 和刷新令牌专项。故障注入降级脚本需要先按 `sanye_deploy/degradation-check.ps1` 的说明停止对应服务，不能与普通回归并行执行。

测试脚本只使用本地开发账号和临时数据，不写入供应商密钥；测试结束后执行 `sanye_deploy/cleanup-anime-test-data.ps1`，确保数据库和搜索索引只保留正式片库。
