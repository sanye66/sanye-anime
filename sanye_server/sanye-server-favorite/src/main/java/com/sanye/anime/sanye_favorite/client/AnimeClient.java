package com.sanye.anime.sanye_favorite.client;

import com.sanye.anime.sanye_core.web.ApiResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * 动漫服务跨服务客户端（T-F-02）：收藏/历史列表回源作品信息。
 */
@FeignClient(name = "sanye-server-anime",
        url = "${SANYE_ANIME_SERVICE_URL:http://localhost:8082}",
        path = "/api/v1",
        contextId = "favoriteAnimeClient")
public interface AnimeClient {

    @GetMapping("/anime/{id}")
    ApiResponse<AnimeBrief> getAnime(@PathVariable("id") long id);
}
