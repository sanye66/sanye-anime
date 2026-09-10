# sanye_anime 作品元数据和封面导入说明

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v3.1 |
| 文档状态 | 基线，补充搜索简称扩展、严格匹配、窄屏封面和双路径观看 |
| 更新时间 | 2026-09-10 |
| 相关实现 | `sanye_deploy/import-anime.mjs`、`sanye_deploy/anime-importer.mjs`、`sanye_deploy/import-anime.env.example`、`AnimeUrlImportService`、`contentView.vue` |
| 相关接口 | `/api/v1/admin/anime/import-url`、`/api/v1/admin/anime`、`/api/v1/admin/anime/{id}/episodes/import`、`/api/v1/admin/common/upload` |

## 当前来源证据范围

本文作品编号、剧集数量、导入耗时和第三方来源检查均为原执行环境的历史快照，本次没有重新查询目标数据或第三方站点。当前导入逻辑和受控测试已复验，真实授权来源的访问、播放与性能仍须在目标环境验证，见[当前审计](./current-status-audit.md)。不能按本文历史作品编号直接清理或覆盖其他环境数据。

更新记录：2026-09-10，v3.1，补充可变目录与外部来源证据的时效边界，保留现有导入流程。

## 1. 功能边界

脚本面向已经获得授权的公开作品详情页、搜索页或分类页，读取页面可见的结构化元数据：

- 标题：`og:title`、JSON-LD、详情页标题区域或 `title` 元素；
- 简介：详情页简介区域、`og:description`、`description` 元数据或 JSON-LD 描述；
- 年份：详情页首播字段、JSON-LD 的 `datePublished`/`dateCreated` 或页面中的四位年份；
- 标签：`keywords` 或 JSON-LD `keywords`；
- 封面：详情页主图、`og:image`、`twitter:image` 或 JSON-LD `image`；播放页优先读取当前作品脚本中的 `imgUrl`，避免把相关推荐封面或站点 Logo 当成作品封面。

脚本不下载、转码、缓存、代理或解析视频流，不绕过登录、验证码、DRM、Referer、付费墙或其他访问控制。管理端“URL 导入作品”按钮会在同一授权 URL 上组合执行作品元数据解析和剧集媒体元数据导入，视频资源只登记公开播放器地址，不下载视频文件。

客户端“个人中心 → 申请导入作品”优先提交审核申请。申请进入管理端“用户反馈”，管理员审核后点击“审核导入”才会创建或更新作品，并导入简介、封面和视频资源。如果反馈/审核链路不可用，客户端会按降级策略直接调用公开降级导入接口，让作品先进入系统。

客户端搜索页支持授权外部搜索候选：输入关键词后，站内片库和樱花动漫候选立即并行查询并分区展示，站内已有内容不会阻止外部候选出现。搜索服务按 `https://yhdmtv.cc/search/index.html?keyword=<关键词>` 对应的公开动态结果接口 `/public/auto/search1.html?keyword=<关键词>` 读取候选；“春物”“俺ガイル”和 `Oregairu` 等明确简称会扩展为正式标题和用户原词并行查询。客户端先请求并展示正式标题的高相关结果，原词回源完成后自动补齐它能够召回的其他作品；两次读取在服务端共享正式标题抓取，不会重复访问同一来源。每路搜索只提取标题严格包含该路查询词的 `/p/` 作品详情链接，合并时按标题去重，并按来源中的确定证据标记“电视动画”“剧场版”“网络动画”或“原创动画”；分类页只做精确分类筛选，无法确定分类的候选仅展示在“全部”。同标题外部候选已有确定分类或有效封面时，客户端用它校正片库历史错误类型和占位封面的搜索展示，但不修改数据库。搜索框既可输入普通关键词，也可直接粘贴 `https://yhdmtv.cc/search/index.html?keyword=...` 搜索 URL，服务端会解析其中的 `keyword` 参数。外部封面解析兼容延迟加载属性；已确认长期不可用的图片按完整 URL 精确替换为同一作品的可用真实封面，其他加载失败或 CDN 持续 5 秒无有效像素时回退站内占位封面，窄屏布局仍保留封面。每条外部候选同时提供“直接观看”和“导入观看”：前者进入站内 `/watch/external?sourceUrl=...`，通过只读预览接口解析简介、封面、剧集和播放器地址，并复用站内 ArtPlayer/HLS 播放器；后者调用降级导入接口，导入简介、封面和视频资源后跳转正式作品详情播放。预览与导入共享详情解析，并结合作品名、明确类型字段和页面分类标题确定作品类型；站内预览不创建作品、不写入剧集。

