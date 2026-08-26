package com.sanye.anime.sanye_anime;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import com.sanye.anime.sanye_anime.model.AdminAnimeImportResult;
import com.sanye.anime.sanye_anime.model.AnimeUrlPreviewResult;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 动漫内容接口（T-D-02 列表筛选 / T-D-04 详情聚合），路由与前端 anime.ts 对齐。
 */
@RestController
public class AnimeController {

    private final HttpServletRequest request;
    private final HomeAggregationService homeAggregationService;
    private final AnimeCatalogService catalogService;
    private final AnimeUrlImportService animeUrlImportService;

    /** 注入请求上下文、首页聚合和目录服务，统一生成公开接口响应。 */
    public AnimeController(HttpServletRequest request, HomeAggregationService homeAggregationService,
                           AnimeCatalogService catalogService, AnimeUrlImportService animeUrlImportService) {
        this.request = request;
        this.homeAggregationService = homeAggregationService;
        this.catalogService = catalogService;
        this.animeUrlImportService = animeUrlImportService;
    }

    /** 获取首页聚合数据，优先使用按标签隔离的缓存结果。 */
    @GetMapping("/api/v1/home")
    public ApiResponse<AnimeMemoryStore.HomeResponse> home(@RequestParam(defaultValue = "FEATURED") String tab) {
        return ApiResponse.ok(homeAggregationService.home(tab, () -> catalogService.home(tab)), requestId());
    }

    /** 按筛选条件查询已发布作品并返回分页结果。 */
    @GetMapping("/api/v1/anime")
    public ApiResponse<PageResult<AnimeMemoryStore.AnimeCard>> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer yearBefore,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(catalogService.list(keyword, type, status, year, yearBefore, page, size), requestId());
    }

    /** 客户端降级导入：管理端审核链路不可用时，允许白名单 URL 直接导入并发布。 */
    @PostMapping("/api/v1/anime/import-url")
    public ApiResponse<AdminAnimeImportResult> fallbackImport(@RequestBody Map<String, String> body) {
        return ApiResponse.ok(animeUrlImportService.importFrom(body.get("sourceUrl"), true), requestId());
    }

    /** 客户端直接观看预览：只读取白名单来源，不创建作品或写入剧集。 */
    @GetMapping("/api/v1/anime/external-preview")
    public ApiResponse<AnimeUrlPreviewResult> externalPreview(@RequestParam String sourceUrl) {
        return ApiResponse.ok(animeUrlImportService.previewFrom(sourceUrl), requestId());
    }

    /** 返回单部已发布作品的详情聚合。 */
    @GetMapping("/api/v1/anime/{id}")
    public ApiResponse<AnimeMemoryStore.AnimeDetail> detail(@PathVariable long id) {
        return ApiResponse.ok(catalogService.detail(id), requestId());
    }

    /** 返回官网首屏使用的精选作品，接口保持匿名公开。 */
    @GetMapping("/api/v1/public/home")
    public ApiResponse<AnimeMemoryStore.PublicHomeResponse> publicHome() {
        List<AnimeMemoryStore.AnimeCard> picks = catalogService.publicHomePicks();
        return ApiResponse.ok(new AnimeMemoryStore.PublicHomeResponse(picks), requestId());
    }

    /** 从请求属性读取链路编号，未经过滤器时返回空串。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
