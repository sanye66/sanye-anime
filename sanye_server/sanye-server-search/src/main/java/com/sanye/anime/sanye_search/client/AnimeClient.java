package com.sanye.anime.sanye_search.client;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 动漫服务跨服务客户端（T-D-03）：分页拉取作品主数据用于索引重建。
 */
@FeignClient(name = "sanye-server-anime",
        url = "${SANYE_ANIME_SERVICE_URL:http://localhost:8082}",
        path = "/api/v1",
        contextId = "searchAnimeClient")
public interface AnimeClient {

    @GetMapping("/anime")
    ApiResponse<PageResult<AnimeBrief>> list(@RequestParam("page") int page, @RequestParam("size") int size);

    /** ES 零命中或不可用时按原条件回源公开目录，覆盖尚未异步入索引的新导入作品。 */
    @GetMapping("/anime")
    ApiResponse<PageResult<AnimeBrief>> search(
            @RequestParam("keyword") String keyword,
            @RequestParam(value = "type", required = false) String type,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "year", required = false) Integer year,
            @RequestParam(value = "yearBefore", required = false) Integer yearBefore,
            @RequestParam("page") int page,
            @RequestParam("size") int size);
}
