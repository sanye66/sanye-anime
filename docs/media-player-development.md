# 公开媒体导入与播放器开发设计

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 文档状态 | 基线 |
| 关联文档 | [公开媒体导入评审](./media-import-review.md)、[接口与字段契约](./api-contract.md)、[数据库设计](./database-design.md)、[安全设计](./security-design.md)、[环境配置矩阵](./environment-config.md) |
| 唯一基准 | 否；实现设计基准 |
| 更新时间 | 2026-08-25 |

## 1. 目标

为 `sanye_anime` 增加一个可审计的媒体元数据链路：管理端提交授权来源页面，动漫服务提取页面可见的剧集或播放线路和外部播放器地址，数据库保存媒体元数据，客户端详情页按作品类型展示播放器、选集或电影线路。

## 2. 技术方案

### 2.1 后端

- 新增 `AnimeEpisode` 领域记录，字段包括剧集编号、标题、来源页、播放地址、媒体类型和来源标签。
- 新增 `sanye_anime_episode` 表，按 `(anime_id, episode_no)` 和 `(anime_id, source_page_url)` 保证幂等。
- 新增公开接口 `GET /api/v1/anime/{animeId}/episodes`。
- 新增只读预览接口 `GET /api/v1/anime/external-preview?sourceUrl=...`，供外部搜索候选在站内直接观看；接口只返回公开元数据和播放器地址，不创建作品或写入剧集。
- 新增受控接口 `POST /api/v1/manage/anime/{animeId}/episodes/import`，请求只接收 `sourceUrl`。
- 导入客户端使用 `Java HttpClient`，限制 `https`、来源域名、超时时间和响应大小；HTML 使用 `Jsoup` 解析。
- 只读取提交页面及其同页面选集链接，不访问页面中的第三方播放器地址，不下载媒体二进制内容；选集页按最多 4 路并发读取并保持页面顺序。
- 播放页元数据优先读取脚本声明的当前作品 `imgUrl`，再回退到作品卡片图片和 Open Graph 图片，避免相关推荐封面或站点 Logo 污染作品封面。
- `MEDIA_STORE=pg` 使用 PostgreSQL；`MEDIA_STORE=memory` 用于单元测试和无数据库开发。

### 2.2 前端播放器

- 详情页异步读取剧集接口，不影响作品基础信息展示。
- `text/html` 使用沙箱 `iframe` 播放；视频媒体使用 [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) `5.4.0`（MIT）提供控制栏、倍速、画中画和全屏能力。
- `application/vnd.apple.mpegurl` 或 `.m3u8` 通过 ArtPlayer `customType.m3u8` 接入 `hls.js`；不支持 HLS 时显示失败态，切换剧集和路由离开时销毁 ArtPlayer/HLS 实例。
- ArtPlayer 始终生成实际 `<video controls playsinline preload="metadata">`，普通视频地址交给原生媒体能力，不自动播放。
- `/v/` 播放页中的 `player_aaaa` JSON 配置支持有分号和无分号两种写法；服务只保存 HTTPS 播放地址，不代理媒体流。
- 多码率 HLS 在清单解析完成后从真实 `levels` 提取清晰度，按分辨率去重并保留最高码率；至少存在两个分辨率时通过 ArtPlayer 原生 selector 显示“自动”和实际 `720P`/`1080P` 等档位。
- 清晰度切换只设置 hls.js 的 `currentLevel`，不重建 ArtPlayer、不丢失播放进度；单一清晰度来源隐藏菜单，原生 HLS 回退路径不伪造清晰度选项。
- 提供剧集选择、当前剧集标题、来源页跳转、加载中、空数据、播放失败和重试状态。
- 外部搜索候选的“直接观看”进入客户端 `/watch/external`，调用只读预览接口后复用同一套 ArtPlayer/HLS 播放器；“导入观看”仍走 URL 导入并跳转正式作品详情页。
- 剧场版只显示“正片播放”，多条媒体记录按语言或播放线路展示，不使用“第一集、第二集”语义；连载作品继续按剧集展示。
- 不自动播放，不提供第三方媒体下载按钮，不把外部页面脚本权限带入客户端主页面。
- 页面在移动端保持固定播放器宽高比例，并支持键盘操作。

### 2.3 管理端

