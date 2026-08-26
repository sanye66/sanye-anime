package com.sanye.anime.sanye_anime.model;

import java.util.List;

/**
 * 管理端作品详情视图（内容管理深化）：管理平台编辑/查看时展示。
 */
public record AdminAnimeDetailView(long id, String title, String originalTitle, String type, int year,
                                   String summary, List<String> tags, String updateText, String coverUrl,
                                   String sourceUrl, String source, String status, String updated) {
}
