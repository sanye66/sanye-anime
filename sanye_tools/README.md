# 一键操作脚本

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.1 |
| 文档状态 | 基线 |
| 关联文档 | [本地桌面运行与打包](../docs/local-desktop.md) |
| 更新时间 | 2026-09-16 |

## 双击入口

在资源管理器中双击 `01-一键打包免安装版.cmd` 即可。窗口结束后会保留结果，按任意键关闭；失败时显示错误并返回非零退出码。脚本自动定位仓库，不依赖当前工作目录。

| 脚本 | 操作 |
| --- | --- |
| `01-一键打包免安装版.cmd` | 从当前源码构建完整免安装包，完成校验后自动打开输出目录 |

本目录只保留免安装压缩包构建入口；其他开发、测试和检查脚本不作为双击入口。

## 免安装打包

默认输出为 `sanye_desktop/dist/portable-packages/`，每次使用独立时间编号生成 ZIP 和同名 `.report.json`，不再单独生成或向桌面复制 `.sha256` 文件。逐文件校验继续执行，ZIP 摘要保留在构建报告中。解压目录保留在 `sanye_desktop/dist/portable-时间编号/win-unpacked/`，旧包不会被覆盖。失败归档保留为 `.incomplete`，不会冒充成功 ZIP。构建日志位于 `sanye_deploy/.local/tool-logs/`。

流程依次为：锁定构建避免重复运行、安装锁定依赖、校验并暂存固定种子和封面、前端类型检查与桌面构建、三个 Java 服务打包、准备 Java/PostgreSQL 运行时、桌面测试、写入并比对 EXE 图标、无窗口启动预检、压缩并逐文件核对摘要。Java 构建使用 `-DskipTests`；桌面测试不等同于后端全量测试。

构建机需安装 PowerShell 7，并具备项目基线工具链 Node.js 26.5.0、pnpm 10.15.0、Java 21.0.12、Maven 3.9.16。Java 使用现有 `use-local-toolchain.ps1` 选择的 `%USERPROFILE%/.jdks/microsoft-jdk-21.0.12`。PostgreSQL 默认目录为 `C:/Program Files/PostgreSQL/18`，可通过 `SANYE_DESKTOP_PG_HOME` 指定。首次安装依赖或缺少 Maven 缓存时需要网络。

默认复用 `sanye_desktop/runtime/seed-manifest.json` 所列的固定种子和封面，逐项验证后暂存，再重新准备运行时。新检出环境需要维护者提供带有 `manifest.json`、`seed.sql` 及封面的固定资源目录，通过 `SANYE_DESKTOP_SEED_BUNDLE` 指定；缺失或校验失败时停止，不自动读取本地业务数据库。不要设置安装器签名变量 `CSC_LINK`、`WIN_CSC_LINK`。

命令行可自定义输出目录，或关闭自动打开资源管理器：

```powershell
pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -OutputDirectory D:/sanye_packages -NoOpen
```

本地免安装包没有可信发布签名；自动检查不能代替可见窗口、真实播放、跨电脑和系统策略验收。

## 更新记录

2026-09-16，v1.1，按用户要求取消独立 `.sha256` 文件，保留内部校验和报告摘要。验证为 PowerShell 语法解析与 `pnpm docs:check`；本次未重新构建客户端或清理历史产物。

2026-09-16，v1.0，新增统一双击入口和完整免安装打包流水线。验证命令与本轮构建报告登记在[桌面运行文档](../docs/local-desktop.md)。
