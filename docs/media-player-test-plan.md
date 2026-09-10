# 公开媒体导入与播放器测试计划

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.3 |
| 文档状态 | 已执行 |
| 关联文档 | [公开媒体导入评审](./media-import-review.md)、[媒体开发设计](./media-player-development.md)、[测试策略](./testing-strategy.md)、[质量门禁](./quality-gates.md) |
| 唯一基准 | 否；本功能测试基准 |
| 更新时间 | 2026-09-10 |

## 当前核对（2026-09-10）

当前自包含浏览器回归包含电影线路 2 项和清晰度 4 项；本次未访问第三方真实播放源。跨集线路、外部来源防火墙和授权播放需要不同测试环境，不能由受控 HLS 夹具推定全部可播；证据见[当前审计](./current-status-audit.md)。

更新记录：2026-09-10，v1.3，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 1. 单元测试

后端至少覆盖：

- 仅接受 `https` 和配置白名单域名。
- 拒绝空地址、非法 URI、非目标来源域名、超过最大选集数的结果。
- 解析页面标题、同源选集链接和可见 `iframe` 地址。
- 页面没有 iframe、页面超时、响应过大时返回稳定业务错误。
- 同一作品重复导入时按剧集编号替换，不产生重复数据。
- PostgreSQL 存储的查询、批量替换和字段映射。

前端至少覆盖：

- API 类型和路径与接口契约一致。
- 详情页加载剧集失败不影响作品元数据。
- 选集切换只改变当前 ArtPlayer 播放地址，并销毁上一集的 HLS 实例。
- 剧场版显示“正片播放”和语言/线路选项，即使接口返回多个媒体记录也不得显示“第 N 集”。
- 多码率 HLS 显示“自动”和真实分辨率档位；清晰度切换只切换 `currentLevel`，不重建 ArtPlayer；单清晰度来源隐藏清晰度菜单。
- iframe 具有 `sandbox` 和 `referrerpolicy` 属性；ArtPlayer 容器生成的 `<video>` 具有 `controls`、`playsinline` 和 `preload="metadata"`。

## 2. 接口测试

| 编号 | 检查 |
| --- | --- |
| M-API-01 | 未发布作品读取剧集返回 `2003` |
| M-API-02 | 已发布作品无剧集返回 `200` 空数组 |
| M-API-03 | 未携带管理调用方凭证导入返回 `2002` |
| M-API-04 | 非白名单来源导入返回 `1001` |
| M-API-05 | 合法来源导入后可读取剧集数量与来源页 |
| M-API-06 | 重复导入结果幂等 |

## 3. Playwright 验收

- 详情页存在播放区时，HTML 来源显示隔离 iframe，视频来源显示 ArtPlayer 控制栏和剧集选择器。
- 真实来源 HLS 页面渲染 ArtPlayer 容器及其 `<video>`，首集清单和分片链路可加载，无 `player-overlay` 错误态。
- 点击另一集后播放器 `src` 更新，当前剧集标题更新。
- 无剧集时显示空状态，不出现空 iframe。
- 外部播放器加载失败时显示失败提示和重新加载按钮。
- 模拟多码率 HLS 显示 `自动、720P、360P`，选择 `360P` 后请求对应子清单且控制栏保持存在。
- 详情页在 390px 宽度下无横向溢出，播放器保持比例。
- 管理端只有有 `anime:content:edit` 权限的用户看到导入按钮。
- 管理端输入非法地址时不发起导入请求，合法地址能显示导入数量。

## 4. 本地命令

```powershell
cd sanye_server
mvn -pl sanye-server-anime -am test
cd ..
pnpm --filter @sanye/sanye_client typecheck
pnpm --filter @sanye/sanye_client build
pnpm e2e:verify
pnpm e2e:media-quality
pnpm docs:check
```

## 5. 通过标准

- 新增后端单元测试全部通过，既有 Maven 测试不得回归。
- 客户端和管理端类型检查、构建通过。
- Playwright 播放器和管理端导入场景通过；无 JS、资源、CORS 错误。
- `pnpm docs:check` 通过，接口、迁移、配置和任务文档同步。
- 外部来源真实播放只记录为“环境验证”，不把第三方服务暂时可用写成项目自身媒体服务已就绪。

## 6. 本次执行结果

