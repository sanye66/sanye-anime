# 公开媒体导入与播放器测试报告

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.26 |
| 文档状态 | 基线（历史媒体测试与当前补帧专项分别记录） |
| 关联文档 | [播放器设计](./media-player-development.md)、[功能规格](../product/feature-specification.md) |
| 更新时间 | 2026-09-21 |
| 测试日期 | 2026-08-25 |
| 测试环境 | Windows 本地联调；PostgreSQL、Redis、Elasticsearch 已就绪；CAS 使用本地 Mock；AI 使用 dev 提供者 |
| 测试范围 | 媒体导入、播放器、管理端入口、接口契约、前端构建与回归 |
| 总体结论 | 代码、清晰度选择、电影语言线路、真实 HLS 本地浏览器联调、季度独立卡片和搜索独立结果通过；真实版权授权和外部播放器持续可用性仍待 GAP-016 |

## 高刷与物理呈现（2026-09-21，VQ-31）

更新记录：2026-09-21，v1.26，执行 VQ-31 高刷与物理呈现：新增四层呈现计量与刷新边界对齐，并记录本机 60Hz 的复测与隔离对照。证据来自当前未提交工作区、Windows 本机（Intel UHD Graphics 770、当前显示 1920×1080@60Hz、`MaxRefreshRate` 75）、Playwright 1.62.1 无头 Chromium、Vite 开发服务 `http://127.0.0.1:5173` 与生产构建预览 `http://127.0.0.1:4173`，输入是本地 1920×1080 30 FPS HLS 夹具。因此**不构成真实高刷显示器、真实动漫片源、整片观感、跨显卡或桌面安装物验收**。实现口径见[播放器设计](./media-player-development.md)与[进阶计划](./player-quality-development-plan.md) 6.2.7。

### 入口与命令（VQ-31）

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:5173'
node --test e2e/high-refresh-presentation.test.cjs
```

高刷设备上按实际刷新率复跑同一入口（入口会核对实测刷新率与声明值，并把结论写入 `sanye_deploy/.local/high-refresh-presentation/report.json`）：

```powershell
$env:SANYE_DISPLAY_HZ = '120'
node --test e2e/high-refresh-presentation.test.cjs
```

入口包含两项：判定语义（四层口径、生成达标与呈现差额、物理呈现标记、窗口清空）与真实播放链路（60 目标显示时钟、120 目标的两种对齐口径）。1080p 补帧门禁用既有入口 `node --test e2e/realtime-interpolation.test.cjs`，高刷矩阵用 `node --test e2e/player-quality.test.cjs`。

### 判定语义（无 GPU 也可执行）

| 编号 | 检查 | 结果 |
| --- | --- | --- |
| VQ-31 | 四层口径 | 同一窗口分别给出源帧 30、生成帧 120（补间 90）、提交 120、呈现 60；生成帧率达标（`generationOnTarget` 为真）与呈现差额 60 是两个独立结论 |
| VQ-31 | 口径判读 | 目标高于刷新能力判为「受刷新上限约束」，目标不高于刷新能力且使用显示时钟判为「刷新对齐」，刷新未知但有呈现样本判为「计时器节拍」，没有呈现样本判为「未确认」 |
| VQ-31 | 物理呈现标记 | 每个窗口固定带 `physical: 'unverified'`，没有扫描提交证据时不得写成物理呈现已确认 |
| VQ-31 | 窗口清空 | 取走窗口后四层计数归零，半窗口计数不会跨窗口合并 |
| VQ-31 | 生成不足 | 生成帧低于目标的 96% 判为未达标，不能用提交次数替代生成能力 |

### 真实播放链路（本机 60Hz，1080p、30 FPS 源、锐化档）

| 场景 | 目标 | 生成帧率（末窗） | 提交 / 呈现（末窗） | 呈现陈旧度 P95 | 帧间隔 P95 | 跳过期时隙 | 目标档 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 默认 `refresh` 对齐 | 60 | 60 | 60 / 60 | 0ms（显示时钟） | 18.2ms | 0 | 保持 60 |
| 默认 `refresh` 对齐 | 120 | 120 | 120 / 60 | 6.5ms | 8.33ms | 0 | 保持 120 |
| 隔离对照 `deadline` | 120 | 95 | 95 / 60 | 17.3ms | 20.7ms | 26 | 末窗降档到 60 |
| 隔离对照 `deadline`（对齐前记录） | 120 | 94 | 95 / 60 | 18.2ms | 23.7ms | 31 | 末窗降档到 60 |

窗口文本口径示例：`源帧 30 · 生成帧 120（补间 120） · 提交 120 · 呈现 60（59.9Hz 上限，提交超出呈现 60）`。`realtime-interpolation` 的 1080p / 30 FPS → 120 目标锐化门禁由改动前的 111/111/96 FPS（末窗 `cadenceReason` 为「渲染帧预算不足，已稳定目标帧率」）变为 120/120/119 FPS、帧间隔 P95 恒为 8.33ms、长帧 0、跳过期时隙 0；`player-quality` 的 1080p 高刷矩阵 17 组全部通过，其中 144 目标为 146/143、165 目标为 167/164、240 目标按极帧率口径平衡到性能档后为 233/227（改动前本机 144/165 在负载窗口内降档）。

### 边界回调不交付时的回退

`e2e/worker-generations.test.cjs` 新增用例：边界回调没有到达时，交付确认计时器取消未交付的边界回调并退回按目标帧周期挂截止时间计时器；`e2e/presentation-scheduling.test.cjs` 与 `e2e/interpolation-stability.test.cjs` 的唤醒口径断言同步更新为「计时器时钟 + 刷新边界驱动提交」，其中稳定性入口要求每个绘制最多一次唤醒、不出现高频空转。

### 回归（同工作区）

`high-refresh-presentation`（2 项）、`realtime-interpolation`（4 项）、`player-quality`（4 项，含 1080p 高刷矩阵）、`presentation-scheduling`/`frame-cadence-policy`/`worker-generations`（18 项）、`interpolation-stability`、`interpolation-bypass`（9 项）、`enhancement-recovery`（6 项）、`interpolation-delay-adaptive`（5 项）、`startup-quality-timeline`（3 项）、`quality-observability`（4 项）、`quality-fluctuation`、`progress-seek-latency`（四配置）、`playback-pipeline`、`playback-experience`（2 项）、`frame-menu-state`、`anime4k-scheduling`（2 项）、`p1-playback-lifecycle`、`p2-processing-order`、`p2-gpu-pipeline`、`p2-motion-cpu`、`motion-naturalness`、`seek-performance`、`adaptation-notice`、`interpolation` 与清晰度专项 `e2e/e2e-media-quality.mjs`（4/4，生产构建预览）通过；`pnpm --filter @sanye/sanye_client typecheck` 与 `build` 通过（保留既有分块体积提示）。

边界：本机显示能力为 60Hz，120/144/165Hz 的物理呈现、整片观感、跨显卡、能耗与桌面安装物保持待环境；浏览器内的「可观察呈现」是主线程动画帧与媒体 `presentedFrames` 口径，被呈现帧陈旧度是相对刷新边界的推算值，不是高速拍摄证据。

## 画质可观测性（2026-09-21，VQ-30）

更新记录：2026-09-21，v1.25，执行 VQ-30 画质可观测性并新增专项入口。证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium、Vite 开发服务 `http://127.0.0.1:5173` 与生产构建预览 `http://127.0.0.1:4173`，输入是本地双档 HLS 夹具（640×360 低档、1280×720 高档、两秒分片）。因此**不构成真实显卡、真实动漫片源、跨网络或桌面安装物验收**。实现口径见[播放器设计](./media-player-development.md)与[进阶计划](./player-quality-development-plan.md) 6.2.6。

### 入口与命令（VQ-30）

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:5173'
node --test e2e/quality-observability.test.cjs
```

同一入口也按生产构建验证一次（先 `pnpm --filter @sanye/sanye_client build`，再用 `vite preview` 在 `4173` 提供构建产物）：

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:4173'
node --test e2e/quality-observability.test.cjs
```

入口包含四项：三项判定语义（窗口汇总与原因归纳、原因优先级、提示去重与补齐）与一项真实播放链路（大窗口升到 720P 后给高档分片加 3 秒延迟，观察自动回落到 360P）。窗口与提示数据写入 `sanye_deploy/.local/quality-observability/report.json` 并附截图 `clarity-drop.png`。

### 判定语义（无 GPU 也可执行）

| 编号 | 检查 | 结果 |
| --- | --- | --- |
| VQ-30 | 窗口汇总 | 同一窗口同时带回档位序号、高度、码率、阶梯最高档、升档需求、窗口尺寸上限、档位来源、带宽估计、`stallFrames`、`analysisWidth`、媒体等待、生效/请求增强档位与 `qualityFallbacks`；清单解析前的未知档位不写入窗口；历史窗口以 30 条为上限 |
| VQ-30 | 原因归纳 | 手动选择、记忆档位回落、播放窗口尺寸上限（上限低于阶梯最高档才成立）、带宽不足（估算带宽低于升档需求）、播放中停顿与带宽自适应依次成立；处于最高档时原因为空 |
| VQ-30 | 提示去重 | 首个可比较窗口与同一档位连续窗口不提示；自动降档提示带当前档位、最高档与原因；同一高度在回到最高档前不重复播报；最小间隔内的降档在下一窗口补齐；手动选择不提示 |
| VQ-30 | 可查询说明 | `explain()` 返回最新窗口说明加上同窗口成本证据（画质回退原因、落后帧、运动分析宽度）；没有窗口时返回空字符串由页面回退 |

### 真实播放链路（开发服务与生产构建各一次，均 4 项通过）

大窗口（1440×960）下带宽自适应先升到 720P（首窗 1280 宽），高档分片固定延迟 3 秒后画面回落到 360P：

| 指标 | 开发服务 `5173` 三次运行 | 生产构建预览 `4173` |
| --- | --- | --- |
| 窗口说明 | `当前 360P（最高 720P）：带宽自适应：估算 3.2Mb/s` | 同口径逐字一致 |
| 同窗口带宽估计 / 升档需求 | 3.225–3.238Mb/s / 3.059Mb/s | 3.229Mb/s / 3.059Mb/s |
| 同窗口落后帧 / 运动分析宽度 | 21–25 / 128 | 21 / 128 |
| 回退历史 / 档位来源 | 空数组 / `auto` | 空数组 / `auto` |
| 界面提示与窗口一致性 | 提示文案等于窗口 `summary` 前缀，可在窗口历史中找到同一条 `清晰度已调整：…` | 同 |
| 可查询说明 | 等于最新窗口 `summary`；菜单保留「自动 / 720P / 360P」，控件标签仍为「自动」 | 同 |

另在期间的一次受控观察中记录到原因切换为 `带宽不足：估算 2.9Mb/s，720P 档需 3.1Mb/s`，与同窗口「估算带宽低于升档需求」的数据一致；同一高度的去重规则保证该原因不会反复播报。

### 回归（同工作区）

`quality-observability`（4 项，开发服务与生产构建各一次）、`quality-fluctuation`（1 项）、`startup-quality-timeline`（2 项）、`progress-seek-latency`（四配置 1 项）、`interpolation-delay-adaptive`（5 项）、`interpolation-bypass`（9 项）、`enhancement-recovery`（6 项）、`realtime-interpolation`（4 项）、`playback-pipeline`（3 项）、`playback-experience`（2 项）、`frame-menu-state` 与清晰度专项 `e2e/e2e-media-quality.mjs`（4/4）通过；`pnpm typecheck` 与 `pnpm --filter @sanye/sanye_client build`（保留既有分块体积提示）通过。

负载窗口说明：`progress-seek-latency` 与 `realtime-interpolation` 的 1080p 高刷门禁在并发负载下首次运行未通过，去掉并发负载后分别复跑通过；两次失败均保留为环境相关，不作为通过证据，也不推翻该门禁在真实设备上的待验证状态。

边界：本次只验证「界面说明与同窗口数据一致」，不宣称真实网络下的降档预测准确率；生产构建预览仍是无头 Chromium 与本地夹具，真实显卡、片源、跨网络与桌面安装物保持待环境。

## 补帧延迟自适应收缩（2026-09-21，VQ-29）

更新记录：2026-09-21，v1.24，执行 VQ-29 补帧延迟自适应收缩并新增专项入口。证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium 与 Vite 开发服务 `http://127.0.0.1:5173`，输入是本地 640×360 30 FPS 12 秒 HLS 夹具（六段两秒分片、带音频）与判定模块的固定时间线，因此**不构成真实显卡、真实动漫片源、整片观感或桌面安装物验收**。实现口径见[播放器设计](./media-player-development.md)与[进阶计划](./player-quality-development-plan.md) 6.2.5。

