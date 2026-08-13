# RuoYi 管理后端接入说明

| 项目 | 内容 |
| --- | --- |
| 适用范围 | `sanye_admin_server` 管理平台后端 |
| 当前状态 | 已完成模块接入和可构建验证，运行时联调待完成 |
| 更新时间 | 2026-08-12 |

## 1. 接入边界

管理平台后端独立放置在 `sanye_admin_server/`，业务后端继续放置在 `sanye_server/`。两者不共用启动类，不把管理权限代码混入业务后端。

管理平台前端位于 `sanye_admin/`。当前前端仍是 Vue 3 + Element Plus 页面原型，后续再绑定本管理后端的登录、菜单、用户、内容和反馈接口。

## 2. 已接入模块

| 模块 | 目录 | 职责 |
| --- | --- | --- |
| `sanye_admin_app` | `sanye_admin_app/` | Spring Boot 启动入口和 Web 控制器 |
| `sanye_admin_common` | `sanye_admin_common/` | 通用实体、常量、响应、工具和 Redis 能力 |
| `sanye_admin_framework` | `sanye_admin_framework/` | 安全、Token、数据源、MyBatis、日志和 Web 配置 |
| `sanye_admin_system` | `sanye_admin_system/` | 用户、角色、菜单、部门、字典、公告和系统配置 |
| `sanye_admin_quartz` | `sanye_admin_quartz/` | 管理平台任务、Quartz 调度和任务日志 |
| `sanye_admin_generator` | `sanye_admin_generator/` | 代码生成和 PostgreSQL 元数据读取 |

Java 包名统一为 `com.sanye.admin`，启动类为 `com.sanye.admin.SanyeAdminServerApplication`。

## 3. 数据库适配

管理后端使用 PostgreSQL，正式初始化脚本为：

- `sanye_admin_server/sql/sanye_admin_schema.sql`
- `sanye_admin_server/sql/sanye_admin_quartz_schema.sql`

脚本已经完成以下适配：

- 管理表统一使用 `sanye_` 前缀。
- MySQL 时间函数改为 `CURRENT_TIMESTAMP`。
- MySQL 空值函数改为 PostgreSQL `coalesce`。
- 公告内容由 `longblob` 改为 `text`。
- 公告已读批量写入改为 PostgreSQL `ON CONFLICT DO NOTHING`。
- 固定 ID 种子数据导入后同步 identity 序列。
- 代码生成器改用 PostgreSQL `information_schema` 和 `pg_catalog` 能力读取表、字段、注释及自增信息。
- 代码生成模板改为写入 `sanye_sys_menu`，并使用 PostgreSQL `WITH ... RETURNING` 获取父菜单 ID。

`ry_20260417.sql` 和 `quartz.sql` 只作为 RuoYi 上游 MySQL 参考，不应在 PostgreSQL 数据库中执行。

## 4. Quartz 配置

管理后端通过 `spring-boot-starter-quartz` 提供 `Scheduler` Bean，配置位于：

`sanye_admin_server/sanye_admin_app/src/main/resources/application.yml`

当前使用 JDBC JobStore、PostgreSQL delegate 和 `sanye_qrtz_` 表前缀。Quartz 表不会自动初始化，必须先执行 `sanye_admin_quartz_schema.sql`。

## 5. 构建验证

在管理后端目录执行：

```powershell
$env:JAVA_HOME='C:\Users\10121\.jdks\microsoft-jdk-21.0.12'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn clean package -DskipTests=true
```

2026-08-12 已验证结果：

- Java 21 可用。
- 7 个 Maven 模块全部构建成功。
- 管理应用已生成可执行 Spring Boot JAR。
- Mapper XML 静态解析通过。

## 6. 尚未完成的验收

以下项目不能由 Maven 构建结果替代：

- PostgreSQL 和 Redis 实例真实启动。
- 初始化脚本在目标 PostgreSQL 版本上完整执行。
- 管理员登录、Token、角色授权和动态菜单路由。
- 管理前端 `sanye_admin` 的接口绑定。
- Quartz 任务新增、暂停、恢复、执行和日志记录。
- 管理平台与 `sanye_server` 业务数据的受控协作。
- Druid、Token、数据库和 Redis 生产凭据安全配置。

## 7. 下一步顺序

1. 启动 PostgreSQL 和 Redis，创建独立的 `sanye_admin` 数据库。
2. 执行两个 PostgreSQL 初始化脚本并校验表、种子用户和 identity 序列。
3. 启动 `sanye_admin_server`，完成管理员登录和权限接口验收。
4. 将 `sanye_admin` 前端请求地址绑定到管理后端。
5. 补充动漫内容、AI 反馈和用户反馈的管理业务接口。
6. 再接入 Docker Compose、CI 和发布回滚流程。
