# 独立环境备份与恢复

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.2 |
| 文档状态 | 基线 |
| 关联文档 | [环境配置矩阵](./environment-config.md)、[开发任务清单](./development-tasks.md)、[运维手册](./ops-runbook.md) |
| 更新时间 | 2026-09-10 |

本文是 T-R-04 的操作说明，任务完成状态与本轮实测结果以开发任务清单为准。

## 当前证据适用范围（2026-09-10）

T-R-04 的 31 项通过属于报告 `8a74d86bd5c3` 的合成隔离演练。本次摘要复核发现恢复核心脚本仍一致，但演练脚本及四个运行 JAR 已变化，最新产物未重跑真实恢复；不能将旧报告用作当前候选恢复证明。详细核对见[当前审计](./current-status-audit.md)。

更新记录：2026-09-10，v1.2，补充演练快照与当前产物差异，保留原操作流程与非覆盖恢复边界。

## 1. 备份范围

- 业务数据库与管理数据库分别使用 PostgreSQL 自定义格式整库导出，包含表结构、数据、序列及库内已有的 Flyway 历史。不得把管理初始化 SQL 当作恢复脚本执行。
- 显式列入配置的 MinIO 桶保存当前对象内容、对象键、内容类型（含参数）、缓存与下载响应头、自定义元数据、对象标签、大小和 SHA-256；使用锁定版本的 MinIO 官方 SDK 读取、写入并回读验证。对象版本历史、桶策略、生命周期、访问密钥和服务端权限仍由目标环境管理；带服务端加密或对象 ACL 配置的对象明确拒绝，不能静默丢弃相关策略。
- 同时备份 `FILE_STORAGE_DIR` 的完整文件树。当前文件服务从本地目录读取，MinIO 不能替代这一份运行数据。
- 所有活动文件元数据都必须对应本地文件，大小和摘要必须一致；属于已配置 MinIO 桶的活动文件还必须有对应的 MinIO 对象。仅存本地的上传文件允许不属于 MinIO 桶。
- 备份清单逐表记录行数与内容指纹，直接查询 PostgreSQL 系统目录逐序列记录状态（含 identity 序列），并记录数据库编码和排序规则。当前支持使用 `libc` 排序规则的 PostgreSQL 数据库；目标必须安装兼容排序规则。

备份不包含数据库集群角色、原始所有者或 ACL。目标数据库对象归恢复账号所有，应用账号权限须按目标环境配置。Redis 缓存与登录会话、RabbitMQ 队列、搜索索引、XXL-JOB 调度台数据库及外部 CAS 不在本项备份范围；恢复应用前按独立环境规划配置这些依赖，禁止直接启动消费者访问原环境。

## 2. 准备配置

