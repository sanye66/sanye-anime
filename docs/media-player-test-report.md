# 公开媒体导入与播放器测试报告

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 测试日期 | 2026-08-25 |
| 测试环境 | Windows 本地联调；PostgreSQL、Redis、Elasticsearch 已就绪；CAS 使用本地 Mock；AI 使用 dev 提供者 |
| 测试范围 | 媒体导入、播放器、管理端入口、接口契约、前端构建与回归 |
| 总体结论 | 代码、清晰度选择、电影语言线路、真实 HLS 本地浏览器联调、季度独立卡片和搜索独立结果通过；真实版权授权和外部播放器持续可用性仍待 GAP-016 |

## 1. 结果总览

| 板块 | 通过 | 失败 | 结论 |
| --- | ---: | ---: | --- |
| anime 模块 Maven 单元测试 | 65 | 0 | 通过，JaCoCo 门禁通过 |
| 后端全量 Maven 单元测试 | 210 | 0 | 通过 |
| 媒体播放器 Playwright | 4 | 0 | 通过 |
| 真实 HLS 与季度/搜索聚合 Playwright | 34 | 0 | 通过，包含 ArtPlayer 外壳、媒体控制属性和移动端无溢出断言 |
| 多码率清晰度 Playwright | 3 | 0 | 通过，包含自动/720P/360P 菜单和 HLS 子清单切换 |
| 电影语言线路 Playwright | 2 | 0 | 通过，剧场版无第一集、第二集文案 |
| 全量 Playwright 脚本 | 548 | 0 | 11 个脚本通过；套件内按钮体检 428/428 |
| 接口分板块体检 | 60 | 0 | 通过 |
| 前端/桌宠类型检查 | 3 | 0 | 通过 |
| 前端生产构建 | 3 | 0 | 通过，client/admin/pet 均通过 |
| 文档一致性检查 | 572 | 0 | 通过 |

## 2. 媒体专项

| 检查项 | 结果 |
| --- | --- |
| 播放区加载 | 通过，测试地址 `https://player.example/one` |
| iframe 安全属性 | 通过，包含 `sandbox` 和 `referrerpolicy="no-referrer"` |
| 选集切换 | 通过，播放器地址切换到 `https://player.example/two` |
| 移动端布局 | 通过，390px 视口 `scrollWidth=390` |
| ArtPlayer 播放器外壳 | 通过，6 个真实 HLS 页面均存在 `.art-video-player`，实际 `<video>` 具备 `controls`、`playsinline` 和 `preload="metadata"` |
| 空数据与失败态 | 通过，详情页无剧集时不渲染空 iframe，失败态提供重试 |
| 五个无职转生篇章 | 通过，第一季 23、第二季 24、第二季 Part.2 12、第三季 9、OAD 1 集可读取 |
| 你的名字媒体数据 | 通过，作品 `127` 保留两条播放线路，页面显示“日语原声/国语”或线路名称，不显示为两集 |
| 真实 HLS 浏览器播放 | 通过，6 个代表作品均渲染 ArtPlayer/video、加载 m3u8、调用播放 API 后时间推进且无媒体错误 |
| 清晰度选择 | 通过，模拟多码率清单显示自动、720P、360P；切换 360P 后保持 ArtPlayer 控件并请求 `low.m3u8`；真实来源单清晰度时隐藏菜单 |
| 片库季度独立展示 | 通过，5 个无职转生季度卡片分别拥有独立封面和详情入口；搜索结果保留 5 个独立季度结果并指向有剧集的作品 |

## 3. 接口与安全

接口体检按系统、anime、搜索、AI、收藏历史、文件、反馈、管理端和监控九个板块执行，结果为 `60/60` 通过。媒体相关边界包括：

- 未携带管理调用方凭证返回 `2002`。
- 非白名单来源、非法地址和参数边界按业务错误处理。
- 来源读取仅接受 HTTPS 白名单域名，限制超时、响应大小和重定向。
- 导入只保存页面可见元数据，不下载、转码、缓存或代理第三方视频文件。

## 4. 回归命令

```powershell
mvn -f sanye_server/pom.xml test
mvn -B -f sanye_admin_server/pom.xml package -DskipTests
pnpm typecheck
pnpm build
pnpm e2e:all
node e2e/e2e-media-player-live.mjs
pnpm e2e:media-quality
pwsh -NoProfile -File .\sanye_deploy\interface-check.ps1 -ReportFile docs\interface-test-report.md -SkipSse
pnpm docs:check
git diff --check
```

## 5. 未关闭事项

目标站点真实授权、服务条款确认、来源页面持续可用性、删除通知和版权投诉流程尚未取得外部证据，保持 `GAP-016=blocked-external`。这不影响代码和本地测试通过，但不能据此宣称已具备生产内容授权。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.1 | 建立媒体专项测试报告并登记最终本地验证结果 | 媒体测试计划、Maven、Playwright、接口体检 |
| 2026-08-24 | v0.2 | 修复 HLS 配置无分号解析、统一无职转生季度入口并登记真实来源浏览器 22/22、全量 E2E 563/563、后端 210/210 | `mvn test`、`e2e-media-player-live.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v0.3 | 修复作品 `127` 第一条 HLS 线路不可播放问题，改用第二条线路并保留两条媒体线路；专项增加真实播放推进校验，最终 28/28 通过，同时覆盖季度和搜索聚合 | `e2e-media-player-live.mjs`、管理端媒体导入接口 |
| 2026-08-24 | v0.4 | 使用 ArtPlayer 5.4.0 替换页面原生播放器封装，增加外壳和控制属性实测；真实 HLS、实际播放推进和聚合仍为 28/28 | `e2e/e2e-media-player-live.mjs`、`sanye_client/src/views/animeDetailView.vue` |
| 2026-08-24 | v0.5 | 将无职转生季度与搜索验证改为独立卡片、独立封面和独立详情入口 | `e2e/e2e-media-player-live.mjs`、`animeRepositoryView.vue`、`searchView.vue` |
| 2026-08-24 | v0.6 | 清理运行目录、内存回退和管理端回退中的其他测试作品；全量回归修正媒体分片主动中止误报，11 个 Playwright 脚本更新为 539/539，按钮体检 419/419 | `V7__remove_demo_test_catalog.sql`、`AnimeMemoryStore.java`、`e2e-buttons.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v0.7 | 复核当前动态页面控件和全量回归基线，按钮体检更新为 428/428、全量 Playwright 更新为 548/548；正式片库仍仅保留《你的名字》和无职转生五个独立篇章 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v0.8 | 清理 E2E 临时数据后复核当前动态页面控件，独立按钮体检 425/425、全量 Playwright 540/540（套件内按钮 420/420）；正式片库仍仅保留《你的名字》和无职转生五个独立篇章 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v0.9 | 增加清晰度选择专项报告：多码率 HLS 3/3、真实 HLS/季度/搜索聚合 34/34、全量 Playwright 548/548；明确真实单清晰度来源按实际清单隐藏菜单 | `e2e/e2e-media-quality.mjs`、`e2e/e2e-media-player-live.mjs`、`pnpm e2e:all` |
| 2026-08-25 | v1.0 | 修正《你的名字》电影线路被误展示为两集的问题，登记正片标题、语言线路和切换专项 2/2 | `e2e/e2e-movie-playback-lines.mjs`、客户端 typecheck/build |
