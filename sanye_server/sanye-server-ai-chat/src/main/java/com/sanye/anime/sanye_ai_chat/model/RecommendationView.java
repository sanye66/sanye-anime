package com.sanye.anime.sanye_ai_chat.model;

/**
 * 推荐卡片，SSE recommendation 事件与消息视图共用。
 */
public record RecommendationView(long animeId, String title, String reason) {
}
