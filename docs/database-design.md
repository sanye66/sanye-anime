# sanye_anime 数据库设计

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.6 |
| 文档状态 | 基线（数据唯一基准） |
| 唯一基准 | 是（表、字段、约束、索引、迁移） |
| 关联文档 | [接口契约](./api-contract.md)、[环境配置](./environment-config.md)、[安全设计](./security-design.md)、[监控方案](./monitoring-design.md) |
| 更新时间 | 2026-09-10 |

## 当前核对（2026-09-10）

当前迁移不止历史 V1 至 V4：动漫已到 V13、搜索到 V3，各服务版本独立。T-R-04 最终恢复演练使用八个业务 schema 的真实 Flyway 初始化/校验/重复迁移并保留迁移历史，详见[任务清单](./development-tasks.md)。本次普通单元测试未重跑数据库升级或恢复，不能把旧库验证推广到目标数据库。

更新记录：2026-09-10，v1.6，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 可靠事件迁移

动漫 V11 增加 Outbox 版本、重试、发送时间等字段；V12/V13 补齐并初始化主键序列默认值。已应用迁移保持原校验和，不执行 repair。搜索 V2/V3 建立 `sanye_search.sanye_search_event_inbox`。空库迁移、重复迁移无新增、旧库升级均有 T-R-02 测试记录。

Outbox 的 `PENDING`、`SENT`、`DEAD` 对应等待投递、确认投递和重试耗尽；领取采用 `FOR UPDATE SKIP LOCKED` 原子更新 30 秒租约，每轮一条。业务写入、作品版本递增、快照追加位于同一事务；消费者先占位后加行锁，ES 成功后推进 inbox，删除也保留版本。主数据与搜索分别使用自己的 schema。重放允许重复投递，但不允许旧版本复活下架作品。

回滚应用前须确认兼容新增事件和迁移；不倒退已应用迁移、不删除 Outbox 或 inbox。测试库 `sanye_tr02_persistence_20260909` 与验收作品 142 均为本次合成数据，故障记录保留供复核。

## 1. 数据库实例与 Schema 划分

- 单 PostgreSQL 实例，按服务独立 schema（服务自治，Flyway 各自管理）。
- 本地联调实例：`127.0.0.1:5433`，账号 `sanye / 123456`（仅本地开发；由 `run-local.ps1` 统一设置）。
- 正式实例（5432）连接口令待环境配置（见 environment-config）。
- 每个业务服务只读写自己的 schema；跨服务数据通过 Feign/事件协作，不直连其他 schema。

| 服务 | Schema | 迁移目录 | 说明 |
| --- | --- | --- | --- |
| auth | `sanye_auth`（V1 未显式 schema，Flyway `schemas` 配置） | sanye-server-auth | 账户与 CAS 认证 |
| anime | `sanye_anime` | sanye-server-anime | 作品目录、法律正文 |
| ai-chat | `sanye_ai_chat` | sanye-server-ai-chat | 会话、消息、记忆、偏好、额度 |
| favorite | `sanye_favorite` | sanye-server-favorite | 收藏与浏览历史 |
| file | `sanye_file` | sanye-server-file | 文件对象元数据 |
| feedback | `sanye_feedback` | sanye-server-feedback | 反馈与处理日志 |
| job | `sanye_job` | sanye-server-job | 任务执行记录 |
| search | `sanye_search`（同库，表前缀 sanye_） | sanye-server-search | 索引同步记录 |
| admin | `sanye_admin` | sanye_admin_server/sql | RuoYi 系统表（独立库） |

## 2. 表字典

