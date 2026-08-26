package com.sanye.anime.sanye_search.model;

import com.sanye.anime.sanye_search.client.AnimeBrief;

import java.util.List;

/**
 * ES 搜索文档（sanye_anime 索引），作品主数据以 PG/anime 服务为准，索引可重建。
 */
public record SearchDoc(long id, String title, String originalTitle, String type, int year, double score,
                        String status, String coverUrl, List<String> tags, String updateText, String summary) {

    /** 将动画服务摘要转换为可写入 ES 的搜索文档。 */
    public static SearchDoc from(AnimeBrief brief) {
        return new SearchDoc(brief.id(), brief.title(), brief.originalTitle(), brief.type(), brief.year(),
                brief.score(), brief.status(), brief.coverUrl(), brief.tags(), brief.updateText(), "");
    }
}