### 入口与命令（VQ-29）

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:5173'
node --test e2e/interpolation-delay-adaptive.test.cjs
```

入口包含五项：三项判定语义（起播与加宽边界、停顿与预热窗口、收缩与播放段内恢复）与一项真实播放链路对照（固定 150ms 对自适应各跑一次，含起播、三次拖动定位与音画延迟跟随）。数据写入 `sanye_deploy/.local/interpolation-delay/`（`report.json` 为逐窗口原始样本，`summary.json` 为对照汇总）。补间层就绪判据沿用起播时间线入口的 `.sanye-realtime-interpolation-active` 标记，并同时记录渲染 Worker 自测的「首帧 → 补间层就绪」时长。

### 判定语义（无 GPU 也可复现）

| 编号 | 检查 | 结果 |
| --- | --- | --- |
| VQ-29 | 起播下限 | 30 FPS 源起播延迟为 66.67ms（= 2 个源帧间隔），低于会话上限 150ms |
| VQ-29 | 加宽边界 | 未接管呈现前按实测需要加宽且单调不减，封顶 150ms；到上限后不再变化 |
| VQ-29 | 预热窗口 | 播放段首个窗口（含起播与定位后的首帧间隔抖动）不登记压力 |
| VQ-29 | 停顿与未命中配对 | 两类窗口都只登记「下个播放段恢复余量」，本次窗口内不改变生效延迟，每次恢复只走一步 40ms |
| VQ-29 | 收缩 | 连续干净窗口且余量 ≥ 15ms、距上次变化 ≥ 1 秒时每次收缩 20ms，最终收敛到下限且不越过 |
| VQ-29 | 播放段内恢复 | 播放段内恢复同样受 1 秒冷却与上限约束，并与播放段起点恢复分开计数 |

### 固定延迟对照与自适应（同一进程、同一夹具、三次连续运行）

单位为毫秒。起播窗口受播放器元素起播抖动影响，单轮对照噪声可达几十毫秒，因此每种口径在同一进程内各跑三轮，表中数值为「每轮三次拖动中位数」再取三轮中位数：`首帧 → 补间层就绪` 取渲染 Worker 自测值，`定位后原画窗口` 为松开进度条到补间层恢复，`起播原画窗口` 为 `ready-data → interpolation-active` 入口标记。

| 指标 | 固定 150ms 对照 | 自适应 | 差值 |
| --- | --- | --- | --- |
| 首帧 → 补间层就绪（三轮中位数） | 192.9 / 211.7 / 196.6 | 114.4 / 119.5 / 116.9 | 78.5–92.2 |
| 定位后原画窗口（三轮中位数） | 262.0 / 267.6 / 257.4 | 176.1 / 181.3 / 175.1 | 82.3–86.3 |
| 起播原画窗口（三轮中位数） | 339.8 / 333.8 / 344.8 | 253.4 / 266.5 / 249.3 | 67.3–95.5 |
| 起播生效延迟（每轮） | 150 / 150 / 150 | 66.7 / 66.7 / 66.7 | — |
| 稳定段与定位后音画绝对偏差（音频节点实际值） | 0 / 0 / 0 | 0 / 0 / 0 | 门禁 ≤ 40ms |
| 正常推进的画面回跳 | 0 / 0 / 0 | 0 / 0 / 0 | 门禁为 0 |
| 未命中配对（起播 / 稳定 / 定位后） | 0 / 5 / 7；0 / 5 / 6；0 / 5 / 6 | 0 / 0 / 2；0 / 2 / 1；0 / 1 / 1 | 自适应更少 |
| 停顿帧（起播 / 稳定 / 定位后） | 0 / 0 / 0 | 0 / 0 / 0；0 / 1 / 0；0 / 0 / 0 | 同为零 |
| 合成帧数（三轮累计） | 635 / 634 / 640 | 853 / 1037 / 862 | 一致产出补间帧 |
| 输出尺寸 / 生效档位 | 640×360 / off | 640×360 / off | 相同 |

结论：起播与定位后的原画窗口都随实测需要缩短（起播生效延迟 150 → 66.7ms），音画偏差仍为 0ms，正常推进的画面回跳为 0，输出尺寸与档位不变，停顿帧与固定对照同为 0（未命中配对反而更少）。负载窗口下触发余量恢复时生效延迟按步上升（观测到 66.7 → 109.0 → 89.0ms 与载重较高时的 66.7 → 150ms），恢复造成的回退单独计为 `resumeRewinds`，只出现在已经停顿的窗口且次数不超过恢复次数；帧队列保留深度按会话上限计算，收缩只改变展示时刻，不减少可回退缓冲。

同一入口 `startup-quality-timeline`（搜索点击 → 详情 → 起播，自适应默认）三次连续运行的补间层就绪窗口为 0.23–0.29 / 0.23–0.30 / 0.26–0.28 秒，媒体时刻为 0.20–0.29 / 0.25–0.31 / 0.20–0.22 秒；该入口在同日的文档基线（2026-09-20，固定 150ms）为 0.69 / 0.32 / 0.38 秒与 0.72 / 0.34 / 0.33 秒。该入口不是同一次运行内的对照，只作为同口径观察，受控结论以上表为准。

### 回归

`interpolation-delay-adaptive`（5 项）、`quality-fluctuation`（1 项）、`interpolation-bypass`（9 项）、`progress-seek-latency`（四类配置 1 项）、`realtime-interpolation`（4 项）、`startup-quality-timeline`（2 项）与 `enhancement-recovery`（6 项）全部通过，共 28 项。`pnpm --filter @sanye/sanye_client typecheck` 通过。期间本机同时存在其他项目的开发服务，环境负载偏高；`progress-seek-latency` 与 `interpolation-bypass` 在负载窗口内首次运行时失败，去掉并发负载并修正余量恢复后复跑通过，失败窗口与复跑命令均保留在本机日志目录，不作为通过证据。

边界：本机证据为无头 Chromium 软件渲染与本地合成 HLS，真实显卡与真实动漫片源下的需要量级、长片累计漂移、跨设备窗口与桌面安装物待环境；音画同步门禁读的是音频延迟节点的实际值（延迟模型核对），不是声学或高速拍摄测量。

## 仅增强路径移入渲染 Worker（2026-09-20，VQ-28）

更新记录：2026-09-20，v1.23，执行 VQ-28 仅增强路径移入渲染 Worker 并新增专项入口。证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium 与 Vite 开发服务 `http://127.0.0.1:5173`，输入是受控 320×180 画布帧与本地 640×360 30 FPS HLS 夹具，因此**不构成真实显卡、真实动漫片源、整片观感或桌面安装物验收**。实现口径见[播放器设计](./media-player-development.md)与[进阶计划](./player-quality-development-plan.md) 6.2.4。

### 入口与命令（VQ-28）

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:5173'
node --test e2e/enhancement-thread-migration.test.cjs
```

入口包含五项：档位链路单一来源检查、“仅增强固定不补帧”的判定语义、同源同输出尺寸的五档像素对照、真实播放的主线程长任务对照，以及渲染 Worker 不可用时的回退检查。数据写入 `sanye_deploy/.local/enhancement-thread/`（`pixel-parity.json`、`playback-report.json`、`fallback-report.json`）。

### 像素对照（同源、同输出尺寸）

同一张受控源帧分别交给 anime4k.js 自带的单帧管线（与主线程 `VideoUpscaler` 使用同一套着色器与 hook 顺序）和渲染 Worker 的同一渲染器；两侧输出按 RGB 通道逐字节比较：

| 档位 | 输出尺寸 | 比较的 RGB 通道 | 最大偏差 | 不同通道 | 平均偏差 | alpha 差异 |
| --- | --- | --- | --- | --- | --- | --- |
| 性能（`Deblur_DoG`） | 320×180 | 172,800 | 0 | 0 | 0 | 4,196 个像素、最大 25/255 |
| 均衡（`Restore_CNN_S`） | 320×180 | 172,800 | 0 | 0 | 0 | 无 |
| 锐化（`Restore_CNN_M`） | 320×180 | 172,800 | 0 | 0 | 0 | 无 |
| 修复（`Restore_CNN_S`） | 320×180 | 172,800 | 0 | 0 | 0 | 无 |
| 超分 2×（`+Upscale_CNN_x2_S`） | 640×360 | 691,200 | 0 | 0 | 0 | 无 |

结论：五个档位的可见 RGB 像素与主线程路径逐字节一致，输出尺寸也一致，因此“移入 Worker”只改变执行位置。性能档的 alpha 通道存在差异（`Deblur_DoG` 本身不写 alpha，两条路径的最终装配方式不同），播放画面是不透明的视频帧，该项单独记录、不计入画质结论。

### 主线程占用对照（640×360、30 FPS、4 秒稳定窗口）

| 配置 | 长任务次数 | 最长长任务 | 主线程帧间隔中位数 | 呈现层 | 输出尺寸 |
| --- | --- | --- | --- | --- | --- |
| 原主线程路径（`enhancementPath: 'main'`、锐化） | 61 | 65ms | 66.7ms | 页面主线程 `anime4k-canvas` | 640×360 |
| 渲染 Worker（锐化） | 0 | — | 33.3ms | Worker 画布可见 | 640×360 |
| 渲染 Worker（性能） | 0 | — | 33.3ms | Worker 画布可见 | 640×360 |

Worker 场景的统计窗口一致：`enhancementOnly` 为 `true`、实际档位等于请求档位、`interpolationNeed` 为 `none`、合成帧 0、每窗跳过 15–30 次光流分析、`stallFrames` 为 0。判定语义另有单元级覆盖：`forceBypass` 在 24/30/55/60/120 FPS 共 630 个样本上始终返回“不补帧”，且没有模式变化。

### 回退与原路径保留

把渲染 Worker 模块请求置为失败后，页面回退到原 `anime4k.js` 主线程路径（`.sanye-anime4k-active` 出现、没有残留的 Worker 会话与 Worker 画布），播放不中断、无未捕获错误；`enhancementPath: 'main'` 时直接使用原路径、不创建渲染 Worker。

### 回归

`progress-seek-latency`（四类配置，其中仅增强配置由迁移前的 44 次长任务、最长 78ms 变为 0 次；进度条写入 85 次 / 86 个渲染帧）、`interpolation-bypass` 7 项、`enhancement-recovery` 6 项、`frame-menu-state`/`frame-cadence-policy`/`interpolation-stability`/`presentation-alignment`/`quality-fluctuation` 11 项、`playback-pipeline` 8 项、`p1-playback-lifecycle` 与 `seek-performance`、`startup-quality-timeline` 3 项、`playback-experience` 2 项、`player-quality` 4 项（含 1080p 高刷矩阵）、`realtime-interpolation` 4 项、`worker-generations` 5 项与 `enhancement-models` 1 项全部通过；`pnpm typecheck` 通过。

关联的测试入口调整：`progress-seek-latency` 在画质或补帧开启的场景先等待增强画布生效再采样，避免把首次点亮计入“补间层反复切换”；`playback-pipeline` 的上下文丢失用例固定 `enhancementPath: 'main'`，因为页面无法驱动渲染 Worker 持有的 OffscreenCanvas WebGL 上下文。

边界：Worker 运行期的上下文丢失路径未单独触发；本机夹具为合成帧与本地 HLS，真实显卡、真实动漫片源、跨设备与桌面安装物保持待环境。

## 起播清晰度记忆（2026-09-20，VQ-25）

更新记录：2026-09-20，v1.20，执行 VQ-25 起播清晰度记忆并扩展起播时间线用例。证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium 与 Vite 开发服务，媒体为本地双档 HLS 夹具（640×360 与 1280×720）。实现口径见[播放器设计](./media-player-development.md)与[进阶计划](./player-quality-development-plan.md) 6.2.1；真实片源、跨网络与桌面安装物保持待环境。

### 入口与窗口（VQ-25）

```powershell
pnpm --filter @sanye/sanye_client dev            # 5173，默认绑定 localhost
$env:SANYE_FRONTEND_URL = 'http://localhost:5173'
node --test e2e/startup-quality-timeline.test.cjs
```

第二个用例覆盖四类起播：冷启动（无记忆）、同地址再次起播（有记忆）、记忆过期 40 天、记忆档位分片延迟 8 秒（模拟带宽不足）。相对「点击搜索结果」的毫秒数据保存在 `sanye_deploy/.local/startup-quality/startup-quality-memory.json`（每次运行覆盖），既有基线用例仍写入 `report.json`。下表为 2026-09-20 四次连续运行的范围。

| 场景 | 播放器挂载 | 首帧 | 首帧宽度 | 升到 1280×720 | 记忆条目 |
| --- | --- | --- | --- | --- | --- |
| 冷启动（无记忆） | 169.8–196.1 | 293.6–350.5 | 640 | 2291.6–2388.0 | 写入高档 |
| 同地址再次起播（有记忆） | 100.9–190.5 | 137.2–244.7 | 1280 | 137.2–244.7 | 沿用高档 |
| 记忆过期 40 天 | 211.0–294.1 | 257.6–369.6 | 640 | 2266.5–2349.9 | 忽略并重写 |
| 记忆档位分片延迟 8 秒 | 133.5–250.2 | 2174.9–2325.0 | 640 | 本轮窗口内未升档 | 作废 |

结论：有记忆时起播直接使用上次成功的实际档位，高档与首帧同时到位（137.2–244.7ms，验收要求 ≤ 0.5 秒，冷启动约 2.29–2.39 秒）；记忆过期按无记忆处理，高档到位回到既有基线；记忆档位分片不可用时，首帧在 2000ms 回落窗口内以低档出画（2174.9–2325.0ms，未等待 8 秒高档分片）且该地址记忆被作废。四个场景页面均无未捕获错误。

存储语义由 `e2e/playback-experience.test.cjs` 的偏好用例覆盖：手动选择优先于自动记录、阶梯变化时按同高度与最近码率重匹配（命中返回新序号、找不到返回低档）、手动清除后仍可用自动记录、过期或清除后回到无记忆。

### 回归与边界（VQ-25）

同一工作区依次通过：`e2e/quality-fluctuation.test.cjs`（画质稳定性）、`e2e/progress-seek-latency.test.cjs`（进度条与定位）、`e2e/frame-menu-state.test.cjs`、`e2e/frame-cadence-policy.test.cjs`、`e2e/interpolation-stability.test.cjs`、`pnpm typecheck`、`pnpm build`。`progress-seek-latency` 与 `playback-experience` 使用 `http://127.0.0.1:5188`（Vite 以 `--host 127.0.0.1` 启动），起播时间线用例使用 `http://localhost:5173`。

边界：夹具为本地同源双档 HLS，不能替代真实 1080p+ 片源、真实带宽波动、CDN 换线与跨设备窗口降档上限；记忆只在 hls.js 路径生效，浏览器原生 HLS 回退路径没有档位阶梯。桌面安装物与物理设备复测保持待环境。

## 增强档位有界恢复（2026-09-20，VQ-26）

更新记录：2026-09-20，v1.21，执行 VQ-26 增强档位有界恢复并新增专项入口。证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium（软件渲染）与 Vite 开发服务，输入是直接投递到渲染 Worker 的合成 640×360 帧，因此**不构成真实显卡、真实动漫片源、整片观感或桌面安装物验收**。判定语义、实现决策与未覆盖项见[播放器开发设计](./media-player-development.md)与[进阶计划](./player-quality-development-plan.md) 6.2.2。

### 入口与窗口（VQ-26）

```powershell
pnpm --filter @sanye/sanye_client dev            # 5173，默认绑定 localhost
$env:SANYE_FRONTEND_URL = 'http://localhost:5173'
node --test e2e/enhancement-recovery.test.cjs
```

前 5 个用例在没有 GPU 的 Node 环境里直接驱动 `enhancementBudgetPolicy.ts`，覆盖瞬时尖峰、亚秒抖动、四分之一超预算、增强查询周期性排空、冷却窗口、稳定样本门槛、恢复失败退避与不可恢复上限；第 6 个用例把同一份判定接到真实 `interpolationRenderer.worker.ts`，以 640×360 源帧、`upscale` 请求、约 8ms 投递间隔运行 34 秒，逐窗口数据保存在 `sanye_deploy/.local/enhancement-recovery/worker-report.json`。

改动前同一驱动方式的临时探针（9 秒窗口，未保留为回归入口）记录到：640×360 的 2× 超分在 461.3ms 降到修复档、757.5ms 降到性能档，之后 9 秒内不再回到请求档位；1280×720 修复档在 450.1ms 降档。也就是说旧口径下“3 个慢帧”在亚秒内就永久改变档位。

### 判定语义（VQ-26）

| 场景 | 结果 |
| --- | --- |
| 3 帧级超预算尖峰后恢复余量 | 全部 `hold`，不降档 |
| 0.4 秒（12 样本）抖动后恢复余量 | 全部 `hold`，不降档 |
| 四分之一样本超预算 | 全部 `hold`，不构成持续压力 |
| 增强查询每 12 个样本排空一次 | 仍按第一个超预算样本计时，800ms 后降档 |
| 持续超预算（耗时或队列任一路径） | 覆盖 800ms 且样本数达标后降档一次，下一次降档需重新累积 |
| 降档后 5 秒内持续有余量 | 全部 `hold`，冷却窗口内不恢复 |
| 冷却到期后累计 3 秒 / ≥20 个余量样本 | 只产生一次 `recover`；再次恢复需重新累积 |
| 恢复后 20 秒内再次降档 | 冷却翻倍到 10 秒；时间轴重置保留退避 |
| 可恢复上限等于实际档位 | 持续有余量也不产生 `recover` |

### 渲染 Worker 窗口（VQ-26）

同一次 34 秒运行的档位变化（`sanye_deploy/.local/enhancement-recovery/worker-report.json`，共 29 个统计窗口）：