配置结构见 [recovery.example.json](../sanye_deploy/recovery.example.json)，字段与凭据注入以 [环境配置矩阵](./environment-config.md#独立恢复配置) 为唯一基准。实际配置放入被 Git 忽略的 `sanye_deploy/.local/`，配置仅保存环境变量名称，真实凭据由受控环境注入。

开始前暂停源数据库、对象存储和本地文件的全部写入者，包括管理操作、上传、事件消费者和调度任务。确认静默后设置 `quiesced=true`，保持到备份结束。脚本重复核对表数据、序列、对象清单和文件摘要以发现变化，但该检查不能替代跨数据面的停写窗口，也不提供在线增量备份或时间点恢复。

`postgres.tools` 的 `psql`、`dump`、`restore` 接受 `command` 和可选的 `args` 数组。可指定本机绝对工具路径；也可指定 Docker 的 `exec -i` 前缀，后接容器名与工具名。使用 Docker 时需要把 PostgreSQL 的 `PGHOST`、`PGPORT`、`PGUSER`、`PGPASSWORD`、`PGCONNECT_TIMEOUT`、`PGOPTIONS` 以 `-e 变量名` 传入，不得把凭据值拼进命令参数。恢复所用工具必须位于目标或独立工具环境，不能依赖已故障的源容器。

先执行 `pnpm install --frozen-lockfile` 安装根工作区锁定的 `minio` SDK；MinIO 不再依赖 `mc` 命令或源容器，通过配置的源/目标 API 地址直接连接，凭据只在当前进程内传给 SDK。网络请求有空闲和总时限，服务不可用时本轮操作明确失败，不无限重试。V2 清单保存对象属性、标签及 identity 序列状态；V1 清单仍可只读校验，但缺少这些证据，完整恢复前必须重新生成 V2 备份，脚本会在写目标前明确拒绝 V1。

`pg_dump` 不得低于源数据库主版本，`pg_restore` 必须能读取该格式，建议三者使用相同主版本。备份记录工具版本，恢复先执行归档目录校验。不得把高版本导出能被低版本服务器恢复视为默认保证。

## 3. 执行顺序

从仓库根目录执行，示例目录均需替换为本次已确认的新目录：

```powershell
node sanye_deploy/recovery.mjs backup sanye_deploy/.local/recovery.json sanye_deploy/backups/本次备份
node sanye_deploy/recovery.mjs verify sanye_deploy/.local/recovery.json sanye_deploy/backups/本次备份
node sanye_deploy/recovery.mjs restore sanye_deploy/.local/recovery.json sanye_deploy/backups/本次备份
```

PowerShell 入口分别为 `backup-local.ps1 -Config <配置路径> -OutputDirectory <新目录>` 与 `restore-local.ps1 -Config <配置路径> -BackupDirectory <备份目录>`，可通过 `NodePath` 指定 Node.js。旧版无参数单库备份入口已替换，不再自动清理历史备份。

只有同时具备 `COMPLETE`、有效 `manifest.json` 及 `manifest.sha256`，且所有文件摘要均通过的备份才可恢复。`STARTED` 只表示备份启动；没有 `COMPLETE` 的目录是未完成现场。摘要用于检测损坏，不能替代可信存储、访问控制或数字签名。

恢复在写入前检查所有目标：目标数据库名和桶名不能与源清单重叠；目标数据库、桶和本地目录必须不存在，即使已有目标为空也拒绝；本地目录通过真实路径与 Windows 大小写规范化比较，不得重叠或经过符号链接。保留设备名、尾部点或空格等不兼容文件名也拒绝。归档损坏、空对象、对象缺失、元数据摘要不符、路径越界或桶映射冲突均导致失败。

恢复依次创建新库、导入数据、比较全部表和序列、创建新桶并回读对象校验、恢复本地文件，然后统一更新文件元数据与本地目录的桶名映射，再验证映射后的元数据与运行文件。数据库每次导入使用单事务；跨数据库、对象存储与文件系统没有分布式事务，后续步骤失败时已创建的专用目标会保留。不要在同一目标上直接重跑；先检查报告，再准备另一组新目标。脚本不删除数据库、桶、文件或历史备份。

## 4. 应用验收与恢复指标

数据恢复报告中的 `restored-and-verified` 只表示数据校验通过，`applicationAcceptance=pending` 提醒仍须启动指向目标库和目标目录的应用。至少验证管理登录与账号信息、已发布内容读取、授权文件下载及其 SHA-256，同时验证匿名和非所有者文件请求被拒绝。真实 CAS 在本轮排除范围内，不将管理登录或受控身份令牌写成真实 CAS 验收。

| 指标 | 口径 |
| --- | --- |
| 备份时间与耗时 | `startedAt`、`completedAt`、`durationMs`，包含源数据复核 |
| 备份年龄 | `backupAgeAtRestoreStartMs`，从备份开始到恢复启动的保守时间间隔；不是周期备份承诺 |
| 数据恢复耗时 | `dataRestoreMs`，包含备份预检、数据导入及摘要校验 |
| 演练 RPO | 模拟故障时间减去备份一致性时间；源数据持续停写的合成演练另外验证记录无丢失 |
| 演练 RTO | 恢复启动到目标应用登录、内容、文件及权限验收全部通过；包含服务启动时间 |

本轮可重复验证入口：

```powershell
pnpm test:recovery
node sanye_deploy/verify-recovery-live.mjs
pnpm docs:check
```

真实演练使用本机已有镜像新建专用 PostgreSQL、MinIO 和 Redis 容器及随机测试凭据；八个业务 schema 通过真实 Flyway 初始化、校验并重复迁移，备份包含迁移历史。演练保留 `update_text=null` 的作品，停掉源数据库和源 MinIO 后从备份恢复，目标应用保持 Flyway 开启，再验证详情、筛选、登录、文件、权限和对象属性。负例必须匹配预期错误，不能因任意异常就记作通过。

应用只监听回环地址；Java 与工具进程通过有时限的进程树终止流程清理，清理失败会把总报告置为失败。运行结束保留备份、数据和脱敏报告供复核，不接触原业务容器。运行前执行 Java 21 下的 `mvn -f sanye_server/pom.xml -pl sanye-server-anime,sanye-server-file,sanye-server-gateway -am package` 和 `mvn -f sanye_admin_server/pom.xml package`，编译当前运行 JAR 与恢复迁移夹具。脚本默认使用 PATH 中的 `java`，可通过 `SANYE_RECOVERY_JAVA`、`SANYE_RECOVERY_PSQL` 指定绝对工具路径。报告在 `sanye_deploy/.local/tr04/`，包含脚本与运行 JAR 摘要，不提交数据库、文件对象或凭据。

## 5. 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-09-10 | v1.0 | 建立独立目标恢复流程、完整性校验、非覆盖规则与指标口径 | `recovery.mjs`、`recovery.test.mjs`；本轮结果见 T-R-04 |
| 2026-09-10 | v1.1 | 修正 Windows 路径、进程清理、对象属性与 identity 序列校验；增加源服务离线、空值作品、真实 Flyway 和失败现场验收 | 最终修正复验见开发任务清单 T-R-04 |
