package com.sanye.anime.sanye_ai_chat.client;

/**
 * 动漫服务作品简要信息（跨服务调用 DTO，字段与 anime 详情接口对齐）。
 */
public record AnimeBrief(long id, String title, String status) {
}