| 时刻（ms） | 变化 | 距上次变化 | 说明 |
| --- | --- | --- | --- |
| 2855.0 | upscale → restore | — | 持续预算压力降档 |
| 3742.6 | restore → fast | 887.6ms | 修复档同样持续超预算 |
| 11824.2 | fast → restore | 8081.6ms | 5 秒冷却 + 3 秒稳定窗口后有界恢复 |
| 13010.5 | restore → fast | 1186.3ms | 恢复失败 → 冷却翻倍到 10 秒 |
| 26029.6 | fast → restore | 13019.1ms | 10 秒冷却 + 3 秒稳定窗口后再次恢复 |
| 26975.4 | restore → fast | 945.8ms | 再次恢复失败 → 冷却翻倍到 20 秒 |

窗口内还断言：档位每次只升降一档、变化记录首尾相接、实际档位从未高于请求档位与可恢复上限、输出尺寸保持在 640×360 与 1280×720 之间、`qualityChange` 在上报窗口带出变化类型、回退记录同时包含降档与恢复原因、页面无未捕获错误。

### 结论与边界（VQ-26）

结论：瞬时抖动不再降档，降档只由覆盖 800ms 的持续预算压力触发；恢复只在冷却窗口与稳定样本门槛同时满足后发生，一次只升一档；恢复失败按次翻倍延长冷却（上限 60 秒），本次窗口内两次恢复失败后间隔分别拉长到 13.02 秒与 20 秒级，未出现同一档位反复升降。

边界：该夹具分辨率与软件渲染下重档位持续超出增强预算，因此“恢复后又被降档”是本环境的预期结果，用于验证退避有界；在能够持续承载请求档位的真实显卡上不会产生恢复尝试，也不能由本机结果推定。平台不提供计时器查询时降档只由增强队列积压驱动。真实动漫片源、长片观感、跨显卡与桌面安装物保持待环境。

### 回归与构建（VQ-26）

同一工作区依次通过：`e2e/quality-fluctuation.test.cjs`（画质稳定性）、`e2e/progress-seek-latency.test.cjs`（进度条与定位，四配置）、`e2e/interpolation-stability.test.cjs`、`e2e/presentation-alignment.test.cjs`、`e2e/playback-experience.test.cjs`、`e2e/frame-menu-state.test.cjs`、`e2e/frame-cadence-policy.test.cjs`、`e2e/adaptation-notice.test.cjs`、`e2e/player-quality.test.cjs`（4 项，含 1080p 高刷矩阵与重增强像素对照）、`pnpm typecheck`、`pnpm build`。`progress-seek-latency`、`presentation-alignment`、`interpolation-stability`、`playback-experience` 与 `player-quality` 使用 `http://127.0.0.1:5188` / `5187`（Vite 以 `--host 127.0.0.1` 启动），`quality-fluctuation`、`enhancement-recovery` 使用 `http://localhost:5173`。1080p 高刷矩阵必须单独串行运行：与定位测量并行时 `balanced` 档出现 113–118 FPS 的调度不足，串行复测为 120 FPS 满档通过。

## 源帧率达标跳过光流补帧（2026-09-20，VQ-27）

更新记录：2026-09-20，v1.22，执行 VQ-27 源帧率达标跳过光流补帧并新增专项入口。证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium 与 Vite 开发服务 `http://localhost:5173`，媒体为本地 60 FPS HLS 夹具（640×360、24 秒）与直接投递到渲染 Worker 的合成帧（320×180）。实现口径见[播放器设计](./media-player-development.md)与[进阶计划](./player-quality-development-plan.md) 6.2.3；真实动漫片源、跨显卡与桌面安装物保持待环境。

### 入口与窗口（VQ-27）

```powershell
$env:SANYE_FRONTEND_URL = 'http://localhost:5173'
node --test e2e/interpolation-bypass.test.cjs
```

入口共 9 项：6 项判定语义（进入窗口、滞回带、恢复、改档、丢帧与时间轴重置、隔离对照）、1 项渲染器像素对照、1 项渲染 Worker 同源对照、1 项真实播放链路。完整输出与中间报告为 `sanye_deploy/.local/interpolation-bypass/run.log`、`pixel-parity.json`、`worker-report.json`、`playback-report.json`。9 项全部通过。

真实播放链路窗口（相对第一个统计窗口，毫秒；60 FPS HLS、补帧目标 60、画质 fast）：

| 窗口 | 补帧需求 | 源帧率估计 | 跳过的光流分析 | 分析次数 | 合成帧 | 呈现时隙 | 停顿帧 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0（含判定切换） | none | 60 | 25 | 0 | 24 | 60 | 0 |
| 1017 | none | 60 | 49 | 0 | 0 | 52 | 0 |
| 2025 | none | 60 | 46 | 0 | 0 | 50 | 0 |
| 3035 | none | 60 | 45 | 0 | 0 | 49 | 0 |

判定完成后每窗仍有约 45–49 次光流分析被跳过、分析次数为 0、合成帧为 0、停顿帧为 0，`.sanye-realtime-interpolation-active` 画布保持可见；首窗的 24 个合成帧来自判定生效前的补帧窗口，保留在数据里。

### 同源对照（VQ-27）

同一 320×180 合成夹具分别以 `interpolationDemand: 'auto'`（默认）与 `'always'`（隔离对照，强制保留补帧）运行，逐窗数据在 `worker-report.json`：

| 指标 | 旁路（60 FPS 源 + 60 目标） | 隔离对照（强制补帧） |
| --- | --- | --- |
| 每窗光流分析次数 | 0 | 与上传帧数一致（13–26 次/窗） |
| 每窗合成帧 | 0 | 28–60 |
| `computeMs` | 0 | 1.8–3.9 毫秒 |
| 每帧纹理上传中位数 | 1.0（仅原帧） | 3.05（原帧 + 前向/反向运动场） |
| 呈现帧率 | 59–61 | 59–60 |

源帧率降到 24 FPS 后，窗口内恢复光流分析（14–26 次/窗）并产出 29–59 个合成帧；源帧率回到 60 FPS 后重新进入旁路。一次会话的模式变化不超过 3 次，未出现开关式抖动。判定语义另有单元级用例覆盖滞回带（51–54 FPS 对 60）、目标由 60 改为 120 再改回、每 20 个样本一次的半速丢帧与时间轴重置。

### 像素对照（VQ-27）

渲染器级像素回读（`pixel-parity.json`）：相邻两张源帧分别为 `rgb(200,60,60)` 与 `rgb(210,70,70)` 并上传真实运动场，旁路在帧窗口中点输出 `210/70/70`（与当前源帧逐字节相同），对照在该点输出 `205/65/65`（两帧之间的合成色）；相位 0 与相位 1 上，旁路与光流路径的输出逐字节一致。差异只来自“是否生成新画面”。

### 回归、构建与既有失败（VQ-27）

同一工作区依次通过：`e2e/enhancement-recovery.test.cjs`（6 项，VQ-26 判定与渲染 Worker）、`e2e/quality-fluctuation.test.cjs`（画质稳定性，30 FPS 夹具仍走补帧）、`e2e/startup-quality-timeline.test.cjs`（2 项，VQ-25 起播记忆）、`pnpm typecheck`、`pnpm build`（保留既有分块体积提示）。`e2e/player-quality.test.cjs` 四项中三项通过（刷新估计与降档恢复、1080p 修复与 2× 超分像素、双向光流边界），「1080p live quality and high-refresh matrix」一项在本机负载下未通过末窗帧率门禁（`outputFps >= requested × 0.96`，日志 `player-quality.log`）；该门禁在既有记录中同样要求单独串行运行，本次未做改动前后对照，因此只作为本机未通过项保留。

`e2e/realtime-interpolation.test.cjs` 的「live worker interpolation」一项在本机未通过：1080p、30 FPS 源、120 目标下四个窗口为 93/120/101/99 FPS（日志 `sanye_deploy/.local/interpolation-bypass/post-change-live.log`），末窗因渲染预算不足把目标降到 60。该项为既有本机失败，本轮做了改动前后对照：临时移除 VQ-27 的三处改动（`interpolationDemandPolicy` 接线、`flowUploaded` 标记与源帧间隔上报）后复跑，同样为 91/120/93/87 FPS 并同样降档，日志为同目录 `pre-change-live.log`；两版文件分别保留在 `pre-change/` 与 `post-change/` 子目录。该失败与本机后台负载相关（运行时有 IDE、浏览器与聊天客户端并行占用；该门禁在历史上也需单独串行运行），不写成 VQ-27 造成的回归，也不因本次受控窗口通过而写成该门禁已通过。

### 结论与边界（VQ-27）

结论：源帧率估计达到目标（`≥ 0.92 × 目标`）并覆盖 400ms / 6 个样本后，渲染 Worker 不再缩放源帧、投递光流分析或上传运动场，只保留增强与原帧呈现；每帧纹理上传从 3 次降到 1 次，对应窗口的分析次数与 `computeMs` 为 0，且不产出合成帧。源帧率不足时恢复补帧的代价是有界的（700ms / 8 个样本），一次会话内不出现开关式抖动。

边界：60→60 时对照本身也会产生合成帧，因此两种模式的像素差异是“最近原帧”取代“同源帧间运动补偿混合”，差值在 1/60 秒量级；没有真值样本，不宣称 PSNR/SSIM。本机夹具为合成帧与本地 HLS，真实动漫片源、跨显卡判断、桌面安装物与物理刷新呈现仍待环境；判定阈值与保持窗口由本机受控夹具校准，跨设备是否合适需在目标设备复测。

## 画质波动修正（2026-09-20）

更新记录：2026-09-20，v1.19，按用户反馈修正画质偶尔波动（VQ-24）。证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium 与 Vite 开发服务 `5173`，媒体是本地 HLS 夹具（640×360、30 FPS、30 秒十五段），经外部预览播放器以补帧 60 + 锐化播放；分辨率与真实显卡差异、整片观感保持待环境。根因与修正见[播放器设计](./media-player-development.md)。

### 复现与根因

新增 `e2e/quality-fluctuation.test.cjs`，用属性观察者与 120ms 采样记录补间层显隐、实际清晰度档位、增强档位、帧率档位、媒体事件与提示。修复前在多码率夹具的 1280×720 窗口里 13 秒出现 6 次整层切换（媒体时间约 3.2、4.3、5.6、6.8、8.0、9.1、11.2 秒），切换时刻 `readyState` 为 4、缓冲已到片尾，没有缓冲、定位或清晰度事件。

两个触发点：`receiveFrame` 把两次**被接受**帧之间超过 200ms 的间隔当作时间轴跳变并重建管线（采集或处理短暂停顿会制造该间隔）；目标时刻落在帧窗口外时停止绘制并在 250ms 后收起补间层。前者已改为按媒体时钟漂移判断（偏移至少 0.5 秒或媒体时间回退才重建），后者已改为用最近可用帧继续绘制，只有内容停止推进 800ms 才回退。

### 受控窗口

命令：

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:5173'
node --test e2e/quality-fluctuation.test.cjs
```

数据在 `sanye_deploy/.local/quality-fluctuation/report.json`：

| 阶段 | 注入 | 修复前 | 修复后 |
| --- | --- | --- | --- |
| 稳定播放 6 秒以上 | 无 | 无（该夹具在 360P 下管线跟得上） | 无整层切换、无档位变化、无缓冲事件 |
| 短时抖动 | 主线程阻塞 0.4 秒 | 出现整层切换（该注入的失败记录已保留） | 补间层保持显示，阶段内无切换事件 |
| 持续中断 | 主线程阻塞 1.5 秒 | 未单独测量 | 4 次切换记录：回退到原画后自动恢复到补间层 |

同一改动同步收紧工作单元验收：`e2e/interpolation-stability.test.cjs` 新增“亚秒级供给中断不得切换展示层”，并把持续回退用例延长到 1.5 秒；`stallFrames` 作为落后窗口的统计字段参与断言。相关回归：`e2e/seek-performance.test.cjs` 5 项、`e2e/playback-pipeline.test.cjs` 与 `e2e/p1-playback-lifecycle.test.cjs` 7 项、`e2e/progress-seek-latency.test.cjs` 1 项（四配置）、工作单元 20 项、`e2e/interpolation-stability.test.cjs` 与 `e2e/presentation-alignment.test.cjs` 2 项全部通过；`pnpm typecheck`、`pnpm build` 通过。

### 剩余边界

将渲染 Worker 单独隔离后测量：软件渲染环境下 1280×720 单次绘制提交 P95 为 35–98ms、光流往返偶发超过 1 秒，管线确实会连续停止推进超过 800ms，此时仍按设计回到原画；该量级与真实显卡差异需要在目标设备复测。持续落后期间的音画偏差未单独量化，不写成已达标。

## 进度条、定位与播放期测量（2026-09-20）

更新记录：2026-09-20，v1.18，按用户反馈修正进度条更新缓慢（VQ-22），并测量拖动定位与播放期卡顿（VQ-23）。证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium 与 Vite 开发服务 `5173`，媒体是本地 HLS 夹具（640×360、30 FPS、六段两秒分片），经外部预览播放器播放，**不构成真实 1080p+ 素材、独显/集显差异、网络未缓冲定位或桌面安装物验收**。实现口径与未解决项见[播放器设计](./media-player-development.md)，任务状态见[任务清单](./development-tasks.md)。

### 入口与窗口（VQ-22、VQ-23）

新入口 `e2e/progress-seek-latency.test.cjs` 在同一浏览器会话中依次测量四类配置：原画（`off/off`）、仅增强（`off/sharp`）、补帧（`60/off`）、补帧+增强（`60/sharp`）。每个配置先逐帧采样 3–5 秒（进度条写入时刻与宽度、`currentTime`、主线程帧间隔、长任务、`requestVideoFrameCallback` 呈现节奏、`createImageBitmap` 捕获时刻、丢帧计数），再用鼠标在进度条上做三次拖动（0.2→0.7、0.7→0.25、0.25→0.9），以松开时刻为基准记录进入定位、定位完成、补帧层恢复与原画揭示窗口，并统计分片请求数。命令：

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:5173'
node --test e2e/progress-seek-latency.test.cjs
```

数据在 `sanye_deploy/.local/progress-seek-latency/report.json` 与四个截图。四类配置均通过：进度条写入次数≈页面渲染帧数、最长静止为 0、目标位置滞后 P95 为 0、采样窗口内持续播放、无未捕获错误；开启补帧的场景没有主线程长任务。

### 进度条修复前后（VQ-22）

修复前，进度条只在媒体 `timeupdate` 上写入（实测间隔中位数约 265ms），叠加 120ms 宽度过渡后表现为“一跳一停”。同一入口、同一夹具的前后对照：

| 指标 | 修复前（补帧） | 修复后（补帧） | 修复后（原画） | 修复后（补帧+增强） |
| --- | --- | --- | --- | --- |
| 写入次数 / 采样窗口 | 18 次 / 5 秒 | 163 次 / 5 秒 | 129 次 / 3 秒 | 174 次 / 5 秒 |
| 写入次数 / 渲染帧数 | 18 / 229 | 163 / 164 | 129 / 130 | 174 / 175 |
| 写入间隔中位数 | 265.4 毫秒 | 29.1 毫秒 | 23.1 毫秒 | 27.6 毫秒 |
| 写入间隔最大值 | 268.3 毫秒 | 60.4 毫秒 | 35.1 毫秒 | 54.5 毫秒 |
| 画面静止帧 / 最长静止 | 123 帧 / 150.1 毫秒 | 0 / 0 | 0 / 0 | 0 / 0 |
| 进度条目标位置滞后 P95 | 0.3 毫秒 | 0 毫秒 | 0 毫秒 | 0 毫秒 |