详细报告见 [媒体播放器测试报告](./media-player-test-report.md)。本次本地联调结果如下：

| 板块 | 结果 | 证据 |
| --- | --- | --- |
| anime 媒体单元测试 | 65/65 通过，失败 0 | Maven + JaCoCo 门禁通过 |
| 后端全量单元测试 | 210/210 通过，失败 0 | `mvn -f sanye_server/pom.xml test` |
| 媒体播放器 Playwright | 4/4 通过 | `e2e/e2e-media-player.mjs` |
| 真实来源 HLS 与季度/搜索聚合 Playwright | 34/34 通过 | `e2e/e2e-media-player-live.mjs` |
| 多码率清晰度专项 Playwright | 3/3 通过 | `pnpm e2e:media-quality` |
| 电影语言线路专项 Playwright | 2/2 通过 | `node e2e/e2e-movie-playback-lines.mjs` |
| 全量 Playwright | 11 个脚本合计 548/548 通过；其中按钮体检 428/428 | `pnpm e2e:all` |
| 前端与桌宠类型检查 | 3/3 工程通过 | `pnpm typecheck` |
| 前端生产构建 | client/admin/pet 均通过 | `pnpm build` |
| 接口分板块体检 | 60/60 通过，失败 0 | `interface-check.ps1` |
| 文档一致性检查 | 572/572 通过，失败 0 | `pnpm docs:check` |

管理端导入的真实来源页面和外部播放器仍未作为正式生产验收依据，版权授权、来源条款和持续可用性继续由 `GAP-016` 管理。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.1 | 建立单元、接口、Playwright 和通过标准 | 媒体开发设计 |
| 2026-08-21 | v0.2 | 登记已执行的 anime 单测 58 项、播放器 Playwright 4/4 和前端类型检查证据 | T-D-08 验证结果 |
| 2026-08-21 | v0.3 | 补充全量 Maven、全量 Playwright、接口体检、构建和文档检查结果 | 最终本地联调验证 |
| 2026-08-24 | v0.4 | 增加真实 HLS 浏览器链路、五个无职转生篇章聚合和当前 65/210 单测、22/22 专项、563/563 全量 E2E 证据 | `e2e-media-player-live.mjs`、`mvn test`、`pnpm e2e:all` |
| 2026-08-24 | v0.5 | 运行目录、内存回退和管理端回退均收口到六部正式作品；全量 E2E 当前为 539/539，真实 HLS 专项仍为 28/28 | `AnimeMemoryStore.java`、`contentView.vue`、`pnpm e2e:all` |
| 2026-08-24 | v0.5 | 补齐《你的名字》两条可播放线路；专项增加真实播放推进检查，覆盖 6 个作品、季度聚合和搜索聚合共 28/28 | `e2e-media-player-live.mjs`、`GET /api/v1/anime/127/episodes` |
| 2026-08-24 | v0.6 | 增加 ArtPlayer 外壳、控制属性和 HLS customType 断言，保持真实 HLS 专项 28/28 通过 | `e2e/e2e-media-player-live.mjs`、`pnpm --filter @sanye/sanye_client typecheck` |
| 2026-08-24 | v0.7 | 将季度验证改为独立卡片、独立封面和独立详情入口，移除系列聚合断言 | `e2e/e2e-media-player-live.mjs`、`animeRepositoryView.vue` |
| 2026-08-24 | v0.9 | 同步完整回归后的全量 Playwright 当前基线 548/548 和按钮体检 428/428 | `pnpm e2e:all`、`node e2e/e2e-buttons.mjs` |
| 2026-08-24 | v1.0 | 清理 E2E 临时数据后同步当前基线：全量 Playwright 540/540、独立按钮体检 425/425（完整套件内 420/420） | `pnpm e2e:all`、`node e2e/e2e-buttons.mjs` |
| 2026-08-24 | v1.1 | 增加多码率 HLS 清晰度专项 3/3，并将真实 HLS/季度/搜索聚合更新为 34/34、全量 Playwright 更新为 548/548 | `e2e/e2e-media-quality.mjs`、`e2e/e2e-media-player-live.mjs`、`mvn test` |
| 2026-08-25 | v1.2 | 增加剧场版正片和语言线路语义检查，确认两条媒体记录不会显示为第一集、第二集 | `e2e/e2e-movie-playback-lines.mjs`、客户端 typecheck/build |
