package com.sanye.anime.sanye_ai_chat.client;

import com.sanye.anime.sanye_core.web.ApiResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * 动漫服务跨服务客户端（T-C-05）：推荐卡片 animeId 回源校验。
 * 本地联调默认直连 http://localhost:8082，Nacos 模式下通过 SANYE_ANIME_SERVICE_URL
 * 指向服务地址或经网关转发。
 */
@FeignClient(name = "sanye-server-anime",
        url = "${SANYE_ANIME_SERVICE_URL:http://localhost:8082}",
        path = "/api/v1",
        contextId = "animeClient")
public interface AnimeClient {

    @GetMapping("/anime/{id}")
    ApiResponse<AnimeBrief> getAnime(@PathVariable("id") long id);
}
