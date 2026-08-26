package com.sanye.anime.sanye_ai_chat.model;

/**
 * 会话视图，字段与 docs/api-contract.md 及前端 types.ts 的 Conversation 对齐。
 */
public record ConversationView(
        long id,
        String title,
        String status,
        String spoilerMode,
        Long contextAnimeId,
        String lastMessage,
        String createdAt,
        String updatedAt) {
}
