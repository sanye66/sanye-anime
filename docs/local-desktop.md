# 本地桌面运行与打包

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.48 |
| 文档状态 | 基线 |
| 关联文档 | [开发任务清单](./development-tasks.md)、[环境配置](./environment-config.md) |
| 更新时间 | 2026-09-21 |

更新记录：2026-09-21，v1.48，把桌面打包链的签名补丁从 `electron-builder` 26.0.12 平移到 26.15.3：26.0.12 依赖的 `app-builder-lib <26.15.0` 及 `tar`、`builder-util-runtime` 存在 high/critical 告警，无法通过 `pnpm audit --audit-level high`；改为 `electron-builder` 26.15.3 与 `patches/app-builder-lib@26.15.3.patch`（同一处代码由 `packager.sign` 变为 26.15.x 的 `packager.signIf`），保持临时安装器先签名后执行的既有行为。依据 `sanye_desktop/package.json`、`package.json`、`pnpm-lock.yaml`、`pnpm audit --audit-level high`（0 high/critical）与 `pnpm test:desktop`（40 项，39 通过 1 跳过）。

## 接收方非英文路径数据库启动修复（2026-09-20）

更新记录：2026-09-20，v1.46，按接收方再次出现的“本地数据库离线配置失败（0x00000001）：could not locate my own executable path”，改为把随包 PostgreSQL 运行库镜像到纯英文目录，取代 v1.36 的 8.3 短路径方案。

更新记录：2026-09-20，v1.47，按用户要求对当前交付包 `20260920-143138-510` 重做本机隔离环境验收：`node sanye_desktop/verify-first-run.cjs "<桌面解压目录>/三叶动漫.exe"` 在非英文数据目录（报告 `sanye_deploy/.local/first-run-09YxwJ/report.json`）与英文数据目录（另设 `SANYE_FIRST_RUN_DATA_NAME`，报告 `sanye_deploy/.local/first-run-9V3qr7/report.json`）两条分支的首次启动、重启、进程与模块来源、回环监听及非空窗口截图全部通过，分别覆盖“运行库镜像 + 数据目录镜像”和“运行库镜像 + 数据目录就地使用”。本轮只增加本机隔离验收证据，未改动已交付产物。

- 故障路径：PostgreSQL 在 `postmaster.getInstallationPaths()` 里用 `argv[0]` 校验自身可执行文件。软件目录或用户数据目录含非英文字符时，`D:\三叶动漫免安装\win-unpacked\resources\runtime\postgres\bin\postgres.exe` 这类路径会以 `FATAL: <路径>: could not locate my own executable path` 退出，退出码 1，界面显示 `0x00000001`，且发生在单用户离线配置阶段。v1.36 依赖 `cmd /c for %I in (...) do @echo %~sI` 取 8.3 短名，但现代 Windows 对非系统卷默认关闭 8.3 名称生成，接收方在 `D:` 盘拿不到短名而回退到原中文路径，因此没有修复；`cmd.exe` 的编码转换还可能把路径字符替换成 `?`。
- 现行方案：`sanye_desktop/postgresTemplate.cjs` 的 `preparePostgresLayout()` 在需要时把随包 `postgres` 运行库镜像到纯英文目录，并把数据目录、种子文件和 PostgreSQL 进程的工作目录一起切换过去；`sanye_desktop/runtime.cjs` 不再调用 `cmd.exe`，`postgres.exe`、`pg_ctl.exe`、`pg_isready.exe`、`psql.exe` 及其全部参数都只使用英文路径。
- ASCII 目录优先级为 `SANYE_DESKTOP_ASCII_ROOT`、`%LOCALAPPDATA%\sanye_anime`、`%APPDATA%\sanye_anime`、`%ProgramData%\sanye_anime`、`%PUBLIC%\sanye_anime`、`%SystemDrive%\sanye_anime`；每一项都要求纯英文绝对路径且可创建可写，失败时顺延并在全部失败后给出“解压到纯英文路径”的明确提示。运行库镜像位于 `<候选根>\users\<用户数据目录摘要>\postgres-<postgres.exe 摘要前 16 位>`，数据目录位于同级 `data\postgres`，服务日志目录不变。
- 同一卷内镜像优先使用硬链接，跨卷或文件系统不支持链接时回退为普通复制；首次复制用逐文件摘要校验，之后每次启动用文件清单和 `postgres.exe` 摘要确认镜像完整，缺失或截断时重新镜像。
- 非英文用户数据目录在首次启动时迁移一次已有数据库：同卷直接改名，跨卷复制并校验后保留原目录作为副本；目录存在但不是 PostgreSQL 集群时保留原目录并报错，不覆盖用户数据。软件目录与数据目录都是英文时不创建任何镜像，行为与旧版一致。
- 每次启动后写入 `<用户数据>\local-services\runtime-layout.json`，记录实际使用的运行库、数据目录、种子文件、镜像根目录和迁移结果，便于排查；非英文路径下的镜像目录可在删除软件包后手动清理，不影响收藏与历史。
- 本机证据：`pnpm test:desktop` 40 项通过，覆盖镜像复用、截断重建、数据迁移、跨卷复制、候选回退、错误提示和运行库路径来源；`node sanye_desktop/verify-ascii-runtime.cjs` 用真实 PostgreSQL 在中文软件目录与中文数据目录下完成初始化、启动、客户端查询与停止，报告为 `sanye_deploy/.local/ascii-runtime-C2T4Lv/report.json`；对交付包执行 `node sanye_desktop/verify-first-run.cjs` 的首次启动、重启、进程与模块来源、非空截图检查通过，报告为 `sanye_deploy/.local/first-run-qhaMbA/report.json`，其中 postgres 进程运行于 `...\sanye_anime\users\<摘要>\postgres-<摘要>\bin\postgres.exe`，数据目录与其同级，加载的运行库全部来自该镜像。
- 本轮交付包为 `三叶动漫_免安装版_20260920-143138-510.zip`，3258 个归档条目逐项摘要校验通过，SHA-256 为 `3668D8E7737076382A63C07E4F3E6729403CD960EB5271BFBC533141D48E36D4`，已解压到桌面同名目录并完成上述启动复验；签名状态仍为 `NotSigned`。
- 发送时必须发送该免安装包 ZIP，解压后顶层就是 `三叶动漫.exe`；把 `sanye_desktop/dist/win-unpacked`（electron-builder 原始输出）直接压缩发送会多出一层 `win-unpacked` 目录，是接收方出现中文路径的常见来源之一。
- 本机验证不等于接收方电脑验证：仍未在干净 Windows 虚拟机或接收方电脑复验，外部电脑兼容性与可信签名保持 `待环境`。接收方若仍失败，用 `runtime-layout.json` 与 `local-services/logs/database-provision.log` 区分路径、权限、运行库和 PostgreSQL 错误。

## 新包验收后的旧包清理（2026-09-18）

更新记录：2026-09-18，v1.45，按本次交付要求统一新包验收成功后的桌面及项目构建输出清理边界。