### 2.1 sanye_anime（作品目录）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigint | PK，序列 sanye_anime_id_seq | 作品 ID |
| title | varchar(120) | NOT NULL | 标题 |
| original_title | varchar(120) | | 别名/原名 |
| type | varchar(20) | NOT NULL | 类型（原创动画/电视动画/剧场版/网络动画） |
| year | int | | 年份 |
| summary | text | | 简介 |
| cover_file_id | bigint | | 封面文件 ID（文件服务接入后） |
| cover_url | varchar(1000) | | 管理端上传后生成的站内封面路径，缺失时使用静态占位封面 |
| status | varchar(16) | NOT NULL DEFAULT 'DRAFT' | 草稿/待审核/已发布/已下架 |
| source | varchar(1000) | | 公开来源页面地址；导入前必须完成授权核验 |
| license_note | varchar(500) | | 授权备注 |
| version | bigint | NOT NULL DEFAULT 0 | 乐观锁版本 |
| score | double precision | NOT NULL DEFAULT 0 | 评分 |
| update_text | varchar(50) | | 更新文案（“周三 22:00 更新”/“已完结”） |
| tags_json | jsonb | NOT NULL DEFAULT '[]' | 标签数组 |
| characters_json | jsonb | NOT NULL DEFAULT '[]' | 角色数组 [{name, role}] |
| published_at | timestamptz | | 发布时间 |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() | 时间戳 |
| deleted_at | timestamptz | | 软删除 |

索引：`idx_sanye_anime_status (status, published_at desc)`；V9 增加活动记录的部分索引 `idx_sanye_anime_source_active (source) where deleted_at is null and source is not null` 与 `idx_sanye_anime_title_active (title) where deleted_at is null`，供导入幂等单条查询使用。

正式运行数据：保留《你的名字》127 和无职转生 128/133/135/136/137 六部独立作品。V7 迁移清理历史演示和测试记录，V8 补齐正式作品的评分、标签、排期和 OAD 封面；测试数据清理脚本见 [`cleanup-anime-test-data.ps1`](../sanye_deploy/cleanup-anime-test-data.ps1)。

### 2.2 sanye_anime 扩展表（V1 预留，暂未启用）

| 表 | 说明 | 状态 |
| --- | --- | --- |
| sanye_anime_alias | 别名 (anime_id, alias) 唯一 | 预留 |
| sanye_anime_tag | 标签 (anime_id, tag) 复合主键 | 预留（当前用 tags_json） |
| sanye_anime_schedule | 排期明细 | 预留（当前由 update_text 推导） |
| sanye_anime_banner | Banner | 预留 |

### 2.3 sanye_anime.sanye_legal_document（官网法律正文）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| doc_key | varchar(32) | PK | privacy/terms/copyright/contact |
| title | varchar(100) | NOT NULL | 标题 |

### 2.4 sanye_anime.sanye_anime_episode（剧集媒体元数据）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigint | PK，`bigserial` | 媒体元数据编号 |
| anime_id | bigint | NOT NULL，FK `sanye_anime.id` | 所属作品 |
| episode_no | int | NOT NULL | 作品内剧集序号 |
| title | varchar(255) | NOT NULL | 剧集显示标题 |
| source_page_url | varchar(2048) | NOT NULL | 授权来源页面地址 |
| playback_url | varchar(2048) | NOT NULL | 外部播放器地址，不由本服务代理 |
| mime_type | varchar(100) | NOT NULL | `text/html` 或 `video/*` |
| source_label | varchar(100) | | 来源说明 |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() | 审计时间 |

约束：`(anime_id, episode_no)` 和 `(anime_id, source_page_url)` 唯一；V5 迁移新增媒体表，V6 迁移新增作品来源和封面字段。
| content | text | NOT NULL | 正文（空行分段） |
| status | varchar(16) | NOT NULL DEFAULT '草稿' | 草稿/已发布 |
| updated_by | varchar(64) | | 更新人（X-Caller-Name） |
| updated_at | timestamptz | NOT NULL DEFAULT now() | 更新时间 |

公开接口只读已发布版本（V2 种子 4 篇）。

### 2.4 sanye_ai_chat（AI 对话）

#### sanye_conversation（会话）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigint | PK，序列 | 会话 ID |
| owner_key | varchar(64) | NOT NULL | device:xxx / user:xxx |
| title | varchar(50) | | 标题 |
| status | varchar(16) | NOT NULL DEFAULT 'ACTIVE' | ACTIVE/ARCHIVED/DELETED |
| spoiler_mode | varchar(8) | NOT NULL DEFAULT 'SAFE' | SAFE/ALLOW |
| context_anime_id | bigint | | 作品上下文 |
| created_at / updated_at | timestamptz | | 时间戳 |

索引：`idx_sanye_conversation_user (owner_key, updated_at desc)`。

