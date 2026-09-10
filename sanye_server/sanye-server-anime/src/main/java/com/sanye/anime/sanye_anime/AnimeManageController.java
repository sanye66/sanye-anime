package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_anime.model.AdminAnimeView;
import com.sanye.anime.sanye_anime.model.AdminAnimeDetailView;
import com.sanye.anime.sanye_anime.model.AdminAnimeImportResult;
import com.sanye.anime.sanye_anime.media.MediaImportService;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_core.security.InternalCallerToken;
import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 内容管理受控接口（T-F-03）：仅供管理后端（RuoYi）经服务间调用访问，
 * 要求 X-Caller-Name 与配置的调用方一致（dev 凭证基线，生产换服务间凭证）。
 * 网关不暴露 /api/v1/manage/**，避免公网直接写入。
 */
@RestController
@RequestMapping("/api/v1/manage/anime")
public class AnimeManageController {

    private final AnimeManageService animeManageService;
    private final HttpServletRequest request;
    private final String allowedCaller;
    private final String internalToken;
    private final MediaImportService mediaImportService;
    private final AnimeUrlImportService animeUrlImportService;

    /** 注入管理服务和请求对象，管理接口由调用方凭证统一保护。 */
    public AnimeManageController(AnimeManageService animeManageService, HttpServletRequest request,
                                 @Value("${sanye.manage.allowed-caller:sanye-admin-server}") String allowedCaller,
                                 @Value("${sanye.manage.internal-token:}") String internalToken,
                                 MediaImportService mediaImportService,
                                 AnimeUrlImportService animeUrlImportService) {
        this.animeManageService = animeManageService;
        this.request = request;
        this.allowedCaller = allowedCaller;
        this.internalToken = internalToken;
        this.mediaImportService = mediaImportService;
        this.animeUrlImportService = animeUrlImportService;
    }

    /** 查询管理端作品列表，先完成服务间调用方校验。 */
    @GetMapping
    public ApiResponse<List<AdminAnimeView>> list() {
        checkCaller();
        return ApiResponse.ok(animeManageService.listAll(), requestId());
    }

    /** 查询单部作品的管理详情。 */
    @GetMapping("/{id}")
    public ApiResponse<AdminAnimeDetailView> detail(@PathVariable long id) {
        checkCaller();
        return ApiResponse.ok(animeManageService.get(id), requestId());
    }

    /** 创建草稿作品，并将请求字段交给业务服务统一校验。 */
    @PostMapping
    public ApiResponse<AdminAnimeDetailView> create(@RequestBody Map<String, String> body) {
        checkCaller();
        return ApiResponse.ok(animeManageService.create(
                body.get("title"), body.get("originalTitle"), body.get("type"),
                body.get("year") == null || body.get("year").isBlank() ? null : Integer.valueOf(body.get("year")),
                body.get("summary"), body.get("tags"), body.get("updateText"),
                body.get("sourceUrl"), body.get("coverUrl")), requestId());
    }

    /** 从授权 URL 一键导入作品简介、封面和视频资源。 */
    @PostMapping("/import-url")
    public ApiResponse<AdminAnimeImportResult> importUrl(@RequestBody Map<String, Object> body) {
        checkCaller();
        String sourceUrl = body.get("sourceUrl") == null ? "" : body.get("sourceUrl").toString();
        boolean publish = Boolean.TRUE.equals(body.get("publish"));
        return ApiResponse.ok(animeUrlImportService.importFrom(sourceUrl, publish), requestId());
    }

    /** 更新作品内容；空字段由服务层按保持原值语义处理。 */
    @PatchMapping("/{id}")
    public ApiResponse<AdminAnimeDetailView> update(@PathVariable long id, @RequestBody Map<String, String> body) {
        checkCaller();
        return ApiResponse.ok(animeManageService.update(
                id, body.get("title"), body.get("originalTitle"), body.get("type"),
                body.get("year") == null || body.get("year").isBlank() ? null : Integer.valueOf(body.get("year")),
                body.get("summary"), body.get("tags"), body.get("updateText"),
                body.get("sourceUrl"), body.get("coverUrl")), requestId());
    }

    /** 修改作品管理状态，发布状态由服务层决定公开可见性。 */
    @PatchMapping("/{id}/status")
    public ApiResponse<AdminAnimeView> updateStatus(@PathVariable long id, @RequestBody Map<String, String> body) {
        checkCaller();
        return ApiResponse.ok(animeManageService.updateStatus(id, body.get("status")), requestId());
    }

    /** 导入授权来源页面的剧集元数据；只写入公开播放器地址，不下载媒体文件。 */
    @PostMapping("/{id}/episodes/import")
    public ApiResponse<List<AnimeMemoryStore.AnimeEpisode>> importEpisodes(@PathVariable long id,
                                                                            @RequestBody Map<String, String> body) {
        checkCaller();
        return ApiResponse.ok(mediaImportService.importFrom(id, body.get("sourceUrl")), requestId());
    }

    /** 校验管理服务调用方名称和内部令牌，阻断未授权写入。 */
    @PostMapping("/{id}/events/compensate")
    public ApiResponse<String> compensate(@PathVariable long id) {
        checkCaller();
        animeManageService.compensate(id);
        return ApiResponse.ok("queued", requestId());
    }

    private void checkCaller() {
        String caller = request.getHeader("X-Caller-Name");
        if (caller == null || !caller.equals(allowedCaller)
                || !InternalCallerToken.matches(internalToken, request.getHeader("X-Internal-Token"))) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "调用方校验失败");
        }
    }

    /** 读取当前请求编号，统一写入管理接口响应。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