每次新包完成构建、归档逐项校验和实际包验证成功后，才执行旧包清理。清理前必须把待处理项解析为绝对路径，并确认每一项都位于以下两个允许范围之一：Windows 桌面直属路径 `C:\Users\10121\Desktop\`，以及本项目桌面构建输出路径 `C:\Users\10121\IdeaProjects\sanye-anime\sanye_desktop\dist\`。范围确认应记录本次新包的绝对路径、旧包清单和确认时间；路径不在允许范围内时停止清理。

- 桌面范围清理全部旧安装包、`.zip` 等压缩包、免安装/解压发布目录及其同版本校验或报告副本；本次新包的 ZIP、解压目录和固定快捷方式保留。
- 项目范围清理 `sanye_desktop\dist\` 下全部历史安装包、压缩包、免安装或解压发布目录及其对应历史报告，只保留本次新包及本次验证所需的报告。`sanye_desktop\runtime`、源码、依赖目录和构建工具不属于旧包清理范围。
- `%APPDATA%` 或其他用户目录中的收藏、历史、本地数据库、运行密码、日志和临时运行数据不属于旧包，禁止因清理包而删除或覆盖；当前运行中的旧包必须先退出并确认无其进程后才能处理。

清理只针对已确认的旧包项，不使用未解析的通配路径，不删除源码、依赖、运行数据或本次新产物。若新包验证失败、绝对路径确认不完整或无法区分包与运行数据，保留旧包并将清理标记为待处理，不得宣称已完成交付。

## 无需预装环境的免安装交付（2026-09-18）

更新记录：2026-09-18，v1.44，按“对方没有开发环境，完整解压后双击即可”的要求加固运行环境并验证最终归档。

目标系统为 Windows 10/11 x64。包内包含 Electron、Java 21、PostgreSQL、原生运行库、三个业务服务 JAR、前端资源、空数据库模板、目录种子及封面；接收方不需要安装 Java、Node.js、PostgreSQL、VC++ 或开发工具，不需要手动建库和设置环境变量。外部搜索及网络视频仍需网络。

- `processEnvironment.cjs` 为数据库离线配置及服务进程提供统一的最小环境，只保留 Windows 系统目录的 `PATH`，不继承开发机 Java、PostgreSQL、Node.js 或其他工具路径。桌面测试 34 项通过。
- `verify-first-run.cjs` 使用独立用户环境、空白应用数据及临时目录启动实际 EXE，移除 Java、Node、PostgreSQL 的宿主配置，并检查 Electron 主进程、PostgreSQL 和三个 Java 服务的可执行文件、父进程、加载模块与回环监听归属。禁止从系统目录借用 VC++ 可再分发 DLL，禁止从软件包和 Windows 目录之外加载模块。
- 最终候选为桌面 `三叶动漫_完整免安装版_20260918.zip`，538833260 字节，3257 个归档条目逐项摘要校验通过；SHA-256 为 `337842D8E3A8141A348AAC34F8A3F3C0A0EE2F9D9F974D4A23C1FF9E0572000C`。报告为 `sanye_desktop/dist/self-contained-20260918/archive-report.json`；已从该 ZIP 解压桌面同名目录。沿用前一修复候选的前端和业务 JAR，本次更新运行环境隔离及使用说明。

- 从最终桌面 ZIP 解压后的实际 EXE 执行增强的 `verify-first-run.cjs`，首次启动及重启通过；报告为 `sanye_deploy/.local/first-run-yJi5j2/report.json`。每轮核对 5 个进程、320 个模块的加载来源，未从系统加载 VC++ 可再分发 DLL；首页、目录 API 与资源仅访问本次 Electron 进程持有的 `127.0.0.1:28710`，两轮截图均非空。
- 首次验证器尝试误将 Playwright 的命令行包装进程 PID 作为 Electron PID，记录在 `sanye_deploy/.local/first-run-RMhDWm/report.json`；改为按最终包 EXE 路径和数据目录参数在进程表中定位 Electron 主进程后完成上述复验。测试实例均已退出，28710 无残留监听。文档检查 1070 项通过。
- 直接检查最终桌面产物 `resources/app.asar`，确认包含 `processEnvironment.cjs`，且运行时及离线配置均调用 `localProcessEnvironment()`；ASAR SHA-256 为 `bacff97f9860813eb7329ee06f1659c68786c3c125e66d1fa46bc9d31d8183fb`。原生静态导入检查覆盖 Electron、Java 服务入口和 PostgreSQL 的启动、探活、导入及停止工具；实际启动链未发现未随包提供的第三方 DLL。

本机未启用 Windows Sandbox，也无可用的干净 Windows 虚拟机；隔离环境及模块来源核对不等于重装系统后的真机验收。可信签名与接收方系统策略仍按既有边界记录，不要求接收方另行安装开发依赖。

## 接收方离线配置失败排查（2026-09-18）

更新记录：2026-09-18，v1.43，针对接收方“本地数据库离线配置失败”检查首次启动、原生依赖及诊断记录。

- 原包的 `postgres/bin` 缺少 `vcruntime140.dll`、`vcruntime140_1.dll` 和 `msvcp140.dll`。实际 PostgreSQL 单用户进程从构建机 `C:/Windows/System32` 加载这三个库；证据为 `sanye_deploy/.local/native-before-MDKb3Q/report.json`。旧版本中文路径启动通过不能证明目标电脑不需要预装运行库。
- 离线配置原先丢弃标准错误与退出码，统一显示失败。现保留 `local-services/logs/database-provision.log`，记录退出码、终止信号、配置确认及脱敏标准错误；不写入会回显密码的标准输出。缺失 DLL、错误架构和运行库初始化失败分别给出可识别提示。
- 继续使用临时副本配置和原子落盘，不覆盖已有数据库，不删除用户收藏或历史。不通过关闭数据库认证来绕过初始化失败。
- `prepare.mjs` 从随包 Java 复制实际 PE 导入所需的 VC++ DLL，检查 AMD64 架构与文件摘要；免安装及签名构建入口在打包前检查 PostgreSQL 运行库，缺失则停止。当前三项依赖为 `vcruntime140.dll`、`vcruntime140_1.dll` 和 `msvcp140.dll`。
- `pnpm test:desktop` 33 项通过；最终构建检查相关的 10 项定向测试通过。`node sanye_desktop/verify-live.cjs` 验证新库、三个服务、目录搜索、端口冲突保护及收藏历史重启保留，报告为 `sanye_deploy/.local/desktop/a2861cc3-816a-4ac5-810b-a0b814245785/report.json`。
- 实际 EXE 的 `verify-first-run.cjs` 验证隔离中文数据目录首次启动、重启、首页接口及窗口截图，并从进程模块信息确认三个 DLL 全部加载自包内 `resources/runtime/postgres/bin`；报告为 `sanye_deploy/.local/first-run-hnDtZ5/report.json`。
- 修复候选为桌面 `三叶动漫_数据库修复版_20260918.zip`，538832745 字节，3257 个归档条目逐项摘要校验通过；SHA-256 为 `9CB430046A0D8E9DB836B5581785261B803D46BA20F63A2A0C5FF348295EE20D`，报告为 `sanye_desktop/dist/database-fix-20260918/archive-report.json`。候选沿用 `runtime/manifest.json` 的 `2026-09-17T08:17:08.488Z` 前端及业务服务资源，仅更新本次数据库启动相关内容；本轮未重新编译前端或 Java 服务，也未替换固定桌面快捷方式或删除旧包。
- 从最终桌面 ZIP 重新解压至中文应用目录，再使用全新中文数据目录执行 `verify-first-run.cjs`：首次启动、重启、首页接口、非空截图和三个 VC++ DLL 加载路径均通过，报告为 `sanye_deploy/.local/first-run-Nu8WUp/report.json`。验证进程正常退出。`pnpm docs:check` 1069 项通过。

接收方尚无进程退出码或日志，缺运行库是已确认的包缺陷，但尚不能判定它是该电脑此次失败的唯一原因。未执行干净 Windows 虚拟机或接收方电脑验证，外部电脑验收保持 `待环境`；无可信签名状态保持原边界。若仍失败，使用新包的 `database-provision.log` 继续区分系统权限、架构、依赖及 PostgreSQL 错误。

## 搜索与播放优化桌面交付（2026-09-17）

更新记录：2026-09-17，v1.42，按用户要求交付当前工作区版本 `20260917-161633-055`，包含[播放器报告](./media-player-test-report.md)中的搜索、画质保护和播放连续性修正。

- 命令：`pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -NoOpen`。类型检查、桌面前端构建、业务服务打包、桌面回归、图标和 EXE 预检通过；Java 打包按原流程跳过测试，不引用旧覆盖率作为本轮验收。
- ZIP 的 3254 个条目及桌面解压文件逐项校验通过；包内前端与当前 `dist-desktop` 的 46 个文件摘要匹配。归档 SHA-256：`7091E4A12ECCDB2BC1D85D7B2F3F706A34603A4EA499718DAA683829148AA49D`。构建报告为 `sanye_desktop/dist/portable-packages/三叶动漫_免安装版_20260917-161633-055.report.json`。
- 桌面目录与 ZIP 为 `三叶动漫_免安装版_20260917-161633-055`，固定 `三叶动漫.lnk` 已核对指向新目录中的 `三叶动漫.exe`。原 `20260917-150025-790` 目录和 ZIP 已移入回收站；操作前核对桌面直属路径及无运行旧实例，用户收藏、历史和个人数据库未删除。
- 使用桌面实际 EXE 执行 `verify-first-run.cjs`，隔离中文数据目录下首次启动、首页目录接口、窗口截图与重启通过；报告为 `sanye_deploy/.local/first-run-VEv9St/report.json`。首次尝试在 Playwright 截图步骤超时，报告 `first-run-P9WpQq/report.json` 保留；改用有超时及非空像素检查的 Electron 原生窗口截图后复验通过。测试实例均已退出。

本次包的签名状态仍为 `NotSigned`；上述本机启动结果不代表可信签名、外部电脑兼容性或整片外网播放验收。仓库历史构建产物保留以供恢复。

## 固定桌面入口与旧版清理（2026-09-17）

更新记录：2026-09-17，v1.41，`sanye_tools/run.ps1 -Action portable` 构建后调用 `publish-desktop.ps1`：校验归档路径、复制 ZIP 并核对摘要、解压后逐项校验文件、执行 EXE 预检，再更新桌面固定的“三叶动漫.lnk”。只有完成以上步骤后，才将桌面直属的旧版免安装 ZIP 和目录移入回收站；拒绝复用已有同版本目录、不处理符号链接、不清理正在运行版本，不删除用户数据。直接执行 `package-portable.ps1` 默认仅构建，显式 `-PublishDesktop` 才交付桌面。

本轮实际交付 `20260917-150025-790`：全工作区类型检查和构建、28 项桌面测试、归档逐文件校验及桌面解压逐文件校验通过；固定快捷方式已核对指向该版本，桌面仅保留该版本目录、ZIP 与快捷方式，旧版本均已回收。Java 打包沿既有流程跳过测试，不引用历史覆盖率作为本轮证明。真实包内外网播放及受控连续播放证据见[播放器报告](./media-player-test-report.md)。

## 直接观看等待优化交付（2026-09-17）

更新记录：2026-09-17，v1.40，候选 `20260917-142614-446` 改为首个有效来源立即进入播放器、后台补齐备用线路；空视频结果明确报错，晚到备用线路可救回已失败播放，首帧未加载时仍受启动超时约束。类型检查、桌面构建、28 项桌面测试与两项直接观看浏览器测试通过，ZIP 归档校验通过；Java 打包沿用跳过测试。

使用实际包内资源真实搜索第二条《铃芽之旅》，播放器在点击后 2128 毫秒出现，8911 毫秒时视频已推进 3.045 秒，1280×535，报告 `sanye_deploy/.local/external-playback/1deaedf5-afd2-4b79-8139-f85d29dbce24/report.json`。这是一次网络测量，不是所有来源的延迟承诺或整片可用性验收。新 ZIP 和解压目录复制到桌面并校验 ZIP 摘要，保留运行中的旧实例及个人数据，使用新版前需退出旧版。

## 搜索播放与帧率同步修复交付（2026-09-17）

更新记录：2026-09-17，v1.39，最终候选 `20260917-141732-133` 包含同名电影备用来源、临时预览错误一次重试，以及帧率降档与恢复时选中态同步。`sanye_tools/run.ps1 -Action portable -NoOpen` 类型检查、桌面构建、28 项桌面测试、图标和 3254 个归档条目验证通过，Java 打包跳过测试；专项 Java 搜索测试另行通过 10 项、跳过外网 1 项。前端故障回退与帧率菜单专项测试通过。

使用候选包内运行时执行真实搜索第二条《铃芽之旅》，原域名 DNS 失败后备用线路播放至 3 秒、1280×535；报告 `sanye_deploy/.local/external-playback/74ea7383-ef04-4322-8442-b3c0d51bd436/report.json`。本轮验证短时播放，不保证来源内容完整、片长正确或整片持续可用；此前失败候选记录见[播放器报告](./media-player-test-report.md)。

最终 ZIP 和解压目录放到桌面。旧版 `112625-168` 正在运行，保留该目录与用户数据，不强行终止；切换版本需先从托盘退出旧版。中间候选 `140711-577` 从桌面移入回收站，仓库构建产物保留。新包仍无可信发布签名，外部电脑兼容性不由本机验证替代。

## 帧率画质菜单更新交付（2026-09-17）

更新记录：2026-09-17，v1.38，执行 `pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -NoOpen`，生成 `20260917-112625-168`。类型检查、桌面前端构建、28 项桌面测试、图标及归档文件校验通过；Java 打包沿用跳过测试。ZIP 复制到桌面后摘要与构建产物一致，完整解压后执行 `verify-first-run.cjs`，全新中文数据目录首次启动及重启通过，报告为 `sanye_deploy/.local/first-run-yBPJ5V/report.json`。

按用户要求将桌面旧目录 `20260916-174318-492`、`20260917-105403-001` 及后者 ZIP 移入回收站，桌面仅保留新 ZIP 和解压目录。清理前核对目标均为桌面直属文件且旧版无运行进程。未删除用户数据，验收实例正常退出；仓库历史构建产物保留。当前版本含帧率、画质菜单调整和数据库模板初始化；未将本机验收扩展为外部电脑或可信签名验收。

## 接收方首次启动与数据库模板交付（2026-09-17）

更新记录：2026-09-17，v1.37，废止下方 v1.35 的运行时临时复制资源方案。`prepare.mjs` 在构建机生成不含用户业务数据的 PostgreSQL 空集群模板，绑定随包 `postgres.exe` 摘要并记录文件摘要和空目录。客户端首次启动不执行 `initdb`，不要求修改路径或 `TEMP/TMP`；使用模板创建独立数据库副本，校验完整性，在无网络监听的单用户模式下通过标准输入设置本机随机密码，再原子重命名为正式数据目录。已有数据库直接保留，不覆盖；不完整的已有目录报错并保留，避免误删数据。

创建副本使用同级暂存目录保证原子落盘，这是文件一致性措施，不是将中文路径转换为英文的兼容性绕行。中文应用路径和中文用户数据路径均可使用。ZIP 丢失的空目录由模板清单恢复。用户数据、运行密码和数据库日志不进入分发包；构建目录要求英文仅适用于开发者打包环境。

验证证据：`pnpm test:desktop` 27 项通过；`node --test sanye_desktop/postgresTemplate.test.cjs` 验证中文路径、空目录恢复、重复启动不覆盖、残留目录保护和损坏模板拒绝。`node sanye_desktop/verify-live.cjs` 的报告为 `sanye_deploy/.local/desktop/2cabd985-e8d7-44fc-b3dd-f7e999060871/report.json`，新库、三个服务、页面、端口冲突、收藏历史重启保留通过。真实 EXE 使用 `verify-first-run.cjs` 验证首次启动和重启，报告为 `sanye_deploy/.local/first-run-vBJ0br/report.json`，全新中文数据目录下首页和目录接口正常，没有 `initdb.log`。

执行 `pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -NoOpen`，生成 `20260917-105403-001`，类型检查、桌面前端构建、业务 JAR 打包、桌面测试、图标和 EXE 启动预检通过；Java 打包沿用 `-DskipTests`，不作为本轮 Java 测试证据。ZIP 已复制到桌面并完整解压。产品名称保持“三叶动漫”，用户完整解压后双击 `三叶动漫.exe`，无需自行安装 Java 或 PostgreSQL。

当前证据是本机真实发行物启动，不等同于所有外部电脑兼容性。包未取得可信发布签名；受系统应用控制阻止的外部电脑仍为 `待环境`，不得承诺绕过系统策略。下方英文目录建议仅适用于旧包。

桌面 ZIP 实际解压后的第二次验收：`node sanye_desktop/verify-first-run.cjs C:/Users/10121/Desktop/三叶动漫_免安装版_20260917-105403-001/三叶动漫.exe` 通过，报告及首页截图位于 `sanye_deploy/.local/first-run-QAChvg/`。这次直接使用 ZIP 解压文件，包含中文应用目录、全新中文数据目录、首次启动、退出与重启检查，未使用开发工作区运行时替代包内资源。

## 中文路径下数据库初始化失败（2026-09-17）

已废止（2026-09-20）：本节的 8.3 短路径方案在关闭 8.3 名称生成的卷上无效，被上文《接收方非英文路径数据库启动修复（2026-09-20）》的 ASCII 运行目录镜像取代；此处保留原始记录。

更新记录：2026-09-17，v1.36，在 v1.35 基础上补充发送版本的兼容性门禁：初始化和 PostgreSQL 进程统一使用 `C` locale、`UTF8` 客户端编码及时区；启动前校验 PostgreSQL 必需的 `share`、`sql_features.txt`、`postgres.bki` 和命令文件；数据库就绪探测改为 120 秒有界重试，慢电脑不会因一次 `pg_isready` 延迟而误报失败。中文应用目录和中文数据目录的首次启动、完整服务启动、停止和重启保留数据实测通过。重新构建安装包后再发送给外部用户。

更新记录：2026-09-17，v1.35，处理外部用户首次启动的 `initdb` 错误 `invalid byte sequence for encoding "UTF8": 0xc8 0xfd`。本机 PostgreSQL 18.4 将 `share` 目录通过“三叶动漫”中文路径传给 `initdb -L`，在后续初始化阶段复现相同错误；上游 `initdb` 将 `sql_features.txt` 的路径拼入 SQL，Windows 本地编码的中文路径与 UTF-8 数据库冲突。

`sanye_desktop/runtime.cjs` 在 Windows 且资源路径含非 ASCII 字符时，将初始化资源复制到纯英文临时目录，通过 `-L` 使用该目录，成功或失败后清理临时副本。优先使用当前数据目录，其次使用系统临时目录；两者均含非 ASCII 字符时给出明确错误，提示配置可写的英文 `TEMP/TMP`。已有数据库不触发初始化，不删除个人数据库。

验证：`node --test sanye_desktop/runtime.test.cjs` 覆盖资源复制和临时目录清理；本机真实 `initdb` 使用中文运行时路径及修复后的资源路径初始化成功，隔离数据目录为 `C:/Users/10121/AppData/Local/Temp/sanye-pg-fixed-ApoA2b/data`。故障复现目录为 `C:/Users/10121/AppData/Local/Temp/sanye-pg-probe-92d82cecda1d4f7ea8c242c13a42bd35`。未启动这些隔离数据库服务。外部电脑复验为 `待环境`，本轮未重建或发送安装包。

旧免安装包可退出后将整个应用目录移至 `C:/sanye_anime` 等纯英文路径再启动，不能只移动 EXE。无需删除 `%APPDATA%/@sanye/sanye_desktop` 中的收藏或历史数据。

## 托盘暂停免安装更新交付（2026-09-16）

更新记录：2026-09-16，v1.34，按用户“更新免安装的到桌面”重新执行 `pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -NoOpen`，生成 `20260916-174318-492`。类型检查、桌面前端构建、三个业务服务打包、24 项桌面测试、七尺寸图标比对和本候选 EXE 无窗口启动预检通过。Java 打包沿原流程跳过测试，不将旧覆盖率输出作为本轮测试。

通过 `@electron/asar` 读取本候选 `resources/app.asar`，确认 `main.cjs` 和 `trayMedia.cjs` 与当前源码逐字节一致。包中包含最小化留在任务栏、× 隐藏托盘只暂停视频且保留页面和后台服务、恢复不自动续播的最新行为。

ZIP 报告位于 `sanye_desktop/dist/portable-packages/三叶动漫_免安装版_20260916-174318-492.report.json`，2,283 个归档条目校验通过。ZIP 与解压目录放到桌面，桌面 `三叶动漫.lnk` 指向该版本；解压后的 2,282 个清单文件再次逐项核对，未生成或复制独立 `.sha256` 文件。旧包与个人数据保留，未自动启动常用实例。

本候选预检成功不代表上一候选的 Code Integrity 拦截记录失效，也不代表跨电脑或完整可见窗口验收通过。报告签名状态仍为 `NotSigned`，此为本机免安装候选。系统托盘真实操作及长时间运行未由无窗口启动探测代替。

## 托盘保留进程与视频暂停（2026-09-16）

更新记录：2026-09-16，v1.33，按用户最新要求移除隐藏到托盘时卸载页面和停止运行时的处理。× 仅隐藏窗口并通过固定的页面脚本暂停原生视频；后台 Java、PostgreSQL、页面状态及观看位置保留。脚本捕获隐藏期间的后续播放事件并再次暂停，页面加载完成时同步托盘状态，覆盖启动中隐藏及迟到播放。恢复窗口只解除隐藏播放限制，不自动续播、不重新加载页面；真正退出仍等待启动完成后清理所持有的服务。最小化保持系统任务栏行为。

`trayMedia.cjs` 已加入桌面打包文件清单。当前工作区执行 `pnpm test:desktop`，24 项通过，其中七项主进程生命周期检查验证服务和页面保留、各恢复入口、最小化、启动中隐藏或退出，以及托盘不可用；新增 Chromium 视频测试验证暂停、播放位置与媒体源保留、隐藏期间播放拦截和恢复后手动播放。未将模拟窗口事件或浏览器媒体检查称为真实 Windows 托盘操作验收。

本节覆盖 v1.24、v1.32 的托盘停止服务行为。前次新 EXE 的系统签名策略拦截尚未解除，本次没有重复生成发行包或替换运行中的旧客户端，交付仍为 `blocked-external`，不是当前旧实例已生效。

## 最小化与托盘行为修正（2026-09-16）

更新记录：2026-09-16，v1.32，按用户报告移除 `main.cjs` 中将 `minimize` 绑定到 `suspendToTray` 的处理。最小化使用系统任务栏行为，不卸载页面、不停止本地服务；仅 × 进入托盘并沿原逻辑卸载页面、停止服务，托盘恢复和退出保持原有生命周期。产品行为见[功能规格](../product/feature-specification.md)，本节覆盖下方 v1.24 将最小化也归入托盘暂停的历史行为。

`node --test sanye_desktop/main.test.cjs` 七项通过，覆盖最小化保留页面及服务、启动中最小化、关闭到托盘、快速恢复、启动中关闭或退出和托盘不可用。测试模拟 Electron 生命周期，不作为真实系统任务栏人工操作证据。

执行 `pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -NoOpen` 构建候选 `20260916-173533-517`，类型检查、桌面前端、Java 打包及桌面测试通过，七尺寸 EXE 图标一致；使用 `@electron/asar` 读取包内 `main.cjs`，与修复后源码逐字节一致。但第六步 EXE 启动预检失败，Windows Code Integrity 在 17:37 记录 3077/3033，明确该 EXE 不满足系统签名级别要求；当前签名状态 `NotSigned`。日志为 `sanye_deploy/.local/tool-logs/portable-20260916-173533-517.log`。本轮仅有本机自签测试证书，不能作为可信发布身份。

状态为源码修复与受控回归通过、客户端更新 `blocked-external`，解除条件是构建满足当前系统应用控制策略的发行物并重新执行启动验收。未绕过系统策略、未生成成功 ZIP 或独立 `.sha256` 文件，桌面快捷方式仍指向 `20260916-172427-738`，当前旧进程没有强制停止；修复尚未在该运行实例生效。

## 播放质量更新包（2026-09-16）

更新记录：2026-09-16，v1.31，按用户“进行更新”执行 `pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -NoOpen`，生成当前工作区候选 `20260916-172427-738`，包含双向光流、修复、超分 2×、自动及 120/144/165 与 240 实验档；行为和性能边界仍以[播放器报告](./media-player-test-report.md)为准。

类型检查、桌面前端构建、三个业务服务打包、21 项桌面测试、EXE 七尺寸图标比对和启动预检通过。归档逐项验证 2,283 个条目；报告为 `sanye_desktop/dist/portable-packages/三叶动漫_免安装版_20260916-172427-738.report.json`，ZIP 的 SHA-256 为 `CB8D829058A85E3D426CEEA5F48DC67F959A4060346A7A6FE53180E27EB21727`。Java 打包沿既有流程使用 `-DskipTests`，不将历史覆盖率报告视为本轮 Java 测试。

将 `SANYE_DESKTOP_RUNTIME` 指向本候选 `win-unpacked/resources/runtime`，设置 `SANYE_VERIFY_PLAYER_QUALITY=1` 后执行 `node sanye_desktop/verify-external-playback.cjs`。独立数据库和本地服务下，真实搜索“天气之子”、直接观看预览、1920×1080 视频推进至 3.06 秒，以及切换修复、超分、锐化和选择 144 FPS 均通过，补帧画布启用，网络失败列表为空。报告及截图为 `sanye_deploy/.local/external-playback/70131e72-7a94-447f-8b3c-207e6ee37810/`。此证据验证包内资源和真实短时播放，不证明物理呈现达到 144 FPS 或重增强不会降档。

新 ZIP 和摘要复制到桌面，并解压至 `三叶动漫_免安装版_20260916-172427-738/`；桌面 `三叶动漫.lnk` 指向该目录中的 EXE。旧压缩包保留，未启动用户常用实例、未清理或迁移个人数据。回滚可使用旧包。此为无可信发布签名的本地免安装候选；可见 Electron 窗口、整片与跨电脑验收仍未由本轮后台验证覆盖。

## 天气之子直接观看完整修复（2026-09-16）

更新记录：2026-09-16，v1.30，定位到三个问题：旧包拒绝来源的 HTTP 301；原页面读取链路连接不稳定；`MediaImportService.selectEpisodeLinks` 只按“第几集”优先选组，导致《天气之子》当前国语/中字线路被历史两集线路覆盖，实际请求 `v6.qrssv.com` 并出现 `ERR_NAME_NOT_RESOLVED`。仅确认存在 HLS 字符串或导入成功不能证明线路有效。

修复：页面读取使用 Apache HttpClient 5.6.1 的多地址连接回退，保留受限跳转，增加覆盖连接与正文读取的总超时取消及有界正文读取。解析器优先匹配当前 `temLineList` 中的线路 ID；当前非集数线路组已声明完整地址时复用当前页，将正片与语言/备用线路一并返回，不再额外读取历史集数页。无当前配置的页面保留原有选集回退。第三方许可见[许可说明](./third-party-notices.md)。

当前工作区验证：Java 21 执行 `mvn -f sanye_server/pom.xml -pl sanye-server-anime -am test -Dtest=HttpMediaPageFetcherTest,AnimeUrlImportServiceTest,MediaImportServiceTest -Dsurefire.failIfNoSpecifiedTests=false -Dsanye.media.live=true`，27 项通过，包括真实《天气之子》预览、历史线路回归、响应大小和慢正文总超时；报告位于动漫模块 `target/surefire-reports/`。全工作区类型检查、桌面前端构建、业务 JAR 构建与 21 项桌面测试通过。

交付候选为 `sanye_desktop/dist/portable-packages/三叶动漫_免安装版_20260916-163426-295.zip`，同名摘要与报告验证 2,282 个归档条目。将 `SANYE_DESKTOP_RUNTIME` 指向该候选 `win-unpacked/resources/runtime` 后执行 `node sanye_desktop/verify-external-playback.cjs`，使用独立数据库和随机本地端口，从真实搜索结果点击“直接观看”，预览业务码为 0、正片 1 部，视频 1920×1080、进度 3.019 秒、总时长 6791.486 秒，网络失败列表为空。证据为 `sanye_deploy/.local/external-playback/42502e72-76d8-4622-8e69-851e7dc59b79/report.json` 及同目录 `playback.png`。没有模拟预览接口或视频数据。

此验收覆盖包内运行时与 Chromium 播放，不等同于整部影片、所有外部作品、可见 Electron 窗口或跨电脑验收。外部站点持续可达无法由单次成功保证。此前 301、连接超时和“两集”记录保留为历史证据，本节替代其对当前修复样本的状态结论。当前用户运行的旧程序没有自动替换，需从托盘退出后解压并启动本候选；个人片库未迁移或清理。回滚保留原目录，但原包存在本节已知缺陷。

## 导入观看与新包验证（2026-09-16）

更新记录：2026-09-16，v1.29，确认本机运行进程来自桌面的 `三叶动漫_免安装版_20260916_1524/三叶动漫.exe`。该运行时读取裸域来源返回业务码 5002、消息“来源页面返回 HTTP 301”；规范域相同页面可解析剧集。当前源码已有受限跳转处理，本轮重新构建并验证；搜索页面保留后端具体错误，不再将所有失败统一掩盖为“请稍后重试”。

通过 `node sanye_desktop/verify-import.cjs` 启动独立临时数据库和三个服务，真实裸域来源成功导入“天气之子”两集，已发布详情及持久化剧集读取成功；真实搜索结果点击“导入观看”跳转成功。报告为 `sanye_deploy/.local/desktop-import/d9e196f1-06eb-4e5c-a55e-bfc9866a3495/report.json`，同目录有详情截图。测试未改动用户现有片库。`node --test e2e/import-watch.test.cjs` 验证具体错误展示和重试跳转通过；Java 导入与读取器测试共 25 项，24 项通过、1 项独立外网开关测试跳过，本轮真实网络由上述桌面验证覆盖。

已生成 `20260916-161215-508` 免安装候选，包含导入跳转处理、具体错误提示和此前拖动优化；包校验报告位于 `sanye_desktop/dist/portable-packages/`，2,282 个条目校验通过。桌面提供同名 ZIP 与 SHA-256 文件，保留旧包。使用前从旧程序托盘退出，再解压运行新包；当前进程不会自动切换。

进一步将 `SANYE_DESKTOP_RUNTIME` 指向该包的 `resources/runtime` 执行同一验证脚本，真实导入、搜索按钮跳转以及视频时间推进超过两秒且解码宽度非零均通过，报告为 `sanye_deploy/.local/desktop-import/6f11d95c-ad2d-4f97-a43a-e0a18f5ba623/report.json`，`playback=passed`。下方早先记录的网络超时仍属于历史证据，本轮样本成功不能代表所有来源持续可达；未验证完整影片持续播放或跨电脑兼容，也未取得可信发布签名。

## 搜索结果直接观看修复（2026-09-16）

更新记录：2026-09-16，v1.28，当前运行的桌面动漫服务在读取 `https://yhdmtv.cc/p/74487/153/0` 的预览接口返回业务码 `5002`、`来源页面返回 HTTP 301`，因此未进入播放器。`HttpMediaPageFetcher` 改为最多跟随三次受限跳转：同源跳转或两个已知来源域名之间的标准 HTTPS 跳转；拒绝用户信息、其他域名、端口变更与协议降级，并共用单次读取超时预算。

