# 数据库设计视图

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 草案 |
| 更新时间 | 2026-08-26 |

服务数据库以 PostgreSQL 为主，Redis、Elasticsearch、RabbitMQ、MinIO、Nacos 和 XXL-JOB 属于运行基础设施。每个服务的迁移必须可重复判断、记录版本并有回滚说明；管理端库与业务库隔离。

不要将本地开发默认密码或真实生产连接写入设计文档；环境参数集中维护在 `docs/environment-config.md`。
