package com.sanye.anime.sanye_favorite.model;

import com.sanye.anime.sanye_favorite.client.AnimeBrief;

/**
 * 历史记录条目（含回源的作品信息与最近浏览时间）。
 */
public record HistoryItem(AnimeBrief anime, String lastViewAt) {
}
