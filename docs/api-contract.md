# sanye_anime 接口与字段契约

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.8 |
| 文档状态 | 设计基线，与 [详细技术设计](./technical-design.md) 对应；实现时以此为准并回填字段变更 |
| 适用范围 | `sanye_server` 业务接口、SSE 流式事件、管理平台协作接口 |
| 更新时间 | 2026-08-25 |

## 1. 通用约定

### 1.1 请求头

| 头 | 必填 | 说明 |
| --- | --- | --- |
| `Authorization` | 登录后 | `Bearer {accessToken}` |
| `X-Request-Id` | 否 | 客户端生成或服务端生成，贯穿日志 |
| `X-Device-Id` | 匿名时 | 匿名设备标识（UUID），用于匿名额度与浏览统计 |
| `Content-Type` | 有体时 | `application/json` |

### 1.2 统一响应

```json
{ "code": 0, "message": "ok", "data": {}, "requestId": "1f2a..." }
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| code | int | 0 成功；非 0 见错误码表 |
| message | string | 人类可读提示 |
| data | object/array/null | 业务数据 |
| requestId | string | 请求标识 |

### 1.3 分页结构（PageResult）

```json
{ "items": [], "page": 1, "size": 20, "total": 128, "totalPages": 7 }
```

### 1.4 错误码

| code | 含义 | 客户端表现 |
| --- | --- | --- |
| 1001 | 参数校验失败 | 表单错误 |
| 1002 | 请求过于频繁 | 限流提示 |
| 2001 | 未登录/凭证过期 | 登录引导，保留现场 |
| 2002 | 无权限 | 权限不足 |
| 2003 | 资源不存在或不可见 | 不泄露存在性 |
| 3001 | 业务状态不允许 | 状态矩阵对应提示 |
| 3002 | 额度用尽 | 额度提示+恢复时间 |
| 4001 | AI 供应商超时/失败 | 失败重试 |
| 4002 | ES 不可用 | 搜索暂不可用 |
| 5001 | 服务内部错误 | 通用错误 |
| 5002 | 服务暂不可用（网关上游故障/连接拒绝/超时） | 统一错误提示，前端按错误码降级（T-G-06） |

## 2. 公共数据对象

### 2.1 UserSummary

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | long | 用户 ID |
| username | string | 登录名（CAS 主体映射） |
| nickname | string | 昵称 |
| avatarUrl | string | 头像地址（签名 URL） |
| status | string | ACTIVE/DISABLED |

### 2.2 AnimeCard

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | long | 作品 ID |
| title | string | 标题 |
| originalTitle | string | 别名/原名 |
| type | string | ORIGINAL/TV/MOVIE/WEB |
| year | int | 年份 |
| score | decimal | 评分 |
| status | string | PUBLISHED 才出现在公开接口 |
| coverUrl | string | 封面地址 |
| tags | string[] | 标签 |
| updateText | string | 更新状态文案（如“周三 22:00 更新”） |

### 2.3 AnimeDetail

AnimeCard 全部字段 +：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| summary | string | 简介 |
| characters | object[] | 角色：{name, role, avatarUrl} |
| schedule | object[] | 排期：{episodeNo, airDate, airTime, status} |
| similar | AnimeCard[] | 相似作品 |
| isFavorite | boolean | 当前用户是否收藏（未登录 false） |
| source | string | 来源与授权说明 |

### 2.4 Conversation

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | long | 会话 ID |
| title | string | 标题（≤20 字符摘要） |
| status | string | ACTIVE/ARCHIVED/DELETED |
| spoilerMode | string | SAFE/ALLOW |
| contextAnimeId | long/null | 当前作品上下文 |
| lastMessage | string | 最近消息摘要 |
| createdAt/updatedAt | datetime | 时间 |

### 2.5 Message

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | long | 消息 ID |
| conversationId | long | 所属会话 |
| role | string | USER/ASSISTANT/SYSTEM |
| content | string | 内容 |
| status | string | PENDING/COMPLETED/FAILED/STOPPED |
| generateTry | int | 生成尝试次数 |
| recommendations | object[] | 推荐卡片：{animeId, title, reason} |
| createdAt | datetime | 时间 |

### 2.6 QuotaInfo

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| used | int | 已用次数 |
| limit | int | 上限（匿名 5/登录 30） |
| resetAt | datetime | 重置时间 |
| anonymous | boolean | 是否匿名额度 |

### 2.7 Feedback / FileObject

Feedback：`id, type(CONTENT_ISSUE/AI_ISSUE/SUGGESTION/OTHER), content, refType(ANIME/CHAT), refId, status(OPEN/PROCESSING/CLOSED), priority(NORMAL/HIGH), createdAt`。
FileObject：`id, objectKey, url, contentType, sizeBytes, scanStatus(PENDING/CLEAN/INFECTED), status`。

## 3. sanye_core（系统）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/system/ping` | 公开 | 存活检查，返回 `{pong: true}` |
| GET | `/api/v1/system/capabilities` | 公开 | 当前能力清单 |
| GET | `/actuator/health` | 内部 | 存活/就绪/依赖探活（PG/Redis/ES/RabbitMQ/MinIO） |

