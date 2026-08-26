package com.sanye.anime.sanye_ai_chat.manage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * AI 对话统计（管理端仪表盘）：基于会话/消息表聚合总数与今日增量。
 */
@Service
public class AiStatsService {

    private final JdbcTemplate jdbc;
    private final String schema;
    private final AiUsageService usageService;

    /** 注入统计查询、schema 和用量聚合服务。 */
    public AiStatsService(JdbcTemplate jdbc,
                          @Value("${sanye.ai.conversation-schema:sanye_ai_chat}") String schema,
                          AiUsageService usageService) {
        this.jdbc = jdbc;
        this.schema = schema;
        this.usageService = usageService;
    }

    /** 汇总会话、消息和用量统计，供管理仪表盘展示。 */
    public AiStatsView stats() {
        long totalConversations = count("select count(*) from " + conv());
        long totalMessages = count("select count(*) from " + msg());
        long todayConversations = count("select count(*) from " + conv()
                + " where created_at >= date_trunc('day', now())");
        long todayMessages = count("select count(*) from " + msg()
                + " where created_at >= date_trunc('day', now())");
        AiUsageService.AiCostSummary usage = usageService.summary();
        return new AiStatsView(totalConversations, totalMessages, todayConversations, todayMessages,
                usage.totalPromptTokens(), usage.totalCompletionTokens(), usage.totalCostCents(),
                usage.todayCostCents(), usage.trend());
    }

    /** 执行单值统计 SQL，空结果按零处理。 */
    private long count(String sql) {
        Long value = jdbc.queryForObject(sql, Long.class);
        return value == null ? 0 : value;
    }

    /** 返回会话统计表名。 */
    private String conv() {
        return schema + ".sanye_conversation";
    }

    /** 返回消息统计表名。 */
    private String msg() {
        return schema + ".sanye_conversation_message";
    }
}