验证命令：Java 21 下执行 `mvn -f sanye_server/pom.xml -pl sanye-server-anime -am test -Dtest=HttpMediaPageFetcherTest,AnimeUrlImportServiceTest,MediaImportServiceTest -Dsurefire.failIfNoSpecifiedTests=false`，24 项通过，1 项默认关闭的外网验证跳过。结果在对应模块 `target/surefire-reports/`。显式添加 `-Dsanye.media.live=true` 的真实预览测试已执行但失败，Java 报连接超时；随后 `curl.exe` 访问同一规范域也在 8 至 12 秒内超时，状态码为 `000`。

状态：代码修复已验证，真实播放仍为 `待环境`，需来源页面恢复可达后重新验证预览接口、播放清单和视频进度推进。不能由解析单测通过推导真实播放恢复。本次未替换当前运行的服务或重新打包；回滚恢复页面读取器及对应跳转测试后重新构建。

## 播放器拖动优化（2026-09-16）

更新记录：2026-09-16，v1.27，进度条改为拖动预览、松手一次定位；点播 HLS 新增当前播放实例内的有界分片缓存。实现与专项浏览器证据分别见[播放器设计](./media-player-development.md)、[播放器报告](./media-player-test-report.md)。此前搜索记录所述播放器构造类型错误已修正，本轮完整 `pnpm build` 与类型检查通过。

