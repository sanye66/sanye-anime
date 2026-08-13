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
- 使用 Node.js 22 LTS 和 pnpm 10.15.0 作为项目基线。
- 前端变更进入更高环境前，执行 `pnpm typecheck` 和 `pnpm build`。
- 不要向仓库加入真实凭证、供应商密钥或生产数据。
- 重命名项目、包、服务、模块或入口文件时同步更新引用。
- 保持 `sanye_client` 和 `sanye_admin` 可以独立构建；`sanye_server` 使用独立的 Java 构建流程。