第二个“仅增强”窗口的写入次数为 44 / 45 个渲染帧，写入间隔中位数 69.4ms、最大 78.1ms，静止为 0：进度条跟随该场景自身的渲染节奏，造成该节奏的主线程逐帧增强见下节（该执行位置随后由 VQ-28 移入渲染 Worker）。

### 定位时间线（VQ-23）

三次缓存命中的拖动，四类配置均只提交一次定位、没有重复分片请求，时间以松开为基准（单位毫秒）：

| 配置 | 进入定位 | 定位完成 | 补帧层恢复 | 原画揭示窗口 |
| --- | --- | --- | --- | --- |
| 原画 | 16.9、24.1、19.9 | 17.2、24.5、20.4 | 不适用 | 106.4、145.1、142.5 |
| 仅增强 | 27.9、59.3、26.6 | 31.1、59.9、27.3 | 不适用 | 160.1、182.0、160.9 |
| 补帧 | 24.1、22.4、35.0 | 24.7、22.9、35.7 | 301.8、284.1、294.8 | 122.6、101.2、126.0 |
| 补帧+增强 | 20.1、19.5、19.8 | 20.8、20.1、20.5 | 265.1、269.7、286.5 | 75.7、78.2、101.7 |

定位本身在百毫秒内完成；补帧层约 0.28–0.30 秒后恢复，这段窗口由 150ms 插值缓冲、源帧累积与光流往返构成，属于当前设计（先用原画，再恢复补帧）。缩短它需要减小插值缓冲或改变延迟模型，会同时减少前瞻余量并影响音画同步，本轮不改动并保留为待对照项。

### 播放期长任务（VQ-23）

同一窗口内，开启补帧的两类配置主线程长任务为空；仅开启画质增强、未开启补帧的配置在 3 秒内出现 44 次长任务（最长 78ms），页面主线程帧间隔中位数 66.7ms。原因是该路径的 Anime4K 由页面主线程逐帧执行；无头 Chromium 使用软件渲染会放大这一成本，但机制属于应用侧。补帧开启时增强在渲染 Worker 内执行，同一窗口没有长任务。

该机制项已由 VQ-28 处理：仅增强路径同样移入渲染 Worker，同一入口复测为 0 次长任务，见本报告“仅增强路径移入渲染 Worker（2026-09-20，VQ-28）”。本轮不把该结果写成“已在所有设备修复”，也不把无头软件渲染的绝对值外推到真实显卡。真实素材、独显与集显差异、物理高刷、网络未缓冲定位时长和桌面安装物保持待环境。

## 刷新对齐与长帧治理（2026-09-20）

更新记录：2026-09-20，v1.17，执行[画质进阶计划](./player-quality-development-plan.md)补充工作包 VQ-19～VQ-21。本节证据来自当前未提交工作区、Windows 本机、Playwright 1.62.1 无头 Chromium 与 Vite 开发服务 `5173`，输入是合成的 320×180 画布帧（无真实媒体、无摄像头），因此只覆盖调度行为与统计口径，**不构成物理高刷、真实动漫画质、跨显卡或桌面安装物验收**。任务状态见[任务清单](./development-tasks.md)，实现口径见[播放器设计](./media-player-development.md)。

### 展示对齐窗口

`node --test e2e/presentation-alignment.test.cjs`（`SANYE_FRONTEND_URL=http://127.0.0.1:5173`）通过 1 项。脚本向渲染 Worker 发送目标 60 FPS、刷新率 60Hz 的估计并持续投递源帧，窗口数据写入 `sanye_deploy/.local/presentation-alignment/alignment.json`。稳定窗口（切换刷新时钟后的后两窗）为：

| 指标 | 窗口 1 | 窗口 2 | 说明 |
| --- | --- | --- | --- |
| 刷新回调次数 | 61 | 61 | 每个刷新回调各调度一次 |
| 绘制时隙 | 61 | 61 | 每个刷新边界绘制一帧，无漏画 |
| 截止时间计时器唤醒 | 0 | 0 | 展示对齐路径不再逐帧挂计时器 |
| 跳过时隙 | 0 | 0 | 未发生追赶跳跃 |
| 实测刷新率 | 60.2Hz | 60.2Hz | 由 Worker 回调间隔中位数得出，不直接引用上报值 |
| 输出帧率 | 60 | 60 | 与目标一致 |
| 帧间隔 P95 / 最大 | 17.5 / 18.1 毫秒 | 17.9 / 18.5 毫秒 | 旧实现同口径曾出现 33.8 毫秒级交替 |
| 长帧比例 | 0 | 0 | 超过 1.5 倍目标周期的间隔占比 |
| 绘制提交 P95 / 最大 | 2.4 / 3.3 毫秒 | 5.9 / 7.4 毫秒 | 未占满 16.7 毫秒帧周期 |
| 输出尺寸 / 生效档位 | 320×180 / `off` | 320×180 / `off` | 与请求一致，调度未改动画质 |

同一脚本在编码过程中先暴露过一次真实缺陷：首版直接用逐次回调估计驱动时隙比例，实测刷新抖动让比例在 1.0 附近来回跳动，稳定窗口只画 44/60 与 41/61 个刷新。改为“比例取稳定上报刷新率、实测周期取中位数并仅纠正 5% 以上偏差”后，才得到上表的 61/61。该失败过程与原因保留在窗口数据与本节，不删除。

### 计时器路径

`node --test e2e/interpolation-stability.test.cjs` 通过 1 项，覆盖未提供刷新估计、只有截止时间计时器的路径：窗口内绘制时隙 56、计时器唤醒 73、提前唤醒 19、跳过时隙 5，帧间隔 P95 与最大值分别约 22.6 和 150.6 毫秒（含脚本刻意制造的 350 毫秒供给中断），输出尺寸与档位保持 320×180/`off`。唤醒数由“每帧一次到期唤醒 + 少量提前唤醒重排”构成，不再是旧实现约每秒上千次的 1ms 心跳；目标高于刷新能力或没有刷新估计时，精度受浏览器计时器分辨率限制，本轮不声称该路径达到展示对齐的间隔水平。

### 单元与统计口径

`node --test e2e/presentation-scheduling.test.cjs e2e/frame-cadence-policy.test.cjs e2e/worker-generations.test.cjs` 十七项通过，覆盖刷新时隙比例（含 120/144 的非整数倍刷新与半速目标）、刷新交付确认与饥饿回退、计时器跳过过期时隙、目标与刷新变化后的相位重锚、长帧比例与绘制耗时压力、旧光流与增强过载的跨会话隔离，以及暂停/跳转重置取消刷新回调与确认计时器。原 `e2e/pulse-scheduling-policy.test.cjs` 与其被测模块已由上述入口取代。

`pnpm typecheck` 与 `pnpm build` 在最终源码上通过，保留既有大分块提示。本轮没有新增运行依赖、修改产品菜单或打包桌面客户端；真实高刷显示、整片播放、跨显卡、功耗与桌面安装物保持待环境。

## 画质进阶 P3 可行性（2026-09-18）

更新记录：2026-09-18，v1.16，执行第四步 VQ-10～VQ-12。本节以 `sanye_deploy/.local/player-quality/p3/` 为证据根目录，环境为当前未提交工作区、Windows、Intel UHD 770、驱动 `32.0.101.7088`，Python 3.12.13/OpenCV 4.12.0；浏览器对照使用现有 Vite `5188`。结论是**本机候选暂不采用，P4 条件未满足**，不是将模型接入播放器或宣称全部实时验收通过。任务状态与选型条件分别见[任务清单](./development-tasks.md)和[播放器设计](./media-player-development.md)。

### 候选、许可和完整性

