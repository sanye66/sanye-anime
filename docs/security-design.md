# sanye_anime 安全设计

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.1 |
| 文档状态 | 基线（安全唯一基准） |
| 唯一基准 | 是（安全规则、密钥策略、审计要求） |
| 关联文档 | [接口契约](./api-contract.md)、[数据库设计](./database-design.md)、[环境配置](./environment-config.md)、[技术设计](./technical-design.md)、[测试策略](./testing-strategy.md)、[故障手册](./ops-runbook.md) |
| 更新时间 | 2026-08-24 |

## 1. 安全目标与适用范围

本设计定义 `sanye_anime` 客户端、官网、管理平台与后端服务的统一安全基线，覆盖：

- 身份与访问控制（认证、授权、匿名身份、服务间凭证）；
- 数据保护（传输、存储、脱敏、备份）；
- 输入输出安全（注入、XSS、文件、AI 内容安全）；
- 审计与可观测（日志、脱敏、安全指标）；
- 密钥与配置管理（禁止入库、环境注入）；
- 安全测试与事件响应。

适用范围：`sanye_server`（网关与 9 个业务服务）、`sanye_admin_server`（RuoYi）、
`sanye_client`（客户端+官网）、`sanye_admin`（管理前端）、`sanye_deploy`（部署配置）。

## 2. 信任边界与威胁模型

### 2.1 信任边界

```text
公网客户端/官网（不受信）  ──►  网关（边界执行点）  ──►  业务服务（受信内部网络）
                                  │
                                  ├─► 公开白名单（public/covers）
                                  └─► 管理端（RuoYi 独立鉴权） ──► 受控接口（X-Caller-Name）
```

| 边界 | 可信度 | 关键控制 |
| --- | --- | --- |
| 浏览器 → 网关 | 不受信 | X-Device-Id 匿名标识、CAS（待接入）、CORS、限流、统一错误包 |
| 网关 → 业务服务 | 内部受信 | 仅内部端口暴露；请求 ID 贯穿；不暴露管理路由 |
| 管理端 → 业务服务 | 半受信 | RuoYi 登录 + 方法级权限 + 服务间凭证 X-Caller-Name |
| 服务 → 数据库/Redis | 内部受信 | 最小账号权限、连接池、密钥环境注入 |

### 2.2 STRIDE 威胁映射

| 威胁 | 场景 | 缓解措施 | 证据/测试 |
| --- | --- | --- | --- |
| Spoofing 伪装 | 匿名伪装他人、服务间伪造调用 | X-Device-Id 唯一标识 + 所有权校验（2003）；X-Caller-Name 固定凭证；CAS 接入后签发本地会话 | 冒烟“跨设备越权 2003”“受控接口缺凭证 2002” |
| Tampering 篡改 | 请求参数篡改、上传恶意文件 | 输入长度/类型白名单；文件内容类型+扩展名白名单；JSON 反序列化白名单 | 接口体检“注入字符串按字面量”“超长参数 1001”“非白名单文件 1001” |
| Repudiation 抵赖 | 无痕操作 | 审计日志（结构化、含 requestId）；管理端操作日志（RuoYi） | monitoring-design 日志规范 |
| Information Disclosure 泄露 | 越权读数据、日志泄露敏感字段 | 所有权校验；日志脱敏（密码/token/正文/密钥）；公开接口不返回内部字段 | 冒烟越权；日志脱敏单测 |
| Denial of Service 拒绝服务 | 刷接口、爆搜、额度耗尽 | 匿名额度上限（Redis 计数）；请求参数上限；AI 生成线程池边界；网关限流（Sentinel 待环境） | 冒烟“额度用尽 3002”；压测 load-test |
| Elevation of Privilege 提权 | 普通用户操作管理接口 | 网关不暴露 `/manage/**`；RuoYi 角色/菜单/方法级权限；前端按钮显隐 | 冒烟“ry 反馈 403”“官网正文 403” |

## 3. 身份与访问控制

### 3.1 匿名身份（当前基线）

- 所有业务请求必须携带 `X-Device-Id`（UUID），缺失返回 401/2001。
- 数据按 `owner_key` 维度隔离：匿名 `device:{deviceId}`，CAS 接入后 `user:{userId}`。
- 匿名额度：每日 5 次 AI 对话（Redis 计数，降级内存），用尽返回 3002。
- 匿名数据跨设备不可见（收藏、历史、会话、反馈均按 owner_key 隔离）。

