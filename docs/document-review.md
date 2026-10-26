# sanye_anime 全量文档评审记录

更新记录：2026-10-26，v6.33，继续核对播放链路：Android 原生/内嵌、订阅隔离、备用线路、系统控制等 53 项回归通过；其中旧测试把两集写成同一来源页地址而被正确去重，修正样例后复验通过。PC 当前默认订阅与另一真实来源仍可出画、持续推进和定位恢复；`pnpm e2e:ci` 的 9 个脚本通过。网页无选中播放规则时的 `sourceIndex=-1` 只检索 RSS 资源，避免借用未选择的网页规则；搜索模块定向 Maven 与网页订阅回归通过。Animeko 发行版本更新到 v6.4.0；官方资产下载速度过低，未完成同设备安装比较，不据发行说明宣称体验持平。本轮继续不打新包、不交付、不主动打开可见窗口。

更新记录：2026-10-26，v6.32，登记播放静默停滞恢复：PC 在播放时间不前进时有限重连并展示出口，安卓首帧后无 `waiting` 事件也能触发 12 秒看门狗；暂停、定位与后台不误判。PC 客户端构建、类型检查、桌面停滞与 8 项播放流程回归通过；安卓前端构建、26 项播放/预热/定位回归通过；PC 真实默认订阅 15 秒推进与另一公开来源 30 秒推进及定位后 10 秒推进通过。GitHub 发行页当前显示 Animeko v6.4.0（2026-10-24 发布），原 v6.3.0 已不是最新；同设备并排运行、实体手机和新发行物仍未验收，依用户要求不打新包、不交付。

更新记录：2026-10-23，v6.31，登记网页订阅原始来源编号契约 v0.36：同域名多规则搜索、预览与解析固定在当前编号，未指定编号的歧义预览拒绝猜测；RSS 资源入口保留。`pnpm typecheck`、搜索模块及依赖的 Maven 测试、网页订阅 5 项回归和安卓系统播放等 37 项定向回归通过。另修正系统媒体状态同步报错时误暂停 WebView 的代码路径；明确拒绝播放仍暂停。本轮未打新包、未打开可见窗口，实体手机及全部来源长期可用性仍待环境。

更新记录：2026-10-15，v6.30，登记历史封面、详情简介、搜索记录和竖屏播放器控件修复。工程 v0.92、计划 v1.19；72 项定向回归、130 项原生测试 129 通过/1 跳过、lint 0 错误。封面原生读取与缓存复测通过，外部媒体 CDN 波动保留为环境差距。

更新记录：2026-10-14，v6.29，登记桌面 v74（6.0/51）交付；工程 v0.91、计划 v1.18 更新，前端/体验 v1.6 的源码优化随包交付。APK 内 27 资源及桌面哈希、版本/Debug 签名、原生 127 通过/1 跳过和模拟器实际安装观看通过；lint 0 错误、8 警告。正式签名和实体手机验收仍待环境。

更新记录：2026-10-14，v6.28，登记首条预热优先、延后相邻集、HLS 初始画质与续播取消首片修复、字节转换和取消幂等。工程 v0.90、计划 v1.17、前端/体验 v1.6；63 项定向回归、类型/构建/资源检查通过，模拟器真实首帧与 30 秒推进通过。来源一次搜索失败、CDN 不稳定和实体手机未验收保留；本轮桌面旧包未更新。

更新记录：2026-10-14，v6.27，登记网页连接复用/压缩、原生清单预热/共享、直接起播及取消保护。工程 v0.89、计划 v1.16、前端/体验 v1.5；53 项脚本回归、原生 127 通过/1 跳过，最终桌面测试包实际安装和 30 秒实播通过。冷点击与 CDN 延迟仍保留未完成。

更新记录：2026-10-14，v6.26，登记默认 19 节点复测、18 节点清理与旧配置/刷新/备份回归，33 项定向检查及模拟器管理页通过；工程 v0.88、计划 v1.15、需求 v0.62、前端/体验专项 v1.4。仅 wedm 本轮持续观看通过，原内置来源保持，用户自建节点未全量验收。本轮没有桌面新包。

更新记录：2026-10-14，v6.25，登记搜索到观看/持续播放/进度触控专项：31 项定向回归，81 几何状态；模拟器当前来源耗时及外部樱花流畅度失败单独记录。工程记录 v0.87、计划 v1.14、前端及体验专项 v1.3；没有新桌面发行物。

更新记录：2026-10-14，v6.24，登记安卓画质菜单去重及搜索版本管理。安卓需求 v0.61、工程记录 v0.86、计划 v1.13、前端及体验专项 v1.2 同步。35 项回归、类型及构建、模拟器真实搜索过滤与内嵌播放通过；本轮未递增安装版本，桌面 v73 为此前发行物，不将新源码冒充旧 APK 内容。

更新记录：2026-10-14，v6.23，登记 v73 远程内嵌恢复、音频焦点、分片、单站选择及封面修复。安卓需求更新至 v0.60，前端和体验专项均更新至 v1.1；44 项定向回归通过，原生 126 通过/1 跳过，模拟器六部内嵌实播与外站失败分别记录，不宣称所有企业级差距已关闭。详细交付收据见[安卓工程](../sanye_android/README.md) v0.85。

更新记录：2026-10-14，v6.22，登记播放深查及 v72：已在模拟器安装并真实运行 Media3，六部首页首帧和第 2 集进度通过；不将模拟器禁音验证等同实体手机音视频验收。请求头、重定向、编码及安全回归、外部来源失败和交付摘要见[安卓工程](../sanye_android/README.md) v0.84。

更新记录：2026-10-14，v6.21，登记安卓 v71（5.7/48）桌面交付；原生 114 通过、1 跳过，27 个 APK 页面资源逐哈希一致，桌面副本与构建包一致，Debug v2 签名通过。交付摘要和未验收范围见[安卓工程记录](../sanye_android/README.md) v0.83；ADB 无设备。

更新记录：2026-10-13，v6.20，登记安卓 v70 桌面交付，完整收据见[安卓工程](../sanye_android/README.md) v0.82 与[安卓计划](./android-development-plan.md) v1.09。版本递增至 47/5.6；初轮 SDK 路径缺失已通过临时环境配置修正，最终构建和 107 项原生通过/1 跳过、32 项脚本通过、27 个 APK 资源一致性及 Debug 签名检查已完成。无设备，未做安装或真实播放；保留已有工作和桌面旧包。

## 本轮优化收据（2026-10-13，v6.19）

追加专项：新增[前端质量对标](./frontend-quality-gap.md)和[用户体验对标](./user-experience-gap.md)，将工程质量、用户流程、严格完成条件和未完成任务分开维护；本轮 Web 主内容新增键盘跳转入口，`pnpm typecheck` 与客户端生产构建通过。客户端构建仍有既有 HLS 大分块警告；读屏、TalkBack、真机、真实来源和对标项目并排测评未完成。

本轮按维护者确认的单组织与游客模式实施，起始分支 `feature-T-B-01`、HEAD `e065ac608a16641b02a746f2323e15efbd2d0ba9`；工作区已有大量未提交安卓、客户端和订阅改动，全部保留。未切分支、暂存、提交、推送、发布或改动已有业务数据。HEAD 不代表本轮全部源码。

- 后端：外盒同轮逐条确认并连续领取最多 100 条，失败立即停止，避免批量预领取使租约过期；网关移除外部用户/内部调用身份头，精确收口诊断白名单，管理端口默认回环。管理端诊断默认关闭，非本地 Swagger/Druid 分别校验权限，即使匿名注解误配置也不会覆盖诊断规则。
- 部署与监控：开发 Compose 全部宿主机映射绑定回环、保留原端口和数据卷，PostgreSQL 探活认证执行查询；监控补齐反馈/任务，网关改为实际管理端口 8090，JVM 告警按实例分组，外盒告警使用真实指标。容器实际运行与通知未验证。
- 交付：固定 Action 摘要、最小权限与作业超时；编译器仅允许已登记 21.0.11/21.0.12，记录实际版本；完整候选同时要求当前提交普通/安卓/桌面成功门禁，未触发须手动补跑，不根据最后一条提交的路径跳过。报告分页、最新重跑和过期结果均有防护。候选配置生成 CycloneDX 物料清单，推送前执行严格风险检查，远端尚未运行。
- 安全与协作：拒绝错误扫描结构，豁免限定版本和严重度；严格发行模式不接受高危/严重风险豁免。MinIO 升至 8.0.7 并同步恢复材料标识。新增贡献、安全政策、行为准则及未发布变更入口，更新安全、接口、配置、版本、质量、任务和差距事实源；私密接收渠道尚未验证。

| 检查 | 结果与证据范围 |
| --- | --- |
| `pnpm typecheck`、`pnpm build` | 退出码均为 0；日志 `sanye_deploy/.local/enterprise-typecheck-20261013.log`、`enterprise-build-20261013.log`，保留既有大分块警告 |
| `mvn -q -f sanye_server/pom.xml test` | 当前 62 份 Surefire 报告，323 项中 320 通过、3 个现场来源测试跳过，失败/错误 0；日志 `enterprise-backend-20261013.log`；未把历史 IT 算入 |
| `mvn -q -f sanye_admin_server/pom.xml test` | 当前 8 份 Surefire 报告，31 项全部通过，失败/错误/跳过 0；日志 `enterprise-admin-20261013.log`，包含真实过滤链权限测试 |
| 安全审计、候选发布、回归运行器与恢复脚本联合 `node --test` | 64 项中 62 通过、2 个实际报告复核跳过，失败 0；日志 `enterprise-script-tests-20261013-final.log`；未提供落盘报告时明确跳过，实时 pnpm 审计另行执行 |
| `node --test sanye_deploy/compose-security.test.mjs` | 3 项通过，失败/跳过 0；调用真实 `docker compose config` 校验回环绑定、自定义端口和认证查询；不需要引擎，也不证明容器探活实际成功 |
| `node e2e/run-ci.mjs` | 初轮因清晰度测试检查旧 HLS 参数失败；改为检查现有 `fragLoadPolicy` 的实际重试、期限与缓冲上限，并补继续观看夹具，最终 8 个脚本通过；日志 `enterprise-e2e-20261013.log` 与 `enterprise-e2e-20261013-final.log`；接口与媒体为隔离夹具 |
| `pnpm test:desktop` | 69 项通过，失败/跳过 0；日志 `enterprise-desktop-tests-20261013.log`；未创建、安装或发布桌面包 |
| 实时 pnpm 审计 | MinIO 补丁升级后 6 条告警，高危 1、中等 5；常规有效登记门禁通过，`--strict` 退出码 1，正确阻断 `http-cache-semantics` 构建期风险，不认定为安全就绪 |
| 实际 Trivy 扫描 | 工具 0.74.0 从官方发行物下载并核对 SHA-256；镜像库连接失败，改用官方 GHCR 后下载超时，没有完整报告，不能声称最新后端漏洞或物料清单验收通过；日志位于 `enterprise-security-20261013/` |
| 文档与差异 | `pnpm docs:check` 2074 项通过、0 失败，日志 `enterprise-docs-20261013.log`；`git -c core.safecrlf=false diff --check` 退出码 0；已登记新增文档地图，保留全部历史收据 |

未完成项统一登记于[差距登记](./gap-register.md)。Docker Linux 引擎不可连接，ADB 无设备；真机、目标环境恢复/容量/告警、真实 CAS/AI、签名、版权与法律审查、远端规则/发布仍未验收。大型界面拆分、无障碍、跨设备同步与更多离线能力需要后续针对性工作，不把本轮门禁改进写成全部企业级问题已解决。

更新记录：2026-10-13，v6.19，完成本轮源码、配置、文档与验证收据；最小恢复方法为按本轮明确修改块回退，保留已有未提交变更、数据卷和业务数据，无数据库迁移。

最终验收收据（2026-10-12，v1.23）：当前脏工作区完成整合，17 个安卓体验/原生桥接/解析缓存/诊断/封面/选集/订阅/检索/主题/恢复文件联合 `node --test --test-concurrency=2` 最终 66 项通过、0 失败、0 跳过。保留“我的”不出现自动播放开关的既有约定，自动连播放在作品详情“更多”；主题检查针对实际占位图片加载和呈现比例，不再查已移除的渐变占位节点。诊断新增视频快照不隐藏事件列表。已查看 `.runtime/android-front-experience/episodes-390.png`；截图来自隔离桥接，错误文字来自测试主动禁用媒体，不是真机或第三方实播证据。

最终 `pnpm typecheck`、根 `pnpm build` 和安卓 `build:android` 通过，仍存在既有大分块警告。`npm run sync` 后 JDK 21 `gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:lintRelease :app:assembleDebug :app:assembleRelease --console=plain` 成功；XML 共 108 项，107 通过、1 个既有现场来源样例跳过、0 失败，两种 lint 均 0 错误/8 警告。轨道覆盖清理、媒体会话更新、长按中断恢复已完成源码和编译复核；真实 Media3 参数 JVM 测试因 Android TextUtils 未模拟不能运行，未引入额外模拟依赖，不宣称覆盖这项运行时验收。原生工程及 debug/release 两个候选 APK 的 27 个页面资源逐文件 SHA-256 均与最终安卓构建一致。版本仍 46/5.5，release 为未签名候选；未提交、推送、安装、复制桌面或发布。`adb devices` 为空，原生控件与轨道切换、长时弱网、发热、掉帧、刷新率匹配、音画同步和实际速度提升仍待环境。文档检查 `pnpm docs:check` 1998 项通过、0 失败。

更新记录：2026-10-12，v1.23，连续观看与性能体验专项：同步[安卓需求](../product/android-requirements.md) v0.59、[开发计划](./android-development-plan.md) v1.08 与[接口契约](./api-contract.md) v0.34。实现留窗切集/换线、可取消连播、锁定与临时倍速、解析复用、缓冲/轨道策略及脱敏视频观测。首次联合回归 44 项中 43 通过，连播开关受全局 label 样式覆盖导致设置行布局失败；改为标准设置行及关联 label/input，保留原布局断言。新增留窗故障仍记失败与目标解析失败显式收口回归。最终收据在本节补记；真机、实际性能提升和正式发行仍待环境。

最终验收收据（2026-10-12，v1.22）：12 个安卓前端体验、检索、订阅、仓库、选集、封面、原生桥接与播放恢复文件联合 `node --test --test-concurrency=2`，41 项通过、0 失败、0 跳过；含新增检索记忆 2 项、当前页选源/搜索保留/分段选集/首页续播完整流程及原生选项白名单回归。图片断言等待实际进入视口后的懒加载，不再把 DOM 出现当作图片已完成；覆盖 320/390/430 宽、明暗外观和弹层关闭，已查看本轮来源面板与详情截图。`pnpm typecheck`、根 `pnpm build`、安卓 `build:android` 通过。JDK 21 `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease` 最终通过，原生 105 项中 104 通过、1 个既有现场来源样例跳过、0 失败；一次搜索调度测试在 finally 清理任务时触发取消断言，改为清理前检查同词任务未取消，保留抢占行为断言。静态检查 0 错误、8 警告；触摸检查仅对 GestureDetector 已确认单击调用 `performClick` 的转发监听器限定说明，不放宽其他无障碍检查。原生工程与两种 APK 的 27 个页面资源逐文件 SHA-256 与当前前端一致；发布候选仍未签名，无发行授权、不修改版本号。`adb devices` 为空，原生手势、主题渲染、选集弹窗、窗口切换及实际来源延迟仍待手机验证。文档检查 `pnpm docs:check` 1992 项通过、0 失败；没有提交、推送、安装或发布。

更新记录：2026-10-12，v1.22，安卓前端体验专项，同步[需求](../product/android-requirements.md) v0.58、[开发计划](./android-development-plan.md) v1.07 和[接口契约](./api-contract.md) v0.33。当前页选源、检索保留与本机记忆、首页续播隔离、当前线路/30 集分段、主次动作、原生控制器/选集回传及主题已落地。浏览器新增完整流程覆盖 320/390/430 宽与来源底部面板；截图在 `.runtime/android-front-experience/`，已看图修正失败时仍占据大块待播位置的问题。旧 UI 测试按新产品行为调整为进入“更多”再保存/刷新、只展开当前线路；不是删除身份、排序或保存断言。最终测试及构建收据待下方登记，真机手势、原生截图、实际网络延迟和安装仍未验证。

追加复核（2026-10-12，v1.21）：界面、搜索重试、播放恢复、系统播放和工具联合 33 项中 32 通过，续播隔离测试因未声明新增离线状态夹具失败；补充夹具后该文件 4 项通过，不修改实际身份守卫。最后调整目录为最多两路渐进读取，单源失败不阻断其余目录，原生播放/目录契约/分页联合 10 项通过；重新构建并同步，两个候选 APK 的 27 个资源再次一致。`pnpm docs:check` 当前 1988 项通过、0 失败。静态检查警告和无真机边界保持原收据，不把重试前失败隐藏为全量一次通过。

最终整合收据（2026-10-12，v1.21）：13 个安卓来源、目录、备份、下载、原生桥接、封面及诊断回归文件联合执行 `node --test --test-concurrency=2`，40 项通过、0 失败、0 跳过。原生 `:app:testDebugUnitTest` 共 105 项，104 通过、1 个既有现场来源夹具跳过、0 失败；目录非法地址抛出明确校验错误，媒体安全测试使用真实 MP4 头夹具，不放宽文件安全边界。`pnpm typecheck`、根 `pnpm build`、安卓 `build:android` 通过。`npm run sync` 后原生工程及重新构建 debug/release 两个 APK 的 27 个页面资源逐文件 SHA-256 与当前构建一致。`assembleDebug/assembleRelease/lintDebug/lintRelease` 通过，发布 R8 与资源压缩执行；两种静态检查均 0 错误、8 警告。正式签名校验 `:app:verifyReleaseSigning` 因缺材料按设计失败，release 为未签名候选，不作发行包。`adb devices` 为空，真机小窗、触控、解码、杀进程下载恢复和跨版本覆盖安装未验证；动态来源、HLS 离线、服务化运营及正式发行仍有差距。已查看目录分页 390 宽浏览器截图，属于隔离桥接，不是手机原生界面。文档检查收据见最终本机命令，未提交、推送、安装或部署。

更新记录：2026-10-12，v1.21，登记安卓可靠性升级：同步[需求](../product/android-requirements.md) v0.57、[开发计划](./android-development-plan.md) v1.06、[接口契约](./api-contract.md) v0.32、[数据库设计](./database-design.md) v1.12。真实 SQLite 身份迁移与回滚 2 项、来源绑定迁移兼容与真实错误传播 2 项通过；诊断含脱敏 5 项、历史竞态 1 项通过，原生会话/诊断/续播、备份及订阅联合 15 项通过。`pnpm typecheck` 和安卓 `build:android` 通过；正常参数原生 Java 编译通过，未启用临时 `BuildConfig` 开关。后续下载与目录整合、全量原生构建和文档检查收据待回填；不把这些局部结果写成整体升级完成。真机、正式签名、远端持续集成均未验收。

最终构建收据（2026-10-12，v1.20）：完成等待预算与轨道选择修正后，再执行 JDK 21 `gradlew.bat :app:assembleDebug :app:assembleRelease :app:testDebugUnitTest :app:lintDebug --console=plain`，`BUILD SUCCESSFUL`；发布构建的 R8 混淆、资源压缩通过，当前发布产物为 `app-release-unsigned.apk`，没有正式签名。原生测试仍为 91 通过/1 跳过/0 失败，lint 为 0 错误/8 警告；Media3 与下载最后专项联合 9 项通过、0 失败、0 跳过。`npm run sync` 后 `pnpm verify:android-assets` 27 个页面资源逐文件 SHA-256 一致；另使用只读 ZIP 校验对调试和发布 APK 内 `assets/public` 的相同 27 个文件逐一计算 SHA-256，均与最终 `dist-android` 一致。`apksigner verify --verbose` 验证本地调试 APK 的 v2 签名通过，不能替代正式发布签名或设备安装证据。`pnpm docs:check` 通过 1978 项、0 失败；未在设备或模拟器执行原生视觉与播放验收，未复制桌面、提交推送或发布。

本轮验收收据（2026-10-12，v1.20）：`pnpm typecheck`、`pnpm build` 与最终 `pnpm --filter @sanye/sanye_client build:android` 通过。联合回归 `node --test --test-concurrency=2 e2e/android-native-playback.test.cjs e2e/android-subscription-source.test.cjs e2e/android-playback-resilience.test.cjs e2e/android-downloads.test.cjs e2e/android-download-playback.test.cjs e2e/android-repository-source.test.cjs e2e/android-search-retry.test.cjs e2e/android-ui-polish.test.cjs` 28 项通过、0 失败、0 跳过；随后新增错误回传和等待预算断言、加强本地文件重试位置覆盖，最终 `node --test e2e/android-native-playback.test.cjs` 4 项通过。下载返回值增加 `nativeUrl` 后同步回归契约，保留 WebView 地址；原生启用时断言无网页视频元素及播放调用，原集/线路续播、下一集、旧事件隔离、完成下载和本地重试均通过隔离桥接验证。JDK 21 原生单测 XML 共 92 项，91 通过、1 个既有现场来源样例跳过、0 失败；其中 Media3 22 项全部通过，覆盖公网/私有文件边界、字幕、真实指标、20/30 秒首帧及 12 秒帧停滞预算、暂停/后台/定位与清晰度标签。真机拖动、轨道切换、媒体按键、焦点、耳机断开、首帧性能和原生界面视觉尚未观察，`adb devices` 为空且没有已配置模拟器；浏览器视觉回归只证明前端兼容页面，不能替代原生界面验收。原生构建与页面资源最终收据另行补记，未改安装版本、复制桌面、安装设备或发布。

更新记录：2026-10-12，安卓 Media3 迁移专项 v1.20：同步[安卓需求](../product/android-requirements.md) v0.56、[开发计划](./android-development-plan.md) v1.05 与[接口契约](./api-contract.md) v0.31。保留已完成订阅隔离及来源身份，原生主播放接收已解析 MP4/HLS 和完成下载文件，独立控制与音轨字幕、系统会话及焦点管理；前端按原集/线路续播、保存进度并处理选集和同集回退。原生存在时不创建网页视频元素，来源解析和解码各自使用当前接口。增强/补帧仍属 WebView 兼容能力，不冒充原生效果；本轮不实现后台持续播放/PiP 或 HLS/BT 下载。检查收据后补，原生视觉/解码/系统操作依赖设备，不提交推送或发布。

本轮验收收据（2026-10-12，v1.19）：`pnpm typecheck`、`pnpm build`、`pnpm --filter @sanye/sanye_client build:android` 通过；修复备份校验使用 `Object.hasOwn` 与当前构建库目标不兼容的问题，改用既有运行时兼容写法。联合执行 `node --test --test-concurrency=2 e2e/android-experience.test.cjs e2e/android-cover-cache.test.cjs e2e/android-personal-backup.test.cjs e2e/android-backup-ui.test.cjs e2e/android-system-playback.test.cjs e2e/android-downloads.test.cjs e2e/android-download-playback.test.cjs e2e/android-playback-tools.test.cjs e2e/android-repository-source.test.cjs e2e/android-subscription-source.test.cjs e2e/android-ui-polish.test.cjs e2e/android-playback-resilience.test.cjs e2e/android-search-retry.test.cjs`，51 项通过、0 失败、0 跳过。字幕偏移回归验证 Chromium 禁用轨道时无法读取旧 cues，清理先转 hidden 再删除，避免偏移累加旧字幕。`npm run sync` 与 `pnpm verify:android-assets` 通过，前端与原生工程 27 个资源逐文件 SHA-256 一致；JDK 21 下 `gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug` 成功，XML 共 70 项中 69 通过、1 跳过、0 失败，静态检查 0 错误/8 警告，跳过不视为通过。已查看 `sanye_deploy/.local/android-download-playback/local-playback-390.png`、`.runtime/android-backup-ui.png`，前者媒体请求由测试主动中止，错误画面不代表文件已解码；已有样式回归覆盖深浅主题和字体放大。`pnpm docs:check` 通过 1973 项、0 失败。`adb devices` 无设备：系统选择器、真实文件/云盘、媒体按键/抢焦点、后台服务/通知、重启恢复下载、离线解码和字幕选择均待环境。仅生成本地调试构建供检查，未改安装版本、未复制桌面或安装手机、未发布；远端 CI 未运行。

更新记录：2026-10-12，安卓能力收口专项 v1.19：同步[安卓需求](../product/android-requirements.md) v0.55、[开发计划](./android-development-plan.md) v1.04 与[接口契约](./api-contract.md) v0.30。接通系统备份、真实 MP4 下载/本地播放、音频焦点/系统会话、折叠倍速/字幕/定时暂停与真实来源质量观测；沿用既有配色、字体和竖屏控制条，低频能力折叠，不恢复重复提示。集成回归发现负编号不能作为本地下载身份，已按下载返回地址隔离，保留随包作品与跨订阅续播。完整目录及原生引擎、后台持续播放/PiP、内嵌音轨、HLS/BT 下载、账号同步、投屏弹幕和追番提醒仍未交付；设备与正式签名验收单独保留，不声称全量差距已消除。最终命令收据另行补记，不提交推送或发布。

补充验收（2026-10-12，v1.18）：`node --test --test-concurrency=1 e2e/android-playback-resilience.test.cjs e2e/android-search-retry.test.cjs` 16 项通过、0 失败、0 跳过；`pnpm docs:check` 通过 1967 项、0 失败。既有错误恢复、后台恢复、续播、拖动及搜索重试未因提示精简失效。

本轮验收收据（2026-10-12，v1.18）：`pnpm typecheck`、`pnpm build` 及最终安卓 `build:android` 通过；仓库、订阅来源及网页/安卓订阅管理联合回归 5 项通过，安卓样式回归 1 项通过，覆盖 320/360/390 宽度、深浅主题、字体放大两倍、可见操作不被底栏遮挡。去除小标签后，对比度断言改为实际来源切换按钮，已选订阅断言使用 `aria-pressed`，不恢复重复文案。封面回归暴露历史存在保存作品但缺封面时返回空地址，已补随包占位；底栏检查排除折叠详情内不可见按钮，保留可见按钮几何断言。已查看 `sanye_deploy/.local/android-repository-source/repository-390.png` 和 `sanye_deploy/.local/android-ui-polish/settings-dark-390.png`；后者订阅读取失败来自隔离桥接，不是线上来源结论。仅浏览器和构建证据，未打新 APK，未真机验收或发布。

更新记录：2026-10-12，安卓提示精简专项 v1.18：同步[安卓需求](../product/android-requirements.md) v0.54 和[开发计划](./android-development-plan.md) v1.03。沿用当前配色、字体和布局层级，不引入视觉模板；删除标题前小标签、正常来源说明、搜索重复提示、逐结果流程文字、卡片技术状态和缺简介占位。安卓订阅名称和选择状态不重复标注，地址与规则仍可展开查看；网页模式保留原说明。来源作用域、安全验证、播放链路和评分排序不改变，加载、错误、空态、重试、删除确认继续保留。验证收据另行补记；未打包发布或执行真机验收。

本轮验收收据（2026-10-12，v1.17）：`pnpm typecheck`、`pnpm build`、安卓 `build:android` 通过；`node --test --test-concurrency=1 e2e/android-repository-source.test.cjs e2e/android-subscription-source.test.cjs e2e/android-search-retry.test.cjs e2e/android-playback-resilience.test.cjs` 最终 19 项通过、0 失败、0 跳过。新增断言覆盖订阅库不显示其他本机作品、同正文不同地址仍重新搜索且空库不填充、切换退出旧播放器、切回本机保存作品与原来源续播不受影响。已查看本机 `sanye_deploy/.local/android-repository-source/repository-390.png` 及 `current-subscription-empty-390.png`，证据来自隔离桥接浏览器，不是第三方实播或真机安装；标题标记随当前来源变化。`pnpm docs:check` 通过 1962 项、0 失败；未同步或生成新 APK，手机既有包不会自动加载此变更。

更新记录：2026-10-12，安卓当前订阅隔离专项 v1.17：同步[安卓需求](../product/android-requirements.md) v0.53 与[开发计划](./android-development-plan.md) v1.02。修复订阅仓库仍渲染全部本机作品、同正文不同地址不触发切换、旧请求在切回时被复用的问题。作用域及切换代次隔离搜索、候选与详情，旧播放器退出；本机数据不删除，订阅空结果不回填默认目录。执行证据在本轮收据补记；手机和第三方来源待环境，不声称已安装版本生效，不提交推送或打包发布。

最终复核（2026-10-12，v1.16）：安卓 17 个相关文件以 `node --test --test-concurrency=4` 执行，50 项通过、0 失败、0 跳过；订阅管理安卓专项另 1 项通过。修正结果列表结构选择器、固定底栏下真实指针居中定位，并让回退夹具采用符合现有作品身份守卫的同名作品，不放宽跨作品播放保护。`pnpm typecheck`、`pnpm build`、安卓 `build:android` 通过；`npm run sync` 后 `pnpm verify:android-assets` 的 27 个页面资源逐文件 SHA-256 一致，校验对象为原生工程目录，不是旧 APK 或已安装手机。真实公网订阅只读核对：`css1.json` 返回 18 个 `web-selector` 来源、`bt1.json` 返回 2 个 `rss` 来源，证明配置类型不同，不证明各来源可实播。`adb devices` 未发现连接设备；未生成或安装新 APK，未提交推送或部署。文档检查 `pnpm docs:check` 通过 1957 项、0 失败。

更新记录：2026-10-12，安卓真实来源与产品状态专项 v1.16：同步[安卓需求](../product/android-requirements.md) v0.52、[安卓开发计划](./android-development-plan.md) v1.01、[接口契约](./api-contract.md) v0.29。调查发现裸 URL 单值上下文会跨订阅串用、同主机多规则默认首项；现以规则快照及原始来源编号传到预览、选集和解析，并隔离保存作品/历史及跨来源进度。原生同地址多规则、过滤不重编号、歧义/非法编号及安全归属单元测试通过；55 项中 54 通过、1 个在线夹具跳过、0 失败，静态检查 0 错误、7 个既有警告。浏览器新冲突场景实际断言甲规则 1 → 乙规则 1 的解析地址不同、甲保存作品及重启续播继续使用甲规则 1、全链路不走内置桥接；来源筛选、320/390/430 窄屏及订阅无排期空态同时覆盖。与历史竞态、仓库隔离、播放恢复联合回归 18 项通过。来源作用域和结果元信息为安卓专属，保留现有主题；已查看本机 `sanye_deploy/.local/android-subscription-identity/search-320.png` 与仓库截图，均为隔离数据，不是线上片单。修复历史续播离页播放器覆盖层；旧结构选择器改为实际结果列表，未降低交互断言。已通过 `pnpm typecheck`、`pnpm build`、安卓 `build:android`；进一步验收收据在下方追加。真机解码、第三方线路实播、旧记录未保留规则的无损还原与正式发行仍未证明，不能称为所有前端已完成企业级验收。

本轮复核收据（2026-10-12，v1.15）：`pnpm typecheck`、`pnpm build` 与安卓 `build:android` 通过；播放器、仓库、订阅来源、重试、主题和布局联合回归 11 项通过；播放恢复回归 14 项通过（含嵌套用例）；最后移除安卓冗余折叠入口后，订阅管理（网页与安卓）、主题及布局回归 8 项通过。`npm run sync` 已同步原生工程页面，`pnpm verify:android-assets` 复核原生工程页面资源，不代表旧 APK 已更新；本轮没有执行 `assembleDebug` 或手机安装。文档检查 `pnpm docs:check` 通过 1952 项、失败 0 项。

更新记录：2026-10-12，安卓搜索与竖屏专项 v1.15：同步[安卓需求](../product/android-requirements.md) v0.51、[安卓开发计划](./android-development-plan.md) v1.00、[接口契约](./api-contract.md) v0.28。前台优先队列、旧关键词取消、订阅连接中断关闭与全局槽释放已实现；原生 `gradlew --offline :app:testDebugUnitTest :app:lintDebug` 成功，54 用例中 53 通过、1 个既有在线夹具跳过、0 失败，静态检查 0 错误、7 个既有警告。订阅直选与自动更新、竖屏下置控制条及视频画布几何分别由订阅管理、播放器浏览器测试验证。截图为本机临时目录 `sanye-android-portrait-{360,390,430}.png`；测试中的设置失败提示来自隔离桥接故障夹具，不是新增线上故障。文案检查移除动态内容固定字数上限，保留重复说明、布局溢出和主题验收；修复“我的订阅”标题跳级。浏览器与原生单元证据不等于真机验收，旧 APK 未加载新前端；未打包发布、未提交推送或部署。

更新记录：2026-10-12，安卓仓库与加载专项 v1.14：登记[安卓需求](../product/android-requirements.md) v0.50、[安卓开发计划](./android-development-plan.md) v0.99、[接口契约](./api-contract.md) v0.27。仓库和首页跟随当前订阅显示真实搜索候选，按实测搜索响应与已读取选集排序、同名去重、最多 40 部；切换订阅清理旧候选，迟到结果不覆盖新来源。当前格式没有目录接口，实际片数由来源返回决定，不以测试样例冒充线上片单。封面补同卡片懒加载地址提取、首屏优先、有限主机预连接、失败占位，复用 WebView HTTP 缓存和随包封面，未新增持久图片缓存。竖屏控件去重复安全区并保持单行，菜单脱离布局。当前工作区本地证据：`pnpm typecheck`、`pnpm build`、`pnpm --filter @sanye/sanye_client build:android` 通过；`node --test e2e/android-repository-source.test.cjs e2e/android-subscription-source.test.cjs e2e/android-search-retry.test.cjs e2e/android-ui.test.cjs e2e/android-ui-polish.test.cjs` 6 项通过；`gradlew --offline :app:testDebugUnitTest :app:lintDebug` 通过，订阅引擎 9 项无失败。已查看 `sanye_deploy/.local/android-repository-source/repository-390.png`（隔离桥接、故意失败封面的测试截图，不是真实来源片单）。参考开源实现只用于职责设计，未复制源代码。真实外站封面耗时、真机 WebView 缓存与触控、第三方视频实播保持待环境；未重打 APK、未提交推送或部署，不能称为所有前端已完成企业级验收。

更新记录：2026-10-10，安卓交付专项 v1.13：登记[安卓原生工程](../sanye_android/README.md) v0.81 与[安卓开发计划](./android-development-plan.md) v0.98，交付桌面 v69 测试包，安装版本 5.5、内部版本 46。页面资源与实际 APK 逐文件校验、桌面哈希与 Android Debug v2 签名验证通过；30 项浏览器回归和 Gradle 构建/单元测试/静态检查通过。新增订阅编码兼容性修复已复检；真机、第三方来源长期可用性和正式签名仍为待环境，未部署网页或服务端、未提交推送。

更新记录：2026-10-10，订阅专项 v1.1：登记[接口契约](./api-contract.md) v0.26、[功能规格](../product/feature-specification.md) v0.34、[安卓需求](../product/android-requirements.md) v0.49。接入声明式搜索/选集/静态媒体解析与 RSS 资源入口；不执行脚本，未实现 BT 内置下载引擎。验证入口为 `SubscriptionPlaybackServiceTest`、`SubscriptionSourceEngineTest`、`e2e/subscription-playback.test.cjs`、订阅管理及安卓播放回归。真实外站可用性、真机、部署和发行物保持待环境。

更新记录：2026-10-10，订阅专项 v1.0：同步[接口契约](./api-contract.md) v0.25、[安卓需求](../product/android-requirements.md) v0.48 和[功能规格](../product/feature-specification.md) v0.33；实现公网 JSON 传输与本机订阅管理，来源引擎仍未适配。验收入口为 `SubscriptionFetchPolicyTest`、`e2e/subscription-manager.test.cjs`、类型检查与两种前端构建；安全检查覆盖内网/保留地址、重定向、响应大小与超时，不以浏览器模拟证明真机或外站播放。

更新记录：2026-10-10，全端升级专项 v1.0：登记[功能规格](../product/feature-specification.md) v0.32 与[安卓开发计划](./android-development-plan.md) v0.97，覆盖网页客户端全页面简约化、安卓字体放大、真实集数展示及随包来源候选保留。外部参考链接与来源适配状态分开记录；源码/浏览器/响应头证据不得推导真机、完整解码或发布验收。保留前轮全部未提交修复，不更改数据库和发行物。

更新记录：2026-10-10，安卓专项 v1.12：登记 `frontend-design` 已安装且本轮按该技能重新实施前端视觉升级；同步[安卓需求](../product/android-requirements.md) v0.47 与[安卓开发计划](./android-development-plan.md) v0.96。简约化以页面内容层次和海报为主，保留既有播放逻辑及真实空态/错误态；当前范围不含外部内容源新增或 APK 发布，真实 Android 验收仍为待环境。

更新记录：2026-10-10，安卓专项 v1.11（承接 v1.10，未发布 APK）：登记 [安卓开发计划](./android-development-plan.md) v0.95 的 Animeko 播放体验参考改造。保留当前 WebView/HLS 架构和用户界面修改；限定同集线路回退、播放代次隔离的异步续播、分缓冲状态的单在途定位及相邻集预热。源码和浏览器回归与真实 Android 验收分开记录，数据库主键及发布基线未变更。

更新记录：2026-10-10，安卓专项 v1.10（交付 v68，`versionCode 45`／`versionName 5.4`；承接 v1.09）：按用户「进行修复，并绕过本地 head 提交推送，放最新安卓的版本到桌面，应该不是 v45」收口三件事。其一，**发现并修掉交付链的静默缺陷**：本地打包此前只跑 `build:android` + gradle、漏 `cap sync`，包内 `sanye_android/android/app/src/main/assets/public` 停在 2026-09-30 18:03 的同步；第一次打出的 v68（11,451,490 字节）包内 `index.html` 引用 `index-C3meCUND.js`／`index-BZRm-DRh.css`，而当时前端构建是 `index-DhS4HkVu.js`／`index-DQDnXRIr.css`——「构建成功、包是旧页面」，且 `.gitignore` 忽略该目录使 git 状态完全看不出来。修正后交付链固定为 `generate-catalog.cjs` → `build:android` → `cd sanye_android && npm run sync` → `gradlew`，重新打包得到 11,464,143 字节、SHA-256 `818255BFA370BE6D4854D93E5C4CD76CC1410921FF60424D9C643856B354A3FE`（与构建产物 `app-debug.apk` 逐字节一致）的 v68 并投递桌面；中间产物归档两份：`…-v68-未同步资源废弃版.apk`（11,451,490 字节，包内旧资源）与 `…-v68-来源快照变体废弃版.apk`（11,464,143 字节，见其四）。其二，把这条比对做成门禁：新增 [sanye_deploy/verify-android-assets.mjs](../sanye_deploy/verify-android-assets.mjs)（逐文件比对包内资源与 `sanye_client/dist-android` 的文件名与 SHA-256，忽略 Capacitor 生成的 `cordova.js`／`cordova_plugins.js`）＋[8 项单元测试](../sanye_deploy/verify-android-assets.test.mjs)（一致、漏同步、旧构建残留、忽略项、嵌套目录、目录缺失、默认路径、真实仓库自检），接入 `.github/workflows/android-check.yml` 的 `校验包内页面资源与前端构建一致` 步骤，并登记进[质量门禁](./quality-gates.md)、[CI/CD](./ci-cd.md) 与[工作流说明](../.github/workflows/README.md)。其三，**回读远端并补上前一轮的未验证项**：提交 `a23d944` 在 `feature-T-B-01`／`dev`／`test`／`release` 四个分支上，`ci` 六项必需检查（文档一致性、前端类型与构建、后端编译与测试、浏览器安全回归、依赖漏洞扫描、密钥扫描）与 `android-check`／`desktop-check` 全部成功（ci #30 38017708131、#31 38017985929、#32 38018285625、#33 38018588007），`dev`（109810c→）、`test`（ffdd42e→）、`release`（f1d82b3→）均已快进同步到同一提交，v1.09 里「远端复跑结果尚未回读」到此闭环。证据：`pnpm verify:android-assets`（修复前 27/29、8 项差异；修复后 27/27、逐文件一致）、`pnpm test:verify-android-assets`（8 通过）、`gradlew --offline :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`（BUILD SUCCESSFUL）、`apksigner verify --verbose`（退出码 0，v2 方案通过，签名者 1 个）、`aapt dump badging`（`versionCode 45`／`versionName 5.4`／`sdkVersion 29`／`targetSdkVersion 36`／`application-label:'三叶动漫'`）、GitHub Actions API 回读四分支作业结论。其四，**门禁抓到一次数据驱动的真实退化**：交付链第一步 `generate-catalog.cjs` 本轮把《你的名字》的随包候选来源由 4 条收窄成 1 条（只剩 `yinghuadongman.org.cn/p/52685/`），据此打出的包让 3 项安卓 e2e 场景失败——`android-bundled-fallback` 的「外站来源过慢」与「外站线路加载失败」两项静默回退场景、`android-ui` 的「切换备用来源」按钮点不动；本地按工作流原命令复现为 55 项 52 通过 3 失败，CI `android-check` #14（run 38019831269）同样卡在 `安卓前端回归（隔离桥接）`，失败注解正是这三项。候选来源只剩一条时应用确实没有备用来源可切，属真实功能退化而非断言过时，因此回退该数据改动、保留既有快照（4 条候选来源），回退后同一条命令 55 项 55 通过 0 失败，并重新打包覆盖交付 v68。留下两条待办：生成器不应把既有候选来源收窄到 1 条；安卓 e2e 目前把随包来源写成常量，宜改成从 `catalogSnapshot.ts` 推导。未验证范围：真机覆盖安装与启动画面观感（需设备与用户验收）；远端复跑方面，`ci` 六项必需检查在 df77cea 上通过并据此同步了 dev/test/release，但 `android-check` 在 df77cea 上失败，由本次回退提交修复后重新同步；`release-candidate` 仍按发布门禁保留 JDK 21.0.12，登记为 `blocked-external`。


更新记录：2026-10-10，Trivy 侧门禁收口专项 v1.09（承接 v1.08，闭环第一次远端判定）：`文件系统漏洞门禁` 在 run id 38017074601 给出真实命中——5 条唯一（去重前 33 条），严重 4／高 1，阻断 3 条：`org.jsoup:jsoup` CVE-2026-75140（已安装 1.18.3 → 修复 1.23.2）、`org.springframework:spring-webmvc` CVE-2026-47890（首次只按 `spring-webflux` 登记，包名不符被拦下）、`org.springframework:spring-webflux` CVE-2026-47892（Jackson 之后新暴露的同批命中）。据此三件事。其一，jsoup 三处声明同步 1.18.3→1.23.2：两套后端模块 `sanye_server/sanye-server-anime/pom.xml`、`sanye_server/sanye-server-search/pom.xml` 与 [sanye_android/android/app/build.gradle](../sanye_android/android/app/build.gradle)；安卓包内容随之变化，按仓库既有做法换版本号 `versionCode` 45／`versionName` 5.4（同号不同内容会与已交付的 v44 混淆），重建 debug 11,451,490 字节、未签名 release 2,738,725 字节（v44 分别为 11,382,802／2,722,221），`:app:testDebugUnitTest` 32 项 31 通过 1 跳过 0 失败、`:app:lintDebug` 0 error／7 warning、`aapt dump badging` 复核版本号与「仅 debug 带 `application-debuggable`」；本轮只升依赖与重建验证，功能未改、也未重新交付到桌面。其二，[sanye_deploy/audit-trivy.mjs](../sanye_deploy/audit-trivy.mjs) 的豁免匹配由「按漏洞 ID」改为「按漏洞 ID ＋ 包名」配对：同一个 CVE 会同时命中 `spring-webmvc` 与 `spring-webflux`，只写一条会让另一条以「包名不符」被阻断，且旧写法会把同名条目误判失效；单元测试补到 13 项（新增「同一 CVE 命中多个包时按包分别登记」，改名「包名与命中不一致时不放行」）。其三，[sanye_deploy/audit-exemptions.json](../sanye_deploy/audit-exemptions.json) 补登记 `CVE-2026-47890` 的 `spring-webmvc` 条目与 `CVE-2026-47892` 的 `spring-webflux` 条目（连同既有的 `CVE-2026-47884`／`spring-webmvc`、`CVE-2026-47890`／`spring-webflux` 共 4 条，复核期限均为 2027-01-10），原因一致：Maven Central 上 6.2.x 线止于 6.2.19、修复只出现在 Spring Framework 7.0.9，须随 Spring Boot 4.x 迁移消除。证据：`pnpm test:audit-trivy`（13 通过）、`pnpm test:audit-deps`（13 通过）、按该远端报告复刻的 `trivy-report.json` 模拟（4 条唯一严重命中全部登记后退出码 0；抽掉一条登记即「失效豁免 1 条」并退出码 1）、`mvn -B -ntp -f sanye_server/pom.xml test`（jsoup 1.23.2，BUILD SUCCESS）、安卓 `gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:assembleRelease`（BUILD SUCCESSFUL）、`pnpm docs:check`（1925 项通过、0 失败）。未验证范围：本次推送后的远端复跑结果（`依赖漏洞扫描` 是否转绿、`ci` 六项必需检查能否同时为绿）尚未回读；`release-candidate` 仍按发布门禁保留 JDK 21.0.12，登记为 `blocked-external`。

更新记录：2026-10-10，Trivy 侧门禁收口专项 v1.08：`前端依赖审计` 转绿后，`依赖漏洞扫描` 作业的失败点前移到 Trivy 的 `文件系统漏洞扫描`（注解只显示 `Process completed with exit code 1`），而公开仓库不登录读不到作业日志——先给该步骤加 `output` 与「结论打成 `::error::` 注解 ＋ 上传报告」，把命中项读出来：`Total: 34 (HIGH: 30, CRITICAL: 4)`，其中 30 条高全是 `com.fasterxml.jackson.core:jackson-core` 2.21.5 的 CVE-2026-89407 与 CVE-2026-89425 在各模块 `pom.xml` 与 fat jar 里重复出现（Trivy 报的修复版本为 2.18.11／2.21.7／2.22.3）。据此落地三件事。其一，两套后端 Jackson 统一 2.21.5→2.21.7（[sanye_server/pom.xml](../sanye_server/pom.xml) 的 `jackson-bom.version`、[sanye_admin_server/pom.xml](../sanye_admin_server/pom.xml) 的 `jackson.version`），命中降到 4 条（`Total: 4 (HIGH: 0, CRITICAL: 4)`）；本机 `mvn -B -ntp -f sanye_server/pom.xml test` 与 `mvn -B -ntp -f sanye_admin_server/pom.xml test`（JDK 21.0.12）均 BUILD SUCCESS，`dependency:list` 回读 `jackson-core`／`jackson-databind` 为 2.21.7。其二，Trivy 的判定从 Action 挪进脚本，避免 Action 的 `exit-code` 与登记式豁免出现两套结论：Action 改为 `format: json`＋`output: trivy-report.json`＋`exit-code: 0`，新增 [sanye_deploy/audit-trivy.mjs](../sanye_deploy/audit-trivy.mjs) 按「漏洞 ID ＋ 包名 ＋ 已安装版本」去重后判定，只阻断**可升级修复**的高危/严重命中，并与 `pnpm audit:deps` 共用 [sanye_deploy/audit-exemptions.json](../sanye_deploy/audit-exemptions.json)——登记文件新增 `source` 字段区分 `pnpm`／`trivy` 来源，两边各看各的登记项（pnpm 侧不再把 trivy 条目误判为失效），豁免过期或登记项在本次扫描里不再出现同样判失败；结论写进 `trivy-conclusion.txt` 并整段打成注解，连同 JSON 报告一起上传。其三，剩余的 2 条严重命中 `org.springframework:spring-webmvc` CVE-2026-47884 与 `org.springframework:spring-webflux` CVE-2026-47890 唯一修复版本是 Spring Framework 7.0.9，而 6.2.x 线已到 6.2.19（Maven Central 核对）仍无回补版本，升级须连带 Spring Boot 3.5→4.x（Jakarta EE 11／Spring Security 7）迁移，超出本次范围，故登记为待迁移项（`reviewBy` 2027-01-10），并在[版本基线](./version-baseline.md)增加 Spring Framework 6.2.19 `managed/待迁移` 行；[质量门禁](./quality-gates.md)与[CI/CD](./ci-cd.md) §2.4 同步改写为登记式门禁。证据：`pnpm test:audit-trivy`（12 通过）、`pnpm test:audit-deps`（13 通过）、`pnpm audit:deps`（7 条告警、0 阻断、0 过期、0 失效）、按远端报告复刻的 `trivy-report.json` 模拟（4 条重复命中 → 2 条唯一命中、0 阻断、退出码 0；把 CVE 换成未登记编号即退出码 1 并给出「可升级到 7.0.9 修复」）、`pnpm docs:check`（1925 项通过、0 失败）、远端注解（run 38015791524 的 `Total: 34`、run 38016685345 的 `Total: 4`）。未验证范围：本次推送后的远端执行结果（`依赖漏洞扫描` 是否转绿、六项必需检查能否同时为绿）尚未回读；`release-candidate` 仍按发布门禁保留 JDK 21.0.12，登记为 `blocked-external`。

更新记录：2026-10-10，依赖审计与门禁收口专项 v1.07：用户在选项确认「升级可修依赖 + 为上游无修复项做登记式豁免」后落地三件事。其一，升级可修依赖：[sanye_desktop/package.json](../sanye_desktop/package.json) 的 `electron-builder` 26.0.12→26.15.3（根 `pnpm.patchedDependencies` 随之改成 `app-builder-lib@26.15.3` 并删除 26.0.12 补丁；26.15.x 的签名入口是 `signIf`，`packaging.test.cjs` 的 NSIS 临时生成器用例改为同时注入 `sign`/`signIf`），`sanye_client`／`sanye_admin`／`sanye_pet` 的 `vue` 3.5.13→3.5.43，并在根 `package.json` 增加 `overrides`（`brace-expansion@1/2/5`、`source-map-js`、`undici`、`ip-address`）。升级后 `pnpm-lock.yaml` 里 `@electron/rebuild` 3.7.0→4.2.1、`node-gyp` 12.4.0 走 registry，`@electron/node-gyp` 的 git 依赖彻底消失——本机 `pnpm install` 先前正是卡在它的 `Host key verification failed`，干净环境不会再依赖 SSH 凭据。本机 `pnpm audit --json` 的告警由 43 条（3 low／18 moderate／21 high／1 critical）降到 7 条（6 moderate／1 high／0 critical）。其二，新增登记式依赖门禁 [sanye_deploy/audit-dependencies.mjs](../sanye_deploy/audit-dependencies.mjs) 与 [sanye_deploy/audit-exemptions.json](../sanye_deploy/audit-exemptions.json)，[ci.yml](../.github/workflows/ci.yml) 的 `前端依赖审计` 由 `pnpm audit --audit-level high` 改为 `pnpm audit:deps`：只有可升级修复的高危/严重告警阻断；上游无修复（`patched_versions` 为 `<0.0.0`）的条目必须登记、包名一致且未过 `reviewBy` 才放行，登记项在审计结果里已不存在也判失效——与同一作业 Trivy 的 `ignore-unfixed: true` 语义对齐。当前登记两项：`http-cache-semantics`（high，GHSA-ch52-4w7c-c8xp，构建期 HTTP 缓存链）与 `sprintf-js`（moderate，GHSA-hp3w-g68c-fv3c），复核期限均为 2027-01-10。其三，修掉桌面门禁在干净检出上的第二组失败：`postgresTemplate.test.cjs`（9 处）与 `runtime.test.cjs`（1 处）用 `fs.mkdtemp(path.resolve(__dirname, '../sanye_deploy/.local/…'))` 建临时目录，而 `sanye_deploy/.local/**` 被 `.gitignore` 忽略、干净检出里不存在且 `mkdtemp` 不创建父目录，`windows-2025` runner 上 9 条用例因此统一 ENOENT 失败；改为 `tempBase()` 先建父目录再 `mkdtemp`。证据：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm build`、`pnpm test:desktop`（把 `.local` 与 `runtime` 同时移走后 69 项为 65 通过 4 跳过 0 失败）、`pnpm audit:deps`（7 条告警、0 阻断、0 过期、0 失效）、`pnpm test:audit-deps`（13 通过）、`pnpm --filter @sanye/sanye_client build:android` 与 15 个安卓 e2e 文件（53 通过 2 跳过 0 失败）、`pnpm e2e:ci`、`pnpm docs:check` 通过 1925 项、失败 0 项。远端：分支 `feature-T-B-01` 在 `9663202` 的 `android-check` 作业已 `success`（整套安卓前端回归 53 通过 2 跳过，Gradle 构建、单元测试与 `lintDebug` 全绿），`ci` 六项中五项通过，`desktop-check` 的失败注解首次读出真实用例名（`postgresTemplate.test.cjs` 的 9 条），本次推送后应随 `.local` 修复转绿；`依赖漏洞扫描` 的红项预期由登记式门禁消除。未验证范围：三项修复的远端执行结果（`pnpm audit:deps` 在 `ubuntu-latest` 的实际输出、`desktop-check` 是否转绿、六项必需检查能否同时为绿）尚未回读，`release-candidate` 仍按发布门禁保留 JDK 21.0.12 并登记为 `blocked-external`。

更新记录：2026-10-10，CI 门禁修复专项 v1.06：用户要求「同步 dev/test/release 分支」，而直接推送被分支保护拒绝（`6 of 6 required status checks are expected`）。公开仓库的 Actions 结果可以直接查，于是不再靠推测：`feature-T-B-01` 每次推送都触发 `ci`／`android-check`／`desktop-check`，逐作业查 `actions/runs`＋`check-runs/{id}/annotations` 后看到真实原因——失败点不是依赖审计，而是 JDK 版本漂移。`ci.yml` 两处与 `android-check.yml` 把 `java-version` 写成 `21.0.12`，而 Microsoft 发行版索引当前只提供到 21.0.11，注解原文为 `No matching version found for SemVer '21.0.12'`（可用版本 25.0.3、21.0.11、21.0.10…），于是 `后端编译与测试`、`依赖漏洞扫描`、`android-check` 三个作业全部在 setup-java 阶段中断，根本没执行到 Maven 与审计；`desktop-check` 用的 21.0.11 因此正常通过该步。这与 [CI/CD](./ci-cd.md) 2026-09-10 已登记的决策（「持续集成显式使用下载源可用的 Microsoft JDK 21.0.11，本机 21.0.12 基线保留」）一致，属工作流回退造成的漂移，现改回 21.0.11 并在工作流内留下原因注释；候选发布工作流按发布门禁保留 21.0.12，仍为登记在案的 `blocked-external`。同一轮修掉桌面门禁在干净检出下的固有失败：`sanye_desktop/runtime/**`（548MB，含 PostgreSQL 模板与 Java 运行时）被 `.gitignore` 忽略、需本地 `pnpm desktop:prepare`，而 `postgresTemplate.test.cjs` 里唯一那条「模板复制还原 ZIP 丢掉的空目录」用例只按 `platform !== 'win32'` 跳过，`windows-2025` runner 上必然失败；把 `sanye_desktop/runtime` 移走后本机复现为 69 项中 65 通过 1 失败 3 跳过（失败项即该用例），补上 `runtime/postgres-template` 存在性守卫后为 65 通过 4 跳过 0 失败，本机准备好运行时仍是 69 通过。远端验证：修复前 `文档一致性检查`、`前端类型检查与构建`、`浏览器安全回归`、`密钥与敏感信息扫描` 四个必需检查已通过，修复后 `后端编译与测试` 也通过（run 38013106312），只剩 `依赖漏洞扫描` 卡在 `pnpm audit --audit-level high`；同一轮里 `android-check` 的失败也被注解点名：TAP `not ok 3 - e2e/android-catalog-snapshot.test.cjs`，原因是该文件在顶层读 `sanye_desktop/runtime/seed.sql`（同样被忽略），整个文件 ENOENT，现改为缺 seed 时跳过依赖它的 2 项、只跑比对 `catalogSnapshot.ts` 与来源候选逻辑的那项，本机模拟无运行时为 53 通过 2 跳过 0 失败、有运行时为 55 通过；两条门禁同时改成失败时输出 `::error::` 注解并上传完整日志，公开仓库不登录也能读到失败用例名；`依赖漏洞扫描` 这项检查本机复现为 43 条（21 high／1 critical），其中 `http-cache-semantics`（`patched_versions` 为 `<0.0.0`）没有上游修复、`pnpm audit` 又没有 Trivy 那侧的 `ignore-unfixed` 等价语义，该检查能否变绿取决于依赖升级或登记豁免的决策，详见 [CI/CD](./ci-cd.md) §2.4 与 §6。

更新记录：2026-10-09，CI/仓库内容专项 v1.05（随 VQ-62 一起交付）：按用户「优化 github 上的内容」收口仓库侧门禁与协作入口。其一，`.github/workflows/android-check.yml` 补 `:app:lintDebug`（异常兜底、无效资源与废弃 API 这类问题单元测试看不到，`app/lint.xml` 已登记三类误报）并把单元测试 XML 与 lint 报告改成 `if: always()` 上传；同时补 `push` 触发（`feature-*`/`dev`/`test`/`release`，带路径过滤）与 `concurrency`——分支模型是直接推送，只在 `pull_request` 上跑等于这道门永远不生效，与 `ci.yml` 保持一致。其二，`.github/workflows/desktop-check.yml` 同样补 `push` 触发与 `concurrency`（路径过滤保持一致）。其三，`.github/workflows/README.md` 此前只登记 `ci.yml`，现补齐四个工作流（`ci`/`android-check`/`desktop-check`/`release-candidate`）的触发条件、检查项与报告留存。其四，新增 `.github/PULL_REQUEST_TEMPLATE.md`（范围、自查清单、验证证据、回滚方式，逐项对应 AGENTS.md 与[开发流程](./development-plan.md)）与 `.github/ISSUE_TEMPLATE/config.yml`（指向协作规范、开发任务清单与 [CI/CD](./ci-cd.md)）。其五，[CI/CD](./ci-cd.md) 升到 v1.10，补记两个专项工作流并在本地等价命令里登记安卓与桌面入口。证据：`node sanye_deploy/check-docs.mjs` 通过 1888 项、失败 0 项；安卓门禁与构建证据见[安卓原生工程](../sanye_android/README.md) v0.78。未验证范围：GitHub 远端实际执行结果与分支保护状态未在本机联网核对（`gh` 未安装），四个工作流只做了本地等价命令与 YAML 结构复核。分支同步状态：本次交付已推送到远端 `feature-T-B-01`，`dev`、`test`、`release` 受分支保护（远端返回 `6 of 6 required status checks are expected`，直接推送被拒），需要从 `feature-T-B-01` 发起 PR 并通过六项必需检查后再按 `dev → test → release` 推进。六项必需检查的本地等价复核：`node sanye_deploy/check-docs.mjs` 1925 项通过、`sanye_deploy/release/release.test.mjs` 10 项、`pnpm test:player-policy` 15 项、`pnpm test:admin-auth` 2 项、`pnpm test:recovery` 15 项、`pnpm test:sensitive-config` 8 项、`pnpm typecheck`、`pnpm build`、`pnpm e2e:ci`（4 个脚本）、`mvn -B -f sanye_server/pom.xml test` 与 `mvn -B -f sanye_admin_server/pom.xml test`（JDK 21 下 BUILD SUCCESS）、安卓门禁 15 个文件 55 项全部通过；只有 `dependency-scan` 这一项本地不通过——`pnpm audit --audit-level high` 报 43 条（3 low／18 moderate／21 high／1 critical），其中前端条目（`@vue/server-renderer@3.5.13`、`source-map-js@1.2.1`）在 dev 锁文件里版本完全相同，属于 advisory 数据漂移，其余为桌面工具链（`electron-builder 26.0.12 > app-builder-lib > tar@6.2.1` 等）与 dev 侧 v0.11 已升级打包链的差异；该项需要单独的依赖升级任务，本机未在无真机与无签名材料的前提下改动打包链。合并另一处需要记录的取舍：dev 与工作区在同一段实现上各有改动，`git merge` 的自动结果会在 `sanye_client/src/views/searchView.vue`、`animeDetailView.vue` 与 `e2e/e2e-season-order.mjs` 三个文件里把两侧实现拼在一起（`vue-tsc -b` 报 `Cannot find name 'page'/'ResultEntry'` 等），已按工作区一侧收敛。

更新记录：2026-10-09，安卓专项 v1.04（VQ-62，重建 debug 与 release）：按用户「检查一下安卓项目中的任何问题还有能优化的地方吗，这是最终的修改了」对安卓工程做全量审计并逐条落地，明细与逐条证据见[安卓原生工程](../sanye_android/README.md) v0.78、[安卓开发计划](./android-development-plan.md) v0.92。审计发现按严重度分四类。其一，异常会打死插件线程（最严重）：Capacitor 把所有插件方法投递在同一条 `CapacitorPlugins` 线程上，而 `Bridge.callPluginMethod` 对插件方法抛出的异常是 `catch (Exception ex) { throw new RuntimeException(ex); }`——`getSettings` 的 `database.getReadableDatabase()` 写在 try 之外，库损坏／磁盘写满／版本回退时抛出的异常会让插件线程停摆、这次调用永不返回，此后所有本地数据功能一起失效；同类还有 `clearMediaCache` 只 catch `IOException`、`search`／`preview` 在池已 `shutdownNow` 后的 `RejectedExecutionException`。现分别把取库移入 try、改为 catch `Exception`、提交处兜住拒绝并 `reject`。其二，校验与写入会「看起来成功」：控制字符校验用 `matches(".*[\\p{Cntrl}].*")`，而 `.` 默认不匹配换行，控制字符后面跟一个行终止符即可绕过（jshell 实测 `"line1\nline2\n"`、`"a\n\n"`、`"t\n"` 修复前判成合法，`"a\nb"` 因为后面还有非换行字符才会被拒——正是这种半通不通让缺陷长期没被发现），现改为预编译 `Pattern` + `find()` 并补单测；`setSettings` 不检查 `insertWithOnConflict` 的 `-1`，写不进去也 `setTransactionSuccessful()`，界面收到「保存成功」；`SanyePlayerPlugin.handleOnDestroy` 只复位两个布尔量，窗口上的常亮／沉浸式／方向锁会残留。其三，交付包本身（与「能优化」直接相关）：启动主题没设置 `windowSplashScreenBackground`／`windowSplashScreenAnimatedIcon`，Android 12+ 显示系统底色加默认机器人图标（`aapt2 dump resources` 复核），而 `android:background="@drawable/splash"` 在任何 API 上都不会被绘制——11 张 splash.png 共 1020.3KB 是纯死资源；release 未开 R8（`classes.dex` 7,668,792 字节）且无签名位，交付只能退到带 `application-debuggable` 的 debug 变体（`aapt dump xmltree` 复核），等于把 `run-as` 读本地库与 WebView 远程调试一起发出去；随包 FileProvider 的路径表是 `external-path path="."` 与 `cache-path path="."`，而代码里没有任何一处使用它。现分别显式设置三个启动画面属性、删除死资源与模板残留、开 `minifyEnabled` + `shrinkResources`（未签名包 10,544,350 → 2,722,221 字节）并用 `mapping.txt`／`seeds.txt` 复核插件类与 `@JavascriptInterface` 方法未被改名、签名位改从 `SANYE_RELEASE_*` 读取、移除 FileProvider，另把 `:app:lintDebug` 与 lint 报告接入 `android-check.yml`（并补 `push` 触发与 `concurrency`，否则直接推送的分支跑不到安卓门禁），lint 警告 22 → 6（0 error）。其四，页面侧静默失效两处：暂停时切画质／帧率会 `return` 而菜单仍显示已选中（现给「恢复播放后生效」并在起播时补挂）、`onFirstFrame` 无条件清 `backgroundPaused` 会让后台返回的定格画面失去恢复入口（现只在真正播放时清，并在回到前台且画面仍暂停时补设）。同时收敛两处阻塞与竞态：`closePlayer` 不再 `await reloadHistory()`（写入仍排在 `progressQueue` 上，读取侧的等待语义保留），返回键监听器补卸载竞态兜底。证据：`gradlew --offline :app:testDebugUnitTest :app:lintDebug`（32 项 31 通过／1 跳过／0 失败，lint 0 error／6 warning）、`:app:assembleDebug`（11,382,802 字节）、`:app:assembleRelease`（2,722,221 字节，未签名）、`aapt dump badging`（`versionCode 44`／`versionName 5.3`，仅 debug 带 `application-debuggable`）、`pnpm typecheck`、`pnpm --filter @sanye/sanye_client build:android`、安卓浏览器门禁 15 个文件 55 项通过 0 失败、`pnpm docs:check` 1925/1925。未验证范围：真机安装、启动画面观感、R8 产物运行期行为、真实来源站点与 GBK 站点解码均未在设备上验证；release 产物未签名。

更新记录：2026-10-09，安卓专项 v1.03（VQ-61，未重打包）：按用户「检查页面的样式与自然度有没有问题，以及视频播放的体验」做审计，并按「全部进行修复并更新文档」逐条落地。样式与自然度：其一（唯一被量测确认的样式缺陷），主题令牌 `--page-*`／`--app-*` 只定义在 `.android-app` 上，而挂载失败兜底页写在应用根节点之外，`var()` 全部解析失败——实测卡面 `background rgba(0, 0, 0, 0)`、`border-width 0px`，整页只剩文字浮在页面底色上；现把令牌提到 `:root`（含 `prefers-color-scheme: light` 覆盖与 `color-scheme: dark`），兜底页与画布底色不再依赖应用根节点，门禁改为断言「卡面不透明、边框非 0px、浅色与深色卡面必须不同」。其二，图标系统混用：顶栏 `⌕／☀／☾／→` 与播放器 `▶／❚❚／🔊／🔇／⛶／⤢` 都是自带字形的符号字符，不同码位落到不同系统字体（emoji 字体还会接管），同一行的字面高度与基线并不一致；现统一为 13 枚线性 SVG（`ICONS` + `.android-icon`，与底部导航同一套描边），状态改用 `data-icon` 表达，门禁断言 HUD 与主题按钮的 `data-icon`。其三，颜色与字号令牌化：品牌色 `#eaf2c4`／`#283a55`／`#e7edf5`／`#172438` 收敛为 `--brand-*`（38 处引用）、主题面与文字色走 `--app-*`（49 处引用），字号 64 处改走 8 个 `--font-*`、行高 7 处改走 `--leading-*`，替换逐项取原值（计算样式零变化）；量测口径下「未出现在任何令牌声明里的 hex」由 84 种降到 81 种，剩余 27 处一次性字号与 12 处一次性行高仍是字面量；另补一条 `prefers-reduced-motion: reduce` 的统一收口（此前整表只有按钮一条规则）。其四，竖屏丢功能：`.android-player-tool--more` 整组在竖屏隐藏，连「下一集／选集／音量」都不可用（换集必须先横屏）；现只把画质与帧率（改名为 `--advanced`）留在放大态；全量审计随后抓到这处改动的副作用——系统字体放大 ×2 时「下一集／选集」文字宽 66px 被 44px 固定方块加 `overflow: hidden` 裁掉，现给带文字的工具加 `--text`（宽度跟内容走、仍以工具尺寸为下限），并让紧凑条允许换行（×2 下加宽又把最右「放大」挤出屏幕，实测 353..395；两行工具条优于裁字或横向溢出），改完后该场景问题种类 0。播放体验：其一（最严重），放大/全屏时舞台是 `position: fixed; inset: 0; z-index: 30`，舞台外的错误块与线路提示完全看不见，用户只看到黑屏且没有任何重试入口；现新增舞台内 `.android-player-alert`（错误／来源错误／缓冲／换线／后台恢复／线路提示六类合并为一条，带「切换线路／重试当前线路／继续播放」），放大态不再渲染舞台外同类提示。其二，首帧之后没有兜底：stall 看门狗的四个分支都带 `hasFirstFrame` 直接返回，出一画面后定格只能等 hls.js 的 `fragLoadingTimeOut`（20 秒）×重试，最坏接近一分半；现 `waiting／stalled` 起 12 秒看门狗（每次 `timeupdate` 清表），超时按线路失败处理，期间给「网络较慢，正在缓冲…」，非致命 `bufferStalledError／fragLoadError／fragLoadTimeOut` 同提示。其三，进度覆盖与续播：`persistProgress` 加「秒级覆盖保护」（同一集已有 >60 秒进度且当前落后 60 秒以上不写），`restorePosition` 精确匹配失败后取同集任意线路最靠前的进度、本地查不到记录时补一次 `reloadHistory(false)` 再落位。其四，取消拖动不回位：`beginSeek` 记录 `seekOriginSeconds`，`cancelSeek` 写回原位并恢复档位预览（此前只改 UI，画面停在被拖到的位置且随后会被当成真实进度保存）。其五，随包线路重试无效：`retryCurrentLine` 此前用 `episode.sourceUrl || episode.id`，而随包线路 id 是 `bundled:<作品>:<线路>`，发给原生会被 `allowedDetail` 按非公网主机拒绝，用户点了没反应；现对没有来源页地址的随包线路直接用原直链重建会话。其六，HLS 移动端参数：补 `capLevelToPlayerSize`、`maxBufferSize: 40MB`（默认 60MB 与 64MB 分片缓存叠加时峰值内存偏高）、`startLevel: -1`，自动降档给出实际档位提示。其七，音量不落盘：新增 `settings.volume`（0–1，原生 `validSetting`／`readSettings` 支持，键值表无需迁移、数据库版本仍为 7），拖动 400 毫秒合并写入、启动恢复，此前每次启动跳回 100%。其八，监听器与计时器：`volumechange` 具名化并在 `disposePlayer` 摘除（此前每次换集多挂一份），`onBeforeUnmount` 收掉 12 个在途计时器。其九，桥接调用缺 JS 侧期限：搜索两处与预览补 15 秒 `withNativeTimeout`，悬空的 `previewPending` 记录随之清理。其十，缓存清理入口：`clearMediaCache` 从此前「声明但从未被调用」变为「我的 → 存储 → 清理媒体缓存」，同时清空原生缓存目录与内存分片表。验证入口：`pnpm typecheck`、`pnpm --filter @sanye/sanye_client build:android`、安卓浏览器门禁 15 个文件 55 项 55 通过 0 跳过 0 失败（新增 `e2e/android-playback-resilience.test.cjs` 8 项并被 `.github/workflows/android-check.yml` 纳入；`android-ui.test.cjs` 与 `android-theme-parity.test.cjs` 同步改断言）、`gradlew --offline :app:testDebugUnitTest`（31 项 30 通过／1 跳过／0 失败）、`pnpm docs:check` 通过。同步[接口契约](./api-contract.md) v0.24（补 `settings.volume`、缓存清理的实际调用面与 15 秒客户端上限）、[数据库设计](./database-design.md) v1.11（`app_settings` 新增 `volume` 键、版本仍为 7、无迁移）、[性能优化指南](./performance-optimization-guide.md) v1.3（新增「安卓播放体验与样式令牌（VQ-61）」一节与复跑行）、[安卓开发计划](./android-development-plan.md) v0.91、[开发任务清单](./development-tasks.md) v3.15、[安卓需求](../product/android-requirements.md) v0.46（新增三条产品验收）与[安卓原生工程](../sanye_android/README.md) v0.77。边界：本轮**无视觉模型可用**，样式结论全部来自计算样式与像素量测（全量审计 `sanye_deploy/.local/android-ui-audit.cjs` 234 个场景问题种类 0；12 个页面×外观截图与 `report.json` 在 `sanye_deploy/.local/android-style-review/`，仅供人工复核，未经看图确认）；真机触控、系统字体放大、真机跨版本迁移与真实来源站点仍未实测；本轮未重建 APK，现有交付仍为 v66。

更新记录：2026-10-09，安卓专项 v1.02（VQ-60，未重打包）：按用户「检查所有接口的响应方式以及速度是否存在不合理的地方」对安卓端做接口响应方式与速度审计并落地修复。审计结论：安卓端不访问网关，其接口就是十四项 Capacitor 桥接方法，而 Capacitor 把全部插件方法投递在同一条 `CapacitorPlugins` 线程上，判定标准因此是「谁占用这条线程、同时有多少调用在排队」。修复六类：其一（最严重），搜索假空——`SanyeSourcePlugin.searchBoth` 在两个入口都失败或超时时返回 `List.of()`、插件再 `resolve({hits:[]})`，界面显示「没有找到匹配作品」，而客户端的静默重试**只对 reject 生效**，重试形同虚设；现改为 `SearchOutcome`：任一入口真的取到页面即为确实无匹配（空列表合法），全失败才 `reject("来源搜索暂不可用…", "E_SOURCE_UNAVAILABLE", failure)`，并新增 e2e 断言「来源不可用时静默重试一次并提示暂不可用，而不是显示没有找到」。其二，排队与期限——搜索此前与详情预览共用 6 线程预览池，而首集探测是阻塞式 HTTP 读、无法中断，池满后搜索连任务都排不上；现搜索独立成 `searches`（2 线程）、竞速池 2→4，`REQUEST_DEADLINE_NANOS` 从任务体内挪到入队前起算（池满的排队时间计入 15 秒整体期限），单测用「占满预览池／探测池后搜索仍须在 500ms 内拿到线程」锁定。其三，本地库——SQLite v6→v7 增加 `saved_media_title (title)` 与 `watch_history_recent_full (updated_at DESC, media_url ASC, episode_id ASC, line_id ASC)`：前者让 v6 的按标题回填从每行全扫片库 O(历史×片库) 降为索引查找，后者与 `listHistory()` 排序完全一致、去掉临时 B 树；标题索引在升级流程中先于回填创建，因此 v5 及更早版本直接升 v7 也走索引；插件装载时以 daemon 线程预热一次数据库，把迁移移出用户首次操作。其四，失败可诊断——`SanyeCatalog` 九个与 `SanyePlayer` 三个方法全部改为带错误码的 `reject(msg, code, ex)`（`E_CATALOG_PARAM`／`NOT_FOUND`／`READ`／`WRITE`／`DELETE`、`E_PLAYER_WINDOW`）并补 `Log.e`／`Log.w`：Capacitor 只在 `ex != null` 时写日志，此前真实 SQLite 异常被静默吞掉，线上只能看到「保存失败」四个字。其五，其它响应方式——`recordProgress` 去掉每 5 秒一次的整行回读（改用 `INSERT OR REPLACE` 返回行号判成败并直接组装返回项，字段由单测锁定）、预览标题缺失不再整次失败、首集探测保留已完成结果、预览缓存超限只淘汰最快过期的一条（原先满 24 条整表清空）、`clearMediaCache` 的 `removed` 计入子目录、`SanyePlayerPlugin` 三方法加 try/catch 与 `handleOnDestroy` 复位、`SanyeSourcePlugin.handleOnDestroy` 关闭四个线程池并清空缓存。其六，客户端——`list`／`listHistory`／`getSettings` 补 8 秒上限（原先只有 `recordProgress` 有超时，读取类一旦不回消息则 `finally` 永不执行、页面永久停在「正在读取」）、封面写入前按原生规则收敛（坏封面降级为空串而不是让整条进度被原生拒绝）、预览标题缺省时回落到搜索命中或已保存作品标题。验证入口：`gradlew --offline :app:testDebugUnitTest`（30 通过／1 跳过／0 失败）、`pnpm typecheck`、`pnpm --filter @sanye/sanye_client build:android`、安卓浏览器门禁 14 个文件 47 项 47 通过 0 失败、`pnpm docs:check` 1849/1849。同步[接口契约](./api-contract.md) v0.23（补搜索错误语义、设置档位、缓存上限、错误码与读取超时）、[数据库设计](./database-design.md) v1.10（安卓 SQLite v4–v7 与索引顺序）、[性能优化指南](./performance-optimization-guide.md) v1.2（新增安卓桥接与本地库条目及复跑证据）、[安卓开发计划](./android-development-plan.md) v0.90、[开发任务清单](./development-tasks.md) v3.14 与[安卓原生工程](../sanye_android/README.md) v0.76。边界：真机跨版本迁移、真实来源站点结构与真机耗时仍未实测，本轮未重建 APK（现有交付仍为 v66）。

更新记录：2026-10-08，安卓专项 v1.01（未重打包）：按用户「现在有些按钮的响应方式与速度存在不合理的地方，进行优化」登记按钮响应方式与速度的六类问题、修复与可复核证据，量测入口 `sanye_deploy/.local/measure-button-response.cjs`（改前／改后 `sanye_deploy/.local/android-button-response/{before,after}.json`）。其一，按住期间没有任何反馈：样式表里**没有匹配按钮的 `:active` 规则**，四个抽样按住 60ms 计算样式全部「无任何变化」（唯一反馈是 WebView 松手后闪一下的 `rgba(0,0,0,.18)` 默认灰罩），`touch-action: auto`（双击缩放等待）、`transition: all 0s`；现补根节点 `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation`、按钮禁选中与长按菜单、`:active` 缩放 .97 + 透明度 .92（80ms 收尾，减少动态效果下只留透明度），并另加按下事件驱动的 `.is-pressed`（根节点 `@pointerdown` 挂上、`@pointerup`／`@pointercancel`／`@touchmove` 复位、1.2 秒兜底）与 `:active` 共用同一条样式。量测方法本身也修正过两次：headless Chromium 的 CDP 合成触摸不会给元素加 `:active`（按住 160ms 仍 `activeMatches=false`），按下反馈必须用真实指针按下测，否则会把「有反馈」误判成「无变化」；而真机是触摸路径，所以触摸按下另按 `is-pressed` 量（四项均 `is-pressed=true`、`transform` 0.971、取消后复位），并验证触摸点按仍能产生 click（导航落到「番剧仓库」）。其二，界面状态等原生写入才变：主题切换与播放速度等 `setSettings` 返回（原生写入 180ms 时 198ms 才变色）、片库收藏等 `setFavorite` 返回（187ms）；现改乐观更新 + 失败回滚 + `settingsRequest` 序号防旧响应覆盖（原生写入 300ms 下实测 3–4ms 生效）。其三，同一动作重复执行：连点两次收藏、连点两次「保存到本机」各写 2 次原生（后者会在本机片库留下两条同地址作品）；现用 `favoritePending`／`previewSaving` 在途守卫，门禁用**同一帧内两次 `button.click()`**（此时 Vue 还没把按钮置为 disabled）验证守卫本身有效，实测各 1 次。其四，在途检索静默丢弃新关键词：`if (sourceLoading.value) return` 让输入即搜的防抖调用被吞掉，实测输入框「第二」而列表仍是「第一」的结果、桥接只收到一次检索；现同一关键词不重复打来源、不同关键词取代旧检索，并让只有最新一次请求收掉 `sourceLoading`，实测两次都发出。其五，破坏性动作用原生对话框：`clearHistory` 的 `window.confirm` 会冻结页面且样式与应用无关；现改为同一颗按钮的两步确认（3 秒自动复位、清除期间禁用、`.is-armed` 用 `--page-danger` 标出），实测第一次点不写原生、确认后只清除一次、`window.confirm` 调用 0 次。验证入口：`node --test e2e/android-button-response.test.cjs`（新增 5 项）与 14 个安卓门禁文件（46 项 46 通过 0 跳过 0 失败）、`pnpm typecheck`、`pnpm build`、`pnpm --filter @sanye/sanye_client build:android`、全量审计 `node sanye_deploy/.local/android-ui-audit.cjs`（234 个场景：问题种类 0，143 个问题实例全部是已锁定取舍）；同步[安卓开发计划](./android-development-plan.md) v0.89 与[安卓需求](../product/android-requirements.md) v0.44（新增「按钮的响应方式与速度」锁定项与两条产品验收条目）。
更新记录：2026-10-08，安卓专项 v1.00（未重打包）：按用户「看一看安卓端的前端的问题，我要求做的完美」做一轮安卓前端复核，登记六类问题、修复与可复核证据。其一（最严重），默认主题是跟随系统 `data-theme=system`，而浅色规则只写了显式浅色 `[data-theme=light]`——系统浅色下页面仍压着深色底与蓝色径向遮罩，实测「收藏」筛选芯片是冷灰 `rgb(215,217,215)–rgb(224,224,220)`（显式浅色为暖色 `rgb(248,238,223)`）、对比度 3.18，片库/历史/详情/播放器整页仍是深色外观；现补齐 23 条系统浅色规则（含 `html:has(...)` 画布底色），两条路径在同一份数据下渲染逐项相同，并加静态门槛（每条显式浅色选择器都必须在系统浅色媒体查询内有对应项）。其二，浅色对比度四处不达标已按 ≥4.5 收口：弱色令牌 4.47→4.95（`#5c6f78`→`#556872`）、列表与目录小字 4.20→5.59（去掉 `#687c84` 覆盖）、详情页导语 4.41→4.95（`#536873`→`#4d606b`）、浅色导航标签 4.46→5.40（改用令牌）。其三，播放器浮层列表行 24–28px 低于 v0.14 的 36px 契约（「关闭」实测 30×28），现统一 36×36，并把帧率浮层像素上限 262→306px 以一次显示 8 行（296px 内容）。其四，放大态控件行在 320–360px 上溢出（内容 356px > 行宽 296／336px），最右「退出横屏」位于 326..368、320px 下完全出屏，现只在放大态换行且末位键贴右，竖屏紧凑条保持不换行。其五，死代码与失效项：重复的主题令牌组、`.android-history-rail`／`.android-history-card` 死样式 6 条、只写不读的 `playerLoading`、死函数 `togglePlayerMute`、v0.14 就已失效的「自动播放」开关行全部删除；首页导语由单部作品的 2 条线路改为整包 6 部作品 71 条线路。其六，审计工具 `sanye_deploy/.local/android-ui-audit.cjs` 补遮挡判定（`elementFromPoint`）与逐元素截图复核，去掉整屏坐标映射造成的幻影背景结论，字号下限由 11px 收到设计系统实际的 10px；再加两道护栏——元素未完整露出视口时不采样（横向货架里被 `overflow` 裁掉的第三张卡，其 `small` 的自身截图含画布底色，被误报成 3.16／背景 `rgb(8,20,40)`），以及不达标时隔 200ms 复采一次。其七，浅色主题的两处「深色残留」：`:root` 的 `#081428` 此前只被 `body` 覆盖，页面外（滚动回弹、被裁切区域）会露深色，现补 `html:has(.android-app[data-theme=light])` 与系统浅色同名规则；挂载失败兜底页写死的深色卡面与浅黄字按钮改为主题令牌 + 全局药丸按钮配色（浅色下按钮文字此前几乎看不见）。验证入口：`pnpm typecheck`、`pnpm build`、`pnpm --filter @sanye/sanye_client build:android`、`node --test`（13 个安卓文件 41 项 41 通过 0 跳过 0 失败）、探针 `sanye_deploy/.local/verify-player-menu-targets.cjs`、证据 `sanye_deploy/.local/android-theme-parity/report.json` 与 `outline.json`、浅色「深色孤岛」扫描 `sanye_deploy/.local/scan-light-dark-islands.cjs`（6 个页面 0 条）、全量审计 `node sanye_deploy/.local/android-ui-audit.cjs`（234 个场景：问题种类 0，143 个问题实例全部是已锁定取舍，即竖屏进度条命中区 28px 与音量拖动条窄命中区）；同步[安卓开发计划](./android-development-plan.md) v0.88 与[安卓需求](../product/android-requirements.md) v0.43。
更新记录：2026-09-30，安卓专项 v0.99（VQ-59 修正）：用户澄清「只是列表中要实时的挡位不是让你写降价到哪，列表的大小的决策永远不要变，写在文档里」——把上一轮登记的「已降到 X／生效」文字后缀全部撤掉，列表改为高亮实时生效的挡位（画质 `effectiveProfile`、帧率实测目标帧率，落不到列表档位时回退用户选择）；列表尺寸与文案登记为**锁定决策**（宽度与触发按钮等宽、行高/边距/字号与文案都不随选中项、档位数量或降级状态变化，状态只用高亮表达，不恢复勾选列），门禁 `e2e/android-ui.test.cjs` 断言换选中项后浮层盒子与行宽逐项一致。交付 v66（`versionCode 43`／`versionName 5.2`，12,422,660 字节，SHA-256 `D6FAF7A56B0A8A0518AB9F6D3A82D8D10E58AAF0E560B40BD5BD805E25817629`），实测 240 极致帧率下请求「均衡」时列表为 [关闭,性能,均衡,锐化] 且高亮性能，切档仍为「画布未重建、暂停 0 次、速率 1、补间层去留 0」，1.6 秒拖动 8 次预览更新且 0 暂停；v65 已归档。同步 [画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.42、[安卓开发计划](./android-development-plan.md) v0.87、[安卓原生工程](../sanye_android/README.md) v0.75 与 [安卓需求](../product/android-requirements.md)。
更新记录：2026-09-30，安卓专项 v0.98（VQ-59）：登记用户三项反馈的根因与修复——切档/降级波动源于会话没有原地换档 API（一律停会话再重建，画布移除又插回、音频延迟清零再抬回）；降级未体现源于列表只标用户请求档位；拖动慢源于 280ms 节流 + 固定 2 秒位移门限 + 每次预览跑完整 CNN 链路并反复放层收层。修复后实测：切档后画布标记仍在、暂停 0 次、播放速率 1、补间层去留 0／任意类变化 0；240 极致帧率下画质列表为 [关闭,性能（生效）,均衡（已降到性能）,锐化]；1.6 秒 16 步拖动产生 8 次预览更新且 0 次暂停。稳定性口径同步修正为「未前进次数不得超过源侧停顿次数」，卡断与倒退仍必须为 0。证据边界：无头 Chromium 的 CPU 光流工况，真机未测；预览期间为未增强原帧。交付 v65（`versionCode 42`／`versionName 5.1`，12,422,732 字节，SHA-256 `838E69C0780523F60F5AAA68300713EDFB648A8CFCDFCD5B1F7E4C3605512162`），v64 已归档到 `sanye_deploy/.local/android-archive/`。同步 [画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.41 与 [安卓开发计划](./android-development-plan.md) v0.86。
更新记录：2026-09-30，安卓专项 v0.97（VQ-58，未重打包）：登记「不出现任何画面抖动」的量化证据——只读稳定性累计 `sanye_client/src/video/playbackStabilityTally.ts`、页面诊断出口 `window.__sanyePlaybackTally`、单元门禁 `e2e/android-player-stability.test.cjs`（5 项通过）与持续播放断言（9 秒内停住／倒退／卡断／饿死／后端切换／降档／停顿全为 0；`contentJumps` 只记录，含源侧断档口径）。证据边界：数据来自无头 Chromium 的 CPU 光流最坏工况，真机 GPU 光流与硬件解码未测；用户界面仍无诊断入口。同步 [画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.40、[安卓开发计划](./android-development-plan.md) v0.85 与 [安卓原生工程](../sanye_android/README.md) v0.73。
更新记录：2026-09-30，安卓专项 v0.96（VQ-57 进行中，未重打包）：登记画质增强 WebGPU 化的主体成果与未完成边界——机械转译 + 手写段落 + 档位计划 + WebGPU 运行时 + Electron 验收台与门禁 `e2e/webgpu-enhance.test.cjs`；实测与原链路平均差 9.24/255（均衡）与 18.27/255（超分），未逐像素一致因此不接入播放器，WebGL 仍唯一生效；覆盖缺口为「性能」「锐化」两档。同步 [画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.39、[安卓开发计划](./android-development-plan.md) v0.84 与 [安卓原生工程](../sanye_android/README.md) v0.72。
更新记录：2026-09-30，安卓专项 v0.95（交付 v64，versionCode 41／versionName 5.0）：按用户澄清「我说的是中间的进度提示不是音量与亮度」修正上一轮的删除过度（VQ-56）——恢复画面中间的提示条并限定给亮度与音量，抬手 700ms 收起、按下进度条与横滑定位立即清空；门禁拆成「亮度与音量必须有提示」与「进度场景不得有提示」，验收探针新增同一暂停帧像素差分（1956 像素差异、包围盒水平中心 193.5／390）。登记 [画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.38、[安卓开发计划](./android-development-plan.md) v0.83 与 [安卓原生工程](../sanye_android/README.md) v0.71。
更新记录：2026-09-30，安卓专项 v0.94（交付 v63，versionCode 40／versionName 4.9）：按用户选择「在 WebView 内升级：WebGPU 超分 + 修好 GPU 运动估计」修两处真实缺陷（VQ-55）——运动场迟到不再退回重复原帧（改为借用 `before` 的运动场继续按相位插值，并新增 `flowStarvedFrames`／`flowBorrowedFrames` 统计），护栏区分「迟到」与「场不对」（迟到先回稳定模式，仍迟到才回 CPU），画面推进计数改为按报告窗口清零；门禁 `pnpm test:player-policy` 15 项、`node --test e2e/android-*.test.cjs` 18 项通过。真实观感待骁龙 8 系真机。登记 [画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.37、[安卓开发计划](./android-development-plan.md) v0.82 与 [安卓原生工程](../sanye_android/README.md) v0.70。
更新记录：2026-09-30，安卓专项 v0.93（交付 v62，versionCode 39／versionName 4.8）：按用户要求删除画面上两处浮层（进度条上方的画中画预览、画面中间的提示条），并把观看历史改为退出即落库、列表读前等在途写入（1.2 秒上限兜底）；门禁新增四场景「无浮层」断言与「退出后写入早于 listHistory」断言；同步 [安卓原生工程](../sanye_android/README.md) v0.69、[安卓开发计划](./android-development-plan.md) v0.81 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.36。验证入口：`node --test e2e/android-*.test.cjs`、探针 `sanye_deploy/.local/android-verify57.cjs`、截图 `sanye_deploy/.local/android-shots/v64-1-拖动进度条无浮层.png`、`v64-2-调亮度无提示条.png`。

更新记录：2026-09-30，安卓专项 v0.92（交付 v61，versionCode 38／versionName 4.7）：按用户追问把预览窗口真正钉在进度条上——横向改为按目标时间在滑条上的位置定位（此前跟手指坐标，横滑手势会飘离滑条），竖向固定滑条上沿上方 12px，定位统一由反应式监听重算；门禁新增横滑场景断言（手指在画面中央时预览中心仍对准滑条目标格 ±40px）；同步 [安卓原生工程](../sanye_android/README.md) v0.68、[安卓开发计划](./android-development-plan.md) v0.80 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.35。验证入口：`node --test e2e/android-ui.test.cjs`、探针 `sanye_deploy/.local/android-verify57.cjs`、截图 `sanye_deploy/.local/android-shots/v62-1-预览钉在进度条.png`。

更新记录：2026-09-30，安卓专项 v0.91（交付 v60，versionCode 37／versionName 4.6）：按用户「太大了 / 做小一点」把进度预览窗口从 `clamp(160px,44%,240px)` 收到 `clamp(88px,22%,132px)`（窄屏约 88px、占画面宽度约 22%），门禁限定内部画面宽 72–140px；同步 [安卓原生工程](../sanye_android/README.md) v0.67、[安卓开发计划](./android-development-plan.md) v0.79 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.34。验证入口：`node --test e2e/android-ui.test.cjs`、探针 `sanye_deploy/.local/android-verify57.cjs`、截图 `sanye_deploy/.local/android-shots/v61-1-小尺寸进度预览.png`。

更新记录：2026-09-30，安卓专项 v0.90（交付 v59，versionCode 36／versionName 4.5）：按用户第二次澄清把画面预览窗口定位到进度条正上方并跟随拖动位置（此前误放画面中央），门禁增加「整块在滑条上方」「中心跟随拖动 ≤40px」两条硬约束；同步 [安卓原生工程](../sanye_android/README.md) v0.66、[安卓开发计划](./android-development-plan.md) v0.78 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.33。验证入口：`node --test e2e/android-ui.test.cjs`、`pnpm test:player-policy`（14 项）、探针 `sanye_deploy/.local/android-verify57.cjs`、截图 `sanye_deploy/.local/android-shots/v60-1-进度条上方预览.png`、`v60-2-全屏增强稳定.png`。

更新记录：2026-09-30，安卓专项 v0.89（交付 v58，versionCode 35／versionName 4.4）：按用户澄清把进度预览改成画中画窗口，并给 `recordProgress` 串行队列加 8 秒原生调用超时（一次悬空调用会永久卡死后续保存）；同步 [安卓原生工程](../sanye_android/README.md) v0.65、[安卓开发计划](./android-development-plan.md) v0.77 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.32。验证入口：`node --test e2e/android-ui.test.cjs`（画中画预览门禁 + 关闭播放器落盘门禁）、`pnpm test:player-policy`（14 项）、探针 `sanye_deploy/.local/android-verify57.cjs`、截图 `sanye_deploy/.local/android-shots/v59-1-画中画预览.png`。

更新记录：2026-09-30，安卓专项 v0.88（交付 v57，versionCode 34／versionName 4.3）：按用户第十二轮反馈交付六件事——进度条预览（VQ-54）、呈现层看门狗（VQ-53）、画布重建前交回原视频（黑屏）、判定窗口重新定档（全屏后降档）、显式帧率档按档补帧与失败降档重试、关闭播放器前落最后一段进度；同步 [安卓原生工程](../sanye_android/README.md) v0.64、[安卓开发计划](./android-development-plan.md) v0.76 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.31。验证入口：`pnpm test:player-policy`（14 项）、`node --test e2e/android-*.test.cjs`（22 项）、探针 `sanye_deploy/.local/android-verify57.cjs`、截图 `sanye_deploy/.local/android-shots/v57-7-进度条预览.png`、`v57-8-全屏增强稳定.png`；`gradlew --offline :app:testDebugUnitTest :app:assembleDebug`。

更新记录：2026-09-30，安卓专项 v0.87（交付 v56，versionCode 33／versionName 4.2）：按用户第十一轮反馈「全屏之后画面会出现缺失，而且画质帧率下降很多，画质帧率的列表跟文字一样宽你这又做的太窄了，等宽就好」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.63、[安卓开发计划](./android-development-plan.md) v0.75 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.30 的同步更新。本轮三处：其一，放大态视频与补帧画布 `cover`→`contain`，实测 16:9 片源在 844×390 上原本上下各被切约 8.7%；其二，新增判定静默窗口 VQ-51，放大进出/旋转/尺寸变化后 2s 不判定降档；其三，画质/帧率列表宽度回到与触发按钮等宽（54px／窄屏 44px）。验证入口：`pnpm test:player-policy`（13 项）、`node --test e2e/android-*.test.cjs`（22 项）、`gradlew --offline :app:testDebugUnitTest :app:assembleDebug`；证据见 `sanye_deploy/.local/android-shots/v57-*.png` 与探针 `sanye_deploy/.local/android-verify56.cjs`。

更新记录：2026-09-30，安卓专项 v0.86（交付 v55，versionCode 32／versionName 4.1）：按用户澄清「我说的不是按钮是点击按钮之后的列表」并选择「和按钮上「帧率」两个字一样宽（约 30px），选项文字缩短为 60/90/120 纯数字」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.62、[安卓开发计划](./android-development-plan.md) v0.74 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.29 的同步更新。改动为选项浮层本身：画质/帧率浮层 168px → `30px`，档位文案去掉 FPS 后缀（`关闭/性能/均衡/锐化`、`原始/自动/60/90/120/144/165/240`），`随片源` 收到 `原帧`（原文案留在 `title`），并去掉窄浮层的行左右内边距以容纳三位数字。实测浮层 30px、12 行全部 22px、无裁切。验证入口：`node --test e2e/android-*.test.cjs`（22 项，新增「浮层宽度 ≤40px」「浮层内不得出现 FPS 后缀」两组门禁）、`gradlew --offline :app:testDebugUnitTest :app:assembleDebug`；截图见 `sanye_deploy/.local/android-shots/v55-*.png`。

更新记录：2026-09-30，安卓专项 v0.85（交付 v54，versionCode 31／versionName 4.0）：按用户澄清「我说的比如是帧率那一个列表就和他这两个字等宽，不是跟所有的文字等宽」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.61、[安卓开发计划](./android-development-plan.md) v0.73 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.28 的同步更新。本轮修正的是控件行按钮宽度跟着自身标签走（`帧率` 30px → `自动帧率`／`120 FPS` 撑宽，整行位移）：改为固定等宽（宽屏 54px、窄屏 44px，带收缩下限避免 390 宽放大态越界），并给时间读数最小宽度与等宽数字。验证入口：`node --test e2e/android-*.test.cjs`（22 项，新增「按钮等宽」与「切档后 x 坐标不变」两组门禁）、`gradlew --offline :app:testDebugUnitTest :app:assembleDebug`；截图见 `sanye_deploy/.local/android-shots/v54-*.png`。

更新记录：2026-09-30，安卓专项 v0.84（交付 v53，versionCode 30／versionName 3.9）：按用户第十轮反馈「竖屏的进度条与按钮分隔还是太大，不用提示本机帧率，补帧与插帧本来就是让你提升帧率，宽度始终和文字一样」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.60、[安卓开发计划](./android-development-plan.md) v0.72 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.27 的同步更新。本轮三处：其一，竖屏进度条轨道中心 12.5px→5.5px、命中高度 34px→28px、控件条 82px→76px；其二，浮层行宽不再等于文字宽度（`align-items: stretch` + `width: 100%` + 浮层固定 168px），实测 8 行全 154px、高亮铺满整行；其三，帧率档取消按屏幕刷新率过滤与本机上限提示，删除刷新率探针与「我的」中的屏刷新率行，稳定性改由既有降档与光流护栏承担。验证入口：`node --test e2e/android-*.test.cjs`（22 项）、`gradlew --offline :app:testDebugUnitTest :app:assembleDebug`、修复后截图见 `sanye_deploy/.local/android-shots/v53-*.png`。

更新记录：2026-09-30，安卓专项 v0.83（交付 v52，versionCode 29／versionName 3.8）：按用户第九轮反馈「播放进度保存失败，播放器的进度条与按钮分隔太远而且排版不好看，放大之后画面还是移位并且左侧空白，画质与帧率还是只有两档」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.59、[安卓开发计划](./android-development-plan.md) v0.71 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.26 的同步更新。本轮四项根因与证据：其一，进度保存失败是原生 `recordProgress` 复用了直链媒体的 `validUrl`（拒查询参数/片段），来源播放页地址带一个参数就整条历史被拒，改为新增 `validRecordUrl` 并只对直链媒体保留严格语义；其二，进度条命中区用负上边距压进按钮行 4px 且轨道离按钮行 15px，改为 34px 命中区 + 固定 `top: 9px` 轨道 + 全屏两侧 12px 对称内边距，实测重叠 +2px、轨道间距 12.5px；其三，放大后左侧空白与移位来自 `viewport-fit=cover` 与挖孔模式缺失（横屏刘海被系统排除）以及 `.android-player--inline` 出血量与页面内边距不同源（横屏多出 12px 撑出横向滚动），统一为 `--page-gutter`；其四，档位只有两档是 `MOBILE_ANIME4K_PROFILES` 只列两项且帧率菜单只渲染可用档，现开放「锐化」并把帧率梯级列全（不可用档标注本机上限）。验证入口：`node --test e2e/android-ui.test.cjs` 新增四组门禁，`gradlew --offline :app:testDebugUnitTest :app:assembleDebug` 新增 `recordUrlAcceptsSourcePageAddresses` 与画质 `sharp` 用例，修复后截图见 `sanye_deploy/.local/android-shots/after-1-portrait.png` 等五张。

更新记录：2026-09-30，安卓专项 v0.82（交付 v51，versionCode 28／versionName 3.7）：按用户第八轮反馈「首页的下面的推荐内容的文字是白色的看不清楚，全屏之后视频画面没有占满屏幕旁边还有白色的，观看历史没有封面，画质与帧率还是只有以前的，优化去哪了，报错设置保存失败，你这个报错就出现一次就行了，到处都是报错信息」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.58、[安卓开发计划](./android-development-plan.md) v0.70 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.25 的同步更新。本轮五条根因与根治：其一，首页推荐卡白字——`.android-catalog li 硬编码近白色，跟随系统为浅色时只换背景不换文字，实测对比度 1.0，改取主题变量。其二，全屏两侧露白——根因在原生：WebView 缺少 `backgroundColor（默认白）且窗口主题继承 DayNight 浅色窗口底色，全屏缝隙透白；补 Capacitor `backgroundColor、`values/colors.xml 与 `values-night/colors.xml 的窗口底色和 CSS `html 压黑。其三，观看历史封面——前端按作品身份回填片库封面，原生 SQLite v5→v6 用 `backfillHistoryCovers 回填历史空封面。其四，画质与帧率档位「优化去哪了」——数字档被原生字符串校验整条拒绝（档位不落盘 + 每次弹设置保存失败），且增强失败会把用户档位清成关闭；现统一字符串档位、原生兼容数字、失败保留档位并只提示一次。其五，报错只出现一次——新增 `notifyOnce 与顶栏下唯一提示位，设置保存失败不再占用全局错误条。证据：typecheck、`build:android、三个安卓门禁文件（含浅色对比度 ≥ 4.5、放大态纯黑且 `object-fit: cover、60 FPS 字符串落盘、增强失败保留档位、同一条报错只出现一次）、`gradlew --offline :app:testDebugUnitTest :app:assembleDebug 与 `aapt dump badging。

更新记录：2026-09-30，安卓专项 v0.81（交付 v50，versionCode 27／versionName 3.6）：按用户「我要的是全屏状态下在那选，删除你这个设计」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.57、[安卓开发计划](./android-development-plan.md) v0.69 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.24 的同步更新。本轮记录两处删除（v49 的竖屏入口、v48 的「我的 → 播放增强」分组）与档位入口回归放大后浮层的结论，并登记新增的放大态档位门禁（画质关闭/性能/均衡、帧率原始/自动/60 FPS、选中后按钮文案与 `setSettings` 落盘）；真机触感与真实来源保持待环境。

更新记录：2026-09-30，安卓专项 v0.80（交付 v49，versionCode 26／versionName 3.5）：按用户「就是之前进行的画质与帧率优化在播放器里能够选择挡位」「把我的里面的状态放在播放器里」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.56、[安卓开发计划](./android-development-plan.md) v0.68 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.23 的同步更新。本轮记录根因（竖屏整类隐藏 `.android-player-tool--more` 导致增强档位只能先进放大）、竖屏保留画质/帧率入口与 52×36 触控尺寸、按钮文案即档位状态，以及「我的 → 播放增强」仍是跨作品偏好入口的事实；同时保留安卓 e2e 23 项、`pnpm typecheck`／`pnpm build`／`pnpm test:player-policy`、原生单测与打包、解包 APK 资源核对的可复核结论；真机触感与真实来源保持待环境。

更新记录：2026-09-30，安卓专项 v0.79（交付 v48，versionCode 25／versionName 3.4）：按用户第九轮反馈与「关闭入口直接删掉」「帧率与画质之前的优化并不能在播放器里才选择」交付，登记 [安卓原生工程](../sanye_android/README.md) v0.55、[安卓开发计划](./android-development-plan.md) v0.67 与[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.22 的同步更新。本轮文档记录播放器满宽与铺满、进度条下移、关闭入口删除、电影线路标签、首页主视觉字号、观看历史竖列表与解锁封面、搜索即时与重入清空、我的空间播放增强下拉九项改动，以及 `pnpm typecheck`／`pnpm build`／`pnpm test:player-policy`／安卓 e2e 23 项／原生单测与打包的可复核结论；真机触感与真实来源保持待环境。

更新记录：2026-09-30，安卓专项 v0.78（交付 v47，versionCode 24／versionName 3.3）：按用户“重新打一个新包到桌面我进行验收”把 v0.77 的改动打进安装包。构建前修两处环境阻塞：本机 Android SDK（`C:\Users\10121\AppData\Local\Android\Sdk`）已被删除，`gradlew` 报 `SDK location not found`，按原路径重装 `cmdline-tools`＋`platform-tools`＋`platforms;android-36`＋`build-tools;35.0.0` 并接受许可（脚本 `sanye_deploy/.local/setup-android-sdk.ps1`）；环境变量 `JAVA_HOME` 指向 JDK 17，Gradle 优先使用它导致 javac 17 拒绝 `--release 21`（报“无效的源发行版：21”），改为显式 `JAVA_HOME=<jdk-21.0.12>` 并 `gradlew --stop` 清掉旧守护进程后构建通过。构建链 `build:android` → `npm run sync` → `gradlew --offline :app:testDebugUnitTest :app:assembleDebug`（BUILD SUCCESSFUL in 17s）。验收：`aapt dump badging` 为 `com.sanye.sanye_anime`／24／3.3／SDK 29-36／`三叶动漫`；`dist-android` 27 个 web 资源与包内逐项一致（另有 Capacitor 生成的 `cordova.js`、`cordova_plugins.js`）；交付 `三叶动漫-安卓-2026-09-30-v47-读取与播放稳定性修复版.apk`（12,418,012 字节，SHA-256 `38C92C762F2854DBAC61AC28DE492AA52C3F7E8412E636FA75D5B36878CE2B9D`）到桌面，v46 归档到 `sanye_deploy/.local/android-retired/`。同步[安卓开发计划](./android-development-plan.md) v0.66、[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.21 与[安卓原生工程 README](../sanye_android/README.md) v0.54。真机安装与观感验收由用户执行，仍属待环境。

更新记录：2026-09-30，安卓专项 v0.77（读取态与重试归属修正 + 本地库边界 + 播放策略单测门禁，本轮不重新打包）：按用户“进行优化”落地四项。其一，读取态：`androidApp.vue` 新增 `catalogLoading`／`historyLoading`，片库与历史在读取完成前显示加载占位，不再先闪一次空库文案。其二，错误归属：历史失败改用独立 `historyError` 并在历史页渲染错误条与就地“重试读取”（此前借用全局 `error`，全局按钮只重读片库，用户无法通过它修复历史）；全局错误条由新增的 `retryAction` 决定按钮是否出现。其三，原生本地库：`SanyeCatalogPlugin` 的 `list`／`listHistory`／`getSettings` 只关游标而不再关闭 `SQLiteOpenHelper` 缓存的数据库实例，数据库版本 4→5 并新增 `saved_media_recent (updated_at DESC, id DESC)` 索引。其四，门禁：新增 `e2e/player-policy.test.mjs`（`pnpm test:player-policy`，12 例 106ms），以 node 类型擦除直接导入 `sanye_client/src/video` 的纯判定模块，覆盖地板档语义、持续预算降档、帧率只降不升、运动后端护栏与插值延迟，已接入 `ci.yml`（前端作业）与 `android-check.yml`（脚本步骤与内联 `node --test` 列表）；这填补了此前“播放管线约 20 个 e2e 用例无一条进入 CI、`sanye_client` 无单测运行器”的空档。证据：`pnpm test:player-policy` 12 过 0 失败、安卓全量 23 例 19 过 0 失败 4 跳过、`pnpm typecheck` 3 项 Done、`pnpm build` 5 个工程通过；原生侧改动需 Android 工具链重新打包才在设备生效，本轮不重新打包。同步[安卓开发计划](./android-development-plan.md) v0.65、[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) v1.20 与[安卓原生工程 README](../sanye_android/README.md) v0.53。

更新记录：2026-09-30，安卓专项 v0.76（按钮圆角适度化 + 全站页面与功能审计，本轮不重新打包）：按用户“按钮有点太圆了，所有的设计适当就好，并检查所有的页面所有的功能还有没有能不能优化的地方”执行。圆角：新增 `--radius-control: 12px`／`--radius-chip: 8px`，替换 `--radius-pill: 999px`，覆盖 `.android-page-section .android-list li button`、`.android-actions button`、`.android-secondary-button`、`.android-pagination button`、`.android-section-title button`、`.android-setting-row button`、`.android-detail-actions button`、`.android-top-search`，播放器 `.android-player-tool` 与 `.android-player-error button` 用 8px；`.android-theme-toggle` 保持圆形。审计证据：`e2e/android-ui-polish.test.cjs` 第 156 行的 `999px` 契约随之改为 `12px` 并追加 `parseFloat <= 14` 上界；Playwright 七分区实测横向溢出 0、末元素与底部导航最小间距 33px；详情页 `.android-detail h2` 与 `.android-player h2` 出现同名重复；`.android-player-close` 30px、`.android-player-play` 34px；对比度扫描无低于 4.5 的项；空数据（片库、历史）与失败路径（`list` 抛错）均有文案与「重试读取」，但失败时片库同时显示「无法读取本地片库」与「本机还没有保存作品」。修复：内嵌播放器标题加 `v-if="!watchPage || section !== 'detail'"`；关闭／播放按钮提到 44px；片库空态加 `!error` 条件；补全站 `:focus-visible`（浅色 `#1f5b74`，深色 `#eaf2c4`）；删除死样式 `.android-catalog-note`／`.android-lead`／`.android-search-local` 与无引用的 `android-player-chrome-visible` 类绑定。门禁：typecheck／build:android 通过；安卓 23 项 19 通过 4 跳过 0 失败；`pnpm docs:check` 通过。同步 [sanye_android/README](../sanye_android/README.md) v0.52。

更新记录：2026-09-30，安卓专项 v0.75（播放器与卡片统一到同一套卡面，本轮不重新打包）：按用户“播放器与背景的契合度非常差，其他页面的卡片也会出现这种情况，进行优化”做安卓端视觉收口。诊断：样式表里同时存在两套载体定义——`.android-detail`（同时带 `.android-panel`）与 `.android-player.android-player--inline` 走 `--app-surface` 实心底 + `var(--app-border)` 深描边 + `6px 18px` 圆角；而 `.android-page-section .android-list li`／`.android-history-card`／`.android-setting-list`／`.android-search-form` 走 `--page-card` 渐变 + `--page-card-border`（`.15`）+ `--radius-card`（`12px 18px`）。详情页把播放器卡与详情卡上下排在一起，两套卡面直接互相打架；同时 `.android-player-stage` 是 `#000` 直角块（`.android-player--inline .android-player-stage` 还写了 `margin-inline: -14px` 顶到卡边），在带暖光的 `#081428` 页面上是一块贴上去的黑。改动：在样式表末尾新增「契合度收口」层（沿用该文件的分层覆盖写法）——其一，`.android-detail` 取 `--page-card-border`／`--page-card`／`--page-shadow`；其二，`.android-player.android-player--inline` 取同一套卡面并加 `overflow: hidden`，浅色与 system 浅色各补一条 `--page-card` 覆盖，避免被更早的 `#fffaf1` 规则按特异性压住；其三，`.android-catalog li` 由 `#142a48` 改为 `--page-card`（含浅色与 system 浅色覆盖），详情卡内的 `.android-detail .android-list li` 压深为 `rgba(5,14,28,.38)`／浅色 `rgba(255,255,255,.62)`；其四，`.android-player-stage` 改 `border-radius: var(--radius-card)`、底色 `#061020`，`video` 与 `.android-player-poster` 同步，内嵌分支用 `.android-player--inline .android-player-stage:not(:fullscreen):not(.android-player-stage--expanded)` 设 `margin-inline: -6px`（左右各留 8px 卡内边距）、1px `rgba(234,242,196,.1)` 描边与同一圆角，`:not` 同时排除全屏与 `.android-player-stage--expanded`，全屏分支保持 `border: 0; border-radius: 0` 不被切出缺口；其五，`.android-watch-top` 与 `.android-player--overlay` 分别统一圆角/描边与暖光 `radial-gradient`。测试：`e2e/android-ui.test.cjs` 在内嵌播放器打开处新增四条断言——`.android-player--inline` 的 `borderTopLeftRadius + borderTopRightRadius` 必须是 `12px 18px`、`backgroundImage` 必须匹配 `/^linear-gradient/`、画面 `borderTopLeftRadius` 不得为 `0px`、画面 `backgroundColor` 不得为 `rgb(0, 0, 0)`。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过；安卓门禁 23 项 19 通过 4 跳过 0 失败；`pnpm docs:check` 通过 1735 项 0 失败；Playwright 在 390×844 实测播放器卡 `12px/18px` + `linear-gradient`、详情卡 `12px/18px` + `linear-gradient`、画面圆角 `12px`、画面底色 `rgb(16,31,54)`→修正为 `#061020`，并输出 `sanye_deploy/.local/android-ui-fit/home-dark.png`／`library-dark.png`／`player-detail-dark.png`／`player-detail-light.png` 四张截图。本轮未重新打包，现有交付仍为 `三叶动漫-安卓-2026-09-30-v46-GPU画质与稳定性版.apk`（`versionCode 23`／`versionName 3.2`）。同步 [sanye_android/README](../sanye_android/README.md) v0.51。边界：真机观感与系统字体放大仍待环境。

更新记录：2026-09-30，安卓专项 v0.74（删除自己导入与设置页全部下拉，本轮不重新打包）：按用户“两个直链入口，和我的里面的一些下拉选项删掉，多余”继续做安卓端删减，只删功能与控件、不动配色与圆角契约。自己导入：`androidApp.vue` 删除首页「使用媒体直链观看」的 `<details class="android-utility">` 与片库「手动添加媒体地址」的整个 `<section aria-label="保存媒体">`，以及 `watchDirect()`、`save()` 两个函数和 `directTitle`／`directUrl`／`title`／`url`／`busy` 五个 `ref`；本机作品此后只由来源页「保存到本机」（`savePreview`）写入，片库既有直链条目仍按 `mediaType` 走「播放」，历史与收藏逻辑不变；`android.css` 同步删除 `.android-utility` 主规则、两条浅色主题 `.android-utility summary` 取色与卡片圆角选择器里的该项，全仓已无该类的引用。设置页：删除整个「播放」`.android-setting-group`，即界面主题、播放速度、画质增强、补帧帧率四个 `<select>`，设置页剩余「数据」「关于」两组（4 行均为左侧名称 + 右侧控件两列），`document.querySelectorAll('.android-app select').length` 实测为 0；主题改由顶栏深浅色切换按钮承担（`updateSettings` 仍在用），画质增强与补帧帧率只保留播放器浮层的「画质」「帧率」菜单入口（`changeQualityProfile`／`changeFrameTarget` 与落盘、GPU 护栏语义不变），仅供设置页下拉使用的包装函数 `changeFrameTargetFromSelect` 一并删除。测试：`e2e/android-ui.test.cjs` 的直链起播改用 `window.__seedDirectItem` 写入 `localStorage` 后刷新一次、再进片库筛选播放（`__seedAndroidCatalog` 同步改为持久化写入 + 刷新，保证分页用例仍有 22 条作品），主题切换改用顶栏按钮，`save` 调用计数断言由 1 调整为 0（不再有手动导入产生的保存），选集浮层断言由「当前媒体没有来源选集」改为「直链作品只有自身一条」；`e2e/android-ui-polish.test.cjs` 的「我的」分组数断言由 ≥3 调整为 ≥2、并新增「设置页零下拉」，主题循环改按当前 `data-theme` 决定点顶栏的浅色/深色按钮；`e2e/android-enhancement.test.cjs` 的隔离桥接改为 `list` 返回一条直链作品并改从片库起播。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android`（含 `vue-tsc -b`）通过；`node --test "e2e/android-*.test.cjs" "e2e/android-*.test.mjs"` 23 项 19 通过 4 跳过 0 失败；`node --check e2e/android-enhancement.test.cjs` 退出码 0；全仓 `.android-utility`／`watchDirect`／`界面主题`／`画质增强`／`补帧帧率` 引用为 0。本轮未重新打包，现有交付仍为 `三叶动漫-安卓-2026-09-30-v46-GPU画质与稳定性版.apk`（`versionCode 23`／`versionName 3.2`）。同步 [sanye_android/README](../sanye_android/README.md) v0.50。边界：真机触控与系统字体放大仍待环境；本轮删除后若要安装到手机需重新执行 `build:android` → `npm run sync` → `gradlew assembleDebug`。

更新记录：2026-09-30，安卓专项 v0.73（底部导航 6→5、首页去营销标题、触控统一 44px，本轮不重新打包）：按用户“现在检查有没有优化的地方，设计可以参考 b 站，不合理的设计进行删除”做第四轮安卓端视觉与可用性收口，先用 Playwright 在 390×844 下逐页量测（可点元素尺寸、横向溢出、页面高度），再按量测结果改动。结构：`androidApp.vue` 底部导航删除 `['search','搜索']` 项（6→5，390px 下每项 57px→69px），搜索统一由顶栏 `.android-top-search` 触发；`.android-top-search` 由 42px 图标按钮改为 44px 高胶囊并带 `aria-current`，`.android-nav` 的 `repeat(6, …)` 同步改 `repeat(5, …)`；删除 `.android-home-intro` 营销块；`.android-hero` 高度 336px→216px、标题去掉 `white-space: nowrap` 并限两行、文案改为真实随包统计；推荐卡片改整卡可点 `.android-catalog-open`（aria-label「查看 X 详情」）并删除卡内 30px 按钮；排期删除重复的「随包排期」h2；片库手动添加区移到列表之后。触控：按钮/下拉最小高度统一 44px，实测首页 <44px 可点元素 11→0。清理：删除未被引用的 `recent`／`recentSaved`／`favoriteSaved` 与死规则 `.android-page-heading-note`。证据：`pnpm --filter @sanye/sanye_client build:android`（含 `vue-tsc -b`）通过；`node --test "e2e/android-*.test.cjs" "e2e/android-*.test.mjs"` 23 项 19 通过 4 跳过 0 失败；390×844 审计首页 1161→858px、首页 <44px 可点元素 11→0、五页均无横向溢出。真机触控与系统字体放大仍待环境；本轮未重新打包，现有交付仍为 v46。

更新记录：2026-09-30，安卓专项 v0.72（全站减字 + 柔化，本轮不重新打包）：按用户“文字与样式还是太过生硬，对所有页面进行优化，文字不要太多要求简洁，排版也要好看”做第三轮视觉收口，覆盖首页、搜索、片库、排期、历史、我的与详情。减字：删除 `pageDescription` 计算属性与页面说明段（`androidApp.vue` 页面标题区只保留 `pageKicker` 与标题，实测 11–14 字）；「我的」页删掉所有设置行的解释句与「关于」分区补充说明，分组标题简化为「播放」「数据」「关于」；排期标题改「随包排期」、说明压成「截至 …，只收录来源目录写明星期与时间的作品」、空日期由「暂无有依据的更新信息。」改「暂无」；片库保存区说明改「支持 MP4 / HLS 直链，来源网页会在播放前解析选集」，条目元信息合并为「本机直链／来源网页 · 日期」一行并删除「来源网页会在点击后自动解析选集并播放。」；直链观看说明改「不保存到片库，只记入观看历史」；详情页改「来源没有提供简介。」与「N 个条目」。柔化：`android.css` 末端新增「柔和化收口」层，定义 `--radius-card: 12px 18px 12px 18px` 与 `--radius-pill: 999px`，卡片类（`.android-list li`／`.android-panel`／`.android-utility`／`.android-history-card`／`.android-setting-list`／搜索表单／`.android-detail`／`.android-setting-status`）统一取卡片档，按钮与芯片（列表动作、`.android-secondary-button`、翻页、分区筛选、设置行动作、详情页动作）统一取药丸档（与播放器控制条一致），`.android-episode-grid button` 与首页卡片按钮保持卡片档；`--page-card-border` 由 `.22` 降到 `.15`、浅色主题取 `#e2dbcc`，分组卡、搜索表单与状态条加 `--page-shadow`；页面标题 `clamp(26px, 7vw, 34px)`（原 `clamp(30px, 8vw, 40px)`）、`.android-kicker` 字距 `.06em`、分区与分组小标题改中性色（强调色只留页面级）、按钮字重 700→600、设置行标签字重 500；节奏统一为「标题区紧接第一个分区、分区间距 22px、列表行距 10px」。另修两处具体观感问题：详情页无封面时用 `.android-detail-hero:not(:has(img)) .android-detail-cover.android-cover-empty` 把占位块压成一行小标牌（此前按海报比例撑满整屏，把标题与操作挤出首屏）；浅色主题缺封面占位块由深蓝实心改为米色系（`#efe8da`→`#e4dccd`，文字 `#5d5342`，对比度约 5.5）。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过；安卓浏览器门禁 11 个文件 19 项 19 通过 0 跳过 0 失败，`e2e/android-ui-polish.test.cjs` 新增断言「页面说明段为 0、标题区字数 ≤22、分区正文字数 ≤220、卡片圆角为 12px 与 18px、动作按钮圆角 999px、页面标题字号 ≤34px」，并在浅色主题补一张详情页截图；`sanye_deploy/.local/android-ui-polish/` 现有 11 张截图（五个分区 × 深/浅 + 详情页浅色）与 `report.json`，本次量测值：标题区 11（搜索/片库）–14（我的）字、分区正文 39（搜索）/58（片库）/97（排期）/56（历史）/90（我的）字、页面标题字号 27.3px。本轮未重新打包，现有交付仍为 `三叶动漫-安卓-2026-09-30-v46-GPU画质与稳定性版.apk`（`versionCode 23`／`versionName 3.2`）。同步[安卓需求草案](../product/android-requirements.md) v0.41、[安卓开发计划](./android-development-plan.md) v0.64、[开发任务清单](./development-tasks.md) v3.13 与 [sanye_android/README](../sanye_android/README.md) v0.48。边界：真机触控、系统字体放大与第三方字体下的排版仍待环境。

更新记录：2026-09-30，安卓专项 v0.71（「我的」重做 + 顶栏去标记 + 版式统一，本轮不重新打包）：按用户“我的里面要好好设计，把左上角的三删掉，新的设计排版还是不好看，要细心设计，尽量风格与排版统一”做第三轮视觉收口。其一，顶栏去掉 `.android-brand-mark`（左上角「三」方块），`.android-brand` 改为纯文字锁定：应用名用与页面标题同一套衬线字体（17px），下面一行副标题，`min-height: 42px` 与右侧 42px 的图标按钮对齐；品牌名仍是「三叶动漫」，`e2e/android-ui.test.cjs` 的 `.android-brand strong` 断言不受影响。其二，「我的」页从「若干张高卡片 + 两个大按钮」重做为标准设置页：新增 `.android-setting-group`／`.android-setting-list`／`.android-setting-value`／`.android-setting-status` 与 `--page-divider` 变量，按「播放偏好」「数据与诊断」「关于」三组组织，每组一张卡（沿用 `--page-card` 与切角）、行与行之间用细分隔线，行内是「左侧名称 + 一句说明 / 右侧控件或动作」两列；播放偏好四行为界面主题、播放速度、画质增强、补帧帧率，数据与诊断两行为「媒体缓存 → 清理」「诊断摘要 → 复制」，关于两行为版本（`App.getInfo()` 读取，失败显示未知）与屏幕刷新率实测。其三，画质增强与补帧帧率新增可在「我的」直接设置（新增 `changeFrameTargetFromSelect` 把下拉字符串还原成档位类型，复用既有 `changeQualityProfile`／`changeFrameTarget`，因此同样落盘并重置 GPU 护栏），此前只能在播放器菜单里改。其四，版式统一：页面小标题改由 `pageKicker` 计算属性按分区给出（「公开来源 · 检索」「本机片库 · 收藏」「更新日历 · 随包快照」「观看足迹 · 继续播放」「我的空间 · 播放与数据」「作品档案 · 来源详情」／「正在观看 · 来源详情」），不再所有页面共用「动漫发现工作区 / 探索」，并去掉 01/02/03 编号；首页「推荐 / 02」改为「三叶精选」、海报角标去掉编号；详情页 `.android-detail-actions button` 与 `.android-episode-grid button` 并入同一套芯片变量（末位动作降为描边），浅色主题下不再出现 `#283a55` 深色实心块。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过；安卓浏览器门禁 11 个文件 19 项 19 通过 0 跳过 0 失败，`e2e/android-ui-polish.test.cjs` 新增断言「顶栏无 `.android-brand-mark` 且品牌名仍为三叶动漫」「我的页 ≥3 个 `.android-setting-group`、所有 `.android-setting-row` 均为 `display: grid` 两列、分组卡有 1px 描边」「在「我的」里把画质设为均衡、帧率设为自动后确认已落盘」「浅色主题下详情页动作与选集按钮背景不是 `rgb(40, 58, 85)`」，并更新 `sanye_deploy/.local/android-ui-polish/` 下 10 张分区截图与 `report.json`。本轮未重新打包，现有交付仍为 `三叶动漫-安卓-2026-09-30-v46-GPU画质与稳定性版.apk`（`versionCode 23`／`versionName 3.2`）。同步[安卓需求草案](../product/android-requirements.md) v0.40、[安卓开发计划](./android-development-plan.md) v0.63、[开发任务清单](./development-tasks.md) v3.12 与 [sanye_android/README](../sanye_android/README.md) v0.47。边界：真机触控、系统字体放大与第三方字体下的排版仍待环境。

更新记录：2026-09-30，安卓专项 v0.70（非首页分区统一到首页视觉标准，本轮不重新打包）：按用户“除了正常的一些页面，像是主页与其他页面都做得太难看了，进行优化要求跟首页的标准一样”把安卓端搜索、片库、排期、历史、我的五个分区统一到首页的语言。改动：`android.css` 新增一套页面变量（`--page-accent`／`--page-card`／`--page-card-border`／`--page-chip-bg`／`--page-chip-text`／`--page-chip-border`／`--page-empty-bg`／`--page-empty-border`／`--page-danger`，深色、浅色与跟随系统三套取值）并让首页 `.android-kicker` 也取变量，`.android-page-section` 取消面板边框与底色（`padding: 0; border: 0; background: transparent`），五个分区改为「页面导语 + 分区标题 + 卡片列表」，卡片沿用首页推荐卡片的底色与 `5px 17px` 切角；列表行内动作从实心亮色块改为首页卡片同款的浅色芯片（`.android-page-section .android-list li button`／`.android-actions button`），一行多动作时只有第一个是行动作、其余降为描边；新增 `.android-secondary-button` 与 `.android-pagination button` 覆盖清理历史、清缓存、复制诊断与翻页；分区标题右侧的筛选按钮也改为芯片（选中态用强调色）；排期空日期加 `is-empty` 类把标记与文字降为中性色；设置页拆成「播放偏好」与「缓存与诊断」两个分区，每条偏好包成 `.android-setting-row` 卡片；浅色主题 `--app-muted` 由 `#687c84` 加深到 `#5c6f78`（正文说明对米色底由约 4.0 提到 4.6 以上），新增 `--page-danger` 让 `.android-error` 在浅色主题下不再用浅粉色。`androidApp.vue` 新增 `pageDescription` 计算属性（搜索/片库/排期/历史/我的各一句）并接入页面导语，模板只加类名与分区标题的 kicker，未改动任何播放、搜索与数据逻辑。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build`／`build:android` 通过；安卓浏览器门禁 11 个文件 19 项 19 通过 0 跳过 0 失败，新增 `e2e/android-ui-polish.test.cjs`（5 个分区 × 深/浅主题 × 390/360 宽度断言「分区边框 0px 且底色透明、每页都有页面导语、无横向溢出、行内动作不是 `rgb(234, 242, 196)` 实心亮色、深色强调色 `rgb(243, 200, 107)` 与浅色强调色 `rgb(150, 80, 31)` 取自主题变量且对比度 ≥4.5」），并把深/浅主题下五个分区的 10 张截图写入 `sanye_deploy/.local/android-ui-polish/`（目录内另有 `report.json` 逐项记录 20 个组合的量测值）；`.github/workflows/android-check.yml` 的回归门禁列表已加入该用例。既有 `android-ui`／`android-search-retry`／`android-episode-order`／`android-player-preferences`／`android-player-stability`／`android-enhancement-tiers` 等同时通过，说明播放器几何、搜索交互与列表结构未被这次视觉改动破坏。本轮未重新打包，现有交付仍为 `三叶动漫-安卓-2026-09-30-v46-GPU画质与稳定性版.apk`（`versionCode 23`／`versionName 3.2`）。同步[安卓需求草案](../product/android-requirements.md) v0.39、[安卓开发计划](./android-development-plan.md) v0.62、[开发任务清单](./development-tasks.md) v3.11 与 [sanye_android/README](../sanye_android/README.md) v0.46。边界：真机触控、系统字体放大与第三方字体下的排版仍待环境；本轮只改视觉层与页面文案。

更新记录：2026-09-30，安卓专项 v0.69（GPU 画质与稳定性护栏 + 起播预热，交付 v46）：按用户“优化并打新包到桌面，提升画质与帧率但是要在稳定性的前提下”在 v45 之后做一轮“稳定优先”的画质与帧率优化。稳定性护栏：新增 `sanye_client/src/video/motionStabilityPolicy.ts`，只观察 GPU 窗口内已出现的内容倒退（`contentBacksteps`）与跨周期跳变（`contentJumps`，默认单窗口 2 次即脏窗口），连续两个脏窗口才判定本机不适合 GPU 光流；`androidApp.vue` 增加 `forceCpuFlowBackend`／`motionGuardResumeAt` 与 `guardMotionBackend(stats)`，判定后置位标记并用 CPU 后端**重启同一档位会话**（`applyEnhancement` 现在按标记传 `flowBackend: 'cpu'`），画质档、补帧目标与输出尺寸不变，本次运行内不再尝试 GPU；`changeQualityProfile`／`changeFrameTarget` 清零标记（用户重选档位重新给一次机会），定位（`commitSeekTo`）与会话起点的 2.5 秒静默窗口内不参与判定。画质：`FlowAnalysisPolicy` 增加运行期 `setMaxWidth`（降上限立即让 `targetWidth` 回落到界内），`enhancementLimits.ts` 新增 `analysisWidthCapOnGpu`，安卓取 256；渲染 Worker 在运动估计后端被确认后按后端设置上限（GPU→256、回到 CPU→192），升档仍由实测投影利用率低于 0.48 与样本数门控，因此没有余量的设备不会因放宽上限而提高成本。速度：新增 `prewarmPlaybackModules`（空闲预热 `hls.js` 与 `realtimeInterpolation`，两者原本在点击后才动态导入）与 `warmPreviewHosts`（详情页解析完成即预热前三条线路的媒体 origin），`adoptBundledPreview` 与 `previewSource` 成功分支均已接线。可观测性：`exportDiagnostics` 的脱敏摘要补上请求／生效画质档、补帧目标与实际帧率、运动估计后端与回退原因、护栏是否回退、画面波动计数、源帧暂存／丢弃与屏幕刷新率实测。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过（98 个模块）；安卓浏览器门禁 10 个文件 18 项 18 通过 0 跳过 0 失败，新增 `e2e/android-player-stability.test.cjs`（同一份余量样本在 CPU 上限下停在 192、GPU 上限下升到 256、`setMaxWidth(192)` 立即收回、实测超预算时上限 256 也不升档；护栏“单脏窗口不回退、干净窗口清零、连续两个脏窗口回退、CPU 窗口与 `reset()` 不累计”），`e2e/android-enhancement-tiers.test.cjs` 增补 `analysisWidthCapOnGpu === 256` 断言，两个文件均已登记进 `.github/workflows/android-check.yml`；`npm run sync` 后包内 27 个 web 资源与 `dist-android` 逐项 SHA-256 一致（另有 Capacitor 生成的 `cordova.js`／`cordova_plugins.js`），原生 `gradlew --offline :app:testDebugUnitTest :app:assembleDebug` 退出码 0（23 项 1 跳过 0 失败），`aapt dump badging` 为 `com.sanye.sanye_anime`／23／3.2／SDK 29-36，`apksigner verify --print-certs` 为 Android Debug 证书 v2 签名（SHA-256 `f00fb1cc198ed7c4cebaaf33fa59f925a66e0646a64b6644f63869a1bd3b9139`）。交付 `三叶动漫-安卓-2026-09-30-v46-GPU画质与稳定性版.apk`（12,416,644 字节，SHA-256 `5BE7592A5BE24A250EC42BDCAC2666BDEE484C77B84CC17C09063C266AB2726C`，桌面副本同摘要）到桌面，v45 归档到 `sanye_deploy/.local/android-retired/`。同步[安卓需求草案](../product/android-requirements.md) v0.38、[安卓开发计划](./android-development-plan.md) v0.61、[开发任务清单](./development-tasks.md) v3.10、[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) VQ-49／v1.20 与 [sanye_android/README](../sanye_android/README.md) v0.45。边界：真机 WebGPU 可用性、驱动与温度、真实片源观感、弱网与跨设备仍待环境；护栏判据基于受控会话的内容推进口径，真机若仍出现可见波动，可由诊断摘要的「运动估计后端（护栏已回退）」确认是否已落到 CPU。

更新记录：2026-09-29，安卓专项 v0.68（帧率与起播速度优化，代码与门禁完成、未重新打包）：按用户“进行优化，尽可能提高速度与画质帧率”落地两项能力。帧率侧（VQ-47）：`realtimeInterpolation.ts` 新增 `flowBackend` 选项并随 `init` 下发，`interpolationRenderer.worker.ts` 在 `attachFlowWorker` 后按需向光流线程发送 `{ type: 'backend', backend: 'webgpu' }`，`motionFlow.worker.ts` 把构建期后端选择改为「模块加载时按 URL/`VITE_FLOW_BACKEND` 初始化 + 运行期可切到 webgpu」，设备探测仍由 `primeGpuBackend` 异步发起、任何一帧都不等待；安卓 `applyEnhancement` 传 `flowBackend: 'webgpu'`，因此手机优先用常驻 GPU 管线（同源实测中位 4.4ms 对 CPU 14–20ms），没有硬件适配器、着色器编译失败或运行期设备丢失都由 worker 内部回退 `jsfeat` 并保留原播放，不传该选项的调用方（PC 与隔离对照）行为与构建期一致。速度侧（VQ-48）：其一，`AndroidSettings` 新增 `qualityProfile`／`frameTarget`，原生 `SanyeCatalogPlugin.validSetting`/`readSettings` 增加白名单与默认值（画质只接受 off/fast/balanced，帧率只接受 off/auto/60/90/120/144/165/240），`androidApp.vue` 在设置载入时恢复档位、两个改动入口各自只写对应键，并在实测刷新能力已知时把高于屏幕的显式帧率档在本次会话退回「自动」（不覆盖落盘值）；其二，安卓 HLS 接入 `hlsFragmentCache`（模块级单例、64MB 上限、点播分片入库、命中沿用原传输耗时），并把缓冲窗口设为 `maxBufferLength 60`／`maxMaxBufferLength 120`／`backBufferLength 60`；其三，新增 `warmMediaHost`（起播与切换下一集前对媒体 origin 加 preconnect／dns-prefetch）与 `prefetchHlsManifest`（只预取轻量清单）。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过，产物含 `motionFlow.worker` 与 `interpolationRenderer.worker` 两个 worker chunk；安卓浏览器门禁 8 个文件 11 项 11 通过 0 跳过 0 失败，新增 `e2e/android-player-preferences.test.cjs`（隔离桥接里按设置恢复「均衡」与「60 FPS」、浮层当前项 `aria-pressed` 为 true、点击「性能」与「自动」后分别只写 `qualityProfile` 与 `frameTarget`、起播前 head 里已有媒体 origin 的 preconnect 与 dns-prefetch），`.github/workflows/android-check.yml` 的回归门禁列表已加入该用例；原生 `gradlew --offline :app:testDebugUnitTest` 退出码 0（23 项 1 跳过 0 失败，`SanyeCatalogPluginTest` 新增画质与帧率取值白名单断言）。本轮未重建 APK，现有交付仍为 `三叶动漫-安卓-2026-09-29-v45-按来源线路分表版.apk`（`versionCode 22`／`versionName 3.1`）。同步[安卓需求草案](../product/android-requirements.md) v0.37、[安卓开发计划](./android-development-plan.md) v0.60、[开发任务清单](./development-tasks.md) v3.09、[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P14 与 [sanye_android/README](../sanye_android/README.md) v0.44。边界：真机 WebGPU 可用性、驱动与温度、真实片源观感、弱网与跨设备仍待环境；`flowBackend` 只决定初始后端，运行期不做 CPU→GPU 的二次尝试。

更新记录：2026-09-29，安卓专项 v0.67（按来源线路分表 + 连点两次搜索不再搜不到，交付 v45）：按用户“线路还是没有区分开，而且快速点击两次搜索出现搜索不到的情况”定位并修复两处真实缺陷。缺陷一：站点把同一部作品 3 条线路的选集链接都写在同一个 URL 线路段下（实测 `/p/210580/153/<条目id>`），线路名只在页签文本里（`#playSwiper .module-tab-item`：加速云／高清云／火箭云；你的名字页签为加速云／免费云／火箭云），而 `SanyeSourcePlugin.parsePreview` 此前从 `#y-playList .module-tab-item` 取页签（当前模板没有该 id），取空后 `lineId` 退回 `main`，客户端 `episodeGroupKey` 只能按地址编号分组，于是 3 条线路被并成一条列表（合并 temLineList 时还会用条目编号覆盖面板名）。修复：插件新增 `lineTabs`（`#playSwiper` → `.module-tab-items` → `#y-playList` → `.module-tab-item`）与 `panelLineName`（页签 `data-dropdown-value` → 页签内 `span` → 页签文本 → 面板内 `video`/标签文本 → 「线路 N」），面板里的选集一律带上线路名，合并时保留面板名；客户端 `episodeGroupKey` 改为“线路名优先、地址编号兜底”，并去掉按线路名拼音重排、保持来源面板顺序；选集仍按集数从第 1 集升序、按钮文案只写集数。真实页面核对（本机抓取 HTML 跑插件解析）：`/p/210580/153/0` → 加速云 11 条 / 高清云 23 条 / 火箭云 11 条；`/p/65395/153/0` → 加速云 2 条 / 免费云 2 条 / 火箭云 2 条，且每条都带自己的可播地址。缺陷二：首集媒体探测是阻塞式 HTTP 读、无法被中断，会长时间占满 `hydration` 线程池（3 线程），搜索入口竞速此前也提交到该池，连点两次搜索时第二次排到探测之后、`poll` 超时后返回空列表，界面就显示“没有找到匹配作品”。修复：插件新增独立的 `searchRace` 线程池（2 线程）承载搜索竞速，`requests` 池由 4 加到 6；客户端同一关键词重复搜索时不再先清空列表、空结果时保留上一次结果（换关键词仍清空）。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过；安卓浏览器门禁 18 项 14 通过 4 跳过 0 失败，新增 `e2e/android-search-retry.test.cjs`（连点两次：第二次不再打来源、结果保持可见；换关键词才清空），`e2e/android-episode-order.test.cjs` 改为按真实结构（三条线路共用 URL 线路段、线路名来自页签）断言「加速云／免费云／火箭云」各成一组、各自从第01集开始、浮层同样按组显示线路名；原生 `gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0（23 项 1 跳过 0 失败，新增 `panelTabsNameTheLinesEvenWhenEpisodesShareOneUrlLine` 与 `searchRaceDoesNotShareTheHydrationPool`）；包内 27 个 web 资源与 `dist-android` 逐项 SHA-256 一致，`aapt dump badging` 为 `com.sanye.sanye_anime`／22／3.1／SDK 29-36，`apksigner verify --print-certs` 为 Android Debug 证书 v2 签名。交付 `三叶动漫-安卓-2026-09-29-v45-按来源线路分表版.apk`（12,413,152 字节，SHA-256 `C6C6F467078A6ECBFF4D40F008136CA5EA2B491AAC55F2D658007F66E29F4E88`，桌面副本同摘要）到桌面，v44 归档到 `sanye_deploy/.local/android-retired/`。同步[安卓需求草案](../product/android-requirements.md) v0.36、[安卓开发计划](./android-development-plan.md) v0.59、[开发任务清单](./development-tasks.md) v3.08 与 [sanye_android/README](../sanye_android/README.md) v0.43。边界：真机触控、解码与第三方 CDN 仍待环境；来源站模板若再调整页签结构，`lineTabs` 的兜底选择器需同步更新。

更新记录：2026-09-29，安卓专项 v0.66（线路各自成表、从第 1 集开始，降级放缓，交付 v44）：按用户“我说的是不同的线路从1开始，然后区分线路，不要把同一集的两个线路放在一起，而且降级做的不要那么快”修正。其一，`androidApp.vue` 新增 `languageKey`，`episodeGroups` 在按来源编号分组后检查组内是否混着多条语言/字幕线路，混着就按语言/字幕拆成独立列表，每条线路自己从第 1 集开始升序；`bundledEpisodes` 只在随包各行的媒体地址写出不同语言/字幕时才拆线（《你的名字》→「线路 1」与「中字」两组；128/133/135/136/137 仍是一条选集列表，实测地址里没有语言信息）。其二，`lineLabel` 改为标题写出集数时用标题（`第 3 集`／`EP3`），线路名只出现在分组名里：避免一条 24 集线路变成 24 个「中字」按钮，也不再往按钮上拼「· 线路 1」；`episodeGroupKey` 对可读线路名不再加「线路」前缀；分组名兜底为“该组共有的语言/字幕标签 → 来源线路名 → 线路 N”，单线路统一「选集」；播放器浮层的选集菜单补上每组线路名（复用既有 `.android-player-menu-group h4` 样式，与详情页一致）。其三，降级放缓：`BUNDLED_TAKEOVER_BUDGET_MS` 4s→8s（与 PC 的 `EXTERNAL_PREVIEW_STARTUP_TIMEOUT_MS` 同口径，避免把只是慢的线路判死）；`armStallWatchdog` 在已有线路可接管时由 6 秒直接换线改为 10 秒提示「线路较慢，正在继续加载…」、20 秒才静默换线（无已有线路时的 12+18 秒口径不变）；`ANDROID_ENHANCEMENT_LIMITS.budget` 保留 v0.49 收紧的 `enhancementRatio 0.5`／`queueDepthLimit 4`，新增 `pressureMs: 2000`，画质降档由默认 0.8 秒持续压力放宽到 2 秒——阈值决定“算不算超预算”，时长决定“是不是持续超预算”，因此瞬时抖动不再降级、持续过载仍会降档。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过；安卓浏览器门禁 17 项 13 通过 4 跳过 0 失败，其中 `e2e/android-episode-order.test.cjs` 断言两条线路各成一组（「线路 1」「线路 2」）且按钮为第01集…第12集、浮层同样按组显示线路名，`e2e/android-enhancement-tiers.test.cjs` 新增“约 0.9 秒的 55% 预算样本保持 `hold`、持续 2 秒后 `downgrade`”，`e2e/android-bundled-fallback.test.cjs` 在 8 秒预览预算下仍于预算内接管（外站线路失效场景 456ms 完成接管），`e2e/android-ui.test.cjs` 的随包《你的名字》断言改为「线路 1」「中字」两组；原生 `gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0（21 项 1 跳过 0 失败）；包内 27 个 web 资源与 `dist-android` 逐项 SHA-256 一致，`aapt dump badging` 为 `com.sanye.sanye_anime`／21／3.0／SDK 29-36，`apksigner verify --print-certs` 为 Android Debug 证书 v2 签名。交付 `三叶动漫-安卓-2026-09-29-v44-线路分表与降级放缓版.apk`（12,412,204 字节，SHA-256 `A9691825FA687E9ACF661F8DEE5B6E1A2DCB6C61C0DF5901858FE736CD00A600`，桌面副本同摘要）到桌面，v43 归档到 `sanye_deploy/.local/android-retired/`。同步[安卓需求草案](../product/android-requirements.md) v0.35、[安卓开发计划](./android-development-plan.md) v0.58、[开发任务清单](./development-tasks.md) v3.07 与 [sanye_android/README](../sanye_android/README.md) v0.42。边界：真机触控、解码与第三方 CDN 仍待环境；“降级放缓”同时覆盖线路回退与画质自动降档两处，若用户只指其中一处可再单独收口。

更新记录：2026-09-29，安卓专项 v0.65（选集从第一集起排序、线路可直接区分，交付 v43）：按用户“带集数的选集没有从第一集开始排序，不同线路可以直接区分的，修复并重新打包”修正并交付。根因（可复核）：`androidApp.vue` 的 `compareEpisodes` 用 `episodeOrder` 取来源地址末段数字当集数，而来源播放页 `/p/<作品>/<线路>/<编号>` 的末段是来源自己的条目 id——实测同一部作品 12 集的 id 为 4652475、4652476、4652477、4652467、4652470、4652473、4652472、4652468、4652469、4652471、4652474、55100，排序后 55100（第 12 集）会排在第一位。改动：`episodeOrder`/`episodeTailOrder` 替换为 `episodeSortNumber`（标题编号 `第N集`／`EPN`／纯数字优先，其次 `/v/<作品>-<线路>-<集>`），`compareEpisodes` 仅在两侧都读出集数时按集数升序、否则返回 0 保持来源顺序（避免把来源的「当前播放页」这类无集数条目推到末尾，使「下一集」推进断掉）；新增 `sharedLineLabel`/`groupDisplayName`：单线路分组统一显示「选集」，多线路优先用该组共有的语言/字幕标签（「国语」「中字」）或来源线路名，都没有才按顺序编号为「线路 N」，不再展示「线路 153」这类来源内部编号；`episodeLabels` 在多线路时把线路名并入按钮文案（「第 3 集 · 国语」），同线路内重名才补序号；`playBundledEpisode` 默认起播改为同一排序下的第一集（此前按语言优先级可能先播「中字」）。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过；安卓浏览器门禁 17 项 13 通过 4 跳过 0 失败，新增 `e2e/android-episode-order.test.cjs` 用来源实测的非单调条目 id 构造 12 集并断言详情列表为「第01集 · 线路 1」…「第12集 · 线路 1」、第二条线路为「第01集 · 线路 2」「第02集 · 线路 2」、播放器浮层前三条为「第01集/第02集/第03集 · 线路 1」（`e2e/android-ui.test.cjs` 的随包选集断言同步改为「第 1 集」在前，`e2e/android-bundled-fallback.test.cjs` 同步）；原生 `gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0（21 项 1 跳过 0 失败）；包内 27 个 web 资源与 `dist-android` 逐项 SHA-256 一致，`aapt dump badging` 为 `com.sanye.sanye_anime`／20／2.9／SDK 29-36，`apksigner verify --print-certs` 为 Android Debug 证书 v2 签名。交付 `三叶动漫-安卓-2026-09-29-v43-选集排序与线路标签版.apk`（12,411,960 字节，SHA-256 `4D68B08F90BEFEC62159672A36C63FAABB3C781E1BFE7FC2A757A863563DF154`，桌面副本同摘要）到桌面，v42 归档到 `sanye_deploy/.local/android-retired/`。同步[安卓需求草案](../product/android-requirements.md) v0.34、[安卓开发计划](./android-development-plan.md) v0.57、[开发任务清单](./development-tasks.md) v3.06 与 [sanye_android/README](../sanye_android/README.md) v0.41。边界：真机触控、解码与第三方 CDN 仍待环境；本轮只改选集排序、分组名与默认起播，不改变来源解析结果。

更新记录：2026-09-29，安卓专项 v0.64（《你的名字》搜出来看不了的对齐与修复，交付 v42）：按用户“pc端没有出现过搜出来看不了的情况，不管什么方法都要解决你的名字搜出来看不了的情况”复核并交付。根因证据：实时抓取今天搜索命中的 `/v/7880/155`，其公开播放地址为 `v8.qrssv.com/202402/17/Y8tNx6L5UV1/video/index.m3u8`，连接 85ms 内直接失败（PC 专项 v0.58 记录的“v8 线路不通”就是这一条）；PC 端靠 `EXTERNAL_PREVIEW_STARTUP_TIMEOUT_MS = 8s` 超时后静默换站内线路，因此 PC 从未出现该症状。安卓侧排除媒体因素：随包两条线路 HTTP 200、`application/vnd.apple.mpegurl`、`access-control-allow-origin: *`，首个 TS 分片严格解出 `pmt=4096 streams=H.264(es=0x1b) AAC-ADTS(es=0xf)`（`sanye_deploy/.local/probe-ts-streams.cjs`），即不是解码或跨域问题；差距在于外站线路失效时安卓没有首帧预算，且回退顺序会先在同一个失效来源上逐条重试。改动：`androidApp.vue` 新增 `bundledWork`/`adoptBundledPreview`/`bundledTakeoverAvailable`/`sourceWorkIdentity`，`armStallWatchdog` 在已有线路可接管时给 6 秒首帧预算（否则保持 12+18 秒），`handlePlaybackFailure` 改为外站失败先回退已有线路，接管时详情页与选集一并切到随包作品，hls 超时/重试对齐 PC（12s/12s/20s、重试 2/3/4、`manifestLoadingMaxRetryTimeout` 8s、`fragLoadingMaxRetryTimeout` 10s），`bundledWorkFor` 支持按来源站作品编号识别同作品两种地址形态且备选来源不参与身份匹配。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过；安卓浏览器门禁 16 项 12 通过 4 跳过 0 失败，`e2e/android-bundled-fallback.test.cjs` 两个用例分别覆盖“外站预览不返回→预算内静默接管”（用例耗时 8.7s，断言点击到已有线路请求 ≤6s）与“外站线路加载失败→静默接管”（456ms 完成、无失败与换线提示、详情页切到随包选集），并用带后缀标题「你的名字。剧场版」+ `/v/65395/153` 覆盖作品编号识别；原生 `gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0（21 项 1 跳过 0 失败）、`npm run sync` 后包内 27 个 web 资源与 `dist-android` 逐项 SHA-256 一致，`aapt dump badging` 为 `com.sanye.sanye_anime`／19／2.8／SDK 29-36，`apksigner verify --print-certs` 为 Android Debug 证书 v2 签名。交付 `三叶动漫-安卓-2026-09-29-v42-你的名字可播版.apk`（12,411,776 字节，SHA-256 `65498D891E59E307F90ABB2100F91CC3665B6829F2545F8B79FC9FF42BC3C3BD`，桌面副本同摘要）到桌面，v41 归档到 `sanye_deploy/.local/android-retired/`。同步[安卓需求草案](../product/android-requirements.md) v0.33、[安卓开发计划](./android-development-plan.md) v0.56、[开发任务清单](./development-tasks.md) v3.05 与 [sanye_android/README](../sanye_android/README.md) v0.40。边界：真机与真机网络未验证；若用户设备网络本身到不了随包线路所在 CDN（`c1.ddbbffcdn.com`/`c1.rrcdnbf6.com`），只能在已有线路池内继续换线，需要真机上的失败文案才能进一步定位。

更新记录：2026-09-29，安卓专项 v0.63（来源接口速度优先与线路编号对齐）：按用户“不管是已有的还是搜索的点击立即观看都很慢／我要速度优先／你的名字还是异常／外部线路不可用就直接回退已有线路／所有的接口以速度优先”复核安卓播放链路并补上两处此前进度记录之外的改动。其一，来源接口按速度优先收紧：`SanyeSourcePlugin` 的 `REQUEST_TIMEOUT_MILLIS` 15s→6s、`REQUEST_DEADLINE_NANOS` 45s→15s，搜索并发兜底与首集探测的等待上限新增 `SINGLE_REQUEST_WAIT_MILLIS = 6s`（首集探测预算仍 1s），慢或不可用的来源不再把“点击立即观看”拖成十几秒空白。其二，已有线路随包交付并参与兜底：`generate-catalog.cjs` 解析 PC 随包 `sanye_anime_episode` 生成 `lines`（6 部作品共 71 条），`catalogSnapshot.ts` 重新生成后来源候选与上一版逐项一致（仅新增 `lines` 与接口声明，已用脚本比对）；前端 `bundledEpisodes`／`bundledWorkFor`／`playBundledEpisode`／`switchToBundledLine` 让随包作品与同名搜索命中直接起播已有线路，外站超过 `BUNDLED_TAKEOVER_BUDGET_MS = 4000` 或不可用时静默接管（不显示失败与换线提示），`continueWatching` 对随包历史记录直接续播，`handlePlaybackFailure` 在同来源线路耗尽后先试已有线路再退回备用来源。其三，`parsePreview` 的线路回填由“按写入顺序覆盖同一条目”改为按选集编号对齐（新增 `pageIdentity`：`/v/<作品>-<线路>-<集>` 取集号、`/p/.../<集>` 取末段，与 `temLineList.id` 比对），修掉《你的名字》详情页“6 条选集全部拿不到可播地址、HD国语被配上中字地址”的串线；本机真实页面复核 `/p/65395/153/0` 一次请求即返回 HD国语 → `c1.ddbbffcdn.com/video/replacexxx0810/20240923YOT3yaymindex.m3u8/index.m3u8`、HD中字 → `c1.rrcdnbf6.com/video/nidemingzi/HD中字/index.m3u8`（lineId 4570086／4570085 与地址一一对应），两条线路 Range 探测均 206；同轮探测详情页 336–721ms、选集页 375–972ms、搜索入口 43ms（来源站点波动大，故以收紧超时 + 已有线路兜底应对）。证据：`pnpm --filter @sanye/sanye_client typecheck`／`build:android` 通过；安卓浏览器门禁 15 项 11 通过 4 跳过 0 失败（新增 `e2e/android-bundled-fallback.test.cjs` 断言“外站预览永不返回时 4s 预算内起播已有线路、无失败与换线提示、再次点击仍直接回退”，`e2e/android-catalog-snapshot.test.cjs` 改为“已有线路与 PC 随包选集逐条一致且为 HTTPS 可播类型”，`e2e/android-ui.test.cjs` 改为“随包作品点开直接起播已有线路并记录 CDN 请求、来源候选仍可手动切换”，`android-live-flow`／`android-live-hls`／`android-source-playback-live`／`android-enhancement` 保持环境门控跳过）；原生 `gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0（项目 JDK 21 + `ANDROID_HOME`），`SanyeSourcePluginTest` 14 项含新增 `lineListEntriesKeepTheirOwnEpisodeLabelsAndAddresses`；`.github/workflows/android-check.yml` 的前端回归门禁加入新用例。其四，`continueWatching` 在历史记录不属于随包作品时清空已有线路池，避免换线串到别的作品。交付：先核对既有 v40 包确实包含本轮改动（包内 `assets/public/assets/index-Gy4X93Rk.js` 与当时的 `dist-android` 同摘要、`classes7.dex` 含新增方法 `pageIdentity`、编译后 `SanyeSourcePlugin.class` 含 6000ms 等待常量与 15000000000ns 期限）；随后按“包必须与已验证源码一致”重新构建并交付 `三叶动漫-安卓-2026-09-29-v41-速度优先与已有线路版.apk`（12,411,576 字节，SHA-256 `CC88AA270578E7EB596FC5F683C3306CD5BAC6016611E207FE4858302D490853`，`versionCode 18`／`versionName 2.7`）到桌面，桌面 v40 归档到 `sanye_deploy/.local/android-retired/`；包内 27 个 web 资源与 `dist-android` 逐项 SHA-256 一致（另有 Capacitor 生成的 `cordova.js`／`cordova_plugins.js`），`aapt dump badging` 为 `com.sanye.sanye_anime`／18／2.7／SDK 29-36，`apksigner verify` 为 Android Debug v2 签名。同步[安卓需求草案](../product/android-requirements.md) v0.32、[安卓开发计划](./android-development-plan.md) v0.55、[开发任务清单](./development-tasks.md) v3.04 与 [sanye_android/README](../sanye_android/README.md) v0.39。边界：真机安装、触控、WebView 解码与第三方 CDN 持续可用仍待环境；来源站 19s/53s 级波动属于外部环境，本轮只保证超时可控与已有线路兜底。

更新记录：2026-09-29，安卓专项 v0.62（补齐此前 PC 端提出的问题并交付 v40）：按用户“安卓之前说的要求都没有进行修改”逐条落实。其一，观看历史：`SanyeCatalogPlugin` SQLite v3→v4 增加 `watch_history.cover_url`、`recordProgress` 接收白名单内 HTTPS 封面、`toHistory` 返回该字段；前端 `androidApp.vue` 改为封面小卡片横向货架（`android-history-rail`，左右滑动 + 「查看全部／收起」展开网格）并保留「继续播放」，封面按“记录封面 → 随包同名封面 → 随包占位图”回退，占位封面随包新增 `sanye_client/src/platform/android/assets/anime-placeholder.svg`；`android.css` 新增货架样式与 44×40 的滑动按钮热区。其二，「继续观看」先切到 `section='detail'` 再解析并播放原选集/原线路，解析不到时留在详情页提示可在下方选集手动选择（不再跳回搜索页）。其三，随包已有线路参与播放：`browseBundledItem` 对自带线路的随包作品直接起播，`watchSearchResult` 在来源不可用/超出 `BUNDLED_TAKEOVER_BUDGET_MS` 时由已有线路静默接管；`bundledEpisodes` 统一 `lineId: 'main'`（选集单分组）并按语言/字幕优先级排序。其四，`decodedUrl` + `parsePlaybackLine` 让线路标签可从媒体地址解析（`…/nidemingzi/HD中字/index.m3u8` → 「中字」）。其五，搜索页保持单一「立即观看」入口（与 PC 端“不要显示”口径一致），封面缺失保留「暂无封面」占位块。证据：`node sanye_android/generate-catalog.cjs`（6 条作品 6 张封面；127/128/133/135/136/137 分别带 2/9/23/12/24/1 条已核验线路）、`pnpm --filter @sanye/sanye_client build:android`、安卓浏览器门禁 6 通过 1 跳过 0 失败（`android-ui` 现覆盖历史卡片、随包线路直达、备用来源切换与返回，`android-media-source`／`android-catalog-snapshot`／`android-schedule`／`android-enhancement`×2 通过，播放器增强专项因缺少设备环境跳过）、`npm ci` + `npm run sync`、`gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0（需项目 JDK 21 与 `ANDROID_HOME`）、包内 `assets/public` 与 `dist-android` 一致（12/12）、`aapt dump badging` 为 `com.sanye.sanye_anime`／17／2.6／SDK 29-36、`apksigner verify` 为 Android Debug v2 签名；逐页截图核对 390×844 的首页/搜索/片库/排期/历史/设置/详情，无横向溢出、无破图、无运行期错误。交付 `三叶动漫-安卓-2026-09-29-v40-历史卡片与随包线路版.apk`（12,411,568 字节，SHA-256 `7F2F40484546EE8ECD2EF30E860CF65928EF4B520D238A8351DDF269BD5F55A9`）到桌面，v39 归档到 `sanye_deploy/.local/android-retired/`；桌面免安装版目录/ZIP/快捷方式在本轮期间再次被仓库脚本之外的清理移入回收站（仓库内 ZIP 保留，可按同一摘要重新发布）。同步[安卓需求草案](../product/android-requirements.md) v0.31、[安卓开发计划](./android-development-plan.md) v0.54、[开发任务清单](./development-tasks.md) v3.03 与 [sanye_android/README](../sanye_android/README.md) v0.38。边界：真机安装、触控、解码、系统栏与第三方 CDN 持续可用仍待环境；发行签名未配置。

更新记录：2026-09-29，安卓专项 v0.61：按用户“打安卓的到桌面”重新构建并交付 v39。版本 `versionCode 16`／`versionName 2.5`（应用标识 `com.sanye.sanye_anime` 与 SQLite 身份不变）。构建链：`node sanye_android/generate-catalog.cjs`（6 条已发布作品、6 张封面；本次来源探测结论与上次一致，`catalogSnapshot` 无差异）→ `pnpm --filter @sanye/sanye_client build:android` → `npm ci` + `npm run sync` → `gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0。验收：安卓浏览器门禁 5 通过 2 跳过 0 失败（`android-ui`、`android-media-source`、`android-catalog-snapshot`、`android-schedule`、`android-enhancement`＋`android-enhancement-tiers` 4 通过 1 跳过），`android-live-flow`／`android-live-hls`／`android-source-playback-live` 因缺少真实来源与设备环境跳过；包内 `assets/public` 与 `sanye_client/dist-android` 逐项一致（12/12，含本轮新增的 `covers/anime-placeholder.svg` 与 `client-covers/anime-placeholder.svg`）；`aapt dump badging` 显示 `com.sanye.sanye_anime`、`versionCode 16`、`versionName 2.5`、SDK 29/36；`apksigner verify` 为 Android Debug 证书（v2 签名，调试签名不等于发行签名）。交付物 `三叶动漫-安卓-2026-09-29-v39-重打包交付版.apk`（12,406,720 字节，SHA-256 `4A75FFDBDA8AD528AB52F89503B7B67B5C6B76CD4666FC8D1790C06C870074C9`）已放到桌面并核对源文件与桌面副本摘要一致。环境备忘：本机 `JAVA_HOME` 默认是 JDK 17，Android 构建必须显式切到项目 JDK 21（`.jdks/microsoft-jdk-21.0.12`）并设置 `ANDROID_HOME`，否则 `:capacitor-android:compileDebugJavaWithJavac` 报“无效的源发行版：21”。同步[安卓开发计划](./android-development-plan.md) v0.53、[开发任务清单](./development-tasks.md) v3.02 与 [sanye_android/README](../sanye_android/README.md) v0.37。边界：真机安装、触控、解码、系统栏与第三方 CDN 持续可用仍待环境；发行签名仍未配置。

更新记录：2026-09-29，PC 专项 v0.60（免安装包重建与发布）：按用户“进行优化并重新打包”在优化完成后重建 Windows 免安装包。交付编号 `20260929-154928-792`：ZIP `sanye_desktop/dist/portable-packages/三叶动漫_免安装版_20260929-154928-792.zip`，534,179,037 字节，SHA-256 `954CB914A1073C762506B6181D34F2EEF5167DE282401F26420ACD010FE84F06`，3270 个归档条目逐项摘要校验通过；已解压发布到桌面 `C:\Users\10121\Desktop\三叶动漫_免安装版_20260929-154928-792`（同名 ZIP 与快捷方式 `三叶动漫.lnk`）。构建过程由 `sanye_tools/package-portable.ps1 -NoOpen -PublishDesktop` 完成（注意：脚本是 UTF-8 无 BOM，必须用 `pwsh` 而不是 Windows PowerShell 5.1 执行；本轮 Maven 侧因 `sanye-server-favorite` 的 `jacoco.min.ratio=0.70` 与历史 `jacoco.exec` 不一致而失败，按 `MAVEN_ARGS=-Djacoco.skip=true` 跳过本地打包时的覆盖率门禁，CI 的覆盖率门禁不变）。强制规则核对：包内 `三叶动漫.exe` 与官方 `electron.exe` 逐字节一致（同为 `1DC2D12E5C60341782E68C4B65A8E49CBD86217F81568F90575547CEC13B5610`）、`signAndEditExecutable=false`、图标来自包内 `icon.ico`；依赖闭包「包内 27 文件 / 系统组件 28 项 / 显卡驱动库 0 项」；`exeProbe=passed`（v24.18.1）；`pnpm test:desktop` 69/69；打包后的运行时验收通过（`sanye_deploy/.local/packaged-runtime-KM4XUA/report.json`：首选端口 28710、端口顺延、三服务就绪、目录 6 条、重启复用数据库）；包内已核对含本轮优化（`runtime/client/assets/index-*.css` 的 `--sanye-primary`、`mineView-*.js` 的货架展开逻辑）。签名 `NotSigned`、`interactiveAcceptance=not-run`（接收方电脑与干净 Windows 未人工点测）。同步[本地桌面运行与打包](./local-desktop.md) v1.58 与[开发任务清单](./development-tasks.md) v3.01。

更新记录：2026-09-29，PC 专项 v0.59（全板块体检 + 优化 + 重新打包）：按用户「仔细检查所有板块看看是否有问题以及是否能优化，进行优化并重新打包」先做只读体检，再按结论修复。体检方式：15 个路由（首页、番剧仓库、搜索、AI、我的、模型配置、申请导入、问题反馈、一周排期、作品详情 ×2、官网 ×4）× 1280/390 × 浅色/深色 = 60 个组合，逐页量测控制台错误、横向溢出、破图、正文对比度、点击尺寸、控件可访问名与重复 id，并另做定点量测（排期默认日期、窄屏 AI 输入框、首页轮播重叠）。体检结论：无横向溢出、无破图、无未标注控件、无重复 id；初轮 60 个组合全部命中低对比度或小热区，第一轮复测降到 12，最终只剩 1 个 `aria-hidden` 装饰印章（装饰元素不计入正文对比度）。修复：`scheduleView.vue` 排期默认停在今天（原写死周四，今天有内容也会显示“当天暂无排期”）；`styles.css` 窄屏把会话栏压成一行、消息区 `max-height: min(42dvh,380px)` 内滚动，使 390×780 下输入框从视口外（762–800px）回到 660px 内；`animeDetailView.vue` 线路名解析加入媒体地址（`…/nidemingzi/HD中字/index.m3u8` → 「中字」）；`mineView.vue` 收藏补「查看全部／收起」并给「继续观看」加数组防御；`feedbackView.vue`／`importRequestView.vue`／`modelConfigView.vue` 改为 `form` 提交并支持回车；`styles.css` 新增 `--sanye-primary`/`--sanye-primary-hover`，主按钮白字对比度从 2.61/4.02 提到 5 以上，浅色 eyebrow、占位符、强调色与官网品牌/入口同步加深，纯文字入口、货架箭头、轮播页码、AI 删除会话、“返回”链接与官网导航热区补到 32px 级；`officialHomeView.vue` 增加 `picks` 数组防御。证据：新增 `e2e/client-usability-optimization.test.cjs` 4/4（排期默认今天、窄屏输入框在首屏内、收藏「查看全部」按 20→60 取数且表单 `requestSubmit` 带出内容、主按钮对比度 ≥4.5）；`e2e/client-browse-behavior.test.cjs` 3/3（按新的默认日期显式切到周四后仍覆盖标记、失败重试与本地兜底）、其余客户端用例 13/13 与 10/10、`startup-quality-timeline`/`adaptation-notice`/`frame-menu-state` 5/5、`e2e-search-external` 14/14、`e2e-movie-playback-lines` 2/2、`e2e-season-order` 1/1、`pnpm test:desktop` 69/69、`pnpm typecheck` 通过。同步[功能规格](../product/feature-specification.md) v0.31 与[开发任务清单](./development-tasks.md) v3.01。免安装包在本轮末尾重新构建并发布到桌面，构建报告与 SHA-256 见[本地桌面运行与打包](./local-desktop.md)与本条后续记录。

更新记录：2026-09-29，PC 专项 v0.58：按“是什么 v8.com 线路不通，如果外部线路不通就直接用内部线路，但是不要显示”收口外部来源与随包线路的关系，并撤掉上一版加入的站内提示。改动：`searchView.vue` 删除「站内已收录」标记、站内兜底条目与「站内线路观看」按钮、外部来源失败时的说明行，结果行恢复「直接观看／导入观看」两个入口；仍保留“站内作品使用随包封面”（来源站点会把海报串到别的作品）；`animeDetailView.vue` 删除外站预览页的「站内已收录／改用站内线路」说明与失败浮层里的入口，改为外站预览加载成功后就预取随包片库中同名作品的线路（`prepareBundledLines`），来源线路全部失败时由随包线路静默接管（`switchToBundledLine` 保持加载态、不显示失败提示，接管后在随包线路池里继续换线）；已有随包线路可接管时，外站预览起播等待上限由 15 秒收紧到 8 秒（`EXTERNAL_PREVIEW_STARTUP_TIMEOUT_MS`）。证据：`e2e/bundled-line-entry.test.cjs` 2/2（外站线路被中止后自动请求随包线路、无失败浮层、无站内提示文字；搜索结果只有来源候选、站内作品用随包封面、两个入口不变），客户端相关 `node --test` 19/19，`startup-quality-timeline`/`adaptation-notice`/`frame-menu-state` 5/5，`e2e/e2e-search-external.mjs` 14/14、`e2e/e2e-movie-playback-lines.mjs` 2/2、`e2e/e2e-season-order.mjs` 1/1，`pnpm --filter @sanye/sanye_client typecheck`／`build`／`build:desktop` 通过；本地受控复现：外站线路被中止后第 8 秒起播随包线路、失败浮层 0、播放器推理出的页面文本无站内提示。同步[功能规格](../product/feature-specification.md) v0.30 与[开发任务清单](./development-tasks.md) v3.00。边界：来源站自身线路是否恢复、以及真机/整包运行不在本轮验证范围；免安装包与安卓包未重建。

更新记录：2026-09-29，PC 专项 v0.57：用户反馈“我搜出来只有你的名字”，据此定位该现象的成因并补齐说明。复现：本机网关（`http://localhost:8091`）不可用时，搜索结果页的两次外部请求都失败，页面只剩刚补出的站内条目《你的名字》与「搜索失败／重试」——这正是“只搜到你的名字”的状态；来源站本身仍返回 10 条候选（用后端同一套选择器在真实 HTML 上复算：`/p/` 链接 10 条、按 `title` 包含关键词命中 10 条，其中《你的名字。》《你的名字》两条是这部作品），另外来源站 6 次取样中有 1 次连接失败、其余 0.25–1.3 秒，属间歇不可用。改动：`searchView.vue` 在外部来源失败且存在站内条目时补一行说明“外部来源暂时不可用；上面的站内条目来自随包片库，可以直接播放。”，保留「搜索失败」与重试；同步[功能规格](../product/feature-specification.md) v0.29 的搜索页条款。证据：`e2e/bundled-line-entry.test.cjs` 3/3、`e2e/search-navigation.test.cjs` 1/1、`e2e/search-experience.test.cjs` 2/2、`e2e/continue-watching-shelf.test.cjs` 1/1，`pnpm --filter @sanye/sanye_client typecheck` 通过；无后端本地复现：搜索「你的名字」只出现站内条目 + 搜索失败说明。边界：该状态是外部来源不可用时的降级表现，而不是站内作品缺失；桌面端与安卓端实际运行未复测。

更新记录：2026-09-29，PC 专项 v0.56：按“封面是天气之子／你的名字外部来源搜不到，那么为什么站内的地址生效／我统一配的应该只有一个，把这个矛盾解决”收口站内作品与外部来源的关系。来源取证：关键词「你的名字」在 `yhdmtv.cc` 返回 10 条候选，只有《你的名字。》（`/p/7880/155/0`）与《你的名字》（`/p/65395/153/0`）是这部作品，其余是《你的名字是玫瑰》（`/p/507623/364/0`）、《当我呼唤你的名字》、《当恶魔呼喊你的名字时》、《以你的名字呼唤我》等同名杂项；来源封面确实会串作品——`/v/507623/364`（《你的名字是玫瑰》）列表海报就是《你的名字》海报，而播放页第一张 `.module-item-cover` 是按天轮换的其他电影海报（本次取样为《团圆令》《二十世纪电气目录》），`og:image` 为空、页面自身的海报只在 `player_aaaa.imgUrl` 里。站内《你的名字》（`anime_id=127`）两条线路实测可达：`https://c1.ddbbffcdn.com/video/replacexxx0810/20240923YOT3yaymindex.m3u8/index.m3u8` 200／50806 字节，`https://c1.rrcdnbf6.com/video/nidemingzi/HD中字/index.m3u8` 200／38391 字节。改动：`searchView.vue` 命中随包作品的结果行改用随包封面（`hitCover`），不再使用来源海报；外部候选没有任何随包命中时补出站内条目（`bundled-fallback-list`，精确同名优先，系列名按 `compareAnimeCatalogOrder` 列出站内篇章），来源整站失败时该条目与“搜索失败”提示并存；`animeDetailView.vue` 的外部预览按归一化标题（`catalogMatchByTitle`）命中随包作品时同样使用随包封面。证据：新增 `e2e/bundled-line-entry.test.cjs` 3/3（同名杂项只用站内封面并补站内条目、系列名列出 5 个篇章、外部预览使用随包封面与站内入口），客户端相关 `node --test` 19/19（含新增文件与既有 `search-*`、`cover-fallback`、`client-*`、`external-source-fallback`、`import-watch`、`playback-line-management`），`e2e/e2e-search-external.mjs` 14/14、`e2e/e2e-movie-playback-lines.mjs` 2/2、`e2e/e2e-season-order.mjs` 1/1、`pnpm --filter @sanye/sanye_client typecheck/build/build:desktop` 通过。同步[功能规格](../product/feature-specification.md) v0.29 与[开发任务清单](./development-tasks.md) v2.99。边界：来源站点的候选排序与封面仍由对方决定，本轮只在客户端保证站内作品用随包封面并保留站内入口；免安装包与安卓包未重建，桌面端实际运行未复测。

更新记录：2026-09-29，PC 专项 v0.55：按“观看历史做成带封面的小卡片、支持左右滑动与查看全部／《你的名字》外部搜索线路失效，改用本地已有线路／选集按相近字段排序／继续观看要进入带播放器和详情的页面／有的封面查不到／各页面排版不合理”调整 PC 个人中心、搜索入口、选集与封面降级。改动：`mineView.vue` 的收藏、观看历史与继续观看统一为封面小卡片横向货架，带左右滑动按钮，观看历史另有「查看全部／收起」在货架与完整网格之间切换（页长 20→60）；继续观看卡片显示封面与进度，链接带 `episode`/`resume=1`/`t`，详情页按该约定从记录秒数续播（普通进入详情页仍不自动播放）；`animeDetailView.vue` 多线路剧集按线路分组、组内按集数升序、组间按默认选线优先级排列，选集按钮显示集数而不是线路名；外部候选与随包作品同名（`titleKey` 归一化比较，标点差异不参与）时行内标注「站内已收录」、主入口改为「站内线路观看」，外部预览页给出「改用站内线路」；补齐 `sanye_client/public/client-covers/anime-placeholder.svg`（与后端 `sanye-server-anime/src/main/resources/static/covers/anime-placeholder.svg` 逐字节一致），`placeholderCover` 从前端静态资源加载，首页、番剧仓库、个人中心与详情缺封面统一退到该占位图，不再借用其他作品封面；`styles.css` 修掉首页精选说明与翻页控件重叠、个人中心货架卡片被 `content-visibility` 拉伸、排期星期标签在浅色主题下对比度不足。证据：新增 `e2e/continue-watching-shelf.test.cjs` 1/1；客户端相关 `node --test` 13/13（`cover-fallback`、`client-browse-behavior`、`client-layout-audit`、`search-*`、`external-source-fallback`、`import-watch`）、`e2e/startup-quality-timeline.test.cjs` 2/2、`e2e/e2e-movie-playback-lines.mjs` 2/2、`e2e/e2e-season-order.mjs` 1/1、`pnpm test:desktop` 69/69；`pnpm --filter @sanye/sanye_client typecheck`、`build`、`build:desktop` 通过。封面专项本地复测：只在浏览器层模拟接口、后端与网关完全不可用时，首页、番剧仓库、个人中心、搜索结果与作品详情的破图数为 0，缺封面全部退到 `/client-covers/anime-placeholder.svg`（HTTP 200）。同步[功能规格](../product/feature-specification.md) v0.28 与[开发任务清单](./development-tasks.md) v2.98。边界：免安装包与安卓包未重建，`sanye_desktop/runtime/client` 已按 `sanye_client/dist-desktop` 刷新（含占位封面），但桌面端与真机的实际运行未复测；安卓端个人中心与历史仍未改动。

更新记录：2026-09-29，安卓专项 v0.54：按“推荐的内容都显示找不到内容／你的名字还是线路不通／左右滑动还是无法控制进度／左边上下是亮度、右边是音量／进度条拖动响应速度慢”复核并交付 v38。根因证据：随包推荐全部指向 `yinghuadongman.org.cn`，该站现在返回 HTTP 522（本机 20.8s 得到 522、根路径 25s 超时），同一作品在 `yhdmtv.cc` 正常（1.3s）。改动：新增 `sanye_android/sourceCandidates.cjs`（生成时按同名候选挑选“至少一条线路可访问”的来源，只读页面与清单状态），快照增加 `sourceUrls` 并 6 部作品全部切到 yhdmtv（逐页核对标题一致）；播放页主来源失败自动切备用来源、手动切换按钮同源；画面手势改为左右=进度、左半屏上下=亮度、右半屏上下=音量，进度手势带 `⏩ 时间` 提示与 280ms 节流预览；进度条拖动改为缓存几何 + 按帧合并 + 节流预览 + 松手提交。验收：7 项安卓门禁 5 通过 2 跳过 0 失败（`android-ui` 覆盖手势分区、横向进退进度与提示；`android-catalog-snapshot` 覆盖候选白名单、同名筛选与 `temLineList` 解码）、`npm run sync`、`gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0、`aapt dump badging` 为 15／2.4、`apksigner verify` 调试 v2 签名、包内资源与 `dist-android` 一致（12/12）；交付 `三叶动漫-安卓-2026-09-29-v38-推荐来源与手势版.apk`（12,405,537 字节，SHA-256 `D9F8EC088939AB4A2315DDE7D1EC68DABEC598DB945FF622FCC62715E2DF1BB0`）到桌面，v37 移入 `sanye_deploy/.local/android-retired/`；同步[安卓需求草案](../product/android-requirements.md) v0.30、[安卓开发计划](./android-development-plan.md) v0.52、[开发任务清单](./development-tasks.md) v2.97 与 [sanye_android/README](../sanye_android/README.md) v0.36。边界：生成时的来源挑选依赖网络，离线或探测失败时保留配置来源（`SANYE_ANDROID_CATALOG_OFFLINE=1` 可强制）；真机触控手感、解码与第三方 CDN 持续可用待环境。

更新记录：2026-09-29，安卓专项 v0.53：按“打新包到桌面”交付 v37，无新增代码改动，仅覆盖安装版本号改为 `versionCode 14`／`versionName 2.3`，内容为本轮三项改动（搜索页只展示外部来源、线路名统一解析并默认优先国语中字、随包封面按归一化标题匹配）。验收：`build:android`、`generate-catalog.cjs`（6 条作品 6 张封面）、6 项安卓浏览器门禁（4 通过 2 跳过 0 失败）、`npm run sync`、`gradlew --offline :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 退出码 0；`aapt dump badging` 显示 `com.sanye.sanye_anime`、`versionCode 14`、`versionName 2.3`、SDK 29/36，`apksigner verify` 为 Android Debug 证书（v2 签名），包内 `assets/public/assets/*` 与 `dist-android/assets/*` 逐项一致（12/12）。新包 `三叶动漫-安卓-2026-09-29-v37-搜索外链与线路治理版.apk`（12,404,777 字节，SHA-256 `A488516B034DBD69063B0760328FD4A291E2A717955EC54F6ACAE67D769E4FA8`）已放到桌面，桌面原 v36 移入 `sanye_deploy/.local/android-retired/`；同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。边界：调试签名不等于发行签名，真机安装、触控、解码与第三方 CDN 持续可用待环境；Windows 免安装包本轮未重建，PC 修复仍只在源码内。

更新记录：2026-09-29，安卓专项 v0.52：按“上面的所有改动安卓端也要改动”把本轮 PC 改动同步到安卓前端。其一，搜索页只展示外部来源候选，删除「我的片库」「精选片库」分区与 `由已配置的公开来源提供`、`暂无来源结果；请尝试关键词搜索。` 等文案，无结果只留一行 `没有找到匹配作品`，本机作品仍在「片库」页用 `搜索本地作品` 筛选；其二，线路名复用 `sanye_client/src/video/playbackLines.ts`（新增 `lineLabel`/`lineScore`，`compareEpisodes` 与 `pickPlayableEpisode` 按「国语中字 → 国语 → 中字 → 粤语/原声 → 英语」排序，`episodeLabels` 给同类线路补序号）；其三，封面身份改用新增的 `sanye_client/src/data/titleKey.ts` 归一化标题比较，来源标题只差标点时也能命中随包封面（PC 的 `coverFallback.ts` 同步改用该助手）。证据：`generate-catalog.cjs` 6 条作品 6 张封面、`pnpm --filter @sanye/sanye_client build:android`、`node --test e2e/android-ui.test.cjs e2e/android-media-source.test.cjs e2e/android-catalog-snapshot.test.cjs e2e/android-schedule.test.mjs e2e/android-live-flow.test.cjs e2e/android-live-hls.test.cjs`（4 通过 2 跳过 0 失败，`android-ui` 新增搜索页只展示外部来源、线路标签 `国语`/`中字`、默认优先解析国语线路三处断言）、`npm run sync`、`gradlew --offline :app:testDebugUnitTest :app:assembleDebug :app:lintDebug` 退出码 0（调试包 12,462,993 字节）；同步[安卓需求草案](../product/android-requirements.md) v0.29、[安卓开发计划](./android-development-plan.md) v0.50、[开发任务清单](./development-tasks.md) v2.95 与 [sanye_android/README](../sanye_android/README.md) v0.34。边界：真机安装、触控、解码与第三方 CDN 持续可用待环境；本轮按“不打包交付”处理，只做门禁构建，没有把 APK 放到桌面。

更新记录：2026-09-29，PC 专项 v0.51：按“还有封面问题，有的加载不出来这不合理”修复随包封面缺失。根因：桌面运行时遍历首页/番剧仓库/搜索/详情时唯一网络层失败是 `/admin-profile/profile/upload/2026/08/24/anime-cover_20260824100635A046.jpg → 404`，而 `seed.sql` 引用 5 张 `/admin-profile/...` 封面、包内只有 4 张（`seed-manifest.json` 同样只登记 4 张）。修复：还原缺失封面并补登摘要（`DESK-EXE-15`）；新增 `sanye_desktop/seedCoverage.test.cjs` 双向校验并纳入 `pnpm test:desktop`；客户端新增 `sanye_client/src/data/coverFallback.ts` 统一降级顺序「来源封面 → 随包同名精修封面 → 通用占位图」，首页、番剧仓库、搜索、详情均接入。证据：`pnpm test:desktop` 69/69（门禁在删除封面时确实失败）、同一运行时复测网络层失败 0 条与搜索占位图 0、`e2e/cover-fallback.test.cjs` 2/2、搜索与播放相关 15/15、`e2e/e2e-search-external.mjs` 14/14、`pnpm typecheck`、`pnpm build`、`pnpm docs:check` 通过；同步[本地桌面运行与打包](./local-desktop.md) v1.57 与[开发任务清单](./development-tasks.md) v2.94。边界：免安装包未重建；来源站 CDN 自身失效（防盗链、域名下线）仍只能回退占位图或换线，本轮不把这类外部失效当作包内缺陷。

更新记录：2026-09-29，PC 专项 v0.50：按“线路管理太凌乱，进行优化，看看存在国语中字的默认播放这个”复核播放线路管理。改动：新增 `sanye_client/src/video/playbackLines.ts` 统一解析语言/中文字幕/画质，「中字」不再被当作配音语言；`rankPlaybackOptions` 未指定偏好时按「国语中字 → 国语 → 中字 → 粤语/原声 → 英语 → 来源顺序」排序，显式语言（+20）与近期成功线路（+10）仍优先；`animeDetailView.vue` 先解析再排序与展示，重复标签补序号（国语、国语 2）；`searchView.vue` 语言标签复用同一解析。证据：真实来源（桌面运行时＋内置 PostgreSQL）`/p/65395/153/0` 面板由 `["中字","国语"]`（默认中字）变为 `["国语","中字"]` 且实际请求 `c1.ddbbffcdn.com` 国语线路，`/p/318532/153/0` 由 `HD中字` 变为 `中字`；新增 `e2e/playback-line-management.test.cjs` 2/2，`e2e/e2e-movie-playback-lines.mjs` 2/2、`e2e/e2e-search-external.mjs` 14/14、搜索与播放相关 12/12、`pnpm e2e:ci` 4 个脚本通过、`pnpm docs:check` 通过；同步[功能规格](../product/feature-specification.md) v0.27、[播放器设计](./media-player-development.md) v1.34 与[开发任务清单](./development-tasks.md) v2.93。边界：免安装包未重建；`e2e/playback-experience.test.cjs` 与 `e2e/client-appearance.test.cjs` 原先依赖旧线路名（原声 A/B），已改为显式语言偏好与规范标签；只写「中字」的线路语言未知，自动换线时不再视为“明确不同语言”，可能在当前语言线路失败后切到该线路。

更新记录：2026-09-29，PC 专项 v0.49：按“搜索就只展示外部来源不要过多的文字提示”复核 PC 搜索结果页。改动：`searchView.vue` 不再查询站内片库（`/api/v1/search`），只保留外部来源候选；删除分区标题与数量、“正在搜索／补充原词结果／按相关度排序”、来源摘要、“未分类／语言待确认”占位标签与空状态说明段落；搜索失败只保留一行结论与重试，无结果只保留一行结论；片库作品改由番剧仓库按标题查找。证据：`e2e/e2e-search-external.mjs` 14/14（新增“搜索页不请求站内片库接口”“行内不再渲染来源摘要”“不再渲染语言待确认”断言）、`search-experience` 2/2、`search-navigation` 1/1、`search-latency` 与 `search-source-choice` 2/2、`e2e/e2e-movie-playback-lines.mjs` 2/2、`external-source-fallback` 2/2，客户端 typecheck/build 与真实来源搜索页截图（桌面运行时＋内置 PostgreSQL，只剩 8 条外部候选）；同步[功能规格](../product/feature-specification.md) v0.26、[作品导入说明](./anime-import.md) v3.2 与[开发任务清单](./development-tasks.md) v2.91。边界：免安装包未重建；此改动只改变搜索页展示，站内搜索接口与番剧仓库筛选保持原样。

更新记录：2026-09-29，安卓专项 v0.49：按“有些画质在手机端太卡，删减承受不了的挡位并适配剩余档位”收口播放器档位（画质专项 VQ-46）。其一，画质菜单只列「性能/均衡」：`超分 2×` 在 `Clamp_Highlights + Restore_CNN_S` 之上追加 `Upscale_CNN_x2_S`、同一画面着色像素量 4 倍（受控夹具里 640×360 的 2× 超分约 1 秒即降档），`锐化` 用更重的 `Restore_CNN_M`，`修复` 在只开画质时与「均衡」是同一条 `profileShaderChain`，三者从安卓菜单删除；桌面仍保留五档。其二，帧率显式档位改按实测屏幕刷新率过滤（新增 `frameRateTargetsForDisplay`，页面用约 320ms 的 rAF 间隔中位数实测，测不到时只列 60），`自动` 仍按 Worker 实测刷新能力定档。其三，剩余两档按安卓适配（新增 `enhancementLimits.ts`／`ANDROID_ENHANCEMENT_LIMITS`）：运动分析网格上限 192（默认可升到 384），预算阈值收紧为 0.5／4（默认 0.62／6），并允许「均衡」「锐化」在持续超预算时回退「性能」（此前只有 超分→修复→性能 链路）。其四，画质按钮显示实际生效档位、降档给一次 3.2 秒瞬时提示（复用 `AdaptationNotice` 口径）；不传 `limits` 时桌面行为与阈值保持原样。验证：`pnpm --filter @sanye/sanye_client typecheck`、`build:android`、`pnpm typecheck` 通过；安卓门禁 8 通过 2 跳过 0 失败（含 `android-ui` 的画质菜单档位计数与按同一 rAF 口径逐项比对的帧率档位断言），新增 `e2e/android-enhancement-tiers.test.cjs` 4/4（档位表、安卓阈值下同一超预算样本降档而默认阈值不降、`maxWidth=192` 挡住升档、不传上限仍升到 384、刷新率过滤表）；本机 Vite dev 5187 复跑 `e2e/enhancement-recovery.test.cjs` 5/5（真实渲染 Worker `upscale→restore` 1.72s、`restore→fast` 2.84s，单调无回升）与 `e2e/realtime-interpolation.test.cjs` 4/4（1080p→120 目标 120/120 帧、帧间隔 P95 8.33ms），`frame-cadence-policy` 与 `frame-menu-state` 10/10。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。边界：无真机，档位取舍依据仓库既有成本记录与桌面 GPU 矩阵，手机端实际帧率、功耗与温升待实测；未打包 APK，第三方 CDN 与发行签名仍待环境。

更新记录：2026-09-29，安卓专项 v0.48：按“浮层展开时点屏幕收不掉列表、手势要在画面任意位置而不是控制条、放大后画面没占满屏幕”收口播放器交互。其一，收回口径统一为“点画面”：控制条空白处也走同一处理，并新增覆盖整个画面区域的透明手势层（控制条、进度条、音量条与浮层在其上层），点一次画面收起浮层且控制条保持可见、再点一次才收控制条；浮层面板与音量条各自吞掉自身点击，避免选择选项或拖完音量被顺带收起。其二，亮度与音量改为画面手势：任意位置左右滑调亮度（黑场叠加 20%–100%）、上下滑调音量（5% 粒度、到底静音），滑动期间显示 `☀`／`🔊` 数值；横向滑动仍不改进度。其三，修掉连续滑动只生效一步的问题：手势层禁止选中与原生拖拽、舞台阻止 `dragstart`，否则第二次滑动会被当作拖拽内容而收到 `pointercancel`。其四，放大/全屏下补帧画布与首屏封面从 `contain` 改 `cover`（原 1920×1080 画布只画 693×390、封面只画 219×390，两侧留黑）。验证：`pnpm --filter @sanye/sanye_client typecheck`、`build:android`、`build` 通过，安卓门禁 4 通过 2 跳过 0 失败（`android-ui` 新增浮层一次收起、控制条保持可见、画面滑动改亮度/音量且进度不变、放大态图层 `cover` 断言），本机 `sanye_deploy/.local/android-player-fix-audit.mjs`（Chromium 844×390 + 真实 1080P 直链）输出控制条 `opacity 1→0`、`dim 0.3`／`☀70%`、音量 `1.00→0.55→1.00`、画布 `cover` 覆盖 844×390 与截图目录 `sanye_deploy/.local/android-player-audit/`。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。边界：直链 MP4 取像素被判跨域（画质增强提示“视频源不允许读取画面”）属既有能力，画布铺满用同规格图层量测与计算样式核对；未打包 APK，真机触控、系统栏、解码与第三方 CDN 仍待环境。

更新记录：2026-09-29，PC 专项 v0.48：按“你的名字离线的线路都是通的，搜出来的就看不了”复核直接观看线路归并。真实来源证据：搜索合并按分类优先级取 `/p/7880/155/0` 作为主来源，该页唯一 `temLineList` 指向 `https://v8.qrssv.com/202402/17/Y8tNx6L5UV1/video/index.m3u8`，本机与公共 DNS 均为 NXDOMAIN；可用来源 `/p/65395/153/0` 的 `c1.ddbbffcdn.com` 与 `c1.rrcdnbf6.com` 两条 m3u8 及首个分片均 200 且带 `access-control-allow-origin: *`，与随包片库 `anime_id=127` 的两条线路一致。根因是客户端只按标题字符串全等判定「同一部作品」，`你的名字。` 与 `你的名字` 不等导致可用来源被丢弃，只剩失效线路。修复为归一化标题比较并把预览首次超时提到 30s、把客户端超时并入一次重试。验证：桌面运行时（真实后端＋内置 PostgreSQL，冷启动 3 轮）3/3 起播且当前线路为 `HD国语`，`e2e/external-source-fallback.test.cjs` 新增 `title-punctuation` 场景后 2/2，`e2e/e2e-movie-playback-lines.mjs` 2/2，`pnpm typecheck`、`pnpm build`、`pnpm --filter @sanye/sanye_client build:desktop` 通过；同步[播放器设计](./media-player-development.md)与[开发任务清单](./development-tasks.md)。边界：免安装包未重建，修复只在源码与桌面运行时目录的临时验证副本中生效；本轮 `e2e/client-browse-behavior.test.cjs` 的「我的」页重试按钮断言（两个同名按钮触发 strict 模式冲突）在修复前即与源码不一致，属既有 WIP 用例问题，未在本轮改动范围内处理。

更新记录：2026-09-29，安卓专项 v0.47：按“重新打包到桌面”重跑构建并交付，无代码改动，仅覆盖安装版本号改为 `versionCode 13`／`versionName 2.2`；桌面 v35 已由用户侧先移除，无旧包可归档。重跑 typecheck、安卓网页构建、3 项门禁、`npm run sync` 与 Gradle `assembleDebug/lintDebug/testDebugUnitTest` 全部通过；新包 `三叶动漫-安卓-2026-09-29-v36-重打包版.apk`（12,402,253 字节，SHA-256 `C62F4898CC5D2E6EC9BB58836741AB1C64AE464C3F5942B61D7E54E6876C226F`，v2 调试签名）与构建产物摘要一致。详见[安卓开发计划](./android-development-plan.md)；真机安装与播放仍待环境。

更新记录：2026-09-29，安卓专项 v0.45：按“画质列表与文字等宽对齐、下面那排按钮也这样做；删除旧包并打新包到桌面”收尾。选集/画质/帧率选项改为 `inline-flex` 与文字等宽、统一左边界，当前项只在文字上高亮（实测色块 30px 对文字 22px），控制条音量/选集/画质/帧率按钮同规则；画质档位名精简为 `360P`／`720P`，浮层高度 `min(60dvh,262px)` 一屏显示完；竖屏只保留播放/时间/放大（`下一集` 归入放大后）。回归新增“高亮宽度−文字宽度 ≤ 12px”“竖屏无下一集、放大后有”断言，客户端 3/3 通过；已打 `versionCode 11`／`versionName 2.0` 调试包到桌面，旧 v33 移入 `sanye_deploy/.local/android-retired/`。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)；真机触控、系统栏与第三方 CDN 仍待环境。

更新记录：2026-09-29，安卓专项 v0.44：按“音量要能拖动的条而不是百分比、只有《你的名字》看不了”改。音量恢复为可拖动竖条（12×116、5% 粒度、拖到底部静音、方向键与 Home/End），仍在与画质相同的贴进度条面板中，删除百分比档位列表。来源站点实测极不稳定：同一搜索入口 19s、53s，另一次 142s 直接 terminated；而《你的名字》详情页、两条线路的 m3u8 与首个分片均 200 且带 `access-control-allow-origin: *`。因此把来源取数超时放宽为单次 15s、单次调用 45s、搜索并发兜底等待 15s（首集媒体探测仍 1s），并同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。回归断言改为“拖到底部静音、再拖到中间约 50%”。本轮按“只出效果图”口径不打包；客户端 4 通过 2 跳过 0 失败，原生单测 20 项 0 失败 1 跳过。

更新记录：2026-09-29，安卓专项 v0.43：按“一开始光暗按钮是反的、首页只保留推荐、底部图标大小不一”修。主题按钮原先按 `settings.theme === 'light'` 判断，主题为“跟随系统”时恒显 ☀，暗色系统首次进入即反向；改为按实际外观 `appearanceLight`（light 或 跟随系统且系统浅色）判断并监听 `prefers-color-scheme`，浅色显示 ☾、深色显示 ☀。首页删除“精选片库/最近保存/我的收藏/最近观看”，只保留推荐横幅与折叠的直链入口；底部导航图标换成统一 22×22 线性 SVG。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)；回归用例改用推荐区确认首页、用“查看作品详情”进入随包作品、封面断言移到片库列表。本轮按“只出效果图”口径不打包；客户端回归 4 通过 2 跳过 0 失败，浅色竖屏截图确认按钮显示为 ☾。

更新记录：2026-09-29，安卓专项 v0.42：按“放大后不要 ✕、音量做成跟画质一样的竖排、去掉放映室与各页解释文字、放大要铺满、《你的名字》还是看不了”处理。关闭 ✕ 仅在未放大时显示；音量改为竖排档位列表（静音/100/75/50/25，当前档高亮、无勾选），删除旧音量滑条面板与样式；删除“三叶动漫 · 放映室”与待播占位说明、首页/片库/搜索/设置页解释性文案，空状态收敛为一行；放大/全屏画面改成 `object-fit: cover` 铺满整屏、不再留黑边（宽屏轻微裁切），页面底色保持黑色。《你的名字》排查：真实来源探测确认两条线路的 m3u8 与首个分片均 200、`Content-Type: application/vnd.apple.mpegurl`、`access-control-allow-origin: *`，媒体与跨域均正常，同一次探测中来源站自身出现一次 `ConnectTimeout`；结论写入[安卓开发计划](./android-development-plan.md)，仍需设备端错误文案定位。同步[安卓需求草案](../product/android-requirements.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。本轮按“只出效果图”口径不打包；客户端回归 4 通过 2 跳过 0 失败。

更新记录：2026-09-28，安卓专项 v0.41：按“点画面出/隐控制条、自动隐藏也要有、关闭按钮删掉”收口并打包。恢复点画面切换控制条显隐与播放中 3.2 秒自动隐藏（暂停、出错、打开浮层、拖动进度条时保持可见），作废上一版“常显”判断；标题行「关闭」文字按钮删除，改为画面右上角 30px 的 ✕（随控制条显隐、`aria-label="关闭播放器"`），标题行只留作品名，返回键/返回手势退出优先级不变。覆盖安装版本 10／1.9；`aapt dump badging`、`apksigner verify`（v2 调试签名）已核对。桌面新包 `三叶动漫-安卓-2026-09-28-v33-控制条切换与关闭收敛版.apk`（12,402,093 字节，SHA-256 `806A86185BCDF3B32B89E20B7F33B34C2CD7AED23F680FFC520624018F65199C`），上一版 v32（`50D2D2BA…`）移入 `sanye_deploy/.local/android-retired/` 以便恢复（v31 已由用户自行移除）。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)；客户端回归 4 通过 2 跳过 0 失败，原生单测 20 项 0 失败 1 跳过，真机触控与第三方 CDN 仍待环境。

更新记录：2026-09-28，安卓专项 v0.40：按“首屏要有合理封面、删掉一开始播放器里的文字、点屏幕不要隐藏选择栏、左右滑不要改进度”改。首屏封面去掉 `blur(3px) brightness(.55)`，改为按原图比例 `contain` 居中、黑色垫底、`brightness(.92)`，首帧或播放结束即让出；删除选集说明行与“正在连接线路…”提示（含样式），作品标题与“关闭”保留；控制条改常显（`scheduleChromeHide` 不再计时隐藏、`togglePlayerChrome` 只收起浮层）；补断言锁定“画面横向滑动不改变进度”。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。本轮按用户口径只出效果图、不打包；客户端回归 4 通过 2 跳过 0 失败，首屏封面由 `first-load-poster.png` 复现（媒体挂起时显示《你的名字》封面且无任何文字）。

更新记录：2026-09-28，安卓专项 v0.39：修四处真机反馈。窄屏换行导致放大键跑到左边——改为整排不换行、时间可压缩并给放大键补 `margin-left:auto`（360×740 实测最后一项即“横屏放大”且右缘等于行右缘）；放大后出现白边——舞台改用 `inset:0` 精确铺满并用 `body:has(...)` 压黑页面底色（844×390 实测舞台与视口一致、body 背景 #000），画面仍按原比例留黑边不裁切；选集排序补稳定次序；《你的名字》搜到看不了——真实来源探测确认搜索命中的 `/v/65395/153` 无播放配置、选集只能靠链接扫描，而首条是占位页“立即播放 → /p/65395/153/0”，现自动起播跳过占位页并在解析失败时自动再试下一条。视频校验放宽：来源地址不再要求 `.m3u8/.mp4` 后缀、插件侧同样不因后缀丢弃、详情路径放宽为白名单站点下任意 `/p/`、`/v/`；保存直链校验、页面取数白名单与封面白名单保持不变。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。本轮按用户口径只出效果图、不打包；客户端回归 4 通过 2 跳过 0 失败，原生单测 20 项 0 失败 1 跳过。

更新记录：2026-09-28，安卓专项 v0.38：按“不用打勾，直接高亮，否则对不齐”去掉浮层勾选列——选项不再渲染勾号，当前项改为整行高亮（`rgba(234,242,196,.18)` 底＋浅绿文字），文字左边界统一，并删除无用的 `.android-player-list-item i` 与旧卡片高亮规则。覆盖安装版本 8／1.7；`aapt dump badging`、`apksigner verify`（v2 调试签名）、包内 CSS/JS 与 `dist-android` 摘要一致均已核对。已按用户要求打包：桌面新包 `三叶动漫-安卓-2026-09-28-v31-浮层对齐与高亮版.apk`（12,402,247 字节，SHA-256 `2CC489019E6C66048A7F0CB06D0BE79FFE2F361E49A8DE96795B6C4105D98C40`），上一版 v30（`CB2E96EB…`）移入 `sanye_deploy/.local/android-retired/` 以便恢复。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)；回归 4 通过 2 跳过 0 失败，原生单测 20 项 0 失败 1 跳过，真机触控与第三方 CDN 仍待环境。

更新记录：2026-09-28，安卓专项 v0.37：按“框的位置要和文字对齐、宽度也要对齐、不要上面的文字”收敛浮层。删除浮层内全部分组与说明文字（画质增强/片源清晰度/实时补帧/片源帧率/线路 1 及帧率提示长句），只保留选项与必要错误提示；右缘与触发按钮文字右缘对齐（点击时按 `getBoundingClientRect` 计算并写入 `margin-right`，配 `align-self: flex-end`），宽度 `max-content`、行高 24px，位置仍贴进度条上沿且不压按键，实测画质约 64×148、选集约 62×148；移除失效的 `playerFormat` 与 `androidPerformanceHint`。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。本轮按用户要求只出效果图、不打包；回归 4 通过 2 跳过 0 失败。注意多线路作品在浮层内不再显示线路分组标题，线路信息只体现在条目文案里。

更新记录：2026-09-28，安卓专项 v0.36：按“列表太大、没有贴到下面、不要完成直接贴着文字、就是贴着进度条、全屏按钮放最右、立即观看/搜索/封面太慢”复核并改动。浮层删除标题栏与“完成”按钮，改为控制条内流式布局、渲染在进度条正上方并右对齐到最右按键（宽度随文字、上限 196px、行高 24px、无阴影，实测约 151×148，不遮按键），关闭方式改为点画面；放大键保持最右且右侧内边距收到 6px。响应优化：原生 `preview` 解除对首集探测的阻塞（1s 预算）、新增 20s/24 条预览缓存、搜索双入口并发取先返回结果；前端进入观看页先显示命中标题/封面/简介占位与“正在读取选集与线路…”，封面补 `decoding="async"`。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。本轮按用户要求只出效果图、不打包；回归 4 通过 2 跳过 0 失败，原生单测 20 项 0 失败 1 跳过，实测数据与截图见安卓开发计划。

更新记录：2026-09-28，安卓专项 v0.35：按“下一集按钮放在左边、这个矩形还是太大”复核并收敛播放器。控制条新增「下一集」，只在有下一集时出现在左侧组（播放键与时间之后、弹性空隙之前），右侧保持音量/选集/画质/帧率/放大；选集、画质、帧率浮层由整宽抽屉改为贴在控制条上沿的自适应宽度矩形（上限 240px、行高 28px、内边距 5px 8px、6px 圆角、1px 边框、无阴影、最大高度 232px），横屏实测约 143×162 且不遮按键；同时修正回归用例稳定性（示例媒体主机保持挂起，避免真实请求失败触发自动换线导致状态漂移，复跑 3/3 通过）。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)。APK 版本 7／1.6、v2 调试签名、包内 CSS/JS 与 `dist-android` 摘要一致；桌面副本 `三叶动漫-安卓-2026-09-28-v30-简约浮层与下一集版.apk`（12,398,313 字节，SHA-256 `CB2E96EB55003E4D576746E12B95999901CC90C1DFA90BC40EE7C007D00EE61F`），上一版 v29 已移入 `sanye_deploy/.local/android-retired/`。真机触控、解码与第三方 CDN 仍待环境。

更新记录：2026-09-28，安卓专项 v0.34：按“检查整体和细节后继续优化、并优化接口响应速度、删旧包打新包到桌面”复核并收尾。修复播完后拖动进度条或重新起播时“本集播放结束”遮罩不消失的状态缺陷；把工具键命中区提到 36px、播放键 34px、进度条 38px，同时竖屏控制条由 90px 收到 76px（占 16:9 画面 0.386）；浮层补对话框语义与 `aria-haspopup`；移除无效的“进入作品后自动播放”开关；来源访问改为 gzip 传输、keep-alive 复用、并发探测三条首集候选、线程池 2→4，并在搜索成功后预热第一条来源详情；清理 34 行无引用样式并修正 `e2e/android-enhancement.test.cjs` 的旧类名。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)、[开发任务清单](./development-tasks.md)与[sanye_android/README](../sanye_android/README.md)；APK 版本 6／1.5、v2 调试签名、包内 CSS/JS 摘要与 `dist-android` 一致，桌面旧 v28 包已按哈希核对后移入 `sanye_deploy/.local/android-retired/`。来源 gzip、keep-alive、并发探测与预热仅有编译与代码核对，真机触控、解码与第三方 CDN 仍待环境。

更新记录：2026-09-28，安卓专项 v0.33：按“按钮不要太大、竖屏只保留放大按钮、风格简约、竖排列表取最简单形式、进度条还是无法拖动”复核安卓播放器。原实现用原生 `input[type=range]` 承载进度并在拖动中逐帧改写 `currentTime`，在 Android WebView 与 HLS 场景下既不可控又会把定位堆在拖动过程中；现改为指针事件驱动的自绘轨道（34px 命中区、`touch-action: none`、指针捕获、松手单次提交、指针中断回滚）。同时收敛竖屏控件（只留播放/进度/时间/放大）、去掉按键胶囊底板与描边、把选集与画质帧率浮层改成最简竖排列表，并让放大后的浮层贴在控制条上方。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)与[sanye_android/README](../sanye_android/README.md)；本轮按用户要求只出效果图、不打包，真机触控手感与第三方 CDN 仍待环境。

更新记录：2026-09-28，安卓专项 v0.32：按真机反馈复核“搜到《你的名字》仍看不了、进度条与音量不能拖、竖屏排版、画质/帧率不是竖排且选择不生效、进播放器黑屏不是封面”。修复为：进度条按完整时长或已缓冲范围启用并把触控高度提到 30px，音量改为按需展开的可拖滑条；竖屏播放器铺满卡片宽度、16:9、去掉强制最小高度且控制条单行；画质/帧率改为底部浮层竖排列表并显示勾选，清单解析后立即套用已选档位；首帧前保留封面，线路报错或 12 秒无画面时自动切换同作品候选线路并提示。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)；真机触控手感、系统栏与第三方 CDN 仍待环境。

更新记录：2026-09-28，安卓专项 v0.31：按“搜索能直接观看、播放器更简约（可参考 B 站）、优化观看体验”的要求复核安卓播放器；确认搜索《你的名字》“立即观看”可直接进入播放器并命中真实选集线路，控件改为画面内单行控制条＋点按唤出/播放中自动隐藏，选集/画质/帧率为画面内浮层，播放结束提供下一集/继续与重播，新增播放中屏幕常亮与横屏隐藏系统栏。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)；真机触控、系统栏与第三方 CDN 仍待环境。

更新记录：2026-09-28，安卓专项 v0.30：用户反馈安卓版搜到《你的名字》点开不能播、播放器排版有问题；复现为详情面板线路名与播放页 `temLineList` 编号不一致时线路匹配失败，以及播放器控件条纵向溢出遮挡标题与“关闭”按钮。修复为按来源编号/标题兜底解析并保存可续播线路，控件条收入画面内自动换行；3 项安卓门禁、真实来源浏览器播放推进、隔离桥接与含本轮样式的 v3／1.2 调试包已复核。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)；真机安装、媒体解码与第三方 CDN 仍待环境。

更新记录：2026-09-28，安卓专项 v0.29：基于现有白名单来源验证同一作品另一选集的真实浏览器播放推进，只增加显式备用来源切换，不改变选集界面、不臆测音轨或自动换片。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)和[任务清单](./development-tasks.md)。调试 APK 版本、签名、哈希与桌面新旧包回收证据已记入安卓开发计划；Android 真机及正式发行签名仍待环境。

更新记录：2026-09-28，安卓专项 v0.28：用户要求只内部核对语言，播放界面保持选集模式；撤销 v0.27 的电影版本标签、语言说明与语言优先排序，不把检查推断变成产品文案。同步[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)和[任务清单](./development-tasks.md)。

更新记录：2026-09-28，安卓专项 v0.27：核对《你的名字》在线来源版本标签和各播放页清单，纠正将“HD中字”推断为日语音轨的风险；观看页以版本区分配音与未知语言，首选不落入明确国语项，字幕版当前媒体失效记作待环境。更新[安卓需求草案](../product/android-requirements.md)、[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)，没有以标签代替音轨验证。

更新记录：2026-09-28，安卓专项 v0.26：按播放器无法放大、线路丢失与无法真实选择档位的反馈核对前端及设备端来源解析；修复全屏退路和原生方向请求、选集按线路与后段读取，改为统一的画面内播放/进度/时间/右下角选项控制条，并调整观看页信息顺序及亮暗主题切换。用户产品验收更新于[安卓需求草案](../product/android-requirements.md)，技术和验证边界记入[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)；浏览器样例没有可解码双档媒体，真实档位切换及真机媒体网络待环境。

更新记录：2026-09-28，安卓专项 v0.25：原横屏双列布局把画质和帧率占据视频右侧，选集位于全屏容器外；已改成右下角选集、帧率、画质弹出入口，普通观看页布局不变。同步[安卓开发计划](./android-development-plan.md)和[任务清单](./development-tasks.md)，浏览器隔离测试通过，真机及正式发行仍待环境。

更新记录：2026-09-28，安卓专项 v0.24：针对搜索结果不应先展示详情及观看页播放器置顶的需求，收敛三类搜索卡片为“立即观看”，观看页播放器、选集、详情顺序由浏览器隔离回归核对；无可播放集时保留错误和选择入口。按用户明确要求不生成 APK，不把源码验证当成设备版本。同步[安卓开发计划](./android-development-plan.md)及[任务清单](./development-tasks.md)。

更新记录：2026-09-28，安卓专项 v0.23：原视频元素单独全屏会丢失画质/帧率控件，且播放器选集按钮偏大；改为容器全屏保留档位控件、横屏双列布局及紧凑选集，浏览器截图与档位交互验证；设备方向锁定待环境。同步[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)。

更新记录：2026-09-28，安卓专项 v0.22：安卓显示名称与内部项目标识分离，将启动器、活动标题、网页标题、页头与主动诊断的用户可见名称改为“三叶动漫”；保留原应用标识及数据身份，避免改名导致覆盖安装丢失本地片库。同步[安卓开发计划](./android-development-plan.md)和[任务清单](./development-tasks.md)，真机缓存显示待验收。

更新记录：2026-09-28，安卓专项 v0.21：真实 HTML 样例暴露详情海报 `.video_img` 未解析、图片主机未列入精确白名单；选集兜底泛化同作品链接，且列表不按线路与集序展示。已同步[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)，增加来源样例、UI 分组与预读回归；第三方图片/CDN 与真机切换速度仍待设备验收。

更新记录：2026-09-24，安卓专项 v0.20：反馈第三方品牌展示、画质/帧率不可切和版本切换慢；核对发现展示文字来自来源元数据，现仅处理展示、不删来源地址；真实 HLS 清单提供档位选择，进度保存脱离切集关键路径、选集页解析限时复用。隔离页面回归与前端构建证据见[安卓开发计划](./android-development-plan.md)；真实多档与真机速度保持待环境。

更新记录：2026-09-24，安卓专项 v0.19：原安卓 UI 顶部六按钮与长表单仍像调试界面，与用户要求的 PC 客户端视觉不符；改为夜空风格的海报首页、横向片库、底部导航及一致的搜索/详情布局，检查 360/390 宽度、深浅主题与无横向溢出。同步[安卓开发计划](./android-development-plan.md)和[任务清单](./development-tasks.md)，但不把视觉验收推导为完整 PC 前后端。

更新记录：2026-09-24，安卓专项 v0.18：核对详情截图发现失败封面仍占据高度，且 PC 随包作品保存后因不持久化本地资源 URL 而失去卡片封面；改为图片失败隐藏与随包稳定 URL 精确回退，仅作用展示不写入假来源，回归和状态记入[安卓开发计划](./android-development-plan.md)及[任务清单](./development-tasks.md)。

更新记录：2026-09-24，安卓专项 v0.17：真实来源浏览器 HLS 播放和模拟原生桥接的安卓首页→详情→选集→播放测试均观察到视频时间推进（2/2）；详情封面只回退同来源搜索或已保存元数据。测试未请求真实 Android 插件或安卓设备，故只将其记为浏览器证据，同步[安卓开发计划](./android-development-plan.md)及[任务清单](./development-tasks.md)。

更新记录：2026-09-24，安卓专项 v0.16：安卓播放器覆盖层增加来源选集/线路切换，失败时错误在覆盖层可见；浏览器桥接验证切换地址，但不将媒体 URL 赋值等同于设备完成播放。同步[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)。

更新记录：2026-09-24，安卓专项 v0.15：真实动态搜索封面使用 PC 来源以外图片主机，旧保存校验导致用户不能保存有封面的结果；针对 PC 已见主机拆分封面白名单，页面网络白名单不变。单事务收藏扩充安卓桥接契约，并同步[开发计划](./android-development-plan.md)、[接口契约](./api-contract.md)和[任务清单](./development-tasks.md)；设备结果未覆盖。

更新记录：2026-09-24，安卓专项 v0.14：独立详情页替换搜索内嵌来源预览，保存后收藏的即时反馈和异步 HLS 切集竞争纳入网页回归；同步[安卓开发计划](./android-development-plan.md)与[任务清单](./development-tasks.md)。未将桥接测试当作真机播放、完整 PC 界面或正式发行证据。

更新记录：2026-09-24，安卓专项 v0.13：对照 PC 动态搜索返回的详情/播放双路径，修正安卓详情地址白名单及同名结果优先级；对照 PC 随包来源详情实际无包装选集页加入受控兜底，并回归真实 HTML 快照。首页视觉接近 PC，但独立页面、真机播放、系统拦截和 PC 全量功能仍未验收；事实与证据同步[安卓开发计划](./android-development-plan.md)及[任务清单](./development-tasks.md)。

更新记录：2026-09-24，安卓专项 v0.11：核对 PC `main.cjs`、`runtime.cjs`、客户端路由和安卓 `android.ts` 后，纠正基础 APK 等同完整 PC 前后端的误判；产品需求、安卓开发计划的功能对齐矩阵、SQLite v3 数据设计、来源桥接契约与任务状态已同步。来源封面及简介只关联实际来源与用户保存，真实设备升级和完整 PC 功能未验收。

实现补记：2026-09-24，追查 PC 随包 `seed.sql` 中作品来源与封面，对照安卓首屏和受限白名单发现原安卓没有导入 PC 已发布目录，也没有支持其 `yinghuadongman.org.cn` 详情域名；使用受控脚本生成只读快照并标明数据时间，保留真实个人空库。隔离构建与来源解析样例不作为真机播放结论。

更新记录：2026-09-24，安卓专项 v0.12：以 PC 已发布目录和 `WeeklyScheduleService` 更新文案解析约定为依据，增加安卓本地/随包搜索与不推断集数的快照排期；开发计划和任务清单标注非实时、失败出口及后续功能，不把样例当正式可用性。

更新记录：2026-09-24，安卓专项 v0.10：发现原生 APK 的默认启动图标未复用 PC 版软件封面；核对 PC 原图并生成安卓传统、自适应启动图标和启动页，回填安卓开发计划及原生工程的再生成说明，设备图标缓存与实际安装显示仍待真机验证。

更新记录：2026-09-24，安卓专项 v0.6：根据仓库已有 PC 来源地址和解析规则实现安卓只读搜索/当前页预览子集，同步安卓开发计划、任务状态与设备桥接契约。固定样例通过不等于在线来源可用，未将完整选集/多线路或真机播放记为完成。

更新记录：2026-09-24，安卓专项 v0.5：按用户完整目标范围修订安卓产品草案与工程实现状态；SQLite v2 历史/设置同步数据库设计及接口契约，代码已补有限直链播放和本地页面、返回键及诊断。网页模拟桥接仅是前端证据，来源解析与真机兼容保持待环境，不能据此写成全部功能完成。

更新记录：2026-09-24，安卓专项 v0.4：安卓独立入口和设备端 SQLite 片库首段同步至开发计划、任务清单、数据库设计和接口契约；代码构建与地址验证单测通过，真机持久化和系统拦截待环境。文档仍按尚未完整实现的草案管理。

更新记录：2026-09-24，安卓专项 v0.3：核对 `product/android-requirements.md` 的 PC 版参考与手机独立边界，`docs/android-development-plan.md` 的前端构建和原生工程状态。原生容器位于 `sanye_android/`；本机 `assembleDebug lint testDebugUnitTest` 成功，APK 摘要与 SDK 信息见开发计划；`pnpm docs:check` 为文档链接门禁。外部来源与系统安装拦截尚无真机证据，不推导完成。现有安卓草案继续保持草案状态。

更新记录：2026-09-24，进度小人形态同步桌宠产品需求、README 与测试报告；仅公开数值可跟随，真实程序对齐待验收。

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v6.33 |
| 文档状态 | 基线 |
| 关联文档 | [开发任务清单](./development-tasks.md)、[开发待办事项](./development-todo.md) |
| 更新时间 | 2026-10-26 |
| 评审范围 | 仓库全部 Markdown 文档（根文档、`product/`、`docs/`、`AiCoding/`）与交互原型 |
更新记录：2026-10-12，v6.18，登记安卓专项 v1.23 的连续观看与性能优化；保留历史收据，当前构建/隔离桥接与真机/正式发行分别描述。
更新记录：2026-09-28，v6.17，评审安卓搜索卡片去详情与统一立即观看入口、播放器置顶及不打包的用户授权边界；浏览器源检查与设备加载状态分开记录。同步[安卓开发计划](./android-development-plan.md)与[开发任务清单](./development-tasks.md)。
更新记录：2026-09-28，v6.16，评审安卓横屏全屏中的视频及画质/帧率一体化区域和小尺寸选集控件；保留真机方向锁定与触控验收缺口。同步[安卓开发计划](./android-development-plan.md)与[开发任务清单](./development-tasks.md)。
更新记录：2026-09-28，v6.15，评审安卓显示名称“三叶动漫”与原生应用标识边界，保留真机显示和覆盖安装待验收状态；同步[安卓开发计划](./android-development-plan.md)与[开发任务清单](./development-tasks.md)。
更新记录：2026-09-28，v6.14，评审安卓专项 v0.21 的真实海报解析、线路分组、来源回退及预读边界，保持第三方资源和真机时延待环境状态；同步[安卓开发计划](./android-development-plan.md)与[开发任务清单](./development-tasks.md)。
更新记录：2026-09-24，v6.13，评审安卓专项 v0.20 的第三方品牌展示、真实清单档位与切换关键路径，维持真机和发行待环境边界；同步[安卓开发计划](./android-development-plan.md)与[开发任务清单](./development-tasks.md)。
更新记录：2026-09-22，v6.12，按用户「你修改后画面波动非常大」修正 VQ-42 引入的画面波动回归（VQ-45），并同步[播放器设计](./media-player-development.md) v1.32、[进阶计划](./player-quality-development-plan.md) v1.17、[开发任务清单](./development-tasks.md) v2.49 与[测试报告](./media-player-test-report.md) v1.31：不匹配格点改为输出全局平移 + 0.5 置信度（不再以 0 置信度触发渲染着色器的硬切换兜底）、歧义判据由"次优解代价差"改为局部对比度、平移先验步长 2→1 并加有界采样、分析尺寸变化时重置运动历史；**默认后端回退为 CPU**，WebGPU 显式启用。证据为 `e2e/webgpu-motion.test.cjs` 新增平坦区域可用性判据后通过（0→1.0）、默认 CPU 路径 17/17 与 2/2 通过、typecheck 与 docs:check 通过；GPU 路径的真实片源观感仍待环境，这是它保持非默认的原因。
更新记录：2026-09-22，v6.11，按用户「这个免安装包里没有的东西删掉」清理交付包内已无调用方的内容，并同步[本地桌面运行与打包](./local-desktop.md) v1.56、[第三方许可说明](./third-party-notices.md) v1.6、[播放器设计](./media-player-development.md) v1.31、[进阶计划](./player-quality-development-plan.md) v1.16、[开发任务清单](./development-tasks.md) v2.48 与[追溯矩阵](./traceability-matrix.md) v1.11：删除随包 RIFE 运行时（约 17MB）、主进程 `neuralInterpolation.cjs`/`interpAssets.cjs`/`prepareInterp.cjs`、渲染端 `neuralInterpolation.ts`/`frameInterpolationDialog.vue`、`verify-interpolation.cjs` 与 preload IPC 桥；`prepare.mjs` 显式清除历史 `runtime/interp` 残留并新增 `DESK-EXE-14`，`DESK-EXE-12`/`13` 废止；第三方许可的 RIFE/ncnn 条目标记为已移除。证据为 `pnpm test:desktop` 68/68、`pnpm typecheck`、客户端 `build:desktop`、`verify-packaged-runtime.cjs` 无窗口验收与 `pnpm docs:check` 通过；包体 926.5→909.5MB（ZIP 540.8→504MB）。
更新记录：2026-09-22，v6.10，按用户「换一个为实时设计的轻量模型，用这个进行实现吧」实施 P13（VQ-42～VQ-44）WebGPU 常驻运动估计，并同步[播放器设计](./media-player-development.md) v1.30、[进阶计划](./player-quality-development-plan.md) v1.15、[开发任务清单](./development-tasks.md) v2.47 与[测试报告](./media-player-test-report.md) v1.30：新增 `webgpuMotionEstimator.ts`（灰度、降采样、平移先验、金字塔搜索、往返一致性收尾五份 WGSL）与 `webgpu.d.ts`；`motionFlow.worker.ts` 非阻塞探测、GPU 优先、失败回退，拒绝软件适配器并显式暴露着色器编译失败。证据为新增 `e2e/webgpu-motion.test.cjs` 在真实 Electron（隐藏窗口）通过，以及 11 个受影响门禁逐个通过、typecheck／build:desktop／docs:check 通过。**边界：本轮落地的是无需预训练权重的实时算法管线，不是神经网络**；GPU 路径无法在无头 Chromium 验证（缺 `dxcompiler.dll`），真实片源观感、跨显卡、整片与桌面安装物保持待环境。
更新记录：2026-09-22，v6.09，按用户「已经是正常了但是我还要更加丝滑，进行上面方案的完善，无窗口验证」实施 P12（VQ-41）源帧等待位，并同步[功能规格](../product/feature-specification.md) v0.25、[播放器设计](./media-player-development.md) v1.29、[进阶计划](./player-quality-development-plan.md) v1.14、[开发任务清单](./development-tasks.md) v2.46 与[测试报告](./media-player-test-report.md) v1.29：渲染 Worker 不再在运动分析期间丢弃新到的源帧，改为最多暂存一帧并顺序补齐，只有等待位已占用才丢帧，新增 `deferredSourceFrames` 与暂存/丢帧分开计数，`reset` 关闭等待位位图。证据为新增 `e2e/interpolation-frame-queue.test.cjs`（3/3）与 15 个受影响无窗口门禁全部通过、客户端 typecheck 与 build:desktop 通过；真实弱网、跨显卡、整片长时观看与桌面安装物保持待环境。
更新记录：2026-09-22，v6.08，按用户「为什么还有导出的按钮，把帧率做好就行了」下线离线导出入口，并同步[功能规格](../product/feature-specification.md) v0.24、[播放器设计](./media-player-development.md) v1.28、[进阶计划](./player-quality-development-plan.md) v1.13、[开发任务清单](./development-tasks.md) v2.45 与随包使用说明：`animeDetailView.vue` 移除控制栏「导出」控件与 `frameInterpolationDialog.vue` 挂载，`styles.css` 移除 `.art-control-preprocess` 规则，P7（VQ-33～VQ-36）任务行标记为已下线。证据为 `pnpm typecheck`、`pnpm --filter @sanye/sanye_client build:desktop` 通过且桌面产物不再包含该窗口的 chunk 与 CSS；随包 RIFE 运行时去留、桌面包重建与接收方电脑验收分别为待确认与待环境。
更新记录：2026-09-22，v6.07，按用户「进度条拖动响应速度还是太慢了」执行 P11（VQ-40），并同步[功能规格](../product/feature-specification.md) v0.23、[播放器设计](./media-player-development.md) v1.27、[测试报告](./media-player-test-report.md) v1.28、[进阶计划](./player-quality-development-plan.md) v1.12、[任务清单](./development-tasks.md) v2.44 与[决策记录](./decision-log.md) v0.20（D-033）。改动内容：`seekControl.ts` 放弃「拖动只预览、松手提交一次定位」，改为拖动期间按节流把媒体元素推进到指针位置——命中缓冲最小间隔 90ms、未命中 220ms，一次只允许一个定位在途（`video.seeking` 为真时跳过），间隔再按上一段定位实测耗时乘 1.2 放宽，目标与当前位置差值 ≤0.2 秒时不重复定位；预览定位直接写 `video.currentTime`，不经过 Artplayer 定位提示，直播或时长未知时不启用。松手时位置已在松手点 0.2 秒容差内（含正在进行的预览定位，因为 `currentTime` 立即返回定位目标）就直接恢复播放状态，否则只补一次 `player.seek`；指针中断或窗口失焦仍取消并还原按下位置与播放状态。判据改写：`e2e/seek-performance.test.cjs` 不再要求拖动期间定位为 0，改为「至少一次预览定位 + 每次拖动最多一次补齐定位 + 落点准确 + 缓存命中不重启 HLS 加载、不重复请求分片」；`e2e/progress-seek-latency.test.cjs` 新增预览定位次数与「松开后落到松手点」判据（门禁 ≤400ms，靠播放漂移到达不计入）。证据：`seek-performance` 5 项、`seek-directions` 3 项、`progress-seek-latency`（四配置）通过——四类配置松开后落点 13.2–56.3ms、补帧层恢复 160.8–243.9ms、拖动期间预览定位 2–4 次；本地 1080p MP4 同一次拖动由原生 31 次定位变为 5 次预览 + 1 次补齐并保持暂停（触屏 10 次预览 + 0 次补齐）；缓存命中的 HLS 拖动 `startLoad` 增加 0 次、分片请求 6→6、松手到解除等待 97.9ms；客户端 typecheck 与 build 通过。评审同时记录边界：拖动期主线程帧间隔高于稳定播放（受控窗口 P95 25.5–42ms），「仅增强」配置定位后的补间层恢复波动大（本次 269–836ms，关闭预览定位对照 487–2268ms）且不参与补间恢复门禁，未命中缓冲的拖动不再保证「一次拖动一次请求」。真实弱网、跨显卡、整片长时观看与桌面安装物保持 `待环境`。
更新记录：2026-09-22，v6.06，按用户「播放过程中会出现短暂卡断，不要出现短暂卡断」执行 P10（VQ-39），并同步[功能规格](../product/feature-specification.md) v0.22、[播放器设计](./media-player-development.md) v1.26、[进阶计划](./player-quality-development-plan.md) v1.11、[任务清单](./development-tasks.md) v2.43 与[决策记录](./decision-log.md) v0.19（D-032）。改动内容：把「连续两次以上未前进的提交」定为卡断判据（`contentFreezeRuns` / `contentFreezeMaxFrames` / `contentFreezeFrames`），并把画面推进量限定为补间层已接管呈现的提交；定位根因是插值延迟低于实测需要（每源帧流水线约 5ms 采集 + 14–20ms 运动分析 + 19ms 往返，24 FPS 源每帧预算 41.67ms；稳定需要延迟 P90 约 108ms 而段起点下限只有 83ms、实测起播 66.7ms），延迟不足使目标越过最新源帧、画面重复最后一帧并被迫加宽，而加宽发生在接管之后即一次可见冻结（首窗实测最长冻结 10 个输出帧约 83ms）；处置为新增 `InterpolationDelayPolicy.beginEpochAt()`，播放段起点按给定延迟定档——首次播放段采用会话上限、后续播放段采用上一段实测需要（P90），定档只发生在画布尚未接管的段边界，不违反 VQ-32「播放期不收缩」。证据：新增 `e2e/interpolation-continuity.test.cjs`（2 项，自生成 1080p/24 FPS 素材）稳定 9 窗口与含 3 次跳转的 9 窗口四项计数全为 0、内容推进 P95 8.77–8.81ms；真实片源 Sintel 1080p 复测同口径全 0（修复前最长冻结约 67ms）；`interpolation-delay-adaptive` 起播断言按新口径更新（会话上限以内 + 首段窗口不显著长于固定对照 + 新增卡断/倒退断言），定位收益断言不变且实测 198.5ms 对固定 268.6ms；其余回归（interpolation-buffer-layer、quality-fluctuation、realtime-interpolation、interpolation-bypass、playback-pipeline、enhancement-thread-migration、enhancement-recovery、worker-generations、presentation-scheduling、p1-playback-lifecycle、progress-seek-latency、seek-performance、playback-experience、frame-cadence-policy、flow-analysis-policy、motion-naturalness、frame-menu-state）逐个文件独立进程执行通过，客户端 typecheck 与 build 通过。评审同时记录取舍：放弃 VQ-29 的「首个播放段延迟低于 150ms」，首段原画窗口与固定对照持平（366.9ms 对 356.8ms），换取全程无卡断；`enhancement-thread-migration` 与 `interpolation-buffer-layer` 连续运行时会因抢占失败一次。真实弱网、跨显卡与整片长时观看保持 `待环境`。
更新记录：2026-09-22，v6.05，按用户「画面波动情况依旧存在，进行完善」执行 P9（VQ-38），并同步[功能规格](../product/feature-specification.md) v0.21、[播放器设计](./media-player-development.md) v1.25、[进阶计划](./player-quality-development-plan.md) v1.10、[任务清单](./development-tasks.md) v2.42 与[决策记录](./decision-log.md) v0.18（D-031）。改动内容：先补「画面推进量」口径——`interpolationRenderer.worker.ts` 记录相邻两次提交的内容时间步长并派生 `contentHolds` / `contentJumps` / `contentBacksteps`，`realtimeInterpolation.ts` 暴露字段，此前只有 `outputFps` 与 `frameIntervalP95Ms`，回答不了用户看到的「画面有没有跳」；据此修复三处根因：`suspendEvents` 去掉 `waiting`（缓冲不再立刻拆掉补间层，改由渲染 Worker 的 800ms 停滞阈值收层）并在 `animeDetailView.vue` 让原视频露出只在补间层未接管时生效；分辨率变化不再走 `reset(true, true)`，只跟随尺寸、保留帧队列与生效延迟（首次确定尺寸仍按播放段起点重建）；播放期加宽延迟把加宽量转成目标时刻的临时前移量并线性消化，目标短暂停住而不后退。证据：新增 `e2e/interpolation-buffer-layer.test.cjs`（2 项）——缓冲事件 6/6 保持补间层、0 次露出原视频、0 次层切换，真实跳转仍立即收层再恢复；720p→360p 真实换档零层切换；真实片源（Sintel 1080p、24 FPS、120 目标）8 窗口 `contentBacksteps=0`、`contentHolds=0`、`contentJumps=0`，修复前同口径出现 1 次 `-31.67ms` 倒退与 1 次内容重复。回归逐个文件独立进程执行全部通过（quality-fluctuation、interpolation-stability、interpolation-delay-adaptive 5 项、enhancement-thread-migration 5 项、enhancement-recovery 5 项、worker-generations 6 项、presentation-scheduling 5 项、p1-playback-lifecycle、playback-pipeline 6 项、progress-seek-latency、seek-performance、interpolation-bypass 9 项、realtime-interpolation 4 项、playback-experience 2 项），客户端 typecheck 通过。评审同时确认两处非回归：`playback-experience` 需 `127.0.0.1:5188` 服务（Vite 默认绑 IPv6 localhost，需 `--host 127.0.0.1`），`interpolation-delay-adaptive` 与 `quality-fluctuation` 并发运行会因抢占失败一次。跨显卡、整片长时观看与真实弱网保持 `待环境`。
更新记录：2026-09-21，v6.04，按用户「我所有的帧率要求都是实时的，还有插帧，进行改善」执行 P8（VQ-37），并同步[功能规格](../product/feature-specification.md) v0.20、[播放器设计](./media-player-development.md) v1.24、[进阶计划](./player-quality-development-plan.md) v1.9、[任务清单](./development-tasks.md) v2.41。改动内容：`flowAnalysisPolicy.ts` 的升档样本数由固定 120 改为按余量分级（12～120，按「投影利用率 / 升档线」的立方插值），投影由只用平滑值改为取当前样本与平滑值的较大者（与降档判据口径一致，避免平滑滞后导致升到昂贵档位再被降回）；`motionRenderer.ts` 的合成定点迭代由 2 次改为 3 次；离线 RIFE 入口由「补帧」改名为「导出」、窗口标题改为「生成 NNNfps 视频」，并在窗口内说明实时与离线的区别，两份发行说明同步。证据：按档位成本模型测得 1080p 到达 256 由 244 帧缩短到 47 帧、720p 缩短到 28 帧、终档不变；`realtime-interpolation` 4 项通过（1080p → 120 目标输出 119/120/122 FPS、帧间隔 P95 8.33 ms、长帧 0）；`frame-cadence-policy`、新增 `flow-analysis-policy`（3 项）与 `motion-naturalness` 共 12 项通过；`playback-pipeline` 6 项与 `interpolation-bypass` 9 项通过；客户端 typecheck 通过。评审中同时记录两项重要事实：本机 1080p/30 在 128 最粗档已占约 45% 帧预算，因此分析宽度不再升档（实测边界，非缺陷）；把 LK 迭代上限降到 10 的候选在隔离夹具上有收益但在生产链路上无收益且丢帧更多，已否决并保持原参数。`frame-cadence-policy.test.cjs` 中依赖「耗时恒定」假设的阶梯用例按真实成本模型改写，保留了原有意图（无升降抖动、冷却与重试上限、reset 语义）。按既有约定，客户端 typecheck 结果与浏览器门禁分别记录，真实整片观感、跨显卡与更强设备的升档行为保持 `待环境`。
更新记录：2026-09-21，v6.03，按用户「一开始的本地服务还有问题吗，要确保发给别人也没问题，不要进行弹窗验证」的要求，对已交付包 `20260921-180637-087` 做无窗口验收并同步[本地桌面运行与打包](./local-desktop.md) v1.55：新增 `sanye_desktop/verify-credential-recovery.cjs`（用包内 `app.asar` 的 `runtime.cjs` 复现并验证“数据库凭据失配修复”和“强杀残留 `postmaster.pid` 接管”，不创建窗口）与强制要求 `DESK-EXE-13`（神经补帧必须可选：`resources/runtime/interp/` 缺失或被隔离时本地服务照常启动）；把 `verify-packaged-runtime.cjs` 与新增入口写明为无窗口入口，并说明在“不进行弹窗验证”的要求下可跳过 `verify-first-run.cjs` 与 `verify-failure-diagnostics.cjs` 的弹窗/截图证据。本轮证据全部来自桌面交付 zip 的解压副本（中文路径）：3266/3266 条目大小一致、依赖闭包通过（含 `RIFE v4.6` 摘要一致）、包内运行时验收通过（首选端口 28710、顺延 28712、三个服务、目录 6 条、重启复用）、凭据失配与强杀残留均自愈、整树删除 `interp/` 仍通过、随包 `rife-ncnn-vulkan.exe` 在中文 cwd/模型/输出路径下目录模式退出码 0；`pnpm test:desktop` 83 项通过。签名边界记录为 `NotSigned` 且本机 Smart App Control 处于执行状态仍可启动官方 Electron 二进制，强制策略且无信誉的接收方环境保持 `待环境`。
更新记录：2026-09-21，v6.02，按用户「接入神经补帧模型，并做合适调整，保证我发送给别人就能用」的要求，把 P3 评估过的 RIFE v4.6/ncnn Vulkan 从本机实验推进为随桌面包分发的预处理引擎，并同步[功能规格](../product/feature-specification.md) v0.19、[播放器设计](./media-player-development.md) v1.23、[进阶计划](./player-quality-development-plan.md) v1.8、[任务清单](./development-tasks.md) v2.40、[决策记录](./decision-log.md) v0.17、[本地桌面运行与打包](./local-desktop.md) v1.54 与[第三方许可说明](./third-party-notices.md) v1.5。改动内容：新增 `sanye_desktop/interpAssets.cjs`、`neuralInterpolation.cjs`、`preload.cjs`、`prepareInterp.cjs`、`neuralInterpolation.test.cjs` 与客户端 `src/video/interpolationSource.ts`、`src/video/neuralInterpolation.ts`，把 `interpolation.ts` 的源准备抽为共享模块（`InterpolationJob.convert` 与 `interpolationAssets` 签名不变），补帧窗口新增引擎/目标帧率选择与本次引擎显示，播放器控制栏恢复「补帧」入口（原入口在早前改动中丢失，`.art-control-interpolation` 现在是实时帧率档位菜单），`main.cjs` 挂载 preload 与 IPC 并在退出时先结束推理进程，`verify-runtime-closure.cjs` 增加随包摘要校验与显卡驱动库分类，`sanye_desktop/package.json` 增加新文件与测试项。产品可见变化按[文档变更规则](./document-change-rules.md)先改唯一事实源再同步下游。按用户要求本轮不做功能验收，所有功能结论统一标记为「代码已实施，待验证」，`vulkan-1.dll` 的驱动依赖、真实显卡包内运行与接收方电脑验收均为 `待环境`；已执行的最小检查为 `node sanye_desktop/prepareInterp.cjs`、`node --test sanye_desktop/neuralInterpolation.test.cjs`（12 项通过）、`pnpm --dir sanye_client typecheck` 与 `pnpm docs:check`（1361 项通过，含本次为生成的 `sanye_desktop/runtime` 目录增加链接检查豁免）。
更新记录：2026-09-21，v6.00，按用户「画面波动很大、降低复杂设计、以帧率为主、画质为辅、稳定与丝滑」的要求执行[画质与帧率进阶优化开发计划](./player-quality-development-plan.md) P6 的 VQ-32 稳定优先简化，并同步[播放器设计](./media-player-development.md) v1.22、[测试计划](./media-player-test-plan.md) v1.19、[测试报告](./media-player-test-report.md) v1.27、[任务清单](./development-tasks.md) v2.39 与[文档地图](./README.md) v2.32。改动把播放期内三项会改变画面的自适应收敛为单向：`FrameCadence` 删除稳定回升分支（自动档在未降档时对齐刷新能力、降档后保持到下一个播放段，`reset(restore = false)` 让画质降档等内部重建保留已稳定档位，避免「降画质→帧率回档→再超载」），`EnhancementBudgetPolicy` 删除恢复动作、冷却、失败退避与可恢复上限（只输出 `hold` / `downgrade`，渲染 Worker 同步删除 `upgradeEnhancement`、档位阶梯与 `recoveryCeiling`），`InterpolationDelayPolicy` 删除播放期收缩与相关选项（保留未接管呈现前的加宽与停顿时的余量恢复），`AdaptationNotice` 与 `interpolationDelay` / `enhancementBudget` / `qualityChange` 字段同步精简。受影响门禁已按新口径更新并通过：`frame-cadence-policy` 8 项、`enhancement-recovery` 5 项、`interpolation-delay-adaptive` 5 项、`quality-fluctuation` / `presentation-scheduling` / `frame-menu-state` / `adaptation-notice` / `playback-pipeline` 15 项、`high-refresh-presentation` 2 项、`realtime-interpolation` 4 项、`player-quality` 4 项、`quality-observability` 4 项与 `startup-quality-timeline` 3 项，客户端 typecheck 与 build 通过；判据与边界（真实整片观感、跨显卡、物理高刷与桌面安装物待环境）见测试报告。过程中发现并修正了一处口径回归：单纯“只降不升”会让自动档在高刷屏上停在 120，因此自动档改为在未降档时跟随刷新能力，显式档位仍保留请求值。

更新记录：2026-09-21，v6.01，登记[本地桌面运行与打包](./local-desktop.md) v1.53 对“接收方非英文路径下 Java 服务启动失败”的定位与修复：接收方截图给出 `favorite 服务启动失败（退出码 1）` 与 `Error: Unable to access jarfile D:\????\...\favorite.jar`，路径中的 `?` 说明代码页已经把字符替换掉。用可复现实验在构建机上确认机制——Windows JDK 启动器按当前 ANSI 代码页接收窄字符命令行，`sun.jnu.encoding` 默认同为该代码页，代码页无法表示的包路径字符变成 `?`，`-jar` 指向不存在的文件；把运行库放到含 `U+20000` 的路径下即稳定复现 `Unable to access jarfile ...\??\jars\favorite.jar`，只换 `java` 目录则先报 `could not find java.dll`。修复为把 `java/` 与 `jars/` 像 PostgreSQL 一样镜像到纯英文目录（`preparePostgresLayout()` 更名 `prepareRuntimeLayout()`，镜像摘要取自 `java/bin/java.exe` 与包内 `manifest.json`，重新构建后重新镜像并清理上一版镜像），`runtime.cjs` 新增 `prepareLayout()` 后只把 `<镜像>\java\bin\java.exe` 与 `<镜像>\jars\<服务>.jar` 交给 JVM，启动失败记录与 `runtime-layout.json` 记入 `layout`/`java`/`jars`；新增强制要求 `DESK-EXE-11`（随包原生启动器只接收纯英文路径）。证据：`pnpm test:desktop` 68 项通过；`verify-ascii-runtime` 报告 `sanye_deploy/.local/ascii-runtime-nIR3XP/report.json` 为 `passed`（同一轮先复现包内 Java 失败，再验证镜像后的 Java 与 JAR 能加载 JVM 并执行到应用代码，并覆盖真实 PostgreSQL 启动与停止）；把运行库硬链接到含 `U+20000` 的路径后执行 `verify-live`，报告 `sanye_deploy/.local/desktop/e95439b0-7328-4f8c-b79d-958bf78000d0/report.json` 为 `passed`（新数据库、三个服务、目录与搜索接口、真实浏览器、端口冲突、停止与重启保留收藏历史）。同轮修正了 `listen()` 只接受端口的单值调用与 `verify-live.cjs` 的端口冲突断言。接收方电脑、干净 Windows、免安装包重建与 `verify-first-run` 保持 `待环境`。

更新记录：2026-09-21，v5.99，按“根因先检查并分析”的要求完成[本地桌面运行与打包](./local-desktop.md)的根因排查与修复（v1.52）：先确认截图文案对应“子进程退出”分支而非超时，并用实验逐条排除“借用开发机中间件”（本机 15432/16379/5672/9200 均未监听）、“非英文路径”、“VC++ 运行库”、“28710 端口冲突”和“慢机器超时”；随后证实三类真实机制——`pg_isready` 不认证导致本地数据库凭据不一致时仍判为就绪、三个 Java 服务各自以 `password authentication failed for user "sanye"` 退出并按并发顺序报出某个服务名（解释了弹窗 anime 与标题 favorite 不一致）、jar 损坏/解压不完整、强杀后 `postmaster.pid` 残留报 `pre-existing shared memory block is still in use`。修复为复用既有集群前校对角色口令（缺角色则创建）、认证探活替代 `pg_isready` 单一判据、接管异常退出残留的数据库、按 `artifact-manifest.json` 与 jar 结构做启动前完整性预检，并让发布脚本在回收站拒绝大型目录时改为可恢复移出桌面；同步 `DESK-EXE-9`、`DESK-EXE-10` 与根 `AGENTS.md` 两条强制要求，新增 `sanye_desktop/verify-local-database-recovery.cjs`。交付包 `20260921-153519-657`（ZIP SHA-256 `4038FC69CDBF381B098F4678B110F8D8D72C70EAE3E869EFA63427B0AA36AF06`，EXE 与官方 Electron 逐字节一致）经验证：根因恢复 `database-recovery-ZPSEXu`、首次启动 `first-run-7Zn3ZC`、包内运行时 `packaged-runtime-DIJxXp`、失败诊断 `failure-diagnostics-zMzOln` 全部通过，`pnpm test:desktop` 66 项通过；接收方电脑的原始原因仍需其日志确认，外部电脑与可信签名保持 `待环境`。

更新记录：2026-09-21，v5.98，按接收方截图中的“本地服务运行失败 / anime failed to start; see logs”处理[本地桌面运行与打包](./local-desktop.md)：先核对截图对应的是修复前构建（旧包 `20260921-114601-006` 内无 `startup-error.log`、无“打开日志目录”、无端口顺延，与新包不一致），再补齐该分支本身——`runtime.cjs` 的服务启动失败与启动后意外停止都改为给出具体原因（进程无法启动/被强制结束/已退出及退出码）并附服务日志尾部，失败弹窗与错误框标题固定为“三叶动漫”；新增 `DESK-EXE-7`（失败路径必须自证）与 `DESK-EXE-8`（验收脚本不得修改交付物），新增 `sanye_desktop/verify-failure-diagnostics.cjs` 用硬链接镜像真实复现“anime 服务启动失败”并要求应用保持打开、写出日志、记录失败服务与退出码。过程中该脚本首版直接用硬链接写入，把交付包解压目录的 `anime.jar` 截断为 9 字节，被首次启动验收拦下；随后改为先断开链接写真实副本并加源包哈希自校验，重建交付包 `20260921-150447-859`（ZIP SHA-256 `C363958C5124278CB5FD365D83DA3BACF0E1F0822D235766C63C9E50CBFE3CBC`，EXE SHA-256 `1DC2D12E5C60341782E68C4B65A8E49CBD86217F81568F90575547CEC13B5610` 与官方 Electron 一致），首次启动（`first-run-xd8nBP`）、包内运行时（`packaged-runtime-gRfowO`）与失败诊断（`failure-diagnostics-DaxW0T`）全部通过，`pnpm test:desktop` 62 项、`pnpm docs:check` 1325 项通过。接收方此前那次失败的根因仍以日志为准，外部电脑与可信签名保持 `待环境`。

更新记录：2026-09-21，v5.97，按“把该方式规定下来，防止下次失败”的要求，把免安装包可执行文件约束升格为强制规则：[本地桌面运行与打包](./local-desktop.md) v1.50 新增“桌面发行物强制规则”，给出 `DESK-EXE-1`～`DESK-EXE-6` 六条硬性要求（EXE 与官方 Electron 逐字节一致、`signAndEditExecutable` 必须为 `false`、图标随包 `icon.ico`、依赖闭包只允许包内文件与 Windows 组件、内嵌 asar 摘要必须一致、交付前必须完成包内运行时端到端验收）、失败判定与禁止做法（禁止改名/复制/换启动方式/等待/自签名规避，禁止直接归因为业务代码）以及四个验收入口；[文档变更规则](./document-change-rules.md) v1.9 在变更触发矩阵新增“桌面免安装包、可执行文件或打包脚本变化”一行；根 [AGENTS.md](../AGENTS.md) 新增“桌面免安装包发行物（强制）”小节，使后续任务默认受该约束；[packaging.test.cjs](../sanye_desktop/packaging.test.cjs) 增加对还原步骤、哈希对照、图标随包和依赖闭包门禁的断言，随 `pnpm test:desktop` 与 CI 工作流 `.github/workflows/desktop-check.yml` 执行。本轮 `pnpm test:desktop` 59 项通过、`pnpm docs:check` 1324 项通过。

更新记录：2026-09-21，v5.96，登记[本地桌面运行与打包](./local-desktop.md)对“免安装包 EXE 被系统策略拦截”的定位与修复：先用对照实验确认拦截只与文件内容有关（同一 EXE 复制改名、换启动方式、等待 25 分钟均仍被拦），把交付包 EXE 替换为官方 Electron 二进制后应用完整启动，再用字节级对比证明两次构建的 EXE 仅相差 64 字节（electron-builder 写入的 asar 头部摘要），即任何源码改动都会产生新的未签名 EXE 并被 Smart App Control 拒绝。修复为免安装包构建后把 `三叶动漫.exe` 还原为 `node_modules/electron/dist/electron.exe` 字节并强制校验 SHA-256、图标改为随包 `icon.ico`（快捷方式指向该文件）、`build-portable.cjs` 设 `signAndEditExecutable: false`、`verify-icon.cjs` 改为校验随包图标、`verify-runtime-closure.cjs` 增加内嵌 asar 摘要校验并在 EXE 预检被拦时保留同版本 Electron 加载器兜底。最终交付 `20260921-144921-754`（ZIP SHA-256 `BBB70131F098527F1311C913E5B3A354054EE7E9D095901D3FF67981499162C0`，EXE SHA-256 `1DC2D12E5C60341782E68C4B65A8E49CBD86217F81568F90575547CEC13B5610`），`verify-first-run`（`first-run-ts8eNj`）与 `verify-packaged-runtime`（`packaged-runtime-0p8COZ`）通过，`pnpm test:desktop` 57 项通过；代价是资源管理器显示的 EXE 图标为 Electron 默认图标，外部电脑与可信签名保持 `待环境`。

更新记录：2026-09-21，v5.95，登记[本地桌面运行与打包](./local-desktop.md)的“本地服务运行失败”启动诊断加固：核对接收方所用桌面版本为 `20260921-114601-006`（ZIP SHA-256 `3F52443886F3F6BD1F4CF023115905A4EA35EEF151E7DECBE3B862A74C03D155`，其本机首次启动复验与跨盘/只读/中文用户名隔离复验均通过，说明本机证据不能解释接收方失败）；复现固定端口 `127.0.0.1:28710` 被占用时 `listen EADDRINUSE` 直接中止启动，并把 `28710`～`28719` 改为顺序顺延（实际源站记入 `runtime-layout.json` 的 `renderer` 字段）、子进程 `spawn` 错误写入服务日志、业务服务就绪上限由约 90 秒提高到 240 秒、任何启动失败追加写入 `local-services/logs/startup-error.log`（含版本、端口、子进程状态与各日志尾部，不含数据库密码）、失败弹窗显示版本并提供“重试 / 打开日志目录 / 退出”。`pnpm test:desktop` 48 项通过；新增可复用验收入口 `sanye_desktop/verify-port-fallback.cjs`，占用 28710 与 28711 后用包内 `app.asar` 代码真实启动服务并落在 `127.0.0.1:28712`（报告 `sanye_deploy/.local/port-fallback-Abs94F/report.json`）。最终交付包替换为 `20260921-135951-495`（ZIP SHA-256 `FD0EFA5F65DA6C3CCF72B49E7E3EBDD508363C7DF1EAD220A6D9EE7812933332`，首次启动复验 `sanye_deploy/.local/first-run-kWSjWW/report.json` 通过，包内使用说明增补接收方排查步骤）。接收方电脑的原始原因仍需其 `startup-error.log` 确认，外部电脑与可信签名保持 `待环境`。

更新记录：2026-09-21，v5.94，登记 VQ-31 高刷与物理呈现的实施与验证：新增 `sanye_client/src/video/presentationLayers.ts`（`PresentationLedger` 累计四层计数，`foldPresentationLayers` 折算窗口结论），把源帧（媒体元素 `requestVideoFrameCallback` 的 `presentedFrames` 增量）、生成帧（渲染 Worker 的 GPU 完成计数，含补间帧）、合成器提交（每次实际 `render` 调用）与可观察呈现（画布作为可见层时的主线程动画帧数）分开记录，另记「刷新边界上被呈现帧的内容陈旧度」P95；`classifyPresentation` 分「刷新对齐 / 受刷新上限约束 / 计时器节拍 / 未确认」四类口径，`generationOnTarget` 与 `presentationGap` 保持独立，每个窗口固定带 `physical: 'unverified'`。`PresentationScheduler` 新增 `PresentationAlignment`：默认 `refresh` 在目标高于刷新能力时改在刷新边界回调里提交，并把边界前已到期时隙按各自理想时刻补齐（`takeDueSlots`，一个边界内最多 4 个时隙，超过上界仍按跳过处理并交由既有帧率稳定逻辑降档），未定相位用 `NaN` 表示并在首次取时隙时锚定；渲染 Worker 增加边界交付确认（连续三个边界回调后确认，确认期内挂一次有界计时器，未交付时取消回调、退回截止时刻计时器并保留只读边界探针），`startRealtimeInterpolation` 与播放偏好新增 `presentationAlignment`（默认 `refresh`，`deadline` 为隔离对照，不进入播放器菜单），统计新增 `presentation`、`presentationAlignment`、`boundaryTicks`。新增入口 `e2e/high-refresh-presentation.test.cjs`（2 项通过）：判定语义覆盖四类口径、生成达标与呈现差额、物理呈现标记与窗口清空；真实 60Hz 链路上 120 目标窗口为源帧 30 · 生成帧 120（补间 120） · 提交 120 · 呈现 60、结论文本 `（59.9Hz 上限，提交超出呈现 60）`，被呈现帧相对刷新边界的陈旧度 P95 为 6.5ms（隔离对照 17.3ms）。同一改动使 `e2e/realtime-interpolation.test.cjs` 的 1080p / 30 FPS → 120 目标锐化门禁由改动前 111/111/96 FPS 且末窗降档到 60，变为 120/120/119 FPS、帧间隔 P95 恒为 8.33ms、长帧 0、跳过期时隙 0；`e2e/player-quality.test.cjs` 的 1080p 高刷矩阵 17 组全部通过（144 为 146/143、165 为 167/164、240 按极帧率口径平衡到性能档后为 233/227，改动前本机 144/165 在负载窗口内降档）；`e2e/worker-generations.test.cjs` 新增「边界回调不交付时退回计时器」用例，`e2e/presentation-scheduling.test.cjs` 与 `e2e/interpolation-stability.test.cjs` 的唤醒口径断言同步更新为「计时器时钟 + 刷新边界驱动提交」。回归 `realtime-interpolation`（4 项）、`presentation-scheduling`/`frame-cadence-policy`/`worker-generations`（18 项）、`interpolation-stability`、`interpolation-bypass`（9 项）、`enhancement-recovery`（6 项）、`interpolation-delay-adaptive`（5 项）、`startup-quality-timeline`（3 项）、`quality-observability`（4 项）、`quality-fluctuation`、`progress-seek-latency`（四配置）、`playback-pipeline`、`playback-experience`（2 项）、`frame-menu-state`、`anime4k-scheduling`（2 项）、`p1-playback-lifecycle`、`p2-processing-order`、`p2-gpu-pipeline`、`p2-motion-cpu`、`motion-naturalness`、`seek-performance`、`adaptation-notice`、`interpolation` 与清晰度专项 `e2e/e2e-media-quality.mjs`（4/4，生产构建预览）通过，`pnpm --filter @sanye/sanye_client typecheck`、`build` 与 `pnpm docs:check`（1313 项）通过。同步[功能规格](../product/feature-specification.md) v0.18、[决策记录](./decision-log.md) D-029、[进阶计划](./player-quality-development-plan.md) 6.2.7、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)；本机显示能力为 60Hz，120/144/165Hz 物理呈现、整片观感、跨显卡、能耗与桌面安装物保持待环境。

更新记录：2026-09-21，v5.93，登记 VQ-30 画质可观测性的实施与验证：新增汇总模块 `qualityObservability.ts`，按一秒窗口把实际清晰度档位（生效档位序号/高度/码率、阶梯最高档、比当前高一档的档位 `nextHeight` 与按 `abrBandWidthUpFactor` 换算的升档需求 `nextRequiredBps`、`autoLevelCapping` 对应的窗口尺寸上限 `capHeight`、`manualLevel` 表示的手动来源、`bandwidthEstimate`、VQ-25 记忆回落说明）与渲染 Worker 的 `stallFrames`、`analysisWidth`、`effectiveProfile`/`requestedProfile`、`qualityFallbacks` 以及页面累计的媒体等待次数合并成画质窗口；原因按「手动选择 → 记忆档位回落 → 播放窗口尺寸上限 → 带宽不足 → 播放中停顿 → 带宽自适应」归纳，说明固定为「当前 XP（最高 YP）：原因」。档位变化给一次瞬时提示（同一高度在回到最高档前不重复、最小间隔 5 秒、被拦下的降档在下一窗口补齐，起播低档起步与手动选择不提示），清晰度菜单新增「当前清晰度说明」入口读取同一份汇总且不改变档位与控件标签，最近 30 个窗口挂在播放器实例 `sanyeQualityWindows` 上作为诊断通道，不新增常驻面板。新增入口 `e2e/quality-observability.test.cjs`（4 项通过，开发服务 `5173` 与生产构建预览 `4173` 各一次）：三项判定语义覆盖窗口汇总、原因优先级与提示去重/补齐；真实链路为大窗口升到 720P 后给高档分片加 3 秒延迟，观察到回落窗口 `当前 360P（最高 720P）：带宽自适应：估算 3.2Mb/s`，同窗口带宽估计 3.225–3.238Mb/s（升档需求 3.059Mb/s）、落后帧 21–25、运动分析宽度 128、回退历史为空，界面提示与窗口汇总逐字一致、可查询说明等于最新窗口摘要。回归 `quality-fluctuation`、`startup-quality-timeline`（2 项）、`progress-seek-latency`（四配置）、`interpolation-delay-adaptive`（5 项）、`interpolation-bypass`（9 项）、`enhancement-recovery`（6 项）、`realtime-interpolation`（4 项）、`playback-pipeline`（3 项）、`playback-experience`（2 项）、`frame-menu-state` 与清晰度专项 `e2e/e2e-media-quality.mjs`（4/4）通过，`pnpm typecheck`、`pnpm --filter @sanye/sanye_client build` 与 `pnpm docs:check`（1284 项）通过。同步[功能规格](../product/feature-specification.md)、[决策记录](./decision-log.md) D-028、[进阶计划](./player-quality-development-plan.md) 6.2.6、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)；真实网络降档预测准确率、真实显卡与片源、跨设备与桌面安装物保持待环境。

更新记录：2026-09-21，v5.92，登记 VQ-29 补帧延迟自适应收缩的实施与验证：新增判定模块 `interpolationDelayPolicy.ts`（下限取 `max(2 个源帧间隔, 40ms)`、上限仍为页面传入的 150ms；播放段起点按上次证明可用的延迟起播；未接管呈现前按「最新源帧老化时间 + 1.5 个源帧间隔」加宽且单调不减；播放段首个窗口为预热窗口；连续两个干净窗口、窗口内最坏实测需要仍留 ≥ 15ms 余量且距上次变化 ≥ 1 秒时收缩 20ms；目标越过最新源帧时按步恢复余量 40ms，受 1 秒冷却与上限约束），渲染 Worker 在起播、定位、暂停恢复、缓冲、换源与时间轴跳变等播放段边界重新定档延迟，帧队列保留深度改按会话上限计算（收缩只改变展示时刻、不减少可回退缓冲，保持 VQ-24 与 VQ-27 门禁），页面用 40ms 斜坡让音频延迟跟随生效视频延迟，超分纹理预算同样改按会话上限计算以保持 VQ-26 语义，新增 `interpolationDelay: 'adaptive' | 'fixed'` 隔离对照开关与 `interpolationDelay` 统计（`awaitingMs`、`neededMs`、`neededMaxMs`、`neededP90Ms`、`widens`、`shrinks`、`restores`、`inEpochRestores`、`rewinds`、`resumeRewinds`）。新增入口 `e2e/interpolation-delay-adaptive.test.cjs`（5 项通过）：三项判定语义与一项每种口径三轮取中位数的真实链路对照，三次连续运行下首帧 → 补间层就绪由 192.9/211.7/196.6ms 降到 114.4/119.5/116.9ms、定位后原画窗口由 262.0/267.6/257.4ms 降到 176.1/181.3/175.1ms、`ready-data` → `interpolation-active` 由 339.8/333.8/344.8ms 降到 253.4/266.5/249.3ms，起播生效延迟 150 → 66.7ms，音画绝对偏差 0ms（门禁 ≤ 40ms），正常推进回跳 0，恢复余量只出现在停顿窗口且次数不超过恢复次数，输出 640×360 与生效档位不变；`quality-fluctuation`、`interpolation-bypass`（9 项）、`progress-seek-latency`（四配置）、`realtime-interpolation`（4 项）、`startup-quality-timeline`（2 项）、`enhancement-recovery`（6 项）与 `pnpm typecheck`、`pnpm docs:check`（1255 项）通过。同步[进阶计划](./player-quality-development-plan.md)、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)；真实显卡、真实片源、跨设备窗口、长片累计漂移与桌面安装物保持待环境。

更新记录：2026-09-20，v5.91，登记 VQ-28 仅增强路径移入渲染 Worker 的实施与验证：新增档位链路唯一定义 `profileShaderChain`（主线程 `anime4kRuntime` 与渲染 Worker 共用，`FrameEnhancer` 放大倍率改读链路 `magnification()`），渲染 Worker 新增 `interpolation: false` 执行模式（不创建运动估计线程、无插值延迟与音频路由、`forceBypass` 固定不补帧、关闭自动降档与恢复）与仅增强专用绘制路径，新增 `enhancementPath` 开关与 Worker 初始化握手失败时的自动回退，统计新增 `enhancementOnly`。新增 `e2e/enhancement-thread-migration.test.cjs`（5 项通过）：五档同源同尺寸 RGB 像素对照逐字节一致（性能/均衡/锐化/修复各 172,800 个通道、超分 691,200 个，最大偏差 0；性能档 alpha 差异单独记录），640×360 30 FPS 受控窗口主线程长任务由原路径 61 次（最长 65ms）降为 0、帧间隔中位数 33.3ms、合成帧 0、停顿帧 0，Worker 模块不可用时回退主线程路径且播放不中断。同步[进阶计划](./player-quality-development-plan.md)、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)；Worker 运行期上下文丢失路径、真实显卡、片源与桌面安装物保持待环境。

更新记录：2026-09-20，v5.90，登记 VQ-27 源帧率达标跳过光流补帧的实施与验证：新增 `interpolationDemandPolicy.ts`（源帧率取最近 16 个画面间隔中位数，`≥ 目标 × 0.92` 进入旁路、`≤ 目标 × 0.8` 才恢复，进入 400ms / 6 样本、恢复 700ms / 8 样本，改档只清空连续证据），主线程按媒体时间上报相邻画面间隔，渲染 Worker 旁路时不再缩放、投递光流分析与上传运动场，只保留增强与原帧呈现并以 `interpolationNeed`、`flowSkippedFrames`、`interpolationDemand` 上报。新增 `e2e/interpolation-bypass.test.cjs`（9 项通过）：真实 60 FPS HLS 播放每窗跳过 45–49 次光流分析、分析 0、合成帧 0、停顿帧 0；同源强制补帧对照每帧纹理上传中位数 3.05 对旁路 1.0；源降到 24 FPS 恢复补帧、回到 60 FPS 再旁路且不超过 3 次模式变化；旁路输出最近原帧并与对照在相位端点逐字节一致。同步[进阶计划](./player-quality-development-plan.md)、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)；本机 1080p 120 FPS 门禁改动前后都未通过（既有本机负载相关失败），真实片源、跨显卡与桌面安装物保持待环境。

更新记录：2026-09-20，v5.89，登记 VQ-26 增强档位有界恢复的实施与验证：降档由“连续 3 个慢帧”（约 100ms）改为墙钟持续压力判定（覆盖 800ms、不少于 3 个样本，连续两个有余量样本才结束压力段），恢复加入 5 秒冷却、3 秒稳定样本门槛、恢复失败冷却翻倍（5→10→20→40→60 秒）与可恢复上限（默认等于请求档位，240 FPS 平衡与结构性降档锁定实际档位）；`enhancementBudgetPolicy.ts` 承载判定，`e2e/enhancement-recovery.test.cjs` 覆盖判定语义与真实渲染 Worker。本机受控夹具（640×360、2× 超分、34 秒、29 个窗口）观测到两次降档与两次有界恢复，恢复间隔分别 8081.6ms 与 13019.1ms，未出现同一档位反复升降。同步[进阶计划](./player-quality-development-plan.md)、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)；真实显卡、真实片源、跨设备与桌面安装物保持待环境。

更新记录：2026-09-20，v5.88，登记 VQ-25 起播清晰度记忆的实施与验证：按播放地址记录上次成功的实际档位与阶梯签名（自动 7 天、手动 30 天强偏好），起播优先定档，首片超过 2 秒未出画或命中致命错误时作废记录并回落低档，播放期只在实际档位变化时写回。`e2e/startup-quality-timeline.test.cjs` 增加记忆、过期与带宽不足三类场景，`e2e/playback-experience.test.cjs` 增加存储语义断言；本机受控夹具四次运行下高档与首帧同时到位（137.2–244.7ms，冷启动 2291.6–2388.0ms）。同步[进阶计划](./player-quality-development-plan.md)、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)；真实片源、跨网络与桌面安装物保持待环境。

更新记录：2026-09-20，v5.87，登记「从搜索到播放」画质与帧率方案 P6（VQ-25～VQ-31）：起播清晰度记忆、增强档位有界恢复、源帧率达标跳过补帧、仅增强路径移入 Worker、原画窗口自适应、画质可观测性与高刷复测。新增起播时间线测量入口 `e2e/startup-quality-timeline.test.cjs` 并记录本机基线（高档到位约 2.3 秒、补间层就绪 0.33–0.72 秒）。同步[进阶计划](./player-quality-development-plan.md)、[任务清单](./development-tasks.md)、[测试计划](./media-player-test-plan.md)与[文档地图](./README.md)；条目均为待执行，两项产品口径待确认。

更新记录：2026-09-20，v5.86，登记画质波动修正（VQ-24）：`receiveFrame` 不再把采集间隔当作时间轴跳变重建管线，目标落在帧窗口外时改用最近可用帧维持增强与补间层，只有内容停止推进 800ms 才回到原画；新增 `e2e/quality-fluctuation.test.cjs` 并收紧 `e2e/interpolation-stability.test.cjs`。同步[进阶计划](./player-quality-development-plan.md)、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)。软件渲染下的长绘制提交与持续落后时的音画偏差保留为待设备复测。

更新记录：2026-09-20，v5.85，登记播放体验修正（VQ-22、VQ-23）：进度条改用播放器播放期动画帧逐帧写入并取消 120ms 宽度过渡，四类配置下写入次数与渲染帧数一致、最长静止为 0；新增 `e2e/progress-seek-latency.test.cjs` 测量拖动定位时间线、主线程长任务、呈现与捕获节奏。同步[进阶计划](./player-quality-development-plan.md)、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)。定位后原画窗口与仅增强路径的主线程执行保留为未解决项，不写成已修复。

更新记录：2026-09-20，v5.84，登记播放器刷新对齐与长帧治理（VQ-19～VQ-21）：`PresentationScheduler` 取代 1ms 心跳与消息脉冲，非整数倍刷新也按刷新边界呈现，刷新回调不交付时回退截止时间计时器；取消逐帧同步回读，新增绘制耗时、长绘制与长帧比例口径。同步[进阶计划](./player-quality-development-plan.md)、[播放器设计](./media-player-development.md)、[测试计划](./media-player-test-plan.md)、[任务清单](./development-tasks.md)、[测试报告](./media-player-test-report.md)与[文档地图](./README.md)；脉冲测试入口由刷新对齐入口取代。证据为受控无头浏览器与单元测试，物理高刷、整片、跨显卡与桌面安装物保持待环境。

更新记录：2026-09-20，v5.82，登记[本地桌面运行与打包](./local-desktop.md)的接收方非英文路径数据库启动修复：确认 `0x00000001` 来自 `getInstallationPaths()` 的自身路径校验，废止 v1.36 的 8.3 短路径方案，改为把随包 PostgreSQL 运行库与数据目录镜像到纯英文目录，并记录候选、数据迁移、镜像校验、运行库来源和交付 ZIP 摘要。桌面测试 40 项、真实 PostgreSQL ASCII 镜像验收和交付包首次启动复验通过；接收方电脑与干净 Windows 环境保持 `待环境`。

更新记录：2026-09-20，v5.83，登记[本地桌面运行与打包](./local-desktop.md)对当前交付包 `20260920-143138-510` 的本机隔离环境复验：非英文与英文数据目录两条分支的首次启动、重启、进程与模块来源、回环监听和非空截图全部通过，报告为 `sanye_deploy/.local/first-run-09YxwJ/report.json` 与 `sanye_deploy/.local/first-run-9V3qr7/report.json`。未修改产物，接收方电脑与干净 Windows 环境保持 `待环境`。

更新记录：2026-09-18，v5.81，登记第四步 P3 RIFE v4.6/ncnn Vulkan：代码与权重许可分别核实，固定版本/摘要，六类场景五个时间步及同源光流质量比较，1080p 连续文件实验与暂不采用决策。同步进阶计划、设计、任务清单、测试计划、报告和文档地图。文件式成本不冒充常驻实时推理，工作集不冒充显存；保留质量退化、传输和目标设备待验证，P4 条件未满足。命令与证据见[播放器测试报告](./media-player-test-report.md)。

更新记录：2026-09-18，v5.80，登记[画质进阶计划](./player-quality-development-plan.md)第三步 P2：有限运动置信度修正、GPU 存储及程序复用、稠密流和处理顺序隔离比较、十七种组合预算及实际画质菜单同步。沿用既有产品要求；实现、收益、取舍与未达项目见播放器设计和[测试报告](./media-player-test-report.md)。

更新记录：2026-09-18，v5.79，登记[画质进阶计划](./player-quality-development-plan.md)第二步 P1，同步调度与生命周期设计、设备持久化评估、任务清单和测试计划。实际 CPU、帧间隔及失败记录集中见[播放器测试报告](./media-player-test-report.md)，不由本机生成帧率推定物理显示、能耗或桌面安装物表现。

更新记录：2026-09-18，v5.78，登记[画质进阶计划](./player-quality-development-plan.md) P0 执行，同步任务清单、播放器设计、测试计划、专项报告与文档地图。新增合成样本、分阶段观测和四类对照基线入口，保留真实素材授权、供电、显存、功耗及物理呈现边界；实际命令和结果集中见[播放器测试报告](./media-player-test-report.md)。

更新记录：2026-09-18，v5.77，登记[本地桌面运行与打包](./local-desktop.md)的新包验收后清理规则：新包验证成功后按绝对路径核对，仅清理 Windows 桌面和本项目 `sanye_desktop\dist` 下的旧安装包、压缩包及解压发布目录；保留本次新产物，源码、依赖和运行数据不纳入清理。本轮仅文档变更，验证入口为 `pnpm docs:check`。

更新记录：2026-09-18，v5.76，新增[画质与帧率进阶优化开发计划](./player-quality-development-plan.md)草案并同步文档地图：拆分六阶段、十八个工作包，明确当前实现、建议门禁、工期假设、模型接入决策、CPU/功耗与物理呈现证据。既有能力与验证引用播放器设计和报告，实施状态仍由任务清单维护；本轮仅文档变更，验证入口为 `pnpm docs:check`。

更新记录：2026-09-18，v5.75，登记[无需预装环境的免安装交付](./local-desktop.md)：统一最小子进程环境、独立用户数据与配置验证、全进程原生模块来源检查，以及最终 ZIP 逐项校验。完整解压后双击即可使用，不要求接收方安装 Java、数据库、VC++ 或开发工具；保留受控本机验收与干净 Windows 真机验证的区别。

更新记录：2026-09-18，v5.74，登记[播放器设计](./media-player-development.md)及[画质帧率专项](./media-player-test-report.md)的五项改进与模型实测。保留本地受控媒体、GPU 完成成本、屏幕呈现及桌面交付的区别；RIFE 经 GitHub API 完成上游方案与代码许可核对，未接入权重或推理。全量构建发现排期空数组类型错误，补充元素类型后通过；具体命令及结果见专项报告。

更新记录：2026-09-18，v5.73，登记[接收方数据库错误排查](./local-desktop.md)：旧包 PostgreSQL 实际依赖构建机系统 VC++ DLL，原离线配置缺少错误诊断。补齐随包运行库、构建检查与脱敏日志，并验证实际包加载路径、首次启动及重启；具体结果见运行文档，接收方环境保持 `待环境`。

更新记录：2026-09-17，v5.72，登记[客户端布局复验](./layout-regression-report.md)及[交互修正](../product/feature-specification.md)：搜索按钮内嵌对齐、空数据与错误状态、收藏回滚和本地想看标记。60 组布局、13 项专项回归及类型检查通过；按用户最新指令取消本轮打包、桌面更新和旧包清理，保留当前桌面版本及所有已有工作区改动。

更新记录：2026-09-17，v5.71，登记[桌面新版交付](./local-desktop.md) `20260917-161633-055`：归档及桌面文件校验、包内前端一致性、隔离首次启动和重启通过，桌面旧版移入回收站，固定入口指向新版。保留首次截图超时及原生窗口截图复验记录，区分本机启动、可信签名与外部片源验证；个人数据和仓库历史产物未删除。

更新记录：2026-09-17，v5.70，补充[播放器设计](./media-player-development.md)和[专项报告](./media-player-test-report.md)：搜索分类分页、详情与剧集并行请求、后台刷新连续性、单线重试状态、菜单原位更新、清晰度平滑切换和独立增强故障恢复。登记当前工作区的受控测试、生成与显示帧率区别、在线片源及已安装客户端未验证范围；保留其他既有改动和历史记录。

更新记录：2026-09-17，v5.69，同步[功能规格](../product/feature-specification.md)与[播放器报告](./media-player-test-report.md)：搜索隐藏自动选源控制，详情折叠线路入口，默认浅色并修正窄屏和播放器提示对比度。浏览器测试覆盖自动回退参数、主题持久化和详情手动换线，截图与命令见报告；本次没有替换桌面发行物。

更新记录：2026-09-17，v5.68，登记[播放体验](../product/feature-specification.md)、[专项验收](./media-player-test-report.md)和[固定桌面入口](./local-desktop.md)：偏好与线路记忆、语言一致换线、状态和重试操作、搜索来源选择、帧率滞回、校验后桌面交付及旧版回收。工作区保留原有无关改动。

更新记录：2026-09-17，v5.67，登记[直接观看渐进加载](./media-player-test-report.md)与[交互要求](../product/feature-specification.md)：首个有效来源立即展示、后台补线、空资源明确失败和首帧超时切线。两项浏览器测试覆盖九类故障与等待场景，类型检查通过。

更新记录：2026-09-17，v5.66，登记[修复候选交付](./local-desktop.md) `141732-133`：28 项桌面测试、专项回退与帧率测试通过，包内真实《铃芽之旅》备用线路播放通过；记录中间候选失败与一次有界重试修复，保留正在运行旧版，桌面交付最终候选。

更新记录：2026-09-17，v5.65，同步[播放器设计](./media-player-development.md)与[播放器测试报告](./media-player-test-report.md)：首帧驱动定位恢复、遮挡锐化来源、生成节奏与持续过载回退。保留本地受控媒体、GPU 完成帧率和已安装客户端的证据边界；测试命令和结果见专项报告。

更新记录：2026-09-17，v5.64，登记[备用来源契约](./api-contract.md)、[播放交互](../product/feature-specification.md)与[验证结果](./media-player-test-report.md)：同名电影保留备用来源，失败后切线；帧率降档与恢复同步菜单选中态。保留真实短时播放与整片内容验收的区别。

更新记录：2026-09-17，v5.63，登记[新版桌面交付](./local-desktop.md)：候选 `20260917-112625-168` 构建与 28 项桌面测试通过，桌面实际解压 EXE 首次启动和重启通过；按用户要求将两个旧版目录与旧 ZIP 移入回收站，保留用户数据和仓库历史产物。

更新记录：2026-09-17，v5.62，依据用户要求完善[安卓开发计划](./android-development-plan.md)与[安卓需求草案](../product/android-requirements.md)至 v0.2。对照 Windows 搜索、预览、导入、播放器、收藏历史、首页及排期，拆分 12 个板块与 8 条工程链路，补充直接观看不强制导入、来源解析异常样例、iframe 能力限制、数据恢复和升级边界。保留草案与建议取舍，不变更 Windows 冻结范围；验证命令 `pnpm docs:check`，不作为 APK 或真机结果。保留其他并行工作记录。

更新记录：2026-09-17，v5.61，登记[功能规格](../product/feature-specification.md)中的帧率、画质两栏交互。`node e2e/player-menus.cjs` 使用当前 Vue 页面、真实 ArtPlayer 与本地测试媒体验证桌面及窄屏菜单、选择后栏目名保持不变；截图在 `sanye_deploy/.local/player-menus/`，不作为外部视频源或桌面发行包更新证据。`pnpm --dir sanye_client typecheck` 通过。

更新记录：2026-09-17，v5.60，登记[安卓独立版开发计划](./android-development-plan.md)与[产品需求草案](../product/android-requirements.md)：两端运行时、数据及交付解耦，设备端迁移搜索解析与持久存储。普通 Preferences 不视为加密存储，原生 HTTP 成功不视为 HLS 全链路通过。区分确认边界与建议取舍，产品和技术分开记录，已有冻结范围不变。检查命令 `pnpm docs:check`；尚未生成安卓工程或 APK。

更新记录：2026-09-17，v5.59，登记[数据库模板交付](./local-desktop.md)：用户端移除 `initdb` 与临时资源路径绕行，构建模板并校验摘要、离线设置随机密码、原子落盘和恢复 ZIP 空目录；新增不完整目录与损坏模板保护测试。候选 `20260917-105403-001` 已构建并放到桌面，真实 EXE 首次启动与重启通过。外部电脑和可信发布签名边界保持 `待环境`。

更新记录：2026-09-17，v5.58，登记[中文路径初始化修复](./local-desktop.md)：固定 PostgreSQL locale/编码、增加资源完整性校验和数据库就绪重试；中文应用目录与中文数据目录完整启动重启实测通过。外部电脑验证为 `待环境`，当时尚未重建发行包。

更新记录：2026-09-16，v5.50，登记[天气之子完整修复](./local-desktop.md)：历史集数线路误选、失效域名复现、当前线路 ID 匹配和有界页面读取；同步[HttpClient 许可](./third-party-notices.md)。27 项 Java 测试含真实预览通过，包内真实搜索到直接播放达到 1080p、3 秒进度，发布候选编号 `20260916-163426-295`。保留旧进程未替换、整片持续播放与跨电脑未验证边界。

更新记录：2026-09-16，v5.48，登记[直接观看修复](./local-desktop.md)的真实 `5002/HTTP 301` 复现、受限重定向与 24 项测试通过证据。外网预览测试及独立网络探测均连接超时，真实视频播放仍为 `待环境`；当前运行服务与打包产物未更新。

更新记录：2026-09-16，v5.46，登记[搜索等待优化](./local-desktop.md)及[默认外部源配置](./environment-config.md)：完整结果独立展示、成功非空结果短时缓存和去除默认跳转。浏览器六项检查、后端 17 项通过，外网 Java 测试跳过；保留完整前端构建在播放器类型处失败、桌面包与生产环境未更新的边界。

## 托盘暂停更新交付核对（2026-09-16）

更新记录：2026-09-16，v5.56，登记[免安装候选](./local-desktop.md) `20260916-174318-492` 的桌面交付。24 项桌面测试、本候选启动预检及 2,283 项归档校验通过，包内主进程及暂停模块与源码一致；桌面解压文件校验后更新快捷方式，不生成独立 `.sha256` 文件。保留上一候选受系统策略拦截的历史证据，不将本轮启动探测等同于可见窗口、跨电脑或可信签名验收。

## 托盘视频暂停核对（2026-09-16）

更新记录：2026-09-16，v5.55，按用户要求同步[窗口行为](../product/feature-specification.md)和[桌面实现证据](./local-desktop.md)：隐藏到托盘保留页面及后台服务，只暂停视频，恢复不自动续播；真正退出才停止服务。`pnpm test:desktop` 24 项通过，包含浏览器真实视频暂停与恢复测试。打包清单加入媒体处理模块；系统签名策略阻塞未解除，当前旧客户端未替换。

## 最小化行为修正核对（2026-09-16）

更新记录：2026-09-16，v5.54，按用户纠正同步[窗口产品行为](../product/feature-specification.md)与[桌面实现证据](./local-desktop.md)：最小化留在任务栏，只有 × 隐藏托盘。七项主进程生命周期测试通过，包内主进程源码一致；候选 `20260916-173533-517` 被 Windows Code Integrity 3077/3033 阻止启动，更新为 `blocked-external`，桌面入口和运行实例仍为旧版。保留模拟测试与实际系统操作之间的边界，未生成独立 `.sha256` 文件。

## 打包输出简化核对（2026-09-16）

更新记录：2026-09-16，v5.53，按用户要求移除免安装脚本的独立 `.sha256` 文件写入，并同步[一键脚本说明](../sanye_tools/README.md)。后续交付不复制该文件，内部逐文件验证和构建报告摘要保持有效；验证为 PowerShell 语法解析及 `pnpm docs:check`，未重新构建或删除历史产物。

## 播放质量更新包核对（2026-09-16）

更新记录：2026-09-16，v5.52，登记[本地更新包](./local-desktop.md) `20260916-172427-738`：21 项桌面测试、EXE 启动预检及 2,283 项归档验证通过；包内运行时真实搜索、1080p 播放和新增质量与帧率菜单检查通过。桌面提供新 ZIP、解压目录和快捷方式，保留旧包与个人数据。明确 Java 测试跳过、当前实例未启动、无可信签名，以及短时后台播放不等同于高刷物理呈现、可见 EXE 或跨电脑验收。

## 播放质量改进核对（2026-09-16）

更新记录：2026-09-16，v5.51，登记 D-027 与产品需求、功能规格、MVP 范围、任务和追溯同步；实现与测试分别以[播放器设计](./media-player-development.md)和[报告](./media-player-test-report.md)为准，质量门禁与发布评估同步专项边界。四项质量分项、四项完整补帧回归、生产资源交互、类型检查和构建通过。保留重增强核显回退、240 未达标、高刷物理呈现和 RIFE 待环境，记录 Anime4K 许可随包分发。

## 导入观看专项核对（2026-09-16）

更新记录：2026-09-16，v5.49，登记[播放器报告](./media-player-test-report.md)与[桌面包记录](./local-desktop.md)。区分旧运行包的 HTTP 301 失败、当前源码受限跳转处理及新候选交付；新增具体导入错误展示。24 项 Java 测试、前端重试测试和独立数据库真实来源导入、详情、剧集、搜索按钮跳转通过。较早直接观看记录中的网络超时保留为历史证据，本轮样本恢复可达不代表全部来源、影片流持续播放与跨电脑验收通过。

## 播放器拖动专项核对（2026-09-16）

更新记录：2026-09-16，v5.47，登记[播放器设计](./media-player-development.md)、[测试报告](./media-player-test-report.md)和[免安装候选](./local-desktop.md)。区分播放列表缓存与实际视频分片缓存；记录一次拖动 31 次定位降至一次、桌面与触屏实际定位、缓存边界及详情页 HLS 缓冲清空后复用分片的证据。播放器构造类型错误已修正，完整前端构建通过；保留受控片源、无可信签名及未执行外网和跨电脑验收的边界。

## 一键操作脚本核对（2026-09-16）

更新记录：2026-09-16，v5.45，登记 [sanye_tools 使用说明](../sanye_tools/README.md)与[桌面构建证据](./local-desktop.md)。完整一键免安装流程实际生成 `20260916-154359-288` 候选，21 项桌面测试、图标七尺寸比对、启动预检及 2,282 个归档条目校验通过；补充跨工作目录入口、错误图标和并发构建拒绝证据。文档地图新增统一入口，明确固定种子、构建环境、输出和日志位置；保留 Java 测试跳过、无可信签名、未执行可见窗口与跨电脑验收边界。

更新记录：2026-09-16，v5.38，登记 Windows Code Integrity 3077/3033/3089 事件及 Smart App Control 根因；补充分发硬门禁，明确自签名包不再作为可安装发行物，可信签名身份仍为 `blocked-external`。桌面测试 15 项通过；检查仅覆盖已知 Smart App Control 注册表状态，不作为任意 WDAC 放行证明。

更新记录：2026-09-16，v5.37，登记桌面固定封面随包缺失修复及真实 EXE 封面、详情、播放和退出通过证据；保留跨电脑安装卸载未执行边界。
| 评审方式 | 逐文档通读 + 交叉引用核对 + 自动化检查（链接、阶段表述、文档边界、优先级、任务一致性） |

## 托盘暂停专项核对（2026-09-16）

更新记录：2026-09-16，v5.44，登记[桌面运行](./local-desktop.md)的最小化与关闭暂停、页面卸载、本地服务停止及串行恢复。`pnpm test:desktop` 21 项通过，其中五项主进程测试使用模拟生命周期；明确恢复重新加载页面、启动中隐藏等待清理，以及真实托盘资源占用与安装程序尚未验收的边界。

## 免安装主程序图标核对（2026-09-16）

更新记录：2026-09-16，v5.43，登记[桌面运行](./local-desktop.md)的图标修正版。根因为关闭签名编辑同时跳过 EXE 图标写入；新增本地免安装构建入口，保留资源编辑。新 EXE 七种尺寸图标与指定 ICO 图像字节一致，Windows 图标提取、十九项桌面测试和无窗口启动预检通过；归档校验报告为 `sanye_desktop/dist/portable-20260916-iconfix/report.json`。保留无可信签名、未执行可见窗口与跨电脑验收的边界。

## 本地免安装包核对（2026-09-16）

更新记录：2026-09-16，v5.42，登记[桌面运行](./local-desktop.md)的 `20260916-1524` 免安装候选交付。桌面 ZIP 的 2,282 项文件摘要比对通过，十八项桌面测试及包内运行时后台验证通过；明确无可信发布签名、未执行可见窗口或跨电脑验收，不将此候选等同于安装器分发门禁通过。

## 实时补帧专项核对（2026-09-16）

更新记录：2026-09-16，v5.41，同步产品需求、功能规格、MVP 范围、决策来源、任务与追溯记录，以及播放器设计、专项报告、桌面说明和 JSFeat 第三方许可。证据入口为[播放器报告](./media-player-test-report.md)及 `e2e/realtime-interpolation.test.cjs`；明确 GPU 生成帧率、显示调度和物理呈现之间的边界，保留 60Hz 当前环境、失败优化实验及安装客户端尚未更新的限制。

## 窗口关闭与托盘修复核对（2026-09-16）

更新记录：2026-09-16，v5.40，登记[桌面运行](./local-desktop.md)的关闭隐藏、托盘恢复、再次启动唤回和明确退出流程。`pnpm test:desktop` 十八项通过，其中三项主进程事件测试覆盖本次变更；保留真实系统托盘和安装包未验收、已安装客户端未替换的边界。

## 搜索与质量修复核对（2026-09-16）

更新记录：2026-09-16，v5.39，登记[桌面运行](./local-desktop.md)的搜索 301 跳转根因、受限跳转和错误恢复验证，以及“质量”文案和 GPU 处理链减负。真实 Java 外部搜索返回匹配结果，三项浏览器回归、类型检查和构建通过；保留真实片源帧率、已安装客户端更新及安装分发尚未验证的边界。具体命令与环境见该文档本次记录。

## 桌面重新打包核对（2026-09-16）

更新记录：2026-09-16，v5.36，登记[桌面运行](./local-desktop.md)的 Java 21 运行时修复、安装器名称和摘要自动同步、Windows PowerShell 5.1 编码修复，以及 14 项测试、归档检查和实际 EXE 启动证据。保留四张封面加载失败、播放未执行、安装卸载及其他电脑未验证的边界，未将启动成功写成完整发布验收通过。

## 安装后清理专项核对（2026-09-15）

更新记录：2026-09-15，v5.35，登记[桌面运行](./local-desktop.md)的一键安装后清理策略，同步随包安装说明。当前工作区 `node --test sanye_desktop/install-package.test.cjs` 六项通过，覆盖成功删除、取消和失败保留、仅检查、摘要失败及清理失败；验证采用模拟安装进程，真实安装与重新分发未执行。确认只删除本次运行的 EXE，直接运行 EXE 和既有分发包不受新脚本影响。

## 当前核对（2026-09-10）

更新记录：2026-09-11，v5.34，登记桌面自动构建脚本、Java 17 与自签名证书基线，以及搜索专项测试通过；构建命令为 `pnpm desktop:build -- -SelfSigned`，自签名仅用于本机验证，见[桌面运行](./local-desktop.md)。

更新记录：2026-09-11，补充安装策略：所有桌面安装方式统一使用当前用户证书库自签名证书，自动构建脚本不再提供可信签名分支。

更新记录：2026-09-11，补充本次自签名重建结果：前端构建通过，运行时准备因本机 PostgreSQL 5433 未启动失败，未将未生成的安装器标记为完成。

更新记录：2026-09-11，v5.33，登记用户选择的真正 120fps 预处理功能，逐帧校验 12fps 输入生成 120 帧且保留声音与时长，HLS 与取消测试通过，实际 EXE 界面闭环通过；明确短片段测试、256 MiB 输入限制、GPL 核心许可及非实时边界，见[桌面运行](./local-desktop.md)。

更新记录：2026-09-11，v5.32，登记候选 20260911.1 的返回、搜索、折叠和画质控件修复；前端检查与浏览器专项通过，真实 EXE 八项通过，安装成功。性能测试存在最小化窗口及运行中断，未声称达到目标帧率，详见[桌面运行](./local-desktop.md)。

更新记录：2026-09-11，v5.31，登记桌面开发模式错误代理导致封面加载失败的问题，改为受路径约束的本地封面读取；浏览器十张图片加载成功，未将模拟接口或预览页面当作安装包业务验收。

更新记录：2026-09-11，v5.30，登记侧栏按钮裁切、网格折叠和响应式修复，浏览器专项、类型检查和构建通过；审核失败直接发布及种子来源风险留为审查问题。API 替身测试和旧安装包不作为新 EXE 实测，见[桌面运行](./local-desktop.md)。

更新记录：2026-09-11，v5.29，登记[保留作品的体积优化](./local-desktop.md)：全部 Java 模块压缩并恢复同版本供应商原生文件，PostgreSQL 仅删开发目录；125 个客户端文件和种子 SQL 不变。真实服务八项及桌面回归七项通过，首次失败原因与最终方案分别记录。

收口：安装器从 532.02 MiB 降到 431.25 MiB，优化版 EXE 真实播放及退出通过，ZIP 六文件核对通过；最终安装器启动仍遭 Windows 应用控制拦截，安装卸载保留待环境，不改变策略绕过。

更新记录：2026-09-11，v5.28，将随包安装说明改为面向普通用户的操作步骤，保留高级手动方式，新增稳定源文件并由打包脚本同步。新版 ZIP 六文件内容摘要验证通过，原有安装器内容未修改；见[桌面运行](./local-desktop.md)。

更新记录：2026-09-11，v5.27，补齐一键安装器与证书摘要校验、真实 cmd 检查模式和缺失文件失败验证，生成六文件 ZIP 及逐项摘要核对。公开 Release 尚未上传，GitHub 身份、源码对应及素材授权缺口见[桌面运行](./local-desktop.md)。

更新记录：2026-09-10，v5.26，将测试证书生成器默认到期日调整为 `9999-12-31`，实际生成并安装新的当前用户测试证书；保留旧版验收为历史，要求新产物重新签名和核对，见[桌面运行](./local-desktop.md)。

更新记录：2026-09-11，v5.26，新证书安装器构建和签名有效性通过，新 EXE 六项检查、真实播放和退出码 0 复验通过；公开证书、安装说明及摘要同步。保留首次关闭失败记录，未将旧版本安装卸载结果当作新版本实测。

更新记录：2026-09-10，v5.25，登记维护者授权后的真实测试证书创建及当前用户信任安装，新增 Windows 原生自签名构建入口，保留第三方运行时原字节。五项桌面测试通过；安装包与系统启动验证不从证书安装成功推断，见[桌面运行](./local-desktop.md)。

本轮收口：七项桌面回归通过，最终自签名 NSIS 安装器完成安装、安装后 EXE 实际播放与退出、卸载清理验证；日志和摘要见桌面运行文档。修复文档检查误扫构建副本的问题。另一台电脑、公开可信签名及升级回滚仍未验收。

更新记录：2026-09-10，v5.24，登记[自签名测试证书](./local-desktop.md)生成、安装和卸载入口；私钥不可导出，安装需要公开证书 SHA-256，信任仅限当前用户。未自动修改信任库，不宣称解决 Smart App Control 或公开签名。

更新记录：2026-09-10，v5.23，登记[无证书桌面构建准备](./local-desktop.md)：增加 Windows 源码工作流、离线种子完整性校验和产物摘要，明确远端 CI、种子分发许可、完整安装包及证书尚未验收；更新申请已尝试但未确认成功的状态。

更新记录：2026-09-10，v5.22，登记[免费签名申请准备](./local-desktop.md)：GitHub 初始查询无根许可证、公开发行接口为空；维护者授权后加入自有代码 MIT 许可和[第三方许可说明](./third-party-notices.md)，桌面包携带许可文件。现有桌面构建依赖本机数据库，托管来源验证仍待实现；未注册账户或提交申请，证书状态保留 `blocked-external`。

更新记录：2026-09-10，v5.21，登记[桌面启动与打包阻塞修复](./local-desktop.md)：通过系统 3077/3118 事件确认 Smart App Control 拦截，修正临时安装器签名顺序并补齐签名门禁与失败报告，四项桌面测试通过；本机缺少可信签名身份，最新产物启动及安装验收仍为 `blocked-external`。

更新记录：2026-09-10，v5.20，登记[性能后续修复](./performance-test-report.md)：监控改为后台采样并限制旧样本有效期；22.4 秒跨周期测试 80 次成功、p95 29.6 毫秒；部门状态校验 SQL 修正并在本机 PostgreSQL 只读执行成功。管理测试 26 项通过；外部调度未配置继续标记环境阻塞，未变更其他未测接口的状态。

更新记录：2026-09-10，v5.19，登记[本轮接口压测](./performance-test-report.md)：62 场景、60 通过、2 个 XXL-JOB 受阻；静态 217 映射只覆盖 59，未写成全量通过。监控快照优化和路由 SQL 修复有原始响应、25 项管理测试及复测证据。未测外部、管理写操作和生产容量保留待环境，历史记录保留原日期。`pnpm docs:check` 866 项通过、失败 0，证据为 `sanye_deploy/.local/perf-docs-check.log`。

本地桌面专项：新增 `local-desktop.md`，同步任务清单与文档索引；核对登录/AI/桌宠排除、固定推荐、独立数据库和安装包边界。更新记录：2026-09-10，v5.18，依据本次桌面代码、Maven/前端检查及专用运行报告；实际播放、签名与干净系统验收分别记录，不与构建成功混同。

本次按当前代码与进度复核正式文档、工程入口和文档索引，修正 T-R-06、管理前端、可靠事件/XXL-JOB、Java 21、CAS 本地地址及发布结论的漂移。历史报告补充时效边界；产品需求、原型规范及 AiCoding 模板不批量改写为实现完成。完整检查结果、未执行项和正常使用判断见[当前审计](./current-status-audit.md)。基础回归通过不关闭外部门禁；文档检查结果在本次收口记录登记。

更新记录：2026-09-10，v5.17，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

本次收口结果：前端类型检查和三端构建通过，业务后端 291、管理后端 23、脚本测试 40、自包含浏览器 13 项通过；`pnpm docs:check` 856 项通过、失败 0，`git -c core.safecrlf=false diff --check` 退出码 0。日志为 `sanye_deploy/.local/docs-audit-*`。T-R-04 演练脚本及四个 JAR 与历史报告摘要不同，最新真实恢复复验未执行；已同步任务、恢复说明和当前审计，不把旧完成记录当作当前产物证明。

## 本次全仓文档清单（2026-09-10）

范围为 `rg --files -g '*.md'` 可见的 117 份 Markdown，排除依赖、构建产物和本地生成目录。本次修订 53 份现有文档并新增 1 份当前审计，其余 63 份经目录、状态表述和引用核对后保留。产品需求和规范仍是验收标准，上游说明及历史 Ledger 保留来源语境；这不是每个接口字段、产品状态或运行环境的全面实测声明。

方法为全仓文件/链接与过期表述扫描、重点事实源通读、针对身份/媒体/事件/调度/发布的源码追溯、当前基础回归及报告摘要核对。子代理只读协助；最终修改与证据判断由主审统一。既有未提交修改及本轮同步补入的 T-R-06 记录已保留，未提交或推送。

| 文档 | 本次处置 |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | 保留现行项目协作规则 |
| [AiCoding/CONTENTS.md](../AiCoding/CONTENTS.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/MIGRATION-NOTICE.md](../AiCoding/MIGRATION-NOTICE.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/TODO-P2-strategy-shelf.md](../AiCoding/TODO-P2-strategy-shelf.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/TODO.md](../AiCoding/TODO.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/contracts/README.md](../AiCoding/contracts/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/contracts/examples/README.md](../AiCoding/contracts/examples/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/contracts/metadata/README.md](../AiCoding/contracts/metadata/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/contracts/site/README.md](../AiCoding/contracts/site/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/design/00-design-overview.md](../AiCoding/design/00-design-overview.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/design/api-design.md](../AiCoding/design/api-design.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/design/database-design.md](../AiCoding/design/database-design.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/design/frontend-design.md](../AiCoding/design/frontend-design.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/development-plan/README.md](../AiCoding/development-plan/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/index/freshness-report.md](../AiCoding/index/freshness-report.md) | 修订当前事实、进度或引用边界 |
| [AiCoding/index/provenance-map.md](../AiCoding/index/provenance-map.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/index/retrieval-guide.md](../AiCoding/index/retrieval-guide.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/ledger/S001-bootstrap.md](../AiCoding/ledger/S001-bootstrap.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/ledger/ledger-index.md](../AiCoding/ledger/ledger-index.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/ops/README.md](../AiCoding/ops/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/ops/env/README.md](../AiCoding/ops/env/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/ops/runs/README.md](../AiCoding/ops/runs/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/plan/README.md](../AiCoding/plan/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/plan/active/README.md](../AiCoding/plan/active/README.md) | 修订当前事实、进度或引用边界 |
| [AiCoding/policy/agent-workflow-policy.md](../AiCoding/policy/agent-workflow-policy.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/policy/conflict-resolution.md](../AiCoding/policy/conflict-resolution.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/policy/document-authoring-policy.md](../AiCoding/policy/document-authoring-policy.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/policy/document-status-policy.md](../AiCoding/policy/document-status-policy.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/policy/memory-write-policy.md](../AiCoding/policy/memory-write-policy.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/policy/retrieval-policy.md](../AiCoding/policy/retrieval-policy.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/reports/README.md](../AiCoding/reports/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/sql/README.md](../AiCoding/sql/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/system/ai-debug-workflow.md](../AiCoding/system/ai-debug-workflow.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/system/engineering-bootstrap.md](../AiCoding/system/engineering-bootstrap.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/system/legacy-code-map.md](../AiCoding/system/legacy-code-map.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/system/memory-recovery.md](../AiCoding/system/memory-recovery.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/templates/ledger-template.md](../AiCoding/templates/ledger-template.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/templates/plan-template.md](../AiCoding/templates/plan-template.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/templates/view-template.md](../AiCoding/templates/view-template.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/test/README.md](../AiCoding/test/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/tools/README.md](../AiCoding/tools/README.md) | 修订当前事实、进度或引用边界 |
| [AiCoding/userstory/README.md](../AiCoding/userstory/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/README.md](../AiCoding/views/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/api/README.md](../AiCoding/views/api/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/architecture/README.md](../AiCoding/views/architecture/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/business/README.md](../AiCoding/views/business/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/concepts.md](../AiCoding/views/concepts.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/database/README.md](../AiCoding/views/database/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/domain-overview.md](../AiCoding/views/domain-overview.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/domain/README.md](../AiCoding/views/domain/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/domains/README.md](../AiCoding/views/domains/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/flows/README.md](../AiCoding/views/flows/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/frontend/README.md](../AiCoding/views/frontend/README.md) | 保留治理规范/派生入口/历史记录 |
| [AiCoding/views/frontend/domains/README.md](../AiCoding/views/frontend/domains/README.md) | 保留治理规范/派生入口/历史记录 |
| [README.md](../README.md) | 修订当前事实、进度或引用边界 |
| [docs/README.md](./README.md) | 修订当前事实、进度或引用边界 |
| [docs/ai-evaluation.md](./ai-evaluation.md) | 补充历史证据时效，保留原结果 |
| [docs/anime-import.md](./anime-import.md) | 修订当前事实、进度或引用边界 |
| [docs/api-contract.md](./api-contract.md) | 修订当前事实、进度或引用边界 |
| [docs/backend-mvp.md](./backend-mvp.md) | 修订当前事实、进度或引用边界 |
| [docs/backup-recovery.md](./backup-recovery.md) | 修订当前事实、进度或引用边界 |
| [docs/button-test-report.md](./button-test-report.md) | 补充历史证据时效，保留原结果 |
| [docs/ci-cd.md](./ci-cd.md) | 修订当前事实、进度或引用边界 |
| [docs/current-status-audit.md](./current-status-audit.md) | 新增当前证据与可用性判断 |
| [docs/database-design.md](./database-design.md) | 修订当前事实、进度或引用边界 |
| [docs/decision-log.md](./decision-log.md) | 核对后保留原范围 |
| [docs/degradation-report.md](./degradation-report.md) | 补充历史证据时效，保留原结果 |
| [docs/desktop-companion-development-plan.md](./desktop-companion-development-plan.md) | 修订当前事实、进度或引用边界 |
| [docs/desktop-companion-test-report.md](./desktop-companion-test-report.md) | 补充历史证据时效，保留原结果 |
| [docs/development-plan.md](./development-plan.md) | 修订当前事实、进度或引用边界 |
| [docs/development-tasks.md](./development-tasks.md) | 修订当前事实、进度或引用边界 |
| [docs/development-todo.md](./development-todo.md) | 修订当前事实、进度或引用边界 |
| [docs/document-change-rules.md](./document-change-rules.md) | 修订当前事实、进度或引用边界 |
| [docs/document-review.md](./document-review.md) | 修订当前事实、进度或引用边界 |
| [docs/environment-config.md](./environment-config.md) | 修订当前事实、进度或引用边界 |
| [docs/gap-register.md](./gap-register.md) | 修订当前事实、进度或引用边界 |
| [docs/interface-test-report.md](./interface-test-report.md) | 补充历史证据时效，保留原结果 |
| [docs/layout-regression-report.md](./layout-regression-report.md) | 补充历史证据时效，保留原结果 |
| [docs/media-import-review.md](./media-import-review.md) | 补充历史证据时效，保留原结果 |
| [docs/media-player-development.md](./media-player-development.md) | 修订当前事实、进度或引用边界 |
| [docs/media-player-test-plan.md](./media-player-test-plan.md) | 修订当前事实、进度或引用边界 |
| [docs/media-player-test-report.md](./media-player-test-report.md) | 补充历史证据时效，保留原结果 |
| [docs/module-dev-test-plan.md](./module-dev-test-plan.md) | 修订当前事实、进度或引用边界 |
| [docs/monitoring-design.md](./monitoring-design.md) | 修订当前事实、进度或引用边界 |
| [docs/ops-runbook.md](./ops-runbook.md) | 修订当前事实、进度或引用边界 |
| [docs/performance-optimization-guide.md](./performance-optimization-guide.md) | 修订当前事实、进度或引用边界 |
| [docs/performance-test-report.md](./performance-test-report.md) | 补充历史证据时效，保留原结果 |
| [docs/project-flow.md](./project-flow.md) | 修订当前事实、进度或引用边界 |
| [docs/prototype-review.md](./prototype-review.md) | 补充历史证据时效，保留原结果 |
| [docs/quality-gates.md](./quality-gates.md) | 修订当前事实、进度或引用边界 |
| [docs/release-management.md](./release-management.md) | 修订当前事实、进度或引用边界 |
| [docs/release-readiness.md](./release-readiness.md) | 修订当前事实、进度或引用边界 |
| [docs/ruoyi-admin-backend.md](./ruoyi-admin-backend.md) | 修订当前事实、进度或引用边界 |
| [docs/security-design.md](./security-design.md) | 修订当前事实、进度或引用边界 |
| [docs/technical-architecture.md](./technical-architecture.md) | 修订当前事实、进度或引用边界 |
| [docs/technical-design.md](./technical-design.md) | 修订当前事实、进度或引用边界 |
| [docs/test-report-2026-08-20.md](./test-report-2026-08-20.md) | 补充历史证据时效，保留原结果 |
| [docs/testing-strategy.md](./testing-strategy.md) | 修订当前事实、进度或引用边界 |
| [docs/traceability-matrix.md](./traceability-matrix.md) | 修订当前事实、进度或引用边界 |
| [docs/version-baseline.md](./version-baseline.md) | 修订当前事实、进度或引用边界 |
| [e2e/README.md](../e2e/README.md) | 修订当前事实、进度或引用边界 |
| [product/README.md](../product/README.md) | 保留产品标准/原型范围，不推定验收完成 |
| [product/desktop-companion-requirements.md](../product/desktop-companion-requirements.md) | 保留产品标准/原型范围，不推定验收完成 |
| [product/feature-specification.md](../product/feature-specification.md) | 保留产品标准/原型范围，不推定验收完成 |
| [product/mvp-freeze.md](../product/mvp-freeze.md) | 保留产品标准/原型范围，不推定验收完成 |
| [product/overall-architecture.md](../product/overall-architecture.md) | 保留产品标准/原型范围，不推定验收完成 |
| [product/page-state-matrix.md](../product/page-state-matrix.md) | 保留产品标准/原型范围，不推定验收完成 |
| [product/product-requirements.md](../product/product-requirements.md) | 保留产品标准/原型范围，不推定验收完成 |
| [product/prototypes/README.md](../product/prototypes/README.md) | 保留产品标准/原型范围，不推定验收完成 |
| [product/visual-design-system.md](../product/visual-design-system.md) | 保留产品标准/原型范围，不推定验收完成 |
| [sanye_admin/README.md](../sanye_admin/README.md) | 修订当前事实、进度或引用边界 |
| [sanye_admin_server/UPSTREAM_README.md](../sanye_admin_server/UPSTREAM_README.md) | 保留上游说明，项目基线另见版本文档 |
| [sanye_client/README.md](../sanye_client/README.md) | 修订当前事实、进度或引用边界 |
| [sanye_deploy/README.md](../sanye_deploy/README.md) | 修订当前事实、进度或引用边界 |
| [sanye_pet/README.md](../sanye_pet/README.md) | 修订当前事实、进度或引用边界 |
| [sanye_server/README.md](../sanye_server/README.md) | 修订当前事实、进度或引用边界 |
| [sanye_website/README.md](../sanye_website/README.md) | 保留迁移过渡边界 |

## T-R-06 发布准备评审（2026-09-10）

已核对候选镜像入口、源码与物料摘要、固定基础镜像、配置绑定、容器健康、Nacos 身份核验和回滚材料边界。只读复核提出的配置指纹缺失、任意分支触发和可变基础镜像问题已补齐；候选工作流只发布镜像，不承担 T-R-07 的部署动作。管理后端使用根路径存活探测，不描述成数据库或登录健康。

本地 10 项门禁回归、8 项真实容器冒烟通过；最终报告与清理证据见 [T-R-06 记录](./development-tasks.md#t-r-06-执行与证据2026-09-10)。首次网关因无业务用途的 Rabbit 健康探针失败，已修正非消息服务的部署开关，保留作品/搜索探针。当前工作区被候选准备入口按预期拒绝；三个远端分支保护请求均为 HTTP 401，未验证强制合并门禁。没有固定候选构建、注册表推送、十二实例或回滚验收，状态保持待环境。

更新记录：2026-09-10，v5.16，同步任务、CI、环境、发布、部署与差距文档，执行 `pnpm docs:check`；不得以局部冒烟替代 T-R-06 完成定义。

## T-R-05 配置与审计评审（2026-09-10）

已核对业务与管理应用启动注册、移除默认敏感值、环境隔离、日志最小化和 HTTPS 默认校验。任务清单登记 291 项业务测试、23 项管理测试、8 项扫描器测试与 10 项实际 JAR 启动检查；报告路径见 [任务记录](./development-tasks.md)。HTTPS 回归使用本轮生成的自签名证书，验证不可信对端无法收到密码。Gitleaks 历史、源码和部署日志检查无规则命中；直接 JAR 检查未读取内容，明确排除该无效证据，以自定义归档扫描报告保留候选项及第三方依赖排除边界。生产配置、历史凭据是否复用及轮换确认继续待环境，不把本地验证写成正式发布完成。

更新记录：2026-09-10，v5.15，同步 T-R-05 安全规则、环境变量、任务状态与部署入口；执行 `pnpm docs:check`。

最终候选复核：`sanye_deploy/.local/tr05/final-classification.json` 绑定审计报告摘要，304 项分别归为本地默认值 102、代码/元数据 178、合成测试夹具 24，未解决字面凭据 0；全部 16 项产物候选读取归档并与源码核对。此结论仅覆盖本轮规则命中，不代表公开默认值可用于其他环境或第三方依赖完整审计通过。

## T-R-04 问题修正复评（2026-09-10）

上一轮发现问题后仍将任务标为完成，证据不足。本轮已重新打开门禁，并把空更新文案详情与筛选、Windows 路径大小写及保留名、进程树清理、对象属性与标签、identity 序列、负例精确断言和恢复后 Flyway 启动纳入最终复验。

新增 Java 回归先复现空指针，再验证缺少更新文案时无虚构排期、状态筛选正常且原始空值保留。对象读写使用锁定版本的 MinIO SDK；V2 保存 MIME 参数、响应头、自定义元数据、标签和全部序列状态，V1 仅允许只读检查。Windows 路径以真实路径和大小写规范化比较；工具失败或超时终止已记录的进程树，清理失败会导致总验收失败。SDK 网络请求也有明确时限。

恢复演练使用八个业务 schema 的真实 Flyway 历史，关闭源数据库及源 MinIO 后进行恢复，目标应用保持 Flyway 开启；负例匹配预期错误，并实测数据库导入中断后的失败报告、现场保留与停止后续步骤。配置、运维说明、待办与差距登记按最终开发任务清单同步。全部最终数字与报告以 T-R-04 修正复验记录为唯一事实源。

更新记录：2026-09-10，v5.14，复评 T-R-04 全部已发现问题的修复及完成证据，不继续沿用上一轮通过结论。

## T-R-04 独立恢复评审（2026-09-10，上一轮历史记录）

核对备份与恢复的源目标分离、整库范围、MinIO 对象与本地运行文件、文件元数据桶名映射和失败处理。修正旧单库脚本硬编码、删除原库示例及只凭备份生成判断成功的问题。子代理只读检查确认文件服务从本地目录读取，因此 MinIO 恢复不替代本地文件恢复；两者均纳入清单与摘要校验。

评审后补齐映射后元数据与文件校验、流式对象回读、数据库编码和排序规则、完成标记、路径与符号链接保护，以及 PostgreSQL 版本兼容预检。记录的凭据均为环境变量名称；报告不包含真实密码和 Token。原工作区改动保留，本次不提交或推送。

本地 `pnpm test:recovery` 9 项通过；真实隔离演练 `b0bc7ea2d5e7` 的 17 项检查通过，包含 76 项表/序列校验、对象与文件摘要、登录、内容、所有者文件读取及越权拒绝，证据见开发任务清单 T-R-04。现有内容字段为空引起的排期问题单独登记，不归入恢复脚本已修复范围。新增操作说明已登记文档地图，环境变量只在环境矩阵定义。数据恢复、应用验收、外部 CAS 与正式发布的证据保持分开。

更新记录：2026-09-10，v5.13，评审 T-R-04 实现及其验证边界；执行 `pnpm docs:check` 检查同步结果。

## T-R-03 实现评审（2026-09-09）

核对 XXL-JOB 执行器、搜索别名切换、数据库互斥、事件消费共享锁、内部接口鉴权与失败日志。源读取失败、批量错误、数量不符、不完整分页、重复作品均不能切换在线别名；配置不完整不能启动已开启的执行器。搜索与 RAG 的索引配置同步，原接口体检改为验证普通调用者被拒绝。

证据为开发任务清单 T-R-03 所列 263 项后端测试、11 项索引与权限专项、6 项 job 测试及真实调度验收脚本。真实验收使用专用数据库及索引，读取当前作品服务 9 条公开数据；调度台注册、成功/失败/恢复回调、重复触发及缺失/多余文档修复均有本地报告。测试进程退出，保留专用数据及不自动调度的任务用于复核。

追加评审：RuoYi 内嵌 XXL-JOB 管理已完成。代理接口只允许配置任务、区分三项权限、使用独立会话且不透传原始日志；触发记录审计、不自动重试。页面覆盖在线/离线/未配置/加载失败/空数据/只读/无日志权限与失败重试，并修复移动端表格撑宽。管理后端 16 项测试、前端类型检查和构建、11 项页面回归均通过；真实专用环境任务 5 日志 19/20/21 验证页面成功/失败/重试成功，匿名和无触发权限账号被拒绝。证据见 T-R-03 管理整合记录。

结论限于受控测试环境，不包含正式发布或生产配置。旧索引和失败候选保留，需要单独制定清理保留策略。

更新记录：2026-09-09，v5.12，关闭 T-R-03 管理整合缺口，依据管理测试、浏览器报告和 `pnpm docs:check`。

更新记录：2026-09-09，v5.11，评审 T-R-03 实现与证据边界；文档检查入口为 `pnpm docs:check`。
| 评审日期 | 2026-09-09 |

## 本轮规划评审（2026-09-09）

T-R-02 收口评审：任务清单 v2.7、API 契约 v0.12、数据库设计 v1.5、环境矩阵 v2.8、监控 v0.2 同步生产者、完整事件快照、消费者幂等、租约、失败补偿和指标。初始中间状态不能作为完成证据；最终以真实接口到 Outbox/RabbitMQ/ES/Redis 验收、数据库专项和未跳过覆盖率的 Maven 门禁为准。T-R-03、生产凭据、正式发布均未关闭。

本次仅评审 `development-tasks.md` v2.5 与 `development-todo.md` v0.33 的剩余任务规划。五项范围分别映射到 T-R-01、T-R-02/03、T-R-04、T-R-05、T-R-06/07；保留用户排除的第六项，未扩大成正式发布承诺。检查当前工作区、Java 事件/任务入口、CI 浏览器入口及备份脚本后补齐可复核验收、依赖、估时和环境解除条件。任务状态以开发任务清单为准，本次不生成代码测试或运行验收通过结论。文档门禁使用 `pnpm docs:check`。

## 1. 评审范围

2026-09-09 执行补充：评审本机工具链同步涉及的 `AGENTS.md`、根 README、版本基线 v0.8、CI v1.5、后端说明、技术设计和工程引导；保留 Java 17 历史证据，当前基线改为 Java 21.0.12、Node.js 26.5.0、pnpm 10.15.0、Maven 3.9.16。T-R-01 记录跨集线路修复、会话竞态修复与隔离 PostgreSQL 测试，普通测试和专项迁移分别登记，不把本地通过等同远端 CI 或正式发布。文档扫描排除 `.local` 生成目录，防止验证副本重复计数。详细命令、边界和结果见 `development-tasks.md` v2.6。

| 分组 | 文档 | 版本 | 评审结论 |
| --- | --- | --- | --- |
| 根文档 | [README.md](../README.md)、[AGENTS.md](../AGENTS.md) | - | 基本一致，索引补齐 |
| 产品 | [product-requirements.md](../product/product-requirements.md) | v0.5 | 修正 4 项 |
| 产品 | [feature-specification.md](../product/feature-specification.md) | v0.6 | 修正桌宠边界 |
| 产品 | [overall-architecture.md](../product/overall-architecture.md) | v0.3 | 角色基准，一致 |
| 产品 | [page-state-matrix.md](../product/page-state-matrix.md) | v0.2 | 一致 |
| 产品 | [mvp-freeze.md](../product/mvp-freeze.md) | v0.1 | 一致（前轮已修边界） |
| 工程 | [performance-optimization-guide.md](./performance-optimization-guide.md) | v1.0 | 性能覆盖、教学、证据与待环境边界一致 |
| 产品 | [desktop-companion-requirements.md](../product/desktop-companion-requirements.md) | v0.2 | 透明边界与启动关系已同步 |
| 产品 | [visual-design-system.md](../product/visual-design-system.md) | - | 成为视觉唯一基准 |
| 产品 | [prototypes/README.md](../product/prototypes/README.md) | - | 与原型实现一致 |
| 工程 | [development-plan.md](./development-plan.md) | v0.11 | 修正 1 项 |
| 工程 | [desktop-companion-development-plan.md](./desktop-companion-development-plan.md) | v0.2 | 实现阶段与发布门禁已同步 |
| 工程 | [technical-architecture.md](./technical-architecture.md) | v0.3 | 修正 2 项 |
| 工程 | [technical-design.md](./technical-design.md) | v0.1 | 修正 1 项 |
| 工程 | [version-baseline.md](./version-baseline.md) | v0.2 | 一致 |
| 工程 | [backend-mvp.md](./backend-mvp.md) | v0.3 | 当前实现、真实接口路径与外部边界已同步 |
| 工程 | [ruoyi-admin-backend.md](./ruoyi-admin-backend.md) | v0.1 | 现状记录一致 |
| 工程 | [project-flow.md](./project-flow.md) | v0.8 | 一致 |
| 工程 | [decision-log.md](./decision-log.md) | v0.12 | D-026 已同步 |
| 工程 | [gap-register.md](./gap-register.md) | v0.11 | AI 外部阻塞已同步 |
| 工程 | [development-todo.md](./development-todo.md) | v0.19 | Docker 中间件统一配置脚本已同步 |
| 工程 | [development-tasks.md](./development-tasks.md) | v0.2 | AI 与桌宠证据已同步 |
| 工程 | [prototype-review.md](./prototype-review.md) | v0.4 | 评审/整改闭环 |
| 工程 | [document-change-rules.md](./document-change-rules.md) | v1.0 | 文档同步与自动检查规则 |
| 工程 | [anime-import.md](./anime-import.md) | v3.0 | 搜索页简称扩展、严格标题匹配、确定性分类、窄屏封面、超时回退、双路径观看和并发导入证据已同步 |
| 工程 | [media-player-development.md](./media-player-development.md) | v1.0 | 导入集数、线路 ID、`imgUrl` 封面解析、并发读取、导入超时、站内外部预览与 ArtPlayer/HLS 实现基准已同步 |
| 测试 | [media-player-test-plan.md](./media-player-test-plan.md) | v1.1 | ArtPlayer 外壳、媒体属性、清晰度菜单、独立季度卡片和真实 HLS 断言已同步 |
| 测试 | [media-player-test-report.md](./media-player-test-report.md) | v0.9 | ArtPlayer、真实 HLS 和清晰度专项结果已登记 |
| 测试 | [desktop-companion-test-report.md](./desktop-companion-test-report.md) | v0.1 | 本地构建通过，系统验收待环境 |
| 工程 | [document-review.md](./document-review.md)（本文档） | v4.5 | 本次外部搜索双路径观看、并发导入、封面解析和真实测速后的文档一致性复查 |

## 2. 评审方法

1. 逐文档检查：文档版本、状态、更新时间；内容完整性；内部一致性；与所属目录边界（product/ 只放产品内容，docs/ 只放工程内容）的合规性。
2. 交叉引用核对：优先级（P0/P1/P2）、阶段状态、决策编号（D-001 至 D-021）、差距编号（GAP-001 至 GAP-015）、待办编号（PRE-TODO/TODO/PET-TODO）、任务编号（T-xx）、角色命名、数据库表命名。
3. 自动化检查：`pnpm docs:check` 校验全仓 Markdown 相对链接、文档地图、桌宠/AI 当前事实和过期表述；专项评审继续核对四份阶段文档、product/ 边界、任务估时/依赖/P0 覆盖。
4. 原型核对：三端原型入口、页面、状态演示与状态矩阵、冻结清单一致。

## 3. 总体结论

- 文档体系完整：产品（定位/需求/功能/架构/视觉/状态/冻结/原型）→ 工程（计划/技术架构/技术设计/任务/待办/流程/决策/差距/基线/评审）形成闭环。
- 首轮共发现并修正 12 项问题；本次复查继续修正后端状态滞后、部署说明滞后、管理端权限入口和安全边界问题。
- 整体逻辑闭环成立：每个前置门禁阶段都有对应产出与证据，外部门禁和待评审决策按预期保持开放并登记在案。
- 遗留开放项均被显式登记：GAP-003/004/005/006/007/009/011/012/013/014/015、TODO-010/011/013/014/015、技术设计后续决策和桌宠系统发布验收。

## 4. 逐文档详细评审

### 4.1 根文档

**README.md**

- 版本与状态：当前状态表述与开发待办一致（PRE-TODO-008 已完成，外部环境与发布门禁单独登记）。
- 文档索引：产品文档缺桌宠产品需求、工程文档缺桌宠开发计划 → 已补充（D-12 相关）。
- 工程结构说明与 AGENTS.md 一致。

**AGENTS.md**

- 命名规范（`sanye_` 前缀、包名、小驼峰、数据库表前缀、文档边界）与仓库实际一致；无冲突。

### 4.2 产品文档（product/）

**product-requirements.md（v0.5）**

- 完整性：定位、目标用户、场景、结构、功能、视觉、交互、状态、规则、指标完整。
- 发现的问题：
  - D-01（高）：5.2 视觉方向仍写“白色背景、青色主色”，与 [visual-design-system.md](../product/visual-design-system.md)（黄昏星轨：深夜蓝/黄昏蓝/彗星珊瑚/星光金，客户端深色默认）和原型冲突 → 已改为黄昏星轨并引用视觉设计系统。
  - D-02（高）：5.3 “Ctrl/Cmd + K 新建会话”与功能说明 PC-004（⌘K 为全局搜索入口）和原型实现（⌘K 聚焦搜索）冲突 → 已改为“全局搜索 ⌘K 聚焦，新建会话快捷键 P1 设置”。
  - D-03（低）：4.2 复制回答、反馈回答未标注 P1 → 已标注。
  - D-04（低）：6.3 “逐个比较”与作品比较 P2 裁决冲突 → 已改为“逐个查看，正式比较能力 P2”。
- 一致性确认：8.2 AI 状态表与状态矩阵第 7 节一致；AI 额度（匿名 5/登录 30）与决策 D-006 一致。

**feature-specification.md（v0.6）**

- 完整性：PC-001 至 MINE-010、ACCOUNT、FLOW、页面验收、P0/P1/P2 清单完整。
- 发现的问题：
  - D-05（低）：AI-012 剧透模式标记 P1，但“默认避免剧透”属于 P0 回答规则，未加说明 → 已补充说明并与冻结清单裁决一致。
- 范围说明：本文件只定义客户端功能；官网页面由 overall-architecture 4.2 与冻结清单定义，符合文档边界，登记不视为缺失。
- 一致性确认：HOME-009/013（搜索与仓库边界）、作品比较 P2、深色主题 P1 均与冻结清单一致。

**overall-architecture.md（v0.3）**

- 完整性：三端边界、模块优先级、主流程、管理角色、内容生命周期、MVP 范围完整。
- 角色模型（5.2 七个角色）确认为全仓唯一基准；技术架构与技术设计中的角色命名已对齐（D-06/D-10/D-11）。
- 一致性确认：MVP 范围（9.2）与冻结清单一致；发布优先级（9.1）与开发计划一致。

**page-state-matrix.md（v0.2）**

- 完整性：统一状态定义、通用跳转、客户端 7 行、官网 4 行、管理平台 9 行、AI 状态机、原型同步清单、验收标准完整。
- 一致性确认：三端矩阵行与冻结清单 P0 页面一一对应；AI 状态机与产品需求 8.2、原型演示一致。

**mvp-freeze.md（v0.1）**

- 完整性：三端 P0/P1/P2、本期不做、依赖门禁、变更规则、范围裁决完整。
- 一致性确认：作品比较 P2、剧透默认 P0 规则、任务管理 P0 范围、搜索与仓库边界均有裁决；依赖表已去除技术名词（前轮修正）。

**desktop-companion-requirements.md（v0.2）**

- 完整性：P0/P1/P2、角色状态、流程、验收和外部发布门禁完整；透明无背景、互动按钮、客户端启动自动拉起和单实例关系已冻结。

**visual-design-system.md**

- 确认为视觉唯一基准；与原型（黄昏天空/流星/亮暗主题）、修复后的需求文档一致。

**prototypes/README.md**

- 三端原型入口、页面范围、操作说明与原型实现一致（管理平台入口、AI 状态演示均已登记）。

### 4.3 工程文档（docs/）

**development-plan.md（v0.11）**

- 完整性：单人开发流程、前置门禁、阶段排期、工作量预算、质量门禁、CI/CD、风险完整。
- 发现的问题：
  - D-08（中）：4.2 “第 4 周必须完成端到端样板”与第 5 节排期（第 5 至 6 周垂直链路）冲突 → 已改为“第 6 周前”。
- 一致性确认：阶段预算与任务清单汇总（95 天 + 前置门禁 8-10 = 103-105 天）一致。

**desktop-companion-development-plan.md（v0.2）**

- 完整性：阶段工期（22 + 5 缓冲）、实现状态、具体工作、质量门禁、风险和发布门禁完整；本地核心代码已完成，Windows 兼容与安装发布待环境。

**technical-architecture.md（v0.3）**

- 完整性：技术栈、总体架构、未来边界、核心链路、组件规范、AI 要求、一致性与安全要求、环境、验收清单、决策完整。
- 发现的问题：
  - D-09（中）：5.5 核心表名未使用 `sanye_` 前缀（如 `user_account`、`anime`），违反命名规范且与技术设计 DDL 不一致 → 已统一为 `sanye_` 前缀。
  - D-10（中）：5.11 管理角色（内容运营/运维/客服）与总体架构 5.2 角色命名不一致 → 已对齐并建立代码角色映射说明。
- 一致性确认：CAS、LangChain4j、HikariCP、线程池等新增组件已登记；表名与版本基线规则一致。

**technical-design.md（v0.1）**

- 完整性：数据模型（DDL）、统一契约、分模块实现、安全、并发、分布式、缓存安全、异常降级、测试、部署、门禁、待评审决策（TD-01 至 TD-16）、自评审（SR-01 至 SR-11）、附录完整。
- 发现的问题：
  - D-11（低）：5.1.5 代码角色与产品角色名称需建立显式映射 → 已补充并与总体架构 5.2 对齐。
- 内部一致性确认：CAS（5.1、6.1）、LangChain4j 记忆/RAG（5.6.6）、线程池/连接池（7.8/7.9）、缓存安全（第 9 节）、错误码与状态矩阵附录 B 一致。

**version-baseline.md（v0.2）**

- 完整性：服务端、治理、数据中间件、任务容器、管理平台版本与锁定文件、升级规则、验证清单完整。
- 一致性确认：CAS Client、LangChain4j 已登记为 review；外部验证项 7/8 与差距登记对应。

**backend-mvp.md（v0.2）**

- 当前实现、JWT 身份边界、文件所有权和外部环境开放项已与 README、`sanye_server` 实现同步。

**ruoyi-admin-backend.md（v0.1）**

- 现状记录与 README、开发待办一致；正式环境未完成项单独登记，TODO-001 至 TODO-009 的本地联调证据已归档。

**project-flow.md（v0.8）**

- 总体流程、用户流程、发布流程与阶段状态一致（前置门禁已关闭，当前进入外部环境与发布收口）。

**decision-log.md（v0.12）**

- D-001 至 D-021 可追溯，变更规则完整；D-017 至 D-021 与产品文档、技术设计同步。

**gap-register.md（v0.11）**

- GAP-001 至 GAP-015 状态、下一步、出口标准完整；GAP-006 已统一为硅基流动 `Qwen/Qwen2.5-7B-Instruct`，HTTP 402 作为当前外部阻塞；与待办、任务、决策映射一致。

**development-todo.md（v0.11）**

- PRE-TODO-001 至 007 均有完成证据；发现的问题：
  - D-12（低）：PRE-TODO-006 状态为“进行中”但阶段已推进到 PRE-TODO-008 → 已改为“已完成（用户指示继续，后续问题另行登记）”。
- TODO-001 至 015、PET-TODO-001 至 008 与任务清单、桌宠计划对应。

**development-tasks.md（v0.2）**

- 41 个任务：估时 1-3 天、依赖可解析且无环、阶段合计 95 天、三端 P0 全覆盖，自动化验证通过（见第 6.4 节）。

**document-change-rules.md（v1.0）**

- 建立唯一事实源、变更触发矩阵、状态和证据规则；新增 `pnpm docs:check`，用于 Markdown 链接和当前桌宠/AI 事实校验。

**desktop-companion-test-report.md（v0.1）**

- 已登记桌宠类型检查和构建证据；Windows 多屏、缩放、锁屏、安装签名和 Electron 真实窗口回归仍按待环境处理。

**prototype-review.md（v0.4）**

- 评审记录、问题清单（M/N）、整改记录闭环；N-12 管理平台入口已修复。

## 5. 跨文档一致性核对

| 检查项 | 结果 |
| --- | --- |
| 阶段状态（README、开发计划、待办、项目流程） | 一致：PRE-TODO-008 已完成，当前进入外部环境与发布验收 |
| 作品比较优先级 | 全仓 P2（需求、功能、冻结、决策） |
| 深色主题优先级 | 全仓 P1 |
| 剧透模式 | 默认避免剧透为 P0 规则，设置项 P1 |
| AI 额度 | 匿名 5 次/日、登录 30 次/日（D-006） |
| 搜索与仓库边界 | 顶部搜索进结果页，仓库承担浏览全部（D-017、HOME-013） |
| 认证方案 | CAS 单点登录 + 本地会话凭证（D-020、TD-01/TD-11/TD-12） |
| AI 编排 | LangChain4j 模型/记忆/RAG（D-021、TD-14/TD-15/TD-16） |
| 角色命名 | 以总体架构 5.2 为基准，技术架构/设计已对齐 |
| 数据库表命名 | 全仓 `sanye_` 前缀（技术架构已修正） |
| 文档边界 | product/ 无 API、数据库、部署、版本技术细节（扫描通过） |
| 原型 ↔ 状态矩阵 ↔ 冻结 | 三端 P0 页面与演示全覆盖 |
| 任务清单 ↔ 计划/待办/门禁 | 汇总一致、TODO/GAP 映射完整 |

## 6. 整体逻辑闭环验证

### 6.1 前置门禁证据链

| 阶段 | 产出 | 证据 |
| --- | --- | --- |
| PRE-TODO-001 原型评审 | 评审记录 + 问题清单 + 整改 | [prototype-review.md](./prototype-review.md) |
| PRE-TODO-002 页面状态矩阵 | 三端状态矩阵 + AI 状态机 | [page-state-matrix.md](../product/page-state-matrix.md) |
| PRE-TODO-003 MVP 冻结 | 三端 P0/P1/P2 + 裁决 | [mvp-freeze.md](../product/mvp-freeze.md)、D-018 |
| PRE-TODO-004 管理平台原型 | 管理平台可交互原型 + 状态矩阵第 6 节 | [prototypes/README.md](../product/prototypes/README.md) |
| PRE-TODO-005 产品文档冻结 | 冻结基线 + 一致性核对 | [产品文档目录](../product/README.md)、D-019 |
| PRE-TODO-006 技术设计 | 实现级设计 + 自评审 + 待评审决策 | [technical-design.md](./technical-design.md)、D-020/D-021 |
| PRE-TODO-007 任务拆分 | 41 个任务 + 验证 | [development-tasks.md](./development-tasks.md) |
| PRE-TODO-008 正式编码 | 已完成 | 首个任务 T-B-01 与后续任务证据 |

### 6.2 输入输出链

```text
产品需求/功能/架构（product/）
  -> 页面状态矩阵（状态与跳转）
  -> MVP 冻结清单（范围与裁决）
  -> 交互原型（三端可操作验证）
  -> 技术设计（实现方案：安全/并发/分布式/缓存/池化）
  -> 任务清单（41 个任务与 DoD）
  -> 验收与发布（阶段 G/H/I + 门禁 GAP/G）
```

每一环的输出都是下一环的输入，且均有引用与证据；无“孤儿”文档或未登记的功能。

### 6.3 预期保持开放的缺口（闭环外登记项）

- 外部门禁：GAP-004 内容数据、GAP-005 版权、GAP-006 AI 供应商、GAP-013 法律、GAP-014 官网运营、GAP-015 CAS 认证；G-001 至 G-009。
- 管理端本地真实运行验收：TODO-001 至 TODO-009 已完成；生产凭据、Docker 和外部服务仍按 TODO-010/011/013-015 处理。
- 技术设计后续决策：TD-01 至 TD-16（不阻塞当前本地实现，按业务和环境条件关闭）。
- 桌宠 P1：PET-TODO-001 至 008（核心 MVP 稳定后执行）。

### 6.4 自动化验证结果

| 检查 | 结果 |
| --- | --- |
| Markdown 相对链接 | 全仓无断链 |
| 阶段表述一致性 | 四份阶段文档一致 |
| 任务估时 1-3 天 | 41/41 通过 |
| 任务依赖可解析、无环 | 通过 |
| 阶段合计与计划一致 | 95 天（+门禁 = 103-105） |
| 三端 P0 覆盖 | 全部覆盖 |
| product/ 文档边界 | 无技术细节泄漏 |
| 优先级冲突扫描 | 作品比较/深色主题/剧透/额度一致 |

## 7. 修复记录（2026-08-18）

| 编号 | 文档 | 问题 | 处理 |
| --- | --- | --- | --- |
| D-01 | product-requirements.md | 5.2 视觉方向与视觉设计系统冲突 | 改为黄昏星轨并引用视觉设计系统 |
| D-02 | product-requirements.md | 5.3 ⌘K 语义冲突 | 改为全局搜索聚焦，新建会话快捷键 P1 |
| D-03 | product-requirements.md | 4.2 复制/反馈未标 P1 | 标注 P1 |
| D-04 | product-requirements.md | 6.3 “逐个比较”与作品比较 P2 冲突 | 改为逐个查看，比较能力 P2 |
| D-05 | feature-specification.md | AI-012 剧透 P1 与 P0 默认规则未说明 | 补充说明并与冻结裁决一致 |
| D-06 | technical-architecture.md | 5.11 角色命名不一致 | 对齐总体架构 5.2 角色 |
| D-07 | technical-architecture.md | 5.5 表名缺 `sanye_` 前缀 | 统一前缀 |
| D-08 | development-plan.md | 4.2 “第 4 周”与排期冲突 | 改为“第 6 周前” |
| D-09 | technical-design.md | 5.1.5 代码角色与产品角色映射缺失 | 补充映射说明 |
| D-10 | README.md | 产品/工程文档索引缺桌宠两份文档 | 补充链接 |
| D-11 | development-todo.md | PRE-TODO-006 状态与阶段推进矛盾 | 标记已完成（问题后补登记） |
| D-12 | development-todo.md | 证据清单未登记全量评审 | 本文档即证据，已登记 |

另：前轮已修复并复核通过的问题包括作品比较 P1→P2、冻结清单依赖表技术名词、管理平台原型入口（N-12）、日期星期基准、FastJson2 序列化风险登记等。

## 8. 结论与维护规则

1. 整体逻辑闭环成立：产品定义 → 状态 → 冻结 → 原型 → 设计 → 任务 → 验收 → 发布证据链完整，无阻塞性文档矛盾。
2. 开放项均为显式登记的门禁、待验收或待评审事项，不构成闭环缺口。
3. 后续维护规则：任何文档变更必须同步更新版本、状态、更新时间与关联文档；产品范围变更走冻结清单第 7 节变更规则并登记决策；技术实现变更先更新技术设计再回填技术架构。

## 9. 第二轮评审（企业级文档完善，2026-08-19）

### 9.1 评审范围

新增 8 份企业级文档 + 文档体系总览重写，并对既有文档交叉引用执行一致性检查。

| 文档 | 版本 | 评审结论 |
| --- | --- | --- |
| docs/README.md（重写为文档体系总览） | v2.0 | 通过：文档地图、唯一基准、闭环模型、质量规范 |
| 安全设计 security-design.md | v1.0 | 通过：威胁模型、访问控制、输入输出、数据、密钥、审计、安全测试映射 |
| 数据库设计 database-design.md | v1.0 | 通过：schema 划分、表字典、迁移清单、ER、生命周期、SQL 规范（与迁移文件核对一致） |
| 测试策略 testing-strategy.md | v1.0 | 通过：分层、覆盖率门禁、报告体系、缺陷、回归策略 |
| 质量门禁 quality-gates.md | v1.0 | 通过：五道门禁与检查清单（对齐 AGENTS.md 与 development-plan） |
| 发布管理 release-management.md | v1.0 | 通过：版本策略、流程、检查清单、回滚、记录模板 |
| CI/CD ci-cd.md | v1.0 | 通过：与 ci.yml 实际配置一致 |
| 环境配置 environment-config.md | v2.7 | 通过：与 application*.yml、run-local.ps1、compose.yaml 和统一配置脚本核对一致 |
| 需求追溯矩阵 traceability-matrix.md | v1.0 | 通过：核心能力追溯与任务/接口/测试证据对应 |
| 版本基线 version-baseline.md | v0.3 | 通过：追加文档体系版本基线章节 |

### 9.2b 深化复核（同日追加）

- api-contract.md v0.2：追加第 13 节“接口响应示例（实测）”，示例与运行中服务返回结构逐项核对一致
  （详情/列表/配额/模型信息/偏好/收藏/SSE/管理端信封），并补齐统一错误包与 SSE 事件示例。
- ops-runbook.md：追加第 9 节实测演练记录（故障注入 21/21、备份生成、弱网状态、全量启动验证）。
- technical-design.md v0.2：补充请求链路时序图、核心状态机（内容/消息/反馈/会话）、AI 对话主链路时序图。
- module-dev-test-plan.md v0.2：补充 S10-S13 板块用例编号与回归集合（排期/官网正文/模型配置/内容 CRUD/AI 评测/故障/布局）。

### 9.2 一致性校验

- 相对链接自动校验：docs 全部 Markdown 相对引用均有效（0 断链）。
- 环境变量核对：新文档 environment-config 覆盖全部 `${ENV}` 变量（后端 40 项 + 管理端 13 项 + 前端两组）。
- 迁移核对：database-design 迁移清单与实际 V*.sql 文件一致（anime V1-V4、ai-chat V1-V7、favorite/feedback/file V1-V2、auth/job/search V1）。
- 测试证据核对：traceability-matrix 的“已完成”状态均对应 development-tasks 完成记录与测试报告数量。
- 门禁核对：quality-gates 与 AGENTS.md 提交规范、development-plan 第 16 节、ci.yml 保持一致。
- 文档边界核对：新增文档未向 product/ 写入 API/数据库/部署细节；product/ 未被修改。

### 9.3 结论

企业级文档体系闭环成立：需求（product）→ 追溯矩阵 → 设计（接口/数据/安全/环境唯一基准）→
任务与门禁 → 测试证据（单测/冒烟/E2E/体检/按钮/故障注入）→ 发布与回滚 → 运维监控 → 反馈登记。
新增文档全部登记 docs/README.md 文档地图，无阻塞性矛盾。

## 10. Docker 中间件统一配置复核（2026-08-21）

### 10.1 复核范围

- [sanye_deploy/configure-middleware.ps1](../sanye_deploy/configure-middleware.ps1)：脚本参数、Compose 启动、已有数据卷账号同步、权限配置和连接验证。
- [sanye_deploy/compose.yaml](../sanye_deploy/compose.yaml)：10 个中间件服务、宿主机端口、容器网络地址和健康检查。
- [environment-config.md](./environment-config.md)：宿主机地址、容器网络地址、用户名、密码和无认证边界。
- [sanye_deploy/README.md](../sanye_deploy/README.md)、[ops-runbook.md](./ops-runbook.md)：脚本入口、改密流程和故障处理说明。

### 10.2 复核结论

- 默认账号、密码、数据库名、宿主机端口和容器服务名与 Compose 逐项一致；MinIO 使用 `12345678` 以满足八位密码限制。
- PostgreSQL、Redis、RabbitMQ、MinIO 和 XXL-JOB MySQL 由脚本执行原地配置；Elasticsearch、Kibana、Nacos、Sentinel 的无认证状态由脚本执行 HTTP 验证。
- Nacos Console 当前唯一宿主机入口为 `http://localhost:8080/`；本机网关使用 `http://localhost:8091`，Nacos API `8848`/gRPC `9848` 仅登记为容器网络地址。
- 脚本不会删除数据卷；修改已有数据卷密码时通过 `Current*` 参数提供旧凭据，风险和回滚边界已写入部署与运维文档。
- `configure-middleware.ps1` PowerShell AST 语法检查通过；实际服务连通性验证在脚本执行记录中登记，文档自动校验继续执行。

## 11. 中间件数据导入复核（2026-08-21）

### 11.1 复核范围

- [sanye_deploy/import-middleware-data.ps1](../sanye_deploy/import-middleware-data.ps1)：业务迁移追踪、管理库初始化、ES/Redis/MinIO/Nacos/RabbitMQ/XXL-JOB 数据导入和重复执行规则。
- [sanye_deploy/nacos/](../sanye_deploy/nacos/)：共享配置和业务配置种子文件。
- `environment-config.md`、`sanye_deploy/README.md`、`ops-runbook.md`、`development-todo.md`：导入命令、数据数量、运行边界和未伪造数据说明。

### 11.2 复核结论

- Docker PostgreSQL 已实际建立 8 个业务 schema，作品 15 条、法律正文 4 条、MinIO 文件元数据 21 条；独立 `sanye_admin` 库含 2 个管理用户、92 个菜单和 Quartz 表。
- Elasticsearch `sanye_anime` 索引含 15 条作品文档；Redis 含 3 个按项目实际 key 前缀写入的首页缓存；MinIO `sanye-anime/covers/` 含 21 个封面对象。
- Nacos 已回读 COMMON_GROUP 1 条和 BUSINESS_GROUP 9 条配置；RabbitMQ 基础拓扑存在但消息为 0；XXL-JOB 管理员和执行器组存在且任务表保持 0 条。
- 导入脚本使用迁移标记、对象键和固定业务主键实现重复执行保护；管理平台带 `DROP TABLE` 的初始化 SQL 只在空库执行，已有表无标记时主动跳过并告警。
- 文档中的“动态服务注册、真实消息消费者、真实 XXL-JOB 任务和正式备份恢复演练”仍明确为运行/发布环境后续验收，不以静态种子数据冒充完成。

## 12. 作品聚合与真实 HLS 播放复查（2026-08-24）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| `player_aaaa` 配置解析 | 修复：兼容没有末尾分号的公开 JSON 配置 | `MediaImportServiceTest` 6 项媒体单测通过 |
| 无职转生片库展示 | 修复：五个篇章分别展示为独立卡片，季度顺序为第一季、第二季、第二季 Part.2、第三季、OAD；每张卡片使用独立封面和详情入口 | `e2e/e2e-media-player-live.mjs` 独立卡片与封面断言 |
| 剧集数据 | 已导入代表作品 133/136/135/128/137，分别为 23/24/12/9/1 集；电影作品 `127` 保留两条播放线路 | 公开 `GET /api/v1/anime/{id}/episodes` |
| 你的名字播放 | 作品 `127` 保留两条播放线路，客户端按正片和语言/线路展示；浏览器正片实际播放推进 | 真实 HLS Playwright 28/28、电影线路专项 2/2 |
| 真实 HLS 播放 | 6 个代表作品均渲染 ArtPlayer 和 `<video>`，清单请求、实际播放推进、媒体状态和移动端布局通过 | 真实 HLS Playwright 28/28 |
| 全量回归 | 后端 210/210、11 个 Playwright 脚本 540/540、独立按钮 425/425（套件内 420/420） | `mvn test`、`pnpm e2e:all`、`node e2e/e2e-buttons.mjs` |
| 外部边界 | 版权授权、来源条款和 CDN 持续可用性仍为 `GAP-016=blocked-external` | 外部授权凭证尚未提供 |

## 13. 正式片库与当前文档基线复查（2026-08-24）

### 13.1 复查范围

- 当前运行库、搜索索引和清理脚本：`V7__remove_demo_test_catalog.sql`、`V8__normalize_official_catalog_metadata.sql`、`cleanup-anime-test-data.ps1`、`AnimeIndexService.syncAll()`。
- 当前接口、部署、运维、发布和评测文档：`environment-config.md`、`sanye_deploy/README.md`、`ops-runbook.md`、`interface-test-report.md`、`api-contract.md`、`release-readiness.md`、`traceability-matrix.md`、`ai-evaluation.md`。
- 当前体检入口：`interface-check.ps1` 的作品列表/仪表盘断言，以及管理端失败回退数据。

### 13.2 复查结论

- 当前正式运行片库固定为 6 条：`127`《你的名字》、`133` 无职转生第一季、`136` 无职转生第二季、`135` 无职转生第二季 Part.2、`128` 无职转生第三季、`137` 无职转生 OAD；每个篇章保留独立封面和详情入口。
- PostgreSQL 当前作品数据和 Elasticsearch 当前作品索引均按 6 条正式作品记录维护；历史 V3 的 15 部种子、旧导入结果和旧测试报告仅作为有日期的历史证据保留。
- `interface-check.ps1` 已将管理端内容列表和仪表盘发布数量断言改为 6；管理端失败回退的作品统计不再显示 1286 部旧演示数量。
- 单元测试中的虚构作品夹具和媒体测试 URL 仍被测试代码隔离使用，不会进入默认运行目录、客户端白名单、管理端正式回退或 Elasticsearch 正式索引；删除这些夹具会降低单元测试覆盖，故不作为运行数据处理。

### 13.3 复查证据

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 正式作品数量 | 通过，6 条 | V7/V8 迁移、`cleanup-anime-test-data.ps1`、公开作品接口 |
| 搜索索引数量 | 通过，6 条 | `AnimeIndexService.syncAll()` 先清理旧文档再全量写入 |
| 接口体检基线 | 已同步为 6 条作品 | `interface-test-report.md`、`interface-check.ps1` |
| 文档检查 | 通过，572/572 | `pnpm docs:check` |

## 14. 清晰度选择与完整回归复查（2026-08-24）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 多码率清晰度菜单 | 通过，真实 HLS level 显示自动、720P、360P | `pnpm e2e:media-quality` 3/3 |
| 清晰度切换行为 | 通过，选择 360P 后保持 ArtPlayer 控件并请求对应子清单；不重建播放器 | `e2e/e2e-media-quality.mjs` |
| 单清晰度来源 | 通过，6 个真实来源按实际清单隐藏清晰度菜单，不伪造档位 | `e2e/e2e-media-player-live.mjs` 34/34 |
| 全量回归 | 通过，后端 210/210、全量 Playwright 548/548、套件内按钮 428/428、三端 typecheck/build 通过 | `mvn -f sanye_server/pom.xml test`、`pnpm e2e:all`、`pnpm typecheck`、`pnpm build` |
| 外部边界 | 仍为 `GAP-016=blocked-external`，版权授权、来源条款和外部播放器持续可用性未取得外部证据 | 外部授权凭证尚未提供 |

## 15. 动漫季度统一排序复查（2026-08-25）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 统一排序来源 | 通过，系列和季度顺序集中登记在正式目录，不再由页面分别硬编码 | `sanye_client/src/data/animeCatalog.ts` |
| 片库顺序 | 通过，乱序接口数据恢复为第一季、第二季、第二季 Part.2、第三季、OAD | `node e2e/e2e-season-order.mjs`，1/1 |
| 搜索顺序 | 通过，接口搜索与本地回退共用目录比较方法 | `node e2e/e2e-season-order.mjs`，1/1 |
| 编译门禁 | 通过 | 客户端 typecheck、生产构建 |

## 16. 搜索与导入性能复查（2026-08-25）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 站内搜索首屏 | 每页 50 条降为 20 条，3 秒超时且不重试；只有站内为空才查询外部候选 | `searchView.vue`、客户端 typecheck/build |
| 索引滞后 | ES 零命中或不可用时回源动漫公开目录，新导入作品不必等待全量重建 | `SearchServiceTest.zeroHitIndexFallsBackToAnimeCatalog`、search 12/12 |
| 外部搜索 | 有效结果缓存 120 秒、空结果缓存 10 秒，并发同关键词请求单飞合并 | `ExternalSearchServiceTest.cachesAndMergesConcurrentExternalSearches`、search 12/12 |
| 导入查重 | 来源和标题从全表/N+1 查询改为单条 SQL，V9 增加部分索引 | `JdbcAnimeCatalogStore`、`V9__import_lookup_indexes.sql` |
| 选集抓取与写库 | 固定 8 路线程池一次提交全部选集，剧集快照批量写入 | `MediaImportService`、`JdbcAnimeMediaStore`、anime 76/76 |
| 外部耗时 | 代码与单元测试已完成；本轮真实来源请求被站点防火墙拦截，真实耗时为待环境复测 | `Invoke-WebRequest` 防火墙响应，不登记为性能通过 |

## 17. CI 与依赖安全门禁复查（2026-08-26）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 导入降级策略 | 保留；审核链路失败时，客户端仍可调用公开 `/anime/import-url` 完成降级导入 | `importRequestView.vue`、`anime.ts`、`AnimeController` |
| 管理后端门禁 | CI 由跳过测试改为执行 `mvn test`；管理代理端点增加方法级权限契约，仪表盘要求已登录 | `.github/workflows/ci.yml`、`AdminControllerSecurityTest` |
| 浏览器回归 | CI 构建客户端并执行季度排序、电影线路和清晰度三个自包含 Playwright 脚本 | `e2e/run-ci.mjs`、`pnpm e2e:ci` |
| 依赖安全 | Vite 6.4.3、Electron 44.0.0、Element Plus 2.14.5 已升级并固定；high/critical 漏洞由 `pnpm audit --audit-level high` 阻断 | `version-baseline.md`、三端 `package.json`、`pnpm-lock.yaml`、`.github/workflows/ci.yml` |
| 外部边界 | 分支保护、镜像发布、生产凭据与正式环境部署不在本次代码验证范围，状态不变 | `ci-cd.md`、`gap-register.md` v0.18 |

## 18. CI 跨平台稳定性复查（2026-08-26）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 导入降级策略 | 保留；客户端公开 `/anime/import-url` 降级链路未修改 | `importRequestView.vue`、`anime.ts`、`AnimeController` |
| Action 运行时 | GitHub 官方 Action、pnpm Action 已升级到当前受支持主版本；Trivy Action 更新为可解析的 v0.36.0，并固定 Trivy v0.74.0 | `.github/workflows/ci.yml`、GitHub Release 标签 |
| 后端跨时区测试 | `timestamptz` 测试夹具改用明确的 `Instant`，CI 固定 UTC 执行以阻止默认时区依赖回归 | `FavoriteServiceTest`、`MAVEN_OPTS=-Duser.timezone=UTC` |
| 后端依赖安全 | 两套后端统一使用 Spring Boot 3.5.16；Spring Cloud 升级到 2025.0.3，Netty 4.1.137.Final、HttpCore 5.4.3、Commons FileUpload 1.6.0、Bouncy Castle 1.84、Apache POI 5.4.0/Commons Compress 1.27.1、Jackson 2.21.5 和 PostgreSQL JDBC 42.7.12 由父 POM 统一管理；Trivy 仅按 HIGH/CRITICAL 门槛阻断 | 两套父 `pom.xml`、`version-baseline.md`、Trivy 扫描 |
| 扫描稳定性 | Trivy 前置执行跳过测试的 Maven 构建，将两套后端及其多模块产物安装到本地仓库并缓存，避免远端 POM 解析触发 HTTP 429；Trivy 只执行漏洞扫描，密钥检查由 Gitleaks 独立负责 | `.github/workflows/ci.yml`、GitHub Actions 远端日志 |
| 外部边界 | 分支保护、镜像发布、生产凭据与正式环境部署状态不变 | `ci-cd.md`、`gap-register.md` |

## 19. 全功能性能优化复查（2026-08-26）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| 文档边界 | 通过，只记录工程实现、验证、门禁和教学，不新增产品需求、接口字段或数据库契约 | `performance-optimization-guide.md` |
| 功能覆盖 | 通过，客户端、管理端、服务端各模块、桌宠和持续门禁均有审计结论；已有实现与本轮改动分开登记 | 全功能覆盖矩阵 |
| 前端体积 | 通过，客户端 67.0/75、管理端 204.5/220、桌宠 32.0/70 KiB gzip | `pnpm perf:check` |
| 服务端逻辑 | 通过，首页单飞、公开详情、目录列表和反馈回读的行为由定向 Reactor 115 项测试覆盖 | Maven 定向 Reactor |
| 证据边界 | 通过，生产 QPS、真实 AI、外部来源和独立压测环境明确保持为待环境 | 优化指南第 5 节 |

## 更新记录

2026-09-09，v5.10：登记可靠事件实现与验收文档核对；执行 pnpm docs:check。

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-18 | v0.1 | 首轮全量文档评审 | 全量评审 |
| 2026-08-19 | v0.2 | 二轮评审：企业级文档完善与交叉引用校验 | 企业级文档完善 |
| 2026-08-21 | v0.3 | 修正桌宠透明无背景与客户端启动绑定；统一硅基流动/Qwen2.5-7B-Instruct/HTTP 402；新增文档变更规则、自动校验脚本和桌宠测试报告 | 文档一致性收口 |
| 2026-08-21 | v0.4 | 复查 Docker Compose：同步 Redis 健康检查、XXL-JOB MySQL full profile、环境变量、任务状态和 WSL 引擎外部阻塞；`pnpm docs:check` 通过 515 项 | T-B-03 配置修复与本地诊断 |
| 2026-08-21 | v0.5 | 复查 WSL2 恢复后的国内镜像拉取、full profile 健康检查和数据卷重启证据，清除旧的环境阻塞描述 | T-B-03 本地运行验收 |
| 2026-08-21 | v0.6 | 评审并登记公开媒体元数据导入与播放器文档、接口、迁移、配置、任务和外部版权差距 | T-D-08 媒体评审与实现 |
| 2026-08-21 | v0.6 | 复查 Docker 宿主机端口调整、统一中间件凭据和 MinIO 最低密码长度限制 | 端口与凭据实测 |
| 2026-08-21 | v0.7 | 复查 Redis ACL 用户与业务服务 username 配置 | Redis ACL 实测 |
| 2026-08-21 | v0.8 | 修复 Nacos 控制台端口缺失，增加 Kibana 8.17 控制台并同步 Docker 端口、镜像和健康检查文档 | Compose 配置、Nacos/Kibana HTTP 200、10 容器 healthy |
| 2026-08-21 | v0.9 | 按要求收口每个中间件仅一个宿主机端口，并同步 Nacos 单端口控制台访问地址 | Compose 端口配置与重启验证 |
| 2026-08-21 | v1.0 | 修复 MinIO/RabbitMQ 管理台不可访问，调整唯一宿主机端口并补充四个控制台入口与登录说明 | Compose 配置、HTTP 状态和管理页验证 |
| 2026-08-21 | v1.1 | 按 Nacos 3.x 默认 Console 配置恢复宿主机 `8080/` 入口，明确 API 端口仅在容器网络内使用 | Nacos Console 日志与 HTTP 验证 |
| 2026-08-21 | v1.2 | 将 XXL-JOB 管理台上下文调整为根路径，统一管理入口访问方式 | XXL-JOB 根路径 HTTP 验证 |
| 2026-08-21 | v1.3 | 复核统一中间件配置脚本、10 个服务连接矩阵、已有数据卷改密流程和文档引用 | `configure-middleware.ps1` AST、Compose 与本地中间件验证 |
| 2026-08-21 | v1.4 | 复查中间件实际数据导入脚本、数量校验、重复执行边界和 Nacos 配置种子 | `import-middleware-data.ps1` 成功执行与中间件查询结果 |
| 2026-08-21 | v1.5 | 修复 Nacos/网关端口状态、启动脚本进程保护和本机 Docker 联调边界；同步追溯与发布状态 | `run-local.ps1`、端口核对、文档自动检查 |
| 2026-08-21 | v1.6 | 复核媒体专项测试报告、接口 60/60、全量 Playwright 11 脚本和按钮报告当前计数 | 最终本地联调验证、`pnpm docs:check` |
| 2026-08-24 | v1.6 | 登记公开作品元数据导入扩展、封面多 CDN 白名单、管理端可执行 JAR 重打包和本地启动探测修复 | 5 项导入器单测、管理端/网关/动漫服务启动日志、作品导入输出 |
| 2026-08-24 | v1.7 | 复核作品批量导入结果（管理端 ID 127-140）；登记导入器单条继续处理、封面失败降级和已有封面保护；OAD 封面因来源 CDN 不可用保留为缺失状态 | `import-anime.mjs`、管理端 API、导入日志、`pnpm docs:check` |
| 2026-08-24 | v1.8 | 修复动漫服务旧动态占位路径导致的破图，增加通用占位封面并重启网关/动漫服务；复核 14 部作品发布状态、公开接口和封面 HTTP 结果 | 动漫模块 `63/63`、管理端与公开接口核对、封面 200、`pnpm docs:check` |
| 2026-08-24 | v1.9 | 将管理端 E2E 作品总量断言改为不低于初始种子基线，兼容公开作品导入和 E2E 新建数据；全量 Playwright 11 个脚本 549/549 通过 | `e2e:all`、`pnpm docs:check` |
| 2026-08-24 | v2.0 | 修复测试报告与文档地图、追溯矩阵、发布评估之间的旧基线漂移；按钮专项实测更新为 430/430，并将全量 E2E 549/549 纳入自动检查 | `node e2e/e2e-buttons.mjs`、`pnpm docs:check` |
| 2026-08-24 | v2.1 | 复查无职转生季度聚合和真实 HLS 播放；修复无分号播放器配置解析，登记 5 个代表作品、22/22 真实 HLS 专项、210/210 后端单测、563/563 全量 E2E 和 444/444 按钮体检 | `MediaImportServiceTest`、`mvn test`、`e2e-media-player-live.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v2.2 | 补齐作品 `127` 的两条媒体线路，切换不可播放线路并通过真实播放推进校验；同步季度聚合、搜索聚合和 28/28 专项证据 | `e2e-media-player-live.mjs`、管理端媒体导入接口、`pnpm docs:check` |
| 2026-08-24 | v2.3 | 复查 ArtPlayer 5.4.0 替换、HLS customType 接入、控制属性和资源销毁边界；同步播放器设计、测试计划、测试报告、任务与待办 | `e2e/e2e-media-player-live.mjs`、`pnpm --filter @sanye/sanye_client typecheck`、`pnpm docs:check` |
| 2026-08-24 | v2.4 | 按全量 Playwright 实际输出将当前按钮体检基线统一为 444/444，并同步自动文档检查入口和发布报告 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all`、`pnpm docs:check` |
| 2026-08-24 | v2.5 | 复查首页最近导入与最近更新合并规则，确认单一“最近更新”区块、导入优先和去重行为 | `homeView.vue`、`e2e-verify.mjs`、客户端 typecheck/build |
| 2026-08-24 | v2.6 | 复查首页精选推荐已切换为《你的名字》和《无职转生》，确认详情入口和封面路径 | `homeView.vue`、`e2e-verify.mjs`、客户端 typecheck |
| 2026-08-24 | v2.7 | 复查无职转生各篇章独立卡片、独立封面、搜索入口和客户端正式内容白名单；确认其他演示作品不再进入客户端内容层 | `animeRepositoryView.vue`、`searchView.vue`、`animeCatalog.ts`、客户端 typecheck |
| 2026-08-24 | v2.8 | 清理运行库中的历史演示、冒烟和 E2E 作品，正式数据基线收口为 127/128/133/135/136/137 六条记录；搜索全量重建先删除旧索引，避免残留测试文档 | `V7__remove_demo_test_catalog.sql`、`cleanup-anime-test-data.ps1`、`AnimeIndexService.syncAll()` |
| 2026-08-24 | v2.9 | 将内存回退目录和管理端失败回退同步收口为六部正式作品；修正按钮体检对 HLS 分片主动中止的误报，当前主链路 32/32、按钮 419/419、全量 Playwright 539/539；`pnpm docs:check` 通过 | `AnimeMemoryStore.java`、`contentView.vue`、`e2e-buttons.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v3.0 | 复核完整回归后的动态页面和正式片库数据基线，按钮体检更新为 428/428、全量 Playwright 更新为 548/548；保留历史记录，不回写旧版本数字 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all`、`pnpm docs:check` |
| 2026-08-24 | v3.1 | 清理 E2E 临时作品后复核正式片库，独立按钮体检 425/425、全量 Playwright 540/540（套件内按钮 420/420）；PostgreSQL 与 Elasticsearch 均保留 6 部正式作品 | `cleanup-anime-test-data.ps1`、`node e2e/e2e-buttons.mjs`、`pnpm e2e:all`、数据库/ES 查询 |
| 2026-08-24 | v3.1 | 复查并收口当前文档中的 15 部旧运行数据为 6 部正式片库；同步接口体检门槛、接口契约示例、发布/追溯/评测文档，并明确单元测试夹具与正式运行数据边界 | V7/V8 迁移、`interface-check.ps1`、`pnpm docs:check` |
| 2026-08-24 | v3.2 | 复查清晰度选择实现和测试证据，登记多码率 3/3、真实 HLS 34/34、全量 Playwright 548/548、后端 210/210 与三端构建门禁 | `e2e/e2e-media-quality.mjs`、`e2e/e2e-media-player-live.mjs`、`mvn test`、`pnpm e2e:all` |
| 2026-08-25 | v3.3 | 复查动漫系列与季度统一排序规则，登记片库和搜索乱序接口专项 2/2 与客户端编译证据 | `animeCatalog.ts`、`e2e/e2e-season-order.mjs`、客户端 typecheck/build |
| 2026-08-25 | v3.4 | 复查剧场版正片和语言线路展示，确认《你的名字》不再出现第一集、第二集文案 | `animeDetailView.vue`、电影线路专项 2/2、客户端 typecheck/build |
| 2026-08-25 | v3.5 | 复查作品元数据导入脚本可分享入口，登记位置参数 URL、交互粘贴、本地配置模板、预览模式和命令入口 | `import-anime.mjs`、`import-anime.env.example`、`pnpm test:anime-import`、`pnpm docs:check` |
| 2026-08-25 | v3.6 | 复查管理端 URL 一键导入入口，登记简介、封面和视频资源组合导入接口及前端按钮 | `AnimeUrlImportServiceTest`、`AdminAnimeController`、`contentView.vue`、管理端构建 |
| 2026-08-25 | v3.7 | 复查客户端作品导入申请入口和管理端反馈审核链路，确认客户端只提交申请、后台审核后导入 | `importRequestView.vue`、`FeedbackServiceTest`、`feedbackView.vue`、客户端/管理端类型检查 |
| 2026-08-25 | v3.8 | 复查作品导入降级策略，确认审核链路不可用时客户端可调用公开降级导入接口直通 | `AnimeController`、`anime.ts`、`importRequestView.vue`、动漫服务测试 |
| 2026-08-25 | v3.9 | 复查外部搜索候选链路，确认站内无结果时按 `yhdmtv.cc/search/index.html?keyword=` 展示候选并支持点击导入观看 | `ExternalSearchServiceTest`、`searchView.vue`、`search.ts`、搜索服务测试 |
| 2026-08-25 | v4.0 | 复查搜索框直接粘贴 `yhdmtv.cc/search/index.html?keyword=` URL 的解析链路，确认服务端会提取 `keyword` 后查询候选 | `ExternalSearchServiceTest`、搜索服务测试、客户端 typecheck/build、`pnpm docs:check` |
| 2026-08-25 | v4.1 | 复查外部搜索动态结果接口和真实多段 `/p/` 详情链接，确认重启后的直连、网关、关键词和完整 URL 输入均返回候选 | `ExternalSearchServiceTest` 10 项、Maven package、搜索服务日志、直连/网关接口实测 |
| 2026-08-25 | v4.2 | 复查 URL 导入故障修复，确认嵌套 `temLineList`、作品标题、客户端/管理端 60 秒请求超时和服务端 30 秒单页读取超时已同步 | `mvn -B -f sanye_server/pom.xml -pl sanye-server-anime -am test`、客户端/管理端 typecheck/build、网关导入实测、`pnpm docs:check` |
| 2026-08-25 | v4.3 | 复查 URL 导入集数和封面修复，确认详情页 2 集只导入 2 条、线路地址按 ID 匹配、封面不再命中站点 Logo | `MediaImportServiceTest` 9 项、`mvn -B -f sanye_server/pom.xml -pl sanye-server-anime -am test`、网关导入与剧集接口实测 |
| 2026-08-25 | v4.4 | 复查外部搜索直接观看/导入观看双路径和导入并发读取，确认直接观看不触发导入，导入后仍跳转站内播放器 | `searchView.vue`、`AnimeUrlImportService`、`MediaImportService`、anime 74 项测试、客户端 typecheck |
| 2026-08-25 | v4.5 | 修正外部候选存在时的空状态误提示；复查播放页 `imgUrl` 当前作品封面、当前页复用、2 集导入和真实导入耗时，并同步媒体设计文档版本 | `searchView.vue`、`MediaImportServiceTest` 10 项、动漫服务直连 URL 导入实测、anime 75 项测试、客户端 typecheck、`pnpm docs:check` |
| 2026-08-25 | v4.5 | 修正外部候选存在时的空状态误提示；复查播放页 `imgUrl` 当前作品封面、2 集导入和真实导入耗时，并同步媒体设计文档版本 | `searchView.vue`、动漫服务直连 URL 导入实测、客户端 typecheck、`pnpm docs:check` |
| 2026-08-25 | v4.6 | 将外部候选“直接观看”改为站内 `/watch/external` 只读预览，复用 ArtPlayer/HLS 播放器；同步预览接口契约、导入说明和媒体设计，并确认 76 项动漫测试通过 | `AnimeController`、`AnimeUrlPreviewResult`、`searchView.vue`、站内 Playwright 回归、动漫模块 surefire 报告、`pnpm docs:check` |
| 2026-08-25 | v4.7 | 复查搜索与导入性能优化，登记目录回源、外部缓存与请求合并、V9 查重索引、8 路受控抓取和剧集批量写入 | search 12/12、anime 76/76、客户端 typecheck/build、`pnpm docs:check` |
| 2026-08-26 | v4.8 | 复查 CI、管理端权限契约、浏览器安全回归和依赖漏洞门禁；确认公开导入降级策略保持不变 | `.github/workflows/ci.yml`、`AdminControllerSecurityTest`、`pnpm e2e:ci`、`pnpm audit --audit-level high` |
| 2026-08-26 | v4.9 | 登记按 AlphaFactory AiCoding 实例建立的 sanye_anime Memory OS 骨架、迁移边界、检索入口和契约初稿；明确 AlphaFactory 历史、内部路径和凭据未迁移 | `AiCoding/CONTENTS.md`、`AiCoding/MIGRATION-NOTICE.md`、`AiCoding/ledger/S001-bootstrap.md` |
| 2026-08-26 | v5.0 | 修复 CI Action 解析与 Node 运行时弃用告警，修正收藏服务测试夹具的默认时区依赖；确认公开导入降级策略未变 | `.github/workflows/ci.yml`、`FavoriteServiceTest`、`pnpm docs:check` |
| 2026-08-26 | v5.1 | 修复远端扫描发现的后端高危依赖，统一升级 Spring Boot、Jackson 和 PostgreSQL JDBC，并将 Trivy 门槛与文档统一为 HIGH/CRITICAL | 两套父 `pom.xml`、`.github/workflows/ci.yml`、Trivy 扫描、Maven 测试 |
| 2026-08-26 | v5.2 | 修复 Trivy 远端 POM 解析触发 Maven Central HTTP 429，增加 Maven 缓存预填并去除重复的 secret scanner | `.github/workflows/ci.yml`、GitHub Actions 远端日志、`pnpm docs:check` |
| 2026-08-26 | v5.3 | 修复缓存预填后远端 Trivy 识别出的后端 HIGH/CRITICAL 传递依赖，保持安全门禁强度不变 | 两套父 `pom.xml`、`version-baseline.md`、Trivy 扫描、Maven 测试 |
| 2026-08-26 | v5.4 | 复查全功能性能优化与教学文档，登记三端入口体积门禁、服务端查询/单飞优化和待环境边界 | `pnpm perf:check`、Maven 定向 Reactor、三端类型检查 |
| 2026-08-26 | v5.5 | 复查搜索结果链路，登记站内与外部并行分区展示、标题严格匹配、确定性分类、历史类型展示校正、预览/导入分类、封面回退和双路径观看 | search 15/15、anime 80/80、客户端 typecheck/build、搜索专项 Playwright 5/5 |
| 2026-08-26 | v5.6 | 复查“春物”搜索和封面链路，登记精确简称解析、无关子串排除、搜索封面立即加载、5 秒超时回退和窄屏可见性 | search 17/17、客户端 typecheck/build、搜索专项 Playwright 5/5 |
| 2026-08-26 | v5.7 | 纠正“春物”搜索语义：简称作为补充召回而非替换，正式标题结果先渐进展示，用户原词结果随后补齐且共享回源缓存；核验并替换两张失效来源封面 | search 18/18、客户端 typecheck/build、搜索 Playwright 5/5、真实外部接口与图片复测、`pnpm docs:check` |
| 2026-09-09 | v5.8 | 评审五项剩余任务规划、七个执行批次及排除边界；未登记实现或运行验收完成 | 当前源码、部署脚本、CI 与用户范围确认；`pnpm docs:check` |
| 2026-09-09 | v5.9 | 评审工具链统一和 T-R-01 实现、测试及环境证据 | 本轮任务执行记录与 `pnpm docs:check` |
更新记录：2026-09-24，安卓专项 v0.7：核对保存来源后片库无法再次打开、历史无法重新获取临时播放地址的问题；前端补重新预览入口及隔离桥接回归。`docs/android-development-plan.md` 与 `sanye_android/README.md` 保留多线路、真机验收及发行签名未完成状态，不以调试 APK 推定可对外发行。
更新记录：2026-09-24，安卓专项 v0.8：对照 PC `MediaImportService` 的选集与 `temLineList` 规则，更新安卓来源桥接契约、开发计划和任务清单；仅固定样例与隔离交互可复核，真实站点及真机发行证据仍待环境。
更新记录：2026-09-24，安卓专项 v0.9：复核 AND-08 续播失效线路会误选默认线路且错误只显示在搜索区的问题；修正安卓前端恢复与错误路径、补隔离桥接可用和不可用线路测试，开发计划及任务清单保持真机验证待环境。