## 4. sanye_auth（认证与账户）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/auth/cas/login` | 公开 | 返回 CAS 登录跳转地址 `{redirectUrl}` |
| GET | `/api/v1/auth/cas/callback?ticket=` | 公开 | CAS 回调，成功签发 token，返回 5.1 结构 |
| POST | `/api/v1/auth/cas/refresh` | Refresh | body：`{refreshToken}`，轮换签发 |
| POST | `/api/v1/auth/cas/logout` | 登录 | body：`{refreshToken}`，吊销本地会话并返回 CAS 登出地址 `{redirectUrl}` |

CAS 回调成功响应（data）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| accessToken | string | JWT，30 分钟 |
| refreshToken | string | 7 天，轮换 |
| expiresIn | int | 秒 |
| user | UserSummary | 用户 |
| isNewAccount | boolean | 是否自动建号 |

> 已落地实现（T-F-01 本地联调）：`GET /api/v1/auth/cas/login?service=` 返回 `{redirectUrl}`；
> `GET /api/v1/auth/cas/callback?ticket=&service=` 经 CAS `/serviceValidate`（一次性 ticket）校验后
> 自动建号/映射并签发 `{accessToken(HS256 JWT), refreshToken, expiresIn, isNewAccount, user}`；
> dev 环境使用本地 Mock CAS（`sanye_deploy/cas-mock.mjs`，端口 8095，`CAS_SERVER_URL` 配置），
> 正式环境替换为真实 CAS 服务器即可（`serviceValidate` 契约一致）。
> 网关对客户端 JWT 校验后注入 `X-User-Id`（业务服务 AuthContext 读取）；RuoYi 管理端 token 由其自身校验。
> `POST /api/v1/auth/cas/refresh`（body `{refreshToken}`）轮换签发新 access/refresh，旧 refresh 一次性失效；
> `POST /api/v1/auth/cas/logout`（body `{refreshToken}`）吊销本地 refresh 并返回 `{redirectUrl}`（CAS 登出地址）。

## 5. sanye_anime（首页/仓库/详情/排期/榜单）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/home?tab=` | 公开 | tab：FEATURED/JV/MOVIE；返回 5.1 |
| GET | `/api/v1/anime?keyword=&type=&status=&year=&page=&size=` | 公开 | 番剧仓库列表，PageResult<AnimeCard> |
| GET | `/api/v1/anime/{id}` | 公开 | 作品详情 AnimeDetail；非 PUBLISHED 返回 2003 |
| GET | `/api/v1/anime/{id}/episodes` | 公开 | 已发布作品的剧集媒体元数据；不代理第三方媒体内容 |
| GET | `/api/v1/schedule/week` | 公开 | 一周排期 WeeklySchedule（T-D-05，解析更新文案按周分组） |
| GET | `/api/v1/public/legal` | 公开 | 官网法律正文（T-D-07，仅已发布版，见 5.3） |

> 当前版本没有独立榜单、Banner 和单日排期接口；首页精选、热门分区和周排期分别由 `/api/v1/home`、`/api/v1/public/home` 与 `/api/v1/schedule/week` 提供。网关不会保留没有后端实现的死路由。

### 5.1 HomeResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| banners | object[] | {animeId, title, imageUrl, tagline} |
| sections | object[] | {key, title, anime: AnimeCard[]} |
| quickLinks | object[] | 排行榜/排期入口 |

### 5.1.1 AnimeEpisode

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | number | 媒体元数据编号 |
| episodeNo | number | 作品内剧集序号 |
| title | string | 剧集显示标题 |
| sourcePageUrl | string | 授权来源页面地址 |
| playbackUrl | string | 页面可见的外部播放器地址；项目不代理其内容 |
| mimeType | string | `text/html` 或 `video/*` |
| sourceLabel | string | 来源说明 |

### 5.2 WeeklySchedule（GET /api/v1/schedule/week）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| generatedAt | string | 生成日期（ISO，`YYYY-MM-DD`） |
| days | object[] | 7 天排期，固定顺序：monday→sunday |
| total | number | 本周场次合计 |

`days[]` 元素：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| day | string | monday/tuesday/wednesday/thursday/friday/saturday/sunday |
| label | string | 周一至周日 |
| items | object[] | 当日场次，按更新时间升序 |

