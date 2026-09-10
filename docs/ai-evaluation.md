# sanye_anime AI 评测集与回归

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.2 |
| 文档状态 | 基线（T-G-04 完成：评测集 100 条 + 回归框架） |
| 关联文档 | [测试策略](./testing-strategy.md)、[安全设计](./security-design.md)、[开发任务](./development-tasks.md)（T-G-04） |
| 更新时间 | 2026-09-10 |

## 当前核对（2026-09-10）

本文保留原执行日期、环境和结果，是历史专项证据；2026-09-10 未重新执行本文完整测试范围，也未确认旧外部服务状态。当前复验项目、任务状态和正常使用判断见[当前审计](./current-status-audit.md)，不能把本文历史通过数直接作为当前发布门禁。

更新记录：2026-09-10，v1.2，按当前代码与进度校正本文事实或证据范围；依据上述源码、任务与审计引用。

## 1. 目标与阈值

| 维度 | 阈值 | 当前（dev-mock） | 说明 |
| --- | ---: | ---: | --- |
| 剧透防护（SAFE） | ≥95% | 100%（36/36） | 不泄露结局/凶手/真相/反转/死亡等关键情节 |
| 安全拒答 | 100% | 100%（26/26） | 违法/危险类问题生成前直接拒答 |
| 推荐可打开 | ≥95% | 100%（22/22） | 回答中的推荐作品真实存在（当前 6 部正式目录：127/128/133/135/136/137） |
| 边界与通用 | ≥95% | 100%（16/16） | 不误拒、ALLOW 放行、空/长/注入输入不崩溃 |
| 引用识别 | ≥90% | 100%（4/4） | RAG 检索注入与引用格式识别（ES 联调后补真实命中） |

## 2. 评测集结构

数据：[evaluation-set.json](../sanye_server/sanye-server-ai-chat/src/test/resources/ai-evaluation/evaluation-set.json)

- 100 条，按 `category` 分类：spoiler（36）/ refusal（26）/ recommendation（22）/ edge（16）。
- 每条含 `id`、`input`、可选 `spoilerMode`、可选 `citation`、`expect.kind`。
- edge 子类：noRefusal、allowPass、emptyHandled、injectionLiteral、longHandled、citation。

## 3. 回归执行

执行器：[AiEvaluationSuiteTest](../sanye_server/sanye-server-ai-chat/src/test/java/com/sanye/anime/sanye_ai_chat/ai/AiEvaluationSuiteTest.java)

- 纯 Java 组合 SafetyRules + DevMockStreamingChatModel，不依赖 Spring 容器。
- 逐条执行并统计各分类通过率，低于阈值即失败（断言输出失败项 ID）。
- 运行：`mvn -f sanye_server/pom.xml -pl sanye-server-ai-chat test -Dtest=AiEvaluationSuiteTest`（约 40s）。
- CI：随 `mvn test` 全量执行，作为 AI 质量门禁。

## 4. 评测集驱动的修复（2026-08-19）

首轮评测发现并修复 3 类问题：

| 问题 | 根因 | 修复 |
| --- | --- | --- |
| 剧透误判 | 简单关键词“结局是”误命中“结局是否” | 评测泄露检测改用与 SafetyRules 一致的正则（结局是(?!否)） |
| 拒答漏网 | REFUSAL_KEYWORDS 未覆盖“怎么杀人/炸弹怎么做/自制炸弹”变体 | [SafetyRules](../sanye_server/sanye-server-ai-chat/src/main/java/com/sanye/anime/sanye_ai_chat/ai/SafetyRules.java) 扩充 7 个变体关键词 |
| 推荐识别不足 | dev-mock 仅识别“推荐/相似/有什么好看的” | [DevMockStreamingChatModel](../sanye_server/sanye-server-ai-chat/src/main/java/com/sanye/anime/sanye_ai_chat/ai/DevMockStreamingChatModel.java) 增加“帮我找/类似/有没有/适合”意图词 |

## 5. 后续扩展

- ES 就绪后补充真实 RAG 引用命中率评测（当前 4 条覆盖注入与引用格式识别）。
- 真实模型接入后复用同一评测集评估回答质量（GAP-006 供应商选定后）。
- 评测集按需扩充边界与多轮对话记忆场景（会话记忆评测归 T-E-02 扩展）。

## 更新记录

| 日期 | 版本 | 变更 | 依据 |
| --- | --- | --- | --- |
| 2026-08-19 | v1.0 | 建立 AI 评测集（100 条）与回归框架，修复拒答/剧透/推荐识别问题 | T-G-04 |
| 2026-08-24 | v1.1 | 将推荐可打开指标的当前作品目录说明同步为 6 部正式作品；评测夹具仍保持隔离，不进入默认运行片库 | 正式片库清理、AI 推荐回源校验 |
