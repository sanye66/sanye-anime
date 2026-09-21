# sanye_anime 全量文档评审记录

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v5.96 |
| 文档状态 | 基线 |
| 关联文档 | [开发任务清单](./development-tasks.md)、[开发待办事项](./development-todo.md) |
| 更新时间 | 2026-09-21 |
| 评审范围 | 仓库全部 Markdown 文档（根文档、`product/`、`docs/`、`AiCoding/`）与交互原型 |

更新记录：2026-09-21，v5.96，登记交付分支 CI 三项失败的处理与证据：浏览器回归按既有分类校正语义修正（切换分类只做前端筛选，站内检索不再传 `type`），`pnpm e2e:ci` 4 个脚本全部通过；桌面回归修正 26.15.x 的 `signIf` 签名入口并在 CI 安装 Chromium，`pnpm test:desktop` 40 项（39 通过 1 跳过）；后端按 Trivy 结果升级 AMQP 客户端 5.34.0 与 Bouncy Castle 1.85，`mvn -f sanye_server/pom.xml test` 通过，详见[版本基线](./version-baseline.md) v0.12。远端复跑结果以交付分支 CI 为准，未新增生产或跨设备验收。

更新记录：2026-09-21，v5.95，登记交付基线对齐：桌面打包链维持 `electron-builder` 26.15.3/Squirrel，签名补丁记为 `patches/app-builder-lib@26.15.3.patch`（26.0.12 因 high/critical 依赖告警不满足 `pnpm audit --audit-level high`），并同步[版本基线](./version-baseline.md) v0.11 与[本地桌面专项](./local-desktop.md) v1.48；按维护者授权在 [README](../README.md) v0.4 增加 MIT 许可与第三方许可边界。依据 `package.json`、`pnpm-lock.yaml`、`sanye_desktop/package.json`、`LICENSE`、[第三方许可说明](./third-party-notices.md)、`pnpm audit --audit-level high` 与 `pnpm docs:check`。既有交付分支的 CI 工具链、Tomcat 与 AMQP 补丁结论不变，未新增业务验收。

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
