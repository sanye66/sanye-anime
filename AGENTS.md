# AGENTS.md 项目协作规则

除代码标识符、命令、路径、技术名称和分支名称外，仓库中的 Markdown 文档正文、标题、表格说明和 README 统一使用中文。

## 项目身份

- 项目标准标识符：`sanye_anime`。
- 客户端产品名称：`sanye_anime`。
- 官网产品名称：`official`。
- 管理平台产品名称：RuoYi 管理平台。
- 仓库目录名不等同于项目标识符；包名和应用名必须使用标准标识符。
- 新增应用、服务、模块和部署标识符必须使用 `sanye_` 前缀。
- 本项目的三个核心工程按技术框架划分：`sanye_server`（Spring）、`sanye_client`（Vue）和 `sanye_admin`（RuoYi）。

## 命名规范

### 项目和目录

- 使用小写下划线形式：`sanye_<domain>`。
- 当前核心工程目录：
  - `sanye_client`
  - `sanye_server`
  - `sanye_admin`

- 辅助目录：
  - `sanye_deploy`
- `sanye_website` 是早期独立官网骨架的迁移过渡目录，不属于当前核心工程，不加入根工作区构建。
- `product`、`docs`、`.github`、`src`、`router` 和 `views` 是结构目录名，不属于应用标识符。

### JavaScript 包

- 前端工程使用 `@sanye/sanye_<domain>` 包名形式。
- 示例：`@sanye/sanye_client`、`@sanye/sanye_admin`。

### 服务和模块

- 使用带 `sanye_` 前缀的小写下划线形式。
- 示例：`sanye_core`、`sanye_auth`、`sanye_anime`、`sanye_search`、`sanye_ai_chat`、`sanye_favorite`、`sanye_file`、`sanye_feedback`、`sanye_job` 和 `sanye_gateway`。
- 不使用带连字符的服务标识符。

### TypeScript 和 Vue

- 变量、函数、组合式函数和路由名使用小驼峰形式。
- 业务视图文件名使用小驼峰形式：`homeView.vue`、`aiView.vue` 和 `dashboardView.vue`。
- 框架入口名称保持不变：`main.ts`、`index.ts`、`App.vue`、`env.d.ts` 和 `vite.config.ts`。
- CSS 类名使用短横线形式；存在冲突风险时应限定在所属应用范围内。

### 配置和数据

- 环境变量使用大写下划线形式，例如 `VITE_API_BASE_URL`。
- 数据库表、队列和存储前缀使用带 `sanye_` 前缀的小写下划线形式。
- 公开路由路径使用小写短横线形式；内部标识符根据所在层使用小驼峰或小写下划线形式。

## 三个核心工程入口

| 工程 | 技术框架 | 目录 | 包名或构建方式 | 开发入口 |
| --- | --- | --- | --- | --- |
| `sanye_server` | Spring Boot / Spring Cloud Alibaba | `sanye_server/` | Maven，Java 21 | `mvn spring-boot:run` |
| `sanye_client` | Vue 3 / TypeScript / Vite | `sanye_client/` | `@sanye/sanye_client` | `pnpm dev:client`，端口 5173 |
| `sanye_admin` | RuoYi / Vue 3 / Element Plus | `sanye_admin/` | RuoYi 独立工程 | `pnpm dev:admin`，端口 5175 |

`official` 不单独作为第四个核心工程，官网公开页面和 `sanye_anime` 客户端页面统一归入 `sanye_client` 的页面与路由范围。`sanye_deploy` 只负责部署和运行配置。

## 文档边界

- `product/` 只包含产品定位、用户场景、功能、页面、交互、状态和产品验收标准。
- `docs/` 只包含开发流程、技术架构、版本、决策、差距、运维和发布证据。
- 不要在 `product/` 中放置 API、数据库、部署或版本细节。
- 不要在 `docs/` 中定义面向用户的产品需求。

## 开发规则

