# 架构视图

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 文档状态 | 基线 |
| 更新时间 | 2026-08-26 |

当前架构由三个产品入口和两个后端工程组成：

```text
sanye_client (客户端 + official) ─┐
sanye_admin (RuoYi 前端)          ├─> 网关 / 业务服务 / 中间件
sanye_pet (Electron 附属形态) ────┘
                                   └─> sanye_admin_server（管理后端独立链路）
```

模块依赖、端口和环境变量以 `docs/technical-architecture.md`、`docs/environment-config.md` 为唯一事实源。
