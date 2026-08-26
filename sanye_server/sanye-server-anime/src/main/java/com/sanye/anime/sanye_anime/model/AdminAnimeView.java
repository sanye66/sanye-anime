package com.sanye.anime.sanye_anime.model;

/**
 * 管理端作品视图（T-F-03）：管理平台经 RuoYi 代理后展示。
 */
public record AdminAnimeView(long id, String title, String originalTitle, String type, String source,
                             String status, String updated) {
}