- 使用根目录 `pnpm-workspace.yaml` 管理 `sanye_client` 和 `sanye_admin` 前端依赖。
- 使用当前本机工具链作为项目基线：Node.js 26.5.0（非 LTS）、pnpm 10.15.0、Java 21.0.12 和 Maven 3.9.16。
- 前端变更进入更高环境前，执行 `pnpm typecheck` 和 `pnpm build`。
- 不要向仓库加入真实凭证、供应商密钥或生产数据。
- 文档新增或实质修改必须遵守 [文档变更规则](docs/document-change-rules.md)：更新唯一事实源、版本、状态、更新时间和更新记录，登记 [文档评审记录](docs/document-review.md)，并运行 `pnpm docs:check`。
- 文档中的“已完成/已验证”必须关联命令、日志、截图、测试报告或其他可复核证据；外部账户、授权、系统兼容和发布环境阻塞必须保留为 `待环境` 或 `blocked-external`。
- 重命名项目、包、服务、模块或入口文件时同步更新引用。
- 保持 `sanye_client` 和 `sanye_admin` 可以独立构建；`sanye_server` 使用独立的 Java 构建流程。

### 桌面免安装包发行物（强制）

- 免安装包中的 `三叶动漫.exe` 必须与 `sanye_desktop/node_modules/electron/dist/electron.exe` 逐字节一致。构建脚本负责还原并校验 SHA-256，校验不一致即中止构建。
- 禁止让 electron-builder 改写该可执行文件：`sanye_desktop/build-portable.cjs` 的 `win.signAndEditExecutable` 必须保持 `false`，禁止对免安装包 EXE 写入图标、版本资源或签名。
- 应用图标随包提供 `icon.ico`（与 `sanye_desktop/assets/icon.ico` 一致），桌面快捷方式指向该文件；窗口与托盘继续使用包内 `assets/icon.ico`。EXE 自身显示 Electron 默认图标属已接受取舍，不得靠改写 EXE 恢复。
- 出现“应用程序控制策略已阻止此文件”、Code Integrity `3077/3033/3118` 或 Smart App Control 拦截时，先按文件哈希与官方 Electron 二进制对照，再判断原因；不得用重建、改名、复制或自签名规避，也不得直接归因为业务代码缺陷。
- 本地数据库状态必须自愈且探活必须认证：不得只凭 `pg_isready` 判定就绪；复用既有集群前必须校对 `sanye` 角色口令，异常退出残留的 `postmaster.pid` 必须接管，损坏或截断的包文件必须在启动前点名并提示重新完整解压。
- 交付流程不得被清理步骤阻断：回收站拒绝回收大型目录时改为可恢复地移入 `sanye_desktop/dist/desktop-retired/`，不得删改用户数据，也不得让构建成功后的发布失败。
- 需要带自定义图标或签名的 EXE 时，先取得可信代码签名并按安装包流程验证；不得把自签名或改写过的未签名 EXE 作为免安装包交付。
- 细节、证据边界和验收入口见 [本地桌面运行与打包](docs/local-desktop.md) 的“桌面发行物强制规则”；回归门禁为 `pnpm test:desktop`（含 `sanye_desktop/packaging.test.cjs`、`sanye_desktop/runtimeClosure.test.cjs`）与 CI 工作流 `.github/workflows/desktop-check.yml`。

### 分支、提交与合并规范

- 分支：`feature-<task>` 为任务分支（当前仓库存在历史 `feature` 分支，Git 不允许同名前缀，因此暂用连字符形式；`feature` 分支归档后恢复 `feature/<task>`）；`dev` 为日常集成，`test` 为验收，`release` 为稳定发布基线。
- 任务分支只承载当前任务范围内的代码、测试和文档；一个任务对应一个短生命周期分支，不边写边直接合并。
- 提交信息格式：`<type>(<scope>): <subject>`，`type` 取 `feat` / `fix` / `docs` / `refactor` / `test` / `chore`；一个提交只完成一件事，不混合无关改动。
- 禁止提交：密钥与环境变量真实值、构建产物、`node_modules`、数据库快照、大体积媒体文件。
- 合并到 `dev` 前自查：只修改当前任务范围；成功、空数据、失败、无权限状态已覆盖；测试与文档已更新；配置、迁移和版本记录已同步；日志无敏感内容；明确回滚方式。详细清单见 [docs/development-plan.md](docs/development-plan.md) 第 16 节。
