# 本地桌面运行与打包

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.2 |
| 文档状态 | 基线 |
| 关联文档 | [开发任务清单](./development-tasks.md)、[环境配置](./environment-config.md) |
| 更新时间 | 2026-09-10 |

## 运行结构

`sanye_desktop` 是 `sanye_client` 的 Windows 分发入口，复用既有 Spring 业务模块，不替代三个核心工程。本次采用本机服务运行方式，不部署远程服务器。登录、AI、桌宠及依赖登录的管理、文件上传和反馈审核不属于本次启动集。

安装目录包含 Electron、Java 21、PostgreSQL 18、作品/搜索/收藏三个业务 JAR 和客户端静态资源。桌面入口提供受控本机代理，仅暴露公开目录、搜索、白名单来源导入、设备收藏和历史接口；内部管理接口不转发。接口使用本机会话 Cookie，拒绝外部来源请求并清理用户身份与内部令牌请求头。

页面固定监听 `127.0.0.1:28710`，冲突时失败并提示日志，不占用其他进程端口。数据库与三个业务服务使用动态本机端口。默认数据目录为 Electron 用户目录下的 `local-services`，与安装目录、开发数据库分开。首次启动生成数据库密码，执行 Flyway 后导入六部固定推荐及其剧集元数据；后续启动保留数据，不覆盖用户修改。测试可通过绝对路径参数 `--sanye-data-dir=` 隔离整个用户目录。

本机搜索通过已有作品目录查询路径执行，不连接 ES；首页缓存、RabbitMQ 消费/发布和服务发现关闭。本次不会启动 Redis、ES、RabbitMQ、Nacos、XXL-JOB、CAS、AI 或桌宠。退出按本次持有的进程句柄停止 Java，使用 PostgreSQL 快速关闭完成数据库刷盘，不按端口杀进程。

## 构建入口

在 Windows 项目根目录执行：

```powershell
. ./sanye_deploy/use-local-toolchain.ps1
pnpm install --frozen-lockfile
mvn -q -f sanye_server/pom.xml -pl sanye-server-anime,sanye-server-search,sanye-server-favorite -am package '-Djacoco.append=false'
pnpm --filter @sanye/sanye_client build:desktop
pnpm desktop:prepare
pnpm desktop:pack
```

`desktop:prepare` 从 `SANYE_DESKTOP_JAVA_HOME` 或 `JAVA_HOME` 读取 Java，从 `SANYE_DESKTOP_PG_HOME` 读取 PostgreSQL（缺省为本机 PostgreSQL 18 安装目录）。仅构建机需要这些工具，安装后的应用使用随包运行时。

固定推荐通过只读 SQL 从本机 `127.0.0.1` 的 `sanye_anime` 库抽取，缺省端口 `5433`、角色 `sanye`，可分别通过 `SANYE_DESKTOP_SOURCE_PORT`、`SANYE_DESKTOP_SOURCE_USER` 设置。认证沿用 PostgreSQL 受控客户端配置，不将密码写入命令或安装包。只抽取 ID `127,128,133,135,136,137` 的作品、剧集及其本地封面；不复制账号、收藏、历史、反馈或整库快照。缺失固定作品或封面时构建失败。上传封面目录可用 `SANYE_DESKTOP_COVER_ROOT` 指定。

准备目录 `sanye_desktop/runtime`、网页输出 `dist-desktop` 和安装包目录均已排除版本控制。Java 与 PostgreSQL 许可随运行时保留。当前安装包未配置代码签名；不宣称已完成签名或升级回滚验收。

## 验证边界

本次最终状态：本地服务改造和最新解包应用目录已生成，当前机器的最新 EXE 启动验收为 `blocked-external`。较早 NSIS 安装包曾构建成功；最新重建在运行安装工具时出现 `spawn UNKNOWN`，留下不完整产物，已改为 `.incomplete` 后缀，不可安装。Windows 对最新主程序的输出明确包含 `was blocked by your organization's Device Guard policy`；`Get-AuthenticodeSignature` 显示其为 `NotSigned`，当前用户证书库未找到代码签名证书。未修改系统安全策略，需接入符合该机器策略的签名流程后复验。

本次证据：

