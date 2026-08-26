package com.sanye.anime.sanye_search.model;

import java.util.List;

/**
 * 搜索结果视图：title/summary 可含高亮片段。
 */
public record SearchHitView(long id, String title, String titleHighlight, String originalTitle, String type,
                            int year, double score, String status, String coverUrl, List<String> tags,
                            String updateText, String summaryHighlight) {
}
