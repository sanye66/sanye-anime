package com.sanye.anime.sanye_search.model;

/** 外部授权搜索候选，点击后由客户端触发受控导入。 */
public record ExternalSearchHitView(String title, String sourceUrl, String coverUrl, String summary, String type,
                                    java.util.List<String> alternativeSourceUrls) {
    public ExternalSearchHitView(String title, String sourceUrl, String coverUrl, String summary, String type) {
        this(title, sourceUrl, coverUrl, summary, type, java.util.List.of());
    }
}
