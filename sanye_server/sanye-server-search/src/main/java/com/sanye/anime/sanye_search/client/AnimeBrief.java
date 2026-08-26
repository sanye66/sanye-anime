package com.sanye.anime.sanye_search.client;

import java.util.List;

/**
 * 动漫服务作品信息（索引同步数据源 DTO）。
 */
public record AnimeBrief(long id, String title, String originalTitle, String type, int year, double score,
                         String status, String coverUrl, List<String> tags, String updateText) {
}