使用 `pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -NoOpen` 生成 `20260916-160323-988` 免安装候选。输出位于 `sanye_desktop/dist/portable-packages/`，同编号 `.report.json` 为归档校验、图标和启动预检的证据入口。此包取当前工作区源码，不代表已有客户端自动更新；关闭旧程序托盘后使用新包。保留旧包以便回滚，不改动个人收藏与历史。可信签名、可见窗口人工操作和跨电脑验收仍未完成。

## 搜索等待优化（2026-09-16）

更新记录：2026-09-16，v1.26，外部搜索的优先请求与完整请求独立更新页面，完整结果先到时立即展示，不再等待优先请求；迟到的优先结果不能覆盖完整结果。前端按完整查询参数缓存非空成功结果 30 秒，最多 64 条；失败、取消和空结果不缓存，保留重试。默认外部源改为规范域，配置事实源见[环境配置](./environment-config.md)。站内搜索与外部搜索仍并发执行。

当前工作区验证：`node --test e2e/search-latency.test.cjs` 一项通过，使用受控延迟证明完整结果在优先请求尚未返回时已显示，重复查询不新增外部请求；`BASE=http://127.0.0.1:4173 node e2e/e2e-search-external.mjs` 五项通过。Java 21 下执行 `mvn -f sanye_server/pom.xml -pl sanye-server-search -am test -Dtest=ExternalSearchServiceTest,SearchServiceTest -Dsurefire.failIfNoSpecifiedTests=false`，17 项通过、1 项外网测试跳过。`pnpm --filter @sanye/sanye_client typecheck` 及独立 `vite build` 通过，但完整 `build` 在播放器 `animeDetailView.vue:631` 的 `FragmentLoader` 构造类型处失败，未将其视为发布门禁通过。

本机使用 `curl.exe` 查询“天气之子”时，裸域加跳转一次约 566ms，直接规范域约 317ms，均返回 HTTP 200；仅为单次网络样本，不代表端到端搜索固定耗时。浏览器回归使用模拟接口；未更新已安装程序或分发包，未验收生产环境。回滚可恢复搜索页面的原请求处理、移除前端缓存并恢复原默认模板。

## 一键操作与免安装构建（2026-09-16）

更新记录：2026-09-16，v1.25，新增 [sanye_tools 一键入口](../sanye_tools/README.md)，统一提供中文命名的双击脚本。`01-一键打包免安装版.cmd` 从当前源码执行依赖安装、类型检查、桌面前端构建、三个 Java 服务打包、固定资源快照、运行时准备、桌面测试、EXE 图标比对与启动预检，最后生成并逐项校验 ZIP。默认输出到 `sanye_desktop/dist/portable-packages/`，保留历史候选、摘要、报告和构建日志；并发构建由文件锁阻止，失败压缩包不使用成功文件名。

本轮实测命令 `pwsh -NoProfile -File sanye_tools/run.ps1 -Action portable -NoOpen` 完成全流程；类型检查、桌面前端构建、Maven 打包与 21 项桌面测试通过。构建报告为 `sanye_desktop/dist/portable-packages/三叶动漫_免安装版_20260916-154359-288.report.json`，记录 2,282 个条目校验通过、七尺寸图标一致及 EXE 预检通过。另通过临时目录启动 `.cmd` 的环境检查、错误图标拒绝、并发构建拒绝及固定种子快照测试。Java 服务构建跳过单元测试；未执行新包可见窗口、真实播放、跨电脑或可信签名发行验收。

固定种子默认取自当前运行时的 `seed-manifest.json`，仅复制其中摘要校验通过的文件；新检出环境可用 `SANYE_DESKTOP_SEED_BUNDLE` 指定维护者提供的资源目录，不自动导出业务数据库。构建机依赖与自定义输出参数见入口说明。回滚使用历史免安装目录，不替换用户收藏、历史或数据库。

## 托盘暂停与恢复（2026-09-16）

更新记录：2026-09-16，v1.24，最小化和关闭窗口进入托盘时卸载页面，结束媒体、定时器和 Worker，按原清理流程停止三个 Java 服务及本地 PostgreSQL；仅保留托盘主进程和空白窗口。点击托盘、显示菜单、再次启动或应用激活时，串行等待清理完成并重新创建本地运行时，返回原页面地址。收藏、历史和数据库保留；页面内临时状态不保留，视频不自动续播。启动中进入托盘时，等待当前启动结束后清理；恢复需要等待服务启动。托盘不可用时关闭窗口仍退出应用。本节替代下方历史记录中的隐藏后保留本地服务行为。

验证证据：当前工作区执行 `pnpm test:desktop`，21 项通过；`sanye_desktop/main.test.cjs` 五项主进程测试覆盖关闭暂停及恢复入口、最小化及快速恢复、启动中隐藏、启动中退出、托盘不可用。测试模拟 Electron 与服务生命周期，未验证真实系统托盘、资源占用或跨电脑行为。本次暂停修改未执行重新打包或替换已安装客户端，既有包是否包含本次修改须另行核对。回滚恢复 `sanye_desktop/main.cjs` 的原关闭隐藏流程并重新打包。

## 免安装主程序图标修复（2026-09-16）

更新记录：2026-09-16，v1.23，旧 `20260916-1524` 构建关闭 `signAndEditExecutable`，导致 EXE 资源编辑同时被跳过，主程序保留 Electron 默认图标。新增 `pnpm --filter @sanye/sanye_desktop pack:portable` 入口，在无签名的本地目录构建中保留资源编辑；安装器签名要求仍由原入口执行。可选参数为输出目录，默认 `sanye_desktop/dist/portable`。

本轮命令为 `node sanye_desktop/build-portable.cjs sanye_desktop/dist/portable-20260916-iconfix`。直接读取新 EXE 的 PE 图标资源，16、24、32、48、64、128、256 像素七种尺寸均与 `assets/icon.ico` 对应图像字节一致；旧包四种尺寸均不一致。Windows 提取结果为 `sanye_desktop/dist/portable-20260916-iconfix/exe-icon.png`。`pnpm test:desktop` 十九项通过，EXE 的 `ELECTRON_RUN_AS_NODE=1` 无窗口版本预检退出码为零。

桌面交付文件为 `三叶动漫_免安装版_20260916_图标修正版.zip` 和同名 `.sha256`；归档摘要、逐文件验证结果与旧包差异记录见 `sanye_desktop/dist/portable-20260916-iconfix/report.json`。保留旧包作为回滚入口。新 EXE 的签名状态为 `NotSigned`；本轮未执行可见窗口、播放或跨电脑验收，不能视为可信签名发行物或其他电脑的运行保证。

## 本地免安装压缩包（2026-09-16，旧候选）

