package com.sanye.anime.sanye_favorite.model;

import com.fasterxml.jackson.annotation.JsonAlias;

/** 保存单集观看进度的请求体。 */
public record ContinueWatchingRequest(
        Long animeId,
        Long episodeId,
        @JsonAlias("title") String episodeTitle,
        Long positionSeconds,
        Long durationSeconds,
        Boolean completed) {
}