- Java 21 下相关业务模块及依赖的 Maven 测试打包退出码 0；`pnpm typecheck`、`pnpm build` 和桌面专用构建通过。
- `pnpm test:desktop` 两项代理专项通过；`pnpm docs:check` 866 项通过。
- 最终本地服务报告 `sanye_deploy/.local/desktop/7d750a91-7629-49e2-94ec-3f2600dc9c51/report.json` 记录八项检查，包括端口冲突保护、六部固定推荐、真实搜索、浏览器及重启持久化。
- 较早 EXE 报告 `sanye_deploy/.local/desktop-exe/fd38292a-3790-4fd1-8902-30fbbff43ba0/report.json` 记录首页、全部封面、详情和《你的名字》真实播放推进。该轮调试进程退出码为 `3221225477`，不能计作正常退出通过。随后改用正常退出流程并去除详情页 AI 入口；最新产物被 Device Guard 拦截，因此这两项最新 EXE 行为仍待复验。
- 当前改动范围的 `git diff --check` 通过；全工作区检查发现既有 `SysMenuMapper.xml` 尾随空格，未修改该无关文件。

### 启动与打包阻塞修复（2026-09-10）

系统 `Microsoft-Windows-CodeIntegrity/Operational` 的 3077 事件确认：16:31:49 拦截临时安装器，16:41:09 再次拦截现有主程序，策略标识为 `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`；伴随 3118 事件表明来源为 Smart App Control。当前用户及本机个人证书库均未发现代码签名证书。

`electron-builder` 原流程在签名前运行临时安装器来生成卸载程序，导致 `spawn UNKNOWN`。交付版本更新到 26.15.3，使用受锁文件管理的 `patches/app-builder-lib@26.15.3.patch` 和上游 `signIf` 接口，将临时安装器签名放在执行之前；签名失败直接终止。最终安装器与卸载程序继续使用原签名流程。升级依赖时须复核该补丁与回归测试。

默认 `pnpm desktop:pack` 和 `dist:signed` 统一调用 `build.cjs`，要求可信签名身份并强制签名，输出到 `sanye_desktop/dist/signed`。构建环境可注入 `CSC_LINK` 或 `WIN_CSC_LINK` 与对应密码，也可用 `SANYE_DESKTOP_CERT_SHA1` 选择 Windows 证书库身份。凭据不写入源码。`dist:unsigned` 仅保留为显式未签名构建入口，在当前机器上仍受策略阻止。

本轮 `pnpm test:desktop` 四项通过，覆盖签名缺失提前失败、临时安装器先签名后执行及原有两项代理检查。`pnpm desktop:pack` 实测在缺少签名身份时退出 1，未生成新安装包。现有 EXE 再次验证失败，报告为 `sanye_deploy/.local/desktop-exe/9defa2e2-1c55-4a29-ae07-c77f936af61c/report.json`，包含 EXE 与资源摘要、失败阶段和错误；不是本轮新源码的运行通过证据。

验收入口为 `pnpm desktop:verify-exe`，默认读取签名目录，可通过 `SANYE_DESKTOP_EXE` 指定绝对路径。启动失败也保存报告，退出等待最多 60 秒，应用清理失败以非零状态退出。当前状态仍为 `blocked-external`：须提供 Windows 信任的签名身份，再完成签名构建、最新 EXE 启动和正常退出验收；未修改安全策略。

`pnpm test:desktop` 检查代理路径、跨来源请求与身份头隔离；`node sanye_desktop/verify-live.cjs` 在全新专用目录验证真实数据库、三个服务、六部固定推荐、搜索、浏览器及重启后的收藏/历史；`node sanye_desktop/verify-exe.cjs` 检查实际打包 EXE、固定首页、封面、详情与播放状态。报告保存在 `sanye_deploy/.local/desktop/` 和 `desktop-exe/`。

视频来源仍在网络上，目录和 71 条剧集元数据不等于本地视频文件。实际来源能否播放须以运行报告为准，网络或上游来源失败不可写成播放通过。强制结束操作系统进程、停电恢复、另一台干净 Windows 的安装卸载及版本回滚需要另行验收。

更新记录：2026-09-10，v1.0，登记本地桌面结构、构建入口和受控验证边界；依据 `sanye_desktop` 实现和开发任务记录。

更新记录：2026-09-10，v1.1，修复临时安装器签名顺序、默认构建签名门禁、退出失败状态及验收报告；依据上述四项测试与当前系统阻断事件，可信签名及最新产物运行仍待环境。

更新记录：2026-09-10，v1.2，交付依赖审计发现旧打包链高危依赖，更新 `electron-builder` 到 26.15.3 并迁移签名补丁及回归夹具；固定同版本 Squirrel 对等依赖，防止锁文件保留旧打包链。CI 增加 `pnpm test:desktop`；检查入口还包括 `pnpm audit --audit-level high`。可信签名和目标系统安装验收继续待环境。