固定 [rife-ncnn-vulkan 20221029](https://github.com/nihui/rife-ncnn-vulkan/releases/tag/20221029)，代码提交 `a7532fc3f9f8f008cd6eecd6f2ffe2a9698e0cf7`；v4.6 权重 Git blob `70de38ecc5b6f1b63afa56108bf76911f04ce630` 已与下载文件的 `git hash-object` 结果一致。EXE SHA-256 为 `4b970319db2814c82b15fceed8193151560a676a9eb63f20d4877be77b98f44f`；权重 SHA-256 为 `f334ed2260149ce0188a6dcf049844e8b0cdd912e01cbcfb63553157d2508958`，发布包参数文件 SHA-256 为 `28df14d57a225725ee5386f52eba422488450d37c9f40800ed4f62e8ba846692`。完整清单在 `environment.json`，版本、许可来源在 `license-audit.json`。

代码为 MIT；[Practical-RIFE 历史模型清单](https://github.com/hzwer/Practical-RIFE/blob/ae0c639856a332cd1d2a297f9398cec69e3001a7/README.md)在列出 v4.6 的同一节明确写明模型链接内容适用 MIT，避免用代码许可代替权重许可。ncnn 子模块为 `b4ba207c18d3103d6df890c0e3a97b469b196b26`，其 BSD-3-Clause 和第三方条款保存在 `ncnn-LICENSE.txt`。模型、EXE、参数和 `vcomp140.dll` 合计约 16.96 MiB，不含其他运行库与通知，也不是安装包最终增量；完整发布依赖、运行库再分发和签名均未验收。

原生 stderr 确认 GPU 0 为 UHD 770，fp16 与 int8 的 packed/storage/arithmetic 特性均为 `1/1/1`，subgroup 为 32，compute/graphics/transfer 队列均可用。候选源代码启用 Vulkan、fp16 存储和打包、int8 存储，未开启 fp16 算术。不能仅由 WebGL 支持推断这些 Vulkan 条件；也未证明全部显卡兼容。

完整 ZIP 为 431,540,241 字节；首次整包下载慢且中断，API 大文件也出现连接提前结束，原始域名曾 DNS 失败。最终按 HTTP Range 取得所需 ZIP 条目并通过解压 CRC，权重另做 Git blob 校验。仅完整文件用于推理，下载失败不计作模型性能失败。首次脚本冒烟因缺输出目录而失败，保留 `smoke/report.json`；修正输出目录创建和错误证据保留后，正式运行通过。

### 同源场景与质量

`quality-final/report.json` 使用六类自生成解析纹理，输入/输出均为 256×192，每类测试 `.2/.4/.5/.6/.8` 五个时刻，各一次预运行和三个统计样本：30 次预运行、90 次统计样本均成功。每个样本记录退出码、stderr、PNG 摘要、MAE、PSNR 和全局逐通道平均 SSIM；此 SSIM 不是滑动窗口版本。`quality-final/flow-comparison/` 保存当前光流使用完全相同输入和真值的 30 张输出，Python 相同指标函数评分。

以下为 `t=.5` 的 MAE（0～255 RGB 全图平均，越低越好），不是 P2 的灰度内部区域指标：

| 场景 | 当前光流 | RIFE v4.6 | 结论 |
| --- | --- | --- | --- |
| 平移 | 0.856 | 4.106 | RIFE 更差 |
| 旋转 | 30.861 | 21.782 | RIFE 改善，仍有明显误差 |
| 形变 | 13.275 | 5.381 | RIFE 改善 |
| 遮挡 | 0.525 | 0.984 | MAE 更差，但 PSNR/SSIM 略优，指标不一致 |
| 细线 | 0.525 | 1.228 | RIFE 更差 |
| 切镜 | 9.274 | 29.707 | RIFE 更差，两者均非零误差 |

`quality-comparison.png` 按真值、当前光流、RIFE 三列排列，已检查非空、方向与颜色一致；旋转和形变中的局部扭曲减少，平移及细线出现平滑损失，切镜仍有明显混合误差。五个时间步的完整结果保留在两个指标报告中，不能据中点表推导整片或时间一致性改善。真实授权动漫的盲对照、字幕和重复/可变帧率仍待验证。

### 成本与预算

主运行 `quality-final` 从本地 14:47:36 至 14:48:58：90 次文件式 CLI 耗时 P50 为 555.92 毫秒，P95 为 623.21 毫秒；小图进程峰值工作集 258,080,768 字节，约 246.13 MiB。每次均启动新进程并加载模型，预运行只涉及系统缓存，**没有测得常驻模型预热后的纯推理成本**。

三个串行 1080p 连续实验分别在 `quality-final/`、`continuous-2/`、`continuous-3/`，均在单个 CLI 进程中将 5 张输入变为 21 张输出，文件数和 1920×1080 解码尺寸通过。耗时为 11,278.65、11,684.96、11,985.87 毫秒；三次样本的 P50 为 11,684.96 毫秒，线性分位数 P95 为 11,955.78 毫秒，仅为小样本文件式成本。峰值工作集约 1,165.79～1,166.27 MiB，不能等同显存。首次连续实验外部 PNG 写入 P50/P95 为 141.42/144.08 毫秒，输出扫描、解码和摘要合计 737.11 毫秒，二者均在 CLI 计时之外。

5 张 24 FPS 原帧覆盖四个间隔，正确 5 倍输出共 21 张，其中 16 张为中间时刻；全部实时处理应在约 166.67 毫秒的源时间内持续完成。此文件路径显然不适合直接串入播放，但不能用 11 秒文件耗时推断常驻模型必然同样慢。生产解码帧捕获、原生 IPC、上传/下载、合成同步、GPU 显存及音频时钟未测，本轮不能证明 20% 余量。因此不进入 P4，保留现有光流和原画回退。

另保留 `feasibility-20260918-full/` 的独立运行（90 个统计样本、21 张连续输出均成功，CLI P50/P95 646.16/770.59 毫秒、连续 13,187.21 毫秒）；期间另有短时光流质量导出，未将其作为独占 GPU 性能结论，也未隐藏较高成本。浏览器对照的提交/`gl.finish` 与同步读回单列，仅用于记录该实验，不宣称它与原生文件计时具有相同边界。正式主运行前后的视频源码摘要与 `environment.json` 一致。

### 复现与检查

使用具有 NumPy/OpenCV 的 Python；本轮 `PYTHONPATH` 指向 P2 已有的本地 `p2-python`，未向应用新增依赖。`$candidate` 指向本地 `p3/candidate/rife-ncnn-vulkan-20221029-windows`；每次 `$run` 必须为新的实验目录，禁止复用旧输出：

```powershell
python e2e/p3-rife-feasibility.py --self-check
python e2e/p3-rife-feasibility.py --executable "$candidate/rife-ncnn-vulkan.exe" --model "$candidate/rife-v4.6" --output $run --gpu 0 --warmup 1 --samples 3 --continuous-frames 5 --continuous-output-frames 21
node e2e/p3-flow-comparison.cjs $run http://127.0.0.1:5188
python e2e/p3-rife-feasibility.py --compare-dir "$run/flow-comparison"
node --check e2e/p3-flow-comparison.cjs
pnpm docs:check
```

工具自检、语法检查、真实推理矩阵、连续输出、同源浏览器输出和指标汇总均通过；旧目录拒绝覆盖已验证。`pnpm docs:check` 通过 1128 项、失败零项，相关文档 `git diff --check` 通过。未修改前端生产代码，未在本轮重复运行前端构建，也未打包、替换安装物、提交或推送。

## 画质进阶 P2 对照（2026-09-18）

更新记录：2026-09-18，v1.15，执行[画质进阶计划](./player-quality-development-plan.md)第三步 VQ-07～VQ-09。旧视频模块和相关测试保存在 `sanye_deploy/.local/player-quality/pre-p2/`，本节证据统一以 `sanye_deploy/.local/player-quality/` 为根目录。环境为本机 Intel UHD 770、Chromium D3D11、Vite `5188`；真实媒体沿用 P0 授权 Sintel，未引入新模型或应用依赖。

### 运动质量

`node --test e2e/p2-motion-cpu.test.cjs e2e/p2-motion-render.test.cjs` 分别比较旧版与候选的光流以及实际 GPU 中间帧。解析合成样本为 256×192，覆盖平移、两档旋转、非刚性形变、遮挡、细线和切镜；中间帧误差在固定内部区域按 0～255 灰度值计算。结果在 `p2-motion-cpu.json` 和 `p2-motion-render/report.json`，对照图 `p2-motion-render/comparison.png` 已检查。

| 场景 | 高置信错误向量数（旧→新） | 实际中间帧平均绝对误差（旧→新） | 结论 |
| --- | --- | --- | --- |
| 平移、细线 | 0→0 | 0→0 | 原有正确结果保持 |
| 6° 旋转 | 118→110 | 24.621→24.176 | 像素误差约减少 1.8% |
| 11° 旋转 | 146→133 | 42.145→42.159 | 向量筛选更严格，但像素未改善，仍有明显伪影 |
| 非刚性形变 | 38→28 | 20.955→19.669 | 像素误差约减少 6.1% |
| 遮挡 | 遮挡区高置信误判 1→0 | 1.296→1.143 | 像素误差约减少 11.7%；向量和渲染分别使用显隐与固定遮挡夹具 |
| 真正切镜 | 两版均识别 | 另由既有切镜像素门禁验证 | 不混合两场景 |

11° 旋转的可信向量覆盖率由 158/465 降至 142/465；不能把拒绝更多向量等同于该场景更好。仅收紧光度残差时，形变像素误差还略升；最终增加不平滑邻域的孤立向量拒绝，才取得上述形变与遮挡收益。扩大 LK 窗口及扩大光度校验窗口的候选未保留。真实动漫观感和整片质量没有由这组解析纹理证明。

`e2e/p2-motion-dense.py` 使用隔离目录 `p2-python/` 的 OpenCV 4.12.0、Python 3.12.13、单线程，对 Farneback 和 DIS-medium 做同类场景实验；结果为 `p2-motion-dense.json`。Farneback 在 6° 旋转为 0/484 个超过三像素的错误点，却在 11° 为 318/465；DIS 的 6° 为 0/484，但平移为 286/494。稠密结果没有套用稀疏流的置信门控，原生计时也不是浏览器计时，因此不按这些数字直接排名，不加入默认管线。这不是对所有参数或全部稠密实现的最终否定。

### GPU 资源与顺序

`node --test e2e/p2-gpu-pipeline.test.cjs` 比较 256 宽与 1080p 的原画、修复、超分；每组十帧，图像内容连续变化。旧版与候选的逐帧像素摘要一致。以下计数是 WebGL 存储定义调用，不等于驱动实际物理分配次数：

| 档位 | 存储定义调用（旧→新） | 同一组统一变量位置查询（旧→新） |
| --- | --- | --- |
| 原画 | 50→3 | 80→8 |
| 修复 | 67→11 | 104→32 |
| 超分 | 72→16 | 120→48 |

原画存储定义调用减少 94%。超分→修复→性能回退没有新增插值程序编译；清空旧尺寸池后托管纹理估算归零，重复释放不重复入池，四十帧归还后池限制为二十四帧。处理抛错后同上下文恢复、停止及重复停止通过，已跟踪纹理和程序剩余数均为零。`p2-gpu/report.json` 保存计数及逐次成本，`profiles.png` 已检查。

包含实际完成回读的 1080p 小样本预热中位成本在最终资源检查中为：原画 3.8→4.3 毫秒、修复 24.3→22.8 毫秒、超分 70.4→61.7 毫秒。早期轮次原画曾更快，超分也曾更慢；本轮只能确定调用与生命周期改进，不能声称所有档位每次都更快。

`node --test e2e/p2-processing-order.test.cjs` 对照相同 1080p 输入和相同输出尺寸：原帧增强方案先做两次增强供四个中间时刻复用，替代方案对四个输出分别增强。预处理本身约需 88.4 毫秒（修复）和 280.5 毫秒（超分）；复用方案首个输出另需约 8.6/20.5 毫秒，后续约 3.6～5.4/12.4～13.5 毫秒。逐输出增强首个输出约 55/249.8 毫秒，后续约 27.2～29/62.2～70.3 毫秒，输出像素也有差异。结果为 `p2-gpu/processing-order.json`。隔离实现包含额外上传与合成，不代表所有替代实现的成本下限；保留现有顺序，不据单帧数字推导实时帧率。

### 档位与回退

组合预算扩展为十七种：原画、性能、均衡、锐化、修复、超分各测 60/120，锐化另测 90/144/165/240/自动。`live-matrix.json` 记录所有窗口、实际目标、请求与生效档位、回退历史和托管纹理估算。

最终末两窗：60 目标各组均为 60/60；120 目标原画为 120/118，性能 120/120，均衡 119/121，锐化 121/120；修复、超分回退到性能后为 120/120。额外锐化组为 90/90、144/145、165/165、234/241，自动为 60/60。这些是 GPU 完成计数，240 仍属实验目标，不表示 60Hz 屏幕实际呈现 240 帧。

1080p 超分首先因缓存预算回退修复，必要时再因处理预算回退性能；预算估算现在包含源纹理及在途帧，但仍不是全部 GPU 显存。画质菜单选中实际的“性能”，用户偏好仍为“超分 2×”；`realtime-interpolation/quality-fallback-menu.png` 和 `quality-fallback.json` 位于同级 `.local/` 对应目录，截图已检查。栏目名称不变，不把回退后的结果标为最高档。

### 真实媒体对照

最终参考运行是 `2026-09-18T06-49-04.423Z-864/evidence.json`（`--reference pre-p2`），候选为 `2026-09-18T06-49-54.911Z-21056/evidence.json`。两者均使用 Sintel 20～35 秒、1080p、锐化、120 目标、四秒短段及三十秒持续段，市电状态见 `p2-power.json`。四场景无运行错误、越界帧为零，运行首尾源码一致，最终源码摘要为 `d309c055b0b0168d879944f57671f49a626cae62a089edd4665ea106922aa915`；比较入口校验通过，输出为 `p2-final-comparison.json`。

| 场景 | 参考完成帧率窗口 | 候选完成帧率窗口 | 相关进程 CPU 时间（参考→候选） |
| --- | --- | --- | --- |
| 冷启动 | 106、120、120 | 100、120、119 | 3,676→3,234 毫秒 |
| 预热 | 121、119、118、123 | 120、120、120、120 | 2,146→1,620 毫秒 |
| 三十秒持续 | 稳定窗约 120，循环窗 103、103 | 稳定窗 118～122，循环窗 102、87 | 13,607→12,068 毫秒 |
| 主线程干扰 | 102、119、121 | 97、107、121 | 2,718→3,368 毫秒 |

本轮持续段 CPU 时间约减少 11%，但干扰段增加约 24%，不能写成所有负载下均提速。持续段二十八个完整窗口中只有二十六个达到目标的 96%，约 92.9%，仍未满足 95% 的建议门槛。较差循环窗口同时出现输入丢弃和约 54 毫秒的光流往返 P95；干扰窗口往返约 79 毫秒，帧间隔 P95 约 16.4 毫秒，均保留待进一步定位，不能用稳定窗口覆盖。

候选持续段托管纹理维持二十四个，约 66.4MB，累计仅二十四次存储定义、超过两千次内容更新；这是渲染器所管理纹理的估算，不是整个进程或 GPU 显存。较早的纯残差候选对照 `2026-09-18T06-32-49.112Z-27556`、`2026-09-18T06-33-39.613Z-37852` 及 `p2-comparison.json` 也保留，不能替代最终新增邻域检查后的结果。

### 验证入口

首轮串行浏览器／GPU 专项十四项通过；加入最终邻域检查后，受影响的运动、播放器、生命周期和十七组合专项十二项再次全部通过，资源与处理顺序实现没有继续修改。命令、日志如下：

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:5188'
Remove-Item Env:SANYE_QUALITY_CASE -ErrorAction SilentlyContinue
node --test --test-concurrency=1 e2e/player-quality.test.cjs e2e/realtime-interpolation.test.cjs e2e/motion-naturalness.test.cjs e2e/interpolation-stability.test.cjs e2e/p1-playback-lifecycle.test.cjs e2e/p2-motion-render.test.cjs
node --test e2e/frame-cadence-policy.test.cjs e2e/pulse-scheduling-policy.test.cjs e2e/worker-generations.test.cjs e2e/frame-menu-state.test.cjs e2e/p2-motion-cpu.test.cjs
```

上面的第二条命令包含当时存在的 `e2e/pulse-scheduling-policy.test.cjs`；该入口于 2026-09-20 由 `e2e/presentation-scheduling.test.cjs` 取代，此处保留当日实际执行的命令与结果。

日志为 `p2-regression.log`、`p2-final-regression.log`、`p2-unit.log`；第二条最终十二项通过。120 FPS 短时末两窗均为 120，真实间隔 P95 为 11.5、11.9 毫秒，原 118 FPS／13 毫秒门槛未降低。`pnpm typecheck`、`pnpm build` 通过，最终视频模块修改后客户端构建再次通过；保留已有分块体积提示。没有打包、安装或发布桌面客户端，跨设备、真实高刷、整片和二维日漫专项仍待环境。

`pnpm docs:check` 通过 1128 项、失败零项；计划、任务、设计、测试计划、报告、评审和文档地图已同步。`p2-manifest.json` 固定本轮运行时代码与测试入口摘要，实验依赖及媒体仍在忽略的本地证据目录。

## 画质进阶 P1 对照（2026-09-18）

更新记录：2026-09-18，v1.14，执行[画质进阶计划](./player-quality-development-plan.md)第二步 VQ-04～VQ-06。本节使用第一步同一授权媒体与本机环境，比较调度和恢复行为，不包含画质算法、RIFE、桌面打包或物理高刷交付。

修改前原文件保存在 `sanye_deploy/.local/player-quality/pre-p1/`，包含三个策略及渲染文件、接口、测试和相关文档；`hash-index.json` 登记主要源文件摘要。基线工具改为自动登记 `src/video` 下全部 TypeScript 文件，候选新增调度策略也参与运行首尾指纹；对照输出补充实际目标、帧间隔、迟到、心跳及消息调用数和归一化 CPU。

本轮原实现对照为 `2026-09-18T03-41-57.002Z-34032/evidence.json`，命令如下，运行首尾源码一致，四类场景无错误：

```powershell
node e2e/player-quality-baseline.mjs run --sample sintel-trailer-action --target 120 --profile sharp --seconds 4 --sustained-seconds 30 --power ac
```

冷启动为 89、120、121 FPS，预热段为 107、118、118、120 FPS；三十秒持续段二十九窗，低值包括 106、103、103、101 FPS，并保留一次 129 FPS 的完成计数波动。持续段相关进程 CPU 约 40,147 毫秒，十二逻辑核归一化约 11.14%；干扰段为 111、120、120 FPS。完成查询的单窗计数可能受跨窗查询回收影响，不将高于目标的单窗数值直接解释为更平稳的实际呈现。

首轮有界候选未通过既有短时门禁：真实帧间隔 P95 出现约 15.5～16.3 毫秒，末段完成帧率低于 118 FPS。观测副本和当时策略文件保存在 `p1-bounded-live-initial/`，保留该失败，不能因消息任务数下降就写成高刷优化成功。以下最终验证须独立满足原有帧率及间隔检查。

设备持久化评估见[播放器设计](./media-player-development.md)。受控测试将 `localStorage` 和 `sessionStorage` getter 设为抛出 `SecurityError`，连续两次启动、采样和停止补帧均成功且无运行错误，证据为 `pre-p1/storage-denied.json`。该验证仅证明当前会话播放不依赖设备配置存储，不代表跨会话硬件能力缓存已经实现。

### 同源对照与取舍

基线工具新增 `--reference pre-p1`，直接从只读源码副本加载旧管线，通过 Vite 的文件访问入口解析原来的相对 Worker 依赖；无需覆盖当前工作区或切换分支。证据同时登记实际参考目录及逻辑文件摘要，缺失参考目录在启动浏览器前报错。相邻对照的旧版运行是 `2026-09-18T04-20-59.642Z-13204/evidence.json`，候选包括 `2026-09-18T04-22-07.862Z-31308` 和 `2026-09-18T04-25-53.280Z-21832`，均保留完整原始数据，未剔除较差窗口。

最终源码与构建收口后的运行是 `2026-09-18T04-37-48.973Z-8124/evidence.json`，源码摘要为 `f6ccebb014384fc05af6711e1ef293423558b1442b1eeafc9f337a053e24515f`，运行首尾一致，四类场景无错误且越界帧为零。运行前 Windows 接口再次确认市电供电，证据为 `p1-power.json`。对照入口校验通过，完整输出为 `p1-comparison.json`。

以下比较最终运行与上述旧版：均为相同输入、尺寸、目标和阶段参数下的浏览器相关进程 CPU 时间，包含 Worker 所属渲染进程与 GPU 进程；不把等待经过时间当成 CPU 时间：

| 场景 | 旧版 CPU 时间 | 候选 CPU 时间 | 变化 |
| --- | --- | --- | --- |
| 冷启动 | 5,618 毫秒 | 4,604 毫秒 | 约减少 18% |
| 预热后 | 5,632 毫秒 | 4,105 毫秒 | 约减少 27% |
| 持续三十秒 | 41,584 毫秒 | 30,075 毫秒 | 约减少 28% |
| 主线程干扰 | 6,309 毫秒 | 5,105 毫秒 | 约减少 19% |

持续段十二逻辑核归一化 CPU 从约 11.54% 降至 8.35%。最终预热窗口为 120、120、120、119 FPS，持续段非循环恢复窗口为 118～122 FPS，两个循环恢复窗口为 102、103 FPS，旧版两个对应低值为 99 FPS。最终持续段各窗帧间隔 P95 的中位数约为 11 毫秒，旧版约为 9.1 毫秒；最大单窗 P95 为 13.7 毫秒，旧版为 10.5 毫秒。这是降低忙轮询后的实际代价，不能写成所有帧间隔都改善。较早两个候选的持续段 CPU 约为 32,458 和 31,753 毫秒，同样保留，不将本机单轮约 28% 的结果作为所有机器的固定收益。

此段候选仍只有 27/29 个完整窗口达到目标的 96%，约 93.1%，没有满足计划的 95% 建议门槛。P1 的结论是本机调度成本改善、原有短时门禁及高刷功能回归通过；不能据此关闭循环恢复、整片、全设备及物理显示验收。当前显示器仍为 60Hz，所有 120～240 FPS 数字均为 GPU 完成口径。

调参失败保存在 `p1-bounded-live-initial/`、`p1-probe-one-second-failed.json`、`p1-readback-every-frame-failed.json` 和 `p1-suite-startup-117-failed.json`。`p1-gl-finish-probe.json` 显示仅调用 `gl.finish` 没有提供足够等待，未采用；逐帧回读曾出现 116 FPS，最终改为仅在必要脉冲和不高于 120 目标时隔帧回读，保留高目标的异步完成路径。仅有周期探测的中间候选 `2026-09-18T04-09-10.395Z-4144` 持续段 CPU 约 40,789 毫秒，未取得明显成本收益，同样保留。

### 最终验证

`node --test e2e/frame-cadence-policy.test.cjs e2e/pulse-scheduling-policy.test.cjs e2e/worker-generations.test.cjs` 十项通过，覆盖升降档恢复、冷却、混合计时器、无脉冲探测、有限任务以及旧光流、旧缩放和增强过载计数的跨会话隔离。其中脉冲入口 `e2e/pulse-scheduling-policy.test.cjs` 于 2026-09-20 由刷新对齐入口 `e2e/presentation-scheduling.test.cjs` 取代，上述命令与结果保留为当日记录。

设置 `SANYE_FRONTEND_URL=http://127.0.0.1:5188` 并清除 `SANYE_QUALITY_CASE` 后，执行 `node --test --test-concurrency=1 e2e/realtime-interpolation.test.cjs e2e/frame-menu-state.test.cjs e2e/interpolation-stability.test.cjs e2e/player-quality.test.cjs e2e/p1-playback-lifecycle.test.cjs`，最终十一项全部通过。完整日志为 `p1-final-regression.log`；保留前一轮十项中一项失败及其独立复测记录，没有降低 118 FPS 或帧间隔 P95 小于 13 毫秒的门槛。

最终短时 1080p 锐化末两窗为 120、119 FPS，实际帧间隔 P95 为 11.4、9.2 毫秒。七种帧率与画质组合通过，覆盖 120、144、165、240、自动及修复/超分回退；像素检查保留原尺寸、运动中间帧、细线、遮挡、切镜、颜色方向与异常释放。`p1-lifecycle/report.json` 覆盖存储被禁用、旧捕获延迟失败、隐藏恢复、倍速、循环、切源和停止；隐藏及异常事件为受控触发，不冒充真实系统挂起或显卡驱动故障。桌面与移动播放器截图已检查，画面非空。

`pnpm typecheck`、`pnpm build` 通过，最终客户端构建再次通过，日志为 `p1-client-build.log`；保留既有大分块提示。本轮没有新增运行依赖、调整产品菜单、打包或替换桌面客户端。

文档验收：`pnpm docs:check` 通过 1108 项、失败零项；计划、设计、任务清单、测试计划、报告、评审记录和文档地图已同步。

## 画质进阶 P0 基线（2026-09-18）

更新记录：2026-09-18，v1.13，执行[画质进阶计划](./player-quality-development-plan.md)的第一步 VQ-01～VQ-03。此节只记录当前未提交工作区的测量与受控基线，不替代历史测试，不代表真实动漫观感、桌面包或物理高刷验收。

本机为 Windows、Intel Core i5-12500（十二逻辑处理器）、Intel UHD 770、驱动 `32.0.101.7088`，系统显示模式为 1920×1080/60Hz；Node.js `26.5.0`、pnpm `10.15.0`。使用现有 Vite `5188` 与无窗口 Chromium，媒体由本地生成，接口隔离。系统显示模式与无窗口浏览器的视口分别登记，不能互相替代。

本轮新增 [P0 采集与对照入口](../e2e/player-quality-baseline.mjs)，提供样本登记、四类阶段采样与基线对照；阶段观测默认关闭，仅采集任务开启。运行证据统一写入 `sanye_deploy/.local/player-quality/`，保留每次运行和失败，不覆盖历史 `live-matrix` 文件。执行前源码副本位于该目录 `pre-p0/`，用于识别本轮插桩差异；副本本身不是旧版运行通过证据。

真实制作动画使用 Blender 官方的《Sintel》预告片：[官方下载](https://download.blender.org/durian/trailer/sintel_trailer-1080p.mp4)、[官方许可及署名要求](https://durian.blender.org/sharing/)、[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。署名为“© copyright Blender Foundation | durian.blender.org”。完整原文件与许可页面留在本地 `licensed/`，仓库不分发媒体；本轮只以时间范围选择测试画面，未改写原视频。该样本为三维动画，不能替代二维日漫字幕、线条及长片观感验收。

原视频为 1920×1080、24 FPS、52.208333 秒、14,621,544 字节；SHA-256 为 `34bbd52a4b89fdf63c8ace50b268da26653a59508288100cd3c23de276db7931`，容器信息经 FFmpeg 核验，日志为 `licensed/ffmpeg-probe.txt`。动作片段选择 20～35 秒，覆盖镜头移动、动作、形变、遮挡和切镜，标记为真实来源、主观评估样本，不伪称具有中间帧真值。`licensed/sintel-ffmpeg-contact.png` 与 `sintel-browser-25s.png` 已查看，确认画面及实际浏览器定位有效。

Windows `GetSystemPowerStatus` 于 `2026-09-18T02:59:37Z` 返回成功、`ACLineStatus=1`，确认采样准备时为市电供电；供电仍需在每次正式采样时重新记录。可用显存、能耗、真实屏幕呈现和声学端到端同步没有本轮实测依据，保持不可测或待环境，不记为零。

### 本轮入口与测量口径

```powershell
$env:SANYE_FRONTEND_URL = 'http://127.0.0.1:5188'
node e2e/generate-quality-scenes.mjs
node e2e/player-quality-baseline.mjs register-generated
node e2e/player-quality-baseline.mjs verify-generated
node e2e/player-quality-baseline.mjs run --sample sintel-trailer-action --target 120 --profile sharp --seconds 4 --sustained-seconds 30 --power ac
```

前三条为新工作区的合成样本准备入口；已有同名媒体时生成器拒绝覆盖，新增版本使用 `--version`。真实素材先以 `register` 登记，`--file` 为本地文件，必须同时填写 `--id`、`--origin real`、`--truth subjective`、`--scenes`、`--license`、`--fps`、`--fps-source`、`--start`、`--end`，本轮真实样本元数据见上文。`--power ac` 是调用者依据本轮系统测量填写的供电状态，工具不自行假定市电。

八类合成素材由 [FFmpeg 场景生成器](../e2e/generate-quality-scenes.mjs) 产生。初版细线样本只有横线，后续 `fine-lines-subtitles-v2` 补充字形；`low-bitrate-noise-v2` 固定噪声种子为 42，保留初版文件及摘要。每条素材均为可重放 MP4，附尺寸、时间范围、标称帧率来源及 SHA-256；此批为主观样本，不计算缺少配对真值的 PSNR/SSIM。样本像素检查与截图保存在 `generated/`，本轮已查看字形、形变、遮挡及真实动画画面。

[媒体范围响应](../e2e/local-media-range.mjs) 为本地测试媒体实现 HTTP 206/416。最初直接以 200 返回整个文件，真实素材请求定位到 25 秒却实际解码约 0.04 秒；修正后浏览器回调为 `25.041667` 秒且画面非空。范围解析的普通、开放、后缀、越界、反向及多范围输入共九项定向断言通过；基线额外保留实际解码时间、片段循环次数和越界帧，不能只相信设置的 `currentTime`。

CPU 通过 CDP `SystemInfo.getProcessInfo` 差值统计浏览器、渲染、GPU、网络与可观测音频进程，记录单核百分比及除以十二逻辑核后的容量百分比。区间内新建或退出进程的完整 CPU 生命周期仍有缺口，已保留范围说明。内存为主线程 JS 堆观测，不冒充全进程内存或显存。浏览器提供的 `processingDuration` 单独记录，不与 CPU 提交或 GPU 查询相加；其含义不是纯算法执行时间。

### 基线发现

最终源码基线为 `2026-09-18T03-11-03.183Z-35468/evidence.json`，使用上文 20～35 秒真实片段和四类参数，首帧均为 `20.041667` 秒，越界帧为零，运行前后源码摘要一致（`cdb268ecc376bed00e4bbbf68da1da2babfe8079c4bc661a41c176bf14d22a2e`），四场景均无运行错误。该轮保留了比前一轮更低的窗口，未挑选最佳结果替代最终记录：

| 场景 | 已完成帧率窗口 | 相关进程 CPU 时间 | 十二逻辑核归一化 CPU |
| --- | --- | --- | --- |
| 冷启动 | 96、121、119 FPS | 6,313 毫秒，含启动区间 | 11.14% |
| 预热后 | 119、121、118、121 FPS | 5,834 毫秒 | 12.11% |
| 持续三十秒 | 二十八窗；三窗 101、107、103 FPS，其余 117～121 FPS | 24,965 毫秒 | 6.93% |
| 主线程干扰 | 86、121、120 FPS | 5,918 毫秒 | 12.29% |

持续段循环两次，完整窗口覆盖约 93.3%；已记录窗口中只有 25/28 达到目标的 96%，未达到计划“至少 95% 窗口达标”的建议门禁。因此本轮结论是建立可复核成本与失败基线，不能写为高刷持续性能已经优化达标。消息脉冲是否启用、调度迟到与 CPU 波动保留在逐窗数据，作为 P1 的调度、启动及恢复优化依据。该运行使用开发服务，已有 `dist` 摘要只是库存记录，最终客户端构建另行通过，未将其冒充浏览器加载的版本。

验证汇总：`node --test --test-concurrency=1 e2e/realtime-interpolation.test.cjs` 四项通过；Range 解析九项定向断言及对照六项代表性场景通过，后者覆盖同配置、输入变化、输出变化、源码漂移、稳定性缺失和供电未知。最终基线自对照通过，只证明比较入口和证据校验有效，不证明性能提升。`pnpm typecheck`、`pnpm build` 通过；收紧异步缩放采样边界后再次执行客户端 `build` 通过，保留既有分块体积提示。文档检查入口为 `pnpm docs:check`，未打包、安装或发布桌面客户端。

以下为同轮较早运行的诊断记录，保留原数值，不替代上述最终基线：

文档验收：`pnpm docs:check` 通过 1099 项、失败零项；设计、计划、任务状态、报告与评审记录已经同步。

`2026-09-18T03-03-55.062Z-33468/evidence.json` 为 1080p、24 FPS 真实源、120 目标、锐化档、市电条件下的完整记录，四类场景无运行错误。预热后四个窗口均为 120 FPS；冷启动为 92、119、119 FPS；三十秒持续段共二十九个完整统计窗口，其中两个循环恢复窗口为 102、100 FPS，其余为 119～121 FPS；干扰段为 110、120、119 FPS。持续段采样覆盖约 96.7%，保留首尾不足一窗及循环恢复，不以完整窗口覆盖率冒充达标率。

该次持续段相关进程 CPU 时间约 40,092 毫秒，单核口径约 133.5%，十二逻辑核归一化约 11.1%。预热末窗口捕获 P95 约 0.4 毫秒、上传提交 P95 约 0.2 毫秒、运动分析 P95 约 4.0 毫秒、光流往返 P95 约 13.7 毫秒；GPU 完成查询均值约 3.78 毫秒。后两项的口径不同，不能把往返与 GPU 值相加，也不能把 GPU 均值当成 P95。当前数据给出 120 目标下约 8.33 毫秒帧周期的成本对照，尚未证明长期可持续或全部阶段留有 20% 余量。

旧的 `2026-09-18T02-46-39.560Z-6236` 和 `2026-09-18T02-47-30.933Z-7880` 为初版短时工具验收，早于范围响应修正及三十秒持续段，不作为最终持续性能基线。`2026-09-18T03-01-31.036Z-28164` 为另一条 20～40 秒范围、供电未登记的探索性运行，不能与上表直接同比。基线工具只保存观测，不以退出码零宣称达到计划的全部性能门禁。

## 五项画质与帧率改进验证（2026-09-18）

更新记录：2026-09-18，v1.12，记录当前未提交工作区的补帧、调度、增强预算与模型评估。本节独立于历史测试及已安装客户端证据。环境为 Windows、Intel UHD 770、Chromium D3D11、本地 Vite `5188`，媒体与接口为受控测试数据。

`node --test e2e/enhancement-models.test.cjs` 一项通过，覆盖现有 Anime4K 小、中、大模型的六种修复与超分组合；输出方向、颜色、尺寸和 WebGL 错误检查通过，截图已查看。报告为 `sanye_deploy/.local/enhancement-models/report.json`，截图为同目录 `models.png`。1080p 修复预热后中位完成成本约 25、41、71 毫秒，1080p 至 4K 超分约 62、107、154 毫秒。该数据包含 GPU 完成等待，不将 CPU 提交时间当成实际处理成本，也不由合成线条推导真实动漫观感排名。

保留小模型作为实时默认。RIFE 首次原始文件地址 DNS 解析失败，随后通过 GitHub API 读取上游说明、MIT 代码许可及 ncnn/Vulkan 接口；具体来源和选型约束见[播放器设计](./media-player-development.md)。未下载权重或接入推理，权重许可、模型质量与本机实时推理性能保持待环境。

以下专项已在当前源码通过：`node --test e2e/frame-cadence-policy.test.cjs e2e/frame-menu-state.test.cjs` 四项，覆盖瓶颈区分、恢复窗口、384 分析档滞回与菜单同步；`interpolation-stability.test.cjs` 一项覆盖短缺帧与音画时序；`motion-naturalness.test.cjs` 一项覆盖边缘运动、冲突运动和非零单侧可信运动。`player-quality.test.cjs` 的策略、双向光流及修复超分三个分项分别通过，保留原画尺寸，覆盖细线、平移、遮挡、切镜、输出方向、无计时扩展时的低频真实完成抽样，以及增强抛错后同一上下文恢复。

首次完整 1080p 播放矩阵未通过：120 锐化档末两窗口仅完成 96、97 FPS，调度迟到第 95 百分位约 14.7、11.6 毫秒，144 档曾降至 60。原始结果保存在 `sanye_deploy/.local/player-quality/live-matrix-20260918-initial-failed.json`，不得用短时像素测试覆盖这次性能失败。

随后修正 Worker 调度及源帧上传抖动后的追赶策略，并使过载判定只在实际输出不足目标时使用调度 P95。最终完整 `node --test --test-name-pattern="1080p live quality" e2e/player-quality.test.cjs` 七种组合通过：120 sharp 为 120/120，144 为 144/144，165 为 165/165，240 为 237/234，自动档按 60Hz 为 60/60，restore 回退后为 119/121，upscale 回退后为 120/120。报告为 `sanye_deploy/.local/player-quality/live-matrix.json`。这是 GPU 完成帧率，不代表 60Hz 屏幕实际呈现 240 帧，也不保证重增强同时维持最高档。

独立短时启动/暂停专项曾在末两窗口出现 106/91 FPS，失败保留在 `sanye_deploy/.local/realtime-interpolation/live-20260918-short-reproduced.json`。排查发现非循环静音媒体场景中 Worker 心跳会退至约 16 毫秒，随后采用 128 宽度冷启动和定时器节流检测后的消息任务脉冲回退。最终 `node --test --test-name-pattern="live worker" e2e/realtime-interpolation.test.cjs` 通过，最后两窗口 120/120 FPS，实际帧间隔 P95 11.7/11.6 毫秒，资源生命周期、尺寸、150 毫秒音频延迟和故障恢复全部通过；最终证据为同目录 `live.json`。脉冲是否启用由环境决定，不作为测试必须满足的状态；原约 120 FPS 门禁保留，并新增实际帧间隔门禁。额外功耗尚未独立量化。

`player applies` 浏览器专项通过；桌面 1280×840 和手机 390×844 的播放器截图已检查，视频非空、控件可见，位于 `sanye_deploy/.local/realtime-interpolation/player-desktop.png` 和 `player-mobile.png`。

`pnpm typecheck` 通过。首次 `pnpm build` 在其他正在修改的 `scheduleView.vue:85` 遇到空数组推断为 `never[]` 的 `TS2352`；补上 `ScheduleItem[]` 元素类型后，完整 `pnpm build` 通过，保留既有大分块提示。该修正不改变排期数据和行为。未打包或替换已安装桌面版本。

## 搜索至播放体验回归（2026-09-17）

更新记录：2026-09-17，v1.11，记录当前工作区的搜索、播放器连续性和画质保护修正。以下为本轮 Windows、Chromium、Vite `5188` 的受控接口和媒体结果，独立于上表及后文历史联调结论。本轮未启动 `8091` 网关，在线片源与已安装客户端保持待环境。

| 命令或证据 | 本轮结果与边界 |
| --- | --- |
| `node --test e2e/search-experience.test.cjs` | 2 项通过；覆盖慢请求、换词竞态、分类分页、重试、返回和手机布局 |
| `node --test e2e/search-source-choice.test.cjs`；设置 `BASE=http://127.0.0.1:5188` 后运行 `node --test e2e/search-latency.test.cjs` | 各 1 项通过；保留自动来源选择与渐进搜索。延迟测试最初默认端口未启动，指定正确端口后通过 |
| `node --test --test-concurrency=1 e2e/playback-pipeline.test.cjs e2e/external-source-fallback.test.cjs e2e/frame-menu-state.test.cjs` | 9 项通过；包括搜索至播放、单线重试保留状态、请求并行、缓存刷新不重建、菜单稳定、增强上下文丢失恢复、清晰度切换及备用来源。菜单实现最终调整为原位更新后，帧率相关 2 项另行复验通过 |
| 设置 `SANYE_FRONTEND_URL=http://127.0.0.1:5188`，运行 `node --test --test-concurrency=1 e2e/motion-naturalness.test.cjs e2e/interpolation-stability.test.cjs e2e/realtime-interpolation.test.cjs e2e/seek-performance.test.cjs e2e/seek-directions.test.cjs` | 14 项通过；覆盖真实 GPU 像素、运动与切镜、锐化边缘、音画时序、实时补帧、点击、缓存和双向定位 |
| `pnpm typecheck`；`pnpm build` | 通过；构建保留既有大分块提示 |
| `node --test e2e/playback-experience.test.cjs` | 2 项通过；完整运行 60 秒循环播放、定位、暂停后同语言换线和偏好恢复，报告为 `sanye_deploy/.local/playback-experience/report.json` |
| `pnpm docs:check` | 文档一致性检查通过；不代表在线片源或已安装客户端验收 |

1080p 实时样本预热后三个统计窗口均约为每秒 120 个 GPU 完成帧，显示调度约为每秒 60 次，不能据此声称屏幕实际显示 120 帧。无关慢片段阻塞时，向前与向后目标帧解码约为 127、139 毫秒；等待重试时约为 125、124 毫秒。这些时间依赖本机与受控网络，不构成真实片源延迟保证。

截图与测量保存在 `sanye_deploy/.local/playback-pipeline/`、`sanye_deploy/.local/realtime-interpolation/`、`sanye_deploy/.local/interpolation-stability/` 和 `sanye_deploy/.local/seek-performance/`。搜索截图路径由测试输出；桌面和手机视口已检查。多档清单测试使用真实解码片段验证换档策略，不证明声明的清晰度能增加片源细节。复杂非刚性运动、整片观感和外部来源持续可用性仍需真实样本验收；本轮未发布、未替换桌面安装物。

更新记录：2026-09-17，v1.6，修复《铃芽之旅》同名来源被搜索去重丢弃的问题。原来源 `v8.qrssv.com` 的 DNS 解析失败；保留备用来源后，真实搜索第二条《铃芽之旅》可在失败后自动播放备用视频，1280×535，进度超过 3 秒。报告为 `sanye_deploy/.local/external-playback/6ced4700-003f-470c-a057-7ae8d9c46f55/report.json`。此证据仅证明短时播放，来源内容完整性、片长和整片持续可用性未验收；国语版的独立通过不代替这条验证。

`ExternalSearchServiceTest` 10 项通过、1 项外网测试按默认条件跳过；`node --test e2e/external-source-fallback.test.cjs e2e/frame-menu-state.test.cjs` 覆盖主媒体失败、预览失败、电视剧不混集、帧率降档与恢复选中态同步。浏览器回退测试采用受控媒体，真实外网证据单独记录。帧率同步使用后台 `nextTargetFps`，保留用户选择上限，不重启播放器来响应性能降档。

候选 `140711-577` 的包内验证遇到备用来源页临时返回 `5002`，报告 `sanye_deploy/.local/external-playback/f490f04c-c72f-44a6-a82f-55071ce7e569/report.json` 为失败，不能由之前一次通过覆盖。后续对每路预览的 `5002` 增加一次有界重试，取消、参数错误不重试；浏览器测试补充备用来源第一次失败、第二次恢复后继续播放的检查。

最终候选 `141732-133` 使用实际包内资源通过相同真实搜索播放检查，报告 `sanye_deploy/.local/external-playback/74ea7383-ef04-4322-8442-b3c0d51bd436/report.json`。保留原域名 DNS 失败记录，备用线路成功播放；本轮只验证短时播放，未验证整片内容与片长。
## 默认浅色与自动选源展示（2026-09-17）

更新记录：2026-09-17，v1.10，当前工作区使用桌面模式 Vite 端口 5190 验证浅色首页、搜索和详情。`SANYE_FRONTEND_URL=http://127.0.0.1:5190 node --test e2e/search-source-choice.test.cjs e2e/client-appearance.test.cjs` 覆盖 1280 与 390 宽度、搜索隐藏选源但保留候选与关键词、默认浅色、主动切换主题后的持久化、详情线路默认收起与手动换线。

截图保存在 `sanye_deploy/.local/client-appearance/` 与 `sanye_deploy/.local/playback-experience/search-*.png`；接口和媒体为受控测试数据。两项展示测试通过，另覆盖首页两张轮播的按钮边界、窄屏全屏控件不裁切。`node --test e2e/external-source-fallback.test.cjs` 两项通过，覆盖来源失败、慢来源、无媒体、后台补线与电视剧不混集。根目录 `pnpm typecheck`、`pnpm build` 通过，最终客户端以 `pnpm --filter @sanye/sanye_client build:desktop` 复验；构建保留既有大分块提示。此为源码与浏览器验收，未重新打包、替换已安装客户端，也不代表外部媒体持续可用。

## 定位恢复与画质帧率复验（2026-09-17）

更新记录：2026-09-17，v1.7，当前未提交工作区使用端口 5188 的桌面模式 Vite、Chromium D3D11 和本地受控 MP4/HLS 验证；接口数据由测试提供，未替换已安装客户端。实现说明见[播放器设计](./media-player-development.md)。本节结果独立于后文历史验收。

`SANYE_FRONTEND_URL=http://127.0.0.1:5188 node --test e2e/player-quality.test.cjs` 四项通过；追加定时取整优化后，以 `--test-name-pattern="1080p live"` 独立复测播放矩阵一项通过。下表为最终证据，位于 `sanye_deploy/.local/player-quality/`：

| 验证项 | 当前证据与边界 |
| --- | --- |
| 1080p 锐化与补帧 | `live-matrix.json`：120、144、165 请求档最后两窗口完成数分别为 120/120、143/145、165/165 FPS；保留 1920×1080，未降低原画分辨率 |
| 生成节奏 | 上述三档第 95 百分位调度间隔分别约 9.8–10.2、8.1–8.2、7.4–7.5 毫秒；等待毫秒向上取整避免提前唤醒后重复等待。完成帧数不是无抖动或屏幕物理呈现证明 |
| 240 与自动档 | 240 在本机回退到 165，末窗口完成 167/164 FPS；自动档按约 60Hz 的显示调度输出 60/60 FPS。策略回归覆盖持续仅能完成 125 FPS 时从 240 直接回退到 120，以及稳定后的逐档恢复 |
| 遮挡锐化与端点 | `motion-quality.json`：2、12、24 分析像素平移的单边可信帧锐化、锐化端点与对应原帧参考像素误差均为零；保留细线、切镜、遮挡置信度检查，不等同于真实动漫全场景主观评分 |
| 修复与超分 | `enhancement-cost.json` 和 `enhancement.png` 确认增强结果、颜色和方向有效，1080p 超分输出 3840×2160。同步完成成本在预热后约 25–29/67–69 毫秒；实时 120 目标下仍需回退性能档，不能承诺本机重增强同时维持高刷 |

首次复验的 240 档末窗口出现 137/155 FPS，未达到当时 165 目标的门禁；据此修正持续过载时仅逐档回退的问题，再执行完整四项通过。后续补充定时取整验证时，同机另有桌面视频验收进程，出现源解码 6–15 FPS 和 144 档未达门禁的样本；保留负载敏感边界，不据此承诺任意并行负载下的帧率。

`node --test e2e/seek-performance.test.cjs e2e/frame-menu-state.test.cjs` 四项通过。`sanye_deploy/.local/seek-performance/detail-hls.json` 最终记录鼠标松手至解除等待约 134 毫秒、清空媒体缓冲后恢复播放约 320 毫秒，缓存分片请求保持 6→6；一次拖动仅一次定位、零次额外 `startLoad`。桌面与触屏 MP4 定位约 122/173 毫秒且保持原暂停状态，记录在 `desktop.json` 与 `mobile.json`。固定等待改为首帧回调后的前后对照样本约 183→122 毫秒，最终复测存在正常波动，不推导外网冷定位耗时。

`node --test e2e/realtime-interpolation.test.cjs` 的像素、运动、播放生命周期三个分项通过，交互分项按现有独立帧率菜单更新后以 `--test-name-pattern="player applies"` 单独通过。覆盖全部画质档、补帧开关、144 FPS 选择、路由离开清理；桌面 1280×840 与移动 390×844 截图位于 `sanye_deploy/.local/realtime-interpolation/`，人工确认视频非空。移动端最右侧全屏控件仍有既有裁切，本轮未改布局。`pnpm typecheck` 与 `pnpm build` 通过，构建仍有已有的大分块警告。

## 直接观看渐进加载（2026-09-17）

更新记录：2026-09-17，v1.9，新增 `playbackPreferences.ts`：版本化偏好校验，线路成功记录七天内有效、失败降优先级十分钟、最多保留一百条，去掉 URL 查询串和片段；本机存储不可用时不阻断播放。换线使用最后有效播放快照，优先同语言且一次回退不重复尝试已失败线路。帧率降档观察窗口由三次改为两次，恢复稳定窗口由十二次改为十六次。搜索来源选择与桌面发布流程同步更新。

新增 `e2e/playback-experience.test.cjs` 与 `e2e/search-source-choice.test.cjs`，覆盖偏好校验、失败记录过期、线路排序、同语言暂停换线、重新打开记忆、搜索来源与关键词保留、桌面及窄屏。连续播放使用支持 HTTP Range 的受控媒体；历史测试没有实现 Range 时拖动回零不作为播放器失败结论。当前测试输出统一保留在 `sanye_deploy/.local/playback-experience/`。

本轮结果：受控媒体连续播放 60 秒、拖动到 4 秒并暂停后换同语言线路、35% 音量、静音及 1.5 倍速保留、重载后成功线路优先，以及 90 FPS/锐化偏好恢复通过，见 `playback-experience/report.json`。来源等待与失败回退两项、偏好与连续播放两项、帧率菜单一项、搜索来源一项分别通过；搜索测试增加等待具体结果文本后复核通过，帧率策略专项通过。`pnpm typecheck` 和 `pnpm build` 通过，构建保留既有大分块提示。

候选 `150025-790` 包内真实搜索《铃芽之旅》播放超过 60 秒，1280×535、失败请求列表为空，点击到预览 3437 毫秒，至播放进度 60.166 秒共 73780 毫秒。报告 `sanye_deploy/.local/external-playback/6eead4e8-22f8-4e9d-b5e7-501ea3aea26a/report.json`。本轮未验收整片、声音主观同步、所有来源或所有显卡，不将一分钟观察扩大为这些结论。

更新记录：2026-09-17，v1.8，来源请求首轮上限 20 秒，临时业务错误 `5002` 至多追加一次 15 秒请求；首个有效预览返回即展示，剩余请求后台补充同名电影线路。空或非视频资源不当作可播放结果，来源取消不更新页面；新增线路原位更新，不重建正在播放的视频，已有失败状态允许晚到线路恢复。启动超时以首帧数据而非仅元数据判断。

`node --test e2e/external-source-fallback.test.cjs` 两项通过，覆盖慢主来源、慢备用来源、空主来源、全部为空、晚到备用救回、临时来源错误重试、电视剧不混集，以及补充线路不替换当前视频节点。慢来源测试使用未释放的请求，验证播放器在慢请求结束前已推进。`pnpm --dir sanye_client typecheck` 通过；真实外网可用性不能由受控媒体测试推导。

候选 `142614-446` 包内真实搜索《铃芽之旅》：点击至播放器出现 2128 毫秒，至视频推进 3 秒为 8911 毫秒，1280×535，失败请求列表为空。报告为 `sanye_deploy/.local/external-playback/1deaedf5-afd2-4b79-8139-f85d29dbce24/report.json`；这次快备用来源先返回并播放，未等待慢主来源。

## 播放质量改进专项（2026-09-16）

更新记录：2026-09-16，v1.5，当前未提交工作区在 Windows、Intel UHD 770、Chromium D3D11、约 60Hz 显示调度下执行 `node --test e2e/player-quality.test.cjs` 的四个分项验证，均通过。证据目录为 `sanye_deploy/.local/player-quality/`。

| 项目 | 本轮结果与边界 |
| --- | --- |
| 细线、快速平移与切镜 | `motion-quality.json`：2、12、24 分析像素平移，中点与单像素线条合成误差为零；前后端点准确，遮挡产生低置信度区域，平移及局部遮挡不误判切镜，切镜保持前画面直到时间边界。此为合成场景，不是所有动漫镜头的质量评分 |
| 修复与超分像素 | `enhancement-cost.json`：原画、修复、超分像素摘要不同，颜色和上下方向一致；1080p 修复保持 1920×1080，超分输出 3840×2160；截图为 `enhancement.png` |
| 增强成本 | 样本中 1080p 修复预热后约 30–33ms，2 倍超分约 65–86ms，包含 GPU 同步完成测量；当前核显不能据此承诺同时保持重增强和 120 FPS |
| 120 / 144 / 165 | `live-matrix.json`：1080p/30 FPS 实解码受控片段，锐化与补帧同时启用，末两窗口分别为 120/119、144/145、164/165 个 GPU 完成帧每秒；帧调度间隔第 95 百分位约 9.8、8.5、7.6ms |
| 240 实验档 | 当前设备未稳定达到 240，超预算后回退至 165，末窗口约 165；请求档位与实际目标分别记录 |
| 自动档 | 当前显示调度约 60，自动选择 60；模拟 120、144、165、240 刷新估计的策略测试验证自动上限 165，未代替真实高刷设备 |
| 增强回退 | 修复、超分在本机超预算后回退性能档，1080p 输出仍保留，末窗口约 119–120；不是重增强持续 120 的证明 |

首次连续测试跨越十秒素材循环，144 档出现 122 FPS 的寻址预热窗口。现将各档测试从片段起点重新开始，单档连续播放 7.5 秒，生命周期回归另行保留；未删除或隐藏此限制。高刷屏物理呈现、复杂真实动漫对照、长时间播放、不同显卡、RIFE 推理和已安装客户端更新均未由本轮受控验证覆盖。

完整回归 `node --test e2e/realtime-interpolation.test.cjs` 四项通过，覆盖原分辨率像素、运动中点、真实解码暂停恢复和上下文丢失、全部质量档位与设置菜单选择 144 FPS。桌面 1280×840、手机 390×844 截图位于 `sanye_deploy/.local/realtime-interpolation/`；人工检查画面非空及控件未挤出。交互测试等待视频数据就绪后播放，避免仅等待节点挂载导致初始化换源中止播放请求。`pnpm typecheck`、`pnpm build` 通过，构建保留已有大分块警告；最终 `pnpm docs:check` 通过 961 项。

`pnpm --filter @sanye/sanye_client build:desktop` 通过。以 `http://127.0.0.1:5189` 预览本轮 `dist-desktop`，设置 `SANYE_FRONTEND_URL` 后执行 `node --test --test-name-pattern="player applies" e2e/realtime-interpolation.test.cjs`，生产资源交互一项通过，确认两个 Worker 加载、六个质量选项及 144 FPS 选择正常。测试目录接口为模拟数据、视频为受控本地片段；该预览不提供业务后端，也未替换或重新安装 EXE。

## 导入观看专项（2026-09-16）

更新记录：2026-09-16，v1.4，旧 `1524` 包实测裸域页面返回 HTTP 301 业务错误，规范域可解析。当前源码的受限重定向处理经 `HttpMediaPageFetcherTest`、`AnimeUrlImportServiceTest`、`MediaImportServiceTest` 验证，共 24 项通过、1 项外网开关用例跳过。另运行 `node sanye_desktop/verify-import.cjs`，使用真实来源和独立 PostgreSQL 验证桌面代理导入、已发布详情、剧集持久化和真实搜索按钮跳转；报告与新包入口见[桌面运行文档](./local-desktop.md)。

`node --test e2e/import-watch.test.cjs` 一项通过，覆盖服务器错误原因显示、按钮恢复和重试后跳转。真实导入样本为“天气之子”两集。进一步使用新包内运行时执行验证，视频时间推进超过两秒且解码宽度非零，`playback=passed`，报告为 `sanye_deploy/.local/desktop-import/6f11d95c-ad2d-4f97-a43a-e0a18f5ba623/report.json`。未据此宣称任意作品、完整影片和外网视频流均持续可播放，未改动用户个人数据库。

## 拖动定位专项（2026-09-16）

更新记录：2026-09-16，v1.3，新增 `node --test e2e/seek-performance.test.cjs`。使用端口 5188 的桌面模式 Vite、Playwright Chromium、生成的 MP4/HLS 片段与受控接口，不请求生产视频。截图与数据位于 `sanye_deploy/.local/seek-performance/`。

| 验证项 | 证据与边界 |
| --- | --- |
| 拖动次数 | 同样 30 次鼠标移动，原 ArtPlayer 提交 31 次定位，优化后提交 1 次；松手前为零次 |
| 实际定位 | 1920×1080 的十秒片段定位到第七秒，验证实际播放时间；桌面和 390×844 触屏均保持暂停状态 |
| 播放与取消 | 播放中拖动后继续播放；窗口失焦取消时不提交定位并恢复播放；销毁后释放监听 |
| 分片缓存 | 受控 150ms 网络延迟下，首次读取约 150ms 以上，命中低于首次的一半；同一分片命中不发请求，原返回字节转移后仍可复用 |
| 缓存边界 | 字节范围隔离、容量淘汰、缓存命中取消、直播绕过、禁止存储与清空后重新请求均覆盖 |
| 详情页 HLS | 实际 Vue 详情页播放生成的六段 HLS；清空 MediaSource 缓冲后定位到 6.5 秒，恢复播放和补帧，分片请求仍为六次；数据见 `detail-hls.json` |

本轮 `pnpm typecheck`、`pnpm build` 通过；首次构建暴露的片段加载器构造类型不匹配已修正。性能数值为受控本机样本，不能承诺任意外网片源、首次冷定位、长关键帧片段或跨电脑耗时。新免安装候选与归档校验见[桌面运行文档](./local-desktop.md)，可见窗口人工操作与生产片源验收尚未执行。

## 实时补帧专项（2026-09-16）

更新记录：2026-09-16，v1.2，登记 `node --test e2e/realtime-interpolation.test.cjs` 的后台浏览器验收。环境为 Windows、Intel UHD 770、1920×1080、60Hz；性能运行使用无窗口 Chromium 的 D3D11 后端。测试从 FFmpeg 生成带音轨的 1080p/30 FPS 点播片段，未使用生产视频数据。

| 验证项 | 本次证据与边界 |
| --- | --- |
| 真正生成运动中间帧 | 纹理平移测试估计位移约 4 像素，中点与预期位置匹配；120 个时刻的像素摘要不同。中点误差优于简单叠图，场景切换不混合 |
| 增强处理预算 | 原分辨率 480p、720p、1080p × 关闭增强、性能、均衡、锐化，十二组 GPU 像素及同步回读成本检查；同步回读含线程往返开销，不作为最终 120 FPS 门禁，不能当作屏幕帧率 |
| 1080p 增强与补帧联动 | 真实解码片段、锐化档、保留 1920×1080；GPU 已完成帧计数在预热后连续统计窗口约 120 FPS。测试要求末两个窗口均不低于 118 FPS，保留启动预热数据 |
| 显示端限制 | 当前机器显示调度约 60 FPS；120Hz 及以上屏幕的实际呈现、长时间播放和复杂真实片源质量仍待环境 |
| 音频与生命周期 | 延迟节点为 150 毫秒；暂停、恢复、寻址清理、开关重建与 GPU 上下文丢失回退检查。未完成声学端到端同步测量 |
| 播放器完整交互 | 默认补帧，切换三个增强档及关闭增强时继续补帧；单独关闭和开启补帧、路由离开清理、桌面及移动视口截图 |

可复核报告位于 `sanye_deploy/.local/realtime-interpolation/`：`motion.json`、`gpu-budget.json`、`live.json` 及 `player-desktop.png`、`player-mobile.png`。脚本自动准备受控片段并以端口 5187 的 Vite 为入口。开发模式及打包模式的完整片源、所有显卡和 4K 性能未由本次检查覆盖；已安装客户端尚未替换。

最终结果：四项专项测试通过，1080p 锐化档预热后 GPU 完成计数为 119、121、120 FPS，显示调度约 60 FPS。`pnpm typecheck`、`pnpm build`、`pnpm --filter @sanye/sanye_client build:desktop` 通过；桌面前端构建由端口 5188 临时预览并执行 `SANYE_FRONTEND_URL=http://127.0.0.1:5188 node --test --test-name-pattern="player applies" e2e/realtime-interpolation.test.cjs`，一项通过，确认两个 Worker 的生产资源可以加载并完成增强切换。该测试模拟目录接口、使用本地受控 MP4，不等同于已安装 EXE 验收。`pnpm docs:check` 通过 919 项。

优化过程中，人工 Canvas 视频和无刷新限制的实验存在约 55–117 FPS 的失败窗口，主线程绘制方案也曾出现约 108–114 FPS 的窗口；旧报告 `live-uncapped.json` 保留未达标实验，不能替代最终真实解码片段的验收。最终优化包括 OffscreenCanvas 后台绘制、纹理复用、媒体时间平滑、独立生成时钟和 GPU 完成计数，未通过重复原帧或降低清晰度凑数。

## 当前核对（2026-09-10）

本文保留原执行日期、环境和结果，是历史专项证据；2026-09-10 未重新执行本文完整测试范围，也未确认旧外部服务状态。当前复验项目、任务状态和正常使用判断见[当前审计](./current-status-audit.md)，不能把本文历史通过数直接作为当前发布门禁。

更新记录：2026-09-10，v1.1，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 1. 结果总览

| 板块 | 通过 | 失败 | 结论 |
| --- | ---: | ---: | --- |
| anime 模块 Maven 单元测试 | 65 | 0 | 通过，JaCoCo 门禁通过 |
| 后端全量 Maven 单元测试 | 210 | 0 | 通过 |
| 媒体播放器 Playwright | 4 | 0 | 通过 |
| 真实 HLS 与季度/搜索聚合 Playwright | 34 | 0 | 通过，包含 ArtPlayer 外壳、媒体控制属性和移动端无溢出断言 |
| 多码率清晰度 Playwright | 3 | 0 | 通过，包含自动/720P/360P 菜单和 HLS 子清单切换 |
| 电影语言线路 Playwright | 2 | 0 | 通过，剧场版无第一集、第二集文案 |
| 全量 Playwright 脚本 | 548 | 0 | 11 个脚本通过；套件内按钮体检 428/428 |
| 接口分板块体检 | 60 | 0 | 通过 |
| 前端/桌宠类型检查 | 3 | 0 | 通过 |
| 前端生产构建 | 3 | 0 | 通过，client/admin/pet 均通过 |
| 文档一致性检查 | 572 | 0 | 通过 |

## 2. 媒体专项

| 检查项 | 结果 |
| --- | --- |
| 播放区加载 | 通过，测试地址 `https://player.example/one` |
| iframe 安全属性 | 通过，包含 `sandbox` 和 `referrerpolicy="no-referrer"` |
| 选集切换 | 通过，播放器地址切换到 `https://player.example/two` |
| 移动端布局 | 通过，390px 视口 `scrollWidth=390` |
| ArtPlayer 播放器外壳 | 通过，6 个真实 HLS 页面均存在 `.art-video-player`，实际 `<video>` 具备 `controls`、`playsinline` 和 `preload="metadata"` |
| 空数据与失败态 | 通过，详情页无剧集时不渲染空 iframe，失败态提供重试 |
| 五个无职转生篇章 | 通过，第一季 23、第二季 24、第二季 Part.2 12、第三季 9、OAD 1 集可读取 |
| 你的名字媒体数据 | 通过，作品 `127` 保留两条播放线路，页面显示“日语原声/国语”或线路名称，不显示为两集 |
| 真实 HLS 浏览器播放 | 通过，6 个代表作品均渲染 ArtPlayer/video、加载 m3u8、调用播放 API 后时间推进且无媒体错误 |
| 清晰度选择 | 通过，模拟多码率清单显示自动、720P、360P；切换 360P 后保持 ArtPlayer 控件并请求 `low.m3u8`；真实来源单清晰度时隐藏菜单 |
| 片库季度独立展示 | 通过，5 个无职转生季度卡片分别拥有独立封面和详情入口；搜索结果保留 5 个独立季度结果并指向有剧集的作品 |

## 3. 接口与安全

接口体检按系统、anime、搜索、AI、收藏历史、文件、反馈、管理端和监控九个板块执行，结果为 `60/60` 通过。媒体相关边界包括：

- 未携带管理调用方凭证返回 `2002`。
- 非白名单来源、非法地址和参数边界按业务错误处理。
- 来源读取仅接受 HTTPS 白名单域名，限制超时、响应大小和重定向。
- 导入只保存页面可见元数据，不下载、转码、缓存或代理第三方视频文件。

## 4. 回归命令

```powershell
mvn -f sanye_server/pom.xml test
mvn -B -f sanye_admin_server/pom.xml package -DskipTests
pnpm typecheck
pnpm build
pnpm e2e:all
node e2e/e2e-media-player-live.mjs
pnpm e2e:media-quality
pwsh -NoProfile -File .\sanye_deploy\interface-check.ps1 -ReportFile docs\interface-test-report.md -SkipSse
pnpm docs:check
git diff --check
```

## 5. 未关闭事项

目标站点真实授权、服务条款确认、来源页面持续可用性、删除通知和版权投诉流程尚未取得外部证据，保持 `GAP-016=blocked-external`。这不影响代码和本地测试通过，但不能据此宣称已具备生产内容授权。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-21 | v0.1 | 建立媒体专项测试报告并登记最终本地验证结果 | 媒体测试计划、Maven、Playwright、接口体检 |
| 2026-08-24 | v0.2 | 修复 HLS 配置无分号解析、统一无职转生季度入口并登记真实来源浏览器 22/22、全量 E2E 563/563、后端 210/210 | `mvn test`、`e2e-media-player-live.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v0.3 | 修复作品 `127` 第一条 HLS 线路不可播放问题，改用第二条线路并保留两条媒体线路；专项增加真实播放推进校验，最终 28/28 通过，同时覆盖季度和搜索聚合 | `e2e-media-player-live.mjs`、管理端媒体导入接口 |
| 2026-08-24 | v0.4 | 使用 ArtPlayer 5.4.0 替换页面原生播放器封装，增加外壳和控制属性实测；真实 HLS、实际播放推进和聚合仍为 28/28 | `e2e/e2e-media-player-live.mjs`、`sanye_client/src/views/animeDetailView.vue` |
| 2026-08-24 | v0.5 | 将无职转生季度与搜索验证改为独立卡片、独立封面和独立详情入口 | `e2e/e2e-media-player-live.mjs`、`animeRepositoryView.vue`、`searchView.vue` |
| 2026-08-24 | v0.6 | 清理运行目录、内存回退和管理端回退中的其他测试作品；全量回归修正媒体分片主动中止误报，11 个 Playwright 脚本更新为 539/539，按钮体检 419/419 | `V7__remove_demo_test_catalog.sql`、`AnimeMemoryStore.java`、`e2e-buttons.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v0.7 | 复核当前动态页面控件和全量回归基线，按钮体检更新为 428/428、全量 Playwright 更新为 548/548；正式片库仍仅保留《你的名字》和无职转生五个独立篇章 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v0.8 | 清理 E2E 临时数据后复核当前动态页面控件，独立按钮体检 425/425、全量 Playwright 540/540（套件内按钮 420/420）；正式片库仍仅保留《你的名字》和无职转生五个独立篇章 | `node e2e/e2e-buttons.mjs`、`pnpm e2e:all` |
| 2026-08-24 | v0.9 | 增加清晰度选择专项报告：多码率 HLS 3/3、真实 HLS/季度/搜索聚合 34/34、全量 Playwright 548/548；明确真实单清晰度来源按实际清单隐藏菜单 | `e2e/e2e-media-quality.mjs`、`e2e/e2e-media-player-live.mjs`、`pnpm e2e:all` |
| 2026-08-25 | v1.0 | 修正《你的名字》电影线路被误展示为两集的问题，登记正片标题、语言线路和切换专项 2/2 | `e2e/e2e-movie-playback-lines.mjs`、客户端 typecheck/build |
