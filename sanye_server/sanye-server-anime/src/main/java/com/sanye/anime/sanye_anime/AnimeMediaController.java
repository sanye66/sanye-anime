package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.media.MediaImportService;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 公开剧集媒体元数据接口，只有已发布作品可以读取播放列表。 */
@RestController
public class AnimeMediaController {

    private final MediaImportService mediaImportService;
    private final HttpServletRequest request;

    /** 注入媒体服务和请求上下文，统一返回链路编号。 */
    public AnimeMediaController(MediaImportService mediaImportService, HttpServletRequest request) {
        this.mediaImportService = mediaImportService;
        this.request = request;
    }

    /** 返回已发布作品的剧集媒体元数据，不代理第三方播放器内容。 */
    @GetMapping("/api/v1/anime/{animeId}/episodes")
    public ApiResponse<List<AnimeEpisode>> episodes(@PathVariable long animeId) {
        return ApiResponse.ok(mediaImportService.listPublicEpisodes(animeId), requestId());
    }

    /** 读取请求链路编号，未经过过滤器时返回空串。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