- 内容管理页增加“导入播放源”操作，仅对 `anime:content:edit` 权限可见。
- 导入弹窗只允许填写来源页面地址，并展示授权和合规提示。
- 导入成功后显示导入剧集数量；失败时保留表单内容，便于修正地址或等待来源恢复。

## 3. 状态与错误处理

| 场景 | 后端 | 客户端 |
| --- | --- | --- |
| 作品不存在/未发布 | `2003` | 不显示播放区，沿用详情错误态 |
| 来源地址不合法或不在白名单 | `1001` | 管理端显示参数错误 |
| 来源页面超时/响应过大/解析失败 | `5002` | 管理端显示导入失败；已有剧集不删除 |
| 没有可识别选集 | 成功返回空数组 | 显示空状态和来源页入口 |
| 外部播放器加载失败 | 公开接口仍返回元数据 | 显示失败提示和重试按钮 |

## 4. 配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `MEDIA_STORE` | `pg` | 媒体元数据存储实现 |
| `MEDIA_IMPORT_ALLOWED_HOSTS` | `yhdmtv.cc,www.yhdmtv.cc,yinghuadongman.org.cn,www.yinghuadongman.org.cn` | 允许提交的来源域名，逗号分隔 |
| `MEDIA_IMPORT_TIMEOUT_MS` | `30000` | 单个来源页面读取超时 |
| `MEDIA_IMPORT_MAX_BYTES` | `2097152` | 单个 HTML 响应最大字节数 |
| `MEDIA_IMPORT_MAX_EPISODES` | `100` | 单次导入最多保存的剧集数 |

## 5. 回滚

1. 将 `MEDIA_STORE=memory` 作为临时降级，客户端仍能正常构建和展示无媒体状态。
2. 回滚应用版本后，`V5__anime_episode.sql` 建立的表可以保留，不影响既有作品目录接口。
3. 禁止直接删除媒体表；需要清理时使用后续受控迁移或管理接口，并先完成备份。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.1 | 建立后端、前端、管理端、配置和回滚设计 | 媒体导入评审结论 |
| 2026-08-21 | v0.2 | 按实现结果补充白名单、重定向阻断、播放器安全属性和实际验证证据 | T-D-08 实现与测试 |
| 2026-08-24 | v0.3 | 补充 HLS 原生/hls.js 播放规则、无分号播放器配置兼容、当前来源白名单和 100 集限制 | `MediaImportServiceTest`、真实 HLS Playwright |
| 2026-08-24 | v0.4 | 播放器实现切换为 ArtPlayer 5.4.0，明确 GitHub 来源、控制能力、HLS customType 和实例销毁边界 | `sanye_client/src/views/animeDetailView.vue`、真实 HLS Playwright 28/28 |
| 2026-08-24 | v0.5 | 增加基于真实 HLS levels 的清晰度选择规则，明确自动档位、分辨率去重、单清晰度隐藏和不重建播放器的切换边界 | `e2e/e2e-media-quality.mjs`、清晰度专项 3/3 |
| 2026-08-25 | v0.6 | 区分剧场版播放线路与连载作品剧集，电影按语言或线路展示且不再显示集数 | `animeDetailView.vue`、电影线路专项 2/2 |
| 2026-08-25 | v0.7 | 兼容当前站点嵌套 `temLineList` 配置、清理作品标题，并将来源页面读取默认超时调整为 30 秒 | `MediaImportServiceTest` 8 项、`AnimeUrlImportServiceTest` 5 项、网关导入实测 |
| 2026-08-25 | v0.8 | 按播放列表组优先选择明确集数，按线路 ID 读取对应地址，避免线路和站点 Logo 被误当作剧集或封面 | `MediaImportServiceTest` 9 项、网关 URL 导入实测（2 集） |
| 2026-08-25 | v0.9 | 选集页最多 4 路并发读取并保持顺序；播放页优先读取当前作品脚本 `imgUrl`，复用当前页避免重复请求，修正相关推荐封面误取并登记真实导入测速 | `MediaImportServiceTest` 10 项、anime 75 项测试、动漫服务直连 URL 导入实测 |
| 2026-08-25 | v1.0 | 增加外部搜索候选的站内只读预览链路，明确 `/watch/external`、`/api/v1/anime/external-preview` 与 ArtPlayer/HLS 复用边界 | `AnimeController`、`AnimeUrlImportService`、`animeDetailView.vue`、站内 Playwright 回归、anime 76 项测试 |