## 2. 使用方式

先启动网关、动漫服务和管理后端，再执行：

```powershell
$env:SANYE_ADMIN_PASSWORD = 'admin123'
pnpm import:anime -- 'https://yinghuadongman.org.cn/p/52685/'
```

也可以继续使用原生 Node 命令和多个地址：

```powershell
$env:SANYE_ADMIN_PASSWORD = 'admin123'
node .\sanye_deploy\import-anime.mjs `
  'https://yinghuadongman.org.cn/u/?wd=无职转生' `
  --url 'https://yinghuadongman.org.cn/p/52685/' `
  --continue-on-error
```

不传 URL 时脚本会提示粘贴作品详情页、搜索页或分类页；不想写入数据时追加 `--dry-run`，脚本只解析并输出标题、简介、年份、标签和封面来源。需要发布时显式追加 `--publish`；只想验证页面解析或来源没有封面时可追加 `--skip-cover`。管理端默认地址是 `http://localhost:8091/api/v1/admin`，默认账号是 `admin`，也可以通过 `--admin-url`、`--username` 和 `--password` 覆盖。

发给别人使用时，把 `sanye_deploy/import-anime.mjs`、`sanye_deploy/anime-importer.mjs` 和 `sanye_deploy/import-anime.env.example` 一起提供。对方将模板复制为 `sanye_deploy/import-anime.env` 并填写管理端地址、账号和密码后，可直接执行 `pnpm import:anime -- '<URL>'`；真实配置文件已被 `.gitignore` 忽略，禁止提交。

`import-anime.env` 支持：

| 变量 | 说明 |
| --- | --- |
| `SANYE_ADMIN_URL` | 管理 API 根地址 |
| `SANYE_ADMIN_USERNAME` | 管理端账号 |
| `SANYE_ADMIN_PASSWORD` | 管理端密码 |
| `SANYE_IMPORT_URLS` | 默认导入地址，多个用逗号分隔 |
| `SANYE_IMPORT_PUBLISH` | `true` 时导入后发布 |
| `SANYE_IMPORT_DRY_RUN` | `true` 时只预览不写库 |
| `SANYE_IMPORT_SKIP_COVER` | `true` 时跳过封面 |
| `SANYE_IMPORT_CONTINUE_ON_ERROR` | `true` 时单条失败继续后续条目 |
| `SANYE_IMPORT_ALLOW_HOSTS` | 额外授权域名，多个用逗号分隔 |

管理平台入口：进入“内容管理”，点击顶部操作区的“URL 导入”，粘贴作品详情页地址。弹窗支持选择“导入后发布”或“保存为草稿”；提交后服务端会导入标题、简介、年份、标签、封面地址和视频资源，并按标题更新已有作品，避免重复创建。同一行作品仍保留“导入播放源”，用于只给已有作品补导或重导视频资源。

导入速度：选集页统一提交到进程级固定线程池，最多 8 路并发读取，最多读取配置的集数；不再按 4 页一批等待慢页。来源页已读取的 HTML 会直接复用，重复作品按来源和标题走索引单查，剧集使用 JDBC 批量写入。此前 `https://yhdmtv.cc/p/74487/153/0` 真实回归首次约 7.6 秒，重复导入约 0.8-1.5 秒，返回《天气之子》、正确当前作品封面和 2 集；本轮外部站点请求被其防火墙拦截，最新真实耗时保留为待环境复测，不将单元测试写成外部性能证据。并发只作用于公开 HTML 元数据，不请求或下载视频流。

