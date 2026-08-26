package com.sanye.anime.sanye_ai_chat.model;

import java.util.List;

/**
 * 消息视图，字段与前端 types.ts 的 Message 对齐。
 */
public record MessageView(
        long id,
        long conversationId,
        String role,
        String content,
        String status,
        int generateTry,
        List<RecommendationView> recommendations,
        String createdAt) {
}