#### sanye_conversation_message（消息）

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| id | bigint | PK，序列 | 消息 ID |
| conversation_id | bigint | NOT NULL | 会话 |
| client_message_id | varchar(64) | 幂等键 | 唯一 (conversation_id, client_message_id) |
| role | varchar(8) | NOT NULL | USER/ASSISTANT/SYSTEM |
| content | text | NOT NULL | 内容 |
| status | varchar(16) | NOT NULL DEFAULT 'PENDING' | PENDING/COMPLETED/FAILED/STOPPED |
| model | varchar(64) | | 模型名 |
| generate_try | int | NOT NULL DEFAULT 1 | 重试次数 |
| recommend_json | jsonb | | 推荐卡片 |
| created_at | timestamptz | | 时间戳 |

#### 其他表

| 表 | 说明 |
| --- | --- |
| sanye_ai_chat_memory | AI 会话记忆（memory_id/role/content，索引 (memory_id, id)） |
| sanye_ai_preference | 设备/用户 AI 偏好（owner_key PK，temperature/context_length/model_name） |
| sanye_ai_quota_log | 额度流水（request_id 唯一） |
| sanye_ai_usage | 模型用量/token/成本（预留） |

### 2.5 sanye_favorite（收藏与历史）

| 表 | 字段要点 | 约束 |
| --- | --- | --- |
| sanye_user_favorite | owner_key, anime_id, created_at | PK (owner_key, anime_id) |
| sanye_user_watch_history | id, owner_key, anime_id, last_view_at | UNIQUE (owner_key, anime_id) |

V2 迁移完成设备级过渡：`user_id` 可为空，`owner_key` 成为隔离维度（CAS 接入后迁移用户维度）。

### 2.6 sanye_feedback（反馈）

| 表 | 字段要点 | 说明 |
| --- | --- | --- |
| sanye_feedback | id, device_key, user_id, type, content, contact, status, priority | 状态：OPEN/PROCESSING/CLOSED（代码映射待处理/处理中/已关闭） |
| sanye_feedback_handle_log | feedback_id, operator_id, action, note | 处理日志 |

V2：device_key、contact 列 + id 序列。

### 2.7 sanye_file（文件）

| 表 | 字段要点 | 说明 |
| --- | --- | --- |
| sanye_file_object | bucket, object_key(UNIQUE), original_name, content_type, size_bytes, sha256, scan_status, owner_user_id, status | 元数据；文件内容在磁盘 `FILE_STORAGE_DIR` |

### 2.8 sanye_auth（账户）

| 表 | 说明 |
| --- | --- |
| sanye_user_account | 账户（username 唯一、password_hash、status） |
| sanye_user_auth | 第三方认证（auth_type + cas_user_id 唯一，refresh_token_id） |

CAS 接入后使用；当前匿名链路不写账户表。

### 2.9 sanye_job / sanye_search

| 表 | 说明 |
| --- | --- |
| sanye_job_record | 任务执行记录（job_name/job_key/status/detail，索引 (status, run_at desc)） |
| sanye_search_sync_record | 索引同步记录（anime_id/status，索引 status） |

### 2.10 sanye_event_outbox（各服务通用）

| 字段 | 说明 |
| --- | --- |
| event_id (unique) / event_type / aggregate_id | 事件标识 |
| payload (jsonb) | 事件载荷（只传业务 ID 与必要字段） |
| status / retry_count / next_retry_at / published_at | 投递状态机（PENDING → PUBLISHED） |

### 2.11 sanye_admin（RuoYi 独立库）

RuoYi 系统表（`sanye_sys_*`：user/role/menu/dept/post/dict/job/log 等）由
[sanye_admin_schema.sql](../sanye_admin_server/sql/sanye_admin_schema.sql) 与
[quartz.sql](../sanye_admin_server/sql/quartz.sql) 初始化；菜单种子 1061-1067 见 schema 文件。
PG 适配要点：残留 MySQL `key` 子句修复、Quartz 布尔列改为 boolean、序列 setval。

## 3. 迁移管理

