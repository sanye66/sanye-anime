package com.sanye.anime.sanye_ai_chat.manage;

/**
 * AI 对话统计视图（管理端仪表盘）。
 */
public record AiStatsView(long totalConversations, long totalMessages, long todayConversations, long todayMessages,
                          long totalPromptTokens, long totalCompletionTokens, long totalCostCents,
                          long todayCostCents, java.util.List<AiUsageService.AiUsageDayView> usageTrend) {
}