更新记录：2026-09-16，v1.22，按用户要求生成本机免安装目录并压缩至桌面，未运行安装器或覆盖已安装程序。文件为 `三叶动漫_免安装版_20260916_1524.zip`，大小 533,040,070 字节，包含 2,282 个条目，SHA-256 为 `BD37AF0E552B8831EC51AC3D7E82DB7CD7BEEF746F412AF672F62EC40FC749EE`；同目录提供同名 `.sha256` 校验文件。

构建使用当前桌面前端产物，重新执行三个业务服务的 Maven `package -DskipTests`，以现有固定种子和四张封面生成五文件种子清单，再执行 `pnpm desktop:prepare` 和 `electron-builder --win dir`。目录为 `sanye_desktop/dist/portable-20260916-1524/win-unpacked`，保留 Java 21、PostgreSQL、服务 JAR、前端 Worker 及第三方许可。此次仅生成本地免安装候选，使用命令级配置关闭可执行文件签名编辑和强制签名，未改变安装器分发门禁；没有可信发布签名，也不宣称任意电脑均可运行。

验证：`pnpm test:desktop` 十八项通过；包内 `main.cjs`、`runtime.cjs` 与当前源码字节一致，三个 JAR 与本轮构建一致；两个补帧 Worker 和四张封面存在。EXE 通过 `ELECTRON_RUN_AS_NODE=1` 的无窗口版本预检。`verify-live.cjs` 指向包内运行时后，首次初始化、三个服务、真实片库搜索、浏览器目录、重启保留收藏历史及停止检查通过，报告为 `sanye_deploy/.local/desktop/dc6b1bf2-53dd-4aa7-81b9-e5407026d3df/report.json`。归档按 `artifact-manifest.json` 逐条 SHA-256 比对通过。未执行可见窗口人工操作、跨电脑运行或新包的 120Hz 显示验收；测试数据在独立目录内。回滚时退出托盘中的程序并使用旧目录，个人数据未随包复制或覆盖。

## 实时补帧更新（2026-09-16）

更新记录：2026-09-16，v1.21，播放器所有清晰度默认启用运动补帧，质量增强与补帧共用 GPU 绘制并保留原分辨率；关闭增强不关闭补帧。实现设计见[播放器设计](./media-player-development.md)，后台光流像素、1080p 增强性能、GPU 完成计数与播放器回归见[测试报告](./media-player-test-report.md)。该记录替代旧“实时插帧”仅重复绘制的实现描述；不等同于 120Hz 屏幕或已安装客户端验收，也未重新分发安装包。

## 窗口关闭与托盘生命周期修复（2026-09-16）

更新记录：2026-09-16，v1.20，主进程新增系统托盘及窗口关闭拦截。点击右上角关闭时隐藏窗口并保留本地服务；点击或双击托盘图标、选择“显示主窗口”、再次启动应用或收到激活事件时恢复原窗口。托盘“退出”沿用等待启动结束、停止本地服务、销毁托盘后退出的流程。托盘创建失败时提示用户，保留关闭窗口直接退出的行为，避免隐藏后无法找回。

证据：`pnpm test:desktop` 十八项通过；其中 `sanye_desktop/main.test.cjs` 三项通过模拟 Electron 事件验证隐藏与恢复、启动期间退出、托盘失败回退。此轮未执行真实 Windows 托盘点击及安装包验收，也未替换已安装客户端；测试结果不能视为旧安装包已生效。回滚入口为 `sanye_desktop/main.cjs` 的关闭与托盘处理，回滚后需重新构建客户端。

## 搜索跳转与质量处理修复（2026-09-16）

更新记录：2026-09-16，v1.19，修复外部搜索默认地址返回 301 后被当作空结果缓存的问题。搜索仅跟随同源或已知樱花域名的 HTTPS 跳转，最多三次，并共用十五秒请求预算；失败返回可重试错误，不写入空结果缓存。页面增加外部搜索重试入口。真实地址 `https://yhdmtv.cc/public/auto/search1.html` 已观察到跳转至 `www.yhdmtv.cc`，Java 实现以“天气之子”查询得到一条按标题去重的匹配结果。

播放器按钮和提示统一为“质量”。性能档改用 `Anime4K_Deblur_DoG`，均衡和锐化分别使用小型和中型恢复网络，均保留原分辨率；暂停、拖动进度、缓冲和页面隐藏时停止增强。1080p 浏览器检查中，性能档单帧绘制由八次降为五次，三档输出均为 1920×1080 且像素非空。此证据不等同于实际片源帧率或所有显卡的性能承诺。

验证命令：`node --test e2e/anime4k-scheduling.test.cjs e2e/search-navigation.test.cjs` 三项通过；`mvn -f sanye_server/pom.xml -pl sanye-server-search -am test -Dtest=ExternalSearchServiceTest,SearchServiceTest -Dsurefire.failIfNoSpecifiedTests=false -Dsanye.search.live=true` 通过，真实源探测由系统属性显式开启；`pnpm typecheck`、`pnpm build` 通过。浏览器测试依赖端口 5187 的桌面模式 Vite，搜索页面交互使用接口桩；真实源请求由 Java 测试独立验证。尚未重新打包或替换已安装客户端，安装分发仍受下述签名状态约束。回滚时恢复上述搜索服务、播放器处理链及对应页面代码，并重新构建服务和客户端。

## Smart App Control 拦截根因（2026-09-16）

更新记录：2026-09-16，登记 Windows Code Integrity 实际事件：`VerifiedAndReputableDesktop` 策略以事件 3077/3033/3089 拒绝桌面上的安装器，原因是 `sanye_anime Local Test Signing` 为自签名证书，验证状态虽可为 `Valid`，但签名级别只有 1，低于策略要求的 2。自签名证书不能通过 Smart App Control、企业代码完整性或其他电脑的信誉签名门禁；延长有效期、重新计算摘要、压缩或重新打包均不能改变签名级别。

更新记录：2026-09-16，v1.18，`package-distribution.ps1` 在归档前拒绝无效签名和自签名安装器，`install-package.ps1` 在检测到 Smart App Control 强制模式时停止，不导入信任；此检查不是所有 WDAC 策略的兼容性证明。当前用户证书库仅发现本地测试身份，外部签名服务是否已获批待维护者确认。当前状态为 `blocked-external`，未生成新的可安装包。解除条件是取得 Windows 认可的代码签名身份并完成最终安装器、嵌套卸载程序、安装后的应用和运行时组件签名及目标策略下的实际安装、启动、退出验收。可信签名是必要发布条件，不能据此承诺所有安全策略均放行。

证据：`sanye_deploy/.local/signing-diagnosis-20260916/code-integrity-events.txt` 保存事件 XML，拦截文件摘要 `AD5885C1FF35EFFDC433E3D3FE509D011FD4993B94D66CDD3C6626016541E462` 与当前安装器一致。`pnpm test:desktop` 15 项通过，新增强制模式下拒绝启动安装器测试。分发脚本的实际拒绝检查及 `pnpm docs:check` 见本轮命令输出。此前桌面 `20260916.3` 的包内 EXE 验证不能证明安装器符合系统策略，不应继续分发；现有 ZIP 不会自动获得源码修复。回滚上述脚本只恢复旧检查行为，不能解除系统拦截。

## 封面资源修复（2026-09-16）

更新记录：2026-09-16，v1.17，修复桌面包缺少四张固定推荐封面的问题。数据库记录使用 `/admin-profile/profile/upload/2026/08/24/` 路径，原运行时未携带对应 JPG，导致桌面代理返回 404；现将四个受控路径资源复制到随包 `runtime/client/admin-profile/profile/`，不开放任意上传目录。新 EXE 验收报告 `sanye_deploy/.local/desktop-exe/dccaf6e7-32d3-4fc8-8ea9-e1b5a6334e18/report.json` 的 `all-catalog-covers-render`、`real-detail-and-episode-list`、`packaged-exe-exits` 和 `playback=passed` 均通过。新分发包 `sanye_anime-0.1.0-windows-x64-test-20260916.3.zip` SHA-256 为 `EE3E7D2C25B3DD2D7F7576852B011093B64CFB380913054B59368E92CBB3C1F9`。本轮仍未执行另一台 Windows 的安装卸载。

## 启动失败修复与重新打包（2026-09-16）

更新记录：2026-09-16，v1.16，统一桌面 Java 21 基线，固定安装器文件名并由分发脚本计算本次摘要；安装脚本按 UTF-8 BOM 输出，补齐 Windows PowerShell 5.1 压缩程序集。原 Java 17 包运行 Java 21 服务时出现 `UnsupportedClassVersionError`（65.0 对 61.0），证据在 `sanye_deploy/.local/desktop-exe/cc36b616-fcb2-4f2a-b773-84dd1b8535a6/local-services/logs/anime.log`。

本次使用 Microsoft Java 21.0.12 原始运行时目录替换旧 Java，保留既有客户端、业务 JAR 和种子，未重新编译业务模块。`pnpm --filter @sanye/sanye_desktop dist:self-signed` 与 `pnpm test:desktop` 通过（14 项）。Windows PowerShell 5.1 执行 `package-distribution.ps1 -BuildId 20260916.2` 通过安装入口、签名及六个归档文件摘要检查。ZIP 摘要为 `B7B07556D3B953EC2ABD8C6AA052E29AC0E75236E843AFDBE34E4C00AA92C0D1`。

`node sanye_desktop/verify-exe.cjs` 报告 `sanye_deploy/.local/desktop-exe/984a7aed-79b1-4855-a3f9-c1efce635cc8/report.json` 证明新 EXE 启动到首页、真实搜索、返回和侧栏折叠通过，退出码为 0；完整报告因四张封面未加载而失败，播放未执行。本轮未重新执行 NSIS 安装卸载，也未验证其他电脑。分发包为自签名测试版。回滚保留于 `dist/previous-*`，其中旧 Java 17 包存在已知启动问题，不建议恢复使用。

## 安装后清理

通过 `install-with-certificate.cmd` 或 `install-package.ps1` 安装时，脚本等待安装进程退出，仅在退出码为 `0` 时删除本次运行的 `.exe` 安装包。取消、失败或 `--check` 检查模式保留安装包；删除失败提示手动清理，并保留成功退出码。ZIP、证书、辅助脚本、应用目录及用户数据不在清理范围。直接双击 EXE 不经过此脚本，不触发自动清理。

验证证据：2026-09-15，当前工作区执行 `node --test sanye_desktop/install-package.test.cjs`，六项通过。测试使用临时文件和模拟安装进程、摘要与签名结果，覆盖成功、取消、失败、仅检查、校验失败和文件删除失败；未执行真实安装，也未重新生成分发 ZIP。下一次执行 `package-distribution.ps1` 会复制更新后的安装脚本；既有分发包不自动更新。回滚时恢复脚本中的安装后清理段及安装说明后重新打包。

更新记录：2026-09-15，v1.15，新增一键安装成功后清理本次 EXE 的行为、六项专项验证及旧分发包边界。

## 运行结构

`sanye_desktop` 是 `sanye_client` 的 Windows 分发入口，复用既有 Spring 业务模块，不替代三个核心工程。本次采用本机服务运行方式，不部署远程服务器。登录、AI、桌宠及依赖登录的管理、文件上传和反馈审核不属于本次启动集。桌面构建统一使用 Java 21；安装包采用当前用户证书库中的自签名测试证书，仅用于本机验证，不代表公开可信签名。

安装目录包含 Electron、Java 21、PostgreSQL 18、作品/搜索/收藏三个业务 JAR 和客户端静态资源。桌面入口提供受控本机代理，仅暴露公开目录、搜索、白名单来源导入、设备收藏和历史接口；内部管理接口不转发。接口使用本机会话 Cookie，拒绝外部来源请求并清理用户身份与内部令牌请求头。