- Flyway（`spring.flyway.schemas` 指向各服务 schema，`create-schemas=true`）。
- 迁移文件必须向前兼容、可重复执行（`if not exists` / `on conflict do nothing`）。
- 禁止修改已应用迁移文件（会触发 checksum 校验失败）；变更必须新增 V{n+1}。
- 历史教训（已修复）：V3 早期版本在种子前 setval 导致序列停在 1 → 新增 V4 修复；
  运行库脏记录需按顺序清理后重跑（V3/V4 幂等）。

当前迁移清单：

| 服务 | 迁移 |
| --- | --- |
| anime | V1 init、V2 legal_document、V3 catalog_persistence（列+种子+序列）、V4 fix_anime_id_seq、V5 anime_episode、V6 anime_source_cover、V7 remove_demo_test_catalog、V8 normalize_official_catalog_metadata、V9 import_lookup_indexes |
| ai-chat | V1 init、V2 memory、V3 role_width、V4 conversation_persistence、V5 role_width、V6 client_key_nullable、V7 ai_preference |
| favorite | V1 init、V2 device_owner_transition |
| feedback | V1 init、V2 feedback_device_and_seq |
| file | V1 init、V2 file_object_id_seq |
| auth / job / search | V1 init |

## 4. 数据关系（ER 摘要）

```text
sanye_user_account 1─N sanye_user_auth

sanye_anime 1─N sanye_conversation（context_anime_id）
sanye_anime 1─N sanye_user_favorite / sanye_user_watch_history（anime_id）
sanye_anime 1─N sanye_search_sync_record
sanye_anime 1─N sanye_anime_episode（媒体元数据）

sanye_conversation 1─N sanye_conversation_message
sanye_conversation 1─1 sanye_ai_chat_memory（memory_id = conversation_id）

sanye_feedback 1─N sanye_feedback_handle_log
sanye_file_object 1─1 磁盘文件（object_key 定位）
```

跨服务不建外键（服务自治），一致性由调用方保证 + 回源校验（如推荐卡片、收藏作品存在性）。

## 5. 数据生命周期

| 阶段 | 规则 |
| --- | --- |
| 备份 | `sanye_deploy/backup-local.ps1`：pg_dump 自定义格式、时间戳文件、保留最近 N 份；恢复步骤见 ops-runbook |
| 归档 | 会话/消息/额度流水按保留策略归档（策略待定，登记 gap-register） |
| 清理 | 软删除（deleted_at）；反馈关闭后保留审计 |
| 导出/删除 | 用户数据导出与删除入口在客户端设置（产品 P0，接口待接入） |

## 6. SQL 规范

- 一律参数化（JdbcTemplate 占位符 / MyBatis 绑定），禁止字符串拼接。
- 表名/列名使用小写下划线，前缀 `sanye_`。
- 时间统一 `timestamptz`；状态字段用短字符串常量（公开映射中文标签）。
- 中文写入以 UTF-8 SQL 文件执行（PowerShell 直传中文易乱码）。
- 迁移幂等优先；正式数据变更先备份后执行。
- V9 只新增部分索引；需要回滚时先确认没有长事务，再执行 `drop index if exists sanye_anime.idx_sanye_anime_source_active; drop index if exists sanye_anime.idx_sanye_anime_title_active;`，不删除作品数据。

## 7. 账号与连接

| 用途 | 账号 | 说明 |
| --- | --- | --- |
| 本地联调 | sanye / 123456（5433） | 仅本地；初始化角色/库由 run-local.ps1 自动完成 |
| 正式环境 | 环境变量注入（DB_USERNAME/DB_PASSWORD） | 最小权限账号；口令不入库，见 environment-config |

## 更新记录

2026-09-09，v1.5：登记事件迁移、事务与租约、消费者版本、回滚边界；证据为 ReliableEventPersistenceIT 和真实链路验收脚本。

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v1.0 | 建立数据库设计基线：schema 划分、表字典、迁移清单、ER、生命周期、SQL 规范 | 企业级文档完善 |
| 2026-08-21 | v1.1 | 增加剧集媒体元数据表和 V5 迁移说明 | 媒体导入评审与实现设计 |
| 2026-08-25 | v1.4 | 登记 V9 导入查重索引、完整 anime 迁移清单和索引回滚方式 | `V9__import_lookup_indexes.sql`、anime 76 项单元测试 |
