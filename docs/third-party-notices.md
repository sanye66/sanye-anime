# 第三方许可说明

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.6 |
| 文档状态 | 基线 |
| 关联文档 | [项目说明](../README.md)、[本地桌面运行与打包](./local-desktop.md) |
| 更新时间 | 2026-09-22 |

更新记录：2026-09-22，v1.6，按用户「这个免安装包里没有的东西删掉」移除 RIFE v4.6 神经补帧的分发登记：该运行时已随离线导出入口一起从桌面包删除（约 17MB），包内不再有 `resources/runtime/interp/`，因此 `rife-ncnn-vulkan`（MIT）、`rife-v4.6` 权重、ncnn（BSD-3-Clause）与 `vcomp140.dll` 均**不再随包分发**，对应的分发义务随之终止。历史登记行保留在下方表格中并标注为已移除，以便核对既往发布物；以后若重新引入任何神经网络权重，须按 [开发任务清单](./development-tasks.md) 的 VQ-10 流程重新核对来源与许可。

更新记录：2026-09-21，v1.5，登记随桌面包分发的 RIFE v4.6 神经补帧：`rife-ncnn-vulkan` 20221029（MIT）、`rife-v4.6` 权重（按 Practical-RIFE 模型清单同属 MIT）、ncnn（BSD-3-Clause）与 `vcomp140.dll`（Visual C++ OpenMP 运行库）。文件位置、版本与摘要见本节表格，原始许可文本随包内 `resources/runtime/interp/rife-ncnn-vulkan/` 分发。

更新记录：2026-09-16，v1.3，登记页面读取所用 Apache HttpClient 5.6.1，原始许可与声明保留在依赖 JAR 内。

更新记录：2026-09-16，v1.2，登记 JSFeat 光流库及随客户端分发的原始 MIT 许可。

更新记录：2026-09-16，v1.4，补充既有 `anime4k.js@1.1.3` 的恢复与超分着色器使用；包装器及着色器原始 MIT 许可随客户端 `licenses/anime4k-MIT.txt` 分发。未新增 RIFE 模型或推理依赖。

## 授权范围

根目录 `LICENSE` 的 MIT 许可适用于项目权利人拥有并按该许可提供的自有代码及文档。第三方原有版权声明和许可优先适用于对应内容，不能以根许可证替换、删除或重新授权。

视频、剧集来源链接所指向的内容、封面、角色形象、商标及其他第三方素材不因此获得 MIT 授权。能访问或下载素材不等于具有再分发权。当前桌面构建会导出本机固定目录元数据和封面，公开发行前须确定这些内容的可分发范围。

## 已核对的组件边界

| 组件 | 已发现的许可依据 | 分发要求与当前边界 |
| --- | --- | --- |
| Apache HttpClient | `httpclient5@5.6.1`，Apache-2.0，依赖 JAR 的 `META-INF/LICENSE` 和 `META-INF/NOTICE` | 用于公开页面读取与多地址连接回退；随业务 JAR 保留原始依赖包及声明 |
| JSFeat | `jsfeat@0.0.8`，MIT，版权归 Eugene Zatepyakin | 提供光流估计；原始许可随客户端 `licenses/jsfeat-MIT.txt` 分发，不引入非商业模型权重 |
| RuoYi 衍生管理后端 | [原 MIT 许可](../sanye_admin_server/LICENSE) 与上游版权声明 | 保留 RuoYi 原声明，不能以项目贡献者声明覆盖原作者 |
| Electron | 打包目录 `LICENSE.electron.txt` | 保留发行包中的 MIT 许可与版权文本 |
| Chromium 及随带组件 | 打包目录 `LICENSES.chromium.html` | 保留聚合许可文件，各组件分别适用其许可证 |
| Microsoft OpenJDK | 随包 Java 的 `legal/java.base/LICENSE`、`ADDITIONAL_LICENSE_INFO` 及其余 `legal/` 内容 | 包含 GPLv2、Classpath Exception 和第三方许可；完整保留随包法律文件，并按所分发版本核对适用的源代码提供义务 |
| PostgreSQL | `server_license.txt` | 保留 PostgreSQL 原许可与版权声明 |
| PostgreSQL 附带工具和库 | `commandlinetools_3rd_party_licenses.txt` | 存在 BSD、LGPL 等不同条款，按实际打包组件分别履行，不能统一声明 MIT |
| FFmpeg WebAssembly | `@ffmpeg/core@0.12.10` 元数据为 `GPL-2.0-or-later`，`@ffmpeg/ffmpeg@0.12.15` 包装器为 MIT | 未修改的单线程核心用于本地运动补偿插帧；GPL 文本随客户端 `licenses/ffmpeg-GPL-2.0.txt` 分发，不能以根 MIT 覆盖。源码与构建入口为 [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)；公开发布前需核对并提供所分发二进制的对应源码和构建材料 |
| RIFE ncnn Vulkan 推理程序（**已移除，2026-09-22 v1.6**） | `rife-ncnn-vulkan` 20221029（代码提交 `a7532fc3f9f8f008cd6eecd6f2ffe2a9698e0cf7`），MIT，版权归 nihui | 曾随包在 `resources/runtime/interp/rife-ncnn-vulkan/` 分发 `rife-ncnn-vulkan.exe`（SHA-256 `4b970319…f44f`）与 `vcomp140.dll`（SHA-256 `54fe6b08…4698`）。**当前包内已不存在该目录**，无分发义务；历史发布物中仍按原 MIT 文本履行 |
| RIFE v4.6 模型权重（**已移除，2026-09-22 v1.6**） | `rife-v4.6/flownet.bin`（SHA-256 `f334ed22…8958`）与 `flownet.param`（SHA-256 `28df14d5…6692`）；[Practical-RIFE 模型清单](https://github.com/hzwer/Practical-RIFE/blob/ae0c639856a332cd1d2a297f9398cec69e3001a7/README.md) 在同一节说明所列模型与代码同为 MIT | 曾随包分发的神经补帧权重。**当前不再分发**；若将来重新引入，须先按 VQ-10 重新核对来源与许可，不引入非商业权重 |
| ncnn（**已移除，2026-09-22 v1.6**） | 子模块提交 `b4ba207c18d3103d6df890c0e3a97b469b196b26`，BSD-3-Clause 及其所列第三方条款 | 曾作为推理程序的运行框架随包分发。**当前不再分发**，无对应义务 |
| m3u8-parser | `m3u8-parser@7.2.0`，Apache-2.0 | 用于读取非加密点播播放列表，保留上游许可边界 |
| Maven 与 pnpm 依赖 | 各依赖发行包的许可证、版权与元数据 | 本轮未做穷尽依赖审计，正式发布前仍须核对完整分发清单 |

上述运行时文件位置是产物内路径，未将整个运行时或其二进制加入版本控制。桌面打包配置同时分发根许可证和本文说明；这不替代各第三方原始许可文件。

## 签名边界

签名证明与签名身份、产物完整性相关，不授予第三方源码或素材版权。SignPath Foundation 的开源计划对第三方二进制重新签名另有限制，须由服务方确认 Electron 主程序及安装包嵌套内容的处理方式。

当前许可边界核对不等于完整法律审计或已满足免费签名准入条件，申请状态以桌面运行文档为准。

更新记录：2026-09-11，v1.1，新增 FFmpeg 核心、包装器和点播解析器的许可与公开分发条件；未采用非商业模型权重，不宣称整个安装包统一为 MIT。

更新记录：2026-09-10，v1.0，经维护者授权增加自有代码 MIT 许可，同时登记已核对的第三方文件与未完成的完整分发审计；依据当前源码及本地运行时许可文本。