客户端入口：进入“个人中心”的设置列表，点击“申请导入作品”，填写 HTTPS 作品详情页 URL 和可选说明。提交后系统优先写入 `作品导入申请` 反馈工单；若反馈/审核链路不可用，则自动调用 `/api/v1/anime/import-url` 直接导入并发布。客户端不会拿到管理端写权限，降级导入仍由 anime 服务端执行白名单、HTTPS 和页面大小限制。

来源域名和封面 CDN 必须在白名单中。默认允许当前项目登记的 `yinghco.com.cn`、`yinghuadongman.org.cn`、`yhdmtv.cc` 及已核验的公开图片 CDN；其他授权 CDN 使用 `--allow-host` 显式追加。

批量导入建议追加 `--continue-on-error`：单条详情页抓取或管理端写入失败时记录 `[单条跳过]` 并继续后续条目，命令结束仍以非零退出码提示需要重试。单个封面 CDN 不可用时记录 `[封面跳过]`，作品元数据仍会写入；更新已有作品时不会清空原有站内封面。`--skip-cover` 也只跳过本次封面处理，不覆盖已存在的站内封面。

封面不可用或历史动态占位路径不存在时，动漫服务会统一返回 `/covers/anime-placeholder.svg`，保证客户端不会显示破图；该占位图不替代已成功上传的来源封面。

无职转生的重复来源按季度选择有剧集的正式作品；第一季、第二季、第二季 Part.2、第三季和 OAD 均作为独立片库卡片展示，并使用各自封面和详情入口。当前代表作品和已导入剧集如下：第一季使用作品 `133`（23 集）、第二季使用 `136`（24 集）、第二季 Part.2 使用 `135`（12 集）、第三季使用 `128`（9 集）、OAD 使用 `137`（1 集）。这些数据只保存页面公开的剧集元数据和外部 HLS 地址，不在项目中下载视频文件。

页面是列表页时脚本会自动发现详情链接；没有 `/p/` 详情链接的首页或站点壳页面不会被伪造成作品。标题不明确时可使用 `--title`，但每部作品仍应传入自己的详情页或包含详情链接的公开搜索页。

## 3. 写入流程

```text
公开详情页或搜索页
  -> HTTPS/域名白名单校验
  -> 搜索页展开 /p/ 详情链接（不访问 /v/ 播放地址）
  -> 读取 HTML 元数据
  -> 下载公开封面（≤10 MiB）
  -> POST /api/v1/admin/common/upload
  -> POST/PATCH /api/v1/admin/anime
  -> 可选 PATCH /api/v1/admin/anime/{id}/status
```

管理端按钮写入流程：

```text
公开详情页
  -> RuoYi 权限校验 anime:content:edit
  -> POST /api/v1/admin/anime/import-url
  -> 服务间凭证调用 /api/v1/manage/anime/import-url
  -> 读取 HTML 标题/简介/年份/标签/封面
  -> 按标题创建草稿或更新已有作品
  -> 复用媒体导入服务解析公开播放器地址
  -> 可选发布
```

客户端申请审核流程：

```text
客户端个人中心
  -> 申请导入作品
  -> POST /api/v1/feedback（type=作品导入申请）
    -> 成功：管理端用户反馈列表 -> 管理员点击审核导入 -> POST /api/v1/admin/anime/import-url -> 关闭反馈工单
    -> 失败：POST /api/v1/anime/import-url -> 服务端白名单校验后直接导入并发布
```

客户端搜索导入观看流程：