页面固定监听 `127.0.0.1:28710`，冲突时失败并提示日志，不占用其他进程端口。数据库与三个业务服务使用动态本机端口。默认数据目录为 Electron 用户目录下的 `local-services`，与安装目录、开发数据库分开。首次启动生成数据库密码，执行 Flyway 后导入六部固定推荐及其剧集元数据；后续启动保留数据，不覆盖用户修改。测试可通过绝对路径参数 `--sanye-data-dir=` 隔离整个用户目录。

本机搜索通过已有作品目录查询路径执行，不连接 ES；首页缓存、RabbitMQ 消费/发布和服务发现关闭。本次不会启动 Redis、ES、RabbitMQ、Nacos、XXL-JOB、CAS、AI 或桌宠。退出按本次持有的进程句柄停止 Java，使用 PostgreSQL 快速关闭完成数据库刷盘，不按端口杀进程。

## 构建入口

### 120fps 视频生成（20260911.2）

按用户选择实现预处理方式，使用 `@ffmpeg/core@0.12.10` 的 `minterpolate` 运动补偿生成中间帧，不使用帧复制冒充插帧。播放器控制栏 `120` 打开处理窗口，可选当前 MP4/非加密完整 MPEG-TS 点播线路或本地视频，默认最高 480p，可选 720p/1080p。输出不放大小分辨率素材。生成后独立预览并保存 MP4，返回原视频保留原线路；打开时暂停原视频并关闭增强，避免音频和 GPU 负载叠加。

输入上限 256 MiB，处理执行超时 30 分钟；大文件和整部长片可能超出内存或处理能力。下载受浏览器跨域权限约束，直播、加密、字节范围、初始化映射和独立音轨播放列表明确拒绝。处理支持取消，切集或离开详情会终止任务并释放 Worker/Blob。整个处理在本机完成，不上传视频。

输出要求 `avg_frame_rate=120/1`，片尾补帧后按原时长截取，保留音轨。核心 ffprobe 在当前 WebAssembly 版本可能写出完整 JSON 后返回 -1，因此校验输出 JSON 必要字段而非单凭退出码判成功；缺失或不符合 120fps 的输出拒绝使用。

`node --test e2e/interpolation.test.cjs` 使用合成 12fps/1 秒视频验证：输出 120 帧、116 个不同解码画面、音视频均为 1 秒，并验证 MPEG-TS 点播和取消。报告为 `sanye_deploy/.local/interpolation/report.json`。真实 EXE 测试 `verify-interpolation.cjs` 已通过本地文件选择、生成、结果播放及返回，报告 `sanye_deploy/.local/interpolation-exe/657ac7c9-6310-49d0-9dfe-51523c5d2a02/report.json`，退出码 0。没有把短合成片段测试称为整集转换验收，也不宣称 60Hz 显示器可显示 120Hz。

FFmpeg 核心增加约 32 MiB 未压缩资源，按需加载；许可证和源码提供边界见[第三方许可说明](./third-party-notices.md)。

更新记录：2026-09-11，v1.14，按当前构建基线改用 Java 17 与自签名证书构建；新增 `pnpm desktop:build -- -SelfSigned` 自动构建入口，并登记搜索专项测试通过。自签名仅用于本机验证，公开可信签名仍为环境条件。

本次重建记录：桌面前端构建通过，服务端构建按参数跳过，桌面包测试未执行；运行时准备因本机 PostgreSQL `127.0.0.1:5433` 未启动而失败，未生成新的安装器。完整命令为 `pnpm desktop:build -- -SelfSigned -SkipServerBuild -SkipTests`，脚本会在任一步失败时停止。

最新自签名安装器：`sanye_desktop/dist/self-signed/三叶动漫 Setup 0.1.0.exe`，大小 446011704 字节，SHA-256 为 `449E7C33C8E512595797E1002C5C9C4EB083DEB3C1E2CF0ED9CE4AF23F27033D`。本次使用 Java 17、当前用户自签名证书 `79398737B4195416A6EC21802900F0D6F34F2118` 构建；桌面包测试按 `-SkipTests` 跳过，搜索专项测试此前已通过。

更新记录：2026-09-11，v1.13，实现真正 120fps 运动补偿视频生成、进度取消和结果播放，登记帧数、独立画面、音轨、时长及真实 EXE 证据。

交付候选：`sanye_desktop/dist/distribution/20260911.2/sanye_anime-0.1.0-windows-x64-test-20260911.2.zip`，SHA-256 为 `C3246B053F631457CBD2A42410CECF81F4368013C1FCB86B687912BE4B13C90B`，六文件归档校验通过。最终安装器 SHA-256 为 `66AEE7A9FD43F47730E19BD26B955721E4014A1AB84F178FB1FEC10E1546BA2A`，签名 `Valid`，一键入口检查通过。四项浏览器专项、七项桌面测试、类型检查及全工作区构建通过；390px 插帧对话框无水平溢出。新增 GPL 文本后的最终候选未重新执行安装卸载；此次未公开上传 GitHub。

### 导航、搜索和播放器候选（20260911.1）

新增页面返回按钮，有站内历史时返回原页面，无站内历史时回到首页或片库；搜索框增加提交按钮，片库请求失败明确显示错误和重试，不再显示为空结果或桌面不可用的 AI 链接。保留此前的侧栏裁切和网格折叠修复。`e2e/search-navigation.test.cjs`、`e2e/sidebar-collapse.test.cjs` 使用 API 替身检查错误、空结果、重试、返回、折叠和手机布局。

画质增强改为固定星形图标，状态留在提示和选项中；取消固定 30fps 参数，采用依赖支持的视频帧回调。“性能”档保留原分辨率，避免强制将 1080p 放大为 4K；暂停停止增强，恢复播放重新调度，关闭时释放监听和画布。播放器页面禁用背景动画与外层毛玻璃；Electron 关闭页面后台节流。`e2e/anime4k-scheduling.test.cjs` 验证按解码帧调度、原分辨率输出、暂停恢复和释放。

`pnpm typecheck`、`pnpm build`、桌面构建通过。新打包 EXE 报告 `sanye_deploy/.local/desktop-exe/1998dfc8-a660-4b92-9140-49404c8cb98c/report.json` 八项通过，新增真实搜索、详情返回与关键词保留、侧栏展开折叠，播放通过，退出码 0。新安装器实际安装到专用目录 `sanye_deploy/.local/navigation-player-installed`，退出码 0，安装后主程序签名 `Valid`；尚未重复执行安装后业务回归及卸载。

候选 ZIP：`sanye_desktop/dist/distribution/20260911.1/sanye_anime-0.1.0-windows-x64-test-20260911.1.zip`，六文件摘要校验通过，SHA-256 为 `8704CB25DCC3AB3C2E6851626DB1E95F28B67411B9B210F0FCE544D4F630D361`。安装器摘要 `6A5DCA4FCCDD32D4046BE1F1CFB250A681A853F56778AF264D0497FF087F1245` 已同步一键入口。该 ZIP 含本轮修复，历史 ZIP 不更新。

性能验收未完成：原始测量 `player-performance/e083f016-723f-47b3-b827-6043bc8c5f4a/report.json` 记录 25fps 和 60fps 对应的解码数量及零掉帧，但画面回调约每秒一次。后续报告 `71b1192c-ea58-407d-a9a3-ca25bded76f0/report.json` 证实测试窗口启动时不可见、最小化；恢复前台后的运行被关闭，未取得可比较数据。不得把这些后台回调当作前台 FPS 或声称性能优化已达到 60/120fps。当前 Windows 查询显示器刷新率为 60Hz；Anime4K 不做插帧，普通 25fps 片源不会自动成为 120fps。

更新记录：2026-09-11，v1.12，登记返回、搜索和播放器候选的代码、浏览器测试、真实 EXE 及安装证据，保留前台性能、外部搜索网络与其他电脑验收缺口。

### 桌面预览封面修复

`vite --mode desktop` 原先把封面请求代理到未启动的 8091 网关，导致开发预览中仅前端自带的《你的名字》图片正常。现改为仅在桌面开发模式从 `sanye_desktop/runtime/client/admin-profile/profile` 读取已准备的 JPG、PNG、WebP 图片，真实路径必须仍位于该目录内；`/covers` 使用前端自带静态文件，普通 Web 模式保留原代理。需先准备桌面运行资源，不能据此宣称后端 API 已运行。

更新记录：2026-09-11，v1.11，修正开发预览封面来源，浏览器首页十个图片元素全部加载成功，前端类型检查通过；旧 EXE 的资源内容未改变。

### 导航修复与审查（2026-09-11）

修复侧栏按钮越界裁切、折叠后网格仍占 248px、窄屏强制折叠导致无法展开的问题。按钮改为侧栏内部 40px 点击区域，展开和折叠分别占 248px、64px；增加状态、控制目标和折叠链接名称，手机模式不继承桌面折叠隐藏标签。`node --test e2e/sidebar-collapse.test.cjs` 在 1280px、900px 和转入 390px 的浏览器场景验证点击、键盘、按钮边界、内容区跟随及手机导航；报告截图在 `sanye_deploy/.local/sidebar-review`。测试使用 API 替身，不作为真实内容读取证明。

`pnpm typecheck` 和 `pnpm build` 通过，开发预览端口为 5187。本轮尚未将前端修复重新打进 EXE 或 ZIP，现有分发包仍是此前构建。

只读审查发现待处理项：`importRequestView.vue` 捕获任何审核提交失败后调用直接导入发布接口，桌面不提供反馈服务，因此白名单有效来源会进入直接导入，与页面“审核后导入”的承诺不符；另有离线种子来源仅用包内摘要证明完整性，发布链路尚需外部固定摘要或可信来源约束。后者是构建输入风险，不是已安装应用的远程入侵证据。未执行攻击性线上测试，不宣称整个系统无漏洞。

更新记录：2026-09-11，v1.10，修复侧栏折叠并登记浏览器与构建验证、审查发现和安装包未更新边界。

### 保留作品的体积优化

2026-09-11，`prepare.mjs` 改为使用同版本 JDK 的 `jlink`，保留全部模块，压缩模块文件并移除调试信息。由于 JMOD 中部分原生 DLL 不含供应商签名，首次候选被系统 Code Integrity 拦截；最终方案恢复原 JDK 的完整 `bin` 和 `legal`，先执行 `java --version` 通过再替换运行时。旧 Java 目录保留在忽略的临时构建目录供回退。PostgreSQL 仅移除 `lib/pgxs`、`lib/pkgconfig` 和 `share/doc`。

`runtime-size-report.mjs` 实测 Java 从 327.00 MiB 降至 113.33 MiB，PostgreSQL 从 145.91 MiB 降至 145.29 MiB；三个 JAR 241.31 MiB 和客户端 8.48 MiB 不变。125 个客户端文件及 `seed.sql` 与原版本逐字节一致，保留六部作品、71 条剧集和封面。

真实运行报告 `sanye_deploy/.local/desktop/15801cd4-10f2-4067-9234-d869bf9af66f/report.json` 八项通过，覆盖服务、六部作品、搜索、浏览器、关闭和收藏历史重启持久化。七项桌面测试通过。首次失败候选报告保留为 `7e23c147-9b11-4233-9f4e-81bee0c47f91/report.json`，不作为最终方案结果。

更新记录：2026-09-11，v1.9，优化随包 Java 与开发目录，保留作品内容和原生供应商签名，登记实测体积及运行验证。

最终构建：优化后安装器 452196120 字节（431.25 MiB），原版 557859656 字节（532.02 MiB），减少 105663536 字节，约 18.9%。新安装器 SHA-256 为 `CCE5FF4CD82EF38F6CA0F9C04795DEF9C6B29DC6DAAEAE2CCC7166067FA41E13`，签名 `Valid`。新 EXE 报告 `sanye_deploy/.local/desktop-exe/a5600e31-6cf3-44ac-81f8-8cf24c4ff863/report.json` 六项检查、真实播放及退出码 0 通过。

