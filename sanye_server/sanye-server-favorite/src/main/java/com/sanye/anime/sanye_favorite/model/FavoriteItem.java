package com.sanye.anime.sanye_favorite.model;

import com.sanye.anime.sanye_favorite.client.AnimeBrief;

/**
 * 收藏条目（含回源的作品信息与收藏时间）。
 */
public record FavoriteItem(AnimeBrief anime, String createdAt) {
}