```text
搜索框输入关键词（如 天气之子）或粘贴 `https://yhdmtv.cc/search/index.html?keyword=...`
  -> 并行 GET /api/v1/search、GET /api/v1/search/external?preferredOnly=true 与完整外部搜索
  -> 服务端解析完整搜索 URL 中的 keyword 参数
  -> 先展示正式标题候选，再严格校验并补齐原词候选、确定性分类并合并去重
  -> 分区展示 yhdmtv.cc 外部候选和已在片库内容，封面失败时回退占位图
  -> 用户选择“直接观看”：进入站内 /watch/external?sourceUrl=...
  -> GET /api/v1/anime/external-preview?sourceUrl=...
  -> 站内 ArtPlayer/HLS 播放器加载外部播放地址
  -> 或选择“导入观看”：POST /api/v1/anime/import-url
  -> 导入成功后跳转 /anime/{id}
```

封面上传到管理端的本地文件目录后，脚本把返回路径转换为 `/admin-profile/profile/...`。网关只公开这个静态路径，管理令牌不会进入客户端页面。作品不存在时创建草稿，标题相同则更新已有作品，重复执行不会按标题新增重复记录。

## 4. 当前来源核验结果

已检查 `https://www.yinghco.com.cn/zh-cn/app.html`。该页面是站点壳页面，公开动漫目录实际位于其 iframe 的 `yinghuadongman.org.cn`；通过站内搜索可发现“无职转生”条目和“你的名字”详情页。脚本不会把壳页面或播放器页面伪造成作品，实际导入应使用公开搜索页或详情页 URL，并确认来源内容具有授权。

## 5. 验证

```powershell
node --test .\sanye_deploy\import-anime.test.mjs
node --check .\sanye_deploy\anime-importer.mjs
node --check .\sanye_deploy\import-anime.mjs
mvn -f .\sanye_server\pom.xml -pl sanye-server-anime test
pnpm --filter @sanye/sanye_admin typecheck
pnpm --filter @sanye/sanye_client typecheck
mvn -f .\sanye_server\pom.xml -pl sanye-server-search test
```

