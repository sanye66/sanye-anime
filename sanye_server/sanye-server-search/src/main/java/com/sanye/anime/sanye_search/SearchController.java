package com.sanye.anime.sanye_search;

import com.sanye.anime.sanye_core.web.ApiResponse;
import com.sanye.anime.sanye_core.web.PageResult;
import com.sanye.anime.sanye_core.web.RequestIdFilter;
import com.sanye.anime.sanye_core.exception.BusinessException;
import com.sanye.anime.sanye_core.exception.ErrorCode;
import com.sanye.anime.sanye_search.model.SearchHitView;
import com.sanye.anime.sanye_search.model.ExternalSearchHitView;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 搜索接口（T-D-03），与前端 search.ts 对齐。
 */
@RestController
@RequestMapping("/api/v1/search")
public class SearchController {

    private final SearchService searchService;
    private final AnimeIndexService animeIndexService;
    private final ExternalSearchService externalSearchService;
    private final HttpServletRequest request;

    /** 注入搜索和索引服务，管理重建接口复用统一请求编号。 */
    public SearchController(SearchService searchService, AnimeIndexService animeIndexService,
                            ExternalSearchService externalSearchService,
                            HttpServletRequest request) {
        this.searchService = searchService;
        this.animeIndexService = animeIndexService;
        this.externalSearchService = externalSearchService;
        this.request = request;
    }

    /** 执行全文搜索并返回带高亮的分页结果。 */
    @GetMapping
    public ApiResponse<PageResult<SearchHitView>> search(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer yearBefore,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(searchService.search(keyword, type, status, year, yearBefore, page, size), requestId());
    }

    /** 查询授权外部搜索页，返回可导入的详情页候选。 */
    @GetMapping("/external")
    public ApiResponse<java.util.List<ExternalSearchHitView>> externalSearch(
            @RequestParam String keyword,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(externalSearchService.search(keyword, size), requestId());
    }

    /** 创建索引并从动画服务同步全部公开作品。 */
    @PostMapping("/reindex")
    public ApiResponse<Map<String, Integer>> reindex() {
        try {
            animeIndexService.ensureIndex();
            int count = animeIndexService.syncAll();
            return ApiResponse.ok(Map.of("indexed", count), requestId());
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.SEARCH_UNAVAILABLE, "搜索索引重建失败：" + ex.getMessage());
        }
    }

    /** 读取统一请求编号。 */
    private String requestId() {
        Object rid = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return rid == null ? "" : rid.toString();
    }
}