`items[]` 元素：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| animeId | number | 作品 ID |
| title | string | 作品标题 |
| time | string | 更新时间 `HH:mm` |
| episode | string | 当前集数文案（`第 N 集`，按一季起点确定性推导，1-26） |
| description | string | 作品简介 |
| state | string | 已播出 / 待播出（当天当前时间之后为待播出） |
| tone | string | blue / coral / gold（卡片视觉色） |

约束：仅返回管理状态为“已发布”的作品；更新文案不匹配 `周X HH:mm 更新` 的连载作品不出现在排期。

### 5.3 PublicLegalDocument（GET /api/v1/public/legal）

返回已发布法律正文数组（仅 4 个 key：privacy/terms/copyright/contact；草稿不返回）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| key | string | privacy / terms / copyright / contact |
| title | string | 文档标题（≤100 字） |
| content | string | 正文纯文本，空行分段（≤20000 字） |
| updatedAt | string | 最近发布/保存时间 |

约束：本接口走网关公开白名单匿名可读；不返回 status、updatedBy 等内部字段。

## 6. sanye_search（搜索）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/search?keyword=&type=&status=&year=&page=&size=` | 公开 | ES 检索，PageResult<AnimeCard>；keyword 必填（≤50 字符） |

返回 data 额外字段：`query, corrected`（纠正词，可选）。ES 不可用返回 4002。

## 7. sanye_ai_chat（AI 对话）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/ai/conversations?page=&size=` | 登录 | 会话列表 PageResult<Conversation> |
| POST | `/api/v1/ai/conversations` | 登录 | body：`{title?, spoilerMode?, contextAnimeId?}`，创建会话 |
| GET | `/api/v1/ai/conversations/{id}` | 登录 | 会话详情（所有权校验） |
| PATCH | `/api/v1/ai/conversations/{id}` | 登录 | body：`{title?, spoilerMode?, contextAnimeId?, status?}` |
| DELETE | `/api/v1/ai/conversations/{id}` | 登录 | 删除会话（确认后） |
| POST | `/api/v1/ai/conversations/{id}/messages` | 登录/匿名 | 发送消息，SSE 流式返回（见 7.1）；body 见 7.2 |
| GET | `/api/v1/ai/conversations/{id}/messages?after=` | 登录 | 补拉消息（断线恢复） |
| POST | `/api/v1/ai/messages/{messageId}/stop` | 登录 | 停止生成 |
| POST | `/api/v1/ai/messages/{messageId}/regenerate` | 登录 | 重新生成（generateTry+1，不新增用户消息） |
| GET | `/api/v1/ai/quota` | 登录/匿名 | 返回 QuotaInfo |
| GET | `/api/v1/ai/model-info` | 登录/匿名 | 服务端模型状态（只读，见 7.3，不下发密钥/内部地址） |
| GET | `/api/v1/ai/preferences` | 登录/匿名 | 当前设备/用户的 AI 回答偏好（见 7.4） |
| PUT | `/api/v1/ai/preferences` | 登录/匿名 | 保存回答偏好；body 见 7.4；非法值返回 1001 |

### 7.1 发送消息请求体

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| content | string | 是 | 问题，1-2000 字符 |
| clientMessageId | string | 是 | 幂等键（UUID） |
| spoilerMode | string | 否 | SAFE/ALLOW，缺省用会话值 |

### 7.2 SSE 事件

`Content-Type: text/event-stream`，每行 `event:` + `data:` JSON：

| 事件 | data 字段 | 说明 |
| --- | --- | --- |
| message.accepted | messageId, conversationId | 已接受并进入生成 |
| message.delta | messageId, delta | 文本增量 |
| recommendation | messageId, recommendations[] | 推荐卡片（回源校验后） |
| message.completed | messageId, status, quota{used,limit} | 生成完成 |
| message.failed | messageId, code, reason | 失败（4001 等） |
| message.stopped | messageId | 用户停止 |

### 7.3 ModelInfo（GET /api/v1/ai/model-info）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| provider | string | dev / openai 等提供方标识 |
| providerLabel | string | 提供方展示名（本地模拟 / OpenAI 兼容在线模型） |
| model | string | 当前模型名 |
| temperature | number | 服务端默认温度（0-1） |
| memoryStore | string | pg / memory（记忆持久化类型） |
| memoryLabel | string | 记忆存储展示名 |
| ragEnabled | boolean | 检索增强（RAG）是否装配 |
| safetyEnabled | boolean | 剧透/安全规则是否启用 |
| preferenceStore | string | pg / memory（偏好存储类型） |
| allowedContextLengths | number[] | 允许的上下文长度：[4096, 8192, 16384] |

约束：本接口只读，不返回 AI_API_KEY、base-url 等运维配置。