### 3.2 CAS 认证（待外部环境，GAP-015）

- 客户端/官网登录跳转 CAS，`serviceValidate` 校验 ticket（防重放：一次性使用 + 短有效期 + 限流）。
- 回调后签发本地会话凭证（Bearer token，短期 + refresh 轮换；refresh 复用防护待接入后补测）。
- 账号映射/自动建号：CAS 主体映射到本地用户表（design 已在 technical-design 定义，代码待环境）。
- 退出（SLO）：CAS 登出 + 本地凭证吊销。

### 3.3 管理端授权（RuoYi）

- 登录：RuoYi 账号/密码（dev 关闭验证码，生产开启）。
- 授权：角色 → 菜单 → 权限串（如 `anime:content:list`、`anime:content:edit`、`anime:content:status`、
  `feedback:list`、`feedback:status`、`legal:content:list`、`legal:content:edit`、`monitor:job:list`）。
- 双重校验：RuoYi 安全链（登录 + 方法级 `@PreAuthorize`）+ 业务服务受控接口凭证。
- 前端守卫：路由按权限拦截，按钮按权限显隐（hasPerm）。

### 3.4 服务间凭证

- 业务服务受控接口（`/api/v1/manage/**`）要求 `X-Caller-Name` 与配置一致
  （`sanye.manage.allowed-caller` + `X-Internal-Token`，dev 令牌由 `SANYE_MANAGE_TOKEN` 注入），任一凭证缺失/不符返回 2002。
- 网关不暴露 `/api/v1/manage/**`，公网无法直接写入。
- 生产升级为轮换的服务间令牌（当前由 `X-Caller-Name` + `X-Internal-Token` 组成，令牌通过环境变量或密钥管理注入，见 technical-design 5.9）。

## 4. 输入与输出安全

### 4.1 输入校验基线

| 输入 | 校验规则 | 错误码 |
| --- | --- | --- |
| 关键词 | 必填（搜索）≤50；列表 ≤100 | 1001 |
| 类型/状态参数 | ≤20 | 1001 |
| animeId | 正整数 | 1001/2003 |
| 会话标题 | ≤50 | 1001 |
| 消息内容 | 1-2000 字符，非空 | 1001 |
| clientMessageId | ≤64 | 1001 |
| 温度 | 0-1 | 1001 |
| 上下文长度 | 4096/8192/16384 | 1001 |
| 反馈类型 | 白名单 | 1001 |
| 反馈内容 | ≤500 | 1001 |
| 法律正文 | 标题 ≤100、正文 ≤20000 | 1001 |
| 上传文件 | ≤5MB、内容类型+扩展名白名单（png/jpg/jpeg/webp/svg/gif） | 1001 |

注入防护：

- SQL：全部使用参数化 JDBC（JdbcTemplate 占位符）与 MyBatis 参数绑定，禁止字符串拼接 SQL。
- 注入字符串验证：`' OR 1=1 --` 按字面量处理且不扩大结果集（单测 + 冒烟覆盖）。
- XSS：前端渲染使用 Vue 文本插值（自动转义）；搜索高亮文本做安全剥离（去标签）。
- 路径穿越：文件存储使用服务端 UUID objectKey，bucket 限制为单一安全路径段并进行根目录校验（单测覆盖）。

### 4.2 输出安全

- 统一响应包 `{code, message, data, requestId}`；不返回堆栈、SQL、内部地址。
- 公开接口不返回内部字段（如法律正文不返回 status/updatedBy；模型信息不下发密钥/地址）。
- 网关统一错误包：5xx/异常 → 503 + 5002 + requestId；无路由 → 404 + 2003。
- AI 内容安全：剧透模式（SAFE 默认不剧透）、拒答关键词预检、输出二次校验（SafetyRules，单测覆盖）。
- RAG 引用仅来自已发布作品，推荐卡片严格回源校验（存在且已发布才保留）。

## 5. 数据保护

### 5.1 传输安全

