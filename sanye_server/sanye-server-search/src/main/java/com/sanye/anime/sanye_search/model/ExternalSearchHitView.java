package com.sanye.anime.sanye_search.model;

/** 外部授权搜索候选，点击后由客户端触发受控导入。 */
public record ExternalSearchHitView(String title, String sourceUrl, String coverUrl, String summary) {
}