测试使用本地 HTML 固定样本，不访问第三方站点，不上传文件，不修改数据库。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v1.0 | 建立公开作品元数据和封面导入说明，明确授权来源与视频边界 | 导入脚本初版 |
| 2026-08-24 | v1.1 | 支持搜索页展开 `/p/` 详情链接、旧式详情模板解析、封面超时 30 秒和多 CDN 白名单；补充本次实测条目范围 | `import-anime.mjs`、公开页面解析、管理端导入验证 |
| 2026-08-24 | v1.2 | 增加批量继续处理、封面失败降级和已有封面保护；完成“你的名字”及无职转生 13 条公开元数据导入，管理端作品 ID 为 127-140，其中 OAD 因来源 CDN 不可用未上传封面 | 导入输出、管理端 API、`node --test` |
| 2026-08-24 | v1.3 | 增加动漫服务通用占位封面并兼容历史动态占位路径；最终核对 14 部作品全部已发布、13 张来源封面 HTTP 200、OAD 占位封面 HTTP 200 | 动漫模块 `63/63` 单测、管理端/公开接口与封面 HTTP 核对 |
| 2026-08-24 | v1.4 | 登记无职转生五个篇章的代表作品、剧集数量和 HLS 播放验证；片库前端统一为一个系列卡片 | 动漫服务公开接口、`e2e/e2e-media-player-live.mjs` |
| 2026-08-24 | v1.5 | 修正片库规则：五个篇章分别展示为独立卡片，保留各自封面、详情入口和播放列表；客户端隐藏未导入的演示作品 | `animeRepositoryView.vue`、`searchView.vue`、`animeCatalog.ts`、`e2e-media-player-live.mjs` |
| 2026-08-24 | v1.6 | 清理运行库中的历史演示、冒烟和 E2E 作品，只保留《你的名字》和无职转生六条正式记录；补充数据库与搜索索引清理脚本 | `V7__remove_demo_test_catalog.sql`、`cleanup-anime-test-data.ps1` |
| 2026-08-25 | v1.7 | 增加可分享一键导入体验：位置参数 URL、交互粘贴、本地配置模板、`--dry-run` 和 `pnpm import:anime` 入口 | `import-anime.mjs` 语法检查、导入器单测、文档检查 |
| 2026-08-25 | v1.8 | 增加管理端“URL 导入”按钮和服务端组合接口，一次导入简介、封面和视频资源 | `AnimeUrlImportServiceTest`、动漫服务测试、管理端类型检查和构建 |
| 2026-08-25 | v1.9 | 增加客户端设置页“申请导入作品”，管理端反馈审核后执行导入 | 反馈服务测试、客户端和管理端类型检查 |
| 2026-08-25 | v2.0 | 增加客户端降级直通策略：审核链路不可用时直接导入并发布 | 动漫服务测试、客户端类型检查 |
| 2026-08-25 | v2.1 | 增加搜索页外部候选：按 `yhdmtv.cc/search/index.html?keyword=` 搜索，点击候选后导入观看 | 搜索服务测试、客户端类型检查 |
| 2026-08-25 | v2.2 | 支持搜索框直接粘贴 `yhdmtv.cc/search/index.html?keyword=` URL，服务端解析 `keyword` 后返回外部候选 | 搜索服务测试、客户端类型检查和构建 |
| 2026-08-25 | v2.3 | 适配搜索页公开动态结果接口，兼容真实 `/p/{id}/{type}/{episode}` 播放详情路径并修正候选标题解析 | `ExternalSearchServiceTest` 10 项通过、搜索服务重启、直连/网关搜索实测 |
| 2026-08-25 | v2.4 | 外部候选增加直接观看与导入观看双路径；导入并发读取选集页，最多 4 路并发并复用已读取 HTML | `searchView.vue`、`AnimeUrlImportService`、`MediaImportService`、anime 74 项测试、客户端 typecheck |
| 2026-08-25 | v2.5 | 修正外部候选存在时的空状态误提示，补充播放页 `imgUrl` 封面解析、当前页复用和真实 URL 导入测速；确认《天气之子》导入 2 集且封面正确 | `searchView.vue`、`MediaImportServiceTest` 10 项、动漫服务直连导入实测、anime 75 项测试、`pnpm docs:check` |
| 2026-08-25 | v2.6 | 将外部候选直接观看改为站内 `/watch/external` 只读预览，复用正式 ArtPlayer/HLS 播放器；确认预览返回《天气之子》正确封面、2 集和播放地址，且不写入片库 | `AnimeController`、`AnimeUrlPreviewResult`、站内 Playwright 回归、anime 76 项测试、客户端 typecheck/build |
| 2026-08-25 | v2.7 | 优化搜索与导入等待：站内零命中目录回源、外部候选缓存与请求合并、8 路固定选集线程池、导入查重索引和剧集批量写入 | search 12 项、anime 76 项单元测试，客户端 typecheck/build；真实来源耗时待环境复测 |
| 2026-08-26 | v2.8 | 搜索改为站内片库与外部候选并行分区展示；增加标题严格匹配、确定性分类、历史类型展示校正、同名去重、封面回退，并修正预览/导入详情分类，保留双路径观看 | search 15 项、anime 80 项单元测试，客户端 typecheck/build、搜索专项 Playwright 5/5 |
| 2026-08-26 | v2.9 | 增加“春物”等精确作品简称解析并排除无关子串结果；搜索封面立即加载、5 秒超时回退且窄屏不再隐藏 | search 17 项、客户端 typecheck/build、搜索专项 Playwright 5/5 |
| 2026-08-26 | v3.0 | 修正简称搜索语义：“春物”同时查询正式标题和原词，渐进展示正式作品且不再丢弃原词结果；为已核验失效图片精确替换同作品真实封面 | search 18/18、客户端 typecheck/build、搜索 Playwright 5/5、真实外部接口与图片复测 |
