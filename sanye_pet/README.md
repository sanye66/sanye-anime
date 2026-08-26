# sanye_anime 桌宠

桌宠是 `sanye_anime` 客户端的本地伴侣，不单独承载业务页面。通过根目录的 `pnpm dev:client` 启动客户端时，会在客户端服务就绪后自动打开透明桌宠窗口。

桌宠支持拖动角色、点击交互面板，并通过按钮唤起客户端首页、AI 助手和“我的”页面。桌宠窗口不绘制场景背景，位置会在本地记忆。

单独调试桌宠时执行 `pnpm --filter @sanye/sanye_pet dev` 启动渲染器，或先启动客户端和渲染器后执行 `PET_DEV=1 pnpm --dir sanye_pet exec electron .`。
