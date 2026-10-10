package com.sanye.anime.sanye_favorite.model;

/** 当前用户的单集观看进度。 */
public record ContinueWatchingItem(
        long animeId,
        long episodeId,
        String episodeTitle,
        long positionSeconds,
        long durationSeconds,
        boolean completed,
        String updatedAt) {
}
