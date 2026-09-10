# sanye_anime 桌宠

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 文档状态 | 基线 |
| 关联文档 | [当前审计](../docs/current-status-audit.md) |
| 更新时间 | 2026-09-10 |

桌宠是 `sanye_anime` 客户端的本地伴侣，不单独承载业务页面。通过根目录的 `pnpm dev:client` 启动客户端时，会在客户端服务就绪后自动打开透明桌宠窗口。

桌宠支持拖动角色、点击交互面板，并通过按钮唤起客户端首页、AI 助手和“我的”页面。桌宠窗口不绘制场景背景，位置会在本地记忆。

单独调试桌宠时执行 `pnpm --filter @sanye/sanye_pet dev` 启动渲染器，或先启动客户端和渲染器后执行 `PET_DEV=1 pnpm --dir sanye_pet exec electron .`。

## 当前核对（2026-09-10）

本次仅通过类型检查和构建，未启动桌宠进行操作系统验收。Windows 多屏/缩放、锁屏、资源占用、安装签名和升级回滚仍待环境；当前状态见[审计](../docs/current-status-audit.md)及[桌宠测试报告](../docs/desktop-companion-test-report.md)。

更新记录：2026-09-10，v1.0，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。