### 7.4 AI 回答偏好（GET/PUT /api/v1/ai/preferences）

按 owner_key（device:xxx / user:xxx）维度存储，默认 PostgreSQL 持久化（sanye_ai_preference，V7 迁移）。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| temperature | number/null | 否 | 0-1，null 表示跟随服务端默认 |
| contextLength | number/null | 否 | 4096/8192/16384，null 表示服务端默认 |
| modelName | string/null | 否 | ≤50 字，null 表示服务端默认模型 |
| updatedAt | string | 否（返回时） | 最近保存时间 |

上下文长度映射 AI 会话记忆窗口：4096→10 条、8192→20 条、16384→30 条；保存后该设备/用户已缓存记忆窗口按新值重建。温度与模型名作为偏好保存，模型请求参数化在 OpenAI 提供方接入时生效。

## 8. sanye_favorite（收藏与历史）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/users/me/favorites?page=&size=` | 登录 | 收藏列表 PageResult<FavoriteItem> |
| GET | `/api/v1/users/me/favorites/{animeId}/status` | 登录 | 返回 `{favorite: boolean}` |
| POST | `/api/v1/users/me/favorites/{animeId}` | 登录 | 收藏（幂等，重复收藏不新增） |
| DELETE | `/api/v1/users/me/favorites/{animeId}` | 登录 | 取消收藏（幂等） |
| GET | `/api/v1/users/me/history?page=&size=` | 登录 | 浏览记录 PageResult<HistoryItem> |
| POST | `/api/v1/users/me/history/{animeId}` | 登录 | 记录一次作品浏览 |

## 9. sanye_file（文件）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/files` | 登录 | `multipart/form-data`，字段 `file` 与可选 `bucket`；服务端校验大小/扩展名/类型后返回文件 ID |
| GET | `/api/v1/files/{id}` | 登录用户（需 `X-Device-Id` 与 Bearer Token，且仅限文件所有者） | 返回文件二进制流；当前内容保存在 `FILE_STORAGE_DIR` |
| GET | `/api/v1/files/{id}/meta` | 登录用户（需 `X-Device-Id` 与 Bearer Token，且仅限文件所有者） | 返回文件元数据；生产环境再接入 MinIO 对象存储与病毒扫描 |

## 10. sanye_feedback（反馈）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/feedback` | 登录/匿名 | body：`{type, content, refType?, refId?}` |

客户端“作品导入申请”复用反馈通道提交，`type` 固定为 `作品导入申请`，`content` 内包含用户粘贴的 HTTPS 作品详情页 URL 和可选说明。正常链路只创建待处理工单，不导入作品、不写媒体资源；管理端审核后才调用内容导入接口。若反馈/审核链路不可用，客户端按降级策略调用公开降级导入接口直接通过。

### 10.1 客户端降级导入

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/anime/import-url` | 登录/匿名（需设备标识） | body：`{sourceUrl}`；审核链路不可用时从白名单 URL 直接导入并发布 |

降级接口与管理端 URL 导入复用同一服务端解析和白名单校验，只读取 HTTPS 公开页面，视频资源只登记外部播放地址，不下载、转码、缓存或代理媒体文件。

### 10.2 外部作品搜索候选

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/search/external?keyword=&size=` | 登录/匿名 | 读取授权外部搜索页，返回可导入的 `/p/` 详情页候选 |

当前外部搜索格式为 `https://yhdmtv.cc/search/index.html?keyword=<urlencoded keyword>`，该页面的候选列表由公开的 `/public/auto/search1.html?keyword=<urlencoded keyword>` 动态返回。`keyword` 参数可传普通关键词，也可传完整 `https://yhdmtv.cc/search/index.html?keyword=...` 搜索 URL；服务端会提取其中的 `keyword` 后再查询外部候选。服务端只返回标题、详情页 URL、封面和摘要候选，详情页 URL 允许 `/p/` 下的多段路径。同一关键词和数量的有效候选缓存 120 秒，空结果缓存 10 秒，并发相同请求合并为一次远端读取。客户端先查询站内搜索；ES 零命中或不可用时搜索服务回源动漫公开目录，目录仍无结果时客户端才请求外部候选。客户端对每条候选提供两条路径：直接观看进入站内 `/watch/external?sourceUrl=...`，由客户端调用 `/api/v1/anime/external-preview` 只读解析元数据和播放地址，并复用站内 ArtPlayer/HLS 播放器；导入观看调用 `/api/v1/anime/import-url` 写入作品后跳转正式详情播放。站内直接观看不创建作品、不写入剧集，也不代理或下载视频流。

| GET | `/api/v1/anime/external-preview?sourceUrl=` | 登录/匿名 | 只读解析白名单外部作品页面，返回标题、简介、封面、剧集和播放器地址，供站内预览页播放 |

