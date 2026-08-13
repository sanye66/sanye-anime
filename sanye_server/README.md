# sanye_server

这是项目的 Spring 服务端工程，负责账户、动漫内容、搜索、AI 对话、文件、反馈和定时任务。

## 工程定位

- 框架：Spring Boot、Spring Cloud Alibaba。
- 运行形态：MVP 采用模块化单体，模块先在一个 Spring 应用中协作。
- 基础设施边界：Nacos、Sentinel、RabbitMQ、PostgreSQL、Elasticsearch、Redis、MinIO 和 XXL-JOB。
- Java 包根：`com.sanye.anime`。
- 应用入口：`com.sanye.anime.SanyeServerApplication`。

## 目录结构

```text
sanye_server/
├── pom.xml
└── src/
    └── main/
        ├── java/com/sanye/anime/
        │   ├── SanyeServerApplication.java
        │   ├── sanye_core/
        │   ├── sanye_auth/
        │   ├── sanye_anime/
        │   ├── sanye_search/
        │   ├── sanye_ai_chat/
        │   ├── sanye_file/
        │   ├── sanye_feedback/
        │   └── sanye_job/
        └── resources/application.yml
```

模块目录当前使用 `package-info.java` 固定边界，业务代码按“表示层、应用层、领域层、基础设施层”逐步补入对应模块。不要因为目录已经存在就直接拆成多个独立微服务。

## 常用命令

```bash
mvn spring-boot:run
mvn test
mvn package
```

默认端口为 `8080`。Nacos 注册与配置默认关闭，连接外部基础设施前通过环境变量显式开启；凭证只从环境变量或外部配置注入。

## 当前状态

- Spring Boot 启动类、Maven 构建入口、模块包骨架和内存 MVP 接口已经建立。
- 当前接口覆盖作品、搜索、AI 会话、收藏、反馈和管理端状态操作。
- 业务数据持久化、数据库迁移、正式认证、AI 供应商和基础设施联动尚未实现，具体限制见 [../docs/backend-mvp.md](../docs/backend-mvp.md)。
- Nacos、Sentinel、RabbitMQ、PostgreSQL、Elasticsearch、Redis、MinIO 和 XXL-JOB 的版本与验证门禁见 [../docs/version-baseline.md](../docs/version-baseline.md) 和 [../docs/gap-register.md](../docs/gap-register.md)。
