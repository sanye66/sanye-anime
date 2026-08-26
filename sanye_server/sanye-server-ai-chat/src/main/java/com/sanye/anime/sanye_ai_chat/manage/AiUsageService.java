package com.sanye.anime.sanye_ai_chat.manage;

import dev.langchain4j.model.output.TokenUsage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * AI 用量记录与成本聚合。供应商返回 token 用量时优先使用真实值，未返回时使用可追溯的文本估算。
 */
@Service
public class AiUsageService {

    private static final Logger log = LoggerFactory.getLogger(AiUsageService.class);

    private final JdbcTemplate jdbc;
    private final String schema;
    private final String defaultModel;
    private final double inputCentsPerThousand;
    private final double outputCentsPerThousand;

    /** 注入用量数据库、模型默认值和成本参数。 */
    public AiUsageService(
            JdbcTemplate jdbc,
            @Value("${sanye.ai.conversation-schema:sanye_ai_chat}") String schema,
            @Value("${sanye.ai.model:gpt-4o-mini}") String defaultModel,
            @Value("${sanye.ai.cost.input-cents-per-1k:0.12}") double inputCentsPerThousand,
            @Value("${sanye.ai.cost.output-cents-per-1k:0.36}") double outputCentsPerThousand) {
        this.jdbc = jdbc;
        this.schema = schema;
        this.defaultModel = defaultModel;
        this.inputCentsPerThousand = inputCentsPerThousand;
        this.outputCentsPerThousand = outputCentsPerThousand;
    }

    /** 记录一次模型调用的 token、耗时和估算费用，缺失用量时按文本估算。 */
    public void record(long messageId, String model, String prompt, String completion, int latencyMs,
                       TokenUsage usage) {
        try {
            int promptTokens = usage == null || usage.inputTokenCount() == null
                    ? estimateTokens(prompt) : usage.inputTokenCount();
            int completionTokens = usage == null || usage.outputTokenCount() == null
                    ? estimateTokens(completion) : usage.outputTokenCount();
            int costCents = (int) Math.max(0, Math.round(
                    promptTokens * inputCentsPerThousand / 1_000D
                            + completionTokens * outputCentsPerThousand / 1_000D));
            jdbc.update("delete from " + usageTable() + " where message_id = ?", messageId);
            jdbc.update("insert into " + usageTable()
                            + " (message_id, model, prompt_tokens, completion_tokens, latency_ms, cost_cents) "
                            + "values (?, ?, ?, ?, ?, ?)",
                    messageId,
                    model == null || model.isBlank() ? defaultModel : model,
                    promptTokens,
                    completionTokens,
                    Math.max(0, latencyMs),
                    costCents);
        } catch (RuntimeException ex) {
            // 用量记录不能影响已经完成的回答，但必须留下可定位日志。
            log.warn("AI 用量记录失败 messageId={} error={}", messageId, ex.getMessage());
        }
    }

    /** 汇总累计成本、今日成本及最近七天趋势供管理端展示。 */
    public AiCostSummary summary() {
        long totalPrompt = number("select coalesce(sum(prompt_tokens), 0) from " + usageTable());
        long totalCompletion = number("select coalesce(sum(completion_tokens), 0) from " + usageTable());
        long totalCost = number("select coalesce(sum(cost_cents), 0) from " + usageTable());
        long todayCost = number("select coalesce(sum(cost_cents), 0) from " + usageTable()
                + " where created_at >= date_trunc('day', now())");
        List<AiUsageDayView> trend = jdbc.query(
                "select to_char(days.day, 'YYYY-MM-DD') as day, "
                        + "coalesce(c.conversations, 0) as conversations, "
                        + "coalesce(m.messages, 0) as messages, "
                        + "coalesce(u.cost_cents, 0) as cost_cents "
                        + "from generate_series(current_date - interval '6 days', current_date, interval '1 day') days(day) "
                        + "left join (select created_at::date as usage_day, count(*) as conversations from " + convTable()
                        + " group by created_at::date) c on c.usage_day = days.day::date "
                        + "left join (select created_at::date as usage_day, count(*) as messages from " + msgTable()
                        + " group by created_at::date) m on m.usage_day = days.day::date "
                        + "left join (select created_at::date as usage_day, sum(cost_cents) as cost_cents from " + usageTable()
                        + " group by created_at::date) u on u.usage_day = days.day::date "
                        + "order by days.day",
                (rs, rowNum) -> new AiUsageDayView(rs.getString("day"), rs.getLong("conversations"),
                        rs.getLong("messages"), rs.getLong("cost_cents")));
        return new AiCostSummary(totalPrompt, totalCompletion, totalCost, todayCost, trend);
    }

    /** 执行单值统计查询，空结果统一按零处理。 */
    private long number(String sql) {
        Long value = jdbc.queryForObject(sql, Long.class);
        return value == null ? 0 : value;
    }

    /** 在模型未返回 token 用量时按字符数进行保守估算。 */
    private int estimateTokens(String text) {
        if (text == null || text.isBlank()) return 1;
        return Math.max(1, (int) Math.ceil(text.codePointCount(0, text.length()) / 4D));
    }

    /** 返回会话表名。 */
    private String convTable() {
        return schema + ".sanye_conversation";
    }

    /** 返回消息表名。 */
    private String msgTable() {
        return schema + ".sanye_conversation_message";
    }

    /** 返回 AI 用量表名。 */
    private String usageTable() {
        return schema + ".sanye_ai_usage";
    }

    public record AiCostSummary(long totalPromptTokens, long totalCompletionTokens, long totalCostCents,
                                long todayCostCents, List<AiUsageDayView> trend) {
    }

    public record AiUsageDayView(String day, long conversations, long messages, long costCents) {
    }
}