- 开发环境：HTTP（本地）；生产：HTTPS（TLS 终止于网关/反代，GAP-014 待域名）。
- CORS：网关 globalcors 仅允许 localhost 来源（dev）；生产收敛到正式域名白名单。
- 公开静态资源跨源：`/covers/**` 无 Origin 时返回 `Access-Control-Allow-Origin: *`；文件接口需要 `X-Device-Id`，不属于网关公开白名单。

### 5.2 存储安全

- 数据库：PG 连接凭据环境变量注入（`DB_URL/DB_USERNAME/DB_PASSWORD`），禁止写入代码/仓库。
- 敏感字段：AI 消息正文、反馈内容属于用户数据，只按 owner_key 授权访问；日志禁止记录完整正文。
- 文件：SHA-256 摘要入库；scan_status 占位（病毒扫描归 P1）。
- 备份：`backup-local.ps1` pg_dump 自定义格式，保留最近 N 份；备份文件含敏感数据，权限收敛。

### 5.3 日志与审计

- 日志禁止记录：密码、token、API 密钥、完整问题正文、模型密钥（technical-design 8.8）。
- 请求 ID（X-Request-Id）贯穿 前端 → 网关 → 业务服务 → Feign 回源。
- 管理端操作走 RuoYi 操作日志；业务端受控写入记录调用方（X-Caller-Name）。
- 审计关联：按 requestId 聚合请求与审计日志。
- 操作日志脱敏已落地（2026-08-20）：RuoYi `LogAspect` 记录前剔除 password/token/secret 等凭证字段；管理端审计页展示层对请求参数/返回结果再兜底掩码，防止历史脏数据泄露。

## 6. 密钥与配置管理

| 类别 | 规则 |
| --- | --- |
| 环境变量 | 所有密钥/口令经环境变量注入（见 environment-config），`.env*` 不入库（.gitignore） |
| 密钥扫描 | CI 使用 Gitleaks（含提交历史），发现即阻断（quality-gates / ci-cd） |
| 禁止事项 | 禁止提交真实密钥、供应商 Key、生产数据、数据库快照 |
| 轮换 | 服务间凭证与数据库口令预留轮换机制；生产接入后登记 release-management |
| 前端密钥 | 客户端不保存模型凭证/内部运营配置（产品边界），模型配置页只读展示服务端状态 |

## 7. 安全测试映射

安全测试证据分布：

| 测试 | 覆盖 | 位置 |
| --- | --- | --- |
| 单元测试：注入/越权/脱敏/输入边界 | core 12、anime 安全 3、favorite 8、ai-chat 10 等 | `mvn test`（各模块 surefire） |
| 冒烟：凭证/越权/注入/超长/额度/403 | 77 项 | smoke-local.ps1 |
| 接口体检：错误码/越权/白名单 | 60 项 | interface-check.ps1 |
| 按钮体检：权限按钮显隐/守卫 | 419 项（动态） | e2e-buttons.mjs |
| 故障注入：网关统一错误包/自愈 | 21 项 | fault-injection.ps1 |

## 8. 安全事件响应

1. **发现**：监控告警（见 monitoring-design）、密钥扫描、用户反馈（安全类反馈优先）。
2. **定位**：按 requestId 聚合日志；故障手册定位（ops-runbook）。
3. **处置**：
   - 疑似密钥泄露：立即轮换对应密钥并撤销；
   - 越权/数据泄露：封禁相关 owner_key，复核受影响数据，登记 gap-register；
   - AI 违规输出：更新 SafetyRules 规则与评测集，重新回归；
   - 服务异常：按 ops-runbook 恢复。
4. **复盘**：登记 decision-log / document-review，沉淀为测试与门禁。
5. **上报**：涉及用户数据的重大事件按合规要求处理（GAP-013 法律文案确认后落定）。

## 9. 安全待办（外部/后续）

- CAS 完整接入后的 ticket 防重放、refresh 复用、SLO 测试（GAP-015）。
- 生产 TLS/域名收敛 CORS（GAP-014）。
- 服务间令牌轮换、速率限制（Sentinel）正式启用。
- 文件病毒扫描（scan_status 正式化）、备份加密与恢复演练。
- AI 供应链/模型供应商安全评审（GAP-006）。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v1.0 | 建立安全设计基线：威胁模型、访问控制、输入输出、数据、密钥、审计、安全测试映射 | 企业级文档完善 |