预览响应字段：

```text
title
originalTitle
type
year
summary
tags
updateText
coverUrl
sourceUrl
episodes
```

该接口不创建或更新作品，不写入剧集媒体记录；外部播放地址仍由站内 ArtPlayer/HLS 播放器加载。

## 11. 管理端协作接口（sanye_admin ↔ sanye_server）

鉴权：`X-Caller-Name` + `X-Internal-Token`（服务间凭证）。管理端角色经 RuoYi 校验后调用。

| 方法 | 路径 | 角色 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/anime` | 内容查看/超管 | 含非公开内容列表 |
| GET | `/api/v1/admin/anime/{id}` | 内容查看/超管 | 内容详情 |
| POST | `/api/v1/admin/anime` | 内容编辑/超管 | 新建草稿，body：AnimeDraft（见 11.1），可带 `sourceUrl`、`coverUrl` |
| POST | `/api/v1/admin/anime/import-url` | 内容编辑/超管 | body：`{sourceUrl, publish?}`；从授权 URL 导入作品简介、封面和视频资源 |
| PATCH | `/api/v1/admin/anime/{id}` | 内容编辑/超管 | 编辑作品内容，可更新 `sourceUrl`、`coverUrl` |
| PATCH | `/api/v1/admin/anime/{id}/status` | 内容审核/超管 | body：`{status}`，支持草稿/待审核/已发布/已下架 |
| POST | `/api/v1/admin/anime/{id}/episodes/import` | 内容编辑/超管 | body：`{sourceUrl}`；导入公开页面媒体元数据，不下载视频 |
| GET | `/api/v1/admin/feedback` | 反馈查看/超管 | 反馈管理列表 |
| PATCH | `/api/v1/admin/feedback/{id}` | 反馈处理/超管 | body 当前仅支持 `{status}` |
| GET | `/api/v1/admin/legal` | 内容编辑/审核员/超管 | 官网正文列表（含草稿，T-D-07） |
| PUT | `/api/v1/admin/legal/{key}` | 内容编辑/超管 | 保存官网正文：body `{title, content, status(草稿/已发布)}` |
| GET | `/api/v1/admin/system/user/list?pageNum=&pageSize=` | 超管 | RuoYi 用户列表 |
| PUT | `/api/v1/admin/system/user/changeStatus` | 超管 | 启用/停用 |
| PUT | `/api/v1/admin/monitor/job/run` | 运维/超管 | 立即执行 Quartz 任务 |
| GET | `/api/v1/admin/monitor/job/list?pageNum=&pageSize=` | 运维/超管 | 任务列表 |
| GET | `/api/v1/admin/monitor/jobLog/list?pageNum=&pageSize=` | 运维/超管 | 执行记录列表 |

> 已落地实现（T-D-07）：`/api/v1/admin/legal` 经 RuoYi 代理调用 anime 服务受控接口 `/api/v1/manage/legal`
> （`X-Caller-Name` 服务间凭证，缺省返回 2002），RuoYi 侧方法级权限 `legal:content:list` / `legal:content:edit`
> （菜单种子 1065/1066）。保存“草稿”后官网公开接口立即隐藏该文档，保存“已发布”后立即可见。

> 内容管理已落地实现（T-F-03 深化）：`/api/v1/admin/anime` 支持 GET 列表、GET `/{id}` 详情、POST 新建草稿、
> POST `/import-url` URL 一键导入、PATCH `/{id}` 编辑（title/type 必填，year 1900-2100，tags 逗号分隔）、PATCH `/{id}/status` 状态流转；
> 权限串 `anime:content:list`（查看）/ `anime:content:edit`（新建与编辑，菜单种子 1067）/ `anime:content:status`（状态）。
> 新建作品默认“草稿”，公开列表/详情不可见，发布后立即可见；数据面默认 PostgreSQL
> （`sanye_anime` 表，V3 迁移扩展列与历史 15 部种子，V7 清理迁移和 V8 正式元数据迁移后当前运行数据为 6 部，T-B-04），`CATALOG_STORE=memory` 可回退内存实现；
> 服务重启后作品、简介、标签、角色、排期与发布状态均保留。

### 11.0 URL 一键导入

`POST /api/v1/admin/anime/import-url` 请求：

```json
{ "sourceUrl": "https://example.com/p/900/", "publish": false }
```

返回：

```json
{
  "anime": { "id": 900, "title": "作品标题", "status": "草稿" },
  "episodesImported": 12
}
```

服务端只读取白名单 HTTPS 公开页面，解析标题、简介、年份、标签、封面地址和公开播放器配置。视频资源只登记外部播放地址，不下载、转码、缓存或代理媒体文件；同名作品重复导入时按标题更新，不新增重复记录。

导入性能边界：详情页与播放页可并发读取；同一进程的选集 HTML 使用固定线程池最多 8 路并发，全部选集一次提交后由线程池限流，不再按批次等待，且不超过 `sanye.media.import.max-episodes`。已读取的来源 HTML 会复用，剧集快照使用 JDBC 批量写入。并发只读取公开 HTML，不请求视频流。

管理端审核链路：`/api/v1/admin/feedback` 返回 `type/content/contact`，当 `type=作品导入申请` 时，管理端从 `content` 提取 HTTPS URL，管理员点击“审核导入”后再调用 `/api/v1/admin/anime/import-url`。导入成功后反馈状态更新为 `已关闭`。客户端仅在该链路提交失败时调用 `/api/v1/anime/import-url` 直通。

### 11.1 AnimeDraft

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| title | string | 是 | 标题 |
| originalTitle | string | 否 | 别名 |
| type | string | 否 | ORIGINAL/TV/MOVIE/WEB |
| year | int | 否 | 年份 |
| summary | string | 否 | 简介 |
| source | string | 否 | 来源与授权 |
| imageState | string | 否 | 已核验/待补充 |
| tags | string[] | 否 | 标签 |
| schedule | object[] | 否 | 排期条目 |
| sourceUrl | string | 否 | 公开作品详情页 HTTPS 地址 |
| coverUrl | string | 否 | 站内封面路径或 HTTPS 封面地址；导入脚本会先上传到管理端 |

## 12. RuoYi 标准接口（管理平台前端）

沿用 RuoYi-Vue 3.9 标准路径，本文档只登记本系统使用到的类别：

| 类别 | 路径 | 说明 |
| --- | --- | --- |
| 登录 | `POST /login`、`POST /logout`、`GET /getInfo`、`GET /getRouters` | 登录、信息、动态路由 |
| 用户 | `GET/PUT/DELETE /system/user/*` | 用户管理 |
| 角色/菜单 | `GET/PUT /system/role/*`、`/system/menu/*` | 权限管理 |
| 任务 | `GET/POST/PUT/DELETE /monitor/job/*`、`/monitor/jobLog/*` | Quartz 任务与日志 |
| 审计 | `GET /monitor/operlog/*`、`/monitor/logininfor/*` | 操作/登录日志 |
| 缓存 | `GET /monitor/cache/*` | 缓存监控 |
| 系统 | `GET/PUT /system/config/*`、`/system/dict/*` | 配置与字典 |

字段约定与响应结构遵循 RuoYi 标准（`code/msg/data`、`total/rows` 分页），实现时以 RuoYi 源码为准，不做二次发明。

## 13. 接口响应示例（实测，2026-08-19）

以下示例来自本地联调实测（网关 `http://localhost:8091`），作为字段结构与类型的实现参考；
字段定义以各节表格为唯一基准，示例仅展示形态。

### 13.1 统一信封与错误

成功信封：

```json
{ "code": 0, "message": "ok", "data": {}, "requestId": "9d3b0a5e-…" }
```

网关鉴权失败（HTTP 401，区分两种原因）：

```json
{ "code": 2001, "message": "缺少 X-Device-Id，无法识别请求来源", "data": null, "requestId": "…" }
```

```json
{ "code": 2001, "message": "登录凭证无效或已过期", "data": null, "requestId": "…" }
```

说明：业务路由必须携带 `X-Device-Id` 标识请求来源；携带 `Authorization: Bearer <我方 JWT>` 且校验失败时返回第二种文案。前端收到 401 后先单飞调用 `POST /api/v1/auth/cas/refresh` 自动续期并重放原请求（并发 401 只发起一次 refresh），refresh 无效才清会话跳 CAS；refresh 服务暂不可用时保留会话仅提示稍后重试。

`POST /api/v1/monitor/frontend-errors` 为公开遥测端点（网关 `/api/v1/monitor/**` 白名单放行，仅结构化日志 + 内存快照，无敏感数据），供三端匿名上报前端错误，不受鉴权影响。

网关上游故障（HTTP 503，requestId 与请求头一致）：

```json
{ "code": 5002, "message": "服务暂不可用，请稍后重试", "data": null, "requestId": "…" }
```

无路由（HTTP 404）：

```json
{ "code": 2003, "message": "资源不存在", "data": null, "requestId": "…" }
```

### 13.2 系统

`GET /api/v1/system/ping`：

```json
{ "code": 0, "message": "ok", "data": { "pong": true }, "requestId": "…" }
```

`GET /api/v1/system/capabilities`：

```json
{ "code": 0, "message": "ok", "data": ["anime", "search", "ai_chat", "favorite", "feedback", "admin"], "requestId": "…" }
```

### 13.3 anime（首页/仓库/详情/排期/法律）

`GET /api/v1/anime?type=剧场版&size=2`（PageResult，当前正式片库）：

```json
{
  "code": 0, "message": "ok", "requestId": "…",
  "data": {
    "items": [
      { "id": 127, "title": "你的名字", "originalTitle": "君の名は。", "type": "剧场版", "year": 2026,
        "score": 9.1, "status": "已发布", "coverUrl": "/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100635A046.jpg",
        "tags": ["剧场版", "爱情", "奇幻"], "updateText": "已完结" }
    ],
    "page": 1, "size": 2, "total": 2, "totalPages": 1
  }
}
```

`GET /api/v1/anime/127`（详情聚合）：

```json
{
  "code": 0, "message": "ok", "requestId": "…",
  "data": {
    "id": 127, "title": "你的名字", "originalTitle": "君の名は。", "type": "剧场版", "year": 2026,
    "score": 9.1, "status": "已发布", "coverUrl": "/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100635A046.jpg",
    "tags": ["剧场版", "爱情", "奇幻"], "updateText": "已完结",
    "summary": "在远离大都会的小山村，两个素不相识的少年少女在梦中交换人生，并开始寻找彼此。",
    "isFavorite": false,
    "characters": [],
    "similar": [{ "id": 133, "title": "无职转生 · 第一季", "type": "电视动画", "year": 2026, "score": 9.2 }],
    "schedule": [],
    "source": "公开作品元数据（授权状态待核验，GAP-005）"
  }
}
```

`GET /api/v1/home`（分区）：

```json
{ "code": 0, "message": "ok", "requestId": "…",
  "data": {
    "banners": [],
    "sections": [
      { "key": "recent", "title": "最近更新", "anime": [ { "id": 127, "title": "你的名字" } ] },
      { "key": "popular", "title": "热门动漫", "anime": [ { "id": 133, "title": "无职转生 · 第一季" } ] }
    ],
    "quickLinks": []
  } }
```

`GET /api/v1/schedule/week`（节选）：

```json
{ "code": 0, "message": "ok", "requestId": "…",
  "data": {
    "generatedAt": "2026-08-19",
    "total": 7,
    "days": [
      { "day": "wednesday", "label": "周三",
        "items": [{ "animeId": 128, "title": "无职转生 · 第三季", "time": "21:00", "episode": "第 10 集",
                    "description": "异世界的新篇章继续展开。", "state": "待播出", "tone": "violet" }] }
    ]
  } }
```

`GET /api/v1/public/legal`（节选）：

```json
{ "code": 0, "message": "ok", "requestId": "…",
  "data": [
    { "key": "privacy", "title": "隐私政策摘要",
      "content": "sanye_anime 只在提供账户…\n\nAI 回答是基于已发布作品信息生成的辅助内容…",
      "updatedAt": "2026-08-19T03:38:42Z" }
  ] }
```

### 13.4 搜索（ES 就绪与降级）

`GET /api/v1/search?keyword=你的名字` 在 Elasticsearch 已就绪时返回命中结果；依赖不可用时返回降级错误：

```json
{ "code": 4002, "message": "搜索服务暂不可用，请稍后重试", "data": null, "requestId": "…" }
```

缺关键词 / 超长关键词：`code: 1001`（参数校验先于 ES 调用）。

### 13.5 AI 对话

`GET /api/v1/ai/quota`：

```json
{ "code": 0, "message": "ok", "data": { "used": 0, "limit": 5, "resetAt": "2026-08-20T00:00", "anonymous": true }, "requestId": "…" }
```

`GET /api/v1/ai/model-info`：

```json
{ "code": 0, "message": "ok", "requestId": "…",
  "data": { "provider": "dev", "providerLabel": "本地模拟（dev-mock）", "model": "gpt-4o-mini",
            "temperature": 0.7, "memoryStore": "pg", "memoryLabel": "PostgreSQL 持久化",
            "ragEnabled": true, "safetyEnabled": true, "preferenceStore": "pg",
            "allowedContextLengths": [4096, 8192, 16384] } }
```

`GET /api/v1/ai/preferences`（未设置时）：

```json
{ "code": 0, "message": "ok", "data": { "temperature": null, "contextLength": null, "modelName": null, "updatedAt": null }, "requestId": "…" }
```

`POST /api/v1/ai/conversations/{id}/messages`（SSE 事件流，`text/event-stream`）：

```text
event: message.accepted
data: {"messageId":12,"conversationId":3}

event: message.delta
data: {"messageId":12,"delta":"根据你的偏好，我推荐《纸月计划》…"}

event: recommendation
data: {"messageId":12,"recommendations":[{"animeId":3,"title":"纸月计划","reason":"近未来悬疑，节奏紧凑"}]}

event: message.completed
data: {"messageId":12,"status":"COMPLETED","quota":{"used":1,"limit":5}}
```

失败事件（参数错误/额度用尽）：

```text
event: message.failed
data: {"messageId":0,"code":3002,"reason":"匿名每日额度已用完，登录后可继续使用"}
```

### 13.6 收藏与历史

`GET /api/v1/users/me/favorites`：

```json
{ "code": 0, "message": "ok", "requestId": "…",
  "data": { "items": [
    { "anime": { "id": 3, "title": "纸月计划", "type": "剧场版", "year": 2025, "score": 9.0 },
      "createdAt": "2026-08-19T07:14:03Z" }
  ], "page": 1, "size": 20, "total": 1, "totalPages": 1 } }
```

`GET /api/v1/users/me/favorites/3/status`：

```json
{ "code": 0, "message": "ok", "data": { "favorite": true }, "requestId": "…" }
```

`GET /api/v1/users/me/history`：PageResult，条目含 `{anime:{…}, lastViewAt}`。

### 13.7 文件

`POST /api/v1/files`（multipart，file + bucket）：

```json
{ "code": 0, "message": "ok", "data": { "id": 42, "objectKey": "…uuid.svg" }, "requestId": "…" }
```

`GET /api/v1/files/{id}/meta`：

```json
{ "code": 0, "message": "ok", "requestId": "…",
  "data": { "id": 42, "bucket": "anime", "objectKey": "…uuid.svg", "originalName": "anime-1.svg",
            "contentType": "image/svg+xml", "sizeBytes": 547, "sha256": "…", "scanStatus": "PASS", "status": "ACTIVE" } }
```

`GET /api/v1/files/{id}`：二进制流（Content-Type + Content-Disposition: inline）。

### 13.8 反馈

`POST /api/v1/feedback`：

```json
{ "code": 0, "message": "ok", "data": { "id": 88 }, "requestId": "…" }
```

非法类型 / 空内容：`code: 1001`。

### 13.9 管理端（RuoYi 经网关）

`POST /api/v1/admin/login`：

```json
{ "code": 200, "msg": "操作成功", "token": "eyJhbGciOi…" }
```

错误密码：`HTTP 200` + `{ "code": 500, "msg": "用户不存在/密码错误" }`。

`GET /api/v1/admin/getInfo`（顶层字段，不走 data）：

```json
{ "code": 200, "msg": "操作成功",
  "user": { "userId": 1, "userName": "admin", "nickName": "管理员" },
  "roles": ["admin"], "permissions": ["*:*:*"] }
```

`GET /api/v1/admin/anime`（RuoYi 信封，data 为业务数组）：

```json
{ "code": 200, "msg": "操作成功", "data": [
  { "id": 127, "title": "你的名字", "originalTitle": "君の名は。", "type": "剧场版",
    "source": "已核验", "status": "已发布", "updated": "2026-08-24" }
] }
```

`GET /api/v1/admin/dashboard/stats`（节选）：

```json
{ "code": 200, "msg": "操作成功", "data": {
  "animePublished": 6, "animeReview": 0, "animeOffline": 0,
  "feedbackPending": 1, "jobs": 3, "users": 2,
  "aiTotalConversations": 52, "aiTodayMessages": 22 } }
```

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v0.2 | 追加第 13 节接口响应示例（实测）与更新记录 | 企业级文档完善 |
| 2026-08-21 | v0.3 | 增加剧集媒体查询和管理端授权来源导入契约 | 媒体导入评审与实现设计 |
| 2026-08-24 | v0.4 | 将当前接口示例、作品统计和 PostgreSQL 迁移说明同步到 6 部正式片库；历史 15 部种子仅保留为迁移背景 | V7/V8 迁移、接口与管理端统计实测 |
| 2026-08-25 | v0.5 | 补充外部搜索动态结果接口、完整搜索 URL 输入和多段 `/p/` 详情路径契约 | 搜索服务测试、直连/网关接口实测 |
| 2026-08-25 | v0.6 | 补充外部候选直接观看与导入观看双路径，以及 URL 导入并发读取限制 | `searchView.vue`、`AnimeUrlImportService`、`MediaImportService`、anime 测试与客户端 typecheck |
| 2026-08-25 | v0.7 | 将外部候选直接观看收口为站内 `/watch/external` 预览，补充只读预览接口和响应字段契约 | `AnimeController`、`AnimeUrlPreviewResult`、`searchView.vue`、站内 Playwright 回归、anime 76 项测试 |
| 2026-08-25 | v0.8 | 搜索增加 ES 零命中目录回源、外部候选短时缓存和并发请求合并；导入改为 8 路固定线程池与剧集批量写入 | search 12 项、anime 76 项单元测试，客户端 typecheck/build |
