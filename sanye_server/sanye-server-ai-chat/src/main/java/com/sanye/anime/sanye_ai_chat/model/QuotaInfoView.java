package com.sanye.anime.sanye_ai_chat.model;

/**
 * 额度信息，字段与前端 types.ts 的 QuotaInfo 对齐。
 */
public record QuotaInfoView(int used, int limit, String resetAt, boolean anonymous) {
}
