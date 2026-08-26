package com.sanye.anime.sanye_favorite.client;

import java.util.List;

/**
 * 动漫服务作品简要信息（跨服务调用 DTO）。
 */
public record AnimeBrief(long id, String title, String originalTitle, String type, int year, double score,
                         String status, String coverUrl, List<String> tags, String updateText) {
}