一键安装脚本已绑定新摘要，`cmd.exe` 检查模式通过。新 ZIP 位于 `sanye_desktop/dist/distribution/optimized/sanye_anime-0.1.0-windows-x64-test.zip`，六文件归档逐项核对通过，摘要 `46425996A2F7AF105C52E3D0278F591355F5F8F9AD9397DD3165D0081AE22535`。旧版 ZIP 保留。最终安装器实际启动被 Windows 应用控制策略阻止，未执行到安装和卸载；此项为 `blocked-external`，不能用旧包安装验收代替。本轮源码、运行、打包通过不等于该安装器在当前或其他电脑已获放行。

### 测试版 ZIP 分发准备

安装说明的唯一源文件为 `sanye_desktop/安装说明.txt`，按普通用户的解压、双击入口、证书确认、安装和启动顺序编写，技术命令仅置于末尾的协助操作部分。包含隐藏扩展名、下载不完整、系统拦截、网络播放失败和卸载保留数据的处理方式。打包脚本每次从该源文件同步到分发目录，避免只修改生成副本后丢失。

更新记录：2026-09-11，v1.8，重写面向普通用户的说明，生成 `sanye_desktop/dist/distribution/readme-v2/sanye_anime-0.1.0-windows-x64-test.zip`，六个文件逐项摘要核对通过，SHA-256 为 `B64EE8604FC267699933DB323F5EF65B061642967FDAF976F42181D4A7766A7E`。旧 ZIP 保留；此轮仅修改说明及打包同步，不重新执行应用安装。

`install-with-certificate.cmd` 调用 `install-package.ps1`，固定校验本版安装器和证书 SHA-256、签名身份，安装当前用户信任后再次要求安装器签名为 `Valid`，等待安装器并返回其退出码。`--check` 只执行文件与身份检查，不修改信任或启动安装；以真实 `cmd.exe` 执行通过，缺失安装器时返回非零，证书错误摘要拒绝测试通过。此前把批处理交给 PowerShell 解析不构成有效验证，本轮已纠正。

`package-distribution.ps1` 按六个文件的明确清单创建 ZIP，并逐项读取归档内容核对 SHA-256。它拒绝覆盖既有 ZIP，不包含私钥、日志、数据库或解包目录；安装器本身仍包含固定推荐、封面及运行时。入口脚本绑定当前安装器摘要，重建 EXE 后必须同步更新，不能混搭版本。

本地文件 `sanye_desktop/dist/distribution/sanye_anime-0.1.0-windows-x64-test.zip` 为 557870533 字节，SHA-256 为 `DFC65245B8AC65A10260942B8E671A137780180F055C6094129D0A68F32F92CF`。同目录有 `SHA256SUMS.txt` 和 `release-draft.txt`，后者是未发布草稿。完整解压 ZIP 后按随包中文说明选择一键安装或手动证书安装。

当前未上传 GitHub：未发现 `gh` 或 `GH_TOKEN` / `GITHUB_TOKEN` 发布身份，工作区大量未提交修改尚未形成产物对应提交，素材公开分发权尚未确认。不得把当前 HEAD 当作本包源码证明，或把本地 ZIP 当作已公开发行。

更新记录：2026-09-11，v1.7，完成测试分发 ZIP、归档逐文件摘要验证、一键入口真实批处理检查和 Release 草稿；保留 GitHub 身份、源码对应与素材授权缺口。

### 自签名测试证书

`sanye_desktop/create-test-certificate.ps1` 创建 RSA 3072、SHA-256 代码签名证书，默认到期日为 `9999-12-31`。X.509 必须记录到期时间，此设置是长期有效而非真正无限。可通过 `-ValidDays` 指定天数，或通过 `-NotAfter` 指定到期时间，两者互斥。私钥不可导出，只保存在创建者的 `CurrentUser\My`；输出忽略目录中的公开 `.cer` 和摘要元数据，不导出 PFX、不安装根信任。可先加 `-WhatIf` 预览。

```powershell
./sanye_desktop/create-test-certificate.ps1
```

将输出的证书路径和 SHA-256 填入下列参数。接收者必须通过可信渠道核对摘要；同一个不可信下载地址提供的证书与摘要不能建立身份可信性。

```powershell
./sanye_desktop/install-test-certificate.ps1 -CertificatePath '<公开证书.cer>' -ExpectedSha256 '<64位SHA256>' -WhatIf
./sanye_desktop/install-test-certificate.ps1 -CertificatePath '<公开证书.cer>' -ExpectedSha256 '<64位SHA256>'
```

安装只修改当前用户的 `Root` 和 `TrustedPublisher`，不要求管理员权限、不修改整机安全策略。信任范围是该密钥签名的程序，不限于一个 EXE。安装脚本拒绝指纹不符、私钥容器、其他主体、非代码签名用途和 CA 证书；重复安装跳过已存在项。

卸载使用同一脚本和同一公开证书，加 `-Uninstall`，仅删除两个信任库中该指纹的证书，保留创建者的私钥身份。构建机设置生成脚本打印的 `SANYE_DESKTOP_CERT_SHA1` 后运行 `pnpm --filter @sanye/sanye_desktop dist:self-signed`；接收者只需公开证书，不能索取或分发私钥。

自签名专用入口输出到 `dist/self-signed`，使用 Windows PowerShell 的 `Set-AuthenticodeSignature`，逐文件要求当前用户验证结果为 `Valid`，不使用外部时间戳服务，因此证书到期后须重新签名。第三方 `resources/runtime` 文件保留原字节和签名；electron-builder 的资源编辑工具仍需下载。日志可能显示第三方签名调用，但专用钩子跳过这些文件，应以实际文件摘要核对为准。

签名钩子显式加载 Windows PowerShell 安全模块，避免构建子进程继承模块路径后无法找到 `Cert:` 驱动。签名后的 NSIS 临时安装器会把 PE 证书表地址复制到卸载程序，而证书内容并未复制；`normalize-uninstaller.cjs` 只对生成的 `__uninstaller-nsis-` 文件清除已超出文件长度的失效引用，再按正常流程签名，保留有效签名表不变。已用实际失败的卸载文件验证修复及签名成功，相关回归计入七项桌面测试。

自签名只用于受控测试，不等于公开可信签名，不能保证解除其他电脑上的 Smart App Control 拦截。最初只验证脚本；维护者后续授权后，已生成和安装本机测试证书，签名 EXE 本机验收结果见本节后续记录。

### 无证书构建准备（2026-09-10）

新增 `.github/workflows/desktop-check.yml`，在 Windows 托管运行器执行固定工具链安装、桌面测试、全工作区类型检查与构建、桌面客户端构建及三个服务的 Maven 测试打包，并保留测试报告。这是源码验证工作流，不是签名工作流或完整安装包发行；当前尚未推送和执行远端 CI。

离线种子包由 `seed.sql`、所需封面及 `manifest.json` 组成，每个文件包含 SHA-256。`seed-bundle.mjs` 在复制前核对全部摘要，拒绝路径穿越、重复路径和符号链接。种子 SQL 会在初始化数据库时执行，摘要只用于完整性检查，来源仍须可信并经过评审。

```powershell
$env:SANYE_DESKTOP_SEED_OUTPUT = Join-Path (Get-Location) 'sanye_deploy/.local/desktop-seed'
node sanye_desktop/export-seed.mjs
$env:SANYE_DESKTOP_SEED_BUNDLE = $env:SANYE_DESKTOP_SEED_OUTPUT
pnpm desktop:prepare
```

显式导出仍只读取原先六部固定推荐、剧集和封面；不会自动提交这些文件。`desktop:prepare` 设置 `SANYE_DESKTOP_SEED_BUNDLE` 后不访问源数据库；CI 缺少该输入时提前失败。后续完整桌面构建还需要经过许可确认的种子包及固定来源和摘要的 PostgreSQL 运行时下载配置，不能把本机包上传冒充 GitHub 托管构建。

`node sanye_desktop/artifact-manifest.mjs <产物目录>` 流式生成文件大小和 SHA-256 清单，记录可用的 `GITHUB_SHA`，遇到 `.incomplete` 拒绝生成清单。清单的签名验收状态固定为未验证，不由摘要推导签名有效。

本轮本地证据：`pnpm test:desktop` 五项通过；`pnpm docs:check` 883 项通过；Windows 工作流使用 YAML 解析器校验通过。显式导出实际六部推荐、71 条剧集，并在 `sanye_deploy/.local/desktop-seed-verified` 完成全部文件摘要核对及离线导入，产物清单记录七个文件。真实服务复验八项通过，报告为 `sanye_deploy/.local/desktop/b8200cbe-b203-44f1-a4a9-f4a7e093b4e2/report.json`；该轮执行后又补充了验证脚本的失败状态和清理错误报告，仅做语法检查，不将旧报告当作新增失败分支测试。

### 候选发行说明草稿

版本 `0.1.0` 当前为本机候选，尚未发布。本轮桌面范围包含目录、搜索、设备收藏与历史，排除登录、AI 和桌宠。使用独立的本地 PostgreSQL 保存数据，默认卸载保留用户数据；本机数据目录位置见运行结构。安装、卸载和数据保留仍须在最终安装器上验证。

桌面网络访问包括用户请求触发的外部搜索、视频播放、远程封面及白名单来源导入；本地三个服务和数据库只监听回环地址。外部站点可能接收请求 IP、查询词和所访问内容，不应宣称全部数据处理都离线。当前未新增统计或遥测功能；正式隐私政策还需按最终外部供应商与页面行为核对。

未签名候选可能被 Windows Smart App Control 阻止。不能建议用户修改整机安全策略来替代验收，不能将 `.incomplete` 文件作为安装器发布。签名后仍需检查证书有效性、主程序及安装器签名、安装/卸载、升级和正常退出；清单或源码构建成功均不能替代这些结果。

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

早期未签名构建状态：解包应用生成后，主程序被 Windows 拦截，NSIS 临时安装器出现 `spawn UNKNOWN`，不完整产物改为 `.incomplete`，不可安装。该时点 `Get-AuthenticodeSignature` 为 `NotSigned` 且没有代码签名证书。此记录保留为历史，不覆盖下文安装测试证书后的最新验收结果。

本次证据：

- Java 21 下相关业务模块及依赖的 Maven 测试打包退出码 0；`pnpm typecheck`、`pnpm build` 和桌面专用构建通过。
- `pnpm test:desktop` 两项代理专项通过；`pnpm docs:check` 866 项通过。
- 最终本地服务报告 `sanye_deploy/.local/desktop/7d750a91-7629-49e2-94ec-3f2600dc9c51/report.json` 记录八项检查，包括端口冲突保护、六部固定推荐、真实搜索、浏览器及重启持久化。
- 较早 EXE 报告 `sanye_deploy/.local/desktop-exe/fd38292a-3790-4fd1-8902-30fbbff43ba0/report.json` 记录首页、全部封面、详情和《你的名字》真实播放推进。该轮调试进程退出码为 `3221225477`，不能计作正常退出通过。随后改用正常退出流程并去除详情页 AI 入口；最新产物被 Device Guard 拦截，因此这两项最新 EXE 行为仍待复验。
- 当前改动范围的 `git diff --check` 通过；全工作区检查发现既有 `SysMenuMapper.xml` 尾随空格，未修改该无关文件。

### 启动与打包阻塞修复（2026-09-10）

系统 `Microsoft-Windows-CodeIntegrity/Operational` 的 3077 事件确认：16:31:49 拦截临时安装器，16:41:09 再次拦截现有主程序，策略标识为 `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`；伴随 3118 事件表明来源为 Smart App Control。当前用户及本机个人证书库均未发现代码签名证书。

`electron-builder` 原流程在签名前运行临时安装器来生成卸载程序，导致 `spawn UNKNOWN`。已用受锁文件管理的签名补丁把临时安装器签名放在执行之前；签名失败直接终止。最终安装器与卸载程序继续使用原签名流程。补丁随依赖版本平移：2026-09-21 起由 `patches/app-builder-lib@26.15.3.patch`（`packager.signIf`）承载，26.0.12 因 high/critical 依赖告警不再使用；升级依赖时须复核该补丁与回归测试。

所有桌面安装方式统一使用当前用户证书库中的自签名证书。`pnpm desktop:build` 调用自签名构建并要求 `SANYE_DESKTOP_CERT_SHA1`，不再接受可信证书或无签名安装包作为交付路径；`dist:unsigned` 仅保留为开发调试入口，不属于安装交付方式。

本轮 `pnpm test:desktop` 四项通过，覆盖签名缺失提前失败、临时安装器先签名后执行及原有两项代理检查。`pnpm desktop:pack` 实测在缺少签名身份时退出 1，未生成新安装包。现有 EXE 再次验证失败，报告为 `sanye_deploy/.local/desktop-exe/9defa2e2-1c55-4a29-ae07-c77f936af61c/report.json`，包含 EXE 与资源摘要、失败阶段和错误；不是本轮新源码的运行通过证据。

验收入口为 `pnpm desktop:verify-exe`，默认读取签名目录，可通过 `SANYE_DESKTOP_EXE` 指定绝对路径。启动失败也保存报告，退出等待最多 60 秒，应用清理失败以非零状态退出。当前状态仍为 `blocked-external`：须提供 Windows 信任的签名身份，再完成签名构建、最新 EXE 启动和正常退出验收；未修改安全策略。

### 免费签名申请准备（2026-09-10）

候选服务为 [SignPath Foundation](https://signpath.org/)，[申请入口](https://signpath.org/apply)。免费服务须经基金会审核，证书签发给基金会并由其托管，项目不会收到可自由使用的证书私钥。当前阶段为申请准备，未申请、未获批、未取得签名身份。

以下信息已通过当前源码、GitHub 公开 API 及供应商文档核对：

| 检查项 | 当前证据与状态 | 后续动作 |
| --- | --- | --- |
| 公开仓库 | `GET https://api.github.com/repos/sanye66/sanye-anime` 返回 `private=false`、`visibility=public` | 申请时使用该仓库地址 |
| 项目许可证 | 初始 GitHub 查询返回 `license=null`；维护者随后授权直接处理，本地已增加自有代码 MIT 许可和第三方许可说明 | 本地文件尚未提交推送，远端许可证识别仍待同步 |
| 公开发行 | `GET https://api.github.com/repos/sanye66/sanye-anime/releases?per_page=3` 返回 `[]` | 准备可追溯的候选发布，不能把本机未签名 EXE 写成已公开发行 |
| 构建来源 | `prepare.mjs` 复制本机 Java/PostgreSQL，`export-seed.mjs` 读取本机数据库和封面 | 将运行时版本、下载来源、摘要和可分发种子数据纳入受控构建输入，完成干净 GitHub 托管运行器构建 |
| 构建工作流 | 现有 `release-candidate.yml` 是 Linux 服务镜像构建，不是 Windows 桌面构建 | 单独建立桌面工作流；不能用该镜像流程证明 EXE 的构建来源 |
| 账户与审批 | 未取得 SignPath 组织、项目、签名策略或提交令牌，GitHub 多因素认证状态未核对 | 由账户持有人完成注册、条款接受及审批角色设置 |

申请材料草稿如下，尚不满足的字段必须如实保留，不得提交成已满足：

| 申请信息 | 草稿 |
| --- | --- |
| 项目名称 | `sanye_anime` |
| 源码地址 | `https://github.com/sanye66/sanye-anime` |
| 项目说明 | 动漫目录、搜索与本机收藏应用；Windows 桌面入口使用 Electron，随包提供 Java、PostgreSQL 和三个 Spring 服务，视频来源需要网络访问 |
| 签名用途 | Windows Authenticode 签名，用于项目主程序、NSIS 构建中间产物、卸载程序及最终安装包；具体第三方文件范围须经服务方确认 |
| 当前发行状态 | 本机候选产物；尚无公开 GitHub Release；目标机器拦截未签名文件 |
| 许可证、联系人与审批人 | 自有代码为 MIT，第三方许可分别保留；联系人邮箱与审批身份仍须由账户持有人提供 |
| 隐私说明 | 桌面版使用本地目录保存数据，但搜索、视频与封面可能连接外部来源；须完成并公开准确的隐私说明，不能声称完全不联网 |
| 待服务方确认 | 是否接受本项目当前成熟度；Electron 主程序与第三方运行时的签名边界；NSIS 多阶段签名方式 |

官方 [GitHub 接入文档](https://docs.signpath.io/trusted-build-systems/github) 要求先将产物上传到 GitHub Actions，再提交签名；免费开源计划要求签名前相关工作均在 GitHub 托管运行器执行。因此不能直接把本机 `dist` 上传后声称它由受信任构建产生。接入使用 [官方 Action](https://github.com/SignPath/github-action-submit-signing-request)，审核通过后才配置 `SIGNPATH_API_TOKEN`、组织标识、项目标识、签名策略和产物配置。令牌只进入 GitHub Secrets。

官方[条件页](https://signpath.org/terms) 当前标记为草案，包含 OSI 许可证、持续维护、既有发行、可验证信誉、多因素认证、签名审批及第三方二进制限制；实际准入以服务方审核为准。不能替第三方组件改许可证，也不能将基金会签名声明提前写成已获赞助。当前保留 `blocked-external`。

`pnpm test:desktop` 检查代理路径、跨来源请求与身份头隔离；`node sanye_desktop/verify-live.cjs` 在全新专用目录验证真实数据库、三个服务、六部固定推荐、搜索、浏览器及重启后的收藏/历史；`node sanye_desktop/verify-exe.cjs` 检查实际打包 EXE、固定首页、封面、详情与播放状态。报告保存在 `sanye_deploy/.local/desktop/` 和 `desktop-exe/`。

视频来源仍在网络上，目录和 71 条剧集元数据不等于本地视频文件。实际来源能否播放须以运行报告为准，网络或上游来源失败不可写成播放通过。强制结束操作系统进程、停电恢复、另一台干净 Windows 的安装卸载及版本回滚需要另行验收。

更新记录：2026-09-10，v1.0，登记本地桌面结构、构建入口和受控验证边界；依据 `sanye_desktop` 实现和开发任务记录。

更新记录：2026-09-10，v1.1，修复临时安装器签名顺序、默认构建签名门禁、退出失败状态及验收报告；依据上述四项测试与当前系统阻断事件，可信签名及最新产物运行仍待环境。

更新记录：2026-09-10，v1.2，依据 GitHub 公开 API、源码及 SignPath 官方条件，登记免费签名申请草稿和许可证、发行、托管构建来源缺口；尚未申请或取得证书。

本轮后续：维护者授权直接处理后，已加入根 MIT 许可证与[第三方许可说明](./third-party-notices.md)，桌面包同步携带两者。官方申请入口可访问，但尚无账户联系人和签名组织；未自动生成身份、提交申请或接受外部条款。

更新记录：2026-09-10，v1.3，新增 Windows 源码检查、受摘要校验的离线种子导入导出及产物清单。上述联系人缺失是历史状态；后续已用维护者提供的信息尝试提交 SignPath 申请，页面只显示提交中，未确认成功。证书、本轮远端 CI 和完整安装包验收均未完成。

更新记录：2026-09-10，v1.4，增加自签名测试证书创建、指纹校验安装及卸载脚本，限定当前用户证书库并保留 Smart App Control 验收边界。

更新记录：2026-09-10，v1.5，维护者授权继续后已实际生成测试证书并安装到当前用户信任库；证书指纹 `89752679E520B2CF5B7575A6647C9E8CF22DA95F`，到期时间 `2026-12-09T10:01:37Z`，私钥不可导出。公开证书及元数据在 `sanye_deploy/.local/certificates`。新增专用自签名构建入口，第三方 Java 原始和输出文件摘要一致；五项桌面测试通过。签名安装包和启动结果须以下续实际报告为准。

本轮实际 EXE 结果：`dist/self-signed/win-unpacked/sanye_anime.exe` 使用 Windows 原生工具签名，`Get-AuthenticodeSignature` 为 `Valid`。`verify-exe.cjs` 报告 `sanye_deploy/.local/desktop-exe/f4e22c82-2d22-4004-9ae2-fbffbd67e70b/report.json` 记录六项检查通过、真实播放通过和退出码 0，覆盖首页、封面、详情及功能排除。此轮程序在资源编辑工具下载失败后直接签名，不能当作最终 NSIS 产物的验收；其他电脑仍须单独安装证书并复验。

最终安装器验收：`pnpm --filter @sanye/sanye_desktop dist:self-signed` 完成 NSIS 构建和签名，产物 `sanye_desktop/dist/self-signed/sanye_anime Setup 0.1.0.exe` 为 557859720 字节，SHA-256 为 `E436C7FA34045480EC87E018E4878F573A3E530EF34A62157FA45F6E75EE3483`。安装器、安装后的主程序、卸载程序签名均为 `Valid`；静默安装退出码 0。从独立安装目录执行的 EXE 报告 `sanye_deploy/.local/desktop-exe/8d13d465-5691-48c3-9a5e-dc319ed8b6cb/report.json` 六项检查和真实播放通过，退出码 0。卸载启动器退出码 0，安装后的 EXE 和卸载注册项均已移除。

上述为 90 天证书版本的历史验收。维护者随后要求长期有效，新证书指纹为 `79398737B4195416A6EC21802900F0D6F34F2118`，实际到期时间为北京时间 `9999-12-31 00:00:00`，UTC 为 `9999-12-30T16:00:00Z`；公开证书 SHA-256 为 `A0F645EFC3CF14F3EA92D96C9532AACC6FB2F5FD05AE2C2682B4373AFA248E1A`。已安装到当前用户信任库，旧证书和历史报告保留，不将历史安装包摘要当作新产物摘要。

更新记录：2026-09-10，v1.6，按维护者要求将生成器默认到期日延长至 9999 年，生成新的不可导出签名身份；旧签名不能通过替换公开证书延长，需要重新构建和签名。

2026-09-11 收口：新证书安装器构建成功，签名 `Valid`，SHA-256 为 `65A5951F6C2247095881B09C54ECEF5DB5178D598BE4EDC032687313943E4F27`。随包公开证书和安装说明已替换为新身份，产物清单已重算。首次启动验收因页面提前关闭失败，记录保留在 `868d6ecb-7001-4e56-914c-a8ace9d31d53/report.json`；复验 `sanye_deploy/.local/desktop-exe/ade1b8ca-dfbb-4d1c-8d19-4bc3df769d16/report.json` 六项检查、真实播放通过，退出码 0。此次未重复执行安装卸载，之前安装卸载通过的结果属于旧证书版本。

汇总报告为 `sanye_deploy/.local/certificates/installation-report.json`，构建日志为同目录 `self-signed-build.log`。286 个随包 Java/PostgreSQL EXE/DLL 与原运行时摘要一致。公开证书、安装证书脚本及中文安装说明已放入 `dist/self-signed`。本轮七项桌面测试、证书预览与错误指纹拒绝检查通过；当前文档检查跳过 `dist`、`dist-desktop`、`target` 构建副本，继续检查源码文档。未验证其他 Windows 电脑、升级回滚和默认用户数据卸载保留，不宣称公开可信签名。
